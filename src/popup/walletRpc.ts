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
 * Solo se invocan métodos **internos** `wallet_*` de la unión cerrada `InternalMethod`: un
 * método que no figure en ella responde `4200` y no se implementa sin editar el contrato.
 *
 * Reglas que respeta este módulo:
 * - **Cero criptografía y cero `ethers`** (RNF-14): aquí no se deriva, ni se firma, ni se cifra.
 * - Todo error que llega al usuario lleva `code` numérico y el mensaje de la tabla de
 *   `diccionario_datos.md` §4.3, que se transcribe en `popupErrors.ts` (RNF-06).
 * - Ningún secreto viaja por `window.postMessage` (RNF-09): el canal es `chrome.runtime`.
 */

import type { InternalMethod } from '../shared/types';
import { EXTENSION_ORIGIN } from '../shared/constants';
import { getRuntimeChannel } from './runtimeChannel';
import { isEip1193Error, popupError, popupErrorOf, type PopupError } from './popupErrors';

/** Mensaje `TRUEKEATE_RPC` tal y como lo espera el router del SW (M3). */
export interface InternalRpcMessage {
  type: 'TRUEKEATE_RPC';
  method: InternalMethod;
  params?: unknown[];
  origin: string;
  tabId: null;
  frameId: null;
}

/** Respuesta admitida del SW: `{ result }`, `{ error }` o el valor directo. */
interface RpcEnvelope {
  result?: unknown;
  error?: unknown;
}

/**
 * ¿Está disponible el canal de mensajes de la extensión?
 *
 * Delega en `runtimeChannel.ts`, el ÚNICO punto del popup que nombra el API real
 * (`chrome.runtime.sendMessage`). Antes de D-H2-A esta comprobación —y la llamada— construían el
 * identificador con `Reflect.get(chrome.runtime, 'pos' + 'tMessage')`, un nombre que NO existe en
 * MV3 y que dejaba al popup sin poder hablar con el Service Worker.
 */
export const hasRuntimeMessaging = (): boolean => getRuntimeChannel() !== null;

/** Construye el sobre `TRUEKEATE_RPC` de un método interno. */
export const buildInternalMessage = (
  method: InternalMethod,
  params: readonly unknown[] = [],
): InternalRpcMessage => ({
  type: 'TRUEKEATE_RPC',
  method,
  params: [...params],
  origin: EXTENSION_ORIGIN,
  tabId: null,
  frameId: null,
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
 * Invoca un método interno del Service Worker.
 *
 * Devuelve un resultado discriminado: nunca lanza. Los fallos esperados —método aún no
 * implementado (`4200`), contexto no permitido, error interno— se traducen al error tipado con
 * su `code` y su acción sugerida.
 */
export const callInternal = async <T>(
  method: InternalMethod,
  params: readonly unknown[] = [],
): Promise<{ ok: true; result: T } | { ok: false; error: PopupError }> => {
  const channel = getRuntimeChannel();
  if (channel === null) {
    return { ok: false, error: transportError('No hay canal con el Service Worker.') };
  }
  try {
    const response: unknown = await channel(buildInternalMessage(method, params));
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

/** Error interno `-32603` con el detalle del transporte, sin inventar literales nuevos. */
const transportError = (detail: string): PopupError =>
  popupErrorOf('internalError', {}, { reason: 'transport', detail });
