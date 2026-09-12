/**
 * M22.a — `src/background/security/hash.ts`
 * Normalización de la implementación de `sha256` de `ethers` (H4, defecto de entorno medido).
 *
 * POR QUÉ EXISTE
 * `ethers` v6 delega el algoritmo en el runtime: en el Service Worker usa la WebCrypto del
 * navegador (que devuelve un `Uint8Array` de SU reino) y, cuando no está disponible, `node:crypto`
 * (que devuelve un `Buffer` de OTRO reino). El problema es la comprobación interna de `ethers`
 * (`value instanceof Uint8Array`): un `Buffer` creado por el `node:crypto` de jsdom NO es instancia
 * del `Uint8Array` con el que se compila `ethers` en el arnés de Vitest, de modo que
 * `sha256('…')` —y cualquier `hashValue` que lo use— revienta con
 * `invalid BytesLike value … "type": "Buffer"`.
 *
 * La corrección es la que documenta la propia librería: registrar una implementación que ENVUELVE
 * la nativa y garantiza que devuelve un `Uint8Array` utilizable. En el navegador el valor YA es un
 * `Uint8Array` y se devuelve sin tocar (la línea `instanceof` es la única que se ejecuta), así que
 * la corrección no altera ni un byte del hash de producción: es idempotente y sin coste.
 *
 * Este módulo debe importarse ANTES de usar `sha256`; basta con que lo importe cualquier módulo que
 * lo invoque (`security/redaction.ts` y `crypto/mnemonic.ts` lo hacen).
 */

import { sha256 } from 'ethers';

/** Implementación nativa de `sha256` expuesta por `ethers` (`sha256._`). */
export type NativeSha256 = (data: Uint8Array) => Uint8Array;

/**
 * Registra la implementación normalizada. Es idempotente por construcción (envolver dos veces la
 * misma función nativa no cambia el resultado), así que no necesita guarda de estado.
 */
export const registerNormalizedSha256 = (): void => {
  sha256.register((data: Uint8Array) => {
    const output = sha256._(data);
    // En el navegador `output` YA es un `Uint8Array` del reino correcto: no se copia nada.
    return output instanceof Uint8Array ? output : new Uint8Array(output);
  });
};

registerNormalizedSha256();