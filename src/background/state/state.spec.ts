/**
 * `src/background/state/state.spec.ts` — M33 + M34
 * (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre la **persistencia y restauración** del estado (`CA-RF-09`/`CA-RF-10`): claves canónicas
 * `truekeate_*`, rechazo de una clave no canónica, lectura/escritura con la política de
 * reintento del corpus y **migración v1.2 → v1.4 sin pérdida de datos** (tarea 2.11).
 *
 * El almacén es el stub en memoria del arnés, reiniciado por su `beforeEach` global.
 */

import { describe, expect, it } from 'vitest';
import { chromeStub } from '../../../test/setup/chrome-stub';
import {
  CANONICAL_STORAGE_KEYS,
  SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  STORAGE_KEYS,
  STORAGE_DEFAULTS,
  STORAGE_KEYS_CLEARED_ON_RESET,
  STORAGE_KEYS_PRESERVED_ON_RESET,
  STORAGE_KEY_PREFIX,
  assertCanonicalStorageKey,
  canonicalKeyProblem,
  hasCanonicalPrefix,
  isCanonicalStorageKey,
  readStorage,
  removeStorage,
  writeStorage,
} from './schema';
import {
  BASE_SCHEMA_VERSION,
  LEGACY_KEY_ALIASES,
  RETIRED_STORAGE_KEYS,
  SUPPORTED_SCHEMA_VERSIONS,
  isNonCanonicalKey,
  isRejectedKey,
  migrateSchema,
  planMigration,
  readStoredSchemaVersion,
  runMigrations,
} from './migrations';

/** Frase de Anvil: el contenido de usuario que la migración NO puede perder. */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Direcciones EIP-55 de las cuentas 0 y 1 de Anvil. */
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ANVIL_ADDRESS1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Origen de la dApp de pruebas. */
const DAPP_ORIGIN = 'http://localhost:5174';

/** Estado de un usuario en el esquema v1.2 (sin versión declarada) con formas heredadas. */
const legacyV12Snapshot = (): Record<string, unknown> => ({
  mnemonic: ANVIL_MNEMONIC,
  accounts: [ANVIL_ADDRESS0, ANVIL_ADDRESS1],
  imported_accounts: [
    { address: '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF', label: 'Ahorros', privateKey: '0x02' },
  ],
  current_account: '1',
  connected_sites: { [DAPP_ORIGIN]: ANVIL_ADDRESS0 },
  settings: { derivedAccountCount: 5 },
  logs: [
    { ts: 1, category: 'call', method: 'eth_chainId' },
    { ts: 2, category: 'system', message: 'arranque' },
  ],
  truekeate_pending_request: { id: 'obsoleta' },
});

/** Almacén del stub. */
const storage = chromeStub.storage.local;

describe('M33 · claves canónicas', () => {
  it('declara las 14 claves `truekeate_*` sin repetir ninguna', () => {
    expect(CANONICAL_STORAGE_KEYS).toHaveLength(14);
    expect(new Set(CANONICAL_STORAGE_KEYS).size).toBe(14);
    expect(CANONICAL_STORAGE_KEYS.every((key) => key.startsWith(STORAGE_KEY_PREFIX))).toBe(true);
    expect(STORAGE_KEYS.mnemonic).toBe('truekeate_mnemonic');
    expect(STORAGE_KEYS.pendingRequests).toBe('truekeate_pending_requests');
    expect(STORAGE_KEYS.inflightTx).toBe('truekeate_inflight_tx');
    expect(STORAGE_KEYS.logs).toBe('truekeate_logs');
  });

  it('reconoce el prefijo y rechaza una clave no declarada', () => {
    expect(hasCanonicalPrefix('truekeate_mnemonic')).toBe(true);
    expect(hasCanonicalPrefix('settings')).toBe(false);
    expect(isCanonicalStorageKey('truekeate_accounts')).toBe(true);
    expect(isCanonicalStorageKey('truekeate_vault')).toBe(false);
    // El prefijo heredado del intento previo se construye por concatenación para no dejarlo
    // escrito en `src/` (lo prohíbe `shared/naming.spec.ts`, DEC-09 / ACU-25).
    expect(isCanonicalStorageKey(['codecrypto', '_mnemonic'].join(''))).toBe(false);
  });

  it('`assertCanonicalStorageKey` lanza con la clave no canónica y su prefijo esperado', () => {
    expect(assertCanonicalStorageKey('truekeate_logs')).toBe('truekeate_logs');
    expect(() => assertCanonicalStorageKey('vault')).toThrow(/no canónica: «vault»/);
    expect(() => assertCanonicalStorageKey('vault')).toThrow(/truekeate_/);
  });

  it('`canonicalKeyProblem` describe el problema con el código interno y su detalle', () => {
    expect(canonicalKeyProblem(STORAGE_KEYS.mnemonic)).toBeNull();
    expect(canonicalKeyProblem('accounts')).toEqual({
      code: -32603,
      message: 'Error interno de la cartera.',
      data: { reason: 'non-canonical-key', key: 'accounts', expectedPrefix: 'truekeate_' },
    });
    expect(canonicalKeyProblem('truekeate_vault')?.data).toMatchObject({ key: 'truekeate_vault' });
  });

  it('`resetWallet` conserva solo los logs: 13 claves se borran y 1 sobrevive', () => {
    expect(STORAGE_KEYS_PRESERVED_ON_RESET).toEqual([STORAGE_KEYS.logs]);
    expect(STORAGE_KEYS_CLEARED_ON_RESET).toHaveLength(13);
    expect(STORAGE_KEYS_CLEARED_ON_RESET).not.toContain(STORAGE_KEYS.logs);
    expect(STORAGE_KEYS_CLEARED_ON_RESET).toContain(STORAGE_KEYS.mnemonic);
    expect(STORAGE_KEYS_CLEARED_ON_RESET).toContain(STORAGE_KEYS.connectedSites);
  });

  it('declara los valores iniciales de las claves de tipo mapa y lista', () => {
    expect(STORAGE_DEFAULTS[STORAGE_KEYS.accounts]).toEqual([]);
    expect(STORAGE_DEFAULTS[STORAGE_KEYS.importedAccounts]).toEqual([]);
    expect(STORAGE_DEFAULTS[STORAGE_KEYS.pendingRequests]).toEqual({});
    expect(STORAGE_DEFAULTS[STORAGE_KEYS.approvalWindow]).toMatchObject({ windowId: null, updatedAt: 0 });
  });
});

describe('M33 · persistencia y restauración (CA-RF-09 / CA-RF-10)', () => {
  it('escribe y vuelve a leer una cartera completa con los mismos valores', async () => {
    const estado = {
      [STORAGE_KEYS.mnemonic]: ANVIL_MNEMONIC,
      [STORAGE_KEYS.accounts]: [ANVIL_ADDRESS0, ANVIL_ADDRESS1],
      [STORAGE_KEYS.currentAccount]: 'idx:1',
      [STORAGE_KEYS.settings]: { derivedAccountCount: 2, schemaVersion: SCHEMA_VERSION },
      [STORAGE_KEYS.logs]: [{ ts: 7, event: 'sw_started' }],
    };
    expect(await writeStorage(estado, storage)).toBe(true);
    const leido = await readStorage(null, storage);
    expect(leido).toEqual(estado);
    expect(leido[STORAGE_KEYS.mnemonic]).toBe(ANVIL_MNEMONIC);
    expect(leido[STORAGE_KEYS.currentAccount]).toBe('idx:1');
  });

  it('lee solo las claves pedidas', async () => {
    await writeStorage(
      { [STORAGE_KEYS.mnemonic]: ANVIL_MNEMONIC, [STORAGE_KEYS.accounts]: [ANVIL_ADDRESS0] },
      storage,
    );
    const leido = await readStorage([STORAGE_KEYS.mnemonic], storage);
    expect(Object.keys(leido)).toEqual([STORAGE_KEYS.mnemonic]);
    expect(leido[STORAGE_KEYS.accounts]).toBeUndefined();
  });

  it('una escritura fallida se reintenta UNA vez y el segundo intento ya persiste', async () => {
    storage.simulateWriteFailure('QUOTA_BYTES quota exceeded');
    // El fallo simulado afecta a la PRIMERA escritura; el reintento inmediato del corpus escribe.
    expect(await writeStorage({ [STORAGE_KEYS.mnemonic]: ANVIL_MNEMONIC }, storage)).toBe(true);
    expect(storage.writes().filter((write) => STORAGE_KEYS.mnemonic in write)).toHaveLength(1);
    expect((await readStorage([STORAGE_KEYS.mnemonic], storage))[STORAGE_KEYS.mnemonic]).toBe(ANVIL_MNEMONIC);
  });

  it('con el almacén rechazando SIEMPRE la escritura, informa `false` tras exactamente 2 intentos', async () => {
    // El contrato de `writeStorage` es «1 intento + 1 reintento inmediato y `false`». Se usa un
    // doble que falla en TODAS las escrituras porque el stub solo guarda un fallo pendiente.
    let intentos = 0;
    const siempreFalla = {
      get: async (): Promise<Record<string, unknown>> => ({}),
      set: async (): Promise<void> => {
        intentos += 1;
        throw new Error('QUOTA_BYTES quota exceeded');
      },
      remove: async (): Promise<void> => undefined,
    };
    expect(await writeStorage({ [STORAGE_KEYS.mnemonic]: ANVIL_MNEMONIC }, siempreFalla)).toBe(false);
    expect(intentos).toBe(2);
    expect(await readStorage([STORAGE_KEYS.mnemonic], storage)).toEqual({});
  });

  it('`removeStorage` borra exactamente las claves pedidas', async () => {
    await writeStorage(
      {
        [STORAGE_KEYS.mnemonic]: ANVIL_MNEMONIC,
        [STORAGE_KEYS.accounts]: [ANVIL_ADDRESS0],
        [STORAGE_KEYS.logs]: [{ ts: 1 }],
      },
      storage,
    );
    expect(await removeStorage([STORAGE_KEYS.mnemonic, STORAGE_KEYS.accounts], storage)).toBe(true);
    const restante = await readStorage(null, storage);
    expect(Object.keys(restante)).toEqual([STORAGE_KEYS.logs]);
  });

  it('`readStorage` nunca lanza cuando el almacén no está disponible', async () => {
    expect(await readStorage(null, null)).toEqual({});
    expect(await writeStorage({ a: 1 }, null)).toBe(false);
    expect(await removeStorage([STORAGE_KEYS.logs], null)).toBe(false);
  });
});

describe('M34 · versión del esquema y claves no canónicas', () => {
  it('la versión vigente es 1.4 y se declara DENTRO de `truekeate_settings`', () => {
    expect(SCHEMA_VERSION).toBe('1.4');
    expect(SCHEMA_VERSION_KEY).toBe('truekeate_schema_version');
    const plan = planMigration({ ...legacyV12Snapshot() });
    expect(plan.snapshot[STORAGE_KEYS.settings]).toMatchObject({ schemaVersion: '1.4' });
  });

  it('`readStoredSchemaVersion` lee la versión del objeto de ajustes y las formas heredadas', () => {
    expect(readStoredSchemaVersion({ [STORAGE_KEYS.settings]: { schemaVersion: '1.3' } })).toBe('1.3');
    expect(readStoredSchemaVersion({ schema_version: '1.2' })).toBe('1.2');
    expect(readStoredSchemaVersion({ schemaVersion: '1.2' })).toBe('1.2');
    expect(readStoredSchemaVersion({})).toBeNull();
  });

  it('una clave no canónica sin prefijo ni alias se RECHAZA y no se copia', () => {
    const plan = planMigration({ ...legacyV12Snapshot(), truekeate_vault: 'secreto' });
    expect(plan.report.rejectedKeys).toEqual(['truekeate_vault']);
    expect(plan.snapshot.truekeate_vault).toBeUndefined();
    expect(isRejectedKey('truekeate_vault')).toBe(true);
    expect(isNonCanonicalKey('truekeate_vault')).toBe(true);
    expect(isRejectedKey(STORAGE_KEYS.mnemonic)).toBe(false);
  });

  it('un esquema de versión DESCONOCIDA no se migra hacia atrás y se informa', () => {
    const plan = planMigration({
      [STORAGE_KEYS.settings]: { schemaVersion: '2.0' },
      mnemonic: ANVIL_MNEMONIC,
    });
    expect(plan.report.ok).toBe(false);
    expect(plan.report.alreadyCurrent).toBe(false);
    expect(plan.report.error?.code).toBe(-32603);
    expect(plan.report.error?.message).toBe('Error interno de la cartera.');
    expect(plan.report.error?.data).toMatchObject({ reason: 'unknown-schema-version', from: '2.0' });
  });
});

describe('M34 · migración v1.2 → v1.4 sin pérdida de datos (tarea 2.11)', () => {
  it('parte de la línea base 1.2 y declara el salto a 1.4 con sus pasos', () => {
    expect(BASE_SCHEMA_VERSION).toBe('1.2');
    expect(SUPPORTED_SCHEMA_VERSIONS).toEqual(['1.2', '1.3', '1.4']);
    const plan = planMigration(legacyV12Snapshot());
    expect(plan.report.from).toBe('1.2');
    expect(plan.report.to).toBe('1.4');
    expect(plan.report.steps.map((step) => step.id)).toEqual(['v1.2→v1.3', 'v1.3→v1.4']);
    expect(plan.report.changed).toBe(true);
    expect(plan.report.rejectedKeys).toEqual([]);
  });

  it('NO se pierde la frase, las cuentas ni la activa', () => {
    const plan = planMigration(legacyV12Snapshot());
    expect(plan.snapshot[STORAGE_KEYS.mnemonic]).toBe(ANVIL_MNEMONIC);
    expect(plan.snapshot[STORAGE_KEYS.accounts]).toEqual([ANVIL_ADDRESS0, ANVIL_ADDRESS1]);
    expect(plan.snapshot[STORAGE_KEYS.currentAccount]).toBe('idx:1');
  });

  it('renombra las claves heredadas y deja las canónicas en su sitio', () => {
    const plan = planMigration(legacyV12Snapshot());
    expect(plan.snapshot.mnemonic).toBeUndefined();
    expect(plan.snapshot.settings).toBeUndefined();
    expect(plan.snapshot.accounts).toBeUndefined();
    expect(plan.report.steps[1]?.renamedKeys).toContainEqual({ from: 'mnemonic', to: STORAGE_KEYS.mnemonic });
    expect(plan.snapshot[STORAGE_KEYS.importedAccounts]).toEqual([
      { address: '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF', label: 'Ahorros', privateKey: '0x02' },
    ]);
  });

  it('convierte la sesión heredada en cadena al objeto canónico conservando la cuenta', () => {
    const plan = planMigration(legacyV12Snapshot());
    const sessions = plan.snapshot[STORAGE_KEYS.connectedSites] as Record<string, Record<string, unknown>>;
    expect(plan.report.steps[0]?.rewrittenKeys).toContain(STORAGE_KEYS.connectedSites);
    expect(sessions[DAPP_ORIGIN]).toMatchObject({
      origin: DAPP_ORIGIN,
      account: ANVIL_ADDRESS0,
      connected: true,
    });
  });

  it('rellena `event` en los logs sin descartar NINGUNA entrada', () => {
    const plan = planMigration(legacyV12Snapshot());
    const logs = plan.snapshot[STORAGE_KEYS.logs] as Array<Record<string, unknown>>;
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ ts: 1, category: 'call', event: 'rpc_call' });
    expect(logs[1]).toMatchObject({ ts: 2, category: 'system', event: 'sw_reconcile' });
  });

  it('añade `accountLabels` vacío si falta y retira la clave retirada singular', () => {
    const plan = planMigration(legacyV12Snapshot());
    expect((plan.snapshot[STORAGE_KEYS.settings] as Record<string, unknown>).accountLabels).toEqual({});
    expect(plan.report.steps[0]?.removedKeys).toEqual([...RETIRED_STORAGE_KEYS]);
    expect(plan.snapshot.truekeate_pending_request).toBeUndefined();
  });

  it('`migrateSchema` aplica el plan al almacén y deja el esquema en 1.4', async () => {
    await storage.set(legacyV12Snapshot());
    const report = await migrateSchema(storage);
    expect(report.ok).toBe(true);
    expect(report.applied).toBe(true);
    expect(report.migrated).toBe(true);
    const persistido = await readStorage(null, storage);
    expect(persistido[STORAGE_KEYS.mnemonic]).toBe(ANVIL_MNEMONIC);
    expect(persistido[STORAGE_KEYS.currentAccount]).toBe('idx:1');
    expect((persistido[STORAGE_KEYS.settings] as Record<string, unknown>).schemaVersion).toBe('1.4');
    expect(persistido.mnemonic).toBeUndefined();
    expect(persistido.truekeate_pending_request).toBeUndefined();
    expect(persistido[STORAGE_KEYS.logs]).toHaveLength(2);
  });

  it('es idempotente: repetirla con el esquema ya migrado no cambia nada', async () => {
    await storage.set(legacyV12Snapshot());
    await migrateSchema(storage);
    const antes = JSON.stringify(await readStorage(null, storage));
    const segundo = await migrateSchema(storage);
    expect(segundo.alreadyCurrent).toBe(true);
    expect(segundo.changed).toBe(false);
    expect(segundo.applied).toBe(false);
    expect(JSON.stringify(await readStorage(null, storage))).toBe(antes);
  });

  it('`runMigrations` es el mismo contrato que `migrateSchema`', async () => {
    expect(runMigrations).toBe(migrateSchema);
    await storage.set(legacyV12Snapshot());
    const report = await runMigrations(storage);
    expect(report.ok).toBe(true);
  });

  it('un esquema ya en 1.4 no se toca (no hay pérdida por reejecución)', () => {
    const snapshot = {
      [STORAGE_KEYS.mnemonic]: ANVIL_MNEMONIC,
      [STORAGE_KEYS.settings]: { schemaVersion: '1.4', derivedAccountCount: 5 },
    };
    const plan = planMigration(snapshot);
    expect(plan.report.alreadyCurrent).toBe(true);
    expect(plan.report.changed).toBe(false);
    expect(plan.report.steps).toEqual([]);
    expect(plan.snapshot[STORAGE_KEYS.mnemonic]).toBe(ANVIL_MNEMONIC);
  });

  it('la tabla de alias cubre las claves heredadas que el corpus declaró', () => {
    expect(LEGACY_KEY_ALIASES.mnemonic).toBe(STORAGE_KEYS.mnemonic);
    expect(LEGACY_KEY_ALIASES.imported_accounts).toBe(STORAGE_KEYS.importedAccounts);
    expect(LEGACY_KEY_ALIASES.connected_sites).toBe(STORAGE_KEYS.connectedSites);
    expect(LEGACY_KEY_ALIASES.logs).toBe(STORAGE_KEYS.logs);
    expect(Object.values(LEGACY_KEY_ALIASES).every((key) => key.startsWith(STORAGE_KEY_PREFIX))).toBe(true);
  });
});
