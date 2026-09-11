/**
 * `e2e/03-recibir.spec.ts` — Recepción con dirección, copiar y QR local (tarea 2.17).
 *
 * Demuestra `CA-RF-07`: la dirección **mostrada**, la que va al **portapapeles** y la que codifica
 * el **QR** son la MISMA cadena `0x…`, y el QR se genera sin red (el símbolo se decodifica desde
 * la rejilla de módulos del propio popup).
 */

import { join } from 'node:path';
import { ANVIL_ADDRESSES, readQrPayload, seedWallet } from './fixtures/h2';
import {
  DIST_DIR,
  distDisponible,
  expect,
  openPopupReady,
  test,
} from './fixtures/extension';

/** Motivo del salto cuando falta el artefacto cargable. */
const MOTIVO_SIN_DIST = `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`;

test.describe('03 · Recibir: dirección, portapapeles y QR coinciden', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la pestaña «Recibir» muestra la dirección de la cuenta activa y su QR la codifica (CA-RF-07)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, { accounts: ANVIL_ADDRESSES.slice(0, 5) });
    const page = await openPopupReady(context, extensionId);
    await page.getByRole('tab', { name: 'Recibir' }).click();

    const mostrada = await page.locator('.tk-address-full').textContent();
    expect(mostrada).toBe(ANVIL_ADDRESSES[0]);
    await expect(page.locator('.tk-address-full')).toHaveText(ANVIL_ADDRESSES[0]);

    // El QR se dibuja como rejilla de módulos (29×29 para la versión 3) y su texto decodificado
    // es EXACTAMENTE la dirección mostrada.
    await expect(page.locator('.tk-qr__grid')).toBeVisible();
    await expect(page.locator('.tk-qr__module')).toHaveCount(29 * 29);
    const delQr = await readQrPayload(page);
    expect(delQr).toBe(ANVIL_ADDRESSES[0]);
    expect(delQr).toBe(mostrada);

    // Cambiar de cuenta activa cambia las tres representaciones a la vez.
    await page.getByRole('tab', { name: 'Cuentas' }).click();
    await page.locator('.tk-account__select').nth(1).click();
    await expect(page.locator('.tk-account--active .tk-account__label')).toHaveText('Cuenta 2');
    await page.getByRole('tab', { name: 'Recibir' }).click();
    await expect(page.locator('.tk-address-full')).toHaveText(ANVIL_ADDRESSES[1]);
    expect(await readQrPayload(page)).toBe(ANVIL_ADDRESSES[1]);
  });

  test('«Copiar» deja en el portapapeles la misma dirección que se muestra (CA-RF-07)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, { accounts: ANVIL_ADDRESSES.slice(0, 5) });
    const page = await openPopupReady(context, extensionId);
    await page.getByRole('tab', { name: 'Recibir' }).click();

    const mostrada = await page.locator('.tk-address-full').textContent();
    await page.getByRole('button', { name: 'Copiar' }).click();
    await expect(page.locator('.tk-check-note')).toHaveText('Dirección copiada al portapapeles.');
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();

    const portapapeles = await page.evaluate(async () => navigator.clipboard.readText());
    expect(portapapeles).toBe(mostrada);
    expect(portapapeles).toBe(ANVIL_ADDRESSES[0]);
    // Y el QR sigue codificando lo mismo.
    expect(await readQrPayload(page)).toBe(portapapeles);

    // Evidencia de la igualdad de las tres cadenas.
    expect(new Set([mostrada, portapapeles, await readQrPayload(page)]).size).toBe(1);
  });
});
