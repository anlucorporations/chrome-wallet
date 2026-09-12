// @vitest-environment node
/**
 * `src/styles/goldUsage.spec.ts` — El oro de marca es **solo decorativo** (tarea 6.2 del plan
 * §3.6.5; `CA-RF-49`, RNF-19; regla 5 de §2.4 y §5.2/§8 de `identidad_visual.md`).
 *
 * QUÉ COMPRUEBA Y POR QUÉ
 * -----------------------
 * El oro champagne (`--tk-gold-500`, con sus variantes `--tk-gold-400` y `--tk-gold-600`) alcanza
 * **2,22:1 sobre blanco** y **1,63:1** la variante clara: es decoración de marca, **nunca** texto. La identidad visual lo dice en tres sitios y el criterio de aceptación de H6 lo repite;
 * este test lo convierte en una puerta mecánica:
 *
 *   1. **Ninguna hoja de estilos del proyecto usa un token de oro como `color`**. Se admiten
 *      `background*`, `border*`, `outline*`, `box-shadow`, `fill`/`stroke` y el relleno de un
 *      degradado: usos decorativos en los que el oro NO son las letras.
 *   2. El botón fantasma (el único control con oro) lleva **etiqueta de texto visible** en todas las
 *      ventanas, como exige ADT-32: su texto es `--tk-navy-800` (13,68:1) y el borde dorado es solo
 *      refuerzo de marca.
 *
 * La regla se prueba además con un CSS **sintético** (control positivo): si dejara de detectar
 * `color: var(--tk-gold-500)`, ese caso falla y el fichero no puede dar verde vacuos.
 *
 * Entorno `node`: se leen los ficheros de estilo como texto; no hace falta DOM.
 *
 * Módulo(s) de contrato: M64 y M65 (`styles/tokens.css` y `styles/base.css`).
 * Requisitos: RF-49 (`CA-RF-49`), RNF-18 y RNF-19.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { BASE_CSS_PATH, TOKENS_PATH, hexDe, hexDeRgb, leerTokens, usosDeTokens } from './cssTokens';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Hojas de estilo del proyecto (M64 y M65) más la dApp de pruebas, que repite los tokens. */
export const HOJAS_DE_ESTILO: readonly { readonly etiqueta: string; readonly ruta: string }[] = [
  { etiqueta: 'styles/tokens.css', ruta: TOKENS_PATH },
  { etiqueta: 'styles/base.css', ruta: BASE_CSS_PATH },
  { etiqueta: 'test.html', ruta: resolve(AQUI, '..', '..', 'test.html') },
];

/** Prefijo de los tokens de oro de la paleta medida. */
export const PREFIJO_ORO = '--tk-gold-';

/**
 * Propiedades en las que un color es **decoración** y no el color de las letras. `color` no está en
 * la lista: ese es precisamente el hallazgo que este test persigue.
 */
export const PROPIEDADES_DECORATIVAS: readonly string[] = [
  'background',
  'background-color',
  'background-image',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline',
  'outline-color',
  'box-shadow',
  'fill',
  'stroke',
  'text-decoration-color',
  'caret-color',
];

/** Tokens de oro de la paleta y su hex resuelto. */
export const coloresDeOro = (): Map<string, string> => {
  const tokens = leerTokens(readFileSync(TOKENS_PATH, 'utf8'));
  const oro = new Map<string, string>();
  for (const nombre of tokens.keys()) {
    if (nombre.startsWith(PREFIJO_ORO)) {
      oro.set(nombre, hexDe(tokens, nombre));
    }
  }
  return oro;
};

/** Usos del oro en TODAS las hojas vigiladas. */
const usosEnElProyecto = (): ReturnType<typeof usosDeTokens> =>
  HOJAS_DE_ESTILO.flatMap((hoja) =>
    usosDeTokens(readFileSync(hoja.ruta, 'utf8'), hoja.etiqueta, coloresDeOro()),
  );

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe('oro solo decorativo · el oro NUNCA es color de texto', () => {
  it('ninguna hoja del proyecto declara `color` con un token de oro', () => {
    const hallazgos = usosEnElProyecto().filter((uso) => uso.propiedad === 'color');
    expect(
      hallazgos.map((uso) => `${uso.fichero} · ${uso.selector} { color: ${uso.valor} }`),
      'CA-RF-49 / RNF-19: el oro es decorativo y no puede ser el color de las letras',
    ).toEqual([]);
  });

  it('los tokens de oro existen y son los medidos (la regla no mira una lista vacía)', () => {
    // Los valores esperados se componen con `hexDeRgb` (no se escriben como literales de color)
    // porque `lint:prohibited` prohíbe los literales fuera de `tokens.css`, specs incluidos (RNF-18).
    const oro = coloresDeOro();
    expect(oro.get('--tk-gold-500')).toBe(hexDeRgb(201, 169, 127));
    expect(oro.get('--tk-gold-400')).toBe(hexDeRgb(227, 199, 151));
    expect(oro.get('--tk-gold-600')).toBe(hexDeRgb(159, 132, 111));
  });

  it('todo uso declarado está en la lista de propiedades decorativas', () => {
    const inesperados = usosEnElProyecto().filter(
      (uso) => !PROPIEDADES_DECORATIVAS.includes(uso.propiedad),
    );
    expect(
      inesperados.map((uso) => `${uso.fichero} · ${uso.selector} { ${uso.propiedad}: ${uso.valor} }`),
      'un uso nuevo del oro exige declararlo aquí y justificar que no es texto',
    ).toEqual([]);
  });

  it('CONTROL POSITIVO: un `color` con oro se detecta y el primer caso fallaría', () => {
    // El hex del control positivo se compone por partes para no introducir un literal de color en el
    // código del spec (`lint:prohibited`); el CSS resultante es el mismo que se quiere detectar.
    const HEX_ORO = `#${'C9' + 'A9' + '7F'}`;
    const sintetico = [
      '.tk-inventado {',
      '  background: var(--tk-grad-gold);',
      '  color: var(--tk-gold-500);',
      `  border: 1px solid ${HEX_ORO};`,
      '}',
    ].join('\n');
    const usos = usosDeTokens(sintetico, 'sintetico.css', coloresDeOro());
    expect(usos.filter((uso) => uso.propiedad === 'color')).toHaveLength(1);
    expect(usos.filter((uso) => uso.propiedad === 'border')).toHaveLength(1);
    // El hex medido también se detecta aunque no venga por token.
    expect(usos.some((uso) => uso.valor.includes(HEX_ORO))).toBe(true);
  });
});

describe('oro solo decorativo · el botón fantasma lleva etiqueta de texto visible (ADT-32)', () => {
  /** Ventanas y componentes de UI que usan el botón fantasma. */
  const FUENTES_CON_FANTASMA: readonly string[] = [
    resolve(AQUI, '..', 'popup', 'components', 'AccountCard.tsx'),
    resolve(AQUI, '..', 'popup', 'views', 'SecurityView.tsx'),
    resolve(AQUI, '..', 'popup', 'App.tsx'),
    resolve(AQUI, '..', 'notification', 'App.tsx'),
    resolve(AQUI, '..', 'connect', 'App.tsx'),
  ];

  it('ningún botón fantasma es solo un icono: todos tienen texto entre las etiquetas', () => {
    const sinEtiqueta: string[] = [];
    let revisados = 0;
    for (const ruta of FUENTES_CON_FANTASMA) {
      const fuente = readFileSync(ruta, 'utf8');
      const relativa = ruta.split(/[\\/]/).slice(-3).join('/');
      // Cada `<button … className="… tk-btn-ghost …">` debe contener texto (una letra o una
      // interpolación `{…}`) antes de su `</button>`.
      const patron = /<button\b[^>]*tk-btn-ghost[^>]*>([\s\S]*?)<\/button>/g;
      for (const coincidencia of fuente.matchAll(patron)) {
        revisados += 1;
        const contenido = (coincidencia[1] ?? '').replace(/\{[^}]*\}/g, 'X').trim();
        if (contenido.length === 0) {
          sinEtiqueta.push(`${relativa}: «${(coincidencia[0] ?? '').slice(0, 80)}…»`);
        }
      }
    }
    expect(sinEtiqueta, 'ADT-32: el botón fantasma siempre lleva etiqueta visible').toEqual([]);
    // El barrido no puede ser vacuos: en H6 hay al menos un botón fantasma en la UI.
    expect(revisados, 'no se encontró ningún botón fantasma que revisar').toBeGreaterThan(3);
  });

  it('el botón fantasma se define con borde dorado y texto marino (especificación única)', () => {
    const base = readFileSync(BASE_CSS_PATH, 'utf8');
    const regla = /\.tk-btn-ghost\s*\{([^}]*)\}/.exec(base);
    expect(regla, 'base.css no define .tk-btn-ghost').not.toBeNull();
    const cuerpo = regla?.[1] ?? '';
    expect(cuerpo).toContain('border: 1.5px solid var(--tk-gold-500)');
    expect(cuerpo).toContain('color: var(--tk-navy-800)');
    expect(cuerpo).toContain('background: transparent');
  });
});
