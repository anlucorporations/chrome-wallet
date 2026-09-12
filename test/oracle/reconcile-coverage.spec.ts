/**
 * M16 — `src/background/approvals/reconcile.ts` (spec del árbol `test/oracle/`)
 * Reconciliación al arrancar el Service Worker: purga de lo resuelto y lo vencido, `4001` a las
 * huérfanas, rearme de alarmas, reconstrucción de `truekeate_inflight_tx` (§2.12), de la ventana
 * de tasa (§2.13) y de la ventana única (§2.14). Requisitos: **RF-41** (ninguna solicitud queda en
 * la cola sin respuesta) y **RNF-08** (la reconstrucción se mide con reloj inyectado; la cota
 * documentada es < 1 s).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../setup/chrome-stub';
import { SIGN_TIMEOUT_MS, rateWindowTtlMs } from '../../src/shared/constants';
import { STORAGE_KEYS } from '../../src/background/state/schema';
import {
  planInflightReconciliation,
  reconcileApprovals,
  releaseInflightOnAlarm,
  type ReceiptLookup,
} from '../../src/background/approvals/reconcile';
import { expiryAlarmName } from '../../src/background/approvals/timeout';
import { readInflightTx, readPendingRequests } from '../../src/background/approvals/queue';
import type { WindowsApiLike } from '../../src/background/approvals/focus';
import type { InflightTxByAccount, InflightTx, PendingRequest, PendingRequestsMap } from '../../src/shared/types';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
/** Cuenta #1 de Anvil (EIP-55). */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

/** Entrada `pending` con la forma de §2.8. */
const entrada = (approvalId: string, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId,
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_0 }],
  origin: 'https://dapp.example',
  tabId: 9,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: STUB_EPOCH_MS,
  expiresAt: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
  status: 'pending',
  ...overrides,
});

/** Marca `inflight` con la forma de §2.12. */
const marca = (overrides: Partial<InflightTx> = {}): InflightTx => ({
  account: CUENTA_0,
  approvalId: 'id-1',
  phase: 'broadcast',
  txHash: '0xhash',
  startedAt: STUB_EPOCH_MS,
  expiresAt: STUB_EPOCH_MS + 1,
  ...overrides,
});

/** Siembra el almacén con las claves de la reconciliación. */
const sembrar = async (items: Record<string, unknown>): Promise<void> => {
  await chromeStub.storage.local.set(items);
};

/** Entradas de `truekeate_logs`. */
const leerLogs = async (): Promise<Record<string, unknown>[]> => {
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) as Record<string, unknown>;
  return (items[STORAGE_KEYS.logs] ?? []) as Record<string, unknown>[];
};

/** Doble de `chrome.windows` suficiente para restablecer la ventana única. */
const windowsDoble = (
  ventanas: Array<{ id: number; tabs: Array<{ id: number; url: string }> }>,
): WindowsApiLike & { cerradas: number[] } => {
  const cerradas: number[] = [];
  return {
    cerradas,
    create: () => Promise.resolve({ id: 5 }),
    get: () => Promise.resolve(undefined),
    getAll: () => Promise.resolve(ventanas),
    update: () => Promise.resolve(undefined),
    remove: (windowId: number) => {
      cerradas.push(windowId);
      return Promise.resolve(undefined);
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('M16 · plan de reconstrucción de `inflight` (§2.12, función pura)', () => {
  it('aplica la tabla: conserva, libera, confirma, falla y descarta con su traza', async () => {
    const map: InflightTxByAccount = {
      '0xa1': marca({ account: CUENTA_0, phase: 'signing', expiresAt: STUB_EPOCH_MS + 1 }),
      // `signing` con el TTL agotado: la cuenta se LIBERA.
      '0xa2': marca({
        account: CUENTA_1,
        approvalId: 'id-2',
        phase: 'signing',
        expiresAt: STUB_EPOCH_MS - 1,
      }),
      '0xa3': marca({ account: '0xa3' as typeof CUENTA_0 }),
      '0xa4': marca({ account: '0xa4' as typeof CUENTA_0, txHash: '0xok' }),
      '0xa5': marca({ account: '0xa5' as typeof CUENTA_0, txHash: '0xko' }),
      '0xa6': marca({
        account: '0xa6' as typeof CUENTA_0,
        txHash: '0xperdida',
        expiresAt: STUB_EPOCH_MS - 1,
      }),
      '0xa7': marca({
        account: '0xa7' as typeof CUENTA_0,
        txHash: null,
        expiresAt: STUB_EPOCH_MS - 1,
      }),
    };
    const recibos: Record<string, 'confirmed' | 'failed' | null> = {
      '0xok': 'confirmed',
      '0xko': 'failed',
    };
    const readReceipt: ReceiptLookup = async (txHash) => recibos[txHash] ?? null;

    const plan = await planInflightReconciliation(map, { now: STUB_EPOCH_MS, readReceipt });

    expect(plan.report).toEqual({ released: 1, dropped: 2, retained: 2, confirmed: 1, failed: 1 });
    expect(Object.keys(plan.map).sort()).toEqual(['0xa1', '0xa3']);
    expect(plan.map['0xa3']?.phase).toBe('broadcast');

    const eventos = plan.traces.map((trace) => trace.event).sort();
    expect(eventos).toEqual(['rpc_error', 'rpc_error', 'rpc_error', 'tx_confirmed', 'tx_failed']);

    const liberada = plan.traces.find(
      (trace) => (trace.data as { phase?: string }).phase === 'signing',
    );
    expect(liberada).toMatchObject({ event: 'rpc_error', category: 'system', level: 'warn' });
    expect((liberada?.data as { code: number }).code).toBe(-32603);
    // Una marca formada sin `nonce` no inventa uno.
    expect((liberada?.data as { nonce: number | null }).nonce).toBeNull();

    const descartada = plan.traces.find(
      (trace) => (trace.data as { reason?: string }).reason === 'broadcast-interrupted',
    );
    expect(descartada?.txHash).toBe('0xperdida');
    // Sin hash conocido no se rellena el campo de primer nivel (D-H4-E6).
    const sinHash = plan.traces.filter(
      (trace) => (trace.data as { reason?: string }).reason === 'broadcast-interrupted',
    );
    expect(sinHash.filter((trace) => trace.txHash === undefined)).toHaveLength(1);
  });

  it('un nodo caído no confirma nada: se aplica la regla del TTL', async () => {
    const map: InflightTxByAccount = {
      '0xb1': marca({ account: '0xb1' as typeof CUENTA_0 }),
      '0xb2': marca({ account: '0xb2' as typeof CUENTA_0, expiresAt: STUB_EPOCH_MS - 1 }),
    };
    const readReceipt: ReceiptLookup = async () => {
      throw new Error('nodo caído');
    };

    const plan = await planInflightReconciliation(map, { now: STUB_EPOCH_MS, readReceipt });

    expect(plan.report).toEqual({ released: 0, dropped: 1, retained: 1, confirmed: 0, failed: 0 });
  });

  it('sin consulta de recibo inyectada, `broadcast` se conserva hasta agotar su TTL', async () => {
    const map: InflightTxByAccount = {
      '0xb1': marca({ account: '0xb1' as typeof CUENTA_0 }),
      '0xb2': marca({ account: '0xb2' as typeof CUENTA_0, expiresAt: STUB_EPOCH_MS - 1 }),
    };

    const plan = await planInflightReconciliation(map, { now: STUB_EPOCH_MS });

    expect(plan.report).toEqual({ released: 0, dropped: 1, retained: 1, confirmed: 0, failed: 0 });
    expect(plan.traces).toHaveLength(1);
  });
});

describe('M16 · liberación de la marca al vencer su alarma (§2.12)', () => {
  it('libera la marca de la cuenta sin distinguir mayúsculas y deja traza rpc_error', async () => {
    await sembrar({
      [STORAGE_KEYS.inflightTx]: {
        [CUENTA_0]: marca({ account: CUENTA_0, phase: 'signing' }),
      },
    });

    const liberado = await releaseInflightOnAlarm(CUENTA_0.toLowerCase(), { now: STUB_EPOCH_MS });

    expect(liberado).toBe(true);
    expect(await readInflightTx()).toEqual({});
    const logs = await leerLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: 'rpc_error', category: 'system', level: 'warn' });
    expect((logs[0]?.data as { reason: string }).reason).toBe('inflight-ttl');
  });

  it('sin marca para esa cuenta no libera nada', async () => {
    expect(await releaseInflightOnAlarm('0xsinmarca')).toBe(false);
  });
});

describe('M16 · reconciliación completa del arranque', () => {
  it('purga, entrega 4001 a las huérfanas, rearma alarmas y traza sw_reconcile', async () => {
    await sembrar({
      [STORAGE_KEYS.pendingRequests]: {
        viva: entrada('viva'),
        vencidaConDestino: entrada('vencidaConDestino', {
          expiresAt: STUB_EPOCH_MS - 1,
          origin: 'https://uno.example',
        }),
        vencidaSinDestino: entrada('vencidaSinDestino', {
          expiresAt: STUB_EPOCH_MS - 1,
          tabId: null,
          origin: 'https://dos.example',
        }),
        resuelta: entrada('resuelta', { status: 'rejected', errorCode: 4001 }),
      } satisfies PendingRequestsMap,
    });
    const entregas: Array<{ approvalId: string; code: number; entrega: string }> = [];

    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      windows: windowsDoble([]),
      restoreWindow: false,
      reconcileRateWindows: false,
      badge: false,
      deliver: async (request, response) => {
        const entrega = request.approvalId === 'vencidaConDestino' ? 'tab' : 'none';
        entregas.push({
          approvalId: request.approvalId,
          code: 'error' in response ? response.error.code : 0,
          entrega,
        });
        return entrega;
      },
    });

    expect(informe).toMatchObject({
      pendingBefore: 3,
      pendingAfter: 1,
      purgedResolved: 1,
      purgedExpired: 2,
      orphansDelivered: 1,
      orphansUndelivered: 1,
      logWritten: true,
      window: null,
    });
    expect(entregas).toEqual([
      { approvalId: 'vencidaConDestino', code: 4001, entrega: 'tab' },
      { approvalId: 'vencidaSinDestino', code: 4001, entrega: 'none' },
    ]);
    expect(Object.keys(await readPendingRequests())).toEqual(['viva']);
    expect(informe.rearm).toEqual({ armed: 1, cleared: 0, pending: 1 });
    expect(informe.rateWindows).toEqual({ purged: 0, reset: 0, retained: 0, applied: false });

    const logs = await leerLogs();
    const reconciliacion = logs.find((entry) => entry.event === 'sw_reconcile');
    expect(reconciliacion).toMatchObject({ category: 'system', level: 'warn' });
    expect(reconciliacion?.data).toMatchObject({
      pendingBefore: 3,
      pendingAfter: 1,
      purgedResolved: 1,
      purgedExpired: 2,
      orphansDelivered: 1,
      orphansUndelivered: 1,
      window: null,
    });
    expect((reconciliacion?.data as { rearm: unknown }).rearm).toEqual({
      armed: 1,
      cleared: 0,
      pending: 1,
    });
    expect(logs.filter((entry) => entry.event === 'approval_expired')).toHaveLength(2);
  });

  it('un arranque sin nada que reconciliar deja UNA traza `info` e informes a cero', async () => {
    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      windows: windowsDoble([]),
      restoreWindow: false,
      reconcileRateWindows: false,
      badge: false,
    });

    expect(informe).toMatchObject({
      pendingBefore: 0,
      pendingAfter: 0,
      purgedResolved: 0,
      purgedExpired: 0,
      orphansDelivered: 0,
      orphansUndelivered: 0,
      logWritten: true,
    });
    expect(informe.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(informe.inflight).toEqual({
      released: 0,
      dropped: 0,
      retained: 0,
      confirmed: 0,
      failed: 0,
      alarmsArmed: 0,
      alarmsCleared: 0,
      persisted: false,
    });
    const logs = await leerLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: 'sw_reconcile', level: 'info' });
  });

  it('reconstruye `inflight`, persiste el cambio y rearma sus alarmas de liberación', async () => {
    await sembrar({
      [STORAGE_KEYS.inflightTx]: {
        '0xa1': marca({ account: CUENTA_0, phase: 'signing', expiresAt: STUB_EPOCH_MS + 60_000 }),
        '0xa4': marca({ account: CUENTA_1, txHash: '0xok' }),
      },
    });

    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      windows: windowsDoble([]),
      restoreWindow: false,
      reconcileRateWindows: false,
      badge: false,
      readReceipt: async (txHash) => (txHash === '0xok' ? 'confirmed' : null),
    });

    expect(informe.inflight).toMatchObject({
      released: 0,
      dropped: 0,
      retained: 1,
      confirmed: 1,
      failed: 0,
      alarmsArmed: 1,
      persisted: true,
    });
    expect(Object.keys(await readInflightTx())).toEqual(['0xa1']);
    expect(await chromeStub.alarms.get(expiryAlarmName(`inflight:${CUENTA_0.toLowerCase()}`))).toBeDefined();

    const logs = await leerLogs();
    expect(logs.map((entry) => entry.event).sort()).toEqual(['sw_reconcile', 'tx_confirmed']);
  });

  it('la ventana de tasa se reconstruye (M3.b) y la ventana única se restablece (M18)', async () => {
    await sembrar({
      [STORAGE_KEYS.rateWindows]: {
        caduca: {
          tokens: 6,
          lastRefillAt: STUB_EPOCH_MS - rateWindowTtlMs - 1,
          approvalWindowStart: STUB_EPOCH_MS - rateWindowTtlMs - 1,
          approvalsInWindow: 0,
          deniedCount: 0,
          updatedAt: STUB_EPOCH_MS - rateWindowTtlMs - 1,
        },
      },
      [STORAGE_KEYS.approvalWindow]: {
        windowId: 3,
        shownApprovalId: 'id-vieja',
        openedAt: 1,
        updatedAt: 1,
      },
    });
    const windows = windowsDoble([
      { id: 3, tabs: [{ id: 30, url: `chrome-extension://${chromeStub.runtime.id}/notification.html` }] },
    ]);

    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      windows,
      badge: false,
    });

    expect(informe.rateWindows).toEqual({ purged: 1, reset: 0, retained: 0, applied: true });
    expect(informe.window).toMatchObject({ action: 'closed', reason: 'sin-pendientes' });
    expect(windows.cerradas).toEqual([3]);
  });

  it('`log: false` y `badge: false` no escriben la traza ni el badge', async () => {
    vi.spyOn(chromeStub.action, 'setBadgeText');

    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      windows: windowsDoble([]),
      restoreWindow: false,
      reconcileRateWindows: false,
      log: false,
      badge: false,
    });

    expect(informe.logWritten).toBe(false);
    expect(await leerLogs()).toEqual([]);
    expect(chromeStub.action.setBadgeText).not.toHaveBeenCalled();
  });

  it('el reloj inyectado mide el coste y avisa si supera 1 s (RNF-08)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let lecturas = 0;
    const clock = (): number => {
      lecturas += 1;
      return lecturas === 1 ? 0 : 5_000;
    };

    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      clock,
      alarms: chromeStub.alarms,
      windows: windowsDoble([]),
      restoreWindow: false,
      reconcileRateWindows: false,
      badge: false,
      log: false,
    });

    expect(informe.elapsedMs).toBe(5_000);
    expect(warn.mock.calls.some((call) => String(call[0]).includes('superó 1 s'))).toBe(true);
  });

  it('un fallo de escritura en la purga no aborta la reconciliación', async () => {
    await sembrar({
      [STORAGE_KEYS.pendingRequests]: {
        vencida: entrada('vencida', { expiresAt: STUB_EPOCH_MS - 1, tabId: null }),
      } satisfies PendingRequestsMap,
    });
    vi.spyOn(chromeStub.storage.local, 'set').mockImplementation(() =>
      Promise.reject(new Error('QUOTA_BYTES quota exceeded')),
    );

    const informe = await reconcileApprovals({
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      windows: windowsDoble([]),
      restoreWindow: false,
      reconcileRateWindows: false,
      badge: false,
      log: false,
    });

    expect(informe.purgedExpired).toBe(1);
    expect(informe.orphansUndelivered).toBe(1);
  });
});
