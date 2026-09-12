/**
 * M23 — `src/background/networks/catalog.ts`
 * Catálogo de redes del Service Worker: la red **Anvil local por defecto** (H3, tarea 3.6).
 *
 * FUENTE NORMATIVA
 * - `plan_desarrollo.md` §3.3.5 tarea 3.6: `truekeate_networks` se siembra con Anvil (`0x7a69`,
 *   `isDefault: true`), símbolo `ETH` y validación de `chainId`; **sin Sepolia** (`CA-RT-06`).
 * - `diccionario_datos.md` §2.6 (`StoredNetwork`) y `entornos_globales.md` §3 (constantes de red).
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **Sin redes remotas**: la única red sembrada es `http://127.0.0.1:8545` (`RE-04`). Sepolia y
 *    cualquier otra red del corpus NO se siembran; su alta aprobable llega en H5 (`CA-RT-06`).
 * 2. **`chainId` validado**: se acepta la forma hexadecimal canónica (`0x` + hex) y, en la
 *    ampliación de H5 (tarea 5.2), también el decimal coherente (`"31338"`, `31338`). Un
 *    `chainId` con otra forma se descarta, de modo que `truekeate_chain_id` nunca propaga basura.
 * 3. **Reutiliza M33**: la lectura y la escritura del almacén pasan por `readStorage`/`writeStorage`
 *    de `state/schema.ts`; aquí no se escribe ninguna clave `truekeate_*` a mano.
 *
 * AMPLIACIÓN DE H5 (tarea 5.2, `documento_tecnico.md` §3.5 y `diccionario_datos.md` §2.6)
 * - **Esquema y host del `rpcUrl`**: `https` preferente; `http` SOLO para `127.0.0.1`/`localhost`;
 *   se rechazan los hosts privados (`10/8`, `172.16/12`, `192.168/16`) y de enlace local
 *   (`169.254/16`), que es la validación PREVIA obligatoria de §3.5.
 * - **Símbolo**: opcional con valor por defecto `ETH` (EIP-3085); una cadena vacía o con
 *   caracteres no imprimibles se rechaza.
 * - **`isTestnet` (RNF-23)**: se declara desde `truekeate_networks` cuando la red ya está dada de
 *   alta y, si no, desde la tabla cerrada de redes principales conocidas; por defecto `true` (una
 *   red desconocida NO dispara la advertencia de red real: el aviso exige certeza).
 * - **El alta NUNCA activa** (`ADT-25`/`P-22`): {@link upsertNetwork} escribe la entrada con
 *   `isDefault: false` y **no** toca `truekeate_chain_id`.
 */

import type { ChainIdHex, StoredNetwork } from '../../shared/types';
import {
  DEFAULT_CHAIN_DECIMALS,
  DEFAULT_CHAIN_ID,
  DEFAULT_CHAIN_ID_DECIMAL,
  DEFAULT_CHAIN_IS_TESTNET,
  DEFAULT_CHAIN_NAME,
  DEFAULT_CHAIN_SYMBOL,
  DEFAULT_RPC_URL,
} from '../../shared/constants';
import {
  STORAGE_KEYS,
  readStorage,
  writeStorage,
  type StorageLocalLike,
  type StorageSnapshot,
} from '../state/schema';
import { storageQuotaExceededError } from '../rpc/errors';

/** Almacén inyectable de M23/M24/M25 (`null` = API no disponible; `undefined` = el real). */
export type NetworkStorage = StorageLocalLike | null | undefined;

/** Mapa persistido `truekeate_networks`: `chainId → StoredNetwork`. */
export type NetworksCatalog = Record<string, StoredNetwork>;

/**
 * Red por defecto del proyecto: **Anvil local**, sin fondos reales.
 * Es la única red que H3 da de alta (`CA-RT-06`: **sin Sepolia**).
 */
export const ANVIL_NETWORK: StoredNetwork = Object.freeze({
  chainId: DEFAULT_CHAIN_ID as ChainIdHex,
  chainIdDecimal: DEFAULT_CHAIN_ID_DECIMAL,
  name: DEFAULT_CHAIN_NAME,
  rpcUrl: DEFAULT_RPC_URL,
  symbol: DEFAULT_CHAIN_SYMBOL,
  decimals: DEFAULT_CHAIN_DECIMALS,
  isTestnet: DEFAULT_CHAIN_IS_TESTNET,
  isDefault: true,
});

/** Alias explícito: la red por defecto ES la de Anvil. */
export const DEFAULT_NETWORK: StoredNetwork = ANVIL_NETWORK;

/** ¿Es un objeto plano utilizable como mapa de redes? */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Forma canónica de un `chainId` hexadecimal: `0x` + uno o más dígitos hex. */
export const CHAIN_ID_PATTERN = /^0x[0-9a-fA-F]+$/;

/** ¿Tiene el `chainId` la forma hexadecimal canónica? (validación de la tarea 3.6) */
export const isValidChainId = (value: unknown): value is ChainIdHex =>
  typeof value === 'string' && CHAIN_ID_PATTERN.test(value.trim());

/** Normaliza un `chainId` a minúsculas (`0x7A69` → `0x7a69`); `null` si no es válido. */
export const normalizeChainId = (value: unknown): ChainIdHex | null => {
  if (!isValidChainId(value)) {
    return null;
  }
  return value.trim().toLowerCase() as ChainIdHex;
};

/** Proyecta `truekeate_networks` descartando entradas malformadas (función pura). */
export const readNetworksFromSnapshot = (snapshot: StorageSnapshot): NetworksCatalog => {
  const raw: unknown = snapshot[STORAGE_KEYS.networks];
  if (!isRecord(raw)) {
    return {};
  }
  const networks: NetworksCatalog = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      continue;
    }
    const chainId = normalizeChainId(value.chainId);
    if (chainId === null) {
      continue;
    }
    networks[key] = {
      chainId,
      chainIdDecimal:
        typeof value.chainIdDecimal === 'number'
          ? value.chainIdDecimal
          : Number.parseInt(chainId, 16),
      name: typeof value.name === 'string' ? value.name : chainId,
      rpcUrl: typeof value.rpcUrl === 'string' ? value.rpcUrl : '',
      symbol: typeof value.symbol === 'string' ? value.symbol : DEFAULT_CHAIN_SYMBOL,
      decimals: typeof value.decimals === 'number' ? value.decimals : DEFAULT_CHAIN_DECIMALS,
      isTestnet: value.isTestnet === true,
      isDefault: value.isDefault === true,
    };
  }
  return networks;
};

/** Lee el catálogo de redes persistido. */
export const readNetworks = async (
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<NetworksCatalog> => readNetworksFromSnapshot(await readStorage([STORAGE_KEYS.networks], storage));

/** ¿Está la red dada de alta (por `chainId` normalizado)? */
export const isChainRegistered = (catalog: NetworksCatalog, chainId: unknown): boolean => {
  const normalized = normalizeChainId(chainId);
  return normalized !== null && catalog[normalized] !== undefined;
};

/** Red de un `chainId`, o `null` si no está dada de alta. */
export const networkFor = (
  catalog: NetworksCatalog,
  chainId: unknown,
): StoredNetwork | null => {
  const normalized = normalizeChainId(chainId);
  return normalized === null ? null : (catalog[normalized] ?? null);
};

/** Red por defecto declarada en el catálogo (o `ANVIL_NETWORK` si el catálogo está vacío). */
export const defaultNetworkOf = (catalog: NetworksCatalog): StoredNetwork =>
  catalog[ANVIL_NETWORK.chainId] ?? ANVIL_NETWORK;

/** Lista de redes, con la de por defecto primero (orden estable para la UI). */
export const listNetworks = (catalog: NetworksCatalog): StoredNetwork[] =>
  Object.values(catalog).sort((left, right) =>
    left.isDefault === right.isDefault ? left.chainIdDecimal - right.chainIdDecimal : left.isDefault ? -1 : 1,
  );

/**
 * Resuelve la red activa `(chainId activo, catálogo)`: la del `chainId` guardado si está dada de
 * alta y, si no, la red por defecto (Anvil). Nunca devuelve una red sin `rpcUrl`.
 */
export const resolveActiveNetwork = (
  activeChainId: unknown,
  catalog: NetworksCatalog,
): StoredNetwork => networkFor(catalog, activeChainId) ?? defaultNetworkOf(catalog);

/**
 * Siembra `truekeate_networks` con Anvil y fija `truekeate_chain_id` si falta o es inválido.
 *
 * Es **idempotente**: si Anvil ya está dado de alta no reescribe el mapa, y respeta el `chainId`
 * activo que ya sea válido (no pisa una elección previa). Devuelve la red activa resultante.
 */
export const seedDefaultNetwork = async (
  storage: StorageLocalLike | null | undefined = undefined,
  snapshot?: StorageSnapshot,
): Promise<StoredNetwork> => {
  const stored = snapshot ?? (await readStorage([STORAGE_KEYS.networks, STORAGE_KEYS.chainId], storage));
  const catalog = readNetworksFromSnapshot(stored);
  const items: Record<string, unknown> = {};

  if (catalog[ANVIL_NETWORK.chainId] === undefined) {
    items[STORAGE_KEYS.networks] = { ...catalog, [ANVIL_NETWORK.chainId]: ANVIL_NETWORK };
  }
  const storedChainId = stored[STORAGE_KEYS.chainId];
  if (!isChainRegistered(catalog, storedChainId)) {
    // Sin red válida activa: la activa es la de por defecto (Anvil, `CA-RF-18`).
    items[STORAGE_KEYS.chainId] = ANVIL_NETWORK.chainId;
  }
  if (Object.keys(items).length > 0) {
    await writeStorage(items, storage);
  }
  const nextCatalog = readNetworksFromSnapshot({
    ...stored,
    ...items,
  });
  return resolveActiveNetwork(items[STORAGE_KEYS.chainId] ?? storedChainId, nextCatalog);
};

/** Dirección de red: la de la red activa, o la de Anvil si aún no hay catálogo (`RE-04`). */
export const rpcUrlFor = (network: StoredNetwork | null | undefined): string =>
  network !== null && network !== undefined && network.rpcUrl.length > 0
    ? network.rpcUrl
    : DEFAULT_RPC_URL;

// ---------------------------------------------------------------------------
// Ampliación de H5 (tarea 5.2): validación de `chainId`, esquema/host, símbolo e `isTestnet`
// ---------------------------------------------------------------------------

/** `chainId` máximo representable con seguridad en un `number` (EIP-3085 lo exige decimal). */
export const MAX_CHAIN_ID = Number.MAX_SAFE_INTEGER;

/** `chainId` en sus dos formas coherentes: hexadecimal canónico y decimal. */
export interface ParsedChainId {
  chainId: ChainIdHex;
  chainIdDecimal: number;
}

/** Motivo por el que un `chainId` declarado no se acepta (diagnóstico, no mensaje de usuario). */
export type ChainIdProblem = 'missing' | 'malformed' | 'out-of-range' | 'mismatch';

/** Resultado del parseo de un `chainId`: coherente o con su motivo de rechazo. */
export type ChainIdParseResult =
  | ({ ok: true } & ParsedChainId)
  | { ok: false; problem: ChainIdProblem; received: unknown };

/**
 * Parsea el `chainId` de EIP-3085 aceptando las DOS formas que la dApp puede enviar:
 * - **hexadecimal canónica** (`"0x7a6a"`, la que exige EIP-1193): manda sobre el decimal;
 * - **decimal** (`"31338"` o `31338`), como autoriza la propia EIP-3085.
 *
 * Si llegan LAS DOS y no coinciden, la petición es INCOHERENTE y se rechaza: «validación de
 * `chainId` (hex/decimal coherente)». Un hexadecimal fuera del rango seguro de `number` también
 * se rechaza, porque `chainIdDecimal` participa en el dominio EIP-712 (§2.6).
 */
export const parseChainId = (rawChainId: unknown, rawDecimal?: unknown): ChainIdParseResult => {
  const hexCandidate =
    typeof rawChainId === 'string' && rawChainId.trim().length > 0 ? rawChainId.trim() : null;
  const hasHex = hexCandidate !== null && isValidChainId(hexCandidate);

  let decimalCandidate: number | null = null;
  if (typeof rawDecimal === 'number') {
    decimalCandidate = Number.isInteger(rawDecimal) ? rawDecimal : null;
    if (decimalCandidate === null) {
      return { ok: false, problem: 'malformed', received: rawDecimal };
    }
  } else if (typeof rawDecimal === 'string' && rawDecimal.trim().length > 0) {
    const text = rawDecimal.trim();
    if (!/^[0-9]+$/.test(text)) {
      return { ok: false, problem: 'malformed', received: rawDecimal };
    }
    decimalCandidate = Number.parseInt(text, 10);
  }

  if (!hasHex) {
    if (hexCandidate !== null && rawDecimal === undefined) {
      // Solo llegó un hexadecimal malformado: no se degrada a decimal (podría no serlo).
      return { ok: false, problem: 'malformed', received: rawChainId };
    }
    if (decimalCandidate === null) {
      return {
        ok: false,
        problem: rawChainId === undefined || rawChainId === null ? 'missing' : 'malformed',
        received: rawChainId,
      };
    }
    if (decimalCandidate < 0 || decimalCandidate > MAX_CHAIN_ID) {
      return { ok: false, problem: 'out-of-range', received: rawDecimal };
    }
    return {
      ok: true,
      chainId: `0x${decimalCandidate.toString(16)}` as ChainIdHex,
      chainIdDecimal: decimalCandidate,
    };
  }

  const hex = hexCandidate as string;
  const decimalFromHex = Number.parseInt(hex, 16);
  if (!Number.isSafeInteger(decimalFromHex) || decimalFromHex < 0) {
    return { ok: false, problem: 'out-of-range', received: rawChainId };
  }
  if (decimalCandidate !== null && decimalCandidate !== decimalFromHex) {
    return { ok: false, problem: 'mismatch', received: { chainId: rawChainId, chainIdDecimal: rawDecimal } };
  }
  return {
    ok: true,
    chainId: normalizeChainId(hex) ?? (hex as ChainIdHex),
    chainIdDecimal: decimalFromHex,
  };
};

/** ¿Es un símbolo de moneda nativa utilizable? Cadena no vacía de hasta 8 caracteres visibles. */
export const isValidSymbol = (value: unknown): value is string =>
  typeof value === 'string' && /^[\x21-\x7e]{1,8}$/.test(value.trim());

/** Normaliza el símbolo declarado; `null` cuando no es utilizable (no se inventa ninguno). */
export const normalizeSymbol = (value: unknown): string | null =>
  isValidSymbol(value) ? value.trim().toUpperCase() : null;

/** Decimales por defecto de la moneda nativa y cota superior razonable (EIP-3085). */
export const DEFAULT_NATIVE_DECIMALS = 18;

/** ¿Es un número de decimales utilizable? (entero entre 0 y 36). */
export const isValidDecimals = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 36;

// --- Esquema y host del `rpcUrl` (validación PREVIA obligatoria, §3.5) ------------------------

/** Motivo por el que un `rpcUrl` declarado no se acepta (diagnóstico, no mensaje de usuario). */
export type RpcUrlProblem =
  | 'missing'
  | 'malformed'
  | 'unsupported-scheme'
  | 'insecure-http'
  | 'private-host'
  | 'local-link-host';

/** Resultado del parseo de un `rpcUrl` de EIP-3085. */
export type RpcUrlParseResult =
  | { ok: true; rpcUrl: string; origin: string; host: string; scheme: 'http' | 'https' }
  | { ok: false; problem: RpcUrlProblem; received: unknown };

/** Anfitriones exactos exentos de la regla `https` (RPC local del proyecto, `RE-04`/RT-04). */
const LOCAL_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]', '::1'];

/** ¿Es un anfitrión local exento (solo estos admiten `http` en claro)? */
export const isLocalHost = (host: string): boolean => LOCAL_HOSTS.includes(host.toLowerCase());

/**
 * ¿Es una dirección privada o de enlace local? Se rechaza SIEMPRE, con `http` y con `https`:
 * `10/8`, `172.16/12`, `192.168/16` (RFC 1918) y `169.254/16` (RFC 3927), además del enlace local
 * de IPv6 `fe80::/10` y `fc00::/7`.
 */
export const isPrivateHost = (host: string): boolean => {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (octets === null) {
    return false;
  }
  const [a, b] = [Number(octets[1]), Number(octets[2])];
  if (a === 10 || a === 127) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return a === 169 && b === 254;
};

/**
 * Valida el `rpcUrl` declarado por la dApp: `https` preferente y `http` **solo** para
 * `127.0.0.1`/`localhost`; se descartan los hosts privados y de enlace local y cualquier esquema
 * que no sea `http`/`https` (`ws:`, `file:`, `chrome-extension:`…).
 */
export const parseRpcUrl = (value: unknown): RpcUrlParseResult => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, problem: 'missing', received: value };
  }
  const text = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, problem: 'malformed', received: value };
  }
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    return { ok: false, problem: 'unsupported-scheme', received: value };
  }
  const host = parsed.hostname.toLowerCase();
  if (host.length === 0 || parsed.host.length === 0) {
    return { ok: false, problem: 'malformed', received: value };
  }
  if (!isLocalHost(host)) {
    if (isPrivateHost(host)) {
      return { ok: false, problem: 'private-host', received: value };
    }
    if (scheme === 'http') {
      // `http` en claro SOLO en el RPC local: cualquier otro host exige `https`.
      return { ok: false, problem: 'insecure-http', received: value };
    }
  }
  return { ok: true, rpcUrl: parsed.toString(), origin: parsed.origin, host, scheme };
};

// --- `isTestnet` y proyección de la red declarada por EIP-3085 --------------------------------

/** `chainId` decimales de redes principales conocidas: su `isTestnet` es `false` (RNF-23). */
const KNOWN_MAINNET_CHAIN_IDS: readonly number[] = [
  1, // Ethereum
  10, // OP Mainnet
  56, // BNB Smart Chain
  100, // Gnosis
  137, // Polygon
  250, // Fantom
  324, // zkSync Era
  8453, // Base
  42161, // Arbitrum One
  43114, // Avalanche C-Chain
];

/**
 * `isTestnet` de una red (RNF-23): manda el catálogo persistido —la red ya dada de alta conserva
 * su marca— y, si no está, la tabla cerrada de redes principales conocidas. Por defecto `true`:
 * una red desconocida NO dispara la advertencia de red real, porque el aviso exige certeza.
 */
export const isTestnetChain = (catalog: NetworksCatalog, parsed: ParsedChainId): boolean => {
  const registered = catalog[parsed.chainId];
  if (registered !== undefined) {
    return registered.isTestnet;
  }
  return !KNOWN_MAINNET_CHAIN_IDS.includes(parsed.chainIdDecimal);
};

/** Red declarada por EIP-3085, ya normalizada y validada (no persistida todavía). */
export interface ChainDeclaration {
  chainId: ChainIdHex;
  chainIdDecimal: number;
  name: string;
  rpcUrl: string;
  rpcOrigin: string;
  symbol: string;
  decimals: number;
  explorerUrl: string | null;
  isTestnet: boolean;
}

/** Motivo por el que una declaración de alta no se acepta (diagnóstico de la traza). */
export type ChainDeclarationProblem =
  | { field: 'chainId'; problem: ChainIdProblem }
  | { field: 'chainName'; problem: 'missing' | 'malformed' }
  | { field: 'rpcUrl'; problem: RpcUrlProblem }
  | { field: 'symbol'; problem: 'malformed' }
  | { field: 'decimals'; problem: 'malformed' };

/** Resultado de interpretar el objeto `params[0]` de `wallet_addEthereumChain`/`switch`. */
export type ChainDeclarationResult =
  | { ok: true; declaration: ChainDeclaration }
  | { ok: false; problem: ChainDeclarationProblem };

/** ¿Es un objeto plano utilizable como parámetro con nombre? */
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Interpreta y VALIDA los parámetros de EIP-3085 (`params[0]`): `chainId` (hex/decimal coherente),
 * `chainName`, `rpcUrls[0]` (esquema y host), `nativeCurrency.symbol` (por defecto `ETH`) y
 * `decimals` (por defecto 18); resuelve `isTestnet` contra el catálogo y la tabla de redes reales.
 *
 * No persiste nada: es la validación PREVIA que exige §3.5 antes de abrir la ventana y sin pedir
 * permiso.
 */
export const parseChainDeclaration = (
  value: unknown,
  catalog: NetworksCatalog,
): ChainDeclarationResult => {
  if (!isPlainRecord(value)) {
    return { ok: false, problem: { field: 'chainId', problem: 'malformed' } };
  }
  const parsed = parseChainId(value.chainId, value.chainIdDecimal);
  if (!parsed.ok) {
    return { ok: false, problem: { field: 'chainId', problem: parsed.problem } };
  }
  const chainName = typeof value.chainName === 'string' ? value.chainName.trim() : '';
  if (chainName.length === 0) {
    return { ok: false, problem: { field: 'chainName', problem: 'missing' } };
  }
  if (chainName.length > 64) {
    return { ok: false, problem: { field: 'chainName', problem: 'malformed' } };
  }
  const rpcUrls = Array.isArray(value.rpcUrls) ? value.rpcUrls : [];
  const rpc = parseRpcUrl(rpcUrls[0]);
  if (!rpc.ok) {
    return { ok: false, problem: { field: 'rpcUrl', problem: rpc.problem } };
  }
  const currency = isPlainRecord(value.nativeCurrency) ? value.nativeCurrency : {};
  const rawSymbol = currency.symbol;
  const symbol =
    rawSymbol === undefined || rawSymbol === null || rawSymbol === ''
      ? DEFAULT_CHAIN_SYMBOL
      : normalizeSymbol(rawSymbol);
  if (symbol === null) {
    return { ok: false, problem: { field: 'symbol', problem: 'malformed' } };
  }
  const rawDecimals = currency.decimals;
  const decimals =
    rawDecimals === undefined || rawDecimals === null ? DEFAULT_NATIVE_DECIMALS : rawDecimals;
  if (!isValidDecimals(decimals)) {
    return { ok: false, problem: { field: 'decimals', problem: 'malformed' } };
  }
  const explorers = Array.isArray(value.blockExplorerUrls) ? value.blockExplorerUrls : [];
  const explorerUrl = typeof explorers[0] === 'string' && explorers[0].trim().length > 0
    ? explorers[0].trim()
    : null;
  return {
    ok: true,
    declaration: {
      chainId: parsed.chainId,
      chainIdDecimal: parsed.chainIdDecimal,
      name: chainName,
      rpcUrl: rpc.rpcUrl,
      rpcOrigin: rpc.origin,
      symbol,
      decimals,
      explorerUrl,
      isTestnet: isTestnetChain(catalog, parsed),
    },
  };
};

/** Proyecta una declaración a la forma persistida `StoredNetwork` (`isDefault: false`, P-22). */
export const storedNetworkFromDeclaration = (declaration: ChainDeclaration): StoredNetwork => ({
  chainId: declaration.chainId,
  chainIdDecimal: declaration.chainIdDecimal,
  name: declaration.name,
  rpcUrl: declaration.rpcUrl,
  symbol: declaration.symbol,
  decimals: declaration.decimals,
  isTestnet: declaration.isTestnet,
  // El alta NUNCA activa la red (ADT-25 / P-22).
  isDefault: false,
  ...(declaration.explorerUrl === null ? {} : { explorerUrl: declaration.explorerUrl }),
});

/**
 * Da de alta (o reemplaza) una red en `truekeate_networks` **sin tocar `truekeate_chain_id`**:
 * es la escritura de la tarea 5.2, `ADT-25`/`P-22`. Devuelve el catálogo resultante.
 *
 * Se escribe la clave COMPLETA (nunca subclaves), como exige la regla de escritura de §2.6/§2.8.
 */
export const upsertNetwork = async (
  network: StoredNetwork,
  storage: NetworkStorage = undefined,
): Promise<NetworksCatalog> => {
  const current = await readNetworks(storage);
  const next: NetworksCatalog = { ...current, [network.chainId]: network };
  const written =
    storage === undefined
      ? await writeStorage({ [STORAGE_KEYS.networks]: next })
      : await writeStorage({ [STORAGE_KEYS.networks]: next }, storage);
  if (!written) {
    // Clave crítica: la operación se ABORTA con el `code` de §4.3 (`-32603`) y el estado no queda
    // a medias; el detalle de la red va en `data` de una traza, nunca en el literal de la tabla.
    throw storageQuotaExceededError();
  }
  return next;
};
