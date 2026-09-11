/**
 * M8 — `src/background/crypto/mnemonic.ts`
 * BIP-39 en el Service Worker: generación (128 bits → 12 palabras), normalización y
 * **checksum** (`documento_tecnico.md` §2.4 M8, §3.3; `plan_desarrollo.md` §3.2.5 tareas 2.1/2.2).
 *
 * Única librería criptográfica permitida: **`ethers.js` v6** (RT-02). Aquí se usa
 * `Mnemonic.fromEntropy`, `Mnemonic.isValidMnemonic` y la lista `wordlists.en`.
 *
 * La normalización y el recuento de palabras NO se duplican: son de M59
 * (`shared/validation/mnemonic.ts`), que es la regla compartida entre la UI y el SW. Este
 * módulo añade lo que la UI no puede hacer sin criptografía: la pertenencia a la lista de 2048
 * palabras y el checksum.
 *
 * El valor NUNCA se registra ni viaja por mensaje: para logs hay {@link mnemonicFingerprint}
 * (`sha256:`), que no permite reconstruir la frase.
 */

import { LangEn, Mnemonic, randomBytes, sha256, wordlists } from 'ethers';
import type { Eip1193Error } from '../../shared/types';
import { invalidMnemonicError } from '../rpc/errors';
import {
  MNEMONIC_WORD_COUNT,
  normalizeMnemonic,
  splitMnemonicWords,
  validateMnemonicShape,
} from '../../shared/validation/mnemonic';

// La normalización y el recuento son de M59: se reexportan para que el dominio del SW tenga un
// único punto de entrada sin volver a implementar la regla.
export { MNEMONIC_WORD_COUNT, normalizeMnemonic };

/** Lista BIP-39 inglesa (2048 palabras): instancia única del Service Worker. */
const ENGLISH_WORDLIST = wordlists.en ?? LangEn.wordlist();

/** Entropía de una frase de 12 palabras: 128 bits (RF-01). */
export const MNEMONIC_ENTROPY_BYTES = 16;

/** Causa concreta del fallo: forma (M59), palabra desconocida o checksum BIP-39. */
export type MnemonicProblem =
  | 'empty'
  | 'wordCount'
  | 'wordFormat'
  | 'unknownWord'
  | 'checksum'
  | null;

/** Veredicto COMPLETO (forma + lista de palabras + checksum). */
export interface MnemonicCheck {
  valid: boolean;
  normalized: string;
  wordCount: number;
  problem: MnemonicProblem;
  /** Error del catálogo (`-32602 invalidMnemonic`) o `null` si la frase es válida. */
  error: Eip1193Error | null;
}

/** ¿Está la palabra en la lista BIP-39 inglesa (2048 palabras)? */
export const isMnemonicWord = (word: string): boolean => {
  try {
    return ENGLISH_WORDLIST.getWordIndex(word) >= 0;
  } catch {
    return false;
  }
};

/**
 * Valida la frase completa: forma (M59), pertenencia a la lista y checksum BIP-39. Distingue
 * «palabra desconocida» de «checksum inválido» para que el diagnóstico sea útil, pero **ambos**
 * se comunican con el mismo error del catálogo (`-32602 invalidMnemonic`), que es la fuente
 * única de los literales.
 */
export const checkMnemonic = (input: unknown): MnemonicCheck => {
  const shape = validateMnemonicShape(input);
  if (!shape.valid) {
    return {
      valid: false,
      normalized: shape.normalized,
      wordCount: shape.wordCount,
      problem: shape.problem,
      error: shape.error,
    };
  }
  const words = splitMnemonicWords(shape.normalized);
  if (words.some((word) => !isMnemonicWord(word))) {
    return {
      valid: false,
      normalized: shape.normalized,
      wordCount: words.length,
      problem: 'unknownWord',
      error: invalidMnemonicError(),
    };
  }
  if (!Mnemonic.isValidMnemonic(shape.normalized, ENGLISH_WORDLIST)) {
    return {
      valid: false,
      normalized: shape.normalized,
      wordCount: words.length,
      problem: 'checksum',
      error: invalidMnemonicError(),
    };
  }
  return {
    valid: true,
    normalized: shape.normalized,
    wordCount: words.length,
    problem: null,
    error: null,
  };
};

/** Atajo booleano de {@link checkMnemonic} (es el `Mnemonic.isValidMnemonic` de `CA-RF-01`). */
export const isValidMnemonic = (input: unknown): boolean => checkMnemonic(input).valid;

/**
 * Genera una frase BIP-39 de **12 palabras** con 128 bits de entropía del CSPRNG
 * (`Mnemonic.fromEntropy`, que aplica el checksum BIP-39). Es el paso 1 de `CA-RF-01`.
 */
export const generateMnemonic = (): string => {
  // Motivo del arreglo (defecto estructural de H2): `randomBytes` de `ethers` v6 devuelve, según
  // el build que resuelva el empaquetador, un `Buffer` de Node en lugar de un `Uint8Array`
  // genuino, y `Mnemonic.fromEntropy` lo rechaza con «invalid BytesLike value» porque su
  // `getBytes` comprueba `value instanceof Uint8Array` (utils/data). La entropía se normaliza
  // SIEMPRE con `Uint8Array.from(...)`, que es la forma que exige la API v6 y produce un
  // `Uint8Array` propio del realm de la extensión (no un `Buffer` del reino de Node).
  const entropy = Uint8Array.from(randomBytes(MNEMONIC_ENTROPY_BYTES));
  return Mnemonic.fromEntropy(entropy, undefined, ENGLISH_WORDLIST).phrase;
};

/**
 * Huella de una frase para los logs y las comparaciones: `sha256:<hex>`. No revela la frase y
 * permite comprobar que un valor revelado es el mismo sin conservarlo (`diccionario_datos.md`
 * §3.10). NUNCA se persiste la frase junto a su huella en la misma entrada de log.
 */
export const mnemonicFingerprint = (input: unknown): string =>
  `sha256:${sha256(new TextEncoder().encode(normalizeMnemonic(input))).slice(2)}`;

/** Identificador estable de la frase para el log de arranque: `sha256:<8 hex>`. */
export const mnemonicShortFingerprint = (input: unknown): string =>
  mnemonicFingerprint(input).slice(0, 15);
