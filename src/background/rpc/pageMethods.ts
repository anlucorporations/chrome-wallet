/**
 * M4.b — `src/background/rpc/pageMethods.ts`
 * Catálogo CERRADO de los métodos de **PÁGINA** (EIP-1193) del Service Worker: las 10 lecturas de
 * H3 y la respuesta `4200` de los aprobables mientras la cola no existe (H3, tareas 3.2, 3.3,
 * 3.7 y 3.10).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §3.2 (`eth_accounts`/`eth_requestAccounts` y sesiones por origen con
 *   TTL de 24 h renovables), §2.5 (uniones cerradas) y §4.3 del diccionario (métodos soportados).
 * - `plan_desarrollo.md` §3.3.5 tareas 3.2, 3.3, 3.7 y 3.10, y §3.3.6 (`CA-RF-14`, `CA-RF-17`,
 *   `CA-RF-18`, `CA-RF-25`).
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **`eth_sign` no existe**: no figura en ninguna unión y el router responde `4200`.
 * 2. **Los 6 aprobables NO se implementan en H3** (`eth_sendTransaction`, `personal_sign`,
 *    `eth_signTypedData_v4`, `wallet_switchEthereumChain`, `wallet_addEthereumChain` y
 *    `wallet_revokePermissions` desde la dApp): la respuesta es `4200` **sin lanzar de forma
 *    síncrona** y **sin** abrir ventana ni crear entrada en la cola.
 * 3. **`eth_accounts` NUNCA abre ventana**: sin sesión vigente devuelve `[]`; con sesión vigente
 *    devuelve `['<cuenta autorizada>']` y RENUEVA `expiresAt = lastUsedAt + 86400000` (DEC-31).
 * 4. **`eth_requestAccounts`** abre `connect.html` (420×650) solo cuando no hay sesión vigente y
 *    resuelve `['<cuenta elegida>']` o rechaza con `4001` si se cancela.
 * 5. **Sin estado propio**: toda la verdad vive en `truekeate_connected_sites` (M26) y todas las
 *    llamadas al nodo pasan por M5 (cliente RPC único, con su política cerrada de reintentos).
 */

import type { Address, ChainIdHex, Eip1193Error, ProviderEventName } from '../../shared/types';
import { DEFAULT_CHAIN_ID, SESSION_TTL_MS } from '../../shared/constants';
import {
  STORAGE_KEYS,
  readStorage,
  type StorageLocalLike,
} from '../state/schema';
import { resolveActiveNetwork } from '../networks/catalog';
import type { TrustedSenderContext } from '../security/senderGuard';
import { internalError, unsupportedMethodError, userRejectedError } from './errors';

// ---------------------------------------------------------------------------
// Dependencias inyectables (costura única con M5, M26 y M27)
// ---------------------------------------------------------------------------

/** Contexto de una invocación de página resuelto por las guardas (M20) y el router (M3). */
export interface PageCallContext {
  context: TrustedSenderContext;
  /** Origen normalizado de la página (`extension` en los contextos de la extensión). */
  origin: string;
  tabId: number | null;
  frameId: number;
  /** Instante de la llamada, inyectable en las pruebas (reloj inyectado). */
  now: number;
  params: unknown[];
  /**
   * Plazo del TTL de la sesión; por defecto el normativo (86 400 000 ms = 24 h). Se inyecta para
   * que las pruebas de vencimiento no dependan del reloj real.
   */
  ttlMs?: number;
  storage?: StorageLocalLike | null;
}

/** M5 — cliente RPC único (retry 1+3, backoff 1/2/4 s, timeout 5 s por intento). */
export interface RpcClientApi {
  send(method: string, params?: unknown[], options?: unknown): Promise<unknown>;
  getBalance(address: string): Promise<bigint>;
}

/** M26 — sesiones por origen (`truekeate_connected_sites`). */
export interface SessionsApi {
  /** Renueva (o purga) la sesión del origen. `session` es `null` si no hay sesión vigente. */
  touchSession(
    origin: string,
    options?: { now?: number; ttlMs?: number; storage?: StorageLocalLike | null; tabId?: number | null },
  ): Promise<{ session: { account: Address; chainId: ChainIdHex } | null; persisted: boolean }>;
  /** Sesión vigente AHORA, sin renovar. */
  currentSessionFor(
    sessions: Record<string, unknown>,
    origin: string,
    now?: number,
  ): { account: Address; chainId: ChainIdHex } | null;
  /** Mapa persistido de sesiones (proyección de M33). */
  readSessions(storage?: StorageLocalLike | null | undefined): Promise<Record<string, unknown>>;
  /** Revoca la sesión del origen y devuelve las pestañas asociadas. */
  revokeSession(
    origin: string,
    options?: { storage?: StorageLocalLike | null; tabId?: number | null },
  ): Promise<{ origin: string; revoked: boolean; tabIds: number[] } | null>;
}

/** M27 — propagación de eventos a las pestañas. */
export interface EventsApi {
  emitEvent(
    eventName: ProviderEventName,
    data: unknown,
    options?: { tabIds?: readonly number[]; frameId?: number | null },
  ): Promise<number>;
}

/** Opciones de apertura de la ventana de conexión (M26.b). */
export interface OpenConnectInput {
  origin: string;
  tabId: number | null;
  frameId?: number | null;
  now?: number;
  storage?: StorageLocalLike | null;
}

/** Resolución de la elección del usuario en `connect.html`. */
export interface ConnectOutcome {
  success: boolean;
  account?: Address;
  accountIndex?: number;
  error?: Eip1193Error;
}

/** Dependencias del catálogo de página. */
export interface PageHandlerDeps {
  readonly rpc: RpcClientApi;
  readonly sessions: SessionsApi;
  readonly events: EventsApi;
  /** Abre `connect.html` y espera la elección; inyectable para las pruebas del router. */
  readonly openConnect: (input: OpenConnectInput) => Promise<ConnectOutcome>;
}

/** Error de programación: el catálogo se invocó con dependencias incompletas. */
const missingDeps = (method: string): Eip1193Error =>
  internalError({ reason: 'page-handler-deps-missing', method });

// ---------------------------------------------------------------------------
// Auxiliares de parámetros
// ---------------------------------------------------------------------------

/** Primer parámetro de una llamada de página, si es cadena. */
const stringParam = (params: unknown[], index: number): string | null => {
  const value = params[index];
  return typeof value === 'string' ? value : null;
};

/** `chainId` activo: el guardado si está dado de alta y, si no, Anvil (`0x7a69`). */
const activeChainIdFrom = (snapshot: Record<string, unknown>): ChainIdHex => {
  const networks = snapshot[STORAGE_KEYS.networks];
  const catalog: Record<string, never> =
    typeof networks === 'object' && networks !== null && !Array.isArray(networks)
      ? (networks as Record<string, never>)
      : {};
  const resolved = resolveActiveNetwork(snapshot[STORAGE_KEYS.chainId], catalog);
  return resolved.chainId;
};

/** Campos tipados de un recibo o de una transacción (paso directo del nodo). */
const asJsonRpcResult = (value: unknown): unknown => value ?? null;

// ---------------------------------------------------------------------------
// Manejadores de lectura
// ---------------------------------------------------------------------------

/** Firma de un manejador de página. */
export type PageHandler = (
  params: unknown[],
  call: PageCallContext,
  deps: PageHandlerDeps,
) => Promise<unknown>;

/**
 * `eth_chainId` → `0x7a69` con Anvil (CA-RF-18). Se consulta al NODO a través del cliente único
 * (M5): así se ejerce la política cerrada de reintentos y, con el nodo caído, la página recibe
 * `4900` en lugar de una respuesta inventada (RNF-07).
 */
const handleChainId: PageHandler = async (params, _call, deps) => {
  const raw = await deps.rpc.send('eth_chainId', params);
  return typeof raw === 'string' && /^0x[0-9a-fA-F]+$/.test(raw) ? raw : DEFAULT_CHAIN_ID;
};

/** `eth_blockNumber` → número de bloque del nodo, en hexadecimal. */
const handleBlockNumber: PageHandler = async (params, _call, deps) => deps.rpc.send('eth_blockNumber', params);

/** `eth_gasPrice` → precio del gas sugerido por el nodo. */
const handleGasPrice: PageHandler = async (params, _call, deps) => deps.rpc.send('eth_gasPrice', params);

/** `eth_getBalance` → saldo en wei (`WeiString` hexadecimal) de la dirección indicada. */
const handleGetBalance: PageHandler = async (params, _call, deps) => {
  const address = stringParam(params, 0);
  if (address === null) {
    throw internalError({ reason: 'invalid-address-param', method: 'eth_getBalance' });
  }
  // `ethers` (el proveedor ÚNICO) convierte el `bigint` a la forma hexadecimal del protocolo.
  return `0x${(await deps.rpc.getBalance(address)).toString(16)}`;
};

/** `eth_feeHistory` → paso directo del resultado del nodo (objeto JSON-RPC). */
const handleFeeHistory: PageHandler = async (params, _call, deps) =>
  asJsonRpcResult(await deps.rpc.send('eth_feeHistory', params));

/** `eth_estimateGas` → estimación del nodo; un revert se propaga como error del nodo. */
const handleEstimateGas: PageHandler = async (params, _call, deps) =>
  asJsonRpcResult(await deps.rpc.send('eth_estimateGas', params));

/** `eth_getTransactionByHash` → transacción o `null`. */
const handleGetTransactionByHash: PageHandler = async (params, _call, deps) =>
  asJsonRpcResult(await deps.rpc.send('eth_getTransactionByHash', params));

/** `eth_getTransactionReceipt` → recibo o `null`. */
const handleGetTransactionReceipt: PageHandler = async (params, _call, deps) =>
  asJsonRpcResult(await deps.rpc.send('eth_getTransactionReceipt', params));

/**
 * `eth_accounts`: **sin sesión para ese origen → `[]` SIN abrir ninguna ventana**; con sesión
 * vigente → `['<cuenta autorizada>']` y **renueva** `expiresAt = lastUsedAt + 86400000` (DEC-31).
 * Tras 24 h sin uso la entrada se elimina y vuelve a `[]`.
 */
const handleAccounts: PageHandler = async (_params, call, deps) => {
  const touched = await deps.sessions.touchSession(call.origin, {
    now: call.now,
    ttlMs: call.ttlMs ?? SESSION_TTL_MS,
    tabId: call.tabId,
    storage: call.storage,
  });
  return touched.session === null ? [] : [touched.session.account];
};

/**
 * `eth_requestAccounts`: con sesión vigente resuelve la cuenta autorizada **sin nuevo prompt**;
 * sin sesión, abre `connect.html` (420×650) y espera la elección. Cancelar o cerrar la ventana
 * rechaza con `4001` y **no** persiste ninguna sesión (§3.2).
 */
const handleRequestAccounts: PageHandler = async (_params, call, deps) => {
  const sessions = await deps.sessions.readSessions(call.storage);
  const existing = deps.sessions.currentSessionFor(sessions, call.origin, call.now);
  if (existing !== null) {
    const touched = await deps.sessions.touchSession(call.origin, {
      now: call.now,
      ttlMs: call.ttlMs ?? SESSION_TTL_MS,
      tabId: call.tabId,
      storage: call.storage,
    });
    if (touched.session !== null) {
      // Recuperar una sesión vigente también es «conectado» para la página (CA-RF-25).
      await deps.events.emitEvent(
        'connect',
        { chainId: touched.session.chainId },
        { tabIds: call.tabId === null ? undefined : [call.tabId] },
      );
      return [touched.session.account];
    }
  }
  const outcome = await deps.openConnect({
    origin: call.origin,
    tabId: call.tabId,
    frameId: call.frameId,
    now: call.now,
    storage: call.storage,
  });
  if (!outcome.success || outcome.account === undefined) {
    throw outcome.error ?? userRejectedError({ reason: 'connect-cancelled' });
  }
  const stored = await readStorage([STORAGE_KEYS.networks, STORAGE_KEYS.chainId], call.storage);
  await deps.events.emitEvent(
    'connect',
    { chainId: activeChainIdFrom(stored) },
    { tabIds: call.tabId === null ? undefined : [call.tabId] },
  );
  return [outcome.account];
};

// ---------------------------------------------------------------------------
// Registro CERRADO de los métodos de página
// ---------------------------------------------------------------------------

/** Manejadores de las 10 lecturas de página. */
export const PAGE_READ_HANDLERS: Readonly<Record<string, PageHandler>> = Object.freeze({
  eth_chainId: handleChainId,
  eth_blockNumber: handleBlockNumber,
  eth_gasPrice: handleGasPrice,
  eth_getBalance: handleGetBalance,
  eth_feeHistory: handleFeeHistory,
  eth_estimateGas: handleEstimateGas,
  eth_getTransactionByHash: handleGetTransactionByHash,
  eth_getTransactionReceipt: handleGetTransactionReceipt,
  eth_accounts: handleAccounts,
  eth_requestAccounts: handleRequestAccounts,
});

/** ¿Tiene implementación de página el método indicado? */
export const isPageReadMethod = (method: string): boolean =>
  Object.prototype.hasOwnProperty.call(PAGE_READ_HANDLERS, method);

/**
 * Despacha una lectura de página. Lanza SIEMPRE errores EIP-1193 con `code`; un método que no
 * tenga implementación de página se rechaza con `4200` (`unsupportedMethod`), sin lanzar de forma
 * síncrona hacia el llamador (el router envuelve todo en `try/catch`).
 */
export const invokePageMethod = async (
  method: string,
  params: unknown[],
  call: PageCallContext,
  deps: PageHandlerDeps,
): Promise<unknown> => {
  const handler = PAGE_READ_HANDLERS[method];
  if (handler === undefined) {
    throw unsupportedMethodError();
  }
  if (deps === undefined || deps.rpc === undefined || deps.sessions === undefined) {
    throw missingDeps(method);
  }
  return handler(params, call, deps);
};
