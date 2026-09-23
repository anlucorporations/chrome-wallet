/**
 * useTokens — lee los tokens ERC-20 añadidos por el usuario y su saldo real en
 * la red activa, para el carrusel de monedas del inicio.
 *
 * Reutiliza el mismo `chrome.storage.local` (`codecrypto_tokens`) y el mismo
 * método de lectura (`eth_call` vía background) que la pestaña Tokens, y se
 * recarga sola cuando la lista cambia. No toca la lógica de firma/RPC.
 */
import { useEffect, useState } from 'react'
import { Interface, formatUnits } from 'ethers'
import { sendRPCToBackground } from '../utils/rpc'

const ERC20 = new Interface([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
])

const CLAVE = 'codecrypto_tokens'

interface TokenGuardado {
  address: string
  chainId: string
}

/** Moneda lista para pintar en el carrusel de saldo. */
export interface MonedaVista {
  /** `eth` o la dirección del token. */
  id: string
  simbolo: string
  nombre: string
  balance: string
  esETH: boolean
  error?: boolean
}

/** Abrevia una dirección para mostrarla. */
function acortar(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

export function useTokens(account: string, chainId: string): MonedaVista[] {
  const [tokens, setTokens] = useState<MonedaVista[]>([])
  const [version, setVersion] = useState(0)

  // Recargar cuando la pestaña Tokens añade o quita un token.
  useEffect(() => {
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && CLAVE in changes) setVersion((v) => v + 1)
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  useEffect(() => {
    let cancelado = false
    void chrome.storage.local.get(CLAVE).then(async (s) => {
      const lista = ((s[CLAVE] as TokenGuardado[]) || []).filter((t) => t.chainId === chainId)
      if (!account || lista.length === 0) {
        if (!cancelado) setTokens([])
        return
      }
      const vistas = await Promise.all(
        lista.map(async (t): Promise<MonedaVista> => {
          const base: MonedaVista = {
            id: t.address,
            simbolo: acortar(t.address),
            nombre: '',
            balance: '0',
            esETH: false,
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
            let decimals = 18
            if (decHex) decimals = Number(ERC20.decodeFunctionResult('decimals', decHex)[0])
            if (simHex) base.simbolo = String(ERC20.decodeFunctionResult('symbol', simHex)[0])
            if (nomHex) base.nombre = String(ERC20.decodeFunctionResult('name', nomHex)[0])
            const bruto = ERC20.decodeFunctionResult('balanceOf', balHex)[0] as bigint
            base.balance = formatUnits(bruto, decimals)
            return base
          } catch {
            return { ...base, error: true }
          }
        })
      )
      if (!cancelado) setTokens(vistas)
    })
    return () => {
      cancelado = true
    }
  }, [account, chainId, version])

  return tokens
}
