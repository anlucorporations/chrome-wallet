/**
 * M11 — `src/background/crypto/sign.spec.ts`
 * Única vía de firma de transacciones (H4, tarea 4.9 de `plan_desarrollo.md` §3.4.5; §3.4.7
 * «Vitest»). Criterios: `CA-RF-42` (tipo 2 con comisiones > 0), `CA-RF-43` (el `chainId` va dentro
 * de la firma) y el rechazo de una red ajena con `4901`.
 *
 * Clave de prueba: cuenta #1 de Anvil (`contracts/README.md`). SOLO PRUEBAS.
 */

import { describe, expect, it } from 'vitest';
import { Transaction, Wallet, keccak256 } from 'ethers';

import {
  EIP1559_TX_TYPE,
  LEGACY_TX_TYPE,
  SIGNATURE_HEX_LENGTH,
  assertActiveChain,
  buildType2Transaction,
  chainIdHexOf,
  eip155V,
  signLegacyTransaction,
  signerFor,
  signTransaction,
  toBigIntOrNull,
  toChainIdNumber,
  type TransactionSigningInput,
} from './sign';

/** Clave privada de la cuenta #1 de Anvil (documentada en `contracts/README.md`). */
const CLAVE_ANVIL_1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

/** Dirección derivada de {@link CLAVE_ANVIL_1}. */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Cuenta #0 de Anvil: NO es la del firmante de prueba (test negativo). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** 1 gwei, la comisión mínima del proyecto. */
const GWEI = 1_000_000_000n;

/** Entrada base de una transacción válida sobre la red local (chainId 31337). */
const entradaBase = (overrides: Partial<TransactionSigningInput> = {}): TransactionSigningInput => ({
  from: CUENTA_1,
  to: CUENTA_0,
  value: '0xde0b6b3a7640000', // 1 ETH
  data: '0x',
  gasLimit: 21_000n,
  nonce: 3,
  chainId: '0x7a69',
  activeChainId: '0x7a69',
  feeData: { maxFeePerGas: 20n * GWEI, maxPriorityFeePerGas: 2n * GWEI },
  ...overrides,
});

/** Opciones de firma con la clave inyectada (no se toca el almacén). */
const claves = { privateKey: CLAVE_ANVIL_1 } as const;

describe('M11 · firma de transacciones EIP-1559 (CA-RF-42)', () => {
  it('firma tipo 2 y el envoltorio serializado empieza por 0x02', async () => {
    const firmada = await signTransaction(entradaBase(), claves);
    const parseada = Transaction.from(firmada.rawTransaction);

    expect(firmada.txType).toBe(EIP1559_TX_TYPE);
    expect(EIP1559_TX_TYPE).toBe(2);
    expect(firmada.rawTransaction.startsWith('0x02'), 'envoltorio EIP-2718 de tipo 2').toBe(true);
    expect(parseada.type).toBe(2);
    expect(parseada.maxFeePerGas).toBe(20n * GWEI);
    expect(parseada.maxPriorityFeePerGas).toBe(2n * GWEI);
    expect(parseada.nonce).toBe(3);
    expect(parseada.gasLimit).toBe(21_000n);
  });

  it('devuelve un hash de 0x + 64 hex que es el keccak256 de la transacción firmada', async () => {
    const firmada = await signTransaction(entradaBase(), claves);

    expect(firmada.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(firmada.hash).toBe(keccak256(firmada.rawTransaction));
    expect(firmada.from).toBe(CUENTA_1);
    expect(firmada.to).toBe(CUENTA_0);
  });

  it('el chainId va DENTRO de la firma y la recuperación devuelve `from` (CA-RF-43)', async () => {
    const firmada = await signTransaction(entradaBase(), claves);
    const parseada = Transaction.from(firmada.rawTransaction);

    expect(firmada.chainId).toBe(31_337);
    expect(firmada.chainIdHex).toBe('0x7a69');
    expect(parseada.chainId).toBe(31_337n);
    // La firma es recuperable: `r || s || yParity` corresponden a `from` y al digest con chainId.
    expect(parseada.from).toBe(CUENTA_1);
    expect(parseada.signature?.yParity).toBe(firmada.yParity);
    expect(parseada.signature?.r).toBe(firmada.r);
    expect(parseada.signature?.s).toBe(firmada.s);
  });

  it('la firma es determinista (RFC 6979): dos firmas iguales dan el MISMO r y s', async () => {
    const primera = await signTransaction(entradaBase(), claves);
    const segunda = await signTransaction(entradaBase(), claves);

    expect(segunda.rawTransaction).toBe(primera.rawTransaction);
    expect(segunda.r).toBe(primera.r);
    expect(segunda.s).toBe(primera.s);
    expect(segunda.hash).toBe(primera.hash);
  });

  it('la firma tiene 65 bytes: r y s de 32 bytes y paridad 0/1', async () => {
    const firmada = await signTransaction(entradaBase(), claves);

    expect(firmada.r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(firmada.s).toMatch(/^0x[0-9a-f]{64}$/);
    // `0x` + r (64) + s (64) + v (2) = 132 caracteres hexadecimales.
    expect(firmada.r.length - 2 + (firmada.s.length - 2)).toBe(SIGNATURE_HEX_LENGTH - 4);
    expect([0, 1]).toContain(firmada.yParity);
    expect(firmada.v).toBe(27 + firmada.yParity);
  });

  it('un despliegue de contrato (to null) se firma sin destinatario', async () => {
    const firmada = await signTransaction(entradaBase({ to: null, data: '0x60806040' }), claves);
    const parseada = Transaction.from(firmada.rawTransaction);

    expect(firmada.to).toBeNull();
    expect(parseada.to).toBeNull();
    expect(parseada.data).toBe('0x60806040');
  });

  it('un gasLimit 0 o ausente NO se escribe en la transacción (el nodo decide)', () => {
    const sinGas = buildType2Transaction(entradaBase({ gasLimit: 0 }));
    const conGas = buildType2Transaction(entradaBase({ gasLimit: 5_000n }));

    expect(Object.keys(sinGas.transaction)).not.toContain('gasLimit');
    expect(conGas.transaction.gasLimit).toBe(5_000n);
  });

  it('no firma con la clave de OTRA cuenta: -32602 unknownAccount', async () => {
    await expect(signTransaction(entradaBase({ from: CUENTA_0 }), claves)).rejects.toMatchObject({
      code: -32602,
      message: 'La cuenta indicada no existe en la cartera.',
      data: { reason: 'signer-address-mismatch', from: CUENTA_0, signer: CUENTA_1 },
    });
  });

  it('sin clave resoluble no firma nada y responde -32602', async () => {
    await expect(
      signTransaction(entradaBase(), { resolvePrivateKey: async () => null }),
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: 'signing-key-unavailable', from: CUENTA_1 },
    });
  });

  it('signerFor acepta la clave correcta y rechaza la ajena con unknownAccount', () => {
    expect(signerFor(CLAVE_ANVIL_1, CUENTA_1).address).toBe(CUENTA_1);
    expect(() => signerFor(CLAVE_ANVIL_1, CUENTA_0)).toThrowError(
      expect.objectContaining({ code: -32602 }),
    );
    expect(new Wallet(CLAVE_ANVIL_1).address).toBe(CUENTA_1);
  });
});

describe('M11 · rechazo de una red ajena (chainNotRegistered 4901)', () => {
  it('un chainId que no es el activo se rechaza con 4901 antes de firmar', async () => {
    await expect(
      signTransaction(entradaBase({ chainId: '0x1', activeChainId: '0x7a69' }), claves),
    ).rejects.toMatchObject({
      code: 4901,
      message: 'La red solicitada no está dada de alta.',
      data: { reason: 'chain-id-mismatch', requested: 1, active: 31_337 },
    });
  });

  it('assertActiveChain devuelve el chainId activo cuando coinciden y compara en decimal', () => {
    expect(assertActiveChain('0x7a69', 31_337)).toBe(31_337);
    expect(assertActiveChain(31_337, '0x7a69')).toBe(31_337);
    expect(() => assertActiveChain('0xaa36a7', '0x7a69')).toThrowError(
      expect.objectContaining({ code: 4901 }),
    );
  });

  it('sin `activeChainId` se exige coherencia con el propio `chainId` (no hay firma cruzada)', async () => {
    // Sin red activa declarada, el propio `chainId` es el activo: firma correcta.
    const firmada = await signTransaction(entradaBase({ activeChainId: undefined }), claves);
    expect(firmada.chainId).toBe(31_337);
  });
});

describe('M11 · utilidades numéricas y de identificador', () => {
  it('toChainIdNumber acepta hexadecimal, decimal, número y cae al default de Anvil', () => {
    expect(toChainIdNumber('0x7a69')).toBe(31_337);
    expect(toChainIdNumber('31337')).toBe(31_337);
    expect(toChainIdNumber(31_337)).toBe(31_337);
    expect(toChainIdNumber('texto')).toBe(31_337);
    expect(toChainIdNumber(undefined)).toBe(31_337);
  });

  it('chainIdHexOf produce el hexadecimal canónico sin ceros a la izquierda', () => {
    expect(chainIdHexOf(31_337)).toBe('0x7a69');
    expect(chainIdHexOf(1)).toBe('0x1');
  });

  it('eip155V es 2·chainId+35/36 y toBigIntOrNull degrada valores no numéricos a null', () => {
    expect(eip155V(31_337, 0)).toBe(62_709);
    expect(eip155V(31_337, 1)).toBe(62_710);
    expect(eip155V(1, 0)).toBe(37);
    expect(eip155V(1, 1)).toBe(38);
    expect(toBigIntOrNull('0x10')).toBe(16n);
    expect(toBigIntOrNull('nope')).toBeNull();
    expect(toBigIntOrNull(1.5)).toBeNull();
    expect(toBigIntOrNull(null)).toBeNull();
  });

  it('LEGACY_TX_TYPE es 0 y EIP1559_TX_TYPE es 2 (los dos tipos que sabe firmar M11)', () => {
    expect(LEGACY_TX_TYPE).toBe(0);
    expect(EIP1559_TX_TYPE).toBe(2);
    expect(SIGNATURE_HEX_LENGTH).toBe(132);
  });
});

describe('M11 · firma legada EIP-155 desde sign.ts', () => {
  it('firma tipo 0 con `v` = chainId*2+35/36 (protección de replay)', async () => {
    const firmada = await signLegacyTransaction(
      entradaBase({ gasPrice: 10n * GWEI, feeData: null }),
      claves,
    );
    const parseada = Transaction.from(firmada.rawTransaction);

    expect(firmada.txType).toBe(LEGACY_TX_TYPE);
    expect(parseada.type).toBe(0);
    expect(parseada.chainId).toBe(31_337n);
    expect([62_709, 62_710]).toContain(firmada.v);
    expect(firmada.v).toBe(eip155V(31_337, firmada.yParity));
    expect(firmada.maxFeePerGas).toBe((10n * GWEI).toString());
  });

  it('sin gasPrice no firma: -32603 con motivo `missing-gas-price`', async () => {
    await expect(
      signLegacyTransaction(entradaBase({ gasPrice: 0, feeData: null }), claves),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Error interno de la cartera.',
      data: { reason: 'missing-gas-price' },
    });
  });
});
