/**
 * M60 — `src/shared/validation/amount.ts`
 * Validación del importe en ETH y contraste con el saldo
 * (`documento_tecnico.md` §2.4 M60, §5.2; `plan_desarrollo.md` §3.2.5 tarea 2.14).
 *
 * Reparto de responsabilidades (RT-02/RT-03 + RNF-14): este módulo vive en `src/shared/` y lo
 * consume el popup, así que **no importa `ethers`**: el paso de ETH a wei se hace con
 * aritmética `bigint` exacta, sin coma flotante (un `Number` perdería precisión a partir de
 * 2^53 wei).
 *
 * Formato aceptado: dígitos decimales con **punto** como separador, hasta
 * {@link ETH_AMOUNT_MAX_DECIMALS} decimales (`RF-34`: ETH a 4 decimales) y sin notación
 * científica, signo ni separador de millares. El importe resultante debe caber en `uint256`.
 *
 * DEFECTO CERRADO (fase 4, fleco 2). `validateAmount` devolvía `error: null` en TODOS los fallos,
 * con el argumento de que `diccionario_datos.md` §4.3 no registraba la causa «importe inválido».
 * Esa causa SÍ existe desde la v1.9 (§4.3.1, fila `-32602 invalidAmount`, transcrita en
 * `EXTENDED_ERROR_CATALOG` de M6), de modo que un fallo de formato se describe con el error
 * TIPADO documentado —`{ code: -32602, message: «El importe no es válido: usa un número decimal
 * positivo con hasta 18 decimales.», data: { reason, problem } }`— y `problem` queda como detalle
 * de diagnóstico dentro de `data`. El saldo insuficiente sigue devolviéndose con
 * `insufficientFundsError()` de M6: la fuente única de los literales es §4.3.
 */

import { ETH_AMOUNT_MAX_DECIMALS, ETH_DECIMALS } from '../constants';
import type { Eip1193Error, WeiString } from '../types';
import { insufficientFundsError, invalidAmountError } from '../../background/rpc/errors';

/** Importe máximo representable en `uint256` (cota real del EVM). */
export const MAX_UINT256 = (1n << 256n) - 1n;

/** Forma aceptada: parte entera obligatoria y fracción opcional con punto. */
export const ETH_AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/;

/** Causa concreta del fallo; `null` cuando el importe es válido. */
export type AmountProblem = 'empty' | 'format' | 'decimals' | 'overflow' | null;

/** Veredicto de la validación de un importe. */
export interface AmountCheck {
  valid: boolean;
  /** Importe exacto en wei, como cadena decimal; `null` si no es válido. */
  wei: WeiString | null;
  /** Forma canónica con punto (`1.5`), sin ceros sobrantes; `null` si no es válido. */
  normalized: string | null;
  problem: AmountProblem;
  /**
   * Error del catálogo: `-32602 invalidAmount` en cualquier fallo de importe (§4.3.1) y `-32000
   * insufficientFunds` en el contraste con el saldo ({@link insufficientBalanceError}); `null`
   * solo cuando el importe es válido.
   */
  error: Eip1193Error | null;
}

/**
 * Convierte una cadena decimal de ETH a wei con aritmética exacta. `null` si no es válida.
 *
 * `maxDecimals` es la cota de decimales ACEPTADOS (por encima se rechaza con `null`). La escala
 * de wei es fija (18 decimales), así que un `maxDecimals` mayor que {@link ETH_DECIMALS} no puede
 * representarse: los dígitos por debajo del 18 se truncan hacia abajo (nunca se reinterpretan
 * como una magnitud mayor).
 */
export const ethToWei = (
  raw: unknown,
  maxDecimals: number = ETH_AMOUNT_MAX_DECIMALS,
): bigint | null => {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!ETH_AMOUNT_PATTERN.test(text)) {
    return null;
  }
  const [integerPart = '', fractionPart = ''] = text.split('.');
  if (fractionPart.length > maxDecimals) {
    return null;
  }
  // DEFECTO MEDIDO Y CORREGIDO (fase 4): `padEnd(ETH_DECIMALS, '0')` NO recorta. Con un
  // `maxDecimals` mayor que `ETH_DECIMALS` (18) la fracción conservaba todos sus dígitos y
  // `BigInt` la reinterpretaba como una magnitud 10^(n-18) veces mayor: `0.0000000000000000009`
  // con `maxDecimals = 19` devolvía 9 wei (cierto: 0,9 wei → 0). La escala de wei es FIJA (18
  // decimales), así que todo dígito por debajo del 18 se TRUNCA (nunca se expande la escala):
  // es la misma política de truncado hacia abajo que aplica `formatEth`.
  const scaledFraction = fractionPart.slice(0, ETH_DECIMALS).padEnd(ETH_DECIMALS, '0');
  const scale = 10n ** BigInt(ETH_DECIMALS);
  const wei = BigInt(integerPart) * scale + BigInt(scaledFraction.length === 0 ? '0' : scaledFraction);
  return wei > MAX_UINT256 ? null : wei;
};

/** Forma canónica de un importe válido: sin ceros a la derecha ni a la izquierda sobrantes. */
export const canonicalizeAmount = (raw: string): string => {
  const [integerPart = '0', fractionPart = ''] = raw.trim().split('.');
  const trimmedInteger = integerPart.replace(/^0+(?=\d)/, '');
  const trimmedFraction = fractionPart.replace(/0+$/, '');
  return trimmedFraction.length === 0 ? trimmedInteger : `${trimmedInteger}.${trimmedFraction}`;
};

/** Valida un importe en ETH. Nunca lanza. */
export const validateAmount = (
  raw: unknown,
  maxDecimals: number = ETH_AMOUNT_MAX_DECIMALS,
): AmountCheck => {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const fail = (problem: Exclude<AmountProblem, null>): AmountCheck => ({
    valid: false,
    wei: null,
    normalized: null,
    problem,
    // Error TIPADO de §4.3.1 (`-32602 invalidAmount`): `data.reason` identifica la causa y
    // `data.problem` conserva el diagnóstico interno (`empty`/`format`/`decimals`/`overflow`).
    error: invalidAmountError({ reason: 'invalid-amount', problem }),
  });

  if (text.length === 0) {
    return fail('empty');
  }
  if (!ETH_AMOUNT_PATTERN.test(text)) {
    return fail('format');
  }
  const fraction = text.split('.')[1] ?? '';
  if (fraction.length > maxDecimals) {
    return fail('decimals');
  }
  const wei = ethToWei(text, maxDecimals);
  if (wei === null) {
    return fail('overflow');
  }
  return {
    valid: true,
    wei: wei.toString(),
    normalized: canonicalizeAmount(text),
    problem: null,
    error: null,
  };
};

/** Atajo booleano de {@link validateAmount}. */
export const isValidAmount = (raw: unknown, maxDecimals: number = ETH_AMOUNT_MAX_DECIMALS): boolean =>
  validateAmount(raw, maxDecimals).valid;

/** Convierte a `bigint` una cantidad en wei (cadena decimal o `bigint`). */
export const toWeiBigInt = (value: WeiString | bigint): bigint =>
  typeof value === 'bigint' ? value : BigInt(value.trim().length === 0 ? '0' : value.trim());

/** Compara dos cantidades en wei: `-1`, `0` o `1`. */
export const compareWei = (a: WeiString | bigint, b: WeiString | bigint): -1 | 0 | 1 => {
  const left = toWeiBigInt(a);
  const right = toWeiBigInt(b);
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

/** ¿Cubre el saldo el importe indicado? (comparación exacta en wei). */
export const hasSufficientBalance = (
  amountWei: WeiString | bigint,
  balanceWei: WeiString | bigint,
): boolean => compareWei(amountWei, balanceWei) <= 0;

/**
 * Devuelve el error tipado `-32000 insufficientFunds` cuando el saldo no cubre el importe, o
 * `null` cuando sí lo cubre (el literal es el de `diccionario_datos.md` §4.3, vía M6).
 */
export const insufficientBalanceError = (
  amountWei: WeiString | bigint,
  balanceWei: WeiString | bigint,
): Eip1193Error | null =>
  hasSufficientBalance(amountWei, balanceWei)
    ? null
    : insufficientFundsError();
