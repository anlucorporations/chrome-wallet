/**
 * M5 — `src/background/rpc/client.ts`
 * Cliente JSON-RPC del Service Worker: **UN ÚNICO** `JsonRpcProvider` de `ethers` para todo el
 * tráfico contra el nodo, con la política **CERRADA** de reintentos de `documento_tecnico.md`
 * §2.3 (invariante de ADT-23) y `plan_desarrollo.md` §3.3.5 tarea 3.4.
 *
 * QUÉ GARANTIZA
 * - **Un solo proveedor** (`ethers.JsonRpcProvider`): no se crea uno por petición. Se cachea por
 *   `(rpcUrl, chainId)`, de modo que un cambio de red lo reconstruye y lo descarta la última
 *   referencia (`destroy()`), sin fugas entre redes.
 * - **Política cerrada**: `1 intento + 3 reintentos = 4 llamadas`, backoff **1 s / 2 s / 4 s** y
 *   timeout de **5 s por intento**. No es ajustable desde la UI ni desde `truekeate_settings`.
 * - **Fallo observable**: agotados los 4 intentos se lanza SIEMPRE un objeto EIP-1193 del
 *   catálogo de M6 (`4900 rpcUnavailable`), nunca un `Error` sin `code` (RNF-06). La UI queda
 *   «desconectado» y el **almacén queda intacto**: este módulo no escribe NADA (RNF-07).
 * - **Sin `fetch` propio**: la red sale por `ethers` (RT-03) y la URL es la de la red activa, que
 *   en H3 es siempre Anvil local (`RE-04`).
 *
 * DEPENDENCIAS INYECTABLES (pruebas de `rpcRetry.spec.ts`): `sleep` y `timeoutMs` permiten
 * contar las 4 llamadas y verificar el backoff sin esperar 7 s reales.
 */

import { JsonRpcProvider, Network, isError, toBeHex } from 'ethers';
import {
  DEFAULT_CHAIN_ID,
  DEFAULT_CHAIN_ID_DECIMAL,
  DEFAULT_RPC_URL,
  RPC_ATTEMPTS,
  RPC_BACKOFF_MS,
  RPC_RETRIES,
  RPC_TIMEOUT_MS,
} from '../../shared/constants';
import { rpcUnavailableError } from './errors';

// ---------------------------------------------------------------------------
// Contrato público
// ---------------------------------------------------------------------------

/** Datos del `eth_chainId` normalizados. */
export interface RpcNetworkInfo {
  chainId: string;
  chainIdDecimal: number;
  rpcUrl: string;
}

/** Estado observable de la conexión con el nodo (la UI lo pinta como «desconectado»). */
export type RpcStatus = 'connected' | 'disconnected';

/** Valores que el cliente puede sobrescribir en las pruebas (nunca en producción). */
export interface RpcClientOptions {
  /** URL del nodo; por defecto, la red activa (Anvil local, `RE-04`). */
  rpcUrl?: string;
  /** `chainId` en hexadecimal esperado del nodo (`0x7a69` con Anvil). */
  chainId?: string;
  /** Milisegundos de espera entre reintentos; por defecto `RPC_BACKOFF_MS`. */
  backoffMs?: readonly number[];
  /** Timeout por intento, en milisegundos. */
  timeoutMs?: number;
  /** Total de llamadas permitidas (1 intento + reintentos). */
  attempts?: number;
  /** Espera inyectable (las pruebas la sustituyen por una resolución inmediata). */
  sleep?: (ms: number) => Promise<void>;
}

/** Espera real, sin `setInterval` (prohibido en el SW) ni `chrome.alarms` (son del plazo). */
const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Error de una llamada que no llegó a completarse (motivo de diagnóstico, nunca literal). */
interface RpcAttemptFailure {
  reason: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Proveedor único
// ---------------------------------------------------------------------------

/** Resultado de resolver el proveedor activo: instancia, red y URL. */
export interface ResolvedRpcProvider {
  provider: JsonRpcProvider;
  network: Network;
  rpcUrl: string;
}

/** Proveedor cacheado: existe UNO solo por `(rpcUrl, chainId)`. */
let cachedProvider: ResolvedRpcProvider | null = null;

/** Estado de la última llamada: base del indicador «desconectado» de la UI (RNF-07). */
let status: RpcStatus = 'disconnected';

/** Opciones del cliente resueltas con los valores de producción. */
const resolvedOptions = (options: RpcClientOptions = {}): Required<RpcClientOptions> => ({
  rpcUrl: options.rpcUrl ?? DEFAULT_RPC_URL,
  chainId: options.chainId ?? DEFAULT_CHAIN_ID,
  backoffMs: options.backoffMs ?? RPC_BACKOFF_MS,
  timeoutMs: options.timeoutMs ?? RPC_TIMEOUT_MS,
  attempts: options.attempts ?? RPC_ATTEMPTS,
  sleep: options.sleep ?? defaultSleep,
});

/** Milisegundos del backoff del reintento número `index` (0 → 1 s; si falta, el último). */
export const backoffFor = (index: number, backoffMs: readonly number[] = RPC_BACKOFF_MS): number =>
  backoffMs[Math.min(index, Math.max(0, backoffMs.length - 1))] ?? 0;

/**
 * Devuelve el proveedor ÚNICO de la red indicada, creándolo la primera vez.
 *
 * La red se declara ESTÁTICA (`new Network(name, chainId)`) porque el corpus dice que solo existe
 * Anvil (`CA-RT-06`): así `ethers` no gasta una llamada adicional en `eth_chainId` ni puede
 * «descubrir» una red distinta de la configurada.
 */
export const getRpcProvider = (options: RpcClientOptions = {}): ResolvedRpcProvider => {
  const { rpcUrl, chainId } = resolvedOptions(options);
  if (cachedProvider !== null && cachedProvider.rpcUrl === rpcUrl) {
    return cachedProvider;
  }
  if (cachedProvider !== null) {
    // Otra red: se descarta la referencia anterior (libera sus temporizadores internos).
    cachedProvider.provider.destroy();
    cachedProvider = null;
  }
  const decimal = Number.parseInt(chainId, 16);
  const network = new Network('truekeate', Number.isFinite(decimal) ? decimal : DEFAULT_CHAIN_ID_DECIMAL);
  const provider = new JsonRpcProvider(rpcUrl, network, { staticNetwork: network });
  cachedProvider = { provider, network, rpcUrl };
  return cachedProvider;
};

/** Descarta el proveedor cacheado (cambio de red o reinicio del SW). */
export const resetRpcProvider = (): void => {
  cachedProvider?.provider.destroy();
  cachedProvider = null;
};

/** Estado observable de la conexión: `disconnected` hasta la primera llamada con éxito. */
export const getRpcStatus = (): RpcStatus => status;

/** ¿Hay conexión con el nodo? Es lo que hace que la UI pase a «desconectado» (RNF-07). */
export const isRpcConnected = (): boolean => status === 'connected';

// ---------------------------------------------------------------------------
// Llamada con política cerrada de reintentos
// ---------------------------------------------------------------------------

/** Marca una llamada como fallida sin lanzar: el bucle de reintentos decide. */
const attemptCall = async (
  provider: JsonRpcProvider,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<{ ok: true; result: unknown } | { ok: false; failure: RpcAttemptFailure }> => {
  try {
    const result = await provider.send(method, params);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, failure: describeFailure(error, timeoutMs) };
  }
};

/** Traduce el fallo de un intento a un motivo corto (nunca el literal que ve la página). */
const describeFailure = (error: unknown, timeoutMs: number): RpcAttemptFailure => {
  if (isError(error, 'TIMEOUT')) {
    return { reason: 'timeout', detail: `${timeoutMs} ms` };
  }
  const record = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const code = typeof record.code === 'string' ? record.code : '';
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return { reason: 'transport', detail: code };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { reason: 'rpc-error', detail };
};

/**
 * Ejecuta una llamada JSON-RPC contra el nodo con la política cerrada.
 *
 * @param method Método JSON-RPC (`eth_chainId`, `eth_getBalance`, …).
 * @param params Parámetros posicionales del método (nunca secretos: viajan al nodo).
 * @param options Sobrescrituras de prueba; en producción, ninguna.
 * @throws Eip1193Error `4900 rpcUnavailable` cuando se agotan los `attempts` (4).
 */
export const rpcSend = async (
  method: string,
  params: unknown[] = [],
  options: RpcClientOptions = {},
): Promise<unknown> => {
  const resolved = resolvedOptions(options);
  const { provider } = getRpcProvider(options);
  const total = Math.max(1, resolved.attempts);
  let failure: RpcAttemptFailure = { reason: 'rpc-error', detail: 'sin intentos' };

  for (let attempt = 0; attempt < total; attempt += 1) {
    if (attempt > 0) {
      // Backoff ANTES de reintentar: 1 s tras el primer fallo, 2 s y 4 s después.
      await resolved.sleep(backoffFor(attempt - 1, resolved.backoffMs));
    }
    const outcome = await attemptCall(provider, method, params, resolved.timeoutMs);
    if (outcome.ok) {
      status = 'connected';
      return outcome.result;
    }
    failure = outcome.failure;
  }

  // Agotada la política: la UI queda «desconectado» y el almacén NO se ha tocado (RNF-07).
  status = 'disconnected';
  throw rpcUnavailableError({
    reason: failure.reason,
    detail: failure.detail,
    method,
    attempts: total,
    retries: RPC_RETRIES,
    backoffMs: resolved.backoffMs,
    timeoutMs: resolved.timeoutMs,
    rpcUrl: resolved.rpcUrl,
  });
};

// ---------------------------------------------------------------------------
// Lecturas tipadas de conveniencia (todas pasan por la MISMA política)
// ---------------------------------------------------------------------------

/** Informe de red del nodo, con el `chainId` en hexadecimal y decimal. */
export const getNetworkInfo = async (
  options: RpcClientOptions = {},
): Promise<RpcNetworkInfo> => {
  const raw = await rpcSend('eth_chainId', [], options);
  const chainId = typeof raw === 'string' ? raw : resolvedOptions(options).chainId;
  const decimal = Number.parseInt(chainId, 16);
  return {
    chainId,
    chainIdDecimal: Number.isFinite(decimal) ? decimal : DEFAULT_CHAIN_ID_DECIMAL,
    rpcUrl: resolvedOptions(options).rpcUrl,
  };
};

/** Número de bloque actual, como `bigint` (nunca como `number`). */
export const getBlockNumber = async (options: RpcClientOptions = {}): Promise<bigint> => {
  const raw = await rpcSend('eth_blockNumber', [], options);
  return BigInt(typeof raw === 'string' ? raw : '0x0');
};

/** Saldo en wei de una dirección, en hexadecimal (`WeiString`). */
export const getBalanceWei = async (
  address: string,
  options: RpcClientOptions = {},
): Promise<string> => {
  const raw = await rpcSend('eth_getBalance', [address, 'latest'], options);
  return typeof raw === 'string' ? raw : toBeHex(0n);
};

/** Precio del gas sugerido, en hexadecimal. */
export const getGasPrice = async (options: RpcClientOptions = {}): Promise<string> => {
  const raw = await rpcSend('eth_gasPrice', [], options);
  return typeof raw === 'string' ? raw : '0x0';
};

/** Estimación de gas de una transacción; el error del nodo se propaga tal cual (lo tipa M7). */
export const estimateGas = async (
  transaction: Record<string, unknown>,
  options: RpcClientOptions = {},
): Promise<string> => {
  const raw = await rpcSend('eth_estimateGas', [transaction], options);
  return typeof raw === 'string' ? raw : '0x0';
};
