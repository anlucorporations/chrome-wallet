// @vitest-environment node
/**
 * `src/background/rpc/setCurrentAccount.spec.ts` — `CA-RF-15` en el SERVICE WORKER:
 * el cambio de cuenta activa desde el popup actualiza la cuenta compartida de las sesiones
 * VIGENTES y emite `accountsChanged` con la cuenta NUEVA a las pestañas conectadas.
 *
 * Cierra los dos defectos de producción de H3:
 * - **D-H3-A**: `handleSetCurrentAccount` solo persistía `truekeate_current_account` y
 *   `emitAccountsChanged` (M27) no tenía ninguna llamada en producción.
 * - **D-H3-B**: la sesión por origen mantenía la cuenta fijada al conectar, así que el cambio no
 *   tenía reflejo en `eth_accounts`. Semántica elegida: **opción (a)**, la de MetaMask — la sesión
 *   vigente comparte la cuenta ACTIVA.
 *
 * Se ejerce el despacho REAL (`invokeInternalMethod` con `defaultInternalDeps`) sobre el almacén
 * simulado del arnés y las pestañas de `chrome.tabs` del propio stub, sin dobles de M26/M27: lo
 * que se mide es lo que hace producción.
 *
 * Entorno `node`: ver la cabecera de `src/background/crypto/mnemonic.spec.ts`.
 */

import { describe, expect, it } from 'vitest';

import { chromeStub } from '../../../test/setup/chrome-stub';
import type { TrustedSenderContext } from '../security/senderGuard';
import { STORAGE_KEYS } from '../state/schema';
import { invokeInternalMethod } from './catalog';

/** Cuentas 0 y 1 de Anvil: las dos que usa el flujo de conexión y el cambio de cuenta. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CUENTA_2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const ORIGEN = 'http://localhost:5174';
const ORIGEN_VENCIDO = 'http://vencida.test';

/** Contexto del popup ya validado por la guarda de emisor (M20): extensión y sin pestaña. */
const CONTEXTO_EXTENSION: TrustedSenderContext = {
  runtimeId: 'tk-stub-extension-id-for-tests',
  origin: 'extension',
  isExtensionContext: true,
  route: 'index.html',
  tabId: null,
  frameId: 0,
  respondToFrameOnly: false,
  declaredOrigin: null,
};

/** Sesión persistida con las magnitudes que indique la prueba. */
const sesion = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  origin: ORIGEN,
  account: CUENTA_0,
  chainId: '0x7a69',
  tabIds: [7],
  connectedAt: 1,
  lastUsedAt: 2,
  expiresAt: null,
  connected: true,
  ...overrides,
});

/** Siembra cartera (5 derivadas, la 0 activa) y sesiones de dApp en el almacén del stub. */
const sembrar = async (sessions: Record<string, unknown>): Promise<void> => {
  await chromeStub.storage.local.set({
    [STORAGE_KEYS.mnemonic]: 'test test test test test test test test test test test junk',
    [STORAGE_KEYS.accounts]: [CUENTA_0, CUENTA_1, CUENTA_2],
    [STORAGE_KEYS.importedAccounts]: [],
    [STORAGE_KEYS.currentAccount]: 'idx:0',
    [STORAGE_KEYS.settings]: {
      derivedAccountCount: 3,
      accountLabels: {},
      hiddenAccounts: [],
      language: 'es',
      encryptionEnabled: false,
      requirePasswordOnOpen: false,
      schemaVersion: '1.4',
      devNoticeAcceptedAt: 1,
    },
    [STORAGE_KEYS.connectedSites]: sessions,
  });
};

/**
 * Registra una pestaña con content script y devuelve la lista de mensajes que recibe.
 * Una pestaña SIN handler (no registrada) simula la cerrada o sin content script.
 */
const escucharPestana = (tabId: number): unknown[] => {
  const recibidos: unknown[] = [];
  chromeStub.tabs.addTab({ id: tabId, url: `${ORIGEN}/test.html` });
  chromeStub.tabs.setMessageHandler(tabId, (message) => {
    recibidos.push(message);
    return undefined;
  });
  return recibidos;
};

/** Sesiones persistidas tal y como quedaron tras el cambio. */
const sesionesPersistidas = (): Record<string, Record<string, unknown>> =>
  (chromeStub.rawStorage()[STORAGE_KEYS.connectedSites] ?? {}) as Record<
    string,
    Record<string, unknown>
  >;

/** Cambia la cuenta activa por el método interno REAL del contrato §5.1.1. */
const cambiarCuentaActiva = (ref: string): Promise<unknown> =>
  invokeInternalMethod('wallet_setCurrentAccount', [{ ref }], CONTEXTO_EXTENSION);

describe('CA-RF-15 · `wallet_setCurrentAccount` propaga la cuenta nueva (D-H3-A / D-H3-B)', () => {
  it('actualiza la sesión vigente y emite `accountsChanged` con la cuenta nueva a sus pestañas', async () => {
    await sembrar({ [ORIGEN]: sesion({ tabIds: [7, 9, 12] }) });
    const pestana7 = escucharPestana(7);
    const pestana9 = escucharPestana(9);
    // La pestaña 12 NO tiene content script: su entrega falla y no rompe las demás.

    const respuesta = await cambiarCuentaActiva('idx:1');

    // El contrato de §5.1.1 no cambia: sigue devolviendo la referencia activa.
    expect(respuesta).toEqual({ currentAccountRef: 'idx:1' });
    // La sesión vigente comparte AHORA la cuenta activa (D-H3-B, opción (a)).
    expect(sesionesPersistidas()[ORIGEN]?.account).toBe(CUENTA_1);
    // Y la dApp recibe el evento con la cuenta NUEVA, literal y en las dos pestañas vivas.
    const esperado = { type: 'TRUEKEATE_EVENT', eventName: 'accountsChanged', data: [CUENTA_1] };
    expect(pestana7).toEqual([esperado]);
    expect(pestana9).toEqual([esperado]);
    // Ningún otro evento del catálogo se inventa en este flujo.
    const nombres = [...pestana7, ...pestana9].map(
      (evento) => (evento as { eventName?: string }).eventName,
    );
    expect(nombres).toEqual(['accountsChanged', 'accountsChanged']);
  });

  it('`eth_accounts` devuelve la cuenta nueva tras el cambio (fin de la ambigüedad D-H3-B)', async () => {
    await sembrar({ [ORIGEN]: sesion({ tabIds: [7] }) });
    const { touchSession } = await import('../sessions');

    const antes = await touchSession(ORIGEN);
    expect(antes.session?.account).toBe(CUENTA_0);

    await cambiarCuentaActiva('idx:1');

    const despues = await touchSession(ORIGEN);
    expect(despues.session?.account).toBe(CUENTA_1);
  });

  it('no emite NADA a orígenes sin sesión vigente ni resucita sesiones vencidas', async () => {
    await sembrar({
      [ORIGEN]: sesion({ account: CUENTA_1, tabIds: [7] }),
      [ORIGEN_VENCIDO]: sesion({
        origin: ORIGEN_VENCIDO,
        account: CUENTA_0,
        tabIds: [8],
        expiresAt: 1,
      }),
    });
    const pestana7 = escucharPestana(7);
    const pestana8 = escucharPestana(8);

    await cambiarCuentaActiva('idx:1');

    // La sesión ya compartía la cuenta nueva: no hay cambio que anunciar.
    expect(pestana7).toEqual([]);
    // La vencida no se toca (su purga sigue siendo perezosa) y no recibe direcciones.
    expect(pestana8).toEqual([]);
    expect(sesionesPersistidas()[ORIGEN_VENCIDO]?.account).toBe(CUENTA_0);
  });

  it('una referencia inexistente falla con `-32602` y NO emite ni toca las sesiones', async () => {
    await sembrar({ [ORIGEN]: sesion({ tabIds: [7] }) });
    const pestana7 = escucharPestana(7);

    await expect(cambiarCuentaActiva('idx:9')).rejects.toMatchObject({ code: -32602 });

    expect(pestana7).toEqual([]);
    expect(sesionesPersistidas()[ORIGEN]?.account).toBe(CUENTA_0);
    expect(chromeStub.rawStorage()[STORAGE_KEYS.currentAccount]).toBe('idx:0');
  });
});
