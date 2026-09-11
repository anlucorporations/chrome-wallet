/**
 * `src/shared/qr.spec.ts` — M63 (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre `CA-RF-07` en la capa que le corresponde: el QR de la dirección se genera **sin red y sin
 * dependencias remotas** (RNF-20 / RT-03) y el símbolo es **decodificable**. Para que la aserción
 * no sea tautológica, el descriptor lee el símbolo **hacia atrás** con la misma geometría del
 * estándar (información de formato, colocación en zigzag, máscara y bloques Reed-Solomon) y
 * comprueba que el texto recuperado es EXACTAMENTE la dirección pedida.
 *
 * La igualdad «dirección mostrada = portapapeles = QR» se verifica además sobre el popup real en
 * `e2e/03-recibir.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { Address } from './types';
import {
  QR_BYTE_CAPACITY,
  QR_DEFAULT_ECC,
  QR_QUIET_ZONE,
  QR_SUPPORTED_VERSIONS,
  encodeAddressQr,
  encodeQr,
  ethereumUri,
  formatBits,
  qrToPath,
  qrToSvg,
  qrToText,
  rsBlockIsValid,
  type QrCode,
  type QrEccLevel,
} from './qr';

/** Dirección EIP-55 real de la cuenta 0 de Anvil (42 caracteres: entra en la versión 3-M). */
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;

/** Dirección EIP-55 real de la cuenta 1 de Anvil. */
const ANVIL_ADDRESS1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;

// ---------------------------------------------------------------------------
// Descriptor del símbolo: misma geometría que el codificador, en sentido inverso
// ---------------------------------------------------------------------------

/** Centros de los patrones de alineación (ISO/IEC 18004, anexo E) para las versiones 1..4. */
const CENTROS_ALINEACION: Readonly<Record<number, readonly number[]>> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
};

/** Módulos de función (no llevan datos): localizadores, sincronización, alineación y formato. */
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
  // Información de formato: tira vertical (columna 8) y horizontal (fila 8).
  for (let bit = 0; bit <= 5; bit += 1) marcar(bit, 8);
  marcar(7, 8);
  marcar(8, 8);
  for (let bit = 8; bit <= 14; bit += 1) marcar(size - 15 + bit, 8);
  for (let bit = 0; bit <= 7; bit += 1) marcar(8, size - 1 - bit);
  marcar(8, 7);
  for (let bit = 9; bit <= 14; bit += 1) marcar(8, 14 - bit);
  return reservado;
};

/** Lee la información de formato de su primera copia y deduce el nivel y la máscara. */
const leerFormato = (qr: QrCode): { bits: number; ecc: QrEccLevel; mask: number } => {
  const size = qr.size;
  const posiciones: { row: number; col: number; bit: number }[] = [];
  for (let bit = 0; bit <= 5; bit += 1) posiciones.push({ row: bit, col: 8, bit });
  posiciones.push({ row: 7, col: 8, bit: 6 });
  posiciones.push({ row: 8, col: 8, bit: 7 });
  for (let bit = 8; bit <= 14; bit += 1) posiciones.push({ row: size - 15 + bit, col: 8, bit });
  let bits = 0;
  for (const posicion of posiciones) {
    if (qr.modules[posicion.row]?.[posicion.col] === true) bits |= 1 << posicion.bit;
  }
  const combinaciones: [QrEccLevel, number][] = [];
  for (let mask = 0; mask < 8; mask += 1) {
    combinaciones.push(['L', mask]);
    combinaciones.push(['M', mask]);
  }
  for (const [ecc, mask] of combinaciones) {
    if (formatBits(ecc, mask) === bits) return { bits, ecc, mask };
  }
  throw new Error(`información de formato ilegible: 0x${bits.toString(16)}`);
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

/** Recorre la región de datos en zigzag y devuelve el flujo de bits (sin máscara aplicada). */
const leerBitsDeDatos = (qr: QrCode, mask: number): number[] => {
  const size = qr.size;
  const reservado = mapaReservado(qr.version, size);
  const mascara = MASCARAS[mask];
  if (mascara === undefined) throw new Error(`máscara fuera de rango: ${mask}`);
  const bits: number[] = [];
  let upward = true;
  for (let column = size - 1; column > 0; column -= 2) {
    if (column === 6) column = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = column - offset;
        if (reservado[row]?.[col] === true) continue;
        const bruto = qr.modules[row]?.[col] === true;
        bits.push(mascara(row, col) ? (bruto ? 0 : 1) : bruto ? 1 : 0);
      }
    }
    upward = !upward;
  }
  return bits;
};

/** Descodifica el modo byte de un símbolo ya construido y devuelve el texto. */
const decodificar = (qr: QrCode): string => {
  const { mask } = leerFormato(qr);
  const bits = leerBitsDeDatos(qr, mask);
  const leer = (inicio: number, longitud: number): number => {
    let valor = 0;
    for (let index = 0; index < longitud; index += 1) {
      valor = (valor << 1) | (bits[inicio + index] ?? 0);
    }
    return valor;
  };
  const modo = leer(0, 4);
  if (modo !== 0b0100) throw new Error(`modo inesperado: ${modo}`);
  const longitud = leer(4, 8);
  const bytes: number[] = [];
  for (let index = 0; index < longitud; index += 1) {
    bytes.push(leer(12 + index * 8, 8));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
};

describe('M63 · estructura del símbolo', () => {
  it('codifica una dirección en la versión 3-M y el lado es 17 + 4·versión', () => {
    const result = encodeAddressQr(ANVIL_ADDRESS0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.qr.version).toBe(3);
    expect(result.qr.ecc).toBe('M');
    expect(result.qr.ecc).toBe(QR_DEFAULT_ECC);
    expect(result.qr.size).toBe(29);
    expect(result.qr.size).toBe(17 + 4 * result.qr.version);
    expect(result.qr.modules).toHaveLength(29);
    expect(result.qr.modules.every((row) => row.length === 29)).toBe(true);
  });

  it('elige la versión más pequeña que admite la carga', () => {
    const capacidad1M = QR_BYTE_CAPACITY['1-M'] ?? 0;
    const v1 = encodeQr('A'.repeat(capacidad1M));
    expect(v1.ok && v1.qr.version).toBe(1);
    const v2 = encodeQr('A'.repeat(QR_BYTE_CAPACITY['2-M'] ?? 0));
    expect(v2.ok && v2.qr.version).toBe(2);
    // El URI `ethereum:` de 51 caracteres entra en la versión 3-L.
    const uri = ethereumUri(ANVIL_ADDRESS0);
    expect(uri).toBe(`ethereum:${ANVIL_ADDRESS0}`);
    expect(uri).toHaveLength(51);
    const conRed = encodeQr(uri, 'L');
    expect(conRed.ok && conRed.qr.version).toBe(3);
    expect(QR_SUPPORTED_VERSIONS).toEqual([1, 2, 3, 4]);
  });

  it('rechaza la carga vacía y la que no cabe, sin dibujar un QR incorrecto', () => {
    expect(encodeQr('')).toEqual({ ok: false, reason: 'empty-payload' });
    const gigante = 'A'.repeat((QR_BYTE_CAPACITY['4-M'] ?? 0) + 1);
    expect(encodeQr(gigante)).toEqual({ ok: false, reason: 'payload-too-large' });
    // El nivel M admite menos bytes que el L para la misma versión.
    expect(QR_BYTE_CAPACITY['1-M']).toBeLessThan(QR_BYTE_CAPACITY['1-L'] ?? 0);
  });

  it('coloca los tres localizadores con su patrón 7×7 y el módulo oscuro fijo', () => {
    const result = encodeAddressQr(ANVIL_ADDRESS0);
    if (!result.ok) throw new Error('el QR no se pudo construir');
    const { modules, size } = result.qr;
    const oscuro = (row: number, col: number): boolean => modules[row]?.[col] === true;
    // Esquina superior izquierda: anillo oscuro, separación clara y núcleo 3×3 oscuro.
    expect(oscuro(0, 0)).toBe(true);
    expect(oscuro(0, 6)).toBe(true);
    expect(oscuro(6, 0)).toBe(true);
    expect(oscuro(1, 1)).toBe(false);
    expect(oscuro(3, 3)).toBe(true);
    expect(oscuro(7, 7)).toBe(false);
    // Las tres esquinas.
    expect(oscuro(0, size - 1)).toBe(true);
    expect(oscuro(size - 1, 0)).toBe(true);
    // Patrón de sincronización alterno en la fila 6.
    expect(oscuro(6, 8)).toBe(true);
    expect(oscuro(6, 9)).toBe(false);
    // Módulo oscuro fijo.
    expect(oscuro(size - 8, 8)).toBe(true);
  });
});

describe('M63 · corrección de errores (Reed-Solomon)', () => {
  it('la información de formato es legible y coherente con el nivel y la máscara', () => {
    for (const address of [ANVIL_ADDRESS0, ANVIL_ADDRESS1]) {
      const result = encodeAddressQr(address);
      if (!result.ok) throw new Error('el QR no se pudo construir');
      const formato = leerFormato(result.qr);
      expect(formato.ecc).toBe(result.qr.ecc);
      expect(formato.mask).toBe(result.qr.maskPattern);
      expect(formato.bits).toBe(formatBits(result.qr.ecc, result.qr.maskPattern));
    }
    // Valores del estándar: L/0 = 111011111000100 y M/0 = 101010000010010.
    expect(formatBits('L', 0)).toBe(0b111011111000100);
    expect(formatBits('M', 0)).toBe(0b101010000010010);
  });

  it('los bloques Reed-Solomon reconstruidos tienen los síndromes nulos', () => {
    const result = encodeAddressQr(ANVIL_ADDRESS0);
    if (!result.ok) throw new Error('el QR no se pudo construir');
    const { mask } = leerFormato(result.qr);
    const bits = leerBitsDeDatos(result.qr, mask);
    // 70 palabras en v3-M: 44 de datos + 26 de corrección.
    const totalPalabras = 70;
    const palabras: number[] = [];
    for (let index = 0; index + 8 <= totalPalabras * 8; index += 8) {
      let byte = 0;
      for (let offset = 0; offset < 8; offset += 1) {
        byte = (byte << 1) | (bits[index + offset] ?? 0);
      }
      palabras.push(byte);
    }
    expect(palabras).toHaveLength(totalPalabras);
    expect(rsBlockIsValid(palabras, 26)).toBe(true);
    // Un bloque alterado deja de ser válido: la comprobación detecta el daño.
    const danado = [...palabras];
    danado[3] = (danado[3] ?? 0) ^ 0xff;
    expect(rsBlockIsValid(danado, 26)).toBe(false);
  });

  it('la máscara elegida está en el rango 0..7 y dos direcciones dan símbolos distintos', () => {
    const result = encodeAddressQr(ANVIL_ADDRESS0);
    if (!result.ok) throw new Error('el QR no se pudo construir');
    expect(result.qr.maskPattern).toBeGreaterThanOrEqual(0);
    expect(result.qr.maskPattern).toBeLessThanOrEqual(7);
    const otro = encodeAddressQr(ANVIL_ADDRESS1);
    if (!otro.ok) throw new Error('el segundo QR no se pudo construir');
    expect(qrToText(result.qr)).not.toBe(qrToText(otro.qr));
  });
});

describe('M63 · el símbolo es decodificable (CA-RF-07)', () => {
  it('la dirección recuperada del símbolo es EXACTAMENTE la pedida', () => {
    for (const address of [ANVIL_ADDRESS0, ANVIL_ADDRESS1]) {
      const result = encodeAddressQr(address);
      if (!result.ok) throw new Error('el QR no se pudo construir');
      expect(decodificar(result.qr)).toBe(address);
    }
  });

  it('el texto recuperado coincide con la dirección y no con otra', () => {
    const result = encodeAddressQr(ANVIL_ADDRESS0);
    if (!result.ok) throw new Error('el QR no se pudo construir');
    const recuperado = decodificar(result.qr);
    expect(recuperado).toHaveLength(42);
    expect(recuperado).toBe(ANVIL_ADDRESS0);
    expect(recuperado).not.toBe(ANVIL_ADDRESS1);
  });

  it('un texto largo también se recupera entero', () => {
    const texto = `ethereum:${ANVIL_ADDRESS0}@0x7a69`;
    const result = encodeQr(texto, 'L');
    if (!result.ok) throw new Error('el QR no se pudo construir');
    expect(result.qr.version).toBeGreaterThanOrEqual(3);
    expect(decodificar(result.qr)).toBe(texto);
  });
});

describe('M63 · representaciones de salida (RNF-18 / CA-RT-05)', () => {
  it('el SVG es autocontenido: sin recursos remotos y con `currentColor`', () => {
    const result = encodeAddressQr(ANVIL_ADDRESS0);
    if (!result.ok) throw new Error('el QR no se pudo construir');
    const svg = qrToSvg(result.qr, { title: 'Dirección de recepción' });
    const extension = result.qr.size + QR_QUIET_ZONE * 2;
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(
      `viewBox="${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${extension} ${extension}"`,
    );
    expect(svg).toContain(`width="${extension * 8}"`);
    expect(svg).toContain(`height="${extension * 8}"`);
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain('<title>Dirección de recepción</title>');
    // Sin red (RNF-20 / RT-03): el ÚNICO `http://` admisible es el namespace XML del SVG, que
    // no se descarga; ninguna URL de CDN ni `url()` remota puede aparecer.
    expect(svg.match(/https?:\/\//g)).toHaveLength(1);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toMatch(/unpkg|jsdelivr|cdnjs|googleapis|gstatic/i);
    expect(svg).not.toMatch(/url\(\s*["']?https?:/i);
    // Sin literales de color (RNF-18): el color lo decide `tokens.css`.
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/rgb\(|hsl\(/);
  });

  it('el path tiene un rectángulo de 1×1 por módulo oscuro', () => {
    const result = encodeAddressQr(ANVIL_ADDRESS0);
    if (!result.ok) throw new Error('el QR no se pudo construir');
    const oscuros = result.qr.modules.flat().filter((dark) => dark).length;
    const path = qrToPath(result.qr);
    expect(path.match(/M\d+ \d+h1v1h-1z/g)).toHaveLength(oscuros);
    expect(oscuros).toBeGreaterThan(100);
    expect(oscuros).toBeLessThan(result.qr.size * result.qr.size);
  });

  it('la matriz como texto tiene el tamaño del símbolo en filas y columnas', () => {
    const result = encodeAddressQr(ANVIL_ADDRESS0);
    if (!result.ok) throw new Error('el QR no se pudo construir');
    const lineas = qrToText(result.qr).split('\n');
    expect(lineas).toHaveLength(result.qr.size);
    expect(lineas.every((linea) => linea.length === result.qr.size)).toBe(true);
  });

  it('`ethereumUri` compone el URI EIP-681 mínimo con y sin `chainId`', () => {
    expect(ethereumUri(ANVIL_ADDRESS0)).toBe(`ethereum:${ANVIL_ADDRESS0}`);
    expect(ethereumUri(ANVIL_ADDRESS0, '0x7a69')).toBe(`ethereum:${ANVIL_ADDRESS0}@0x7a69`);
  });
});
