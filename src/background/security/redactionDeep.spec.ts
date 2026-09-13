/**
 * `src/background/security/redactionDeep.spec.ts` — M22 (redacción en profundidad).
 *
 * Requisitos: RNF-09 y RNF-16 (`CA-RF-28`, H-42 / ADT-12 / D-T).
 *
 * HUECO QUE CUBRE (fase 4): `logRedaction.spec.ts` comprobaba la ausencia de secretos con las
 * claves EXACTAS del corpus (`privateKey`, `mnemonic`, `signature`, `data`). El módulo promete
 * mucho más —«nunca se persiste el mnemonic ni una clave privada», «firma recortada a
 * `0x1234…abcd`», «cualquier `data` (calldata) a cualquier profundidad»— y las variantes de
 * nombre (`privKey`, `accountPrivateKey`, `sig`, `txData`, `inputData`) y las firmas ANIDADAS
 * (`{ signature: { r, s, v } }`) se persistían ÍNTEGRAS. Cada caso de este fichero es una
 * magnitud concreta sobre el TEXTO serializado que acaba en `truekeate_logs`.
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import { REDACTED, SENSITIVE_PARAM_KEYS, isSignatureKey, redactParams, redactValue } from './redaction';
import { sanitizeLogData } from '../logging/logger';

/** Frase BIP-39 de pruebas (la de Anvil): NUNCA puede acabar en el log. */
const MNEMONIC = 'test test test test test test test test test test test junk';

/** Clave privada de pruebas (cuenta 0 de Anvil): 0x + 64 hex. */
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Firma ECDSA completa de 65 bytes (0x + 130 hex). */
const SIGNATURE = `0x${'1b'.repeat(65)}`;

/** Componente `r` de una firma: 32 bytes (0x + 64 hex). */
const SIG_R = `0x${'11'.repeat(32)}`;

/** Componente `s` de una firma: 32 bytes (0x + 64 hex). */
const SIG_S = `0x${'22'.repeat(32)}`;

/** Calldata larga: el log solo puede conservar sus primeros 10 bytes (0x + 20 hex). */
const CALLDATA = `0xa9059cbb${'00'.repeat(31)}deadbeef${'ab'.repeat(64)}`;

/** Dirección real de la cuenta 0 de Anvil (destino legítimo de `personal_sign`). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Mensaje de `personal_sign` que TIENE forma de dirección (20 bytes hexadecimales). */
const MENSAJE_CON_FORMA_DE_DIRECCION = `0x${'11'.repeat(20)}`;

/** Serializa el resultado para afirmar sobre el texto que se persiste. */
const texto = (value: unknown): string => JSON.stringify(value);

describe('M22 · la lista de claves sensibles se aplica por CONTENCIÓN, no por igualdad', () => {
  it.each(['privKey', 'accountPrivateKey', 'wallet_private_key', 'seedWords', 'walletPassword'])(
    'la clave «%s» se redacta como valor sensible',
    (clave) => {
      // Antes de la corrección solo casaban las claves EXACTAS de la lista (`privatekey`, `seed`,
      // `password`…), así que `privKey` conservaba los 66 caracteres de la clave privada.
      expect(redactValue(PRIVATE_KEY, clave)).toBe(REDACTED);
      expect(texto(redactValue({ [clave]: PRIVATE_KEY }))).not.toContain(PRIVATE_KEY);
    },
  );

  it('las palabras de la lista siguen redactando y una clave inocua NO se toca', () => {
    for (const token of SENSITIVE_PARAM_KEYS) {
      expect(redactValue('valor-secreto', token), `token «${token}»`).toBe(REDACTED);
    }
    // Control negativo: una clave que no contiene ningún token conserva su valor.
    expect(redactValue('0x1234', 'destino')).toBe('0x1234');
    // Y la frase BIP-39 se redacta aunque su clave no esté en la lista (barrido por contenido).
    expect(redactValue(MNEMONIC, 'anotacion')).toBe(REDACTED);
  });
});

describe('M22 · ninguna firma completa llega al log, ni con claves alternativas ni anidada', () => {
  it('una firma bajo `sig` se trunca a `0x1234…abcd` (11 caracteres, no 132)', () => {
    // Antes solo se truncaba si la clave contenía literalmente «signature».
    const truncada = redactValue(SIGNATURE, 'sig');
    expect(truncada).toBe(`${SIGNATURE.slice(0, 6)}…${SIGNATURE.slice(-4)}`);
    expect(String(truncada)).toHaveLength(11);
    expect(texto(redactValue({ sig: SIGNATURE }))).not.toContain(SIGNATURE);
  });

  it('un objeto de firma anidado trunca TODOS sus componentes hexadecimales', () => {
    // `{ signature: { r, s, v } }`: la rama de objeto no propagaba la clave del padre, de modo que
    // `r` y `s` (32 bytes cada uno) se persistían COMPLETOS.
    const anidada = redactValue({ signature: { r: SIG_R, s: SIG_S, v: '0x1c', scheme: 'personal_sign' } });
    expect(anidada).toEqual({
      signature: {
        r: `${SIG_R.slice(0, 6)}…${SIG_R.slice(-4)}`,
        s: `${SIG_S.slice(0, 6)}…${SIG_S.slice(-4)}`,
        // `v` es corto: el recorte no puede alargarlo ni perderlo.
        v: '0x1c',
        // Un campo que NO es hexadecimal conserva su valor (no se mutila información no secreta).
        scheme: 'personal_sign',
      },
    });
    const serializado = texto(anidada);
    expect(serializado).not.toContain(SIG_R);
    expect(serializado).not.toContain(SIG_S);
    expect(serializado).not.toContain(SIGNATURE);
  });

  it('`isSignatureKey` reconoce las variantes y no confunde una clave normal', () => {
    for (const clave of ['signature', 'Signature', 'sig', 'ecdsaSignature', 'rsv', 'signatureHex']) {
      expect(isSignatureKey(clave), `«${clave}»`).toBe(true);
    }
    for (const clave of ['destino', 'data', 'metadata', 'signer']) {
      expect(isSignatureKey(clave), `«${clave}»`).toBe(false);
    }
  });
});

describe('M22 · el calldata se trunca bajo CUALQUIER nombre de clave de la familia', () => {
  it.each(['data', 'calldata', 'input', 'txData', 'inputData', 'rawData', 'hexData', 'transactionData'])(
    '«%s» conserva solo los primeros 10 bytes',
    (clave) => {
      // `truncateCalldataDeep` solo reconocía `data`/`calldata`/`input` exactos, así que un
      // parámetro extra `{ txData: CALLDATA }` en una lectura que responde OK guardaba el calldata
      // COMPLETO (la regla de §2.11 es «cualquier `data` a cualquier profundidad»).
      const saneado = sanitizeLogData({ [clave]: CALLDATA }) as Record<string, { data?: string; dataLength?: number } | string>;
      const entrada = saneado[clave];
      expect(typeof entrada).toBe('object');
      const recorte = entrada as { data: string; dataLength: number };
      expect(recorte.data).toBe(`0x${CALLDATA.slice(2, 22)}`);
      expect(recorte.data).toHaveLength(22);
      expect(recorte.dataLength).toBe((CALLDATA.length - 2) / 2);
      expect(texto(saneado)).not.toContain(CALLDATA);
      expect(texto(saneado)).not.toContain('deadbeef');
    },
  );

  it('una clave que solo ACABA en «data» no es calldata (control negativo)', () => {
    // La lista sigue siendo cerrada: `metadata` no es un calldata y no debe truncarse, o el log
    // perdería información legítima.
    const metadata = `0x${'cd'.repeat(40)}`;
    expect(sanitizeLogData({ metadata })).toEqual({ metadata });
  });
});

describe('M22 · `personal_sign` con un mensaje que PARECE una dirección', () => {
  it('registra la dirección real y el HASH del mensaje, nunca el payload en claro', () => {
    // Orden canónico EIP-1193 `[mensaje, dirección]` con un mensaje de 20 bytes: los dos
    // parámetros «parecen» direcciones. Antes se elegía el PRIMERO, así que el payload quedaba
    // ÍNTEGRO dentro de `address` y el `messageHash` era el de la DIRECCIÓN.
    const redactado = redactParams('personal_sign', [
      MENSAJE_CON_FORMA_DE_DIRECCION,
      CUENTA_0,
    ]) as { address: string | null; messageHash: string | null; messageBytes: number };

    expect(redactado.address).toBe(CUENTA_0);
    expect(redactado.address).not.toBe(MENSAJE_CON_FORMA_DE_DIRECCION);
    expect(redactado.messageHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(redactado.messageBytes).toBe(42);
    // El payload NO está en ninguna parte del objeto redactado.
    expect(texto(redactado)).not.toContain(MENSAJE_CON_FORMA_DE_DIRECCION);
    // Y el hash es el del MENSAJE (comprobado con un sha256 independiente, no con el módulo).
    const esperado = createHash('sha256').update(MENSAJE_CON_FORMA_DE_DIRECCION, 'utf8').digest('hex');
    expect(redactado.messageHash).toBe(`sha256:${esperado}`);
  });

  it('el orden inverso `[dirección, mensaje]` sigue registrando el hash del mensaje', () => {
    const redactado = redactParams('personal_sign', [
      CUENTA_0,
      MENSAJE_CON_FORMA_DE_DIRECCION,
    ]) as { address: string | null; messageHash: string | null; messageBytes: number };
    expect(redactado.address).toBe(MENSAJE_CON_FORMA_DE_DIRECCION);
    expect(redactado.messageHash?.startsWith('sha256:')).toBe(true);
    expect(redactado.messageBytes).toBe(42);
  });

  it('un mensaje de texto normal se registra como hash + longitud (magnitud exacta)', () => {
    const redactado = redactParams('personal_sign', ['hola mundo', CUENTA_0]) as {
      address: string | null;
      messageHash: string | null;
      messageBytes: number;
    };
    expect(redactado.address).toBe(CUENTA_0);
    expect(redactado.messageBytes).toBe(10);
    expect(texto(redactado)).not.toContain('hola mundo');
  });
});
