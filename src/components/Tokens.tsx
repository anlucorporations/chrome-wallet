/**
 * Pestaña "Tokens" (M2.1.6 · C2): lista ERC-20 añadidos por el usuario con su
 * saldo real en la red activa.
 *
 * Los datos se leen con `eth_call` a través del background (método ya existente)
 * y ethers solo codifica/decodifica las llamadas. La lista de tokens se guarda
 * en `chrome.storage.local` bajo `codecrypto_tokens`.
 *
 * No se modifica la lógica de firma/RPC: es una función de lectura de la UI.
 */
import { useCallback, useEffect, useState } from 'react'
import { Interface, formatUnits } from 'ethers'
import { sendRPCToBackground } from '../utils/rpc'

const ERC20 = new Interface([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
])

const CLAVE = 'codecrypto_tokens'
const RE_DIRECCION = /^0x[a-fA-F0-9]{40}$/

interface TokenGuardado {
  address: string
  chainId: string
}

interface TokenVista extends TokenGuardado {
  symbol: string
  nombre: string
  decimals: number
  balance: string
  error?: boolean
}

export function Tokens({ account, chainId }: { account: string; chainId: string }) {
  const [tokens, setTokens] = useState<TokenGuardado[]>([])
  const [vistas, setVistas] = useState<TokenVista[]>([])
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    void chrome.storage.local.get(CLAVE).then((s) => {
      setTokens((s[CLAVE] as TokenGuardado[]) || [])
    })
  }, [])

  const guardar = useCallback(async (lista: TokenGuardado[]) => {
    setTokens(lista)
    await chrome.storage.local.set({ [CLAVE]: lista })
  }, [])

  /** Lee metadatos + saldo de un token con eth_call. */
  const leerToken = useCallback(
    async (t: TokenGuardado): Promise<TokenVista> => {
      const base: TokenVista = {
        ...t,
        symbol: `${t.address.slice(0, 6)}…${t.address.slice(-4)}`,
        nombre: '',
        decimals: 18,
        balance: '0',
      }
      try {
        const llamar = (fn: string, args: unknown[] = []) =>
          sendRPCToBackground<string>('eth_call', [
            { to: t.address, data: ERC20.encodeFunctionData(fn, args) },
            'latest',
          ])

        const [decHex, simHex, nomHex, balHex] = await Promise.all([
          llamar('decimals').catch(() => null),
          llamar('symbol').catch(() => null),
          llamar('name').catch(() => null),
          llamar('balanceOf', [account]),
        ])

        if (decHex) base.decimals = Number(ERC20.decodeFunctionResult('decimals', decHex)[0])
        if (simHex) base.symbol = String(ERC20.decodeFunctionResult('symbol', simHex)[0])
        if (nomHex) base.nombre = String(ERC20.decodeFunctionResult('name', nomHex)[0])
        const bruto = ERC20.decodeFunctionResult('balanceOf', balHex)[0] as bigint
        base.balance = formatUnits(bruto, base.decimals)
        return base
      } catch {
        return { ...base, error: true }
      }
    },
    [account]
  )

  // Recargar las vistas cuando cambian la cuenta, la red o la lista de tokens.
  useEffect(() => {
    let cancelado = false
    if (!account || tokens.length === 0) {
      setVistas([])
      return
    }
    setCargando(true)
    const deLaRed = tokens.filter((t) => t.chainId === chainId)
    void Promise.all(deLaRed.map((t) => leerToken(t))).then((resultado) => {
      if (!cancelado) {
        setVistas(resultado)
        setCargando(false)
      }
    })
    return () => {
      cancelado = true
    }
  }, [account, chainId, tokens, leerToken])

  const agregar = () => {
    const dir = nueva.trim()
    if (!RE_DIRECCION.test(dir)) {
      setError('Dirección de token inválida (0x + 40 hex).')
      return
    }
    const direccion = dir.toLowerCase()
    if (tokens.some((t) => t.address === direccion && t.chainId === chainId)) {
      setError('Ese token ya está en la lista para esta red.')
      return
    }
    void guardar([...tokens, { address: direccion, chainId }])
    setNueva('')
    setError(null)
  }

  const quitar = (t: TokenVista) => {
    void guardar(tokens.filter((x) => !(x.address === t.address && x.chainId === t.chainId)))
  }

  const formatear = (v: string) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return v
    return n.toLocaleString('es', { maximumFractionDigits: 6 })
  }

  return (
    <div className="tk-tokens">
      <div className="tk-tokens__form">
        <input
          className="tk-input tk-mono"
          placeholder="Dirección del token (0x…)"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        <button className="tk-btn" onClick={agregar}>
          ➕ Añadir
        </button>
      </div>
      {error && (
        <p className="tk-contactos__error" role="alert">
          {error}
        </p>
      )}

      {cargando && (
        <p className="tk-muted" style={{ fontSize: 11 }}>
          Leyendo saldos…
        </p>
      )}

      {vistas.length === 0 && !cargando ? (
        <p className="tk-muted" style={{ fontSize: 11 }}>
          Añade un token ERC-20 por su dirección para ver su saldo.
        </p>
      ) : (
        <ul className="tk-sitios">
          {vistas.map((t) => (
            <li key={`${t.chainId}:${t.address}`} className="tk-sitio">
              <div className="tk-sitio__info">
                <span className="tk-sitio__origen">
                  {t.error ? 'Token no ERC-20' : t.symbol}
                  {t.nombre ? ` · ${t.nombre}` : ''}
                </span>
                <span className="tk-sitio__cuenta">
                  {t.error ? t.address : formatear(t.balance)}
                </span>
              </div>
              <button className="tk-sitio__desconectar" title="Quitar token" onClick={() => quitar(t)}>
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
