/**
 * M62 — `src/shared/format.ts`
 * Formato de importes, direcciones y marcas de tiempo para TODA la UI
 * (`documento_tecnico.md` §2.4 M62, §5.2; `requerimientos.md` RF-34).
 *
 * Reglas que implementa:
 * - ETH con **4 decimales** ({@link ETH_DISPLAY_DECIMALS}) y **sin** separador de millares, para
 *   que el valor se pueda copiar sin ambigüedad. La variante española con coma decimal se
 *   expone aparte ({@link formatEthEs}) porque el separador no puede adivinarse.
 * - Direcciones recortadas a `0x1234…abcd` (`identidad_visual.md` §5: prefijo de 6 caracteres,
 *   sufijo de 4 y elipsis U+2026, no tres puntos).
 * - Marcas de tiempo en formato español determinista `dd/mm/aaaa hh:mm:ss` (sin depender del
 *   `Intl` del entorno).
 *
 * Sin dependencias: aritmética `bigint` y cadenas. Este módulo lo consume el popup, así que
 * NO importa `ethers` (RNF-14: el bundle de `ethers` vive solo en el Service Worker).
 */

import {
  ADDRESS_SHORT_PREFIX,
  ADDRESS_SHORT_SUFFIX,
  ETH_DECIMALS,
  ETH_DISPLAY_DECIMALS,
  SHORT_ELLIPSIS,
} from './constants';
import type { WeiString } from './types';

/** Separa un valor en wei en sus partes entera y fraccionaria de 18 dígitos. */
const splitWei = (value: WeiString | bigint): { integer: string; fraction: string; negative: boolean } => {
  const raw = typeof value === 'bigint' ? value : BigInt(value.trim().length === 0 ? '0' : value.trim());
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const scale = 10n ** BigInt(ETH_DECIMALS);
  const integer = (absolute / scale).toString();
  const fraction = (absolute % scale).toString().padStart(ETH_DECIMALS, '0');
  return { integer, fraction, negative };
};

/**
 * Importe en ETH con `decimals` decimales, **truncando** (nunca redondeando hacia arriba: la UI
 * no debe mostrar más saldo del que existe) y con punto decimal.
 */
export const formatEth = (value: WeiString | bigint, decimals: number = ETH_DISPLAY_DECIMALS): string => {
  const { integer, fraction, negative } = splitWei(value);
  const cut = fraction.slice(0, Math.max(0, decimals));
  const padded = cut.padEnd(Math.max(0, decimals), '0');
  const body = decimals > 0 ? `${integer}.${padded}` : integer;
  return negative ? `-${body}` : body;
};

/** Igual que {@link formatEth} pero con **coma** decimal (UI en español, `CA-RT-10`). */
export const formatEthEs = (value: WeiString | bigint, decimals: number = ETH_DISPLAY_DECIMALS): string =>
  formatEth(value, decimals).replace('.', ',');

/** Importe con su símbolo: `1,0000 ETH` (el símbolo por defecto es el de la red Anvil). */
export const formatEthWithSymbol = (
  value: WeiString | bigint,
  symbol = 'ETH',
  decimals: number = ETH_DISPLAY_DECIMALS,
): string => `${formatEthEs(value, decimals)} ${symbol}`;

/**
 * Recorta una cadena hexadecimal larga a `0x1234…abcd`: prefijo de 6 caracteres (incluye el
 * `0x`), elipsis y sufijo de 4. Si la entrada es más corta que el recorte, se devuelve tal cual.
 */
export const shortHex = (
  value: string,
  prefix: number = ADDRESS_SHORT_PREFIX,
  suffix: number = ADDRESS_SHORT_SUFFIX,
): string => {
  const text = value.trim();
  if (text.length <= prefix + suffix) {
    return text;
  }
  return `${text.slice(0, prefix)}${SHORT_ELLIPSIS}${text.slice(text.length - suffix)}`;
};

/** Dirección recortada `0x1234…abcd` (RF-34). */
export const formatAddress = (address: string): string => shortHex(address);

/** Hash de transacción recortado con el mismo criterio que una dirección. */
export const formatTxHash = (hash: string): string => shortHex(hash);

/**
 * Marca de tiempo en formato español determinista `dd/mm/aaaa hh:mm:ss`. Se implementa a mano
 * (y no con `Intl`) para que la salida sea idéntica en el popup, en los logs y en las pruebas.
 */
export const formatTimestamp = (epochMs: number): string => {
  if (!Number.isFinite(epochMs)) {
    return '';
  }
  const date = new Date(epochMs);
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear().toString();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

/** Conteo de palabras de una frase, para la etiqueta de la UI (`12/12 palabras`). */
export const formatWordCount = (count: number, expected: number): string => `${count}/${expected}`;

/** Pluraliza en español un sustantivo contable: `1 cuenta` / `3 cuentas`. */
export const pluralize = (count: number, singular: string, plural: string): string =>
  count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
