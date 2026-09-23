import { useEffect, useState } from 'react'
import { formatWeiToEth, validateAmount } from '../utils/amount'

/**
 * Transferencias entre cuentas propias de la wallet, con validación inline:
 * formato del importe, monto mayor que 0, cuenta destino distinta y saldo
 * suficiente (comparado en wei para no perder precisión).
 */
interface TransferSectionProps {
  accounts: string[]
  currentAccountIndex: number
  balanceWei: bigint
  onTransfer: (toAccountIndex: number, amount: string) => Promise<string | undefined>
}

function TransferSection({ accounts, currentAccountIndex, balanceWei, onTransfer }: TransferSectionProps) {
  const [toAccount, setToAccount] = useState(0)
  const [amount, setAmount] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)

  // Actualizar cuenta destino cuando cambia la cuenta actual
  useEffect(() => {
    // Seleccionar la siguiente cuenta por defecto
    const nextAccount = (currentAccountIndex + 1) % accounts.length
    setToAccount(nextAccount)
  }, [currentAccountIndex, accounts.length])

  // Validación en vivo (importe > 0, formato correcto y saldo suficiente)
  const amountError = amount.trim() ? validateAmount(amount, balanceWei) : ''
  const visibleError = touched ? (amountError || error) : ''
  const canSubmit = amount.trim() !== '' && amountError === '' && !isTransferring

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)

    // Validación antes de enviar: nada de alert() ni de dejar que falle el nodo
    const validationError = amount.trim() ? validateAmount(amount, balanceWei) : 'Ingresa un monto'
    if (validationError) {
      setError(validationError)
      return
    }
    if (toAccount === currentAccountIndex) {
      setError('Selecciona una cuenta distinta a la actual')
      return
    }

    setIsTransferring(true)
    setTxHash('')
    setError('')

    try {
      const hash = await onTransfer(toAccount, amount)
      if (hash) {
        setTxHash(hash)
        setAmount('')
        setTouched(false)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsTransferring(false)
    }
  }

  return (
    <div className="info-section transfer-section">
      <h3>💸 Transferir entre Cuentas</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Cuenta Destino:</label>
          <select
            value={toAccount}
            onChange={(e) => { setToAccount(parseInt(e.target.value)); setError('') }}
            disabled={isTransferring}
          >
            {accounts.map((acc, i) => (
              <option
                key={i}
                value={i}
                disabled={i === currentAccountIndex}
              >
                Cuenta {i}: {acc.slice(0, 6)}...{acc.slice(-4)}
                {i === currentAccountIndex ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Monto (ETH):</label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError('') }}
            onBlur={() => setTouched(true)}
            placeholder="0.0"
            disabled={isTransferring}
            aria-invalid={visibleError !== ''}
          />
          <small className="field-hint">
            Disponible: {formatWeiToEth(balanceWei)} ETH
          </small>
          {visibleError && <div className="form-error">⚠️ {visibleError}</div>}
        </div>

        <button
          type="submit"
          className="transfer-button"
          disabled={!canSubmit}
        >
          {isTransferring ? '⏳ Transfiriendo...' : '💸 Transferir'}
        </button>

        {txHash && (
          <div className="tx-success">
            ✅ Transacción exitosa!
            <br />
            <small>{txHash.slice(0, 20)}...{txHash.slice(-20)}</small>
          </div>
        )}
      </form>
    </div>
  )
}

export default TransferSection
