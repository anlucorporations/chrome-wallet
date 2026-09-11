/**
 * `e2e/25-recuperacion.spec.ts` — Revelado y exportación con higiene (tarea 2.17).
 *
 * Demuestra `CA-RF-50` sobre la extensión REAL:
 *   · el valor exige **confirmación explícita** y aparece oculto por defecto;
 *   · el revelado dura **30 s** (`REVEAL_HIDE_MS`) y se oculta **también por pérdida de foco**;
 *   · al ocultarse se **borra el portapapeles** si aún contiene el valor;
 *   · el valor **nunca** viaja por `window.postMessage`;
 *   · con una sesión de dApp **vigente** sobre la cuenta, el revelado se bloquea con `-32000`
 *     nombrando el origen (R-09a / DEC-45) y se desbloquea al revocarla.
 *
 * Deja la captura `H2/25-recuperacion-<fecha>.png` (§3.2.7).
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADDRESS_KEY_TWO,
  ANVIL_ADDRESSES,
  ANVIL_MNEMONIC,
  KEY_TWO,
  activeSession,
  seedWallet,
} from './fixtures/h2';
import {
  DIST_DIR,
  EVIDENCE_DIR,
  RUN_DATE,
  distDisponible,
  expect,
  extensionUrl,
  openPopupReady,
  test,
} from './fixtures/extension';

/** Motivo del salto cuando falta el artefacto cargable. */
const MOTIVO_SIN_DIST = `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`;

/** Abre la pestaña «Seguridad» y pide el revelado de la frase aceptando el diálogo. */
const revelarFrase = async (page: Awaited<ReturnType<typeof openPopupReady>>): Promise<void> => {
  await page.getByRole('tab', { name: 'Seguridad' }).click();
  await page.getByRole('button', { name: 'Revelar frase semilla' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Revelar frase semilla' });
  await expect(dialogo).toBeVisible();
  // Hasta aquí el valor NO existe en el DOM: la confirmación es previa y explícita.
  await expect(page.locator('.tk-reveal__value')).toHaveCount(0);
  await dialogo.getByRole('button', { name: 'Acepto' }).click();
};

test.describe('25 · Recuperación: revelado temporal, portapapeles y bloqueo', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('el revelado exige confirmación, dura 30 s, descarta la memoria y NO pasa por postMessage (CA-RF-50)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background);
    const page = await openPopupReady(context, extensionId);

    // Intercepta `window.postMessage` en el popup ANTES del revelado: RNF-09 exige 0 mensajes
    // que transporten el secreto hacia la página.
    await page.evaluate(() => {
      const registro: unknown[] = [];
      (window as unknown as { __tkPostMessage: unknown[] }).__tkPostMessage = registro;
      const original = window.postMessage.bind(window);
      window.postMessage = (...args: Parameters<typeof window.postMessage>) => {
        registro.push(args[0]);
        return original(...args);
      };
    });

    await revelarFrase(page);
    const valor = page.locator('.tk-reveal__value');
    await expect(valor).toBeVisible();
    await expect(valor).toHaveText(ANVIL_MNEMONIC);
    // Aviso de captura visible y cuenta atrás de 30 s.
    await expect(page.locator('.tk-reveal__warning')).toContainText('Evita capturas de pantalla');
    await expect(page.locator('.tk-reveal__countdown')).toHaveText(/^(30|29) s$/);

    // Copiar y ocultar: el portapapeles debe quedar VACÍO al ocultarse (higiene del revelado).
    await page.getByRole('button', { name: 'Copiar' }).click();
    expect(await page.evaluate(async () => navigator.clipboard.readText())).toBe(ANVIL_MNEMONIC);
    await page.screenshot({
      path: join(EVIDENCE_DIR, `25-recuperacion-${RUN_DATE}.png`),
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Ocultar ahora' }).click();
    await expect(page.locator('.tk-reveal__value')).toHaveCount(0);
    await expect(page.locator('.tk-status__message').first()).toContainText('Portapapeles vaciado');
    await expect
      .poll(async () => page.evaluate(async () => navigator.clipboard.readText()))
      .toBe('');

    // El valor no viajó por `window.postMessage` (0 mensajes con la frase).
    const mensajes = await page.evaluate(
      () => (window as unknown as { __tkPostMessage: unknown[] }).__tkPostMessage,
    );
    expect(mensajes).toEqual([]);

    // Y una segunda revelación deja volver a leer el valor (el descarte no rompe la operación).
    await revelarFrase(page);
    await expect(page.locator('.tk-reveal__value')).toHaveText(ANVIL_MNEMONIC);
    await page.getByRole('button', { name: 'Ocultar ahora' }).click();
    await expect(page.locator('.tk-reveal__value')).toHaveCount(0);
  });

  test('el revelado se oculta al PERDER el foco y vacía el portapapeles (CA-RF-50)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background);
    const page = await openPopupReady(context, extensionId);
    await revelarFrase(page);
    await expect(page.locator('.tk-reveal__value')).toHaveText(ANVIL_MNEMONIC);
    await page.getByRole('button', { name: 'Copiar' }).click();
    expect(await page.evaluate(async () => navigator.clipboard.readText())).toBe(ANVIL_MNEMONIC);

    // Pérdida de foco real: una segunda pestaña pasa a primer plano.
    const otra = await context.newPage();
    await otra.goto(extensionUrl(extensionId, 'index.html'));
    await otra.bringToFront();

    await expect(page.locator('.tk-reveal__value')).toHaveCount(0);
    await expect(page.locator('.tk-status__message').first()).toContainText('perdido el foco');
    await expect
      .poll(async () => page.evaluate(async () => navigator.clipboard.readText()))
      .toBe('');
    await otra.close();
  });

  test('con una sesión de dApp vigente el revelado se bloquea con `-32000` y se desbloquea al revocar', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, {
      imported: [{ address: ADDRESS_KEY_TWO, privateKey: KEY_TWO, label: 'Ahorros' }],
      connectedSites: activeSession(ANVIL_ADDRESSES[0]),
    });
    const page = await openPopupReady(context, extensionId);
    await revelarFrase(page);

    // La guarda del SW responde `-32000` nombrando el origen y el valor NO aparece.
    await expect(page.locator('.tk-status__code').first()).toHaveText('-32000');
    await expect(page.locator('.tk-status__message').first()).toContainText(
      'La cuenta está en uso por la dApp http://localhost:5174',
    );
    await expect(page.locator('.tk-reveal__value')).toHaveCount(0);
    await expect(page.locator('.tk-reveal')).toHaveCount(0);

    // La exportación de la clave privada de una IMPORTADA no depende de la sesión de la cuenta 0.
    await page.getByRole('button', { name: 'Exportar clave de Ahorros' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Exportar clave privada' });
    await dialogo.getByRole('button', { name: 'Acepto' }).click();
    await expect(page.locator('.tk-reveal__value')).toHaveText(KEY_TWO);
    await page.getByRole('button', { name: 'Ocultar ahora' }).click();
    await expect(page.locator('.tk-reveal__value')).toHaveCount(0);

    // Revocar la sesión (lo que hará «Sitios conectados» en H3) desbloquea el revelado.
    await background.evaluate(async () => {
      await chrome.storage.local.set({ truekeate_connected_sites: {} });
    });
    await page.reload();
    await revelarFrase(page);
    await expect(page.locator('.tk-reveal__value')).toHaveText(ANVIL_MNEMONIC);
    await page.getByRole('button', { name: 'Ocultar ahora' }).click();
    await expect(page.locator('.tk-reveal__value')).toHaveCount(0);
  });
});
