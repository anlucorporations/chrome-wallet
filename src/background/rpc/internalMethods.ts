/**
 * M4.a — `src/background/rpc/internalMethods.ts`
 * Lista CERRADA de los métodos internos `wallet_*` del contrato `documento_tecnico.md` §5.1.1
 * (v1.7), en un módulo **HOJA**: su única importación es un `import type`, que el compilador
 * borra, así que este módulo NO depende de ningún otro en tiempo de ejecución.
 *
 * POR QUÉ ES UN MÓDULO PROPIO (D-H3-C)
 * Antes, esta lista vivía en `rpc/catalog.ts` y `security/senderGuard.ts` la capturaba al evaluar
 * su propio módulo (`INTERNAL_METHOD_NAMES = INTERNAL_METHODS`). Eso cerraba el ciclo
 * `catalog → sessions → senderGuard → catalog`: si `catalog` se evaluaba primero, la captura veía
 * `undefined` y `isInternalMethodName` lanzaba
 * `TypeError: Cannot read properties of undefined (reading 'includes')`, de modo que el router
 * respondía `-32603` a CUALQUIER petición. Con la lista en un módulo hoja no hay ciclo que
 * resolver: la constante está inicializada antes que la de cualquier importador, sea cual sea el
 * orden de importación de `catalog`, `connections`, `sessions` o `senderGuard`.
 *
 * La lista se mantiene como ÚNICA fuente: `catalog.ts` la importa y la REEXPORTA, de modo que los
 * consumidores históricos siguen encontrándola en el catálogo (M4) sin duplicar la declaración.
 *
 * `eth_sign` NO está ni estará en la lista (DEC-22 / H-11a): responde `4200`.
 */

import type { InternalMethod } from '../../shared/types';

/** Métodos internos `wallet_*`: solo desde contextos de la extensión (§4.2 del diccionario). */
export const INTERNAL_METHODS = [
  // Contrato original de §5.1.1 (H2, tareas 2.1 a 2.5 y 2.9).
  'wallet_generateMnemonic',
  'wallet_importMnemonic',
  'wallet_deriveAccounts',
  'wallet_importPrivateKey',
  'wallet_getNetworks',
  'wallet_getLogs',
  'wallet_revealSecret',
  // Ampliación de la v1.6 de §5.1.1: estado y operaciones de UI (RNF-14).
  'wallet_getState',
  'wallet_setCurrentAccount',
  'wallet_addDerivedAccount',
  'wallet_renameAccount',
  'wallet_setAccountVisible',
  'wallet_deleteImportedAccount',
  'wallet_resetWallet',
  'wallet_acceptDevNotice',
  // Ampliación de la v1.7 de §5.1.1: entrega de la solicitud de conexión a `connect.html` (§2.9).
  'wallet_getConnectRequest',
] as const satisfies readonly InternalMethod[];
