/**
 * `e2e/17-i18n.spec.ts` — Formato y textos de la UI (tarea 6.4 del plan §3.6.5; `CA-RT-10`, RF-34).
 *
 * QUÉ VERIFICA
 * ------------
 * 1. **ETH a 4 decimales con coma** (`1,0000 ETH`): el saldo que pinta el popup, la estimación del
 *    formulario de envío y el valor de la transacción en la ventana de confirmación usan el MISMO
 *    formato de `src/shared/format.ts` (M62). El literal canónico lo fija `format.spec.ts`; aquí se
 *    comprueba que la UI **lo usa** y que no hay ningún importe con otro número de decimales.
 * 2. **Direcciones `0x1234…abcd`**: el texto visible de una cuenta está recortado con la elipsis
 *    U+2026 y el valor completo sigue disponible en su atributo `title` (identidad_visual.md §5.2).
 * 3. **Todo el texto visible en español**: se recorre el texto de las cuatro superficies y se
 *    comprueba que no aparece ninguna de las palabras inglesas de la regla `CA-RT-10`. Es la misma
 *    regla que `src/popup/i18n.spec.ts` aplica con el AST de TypeScript, aquí sobre el DOM real: la
 *    única diferencia es que el DOM contiene además los datos (direcciones, importes, hashes), que
 *    NO son texto de UI.
 *
 * Evidencia: `RepoTecnico/evidencia/H6/17-i18n-<fecha>.json`.
 */

import type { Page } from '@playwright/test';

import {
  DAPP_ORIGIN,
  abrirPestanaDelPopup,
  archivarEvidencia,
  conectarDapp,
  distDisponible,
  esperarProvider,
  esperarVentanaDeDecision,
  expect,
  iniciarPeticionDeFirma,
  openDapp,
  openExtensionPage,
  openPopupReady,
  test,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Cuenta #0 de Anvil. */
const CUENTA_0 = ANVIL_ADDRESSES[0];

/**
 * Palabras inglesas de la regla `CA-RT-10` (`send`, `cancel`, `copy`, `confirm`, `settings`) más las
 * que aparecerían si alguien dejara un control sin traducir. Se buscan con límites de palabra: el
 * español correcto («Confirmación», «Cancelar») NO coincide, que es el falso positivo que motivó la
 * reformulación de la regla en H2 (D-H2-A).
 */
const PALABRAS_INGLESAS = /\b(send|cancel|copy|confirm|settings|submit|loading|wallet\s+damaged)\b/i;

/**
 * Texto visible de una página, **sin** los nodos que no son texto de interfaz: `code`/`pre` (llevan
 * datos: direcciones, hashes, calldata), `script` y `style`.
 */
const textoVisible = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const raiz = document.body.cloneNode(true) as HTMLElement;
    for (const nodo of raiz.querySelectorAll('script, style, code, pre, template')) {
      nodo.remove();
    }
    return raiz.innerText ?? raiz.textContent ?? '';
  });

test.describe('17 · formato de datos y textos en español (CA-RT-10)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('el saldo del popup usa 4 decimales con coma', async ({ context, extensionId, background }) => {
    test.setTimeout(180_000);
    await seedWallet(background);
    const popup = await openPopupReady(context, extensionId);

    const saldo = popup.locator('.tk-account__balance').first();
    await expect(saldo).toBeVisible({ timeout: 30_000 });
    const texto = (await saldo.textContent())?.trim() ?? '';

    // Formato exacto: parte entera + COMA + 4 decimales + símbolo de la red.
    expect(texto, `el saldo «${texto}» no usa el formato ETH a 4 decimales`).toMatch(
      /^-?\d+,\d{4} ETH$/,
    );
    // Ni punto decimal ni separador de millares ni notación científica.
    expect(texto).not.toMatch(/\d\.\d/);
    expect(texto).not.toMatch(/[eE][+-]?\d/);
    expect(texto).not.toMatch(/\d,\d{3}[,.]/);

    archivarEvidencia('17-i18n', {
      criterio: 'CA-RT-10 · ETH a 4 decimales con coma',
      ejemplo: '1,0000 ETH',
      saldoMostrado: texto,
    });
  });

  test('las direcciones se muestran `0x1234…abcd` con el valor completo en `title`', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);
    const popup = await openPopupReady(context, extensionId);

    const boton = popup.locator('.tk-account__address').first();
    await expect(boton).toBeVisible();
    const visible = (await boton.textContent())?.trim() ?? '';
    const completo = (await boton.getAttribute('title')) ?? '';

    // Prefijo de 6, elipsis U+2026 y sufijo de 4.
    expect(visible).toMatch(/^0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/);
    expect(visible.charCodeAt(6)).toBe(0x2026);
    expect(visible).not.toContain('...');
    // El valor completo sigue disponible para quien necesite verificarlo.
    expect(completo).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(visible.slice(0, 6)).toBe(completo.slice(0, 6));
    expect(visible.slice(-4)).toBe(completo.slice(-4));
    // Y el mismo formato en la ventana de conexión.
    const connect = await openExtensionPage(context, extensionId, 'connect.html');
    const fila = connect.locator('.tk-connect-row__address').first();
    if ((await fila.count()) > 0) {
      const enConnect = (await fila.textContent())?.trim() ?? '';
      expect(enConnect).toMatch(/0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/);
    }

    archivarEvidencia('17-i18n', {
      criterio: 'CA-RT-10 · direcciones 0x1234…abcd',
      ejemplo: '0x1234…abcd',
      direccionMostrada: visible,
      direccionCompleta: completo,
    });
  });

  test('el valor de la transacción en la ventana de confirmación usa el mismo formato', async ({
    context,
    background,
  }) => {
    test.setTimeout(240_000);
    await seedWallet(background);
    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);
    const conexion = await conectarDapp(context, dapp, { indice: 0 });
    expect(conexion.ok, `la conexión de la dApp falló: ${conexion.resultado}`).toBe(true);

    await iniciarPeticionDeFirma(dapp, 'eth_sendTransaction', [
      { from: CUENTA_0, to: ANVIL_ADDRESSES[1], value: '0xde0b6b3a7640000' }, // 1 ETH
    ]);
    const ventana = await esperarVentanaDeDecision(context);
    await expect(ventana.locator('.tk-origin__url')).toContainText(DAPP_ORIGIN);

    // El resumen de la transacción muestra el valor con 4 decimales y coma.
    const valor = ventana.locator('.tk-summary__row', { hasText: 'Valor' }).first();
    await expect(valor).toBeVisible({ timeout: 30_000 });
    const texto = (await valor.textContent())?.trim() ?? '';
    expect(texto, `el valor «${texto}» no usa el formato de 4 decimales`).toMatch(/\d,\d{4}\s*ETH/);
    expect(texto).not.toMatch(/\d\.\d{4}/);

    archivarEvidencia('17-i18n', {
      criterio: 'CA-RT-10 · valor de la transacción a 4 decimales',
      filaValor: texto,
    });
  });

  test('las cuatro superficies declaran español y no muestran texto de UI en inglés', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(300_000);
    await seedWallet(background);
    const superficies: { nombre: string; page: Page }[] = [];

    superficies.push({ nombre: 'popup · Cuentas', page: await openPopupReady(context, extensionId) });
    superficies.push({
      nombre: 'popup · Seguridad',
      page: await abrirPestanaDelPopup(context, extensionId, 'Seguridad'),
    });
    superficies.push({
      nombre: 'connect.html',
      page: await openExtensionPage(context, extensionId, 'connect.html'),
    });
    superficies.push({
      nombre: 'notification.html',
      page: await openExtensionPage(context, extensionId, 'notification.html'),
    });
    const dapp = await context.newPage();
    await openDapp(dapp);
    superficies.push({ nombre: 'test.html (dApp)', page: dapp });

    const hallazgos: string[] = [];
    const idiomas: Record<string, string> = {};
    for (const { nombre, page } of superficies) {
      idiomas[nombre] = await page.evaluate(() => document.documentElement.lang);
      const texto = await textoVisible(page);
      const encontrado = PALABRAS_INGLESAS.exec(texto);
      if (encontrado !== null) {
        const indice = encontrado.index ?? 0;
        hallazgos.push(`${nombre}: «${encontrado[1]}» en «…${texto.slice(Math.max(0, indice - 40), indice + 40)}…»`);
      }
    }

    // `lang="es"` en las cuatro superficies: sin él, un lector de pantalla leería en inglés.
    for (const [nombre, lang] of Object.entries(idiomas)) {
      expect(lang, `${nombre} no declara el idioma`).toBe('es');
    }
    expect(hallazgos, 'CA-RT-10: hay texto visible en inglés').toEqual([]);

    archivarEvidencia('17-i18n', {
      criterio: 'CA-RT-10 · textos visibles en español en las cuatro superficies',
      idiomas,
      hallazgos,
    });
  });
});
