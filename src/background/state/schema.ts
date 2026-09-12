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
import { EXPIRE_ALARM_PREFIX } from '../../shared/constants';
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

/**
 * Clave del **contador de descartes por cuota** de la observabilidad (H5, §2.15 / M30).
 *
 * No es una clave de estado de la cartera sino el contador de diagnóstico del propio servicio de
 * logs: la tarea 5.8 exige que el contador de descartes sea **visible**, y `wallet_getLogs` (M3)
 * lo publica en `dropped`. Vive aquí, junto a las claves canónicas, para que su nombre cumpla la
 * nomenclatura `truekeate_` (ACU-25) sin que ningún módulo escriba una cadena a mano; NO entra en
 * `STORAGE_KEYS` ni en `CANONICAL_STORAGE_KEYS` (la lista de §2 sigue siendo de 14 claves) y, como
 * el resto de la observabilidad, **sobrevive al reset** (RF-32).
 */
export const LOG_DROPPED_COUNTER_KEY = 'truekeate_logs_dropped' as const;

// ---------------------------------------------------------------------------
// Cuota de `chrome.storage.local`: 10 MB observables (H5, ADT-14 / D-M, §2.15)
// ---------------------------------------------------------------------------

/**
 * Cuota OBJETIVO declarada de `chrome.storage.local`: **10 MB** (10 485 760 bytes), que es la
 * cuota por defecto del almacén desde **Chrome 114** —exactamente el `minimum_chrome_version` que
 * exige el proyecto— y la que Chrome publica en `chrome.storage.local.QUOTA_BYTES`.
 *
 * Es el valor que se usa cuando la API no informa de su propia cuota. **No** se declara
 * `unlimitedStorage`: la política de §2.15 es reducir el consumo (retención FIFO de M32) y hacer
 * el desbordamiento OBSERVABLE (DEC-42 / R13).
 */
export const STORAGE_QUOTA_BYTES = 10_485_760 as const;

/**
 * Umbral de aviso de la cuota: **90 %** (≈ 9 MB, §2.15). Por encima, el panel de actividad y el
 * popup muestran el aviso no descartable «Almacenamiento de la extensión casi lleno: exporta y
 * borra los logs (RF-32).». Es **estado de UI**: no se persiste ningún contador propio.
 */
export const STORAGE_QUOTA_WARN_RATIO = 0.9 as const;

/**
 * Nombres de error con los que Chrome rechaza una escritura por cuota agotada
 * (`chrome.runtime.lastError` en el modo callback y `DOMException`/`Error` en el modo promesa).
 * La comparación se hace sobre el nombre y el mensaje, porque la API real no garantiza un
 * `instanceof` estable entre reinos.
 */
export const STORAGE_QUOTA_ERROR_NAMES: readonly string[] = [
  'QuotaExceededError',
  'QUOTA_BYTES',
] as const;

/** Lectura en texto del error sin `any` (nombre, mensaje y `code` si lo hubiera). */
const errorText = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error !== 'object' || error === null) {
    return String(error);
  }
  const candidate = error as { name?: unknown; message?: unknown; code?: unknown };
  return [candidate.name, candidate.message, candidate.code]
    .filter((part) => part !== undefined && part !== null)
    .map((part) => String(part))
    .join(' | ');
};

/**
 * ¿Es `error` el rechazo por CUOTA de `chrome.storage.local`? (`DOMException`
 * `QuotaExceededError`, `chrome.runtime.lastError` con `QUOTA_BYTES quota exceeded`…).
 *
 * Es la **fuente única** de la detección: M30 (logger) la usa para decidir si aplica la política
 * de fallo observable de §2.15 —1 reintento tras la retención FIFO, descarte con `rpc_error`
 * `-32603` y contador de descartes— en lugar de tratar el rechazo como un fallo genérico.
 */
export const isStorageQuotaError = (error: unknown): boolean => {
  const text = errorText(error);
  return STORAGE_QUOTA_ERROR_NAMES.some((token) => text.includes(token));
};

/** Superficie de medición de la cuota: `getBytesInUse()` y la cuota declarada por la API. */
export interface StorageQuotaLike extends StorageLocalLike {
  getBytesInUse(keys?: string | string[] | null): Promise<number> | undefined;
  readonly QUOTA_BYTES?: number;
}

/**
 * Devuelve `chrome.storage.local` como superficie de cuota (con `getBytesInUse`), o `null` si la
 * API no está disponible o no expone la medición. La cuota la publica la propia API
 * (`QUOTA_BYTES`); si falta, se usa {@link STORAGE_QUOTA_BYTES} (10 MB desde Chrome 114).
 */
export const getStorageQuotaApi = (): StorageQuotaLike | null => {
  const local = getStorageLocal();
  if (local === null) {
    return null;
  }
  const candidate = local as Partial<StorageQuotaLike>;
  if (typeof candidate.getBytesInUse !== 'function') {
    return null;
  }
  return candidate as StorageQuotaLike;
};

/** Medición de la cuota del almacén: es el dato que se registra en `sw_started` (§2.15). */
export interface StorageQuotaReport {
  /** Bytes ocupados por la clave medida, o por todo el almacén si `key` es `null`. */
  bytesInUse: number | null;
  /** Cuota declarada (la de la API si la publica; si no, {@link STORAGE_QUOTA_BYTES}). */
  quotaBytes: number;
  /** Proporción ocupada en `[0..1]`; `null` si no se pudo medir. */
  usedRatio: number | null;
  /** `true` cuando la ocupación supera {@link STORAGE_QUOTA_WARN_RATIO} (≥ 90 %). */
  warning: boolean;
  /** Clave medida; `null` = almacén completo. */
  key: StorageKey | null;
}

/**
 * Mide el uso del almacén (por clave o completo) sin lanzar jamás: un fallo de la API devuelve
 * `bytesInUse: null`. Es la medición que §2.15 asigna al evento `sw_started` y la que permite
 * evaluar el umbral del 90 % sin persistir ningún contador propio.
 */
export const readStorageQuota = async (
  key: StorageKey | null = null,
  storage: StorageQuotaLike | null = getStorageQuotaApi(),
): Promise<StorageQuotaReport> => {
  const quotaBytes =
    typeof storage?.QUOTA_BYTES === 'number' && storage.QUOTA_BYTES > 0
      ? storage.QUOTA_BYTES
      : STORAGE_QUOTA_BYTES;
  if (storage === null) {
    return { bytesInUse: null, quotaBytes, usedRatio: null, warning: false, key };
  }
  try {
    const bytes = await storage.getBytesInUse(key === null ? null : [key]);
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
      return { bytesInUse: null, quotaBytes, usedRatio: null, warning: false, key };
    }
    const usedRatio = bytes / quotaBytes;
    return {
      bytesInUse: bytes,
      quotaBytes,
      usedRatio,
      warning: usedRatio >= STORAGE_QUOTA_WARN_RATIO,
      key,
    };
  } catch (error) {
    console.warn('[truekeate] no se pudo medir la cuota del almacén', error);
    return { bytesInUse: null, quotaBytes, usedRatio: null, warning: false, key };
  }
};

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
 * Orden ESTRICTO de comprobación del reset (R-09b / DEC-46, §3.9 y §3.11): primero la cola, después
 * la marca de transacción en vuelo, después la confirmación destructiva y, por último, la limpieza.
 * Se expone como dato para que la UI (M46) y las pruebas no dependan de la prosa del corpus.
 */
export const RESET_GUARD_ORDER = [
  'cola-vacia',
  'sin-transaccion-en-vuelo',
  'confirmacion-destructiva',
  'limpieza',
] as const;

/** Paso del orden estricto del reset. */
export type ResetGuardStep = (typeof RESET_GUARD_ORDER)[number];

/**
 * Guardas de estado del reset, en el ORDEN estricto de §3.9: primero la cola y después la
 * marca de transacción en vuelo. El contador `<n>` del literal es el número de solicitudes
 * `pending` (el que la UI pinta).
 *
 * El error `-32000` lleva además `data: { pendingCount, inflightCount, step }` para que la UI
 * muestre el número EXACTO de solicitudes que quedan sin tener que interpretar el texto, y para
 * saber cuál de las dos guardas fue la que bloqueó.
 */
export const checkResetGuards = (
  snapshot: StorageSnapshot,
  now: number = Date.now(),
): ResetGuardCheck => {
  const pendingCount = countPendingRequests(snapshot[STORAGE_KEYS.pendingRequests]);
  const inflightCount = countActiveInflightTx(snapshot[STORAGE_KEYS.inflightTx], now);
  if (pendingCount > 0 || inflightCount > 0) {
    const blocked = resetBlockedError(pendingCount);
    const step: ResetGuardStep =
      pendingCount > 0 ? 'cola-vacia' : 'sin-transaccion-en-vuelo';
    return {
      canProceed: false,
      pendingCount,
      inflightCount,
      error: {
        ...blocked,
        data: { pendingCount, inflightCount, step, reason: 'reset-guard' },
      },
    };
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
 * Limpieza de plataforma por defecto del paso 4 de §3.9: **cancelar las alarmas de vencimiento**
 * (`truekeate_expire:*`, cuyo nombre fija M15 a partir de `EXPIRE_ALARM_PREFIX`) y **purgar el
 * badge** derivado. Se implementa aquí, sin importar M15 ni M14, para no crear el ciclo
 * `schema → approvals → schema`; la única fuente del prefijo sigue siendo `shared/constants.ts`.
 *
 * Nunca lanza: un fallo de plataforma no puede impedir borrar el material de la cartera.
 */
export const defaultResetCleanup = (): Required<ResetPlatformCleanup> => ({
  cancelExpiryAlarms: async (): Promise<void> => {
    const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
    const alarms: unknown =
      typeof chromeNs === 'object' && chromeNs !== null
        ? (chromeNs as { alarms?: unknown }).alarms
        : undefined;
    const getAll: unknown =
      typeof alarms === 'object' && alarms !== null
        ? (alarms as { getAll?: unknown }).getAll
        : undefined;
    const clear: unknown =
      typeof alarms === 'object' && alarms !== null
        ? (alarms as { clear?: unknown }).clear
        : undefined;
    if (typeof getAll !== 'function' || typeof clear !== 'function') {
      return;
    }
    try {
      const all =
        (await (getAll as () => Promise<readonly { name?: unknown }[]>).call(alarms)) ?? [];
      for (const alarm of all) {
        if (typeof alarm?.name === 'string' && alarm.name.startsWith(EXPIRE_ALARM_PREFIX)) {
          await (clear as (name: string) => unknown).call(alarms, alarm.name);
        }
      }
    } catch (error) {
      console.warn('[truekeate] no se pudieron cancelar las alarmas de vencimiento', error);
    }
  },
  clearBadge: async (): Promise<void> => {
    const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
    const action: unknown =
      typeof chromeNs === 'object' && chromeNs !== null
        ? (chromeNs as { action?: unknown }).action
        : undefined;
    const setBadgeText: unknown =
      typeof action === 'object' && action !== null
        ? (action as { setBadgeText?: unknown }).setBadgeText
        : undefined;
    if (typeof setBadgeText !== 'function') {
      return;
    }
    try {
      await (setBadgeText as (details: { text: string }) => unknown).call(action, { text: '' });
    } catch (error) {
      console.warn('[truekeate] no se pudo purgar el badge en el reset', error);
    }
  },
});

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

  // 4. Limpieza: plataforma primero (alarmas de vencimiento y badge), almacén después. El llamador
  //    puede inyectar su propia limpieza; si no, se usa la de por defecto de §3.9 paso 4.
  try {
    const cleanup = defaultResetCleanup();
    await (options.cancelExpiryAlarms ?? cleanup.cancelExpiryAlarms)();
    await (options.clearBadge ?? cleanup.clearBadge)();
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
