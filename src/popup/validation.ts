/**
 * M40/M41/M46 (soporte) — `src/popup/validation.ts`
 * Validación **de presentación** (formato y longitud) de los formularios del popup (RF-33).
 *
 * Alcance y límites:
 * - Aquí NO hay criptografía: no se calcula checksum BIP-39, ni EIP-55, ni el rango de
 *   secp256k1. Eso corresponde a `src/shared/validation/*` (M58..M61) y al Service Worker, que
 *   son quienes **rechazan** de verdad con `-32602`. Este módulo evita enviar una petición que se
 *   sabe inválida y da el mensaje inline con su código y su acción (`diccionario_datos.md` §4.3).
 * - El mensaje y la acción son los literales de la tabla: `popupErrorOf('invalidMnemonic')`, etc.
 * - **Punto de integración**: cuando M58..M61 existan, `validateMnemonic`/`validateAddress`/
 *   `validatePrivateKey`/`validateAmount` delegan en ellos y conservan el mismo `ValidationIssue`.
 */

import { popupErrorOf, type PopupError } from './popupErrors';

/** Resultado de una validación de presentación. */
export interface ValidationResult {
  valid: boolean;
  /** Error con `code` y acción sugerida; `null` si el valor es aceptable. */
  issue: PopupError | null;
}

/** Valor aceptable. */
const VALID: ValidationResult = { valid: true, issue: null };

/** Valor rechazado con el error tipado de su causa. */
const invalid = (cause: Parameters<typeof popupErrorOf>[0]): ValidationResult => ({
  valid: false,
  issue: popupErrorOf(cause),
});

/** Número de palabras de la frase de recuperación (RF-01/RF-02). */
export const MNEMONIC_WORD_COUNT = 12;

/** Longitud máxima de una etiqueta de cuenta (diccionario de datos §3.3). */
export const LABEL_MAX_LENGTH = 32;

/** Longitud en hex de una clave privada (`0x` + 64). */
const PRIVATE_KEY_HEX_LENGTH = 64;

/** Normaliza una frase: minúsculas y espacios colapsados (la normalización fina es del SW). */
export const normalizeMnemonicInput = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

/** Valida la forma de una frase de recuperación: 12 palabras y sin caracteres imposibles. */
export const validateMnemonic = (value: string): ValidationResult => {
  const normalized = normalizeMnemonicInput(value);
  if (normalized.length === 0) {
    return invalid('invalidMnemonic');
  }
  const words = normalized.split(' ');
  if (words.length !== MNEMONIC_WORD_COUNT) {
    return invalid('invalidMnemonic');
  }
  // Las palabras BIP-39 son minúsculas y sin dígitos ni signos.
  if (!words.every((word) => /^[a-z]{3,8}$/.test(word))) {
    return invalid('invalidMnemonic');
  }
  return VALID;
};

/** Valida la forma de una dirección: `0x` + 40 hex (el checksum EIP-55 lo comprueba el SW). */
export const validateAddress = (value: string): ValidationResult => {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return invalid('invalidAddress');
  }
  return VALID;
};

/** Valida la forma de una clave privada: `0x` + 64 hex (el rango de secp256k1 lo comprueba el SW). */
export const validatePrivateKey = (value: string): ValidationResult => {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(trimmed) || trimmed.length !== 2 + PRIVATE_KEY_HEX_LENGTH) {
    return invalid('invalidPrivateKey');
  }
  return VALID;
};

/**
 * Valida la forma de un importe en ether: número decimal positivo con hasta 18 decimales.
 *
 * El formulario de importe pertenece al hito H4 (envío); se deja aquí, junto al resto de la
 * validación inline de RF-33, para que el envío lo reutilice sin duplicar la regla.
 */
export const validateAmount = (value: string): ValidationResult => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) {
    return invalid('invalidAmount');
  }
  if (Number(trimmed) <= 0) {
    return invalid('invalidAmount');
  }
  return VALID;
};

/** Valida la etiqueta de una cuenta: entre 1 y 32 caracteres. */
export const validateLabel = (value: string): ValidationResult => {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > LABEL_MAX_LENGTH) {
    return invalid('invalidLabel');
  }
  return VALID;
};
