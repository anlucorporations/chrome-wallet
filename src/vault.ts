/**
 * Bóveda cifrada del mnemonic.
 *
 * Hasta ahora la frase se guardaba en claro en `chrome.storage.local`, algo
 * asumible en un ejercicio educativo pero NO en producción con usuarios reales.
 * Este módulo la cifra con una contraseña:
 *
 *   contraseña --PBKDF2-SHA256 (600 000 iteraciones + salt de 16 B)--> clave
 *   mnemonic   --AES-GCM-256 (IV de 12 B)-------------------------> ciphertext
 *
 * La clave derivada NO se guarda en disco: vive en `chrome.storage.session`
 * (memoria del navegador, se pierde al cerrarlo) mientras la wallet está
 * desbloqueada, y se borra al bloquear o al superar el tiempo de inactividad.
 *
 * Todo se guarda en base64 para que `chrome.storage` (que serializa a JSON)
 * pueda almacenarlo sin sorpresas.
 */

/** Metadatos de la bóveda tal y como se persisten. */
export interface Boveda {
  version: 1
  kdf: 'PBKDF2-SHA256'
  iteraciones: number
  /** Salt en base64. */
  salt: string
  /** Vector de inicialización en base64. */
  iv: string
  /** Mnemonic cifrado en base64. */
  cifrado: string
}

export const CLAVE_BOVEDA = 'codecrypto_vault'
/** Clave derivada mientras la wallet está desbloqueada (solo en memoria). */
export const CLAVE_SESION = 'codecrypto_session_key'
/** Marca de la última actividad, para el autobloqueo por inactividad. */
export const CLAVE_ACTIVIDAD = 'codecrypto_last_activity'

/** Coste del KDF. 600 000 iteraciones es la recomendación de OWASP para PBKDF2-SHA256. */
export const ITERACIONES_PBKDF2 = 600_000

/** Minutos de inactividad antes de bloquear la wallet automáticamente. */
export const MINUTOS_AUTOBLOQUEO = 15

const codificador = new TextEncoder()
const descodificador = new TextDecoder()

/** base64 sin depender de Buffer (el service worker no lo tiene). */
function aBase64(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario)
}

function desdeBase64(texto: string): Uint8Array {
  const binario = atob(texto)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

/** Deriva la clave de cifrado a partir de la contraseña. */
async function derivarClave(
  password: string,
  salt: Uint8Array,
  iteraciones: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    codificador.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: iteraciones, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    true, // exportable: hace falta para guardarla en la sesión
    ['encrypt', 'decrypt']
  )
}

/** Crea la bóveda cifrada a partir del mnemonic y una contraseña. */
export async function crearBoveda(mnemonic: string, password: string): Promise<Boveda> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const clave = await derivarClave(password, salt, ITERACIONES_PBKDF2)
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    clave,
    codificador.encode(mnemonic)
  )
  return {
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iteraciones: ITERACIONES_PBKDF2,
    salt: aBase64(salt),
    iv: aBase64(iv),
    cifrado: aBase64(new Uint8Array(cifrado)),
  }
}

/** Descifra la bóveda. Lanza si la contraseña es incorrecta (AES-GCM no autentica). */
export async function descifrarBoveda(boveda: Boveda, password: string): Promise<string> {
  const clave = await derivarClave(password, desdeBase64(boveda.salt), boveda.iteraciones)
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: desdeBase64(boveda.iv) as unknown as BufferSource },
    clave,
    desdeBase64(boveda.cifrado) as unknown as BufferSource
  )
  return descodificador.decode(claro)
}

/** Descifra con una clave ya derivada (la de la sesión). */
async function descifrarConClave(boveda: Boveda, clave: CryptoKey): Promise<string> {
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: desdeBase64(boveda.iv) as unknown as BufferSource },
    clave,
    desdeBase64(boveda.cifrado) as unknown as BufferSource
  )
  return descodificador.decode(claro)
}

// ── Persistencia ─────────────────────────────────────────────────────────
export async function leerBoveda(): Promise<Boveda | null> {
  const datos = await chrome.storage.local.get(CLAVE_BOVEDA)
  return (datos[CLAVE_BOVEDA] as Boveda | undefined) ?? null
}

/** Guarda la bóveda y elimina el mnemonic en claro (migración). */
export async function guardarBoveda(boveda: Boveda): Promise<void> {
  await chrome.storage.local.set({ [CLAVE_BOVEDA]: boveda })
  // Nunca deben convivir la bóveda y la frase en claro.
  await chrome.storage.local.remove('codecrypto_mnemonic')
}

async function guardarClaveDeSesion(clave: CryptoKey): Promise<void> {
  const cruda = new Uint8Array(await crypto.subtle.exportKey('raw', clave))
  await chrome.storage.session.set({ [CLAVE_SESION]: aBase64(cruda) })
  await marcarActividad()
}

async function leerClaveDeSesion(): Promise<CryptoKey | null> {
  const datos = await chrome.storage.session.get(CLAVE_SESION)
  const guardada = datos[CLAVE_SESION] as string | undefined
  if (!guardada) return null
  return await crypto.subtle.importKey('raw', desdeBase64(guardada) as unknown as BufferSource, 'AES-GCM', true, [
    'encrypt',
    'decrypt',
  ])
}

/** Registra actividad para reiniciar el contador del autobloqueo. */
export async function marcarActividad(): Promise<void> {
  await chrome.storage.session.set({ [CLAVE_ACTIVIDAD]: Date.now() })
}

/**
 * Bloquea la wallet: olvida la clave derivada. La bóveda permanece en disco.
 */
export async function bloquear(): Promise<void> {
  await chrome.storage.session.remove([CLAVE_SESION, CLAVE_ACTIVIDAD])
}

/** ¿Está desbloqueada y dentro del plazo de inactividad? */
export async function estaDesbloqueada(): Promise<boolean> {
  const datos = await chrome.storage.session.get([CLAVE_SESION, CLAVE_ACTIVIDAD])
  if (!datos[CLAVE_SESION]) return false
  const ultima = (datos[CLAVE_ACTIVIDAD] as number | undefined) ?? 0
  if (Date.now() - ultima > MINUTOS_AUTOBLOQUEO * 60_000) {
    await bloquear()
    return false
  }
  return true
}

/**
 * Desbloquea con la contraseña: comprueba que descifra y guarda la clave en la
 * sesión (memoria), sin volver a escribir el mnemonic en disco.
 * @returns el mnemonic si la contraseña es correcta, o null.
 */
export async function desbloquear(password: string): Promise<string | null> {
  const boveda = await leerBoveda()
  if (!boveda) return null
  const clave = await derivarClave(password, desdeBase64(boveda.salt), boveda.iteraciones)
  let mnemonic: string
  try {
    mnemonic = await descifrarConClave(boveda, clave)
  } catch {
    return null // contraseña incorrecta: AES-GCM no autentica
  }
  await guardarClaveDeSesion(clave)
  return mnemonic
}

/**
 * Devuelve el mnemonic descifrado si la wallet está desbloqueada.
 * Renueva la marca de actividad (autobloqueo deslizante).
 */
export async function mnemonicDesbloqueado(): Promise<string | null> {
  if (!(await estaDesbloqueada())) return null
  const boveda = await leerBoveda()
  const clave = await leerClaveDeSesion()
  if (!boveda || !clave) return null
  const mnemonic = await descifrarConClave(boveda, clave)
  await marcarActividad()
  return mnemonic
}

/** Estado de la bóveda, para la interfaz y para las comprobaciones. */
export async function estadoBoveda(): Promise<{
  existe: boolean
  desbloqueada: boolean
  cifrada: boolean
  /** Hay un mnemonic en claro pendiente de migrar. */
  migracionPendiente: boolean
}> {
  const boveda = await leerBoveda()
  const plano = await chrome.storage.local.get('codecrypto_mnemonic')
  return {
    existe: Boolean(boveda),
    desbloqueada: await estaDesbloqueada(),
    cifrada: Boolean(boveda),
    migracionPendiente: !boveda && Boolean(plano.codecrypto_mnemonic),
  }
}
