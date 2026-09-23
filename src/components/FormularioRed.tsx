/**
 * FormularioRed — alta de una red EVM personalizada.
 *
 * Pide permiso de host SOLO para el RPC indicado (permiso opcional del manifest)
 * y delega el alta en el service worker (`wallet_addEthereumChain`), que valida
 * que ese RPC responde con el chainId declarado. Lo usa la pestaña
 * «Personalizadas» de la página Redes.
 */
import { useState } from 'react'
import { normalizeChainId, rpcPermissionPattern } from '../utils/chains'
import { sendRPCToBackground } from '../utils/rpc'
import type { ChainConfig } from '../types'

const EMPTY_FORM = {
  name: '',
  rpcUrl: '',
  chainId: '',
  symbol: 'ETH',
  explorer: '',
}

export function FormularioRed({
  onAgregada,
  onCancelar,
}: {
  onAgregada: (chains: ChainConfig[]) => void
  onCancelar?: () => void
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const update = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    let chainIdHex = ''
    let pattern = ''
    try {
      chainIdHex = normalizeChainId(form.chainId)
      pattern = rpcPermissionPattern(form.rpcUrl.trim())
    } catch (err) {
      setError((err as Error).message)
      return
    }
    if (!form.rpcUrl.trim()) {
      setError('La URL del RPC es obligatoria.')
      return
    }

    setBusy(true)
    try {
      // 1. Permiso de host para ese RPC (dentro del gesto del usuario)
      const granted = await chrome.permissions.request({ origins: [pattern] })
      if (!granted) {
        throw new Error(`Permiso denegado para ${pattern}: sin él la wallet no puede usar ese RPC`)
      }

      // 2. Alta de la red en el service worker (valida el RPC y persiste)
      const result = await sendRPCToBackground<{ chains: ChainConfig[]; chainId: string }>(
        'wallet_addEthereumChain',
        [
          {
            chainId: chainIdHex,
            chainName: form.name.trim() || `Red ${chainIdHex}`,
            rpcUrls: [form.rpcUrl.trim()],
            nativeCurrency: {
              name: form.symbol.trim() || 'ETH',
              symbol: form.symbol.trim() || 'ETH',
              decimals: 18,
            },
            blockExplorerUrls: form.explorer.trim() ? [form.explorer.trim()] : undefined,
          },
        ]
      )

      onAgregada(result.chains)
      setForm(EMPTY_FORM)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="tk-red-form" onSubmit={handleSubmit}>
      <label className="tk-red-form__campo">
        <span>Nombre de la red</span>
        <input
          className="tk-input"
          type="text"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="Polygon Amoy"
          disabled={busy}
        />
      </label>

      <label className="tk-red-form__campo">
        <span>URL del RPC *</span>
        <input
          className="tk-input tk-mono"
          type="url"
          value={form.rpcUrl}
          onChange={(e) => update('rpcUrl', e.target.value)}
          placeholder="https://rpc-amoy.polygon.technology"
          required
          disabled={busy}
        />
      </label>

      <div className="tk-red-form__fila">
        <label className="tk-red-form__campo">
          <span>Chain ID *</span>
          <input
            className="tk-input tk-mono"
            type="text"
            value={form.chainId}
            onChange={(e) => update('chainId', e.target.value)}
            placeholder="80002 o 0x13882"
            required
            disabled={busy}
          />
        </label>
        <label className="tk-red-form__campo">
          <span>Símbolo</span>
          <input
            className="tk-input"
            type="text"
            value={form.symbol}
            onChange={(e) => update('symbol', e.target.value)}
            placeholder="ETH"
            disabled={busy}
          />
        </label>
      </div>

      <label className="tk-red-form__campo">
        <span>Explorador (opcional)</span>
        <input
          className="tk-input"
          type="url"
          value={form.explorer}
          onChange={(e) => update('explorer', e.target.value)}
          placeholder="https://amoy.polygonscan.com"
          disabled={busy}
        />
      </label>

      <p className="tk-muted" style={{ fontSize: 10, margin: 0 }}>
        Se pedirá permiso para llamar solo a ese RPC y se comprobará que responde con el chainId
        indicado.
      </p>

      {error && (
        <p className="tk-contactos__error" role="alert">
          {error}
        </p>
      )}

      <div className="tk-red-form__acciones">
        <button className="tk-btn" type="submit" disabled={busy}>
          {busy ? '⏳ Añadiendo…' : '💾 Añadir red'}
        </button>
        {onCancelar && (
          <button className="tk-btn tk-btn--outline" type="button" onClick={onCancelar} disabled={busy}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
