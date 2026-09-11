#!/usr/bin/env node
/**
 * scripts/lint-prohibited.mjs — Puerta de lint de prohibiciones del proyecto.
 *
 * Fuente normativa: `documento_tecnico.md` §7.5.1 (`lint:prohibited` cubre RT-03, la nomenclatura
 * RT-13, RNF-14 y RNF-18 y la prohibicion de `chrome.storage.sync` de ADT-26) y plan tarea 1.14.
 *
 * Comprueba, sobre `src/`:
 *   1. Cero dependencias prohibidas en los especificadores de import: `viem`, `@scure/bip39`,
 *      `@metamask/*` y `axios` (RT-03: `ethers` es la unica libreria criptografica, RT-02).
 *   2. Cero llamadas propias a `fetch(` (el trafico RPC sale unicamente por el proveedor del SW).
 *   3. Cero `chrome.storage.sync` (ADT-26: la persistencia es `chrome.storage.local`).
 *   4. Cero prefijo `codecrypto_` (RT-13: la nomenclatura canonica es `truekeate_`).
 *   5. Cero literales de color (`#rgb`, `rgb()`, `hsl()`, degradados) fuera de `src/styles/tokens.css`
 *      (RNF-18 / CA-RT-12: `tokens.css` es la unica fuente de color y degradados).
 *   6. Cero `ethers` importado desde `src/popup/` (RNF-14: el bundle de `ethers` vive solo en el SW).
 *
 * Y sobre `dist/` (si existe):
 *   7. Cero recursos remotos de terceros (CDN) en HTML/CSS/JS (CA-RT-05).
 *
 * Uso: `npm run lint:prohibited`  ->  exit 0 si no hay hallazgos, exit 1 si hay alguno.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = resolve(ROOT, 'src');
const DIST_DIR = resolve(ROOT, 'dist');
/** Unico fichero donde se admiten literales de color (RNF-18). */
const TOKENS_RELATIVE = join('src', 'styles', 'tokens.css');

/** Extensiones que se revisan como texto. */
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json']);

/** Dependencias prohibidas (RT-03). */
const FORBIDDEN_SPECIFIERS = [
  { label: 'viem', matches: (s) => s === 'viem' || s.startsWith('viem/') },
  { label: '@scure/bip39', matches: (s) => s === '@scure/bip39' || s.startsWith('@scure/bip39/') },
  { label: '@metamask/*', matches: (s) => s.startsWith('@metamask/') },
  { label: 'axios', matches: (s) => s === 'axios' || s.startsWith('axios/') },
];

/** Hosts de CDN cuyo uso esta prohibido en el paquete (RT-05 / CA-RT-05). */
const CDN_HOSTS = [
  'unpkg.com',
  'cdn.jsdelivr.net',
  'jsdelivr.net',
  'cdnjs.cloudflare.com',
  'esm.sh',
  'skypack.dev',
  'cdn.skypack.dev',
  'raw.githubusercontent.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'ajax.googleapis.com',
];

/** Patrones de recurso remoto en el artefacto (script/link/@import/url() con http(s)). */
const REMOTE_RESOURCE_PATTERNS = [
  { regex: /<script[^>]+src\s*=\s*["']https?:\/\//gi, label: 'script remoto' },
  { regex: /<link[^>]+href\s*=\s*["']https?:\/\//gi, label: 'stylesheet u hoja remota' },
  { regex: /@import\s+(?:url\(\s*)?["']?https?:\/\//gi, label: '@import remoto' },
  { regex: /url\(\s*["']?https?:\/\//gi, label: 'url() remota' },
  { regex: /\.src\s*=\s*["']https?:\/\//gi, label: 'src remoto por asignacion' },
];

const COLOR_PATTERNS = [
  { regex: /(?<![\w&])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g, label: 'color hexadecimal' },
  { regex: /\b(?:rgba?|hsla?)\s*\(/g, label: 'rgb()/hsl()' },
  { regex: /\b(?:linear|radial|conic)-gradient\s*\(/g, label: 'degradado CSS' },
];

const violations = [];
const notes = [];

/** Anade un hallazgo con su ubicacion exacta (`ruta:linea`). */
function report(file, line, message) {
  violations.push(`${relative(ROOT, file)}:${line}: ${message}`);
}

/** Numero de linea (1..n) de un indice de caracter dentro de un texto. */
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/** Recorre un directorio y devuelve los ficheros de texto encontrados. */
function walk(dir) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      found.push(full);
    }
  }
  return found;
}

/** Extrae los especificadores de import/require de un modulo. */
function importSpecifiers(text) {
  const specifiers = [];
  const patterns = [
    /(?:from|import)\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const regex of patterns) {
    for (const match of text.matchAll(regex)) {
      specifiers.push({ specifier: match[1], index: match.index ?? 0 });
    }
  }
  return specifiers;
}

/** Comprueba un fichero de `src/`. */
function checkSourceFile(file, text) {
  const relativePath = relative(ROOT, file);
  const isTokens = relativePath === TOKENS_RELATIVE;
  const isPopup = relativePath.split(/[\\/]/).slice(0, 2).join('/') === 'src/popup';

  for (const { specifier, index } of importSpecifiers(text)) {
    for (const forbidden of FORBIDDEN_SPECIFIERS) {
      if (forbidden.matches(specifier)) {
        report(file, lineOf(text, index), `dependencia prohibida «${forbidden.label}» (RT-03): import de '${specifier}'`);
      }
    }
    if (isPopup && (specifier === 'ethers' || specifier.startsWith('ethers/'))) {
      report(file, lineOf(text, index), `«ethers» no puede importarse desde src/popup/ (RNF-14): el bundle vive solo en el SW`);
    }
  }

  // 2. Llamadas propias a fetch (incluidas window.fetch / globalThis.fetch).
  for (const regex of [/(?<![\w.$])fetch\s*\(/g, /\b(?:window|globalThis|self)\.fetch\s*\(/g]) {
    for (const match of text.matchAll(regex)) {
      report(file, lineOf(text, match.index ?? 0), 'llamada propia a fetch(): el RPC sale solo por el proveedor del SW');
    }
  }

  // 3. chrome.storage.sync prohibido (ADT-26).
  for (const match of text.matchAll(/chrome\s*\.\s*storage\s*\.\s*sync/g)) {
    report(file, lineOf(text, match.index ?? 0), 'chrome.storage.sync esta prohibido: la persistencia es chrome.storage.local (ADT-26)');
  }

  // 4. Prefijo heredado codecrypto_ (RT-13).
  for (const match of text.matchAll(/codecrypto_/g)) {
    report(file, lineOf(text, match.index ?? 0), 'prefijo «codecrypto_» prohibido: la nomenclatura canonica es «truekeate_» (RT-13)');
  }

  // 5. Literales de color fuera de tokens.css (RNF-18).
  if (!isTokens) {
    for (const { regex, label } of COLOR_PATTERNS) {
      for (const match of text.matchAll(regex)) {
        report(file, lineOf(text, match.index ?? 0), `${label} fuera de src/styles/tokens.css (RNF-18): «${match[0]}»`);
      }
    }
  }
}

/** Comprueba que el artefacto no arrastre recursos remotos ni hosts de CDN (CA-RT-05). */
function checkDistFile(file, text) {
  for (const { regex, label } of REMOTE_RESOURCE_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      report(file, lineOf(text, match.index ?? 0), `${label} en el paquete: «${match[0].slice(0, 80)}» (CA-RT-05)`);
    }
  }
  for (const host of CDN_HOSTS) {
    const regex = new RegExp(`https?://(?:[\\w-]+\\.)*${host.replace(/\./g, '\\.')}`, 'gi');
    for (const match of text.matchAll(regex)) {
      report(file, lineOf(text, match.index ?? 0), `host de CDN «${host}» en el paquete (RT-05/CA-RT-05)`);
    }
  }
}

// --- src/ --------------------------------------------------------------------------------------
if (!existsSync(SRC_DIR)) {
  notes.push('src/ todavia no existe: no hay codigo fuente que revisar (H1 en curso).');
} else {
  const sourceFiles = walk(SRC_DIR);
  for (const file of sourceFiles) {
    checkSourceFile(file, readFileSync(file, 'utf8'));
  }
  notes.push(`src/: ${sourceFiles.length} ficheros revisados.`);
}

// --- dist/ (solo si ya se ha construido) -------------------------------------------------------
if (!existsSync(DIST_DIR)) {
  notes.push('dist/ no existe todavia: se omite la comprobacion de recursos remotos (CA-RT-05).');
} else {
  const distFiles = walk(DIST_DIR);
  for (const file of distFiles) {
    checkDistFile(file, readFileSync(file, 'utf8'));
  }
  notes.push(`dist/: ${distFiles.length} ficheros revisados (0 URLs de CDN exigido por CA-RT-05).`);
}

// --- informe -----------------------------------------------------------------------------------
for (const note of notes) console.log(`[lint:prohibited] ${note}`);

if (violations.length > 0) {
  console.error(`\n[lint:prohibited] ${violations.length} hallazgo(s):`);
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log('[lint:prohibited] OK: sin dependencias prohibidas, sin fetch propio, sin chrome.storage.sync,');
console.log('[lint:prohibited]     sin prefijo codecrypto_, sin colores fuera de tokens.css y sin ethers en el popup.');
process.exit(0);
