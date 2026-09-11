// @vitest-environment node
/**
 * `src/background/crypto/secretsExport.spec.ts` — M12 (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre `CA-RF-50` en su parte de **servicio**: confirmación explícita obligatoria, contexto de
 * confianza, plazo de 30 s (`REVEAL_HIDE_MS`) y guarda `-32000` de sesión de dApp activa al
 * revelar la frase o al exportar la clave privada de una cuenta en uso (R-09a / DEC-45).
 *
 * Entorno `node`: ver la cabecera de `mnemonic.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import { chromeStub } from '../../../test/setup/chrome-stub';
import { CLIPBOARD_CLEAR_ON_HIDE, REVEAL_HIDE_MS } from '../../shared/constants';
import {
  EXTENSION_ROUTE_CONNECT,
  EXTENSION_ROUTE_NOTIFICATION,
  EXTENSION_ROUTE_POPUP,
} from '../../shared/protocol';
import { STORAGE_KEYS } from '../state/schema';
import { accountRefForIndex } from '../accounts';
import {
  CLIPBOARD_POLICY_ENABLED,
  REVEAL_ALLOWED_ROUTES,
  SECRET_HIDE_MS,
  canRevealInContext,
  resolveSecret,
  type RevealContextLike,
} from './secrets';

/** Frase de Anvil (semilla de desarrollo del proyecto). */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Direcciones EIP-55 reales de las cuentas 0 y 1 de Anvil. */
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ANVIL_ADDRESS1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Clave privada real de la cuenta 0 de Anvil (es pública: es la de desarrollo). */
const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Origen de la dApp de pruebas que ocupa la cuenta 0. */
const DAPP_ORIGIN = 'http://localhost:5174';

/** Instante determinista del revelado. */
const NOW = 1_700_000_000_000;

/** Contexto de confianza del popup (`index.html`; el `tabId` no discrimina, D-H2-G). */
const POPUP_CONTEXT: RevealContextLike = {
  isExtensionContext: true,
  route: EXTENSION_ROUTE_POPUP,
  tabId: null,
};

/** Sesión vigente de la dApp sobre `account`. */
const activeSession = (account: string, expiresAt: number | null = null): Record<string, unknown> => ({
  [DAPP_ORIGIN]: {
    origin: DAPP_ORIGIN,
    account,
    connectedAt: NOW - 60_000,
    lastUsedAt: NOW - 1_000,
    expiresAt,
    connected: true,
  },
});

/** Siembra cartera (frase + cuentas derivadas + la activa) y, si se pide, una sesión. */
const seedWallet = async (options: { sessions?: Record<string, unknown>; imported?: unknown[] } = {}): Promise<void> => {
  await chromeStub.storage.local.set({
    [STORAGE_KEYS.mnemonic]: ANVIL_MNEMONIC,
    [STORAGE_KEYS.accounts]: [ANVIL_ADDRESS0, ANVIL_ADDRESS1],
    [STORAGE_KEYS.importedAccounts]: options.imported ?? [],
    [STORAGE_KEYS.currentAccount]: accountRefForIndex(0),
    [STORAGE_KEYS.connectedSites]: options.sessions ?? {},
  });
};

/** Dependencias del revelado con reloj fijo y el almacén del stub. */
const deps = () => ({ now: () => NOW, storage: chromeStub.storage.local });

describe('M12 · confirmación explícita y contexto de confianza', () => {
  it('sin `confirmed: true` no se entrega nada: `4001 userRejected`', async () => {
    await seedWallet();
    const result = await resolveSecret({ kind: 'mnemonic', confirmed: false }, POPUP_CONTEXT, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(4001);
    expect(result.error.message).toBe('Operación cancelada por el usuario.');
    expect(result.error.data).toMatchObject({ reason: 'reveal-not-confirmed' });
  });

  it('`confirmed` distinto de `true` (cadena, número) tampoco revela', async () => {
    await seedWallet();
    for (const confirmed of ['true', 1, null, undefined]) {
      const result = await resolveSecret(
        { kind: 'mnemonic', confirmed: confirmed as unknown as boolean },
        POPUP_CONTEXT,
        deps(),
      );
      expect(result.ok).toBe(false);
    }
  });

  it('solo el popup (`index.html`) está en la allowlist, con pestaña o sin ella (D-H2-G)', () => {
    expect(REVEAL_ALLOWED_ROUTES).toEqual([EXTENSION_ROUTE_POPUP]);
    expect(canRevealInContext(POPUP_CONTEXT)).toBe(true);
    expect(canRevealInContext({ isExtensionContext: true, route: EXTENSION_ROUTE_CONNECT, tabId: null })).toBe(false);
    // D-H2-G: el popup del `action` y `index.html` abierto en una pestaña llegan CON `sender.tab`
    // (igual que documentó D-H2-B en `security/senderGuard.ts`). El `tabId` NO discrimina el
    // contexto: la frontera es el ORIGEN de la extensión y la ruta del popup.
    expect(canRevealInContext({ isExtensionContext: true, route: EXTENSION_ROUTE_POPUP, tabId: 7 })).toBe(true);
    expect(canRevealInContext({ isExtensionContext: true, route: EXTENSION_ROUTE_NOTIFICATION, tabId: 7 })).toBe(false);
    expect(canRevealInContext({ isExtensionContext: false, route: EXTENSION_ROUTE_POPUP, tabId: null })).toBe(false);
    expect(canRevealInContext({ isExtensionContext: true, route: null, tabId: null })).toBe(false);
  });

  it('un contexto que no es el popup responde `4200 methodNotAllowedInContext`', async () => {
    await seedWallet();
    const result = await resolveSecret({ kind: 'mnemonic', confirmed: true }, { isExtensionContext: false, route: null, tabId: 3 }, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(4200);
    expect(result.error.message).toBe('El método solicitado no está permitido en este contexto.');
  });

  it('la guarda de contexto se comprueba ANTES que la confirmación', async () => {
    await seedWallet();
    const result = await resolveSecret(
      { kind: 'mnemonic', confirmed: false },
      { isExtensionContext: false, route: null, tabId: 1 },
      deps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(4200);
  });
});

describe('M12 · revelado de la frase (CA-RF-50)', () => {
  it('entrega la frase normalizada con plazo de 30 s en el reloj inyectado', async () => {
    await seedWallet();
    const result = await resolveSecret({ kind: 'mnemonic', confirmed: true }, POPUP_CONTEXT, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.secret.kind).toBe('mnemonic');
    expect(result.secret.value).toBe(ANVIL_MNEMONIC);
    expect(result.secret.account).toBeNull();
    expect(result.secret.revealedAt).toBe(NOW);
    expect(result.secret.hideAt).toBe(NOW + 30_000);
    expect(result.secret.hideAfterMs).toBe(30_000);
    expect(result.secret.length).toBe(ANVIL_MNEMONIC.length);
  });

  it('el plazo de la política es el de producción: 30 000 ms', () => {
    expect(REVEAL_HIDE_MS).toBe(30_000);
    expect(SECRET_HIDE_MS).toBe(REVEAL_HIDE_MS);
    expect(CLIPBOARD_POLICY_ENABLED).toBe(CLIPBOARD_CLEAR_ON_HIDE);
    expect(CLIPBOARD_CLEAR_ON_HIDE).toBe(true);
  });

  it('sin frase guardada responde `-32603` y no inventa un valor', async () => {
    await chromeStub.storage.local.set({ [STORAGE_KEYS.accounts]: [] });
    const result = await resolveSecret({ kind: 'mnemonic', confirmed: true }, POPUP_CONTEXT, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(-32603);
    expect(result.error.data).toMatchObject({ reason: 'no-mnemonic' });
  });
});

describe('M12 · exportación de una clave privada (CA-RF-50)', () => {
  it('exporta la clave real de una cuenta derivada', async () => {
    await seedWallet();
    const result = await resolveSecret(
      { kind: 'privateKey', accountRef: accountRefForIndex(0), confirmed: true },
      POPUP_CONTEXT,
      deps(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.secret.kind).toBe('privateKey');
    expect(result.secret.value).toBe(ANVIL_KEY0);
    expect(result.secret.account).toBe(ANVIL_ADDRESS0);
    expect(result.secret.hideAt).toBe(NOW + 30_000);
    expect(result.secret.length).toBe(66);
  });

  it('exporta la clave de una cuenta importada desde su entrada persistida', async () => {
    const importedKey = `0x${'2'.padStart(64, '0')}`;
    const importedAddress = '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF';
    await seedWallet({ imported: [{ address: importedAddress, privateKey: importedKey, label: 'Importada 1', importedAt: 1, visible: true }] });
    const result = await resolveSecret(
      { kind: 'privateKey', accountRef: `imp:${importedAddress}`, confirmed: true },
      POPUP_CONTEXT,
      deps(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.secret.value).toBe(importedKey);
    expect(result.secret.account).toBe(importedAddress);
  });

  it('sin `accountRef` responde `-32603` con la causa declarada', async () => {
    await seedWallet();
    const result = await resolveSecret({ kind: 'privateKey', confirmed: true }, POPUP_CONTEXT, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(-32603);
    expect(result.error.data).toMatchObject({ reason: 'missing-account-ref' });
  });

  it('con una cuenta que no existe responde `-32603 unknown-account`', async () => {
    await seedWallet();
    const result = await resolveSecret(
      { kind: 'privateKey', accountRef: accountRefForIndex(9), confirmed: true },
      POPUP_CONTEXT,
      deps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.data).toMatchObject({ reason: 'unknown-account' });
  });
});

describe('M12 · guarda de sesión de dApp activa (R-09a / DEC-45)', () => {
  it('con una dApp vigente sobre la cuenta 0, la frase se bloquea con `-32000` nombrando el origen', async () => {
    await seedWallet({ sessions: activeSession(ANVIL_ADDRESS0) });
    const result = await resolveSecret({ kind: 'mnemonic', confirmed: true }, POPUP_CONTEXT, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(-32000);
    expect(result.error.message).toBe(
      `La cuenta está en uso por la dApp ${DAPP_ORIGIN}: revoca ese permiso antes de revelar su clave privada o eliminarla.`,
    );
    // El literal de §4.3 sustituye `<origen>`: el origen viaja en el MENSAJE, no en `data`.
    expect(result.error.data).toBeUndefined();
  });

  it('la guarda del mnemonic alcanza CUALQUIER cuenta derivada, no solo la activa', async () => {
    await seedWallet({ sessions: activeSession(ANVIL_ADDRESS1) });
    const result = await resolveSecret({ kind: 'mnemonic', confirmed: true }, POPUP_CONTEXT, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(-32000);
  });

  it('la clave de la cuenta 0 se bloquea si la dApp ocupa la cuenta 0', async () => {
    await seedWallet({ sessions: activeSession(ANVIL_ADDRESS0) });
    const result = await resolveSecret(
      { kind: 'privateKey', accountRef: accountRefForIndex(0), confirmed: true },
      POPUP_CONTEXT,
      deps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(-32000);
    expect(result.error.message).toContain(DAPP_ORIGIN);
  });

  it('la clave de la cuenta 1 NO se bloquea por una sesión sobre la cuenta 0', async () => {
    await seedWallet({ sessions: activeSession(ANVIL_ADDRESS1) });
    const result = await resolveSecret(
      { kind: 'privateKey', accountRef: accountRefForIndex(0), confirmed: true },
      POPUP_CONTEXT,
      deps(),
    );
    expect(result.ok).toBe(true);
  });

  it('tras revocar la sesión (origen ausente) el revelado vuelve a funcionar', async () => {
    await seedWallet({ sessions: activeSession(ANVIL_ADDRESS0) });
    const blocked = await resolveSecret({ kind: 'mnemonic', confirmed: true }, POPUP_CONTEXT, deps());
    expect(blocked.ok).toBe(false);

    await chromeStub.storage.local.set({ [STORAGE_KEYS.connectedSites]: {} });
    const unblocked = await resolveSecret({ kind: 'mnemonic', confirmed: true }, POPUP_CONTEXT, deps());
    expect(unblocked.ok).toBe(true);
  });

  it('una sesión caducada no bloquea el revelado', async () => {
    await seedWallet({ sessions: activeSession(ANVIL_ADDRESS0, NOW - 1) });
    const result = await resolveSecret({ kind: 'mnemonic', confirmed: true }, POPUP_CONTEXT, deps());
    expect(result.ok).toBe(true);
  });

  it('una entrada marcada como desconectada no bloquea el revelado', async () => {
    const sessions = activeSession(ANVIL_ADDRESS0);
    (sessions[DAPP_ORIGIN] as Record<string, unknown>).connected = false;
    await seedWallet({ sessions });
    const result = await resolveSecret({ kind: 'privateKey', accountRef: accountRefForIndex(0), confirmed: true }, POPUP_CONTEXT, deps());
    expect(result.ok).toBe(true);
  });

  it('una sesión sin caducidad (`expiresAt: null`) sigue vigente y bloquea', async () => {
    await seedWallet({ sessions: activeSession(ANVIL_ADDRESS0, null) });
    const result = await resolveSecret({ kind: 'privateKey', accountRef: accountRefForIndex(0), confirmed: true }, POPUP_CONTEXT, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(-32000);
  });
});
