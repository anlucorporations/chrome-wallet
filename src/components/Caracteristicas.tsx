/**
 * Sección "Características" (M2.1.6): pestañas Tokens / DeFi / NFT / Actividad.
 *
 * Solo "Tokens" está operativa en este ciclo (saldos ERC-20 reales); DeFi, NFT
 * y Actividad se habilitan en el ciclo C2 según las decisiones D-NW-2/D-NW-3.
 */
import { useState } from 'react'
import { Tokens } from './Tokens'
import { Actividad } from './Actividad'
import { NFT } from './NFT'

type Pestana = 'tokens' | 'defi' | 'nft' | 'actividad'

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'defi', label: 'DeFi' },
  { id: 'nft', label: 'NFT' },
  { id: 'actividad', label: 'Actividad' },
]

export function Caracteristicas({ account, chainId }: { account: string; chainId: string }) {
  const [pestana, setPestana] = useState<Pestana>('tokens')

  return (
    <div className="tk-tabs">
      <div className="tk-tabs__barra" role="tablist">
        {PESTANAS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={pestana === t.id}
            className={`tk-tab${pestana === t.id ? ' tk-tab--activa' : ''}`}
            onClick={() => setPestana(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tk-tabs__panel" role="tabpanel">
        {pestana === 'tokens' && <Tokens account={account} chainId={chainId} />}
        {pestana === 'defi' && (
          <p className="tk-muted" style={{ fontSize: 11 }}>
            DeFi: placeholder (D-NW-2); se conecta en un ciclo posterior.
          </p>
        )}
        {pestana === 'nft' && <NFT account={account} chainId={chainId} />}
        {pestana === 'actividad' && <Actividad account={account} chainId={chainId} />}
      </div>
    </div>
  )
}
