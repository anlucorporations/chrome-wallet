/**
 * `src/background/connections.spec.ts` — Solicitudes de conexión de `eth_requestAccounts` (M26.b).
 *
 * Cubre el fleco 4 de la fase 4 sobre `truekeate_connect_request`, que la auditoría de unitarias
 * midió con DOS defectos:
 *
 * 1. **RMW sin cerrojo**: `openConnectWindow` y `applyConnectResponse` leían, mutaban y escribían
 *    el mapa sin serializar, de modo que dos operaciones simultáneas partían de la MISMA
 *    instantánea y la segunda escritura borraba a la primera (la promesa de `eth_requestAccounts`
 *    quedaba colgada hasta la red de seguridad de 60 s).
 * 2. **Sin purga**: el mapa NUNCA se limpiaba; toda solicitud cuyo `connect.html` se cerrara sin
 *    decidir se quedaba en `chrome.storage.local` para siempre, con su origen y su lista de
 *    cuentas. Ahora hay purga por **vencimiento** y al **resolver** la conexión.
 *
 * El reloj es INYECTADO (`now` como parámetro): las magnitudes son exactas y no dependen del reloj
 * real ni de *fake timers*. El almacén es el stub de `chrome.*` (mismo módulo que el producto).
 *
 * Requisitos: RF-16 y RF-40 (RNF-11, RNF-16).
 */

import { describe, expect, it } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../../test/setup/chrome-stub';
import type { ConnectRequest } from '../shared/types';
import {
  CONNECT_TIMEOUT_MS,
  SESSION_TTL_MS,
} from '../shared/constants';
import {
  applyConnectResponse,
  connectRequestsLock,
  hasPendingConnectFor,
  openConnectWindow,
  planConnectRequestPurge,
  purgeConnectRequests,
  readConnectRequests,
} from './connections';
import { clearPendingConnects } from './connections';

const T0 = STUB_EPOCH_MS;
const ORIGEN = 'http://localhost:5174';
const CUENTA = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Solicitud de conexión persistida con las magnitudes que indique la prueba. */
const requestOf = (overrides: Partial<ConnectRequest> = {}): ConnectRequest => ({
  requestId: 'req-1',
  origin: ORIGEN,
  accounts: [CUENTA, CUENTA_1],
  currentAccountIndex: 0,
  chainId: '0x7a69',
  tabId: 7,
  frameId: 0,
  createdAt: T0,
  expiresAt: T0 + CONNECT_TIMEOUT_MS,
  status: 'pending',
  ...overrides,
});

/** Siembra `truekeate_connect_request` con una cuenta de Anvil en `truekeate_accounts`. */
const seed = async (requests: Record<string, ConnectRequest>): Promise<void> => {
  await chrome.storage.local.set({
    truekeate_connect_request: requests,
    truekeate_accounts: [CUENTA, CUENTA_1],
  });
  clearPendingConnects();
};

/** Lee el mapa persistido tal cual (sin proyectar). */
const rawRequests = async (): Promise<Record<string, ConnectRequest>> => {
  const stored = await chrome.storage.local.get('truekeate_connect_request');
  return (stored.truekeate_connect_request ?? {}) as Record<string, ConnectRequest>;
};

/** Ventana de conexión doblada: registra la URL y resuelve al instante. */
const ventanaDoblada = (): { creadas: string[]; deps: { windows: { create: (data: { url: string }) => Promise<unknown> }; getUrl: (p: string) => string } } => {
  const creadas: string[] = [];
  return {
    creadas,
    deps: {
      windows: {
        create: async (data: { url: string }) => {
          creadas.push(data.url);
          return { id: creadas.length };
        },
      },
      getUrl: (path: string) => `chrome-extension://tk-stub-extension-id-for-tests/${path}`,
    },
  };
};

describe('M26.b · purga de `truekeate_connect_request` (fleco 4 de la fase 4)', () => {
  it('el plan de purga retira lo vencido y lo ya resuelto, y conserva lo vigente', () => {
    const plan = planConnectRequestPurge(
      {
        vigente: requestOf({ requestId: 'vigente' }),
        vencida: requestOf({ requestId: 'vencida', expiresAt: T0 - 1 }),
        resuelta: requestOf({ requestId: 'resuelta', status: 'approved' }),
        rechazada: requestOf({ requestId: 'rechazada', status: 'rejected' }),
      },
      T0,
    );

    expect(Object.keys(plan.map)).toEqual(['vigente']);
    expect(plan.expired).toEqual(['vencida']);
    expect(plan.resolved).toEqual(['rechazada', 'resuelta']);
    expect(plan.changed).toBe(true);
  });

  it('el plan es una función PURA y no marca cambio cuando todo está vigente', () => {
    const requests = { vigente: requestOf({ requestId: 'vigente' }) };
    const plan = planConnectRequestPurge(requests, T0);
    expect(plan.changed).toBe(false);
    expect(plan.expired).toEqual([]);
    expect(plan.resolved).toEqual([]);
    expect(plan.map).toEqual(requests);
  });

  it('`purgeConnectRequests` aplica el plan al almacén (por VENCIMIENTO)', async () => {
    await seed({
      vigente: requestOf({ requestId: 'vigente' }),
      vencida: requestOf({ requestId: 'vencida', expiresAt: T0 - 1 }),
    });

    const plan = await purgeConnectRequests({ now: T0 });

    expect(plan.expired).toEqual(['vencida']);
    expect(Object.keys(await rawRequests())).toEqual(['vigente']);
  });

  it('una solicitud vencida deja de bloquear el origen (halado «1 pending por origen»)', async () => {
    await seed({ vencida: requestOf({ requestId: 'vencida', expiresAt: T0 - 1 }) });
    const antes = await readConnectRequests();
    expect(hasPendingConnectFor(antes, ORIGEN, T0)).toBe(false);

    // Y el alta siguiente purga el mapa en lugar de acumular la entrada muerta.
    const ventana = ventanaDoblada();
    void openConnectWindow({ origin: ORIGEN, tabId: 7, now: T0, deps: ventana.deps });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const persistidas = await rawRequests();
    expect(Object.keys(persistidas)).toHaveLength(1);
    expect(Object.values(persistidas)[0]?.status).toBe('pending');
  });

  it('un `expiresAt` no numérico NO se purga (nunca se pierde una solicitud por un campo ausente)', async () => {
    await seed({
      rara: requestOf({ requestId: 'rara', expiresAt: Number.NaN }),
    });
    const plan = await purgeConnectRequests({ now: T0 });
    // `NaN <= now` es `false`: la entrada se conserva y la decisión de vencimiento es perezosa.
    expect(plan.changed).toBe(false);
    expect(Object.keys(await rawRequests())).toEqual(['rara']);
  });
});

describe('M26.b · RMW serializado de `truekeate_connect_request` (fleco 4 de la fase 4)', () => {
  it('dos altas simultáneas del MISMO origen producen UNA sola solicitud persistida', async () => {
    await seed({});
    const primera = ventanaDoblada();
    const segunda = ventanaDoblada();

    /**
     * Las altas que GANAN devuelven una promesa que solo resuelve con `CONNECT_RESPONSE`
     * (red de seguridad de 60 s). Por eso no se espera su resolución: se observa qué altas
     * fueron ACEPTADAS (siguen pendientes) y cuáles se rechazaron de inmediato con `4001`.
     */
    const resultados: Array<{ success: boolean; error?: { code: number } }> = [];
    const lanzar = (deps: ReturnType<typeof ventanaDoblada>['deps']): void => {
      void openConnectWindow({ origin: ORIGEN, tabId: 7, now: T0, deps }).then((resolucion) => {
        resultados.push(resolucion);
      });
    };
    lanzar(primera.deps);
    lanzar(segunda.deps);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // UNA sola solicitud persistida y UNA sola ventana abierta, gane quien gane la carrera.
    const persistidas = await rawRequests();
    expect(Object.keys(persistidas)).toHaveLength(1);
    expect(primera.creadas.length + segunda.creadas.length).toBe(1);
    // La segunda alta se rechaza con `4001` (cardinalidad) SIN abrir ventana y sin persistir. La
    // que ganó sigue pendiente: su promesa solo resuelve con la decisión del usuario.
    expect(resultados).toHaveLength(1);
    expect(resultados[0]?.success).toBe(false);
    expect(resultados[0]?.error?.code).toBe(4001);

    // La solicitud que ganó se resuelve una sola vez con la decisión del usuario.
    const ganadora = Object.keys(persistidas)[0] ?? '';
    const resolucion = await applyConnectResponse(
      { requestId: ganadora, success: true, account: CUENTA },
      { now: T0 },
    );
    expect(resolucion.success).toBe(true);
    expect(await rawRequests()).toEqual({});
    clearPendingConnects();
  });

  it('el alta de un origen NO borra la solicitud pendiente de OTRO origen', async () => {
    await seed({ ajena: requestOf({ requestId: 'ajena', origin: 'http://otra.test' }) });
    const ventana = ventanaDoblada();

    void openConnectWindow({ origin: ORIGEN, tabId: 7, now: T0, deps: ventana.deps });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const persistidas = await rawRequests();
    expect(Object.keys(persistidas)).toHaveLength(2);
    expect(Object.keys(persistidas)).toContain('ajena');
    expect(persistidas.ajena?.origin).toBe('http://otra.test');
  });

  it('al resolverse la conexión, la solicitud se retira del almacén (purga al resolver)', async () => {
    await seed({ 'req-1': requestOf() });

    const resolucion = await applyConnectResponse(
      { requestId: 'req-1', success: true, account: CUENTA, accountIndex: 0 },
      { now: T0, ttlMs: SESSION_TTL_MS },
    );

    expect(resolucion).toEqual({ success: true, account: CUENTA, accountIndex: 0 });
    expect(await rawRequests()).toEqual({});
    // La sesión SÍ queda persistida (la purga es de la SOLICITUD, no de la sesión).
    const sesiones = await chrome.storage.local.get('truekeate_connected_sites');
    expect(
      (sesiones.truekeate_connected_sites as Record<string, { account: string }>)[ORIGEN]?.account,
    ).toBe(CUENTA);
  });

  it('una respuesta manipulada (cuenta ajena) se rechaza con 4100 y purga la solicitud', async () => {
    await seed({ 'req-1': requestOf() });

    const resolucion = await applyConnectResponse(
      { requestId: 'req-1', success: true, account: '0x0000000000000000000000000000000000000001' },
      { now: T0 },
    );

    expect(resolucion.success).toBe(false);
    expect(resolucion.error?.code).toBe(4100);
    expect(await rawRequests()).toEqual({});
    expect(await chrome.storage.local.get('truekeate_connected_sites')).toEqual({});
  });

  it('una cancelación purga la solicitud y NO persiste ninguna sesión', async () => {
    await seed({ 'req-1': requestOf() });

    const resolucion = await applyConnectResponse({ requestId: 'req-1', success: false }, { now: T0 });

    expect(resolucion.success).toBe(false);
    expect(resolucion.error?.code).toBe(4001);
    expect(await rawRequests()).toEqual({});
    expect(await chrome.storage.local.get('truekeate_connected_sites')).toEqual({});
  });

  it('una solicitud vencida se purga y se rechaza con 4001 (motivo de vencimiento)', async () => {
    await seed({ 'req-1': requestOf({ expiresAt: T0 - 1 }) });

    const resolucion = await applyConnectResponse({ requestId: 'req-1', success: true }, { now: T0 });

    expect(resolucion.error?.code).toBe(4001);
    expect(await rawRequests()).toEqual({});
  });

  it('un `requestId` desconocido no crea ni borra nada', async () => {
    await seed({ 'req-1': requestOf() });

    const resolucion = await applyConnectResponse({ requestId: 'otro', success: false }, { now: T0 });

    expect(resolucion.success).toBe(false);
    expect(Object.keys(await rawRequests())).toEqual(['req-1']);
  });

  it('dos respuestas simultáneas de la MISMA solicitud resuelven una sola vez', async () => {
    await seed({ 'req-1': requestOf() });

    const [primera, segunda] = await Promise.all([
      applyConnectResponse({ requestId: 'req-1', success: true, account: CUENTA }, { now: T0 }),
      applyConnectResponse({ requestId: 'req-1', success: true, account: CUENTA }, { now: T0 }),
    ]);

    const exitosas = [primera, segunda].filter((resolucion) => resolucion.success);
    const rechazadas = [primera, segunda].filter((resolucion) => !resolucion.success);
    expect(exitosas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0]?.error?.code).toBe(4001);
    // El cerrojo se vacía: no queda ninguna tarea encadenada.
    expect(connectRequestsLock.depth()).toBe(0);
  });

  it('las escrituras del mapa están serializadas: nunca se pierde una solicitud ajena', async () => {
    await seed({
      a: requestOf({ requestId: 'a', origin: 'http://a.test' }),
      b: requestOf({ requestId: 'b', origin: 'http://b.test' }),
    });

    await Promise.all([
      applyConnectResponse({ requestId: 'a', success: false }, { now: T0 }),
      applyConnectResponse({ requestId: 'b', success: false }, { now: T0 }),
    ]);

    // Sin cerrojo, la segunda escritura habría resucitado la solicitud que la primera retiró.
    expect(await rawRequests()).toEqual({});
  });
});
