/**
 * `src/manifest/manifest.spec.ts` — Manifest MV3 generado (tarea 1.5/1.6, §3.1.7).
 *
 * Verifica `dist/manifest.json` (el artefacto real que carga Chrome) contra el conjunto
 * cerrado de CA-RT-04 y contra la fuente única tipada `src/manifest.ts` (RT-05), y verifica
 * las 6 entradas obligatorias dentro de `dist/` (§7.5.2).
 *
 * DOS GRUPOS:
 *   1. «Manifest declarado en la fuente» — se ejecuta SIEMPRE: no necesita `dist/`.
 *   2. «Artefacto dist/» — necesita un `dist/` construido. Si falta `dist/manifest.json`
 *      (porque el build está bloqueado), el grupo se SALTA con el motivo escrito y visible
 *      en la salida de Vitest; nunca se finge ni se borra la aserción.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { EXTENSION_ID, MANIFEST_KEY, manifest } from '../manifest';

// ---------------------------------------------------------------------------
// Rutas y constantes
// ---------------------------------------------------------------------------

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SPEC_DIR, '..', '..');
const DIST_DIR = join(REPO_ROOT, 'dist');
const DIST_MANIFEST = join(DIST_DIR, 'manifest.json');

/** Las 6 entradas obligatorias del paquete MV3 (§7.5.2 / §7.5.5). */
const REQUIRED_ENTRIES = [
  'index.html',
  'connect.html',
  'notification.html',
  'background.js',
  'content-script.js',
  'inject.js',
] as const;

/** Conjunto CERRADO de permisos de CA-RT-04 (idéntico en los cuatro documentos). */
const EXPECTED_PERMISSIONS = ['storage', 'alarms', 'favicon', 'clipboardRead', 'clipboardWrite'];

/** Permisos retirados en H-36: no pueden aparecer en `permissions`. */
const RETIRED_PERMISSIONS = ['tabs', 'activeTab', 'scripting'];

/** Motivo exacto del salto cuando el build no ha podido generar el artefacto. */
const MOTIVO_DIST_INCOMPLETO =
  'dist/manifest.json no existe: el build está bloqueado por defectos AJENOS a esta suite ' +
  '(a) `npx tsc -b`: vite.config.ts:155 TS2353, src/background/rpc/errors.ts:304 TS2532, ' +
  'src/inject/eip6963.ts:55 TS2345; (b) `npx vite build`: src/index.html:13, src/connect.html:13 y ' +
  'src/notification.html:13 cargan /<dir>/main.tsx, que no resuelve con `root` = raíz del repositorio, ' +
  'así que ninguna de las 6 entradas llega a dist/ (el error real queda enmascarado por ' +
  '«[manifest] faltan entradas obligatorias»). Detalle en RepoTecnico/evidencia/H1/ACTA_H1.md.';

/** Estructura mínima del manifest que consumen las aserciones. */
interface DistManifest {
  manifest_version?: number;
  name?: string;
  version?: string;
  key?: string;
  minimum_chrome_version?: string;
  permissions?: string[];
  optional_permissions?: string[];
  background?: { service_worker?: string; type?: string };
  action?: { default_popup?: string };
  content_scripts?: Array<{ js?: string[]; run_at?: string }>;
  web_accessible_resources?: Array<{ resources?: string[]; use_dynamic_url?: boolean }>;
}

/** ¿Existe el artefacto que se va a auditar? */
const distDisponible = existsSync(DIST_MANIFEST);

if (!distDisponible) {
  // Aviso explícito: un grupo de este fichero no se ejecutará y por qué.
  console.warn(`[manifest.spec] grupo «Artefacto dist/» SALTADO. ${MOTIVO_DIST_INCOMPLETO}`);
}

/** Lee y valida el manifest del artefacto. */
const leerManifestDeDist = (): DistManifest => {
  const parsed: unknown = JSON.parse(readFileSync(DIST_MANIFEST, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('[manifest.spec] dist/manifest.json no contiene un objeto JSON');
  }
  return parsed as DistManifest;
};

// ---------------------------------------------------------------------------
// Grupo 1 — fuente única tipada (se ejecuta siempre)
// ---------------------------------------------------------------------------

describe('Manifest declarado en la fuente (CA-RT-04, CA-RT-13, RT-05)', () => {
  it('declara en `permissions` el conjunto cerrado de CA-RT-04, sin `notifications`', () => {
    expect([...manifest.permissions].sort()).toEqual([...EXPECTED_PERMISSIONS].sort());
    expect(manifest.permissions).not.toContain('notifications');
  });

  it('declara `notifications` SOLO en `optional_permissions` (ADT-30 / D-P)', () => {
    expect([...manifest.optional_permissions]).toEqual(['notifications']);
  });

  it('no declara `tabs`, `activeTab` ni `scripting` en ningún bloque de permisos', () => {
    for (const retirado of RETIRED_PERMISSIONS) {
      expect(manifest.permissions).not.toContain(retirado);
      expect(manifest.optional_permissions).not.toContain(retirado);
    }
  });

  it('es MV3 con Service Worker de tipo módulo y popup de 380×600 en `action`', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(manifest.action.default_popup).toBe('index.html');
    expect(manifest.minimum_chrome_version).toBe('114');
  });

  it('incluye la `key` fija y el ID estable derivado de ella (D-N / ADT-19)', () => {
    expect(typeof manifest.key).toBe('string');
    expect(manifest.key).toBe(MANIFEST_KEY);
    expect(MANIFEST_KEY.length).toBeGreaterThan(0);
    expect(EXTENSION_ID).toBe('oiahebaliobknoeeonhgaacapjcpgblo');
  });

  it('declara el content script con `run_at: document_start` e inyecta `inject.js`', () => {
    const contentScripts = manifest.content_scripts;
    expect(contentScripts).toHaveLength(1);
    expect(contentScripts[0]?.js).toEqual(['content-script.js']);
    expect(contentScripts[0]?.run_at).toBe('document_start');
    const recursos = manifest.web_accessible_resources;
    expect(recursos).toHaveLength(1);
    expect(recursos[0]?.resources).toEqual(['inject.js']);
    expect(recursos[0]?.use_dynamic_url).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Grupo 2 — artefacto (necesita `dist/` construido)
// ---------------------------------------------------------------------------

describe.skipIf(!distDisponible)('Artefacto dist/ (CA-RT-04, CA-RT-05)', () => {
  it('existe `dist/manifest.json` y coincide con la fuente única `src/manifest.ts`', () => {
    expect(existsSync(DIST_MANIFEST)).toBe(true);
    const dist = leerManifestDeDist();
    // Comparación profunda contra el objeto tipado: una divergencia entre el artefacto y la
    // fuente única rompe el hito (RT-05). `undefined` no puede colarse: el manifest se
    // serializa completo en `closeBundle`.
    expect(dist).toEqual(JSON.parse(JSON.stringify(manifest)));
  });

  it('contiene las 6 entradas obligatorias dentro de `dist/` (§7.5.2)', () => {
    const faltan = REQUIRED_ENTRIES.filter((entry) => !existsSync(join(DIST_DIR, entry)));
    expect(faltan, `entradas ausentes en dist/: ${faltan.join(', ')}`).toEqual([]);
  });

  it('declara la `key` y no cuela `notifications` en `permissions`', () => {
    const dist = leerManifestDeDist();
    expect(typeof dist.key).toBe('string');
    expect(dist.key).toBe(MANIFEST_KEY);
    expect(dist.permissions ?? []).not.toContain('notifications');
    expect(dist.optional_permissions ?? []).toContain('notifications');
  });

  it('no declara `tabs`, `activeTab` ni `scripting` y usa el conjunto cerrado de permisos', () => {
    const dist = leerManifestDeDist();
    const permisos = dist.permissions ?? [];
    expect([...permisos].sort()).toEqual([...EXPECTED_PERMISSIONS].sort());
    for (const retirado of RETIRED_PERMISSIONS) {
      expect(permisos).not.toContain(retirado);
    }
  });
});
