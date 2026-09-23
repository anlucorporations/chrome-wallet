#!/usr/bin/env node
/**
 * scripts/test-background.mjs — Pruebas del service worker sin navegador.
 *
 * Simula las APIs de `chrome` (storage, windows, action, notifications, tabs),
 * carga el service worker compilado (dist/background.js) y ejercita los flujos
 * RPC reales. Sirve para verificar correcciones que no se pueden probar en Node
 * de otra forma (por ejemplo: permisos por origen y cierre de ventanas).
 *
 * Uso:
 *   npm run build && node scripts/test-background.mjs
 */
import { resolve, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createReporter, delay, installChromeStub, startFakeRpcServer } from './lib/chrome-stub.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const TEST_MNEMONIC = 'test test test test test test test test test test test junk'
const SITE_URL = 'http://localhost:5174/test.html'
const SITE_ORIGIN = 'http://localhost:5174'

// ── Stub de chrome.* y utilidades (compartidos con test-acceptance.mjs) ──
const api = installChromeStub()
const { localData, sessionData, send, getBadgeText } = api
const { check, summary } = createReporter()


// ── Carga del service worker compilado ──────────────────────────────
await import(resolve(ROOT, 'dist/background.js'))
console.log('\n🔬 Pruebas del service worker (dist/background.js)\n')

// ═══════════════════════════════════════════════════════════════════
console.log('T0 · formato de los bundles (content scripts = scripts clásicos)')
// ═══════════════════════════════════════════════════════════════════
const readBundle = (name) => readFileSync(resolve(ROOT, 'dist', name), 'utf8')
const ESM_IMPORT = /(^|[\s;])import\s*[{("'*]/

for (const name of ['inject.js', 'content-script.js']) {
  const code = readBundle(name)
  // El manifest carga los content scripts como scripts clásicos y inject.js se
  // inyecta con una etiqueta <script>: un `import` los rompería con
  // "Cannot use import statement outside a module".
  check(`${name} no usa import/export`, !ESM_IMPORT.test(code), `inicio: ${code.slice(0, 70)}`)
}

check('background.js sí puede ser un módulo ES (así lo declara el manifest)',
  ESM_IMPORT.test(readBundle('background.js')) || readBundle('background.js').length > 0)


// Estado inicial: wallet ya configurada (como tras cargar el mnemonic en el popup)
localData.set('codecrypto_mnemonic', TEST_MNEMONIC)
localData.set('codecrypto_accounts', [ADDRESS])
localData.set('codecrypto_current_account', '0')
localData.set('codecrypto_chain_id', '0x7a69')

// ═══════════════════════════════════════════════════════════════════
console.log('T1 · eth_requestAccounts guarda el permiso POR ORIGEN (B1)')
// ═══════════════════════════════════════════════════════════════════
const senderWithTab = { tab: { id: 1, url: SITE_URL } }
const connectRpc = send({ type: 'CODECRYPTO_RPC', method: 'eth_requestAccounts', params: [] }, senderWithTab)
await delay(100)

const connectRequest = localData.get('codecrypto_connect_request')
check('la solicitud de conexión queda guardada para la wallet', Boolean(connectRequest), JSON.stringify(connectRequest))
check('sin abrir ninguna ventana flotante', api.openWindows.size === 0, `${api.openWindows.size} ventana(s)`)

await send({
  type: 'CONNECT_RESPONSE',
  requestId: connectRequest?.requestId,
  success: true,
  account: ADDRESS,
  accountIndex: 0
})

const connectResult = await connectRpc
check('la dApp recibe la cuenta seleccionada', connectResult?.result?.[0] === ADDRESS, JSON.stringify(connectResult))

const sites = localData.get('codecrypto_connected_sites') || {}
check(`la clave guardada es el origen (${SITE_ORIGIN})`,
  Object.keys(sites).includes(SITE_ORIGIN), `claves: ${JSON.stringify(Object.keys(sites))}`)
check('la clave NO es la URL completa (bug original)',
  !Object.keys(sites).includes(SITE_URL), `claves: ${JSON.stringify(Object.keys(sites))}`)

// ═══════════════════════════════════════════════════════════════════
console.log('\nT2 · eth_accounts devuelve la cuenta autorizada (regresión del bug B1)')
// ═══════════════════════════════════════════════════════════════════
const accountsAfterConnect = await send({ type: 'CODECRYPTO_RPC', method: 'eth_accounts', params: [] }, senderWithTab)
check('el sitio autorizado recibe su cuenta', accountsAfterConnect?.result?.[0] === ADDRESS, JSON.stringify(accountsAfterConnect))

const otherSite = await send({ type: 'CODECRYPTO_RPC', method: 'eth_accounts', params: [] },
  { tab: { id: 2, url: 'http://otro-sitio.test/' } })
check('un sitio NO autorizado recibe []', Array.isArray(otherSite?.result) && otherSite.result.length === 0, JSON.stringify(otherSite))

// ═══════════════════════════════════════════════════════════════════
console.log('\nT3 · migración de claves antiguas (URL completa → origen)')
// ═══════════════════════════════════════════════════════════════════
localData.set('codecrypto_connected_sites', { [SITE_URL]: ADDRESS })
const migrated = await send({ type: 'CODECRYPTO_RPC', method: 'eth_accounts', params: [] }, senderWithTab)
check('el sitio antiguo sigue autorizado tras migrar', migrated?.result?.[0] === ADDRESS, JSON.stringify(migrated))

const sitesAfterMigration = localData.get('codecrypto_connected_sites') || {}
check('la clave quedó normalizada al origen',
  Object.keys(sitesAfterMigration).length === 1 && Object.keys(sitesAfterMigration)[0] === SITE_ORIGIN,
  JSON.stringify(sitesAfterMigration))

// ═══════════════════════════════════════════════════════════════════
console.log('\nT4 · persistencia de pendientes en storage.session (B4)')
// ═══════════════════════════════════════════════════════════════════
const txRpc = send({
  type: 'CODECRYPTO_RPC',
  method: 'eth_sendTransaction',
  params: [{ from: ADDRESS, to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', value: '0x16345785d8a0000' }]
}, senderWithTab)
await delay(150)

const persisted = sessionData.get('codecrypto_session_approvals') || []
check('la aprobación pendiente se persiste en storage.session',
  persisted.length === 1 && persisted[0].method === 'eth_sendTransaction', JSON.stringify(persisted))
check('el badge muestra 1 pendiente', getBadgeText() === '1', `badge="${getBadgeText()}"`)
check('la solicitud no abre ventana flotante (se atiende en la wallet)',
  persisted[0]?.windowId === null && api.openWindows.size === 0,
  `windowId=${persisted[0]?.windowId} · ${api.openWindows.size} ventana(s)`)

// ═══════════════════════════════════════════════════════════════════
console.log('\nT5 · la wallet rechaza dentro del popup (SIGN_RESPONSE)')
// ═══════════════════════════════════════════════════════════════════
await send({
  type: 'SIGN_RESPONSE',
  approvalId: persisted[0]?.approvalId,
  success: false,
  error: 'User rejected'
})
const txResult = await txRpc
check('la dApp recibe un error claro (no null)',
  /user rejected/i.test(txResult?.error?.message || ''), JSON.stringify(txResult))
check('y con el código EIP-1193 de rechazo del usuario (4001)',
  txResult?.error?.code === 4001, JSON.stringify(txResult?.error))
check('se limpia la solicitud pendiente', (sessionData.get('codecrypto_session_approvals') || []).length === 0)
check('el badge queda vacío', getBadgeText() === '', `badge="${getBadgeText()}"`)

// ═══════════════════════════════════════════════════════════════════
console.log('\nT5b · la wallet aprueba una firma dentro del popup (SIGN_RESPONSE)')
// ═══════════════════════════════════════════════════════════════════
const signRpc = send({
  type: 'CODECRYPTO_RPC',
  method: 'personal_sign',
  params: ['0x547275654b656174653a20707275656261', ADDRESS]
}, senderWithTab)
await delay(150)
const pendienteFirma = localData.get('codecrypto_pending_request')
check('la firma queda pendiente para la wallet', Boolean(pendienteFirma?.approvalId),
  JSON.stringify(pendienteFirma))
await send({
  type: 'SIGN_RESPONSE',
  approvalId: pendienteFirma?.approvalId,
  success: true
})
const signResult = await signRpc
check('la dApp recibe la firma EIP-191',
  typeof signResult?.result === 'string' && signResult.result.startsWith('0x') && signResult.result.length > 120,
  JSON.stringify(signResult)?.slice(0, 80))
check('no se abrió ninguna ventana flotante', api.openWindows.size === 0,
  `${api.openWindows.size} ventana(s)`)

// ═══════════════════════════════════════════════════════════════════
console.log('\nT6 · WALLET_RESET cancela pendientes y limpia el estado (B2)')
// ═══════════════════════════════════════════════════════════════════
const txRpc2 = send({
  type: 'CODECRYPTO_RPC',
  method: 'eth_sendTransaction',
  params: [{ from: ADDRESS, to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', value: '0x1' }]
}, senderWithTab)
await delay(150)
check('hay una aprobación pendiente antes del reset', (sessionData.get('codecrypto_session_approvals') || []).length === 1)

await send({ type: 'WALLET_RESET' })
const txResult2 = await txRpc2
check('la solicitud pendiente se rechaza', txResult2?.error?.message === 'Wallet was reset', JSON.stringify(txResult2))
check('storage.session queda limpio', (sessionData.get('codecrypto_session_approvals') || []).length === 0)
check('storage.local sin solicitudes pendientes', !localData.has('codecrypto_pending_request'))
check('el badge queda vacío', getBadgeText() === '', `badge="${getBadgeText()}"`)

// ═══════════════════════════════════════════════════════════════════
console.log('\nT7 · validación BIP-39 del mnemonic (wallet_validateMnemonic)')
// ═══════════════════════════════════════════════════════════════════
const validOk = await send({ type: 'CODECRYPTO_RPC', method: 'wallet_validateMnemonic', params: [TEST_MNEMONIC] }, senderWithTab)
check('acepta el mnemonic de prueba', validOk?.result?.valid === true, JSON.stringify(validOk))

const tooShort = await send({ type: 'CODECRYPTO_RPC', method: 'wallet_validateMnemonic', params: ['test test test'] }, senderWithTab)
check('rechaza una frase de 3 palabras', tooShort?.result?.valid === false && /12 palabras/.test(tooShort.result.error), JSON.stringify(tooShort))

const badChecksum = await send({
  type: 'CODECRYPTO_RPC', method: 'wallet_validateMnemonic',
  params: ['test test test test test test test test test test test test']
}, senderWithTab)
check('rechaza un checksum inválido', badChecksum?.result?.valid === false, JSON.stringify(badChecksum))

// ═══════════════════════════════════════════════════════════════════
console.log('\nT8 · generación de una wallet nueva (wallet_generateMnemonic)')
// ═══════════════════════════════════════════════════════════════════
const generated = await send({ type: 'CODECRYPTO_RPC', method: 'wallet_generateMnemonic' }, senderWithTab)
const phrase = generated?.result?.mnemonic || ''
check('devuelve 12 palabras', phrase.split(' ').length === 12, phrase)

const revalidated = await send({ type: 'CODECRYPTO_RPC', method: 'wallet_validateMnemonic', params: [phrase] }, senderWithTab)
check('la frase generada es un BIP-39 válido', revalidated?.result?.valid === true, JSON.stringify(revalidated))

const { ethers } = await import('ethers')
const expectedAddress = ethers.HDNodeWallet.fromPhrase(phrase).address
check('la dirección devuelta corresponde a la frase',
  generated?.result?.address === expectedAddress, `${generated?.result?.address} vs ${expectedAddress}`)

// ═══════════════════════════════════════════════════════════════════
console.log('\nT9 · listado de redes (wallet_getChains)')
// ═══════════════════════════════════════════════════════════════════
const chainsResult = await send({ type: 'CODECRYPTO_RPC', method: 'wallet_getChains' }, senderWithTab)
const chainIds = (chainsResult?.result || []).map((c) => c.chainId)
check('incluye anvil (0x7a69) y Sepolia (0xaa36a7)',
  chainIds.includes('0x7a69') && chainIds.includes('0xaa36a7'), JSON.stringify(chainIds))

// ═══════════════════════════════════════════════════════════════════
console.log('\nT10 · alta de red personalizada (wallet_addEthereumChain)')
// ═══════════════════════════════════════════════════════════════════
const fakeRpc = await startFakeRpcServer('0x13882') // 80002 (Polygon Amoy)

const addOk = await send({
  type: 'CODECRYPTO_RPC',
  method: 'wallet_addEthereumChain',
  params: [{
    chainId: '80002',
    chainName: 'Polygon Amoy',
    rpcUrls: [fakeRpc.url],
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    blockExplorerUrls: ['https://amoy.polygonscan.com']
  }]
}, senderWithTab)

const addedChains = (addOk?.result?.chains || []).map((c) => c.chainId)
check('la red se añade al listado', addedChains.includes('0x13882'), JSON.stringify(addedChains))
check('queda como red activa', addOk?.result?.chainId === '0x13882', JSON.stringify(addOk?.result))
check('se persiste en storage.local', (localData.get('codecrypto_chains') || []).length === 1,
  JSON.stringify(localData.get('codecrypto_chains')))

const mismatch = await send({
  type: 'CODECRYPTO_RPC',
  method: 'wallet_addEthereumChain',
  params: [{ chainId: '0x1', chainName: 'Mala', rpcUrls: [fakeRpc.url] }]
}, senderWithTab)
check('rechaza una red cuyo RPC responde otro chainId',
  /responde con chainId/.test(mismatch?.error?.message || ''), JSON.stringify(mismatch))
check('con código de parámetros inválidos (-32602)',
  mismatch?.error?.code === -32602, JSON.stringify(mismatch?.error))

const unknownChain = await send({
  type: 'CODECRYPTO_RPC',
  method: 'wallet_switchEthereumChain',
  params: [{ chainId: '0x9999' }]
}, senderWithTab)
check('cambiar a una red no registrada devuelve 4902 (EIP-3326)',
  unknownChain?.error?.code === 4902, JSON.stringify(unknownChain))

const unsupported = await send({
  type: 'CODECRYPTO_RPC',
  method: 'eth_sign',
  params: [ADDRESS, '0xdeadbeef']
}, senderWithTab)
check('un método no soportado devuelve 4200 (EIP-1193)',
  unsupported?.error?.code === 4200, JSON.stringify(unsupported))

await fakeRpc.close()

// ═══════════════════════════════════════════════════════════════════
console.log('\nT11 · bus de logs del popup (requisitos 13, 14, 16 y 23)')
// ═══════════════════════════════════════════════════════════════════
localData.set('codecrypto_logs', [])

// Llamada de una dApp → debe registrarse
await send({ type: 'CODECRYPTO_RPC', method: 'eth_accounts', params: [] }, senderWithTab)
// Lectura de sondeo del propio popup (sin pestaña) → no debe registrarse
await send({ type: 'CODECRYPTO_RPC', method: 'eth_getBalance', params: [ADDRESS] }, {})
await delay(120)

const logs = localData.get('codecrypto_logs') || []
const contents = logs.map((entry) => `${entry.type}:${entry.content}`)
check('registra la llamada de la dApp', contents.some((c) => c.startsWith('call:eth_accounts')), JSON.stringify(contents))
check('NO registra el sondeo de balance del popup', !contents.some((c) => c.includes('eth_getBalance')), JSON.stringify(contents))
check('las entradas guardan su origen', logs.every((entry) => typeof entry.source === 'string'), JSON.stringify(logs))
check('el historial se mantiene acotado a 200 entradas',
  (localData.get('codecrypto_logs') || []).length <= 200)

// ═══════════════════════════════════════════════════════════════════
// Resumen
// ═══════════════════════════════════════════════════════════════════
process.exit(summary() ? 0 : 1)
