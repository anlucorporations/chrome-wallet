import type { ChainConfig } from '../types'

/**
 * Configuración de redes compartida por el service worker y las interfaces.
 *
 * Las redes por defecto viven en el código (anvil local y Sepolia) y las que
 * añade el usuario se guardan en `chrome.storage.local` bajo `codecrypto_chains`
 * con la forma del estándar EIP-3085/3326.
 */

export const CHAINS_KEY = 'codecrypto_chains'

export const LOCAL_CHAIN_ID = '0x7a69'   // 31337 — anvil (Foundry)
export const SEPOLIA_CHAIN_ID = '0xaa36a7' // 11155111

export const DEFAULT_CHAINS: ChainConfig[] = [
  {
    chainId: LOCAL_CHAIN_ID,
    name: 'Anvil Local (31337)',
    rpcUrl: 'http://127.0.0.1:8545',
    symbol: 'ETH',
    isDefault: true
  },
  {
    chainId: SEPOLIA_CHAIN_ID,
    name: 'Sepolia (11155111)',
    rpcUrl: 'https://rpc.sepolia.org',
    symbol: 'ETH',
    explorer: 'https://sepolia.etherscan.io',
    isDefault: true
  }
]

/**
 * Normaliza un chainId a hexadecimal en minúsculas con prefijo `0x`.
 * Acepta '0x7A69', '31337' o 31337.
 * @throws {Error} si el valor no es un chainId válido
 */
export function normalizeChainId(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`chainId inválido: ${value}`)
    return '0x' + value.toString(16)
  }
  const trimmed = String(value).trim()
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return '0x' + BigInt(trimmed).toString(16)
  if (/^[0-9]+$/.test(trimmed)) return '0x' + BigInt(trimmed).toString(16)
  throw new Error(`chainId inválido: ${value}`)
}

/** Versión tolerante: devuelve el valor original si no se puede normalizar. */
function normalizeSafe(value: string): string {
  try {
    return normalizeChainId(value)
  } catch {
    return String(value)
  }
}

/** Etiqueta legible de una red: nombre + chainId decimal. */
export function formatChainLabel(chain: ChainConfig): string {
  const decimal = Number(BigInt(normalizeSafe(chain.chainId)))
  return `${chain.name} (${decimal})`
}

/** Busca una red por chainId. */
export function findChain(chains: ChainConfig[], chainId: string): ChainConfig | undefined {
  const target = normalizeSafe(chainId)
  return chains.find((chain) => normalizeSafe(chain.chainId) === target)
}

/**
 * Icono (emoji) de una red por su chainId, para el indicador del pie.
 * Las redes desconocidas usan el globo terráqueo.
 */
export function iconoRed(chainId: string): string {
  const id = normalizeSafe(chainId)
  const iconos: Record<string, string> = {
    '0x1': '⟠', // Ethereum
    '0xa': '🔴', // Optimism
    '0x89': '🟪', // Polygon
    '0xa4b1': '🔷', // Arbitrum One
    '0x2105': '🔵', // Base
    '0xaa36a7': '🧪', // Sepolia
    '0x14a34': '🧪', // Base Sepolia
    '0x7a69': '🛠️', // Anvil local
  }
  return iconos[id] ?? '🌐'
}

/**
 * Fusiona las redes por defecto con las personalizadas.
 * Si el usuario vuelve a añadir un chainId ya existente, su configuración gana
 * (así se puede cambiar el RPC de una red predefinida).
 */
export function mergeChains(custom: ChainConfig[]): ChainConfig[] {
  const merged = new Map<string, ChainConfig>()
  for (const chain of DEFAULT_CHAINS) merged.set(normalizeSafe(chain.chainId), chain)
  for (const chain of custom) {
    merged.set(normalizeSafe(chain.chainId), { ...chain, isDefault: false })
  }
  return Array.from(merged.values())
}

/** Patrón de permiso de host necesario para llamar a un RPC: `http://127.0.0.1:8545/*`. */
export function rpcPermissionPattern(rpcUrl: string): string {
  const url = new URL(rpcUrl)
  return `${url.protocol}//${url.host}/*`
}
