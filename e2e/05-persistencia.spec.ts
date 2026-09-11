/**
 * `e2e/05-persistencia.spec.ts` — Auto-carga y restauración del estado (tarea 2.17).
 *
 * Demuestra `CA-RF-09` y `CA-RF-10`: al **reabrir el popup** se restauran la cuenta activa, los
 * ajustes y las importadas con los MISMOS valores y **sin pedir la frase**; y la suspensión del
 * Service Worker por CDP (RNF-08) no pierde nada, porque `chrome.storage.local` es la fuente de
 * verdad.
 */

import { join } from 'node:path';
import {
  ADDRESS_KEY_TWO,
  ANVIL_ADDRESSES,
  KEY_TWO,
  seedWallet,
  storedAccounts,
  storedImported,
} from './fixtures/h2';
import {
  DIST_DIR,
  distDisponible,
  expect,
  getBackgroundWorker,
  openPopupReady,
  readChromeStorage,
  stopServiceWorker,
  test,
} from './fixtures/extension';

/** Motivo del salto cuando falta el artefacto cargable. */
const MOTIVO_SIN_DIST = `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`;

test.describe('05 · Persistencia: reabrir el popup restaura el estado', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('reabrir el popup restaura cuenta activa e importadas SIN pedir la frase (CA-RF-09 / CA-RF-10)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, {
      accounts: ANVIL_ADDRESSES.slice(0, 5),
      imported: [{ address: ADDRESS_KEY_TWO, privateKey: KEY_TWO, label: 'Ahorros' }],
      currentAccount: 'idx:3',
    });

    const primera = await openPopupReady(context, extensionId);
    // La cuenta activa guardada (`idx:3`) es la que se pinta como activa.
    await expect(primera.locator('.tk-account--active .tk-account__label')).toHaveText('Cuenta 4');
    await expect(primera.locator('.tk-account')).toHaveCount(6);
    // Sin prompt de contraseña ni petición de la frase en ningún momento.
    await expect(primera.locator('input[type="password"]')).toHaveCount(0);
    await expect(primera.locator('#import-mnemonic')).toHaveCount(0);
    await primera.close();

    // Reapertura: mismo estado, sin interacción previa.
    const segunda = await openPopupReady(context, extensionId);
    await expect(segunda.locator('.tk-account--active .tk-account__label')).toHaveText('Cuenta 4');
    await expect(segunda.locator('.tk-account')).toHaveCount(6);
    await expect(segunda.locator('.tk-account').nth(5).locator('.tk-account__label')).toHaveText(
      'Ahorros',
    );
    expect(await storedAccounts(background)).toEqual([...ANVIL_ADDRESSES.slice(0, 5)]);
    expect((await storedImported(background))[0]?.label).toBe('Ahorros');
    await segunda.close();
  });

  test('la suspensión del Service Worker por CDP no pierde el estado persistido (RNF-08)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, {
      imported: [{ address: ADDRESS_KEY_TWO, privateKey: KEY_TWO, label: 'Ahorros' }],
      currentAccount: 'idx:2',
    });
    const page = await openPopupReady(context, extensionId);

    const watch = await stopServiceWorker(context, extensionId, { page });
    expect(watch.status()).toBe('stopped');

    // Cualquier mensaje del popup despierta el SW; el estado está en el almacén, no en memoria.
    const reaparicion = watch.waitUntilRunning();
    await page.evaluate(async () => {
      await chrome.runtime.sendMessage({ type: 'TRUEKEATE_RPC', method: 'eth_chainId' }).catch(() => undefined);
    });
    await reaparicion;
    await watch.detach();

    const revivido = await getBackgroundWorker(context);
    const mnemonic = await readChromeStorage(revivido, 'truekeate_mnemonic');
    expect(String(mnemonic.truekeate_mnemonic ?? '').split(' ')).toHaveLength(12);
    expect(await storedAccounts(revivido)).toEqual([...ANVIL_ADDRESSES.slice(0, 5)]);
    expect((await storedImported(revivido))[0]?.label).toBe('Ahorros');
    // Y el popup, recargado, sigue mostrando la cuenta activa restaurada.
    await page.reload();
    await expect(page.locator('.tk-account--active .tk-account__label')).toHaveText('Cuenta 3');
  });

  test('una cartera dañada se anuncia como «Wallet dañada» y no deriva cuentas nuevas (RNF-22)', async ({
    context,
    extensionId,
    background,
  }) => {
    // Frase con checksum BIP-39 roto: M13 deja el estado en «damaged» al arrancar el SW.
    await seedWallet(background, {
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon',
      accounts: ANVIL_ADDRESSES.slice(0, 5),
    });
    const page = await openPopupReady(context, extensionId);
    await expect(page.locator('.tk-empty__title')).toHaveText('Wallet dañada');
    await expect(page.locator('.tk-status__message').first()).toContainText('cartera');
    // No se ofrece derivar ni crear: el estado dañado bloquea la UI.
    await expect(page.getByRole('button', { name: 'Añadir cuenta' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Cuentas' })).toHaveCount(0);
  });
});
