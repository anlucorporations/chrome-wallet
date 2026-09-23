/**
 * Inicio de la wallet (rediseño 2026-09-15).
 *
 * Estructura:
 *   1. Ficha de balance **deslizable**: carrusel de monedas (ETH + tokens
 *      añadidos). Al pulsar una operación, la ficha muestra la página de esa
 *      operación (Enviar / Recibir / Cambiar / Comprar) en línea.
 *   2. Barra de operaciones con iconos.
 *   3. Ficha con pestañas: Actividades · Tokens · NFTs · Contactos.
 *
 * Cada sección ocupa todo el ancho de la billetera (480 px), sin márgenes.
 */
import { useRef, useState } from 'react'
import TransferSection from './TransferSection'
import { RecibirQR } from './RecibirQR'
import { Cambiar } from './Cambiar'
import { Comprar } from './Comprar'
import { Tokens } from './Tokens'
import { NFT } from './NFT'
import { Actividad } from './Actividad'
import { Contactos } from './Contactos'
import { useTokens, type MonedaVista } from '../hooks/useTokens'

type Operacion = 'enviar' | 'recibir' | 'cambiar' | 'comprar'
type Pestana = 'actividades' | 'tokens' | 'nfts' | 'contactos'

const OPERACIONES: { id: Operacion; icono: string; titulo: string }[] = [
  { id: 'enviar', icono: '📤', titulo: 'Enviar' },
  { id: 'recibir', icono: '📥', titulo: 'Recibir' },
  { id: 'cambiar', icono: '🔄', titulo: 'Cambiar' },
  { id: 'comprar', icono: '🛒', titulo: 'Comprar' },
]

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'actividades', label: 'Actividades' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'nfts', label: 'NFTs' },
  { id: 'contactos', label: 'Contactos' },
]

export interface InicioProps {
  /** Dirección completa de la cuenta activa. */
  cuenta: string
  balanceETH: string
  balanceWei: bigint
  accounts: string[]
  currentAccountIndex: number
  chainId: string
  onTransfer: (toAccountIndex: number, amount: string) => Promise<string | undefined>
}

/** Muestra un saldo con separador de miles y hasta 6 decimales. */
function formatear(balance: string): string {
  const n = Number(balance)
  if (!Number.isFinite(n)) return balance
  return n.toLocaleString('es', { maximumFractionDigits: 6 })
}

export function Inicio({
  cuenta,
  balanceETH,
  balanceWei,
  accounts,
  currentAccountIndex,
  chainId,
  onTransfer,
}: InicioProps) {
  const [operacion, setOperacion] = useState<Operacion | null>(null)
  const [indice, setIndice] = useState(0)
  const [pestana, setPestana] = useState<Pestana>('actividades')
  const toque = useRef<number | null>(null)

  const tokens = useTokens(cuenta, chainId)
  const monedas: MonedaVista[] = [
    { id: 'eth', simbolo: 'ETH', nombre: 'Ether', balance: balanceETH, esETH: true },
    ...tokens,
  ]
  const total = monedas.length
  const actual = monedas[Math.min(indice, total - 1)]

  const mover = (delta: number) => setIndice((i) => ((i + delta) % total + total) % total)

  const alSoltar = (clientX: number) => {
    if (toque.current === null) return
    const dx = clientX - toque.current
    toque.current = null
    if (Math.abs(dx) >= 40) mover(dx < 0 ? 1 : -1)
  }

  return (
    <div className="tk-inicio">
      {/* 1 · Ficha de balance: carrusel de monedas o la operación elegida */}
      <section className="tk-balance" aria-label="Saldo">
        {operacion ? (
          <div className="tk-balance__operacion">
            <div className="tk-balance__operacion-cabecera">
              <button
                type="button"
                className="tk-balance__volver"
                onClick={() => setOperacion(null)}
                aria-label="Volver al saldo"
              >
                ←
              </button>
              <span className="tk-balance__operacion-titulo">
                {OPERACIONES.find((o) => o.id === operacion)?.titulo}
              </span>
            </div>
            <div className="tk-balance__operacion-cuerpo">
              {operacion === 'enviar' && (
                <TransferSection
                  accounts={accounts}
                  currentAccountIndex={currentAccountIndex}
                  balanceWei={balanceWei}
                  onTransfer={onTransfer}
                />
              )}
              {operacion === 'recibir' && cuenta && <RecibirQR address={cuenta} />}
              {operacion === 'cambiar' && cuenta && <Cambiar account={cuenta} chainId={chainId} />}
              {operacion === 'comprar' && cuenta && <Comprar account={cuenta} />}
            </div>
          </div>
        ) : (
          <div
            className="tk-balance__carrusel"
            onTouchStart={(e) => {
              toque.current = e.touches[0].clientX
            }}
            onTouchEnd={(e) => alSoltar(e.changedTouches[0].clientX)}
          >
            {total > 1 && (
              <button
                type="button"
                className="tk-balance__flecha"
                onClick={() => mover(-1)}
                aria-label="Moneda anterior"
              >
                ‹
              </button>
            )}
            <div className="tk-balance__slide" data-moneda={actual?.simbolo ?? 'ETH'}>
              <span className="tk-balance__simbolo">{actual?.simbolo ?? 'ETH'}</span>
              <span className="tk-balance__monto">
                {formatear(actual?.balance ?? '0')} {actual?.esETH ? 'ETH' : ''}
              </span>
              <span className="tk-balance__cuenta tk-mono">{cuenta}</span>
              {actual?.nombre && !actual.esETH && (
                <span className="tk-balance__nombre">{actual.nombre}</span>
              )}
            </div>
            {total > 1 && (
              <button
                type="button"
                className="tk-balance__flecha"
                onClick={() => mover(1)}
                aria-label="Moneda siguiente"
              >
                ›
              </button>
            )}
          </div>
        )}
        {!operacion && total > 1 && (
          <div className="tk-balance__puntos" role="tablist" aria-label="Monedas">
            {monedas.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={i === indice}
                aria-label={m.simbolo}
                className={`tk-balance__punto${i === indice ? ' tk-balance__punto--activo' : ''}`}
                onClick={() => setIndice(i)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 2 · Barra de operaciones */}
      <nav className="tk-ops" aria-label="Operaciones">
        {OPERACIONES.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`tk-ops__boton${operacion === o.id ? ' tk-ops__boton--activo' : ''}`}
            onClick={() => setOperacion(operacion === o.id ? null : o.id)}
            aria-pressed={operacion === o.id}
          >
            <span className="tk-ops__icono" aria-hidden>
              {o.icono}
            </span>
            <span className="tk-ops__texto">{o.titulo}</span>
          </button>
        ))}
      </nav>

      {/* 3 · Ficha con pestañas */}
      <section className="tk-ficha-tabs">
        <div className="tk-tabs__barra" role="tablist" aria-label="Detalle de la wallet">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
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
          {pestana === 'actividades' && cuenta && <Actividad account={cuenta} chainId={chainId} />}
          {pestana === 'tokens' && cuenta && <Tokens account={cuenta} chainId={chainId} />}
          {pestana === 'nfts' && cuenta && <NFT account={cuenta} chainId={chainId} />}
          {pestana === 'contactos' && <Contactos />}
        </div>
      </section>
    </div>
  )
}
