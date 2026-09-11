/**
 * `src/background/rateLimit.spec.ts` — *Token bucket* por origen de TODO el catálogo (M3.b,
 * H3 tarea 3.13).
 *
 * §3.3.7 exige que «100 lecturas disparen el *token bucket*» y §3.3.6 (`CA-RF-14` / RNF-10,
 * DEC-44/ADT-24) que la ventana de **6 solicitudes / 60 s** cubra **también las lecturas**: la
 * séptima llamada de un origen hostil recibe `4001` con el literal de §4.3, **sin abrir ventana** y
 * **sin llamar al nodo**.
 *
 * Las pruebas ejercitan las tres capas: la decisión PURA (`consumeRateWindow`), la decisión con
 * persistencia (la ventana vive en `truekeate_rate_windows`, así que **sobrevive a la suspensión del
 * SW**) y el router real (`handleRPCRequest`) con el contador de invocaciones de página.
 */

import { describe, expect, it, vi } from 'vitest';

import { STUB_EPOCH_MS, STUB_EXTENSION_ID, chromeStub } from '../../test/setup/chrome-stub';
import {
  EXTENSION_ORIGIN,
  RATE_WINDOW_MS,
  rateLimitWindowMs,
  rateLimitWindowRequests,
} from '../shared/constants';
import type { RateWindow } from '../shared/types';
import { rateLimitExceededError } from './rpc/errors';
import {
  consumeRateWindow,
  decideRateLimit,
  freshRateWindow,
  normalizeRateWindow,
  readRateWindows,
  reconcileRateWindows,
} from './rpc/rateLimit';
import { defaultRouterDeps, handleRPCRequest, type RouterDeps } from './rpc/router';

const T0 = STUB_EPOCH_MS;
const ORIGEN = 'http://localhost:5174';
const CUENTA = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Content script de la dApp de pruebas (origen de página, frame 0). */
const SENDER_PAGINA = {
  id: STUB_EXTENSION_ID,
  origin: ORIGEN,
  url: `${ORIGEN}/test.html`,
  tab: { id: 11 },
  frameId: 0,
};

/** Popup de la extensión: su origen lógico es `extension`. */
const SENDER_POPUP = {
  id: STUB_EXTENSION_ID,
  origin: `chrome-extension://${STUB_EXTENSION_ID}`,
  url: `chrome-extension://${STUB_EXTENSION_ID}/index.html`,
  tab: { id: 4 },
  frameId: 0,
};

/** Ventana de tasa con las magnitudes indicadas. */
const windowOf = (overrides: Partial<RateWindow> = {}): RateWindow => ({
  ...freshRateWindow(T0),
  ...overrides,
});

describe('M3.b · la ventana es de 6 solicitudes / 60 s por origen', () => {
  it('declara la ventana normativa y una capacidad inicial de 6 tokens', () => {
    expect(rateLimitWindowRequests).toBe(6);
    expect(rateLimitWindowMs).toBe(60_000);
    expect(RATE_WINDOW_MS).toBe(60_000);
    expect(freshRateWindow(T0)).toEqual({
      tokens: 6,
      lastRefillAt: T0,
      approvalWindowStart: T0,
      approvalsInWindow: 0,
      deniedCount: 0,
      updatedAt: T0,
    });
  });

  it('100 lecturas seguidas consumen 6 tokens y las 94 restantes se rechazan', () => {
    let ventana = freshRateWindow(T0);
    let permitidas = 0;
    let denegadas = 0;

    for (let lectura = 0; lectura < 100; lectura += 1) {
      const decision = consumeRateWindow(ventana, T0 + lectura * 10);
      if (decision.allowed) {
        permitidas += 1;
      } else {
        denegadas += 1;
      }
      ventana = decision.window;
    }

    expect(permitidas).toBe(6);
    expect(denegadas).toBe(94);
    expect(ventana.tokens).toBe(0);
    // El rechazo se contabiliza como diagnóstico y NO consume tokens negativos.
    expect(ventana.deniedCount).toBe(94);
    expect(ventana.tokens).toBeGreaterThanOrEqual(0);
  });

  it('pasada la ventana de 60 s el bucket se reinicia y vuelve a admitir', () => {
    let ventana = freshRateWindow(T0);
    for (let lectura = 0; lectura < 6; lectura += 1) {
      ventana = consumeRateWindow(ventana, T0 + lectura * 10).window;
    }
    expect(consumeRateWindow(ventana, T0 + 100).allowed).toBe(false);
    // A los 60 s exactos desde `approvalWindowStart` la ventana se reinicia.
    const nueva = consumeRateWindow(ventana, T0 + RATE_WINDOW_MS);
    expect(nueva.allowed).toBe(true);
    expect(nueva.window.tokens).toBe(5);
    expect(nueva.window.approvalWindowStart).toBe(T0 + RATE_WINDOW_MS);
  });
});

describe('M3.b · persistencia: la ventana sobrevive a la suspensión del SW', () => {
  it('la ventana se guarda en `truekeate_rate_windows` y el 7.º uso ya está agotado', async () => {
    for (let lectura = 0; lectura < 6; lectura += 1) {
      const decision = await decideRateLimit({ origin: ORIGEN, now: T0 + lectura * 10 });
      expect(decision.allowed, `la lectura ${lectura + 1} debería caber en la ventana`).toBe(true);
    }

    const persistidas = await readRateWindows();
    expect(Object.keys(persistidas)).toEqual([ORIGEN]);
    expect(persistidas[ORIGEN]?.tokens).toBe(0);

    // «Suspensión del SW»: el bucket no vive en memoria, así que la 7.ª lectura sigue agotada.
    const septima = await decideRateLimit({ origin: ORIGEN, now: T0 + 100 });
    expect(septima.allowed).toBe(false);
    expect(septima.window.deniedCount).toBe(1);
    // Y una ventana nueva (61 s después) vuelve a admitir porque se lee del almacén.
    const despues = await decideRateLimit({ origin: ORIGEN, now: T0 + RATE_WINDOW_MS });
    expect(despues.allowed).toBe(true);
  });

  it('los contextos de la extensión están exentos: 100 lecturas no consumen ni escriben', async () => {
    for (let lectura = 0; lectura < 100; lectura += 1) {
      const decision = await decideRateLimit({ origin: EXTENSION_ORIGIN, now: T0 + lectura });
      expect(decision.allowed).toBe(true);
      expect(decision.changed).toBe(false);
    }
    expect(await readRateWindows()).toEqual({});
    expect(chromeStub.storage.local.writes()).toHaveLength(0);
  });

  it('`normalizeRateWindow` reinicia el bucket con el reloj movido hacia atrás y acota la capacidad', () => {
    const futura = windowOf({ tokens: 0, lastRefillAt: T0 + 10_000, approvalWindowStart: T0 + 10_000 });
    const normalizada = normalizeRateWindow(futura, T0);
    expect(normalizada.tokens).toBe(6);
    expect(normalizada.approvalWindowStart).toBe(T0);

    const inflada = windowOf({ tokens: 99 });
    expect(normalizeRateWindow(inflada, T0 + 1).tokens).toBe(6);
    expect(normalizeRateWindow(null, T0).tokens).toBe(6);
  });

  it('`reconcileRateWindows` purga las entradas inactivas (>10 min) y conserva las vivas', async () => {
    await chrome.storage.local.set({
      truekeate_rate_windows: {
        'http://inactiva.test': windowOf({ tokens: 3, updatedAt: T0 }),
        'http://viva.test': windowOf({ tokens: 3, updatedAt: T0 + 599_000 }),
      },
    });

    const informe = await reconcileRateWindows({ now: T0 + 600_001 });
    expect(informe).toEqual({ purged: 1, reset: 0, retained: 1 });
    const restantes = await readRateWindows();
    expect(Object.keys(restantes)).toEqual(['http://viva.test']);
    expect(restantes['http://viva.test']?.tokens).toBe(3);
  });
});

describe('M3/M4 · el bucket cubre TODO el catálogo desde el router (DEC-44 / ADT-24)', () => {
  it('100 `eth_getBalance` de una página: 6 responden y 94 reciben 4001 SIN tocar el nodo', async () => {
    const invokePage = vi.fn(async () => '0xde0b6b3a7640000');
    const deps: RouterDeps = { ...defaultRouterDeps, invokePage, now: () => T0 };

    let respondidas = 0;
    let rechazadas = 0;
    for (let lectura = 0; lectura < 100; lectura += 1) {
      const resultado = await handleRPCRequest(
        { sender: SENDER_PAGINA, method: 'eth_getBalance', params: [CUENTA, 'latest'] },
        deps,
      );
      if (resultado.ok) {
        respondidas += 1;
      } else {
        rechazadas += 1;
        expect(resultado.error).toEqual(rateLimitExceededError());
        expect(resultado.error.code).toBe(4001);
      }
    }

    expect(respondidas).toBe(6);
    expect(rechazadas).toBe(94);
    // El rechazo NO llama al nodo: exactamente las 6 permitidas llegan a la capa de página.
    expect(invokePage).toHaveBeenCalledTimes(6);
    // Y NO abre ventana ni escribe en la cola de aprobaciones (no existe ninguna entrada).
    expect(await chrome.storage.local.get('truekeate_connect_request')).toEqual({});
    expect(await chrome.storage.local.get('truekeate_pending_requests')).toEqual({});
  });

  it('el *polling* del popup (origen `extension`) no agota el bucket de nadie', async () => {
    const invokePage = vi.fn(async () => '0xde0b6b3a7640000');
    const deps: RouterDeps = { ...defaultRouterDeps, invokePage, now: () => T0 };

    for (let lectura = 0; lectura < 100; lectura += 1) {
      const resultado = await handleRPCRequest(
        { sender: SENDER_POPUP, method: 'eth_getBalance', params: [CUENTA, 'latest'] },
        deps,
      );
      expect(resultado.ok, `la lectura ${lectura + 1} del popup fue rechazada`).toBe(true);
    }
    expect(invokePage).toHaveBeenCalledTimes(100);
    expect(await readRateWindows()).toEqual({});
  });

  it('la ventana agotada de UN origen no afecta a otro origen distinto', async () => {
    for (let lectura = 0; lectura < 6; lectura += 1) {
      await decideRateLimit({ origin: ORIGEN, now: T0 });
    }
    expect((await decideRateLimit({ origin: ORIGEN, now: T0 })).allowed).toBe(false);
    expect((await decideRateLimit({ origin: 'http://otra-dapp.test', now: T0 })).allowed).toBe(true);
  });
});
