/**
 * M11 — `src/background/crypto/eip1559.spec.ts`
 * Comisiones EIP-1559 estrictamente positivas (H4, tarea 4.9; `CA-RF-42`).
 *
 * Invariante que fija este fichero: **toda** transacción difundida es de tipo 2 y lleva
 * `maxFeePerGas > 0` y `maxPriorityFeePerGas > 0`, aunque el nodo informe de 0 o de nada: una
 * transacción con comisión 0 no es aceptada por la red y dejaría la solicitud inválida.
 */

import { describe, expect, it } from 'vitest';
import { Transaction } from 'ethers';

import {
  MIN_MAX_FEE_PER_GAS,
  MIN_MAX_PRIORITY_FEE_PER_GAS,
} from '../../shared/constants';
import { resolveEip1559Fees, signTransaction, type TransactionSigningInput } from './sign';

/** Clave privada de la cuenta #1 de Anvil (solo pruebas). */
const CLAVE_ANVIL_1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** 1 gwei (mínimo del proyecto). */
const GWEI = 1_000_000_000n;

/** Entrada de firma mínima. */
const entradaBase = (feeData: TransactionSigningInput['feeData']): TransactionSigningInput => ({
  from: CUENTA_1,
  to: CUENTA_0,
  value: '0x1',
  data: '0x',
  gasLimit: 21_000n,
  nonce: 0,
  chainId: '0x7a69',
  activeChainId: '0x7a69',
  feeData,
});

describe('M11 · resolución de comisiones EIP-1559 (siempre > 0)', () => {
  it('usa los valores del nodo cuando son positivos y los marca `node`', () => {
    const resueltas = resolveEip1559Fees({
      maxFeePerGas: 30n * GWEI,
      maxPriorityFeePerGas: 3n * GWEI,
      gasPrice: 12n * GWEI,
    });

    expect(resueltas.maxFeePerGas).toBe(30n * GWEI);
    expect(resueltas.maxPriorityFeePerGas).toBe(3n * GWEI);
    expect(resueltas.source).toEqual({ maxFeePerGas: 'node', maxPriorityFeePerGas: 'node' });
  });

  it('un 0 del nodo se sustituye por 2×gasPrice y por el mínimo acotado, marcados `derived`', () => {
    const resueltas = resolveEip1559Fees({
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      gasPrice: 5n,
    });

    // base = gasPrice = 5 wei; el mínimo del proyecto (1 gwei) NO cabe bajo la base, así que se usa la base.
    expect(resueltas.maxPriorityFeePerGas).toBe(5n);
    expect(resueltas.maxFeePerGas).toBe(10n);
    expect(resueltas.maxFeePerGas).toBeGreaterThan(0n);
    expect(resueltas.maxPriorityFeePerGas).toBeGreaterThan(0n);
    expect(resueltas.source).toEqual({ maxFeePerGas: 'derived', maxPriorityFeePerGas: 'derived' });
  });

  it('sin ninguna comisión usa los mínimos del proyecto (1 gwei cada una)', () => {
    const resueltas = resolveEip1559Fees(null);

    expect(MIN_MAX_FEE_PER_GAS).toBe(GWEI);
    expect(MIN_MAX_PRIORITY_FEE_PER_GAS).toBe(GWEI);
    expect(resueltas.maxPriorityFeePerGas).toBe(GWEI);
    // `maxFeePerGas` derivado es 2 × el mínimo del proyecto: el protocolo exige que cubra la base.
    expect(resueltas.maxFeePerGas).toBe(2n * GWEI);
    expect(resueltas.maxFeePerGas).toBeGreaterThan(resueltas.maxPriorityFeePerGas - 1n);
    expect(resueltas.source).toEqual({ maxFeePerGas: 'derived', maxPriorityFeePerGas: 'derived' });
  });

  it('`maxFeePerGas` nunca queda por debajo de `maxPriorityFeePerGas` (invariante del protocolo)', () => {
    const resueltas = resolveEip1559Fees({
      maxFeePerGas: 3n,
      maxPriorityFeePerGas: 10n,
    });

    expect(resueltas.maxPriorityFeePerGas).toBe(10n);
    expect(resueltas.maxFeePerGas).toBe(10n);
    expect(resueltas.maxFeePerGas).toBeGreaterThanOrEqual(resueltas.maxPriorityFeePerGas);
  });

  it('acepta los valores hexadecimales que devuelve el nodo por RPC', () => {
    const resueltas = resolveEip1559Fees({
      maxFeePerGas: '0x3b9aca00', // 1 000 000 000
      maxPriorityFeePerGas: '0x3b9aca00',
    });

    expect(resueltas.maxFeePerGas).toBe(GWEI);
    expect(resueltas.maxPriorityFeePerGas).toBe(GWEI);
    expect(resueltas.source).toEqual({ maxFeePerGas: 'node', maxPriorityFeePerGas: 'node' });
  });

  it('un valor negativo o ilegible del nodo se trata como ausente', () => {
    const resueltas = resolveEip1559Fees({
      maxFeePerGas: '-1',
      maxPriorityFeePerGas: 'no-es-un-numero',
      gasPrice: 8n,
    });

    expect(resueltas.maxFeePerGas).toBe(16n);
    expect(resueltas.maxPriorityFeePerGas).toBe(8n);
    expect(resueltas.source).toEqual({ maxFeePerGas: 'derived', maxPriorityFeePerGas: 'derived' });
  });
});

describe('M11 · la transacción firmada SIEMPRE lleva comisiones > 0 (CA-RF-42)', () => {
  it('con el nodo devolviendo 0 en ambas comisiones, la transacción firmada las deriva > 0', async () => {
    const firmada = await signTransaction(
      entradaBase({ maxFeePerGas: 0n, maxPriorityFeePerGas: 0n, gasPrice: 7n }),
      { privateKey: CLAVE_ANVIL_1 },
    );
    const parseada = Transaction.from(firmada.rawTransaction);

    expect(firmada.txType).toBe(2);
    expect(firmada.rawTransaction.startsWith('0x02')).toBe(true);
    expect(parseada.maxFeePerGas).toBe(14n);
    expect(parseada.maxPriorityFeePerGas).toBe(7n);
    expect(BigInt(firmada.maxFeePerGas)).toBeGreaterThan(0n);
    expect(BigInt(firmada.maxPriorityFeePerGas)).toBeGreaterThan(0n);
  });

  it('sin `feeData` en absoluto, la transacción firmada lleva comisiones derivadas > 0', async () => {
    const firmada = await signTransaction(entradaBase(null), { privateKey: CLAVE_ANVIL_1 });
    const parseada = Transaction.from(firmada.rawTransaction);

    expect(parseada.maxFeePerGas).toBe(2n * GWEI);
    expect(parseada.maxPriorityFeePerGas).toBe(GWEI);
    expect(firmada.maxFeePerGas).toBe((2n * GWEI).toString());
    expect(firmada.maxPriorityFeePerGas).toBe((1n * GWEI).toString());
  });

  it('con comisiones del nodo, la transacción firmada las conserva tal cual', async () => {
    const firmada = await signTransaction(
      entradaBase({ maxFeePerGas: 55n * GWEI, maxPriorityFeePerGas: 4n * GWEI }),
      { privateKey: CLAVE_ANVIL_1 },
    );
    const parseada = Transaction.from(firmada.rawTransaction);

    expect(parseada.maxFeePerGas).toBe(55n * GWEI);
    expect(parseada.maxPriorityFeePerGas).toBe(4n * GWEI);
    expect(parseada.type).toBe(2);
  });
});
