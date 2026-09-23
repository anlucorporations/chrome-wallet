#!/usr/bin/env node
/**
 * scripts/test-vault.mjs — Pruebas de la bóveda cifrada del mnemonic.
 *
 * Comprueba lo que importa para producción:
 *   1. La frase NO queda en claro en el almacenamiento.
 *   2. La contraseña incorrecta no abre la bóveda.
 *   3. Bloqueada, la wallet no firma; desbloqueada, sí llega a pedir aprobación.
 *   4. Una dApp no puede invocar los métodos de la bóveda.
 *   5. La migración borra el mnemonic heredado en claro.
 *
 * Uso:
 *   npm run build && node scripts/test-vault.mjs
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReporter, delay, installChromeStub } from './lib/chrome-stub.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const TEST_MNEMONIC = 'test test test test test test test test test test test junk'
const PASSWORD = 'clave-de-prueba-2026'
const SITE_URL = 'http://localhost:5174/test.html'

const api = installChromeStub()
const { localData, sessionData, send } = api
const { check, summary } = createReporter()

// Datos de cuenta, pero SIN mnemonic en claro: así se ejercita la bóveda.
localData.set('codecrypto_accounts', [ADDRESS])
localData.set('codecrypto_current_account', '0')
localData.set('codecrypto_chain_id', '0x7a69')

await import(resolve(ROOT, 'dist/background.js'))
console.log('\n🔐 Pruebas de la bóveda cifrada (dist/background.js)\n')

const senderDapp = { tab: { id: 1, url: SITE_URL } }
// La propia wallet: su origen es el de la extensión (el popup vive en
// chrome-extension://<id>/index.html), no una dApp.
const senderPopup = { origin: 'chrome-extension://test/' }
/**
 * Envía una petición RPC y normaliza la respuesta: el service worker contesta
 * `{ result, error }`, así que aquí se devuelve el resultado o el error, para
 * que las comprobaciones se lean sin desenvolver nada.
 */
const llamar = async (method, params, sender = senderPopup) => {
  const respuesta = await send({ type: 'CODECRYPTO_RPC', method, params }, sender)
  if (respuesta?.error) return { error: respuesta.error }
  return respuesta?.result ?? respuesta
}

// ── T1 · Estado inicial ──────────────────────────────────────────────
console.log('T1 · estado inicial')
const inicial = await llamar('wallet_vaultStatus')
check('no hay bóveda todavía', inicial?.existe === false, JSON.stringify(inicial))
check('sin contraseña no hay wallet configurada', inicial?.desbloqueada === false)

// ── T2 · Sin wallet, firmar falla ────────────────────────────────────
console.log('\nT2 · sin wallet configurada no se firma')
const sinWallet = await llamar('personal_sign', ['hola', ADDRESS], senderDapp)
check('personal_sign devuelve error de no configurada',
  Boolean(sinWallet?.error) && /not configured/i.test(sinWallet.error.message ?? ''),
  sinWallet?.error?.message)

// ── T3 · Crear la bóveda ─────────────────────────────────────────────
console.log('\nT3 · crear la bóveda cifrada')
const corta = await llamar('wallet_createVault', [TEST_MNEMONIC, 'corta'])
check('rechaza una contraseña de menos de 8 caracteres', Boolean(corta?.error))

const creada = await llamar('wallet_createVault', [TEST_MNEMONIC, PASSWORD])
check('la bóveda se crea', creada?.ok === true, JSON.stringify(creada))

const bovedaGuardada = localData.get('codecrypto_vault')
check('la bóveda queda guardada', Boolean(bovedaGuardada))
check('el mnemonic en claro se elimina del almacenamiento',
  localData.get('codecrypto_mnemonic') === undefined)

const serializada = JSON.stringify(bovedaGuardada ?? {})
check('la bóveda no contiene la frase ni una sola palabra del mnemonic',
  !serializada.includes('test') && !serializada.includes('junk') && !serializada.includes(TEST_MNEMONIC))
check('la bóveda declara su KDF y sus iteraciones',
  bovedaGuardada?.kdf === 'PBKDF2-SHA256' && (bovedaGuardada?.iteraciones ?? 0) >= 600000,
  `${bovedaGuardada?.kdf} · ${bovedaGuardada?.iteraciones} iteraciones`)

// ── T4 · Estado desbloqueado ─────────────────────────────────────────
console.log('\nT4 · tras crearla queda desbloqueada')
const tras = await llamar('wallet_vaultStatus')
check('la bóveda existe y está desbloqueada',
  tras?.existe === true && tras?.desbloqueada === true, JSON.stringify(tras))

// ── T5 · Bloqueo ─────────────────────────────────────────────────────
console.log('\nT5 · bloquear y no poder firmar')
await llamar('wallet_lock')
const bloqueada = await llamar('wallet_vaultStatus')
check('queda bloqueada', bloqueada?.desbloqueada === false)
check('la clave de sesión se olvida', sessionData.get('codecrypto_session_key') === undefined)

const firmaBloqueada = await llamar('personal_sign', ['hola', ADDRESS], senderDapp)
check('bloqueada, firmar se rechaza pidiendo desbloquear',
  Boolean(firmaBloqueada?.error) && /bloqueada/i.test(firmaBloqueada.error.message ?? ''),
  firmaBloqueada?.error?.message)
check('y no se abre ninguna ventana de aprobación', localData.get('codecrypto_pending_request') === undefined)

// ── T6 · Contraseña incorrecta ───────────────────────────────────────
console.log('\nT6 · contraseña incorrecta')
const mala = await llamar('wallet_unlock', ['contraseña-equivocada'])
check('no desbloquea con contraseña incorrecta', Boolean(mala?.error), mala?.error?.message)
check('y sigue bloqueada', (await llamar('wallet_vaultStatus'))?.desbloqueada === false)

// ── T7 · Desbloqueo correcto ─────────────────────────────────────────
console.log('\nT7 · desbloqueo correcto')
const buena = await llamar('wallet_unlock', [PASSWORD])
check('desbloquea con la contraseña correcta', buena?.ok === true, JSON.stringify(buena))
check('el mnemonic sigue sin estar en claro en disco',
  localData.get('codecrypto_mnemonic') === undefined)

// Con la bóveda abierta, firmar pasa el control y pide aprobación DENTRO de la
// wallet (ya no se abren ventanas flotantes). Se rechaza por mensaje.
const firmaPromesa = llamar('personal_sign', ['hola', ADDRESS], senderDapp)
await delay(120)
const pendiente = localData.get('codecrypto_pending_request')
check('desbloqueada, la firma llega a pedir aprobación', Boolean(pendiente?.approvalId),
  pendiente ? `solicitud ${pendiente.approvalId}` : 'sin solicitud')
check('la aprobación no abre ninguna ventana flotante', api.openWindows.size === 0,
  `${api.openWindows.size} ventana(s)`)
await send({
  type: 'SIGN_RESPONSE',
  approvalId: pendiente?.approvalId,
  success: false,
  error: 'User rejected'
})
const resultadoFirma = await firmaPromesa.catch((e) => ({ error: { message: String(e) } }))
check('al rechazar en la wallet la firma se cancela (no se queda colgada)',
  Boolean(resultadoFirma?.error), resultadoFirma?.error?.message)

// ── T8 · Una dApp no toca la bóveda ──────────────────────────────────
console.log('\nT8 · una dApp no puede invocar la bóveda')
const espia = await llamar('wallet_unlock', [PASSWORD], senderDapp)
check('wallet_unlock rechazado desde una dApp',
  Boolean(espia?.error) && /propia wallet/i.test(espia.error.message ?? ''), espia?.error?.message)
const espiaCrear = await llamar('wallet_createVault', [TEST_MNEMONIC, PASSWORD], senderDapp)
check('wallet_createVault rechazado desde una dApp', Boolean(espiaCrear?.error))

// ── T9 · Migración del mnemonic heredado ─────────────────────────────
console.log('\nT9 · migración detectada')
localData.set('codecrypto_mnemonic', TEST_MNEMONIC)
localData.delete('codecrypto_vault')
const migrable = await llamar('wallet_vaultStatus')
check('detecta el mnemonic heredado pendiente de migrar', migrable?.migracionPendiente === true,
  JSON.stringify(migrable))
await llamar('wallet_createVault', [TEST_MNEMONIC, PASSWORD])
check('al crear la bóveda el mnemonic heredado desaparece',
  localData.get('codecrypto_mnemonic') === undefined)

summary()
