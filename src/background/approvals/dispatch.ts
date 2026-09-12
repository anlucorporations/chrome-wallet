/**
 * M19.b — `src/background/approvals/dispatch.ts`
 * **Ruta de producción de los 6 métodos aprobables** (H4, cierre de `D-H4-E1`).
 *
 * QUÉ CIERRA ESTE MÓDULO
 * Hasta ahora los 6 métodos de `ApprovalMethod` estaban DECLARADOS con `requiresApproval: true`
 * (`rpc/catalog.ts`) pero **no los consumía nadie**: `enqueueApprovalRequest` (M14) no tenía
 * llamador de producción, las previews de M19 solo se usaban dentro de su propio módulo y
 * `showOldestPending` (M18) solo se invocaba desde los propios módulos de aprobaciones. El
 * resultado medido era que la ventana de confirmación **nunca se abría** (`waitForEvent("page")
 * Timeout 20000 ms` en `e2e/04-enviar`, `10-aprobar-tx` y `11-firmar-mensaje`).
 *
 * Este módulo es la ORQUESTACIÓN de esa ruta; **no duplica lógica**: M19 construye las previews,
 * M14 la cola y la marca en vuelo, M15 el plazo, M17 la entrega, M18 la ventana única, M11 la
 * firma y M7 la difusión y el contrato observable de la transacción.
 *
 * ORDEN EXACTO (`documento_tecnico.md` §3.1 reglas 1, 4, 6, 7 y 8)
 *   1. **Contexto y red activa**: `from` es SIEMPRE la cuenta de la sesión vigente del origen —la
 *      única que la dApp conoce (RNF-11)—; sin sesión se responde `4100` sin abrir ventana.
 *   2. **Antes de abrir la ventana** (`eth_sendTransaction`): `eth_estimateGas` (M7). Si falla o
 *      revierte, se responde `-32000` con el motivo accionable y **no** se encola ni se abre nada
 *      (RNF-25).
 *   3. **Preview** (M19) con saldo, gas estimado, comisiones y etiqueta local del destino.
 *   4. **Alta en la cola** (M14): RMW serializado, cardinalidad, cota de 64 KiB y
 *      `expiresAt = createdAt + 120 s` anclado a `createdAt`.
 *   5. **Plazo** (M15): `chrome.alarms` con `when: expiresAt` (nunca `setTimeout`).
 *   6. **Ventana única** (M18): `showOldestPending`, que abre `notification.html` con el correlador
 *      o re-renderiza la MISMA ventana, y purga el badge.
 *   7. **Espera de la decisión** (M14.b): la promesa se resuelve cuando CUALQUIERA de las tres vías
 *      cierra la entrada —`SIGN_RESPONSE`, la X de la ventana o el vencimiento—.
 *   8. **Efecto según el método**:
 *      - `eth_sendTransaction`: recalcula `nonce` (`getTransactionCount(account, 'pending')`) y
 *        `getFeeData()`, toma la marca `phase: 'signing'` de `truekeate_inflight_tx` (máximo 1
 *        transacción en vuelo por cuenta, §2.12), firma tipo 2 (M11), difunde (M7) y devuelve **el
 *        hash al difundir**; después pasa la marca a `'broadcast'` (libera la cuenta) y deja la
 *        traza `tx_sent`. Ante cualquier fallo la marca se LIBERA.
 *      - `personal_sign` y `eth_signTypedData_v4`: firma (`0x` + 130 hex) y devuelve la firma.
 *      - `wallet_switchEthereumChain`: si la red ya es la activa responde `null` **sin ventana**;
 *        si no está dada de alta, `4901`; al aprobar activa la red y emite `chainChanged` (RF-24).
 *      - `wallet_addEthereumChain`: al aprobar pide el permiso de host del `rpcUrl`, persiste la
 *        red con `isDefault: false` y **no la activa** (ADT-25 / P-22).
 *      - `wallet_revokePermissions`: tras la aprobación ejecuta la revocación de la tarea 3.11.
 *   9. **Rechazo o vencimiento**: `4001` con el literal de `diccionario_datos.md` §4.3 y la marca
 *      en vuelo liberada.
 *
 * CERO TEMPORIZADORES: el plazo lo posee M15 y el vencimiento de una entrada lo resuelve la alarma
 * del Service Worker.
 */

import type {
  Address,
  ApprovalMethod,
  ChainIdHex,
  Eip1193Error,
  PendingRequest,
  PersonalSignPreview,
  StoredNetwork,
  TxPreview,
  TypedDataDomain,
  TypedDataPreview,
} from '../../shared/types';
import { STORAGE_KEYS, readStorage, writeStorage } from '../state/schema';
import {
  chainNotRegisteredError,
  estimateGasFailedError,
  internalError,
  unauthorizedOriginError,
  userRejectedError,
} from '../rpc/errors';
import { getBalanceWei } from '../rpc/client';
import {
  broadcastSignedTransaction,
  estimateGasOrBlock,
  readContractCode,
  readEip1559Fees,
  readPendingNonce,
} from '../rpc/txContract';
import {
  signPersonalMessage,
  signTransaction,
  signTypedData,
  type TypedDataTypes,
} from '../crypto/sign';
import { emitProviderEvent } from '../events';
import { currentSessionFor, readSessions, revokeSession } from '../sessions';
import { forgetPendingConnectsForOrigin } from '../connections';
import {
  normalizeChainId,
  readNetworksFromSnapshot,
  resolveActiveNetwork,
} from '../networks/catalog';
import { showOldestPending } from './focus';
import {
  appendLogEntries,
  beginInflightTx,
  enqueueApprovalRequest,
  markInflightBroadcast,
  releaseInflightTx,
  type PendingRequestDraft as QueueDraft,
} from './queue';
import { armExpiryAlarm } from './timeout';
import { deliverApprovalResolution } from './ports';
import { waitForApprovalResolution } from './decisions';
import type { ApprovalDecision } from './decisions';
import {
  buildApprovalPreview,
  normalizeAddressOrNull,
  pickPersonalMessage,
  pickSigningAddress,
  pickTransactionRequest,
  pickTypedData,
  type ApprovalPreviewContext,
} from './preview';
import type { TrustedSenderContext } from '../security/senderGuard';

/** Alias local del tipo hexadecimal, para no importar el alias solo por un retorno. */
type Hex = `0x${string}`;

// ---------------------------------------------------------------------------
// Dependencias del despacho (todas con su valor real por defecto)
// ---------------------------------------------------------------------------

/**
 * Dependencias del despacho. La costura existe para que las pruebas del router no toquen ni la
 * cola, ni la red, ni las ventanas; en producción todas tienen su valor real (M7/M11/M14/M15/
 * M17/M18/M19/M26/M27).
 */
export interface ApprovalDispatchDeps {
  /** Alta en la cola (M14). */
  readonly enqueue: typeof enqueueApprovalRequest;
  /** Ventana única (M18). */
  readonly show: typeof showOldestPending;
  /** Plazo (M15). */
  readonly armExpiry: typeof armExpiryAlarm;
  /** Firma tipo 2 (M11). */
  readonly signTransaction: typeof signTransaction;
  /** Firma EIP-712 (M11). */
  readonly signTypedData: typeof signTypedData;
  /** `personal_sign` (M11). */
  readonly signPersonalMessage: typeof signPersonalMessage;
  /** Difusión con hash al instante (M7). */
  readonly broadcast: typeof broadcastSignedTransaction;
  /** `nonce` definitivo: `getTransactionCount(account, 'pending')` (M7). */
  readonly readNonce: typeof readPendingNonce;
  /** Comisiones EIP-1559 del nodo (M7/M11). */
  readonly readFees: typeof readEip1559Fees;
  /** Estimación BLOQUEANTE previa a la ventana (M7). */
  readonly estimate: typeof estimateGasOrBlock;
  /** `eth_getCode` de la red activa (M7), para `verifyingContractMismatch`. */
  readonly readCode: typeof readContractCode;
  /** Marca persistida de transacción en vuelo (M14). */
  readonly beginInflight: typeof beginInflightTx;
  readonly markBroadcast: typeof markInflightBroadcast;
  readonly releaseInflight: typeof releaseInflightTx;
  /** Entrega de la respuesta al solicitante (M17). */
  readonly deliver: typeof deliverApprovalResolution;
  /** Espera de la decisión (M14.b). */
  readonly wait: typeof waitForApprovalResolution;
  /** Traza del ciclo de la transacción (§3.6; el catálogo de 24 eventos se formaliza en H5). */
  readonly log: typeof appendLogEntries;
  /** Propagación de eventos a las pestañas (M27). */
  readonly emitEvent: typeof emitProviderEvent;
}

/** Dependencias reales: ÚNICO punto de acoplamiento con los módulos de H4. */
export const defaultApprovalDispatchDeps: ApprovalDispatchDeps = {
  enqueue: enqueueApprovalRequest,
  show: showOldestPending,
  armExpiry: armExpiryAlarm,
  signTransaction,
  signTypedData,
  signPersonalMessage,
  broadcast: broadcastSignedTransaction,
  readNonce: readPendingNonce,
  readFees: readEip1559Fees,
  estimate: estimateGasOrBlock,
  readCode: readContractCode,
  beginInflight: beginInflightTx,
  markBroadcast: markInflightBroadcast,
  releaseInflight: releaseInflightTx,
  deliver: deliverApprovalResolution,
  wait: waitForApprovalResolution,
  log: appendLogEntries,
  emitEvent: emitProviderEvent,
};

/** ¿Es un error EIP-1193 con `code` numérico? (RNF-06: nunca un error sin `code`). */
const isEip1193 = (value: unknown): value is Eip1193Error =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { code?: unknown }).code === 'number' &&
  typeof (value as { message?: unknown }).message === 'string';

/** `4001` del rechazo: literal único de §4.3 para «cancelada por el usuario». */
const rejectionError = (reason: string): Eip1193Error => userRejectedError({ reason });

// ---------------------------------------------------------------------------
// Contexto del origen: cuenta de la sesión y red activa
// ---------------------------------------------------------------------------

/** Contexto resuelto de una petición aprobable: cuenta autorizada y red activa. */
export interface ApprovalOriginContext {
  account: Address;
  chainId: ChainIdHex;
  network: StoredNetwork | null;
}

/**
 * Resuelve la cuenta que puede firmar y la red activa.
 *
 * Regla dura (RNF-11): la dApp **solo** conoce la cuenta de su sesión vigente, así que `from` es
 * SIEMPRE esa cuenta. Sin sesión no se abre ninguna ventana: `4100` (`unauthorizedOrigin`), el
 * código que §4.3 reserva a «esta dApp no tiene permiso para usar la cartera».
 */
export const resolveApprovalOrigin = async (
  context: TrustedSenderContext,
): Promise<ApprovalOriginContext> => {
  const sessions = await readSessions();
  const session = currentSessionFor(sessions, context.origin);
  if (session === null) {
    throw unauthorizedOriginError({ reason: 'no-session-for-approval', origin: context.origin });
  }
  const stored = await readStorage([STORAGE_KEYS.networks, STORAGE_KEYS.chainId]);
  const catalog = readNetworksFromSnapshot(stored);
  const network = resolveActiveNetwork(stored[STORAGE_KEYS.chainId], catalog);
  return { account: session.account, chainId: network.chainId, network };
};

/**
 * Comprueba que la dirección con la que se pide firmar es la de la sesión. Una petición para otra
 * cuenta no se firma jamás: se responde `4100` (la dApp no tiene autorizada esa cuenta).
 */
export const assertSessionAccount = (
  requested: Address | null,
  sessionAccount: Address,
  origin: string,
): Address => {
  if (requested === null) {
    return sessionAccount;
  }
  if (requested.toLowerCase() !== sessionAccount.toLowerCase()) {
    throw unauthorizedOriginError({
      reason: 'account-not-authorized',
      origin,
      requested,
      authorized: sessionAccount,
    });
  }
  return sessionAccount;
};

// ---------------------------------------------------------------------------
// Saldo y etiqueta local del destino
// ---------------------------------------------------------------------------

/** Saldo de una cuenta en wei; `null` si el nodo no responde (no se inventa un saldo). */
const safeBalance = async (address: Address): Promise<bigint | null> => {
  try {
    return BigInt(await getBalanceWei(address));
  } catch (error) {
    console.warn('[truekeate] no se pudo leer el saldo para la vista previa', error);
    return null;
  }
};

/**
 * Etiqueta LOCAL del destino (`truekeate_settings.accountLabels`): es la única fuente que puede
 * convertir `toLabel` en algo distinto de `"desconocido"` (§3.1). Sin etiqueta, M19 pone el literal
 * y el aviso «destino sin etiqueta».
 */
const localLabelFor = async (address: Address | null): Promise<string | null> => {
  if (address === null) {
    return null;
  }
  const stored = await readStorage([STORAGE_KEYS.settings]);
  const settings = stored[STORAGE_KEYS.settings];
  const record =
    typeof settings === 'object' && settings !== null && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const labels = record.accountLabels;
  if (typeof labels !== 'object' || labels === null || Array.isArray(labels)) {
    return null;
  }
  const value = (labels as Record<string, unknown>)[address];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

// ---------------------------------------------------------------------------
// Vista previa (M19)
// ---------------------------------------------------------------------------

/** Campos de presentación que acompañan al borrador de la solicitud. */
export interface PreviewFields {
  txPreview?: TxPreview;
  typedDataPreview?: TypedDataPreview;
  signMessagePreview?: PersonalSignPreview;
}

/**
 * Construye la vista previa que corresponde al método y la proyecta sobre el borrador.
 *
 * El `getCode` inyectado es el de la red ACTIVA (M7): es lo que permite afirmar que el contrato
 * verificador no está desplegado (`verifyingContractMismatch`, ADT-08 / D-K). Los métodos sin
 * preview propia (`wallet_switchEthereumChain`, `wallet_addEthereumChain`,
 * `wallet_revokePermissions`) devuelven `{}`.
 */
export const buildPreviewFields = async (
  method: ApprovalMethod,
  params: unknown[],
  context: ApprovalPreviewContext,
  deps: ApprovalDispatchDeps,
): Promise<PreviewFields> => {
  if (
    method !== 'eth_sendTransaction' &&
    method !== 'eth_signTypedData_v4' &&
    method !== 'personal_sign'
  ) {
    return {};
  }
  const preview = await buildApprovalPreview(method, params, context, {
    getCode: (address) => deps.readCode(address),
  });
  if (preview === null) {
    return {};
  }
  if (preview.kind === 'tx') {
    return { txPreview: preview.txPreview };
  }
  if (preview.kind === 'typedData') {
    return { typedDataPreview: preview.typedDataPreview };
  }
  return { signMessagePreview: preview.signMessagePreview };
};

// ---------------------------------------------------------------------------
// Métodos de red: parámetros y efectos
// ---------------------------------------------------------------------------

/** `params[0]` de un método de red, ya validado como objeto. */
export const asNetworkRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw internalError({ reason: 'malformed-network-params' });
  }
  return value as Record<string, unknown>;
};

/** Proyecta la entrada persistida de una red añadida (ADT-25/P-22: `isDefault: false`). */
export const storedNetworkFrom = (record: Record<string, unknown>): StoredNetwork => {
  const chainId = normalizeChainId(record.chainId);
  if (chainId === null) {
    throw chainNotRegisteredError({ reason: 'invalid-chain-id', chainId: record.chainId });
  }
  const currency =
    typeof record.nativeCurrency === 'object' && record.nativeCurrency !== null
      ? (record.nativeCurrency as Record<string, unknown>)
      : {};
  return {
    chainId,
    chainIdDecimal:
      typeof record.chainIdDecimal === 'number'
        ? record.chainIdDecimal
        : Number.parseInt(chainId, 16),
    name:
      typeof record.chainName === 'string' && record.chainName.length > 0
        ? record.chainName
        : chainId,
    rpcUrl:
      Array.isArray(record.rpcUrls) && typeof record.rpcUrls[0] === 'string'
        ? record.rpcUrls[0]
        : '',
    symbol: typeof currency.symbol === 'string' ? currency.symbol : 'ETH',
    decimals: typeof currency.decimals === 'number' ? currency.decimals : 18,
    isTestnet: false,
    // El alta NUNCA activa la red (ADT-25 / P-22).
    isDefault: false,
  };
};

/** Escribe el `chainId` activo y propaga `chainChanged` a TODAS las pestañas (RF-24). */
const applyChainSwitch = async (chainId: ChainIdHex, deps: ApprovalDispatchDeps): Promise<void> => {
  await writeStorage({ [STORAGE_KEYS.chainId]: chainId });
  await deps.emitEvent('chainChanged', chainId);
};

/** Superficie mínima de `chrome.permissions.request`. */
interface PermissionsLike {
  request(permissions: { origins?: string[] }): Promise<boolean>;
}

/**
 * Pide el permiso de host de `rpcUrl` para la red que se está añadiendo. La aprobación del usuario
 * en la ventana única ES el gesto válido que exige `chrome.permissions.request` (ACU-27 / D-G).
 * Si el permiso se deniega, la red NO se persiste y la llamada se resuelve con `4001`.
 */
export const requestHostPermission = async (rpcUrl: string): Promise<void> => {
  if (rpcUrl.length === 0) {
    return;
  }
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  const permissions: unknown =
    typeof chromeNs === 'object' && chromeNs !== null
      ? (chromeNs as { permissions?: unknown }).permissions
      : undefined;
  const request: unknown =
    typeof permissions === 'object' && permissions !== null
      ? (permissions as { request?: unknown }).request
      : undefined;
  if (typeof request !== 'function') {
    // Sin API de permisos (pruebas o contexto sin `chrome.permissions`): no hay nada que conceder.
    return;
  }
  let granted = false;
  try {
    granted =
      (await (request as PermissionsLike['request']).call(permissions, {
        origins: [`${new URL(rpcUrl).origin}/*`],
      })) === true;
  } catch {
    granted = false;
  }
  if (!granted) {
    throw userRejectedError({ reason: 'host-permission-denied', rpcUrl });
  }
};

// ---------------------------------------------------------------------------
// Efectos de la aprobación
// ---------------------------------------------------------------------------

/** Datos de la transacción normalizados desde los `params` originales. */
export const transactionFieldsOf = (params: unknown[]): Record<string, unknown> =>
  pickTransactionRequest(params);

/**
 * Firma, difunde y cierra el ciclo de una `eth_sendTransaction` aprobada.
 *
 * Recalcula `nonce` y comisiones al aprobar (H-10), toma la marca `phase: 'signing'` (§2.12) ANTES
 * de firmar, difunde y devuelve **el hash al difundir**. Cualquier fallo LIBERA la marca: una
 * cuenta bloqueada por un error de firma sería peor que el propio error.
 */
const executeTransaction = async (
  request: PendingRequest,
  gasLimit: string | null,
  deps: ApprovalDispatchDeps,
): Promise<Hex> => {
  const tx = transactionFieldsOf(request.params);
  const account = request.account;
  const nonce = await deps.readNonce(account);
  const feeData = await deps.readFees();

  const guard = await deps.beginInflight({
    account,
    approvalId: request.approvalId,
    nonce,
  });
  if (!guard.ok) {
    // La cuenta ya tenía una marca `signing` vigente: NO se firma nada (§2.12 regla 5).
    throw guard.error;
  }

  try {
    const signed = await deps.signTransaction({
      from: account,
      to: normalizeAddressOrNull(tx.to),
      value: tx.value,
      data: tx.data,
      gasLimit: tx.gas ?? gasLimit ?? undefined,
      nonce,
      chainId: request.chainId,
      activeChainId: request.chainId,
      feeData: {
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      },
      ...(tx.gasPrice === undefined ? {} : { gasPrice: tx.gasPrice }),
    });
    const hash = await deps.broadcast(signed.rawTransaction);
    // La marca pasa a `broadcast`: el nonce ya está consumido y la cuenta se libera (§2.12 regla 2).
    await deps.markBroadcast({ account, txHash: hash, nonce });
    try {
      await deps.log([
        {
          event: 'tx_sent',
          category: 'tx',
          level: 'info',
          message: 'Transacción difundida; pendiente de confirmación.',
          // La traza NO lleva el payload: solo el hash y el método (§3.4 regla 4, RNF-09).
          data: { state: 'pending', txHash: hash },
          method: 'eth_sendTransaction',
          txHash: hash,
          origin: request.origin,
        },
      ]);
    } catch (logError) {
      console.warn('[truekeate] no se pudo dejar la traza tx_sent', logError);
    }
    return hash;
  } catch (error) {
    // Nunca se deja la cuenta bloqueada por un fallo de firma o de difusión.
    try {
      await deps.releaseInflight(account);
    } catch (releaseError) {
      console.warn('[truekeate] no se pudo liberar la marca en vuelo', releaseError);
    }
    throw error;
  }
};

/** Firma EIP-712 aprobada: devuelve `0x` + 130 hex. */
const executeTypedDataSignature = async (
  request: PendingRequest,
  deps: ApprovalDispatchDeps,
): Promise<string> => {
  const { typedData } = pickTypedData(request.params);
  if (typedData === null) {
    throw internalError({ reason: 'invalid-typed-data-params' });
  }
  const domain =
    typeof typedData.domain === 'object' && typedData.domain !== null
      ? (typedData.domain as TypedDataDomain)
      : {};
  const types =
    typeof typedData.types === 'object' && typedData.types !== null
      ? (typedData.types as TypedDataTypes)
      : {};
  const message =
    typeof typedData.message === 'object' && typedData.message !== null
      ? (typedData.message as Record<string, unknown>)
      : {};
  const signed = await deps.signTypedData({
    from: request.account,
    domain,
    types,
    message,
    primaryType: typeof typedData.primaryType === 'string' ? typedData.primaryType : null,
  });
  return signed.signature;
};

/** `personal_sign` aprobado: devuelve `0x` + 130 hex con el prefijo EIP-191. */
const executePersonalSignature = async (
  request: PendingRequest,
  deps: ApprovalDispatchDeps,
): Promise<string> => {
  const message = pickPersonalMessage(request.params);
  const signed = await deps.signPersonalMessage({ from: request.account, message });
  return signed.signature;
};

// ---------------------------------------------------------------------------
// Ciclo común: alta, plazo, ventana y espera de la decisión
// ---------------------------------------------------------------------------

/** Desenlace del ciclo de aprobación. */
type ApprovalCycleOutcome =
  | { ok: true; approved: true; request: PendingRequest }
  | { ok: true; approved: false; error: Eip1193Error }
  | { ok: false; approved: false; error: Eip1193Error };

/**
 * Ejecuta el ciclo COMÚN a los 6 métodos aprobables: alta en la cola, armado del plazo, apertura
 * de la ventana única y espera de la decisión.
 *
 * La entrega del `4001` al solicitante en el rechazo la hace la vía que RESUELVE la entrada
 * (`SIGN_RESPONSE` en M2, la X en M18 o la alarma en M15), de modo que la respuesta viaja una sola
 * vez y por el canal que ya existe (M17).
 */
export const runApprovalCycle = async (
  draft: QueueDraft,
  deps: ApprovalDispatchDeps,
  now: number,
): Promise<ApprovalCycleOutcome> => {
  const enqueued = await deps.enqueue(draft, { now });
  if (!enqueued.ok) {
    // Cardinalidad, cota de 64 KiB o cuota: respuesta inmediata SIN abrir ventana.
    return { ok: false, approved: false, error: enqueued.error };
  }
  const request = enqueued.request;
  deps.armExpiry(request.approvalId, request.expiresAt);

  const waiter = deps.wait(request.approvalId);
  try {
    // La ventana única es de M18: abre la primera, re-renderiza la MISMA o la cierra si ya no
    // quedan `pending`. Se espera a que la pasada termine antes de considerar la solicitud mostrada.
    await deps.show({ now });
    const decision: ApprovalDecision = await waiter.decision;
    if (!decision.ok) {
      return { ok: true, approved: false, error: rejectionError('approval-abandoned') };
    }
    if (decision.resolution.status === 'approved') {
      return { ok: true, approved: true, request: decision.resolution.request };
    }
    return {
      ok: true,
      approved: false,
      error: rejectionError(
        decision.resolution.status === 'expired' ? 'approval-expired' : 'approval-rejected',
      ),
    };
  } finally {
    waiter.cancel();
  }
};

// ---------------------------------------------------------------------------
// Despacho público
// ---------------------------------------------------------------------------

/** Desenlace del despacho de un método aprobable: `result` o error EIP-1193 con `code`. */
export type ApprovalDispatchOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: Eip1193Error };

/** Opciones del despacho. */
export interface DispatchApprovalOptions {
  method: ApprovalMethod;
  params: unknown[];
  context: TrustedSenderContext;
  deps?: ApprovalDispatchDeps;
  now?: number;
}

/**
 * Despacha un método aprobable por la ruta completa: preview → cola → ventana → decisión → efecto.
 * Devuelve el `result` que recibe la dApp o el error EIP-1193 con `code`. Nunca lanza.
 */
export const dispatchApproval = async (
  options: DispatchApprovalOptions,
): Promise<ApprovalDispatchOutcome> => {
  const deps = options.deps ?? defaultApprovalDispatchDeps;
  const { method, params, context } = options;
  const now = options.now ?? Date.now();

  try {
    const originContext = await resolveApprovalOrigin(context);
    const account = originContext.account;
    const chainId = originContext.chainId;

    // --- Métodos de red: atajos SIN ventana cuando la red ya es la activa (§4.3) --------------
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
      const networkRecord = asNetworkRecord(params[0]);
      const requested = normalizeChainId(networkRecord.chainId);
      if (requested === null) {
        throw chainNotRegisteredError({
          reason: 'invalid-chain-id',
          chainId: networkRecord.chainId,
        });
      }
      const stored = await readStorage([STORAGE_KEYS.networks]);
      const catalog = readNetworksFromSnapshot(stored);
      if (method === 'wallet_switchEthereumChain' && requested === chainId) {
        // Ya es la red activa: `null` SIN crear `PendingRequest` ni abrir ventana (DEC-29/P-19).
        return { ok: true, result: null };
      }
      if (method === 'wallet_switchEthereumChain' && catalog[requested] === undefined) {
        // Cambiar a una red que no está dada de alta: `4901`, sin ventana.
        throw chainNotRegisteredError({ reason: 'chain-not-registered', chainId: requested });
      }
      const cycle = await runApprovalCycle(
        {
          method,
          params,
          origin: context.origin,
          tabId: context.tabId,
          frameId: context.frameId,
          account,
          chainId,
        },
        deps,
        now,
      );
      if (!cycle.ok || !cycle.approved) {
        return { ok: false, error: cycle.error };
      }
      if (method === 'wallet_switchEthereumChain') {
        await applyChainSwitch(requested, deps);
        return { ok: true, result: null };
      }
      // `wallet_addEthereumChain`: solo AÑADE (nunca activa) y pide el permiso de host.
      const network = storedNetworkFrom(networkRecord);
      await requestHostPermission(network.rpcUrl);
      const current = readNetworksFromSnapshot(await readStorage([STORAGE_KEYS.networks]));
      await writeStorage({
        [STORAGE_KEYS.networks]: { ...current, [network.chainId]: network },
      });
      return { ok: true, result: null };
    }

    // --- `from`: SIEMPRE la cuenta de la sesión vigente (RNF-11) ------------------------------
    const transaction = method === 'eth_sendTransaction' ? transactionFieldsOf(params) : {};
    const requestedFrom =
      method === 'eth_sendTransaction'
        ? normalizeAddressOrNull(transaction.from)
        : pickSigningAddress(params);
    const from = assertSessionAccount(requestedFrom, account, context.origin);

    // --- Bloqueo previo: `estimateGas` ANTES de abrir la ventana (RNF-25) ---------------------
    let gasLimit: string | null = null;
    let estimationFailed: { reason: string } | null = null;
    if (method === 'eth_sendTransaction') {
      const outcome = await deps.estimate({
        from,
        ...(transaction.to === undefined ? {} : { to: transaction.to }),
        ...(transaction.value === undefined ? {} : { value: transaction.value }),
        ...(transaction.data === undefined ? {} : { data: transaction.data }),
      });
      if (!outcome.ok) {
        return { ok: false, error: outcome.error };
      }
      gasLimit = outcome.gasLimit;
    }

    // --- Vista previa (M19) -------------------------------------------------------------------
    const balanceWei = await safeBalance(from);
    const feeData = await deps.readFees().catch((error: unknown) => {
      console.warn('[truekeate] no se pudieron leer las comisiones para la vista previa', error);
      return null;
    });
    const dest = normalizeAddressOrNull(transaction.to);
    const previewContext: ApprovalPreviewContext = {
      from,
      chainId,
      ...(balanceWei === null ? {} : { balanceWei }),
      ...(gasLimit === null ? {} : { gasLimit }),
      ...(feeData === null
        ? {}
        : {
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          }),
      estimationFailed,
      toLabel: method === 'eth_sendTransaction' ? await localLabelFor(dest) : null,
    };
    const previewFields = await buildPreviewFields(method, params, previewContext, deps);

    const cycle = await runApprovalCycle(
      {
        method,
        params,
        origin: context.origin,
        tabId: context.tabId,
        frameId: context.frameId,
        account: from,
        chainId,
        ...previewFields,
      },
      deps,
      now,
    );
    if (!cycle.ok || !cycle.approved) {
      return { ok: false, error: cycle.error };
    }

    // --- Efecto de la aprobación -------------------------------------------------------------
    if (method === 'eth_sendTransaction') {
      return { ok: true, result: await executeTransaction(cycle.request, gasLimit, deps) };
    }
    if (method === 'eth_signTypedData_v4') {
      return { ok: true, result: await executeTypedDataSignature(cycle.request, deps) };
    }
    if (method === 'personal_sign') {
      return { ok: true, result: await executePersonalSignature(cycle.request, deps) };
    }
    // `wallet_revokePermissions` desde la dApp: tras la aprobación se aplica EXACTAMENTE la
    // revocación de la tarea 3.11 (M26/M27): borrar la sesión, descartar la conexión pendiente y
    // emitir `accountsChanged []` a las pestañas del origen. No se duplica ninguna regla.
    const revoked = await revokeSession(context.origin, { tabId: context.tabId });
    if (revoked === null) {
      throw internalError({ reason: 'invalid-revoke-origin', origin: context.origin });
    }
    forgetPendingConnectsForOrigin(revoked.origin);
    if (revoked.revoked) {
      await deps.emitEvent(
        'accountsChanged',
        [],
        revoked.tabIds.length > 0 ? { tabIds: revoked.tabIds } : {},
      );
    }
    return { ok: true, result: { origin: revoked.origin, revoked: revoked.revoked } };
  } catch (error) {
    if (isEip1193(error)) {
      return { ok: false, error };
    }
    console.warn('[truekeate] fallo inesperado en el despacho de una aprobación', error);
    return { ok: false, error: internalError({ reason: 'approval-dispatch-failed', method }) };
  }
};

/**
 * Clasifica el fallo de una estimación con el literal `-32000` de §4.3. Se exporta para que las
 * pruebas del router comprueben el mensaje sin tocar la red (M7 ya hace la clasificación real).
 */
export const estimationFailureOf = (error: unknown): Eip1193Error => {
  const motivo = error instanceof Error ? error.message : String(error);
  return estimateGasFailedError(motivo);
};
