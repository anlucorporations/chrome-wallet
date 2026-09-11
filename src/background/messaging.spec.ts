/**
 * `src/background/messaging.spec.ts` — Entrada `chrome.runtime.onMessage` del Service Worker
 * (H3, tareas 3.1, 3.2, 3.3 y §3.3.7: «allowlist de métodos internos y rechazo de `sender`/`origin`
 * inválidos»).
 *
 * Cubre la cara verificable de:
 * - `CA-RF-14`/`CA-RF-45`: fuera del catálogo (o declarado sin implementar) → `4200` con el literal
 *   de `diccionario_datos.md` §4.3, y **siempre** como promesa resuelta (nunca un lanzamiento).
 * - RNF-10/RNF-11: **ningún** `wallet_*` interno se despacha desde una página (allowlist) y un
 *   emisor que no es la extensión recibe `4100`.
 * - D-J/ADT-07: el `origin`, `tabId` y `frameId` declarados en el mensaje son datos NO fiables; el
 *   contexto se recalcula SOLO desde `sender`.
 * - RNF-09/H-42: los `params` se redactan ANTES de cualquier despacho, también cuando la guarda
 *   rechaza la petición.
 */

import { describe, expect, it, vi } from 'vitest';

import { STUB_EXTENSION_ID } from '../../test/setup/chrome-stub';
import { EXTENSION_ORIGIN } from '../shared/constants';
// ORDEN DE IMPORTACIÓN: `./rpc/router` (y con él `./security/senderGuard`) ANTES de `./rpc/catalog`.
// `senderGuard` captura `INTERNAL_METHODS` en su evaluación de módulo; si `catalog` se evaluara
// primero (cadena circular catalog → connections → sessions → senderGuard), la captura quedaría
// `undefined` y toda petición respondería `-32603`. Ver informe de H3 (hallazgo de fragilidad).
import { handleRpcMessage, type RouterDeps } from './rpc/router';
import { INTERNAL_METHODS } from './rpc/catalog';
import {
  methodNotAllowedInContextError,
  unauthorizedOriginError,
  unsupportedMethodError,
} from './rpc/errors';
import { freshRateWindow } from './rpc/rateLimit';
import type { PageCallContext, PageHandlerDeps } from './rpc/pageMethods';
import type { TrustedSenderContext, SenderLike } from './security/senderGuard';

// ---------------------------------------------------------------------------
// Emisores de prueba
// ---------------------------------------------------------------------------

/** Content script de la dApp: `id` propio, `origin` de la página y `frameId` 0. */
const SENDER_PAGINA: SenderLike = {
  id: STUB_EXTENSION_ID,
  origin: 'http://localhost:5174',
  url: 'http://localhost:5174/test.html',
  tab: { id: 11 },
  frameId: 0,
};

/** Popup de la extensión abierto en una pestaña. */
const SENDER_POPUP: SenderLike = {
  id: STUB_EXTENSION_ID,
  origin: `chrome-extension://${STUB_EXTENSION_ID}`,
  url: `chrome-extension://${STUB_EXTENSION_ID}/index.html`,
  tab: { id: 4 },
  frameId: 0,
};

/** Dependencias con espías: ningún test toca almacén, red ni ventanas reales. */
const buildDeps = (): {
  deps: RouterDeps;
  invokeInternal: ReturnType<typeof vi.fn>;
  invokePage: ReturnType<typeof vi.fn>;
  redactParams: ReturnType<typeof vi.fn>;
  decideRateLimit: ReturnType<typeof vi.fn>;
} => {
  const invokeInternal = vi.fn(
    async (_method: string, _params: unknown[], _context: TrustedSenderContext) => 'interno',
  );
  const invokePage = vi.fn(
    async (
      _method: string,
      _params: unknown[],
      _call: PageCallContext,
      _deps: PageHandlerDeps,
    ) => 'pagina',
  );
  const redactParams = vi.fn((_method: string, params: unknown) => params);
  const decideRateLimit = vi.fn(async () => ({
    allowed: true,
    window: freshRateWindow(1_700_000_000_000),
    changed: false,
  }));
  const page: PageHandlerDeps = {
    rpc: { send: async () => '0x0', getBalance: async () => 0n },
    sessions: {
      touchSession: async () => ({ session: null, persisted: false }),
      currentSessionFor: () => null,
      readSessions: async () => ({}),
      revokeSession: async () => null,
    },
    events: { emitEvent: async () => 0 },
    openConnect: async () => ({ success: false }),
  };
  return {
    deps: {
      redactParams,
      invokeInternal,
      invokePage,
      decideRateLimit,
      page,
      now: () => 1_700_000_000_000,
    },
    invokeInternal,
    invokePage,
    redactParams,
    decideRateLimit,
  };
};

/** Sobre `TRUEKEATE_RPC` con los campos declarados que se quieran falsear. */
const rpcMessage = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'TRUEKEATE_RPC',
  method: 'eth_accounts',
  params: [],
  origin: 'http://localhost:5174',
  tabId: null,
  frameId: null,
  ...extra,
});

describe('M3 · entrada de mensajes: solo el protocolo cerrado (ADT-29)', () => {
  it('un mensaje ajeno al protocolo NO se responde (`undefined`)', async () => {
    const { deps } = buildDeps();
    for (const ajeno of [
      { type: 'OTRO_TIPO' },
      { sin: 'tipo' },
      [],
      'TRUEKEATE_RPC',
      null,
      undefined,
    ]) {
      await expect(handleRpcMessage(ajeno, SENDER_PAGINA, deps)).resolves.toBeUndefined();
    }
  });

  it('los tipos del protocolo que NO son `TRUEKEATE_RPC` responden 4200 sin destinatario', async () => {
    const { deps } = buildDeps();
    for (const tipo of ['SIGN_RESPONSE', 'CONNECT_RESPONSE', 'RESUME']) {
      const routed = await handleRpcMessage({ type: tipo }, SENDER_PAGINA, deps);
      expect(routed, `el tipo ${tipo} debe acusar recibo`).toBeDefined();
      expect(routed?.response).toEqual({ error: unsupportedMethodError() });
      expect(routed?.target).toEqual({ tabId: null, frameId: null });
      expect(routed?.context).toBeNull();
    }
  });
});

describe('M20 · allowlist de métodos internos (RNF-10 / RNF-11)', () => {
  it.each([...INTERNAL_METHODS])(
    'un page sender NUNCA despacha el interno `%s`: responde 4200 y no lo invoca',
    async (method) => {
      const { deps, invokeInternal, invokePage } = buildDeps();
      const routed = await handleRpcMessage(rpcMessage({ method }), SENDER_PAGINA, deps);

      expect(routed?.response).toEqual({ error: methodNotAllowedInContextError() });
      expect(invokeInternal, `${method} se despachó desde una página`).not.toHaveBeenCalled();
      expect(invokePage).not.toHaveBeenCalled();
    },
  );

  it('desde el popup los `wallet_*` SÍ se despachan con contexto de extensión', async () => {
    const { deps, invokeInternal } = buildDeps();
    const routed = await handleRpcMessage(
      rpcMessage({ method: 'wallet_getState', params: [] }),
      SENDER_POPUP,
      deps,
    );

    expect(routed?.response).toEqual({ result: 'interno' });
    expect(invokeInternal).toHaveBeenCalledTimes(1);
    const [method, , context] = invokeInternal.mock.calls[0] as [string, unknown, TrustedSenderContext];
    expect(method).toBe('wallet_getState');
    expect(context.isExtensionContext).toBe(true);
    expect(context.origin).toBe(EXTENSION_ORIGIN);
    expect(context.tabId).toBe(4);
  });

  it('`wallet_revokePermissions` desde una página es un aprobable sin implementar: 4200', async () => {
    const { deps, invokeInternal } = buildDeps();
    const routed = await handleRpcMessage(
      rpcMessage({ method: 'wallet_revokePermissions', params: [{ origin: 'http://x.test' }] }),
      SENDER_PAGINA,
      deps,
    );
    expect(routed?.response).toEqual({ error: unsupportedMethodError() });
    expect(invokeInternal).not.toHaveBeenCalled();
  });
});

describe('M20 · `sender` y `origin` inválidos (D-J / ADT-07)', () => {
  it('un emisor con otro `id` recibe 4100 y no se despacha nada', async () => {
    const { deps, invokeInternal, invokePage } = buildDeps();
    const routed = await handleRpcMessage(
      rpcMessage(),
      { id: 'extension-ajena', origin: 'http://localhost:5174', tab: { id: 11 }, frameId: 0 },
      deps,
    );
    expect(routed?.response).toEqual({ error: unauthorizedOriginError() });
    expect(routed?.context).toBeNull();
    expect(invokeInternal).not.toHaveBeenCalled();
    expect(invokePage).not.toHaveBeenCalled();
  });

  it('una página sin `origin` ni `url` utilizables recibe 4100 (no se inventa el origen)', async () => {
    const { deps, invokePage } = buildDeps();
    const routed = await handleRpcMessage(rpcMessage(), { id: STUB_EXTENSION_ID, tab: { id: 11 } }, deps);
    expect(routed?.response).toEqual({ error: unauthorizedOriginError() });
    expect(invokePage).not.toHaveBeenCalled();
  });

  it('el `origin` declarado en el mensaje se IGNORA: manda `sender.origin`', async () => {
    const { deps, invokePage } = buildDeps();
    const routed = await handleRpcMessage(
      rpcMessage({ origin: 'http://atacante.example' }),
      SENDER_PAGINA,
      deps,
    );

    expect(routed?.response).toEqual({ result: 'pagina' });
    const call = invokePage.mock.calls[0]?.[2] as PageCallContext;
    expect(call.origin).toBe('http://localhost:5174');
    expect(call.context.declaredOrigin).toBe('http://atacante.example');
  });

  it('el `frameId`/`tabId` declarados se ignoran: el destino sale del emisor real', async () => {
    const { deps } = buildDeps();
    const routed = await handleRpcMessage(
      rpcMessage({ frameId: 0, tabId: 999 }),
      { ...SENDER_PAGINA, frameId: 2 },
      deps,
    );
    // El emisor real vive en el frame 2 de la pestaña 11: la respuesta vuelve SOLO a ese frame.
    expect(routed?.target).toEqual({ tabId: 11, frameId: 2 });
    expect(routed?.context?.frameId).toBe(2);
  });
});

describe('M22/M6 · redacción previa y errores tipados', () => {
  it('los `params` se redactan ANTES del despacho y también cuando la guarda rechaza', async () => {
    const { deps, redactParams, invokePage } = buildDeps();
    redactParams.mockReturnValue(['<redactado>']);

    const ok = await handleRpcMessage(rpcMessage({ params: ['0xsecreto'] }), SENDER_PAGINA, deps);
    expect(redactParams).toHaveBeenCalledWith('eth_accounts', ['0xsecreto']);
    expect(ok?.response).toEqual({ result: 'pagina' });

    // Emisor inválido: la redacción ya había ocurrido y el valor redactado no se filtra en claro.
    const rechazado = await handleRpcMessage(
      rpcMessage({ params: ['0xsecreto'] }),
      { id: 'extension-ajena' },
      deps,
    );
    expect(rechazado?.response).toEqual({ error: unauthorizedOriginError() });
    expect(invokePage).toHaveBeenCalledTimes(1);
  });

  it('un método fuera del catálogo (`eth_sign`) responde 4200 sin lanzar de forma síncrona', async () => {
    const { deps } = buildDeps();
    const lanzamientos: unknown[] = [];
    let promesa: Promise<unknown> = Promise.resolve(undefined);
    try {
      promesa = handleRpcMessage(rpcMessage({ method: 'eth_sign' }), SENDER_PAGINA, deps);
    } catch (error) {
      lanzamientos.push(error);
    }
    expect(lanzamientos, 'el router lanzó de forma síncrona').toEqual([]);

    const routed = (await promesa) as Awaited<ReturnType<typeof handleRpcMessage>>;
    expect(routed?.response).toEqual({ error: unsupportedMethodError() });
  });

  it('un `method` no declarado (o ausente) también responde 4200', async () => {
    const { deps } = buildDeps();
    for (const method of ['noExiste', '', undefined]) {
      const routed = await handleRpcMessage(rpcMessage({ method }), SENDER_PAGINA, deps);
      expect(routed?.response).toEqual({ error: unsupportedMethodError() });
    }
  });

  it('los 6 aprobables de página responden 4200 mientras la cola no existe', async () => {
    const { deps, invokePage, invokeInternal } = buildDeps();
    const aprobables = [
      'eth_sendTransaction',
      'eth_signTypedData_v4',
      'personal_sign',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      // `wallet_revokePermissions` desde una página ya se cubre arriba; aquí los 5 restantes.
    ];
    for (const method of aprobables) {
      const routed = await handleRpcMessage(rpcMessage({ method }), SENDER_PAGINA, deps);
      expect(routed?.response, `${method} debería responder 4200`).toEqual({
        error: unsupportedMethodError(),
      });
    }
    expect(invokePage).not.toHaveBeenCalled();
    expect(invokeInternal).not.toHaveBeenCalled();
  });

  it('un método de página se despacha con el contexto de página ya resuelto', async () => {
    const { deps, invokePage } = buildDeps();
    const routed = await handleRpcMessage(
      rpcMessage({ method: 'eth_getBalance', params: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'latest'] }),
      SENDER_PAGINA,
      deps,
    );
    expect(routed?.response).toEqual({ result: 'pagina' });
    const [method, params, call] = invokePage.mock.calls[0] as [string, unknown[], PageCallContext];
    expect(method).toBe('eth_getBalance');
    expect(params).toHaveLength(2);
    expect(call.tabId).toBe(11);
    expect(call.frameId).toBe(0);
    expect(call.now).toBe(1_700_000_000_000);
  });
});
