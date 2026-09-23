/// <reference types="chrome"/>

import { fromSerializedError } from '../types'
import type { RpcResponseMessage } from '../types'

/**
 * Cliente RPC de las interfaces (popup y ventanas) hacia el service worker.
 *
 * Todas las operaciones criptográficas viven en el background, así que las
 * interfaces se comunican con él mediante `chrome.runtime.sendMessage`.
 */

/**
 * Envía una petición RPC al service worker.
 * @throws {AppError} con el código EIP-1193 que devuelva el background
 */
export function sendRPCToBackground<T = unknown>(method: string, params?: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CODECRYPTO_RPC', method, params: params || [] },
      (response: RpcResponseMessage) => {
        if (chrome.runtime.lastError) {
          reject(fromSerializedError(chrome.runtime.lastError.message))
          return
        }
        if (response?.error) {
          reject(fromSerializedError(response.error))
          return
        }
        resolve(response?.result as T)
      }
    )
  })
}

/** Avisa al background de que la wallet se ha reseteado (cierra pendientes). */
export function notifyWalletReset(): void {
  chrome.runtime.sendMessage({ type: 'WALLET_RESET' }, () => {
    void chrome.runtime.lastError
  })
}
