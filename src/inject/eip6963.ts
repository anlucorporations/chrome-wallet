/**
 * M36 — `src/inject/eip6963.ts`
 * Anuncio y re-anuncio EIP-6963 del provider.
 *
 * Cumple, en este orden (`diccionario_datos.md` §4.1.1):
 * 1. **Listener SÍNCRONO** de `eip6963:requestProvider`, registrado dentro del IIFE, ANTES
 *    de emitir el primer anuncio y sin ningún `await` previo (si se registra tarde, el
 *    anuncio se pierde).
 * 2. **Auto-anuncio** con `new CustomEvent('eip6963:announceProvider', { detail })`:
 *    (a) al cargar `inject.js`; (b) en cada `eip6963:requestProvider` recibido;
 *    (c) de nuevo en `DOMContentLoaded`, para las dApp que registran su listener más tarde.
 * 3. `detail` exacto: `{ info: { uuid, name, icon, rdns }, provider: window.truekeate }`.
 *
 * El `icon` es un data-URI PNG del isologo de 96 px servido desde el propio paquete. Se
 * carga en segundo plano con `chrome.runtime.getURL('brand/truekeate-mark-96.png')` y, al
 * estar listo, se RE-ANUNCIA con el icono (el primer anuncio nunca espera a la red: la
 * identidad del provider debe existir de forma síncrona).
 */

import { PROVIDER_RDNS, PROVIDER_UUID } from '../shared/constants';
import type { Eip6963ProviderDetail, TruekeateProvider } from '../shared/types';
import { PROVIDER_ICON_DATA_URI } from './icon-data';
import { providerInfo } from './provider';

/** Nombre de los dos eventos del protocolo EIP-6963. */
export const EIP6963_REQUEST_EVENT = 'eip6963:requestProvider' as const;
export const EIP6963_ANNOUNCE_EVENT = 'eip6963:announceProvider' as const;

/** Ruta del isologo dentro del paquete (solo informativa: el icono va incrustado). */
export const PROVIDER_ICON_PATH = 'brand/truekeate-mark-96.png' as const;

/**
 * Icono del proveedor como data-URI PNG, **incrustado en el bundle en tiempo de compilación**
 * por `scripts/generate-icon-data.mjs` a partir de `public/brand/truekeate-mark-96.png`.
 *
 * Se incrusta en lugar de descargarse porque: (a) RT-03 prohíbe `fetch` en el código propio; y
 * (b) el anuncio EIP-6963 debe ser **síncrono**, ninguna dApp puede esperar a la red ni a una
 * promesa para descubrir el proveedor.
 */
let cachedIcon = PROVIDER_ICON_DATA_URI;

/** Devuelve el isologo como data-URI: ya está disponible de forma síncrona. */
export const loadProviderIcon = async (): Promise<string> => cachedIcon;

/**
 * Instala el anuncio EIP-6963. DEBE invocarse de forma SÍNCRONA en `document_start`.
 *
 * @param provider Instancia única publicada en `window.truekeate`.
 * @param onAnnounce Aviso opcional en cada anuncio; permite al puente con el content script
 *   reenviar el `detail` ya con el icono cargado.
 */
export const installEip6963Announce = (
  provider: TruekeateProvider,
  onAnnounce?: (detail: Eip6963ProviderDetail) => void,
): void => {
  let icon = cachedIcon;

  const announce = (): void => {
    const detail: Eip6963ProviderDetail = { info: providerInfo(icon), provider };
    try {
      window.dispatchEvent(new CustomEvent<Eip6963ProviderDetail>(EIP6963_ANNOUNCE_EVENT, { detail }));
    } catch {
      // Entorno sin `CustomEvent`: nada que anunciar.
    }
    onAnnounce?.(detail);
  };

  // 1. Listener SÍNCRONO, antes de cualquier anuncio y sin `await`.
  window.addEventListener(EIP6963_REQUEST_EVENT, () => {
    announce();
  });

  // 2a. Auto-anuncio al cargar `inject.js`.
  announce();

  // 2c. Re-anuncio en `DOMContentLoaded` (si aún no ha ocurrido).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      announce();
    });
  } else {
    // El documento ya estaba cargado: se re-anuncia en el siguiente turno del bucle.
    queueMicrotask(announce);
  }

  // El icono va incrustado en el bundle, así que el primer anuncio ya lo incluye: no hay
  // ninguna carga en segundo plano ni re-anuncio diferido (RT-03 y anuncio síncrono).
};

/** Datos de identidad del provider, exportados para las pruebas y `test.html`. */
export const providerIdentity = {
  name: 'TrueKeate',
  rdns: PROVIDER_RDNS,
  uuid: PROVIDER_UUID,
} as const;
