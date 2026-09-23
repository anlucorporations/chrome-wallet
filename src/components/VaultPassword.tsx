import { useState } from 'react'
import { sendRPCToBackground } from '../utils/rpc'

/**
 * Paso de contraseña: cifra el mnemonic en la bóveda.
 *
 * Se muestra al crear o importar una wallet (y al migrar una frase heredada en
 * claro). Hasta que la bóveda existe, la frase no se escribe en disco.
 */
interface Props {
  /** Frase que se va a cifrar. */
  mnemonic: string
  /** Se llama cuando la bóveda ya está creada y desbloqueada. */
  onListo: () => void | Promise<void>
}

export function VaultPassword({ mnemonic, onListo }: Props) {
  const [password, setPassword] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const larga = password.length >= 8
  const coincide = password.length > 0 && password === repetida
  const puede = larga && coincide && !busy

  async function crear() {
    if (!puede) return
    setBusy(true)
    setError('')
    try {
      await sendRPCToBackground('wallet_createVault', [mnemonic, password])
      await onListo()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wallet-setup-container">
      <div className="wallet-setup tk-card">
        <h2>🔐 Protege tu wallet con una contraseña</h2>
        <p className="setup-note">
          Tu frase de recuperación se guardará <strong>cifrada</strong> (AES-256) y la clave solo
          vivirá en memoria mientras la wallet esté desbloqueada. Se bloqueará sola tras 15 minutos
          de inactividad.
        </p>

        <label className="tk-label" htmlFor="vault-pass">
          Contraseña (mínimo 8 caracteres)
        </label>
        <input
          id="vault-pass"
          className="tk-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />

        <label className="tk-label" htmlFor="vault-pass2" style={{ marginTop: 10 }}>
          Repite la contraseña
        </label>
        <input
          id="vault-pass2"
          className="tk-input"
          type="password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void crear()}
          autoComplete="new-password"
        />

        <p className="tk-warning" style={{ marginTop: 12 }}>
          <strong>Guarda bien la contraseña.</strong> Si la olvidas, tendrás que restaurar la wallet
          con tus 12 palabras: no hay forma de recuperarla.
        </p>

        {password.length > 0 && !larga && (
          <p className="setup-error">La contraseña debe tener al menos 8 caracteres</p>
        )}
        {repetida.length > 0 && !coincide && <p className="setup-error">Las contraseñas no coinciden</p>}
        {error && <p className="setup-error">{error}</p>}

        <button className="tk-btn" onClick={() => void crear()} disabled={!puede} style={{ marginTop: 12 }}>
          {busy ? 'Cifrando…' : 'Cifrar y continuar'}
        </button>
      </div>
    </div>
  )
}
