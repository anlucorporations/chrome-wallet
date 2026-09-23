#!/usr/bin/env node
/**
 * scripts/test-amount.mjs — Pruebas de la conversión ETH → wei del popup.
 *
 * Compila `src/utils/amount.ts` a un directorio temporal y comprueba que la
 * conversión es exacta (el bug original usaba `parseFloat(amount) * 1e18`).
 *
 * Uso:
 *   node scripts/test-amount.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = mkdtempSync(resolve(tmpdir(), 'amount-test-'))

execFileSync('npx', [
  'tsc', 'src/utils/amount.ts',
  '--outDir', outDir,
  '--module', 'esnext',
  '--target', 'es2022',
  '--moduleResolution', 'bundler'
], { cwd: ROOT, stdio: 'inherit' })

const { parseEthToWei, formatWeiToEth, validateAmount, AmountError } =
  await import(pathToFileURL(resolve(outDir, 'amount.js')).href)

let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const throws = (fn) => { try { fn(); return null } catch (e) { return e } }

console.log('\n🔬 Conversión ETH → wei (src/utils/amount.ts)\n')

// ── Precisión ───────────────────────────────────────────────────────
check("parseEthToWei('1') = 1e18", parseEthToWei('1') === 10n ** 18n)
check("parseEthToWei('0.1') = 1e17 exacto", parseEthToWei('0.1') === 100000000000000000n,
  `obtenido ${parseEthToWei('0.1')}`)
check("parseEthToWei('0.000000000000000001') = 1 wei", parseEthToWei('0.000000000000000001') === 1n)
check("parseEthToWei('10000') = 1e22", parseEthToWei('10000') === 10n ** 22n)
check("parseEthToWei('.5') = 5e17", parseEthToWei('.5') === 500000000000000000n)
check("parseEthToWei('1,5') acepta coma decimal", parseEthToWei('1,5') === 1500000000000000000n)

// El bug original: parseFloat pierde precisión en muchos importes reales
const buggyFor = (amount) => {
  try { return BigInt(parseFloat(amount) * 1e18) } catch { return null }
}
check("la conversión antigua (parseFloat) desviaba 1.1 ETH",
  buggyFor('1.1') !== parseEthToWei('1.1'),
  `parseFloat dio ${buggyFor('1.1')} vs exacto ${parseEthToWei('1.1')}`)
check("la conversión antigua también desviaba 0.07 ETH",
  buggyFor('0.07') !== parseEthToWei('0.07'),
  `parseFloat dio ${buggyFor('0.07')} vs exacto ${parseEthToWei('0.07')}`)
check("la conversión antigua desviaba 1.005 ETH",
  buggyFor('1.005') !== parseEthToWei('1.005'),
  `parseFloat dio ${buggyFor('1.005')} vs exacto ${parseEthToWei('1.005')}`)

// ── Validaciones ────────────────────────────────────────────────────
check("rechaza cadena vacía", throws(() => parseEthToWei('')) instanceof AmountError)
check("rechaza 'abc'", throws(() => parseEthToWei('abc')) instanceof AmountError)
check("rechaza '0'", throws(() => parseEthToWei('0')) instanceof AmountError)
check("rechaza '-1'", throws(() => parseEthToWei('-1')) instanceof AmountError)
check("rechaza 19 decimales", throws(() => parseEthToWei('0.0000000000000000001')) instanceof AmountError)
check("mensaje de error en español", throws(() => parseEthToWei('abc'))?.message.includes('Formato'))

// ── Formato ─────────────────────────────────────────────────────────
check('formatWeiToEth(5 ETH) = 5.000000', formatWeiToEth(5n * 10n ** 18n) === '5.000000',
  formatWeiToEth(5n * 10n ** 18n))
check('formatWeiToEth(1 wei) = 0.000000', formatWeiToEth(1n) === '0.000000')

// ── Validación contra el saldo ──────────────────────────────────────
const saldo = 10000n * 10n ** 18n
check('acepta un importe menor que el saldo', validateAmount('1', saldo) === '')
check('rechaza un importe mayor que el saldo',
  validateAmount('10001', saldo).includes('Saldo insuficiente'), validateAmount('10001', saldo))
check('acepta exactamente el saldo', validateAmount('10000', saldo) === '')

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} comprobaciones OK, ${failed} fallidas\n`)
process.exit(failed === 0 ? 0 : 1)
