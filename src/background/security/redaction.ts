/**
 * M22 — `src/background/security/redaction.ts`
 * Política de **redacción** de los `params` y del `data` que se persisten
 * (`documento_tecnico.md` §2.4 M22, §3.6 y `diccionario_datos.md` §2.11, H-42 / ADT-12 / D-T).
 *
 * Reglas que implementa, sin excepción:
 * - Nunca se persiste el mnemonic, una clave privada ni una firma completa.
 * - `data` (calldata) se trunca a sus **primeros 10 bytes** (`data.slice(0, 22)`) más
 *   `dataLength`; **no** existe ninguna variante de 4 bytes (D-T).
 * - `personal_sign` guarda la dirección y el **hash** del mensaje, nunca el texto.
 * - `eth_signTypedData_v4` guarda `primaryType`, `domain.name`, `domain.chainId`,
 *   `domain.verifyingContract` y el **hash** del `message`, nunca el `message` completo.
 * - `wallet_importPrivateKey` / `wallet_generateMnemonic` solo dejan `origin`, `method` y el
 *   resultado (`ok` / `error`).
 * - Por encima de `PREVIEW_INLINE_MAX_BYTES = 4096` solo se persisten `hash` + longitud (§3.9).
 *
 * Este módulo lo consume SOLO el Service Worker (usa `ethers` para los hashes).
 *
 * Requisitos: RF-28..RF-31 y RF-50 (RNF-09, RNF-16).
 */

import { LangEn, Mnemonic, sha256, toUtf8Bytes, wordlists } from 'ethers';
// Normaliza la implementación de sha256 de ethers (ver security/hash.ts): sin esto, un
// Buffer de otro reino hace fallar el hash con invalid BytesLike value.
import './hash';
import { PREVIEW_INLINE_MAX_BYTES } from '../../shared/constants';
import { formatAddress } from '../../shared/format';

/** Marcador de valor redactado. */
export const REDACTED = '[redactado]' as const;

/** Lista BIP-39 inglesa (2048 palabras): instancia única del Service Worker. */
const ENGLISH_WORDLIST = wordlists.en ?? LangEn.wordlist();

/** Número de bytes de `data` que se conservan (regla única de D-T). */
export const DATA_PREVIEW_BYTES = 10 as const;

/** Longitud en caracteres del recorte de `data` (`0x` + 20 hex). */
export const DATA_PREVIEW_CHARS = 2 + DATA_PREVIEW_BYTES * 2;

/** Normaliza una clave de `params`/`data`: minúsculas y sin separadores (`private_key` → `privatekey`). */
export const normalizeParamKey = (key: string): string => key.toLowerCase().replace(/[_\-\s]/g, '');

/**
 * Tokens cuyo valor NUNCA se persiste. La comparación es por **contención** sobre la clave
 * normalizada, no por igualdad exacta.
 *
 * DEFECTO MEDIDO Y CORREGIDO (fase 4): la lista se consultaba con `includes` sobre la clave
 * normalizada EXACTA, así que `privKey` o `accountPrivateKey` no casaban con `privatekey` y la
 * clave privada se persistía ÍNTEGRA en `truekeate_logs` (el log es exportable en JSON). Lo mismo
 * ocurría con `seedWords` o `walletPassword`. La regla del módulo es «nunca se persiste el
 * mnemonic ni una clave privada», y una lista cerrada de igualdad exacta no la cumplía.
 */
export const SENSITIVE_PARAM_KEYS: readonly string[] = [
  'privatekey',
  'privkey',
  'mnemonic',
  'seed',
  'passphrase',
  'password',
  'secret',
  'vault',
  'keystore',
  'entropy',
  'phrase',
];

/**
 * Tokens de una clave que transporta una FIRMA (`signature`, `sig`, `rsv`, `ecdsaSignature`…).
 * El valor se trunca a `0x1234…abcd`; en un objeto con clave de firma, TODOS sus hijos
 * hexadecimales se tratan igual (es el caso de `{ signature: { r, s, v } }`).
 *
 * La comparación es exacta para los alias cortos (`sig`, `rsv`) porque la contención ingenua
 * convertiría en «firma» una clave que solo EMPIEZA igual —`signer` es una dirección y truncarla
 * mutilaría un dato no secreto—.
 */
export const SIGNATURE_PARAM_KEYS: readonly string[] = ['sig', 'sighex', 'rsv', 'ecdsa', 'ecdsasig'];

/** ¿Es `key` una clave que transporta una firma? */
export const isSignatureKey = (key: string): boolean => {
  const normalized = normalizeParamKey(key);
  if (normalized.length === 0) {
    return false;
  }
  return normalized.includes('signature') || SIGNATURE_PARAM_KEYS.includes(normalized);
};

/** ¿Es `key` una clave sensible según la lista cerrada (por contención)? */
export const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizeParamKey(key);
  return normalized.length > 0 && SENSITIVE_PARAM_KEYS.some((token) => normalized.includes(token));
};

/** ¿Tiene forma hexadecimal `0x…`? Solo a esos valores se les aplica el recorte de firma. */
const looksHex = (value: string): boolean => /^0x[0-9a-fA-F]+$/.test(value);

/**
 * `sha256:<hex>` de un texto: lo único que llega a los logs (nunca el valor).
 *
 * Los bytes se crean con `toUtf8Bytes` de `ethers`, y no con `TextEncoder`, por una razón MEDIDA:
 * `TextEncoder` puede devolver una vista de OTRO reino (jsdom, en las pruebas) que la comprobación
 * interna de `ethers` rechaza con `invalid BytesLike value`. `toUtf8Bytes` produce exactamente los
 * mismos bytes UTF-8 en el reino que los consume.
 */
export const hashValue = (value: string): string =>
  `sha256:${sha256(toUtf8Bytes(value)).slice(2)}`;

/** Primeros 10 bytes de un hexadecimal, con `dataLength` (regla única de D-T). */
export const previewData = (value: unknown): { data: string; dataLength: number } => {
  const text = typeof value === 'string' ? value : '';
  const body = text.startsWith('0x') ? text.slice(2) : text;
  return {
    data: text.startsWith('0x') ? text.slice(0, DATA_PREVIEW_CHARS) : text.slice(0, DATA_PREVIEW_CHARS - 2),
    dataLength: Math.floor(body.length / 2),
  };
};

/** Firma recortada a `0x1234…abcd`: nunca se persiste completa (`diccionario_datos.md` §2.11). */
export const previewSignature = (value: unknown): string =>
  typeof value === 'string' ? formatAddress(value) : REDACTED;

/** ¿Es una frase BIP-39 válida o con forma de frase (12 palabras de la lista)? */
const looksLikeMnemonic = (value: string): boolean => {
  const words = value.trim().toLowerCase().split(/\s+/);
  if (words.length !== 12) {
    return false;
  }
  if (words.some((word) => ENGLISH_WORDLIST.getWordIndex(word) < 0)) {
    return false;
  }
  return Mnemonic.isValidMnemonic(words.join(' '), ENGLISH_WORDLIST);
};

/** ¿Contiene el valor material sensible reconocible (frase BIP-39)? Recorre la estructura. */
export const containsSecretMaterial = (value: unknown, depth = 0): boolean => {
  if (depth > 6) {
    return false;
  }
  if (typeof value === 'string') {
    return looksLikeMnemonic(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsSecretMaterial(entry, depth + 1));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value as Record<string, unknown>).some((entry) =>
      containsSecretMaterial(entry, depth + 1),
    );
  }
  return false;
};

/**
 * Redacción genérica por clave: los valores de una clave sensible se sustituyen por
 * {@link REDACTED}, las firmas se recortan y cualquier frase BIP-39 detectada se redacta aunque
 * su clave no esté en la lista.
 *
 * `signatureContext` propaga la condición de «estoy dentro de un objeto de firma» a los hijos.
 *
 * DEFECTO MEDIDO Y CORREGIDO (fase 4): la rama de objeto solo miraba la clave HIJA, sin propagar
 * la del padre, de modo que `{ signature: { r, s, v } }` se persistía con `r` y `s` COMPLETOS
 * (64 hex cada uno) y `{ sig: '0x…130 hex' }` no se truncaba por no llamarse exactamente
 * `signature`. El módulo promete lo contrario en su cabecera.
 */
export const redactValue = (
  value: unknown,
  key = '',
  depth = 0,
  signatureContext = false,
): unknown => {
  if (depth > 6) {
    return REDACTED;
  }
  if (typeof value === 'string') {
    if (isSensitiveKey(key)) {
      return REDACTED;
    }
    if ((signatureContext || isSignatureKey(key)) && looksHex(value)) {
      return previewSignature(value);
    }
    if (looksLikeMnemonic(value)) {
      return REDACTED;
    }
    if (value.length > PREVIEW_INLINE_MAX_BYTES) {
      return redactLargePayload(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, key, depth + 1, signatureContext));
  }
  if (typeof value === 'object' && value !== null) {
    const context = signatureContext || isSignatureKey(key);
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      result[childKey] = redactValue(childValue, childKey, depth + 1, context);
    }
    return result;
  }
  return value;
};

/** Redacción de un payload largo en reposo: `hash` + longitud (§3.9, D-L). */
export const redactLargePayload = (value: string): Record<string, unknown> => ({
  payloadHash: hashValue(value),
  payloadBytes: new TextEncoder().encode(value).length,
  truncated: true,
});

/**
 * Redacción del **payload firmado** (H4 / M11): lo ÚNICO que puede persistirse de un mensaje
 * firmado es su `sha256` y su longitud. Vale para `personal_sign` (texto o hexadecimal) y para el
 * `message` de EIP-712 (serialización canónica), de modo que la regla «hash + longitud» tiene una
 * sola implementación (§3.4 regla 4, §2.11, H-42).
 */
export const redactSignedPayload = (payload: unknown): { payloadHash: string; payloadBytes: number } => {
  let text: string;
  if (typeof payload === 'string') {
    text = payload;
  } else {
    try {
      text = JSON.stringify(payload) ?? '';
    } catch {
      text = '';
    }
  }
  return {
    payloadHash: hashValue(text),
    payloadBytes: new TextEncoder().encode(text).length,
  };
};

/** Tamaño en bytes del payload serializado (cota de 64 KiB, ADT-21). */
export const measurePayloadBytes = (params: unknown): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(params)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

/** ¿Es un objeto con entradas? */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Redacción ESPECÍFICA por método, según la tabla de `diccionario_datos.md` §2.11. */
export const redactParams = (method: string, params: unknown): unknown => {
  const list = Array.isArray(params) ? params : [];
  switch (method) {
    case 'personal_sign': {
      // EIP-1193 fija el orden canónico `[mensaje, dirección]` aunque algunas dApps lo invierten.
      // DEFECTO MEDIDO Y CORREGIDO (fase 4): cuando el MENSAJE tiene 20 bytes hexadecimales (es
      // decir, «parece» una dirección), elegir el PRIMER parámetro con forma de dirección
      // guardaba el payload ÍNTEGRO dentro de `address` y calculaba el `messageHash` de la
      // DIRECCIÓN, no del mensaje: el texto firmado quedaba en claro en el log. Con dos
      // candidatos, la dirección de firma es la ÚLTIMA posición (orden canónico) y el mensaje es
      // la otra, así que el payload se registra solo como `sha256` + longitud.
      const shaped = list.filter(
        (entry): entry is string => typeof entry === 'string' && /^0x[0-9a-fA-F]{40}$/.test(entry),
      );
      const address = shaped.length >= 2 ? shaped[shaped.length - 1] : shaped[0];
      const message = list.find((entry) => typeof entry === 'string' && entry !== address);
      const text = typeof message === 'string' ? message : '';
      return {
        address: typeof address === 'string' ? address : null,
        messageHash: text.length > 0 ? hashValue(text) : null,
        messageBytes: text.length > 0 ? new TextEncoder().encode(text).length : 0,
      };
    }
    case 'eth_signTypedData_v4': {
      const payload = list.find((entry) => isRecord(entry)) ?? list.find((entry) => typeof entry === 'string');
      let typedData: Record<string, unknown> | null = null;
      if (typeof payload === 'string') {
        try {
          const parsed: unknown = JSON.parse(payload);
          typedData = isRecord(parsed) ? parsed : null;
        } catch {
          typedData = null;
        }
      } else if (isRecord(payload)) {
        typedData = payload;
      }
      const domain = typedData !== null && isRecord(typedData.domain) ? typedData.domain : {};
      const message = typedData?.message;
      // H4 (M22 ampliado): del payload firmado se registra el HASH y su LONGITUD, nunca el
      // `message` completo ni el `types` íntegro (§3.4 regla 4, §2.11).
      const signed = message === undefined ? null : redactSignedPayload(message);
      return {
        primaryType: typeof typedData?.primaryType === 'string' ? typedData.primaryType : null,
        domain: {
          name: typeof domain.name === 'string' ? domain.name : null,
          chainId: typeof domain.chainId === 'string' || typeof domain.chainId === 'number' ? domain.chainId : null,
          verifyingContract:
            typeof domain.verifyingContract === 'string' ? domain.verifyingContract : null,
        },
        messageHash: signed === null ? null : signed.payloadHash,
        messageBytes: signed === null ? 0 : signed.payloadBytes,
      };
    }
    case 'eth_sendTransaction': {
      const tx = list.find((entry) => isRecord(entry)) ?? {};
      return {
        from: typeof tx.from === 'string' ? tx.from : null,
        to: typeof tx.to === 'string' ? tx.to : null,
        value: typeof tx.value === 'string' ? tx.value : null,
        nonce: typeof tx.nonce === 'string' ? tx.nonce : null,
        ...previewData(tx.data),
      };
    }
    case 'wallet_importPrivateKey':
    case 'wallet_generateMnemonic':
      // Solo `origin`, `method` y el resultado: ningún valor sensible.
      return { redacted: true };
    default:
      return redactValue(list);
  }
};

/**
 * `data` de una entrada de log: redacción profunda y recorte de payloads largos.
 *
 * Es el saneado que aplica M30 (`logging/logger.ts`) **antes** de persistir cualquier entrada, y
 * su regla única es la de D-T/ADT-12: el calldata de `eth_sendTransaction` se registra con sus
 * **primeros 10 bytes** (`data.slice(0, 22)`, §2.11) más `dataLength`; no existe ninguna variante
 * de 4 bytes (solo el selector) ni de payload íntegro. M30 vuelve a aplicar esta cota, a cualquier
 * profundidad, sobre un `data`/`input`/`calldata` que no haya pasado por {@link redactParams}
 * (defensa en profundidad: la garantía no depende del llamador).
 */
export const redactLogData = (data: unknown): unknown => redactValue(data);
