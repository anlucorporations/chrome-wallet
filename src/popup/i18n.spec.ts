// @vitest-environment node
/**
 * `src/popup/i18n.spec.ts` — `CA-RT-10` (idioma de la UI) **reformulado** al cerrar H2.
 *
 * QUÉ CAMBIA Y POR QUÉ (defecto `D-H2-A`, causa raíz documentada en el plan §3.2.10)
 * -----------------------------------------------------------------------------------
 * La evidencia original del criterio era
 * `grep -rniE "(send|cancel|copy|confirm)" src/popup` → 0 coincidencias. Ese `grep` no distingue
 * **texto visible** de **identificador de código**: marca `chrome.runtime.sendMessage`,
 * `{ confirm: true }` o la palabra española «confirmación» (subcadena `confirm`) y, en cambio, no
 * exige nada verificable sobre lo que el usuario lee. Empujó a ofuscar el API real
 * (`Reflect.get(chrome.runtime, 'pos' + 'tMessage')`), que NO existe en MV3: el popup dejó de
 * poder hablar con el Service Worker. Además el literal del comando ya daba coincidencias en
 * `src/popup` (los comentarios de `SecurityView` dicen «confirmación»), es decir, **no era
 * reproducible**.
 *
 * REGLA VIGENTE (la que comprueba este fichero)
 * -----------------------------------------------------------------------------------
 * *Ninguna cadena VISIBLE para el usuario de `src/popup`, `src/connect` y `src/notification` puede
 * contener las palabras inglesas `send`, `cancel`, `copy`, `confirm` o `settings`.*
 *
 * "Visible" se decide con el AST de TypeScript, no con un `grep`:
 *   · nodos de **texto JSX** (`<p>Send</p>`), sus **atributos literales** (`aria-label`,
 *     `title`, `placeholder`) y las **plantillas** con interpolación;
 *   · **literales de cadena** (etiquetas de botón, mensajes de error y avisos).
 * Quedan **exentos** —y por eso se declaran estructuralmente, no con una lista negra de ficheros—
 * los identificadores que NO son texto: especificadores de import, nombres de propiedad
 * (`{ confirm: true }`, `chrome.runtime['sendMessage']`), accesos a propiedades del API
 * (`chrome.runtime.sendMessage`), tipos literales, argumentos de `callInternal` (nombres de
 * método del protocolo) y cualquier literal con prefijo canónico `wallet_`/`eth_`/`TRUEKEATE_`/…
 *
 * La comparación usa **límites de palabra** (`\bsend\b`): así «Confirmación», «Cancelar» o
 * «Configuración» —español correcto— no disparan un falso positivo, que es exactamente el error
 * que cometía el comando anterior.
 *
 * El caso 1 es un **control positivo** (una cadena inglesa inventada se detecta) y el caso 2 un
 * **control de no-regresión** (los identificadores que provocaron `D-H2-A` no se marcan). Sin
 * ellos, un fichero de pruebas vacuo daría verde para siempre.
 *
 * Módulo(s) de contrato: M39 y M62.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Configuración de la regla
// ---------------------------------------------------------------------------

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio (`…/chrome-wallet`). */
const RAIZ = resolve(AQUI, '..', '..');

/** Directorios de UI cubiertos por `CA-RT-10` (RF-34). */
const DIRECTORIOS_UI = ['src/popup', 'src/connect', 'src/notification'] as const;

/**
 * Palabras de UI que no pueden aparecer en texto visible. Con límites de palabra: `sendMessage`
 * o `confirmación` no coinciden, `Send` y `Confirm` sí.
 */
const PALABRAS_INGLESAS = /\b(send|cancel|copy|confirm|settings)\b/i;

/** Prefijos canónicos de identificadores del protocolo o del API (no son texto visible). */
const PREFIJOS_API = /^(wallet_|eth_|personal_|TRUEKEATE_|SIGN_|CONNECT_|RESUME$|tk-|0x)/i;

/**
 * Forma de un identificador de código (kebab-case, snake_case o con puntos): `reveal-not-confirmed`,
 * `tk-copy-button`, `eth_sendRawTransaction`. Un texto VISIBLE de la UI nunca tiene esta forma
 * (siempre es lenguaje natural, con espacios o una sola palabra), así que se exime.
 */
const FORMA_IDENTIFICADOR = /^[a-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)+$/;

/**
 * Exenciones declaradas una a una, con su motivo. Está VACÍA a propósito: la regla prefiere
 * fallar de más (y obligar a declarar la excepción) antes que ignorar en silencio un texto
 * candidato a ser visible. Si en un hito futuro aparece un literal de código de una sola palabra
 * inglesa (`'settings'` como valor, p. ej.), se añade aquí con su justificación.
 */
const EXENCIONES: readonly string[] = [];

/** Extensiones que se analizan. */
const EXTENSIONES_UI = new Set(['.ts', '.tsx']);

/** Hallazgo de la regla, con su ubicación exacta para poder citarla en el informe. */
export interface HallazgoTexto {
  /** Ruta relativa a la raíz del repositorio. */
  fichero: string;
  /** Línea 1..n. */
  linea: number;
  /** Columna 1..n. */
  columna: number;
  /** Palabra inglesa encontrada. */
  palabra: string;
  /** Texto completo del nodo (recortado). */
  texto: string;
  /** De dónde sale el texto: `texto JSX`, `literal de cadena` o `plantilla`. */
  contexto: string;
}

// ---------------------------------------------------------------------------
// Recorrido del AST
// ---------------------------------------------------------------------------

/** ¿El literal es un identificador del API o del protocolo, y por tanto NO texto visible? */
const esIdentificadorDeCodigo = (
  literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
): boolean => {
  const padre: ts.Node | undefined = literal.parent;
  if (padre === undefined) {
    return PREFIJOS_API.test(literal.text);
  }
  // 1. Especificadores de módulo (`import … from 'react'`).
  if (
    ts.isImportDeclaration(padre) ||
    ts.isExportDeclaration(padre) ||
    ts.isImportTypeNode(padre) ||
    ts.isExternalModuleReference(padre)
  ) {
    return true;
  }
  if (ts.isCallExpression(padre) && padre.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return true;
  }
  // 2. Nombres de propiedad o de miembro (`{ confirm: true }`, `'settings': 1`).
  if (
    (ts.isPropertyAssignment(padre) ||
      ts.isPropertySignature(padre) ||
      ts.isMethodSignature(padre) ||
      ts.isPropertyDeclaration(padre) ||
      ts.isEnumMember(padre)) &&
    padre.name === literal
  ) {
    return true;
  }
  // 3. Accesos a propiedades del API por corchetes (`chrome.runtime['sendMessage']`). El acceso
  //    con punto (`chrome.runtime.sendMessage`) no es un literal y nunca llega hasta aquí.
  if (ts.isElementAccessExpression(padre) && padre.argumentExpression === literal) {
    return true;
  }
  // 4. Tipos literales y uniones (`type X = 'send'`).
  if (ts.isLiteralTypeNode(padre)) {
    return true;
  }
  // 5. Argumentos de `callInternal` / `invoke*`: nombres de método del contrato §5.1.1.
  if (
    ts.isCallExpression(padre) &&
    padre.arguments.includes(literal) &&
    /(?:^|\.)(?:callInternal|invoke\w*)$/.test(padre.expression.getText())
  ) {
    return true;
  }
  // 6. Prefijo canónico del protocolo/API (`'wallet_sendSecret'`, `'eth_sendTransaction'`) o
  //    forma de identificador de código (`'reveal-not-confirmed'`, `'tk-copy-button'`).
  if (PREFIJOS_API.test(literal.text) || FORMA_IDENTIFICADOR.test(literal.text)) {
    return true;
  }
  // 7. Exenciones declaradas explícitamente, con su motivo (ver `EXENCIONES`).
  return EXENCIONES.includes(literal.text);
};

/**
 * Analiza una fuente TypeScript/TSX y devuelve los textos VISIBLES con palabras inglesas.
 * Es una función pura: el mismo motor se usa con las fuentes sintéticas de control y con los
 * ficheros reales de la UI.
 */
export const buscarTextoEnIngles = (fuente: string, fichero: string): HallazgoTexto[] => {
  const clase = extname(fichero) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fichero, fuente, ts.ScriptTarget.Latest, true, clase);
  const hallazgos: HallazgoTexto[] = [];

  const comprobar = (texto: string, nodo: ts.Node, contexto: string): void => {
    if (texto.trim().length === 0) {
      return;
    }
    const encontrado = PALABRAS_INGLESAS.exec(texto);
    if (encontrado === null) {
      return;
    }
    const posicion = sf.getLineAndCharacterOfPosition(
      nodo.getStart(sf) + (encontrado.index ?? 0),
    );
    hallazgos.push({
      fichero,
      linea: posicion.line + 1,
      columna: posicion.character + 1,
      palabra: encontrado[1] ?? '',
      texto: texto.trim(),
      contexto,
    });
  };

  const visitar = (nodo: ts.Node): void => {
    if (ts.isJsxText(nodo)) {
      comprobar(nodo.getText(sf), nodo, 'texto JSX');
    } else if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) {
      if (!esIdentificadorDeCodigo(nodo)) {
        comprobar(nodo.text, nodo, 'literal de cadena');
      }
    } else if (ts.isTemplateExpression(nodo)) {
      comprobar(nodo.head.text, nodo.head, 'plantilla');
      for (const tramo of nodo.templateSpans) {
        comprobar(tramo.literal.text, tramo.literal, 'plantilla');
      }
    }
    ts.forEachChild(nodo, visitar);
  };

  visitar(sf);
  return hallazgos;
};

/** Ficheros de UI (`.ts`/`.tsx`, sin los propios specs) que revisa la regla. */
const ficherosDeUi = (): string[] => {
  const encontrados: string[] = [];
  const recorrer = (absoluto: string): void => {
    for (const entrada of readdirSync(absoluto, { withFileTypes: true })) {
      if (entrada.name.startsWith('.')) continue;
      const hijo = join(absoluto, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(hijo);
      } else if (EXTENSIONES_UI.has(extname(entrada.name)) && !entrada.name.endsWith('.spec.ts')) {
        encontrados.push(hijo);
      }
    }
  };
  for (const directorio of DIRECTORIOS_UI) {
    recorrer(resolve(RAIZ, directorio));
  }
  return encontrados;
};

/** Analiza los ficheros reales de la UI. */
export const revisarUi = (): HallazgoTexto[] =>
  ficherosDeUi().flatMap((absoluto) =>
    buscarTextoEnIngles(readFileSync(absoluto, 'utf8'), relative(RAIZ, absoluto).split('\\').join('/')),
  );

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe('CA-RT-10 · la regla detecta de verdad (control positivo)', () => {
  it('un texto JSX en inglés se marca con su palabra, línea y columna', () => {
    const fuente = ['export const A = () => (', '  <button>Send</button>', ');'].join('\n');
    const hallazgos = buscarTextoEnIngles(fuente, 'sintetico.tsx');
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatchObject({ linea: 2, palabra: 'Send', contexto: 'texto JSX' });
  });

  it('un literal de cadena visible en inglés se marca (etiqueta, mensaje o aviso)', () => {
    const fuente = ["export const etiqueta = 'Copy address';"].join('\n');
    const hallazgos = buscarTextoEnIngles(fuente, 'sintetico.ts');
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatchObject({ palabra: 'Copy', contexto: 'literal de cadena' });
  });

  it('el texto español correcto NO se marca («Confirmación», «Cancelar», «Ajustes»)', () => {
    const fuente = [
      'export const A = () => (',
      '  <div>',
      '    <h2>Confirmación de la solicitud</h2>',
      '    <button>Cancelar</button>',
      '    <button>Ajustes</button>',
      '  </div>',
      ');',
    ].join('\n');
    expect(buscarTextoEnIngles(fuente, 'sintetico.tsx')).toEqual([]);
  });
});

describe('CA-RT-10 · no marca identificadores del API ni propiedades (regresión de D-H2-A)', () => {
  it('el canal real del runtime, las claves de objeto y los métodos del contrato quedan exentos', () => {
    const fuente = [
      'const canal = chrome.runtime.sendMessage;',
      "const otro = chrome.runtime['sendMessage'];",
      'const ajustes = { confirm: true, settings: { language: "es" } };',
      "const respuesta = callInternal('wallet_sendSecret', [{ kind: 'mnemonic', confirmed: true }]);",
      "type CampoAjustes = 'settings';",
      "const metodo = 'eth_sendRawTransaction';",
      "const motivo = 'reveal-not-confirmed';",
      "const clase = 'tk-copy-button';",
      "import { readFileSync } from 'node:fs';",
    ].join('\n');
    expect(buscarTextoEnIngles(fuente, 'sintetico.ts')).toEqual([]);
  });
});

describe('CA-RT-10 · la UI real no tiene texto visible en inglés', () => {
  it('src/popup, src/connect y src/notification: 0 coincidencias en texto visible', () => {
    const hallazgos = revisarUi();
    expect(
      hallazgos.map((h) => `${h.fichero}:${h.linea}:${h.columna} «${h.palabra}» en ${h.contexto}`),
      'CA-RT-10: hay texto visible en inglés (RF-34)',
    ).toEqual([]);
  });

  it('la regla cubre los tres directorios de UI (no es una lista vacía)', () => {
    const ficheros = ficherosDeUi().map((f) => relative(RAIZ, f).split('\\').join('/'));
    expect(ficheros.some((f) => f.startsWith('src/popup/'))).toBe(true);
    expect(ficheros.some((f) => f.startsWith('src/connect/'))).toBe(true);
    expect(ficheros.some((f) => f.startsWith('src/notification/'))).toBe(true);
    expect(ficheros.length).toBeGreaterThan(10);
  });
});
