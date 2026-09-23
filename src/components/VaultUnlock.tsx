import { useState } from 'react'
import { sendRPCToBackground } from '../utils/rpc'

/**
 * Pantalla de desbloqueo: la bóveda existe pero está cerrada.
 *
 * Aparece al abrir el popup cuando la wallet se bloqueó (a mano o por
 * inactividad). Sin desbloquear no se puede firmar: el service worker rechaza
 * cualquier firma.
 */
interface Props {
  /** Se llama cuando la bóveda queda abierta. */
  onDesbloqueada: () => void | Promise<void>
}

export function VaultUnlock({ onDesbloqueada }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function desbloquear() {
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await sendRPCToBackground('wallet_unlock', [password])
      setPassword('')
      await onDesbloqueada()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wallet-setup-container">
      <div className="wallet-setup tk-card">
        <h2>🔒 Wallet bloqueada</h2>
        <p className="setup-note">
          Introduce tu contraseña para desbloquear. La frase de recuperación está cifrada y solo se
          descifra en memoria mientras la wallet esté abierta.
        </p>

        <label className="tk-label" htmlFor="unlock-pass">
          Contraseña
        </label>
        <input
          id="unlock-pass"
          className="tk-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void desbloquear()}
          autoFocus
          autoComplete="current-password"
        />

        {error && <p className="setup-error">{error}</p>}

        <button
          className="tk-btn"
          onClick={() => void desbloquear()}
          disabled={!password || busy}
          style={{ marginTop: 12 }}
        >
          {busy ? 'Desbloqueando…' : 'Desbloquear'}
        </button>
      </div>
    </div>
  )
}
