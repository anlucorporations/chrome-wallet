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

import { mkdirSync } from 'node:fs';
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
    expect(await page.locator('html').getAttribute('lang')).toBe('es');
    await expect(page.locator('.tk-header__title')).toHaveText('TrueKeate Wallet');
    await expect(page.locator('.tk-empty__title')).toHaveText('TrueKeate Wallet');
    await expect(page.locator('.tk-empty__text')).toContainText('Todavía no hay ninguna cartera');
    await expect(page.locator('.tk-empty__text')).toContainText('frase de recuperación de 12 palabras');
    await expect(page.getByRole('button', { name: 'Crear cartera' })).toBeVisible();
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
