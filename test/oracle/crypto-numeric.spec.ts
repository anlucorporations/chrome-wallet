/**
 * M11 — `src/background/crypto/sign.ts` (utilidades numéricas, spec del árbol `test/oracle/`)
 * Conversión ESTRICTA de los valores de la dApp y de la red a `bigint`/`number`: es la guarda que
 * impide que un valor no numérico llegue a la firma (**RF-40** y el contrato de §3.4: la vista
 * previa de M19 y el plazo de M15 dependen de estas conversiones). Este fichero completa las ramas
 * de `toBigIntOrNull`/`toChainIdNumber` para que el umbral de RAMAS de
 * `src/background/crypto/**` (RNF-17) se cumpla también al ejecutar SOLO `test/oracle`.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CHAIN_ID_DECIMAL } from '../../src/shared/constants';
import { chainIdHexOf, toBigIntOrNull, toChainIdNumber } from '../../src/background/crypto/sign';

describe('M11 · toBigIntOrNull: solo valores utilizables se convierten', () => {
  it('acepta bigint, enteros y cadenas decimales/hexadecimales', () => {
    expect(toBigIntOrNull(7n)).toBe(7n);
    expect(toBigIntOrNull(7)).toBe(7n);
    expect(toBigIntOrNull(' 7 ')).toBe(7n);
    expect(toBigIntOrNull('0x10')).toBe(16n);
  });

  it('rechaza números no enteros, cadenas vacías o ilegibles y cualquier otro tipo', () => {
    // Un número no entero NO se trunca en silencio.
    expect(toBigIntOrNull(1.5)).toBeNull();
    expect(toBigIntOrNull(Number.NaN)).toBeNull();
    expect(toBigIntOrNull(Number.POSITIVE_INFINITY)).toBeNull();
    // Una cadena vacía (o de espacios) no es un número.
    expect(toBigIntOrNull('')).toBeNull();
    expect(toBigIntOrNull('   ')).toBeNull();
    expect(toBigIntOrNull('no-numero')).toBeNull();
    expect(toBigIntOrNull(null)).toBeNull();
    expect(toBigIntOrNull(undefined)).toBeNull();
    expect(toBigIntOrNull({})).toBeNull();
  });
});

describe('M11 · toChainIdNumber: hexadecimal, decimal y respaldo normativo', () => {
  it('interpreta las dos formas y cae al `chainId` por defecto ante lo ilegible', () => {
    expect(toChainIdNumber(31337)).toBe(31337);
    expect(toChainIdNumber('0x7a69')).toBe(31337);
    expect(toChainIdNumber('0X7A69')).toBe(31337);
    expect(toChainIdNumber('31337')).toBe(31337);
    // Sin número utilizable se devuelve el `chainId` de la red por defecto (nunca `NaN`).
    expect(toChainIdNumber('no-numero')).toBe(DEFAULT_CHAIN_ID_DECIMAL);
    expect(toChainIdNumber(undefined)).toBe(DEFAULT_CHAIN_ID_DECIMAL);
    expect(toChainIdNumber({})).toBe(DEFAULT_CHAIN_ID_DECIMAL);
    // 1.5 no es un `chainId`: tampoco se trunca.
    expect(toChainIdNumber(1.5)).toBe(DEFAULT_CHAIN_ID_DECIMAL);
  });

  it('chainIdHexOf es la forma hexadecimal canónica del decimal', () => {
    expect(chainIdHexOf(31337)).toBe('0x7a69');
    expect(chainIdHexOf(1)).toBe('0x1');
    // Un valor que no es un entero no negativo NUNCA produce una forma hexadecimal inválida.
    expect(chainIdHexOf(-5)).toBe('0x7a69');
    expect(chainIdHexOf(Number.NaN)).toBe('0x7a69');
    expect(chainIdHexOf(1.5)).toBe('0x7a69');
    expect(chainIdHexOf(0)).toBe('0x0');
  });

  it('una CADENA no entera tampoco se trunca: cae al `chainId` por defecto', () => {
    // DEFECTO MEDIDO Y CORREGIDO (fase 4): la rama de cadena usaba `Number.parseInt` sin comprobar
    // la forma, así que truncaba en silencio (`'1.5' → 1`, `'31337abc' → 31337`) y aceptaba
    // NEGATIVOS (`'-5' → -5`), que no son un `chainId` y que además producían `'0x-5'` al
    // convertirlos a hexadecimal. El criterio es el MISMO que ya se aplicaba a los números.
    for (const entrada of ['1.5', '-5', '31337abc', '3 1337', '1e3', '0x', '0x7a69zz', '12,5']) {
      expect(toChainIdNumber(entrada), `«${entrada}»`).toBe(DEFAULT_CHAIN_ID_DECIMAL);
    }
    // Y las formas bien construidas siguen interpretándose (control positivo).
    expect(toChainIdNumber('0X7A69')).toBe(31337);
    expect(toChainIdNumber(' 0x7a69 ')).toBe(31337);
    expect(toChainIdNumber('1')).toBe(1);
    expect(toChainIdNumber('0x1')).toBe(1);
    // Un número negativo tampoco vale como `chainId`.
    expect(toChainIdNumber(-1)).toBe(DEFAULT_CHAIN_ID_DECIMAL);
    expect(toChainIdNumber(0)).toBe(0);
  });
});
