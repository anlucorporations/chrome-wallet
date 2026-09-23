/**
 * Pestaña "Actividad" (M2.1.6 · C2): movimientos de la billetera.
 *
 * Lee los eventos ERC-20 `Transfer` de los últimos bloques en los que participa
 * la cuenta (entrada y salida) mediante `eth_getLogs` (método de solo lectura
 * añadido al background) y resuelve el símbolo/decimales de cada token con
 * `eth_call`. Cada movimiento se puede desplegar para ver su detalle.
 *
 * No toca la lógica de firma/RPC/bóveda: es lectura para la interfaz.
 */
import { useCallback, useEffect, useState } from 'react'
import { Interface, formatUnits } from 'ethers'
import { sendRPCToBackground } from '../utils/rpc'

/** Nº de bloques hacia atrás que se consultan (evita rangos enormes en el RPC). */
const VENTANA_BLOQUES = 5000

const ERC20 = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])
const TEMA_TRANSFER = ERC20.getEvent('Transfer')!.topicHash

interface LogPlano {
  address: string
  topics: string[]
  data: string
  blockNumber: number
  transactionHash: string
  index: number
}

interface Movimiento {
  hash: string
  bloque: number
  indice: number
  token: string
  symbol: string
  decimals: number
  from: string
  to: string
  valor: string
  direccion: 'entrada' | 'salida'
  contraparte: string
}

const acortar = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)
const temaDeDireccion = (a: string) => '0x' + a.toLowerCase().slice(2).padStart(64, '0')

export function Actividad({ account, chainId }: { account: string; chainId: string }) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!account) return
    setCargando(true)
    setError(null)
    try {
      const hex = await sendRPCToBackground<string>('eth_blockNumber')
      const ultimo = parseInt(hex, 16)
      const desde = Math.max(0, ultimo - VENTANA_BLOQUES)
      const rango = { fromBlock: `0x${desde.toString(16)}`, toBlock: 'latest' }
      const tema = temaDeDireccion(account)

      const [entrantes, salientes] = await Promise.all([
        sendRPCToBackground<LogPlano[]>('eth_getLogs', [
          { ...rango, topics: [TEMA_TRANSFER, null, tema] },
        ]),
        sendRPCToBackground<LogPlano[]>('eth_getLogs', [
          { ...rango, topics: [TEMA_TRANSFER, tema] },
        ]),
      ])

      // Metadatos (símbolo/decimales) de cada token implicado, una vez por token.
      const tokens = [...new Set([...entrantes, ...salientes].map((l) => l.address.toLowerCase()))]
      const meta: Record<string, { symbol: string; decimals: number }> = {}
      await Promise.all(
        tokens.map(async (dir) => {
          try {
            const [simHex, decHex] = await Promise.all([
              sendRPCToBackground<string>('eth_call', [
                { to: dir, data: ERC20.encodeFunctionData('symbol') },
                'latest',
              ]).catch(() => null),
              sendRPCToBackground<string>('eth_call', [
                { to: dir, data: ERC20.encodeFunctionData('decimals') },
                'latest',
              ]).catch(() => null),
            ])
            meta[dir] = {
              symbol: simHex ? String(ERC20.decodeFunctionResult('symbol', simHex)[0]) : acortar(dir),
              decimals: decHex ? Number(ERC20.decodeFunctionResult('decimals', decHex)[0]) : 18,
            }
          } catch {
            meta[dir] = { symbol: acortar(dir), decimals: 18 }
          }
        })
      )

      const vistos = new Set<string>()
      const lista: Movimiento[] = []
      const mapear = (l: LogPlano, direccion: 'entrada' | 'salida') => {
        const clave = `${l.transactionHash}:${l.index}`
        if (vistos.has(clave)) return
        vistos.add(clave)
        try {
          const dec = ERC20.decodeEventLog('Transfer', l.data, l.topics)
          const from = String(dec.from)
          const to = String(dec.to)
          const bruto = dec.value as bigint
          const dir = l.address.toLowerCase()
          const meta2 = meta[dir] ?? { symbol: acortar(dir), decimals: 18 }
          lista.push({
            hash: l.transactionHash,
            bloque: l.blockNumber,
            indice: l.index,
            token: dir,
            symbol: meta2.symbol,
            decimals: meta2.decimals,
            from,
            to,
            valor: formatUnits(bruto, meta2.decimals),
            direccion,
            contraparte: direccion === 'entrada' ? from : to,
          })
        } catch {
          /* log no decodificable: se omite */
        }
      }
      entrantes.forEach((l) => mapear(l, 'entrada'))
      salientes.forEach((l) => mapear(l, 'salida'))
      lista.sort((a, b) => b.bloque - a.bloque || b.indice - a.indice)
      setMovimientos(lista)
    } catch (e) {
      setError((e as Error).message)
      setMovimientos([])
    } finally {
      setCargando(false)
    }
  }, [account])

  useEffect(() => {
    void cargar()
  }, [cargar, chainId])

  const formatear = (v: string) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return v
    return n.toLocaleString('es', { maximumFractionDigits: 6 })
  }

  return (
    <div className="tk-actividad">
      <div className="tk-actividad__barra">
        <span className="tk-muted" style={{ fontSize: 10 }}>
          Últimos {VENTANA_BLOQUES.toLocaleString('es')} bloques
        </span>
        <button className="tk-btn tk-actividad__refrescar" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? '⏳' : '🔄'} Actualizar
        </button>
      </div>

      {error && (
        <p className="tk-contactos__error" role="alert">
          No se pudo leer la actividad: {error}
        </p>
      )}

      {!cargando && !error && movimientos.length === 0 ? (
        <p className="tk-muted" style={{ fontSize: 11 }}>
          Sin movimientos ERC-20 en este rango. (Las transferencias de ETH nativo
          se añaden en un ciclo posterior.)
        </p>
      ) : (
        <ul className="tk-movs">
          {movimientos.map((m) => {
            const abierto = detalle === `${m.hash}:${m.indice}`
            return (
              <li key={`${m.hash}:${m.indice}`} className="tk-mov">
                <button className="tk-mov__fila" onClick={() => setDetalle(abierto ? null : `${m.hash}:${m.indice}`)}>
                  <span className={`tk-mov__signo ${m.direccion === 'entrada' ? 'tk-mov__signo--in' : 'tk-mov__signo--out'}`}>
                    {m.direccion === 'entrada' ? '↓' : '↑'}
                  </span>
                  <span className="tk-mov__info">
                    <span className="tk-mov__titulo">
                      {m.direccion === 'entrada' ? 'Entrada' : 'Salida'} · {m.symbol}
                    </span>
                    <span className="tk-mov__sub">
                      {m.direccion === 'entrada' ? 'de' : 'a'} {acortar(m.contraparte)} · bloque {m.bloque}
                    </span>
                  </span>
                  <span className="tk-mov__valor">
                    {m.direccion === 'entrada' ? '+' : '−'}
                    {formatear(m.valor)}
                  </span>
                </button>
                {abierto && (
                  <div className="tk-mov__detalle">
                    <div>
                      <span className="tk-mov__etq">Hash</span>
                      <span className="tk-mono">{m.hash}</span>
                    </div>
                    <div>
                      <span className="tk-mov__etq">Token</span>
                      <span className="tk-mono">{m.token}</span>
                    </div>
                    <div>
                      <span className="tk-mov__etq">De</span>
                      <span className="tk-mono">{m.from}</span>
                    </div>
                    <div>
                      <span className="tk-mov__etq">Para</span>
                      <span className="tk-mono">{m.to}</span>
                    </div>
                    <div>
                      <span className="tk-mov__etq">Valor</span>
                      <span>
                        {formatear(m.valor)} {m.symbol}
                      </span>
                    </div>
                    <div>
                      <span className="tk-mov__etq">Bloque</span>
                      <span>{m.bloque}</span>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
