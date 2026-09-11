/**
 * `e2e/fixtures/qr.ts` — Descriptor del QR de recepción para el arnés E2E (tarea 2.17).
 *
 * El popup pinta el símbolo como una **rejilla de módulos del DOM** (no como `<svg>`), así que
 * para contrastar «la dirección del QR es la dirección mostrada» (`CA-RF-07`) hay que leer ese
 * símbolo hacia atrás. Este módulo implementa el descriptor con la geometría del estándar
 * (ISO/IEC 18004): información de formato, colocación en zigzag, máscara y modo byte.
 *
 * No es una copia del codificador: recorre la matriz EN SENTIDO INVERSO y aplica las funciones
 * de máscara y la tabla de posiciones reservadas de forma independiente.
 */

/** Centros de los patrones de alineación (anexo E) para las versiones 1..4. */
const CENTROS_ALINEACION: Readonly<Record<number, readonly number[]>> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
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

/** Bits de corrección del formato (`L` = 01, `M` = 00). */
const BITS_ECC: Readonly<Record<'L' | 'M', number>> = { L: 0b01, M: 0b00 };

/** Grado (posición del bit más significativo) de un entero no negativo. */
const grado = (value: number): number => {
  let degree = 0;
  let probe = value;
  while (probe > 1) {
    probe >>>= 1;
    degree += 1;
  }
  return degree;
};

/** Palabra de 15 bits de información de formato (BCH(15,5) + máscara 0x5412). */
const bitsDeFormato = (ecc: 'L' | 'M', mask: number): number => {
  const data = (BITS_ECC[ecc] << 3) | (mask & 0b111);
  let remainder = data << 10;
  while (grado(remainder) >= 10) {
    remainder ^= 0x537 << (grado(remainder) - 10);
  }
  return ((data << 10) | remainder) ^ 0x5412;
};

/**
 * Descodifica el QR pintado en el popup. Devuelve el texto del modo byte o `null` si la matriz
 * no es un símbolo legible (tamaño incoherente, formato ilegible o modo distinto del byte).
 */
export function decodeQrMatrix(modules: readonly (readonly boolean[])[]): string | null {
  const size = modules.length;
  if (size < 21 || (size - 17) % 4 !== 0) return null;
  const version = (size - 17) / 4;
  if (version < 1 || version > 4) return null;
  const oscuro = (row: number, col: number): boolean => modules[row]?.[col] === true;

  // 1. Información de formato: primera copia (columna 8 y fila 8).
  const posiciones: { row: number; col: number; bit: number }[] = [];
  for (let bit = 0; bit <= 5; bit += 1) posiciones.push({ row: bit, col: 8, bit });
  posiciones.push({ row: 7, col: 8, bit: 6 });
  posiciones.push({ row: 8, col: 8, bit: 7 });
  for (let bit = 8; bit <= 14; bit += 1) posiciones.push({ row: size - 15 + bit, col: 8, bit });
  let formato = 0;
  for (const posicion of posiciones) {
    if (oscuro(posicion.row, posicion.col)) formato |= 1 << posicion.bit;
  }
  let mascara = -1;
  for (let mask = 0; mask < 8 && mascara < 0; mask += 1) {
    if (bitsDeFormato('M', mask) === formato || bitsDeFormato('L', mask) === formato) mascara = mask;
  }
  if (mascara < 0) return null;

  // 2. Mapa de módulos reservados (localizadores, sincronización, alineación y formato).
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

  // 3. Recorrido en zigzag deshaciendo la máscara.
  const funcionMascara = MASCARAS[mascara];
  if (funcionMascara === undefined) return null;
  const bits: number[] = [];
  let upward = true;
  for (let column = size - 1; column > 0; column -= 2) {
    if (column === 6) column = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = column - offset;
        if (reservado[row]?.[col] === true) continue;
        const bruto = oscuro(row, col);
        bits.push(funcionMascara(row, col) ? (bruto ? 0 : 1) : bruto ? 1 : 0);
      }
    }
    upward = !upward;
  }

  // 4. Modo byte: 4 bits de modo + 8 de longitud + los bytes.
  const leer = (inicio: number, longitud: number): number => {
    let valor = 0;
    for (let index = 0; index < longitud; index += 1) {
      valor = (valor << 1) | (bits[inicio + index] ?? 0);
    }
    return valor;
  };
  if (leer(0, 4) !== 0b0100) return null;
  const longitud = leer(4, 8);
  const bytes: number[] = [];
  for (let index = 0; index < longitud; index += 1) {
    bytes.push(leer(12 + index * 8, 8));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
