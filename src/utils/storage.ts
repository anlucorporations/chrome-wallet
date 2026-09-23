/// <reference types="chrome"/>

/**
 * Reglas de limpieza del almacenamiento de la wallet.
 *
 * La regla del Reset vive aquí (y no dentro del popup) para que esté en un único
 * sitio y puedan usarla tanto la interfaz como las pruebas automáticas
 * (`scripts/test-acceptance.mjs`).
 */

/** Prefijo de todas las claves de la wallet en `chrome.storage.local`. */
export const WALLET_KEY_PREFIX = 'codecrypto_'

/** Prefijo del historial de actividad, que el Reset debe conservar. */
export const LOGS_KEY_PREFIX = 'codecrypto_log'

/**
 * Claves que borra el botón "Reset Wallet": todas las de la wallet **menos** el
 * historial de logs (requisito 23 del enunciado y caso de prueba 8).
 */
export function walletKeysToReset(allKeys: string[]): string[] {
  return allKeys.filter(
    (key) => key.startsWith(WALLET_KEY_PREFIX) && !key.startsWith(LOGS_KEY_PREFIX)
  )
}
