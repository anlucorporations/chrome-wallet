/// <reference types="chrome"/>
import { useState } from 'react'
import { normalizeChainId, rpcPermissionPattern } from '../utils/chains'
import { sendRPCToBackground } from '../utils/rpc'
import type { ChainConfig } from '../types'

/**
 * Gestión de redes: selector dinámico + alta de redes personalizadas.
 *
 * Al añadir una red, primero se pide permiso de host **solo para su RPC**
 * (`chrome.permissions.request`, declarado como permiso opcional en el manifest)
 * y después el service worker valida que el RPC responde con ese chainId.
 */
interface ChainManagerProps {
  chains: ChainConfig[]
  activeChainId: string
  onSwitch: (chainId: string) => void
  onChainsChanged: (chains: ChainConfig[]) => void
}

const EMPTY_FORM = {
  name: '',
  rpcUrl: '',
  chainId: '',
  symbol: 'ETH',
  explorer: ''
}

function ChainManager({ chains, activeChainId, onSwitch, onChainsChanged }: ChainManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const update = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
    setSuccess('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    let chainIdHex = ''
    let pattern = ''
    try {
      chainIdHex = normalizeChainId(form.chainId)
      pattern = rpcPermissionPattern(form.rpcUrl.trim())
    } catch (err) {
      setError((err as Error).message)
      return
    }

    setBusy(true)
    try {
      // 1. Permiso de host para ese RPC (debe pedirse dentro del gesto del usuario)
      const granted = await chrome.permissions.request({ origins: [pattern] })
      if (!granted) {
        throw new Error(`Permiso denegado para ${pattern}: sin él la wallet no puede usar ese RPC`)
      }

      // 2. Alta de la red en el service worker (valida el RPC y persiste)
      const result = await sendRPCToBackground<{ chains: ChainConfig[]; chainId: string }>(
        'wallet_addEthereumChain',
        [{
          chainId: chainIdHex,
          chainName: form.name.trim() || `Red ${chainIdHex}`,
          rpcUrls: [form.rpcUrl.trim()],
          nativeCurrency: {
            name: form.symbol.trim() || 'ETH',
            symbol: form.symbol.trim() || 'ETH',
            decimals: 18
          },
          blockExplorerUrls: form.explorer.trim() ? [form.explorer.trim()] : undefined
        }]
      )

      onChainsChanged(result.chains)
      setSuccess(`✅ Red añadida y activada: ${form.name.trim() || chainIdHex}`)
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="info-section">
      <h3>Red</h3>
      <p className="chain-active">
        Chain ID: {activeChainId} ({Number(BigInt(activeChainId))})
      </p>

      <div className="chain-buttons">
        {chains.map((chain) => (
          <button
            key={chain.chainId}
            onClick={() => onSwitch(chain.chainId)}
            disabled={activeChainId === chain.chainId}
            title={chain.rpcUrl}
          >
            {chain.isDefault ? chain.name : `⭐ ${chain.name}`}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="secondary-button add-chain-toggle"
        onClick={() => { setShowForm((prev) => !prev); setError(''); setSuccess('') }}
      >
        {showForm ? '✕ Cancelar' : '➕ Añadir red'}
      </button>

      {success && <div className="form-success">{success}</div>}
      {error && <div className="form-error">⚠️ {error}</div>}

      {showForm && (
        <form className="chain-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre de la red</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Polygon Amoy"
              disabled={busy}
            />
          </div>
          <div className="form-group">
            <label>URL del RPC *</label>
            <input
              type="url"
              value={form.rpcUrl}
              onChange={(e) => update('rpcUrl', e.target.value)}
              placeholder="https://rpc-amoy.polygon.technology"
              required
              disabled={busy}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Chain ID *</label>
              <input
                type="text"
                value={form.chainId}
                onChange={(e) => update('chainId', e.target.value)}
                placeholder="80002 o 0x13882"
                required
                disabled={busy}
              />
            </div>
            <div className="form-group">
              <label>Símbolo</label>
              <input
                type="text"
                value={form.symbol}
                onChange={(e) => update('symbol', e.target.value)}
                placeholder="ETH"
                disabled={busy}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Explorador (opcional)</label>
            <input
              type="url"
              value={form.explorer}
              onChange={(e) => update('explorer', e.target.value)}
              placeholder="https://amoy.polygonscan.com"
              disabled={busy}
            />
          </div>

          <small className="field-hint">
            Al guardar se pedirá permiso para llamar solo a ese RPC y se comprobará
            que responde con el chainId indicado.
          </small>

          <button type="submit" disabled={busy}>
            {busy ? '⏳ Añadiendo...' : '💾 Añadir red'}
          </button>
        </form>
      )}
    </div>
  )
}

export default ChainManager
