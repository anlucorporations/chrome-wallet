/**
 * Genera `src/inject/icon-data.ts` con el isologo del proveedor como data-URI PNG.
 *
 * Por qué existe (RT-03): el código propio NO puede usar `fetch`, y el anuncio EIP-6963 debe
 * ser síncrono. Incrustar el icono en el bundle resuelve las dos cosas: el proveedor se anuncia
 * con su icono en el primer evento, sin red y sin promesas de por medio.
 *
 * Uso: `node scripts/generate-icon-data.mjs` (también se ejecuta en `prebuild`).
 * Entrada:  public/brand/truekeate-mark-96.png
 * Salida:   src/inject/icon-data.ts  (archivo generado, versionado para que `tsc -b` funcione
 *           en un clon limpio sin necesidad de ejecutar este script antes)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(rootDir, 'public/brand/truekeate-mark-96.png');
const TARGET = resolve(rootDir, 'src/inject/icon-data.ts');

const bytes = readFileSync(SOURCE);
const dataUri = `data:image/png;base64,${bytes.toString('base64')}`;

const banner = `/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Origen: \`public/brand/truekeate-mark-96.png\` (${bytes.length} bytes).
 * Generador: \`scripts/generate-icon-data.mjs\` (se ejecuta en \`prebuild\`).
 *
 * Motivo (RT-03): el código propio no puede usar \`fetch\`, y el anuncio EIP-6963 debe ser
 * síncrono; el icono se incrusta en el bundle en tiempo de compilación.
 */

`;

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(
  TARGET,
  `${banner}export const PROVIDER_ICON_DATA_URI: string =\n  '${dataUri}';\n\nexport default PROVIDER_ICON_DATA_URI;\n`,
  'utf8',
);

console.log(`[icon-data] src/inject/icon-data.ts generado (${bytes.length} bytes -> ${dataUri.length} caracteres).`);
