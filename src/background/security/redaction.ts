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
 */

import { LangEn, Mnemonic, sha256, wordlists } from 'ethers';
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

/** Claves cuyo valor NUNCA se persiste (comparación sin distinguir mayúsculas ni `_`). */
export const SENSITIVE_PARAM_KEYS: readonly string[] = [
  'privatekey',
  'mnemonic',
  'seed',
  'seedphrase',
  'passphrase',
  'password',
  'secret',
  'vault',
  'keystore',
  'entropy',
  'phrase',
];

/** ¿Es `key` una clave sensible según la lista cerrada? */
export const isSensitiveKey = (key: string): boolean =>
  SENSITIVE_PARAM_KEYS.includes(key.toLowerCase().replace(/[_\-\s]/g, ''));

/** `sha256:<hex>` de un texto: lo único que llega a los logs (nunca el valor). */
export const hashValue = (value: string): string =>
  `sha256:${sha256(new TextEncoder().encode(value)).slice(2)}`;

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
 */
export const redactValue = (value: unknown, key = '', depth = 0): unknown => {
  if (depth > 6) {
    return REDACTED;
  }
  if (typeof value === 'string') {
    if (isSensitiveKey(key)) {
      return REDACTED;
    }
    if (key.toLowerCase().includes('signature')) {
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
    return value.map((entry) => redactValue(entry, key, depth + 1));
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      result[childKey] = redactValue(childValue, childKey, depth + 1);
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
      // Parámetros de EIP-1193: [mensaje, dirección] (o el orden inverso según la dApp).
      const address = list.find(
        (entry) => typeof entry === 'string' && /^0x[0-9a-fA-F]{40}$/.test(entry),
      );
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
      return {
        primaryType: typeof typedData?.primaryType === 'string' ? typedData.primaryType : null,
        domain: {
          name: typeof domain.name === 'string' ? domain.name : null,
          chainId: typeof domain.chainId === 'string' || typeof domain.chainId === 'number' ? domain.chainId : null,
          verifyingContract:
            typeof domain.verifyingContract === 'string' ? domain.verifyingContract : null,
        },
        messageHash: message === undefined ? null : hashValue(JSON.stringify(message)),
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

/** `data` de una entrada de log: redacción profunda y recorte de payloads largos. */
export const redactLogData = (data: unknown): unknown => redactValue(data);
