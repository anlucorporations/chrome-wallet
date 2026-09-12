/**
 * M7 — `src/background/rpc/txContract.spec.ts`
 * Contrato observable de la transacción (H4, tarea 4.10 de `plan_desarrollo.md` §3.4.5; §3.4.7).
 *
 * Criterios que fija este fichero:
 * - `eth_sendTransaction` devuelve el **hash al difundir** (`0x` + 64 hex), sin esperar al recibo.
 * - `pending → confirmed` / `reverted` / `failed` consultando `eth_getTransactionReceipt`, con
 *   **exactamente una** transición observable por cambio de estado.
 * - `estimateGas` fallido **bloquea el envío** con `-32000` y motivo accionable, sin persistir nada
 *   (RNF-25: no se abre ventana ni se crea entrada en la cola).
 */

import { describe, expect, it, vi } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../../../test/setup/chrome-stub';
import type { Eip1193Error } from '../../shared/types';
import {
  actionableReason,
  broadcastSignedTransaction,
  broadcastRejectedError,
  estimateGasOrBlock,
  followTransaction,
  isTxHash,
  observeTransaction,
  readContractCode,
  readEip1559Fees,
  readPendingNonce,
  revertReasonOf,
  sendTransaction,
  stateFromReceipt,
  txLogCategoryFor,
  txLogEntryFor,
  txLogEventFor,
  txLogLevelFor,
  txStatusFor,
  type RpcSender,
  type TxContractDeps,
  type TxReceiptLike,
  type TxTransition,
} from './txContract';

/** Hash de transacción válido de referencia. */
const HASH = `0x${'1a'.repeat(32)}` as `0x${string}`;

/** Hash difundido distinto del anterior (para el seguimiento). */
const HASH_SEGUIDO = `0x${'2b'.repeat(32)}` as `0x${string}`;

/** Cuenta #0 de Anvil. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Llamada registrada por el doble de `RpcSender`. */
interface Llamada {
  method: string;
  params: unknown[];
}

/** Doble de `RpcSender`: devuelve las respuestas encoladas y registra cada llamada. */
const emisor = (
  respuestas: unknown[],
): { rpc: RpcSender; llamadas: Llamada[] } => {
  const llamadas: Llamada[] = [];
  return {
    llamadas,
    rpc: {
      async send(method: string, params?: unknown[]): Promise<unknown> {
        llamadas.push({ method, params: params ?? [] });
        if (respuestas.length === 0) {
          throw new Error(`[spec] sin respuesta encolada para ${method}`);
        }
        const siguiente = respuestas.shift();
        if (siguiente instanceof Error) throw siguiente;
        return siguiente;
      },
    },
  };
};

/**
 * Error EIP-1193 tipado para los casos negativos. Es una instancia de `Error` (para que el emisor
 * doble lo LANCE) con los campos del error EIP-1193 encima.
 */
const errorRpc = (parcial: Partial<Eip1193Error> & { code: number }): Eip1193Error =>
  Object.assign(new Error(parcial.message ?? 'Sin conexión con la red local (Anvil).'), parcial);

describe('M7 · difusión: el hash vuelve al difundir', () => {
  it('devuelve el hash del nodo y llama a eth_sendRawTransaction con la transacción cruda', async () => {
    const { rpc, llamadas } = emisor([HASH]);

    const hash = await broadcastSignedTransaction('0x02f8700182031184773594', { rpc });

    expect(hash).toBe(HASH);
    expect(llamadas).toEqual([
      { method: 'eth_sendRawTransaction', params: ['0x02f8700182031184773594'] },
    ]);
  });

  it('`sendTransaction` es el mismo contrato que `broadcastSignedTransaction`', () => {
    expect(sendTransaction).toBe(broadcastSignedTransaction);
  });

  it('una respuesta del nodo sin hash válido → -32603 broadcast-without-hash', async () => {
    const { rpc } = emisor(['0xabc']);

    await expect(broadcastSignedTransaction('0x02', { rpc })).rejects.toMatchObject({
      code: -32603,
      message: 'Error interno de la cartera.',
      data: { reason: 'broadcast-without-hash' },
    });
  });

  it('un rechazo del nodo se traduce a -32000 broadcastRejected con el motivo accionable', async () => {
    const { rpc } = emisor([
      errorRpc({
        code: 4900,
        data: {
          reason: 'rpc-error',
          method: 'eth_sendRawTransaction',
          detail: 'insufficient funds (transaction={}, info={}, code=INSUFFICIENT_FUNDS)',
        },
      }),
    ]);

    await expect(broadcastSignedTransaction('0x02', { rpc })).rejects.toMatchObject({
      code: -32000,
      message: 'La red rechazó la transacción: insufficient funds.',
      data: { cause: 'broadcastRejected', motivo: 'insufficient funds' },
    });
  });

  it('un fallo de transporte NO se enmascara: se propaga el 4900 del cliente RPC', async () => {
    const { rpc } = emisor([
      errorRpc({ code: 4900, data: { reason: 'transport', attempts: 4, retries: 3 } }),
    ]);

    await expect(broadcastSignedTransaction('0x02', { rpc })).rejects.toMatchObject({
      code: 4900,
      message: 'Sin conexión con la red local (Anvil).',
      data: { reason: 'transport', attempts: 4, retries: 3 },
    });
  });

  it('un error interno tipado del propio módulo no se disfraza de rechazo del nodo', async () => {
    const interno = errorRpc({ code: -32603, message: 'Error interno de la cartera.', data: { reason: 'x' } });
    const { rpc } = emisor([interno]);

    await expect(broadcastSignedTransaction('0x02', { rpc })).rejects.toMatchObject({ code: -32603 });
  });

  it('broadcastRejectedError construye el literal con el motivo incrustado', () => {
    expect(broadcastRejectedError('nonce too low')).toEqual({
      code: -32000,
      message: 'La red rechazó la transacción: nonce too low.',
      data: { cause: 'broadcastRejected', motivo: 'nonce too low' },
    });
    expect(broadcastRejectedError('x').message).not.toContain('<motivo>');
  });
});

describe('M7 · estimateGas bloqueante (RNF-25)', () => {
  it('una estimación correcta devuelve el gasLimit del nodo y no escribe nada', async () => {
    const { rpc, llamadas } = emisor(['0x5208']);

    const resultado = await estimateGasOrBlock({ from: CUENTA_0, to: CUENTA_0, value: '0x1' }, { rpc });

    expect(resultado).toEqual({ ok: true, gasLimit: '0x5208' });
    expect(llamadas).toEqual([
      { method: 'eth_estimateGas', params: [{ from: CUENTA_0, to: CUENTA_0, value: '0x1' }] },
    ]);
    expect(chromeStub.storage.local.writes()).toEqual([]);
  });

  it('un revert del nodo BLOQUEA el envío con -32000 y motivo accionable, sin persistir nada', async () => {
    const { rpc } = emisor([
      errorRpc({
        code: 4900,
        data: {
          reason: 'rpc-error',
          method: 'eth_estimateGas',
          detail: 'execution reverted: ERC20: transfer amount exceeds balance (action="estimateGas")',
        },
      }),
    ]);

    const resultado = await estimateGasOrBlock({ from: CUENTA_0 }, { rpc });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32000);
    expect(resultado.error.message).toBe(
      'La estimación de gas falló: execution reverted: ERC20: transfer amount exceeds balance. El envío se ha bloqueado.',
    );
    // El motivo viaja en el MENSAJE (literal de §4.3 con `<motivo>` ya sustituido).
    expect(resultado.error.data).toBeUndefined();
    // Ni entrada en la cola ni ventana: el bloqueo ocurre ANTES de la vista previa (§3.1 regla 1).
    expect(chromeStub.storage.local.writes()).toEqual([]);
    expect(await chromeStub.windows.getAll()).toEqual([]);
  });

  it('una excepción no tipada también bloquea con -32000 y su motivo', async () => {
    const { rpc } = emisor([new Error('nonce too low (transaction={}, info={})')]);

    const resultado = await estimateGasOrBlock({ from: CUENTA_0 }, { rpc });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32000);
    expect(resultado.error.message).toBe(
      'La estimación de gas falló: nonce too low. El envío se ha bloqueado.',
    );
    expect(resultado.error.data).toBeUndefined();
  });

  it('un transporte caído (4900 sin motivo de nodo) NO se convierte en -32000', async () => {
    const { rpc } = emisor([errorRpc({ code: 4900, data: { reason: 'transport', attempts: 4 } })]);

    const resultado = await estimateGasOrBlock({ from: CUENTA_0 }, { rpc });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4900);
    expect(resultado.error.data).toEqual({ reason: 'transport', attempts: 4 });
  });

  it('una respuesta sin gas estimado bloquea con -32000 y el motivo de la respuesta', async () => {
    const { rpc } = emisor([null]);

    const resultado = await estimateGasOrBlock({ from: CUENTA_0 }, { rpc });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32000);
    expect(resultado.error.message).toBe(
      'La estimación de gas falló: respuesta del nodo sin gas estimado. El envío se ha bloqueado.',
    );
    expect(resultado.error.data).toBeUndefined();
  });
});

describe('M7 · seguimiento del recibo: pending → confirmed / reverted / failed', () => {
  /** Dependencias con reloj inyectado y `wait` que avanza ese mismo reloj. */
  const depsConReloj = (
    reloj: { t: number },
    rpc: RpcSender,
  ): TxContractDeps => ({
    rpc,
    now: () => reloj.t,
    wait: async (ms: number) => {
      reloj.t += ms;
    },
  });

  it('pending → confirmed con EXACTAMENTE una transición por cambio de estado', async () => {
    const { rpc, llamadas } = emisor([null, null, { status: '0x1', blockNumber: '0x2' }]);
    const reloj = { t: STUB_EPOCH_MS };
    const transiciones: TxTransition[] = [];

    const resultado = await followTransaction(HASH_SEGUIDO, depsConReloj(reloj, rpc), {
      pollMs: 1_000,
      timeoutMs: 10_000,
      onTransition: (transicion) => transiciones.push(transicion),
    });

    expect(resultado.finalState).toBe('confirmed');
    expect(resultado.timedOut).toBe(false);
    expect(resultado.polls).toBe(3);
    expect(resultado.receipt).toEqual({ status: '0x1', blockNumber: '0x2' });
    expect(transiciones.map((t) => t.state)).toEqual(['pending', 'confirmed']);
    expect(transiciones[0]).toMatchObject({
      event: 'tx_sent',
      level: 'info',
      txStatus: 'pending',
      at: STUB_EPOCH_MS,
    });
    expect(transiciones[1]).toMatchObject({
      event: 'tx_confirmed',
      level: 'success',
      txStatus: 'confirmed',
      at: STUB_EPOCH_MS + 2_000,
    });
    expect(transiciones[1]?.message).toBe('Transacción confirmada (recibo con status 0x1).');
    expect(llamadas.every((llamada) => llamada.method === 'eth_getTransactionReceipt')).toBe(true);
    expect(llamadas).toHaveLength(3);
  });

  it('pending → reverted: el motivo del revert viaja en la transición', async () => {
    const { rpc } = emisor([
      null,
      { status: '0x0', revertReason: 'ERC20: transfer amount exceeds allowance' },
    ]);
    const reloj = { t: STUB_EPOCH_MS };
    const transiciones: TxTransition[] = [];

    const resultado = await followTransaction(HASH, depsConReloj(reloj, rpc), {
      pollMs: 1_000,
      timeoutMs: 10_000,
      onTransition: (transicion) => transiciones.push(transicion),
    });

    expect(resultado.finalState).toBe('reverted');
    expect(resultado.timedOut).toBe(false);
    expect(transiciones.map((t) => t.state)).toEqual(['pending', 'reverted']);
    expect(transiciones[1]).toMatchObject({
      event: 'tx_reverted',
      level: 'error',
      txStatus: 'failed',
      reason: 'ERC20: transfer amount exceeds allowance',
    });
  });

  it('plazo agotado sin recibo → failed con su traza (nunca en silencio)', async () => {
    const { rpc } = emisor([null, null, null, null, null]);
    const reloj = { t: STUB_EPOCH_MS };
    const transiciones: TxTransition[] = [];

    const resultado = await followTransaction(HASH, depsConReloj(reloj, rpc), {
      pollMs: 1_000,
      timeoutMs: 2_500,
      onTransition: (transicion) => transiciones.push(transicion),
    });

    expect(resultado.finalState).toBe('failed');
    expect(resultado.timedOut).toBe(true);
    expect(resultado.receipt).toBeNull();
    expect(resultado.polls).toBe(4);
    expect(reloj.t).toBe(STUB_EPOCH_MS + 3_000);
    expect(transiciones.map((t) => t.state)).toEqual(['pending', 'failed']);
    expect(transiciones[1]?.message).toBe(
      'La transacción no se confirmó. Motivo: no se recibió el recibo dentro del plazo de seguimiento',
    );
    expect(transiciones[1]?.event).toBe('tx_failed');
  });

  it('respeta el tope de sondeos aunque el plazo no se agote', async () => {
    const { rpc, llamadas } = emisor([null, null, null]);
    const reloj = { t: STUB_EPOCH_MS };

    const resultado = await followTransaction(HASH, depsConReloj(reloj, rpc), {
      pollMs: 1_000,
      timeoutMs: 120_000,
      maxPolls: 3,
    });

    expect(resultado.polls).toBe(3);
    expect(llamadas).toHaveLength(3);
    expect(resultado.finalState).toBe('failed');
  });

  it('un txHash malformado → -32603 invalid-tx-hash sin sondear el nodo', async () => {
    const { rpc, llamadas } = emisor([]);

    await expect(followTransaction('0x1234', { rpc })).rejects.toMatchObject({
      code: -32603,
      data: { reason: 'invalid-tx-hash' },
    });
    expect(llamadas).toEqual([]);
  });

  it('un consumidor de transiciones que falla no rompe el seguimiento', async () => {
    const { rpc } = emisor([{ status: '0x1' }]);
    const reloj = { t: STUB_EPOCH_MS };

    const resultado = await followTransaction(HASH, depsConReloj(reloj, rpc), {
      pollMs: 1_000,
      timeoutMs: 10_000,
      onTransition: () => {
        throw new Error('consumidor roto');
      },
    });

    expect(resultado.finalState).toBe('confirmed');
    expect(resultado.polls).toBe(1);
  });

  it('observeTransaction consulta el estado puntual sin esperar ni sondear', async () => {
    const { rpc, llamadas } = emisor([{ status: '0x0' }]);

    const observado = await observeTransaction(HASH, { rpc });

    expect(observado.state).toBe('reverted');
    expect(observado.txHash).toBe(HASH);
    expect(llamadas).toHaveLength(1);
  });

  it('stateFromReceipt y revertReasonOf traducen el recibo del nodo', () => {
    expect(stateFromReceipt(null)).toBe('pending');
    expect(stateFromReceipt({ status: '0x1' })).toBe('confirmed');
    expect(stateFromReceipt({ status: '0x0' })).toBe('reverted');
    expect(stateFromReceipt({})).toBe('confirmed');
    expect(revertReasonOf(null)).toBeUndefined();
    expect(revertReasonOf({ status: '0x0', reason: 'motivo' } as TxReceiptLike)).toBe('motivo');
    expect(revertReasonOf({ status: '0x0' })).toBeUndefined();
  });

  it('isTxHash exige 0x + 64 hex', () => {
    expect(isTxHash(HASH)).toBe(true);
    expect(isTxHash(`0x${'A'.repeat(64)}`)).toBe(true);
    expect(isTxHash('0x1234')).toBe(false);
    expect(isTxHash(`0x${'1a'.repeat(33)}`)).toBe(false);
    expect(isTxHash(123)).toBe(false);
  });
});

describe('M7 · instrumentación de las transiciones (una entrada por transición)', () => {
  it('txStatusFor, txLogEventFor, txLogCategoryFor y txLogLevelFor cubren los 4 estados', () => {
    expect(txStatusFor('pending')).toBe('pending');
    expect(txStatusFor('confirmed')).toBe('confirmed');
    expect(txStatusFor('reverted')).toBe('failed');
    expect(txStatusFor('failed')).toBe('failed');

    expect(txLogEventFor('pending')).toBe('tx_sent');
    expect(txLogEventFor('confirmed')).toBe('tx_confirmed');
    expect(txLogEventFor('reverted')).toBe('tx_reverted');
    expect(txLogEventFor('failed')).toBe('tx_failed');

    expect(txLogCategoryFor('pending')).toBe('tx');
    expect(txLogCategoryFor('failed')).toBe('tx');

    expect(txLogLevelFor('pending')).toBe('info');
    expect(txLogLevelFor('confirmed')).toBe('success');
    expect(txLogLevelFor('reverted')).toBe('error');
    expect(txLogLevelFor('failed')).toBe('error');
  });

  it('txLogEntryFor produce la entrada con hash, estado, evento y hora', () => {
    const entrada = txLogEntryFor(HASH, 'confirmed', { at: STUB_EPOCH_MS });

    expect(entrada).toMatchObject({
      txHash: HASH,
      state: 'confirmed',
      event: 'tx_confirmed',
      category: 'tx',
      level: 'success',
      txStatus: 'confirmed',
      at: STUB_EPOCH_MS,
    });
    expect(entrada.reason).toBeUndefined();
    expect(txLogEntryFor(HASH, 'reverted', { reason: 'motivo' }).reason).toBe('motivo');
  });

  it('actionableReason acorta el volcado técnico y respeta el tope de 300 caracteres', () => {
    expect(actionableReason({ message: 'insufficient funds (transaction={a:1}, info={})' })).toBe(
      'insufficient funds',
    );
    expect(actionableReason({ shortMessage: 'nonce too low', message: 'otra cosa' })).toBe(
      'nonce too low',
    );
    expect(actionableReason({ detail: 'execution reverted: x' })).toBe('execution reverted: x');
    expect(actionableReason(new Error('a'.repeat(400)))).toBe(`${'a'.repeat(300)}…`);
    expect(actionableReason({ message: '  espacios   de   más  ' })).toBe('espacios de más');
  });
});

describe('M7 · comisiones y nonce definitivos (H-10)', () => {
  it('si `getFeeData` falla, deriva comisiones > 0 marcadas `derived`', async () => {
    const resueltas = await readEip1559Fees({
      feeData: async () => {
        throw new Error('eth_maxPriorityFeePerGas no soportado');
      },
    });

    expect(resueltas.maxPriorityFeePerGas).toBe(1_000_000_000n);
    expect(resueltas.maxFeePerGas).toBe(2_000_000_000n);
    expect(resueltas.source).toEqual({ maxFeePerGas: 'derived', maxPriorityFeePerGas: 'derived' });
  });

  it('usa las comisiones del nodo cuando son positivas', async () => {
    const resueltas = await readEip1559Fees({
      feeData: async () => ({ maxFeePerGas: 42n, maxPriorityFeePerGas: 7n, gasPrice: 30n }),
    });

    expect(resueltas.maxFeePerGas).toBe(42n);
    expect(resueltas.maxPriorityFeePerGas).toBe(7n);
    expect(resueltas.source).toEqual({ maxFeePerGas: 'node', maxPriorityFeePerGas: 'node' });
  });

  it('readPendingNonce usa `getTransactionCount(account, "pending")` del proveedor único', async () => {
    const transactionCount = vi.fn(async (address: string) => (address === CUENTA_0 ? 12 : 0));

    await expect(readPendingNonce(CUENTA_0, { transactionCount })).resolves.toBe(12);
    expect(transactionCount).toHaveBeenCalledWith(CUENTA_0);
  });

  it('readContractCode devuelve el código del nodo y degrada a `0x` sin código', async () => {
    const { rpc, llamadas } = emisor(['0x60806040', null]);

    await expect(readContractCode(CUENTA_0, { rpc })).resolves.toBe('0x60806040');
    await expect(readContractCode(CUENTA_0, { rpc })).resolves.toBe('0x');
    expect(llamadas).toEqual([
      { method: 'eth_getCode', params: [CUENTA_0, 'latest'] },
      { method: 'eth_getCode', params: [CUENTA_0, 'latest'] },
    ]);
  });
});
