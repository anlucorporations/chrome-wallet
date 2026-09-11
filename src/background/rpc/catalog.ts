/**
 * M4 — `src/background/rpc/catalog.ts`
 * Catálogo RPC del Service Worker: CERRADO y, en H1, VACÍO.
 *
 * Estado de H1 (andamiaje): la estructura del catálogo existe para que el router (M3)
 * pueda consultarla, pero **ningún método está implementado**: toda llamada responde
 * `4200 Unsupported method`. La implementación por método llega en H3 (lecturas), H4
 * (firma y transacciones) y H5 (redes y observabilidad).
 *
 * Reglas que ya se respetan desde el esqueleto:
 * - `eth_sign` NO está en el catálogo y nunca se añadirá (DEC-22 / H-11a): responde `4200`.
 * - El catálogo es la fuente del «método fuera del catálogo → `4200`» del router.
 * - `supportedMethods` (implementados) es un subconjunto de `CATALOG_METHODS` (declarados).
 */

import type {
  ApprovalMethod,
  InternalMethod,
  PageMethod,
  WalletMethod,
} from '../../shared/types';

/** Familia del método, según el contexto que puede invocarlo. */
export type CatalogMethodKind = 'read' | 'approval' | 'internal';

/** Contexto desde el que el método es invocable. */
export type CatalogContext = 'page' | 'extension';

/** Definición de un método del catálogo. */
export interface CatalogEntry {
  method: WalletMethod;
  kind: CatalogMethodKind;
  context: CatalogContext;
  /** `true` cuando el método abre la ventana única de confirmación (P-21). */
  requiresApproval: boolean;
  /** `true` cuando su implementación vive ya en el Service Worker. */
  implemented: boolean;
}

// ---------------------------------------------------------------------------
// Declaración de los métodos del catálogo (diccionario_datos.md §4.3)
// ---------------------------------------------------------------------------

/** Métodos de lectura de página (`kind: 'read'`). */
export const PAGE_READ_METHODS = [
  'eth_requestAccounts',
  'eth_accounts',
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_feeHistory',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
] as const satisfies readonly PageMethod[];

/** Métodos aprobables de página: los 6 de `ApprovalMethod` (sin `eth_sign`). */
export const PAGE_APPROVAL_METHODS = [
  'eth_sendTransaction',
  'eth_signTypedData_v4',
  'personal_sign',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_revokePermissions',
] as const satisfies readonly ApprovalMethod[];

/** Métodos internos `wallet_*`: solo desde contextos de la extensión. */
export const INTERNAL_METHODS = [
  'wallet_generateMnemonic',
  'wallet_importMnemonic',
  'wallet_deriveAccounts',
  'wallet_importPrivateKey',
  'wallet_getNetworks',
  'wallet_getLogs',
  'wallet_revealSecret',
] as const satisfies readonly InternalMethod[];

/** Métodos DECLARADOS por el catálogo. `eth_sign` no aparece (DEC-22 / H-11a). */
export const CATALOG_METHODS: readonly WalletMethod[] = [
  ...PAGE_READ_METHODS,
  ...PAGE_APPROVAL_METHODS,
  ...INTERNAL_METHODS,
];

/** Métodos IMPLEMENTADOS hoy. En H1 el catálogo está vacío: todo responde `4200`. */
export const supportedMethods: readonly WalletMethod[] = Object.freeze([]);

/** ¿Está el método declarado en el catálogo (aunque aún no implementado)? */
export const isCatalogMethod = (method: string): method is WalletMethod =>
  (CATALOG_METHODS as readonly string[]).includes(method);

/** ¿Está el método declarado Y implementado? En H1 siempre devuelve `false`. */
export const isSupportedMethod = (method: string): method is WalletMethod =>
  (supportedMethods as readonly string[]).includes(method);

/** ¿Está `eth_sign` presente en algún punto del catálogo? Debe ser SIEMPRE `false`. */
export const exposesEthSign = (): boolean =>
  (CATALOG_METHODS as readonly string[]).includes('eth_sign');

/**
 * Mapa de métodos implementados. En H1 está VACÍO a propósito: es la estructura que el
 * router consulta y la que cada hito irá rellenando sin cambiar su forma.
 */
export const CATALOG: Readonly<Partial<Record<WalletMethod, CatalogEntry>>> = Object.freeze(
  {} as Partial<Record<WalletMethod, CatalogEntry>>,
);

/** Devuelve la entrada del catálogo o `undefined` (y entonces el router responde `4200`). */
export const getCatalogEntry = (method: string): CatalogEntry | undefined =>
  isSupportedMethod(method) ? CATALOG[method] : undefined;
