/**
 * Script de inyección: crea `window.codecrypto` en el contexto de la página.
 *
 * Implementa el proveedor EIP-1193, se comunica con el content script mediante
 * `window.postMessage` y anuncia el proveedor por EIP-6963. Los errores que
 * llegan del background se reconstruyen como `Error` con su código EIP-1193.
 *
 * ⚠️ Este archivo se inyecta como **script clásico** (una etiqueta `<script>`),
 * así que NO puede importar módulos en tiempo de ejecución: solo se importan
 * tipos (que se borran al compilar). Por eso los códigos de error se escriben
 * aquí como literales; la fuente de verdad es `src/types.ts`.
 */
import type { ProviderEventMessage, ProviderRequestMessage, ProviderResponseMessage, SerializedError } from './types'

interface EthereumProvider {
  isCodeCrypto: boolean
  isMetaMask: boolean
  request: (args: RequestArguments) => Promise<unknown>
  on: (eventName: string, callback: (data: unknown) => void) => void
  removeListener: (eventName: string, callback: (data: unknown) => void) => void
  removeAllListeners: (eventName?: string) => void
}

interface RequestArguments {
  method: string
  params?: unknown[]
}

/** Códigos EIP-1193 usados por el proveedor (ver `src/types.ts`). */
const USER_REJECTED = 4001

/** Reconstruye el error que envía el background conservando su código. */
function toProviderError(payload: SerializedError | string | null | undefined): Error {
  if (!payload) return new Error('Unknown error')
  if (typeof payload === 'string') return new Error(payload)
  const error = new Error(payload.message) as Error & { code?: number }
  error.name = 'ProviderRpcError'
  error.code = payload.code
  return error
}

;(function () {
  'use strict'

  console.log('🔐 CodeCrypto Wallet: Inyectando proveedor...')

  // La página puede tener ya un proveedor inyectado por esta extensión
  const pageWindow = window as unknown as { codecrypto?: EthereumProvider }
  if (pageWindow.codecrypto) {
    console.log('⚠️ CodeCrypto Wallet ya está inyectado')
    return
  }

  // Timeout de las peticiones RPC. Debe ser MAYOR que el timeout de aprobación
  // del background (120 s en firmas, 60 s en conexión): si la dApp abortase
  // antes, el usuario no podría terminar de aprobar en la ventana emergente.
  const REQUEST_TIMEOUT_MS = 130000;

  // Crear el proveedor EIP-1193
  const eventListeners: { [key: string]: Array<(data: unknown) => void> } = {};
  let requestId = 0;

  const codecryptoProvider: EthereumProvider = {
    isCodeCrypto: true,
    isMetaMask: false, // Para evitar conflictos con MetaMask
    
    // Método principal EIP-1193
    request: async function({ method, params }: RequestArguments): Promise<unknown> {
      console.log('🔵 CodeCrypto RPC:', method, params);
      
      return new Promise((resolve, reject) => {
        const id = ++requestId;
        
        // Enviar mensaje al content script
        window.postMessage({
          type: 'CODECRYPTO_REQUEST',
          id: id,
          method: method,
          params: params || []
        } as ProviderRequestMessage, '*');
        
        // Escuchar respuesta
        function responseHandler(event: MessageEvent) {
          if (event.source !== window) return;
          if (!event.data || event.data.type !== 'CODECRYPTO_RESPONSE') return;
          if (event.data.id !== id) return; 
          
          window.removeEventListener('message', responseHandler);
          clearTimeout(timeoutId); // la respuesta llegó: cancelar el timeout pendiente
          
          const response = event.data as ProviderResponseMessage;
          
          if (response.error) {
            // Se reconstruye el error con su código EIP-1193 (4001, 4902, …)
            reject(toProviderError(response.error));
          } else {
            resolve(response.result);
          }
        }
        
        // Timeout alineado con la aprobación del background (120 s + 10 s de margen)
        const timeoutId = setTimeout(() => {
          window.removeEventListener('message', responseHandler);
          console.error('⏰ Timeout esperando respuesta para:', method);
          reject(toProviderError({
            code: USER_REJECTED,
            message: 'Request timeout after 130s. Revisa la ventana de confirmación de la wallet: ' +
              'la solicitud pudo quedar pendiente de aprobación.'
          }));
        }, REQUEST_TIMEOUT_MS);
        
        window.addEventListener('message', responseHandler);
      });
    },
    
    // Event emitter
    on: function(eventName: string, callback: (data: unknown) => void): void {
      if (!eventListeners[eventName]) {
        eventListeners[eventName] = [];
      }
      eventListeners[eventName].push(callback);
      console.log('👂 Listener registrado para:', eventName);
    },
    
    removeListener: function(eventName: string, callback: (data: unknown) => void): void {
      if (eventListeners[eventName]) {
        eventListeners[eventName] = eventListeners[eventName].filter(fn => fn !== callback);
      }
    },
    
    // Alias para compatibilidad
    removeAllListeners: function(eventName?: string): void {
      if (eventName) {
        eventListeners[eventName] = [];
      } else {
        Object.keys(eventListeners).forEach(key => {
          eventListeners[key] = [];
        });
      }
    }
  };

  // Escuchar eventos desde el content script
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'CODECRYPTO_EVENT') return;
    
    const { eventName, data } = event.data as ProviderEventMessage;
    console.log('📢 Evento CodeCrypto:', eventName, data);
    
    if (eventListeners[eventName]) {
      eventListeners[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error en listener:', error);
        }
      });
    }
  });

  // Inyectar en window
  Object.defineProperty(window, 'codecrypto', {
    value: codecryptoProvider,
    writable: false,
    configurable: false
  });

  console.log('✅ window.codecrypto inyectado');
  
  // Anunciar proveedor con EIP-6963
  const announceEvent = new CustomEvent('eip6963:announceProvider', {
    detail: {
      info: {
        uuid: crypto.randomUUID(),
        name: 'TrueKeate Wallet',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="%231A2B4C"/></svg>',
        rdns: 'io.codecrypto.wallet'
      },
      provider: codecryptoProvider
    }
  });
  
  window.dispatchEvent(announceEvent);
  console.log('📢 EIP-6963: Proveedor anunciado');
  
  // Escuchar solicitudes de anuncio
  window.addEventListener('eip6963:requestProvider', () => {
    window.dispatchEvent(announceEvent);
  });
  
  console.log('✅ CodeCrypto Wallet listo');
})();

