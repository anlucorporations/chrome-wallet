/**
 * M59 — `src/shared/validation/mnemonic.ts`
 * Validación **estructural** de la frase BIP-39 para la UI y el SW
 * (`documento_tecnico.md` §2.4 M59, §3.3; `plan_desarrollo.md` §3.2.5 tareas 2.1/2.2/2.14).
 *
 * Reparto de responsabilidades (RT-02/RT-03 + RNF-14 + §3.2 «NO entra»): este módulo vive en
 * `src/shared/` y lo consume el popup, así que **no importa `ethers` ni hace criptografía**
 * (el bundle de `ethers` vive solo en el Service Worker). Aquí se comprueba la forma:
 * 12 palabras, minúsculas y separadas por espacios simples.
 *
 * La verificación **completa** (pertenencia a la lista de 2048 palabras y **checksum**
 * BIP-39) es del Service Worker: M8 (`crypto/mnemonic.ts`) y M13 (integridad al arrancar).
 * Un checksum inválido se responde al popup con `-32602 invalidMnemonic` de
 * `diccionario_datos.md` §4.3 (`CA-RF-02`).
 *
 * Este módulo es además la fuente única de la normalización y del recuento de palabras: M8
 * los reutiliza para no duplicar la regla (una palabra por espacio simple, minúsculas).
 */

import { invalidMnemonicError } from '../../background/rpc/errors';
import type { Eip1193Error } from '../types';

/** Número de palabras exigido: 12 (128 bits de entropía, RF-01/RF-02). */
export const MNEMONIC_WORD_COUNT = 12;

/** Longitud mínima y máxima de una palabra de la lista BIP-39 inglesa. */
export const MNEMONIC_WORD_MIN_LENGTH = 3;
export const MNEMONIC_WORD_MAX_LENGTH = 8;

/** Forma de una palabra BIP-39 en minúsculas (`abandon`, `zoo`). */
export const MNEMONIC_WORD_PATTERN = /^[a-z]+$/;

/** Causa concreta del fallo de forma; `null` cuando la forma es correcta. */
export type MnemonicShapeProblem = 'empty' | 'wordCount' | 'wordFormat' | null;

/** Veredicto de la validación estructural de la frase. */
export interface MnemonicShapeCheck {
  valid: boolean;
  /** Frase normalizada (minúsculas, espacios simples, sin acentos). */
  normalized: string;
  wordCount: number;
  problem: MnemonicShapeProblem;
  /** Error del catálogo (`-32602 invalidMnemonic`) o `null`. */
  error: Eip1193Error | null;
}

/**
 * Normaliza la frase: recorta, pasa a minúsculas, elimina diacríticos (NFKD), unifica
 * cualquier espacio en blanco en un espacio simple y quita los extremos. Es determinista: dos
 * entradas con espacios o mayúsculas irregulares producen la MISMA cadena (`CA-RF-02`).
 */
export const normalizeMnemonic = (input: unknown): string => {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    .normalize('NFKD')
    // Marcas diacríticas combinantes (NFKD): una palabra acentuada nunca es BIP-39, pero la
    // normalización debe ser estable ANTES de rechazarla, para que el error sea siempre el
    // mismo (`-32602 invalidMnemonic`) y no dependa del teclado del usuario.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

/** Palabras de la frase normalizada (lista vacía si no hay ninguna). */
export const splitMnemonicWords = (input: unknown): string[] => {
  const normalized = normalizeMnemonic(input);
  return normalized.length === 0 ? [] : normalized.split(' ');
};

/** Número de palabras de la frase normalizada. */
export const mnemonicWordCount = (input: unknown): number => splitMnemonicWords(input).length;

/**
 * Valida la FORMA de la frase (recuento y alfabeto). El checksum BIP-39 NO se comprueba
 * aquí: es criptografía y vive en el Service Worker (M8).
 */
export const validateMnemonicShape = (input: unknown): MnemonicShapeCheck => {
  const normalized = normalizeMnemonic(input);
  const words = normalized.length === 0 ? [] : normalized.split(' ');

  const fail = (problem: Exclude<MnemonicShapeProblem, null>): MnemonicShapeCheck => ({
    valid: false,
    normalized,
    wordCount: words.length,
    problem,
    error: invalidMnemonicError(),
  });

  if (words.length === 0) {
    return fail('empty');
  }
  if (words.length !== MNEMONIC_WORD_COUNT) {
    return fail('wordCount');
  }
  const malformed = words.some(
    (word) =>
      !MNEMONIC_WORD_PATTERN.test(word) ||
      word.length < MNEMONIC_WORD_MIN_LENGTH ||
      word.length > MNEMONIC_WORD_MAX_LENGTH,
  );
  if (malformed) {
    return fail('wordFormat');
  }
  return { valid: true, normalized, wordCount: words.length, problem: null, error: null };
};

/** Atajo booleano de {@link validateMnemonicShape}. */
export const isMnemonicShapeValid = (input: unknown): boolean => validateMnemonicShape(input).valid;

/** ¿Son la misma frase dos entradas con espacios o mayúsculas irregulares? (`CA-RF-02`). */
export const sameMnemonic = (a: unknown, b: unknown): boolean =>
  normalizeMnemonic(a) === normalizeMnemonic(b) && normalizeMnemonic(a).length > 0;
