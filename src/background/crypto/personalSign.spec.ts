/**
 * M11 — `src/background/crypto/personalSign.spec.ts`
 * `personal_sign` con el prefijo EIP-191 **literal** `\x19Ethereum Signed Message:\n<longitud>`
 * (H4, tareas 4.9 y 4.13; `CA-RF-21`).
 *
 * Clave de prueba: cuenta #1 de Anvil. SOLO PRUEBAS.
 */

import { describe, expect, it } from 'vitest';
import { getBytes, hashMessage, keccak256, recoverAddress, toUtf8Bytes, verifyMessage } from 'ethers';

import { buildPersonalSignPayload, signPersonalMessage } from './sign';

/** Clave privada de la cuenta #1 de Anvil. */
const CLAVE_ANVIL_1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Opciones con la clave inyectada. */
const claves = { privateKey: CLAVE_ANVIL_1 } as const;

describe('M11 · prefijo EIP-191 de `personal_sign` (CA-RF-21)', () => {
  it('el prefijo es literalmente `\\x19Ethereum Signed Message:\\n<longitud>`', () => {
    const payload = buildPersonalSignPayload('hola');

    expect(payload.prefix).toBe('\x19Ethereum Signed Message:\n4');
    expect(payload.prefix.charCodeAt(0)).toBe(0x19);
    expect(payload.bytes).toEqual(toUtf8Bytes('hola'));
    expect(payload.bytes.length).toBe(4);
    expect(payload.prefixed.length).toBe(payload.prefix.length + 4);
    // El prefijo va DELANTE de los bytes del mensaje, sin separador.
    expect([...payload.prefixed.slice(0, payload.prefix.length)]).toEqual([
      ...toUtf8Bytes(payload.prefix),
    ]);
    expect([...payload.prefixed.slice(payload.prefix.length)]).toEqual([0x68, 0x6f, 0x6c, 0x61]);
  });

  it('el hash firmado es keccak256(prefijo ‖ mensaje), no keccak256(mensaje)', () => {
    const payload = buildPersonalSignPayload('hola');

    expect(payload.hash).toBe(hashMessage(toUtf8Bytes('hola')));
    expect(payload.hash).toBe(keccak256(payload.prefixed));
    expect(payload.hash).not.toBe(keccak256(toUtf8Bytes('hola')));
  });

  it('un mensaje hexadecimal se interpreta como BYTES: «0x686f6c61» y «hola» dan la MISMA firma', async () => {
    const comoHex = buildPersonalSignPayload('0x686f6c61');
    const comoTexto = buildPersonalSignPayload('hola');

    expect(comoHex.bytes).toEqual(getBytes('0x686f6c61'));
    expect(comoHex.prefix).toBe('\x19Ethereum Signed Message:\n4');
    expect(comoHex.prefix).toBe(comoTexto.prefix);
    expect(comoHex.hash).toBe(comoTexto.hash);

    const firmaHex = await signPersonalMessage({ from: CUENTA_1, message: '0x686f6c61' }, claves);
    const firmaTexto = await signPersonalMessage({ from: CUENTA_1, message: 'hola' }, claves);
    expect(firmaHex.signature).toBe(firmaTexto.signature);
  });

  it('la longitud del prefijo son BYTES UTF-8: «á» pesa 2 y cita 2', () => {
    const payload = buildPersonalSignPayload('á');

    expect(payload.bytes.length).toBe(2);
    expect(payload.prefix).toBe('\x19Ethereum Signed Message:\n2');
    expect(payload.prefix.endsWith('\n2')).toBe(true);
  });

  it('un mensaje vacío lleva longitud 0 y firma el prefijo solo', () => {
    const payload = buildPersonalSignPayload('');

    expect(payload.bytes.length).toBe(0);
    expect(payload.prefix).toBe('\x19Ethereum Signed Message:\n0');
    expect(payload.prefixed.length).toBe(payload.prefix.length);
    expect(payload.hash).toBe(keccak256(toUtf8Bytes('\x19Ethereum Signed Message:\n0')));
  });

  it('acepta un `Uint8Array` tal cual, sin recodificarlo', () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x10]);
    const payload = buildPersonalSignPayload(bytes);

    expect(payload.bytes).toBe(bytes);
    expect(payload.prefix).toBe('\x19Ethereum Signed Message:\n3');
    expect(payload.hash).toBe(hashMessage(bytes));
  });
});

describe('M11 · firma `personal_sign` recuperable', () => {
  it('firma 65 bytes y se recupera con el hash del payload prefijado', async () => {
    const firmada = await signPersonalMessage({ from: CUENTA_1, message: 'hola' }, claves);
    const payload = buildPersonalSignPayload('hola');

    expect(firmada.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(firmada.from).toBe(CUENTA_1);
    expect(firmada.prefix).toBe('\x19Ethereum Signed Message:\n4');
    expect(firmada.byteLength).toBe(4);
    expect(firmada.messageHash).toBe(payload.hash);
    expect(recoverAddress(firmada.messageHash, firmada.signature)).toBe(CUENTA_1);
    expect(verifyMessage(getBytes('0x686f6c61'), firmada.signature)).toBe(CUENTA_1);
    expect(verifyMessage('hola', firmada.signature)).toBe(CUENTA_1);
  });

  it('la firma es determinista y cambia con el mensaje', async () => {
    const primera = await signPersonalMessage({ from: CUENTA_1, message: 'hola' }, claves);
    const segunda = await signPersonalMessage({ from: CUENTA_1, message: 'hola' }, claves);
    const otra = await signPersonalMessage({ from: CUENTA_1, message: 'adiós' }, claves);

    expect(segunda.signature).toBe(primera.signature);
    expect(otra.signature).not.toBe(primera.signature);
    expect(otra.messageHash).not.toBe(primera.messageHash);
    expect(otra.byteLength).toBe(6);
  });

  it('un `from` sin clave privada en la cartera → -32602 unknownAccount sin firmar', async () => {
    await expect(
      signPersonalMessage({ from: CUENTA_1, message: 'hola' }, { resolvePrivateKey: async () => null }),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'La cuenta indicada no existe en la cartera.',
      data: { reason: 'signing-key-unavailable', from: CUENTA_1 },
    });
  });
});
