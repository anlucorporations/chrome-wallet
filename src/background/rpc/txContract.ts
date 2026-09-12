/**
 * M7 — `src/background/rpc/txContract.ts`
 * **Contrato observable de la transacción** (`documento_tecnico.md` **§3.6**, §3.1 reglas 1, 6 y 8;
 * `diccionario_datos.md` **§3.6**; `plan_desarrollo.md` §3.4.5 tarea 4.10; RNF-25).
 *
 * QUÉ GARANTIZA
 * 1. **`eth_sendTransaction` devuelve el HASH al difundir** (`0x` + 64 hex), sin esperar al
 *    recibo: el seguimiento se hace después, con `eth_getTransactionReceipt`.
 * 2. **La estimación precede a la ventana**: `estimateGasOrBlock` corre ANTES de construir la
 *    vista previa y de abrir `notification.html`. Si el nodo revierte o la estimación falla, el
 *    envío queda **BLOQUEADO** con `-32000` (`estimateGasFailed`) y un **motivo accionable** en
 *    español; **no** se abre ninguna ventana y **no** se crea entrada en la cola (R14, RNF-25).
 * 3. **Estados observables**: `pending → confirmed` / `reverted` / `failed`, consultando
 *    `eth_getTransactionReceipt` con una cadencia y un plazo acotados. Cada transición produce
 *    **exactamente una** entrada de log ({@link txLogEntryFor}), que H5 persistirá en
 *    `truekeate_logs` (este módulo no escribe el almacén).
 * 4. **Se reutiliza el cliente RPC único (M5)**: ninguna llamada se hace con `fetch` propio ni con
 *    un `JsonRpcProvider` nuevo (RT-03), de modo que rige la política cerrada de reintentos
 *    (1 + 3, backoff 1/2/4 s, timeout 5 s).
 *
 * Redacción (M22 / §3.4 regla 4): lo que se registra de una transacción es `to`, `value`,
 * `dataLength` y los **primeros 10 bytes** de `data`; **nunca** el `data` completo ni la firma.
 */

import {
  TX_RECEIPT_MAX_POLLS,
  TX_RECEIPT_POLL_MS,
  TX_RECEIPT_TIMEOUT_MS,
} from '../../shared/constants';
import type { Eip1193Error, Hex, LogCategory, LogEventName, LogLevel } from '../../shared/types';
import { getRpcProvider, rpcSend } from './client';
import {
  broadcastRejectedError,
  createEip1193Error,
  errorDefinitionFor,
  estimateGasFailedError,
  internalError,
  isEip1193Error,
  type ErrorDefinitionFor,
} from './errors';
import type { FeeDataLike, ResolvedEip1559Fees } from '../crypto/sign';
import { resolveEip1559Fees } from '../crypto/sign';

// ---------------------------------------------------------------------------
// Causas de error: catálogo ÚNICO de M6 (`diccionario_datos.md` §4.3, v1.10)
// ---------------------------------------------------------------------------

/**
 * Vista de la fila `broadcastRejected` (`-32000`) del catálogo de M6.
 *
 * **Ya no es una constante local.** La v1.10 de `diccionario_datos.md` §4.3 registró la causa en
 * el bloque «Causas añadidas en la v1.10 (H4)» —código `-32000`, mensaje «La red rechazó la
 * transacción: `<motivo>`.» y acción «Revisar el motivo indicado y volver a intentarlo»—, y su
 * transcripción vive en `H4_ERROR_CATALOG` de `rpc/errors.ts`. Esta constante se conserva solo
 * como VISTA de esa fila (`errorDefinitionFor`) para no romper a quien la importaba de aquí.
 */
export const BROADCAST_REJECTED_DEFINITION: ErrorDefinitionFor<'broadcastRejected'> =
  errorDefinitionFor('broadcastRejected');

/** Error EIP-1193 de una difusión rechazada por el nodo (causa `broadcastRejected`, §4.3). */
export { broadcastRejectedError };

// ---------------------------------------------------------------------------
// Dependencias (todas con su valor real por defecto)
// ---------------------------------------------------------------------------

/** Emisor JSON-RPC mínimo: lo cumple `rpcSend` de M5. */
export interface RpcSender {
  send(method: string, params?: unknown[]): Promise<unknown>;
}

/** Emisor por defecto: el cliente RPC ÚNICO del Service Worker (M5). */
export const defaultRpcSender: RpcSender = {
  send: (method, params) => rpcSend(method, params ?? []),
};

/** Dependencias inyectables del contrato de transacción. */
export interface TxContractDeps {
  readonly rpc?: RpcSender;
  /** `getFeeData()` del proveedor único (M5). */
  readonly feeData?: () => Promise<FeeDataLike>;
  /** `getTransactionCount(address, 'pending')` del proveedor único (M5). */
  readonly transactionCount?: (address: string) => Promise<number>;
  readonly now?: () => number;
  readonly wait?: (ms: number) => Promise<void>;
}

/** Resuelve las dependencias con los valores de producción (nunca `any`). */
const resolveDeps = (deps: TxContractDeps = {}) => ({
  rpc: deps.rpc ?? defaultRpcSender,
  feeData: deps.feeData ?? (async (): Promise<FeeDataLike> => getRpcProvider().provider.getFeeData()),
  transactionCount:
    deps.transactionCount ??
    (async (address: string): Promise<number> =>
      getRpcProvider().provider.getTransactionCount(address, 'pending')),
  now: deps.now ?? (() => Date.now()),
  wait:
    deps.wait ??
    ((ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      })),
});

// ---------------------------------------------------------------------------
// Estados observables y su instrumentación
// ---------------------------------------------------------------------------

/**
 * Estado observable de una transacción.
 * - `pending`: difundida, sin recibo todavía.
 * - `confirmed`: recibo con `status === '0x1'`.
 * - `reverted`: recibo con `status === '0x0'` (revert on-chain).
 * - `failed`: no llegó a confirmarse (difusión rechazada, difusión interrumpida o plazo agotado).
 */
export type TxLifecycleState = 'pending' | 'confirmed' | 'reverted' | 'failed';

/** Recibo JSON-RPC tal y como lo devuelve el nodo (campos usados por el contrato). */
export interface TxReceiptLike {
  transactionHash?: string;
  status?: string;
  blockNumber?: string;
  gasUsed?: string;
  from?: string;
  to?: string | null;
  contractAddress?: string | null;
  revertReason?: string;
}

/** `txStatus` del `LogEntry`: el catálogo de §2.5.2 solo admite tres valores. */
export const txStatusFor = (state: TxLifecycleState): 'pending' | 'confirmed' | 'failed' =>
  state === 'confirmed' ? 'confirmed' : state === 'pending' ? 'pending' : 'failed';

/** Evento del catálogo de 24 (`LogEventName`) que corresponde a cada transición (§3.6). */
export const txLogEventFor = (state: TxLifecycleState): LogEventName =>
  state === 'confirmed'
    ? 'tx_confirmed'
    : state === 'reverted'
      ? 'tx_reverted'
      : state === 'failed'
        ? 'tx_failed'
        : 'tx_sent';

/** Categoría y nivel del `LogEntry` de cada transición (M22/M23 de §3.6). */
export const txLogCategoryFor = (_state: TxLifecycleState): LogCategory => 'tx';

/** Nivel del `LogEntry`: todo lo que no es `confirmed` se registra como aviso o error. */
export const txLogLevelFor = (state: TxLifecycleState): LogLevel =>
  state === 'confirmed' ? 'success' : state === 'pending' ? 'info' : 'error';

/** Transición observable, tal y como la consumirá H5 para escribir UNA entrada de log. */
export interface TxTransition {
  txHash: Hex;
  state: TxLifecycleState;
  event: LogEventName;
  category: LogCategory;
  level: LogLevel;
  txStatus: 'pending' | 'confirmed' | 'failed';
  message: string;
  /** Motivo del revert o del fallo; nunca el `data` íntegro (§3.4 regla 4). */
  reason?: string;
  at: number;
}

/** Mensajes en español (identificadores en inglés) de cada transición. */
export const TX_TRANSITION_MESSAGES = {
  pending: 'Transacción difundida; pendiente de confirmación.',
  confirmed: 'Transacción confirmada (recibo con status 0x1).',
  reverted: 'Transacción revertida en la cadena (recibo con status 0x0).',
  failed: 'La transacción no se confirmó.',
} as const;

/** Construye la transición observable de un estado (§3.6: 1 entrada por transición). */
export const txTransitionFor = (
  txHash: Hex,
  state: TxLifecycleState,
  options: { reason?: string; at?: number } = {},
): TxTransition => {
  const reason = options.reason;
  const message =
    state === 'failed' && reason !== undefined
      ? `${TX_TRANSITION_MESSAGES.failed} Motivo: ${reason}`
      : TX_TRANSITION_MESSAGES[state];
  return {
    txHash,
    state,
    event: txLogEventFor(state),
    category: txLogCategoryFor(state),
    level: txLogLevelFor(state),
    txStatus: txStatusFor(state),
    message,
    ...(reason === undefined ? {} : { reason }),
    at: options.at ?? Date.now(),
  };
};

/** Alias corto y estable: una entrada de log por transición. */
export const txLogEntryFor = txTransitionFor;

// ---------------------------------------------------------------------------
// Motivos accionables a partir del error del nodo
// ---------------------------------------------------------------------------

/** Acota el motivo para que la UI no muestre una traza enorme. */
const MAX_REASON_LENGTH = 300;

/** Motivo anidado que `ethers` deja en `error.info.error.message` (causa real del nodo). */
const nestedNodeMessage = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const info = (error as Record<string, unknown>).info;
  if (typeof info !== 'object' || info === null) {
    return null;
  }
  const inner = (info as Record<string, unknown>).error;
  if (typeof inner !== 'object' || inner === null) {
    return null;
  }
  const message = (inner as Record<string, unknown>).message;
  return typeof message === 'string' && message.length > 0 ? message : null;
};

/**
 * Texto del error, buscando en las formas que usan `ethers` y los nodos.
 *
 * El orden importa para que el motivo sea ACCIONABLE y corto: `shortMessage` y el mensaje anidado
 * del nodo («insufficient funds», «execution reverted: …») describen la causa; `message` de
 * `ethers` arrastra la transacción serializada completa y no es apto para la UI.
 */
const describeError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    for (const key of ['shortMessage', 'reason'] as const) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    const nested = nestedNodeMessage(error);
    if (nested !== null) {
      return nested;
    }
    const detail = record.detail;
    if (typeof detail === 'string' && detail.length > 0) {
      return detail;
    }
    const message = record.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
};

/**
 * Motivo ACCIONABLE (corto) del fallo de una llamada al nodo.
 *
 * El mensaje de `ethers` empieza por la causa real y continúa con la traza completa
 * (`«insufficient funds (transaction={…}, info={…}, code=…, version=…})»`); para que el usuario
 * reciba un motivo y no un volcado, se corta en el primer bloque técnico y, en cualquier caso, se
 * acota a {@link MAX_REASON_LENGTH} caracteres.
 */
export const actionableReason = (error: unknown): string => {
  const cleaned = describeError(error).replace(/\s+/g, ' ').trim();
  const cut = cleaned.search(/\s\((?:transaction|action|argument|info|method|params)=/u);
  const text = cut > 0 ? cleaned.slice(0, cut) : cleaned;
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH)}…` : text;
};

/** Diagnóstico de un fallo del cliente M5: `data` lleva `reason`, `method` y `detail`. */
interface RpcFailureData {
  reason?: string;
  method?: string;
  detail?: string;
}

/** Extrae el diagnóstico tipado de un error EIP-1193 del cliente único (M5). */
const rpcFailureData = (error: Eip1193Error): RpcFailureData => {
  const data = error.data;
  if (typeof data !== 'object' || data === null) {
    return {};
  }
  const record = data as Record<string, unknown>;
  return {
    ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
    ...(typeof record.method === 'string' ? { method: record.method } : {}),
    ...(typeof record.detail === 'string' ? { detail: record.detail } : {}),
  };
};

/**
 * Clasifica el fallo de una llamada al nodo:
 * - **`node`**: el nodo respondió con un error de contrato/transacción (`reason: 'rpc-error'`) →
 *   el motivo es accionable (revert, nonce, fondos…) y se responde `-32000`.
 * - **`transport`**: no hubo respuesta (timeout, `ECONNREFUSED`) → se propaga `4900` del cliente,
 *   porque el problema no es la transacción sino la red local caída.
 */
const classifyRpcFailure = (
  error: unknown,
  method: string,
): { kind: 'node'; reason: string } | { kind: 'transport'; error: Eip1193Error } | null => {
  if (!isEip1193Error(error)) {
    return null;
  }
  const data = rpcFailureData(error);
  if (error.code === 4900 && data.method === method && data.reason === 'rpc-error') {
    return { kind: 'node', reason: data.detail ?? error.message };
  }
  if (error.code === 4900) {
    return { kind: 'transport', error };
  }
  // Otro error tipado de la cartera (no del nodo): se propaga tal cual.
  return { kind: 'transport', error };
};

// ---------------------------------------------------------------------------
// Comisiones y nonce definitivos (H-10)
// ---------------------------------------------------------------------------

/** Comisiones EIP-1559 normalizadas, siempre > 0, listas para la firma (M11). */
export const readEip1559Fees = async (deps: TxContractDeps = {}): Promise<ResolvedEip1559Fees> => {
  const resolved = resolveDeps(deps);
  let raw: FeeDataLike | null = null;
  try {
    raw = await resolved.feeData();
  } catch {
    // Sin `getFeeData()` (nodo sin `eth_maxPriorityFeePerGas`): M11 deriva los mínimos válidos.
    raw = null;
  }
  return resolveEip1559Fees(raw);
};

/** `nonce` DEFINITIVO de la cuenta: `getTransactionCount(account, 'pending')` (H-10/§3.1). */
export const readPendingNonce = async (
  address: string,
  deps: TxContractDeps = {},
): Promise<number> => resolveDeps(deps).transactionCount(address);

/** Código desplegado en una dirección: `eth_getCode` (lo usa `verifyingContractMismatch`). */
export const readContractCode = async (
  address: string,
  deps: TxContractDeps = {},
): Promise<Hex> => {
  const raw = await resolveDeps(deps).rpc.send('eth_getCode', [address, 'latest']);
  return (typeof raw === 'string' ? raw : '0x') as Hex;
};

// ---------------------------------------------------------------------------
// Estimación BLOQUEANTE (antes de abrir la ventana)
// ---------------------------------------------------------------------------

/** Resultado de la estimación: `ok` con el gas, o el error tipado que BLOQUEA el envío. */
export type EstimateGasOutcome =
  | { ok: true; gasLimit: Hex }
  | { ok: false; error: Eip1193Error };

/**
 * Estima el gas de una transacción. **Si falla, el envío queda bloqueado** con `-32000` y motivo
 * accionable, y el llamador NO debe abrir la ventana ni crear la entrada en la cola.
 *
 * Se ejecuta SIEMPRE antes de construir la vista previa (§3.1 regla 1, R14, RNF-25).
 */
export const estimateGasOrBlock = async (
  transaction: Record<string, unknown>,
  deps: TxContractDeps = {},
): Promise<EstimateGasOutcome> => {
  const resolved = resolveDeps(deps);
  try {
    const raw = await resolved.rpc.send('eth_estimateGas', [transaction]);
    if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]+$/.test(raw)) {
      return { ok: false, error: estimateGasFailedError('respuesta del nodo sin gas estimado') };
    }
    return { ok: true, gasLimit: raw as Hex };
  } catch (error) {
    const classified = classifyRpcFailure(error, 'eth_estimateGas');
    if (classified !== null && classified.kind === 'transport') {
      return { ok: false, error: classified.error };
    }
    const reason =
      classified !== null && classified.kind === 'node'
        ? // El detalle del cliente M5 es el mensaje de `ethers`: se acorta a un motivo accionable.
          actionableReason({ message: classified.reason })
        : actionableReason(error);
    return {
      ok: false,
      // Bloquea el envío con -32000 y el literal único de §4.3.
      error: estimateGasFailedError(reason),
    };
  }
};

// ---------------------------------------------------------------------------
// Difusión
// ---------------------------------------------------------------------------

/** ¿Tiene forma de hash de transacción (`0x` + 64 hex)? */
export const isTxHash = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value.trim());

/**
 * Difunde una transacción **ya firmada** (`eth_sendRawTransaction`) y devuelve el hash
 * **en cuanto se difunde** (§3.6: no se espera al recibo).
 *
 * @throws Eip1193Error `-32000` `broadcastRejected` si el nodo rechaza la transacción (con el
 *   motivo accionable) y `4900` si no hay conexión con la red local.
 */
export const broadcastSignedTransaction = async (
  rawTransaction: string,
  deps: TxContractDeps = {},
): Promise<Hex> => {
  const resolved = resolveDeps(deps);
  try {
    const raw = await resolved.rpc.send('eth_sendRawTransaction', [rawTransaction]);
    if (!isTxHash(raw)) {
      throw internalError({ reason: 'broadcast-without-hash' });
    }
    return raw;
  } catch (error) {
    if (isEip1193Error(error) && error.code === -32603) {
      // `internalError` propio: no se enmascara con un motivo del nodo.
      throw error;
    }
    const classified = classifyRpcFailure(error, 'eth_sendRawTransaction');
    if (classified !== null && classified.kind === 'transport') {
      const data = rpcFailureData(classified.error);
      if (data.reason === 'rpc-error') {
        // El nodo SÍ respondió: la política de reintentos de M5 lo envuelve en `4900`, pero el
        // diagnóstico dice que es un rechazo de la transacción → motivo accionable con `-32000`.
        throw broadcastRejectedError(actionableReason({ message: data.detail ?? classified.error.message }));
      }
      // Transporte real (timeout, `ECONNREFUSED`) o error tipado ajeno: se propaga tal cual.
      throw classified.error;
    }
    const reason =
      classified !== null && classified.kind === 'node'
        ? actionableReason({ message: classified.reason })
        : actionableReason(error);
    throw broadcastRejectedError(reason);
  }
};

/** Sinónimo explícito del contrato de §3.6: `eth_sendTransaction` → hash al difundir. */
export const sendTransaction = broadcastSignedTransaction;

// ---------------------------------------------------------------------------
// Seguimiento del recibo: pending → confirmed / reverted / failed
// ---------------------------------------------------------------------------

/** Recibo de una transacción, o `null` si todavía no hay (§3.6). */
export const readTransactionReceipt = async (
  txHash: string,
  deps: TxContractDeps = {},
): Promise<TxReceiptLike | null> => {
  const raw = await resolveDeps(deps).rpc.send('eth_getTransactionReceipt', [txHash]);
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  return raw as TxReceiptLike;
};

/** Estado que describe un recibo (o `pending` si aún no existe). */
export const stateFromReceipt = (receipt: TxReceiptLike | null): 'pending' | 'confirmed' | 'reverted' => {
  if (receipt === null) {
    return 'pending';
  }
  return receipt.status === '0x0' ? 'reverted' : 'confirmed';
};

/** Motivo del revert que anota el nodo, si lo aporta (nunca el `data` íntegro). */
export const revertReasonOf = (receipt: TxReceiptLike | null): string | undefined => {
  if (receipt === null) {
    return undefined;
  }
  for (const key of ['revertReason', 'reason'] as const) {
    const value = (receipt as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
};

/** Opciones del seguimiento del recibo. */
export interface FollowTransactionOptions {
  pollMs?: number;
  timeoutMs?: number;
  maxPolls?: number;
  /**
   * Se invoca **exactamente una vez por transición** con la entrada de log que H5 debe persistir
   * (§3.6). Un fallo del consumidor no debe romper el seguimiento: se avisa por consola.
   */
  onTransition?: (transition: TxTransition) => void;
}

/** Resultado del seguimiento. */
export interface TxFollowResult {
  txHash: Hex;
  /** Estado final observado (`pending` si se agotó el plazo sin recibo). */
  finalState: TxLifecycleState;
  receipt: TxReceiptLike | null;
  polls: number;
  /** `true` si se agotó el plazo sin recibo. */
  timedOut: boolean;
}

/**
 * Sigue una transacción difundida hasta `confirmed`/`reverted` o hasta agotar el plazo.
 *
 * Devuelve el estado final y **emite una transición por cada cambio observable**: la primera es
 * `pending` (justo tras difundir) y la segunda el estado del recibo. Un plazo agotado sin recibo
 * se resuelve como `failed` con su transición (`tx_failed`), nunca en silencio.
 */
export const followTransaction = async (
  txHash: string,
  deps: TxContractDeps = {},
  options: FollowTransactionOptions = {},
): Promise<TxFollowResult> => {
  const resolved = resolveDeps(deps);
  if (!isTxHash(txHash)) {
    throw internalError({ reason: 'invalid-tx-hash' });
  }
  const hash = txHash.trim() as Hex;
  const pollMs = options.pollMs ?? TX_RECEIPT_POLL_MS;
  const timeoutMs = options.timeoutMs ?? TX_RECEIPT_TIMEOUT_MS;
  const maxPolls = options.maxPolls ?? TX_RECEIPT_MAX_POLLS;
  const emit = (transition: TxTransition): void => {
    if (options.onTransition === undefined) {
      return;
    }
    try {
      options.onTransition(transition);
    } catch (error) {
      console.warn('[truekeate] el consumidor de transiciones de transacción falló', error);
    }
  };

  const startedAt = resolved.now();
  let polls = 0;
  // Primera transición: la difusión deja la transacción `pending` (§3.6).
  emit(txTransitionFor(hash, 'pending', { at: startedAt }));

  while (polls < maxPolls) {
    polls += 1;
    const receipt = await readTransactionReceipt(hash, deps);
    const state = stateFromReceipt(receipt);
    if (state === 'pending') {
      if (resolved.now() - startedAt >= timeoutMs) {
        break;
      }
      await resolved.wait(pollMs);
      continue;
    }
    const reason = state === 'reverted' ? revertReasonOf(receipt) : undefined;
    emit(
      txTransitionFor(hash, state, {
        ...(reason === undefined ? {} : { reason }),
        at: resolved.now(),
      }),
    );
    return { txHash: hash, finalState: state, receipt, polls, timedOut: false };
  }

  // Plazo agotado sin recibo: `failed` con su traza (nunca una transacción en vuelo sin cierre).
  emit(
    txTransitionFor(hash, 'failed', {
      reason: 'no se recibió el recibo dentro del plazo de seguimiento',
      at: resolved.now(),
    }),
  );
  return { txHash: hash, finalState: 'failed', receipt: null, polls, timedOut: true };
};

/** Consulta puntual (sin espera) del estado observable de una transacción. */
export const observeTransaction = async (
  txHash: string,
  deps: TxContractDeps = {},
): Promise<{ txHash: Hex; state: TxLifecycleState; receipt: TxReceiptLike | null }> => {
  if (!isTxHash(txHash)) {
    throw internalError({ reason: 'invalid-tx-hash' });
  }
  const hash = txHash.trim() as Hex;
  const receipt = await readTransactionReceipt(hash, deps);
  return { txHash: hash, state: stateFromReceipt(receipt), receipt };
};

/**
 * Error tipado de un rechazo del nodo en la difusión (causa `broadcastRejected` de §4.3, v1.10).
 * Se expone aquí para que el contrato observable no tenga que conocer el catálogo.
 */
export const broadcastFailureError = (reason: string): Eip1193Error =>
  broadcastRejectedError(reason);

/** Error tipado del envío bloqueado por estimación fallida (§4.3, causa `estimateGasFailed`). */
export const estimationBlockedError = (reason: string): Eip1193Error =>
  createEip1193Error('estimateGasFailed', { motivo: reason });
