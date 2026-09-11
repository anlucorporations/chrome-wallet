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
 *    cualquier otra red del corpus NO se siembran; su alta aprobable llega en H4/H5.
 * 2. **`chainId` validado**: se acepta la forma hexadecimal canónica (`0x` + hex). Un `chainId`
 *    con otra forma se descarta, de modo que `truekeate_chain_id` nunca propaga basura.
 * 3. **Reutiliza M33**: la lectura y la escritura del almacén pasan por `readStorage`/`writeStorage`
 *    de `state/schema.ts`; aquí no se escribe ninguna clave `truekeate_*` a mano.
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
