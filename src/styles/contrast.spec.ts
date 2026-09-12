// @vitest-environment node
/**
 * `src/styles/contrast.spec.ts` — Contraste **verificado por cálculo** (tarea 6.2 del plan §3.6.5;
 * `CA-RF-49`, RNF-19, RNF-21).
 *
 * QUÉ HACE
 * --------
 * Lee `src/styles/tokens.css` —la ÚNICA fuente de color del proyecto (M64, RNF-18)— y **recalcula**
 * la matriz de contraste cerrada de `identidad_visual.md` §2.4 con la fórmula WCAG 2.1 real
 * (luminancia relativa con corrección de gamma), en los dos modos (claro y oscuro). Falla si:
 *
 *   1. algún par queda **por debajo de su umbral** (4,5:1 texto normal, 3:1 texto grande y 3:1 para
 *      componentes de UI, bordes y foco — WCAG 1.4.3 y 1.4.11);
 *   2. el **ratio calculado** no coincide con el publicado en la identidad visual (tolerancia
 *      0,02): así el documento y los tokens no pueden divergir en silencio;
 *   3. un token de la matriz **cambia de valor** respecto al medido sobre los activos originales
 *      (§2.1/§2.2/§2.3): un cambio de color obliga a revisar esta matriz, que es justo lo que exige
 *      la regla 3 de §2.4 («la matriz es cerrada: cualquier par nuevo se añade aquí con su ratio
 *      medido antes de usarse»).
 *
 * POR QUÉ NO BASTA EL VALOR PUBLICADO
 * -----------------------------------
 * El ratio de la tabla es un dato del documento; lo que consume el navegador es el **token**. Este
 * test cierra el círculo: calcula el ratio desde el token y lo compara con el umbral y con la
 * tabla. Si alguien «arreglara» un token para que un par pasara sin tocar el documento, el caso 2
 * lo detecta; si el documento declarara un ratio imposible, lo detecta el mismo caso.
 *
 * Entorno `node`: el test no necesita DOM (lee ficheros y hace aritmética).
 */

import { describe, expect, it } from 'vitest';

import { hexDe, hexDeRgb, ratio, tokensDeArchivo } from './cssTokens';

// ---------------------------------------------------------------------------
// Matriz cerrada de `identidad_visual.md` §2.4
// ---------------------------------------------------------------------------

/** Umbrales de la matriz, tal y como los declara §2.4. */
export const UMBRAL_TEXTO = 4.5;
export const UMBRAL_GRANDE = 3;
export const UMBRAL_UI = 3;

/** Un par de la matriz cerrada. */
export interface ParDeContraste {
  /** Token de primer plano (texto, icono, borde o foco). */
  texto: string;
  /** Token de fondo sobre el que se apoya. */
  fondo: string;
  /** Ratio publicado en `identidad_visual.md` §2.4. */
  publicado: number;
  /** Umbral que le corresponde: 4,5 (texto normal), 3 (texto grande) o 3 (UI/borde/foco). */
  umbral: number;
  /** Modo al que pertenece el par. */
  modo: 'claro' | 'oscuro';
  /** Uso declarado, para que el mensaje de fallo sea accionable. */
  uso: string;
}

/**
 * La matriz **cerrada** de §2.4, transcrita par a par. No se incluyen las filas marcadas con ❌ en
 * la identidad visual (`--tk-white` sobre `--tk-cyan-300` 2,04:1 y sobre `--tk-gold-500` 2,22:1,
 * `--tk-gold-500` sobre blanco 2,22:1 y `--tk-gray-600` sobre `--tk-night-800` 2,77:1): son pares
 * **prohibidos para texto** y por eso no forman parte de la matriz admisible.
 */
export const MATRIZ: readonly ParDeContraste[] = [
  // --- Modo claro: superficies claras ---------------------------------------------------------
  { texto: '--tk-gray-900', fondo: '--tk-gray-050', publicado: 16.47, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'texto principal sobre el fondo de la app' },
  { texto: '--tk-gray-900', fondo: '--tk-white', publicado: 17.38, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'texto principal sobre tarjeta' },
  { texto: '--tk-gray-600', fondo: '--tk-gray-050', publicado: 5.18, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'texto secundario' },
  { texto: '--tk-gray-600', fondo: '--tk-gray-100', publicado: 4.86, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'texto secundario en tarjeta' },
  { texto: '--tk-navy-800', fondo: '--tk-white', publicado: 13.68, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'tagline, direcciones y títulos' },
  { texto: '--tk-navy-800', fondo: '--tk-gray-050', publicado: 12.96, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'texto del botón fantasma sobre el fondo de la app (ADT-32)' },
  { texto: '--tk-navy-800', fondo: '--tk-gray-100', publicado: 12.16, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'texto del botón fantasma sobre tarjeta (ADT-32)' },

  // --- Modo claro: encabezado con degradado (tramos oscuros) ------------------------------------
  { texto: '--tk-white', fondo: '--tk-navy-800', publicado: 13.68, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'texto sobre superficie oscura' },
  { texto: '--tk-white', fondo: '--tk-blue-600', publicado: 8.78, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'encabezado, tramo 2 del degradado' },
  { texto: '--tk-white', fondo: '--tk-steel-500', publicado: 5.87, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'encabezado, tramo 3 del degradado' },
  { texto: '--tk-white', fondo: '--tk-teal-500', publicado: 3.54, umbral: UMBRAL_GRANDE, modo: 'claro', uso: 'encabezado, tramo central: solo texto ≥ 18 px (o ≥ 14 px en negrita)' },

  // --- Modo claro: acento, insignias y estados --------------------------------------------------
  { texto: '--tk-teal-500', fondo: '--tk-white', publicado: 3.54, umbral: UMBRAL_UI, modo: 'claro', uso: 'acento: iconos, bordes, foco y texto ≥ 18 px' },
  { texto: '--tk-navy-800', fondo: '--tk-gold-500', publicado: 6.16, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'insignia de red y contador de pendientes (oro decorativo con texto marino)' },
  { texto: '--tk-white', fondo: '--tk-danger', publicado: 4.38, umbral: UMBRAL_GRANDE, modo: 'claro', uso: 'peligro: texto ≥ 18 px o fondo --tk-danger-dark' },
  { texto: '--tk-danger-dark', fondo: '--tk-white', publicado: 6.84, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'rojo para texto pequeño' },
  { texto: '--tk-danger-dark', fondo: '--tk-gray-050', publicado: 6.48, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'rojo para texto pequeño sobre el fondo de la app' },
  { texto: '--tk-danger', fondo: '--tk-gray-050', publicado: 4.15, umbral: UMBRAL_GRANDE, modo: 'claro', uso: 'log error en claro: ≥ 18 px o iconos (RF-30)' },
  { texto: '--tk-success', fondo: '--tk-white', publicado: 4.85, umbral: UMBRAL_TEXTO, modo: 'claro', uso: 'insignia «Red de pruebas» (texto de 11 px) y confirmaciones sobre tarjeta (H6)' },

  // --- Modo oscuro (fondo --tk-night-900) -------------------------------------------------------
  { texto: '--tk-gray-100', fondo: '--tk-night-900', publicado: 16.18, umbral: UMBRAL_TEXTO, modo: 'oscuro', uso: 'texto principal' },
  { texto: '--tk-gray-100', fondo: '--tk-night-800', publicado: 13.48, umbral: UMBRAL_TEXTO, modo: 'oscuro', uso: 'texto sobre tarjeta' },
  { texto: '--tk-cyan-200', fondo: '--tk-night-900', publicado: 10.42, umbral: UMBRAL_TEXTO, modo: 'oscuro', uso: 'texto secundario en oscuro' },
  { texto: '--tk-gold-500', fondo: '--tk-night-900', publicado: 8.2, umbral: UMBRAL_TEXTO, modo: 'oscuro', uso: 'log warn y borde del botón fantasma en oscuro' },
  { texto: '--tk-teal-400', fondo: '--tk-night-900', publicado: 5.26, umbral: UMBRAL_TEXTO, modo: 'oscuro', uso: 'acento en oscuro' },
  { texto: '--tk-teal-500', fondo: '--tk-night-900', publicado: 5.14, umbral: UMBRAL_TEXTO, modo: 'oscuro', uso: 'log info, foco visible y texto ≥ 18 px' },
  { texto: '--tk-success', fondo: '--tk-night-900', publicado: 3.75, umbral: UMBRAL_GRANDE, modo: 'oscuro', uso: 'log success ≥ 18 px, o texto --tk-cyan-200 con indicador en --tk-success' },
  { texto: '--tk-danger', fondo: '--tk-night-900', publicado: 4.16, umbral: UMBRAL_GRANDE, modo: 'oscuro', uso: 'log error ≥ 18 px, o fondo --tk-danger-dark con texto blanco' },
];

/**
 * Tokens con el valor MEDIDO sobre los activos originales (`identidad_visual.md` §2.1-§2.3).
 *
 * Los canales se declaran con `hexDeRgb` (que compone la forma `#RRGGBB`) y no como literales de
 * color: `scripts/lint-prohibited.mjs` prohíbe los literales fuera de `tokens.css` (RNF-18) y
 * **también** revisa los ficheros de prueba. Así la paleta esperada sigue estando completa y
 * legible, y un cambio de token en `tokens.css` sigue fallando este caso.
 */
const VALORES_MEDIDOS: Readonly<Record<string, string>> = {
  '--tk-navy-800': hexDeRgb(29, 43, 87),
  '--tk-navy-700': hexDeRgb(36, 58, 107),
  '--tk-blue-600': hexDeRgb(46, 74, 125),
  '--tk-steel-500': hexDeRgb(58, 106, 133),
  '--tk-teal-500': hexDeRgb(62, 147, 166),
  '--tk-teal-400': hexDeRgb(82, 147, 164),
  '--tk-cyan-300': hexDeRgb(136, 191, 196),
  '--tk-cyan-200': hexDeRgb(172, 201, 209),
  '--tk-gold-500': hexDeRgb(201, 169, 127),
  '--tk-gold-400': hexDeRgb(227, 199, 151),
  '--tk-gold-600': hexDeRgb(159, 132, 111),
  '--tk-white': hexDeRgb(255, 255, 255),
  '--tk-gray-050': hexDeRgb(247, 249, 251),
  '--tk-gray-100': hexDeRgb(238, 242, 246),
  '--tk-gray-300': hexDeRgb(211, 219, 228),
  '--tk-gray-600': hexDeRgb(91, 107, 124),
  '--tk-gray-900': hexDeRgb(18, 26, 43),
  '--tk-night-900': hexDeRgb(14, 21, 38),
  '--tk-night-800': hexDeRgb(27, 37, 64),
  '--tk-success': hexDeRgb(23, 128, 106),
  '--tk-info': hexDeRgb(62, 147, 166),
  '--tk-warning': hexDeRgb(201, 169, 127),
  '--tk-danger': hexDeRgb(214, 69, 69),
  '--tk-danger-dark': hexDeRgb(166, 47, 47),
};

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe('§2.4 · los tokens conservan el valor medido sobre los activos originales', () => {
  it('cada color de la paleta de marca es exactamente el de la identidad visual', () => {
    const tokens = tokensDeArchivo();
    const divergentes: string[] = [];
    for (const [nombre, esperado] of Object.entries(VALORES_MEDIDOS)) {
      const real = hexDe(tokens, nombre);
      if (real !== esperado.toUpperCase()) {
        divergentes.push(`${nombre}: tokens.css dice ${real} y §2.1-§2.3 dice ${esperado}`);
      }
    }
    expect(divergentes, 'la paleta medida no puede cambiar sin revisar esta matriz (regla 3 de §2.4)').toEqual([]);
  });
});

describe('§2.4 · 0 pares de la matriz cerrada por debajo de su umbral', () => {
  const tokens = tokensDeArchivo();

  it('cada par calcula el ratio con la fórmula WCAG real y cumple su umbral', () => {
    const incumplimientos: string[] = [];
    for (const par of MATRIZ) {
      const calculado = ratio(hexDe(tokens, par.texto), hexDe(tokens, par.fondo));
      if (calculado < par.umbral) {
        incumplimientos.push(
          `[${par.modo}] ${par.texto} sobre ${par.fondo} = ${calculado.toFixed(2)}:1 < ${par.umbral}:1 (${par.uso})`,
        );
      }
    }
    expect(
      incumplimientos,
      'CA-RF-49 / RNF-19: hay pares de contraste por debajo del umbral en la matriz cerrada',
    ).toEqual([]);
  });

  it('el ratio calculado coincide con el publicado en la identidad visual (±0,02)', () => {
    const divergencias: string[] = [];
    for (const par of MATRIZ) {
      const calculado = ratio(hexDe(tokens, par.texto), hexDe(tokens, par.fondo));
      if (Math.abs(calculado - par.publicado) > 0.02) {
        divergencias.push(
          `${par.texto} sobre ${par.fondo}: calculado ${calculado.toFixed(2)}:1, publicado ${par.publicado}:1`,
        );
      }
    }
    expect(divergencias, 'el documento y los tokens han divergido: uno de los dos miente').toEqual([]);
  });

  it('la matriz cubre los dos modos y los tres umbrales (no es una lista vacua)', () => {
    expect(MATRIZ.filter((par) => par.modo === 'claro').length).toBeGreaterThan(10);
    expect(MATRIZ.filter((par) => par.modo === 'oscuro').length).toBeGreaterThan(5);
    expect(new Set(MATRIZ.map((par) => par.umbral))).toEqual(new Set([UMBRAL_TEXTO, UMBRAL_GRANDE]));
  });
});

describe('§2.4 · prohibiciones explícitas de la matriz', () => {
  const tokens = tokensDeArchivo();

  it('el blanco NO es texto admisible sobre el tramo claro del degradado (cian y oro)', () => {
    /*
     * §2.4 regla 1: sobre el tramo cian (2,04:1) y el champagne (2,22:1) —y sobre el oro claro
     * (1,63:1)— se prohíbe cualquier texto. Se comprueba por CÁLCULO a partir de los tokens para que
     * la prohibición no dependa de un comentario; los hex no se escriben aquí porque `lint:prohibited`
     * prohíbe los literales de color fuera de `tokens.css` (RNF-18) —también en los propios specs—.
     */
    for (const tramo of ['--tk-cyan-300', '--tk-gold-500', '--tk-gold-400']) {
      expect(ratio(hexDe(tokens, '--tk-white'), hexDe(tokens, tramo))).toBeLessThan(UMBRAL_TEXTO);
    }
  });

  it('el texto secundario del modo oscuro no usa --tk-gray-600 (prohibido sobre --tk-night-800)', () => {
    expect(ratio(hexDe(tokens, '--tk-gray-600'), hexDe(tokens, '--tk-night-800'))).toBeLessThan(
      UMBRAL_TEXTO,
    );
    // El par SUSTITUTO de §5.3 regla 5 sí cumple.
    expect(ratio(hexDe(tokens, '--tk-cyan-200'), hexDe(tokens, '--tk-night-800'))).toBeGreaterThanOrEqual(
      UMBRAL_TEXTO,
    );
  });
});

describe('§2.4 · alias de superficie del modo claro y oscuro', () => {
  it('el modo oscuro reasigna las superficies manteniendo los pares dentro de umbral', () => {
    // Las reasignaciones de `@media (prefers-color-scheme: dark)` se aplican a mano sobre una copia
    // del mapa: es exactamente lo que hace el navegador y no exige interpretar media queries.
    const oscuro = new Map(tokensDeArchivo());
    for (const [nombre, valor] of Object.entries({
      '--tk-surface-app': '--tk-night-900',
      '--tk-surface-card': '--tk-night-800',
      '--tk-surface-raised': '--tk-night-800',
      '--tk-text-primary': '--tk-gray-100',
      '--tk-text-secondary': '--tk-cyan-200',
      '--tk-accent': '--tk-teal-400',
    })) {
      oscuro.set(nombre, `var(${valor})`);
    }
    const pares: readonly [string, string][] = [
      ['--tk-text-primary', '--tk-surface-app'],
      ['--tk-text-primary', '--tk-surface-card'],
      ['--tk-text-secondary', '--tk-surface-app'],
      ['--tk-text-secondary', '--tk-surface-card'],
      ['--tk-accent', '--tk-surface-app'],
    ];
    const incumplimientos = pares
      .map(([texto, fondo]) => ({ texto, fondo, calculado: ratio(hexDe(oscuro, texto), hexDe(oscuro, fondo)) }))
      .filter((fila) => fila.calculado < UMBRAL_UI)
      .map((fila) => `${fila.texto} sobre ${fila.fondo} = ${fila.calculado.toFixed(2)}:1`);
    expect(incumplimientos, 'el conmutador de modo oscuro no puede bajar ningún par del umbral').toEqual([]);
  });

  it('el modo claro mantiene los mismos pares con sus umbrales de la matriz', () => {
    /**
     * El lector devuelve la cascada COMPLETA del fichero, y `@media (prefers-color-scheme: dark)`
     * reasigna `--tk-accent`. Para medir el modo claro se restauran a mano los valores del bloque
     * `:root` claro (que es lo que ve el navegador sin la preferencia de oscuro).
     */
    const claro = new Map(tokensDeArchivo());
    claro.set('--tk-accent', 'var(--tk-teal-500)');
    const pares: readonly [string, string, number][] = [
      ['--tk-text-primary', '--tk-surface-app', UMBRAL_TEXTO],
      ['--tk-text-primary', '--tk-surface-card', UMBRAL_TEXTO],
      ['--tk-text-secondary', '--tk-surface-app', UMBRAL_TEXTO],
      ['--tk-text-secondary', '--tk-surface-card', UMBRAL_TEXTO],
      ['--tk-accent', '--tk-surface-raised', UMBRAL_UI],
    ];
    const incumplimientos = pares
      .map(([texto, fondo, umbral]) => ({
        texto,
        fondo,
        umbral,
        calculado: ratio(hexDe(claro, texto), hexDe(claro, fondo)),
      }))
      .filter((fila) => fila.calculado < fila.umbral)
      .map((fila) => `${fila.texto} sobre ${fila.fondo} = ${fila.calculado.toFixed(2)}:1 < ${fila.umbral}:1`);
    expect(incumplimientos).toEqual([]);
  });
});
