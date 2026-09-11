/**
 * M61 — `src/shared/validation/privateKey.ts`
 * Validación **estructural** de una clave privada para el popup y el SW
 * (`documento_tecnico.md` §2.4 M61, §3.3; `plan_desarrollo.md` §3.2.5 tareas 2.5 y 2.14).
 *
 * Reparto de responsabilidades (RT-02/RT-03 + RNF-14): aquí NO se usa `ethers` ni se hace
 * criptografía —el bundle de `ethers` vive solo en el Service Worker—. Se comprueban:
 *
 * 1. la forma `0x` + 64 caracteres hexadecimales;
 * 2. el **rango** de la curva secp256k1 (`0 < d < n`), que es una comparación aritmética con
 *    {@link SECP256K1_N_HEX} y por eso puede hacerse en la capa compartida.
 *
 * La comprobación criptográfica —derivar la dirección pública con `computeAddress` y
 * contrastarla— es del Service Worker: M10 (`crypto/importAccount.ts`) al importar y M13
 * (integridad) al arrancar. El error tipado de una clave inválida es siempre el del catálogo:
 * `-32602 invalidPrivateKey` de `diccionario_datos.md` §4.3.
 */

import { SECP256K1_N_HEX } from '../constants';
import type { Eip1193Error, Hex } from '../types';
import { invalidPrivateKeyError } from '../../background/rpc/errors';

/** Longitud exigida del cuerpo hexadecimal: 64 caracteres (32 bytes). */
export const PRIVATE_KEY_HEX_LENGTH = 64;

/** Forma canónica de una clave privada: `0x` + 64 hex. */
export const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** Orden del grupo de secp256k1 como `bigint` (fuente única: M57). */
export const SECP256K1_N = BigInt(SECP256K1_N_HEX);

/** Cota inferior del rango válido: `d > 0`. */
export const SECP256K1_MIN = 1n;

/** Causa concreta del fallo; `null` cuando la clave es válida. */
export type PrivateKeyProblem = 'empty' | 'format' | 'range' | null;

/** Veredicto de la validación estructural de una clave privada. */
export interface PrivateKeyCheck {
  valid: boolean;
  /** Clave en minúsculas (`0x…`), lista para `computeAddress`; `null` si no es válida. */
  privateKey: Hex | null;
  problem: PrivateKeyProblem;
  /** Error del catálogo (`-32602 invalidPrivateKey`) o `null`. */
  error: Eip1193Error | null;
}

/** Recorta la entrada y la pasa a minúsculas (la forma hexadecimal no distingue mayúsculas). */
export const normalizePrivateKeyInput = (input: unknown): string =>
  typeof input === 'string' ? input.trim().toLowerCase() : '';

/** ¿Tiene `value` la forma `0x` + 64 hex? */
export const isPrivateKeyShape = (value: unknown): boolean =>
  PRIVATE_KEY_PATTERN.test(normalizePrivateKeyInput(value));

/** ¿Está la clave dentro del rango válido de secp256k1 (`0 < d < n`)? */
export const isPrivateKeyInSecp256k1Range = (value: unknown): boolean => {
  const normalized = normalizePrivateKeyInput(value);
  if (!PRIVATE_KEY_PATTERN.test(normalized)) {
    return false;
  }
  const scalar = BigInt(normalized);
  return scalar >= SECP256K1_MIN && scalar < SECP256K1_N;
};

/**
 * Valida forma y rango. No lanza nunca: el fallo se describe con el error tipado
 * `-32602 invalidPrivateKey` del catálogo.
 */
export const validatePrivateKey = (input: unknown): PrivateKeyCheck => {
  const normalized = normalizePrivateKeyInput(input);
  const fail = (problem: Exclude<PrivateKeyProblem, null>): PrivateKeyCheck => ({
    valid: false,
    privateKey: null,
    problem,
    error: invalidPrivateKeyError(),
  });

  if (normalized.length === 0) {
    return fail('empty');
  }
  if (!PRIVATE_KEY_PATTERN.test(normalized)) {
    return fail('format');
  }
  if (!isPrivateKeyInSecp256k1Range(normalized)) {
    return fail('range');
  }
  return { valid: true, privateKey: normalized as Hex, problem: null, error: null };
};

/** Atajo booleano de {@link validatePrivateKey}. */
export const isValidPrivateKey = (input: unknown): boolean => validatePrivateKey(input).valid;

/**
 * Enmascara una clave privada para cualquier traza: `0xac09…ff80`. Nunca se persiste ni se
 * registra la clave completa (`diccionario_datos.md` §2.11, H-42).
 */
export const maskPrivateKey = (input: unknown): string => {
  const normalized = normalizePrivateKeyInput(input);
  if (!PRIVATE_KEY_PATTERN.test(normalized)) {
    return '0x…';
  }
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
};
