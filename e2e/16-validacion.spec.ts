/**
 * `e2e/16-validacion.spec.ts` — Validación inline de los cuatro formularios (tarea 2.17).
 *
 * Demuestra `CA-RF-33`: con una frase, una dirección, un importe o una clave privada inválidos, el
 * popup pinta el mensaje **inline** con su `code` y su acción (diccionario §4.3) **y la operación
 * no se envía**. El contraste observable de «no se envía» es que el almacén no cambia.
 *
 * Nota de alcance: el formulario de **importe** pertenece al envío (H4); su validación se prueba
 * sobre el módulo compartido en `src/shared/validation/validation.spec.ts` (M60) y aquí se cubren
 * los tres formularios que el popup de H2 sí expone: frase, clave privada y etiqueta.
 */

import { join } from 'node:path';
import { ADDRESS_KEY_TWO, KEY_TWO, seedWallet, storedImported } from './fixtures/h2';
import {
  DIST_DIR,
  distDisponible,
  expect,
  openPopupReady,
  readChromeStorage,
  test,
} from './fixtures/extension';

/** Motivo del salto cuando falta el artefacto cargable. */
const MOTIVO_SIN_DIST = `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`;

/** 12 palabras con forma correcta pero checksum BIP-39 roto. */
const MNEMONIC_BROKEN = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';

/** Frase con 11 palabras: falla el recuento. */
const MNEMONIC_ELEVEN = 'test test test test test test test test test test junk';

/** Clave privada fuera del rango de secp256k1 (`d = 0`). */
const KEY_ZERO = `0x${'0'.repeat(64)}`;

test.describe('16 · Validación inline de formularios (CA-RF-33)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la frase inválida muestra el error inline y no envía la operación', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, { mnemonic: null, accounts: [] });
    const page = await openPopupReady(context, extensionId);
    await page.getByRole('button', { name: 'Importar frase' }).click();
    const campo = page.locator('#import-mnemonic');

    // 11 palabras → mensaje inline con `-32602` y la acción de §4.3.
    await campo.fill(MNEMONIC_ELEVEN);
    const error = page.locator('#import-mnemonic-error');
    await expect(error).toBeVisible();
    await expect(error.locator('.tk-status__code')).toHaveText('-32602');
    await expect(error).toContainText('La frase de recuperación no es válida');
    await expect(error).toContainText('Revisar la frase');
    await expect(campo).toHaveAttribute('aria-invalid', 'true');
    await expect(campo).toHaveAttribute('aria-describedby', 'import-mnemonic-error');

    // 12 palabras con checksum roto → el SW es quien rechaza, con el MISMO error del catálogo.
    await campo.fill(MNEMONIC_BROKEN);
    await page.locator('form').getByRole('button', { name: 'Importar frase' }).click();
    await expect(page.locator('.tk-status__code').first()).toHaveText('-32602');
    await expect(page.locator('.tk-status__message').first()).toContainText(
      'La frase de recuperación no es válida: revisa las 12 palabras y su checksum.',
    );
    // La operación NO se aplicó: no hay frase ni cuentas persistidas.
    const almacen = await readChromeStorage(background, ['truekeate_mnemonic', 'truekeate_accounts']);
    expect(almacen.truekeate_mnemonic).toBeUndefined();
    expect(almacen.truekeate_accounts).toBeUndefined();
    await expect(page.locator('.tk-account')).toHaveCount(0);
  });

  test('la clave privada inválida muestra el error inline y no añade ninguna cuenta', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background);
    const page = await openPopupReady(context, extensionId);
    await page.getByRole('button', { name: 'Importar clave privada' }).click();
    const campo = page.locator('#import-clave');

    // Longitud incorrecta.
    await campo.fill(`${KEY_TWO}00`);
    const error = page.locator('#import-clave-error');
    await expect(error).toBeVisible();
    await expect(error.locator('.tk-status__code')).toHaveText('-32602');
    await expect(error).toContainText('`0x` + 64 caracteres hexadecimales');
    await expect(error).toContainText('Revisar la clave');
    await expect(campo).toHaveAttribute('aria-invalid', 'true');

    // Forma correcta pero fuera del rango de secp256k1: lo rechaza el SW con el mismo literal.
    await campo.fill(KEY_ZERO);
    await page.locator('form').getByRole('button', { name: 'Importar clave privada' }).click();
    await expect(page.locator('.tk-status__code').first()).toHaveText('-32602');
    await expect(page.locator('.tk-status__message').first()).toContainText('curva secp256k1');
    expect(await storedImported(background)).toEqual([]);
    await expect(page.locator('.tk-account')).toHaveCount(5);
  });

  test('la etiqueta inválida se señala inline y no renombra la cuenta (CA-RF-33)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, {
      imported: [{ address: ADDRESS_KEY_TWO, privateKey: KEY_TWO, label: 'Ahorros' }],
    });
    const page = await openPopupReady(context, extensionId);
    await page.locator('.tk-account').nth(5).getByRole('button', { name: 'Renombrar' }).click();
    const campo = page.locator('#renombrar');

    await campo.fill('x'.repeat(33));
    const error = page.locator('#renombrar-error');
    await expect(error).toBeVisible();
    await expect(error.locator('.tk-status__code')).toHaveText('-32602');
    await expect(error).toContainText('La etiqueta no es válida: debe tener entre 1 y 32 caracteres.');
    await expect(error).toContainText('Acortar o corregir la etiqueta');
    await expect(campo).toHaveAttribute('aria-invalid', 'true');

    // El formulario no se envía: la etiqueta persistida sigue siendo la anterior.
    const importadas = await storedImported(background);
    expect(importadas[0]?.label).toBe('Ahorros');
    await expect(page.locator('.tk-account').nth(5).locator('.tk-account__label')).toHaveText('Ahorros');
  });
});
