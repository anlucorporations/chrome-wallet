/**
 * M36 — `src/inject/eip6963.ts`
 * Anuncio y RE-anuncio EIP-6963 del provider (H3, tarea 3.9).
 *
 * FUENTE NORMATIVA: `diccionario_datos.md` §4.1.1 (contrato EIP-6963, H-31/RF-44),
 * `documento_tecnico.md` §2.5.3 y §5.1, y `plan_desarrollo.md` §3.3.5 tarea 3.9 / §3.3.6
 * (`CA-RF-13`, `CA-RF-45`).
 *
 * Cumple, EN ESTE ORDEN:
 * 1. **Listener SÍNCRONO** de `eip6963:requestProvider`, registrado dentro del IIFE, ANTES de
 *    emitir el primer anuncio y sin ningún `await` previo (si se registra tarde, el anuncio se
 *    pierde).
 * 2. **Auto-anuncio** con `new CustomEvent('eip6963:announceProvider', { detail })`:
 *    (a) al cargar `inject.js`; (b) en **cada** `eip6963:requestProvider` recibido;
 *    (c) de nuevo en `DOMContentLoaded`, para las dApp que registran su listener más tarde.
 * 3. **`detail` exacto**: `{ info: { uuid, name, icon, rdns }, provider: window.truekeate }`, con
 *    `uuid` **literal y congelado** (`PROVIDER_UUID`, ADT-19/D-N: nunca se regenera, ni en el
 *    re-anuncio ni entre versiones) e `icon` como **data-URI PNG** del isologo de 96 px.
 *
 * El `icon` va **incrustado en el bundle** en tiempo de compilación
 * (`scripts/generate-icon-data.mjs` → `src/inject/icon-data.ts`): (a) RT-03 prohíbe `fetch` en el
 * código propio y (b) el anuncio EIP-6963 debe ser **síncrono**, ninguna dApp puede esperar a la
 * red ni a una promesa para descubrir el proveedor (RNF-20). Este módulo NO usa `chrome.*`: el
 * anuncio a la página es puro DOM y el saludo al content script lo hace M37.
 */

import { PROVIDER_RDNS, PROVIDER_UUID, PROVIDER_WINDOW_KEY } from '../shared/constants';
import type { Eip6963ProviderDetail, TruekeateProvider } from '../shared/types';
import { PROVIDER_ICON_DATA_URI } from './icon-data';
import { providerInfo } from './provider';

/** Nombre de los dos eventos del protocolo EIP-6963. */
export const EIP6963_REQUEST_EVENT = 'eip6963:requestProvider' as const;
export const EIP6963_ANNOUNCE_EVENT = 'eip6963:announceProvider' as const;

/** Ruta del isologo dentro del paquete (solo informativa: el icono va incrustado). */
export const PROVIDER_ICON_PATH = 'brand/truekeate-mark-96.png' as const;

/** Icono del proveedor como data-URI PNG, ya disponible de forma SÍNCRONA. */
const cachedIcon: string = PROVIDER_ICON_DATA_URI;

/** Devuelve el isologo como data-URI: está incrustado en el bundle, no hay E/S que esperar. */
export const loadProviderIcon = async (): Promise<string> => cachedIcon;

/**
 * Provider **ya publicado** en `window` (si lo está). El `detail` de §4.1.1 exige que
 * `provider` sea EL MISMO objeto que `window.truekeate`, así que se prefiere el publicado
 * (M37 lo define antes de instalar el anuncio) y solo se cae al argumento si la publicación
 * aún no ha ocurrido.
 */
const publishedProvider = (fallback: TruekeateProvider): TruekeateProvider => {
  const candidate: unknown = (window as unknown as Record<string, unknown>)[PROVIDER_WINDOW_KEY];
  if (typeof candidate !== 'object' || candidate === null) {
    return fallback;
  }
  const surface = candidate as Partial<TruekeateProvider>;
  return typeof surface.request === 'function' && typeof surface.on === 'function'
    ? (candidate as TruekeateProvider)
    : fallback;
};

/**
 * Instala el anuncio EIP-6963. DEBE invocarse de forma SÍNCRONA en `document_start`.
 *
 * @param provider Instancia única publicada en `window.truekeate`.
 * @param onAnnounce Aviso opcional en cada anuncio; permite al puente con el content script
 *   reenviar el `info` (M37) para que el relay conozca la identidad publicada.
 */
export const installEip6963Announce = (
  provider: TruekeateProvider,
  onAnnounce?: (detail: Eip6963ProviderDetail) => void,
): void => {
  const announce = (): void => {
    // `detail` NUEVO en cada anuncio: una dApp que lo mute no puede corromper el siguiente.
    const detail: Eip6963ProviderDetail = {
      info: providerInfo(cachedIcon),
      provider: publishedProvider(provider),
    };
    try {
      window.dispatchEvent(
        new CustomEvent<Eip6963ProviderDetail>(EIP6963_ANNOUNCE_EVENT, { detail }),
      );
    } catch {
      // Entorno sin `CustomEvent`: no hay nada que anunciar a la página.
    }
    onAnnounce?.(detail);
  };

  // 1. Listener SÍNCRONO, antes de cualquier anuncio y sin `await`.
  window.addEventListener(EIP6963_REQUEST_EVENT, () => {
    announce();
  });

  // 2a. Auto-anuncio al cargar `inject.js`.
  announce();

  // 2c. Re-anuncio en `DOMContentLoaded` (o en el turno siguiente si el documento ya cargó).
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        announce();
      },
      { once: true },
    );
  } else {
    queueMicrotask(announce);
  }
};

/** Datos de identidad del provider, exportados para las pruebas y `test.html`. */
export const providerIdentity = {
  name: 'TrueKeate',
  rdns: PROVIDER_RDNS,
  uuid: PROVIDER_UUID,
} as const;
