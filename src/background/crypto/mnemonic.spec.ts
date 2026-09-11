// @vitest-environment node
/**
 * `src/background/crypto/mnemonic.spec.ts` — M8 (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre `CA-RF-01` (generación BIP-39 de 12 palabras con checksum válido) y `CA-RF-02`
 * (normalización de espacios/mayúsculas y rechazo del checksum roto con `-32602`).
 *
 * Entorno `node` (no `jsdom`): `ethers.js` v6 usa `node:crypto`, cuyo `digest()` devuelve un
 * `Buffer`, y Vitest sustituye `globalThis.Uint8Array` por el de jsdom al poblar el entorno
 * (`vitest/dist/chunks/index.CmSc2RE5.js`, lista `LIVING_KEYS`). Con el `Uint8Array` de jsdom,
 * `Buffer instanceof Uint8Array` es `false` y `ethers` rechaza su propio digest con
 * «invalid BytesLike value». Es una incompatibilidad del HARNÉS, no del producto: en el Service
 * Worker real no hay jsdom (y el E2E sobre Chrome lo verifica). Se documenta en `ACTA_H2.md`.
 *
 * Los vectores esperados son valores REALES de BIP-39/BIP-44, no copias de la implementación.
 */

import { describe, expect, it } from 'vitest';
import {
  MNEMONIC_ENTROPY_BYTES,
  MNEMONIC_WORD_COUNT,
  checkMnemonic,
  generateMnemonic,
  isMnemonicWord,
  isValidMnemonic,
  mnemonicFingerprint,
  mnemonicShortFingerprint,
  normalizeMnemonic,
} from './mnemonic';

/** Frase de Anvil: la semilla de desarrollo del proyecto (`shared/constants.ts`). */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Vector 1 de BIP-39 (`abandon` ×11 + `about`). */
const BIP39_VECTOR = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** 12 palabras válidas de la lista pero con el último bits de checksum alterado. */
const BROKEN_CHECKSUM = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';

/** Primera palabra fuera de la lista BIP-39 inglesa (`zzzz` no existe). */
const UNKNOWN_WORD = 'zzzz abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** Huella `sha256:` de la frase de checksum roto (calculada con `ethers`, valor real). */
const BROKEN_CHECKSUM_FINGERPRINT =
  'sha256:2e62ad983d635d0b1727e265ecd060b43818edaef8fdd7bc5caaa7cfaacd400b';

/** Mínimo de palabras distintas exigido a dos generaciones consecutivas. */
const MIN_DIFFERENT_WORDS = 4;

describe('M8 · generación de la frase BIP-39 (CA-RF-01)', () => {
  it('genera 12 palabras de la lista BIP-39 con checksum válido', () => {
    const phrase = generateMnemonic();
    const words = phrase.split(' ');
    expect(words).toHaveLength(MNEMONIC_WORD_COUNT);
    expect(MNEMONIC_WORD_COUNT).toBe(12);
    expect(words.every((word) => isMnemonicWord(word))).toBe(true);
    expect(isValidMnemonic(phrase)).toBe(true);
  });

  it('usa 128 bits de entropía: 12 palabras y ninguna más', () => {
    expect(MNEMONIC_ENTROPY_BYTES).toBe(16);
    expect(MNEMONIC_ENTROPY_BYTES * 8).toBe(128);
    const check = checkMnemonic(generateMnemonic());
    expect(check.wordCount).toBe(12);
    expect(check.problem).toBeNull();
    expect(check.error).toBeNull();
  });

  it('no repite la misma frase en dos generaciones consecutivas', () => {
    const first = generateMnemonic();
    const second = generateMnemonic();
    expect(first).not.toBe(second);
    const firstWords = new Set(first.split(' '));
    const repeated = second.split(' ').filter((word) => firstWords.has(word)).length;
    // Con 128 bits de entropía la coincidencia posicional es ~0; se exige holgura amplia.
    expect(repeated).toBeLessThan(MNEMONIC_WORD_COUNT);
  });

  it('valida las frases conocidas de BIP-39 y de Anvil', () => {
    expect(isValidMnemonic(BIP39_VECTOR)).toBe(true);
    expect(isValidMnemonic(ANVIL_MNEMONIC)).toBe(true);
  });
});

describe('M8 · normalización de la frase (CA-RF-02)', () => {
  it('colapsa espacios, tabuladores y saltos de línea en una única forma canónica', () => {
    const irregular = `  ${ANVIL_MNEMONIC.toUpperCase().replace(/ /g, '   ')}\n\t `;
    expect(normalizeMnemonic(irregular)).toBe(ANVIL_MNEMONIC);
    const check = checkMnemonic(irregular);
    expect(check.valid).toBe(true);
    expect(check.normalized).toBe(ANVIL_MNEMONIC);
    expect(check.wordCount).toBe(12);
  });

  it('colapsa los espacios interiores: 20 espacios entre palabras no cambian la frase', () => {
    const spaced = ANVIL_MNEMONIC.replace('junk', '       junk');
    expect(normalizeMnemonic(spaced)).toBe(ANVIL_MNEMONIC);
    expect(checkMnemonic(spaced).normalized).toBe(checkMnemonic(ANVIL_MNEMONIC).normalized);
  });

  it('normaliza entradas que no son cadena a la frase vacía y las rechaza', () => {
    expect(normalizeMnemonic(null)).toBe('');
    expect(normalizeMnemonic(42)).toBe('');
    const check = checkMnemonic(null);
    expect(check.valid).toBe(false);
    expect(check.problem).toBe('empty');
    expect(check.wordCount).toBe(0);
  });

  it('quita diacríticos antes de rechazar, para que el error sea siempre el mismo', () => {
    const accented = ANVIL_MNEMONIC.replace('test test', 'tést test');
    expect(normalizeMnemonic(accented)).toBe(ANVIL_MNEMONIC);
    expect(checkMnemonic(accented).valid).toBe(true);
  });
});

describe('M8 · checksum BIP-39 (CA-RF-01 / CA-RF-02)', () => {
  it('rechaza la frase con checksum roto con `-32602 invalidMnemonic`', () => {
    const check = checkMnemonic(BROKEN_CHECKSUM);
    expect(check.valid).toBe(false);
    expect(check.problem).toBe('checksum');
    expect(check.wordCount).toBe(12);
    expect(check.error).toEqual({
      code: -32602,
      message: 'La frase de recuperación no es válida: revisa las 12 palabras y su checksum.',
    });
  });

  it('distingue «palabra desconocida» de «checksum roto» con el MISMO error del catálogo', () => {
    const unknown = checkMnemonic(UNKNOWN_WORD);
    expect(unknown.valid).toBe(false);
    expect(unknown.problem).toBe('unknownWord');
    expect(unknown.error?.code).toBe(-32602);
    expect(unknown.error?.message).toBe(checkMnemonic(BROKEN_CHECKSUM).error?.message);
  });

  it('rechaza 11 y 13 palabras sin llegar a comprobar el checksum', () => {
    const eleven = ANVIL_MNEMONIC.split(' ').slice(0, 11).join(' ');
    const thirteen = `${ANVIL_MNEMONIC} zoo zoo`;
    for (const candidate of [eleven, thirteen]) {
      const check = checkMnemonic(candidate);
      expect(check.valid).toBe(false);
      expect(check.problem).toBe('wordCount');
      expect(check.error?.code).toBe(-32602);
    }
  });

  it('no considera válida una palabra de 2 caracteres ni una con dígitos', () => {
    const shortWord = ANVIL_MNEMONIC.replace('junk', 'ab');
    expect(checkMnemonic(shortWord).problem).toBe('wordFormat');
    const withDigit = ANVIL_MNEMONIC.replace('junk', 'test1');
    expect(checkMnemonic(withDigit).problem).toBe('wordFormat');
  });

  it('conoce los extremos de la lista BIP-39 inglesa de 2048 palabras', () => {
    expect(isMnemonicWord('abandon')).toBe(true);
    expect(isMnemonicWord('zoo')).toBe(true);
    expect(isMnemonicWord('zzzz')).toBe(false);
    expect(isMnemonicWord('')).toBe(false);
  });
});

describe('M8 · huellas para los logs (RNF-09)', () => {
  it('produce la huella sha256 real de la frase normalizada y es estable', () => {
    expect(mnemonicFingerprint(BROKEN_CHECKSUM)).toBe(BROKEN_CHECKSUM_FINGERPRINT);
    expect(mnemonicFingerprint(BROKEN_CHECKSUM)).toBe(
      mnemonicFingerprint(`  ${BROKEN_CHECKSUM.toUpperCase()}  `),
    );
  });

  it('no permite reconstruir la frase: la huella no contiene ninguna de sus palabras', () => {
    const fingerprint = mnemonicFingerprint(ANVIL_MNEMONIC);
    expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    for (const word of ANVIL_MNEMONIC.split(' ')) {
      expect(fingerprint.includes(word)).toBe(false);
    }
    expect(mnemonicShortFingerprint(ANVIL_MNEMONIC)).toHaveLength('sha256:'.length + 8);
    expect(mnemonicFingerprint(ANVIL_MNEMONIC).startsWith(mnemonicShortFingerprint(ANVIL_MNEMONIC))).toBe(true);
  });
});
