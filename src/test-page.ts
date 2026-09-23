/**
 * Lógica de la página de pruebas de la wallet (`test.html`).
 *
 * Es un banco de pruebas EXTERNO a la extensión: se comporta como una dApp y
 * ejercita el proveedor EIP-1193 / EIP-6963 sin depender de TrueKeate. Se
 * mantiene junto a la extensión para poder validar cambios de la wallet sin
 * arrastrar el proyecto entero.
 *
 * No usa librerías: las comprobaciones son de forma y de presencia, suficientes
 * para detectar regresiones (una firma mal formada, un método ausente, una red
 * equivocada). La verificación criptográfica definitiva la hace el backend de la
 * plataforma con `ethers.verifyMessage`.
 */

interface ProveedorEIP1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(evento: string, cb: (datos: unknown) => void): void
  isCodeCrypto?: boolean
  isMetaMask?: boolean
}

interface InfoProveedor {
  uuid: string
  name: string
  icon: string
  rdns: string
}

interface AnuncioProveedor {
  info: InfoProveedor
  provider: ProveedorEIP1193
}

interface Comprobacion {
  nombre: string
  estado: 'ok' | 'err' | 'pendiente'
  detalle?: string
}

// ── Estado ────────────────────────────────────────────────────────────────
const anunciados = new Map<string, AnuncioProveedor>()
let proveedor: ProveedorEIP1193 | null = null
let cuenta: string | null = null
const comprobaciones: Comprobacion[] = []

// ── Utilidades de DOM ─────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Falta el elemento #${id} en la página`)
  return el as T
}

const log = (mensaje: string, tipo: 'ok' | 'err' | 'info' | '' = ''): void => {
  const linea = document.createElement('span')
  if (tipo) linea.className = tipo
  const hora = new Date().toLocaleTimeString('es')
  linea.textContent = `[${hora}] ${tipo === 'ok' ? '✓' : tipo === 'err' ? '✗' : '·'} ${mensaje}\n`
  $('log').appendChild(linea)
  $('log').scrollTop = $('log').scrollHeight
}

const anotar = (nombre: string, ok: boolean, detalle?: string): void => {
  const existente = comprobaciones.findIndex((c) => c.nombre === nombre)
  const item: Comprobacion = { nombre, estado: ok ? 'ok' : 'err', detalle }
  if (existente >= 0) comprobaciones[existente] = item
  else comprobaciones.push(item)
  pintarComprobaciones()
}

const pintarComprobaciones = (): void => {
  const contenedor = $('checks')
  contenedor.innerHTML = ''
  if (comprobaciones.length === 0) {
    contenedor.innerHTML = '<p class="tk-muted" style="font-size:12px">Todavía no hay pruebas ejecutadas.</p>'
    return
  }
  for (const c of comprobaciones) {
    const fila = document.createElement('div')
    fila.className = 'tk-check'
    const marca = document.createElement('span')
    marca.className = 'tk-check__mark'
    marca.textContent = c.estado === 'ok' ? '✅' : c.estado === 'err' ? '❌' : '⏳'
    const texto = document.createElement('span')
    texto.textContent = c.nombre + (c.detalle ? ` — ${c.detalle}` : '')
    fila.append(marca, texto)
    contenedor.appendChild(fila)
  }
}

/** Convierte wei (hex o decimal) a ETH con 4 decimales, sin librerías. */
const aEth = (wei: bigint): string => {
  const entero = wei / 10n ** 18n
  const decimales = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 4)
  return `${entero}.${decimales} ETH`
}

/** ¿La firma tiene la forma de una firma secp256k1 de 65 bytes? */
const formaDeFirma = (firma: unknown): { ok: boolean; detalle: string } => {
  if (typeof firma !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(firma)) {
    return { ok: false, detalle: 'no es 0x + 65 bytes' }
  }
  const v = parseInt(firma.slice(-2), 16)
  const vNormal = v === 27 || v === 28 || v === 0 || v === 1
  return { ok: vNormal, detalle: vNormal ? `v=${v}` : `v inesperado (${v})` }
}

// ── 1. Descubrimiento EIP-6963 ────────────────────────────────────────────
function descubrirProveedores(): Promise<AnuncioProveedor[]> {
  return new Promise((resolve) => {
    anunciados.clear()
    const alAnunciar = (evento: Event) => {
      const detalle = (evento as CustomEvent<AnuncioProveedor>).detail
      if (detalle?.info && detalle.provider) {
        anunciados.set(detalle.info.uuid, detalle)
      }
    }
    window.addEventListener('eip6963:announceProvider', alAnunciar)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', alAnunciar)
      resolve([...anunciados.values()])
    }, 400)
  })
}

function pintarProveedores(lista: AnuncioProveedor[]): void {
  const contenedor = $('providers')
  contenedor.innerHTML = ''
  if (lista.length === 0) {
    contenedor.innerHTML =
      '<p class="tk-muted" style="font-size:12px">Ningún proveedor anunciado por EIP-6963. ¿Está la extensión instalada y activa?</p>'
    return
  }
  for (const a of lista) {
    const fila = document.createElement('div')
    fila.className = 'tk-provider' + (proveedor === a.provider ? ' tk-provider--sel' : '')

    const izq = document.createElement('div')
    izq.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:0'
    const icono = document.createElement('img')
    icono.src = a.info.icon
    icono.alt = ''
    icono.style.cssText = 'width:24px;height:24px;border-radius:6px'
    const textos = document.createElement('div')
    textos.style.minWidth = '0'
    const nombre = document.createElement('div')
    nombre.style.cssText = 'font-size:13px;font-weight:600'
    nombre.textContent = a.info.name
    const rdns = document.createElement('div')
    rdns.className = 'tk-muted tk-mono'
    rdns.style.fontSize = '10.5px'
    rdns.textContent = a.info.rdns
    textos.append(nombre, rdns)
    izq.append(icono, textos)

    const usar = document.createElement('button')
    usar.className = 'tk-btn tk-btn--outline'
    usar.style.cssText = 'font-size:12px;padding:6px 12px'
    usar.textContent = proveedor === a.provider ? 'En uso' : 'Usar este'
    usar.addEventListener('click', () => {
      proveedor = a.provider
      $('proveedorEnUso').textContent = `${a.info.name} (${a.info.rdns})`
      pintarProveedores(lista)
      log(`Proveedor seleccionado: ${a.info.name}`, 'info')
      // Al cambiar de proveedor se pierde la cuenta conocida
      cuenta = null
      $('cuenta').textContent = '—'
      $('balance').textContent = '—'
      void refrescarCuenta()
    })

    fila.append(izq, usar)
    contenedor.appendChild(fila)
  }
}

async function iniciarDescubrimiento(): Promise<void> {
  const lista = await descubrirProveedores()
  const codecrypto = lista.find((a) => a.provider.isCodeCrypto)
  const ethereum = (window as unknown as { ethereum?: ProveedorEIP1193 }).ethereum

  // Prioridad: la wallet propia si está anunciada; si no, window.ethereum.
  if (!proveedor) proveedor = codecrypto?.provider ?? ethereum ?? null

  $('hasCodecrypto').textContent = (window as unknown as { codecrypto?: unknown }).codecrypto ? 'sí' : 'no'
  $('hasEthereum').textContent = ethereum
    ? ethereum.isMetaMask
      ? 'sí (MetaMask)'
      : 'sí'
    : 'no'
  $('proveedorEnUso').textContent = proveedor
    ? codecrypto && proveedor === codecrypto.provider
      ? `CodeCrypto Wallet (${codecrypto.info.rdns})`
      : ethereum && proveedor === ethereum && ethereum.isMetaMask
        ? 'MetaMask (window.ethereum)'
        : 'window.ethereum'
    : '—'

  pintarProveedores(lista)
  anotar('EIP-6963: el proveedor se anuncia', lista.length > 0, `${lista.length} proveedor(es)`)
  anotar('Wallet propia disponible', Boolean(codecrypto), codecrypto ? codecrypto.info.name : 'no anunciada')
  log(`Descubrimiento completado: ${lista.length} proveedor(es)`, lista.length ? 'ok' : 'err')
}

// ── 2. Conexión ───────────────────────────────────────────────────────────
const pedir = async (method: string, params?: unknown[]): Promise<unknown> => {
  if (!proveedor) throw new Error('No hay proveedor seleccionado')
  return await proveedor.request({ method, params })
}

async function conectar(): Promise<void> {
  try {
    const cuentas = (await pedir('eth_requestAccounts')) as string[]
    cuenta = cuentas?.[0] ?? null
    $('cuenta').textContent = cuenta ?? '—'
    anotar('eth_requestAccounts devuelve cuenta', Boolean(cuenta), cuenta ? `${cuenta.slice(0, 10)}…` : 'vacío')
    log(`Conectado: ${cuenta}`, cuenta ? 'ok' : 'err')
    await refrescarCuenta()
  } catch (e) {
    const err = e as { code?: number; message?: string }
    anotar('eth_requestAccounts devuelve cuenta', false, `código ${err.code ?? '?'}: ${err.message ?? e}`)
    log(`Error al conectar (código ${err.code ?? '?'}): ${err.message ?? e}`, 'err')
  }
}

async function leerCuentas(): Promise<void> {
  try {
    const cuentas = (await pedir('eth_accounts')) as string[]
    log(`eth_accounts → ${JSON.stringify(cuentas)}`)
    anotar('eth_accounts responde', Array.isArray(cuentas), `${cuentas?.length ?? 0} cuenta(s)`)
  } catch (e) {
    anotar('eth_accounts responde', false, String(e))
    log(`Error en eth_accounts: ${e}`, 'err')
  }
}

async function revocar(): Promise<void> {
  try {
    await pedir('wallet_revokePermissions', [{ eth_accounts: {} }])
    cuenta = null
    $('cuenta').textContent = '—'
    anotar('wallet_revokePermissions', true, 'permiso del sitio revocado')
    log('Permiso revocado: eth_accounts debería devolver [] hasta volver a conectar', 'ok')
  } catch (e) {
    const err = e as { code?: number; message?: string }
    anotar('wallet_revokePermissions', false, `código ${err.code ?? '?'} (¿método no implementado?)`)
    log(`Error al revocar (código ${err.code ?? '?'}): ${err.message ?? e}`, 'err')
  }
}

async function refrescarCuenta(): Promise<void> {
  try {
    const chainId = (await pedir('eth_chainId')) as string
    $('chainId').textContent = `${chainId} (${parseInt(chainId, 16)})`
    anotar('eth_chainId responde', /^0x[0-9a-fA-F]+$/.test(chainId), `chain ${parseInt(chainId, 16)}`)

    if (cuenta) {
      const saldoHex = (await pedir('eth_getBalance', [cuenta, 'latest'])) as string
      $('balance').textContent = aEth(BigInt(saldoHex))
      anotar('eth_getBalance responde', /^0x[0-9a-fA-F]+$/.test(saldoHex), aEth(BigInt(saldoHex)))
    }

    try {
      const bloqueHex = (await pedir('eth_blockNumber')) as string
      $('bloque').textContent = `${parseInt(bloqueHex, 16)}`
      anotar('eth_blockNumber responde', true, `bloque ${parseInt(bloqueHex, 16)}`)
    } catch (e) {
      anotar('eth_blockNumber responde', false, 'método ausente (lo usa tx.wait de ethers)')
      log(`eth_blockNumber no disponible: ${e}`, 'err')
    }
  } catch (e) {
    log(`Error al leer el estado: ${e}`, 'err')
  }
}

async function cambiarRedLocal(): Promise<void> {
  const chainId = '0x7a69' // 31337
  try {
    await pedir('wallet_switchEthereumChain', [{ chainId }])
    log('Red cambiada a 31337', 'ok')
    anotar('wallet_switchEthereumChain', true, 'chain 31337')
  } catch (e) {
    const err = e as { code?: number; message?: string }
    if (err.code === 4902) {
      try {
        await pedir('wallet_addEthereumChain', [
          {
            chainId,
            chainName: 'Anvil (TrueKeate local)',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['http://127.0.0.1:8545'],
          },
        ])
        log('Red 31337 añadida a la wallet', 'ok')
        anotar('wallet_addEthereumChain', true, 'red 31337 añadida')
      } catch (e2) {
        anotar('wallet_addEthereumChain', false, String(e2))
        log(`Error al añadir la red: ${e2}`, 'err')
      }
    } else {
      anotar('wallet_switchEthereumChain', false, `código ${err.code ?? '?'}`)
      log(`Error al cambiar de red: ${err.message ?? e}`, 'err')
    }
  }
  await refrescarCuenta()
}

// ── 3. Firma EIP-191 ──────────────────────────────────────────────────────
async function firmar191(): Promise<void> {
  const mensaje = $<HTMLInputElement>('msg191').value
  try {
    const objetivo = cuenta ?? ((await pedir('eth_accounts')) as string[])[0]
    const firma = await pedir('personal_sign', [mensaje, objetivo])
    $('firma191').textContent = String(firma)
    const forma = formaDeFirma(firma)
    $('valida191').textContent = forma.ok ? `firma de 65 bytes (${forma.detalle})` : forma.detalle
    anotar('personal_sign (EIP-191)', forma.ok, forma.detalle)
    log(`Firma EIP-191 obtenida para «${mensaje}»`, forma.ok ? 'ok' : 'err')
  } catch (e) {
    const err = e as { code?: number; message?: string }
    $('firma191').textContent = '—'
    $('valida191').textContent = `error ${err.code ?? '?'}`
    anotar('personal_sign (EIP-191)', false, `código ${err.code ?? '?'} — ¿método no implementado?`)
    log(`Error en personal_sign (código ${err.code ?? '?'}): ${err.message ?? e}`, 'err')
  }
}

// ── 4. Firma EIP-712 ──────────────────────────────────────────────────────
async function firmar712(): Promise<void> {
  try {
    const objetivo = cuenta ?? ((await pedir('eth_accounts')) as string[])[0]
    const chainId = parseInt((await pedir('eth_chainId')) as string, 16)
    const datos = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
        ],
        Trueke: [
          { name: 'truekeId', type: 'uint256' },
          { name: 'accion', type: 'string' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'Trueke',
      domain: { name: 'TrueKeate Prueba', version: '1', chainId },
      message: { truekeId: 1, accion: 'custodiar trueque', nonce: Date.now() },
    }
    const firma = await pedir('eth_signTypedData_v4', [objetivo, JSON.stringify(datos)])
    $('firma712').textContent = String(firma)
    const forma = formaDeFirma(firma)
    $('valida712').textContent = forma.ok ? `firma de 65 bytes (${forma.detalle})` : forma.detalle
    anotar('eth_signTypedData_v4 (EIP-712)', forma.ok, forma.detalle)
    log('Firma EIP-712 obtenida', forma.ok ? 'ok' : 'err')
  } catch (e) {
    const err = e as { code?: number; message?: string }
    $('firma712').textContent = '—'
    $('valida712').textContent = `error ${err.code ?? '?'}`
    anotar('eth_signTypedData_v4 (EIP-712)', false, `código ${err.code ?? '?'}`)
    log(`Error en eth_signTypedData_v4 (código ${err.code ?? '?'}): ${err.message ?? e}`, 'err')
  }
}

// ── 5. Lectura de contrato ────────────────────────────────────────────────
async function llamarContrato(): Promise<void> {
  const to = $<HTMLInputElement>('callTo').value.trim()
  const data = $<HTMLInputElement>('callData').value.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    anotar('eth_call (lectura de contrato)', false, 'dirección de contrato inválida')
    log('Pega una dirección de contrato válida para probar eth_call', 'err')
    return
  }
  try {
    const resultado = await pedir('eth_call', [{ to, data }, 'latest'])
    $('callResult').textContent = String(resultado)
    anotar('eth_call (lectura de contrato)', true, `${String(resultado).slice(0, 18)}…`)
    log(`eth_call → ${resultado}`, 'ok')
  } catch (e) {
    const err = e as { code?: number; message?: string }
    $('callResult').textContent = `error ${err.code ?? '?'}`
    anotar('eth_call (lectura de contrato)', false, `código ${err.code ?? '?'}`)
    log(`Error en eth_call (código ${err.code ?? '?'}): ${err.message ?? e}`, 'err')
  }
}

// ── Cableado de la interfaz ───────────────────────────────────────────────
$('btnRedescubrir').addEventListener('click', () => void iniciarDescubrimiento())
$('btnConectar').addEventListener('click', () => void conectar())
$('btnCuentas').addEventListener('click', () => void leerCuentas())
$('btnRevocar').addEventListener('click', () => void revocar())
$('btnBalance').addEventListener('click', () => void refrescarCuenta())
$('btnRedLocal').addEventListener('click', () => void cambiarRedLocal())
$('btnFirmar191').addEventListener('click', () => void firmar191())
$('btnMsgTrueke').addEventListener('click', () => {
  $<HTMLInputElement>('msg191').value = `TrueKeate: custodiar trueque (ts=${Date.now()})`
})
$('btnFirmar712').addEventListener('click', () => void firmar712())
$('btnCall').addEventListener('click', () => void llamarContrato())
$('btnLimpiarLog').addEventListener('click', () => {
  $('log').textContent = ''
  comprobaciones.length = 0
  pintarComprobaciones()
})
$('btnCopiar').addEventListener('click', () => {
  void navigator.clipboard?.writeText($('log').textContent ?? '')
  log('Registro copiado al portapapeles', 'info')
})

// Arranque
pintarComprobaciones()
log('Página de pruebas lista. Comprobando proveedores…', 'info')
void iniciarDescubrimiento()
