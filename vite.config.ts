/// <reference types="vitest/config" />
/**
 * Build y empaquetado MV3 — TrueKeate Wallet (ADT-01)
 *
 * Fuente normativa: `documento_tecnico.md` §7.5 (bloque literal de scripts §7.5.1, las 6 entradas
 * §7.5.2, formatos por entrada §7.5.3, generacion del manifest §7.5.4) y `plan_desarrollo.md`
 * §3.1.5 (tareas 1.5 y 1.6).
 *
 * Formato POR ENTRADA (obligatorio, §7.5.3):
 *   - `es`   -> las 3 paginas HTML y el Service Worker (`type: 'module'` en el manifest).
 *   - `iife` -> `content-script.js` e `inject.js`: un content script no admite `import` y el
 *               provider se inyecta como `<script>` sincrono en `document_start`.
 *
 * DESVIACIONES DOCUMENTADAS (el efecto observable exigido no cambia: un solo `npm run build`
 * produce las 6 entradas en `dist/` con su formato y `dist/manifest.json`):
 *   1. §7.5.3 pide "un array de dos builds". Vite 7 NO admite que el fichero de configuracion
 *      exporte un array (`config must export or return an object`), asi que el build 2 se lanza
 *      con la API programatica `build()` desde el hook `closeBundle` del build 1, que es el hook
 *      que el propio documento ya usa para el manifest.
 *   2. `format: 'iife'` + `inlineDynamicImports: true` exigen UNA sola entrada por build (Rollup
 *      rechaza el code-splitting en IIFE), de modo que hay un build IIFE por entrada:
 *      build 1 = paginas + Service Worker (ES), build 2 = content-script (IIFE),
 *      build 3 = inject (IIFE, y es el que genera y valida `dist/manifest.json`).
 *   3. Vite emite los HTML en su ruta relativa a `root` (`dist/src/index.html`). Como la raiz del
 *      proyecto alberga `test.html` (dApp de pruebas servida en http://localhost:5174/test.html,
 *      H-33) y `root` debe ser esa raiz, el plugin `htmlRootOutput` reubica las 3 paginas en la
 *      raiz de `dist/` tal y como exige §7.5.5 (`dist/index.html`, `dist/connect.html`,
 *      `dist/notification.html`).
 */
import { build as viteBuild, defineConfig, type InlineConfig, type Plugin, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest } from './src/manifest';

const rootDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(rootDir, 'dist');

/** Las 6 entradas obligatorias del paquete MV3 y su nombre exacto dentro de `dist/` (§7.5.2). */
const PAGES_AND_SERVICE_WORKER_INPUT = {
  index: resolve(rootDir, 'src/index.html'), // 1 popup (action.default_popup)
  connect: resolve(rootDir, 'src/connect.html'), // 2 ventana de conexion
  notification: resolve(rootDir, 'src/notification.html'), // 3 ventana de decision
  background: resolve(rootDir, 'src/background.ts'), // 4 Service Worker (ESM)
};

const CONTENT_SCRIPT_INPUT = {
  'content-script': resolve(rootDir, 'src/content-script.ts'), // 5 content script (IIFE)
};

const INJECT_INPUT = {
  inject: resolve(rootDir, 'src/inject/index.ts'), // 6 provider inyectado (IIFE)
};

/** Salidas que deben existir en `dist/` cuando termina la cadena de builds (§7.5.5). */
const REQUIRED_ENTRIES = [
  'index.html',
  'connect.html',
  'notification.html',
  'background.js',
  'content-script.js',
  'inject.js',
] as const;

/** Permisos realmente declarados: se comprueban contra las invariantes de CA-RT-04. */
const DECLARED_PERMISSIONS: readonly string[] = manifest.permissions;

/** Salida compartida por los tres builds; `[name].js` fija el nombre estable de cada entrada. */
const SHARED_OUTPUT = {
  entryFileNames: '[name].js',
  chunkFileNames: 'chunks/[name]-[hash].js',
  assetFileNames: 'assets/[name]-[hash][extname]',
} as const;

/**
 * Reubica las paginas HTML emitidas en `dist/src/*.html` a la raiz de `dist/` y elimina el
 * arbol `src/` sobrante. Los assets se referencian con rutas absolutas (`/index.js`,
 * `/assets/...`), de modo que el traslado no rompe ninguna referencia.
 */
function htmlRootOutputPlugin(): Plugin {
  return {
    name: 'truekeate-html-root-output',
    apply: 'build',
    writeBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (!fileName.startsWith('src/') || !fileName.endsWith('.html')) continue;
        const target = fileName.replace(/^src\//, '');
        renameSync(resolve(outDir, fileName), resolve(outDir, target));
      }
      try {
        rmdirSync(resolve(outDir, 'src'));
      } catch {
        // El directorio no existe o no esta vacio: no es un error del build.
      }
    },
  };
}

/**
 * Genera `dist/manifest.json` desde `src/manifest.ts` (fuente unica tipada, RT-05) y FALLA el build
 * si: (a) falta alguna de las 6 entradas en `dist/`, (b) falta la `key` (ID estable, D-N/ADT-19) o
 * (c) `notifications` aparece en `permissions` en lugar de en `optional_permissions`
 * (ADT-30/D-P). Ademas bloquea los permisos retirados en H-36 (`tabs`, `activeTab`, `scripting`).
 *
 * Se registra en el ULTIMO build de la cadena, cuando las 6 entradas ya estan en disco. El guardia
 * `buildFailed` evita que una comprobacion de manifest enmascare el error real de un build fallido.
 */
export function manifestPlugin(): Plugin {
  let buildFailed = false;
  return {
    name: 'truekeate-generate-manifest',
    apply: 'build',
    buildEnd(error) {
      if (error) buildFailed = true;
    },
    closeBundle() {
      if (buildFailed) return;

      const missing = REQUIRED_ENTRIES.filter((entry) => !existsSync(resolve(outDir, entry)));
      if (missing.length > 0) {
        throw new Error(
          `[manifest] faltan entradas obligatorias en dist/: ${missing.join(', ')} (documento_tecnico.md §7.5.2)`,
        );
      }
      if (typeof manifest.key !== 'string' || manifest.key.trim() === '') {
        throw new Error('[manifest] falta la `key`: sin ella el ID de la extension no es estable (D-N/ADT-19)');
      }
      if (DECLARED_PERMISSIONS.includes('notifications')) {
        throw new Error(
          '[manifest] `notifications` no puede estar en `permissions`: pertenece a `optional_permissions` (ADT-30/D-P)',
        );
      }
      const retired = ['tabs', 'activeTab', 'scripting'].filter((p) => DECLARED_PERMISSIONS.includes(p));
      if (retired.length > 0) {
        throw new Error(`[manifest] permisos retirados en H-36 presentes en \`permissions\`: ${retired.join(', ')}`);
      }
      if (!manifest.optional_permissions.includes('notifications')) {
        console.warn('[manifest] aviso: `notifications` deberia declararse en `optional_permissions` (RF-39/ADT-30)');
      }

      writeFileSync(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      console.log(`[manifest] dist/manifest.json generado (version ${manifest.version}).`);
    },
  };
}

/**
 * Configuracion de un build IIFE autocontenido. `format: 'iife'` + `inlineDynamicImports: true`
 * obligan a una unica entrada; `emptyOutDir: false` conserva lo escrito por los builds anteriores
 * y `publicDir: false` evita recopiar `public/` en cada paso de la cadena.
 */
function iifeBuildConfig(input: Record<string, string>, plugins: Plugin[]): InlineConfig {
  return {
    configFile: false,
    root: rootDir,
    publicDir: false,
    logLevel: 'warn',
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'chrome114',
      sourcemap: true,
      rollupOptions: {
        input,
        output: {
          ...SHARED_OUTPUT,
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
    },
    plugins,
  };
}

/**
 * Build 2 y build 3: `content-script` e `inject` en formato IIFE. El ultimo de ellos incorpora el
 * plugin del manifest, que ya encuentra las 6 entradas en `dist/`.
 */
function contentAndInjectBuildsPlugin(): Plugin {
  let started = false;
  return {
    name: 'truekeate-content-and-inject-builds',
    apply: 'build',
    async closeBundle() {
      if (started) return; // un solo arranque aunque Vite invoque el hook mas de una vez
      started = true;
      await viteBuild(iifeBuildConfig(CONTENT_SCRIPT_INPUT, []));
      await viteBuild(iifeBuildConfig(INJECT_INPUT, [manifestPlugin()]));
    },
  };
}

/**
 * Bloque `test` de Vitest (§7.5.2). Se exporta para que `vitest.config.ts` lo reutilice y exista
 * una unica fuente de verdad. Umbrales de cobertura de RNF-17 (§7.4): se activan cuando los
 * modulos de H2-H5 existen; en H1 no hay codigo cubrible y fijarlos aqui pondria en rojo
 * `npm run coverage` sin aportar informacion.
 */
export const testConfig: NonNullable<UserConfig['test']> = {
  environment: 'jsdom',
  setupFiles: ['./test/setup/chrome-stub.ts'],
  include: ['src/**/*.spec.ts'],
  globals: true,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json-summary', 'html'],
    reportsDirectory: './coverage',
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.spec.ts', 'src/manifest.ts', 'src/**/*.d.ts'],
  },
};

export default defineConfig({
  // La raiz es la del repositorio para que `test.html` se sirva en http://localhost:5174/test.html
  // (H-33/CA-RT-09) y `public/` se copie a `dist/` sin configuracion extra.
  root: rootDir,
  plugins: [react(), htmlRootOutputPlugin(), contentAndInjectBuildsPlugin()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome114', // RNF-04/A2
    sourcemap: true,
    rollupOptions: {
      // Build 1 (formato `es`): las 3 paginas y el Service Worker del manifest.
      input: PAGES_AND_SERVICE_WORKER_INPUT,
      output: {
        ...SHARED_OUTPUT,
        format: 'es',
      },
    },
  },
  test: testConfig,
});
