/**
 * M15 — `src/background/approvals/timeout.ts` (spec del árbol `test/oracle/`)
 * Dueño ÚNICO del plazo de las solicitudes de aprobación con `chrome.alarms` (**RF-40**: 120 s
 * anclados a `createdAt`, prohibidos `setTimeout`/`setInterval`), rearme de alarmas desde el
 * `expiresAt` PERSISTIDO al arrancar (`CA-RF-41`) y efecto del vencimiento: `expired` con
 * `errorCode: 4001`, entrega EIP-1193 y paso a la siguiente `pending` (**RF-37**).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../setup/chrome-stub';
import {
  CONNECT_TIMEOUT_MS,
  EXPIRE_ALARM_PREFIX,
  SIGN_TIMEOUT_MS,
  TIMEOUT_SAFETY_MARGIN_MS,
} from '../../src/shared/constants';
import { STORAGE_KEYS } from '../../src/background/state/schema';
import {
  INFLIGHT_ALARM_MARK,
  accountFromInflightReleaseAlarm,
  approvalIdFromExpiryAlarm,
  armAlarm,
  armExpiryAlarm,
  armInflightReleaseAlarm,
  cancelAlarm,
  cancelAllExpiryAlarms,
  cancelExpiryAlarm,
  cancelInflightReleaseAlarm,
  connectExpiresAt,
  expireApprovalRequest,
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
  type AlarmsLike,
} from '../../src/background/approvals/timeout';
import { readPendingRequests } from '../../src/background/approvals/queue';
import type { InflightTxByAccount, PendingRequest, PendingRequestsMap } from '../../src/shared/types';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** Entrada `pending` con la forma de §2.8. */
const entrada = (approvalId: string, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId,
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_0 }],
  origin: 'https://dapp.example',
  tabId: 5,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: STUB_EPOCH_MS,
  expiresAt: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
  status: 'pending',
  ...overrides,
});

/** Siembra la cola persistida. */
const sembrarCola = async (mapa: PendingRequestsMap): Promise<void> => {
  await chromeStub.storage.local.set({ [STORAGE_KEYS.pendingRequests]: mapa });
};

/** Entradas de `truekeate_logs`. */
const leerLogs = async (): Promise<Record<string, unknown>[]> => {
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) as Record<string, unknown>;
  return (items[STORAGE_KEYS.logs] ?? []) as Record<string, unknown>[];
};

/** Doble de `chrome.alarms` que permite forzar fallos de `create`/`clear`/`getAll`. */
const alarmsDoble = (
  options: {
    fallaCreate?: boolean;
    fallaClear?: boolean;
    fallaGetAll?: boolean;
    sinGetAll?: boolean;
    alarmas?: AlarmLike[];
  } = {},
): AlarmsLike & { creadas: Array<{ name: string; when?: number }>; limpiadas: string[] } => {
  const creadas: Array<{ name: string; when?: number }> = [];
  const limpiadas: string[] = [];
  return {
    creadas,
    limpiadas,
    create(name, alarmInfo) {
      if (options.fallaCreate === true) {
        throw new Error('create rechazado');
      }
      creadas.push({ name, ...(alarmInfo.when === undefined ? {} : { when: alarmInfo.when }) });
    },
    clear(name) {
      if (options.fallaClear === true) {
        throw new Error('clear rechazado');
      }
      if (name !== undefined) {
        limpiadas.push(name);
      }
      return Promise.resolve(true);
    },
    getAll:
      options.sinGetAll === true
        ? () => undefined
        : async () => {
            if (options.fallaGetAll === true) {
              throw new Error('getAll rechazado');
            }
            return options.alarmas ?? [];
          },
  };
};

/** Ejecuta microtareas para dejar asentar los manejadores diferidos. */
const asentar = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('M15 · plazos normativos (RF-40)', () => {
  it('120 s del alta anclados a `createdAt`; la conexión usa 60 s y la red de seguridad +5 s', () => {
    expect(timeoutMsFor('eth_sendTransaction')).toBe(SIGN_TIMEOUT_MS);
    expect(timeoutMsFor('wallet_revokePermissions')).toBe(SIGN_TIMEOUT_MS);
    expect(signExpiresAt(1_000)).toBe(1_000 + SIGN_TIMEOUT_MS);
    expect(connectExpiresAt(1_000)).toBe(1_000 + CONNECT_TIMEOUT_MS);
    expect(safetyTimeoutMs()).toBe(SIGN_TIMEOUT_MS + TIMEOUT_SAFETY_MARGIN_MS);
    expect(timeoutSeconds()).toBe(120);
    expect(timeoutSeconds(CONNECT_TIMEOUT_MS)).toBe(60);
    expect(isApprovalExpired(entrada('id'), STUB_EPOCH_MS)).toBe(false);
    expect(isApprovalExpired(entrada('id', { expiresAt: STUB_EPOCH_MS }), STUB_EPOCH_MS)).toBe(true);
  });
});

describe('M15 · nombres de alarma y superficie de `chrome.alarms`', () => {
  it('los nombres de alarma son los canónicos de §2.12 y §3.4', () => {
    expect(expiryAlarmName('id-1')).toBe(`${EXPIRE_ALARM_PREFIX}id-1`);
    expect(approvalIdFromExpiryAlarm(`${EXPIRE_ALARM_PREFIX}id-1`)).toBe('id-1');
    expect(approvalIdFromExpiryAlarm('otra:alarma')).toBeNull();
    expect(INFLIGHT_ALARM_MARK).toBe('inflight:');
    expect(inflightReleaseAlarmName(CUENTA_0)).toBe(
      `${EXPIRE_ALARM_PREFIX}inflight:${CUENTA_0.toLowerCase()}`,
    );
    expect(isInflightReleaseAlarm(inflightReleaseAlarmName(CUENTA_0))).toBe(true);
    expect(isInflightReleaseAlarm(expiryAlarmName('id-1'))).toBe(false);
    expect(accountFromInflightReleaseAlarm(inflightReleaseAlarmName(CUENTA_0))).toBe(
      CUENTA_0.toLowerCase(),
    );
    expect(accountFromInflightReleaseAlarm(expiryAlarmName('id-1'))).toBeNull();
  });

  it('getAlarmsApi exige `create`, `clear` y `getAll`; sin API devuelve `null`', () => {
    expect(getAlarmsApi()).toBe(chromeStub.alarms);
    const global = globalThis as { chrome?: unknown };
    const previo = global.chrome;
    try {
      global.chrome = undefined;
      expect(getAlarmsApi()).toBeNull();
      global.chrome = null;
      expect(getAlarmsApi()).toBeNull();
      global.chrome = {};
      expect(getAlarmsApi()).toBeNull();
      global.chrome = { alarms: { create: () => undefined, clear: () => true } };
      expect(getAlarmsApi()).toBeNull();
    } finally {
      global.chrome = previo;
    }
  });
});

describe('M15 · armado y cancelación de alarmas', () => {
  it('sin API no se arma ni se cancela nada', async () => {
    expect(armAlarm('x', 1, null)).toBe(false);
    expect(await cancelAlarm('x', null)).toBe(false);
    expect(armExpiryAlarm('id', 1, null)).toBe(false);
    expect(await cancelExpiryAlarm('id', null)).toBe(false);
    expect(await cancelAllExpiryAlarms(null)).toBe(0);
  });

  it('un fallo de `create` o de `clear` se informa con `false` sin lanzar', async () => {
    expect(armAlarm('x', 1, alarmsDoble({ fallaCreate: true }))).toBe(false);
    expect(await cancelAlarm('x', alarmsDoble({ fallaClear: true }))).toBe(false);
  });

  it('arma con `when: expiresAt` y cancela por nombre canónico', async () => {
    const alarms = alarmsDoble();
    expect(armExpiryAlarm('id-1', STUB_EPOCH_MS + SIGN_TIMEOUT_MS, alarms)).toBe(true);
    expect(armInflightReleaseAlarm(CUENTA_0, STUB_EPOCH_MS + 5, alarms)).toBe(true);
    expect(alarms.creadas).toEqual([
      { name: expiryAlarmName('id-1'), when: STUB_EPOCH_MS + SIGN_TIMEOUT_MS },
      { name: inflightReleaseAlarmName(CUENTA_0), when: STUB_EPOCH_MS + 5 },
    ]);

    expect(await cancelExpiryAlarm('id-1', alarms)).toBe(true);
    expect(await cancelInflightReleaseAlarm(CUENTA_0, alarms)).toBe(true);
    expect(alarms.limpiadas).toEqual([expiryAlarmName('id-1'), inflightReleaseAlarmName(CUENTA_0)]);
  });

  it('listExpiryAlarmNames solo devuelve las alarmas del módulo y tolera los fallos', async () => {
    expect(
      await listExpiryAlarmNames(
        alarmsDoble({
          alarmas: [
            { name: expiryAlarmName('id-1'), scheduledTime: 1 },
            { name: inflightReleaseAlarmName(CUENTA_0), scheduledTime: 2 },
            { name: 'alarma-ajena', scheduledTime: 3 },
          ],
        }),
      ),
    ).toEqual([expiryAlarmName('id-1'), inflightReleaseAlarmName(CUENTA_0)]);

    // `getAll` que no devuelve nada y `getAll` que falla: lista vacía, sin lanzar.
    expect(await listExpiryAlarmNames(alarmsDoble({ sinGetAll: true }))).toEqual([]);
    expect(await listExpiryAlarmNames(alarmsDoble({ fallaGetAll: true }))).toEqual([]);
  });

  it('cancelAllExpiryAlarms cuenta SOLO las cancelaciones efectivas', async () => {
    const alarmas: AlarmLike[] = [
      { name: expiryAlarmName('id-1'), scheduledTime: 1 },
      { name: expiryAlarmName('id-2'), scheduledTime: 2 },
    ];
    expect(await cancelAllExpiryAlarms(alarmsDoble({ alarmas }))).toBe(2);

    const conFallo: AlarmsLike = {
      create: () => undefined,
      clear: () => {
        throw new Error('no se pudo cancelar');
      },
      getAll: async () => alarmas,
    };
    expect(await cancelAllExpiryAlarms(conFallo)).toBe(0);
  });
});

describe('M15 · rearme desde el `expiresAt` persistido (H-02)', () => {
  it('rearma cada `pending` desde su plazo persistido y repara el que no lo tiene', async () => {
    const alarms = alarmsDoble();
    const informe = await rearmExpiryAlarms(
      {
        'id-1': entrada('id-1'),
        'id-sin-plazo': entrada('id-sin-plazo', { expiresAt: Number.NaN }),
        'id-resuelta': entrada('id-resuelta', { status: 'rejected' }),
      },
      { now: STUB_EPOCH_MS, alarms },
    );

    expect(informe).toEqual({ armed: 2, cleared: 0, pending: 2 });
    expect(alarms.creadas).toEqual([
      { name: expiryAlarmName('id-1'), when: STUB_EPOCH_MS + SIGN_TIMEOUT_MS },
      // Una entrada sin plazo utilizable se rearma con `now + SIGN_TIMEOUT_MS`: nunca se queda sin plazo.
      { name: expiryAlarmName('id-sin-plazo'), when: STUB_EPOCH_MS + SIGN_TIMEOUT_MS },
    ]);
  });

  it('retira las alarmas HUÉRFANAS y NO toca las de liberación de `inflight` (§2.12)', async () => {
    const alarms = alarmsDoble({
      alarmas: [
        { name: expiryAlarmName('huerfana'), scheduledTime: 1 },
        { name: inflightReleaseAlarmName(CUENTA_0), scheduledTime: 2 },
        { name: 'alarma-ajena', scheduledTime: 3 },
      ],
    });

    const informe = await rearmExpiryAlarms({ 'id-1': entrada('id-1') }, { now: STUB_EPOCH_MS, alarms });

    expect(informe.cleared).toBe(1);
    expect(alarms.limpiadas).toEqual([expiryAlarmName('huerfana')]);
  });

  it('una cancelación fallida no se cuenta como retirada', async () => {
    const alarms: AlarmsLike = {
      create: () => undefined,
      clear: () => {
        throw new Error('no se pudo cancelar');
      },
      getAll: async () => [{ name: expiryAlarmName('huerfana'), scheduledTime: 1 }],
    };

    const informe = await rearmExpiryAlarms({}, { now: STUB_EPOCH_MS, alarms });
    expect(informe).toEqual({ armed: 0, cleared: 0, pending: 0 });
  });

  it('sin API de alarmas el rearme informa de que no ha armado nada', async () => {
    const global = globalThis as { chrome?: unknown };
    const previo = global.chrome;
    try {
      global.chrome = {};
      const informe = await rearmExpiryAlarms({ 'id-1': entrada('id-1') }, { now: STUB_EPOCH_MS });
      expect(informe).toEqual({ armed: 0, cleared: 0, pending: 1 });
    } finally {
      global.chrome = previo;
    }
  });
});

describe('M15 · rearme de las alarmas de liberación de `inflight` (§2.12)', () => {
  it('solo las marcas `signing` VIGENTES se rearman', async () => {
    const map: InflightTxByAccount = {
      [CUENTA_0]: {
        account: CUENTA_0,
        approvalId: 'id-1',
        phase: 'signing',
        txHash: null,
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + 1,
      },
      '0xa4': {
        account: '0xa4' as typeof CUENTA_0,
        approvalId: 'id-2',
        phase: 'broadcast',
        txHash: '0xdead',
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + 1,
      },
      '0xb3': {
        account: '0xb3' as typeof CUENTA_0,
        approvalId: 'id-3',
        phase: 'signing',
        txHash: null,
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS - 1,
      },
    };
    const alarms = alarmsDoble();

    const informe = await reconcileInflightAlarms(map, { now: STUB_EPOCH_MS, alarms });

    expect(informe).toEqual({ armed: 1, cleared: 0 });
    expect(alarms.creadas).toEqual([
      { name: inflightReleaseAlarmName(CUENTA_0), when: STUB_EPOCH_MS + 1 },
    ]);
  });

  it('retira las alarmas de liberación que ya no corresponden a ninguna marca', async () => {
    const alarms = alarmsDoble({
      alarmas: [
        { name: inflightReleaseAlarmName(CUENTA_0), scheduledTime: 1 },
        { name: inflightReleaseAlarmName('0xsinmarca'), scheduledTime: 2 },
        { name: expiryAlarmName('id-1'), scheduledTime: 3 },
      ],
    });
    const map: InflightTxByAccount = {
      [CUENTA_0]: {
        account: CUENTA_0,
        approvalId: 'id-1',
        phase: 'signing',
        txHash: null,
        startedAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + 1,
      },
    };

    const informe = await reconcileInflightAlarms(map, { now: STUB_EPOCH_MS, alarms });

    expect(informe).toEqual({ armed: 1, cleared: 1 });
    expect(alarms.limpiadas).toEqual([inflightReleaseAlarmName('0xsinmarca')]);
  });
});

describe('M15 · efecto del vencimiento (§3.4, errorCode 4001)', () => {
  it('una entrada ya resuelta no se vence dos veces: se limpia su alarma (X-06)', async () => {
    chromeStub.alarms.create(expiryAlarmName('id-muerta'), { when: STUB_EPOCH_MS });
    await sembrarCola({ 'id-otra': entrada('id-otra') });

    const resultado = await expireApprovalRequest('id-muerta', {
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      refreshWindow: async () => ({ action: 'unchanged' }),
      purgeBadge: async () => undefined,
    });

    expect(resultado).toMatchObject({
      approvalId: 'id-muerta',
      expired: false,
      request: null,
      error: null,
      delivery: 'already-resolved',
      windowAction: null,
      pendingCount: 1,
    });
    expect(await chromeStub.alarms.get(expiryAlarmName('id-muerta'))).toBeUndefined();
  });

  it('vence la entrada: guarda `expired`, entrega el 4001, pasa a la siguiente y traza', async () => {
    await sembrarCola({ 'id-vencida': entrada('id-vencida') });
    const entregas: Array<{ approvalId: string; code: number }> = [];
    const badges: number[] = [];

    const resultado = await expireApprovalRequest('id-vencida', {
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      deliver: async (request, response) => {
        entregas.push({
          approvalId: request.approvalId,
          code: 'error' in response ? response.error.code : 0,
        });
        return 'tab';
      },
      refreshWindow: async () => ({ action: 'closed' }),
      purgeBadge: async (pendientes) => {
        badges.push(pendientes);
      },
    });

    expect(resultado.expired).toBe(true);
    expect(resultado.error?.code).toBe(4001);
    expect(resultado.error?.message).toContain('120');
    expect(resultado.delivery).toBe('tab');
    expect(resultado.windowAction).toBe('closed');
    expect(resultado.pendingCount).toBe(0);
    expect(entregas).toEqual([{ approvalId: 'id-vencida', code: 4001 }]);
    expect(badges).toEqual([0]);
    expect(await readPendingRequests()).toEqual({});

    const logs = await leerLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'approval_expired',
      category: 'event',
      level: 'warn',
      origin: 'https://dapp.example',
      method: 'eth_sendTransaction',
    });
    expect((logs[0]?.data as { errorCode: number }).errorCode).toBe(4001);
  });

  it('el re-render caído no impide cerrar el vencimiento, y `log: false` no traza', async () => {
    await sembrarCola({ 'id-vencida': entrada('id-vencida', { tabId: null }) });

    const resultado = await expireApprovalRequest('id-vencida', {
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      refreshWindow: async () => {
        throw new Error('ventana no disponible');
      },
      purgeBadge: async () => undefined,
      log: false,
    });

    expect(resultado.expired).toBe(true);
    expect(resultado.windowAction).toBeNull();
    expect(resultado.delivery).toBe('none');
    expect(await leerLogs()).toEqual([]);
  });

  it('un re-render que no declara `action` deja la acción en `null`', async () => {
    await sembrarCola({ 'id-vencida': entrada('id-vencida', { tabId: null }) });

    const resultado = await expireApprovalRequest('id-vencida', {
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
      refreshWindow: async () => 'sin-action',
      purgeBadge: async () => undefined,
      log: false,
    });

    expect(resultado.windowAction).toBeNull();
  });

  it('con las dependencias REALES el 4001 sale por la pestaña registrada y purga el badge', async () => {
    await sembrarCola({ 'id-vencida': entrada('id-vencida') });
    const entregados: unknown[] = [];
    chromeStub.tabs.setMessageHandler(5, (message) => {
      entregados.push(message);
      return 'ok';
    });

    const resultado = await expireApprovalRequest('id-vencida', {
      now: STUB_EPOCH_MS,
      alarms: chromeStub.alarms,
    });

    expect(resultado.delivery).toBe('tab');
    expect(entregados[0]).toMatchObject({ type: 'TRUEKEATE_RESPONSE', error: { code: 4001 } });
    expect(chromeStub.action.badgeText()).toBe('');
    expect(resultado.windowAction).toBe('none');
  });
});

describe('M15 · listener de `chrome.alarms.onAlarm`', () => {
  it('sin `onAlarm` no se registra nada', () => {
    expect(registerExpiryAlarmListener({ alarms: alarmsDoble() })).toBe(false);
    expect(
      registerExpiryAlarmListener({
        alarms: {
          create: () => undefined,
          clear: () => true,
          getAll: async () => [],
          onAlarm: { addListener: 'no' as never },
        },
      }),
    ).toBe(false);
    expect(registerExpiryAlarmListener({ alarms: chromeStub.alarms })).toBe(true);

    const global = globalThis as { chrome?: unknown };
    const previo = global.chrome;
    try {
      global.chrome = {};
      expect(registerExpiryAlarmListener({})).toBe(false);
    } finally {
      global.chrome = previo;
    }
  });

  it('atiende SOLO las alarmas del módulo y delega la liberación de `inflight`', async () => {
    const vencimientos: string[] = [];
    const liberaciones: string[] = [];
    registerExpiryAlarmListener({
      alarms: chromeStub.alarms,
      handler: async (approvalId) => {
        vencimientos.push(approvalId);
      },
      onInflightRelease: async (account) => {
        liberaciones.push(account);
      },
    });

    chromeStub.alarms.create(expiryAlarmName('id-1'), { when: STUB_EPOCH_MS });
    chromeStub.alarms.create(inflightReleaseAlarmName(CUENTA_0), { when: STUB_EPOCH_MS });
    chromeStub.alarms.create('alarma-ajena', { when: STUB_EPOCH_MS });

    chromeStub.alarms.fire(expiryAlarmName('id-1'));
    chromeStub.alarms.fire(inflightReleaseAlarmName(CUENTA_0));
    chromeStub.alarms.fire('alarma-ajena');
    await asentar();

    expect(vencimientos).toEqual(['id-1']);
    expect(liberaciones).toEqual([CUENTA_0.toLowerCase()]);
  });

  it('una alarma de liberación sin manejador se ignora en silencio (§2.12)', () => {
    registerExpiryAlarmListener({ alarms: chromeStub.alarms, handler: async () => undefined });
    chromeStub.alarms.create(inflightReleaseAlarmName(CUENTA_0), { when: STUB_EPOCH_MS });

    expect(() => chromeStub.alarms.fire(inflightReleaseAlarmName(CUENTA_0))).not.toThrow();
  });

  it('los fallos de los manejadores se registran y NO rompen el listener', async () => {
    registerExpiryAlarmListener({
      alarms: chromeStub.alarms,
      handler: async () => {
        throw new Error('vencimiento fallido');
      },
      onInflightRelease: async () => {
        throw new Error('liberación fallida');
      },
    });
    chromeStub.alarms.create(expiryAlarmName('id-1'), { when: STUB_EPOCH_MS });
    chromeStub.alarms.create(inflightReleaseAlarmName(CUENTA_0), { when: STUB_EPOCH_MS });

    expect(() => chromeStub.alarms.fire(expiryAlarmName('id-1'))).not.toThrow();
    expect(() => chromeStub.alarms.fire(inflightReleaseAlarmName(CUENTA_0))).not.toThrow();
    await asentar();
  });

  it('sin manejador inyectado, la alarma vence la solicitud real (M14 + M17 + M18)', async () => {
    await sembrarCola({ 'id-real': entrada('id-real', { tabId: null }) });
    registerExpiryAlarmListener({ alarms: chromeStub.alarms });

    chromeStub.alarms.create(expiryAlarmName('id-real'), { when: STUB_EPOCH_MS });
    chromeStub.alarms.fire(expiryAlarmName('id-real'));

    await vi.waitFor(async () => {
      expect(await readPendingRequests()).toEqual({});
      const logs = await leerLogs();
      expect(logs.some((entry) => entry.event === 'approval_expired')).toBe(true);
    });
  });
});
