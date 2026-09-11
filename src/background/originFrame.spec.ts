/**
 * `src/background/originFrame.spec.ts` — Un frame ≠ 0 **no** hereda la sesión del top (D-J / ADT-07).
 *
 * `plan_desarrollo.md` §3.3.8 lo marca como riesgo BLOQUEANTE del hito: si el Service Worker
 * dedujera el origen de `sender.tab.url`, en un iframe cross-origin ese `url` es el del **top
 * frame** y el iframe heredaría la sesión del anfitrión. La guarda (M20) recalcula el origen SOLO
 * desde `sender.origin` y, para el frame distinto de 0, la respuesta vuelve SOLO a ese frame
 * (DEC-40/ADT-07).
 *
 * Las pruebas son de router real (`handleRPCRequest` + `defaultRouterDeps`): la sesión del top se
 * siembra en el almacén y se comprueba que el iframe responde `[]` mientras el top responde su
 * cuenta — y que el iframe tampoco crea una sesión nueva para sí.
 */

import { describe, expect, it, vi } from 'vitest';

import { STUB_EXTENSION_ID } from '../../test/setup/chrome-stub';
import type { DappSession } from '../shared/types';
import { emitAccountsChanged, emitProviderEvent, sendEventToTab } from './events';
import { unauthorizedOriginError, userRejectedError } from './rpc/errors';
import { handleRpcMessage, handleRPCRequest, defaultRouterDeps, type RouterDeps } from './rpc/router';
import type { OpenConnectInput } from './rpc/pageMethods';
import { guardSender, resolveOrigin, responseTargetFor, type SenderLike } from './security/senderGuard';
import { readSessions } from './sessions';

/** Epoch determinista (coincide con el reloj del stub de `chrome.*`). */
const T0 = 1_700_000_000_000;

/** Origen del top frame (la dApp que SÍ está conectada). */
const ORIGEN_TOP = 'http://localhost:5174';

/** Origen del iframe hostil (cross-origin, nunca conectado). */
const ORIGEN_IFRAME = 'http://127.0.0.1:5199';

/** Cuenta autorizada del top. */
const CUENTA = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Emisor del top frame: su `origin` y su `url` coinciden. */
const SENDER_TOP: SenderLike = {
  id: STUB_EXTENSION_ID,
  origin: ORIGEN_TOP,
  url: `${ORIGEN_TOP}/test.html`,
  tab: { id: 9 },
  frameId: 0,
};

/**
 * Emisor del iframe cross-origin tal y como lo entrega Chrome: `origin` es el del IFRAME y
 * `sender.tab.url`, en cambio, apunta al TOP (`/test.html`). Esa discrepancia es justo el vector
 * del defecto que este spec debe detectar.
 */
const SENDER_IFRAME: SenderLike = {
  id: STUB_EXTENSION_ID,
  origin: ORIGEN_IFRAME,
  url: `${ORIGEN_TOP}/test.html`,
  tab: { id: 9 },
  frameId: 3,
};

/** Sesión vigente del top, persistida en `truekeate_connected_sites`. */
const sessionOfTop = (): DappSession => ({
  origin: ORIGEN_TOP,
  account: CUENTA,
  chainId: '0x7a69',
  tabIds: [9],
  connectedAt: T0 - 1_000,
  lastUsedAt: T0 - 1_000,
  expiresAt: T0 + 86_400_000,
  connected: true,
});

/** Dependencias reales con el reloj fijado (el resto del despacho es el de producción). */
const deps: RouterDeps = { ...defaultRouterDeps, now: () => T0 };

/** Siembra la sesión del top en el almacén del stub. */
const seedTopSession = async (): Promise<void> => {
  await chrome.storage.local.set({ truekeate_connected_sites: { [ORIGEN_TOP]: sessionOfTop() } });
};

describe('M20 · el origen del frame se recalcula desde `sender.origin` (D-J / ADT-07)', () => {
  it('un iframe cross-origin NO hereda el origen del top aunque `tab.url` sea el del top', () => {
    expect(resolveOrigin(SENDER_IFRAME)).toBe(ORIGEN_IFRAME);

    const guard = guardSender(SENDER_IFRAME, {}, 'eth_accounts');
    expect(guard.ok).toBe(true);
    if (!guard.ok) return;

    expect(guard.context.origin).toBe(ORIGEN_IFRAME);
    expect(guard.context.origin).not.toBe(ORIGEN_TOP);
    expect(guard.context.tabId).toBe(9);
    expect(guard.context.frameId).toBe(3);
    expect(guard.context.respondToFrameOnly).toBe(true);
    // La respuesta vuelve SOLO al frame 3 de la pestaña 9.
    expect(responseTargetFor(guard.context)).toEqual({ tabId: 9, frameId: 3 });
  });

  it('la respuesta del TOP va sin `frameId` (solo se acota a los frames ≠ 0)', () => {
    const guard = guardSender(SENDER_TOP, {}, 'eth_accounts');
    expect(guard.ok).toBe(true);
    if (!guard.ok) return;
    expect(guard.context.respondToFrameOnly).toBe(false);
    expect(responseTargetFor(guard.context)).toEqual({ tabId: 9, frameId: null });
  });

  it('sin `sender.origin`, una página NO cae a `sender.tab.url`: recibe 4100', () => {
    const sinOrigen: SenderLike = {
      id: STUB_EXTENSION_ID,
      url: `${ORIGEN_TOP}/test.html`,
      tab: { id: 9 },
      frameId: 3,
    };
    // El origen NO se deduce de la URL del top: queda vacío y la guarda rechaza.
    expect(resolveOrigin(sinOrigen)).toBe('');
    const guard = guardSender(sinOrigen, {}, 'eth_accounts');
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.error).toEqual(unauthorizedOriginError());
    }
  });

  it('el `frameId` declarado en el mensaje se ignora: manda el del emisor real', async () => {
    const routed = await handleRpcMessage(
      {
        type: 'TRUEKEATE_RPC',
        method: 'eth_accounts',
        params: [],
        origin: ORIGEN_TOP,
        tabId: 9,
        frameId: 0,
      },
      SENDER_IFRAME,
      deps,
    );
    expect(routed?.target).toEqual({ tabId: 9, frameId: 3 });
    expect(routed?.context?.origin).toBe(ORIGEN_IFRAME);
  });
});

describe('M3/M26 · aislamiento de sesión entre top e iframe', () => {
  it('con el TOP conectado, el iframe responde [] (no hereda la cuenta) y no crea sesión', async () => {
    await seedTopSession();

    const iframe = await handleRPCRequest(
      { sender: SENDER_IFRAME, method: 'eth_accounts', params: [] },
      deps,
    );
    expect(iframe.ok).toBe(true);
    if (iframe.ok) {
      expect(iframe.result, 'el iframe heredó la sesión del top').toEqual([]);
    }
    expect(iframe.target).toEqual({ tabId: 9, frameId: 3 });

    // El iframe tampoco ha quedado registrado como sitio conectado.
    const sesiones = await readSessions();
    expect(Object.keys(sesiones)).toEqual([ORIGEN_TOP]);
    expect(sesiones[ORIGEN_IFRAME]).toBeUndefined();
  });

  it('el TOP sí recibe su cuenta autorizada en la misma ejecución (control positivo)', async () => {
    await seedTopSession();

    const top = await handleRPCRequest(
      { sender: SENDER_TOP, method: 'eth_accounts', params: [] },
      deps,
    );
    expect(top.ok).toBe(true);
    if (top.ok) {
      expect(top.result).toEqual([CUENTA]);
    }
    expect(top.target).toEqual({ tabId: 9, frameId: null });

    // Y el uso desde el top renovó la sesión (no la creó para el iframe).
    const sesiones = await readSessions();
    expect(Object.keys(sesiones)).toEqual([ORIGEN_TOP]);
    expect(sesiones[ORIGEN_TOP]?.expiresAt).toBe(T0 + 86_400_000);
  });

  it('el aislamiento es por ORIGEN: un iframe del mismo origen del top SÍ comparte la sesión', async () => {
    await seedTopSession();

    const mismoOrigen: SenderLike = {
      ...SENDER_TOP,
      url: `${ORIGEN_TOP}/embed.html`,
      frameId: 5,
    };
    const resultado = await handleRPCRequest(
      { sender: mismoOrigen, method: 'eth_accounts', params: [] },
      deps,
    );
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.result).toEqual([CUENTA]);
    }
    // La respuesta se acota al frame 5 aunque comparta la sesión del top.
    expect(resultado.target).toEqual({ tabId: 9, frameId: 5 });
  });

  it('`eth_requestAccounts` desde el iframe no reutiliza la sesión del top', async () => {
    await seedTopSession();

    // El catálogo de H3 abre `connect.html` solo si NO hay sesión para ESE origen: si el iframe
    // heredara la del top, este despacho devolvería la cuenta SIN pasar por la conexión. La
    // apertura se sustituye por un doble que rechaza (nada de ventanas ni plazos reales).
    const openConnect = vi.fn(async (_input: OpenConnectInput) => ({
      success: false,
      error: userRejectedError({ reason: 'spec-origin-frame' }),
    }));
    const depsConVentana: RouterDeps = { ...deps, page: { ...deps.page, openConnect } };

    const iframe = await handleRPCRequest(
      { sender: SENDER_IFRAME, method: 'eth_requestAccounts', params: [] },
      depsConVentana,
    );
    // Se entra en la conexión para el origen del IFRAME, nunca con la cuenta del top.
    expect(openConnect).toHaveBeenCalledTimes(1);
    expect(openConnect.mock.calls[0]?.[0]).toMatchObject({
      origin: ORIGEN_IFRAME,
      tabId: 9,
      frameId: 3,
    });
    expect(iframe.ok).toBe(false);
    if (!iframe.ok) {
      expect(iframe.error.code).toBe(4001);
    }
    expect(Object.keys(await readSessions())).toEqual([ORIGEN_TOP]);
  });
});

describe('M27 · entrega de eventos: destino por frame y reenvío literal (DEC-40 / H-39)', () => {
  /** Doble de `chrome.tabs` que registra las entregas y puede fallar en una pestaña concreta. */
  const tabsDoble = (ids: readonly number[], fallan: readonly number[] = []) => {
    const entregas: Array<{ tabId: number; message: unknown; options?: { frameId?: number } }> = [];
    return {
      entregas,
      tabs: {
        query: async () => ids.map((id) => ({ id })),
        sendMessage: async (tabId: number, message: unknown, options?: { frameId?: number }) => {
          if (fallan.includes(tabId)) {
            throw new Error('Could not establish connection. Receiving end does not exist.');
          }
          entregas.push(options === undefined ? { tabId, message } : { tabId, message, options });
          return undefined;
        },
      },
    };
  };

  it('un evento dirigido a un frame ≠ 0 viaja SOLO a ese frame (`{ frameId }`)', async () => {
    const doble = tabsDoble([7]);
    const sobre = { type: 'TRUEKEATE_EVENT', eventName: 'accountsChanged', data: [] } as const;

    await expect(sendEventToTab(sobre, { tabId: 7, frameId: 3 }, doble.tabs)).resolves.toBe(true);
    expect(doble.entregas).toEqual([{ tabId: 7, message: sobre, options: { frameId: 3 } }]);

    // El top frame (0 o `null`) se entrega SIN opciones: es el destinatario por defecto.
    await expect(sendEventToTab(sobre, { tabId: 7, frameId: 0 }, doble.tabs)).resolves.toBe(true);
    await expect(sendEventToTab(sobre, { tabId: 7, frameId: null }, doble.tabs)).resolves.toBe(true);
    expect(doble.entregas[1]).toEqual({ tabId: 7, message: sobre });
    expect(doble.entregas[2]).toEqual({ tabId: 7, message: sobre });
  });

  it('`emitProviderEvent` llega a TODAS las pestañas y una sin content script no rompe el resto', async () => {
    const doble = tabsDoble([11, 12, 13], [12]);

    const entregadas = await emitProviderEvent('accountsChanged', [], { deps: { tabs: doble.tabs } });

    expect(entregadas, 'la pestaña 12 falló y las otras dos debían recibirlo').toBe(2);
    expect(doble.entregas.map((entrega) => entrega.tabId)).toEqual([11, 13]);
    // El sobre se reenvía LITERAL: ni se filtra ni se transforma (nota H-39).
    for (const entrega of doble.entregas) {
      expect(entrega.message).toEqual({ type: 'TRUEKEATE_EVENT', eventName: 'accountsChanged', data: [] });
      expect(entrega.options).toBeUndefined();
    }
  });

  it('`emitAccountsChanged([])` publica la lista VACÍA tal cual en las pestañas indicadas', async () => {
    const doble = tabsDoble([21, 22]);

    const entregadas = await emitAccountsChanged([], {
      tabIds: [21, 22],
      deps: { tabs: doble.tabs },
    });

    expect(entregadas).toBe(2);
    // `accountsChanged` es el único evento que transporta direcciones; al revocar, la lista va vacía.
    expect(doble.entregas.map((entrega) => entrega.message)).toEqual([
      { type: 'TRUEKEATE_EVENT', eventName: 'accountsChanged', data: [] },
      { type: 'TRUEKEATE_EVENT', eventName: 'accountsChanged', data: [] },
    ]);
  });
});
