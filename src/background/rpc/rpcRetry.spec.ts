/**
 * `src/background/rpc/rpcRetry.spec.ts` — Política CERRADA de reintentos del cliente RPC (M5).
 *
 * §3.3.5 tarea 3.4 y §3.3.7 («`rpcRetry.spec.ts` (1+3 con backoff)»): **1 intento + 3 reintentos =
 * 4 llamadas**, backoff **1 s / 2 s / 4 s** y timeout de 5 s por intento. Agotada la política, la
 * página recibe `4900` con el literal de §4.3, la UI queda «desconectado» y el **almacén queda
 * intacto** (`CA-RF-18` / RNF-07).
 *
 * Las 4 llamadas se cuentan sobre el proveedor ÚNICO real (`ethers.JsonRpcProvider`) interceptando
 * su `send`: no hay red, pero sí el mismo objeto y el mismo bucle que usa producción. El `sleep` se
 * inyecta, de modo que el backoff se MIDE (1 000 / 2 000 / 4 000 ms) sin esperar 7 s reales.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { chromeStub } from '../../../test/setup/chrome-stub';
import {
  DEFAULT_RPC_URL,
  RPC_ATTEMPTS,
  RPC_BACKOFF_MS,
  RPC_RETRIES,
  RPC_TIMEOUT_MS,
} from '../../shared/constants';
import {
  backoffFor,
  findNodeRejection,
  getRpcProvider,
  getRpcStatus,
  resetRpcProvider,
  rpcSend,
} from './client';

/** Error de transporte con la forma que produce Node al no haber nada escuchando. */
const refusedError = (): Error =>
  Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8545'), { code: 'ECONNREFUSED' });

/** Error de vencimiento por intento, tal y como lo clasifica `ethers.isError(error, 'TIMEOUT')`. */
const timeoutError = (): Error => Object.assign(new Error('timeout'), { code: 'TIMEOUT' });

/** Espera inyectada: registra los milisegundos pedidos y resuelve de inmediato. */
const sleepSpy = (): ReturnType<typeof vi.fn> => vi.fn(async (_ms: number) => undefined);

/** Proveedor único real con su `send` interceptado (el mock se configura en cada prueba). */
const spyOnSend = (impl: () => Promise<unknown>) => {
  const { provider } = getRpcProvider();
  return vi.spyOn(provider, 'send').mockImplementation(impl);
};

afterEach(() => {
  vi.restoreAllMocks();
  resetRpcProvider();
});

describe('M5 · política cerrada 1+3 con backoff 1/2/4 s (CA-RF-18 / RNF-07)', () => {
  it('con el nodo caído hace EXACTAMENTE 4 llamadas y espera 1000/2000/4000 ms', async () => {
    const send = spyOnSend(async () => {
      throw refusedError();
    });
    const sleep = sleepSpy();

    await expect(rpcSend('eth_chainId', [], { sleep })).rejects.toMatchObject({ code: 4900 });

    expect(RPC_ATTEMPTS).toBe(4);
    expect(RPC_RETRIES).toBe(3);
    expect(RPC_BACKOFF_MS).toEqual([1_000, 2_000, 4_000]);
    expect(RPC_TIMEOUT_MS).toBe(5_000);
    expect(send, 'total de llamadas = 1 intento + 3 reintentos').toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((llamada) => llamada[0])).toEqual([1_000, 2_000, 4_000]);
    // Ninguna espera DESPUÉS del cuarto intento: el backoff precede a cada reintento.
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('el error final es el 4900 de §4.3 con el diagnóstico de los 4 intentos', async () => {
    spyOnSend(async () => {
      throw refusedError();
    });
    const sleep = sleepSpy();

    const error = await rpcSend('eth_getBalance', ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'latest'], {
      sleep,
    }).then(
      () => null,
      (causa: unknown) => causa as { code: number; message: string; data: Record<string, unknown> },
    );

    expect(error?.code).toBe(4900);
    expect(error?.message).toBe('Sin conexión con la red local (Anvil).');
    expect(error?.data.reason).toBe('transport');
    expect(error?.data.detail).toBe('ECONNREFUSED');
    expect(error?.data.method).toBe('eth_getBalance');
    expect(error?.data.attempts).toBe(4);
    expect(error?.data.retries).toBe(3);
    expect(error?.data.backoffMs).toEqual([1_000, 2_000, 4_000]);
    expect(error?.data.timeoutMs).toBe(5_000);
    expect(error?.data.rpcUrl).toBe(DEFAULT_RPC_URL);
  });

  it('un timeout por intento se clasifica como `timeout` y agota la misma política', async () => {
    const send = spyOnSend(async () => {
      throw timeoutError();
    });
    const sleep = sleepSpy();

    const error = await rpcSend('eth_blockNumber', [], { sleep, timeoutMs: 5_000 }).then(
      () => null,
      (causa: unknown) => causa as { data: Record<string, unknown> },
    );
    expect(error?.data.reason).toBe('timeout');
    expect(error?.data.detail).toBe('5000 ms');
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('un éxito en el tercer intento CORTA la política (2 reintentos, no 3)', async () => {
    const send = spyOnSend(async () => '0x7a69');
    send.mockRejectedValueOnce(refusedError()).mockRejectedValueOnce(refusedError());
    const sleep = sleepSpy();

    await expect(rpcSend('eth_chainId', [], { sleep })).resolves.toBe('0x7a69');
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((llamada) => llamada[0])).toEqual([1_000, 2_000]);
  });

  it('con `attempts: 1` no hay ningún reintento ni ninguna espera', async () => {
    const send = spyOnSend(async () => {
      throw refusedError();
    });
    const sleep = sleepSpy();

    await expect(rpcSend('eth_chainId', [], { sleep, attempts: 1 })).rejects.toMatchObject({
      code: 4900,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('el estado observable pasa a `disconnected` al agotar y a `connected` al responder', async () => {
    const send = spyOnSend(async () => {
      throw refusedError();
    });
    const sleep = sleepSpy();
    await expect(rpcSend('eth_chainId', [], { sleep })).rejects.toMatchObject({ code: 4900 });
    expect(getRpcStatus()).toBe('disconnected');

    send.mockResolvedValue('0x7a69');
    await expect(rpcSend('eth_chainId', [], { sleep })).resolves.toBe('0x7a69');
    expect(getRpcStatus()).toBe('connected');
  });

  it('el almacén queda INTACTO: agotar la política no escribe nada (RNF-07)', async () => {
    await chrome.storage.local.set({ truekeate_accounts: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'] });
    const escriturasAntes = chromeStub.storage.local.writes().length;

    spyOnSend(async () => {
      throw refusedError();
    });
    await expect(rpcSend('eth_chainId', [], { sleep: sleepSpy() })).rejects.toMatchObject({
      code: 4900,
    });

    expect(chromeStub.storage.local.writes().length).toBe(escriturasAntes);
    expect((await chrome.storage.local.get('truekeate_accounts')).truekeate_accounts).toEqual([
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    ]);
  });

  it('`backoffFor` recorre 1/2/4 s y satura en el último valor con índice fuera de rango', () => {
    expect(backoffFor(0)).toBe(1_000);
    expect(backoffFor(1)).toBe(2_000);
    expect(backoffFor(2)).toBe(4_000);
    expect(backoffFor(3), 'no hay un cuarto backoff: satura en 4 s').toBe(4_000);
    // Un índice negativo no ocurre en producción; la implementación lo satura en 0.
    expect(backoffFor(-1)).toBe(0);
    expect(backoffFor(1, [10, 20])).toBe(20);
    expect(backoffFor(5, [])).toBe(0);
  });
});

/**
 * Rechazo DETERMINISTA del nodo (fleco 3 de la fase 4). El nodo RESPONDIÓ: no es «sin conexión».
 * Un error de respuesta no se reintenta —reintentarlo no puede cambiar el resultado— y no se
 * degrada a `4900`. El caso medido en el E2E (`-32003 Insufficient funds for gas * price + value`)
 * gastaba los 4 intentos con 7 s de backoff y salía como `4900`.
 */
describe('M5 · el rechazo del nodo NO se confunde con «sin conexión» (fleco 3 de la fase 4)', () => {
  /** Error JSON-RPC tal y como lo devuelve Anvil dentro de la cadena de `ethers`. */
  const nodeRejection = (code: number, message: string): Error =>
    Object.assign(new Error(message), { code, data: { message } });

  /** Error de `ethers` que ENVUELVE el rechazo del nodo (`code` de cadena + `error` anidado). */
  const wrappedRejection = (code: number, message: string): Error => {
    const wrapper = Object.assign(new Error('execution reverted (action="estimateGas")'), {
      code: 'CALL_EXCEPTION',
    }) as Error & { error?: unknown };
    wrapper.error = nodeRejection(code, message);
    return wrapper;
  };

  it('con `-32003` hace UNA sola llamada: ni reintentos ni backoff', async () => {
    const send = spyOnSend(async () => {
      throw nodeRejection(-32003, 'Insufficient funds for gas * price + value');
    });
    const sleep = sleepSpy();

    const error = await rpcSend('eth_estimateGas', [{}], { sleep }).then(
      () => null,
      (causa: unknown) => causa as { nodeCode?: number; nodeMessage?: string },
    );

    expect(error?.nodeCode).toBe(-32003);
    expect(error?.nodeMessage).toBe('Insufficient funds for gas * price + value');
    expect(send, 'un rechazo determinista NO se reintenta').toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('el rechazo envuelto por `ethers` también se detecta y tampoco se reintenta', async () => {
    const send = spyOnSend(async () => {
      throw wrappedRejection(-32003, 'Insufficient funds for gas * price + value');
    });
    const sleep = sleepSpy();

    await expect(rpcSend('eth_estimateGas', [{}], { sleep })).rejects.toMatchObject({
      nodeCode: -32003,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('el nodo que responde NO deja la conexión «desconectada»', async () => {
    spyOnSend(async () => {
      throw nodeRejection(-32003, 'Insufficient funds for gas * price + value');
    });
    await expect(rpcSend('eth_estimateGas', [{}], { sleep: sleepSpy() })).rejects.toMatchObject({
      nodeCode: -32003,
    });
    // El nodo contestó (con un error), así que sigue habiendo conexión: el `4900` y el estado
    // «desconectado» quedan reservados a «no hubo respuesta» (RNF-07).
    expect(getRpcStatus()).toBe('connected');
  });

  it('los códigos PROPIOS de la cartera (4900, 4001…) NO se clasifican como rechazo del nodo', () => {
    // Un `4900` del cliente es «sin conexión» y debe seguir agotando la política completa.
    expect(findNodeRejection(Object.assign(new Error('x'), { code: 4900 }))).toBeNull();
    expect(findNodeRejection(Object.assign(new Error('x'), { code: 4001 }))).toBeNull();
    expect(findNodeRejection(refusedError())).toBeNull();
    expect(findNodeRejection(timeoutError())).toBeNull();
    expect(findNodeRejection(null)).toBeNull();
    expect(findNodeRejection('texto')).toBeNull();
    // El rango reservado del servidor JSON-RPC SÍ es un rechazo del nodo.
    expect(findNodeRejection(nodeRejection(-32000, 'execution reverted'))?.nodeCode).toBe(-32000);
  });

  it('el transporte caído sigue agotando los 4 intentos y saliendo como 4900', async () => {
    const send = spyOnSend(async () => {
      throw refusedError();
    });
    const sleep = sleepSpy();
    await expect(rpcSend('eth_estimateGas', [{}], { sleep })).rejects.toMatchObject({ code: 4900 });
    expect(send).toHaveBeenCalledTimes(RPC_ATTEMPTS);
    expect(sleep.mock.calls.map((llamada) => llamada[0])).toEqual([1_000, 2_000, 4_000]);
  });
});
