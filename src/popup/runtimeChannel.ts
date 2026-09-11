/**
 * M39 (soporte) — `src/popup/runtimeChannel.ts`
 * Único punto del popup que toca el canal de mensajería de la extensión.
 *
 * El API REAL y tipado de MV3 para hablar con el Service Worker es
 * **`chrome.runtime.sendMessage`**. `chrome.runtime.postMessage` **no existe**: el defecto
 * `D-H2-A` de H2 se introdujo al ofuscar ese identificador (`'pos' + 'tMessage'`) para que la UI
 * no contuviera la palabra inglesa «post». Aquí se encapsula el canal para que exista UNA sola
 * referencia al API y sea comprobable con un test:
 *
 * - `getRuntimeChannel()` devuelve el canal si el API está disponible, o `null`. Su
 *   implementación es la única línea del popup que invoca `chrome.runtime.sendMessage`.
 * - El canal es **tipado**: `unknown → Promise<unknown>`; la forma del sobre la fija el contrato
 *   de `documento_tecnico.md` §5.1.1 y vive en `walletRpc.ts`.
 * - De cara al navegador estamos en el MISMO contexto que el Service Worker (origen
 *   `chrome-extension://<id>`), así que el remitente no necesita `tabId` ni `frameId`.
 *
 * Nada de secretos cruza este módulo: solo transporta el sobre de la petición y su respuesta
 * (RNF-09). El valor revelado viaja del SW al popup por este mismo canal.
 */

/** Firma del canal de mensajería del runtime: sobre de petición → respuesta del SW. */
export type RuntimeChannel = (message: unknown) => Promise<unknown>;

/**
 * Devuelve el canal de mensajería del runtime, o `null` cuando la API no está disponible
 * (pruebas unitarias sin `chrome`, página abierta fuera de una extensión…).
 *
 * No usa `Reflect.get` ni nombres construidos: el identificador real del API
 * (`sendMessage`) aparece UNA sola vez, aquí, y el resto del popup depende de este helper.
 */
export const getRuntimeChannel = (): RuntimeChannel | null => {
  if (typeof chrome === 'undefined') {
    return null;
  }
  const runtime: unknown = chrome.runtime;
  if (typeof runtime !== 'object' || runtime === null) {
    return null;
  }
  const sendMessage: unknown = (runtime as { sendMessage?: unknown }).sendMessage;
  if (typeof sendMessage !== 'function') {
    return null;
  }
  return (message: unknown) => chrome.runtime.sendMessage(message) as Promise<unknown>;
};

/** ¿Está disponible el canal de mensajería con el Service Worker? */
export const hasRuntimeChannel = (): boolean => getRuntimeChannel() !== null;
