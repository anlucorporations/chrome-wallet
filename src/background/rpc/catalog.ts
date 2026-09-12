/**
 * M4 — `src/background/rpc/catalog.ts`
 * Catálogo RPC del Service Worker: CERRADO. Declara los métodos de las uniones cerradas
 * (`PageMethod`, `ApprovalMethod`, `InternalMethod`) y **registra los que ya están implementados**
 * —los **16** internos (15 de H2 más `wallet_getConnectRequest` de la v1.7) y las **10 lecturas de
 * página de H3**— con su metadato (nombre, contexto permitido y si pasa por la resolución de
 * página).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §5.1.1: contrato AUTORITATIVO de los **16** métodos internos `wallet_*`
 *   (parámetros, retorno LITERAL y errores) desde la v1.7 del documento. El mapa
 *   `InternalWalletResultMap` transcribe esa tabla sin abreviar ni añadir campos.
 * - `documento_tecnico.md` §2.5 (uniones cerradas) y `diccionario_datos.md` §4.2 (contextos
 *   permitidos por grupo de método) y §4.3 (métodos RPC soportados y catálogo de causas).
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. `eth_sign` NO está en el catálogo y NUNCA se añadirá (DEC-22 / H-11a): responde `4200`.
 * 2. Las **10 lecturas de página** están IMPLEMENTADAS en H3 (`implemented: true` y
 *    `resolve: true`): el router las despacha a `rpc/pageMethods.ts`, que es donde viven los
 *    manejadores. Ver `documento_tecnico.md` §3.2 y `plan_desarrollo.md` §3.3.5 tareas 3.2, 3.3
 *    y 3.7.
 * 3. Los **6 aprobables de página** están IMPLEMENTADOS desde H4 (`implemented: true`): el router
 *    los despacha a `approvals/dispatch.ts` (M19.b), que recorre la ruta completa —vista previa
 *    (M19) → cola (M14) → plazo (M15) → ventana única (M18) → decisión → firma (M11) y difusión
 *    (M7)—. Mientras el metadato decía `implemented: false`, `getCatalogEntry` devolvía `undefined`
 *    y el router respondía `4200` ANTES de llegar al despacho: eso es `D-H4-E1`, la causa medida de
 *    que la ventana de confirmación nunca se abriera (`waitForEvent("page") Timeout`).
 * 4. Los `wallet_*` internos son invocables SOLO desde contextos de la extensión; el metadato
 *    `context: 'extension'` es la fuente que el router consulta para responder `4200`
 *    (`methodNotAllowedInContext`) cuando la petición nace en una página.
 * 5. `wallet_revokePermissions` es el ÚNICO método con **doble contexto**: desde una página es un
 *    APROBABLE que recorre la ruta de M19.b (con `PendingRequest`); desde el popup es la
 *    **revocación de la tarea 3.11** (elimina el origen de `truekeate_connected_sites` y emite
 *    `accountsChanged []`) y NO abre ventana, porque el emisor es contexto de la extensión.
 * 6. Ningún método interno abre la ventana única (P-21): `requiresApproval` es `false` en los
 *    dieciséis. La aprobación del revelado es una **confirmación explícita dentro del propio
 *    contexto** (§5.1.1 regla (b) y §3.8), no una `PendingRequest`.
 *
 * CONTRATO CONSUMIDO (los 16 manejadores internos son delegaciones FINAS; la lógica de cartera vive
 * en los módulos de H2). Toda la dependencia se reúne en `defaultInternalDeps`:
 *   - M8  `../crypto/mnemonic` → `generateMnemonic(): string` (genera y NO persiste)
 *   - M28 `../accounts`        → `importWalletFromMnemonic(input)` · `deriveNextAccount()`
 *                                · `importAccountByPrivateKey(input, label?)`
 *                                · `getWalletStateView()` · `setCurrentAccount(ref)`
 *                                · `renameAccount(ref, label)` · `setAccountVisible(ref, visible)`
 *                                · `removeImportedAccount(ref)`
 *     Todas devuelven `AccountsResult<T>` (`{ok:true}&T | {ok:false; error}`), que el
 *     router DESEMPAQUETA: un `ok:false` se relanza como el error EIP-1193 de M6/M28.
 *     M28 es quien compone M9 (`deriveAccounts`) y M10 (`importPrivateKey`), de modo que el
 *     router no duplica ni la derivación HD ni el cómputo EIP-55 (RT-02).
 *   - M12 `../crypto/secrets`  → `resolveSecret(target, context)`: `RevealTarget` con la
 *     confirmación explícita, contexto de M20 y la guarda de sesión de dApp activa (`-32000`)
 *   - M13 `../crypto/integrity`→ `checkWalletIntegrity()`: estado de integridad de
 *     `wallet_getState` (RNF-22), incluido «wallet dañada».
 *   - M29 `../settings`        → `acceptDevNotice()` (RNF-23, aviso no descartable)
 *   - M33 `../state/schema`    → `readStorage` (lecturas de redes/`chainId` y logs) y
 *     `resetWallet({ confirm })` (RF-11 / §3.9), con sus guardas de estado.
 *   - M26 `../sessions` + M27 `../events` → revocación desde el popup (H3, tarea 3.11): el único
 *     manejador que NO es una lectura pura, porque además de borrar la sesión propaga el evento.
 *   - M26 `../sessions` (v1.7) → `listConnectedSites()`: `connectedSites` de `wallet_getState`.
 *   - M26.b `../connections` (v1.7) → `readConnectRequestView()`: solicitud de `connect.html`.
 *   - M26 `../sessions` + M27 `../events` (H3, cierre de `CA-RF-15`) → `applyActiveAccountToSessions()`
 *     y `emitAccountsChanged()`: el cambio de cuenta activa actualiza las sesiones VIGENTES
 *     (`D-H3-B`, opción (a)) y emite `accountsChanged` con la cuenta nueva a sus pestañas.
 */

import type {
  AccountRef,
  Address,
  ChainIdHex,
  ConnectedSiteView,
  ConnectRequestView,
  InternalMethod,
  LogEntry,
  ProviderEventName,
  StoredNetwork,
  TruekeateSettings,
  WalletMethod,
} from '../../shared/types';
import { DEFAULT_CHAIN_ID, logLimit } from '../../shared/constants';
import {
  STORAGE_KEYS,
  readStorage,
  resetWallet,
  type ResetWalletOptions,
  type ResetWalletOutcome,
} from '../state/schema';
import type { TrustedSenderContext } from '../security/senderGuard';
// M4.a (D-H3-C): la lista de los 16 internos vive en un módulo HOJA para que la guarda de emisor
// (M20) no dependa del orden de evaluación; aquí se importa y se REEXPORTA (una sola declaración).
import { INTERNAL_METHODS } from './internalMethods';
import { generateMnemonic } from '../crypto/mnemonic';
import { checkWalletIntegrity } from '../crypto/integrity';
import { resolveSecret } from '../crypto/secrets';
import type { RevealContextLike, RevealTarget, SecretResult } from '../crypto/secrets';
import {
  asWalletStateAccount,
  deriveNextAccount,
  getCurrentAddress,
  getWalletStateView,
  importAccountByPrivateKey,
  importWalletFromMnemonic,
  removeImportedAccount,
  renameAccount,
  setAccountVisible,
  setCurrentAccount,
} from '../accounts';
import type {
  AccountView,
  AccountsResult,
  WalletCreation,
  WalletStateAccount,
  WalletStateView,
} from '../accounts';
import { acceptDevNotice, type SettingsWriteResult } from '../settings';
import { defaultEventsDeps, emitAccountsChanged, emitProviderEvent } from '../events';
import {
  applyActiveAccountToSessions,
  readSessions,
  listConnectedSites,
  revokeSession,
} from '../sessions';
import { forgetPendingConnectsForOrigin, readConnectRequestView } from '../connections';
import {
  internalError,
  invalidAddressError,
  invalidLabelError,
  resetBlockedError,
  unsupportedMethodError,
  unknownAccountError,
  userRejectedError,
} from './errors';

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
] as const satisfies readonly WalletMethod[];

/** Métodos aprobables de página: los 6 de `ApprovalMethod` (sin `eth_sign`). */
export const PAGE_APPROVAL_METHODS = [
  'eth_sendTransaction',
  'eth_signTypedData_v4',
  'personal_sign',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_revokePermissions',
] as const satisfies readonly WalletMethod[];

/**
 * Métodos internos `wallet_*`: solo desde contextos de la extensión. La lista se DECLARA en el
 * módulo hoja `./internalMethods` (M4.a) y aquí se REEXPORTA, porque esa separación es la que
 * elimina el ciclo `catalog → sessions → senderGuard → catalog` que hacía frágil la guarda de
 * emisor según el orden de evaluación (defecto D-H3-C). Sigue habiendo UNA sola declaración.
 */
export { INTERNAL_METHODS };

/**
 * Los `wallet_*` que el POPUP puede invocar aunque sean aprobables desde una página. Hoy solo la
 * revocación de la tarea 3.11 (`CA-RF-26`): "Sitios conectados" → "Revocar" borra la sesión del
 * origen sin pasar por la cola de aprobaciones (el popup es contexto de la extensión).
 */
export const EXTENSION_INVOKABLE_INTERNAL_METHODS = [
  'wallet_revokePermissions',
] as const satisfies readonly WalletMethod[];

/** Métodos DECLARADOS por el catálogo. `eth_sign` no aparece (DEC-22 / H-11a). */
export const CATALOG_METHODS: readonly WalletMethod[] = [
  ...PAGE_READ_METHODS,
  ...PAGE_APPROVAL_METHODS,
  ...INTERNAL_METHODS,
];

// ---------------------------------------------------------------------------
// Metadato por método
// ---------------------------------------------------------------------------

/** Familia del método, según el contexto que puede invocarlo. */
export type CatalogMethodKind = 'read' | 'approval' | 'internal';

/** Contexto desde el que el método es invocable. */
export type CatalogContext = 'page' | 'extension' | 'any';

/** Definición de un método del catálogo. */
export interface CatalogEntry {
  method: WalletMethod;
  kind: CatalogMethodKind;
  context: CatalogContext;
  /** `true` cuando el método abre la ventana única de confirmación (P-21). */
  requiresApproval: boolean;
  /** `true` cuando su implementación vive ya en el Service Worker. */
  implemented: boolean;
  /**
   * `true` cuando el router debe construir el contexto de página y despachar por
   * `rpc/pageMethods.ts` (los 10 métodos de lectura de H3). Los internos van a `false`.
   */
  resolve: boolean;
}

/** Entradas de los 16 internos: implementados y solo desde contextos de la extensión. */
const INTERNAL_ENTRIES: Readonly<Record<InternalMethod, CatalogEntry>> = Object.freeze({
  wallet_generateMnemonic: {
    method: 'wallet_generateMnemonic',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_importMnemonic: {
    method: 'wallet_importMnemonic',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_deriveAccounts: {
    method: 'wallet_deriveAccounts',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_importPrivateKey: {
    method: 'wallet_importPrivateKey',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_getNetworks: {
    method: 'wallet_getNetworks',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_getLogs: {
    method: 'wallet_getLogs',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  // El revelado exige confirmación explícita, pero DENTRO del contexto de la extensión
  // (§5.1.1 regla (b) y §3.8): no abre `notification.html` ni crea `PendingRequest`.
  wallet_revealSecret: {
    method: 'wallet_revealSecret',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  // --- Ampliación de la v1.6 (§5.1.1): estado y operaciones de UI (RNF-14) ---
  // Los ocho son `context: 'extension'`: el popup es la única superficie que los invoca y el
  // router responde `4200 methodNotAllowedInContext` a cualquier emisor de página.
  wallet_getState: {
    method: 'wallet_getState',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_setCurrentAccount: {
    method: 'wallet_setCurrentAccount',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_addDerivedAccount: {
    method: 'wallet_addDerivedAccount',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_renameAccount: {
    method: 'wallet_renameAccount',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_setAccountVisible: {
    method: 'wallet_setAccountVisible',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_deleteImportedAccount: {
    method: 'wallet_deleteImportedAccount',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  // El reset exige `confirm: true`, pero la confirmación es el diálogo DESTRUCTIVO del popup
  // (§3.9 paso 3): no abre la ventana única ni crea `PendingRequest`.
  wallet_resetWallet: {
    method: 'wallet_resetWallet',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  wallet_acceptDevNotice: {
    method: 'wallet_acceptDevNotice',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
  // v1.7: entrega a `connect.html` de la solicitud `pending` de `truekeate_connect_request`
  // (§2.9). Es `context: 'extension'` porque la ventana de conexión es una página del paquete.
  wallet_getConnectRequest: {
    method: 'wallet_getConnectRequest',
    kind: 'internal',
    context: 'extension',
    requiresApproval: false,
    implemented: true,
    resolve: false,
  },
});

/**
 * Entradas de las 10 LECTURAS de página: IMPLEMENTADAS en H3 (`resolve: true`).
 *
 * `eth_accounts` y `eth_requestAccounts` son, además, los dos únicos métodos que consultan
 * `truekeate_connected_sites`; ninguno de los dos crea la sesión por sí mismo (`eth_accounts` no
 * abre NUNCA ventana y `eth_requestAccounts` solo la abre sin sesión vigente).
 */
const PAGE_READ_ENTRIES: Readonly<Record<string, CatalogEntry>> = Object.freeze(
  Object.fromEntries(
    PAGE_READ_METHODS.map((method) => [
      method,
      {
        method,
        kind: 'read' as const,
        context: 'any' as const,
        requiresApproval: false,
        implemented: true,
        resolve: true,
      },
    ]),
  ),
);

/**
 * Entradas de los 6 APROBABLES de página: declarados e IMPLEMENTADOS en H4 (`implemented: true`).
 * El router los despacha a `approvals/dispatch.ts` (M19.b) y es ahí donde se construye la vista
 * previa (M19), se da de alta la solicitud (M14) y se abre la ventana única (M18).
 */
const PAGE_APPROVAL_ENTRIES: Readonly<Record<string, CatalogEntry>> = Object.freeze(
  Object.fromEntries(
    PAGE_APPROVAL_METHODS.map((method) => [
      method,
      {
        method,
        kind: 'approval' as const,
        context: 'page' as const,
        requiresApproval: true,
        implemented: true,
        resolve: false,
      },
    ]),
  ),
);

/**
 * Entrada ESPECIAL de `wallet_revokePermissions`: es aprobable desde una página (ruta de M19.b con
 * `PendingRequest`) y, desde el popup, la revocación de la tarea 3.11. El contexto es `any` porque
 * ese doble uso es deliberado; la implementación real se registra abajo.
 */
const REVOKE_ENTRY: CatalogEntry = {
  method: 'wallet_revokePermissions',
  kind: 'approval',
  context: 'any',
  requiresApproval: true,
  implemented: true,
  resolve: false,
};

/**
 * Métodos IMPLEMENTADOS hoy: los 16 internos, las 10 lecturas de página (H3) y los 6 aprobables
 * (H4). `eth_sign` NO está: sigue fuera del catálogo (DEC-22 / H-11a) y responde `4200`.
 */
export const supportedMethods: readonly WalletMethod[] = Object.freeze([
  ...PAGE_READ_METHODS,
  ...PAGE_APPROVAL_METHODS,
  ...INTERNAL_METHODS,
]);

/** Mapa de métodos implementados: lo consulta el router (M3) antes de despachar. */
export const CATALOG: Readonly<Partial<Record<WalletMethod, CatalogEntry>>> = Object.freeze({
  ...PAGE_READ_ENTRIES,
  ...PAGE_APPROVAL_ENTRIES,
  ...INTERNAL_ENTRIES,
  wallet_revokePermissions: REVOKE_ENTRY,
});

/** ¿Está el método declarado en el catálogo (aunque aún no implementado)? */
export const isCatalogMethod = (method: string): method is WalletMethod =>
  (CATALOG_METHODS as readonly string[]).includes(method);

/** ¿Pertenece el método a la unión cerrada `InternalMethod` de §5.1.1? */
export const isInternalMethod = (method: string): method is InternalMethod =>
  (INTERNAL_METHODS as readonly string[]).includes(method);

/** ¿Es el método un público EIP-1193 (lectura o aprobable)? */
export const isPageMethod = (method: string): boolean =>
  (PAGE_READ_METHODS as readonly string[]).includes(method) ||
  (PAGE_APPROVAL_METHODS as readonly string[]).includes(method);

/** ¿Está el método declarado Y implementado? */
export const isSupportedMethod = (method: string): method is WalletMethod =>
  (supportedMethods as readonly string[]).includes(method);

/** ¿Pasa el método por la resolución de página (lecturas de H3)? */
export const requiresPageResolution = (method: string): boolean =>
  getCatalogEntry(method)?.resolve === true;

/** ¿Es `wallet_*` invocable desde el popup aunque sea aprobable desde una página? */
export const isExtensionInvokable = (method: string): boolean =>
  (EXTENSION_INVOKABLE_INTERNAL_METHODS as readonly string[]).includes(method);

/** ¿Está `eth_sign` presente en algún punto del catálogo? Debe ser SIEMPRE `false`. */
export const exposesEthSign = (): boolean =>
  (CATALOG_METHODS as readonly string[]).includes('eth_sign');

/**
 * Devuelve la entrada del catálogo SOLO si el método está declarado **e implementado**. Desde H4
 * TODOS los métodos declarados lo están (los 6 aprobables se despachan por M19.b); un `undefined`
 * solo puede venir de un método fuera del catálogo, que el router rechaza antes con `4200`.
 */
export const getCatalogEntry = (method: string): CatalogEntry | undefined =>
  isSupportedMethod(method) ? CATALOG[method] : undefined;

/** Entrada DECLARADA (aunque no esté implementada todavía); `undefined` fuera del catálogo. */
export const getDeclaredEntry = (method: string): CatalogEntry | undefined =>
  isCatalogMethod(method) ? CATALOG[method] : undefined;

// ---------------------------------------------------------------------------
// Contrato de retorno de §5.1.1 (transcripción literal)
// ---------------------------------------------------------------------------

/**
 * Retorno de cada método interno, copiado LITERALMENTE de `documento_tecnico.md` §5.1.1 (v1.7).
 * Es el contrato que el popup (M39/M40/M46) y `connect.html` (M48) consumen sin mirar la
 * implementación.
 */
export interface InternalWalletResultMap {
  /** No persiste nada: las 12 palabras se muestran y se descartan. */
  wallet_generateMnemonic: { mnemonic: string; wordCount: 12 };
  /** `-32602` si el checksum BIP-39 no es válido. */
  wallet_importMnemonic: { accounts: Address[]; currentAccount: AccountRef };
  /** Amplía `truekeate_accounts` con la siguiente cuenta derivada. */
  wallet_deriveAccounts: { accounts: Address[]; derivedAccountCount: number };
  /** `-32602` si la clave es inválida o la cuenta ya existe. */
  wallet_importPrivateKey: { account: Address; accountRef: AccountRef };
  wallet_getNetworks: { networks: StoredNetwork[]; activeChainId: ChainIdHex };
  wallet_getLogs: { entries: LogEntry[]; truncated: boolean; dropped: number };
  /** `-32000` (cuenta en uso por una dApp) si la guarda de sesión está activa. */
  wallet_revealSecret: { kind: 'mnemonic' | 'privateKey'; value: string; hideAfterMs: number };
  // --- Ampliación de la v1.6 de §5.1.1: estado y operaciones de UI ---
  /** Estado completo para la UI; `integrity` es de M13 (RNF-22). */
  wallet_getState: {
    hasWallet: boolean;
    integrity: WalletIntegrityView;
    accounts: WalletStateAccount[];
    currentAccountRef: AccountRef | null;
    networks: StoredNetwork[];
    currentChainId: ChainIdHex;
    settings: TruekeateSettings;
    /**
     * v1.7: sitios conectados de `truekeate_connected_sites` (§2.7) SIN secretos, con el origen
     * normalizado y `current` = sesión vigente. Es el dato que pinta «Sitios conectados» (M44).
     */
    connectedSites: ConnectedSiteView[];
  };
  /** `-32602` si `ref` no apunta a ninguna cuenta existente. */
  wallet_setCurrentAccount: { currentAccountRef: AccountRef };
  /** Deriva y PERSISTE la siguiente cuenta (RF-04, tarea 2.4). */
  wallet_addDerivedAccount: { account: WalletStateAccount; derivedAccountCount: number };
  /** `-32602 invalidLabel` si la etiqueta no tiene entre 1 y 32 caracteres. */
  wallet_renameAccount: { account: WalletStateAccount };
  /** Ocultar una derivada NO borra su derivación (RF-06). */
  wallet_setAccountVisible: { account: WalletStateAccount };
  /** `-32000` si una dApp tiene sesión vigente sobre la cuenta (R-09a / DEC-45). */
  wallet_deleteImportedAccount: { removed: Address; currentAccountRef: AccountRef | null };
  /** `-32000 resetBlocked` si la cola o una transacción en vuelo lo impiden (§3.9). */
  wallet_resetWallet: {
    status: 'done';
    /** Claves realmente eliminadas; `truekeate_logs` NO está entre ellas (RF-32). */
    removedKeys: readonly string[];
    preservedKeys: readonly string[];
  };
  /** Instante registrado de la aceptación del aviso (RNF-23). */
  wallet_acceptDevNotice: { devNoticeAcceptedAt: number | null };
  // --- Ampliación de la v1.7 de §5.1.1: entrega de la solicitud de conexión (§2.9) ---
  /** `4001` si el `requestId` no existe, ya se resolvió o ha vencido (sin ventana que abrir). */
  wallet_getConnectRequest: ConnectRequestView;
}

/**
 * Proyección de la integridad (M13) que viaja en `wallet_getState`. Se limitan los campos a los
 * que la UI necesita (RNF-22) y se descartan los detalles de dirección.
 */
export interface WalletIntegrityView {
  status: 'absent' | 'ok' | 'damaged';
  label: string | null;
  /** Mensajes de los avisos, en español; nunca material de la cartera. */
  problems: string[];
  /** ¿Hay frase semilla guardada? (habilita «Revelar frase semilla», RF-50). */
  mnemonicPresent: boolean;
  mnemonicValid: boolean;
  canDerive: boolean;
}

/** Retorno del método interno `M`, estrechado por la unión cerrada. */
export type InternalWalletResult<M extends InternalMethod> = InternalWalletResultMap[M];

// ---------------------------------------------------------------------------
// Contrato consumido de los módulos de H2 (M8/M12/M13/M28/M29/M33) y de H3 (M26/M27)
// ---------------------------------------------------------------------------

/** M8 — generación de la frase BIP-39 (128 bits de entropía), SIN persistirla. */
export interface MnemonicApi {
  generateMnemonic(): string;
}

/**
 * M28 — operaciones de cartera que el router despacha. Se declaran como subconjunto ESTRICTO
 * de las firmas reales de `accounts.ts` (el `storage` inyectable de M28 queda opcional), de
 * modo que el router no puede divergir de su contrato.
 */
export interface AccountsApi {
  importWalletFromMnemonic(
    input: unknown,
  ): Promise<AccountsResult<WalletCreation & { mnemonic: string }>>;
  deriveNextAccount(): Promise<
    AccountsResult<{ account: AccountView; accounts: Address[]; derivedAccountCount: number }>
  >;
  importAccountByPrivateKey(
    input: unknown,
    label?: unknown,
  ): Promise<AccountsResult<{ account: AccountView; accountRef: AccountRef }>>;
  /** Estado completo de cuentas y ajustes (`wallet_getState`). */
  getWalletStateView(): Promise<WalletStateView>;
  setCurrentAccount(ref: AccountRef): Promise<AccountsResult<{ currentAccount: AccountRef }>>;
  renameAccount(
    ref: AccountRef,
    label: unknown,
  ): Promise<AccountsResult<{ account: AccountView; label: string }>>;
  setAccountVisible(
    ref: AccountRef,
    visible: boolean,
  ): Promise<AccountsResult<{ account: AccountView }>>;
  removeImportedAccount(ref: AccountRef): Promise<
    AccountsResult<{ removed: Address; accounts: Address[]; currentAccount: AccountRef | null }>
  >;
}

/**
 * M12 — revelado del material de recuperación. Se declara con las firmas REALES de
 * `crypto/secrets.ts`: objetivo (`RevealTarget`, con la confirmación explícita), contexto ya
 * validado por M20 (`RevealContextLike`) y unión discriminada `SecretResult` que el router
 * desempaqueta relanzando su error EIP-1193.
 */
export interface SecretsApi {
  resolveSecret(target: RevealTarget, context: RevealContextLike): Promise<SecretResult>;
}

/** M13 — integridad al arrancar (RNF-22): la proyecta `wallet_getState`. */
export interface IntegrityApi {
  checkWalletIntegrity(): Promise<{
    status: WalletIntegrityView['status'];
    label: string | null;
    issues: readonly { code: string; message: string }[];
    mnemonicPresent: boolean;
    mnemonicValid: boolean;
    canDerive: boolean;
  }>;
}

/** M29 — aceptación del aviso del primer arranque (RNF-23), idempotente. */
export interface SettingsApi {
  acceptDevNotice(): Promise<SettingsWriteResult>;
}

/** M33 — reset con confirmación destructiva y guardas de §3.9 (RF-11). */
export interface ResetApi {
  resetWallet(options: ResetWalletOptions): Promise<ResetWalletOutcome>;
}

/**
 * M26/M27 — revocación desde el popup (H3, tarea 3.11). Es la única dependencia de H3 que añade
 * el despacho interno: leer la sesión del origen, borrarla y propagar `accountsChanged []`.
 */
export interface RevocationApi {
  /** Elimina el origen del mapa y devuelve las pestañas asociadas. */
  revokeSession(
    origin: string,
    options?: { storage?: unknown; tabId?: number | null },
  ): Promise<{ origin: string; revoked: boolean; tabIds: number[] } | null>;
  /** M27: propaga un evento del provider a las pestañas indicadas (o a todas). */
  emitEvent(
    eventName: ProviderEventName,
    data: unknown,
    options?: { tabIds?: readonly number[] },
  ): Promise<number>;
  /** Descarta las solicitudes de conexión pendientes de ese origen (M26.b). */
  forgetPendingForOrigin(origin: string): void;
  /**
   * M26 (v1.7): sesiones persistidas en la forma canónica de la UI (`ConnectedSiteView`), con el
   * origen normalizado y SIN secretos. Es la fuente de `wallet_getState.connectedSites`.
   */
  listSessions(): Promise<ConnectedSiteView[]>;
}

/**
 * M26.b — entrega de la solicitud de conexión a `connect.html` (v1.7). `connect.html` es una
 * ventana de la extensión y tiene prohibido leer `truekeate_connect_request` (RNF-14): el SW le
 * publica la solicitud completa por el canal interno, que es el mecanismo que ya existe entre el
 * popup y el Service Worker.
 */
export interface ConnectRequestApi {
  /** La solicitud `pending` y vigente, o `null` si no existe, ya se resolvió o venció. */
  getConnectRequest(requestId: string): Promise<ConnectRequestView | null>;
}

/**
 * M26/M27 — **cambio de la cuenta activa** desde el popup: el cierre de `CA-RF-15`
 * (defectos `D-H3-A` y `D-H3-B`).
 *
 * Semántica fijada (`D-H3-B`, opción (a), la de MetaMask): mientras una sesión por origen siga
 * vigente, la dApp comparte la cuenta ACTIVA del popup. Por eso, al cambiar de cuenta,
 * `handleSetCurrentAccount` persiste la referencia y después:
 *   1. actualiza `account` en cada sesión vigente de `truekeate_connected_sites` (M26), y
 *   2. emite `accountsChanged` con la cuenta NUEVA a las pestañas conectadas (M27),
 * de modo que `eth_accounts` y la caché `selectedAddress` de la dApp coinciden con el popup.
 *
 * Es una dependencia propia —y no parte de `RevocationApi`— porque su ciclo de vida es distinto:
 * la revocación BORRA la sesión y emite la lista VACÍA; este camino CONSERVA la sesión, cambia la
 * cuenta compartida y emite la cuenta nueva.
 */
export interface ActiveAccountSyncApi {
  /**
   * Propaga la cuenta activa ya persistida. Devuelve la dirección activa (`null` si la cartera no
   * tiene ninguna) y el resumen de lo propagado: orígenes cuya cuenta cambió y pestañas que
   * recibieron el evento. Nunca lanza por un fallo de entrega (una pestaña cerrada no rompe un
   * cambio de cuenta que ya está persistido).
   */
  syncActiveAccount(): Promise<{
    account: Address | null;
    origins: string[];
    tabIds: number[];
  }>;
}

/** Dependencias inyectables del despacho interno (costura única con los módulos de H2 y H3). */
export interface InternalHandlerDeps {
  readonly mnemonic: MnemonicApi;
  readonly accounts: AccountsApi;
  readonly secrets: SecretsApi;
  readonly integrity: IntegrityApi;
  readonly settings: SettingsApi;
  readonly state: ResetApi;
  readonly revocation: RevocationApi;
  readonly connections: ConnectRequestApi;
  /** M26/M27: propagación del cambio de cuenta activa (`CA-RF-15`). */
  readonly activeAccount: ActiveAccountSyncApi;
}

// ---------------------------------------------------------------------------
// Proyección del estado persistido (la LECTURA la ofrece M33; la escritura es de M28/M29)
// ---------------------------------------------------------------------------

/** ¿Es un objeto plano (registro) utilizable como mapa persistido? */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Proyecta `truekeate_networks` sin `any`, descartando entradas malformadas. */
const asNetworks = (value: unknown): StoredNetwork[] => {
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).filter(
    (entry): entry is StoredNetwork => isRecord(entry) && typeof entry.chainId === 'string',
  );
};

/** Proyecta `truekeate_chain_id`; si falta o es inválido se usa la red por defecto. */
const asChainId = (value: unknown): ChainIdHex => {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) {
    return value as ChainIdHex;
  }
  return DEFAULT_CHAIN_ID;
};

/** Proyecta `truekeate_logs` sin `any`. */
const asLogEntries = (value: unknown): LogEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is LogEntry => isRecord(entry) && typeof entry.event === 'string',
  );
};

/**
 * Desempaqueta el `AccountsResult` de M28: un `ok: false` se RELANZA con su error EIP-1193
 * (M6), que el router reconoce y devuelve tal cual sin inventar ningún mensaje.
 */
const unwrapAccounts = <T>(result: AccountsResult<T>): T => {
  if (!result.ok) {
    throw result.error;
  }
  return result;
};

// ---------------------------------------------------------------------------
// Auxiliares de los parámetros con nombre (`params[0]` es un objeto)
// ---------------------------------------------------------------------------

/**
 * Los métodos añadidos en la v1.6 reciben UN objeto con parámetros con nombre en `params[0]`
 * (`{ ref }`, `{ ref, label }`, `{ address }`, `{ confirm: true }`). Un `params[0]` que no sea
 * objeto es una petición malformada: se responde `-32603` sin inventar literales de uso.
 */
const asPayload = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw internalError({ reason: 'malformed-params' });
  }
  return value;
};

/**
 * Interpreta `params[0].ref`. Se aceptan las formas canónicas `idx:<n>` e `imp:<address>` y la
 * heredada sin prefijo (`"0"`), que M28 normaliza. Una referencia que no tiene forma de
 * referencia de cuenta NO se puede resolver: `-32602 unknownAccount`.
 */
const asAccountRef = (value: unknown): AccountRef => {
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('idx:') || text.startsWith('imp:') || /^\d+$/.test(text)) {
      return text as AccountRef;
    }
  }
  throw unknownAccountError({ reason: 'invalid-ref', ref: value });
};

/** Interpreta `params[0].address`: `0x` + 40 hex; si no, `-32602 invalidAddress`. */
const asImportedAddress = (value: unknown): Address => {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value.trim())) {
    return value.trim() as Address;
  }
  throw invalidAddressError();
};

/** Interpreta `params[0].visible`: booleano obligatorio. */
const asBoolean = (value: unknown, reason: string): boolean => {
  if (typeof value !== 'boolean') {
    throw internalError({ reason });
  }
  return value;
};

// ---------------------------------------------------------------------------
// Manejadores de los 16 métodos internos (§5.1.1, contrato v1.7)
// ---------------------------------------------------------------------------

/** Firma común de un manejador interno. */
export type InternalHandler = (
  params: unknown[],
  context: TrustedSenderContext,
  deps: InternalHandlerDeps,
) => Promise<unknown>;

/**
 * `wallet_generateMnemonic` (RF-01): genera 12 palabras BIP-39 y **no persiste nada**; el
 * popup las muestra una vez y, si el usuario confirma, llama a `wallet_importMnemonic`.
 */
const handleGenerateMnemonic: InternalHandler = async (_params, _context, deps) => {
  const mnemonic = deps.mnemonic.generateMnemonic();
  return { mnemonic, wordCount: 12 } satisfies InternalWalletResultMap['wallet_generateMnemonic'];
};

/**
 * `wallet_importMnemonic` (RF-02): M28 normaliza espacios y mayúsculas, comprueba el checksum
 * BIP-39 (`-32602` si falla), deriva las cuentas `m/44'/60'/0'/0/i` y deja la 0 como activa.
 * Parámetros: `[mnemonic: string]`.
 */
const handleImportMnemonic: InternalHandler = async (params, _context, deps) => {
  const wallet = unwrapAccounts(await deps.accounts.importWalletFromMnemonic(params[0]));
  return {
    accounts: wallet.accounts,
    currentAccount: wallet.currentAccount,
  } satisfies InternalWalletResultMap['wallet_importMnemonic'];
};

/**
 * `wallet_deriveAccounts` (RF-04): «Añadir cuenta» deriva la SIGUIENTE cuenta BIP-44 y la
 * persiste. No instrumenta `account_imported` (ACU-04): la derivación no es una importación.
 */
const handleDeriveAccounts: InternalHandler = async (_params, _context, deps) => {
  const wallet = unwrapAccounts(await deps.accounts.deriveNextAccount());
  return {
    accounts: wallet.accounts,
    derivedAccountCount: wallet.derivedAccountCount,
  } satisfies InternalWalletResultMap['wallet_deriveAccounts'];
};

/**
 * `wallet_importPrivateKey` (RF-05): `0x` + 64 hex en el rango de secp256k1; la repetición
 * responde `-32602`. Parámetros: `[privateKey: string, label?: string]`.
 *
 * M28 valida la clave con M10, calcula la dirección con checksum EIP-55 y persiste la entrada
 * marcada como importada; el router no duplica ninguna de esas reglas.
 */
const handleImportPrivateKey: InternalHandler = async (params, _context, deps) => {
  const imported = unwrapAccounts(
    await deps.accounts.importAccountByPrivateKey(params[0], params[1]),
  );
  return {
    account: imported.account.address,
    accountRef: imported.accountRef,
  } satisfies InternalWalletResultMap['wallet_importPrivateKey'];
};

/** `wallet_getNetworks` (RF-23): redes dadas de alta y `chainId` activo. */
const handleGetNetworks: InternalHandler = async () => {
  const stored = await readStorage([STORAGE_KEYS.networks, STORAGE_KEYS.chainId]);
  return {
    networks: asNetworks(stored[STORAGE_KEYS.networks]),
    activeChainId: asChainId(stored[STORAGE_KEYS.chainId]),
  } satisfies InternalWalletResultMap['wallet_getNetworks'];
};

/**
 * `wallet_getLogs` (RF-28): entradas retenidas (FIFO por `ts`, `logLimit` global) más el
 * descarte VISIBLE que exige la regla (d) de §5.1.1: `truncated` indica que hubo recorte y
 * `dropped` cuántas entradas se descartaron.
 */
const handleGetLogs: InternalHandler = async () => {
  const stored = await readStorage([STORAGE_KEYS.logs]);
  const all = asLogEntries(stored[STORAGE_KEYS.logs]);
  const retained = all.length > logLimit ? all.slice(all.length - logLimit) : all;
  return {
    entries: retained,
    truncated: retained.length !== all.length,
    dropped: all.length - retained.length,
  } satisfies InternalWalletResultMap['wallet_getLogs'];
};

/**
 * Estrecha el parámetro único del revelado, `[{ kind, accountRef?, confirmed? }]`, hasta el
 * `RevealTarget` de M12. Un `kind` que no pertenezca al contrato es una petición malformada
 * (fallo interno), NO un error de uso: el diccionario §4.3 no registra causa para ello.
 *
 * `confirmed` solo vale `true` si el mensaje lo declara: la confirmación explícita la aporta la
 * UI (§3.8 regla 1) y es M12 quien la exige, respondiendo `4001` si falta.
 */
const asRevealTarget = (value: unknown): RevealTarget | null => {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value.kind;
  if (kind !== 'mnemonic' && kind !== 'privateKey') {
    return null;
  }
  const rawRef = value.accountRef;
  const accountRef: AccountRef | null =
    typeof rawRef === 'string' && (rawRef.startsWith('idx:') || rawRef.startsWith('imp:'))
      ? (rawRef as AccountRef)
      : null;
  return { kind, accountRef, confirmed: value.confirmed === true };
};

/**
 * `wallet_revealSecret` (RF-50): entrega el mnemonic o la clave privada SOLO a un contexto de
 * la extensión, tras la confirmación explícita de la UI y con la guarda de sesión de dApp
 * activa. Parámetros: `[{ kind, accountRef?, confirmed }]`.
 *
 * El valor NUNCA se registra ni viaja por `window.postMessage`: la página recibe `4200` en la
 * guarda de contexto antes de llegar aquí (RNF-09), y M12 vuelve a comprobar el contexto.
 */
const handleRevealSecret: InternalHandler = async (params, context, deps) => {
  const target = asRevealTarget(params[0]);
  if (target === null) {
    throw internalError({ reason: 'invalid-reveal-request' });
  }
  const result = await deps.secrets.resolveSecret(target, {
    isExtensionContext: context.isExtensionContext,
    route: context.route,
    tabId: context.tabId,
  });
  if (!result.ok) {
    throw result.error;
  }
  return {
    kind: result.secret.kind,
    value: result.secret.value,
    hideAfterMs: result.secret.hideAfterMs,
  } satisfies InternalWalletResultMap['wallet_revealSecret'];
};

// ---------------------------------------------------------------------------
// Manejadores de los métodos añadidos en la v1.6: estado y operaciones de UI
// ---------------------------------------------------------------------------

/**
 * `wallet_getState` (contrato v1.6, ampliado en la v1.7): estado COMPLETO que el popup necesita
 * para pintarse, de modo que la UI no toque el almacén (RNF-14). Reúne, sin duplicar lógica:
 * - M28 (`getWalletStateView`): cartera, cuentas con `visible`/`current`, activa y ajustes;
 * - M13 (`checkWalletIntegrity`): integridad y presencia de la frase (RNF-22);
 * - M33 (`readStorage`): redes dadas de alta y `chainId` activo;
 * - M26 (`listSessions`, v1.7): `connectedSites` —los sitios de `truekeate_connected_sites` en la
 *   forma canónica de §2.7, con el origen normalizado, `current` = sesión vigente y **sin
 *   secretos**—, que es lo que pinta «Sitios conectados» (M44).
 */
const handleGetState: InternalHandler = async (_params, _context, deps) => {
  const view = await deps.accounts.getWalletStateView();
  const integrity = await deps.integrity.checkWalletIntegrity();
  const stored = await readStorage([STORAGE_KEYS.networks, STORAGE_KEYS.chainId]);
  const connectedSites = await deps.revocation.listSessions();
  return {
    hasWallet: view.hasWallet,
    integrity: {
      status: integrity.status,
      label: integrity.label,
      problems: integrity.issues.map((issue) => issue.message),
      mnemonicPresent: integrity.mnemonicPresent,
      mnemonicValid: integrity.mnemonicValid,
      canDerive: integrity.canDerive,
    },
    accounts: view.accounts,
    currentAccountRef: view.currentAccountRef,
    networks: asNetworks(stored[STORAGE_KEYS.networks]),
    currentChainId: asChainId(stored[STORAGE_KEYS.chainId]),
    settings: view.settings,
    connectedSites,
  } satisfies InternalWalletResultMap['wallet_getState'];
};

/**
 * `wallet_getConnectRequest` (contrato v1.7): entrega a la ventana `connect.html` la solicitud
 * `pending` de `truekeate_connect_request` (§2.9) en la forma `ConnectRequestView` —`requestId`,
 * `origin` normalizado, `accounts` en el orden canónico, `currentAccountIndex`, `chainId` y
 * `expiresAt`—, de modo que la ventana NO lee el almacén (RNF-14) y calcula su `accountIndex`
 * sobre la MISMA lista que el SW validará.
 *
 * Parámetros: `[{ requestId }]`. Si el identificador falta, no existe, ya se resolvió o ha
 * vencido, se responde `4001` (la causa ya registrada para una conexión cancelada o vencida,
 * `diccionario_datos.md` §4.3) sin abrir ninguna ventana ni tocar el almacén: la ventana pinta
 * ese error y deja «Conectar» deshabilitado.
 */
const handleGetConnectRequest: InternalHandler = async (params, _context, deps) => {
  const payload = asPayload(params[0]);
  const requestId = payload.requestId;
  if (typeof requestId !== 'string' || requestId.trim().length === 0) {
    throw userRejectedError({ reason: 'unknown-connect-request' });
  }
  const request = await deps.connections.getConnectRequest(requestId);
  if (request === null) {
    throw userRejectedError({ reason: 'connect-request-unavailable' });
  }
  return request satisfies InternalWalletResultMap['wallet_getConnectRequest'];
};

/**
 * `wallet_setCurrentAccount`: fija la cuenta activa (`truekeate_current_account`) **y la propaga a
 * las dApps conectadas** (`CA-RF-15`, cierre de `D-H3-A`/`D-H3-B`).
 *
 * Parámetros: `[{ ref }]`. Referencia inexistente → `-32602 unknownAccount`.
 *
 * ORDEN (deliberado): primero PERSISTE la referencia con M28 —si la referencia no existe, la
 * operación falla sin tocar nada más— y solo después propaga. La propagación es BEST-EFFORT: una
 * pestaña cerrada o sin content script no puede convertir un cambio de cuenta ya persistido en un
 * error para el popup, así que un fallo de entrega se avisa por consola y la respuesta sigue
 * siendo `{ currentAccountRef }` (§5.1.1). Los únicos eventos que este flujo produce son
 * `accountsChanged` con la cuenta nueva (M27); **no** se emite `connect` (la sesión ya existía y no
 * se ha vuelto a autorizar), ni `disconnect` (la sesión sigue viva), ni `message` (ningún método lo
 * produce en H3).
 */
const handleSetCurrentAccount: InternalHandler = async (params, _context, deps) => {
  const payload = asPayload(params[0]);
  const result = unwrapAccounts(await deps.accounts.setCurrentAccount(asAccountRef(payload.ref)));
  try {
    await deps.activeAccount.syncActiveAccount();
  } catch (error) {
    console.warn('[truekeate] no se pudo propagar el cambio de cuenta activa', error);
  }
  return {
    currentAccountRef: result.currentAccount,
  } satisfies InternalWalletResultMap['wallet_setCurrentAccount'];
};

/**
 * `wallet_addDerivedAccount` (RF-04, tarea 2.4): deriva y PERSISTE la siguiente cuenta
 * BIP-44 con M28 (`deriveNextAccount`, que amplía `truekeate_accounts` y
 * `truekeate_settings.derivedAccountCount`). Sin cartera → `-32000 walletNotCreated`.
 * Parámetros: `[]`.
 */
const handleAddDerivedAccount: InternalHandler = async (_params, _context, deps) => {
  const result = unwrapAccounts(await deps.accounts.deriveNextAccount());
  return {
    account: asWalletStateAccount(result.account, null),
    derivedAccountCount: result.derivedAccountCount,
  } satisfies InternalWalletResultMap['wallet_addDerivedAccount'];
};

/**
 * `wallet_renameAccount` (RF-06 / DEC-35): etiquetas de derivadas en
 * `truekeate_settings.accountLabels` y de importadas en su `label` (M28). Parámetros:
 * `[{ ref, label }]`. Etiqueta fuera de 1..32 → `-32602 invalidLabel`.
 */
const handleRenameAccount: InternalHandler = async (params, _context, deps) => {
  const payload = asPayload(params[0]);
  const label = payload.label;
  if (typeof label !== 'string') {
    throw invalidLabelError({ reason: 'invalid-label', problem: 'empty' });
  }
  const result = unwrapAccounts(
    await deps.accounts.renameAccount(asAccountRef(payload.ref), label),
  );
  return {
    account: asWalletStateAccount(result.account, null),
  } satisfies InternalWalletResultMap['wallet_renameAccount'];
};

/**
 * `wallet_setAccountVisible` (RF-06): oculta o vuelve a mostrar una cuenta. Las derivadas se
 * ocultan por índice en `truekeate_settings.hiddenAccounts` (nunca se eliminan); las
 * importadas, con su campo `visible`. Parámetros: `[{ ref, visible }]`.
 */
const handleSetAccountVisible: InternalHandler = async (params, _context, deps) => {
  const payload = asPayload(params[0]);
  const visible = asBoolean(payload.visible, 'invalid-visible');
  const result = unwrapAccounts(
    await deps.accounts.setAccountVisible(asAccountRef(payload.ref), visible),
  );
  return {
    account: asWalletStateAccount(result.account, null),
  } satisfies InternalWalletResultMap['wallet_setAccountVisible'];
};

/**
 * `wallet_deleteImportedAccount` (RF-06 + R-09a / DEC-45): elimina una cuenta importada (y su
 * clave privada). Parámetros: `[{ address }]`. Si una dApp tiene sesión vigente sobre ella,
 * M28 responde `-32000 accountInUseByDapp` y **no** se borra nada.
 */
const handleDeleteImportedAccount: InternalHandler = async (params, _context, deps) => {
  const payload = asPayload(params[0]);
  const address = asImportedAddress(payload.address);
  const result = unwrapAccounts(
    await deps.accounts.removeImportedAccount(`imp:${address}` as AccountRef),
  );
  return {
    removed: result.removed,
    currentAccountRef: result.currentAccount,
  } satisfies InternalWalletResultMap['wallet_deleteImportedAccount'];
};

/**
 * `wallet_resetWallet` (RF-11 / §3.9): reset con confirmación destructiva explícita.
 * Parámetros: `[{ confirm: true }]`.
 *
 * ORDEN DE COMPROBACIÓN (CU-30 pasos 2 y 3, §3.9 pasos 1→4): las guardas de estado las aplica
 * **M33** (`resetWallet`), que comprueba PRIMERO la cola `pending` y la transacción en vuelo y
 * solo después la confirmación. Por eso este manejador NO cortocircuita cuando falta `confirm`:
 * una invocación con `{ confirm: false }` es la **consulta de guardas** que hace el popup al
 * pulsar «Reset wallet», y debe responder `-32000 resetBlocked` (con el literal de §4.3 y el
 * número de pendientes) si alguna guarda bloquea —sin abrir el diálogo destructivo y **sin
 * tocar el almacén**— o `4001` (cancelado) si las guardas están en verde, que es la señal de
 * que el diálogo puede abrirse. Con `{ confirm: true }` ejecuta la limpieza, que conserva
 * `truekeate_logs` (RF-32).
 */
const handleResetWallet: InternalHandler = async (params, _context, deps) => {
  const payload = asPayload(params[0]);
  const outcome = await deps.state.resetWallet({ confirm: payload.confirm === true });
  if (outcome.status === 'blocked') {
    throw outcome.error ?? resetBlockedError(outcome.pendingCount);
  }
  if (outcome.status === 'cancelled') {
    // §5.1.1: sin `confirm: true` la operación queda cancelada y NO se toca el almacén.
    throw userRejectedError({ reason: 'reset-not-confirmed' });
  }
  if (outcome.status !== 'done') {
    throw outcome.error ?? internalError({ reason: 'reset-failed', status: outcome.status });
  }
  return {
    status: outcome.status,
    removedKeys: outcome.removedKeys,
    preservedKeys: outcome.preservedKeys,
  } satisfies InternalWalletResultMap['wallet_resetWallet'];
};

/**
 * `wallet_acceptDevNotice` (RNF-23): registra el instante de aceptación del aviso del primer
 * arranque (idempotente: conserva el más antiguo). Parámetros: `[]`.
 */
const handleAcceptDevNotice: InternalHandler = async (_params, _context, deps) => {
  const written = await deps.settings.acceptDevNotice();
  if (!written.ok) {
    throw written.error;
  }
  return {
    devNoticeAcceptedAt: written.settings.devNoticeAcceptedAt ?? null,
  } satisfies InternalWalletResultMap['wallet_acceptDevNotice'];
};

/**
 * `wallet_revokePermissions` **desde el popup** (H3, tarea 3.11 / `CA-RF-26`): «Sitios
 * conectados» → «Revocar».
 *
 * - Elimina el origen de `truekeate_connected_sites` (M26): un `eth_accounts` posterior → `[]`.
 * - Emite `accountsChanged []` (M27) a las pestañas de ese origen; un `eth_accounts` posterior
 *   devuelve `[]`.
 * - **NO crea ninguna entrada en la cola de aprobaciones**: el emisor es contexto de la extensión.
 * - Descarta la solicitud de conexión pendiente de ese origen, si la hubiera.
 *
 * Parámetros: `[{ origin }]`. El origen se NORMALIZA siempre (minúsculas, sin barra final).
 */
const handleRevokePermissions: InternalHandler = async (params, _context, deps) => {
  const payload = asPayload(params[0]);
  const rawOrigin = payload.origin;
  if (typeof rawOrigin !== 'string' || rawOrigin.trim().length === 0) {
    throw internalError({ reason: 'invalid-revoke-origin' });
  }
  const revoked = await deps.revocation.revokeSession(rawOrigin);
  if (revoked === null) {
    throw internalError({ reason: 'invalid-revoke-origin' });
  }
  deps.revocation.forgetPendingForOrigin(revoked.origin);
  if (revoked.revoked) {
    // `accountsChanged []` a las pestañas del origen revocado. Si la sesión no registró ninguna
    // pestaña (p. ej. creada por `eth_requestAccounts` sin `tabId`), se emite a TODAS: el evento
    // no lleva ninguna dirección y una pestaña de ese origen con el evento perdido seguiría
    // mostrando la cuenta revocada (`CA-RF-26`).
    await deps.revocation.emitEvent(
      'accountsChanged',
      [],
      revoked.tabIds.length > 0 ? { tabIds: revoked.tabIds } : {},
    );
  }
  return { origin: revoked.origin, revoked: revoked.revoked };
};

/** Registro CERRADO de manejadores: una entrada por método de la unión `InternalMethod`. */
const INTERNAL_HANDLERS: Readonly<Record<InternalMethod, InternalHandler>> = Object.freeze({
  wallet_generateMnemonic: handleGenerateMnemonic,
  wallet_importMnemonic: handleImportMnemonic,
  wallet_deriveAccounts: handleDeriveAccounts,
  wallet_importPrivateKey: handleImportPrivateKey,
  wallet_getNetworks: handleGetNetworks,
  wallet_getLogs: handleGetLogs,
  wallet_revealSecret: handleRevealSecret,
  wallet_getState: handleGetState,
  wallet_setCurrentAccount: handleSetCurrentAccount,
  wallet_addDerivedAccount: handleAddDerivedAccount,
  wallet_renameAccount: handleRenameAccount,
  wallet_setAccountVisible: handleSetAccountVisible,
  wallet_deleteImportedAccount: handleDeleteImportedAccount,
  wallet_resetWallet: handleResetWallet,
  wallet_acceptDevNotice: handleAcceptDevNotice,
  wallet_getConnectRequest: handleGetConnectRequest,
});

/**
 * Manejadores invocables desde el POPUP que NO pertenecen a `InternalMethod`. Hoy solo la
 * revocación (tarea 3.11): desde una página el mismo nombre es un aprobable `4200`.
 */
const EXTENSION_HANDLERS: Readonly<Record<string, InternalHandler>> = Object.freeze({
  wallet_revokePermissions: handleRevokePermissions,
});

// ---------------------------------------------------------------------------
// Despacho
// ---------------------------------------------------------------------------

/**
 * Dependencias por defecto: ÚNICO punto de acoplamiento con los módulos de H2 y H3. Si un módulo
 * publica otro nombre de export, el ajuste se hace SOLO aquí.
 */
export const defaultInternalDeps: InternalHandlerDeps = {
  mnemonic: { generateMnemonic },
  accounts: {
    importWalletFromMnemonic,
    deriveNextAccount,
    importAccountByPrivateKey,
    getWalletStateView,
    setCurrentAccount,
    renameAccount,
    setAccountVisible,
    removeImportedAccount,
  },
  secrets: { resolveSecret },
  integrity: { checkWalletIntegrity },
  settings: { acceptDevNotice },
  state: { resetWallet },
  revocation: {
    revokeSession: async (origin) => revokeSession(origin),
    emitEvent: async (eventName, data, options) =>
      emitProviderEvent(eventName, data, {
        ...(options?.tabIds === undefined ? {} : { tabIds: options.tabIds }),
        deps: defaultEventsDeps(),
      }),
    forgetPendingForOrigin: (origin) => {
      forgetPendingConnectsForOrigin(origin);
    },
    // v1.7: la lista que pinta «Sitios conectados»; es LECTURA PURA (no purga ni renueva nada).
    listSessions: async () => listConnectedSites(),
  },
  // M26.b (v1.7): solicitud de conexión completa para `connect.html`.
  connections: {
    getConnectRequest: async (requestId) => readConnectRequestView(requestId),
  },
  // M26/M27 (D-H3-A / D-H3-B): cambio de la cuenta activa → sesiones vigentes + `accountsChanged`.
  activeAccount: {
    syncActiveAccount: async () => {
      const account = await getCurrentAddress();
      if (account === null) {
        // Cartera sin cuentas: no hay nada que compartir ni que emitir.
        return { account: null, origins: [], tabIds: [] };
      }
      const synced = await applyActiveAccountToSessions(account);
      if (synced.tabIds.length > 0) {
        // El evento viaja SOLO a las pestañas de las sesiones vigentes: emitirlo a todas
        // publicaría la dirección en orígenes sin sesión (RNF-11).
        await emitAccountsChanged([account], { tabIds: synced.tabIds, deps: defaultEventsDeps() });
      }
      return { account, origins: synced.origins, tabIds: synced.tabIds };
    },
  },
};

/**
 * Despacha un método interno de §5.1.1 (o la revocación del popup). Lanza SIEMPRE objetos
 * EIP-1193 del catálogo (M6); el router (M3) es quien los convierte en la forma de respuesta del
 * protocolo.
 */
export const invokeInternalMethod = async (
  method: InternalMethod | 'wallet_revokePermissions',
  params: unknown[],
  context: TrustedSenderContext,
  deps: InternalHandlerDeps = defaultInternalDeps,
): Promise<unknown> => {
  if (isInternalMethod(method)) {
    return INTERNAL_HANDLERS[method](params, context, deps);
  }
  const extensionHandler = EXTENSION_HANDLERS[method];
  if (extensionHandler === undefined) {
    throw unsupportedMethodError();
  }
  return extensionHandler(params, context, deps);
};
