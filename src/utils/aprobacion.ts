/**
 * Descripción canónica de una aprobación (RF-WN-44 · D-NW-9).
 *
 * Convierte la solicitud cruda de una dApp (o de la propia wallet) en los 10
 * bloques de información que pinta `DetalleAprobacion`: encabezado, origen,
 * cuenta, red, acción, detalles, consecuencias, avisos, técnico y botón.
 *
 * Es lógica de presentación pura: no firma, no toca RPC ni la bóveda.
 */
import { Interface, formatEther } from 'ethers'
import type { ChainConfig } from '../types'
import {
  acortarDireccion,
  formatearFecha,
  formatearMonto,
  formatearRed,
  hexATexto,
  textoValor,
} from './formato'
import { AVISOS, ordenarAvisos, tienePeligro, type Aviso } from './avisos'

/** Solicitud de firma tal y como la deja el background. */
export interface FirmaPendiente {
  method: string
  params: unknown[]
  chainId: string
}

/** Solicitud de conexión tal y como la deja el background. */
export interface ConexionPendiente {
  origin: string
  accounts: string[]
  currentAccountIndex: number
}

export interface Bloque {
  etiqueta: string
  valor: string
  mono?: boolean
  copiable?: boolean
}

export interface DescripcionAprobacion {
  icono: string
  titulo: string
  origen?: string
  /** Cuenta que firma/recibe la acción, ya formateada. */
  cuenta: string
  /** Red activa, ya formateada como `Nombre (chainId)`. */
  red: string
  /** Frase en lenguaje llano de lo que se autoriza. */
  accion: string
  detalles: Bloque[]
  consecuencias: string[]
  avisos: Aviso[]
  tecnico: string
  /** Texto del botón de aprobar (nunca "Aceptar"). */
  verboBoton: string
  /** Hay algún aviso de peligro → confirmación extra (D5). */
  peligro: boolean
}

export interface ContextoAprobacion {
  chains: ChainConfig[]
  cuentas: string[]
  chainIdActivo: string
  redNombre: string
}

/** Traducción de las acciones firmadas por TrueKeate. */
const ACCIONES_TRUEKEATE: Record<string, string> = {
  'iniciar sesión': 'Iniciar sesión en TrueKeate',
  'publicar artículo': 'Publicar un artículo en el mercado',
  'retirar del mercado': 'Retirar un artículo del mercado',
  'usar NFT': 'Usar un NFT en un trueque',
  'publicar oferta de trueque': 'Publicar una oferta de trueque',
  'acordar trueque': 'Acordar un trueque',
  'proponer encuentro': 'Proponer un punto de encuentro',
  'aceptar encuentro': 'Aceptar el encuentro propuesto',
  'rechazar encuentro': 'Rechazar el encuentro propuesto',
  'custodiar trueque': 'Depositar los artículos en custodia',
  'firmar recepción': 'Confirmar la recepción del artículo',
  'cerrar trueque': 'Cerrar el trueque',
  'valorar trueque': 'Valorar el trueque',
}

/** Minutos a partir de los cuales una acción firmada se considera antigua. */
const MINUTOS_ACCION_ANTIGUA = 5

const esDireccion = (v: unknown): v is string =>
  typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)

const IFACE_TX = new Interface([
  'function transfer(address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
])
const MAX_UINT256 = (1n << 256n) - 1n

/** Etiqueta de una cuenta conocida: `Cuenta N · 0x1234…abcd`. */
function etiquetaCuenta(ctx: ContextoAprobacion, address: string): string {
  const i = ctx.cuentas.findIndex((c) => c.toLowerCase() === address?.toLowerCase())
  const corta = acortarDireccion(address || '')
  return i >= 0 ? `Cuenta ${i} · ${corta}` : corta
}

/** Nombre de red a partir del chainId, con su etiqueta decimal. */
function nombreRed(ctx: ContextoAprobacion, chainId: string): string {
  const found = ctx.chains.find((c) => c.chainId.toLowerCase() === chainId?.toLowerCase())
  return formatearRed(found?.name ?? `Red ${chainId}`, chainId)
}

/** Cuenta que firma según el método. */
function firmanteDe(firma: FirmaPendiente): string {
  if (firma.method === 'eth_signTypedData_v4') return String(firma.params[0] ?? '')
  if (firma.method === 'eth_sendTransaction') {
    return String((firma.params[0] as { from?: string })?.from ?? '')
  }
  if (firma.method === 'personal_sign') {
    const invertido = esDireccion(firma.params[0]) && !esDireccion(firma.params[1])
    return String((invertido ? firma.params[0] : firma.params[1]) ?? '')
  }
  return ''
}

/** Mensaje EIP-191 según el orden de parámetros. */
function mensajeDe(firma: FirmaPendiente): string {
  const invertido = esDireccion(firma.params[0]) && !esDireccion(firma.params[1])
  return String((invertido ? firma.params[1] : firma.params[0]) ?? '')
}

// ── Datos estructurados EIP-712 ──────────────────────────────────────────

interface TypedData {
  domain?: Record<string, unknown>
  primaryType?: string
  types?: Record<string, Array<{ name: string; type: string }>>
  message?: Record<string, unknown>
}

const TIPOS_PELIGROSOS = new Set([
  'Permit',
  'Permit2',
  'PermitSingle',
  'PermitBatch',
  'Approve',
  'TransferWithAuthorization',
  'ReceiveWithAuthorization',
])

/** Aplana el mensaje EIP-712 en campos etiqueta→valor (un nivel de anidamiento). */
function aplanarMensaje(
  mensaje: Record<string, unknown>,
  prefijo = ''
): Array<{ etiqueta: string; valor: string }> {
  const salida: Array<{ etiqueta: string; valor: string }> = []
  for (const [clave, valor] of Object.entries(mensaje ?? {})) {
    const etiqueta = prefijo ? `${prefijo}.${clave}` : clave
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      salida.push(...aplanarMensaje(valor as Record<string, unknown>, etiqueta))
    } else {
      salida.push({ etiqueta, valor: textoValor(valor) })
    }
  }
  return salida
}

/** Segundos transcurridos desde la marca `ts` de una acción TrueKeate. */
function minutosDesdeTs(ts: number): number | null {
  if (!Number.isFinite(ts)) return null
  const min = (Date.now() - ts) / 60000
  return min >= 0 ? Math.round(min) : null
}

// ── Descripciones ────────────────────────────────────────────────────────

export function describirConexion(
  conexion: ConexionPendiente,
  ctx: ContextoAprobacion
): DescripcionAprobacion {
  const avisos: Aviso[] = []
  if (!conexion.origin.startsWith('https://')) avisos.push(AVISOS.origenInseguro())

  return {
    icono: '🔐',
    titulo: 'Solicitud de autorización',
    origen: conexion.origin,
    cuenta: etiquetaCuenta(ctx, conexion.accounts[conexion.currentAccountIndex] ?? ''),
    red: formatearRed(ctx.redNombre, ctx.chainIdActivo),
    accion: `Permitir que ${conexion.origin} vea tu dirección y te pida firmas`,
    detalles: [
      { etiqueta: 'Permisos que concede', valor: 'Ver la dirección de la cuenta · pedir firmas' },
      { etiqueta: 'Lo que NO concede', valor: 'Mover fondos · firmar sin que lo apruebes' },
    ],
    consecuencias: [
      'La conexión no cuesta gas y no mueve fondos.',
      'Podrás desconectarla desde el pie (🔌) o desde Conexiones.',
    ],
    avisos: ordenarAvisos(avisos),
    tecnico: JSON.stringify({ origen: conexion.origin, cuentas: conexion.accounts.length }, null, 2),
    verboBoton: 'Conectar',
    peligro: tienePeligro(avisos),
  }
}

export function describirFirma(
  firma: FirmaPendiente,
  ctx: ContextoAprobacion
): DescripcionAprobacion {
  const red = nombreRed(ctx, firma.chainId)
  const firmante = firmanteDe(firma)
  const cuenta = firmante ? etiquetaCuenta(ctx, firmante) : '—'
  const avisos: Aviso[] = []
  const detalles: Bloque[] = []
  const consecuencias: string[] = []

  let icono = '✍️'
  let titulo = 'Firmar mensaje'
  let accion = 'Firmar un mensaje'

  // ── personal_sign (EIP-191) ──────────────────────────────────────────
  if (firma.method === 'personal_sign') {
    const crudo = mensajeDe(firma)
    const { texto, legible } = hexATexto(crudo)
    titulo = 'Firmar mensaje · EIP-191'
    icono = '✍️'

    if (!legible) {
      avisos.push(AVISOS.binario())
      accion = 'Firmar un mensaje que no se puede leer'
    } else {
      const match = /^TrueKeate:\s*(.+?)(?:\s*\(ts=(\d+)\))?\s*$/.exec(texto)
      if (match) {
        const nombreAccion = match[1].trim()
        const ts = match[2] ? Number(match[2]) : NaN
        accion = `Acción de TrueKeate: ${ACCIONES_TRUEKEATE[nombreAccion] ?? nombreAccion}`
        if (Number.isFinite(ts)) {
          detalles.push({ etiqueta: 'Emitido', valor: formatearFecha(ts) })
          const minutos = minutosDesdeTs(ts)
          if (minutos !== null && minutos > MINUTOS_ACCION_ANTIGUA) {
            avisos.push(AVISOS.accionAntigua(minutos))
          }
        }
      } else {
        accion = `Firmar un mensaje de texto de la aplicación`
      }
      detalles.push({ etiqueta: 'Mensaje firmado', valor: texto, mono: true })
    }
    detalles.push({ etiqueta: 'Billetera firmante', valor: cuenta })
    detalles.push({ etiqueta: 'Red', valor: red })
    detalles.push({ etiqueta: 'Fecha y hora', valor: formatearFecha(Date.now()) })
    consecuencias.push('Firmar no cuesta gas ni mueve fondos.')
    consecuencias.push('La firma demuestra que tú autorizaste esa acción.')
    return {
      icono,
      titulo,
      cuenta,
      red,
      accion,
      detalles,
      consecuencias,
      avisos: ordenarAvisos(avisos),
      tecnico: JSON.stringify({ method: firma.method, mensaje: crudo, firmante }, null, 2),
      verboBoton: 'Firmar',
      peligro: tienePeligro(avisos),
    }
  }

  // ── eth_signTypedData_v4 (EIP-712) ───────────────────────────────────
  if (firma.method === 'eth_signTypedData_v4') {
    titulo = 'Firmar datos · EIP-712'
    let datos: TypedData = {}
    try {
      datos = (typeof firma.params[1] === 'string'
        ? JSON.parse(firma.params[1] as string)
        : firma.params[1]) as TypedData
    } catch {
      datos = {}
    }
    const dominio = datos.domain ?? {}
    const primaryType = datos.primaryType ?? 'Mensaje'
    accion = `Autorizar una operación de tipo ${primaryType}`

    detalles.push({ etiqueta: 'Qué se firma', valor: `${String(dominio.name ?? 'Contrato')} · ${primaryType}` })
    detalles.push({ etiqueta: 'Billetera firmante', valor: cuenta })
    detalles.push({ etiqueta: 'Dominio · nombre', valor: String(dominio.name ?? '—') })
    if (dominio.version !== undefined) {
      detalles.push({ etiqueta: 'Dominio · versión', valor: String(dominio.version) })
    }
    if (dominio.chainId !== undefined) {
      detalles.push({ etiqueta: 'Dominio · chainId', valor: String(dominio.chainId) })
    }
    if (dominio.verifyingContract !== undefined) {
      detalles.push({
        etiqueta: 'Contrato verificador',
        valor: String(dominio.verifyingContract),
        mono: true,
        copiable: true,
      })
    }
    for (const campo of aplanarMensaje(datos.message ?? {})) {
      detalles.push({ etiqueta: campo.etiqueta, valor: campo.valor })
    }
    detalles.push({ etiqueta: 'Red', valor: red })
    detalles.push({ etiqueta: 'Fecha y hora', valor: formatearFecha(Date.now()) })

    const tipos = Object.keys(datos.types ?? {})
    if (TIPOS_PELIGROSOS.has(primaryType) || tipos.some((t) => TIPOS_PELIGROSOS.has(t))) {
      avisos.push(AVISOS.permisoDeGasto())
      consecuencias.push('Esta firma autoriza a un contrato a operar con tus tokens.')
    }
    const dominioChain = dominio.chainId !== undefined ? Number(dominio.chainId) : NaN
    const activo = Number(BigInt(firma.chainId))
    if (Number.isFinite(dominioChain) && dominioChain !== activo) {
      avisos.push(AVISOS.redDistinta(String(dominioChain), String(activo)))
    }
    consecuencias.push('Firmar no cuesta gas ni mueve fondos.')

    return {
      icono: '✍️',
      titulo,
      cuenta,
      red,
      accion,
      detalles,
      consecuencias,
      avisos: ordenarAvisos(avisos),
      tecnico: JSON.stringify(datos, null, 2),
      verboBoton: 'Firmar',
      peligro: tienePeligro(avisos),
    }
  }

  // ── eth_sendTransaction ──────────────────────────────────────────────
  if (firma.method === 'eth_sendTransaction') {
    const tx = (firma.params[0] ?? {}) as {
      from?: string
      to?: string
      value?: string
      data?: string
      gas?: string
      gasPrice?: string
      maxFeePerGas?: string
      maxPriorityFeePerGas?: string
    }
    titulo = 'Confirmar transacción'
    icono = '💸'
    const valorWei = BigInt(tx.value ?? '0x0')

    detalles.push({ etiqueta: 'De', valor: cuenta })
    detalles.push({ etiqueta: 'Para', valor: tx.to ?? '—', mono: true, copiable: true })

    const destino = tx.to ?? '—'
    if (!tx.data || tx.data === '0x') {
      accion = `Enviar ${formatearMonto(formatEther(valorWei), 'ETH')} a ${acortarDireccion(destino)}`
    } else {
      try {
        const parsed = IFACE_TX.parseTransaction({ data: tx.data, value: valorWei })
        if (parsed?.name === 'approve') {
          const amount = parsed.args[1] as bigint
          const ilimitado = amount === MAX_UINT256
          accion = ilimitado
            ? `Autorizar gasto ILIMITADO del token ${acortarDireccion(destino)}`
            : `Aprobar el gasto de tokens al contrato ${acortarDireccion(destino)}`
          if (ilimitado) avisos.push(AVISOS.approveIlimitado())
        } else if (parsed?.name === 'transfer') {
          accion = `Transferir tokens del contrato ${acortarDireccion(destino)}`
        } else {
          accion = `Llamar a la función ${parsed?.name ?? 'desconocida'} del contrato ${acortarDireccion(destino)}`
        }
        detalles.push({
          etiqueta: 'Función',
          valor: `${parsed?.name ?? 'desconocida'}(${(parsed?.args ?? [])
            .map((a) => textoValor(a))
            .join(', ')})`,
        })
      } catch {
        accion = `Enviar una operación al contrato ${acortarDireccion(destino)}`
        avisos.push(AVISOS.datosNoLegibles())
      }
    }

    detalles.push({ etiqueta: 'Valor', valor: formatearMonto(formatEther(valorWei), 'ETH') })

    // Coste de red: gas × tarifa (si la dApp lo informa; si no, la wallet no lo estima aquí).
    let costeGasWei = 0n
    try {
      const gas = tx.gas ? BigInt(tx.gas) : 0n
      const tarifa = tx.maxFeePerGas
        ? BigInt(tx.maxFeePerGas)
        : tx.gasPrice
          ? BigInt(tx.gasPrice)
          : 0n
      costeGasWei = gas * tarifa
      if (gas > 0n && tarifa > 0n) {
        detalles.push({ etiqueta: 'Gas estimado', valor: gas.toString() })
        detalles.push({ etiqueta: 'Tarifa', valor: formatearMonto(formatEther(tarifa), 'ETH', 12) })
        detalles.push({
          etiqueta: 'Coste total',
          valor: formatearMonto(formatEther(valorWei + costeGasWei), 'ETH'),
        })
      }
    } catch {
      /* sin datos de gas */
    }

    // Aviso si se envía valor a una dirección no conocida de la wallet.
    const esCuentaPropia = ctx.cuentas.some((c) => c.toLowerCase() === tx.to?.toLowerCase())
    if (valorWei > 0n && !esCuentaPropia && tx.data && tx.data !== '0x') {
      avisos.push(AVISOS.contratoDesconocido())
    }

    consecuencias.push(
      `Se descontará de tu cuenta el valor enviado${costeGasWei > 0n ? ' más el coste de red' : ''}.`
    )
    consecuencias.push('La transacción es irreversible una vez confirmada en la red.')
    detalles.push({ etiqueta: 'Red', valor: red })

    return {
      icono,
      titulo,
      cuenta,
      red,
      accion,
      detalles,
      consecuencias,
      avisos: ordenarAvisos(avisos),
      tecnico: JSON.stringify({ method: firma.method, ...tx }, null, 2),
      verboBoton: 'Enviar',
      peligro: tienePeligro(avisos),
    }
  }

  // ── wallet_switchEthereumChain (D3: confirmación) ────────────────────
  if (firma.method === 'wallet_switchEthereumChain') {
    const destino = String((firma.params[0] as { chainId?: string })?.chainId ?? '')
    return {
      icono: '🔀',
      titulo: 'Cambiar de red',
      cuenta,
      red,
      accion: `Cambiar de ${formatearRed(ctx.redNombre, ctx.chainIdActivo)} a ${nombreRed(ctx, destino)}`,
      detalles: [
        { etiqueta: 'Red actual', valor: formatearRed(ctx.redNombre, ctx.chainIdActivo) },
        { etiqueta: 'Red destino', valor: nombreRed(ctx, destino) },
      ],
      consecuencias: ['Los saldos y tokens que verás serán los de la red destino.'],
      avisos: [],
      tecnico: JSON.stringify(firma.params, null, 2),
      verboBoton: 'Cambiar',
      peligro: false,
    }
  }

  // ── wallet_addEthereumChain ──────────────────────────────────────────
  if (firma.method === 'wallet_addEthereumChain') {
    const req = (firma.params[0] ?? {}) as {
      chainId?: string
      chainName?: string
      rpcUrls?: string[]
      nativeCurrency?: { symbol?: string }
      blockExplorerUrls?: string[]
    }
    const rpc = req.rpcUrls?.[0] ?? ''
    let hostRpc = rpc
    try {
      hostRpc = new URL(rpc).host
    } catch {
      /* deja la url cruda */
    }
    return {
      icono: '🌐',
      titulo: 'Añadir red',
      cuenta,
      red,
      accion: `Añadir la red ${req.chainName ?? 'personalizada'} (${req.chainId ?? '—'})`,
      detalles: [
        { etiqueta: 'Nombre', valor: req.chainName ?? '—' },
        { etiqueta: 'Chain ID', valor: req.chainId ?? '—', mono: true },
        { etiqueta: 'RPC', valor: hostRpc, mono: true },
        { etiqueta: 'Símbolo', valor: req.nativeCurrency?.symbol ?? 'ETH' },
        ...(req.blockExplorerUrls?.[0]
          ? [{ etiqueta: 'Explorador', valor: req.blockExplorerUrls[0] }]
          : []),
      ],
      consecuencias: [
        'La red quedará guardada y podrás seleccionarla cuando quieras.',
        'Se pedirá permiso para consultar solo ese RPC.',
      ],
      avisos: [],
      tecnico: JSON.stringify(req, null, 2),
      verboBoton: 'Añadir red',
      peligro: false,
    }
  }

  // ── Método no descrito ───────────────────────────────────────────────
  return {
    icono: '❓',
    titulo: `Solicitud: ${firma.method}`,
    cuenta,
    red,
    accion: 'El método solicitado no tiene una descripción específica',
    detalles: [{ etiqueta: 'Método', valor: firma.method, mono: true }],
    consecuencias: [],
    avisos: [AVISOS.datosNoLegibles()],
    tecnico: JSON.stringify(firma.params, null, 2),
    verboBoton: 'Aprobar',
    peligro: false,
  }
}
