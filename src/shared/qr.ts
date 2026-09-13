/**
 * M63 — `src/shared/qr.ts`
 * Generación **LOCAL** del QR de la dirección de recepción (RF-07 / `CA-RF-07`).
 *
 * Requisitos que este módulo cumple:
 * - **Sin red y sin dependencias remotas** (RNF-20 / RT-03 / `CA-RT-05`): el codificador QR
 *   (modelo 2, modo byte, Reed-Solomon sobre GF(256), colocación en zigzag y evaluación de las
 *   8 máscaras) está implementado aquí, con aritmética de enteros.
 * - **Sin criptografía y sin `ethers`**: vive en `src/shared/` y lo consume el popup.
 * - **Sin literales de color** (RNF-18): el SVG que se emite usa `currentColor`, de modo que el
 *   color lo decide `tokens.css` y nunca este módulo.
 *
 * Alcance de versiones: 1 a 4 con nivel de corrección **L** y **M**, suficiente para la
 * dirección (42 caracteres: entra exacto en la versión 3-M) y para el URI `ethereum:` (51
 * caracteres: versión 3-L). Un texto que no quepa en esas combinaciones **no se dibuja**: se
 * devuelve `ok: false` con el motivo, nunca un QR incorrecto.
 *
 * La tabla de bloques de corrección de errores es la de ISO/IEC 18004 para esas ocho
 * combinaciones (`totalCodewords`, `ecPerBlock` y la partición en bloques).
 */

import type { Address } from './types';

/** Niveles de corrección de errores soportados (≈7 % y ≈15 % de recuperación). */
export type QrEccLevel = 'L' | 'M';

/** Nivel por defecto: M (equilibrio entre tamaño y robustez para una dirección). */
export const QR_DEFAULT_ECC: QrEccLevel = 'M';

/** Versiones soportadas (1..4): de 21×21 a 33×33 módulos. */
export const QR_SUPPORTED_VERSIONS: readonly number[] = [1, 2, 3, 4];

/** Zona de silencio obligatoria alrededor del símbolo, en módulos. */
export const QR_QUIET_ZONE = 4 as const;

/** Estructura de bloques de corrección de errores de una combinación versión + nivel. */
interface QrSpec {
  version: number;
  ecc: QrEccLevel;
  totalCodewords: number;
  ecPerBlock: number;
  /** Partición en bloques: cuántos bloques y cuántas palabras de datos tiene cada uno. */
  groups: readonly { blocks: number; dataCodewords: number }[];
}

/** Tabla cerrada de bloques (ISO/IEC 18004) para las ocho combinaciones soportadas. */
const QR_SPECS: readonly QrSpec[] = [
  { version: 1, ecc: 'L', totalCodewords: 26, ecPerBlock: 7, groups: [{ blocks: 1, dataCodewords: 19 }] },
  { version: 1, ecc: 'M', totalCodewords: 26, ecPerBlock: 10, groups: [{ blocks: 1, dataCodewords: 16 }] },
  { version: 2, ecc: 'L', totalCodewords: 44, ecPerBlock: 10, groups: [{ blocks: 1, dataCodewords: 34 }] },
  { version: 2, ecc: 'M', totalCodewords: 44, ecPerBlock: 16, groups: [{ blocks: 1, dataCodewords: 28 }] },
  { version: 3, ecc: 'L', totalCodewords: 70, ecPerBlock: 15, groups: [{ blocks: 1, dataCodewords: 55 }] },
  { version: 3, ecc: 'M', totalCodewords: 70, ecPerBlock: 26, groups: [{ blocks: 1, dataCodewords: 44 }] },
  { version: 4, ecc: 'L', totalCodewords: 100, ecPerBlock: 20, groups: [{ blocks: 1, dataCodewords: 80 }] },
  { version: 4, ecc: 'M', totalCodewords: 100, ecPerBlock: 18, groups: [{ blocks: 2, dataCodewords: 32 }] },
];

/** Símbolo QR ya construido. */
export interface QrCode {
  version: number;
  /** Lado del símbolo en módulos: `17 + 4 × version`. */
  size: number;
  ecc: QrEccLevel;
  /** Máscara elegida (0..7) por la puntuación de penalización del estándar. */
  maskPattern: number;
  /** Matriz de módulos: `modules[fila][columna]`, `true` = módulo oscuro. */
  modules: readonly (readonly boolean[])[];
}

/** Motivo por el que no se pudo construir el símbolo. */
export type QrFailureReason = 'empty-payload' | 'payload-too-large';

/** Resultado de la codificación: nunca lanza. */
export type QrResult = { ok: true; qr: QrCode } | { ok: false; reason: QrFailureReason };

/** Capacidad en bytes del modo byte (4 bits de modo + 8 de longitud) por combinación. */
export const QR_BYTE_CAPACITY: Readonly<Record<string, number>> = Object.fromEntries(
  QR_SPECS.map((spec) => {
    const dataCodewords = spec.groups.reduce(
      (total, group) => total + group.blocks * group.dataCodewords,
      0,
    );
    // 4 bits de modo + 8 bits de contador (versiones 1..9) = 12 bits de cabecera.
    return [`${spec.version}-${spec.ecc}`, dataCodewords - 2];
  }),
);

// ---------------------------------------------------------------------------
// Aritmética de GF(256) y Reed-Solomon
// ---------------------------------------------------------------------------

const GF_PRIMITIVE = 0x11d;
const GF_EXP: number[] = new Array<number>(512).fill(0);
const GF_LOG: number[] = new Array<number>(256).fill(0);

{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if ((value & 0x100) !== 0) {
      value ^= GF_PRIMITIVE;
    }
  }
  for (let index = 255; index < 512; index += 1) {
    GF_EXP[index] = GF_EXP[index - 255] ?? 0;
  }
}

/** `α^exponent` en GF(256). */
const gfExp = (exponent: number): number => GF_EXP[exponent % 255] ?? 0;

/** Logaritmo discreto en GF(256); el 0 no tiene logaritmo y se trata como 0. */
const gfLog = (value: number): number => (value === 0 ? 0 : (GF_LOG[value] ?? 0));

/** Producto en GF(256). */
const gfMul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : gfExp(gfLog(a) + gfLog(b));

/** Polinomio generador de Reed-Solomon de grado `degree`, en orden descendente. */
const rsGenerator = (degree: number): number[] => {
  let polynomial: number[] = [1];
  for (let step = 0; step < degree; step += 1) {
    const next = new Array<number>(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index += 1) {
      const coefficient = polynomial[index] ?? 0;
      next[index] = (next[index] ?? 0) ^ coefficient;
      next[index + 1] = (next[index + 1] ?? 0) ^ gfMul(coefficient, gfExp(step));
    }
    polynomial = next;
  }
  return polynomial;
};

/** Palabras de corrección de errores de un bloque de datos (resto de la división polinómica). */
const rsEncode = (data: readonly number[], ecCount: number): number[] => {
  const generator = rsGenerator(ecCount);
  const remainder = new Array<number>(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0);
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < ecCount; index += 1) {
      remainder[index] = (remainder[index] ?? 0) ^ gfMul(generator[index + 1] ?? 0, factor);
    }
  }
  return remainder;
};

/** Síndromes de un bloque completo (datos + corrección): todos deben ser 0. */
const rsSyndromes = (block: readonly number[], ecCount: number): number[] => {
  const syndromes: number[] = [];
  for (let index = 0; index < ecCount; index += 1) {
    let value = 0;
    for (const byte of block) {
      value = gfMul(value, gfExp(index)) ^ byte;
    }
    syndromes.push(value);
  }
  return syndromes;
};

/** Comprueba que un bloque (datos + corrección) tiene todos los síndromes nulos. */
export const rsBlockIsValid = (block: readonly number[], ecCount: number): boolean =>
  rsSyndromes(block, ecCount).every((value) => value === 0);

// ---------------------------------------------------------------------------
// Codificación de datos
// ---------------------------------------------------------------------------

/** Selecciona la combinación más pequeña que admite `byteLength` bytes en modo byte. */
const selectSpec = (byteLength: number, ecc: QrEccLevel): QrSpec | null => {
  const candidates = QR_SPECS.filter((spec) => spec.ecc === ecc).sort((a, b) => a.version - b.version);
  for (const spec of candidates) {
    if ((QR_BYTE_CAPACITY[`${spec.version}-${spec.ecc}`] ?? 0) >= byteLength) {
      return spec;
    }
  }
  return null;
};

/** Flujo final de palabras (datos + corrección) ya intercalado por bloques. */
const buildCodewords = (spec: QrSpec, payload: Uint8Array): number[] => {
  const dataCodewords = spec.groups.reduce(
    (total, group) => total + group.blocks * group.dataCodewords,
    0,
  );
  const bits: number[] = [];
  const pushBits = (value: number, length: number): void => {
    for (let index = length - 1; index >= 0; index -= 1) {
      bits.push((value >> index) & 1);
    }
  };

  pushBits(0b0100, 4); // modo byte
  pushBits(payload.length, 8); // contador de caracteres (versiones 1..9)
  for (const byte of payload) {
    pushBits(byte, 8);
  }
  // Terminador: hasta 4 ceros, nunca por encima de la capacidad.
  const capacityBits = dataCodewords * 8;
  pushBits(0, Math.max(0, Math.min(4, capacityBits - bits.length)));
  // Relleno hasta el límite de byte.
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      byte = (byte << 1) | (bits[index + offset] ?? 0);
    }
    codewords.push(byte);
  }
  // Bytes de relleno alternos 0xEC / 0x11.
  let pad = 0xec;
  while (codewords.length < dataCodewords) {
    codewords.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }

  // Partición en bloques, corrección por bloque e intercalado (ISO/IEC 18004 §8.6).
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let cursor = 0;
  for (const group of spec.groups) {
    for (let block = 0; block < group.blocks; block += 1) {
      const chunk = codewords.slice(cursor, cursor + group.dataCodewords);
      cursor += group.dataCodewords;
      dataBlocks.push(chunk);
      ecBlocks.push(rsEncode(chunk, spec.ecPerBlock));
    }
  }
  const interleaved: number[] = [];
  const longestData = dataBlocks.reduce((max, block) => Math.max(max, block.length), 0);
  for (let index = 0; index < longestData; index += 1) {
    for (const block of dataBlocks) {
      if (index < block.length) {
        interleaved.push(block[index] ?? 0);
      }
    }
  }
  for (let index = 0; index < spec.ecPerBlock; index += 1) {
    for (const block of ecBlocks) {
      interleaved.push(block[index] ?? 0);
    }
  }
  return interleaved;
};

// ---------------------------------------------------------------------------
// Construcción de la matriz
// ---------------------------------------------------------------------------

/** Máscaras de la especificación (`true` = invertir el módulo). */
const MASK_FUNCTIONS: readonly ((row: number, col: number) => boolean)[] = [
  (row, col) => (row + col) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
];

/** Centros de los patrones de alineación por versión (ISO/IEC 18004, anexo E). */
const ALIGNMENT_CENTERS: Readonly<Record<number, readonly number[]>> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
};

/** Posiciones de la tira VERTICAL de la información de formato (columna 8, 15 módulos). */
const formatPositionsVertical = (size: number): { row: number; col: number; bit: number }[] => {
  const positions: { row: number; col: number; bit: number }[] = [];
  for (let bit = 0; bit <= 5; bit += 1) positions.push({ row: bit, col: 8, bit });
  positions.push({ row: 7, col: 8, bit: 6 });
  positions.push({ row: 8, col: 8, bit: 7 });
  for (let bit = 8; bit <= 14; bit += 1) positions.push({ row: size - 15 + bit, col: 8, bit });
  return positions;
};

/** Posiciones de la tira HORIZONTAL de la información de formato (fila 8, 15 módulos). */
const formatPositionsHorizontal = (size: number): { row: number; col: number; bit: number }[] => {
  const positions: { row: number; col: number; bit: number }[] = [];
  for (let bit = 0; bit <= 7; bit += 1) positions.push({ row: 8, col: size - 1 - bit, bit });
  positions.push({ row: 8, col: 7, bit: 8 });
  for (let bit = 9; bit <= 14; bit += 1) positions.push({ row: 8, col: 14 - bit, bit });
  return positions;
};

/** Todas las posiciones de la información de formato (30 módulos). */
const allFormatPositions = (size: number): { row: number; col: number; bit: number }[] => [
  ...formatPositionsVertical(size),
  ...formatPositionsHorizontal(size),
];

/** Indicadores de nivel de corrección dentro de la información de formato. */
const ECC_FORMAT_BITS: Readonly<Record<QrEccLevel, number>> = { L: 0b01, M: 0b00 };

/** Grado (posición del bit más significativo) de un entero no negativo. */
const degreeOf = (value: number): number => {
  let degree = 0;
  let probe = value;
  while (probe > 1) {
    probe >>>= 1;
    degree += 1;
  }
  return degree;
};

/** Palabra de 15 bits de información de formato (BCH(15,5) + máscara 0x5412). */
export const formatBits = (ecc: QrEccLevel, mask: number): number => {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | (mask & 0b111);
  let remainder = data << 10;
  while (degreeOf(remainder) >= 10) {
    remainder ^= 0x537 << (degreeOf(remainder) - 10);
  }
  return ((data << 10) | remainder) ^ 0x5412;
};

/** Matriz base con TODOS los patrones de función colocados y sus módulos reservados. */
const buildBaseMatrix = (
  version: number,
  size: number,
): { modules: boolean[][]; reserved: boolean[][] } => {
  const modules: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const set = (row: number, col: number, dark: boolean): void => {
    if (row < 0 || row >= size || col < 0 || col >= size) return;
    const targetRow = modules[row];
    const reservedRow = reserved[row];
    if (targetRow === undefined || reservedRow === undefined) return;
    targetRow[col] = dark;
    reservedRow[col] = true;
  };

  /** Localizador de 7×7 más su separador claro (área de 8×8). */
  const placeFinder = (row0: number, col0: number): void => {
    for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 7; colOffset += 1) {
        const row = row0 + rowOffset;
        const col = col0 + colOffset;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        const insideFinder = rowOffset >= 0 && rowOffset <= 6 && colOffset >= 0 && colOffset <= 6;
        const dark =
          insideFinder &&
          (rowOffset === 0 ||
            rowOffset === 6 ||
            colOffset === 0 ||
            colOffset === 6 ||
            (rowOffset >= 2 && rowOffset <= 4 && colOffset >= 2 && colOffset <= 4));
        set(row, col, dark);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Patrones de sincronización (fila 6 y columna 6).
  for (let index = 8; index <= size - 9; index += 1) {
    set(6, index, index % 2 === 0);
    set(index, 6, index % 2 === 0);
  }

  // Patrones de alineación, salvo los que solapan un localizador.
  const centers = ALIGNMENT_CENTERS[version] ?? [];
  for (const row of centers) {
    for (const col of centers) {
      const overlapsFinder =
        (row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8);
      if (overlapsFinder) continue;
      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let colOffset = -2; colOffset <= 2; colOffset += 1) {
          const dark =
            Math.abs(rowOffset) === 2 ||
            Math.abs(colOffset) === 2 ||
            (rowOffset === 0 && colOffset === 0);
          set(row + rowOffset, col + colOffset, dark);
        }
      }
    }
  }

  // Módulo oscuro fijo y reserva de las dos tiras de información de formato.
  set(size - 8, 8, true);
  for (const position of allFormatPositions(size)) {
    set(position.row, position.col, false);
  }
  return { modules, reserved };
};

/** Coloca los bits de datos en zigzag (los bits sobrantes quedan claros). */
const placeData = (
  base: { modules: boolean[][]; reserved: boolean[][] },
  codewords: readonly number[],
): boolean[][] => {
  const size = base.modules.length;
  const modules = base.modules.map((row) => [...row]);
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  let upward = true;

  for (let column = size - 1; column > 0; column -= 2) {
    // La columna 6 es la de sincronización: se salta y la pareja pasa a ser (5,4).
    if (column === 6) {
      column = 5;
    }
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = column - offset;
        if (base.reserved[row]?.[col] === true) continue;
        const targetRow = modules[row];
        if (targetRow === undefined) continue;
        if (bitIndex < totalBits) {
          const codeword = codewords[bitIndex >> 3] ?? 0;
          targetRow[col] = ((codeword >> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex += 1;
        } else {
          targetRow[col] = false;
        }
      }
    }
    upward = !upward;
  }
  return modules;
};

/** Aplica la máscara a TODA la región de datos (bits sobrantes incluidos, como el estándar). */
const applyMask = (
  modules: boolean[][],
  reserved: readonly (readonly boolean[])[],
  mask: number,
): boolean[][] => {
  const maskFunction = MASK_FUNCTIONS[mask];
  if (maskFunction === undefined) {
    return modules;
  }
  return modules.map((row, rowIndex) =>
    row.map((dark, colIndex) => {
      if (reserved[rowIndex]?.[colIndex] === true) {
        return dark;
      }
      return maskFunction(rowIndex, colIndex) ? !dark : dark;
    }),
  );
};

/** Puntuación de penalización del estándar (reglas 1 a 4) para elegir la máscara. */
export const maskPenalty = (modules: readonly (readonly boolean[])[]): number => {
  const size = modules.length;
  const dark = (row: number, col: number): boolean => modules[row]?.[col] === true;
  let penalty = 0;

  // Regla 1: rachas de 5 o más módulos del mismo color en fila o columna.
  const runPenalty = (line: readonly boolean[]): number => {
    let total = 0;
    let run = 1;
    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === line[index - 1]) {
        run += 1;
      } else {
        if (run >= 5) total += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) total += 3 + (run - 5);
    return total;
  };
  // DEFECTO MEDIDO Y CORREGIDO (fase 4): las dos pasadas descartaban el valor devuelto por
  // `runPenalty`, de modo que la regla 1 NO sumaba nada y la máscara se elegía con las reglas
  // 2/3/4 solamente (la penalización de una matriz 21×21 toda oscura daba 1300 en vez de 2098).
  // El símbolo seguía siendo decodificable —la máscara viaja en la información de formato— pero
  // la selección dejaba de ser la de ISO/IEC 18004 §8.8.2. Ahora las dos pasadas acumulan.
  for (let row = 0; row < size; row += 1) {
    penalty += runPenalty(Array.from({ length: size }, (_unused, col) => dark(row, col)));
  }
  for (let col = 0; col < size; col += 1) {
    penalty += runPenalty(Array.from({ length: size }, (_unused, row) => dark(row, col)));
  }

  // Regla 2: bloques 2×2 del mismo color.
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const value = dark(row, col);
      if (
        value === dark(row, col + 1) &&
        value === dark(row + 1, col) &&
        value === dark(row + 1, col + 1)
      ) {
        penalty += 3;
      }
    }
  }

  // Regla 3: patrón 1:1:3:1:1 seguido o precedido de cuatro módulos claros.
  const patternA = [true, false, true, true, true, false, true, false, false, false, false];
  const patternB = [false, false, false, false, true, false, true, true, true, false, true];
  const matchesPattern = (
    line: readonly boolean[],
    start: number,
    pattern: readonly boolean[],
  ): boolean => pattern.every((value, offset) => line[start + offset] === value);
  const scanLine = (line: readonly boolean[]): number => {
    let total = 0;
    for (let start = 0; start + 11 <= line.length; start += 1) {
      if (matchesPattern(line, start, patternA) || matchesPattern(line, start, patternB)) {
        total += 40;
      }
    }
    return total;
  };
  for (let row = 0; row < size; row += 1) {
    penalty += scanLine(Array.from({ length: size }, (_unused, col) => dark(row, col)));
  }
  for (let col = 0; col < size; col += 1) {
    penalty += scanLine(Array.from({ length: size }, (_unused, row) => dark(row, col)));
  }

  // Regla 4: desviación de la proporción de módulos oscuros respecto del 50 %.
  let darkCount = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (dark(row, col)) darkCount += 1;
    }
  }
  const ratio = (darkCount * 100) / (size * size);
  penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return penalty;
};

/** Escribe la información de formato en sus dos copias. */
const writeFormat = (modules: boolean[][], size: number, ecc: QrEccLevel, mask: number): void => {
  const bits = formatBits(ecc, mask);
  for (const position of allFormatPositions(size)) {
    const row = modules[position.row];
    if (row === undefined) continue;
    row[position.col] = ((bits >> position.bit) & 1) === 1;
  }
};

/** Texto a bytes UTF-8 (el modo byte de QR opera sobre bytes, no sobre caracteres). */
const toUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * Codifica `text` en un símbolo QR local. No lanza: si no cabe en las versiones soportadas
 * devuelve `{ ok: false }` con el motivo.
 */
export const encodeQr = (text: string, ecc: QrEccLevel = QR_DEFAULT_ECC): QrResult => {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, reason: 'empty-payload' };
  }
  const payload = toUtf8(text);
  const spec = selectSpec(payload.length, ecc);
  if (spec === null) {
    return { ok: false, reason: 'payload-too-large' };
  }
  const size = 17 + 4 * spec.version;
  const base = buildBaseMatrix(spec.version, size);
  const codewords = buildCodewords(spec, payload);

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestModules: boolean[][] = [];
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = applyMask(placeData(base, codewords), base.reserved, mask);
    writeFormat(candidate, size, ecc, mask);
    const penalty = maskPenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      bestModules = candidate;
    }
  }
  return {
    ok: true,
    qr: { version: spec.version, size, ecc, maskPattern: bestMask, modules: bestModules },
  };
};

/** QR de la dirección de recepción (solo la dirección: es lo que exige `CA-RF-07`). */
export const encodeAddressQr = (
  address: Address | string,
  ecc: QrEccLevel = QR_DEFAULT_ECC,
): QrResult => encodeQr(address, ecc);

/** URI EIP-681 mínimo, para pegar en otras carteras (`ethereum:0x…`). */
export const ethereumUri = (address: Address | string, chainId?: string): string =>
  chainId === undefined ? `ethereum:${address}` : `ethereum:${address}@${chainId}`;

/** Matriz como texto (`X` oscuro, `.` claro): útil para diagnóstico y pruebas. */
export const qrToText = (qr: QrCode): string =>
  qr.modules.map((row) => row.map((dark) => (dark ? 'X' : '.')).join('')).join('\n');

/**
 * `path` SVG con un rectángulo por módulo oscuro. El color NO se fija aquí: el `<svg>` que lo
 * envuelve usa `currentColor` (RNF-18: `tokens.css` es la única fuente de color).
 */
export const qrToPath = (qr: QrCode): string => {
  const segments: string[] = [];
  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (qr.modules[row]?.[col] === true) {
        segments.push(`M${col} ${row}h1v1h-1z`);
      }
    }
  }
  return segments.join('');
};

/**
 * SVG autocontenido del símbolo, con zona de silencio de 4 módulos y `currentColor`. No
 * referencia ningún recurso remoto (`CA-RT-05`) ni literal de color (RNF-18).
 */
export const qrToSvg = (
  qr: QrCode,
  options: { title?: string; moduleSize?: number } = {},
): string => {
  const quiet = QR_QUIET_ZONE;
  const extent = qr.size + quiet * 2;
  const moduleSize = options.moduleSize ?? 8;
  const title = options.title ?? 'Código QR de la dirección de recepción';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" role="img"',
    ` aria-label="${title}" width="${extent * moduleSize}" height="${extent * moduleSize}"`,
    ` viewBox="${-quiet} ${-quiet} ${extent} ${extent}" shape-rendering="crispEdges">`,
    `<title>${title}</title>`,
    `<path fill="currentColor" d="${qrToPath(qr)}"/>`,
    '</svg>',
  ].join('');
};
