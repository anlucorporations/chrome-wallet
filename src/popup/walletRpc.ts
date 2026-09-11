/**
 * M39 (soporte) — `src/popup/walletRpc.ts`
 * Único punto del popup por el que se habla con el Service Worker.
 *
 * Contrato (documento_tecnico.md §5.1.1, fuente autoritativa):
 *
 *     chrome.runtime.sendMessage({
 *       // canal de mensajería del runtime (D-H2-A: `chrome.runtime.postMessage` NO existe)
 *       type: 'TRUEKEATE_RPC', method, params, origin: 'extension', tabId: null, frameId: null,
 *     })
 *
 * H3 añade las **lecturas de página** que la UI necesita, por el MISMO canal (§4.3:
 * `eth_getBalance` es lectura sin aprobación y `wallet_revokePermissions` admite el camino
 * «desde el popup», donde la confirmación es la propia UI de revocar): `callWalletMethod` acepta
 * cualquier método de la unión cerrada `WalletMethod`, mientras que `callInternal` sigue siendo el
 * atajo restringido a los 15 internos `wallet_*` de `InternalMethod` (§5.1.1). Un método fuera de
 * la unión responde `4200` y no se implementa sin editar el contrato.
 *
 * Reglas que respeta este módulo:
 * - **Cero criptografía y cero `ethers`** (RNF-14): aquí no se deriva, ni se firma, ni se cifra.
 * - Todo error que llega al usuario lleva `code` numérico y el mensaje de la tabla de
 *   `diccionario_datos.md` §4.3, que se transcribe en `popupErrors.ts` (RNF-06).
 * - Ningún secreto viaja por `window.postMessage` (RNF-09): el canal es `chrome.runtime`.
 */

import type { InternalMethod, WalletMethod } from '../shared/types';
import { EXTENSION_ORIGIN } from '../shared/constants';
import { getRuntimeChannel } from './runtimeChannel';
import { isEip1193Error, popupError, popupErrorOf, type PopupError } from './popupErrors';

/** Mensaje `TRUEKEATE_RPC` con cualquier método del catálogo, tal y como lo espera el router. */
export interface WalletRpcMessage {
  type: 'TRUEKEATE_RPC';
  method: WalletMethod;
  params?: unknown[];
  origin: string;
  tabId: null;
  frameId: null;
}

/** Mensaje `TRUEKEATE_RPC` de un método interno `wallet_*` (contrato de §5.1.1). */
export interface InternalRpcMessage extends WalletRpcMessage {
  method: InternalMethod;
}

/** Respuesta admitida del SW: `{ result }`, `{ error }` o el valor directo. */
interface RpcEnvelope {
  result?: unknown;
  error?: unknown;
}

/** Resultado de una invocación: discriminado, nunca lanza. */
export type WalletCallResult<T> = { ok: true; result: T } | { ok: false; error: PopupError };

/**
 * ¿Está disponible el canal de mensajes de la extensión?
 *
 * Delega en `runtimeChannel.ts`, el ÚNICO punto del popup que nombra el API real
 * (`chrome.runtime.sendMessage`). Antes de D-H2-A esta comprobación —y la llamada— construían el
 * identificador con `Reflect.get(chrome.runtime, 'pos' + 'tMessage')`, un nombre que NO existe en
 * MV3 y que dejaba al popup sin poder hablar con el Service Worker.
 */
export const hasRuntimeMessaging = (): boolean => getRuntimeChannel() !== null;

/** Construye el sobre `TRUEKEATE_RPC` de un método del catálogo (lectura, aprobable o interno). */
export const buildWalletMessage = (
  method: WalletMethod,
  params: readonly unknown[] = [],
): WalletRpcMessage => ({
  type: 'TRUEKEATE_RPC',
  method,
  params: [...params],
  origin: EXTENSION_ORIGIN,
  tabId: null,
  frameId: null,
});

/** Construye el sobre `TRUEKEATE_RPC` de un método interno `wallet_*`. */
export const buildInternalMessage = (
  method: InternalMethod,
  params: readonly unknown[] = [],
): InternalRpcMessage => ({
  ...buildWalletMessage(method, params),
  method,
});

/** Extrae el error EIP-1193 de una respuesta, si lo hay. */
const errorFromResponse = (response: unknown): PopupError | null => {
  if (typeof response !== 'object' || response === null) {
    return null;
  }
  const envelope = response as RpcEnvelope;
  if (isEip1193Error(envelope.error)) {
    return popupError(envelope.error);
  }
  return null;
};

/** Extrae el resultado de una respuesta, admitiendo `{ result }` o el valor directo. */
const resultFromResponse = (response: unknown): unknown => {
  if (typeof response === 'object' && response !== null) {
    const envelope = response as RpcEnvelope;
    if ('result' in envelope || 'error' in envelope) {
      return envelope.result;
    }
  }
  return response;
};

/**
 * Invoca un método del catálogo del Service Worker (lectura de página, aprobable o interno).
 *
 * Devuelve un resultado discriminado: nunca lanza. Los fallos esperados —método aún no
 * implementado (`4200`), contexto no permitido, error interno— se traducen al error tipado con
 * su `code` y su acción sugerida.
 */
export const callWalletMethod = async <T>(
  method: WalletMethod,
  params: readonly unknown[] = [],
): Promise<WalletCallResult<T>> => {
  const channel = getRuntimeChannel();
  if (channel === null) {
    return { ok: false, error: transportError('No hay canal con el Service Worker.') };
  }
  try {
    const response: unknown = await channel(buildWalletMessage(method, params));
    const error = errorFromResponse(response);
    if (error !== null) {
      return { ok: false, error };
    }
    return { ok: true, result: resultFromResponse(response) as T };
  } catch (cause) {
    // Fallo de transporte (el SW no está escuchando o se suspendió): se clasifica como
    // «Error interno de la cartera» de la tabla de §4.3, nunca como un `Error` sin `code`.
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: transportError(detail) };
  }
};

/**
 * Invoca un método **interno** `wallet_*` (§5.1.1). Atajo tipado de {@link callWalletMethod} que
 * impide que la UI nombre por error un método de página en una operación de cartera.
 */
export const callInternal = async <T>(
  method: InternalMethod,
  params: readonly unknown[] = [],
): Promise<WalletCallResult<T>> => callWalletMethod<T>(method, params);

/** Error interno `-32603` con el detalle del transporte, sin inventar literales nuevos. */
const transportError = (detail: string): PopupError =>
  popupErrorOf('internalError', {}, { reason: 'transport', detail });
