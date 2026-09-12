/**
 * M16 — `src/background/approvals/approvalReconcile.spec.ts`
 * Reconciliación al arrancar el Service Worker (H4, tarea 4.5 de `plan_desarrollo.md` §3.4.5).
 *
 * Criterios que fija este fichero:
 * - Las entradas **ya vencidas** se purgan y reciben su `4001`; las resueltas se retiran sin más.
 * - Las alarmas se **rearman desde el `expiresAt` persistido** y el rearme **NO dispara** ninguna
 *   alarma (no adelanta ni retrasa el plazo, ni entrega un `4001` que no toque).
 * - RNF-08: con 50 pendientes y reloj inyectado, la reconciliación mide **< 1 s**.
 */

import { describe, expect, it } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../../../test/setup/chrome-stub';
import { INFLIGHT_TTL_MS, SIGN_TIMEOUT_MS } from '../../shared/constants';
import type { PendingRequest, PendingRequestsMap } from '../../shared/types';
import { STORAGE_KEYS } from '../state/schema';
import { readInflightTx, readPendingRequests } from './queue';
import type { WindowsApiLike } from './focus';
import {
  planInflightReconciliation,
  reconcileApprovals,
  releaseInflightOnAlarm,
  type ReconcileOptions,
} from './reconcile';
import { expiryAlarmName, inflightReleaseAlarmName, type AlarmLike } from './timeout';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** Cuenta #1 de Anvil. */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

/** `expiresAt` vigente en el instante de referencia. */
const VIGENTE = STUB_EPOCH_MS + SIGN_TIMEOUT_MS;

/** `expiresAt` ya vencido en el instante de referencia. */
const VENCIDO = STUB_EPOCH_MS - 1;

/** Construye una entrada de la cola con valores por defecto coherentes. */
const entrada = (approvalId: string, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId,
  method: 'personal_sign',
  params: [],
  origin: `https://${approvalId}.example`,
  tabId: null,
  frameId: null,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: STUB_EPOCH_MS,
  expiresAt: VIGENTE,
  status: 'pending',
  ...overrides,
});

/** Escribe un mapa de cola directamente en el almacén del stub. */
const sembrarCola = async (mapa: PendingRequestsMap): Promise<void> => {
  await chromeStub.storage.local.set({ [STORAGE_KEYS.pendingRequests]: mapa });
};

/** Escribe un mapa de marcas `inflight` directamente en el almacén del stub. */
const sembrarInflight = async (mapa: Record<string, unknown>): Promise<void> => {
  await chromeStub.storage.local.set({ [STORAGE_KEYS.inflightTx]: mapa });
};

/** Entradas de `truekeate_logs` escritas durante la prueba. */
const leerLogs = async (): Promise<Record<string, unknown>[]> => {
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) as Record<string, unknown>;
  return (items[STORAGE_KEYS.logs] ?? []) as Record<string, unknown>[];
};

/** Opciones de reconciliación aisladas de la ventana única y de los efectos externos. */
const opcionesAisladas = (extra: Partial<ReconcileOptions> = {}): ReconcileOptions => ({
  now: STUB_EPOCH_MS,
  alarms: chromeStub.alarms,
  restoreWindow: false,
  reconcileRateWindows: false,
  badge: false,
  ...extra,
});

describe('M16 · purga al arrancar: vencidas con 4001 y resueltas retiradas', () => {
  it('purga lo resuelto y lo vencido, entrega 4001 a la huérfana y deja UNA traza sw_reconcile', async () => {
    await sembrarCola({
      viva: entrada('viva', { origin: 'https://viva.example' }),
      vencida: entrada('vencida', { expiresAt: VENCIDO, origin: 'https://vencida.example', tabId: 9 }),
      resuelta: entrada('resuelta', { status: 'rejected', errorCode: 4001 }),
    });
    const entregas: Array<{ approvalId: string; code: number | undefined }> = [];

    const informe = await reconcileApprovals(
      opcionesAisladas({
        deliver: async (request, response) => {
          entregas.push({
            approvalId: request.approvalId,
            code: 'error' in response ? response.error.code : undefined,
          });
          return 'tab';
        },
      }),
    );

    expect(informe.pendingBefore).toBe(2);
    expect(informe.pendingAfter).toBe(1);
    expect(informe.purgedResolved).toBe(1);
    expect(informe.purgedExpired).toBe(1);
    expect(informe.orphansDelivered).toBe(1);
    expect(informe.orphansUndelivered).toBe(0);
    expect(entregas).toEqual([{ approvalId: 'vencida', code: 4001 }]);
    expect(Object.keys(await readPendingRequests())).toEqual(['viva']);
    expect(informe.rearm).toEqual({ armed: 1, cleared: 0, pending: 1 });
    expect(informe.logWritten).toBe(true);

    const logs = await leerLogs();
    expect(logs.map((entrada) => entrada.event).sort()).toEqual(['approval_expired', 'sw_reconcile']);
    const reconciliacion = logs.find((entrada) => entrada.event === 'sw_reconcile');
    expect(reconciliacion).toMatchObject({
      category: 'system',
      level: 'warn',
      message: 'Reconciliación al arrancar el Service Worker',
      data: {
        pendingBefore: 2,
        pendingAfter: 1,
        purgedResolved: 1,
        purgedExpired: 1,
        orphansDelivered: 1,
        orphansUndelivered: 0,
        window: null,
      },
    });
  });

  it('una huérfana sin destinatario cuenta como `orphansUndelivered` y la entrada se purga igual', async () => {
    await sembrarCola({ huerfana: entrada('huerfana', { expiresAt: VENCIDO }) });

    const informe = await reconcileApprovals(opcionesAisladas({ deliver: async () => 'none' }));

    expect(informe.orphansDelivered).toBe(0);
    expect(informe.orphansUndelivered).toBe(1);
    expect(informe.purgedExpired).toBe(1);
    expect(informe.pendingAfter).toBe(0);
    expect(await readPendingRequests()).toEqual({});
  });

  it('el badge derivado se purga con el índice posterior a la purga', async () => {
    await sembrarCola({
      viva: entrada('viva'),
      vencida: entrada('vencida', { expiresAt: VENCIDO }),
    });

    await reconcileApprovals(
      opcionesAisladas({ badge: true, deliver: async () => 'none' }),
    );

    expect(chromeStub.action.badgeText()).toBe('1');
  });
});

describe('M16 · rearme de alarmas sin dispararlas', () => {
  it('rearma en el `expiresAt` PERSISTIDO y no entrega ningún 4001 al hacerlo', async () => {
    await sembrarCola({ viva: entrada('viva') });
    const entregas: string[] = [];

    const informe = await reconcileApprovals(
      opcionesAisladas({
        now: STUB_EPOCH_MS + 30_000,
        deliver: async (request: PendingRequest) => {
          entregas.push(request.approvalId);
          return 'port';
        },
      }),
    );

    expect(entregas, 'el rearme no dispara el vencimiento').toEqual([]);
    expect(informe.rearm).toEqual({ armed: 1, cleared: 0, pending: 1 });
    // El instante programado es el persistido (creación + 120 s), NO `now + 120 s`.
    expect((await chromeStub.alarms.get(expiryAlarmName('viva')))?.scheduledTime).toBe(VIGENTE);
    expect(await readPendingRequests()).toHaveProperty('viva');
  });

  it('retira las alarmas huérfanas y NO reprograma las de las vencidas', async () => {
    await sembrarCola({ vencida: entrada('vencida', { expiresAt: VENCIDO }) });
    chromeStub.alarms.create(expiryAlarmName('vencida'), { when: VENCIDO });
    chromeStub.alarms.create(expiryAlarmName('fantasma'), { when: STUB_EPOCH_MS + 1_000 });

    const informe = await reconcileApprovals(opcionesAisladas({ deliver: async () => 'none' }));

    expect(informe.rearm).toEqual({ armed: 0, cleared: 2, pending: 0 });
    expect(await chromeStub.alarms.getAll()).toEqual([]);
  });

  it('la segunda pasada es idempotente: no reescribe la cola y deja su propio sw_reconcile', async () => {
    await sembrarCola({ viva: entrada('viva') });
    const primera = await reconcileApprovals(opcionesAisladas());
    const colaTrasPrimera = await readPendingRequests();
    const escrituras = chromeStub.storage.local.writes().length;

    const segunda = await reconcileApprovals(opcionesAisladas({ now: STUB_EPOCH_MS + 1_000 }));

    expect(primera.purgedExpired).toBe(0);
    expect(segunda.purgedExpired).toBe(0);
    expect(segunda.purgedResolved).toBe(0);
    expect(segunda.rearm).toEqual({ armed: 1, cleared: 0, pending: 1 });
    expect(await readPendingRequests()).toEqual(colaTrasPrimera);
    // La segunda pasada solo añade su traza: ninguna escritura de la cola.
    const nuevas = chromeStub.storage.local.writes().slice(escrituras);
    expect(nuevas.every((escritura) => !(STORAGE_KEYS.pendingRequests in escritura))).toBe(true);
    expect((await leerLogs()).filter((entrada) => entrada.event === 'sw_reconcile')).toHaveLength(2);
  });

  it('RNF-08: con 50 pendientes y reloj inyectado la reconciliación mide < 1 s', async () => {
    const mapa: PendingRequestsMap = {};
    for (let indice = 0; indice < 50; indice += 1) {
      mapa[`pendiente-${indice}`] = entrada(`pendiente-${indice}`, {
        createdAt: STUB_EPOCH_MS + indice,
        expiresAt: STUB_EPOCH_MS + 120_000 + indice,
      });
    }
    await sembrarCola(mapa);
    let llamadas = 0;
    const reloj = (): number => {
      llamadas += 1;
      return llamadas === 1 ? 0 : 999;
    };

    const informe = await reconcileApprovals(
      opcionesAisladas({ clock: reloj }),
    );

    expect(informe.elapsedMs).toBe(999);
    expect(informe.elapsedMs).toBeLessThan(1_000);
    expect(informe.pendingBefore).toBe(50);
    expect(informe.pendingAfter).toBe(50);
    expect(informe.rearm.armed).toBe(50);
    expect(informe.purgedExpired).toBe(0);
    const alarmas = (await chromeStub.alarms.getAll()) ?? [];
    expect(alarmas.length).toBe(50);
  });
});

describe('M16 · reconstrucción de `truekeate_inflight_tx` (§2.12)', () => {
  it('libera la firma vencida, cierra la difusión con recibo y descarta la difusión sin recibo', async () => {
    const hashConfirmado = `0x${'aa'.repeat(32)}`;
    const hashSinRecibo = `0x${'bb'.repeat(32)}`;
    await sembrarInflight({
      [CUENTA_0]: {
        account: CUENTA_0,
        approvalId: 'firmando-vigente',
        phase: 'signing',
        nonce: 7,
        txHash: null,
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + INFLIGHT_TTL_MS,
      },
      [CUENTA_1]: {
        account: CUENTA_1,
        approvalId: 'firmando-vencida',
        phase: 'signing',
        nonce: 2,
        txHash: null,
        startedAt: STUB_EPOCH_MS - INFLIGHT_TTL_MS - 1,
        expiresAt: STUB_EPOCH_MS - 1,
      },
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
        account: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        approvalId: 'difundida-confirmada',
        phase: 'broadcast',
        txHash: hashConfirmado,
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + INFLIGHT_TTL_MS,
      },
      '0x90F79bf6EB2c4f870365E785982E1f101E93b906': {
        account: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        approvalId: 'difundida-sin-recibo',
        phase: 'broadcast',
        txHash: hashSinRecibo,
        startedAt: STUB_EPOCH_MS - INFLIGHT_TTL_MS - 1,
        expiresAt: STUB_EPOCH_MS - 1,
      },
    });

    const informe = await reconcileApprovals(
      opcionesAisladas({
        readReceipt: async (txHash: string) => (txHash === hashConfirmado ? 'confirmed' : null),
      }),
    );

    expect(informe.inflight).toEqual({
      released: 1,
      dropped: 1,
      retained: 1,
      confirmed: 1,
      failed: 0,
      alarmsArmed: 1,
      alarmsCleared: 0,
      persisted: true,
    });
    const inflight = await readInflightTx();
    expect(Object.keys(inflight)).toEqual([CUENTA_0]);
    expect(inflight[CUENTA_0]?.approvalId).toBe('firmando-vigente');
    // Se rearma la liberación de la firma vigente en su `expiresAt`.
    expect(
      (await chromeStub.alarms.get(inflightReleaseAlarmName(CUENTA_0)))?.scheduledTime,
    ).toBe(STUB_EPOCH_MS + INFLIGHT_TTL_MS);

    const logs = await leerLogs();
    expect(logs.filter((entrada) => entrada.event === 'tx_confirmed')).toHaveLength(1);
    expect(logs.filter((entrada) => entrada.event === 'rpc_error')).toHaveLength(2);
    // Ninguna traza contiene la transacción íntegra: solo el hash (RNF-09).
    expect(logs.some((entrada) => entrada.txHash === hashConfirmado)).toBe(true);
    // D-H4-E6 CORREGIDO en H4: la traza de la difusión interrumpida rellena TAMBIÉN el campo
    // `txHash` del `LogEntry` (el que consume el panel de actividad, RF-31), sin dejar de llevarlo
    // en `data`. La expectativa anterior (`undefined`) codificaba el defecto, no la especificación.
    const interrumpida = logs.find(
      (entrada) => (entrada.data as { reason?: string } | undefined)?.reason === 'broadcast-interrupted',
    );
    expect(interrumpida).toBeDefined();
    expect((interrumpida?.data as { txHash?: string }).txHash).toBe(hashSinRecibo);
    expect(interrumpida?.txHash).toBe(hashSinRecibo);
  });

  it('planInflightReconciliation es puro: no escribe y conserva `broadcast` dentro del TTL', async () => {
    const hash = `0x${'cc'.repeat(32)}` as `0x${string}`;
    const mapa = {
      [CUENTA_0]: {
        account: CUENTA_0,
        approvalId: 'difundida',
        phase: 'broadcast' as const,
        txHash: hash,
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + INFLIGHT_TTL_MS,
      },
    };

    const plan = await planInflightReconciliation(mapa, { now: STUB_EPOCH_MS + 1_000 });

    expect(plan.report).toEqual({ released: 0, dropped: 0, retained: 1, confirmed: 0, failed: 0 });
    expect(Object.keys(plan.map)).toEqual([CUENTA_0]);
    expect(plan.traces).toEqual([]);
    expect(chromeStub.storage.local.writes()).toEqual([]);
  });

  it('releaseInflightOnAlarm libera por cuenta sin distinguir mayúsculas y deja traza', async () => {
    await sembrarInflight({
      [CUENTA_0]: {
        account: CUENTA_0,
        approvalId: 'firmando',
        phase: 'signing',
        txHash: null,
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + INFLIGHT_TTL_MS,
      },
    });

    const liberada = await releaseInflightOnAlarm(CUENTA_0.toLowerCase(), { now: STUB_EPOCH_MS });

    expect(liberada).toBe(true);
    expect(await readInflightTx()).toEqual({});
    const logs = await leerLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'rpc_error',
      category: 'system',
      level: 'warn',
      data: { code: -32603, reason: 'inflight-ttl', account: CUENTA_0.toLowerCase() },
    });
    expect(await releaseInflightOnAlarm(CUENTA_0.toLowerCase())).toBe(false);
  });
});

describe('M16 · reconstrucción de la ventana única y de la tasa al arrancar', () => {
  it('abre la ventana única con la `pending` más antigua al arrancar', async () => {
    await sembrarCola({
      nueva: entrada('nueva', { createdAt: STUB_EPOCH_MS + 10, origin: 'https://nueva.example' }),
      antigua: entrada('antigua', { origin: 'https://antigua.example' }),
    });

    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      windows: chromeStub.windows as unknown as WindowsApiLike,
      reconcileRateWindows: false,
      log: false,
      badge: false,
    });

    expect(informe.window?.action).toBe('opened');
    expect(informe.window?.shownApprovalId).toBe('antigua');
    expect(informe.window?.pendingCount).toBe(2);
    const ventanas = (await chromeStub.windows.getAll()) ?? [];
    expect(ventanas).toHaveLength(1);
    expect(ventanas[0]?.tabs?.[0]?.url).toContain('notification.html');
    const estado = (await chromeStub.storage.local.get(STORAGE_KEYS.approvalWindow)) as Record<
      string,
      { windowId: number | null; shownApprovalId: string | null }
    >;
    expect(estado[STORAGE_KEYS.approvalWindow]?.shownApprovalId).toBe('antigua');
  });

  it('sin pendientes cierra la ventana única que quedó abierta', async () => {
    chromeStub.windows.create({ url: 'chrome-extension://abc/notification.html', type: 'popup' });
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.approvalWindow]: {
        windowId: 1,
        shownApprovalId: 'vieja',
        openedAt: STUB_EPOCH_MS,
        updatedAt: STUB_EPOCH_MS,
      },
    });

    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      windows: chromeStub.windows as unknown as WindowsApiLike,
      reconcileRateWindows: false,
      log: false,
      badge: false,
    });

    expect(informe.window?.action).toBe('closed');
    expect(await chromeStub.windows.getAll()).toEqual([]);
    expect(informe.pendingAfter).toBe(0);
  });

  it('reconstruye `truekeate_rate_windows`: purga lo inactivo y reinicia el reloj futuro', async () => {
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.rateWindows]: {
        'https://inactivo.example': {
          tokens: 3,
          lastRefillAt: STUB_EPOCH_MS - 700_000,
          approvalWindowStart: STUB_EPOCH_MS - 700_000,
          approvalsInWindow: 4,
          deniedCount: 1,
          updatedAt: STUB_EPOCH_MS - 700_000,
        },
        'https://reloj-futuro.example': {
          tokens: 0,
          lastRefillAt: STUB_EPOCH_MS + 60_000,
          approvalWindowStart: STUB_EPOCH_MS + 60_000,
          approvalsInWindow: 6,
          deniedCount: 0,
          updatedAt: STUB_EPOCH_MS,
        },
        'https://vivo.example': {
          tokens: 2,
          lastRefillAt: STUB_EPOCH_MS - 1_000,
          approvalWindowStart: STUB_EPOCH_MS - 1_000,
          approvalsInWindow: 4,
          deniedCount: 0,
          updatedAt: STUB_EPOCH_MS - 1_000,
        },
      },
    });

    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      restoreWindow: false,
      log: false,
      badge: false,
    });

    expect(informe.rateWindows).toEqual({ purged: 1, reset: 1, retained: 2, applied: true });
    const almacen = (await chromeStub.storage.local.get(STORAGE_KEYS.rateWindows)) as Record<
      string,
      Record<string, { tokens: number; approvalsInWindow: number }>
    >;
    const ventanas = almacen[STORAGE_KEYS.rateWindows] ?? {};
    expect(Object.keys(ventanas).sort()).toEqual([
      'https://reloj-futuro.example',
      'https://vivo.example',
    ]);
    expect(ventanas['https://reloj-futuro.example']).toMatchObject({
      tokens: 6,
      approvalsInWindow: 0,
    });
    expect(ventanas['https://vivo.example']).toMatchObject({ tokens: 2, approvalsInWindow: 4 });
  });

  it('un almacén que rechaza la LECTURA no aborta la reconciliación (se lee como vacío)', async () => {
    const almacenRoto = {
      get: () => Promise.reject(new Error('almacén roto')),
      set: () => Promise.resolve(undefined),
      remove: () => Promise.resolve(undefined),
    };

    const informe = await reconcileApprovals(
      opcionesAisladas({ storage: almacenRoto, reconcileRateWindows: true }),
    );

    expect(informe.pendingBefore).toBe(0);
    expect(informe.pendingAfter).toBe(0);
    expect(informe.rateWindows).toEqual({ purged: 0, reset: 0, retained: 0, applied: true });
    expect(informe.logWritten).toBe(true);
  });
});
