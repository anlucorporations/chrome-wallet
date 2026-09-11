/**
 * `e2e/02-cuentas.spec.ts` — Flujo de cuentas de H2 (tarea 2.17, `plan_desarrollo.md` §3.2.7).
 *
 * Demuestra contra la extensión REAL cargada desde `dist/` y con **Anvil en marcha**:
 *   · `CA-RF-04`: tras importar la frase hay **exactamente 5** cuentas (índices 0..4) con las
 *     direcciones conocidas de Anvil, y «Añadir cuenta» deriva y persiste la **6.ª**.
 *   · `CA-RF-05`: la importación por clave privada añade una cuenta marcada «importada», con
 *     etiqueta renombrable, y una clave repetida responde `-32602`.
 *   · Guarda `-32000` (R-09a / DEC-45): con una sesión de dApp vigente sobre la importada, la
 *     eliminación se bloquea nombrando el origen; tras revocarla, se elimina.
 */

import { ANVIL_ADDRESSES, ADDRESS_KEY_TWO, KEY_TWO, activeSession, seedWallet, storedAccounts, storedImported } from './fixtures/h2';
import { DIST_DIR, distDisponible, expect, openPopupReady, readChromeStorage, test } from './fixtures/extension';
import { join } from 'node:path';

/** Motivo del salto cuando falta el artefacto cargable. */
const MOTIVO_SIN_DIST = `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`;

test.describe('02 · Cuentas: 5 derivadas, la 6.ª y la importada', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la cartera tiene 5 cuentas con las direcciones de Anvil y «Añadir cuenta» crea la 6.ª (CA-RF-04)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, { accounts: ANVIL_ADDRESSES.slice(0, 5) });
    const page = await openPopupReady(context, extensionId);

    // Cinco tarjetas, con las direcciones REALES `m/44'/60'/0'/0/i` de la frase de Anvil.
    await expect(page.locator('.tk-account')).toHaveCount(5);
    const cinco = [...ANVIL_ADDRESSES.slice(0, 5)];
    for (const [index, direccion] of cinco.entries()) {
      await expect(page.locator('.tk-account__address').nth(index)).toHaveAttribute('title', direccion);
    }
    expect(await storedAccounts(background)).toEqual(cinco);

    // «Añadir cuenta» deriva el índice 5 y lo persiste.
    await page.getByRole('button', { name: 'Añadir cuenta' }).click();
    await expect(page.locator('.tk-account')).toHaveCount(6);
    await expect(page.locator('.tk-account__address').nth(5)).toHaveAttribute(
      'title',
      ANVIL_ADDRESSES[5],
    );
    await expect.poll(async () => (await storedAccounts(background)).length).toBe(6);
    const persistidas = await storedAccounts(background);
    expect(persistidas[5]).toBe(ANVIL_ADDRESSES[5]);
    // Las cinco primeras no cambian: la derivación es determinista y acumulativa.
    expect(persistidas.slice(0, 5)).toEqual([...ANVIL_ADDRESSES.slice(0, 5)]);

    // El contraste con la red lo hace `cast` desde el proceso de prueba (§3.2.7): el popup de la
    // extensión no puede consultar el RPC con `page.evaluate`/`fetch`, porque Anvil no acepta su
    // origen por CORS (la extensión sí puede, pero solo por el Service Worker con host_permissions).
    const { execFileSync } = await import('node:child_process');
    const saldoWei = execFileSync(
      'cast',
      ['balance', ANVIL_ADDRESSES[0] ?? '', '--rpc-url', 'http://127.0.0.1:8545'],
      { encoding: 'utf8' },
    ).trim();
    expect(saldoWei).toMatch(/^\d+$/);
    expect(BigInt(saldoWei)).toBeGreaterThan(0n);
  });

  test('importar por clave privada la marca como importada y su etiqueta se renombra (CA-RF-05)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background);
    const page = await openPopupReady(context, extensionId);

    await page.getByRole('button', { name: 'Importar clave privada' }).click();
    await page.locator('#import-clave').fill(KEY_TWO);
    await page.locator('#import-etiqueta').fill('Ahorros');
    await page.locator('form').getByRole('button', { name: 'Importar clave privada' }).click();

    await expect(page.locator('.tk-account')).toHaveCount(6);
    const importada = page.locator('.tk-account').nth(5);
    await expect(importada.locator('.tk-account__kind')).toHaveText('importada');
    await expect(importada.locator('.tk-account__address')).toHaveAttribute('title', ADDRESS_KEY_TWO);
    await expect(importada.locator('.tk-account__label')).toHaveText('Ahorros');
    const persistidas = await storedImported(background);
    expect(persistidas).toHaveLength(1);
    expect(persistidas[0]?.privateKey).toBe(KEY_TWO);

    // Renombrar escribe el `label` de la entrada importada (DEC-35).
    await importada.getByRole('button', { name: 'Renombrar' }).click();
    await page.locator('#renombrar').fill('Ahorros fríos');
    await page.getByRole('button', { name: 'Guardar etiqueta' }).click();
    await expect(page.locator('.tk-account').nth(5).locator('.tk-account__label')).toHaveText(
      'Ahorros fríos',
    );
    await expect.poll(async () => (await storedImported(background))[0]?.label).toBe('Ahorros fríos');

    // Una clave repetida responde `-32602` y NO añade una séptima cuenta.
    await page.getByRole('button', { name: 'Importar clave privada' }).click();
    await page.locator('#import-clave').fill(KEY_TWO);
    await page.locator('form').getByRole('button', { name: 'Importar clave privada' }).click();
    await expect(page.locator('.tk-status__code').first()).toHaveText('-32602');
    await expect(page.locator('.tk-status__message').first()).toContainText('Esa cuenta ya está en la cartera.');
    await expect(page.locator('.tk-account')).toHaveCount(6);
  });

  test('la sesión de dApp vigente bloquea la eliminación con `-32000` y se desbloquea al revocarla', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, {
      imported: [{ address: ADDRESS_KEY_TWO, privateKey: KEY_TWO, label: 'Ahorros' }],
    });
    const page = await openPopupReady(context, extensionId);
    const importada = page.locator('.tk-account').nth(5);
    await expect(importada.locator('.tk-account__kind')).toHaveText('importada');

    // Sin sesión: el diálogo enumeraría la pérdida y la eliminación procede.
    // Con sesión vigente: la guarda del SW responde `-32000` nombrando el origen.
    await background.evaluate(async (sessions) => {
      await chrome.storage.local.set({ truekeate_connected_sites: sessions });
    }, activeSession(ADDRESS_KEY_TWO));
    // El popup relee el estado al abrirse de nuevo con la sesión ya sembrada.
    await page.close();
    const pageBloqueada = await openPopupReady(context, extensionId);
    await pageBloqueada.locator('.tk-account').nth(5).getByRole('button', { name: 'Eliminar' }).click();
    await expect(pageBloqueada.getByRole('dialog')).toBeVisible();
    await pageBloqueada.getByRole('button', { name: 'Eliminar' }).last().click();
    await expect(pageBloqueada.locator('.tk-status__code').first()).toHaveText('-32000');
    await expect(pageBloqueada.locator('.tk-status__message').first()).toContainText(
      'La cuenta está en uso por la dApp http://localhost:5174',
    );
    // El almacén queda INTACTO: la importada sigue con su clave privada.
    expect(await storedImported(background)).toHaveLength(1);

    // Revocar la sesión (lo que hará «Sitios conectados» en H3) desbloquea la baja.
    await background.evaluate(async () => {
      await chrome.storage.local.set({ truekeate_connected_sites: {} });
    });
    await pageBloqueada.close();
    const pageLibre = await openPopupReady(context, extensionId);
    await pageLibre.locator('.tk-account').nth(5).getByRole('button', { name: 'Eliminar' }).click();
    await pageLibre.getByRole('button', { name: 'Eliminar' }).last().click();
    await expect(pageLibre.locator('.tk-account')).toHaveCount(5);
    await expect.poll(async () => (await storedImported(background)).length).toBe(0);
    const almacen = JSON.stringify(await readChromeStorage(background, 'truekeate_imported_accounts'));
    expect(almacen).not.toContain(KEY_TWO);
  });
});
