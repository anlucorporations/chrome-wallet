/**
 * M11 — `src/background/crypto/typedData.spec.ts`
 * `eth_signTypedData_v4` (EIP-712): `digest`, `primaryType` y correspondencia con el contrato
 * verificador (H4, tareas 4.9 y 4.16; `CA-RF-20` y `CA-RT-11`).
 *
 * Correspondencia wallet ↔ contrato: el `digest` que firma M11 es EXACTAMENTE el que
 * `EIP712Verifier.hashTypedData(domainSeparator, structHash)` reconstruye on-chain, y el fixture
 * versionado `contracts/test/fixtures/eip712-signature.json` lo fija como evidencia.
 *
 * Clave de prueba: cuenta #1 de Anvil. SOLO PRUEBAS.
 */

import { describe, expect, it } from 'vitest';
import { Signature, TypedDataEncoder, recoverAddress, verifyTypedData } from 'ethers';

import fixtureCast from '../../../contracts/test/fixtures/eip712-signature.json';
import {
  inferPrimaryType,
  recoverTypedDataSigner,
  resolvePrimaryType,
  signTypedData,
  stripEip712Domain,
  typedDataDigest,
  type TypedDataTypes,
} from './sign';

/** Clave privada de la cuenta #1 de Anvil. */
const CLAVE_ANVIL_1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Dominio de la dApp de pruebas, el MISMO que verifica el contrato (`TrueKeate Test App`). */
const DOMINIO = {
  name: 'TrueKeate Test App',
  version: '1',
  chainId: 31_337,
  verifyingContract: '0x8464135c8F25Da09e49BC8782676a84730C318bC',
} as const;

/** Tipos tal y como los entrega una dApp: incluyen `EIP712Domain` (que NO se firma). */
const TIPOS_CON_DOMINIO: TypedDataTypes = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  SignMessage: [
    { name: 'content', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** Mensaje del fixture: identificable y estable. */
const MENSAJE = {
  content: 'EIP-712 demo de TrueKeate: la cartera firma datos tipados y el contrato verificador los valida on-chain.',
  nonce: '0',
  deadline: '1000000000',
};

/** Opciones de firma con la clave inyectada. */
const claves = { privateKey: CLAVE_ANVIL_1 } as const;

describe('M11 · EIP-712: tipos, primaryType y digest (CA-RF-20)', () => {
  it('quita EIP712Domain sin MUTAR la entrada y copiando solo `name`/`type`', () => {
    const limpios = stripEip712Domain(TIPOS_CON_DOMINIO);

    expect(Object.keys(limpios)).toEqual(['SignMessage']);
    expect(limpios.SignMessage).toEqual(TIPOS_CON_DOMINIO.SignMessage);
    // La entrada original sigue intacta (el módulo no muta lo que le llega de la dApp).
    expect(Object.keys(TIPOS_CON_DOMINIO)).toEqual(['EIP712Domain', 'SignMessage']);
    // Y son arrays distintos: nadie puede alterar los tipos por referencia.
    expect(limpios.SignMessage).not.toBe(TIPOS_CON_DOMINIO.SignMessage);
  });

  it('infiere la raíz como el tipo que ningún otro referencia', () => {
    const tipos: TypedDataTypes = {
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'contents', type: 'string' },
      ],
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
    };

    expect(inferPrimaryType(tipos)).toBe('Mail');
    expect(inferPrimaryType({})).toBeNull();
    expect(resolvePrimaryType(tipos)).toBe('Mail');
    // El `primaryType` declarado manda si existe en `types`.
    expect(resolvePrimaryType(tipos, 'Person')).toBe('Person');
    // Si el declarado no existe, se cae a la raíz inferida.
    expect(resolvePrimaryType(tipos, 'Inexistente')).toBe('Mail');
  });

  it('sin tipos firmables responde -32603 invalid-typed-data y NO firma', async () => {
    await expect(
      signTypedData({ from: CUENTA_1, domain: DOMINIO, types: {}, message: {} }, claves),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Error interno de la cartera.',
      data: { reason: 'invalid-typed-data' },
    });
  });

  it('el digest coincide con TypedDataEncoder.hash sobre los tipos SIN EIP712Domain', async () => {
    const firmada = await signTypedData(
      { from: CUENTA_1, domain: DOMINIO, types: TIPOS_CON_DOMINIO, message: MENSAJE },
      claves,
    );

    const esperado = TypedDataEncoder.hash(DOMINIO, stripEip712Domain(TIPOS_CON_DOMINIO), MENSAJE);
    expect(firmada.digest).toBe(esperado);
    expect(firmada.digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(typedDataDigest(DOMINIO, TIPOS_CON_DOMINIO, MENSAJE)).toBe(esperado);
    expect(firmada.primaryType).toBe('SignMessage');
    expect(Object.keys(firmada.types)).toEqual(['SignMessage']);
    // El dominio se conserva TAL CUAL: la UI muestra `name` y `verifyingContract` (CA-RF-20).
    expect(firmada.domain.name).toBe('TrueKeate Test App');
    expect(firmada.domain.verifyingContract).toBe(DOMINIO.verifyingContract);
    expect(firmada.domain.chainId).toBe(31_337);
  });

  it('respeta el `primaryType` declarado por la dApp aunque no sea la raíz inferida', async () => {
    const tipos: TypedDataTypes = {
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'contents', type: 'string' },
      ],
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
    };
    const mensaje = {
      from: { name: 'TrueKeate', wallet: CUENTA_1 },
      contents: 'hola',
    };

    const firmada = await signTypedData(
      { from: CUENTA_1, domain: DOMINIO, types: tipos, message: mensaje, primaryType: 'Mail' },
      claves,
    );

    expect(firmada.primaryType).toBe('Mail');
    expect(firmada.digest).toBe(TypedDataEncoder.hash(DOMINIO, tipos, mensaje));
  });
});

describe('M11 · EIP-712: firma recuperable y atada al dominio y al mensaje', () => {
  it('la firma se recupera como el firmante y `verifyTypedData` la acepta', async () => {
    const firmada = await signTypedData(
      { from: CUENTA_1, domain: DOMINIO, types: TIPOS_CON_DOMINIO, message: MENSAJE },
      claves,
    );

    expect(firmada.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(firmada.from).toBe(CUENTA_1);
    expect(recoverTypedDataSigner(DOMINIO, TIPOS_CON_DOMINIO, MENSAJE, firmada.signature)).toBe(
      CUENTA_1,
    );
    expect(verifyTypedData(DOMINIO, stripEip712Domain(TIPOS_CON_DOMINIO), MENSAJE, firmada.signature)).toBe(
      CUENTA_1,
    );
  });

  it('un byte alterado del mensaje cambia el digest y la firma deja de corresponder al firmante', async () => {
    const firmada = await signTypedData(
      { from: CUENTA_1, domain: DOMINIO, types: TIPOS_CON_DOMINIO, message: MENSAJE },
      claves,
    );
    const alterado = { ...MENSAJE, content: `${MENSAJE.content.slice(0, -1)}X` };

    expect(typedDataDigest(DOMINIO, TIPOS_CON_DOMINIO, alterado)).not.toBe(firmada.digest);
    expect(recoverTypedDataSigner(DOMINIO, TIPOS_CON_DOMINIO, alterado, firmada.signature)).not.toBe(
      CUENTA_1,
    );
    expect(
      verifyTypedData(DOMINIO, stripEip712Domain(TIPOS_CON_DOMINIO), alterado, firmada.signature),
    ).not.toBe(CUENTA_1);
    // Alterar el `nonce` (uint256) también rompe la correspondencia.
    const otroNonce = { ...MENSAJE, nonce: '1' };
    expect(recoverTypedDataSigner(DOMINIO, TIPOS_CON_DOMINIO, otroNonce, firmada.signature)).not.toBe(
      CUENTA_1,
    );
  });

  it('un byte alterado de la FIRMA (la paridad) recupera otra cuenta', async () => {
    const firmada = await signTypedData(
      { from: CUENTA_1, domain: DOMINIO, types: TIPOS_CON_DOMINIO, message: MENSAJE },
      claves,
    );
    const original = Signature.from(firmada.signature);
    const paridadInvertida = Signature.from({
      r: original.r,
      s: original.s,
      yParity: original.yParity === 0 ? 1 : 0,
    });

    // El byte de paridad es parte de la firma de 65 bytes; alterarlo cambia la cuenta recuperada.
    expect(paridadInvertida.serialized).not.toBe(original.serialized);
    expect(recoverAddress(firmada.digest, original.serialized)).toBe(CUENTA_1);
    expect(recoverAddress(firmada.digest, paridadInvertida.serialized)).not.toBe(CUENTA_1);
  });

  it('el digest está ATADO al dominio: otro `chainId` u otro `verifyingContract` dan otro digest', async () => {
    const firmada = await signTypedData(
      { from: CUENTA_1, domain: DOMINIO, types: TIPOS_CON_DOMINIO, message: MENSAJE },
      claves,
    );

    const otroChainId = typedDataDigest(
      { ...DOMINIO, chainId: 1 },
      TIPOS_CON_DOMINIO,
      MENSAJE,
    );
    const otroContrato = typedDataDigest(
      { ...DOMINIO, verifyingContract: '0x0000000000000000000000000000000000000001' },
      TIPOS_CON_DOMINIO,
      MENSAJE,
    );
    const otroNombre = typedDataDigest(
      { ...DOMINIO, name: 'Otra App' },
      TIPOS_CON_DOMINIO,
      MENSAJE,
    );

    expect(otroChainId).not.toBe(firmada.digest);
    expect(otroContrato).not.toBe(firmada.digest);
    expect(otroNombre).not.toBe(firmada.digest);
    expect(recoverTypedDataSigner({ ...DOMINIO, chainId: 1 }, TIPOS_CON_DOMINIO, MENSAJE, firmada.signature)).not.toBe(
      CUENTA_1,
    );
  });

  it('un `from` sin clave privada en la cartera → -32602 unknownAccount sin firmar', async () => {
    await expect(
      signTypedData(
        { from: CUENTA_1, domain: DOMINIO, types: TIPOS_CON_DOMINIO, message: MENSAJE },
        { resolvePrivateKey: async () => null },
      ),
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: 'signing-key-unavailable', from: CUENTA_1 },
    });
  });
});

describe('M11 · correspondencia wallet ↔ contrato verificador (RT-11)', () => {
  it('el digest de la wallet es el MISMO que el `digest` del fixture de Forge', () => {
    expect(fixtureCast.domain).toEqual(DOMINIO);
    expect(fixtureCast.primaryType).toBe('SignMessage');

    const digest = typedDataDigest(
      DOMINIO,
      { SignMessage: TIPOS_CON_DOMINIO.SignMessage ?? [] },
      MENSAJE,
    );

    expect(digest).toBe(fixtureCast.digest);
    expect(digest).toBe(fixtureCast.expectedDigest);
    // Y la firma versionada del fixture corresponde a la cuenta de prueba documentada.
    expect(fixtureCast.signer).toBe(CUENTA_1);
    expect(recoverAddress(digest, fixtureCast.signature)).toBe(CUENTA_1);
  });
});
