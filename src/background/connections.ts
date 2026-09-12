/**
 * M26.b — `src/background/connections.ts`
 * Solicitudes de conexión de `eth_requestAccounts`: ventana `connect.html` y `CONNECT_RESPONSE`.
 * Es la parte del Service Worker de la tarea 3.10 de H3 (`plan_desarrollo.md` §3.3.5).
 *
 * POR QUÉ ES UN MÓDULO PROPIO
 * `sessions.ts` (M26) custodia `truekeate_connected_sites`; aquí vive el CICLO DE VIDA de la
 * solicitud —la ventana de 420×650, el correlador `requestId` y la promesa pendiente— para que M26
 * no dependa de `chrome.windows` y el router no conozca los detalles de la UI.
 *
 * INVARIANTES MV3 (`documento_tecnico.md` §2.3)
 * 1. La VERDAD está en `chrome.storage.local` (`truekeate_connect_request`), no en memoria: el SW
 *    puede suspenderse con la ventana abierta y, al volver, la solicitud sigue localizable.
 * 2. El vencimiento se comprueba de forma PEREZOSA contra `expiresAt = createdAt +
 *    CONNECT_TIMEOUT_MS` (60 s); el temporizador de proceso es solo una red de seguridad.
 * 3. Máximo **1 `pending` por origen** (§2.9).
 * 4. **`settlePendingConnect` es el ÚNICO punto que cierra el ciclo**: resuelve la promesa con la
 *    decisión del usuario (cuenta elegida o `4001`) y descarta el registro. Borrar la entrada sin
 *    resolver dejaría la promesa de `eth_requestAccounts` colgada.
 *
 * Requisitos: RF-16 (RNF-11).
 */

import type {
  Address,
  ConnectRequest,
  ConnectRequestView,
  DappSessionsByOrigin,
  Eip1193Error,
} from '../shared/types';
import {
  CONNECT_TIMEOUT_MS,
  EXTENSION_ORIGIN,
  SESSION_TTL_MS,
} from '../shared/constants';
import { EXTENSION_ROUTE_CONNECT } from '../shared/protocol';
import {
  tooManyPendingRequestsError,
  unauthorizedOriginError,
  userRejectedError,
} from './rpc/errors';
import {
  STORAGE_KEYS,
  readStorage,
  writeStorage,
  type StorageLocalLike,
} from './state/schema';
import {
  connectSession,
  currentSessionFor,
  readSessions,
  type ConnectSessionResult,
} from './sessions';
import { getAccountsSnapshot } from './accounts';
import { seedDefaultNetwork } from './networks/catalog';
import { normalizeOrigin } from './security/senderGuard';

/** Resolución de una solicitud de conexión. */
export interface ConnectResolution {
  success: boolean;
  account?: Address;
  accountIndex?: number;
  error?: Eip1193Error;
}

/** Solicitud pendiente en memoria: el resolutor de la promesa de `eth_requestAccounts`. */
interface PendingConnect {
  requestId: string;
  /** Origen normalizado: permite descartar las solicitudes de un origen (revocación, 3.11). */
  origin: string;
  resolve: (resolution: ConnectResolution) => void;
  /** Red de seguridad de proceso: libera la promesa si nadie responde en el plazo. */
  safetyTimer: ReturnType<typeof setTimeout> | null;
}

/** Solicitudes vivas en ESTE proceso del SW (se reconstruyen desde el almacén si se suspende). */
const pendingConnects = new Map<string, PendingConnect>();

/** Superficie mínima de `chrome.windows` (sin `any`). */
export interface WindowsLike {
  create(createData: {
    url: string;
    type?: string;
    width?: number;
    height?: number;
    focused?: boolean;
  }): Promise<unknown>;
}

/** Superficie inyectable de la plataforma (pruebas). */
export interface ConnectPlatformDeps {
  windows: WindowsLike | null;
  /** URL absoluta de un recurso interno (`chrome.runtime.getURL`). */
  getUrl: (path: string) => string;
}

/** Medidas normativas de la ventana de conexión (P2, `documento_tecnico.md` §2.4). */
export const CONNECT_WINDOW_WIDTH = 420 as const;
export const CONNECT_WINDOW_HEIGHT = 650 as const;

/** Devuelve `chrome.windows` sin `any`, o `null` si la API no está disponible. */
export const getWindowsApi = (): WindowsLike | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const windows: unknown = (chromeNs as { windows?: unknown }).windows;
  if (typeof windows !== 'object' || windows === null) {
    return null;
  }
  const candidate = windows as { create?: unknown };
  return typeof candidate.create === 'function' ? (windows as WindowsLike) : null;
};

/** Devuelve `chrome.runtime.getURL` sin `any`, o una ruta relativa si no está disponible. */
export const getUrlResolver = (): ((path: string) => string) => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  const runtime: unknown =
    typeof chromeNs === 'object' && chromeNs !== null
      ? (chromeNs as { runtime?: unknown }).runtime
      : undefined;
  const getURL: unknown =
    typeof runtime === 'object' && runtime !== null
      ? (runtime as { getURL?: unknown }).getURL
      : undefined;
  if (typeof getURL === 'function') {
    return (path: string) => (getURL as (p: string) => string).call(runtime, path);
  }
  return (path: string) => path;
};

/** Dependencias reales de plataforma. */
export const defaultConnectPlatformDeps = (): ConnectPlatformDeps => ({
  windows: getWindowsApi(),
  getUrl: getUrlResolver(),
});

/** Identificador de la solicitud de conexión (correlador del protocolo). */
export const newRequestId = (): string => {
  const cryptoApi: unknown = (globalThis as { crypto?: unknown }).crypto;
  if (typeof cryptoApi === 'object' && cryptoApi !== null) {
    const randomUUID = (cryptoApi as { randomUUID?: unknown }).randomUUID;
    if (typeof randomUUID === 'function') {
      return (randomUUID as () => string).call(cryptoApi);
    }
  }
  return `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Proyecta el mapa persistido de solicitudes de conexión. */
const asConnectRequests = (value: unknown): Record<string, ConnectRequest> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const requests: Record<string, ConnectRequest> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const record = raw as Record<string, unknown>;
    if (typeof record.requestId !== 'string' || typeof record.origin !== 'string') {
      continue;
    }
    requests[key] = {
      requestId: record.requestId,
      origin: record.origin,
      favicon: typeof record.favicon === 'string' ? record.favicon : undefined,
      accounts: Array.isArray(record.accounts)
        ? record.accounts.filter((entry): entry is Address => typeof entry === 'string')
        : [],
      currentAccountIndex:
        typeof record.currentAccountIndex === 'number' ? record.currentAccountIndex : 0,
      chainId: (typeof record.chainId === 'string' ? record.chainId : '0x0') as ConnectRequest['chainId'],
      tabId: typeof record.tabId === 'number' ? record.tabId : -1,
      frameId: typeof record.frameId === 'number' ? record.frameId : 0,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0,
      expiresAt: typeof record.expiresAt === 'number' ? record.expiresAt : 0,
      status:
        record.status === 'approved' || record.status === 'rejected' || record.status === 'expired'
          ? record.status
          : 'pending',
    };
  }
  return requests;
};

/** Lee las solicitudes de conexión persistidas. */
export const readConnectRequests = async (
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<Record<string, ConnectRequest>> => {
  const stored = await readStorage([STORAGE_KEYS.connectRequest], storage);
  return asConnectRequests(stored[STORAGE_KEYS.connectRequest]);
};

/** ¿Hay ya una solicitud `pending` vigente de ese origen? (§2.9: máximo 1 por origen). */
export const hasPendingConnectFor = (
  requests: Record<string, ConnectRequest>,
  origin: string,
  now: number = Date.now(),
): boolean => {
  const key = normalizeOrigin(origin);
  return Object.values(requests).some(
    (request) =>
      request.status === 'pending' &&
      normalizeOrigin(request.origin) === key &&
      request.expiresAt > now,
  );
};

/**
 * Comprueba si el origen ya tiene sesión VIGENTE y, en tal caso, la renueva sin abrir ventana
 * (`CA-RF-17`/`CA-RF-25`: conectado → cuenta autorizada **sin nuevo prompt**).
 */
export const existingSession = async (
  origin: string,
  options: { storage?: StorageLocalLike | null; now?: number; ttlMs?: number } = {},
): Promise<ConnectSessionResult | null> => {
  const storage = options.storage ?? undefined;
  const sessions: DappSessionsByOrigin = await readSessions(storage);
  const now = options.now ?? Date.now();
  const session = currentSessionFor(sessions, origin, now);
  if (session === null) {
    return null;
  }
  const touched = await connectSession({
    origin,
    account: session.account,
    chainId: session.chainId,
    tabId: null,
    now,
    ttlMs: options.ttlMs ?? SESSION_TTL_MS,
    storage,
  });
  return touched;
};

/** Parámetros de apertura de la ventana de conexión. */
export interface OpenConnectWindowOptions {
  origin: string;
  /** `null` cuando la petición nace en un contexto sin pestaña (no ocurre en H3). */
  tabId: number | null;
  frameId?: number | null;
  now?: number;
  /** Espera máxima antes de rendirse (por defecto, el plazo de conexión de 60 s). */
  timeoutMs?: number;
  storage?: StorageLocalLike | null;
  deps?: ConnectPlatformDeps;
}

/** Promesa pendiente de una conexión: su resolutor se dispara con `CONNECT_RESPONSE`. */
export const awaitConnectResolution = (
  requestId: string,
): { promise: Promise<ConnectResolution>; settle: (resolution: ConnectResolution) => void } => {
  let settled = false;
  let pendingResolve: ((resolution: ConnectResolution) => void) | null = null;
  const promise = new Promise<ConnectResolution>((resolve) => {
    pendingResolve = resolve;
  });
  const settle = (resolution: ConnectResolution): void => {
    if (settled) {
      return;
    }
    settled = true;
    const entry = pendingConnects.get(requestId);
    if (entry !== undefined && entry.safetyTimer !== null) {
      try {
        clearTimeout(entry.safetyTimer);
      } catch {
        // Un temporizador ya disparado no impide resolver la promesa.
      }
    }
    if (pendingResolve !== null) {
      pendingResolve(resolution);
    }
  };
  return { promise, settle };
};

/** Registra la promesa pendiente (con su red de seguridad de proceso). */
export const registerPendingConnect = (
  requestId: string,
  origin: string,
  resolve: (resolution: ConnectResolution) => void,
  timeoutMs: number,
): void => {
  const previous = pendingConnects.get(requestId);
  if (previous !== undefined && previous.safetyTimer !== null) {
    clearTimeout(previous.safetyTimer);
  }
  const safetyTimer = setTimeout(() => {
    pendingConnects.delete(requestId);
    resolve({ success: false, error: userRejectedError({ reason: 'connect-timeout' }) });
  }, timeoutMs);
  pendingConnects.set(requestId, { requestId, origin, resolve, safetyTimer });
};

/** ¿Hay una promesa viva para ese `requestId` en este proceso? */
export const hasPendingResolver = (requestId: string): boolean => pendingConnects.has(requestId);

/** Descarta la solicitud pendiente (al resolverse, al vencer o al rechazarse). */
export const forgetPendingConnect = (requestId: string): void => {
  const entry = pendingConnects.get(requestId);
  if (entry !== undefined && entry.safetyTimer !== null) {
    try {
      clearTimeout(entry.safetyTimer);
    } catch {
      // Temporizador ya disparado: nada que cancelar.
    }
  }
  pendingConnects.delete(requestId);
};

/**
 * RESUELVE la promesa de una conexión pendiente con la decisión del usuario y descarta su
 * registro. Es el único punto que cierra el ciclo de `eth_requestAccounts`: la resolución se
 * entrega al resolutor registrado (no basta con borrar la entrada, porque entonces la promesa
 * del frame de origen quedaría colgada hasta la red de seguridad del temporizador).
 *
 * Devuelve `false` cuando la solicitud ya no estaba viva en este proceso (el SW se suspendió y
 * la sesión la reconstruye `truekeate_connected_sites` en el siguiente uso).
 */
export const settlePendingConnect = (
  requestId: string,
  resolution: ConnectResolution,
): boolean => {
  const entry = pendingConnects.get(requestId);
  if (entry === undefined) {
    return false;
  }
  if (entry.safetyTimer !== null) {
    try {
      clearTimeout(entry.safetyTimer);
    } catch {
      // Temporizador ya disparado: nada que cancelar.
    }
  }
  pendingConnects.delete(requestId);
  entry.resolve(resolution);
  return true;
};

/** Vacía por completo el registro pendiente (pruebas y reconciliación). */
export const clearPendingConnects = (): void => {
  for (const entry of pendingConnects.values()) {
    if (entry.safetyTimer !== null) {
      clearTimeout(entry.safetyTimer);
    }
  }
  pendingConnects.clear();
};

/**
 * Descarta las solicitudes pendientes VIVAS de un origen. Lo usa la revocación desde el popup
 * (tarea 3.11): tras revocar, una elección tardía en `connect.html` ya no puede conceder sesión.
 */
export const forgetPendingConnectsForOrigin = (origin: string): number => {
  const key = normalizeOrigin(origin);
  let forgotten = 0;
  for (const [requestId, entry] of [...pendingConnects.entries()]) {
    if (entry.origin !== key) {
      continue;
    }
    if (entry.safetyTimer !== null) {
      clearTimeout(entry.safetyTimer);
    }
    pendingConnects.delete(requestId);
    forgotten += 1;
  }
  return forgotten;
};

/**
 * Abre la ventana de conexión (420×650) y devuelve la promesa que resolverá la elección del
 * usuario. Persiste `truekeate_connect_request[requestId]` ANTES de abrir la ventana, de modo que
 * `connect.html` pueda pintar origen y cuentas aunque el SW se suspenda justo después.
 */
export const openConnectWindow = async (
  options: OpenConnectWindowOptions,
): Promise<ConnectResolution> => {
  const deps = options.deps ?? defaultConnectPlatformDeps();
  const storage = options.storage ?? undefined;
  const now = options.now ?? Date.now();
  const key = normalizeOrigin(options.origin) ?? options.origin;
  const requestId = newRequestId();

  // Máximo 1 `pending` por origen (§2.9): una solicitud viva se resuelve por su ventana; abrir
  // otra dejaría dos ventanas compitiendo por el mismo origen.
  const live = await readConnectRequests(storage);
  if (hasPendingConnectFor(live, key, now)) {
    return { success: false, error: tooManyPendingRequestsError({ reason: 'connect-pending' }) };
  }

  // Red activa y cuentas de la cartera: es lo que la ventana necesita para pintarse sin tocar el
  // almacén por su cuenta (RNF-14). El orden de las cuentas es el de `truekeate_accounts`.
  const snapshot = await getAccountsSnapshot(storage);
  const active = await seedDefaultNetwork(storage);
  const accounts = snapshot.accounts.map((view) => view.address);
  const currentIndex = Math.max(
    0,
    snapshot.accounts.findIndex((view) => view.isCurrent),
  );

  const request: ConnectRequest = {
    requestId,
    origin: key,
    accounts,
    currentAccountIndex: currentIndex,
    chainId: active.chainId as ConnectRequest['chainId'],
    tabId: options.tabId ?? -1,
    frameId: options.frameId ?? 0,
    createdAt: now,
    expiresAt: now + CONNECT_TIMEOUT_MS,
    status: 'pending',
  };
  const stored = await readConnectRequests(storage);
  await writeStorage(
    { [STORAGE_KEYS.connectRequest]: { ...stored, [requestId]: request } },
    storage,
  );

  const resolution = awaitConnectResolution(requestId);
  registerPendingConnect(
    requestId,
    key,
    resolution.settle,
    options.timeoutMs ?? CONNECT_TIMEOUT_MS,
  );

  if (deps.windows !== null) {
    const url = `${deps.getUrl(EXTENSION_ROUTE_CONNECT)}?requestId=${encodeURIComponent(requestId)}&origin=${encodeURIComponent(key)}`;
    try {
      await deps.windows.create({
        url,
        type: 'popup',
        width: CONNECT_WINDOW_WIDTH,
        height: CONNECT_WINDOW_HEIGHT,
        focused: true,
      });
    } catch (error) {
      // Sin ventana no hay elección posible: se rechaza con `4001` y NO se persiste sesión.
      console.warn('[truekeate] no se pudo abrir connect.html', error);
      forgetPendingConnect(requestId);
      return { success: false, error: userRejectedError({ reason: 'connect-window-failed' }) };
    }
  }
  return resolution.promise;
};

/**
 * Aplica la respuesta de `connect.html` (`CONNECT_RESPONSE`).
 *
 * - `success: true` con `account` válida → persiste la sesión (`truekeate_connected_sites`) y
 *   resuelve `['<cuenta elegida>']`.
 * - `success: false`, sin cuenta o con `requestId` desconocido o vencido → `4001` y **ninguna**
 *   sesión persistida (§3.2: «Rechazo o cierre de connect.html: `4001` y NINGUNA sesion
 *   persistida»).
 */
export const applyConnectResponse = async (
  response: unknown,
  options: { storage?: StorageLocalLike | null; now?: number; ttlMs?: number } = {},
): Promise<ConnectResolution> => {
  const record = typeof response === 'object' && response !== null
    ? (response as Record<string, unknown>)
    : {};
  const requestId = typeof record.requestId === 'string' ? record.requestId : '';
  const storage = options.storage ?? undefined;
  const now = options.now ?? Date.now();
  const requests = await readConnectRequests(storage);
  const request = requests[requestId];

  if (requestId.length === 0 || request === undefined) {
    // Solicitud desconocida: se responde `4001` sin tocar el almacén ni crear sesión.
    return { success: false, error: userRejectedError({ reason: 'unknown-connect-request' }) };
  }

  const clearRequest = async (): Promise<void> => {
    const next = { ...requests };
    delete next[requestId];
    await writeStorage({ [STORAGE_KEYS.connectRequest]: next }, storage);
  };

  if (request.status !== 'pending' || request.expiresAt <= now) {
    await clearRequest();
    const expired: ConnectResolution = {
      success: false,
      error:
        request.status === 'pending' && request.expiresAt <= now
          ? userRejectedError({ reason: 'connect-expired' })
          : userRejectedError({ reason: 'connect-already-resolved' }),
    };
    settlePendingConnect(requestId, expired);
    return expired;
  }

  if (record.success !== true) {
    await clearRequest();
    const cancelled: ConnectResolution = {
      success: false,
      error: userRejectedError({ reason: 'connect-cancelled' }),
    };
    settlePendingConnect(requestId, cancelled);
    return cancelled;
  }

  const account = typeof record.account === 'string' ? (record.account as Address) : null;
  const known = account !== null && request.accounts.some((entry) => entry === account);
  if (account === null || !known) {
    // Cuenta fuera de la lista ofrecida: petición manipulada → `4100`, sin sesión.
    await clearRequest();
    const unknownAccount: ConnectResolution = {
      success: false,
      error: unauthorizedOriginError({ reason: 'connect-unknown-account' }),
    };
    settlePendingConnect(requestId, unknownAccount);
    return unknownAccount;
  }

  /**
   * `accountIndex` es la POSICIÓN de la cuenta elegida dentro de `request.accounts` (§2.9). La
   * ventana lo envía calculado sobre la lista que le entregó el SW (`wallet_getConnectRequest`,
   * v1.7), pero aquí NO se confía en él: si el índice no apunta a la MISMA cuenta, se recalcula
   * con `indexOf(account)`, que es el respaldo canónico. Así una respuesta manipulada no puede
   * hacer que la dApp reciba un índice que no corresponde a la cuenta autorizada.
   */
  const sentIndex = record.accountIndex;
  const accountIndex =
    typeof sentIndex === 'number' && request.accounts[sentIndex] === account
      ? sentIndex
      : request.accounts.indexOf(account);
  const session = await connectSession({
    origin: request.origin,
    account,
    chainId: request.chainId,
    tabId: request.tabId >= 0 ? request.tabId : null,
    now,
    ttlMs: options.ttlMs ?? SESSION_TTL_MS,
    storage,
  });
  await clearRequest();
  const resolution: ConnectResolution =
    session === null
      ? { success: false, error: userRejectedError({ reason: 'connect-origin-invalid' }) }
      : { success: true, account, accountIndex };
  settlePendingConnect(requestId, resolution);
  return resolution;
};

/** ¿Es `requestId` una respuesta de conexión dirigida a una solicitud abierta? */
export const connectRequestOrigin = async (
  requestId: string,
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<string | null> => {
  const requests = await readConnectRequests(storage);
  return requests[requestId]?.origin ?? null;
};

/** Origen lógico de los contextos de la extensión, por comodidad de los llamadores. */
export const CONNECT_EXTENSION_ORIGIN = EXTENSION_ORIGIN;

/** Opciones de la entrega de una solicitud de conexión a `connect.html`. */
export interface ReadConnectRequestViewOptions {
  now?: number;
  storage?: StorageLocalLike | null;
}

/**
 * Entrega a `connect.html` la solicitud `pending` que debe resolver, en la forma
 * `ConnectRequestView` del contrato (§5.1.1 v1.7): **el SW es quien publica la solicitud
 * completa** —origen normalizado, `accounts` en su orden canónico, la preselección, la red y el
 * vencimiento— y la ventana no lee `truekeate_connect_request` por su cuenta (RNF-14).
 *
 * Devuelve `null` —y el llamador responde `4001`— cuando la solicitud no existe, ya se resolvió
 * (`status !== 'pending'`) o ha vencido (`expiresAt <= now`). La comprobación del vencimiento es
 * PEREZOSA, igual que en `applyConnectResponse`, y esta lectura **no** escribe nada.
 */
export const readConnectRequestView = async (
  requestId: string,
  options: ReadConnectRequestViewOptions = {},
): Promise<ConnectRequestView | null> => {
  const key = requestId.trim();
  if (key.length === 0) {
    return null;
  }
  const requests = await readConnectRequests(options.storage ?? undefined);
  const request = requests[key];
  if (request === undefined) {
    return null;
  }
  const now = options.now ?? Date.now();
  if (request.status !== 'pending' || request.expiresAt <= now) {
    return null;
  }
  return {
    requestId: request.requestId,
    origin: normalizeOrigin(request.origin) ?? request.origin,
    accounts: [...request.accounts],
    currentAccountIndex: request.currentAccountIndex,
    chainId: request.chainId,
    expiresAt: request.expiresAt,
  };
};
