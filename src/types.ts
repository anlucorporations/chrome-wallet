/// <reference types="chrome"/>

/**
 * Tipos compartidos por el service worker y las interfaces (popup, connect y
 * notification): modelo de datos, mensajes entre contextos y errores con el
 * código numérico de EIP-1193.
 *
 * Se centralizan aquí para que el "contrato" entre background, content script,
 * inject y las ventanas se lea en un único sitio.
 */

// ─────────────────────────────────────────────────────────────────────────
// Errores (EIP-1193)
// ─────────────────────────────────────────────────────────────────────────
/** Códigos de error definidos por EIP-1193 y EIP-1474. */
export const RPC_ERROR_CODES = {
  /** El usuario rechazó la solicitud */
  userRejected: 4001,
  /** El método existe pero la cuenta/origen no está autorizado */
  unauthorized: 4100,
  /** El método no está soportado por el proveedor */
  unsupportedMethod: 4200,
  /** El proveedor está desconectado de la red solicitada */
  disconnected: 4900,
  /** El proveedor está conectado a otra red */
  chainDisconnected: 4901,
  /** La red no está registrada en la wallet (EIP-3326) */
  unrecognizedChain: 4902,
  /** Parámetros inválidos */
  invalidParams: -32602,
  /** Error interno del proveedor */
  internal: -32603,
  /** El recurso solicitado no está disponible (p. ej. el RPC no responde) */
  resourceUnavailable: -32000
} as const

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[keyof typeof RPC_ERROR_CODES]

/**
 * Error con código EIP-1193. Las dApps reciben un `Error` cuyo `.code` permite
 * distinguir, por ejemplo, un rechazo del usuario (4001) de una red desconocida
 * (4902) sin tener que interpretar el mensaje.
 */
export class AppError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

/** Forma serializable de un error: es lo que viaja por chrome.runtime y postMessage. */
export interface SerializedError {
  code: number
  message: string
}

/** Convierte cualquier error en su forma serializable. */
export function toSerializedError(error: unknown): SerializedError {
  if (error instanceof AppError) return { code: error.code, message: error.message }
  if (error instanceof Error) return { code: RPC_ERROR_CODES.internal, message: error.message }
  return { code: RPC_ERROR_CODES.internal, message: String(error) }
}

/** Reconstruye un AppError desde lo recibido por un mensaje o un postMessage. */
export function fromSerializedError(payload: SerializedError | string | null | undefined): AppError {
  if (!payload) return new AppError(RPC_ERROR_CODES.internal, 'Unknown error')
  if (typeof payload === 'string') return new AppError(RPC_ERROR_CODES.internal, payload)
  return new AppError(payload.code, payload.message)
}

// ─────────────────────────────────────────────────────────────────────────
// Modelo de datos de la wallet
// ─────────────────────────────────────────────────────────────────────────
/** Red disponible (por defecto o añadida por el usuario), según EIP-3085. */
export interface ChainConfig {
  /** chainId en hexadecimal, p. ej. '0x7a69' */
  chainId: string
  name: string
  rpcUrl: string
  /** Símbolo de la moneda nativa (ETH, POL…) */
  symbol: string
  explorer?: string
  /** true si viene de la configuración por defecto (no la añadió el usuario) */
  isDefault?: boolean
}

export type LogType = 'call' | 'event' | 'error' | 'message'

/** Entrada del panel de actividad del popup. */
export interface LogEntry {
  type: LogType
  timestamp: string
  content: string
  /** Origen de la entrada: 'dapp', 'wallet'… */
  source?: string
}

/** Solicitud de firma o transacción pendiente de aprobación. */
export interface Approval {
  approvalId: number
  method: string
  params: unknown[]
  chainId: string
  windowId?: number
  resolve?: (value: boolean) => void
  reject?: (reason?: unknown) => void
}

/** Resultado de una solicitud de conexión (connect.html). */
export interface ConnectionResult {
  account?: string
  error?: string | null
}

/** Solicitud de conexión de una dApp pendiente de decisión del usuario. */
export interface ConnectionRequest {
  requestId: number
  origin: string
  accounts: string[]
  currentAccountIndex: number
  windowId?: number
  resolve?: (value: ConnectionResult) => void
  reject?: (reason?: unknown) => void
}

// ─────────────────────────────────────────────────────────────────────────
// Mensajes: interfaces ↔ service worker
// ─────────────────────────────────────────────────────────────────────────
/** Petición RPC genérica hacia el service worker. */
export interface RpcRequestMessage {
  type: 'CODECRYPTO_RPC'
  method: string
  params: unknown[]
}

/** Respuesta del service worker a una petición RPC. */
export interface RpcResponseMessage {
  result?: unknown
  error?: SerializedError | null
}

export interface ConnectResponseMessage {
  type: 'CONNECT_RESPONSE'
  requestId: number
  success: boolean
  account?: string
  /** Índice de la cuenta elegida dentro de la wallet */
  accountIndex?: number
  error?: string
}

export interface SignResponseMessage {
  type: 'SIGN_RESPONSE'
  approvalId: number
  success: boolean
  result?: string
  error?: string
}

export interface AccountChangedMessage {
  type: 'ACCOUNT_CHANGED'
  accountIndex: number
  account: string
}

export interface ChainChangedMessage {
  type: 'CHAIN_CHANGED'
  chainId: string
}

/** El popup avisa de que se ha reseteado la wallet. */
export interface WalletResetMessage {
  type: 'WALLET_RESET'
}

/** El background publica una entrada de actividad para el panel del popup. */
export interface LogMessage {
  type: 'CODECRYPTO_LOG'
  entry: LogEntry
}

/** Unión discriminada de todo lo que el service worker sabe atender. */
export type BackgroundMessage =
  | RpcRequestMessage
  | ConnectResponseMessage
  | SignResponseMessage
  | AccountChangedMessage
  | ChainChangedMessage
  | WalletResetMessage
  | LogMessage

/** Evento que el background difunde a las pestañas. */
export type ProviderEventName = 'accountsChanged' | 'chainChanged'

// ─────────────────────────────────────────────────────────────────────────
// Mensajes: página ↔ content script
// ─────────────────────────────────────────────────────────────────────────
export interface ProviderRequestMessage {
  type: 'CODECRYPTO_REQUEST'
  id: number
  method: string
  params: unknown[]
}

export interface ProviderResponseMessage {
  type: 'CODECRYPTO_RESPONSE'
  id: number
  result?: unknown
  error?: SerializedError | null
}

export interface ProviderEventMessage {
  type: 'CODECRYPTO_EVENT'
  eventName: ProviderEventName
  data: unknown
}
