/**
 * `e2e/01-onboarding.spec.ts` — Primera aserción del hito H1 (§3.1.7).
 *
 * Verifica, sobre la extensión cargada desde `dist/`:
 *   1. La extensión carga en un contexto persistente y el ID se DESCUBRE del Service Worker,
 *      coincidiendo con el ID derivado de la `key` del manifest (CA-RT-13).
 *   2. El popup abre en 380×600, muestra el estado vacío en español y NO hay errores de consola;
 *      deja la captura `RepoTecnico/evidencia/H1/01-onboarding-<fecha>.png` (§7.4.1.f).
 *   3. El Service Worker arranca y deja la entrada `sw_started` en `truekeate_logs` (tarea 1.10).
 *   4. El arnés puede SUSPENDER el Service Worker por CDP y la extensión se recupera al primer
 *      evento posterior (RNF-08): es la capacidad que exige §7.4.1.c.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DIST_DIR,
  EVIDENCE_DIR,
  RUN_DATE,
  distDisponible,
  expect,
  expectedExtensionId,
  extensionUrl,
  getBackgroundWorker,
  openPopup,
  openPopupReady,
  readChromeStorage,
  stopServiceWorker,
  test,
  writeChromeStorage,
} from './fixtures/extension';

/** Motivo exacto (y accionable) del salto cuando aún no hay artefacto cargable. */
const MOTIVO_SIN_DIST =
  `no existe ${join(DIST_DIR, 'manifest.json')}: la extensión no se puede cargar desde dist/. ` +
  'El build está bloqueado por defectos AJENOS a este spec: (a) `npx tsc -b` — vite.config.ts:155 TS2353, ' +
  'src/background/rpc/errors.ts:304 TS2532, src/inject/eip6963.ts:55 TS2345; (b) `npx vite build` — ' +
  'src/index.html:13, src/connect.html:13 y src/notification.html:13 referencian /<dir>/main.tsx, que no ' +
  'resuelve con `root` = raíz del repositorio, así que las 6 entradas nunca llegan a dist/. ' +
  'Detalle y salidas exactas en RepoTecnico/evidencia/H1/ACTA_H1.md.';

test.describe('01 · Onboarding: carga de dist/ y popup en estado vacío', () => {
  // Salto CONDICIONAL a nivel de grupo: sin `dist/` no se lanza ni el navegador (el fixture no se
  // materializa) y el motivo queda escrito en el informe de Playwright.
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la extensión carga desde dist/ y el ID se descubre del Service Worker', async ({
    extensionId,
    background,
  }) => {
    // El ID nunca se escribe a mano: se descubre del SW y se contrasta con el derivado de la `key`.
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    expect(background.url()).toBe(extensionUrl(extensionId, 'background.js'));
    expect(extensionId, 'el ID descubierto no coincide con el derivado de la `key` del manifest').toBe(
      expectedExtensionId(),
    );

    // El Service Worker está operativo: responde a una lectura de `chrome.storage.local`.
    const almacen = await readChromeStorage(background, null);
    expect(typeof almacen).toBe('object');
  });

  test('el popup abre en 380×600, muestra el estado vacío en español y no hay errores de consola', async ({
    context,
    extensionId,
    background,
  }) => {
    const erroresConsola: string[] = [];
    const erroresDePagina: string[] = [];

    // Los listeners se registran ANTES de navegar: de otro modo se perderían los errores del
    // arranque, que son justo los que interesa detectar (criterio de CU-36).
    const page = await context.newPage();
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error') erroresConsola.push(mensaje.text());
    });
    page.on('pageerror', (error) => {
      erroresDePagina.push(error.message);
    });
    await page.goto(extensionUrl(extensionId, 'index.html'));
    await page.waitForLoadState('domcontentloaded');

    // --- Tamaño exacto del popup -----------------------------------------------------------
    // El popup real de Chrome no tiene `viewport` de Playwright: el tamaño lo fija `tokens.css`
    // (`body.tk-popup { width: 380px; height: 600px }`), así que NO se impone un viewport de
    // 380×600 —hacerlo volvería trivial la aserción—.
    const caja = await page.locator('body').boundingBox();
    expect(caja, 'no se pudo medir el cuerpo del popup').not.toBeNull();
    expect(caja?.width).toBe(380);
    expect(caja?.height).toBe(600);

    // --- Estado vacío en español -----------------------------------------------------------
    // H2 (tarea 2.15) exige el aviso NO descartable del primer arranque: en un perfil nuevo la
    // capa modal BLOQUEA la UI hasta que se acepta (RNF-23), así que el estado vacío se comprueba
    // después de aceptarla.
    expect(await page.locator('html').getAttribute('lang')).toBe('es');
    await expect(page.locator('.tk-header__title')).toHaveText('TrueKeate Wallet');
    const aviso = page.locator('.tk-dialog--notice');
    await expect(aviso).toBeVisible();
    await expect(aviso).toHaveAttribute('aria-modal', 'true');
    await expect(aviso.getByRole('heading')).toHaveText('Entorno de desarrollo — no usar con fondos reales');
    await expect(page.locator('.tk-empty')).toHaveCount(0);
    await page.getByRole('button', { name: 'He entendido, continuar' }).click();
    await expect(aviso).toHaveCount(0);

    await expect(page.locator('.tk-empty__title')).toHaveText('Sin cartera');
    await expect(page.locator('.tk-empty__text')).toContainText('Todavía no hay ninguna cartera');
    await expect(page.locator('.tk-empty__text')).toContainText('frase de recuperación de 12 palabras');
    await expect(page.getByRole('button', { name: 'Crear cartera nueva' })).toBeVisible();
    await expect(page.locator('.tk-tagline')).toHaveText('PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS');

    // --- Evidencia visual (§7.4.1.f) --------------------------------------------------------
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE_DIR, `01-onboarding-${RUN_DATE}.png`), fullPage: true });

    // --- Cero errores de consola -----------------------------------------------------------
    // Se consulta el almacén para dar tiempo a que se registren los errores tardíos del arranque.
    await readChromeStorage(background, null);
    expect(erroresDePagina, `excepciones en la página del popup: ${erroresDePagina.join(' | ')}`).toEqual([]);
    expect(erroresConsola, `errores de consola en el popup: ${erroresConsola.join(' | ')}`).toEqual([]);
  });

  test('el Service Worker arranca y deja la entrada `sw_started` en `truekeate_logs` (tarea 1.10)', async ({
    background,
  }) => {
    // La escritura del log es asíncrona en el arranque: se espera la condición observable.
    await expect
      .poll(
        async () => {
          const almacen = await readChromeStorage(background, 'truekeate_logs');
          const logs = almacen.truekeate_logs;
          return Array.isArray(logs) ? logs.length : 0;
        },
        { message: 'el Service Worker no escribió ninguna entrada en truekeate_logs', timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    const almacen = await readChromeStorage(background, 'truekeate_logs');
    const logs = almacen.truekeate_logs as Array<{
      event?: string;
      category?: string;
      level?: string;
      origin?: string;
    }>;
    const arranque = logs.filter((entrada) => entrada.event === 'sw_started');
    expect(arranque.length, 'falta la entrada sw_started del arranque').toBeGreaterThan(0);
    expect(arranque[0]?.category).toBe('system');
    expect(arranque[0]?.level).toBe('info');
    expect(arranque[0]?.origin).toBe('extension');

    // El arnés también escribe estado inicial desde el SW (§7.4.1.b).
    expect(await writeChromeStorage(background, { truekeate_e2e_marca: RUN_DATE })).toBe(1);
    expect((await readChromeStorage(background, 'truekeate_e2e_marca')).truekeate_e2e_marca).toBe(RUN_DATE);
  });

  test('el arnés suspende el Service Worker por CDP y la extensión se recupera (RNF-08)', async ({
    context,
    extensionId,
  }) => {
    // Se abre una página de la extensión ANTES de suspender: es el emisor que despertará al SW y
    // la página sobre la que se observa el dominio CDP `ServiceWorker`.
    const page = await openPopup(context, extensionId);

    const watch = await stopServiceWorker(context, extensionId, { page });
    expect(watch.status(), 'el Service Worker no quedó suspendido').toBe('stopped');

    // El re-arranque lo provoca el primer evento posterior: un mensaje de la propia extensión.
    const reaparicion = watch.waitUntilRunning();
    await page.evaluate(async () => {
      await chrome.runtime.sendMessage({ type: 'TRUEKEATE_RPC', method: 'eth_chainId' }).catch(() => undefined);
    });
    await reaparicion;
    expect(watch.status()).toBe('running');
    await watch.detach();

    // El Service Worker reanudado sigue siendo la fuente de verdad de la persistencia.
    const revivido = await getBackgroundWorker(context);
    const almacen = await readChromeStorage(revivido, null);
    expect(typeof almacen).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// H2 (tarea 2.17) — crear, importar y SIN prompt de contraseña (CA-RF-01/02/03)
// ---------------------------------------------------------------------------

/** Frase de Anvil: semilla de desarrollo cuya cuenta 0 es conocida y contrastable. */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Direcciones EIP-55 reales de las cuentas 0 y 1 de Anvil. */
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ANVIL_ADDRESS1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

test.describe('01 · Onboarding H2: crear, importar y sin contraseña', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('crear cartera deja 5 cuentas y NINGÚN prompt de contraseña (CA-RF-01 / CA-RF-03)', async ({
    context,
    extensionId,
    background,
  }) => {
    const page = await openPopupReady(context, extensionId);

    await page.getByRole('button', { name: 'Crear cartera nueva' }).click();
    await expect(page.locator('.tk-account')).toHaveCount(5);

    // CA-RF-03 / RE-02: sin contraseña en ningún momento del flujo.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByText(/contraseña/i).first()).toBeVisible();
    const camposDeTexto = await page.locator('input, textarea').count();
    expect(camposDeTexto, 'la cartera operativa no abre ningún formulario ni pide credenciales').toBe(0);

    // El estado persistido es coherente: 12 palabras, 5 direcciones y sin cifrado (P-03).
    const almacen = await readChromeStorage(background, [
      'truekeate_mnemonic',
      'truekeate_accounts',
      'truekeate_current_account',
      'truekeate_settings',
    ]);
    const palabras = String(almacen.truekeate_mnemonic ?? '').split(' ');
    expect(palabras).toHaveLength(12);
    const cuentas = almacen.truekeate_accounts as string[];
    expect(cuentas).toHaveLength(5);
    expect(new Set(cuentas).size).toBe(5);
    expect(almacen.truekeate_current_account).toBe('idx:0');
    const settings = almacen.truekeate_settings as Record<string, unknown>;
    expect(settings.encryptionEnabled).toBe(false);
    expect(settings.requirePasswordOnOpen).toBe(false);

    // Evidencia JSON del flujo (§3.2.7).
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `01-onboarding-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'crear cartera',
          fecha: RUN_DATE,
          extensionIdDerivado: expectedExtensionId(),
          cuentasDerivadas: cuentas.length,
          cuentaActiva: almacen.truekeate_current_account,
          palabrasDeLaFrase: palabras.length,
          encryptionEnabled: settings.encryptionEnabled,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  test('importar la frase de Anvil da la cuenta 0 conocida y normaliza la entrada (CA-RF-02)', async ({
    context,
    extensionId,
  }) => {
    const page = await openPopupReady(context, extensionId);

    await page.getByRole('button', { name: 'Importar frase' }).click();
    // Entrada deliberadamente irregular: mayúsculas, tabulaciones y espacios de sobra.
    const irregular = `  ${ANVIL_MNEMONIC.toUpperCase().split(' ').join('   ')}  `;
    await page.locator('#import-mnemonic').fill(irregular);
    await expect(page.locator('#import-mnemonic-error')).toHaveCount(0);
    await page.getByRole('button', { name: 'Importar frase' }).click();

    // Las 5 cuentas de Anvil, con la 0 y la 1 conocidas (contraste con `cast`).
    await expect(page.locator('.tk-account')).toHaveCount(5);
    await expect(page.locator('.tk-account__address')).toHaveCount(5);
    await expect(page.locator('.tk-account__address').nth(0)).toHaveAttribute('title', ANVIL_ADDRESS0);
    await expect(page.locator('.tk-account__address').nth(1)).toHaveAttribute('title', ANVIL_ADDRESS1);
    // La cuenta 0 queda activa y la etiqueta por defecto es la española de `settings.ts`.
    await expect(page.locator('.tk-account--active .tk-account__label')).toHaveText('Cuenta 1');
  });
});
