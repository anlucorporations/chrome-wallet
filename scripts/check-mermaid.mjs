#!/usr/bin/env node
/**
 * scripts/check-mermaid.mjs — Puerta de CI de los diagramas Mermaid (ADT-02 / D-H).
 *
 * Fuente normativa: `documento_tecnico.md` §7.5.6 y plan tarea 1.18.
 *
 * Modos de validacion (el script informa de cual queda activo):
 *   - MODO A (real): `mermaid.parse()` de mermaid 11 sobre CADA bloque, con jsdom aportando el DOM
 *     (`mermaid` y `jsdom` figuran en `devDependencies`). Es el modo que exige §7.5.6: si algun
 *     bloque no parsea, el comando termina con exit 1.
 *   - MODO B (estructural, respaldo): solo si `mermaid` no pudiera cargarse o inicializarse. En ese
 *     caso se valida la estructura: cerca abre/cierra, tipo de diagrama declarado y reconocido,
 *     participantes de `sequenceDiagram` declarados antes de usarse, ausencia de `;` en el texto de
 *     un mensaje de `sequenceDiagram` y ausencia de `:` en las etiquetas de `stateDiagram-v2`.
 *
 * La regla de estilo que rompe el parseo —`;` dentro del texto de un mensaje de `sequenceDiagram`—
 * se comprueba SIEMPRE y es un error en ambos modos. La ambiguedad de las etiquetas de
 * `stateDiagram-v2` (que hoy no rompe `mermaid.parse`) es error en MODO B y aviso en MODO A.
 *
 * Uso: `npm run check:mermaid`  ->  exit 0 si todos los bloques son validos, exit 1 si alguno falla.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const targetDir = resolve(process.cwd(), process.argv[2] ?? 'RepoTecnico');

/** Tipos de diagrama reconocidos (mermaid 11). */
const DIAGRAM_TYPES = new Set([
  'graph',
  'flowchart',
  'sequencediagram',
  'classdiagram',
  'statediagram',
  'statediagram-v2',
  'erdiagram',
  'journey',
  'gantt',
  'pie',
  'requirementdiagram',
  'gitgraph',
  'c4context',
  'c4container',
  'c4component',
  'c4dynamic',
  'c4deployment',
  'mindmap',
  'timeline',
  'quadrantchart',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
  'architecture-beta',
  'kanban',
  'radar-beta',
  'treemap',
  'zenuml',
  'info',
]);

/** Palabras clave de `sequenceDiagram` que nunca son participantes. */
const SEQUENCE_KEYWORDS = new Set([
  'participant',
  'actor',
  'note',
  'loop',
  'alt',
  'else',
  'opt',
  'par',
  'and',
  'critical',
  'option',
  'break',
  'rect',
  'end',
  'activate',
  'deactivate',
  'autonumber',
  'box',
  'title',
  'acctitle',
  'accdescr',
  'link',
  'links',
  'properties',
  'details',
]);

/** Flecha de un mensaje de secuencia. */
const SEQUENCE_ARROW = /(<<?-{1,2}|-{1,2}>>?|-{1,2}x|x-{1,2}|-{1,2}\)|\(-{1,2})/;

const errors = [];
const warnings = [];
/** En MODO B la validacion estructural es bloqueante; en MODO A es informativa. */
let strictStructural = false;

const location = (block, line) => `${relative(process.cwd(), block.file)}:${line}`;
const fail = (block, line, message) => errors.push(`${location(block, line)}: ${message}`);
const warn = (block, line, message) => warnings.push(`${location(block, line)}: ${message}`);
/** Hallazgo estructural: error en MODO B, aviso en MODO A. */
const structural = (block, line, message) => (strictStructural ? fail(block, line, message) : warn(block, line, message));

/** Recorre un directorio y devuelve todos los `.md`. */
function findMarkdown(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findMarkdown(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) found.push(full);
  }
  return found;
}

/**
 * Extrae los bloques ```mermaid de un Markdown conservando la linea de apertura.
 * Tambien detecta fences sin cerrar (error estructural inmediato).
 */
function extractBlocks(file, text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let open = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const fence = /^\s*(`{3,}|~{3,})\s*([\w-]*)\s*$/.exec(line);
    if (!open) {
      if (fence && (fence[2] ?? '').toLowerCase() === 'mermaid') {
        open = { marker: fence[1] ?? '```', startLine: i + 2, body: [] };
      }
      continue;
    }
    if (fence && (fence[1] ?? '').length >= open.marker.length && (fence[2] ?? '') === '') {
      blocks.push({ file, startLine: open.startLine, body: open.body });
      open = null;
      continue;
    }
    open.body.push(line);
  }
  if (open) {
    errors.push(`${relative(process.cwd(), file)}:${open.startLine - 1}: bloque \`\`\`mermaid sin cerrar`);
  }
  return blocks;
}

/** Primera linea significativa del diagrama (ignora comentarios `%%` y frontmatter `---`). */
function diagramHeader(lines) {
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('%%') || line === '---') continue;
    return line;
  }
  return '';
}

/** Validacion estructural de un bloque + reglas de estilo de §7.5.6. */
function checkStructure(block) {
  const header = diagramHeader(block.body);
  const type = (header.split(/[\s{]/)[0] ?? '').toLowerCase();

  if (header === '') {
    fail(block, block.startLine, 'bloque mermaid vacio: no declara tipo de diagrama');
    return;
  }
  if (!DIAGRAM_TYPES.has(type)) {
    fail(block, block.startLine, `tipo de diagrama no reconocido: «${type}» (primera linea: «${header.slice(0, 40)}»)`);
    return;
  }

  const isSequence = type === 'sequencediagram';
  const isState = type === 'statediagram' || type === 'statediagram-v2';

  const declared = new Set();
  const used = [];

  for (const [offset, raw] of block.body.entries()) {
    const number = block.startLine + offset;
    const line = raw.trim();
    if (line === '' || line.startsWith('%%')) continue;

    if (isSequence) {
      const declaration = /^(?:participant|actor)\s+([^\s]+)/.exec(line);
      if (declaration) {
        declared.add((declaration[1] ?? '').replace(/^"|"$/g, ''));
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex >= 0) {
        const left = line.slice(0, colonIndex).trim();
        const text = line.slice(colonIndex + 1).trim();
        const arrow = SEQUENCE_ARROW.exec(left);
        if (arrow) {
          // Mensaje: `origen FLECHA destino : texto`.
          const from = left.slice(0, arrow.index).trim().replace(/^"|"$/g, '');
          const to = left.slice(arrow.index + arrow[0].length).trim().replace(/^"|"$/g, '');
          used.push({ from, to, line });
          if (text.includes(';')) {
            fail(block, number, `§7.5.6: «;» dentro del texto de un mensaje de sequenceDiagram -> «${line.slice(0, 60)}»`);
          }
        } else if (text.includes(';')) {
          warn(block, number, `§7.5.6: «;» en una anotacion de sequenceDiagram -> «${line.slice(0, 60)}»`);
        }
      }
    }

    if (isState) {
      const colonIndices = [];
      for (let i = 0; i < line.length; i += 1) if (line[i] === ':') colonIndices.push(i);
      if (colonIndices.length > 1) {
        structural(block, number, `§7.5.6: la etiqueta de transicion de stateDiagram-v2 contiene «:» -> «${line.slice(0, 60)}»`);
      }
    }
  }

  if (isSequence && declared.size > 0) {
    for (const message of used) {
      for (const side of [message.from, message.to]) {
        const name = side.replace(/^"|"$/g, '');
        if (name === '' || SEQUENCE_KEYWORDS.has(name.toLowerCase())) continue;
        if (!declared.has(name)) {
          structural(block, block.startLine, `participante «${name}» usado antes de declararse con \`participant\`/\`actor\` -> «${message.line.slice(0, 60)}»`);
        }
      }
    }
  }
}

/** Carga mermaid 11 con jsdom como DOM global; devuelve `null` si no es posible (MODO B). */
async function loadMermaid() {
  // Escape documentado: `TK_MERMAID_STRUCTURAL=1` fuerza el MODO B (util para comprobar el
  // respaldo estructural sin desinstalar mermaid).
  if (process.env.TK_MERMAID_STRUCTURAL === '1') return null;
  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><html><body><div id="truekeate-mermaid"></div></body></html>', {
      pretendToBeVisual: true,
    });
    const win = dom.window;
    const shim = {
      window: win,
      document: win.document,
      navigator: win.navigator,
      HTMLElement: win.HTMLElement,
      SVGElement: win.SVGElement,
      Element: win.Element,
      Node: win.Node,
      DOMParser: win.DOMParser,
      XMLSerializer: win.XMLSerializer,
      MutationObserver: win.MutationObserver,
      Image: win.Image,
      CustomEvent: win.CustomEvent,
      Event: win.Event,
      getComputedStyle: win.getComputedStyle.bind(win),
      requestAnimationFrame: win.requestAnimationFrame.bind(win),
      cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    };
    for (const [key, value] of Object.entries(shim)) {
      try {
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
      } catch {
        // Global no configurable: mermaid usara el que ya exista.
      }
    }
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', suppressErrorRendering: true });
    return mermaid;
  } catch (error) {
    warn(
      { file: resolve(process.cwd(), 'scripts/check-mermaid.mjs'), startLine: 1 },
      1,
      `mermaid no pudo inicializarse (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
}

// --- recorrido ---------------------------------------------------------------------------------
if (!existsSync(targetDir)) {
  console.error(`[check:mermaid] no existe el directorio ${relative(process.cwd(), targetDir)}`);
  process.exit(1);
}

const markdownFiles = findMarkdown(targetDir);
const blocks = markdownFiles.flatMap((file) => extractBlocks(file, readFileSync(file, 'utf8')));

console.log(
  `[check:mermaid] ${markdownFiles.length} ficheros Markdown y ${blocks.length} bloques mermaid en ${relative(process.cwd(), targetDir)}/`,
);

const mermaid = await loadMermaid();
strictStructural = mermaid === null;

if (mermaid) {
  console.log('[check:mermaid] MODO A activo: mermaid.parse() real sobre cada bloque (mermaid 11 + jsdom, §7.5.6).');
} else {
  console.log('[check:mermaid] MODO B activo: validacion estructural (mermaid no disponible); sus hallazgos son bloqueantes.');
}

for (const block of blocks) checkStructure(block);

if (mermaid) {
  for (const block of blocks) {
    try {
      await mermaid.parse(block.body.join('\n'), { suppressErrors: true });
    } catch (error) {
      const detail = (error instanceof Error ? error.message : String(error)).split('\n').slice(0, 4).join(' | ');
      fail(block, block.startLine, `mermaid.parse() ha fallado: ${detail}`);
    }
  }
}

for (const warning of warnings) console.warn(`[check:mermaid] aviso: ${warning}`);

if (errors.length > 0) {
  console.error(`\n[check:mermaid] ${errors.length} bloque(s) con error:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`[check:mermaid] OK: ${blocks.length}/${blocks.length} bloques validos.`);
process.exit(0);
