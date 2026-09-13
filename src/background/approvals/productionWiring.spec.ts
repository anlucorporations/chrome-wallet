/**
 * M14.b/M17/M18 — `src/background/approvals/productionWiring.spec.ts`
 * Cableado de PRODUCCIÓN de los tres puntos que el Service Worker registra al arrancar y de la
 * entrega de respuestas: las dependencias POR DEFECTO (`chrome.tabs`, `chrome.windows`,
 * `chrome.runtime.onConnect`) en lugar de los dobles inyectados.
 *
 * Requisitos: RF-37 y RF-41 (RNF-08, RNF-16).
 *
 * HUECO QUE CUBRE (fase 4): `ports.spec.ts`, `focus-coverage.spec.ts` y `timeout.spec.ts` inyectan
 * SIEMPRE sus dependencias (`respond`, `tabs`, `runtime`, `windows`, `alarms`), así que las ramas
 * que resuelven el valor real (`options.x ?? getX()`) y las guardas de API ausente nunca se
 * ejecutaban. Es justo el camino que corre en el navegador: si el registro de un listener
 * devolviera `false` en producción, el SW no atendería ni el `RESUME` de la ventana ni el cierre
 * con la X, y ninguna prueba con dobles lo notaría.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { chromeStub, installChromeStub } from '../../../test/setup/chrome-stub';
import { APPROVAL_PORT_NAME } from '../../shared/protocol';
import type { PendingRequest, Uuid } from '../../shared/types';
import { STORAGE_KEYS } from '../state/schema';
import {
  bindPort,
  boundApprovalIds,
  clearPorts,
  countOpenPorts,
  deliverApprovalResolution,
  getRuntimeSend,
  getTabsSend,
  handleResume,
  registerApprovalPortListener,
  type ApprovalPortLike,
} from './ports';
import { registerApprovalWindowListeners, type WindowsApiLike } from './focus';
import { reconcileInflightAlarms } from './timeout';

/** El índice de puertos es estado VOLÁTIL de módulo: se vacía entre casos. */
beforeEach(() => {
  clearPorts();
});

/** Deja correr los microtasks y el turno de `setTimeout`: los listeners del stub son asíncronos. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Cuenta #0 de Anvil. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** Origen de la dApp de pruebas. */
const ORIGEN = 'http://localhost:5174';

/** `approvalId` de la solicitud sembrada. */
const APPROVAL_ID = 'aprobacion-cableado' as Uuid;

/** Solicitud `pending` completa, tal y como vive en `truekeate_pending_requests`. */
const solicitud = (overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId: APPROVAL_ID,
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_0, value: '0x1' }],
  origin: ORIGEN,
  tabId: 7,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: Date.now(),
  expiresAt: Date.now() + 120_000,
  status: 'pending',
  ...overrides,
});

/** Puerto falso que registra lo publicado. */
const puertoFalso = (): ApprovalPortLike & { published: unknown[] } => {
  const published: unknown[] = [];
  return {
    name: APPROVAL_PORT_NAME,
    published,
    postMessage(message: unknown) {
      published.push(message);
    },
    disconnect() {
      // El puerto no gestiona el cierre en estas pruebas.
    },
    onMessage: { addListener: () => undefined },
    onDisconnect: { addListener: () => undefined },
  };
};

/** ¿Contiene el mensaje publicado el `approvalId` sembrado? */
const menciona = (valor: unknown): boolean => JSON.stringify(valor ?? null).includes(APPROVAL_ID);

describe('M14.b · `handleResume` usa el puerto real cuando no se inyecta `respond`', () => {
  it('una solicitud `pending` vigente se publica POR EL PROPIO PUERTO y queda vinculada', async () => {
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.pendingRequests]: { [APPROVAL_ID]: solicitud() },
    });
    const port = puertoFalso();

    // Sin `options`: se ejercitan los valores por defecto (`now` y `respond`).
    const resultado = await handleResume(APPROVAL_ID, port);

    expect(resultado.ok).toBe(true);
    expect(port.published).toHaveLength(1);
    expect(menciona(port.published[0])).toBe(true);
    expect(countOpenPorts()).toBe(1);
    expect(boundApprovalIds()).toEqual([APPROVAL_ID]);
  });

  it('una solicitud desconocida publica el 4001 por el puerto real (nadie queda sin respuesta)', async () => {
    const port = puertoFalso();
    const resultado = await handleResume('no-existe' as Uuid, port);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4001);
    expect(resultado.error.message).toBe('Operación cancelada por el usuario.');
    expect(port.published).toHaveLength(1);
    expect(countOpenPorts()).toBe(0);
  });
});

describe('M14.b · `registerApprovalPortListener` contra `chrome.runtime.onConnect` real', () => {
  it('se registra con el runtime por defecto y atiende el RESUME de la ventana', async () => {
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.pendingRequests]: { [APPROVAL_ID]: solicitud() },
    });
    expect(registerApprovalPortListener()).toBe(true);

    // El relay de la ventana de decisión abre el puerto con su nombre canónico.
    const client = chromeStub.runtime.connect({ name: APPROVAL_PORT_NAME });
    await Promise.resolve();
    const publicado: unknown[] = [];
    client.onMessage.addListener((message) => {
      publicado.push(message);
    });

    client.postMessage({ type: 'RESUME', approvalId: APPROVAL_ID });
    await flush();

    expect(publicado.some((mensaje) => menciona(mensaje))).toBe(true);
    expect(countOpenPorts()).toBe(1);
  });

  it('un mensaje que no es del protocolo responde 4200 por el puerto (no se queda callado)', async () => {
    expect(registerApprovalPortListener()).toBe(true);
    const client = chromeStub.runtime.connect({ name: APPROVAL_PORT_NAME });
    await flush();
    const publicado: unknown[] = [];
    client.onMessage.addListener((message) => {
      publicado.push(message);
    });

    client.postMessage({ type: 'OTRO_MENSAJE' });
    await flush();

    expect(publicado).toHaveLength(1);
    const respuesta = publicado[0] as { error?: { code?: number } };
    expect(respuesta.error?.code).toBe(4200);
    expect(JSON.stringify(publicado[0])).toContain('no está soportado');
  });

  it('un puerto con OTRO nombre se ignora y no vincula nada', async () => {
    expect(registerApprovalPortListener()).toBe(true);
    const client = chromeStub.runtime.connect({ name: 'otro-puerto' });
    await flush();
    client.postMessage({ type: 'RESUME', approvalId: APPROVAL_ID });
    await flush();
    expect(countOpenPorts()).toBe(0);
  });

  it('sin `chrome.runtime.onConnect` devuelve `false` en lugar de lanzar', () => {
    expect(registerApprovalPortListener({ runtime: null })).toBe(false);
    expect(registerApprovalPortListener({ runtime: {} })).toBe(false);
    expect(registerApprovalPortListener({ runtime: { onConnect: { addListener: () => undefined } } })).toBe(true);
  });
});

describe('M18 · `registerApprovalWindowListeners` contra `chrome.windows` real', () => {
  it('se registra con `chrome.windows` por defecto y atiende el cierre de la ventana', async () => {
    expect(registerApprovalWindowListeners()).toBe(true);

    // La ventana única existe y su cierre con la X debe marcar el rechazo de la solicitud mostrada.
    const created = await chromeStub.windows.create({ url: 'notification.html', type: 'popup' });
    if (created === undefined) throw new Error('el stub no creó la ventana');
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.approvalWindow]: {
        windowId: created.id,
        shownApprovalId: APPROVAL_ID,
        openedAt: Date.now(),
        updatedAt: Date.now(),
      },
      [STORAGE_KEYS.pendingRequests]: { [APPROVAL_ID]: solicitud() },
    });

    chromeStub.windows.onRemoved.emit(created.id, { windowId: created.id, isWindowClosing: true });
    // El listener es asíncrono y no se espera desde el evento: se le da un turno.
    await flush();

    const cola = (await chromeStub.storage.local.get(STORAGE_KEYS.pendingRequests)) as Record<
      string,
      Record<string, unknown>
    >;
    expect(cola[STORAGE_KEYS.pendingRequests] ?? {}).toEqual({});
  });

  it('sin `chrome.windows.onRemoved` devuelve `false` en lugar de lanzar', () => {
    expect(registerApprovalWindowListeners({ windows: null })).toBe(false);
    // API presente pero SIN el evento de cierre: el registro debe rechazarse, no romper el arranque.
    const windowsSinEvento: WindowsApiLike = {
      create: async () => undefined,
      get: async () => undefined,
      getAll: async () => [],
      remove: async () => undefined,
    };
    expect(registerApprovalWindowListeners({ windows: windowsSinEvento })).toBe(false);
  });
});

describe('M17 · `deliverApprovalResolution` con y sin API de pestañas', () => {
  it('sin `chrome.tabs.sendMessage` la entrega es `none` (no se inventa destinatario)', async () => {
    // Se oculta `chrome.tabs` del stub SOLO para este caso: es la única forma de que
    // `getTabsSend()` devuelva `null` (pasar `{ tabs: null }` no sirve: `??` cae al valor real).
    const chromeCompleto = chromeStub;
    Object.defineProperty(globalThis, 'chrome', {
      value: { ...chromeCompleto, tabs: undefined },
      writable: true,
      configurable: true,
      enumerable: false,
    });
    try {
      expect(getTabsSend()).toBeNull();
      const entrega = await deliverApprovalResolution(solicitud(), { result: '0x1' });
      expect(entrega).toBe('none');
    } finally {
      installChromeStub();
    }
    expect(getTabsSend()).not.toBeNull();
  });

  it('con `chrome.tabs` real entrega por la pestaña de la solicitud', async () => {
    const recibidos: unknown[] = [];
    chromeStub.tabs.addTab({ id: 7, url: ORIGEN });
    chromeStub.tabs.setMessageHandler(7, (message) => {
      recibidos.push(message);
      return { ok: true };
    });

    const entrega = await deliverApprovalResolution(solicitud(), { result: '0x1' });
    expect(entrega).toBe('tab');
    expect(recibidos).toHaveLength(1);
    expect(menciona(recibidos[0])).toBe(true);
  });

  it('un puerto vivo tiene PRIORIDAD sobre la pestaña y se cierra al responder', async () => {
    const port = puertoFalso();
    bindPort(APPROVAL_ID, port);
    chromeStub.tabs.addTab({ id: 7, url: ORIGEN });

    const entrega = await deliverApprovalResolution(solicitud(), { error: { code: 4001, message: 'no' } });
    expect(entrega).toBe('port');
    expect(port.published).toHaveLength(1);
    expect(countOpenPorts()).toBe(0);
  });

  it('`getRuntimeSend` contra el stub devuelve el canal de mensajes de la extensión', async () => {
    const runtimeSend = getRuntimeSend();
    expect(runtimeSend).not.toBeNull();
    await runtimeSend?.sendMessage({ type: 'TRUEKEATE_EVENT' });
    expect(chromeStub.runtime.sentMessages()).toHaveLength(1);
  });
});

describe('M15 · `reconcileInflightAlarms` con las alarmas por defecto', () => {
  it('un mapa VACÍO con `chrome.alarms` real no arma nada y no lanza', async () => {
    const informe = await reconcileInflightAlarms({});
    expect(informe).toEqual({ armed: 0, cleared: 0 });
  });

  it('una marca `signing` vigente se rearma en su `expiresAt` con el reloj por defecto', async () => {
    const ahora = Date.now();
    const informe = await reconcileInflightAlarms({
      [CUENTA_0]: {
        account: CUENTA_0,
        approvalId: APPROVAL_ID,
        phase: 'signing',
        txHash: null,
        startedAt: ahora,
        expiresAt: ahora + 120_000,
      },
    });
    expect(informe.armed).toBe(1);
    const alarmas = (await chromeStub.alarms.getAll()) ?? [];
    expect(alarmas.map((alarma) => alarma.name)).toEqual([
      `truekeate_expire:inflight:${CUENTA_0.toLowerCase()}`,
    ]);
  });
});
