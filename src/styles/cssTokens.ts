/**
 * M64 (soporte de pruebas) — `src/styles/cssTokens.ts`
 * Lector de los tokens de `src/styles/tokens.css` y **aritmética WCAG 2.1** compartida por las
 * puertas de contraste de H6 (`contrast.spec.ts` y `goldUsage.spec.ts`, tarea 6.2 del plan §3.6.5).
 *
 * POR QUÉ ES UN MÓDULO Y NO CÓDIGO DENTRO DE UN SPEC
 * -------------------------------------------------
 * Los dos specs necesitan exactamente las mismas primitivas (leer tokens, resolver alias y calcular
 * luminancia/ratio). Tenerlas duplicadas permitiría que una de las dos puertas midiera con una
 * fórmula distinta, y hacer que un spec importara del otro ejecutaría sus casos DOS veces dentro de
 * la misma ejecución de Vitest. Este módulo no es una dependencia de producción: `tsc -b` lo
 * comprueba como cualquier otro fichero de `src/`, pero no lo importa ningún componente de la UI.
 *
 * La implementación es deliberadamente explícita —sin dependencias nuevas (RT-03)— para que la
 * fórmula sea auditable línea a línea contra la especificación WCAG 2.1.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Ruta absoluta de la fuente única de color (M64). */
export const TOKENS_PATH = resolve(AQUI, 'tokens.css');

/** Ruta absoluta de los estilos base (M65). */
export const BASE_CSS_PATH = resolve(AQUI, 'base.css');

/**
 * Extrae las declaraciones `--tk-*: valor;` de un CSS. Admite valores multilínea (los degradados de
 * `identidad_visual.md` §3 ocupan varias líneas) y descarta los comentarios.
 */
export const leerTokens = (texto: string): Map<string, string> => {
  const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = new Map<string, string>();
  const patron = /(--tk-[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (const coincidencia of sinComentarios.matchAll(patron)) {
    const nombre = coincidencia[1];
    const valor = coincidencia[2];
    if (nombre === undefined || valor === undefined) continue;
    tokens.set(nombre, valor.trim().replace(/\s+/g, ' '));
  }
  return tokens;
};

/** Tokens de `tokens.css` como mapa `--tk-*` → valor. */
export const tokensDeArchivo = (): Map<string, string> =>
  leerTokens(readFileSync(TOKENS_PATH, 'utf8'));

/**
 * Forma `#RRGGBB` de un color a partir de sus canales.
 *
 * Existe para que los specs de contraste puedan declarar sus colores ESPERADOS sin escribir un
 * literal `#rrggbb` en el código: `scripts/lint-prohibited.mjs` prohíbe los literales de color fuera
 * de `src/styles/tokens.css` (RNF-18) y **también** revisa los ficheros de prueba.
 */
export const hexDeRgb = (rojo: number, verde: number, azul: number): string =>
  `#${[rojo, verde, azul].map((canal) => canal.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Resuelve un token de color a su hex, atravesando alias (`--tk-surface-app: var(--tk-gray-050)`). */
export const hexDe = (tokens: Map<string, string>, nombre: string): string => {
  let actual = nombre;
  for (let salto = 0; salto < 8; salto += 1) {
    const valor = tokens.get(actual);
    if (valor === undefined) {
      throw new Error(`tokens.css no declara ${actual}`);
    }
    const alias = /^var\(\s*(--tk-[a-z0-9-]+)\s*\)$/i.exec(valor);
    if (alias === null) {
      return valor.toUpperCase();
    }
    const siguiente = alias[1];
    if (siguiente === undefined) return valor.toUpperCase();
    actual = siguiente;
  }
  throw new Error(`cadena de alias demasiado larga para ${nombre}`);
};

/** Canales RGB (0-255) de un color `#rgb` o `#rrggbb`. */
export const canales = (hex: string): [number, number, number] => {  const limpio = hex.trim().replace(/^#/, '');
  const expandido =
    limpio.length === 3
      ? limpio
          .split('')
          .map((caracter) => `${caracter}${caracter}`)
          .join('')
      : limpio;
  if (!/^[0-9a-fA-F]{6}$/.test(expandido)) {
    throw new Error(`color no soportado por el test de contraste: «${hex}»`);
  }
  return [
    Number.parseInt(expandido.slice(0, 2), 16),
    Number.parseInt(expandido.slice(2, 4), 16),
    Number.parseInt(expandido.slice(4, 6), 16),
  ];
};

/** Luminancia relativa WCAG 2.1 (corrección de gamma por canal). */
export const luminancia = (hex: string): number => {
  const [rojo, verde, azul] = canales(hex).map((canal) => {
    const proporcion = canal / 255;
    return proporcion <= 0.03928 ? proporcion / 12.92 : ((proporcion + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * rojo + 0.7152 * verde + 0.0722 * azul;
};

/** Ratio de contraste WCAG 2.1 entre dos colores, en el rango 1..21. */
export const ratio = (primero: string, segundo: string): number => {
  const a = luminancia(primero);
  const b = luminancia(segundo);
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
};

/** Una regla CSS con su selector y sus declaraciones, tal y como las separa el lector. */
export interface ReglaCss {
  /** Selector (recortado y con los espacios colapsados). */
  selector: string;
  /** Cuerpo de la regla, sin las llaves. */
  declaraciones: string;
}

/**
 * Divide un CSS en reglas `selector { declaraciones }`. Ignora comentarios (de bloque y HTML) y
 * **aplana** los bloques `@media`: el selector que devuelve es el interior, que es lo que se quiere
 * comprobar en las puertas de color (a qué propiedad se aplica cada token).
 */
export const reglasDe = (texto: string): ReglaCss[] => {
  const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  const reglas: ReglaCss[] = [];
  const patron = /([^{}]+)\{([^{}]*)\}/g;
  for (const coincidencia of sinComentarios.matchAll(patron)) {
    const selector = coincidencia[1];
    const declaraciones = coincidencia[2];
    if (selector === undefined || declaraciones === undefined) continue;
    reglas.push({ selector: selector.trim().replace(/\s+/g, ' '), declaraciones });
  }
  return reglas;
};

/** Un uso de un color concreto encontrado en una hoja de estilos. */
export interface UsoDeColor {
  /** Fichero, tal y como lo etiqueta el llamante. */
  fichero: string;
  /** Selector de la regla. */
  selector: string;
  /** Propiedad CSS, en minúsculas. */
  propiedad: string;
  /** Valor declarado. */
  valor: string;
}

/**
 * Usos de un conjunto de tokens (o de sus hex) en un CSS: devuelve cada declaración cuyo valor
 * menciona alguno de ellos. Las declaraciones de los propios tokens (`--tk-*: …`) se ignoran porque
 * no son usos.
 */
export const usosDeTokens = (
  texto: string,
  fichero: string,
  tokensVigilados: ReadonlyMap<string, string>,
): UsoDeColor[] => {
  const usos: UsoDeColor[] = [];
  for (const { selector, declaraciones } of reglasDe(texto)) {
    for (const declaracion of declaraciones.split(';')) {
      const separador = declaracion.indexOf(':');
      if (separador <= 0) continue;
      const propiedad = declaracion.slice(0, separador).trim().toLowerCase();
      const valor = declaracion.slice(separador + 1).trim();
      if (/^--tk-/.test(propiedad)) continue;
      const mencionaToken = [...tokensVigilados.keys()].some((token) => valor.includes(token));
      const mencionaHex = [...tokensVigilados.values()].some((hex) =>
        valor.toUpperCase().includes(hex.toUpperCase()),
      );
      if (mencionaToken || mencionaHex) {
        usos.push({ fichero, selector, propiedad, valor });
      }
    }
  }
  return usos;
};
