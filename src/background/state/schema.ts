/**
 * M33 — `src/background/state/schema.ts`
 * Versión de esquema y claves canónicas de `chrome.storage.local`.
 *
 * Regla de nomenclatura (ACU-25): TODA clave persistida lleva el prefijo `truekeate_`. Este
 * módulo es su fuente única: ningún otro fichero escribe una cadena `truekeate_` a mano.
 *
 * Prohibiciones que este módulo hace cumplir (ADT-26 / D-S, ver `documento_tecnico.md` §3.7):
 * - nombres cortos del tipo `settings.*` como si fueran almacenes;
 * - el prefijo heredado del intento previo (DEC-09), que no es válido;
 * - el almacén sincronizado del navegador: nunca se replica nada fuera de `local`;
 * - el almacén volátil del documento: no existe en un Service Worker.
 */

/**
 * Versión del esquema de datos. El corpus vigente es el esquema **v1.4** del diccionario
 * (`documento_tecnico.md` §4.3: base v1.2 → v1.3 → v1.4). Se declarará dentro de
 * `truekeate_settings` al implementar M29 (H2); el rechazo de claves no canónicas y la
 * migración v1.2 → v1.4 son de M34.
 */
export const SCHEMA_VERSION = '1.4' as const;

/**
 * Clave de la versión de esquema. Documental: la versión se declarará DENTRO de
 * `truekeate_settings` al implementar M29 (H2), no como clave propia; se conserva aquí
 * con su prefijo canónico para las pruebas de migración de M34.
 */
export const SCHEMA_VERSION_KEY = 'truekeate_schema_version' as const;

/** Nombres canónicos de las 14 claves de `chrome.storage.local`. */
export const STORAGE_KEYS = {
  /** Frase BIP-39 de 12 palabras (puede no existir si solo hay cuentas importadas). */
  mnemonic: 'truekeate_mnemonic',
  /** `string[]` de direcciones; el índice del array ES el índice BIP-44. */
  accounts: 'truekeate_accounts',
  /** `ImportedAccount[]` (dirección, clave privada, etiqueta, alta y visibilidad). */
  importedAccounts: 'truekeate_imported_accounts',
  /** `AccountRef` activa (`idx:<n>` | `imp:<address>`). */
  currentAccount: 'truekeate_current_account',
  /** `ChainIdHex` activo; inicial `0x7a69`. */
  chainId: 'truekeate_chain_id',
  /** Mapa `chainId → StoredNetwork`; default único Anvil Local. */
  networks: 'truekeate_networks',
  /** `Record<origen normalizado, DappSession>` con TTL de 24 h renovables. */
  connectedSites: 'truekeate_connected_sites',
  /** `Record<approvalId, PendingRequest>`: la cola persistida. */
  pendingRequests: 'truekeate_pending_requests',
  /** `Record<requestId, ConnectRequest>`: máximo 1 `pending` por origen. */
  connectRequest: 'truekeate_connect_request',
  /** Ventana ÚNICA de confirmación (`ApprovalWindow`, P-21). */
  approvalWindow: 'truekeate_approval_window',
  /** `Record<Address, InflightTx>`: marca de «transacción en vuelo» por cuenta. */
  inflightTx: 'truekeate_inflight_tx',
  /** `Record<origin, RateWindow>`: ventana de tasa persistida (ADT-24 / D-Q). */
  rateWindows: 'truekeate_rate_windows',
  /** `LogEntry[]` con retención FIFO; EXCLUIDA de `resetWallet` (RF-32). */
  logs: 'truekeate_logs',
  /** `TruekeateSettings`: defaults, etiquetas y aceptación de avisos. */
  settings: 'truekeate_settings',
} as const;

/** Nombre canónico de una clave de almacén. */
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Las 14 claves canónicas como lista, en orden de declaración. */
export const CANONICAL_STORAGE_KEYS: readonly StorageKey[] = Object.values(STORAGE_KEYS);

/** Claves que `resetWallet` NO borra (RF-32: los logs sobreviven al reset). */
export const STORAGE_KEYS_PRESERVED_ON_RESET: readonly StorageKey[] = [STORAGE_KEYS.logs];

/** Prefijo obligatorio de toda clave persistida. */
export const STORAGE_KEY_PREFIX = 'truekeate_' as const;

/** ¿Lleva la clave el prefijo `truekeate_`? */
export const hasCanonicalPrefix = (key: string): boolean => key.startsWith(STORAGE_KEY_PREFIX);

/**
 * ¿Es `key` una de las claves canónicas declaradas? Una clave sin prefijo, o con prefijo
 * pero no declarada, se RECHAZA (M34: rechazo de claves no canónicas).
 */
export const isCanonicalStorageKey = (key: string): key is StorageKey =>
  (CANONICAL_STORAGE_KEYS as readonly string[]).includes(key);

/** Devuelve la clave canónica o lanza si no lo es (uso interno del SW). */
export const assertCanonicalStorageKey = (key: string): StorageKey => {
  if (!isCanonicalStorageKey(key)) {
    throw new Error(
      `[truekeate] clave de almacén no canónica: «${key}». Todas las claves usan el prefijo ${STORAGE_KEY_PREFIX} y están declaradas en STORAGE_KEYS.`,
    );
  }
  return key;
};

/**
 * Problema de nomenclatura de una clave de almacén, como objeto EIP-1193.
 *
 * El diccionario §4.3 no registra una causa propia para «clave no canónica» (es un defecto
 * de implementación, no de uso de la cartera), así que se clasifica como fallo interno
 * `-32603` con su literal y el detalle en `data`. Devuelve `null` si la clave es correcta.
 */
export const canonicalKeyProblem = (
  key: string,
): { code: number; message: string; data: unknown } | null =>
  hasCanonicalPrefix(key) && isCanonicalStorageKey(key)
    ? null
    : {
        code: -32603,
        message: 'Error interno de la cartera.',
        data: { reason: 'non-canonical-key', key, expectedPrefix: STORAGE_KEY_PREFIX },
      };

/** Valores iniciales de las claves cuyo tipo raíz es un mapa o una lista. */export const STORAGE_DEFAULTS = {
  [STORAGE_KEYS.accounts]: [] as string[],
  [STORAGE_KEYS.importedAccounts]: [],
  [STORAGE_KEYS.networks]: {},
  [STORAGE_KEYS.connectedSites]: {},
  [STORAGE_KEYS.pendingRequests]: {},
  [STORAGE_KEYS.connectRequest]: {},
  [STORAGE_KEYS.approvalWindow]: {
    windowId: null,
    shownApprovalId: null,
    openedAt: null,
    updatedAt: 0,
  },
  [STORAGE_KEYS.inflightTx]: {},
  [STORAGE_KEYS.rateWindows]: {},
  [STORAGE_KEYS.logs]: [],
} as const;
