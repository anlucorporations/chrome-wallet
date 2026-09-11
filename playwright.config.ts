/**
 * Arnes E2E de Playwright (`documento_tecnico.md` §7.4 y §7.4.1 / ADT-05, plan tarea 1.16).
 *
 * Reglas que este fichero fija:
 *   - `testDir: 'e2e'` y `globalSetup` que reconstruye `dist/` con los plazos inyectados
 *     (`VITE_SIGN_TIMEOUT_MS=3000`, `VITE_CONNECT_TIMEOUT_MS=2000`, §7.4.1.d).
 *   - UN solo worker: la extension vive en un contexto persistente y comparte el ID estable
 *     (`EXTENSION_ID`), asi que las pruebas no pueden pisarse entre si.
 *   - Cero reutilizacion de perfiles: `e2e/fixtures/extension.ts` crea un perfil NUEVO por prueba
 *     con `mkdtemp` (§7.4.1.b). Aqui no se declara ningun `storageState` ni perfil compartido.
 *   - `headless` conmutable con `E2E_HEADLESS=false` para depurar (`entornos_globales.md` §3).
 *   - La evidencia se archiva segun §7.4.1.f: `RepoTecnico/evidencia/<fase>/<nombre>-<fecha>.json`.
 */
import { defineConfig } from '@playwright/test';

/** Hito en curso: la evidencia se archiva por fase (H1..H5). */
const EVIDENCE_PHASE = process.env.TK_EVIDENCE_PHASE ?? 'H1';
const EVIDENCE_DIR = `RepoTecnico/evidencia/${EVIDENCE_PHASE}`;
const RUN_DATE = new Date().toISOString().slice(0, 10);

/** `E2E_HEADLESS=false` abre el navegador visible; cualquier otro valor (o ausencia) es headless. */
const HEADLESS = process.env.E2E_HEADLESS !== 'false';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',

  // Un unico worker y sin paralelismo: un contexto persistente por prueba, jamas compartido.
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Trazas y capturas de las pruebas fallidas (carpeta ignorada por git).
  outputDir: 'test-results',

  reporter: [
    ['list'],
    ['json', { outputFile: `${EVIDENCE_DIR}/e2e-${RUN_DATE}.json` }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    headless: HEADLESS,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium-extension',
      // El fixture de §7.4.1.a llama a `chromium.launchPersistentContext(dir, { channel: 'chromium' })`.
      use: { channel: 'chromium' },
    },
  ],
});
