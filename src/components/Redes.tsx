/**
 * Redes (M6 · RF-WN-21/22): lista de redes para conectar.
 *
 * Tres pestañas: Públicas, Pruebas y Personalizadas. Al conectar una red que la
 * wallet no conoce, se pide permiso de host para su RPC y se añade con el flujo
 * existente `wallet_addEthereumChain` (ChainManager). Bitcoin se muestra como
 * informativo (no EVM; decisión D-NW-3).
 */
import { useState } from 'react'
import { normalizeChainId, rpcPermissionPattern } from '../utils/chains'
import { sendRPCToBackground } from '../utils/rpc'
import { FormularioRed } from './FormularioRed'
import type { ChainConfig } from '../types'

interface RedConocida {
  chainId: string
  name: string
  rpcUrl: string
  symbol: string
  explorer?: string
  categoria: 'publica' | 'prueba'
}

const REDES: RedConocida[] = [
  { chainId: '0x1', name: 'Ethereum', rpcUrl: 'https://ethereum-rpc.publicnode.com', symbol: 'ETH', explorer: 'https://etherscan.io', categoria: 'publica' },
  { chainId: '0x2105', name: 'Base', rpcUrl: 'https://mainnet.base.org', symbol: 'ETH', explorer: 'https://basescan.org', categoria: 'publica' },
  { chainId: '0x89', name: 'Polygon', rpcUrl: 'https://polygon-rpc.com', symbol: 'POL', explorer: 'https://polygonscan.com', categoria: 'publica' },
  { chainId: '0xa4b1', name: 'Arbitrum One', rpcUrl: 'https://arb1.arbitrum.io/rpc', symbol: 'ETH', explorer: 'https://arbiscan.io', categoria: 'publica' },
  { chainId: '0xa', name: 'Optimism', rpcUrl: 'https://mainnet.optimism.io', symbol: 'ETH', explorer: 'https://optimistic.etherscan.io', categoria: 'publica' },
  { chainId: '0xaa36a7', name: 'Sepolia', rpcUrl: 'https://rpc.sepolia.org', symbol: 'ETH', explorer: 'https://sepolia.etherscan.io', categoria: 'prueba' },
  { chainId: '0x14a34', name: 'Base Sepolia', rpcUrl: 'https://sepolia.base.org', symbol: 'ETH', explorer: 'https://sepolia.basescan.org', categoria: 'prueba' },
]

type Pestana = 'publica' | 'prueba' | 'personalizadas'

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'publica', label: 'Públicas' },
  { id: 'prueba', label: 'Prueba' },
  { id: 'personalizadas', label: 'Personalizadas' },
]

export function Redes({
  chains,
  activeChainId,
  onSwitch,
  onChainsChanged,
}: {
  chains: ChainConfig[]
  activeChainId: string
  onSwitch: (chainId: string) => void
  onChainsChanged: (chains: ChainConfig[]) => void
}) {
  const [pestana, setPestana] = useState<Pestana>('publica')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)

  const norm = (id: string) => {
    try {
      return normalizeChainId(id)
    } catch {
      return String(id).toLowerCase()
    }
  }
  const activa = (id: string) => norm(activeChainId) === norm(id)
  const disponible = (id: string) => chains.some((c) => norm(c.chainId) === norm(id))

  const conectar = async (red: RedConocida) => {
    setError(null)
    if (disponible(red.chainId)) {
      onSwitch(norm(red.chainId))
      return
    }
    setBusy(red.chainId)
    try {
      const pattern = rpcPermissionPattern(red.rpcUrl)
      const granted = await chrome.permissions.request({ origins: [pattern] })
      if (!granted) throw new Error(`Permiso denegado para ${pattern}: sin él no se puede usar ese RPC`)
      const result = await sendRPCToBackground<{ chains: ChainConfig[] }>('wallet_addEthereumChain', [
        {
          chainId: norm(red.chainId),
          chainName: red.name,
          rpcUrls: [red.rpcUrl],
          nativeCurrency: { name: red.symbol, symbol: red.symbol, decimals: 18 },
          blockExplorerUrls: red.explorer ? [red.explorer] : undefined,
        },
      ])
      onChainsChanged(result.chains)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const personalizadas = chains.filter(
    (c) => !REDES.some((r) => norm(r.chainId) === norm(c.chainId)) && !c.isDefault
  )

  const fila = (opts: {
    nombre: string
    chainId: string
    nota?: string
    onConectar?: () => void
    conectada?: boolean
    activa?: boolean
    cargando?: boolean
  }) => (
    <li key={`${opts.chainId}:${opts.nombre}`} className="tk-red">
      <div className="tk-sitio__info">
        <span className="tk-sitio__origen">{opts.nombre}</span>
        <span className="tk-sitio__cuenta">
          {opts.nota ?? `Chain ID ${Number(BigInt(opts.chainId))}`}
        </span>
      </div>
      {opts.onConectar ? (
        <button className="tk-red__btn" onClick={opts.onConectar} disabled={opts.cargando || opts.activa}>
          {opts.cargando ? '⏳' : opts.activa ? '● Activa' : opts.conectada ? 'Conectar' : 'Añadir'}
        </button>
      ) : (
        <span className="tk-red__solo">solo informativo</span>
      )}
    </li>
  )

  return (
    <div className="tk-redes">
      <p className="tk-muted" style={{ fontSize: 10 }}>
        Red actual: <strong>{activeChainId}</strong>
      </p>

      <div className="tk-tabs__barra" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={pestana === p.id}
            className={`tk-tab${pestana === p.id ? ' tk-tab--activa' : ''}`}
            onClick={() => setPestana(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="tk-tabs__panel" role="tabpanel">
        {pestana === 'publica' && (
          <ul className="tk-redes__lista">
            {REDES.filter((r) => r.categoria === 'publica').map((r) =>
              fila({
                nombre: r.name,
                chainId: r.chainId,
                conectada: disponible(r.chainId),
                activa: activa(r.chainId),
                cargando: busy === r.chainId,
                onConectar: () => void conectar(r),
              })
            )}
            {/* Bitcoin: no EVM, solo listado (D-NW-3) */}
            {fila({ nombre: 'Bitcoin', chainId: '0x0', nota: 'No EVM · solo listado', onConectar: undefined })}
          </ul>
        )}

        {pestana === 'prueba' && (
          <ul className="tk-redes__lista">
            {REDES.filter((r) => r.categoria === 'prueba').map((r) =>
              fila({
                nombre: r.name,
                chainId: r.chainId,
                conectada: disponible(r.chainId),
                activa: activa(r.chainId),
                cargando: busy === r.chainId,
                onConectar: () => void conectar(r),
              })
            )}
          </ul>
        )}

        {pestana === 'personalizadas' && (
          <>
            <div className="tk-redes__acciones">
              <button
                type="button"
                className="tk-btn"
                onClick={() => setMostrarForm((v) => !v)}
                aria-expanded={mostrarForm}
              >
                {mostrarForm ? '✕ Cerrar' : '➕ Añadir red personalizada'}
              </button>
            </div>

            {mostrarForm && (
              <FormularioRed
                onAgregada={(nuevas) => {
                  onChainsChanged(nuevas)
                  setMostrarForm(false)
                }}
                onCancelar={() => setMostrarForm(false)}
              />
            )}

            {personalizadas.length === 0 ? (
              <p className="tk-muted" style={{ fontSize: 11 }}>
                Aún no hay redes personalizadas.
              </p>
            ) : (
              <ul className="tk-redes__lista">
                {personalizadas.map((c) =>
                  fila({
                    nombre: c.name,
                    chainId: c.chainId,
                    conectada: true,
                    activa: activa(c.chainId),
                    onConectar: () => onSwitch(norm(c.chainId)),
                  })
                )}
              </ul>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="tk-contactos__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
