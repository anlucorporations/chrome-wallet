/**
 * Módulo(s) de contrato: M1..M66 (auditoría mecánica de sus cabeceras JSDoc).
 * Requisitos: RNF-01, RNF-13 y RNF-14 (`CA-RT-08`) — criterio de Documentación de la rúbrica
 * del evaluador (`requerimientos.md` §4.1: «Comentarios en código (3 pts)»).
 *
 * QUE VERIFICA ESTE SPEC (tarea 6.6 de `plan_desarrollo.md` §3.6.5)
 * -----------------------------------------------------------------
 * El corpus exige que **todo modulo de `src/`** abra con un bloque **JSDoc de contrato** que
 * declare (a) su **identificador de modulo** —la forma canonica del corpus es `M<numero>`
 * (`M8`, `M14.b`, `M57`), y se admite tambien `M-8`— y (b) al menos una **referencia de
 * requisito** real (`RF-xx`, `RNF-xx` o `RT-xx`). Ese contrato es lo que hace trazable cada
 * fichero hasta `documento_tecnico.md` §2.4 y hasta el Anexo A de `requerimientos.md`, y es
 * justo lo que puntua la rubrica en «Codigo limpio y comentado» y «Comentarios en codigo».
 *
 * La comprobacion es **mecanica y falsable**: si un fichero nuevo entra sin cabecera, o si
 * alguien borra el identificador o la referencia, este spec falla nombrando el fichero.
 *
 * REGLAS DE FORMA (para que la comprobacion no sea ambigua)
 * --------------------------------------------------------
 * 1. «Abre con un bloque JSDoc» significa: **antes de la primera sentencia o declaracion** del
 *    fichero existe un bloque JSDoc completo. Se admiten delante comentarios de linea (`//`), que
 *    es lo que necesitan los specs con la directiva `// @vitest-environment node`, y lineas en
 *    blanco. Se ignora la marca de orden de bytes (BOM) si la hay.
 * 2. El identificador de modulo debe estar en el rango **M1..M66** (66 modulos de
 *    `documento_tecnico.md` §2.4): un `M99` inventado no pasa.
 * 3. El universo son **todos** los ficheros `.ts` y `.tsx` de `src/`, a cualquier profundidad,
 *    incluidos los `*.spec.ts` (un spec tambien declara que modulo ejercita) y este propio
 *    fichero.
 *
 * ENTORNO: `node` implicito (el spec usa `node:fs` para leer el arbol; no toca el DOM).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Raiz de `src/`: este spec vive en `src/docs.spec.ts`, de modo que su carpeta es `src/`. */
const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** Identificador de modulo del corpus: `M8`, `M14.b`, `M57`, y tambien la forma `M-8`. */
const MODULE_ID = /\bM\s?-?(\d{1,2})\b/;

/** Referencia de requisito: `RF-13`, `RNF-21`, `RT-11` (dos digitos como maximo). */
const REQUIREMENT_REF = /\b(?:RF|RNF|RT)-\d{1,2}\b/;

/** Numero maximo de modulos declarado en `documento_tecnico.md` §2.4 (M1..M66). */
const MAX_MODULE = 66;

/** Extensiones del universo auditado (fuente TypeScript, con o sin JSX). */
const SOURCE_EXTENSION = /\.tsx?$/;

/**
 * Lista recursivamente los ficheros de codigo bajo `src/`, en orden estable.
 * Se devuelven rutas relativas a `src/` con separador `/` para que el mensaje de fallo sea el
 * mismo en Windows y en Linux.
 */
function listSourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...listSourceFiles(absolute));
      continue;
    }
    if (!SOURCE_EXTENSION.test(entry.name)) continue;
    found.push(relative(SRC_DIR, absolute).split(sep).join('/'));
  }
  return found.sort();
}

/**
 * Devuelve el primer bloque JSDoc del fichero, o `null` si no hay ninguno antes del codigo.
 * Se saltan el BOM (si lo hay), las lineas en blanco y los comentarios de linea iniciales.
 */
function firstJsDocBlock(source: string): string | null {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  let offset = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('//')) {
      offset += line.length + 1;
      continue;
    }
    break;
  }
  const match = text.slice(offset).match(/^\/\*\*[\s\S]*?\*\//);
  return match === null ? null : match[0];
}

/** Resultado de la auditoría de un fichero: lista de incumplimientos (vacia = conforme). */
function audit(file: string): string[] {
  const source = readFileSync(resolve(SRC_DIR, file), 'utf8');
  const block = firstJsDocBlock(source);
  if (block === null) {
    return ['no abre con un bloque JSDoc de contrato'];
  }

  const problems: string[] = [];
  const moduleMatch = block.match(MODULE_ID);
  if (moduleMatch === null) {
    problems.push('el bloque JSDoc no declara identificador de modulo (M<numero>)');
  } else if (Number(moduleMatch[1]) < 1 || Number(moduleMatch[1]) > MAX_MODULE) {
    problems.push(`el identificador M${moduleMatch[1]} esta fuera del rango M1..M${MAX_MODULE}`);
  }
  if (!REQUIREMENT_REF.test(block)) {
    problems.push('el bloque JSDoc no referencia ningun RF/RNF/RT');
  }
  return problems;
}

const FILES = listSourceFiles(SRC_DIR);

describe('docs.spec.ts — JSDoc de contrato por modulo (M-xx + RF/RNF/RT)', () => {
  it('audita el arbol de src/ completo (universo no vacio y con TypeScript)', () => {
    expect(FILES.length).toBeGreaterThan(0);
    expect(FILES).toContain('docs.spec.ts');
    expect(FILES.some((file) => file.endsWith('.tsx'))).toBe(true);
  });

  it('encuentra los ficheros de codigo y ninguno fuera de src/', () => {
    const offenders = FILES.filter((file) => file.startsWith('..') || file.includes('node_modules'));
    expect(offenders).toEqual([]);
  });

  it.each(FILES)('%s declara su cabecera JSDoc de contrato', (file) => {
    expect(audit(file)).toEqual([]);
  });

  it('no deja ningun modulo sin cabecera (informe agregado)', () => {
    const failed = FILES.map((file) => ({ file, problems: audit(file) })).filter(
      (row) => row.problems.length > 0,
    );
    const report = failed.map((row) => `${row.file}: ${row.problems.join('; ')}`).join('\n');
    expect(report).toBe('');
  });
});
