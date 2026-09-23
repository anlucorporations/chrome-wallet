/**
 * Conversión precisa entre ETH (texto) y wei (bigint).
 *
 * El popup es solo UI (no importa ethers, ver arquitectura del proyecto), así que
 * la conversión se hace con aritmética de cadenas. Usar `parseFloat(amount) * 1e18`
 * pierde precisión: `1.1 ETH` daba 1100000000000000128 wei (128 wei de más),
 * `1.005 ETH` daba 1004999999999999872 wei, etc.
 */

const WEI_DECIMALS = 18
const WEI_PER_ETH = 10n ** BigInt(WEI_DECIMALS)

/** Error de validación de un importe (mensaje listo para mostrar en la UI). */
export class AmountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AmountError'
  }
}

/**
 * Convierte un importe en ETH escrito por el usuario a wei.
 * @throws {AmountError} si el formato no es válido o el importe no es positivo
 */
export function parseEthToWei(amount: string): bigint {
  const value = amount.trim().replace(',', '.')

  if (value === '') {
    throw new AmountError('Ingresa un monto')
  }
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(value)) {
    throw new AmountError('Formato inválido: usa solo números (ej. 0.5)')
  }

  const [whole, decimals = ''] = value.split('.')
  if (decimals.length > WEI_DECIMALS) {
    throw new AmountError(`Máximo ${WEI_DECIMALS} decimales`)
  }

  const wei =
    BigInt(whole || '0') * WEI_PER_ETH +
    BigInt((decimals + '0'.repeat(WEI_DECIMALS)).slice(0, WEI_DECIMALS))

  if (wei <= 0n) {
    throw new AmountError('El monto debe ser mayor que 0')
  }
  return wei
}

/** Formatea wei como ETH legible (por defecto 6 decimales). */
export function formatWeiToEth(wei: bigint, decimals = 6): string {
  const whole = wei / WEI_PER_ETH
  if (decimals <= 0) return whole.toString()
  const fraction = (wei % WEI_PER_ETH).toString().padStart(WEI_DECIMALS, '0').slice(0, decimals)
  return `${whole}.${fraction}`
}

/**
 * Valida un importe contra el saldo disponible.
 * @returns mensaje de error, o cadena vacía si es válido
 */
export function validateAmount(amount: string, balanceWei: bigint): string {
  try {
    const wei = parseEthToWei(amount)
    if (wei > balanceWei) {
      return `Saldo insuficiente: disponible ${formatWeiToEth(balanceWei)} ETH`
    }
    return ''
  } catch (error) {
    return (error as Error).message
  }
}
