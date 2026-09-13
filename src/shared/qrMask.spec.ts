/**
 * `src/shared/qrMask.spec.ts` — M63 · **selección de la máscara** (ISO/IEC 18004 §8.8.2).
 *
 * Requisitos: RF-07 (`CA-RF-07`, QR de la dirección) y RNF-20/RT-03 (generación LOCAL, sin red).
 *
 * HUECO QUE CUBRE (fase 4, pruebas exhaustivas): `qr.spec.ts` comprueba que el símbolo es
 * decodificable y que la máscara está en 0..7, pero **no** comprobaba que la máscara elegida sea
 * la que impone el estándar. La penalización de las cuatro reglas decide esa elección, y un
 * símbolo con la máscara «equivocada» sigue siendo legible (la máscara viaja en la información de
 * formato), así que el defecto era invisible a las aserciones anteriores.
 *
 * El descriptor de este fichero **reimplementa las cuatro reglas del estándar de forma
 * independiente** del codificador y reconstruye las OCHO matrices candidatas a partir del símbolo
 * final (deshaciendo la máscara elegida y aplicando cada una), de modo que la aserción no es
 * tautológica: compara la decisión del módulo con el mínimo calculado fuera de él.
 *
 * Magnitudes de referencia calculadas a mano para una matriz de 21×21 **toda oscura**:
 *   regla 1 → 21 filas × (3 + (21 − 5)) + 21 columnas × 19 = 399 + 399 = 798
 *   regla 2 → 20 × 20 bloques × 3 = 1200
 *   regla 3 → 0 (no hay 1:1:3:1:1)
 *   regla 4 → ⌊|100 − 50| / 5⌋ × 10 = 100
 *   total   → 2098
 */

import { describe, expect, it } from 'vitest';

import { encodeQr, formatBits, maskPenalty, type QrCode } from './qr';

// ---------------------------------------------------------------------------
// Descriptor independiente (misma geometría que el estándar, en sentido inverso)
// ---------------------------------------------------------------------------

/** Centros de los patrones de alineación por versión (ISO/IEC 18004, anexo E). */
const CENTROS_ALINEACION: Readonly<Record<number, readonly number[]>> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
};

/** Módulos de función (localizadores, sincronización, alineación, formato y módulo oscuro). */
const mapaReservado = (version: number, size: number): boolean[][] => {
  const reservado: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const marcar = (row: number, col: number): void => {
    if (row < 0 || row >= size || col < 0 || col >= size) return;
    const fila = reservado[row];
    if (fila !== undefined) fila[col] = true;
  };
  const marcarLocalizador = (row0: number, col0: number): void => {
    for (let row = row0 - 1; row <= row0 + 7; row += 1) {
      for (let col = col0 - 1; col <= col0 + 7; col += 1) marcar(row, col);
    }
  };
  marcarLocalizador(0, 0);
  marcarLocalizador(0, size - 7);
  marcarLocalizador(size - 7, 0);
  for (let index = 8; index <= size - 9; index += 1) {
    marcar(6, index);
    marcar(index, 6);
  }
  for (const row of CENTROS_ALINEACION[version] ?? []) {
    for (const col of CENTROS_ALINEACION[version] ?? []) {
      const solapa =
        (row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8);
      if (solapa) continue;
      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let colOffset = -2; colOffset <= 2; colOffset += 1) {
          marcar(row + rowOffset, col + colOffset);
        }
      }
    }
  }
  marcar(size - 8, 8);
  for (let bit = 0; bit <= 5; bit += 1) marcar(bit, 8);
  marcar(7, 8);
  marcar(8, 8);
  for (let bit = 8; bit <= 14; bit += 1) marcar(size - 15 + bit, 8);
  for (let bit = 0; bit <= 7; bit += 1) marcar(8, size - 1 - bit);
  marcar(8, 7);
  for (let bit = 9; bit <= 14; bit += 1) marcar(8, 14 - bit);
  return reservado;
};

/** Las 30 posiciones de la información de formato (dos copias de 15 módulos). */
const posicionesFormato = (size: number): { row: number; col: number; bit: number }[] => {
  const posiciones: { row: number; col: number; bit: number }[] = [];
  for (let bit = 0; bit <= 5; bit += 1) posiciones.push({ row: bit, col: 8, bit });
  posiciones.push({ row: 7, col: 8, bit: 6 });
  posiciones.push({ row: 8, col: 8, bit: 7 });
  for (let bit = 8; bit <= 14; bit += 1) posiciones.push({ row: size - 15 + bit, col: 8, bit });
  for (let bit = 0; bit <= 7; bit += 1) posiciones.push({ row: 8, col: size - 1 - bit, bit });
  posiciones.push({ row: 8, col: 7, bit: 8 });
  for (let bit = 9; bit <= 14; bit += 1) posiciones.push({ row: 8, col: 14 - bit, bit });
  return posiciones;
};

/** Funciones de máscara del estándar (`true` = invertir el módulo). */
const MASCARAS: readonly ((row: number, col: number) => boolean)[] = [
  (row, col) => (row + col) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
];

/** Penalización de las CUATRO reglas, calculada AQUÍ (implementación independiente). */
const penalizacionIndependiente = (modules: readonly (readonly boolean[])[]): number => {
  const size = modules.length;
  const oscuro = (row: number, col: number): boolean => modules[row]?.[col] === true;
  let total = 0;

  const rachas = (linea: readonly boolean[]): number => {
    let suma = 0;
    let corrida = 1;
    for (let index = 1; index < linea.length; index += 1) {
      if (linea[index] === linea[index - 1]) {
        corrida += 1;
      } else {
        if (corrida >= 5) suma += 3 + (corrida - 5);
        corrida = 1;
      }
    }
    if (corrida >= 5) suma += 3 + (corrida - 5);
    return suma;
  };
  for (let row = 0; row < size; row += 1) {
    total += rachas(Array.from({ length: size }, (_unused, col) => oscuro(row, col)));
  }
  for (let col = 0; col < size; col += 1) {
    total += rachas(Array.from({ length: size }, (_unused, row) => oscuro(row, col)));
  }

  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const valor = oscuro(row, col);
      if (
        valor === oscuro(row, col + 1) &&
        valor === oscuro(row + 1, col) &&
        valor === oscuro(row + 1, col + 1)
      ) {
        total += 3;
      }
    }
  }

  const patronA = [true, false, true, true, true, false, true, false, false, false, false];
  const patronB = [false, false, false, false, true, false, true, true, true, false, true];
  const escanear = (linea: readonly boolean[]): number => {
    let suma = 0;
    for (let start = 0; start + 11 <= linea.length; start += 1) {
      if (
        patronA.every((valor, offset) => linea[start + offset] === valor) ||
        patronB.every((valor, offset) => linea[start + offset] === valor)
      ) {
        suma += 40;
      }
    }
    return suma;
  };
  for (let row = 0; row < size; row += 1) {
    total += escanear(Array.from({ length: size }, (_unused, col) => oscuro(row, col)));
  }
  for (let col = 0; col < size; col += 1) {
    total += escanear(Array.from({ length: size }, (_unused, row) => oscuro(row, col)));
  }

  let negros = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (oscuro(row, col)) negros += 1;
    }
  }
  total += Math.floor(Math.abs((negros * 100) / (size * size) - 50) / 5) * 10;
  return total;
};

/** Reconstruye las OCHO matrices candidatas a partir del símbolo ya construido. */
const candidatas = (qr: QrCode): boolean[][][] => {
  const size = qr.size;
  const reservado = mapaReservado(qr.version, size);
  const base: boolean[][] = qr.modules.map((row) => [...row]);
  const elegida = MASCARAS[qr.maskPattern];
  if (elegida === undefined) throw new Error(`máscara fuera de rango: ${qr.maskPattern}`);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (reservado[row]?.[col] === true) continue;
      const bruto = base[row]?.[col] === true;
      base[row]![col] = elegida(row, col) ? !bruto : bruto;
    }
  }
  const salida: boolean[][][] = [];
  for (let mask = 0; mask < 8; mask += 1) {
    const funcion = MASCARAS[mask];
    if (funcion === undefined) throw new Error(`máscara fuera de rango: ${mask}`);
    const matriz = base.map((row) => [...row]);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (reservado[row]?.[col] === true) continue;
        matriz[row]![col] = funcion(row, col) ? !(matriz[row]?.[col] === true) : matriz[row]?.[col] === true;
      }
    }
    const bits = formatBits(qr.ecc, mask);
    for (const posicion of posicionesFormato(size)) {
      matriz[posicion.row]![posicion.col] = ((bits >> posicion.bit) & 1) === 1;
    }
    salida.push(matriz);
  }
  return salida;
};

/** Matriz cuadrada uniforme (todas las celdas con el mismo color). */
const matrizUniforme = (size: number, dark: boolean): boolean[][] =>
  Array.from({ length: size }, () => new Array<boolean>(size).fill(dark));

/** Matriz de un solo color con UNA racha de longitud `run` invertida en la primera fila. */
const matrizConRacha = (size: number, run: number): boolean[][] => {
  const matriz = matrizUniforme(size, false);
  for (let col = 0; col < run; col += 1) matriz[0]![col] = true;
  return matriz;
};

/** Cargas con las que el defecto era OBSERVABLE (la máscara elegida difería del argmin). */
const CARGAS_OBSERVABLES: readonly { carga: string; version: number; mascara: number }[] = [
  { carga: 'x', version: 1, mascara: 4 },
  { carga: 'payload-6-bbbbbb', version: 2, mascara: 4 },
  { carga: 'payload-10-bbbbbbbbbb', version: 2, mascara: 3 },
];

describe('M63 · regla 1 de la penalización (rachas de 5 o más)', () => {
  it('una matriz 21×21 TODA oscura puntúa EXACTAMENTE 2098 (798 + 1200 + 0 + 100)', () => {
    // Antes de la corrección la regla 1 se descartaba y el valor era 1300 (faltaban 798).
    expect(maskPenalty(matrizUniforme(21, true))).toBe(2098);
    // El control positivo: la implementación independiente coincide con el módulo.
    expect(penalizacionIndependiente(matrizUniforme(21, true))).toBe(2098);
  });

  it('una matriz 21×21 TODA clara puntúa lo mismo: la regla 1 no distingue el color', () => {
    expect(maskPenalty(matrizUniforme(21, false))).toBe(2098);
    expect(penalizacionIndependiente(matrizUniforme(21, false))).toBe(2098);
  });

  it('una sola fila partida en dos colores baja la puntuación en 52 puntos exactos', () => {
    // Matriz de 21×21 toda oscura salvo la fila 0, que son 10 módulos claros y 11 oscuros:
    //   regla 1 filas   → fila 0: (3+5) + (3+6) = 17; las otras 20: 20 × 19 = 380  → 397
    //   regla 1 columnas→ 10 columnas con rachas 1 + 20 → 10 × (3+15) = 180;
    //                     11 columnas uniformes → 11 × 19 = 209                    → 389
    //   regla 2         → 19 pares de filas uniformes × 20 bloques × 3 = 1140;
    //                     el par (0,1) solo aporta 10 bloques × 3 = 30              → 1170
    //   regla 4         → 431/441 = 97,73 % → ⌊47,73/5⌋ × 10 = 90
    //   total           → 397 + 389 + 1170 + 0 + 90 = 2046, es decir 2098 − 52
    const uniforme = maskPenalty(matrizUniforme(21, true));
    const partida = maskPenalty(matrizConRacha(21, 10));
    expect(uniforme).toBe(2098);
    expect(partida).toBe(2046);
    expect(uniforme - partida).toBe(52);
    expect(partida).toBe(penalizacionIndependiente(matrizConRacha(21, 10)));
    // Una racha de exactamente 5 módulos ya puntúa 3 (y de 4 no puntúa nada por la regla 1): el
    // módulo y la referencia independiente coinciden en ambos casos.
    expect(maskPenalty(matrizConRacha(21, 5))).toBe(penalizacionIndependiente(matrizConRacha(21, 5)));
    expect(maskPenalty(matrizUniforme(21, false))).toBe(
      penalizacionIndependiente(matrizUniforme(21, false)),
    );
  });

  it('la penalización del módulo coincide con la referencia independiente en tamaños 21..33', () => {
    for (const size of [21, 25, 29, 33]) {
      for (const dark of [false, true]) {
        expect(maskPenalty(matrizUniforme(size, dark))).toBe(
          penalizacionIndependiente(matrizUniforme(size, dark)),
        );
      }
      const ajedrez = Array.from({ length: size }, (_unused, row) =>
        Array.from({ length: size }, (_otro, col) => (row + col) % 2 === 0),
      );
      expect(maskPenalty(ajedrez)).toBe(penalizacionIndependiente(ajedrez));
    }
  });
});

describe('M63 · la máscara elegida MINIMIZA la penalización de las cuatro reglas', () => {
  it('el codificador elige el argmin de la penalización (ISO/IEC 18004 §8.8.2)', () => {
    const cargas = [
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      'ethereum:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'hola mundo',
      ...Array.from({ length: 12 }, (_unused, index) => `payload-${index + 1}-${'b'.repeat(index + 1)}`),
    ];
    for (const carga of cargas) {
      const result = encodeQr(carga);
      if (!result.ok) throw new Error(`el QR de «${carga}» no se pudo construir`);
      const penalizaciones = candidatas(result.qr).map((matriz) => penalizacionIndependiente(matriz));
      const mejor = penalizaciones.indexOf(Math.min(...penalizaciones));
      expect(
        result.qr.maskPattern,
        `«${carga}»: penalizaciones ${penalizaciones.join(',')}`,
      ).toBe(mejor);
      // Y la penalización de la matriz elegida es, por tanto, el mínimo exacto.
      expect(maskPenalty(candidatas(result.qr)[result.qr.maskPattern] ?? [])).toBe(
        Math.min(...penalizaciones),
      );
    }
  });

  it('las cargas donde la regla 1 cambiaba la decisión eligen ahora el mínimo del estándar', () => {
    for (const { carga, version, mascara } of CARGAS_OBSERVABLES) {
      const result = encodeQr(carga);
      if (!result.ok) throw new Error(`el QR de «${carga}» no se pudo construir`);
      expect(result.qr.version, `versión de «${carga}»`).toBe(version);
      // Con la regla 1 descartada estas tres cargas elegían la máscara 2 (y 2 para la tercera):
      // la máscara del estándar es la 4, la 4 y la 3.
      expect(result.qr.maskPattern, `máscara de «${carga}»`).toBe(mascara);
      const penalizaciones = candidatas(result.qr).map((matriz) => penalizacionIndependiente(matriz));
      const elegida = penalizaciones[mascara] ?? Number.POSITIVE_INFINITY;
      const descartada = penalizaciones[2] ?? Number.NEGATIVE_INFINITY;
      expect(elegida).toBeLessThan(descartada);
    }
  });

  it('el símbolo es AUTO-CONSISTENTE con la máscara corregida (región de datos y formato)', () => {
    // Al deshacer la máscara elegida, aplicar OTRA VEZ esa misma función y reescribir su
    // información de formato se reproduce el símbolo EXACTO: prueba que la máscara declarada es la
    // que realmente se aplicó (y que las posiciones de formato no se enmascaran).
    for (const { carga } of CARGAS_OBSERVABLES) {
      const result = encodeQr(carga);
      if (!result.ok) throw new Error(`el QR de «${carga}» no se pudo construir`);
      const reconstruida = candidatas(result.qr)[result.qr.maskPattern];
      expect(reconstruida, `reconstrucción de «${carga}»`).toEqual(
        result.qr.modules.map((row) => [...row]),
      );
    }
  });
});
