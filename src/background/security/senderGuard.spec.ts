/**
 * `src/background/security/senderGuard.spec.ts` — Guardas del canal interno (M20, D-H2-B).
 *
 * Cubre el defecto **D-H2-B** de H2 y fija las dos caras de la guarda:
 *
 *   1. **Contexto de la extensión**: el popup llega con `id = chrome.runtime.id` y
 *      `origin = chrome-extension://<id>` (y, en el `action`, **sin `url`**), a veces con
 *      `sender.tab` presente porque la página se abre en una pestaña. Los `wallet_*` deben
 *      despacharse (no `4200`).
 *   2. **Página web**: un content script llega con el mismo `id` (es el content script de la
 *      extensión) pero con `origin`/`url` de la página → `4200` en los `wallet_*`; y un emisor
 *      cuyo `id` NO es el de la extensión → `4100` en cualquier método.
 *
 * No se transcriben los números a mano: se comparan con los constructores de `../rpc/errors`
 * (`methodNotAllowedInContextError`, `unauthorizedOriginError`), fuente única de los literales.
 */

import { describe, expect, it } from 'vitest';
import { STUB_EXTENSION_ID } from '../../../test/setup/chrome-stub';
import { EXTENSION_ORIGIN } from '../../shared/constants';
import { methodNotAllowedInContextError, unauthorizedOriginError } from '../rpc/errors';
import { guardSender, isExtensionSender, resolveOrigin, routeFromUrl } from './senderGuard';

/** Origen de la extensión tal y como lo entrega `chrome.runtime`: `chrome-extension://<id>`. */
const ORIGEN_EXTENSION = `chrome-extension://${STUB_EXTENSION_ID}`;

/** Origen de la dApp de pruebas. */
const ORIGEN_DAPP = 'http://localhost:5174';

describe('M20 · D-H2-B: contexto de la extensión por ORIGEN (no por `sender.tab`)', () => {
  it('acepta el popup del `action`: id propio, origen `chrome-extension://` y SIN `url`', () => {
    const sender = { id: STUB_EXTENSION_ID, origin: ORIGEN_EXTENSION };
    expect(isExtensionSender(sender)).toBe(true);
    expect(resolveOrigin(sender)).toBe(EXTENSION_ORIGIN);

    const guard = guardSender(sender, {}, 'wallet_getState');
    expect(guard.ok).toBe(true);
    if (guard.ok) {
      expect(guard.context.isExtensionContext).toBe(true);
      expect(guard.context.origin).toBe(EXTENSION_ORIGIN);
      expect(guard.context.route).toBeNull();
      expect(guard.context.tabId).toBeNull();
    }
  });

  it('acepta la página de la extensión abierta en una PESTAÑA (`tab` presente, `url` interna)', () => {
    const sender = {
      id: STUB_EXTENSION_ID,
      origin: ORIGEN_EXTENSION,
      url: `chrome-extension://${STUB_EXTENSION_ID}/index.html`,
      tab: { id: 7 },
    };
    expect(isExtensionSender(sender)).toBe(true);

    const guard = guardSender(sender, {}, 'wallet_revealSecret');
    expect(guard.ok).toBe(true);
    if (guard.ok) {
      expect(guard.context.isExtensionContext).toBe(true);
      expect(guard.context.route).toBe('index.html');
      expect(guard.context.tabId).toBe(7);
    }
  });

  it('acepta las ventanas internas por su URL aunque el origen no se declare', () => {
    const sender = {
      id: STUB_EXTENSION_ID,
      url: `chrome-extension://${STUB_EXTENSION_ID}/connect.html`,
      tab: { id: 3 },
    };
    expect(isExtensionSender(sender)).toBe(true);
    expect(resolveOrigin(sender)).toBe(EXTENSION_ORIGIN);
  });
});

describe('M20 · la guarda NO se relaja para páginas web', () => {
  it('un content script de la dApp recibe `4200` en los `wallet_*`', () => {
    const sender = {
      id: STUB_EXTENSION_ID,
      origin: ORIGEN_DAPP,
      url: `${ORIGEN_DAPP}/test.html`,
      tab: { id: 11 },
      frameId: 0,
    };
    expect(isExtensionSender(sender)).toBe(false);
    expect(resolveOrigin(sender)).toBe(ORIGEN_DAPP);

    const guard = guardSender(sender, {}, 'wallet_getState');
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.error).toEqual(methodNotAllowedInContextError());
    }
  });

  it('un emisor con otro `id` recibe `4100` aunque declare origen de la extensión', () => {
    const sender = { id: 'otra-extension', origin: 'chrome-extension://otra-extension' };
    expect(isExtensionSender(sender)).toBe(false);

    const guard = guardSender(sender, {}, 'wallet_getState');
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.error).toEqual(unauthorizedOriginError());
    }
  });

  it('una URL interna fuera de la allowlist de rutas no es contexto confiable', () => {
    const sender = {
      id: STUB_EXTENSION_ID,
      origin: ORIGEN_EXTENSION,
      url: `chrome-extension://${STUB_EXTENSION_ID}/desconocida.html`,
    };
    expect(routeFromUrl(sender.url)).toBe('desconocida.html');
    expect(isExtensionSender(sender)).toBe(false);
  });
});
