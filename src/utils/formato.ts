/**
 * Formato unificado de la información de la wallet (RF-WN-56).
 *
 * Reglas: direcciones `0x1234…abcd`, montos con separador local y símbolo,
 * fechas `dd/mm/aaaa hh:mm` y redes `Nombre (chainId)`.
 */

/** Abrevia una dirección para mostrarla en resúmenes. */
export function acortarDireccion(a: string): string {
  if (!a) return ''
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

/** Monto legible con separador local y hasta `maxDec` decimales. */
export function formatearMonto(valor: string | number, simbolo?: string, maxDec = 6): string {
  const n = typeof valor === 'number' ? valor : Number(valor)
  const base = Number.isFinite(n)
    ? n.toLocaleString('es', { maximumFractionDigits: maxDec })
    : String(valor)
  return simbolo ? `${base} ${simbolo}` : base
}

/** Fecha y hora local `dd/mm/aaaa hh:mm`; si no es parseable, devuelve el original. */
export function formatearFecha(valor: string | number | Date): string {
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return String(valor)
  return d.toLocaleString('es', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** chainId a número decimal (o null si no es válido). */
function cadenaADecimal(chainId: string): number | null {
  try {
    if (/^0x[0-9a-fA-F]+$/.test(chainId)) return Number(BigInt(chainId))
    if (/^[0-9]+$/.test(chainId)) return Number(chainId)
  } catch {
    /* ignore */
  }
  return null
}

/** Red legible: `Nombre (chainId decimal)`. */
export function formatearRed(nombre: string, chainId: string): string {
  const dec = cadenaADecimal(chainId)
  return dec === null ? nombre : `${nombre} (${dec})`
}

/** Valor de un campo EIP-712 a texto legible. */
export function textoValor(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'bigint') return v.toString()
  if (Array.isArray(v)) return v.map((x) => textoValor(x)).join(', ')
  return JSON.stringify(v)
}

/** Decodifica un hex (0x…) a texto UTF-8 e indica si es legible. */
export function hexATexto(hex: string): { texto: string; legible: boolean } {
  const limpio = hex.startsWith('0x') ? hex.slice(2) : hex
  if (limpio.length === 0) return { texto: '', legible: true }
  if (!/^[0-9a-fA-F]+$/.test(limpio) || limpio.length % 2 !== 0) {
    return { texto: hex, legible: false }
  }
  try {
    const bytes = new Uint8Array((limpio.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)))
    const texto = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    // Legible si no aparecen caracteres de control (salvo salto/tabulador) ni el de reemplazo.
    const legible = ![...texto].some((ch) => {
      const c = ch.codePointAt(0) ?? 0
      return (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0xfffd
    })
    return { texto, legible }
  } catch {
    return { texto: hex, legible: false }
  }
}
