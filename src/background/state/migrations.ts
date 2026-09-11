/**
 * M34 — `src/background/state/migrations.ts`
 * Versionado y migración del esquema (`documento_tecnico.md` §2.4 M34 y **§4.3**;
 * `plan_desarrollo.md` §3.2.5 tarea 2.11).
 *
 * Corpus vigente: base **v1.2 → v1.3 → v1.4**. La versión se declara DENTRO de
 * `truekeate_settings` (`schemaVersion`), no como clave propia; el campo está documentado en
 * M29 y esta migración es quien lo escribe.
 *
 * Deltas que migra, sin pérdida de datos:
 *
 * | Versión | Delta | Tratamiento |
 * |---|---|---|
 * | v1.3 | `truekeate_pending_request` (singular) retirada | se **elimina**: H-08 prohíbe alias y lectores |
 * | v1.3 | `truekeate_connected_sites` con valor `string` (guía heredada) | se convierte al objeto canónico conservando la cuenta |
 * | v1.3 | `event` en `truekeate_logs` (D-D) | se **rellena** de forma determinista desde `category`; ninguna entrada se pierde |
 * | v1.3 | `accountLabels` en `truekeate_settings` (D-F) | se añade vacío si falta |
 * | v1.4 | claves sin prefijo (`settings`, `accounts`, …) | se **renombran** a su nombre canónico `truekeate_*` (ACU-25) |
 * | v1.4 | `truekeate_current_account` con la forma heredada `"0"` | se normaliza a `idx:0` |
 *
 * **Claves no canónicas**: una clave con prefijo `truekeate_` no declarada, o cualquier otra
 * forma desconocida (incluida la del intento previo, DEC-09/RT-13, o un `truekeate_vault` que el
 * proyecto nunca crea), se **rechaza**: se informa en `rejectedKeys` y **no se toca ni se copia**
 * al esquema migrado. Nunca se destruyen datos que el producto no entiende.
 */

import type { Eip1193Error } from '../../shared/types';
import {
  CANONICAL_STORAGE_KEYS,
  SCHEMA_VERSION,
  STORAGE_KEY_PREFIX,
  STORAGE_KEYS,
  getStorageLocal,
  readStorage,
  removeStorage,
  writeStorage,
  type StorageKey,
  type StorageLocalLike,
  type StorageSnapshot,
} from './schema';
import { SETTINGS_SCHEMA_VERSION_FIELD } from '../settings';
import { internalError, migrationWriteFailedError } from '../rpc/errors';

/** Versiones conocidas del esquema, de la más antigua a la vigente. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = ['1.2', '1.3', '1.4'];

/** Línea base del esquema: una instantánea sin versión declarada se considera v1.2. */
export const BASE_SCHEMA_VERSION = '1.2' as const;

/** Claves retiradas: se eliminan y NO se migran (H-08: sin alias ni lectores). */
export const RETIRED_STORAGE_KEYS: readonly string[] = ['truekeate_pending_request'];

/**
 * Nombres heredados sin prefijo → clave canónica. Se **renombran** (no se copian): el dato del
 * usuario sobrevive con su forma canónica.
 */
export const LEGACY_KEY_ALIASES: Readonly<Record<string, StorageKey>> = {
  mnemonic: STORAGE_KEYS.mnemonic,
  accounts: STORAGE_KEYS.accounts,
  imported_accounts: STORAGE_KEYS.importedAccounts,
  importedAccounts: STORAGE_KEYS.importedAccounts,
  current_account: STORAGE_KEYS.currentAccount,
  currentAccount: STORAGE_KEYS.currentAccount,
  chain_id: STORAGE_KEYS.chainId,
  chainId: STORAGE_KEYS.chainId,
  networks: STORAGE_KEYS.networks,
  connected_sites: STORAGE_KEYS.connectedSites,
  connectedSites: STORAGE_KEYS.connectedSites,
  pending_requests: STORAGE_KEYS.pendingRequests,
  pendingRequests: STORAGE_KEYS.pendingRequests,
  connect_request: STORAGE_KEYS.connectRequest,
  approval_window: STORAGE_KEYS.approvalWindow,
  inflight_tx: STORAGE_KEYS.inflightTx,
  rate_windows: STORAGE_KEYS.rateWindows,
  logs: STORAGE_KEYS.logs,
  settings: STORAGE_KEYS.settings,
};

/** Relleno determinista de `event` (D-D) a partir de la `category` de una entrada de log. */
export const LEGACY_CATEGORY_TO_EVENT: Readonly<Record<string, string>> = {
  call: 'rpc_call',
  event: 'event_emit',
  tx: 'tx_sent',
  sign: 'sign_personal',
  system: 'sw_reconcile',
};

/** Un paso de migración y lo que hizo. */
export interface MigrationStep {
  id: string;
  from: string;
  to: string;
  renamedKeys: { from: string; to: string }[];
  removedKeys: string[];
  addedKeys: string[];
  rewrittenKeys: string[];
}

/** Informe completo de la migración: nunca lanza. */
export interface MigrationReport {
  from: string;
  to: string;
  /** El esquema ya estaba en la versión vigente: no se tocó nada. */
  alreadyCurrent: boolean;
  /** ¿Se escribió el resultado en `chrome.storage.local`? (`planMigration` siempre `false`). */
  applied: boolean;
  /** `true` salvo que la escritura fallara (resumen que consume el arranque del SW, M2). */
  ok: boolean;
  /** `true` cuando el esquema quedó escrito ya migrado (`applied && changed`). */
  migrated: boolean;
  /** ¿Hay algo que escribir? */
  changed: boolean;
  steps: MigrationStep[];
  /** Claves no canónicas detectadas: se informan y NO se tocan. */
  rejectedKeys: string[];
  error: Eip1193Error | null;
}

/** Planificación: instantánea migrada (solo claves canónicas) + informe. */
export interface MigrationPlan {
  snapshot: StorageSnapshot;
  report: MigrationReport;
}

/** ¿Es un objeto con entradas? */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** ¿Es una clave canónica declarada? */
const isCanonical = (key: string): key is StorageKey =>
  (CANONICAL_STORAGE_KEYS as readonly string[]).includes(key);

/** Versión declarada en la instantánea, o `null` si no hay ninguna. */
export const readStoredSchemaVersion = (snapshot: StorageSnapshot): string | null => {
  const settingsValue = snapshot[STORAGE_KEYS.settings];
  if (isRecord(settingsValue)) {
    const version = settingsValue[SETTINGS_SCHEMA_VERSION_FIELD];
    if (typeof version === 'string' && version.length > 0) {
      return version;
    }
  }
  for (const legacy of ['schema_version', 'schemaVersion']) {
    const version = snapshot[legacy];
    if (typeof version === 'string' && version.length > 0) {
      return version;
    }
  }
  return null;
};

/** Convierte a la forma canónica el valor de `truekeate_connected_sites` (H-24). */
const migrateConnectedSites = (value: unknown): { value: unknown; rewritten: boolean } => {
  if (!isRecord(value)) {
    return { value, rewritten: false };
  }
  let rewritten = false;
  const result: Record<string, unknown> = {};
  for (const [origin, session] of Object.entries(value)) {
    if (typeof session === 'string') {
      // Forma heredada de la guía: el valor era la dirección compartida.
      result[origin] = {
        origin,
        account: session,
        connectedAt: 0,
        lastUsedAt: 0,
        expiresAt: null,
        connected: true,
      };
      rewritten = true;
      continue;
    }
    result[origin] = session;
  }
  return { value: result, rewritten };
};

/** Rellena `event` en las entradas de log que no lo traen (D-D), sin descartar ninguna. */
const migrateLogs = (value: unknown): { value: unknown; rewritten: boolean } => {
  if (!Array.isArray(value)) {
    return { value, rewritten: false };
  }
  let rewritten = false;
  const entries = value.map((entry) => {
    if (!isRecord(entry) || typeof entry.event === 'string') {
      return entry;
    }
    rewritten = true;
    const category = typeof entry.category === 'string' ? entry.category : '';
    return { ...entry, event: LEGACY_CATEGORY_TO_EVENT[category] ?? 'rpc_call' };
  });
  return { value: entries, rewritten };
};

/**
 * Planifica la migración v1.2 → v1.4 de una instantánea del almacén. Es **pura**: no escribe
 * nada y no muta la entrada. Idempotente: si ya está en v1.4 devuelve `alreadyCurrent: true`.
 */
export const planMigration = (snapshot: StorageSnapshot): MigrationPlan => {
  const from = readStoredSchemaVersion(snapshot) ?? BASE_SCHEMA_VERSION;
  const rejectedKeys: string[] = [];
  const steps: MigrationStep[] = [];
  const migrated: StorageSnapshot = {};

  // 0. Reparto de claves: canónicas, heredadas (se renombran) y rechazadas (no se tocan).
  const renamed: { from: string; to: string }[] = [];
  const removedByRetirement: string[] = [];
  for (const [key, value] of Object.entries(snapshot)) {
    if (isCanonical(key)) {
      // Una clave canónica siempre gana sobre su alias heredado.
      migrated[key] = value;
      continue;
    }
    if (RETIRED_STORAGE_KEYS.includes(key)) {
      removedByRetirement.push(key);
      continue;
    }
    const alias = LEGACY_KEY_ALIASES[key];
    if (alias !== undefined) {
      if (migrated[alias] === undefined) {
        migrated[alias] = value;
        renamed.push({ from: key, to: alias });
      } else {
        renamed.push({ from: key, to: alias });
      }
      continue;
    }
    rejectedKeys.push(key);
  }

  // Un esquema de una versión DESCONOCIDA (por ejemplo, más nueva) no se migra hacia
  // atrás: eso sí sería pérdida de datos. Se informa y no se toca nada.
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(from)) {
    return {
      snapshot: migrated,
      report: {
        from,
        to: SCHEMA_VERSION,
        alreadyCurrent: false,
        applied: false,
        ok: false,
        migrated: false,
        changed: false,
        steps: [],
        rejectedKeys,
        error: internalError({ reason: 'unknown-schema-version', from }),
      },
    };
  }

  if (from === SCHEMA_VERSION) {
    return {
      snapshot: migrated,
      report: {
        from,
        to: SCHEMA_VERSION,
        alreadyCurrent: true,
        applied: false,
        ok: true,
        migrated: false,
        changed: false,
        steps: [],
        rejectedKeys,
        error: null,
      },
    };
  }

  // 1. v1.2 → v1.3: retirada de la clave singular, forma de las sesiones, `event` en los logs y
  //    `accountLabels` por defecto.
  const step13: MigrationStep = {
    id: 'v1.2→v1.3',
    from: '1.2',
    to: '1.3',
    renamedKeys: [],
    removedKeys: [...removedByRetirement],
    addedKeys: [],
    rewrittenKeys: [],
  };
  const sessions = migrateConnectedSites(migrated[STORAGE_KEYS.connectedSites]);
  if (sessions.rewritten) {
    migrated[STORAGE_KEYS.connectedSites] = sessions.value;
    step13.rewrittenKeys.push(STORAGE_KEYS.connectedSites);
  }
  const logs = migrateLogs(migrated[STORAGE_KEYS.logs]);
  if (logs.rewritten) {
    migrated[STORAGE_KEYS.logs] = logs.value;
    step13.rewrittenKeys.push(STORAGE_KEYS.logs);
  }
  const rawSettings = migrated[STORAGE_KEYS.settings];
  // El objeto de ajustes NO es un almacén: se manipula como contenido de `truekeate_settings`.
  const settingsRecord: Record<string, unknown> = isRecord(rawSettings) ? { ...rawSettings } : {};
  if (!isRecord(settingsRecord.accountLabels)) {
    settingsRecord.accountLabels = {};
    step13.addedKeys.push('accountLabels');
  }
  steps.push(step13);

  // 2. v1.3 → v1.4: nombres canónicos con prefijo, cuenta activa normalizada y versión.
  const step14: MigrationStep = {
    id: 'v1.3→v1.4',
    from: '1.3',
    to: '1.4',
    renamedKeys: renamed,
    removedKeys: [],
    addedKeys: [SETTINGS_SCHEMA_VERSION_FIELD],
    rewrittenKeys: [],
  };
  const current = migrated[STORAGE_KEYS.currentAccount];
  if (typeof current === 'string' && /^\d+$/.test(current.trim())) {
    migrated[STORAGE_KEYS.currentAccount] = `idx:${current.trim()}`;
    step14.rewrittenKeys.push(STORAGE_KEYS.currentAccount);
  }
  settingsRecord[SETTINGS_SCHEMA_VERSION_FIELD] = SCHEMA_VERSION;
  migrated[STORAGE_KEYS.settings] = settingsRecord;
  steps.push(step14);

  const changed = steps.some(
    (step) =>
      step.renamedKeys.length > 0 ||
      step.removedKeys.length > 0 ||
      step.addedKeys.length > 0 ||
      step.rewrittenKeys.length > 0,
  );

  return {
    snapshot: migrated,
    report: {
      from,
      to: SCHEMA_VERSION,
      alreadyCurrent: false,
      applied: false,
      ok: true,
      migrated: false,
      changed,
      steps,
      rejectedKeys,
      error: null,
    },
  };
};

/**
 * Aplica la migración al almacén. Nunca lanza: escribe las claves canónicas migradas, elimina
 * las heredadas y las retiradas, y devuelve el informe. Idempotente: repetirla con el esquema
 * ya migrado es un no-op.
 */
export const migrateSchema = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<MigrationReport> => {
  const snapshot = await readStorage(null, storage);
  const plan = planMigration(snapshot);
  if (plan.report.alreadyCurrent || !plan.report.changed) {
    return plan.report;
  }

  const renamedFrom = plan.report.steps.flatMap((step) => step.renamedKeys.map((entry) => entry.from));
  const retired = plan.report.steps.flatMap((step) => step.removedKeys);
  const written = await writeStorage(plan.snapshot, storage);
  // Las claves heredadas y las retiradas no son StorageKey (precisamente por eso se migran):
  // se eliminan por su nombre literal, que es lo único que chrome.storage necesita.
  const obsoleteKeys = [...new Set([...renamedFrom, ...retired])] as StorageKey[];
  const removed = await removeStorage(obsoleteKeys, storage);
  return {
    ...plan.report,
    applied: written && removed,
    ok: written && removed,
    migrated: written && removed,
    // Causa canónica de §4.3 desde la v1.9: «fallo de escritura de migración».
    error: written && removed ? null : migrationWriteFailedError({ reason: 'migration-write-failed' }),
  };
};

/**
 * ¿Es `key` una forma NO canónica? (toda clave que no está declarada en `STORAGE_KEYS`).
 */
export const isNonCanonicalKey = (key: string): boolean => !isCanonical(key);

/**
 * ¿Se RECHAZA `key` (no es canónica, no es un alias heredado migrable ni una clave retirada)?
 * Una clave rechazada se informa en `rejectedKeys` y **no se toca**: el producto nunca destruye
 * datos que no entiende.
 */
export const isRejectedKey = (key: string): boolean =>
  !isCanonical(key) &&
  LEGACY_KEY_ALIASES[key] === undefined &&
  !RETIRED_STORAGE_KEYS.includes(key);

/**
 * Nombre con el que el arranque del Service Worker (M2) invoca la migración: `runMigrations()`.
 * Es exactamente el mismo contrato que `migrateSchema()`.
 */
export const runMigrations = migrateSchema;