/**
 * M11 — `src/background/crypto/eip155.spec.ts`
 * EIP-155: el `chainId` va **dentro de la firma** (`v = chainId * 2 + 35/36`), de modo que una
 * transacción firmada para una red **no es replicable** en otra (H4, tarea 4.9; `CA-RF-43`).
 *
 * Clave de prueba: cuenta #1 de Anvil. SOLO PRUEBAS.
 */

import { describe, expect, it } from 'vitest';
import { Signature, Transaction, keccak256, recoverAddress } from 'ethers';

import { eip155V, signLegacyTransaction, type TransactionSigningInput } from './sign';

/** Clave privada de la cuenta #1 de Anvil. */
const CLAVE_ANVIL_1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** 10 gwei de `gasPrice`. */
const GAS_PRICE = 10_000_000_000n;

/** `chainId` de la red local de pruebas. */
const CHAIN_ID_ANVIL = 31_337;

/** Los campos EXACTOS que se firman, para reconstruir el `unsignedHash` con otro `chainId`. */
const CAMPOS = {
  type: 0 as const,
  nonce: 0,
  gasPrice: GAS_PRICE,
  gasLimit: 21_000n,
  to: CUENTA_0,
  value: 1n,
  data: '0x',
};

/** Transacción legada SIN firmar para un `chainId` dado (su `unsignedHash` ata la firma a la red). */
const sinFirmarPara = (chainId: number): Transaction => Transaction.from({ ...CAMPOS, chainId });

/** Entrada de firma legada sobre la red local. */
const entradaLegada = (
  overrides: Partial<TransactionSigningInput> = {},
): TransactionSigningInput => ({
  from: CUENTA_1,
  to: CUENTA_0,
  value: 1n,
  data: '0x',
  gasLimit: 21_000n,
  nonce: 0,
  gasPrice: GAS_PRICE,
  chainId: '0x7a69',
  activeChainId: '0x7a69',
  ...overrides,
});

/** Opciones con la clave inyectada (no se toca el almacén). */
const claves = { privateKey: CLAVE_ANVIL_1 } as const;

describe('M11 · fórmula del `v` de EIP-155', () => {
  it('v = chainId*2 + 35/36 según la paridad del punto y', () => {
    expect(eip155V(1, 0)).toBe(37);
    expect(eip155V(1, 1)).toBe(38);
    expect(eip155V(5, 0)).toBe(45);
    expect(eip155V(5, 1)).toBe(46);
    expect(eip155V(CHAIN_ID_ANVIL, 0)).toBe(62_709);
    expect(eip155V(CHAIN_ID_ANVIL, 1)).toBe(62_710);
    // La diferencia entre ambas paridades es SIEMPRE 1: es la mitad EIP-2 de la firma.
    expect(eip155V(CHAIN_ID_ANVIL, 1) - eip155V(CHAIN_ID_ANVIL, 0)).toBe(1);
  });

  it('el `v` de EIP-155 nunca cae en el rango pre-EIP-155 (27/28)', () => {
    for (const chainId of [1, 5, 31_337, 11155111]) {
      expect(eip155V(chainId, 0)).toBeGreaterThan(28);
      expect(eip155V(chainId, 1)).toBeGreaterThan(28);
    }
  });
});

describe('M11 · la transacción legada firmada lleva el chainId dentro (CA-RF-43)', () => {
  it('se firma sin envoltorio 0x02, con v = chainId*2+35/36 y el hash correcto', async () => {
    const firmada = await signLegacyTransaction(entradaLegada(), claves);
    const parseada = Transaction.from(firmada.rawTransaction);

    expect(firmada.txType).toBe(0);
    expect(firmada.rawTransaction.startsWith('0x02')).toBe(false);
    expect(parseada.type).toBe(0);
    expect(parseada.chainId).toBe(BigInt(CHAIN_ID_ANVIL));
    expect(firmada.chainIdHex).toBe('0x7a69');
    expect([27, 28]).not.toContain(firmada.v);
    expect(firmada.v).toBe(eip155V(CHAIN_ID_ANVIL, firmada.yParity));
    expect(firmada.hash).toBe(keccak256(firmada.rawTransaction));
    expect(firmada.from).toBe(CUENTA_1);
  });

  it('la firma se recupera SOLO con el `unsignedHash` de su chainId: en otra red da otra cuenta', async () => {
    const firmada = await signLegacyTransaction(entradaLegada(), claves);
    const firmaSerializada = Signature.from({
      r: firmada.r,
      s: firmada.s,
      yParity: firmada.yParity === 1 ? 1 : 0,
    }).serialized;

    // El hash sin firmar DEPENDE del chainId: son dos mensajes distintos.
    expect(sinFirmarPara(CHAIN_ID_ANVIL).unsignedHash).not.toBe(sinFirmarPara(1).unsignedHash);

    // Con su red, la firma recupera al firmante; con otra red, NO.
    expect(recoverAddress(sinFirmarPara(CHAIN_ID_ANVIL).unsignedHash, firmaSerializada)).toBe(CUENTA_1);
    expect(recoverAddress(sinFirmarPara(1).unsignedHash, firmaSerializada)).not.toBe(CUENTA_1);
  });

  it('el MISMO payload en dos redes produce firmas y hashes distintos (no replicable)', async () => {
    const enAnvil = await signLegacyTransaction(entradaLegada(), claves);
    const enMainnet = await signLegacyTransaction(
      entradaLegada({ chainId: '0x1', activeChainId: '0x1' }),
      claves,
    );

    expect(enMainnet.chainId).toBe(1);
    expect(enMainnet.chainIdHex).toBe('0x1');
    expect(enMainnet.v).toBe(eip155V(1, enMainnet.yParity));
    expect(enMainnet.rawTransaction).not.toBe(enAnvil.rawTransaction);
    expect(enMainnet.hash).not.toBe(enAnvil.hash);
    // La diferencia de `v` es exactamente 2·ΔchainId más la diferencia de paridad (0 o ±1).
    const deltaParidad = enAnvil.yParity - enMainnet.yParity;
    expect(enAnvil.v - enMainnet.v).toBe(2 * (CHAIN_ID_ANVIL - 1) + deltaParidad);
  });

  it('un chainId ajeno al activo se rechaza con 4901 también en la firma legada', async () => {
    await expect(
      signLegacyTransaction(entradaLegada({ chainId: '0xaa36a7' }), claves),
    ).rejects.toMatchObject({
      code: 4901,
      data: { reason: 'chain-id-mismatch', requested: 11_155_111, active: 31_337 },
    });
  });

  it('conserva `gasPrice` como comisión y no inventa comisiones EIP-1559', async () => {
    const firmada = await signLegacyTransaction(entradaLegada(), claves);
    const parseada = Transaction.from(firmada.rawTransaction);

    expect(parseada.gasPrice).toBe(GAS_PRICE);
    expect(parseada.maxFeePerGas).toBeNull();
    expect(parseada.maxPriorityFeePerGas).toBeNull();
    expect(firmada.maxFeePerGas).toBe(GAS_PRICE.toString());
    expect(firmada.maxPriorityFeePerGas).toBe(GAS_PRICE.toString());
  });
});
