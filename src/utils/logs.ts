/// <reference types="chrome"/>

import type { LogEntry, LogMessage, LogType } from '../types'

/**
 * Bus de logs compartido por el service worker y el popup.
 *
 * El panel del popup debe mostrar también lo que ocurre en las dApps (llamadas
 * RPC, eventos, aprobaciones y errores), así que el background publica cada
 * entrada aquí y avisa al popup para que la pinte en vivo.
 *
 * El historial se guarda en `chrome.storage.local` con un tope de entradas, de
 * modo que sobrevive al cierre del popup, a recargar la extensión y al reinicio
 * del navegador (y el Reset de la wallet lo conserva).
 */

export const LOGS_KEY = 'codecrypto_logs'
export const MAX_LOG_ENTRIES = 200

/** Crea una entrada con la hora actual (ISO 8601, parseable). */
export function createLogEntry(type: LogType, content: string, source?: string): LogEntry {
  return { type, content, source, timestamp: new Date().toISOString() }
}

/**
 * Hora legible de una entrada. Admite el formato antiguo (`toLocaleTimeString`,
 * no parseable) y lo devuelve tal cual si no se puede interpretar.
 */
export function horaLog(entry: LogEntry): string {
  const fecha = new Date(entry.timestamp)
  if (Number.isNaN(fecha.getTime())) return entry.timestamp
  return fecha.toLocaleTimeString('es')
}

/** Lee el historial completo (el más antiguo primero). */
export async function loadLogs(): Promise<LogEntry[]> {
  const stored = await chrome.storage.local.get(LOGS_KEY)
  const logs = stored[LOGS_KEY]
  return Array.isArray(logs) ? (logs as LogEntry[]) : []
}

/** Añade una entrada al historial respetando el tope de `MAX_LOG_ENTRIES`. */
export async function appendLog(entry: LogEntry): Promise<void> {
  const logs = await loadLogs()
  logs.push(entry)
  await chrome.storage.local.set({ [LOGS_KEY]: logs.slice(-MAX_LOG_ENTRIES) })
  notifyPopup(entry)
}

/** Vacía el historial. */
export async function clearLogs(): Promise<void> {
  await chrome.storage.local.set({ [LOGS_KEY]: [] })
}

/** Avisa al popup (si está abierto) para que pinte la entrada en vivo. */
export function notifyPopup(entry: LogEntry): void {
  try {
    chrome.runtime.sendMessage({ type: 'CODECRYPTO_LOG', entry } as LogMessage, () => {
      // Si el popup está cerrado no hay receptor: se consume el error para
      // evitar el aviso "Unchecked runtime.lastError".
      void chrome.runtime.lastError
    })
  } catch {
    // Sin popup abierto: la entrada ya quedó guardada en el historial
  }
}

/** Atajo: crea la entrada, la persiste y avisa al popup. */
export async function log(type: LogType, content: string, source?: string): Promise<void> {
  await appendLog(createLogEntry(type, content, source))
}

/**
 * Deduplica entradas: el popup añade sus propias acciones a la lista y además
 * puede recibirlas por el bus, así que antes de pintar comprueba si la última
 * entrada es la misma.
 */
export function isSameEntry(a: LogEntry | undefined, b: LogEntry): boolean {
  if (!a) return false
  return a.type === b.type && a.timestamp === b.timestamp && a.content === b.content
}
