/**
 * M50 — `src/notification/App.tsx`
 * Ventana **global única** de decisión (`notification.html`, 420 × 640, P-21).
 *
 * Fuentes: `plan_desarrollo.md` §3.4.5 (tareas 4.4, 4.7, 4.11, 4.12, 4.13), `documento_tecnico.md`
 * §3.1 (ciclo de aprobación), §3.4 (firma y previews), §5.1.1 (métodos internos) y §5.2 (ventanas
 * y componentes); `identidad_visual.md` §5.1 y §5.2.
 *
 * QUÉ HACE ESTA VENTANA Y QUÉ NO
 * - **Decide, no firma** (`CA-RF-35`): solo envía `SIGN_RESPONSE { approvalId, success }` —el
 *   mensaje que ya publica `src/shared/protocol.ts` y que `senderGuard` admite ÚNICAMENTE desde
 *   `notification.html`—. La firma, la difusión y la escritura de la cola son del Service Worker.
 * - Muestra **una** solicitud a la vez: la `pending` de menor `createdAt` que le entrega el SW,
 *   con el **contador de pendientes**. Al resolverse, la MISMA ventana pasa a la siguiente o el SW
 *   la cierra (`windows.remove`); aquí no se abre ninguna ventana nueva.
 * - Mantiene **siempre visibles** el origen de la dApp y su favicon, la insignia de riesgo, el
 *   contador y el resumen (cuenta, destino etiquetado, valor, red y comisión estimada).
 * - Ofrece **solo** «Aprobar» y «Rechazar»; `Escape` rechaza y cerrar con la X equivale a rechazo
 *   (`4001`, literal de `diccionario_datos.md` §4.3).
 * - **RNF-14**: no lee ni escribe el almacén de la extensión (prohibido en `src/notification`), no
 *   importa `ethers` y no ejecuta criptografía alguna.
 *
 * ENTREGA DE LA SOLICITUD (contrato consumido, NO inventado)
 * - El **correlador** llega en la URL (`notification.html?approvalId=…&origin=…`), igual que M18
 *   publica `requestId` en `connect.html` (`src/background/connections.ts`).
 * - El **cuerpo** de la solicitud se pide al Service Worker por los dos canales que YA existen:
 *   (a) el puerto de larga vida `truekeate_approval` (`APPROVAL_PORT_NAME`) con el mensaje
 *   publicado `RESUME { approvalId }` de §3.1/tarea 4.3, cuya respuesta procede «del registro
 *   persistido»; y (b) `chrome.runtime.onMessage`, por si el SW empuja la siguiente solicitud a la
 *   ventana ya abierta (§2.14: «la misma ventana pasa a renderizar la siguiente»).
 * - Ninguno de los dos está aún implementado en el SW (M17/M18 en curso): mientras no respondan,
 *   la ventana **declara el hueco** con {@link APPROVAL_GAP} y deja «Aprobar» deshabilitado, en vez
 *   de inventar datos. No existe todavía ningún método interno `wallet_getPendingRequest` en la
 *   unión cerrada de §5.1.1: si el otro agente lo publica, se consume aquí sin cambiar la UI.
 * - El **contexto de presentación** (etiquetas de cuenta, nombre y símbolo de la red activa) sí
 *   tiene método publicado y se lee con `wallet_getState` (§5.1.1) a través de M39.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type {
  ApprovalMethod,
  ChainIdHex,
  Eip1193Error,
  PendingRequest,
  TypedDataPreview,
  TxPreview,
} from '../shared/types';
import type { SignResponseMessage } from '../shared/protocol';
import { APPROVAL_PORT_NAME, DEFAULT_CHAIN_SYMBOL } from '../shared/constants';
import { formatTimestamp, pluralize } from '../shared/format';
import { ACERCA_DE_BOTON, NOMBRE_PRODUCTO, yaFirmoAntes } from '../shared/i18n';
import { readLogSignatures, firstSignatureState } from './firstSignature';
import { StatusMessage } from '../popup/components/StatusMessage';
import { AboutDialog } from '../popup/components/AboutDialog';
import { getRuntimeChannel } from '../popup/runtimeChannel';
import { isEip1193Error, popupError, popupErrorOf, type PopupError } from '../popup/popupErrors';
import { readSnapshot, type WalletSnapshot } from '../popup/walletState';
import { FirstSignatureNotice } from './FirstSignatureNotice';
import { PersonalSignPanel } from './PersonalSignPanel';
import { RiskBadge, RiskWarnings, type RiskWarning } from './RiskWarnings';
import { TxPreviewPanel } from './TxPreviewPanel';
import { TypedDataPanel } from './TypedDataPanel';
import '../styles/tokens.css';
import '../styles/base.css';

/** Ruta pública del isologo de 96 px. */
const MARK_SRC = 'brand/truekeate-mark-96.png';

/** Máximo de 256 bits: `approve(spender, 2^256-1)` es la allowance ILIMITADA (H-11b). */
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Literal de §4.3 para el rechazo del usuario: es el error con el que se resuelve la solicitud
 * cuando se pulsa «Rechazar», se pulsa `Escape` o se cierra la ventana.
 */
export const USER_REJECTED_ERROR: Eip1193Error = {
  code: 4001,
  message: 'Operación cancelada por el usuario.',
};

/**
 * Hueco declarado del contrato de entrega: la ventana se ha abierto y el Service Worker todavía no
 * publica el canal por el que entrega la solicitud `pending` (M17/M18 en curso), así que no hay
 * datos que pintar. Se declara en vez de inventarlos y «Aprobar» queda deshabilitado.
 */
export const APPROVAL_GAP =
  'No hay ninguna solicitud que mostrar: el Service Worker todavía no entrega la solicitud ' +
  'pendiente a esta ventana. La ventana pide el registro persistido por el puerto de aprobación ' +
  'con el mensaje RESUME y escucha la entrega por el canal del runtime; hasta que uno de los dos ' +
  'responda, esta ventana no lee el almacén de la extensión (RNF-14) y «Aprobar» queda ' +
  'deshabilitado.';

/** Plazo de espera de la entrega por el puerto antes de declarar el hueco. */
export const DELIVERY_TIMEOUT_MS = 3_000;

/** Margen que se concede al Service Worker para re-renderizar o cerrar tras una decisión (P-21). */
export const NEXT_REQUEST_GRACE_MS = 1_500;

/** Etiquetas en español del tipo de solicitud (la insignia del encabezado, §5.2). */
export const METHOD_LABELS: Readonly<Record<ApprovalMethod, string>> = {
  eth_sendTransaction: 'Envío de transacción',
  eth_signTypedData_v4: 'Firma de datos EIP-712',
  personal_sign: 'Firma de mensaje',
  wallet_switchEthereumChain: 'Cambio de red',
  wallet_addEthereumChain: 'Alta de red',
  wallet_revokePermissions: 'Revocación de permisos',
};

/** Los 6 métodos aprobables del contrato (`ApprovalMethod`, §2.5.2). */
const APPROVAL_METHODS: readonly ApprovalMethod[] = [
  'eth_sendTransaction',
  'eth_signTypedData_v4',
  'personal_sign',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_revokePermissions',
];

/** Arranque que la ventana lee de su propia URL (M18 publica el correlador, como en connect.html). */
export interface ApprovalBootstrap {
  /** `approvalId` de la solicitud a resolver; `null` si no viaja en la URL. */
  approvalId: string | null;
  /** Origen que acompaña al identificador; `null` si no viaja en la URL. */
  origin: string | null;
}

/** Lee el arranque de la ventana de la URL. Nunca lanza: sin parámetros deja los dos a `null`. */
export const readApprovalBootstrap = (search: string): ApprovalBootstrap => {
  const params = new URLSearchParams(search);
  const approvalId = params.get('approvalId');
  const origin = params.get('origin');
  return {
    approvalId: approvalId === null || approvalId.trim().length === 0 ? null : approvalId.trim(),
    origin: origin === null || origin.trim().length === 0 ? null : origin.trim(),
  };
};

/** Entrega de una solicitud desde el Service Worker: la solicitud, el contador y el favicon. */
export interface ApprovalDelivery {
  request: PendingRequest;
  /** Solicitudes `pending` en la cola en este momento (el contador visible, §2.14). */
  pendingCount: number;
  /** Favicon ya saneado por el SW (`chrome-extension://…`); `null` si no se entregó. */
  favicon: string | null;
}

/** Resultado de pedir la solicitud pendiente: discriminado, nunca lanza. */
export type DeliveryResult =
  | { ok: true; delivery: ApprovalDelivery }
  | { ok: false; error: PopupError };

/** Resultado de entregar la decisión al Service Worker. */
type SendResult = { ok: true } | { ok: false; error: PopupError };

/** Contexto de presentación que la ventana sí puede leer con un método publicado. */
export interface WindowContext {
  /** Etiqueta de cada cuenta conocida, por dirección en minúsculas. */
  accountLabels: ReadonlyMap<string, string>;
  /** Nombre de la red activa (`Anvil Local` en la red de pruebas). */
  networkName: string | null;
  /** Símbolo de la moneda nativa de la red activa. */
  symbol: string;
  /** `chainId` de la red activa. */
  chainId: ChainIdHex | null;
}

/** Contexto vacío: la ventana sigue siendo operable sin `wallet_getState` (solo pierde etiquetas). */
const EMPTY_CONTEXT: WindowContext = {
  accountLabels: new Map(),
  networkName: null,
  symbol: DEFAULT_CHAIN_SYMBOL,
  chainId: null,
};

/** Resultado de la decisión del usuario, para el aviso de la propia ventana. */
export type Outcome = 'none' | 'approved' | 'rejected' | 'failed';

/** Etiquetas del resultado de la decisión (RF-34). */
export const OUTCOME_LABELS: Readonly<Record<Exclude<Outcome, 'none'>, string>> = {
  approved: 'Solicitud aprobada. La decisión ya está en el Service Worker.',
  rejected: 'Solicitud rechazada. La dApp recibirá el error 4001.',
  failed: 'No se pudo entregar la decisión al Service Worker.',
};

/** Extrae el detalle legible de un fallo de transporte, sin inventar códigos. */
const detailOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** Error de hueco declarado: `-32603` del catálogo, con el motivo exacto en el detalle. */
const gapError = (reason: string): PopupError =>
  popupErrorOf('internalError', {}, { reason: 'approval-delivery', detail: reason });

/** Canal del runtime, o `null` cuando la API no está disponible (pruebas, página suelta). */
const runtimeApi = (): typeof chrome.runtime | null => {
  if (typeof chrome === 'undefined') {
    return null;
  }
  const runtime: unknown = chrome.runtime;
  if (typeof runtime !== 'object' || runtime === null) {
    return null;
  }
  return chrome.runtime;
};

/** ¿El valor es uno de los 6 métodos aprobables del contrato? */
export const isApprovalMethod = (value: unknown): value is ApprovalMethod =>
  typeof value === 'string' && (APPROVAL_METHODS as readonly string[]).includes(value);

/**
 * Valida la forma de una `PendingRequest` recibida del Service Worker (§2.8).
 *
 * Es un guard estricto: solo acepta objetos con el `approvalId`, el método aprobable, el origen,
 * la cuenta y la red, además del ancla del plazo. Un mensaje del protocolo que no cumpla esta
 * forma (p. ej. un `TRUEKEATE_EVENT`) no se confunde con una entrega.
 */
export const isPendingRequest = (value: unknown): value is PendingRequest => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.approvalId === 'string' &&
    candidate.approvalId.length > 0 &&
    isApprovalMethod(candidate.method) &&
    typeof candidate.origin === 'string' &&
    typeof candidate.account === 'string' &&
    typeof candidate.chainId === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.expiresAt === 'number'
  );
};

/** Sanea el favicon entregado: solo recursos del propio paquete (ADT-22, sin `data:` ni remotos). */
export const sanitizeFavicon = (raw: unknown): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.trim();
  return value.startsWith('chrome-extension://') ? value : null;
};

/**
 * Resuelve el favicon visible: el que entregue el SW (ya saneado) o, en su defecto, el servicio
 * `_favicon` del navegador sobre el origen de la dApp (permiso `favicon` del manifest). Nunca se
 * carga un recurso remoto ni un `data:` URI.
 */
export const faviconForOrigin = (origin: string | null, delivered: string | null): string | null => {
  if (delivered !== null) {
    return delivered;
  }
  if (origin === null || !/^https?:\/\//i.test(origin)) {
    return null;
  }
  const runtime = runtimeApi();
  if (runtime === null || typeof runtime.getURL !== 'function') {
    return null;
  }
  try {
    return runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(origin)}&size=32`);
  } catch {
    return null;
  }
};

/**
 * Completa una vista parcial de solicitud con los valores por defecto del contrato (§2.8).
 *
 * La vista que responde al `RESUME` del puerto (`ResumeResult` de `src/background/approvals/ports.ts`)
 * trae solo el subconjunto de presentación —`approvalId`, `method`, `origin`, `account`, `chainId`,
 * `createdAt`, `expiresAt` y `pendingCount`—, sin `status` ni previews: aquí se normaliza a
 * `PendingRequest` para que la ventana la pinte y deje constancia, sin inventar datos, de que el
 * Service Worker no adjuntó la vista previa.
 */
const normalizeRequest = (value: PendingRequest | Record<string, unknown>): PendingRequest => {
  const candidate = value as Record<string, unknown>;
  return {
    approvalId: String(candidate.approvalId),
    method: candidate.method as ApprovalMethod,
    params: Array.isArray(candidate.params) ? candidate.params : [],
    origin: String(candidate.origin),
    tabId: typeof candidate.tabId === 'number' ? candidate.tabId : null,
    frameId: typeof candidate.frameId === 'number' ? candidate.frameId : 0,
    account: candidate.account as PendingRequest['account'],
    chainId: candidate.chainId as PendingRequest['chainId'],
    ...(typeof candidate.txPreview === 'object' && candidate.txPreview !== null
      ? { txPreview: candidate.txPreview as PendingRequest['txPreview'] }
      : {}),
    ...(typeof candidate.typedDataPreview === 'object' && candidate.typedDataPreview !== null
      ? { typedDataPreview: candidate.typedDataPreview as PendingRequest['typedDataPreview'] }
      : {}),
    ...(typeof candidate.signMessagePreview === 'object' && candidate.signMessagePreview !== null
      ? { signMessagePreview: candidate.signMessagePreview as PendingRequest['signMessagePreview'] }
      : {}),
    createdAt: Number(candidate.createdAt),
    expiresAt: Number(candidate.expiresAt),
    status:
      candidate.status === 'approved' ||
      candidate.status === 'rejected' ||
      candidate.status === 'expired'
        ? candidate.status
        : 'pending',
  };
};

/** Cuenta de pendientes declarada por el SW, si la trae (`pendingCount`, §2.14). */
const pendingCountOf = (value: Record<string, unknown>): number | null => {
  const count = value.pendingCount;
  return typeof count === 'number' && count >= 1 ? Math.trunc(count) : null;
};

/**
 * Interpreta un mensaje del SW como entrega de solicitud; `null` si no lo es.
 *
 * Admite las DOS formas que el contrato publicado puede producir: la solicitud completa
 * (`PendingRequest`, con previews) o la vista del `RESUME` envuelta en `{ result }` o `{ request }`,
 * que la ventana normaliza. Un mensaje del protocolo que no cumpla la forma de solicitud no se
 * confunde con una entrega.
 */
export const deliveryFrom = (value: unknown): ApprovalDelivery | null => {
  if (isPendingRequest(value)) {
    return { request: normalizeRequest(value), pendingCount: 1, favicon: null };
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const envelope = value as Record<string, unknown>;
  const inner = envelope.result ?? envelope.request ?? envelope.pendingRequest ?? envelope.pending;
  if (isPendingRequest(inner)) {
    const request = normalizeRequest(inner);
    const direct = pendingCountOf(envelope);
    const nested = pendingCountOf(inner as unknown as Record<string, unknown>);
    return {
      request,
      pendingCount: direct ?? nested ?? 1,
      favicon: sanitizeFavicon(envelope.favicon),
    };
  }
  if (typeof inner === 'object' && inner !== null) {
    const nestedDelivery = deliveryFrom(inner);
    if (nestedDelivery !== null) {
      const direct = pendingCountOf(envelope);
      return direct === null ? nestedDelivery : { ...nestedDelivery, pendingCount: direct };
    }
  }
  return null;
};

/** Error EIP-1193 dentro de un mensaje del SW, si lo trae. */
const errorFrom = (value: unknown): PopupError | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const envelope = value as Record<string, unknown>;
  return isEip1193Error(envelope.error) ? popupError(envelope.error) : null;
};

/**
 * Pide al Service Worker la solicitud `pending` que debe resolver esta ventana.
 *
 * Usa el puerto de larga vida `truekeate_approval` y el mensaje `RESUME` publicados en §3.1 y en
 * `src/shared/constants.ts`: la respuesta procede del registro persistido, de modo que la ventana
 * reconstruye su estado tras una recarga o una suspensión del SW sin leer el almacén (RNF-14).
 * `approvalId` nulo pide la `pending` más antigua (FIFO, §2.14).
 */
export const requestPendingApproval = async (
  approvalId: string | null,
): Promise<DeliveryResult> => {
  const runtime = runtimeApi();
  if (runtime === null || typeof runtime.connect !== 'function') {
    return { ok: false, error: gapError('no hay canal con el Service Worker') };
  }
  let port: chrome.runtime.Port;
  try {
    port = runtime.connect({ name: APPROVAL_PORT_NAME });
  } catch (cause) {
    return { ok: false, error: gapError(detailOf(cause)) };
  }
  return new Promise<DeliveryResult>((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (result: DeliveryResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== 0) {
        window.clearTimeout(timer);
      }
      try {
        port.disconnect();
      } catch {
        // El puerto ya estaba cerrado: nada que soltar.
      }
      resolve(result);
    };
    timer = window.setTimeout(() => {
      finish({ ok: false, error: gapError('el Service Worker no entregó la solicitud') });
    }, DELIVERY_TIMEOUT_MS);
    port.onMessage.addListener((message: unknown) => {
      const delivery = deliveryFrom(message);
      if (delivery !== null) {
        finish({ ok: true, delivery });
        return;
      }
      const error = errorFrom(message);
      if (error !== null) {
        finish({ ok: false, error });
      }
    });
    port.onDisconnect.addListener(() => {
      finish({ ok: false, error: gapError('el puerto se cerró sin entregar la solicitud') });
    });
    try {
      port.postMessage({ type: 'RESUME', approvalId: approvalId ?? '' });
    } catch (cause) {
      finish({ ok: false, error: gapError(detailOf(cause)) });
    }
  });
};

/**
 * Escucha la entrega de la SIGUIENTE solicitud por el canal del runtime (§2.14: la misma ventana
 * se re-renderiza). Devuelve la función para dejar de escuchar.
 */
export const subscribeToApprovalPush = (
  listener: (delivery: ApprovalDelivery) => void,
): (() => void) => {
  const runtime = runtimeApi();
  if (runtime === null || typeof runtime.onMessage?.addListener !== 'function') {
    return () => {
      // Sin canal no hay nada que desuscribir.
    };
  }
  const handler = (message: unknown): undefined => {
    const delivery = deliveryFrom(message);
    if (delivery !== null) {
      listener(delivery);
    }
    return undefined;
  };
  runtime.onMessage.addListener(handler);
  return () => {
    runtime.onMessage.removeListener(handler);
  };
};

/** Entrega `SIGN_RESPONSE` por el canal del runtime (§3.1). */
const deliverSignResponse = async (message: SignResponseMessage): Promise<SendResult> => {
  const channel = getRuntimeChannel();
  if (channel === null) {
    return {
      ok: false,
      error: popupErrorOf('internalError', {}, { reason: 'no-runtime-channel', approvalId: message.approvalId }),
    };
  }
  try {
    const response: unknown = await channel(message);
    const error = errorFrom(response);
    return error === null ? { ok: true } : { ok: false, error };
  } catch (cause) {
    return { ok: false, error: popupErrorOf('internalError', {}, { reason: 'transport', detail: detailOf(cause) }) };
  }
};

/** Convierte a `bigint` una cantidad decodificada (bigint, decimal o hexadecimal); `null` si no. */
const weiFromDecoded = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === 'string') {
    try {
      // `BigInt` acepta tanto el decimal que produce M66 como un `0x…` hexadecimal.
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }
  return null;
};

/** ¿La llamada es `approve`/`increaseAllowance` con la allowance MÁXIMA (H-11b)? */
const isUnlimitedAllowanceCall = (preview: TxPreview): boolean => {
  const name = preview.functionName ?? '';
  if (!name.includes('approve') && !name.includes('increaseAllowance')) {
    return false;
  }
  const args = preview.decodedArgs ?? {};
  return Object.values(args).some((value) => {
    const wei = weiFromDecoded(value);
    return wei !== null && wei >= MAX_UINT256;
  });
};

/** ¿La llamada es `setApprovalForAll(operator, true)` (H-11b)? */
const isApprovalForAllCall = (preview: TxPreview): boolean => {
  const name = preview.functionName ?? '';
  if (!name.startsWith('setApprovalForAll')) {
    return false;
  }
  const args = preview.decodedArgs ?? {};
  return Object.values(args).some((value) => value === true);
};

/** ¿Algún aviso ya contiene ese texto (para no duplicar el mismo aviso)? */
const alreadyCovered = (warnings: readonly RiskWarning[], text: string): boolean => {
  const needle = text.trim().toLowerCase();
  if (needle.length === 0) {
    return true;
  }
  return warnings.some(
    (warning) =>
      warning.title.toLowerCase().includes(needle) ||
      warning.detail.toLowerCase().includes(needle) ||
      needle.includes(warning.title.toLowerCase()),
  );
};

/** Añade un aviso destacado si ningún aviso previo cubre ya ese texto. */
const pushHighlight = (
  warnings: RiskWarning[],
  warning: RiskWarning,
  swText: string | null,
): void => {
  if (warnings.some((existing) => existing.id === warning.id)) {
    return;
  }
  const detail = swText !== null && swText.trim().length > 0 ? swText : warning.detail;
  if (alreadyCovered(warnings, detail) && alreadyCovered(warnings, warning.title)) {
    return;
  }
  warnings.push({ ...warning, detail });
};

/** Aviso bloqueante por defecto (exige marcarlo para aprobar). */
const blockingWarning = (id: string, title: string, detail: string): RiskWarning => ({
  id,
  severity: 'blocking',
  title,
  detail,
});

/**
 * Deriva los avisos de riesgo de la solicitud (M52 los pinta y M50 los exige).
 *
 * Fuentes, en este orden: los literales en español que ya calcula el Service Worker
 * (`TxPreview.riskWarnings`, `TypedDataPreview.domainChainMismatch` y
 * `verifyingContractMismatch`, `PersonalSignPreview.isHexPayload`) y, como defensa en profundidad,
 * la estructura del calldata decodificado por la tabla local cerrada de M66. **Bloqueantes**:
 * llamada a contrato no reconocida (riesgo R-05), `verifyingContractMismatch`, saldo insuficiente
 * y estimación de gas fallida. **Destacados**: allowance ilimitada, `setApprovalForAll`, destino
 * sin etiqueta y contenido no legible.
 */
export const collectRiskWarnings = (request: PendingRequest | null): readonly RiskWarning[] => {
  if (request === null) {
    return [];
  }
  const warnings: RiskWarning[] = [];
  const pendingTexts: string[] = [];

  if (request.method === 'eth_sendTransaction') {
    const preview = request.txPreview;
    if (preview === undefined) {
      // Hueco de ENTREGA, no un riesgo del usuario: se destaca para que se vea, pero no bloquea
      // (el bloqueo se reserva al selector fuera de la tabla local, riesgo R-05).
      warnings.push({
        id: 'missing-tx-preview',
        severity: 'highlight',
        title: 'Resumen de la transacción no disponible',
        detail:
          'El Service Worker no adjuntó la vista previa de la transacción: no se puede describir qué se va a firmar.',
      });
    } else {
      if (preview.isUnrecognizedContractCall || (preview.isContractCall && preview.functionName === null)) {
        warnings.push(
          blockingWarning(
            'unrecognized-contract-call',
            'Llamada a contrato no reconocida',
            'El selector de estos datos no está en la tabla local de funciones conocidas de la cartera: no se puede describir qué hará la llamada.',
          ),
        );
      }
      if (preview.estimationFailed !== null) {
        warnings.push(
          blockingWarning(
            'estimation-failed',
            'La estimación de gas falló',
            `${preview.estimationFailed.reason}. El envío se ha bloqueado.`,
          ),
        );
      }
      if (preview.insufficientFunds) {
        warnings.push(
          blockingWarning(
            'insufficient-funds',
            'Saldo insuficiente',
            'El saldo no cubre el valor más la comisión estimada.',
          ),
        );
      }
      if (isUnlimitedAllowanceCall(preview)) {
        const text = preview.riskWarnings.find((warning) => /ilimitad/i.test(warning)) ?? null;
        pushHighlight(
          warnings,
          {
            id: 'unlimited-allowance',
            severity: 'highlight',
            title: 'Allowance ilimitada',
            detail:
              'El gastador podrá disponer de todos tus tokens de este contrato sin volver a pedir permiso.',
          },
          text,
        );
      }
      if (isApprovalForAllCall(preview)) {
        const text = preview.riskWarnings.find((warning) => /operador|todos tus/i.test(warning)) ?? null;
        pushHighlight(
          warnings,
          {
            id: 'approval-for-all',
            severity: 'highlight',
            title: 'Aprobación de operador para todos los tokens',
            detail: 'El operador podrá mover todos los tokens de esta colección sin volver a pedir permiso.',
          },
          text,
        );
      }
      if (preview.to !== null && preview.toLabel === 'desconocido') {
        const text = preview.riskWarnings.find((warning) => /etiqueta|desconocid/i.test(warning)) ?? null;
        pushHighlight(
          warnings,
          {
            id: 'unknown-destination',
            severity: 'highlight',
            title: 'Destino sin etiqueta',
            detail: 'La cartera no reconoce este destino: no hay una etiqueta local que lo identifique.',
          },
          text,
        );
      }
      for (const text of preview.riskWarnings) {
        if (!alreadyCovered(warnings, text)) {
          pendingTexts.push(text);
        }
      }
    }
  }

  if (request.method === 'eth_signTypedData_v4') {
    const preview: TypedDataPreview | undefined = request.typedDataPreview;
    if (preview === undefined) {
      // Hueco de entrega: se destaca, no bloquea (el bloqueo es para el dominio/contrato en riesgo).
      warnings.push({
        id: 'missing-typed-data-preview',
        severity: 'highlight',
        title: 'Vista previa EIP-712 no disponible',
        detail: 'El Service Worker no adjuntó el dominio ni el mensaje que se va a firmar.',
      });
    } else {
      if (preview.domainChainMismatch) {
        warnings.push(
          blockingWarning(
            'domain-chain-mismatch',
            'El dominio declara otra red',
            'El dominio de los datos declara una red distinta de la red activa: firma solo si confías en el sitio.',
          ),
        );
      }
      if (preview.verifyingContractMismatch) {
        warnings.push(
          blockingWarning(
            'verifying-contract-mismatch',
            'Contrato verificador no desplegado',
            'El contrato verificador del dominio es la dirección cero o no está desplegado en la red activa.',
          ),
        );
      }
      if (preview.message === null) {
        // ADT-21/D-L: la preview se persistió REDACTADA (hash + longitud) por superar 4 KiB.
        pushHighlight(
          warnings,
          {
            id: 'long-message',
            severity: 'highlight',
            title: 'Mensaje demasiado largo',
            detail:
              'El mensaje supera el tamaño que la cartera guarda en claro: solo conserva su resumen (hash y longitud).',
          },
          null,
        );
      }
    }
  }

  if (request.method === 'personal_sign') {
    const preview = request.signMessagePreview;
    if (preview === undefined) {
      // Hueco de entrega: se destaca, no bloquea.
      warnings.push({
        id: 'missing-sign-preview',
        severity: 'highlight',
        title: 'Vista previa del mensaje no disponible',
        detail: 'El Service Worker no adjuntó el mensaje que se va a firmar.',
      });
    } else if (preview.isHexPayload) {
      // Firma de bytes que el usuario NO puede leer: exige doble confirmación (§3.4, `CA-RF-21`).
      warnings.push(
        blockingWarning(
          'illegible-payload',
          'Contenido no legible',
          `El contenido no es legible como texto UTF-8 (${preview.byteLength} bytes en hexadecimal).`,
        ),
      );
    }
    if (preview !== undefined && (preview as unknown as Record<string, unknown>).truncated === true) {
      // ADT-21/D-L: por encima de 4 KiB se persiste un EXTRACTO del texto.
      pushHighlight(
        warnings,
        {
          id: 'truncated-payload',
          severity: 'highlight',
          title: 'Contenido truncado',
          detail:
            'El mensaje supera el tamaño que la cartera guarda en claro: lo que se muestra es un extracto.',
        },
        null,
      );
    }
  }

  for (const text of pendingTexts) {
    warnings.push({
      id: `service-worker-${warnings.length}`,
      severity: 'highlight',
      title: 'Aviso del Service Worker',
      detail: text,
    });
  }
  return warnings;
};

/** Construye el contexto de presentación a partir del estado publicado (`wallet_getState`). */
const contextOf = (snapshot: WalletSnapshot): WindowContext => {
  const labels = new Map<string, string>();
  for (const account of snapshot.accounts) {
    labels.set(account.address.toLowerCase(), account.label);
  }
  const active =
    snapshot.networks.find((network) => network.chainId === snapshot.currentChainId) ?? null;
  return {
    accountLabels: labels,
    networkName: active?.name ?? null,
    symbol: active?.symbol ?? DEFAULT_CHAIN_SYMBOL,
    chainId: snapshot.currentChainId,
  };
};

/** Etiqueta de una cuenta, si el estado la conoce. */
export const accountLabelFor = (context: WindowContext, address: string): string | null =>
  context.accountLabels.get(address.toLowerCase()) ?? null;

/** Props de la superficie de decisión (presentacional y comprobable sin Service Worker). */
export interface ApprovalWindowProps {
  request: PendingRequest | null;
  pendingCount: number;
  origin: string | null;
  faviconUrl: string | null;
  context: WindowContext;
  warnings: readonly RiskWarning[];
  acknowledged: boolean;
  onAcknowledge: (acknowledged: boolean) => void;
  /**
   * Aviso «antes de la primera firma» (RNF-23, tarea 6.3): `true` mientras el registro de actividad
   * no demuestre ninguna firma anterior. Lo decide {@link App} leyendo `wallet_getLogs`, porque esta
   * superficie es presentacional.
   */
  firstSignature: boolean;
  /** Acuse obligatorio del aviso de primera firma; sin él «Aprobar» queda deshabilitado. */
  firstSignatureAcknowledged: boolean;
  onFirstSignatureAcknowledge: (acknowledged: boolean) => void;
  /** Pantalla «Acerca de» (RNF-23): el otro aviso in-product que exige el criterio. */
  aboutOpen: boolean;
  onAboutOpen: () => void;
  onAboutClose: () => void;
  busy: boolean;
  error: PopupError | null;
  gap: PopupError | null;
  outcome: Outcome;
  onApprove: () => void;
  onReject: () => void;
}

/** Favicon del origen, con reserva textual cuando la imagen no está disponible. */
function OriginFavicon({ origin, src }: { origin: string | null; src: string | null }): JSX.Element {
  const [failed, setFailed] = useState(false);
  const initial =
    origin === null ? '?' : origin.replace(/^https?:\/\//i, '').slice(0, 1).toUpperCase() || '?';
  if (src === null || failed) {
    return (
      <span className="tk-origin__favicon tk-origin__favicon--fallback" aria-hidden="true">
        {initial}
      </span>
    );
  }
  return (
    <img
      className="tk-origin__favicon"
      src={src}
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

/** Resumen específico de cada tipo de solicitud (los tres paneles de firma de H4). */
function RequestPanel({
  request,
  context,
}: {
  request: PendingRequest;
  context: WindowContext;
}): JSX.Element {
  if (request.method === 'eth_sendTransaction') {
    if (request.txPreview === undefined) {
      return (
        <p className="tk-notice">
          El Service Worker no adjuntó el resumen de la transacción: no hay cuenta, destino, valor ni
          comisión que mostrar.
        </p>
      );
    }
    return (
      <TxPreviewPanel
        preview={request.txPreview}
        accountLabel={accountLabelFor(context, request.account)}
        networkName={context.networkName}
        symbol={context.symbol}
        expiresAt={request.expiresAt}
      />
    );
  }
  if (request.method === 'eth_signTypedData_v4') {
    if (request.typedDataPreview === undefined) {
      return (
        <p className="tk-notice">
          El Service Worker no adjuntó el dominio ni el mensaje EIP-712 de esta solicitud.
        </p>
      );
    }
    return (
      <TypedDataPanel
        preview={request.typedDataPreview}
        networkName={context.networkName}
        activeChainId={context.chainId}
      />
    );
  }
  if (request.method === 'personal_sign') {
    if (request.signMessagePreview === undefined) {
      return <p className="tk-notice">El Service Worker no adjuntó el mensaje de esta solicitud.</p>;
    }
    return <PersonalSignPanel preview={request.signMessagePreview} />;
  }
  return (
    <p className="tk-notice">
      {`Solicitud de ${METHOD_LABELS[request.method].toLowerCase()} para la red ${context.networkName ?? request.chainId}. El detalle de estas operaciones (datos de la red a añadir o a activar y permisos a revocar) se publica con la ampliación de H5; esta ventana solo puede aprobarla o rechazarla con el origen y el resumen de arriba.`}
    </p>
  );
}

/**
 * Superficie de la ventana de decisión. Es presentacional: recibe la solicitud ya entregada, el
 * contador, los avisos y los dos callbacks. La usa {@link App} con el Service Worker real y se
 * puede pintar con datos fijos sin canal.
 */
export function ApprovalWindow({
  request,
  pendingCount,
  origin,
  faviconUrl,
  context,
  warnings,
  acknowledged,
  onAcknowledge,
  firstSignature,
  firstSignatureAcknowledged,
  onFirstSignatureAcknowledge,
  aboutOpen,
  onAboutOpen,
  onAboutClose,
  busy,
  error,
  gap,
  outcome,
  onApprove,
  onReject,
}: ApprovalWindowProps): JSX.Element {
  const blocked = warnings.some((warning) => warning.severity === 'blocking') && !acknowledged;
  /**
   * Bloqueo del aviso de primera firma (RNF-23): mientras la cartera no haya firmado nunca, la
   * ventana exige el acuse explícito. Es un bloqueo INDEPENDIENTE del de los avisos de riesgo: los
   * dos deben estar resueltos para poder aprobar.
   */
  const firstSignatureBlocked = firstSignature && !firstSignatureAcknowledged;
  const decided = outcome === 'approved' || outcome === 'rejected';
  const resolved = request !== null && request.status !== 'pending';
  const canDecide = request !== null && !resolved;

  return (
    <div className="tk-window tk-notification">
      <header className="tk-header">
        <h1 className="tk-header__title">{NOMBRE_PRODUCTO}</h1>
        <div className="tk-header__actions">
          {/*
            El contador conserva la clase `tk-header__badge` además de `tk-badge`: es la que
            `leerContadorDeLaVentana` (arnés E2E) usa como ancla estable del contador de pendientes
            (P-21), y la que evita que la insignia se encoja dentro de la cabecera.
          */}
          <span className="tk-badge tk-header__badge" title="Solicitudes pendientes en la cola">
            {pluralize(pendingCount, 'solicitud en espera', 'solicitudes en espera')}
          </span>
          <button type="button" className="tk-btn-ghost tk-btn-small" onClick={onAboutOpen}>
            {ACERCA_DE_BOTON}
          </button>
        </div>
        <img className="tk-header__mark" src={MARK_SRC} alt="" aria-hidden="true" />
      </header>

      {aboutOpen ? <AboutDialog onClose={onAboutClose} /> : null}

      <main className="tk-main">
        <section className="tk-origin" aria-labelledby="tk-origin-title">
          <OriginFavicon origin={origin} src={faviconUrl} />
          <div className="tk-origin__body">
            <h2 className="tk-section__title" id="tk-origin-title">
              {request === null ? 'Solicitud pendiente' : METHOD_LABELS[request.method]}
            </h2>
            <p className="tk-origin__url tk-mono" title={origin ?? undefined}>
              {origin ?? 'Origen no disponible'}
            </p>
          </div>
          <RiskBadge warnings={warnings} />
        </section>

        {request !== null ? (
          <p className="tk-note">
            {`Solicitud ${request.approvalId.slice(0, 8)} recibida el ${formatTimestamp(request.createdAt)} · vence el ${formatTimestamp(request.expiresAt)}`}
          </p>
        ) : null}

        <RiskWarnings
          warnings={warnings}
          acknowledged={acknowledged}
          onAcknowledge={onAcknowledge}
        />

        {/*
          RNF-23 · aviso «antes de la primera firma» (tarea 6.3): se pinta ANTES de las acciones y,
          mientras no esté marcado, «Aprobar» queda deshabilitado. En cuanto el registro demuestre
          una firma anterior, el aviso desaparece y nunca vuelve (sobrevive al reset, RF-32).
        */}
        {firstSignature ? (
          <FirstSignatureNotice
            acknowledged={firstSignatureAcknowledged}
            onAcknowledge={onFirstSignatureAcknowledge}
          />
        ) : null}

        {request !== null ? <RequestPanel request={request} context={context} /> : null}

        {resolved ? (
          <p className="tk-notice" role="status">
            Esta solicitud ya está resuelta. La ventana pasará a la siguiente pendiente o se cerrará.
          </p>
        ) : null}

        {gap !== null ? (
          <>
            <p className="tk-notice" role="status">
              {APPROVAL_GAP}
            </p>
            <StatusMessage error={gap} />
          </>
        ) : null}

        <StatusMessage error={error} />
        {outcome !== 'none' ? (
          <p
            className={`tk-status tk-status--${outcome === 'approved' ? 'success' : outcome === 'rejected' ? 'warning' : 'error'}`}
            role="status"
          >
            <span className="tk-status__message">{OUTCOME_LABELS[outcome]}</span>
          </p>
        ) : null}

        <div className="tk-approval__actions">
          <button
            type="button"
            className="tk-btn-danger"
            autoFocus
            onClick={onReject}
            disabled={busy || !canDecide || decided}
          >
            Rechazar
          </button>
          <button
            type="button"
            className="tk-btn-primary"
            onClick={onApprove}
            disabled={busy || !canDecide || decided || blocked || firstSignatureBlocked}
          >
            Aprobar
          </button>
        </div>

        <p className="tk-note">
          Pulse Escape para rechazar. Cerrar esta ventana también equivale a rechazar la solicitud: la
          dApp recibirá el error 4001.
        </p>

        {blocked ? (
          <p className="tk-note" role="status">
            Hay avisos de riesgo bloqueantes: marque la casilla de los avisos para poder aprobar.
          </p>
        ) : null}

        {firstSignatureBlocked ? (
          <p className="tk-note" role="status">
            Es su primera firma con esta cartera: marque el acuse del aviso para poder aprobar.
          </p>
        ) : null}
      </main>
    </div>
  );
}

/**
 * Ventana única de confirmación: pide la solicitud al Service Worker, la pinta con los paneles
 * M51–M54 y entrega la decisión con `SIGN_RESPONSE`. No firma y no toca el almacén (RNF-14).
 */
export function App(): JSX.Element {
  const bootstrap = useMemo(() => readApprovalBootstrap(window.location.search), []);
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [delivery, setDelivery] = useState<ApprovalDelivery | null>(null);
  const [gap, setGap] = useState<PopupError | null>(null);
  const [context, setContext] = useState<WindowContext>(EMPTY_CONTEXT);
  const [acknowledged, setAcknowledged] = useState(false);
  /**
   * RNF-23 · aviso de la PRIMERA firma. `firstSignature` solo se activa cuando el registro de
   * actividad se ha leído y NO contiene ninguna firma anterior; mientras la lectura esté en curso o
   * haya fallado, el valor es `false` y la firma no se bloquea por un fallo de observabilidad (ver
   * `firstSignature.ts`).
   */
  const [firstSignature, setFirstSignature] = useState(false);
  const [firstSignatureAcknowledged, setFirstSignatureAcknowledged] = useState(false);
  /** Pantalla «Acerca de» (RNF-23, tarea 6.3), accesible desde la cabecera de la ventana. */
  const [aboutOpen, setAboutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PopupError | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('none');

  const request = delivery?.request ?? null;
  const pendingCount = delivery?.pendingCount ?? 1;
  const origin = request?.origin ?? bootstrap.origin;
  const faviconUrl = useMemo(
    () => faviconForOrigin(origin, delivery?.favicon ?? null),
    [origin, delivery],
  );
  const warnings = useMemo(() => collectRiskWarnings(request), [request]);
  const blocked = warnings.some((warning) => warning.severity === 'blocking');

  /** Espejos para los listeners que se registran una sola vez (`pagehide`). */
  const requestRef = useRef<PendingRequest | null>(null);
  const decidedRef = useRef(false);
  const closeTimerRef = useRef(0);

  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  /**
   * RNF-23 · ¿es la PRIMERA firma de esta cartera? Se decide con el registro de actividad
   * (`wallet_getLogs`, lectura interna del catálogo §5.1.1), no leyendo el almacén: la UI tiene
   * prohibido `chrome.storage` (RNF-14).
   *
   * Se vuelve a evaluar con CADA solicitud nueva: la ventana es ÚNICA y se reutiliza (P-21), así que
   * tras aprobar la primera firma el componente NO se desmonta y el aviso desaparecería por la
   * cuenta equivocada (quedándose en pantalla). Releyendo el registro, el aviso solo sigue visible si
   * la cartera no ha firmado todavía de verdad.
   */
  const revisarPrimeraFirma = useCallback(async (): Promise<void> => {
    const firmaPrevia = await readLogSignatures();
    setFirstSignature(firstSignatureState(firmaPrevia).visible);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const firmaPrevia = await readLogSignatures();
      if (!active) {
        return;
      }
      setFirstSignature(firstSignatureState(firmaPrevia).visible);
    })();
    return () => {
      active = false;
    };
  }, []);

  /** Cancela el cierre diferido: el SW ha entregado la siguiente solicitud. */
  const cancelClose = useCallback((): void => {
    if (closeTimerRef.current !== 0) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = 0;
    }
  }, []);

  /** Da margen al SW para re-renderizar la ventana; si no lo hace, se cierra (P-21). */
  const scheduleClose = useCallback((): void => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      window.close();
    }, NEXT_REQUEST_GRACE_MS);
  }, [cancelClose]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToApprovalPush((next) => {
      if (!active) {
        return;
      }
      cancelClose();
      decidedRef.current = false;
      setDelivery(next);
      setGap(null);
      setAcknowledged(false);
      // El acuse del aviso de RNF-23 se rearma con cada solicitud y el aviso se reevalúa contra el
      // registro: solo desaparece cuando hay una firma de verdad, no al aprobar la primera.
      setFirstSignatureAcknowledged(false);
      setOutcome('none');
      setError(null);
      setPhase('ready');
      void revisarPrimeraFirma();
    });
    void (async () => {
      const [delivered, snapshot] = await Promise.all([
        requestPendingApproval(bootstrap.approvalId),
        readSnapshot(),
      ]);
      if (!active) {
        return;
      }
      if (snapshot.ok) {
        setContext(contextOf(snapshot.snapshot));
      }
      if (delivered.ok) {
        setDelivery(delivered.delivery);
        setGap(null);
      } else {
        setGap(delivered.error);
      }
      setPhase('ready');
    })();
    return () => {
      active = false;
      unsubscribe();
      cancelClose();
    };
  }, [bootstrap.approvalId, cancelClose, revisarPrimeraFirma]);

  /**
   * Re-consulta la solicitud pendiente.
   *
   * M18 (`approvals/focus.ts`) señala el cambio de solicitud **enfocando la ventana** y anotando el
   * `shownApprovalId` en `truekeate_approval_window`; no empuja el cuerpo. Por eso, además de
   * escuchar el canal del runtime, la ventana vuelve a pedir el registro persistido al recibir el
   * foco: si ninguna de las dos rutas responde, se declara el hueco en vez de pintar datos que la
   * ventana no tiene (RNF-14: no lee el almacén).
   */
  const pullPending = useCallback(async (): Promise<void> => {
    const delivered = await requestPendingApproval(bootstrap.approvalId);
    if (delivered.ok) {
      cancelClose();
      decidedRef.current = false;
      setDelivery(delivered.delivery);
      setGap(null);
      setFirstSignatureAcknowledged(false);
      setOutcome('none');
      setError(null);
      void revisarPrimeraFirma();
      return;
    }
    setGap(delivered.error);
  }, [bootstrap.approvalId, cancelClose, revisarPrimeraFirma]);

  /** El foco de la ventana es la señal de «muestra la siguiente» de M18. */
  useEffect(() => {
    const onFocus = (): void => {
      if (requestRef.current === null || decidedRef.current) {
        void pullPending();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [pullPending]);

  /** Envía la decisión. `success: true` solo si no hay avisos bloqueantes sin marcar. */
  const decide = async (success: boolean): Promise<void> => {
    const current = requestRef.current;
    if (current === null || busy || decidedRef.current) {
      return;
    }
    if (success && blocked && !acknowledged) {
      return;
    }
    setBusy(true);
    setError(null);
    const message: SignResponseMessage = success
      ? { type: 'SIGN_RESPONSE', approvalId: current.approvalId, success: true }
      : {
          type: 'SIGN_RESPONSE',
          approvalId: current.approvalId,
          success: false,
          error: USER_REJECTED_ERROR,
        };
    const delivered = await deliverSignResponse(message);
    decidedRef.current = true;
    setBusy(false);
    if (!delivered.ok) {
      setError(delivered.error);
      setOutcome('failed');
      return;
    }
    setOutcome(success ? 'approved' : 'rejected');
    // La ventana NO se cierra aquí: el SW muestra la siguiente pendiente o la cierra él (§3.1).
    scheduleClose();
  };

  /** Cierre de la ventana (X) sin decidir: equivale a rechazo (`4001`, §3.1). */
  useEffect(() => {
    const onHide = (): void => {
      const current = requestRef.current;
      if (current === null || decidedRef.current) {
        return;
      }
      decidedRef.current = true;
      void deliverSignResponse({
        type: 'SIGN_RESPONSE',
        approvalId: current.approvalId,
        success: false,
        error: USER_REJECTED_ERROR,
      });
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  /**
   * `Escape` = rechazar (§3.1, RNF-05).
   *
   * Con la pantalla «Acerca de» abierta NO se rechaza: allí `Escape` cierra la pantalla informativa
   * y el rechazo de la solicitud sería una acción destructiva no pedida por el usuario.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !aboutOpen) {
        event.preventDefault();
        void decide(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  if (phase === 'loading' && request === null) {
    return (
      <div className="tk-window tk-notification">
        <header className="tk-header">
          <h1 className="tk-header__title">{NOMBRE_PRODUCTO}</h1>
          <img className="tk-header__mark" src={MARK_SRC} alt="" aria-hidden="true" />
        </header>
        <main className="tk-main tk-empty" aria-busy="true">
          <span className="tk-spinner" aria-hidden="true" />
          <p className="tk-empty__text" role="status">
            Cargando la solicitud…
          </p>
        </main>
      </div>
    );
  }

  return (
    <ApprovalWindow
      request={request}
      pendingCount={pendingCount}
      origin={origin}
      faviconUrl={faviconUrl}
      context={context}
      warnings={warnings}
      acknowledged={acknowledged}
      onAcknowledge={setAcknowledged}
      firstSignature={firstSignature}
      firstSignatureAcknowledged={firstSignatureAcknowledged}
      onFirstSignatureAcknowledge={setFirstSignatureAcknowledged}
      aboutOpen={aboutOpen}
      onAboutOpen={() => {
        setAboutOpen(true);
      }}
      onAboutClose={() => {
        setAboutOpen(false);
      }}
      busy={busy}
      error={error}
      gap={gap}
      outcome={outcome}
      onApprove={() => {
        void decide(true);
      }}
      onReject={() => {
        void decide(false);
      }}
    />
  );
}

export default App;
