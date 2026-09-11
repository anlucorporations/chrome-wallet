/**
 * M21 — `src/background/security/accessLevel.ts`
 * Aislamiento del almacén: `chrome.storage.local.setAccessLevel({ accessLevel:
 * 'TRUSTED_CONTEXTS' })` en CADA arranque del Service Worker.
 *
 * Motivo (RNF-09, RNF-10, H-32): con el nivel por defecto, un content script inyectado en
 * una página podría leer `truekeate_mnemonic` y las claves privadas del almacén. El nivel
 * TRUSTED_CONTEXTS deja fuera de lectura a los content scripts y mantiene el acceso al
 * Service Worker y a las páginas de la extensión (popup, connect y notification).
 *
 * El permiso `storage` ya está declarado en el manifest; esta llamada no añade ninguno.
 */

/** Nivel de acceso exigido por la especificación (valor literal, no configurable). */
export const TRUSTED_CONTEXTS = 'TRUSTED_CONTEXTS' as const;

/** Alias del literal de la API, para las aserciones de las pruebas. */
export const ACCESS_LEVEL_TRUSTED_CONTEXTS = TRUSTED_CONTEXTS;

/** Superficie mínima de `chrome.storage.local` que usa este módulo. */
export interface StorageLocalAccessLevelApi {
  setAccessLevel(accessLevel: { accessLevel: string }): Promise<void>;
}

/** Superficie mínima de `chrome.storage` que usa este módulo. */
export interface StorageAccessLevelApi {
  local: StorageLocalAccessLevelApi;
}

/** Superficie mínima de `chrome` que usa este módulo. */
export interface ChromeAccessLevelApi {
  storage: StorageAccessLevelApi;
}

/**
 * ¿Está disponible la API `setAccessLevel`? Chrome la incorporó en la versión 102; el
 * proyecto exige `minimum_chrome_version: '114'`, así que en el navegador siempre existe,
 * pero el stub de Vitest puede no implementarla y el SW debe seguir operativo.
 */
export const hasSetAccessLevel = (api: ChromeAccessLevelApi | undefined = chromeApi()): boolean => {
  const local: unknown = api?.storage?.local;
  if (typeof local !== 'object' || local === null) {
    return false;
  }
  return typeof (local as { setAccessLevel?: unknown }).setAccessLevel === 'function';
};

/** Devuelve `chrome` sin `any`, o `undefined` cuando no existe (jsdom sin stub). */
function chromeApi(): ChromeAccessLevelApi | undefined {
  const candidate: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }
  return candidate as ChromeAccessLevelApi;
}

/**
 * Aplica el nivel de acceso TRUSTED_CONTEXTS al almacén local. Se invoca en `onInstalled`
 * y en `onStartup`, y también en cada arranque ordinario del SW (es idempotente).
 *
 * No lanza: un fallo de la API se reporta como `false` para que el arranque del SW no se
 * interrumpa (el error queda visible por el valor devuelto y por consola).
 */
export const applyStorageAccessLevel = async (): Promise<boolean> => {
  const api = chromeApi();
  if (!hasSetAccessLevel(api) || api === undefined) {
    // Entorno sin la API (stub de pruebas): no es un error del producto.
    return false;
  }
  try {
    await api.storage.local.setAccessLevel({ accessLevel: TRUSTED_CONTEXTS });
    return true;
  } catch (error) {
    // Se registra sin romper el arranque; el nivel por defecto sigue siendo el de Chrome.
    console.warn('[truekeate] no se pudo aplicar setAccessLevel(TRUSTED_CONTEXTS)', error);
    return false;
  }
};
