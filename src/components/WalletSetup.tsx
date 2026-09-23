import { useCallback, useEffect, useRef, useState } from 'react'
import { sendRPCToBackground } from '../utils/rpc'

/**
 * Alta de la wallet: importar una frase existente o **generar una nueva**.
 *
 * La generación y la validación BIP-39 se delegan al service worker (que es
 * quien tiene ethers); este componente es solo interfaz.
 */
interface WalletSetupProps {
  /** Carga la wallet a partir de la frase (deriva cuentas y persiste). */
  onLoadWallet: (mnemonic: string) => void | Promise<void>
}

type Mode = 'import' | 'backup' | 'confirm'

const MNEMONIC_LENGTH = 12
const TEST_MNEMONIC = 'test test test test test test test test test test test junk'

/** Índices aleatorios distintos para pedir la confirmación de la copia. */
function pickConfirmationIndexes(): number[] {
  const indexes = new Set<number>()
  while (indexes.size < 3) {
    indexes.add(Math.floor(Math.random() * MNEMONIC_LENGTH))
  }
  return Array.from(indexes).sort((a, b) => a - b)
}

function WalletSetup({ onLoadWallet }: WalletSetupProps) {
  const [mode, setMode] = useState<Mode>('import')
  const [mnemonic, setMnemonic] = useState('')
  const [error, setError] = useState('')
  const [validating, setValidating] = useState(false)
  const [valid, setValid] = useState(false)
  const [generated, setGenerated] = useState<string[]>([])
  const [generatedAddress, setGeneratedAddress] = useState('')
  const [confirmIndexes, setConfirmIndexes] = useState<number[]>([])
  const [confirmValues, setConfirmValues] = useState<string[]>(['', '', ''])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const validationTimer = useRef<number | undefined>(undefined)

  // ── Validación BIP-39 en vivo (delegada al service worker) ──────────
  useEffect(() => {
    if (mode !== 'import') return

    window.clearTimeout(validationTimer.current)
    const phrase = mnemonic.trim().replace(/\s+/g, ' ')

    if (!phrase) {
      setValid(false)
      setError('')
      setValidating(false)
      return
    }

    setValidating(true)
    validationTimer.current = window.setTimeout(async () => {
      try {
        const result = await sendRPCToBackground<{ valid: boolean; error?: string | null }>(
          'wallet_validateMnemonic',
          [phrase]
        )
        setValid(Boolean(result?.valid))
        setError(result?.valid ? '' : result?.error || 'Frase no válida')
      } catch (err) {
        setValid(false)
        setError((err as Error).message)
      } finally {
        setValidating(false)
      }
    }, 350)

    return () => window.clearTimeout(validationTimer.current)
  }, [mnemonic, mode])

  // ── Importar una frase existente ────────────────────────────────────
  const handleImport = async () => {
    if (!valid) return
    setBusy(true)
    setError('')
    try {
      await onLoadWallet(mnemonic.trim().replace(/\s+/g, ' ').toLowerCase())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ── Generar una wallet nueva ────────────────────────────────────────
  const handleGenerate = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await sendRPCToBackground<{ mnemonic: string; address: string }>(
        'wallet_generateMnemonic'
      )
      setGenerated(result.mnemonic.split(' '))
      setGeneratedAddress(result.address)
      setConfirmIndexes(pickConfirmationIndexes())
      setConfirmValues(['', '', ''])
      setCopied(false)
      setMode('backup')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generated.join(' '))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [generated])

  // ── Confirmar la copia de seguridad ─────────────────────────────────
  const confirmError = (() => {
    for (let i = 0; i < confirmIndexes.length; i++) {
      const expected = generated[confirmIndexes[i]]
      if (!confirmValues[i].trim()) return 'Completa las tres palabras'
      if (confirmValues[i].trim().toLowerCase() !== expected) {
        return `La palabra nº ${confirmIndexes[i] + 1} no coincide`
      }
    }
    return ''
  })()

  const handleConfirmBackup = async () => {
    if (confirmError) return
    setBusy(true)
    try {
      await onLoadWallet(generated.join(' '))
      setGenerated([])
      setMode('import')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ── Vista: frase recién generada ────────────────────────────────────
  if (mode === 'backup') {
    return (
      <div className="wallet-setup-container">
        <div className="wallet-setup">
          <h2>🔑 Guarda tu frase de recuperación</h2>
          <p className="setup-note">
            Estas 12 palabras son la <strong>única forma</strong> de recuperar tu wallet.
            Anótalas en papel y no las compartas con nadie.
          </p>

          <div className="mnemonic-words">
            {generated.map((word, index) => (
              <span key={index} className="mnemonic-word">
                <small>{index + 1}</small>
                {word}
              </span>
            ))}
          </div>

          <p className="address-line">
            Primera cuenta: <code>{generatedAddress}</code>
          </p>

          <button type="button" className="secondary-button" onClick={handleCopy}>
            {copied ? '✅ Copiada' : '📋 Copiar frase'}
          </button>
          <button type="button" onClick={() => setMode('confirm')} disabled={busy}>
            Ya la he guardado →
          </button>
        </div>
      </div>
    )
  }

  // ── Vista: confirmación de la copia ─────────────────────────────────
  if (mode === 'confirm') {
    return (
      <div className="wallet-setup-container">
        <div className="wallet-setup">
          <h2>✍️ Confirma tu copia de seguridad</h2>
          <p className="setup-note">Escribe las palabras que se piden para comprobar que las guardaste:</p>

          {confirmIndexes.map((wordIndex, position) => (
            <div className="form-group" key={wordIndex}>
              <label>Palabra nº {wordIndex + 1}</label>
              <input
                type="text"
                autoComplete="off"
                value={confirmValues[position]}
                onChange={(e) => {
                  const next = [...confirmValues]
                  next[position] = e.target.value
                  setConfirmValues(next)
                }}
                placeholder="palabra"
              />
            </div>
          ))}

          {confirmValues.every((value) => value.trim()) && confirmError && (
            <div className="form-error">⚠️ {confirmError}</div>
          )}
          {error && <div className="form-error">⚠️ {error}</div>}

          <button
            type="button"
            onClick={handleConfirmBackup}
            disabled={busy || confirmError !== ''}
          >
            {busy ? '⏳ Creando wallet...' : 'Crear wallet'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMode('backup')}
            disabled={busy}
          >
            ← Ver la frase otra vez
          </button>
        </div>
      </div>
    )
  }

  // ── Vista: importar / generar ───────────────────────────────────────
  return (
    <div className="wallet-setup-container">
      <div className="wallet-setup">
        <h2>Ingresa tu frase de recuperación (12 palabras)</h2>
        <textarea
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          placeholder="palabra1 palabra2 palabra3 ..."
          rows={3}
          aria-invalid={error !== ''}
        />

        <div className="validation-line">
          {validating && <span className="field-hint">⏳ Validando…</span>}
          {!validating && valid && <span className="field-ok">✅ Frase BIP-39 válida</span>}
          {!validating && error && <div className="form-error">⚠️ {error}</div>}
        </div>

        <button type="button" onClick={handleImport} disabled={!valid || busy}>
          {busy ? '⏳ Cargando...' : 'Cargar Wallet'}
        </button>

        <div className="setup-divider"><span>o</span></div>

        <button type="button" className="secondary-button" onClick={handleGenerate} disabled={busy}>
          ✨ Crear una wallet nueva
        </button>

        <div className="mnemonic-hint">
          <p>💡 <strong>Mnemonic de prueba:</strong></p>
          <code
            onClick={() => setMnemonic(TEST_MNEMONIC)}
            title="Click para usar este mnemonic"
          >
            {TEST_MNEMONIC}
          </code>
        </div>
      </div>
    </div>
  )
}

export default WalletSetup
