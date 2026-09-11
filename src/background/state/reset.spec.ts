/**
 * `src/background/state/reset.spec.ts` — M33 (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre `CA-RF-11` (parte 1) y el **orden de comprobación** de §3.9 (R-09b / DEC-46):
 *   1. cola `truekeate_pending_requests` sin entradas `pending`;
 *   2. sin transacción en vuelo vigente en `truekeate_inflight_tx`;
 *   3. confirmación destructiva explícita;
 *   4. borrado de las claves `truekeate_*` **salvo** `truekeate_logs` (RF-32).
 *
 * El orden se verifica de forma OBSERVABLE: mientras una guarda bloquea, el almacén no recibe
 * ninguna escritura (registro `writes()` del stub) y el informe declara los dos contadores.
 */

import { describe, expect, it } from 'vitest';
import { chromeStub } from '../../../test/setup/chrome-stub';
import { INFLIGHT_TTL_MS } from '../../shared/constants';
import {
  RESET_WALLET_LOG_EVENT,
  STORAGE_KEYS,
  STORAGE_KEYS_CLEARED_ON_RESET,
  STORAGE_KEYS_PRESERVED_ON_RESET,
  checkResetGuards,
  countActiveInflightTx,
  countPendingRequests,
  readStorage,
  resetWallet,
} from './schema';

/** Frase de Anvil: el material que el reset debe destruir. */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Dirección EIP-55 de la cuenta 0 de Anvil. */
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Origen de la dApp de pruebas. */
const DAPP_ORIGIN = 'http://localhost:5174';

/** Instante fijo de la comprobación. */
const NOW = 1_700_000_000_000;

/** Almacén del stub. */
const storage = chromeStub.storage.local;

/** Cartera completa con logs y sesiones, tal y como queda antes de un reset. */
const walletSnapshot = (): Record<string, unknown> => ({
  [STORAGE_KEYS.mnemonic]: ANVIL_MNEMONIC,
  [STORAGE_KEYS.accounts]: [ANVIL_ADDRESS0],
  [STORAGE_KEYS.importedAccounts]: [
    { address: '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF', privateKey: `0x${'2'.padStart(64, '0')}`, label: 'Ahorros', importedAt: 1, visible: true },
  ],
  [STORAGE_KEYS.currentAccount]: 'idx:0',
  [STORAGE_KEYS.connectedSites]: {
    [DAPP_ORIGIN]: {
      origin: DAPP_ORIGIN,
      account: ANVIL_ADDRESS0,
      connectedAt: 1,
      lastUsedAt: 2,
      expiresAt: null,
      connected: true,
    },
  },
  [STORAGE_KEYS.settings]: { derivedAccountCount: 5, schemaVersion: '1.4' },
  [STORAGE_KEYS.logs]: [{ ts: 1, event: 'sw_started', category: 'system', level: 'info', origin: 'extension' }],
});

/** Escrituras registradas por el stub desde la última marca. */
const writeCount = (): number => storage.writes().length;

describe('M33 · contadores de las guardas del reset', () => {
  it('cuenta solo las solicitudes con `status: \"pending\"`', () => {
    const pendientes = {
      'id-1': { status: 'pending' },
      'id-2': { status: 'approved' },
      'id-3': { status: 'rejected' },
      'id-4': { status: 'pending' },
    };
    expect(countPendingRequests(pendientes)).toBe(2);
    expect(countPendingRequests({})).toBe(0);
    expect(countPendingRequests(null)).toBe(0);
    expect(countPendingRequests([])).toBe(0);
    expect(countPendingRequests('no-es-mapa')).toBe(0);
  });

  it('cuenta solo las transacciones en vuelo VIGENTES (`expiresAt > now`)', () => {
    const inflight = {
      '0xaa': { expiresAt: NOW + 1, txHash: '0x1' },
      '0xbb': { expiresAt: NOW, txHash: '0x2' },
      '0xcc': { expiresAt: NOW - 1, txHash: '0x3' },
      '0xdd': { txHash: '0x4' },
    };
    expect(countActiveInflightTx(inflight, NOW)).toBe(1);
    // El umbral es estricto: `expiresAt === now` ya NO está vigente; con `now - 2` lo están tres.
    expect(countActiveInflightTx(inflight, NOW - 2)).toBe(3);
    expect(countActiveInflightTx(inflight, NOW + INFLIGHT_TTL_MS)).toBe(0);
    expect(countActiveInflightTx(null, NOW)).toBe(0);
  });

  it('una marca sin `expiresAt` numérico NO bloquea el reset para siempre', () => {
    expect(countActiveInflightTx({ '0xaa': { expiresAt: 'ayer' } }, NOW)).toBe(0);
    expect(checkResetGuards({ [STORAGE_KEYS.inflightTx]: { '0xaa': {} } }, NOW).canProceed).toBe(true);
  });

  it('`canProceed` solo es `true` con la cola y el vuelo vacíos', () => {
    expect(checkResetGuards({}, NOW)).toEqual({
      canProceed: true,
      pendingCount: 0,
      inflightCount: 0,
      error: null,
    });
    const soloCola = checkResetGuards({ [STORAGE_KEYS.pendingRequests]: { a: { status: 'pending' } } }, NOW);
    expect(soloCola.canProceed).toBe(false);
    expect(soloCola.error?.code).toBe(-32000);
    const soloVuelo = checkResetGuards({ [STORAGE_KEYS.inflightTx]: { a: { expiresAt: NOW + 1 } } }, NOW);
    expect(soloVuelo.canProceed).toBe(false);
    expect(soloVuelo.error?.code).toBe(-32000);
  });
});

describe('CA-RF-11 · reset con la cola vacía', () => {
  it('borra 13 claves, CONSERVA `truekeate_logs` y deja el estado en `done`', async () => {
    await storage.set(walletSnapshot());
    const outcome = await resetWallet({ confirm: true, now: NOW, storage });

    expect(outcome.status).toBe('done');
    expect(outcome.error).toBeNull();
    expect(outcome.removedKeys).toEqual(STORAGE_KEYS_CLEARED_ON_RESET);
    expect(outcome.removedKeys).toHaveLength(13);
    expect(outcome.preservedKeys).toEqual([STORAGE_KEYS.logs]);
    expect(outcome.pendingCount).toBe(0);
    expect(outcome.inflightCount).toBe(0);
    expect(outcome.logEvent).toBe(RESET_WALLET_LOG_EVENT);
    expect(outcome.logEvent).toBe('reset_wallet');

    const restante = await readStorage(null, storage);
    expect(Object.keys(restante)).toEqual([STORAGE_KEYS.logs]);
    expect(restante[STORAGE_KEYS.mnemonic]).toBeUndefined();
    expect(restante[STORAGE_KEYS.accounts]).toBeUndefined();
    expect(restante[STORAGE_KEYS.connectedSites]).toBeUndefined();
    expect(restante[STORAGE_KEYS.logs]).toEqual([
      { ts: 1, event: 'sw_started', category: 'system', level: 'info', origin: 'extension' },
    ]);
  });

  it('no deja rastro del mnemonic ni de la clave privada de la importada', async () => {
    await storage.set(walletSnapshot());
    await resetWallet({ confirm: true, now: NOW, storage });
    const serializado = JSON.stringify(chromeStub.rawStorage());
    expect(serializado).not.toContain('junk');
    expect(serializado).not.toContain(`0x${'2'.padStart(64, '0')}`);
  });

  it('ejecuta la limpieza de plataforma (alarmas y badge) antes de borrar', async () => {
    await storage.set(walletSnapshot());
    const orden: string[] = [];
    const outcome = await resetWallet({
      confirm: true,
      now: NOW,
      storage,
      cancelExpiryAlarms: async () => {
        orden.push('alarmas');
      },
      clearBadge: async () => {
        orden.push('badge');
      },
    });
    expect(outcome.status).toBe('done');
    expect(orden).toEqual(['alarmas', 'badge']);
  });

  it('es idempotente: repetirlo con el almacén ya limpio vuelve a terminar en `done`', async () => {
    await storage.set(walletSnapshot());
    await resetWallet({ confirm: true, now: NOW, storage });
    const segundo = await resetWallet({ confirm: true, now: NOW, storage });
    expect(segundo.status).toBe('done');
    expect(await readStorage(null, storage)).toEqual({
      [STORAGE_KEYS.logs]: walletSnapshot()[STORAGE_KEYS.logs],
    });
  });
});

describe('CA-RF-11 · bloqueo del reset (`-32000 resetBlocked`)', () => {
  it('con una solicitud `pending` bloquea, nombra el número exacto y NO escribe nada', async () => {
    await storage.set({
      ...walletSnapshot(),
      [STORAGE_KEYS.pendingRequests]: { 'id-1': { status: 'pending' }, 'id-2': { status: 'pending' } },
    });
    const writesBefore = writeCount();
    const outcome = await resetWallet({ confirm: true, now: NOW, storage });

    expect(outcome.status).toBe('blocked');
    expect(outcome.pendingCount).toBe(2);
    expect(outcome.inflightCount).toBe(0);
    expect(outcome.error?.code).toBe(-32000);
    expect(outcome.error?.message).toBe(
      'No se puede resetear la cartera: quedan 2 solicitudes pendientes o una transacción en vuelo. Resuélvelas (aprueba o rechaza) o espera a que expiren.',
    );
    // El estado sigue intacto: la guarda se comprueba ANTES de cualquier borrado.
    expect(writeCount()).toBe(writesBefore);
    expect((await readStorage([STORAGE_KEYS.mnemonic], storage))[STORAGE_KEYS.mnemonic]).toBe(ANVIL_MNEMONIC);
  });

  it('con una transacción en vuelo vigente bloquea y NO escribe nada', async () => {
    await storage.set({
      ...walletSnapshot(),
      [STORAGE_KEYS.inflightTx]: { [ANVIL_ADDRESS0]: { expiresAt: NOW + INFLIGHT_TTL_MS, txHash: '0xabc' } },
    });
    const writesBefore = writeCount();
    const outcome = await resetWallet({ confirm: true, now: NOW, storage });

    expect(outcome.status).toBe('blocked');
    expect(outcome.inflightCount).toBe(1);
    expect(outcome.pendingCount).toBe(0);
    expect(outcome.error?.code).toBe(-32000);
    expect(writeCount()).toBe(writesBefore);
  });

  it('con el vuelo CADUCADO ya no bloquea y el reset procede', async () => {
    await storage.set({
      ...walletSnapshot(),
      [STORAGE_KEYS.inflightTx]: { [ANVIL_ADDRESS0]: { expiresAt: NOW - 1, txHash: '0xabc' } },
    });
    const outcome = await resetWallet({ confirm: true, now: NOW, storage });
    expect(outcome.status).toBe('done');
    expect(outcome.inflightCount).toBe(0);
  });

  it('con la cola y el vuelo a la vez, informa de los DOS contadores', async () => {
    await storage.set({
      ...walletSnapshot(),
      [STORAGE_KEYS.pendingRequests]: { 'id-1': { status: 'pending' } },
      [STORAGE_KEYS.inflightTx]: { [ANVIL_ADDRESS0]: { expiresAt: NOW + 1 } },
    });
    const outcome = await resetWallet({ confirm: true, now: NOW, storage });
    expect(outcome.status).toBe('blocked');
    expect(outcome.pendingCount).toBe(1);
    expect(outcome.inflightCount).toBe(1);
    expect(outcome.error?.message).toContain('quedan 1 solicitudes pendientes');
  });

  it('la cola bloquea ANTES de leer el vuelo: el error nombra solo las pendientes', async () => {
    // Orden observable de §3.9: primero la cola. Con la cola bloqueada, `canProceed` es `false`
    // y el literal del error se construye con `pendingCount`, que es el que pinta la UI.
    const guards = checkResetGuards(
      {
        [STORAGE_KEYS.pendingRequests]: { 'id-1': { status: 'pending' } },
        [STORAGE_KEYS.inflightTx]: { [ANVIL_ADDRESS0]: { expiresAt: NOW + 1 } },
      },
      NOW,
    );
    expect(guards.error?.message).toContain('quedan 1 solicitudes pendientes');
    expect(guards.error?.message).not.toContain('quedan 2');
  });
});

describe('CA-RF-11 · confirmación destructiva (paso 3 del orden)', () => {
  it('sin `confirm` el reset queda en `cancelled` y NO toca el almacén', async () => {
    await storage.set(walletSnapshot());
    const writesBefore = writeCount();
    const outcome = await resetWallet({ confirm: false, now: NOW, storage });

    expect(outcome.status).toBe('cancelled');
    expect(outcome.error).toBeNull();
    expect(outcome.removedKeys).toEqual([]);
    expect(writeCount()).toBe(writesBefore);
    expect((await readStorage([STORAGE_KEYS.mnemonic], storage))[STORAGE_KEYS.mnemonic]).toBe(ANVIL_MNEMONIC);
  });

  it('la falta de confirmación se comprueba DESPUÉS de las guardas de estado', async () => {
    await storage.set({
      ...walletSnapshot(),
      [STORAGE_KEYS.pendingRequests]: { 'id-1': { status: 'pending' } },
    });
    // Sin confirmar y con cola pendiente gana la guarda: `blocked`, no `cancelled`.
    const outcome = await resetWallet({ confirm: false, now: NOW, storage });
    expect(outcome.status).toBe('blocked');
    expect(outcome.error?.code).toBe(-32000);
  });

  it('tampoco llama a la limpieza de plataforma cuando está bloqueado o cancelado', async () => {
    await storage.set(walletSnapshot());
    let limpiezas = 0;
    const deps = {
      now: NOW,
      storage,
      cancelExpiryAlarms: async () => {
        limpiezas += 1;
      },
    };
    await resetWallet({ ...deps, confirm: false });
    expect(limpiezas).toBe(0);

    await storage.set({ ...walletSnapshot(), [STORAGE_KEYS.pendingRequests]: { a: { status: 'pending' } } });
    await resetWallet({ ...deps, confirm: true });
    expect(limpiezas).toBe(0);
  });
});

describe('CA-RF-11 · instantánea inyectada y fallo de escritura', () => {
  it('usa la instantánea inyectada sin volver a leer el almacén', async () => {
    await storage.set(walletSnapshot());
    // La instantánea dice que está bloqueado; el almacén real ya está vacío.
    const outcome = await resetWallet({
      confirm: true,
      now: NOW,
      storage,
      snapshot: { [STORAGE_KEYS.pendingRequests]: { 'id-1': { status: 'pending' } } },
    });
    expect(outcome.status).toBe('blocked');
    expect(outcome.pendingCount).toBe(1);
    // Nada tocado.
    expect((await readStorage([STORAGE_KEYS.mnemonic], storage))[STORAGE_KEYS.mnemonic]).toBe(ANVIL_MNEMONIC);
  });

  it('si el borrado no se puede completar, termina en `failed` con `-32603`', async () => {
    const outcome = await resetWallet({ confirm: true, now: NOW, storage: null });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.code).toBe(-32603);
    expect(outcome.error?.message).toBe('Error interno de la cartera.');
    expect(outcome.error?.data).toMatchObject({ reason: 'reset-write-failed' });
    expect(outcome.removedKeys).toEqual([]);
  });

  it('un fallo de la limpieza de plataforma NO impide borrar el material sensible', async () => {
    await storage.set(walletSnapshot());
    const outcome = await resetWallet({
      confirm: true,
      now: NOW,
      storage,
      cancelExpiryAlarms: async () => {
        throw new Error('alarma rota');
      },
    });
    expect(outcome.status).toBe('done');
    expect((await readStorage([STORAGE_KEYS.mnemonic], storage))[STORAGE_KEYS.mnemonic]).toBeUndefined();
  });

  it('el reset NO escribe en `truekeate_logs` en este hito (H5 lo instrumenta)', async () => {
    await storage.set(walletSnapshot());
    const antes = (await readStorage([STORAGE_KEYS.logs], storage))[STORAGE_KEYS.logs];
    await resetWallet({ confirm: true, now: NOW, storage });
    const despues = (await readStorage([STORAGE_KEYS.logs], storage))[STORAGE_KEYS.logs];
    expect(despues).toEqual(antes);
  });
});
