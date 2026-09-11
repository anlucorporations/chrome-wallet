/**
 * M33 — `src/background/state/schema.ts`
 * Versión de esquema y claves canónicas de `chrome.storage.local`.
 *
 * Regla de nomenclatura (ACU-25): TODA clave persistida lleva el prefijo `truekeate_`. Este
 * módulo es su fuente única: ningún otro fichero escribe una cadena `truekeate_` a mano.
 *
 * Prohibiciones que este módulo hace cumplir (ADT-26 / D-S, ver `documento_tecnico.md` §3.7):
 * - nombres cortos del tipo `settings.*` como si fueran almacenes;
 * - el prefijo heredado del intento previo (DEC-09), que no es válido;
 * - el almacén sincronizado del navegador: nunca se replica nada fuera de `local`;
 * - el almacén volátil del documento: no existe en un Service Worker.
 *
 * Ampliación de H2 (tareas 2.11 y 2.12): además de las claves canónicas, este módulo expone el
 * **acceso tipado** al almacén (una sola implementación de `chrome.storage.local` para todo el
 * dominio), el **orden de comprobación** del reset y `resetWallet` con la exclusión de
 * `truekeate_logs` (RF-32 / ADR-11, `documento_tecnico.md` §3.9).
 */

import type { Eip1193Error, LogEventName } from '../../shared/types';
import { internalError, resetBlockedError } from '../rpc/errors';

/**
 * Versión del esquema de datos. El corpus vigente es el esquema **v1.4** del diccionario
 * (`documento_tecnico.md` §4.3: base v1.2 → v1.3 → v1.4). Se declarará dentro de
 * `truekeate_settings` al implementar M29 (H2); el rechazo de claves no canónicas y la
 * migración v1.2 → v1.4 son de M34.
 */
export const SCHEMA_VERSION = '1.4' as const;

/**
 * Clave de la versión de esquema. Documental: la versión se declarará DENTRO de
 * `truekeate_settings` al implementar M29 (H2), no como clave propia; se conserva aquí
 * con su prefijo canónico para las pruebas de migración de M34.
 */
export const SCHEMA_VERSION_KEY = 'truekeate_schema_version' as const;

/** Nombres canónicos de las 14 claves de `chrome.storage.local`. */
export const STORAGE_KEYS = {
  /** Frase BIP-39 de 12 palabras (puede no existir si solo hay cuentas importadas). */
  mnemonic: 'truekeate_mnemonic',
  /** `string[]` de direcciones; el índice del array ES el índice BIP-44. */
  accounts: 'truekeate_accounts',
  /** `ImportedAccount[]` (dirección, clave privada, etiqueta, alta y visibilidad). */
  importedAccounts: 'truekeate_imported_accounts',
  /** `AccountRef` activa (`idx:<n>` | `imp:<address>`). */
  currentAccount: 'truekeate_current_account',
  /** `ChainIdHex` activo; inicial `0x7a69`. */
  chainId: 'truekeate_chain_id',
  /** Mapa `chainId → StoredNetwork`; default único Anvil Local. */
  networks: 'truekeate_networks',
  /** `Record<origen normalizado, DappSession>` con TTL de 24 h renovables. */
  connectedSites: 'truekeate_connected_sites',
  /** `Record<approvalId, PendingRequest>`: la cola persistida. */
  pendingRequests: 'truekeate_pending_requests',
  /** `Record<requestId, ConnectRequest>`: máximo 1 `pending` por origen. */
  connectRequest: 'truekeate_connect_request',
  /** Ventana ÚNICA de confirmación (`ApprovalWindow`, P-21). */
  approvalWindow: 'truekeate_approval_window',
  /** `Record<Address, InflightTx>`: marca de «transacción en vuelo» por cuenta. */
  inflightTx: 'truekeate_inflight_tx',
  /** `Record<origin, RateWindow>`: ventana de tasa persistida (ADT-24 / D-Q). */
  rateWindows: 'truekeate_rate_windows',
  /** `LogEntry[]` con retención FIFO; EXCLUIDA de `resetWallet` (RF-32). */
  logs: 'truekeate_logs',
  /** `TruekeateSettings`: defaults, etiquetas y aceptación de avisos. */
  settings: 'truekeate_settings',
} as const;

/** Nombre canónico de una clave de almacén. */
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Las 14 claves canónicas como lista, en orden de declaración. */
export const CANONICAL_STORAGE_KEYS: readonly StorageKey[] = Object.values(STORAGE_KEYS);

/** Claves que `resetWallet` NO borra (RF-32: los logs sobreviven al reset). */
export const STORAGE_KEYS_PRESERVED_ON_RESET: readonly StorageKey[] = [STORAGE_KEYS.logs];

/** Prefijo obligatorio de toda clave persistida. */
export const STORAGE_KEY_PREFIX = 'truekeate_' as const;

/** ¿Lleva la clave el prefijo `truekeate_`? */
export const hasCanonicalPrefix = (key: string): boolean => key.startsWith(STORAGE_KEY_PREFIX);

/**
 * ¿Es `key` una de las claves canónicas declaradas? Una clave sin prefijo, o con prefijo
 * pero no declarada, se RECHAZA (M34: rechazo de claves no canónicas).
 */
export const isCanonicalStorageKey = (key: string): key is StorageKey =>
  (CANONICAL_STORAGE_KEYS as readonly string[]).includes(key);

/** Devuelve la clave canónica o lanza si no lo es (uso interno del SW). */
export const assertCanonicalStorageKey = (key: string): StorageKey => {
  if (!isCanonicalStorageKey(key)) {
    throw new Error(
      `[truekeate] clave de almacén no canónica: «${key}». Todas las claves usan el prefijo ${STORAGE_KEY_PREFIX} y están declaradas en STORAGE_KEYS.`,
    );
  }
  return key;
};

/**
 * Problema de nomenclatura de una clave de almacén, como objeto EIP-1193.
 *
 * El diccionario §4.3 no registra una causa propia para «clave no canónica» (es un defecto
 * de implementación, no de uso de la cartera), así que se clasifica como fallo interno
 * `-32603` con su literal y el detalle en `data`. Devuelve `null` si la clave es correcta.
 */
export const canonicalKeyProblem = (
  key: string,
): { code: number; message: string; data: unknown } | null =>
  hasCanonicalPrefix(key) && isCanonicalStorageKey(key)
    ? null
    : {
        code: -32603,
        message: 'Error interno de la cartera.',
        data: { reason: 'non-canonical-key', key, expectedPrefix: STORAGE_KEY_PREFIX },
      };

/** Valores iniciales de las claves cuyo tipo raíz es un mapa o una lista. */
export const STORAGE_DEFAULTS = {
  [STORAGE_KEYS.accounts]: [] as string[],
  [STORAGE_KEYS.importedAccounts]: [],
  [STORAGE_KEYS.networks]: {},
  [STORAGE_KEYS.connectedSites]: {},
  [STORAGE_KEYS.pendingRequests]: {},
  [STORAGE_KEYS.connectRequest]: {},
  [STORAGE_KEYS.approvalWindow]: {
    windowId: null,
    shownApprovalId: null,
    openedAt: null,
    updatedAt: 0,
  },
  [STORAGE_KEYS.inflightTx]: {},
  [STORAGE_KEYS.rateWindows]: {},
  [STORAGE_KEYS.logs]: [],
} as const;

// ---------------------------------------------------------------------------
// Acceso tipado al almacén (una sola implementación para todo el dominio)
// ---------------------------------------------------------------------------

/** Instantánea del almacén: pares clave/valor SIN tipar (los tipos los pone cada módulo). */
export type StorageSnapshot = Record<string, unknown>;

/**
 * Superficie mínima de `chrome.storage.local` que usa el dominio (sin `any`).
 *
 * Se declara **estructuralmente compatible con la API real** (y con su doble de pruebas, que se
 * tipa con `@types/chrome`): los tres métodos admiten las formas de la API (`string`, `string[]`,
 * un mapa de valores por defecto o `null`) y su tipo unificado —las sobrecargas con `callback`
 * devuelven `void`— puede resolverse como `undefined`. El dominio lo asume así: `readStorage`
 * degrada una lectura ausente a instantánea vacía y las escrituras solo miran el resultado de la
 * promesa cuando se `await`-ea.
 */
export interface StorageLocalLike {
  get(keys?: string | string[] | null): Promise<StorageSnapshot> | undefined;
  set(items: StorageSnapshot): Promise<void> | undefined;
  remove(keys: string | string[]): Promise<void> | undefined;
}

/** Devuelve `chrome.storage.local` sin `any`, o `null` si la API no está disponible. */
export const getStorageLocal = (): StorageLocalLike | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const storage: unknown = (chromeNs as { storage?: unknown }).storage;
  if (typeof storage !== 'object' || storage === null) {
    return null;
  }
  const local: unknown = (storage as { local?: unknown }).local;
  if (typeof local !== 'object' || local === null) {
    return null;
  }
  const candidate = local as { get?: unknown; set?: unknown; remove?: unknown };
  if (
    typeof candidate.get !== 'function' ||
    typeof candidate.set !== 'function' ||
    typeof candidate.remove !== 'function'
  ) {
    return null;
  }
  return local as StorageLocalLike;
};

/**
 * Lee las claves pedidas (`null` = todo el almacén). Nunca lanza: un fallo de la API se
 * traduce en una instantánea vacía, porque el arranque del SW no puede romperse por una
 * lectura (el modo de fallo observable de la cuota es de escritura, §2.15).
 */
export const readStorage = async (
  keys: readonly StorageKey[] | null = null,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<StorageSnapshot> => {
  if (storage === null) {
    return {};
  }
  try {
    // La sobrecarga con callback de la API real puede resolver el tipo unificado como
    // `undefined`: una lectura ausente se trata como instantánea vacía.
    return (await storage.get(keys === null ? null : [...keys])) ?? {};
  } catch (error) {
    console.warn('[truekeate] no se pudo leer chrome.storage.local', error);
    return {};
  }
};

/**
 * Escribe un lote aplicando la política de reintento del corpus (`documento_tecnico.md` §3.9):
 * **un** reintento inmediato y, si persiste el fallo, se informa con `false` para que el
 * llamador responda `-32603` (fallo interno) o `-32603 storageQuotaExceeded` (cuota).
 */
export const writeStorage = async (
  items: StorageSnapshot,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<boolean> => {
  if (storage === null) {
    return false;
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await storage.set(items);
      return true;
    } catch (error) {
      if (attempt === 1) {
        console.warn('[truekeate] no se pudo escribir en chrome.storage.local', error);
      }
    }
  }
  return false;
};

/** Elimina claves canónicas. Misma política de reintento que {@link writeStorage}. */
export const removeStorage = async (
  keys: readonly StorageKey[],
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<boolean> => {
  if (storage === null) {
    return false;
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await storage.remove([...keys]);
      return true;
    } catch (error) {
      if (attempt === 1) {
        console.warn('[truekeate] no se pudo eliminar de chrome.storage.local', error);
      }
    }
  }
  return false;
};

/** Claves que `resetWallet` elimina: todas las canónicas menos las preservadas (RF-32). */
export const STORAGE_KEYS_CLEARED_ON_RESET: readonly StorageKey[] = CANONICAL_STORAGE_KEYS.filter(
  (key) => !STORAGE_KEYS_PRESERVED_ON_RESET.includes(key),
);

/** Evento del catálogo (24) que instrumenta el reset; lo escribe M30 en H5, no este módulo. */
export const RESET_WALLET_LOG_EVENT: LogEventName = 'reset_wallet';

// ---------------------------------------------------------------------------
// Guardas y orden de comprobación del reset (R-09b / DEC-46, §3.9)
// ---------------------------------------------------------------------------

/** ¿Es un objeto con entradas (mapa) y no un array ni `null`? */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Paso 1 del orden estricto: entradas con `status === 'pending'` en
 * `truekeate_pending_requests`. En H2 la cola aún no se materializa (H4), así que la
 * comprobación se implementa y se prueba con la cola vacía.
 */
export const countPendingRequests = (pendingRequests: unknown): number => {
  if (!isRecord(pendingRequests)) {
    return 0;
  }
  return Object.values(pendingRequests).filter(
    (entry) => isRecord(entry) && entry.status === 'pending',
  ).length;
};

/**
 * Paso 2 del orden estricto: entradas **vigentes** de `truekeate_inflight_tx`
 * (`expiresAt > now`, TTL de 180 s). Una entrada sin `expiresAt` numérico se considera
 * **no vigente**: no puede bloquear el reset para siempre.
 */
export const countActiveInflightTx = (inflightTx: unknown, now: number): number => {
  if (!isRecord(inflightTx)) {
    return 0;
  }
  return Object.values(inflightTx).filter(
    (entry) => isRecord(entry) && typeof entry.expiresAt === 'number' && entry.expiresAt > now,
  ).length;
};

/** Resultado de las dos guardas de estado del reset. */
export interface ResetGuardCheck {
  /** `true` solo si la cola está vacía Y no hay transacción en vuelo vigente. */
  canProceed: boolean;
  pendingCount: number;
  inflightCount: number;
  /** `-32000 resetBlocked` con el número exacto de pendientes, o `null` si puede proceder. */
  error: Eip1193Error | null;
}

/**
 * Guardas de estado del reset, en el ORDEN estricto de §3.9: primero la cola y después la
 * marca de transacción en vuelo. El contador `<n>` del literal es el número de solicitudes
 * `pending` (el que la UI pinta).
 */
export const checkResetGuards = (
  snapshot: StorageSnapshot,
  now: number = Date.now(),
): ResetGuardCheck => {
  const pendingCount = countPendingRequests(snapshot[STORAGE_KEYS.pendingRequests]);
  const inflightCount = countActiveInflightTx(snapshot[STORAGE_KEYS.inflightTx], now);
  if (pendingCount > 0 || inflightCount > 0) {
    return { canProceed: false, pendingCount, inflightCount, error: resetBlockedError(pendingCount) };
  }
  return { canProceed: true, pendingCount: 0, inflightCount: 0, error: null };
};

// ---------------------------------------------------------------------------
// resetWallet (RF-11 + RF-32, §3.9)
// ---------------------------------------------------------------------------

/** Estado final de la operación de reset. */
export type ResetWalletStatus = 'done' | 'blocked' | 'cancelled' | 'failed';

/** Resultado observable de `resetWallet`. */
export interface ResetWalletOutcome {
  status: ResetWalletStatus;
  /** Claves realmente eliminadas (vacío si no se tocó el almacén). */
  removedKeys: readonly StorageKey[];
  /** Claves que sobreviven al reset (RF-32): hoy, `truekeate_logs`. */
  preservedKeys: readonly StorageKey[];
  pendingCount: number;
  inflightCount: number;
  /** `-32000` (bloqueo) o `-32603` (fallo de escritura); `null` en los demás estados. */
  error: Eip1193Error | null;
  /** Evento que H5 instrumenta; en H2 el reset NO escribe logs de actividad (§3.2.2). */
  logEvent: LogEventName;
}

/** Limpieza de plataforma previa al borrado de claves (alarmas y badge, §3.9 paso 4). */
export interface ResetPlatformCleanup {
  cancelExpiryAlarms?: () => Promise<void>;
  clearBadge?: () => Promise<void>;
}

/** Opciones de `resetWallet`. */
export interface ResetWalletOptions extends ResetPlatformCleanup {
  /**
   * Confirmación destructiva explícita: sin ella el reset queda en `cancelled` y **no se
   * toca ninguna clave** (§3.9 paso 3). El diálogo de la UI es quien la aporta.
   */
  confirm: boolean;
  now?: number;
  /** Instantánea ya leída del almacén (inyectable para las pruebas puras). */
  snapshot?: StorageSnapshot;
  /** Almacén a usar; por defecto, `chrome.storage.local`. */
  storage?: StorageLocalLike | null;
}

/**
 * Ejecuta el reset con el orden de comprobación **estricto** de §3.9:
 *
 * 1. cola `truekeate_pending_requests` sin entradas `pending` → si no, bloqueo `-32000`;
 * 2. sin transacción en vuelo vigente en `truekeate_inflight_tx` → si no, bloqueo `-32000`;
 * 3. confirmación destructiva explícita (`confirm`) → si falta, `cancelled` sin tocar nada;
 * 4. limpieza: alarmas y badge, y borrado de las claves `truekeate_*` **salvo**
 *    `truekeate_logs` (RF-32).
 *
 * Es **idempotente**: repetirlo con el almacén ya limpio vuelve a terminar en `done`. Si la
 * escritura falla tras el reintento del corpus, termina en `failed` con `-32603`.
 *
 * NO escribe en `truekeate_logs`: en H2 la observabilidad de actividad llega en H5 (§3.2.2);
 * el evento a instrumentar se devuelve en `logEvent`.
 */
export const resetWallet = async (options: ResetWalletOptions): Promise<ResetWalletOutcome> => {
  const now = options.now ?? Date.now();
  const storage = options.storage === undefined ? getStorageLocal() : options.storage;
  const snapshot = options.snapshot ?? (await readStorage(null, storage));

  const guards = checkResetGuards(snapshot, now);
  const base = {
    removedKeys: [] as readonly StorageKey[],
    preservedKeys: STORAGE_KEYS_PRESERVED_ON_RESET,
    pendingCount: guards.pendingCount,
    inflightCount: guards.inflightCount,
    logEvent: RESET_WALLET_LOG_EVENT,
  };

  // 1 y 2. Guardas de estado, en orden. Mientras estén activas NO se elimina ninguna clave.
  if (!guards.canProceed) {
    return { ...base, status: 'blocked', error: guards.error };
  }

  // 3. Confirmación destructiva.
  if (!options.confirm) {
    return { ...base, status: 'cancelled', error: null };
  }

  // 4. Limpieza: plataforma primero, almacén después.
  try {
    await options.cancelExpiryAlarms?.();
    await options.clearBadge?.();
  } catch (error) {
    // Un fallo de plataforma no impide borrar el material sensible.
    console.warn('[truekeate] limpieza de plataforma incompleta en el reset', error);
  }

  const removed = await removeStorage(STORAGE_KEYS_CLEARED_ON_RESET, storage);
  if (!removed) {
    return {
      ...base,
      status: 'failed',
      error: internalError({ reason: 'reset-write-failed', keys: STORAGE_KEYS_CLEARED_ON_RESET }),
    };
  }
  return { ...base, status: 'done', removedKeys: STORAGE_KEYS_CLEARED_ON_RESET, error: null };
};
