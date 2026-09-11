/**
 * M29 — `src/background/settings.ts`
 * `truekeate_settings`: defaults, lectura/escritura tipada, etiquetas y aceptación de avisos
 * (`documento_tecnico.md` §2.4 M29, §4.1 y `diccionario_datos.md` §2.10).
 *
 * Decisiones que respeta:
 * - **P-03 / RE-02**: sin contraseña. `encryptionEnabled` es SIEMPRE `false` y
 *   `requirePasswordOnOpen` SIEMPRE `false`; se conservan por compatibilidad y este módulo los
 *   fuerza aunque el almacén traiga otro valor.
 * - **DEC-35 / ACU-06 (D-F)**: `accountLabels: Record<índice, etiqueta>` guarda las etiquetas de
 *   las cuentas **derivadas**. La etiqueta de las importadas vive en
 *   `truekeate_imported_accounts[].label` (M28): son dos mecanismos distintos.
 * - **RNF-23**: `devNoticeAcceptedAt` registra la aceptación del aviso de entorno de desarrollo.
 *   El aviso NO es descartable: una vez aceptado no se borra con una escritura parcial.
 * - **`documento_tecnico.md` §4.3**: la versión del esquema se declara DENTRO de
 *   `truekeate_settings` (campo `schemaVersion`), no como clave propia; la migración es de M34.
 * - **RF-06 / DEC-35 (v1.9 del diccionario)**: la **visibilidad de las cuentas derivadas** se
 *   persiste en `truekeate_settings.hiddenAccounts: number[]` (índices BIP-44 ocultos), junto a
 *   `accountLabels`; la clave es canónica en §2.10 y su nombre se fija en
 *   {@link SETTINGS_HIDDEN_ACCOUNTS_FIELD}. Las derivadas nunca se eliminan: ocultar una NO
 *   borra su derivación (la dirección permanece en `truekeate_accounts`). El **reset** la limpia
 *   con el resto del objeto, porque `truekeate_settings` figura en
 *   `STORAGE_KEYS_CLEARED_ON_RESET` (M33 / RF-32).
 */

import type { Eip1193Error, TruekeateSettings } from '../shared/types';
import {
  BALANCE_POLL_MAX_ACCOUNTS,
  BALANCE_POLL_MS,
  DERIVED_ACCOUNTS,
  MAX_LABEL_LENGTH,
  SESSION_TTL_MS,
  logLimit,
  logMaxPerOrigin,
  pendingRequestsMax,
  pendingRequestsMaxPerOrigin,
  pendingRequestsPerMinute,
} from '../shared/constants';
import {
  SCHEMA_VERSION,
  STORAGE_KEYS,
  getStorageLocal,
  readStorage,
  writeStorage,
  type StorageLocalLike,
  type StorageSnapshot,
} from './state/schema';
import { invalidLabelError, storageQuotaExceededError } from './rpc/errors';

/** Nombre del campo que declara la versión del esquema dentro de `truekeate_settings` (§4.3). */
export const SETTINGS_SCHEMA_VERSION_FIELD = 'schemaVersion' as const;

/** Nombre canónico del campo de índices derivados ocultos, junto a `accountLabels` (§2.10). */
export const SETTINGS_HIDDEN_ACCOUNTS_FIELD = 'hiddenAccounts' as const;

/** Etiqueta máxima: 32 caracteres (misma cota que el `label` de las importadas). */
export { MAX_LABEL_LENGTH };

/** Prefijos de las etiquetas por defecto (español, `CA-RT-10`). */
export const DERIVED_LABEL_PREFIX = 'Cuenta' as const;
export const IMPORTED_LABEL_PREFIX = 'Importada' as const;

/**
 * Ajustes persistidos: el contrato compartido (`TruekeateSettings`) más el campo que el
 * diccionario sitúa dentro de este objeto: la versión de esquema (§4.3).
 *
 * `hiddenAccounts` (visibilidad de las cuentas derivadas, RF-06) **no** se redeclara aquí: es
 * una clave canónica del contrato compartido (`TruekeateSettings`, `diccionario_datos.md` §2.10)
 * y su nombre se fija en {@link SETTINGS_HIDDEN_ACCOUNTS_FIELD}. El reset de la cartera la
 * limpia junto al resto del objeto, porque `truekeate_settings` está en
 * `STORAGE_KEYS_CLEARED_ON_RESET` (M33 / RF-32).
 */
export interface StoredSettings extends TruekeateSettings {
  /** Versión del esquema de datos declarada en el propio objeto (§4.3). */
  schemaVersion: string;
}

/** Defaults del diccionario §2.10; `encryptionEnabled` y `requirePasswordOnOpen` son de P-03. */
export const DEFAULT_SETTINGS: StoredSettings = {
  derivedAccountCount: DERIVED_ACCOUNTS,
  accountLabels: {},
  balancePollMs: BALANCE_POLL_MS,
  balancePollMaxAccounts: BALANCE_POLL_MAX_ACCOUNTS,
  logLimit,
  logMaxPerOrigin,
  sessionTtlMs: SESSION_TTL_MS,
  pendingRequestsMax,
  pendingRequestsMaxPerOrigin,
  pendingRequestsPerMinute,
  language: 'es',
  encryptionEnabled: false,
  requirePasswordOnOpen: false,
  schemaVersion: SCHEMA_VERSION,
  hiddenAccounts: [],
};

/** Resultado de una escritura de ajustes. */
export type SettingsWriteResult =
  | { ok: true; settings: StoredSettings }
  | { ok: false; error: Eip1193Error };

// ---------------------------------------------------------------------------
// Cerrojo de lectura-modificación-escritura (lo comparte M28)
// ---------------------------------------------------------------------------

/** Cerrojo de exclusión mutua: serializa las RMW del almacén en el Service Worker. */
export interface StorageLock {
  run<T>(task: () => Promise<T>): Promise<T>;
}

/** Crea un cerrojo por encadenamiento de promesas (sin `setTimeout`, apto para el SW). */
export const createStorageLock = (): StorageLock => {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      // La cola avanza pase lo que pase: un fallo de una tarea no bloquea las siguientes.
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
};

/**
 * Cerrojo ÚNICO de las escrituras de `truekeate_settings`. M28 (cuentas: `accountLabels`,
 * `derivedAccountCount`, `hiddenAccounts`) y M29 (ajustes) lo comparten para que dos
 * modificaciones concurrentes no se pisen.
 */
export const settingsWriteLock = createStorageLock();

/** Ejecuta una RMW sobre `truekeate_settings` bajo el cerrojo compartido. */
export const runSettingsRmw = <T>(task: () => Promise<T>): Promise<T> => settingsWriteLock.run(task);

// ---------------------------------------------------------------------------
// Lectura saneada
// ---------------------------------------------------------------------------

/** ¿Es un número finito y positivo? */
const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** ¿Es un entero no negativo? */
const isIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Sanea el mapa de etiquetas de las derivadas: claves de índice y valores de texto válidos. */
const sanitizeAccountLabels = (value: unknown): Record<number, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const labels: Record<number, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const index = Number(key);
    const label = normalizeLabel(raw);
    if (isIndex(index) && label.length > 0) {
      labels[index] = label;
    }
  }
  return labels;
};

/** Sanea la lista de índices ocultos: enteros no negativos, sin repeticiones y ordenados. */
const sanitizeHiddenAccounts = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const unique = new Set<number>();
  for (const entry of value) {
    if (isIndex(entry)) {
      unique.add(entry);
    }
  }
  return [...unique].sort((a, b) => a - b);
};

/**
 * Combina los ajustes persistidos con los defaults, sin confiar en la forma almacenada. Fuerza
 * las invariantes de P-03 (sin cifrado ni contraseña) y conserva `devNoticeAcceptedAt` si es un
 * instante válido (el aviso del primer arranque no es descartable).
 */
export const sanitizeSettings = (value: unknown): StoredSettings => {
  const raw = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const language = raw.language === 'en' ? 'en' : 'es';
  const acceptedAt = raw.devNoticeAcceptedAt;
  const settings: StoredSettings = {
    derivedAccountCount: isPositiveNumber(raw.derivedAccountCount)
      ? Math.floor(raw.derivedAccountCount)
      : DEFAULT_SETTINGS.derivedAccountCount,
    accountLabels: sanitizeAccountLabels(raw.accountLabels),
    balancePollMs: isPositiveNumber(raw.balancePollMs)
      ? raw.balancePollMs
      : DEFAULT_SETTINGS.balancePollMs,
    balancePollMaxAccounts: isPositiveNumber(raw.balancePollMaxAccounts)
      ? Math.floor(raw.balancePollMaxAccounts)
      : DEFAULT_SETTINGS.balancePollMaxAccounts,
    logLimit: isPositiveNumber(raw.logLimit) ? Math.floor(raw.logLimit) : DEFAULT_SETTINGS.logLimit,
    logMaxPerOrigin: isPositiveNumber(raw.logMaxPerOrigin)
      ? Math.floor(raw.logMaxPerOrigin)
      : DEFAULT_SETTINGS.logMaxPerOrigin,
    sessionTtlMs: isPositiveNumber(raw.sessionTtlMs)
      ? raw.sessionTtlMs
      : DEFAULT_SETTINGS.sessionTtlMs,
    pendingRequestsMax: isPositiveNumber(raw.pendingRequestsMax)
      ? Math.floor(raw.pendingRequestsMax)
      : DEFAULT_SETTINGS.pendingRequestsMax,
    pendingRequestsMaxPerOrigin: isPositiveNumber(raw.pendingRequestsMaxPerOrigin)
      ? Math.floor(raw.pendingRequestsMaxPerOrigin)
      : DEFAULT_SETTINGS.pendingRequestsMaxPerOrigin,
    pendingRequestsPerMinute: isPositiveNumber(raw.pendingRequestsPerMinute)
      ? Math.floor(raw.pendingRequestsPerMinute)
      : DEFAULT_SETTINGS.pendingRequestsPerMinute,
    language,
    // P-03: sin cifrado y sin contraseña, siempre.
    encryptionEnabled: false,
    requirePasswordOnOpen: false,
    schemaVersion: typeof raw.schemaVersion === 'string' ? raw.schemaVersion : SCHEMA_VERSION,
    hiddenAccounts: sanitizeHiddenAccounts(raw[SETTINGS_HIDDEN_ACCOUNTS_FIELD]),
  };
  if (typeof acceptedAt === 'number' && Number.isFinite(acceptedAt) && acceptedAt > 0) {
    settings.devNoticeAcceptedAt = acceptedAt;
  }
  return settings;
};

/** Ajustes a partir de una instantánea del almacén (función pura, para pruebas). */
export const readSettingsFromSnapshot = (snapshot: StorageSnapshot): StoredSettings =>
  sanitizeSettings(snapshot[STORAGE_KEYS.settings]);

/** Lee `truekeate_settings` del almacén. Nunca lanza: ante un fallo devuelve los defaults. */
export const getSettings = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<StoredSettings> => readSettingsFromSnapshot(await readStorage([STORAGE_KEYS.settings], storage));

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/** Escribe los ajustes completos. `-32603 storageQuotaExceeded` si el almacén los rechaza. */
export const writeSettings = async (
  settings: StoredSettings,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<SettingsWriteResult> => {
  const sanitized = sanitizeSettings(settings);
  const written = await writeStorage({ [STORAGE_KEYS.settings]: sanitized }, storage);
  return written ? { ok: true, settings: sanitized } : { ok: false, error: storageQuotaExceededError() };
};

/**
 * Aplica un parche sobre los ajustes actuales bajo el cerrojo compartido. Dos invariantes:
 * las de P-03 se reimponen siempre y `devNoticeAcceptedAt` **no se puede borrar ni desplazar**
 * (RNF-23: el aviso del primer arranque no es descartable y la aceptación es idempotente: la
 * **primera** fija el instante y una aceptación posterior no lo mueve).
 */
export const updateSettings = async (
  patch: Partial<StoredSettings>,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<SettingsWriteResult> =>
  runSettingsRmw(async () => {
    const current = await getSettings(storage);
    const merged = sanitizeSettings({
      ...current,
      ...patch,
      devNoticeAcceptedAt:
        patch.devNoticeAcceptedAt === undefined || current.devNoticeAcceptedAt !== undefined
          ? current.devNoticeAcceptedAt
          : patch.devNoticeAcceptedAt,
    });
    return writeSettings(merged, storage);
  });

/** ¿Se ha aceptado ya el aviso de entorno de desarrollo? (RNF-23). */
export const isDevNoticeAccepted = (settings: StoredSettings): boolean =>
  typeof settings.devNoticeAcceptedAt === 'number' && settings.devNoticeAcceptedAt > 0;

/**
 * Registra la aceptación del aviso del primer arranque (RNF-23). Es idempotente: conserva el
 * instante más antiguo.
 */
export const acceptDevNotice = async (
  at: number = Date.now(),
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<SettingsWriteResult> => updateSettings({ devNoticeAcceptedAt: at }, storage);

// ---------------------------------------------------------------------------
// Etiquetas (DEC-35 / ACU-06)
// ---------------------------------------------------------------------------

/** Causa del fallo de una etiqueta; `null` si es válida. */
export type LabelProblem = 'empty' | 'tooLong' | 'control' | null;

/** Veredicto de la validación de una etiqueta. */
export interface LabelCheck {
  valid: boolean;
  label: string;
  problem: LabelProblem;
  /**
   * Causa `-32602 invalidLabel` de `diccionario_datos.md` §4.3 (bloque añadido en la v1.9)
   * cuando la etiqueta no es válida; `null` si lo es.
   */
  error: Eip1193Error | null;
}

/**
 * Normaliza una etiqueta: recorta y colapsa espacios internos. No recorta a 32 caracteres
 * (eso sería aceptar en silencio algo que el usuario no pidió): la cota la comprueba
 * {@link validateLabel}.
 */
export const normalizeLabel = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

/** Valida una etiqueta: 1..32 caracteres, sin caracteres de control. */
export const validateLabel = (value: unknown): LabelCheck => {
  const label = normalizeLabel(value);
  const fail = (problem: Exclude<LabelProblem, null>): LabelCheck => ({
    valid: false,
    label,
    problem,
    // La causa ya existe en §4.3 desde la v1.9: el veredicto viaja con su código y su acción.
    error: invalidLabelError({ reason: 'invalid-label', problem }),
  });
  if (label.length === 0) {
    return fail('empty');
  }
  if (label.length > MAX_LABEL_LENGTH) {
    return fail('tooLong');
  }
  if (/[\u0000-\u001f\u007f]/.test(label)) {
    return fail('control');
  }
  return { valid: true, label, problem: null, error: null };
};

/** Etiqueta por defecto de una cuenta derivada: `Cuenta N` (N = índice + 1). */
export const defaultDerivedLabel = (index: number): string =>
  `${DERIVED_LABEL_PREFIX} ${index + 1}`;

/** Etiqueta por defecto de la N-ésima cuenta importada: `Importada N` (N es el ordinal). */
export const defaultImportedLabel = (ordinal: number): string =>
  `${IMPORTED_LABEL_PREFIX} ${ordinal}`;

/** Etiqueta de una derivada: la guardada o la de por defecto. */
export const labelForDerivedAccount = (settings: StoredSettings, index: number): string =>
  settings.accountLabels[index] ?? defaultDerivedLabel(index);

/** Fija la etiqueta de una cuenta derivada; una etiqueta vacía borra la entrada. */
export const setAccountLabel = async (
  index: number,
  label: unknown,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<SettingsWriteResult> => {
  const check = validateLabel(label);
  return runSettingsRmw(async () => {
    const current = await getSettings(storage);
    const labels: Record<number, string> = { ...current.accountLabels };
    if (check.label.length === 0) {
      delete labels[index];
    } else {
      labels[index] = check.label;
    }
    return writeSettings({ ...current, accountLabels: labels }, storage);
  });
};

/** Borra la etiqueta de una cuenta derivada (vuelve a `Cuenta N`). */
export const clearAccountLabel = async (
  index: number,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<SettingsWriteResult> => setAccountLabel(index, '', storage);

/** Cuenta derivada incrementada al pulsar «Añadir cuenta» (RF-04). */
export const setDerivedAccountCount = async (
  count: number,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<SettingsWriteResult> => updateSettings({ derivedAccountCount: count }, storage);

// ---------------------------------------------------------------------------
// Visibilidad de las cuentas derivadas (RF-06: se ocultan, no se eliminan)
// ---------------------------------------------------------------------------

/** ¿Está oculta la cuenta derivada `index`? */
export const isDerivedAccountHidden = (settings: StoredSettings, index: number): boolean =>
  settings.hiddenAccounts.includes(index);

/** Oculta una cuenta derivada sin tocar su derivación. */
export const hideDerivedAccount = async (
  index: number,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<SettingsWriteResult> =>
  runSettingsRmw(async () => {
    const settings = await getSettings(storage);
    const hidden = new Set(settings.hiddenAccounts);
    hidden.add(index);
    return writeSettings({ ...settings, hiddenAccounts: [...hidden] }, storage);
  });

/** Vuelve a mostrar una cuenta derivada (la dirección es la misma: no se re-deriva distinto). */
export const showDerivedAccount = async (
  index: number,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<SettingsWriteResult> =>
  runSettingsRmw(async () => {
    const settings = await getSettings(storage);
    return writeSettings(
      { ...settings, hiddenAccounts: settings.hiddenAccounts.filter((entry) => entry !== index) },
      storage,
    );
  });
