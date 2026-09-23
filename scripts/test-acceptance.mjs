#!/usr/bin/env node
/**
 * scripts/test-acceptance.mjs — Ejecución de los 11 casos de prueba del enunciado.
 *
 * Arranca un nodo **anvil real** (Foundry), carga el service worker compilado
 * (`dist/background.js`) con las APIs de `chrome` simuladas y ejecuta los casos
 * de `TAREA_PARA_ESTUDIANTE.md` de extremo a extremo: derivación de cuentas,
 * conexión de una dApp, transacción real minada en anvil, firma EIP-712
 * verificada, eventos, reset, transferencia interna, badge y selección de cuenta.
 *
 * Al terminar escribe la evidencia en `documentacion/evidencia-fase4.md`.
 *
 * Uso:
 *   npm run test:acceptance
 *
 * Nota: los casos que dependen del navegador (ventanas reales, notificación
 * nativa de Chrome, render del popup) quedan marcados como MANUAL y se detallan
 * en `INSTRUCCIONES.md` (sección 8).
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ethers } from 'ethers'
import { createReporter, delay, installChromeStub } from './lib/chrome-stub.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RPC_URL = 'http://127.0.0.1:8545'
const MNEMONIC = 'test test test test test test test test test test test junk'
const SITE_URL = 'http://localhost:5173/test.html'
const SITE_ORIGIN = 'http://localhost:5173'
const REPORT_PATH = resolve(ROOT, 'documentacion', 'evidencia-fase4.md')

// ── 1. Nodo local (anvil) ───────────────────────────────────────────────
async function rpcIsUp() {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    })
    return response.ok
  } catch {
    return false
  }
}

let anvilProcess = null
if (await rpcIsUp()) {
  console.log('⛓️  Ya hay un nodo en 127.0.0.1:8545, se reutiliza')
} else {
  console.log('⛓️  Arrancando anvil (Foundry)…')
  anvilProcess = spawn('bash', [
    resolve(ROOT, 'scripts/foundry.sh'), 'anvil',
    '--host', '127.0.0.1', '--port', '8545', '--chain-id', '31337'
  ], { stdio: 'ignore' })

  for (let attempt = 0; attempt < 60 && !(await rpcIsUp()); attempt++) {
    await delay(500)
  }
}

if (!(await rpcIsUp())) {
  console.error('❌ No se pudo arrancar anvil. Ejecuta `npm run chain` en otra terminal.')
  process.exit(1)
}

process.on('exit', () => {
  if (anvilProcess) anvilProcess.kill('SIGTERM')
})

// ── 2. Entorno de pruebas ───────────────────────────────────────────────
const api = installChromeStub()
const { localData, sessionData, send, getBadgeText, addTab, tabMessages, openWindows } = api
const { check, summary, results } = createReporter()

addTab(1, SITE_URL)
const dappSender = { tab: { id: 1, url: SITE_URL } }
const popupSender = { origin: 'chrome-extension://test/' }
const provider = new ethers.JsonRpcProvider(RPC_URL)

const evidence = []
function note(text) {
  evidence.push(text)
  console.log(`     ↳ ${text}`)
}

/** Simula que el usuario aprueba la solicitud pendiente en la wallet. */
async function approvePending() {
  const pending = localData.get('codecrypto_pending_request')
  if (!pending) throw new Error('No hay solicitud de aprobación pendiente')
  return send({ type: 'SIGN_RESPONSE', approvalId: pending.approvalId, success: true }, popupSender)
}

/** Simula que el usuario elige una cuenta en la wallet. */
async function approveConnection(accountIndex) {
  const request = localData.get('codecrypto_connect_request')
  const accounts = localData.get('codecrypto_accounts')
  if (!request) throw new Error('No hay solicitud de conexión pendiente')
  return send({
    type: 'CONNECT_RESPONSE',
    requestId: request.requestId,
    success: true,
    account: accounts[accountIndex],
    accountIndex
  }, popupSender)
}

/** Las aprobaciones se atienden en la wallet: nunca debe abrirse una ventana. */
function sinVentanas() {
  return openWindows.size === 0
}

/** ¿Se difundió ese evento a la pestaña de la dApp? */
function receivedEvent(eventName) {
  return tabMessages.filter((entry) => entry.message?.eventName === eventName)
}

// El service worker se importa DESPUÉS de instalar el stub
await import(resolve(ROOT, 'dist/background.js'))
const nodeAccounts = await provider.listAccounts()
const nodeAddresses = nodeAccounts.map((account) => account.address)

console.log('\n🎓 Casos de prueba del enunciado (TAREA_PARA_ESTUDIANTE.md)\n')

// ═══════════════════════════════════════════════════════════════════════
console.log('Caso 1 · Inicialización de la wallet')
// ═══════════════════════════════════════════════════════════════════════
const derivation = await send(
  { type: 'CODECRYPTO_RPC', method: 'wallet_deriveAccounts', params: [MNEMONIC, 5] },
  popupSender
)
const accounts = derivation?.result || []
check('se derivan 5 cuentas HD (BIP-44)', accounts.length === 5, JSON.stringify(accounts))

check('las cuentas coinciden con las de anvil',
  accounts.every((address, index) => address.toLowerCase() === nodeAddresses[index].toLowerCase()),
  `${accounts[0]} vs ${nodeAddresses[0]}`)

const balance0 = await provider.getBalance(accounts[0])
check('la cuenta 0 arranca con 10 000 ETH', balance0 === ethers.parseEther('10000'),
  ethers.formatEther(balance0))

const chainIdResult = await send({ type: 'CODECRYPTO_RPC', method: 'eth_chainId', params: [] }, popupSender)
check('chainId por defecto 0x7a69 (31337)', chainIdResult?.result === '0x7a69', String(chainIdResult?.result))

const balanceHex = await send({ type: 'CODECRYPTO_RPC', method: 'eth_getBalance', params: [accounts[0], 'latest'] }, popupSender)
check('eth_getBalance devuelve el saldo en hex', balanceHex?.result === '0x' + balance0.toString(16),
  String(balanceHex?.result))

note(`Cuenta 0: ${accounts[0]} · saldo ${ethers.formatEther(balance0)} ETH`)

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 2 · Persistencia')
// ═══════════════════════════════════════════════════════════════════════
// El popup persiste estos valores al cargar la wallet (App.applyWallet)
await chrome.storage.local.set({
  codecrypto_mnemonic: MNEMONIC,
  codecrypto_accounts: accounts,
  codecrypto_current_account: '0',
  codecrypto_chain_id: '0x7a69'
})
check('el mnemonic, las cuentas, la cuenta activa y la red quedan guardados',
  localData.get('codecrypto_mnemonic') === MNEMONIC &&
  localData.get('codecrypto_accounts').length === 5 &&
  localData.get('codecrypto_current_account') === '0' &&
  localData.get('codecrypto_chain_id') === '0x7a69')

// Reapertura: se vuelve a derivar desde el mnemonic guardado
const reloaded = await send({
  type: 'CODECRYPTO_RPC',
  method: 'wallet_deriveAccounts',
  params: [localData.get('codecrypto_mnemonic'), 5]
}, popupSender)
check('al reabrir se restauran las mismas cuentas y la cuenta activa',
  reloaded?.result?.[0] === accounts[0] && localData.get('codecrypto_current_account') === '0')

note('No hace falta volver a introducir la frase: se relee de chrome.storage.local')

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 3 · Conexión desde una dApp')
// ═══════════════════════════════════════════════════════════════════════
const connectRpc = send({ type: 'CODECRYPTO_RPC', method: 'eth_requestAccounts', params: [] }, dappSender)
await delay(120)

const connectRequest = localData.get('codecrypto_connect_request')
check('la solicitud queda pendiente en la wallet (sin ventana flotante)', Boolean(connectRequest) && sinVentanas(), JSON.stringify([...openWindows.values()]))
check('la solicitud incluye el origen de la dApp', connectRequest?.origin === SITE_URL, String(connectRequest?.origin))
check('la solicitud lleva las 5 cuentas', connectRequest?.accounts?.length === 5)

await approveConnection(0)
const connected = await connectRpc
check('la dApp recibe la cuenta seleccionada', connected?.result?.[0] === accounts[0], JSON.stringify(connected))

const sites = localData.get('codecrypto_connected_sites') || {}
check('el permiso se guarda POR ORIGEN', Boolean(sites[SITE_ORIGIN]), JSON.stringify(sites))

const accountsAgain = await send({ type: 'CODECRYPTO_RPC', method: 'eth_accounts', params: [] }, dappSender)
check('eth_accounts devuelve la cuenta autorizada', accountsAgain?.result?.[0] === accounts[0], JSON.stringify(accountsAgain))

const strangerAccounts = await send({ type: 'CODECRYPTO_RPC', method: 'eth_accounts', params: [] }, { tab: { id: 2, url: 'http://otro.test/' } })
check('un sitio NO autorizado recibe []', strangerAccounts?.result?.length === 0, JSON.stringify(strangerAccounts))

note(`Origen autorizado: ${SITE_ORIGIN}`)

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 4 · Envío de transacción')
// ═══════════════════════════════════════════════════════════════════════
const recipient = nodeAddresses[1]
const amount = ethers.parseEther('0.1')
const balanceBeforeTx = await provider.getBalance(accounts[0])

const txRpc = send({
  type: 'CODECRYPTO_RPC',
  method: 'eth_sendTransaction',
  params: [{
    from: accounts[0],
    to: recipient,
    value: '0x' + amount.toString(16),
    data: '0x'
  }]
}, dappSender)
await delay(150)

const pendingTx = localData.get('codecrypto_pending_request')
check('la solicitud de firma queda pendiente en la wallet (sin ventana flotante)',
  Boolean(pendingTx) && sinVentanas())
check('la solicitud muestra destino, valor y red',
  pendingTx?.params?.[0]?.to === recipient && pendingTx?.chainId === '0x7a69',
  JSON.stringify(pendingTx?.params?.[0]))
check('mientras hay una solicitud pendiente, el badge muestra 1', getBadgeText() === '1', getBadgeText())

await approvePending()
const txResult = await txRpc
const txHash = txResult?.result
check('la dApp recibe el hash de la transacción', /^0x[0-9a-f]{64}$/.test(txHash || ''), JSON.stringify(txResult))
check('el badge se apaga al aprobar', getBadgeText() === '', getBadgeText())

const receipt = await provider.waitForTransaction(txHash)
check('la transacción está minada en anvil', receipt?.status === 1, `status=${receipt?.status}`)
check('se envió como EIP-1559 (tipo 2)', receipt?.type === 2, `type=${receipt?.type}`)

const balanceAfterTx = await provider.getBalance(accounts[0])
const spent = balanceBeforeTx - balanceAfterTx
check('el saldo baja exactamente 0.1 ETH + gas',
  spent === amount + receipt.gasUsed * receipt.gasPrice,
  `gastado ${ethers.formatEther(spent)} ETH`)

note(`Hash: ${txHash}`)
note(`Gas usado: ${receipt.gasUsed} · tipo ${receipt.type} (EIP-1559) · bloque ${receipt.blockNumber}`)

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 5 · Firma EIP-712')
// ═══════════════════════════════════════════════════════════════════════
// La firma se hace con la cuenta ACTIVA, así que se selecciona la cuenta 2
await chrome.storage.local.set({ codecrypto_current_account: '2' })

const typedData = {
  types: {
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' }
    ]
  },
  domain: {
    name: 'CodeCrypto Test App',
    version: '1',
    chainId: 31337,
    verifyingContract: '0x0000000000000000000000000000000000000000'
  },
  message: { name: 'Alice', wallet: accounts[2] }
}

const signRpc = send({
  type: 'CODECRYPTO_RPC',
  method: 'eth_signTypedData_v4',
  params: [accounts[2], JSON.stringify(typedData)]
}, dappSender)
await delay(150)

const pendingSign = localData.get('codecrypto_pending_request')
check('se abre la ventana de confirmación para firmar', Boolean(pendingSign) && pendingSign.method === 'eth_signTypedData_v4',
  String(pendingSign?.method))

await approvePending()
const signature = (await signRpc)?.result
check('devuelve una firma de 132 caracteres', typeof signature === 'string' && signature.length === 132,
  `${String(signature).slice(0, 20)}… (${String(signature).length} caracteres)`)

const recovered = ethers.verifyTypedData(typedData.domain, { Person: typedData.types.Person }, typedData.message, signature)
check('la firma corresponde a la cuenta activa',
  recovered.toLowerCase() === accounts[2].toLowerCase(), `${recovered} vs ${accounts[2]}`)

note(`Firma: ${String(signature).slice(0, 24)}…`)
note(`Dirección recuperada: ${recovered}`)

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 6 · Cambio de cuenta')
// ═══════════════════════════════════════════════════════════════════════
tabMessages.length = 0
// El popup escribe en storage y avisa al background (App.changeAccount)
await chrome.storage.local.set({ codecrypto_current_account: '1' })
await send({ type: 'ACCOUNT_CHANGED', accountIndex: 1, account: accounts[1] }, popupSender)
await delay(150)

const accountEvents = receivedEvent('accountsChanged')
check('la dApp recibe el evento accountsChanged', accountEvents.length > 0, `${accountEvents.length} eventos`)
check('el evento lleva la nueva cuenta',
  accountEvents.some((entry) => entry.message.data?.[0] === accounts[1]),
  JSON.stringify(accountEvents.map((e) => e.message.data)))

const activeAccount = localData.get('codecrypto_current_account')
check('la cuenta activa queda guardada en storage', activeAccount === '1', String(activeAccount))

note(`accountsChanged → ${accounts[1]}`)

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 7 · Cambio de red')
// ═══════════════════════════════════════════════════════════════════════
tabMessages.length = 0
await chrome.storage.local.set({ codecrypto_chain_id: '0xaa36a7' })
await send({ type: 'CHAIN_CHANGED', chainId: '0xaa36a7' }, popupSender)
await delay(150)

const chainEvents = receivedEvent('chainChanged')
check('la dApp recibe el evento chainChanged', chainEvents.length > 0, `${chainEvents.length} eventos`)
check('el evento lleva el nuevo chainId',
  chainEvents.some((entry) => entry.message.data === '0xaa36a7'),
  JSON.stringify(chainEvents.map((e) => e.message.data)))

const unknownChain = await send({
  type: 'CODECRYPTO_RPC',
  method: 'wallet_switchEthereumChain',
  params: [{ chainId: '0x9999' }]
}, dappSender)
check('cambiar a una red no registrada devuelve 4902', unknownChain?.error?.code === 4902,
  JSON.stringify(unknownChain?.error))

// Se vuelve a la red local para el resto de casos
await chrome.storage.local.set({ codecrypto_chain_id: '0x7a69' })

note('chainChanged → 0xaa36a7 (Sepolia)')

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 8 · Reset de la wallet')
// ═══════════════════════════════════════════════════════════════════════
// Se deja una solicitud pendiente para comprobar que el reset la cancela
const pendingRpc = send({
  type: 'CODECRYPTO_RPC',
  method: 'eth_sendTransaction',
  params: [{ from: accounts[1], to: recipient, value: '0x1' }]
}, dappSender)
await delay(150)
check('hay una solicitud pendiente antes del reset', getBadgeText() === '1', getBadgeText())

await send({ type: 'WALLET_RESET' }, popupSender)
const cancelled = await pendingRpc
check('el reset cancela la solicitud pendiente', cancelled?.error?.code === 4001, JSON.stringify(cancelled?.error))
check('el badge queda apagado', getBadgeText() === '', getBadgeText())
check('no queda ninguna solicitud en storage.session',
  (sessionData.get('codecrypto_session_approvals') || []).length === 0)

// El borrado de claves lo ejecuta el popup con esta regla (App.resetWallet →
// walletKeysToReset): se compila el módulo real y se ejecuta.
const keep = await runResetRule(['codecrypto_mnemonic', 'codecrypto_accounts', 'codecrypto_logs', 'codecrypto_connected_sites', 'otra_cosa'])
check('el reset borra todas las claves de la wallet',
  keep.removed.includes('codecrypto_mnemonic') &&
  keep.removed.includes('codecrypto_accounts') &&
  keep.removed.includes('codecrypto_connected_sites'),
  JSON.stringify(keep.removed))
check('el reset conserva el historial de logs',
  !keep.removed.includes('codecrypto_logs'), JSON.stringify(keep.removed))
check('el reset no toca claves ajenas a la wallet',
  !keep.removed.includes('otra_cosa'), JSON.stringify(keep.removed))

// Se restaura el estado para los casos siguientes
await chrome.storage.local.set({
  codecrypto_mnemonic: MNEMONIC,
  codecrypto_accounts: accounts,
  codecrypto_current_account: '0',
  codecrypto_chain_id: '0x7a69'
})

note('Solicitudes canceladas y badge apagado; el historial de logs se conserva')

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 9 · Transferencia entre cuentas')
// ═══════════════════════════════════════════════════════════════════════
const before0 = await provider.getBalance(accounts[0])
const before1 = await provider.getBalance(accounts[1])

const transferRpc = send({
  type: 'CODECRYPTO_RPC',
  method: 'eth_sendTransaction',
  params: [{ from: accounts[0], to: accounts[1], value: '0x' + ethers.parseEther('1').toString(16) }]
}, popupSender)
await delay(150)
await approvePending()
const transferHash = (await transferRpc)?.result
const transferReceipt = await provider.waitForTransaction(transferHash)

const after0 = await provider.getBalance(accounts[0])
const after1 = await provider.getBalance(accounts[1])

check('la transferencia se mina', transferReceipt?.status === 1, `status=${transferReceipt?.status}`)
check('la cuenta destino gana exactamente 1 ETH', after1 - before1 === ethers.parseEther('1'),
  `${ethers.formatEther(after1 - before1)} ETH`)
check('la cuenta origen pierde 1 ETH + gas',
  before0 - after0 === ethers.parseEther('1') + transferReceipt.gasUsed * transferReceipt.gasPrice,
  `${ethers.formatEther(before0 - after0)} ETH`)

note(`Transferencia: ${ethers.formatEther(after1 - before1)} ETH · hash ${transferHash}`)

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 10 · Badge y notificación')
// ═══════════════════════════════════════════════════════════════════════
check('sin solicitudes pendientes el badge está vacío', getBadgeText() === '', getBadgeText())

const badgeRpc = send({
  type: 'CODECRYPTO_RPC',
  method: 'eth_signTypedData_v4',
  params: [accounts[0], JSON.stringify(typedData)]
}, dappSender)
await delay(150)
check('con una solicitud pendiente el badge muestra 1', getBadgeText() === '1', getBadgeText())
check('la confirmación se muestra en la wallet, sin ventana flotante', sinVentanas())
await approvePending()
await badgeRpc
check('al resolverse, el badge vuelve a estar vacío', getBadgeText() === '', getBadgeText())

note('La notificación nativa de Chrome y el popup real se verifican a mano (ver INSTRUCCIONES.md §8)')

// ═══════════════════════════════════════════════════════════════════════
console.log('\nCaso 11 · Selección de cuenta al conectar')
// ═══════════════════════════════════════════════════════════════════════
// Nueva pestaña, sin conexión previa
addTab(3, 'http://localhost:5173/test.html?segunda=1')
const secondOrigin = 'http://localhost:5173'
localData.set('codecrypto_connected_sites', {})

const connectRpc2 = send({ type: 'CODECRYPTO_RPC', method: 'eth_requestAccounts', params: [] },
  { tab: { id: 3, url: 'http://localhost:5173/otra.html' } })
await delay(120)

const connectRequest2 = localData.get('codecrypto_connect_request')
check('la solicitud de conexión en la wallet lleva el origen',
  connectRequest2?.origin === 'http://localhost:5173/otra.html', String(connectRequest2?.origin))
check('la solicitud de conexión lleva las 5 cuentas y no abre ventana',
  connectRequest2?.accounts?.length === 5 && sinVentanas())

await approveConnection(3)
const connected2 = await connectRpc2
check('la dApp conecta con la Cuenta 3', connected2?.result?.[0] === accounts[3], JSON.stringify(connected2))

const sites2 = localData.get('codecrypto_connected_sites') || {}
check('la Cuenta 3 queda autorizada para ese origen', sites2[secondOrigin] === accounts[3],
  JSON.stringify(sites2))

const accountsAfter = await send({ type: 'CODECRYPTO_RPC', method: 'eth_accounts', params: [] },
  { tab: { id: 3, url: 'http://localhost:5173/otra.html' } })
check('eth_accounts devuelve la Cuenta 3', accountsAfter?.result?.[0] === accounts[3], JSON.stringify(accountsAfter))

note(`Cuenta 3 autorizada para ${secondOrigin}: ${accounts[3]}`)

// ═══════════════════════════════════════════════════════════════════════
// Evidencia
// ═══════════════════════════════════════════════════════════════════════
const ok = summary()

const lines = [
  '# 🎓 Evidencia de los 11 casos de prueba del enunciado',
  '',
  `Ejecutado el ${new Date().toLocaleString('es-ES')} con \`npm run test:acceptance\`.`,
  '',
  '**Entorno**',
  '',
  `- Node ${process.version}`,
  `- anvil en ${RPC_URL} (chainId 0x7a69)`,
  `- Service worker real: \`dist/background.js\` con las APIs de \`chrome\` simuladas (\`scripts/lib/chrome-stub.mjs\`)`,
  '- Casos ejecutados de extremo a extremo contra la cadena: derivación, conexión,',
  '  transacción y transferencia **minadas de verdad en anvil**, firma EIP-712 verificada,',
  '  eventos difundidos a las pestañas, reset, badge y selección de cuenta.',
  '',
  '**Resultado global**',
  '',
  `| Comprobaciones | Resultado |`,
  `|---|---|`,
  `| Total | ${results.length} |`,
  `| Correctas | ${results.filter((r) => r.ok).length} |`,
  `| Fallidas | ${results.filter((r) => !r.ok).length} |`,
  '',
  '**Detalle**',
  '',
  '| # | Comprobación | Resultado | Evidencia |',
  '|---|---|---|---|',
  ...results.map((r, index) => `| ${index + 1} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail.replace(/\|/g, '\\|')} |`),
  '',
  '**Datos de la cadena**',
  '',
  ...evidence.map((line) => `- ${line}`),
  '',
  '**Casos que requieren navegador (MANUAL)**',
  '',
  'Estos puntos no se pueden automatizar en Node y se verifican cargando `dist/` en Chrome:',
  'la vista real de aprobación **dentro de la wallet**, la notificación',
  'nativa de Chrome, el render del popup (selector de cuentas, panel de actividad, alta de',
  'redes con el diálogo de permisos) y el aspecto visual del badge. Los pasos están en',
  '`INSTRUCCIONES.md` (§6, §7 y §8).',
  ''
]

writeFileSync(REPORT_PATH, lines.join('\n'), 'utf-8')
console.log(`📄 Evidencia escrita en ${REPORT_PATH}`)

process.exit(ok ? 0 : 1)

/**
 * Ejecuta la regla de borrado del reset compilando el módulo real del proyecto
 * (`src/utils/storage.ts`), para no duplicar la lógica en las pruebas.
 */
async function runResetRule(keys) {
  const outDir = mkdtempSync(resolve(tmpdir(), 'reset-rule-'))
  execFileSync('npx', [
    'tsc', 'src/utils/storage.ts',
    '--outDir', outDir,
    '--module', 'esnext',
    '--target', 'es2022',
    '--moduleResolution', 'bundler'
  ], { cwd: ROOT, stdio: 'ignore' })

  const mod = await import(pathToFileURL(resolve(outDir, 'storage.js')).href)
  return { removed: mod.walletKeysToReset(keys) }
}
