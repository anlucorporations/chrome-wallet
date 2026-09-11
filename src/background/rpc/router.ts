/**
 * M3 — `src/background/rpc/router.ts`
 * Despachador del canal interno (`TRUEKEATE_RPC`) del Service Worker.
 *
 * Recibe la petición tal y como llega del popup (contexto propio) o de un content script y
 * aplica, EN ESTE ORDEN, los controles de `documento_tecnico.md` §3.7 y `diccionario_datos.md`
 * §4.2:
 *
 *   1. **Redacción de `params`** (M22): se recortan y redactan ANTES de cualquier
 *      persistencia o traza, de modo que ni el mnemonic ni una clave privada puedan acabar en
 *      `truekeate_logs` ni en el `data` de un error (H-42, RNF-09).
 *   2. **Guarda de `sender`** (M20): `sender.id === chrome.runtime.id` (si no, `4100`), el
 *      `origin` se recalcula SOLO desde `sender.origin` (D-J/ADT-07) y la allowlist de métodos
 *      internos deja fuera a todo emisor que no sea una página de la extensión.
 *   3. **Unión CERRADA** (M56) + **catálogo** (M4): un `method` que no pertenezca a
 *      `PageMethod | ApprovalMethod | InternalMethod`, o que no esté implementado, responde
 *      `4200 Unsupported method`. Así `eth_sign` responde `4200` sin existir en el catálogo.
 *   4. **Allowlist de contextos** por metadato del catálogo: los `wallet_*` internos solo se
 *      aceptan desde el popup (contexto `extension`); desde una página se responde `4200`
 *      con la causa `methodNotAllowedInContext`.
 *   5. **Despacho** del método interno (M4 → M8/M9/M10/M12/M13/M28/M29/M33, los **15** de
 *      §5.1.1 v1.6) y conversión de CUALQUIER excepción en un objeto EIP-1193 del catálogo de
 *      M6 (nunca un error sin `code`).
 *
 * Lo que NO hace todavía (hitos siguientes): *token bucket* y cardinalidad (H3/H5), ventana de
 * aprobación (H4), sesiones por origen (H3) y llamadas al nodo (H3). Los métodos públicos
 * EIP-1193 siguen declarados en el catálogo y SIN implementar: responden `4200`.
 */

import type { Eip1193Error, InternalMethod, WalletMethod } from '../../shared/types';
import { isTruekeateMessageType } from '../../shared/protocol';
import {
  guardSender,
  type DeclaredContext,
  type SenderLike,
  type TrustedSenderContext,
} from '../security/senderGuard';
import { redactParams } from '../security/redaction';
import {
  getCatalogEntry,
  invokeInternalMethod,
  isCatalogMethod,
  isInternalMethod,
  type InternalHandlerDeps,
} from './catalog';
import {
  internalError,
  isEip1193Error,
  methodNotAllowedInContextError,
  unsupportedMethodError,
} from './errors';

// Reexportación de la comprobación de nomenclatura canónica: el rechazo de una clave que no
// empieza por `truekeate_` se responde como error interno `-32603` (M33/M34, ACU-25).
export { canonicalKeyProblem } from '../state/schema';

// ---------------------------------------------------------------------------
// Forma de la respuesta del protocolo (diccionario_datos.md §4.2)
// ---------------------------------------------------------------------------

/**
 * Respuesta del Service Worker a un `TRUEKEATE_RPC`: **o** `result`, **o** `error`, nunca los
 * dos (diccionario §4.2: `result | error`). El `error` es SIEMPRE un objeto EIP-1193 con
 * `code` numérico (ACU-05 / RNF-06).
 */
export type RpcResponse = { result: unknown } | { error: Eip1193Error };

/** Resultado discriminado interno del router. */
export type RouterResult =
  | {
      ok: true;
      result: unknown;
      context: TrustedSenderContext;
      /** `params` ya recortados y redactados por M22: es lo ÚNICO registrable. */
      redactedParams: unknown;
    }
  | {
      ok: false;
      error: Eip1193Error;
      context: TrustedSenderContext | null;
      redactedParams: unknown;
    };

/** Convierte el resultado del router en la forma de respuesta del protocolo. */
export const toRpcResponse = (result: RouterResult): RpcResponse =>
  result.ok ? { result: result.result } : { error: result.error };

// ---------------------------------------------------------------------------
// Dependencias del router (inyectables para las pruebas de H2)
// ---------------------------------------------------------------------------

/**
 * Política de redacción de `params` (M22) aplicada antes de persistir o registrar. Se declara
 * con la firma REAL de `security/redaction.ts` (`params: unknown → unknown`) para que el
 * router no imponga una forma distinta a la del módulo que la implementa (H-42).
 */
export type RedactParams = (method: string, params: unknown) => unknown;

/** Invocador del catálogo cerrrado (M4). */
export type InternalInvoker = (
  method: InternalMethod,
  params: unknown[],
  context: TrustedSenderContext,
  deps?: InternalHandlerDeps,
) => Promise<unknown>;

/** Dependencias del router: dos puntos de extensión, ambos con su valor real por defecto. */
export interface RouterDeps {
  readonly redactParams: RedactParams;
  readonly invokeInternal: InternalInvoker;
}

/** Dependencias reales: M22 (redacción) y M4 (catálogo de internos). */
export const defaultRouterDeps: RouterDeps = {
  redactParams,
  invokeInternal: invokeInternalMethod,
};

// ---------------------------------------------------------------------------
// Entrada del router
// ---------------------------------------------------------------------------

/** Parámetros del router: el emisor real + los datos declarados (NO fiables). */
export interface HandleRpcRequestParams {
  sender: SenderLike;
  declared?: DeclaredContext;
  method: string;
  params?: unknown[];
}

/**
 * Redacta los `params` con M22 sin poder romper el router: si la política fallara, se registra
 * el aviso y se devuelve una lista vacía (mejor perder detalle de traza que filtrar un secreto).
 */
const redactSafely = (method: string, params: unknown[], deps: RouterDeps): unknown => {
  try {
    return deps.redactParams(method, params);
  } catch (error) {
    console.warn('[truekeate] no se pudieron redactar los params de la traza', error);
    return [];
  }
};

/**
 * Único punto de entrada del router.
 *
 * Devuelve siempre la forma `RouterResult`; el llamador (M2) la traduce con `toRpcResponse`.
 * Ninguna excepción escapa: cualquier fallo se convierte en un error EIP-1193 tipado.
 */
export const handleRPCRequest = async (
  input: HandleRpcRequestParams,
  deps: RouterDeps = defaultRouterDeps,
): Promise<RouterResult> => {
  const { sender, declared = {}, method } = input;
  const params = Array.isArray(input.params) ? input.params : [];

  // 1. Redacción ANTES de cualquier traza o persistencia (H-42 / RNF-09).
  const redactedParams = redactSafely(method, params, deps);

  // Contexto confiable del emisor: se conserva aunque el despacho falle, porque H3/H4 lo
  // necesitan para entregar la respuesta SOLO al frame correcto (D-J / ADT-07).
  let context: TrustedSenderContext | null = null;

  try {
    // 2. Guardas de emisor, de origen y de allowlist de métodos internos (M20).
    const guardedMethod: WalletMethod | undefined = isCatalogMethod(method) ? method : undefined;
    const guard = guardSender(sender, declared, guardedMethod);
    if (!guard.ok) {
      return { ok: false, error: guard.error, context: null, redactedParams };
    }
    context = guard.context;

    // 3. Unión cerrada (M56) + catálogo cerrado (M4): fuera del catálogo o sin implementar → 4200.
    if (!isCatalogMethod(method)) {
      return { ok: false, error: unsupportedMethodError(), context, redactedParams };
    }
    const entry = getCatalogEntry(method);
    if (entry === undefined) {
      // Declarado pero no implementado: es el caso de TODO el catálogo público en H2.
      return { ok: false, error: unsupportedMethodError(), context, redactedParams };
    }

    // 4. Allowlist de contextos: `wallet_*` internos SOLO desde páginas de la extensión.
    if (entry.context === 'extension' && !context.isExtensionContext) {
      return { ok: false, error: methodNotAllowedInContextError(), context, redactedParams };
    }

    // 5. Despacho. En H2 solo los internos están implementados; el catálogo público lo estará
    //    en H3 (lecturas y conexión) y H4/H5 (firma, redes y logs).
    if (entry.kind !== 'internal' || !isInternalMethod(method)) {
      return { ok: false, error: unsupportedMethodError(), context, redactedParams };
    }

    // Defensa en profundidad (RNF-09): el revelado NUNCA sale de un contexto no confiable.
    if (method === 'wallet_revealSecret' && !context.isExtensionContext) {
      return { ok: false, error: methodNotAllowedInContextError(), context, redactedParams };
    }

    const result = await deps.invokeInternal(method, params, context);
    return { ok: true, result, context, redactedParams };
  } catch (error) {
    // Toda excepción se convierte en un error EIP-1193 tipado (nunca un error sin `code`).
    return {
      ok: false,
      error: toEip1193Error(error, method),
      context,
      redactedParams,
    };
  }
};

/** Convierte una excepción en error EIP-1193 del catálogo, sin filtrar `params`. */
export const toEip1193Error = (error: unknown, method: string): Eip1193Error =>
  isEip1193Error(error)
    ? error
    : internalError({ reason: 'unhandled-exception', method });

// ---------------------------------------------------------------------------
// Entrada del canal `chrome.runtime.onMessage`
// ---------------------------------------------------------------------------

/** ¿Es un objeto plano utilizable como mensaje? */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Procesa un mensaje crudo de `chrome.runtime.onMessage`.
 *
 * - Devuelve `undefined` cuando el mensaje NO es del protocolo (ningún tipo `TRUEKEATE_*`):
 *   el router no responde a mensajes ajenos.
 * - `TRUEKEATE_RPC` se enruta por `handleRPCRequest` con el `sender` REAL que entrega Chrome;
 *   el `origin`, `tabId` y `frameId` declarados se conservan SOLO como dato no fiable.
 * - Los demás tipos del protocolo (`SIGN_RESPONSE`, `CONNECT_RESPONSE`, `RESUME`) pertenecen a
 *   H4/H5 (`RESUME` viaja además por el puerto `truekeate_approval`): se responden con `4200`
 *   para no dejar colgada a ninguna superficie, igual que hacía el arranque de H1.
 */
export const handleRpcMessage = async (
  message: unknown,
  sender: SenderLike,
  deps: RouterDeps = defaultRouterDeps,
): Promise<RpcResponse | undefined> => {
  const record = asRecord(message);
  if (record === null) {
    return undefined;
  }
  const type = record.type;
  if (!isTruekeateMessageType(type)) {
    return undefined;
  }
  if (type !== 'TRUEKEATE_RPC') {
    return { error: unsupportedMethodError() };
  }
  const result = await handleRPCRequest(
    {
      sender,
      declared: {
        origin: typeof record.origin === 'string' ? record.origin : undefined,
        tabId: typeof record.tabId === 'number' ? record.tabId : null,
        frameId: typeof record.frameId === 'number' ? record.frameId : null,
      },
      method: typeof record.method === 'string' ? record.method : '',
      params: Array.isArray(record.params) ? record.params : [],
    },
    deps,
  );
  return toRpcResponse(result);
};

// ---------------------------------------------------------------------------
// Punto de extensión reservado para H3..H5
// ---------------------------------------------------------------------------

/** Firma tipada del método del catálogo, para cuando M4 los implemente. */
export type CatalogInvoker = (
  method: WalletMethod,
  params: unknown[],
  context: TrustedSenderContext,
) => Promise<unknown>;

/**
 * Punto de extensión reservado para H3..H5: cada hito rellena el catálogo (M4) sin cambiar la
 * forma del router. Se declara aquí para que el contrato quede fijado desde H1.
 */
export const createCatalogInvoker = (
  entries: Readonly<
    Partial<Record<WalletMethod, (params: unknown[], context: TrustedSenderContext) => Promise<unknown>>>
  >,
): CatalogInvoker => {
  return async (method, params, context) => {
    const invoke = entries[method];
    if (invoke === undefined) {
      throw unsupportedMethodError();
    }
    return invoke(params, context);
  };
};
