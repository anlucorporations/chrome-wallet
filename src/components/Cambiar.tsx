/**
 * Cambiar (M2.1.4 · swap). Intercambio ERC-20 → ERC-20 contra un router
 * compatible con Uniswap V2 que indica el usuario.
 *
 * No se fija un router por red (las direcciones varían y algunas redes no tienen
 * V2): el usuario pega el router de su DEX. El flujo es el estándar de dos
 * pasos —aprobar el token y ejecutar el swap— porque la wallet no espera el
 * recibo de la aprobación (no expone eth_getTransactionReceipt). La cotización
 * es de solo lectura (`getAmountsOut`).
 */
import { useCallback, useEffect, useState } from 'react'
import { Interface, formatUnits, parseUnits } from 'ethers'
import { sendRPCToBackground } from '../utils/rpc'

const ROUTER = new Interface([
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
])
const ERC20 = new Interface([
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

const CLAVE = 'codecrypto_tokens'
const RE_DIRECCION = /^0x[a-fA-F0-9]{40}$/

interface TokenGuardado {
  address: string
  chainId: string
}

const acortar = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

export function Cambiar({ account, chainId }: { account: string; chainId: string }) {
  const [tokens, setTokens] = useState<TokenGuardado[]>([])
  const [router, setRouter] = useState('')
  const [desde, setDesde] = useState('')
  const [hacia, setHacia] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [cotizacion, setCotizacion] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    void chrome.storage.local.get(CLAVE).then((s) => {
      const lista = ((s[CLAVE] as TokenGuardado[]) || []).filter((t) => t.chainId === chainId)
      setTokens(lista)
      if (lista[0]) setDesde(lista[0].address)
      if (lista[1]) setHacia(lista[1].address)
    })
  }, [chainId])

  const leerDecimales = useCallback(async (token: string): Promise<number> => {
    const hex = await sendRPCToBackground<string>('eth_call', [
      { to: token, data: ERC20.encodeFunctionData('decimals') },
      'latest',
    ])
    return Number(ERC20.decodeFunctionResult('decimals', hex)[0])
  }, [])

  const cotizar = useCallback(async () => {
    setAviso(null)
    setCotizacion(null)
    if (!RE_DIRECCION.test(router)) {
      setAviso('Indica la dirección del router del DEX (compatible Uniswap V2).')
      return
    }
    if (!desde || !hacia || desde === hacia) {
      setAviso('Elige dos tokens distintos.')
      return
    }
    setCargando(true)
    try {
      const dec = await leerDecimales(desde)
      const amountIn = parseUnits(cantidad || '0', dec)
      if (amountIn <= 0n) throw new Error('Cantidad inválida')
      const hex = await sendRPCToBackground<string>('eth_call', [
        { to: router, data: ROUTER.encodeFunctionData('getAmountsOut', [amountIn, [desde, hacia]]) },
        'latest',
      ])
      const amounts = ROUTER.decodeFunctionResult('getAmountsOut', hex)[0] as bigint[]
      const out = amounts[amounts.length - 1]
      const decOut = await leerDecimales(hacia)
      setCotizacion(formatUnits(out, decOut))
    } catch (e) {
      setAviso(`No se pudo cotizar: ${(e as Error).message}`)
    } finally {
      setCargando(false)
    }
  }, [router, desde, hacia, cantidad, leerDecimales])

  const aprobar = async () => {
    setAviso(null)
    setCargando(true)
    try {
      const dec = await leerDecimales(desde)
      const amountIn = parseUnits(cantidad || '0', dec)
      const hex = await sendRPCToBackground<string>('eth_call', [
        { to: desde, data: ERC20.encodeFunctionData('allowance', [account, router]) },
        'latest',
      ])
      const actual = ERC20.decodeFunctionResult('allowance', hex)[0] as bigint
      if (actual >= amountIn) {
        setAviso('✅ El router ya tiene permiso suficiente; puedes intercambiar.')
        return
      }
      await sendRPCToBackground('eth_sendTransaction', [
        { from: account, to: desde, data: ERC20.encodeFunctionData('approve', [router, amountIn]), value: '0x0' },
      ])
      setAviso('✅ Aprobación enviada. Espera a que se confirme y pulsa «Intercambiar».')
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  const intercambiar = async () => {
    setAviso(null)
    setCargando(true)
    try {
      const dec = await leerDecimales(desde)
      const amountIn = parseUnits(cantidad || '0', dec)
      const decOut = await leerDecimales(hacia)
      const hex = await sendRPCToBackground<string>('eth_call', [
        { to: router, data: ROUTER.encodeFunctionData('getAmountsOut', [amountIn, [desde, hacia]]) },
        'latest',
      ])
      const amounts = ROUTER.decodeFunctionResult('getAmountsOut', hex)[0] as bigint[]
      const esperado = amounts[amounts.length - 1]
      const bps = BigInt(Math.round((Number(slippage) || 0.5) * 100))
      const minimo = (esperado * (10000n - bps)) / 10000n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      await sendRPCToBackground('eth_sendTransaction', [
        {
          from: account,
          to: router,
          data: ROUTER.encodeFunctionData('swapExactTokensForTokens', [
            amountIn,
            minimo,
            [desde, hacia],
            account,
            deadline,
          ]),
          value: '0x0',
        },
      ])
      setAviso(`✅ Swap enviado (mínimo recibido: ${formatUnits(minimo, decOut)}).`)
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="tk-cambiar">
      <input
        className="tk-input tk-mono"
        placeholder="Router del DEX (0x…, Uniswap V2)"
        value={router}
        onChange={(e) => setRouter(e.target.value.trim())}
      />
      <div className="tk-cambiar__fila">
        <select className="tk-input" value={desde} onChange={(e) => setDesde(e.target.value)}>
          <option value="">Token origen…</option>
          {tokens.map((t) => (
            <option key={t.address} value={t.address}>
              {acortar(t.address)}
            </option>
          ))}
        </select>
        <span className="tk-cambiar__flecha" aria-hidden>
          ⇄
        </span>
        <select className="tk-input" value={hacia} onChange={(e) => setHacia(e.target.value)}>
          <option value="">Token destino…</option>
          {tokens.map((t) => (
            <option key={t.address} value={t.address}>
              {acortar(t.address)}
            </option>
          ))}
        </select>
      </div>
      <div className="tk-cambiar__fila">
        <input
          className="tk-input"
          placeholder="Cantidad"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
        <input
          className="tk-input"
          placeholder="Slippage %"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
        />
      </div>

      <div className="tk-cambiar__acciones">
        <button className="tk-btn" onClick={() => void cotizar()} disabled={cargando}>
          📈 Cotizar
        </button>
        <button className="tk-btn tk-btn--outline" onClick={() => void aprobar()} disabled={cargando}>
          1️⃣ Aprobar
        </button>
        <button className="tk-btn" onClick={() => void intercambiar()} disabled={cargando}>
          2️⃣ Intercambiar
        </button>
      </div>

      {cotizacion && (
        <p className="tk-muted" style={{ fontSize: 11 }}>
          Recibirías ≈ <strong>{cotizacion}</strong> del token destino.
        </p>
      )}
      {tokens.length < 2 && (
        <p className="tk-muted" style={{ fontSize: 10 }}>
          Añade al menos dos tokens ERC-20 en la pestaña «Tokens» para poder cambiar.
        </p>
      )}
      {aviso && (
        <p className={aviso.startsWith('✅') ? 'tk-muted' : 'tk-contactos__error'} role="alert">
          {aviso}
        </p>
      )}
    </div>
  )
}
