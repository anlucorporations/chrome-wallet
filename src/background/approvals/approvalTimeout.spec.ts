/**
 * M15 — `src/background/approvals/approvalTimeout.spec.ts`
 * Plazo con **dueño único** en el Service Worker: `chrome.alarms` (H4, tarea 4.2 de
 * `plan_desarrollo.md` §3.4.5; §3.4.7).
 *
 * Regla dura del arnés (§3.4.7 y §7.4.1.d): el plazo se prueba con **fake timers + el reloj del
 * stub de `chrome.alarms`**, NUNCA esperando 120 s reales. El reloj del stub es la fuente de
 * verdad de `scheduledTime`, así que las aserciones son exactas (`STUB_EPOCH_MS + 120_000`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { STUB_EPOCH_MS, advanceAlarms, chromeStub, setStubClock } from '../../../test/setup/chrome-stub';
import { CONNECT_TIMEOUT_MS, SIGN_TIMEOUT_MS } from '../../shared/constants';
import { STORAGE_KEYS } from '../state/schema';
import {
  enqueueApprovalRequest,
  pendingCount,
  readPendingRequests,
  type PendingRequestDraft,
} from './queue';
import {
  approvalIdFromExpiryAlarm,
  armExpiryAlarm,
  cancelAllExpiryAlarms,
  cancelExpiryAlarm,
  connectExpiresAt,
  expiryAlarmName,
  getAlarmsApi,
  inflightReleaseAlarmName,
  isApprovalExpired,
  isInflightReleaseAlarm,
  listExpiryAlarmNames,
  rearmExpiryAlarms,
  reconcileInflightAlarms,
  registerExpiryAlarmListener,
  safetyTimeoutMs,
  signExpiresAt,
  timeoutMsFor,
  timeoutSeconds,
  type AlarmLike,
} from './timeout';
import { expireApprovalRequest } from './timeout';

/** Cuenta #0 de Anvil. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** Origen de la dApp de pruebas. */
const ORIGEN_DAPP = 'http://localhost:5174';

/** Borrador válido de una solicitud aprobable. */
const borrador = (origin = ORIGEN_DAPP): PendingRequestDraft => ({
  method: 'personal_sign',
  params: ['0x686f6c61', CUENTA_0],
  origin,
  tabId: 5,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
});

/** Lee una entrada del almacén. */
const leerLogs = async (): Promise<Record<string, unknown>[]> => {
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) as Record<string, unknown>;
  return (items[STORAGE_KEYS.logs] ?? []) as Record<string, unknown>[];
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('M15 · nombres de alarma y cómputo del plazo (sin esperas reales)', () => {
  it('el nombre es `truekeate_expire:<approvalId>` y se deshace sin ambigüedad', () => {
    expect(expiryAlarmName('abc-123')).toBe('truekeate_expire:abc-123');
    expect(approvalIdFromExpiryAlarm('truekeate_expire:abc-123')).toBe('abc-123');
    expect(approvalIdFromExpiryAlarm('otra_alarma')).toBeNull();
    expect(isInflightReleaseAlarm('truekeate_expire:inflight:0xf39f')).toBe(true);
    expect(isInflightReleaseAlarm('truekeate_expire:abc')).toBe(false);
    expect(inflightReleaseAlarmName('0xF39F')).toBe('truekeate_expire:inflight:0xf39f');
  });

  it('el plazo de firma es 120 s anclado a `createdAt` y la conexión 60 s', () => {
    expect(SIGN_TIMEOUT_MS).toBe(120_000);
    expect(CONNECT_TIMEOUT_MS).toBe(60_000);
    expect(timeoutMsFor('eth_sendTransaction')).toBe(120_000);
    expect(timeoutMsFor('personal_sign')).toBe(120_000);
    expect(timeoutMsFor('eth_signTypedData_v4')).toBe(120_000);
    expect(timeoutMsFor('wallet_switchEthereumChain')).toBe(120_000);
    expect(signExpiresAt(STUB_EPOCH_MS)).toBe(STUB_EPOCH_MS + 120_000);
    expect(connectExpiresAt(STUB_EPOCH_MS)).toBe(STUB_EPOCH_MS + 60_000);
    expect(safetyTimeoutMs()).toBe(125_000);
    expect(timeoutSeconds()).toBe(120);
    expect(timeoutSeconds(60_000)).toBe(60);
  });

  it('isApprovalExpired vence en `expiresAt` inclusive y no antes', async () => {
    await enqueueApprovalRequest(borrador(), { now: STUB_EPOCH_MS, approvalId: 'plazo' });
    const entrada = (await readPendingRequests())['plazo'];
    expect(entrada).toBeDefined();
    if (entrada === undefined) return;

    expect(isApprovalExpired(entrada, STUB_EPOCH_MS + 119_999)).toBe(false);
    expect(isApprovalExpired(entrada, STUB_EPOCH_MS + 120_000)).toBe(true);
    expect(isApprovalExpired(entrada, STUB_EPOCH_MS + 120_001)).toBe(true);
  });

  it('getAlarmsApi devuelve la superficie del stub y null no rompe nada', async () => {
    expect(getAlarmsApi()).not.toBeNull();
    expect(await listExpiryAlarmNames(null)).toEqual([]);
    expect(await cancelAllExpiryAlarms(null)).toBe(0);
    expect(armExpiryAlarm('x', STUB_EPOCH_MS, null)).toBe(false);
    expect(await cancelExpiryAlarm('x', null)).toBe(false);
  });
});

describe('M15 · armado con chrome.alarms sobre el reloj del stub', () => {
  it('arma la alarma en `when: expiresAt` exacto, sin desplazarla', async () => {
    const expiresAt = STUB_EPOCH_MS + SIGN_TIMEOUT_MS;
    expect(armExpiryAlarm('plazo', expiresAt)).toBe(true);

    const alarmas = await chromeStub.alarms.getAll();
    expect(alarmas).toEqual([{ name: 'truekeate_expire:plazo', scheduledTime: expiresAt }]);
  });

  it('con fake timers, 119 999 ms NO disparan y 1 ms más SÍ: el vencimiento es a los 120 s', async () => {
    vi.useFakeTimers();
    setStubClock(STUB_EPOCH_MS);
    const atendidas: string[] = [];
    expect(
      registerExpiryAlarmListener({
        alarms: chromeStub.alarms,
        handler: async (approvalId: string) => {
          atendidas.push(approvalId);
        },
      }),
    ).toBe(true);

    armExpiryAlarm('objetivo', STUB_EPOCH_MS + SIGN_TIMEOUT_MS);
    expect(advanceAlarms(119_999)).toBe(0);
    expect(atendidas).toEqual([]);
    expect(await chromeStub.alarms.get('truekeate_expire:objetivo')).toBeDefined();

    expect(advanceAlarms(1)).toBe(1);
    await vi.waitFor(() => {
      expect(atendidas).toEqual(['objetivo']);
    });
    // Una alarma no periódica se consume al dispararse.
    expect(await chromeStub.alarms.get('truekeate_expire:objetivo')).toBeUndefined();
  });

  it('el listener solo atiende las alarmas del módulo y encamina la cuenta de las de liberación', async () => {
    const vencimientos: string[] = [];
    const liberaciones: string[] = [];
    registerExpiryAlarmListener({
      alarms: chromeStub.alarms,
      handler: async (approvalId: string) => {
        vencimientos.push(approvalId);
      },
      onInflightRelease: async (account: string) => {
        liberaciones.push(account);
      },
    });

    chromeStub.alarms.onAlarm.emit({ name: 'alarma_ajena', scheduledTime: STUB_EPOCH_MS } as AlarmLike);
    chromeStub.alarms.onAlarm.emit({
      name: 'truekeate_expire:inflight:0xf39f',
      scheduledTime: STUB_EPOCH_MS,
    } as AlarmLike);
    chromeStub.alarms.onAlarm.emit({
      name: 'truekeate_expire:abc',
      scheduledTime: STUB_EPOCH_MS,
    } as AlarmLike);

    await vi.waitFor(() => {
      expect(vencimientos).toEqual(['abc']);
      expect(liberaciones).toEqual(['0xf39f']);
    });
  });

  it('sin `onAlarm` en la superficie el registro devuelve false (no lanza)', () => {
    expect(
      registerExpiryAlarmListener({
        alarms: { create: () => undefined, clear: () => true, getAll: () => Promise.resolve([]) },
      }),
    ).toBe(false);
  });

  it('listExpiryAlarmNames solo devuelve las alarmas de vencimiento y cancelAll las retira', async () => {
    armExpiryAlarm('uno', STUB_EPOCH_MS + 1_000);
    armExpiryAlarm('dos', STUB_EPOCH_MS + 2_000);
    chromeStub.alarms.create('alarma_ajena', { when: STUB_EPOCH_MS + 3_000 });

    expect((await listExpiryAlarmNames()).sort()).toEqual([
      'truekeate_expire:dos',
      'truekeate_expire:uno',
    ]);
    expect(await cancelAllExpiryAlarms()).toBe(2);
    expect(await listExpiryAlarmNames()).toEqual([]);
    const restantes = (await chromeStub.alarms.getAll()) ?? [];
    expect(restantes.map((alarma) => alarma.name)).toEqual(['alarma_ajena']);
  });
});

describe('M15 · efecto del vencimiento: 4001, purga y traza redactada', () => {
  it('marca `expired`, entrega el 4001 del literal, refresca la ventana y purga la cola', async () => {
    await enqueueApprovalRequest(borrador(), { now: STUB_EPOCH_MS, approvalId: 'vencer' });
    armExpiryAlarm('vencer', STUB_EPOCH_MS + SIGN_TIMEOUT_MS);
    const entregas: unknown[] = [];
    const refrescos: number[] = [];
    const badges: number[] = [];

    const resultado = await expireApprovalRequest('vencer', {
      now: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
      deliver: async (request, response) => {
        entregas.push({ approvalId: request.approvalId, response });
        return 'port';
      },
      refreshWindow: async () => {
        refrescos.push(1);
        return { action: 'closed' };
      },
      purgeBadge: async (pendientes: number) => {
        badges.push(pendientes);
      },
    });

    expect(resultado.expired).toBe(true);
    expect(resultado.error?.code).toBe(4001);
    expect(resultado.error?.message).toBe(
      'El usuario no respondió en el plazo establecido (120 s); la solicitud ha caducado.',
    );
    expect(resultado.delivery).toBe('port');
    expect(resultado.windowAction).toBe('closed');
    expect(resultado.pendingCount).toBe(0);
    expect(entregas).toEqual([
      {
        approvalId: 'vencer',
        response: {
          error: {
            code: 4001,
            message:
              'El usuario no respondió en el plazo establecido (120 s); la solicitud ha caducado.',
          },
        },
      },
    ]);
    expect(refrescos).toHaveLength(1);
    expect(badges).toEqual([0]);
    expect(await readPendingRequests()).toEqual({});
    // La alarma que quedó armada se consume al dispararse sin efectos (la entrada ya no está
    // `pending`): el vencimiento es idempotente y nunca entrega dos veces el 4001.
    expect(chromeStub.alarms.fire(expiryAlarmName('vencer'))).toBe(true);
    expect(await chromeStub.alarms.get(expiryAlarmName('vencer'))).toBeUndefined();
    expect(entregas).toHaveLength(1);
  });

  it('deja UNA traza `approval_expired` redactada (sin el payload firmado)', async () => {
    await enqueueApprovalRequest(borrador(), { now: STUB_EPOCH_MS, approvalId: 'con-traza' });

    await expireApprovalRequest('con-traza', {
      now: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
      deliver: async () => 'port',
      refreshWindow: async () => ({ action: 'closed' }),
      purgeBadge: async () => undefined,
    });

    const logs = await leerLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'approval_expired',
      category: 'event',
      level: 'warn',
      message: 'Solicitud de aprobación vencida',
      origin: ORIGEN_DAPP,
      method: 'personal_sign',
      data: {
        approvalId: 'con-traza',
        method: 'personal_sign',
        origin: ORIGEN_DAPP,
        errorCode: 4001,
        segundos: 120,
      },
    });
    // RNF-09: el mensaje firmado NUNCA aparece en la traza.
    expect(JSON.stringify(logs)).not.toContain('0x686f6c61');
  });

  it('es idempotente: repetir el vencimiento no entrega nada y limpia la alarma', async () => {
    await enqueueApprovalRequest(borrador(), { now: STUB_EPOCH_MS, approvalId: 'una-vez' });
    const entregas: unknown[] = [];
    const deps = {
      now: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
      deliver: async () => {
        entregas.push(1);
        return 'port' as const;
      },
      refreshWindow: async () => ({ action: 'closed' }),
      purgeBadge: async () => undefined,
    };

    const primera = await expireApprovalRequest('una-vez', deps);
    armExpiryAlarm('una-vez', STUB_EPOCH_MS + SIGN_TIMEOUT_MS);
    const segunda = await expireApprovalRequest('una-vez', deps);

    expect(primera.expired).toBe(true);
    expect(segunda.expired).toBe(false);
    expect(segunda.delivery).toBe('already-resolved');
    expect(segunda.error).toBeNull();
    expect(segunda.request).toBeNull();
    expect(entregas).toHaveLength(1);
    expect(await chromeStub.alarms.get(expiryAlarmName('una-vez'))).toBeUndefined();
  });

  it('vencer una solicitud inexistente responde `already-resolved` sin lanzar', async () => {
    const resultado = await expireApprovalRequest('no-existe', { now: STUB_EPOCH_MS });

    expect(resultado).toMatchObject({
      approvalId: 'no-existe',
      expired: false,
      request: null,
      error: null,
      delivery: 'already-resolved',
      windowAction: null,
      pendingCount: 0,
    });
  });

  it('un fallo al refrescar la ventana NO impide el 4001 ni la purga', async () => {
    await enqueueApprovalRequest(borrador(), { now: STUB_EPOCH_MS, approvalId: 'fallo-ventana' });

    const resultado = await expireApprovalRequest('fallo-ventana', {
      now: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
      deliver: async () => 'none',
      refreshWindow: async () => {
        throw new Error('ventana rota');
      },
      purgeBadge: async () => undefined,
    });

    expect(resultado.expired).toBe(true);
    expect(resultado.windowAction).toBeNull();
    expect(resultado.delivery).toBe('none');
    expect(pendingCount(await readPendingRequests())).toBe(0);
  });
});

describe('M15 · rearme desde el `expiresAt` persistido (sin disparar el alarm)', () => {
  it('rearma en el instante persistido y retira las alarmas huérfanas', async () => {
    const alta = await enqueueApprovalRequest(borrador('https://a.example'), {
      now: STUB_EPOCH_MS,
      approvalId: 'viva',
    });
    expect(alta.ok).toBe(true);
    const mapa = await readPendingRequests();
    const expiresAt = mapa['viva']?.expiresAt ?? 0;
    chromeStub.alarms.create(expiryAlarmName('huerfana'), { when: STUB_EPOCH_MS + 5_000 });
    chromeStub.alarms.create(inflightReleaseAlarmName(CUENTA_0), { when: STUB_EPOCH_MS + 6_000 });

    const informe = await rearmExpiryAlarms(mapa, {
      now: STUB_EPOCH_MS + 1_000,
      alarms: chromeStub.alarms,
    });

    expect(informe).toEqual({ armed: 1, cleared: 1, pending: 1 });
    const rearmada = await chromeStub.alarms.get(expiryAlarmName('viva'));
    expect(rearmada?.scheduledTime, 'el rearme conserva el expiresAt persistido').toBe(expiresAt);
    // Las alarmas de liberación de `inflight` NO las toca este rearme (§2.12).
    expect(await chromeStub.alarms.get(inflightReleaseAlarmName(CUENTA_0))).toBeDefined();
    expect(await chromeStub.alarms.get(expiryAlarmName('huerfana'))).toBeUndefined();
  });

  it('una entrada `pending` sin `expiresAt` numérico se rearma con `now + 120 s`', async () => {
    const mapa = {
      sinPlazo: {
        approvalId: 'sinPlazo',
        method: 'personal_sign' as const,
        params: [],
        origin: ORIGEN_DAPP,
        tabId: null,
        frameId: null,
        account: CUENTA_0,
        chainId: '0x7a69' as const,
        createdAt: STUB_EPOCH_MS,
        expiresAt: Number.NaN,
        status: 'pending' as const,
      },
    };

    const informe = await rearmExpiryAlarms(mapa, {
      now: STUB_EPOCH_MS + 500,
      alarms: chromeStub.alarms,
    });

    expect(informe.armed).toBe(1);
    expect((await chromeStub.alarms.get(expiryAlarmName('sinPlazo')))?.scheduledTime).toBe(
      STUB_EPOCH_MS + 500 + SIGN_TIMEOUT_MS,
    );
  });

  it('reconcileInflightAlarms solo arma la liberación de las marcas `signing` VIGENTES', async () => {
    const mapa = {
      [CUENTA_0]: {
        account: CUENTA_0,
        approvalId: 'vigente',
        phase: 'signing' as const,
        txHash: null,
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + 60_000,
      },
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8': {
        account: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const,
        approvalId: 'vencida',
        phase: 'signing' as const,
        txHash: null,
        startedAt: STUB_EPOCH_MS - 200_000,
        expiresAt: STUB_EPOCH_MS - 20_000,
      },
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
        account: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const,
        approvalId: 'difundida',
        phase: 'broadcast' as const,
        txHash: `0x${'cd'.repeat(32)}` as const,
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + 60_000,
      },
    };
    chromeStub.alarms.create(inflightReleaseAlarmName('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'), {
      when: STUB_EPOCH_MS + 10_000,
    });

    const informe = await reconcileInflightAlarms(mapa, {
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
    });

    expect(informe).toEqual({ armed: 1, cleared: 1 });
    expect(
      (await chromeStub.alarms.get(inflightReleaseAlarmName(CUENTA_0)))?.scheduledTime,
    ).toBe(STUB_EPOCH_MS + 60_000);
    // `broadcast` no bloquea la cuenta: no se arma alarma de liberación para ella.
    expect(
      await chromeStub.alarms.get(
        inflightReleaseAlarmName('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'),
      ),
    ).toBeUndefined();
  });
});
