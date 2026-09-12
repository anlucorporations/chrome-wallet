/**
 * M17 — `src/background/approvals/ports.ts` (spec del árbol `test/oracle/`)
 * Puerto de larga vida `truekeate_approval`: registro de puertos, mensaje `RESUME` con la
 * solicitud COMPLETA (las tres previews incluidas), entrega de la resolución por el orden de
 * preferencia (puerto vivo → pestaña/frame exacto → sin destinatario) y correlación por
 * `requestId` del salto 1. Requisitos: **RF-37** (ventana única y transporte de la solicitud),
 * **RF-41** (la resolución llega a quien esperaba, una sola vez) y **RNF-09** (el cuerpo de la
 * solicitud no se difunde fuera de los contextos de la extensión).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../setup/chrome-stub';
import { STORAGE_KEYS } from '../../src/background/state/schema';
import {
  approvalDeliveryMessage,
  bindPort,
  boundApprovalIds,
  clearPorts,
  countOpenPorts,
  deliverApprovalResolution,
  getRuntimeSend,
  getTabsSend,
  handleResume,
  originFaviconUrl,
  pushApprovalRequest,
  registerApprovalPortListener,
  responseCorrelationId,
  resumeResultFor,
  unbindPort,
  type ApprovalPortLike,
  type TabsSendLike,
} from '../../src/background/approvals/ports';
import type { PendingRequest, PendingRequestsMap } from '../../src/shared/types';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** Nombre canónico del puerto. */
const PUERTO = 'truekeate_approval';

/** Guarda el `chrome` global para poder simular su ausencia total dentro de un caso. */
const sinChrome = (): (() => void) => {
  const global = globalThis as { chrome?: unknown };
  const previous = global.chrome;
  global.chrome = undefined;
  return () => {
    global.chrome = previous;
  };
};

/** Doble de `chrome.runtime.Port` que anota lo publicado y lo desconectado. */
const portDoble = (
  overrides: Partial<ApprovalPortLike> = {},
): ApprovalPortLike & { publicados: unknown[]; desconectado: boolean } => {
  const publicados: unknown[] = [];
  const doble = {
    name: PUERTO,
    publicados,
    desconectado: false,
    postMessage(message: unknown): void {
      publicados.push(message);
    },
    disconnect(): void {
      doble.desconectado = true;
    },
    onMessage: { addListener: () => undefined },
    onDisconnect: { addListener: () => undefined },
    ...overrides,
  };
  return doble as ApprovalPortLike & { publicados: unknown[]; desconectado: boolean };
};

/** Entrada `pending` con la forma de §2.8. */
const entrada = (approvalId: string, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId,
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_0 }],
  origin: 'https://dapp.example',
  tabId: 11,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: STUB_EPOCH_MS,
  expiresAt: STUB_EPOCH_MS + 120_000,
  status: 'pending',
  ...overrides,
});

/** Siembra la cola persistida. */
const sembrarCola = async (mapa: PendingRequestsMap): Promise<void> => {
  await chromeStub.storage.local.set({ [STORAGE_KEYS.pendingRequests]: mapa });
};

/** Captura los listeners de `onMessage` de un puerto doble con la firma exacta de `chrome`. */
const capturarMensajes = (
  mensajes: Array<(message: unknown) => void>,
): { addListener: (listener: (message: unknown, port: unknown) => void) => void } => ({
  addListener: (listener) => {
    mensajes.push((message: unknown) => listener(message, undefined));
  },
});

/** Captura los listeners de `onDisconnect` de un puerto doble. */
const capturarDesconexiones = (
  desconexiones: Array<() => void>,
): { addListener: (listener: (port: unknown) => void) => void } => ({
  addListener: (listener) => {
    desconexiones.push(() => listener(undefined));
  },
});

/** Espera a que se vacíe la microcola (el `RESUME` del listener es asíncrono). */
const asentar = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
};

afterEach(() => {
  clearPorts();
  vi.restoreAllMocks();
});

describe('M17 · índice volátil de puertos (estado admisible, §3.4)', () => {
  it('vincula, cuenta, enumera y desvincula puertos por solicitud', () => {
    expect(countOpenPorts()).toBe(0);
    expect(boundApprovalIds()).toEqual([]);

    const primero = portDoble();
    const segundo = portDoble();
    bindPort('a', primero);
    bindPort('b', segundo);
    expect(countOpenPorts()).toBe(2);
    expect(boundApprovalIds().sort()).toEqual(['a', 'b']);

    expect(unbindPort('a')).toBe(1);
    expect(unbindPort('a')).toBe(0);
    expect(countOpenPorts()).toBe(1);

    clearPorts();
    expect(countOpenPorts()).toBe(0);
  });
});

describe('M17 · superficies de `chrome.*` sin `any`', () => {
  it('sin `chrome` (o sin `tabs`/`runtime`) las APIs se declaran ausentes', () => {
    const restaurar = sinChrome();
    try {
      expect(getTabsSend()).toBeNull();
      expect(getRuntimeSend()).toBeNull();
      expect(originFaviconUrl('https://dapp.example')).toBeNull();
    } finally {
      restaurar();
    }

    const global = globalThis as { chrome?: unknown };
    const previo = global.chrome;
    try {
      global.chrome = null;
      expect(getTabsSend()).toBeNull();
      expect(getRuntimeSend()).toBeNull();
      global.chrome = {};
      expect(getTabsSend()).toBeNull();
      expect(getRuntimeSend()).toBeNull();
      expect(originFaviconUrl('https://dapp.example')).toBeNull();
      global.chrome = { runtime: { getURL: 5 }, tabs: { sendMessage: 5 } };
      expect(getTabsSend()).toBeNull();
      expect(getRuntimeSend()).toBeNull();
      expect(originFaviconUrl('https://dapp.example')).toBeNull();
    } finally {
      global.chrome = previo;
    }
  });

  it('con el stub real, `getRuntimeSend` publica por el canal del runtime', async () => {
    const runtime = getRuntimeSend();
    expect(runtime).not.toBeNull();
    await runtime?.sendMessage({ type: 'TRUEKEATE_RESPONSE', id: 'RESUME' });
    expect(chromeStub.runtime.sentMessages()).toEqual([{ type: 'TRUEKEATE_RESPONSE', id: 'RESUME' }]);
    expect(getTabsSend()).not.toBeNull();
  });

  it('originFaviconUrl: solo `http(s)`, saneado por construcción y con la API de runtime', () => {
    expect(originFaviconUrl(null)).toBeNull();
    expect(originFaviconUrl('chrome-extension://abc/index.html')).toBeNull();
    expect(originFaviconUrl('https://dapp.example/path')).toBe(
      `chrome-extension://${chromeStub.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://dapp.example/path')}&size=32`,
    );

    vi.spyOn(chromeStub.runtime, 'getURL').mockImplementation(() => {
      throw new Error('sin API de runtime');
    });
    expect(originFaviconUrl('http://localhost:5174')).toBeNull();
  });
});

describe('M17 · vista completa de la solicitud y sobre de entrega', () => {
  it('resumeResultFor publica las TRES previews cuando la solicitud las tiene', () => {
    const request = entrada('id-1', {
      requestId: 'req-1',
      tabId: 4,
      frameId: 2,
      txPreview: { from: CUENTA_0 } as never,
      typedDataPreview: { domain: {} } as never,
      signMessagePreview: { text: 'hola' } as never,
    });

    const vista = resumeResultFor(request, 3, 'chrome-extension://x/_favicon');

    expect(vista).toMatchObject({
      approvalId: 'id-1',
      status: 'pending',
      method: 'eth_sendTransaction',
      origin: 'https://dapp.example',
      tabId: 4,
      frameId: 2,
      account: CUENTA_0,
      chainId: '0x7a69',
      createdAt: STUB_EPOCH_MS,
      expiresAt: STUB_EPOCH_MS + 120_000,
      pendingCount: 3,
      favicon: 'chrome-extension://x/_favicon',
    });
    expect(vista.txPreview).toBe(request.txPreview);
    expect(vista.typedDataPreview).toBe(request.typedDataPreview);
    expect(vista.signMessagePreview).toBe(request.signMessagePreview);
    // Los parámetros viajan COPIADOS y la solicitud completa va incluida (RNF-14).
    expect(vista.params).toEqual(request.params);
    expect(vista.params).not.toBe(request.params);
    expect(vista.request.approvalId).toBe('id-1');
  });

  it('una solicitud SIN previews no inventa claves y su favicon se resuelve del origen', () => {
    const vista = resumeResultFor(entrada('id-2', { origin: 'chrome-extension://abc/index.html' }), 0);
    expect('txPreview' in vista).toBe(false);
    expect('typedDataPreview' in vista).toBe(false);
    expect('signMessagePreview' in vista).toBe(false);
    expect(vista.favicon).toBeNull();

    const conFavicon = resumeResultFor(entrada('id-3'), 1);
    expect(conFavicon.favicon).toContain('_favicon');
    expect(approvalDeliveryMessage(entrada('id-3'), 1).favicon).toBe(conFavicon.favicon);
  });

  it('approvalDeliveryMessage usa el sobre TRUEKEATE_RESPONSE con `id: RESUME`', () => {
    const sobre = approvalDeliveryMessage(entrada('id-4'), 2);
    expect(sobre.type).toBe('TRUEKEATE_RESPONSE');
    expect(sobre.id).toBe('RESUME');
    expect(sobre.pendingCount).toBe(2);
    expect(sobre.result.approvalId).toBe('id-4');
    expect(sobre.result.pendingCount).toBe(2);
  });
});

describe('M17 · correlación de la respuesta (§4.1/§4.2)', () => {
  it('con `requestId` declarado se responde con ÉL; si no, con el `approvalId`', () => {
    expect(responseCorrelationId(entrada('id-1', { requestId: 'req-9' }))).toBe('req-9');
    expect(responseCorrelationId(entrada('id-1', { requestId: '' }))).toBe('id-1');
    expect(responseCorrelationId(entrada('id-1'))).toBe('id-1');
  });
});

describe('M17 · handleResume: respuesta desde el registro persistido', () => {
  it('entrada `pending` vigente: vincula el puerto y responde la solicitud COMPLETA', async () => {
    await sembrarCola({ 'id-viva': entrada('id-viva'), 'id-otra': entrada('id-otra') });
    const port = portDoble();
    const respondidos: unknown[] = [];

    const resultado = await handleResume('id-viva', port, {
      now: STUB_EPOCH_MS,
      respond: (message) => respondidos.push(message),
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.result.pendingCount).toBe(2);
    expect(boundApprovalIds()).toEqual(['id-viva']);
    expect(respondidos).toHaveLength(1);
    expect(respondidos[0]).toMatchObject({ type: 'TRUEKEATE_RESPONSE', id: 'RESUME' });
    expect(port.publicados).toEqual([]);
  });

  it('entrada vencida: `4001` con el literal de vencimiento y sin vínculo de puerto', async () => {
    // El literal cita el plazo REAL de la entrada (`expiresAt - createdAt`, §4.3).
    await sembrarCola({
      'id-vencida': entrada('id-vencida', {
        createdAt: STUB_EPOCH_MS - 120_000,
        expiresAt: STUB_EPOCH_MS - 1,
      }),
    });
    const port = portDoble();
    bindPort('id-vencida', port);

    const resultado = await handleResume('id-vencida', port, { now: STUB_EPOCH_MS });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4001);
    expect(resultado.error.message).toContain('120');
    expect(port.publicados[0]).toMatchObject({ type: 'TRUEKEATE_RESPONSE', id: 'RESUME' });
    expect(boundApprovalIds()).toEqual([]);
  });

  it('entrada inexistente o ya resuelta: `4001` de rechazo (nunca se deja al llamante sin respuesta)', async () => {
    await sembrarCola({ 'id-resuelta': entrada('id-resuelta', { status: 'rejected' }) });
    const inexistente = portDoble();
    const resuelta = portDoble();

    const primera = await handleResume('id-fantasma', inexistente, { now: STUB_EPOCH_MS });
    const segunda = await handleResume('id-resuelta', resuelta, { now: STUB_EPOCH_MS });

    expect(primera.ok).toBe(false);
    expect(segunda.ok).toBe(false);
    if (primera.ok || segunda.ok) return;
    expect(primera.error.message).toBe('Operación cancelada por el usuario.');
    expect(segunda.error.message).toBe('Operación cancelada por el usuario.');
    expect((segunda.error.data as { reason: string }).reason).toBe('approval-not-pending');
  });

  it('el `RESUME` por defecto publica por el propio puerto', async () => {
    await sembrarCola({ 'id-default': entrada('id-default') });
    const port = portDoble();

    const resultado = await handleResume('id-default', port, { now: STUB_EPOCH_MS });

    expect(resultado.ok).toBe(true);
    expect(port.publicados).toHaveLength(1);
    expect(port.publicados[0]).toMatchObject({ type: 'TRUEKEATE_RESPONSE', id: 'RESUME' });
  });
});

describe('M17 · pushApprovalRequest: empuje a la ventana ya abierta (§2.14)', () => {
  /** Doble de `chrome.tabs.sendMessage` que anota el destino. */
  const tabsDoble = (
    behavior: 'ok' | 'falla',
  ): TabsSendLike & { llamadas: Array<{ tabId: number; message: unknown; options?: { frameId?: number } }> } => {
    const llamadas: Array<{ tabId: number; message: unknown; options?: { frameId?: number } }> = [];
    return {
      llamadas,
      sendMessage: async (tabId, message, options) => {
        llamadas.push({ tabId, message, ...(options === undefined ? {} : { options }) });
        if (behavior === 'falla') {
          throw new Error('sin destinatario');
        }
        return 'ok';
      },
    };
  };

  it('el canal del runtime es el primero y basta para entregar', async () => {
    const enviados: unknown[] = [];
    const entregado = await pushApprovalRequest(entrada('id-1'), {
      pendingCount: 1,
      tabId: 5,
      runtime: { sendMessage: async (message) => enviados.push(message) },
      tabs: tabsDoble('ok'),
    });

    expect(entregado).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ type: 'TRUEKEATE_RESPONSE', id: 'RESUME' });
  });

  it('sin canal de runtime se usa el respaldo por pestaña', async () => {
    const tabs = tabsDoble('ok');
    const entregado = await pushApprovalRequest(entrada('id-1'), {
      pendingCount: 2,
      tabId: 8,
      runtime: null,
      tabs,
    });

    expect(entregado).toBe(true);
    expect(tabs.llamadas).toEqual([
      { tabId: 8, message: approvalDeliveryMessage(entrada('id-1'), 2) },
    ]);
  });

  it('un fallo del runtime NO impide el respaldo por pestaña', async () => {
    const tabs = tabsDoble('ok');
    const entregado = await pushApprovalRequest(entrada('id-1'), {
      pendingCount: 1,
      tabId: 9,
      runtime: {
        sendMessage: async () => {
          throw new Error('la ventana no escucha');
        },
      },
      tabs,
    });

    expect(entregado).toBe(true);
    expect(tabs.llamadas).toHaveLength(1);
  });

  it('sin canal y sin pestaña (o con las dos vías caídas) no se entrega nada', async () => {
    const sinDestino = await pushApprovalRequest(entrada('id-1'), {
      pendingCount: 1,
      tabId: null,
      runtime: null,
    });
    expect(sinDestino).toBe(false);

    const sinApiDePestanas = await pushApprovalRequest(entrada('id-1'), {
      pendingCount: 1,
      tabId: 4,
      runtime: null,
      tabs: null,
    });
    expect(sinApiDePestanas).toBe(false);

    const caido = await pushApprovalRequest(entrada('id-1'), {
      pendingCount: 1,
      tabId: 4,
      runtime: null,
      tabs: tabsDoble('falla'),
    });
    expect(caido).toBe(false);
  });

  it('con el runtime real del stub la entrega es efectiva; sin pestaña registrada falla el respaldo', async () => {
    const entregado = await pushApprovalRequest(entrada('id-1'), { pendingCount: 1, tabId: 77 });
    expect(entregado).toBe(true);
    expect(chromeStub.runtime.sentMessages()).toHaveLength(1);

    const soloRespaldo = await pushApprovalRequest(entrada('id-1'), {
      pendingCount: 1,
      tabId: 77,
      runtime: null,
    });
    expect(soloRespaldo).toBe(false);
  });
});

describe('M17 · deliverApprovalResolution: orden de preferencia (§3.4)', () => {
  it('puerto vivo: se publica y se CIERRA la correlación', async () => {
    const port = portDoble();
    bindPort('id-1', port);

    const entrega = await deliverApprovalResolution(
      entrada('id-1'),
      { result: '0xdead' },
      { tabs: null },
    );

    expect(entrega).toBe('port');
    expect(port.publicados[0]).toMatchObject({
      type: 'TRUEKEATE_RESPONSE',
      id: 'id-1',
      approvalId: 'id-1',
      result: '0xdead',
    });
    expect(port.desconectado).toBe(true);
    expect(boundApprovalIds()).toEqual([]);
  });

  it('un puerto que falla al publicar o al cerrarse no impide dar la respuesta por entregada', async () => {
    const port = portDoble({
      postMessage: () => {
        throw new Error('puerto cerrado');
      },
      disconnect: () => {
        throw new Error('ya cerrado');
      },
    });
    bindPort('id-2', port);

    const entrega = await deliverApprovalResolution(entrada('id-2'), {
      error: { code: 4001, message: 'x' },
    });
    expect(entrega).toBe('port');
    expect(boundApprovalIds()).toEqual([]);
  });

  it('correlación por `requestId` y `approvalId` en el sobre', async () => {
    const port = portDoble();
    bindPort('id-3', port);

    await deliverApprovalResolution(entrada('id-3', { requestId: 'req-3' }), { result: true });

    expect(port.publicados[0]).toMatchObject({ id: 'req-3', approvalId: 'id-3' });
  });

  it('sin puerto: la pestaña del frame EXACTO recibe la respuesta (D-J/ADT-07)', async () => {
    const llamadas: unknown[] = [];
    const tabs: TabsSendLike = {
      sendMessage: async (tabId, message, options) => {
        llamadas.push({ tabId, message, options });
        return 'ok';
      },
    };

    const conFrame = await deliverApprovalResolution(
      entrada('id-4', { tabId: 6, frameId: 3 }),
      { result: 'ok' },
      { tabs },
    );
    expect(conFrame).toBe('tab');
    expect(llamadas[0]).toMatchObject({ tabId: 6, options: { frameId: 3 } });

    const topFrame = await deliverApprovalResolution(
      entrada('id-5', { tabId: 6, frameId: 0 }),
      { result: 'ok' },
      { tabs },
    );
    expect(topFrame).toBe('tab');
    expect((llamadas[1] as { options?: unknown }).options).toBeUndefined();

    const sinFrame = await deliverApprovalResolution(
      entrada('id-6', { tabId: 6, frameId: null }),
      { result: 'ok' },
      { tabs },
    );
    expect(sinFrame).toBe('tab');
    expect((llamadas[2] as { options?: unknown }).options).toBeUndefined();
  });

  it('sin destinatario (sin pestaña, sin API o con la entrega caída) devuelve `none`', async () => {
    expect(
      await deliverApprovalResolution(entrada('id-7', { tabId: null }), { result: 1 }, { tabs: null }),
    ).toBe('none');

    expect(
      await deliverApprovalResolution(entrada('id-8', { tabId: 2 }), { result: 1 }, { tabs: null }),
    ).toBe('none');

    const caida: TabsSendLike = {
      sendMessage: async () => {
        throw new Error('Could not establish connection');
      },
    };
    expect(
      await deliverApprovalResolution(entrada('id-9', { tabId: 2 }), { result: 1 }, { tabs: caida }),
    ).toBe('none');
  });

  it('con la API real del stub, una pestaña sin receptor cuenta como «sin destinatario»', async () => {
    const entrega = await deliverApprovalResolution(entrada('id-10', { tabId: 42 }), { result: 1 });
    expect(entrega).toBe('none');
  });
});

describe('M17 · registerApprovalPortListener: RESUME y catálogo público del puerto', () => {
  /** Captura el listener registrado en `onConnect`. */
  const registrar = (): {
    listener: (port: ApprovalPortLike) => void;
    registered: boolean;
  } => {
    let captured: ((port: ApprovalPortLike) => void) | null = null;
    const registered = registerApprovalPortListener({
      now: STUB_EPOCH_MS,
      runtime: {
        onConnect: {
          addListener: (listener) => {
            captured = listener;
          },
        },
      },
    });
    return {
      listener: captured as unknown as (port: ApprovalPortLike) => void,
      registered,
    };
  };

  it('sin `chrome.runtime.onConnect` no se registra nada', () => {
    expect(registerApprovalPortListener({ runtime: null })).toBe(false);
    expect(registerApprovalPortListener({ runtime: {} })).toBe(false);
    expect(
      registerApprovalPortListener({
        runtime: { onConnect: { addListener: 'no-funcion' as never } },
      }),
    ).toBe(false);
    expect(registerApprovalPortListener({ runtime: { onConnect: chromeStub.runtime.onConnect } })).toBe(
      true,
    );
  });

  it('ignora puertos que no son el canal de aprobaciones', () => {
    const { listener, registered } = registrar();
    expect(registered).toBe(true);
    const otro = portDoble({ name: 'otro-puerto' });
    listener(otro);
    expect(otro.publicados).toEqual([]);
  });

  it('un `RESUME` atiende el registro persistido y responde por el puerto', async () => {
    await sembrarCola({ 'id-lista': entrada('id-lista') });
    const { listener } = registrar();
    // El `RESUME` del listener escucha el mensaje del puerto.
    const mensajes: Array<(message: unknown) => void> = [];
    const conMensajes = portDoble({
      onMessage: capturarMensajes(mensajes),

    });

    listener(conMensajes);
    mensajes[0]?.({ type: 'RESUME', approvalId: 'id-lista' });
    await asentar();

    expect(conMensajes.publicados[0]).toMatchObject({ type: 'TRUEKEATE_RESPONSE', id: 'RESUME' });
    expect(boundApprovalIds()).toEqual(['id-lista']);
  });

  it('un `RESUME` sin `approvalId` textual responde `4001` sin romper el listener', async () => {
    const { listener } = registrar();
    const mensajes: Array<(message: unknown) => void> = [];
    const port = portDoble({
      onMessage: capturarMensajes(mensajes),

    });

    listener(port);
    mensajes[0]?.({ type: 'RESUME', approvalId: 12345 });
    await asentar();

    expect(port.publicados[0]).toMatchObject({
      type: 'TRUEKEATE_RESPONSE',
      id: 'RESUME',
      error: { code: 4001 },
    });
  });

  it('cualquier otra petición del puerto responde `4200` (catálogo público no implementado)', async () => {
    const { listener } = registrar();
    const mensajes: Array<(message: unknown) => void> = [];
    const port = portDoble({
      onMessage: capturarMensajes(mensajes),

    });

    listener(port);
    mensajes[0]?.({ type: 'TRUEKEATE_RPC', method: 'wallet_getState' });
    expect(port.publicados[0]).toMatchObject({
      type: 'TRUEKEATE_RESPONSE',
      id: 'TRUEKEATE_RPC',
      error: { code: 4200 },
    });

    // Un mensaje que no es del protocolo también cae en el 4200, con `id` de respaldo.
    port.publicados.length = 0;
    mensajes[0]?.('no-soy-un-mensaje');
    expect(port.publicados[0]).toMatchObject({ id: 'TRUEKEATE_RPC', error: { code: 4200 } });
  });

  it('con `onUnhandled` inyectado los mensajes ajenos se delegan y NO se responde 4200', () => {
    const vistos: unknown[] = [];
    let captured: ((port: ApprovalPortLike) => void) | null = null;
    registerApprovalPortListener({
      now: STUB_EPOCH_MS,
      onUnhandled: (message) => vistos.push(message),
      runtime: {
        onConnect: {
          addListener: (listener) => {
            captured = listener;
          },
        },
      },
    });
    const mensajes: Array<(message: unknown) => void> = [];
    const port = portDoble({
      onMessage: capturarMensajes(mensajes),

    });

    const registrarEnOnConnect = captured as unknown as ((port: ApprovalPortLike) => void) | null;
    registrarEnOnConnect?.(port);
    mensajes[0]?.({ type: 'TRUEKEATE_EVENT' });

    expect(vistos).toEqual([{ type: 'TRUEKEATE_EVENT' }]);
    expect(port.publicados).toEqual([]);
  });

  it('un puerto ya cerrado al responder 4200 no rompe el listener', () => {
    const { listener } = registrar();
    const mensajes: Array<(message: unknown) => void> = [];
    const port = portDoble({
      postMessage: () => {
        throw new Error('puerto cerrado');
      },
      onMessage: capturarMensajes(mensajes),

    });

    listener(port);
    expect(() => mensajes[0]?.({ type: 'TRUEKEATE_RPC' })).not.toThrow();
  });

  it('al desconectarse el puerto se retira SOLO su vínculo', () => {
    const { listener } = registrar();
    const desconexiones: Array<() => void> = [];
    const port = portDoble({
      onDisconnect: capturarDesconexiones(desconexiones),

    });
    const otro = portDoble();
    bindPort('id-propio', port);
    bindPort('id-ajeno', otro);

    listener(port);
    desconexiones[0]?.();

    expect(boundApprovalIds()).toEqual(['id-ajeno']);
  });
});
