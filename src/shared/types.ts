/**
 * M55 — `src/shared/types.ts`
 * Tipos de dominio compartidos por el Service Worker, el content script, el provider
 * inyectado y las tres ventanas de la extensión.
 *
 * Fuente normativa: `documento_tecnico.md` §2.5.2 (tipos TypeScript clave) y
 * `diccionario_datos.md` §2 (claves de `chrome.storage.local`) y §3 (entidades compuestas).
 *
 * Reglas:
 * - Sin `any`: los escenarios que la especificación tipa como `any` (firmas de listener)
 *   se modelan aquí como `unknown`, que es más estricto y compatible.
 * - Los tipos se declaran con `interface`/`type` puros: este módulo NO importa nada.
 */

// ---------------------------------------------------------------------------
// Alias base (diccionario de datos §1)
// ---------------------------------------------------------------------------

/** Dirección Ethereum: `0x` + 40 hex (checksum EIP-55 al persistir). */
export type Address = `0x${string}`;

/** Cadena hexadecimal `0x…`. */
export type Hex = `0x${string}`;

/** BigInt serializado en decimal (nunca `bigint` en storage ni en mensajes). */
export type WeiString = string;

/** `chainId` en hexadecimal (`0x7a69` con Anvil). */
export type ChainIdHex = `0x${string}`;

/**
 * Referencia a una cuenta: canónica `idx:<n>` (derivada por índice BIP-44) o `imp:<address>`
 * (importada por dirección). Se admite además la **forma heredada sin prefijo** (`"0"`), que
 * `diccionario_datos.md` §2.4 declara retrocompatible y que M28 (`parseAccountRef`) interpreta y
 * M34 normaliza a `idx:0` al migrar; el tipo la incluye para no mentir sobre lo que la API
 * acepta.
 */
export type AccountRef = `idx:${number}` | `imp:${Address}` | `${number}`;

/** Identificador UUID v4 (claves de la cola y de la conexión). */
export type Uuid = string;

// ---------------------------------------------------------------------------
// Uniones CERRADAS de métodos (regla de frontera ADT-16)
// ---------------------------------------------------------------------------

/** Estado del ciclo de vida de una solicitud de la cola. */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/**
 * Los 6 métodos aprobables. `eth_sign` NO figura (responde `4200` antes de crear entrada
 * en la cola): DEC-22 / H-11a.
 */
export type ApprovalMethod =
  | 'eth_sendTransaction'
  | 'eth_signTypedData_v4'
  | 'personal_sign'
  | 'wallet_switchEthereumChain'
  | 'wallet_addEthereumChain'
  | 'wallet_revokePermissions';

/**
 * Los **16** métodos internos `wallet_*` (contrato de `documento_tecnico.md` §5.1.1, ampliado
 * en la v1.6 con los 8 métodos de UI del hito H2 y en la v1.7 con la entrega de la solicitud de
 * conexión). Solo se aceptan desde páginas de la extensión; desde un content script → `4200`.
 *
 * Nota de discrepancia anotada: la tabla de `diccionario_datos.md` §4.3 enumera 6 de los 7
 * originales (omite `wallet_importMnemonic`, que sí existe en §5.1.1 y en la tabla de
 * métodos internos de §5.1); se sigue el documento técnico, que es la fuente del contrato.
 */
export type InternalMethod =
  // --- Contrato original (H2, tareas 2.1 a 2.5 y 2.9) ---
  | 'wallet_generateMnemonic'
  | 'wallet_importMnemonic'
  | 'wallet_deriveAccounts'
  | 'wallet_importPrivateKey'
  | 'wallet_getNetworks'
  | 'wallet_getLogs'
  | 'wallet_revealSecret'
  // --- Ampliación de la v1.6 (§5.1.1): estado y operaciones de UI (RNF-14) ---
  | 'wallet_getState'
  | 'wallet_setCurrentAccount'
  | 'wallet_addDerivedAccount'
  | 'wallet_renameAccount'
  | 'wallet_setAccountVisible'
  | 'wallet_deleteImportedAccount'
  | 'wallet_resetWallet'
  | 'wallet_acceptDevNotice'
  // --- Ampliación de la v1.7 (§5.1.1): entrega de la solicitud de conexión (§2.9) ---
  /**
   * `connect.html` pide al SW la solicitud `pending` que debe resolver —`{requestId, origin,
   * accounts, currentAccountIndex, chainId, expiresAt}`— para no depender de una lectura del
   * almacén (RNF-14) ni de la lista de cuentas del popup.
   */
  | 'wallet_getConnectRequest';

/** Métodos de lectura del catálogo que NO requieren aprobación. */
export type PageReadMethod =
  | 'eth_requestAccounts'
  | 'eth_accounts'
  | 'eth_chainId'
  | 'eth_blockNumber'
  | 'eth_getBalance'
  | 'eth_estimateGas'
  | 'eth_gasPrice'
  | 'eth_feeHistory'
  | 'eth_getTransactionByHash'
  | 'eth_getTransactionReceipt';

/**
 * Métodos que una PÁGINA puede invocar: las lecturas más los 6 aprobables.
 *
 * `eth_sign` queda FUERA de la unión a propósito: está retirado del catálogo y se
 * responde `4200 Unsupported method` por no pertenecer a ningún grupo conocido.
 */
export type PageMethod = PageReadMethod | ApprovalMethod;

/** Cualquier método que puede cruzar la frontera popup ↔ Service Worker. */
export type WalletMethod = PageMethod | InternalMethod;

/** Nombre de los 5 eventos del provider EIP-1193. */
export type ProviderEventName =
  | 'accountsChanged'
  | 'chainChanged'
  | 'connect'
  | 'disconnect'
  | 'message';

/** Escucha de un evento del provider. */
export type ProviderListener = (...args: unknown[]) => void;

// ---------------------------------------------------------------------------
// Interfaz EIP-1193 / EIP-6963 (documento_tecnico.md §2.5.3)
// ---------------------------------------------------------------------------

/** Argumentos de `provider.request`. */
export interface RequestArguments {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

/** Error EIP-1193: `code` numérico obligatorio en TODO error que ve el usuario. */
export interface Eip1193Error {
  code: number;
  message: string;
  data?: unknown;
}

/** Superficie mínima EIP-1193 del provider. */
export interface Eip1193Provider {
  request(args: RequestArguments): Promise<unknown>;
  on(eventName: ProviderEventName, listener: ProviderListener): this;
  removeListener(eventName: ProviderEventName, listener: ProviderListener): this;
}

/** Superficie real publicada por `inject.js` (M35). */
export interface TruekeateProvider extends Eip1193Provider {
  isTrueKeate: true;
  chainId: ChainIdHex | null;
  selectedAddress: Address | null;
}

/** `info` del anuncio EIP-6963 (valores vinculantes, RT-13). */
export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

/** `detail` del evento `eip6963:announceProvider`. */
export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: TruekeateProvider;
}

// ---------------------------------------------------------------------------
// Cola de aprobaciones y sus previews (documento_tecnico.md §2.5.2)
// ---------------------------------------------------------------------------

/** Resumen de una transacción para la ventana de confirmación. */
export interface TxPreview {
  from: Address;
  /** `null` = despliegue de contrato. */
  to: Address | null;
  /** Nombre del contrato o «desconocido». */
  toLabel: string;
  valueWei: WeiString;
  valueEth: string;
  data: Hex;
  dataLength: number;
  isContractCall: boolean;
  /** Primeros 4 bytes de `data`. */
  selector: Hex | null;
  /** Firma decodificada con la tabla local cerrada; `null` si no está en la tabla. */
  functionName: string | null;
  decodedArgs: Record<string, unknown> | null;
  isUnrecognizedContractCall: boolean;
  /** Avisos en español (allowance ilimitada, contrato no reconocido…). */
  riskWarnings: string[];
  gasLimit: WeiString;
  estimationFailed: { reason: string } | null;
  maxFeePerGas: WeiString;
  maxPriorityFeePerGas: WeiString;
  estimatedFeeEth: string;
  /** Solo informativo: el nonce definitivo se recalcula al aprobar (H-10). */
  nonceInformativo: number;
  txType: 2;
  chainId: ChainIdHex;
  insufficientFunds: boolean;
}

/** Dominio EIP-712 tal y como llega en `eth_signTypedData_v4`. */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number | string;
  verifyingContract?: Address;
  salt?: Hex;
}

/** Resumen de una firma EIP-712. */
export interface TypedDataPreview {
  domain: TypedDataDomain;
  domainName: string | null;
  verifyingContract: Address | null;
  /** SIN `EIP712Domain`. */
  types: Record<string, Array<{ name: string; type: string }>>;
  /**
   * Datos a firmar. `null` cuando la serialización canónica supera `PREVIEW_INLINE_MAX_BYTES`
   * (4096 bytes): entonces se persiste **redactado** (`messageHash` + `messageBytes`) y la UI
   * muestra el aviso «mensaje demasiado largo» (`diccionario_datos.md` §3.2 / §3.9, ADT-21/D-L).
   * El payload íntegro de firma (≤ 64 KiB) sigue en `params`.
   */
  message: Record<string, unknown> | null;
  primaryType: string;
  /** `domain.chainId` ≠ `chainId` activo → aviso destacado. */
  domainChainMismatch: boolean;
  verifyingContractMismatch: boolean;
}

/** Resumen de una firma de texto plano (`personal_sign`). */
export interface PersonalSignPreview {
  /** Payload decodificado como UTF-8; `null` si no es legible. */
  text: string | null;
  isHexPayload: boolean;
  byteLength: number;
  /** Solo para la UI: NUNCA se copia a `truekeate_logs`. */
  bytesHex: Hex;
}

/**
 * Entrada de la cola `truekeate_pending_requests` (`Record<approvalId, PendingRequest>`).
 * SIN `windowId`: la ventana única se persiste en `truekeate_approval_window` (P-21).
 */
export interface PendingRequest {
  approvalId: Uuid;
  method: ApprovalMethod;
  /** Persistidos REDACTADOS (H-42). */
  params: unknown[];
  /** Origen normalizado: minúsculas, sin barra final, con puerto. */
  origin: string;
  /** `null` si la solicitud nace en el popup. */
  tabId: number | null;
  /** `0` = top frame; distinto de 0 exige responder SOLO a ese frame (D-J/ADT-07). */
  frameId: number | null;
  account: Address;
  chainId: ChainIdHex;
  /** Solo `eth_sendTransaction`. */
  txPreview?: TxPreview;
  /** Solo `eth_signTypedData_v4`. */
  typedDataPreview?: TypedDataPreview;
  /** Solo `personal_sign`. */
  signMessagePreview?: PersonalSignPreview;
  createdAt: number;
  /** `createdAt + SIGN_TIMEOUT_MS`, anclado a `createdAt`. */
  expiresAt: number;
  status: ApprovalStatus;
  resolvedAt?: number;
  /** Código EIP-1193 emitido al resolver. */
  errorCode?: number;
  /**
   * **Correlación con el salto 1** (H-07, D-H4-E10 corregido): `id` que la capa inject
   * (`crypto.randomUUID()`) puso en el `TRUEKEATE_REQUEST` que originó esta aprobación, tal y como
   * lo transportó el relay en el campo homónimo de su `TRUEKEATE_RPC`.
   *
   * Es la ÚNICA forma de que la resolución EMPUJADA por el SW (aprobación, rechazo o vencimiento)
   * llegue a la promesa correcta de la dApp cuando el canal `chrome.runtime.sendMessage` ya no
   * existe (SW suspendido y despertado después por `chrome.alarms`). Se persiste para sobrevivir a
   * esa suspensión. Ausente cuando la solicitud nació en un contexto de la extensión (popup) o
   * cuando el emisor no declaró correlación: entonces se usa `approvalId` como hasta ahora.
   */
  requestId?: string;
}

/** Solicitud de conexión `truekeate_connect_request` (§2.9). */
export interface ConnectRequest {
  requestId: Uuid;
  origin: string;
  favicon?: string;
  accounts: Address[];
  currentAccountIndex: number;
  chainId: ChainIdHex;
  tabId: number;
  frameId: number;
  createdAt: number;
  /** `createdAt + CONNECT_TIMEOUT_MS` (60 000 ms). */
  expiresAt: number;
  status: ApprovalStatus;
}

/**
 * Vista de la solicitud de conexión que el SW entrega a `connect.html` con
 * `wallet_getConnectRequest` (§5.1.1 v1.7): es el subconjunto de {@link ConnectRequest} que la
 * ventana necesita para pintarse y para responder con `account` **y** `accountIndex` coherentes.
 *
 * No viaja ningún dato del emisor (`tabId`, `frameId`, `favicon` ni `status`): la ventana solo
 * resuelve la elección del usuario y el SW sigue siendo el custodio del ciclo de vida.
 */
export interface ConnectRequestView {
  requestId: Uuid;
  /** Origen NORMALIZADO que pide la conexión (§2.7). */
  origin: string;
  /** Cuentas ofrecidas, en el orden canónico de `ConnectRequest.accounts` (§2.9). */
  accounts: Address[];
  /** Posición preseleccionada dentro de `accounts`. */
  currentAccountIndex: number;
  chainId: ChainIdHex;
  /** `createdAt + CONNECT_TIMEOUT_MS`; superado, la solicitud ya no se entrega. */
  expiresAt: number;
}

/** Ventana única de confirmación `truekeate_approval_window` (§2.14). */
export interface ApprovalWindow {
  windowId: number | null;
  shownApprovalId: Uuid | null;
  openedAt: number | null;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Observabilidad (documento_tecnico.md §2.5.2, diccionario_datos.md §2.11)
// ---------------------------------------------------------------------------

/** Taxonomía de la entrada: independiente de `event`. */
export type LogCategory = 'call' | 'event' | 'tx' | 'sign' | 'system';

/** Nivel de la entrada. */
export type LogLevel = 'info' | 'success' | 'warn' | 'error';

/** Catálogo CERRADO de 24 eventos instrumentados. */
export type LogEventName =
  | 'rpc_call'
  | 'rpc_error'
  | 'event_emit'
  | 'tx_sent'
  | 'tx_confirmed'
  | 'tx_failed'
  | 'tx_reverted'
  | 'sign_personal'
  | 'sign_typed_data'
  | 'approval_created'
  | 'approval_resolved'
  | 'approval_expired'
  | 'chain_changed'
  | 'accounts_changed'
  | 'wallet_created'
  | 'wallet_imported'
  | 'account_imported'
  | 'account_removed'
  | 'reset_wallet'
  | 'network_added'
  | 'permission_revoked'
  | 'sw_started'
  | 'sw_reconcile'
  | 'storage_quota_exceeded';

/** Entrada de `truekeate_logs`. La escribe SIEMPRE el Service Worker. */
export interface LogEntry {
  id: Uuid;
  ts: number;
  level: LogLevel;
  category: LogCategory;
  event: LogEventName;
  message: string;
  /** Origen normalizado o `extension`. */
  origin: string;
  method: string;
  /** Payload REDACTADO (M22): nunca íntegro. */
  data: unknown;
  txHash?: Hex;
  txStatus?: 'pending' | 'confirmed' | 'failed';
}

// ---------------------------------------------------------------------------
// Ajustes y entidades persistidas
// ---------------------------------------------------------------------------

/** Ajustes de `truekeate_settings` (§2.10). */
export interface TruekeateSettings {
  derivedAccountCount: number;
  /** Etiquetas de las cuentas DERIVADAS, por índice BIP-44. */
  accountLabels: Record<number, string>;
  /**
   * Índices BIP-44 de las cuentas derivadas **ocultas** (RF-06 / DEC-35): una derivada nunca se
   * elimina, solo se oculta. Es clave canónica de `truekeate_settings`, junto a `accountLabels`,
   * y el reset de la cartera la limpia con el resto del objeto de ajustes.
   */
  hiddenAccounts: number[];
  balancePollMs: number;
  balancePollMaxAccounts: number;
  logLimit: number;
  logMaxPerOrigin: number;
  sessionTtlMs: number;
  pendingRequestsMax: number;
  pendingRequestsMaxPerOrigin: number;
  pendingRequestsPerMinute: number;
  language: 'es' | 'en';
  /** Cifrado descartado en P-03; el flag se conserva por compatibilidad. */
  encryptionEnabled: false;
  requirePasswordOnOpen: false;
  devNoticeAcceptedAt?: number;
}

/** Cuenta importada por clave privada (`truekeate_imported_accounts[]`). */
export interface ImportedAccount {
  address: Address;
  privateKey: Hex;
  /** Máximo 32 caracteres. */
  label: string;
  importedAt: number;
  visible: boolean;
}

/** Red dada de alta (`truekeate_networks`). */
export interface StoredNetwork {
  chainId: ChainIdHex;
  chainIdDecimal: number;
  name: string;
  rpcUrl: string;
  symbol: string;
  decimals: number;
  isTestnet: boolean;
  isDefault: boolean;
  /**
   * Explorador de bloques declarado por EIP-3085 (`blockExplorerUrls[0]`); opcional porque en
   * local puede no existir (`diccionario_datos.md` §2.6).
   */
  explorerUrl?: string;
}

/**
 * Vista previa de una red para la ventana única de confirmación (`notification.html`, M50) y para
 * la vista de redes del popup (M43): es lo que permite mostrar los datos de la red y el aviso de
 * que **no** se activará (`ADT-25`/`P-22`) sin que la UI lea el almacén (RNF-14).
 */
export interface NetworkPreview {
  kind: 'switch' | 'add';
  chainId: ChainIdHex;
  chainIdDecimal: number;
  name: string;
  rpcUrl: string;
  symbol: string;
  decimals: number;
  /** Marca de red de pruebas; `false` dispara {@link NON_TESTNET_WARNING} (RNF-23). */
  isTestnet: boolean;
  /** Aviso literal de RNF-23; `null` si la red es de pruebas (no hay nada que advertir). */
  warning: string | null;
  /** Red activa en el momento de crear la solicitud (`switch`: la que se abandona). */
  currentChainId: ChainIdHex;
  /** Solo en el alta: `true` = la red ya estaba dada de alta y se reemplaza. */
  alreadyRegistered?: boolean;
  /** Solo en el alta: aviso explícito de que la red NO pasa a ser la activa (P-22). */
  activationNote?: string;
}

/** Sesión de dApp por origen (`truekeate_connected_sites`). */
export interface DappSession {
  origin: string;
  account: Address;
  chainId: ChainIdHex;
  tabIds: number[];
  connectedAt: number;
  lastUsedAt: number;
  /** `lastUsedAt + sessionTtlMs`; `null` = sin caducidad. */
  expiresAt: number | null;
  connected: boolean;
}

/**
 * Vista de una sesión de dApp para la UI (`wallet_getState.connectedSites`, §5.1.1 v1.7).
 *
 * Es la forma canónica de `diccionario_datos.md` §2.7 —origen normalizado, cuenta compartida,
 * red, alta, último uso y caducidad— **sin secretos** y sin datos internos de propagación
 * (`tabIds` no se publica a la UI). `current` distingue la sesión **vigente** (entrada viva y no
 * vencida) de la que ya caducó y solo espera su purga perezosa.
 */
export interface ConnectedSiteView {
  origin: string;
  account: Address;
  chainId: ChainIdHex;
  connectedAt: number;
  lastUsedAt: number;
  /** `lastUsedAt + sessionTtlMs`; `null` = sin caducidad (§2.7). */
  expiresAt: number | null;
  /** `true` = sesión VIGENTE en el instante de la lectura; `false` = vencida o desconectada. */
  current: boolean;
}

/** Marca persistida de «transacción en vuelo» por cuenta (§2.12). */
export interface InflightTx {
  account: Address;
  approvalId: Uuid;
  /** `signing` bloquea la cuenta; `broadcast` no la bloquea. */
  phase: 'signing' | 'broadcast';
  nonce?: number;
  txHash: Hex | null;
  startedAt: number;
  expiresAt: number;
}

/** Ventana de tasa persistida por origen (§2.13). */
export interface RateWindow {
  tokens: number;
  lastRefillAt: number;
  approvalWindowStart: number;
  approvalsInWindow: number;
  deniedCount: number;
  updatedAt: number;
}

/** Mapa completo de `truekeate_rate_windows`. */
export type RateWindowsByOrigin = Record<string, RateWindow>;

/** Mapa completo de `truekeate_pending_requests`. */
export type PendingRequestsMap = Record<Uuid, PendingRequest>;

/** Mapa completo de `truekeate_inflight_tx`. */
export type InflightTxByAccount = Record<Address, InflightTx>;

/** Mapa completo de `truekeate_connected_sites`. */
export type DappSessionsByOrigin = Record<string, DappSession>;

/** Wallet almacenada (fragmento tipado de las claves persistentes). */
export interface StoredWallet {
  truekeate_mnemonic?: string;
  truekeate_current_account: AccountRef;
}
