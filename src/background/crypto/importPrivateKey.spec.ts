// @vitest-environment node
/**
 * `src/background/crypto/importPrivateKey.spec.ts` — M10 + M61
 * (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre `CA-RF-05`: `0x` + 64 hex **dentro del rango de secp256k1** (`0 < d < n`), cálculo de la
 * dirección con checksum EIP-55 y descarte de la clave fuera de rango. La detección de duplicados
 * es de M28 y se prueba en `src/background/accounts.spec.ts`.
 *
 * Entorno `node`: ver la cabecera de `mnemonic.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import { SECP256K1_N_HEX } from '../../shared/constants';
import {
  addressFromPrivateKey,
  importPrivateKey,
  isPrivateKeyForAddress,
  maskPrivateKeyInput,
} from './importAccount';
import {
  PRIVATE_KEY_HEX_LENGTH,
  SECP256K1_N,
  isPrivateKeyInSecp256k1Range,
  isPrivateKeyShape,
  maskPrivateKey,
  validatePrivateKey,
} from '../../shared/validation/privateKey';

/** Clave privada 1 de secp256k1: el escalar válido más pequeño. */
const KEY_ONE = `0x${'1'.padStart(64, '0')}`;

/** Clave 2: la siguiente del grupo. */
const KEY_TWO = `0x${'2'.padStart(64, '0')}`;

/** Clave `n - 1`: el escalar válido más grande de secp256k1. */
const KEY_N_MINUS_ONE = `0x${(SECP256K1_N - 1n).toString(16).padStart(64, '0')}`;

/** Clave `n`: FUERA del rango (el orden del grupo no es un escalar válido). */
const KEY_N = `0x${SECP256K1_N.toString(16).padStart(64, '0')}`;

/** Clave cero: FUERA del rango (`d > 0`). */
const KEY_ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

/** Direcciones reales de las claves 1, 2 y n-1 (calculadas con `ethers`, valor BIP-44/secp256k1). */
const ADDRESS_ONE = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const ADDRESS_TWO = '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF';
const ADDRESS_N_MINUS_ONE = '0x80C0dbf239224071c59dD8970ab9d542E3414aB2';

/** Clave privada de la cuenta 0 de Anvil (conocida y pública: es la de desarrollo). */
const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('M61 · forma y rango de secp256k1', () => {
  it('exige `0x` más 64 caracteres hexadecimales', () => {
    expect(PRIVATE_KEY_HEX_LENGTH).toBe(64);
    expect(isPrivateKeyShape(KEY_ONE)).toBe(true);
    expect(isPrivateKeyShape(`0x${'a'.repeat(63)}`)).toBe(false);
    expect(isPrivateKeyShape(`0x${'a'.repeat(65)}`)).toBe(false);
    expect(isPrivateKeyShape(KEY_ONE.slice(2))).toBe(false);
    expect(isPrivateKeyShape(`${KEY_ONE}00`)).toBe(false);
  });

  it('acepta los extremos del rango: 1 y n-1', () => {
    expect(SECP256K1_N).toBe(BigInt(SECP256K1_N_HEX));
    expect(isPrivateKeyInSecp256k1Range(KEY_ONE)).toBe(true);
    expect(isPrivateKeyInSecp256k1Range(KEY_N_MINUS_ONE)).toBe(true);
    expect(validatePrivateKey(KEY_ONE).problem).toBeNull();
    expect(validatePrivateKey(KEY_N_MINUS_ONE).problem).toBeNull();
  });

  it('rechaza 0 y n por estar fuera del rango', () => {
    expect(isPrivateKeyInSecp256k1Range(KEY_ZERO)).toBe(false);
    expect(isPrivateKeyInSecp256k1Range(KEY_N)).toBe(false);
    expect(validatePrivateKey(KEY_ZERO).problem).toBe('range');
    expect(validatePrivateKey(KEY_N).problem).toBe('range');
  });

  it('un fallo de rango se informa con `-32602 invalidPrivateKey` y no calcula dirección', () => {
    const check = validatePrivateKey(KEY_N);
    expect(check.valid).toBe(false);
    expect(check.privateKey).toBeNull();
    expect(check.error?.code).toBe(-32602);
    expect(check.error?.message).toContain('secp256k1');
    expect(addressFromPrivateKey(KEY_N)).toBeNull();
  });

  it('normaliza a minúsculas y recorta los espacios de la entrada', () => {
    expect(validatePrivateKey(`  ${KEY_ONE.toUpperCase()}  `).privateKey).toBe(KEY_ONE);
    expect(addressFromPrivateKey(` ${ANVIL_KEY0.toUpperCase()} `)).toBe(ANVIL_ADDRESS0);
  });

  it('rechaza la entrada vacía y la que no es cadena con el mismo error', () => {
    expect(validatePrivateKey('')).toMatchObject({ valid: false, problem: 'empty', privateKey: null });
    expect(validatePrivateKey(null).problem).toBe('empty');
    expect(validatePrivateKey(undefined).error?.code).toBe(-32602);
  });
});

describe('M10 · dirección derivada con checksum EIP-55', () => {
  it('calcula la dirección real de las claves 1, 2 y n-1', () => {
    expect(addressFromPrivateKey(KEY_ONE)).toBe(ADDRESS_ONE);
    expect(addressFromPrivateKey(KEY_TWO)).toBe(ADDRESS_TWO);
    expect(addressFromPrivateKey(KEY_N_MINUS_ONE)).toBe(ADDRESS_N_MINUS_ONE);
  });

  it('devuelve la dirección en su forma EIP-55 (mayúsculas mezcladas, no todo minúsculas)', () => {
    const address = addressFromPrivateKey(ANVIL_KEY0);
    expect(address).toBe(ANVIL_ADDRESS0);
    expect(address).not.toBe(ANVIL_ADDRESS0.toLowerCase());
    // 20 bytes en hex = 40 caracteres, y la forma persistida es la checksummed.
    expect(address?.slice(2)).toHaveLength(40);
    expect(/[A-F]/.test(address?.slice(2) ?? '')).toBe(true);
    expect(/[a-f]/.test(address?.slice(2) ?? '')).toBe(true);
  });

  it('la misma clave produce siempre la misma dirección', () => {
    expect(addressFromPrivateKey(ANVIL_KEY0)).toBe(addressFromPrivateKey(ANVIL_KEY0.toUpperCase()));
  });

  it('`importPrivateKey` devuelve el candidato con clave normalizada y dirección EIP-55', () => {
    const candidate = importPrivateKey(ANVIL_KEY0.toUpperCase());
    expect(candidate).toEqual({ address: ANVIL_ADDRESS0, privateKey: ANVIL_KEY0 });
    expect(importPrivateKey(KEY_N)).toBeNull();
    expect(importPrivateKey('no-es-una-clave')).toBeNull();
  });
});

describe('M10 · contraste clave ↔ dirección (M13)', () => {
  it('reconoce la pareja correcta sin distinguir mayúsculas', () => {
    expect(isPrivateKeyForAddress(ANVIL_KEY0, ANVIL_ADDRESS0)).toBe(true);
    expect(isPrivateKeyForAddress(ANVIL_KEY0, ANVIL_ADDRESS0.toLowerCase())).toBe(true);
    expect(isPrivateKeyForAddress(ANVIL_KEY0, ADDRESS_ONE)).toBe(false);
    expect(isPrivateKeyForAddress(KEY_N, ANVIL_ADDRESS0)).toBe(false);
    expect(isPrivateKeyForAddress('basura', ANVIL_ADDRESS0)).toBe(false);
  });
});

describe('M61 · enmascarado para trazas (RNF-09)', () => {
  it('deja solo el prefijo y el sufijo: nunca la clave completa', () => {
    const masked = maskPrivateKey(ANVIL_KEY0);
    expect(masked).toBe('0xac09…ff80');
    expect(masked.includes(ANVIL_KEY0.slice(6, -4))).toBe(false);
    expect(maskPrivateKeyInput(ANVIL_KEY0)).toBe(masked);
  });

  it('no filtra nada cuando la entrada no tiene forma de clave', () => {
    expect(maskPrivateKey('secreto-a-mano')).toBe('0x…');
    expect(maskPrivateKey(null)).toBe('0x…');
  });
});
