/// <reference types="chrome"/>
/**
 * Content script: puente entre la página y el service worker.
 *
 *  - Inyecta `inject.js` en el contexto de la página, que es donde vive
 *    `window.codecrypto`.
 *  - Reenvía las peticiones RPC de la dApp al background y devuelve la respuesta.
 *  - Reenvía los eventos (`accountsChanged`, `chainChanged`) a la página.
 *
 * Los errores cruzan serializados con su código EIP-1193.
 *
 * ⚠️ Los content scripts son **scripts clásicos** (el manifest no admite
 * módulos), así que este archivo NO puede importar módulos en tiempo de
 * ejecución: solo tipos, que se borran al compilar. De ahí que el código de
 * error interno (`-32603`) se escriba como literal; la fuente de verdad es
 * `src/types.ts`.
 */
import type {
  ProviderEventMessage,
  ProviderRequestMessage,
  ProviderResponseMessage,
  RpcResponseMessage,
  SerializedError
} from './types'

/** Error interno del proveedor (-32603 no puede llegar desde el background). */
const INTERNAL_ERROR = -32603

function serializeError(error: unknown): SerializedError {
  return {
    code: INTERNAL_ERROR,
    message: error instanceof Error ? error.message : String(error)
  }
}

;(function () {
  console.log('🔧 CodeCrypto Content Script cargado')

  // Inyectar el script en el contexto de la página
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('inject.js')
  script.onload = () => {
    console.log('✅ inject.js cargado y ejecutado')
    script.remove()
  }
  ;(document.head || document.documentElement).appendChild(script)

  // ── Página → extensión ──────────────────────────────────────────────
  window.addEventListener('message', async (event: MessageEvent) => {
    // Solo se atienden mensajes de esta misma ventana (los que envía inject.js)
    if (event.source !== window) return

    const request = event.data as ProviderRequestMessage | undefined
    if (!request || request.type !== 'CODECRYPTO_REQUEST') return

    console.log('📨 Solicitud de página:', request.method, request.params)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CODECRYPTO_RPC',
        method: request.method,
        params: request.params
      }) as RpcResponseMessage

      console.log('📬 Respuesta del background:', response)

      window.postMessage({
        type: 'CODECRYPTO_RESPONSE',
        id: request.id,
        result: response?.result,
        error: response?.error ?? null
      } as ProviderResponseMessage, '*')
    } catch (error) {
      const serialized = serializeError(error)
      console.error('❌ Error en RPC:', serialized)

      window.postMessage({
        type: 'CODECRYPTO_RESPONSE',
        id: request.id,
        error: serialized
      } as ProviderResponseMessage, '*')
    }
  })

  // ── Extensión → página (eventos) ────────────────────────────────────
  chrome.runtime.onMessage.addListener((message: unknown) => {
    const msg = message as ProviderEventMessage | undefined
    if (!msg || msg.type !== 'CODECRYPTO_EVENT') return

    console.log('📢 Evento desde el background:', msg.eventName, msg.data)
    window.postMessage({
      type: 'CODECRYPTO_EVENT',
      eventName: msg.eventName,
      data: msg.data
    } as ProviderEventMessage, '*')
  })

  console.log('✅ CodeCrypto Content Script listo')
})()
