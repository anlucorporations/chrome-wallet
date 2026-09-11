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
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

/** Argumentos de Chrome que cargan la extensión desde `dist/` (nunca desde el perfil). */
const ARGUMENTOS_EXTENSION = [
  `--disable-extensions-except=${DIST_DIR}`,
  `--load-extension=${DIST_DIR}`,
  '--no-sandbox',
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
          timeout: 15_000,
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
