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
 *      con la causa `methodNotAllowedInContext`. La revocación del popup
 *      (`wallet_revokePermissions`) es la única excepción declarada: desde una PÁGINA es un
 *      aprobable de H4 y sigue al despacho del paso 6.
 *   5. ***Token bucket*** **por origen** (H3, tarea 3.13): la ventana de 6 solicitudes/60 s cubre
 *      **TODO** el catálogo —también las lecturas— y está **persistida** en
 *      `truekeate_rate_windows`, de modo que sobrevive a la suspensión del SW. Al exceder se
 *      responde `4001` **sin abrir ventana** y sin llamar al nodo.
 *   6. **Despacho de los 6 APROBABLES** (H4, M19.b → `approvals/dispatch.ts`): `eth_sendTransaction`,
 *      `personal_sign`, `eth_signTypedData_v4`, `wallet_switchEthereumChain`,
 *      `wallet_addEthereumChain` y `wallet_revokePermissions` desde una página recorren la ruta
 *      completa —preview (M19) → cola (M14) → plazo (M15) → ventana única (M18) → decisión → firma
 *      (M11) y difusión (M7)—. El `wallet_revokePermissions` del POPUP conserva su manejador
 *      interno (tarea 3.11), porque un contexto de la extensión no abre ventana de aprobación.
 *   7. **Despacho**: los **internos** (M4 → M8/M9/M10/M12/M13/M28/M29/M33) y las **10 lecturas de
 *      página** de H3 (M4 → `rpc/pageMethods.ts` → M5/M26/M27).
 *   7.b **Métodos de RED de H5 (tareas 5.1 y 5.2) en AMBOS contextos**: `wallet_switchEthereumChain`
 *      (M24) y `wallet_addEthereumChain` (M25) se despachan aquí —no por el paso 6— para cubrir
 *      también la invocación desde el POPUP. Es el contrato del hito: el cambio exige aprobación
 *      **siempre que la red destino no sea la activa** (P-19/DEC-29) y el alta pide el permiso de
 *      host en runtime **SIEMPRE**, sin excepción por contexto (DEC-36/DEC-41/ADT-25). El atajo de
 *      «ya es la red activa» (`null` sin ventana y sin entrada en la cola, `CA-RF-22`) lo resuelve
 *      M24 ANTES de encolar nada.
 *
 * CUALQUIER excepción se convierte en un objeto EIP-1193 del catálogo de M6 (nunca un error sin
 * `code`). El router ya NO tiene ningún método del catálogo sin implementar: `eth_sign` sigue sin
 * existir (DEC-22 / H-11a) y responde `4200` por la unión cerrada.
 */

import type {
  ApprovalMethod,
  Eip1193Error,
  InternalMethod,
  WalletMethod,
} from '../../shared/types';
import { isTruekeateMessageType } from '../../shared/protocol';
import {
  guardSender,
  responseTargetFor,
  type DeclaredContext,
  type ResponseTarget,
  type SenderLike,
  type TrustedSenderContext,
} from '../security/senderGuard';
import { redactParams } from '../security/redaction';
import {
  getCatalogEntry,
  invokeInternalMethod,
  isCatalogMethod,
  isExtensionInvokable,
  isInternalMethod,
  type InternalHandlerDeps,
} from './catalog';
import {
  invokePageMethod,
  type ConnectOutcome,
  type EventsApi,
  type OpenConnectInput,
  type PageCallContext,
  type PageHandlerDeps,
  type RpcClientApi,
  type SessionsApi,
} from './pageMethods';
import {
  internalError,
  isEip1193Error,
  methodNotAllowedInContextError,
  rateLimitExceededError,
  unsupportedMethodError,
} from './errors';
import { decideRateLimit, type RateLimitDecision } from './rateLimit';
import { getBalanceWei, rpcSend } from './client';
import { emitProviderEvent, defaultEventsDeps } from '../events';
import { readSessions, revokeSession, touchSession, currentSessionFor } from '../sessions';
import { openConnectWindow } from '../connections';
import { dispatchApproval, type ApprovalDispatchOutcome } from '../approvals/dispatch';
import {
  dispatchAddEthereumChain,
  type AddChainResult,
  type NetworkApprovalOutcome,
  type NetworkApprovalRunner,
} from '../networks/addChain';
import {
  dispatchSwitchEthereumChain,
  type SwitchChainResult,
} from '../networks/switch';

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
      /** Destino EXACTO de la respuesta: con `frameId !== 0`, SOLO a ese frame (DEC-40). */
      target: ResponseTarget;
      /** `params` ya recortados y redactados por M22: es lo ÚNICO registrable. */
      redactedParams: unknown;
    }
  | {
      ok: false;
      error: Eip1193Error;
      context: TrustedSenderContext | null;
      target: ResponseTarget;
      redactedParams: unknown;
    };

/** Destino neutro cuando la guarda rechazó la petición antes de tener contexto confiable. */
const NO_TARGET: ResponseTarget = { tabId: null, frameId: null };

/** Convierte el resultado del router en la forma de respuesta del protocolo. */
export const toRpcResponse = (result: RouterResult): RpcResponse =>
  result.ok ? { result: result.result } : { error: result.error };

// ---------------------------------------------------------------------------
// Dependencias del router (inyectables para las pruebas)
// ---------------------------------------------------------------------------

/**
 * Política de redacción de `params` (M22) aplicada antes de persistir o registrar. Se declara
 * con la firma REAL de `security/redaction.ts` (`params: unknown → unknown`) para que el
 * router no imponga una forma distinta a la del módulo que la implementa (H-42).
 */
export type RedactParams = (method: string, params: unknown) => unknown;

/** Invocador del catálogo cerrado de métodos internos (M4). */
export type InternalInvoker = (
  method: InternalMethod | 'wallet_revokePermissions',
  params: unknown[],
  context: TrustedSenderContext,
  deps?: InternalHandlerDeps,
) => Promise<unknown>;

/** Invocador de las 10 lecturas de página (M4.b). */
export type PageInvoker = (
  method: string,
  params: unknown[],
  call: PageCallContext,
  deps: PageHandlerDeps,
) => Promise<unknown>;

/**
 * Invocador de los 6 métodos APROBABLES de página (M19.b, cierre de `D-H4-E1`): construye la vista
 * previa (M19), encola la solicitud (M14), arma el plazo (M15), abre la ventana única (M18), espera
 * la decisión (M14.b) y aplica el efecto del método (M11/M7/M26).
 */
export type ApprovalInvoker = (options: {
  method: ApprovalMethod;
  params: unknown[];
  context: TrustedSenderContext;
  now: number;
  /**
   * `id` de correlación del salto 1 declarado por el relay (dato NO fiable que el SW **no**
   * interpreta): viaja hasta la entrada persistida de la cola para que la resolución empujada
   * conserve el `id` que espera la promesa de la dApp (H-07, D-H4-E10).
   */
  requestId?: string;
}) => Promise<ApprovalDispatchOutcome>;
/** Decisor del *token bucket* por origen (H3, tarea 3.13). */
export type RateLimitDecider = (input: {
  origin: string;
  now?: number;
  storage?: unknown;
}) => Promise<RateLimitDecision>;

/**
 * Invocador de los DOS métodos de RED de H5 (tareas 5.1 y 5.2). Se declara como una costura propia
 * —y no como parte de los internos— porque su contexto es doble (`page`/`any` según §4.3) y su
 * despacho es SIEMPRE el aprobable, también desde el popup.
 */
export interface NetworkDispatchDeps {
  readonly switchChain: (options: {
    params: readonly unknown[];
    context: TrustedSenderContext;
    runner: NetworkApprovalRunner;
    now?: number;
  }) => Promise<NetworkDispatchOutcome>;
  readonly addChain: (options: {
    params: readonly unknown[];
    context: TrustedSenderContext;
    runner: NetworkApprovalRunner;
    now?: number;
  }) => Promise<NetworkDispatchOutcome>;
}

/** Desenlace de un método de red: `null` de EIP-1193 o el error con `code` (M6). */
export type NetworkDispatchOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: Eip1193Error };

/** Dependencias del router: puntos de extensión, todos con su valor real por defecto. */
export interface RouterDeps {
  readonly redactParams: RedactParams;
  readonly invokeInternal: InternalInvoker;
  readonly invokePage: PageInvoker;
  /** Invocador de los 6 aprobables (M19.b). */
  readonly approve: ApprovalInvoker;
  /** Invocador de los 2 métodos de RED (M24/M25), en ambos contextos. */
  readonly network: NetworkDispatchDeps;
  readonly decideRateLimit: RateLimitDecider;
  readonly page: PageHandlerDeps;
  /** Reloj inyectable (las pruebas fijan `now` sin depender del reloj real). */
  readonly now: () => number;
}

/** M5 — cliente RPC único, con su política cerrada de reintentos. */
const rpcClient: RpcClientApi = {
  send: async (method, params) => rpcSend(method, params),
  getBalance: async (address) => BigInt(await getBalanceWei(address)),
};

/** M26 — sesiones por origen (`truekeate_connected_sites`). */
const sessionsApi: SessionsApi = {
  touchSession: async (origin, options) => touchSession(origin, options ?? {}),
  currentSessionFor: (sessions, origin, now) =>
    currentSessionFor(sessions as never, origin, now) as never,
  readSessions: async (storage) => (await readSessions(storage)) as Record<string, unknown>,
  revokeSession: async (origin, options) => revokeSession(origin, options ?? {}),
};

/** M27 — propagación de eventos a las pestañas. */
const eventsApi: EventsApi = {
  emitEvent: async (eventName, data, options) =>
    emitProviderEvent(eventName, data, {
      tabIds: options?.tabIds,
      frameId: options?.frameId ?? null,
      deps: defaultEventsDeps(),
    }),
};

/** M26.b — apertura de `connect.html` y espera de la elección del usuario. */
const openConnect = async (input: OpenConnectInput): Promise<ConnectOutcome> =>
  openConnectWindow({
    origin: input.origin,
    tabId: input.tabId,
    frameId: input.frameId ?? null,
    now: input.now,
    storage: input.storage,
  });

/**
 * Construye el **runner** que los métodos de red (M24/M25) necesitan para recorrer la cola de
 * aprobaciones: es el `dispatchApproval` de H4 (M19.b) invocado con el método de red, **el contexto
 * confiable REAL** del emisor y los datos del borrador. Se conserva `requestId` (correlación del
 * salto 1, D-H4-E10) porque la resolución empujada debe llegar a la promesa correcta de la dApp.
 *
 * El desenlace del ciclo se traduce a la forma que consume M24/M25: `{ ok, approved, status }`,
 * donde `status: 'approved'` es lo único que autoriza el efecto (activar la red o persistir el
 * alta).
 */
const networkRunner =
  (
    method: ApprovalMethod,
    context: TrustedSenderContext,
    requestId: string | undefined,
  ): NetworkApprovalRunner =>
  async (draft, now): Promise<NetworkApprovalOutcome> => {
    const outcome = await dispatchApproval({
      method,
      params: draft.params,
      context,
      now,
      ...(requestId === undefined ? {} : { requestId }),
    });
    return outcome.ok
      ? { ok: true, approved: true, status: 'approved', error: null }
      : { ok: true, approved: false, status: 'rejected', error: outcome.error };
  };

/** Dependencias reales: M22 (redacción), M4/M4.b (catálogos), M3.b (tasa), M5/M26/M27 y M24/M25. */
export const defaultRouterDeps: RouterDeps = {
  redactParams,
  invokeInternal: invokeInternalMethod,
  invokePage: invokePageMethod,
  approve: (options) => dispatchApproval(options),
  network: {
    switchChain: async (options) => {
      const outcome = await dispatchSwitchEthereumChain(options);
      return outcome.ok ? { ok: true, result: outcome.result } : { ok: false, error: outcome.error };
    },
    addChain: async (options) => {
      const outcome = await dispatchAddEthereumChain(options);
      // El alta responde `null` (contrato EIP-3085): la red persistida NO viaja a la dApp.
      return outcome.ok ? { ok: true, result: null } : { ok: false, error: outcome.error };
    },
  },
  decideRateLimit: async (input) =>
    decideRateLimit({ origin: input.origin, now: input.now }),
  page: {
    rpc: rpcClient,
    sessions: sessionsApi,
    events: eventsApi,
    openConnect,
  },
  now: () => Date.now(),
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
  /**
   * `id` de correlación del salto 1 (la página lo generó en la capa inject). NO es identidad ni
   * permiso: solo se persiste con la solicitud aprobable para correlacionar la respuesta empujada.
   */
  requestId?: string;
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
 * Devuelve siempre la forma `RouterResult`; el llamador (M2) la traduce con `toRpcResponse` y
 * entrega la respuesta con `target` (SOLO al frame de origen cuando `frameId !== 0`).
 * Ninguna excepción escapa: cualquier fallo se convierte en un error EIP-1193 tipado.
 */
export const handleRPCRequest = async (
  input: HandleRpcRequestParams,
  deps: RouterDeps = defaultRouterDeps,
): Promise<RouterResult> => {
  const { sender, declared = {}, method, requestId } = input;
  const params = Array.isArray(input.params) ? input.params : [];

  // 1. Redacción ANTES de cualquier traza o persistencia (H-42 / RNF-09).
  const redactedParams = redactSafely(method, params, deps);

  // Contexto confiable del emisor: se conserva aunque el despacho falle, porque el destino de la
  // respuesta (D-J / ADT-07) y la resolución de página (H3) lo necesitan.
  let context: TrustedSenderContext | null = null;
  let target: ResponseTarget = NO_TARGET;

  try {
    // 2. Guardas de emisor, de origen y de allowlist de métodos internos (M20).
    const guardedMethod: WalletMethod | undefined = isCatalogMethod(method) ? method : undefined;
    const guard = guardSender(sender, declared, guardedMethod);
    if (!guard.ok) {
      return { ok: false, error: guard.error, context: null, target: NO_TARGET, redactedParams };
    }
    context = guard.context;
    target = responseTargetFor(guard.context);

    // 3. Unión cerrada (M56) + catálogo cerrado (M4): fuera del catálogo → 4200.
    if (!isCatalogMethod(method)) {
      return { ok: false, error: unsupportedMethodError(), context, target, redactedParams };
    }
    const entry = getCatalogEntry(method);
    if (entry === undefined) {
      // Declarado pero sin implementación: es el caso de los 6 aprobables en H3. Se responde
      // `4200` SIN lanzar de forma síncrona y sin abrir ventana ni crear entrada en la cola.
      return { ok: false, error: unsupportedMethodError(), context, target, redactedParams };
    }

    // 4. Allowlist de contextos: los `wallet_*` internos SOLO desde páginas de la extensión. La
    //    revocación (`wallet_revokePermissions`, tarea 3.11) y los DOS métodos de red de H5
    //    (`wallet_switchEthereumChain`/`wallet_addEthereumChain`, tareas 5.1/5.2) son las
    //    excepciones declaradas: desde una PÁGINA siguen al despacho aprobable del paso 6 y desde el
    //    POPUP tienen su propio camino (revocación directa; red, por la ruta aprobable del paso
    //    6.b), así que NO se cortocircuitan aquí.
    const extensionOnly = isInternalMethod(method) || isExtensionInvokable(method);
    if (extensionOnly && !context.isExtensionContext && !isExtensionInvokable(method)) {
      return {
        ok: false,
        error: methodNotAllowedInContextError(),
        context,
        target,
        redactedParams,
      };
    }

    // 5. *Token bucket* por origen (H3, tarea 3.13): cubre TODO el catálogo, lecturas incluidas.
    //    Los contextos de la extensión están exentos y no escriben nada.
    const rate = await deps.decideRateLimit({ origin: context.origin, now: deps.now() });
    if (!rate.allowed) {
      return { ok: false, error: rateLimitExceededError(), context, target, redactedParams };
    }

    // Defensa en profundidad (RNF-09): el revelado NUNCA sale de un contexto no confiable.
    if (method === 'wallet_revealSecret' && !context.isExtensionContext) {
      return { ok: false, error: methodNotAllowedInContextError(), context, target, redactedParams };
    }

    // 6. Despacho de los 6 APROBABLES de página (M19.b, cierre de D-H4-E1): vista previa → cola →
    //    ventana única → decisión → efecto. Excluye los DOS métodos de red de H5, que tienen su
    //    propio despacho (paso 6.b) para cubrir TAMBIÉN la invocación desde el popup. El
    //    `wallet_revokePermissions` del POPUP no llega aquí (su contexto de extensión lo despacha el
    //    manejador interno de la tarea 3.11, más abajo).
    const isNetworkMethod =
      method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain';
    if (entry.requiresApproval && !context.isExtensionContext && !isNetworkMethod) {
      const outcome = await deps.approve({
        method: method as ApprovalMethod,
        params,
        context,
        now: deps.now(),
        // Correlación del salto 1 (D-H4-E10): el SW no la interpreta, solo la transporta hasta la
        // entrada persistida de la cola.
        ...(requestId === undefined ? {} : { requestId }),
      });
      return outcome.ok
        ? { ok: true, result: outcome.result, context, target, redactedParams }
        : { ok: false, error: outcome.error, context, target, redactedParams };
    }

    // 7. Despacho: lecturas de página (M4.b), métodos de RED (M24/M25) o internos (M4).
    if (entry.resolve) {
      const call: PageCallContext = {
        context,
        origin: context.origin,
        tabId: context.tabId,
        frameId: context.frameId,
        now: deps.now(),
        params,
        storage: undefined,
      };
      const result = await deps.invokePage(method, params, call, deps.page);
      return { ok: true, result, context, target, redactedParams };
    }

    // 7.b Métodos de RED de H5 (tareas 5.1 y 5.2) en AMBOS contextos: M24/M25 se despachan por la
    //     ruta aprobable. El cambio exige aprobación siempre que la red destino no sea la activa
    //     (P-19/DEC-29) —el atajo `null` sin ventana y sin entrada en la cola del caso «ya es la red
    //     activa» lo resuelve M24 ANTES de encolar (`CA-RF-22`)— y el alta pide el permiso de host
    //     en runtime SIEMPRE, también desde el popup (DEC-36/DEC-41/ADT-25).
    if (isNetworkMethod) {
      const networkOptions = {
        params,
        context,
        runner: networkRunner(method as ApprovalMethod, context, requestId),
        now: deps.now(),
      };
      const outcome =
        method === 'wallet_switchEthereumChain'
          ? await deps.network.switchChain(networkOptions)
          : await deps.network.addChain(networkOptions);
      return outcome.ok
        ? { ok: true, result: outcome.result, context, target, redactedParams }
        : { ok: false, error: outcome.error, context, target, redactedParams };
    }

    const result = await deps.invokeInternal(
      method as InternalMethod | 'wallet_revokePermissions',
      params,
      context,
    );
    return { ok: true, result, context, target, redactedParams };
  } catch (error) {
    // Toda excepción se convierte en un error EIP-1193 tipado (nunca un error sin `code`).
    return {
      ok: false,
      error: toEip1193Error(error, method),
      context,
      target,
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

/** Resultado del despacho de un mensaje crudo: respuesta + destino exacto (H3). */
export interface RoutedMessage {
  response: RpcResponse;
  target: ResponseTarget;
  /** Contexto confiable, para el registro y la apertura de ventanas (H3/H4). */
  context: TrustedSenderContext | null;
}

/**
 * Procesa un mensaje crudo de `chrome.runtime.onMessage`.
 *
 * - Devuelve `undefined` cuando el mensaje NO es del protocolo (ningún tipo `TRUEKEATE_*`):
 *   el router no responde a mensajes ajenos.
 * - `TRUEKEATE_RPC` se enruta por `handleRPCRequest` con el `sender` REAL que entrega Chrome;
 *   el `origin`, `tabId` y `frameId` declarados se conservan SOLO como dato no fiable.
 * - Los demás tipos del protocolo (`SIGN_RESPONSE`, `CONNECT_RESPONSE`, `RESUME`) pertenecen a
 *   H4/H5 y a la conexión de H3: `CONNECT_RESPONSE` lo atiende M2 (necesita resolver la promesa
 *   de `eth_requestAccounts`), y el resto se responde con `4200` para no dejar colgada a ninguna
 *   superficie.
 */
export const handleRpcMessage = async (
  message: unknown,
  sender: SenderLike,
  deps: RouterDeps = defaultRouterDeps,
): Promise<RoutedMessage | undefined> => {
  const record = asRecord(message);
  if (record === null) {
    return undefined;
  }
  const type = record.type;
  if (!isTruekeateMessageType(type)) {
    return undefined;
  }
  if (type !== 'TRUEKEATE_RPC') {
    return {
      response: { error: unsupportedMethodError() },
      target: NO_TARGET,
      context: null,
    };
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
      // Correlación declarada por el relay (dato NO fiable): solo se transporta.
      ...(typeof record.requestId === 'string' && record.requestId.length > 0
        ? { requestId: record.requestId }
        : {}),
    },
    deps,
  );
  return {
    response: toRpcResponse(result),
    target: result.target,
    context: result.context,
  };
};

// ---------------------------------------------------------------------------
// Punto de extensión reservado para H4/H5
// ---------------------------------------------------------------------------

/** Firma tipada del método del catálogo, para cuando M4 los implemente. */
export type CatalogInvoker = (
  method: WalletMethod,
  params: unknown[],
  context: TrustedSenderContext,
) => Promise<unknown>;

/**
 * Punto de extensión reservado para H4/H5: cada hito rellena el catálogo (M4) sin cambiar la
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
