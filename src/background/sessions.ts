/**
 * M26 — `src/background/sessions.ts`
 * Sesiones de dApp por origen sobre `truekeate_connected_sites` (H3, tareas 3.7 y 3.11-parte SW).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §3.2 («Conexión de dApps y sesiones por origen»): clave canónica
 *   normalizada, `expiresAt = lastUsedAt + truekeate_settings.sessionTtlMs` (86 400 000 ms = 24 h)
 *   con **renovación en cada uso**, borrado al vencer (sin error), aislamiento de origen y
 *   revocación con `accountsChanged []`.
 * - `diccionario_datos.md` §2.7 (`DappSession`), §2.9 (`ConnectRequest`) y DEC-31 (24 h
 *   renovables).
 * - `plan_desarrollo.md` §3.3.5 tareas 3.7 y 3.10 (parte SW) y §3.3.6 `CA-RF-17`/`CA-RF-25`.
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **Sin sesión para un origen → `[]` y NINGUNA ventana**: lo decide `eth_accounts`, que solo
 *    consulta aquí (la ventana la abre `eth_requestAccounts`).
 * 2. **Renovación**: leer una sesión vigente refresca `lastUsedAt` y recalcula
 *    `expiresAt = lastUsedAt + SESSION_TTL_MS`; tras 24 h sin uso, la entrada se ELIMINA y
 *    `eth_accounts` vuelve a `[]` **sin error** (es un cambio de estado silencioso).
 * 3. **Revocación (3.11, parte SW)**: `revokeSession` elimina el origen del mapa y devuelve si lo
 *    hizo; **no** crea ninguna entrada en la cola de aprobaciones (la revocación desde el popup no
 *    es una `PendingRequest`).
 * 4. **Una sola implementación del almacén**: todo pasa por `readStorage`/`writeStorage` (M33).
 */

import type {
  Address,
  ChainIdHex,
  ConnectedSiteView,
  DappSession,
  DappSessionsByOrigin,
} from '../shared/types';
import { SESSION_TTL_MS } from '../shared/constants';
import {
  STORAGE_KEYS,
  readStorage,
  writeStorage,
  type StorageLocalLike,
  type StorageSnapshot,
} from './state/schema';
import { createSerialLock } from './state/serialLock';
import { normalizeOrigin } from './security/senderGuard';

/**
 * `sessionsLock` — cerrojo FIFO de la RMW de `truekeate_connected_sites` (fleco 4 de la fase 4,
 * patrón `rmwLock` de `approvals/queue.ts`).
 *
 * DEFECTO MEDIDO: todas las mutaciones de este módulo hacían `readStorage` → mutar → `writeStorage`
 * **sin cerrojo**, de modo que dos mutaciones solapadas (dos `touchSession` del mismo origen, o una
 * revocación mientras otra pestaña renueva) partían de la MISMA instantánea y la segunda escritura
 * pisaba a la primera: una renovación, una pestaña recordada o una revocación se perdían.
 *
 * Es un cerrojo VOLÁTIL y reconstruible (no es fuente de verdad, igual que el de la cola): la
 * verdad sigue en el almacén, y lo único que garantiza es que la escritura se calcula sobre la
 * lectura inmediatamente anterior.
 */
export const sessionsLock = createSerialLock();

/** Ejecuta `task` bajo `sessionsLock`: TODA mutación del mapa de sesiones pasa por aquí. */
export const withSessionsLock = <T>(task: () => Promise<T>): Promise<T> => sessionsLock.run(task);

/** Mapa completo `truekeate_connected_sites`. */
export type ConnectedSitesMap = DappSessionsByOrigin;

/** ¿Es un objeto plano utilizable como mapa de sesiones? */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Proyecta una entrada del mapa descartando lo malformado; `null` si no es utilizable. */
const asSession = (originKey: string, value: unknown): DappSession | null => {
  if (!isRecord(value) || typeof value.account !== 'string') {
    return null;
  }
  const expiresAt = value.expiresAt;
  return {
    origin: typeof value.origin === 'string' && value.origin.length > 0 ? value.origin : originKey,
    account: value.account as Address,
    chainId: (typeof value.chainId === 'string' ? value.chainId : '0x0') as ChainIdHex,
    tabIds: Array.isArray(value.tabIds)
      ? value.tabIds.filter((tabId): tabId is number => typeof tabId === 'number')
      : [],
    connectedAt: typeof value.connectedAt === 'number' ? value.connectedAt : 0,
    lastUsedAt: typeof value.lastUsedAt === 'number' ? value.lastUsedAt : 0,
    expiresAt: typeof expiresAt === 'number' ? expiresAt : null,
    connected: value.connected !== false,
  };
};

/** Proyecta `truekeate_connected_sites` sin confiar en la forma almacenada (función pura). */
export const readSessionsFromSnapshot = (snapshot: StorageSnapshot): ConnectedSitesMap => {
  const raw: unknown = snapshot[STORAGE_KEYS.connectedSites];
  if (!isRecord(raw)) {
    return {};
  }
  const sessions: ConnectedSitesMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const session = asSession(key, value);
    if (session !== null) {
      sessions[key] = session;
    }
  }
  return sessions;
};

/** Lee el mapa de sesiones persistido. */
export const readSessions = async (
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<ConnectedSitesMap> =>
  readSessionsFromSnapshot(await readStorage([STORAGE_KEYS.connectedSites], storage));

/**
 * ¿Sigue vigente la sesión? Vigente = existe, no está marcada como desconectada y no ha vencido.
 * `expiresAt === null` significa «sin caducidad» (§2.7), de modo que la entrada vale.
 */
export const isSessionValid = (
  session: DappSession | null | undefined,
  now: number = Date.now(),
): boolean => {
  if (session === null || session === undefined || session.connected === false) {
    return false;
  }
  return session.expiresAt === null || session.expiresAt > now;
};

/** Instante de caducidad de una sesión usada en `lastUsedAt`: `lastUsedAt + SESSION_TTL_MS`. */
export const expiresAtFrom = (lastUsedAt: number, ttlMs: number = SESSION_TTL_MS): number =>
  lastUsedAt + ttlMs;

/**
 * Lee la sesión **vigente** de un origen y, si existe, la RENUEVA: actualiza `lastUsedAt` a `now`
 * y recalcula `expiresAt = lastUsedAt + ttlMs` (DEC-31: 24 h renovables en cada uso).
 *
 * Si la entrada existe pero ha vencido, se ELIMINA del mapa y la función devuelve `null` (el
 * llamador responde `[]` sin error). Devuelve también `persisted` para que el router sepa si hubo
 * que escribir; el almacén NUNCA se toca cuando no hay nada que renovar ni que purgar.
 */
export interface TouchedSession {
  session: DappSession | null;
  /** `true` cuando el mapa cambió (renovación o purga) y se escribió. */
  persisted: boolean;
}

/** Renueva la sesión (y la persiste) o la purga si venció. RMW serializado con `sessionsLock`. */
export const touchSession = async (
  origin: string,
  options: { now?: number; ttlMs?: number; storage?: StorageLocalLike | null; tabId?: number | null } = {},
): Promise<TouchedSession> => {
  const key = normalizeOrigin(origin);
  if (key === null) {
    return { session: null, persisted: false };
  }
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const storage = options.storage ?? undefined;
  const tabId = options.tabId ?? null;
  return withSessionsLock(async () => {
    const sessions = await readSessions(storage);
    const current = sessions[key];

    if (current === undefined) {
      return { session: null, persisted: false };
    }
    if (!isSessionValid(current, now)) {
      // Vencida: se elimina (el origen vuelve a necesitar `eth_requestAccounts`) y NO se emite error.
      const next = { ...sessions };
      delete next[key];
      await writeStorage({ [STORAGE_KEYS.connectedSites]: next }, storage);
      return { session: null, persisted: true };
    }

    const tabIds =
      tabId === null || current.tabIds.includes(tabId)
        ? current.tabIds
        : [...current.tabIds, tabId];
    const renewed: DappSession = {
      ...current,
      tabIds,
      lastUsedAt: now,
      expiresAt: expiresAtFrom(now, ttlMs),
      connected: true,
    };
    await writeStorage(
      { [STORAGE_KEYS.connectedSites]: { ...sessions, [key]: renewed } },
      storage,
    );
    return { session: renewed, persisted: true };
  });
};

/**
 * Cuenta autorizada de un origen **sin renovar** la sesión (lectura pura).
 * Devuelve `null` si no hay sesión vigente. Se usa en el despacho para decidir sin escribir.
 */
export const currentSessionFor = (
  sessions: ConnectedSitesMap,
  origin: string,
  now: number = Date.now(),
): DappSession | null => {
  const key = normalizeOrigin(origin);
  if (key === null) {
    return null;
  }
  const session = sessions[key] ?? null;
  return isSessionValid(session, now) ? session : null;
};

/** Dirección autorizada de un origen, o `null` (no renueva: es una consulta). */
export const authorizedAccountFor = (
  sessions: ConnectedSitesMap,
  origin: string,
  now: number = Date.now(),
): Address | null => currentSessionFor(sessions, origin, now)?.account ?? null;

/** Opciones de la lista de sesiones para la UI (`wallet_getState.connectedSites`). */
export interface ListConnectedSitesOptions {
  now?: number;
  storage?: StorageLocalLike | null;
}

/**
 * Lista las sesiones de `truekeate_connected_sites` en la forma canónica de la UI
 * (`ConnectedSiteView`, §5.1.1 v1.7): **lectura pura**, sin purgar nada y **sin secretos**.
 *
 * - El **origen se normaliza** siempre (minúsculas, sin barra final): es la clave canónica de
 *   §2.7 y la que el popup envía a `wallet_revokePermissions` al revocar.
 * - `current` marca la sesión VIGENTE (`isSessionValid`); una entrada vencida se entrega con
 *   `current: false` para que la UI pueda mostrarla como vencida aunque su purga sea perezosa. La
 *   lectura NO escribe: purgar en una consulta de UI sería un efecto colateral inesperado.
 * - Orden determinista por `origin` ascendente (la UI y las pruebas no dependen del orden del
 *   mapa persistido).
 * - No se publica `tabIds` (dato interno de propagación de eventos) ni ningún material secreto.
 */
export const listConnectedSites = async (
  options: ListConnectedSitesOptions = {},
): Promise<ConnectedSiteView[]> => {
  const sessions = await readSessions(options.storage ?? undefined);
  const now = options.now ?? Date.now();
  const views: ConnectedSiteView[] = [];
  for (const [key, session] of Object.entries(sessions)) {
    views.push({
      origin: normalizeOrigin(session.origin) ?? normalizeOrigin(key) ?? key,
      account: session.account,
      chainId: session.chainId,
      connectedAt: session.connectedAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      current: isSessionValid(session, now),
    });
  }
  return views.sort((left, right) => left.origin.localeCompare(right.origin));
};

/** Opciones de `connectSession`. */
export interface ConnectSessionOptions {
  origin: string;
  account: Address;
  chainId: ChainIdHex;
  tabId?: number | null;
  now?: number;
  ttlMs?: number;
  storage?: StorageLocalLike | null;
}

/** Sesión recién creada o ampliada (lo que el SW devuelve a `eth_requestAccounts`). */
export interface ConnectSessionResult {
  origin: string;
  session: DappSession;
  /** `true` cuando el origen NO tenía sesión vigente (es una conexión NUEVA). */
  isNewConnection: boolean;
}

/**
 * Persiste la sesión del origen tras la elección del usuario en `connect.html` (§3.2 paso
 * `CONNECT_RESPONSE success`). Se escribe `truekeate_connected_sites[origen]` con `account`,
 * `chainId`, `connectedAt`, `lastUsedAt` y `expiresAt = lastUsedAt + ttlMs`.
 *
 * Es la ÚNICA vía por la que un origen consigue sesión: `eth_accounts` nunca la crea.
 */
export const connectSession = async (
  options: ConnectSessionOptions,
): Promise<ConnectSessionResult | null> => {
  const key = normalizeOrigin(options.origin);
  if (key === null) {
    return null;
  }
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const storage = options.storage ?? undefined;
  const tabId = options.tabId ?? null;
  return withSessionsLock(async () => {
    const sessions = await readSessions(storage);
    const previous = sessions[key];
    const isNewConnection = !isSessionValid(previous, now);
    const tabIds = tabId === null ? [] : [tabId];
    const session: DappSession = {
      origin: key,
      account: options.account,
      chainId: options.chainId,
      tabIds,
      connectedAt: isNewConnection ? now : (previous?.connectedAt ?? now),
      lastUsedAt: now,
      expiresAt: expiresAtFrom(now, ttlMs),
      connected: true,
    };
    await writeStorage({ [STORAGE_KEYS.connectedSites]: { ...sessions, [key]: session } }, storage);
    return { origin: key, session, isNewConnection };
  });
};

/** Resultado de una revocación. */
export interface RevokeSessionResult {
  origin: string;
  /** `true` cuando la entrada existía y se eliminó. */
  revoked: boolean;
  /** Pestañas que tenían registradas la sesión (destino del `accountsChanged []`). */
  tabIds: number[];
}

/**
 * **Revoca la sesión de un origen** (H3, tarea 3.11 parte SW): elimina `origen` de
 * `truekeate_connected_sites` y devuelve las pestañas asociadas para que el llamador emita
 * `accountsChanged []` a ese origen. Un `eth_accounts` posterior devuelve `[]`.
 *
 * NO crea ninguna entrada en la cola de aprobaciones (el popup es un contexto de la extensión:
 * `CA-RF-26`). Es idempotente: revocar dos veces la misma clave no falla.
 */
export const revokeSession = async (
  origin: unknown,
  options: { storage?: StorageLocalLike | null; tabId?: number | null } = {},
): Promise<RevokeSessionResult | null> => {
  const key = normalizeOrigin(typeof origin === 'string' ? origin : undefined);
  if (key === null) {
    return null;
  }
  const storage = options.storage ?? undefined;
  return withSessionsLock(async () => {
    const sessions = await readSessions(storage);
    const current = sessions[key];
    if (current === undefined) {
      return { origin: key, revoked: false, tabIds: [] };
    }
    const next = { ...sessions };
    delete next[key];
    await writeStorage({ [STORAGE_KEYS.connectedSites]: next }, storage);
    const tabIds = [...current.tabIds];
    if (options.tabId !== undefined && options.tabId !== null && !tabIds.includes(options.tabId)) {
      tabIds.push(options.tabId);
    }
    return { origin: key, revoked: true, tabIds };
  });
};

/**
 * Registra la pestaña que ha usado la sesión (para poder emitir `accountsChanged` al revocar).
 * Silencioso por diseño: si el origen no tiene sesión vigente, no escribe nada.
 */
export const rememberTab = async (
  origin: string,
  tabId: number | null,
  options: { storage?: StorageLocalLike | null } = {},
): Promise<void> => {
  if (tabId === null) {
    return;
  }
  const key = normalizeOrigin(origin);
  if (key === null) {
    return;
  }
  const storage = options.storage ?? undefined;
  return withSessionsLock(async () => {
    const sessions = await readSessions(storage);
    const current = sessions[key];
    if (current === undefined || current.tabIds.includes(tabId)) {
      return;
    }
    await writeStorage(
      {
        [STORAGE_KEYS.connectedSites]: {
          ...sessions,
          [key]: { ...current, tabIds: [...current.tabIds, tabId] },
        },
      },
      storage,
    );
  });
};

// ---------------------------------------------------------------------------
// Cambio de la cuenta activa desde el popup (D-H3-A / D-H3-B)
// ---------------------------------------------------------------------------

/** Resumen observable de la propagación de la cuenta activa a las sesiones vigentes. */
export interface ActiveAccountSync {
  /** Orígenes cuya cuenta compartida CAMBIÓ (sesiones vigentes con otra cuenta). */
  origins: string[];
  /** Pestañas que deben recibir `accountsChanged`: unión de `tabIds` de esas sesiones. */
  tabIds: number[];
}

/**
 * **Propaga la cuenta activa a las sesiones VIGENTES** (H3, cierre de `CA-RF-15`; decisión
 * `D-H3-B` opción (a), la de MetaMask).
 *
 * Semántica fijada: la sesión por origen recuerda la cuenta **autorizada** al conectar y, mientras
 * siga vigente, esa cuenta es la cuenta ACTIVA del popup. Por eso, cuando el usuario cambia de
 * cuenta activa, `truekeate_connected_sites[origen].account` se actualiza en cada sesión vigente y
 * el SW emite `accountsChanged` con la cuenta nueva a las pestañas conectadas de esos orígenes
 * (`CA-RF-15` / `CA-RF-24`). Un `eth_accounts` posterior devuelve la cuenta nueva, que es lo que
 * evita que la dApp quede con una caché obsoleta.
 *
 * Reglas:
 * 1. **Solo sesiones VIGENTES**: una entrada vencida o `connected: false` no se toca (§3.2 regla
 *    3) y su purga sigue siendo perezosa.
 * 2. **Solo lo que cambia**: una sesión que ya comparte la cuenta nueva no se reescribe y no
 *    genera evento; si ninguna cambia, NO se escribe en el almacén (`origins` y `tabIds` vacíos).
 * 3. **Sin tocar los plazos**: cambiar de cuenta no es un «uso» de la dApp, así que `lastUsedAt` y
 *    `expiresAt` se conservan tal cual (RF-25).
 * 4. **Ninguna dirección a orígenes ajenos**: solo se devuelven los `tabIds` de las sesiones
 *    afectadas. Nunca se usa «todas las pestañas» con una cuenta dentro: eso publicaría la
 *    dirección a orígenes sin sesión (RNF-11). Si una sesión no tiene `tabIds` registrados, no hay
 *    destinatario identificable; la dApp se pondrá al día en su siguiente `eth_accounts`.
 */
export const applyActiveAccountToSessions = async (
  account: Address,
  options: { now?: number; storage?: StorageLocalLike | null } = {},
): Promise<ActiveAccountSync> => {
  const now = options.now ?? Date.now();
  const storage = options.storage ?? undefined;
  return withSessionsLock(async () => {
    const sessions = await readSessions(storage);
    const next: ConnectedSitesMap = { ...sessions };
    const origins: string[] = [];
    const tabIds = new Set<number>();

    for (const [key, session] of Object.entries(sessions)) {
      if (!isSessionValid(session, now) || session.account === account) {
        continue;
      }
      next[key] = { ...session, account };
      origins.push(normalizeOrigin(session.origin) ?? normalizeOrigin(key) ?? key);
      for (const tabId of session.tabIds) {
        tabIds.add(tabId);
      }
    }

    if (origins.length === 0) {
      return { origins: [], tabIds: [] };
    }
    await writeStorage({ [STORAGE_KEYS.connectedSites]: next }, storage);
    return { origins, tabIds: [...tabIds] };
  });
};
