/**
 * `src/shared/naming.spec.ts` — Nomenclatura e identidad estable del paquete (§3.1.7).
 *
 * Verifica, contra el código y contra el corpus documental:
 *   - `PROVIDER_UUID` es un UUID v4 LITERAL y congelado (nunca generado en runtime);
 *   - el prefijo canónico `truekeate_` cubre las 14 claves de almacén y los nombres de puerto
 *     y alarma, y las 14 claves coinciden con las entidades de `diccionario_datos.md` §2;
 *   - los 8 tipos de mensaje `TRUEKEATE_*`/`*_RESPONSE`/`RESUME` (ADT-29);
 *   - el catálogo cerrado de 24 eventos de `diccionario_datos.md` §2.11 coincide con el tipo
 *     `LogEventName` de `src/shared/types.ts`;
 *   - el prefijo heredado del intento previo (DEC-09) aparece 0 veces en `src/`;
 *   - `EXTENSION_ID` se deriva de la `key` del manifest: el ID es reproducible (D-N / ADT-19).
 *
 * Nota de implementación: el prefijo heredado se construye por concatenación para que ESTE
 * fichero no contenga su literal (si lo contuviera, el propio `lint:prohibited` —y la
 * comprobación de la lista de coincidencias— fallarían por el test que lo persigue).
 *
 * Módulo(s) de contrato: M1, M55, M57 y M64.
 * Requisitos: RT-13 (RNF-01, RNF-20).
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  APPROVAL_PORT_NAME,
  EXPIRE_ALARM_PREFIX,
  PROVIDER_NAME,
  PROVIDER_RDNS,
  PROVIDER_UUID,
  PROVIDER_WINDOW_ALIAS,
  PROVIDER_WINDOW_KEY,
} from './constants';
import {
  CANONICAL_STORAGE_KEYS,
  STORAGE_KEYS,
  STORAGE_KEY_PREFIX,
  hasCanonicalPrefix,
} from '../background/state/schema';
import { TRUEKEATE_MESSAGE_TYPES, isTruekeateMessageType } from './protocol';
import { EXTENSION_ID, MANIFEST_KEY, manifest } from '../manifest';

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SPEC_DIR, '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const DICCIONARIO = join(REPO_ROOT, 'RepoTecnico', 'diccionario_datos.md');

/** Prefijo heredado prohibido, construido por concatenación (ver nota de cabecera). */
const PREFIJO_HEREDADO = ['codecrypto', '_'].join('');

/** Los 8 tipos de mensaje del protocolo interno (ADT-29). */
const TIPOS_ESPERADOS = [
  'TRUEKEATE_REQUEST',
  'TRUEKEATE_RESPONSE',
  'TRUEKEATE_EVENT',
  'TRUEKEATE_ANNOUNCE',
  'TRUEKEATE_RPC',
  'SIGN_RESPONSE',
  'CONNECT_RESPONSE',
  'RESUME',
];

/** Extensiones de texto propias que se revisan al buscar el prefijo heredado. */
const EXTENSIONES_TEXTO = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html']);

/** Recorre `src/` y devuelve los ficheros de texto con su ruta relativa. */
function ficherosDeTexto(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules') continue;
      encontrados.push(...ficherosDeTexto(completo));
    } else if (entrada.isFile() && EXTENSIONES_TEXTO.has(extname(entrada.name))) {
      encontrados.push(completo);
    }
  }
  return encontrados;
}

/** Líneas del diccionario de datos. */
const LINEAS_DICCIONARIO = readFileSync(DICCIONARIO, 'utf8').split(/\r?\n/);

/** Índice (0-based) de la primera línea que casa con el patrón, o `-1`. */
const indiceDeLinea = (patron: RegExp): number => LINEAS_DICCIONARIO.findIndex((linea) => patron.test(linea));

// ---------------------------------------------------------------------------
// Identidad EIP-6963 y UUID congelado (CA-RT-13 / D-A / ADT-19)
// ---------------------------------------------------------------------------

describe('Identidad EIP-6963 y UUID congelado (CA-RT-13)', () => {
  it('publica `name` y `rdns` literales y un UUID v4 congelado', () => {
    expect(PROVIDER_NAME).toBe('TrueKeate');
    expect(PROVIDER_RDNS).toBe('academy.codecrypto.truekeate');
    expect(PROVIDER_UUID).toBe('9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90');
    expect(PROVIDER_UUID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('escribe el UUID como LITERAL en la fuente y no lo genera en runtime', () => {
    const constantes = readFileSync(join(SRC_DIR, 'shared', 'constants.ts'), 'utf8');
    expect(constantes).toContain(PROVIDER_UUID);
    for (const relativo of ['shared/constants.ts', 'inject/provider.ts', 'inject/eip6963.ts']) {
      const fuente = readFileSync(join(SRC_DIR, relativo), 'utf8');
      expect(fuente, `${relativo} no puede generar el UUID en runtime`).not.toMatch(/randomUUID/);
    }
  });

  it('expone el alias de ventana del mismo provider sin prefijo heredado', () => {
    expect(PROVIDER_WINDOW_KEY).toBe('truekeate');
    expect(PROVIDER_WINDOW_ALIAS).toBe('codecrypto');
    expect(PROVIDER_WINDOW_ALIAS).not.toContain(PREFIJO_HEREDADO);
  });
});

// ---------------------------------------------------------------------------
// Prefijo canónico truekeate_
// ---------------------------------------------------------------------------

describe('Prefijo canónico `truekeate_` (ACU-25 / RT-13)', () => {
  it('cubre las 14 claves de almacén declaradas', () => {
    expect(STORAGE_KEY_PREFIX).toBe('truekeate_');
    expect(CANONICAL_STORAGE_KEYS).toHaveLength(14);
    expect(new Set(CANONICAL_STORAGE_KEYS).size).toBe(14);
    expect(Object.keys(STORAGE_KEYS)).toHaveLength(14);
    for (const clave of CANONICAL_STORAGE_KEYS) {
      expect(hasCanonicalPrefix(clave), `clave sin prefijo canónico: ${clave}`).toBe(true);
      expect(Object.values(STORAGE_KEYS)).toContain(clave);
    }
  });

  it('coincide exactamente con las entidades de `diccionario_datos.md` §2.1..§2.14', () => {
    const clavesDelDiccionario: string[] = [];
    for (const linea of LINEAS_DICCIONARIO) {
      const coincide = /^### 2\.\d+ `(truekeate_[a-z_]+)`/.exec(linea);
      if (coincide?.[1] !== undefined) clavesDelDiccionario.push(coincide[1]);
    }
    expect(clavesDelDiccionario).toHaveLength(14);
    expect([...CANONICAL_STORAGE_KEYS].sort()).toEqual([...clavesDelDiccionario].sort());
  });

  it('cubre el puerto de larga vida y el prefijo de las alarmas de vencimiento', () => {
    expect(APPROVAL_PORT_NAME).toBe('truekeate_approval');
    expect(EXPIRE_ALARM_PREFIX).toBe('truekeate_expire:');
    expect(APPROVAL_PORT_NAME.startsWith(STORAGE_KEY_PREFIX)).toBe(true);
    expect(EXPIRE_ALARM_PREFIX.startsWith(STORAGE_KEY_PREFIX)).toBe(true);
  });

  it('no conserva el prefijo heredado en ningún fichero de `src/` (0 coincidencias)', () => {
    const hallazgos: string[] = [];
    for (const fichero of ficherosDeTexto(SRC_DIR)) {
      const contenido = readFileSync(fichero, 'utf8');
      if (contenido.includes(PREFIJO_HEREDADO)) {
        hallazgos.push(fichero.replace(`${REPO_ROOT}\\`, '').replace(`${REPO_ROOT}/`, ''));
      }
    }
    expect(hallazgos, `ficheros con el prefijo heredado: ${hallazgos.join(', ')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tipos de mensaje y catálogo de eventos
// ---------------------------------------------------------------------------

describe('Tipos `TRUEKEATE_*` y catálogo de eventos (ADT-29 / RNF-16)', () => {
  it('declara los 8 tipos de mensaje en MAYÚSCULAS_SNAKE_CASE', () => {
    expect([...TRUEKEATE_MESSAGE_TYPES]).toEqual(TIPOS_ESPERADOS);
    for (const tipo of TRUEKEATE_MESSAGE_TYPES) {
      expect(tipo).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(isTruekeateMessageType(tipo)).toBe(true);
    }
    expect(isTruekeateMessageType('rpc_call')).toBe(false);
    expect(isTruekeateMessageType(undefined)).toBe(false);
  });

  it('mantiene los 24 eventos de `diccionario_datos.md` §2.11 idénticos a `LogEventName`', () => {
    const cabecera = indiceDeLinea(/Enum `event` — catálogo cerrado de 24 eventos/);
    expect(cabecera, 'no se localizó el enum de eventos en diccionario_datos.md §2.11').toBeGreaterThan(0);

    // La lista del diccionario es la primera línea posterior con EXACTAMENTE 24 nombres.
    let eventosDiccionario: string[] = [];
    for (let i = cabecera + 1; i < LINEAS_DICCIONARIO.length; i += 1) {
      const linea = LINEAS_DICCIONARIO[i] ?? '';
      const nombres = [...linea.matchAll(/`([a-z][a-z0-9_]*)`/g)]
        .map((coincide) => coincide[1])
        .filter((nombre): nombre is string => nombre !== undefined);
      if (nombres.length === 24) {
        eventosDiccionario = nombres;
        break;
      }
      if (linea.trim() === '' && i > cabecera + 3) break;
    }
    expect(eventosDiccionario).toHaveLength(24);

    const tipos = readFileSync(join(SRC_DIR, 'shared', 'types.ts'), 'utf8');
    const union = /export type LogEventName =([\s\S]*?);/.exec(tipos);
    expect(union?.[1], 'no se localizó la unión LogEventName en src/shared/types.ts').toBeDefined();
    const eventosFuente = [...(union?.[1] ?? '').matchAll(/'([a-z][a-z0-9_]*)'/g)]
      .map((coincide) => coincide[1])
      .filter((nombre): nombre is string => nombre !== undefined);

    expect(eventosFuente).toHaveLength(24);
    expect(new Set(eventosFuente).size).toBe(24);
    expect([...eventosFuente].sort()).toEqual([...eventosDiccionario].sort());
  });
});

// ---------------------------------------------------------------------------
// ID estable de la extensión
// ---------------------------------------------------------------------------

describe('ID estable de la extensión derivado de la `key` (D-N / ADT-19)', () => {
  it('deriva `EXTENSION_ID` del SHA-256 de la clave DER (nibble → a-p, 16 bytes)', () => {
    const der = Buffer.from(MANIFEST_KEY, 'base64');
    expect(der.length).toBeGreaterThan(0);
    const hash = createHash('sha256').update(der).digest();
    let derivado = '';
    for (let i = 0; i < 16; i += 1) {
      const byte = hash[i] ?? 0;
      derivado += String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 0x0f));
    }
    expect(derivado).toBe(EXTENSION_ID);
    expect(EXTENSION_ID).toMatch(/^[a-p]{32}$/);
  });

  it('congela la `key` en la fuente del manifest y la declara en el manifest exportado', () => {
    expect(manifest.key).toBe(MANIFEST_KEY);
    const fuente = readFileSync(join(SRC_DIR, 'manifest.ts'), 'utf8');
    expect(fuente).toContain(MANIFEST_KEY);
    expect(fuente).toContain(EXTENSION_ID);
  });
});

// ---------------------------------------------------------------------------
// Ampliación H3 (tarea 3.15): identidad EIP-6963 que publica el provider
// ---------------------------------------------------------------------------

describe('H3 · la identidad del anuncio sale de las constantes congeladas (CA-RF-45)', () => {
  it('`providerInfo` publica exactamente los 4 campos vinculantes de RT-13', async () => {
    const { providerInfo } = await import('../inject/provider');
    const info = providerInfo('data:image/png;base64,AAAA');
    expect(info).toEqual({
      uuid: PROVIDER_UUID,
      name: PROVIDER_NAME,
      icon: 'data:image/png;base64,AAAA',
      rdns: PROVIDER_RDNS,
    });
    // Ni un campo de más: el `detail` del anuncio es `{ info, provider }` y nada más.
    expect(Object.keys(info).sort()).toEqual(['icon', 'name', 'rdns', 'uuid']);
  });

  it('el entry publica el provider y su alias con el MISMO descriptor no configurable', () => {
    const fuente = readFileSync(join(SRC_DIR, 'inject', 'index.ts'), 'utf8');
    expect(fuente).toContain('Object.defineProperty(window, PROVIDER_WINDOW_KEY');
    expect(fuente).toContain('Object.defineProperty(window, PROVIDER_WINDOW_ALIAS');
    expect(fuente).toContain('writable: false');
    expect(fuente).toContain('configurable: false');
  });
});
