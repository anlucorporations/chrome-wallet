/**
 * `e2e/fixtures/extension.ts` — Arnés E2E de Playwright (tarea 1.16, `documento_tecnico.md` §7.4.1).
 *
 * Qué fija este fichero (§7.4.1.a–d):
 *   a) `chromium.launchPersistentContext` con ruta ABSOLUTA a `dist/` —el Service Worker y
 *      `chrome.storage.local` solo existen en un contexto persistente—.
 *   b) Perfil NUEVO por prueba con `mkdtemp`: queda prohibido reutilizar perfiles.
 *   c) Descubrimiento del ID desde `context.serviceWorkers()`: el ID NUNCA se escribe a mano.
 *   d) `stopServiceWorker` por CDP (el Service Worker no se puede suspender esperando).
 *
 * DESVIACIÓN DOCUMENTADA respecto al bloque literal de §7.4.1.a: el documento usa
 * `path.resolve(__dirname, ...)`, que NO existe en un paquete `"type": "module"`. Aquí la raíz
 * se calcula con `import.meta.url` + `fileURLToPath`, que es el equivalente ESM correcto.
 *
 * DESVIACIÓN DOCUMENTADA respecto a §7.4.1.c: el mecanismo y el oráculo literales del documento
 * no funcionan en Playwright 1.63 / Chrome 153 (ver `watchServiceWorker`, donde se detalla la
 * evidencia). El arnés usa el dominio CDP `ServiceWorker` sobre una página de la extensión y
 * expone el ciclo de vida con `ServiceWorkerWatch` (`stop()` / `waitUntilRunning()`), siempre con
 * condiciones observables y sin esperas fijas.
 *
 * Variables de entorno: `E2E_HEADLESS=false` abre el navegador; `TK_DIST_DIR` sustituye `dist/`
 * (útil para depurar el propio arnés); `TK_DAPP_URL` cambia la URL de la dApp de pruebas.
 */

import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Rutas y constantes del entorno de pruebas
// ---------------------------------------------------------------------------

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio (…/chrome-wallet). */
export const REPO_ROOT = resolve(AQUI, '..', '..');

/** Ruta ABSOLUTA del artefacto que carga Chrome (§7.4.1.a). */
export const DIST_DIR = process.env.TK_DIST_DIR ?? resolve(REPO_ROOT, 'dist');

/** Carpeta de evidencia del hito en curso (§7.4.1.f). */
export const EVIDENCE_PHASE = process.env.TK_EVIDENCE_PHASE ?? 'H1';
export const EVIDENCE_DIR = resolve(REPO_ROOT, 'RepoTecnico', 'evidencia', EVIDENCE_PHASE);

/** Fecha `YYYY-MM-DD` de la ejecución, para el nombre de los artefactos de evidencia. */
export const RUN_DATE = new Date().toISOString().slice(0, 10);

/** dApp de pruebas autohospedada (`vite.config.ts`, puerto 5174 con `strictPort`). */
export const DAPP_URL = process.env.TK_DAPP_URL ?? 'http://localhost:5174/test.html';

/** `E2E_HEADLESS=false` abre el navegador visible; cualquier otro valor es headless. */
const HEADLESS = process.env.E2E_HEADLESS !== 'false';

/**
 * Argumentos de Chrome que cargan la extensión desde `dist/` (nunca desde el perfil).
 *
 * `--enable-clipboard-read-write` habilita la lectura del portapapeles sin diálogo: las pruebas
 * de higiene del revelado (`CA-RF-50`) necesitan LEER lo que el popup copió para comprobar que
 * al ocultarse queda vacío. `context.grantPermissions` NO sirve aquí: Chrome rechaza conceder
 * permisos a orígenes opacos como `chrome-extension://`.
 */
const ARGUMENTOS_EXTENSION = [
  `--disable-extensions-except=${DIST_DIR}`,
  `--load-extension=${DIST_DIR}`,
  '--no-sandbox',
  '--enable-clipboard-read-write',
  '--enable-features=ClipboardReadWrite',
];

// ---------------------------------------------------------------------------
// Fixtures publicados
// ---------------------------------------------------------------------------

/** Fixtures que exponen a las pruebas el contexto persistente y la identidad descubierta. */
export interface ExtensionFixtures {
  /** Contexto persistente con la extensión cargada desde `dist/`. */
  context: BrowserContext;
  /** ID de la extensión DESCUBIERTO del Service Worker (jamás escrito a mano). */
  extensionId: string;
  /** Service Worker de la extensión (`background.js`). */
  background: Worker;
}

/** ¿Existe el artefacto que Playwright debe cargar? */
export const distDisponible = (): boolean => existsSync(join(DIST_DIR, 'manifest.json'));

/** Comprueba que `dist/` tiene la extensión y falla con un mensaje accionable si no. */
export const requireDist = (): void => {
  expect(
    distDisponible(),
    `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`,
  ).toBe(true);
};

/**
 * Deriva el ID estable de la extensión desde la `key` del manifest generado (D-N / ADT-19).
 * No es un ID escrito a mano: se calcula con el mismo algoritmo que Chrome.
 */
export const expectedExtensionId = (): string => {
  const manifestPath = join(DIST_DIR, 'manifest.json');
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const key = (parsed as { key?: unknown }).key;
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(`[e2e] ${manifestPath} no declara la \`key\` y el ID de la extensión no es estable`);
  }
  const hash = createHash('sha256').update(Buffer.from(key, 'base64')).digest();
  let id = '';
  for (let i = 0; i < 16; i += 1) {
    const byte = hash[i] ?? 0;
    id += String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
};

// ---------------------------------------------------------------------------
// Helpers del arnés
// ---------------------------------------------------------------------------

/** Igual que `expect`, reexportado para que las pruebas importen un único módulo. */
export { expect };

/**
 * Descubre el ID de la extensión a partir del Service Worker del contexto.
 * Espera al evento `serviceworker` si el SW aún no está arrancado (condición observable).
 */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  const worker = await getBackgroundWorker(context);
  const host = new URL(worker.url()).host;
  if (host.length === 0) {
    throw new Error(`[e2e] no se pudo derivar el ID del Service Worker ${worker.url()}`);
  }
  return host;
}

/** Service Worker de la extensión cargada, esperándolo si hace falta. */
export async function getBackgroundWorker(context: BrowserContext): Promise<Worker> {
  const existente = context.serviceWorkers()[0];
  if (existente !== undefined) return existente;
  return context.waitForEvent('serviceworker', { timeout: 15_000 });
}

/** URL interna de una página del paquete (`index.html`, `connect.html`, …). */
export const extensionUrl = (extensionId: string, ruta: string): string =>
  `chrome-extension://${extensionId}/${ruta.replace(/^\/+/, '')}`;

/**
 * Abre el popup de la extensión (380×600 según `tokens.css`) en una pestaña del contexto
 * persistente y espera a que el documento esté listo.
 */
export async function openPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(extensionUrl(extensionId, 'index.html'));
  await page.waitForLoadState('domcontentloaded');
  return page;
}

/**
 * Abre cualquier página interna del paquete (connect/notification/popup).
 * Útil para el resto de hitos; no se usa todavía en H1.
 */
export async function openExtensionPage(
  context: BrowserContext,
  extensionId: string,
  ruta: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(extensionUrl(extensionId, ruta));
  await page.waitForLoadState('domcontentloaded');
  return page;
}

/**
 * Abre la dApp de pruebas servida en `http://localhost:5174/test.html`.
 * Requiere `npm run dev` en marcha: `playwright.config.ts` no declara `webServer` (§7.4).
 */
export async function openDapp(page: Page, url: string = DAPP_URL): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
}

/** Versión del Service Worker tal y como la reporta el dominio CDP `ServiceWorker`. */
interface WorkerVersionCdp {
  versionId: string;
  scriptURL: string;
  runningStatus: string;
}

/**
 * Observador del ciclo de vida del Service Worker con oráculos OBSERVABLES (sin esperas fijas).
 * Se obtiene con {@link watchServiceWorker} y se cierra con `detach()`.
 */
export interface ServiceWorkerWatch {
  /** Estado observado del SW: `running`, `stopped`, `starting`, `stopping` o `undefined`. */
  status(): string | undefined;
  /** Suspende el SW y espera a observar `stopped`. */
  stop(): Promise<void>;
  /** Espera a observar `running` (tras provocar el evento que lo despierta). */
  waitUntilRunning(timeoutMs?: number): Promise<void>;
  /** Libera la sesión CDP. */
  detach(): Promise<void>;
}

/**
 * Abre (o reutiliza) una página de la extensión y observa el ciclo de vida de su Service Worker.
 *
 * DESVIACIÓN DOCUMENTADA respecto a §7.4.1.c, verificada empíricamente en este repositorio con
 * Chrome 153 / Playwright 1.63 (`RepoTecnico/evidencia/H1/diagnostico-servicio-worker-<fecha>.log`):
 *   - `context.newCDPSession(sw)` con el Service Worker NO es válido: la API solo acepta
 *     `Page | Frame` (`playwright-core/types/types.d.ts:10325`), así que el fragmento ni compila.
 *   - `self.registration.unregister()` sobre el SW de una extensión falla con
 *     `AbortError: Failed to unregister a ServiceWorkerRegistration: Worker disallowed`.
 *   - `context.waitForEvent('serviceworker')` NO se emite al re-arrancar el SW: Chrome reutiliza
 *     el mismo target y Playwright conserva el mismo objeto `Worker`, de modo que ese oráculo
 *     agota el tiempo de espera (se observó un `TimeoutError` de 8 s con el SW ya en `running`).
 *
 * Mecanismo equivalente y observable que sí funciona: el dominio `ServiceWorker` sobre la sesión
 * CDP de una página de la MISMA extensión (`ServiceWorker.enable` + `ServiceWorker.stopWorker`),
 * con el estado `runningStatus` como oráculo (`stopped` / `running`).
 */
export async function watchServiceWorker(
  context: BrowserContext,
  extensionId: string,
  page?: Page,
): Promise<ServiceWorkerWatch> {
  const pagina = page ?? (await openPopup(context, extensionId));
  const cdp = await context.newCDPSession(pagina);
  const scriptURL = extensionUrl(extensionId, 'background.js');

  // `versionId → última versión conocida`: cada evento actualiza el mapa, de modo que las
  // comprobaciones ven el estado NUEVO y nunca el primero observado.
  const versiones = new Map<string, WorkerVersionCdp>();
  cdp.on('ServiceWorker.workerVersionUpdated', (evento) => {
    for (const version of evento.versions) versiones.set(version.versionId, version);
  });
  await cdp.send('ServiceWorker.enable');
  const actual = (): WorkerVersionCdp | undefined =>
    [...versiones.values()].find((version) => version.scriptURL === scriptURL);
  await expect
    .poll(() => actual()?.versionId, {
      message: `el Service Worker ${scriptURL} no aparece en el dominio CDP ServiceWorker`,
      timeout: 15_000,
    })
    .toBeTruthy();

  return {
    status: () => actual()?.runningStatus,
    async stop() {
      /**
       * Suspensión por CDP: UNA petición `ServiceWorker.stopWorker` y espera acotada a observarla.
       *
       * MEDICIÓN de H5 (dos efectos opuestos, y por eso NO se reintenta en bucle):
       *   · reintentar `stopWorker` cada 250 ms ROMPE el E2E `29-sw-suspendido`: cuando la alarma
       *     despierta al SW —que es justo lo que esa prueba mide—, el reintento lo mata a mitad de la
       *     reconciliación y la reconstrucción se alarga a ~1,3-1,9 s (RNF-08 exige < 1 s);
       *   · con una sola petición la suspensión se aplica de inmediato salvo que el SW esté siendo
       *     despertado de forma continua: el *polling* de saldos del popup (pestaña «Cuentas», cada
       *     5 s) mantiene el worker en `running` y Chrome no lo suspende. Eso dejaba en rojo, de forma
       *     intermitente en la suite completa, el E2E `09-conectar` (que abre el popup justo antes de
       *     suspender). La solución es del lado de la prueba que suspende: dejar de alimentar ese
       *     *polling* antes de pedir la suspensión (ver `09-conectar.spec.ts`).
       */
      const version = actual();
      if (version === undefined) throw new Error(`[e2e] no se localizó la versión del SW ${scriptURL}`);
      if (version.runningStatus === 'stopped') return;
      try {
        await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId });
      } catch (error) {
        console.warn('[e2e] ServiceWorker.stopWorker no disponible; se usa stopAllWorkers:', error);
        await cdp.send('ServiceWorker.stopAllWorkers');
      }
      await expect
        .poll(() => actual()?.runningStatus, {
          message: 'el Service Worker no llegó a suspenderse',
          timeout: 20_000,
        })
        .toBe('stopped');
    },
    async waitUntilRunning(timeoutMs = 15_000) {
      await expect
        .poll(() => actual()?.runningStatus, {
          message: 'el Service Worker no volvió a arrancar',
          timeout: timeoutMs,
        })
        .toBe('running');
    },
    async detach() {
      await cdp.detach().catch(() => undefined);
    },
  };
}

/**
 * Suspende el Service Worker de la extensión por CDP (RNF-08) y devuelve el observador para
 * poder comprobar el re-arranque (`await watch.waitUntilRunning()`).
 *
 * No usa ninguna espera fija: la suspensión se confirma con `runningStatus === 'stopped'`.
 */
export async function stopServiceWorker(
  context: BrowserContext,
  extensionId: string,
  options: { page?: Page } = {},
): Promise<ServiceWorkerWatch> {
  const watch = await watchServiceWorker(context, extensionId, options.page);
  await watch.stop();
  return watch;
}

/**
 * Pérdida de foco REAL de `page`, con la pestaña ajena que la provoca y la forma de recuperar el
 * foco. La devuelve {@link loseFocusToOtherPage}.
 */
export interface FocusLossHandle {
  /** Pestaña ajena que pasó a primer plano; hay que cerrarla al terminar la prueba. */
  other: Page;
  /**
   * Devuelve el foco a `page` y restaura la emulación de Playwright. Es obligatorio ANTES de
   * leer el portapapeles: Chrome solo permite `navigator.clipboard.readText()` con el documento
   * enfocado. Recuperar el foco **no** vuelve a mostrar el valor (§3.8 regla 3).
   */
  restore(): Promise<void>;
}

/**
 * Provoca una pérdida de foco REAL de `page`: es el disparador `window.blur` de la regla 3 de
 * §3.8, que oculta el valor revelado.
 *
 * DESVIACIÓN DOCUMENTADA respecto a «una segunda pestaña pasa a primer plano». Medido en este
 * repositorio con Chrome/Chromium 153 headless: Playwright mantiene activada la **emulación de
 * foco**, de modo que TODAS las pestañas se reportan con `document.hasFocus() === true` y
 * `visibilityState === 'visible'`; `bringToFront()` sobre otra pestaña no produce ningún
 * `blur`, ningún `focus` y ningún `visibilitychange` observable (sonda
 * `test-results/_probe-visibility.mjs`, 0 eventos). Con la emulación desactivada por CDP
 * (`Emulation.setFocusEmulationEnabled`) el renderer pierde el foco de verdad: `hasFocus` pasa a
 * `false` y `window` recibe `blur`. Se usa el disparador REAL del navegador, no un
 * `dispatchEvent` sintético desde la prueba.
 */
export async function loseFocusToOtherPage(
  context: BrowserContext,
  page: Page,
  url: string,
): Promise<FocusLossHandle> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  const other = await context.newPage();
  await other.goto(url);
  await other.bringToFront();
  return {
    other,
    async restore() {
      await page.bringToFront();
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => undefined);
      await cdp.detach().catch(() => undefined);
    },
  };
}

/**
 * Abre el popup y acepta el aviso NO descartable de entorno de desarrollo (RNF-23) si aparece.
 * Devuelve la página ya lista para operar: es el paso previo de todas las pruebas de H2.
 */
export async function openPopupReady(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await openPopup(context, extensionId);
  const dialogo = page.locator('.tk-dialog--notice');
  const boton = page.getByRole('button', { name: 'He entendido, continuar' });
  // Condición observable: el aviso está presente y bloquea la UI, o ya se aceptó antes.
  await Promise.race([
    boton.waitFor({ state: 'visible', timeout: 15_000 }),
    page.locator('.tk-header').waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  if (await dialogo.isVisible()) {
    await boton.click();
    await expect(dialogo).toHaveCount(0);
  }
  return page;
}

/**
 * Lee la matriz del QR de recepción tal y como la pinta el popup (rejilla de módulos con
 * `tk-qr__module--dark`). Devuelve `null` si la figura no está presente.
 *
 * Es la fuente de verdad para contrastar «dirección mostrada = QR» sin depender del portapapeles.
 */
export async function readQrModules(page: Page): Promise<boolean[][] | null> {
  return page.evaluate(() => {
    const grid = document.querySelector('.tk-qr__grid');
    if (grid === null) return null;
    const modulos = [...grid.children];
    const lado = Math.round(Math.sqrt(modulos.length));
    if (lado * lado !== modulos.length) return null;
    const matriz: boolean[][] = [];
    for (let fila = 0; fila < lado; fila += 1) {
      const filaModulos: boolean[] = [];
      for (let columna = 0; columna < lado; columna += 1) {
        const modulo = modulos[fila * lado + columna];
        filaModulos.push(modulo?.classList.contains('tk-qr__module--dark') === true);
      }
      matriz.push(filaModulos);
    }
    return matriz;
  });
}

/**
 * Lee claves de `chrome.storage.local` DESDE el Service Worker (fuente de verdad de la
 * persistencia, §7.4.1.b). Sin `keys` devuelve todo el almacén.
 */
export async function readChromeStorage(
  worker: Worker,
  keys: string | string[] | null = null,
): Promise<Record<string, unknown>> {
  const claves = keys ?? null;
  return worker.evaluate(async (solicitadas) => {
    const area = chrome.storage.local;
    const resultado = await area.get(solicitadas as string | string[] | null);
    return resultado as Record<string, unknown>;
  }, claves);
}

/**
 * Escribe el estado inicial de una prueba en `chrome.storage.local` desde el Service Worker
 * (§7.4.1.b). Devuelve el número de claves escritas.
 */
export async function writeChromeStorage(worker: Worker, items: Record<string, unknown>): Promise<number> {
  return worker.evaluate(async (entradas) => {
    await chrome.storage.local.set(entradas as Record<string, unknown>);
    return Object.keys(entradas).length;
  }, items);
}

// ---------------------------------------------------------------------------
// Fixture de Playwright Test
// ---------------------------------------------------------------------------

export const test = base.extend<ExtensionFixtures>({
  // Perfil NUEVO por prueba: aislamiento total de `chrome.storage.local`, sesiones y cola.
  // NUNCA se reutiliza un perfil «para ir más rápido» (§7.4.1.b).
  // El patrón vacío es obligatorio: Playwright exige la desestructuración del primer argumento
  // (`fixtureParameterNames`, playwright/lib/common/index.js) aunque no haya dependencias.
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const profileDir = mkdtempSync(join(tmpdir(), 'tk-e2e-'));
    const context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chromium',
      headless: HEADLESS,
      args: ARGUMENTOS_EXTENSION,
      acceptDownloads: false,
    });
    try {
      await use(context);
    } finally {
      await context.close();
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  },

  // Descubrimiento del ID: del Service Worker, jamás escrito a mano.
  extensionId: async ({ context }, use) => {
    const id = await getExtensionId(context);
    await use(id);
  },

  background: async ({ context }, use) => {
    await use(await getBackgroundWorker(context));
  },
});

// ---------------------------------------------------------------------------
// H3 · Ayudas del hito (tareas 3.16 y 3.15): dApp, eventos, polling y Anvil
// ---------------------------------------------------------------------------

/** Endpoint JSON-RPC de Anvil (`entornos_globales.md` §3). */
export const ANVIL_RPC_URL = 'http://127.0.0.1:8545';

/** `chainId` de Anvil en hexadecimal. */
export const ANVIL_CHAIN_ID_HEX = '0x7a69';

/** Origen de la dApp de pruebas: es la clave canónica de la sesión (§2.7). */
export const DAPP_ORIGIN = 'http://localhost:5174';

/** Evento del provider capturado en la página de la dApp. */
export interface EventoDeLaDapp {
  eventName: string;
  data: unknown;
}

/** Claves que la extensión escribe durante una prueba (se excluyen de las comparaciones). */
export const CLAVES_VOLATILES = ['truekeate_logs', 'truekeate_schema_version'] as const;

/** Registra escuchas del provider en la dApp para CAPTURAR los eventos EIP-1193 que recibe. */
export async function registrarEventosDeLaDapp(page: Page): Promise<number> {
  return page.evaluate(() => {
    const global = window as unknown as {
      __tkEventos?: EventoDeLaDapp[];
      truekeate?: { on(nombre: string, cb: (dato: unknown) => void): unknown };
    };
    global.__tkEventos = [];
    const provider = global.truekeate;
    if (provider === undefined || typeof provider.on !== 'function') {
      return 0;
    }
    const nombres = ['accountsChanged', 'chainChanged', 'connect', 'disconnect', 'message'];
    for (const nombre of nombres) {
      provider.on(nombre, (dato) => {
        global.__tkEventos?.push({ eventName: nombre, data: dato });
      });
    }
    return nombres.length;
  });
}

/** Eventos capturados por {@link registrarEventosDeLaDapp}, en orden de llegada. */
export async function leerEventosDeLaDapp(page: Page): Promise<EventoDeLaDapp[]> {
  return page.evaluate(() => {
    const global = window as unknown as { __tkEventos?: EventoDeLaDapp[] };
    return global.__tkEventos ?? [];
  });
}

/** Texto del historial de `test.html` (`#registro`), que anota cada flujo. */
export async function leerRegistroDeLaDapp(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById('registro')?.textContent ?? '');
}

/** Contadores OBSERVABLES del polling de saldos publicados por el popup (M47 / CA-RF-27). */
export interface ContadoresDePolling {
  /** `data-polling-requests`: `eth_getBalance` emitidos. `null` si la vista está cerrada. */
  requests: number | null;
  /** `data-polling-cycles`: ciclos completados. `null` si la vista está cerrada. */
  cycles: number | null;
}

/** Lee los contadores del polling de la vista de Cuentas del popup. */
export async function leerContadoresDePolling(page: Page): Promise<ContadoresDePolling> {
  return page.evaluate(() => {
    const panel = document.getElementById('panel-accounts');
    const numero = (nombre: string): number | null => {
      const valor = panel?.getAttribute(nombre) ?? null;
      return valor === null ? null : Number(valor);
    };
    return { requests: numero('data-polling-requests'), cycles: numero('data-polling-cycles') };
  });
}

// --- Control del proceso Anvil (solo para `27-rpc-caido.spec.ts`) ------------------------------

/** PIDs de los procesos `anvil.exe` en ejecución. */
export function anvilPids(): number[] {
  const listado = spawnSync('tasklist', ['/FI', 'IMAGENAME eq anvil.exe', '/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
  });
  const pids: number[] = [];
  for (const linea of (listado.stdout ?? '').split(/\r?\n/)) {
    const celdas = linea.split('","').map((celda) => celda.replace(/"/g, '').trim());
    const pid = Number.parseInt(celdas[1] ?? '', 10);
    if (Number.isFinite(pid) && pid > 0) pids.push(pid);
  }
  return pids;
}

/**
 * Detiene Anvil (solo para la prueba de RPC caído) y devuelve los PIDs que había.
 * Se mata POR PID: nunca se tocan procesos ajenos al puerto del proyecto.
 */
export function detenerAnvil(): number[] {
  const pids = anvilPids();
  for (const pid of pids) {
    spawnSync('taskkill', ['/PID', String(pid), '/F'], { encoding: 'utf8' });
  }
  return pids;
}

/** Ruta absoluta del binario de Anvil (por `PATH`), o `anvil.exe` si `where` no lo encuentra. */
export function anvilBinario(): string {
  const encontrado = spawnSync('where', ['anvil'], { encoding: 'utf8' });
  const primera = (encontrado.stdout ?? '')
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)[0];
  return primera ?? 'anvil.exe';
}

/**
 * Arranca Anvil desacoplado del proceso de pruebas, con los MISMOS argumentos del proyecto.
 *
 * MEDICIÓN DE H4 (defecto del arnés detectado y corregido aquí): el comando documentado con
 * `--http.corsdomain "*"` **no existe** en el Anvil instalado (`anvil 1.7.2-dev`): el proceso muere
 * con `error: unexpected argument '--http.corsdomain' found` y la restauración de
 * `27-rpc-caido.spec.ts` falla, dejando el nodo caído para el resto de la suite. La bandera
 * equivalente en esta versión es **`--allow-origin`** (verificado: `anvil … --allow-origin '*'`
 * responde). `--silent` sí funciona lanzado con `spawn` + `stdio: 'ignore'`, que es lo que usa este
 * arnés (los 37 E2E de H3 están verdes con él).
 */
export function arrancarAnvil(): void {
  const hijo = spawn(
    anvilBinario(),
    ['--host', '127.0.0.1', '--port', '8545', '--chain-id', '31337', '--silent', '--allow-origin', '*'],
    { detached: true, stdio: 'ignore' },
  );
  hijo.unref();
}

/** Consulta JSON-RPC DIRECTA al nodo: contraste externo de lo que responde el provider. */
export async function consultarAlNodo(
  method: string,
  params: readonly unknown[] = [],
): Promise<unknown> {
  const respuesta = await fetch(ANVIL_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [...params] }),
    signal: AbortSignal.timeout(5_000),
  });
  const cuerpo = (await respuesta.json()) as { result?: unknown };
  return cuerpo.result;
}

/** ¿Responde Anvil con `chainId 0x7a69`? Condición observable, sin esperas fijas. */
export async function anvilResponde(): Promise<boolean> {
  try {
    const respuesta = await fetch(ANVIL_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(2_000),
    });
    const cuerpo = (await respuesta.json()) as { result?: unknown };
    return cuerpo.result === ANVIL_CHAIN_ID_HEX;
  } catch {
    return false;
  }
}

/** Espera a que Anvil vuelva a responder (o devuelve `false` al agotar el plazo). */
export async function esperarAnvil(timeoutMs = 20_000): Promise<boolean> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await anvilResponde()) return true;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  return false;
}

// --- Flujo de conexión de la dApp (`eth_requestAccounts` + `connect.html`) -----------------------

/** Opciones del flujo de conexión. */
export interface OpcionesDeConexion {
  /** Índice (0-based) de la cuenta que se elige en `connect.html`. */
  indice?: number;
  /** `true` para rechazar la conexión en la ventana (`4001`). */
  rechazar?: boolean;
}

/** Desenlace del flujo de conexión tal y como lo pinta `test.html`. */
export interface DesenlaceDeConexion {
  /** Ventana `connect.html` que abrió el Service Worker. */
  ventana: Page;
  /** Texto del resultado del flujo en la dApp. */
  resultado: string;
  /** `true` si el flujo terminó en éxito (`resultado--ok`). */
  ok: boolean;
}

/**
 * Ejecuta `accion` registrando ANTES la espera de la ventana ÚNICA de decisión (`notification.html`)
 * y devuelve la ventana junto al resultado de la acción.
 *
 * Es imprescindible en H5 por dos motivos medidos:
 *   1. el plazo inyectado por el arnés es `VITE_SIGN_TIMEOUT_MS=3000`, así que una ventana que se
 *      abre y se cierra dentro de ese margen puede perderse si la espera se registra DESPUÉS del clic
 *      (el evento `page` es efímero);
 *   2. la ventana es ÚNICA (P-21) y el Service Worker puede **REUTILIZAR** la que ya está abierta
 *      para la siguiente solicitud (`showOldestPending`), en cuyo caso **no** se emite ningún
 *      `page` nuevo: se admite tanto la ventana recién creada como la que ya estaba abierta.
 */
export async function conVentanaDeDecision<T>(
  context: BrowserContext,
  accion: () => Promise<T>,
): Promise<{ ventana: Page; resultado: T }> {
  const esperaNueva = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null);
  const resultado = await accion();

  const reutilizada = ventanasDeDecision(context)[0];
  if (reutilizada !== undefined) {
    await reutilizada.waitForLoadState('domcontentloaded');
    return { ventana: reutilizada, resultado };
  }
  const ventana = await esperaNueva;
  if (ventana === null) {
    throw new Error('[e2e] no apareció la ventana única de decisión (notification.html)');
  }
  await ventana.waitForLoadState('domcontentloaded');
  return { ventana, resultado };
}

/**
 * Pulsa el botón de un flujo de `test.html` que abre la ventana ÚNICA y devuelve esa ventana.
 *
 * Separar «pulsar» de «resolver» permite medir el resultado en pantalla del flujo ANTES de decidir
 * en la ventana (tarea 5.11: resultado en < 5000 ms).
 */
export async function pulsarFlujoConVentana(
  context: BrowserContext,
  dapp: Page,
  idBoton: string,
): Promise<Page> {
  const { ventana } = await conVentanaDeDecision(context, () => dapp.click(`#${idBoton}`));
  return ventana;
}

/**
 * Resuelve la ventana de conexión (`connect.html`) YA abierta: elige la cuenta (o rechaza) y
 * devuelve lo que la dApp recibió. No usa esperas fijas: todo son condiciones observables.
 */
export async function resolverConexionEnVentana(
  ventana: Page,
  dapp: Page,
  opciones: OpcionesDeConexion = {},
): Promise<DesenlaceDeConexion> {
  const filas = ventana.locator('.tk-connect-row');
  await expect(filas.first()).toBeVisible({ timeout: 15_000 });
  if (opciones.indice !== undefined) {
    await filas.nth(opciones.indice).locator('input[type="radio"]').check();
    await expect(filas.nth(opciones.indice)).toHaveClass(/tk-connect-row--selected/);
  }
  await ventana
    .getByRole('button', { name: opciones.rechazar === true ? 'Rechazar' : 'Conectar' })
    .click();

  const fila = dapp.locator('#resultado-conectar');
  await expect(fila).toHaveClass(/resultado--(ok|error)/, { timeout: 20_000 });
  const clase = (await fila.getAttribute('class')) ?? '';
  return {
    ventana,
    resultado: (await fila.locator('.resultado__cuerpo').textContent()) ?? '',
    ok: clase.includes('resultado--ok'),
  };
}

/**
 * Ejecuta el flujo completo de conexión: pulsa «Conectar» en `test.html`, espera la ventana
 * `connect.html` que abre el Service Worker, elige la cuenta (o rechaza) y devuelve lo que la
 * dApp recibió.
 */
export async function conectarDapp(
  context: BrowserContext,
  dapp: Page,
  opciones: OpcionesDeConexion = {},
): Promise<DesenlaceDeConexion> {
  const ventana = await pulsarFlujoConVentana(context, dapp, 'btn-conectar');
  return resolverConexionEnVentana(ventana, dapp, opciones);
}

/** Envía una petición del catálogo DESDE una página de la extensión (contexto `extension`). */
export async function llamarDesdeLaExtension(
  extensionPage: Page,
  method: string,
  params: readonly unknown[] = [],
): Promise<unknown> {
  return extensionPage.evaluate(
    async ({ metodo, parametros }) =>
      chrome.runtime.sendMessage({
        type: 'TRUEKEATE_RPC',
        method: metodo,
        params: parametros,
        origin: 'extension',
        tabId: null,
        frameId: null,
      }),
    { metodo: method, parametros: [...params] },
  );
}

// --- Lecturas de la dApp a través del provider inyectado ----------------------------------------

/** Espera a que el provider esté publicado en la página (condición observable, sin esperas fijas). */
export async function esperarProvider(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as { truekeate?: unknown }).truekeate === 'object',
    undefined,
    { timeout: timeoutMs },
  );
}

/** Resultado de una petición de la página: discriminado, con el `code` del error si falla. */
export type ResultadoDeLaDapp =
  | { ok: true; valor: unknown }
  | { ok: false; code: unknown; message: string };

/**
 * Petición del catálogo hecha desde la PÁGINA a través de `window.truekeate.request`.
 *
 * El rechazo se captura DENTRO de la página y se devuelve tipado: así un `4001`
 * (`rateLimitExceeded`) o un `4200` se ven con su código en el informe de Playwright en lugar de
 * como un `page.evaluate: Object` opaco.
 */
export async function pedirALaDapp(
  page: Page,
  method: string,
  params: readonly unknown[] = [],
): Promise<ResultadoDeLaDapp> {
  return page.evaluate(
    async ({ metodo, parametros }) => {
      const provider = (
        window as unknown as { truekeate: { request(args: unknown): Promise<unknown> } }
      ).truekeate;
      try {
        return { ok: true as const, valor: await provider.request({ method: metodo, params: parametros }) };
      } catch (error) {
        const fallo = error as { code?: unknown; message?: unknown };
        return {
          ok: false as const,
          code: fallo?.code ?? null,
          message: typeof fallo?.message === 'string' ? fallo.message : String(error),
        };
      }
    },
    { metodo: method, parametros: [...params] },
  );
}

/** Cuentas autorizadas de la dApp (`eth_accounts`); `[]` si el origen no tiene sesión. */
export async function cuentasDeLaDapp(page: Page): Promise<string[]> {
  const resultado = await pedirALaDapp(page, 'eth_accounts');
  if (!resultado.ok) {
    throw new Error(
      `[e2e] eth_accounts falló en la dApp con code=${String(resultado.code)}: ${resultado.message}`,
    );
  }
  return Array.isArray(resultado.valor) ? (resultado.valor as string[]) : [];
}

// ---------------------------------------------------------------------------
// H4 · firma, aprobación y transacciones (tareas 4.16 y 4.18)
// ---------------------------------------------------------------------------

/** Ruta de la ventana única de decisión, leída del arranque de la propia URL. */
export const RUTA_NOTIFICACION = 'notification.html';

/** Ruta del popup de la extensión. */
export const RUTA_POPUP = 'index.html';

/**
 * Plazo máximo que una prueba espera el desenlace de una firma en la dApp. Es una COTA DE LA
 * PRUEBA (para no colgarse si el flujo no responde), no el plazo del producto: el vencimiento
 * real de la solicitud lo posee el Service Worker con `chrome.alarms` (120 s de producción,
 * 3 s inyectados en el arnés).
 */
export const ESPERA_FIRMA_MS = 45_000;

/** Desenlace de una petición de firma lanzada desde la dApp. */
export type ResultadoDeFirma =
  | { estado: 'pendiente' }
  | { estado: 'ok'; valor: unknown }
  | { estado: 'error'; code: unknown; message: string };

/**
 * Lanza una petición de firma desde la dApp **sin esperarla** y guarda su desenlace en
 * `window.__tkFirma`.
 *
 * Es imprescindible para H4: `eth_sendTransaction`, `personal_sign` y `eth_signTypedData_v4`
 * **no resuelven** hasta que el usuario decide en `notification.html`, así que la prueba necesita
 * seguir ejecutando mientras la ventana única está abierta y leer el desenlace después.
 */
export async function iniciarPeticionDeFirma(
  page: Page,
  method: string,
  params: readonly unknown[] = [],
): Promise<void> {
  await page.evaluate(
    ({ metodo, parametros }) => {
      const global = window as unknown as {
        __tkFirma?: ResultadoDeFirma;
        truekeate?: { request(args: unknown): Promise<unknown> };
      };
      global.__tkFirma = { estado: 'pendiente' };
      const provider = global.truekeate;
      if (provider === undefined || typeof provider.request !== 'function') {
        global.__tkFirma = { estado: 'error', code: null, message: 'sin provider inyectado' };
        return;
      }
      void provider.request({ method: metodo, params: parametros }).then(
        (valor) => {
          global.__tkFirma = { estado: 'ok', valor };
        },
        (error: unknown) => {
          const fallo = error as { code?: unknown; message?: unknown };
          global.__tkFirma = {
            estado: 'error',
            code: fallo?.code ?? null,
            message: typeof fallo?.message === 'string' ? fallo.message : String(error),
          };
        },
      );
    },
    { metodo: method, parametros: [...params] },
  );
}

/** Desenlace actual de la petición lanzada con {@link iniciarPeticionDeFirma}. */
export async function leerResultadoDeFirma(page: Page): Promise<ResultadoDeFirma | null> {
  return page.evaluate(() => {
    const global = window as unknown as { __tkFirma?: ResultadoDeFirma };
    return global.__tkFirma ?? null;
  });
}

/**
 * Espera a que la petición de firma termine. Es una condición OBSERVABLE (el desenlace deja de ser
 * `pendiente`), nunca una espera fija.
 */
export async function esperarResultadoDeFirma(
  page: Page,
  timeoutMs = 45_000,
): Promise<ResultadoDeFirma> {
  await expect
    .poll(async () => (await leerResultadoDeFirma(page))?.estado, {
      message: 'la petición de firma de la dApp nunca se resolvió (¿se aprobó en la ventana única?)',
      timeout: timeoutMs,
    })
    .not.toBe('pendiente');
  const resultado = await leerResultadoDeFirma(page);
  if (resultado === null) {
    throw new Error('[e2e] no se lanzó ninguna petición de firma desde la dApp');
  }
  return resultado;
}

/** Ventanas de decisión (`notification.html`) abiertas ahora mismo. Nunca se escribe el ID a mano. */
export function ventanasDeDecision(context: BrowserContext): Page[] {
  return context.pages().filter((page) => page.url().includes(RUTA_NOTIFICACION));
}

/**
 * Espera la ventana de decisión que abre el Service Worker (`chrome.windows.create`).
 * No usa esperas fijas: reutiliza la que ya esté abierta o espera el evento `page` filtrando por
 * la URL `notification.html`.
 */
export async function esperarVentanaDeDecision(
  context: BrowserContext,
  timeoutMs = 20_000,
): Promise<Page> {
  const existente = ventanasDeDecision(context)[0];
  if (existente !== undefined) {
    await existente.waitForLoadState('domcontentloaded');
    return existente;
  }
  const ventana = await context.waitForEvent('page', {
    predicate: (page) => page.url().includes(RUTA_NOTIFICACION),
    timeout: timeoutMs,
  });
  await ventana.waitForLoadState('domcontentloaded');
  return ventana;
}

/**
 * Texto del contador visible de la ventana única («N solicitudes en espera»).
 *
 * H6 · ESPERA A QUE EL CONTADOR EXISTA. Al abrirse, `notification.html` pinta su encabezado de
 * CARGA (título + marca de agua, sin insignia) y solo añade el contador cuando el Service Worker le
 * entrega la solicitud. Leerlo nada más abrir la ventana dejaba la lectura esperando un elemento que
 * puede no llegar a aparecer —y el plazo inyectado de la suite es de solo 3 s
 * (`VITE_SIGN_TIMEOUT_MS`, §7.4.1.d)—, de modo que la ventana se cerraba antes y la prueba fallaba
 * con «Target page, context or browser has been closed». La espera es por CONDICIÓN OBSERVABLE, no
 * un plazo fijo.
 */
export async function leerContadorDeLaVentana(ventana: Page): Promise<string> {
  const contador = ventana.locator('.tk-header__badge');
  await expect(contador).toBeVisible({ timeout: 10_000 });
  return (await contador.textContent())?.trim() ?? '';
}

/** Marca los avisos de riesgo bloqueantes si la ventana los exige (RNF-05 / CA-RF-19). */
async function reconocerAvisos(ventana: Page): Promise<void> {
  const casilla = ventana.locator('#tk-risk-ack');
  if ((await casilla.count()) > 0 && !(await casilla.isChecked())) {
    await casilla.check();
  }
}

/**
 * Marca el acuse del aviso **antes de la primera firma** (RNF-23, tarea 6.3) si la ventana lo pide.
 *
 * AÑADIDO EN H6 (el arnés, no el producto): el aviso de primera firma bloquea «Aprobar» mientras no
 * se marque, así que TODAS las pruebas que aprueban una firma sobre una cartera que no ha firmado
 * todavía (las sembradas con `seedWallet`, que no siembran `truekeate_logs`) necesitan este paso.
 *
 * La ventana decide si el aviso aplica leyendo `truekeate_logs` por el canal del runtime, y esa
 * lectura ocurre al montar la ventana y con cada solicitud nueva: la ventana es ÚNICA y se REUTILIZA
 * (P-21), así que al mostrar la segunda solicitud el aviso puede tardar un instante en desaparecer.
 * Por eso la espera es por DOS condiciones observables —la casilla aparece o «Aprobar» se habilita—
 * y no por un plazo fijo: si el aviso no aplica, la prueba no pierde tiempo; si aplica, se marca.
 */
async function reconocerPrimeraFirma(ventana: Page): Promise<void> {
  const casilla = ventana.locator('#tk-primera-firma-ack');
  const aprobar = ventana.getByRole('button', { name: 'Aprobar' });
  await Promise.race([
    casilla.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined),
    expect(aprobar).toBeEnabled({ timeout: 15_000 }).catch(() => undefined),
  ]);
  if ((await casilla.count()) > 0 && (await casilla.isVisible()) && !(await casilla.isChecked())) {
    await casilla.check();
  }
}

/**
 * Aprueba la solicitud mostrada en la ventana única (marcando antes los avisos bloqueantes y el
 * acuse de la primera firma de RNF-23).
 */
export async function aprobarEnLaVentana(ventana: Page): Promise<void> {
  await reconocerAvisos(ventana);
  await reconocerPrimeraFirma(ventana);
  const aprobar = ventana.getByRole('button', { name: 'Aprobar' });
  await expect(aprobar).toBeEnabled();
  await aprobar.click();
}

/** Rechaza la solicitud mostrada en la ventana única. */
export async function rechazarEnLaVentana(ventana: Page): Promise<void> {
  const rechazar = ventana.getByRole('button', { name: 'Rechazar' });
  await expect(rechazar).toBeEnabled();
  await rechazar.click();
}

/** Estado observable de la cola persistida leído DESDE el Service Worker. */
export async function leerColaPersistida(worker: Worker): Promise<Record<string, unknown>> {
  const almacen = await readChromeStorage(worker, ['truekeate_pending_requests']);
  const cola = almacen.truekeate_pending_requests;
  return typeof cola === 'object' && cola !== null ? (cola as Record<string, unknown>) : {};
}

/** Cuenta las entradas `pending` de la cola persistida. */
export async function contarPendientes(worker: Worker): Promise<number> {
  const cola = await leerColaPersistida(worker);
  return Object.values(cola).filter(
    (entrada) =>
      typeof entrada === 'object' && entrada !== null && (entrada as { status?: unknown }).status === 'pending',
  ).length;
}

/**
 * Escribe la evidencia de un flujo de H4 en `RepoTecnico/evidencia/<fase>/`.
 *
 * FUSIÓN EN VEZ DE SOBRESCRITURA (añadido en H6): los specs nuevos (`24-accesibilidad`, `26-avisos`)
 * archivan su evidencia desde VARIAS pruebas del mismo fichero (una vez por superficie). Sobrescribir
 * el JSON dejaría solo el resultado de la última, así que, si el fichero ya existe, se **fusionan**
 * las claves de primer nivel (las posteriores ganan) y se conserva el resto. Un mismo nombre con
 * fichero ausente se comporta como antes.
 */
export function archivarEvidencia(nombre: string, contenido: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const destino = join(EVIDENCE_DIR, `${nombre}-${RUN_DATE}.json`);
  let fusionado: unknown = contenido;
  if (existsSync(destino)) {
    try {
      const previo: unknown = JSON.parse(readFileSync(destino, 'utf8'));
      if (
        typeof previo === 'object' &&
        previo !== null &&
        !Array.isArray(previo) &&
        typeof contenido === 'object' &&
        contenido !== null &&
        !Array.isArray(contenido)
      ) {
        fusionado = { ...(previo as Record<string, unknown>), ...(contenido as Record<string, unknown>) };
      }
    } catch {
      // Fichero ilegible o de una ejecución interrumpida: se escribe el contenido nuevo.
    }
  }
  writeFileSync(destino, `${JSON.stringify(fusionado, null, 2)}\n`, 'utf8');
  return destino;
}

// ---------------------------------------------------------------------------
// H5 · Segunda red (Anvil secundario en 8546/31338) y lectura del catálogo
// ---------------------------------------------------------------------------

/**
 * Endpoint del **Anvil secundario**: red de 31338 exigida por los flujos de cambio y alta de red
 * (`plan_desarrollo.md` §3.5.7 y riesgo «Segunda red ausente» de §3.5.8).
 *
 * El `globalSetup` lo arranca si no está (con `anvil --host 127.0.0.1 --port 8546 --chain-id 31338
 * --allow-origin "*"`), y las pruebas que lo necesitan comprueban su disponibilidad y, si falta, se
 * marcan como NO VERIFICADAS con el motivo escrito.
 */
export const SECONDARY_ANVIL_RPC_URL = 'http://127.0.0.1:8546';

/** `chainId` decimal del Anvil secundario. */
export const SECONDARY_ANVIL_CHAIN_ID = '31338';

/** `chainId` hexadecimal del Anvil secundario (`0x7a6a`). */
export const SECONDARY_ANVIL_CHAIN_ID_HEX = '0x7a6a';

/** ¿Responde el Anvil secundario con `chainId 0x7a6a`? Condición observable, sin esperas fijas. */
export async function anvilSecundarioResponde(): Promise<boolean> {
  try {
    const respuesta = await fetch(SECONDARY_ANVIL_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(2_000),
    });
    const cuerpo = (await respuesta.json()) as { result?: unknown };
    return cuerpo.result === SECONDARY_ANVIL_CHAIN_ID_HEX;
  } catch {
    return false;
  }
}

/** Espera a que el Anvil secundario responda (o devuelve `false` al agotar el plazo). */
export async function esperarAnvilSecundario(timeoutMs = 20_000): Promise<boolean> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await anvilSecundarioResponde()) return true;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  return false;
}

/**
 * Arranca el Anvil secundario desacoplado, con el formato exacto de `plan_desarrollo.md` §3.5.7
 * (`--allow-origin "*"`). Se usa para RESTAURAR el nodo tras la prueba que lo detiene.
 */
export function arrancarAnvilSecundario(): void {
  const hijo = spawn(
    anvilBinario(),
    ['--host', '127.0.0.1', '--port', '8546', '--chain-id', '31338', '--allow-origin', '*'],
    { detached: true, stdio: 'ignore' },
  );
  hijo.unref();
}

/** Declaración EIP-3085 del Anvil secundario: es la que se envía en `wallet_addEthereumChain`. */
export const RED_SECUNDARIA_EIP3085: Readonly<Record<string, unknown>> = {
  chainId: SECONDARY_ANVIL_CHAIN_ID_HEX,
  chainName: 'Anvil Secundario',
  rpcUrls: [SECONDARY_ANVIL_RPC_URL],
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: [],
};

/** Red persistida tal y como la lee una prueba (subconjunto de `StoredNetwork`). */
export interface RedPersistida {
  chainId?: string;
  chainIdDecimal?: number;
  name?: string;
  rpcUrl?: string;
  symbol?: string;
  isTestnet?: boolean;
  isDefault?: boolean;
}

/** `truekeate_networks` persistido (mapa `chainId → red`), leído DESDE el Service Worker. */
export async function redesPersistidas(worker: Worker): Promise<Record<string, RedPersistida>> {
  const almacen = await readChromeStorage(worker, ['truekeate_networks']);
  const redes = almacen.truekeate_networks;
  return typeof redes === 'object' && redes !== null ? (redes as Record<string, RedPersistida>) : {};
}

/** `chainId` activo persistido (`truekeate_chain_id`), leído DESDE el Service Worker. */
export async function chainIdPersistido(worker: Worker): Promise<unknown> {
  return (await readChromeStorage(worker, ['truekeate_chain_id'])).truekeate_chain_id;
}

/** Entradas de `truekeate_logs`, leídas DESDE el Service Worker (fuente de verdad del registro). */
export async function leerLogsPersistidos(
  worker: Worker,
): Promise<Array<Record<string, unknown>>> {
  const almacen = await readChromeStorage(worker, ['truekeate_logs']);
  const logs = almacen.truekeate_logs;
  return Array.isArray(logs) ? (logs as Array<Record<string, unknown>>) : [];
}

/** Espera a que aparezca en `truekeate_logs` una entrada que cumpla el predicado. */
export async function esperarEntradaDeLog(
  worker: Worker,
  predicado: (entrada: Record<string, unknown>) => boolean,
  timeoutMs = 15_000,
): Promise<Record<string, unknown>> {
  await expect
    .poll(async () => (await leerLogsPersistidos(worker)).some(predicado), {
      message: 'no apareció en truekeate_logs la entrada esperada',
      timeout: timeoutMs,
    })
    .toBe(true);
  const encontrada = (await leerLogsPersistidos(worker)).find(predicado);
  if (encontrada === undefined) {
    throw new Error('[e2e] la entrada de log desapareció entre la espera y la lectura');
  }
  return encontrada;
}

// ---------------------------------------------------------------------------
// H5 · Pestañas del popup (redes y actividad)
// ---------------------------------------------------------------------------

/** Abre el popup, espera a que esté listo y devuelve la página con su estado inicial. */
export async function abrirPestanaDelPopup(
  context: BrowserContext,
  extensionId: string,
  nombre: string,
): Promise<Page> {
  const popup = await openPopupReady(context, extensionId);
  await popup.getByRole('tab', { name: nombre }).click();
  await expect(popup.getByRole('tab', { name: nombre })).toHaveAttribute('aria-selected', 'true');
  return popup;
}
