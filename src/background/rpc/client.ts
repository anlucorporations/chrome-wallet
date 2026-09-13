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

/**
 * RECHAZO DEL NODO (fleco 3 de la fase 4): el nodo respondió, pero con un error JSON-RPC
 * determinista (`-32003 Insufficient funds for gas * price + value`, `-32000`, un revert, …).
 *
 * Es la clase de fallo que faltaba: hasta ahora se contaba como un intento fallido más, así que un
 * rechazo DETERMINISTA del nodo gastaba los 4 intentos con 7 s de backoff y acababa saliendo como
 * `4900 rpcUnavailable` («Sin conexión con la red local (Anvil).»), confundiendo «el nodo me
 * rechazó» con «no hay conexión» y marcando la UI como «desconectado». Un error de respuesta NO se
 * reintenta: reintentarlo no puede cambiar el resultado.
 */
export interface RpcNodeRejection {
  ok: false;
  /** Código JSON-RPC devuelto por el nodo (numérico y, en la práctica, negativo). */
  nodeCode: number;
  /** Motivo accionable tal y como lo devolvió el nodo (texto en inglés de Anvil/EVM). */
  nodeMessage: string;
  /** `data` del error JSON-RPC, solo diagnóstico. */
  nodeData?: unknown;
  method: string;
}

/** ¿Es un rechazo del nodo con `code` numérico (respuesta JSON-RPC), y no un fallo de transporte? */
export const nodeRejectionOf = (error: unknown): RpcNodeRejection | null => {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const record = error as { code?: unknown; message?: unknown; data?: unknown; method?: unknown };
  // Los fallos de `ethers` y de `fetch` usan `code` de CADENA (`TIMEOUT`, `ECONNREFUSED`,
  // `NETWORK_ERROR`): no son rechazos del nodo.
  if (typeof record.code !== 'number' || !Number.isFinite(record.code)) {
    return null;
  }
  // Un rechazo del NODO es un error JSON-RPC de servidor: `-32768 … -32000` (rango reservado de
  // `-32000` a `-32099` para el servidor y `-32768` a `-32000` para la implementación). Los
  // códigos PROPIOS de la cartera (4001, 4100, 4200, 4900, 4901) quedan FUERA a propósito: un
  // `4900` del cliente NO es un rechazo del nodo y debe seguir siendo «sin conexión».
  if (record.code > -32_000 || record.code < -32_768) {
    return null;
  }
  const rejection: RpcNodeRejection = {
    ok: false,
    nodeCode: record.code,
    nodeMessage: typeof record.message === 'string' ? record.message : '',
    method: typeof record.method === 'string' ? record.method : '',
  };
  if (record.data !== undefined) {
    rejection.nodeData = record.data;
  }
  return rejection;
};

/** Extrae la cadena de errores anidados de `ethers` (`error` / `info.error` / `data`). */
const nestedRecords = (error: unknown): Record<string, unknown>[] => {
  const found: Record<string, unknown>[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth += 1) {
    const record = current as Record<string, unknown>;
    found.push(record);
    const next = record.error ?? (record.info as { error?: unknown } | undefined)?.error;
    current = next;
  }
  return found;
};

/**
 * ¿La cadena de errores contiene un RECHAZO DEL NODO? Se recorre la cadena de causas porque
 * `ethers` envuelve el error JSON-RPC original en un error propio (`code: 'CALL_EXCEPTION'`), de
 * modo que la respuesta del nodo (`-32003`) queda anidada.
 */
export const findNodeRejection = (error: unknown): RpcNodeRejection | null => {
  for (const record of nestedRecords(error)) {
    const rejection = nodeRejectionOf(record);
    if (rejection !== null) {
      return rejection;
    }
  }
  return null;
};

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
    // Rechazo DETERMINISTA del nodo: se lanza tal cual para que NO se reintente y para que el
    // llamador pueda tiparlo con la causa de §4.3 que corresponda (p. ej. `estimateGasFailed`).
    // El nodo respondió, así que la conexión se da por buena: «desconectado» queda reservado a
    // «no hubo respuesta» (RNF-07).
    const rejection = findNodeRejection(error);
    if (rejection !== null) {
      status = 'connected';
      throw rejection;
    }
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
 * @throws RpcNodeRejection cuando el nodo RECHAZA la llamada (error JSON-RPC determinista): es una
 * respuesta, no un fallo de conexión, así que **no** se reintenta, **no** se responde `4900` y la
 * UI **no** pasa a «desconectado».
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
