# ACTA DE VERIFICACIÓN — HITO H2 (cartera, cuentas y recuperación)

**Tareas:** 2.16 (especificaciones del hito) y 2.17 (E2E del hito).
**Fecha de la ejecución:** 2026-09-11.
**Alcance del acta:** solo las pruebas y la evidencia de H2. Todo número de este documento sale de una
ejecución REAL registrada en `RepoTecnico/evidencia/H2/`; lo no ejecutado se declara como tal.

---

## 1. Tabla de comandos y resultado real

Ejecutados con **Anvil en `127.0.0.1:8545` (chainId 31337)** y `dist/` reconstruido por el
`global-setup` del arnés (`VITE_SIGN_TIMEOUT_MS=3000`, `VITE_CONNECT_TIMEOUT_MS=2000`); al terminar
la suite se reconstruyó `dist/` con los plazos de **producción**.

| Comando | Resultado REAL | Evidencia |
|---|---|---|
| `npx tsc -b` | **exit 0** — strict, 0 errores (incluye `src/`, `test/` y `e2e/`) | `typecheck-2026-09-11.log` |
| `npm run build` | **exit 0** — 6 entradas en `dist/` (`index.html`, `connect.html`, `notification.html`, `background.js`, `content-script.js`, `inject.js`) + `dist/manifest.json` | `build-2026-09-11.log` |
| `npm run lint:prohibited` | **exit 0** — 73 ficheros de `src/` y 13 de `dist/`; 0 dependencias prohibidas, 0 `fetch(` propio, 0 `chrome.storage.sync`, 0 `codecrypto_`, 0 colores fuera de `tokens.css` y 0 `ethers` en el popup | `lint-prohibited-2026-09-11.log` |
| `npm run test` (Vitest) | **exit 0** — **18 ficheros, 290 tests passed, 0 failed** | `vitest-2026-09-11.log` |
| `npm run coverage` (Vitest + v8) | **exit 0** — `src/background/crypto/` = **95,13 %** de líneas (488/513) y `src/shared/validation/` = **97,27 %** (214/220); umbral ≥ 80 % **cumplido** | `coverage-2026-09-11.json`, `vitest-coverage-2026-09-11.log` |
| `npm run test:e2e` (Playwright) | **exit 0** — **23 passed / 0 failed / 0 skipped / 0 flaky** (23 specs de H1+H2) | `playwright-2026-09-11.log`, `e2e-2026-09-11.json` |
| `npm run build` (dentro del `global-setup` de E2E) | **exit 0** — 6 entradas en `dist/` + `manifest.json` con los plazos inyectados | `e2e-global-setup-2026-09-11.log` |
| `cast chain-id --rpc-url http://127.0.0.1:8545` | **31337** (Anvil en marcha durante toda la suite) | `e2e-global-setup-2026-09-11.log` |
| `rg -n "chrome\.storage" src/popup` | **0 coincidencias** (RNF-14: el popup no lee ni escribe el almacén) | `_verificacion-resumen.log` |
| `rg -n "from 'ethers'" src/popup` | **0 coincidencias** (`CA-RT-02`) | `_verificacion-resumen.log` |

> **Nota de host (no es un defecto del producto).** En este equipo Windows **no hay `grep`
> instalado**: los dos últimos comandos se ejecutan con **ripgrep** (`rg`, el mismo motor de
> búsqueda) y devuelven **exit 1 = 0 coincidencias** en ambos casos.
>
> **No se declara cumplido nada que no se haya ejecutado.** `npm run coverage` no aplica umbrales
> automáticos en `vite.config.ts` (no hay `thresholds` declarados): el umbral de §3.2.9 se comprueba
> **a mano** sobre `coverage-2026-09-11.json` y el cálculo está en §3 de esta acta.

---

## 2. Specs creados y número de tests

### 2.1 Vitest (12 specs de H2; la suite completa queda en **290 tests / 18 ficheros**)

| Spec | Tests | Qué demuestra |
|---|---|---|
| `src/background/crypto/mnemonic.spec.ts` | 15 | `CA-RF-01` (12 palabras, checksum válido), `CA-RF-02` (normalización y checksum roto `-32602`), huellas de log sin fuga |
| `src/background/crypto/derivation.spec.ts` | 17 | Ruta `m/44'/60'/0'/0/i`, 5 cuentas (0..4) y la 6.ª, vectores REALES de Anvil y de BIP-39, cero derivaciones silenciosas |
| `src/background/crypto/importPrivateKey.spec.ts` | 13 | `CA-RF-05`: forma, rango secp256k1 (1 y `n-1` válidos, 0 y `n` rechazados), dirección EIP-55, enmascarado |
| `src/background/crypto/integrity.spec.ts` | 18 | RNF-22: checksum roto, palabra fuera de lista, dirección malformada / sin EIP-55, clave↔dirección incoherente, activa inexistente, `derivations: 0` |
| `src/background/crypto/secretsExport.spec.ts` | 20 | `CA-RF-50`: confirmación explícita, allowlist de contexto (popup con o sin pestaña, D-H2-G), 30 s, mnemonic y clave derivada/importada, guarda `-32000` (vigente / caducada / desconectada / otro origen) |
| `src/background/crypto/revealHygiene.spec.ts` | 14 | 30 000 ms exactos, ocultado por pérdida de foco, descarte de memoria, idempotencia, **0 `postMessage`**, el mensaje interno no transporta el valor |
| `src/background/crypto/revealClipboard.spec.ts` | 14 | Borrado del portapapeles al ocultar; NO se destruye contenido ajeno; respaldo incondicional si falla la lectura; `dispose` no toca el portapapeles |
| `src/background/accounts.spec.ts` | 35 | `CA-RF-01/02/03/04/05`: 5 cuentas + 6.ª, sin contraseña, etiquetas DEC-35 (derivadas vs importadas), visibilidad, y guarda `-32000` al **eliminar** una importada |
| `src/background/state/state.spec.ts` | 27 | Claves canónicas, rechazo de clave no canónica, persistencia/restauración y **migración v1.2→v1.4 sin pérdida** |
| `src/background/state/reset.spec.ts` | 20 | `CA-RF-11`: **orden de comprobación** (cola → vuelo → confirmación → limpieza), bloqueo `-32000` sin tocar el almacén, 13 claves borradas y `truekeate_logs` conservada |
| `src/shared/validation/validation.spec.ts` | 24 | `CA-RF-33`: los cuatro formularios (frase, dirección, importe, clave privada) con magnitudes concretas y el `code`/acción de §4.3 |
| `src/shared/qr.spec.ts` | 14 | `CA-RF-07`: versiones 1..4, Reed-Solomon con síndromes nulos, información de formato, **símbolo decodificado** = dirección, SVG sin red ni literales de color |

### 2.2 Playwright (7 specs, **23 tests**, todos en verde)

| Spec | Tests | Qué demuestra |
|---|---|---|
| `e2e/01-onboarding.spec.ts` (ampliado) | 6 | Carga de `dist/` con ID descubierto, popup 380×600 sin errores de consola, `sw_started`, suspensión/re-arranque del SW (RNF-08), crear cartera sin **ningún** prompt de contraseña (`CA-RF-01`/`CA-RF-03`) e importar la frase de Anvil normalizando mayúsculas/espacios (`CA-RF-02`) |
| `e2e/02-cuentas.spec.ts` | 3 | 5 cuentas + la 6.ª contrastadas con **`cast balance`** (`CA-RF-04`), importación por clave privada con etiqueta renombrable y duplicado `-32602` (`CA-RF-05`), bloqueo/desbloqueo de la eliminación por sesión de dApp (`-32000`) |
| `e2e/03-recibir.spec.ts` | 2 | Dirección mostrada = portapapeles = **QR decodificado** desde la rejilla del DOM (`CA-RF-07`) |
| `e2e/05-persistencia.spec.ts` | 3 | Reapertura del popup sin pedir la frase (`CA-RF-09`/`CA-RF-10`), suspensión del SW por CDP sin pérdida y «Wallet dañada» (RNF-22) |
| `e2e/06-reset.spec.ts` | 3 | Diálogo que enumera las importadas, reset con aviso de éxito y `truekeate_logs` conservada (`CA-RF-11`); reset **bloqueado** con `-32000` con cola `pending` y con transacción en vuelo (DEC-46) y estado intacto (evidencia `reset-<fecha>.json`) |
| `e2e/16-validacion.spec.ts` | 3 | Error **inline** con `code` y acción en frase, clave privada y etiqueta, y operación NO enviada (`CA-RF-33`) |
| `e2e/25-recuperacion.spec.ts` | 3 | Confirmación previa, valor oculto por defecto, revelado de **30 s**, ocultado por **pérdida de foco real**, portapapeles vaciado, **0 `postMessage`**, bloqueo `-32000` con sesión de dApp vigente y desbloqueo tras revocar (`CA-RF-50`; captura `25-recuperacion-<fecha>.png`) |

**Helpers del arnés** (ninguno relaja una aserción): `openPopupReady`, `readQrModules`,
`loseFocusToOtherPage` (pérdida de foco real en headless, D-H2-K) y `stopServiceWorker`/`watchServiceWorker`
en `e2e/fixtures/extension.ts`; `e2e/fixtures/h2.ts` (siembra coherente del estado desde el Service
Worker —D-H2-K—, sesiones de dApp y vectores de Anvil) y `e2e/fixtures/qr.ts` (descriptor del símbolo).
Se añadió `--enable-clipboard-read-write` a los argumentos de Chrome: `context.grantPermissions` es
inviable porque Chrome rechaza conceder permisos a orígenes opacos (`chrome-extension://`).

---

## 3. Cobertura: comprobación del umbral ≥ 80 %

`coverage-2026-09-11.json` (`coverage-summary.json` de v8), calculado por suma de líneas cubiertas:

| Ámbito | % líneas | Líneas |
|---|---|---|
| `src/background/crypto/` | **95,13** | 488 / 513 |
| `src/shared/validation/` | **97,27** | 214 / 220 |
| `src/background/state/` | 90,40 | 405 / 448 |
| `src/shared/qr.ts` | 99,13 | — |
| `src/background/accounts.ts` | 82,69 | — |
| Total del proyecto (incluye la UI y los módulos de H3/H4/H5 aún sin implementar) | 52,42 | — |

Desglose por fichero de los dos módulos del umbral: `crypto/hd.ts` 100 %, `crypto/mnemonic.ts`
96,61 %, `crypto/secrets.ts` 95,67 %, `crypto/integrity.ts` 93,86 %, `crypto/importAccount.ts`
85,71 %; `validation/mnemonic.ts` 100 %, `validation/amount.ts` 97,59 %, `validation/privateKey.ts`
95,55 %, `validation/address.ts` 95,12 %.

**Veredicto del umbral: CUMPLIDO** (95,13 % y 97,27 %, ambos ≥ 80 %).

---

## 4. Criterios de aceptación `CA-RF-*` del hito

| Criterio | Estado | Evidencia |
|---|---|---|
| `CA-RF-01` — crear cartera con 12 palabras y checksum válido | ✅ **Cumplido (Vitest + navegador)** | `mnemonic.spec.ts` (15/15), `accounts.spec.ts`; `E2E: 01-onboarding.spec.ts:198` (5 cuentas y sin prompt de contraseña) |
| `CA-RF-02` — importar frase con normalización y checksum; checksum roto → `-32602` | ✅ **Cumplido (Vitest + navegador)** | `mnemonic.spec.ts`, `derivation.spec.ts`; `E2E: 01-onboarding.spec.ts:252` (frase irregular = misma cuenta 0) y `E2E: 16-validacion.spec.ts:39` (checksum roto → `-32602` inline y en el SW, sin persistir nada) |
| `CA-RF-03` — flujo sin contraseña (`encryptionEnabled: false`) | ✅ **Cumplido (Vitest + navegador)** | `accounts.spec.ts`; `E2E: 01-onboarding.spec.ts:198` (0 `input[type=password]`) |
| `CA-RF-04` — 5 cuentas y «Añadir cuenta» deriva la 6.ª | ✅ **Cumplido (Vitest + navegador + `cast`)** | `derivation.spec.ts`, `accounts.spec.ts`; `E2E: 02-cuentas.spec.ts:23` (direcciones reales de Anvil, 6.ª derivada y `cast balance` > 0) |
| `CA-RF-05` — importar por clave privada con etiqueta; repetida → `-32602` | ✅ **Cumplido (Vitest + navegador)** | `importPrivateKey.spec.ts`, `accounts.spec.ts`; `E2E: 02-cuentas.spec.ts:65` (etiqueta renombrable, duplicado `-32602`) y `02-cuentas.spec.ts:105` (guarda `-32000` al eliminar y desbloqueo tras revocar) |
| `CA-RF-07` — dirección mostrada = portapapeles = QR, sin red | ✅ **Cumplido (Vitest + navegador)** | `qr.spec.ts` (14/14, símbolo decodificado); `E2E: 03-recibir.spec.ts` (2/2) |
| `CA-RF-09` / `CA-RF-10` — auto-carga y restauración sin pedir la frase | ✅ **Cumplido (Vitest + navegador)** | `state.spec.ts` (27/27), `accounts.spec.ts`; `E2E: 05-persistencia.spec.ts` (3/3) |
| `CA-RF-11` (parte 1) — reset con confirmación destructiva, enumera importadas y conserva logs | ✅ **Cumplido (Vitest + navegador)** | `reset.spec.ts` (20/20); `E2E: 06-reset.spec.ts:56` (diálogo que enumera, aviso «Cartera reseteada», 13 claves borradas y `truekeate_logs` intacta; evidencia `reset-2026-09-11.json`) |
| `CA-RF-11` (parte 2, DEC-46/R-09b) — reset bloqueado con `-32000` por cola o transacción en vuelo | ✅ **Cumplido (Vitest + navegador)** | `reset.spec.ts`; `E2E: 06-reset.spec.ts:126` (1 `pending` → `-32000` «quedan 1 solicitudes pendientes», sin diálogo y sin tocar el almacén) y `06-reset.spec.ts:159` (transacción en vuelo vigente) |
| `CA-RF-33` — validación inline de los cuatro formularios sin enviar | ✅ **Cumplido (Vitest + navegador)** | `validation.spec.ts` (24/24, cubre también el importe de H4); `E2E: 16-validacion.spec.ts` (3/3, con `aria-invalid`/`aria-describedby` y almacén sin cambios) |
| `CA-RF-50` — 30 s, pérdida de foco, borrado del portapapeles, nunca `postMessage`, guarda `-32000` | ✅ **Cumplido (Vitest + navegador)** | `secretsExport.spec.ts`, `revealHygiene.spec.ts`, `revealClipboard.spec.ts`; `E2E: 25-recuperacion.spec.ts` (3/3: confirmación previa, 30 s con cuenta atrás, ocultado por **pérdida de foco real**, portapapeles vaciado, 0 `postMessage`, `-32000` con sesión vigente nombrando el origen y desbloqueo tras revocar) |
| RNF-09 (higiene del revelado) | ✅ **Cumplido (Vitest + navegador)** | `revealHygiene.spec.ts` (0 `postMessage`, descarte de memoria, 30 000 ms); `E2E: 25-recuperacion.spec.ts:54` (intercepta `window.postMessage` en el popup: 0 mensajes) |
| RNF-14 (el popup no custodia estado) | ✅ **Cumplido** | `rg -n "chrome\.storage" src/popup` → **0**; `rg -n "from 'ethers'" src/popup` → **0**; toda lectura y mutación pasa por los 15 métodos internos de §5.1.1 |
| RNF-22 («wallet dañada») | ✅ **Cumplido (Vitest + navegador)** | `integrity.spec.ts` (18/18); `E2E: 05-persistencia.spec.ts:100` (mnemonic corrupto → «Wallet dañada», sin derivar cuentas nuevas) |
| RNF-23 (aviso no descartable del primer arranque) | ✅ **Cumplido (navegador)** | `E2E: 01-onboarding.spec.ts:64` (capa modal con `aria-modal`, bloquea la UI y no hay `.tk-empty` en el DOM hasta aceptarla); `E2E: 06-reset.spec.ts:56` (tras el reset, que borra `truekeate_settings`, el aviso vuelve a mostrarse) |
| `CA-RT-02` — solo `ethers.js`; `grep -rn "from 'ethers'" src/popup` → 0 | ✅ **Cumplido** | `npm run lint:prohibited` exit 0 («sin ethers en el popup»); `rg -n "from 'ethers'" src/popup` → 0 |
| `CA-RT-10` — toda cadena visible en español | ✅ **Cumplido** | `lint:prohibited` (0 coincidencias de `send|cancel|copy|confirm` en `src/popup`) y literales de §4.3 en todos los `getByRole` de los E2E |

**Resumen:** los **11 RF Must** del hito (RF-01..RF-05, RF-07, RF-09..RF-11, RF-33, RF-50) y sus
`CA-RF-01..05/07/09/10/11/33/50` quedan **demostrados en el navegador** con los 23 E2E en verde, más
RNF-09, RNF-14, RNF-22 y RNF-23.

---

## 5. Defectos encontrados y CORREGIDOS en esta sesión

El acta anterior de este hito registraba **3 passed / 20 failed**, con los defectos **D-H2-A**
(canal `chrome.runtime.postMessage` inexistente), **D-H2-B** (la guarda no reconocía al popup como
contexto de la extensión) y **D-H2-C** (el popup pedía el revelado sin `confirmed: true`), más los
menores `D-H2-D..D-H2-F`: los cuatro ya se corrigieron en el código de H2. Al abrir **esta** sesión
la suite quedaba en **15 passed / 8 failed** (uno de ellos, `02-cuentas.spec.ts:23`, solo porque
**Anvil no estaba en marcha**). Poner los fallos restantes en verde destapó **cinco defectos más**,
ya corregidos y registrados como **DEC-52..DEC-56** en `estado_proyecto.md` y **§3.2.10** de
`plan_desarrollo.md`:

| Id | Qué estaba mal | Dónde | Corrección (producción / test) |
|---|---|---|---|
| **D-H2-G** | El revelado era **inalcanzable**: `canRevealInContext` exigía `tabId === null`, pero el popup llega **con `sender.tab`** (igual que documentó D-H2-B). Medido: `-32000` esperado, **`4200`** recibido | `src/background/crypto/secrets.ts` (M12) | **Producción**: se elimina la condición de `tabId`; se mantienen `isExtensionContext` y `REVEAL_ALLOWED_ROUTES = ['index.html']`. Se alinean 2 aserciones del spec que codificaban el defecto |
| **D-H2-H** | (a) `handleResetWallet` comprobaba `confirm` **antes** que las guardas, invirtiendo el orden de CU-30 y dejando el `-32000` inalcanzable; (b) el popup abría el diálogo destructivo **sin** consultar las guardas (CU-30 paso 3 / §3.9) | `src/background/rpc/catalog.ts`, `src/popup/walletState.ts`, `src/popup/views/SecurityView.tsx` | **Producción**: M33 aplica el orden guardas → confirmación y el manejador traduce `blocked → -32000` / `cancelled → 4001`; el popup consulta con `wallet_resetWallet { confirm: false }` (`probeResetGuards`) y no abre el diálogo si hay bloqueo |
| **D-H2-I** | El aviso «Cartera reseteada» desaparecía: el reset vacía la cartera y `SecurityView` se desmonta al volver al formulario inicial | `src/popup/App.tsx`, `src/popup/views/SecurityView.tsx` | **Producción**: el aviso se eleva a `App` (`flash`, `tone="success"`) vía `onResetDone` |
| **D-H2-J** | Con el ocultado por **pérdida de foco**, el borrado del portapapeles es **imposible**: medido en el navegador real, `navigator.clipboard.writeText('')` → `NotAllowedError: Document is not focused` y `document.execCommand('copy')` devuelve `true` **sin** modificar el portapapeles. La semilla quedaba copiada e incumplía `CA-RF-50` | `src/popup/views/SecurityView.tsx` | **Producción**: se aplaza el borrado guardando **solo la huella SHA-256** (`clipboardHash` de §3.10) y se ejecuta al recuperar el foco, comparando por huella (nunca borrado a ciegas). Desviación declarada de §3.8 regla 5 («no se reintenta»): un único reintento, al recuperar el foco |
| **D-H2-K** | Defectos del **arnés**, no del producto: (1) `seedWallet` sembraba `truekeate_current_account: 'idx:0'` con `accounts: []`, que M13 clasifica como **cartera dañada** (RNF-22) y el popup pintaba «Wallet dañada»; (2) `getByRole('button', { name: 'Importar frase' })` resolvía a **2 elementos**; (3) «una segunda pestaña pasa a primer plano» **no produce pérdida de foco** en Chromium headless; (4) el reset borra `truekeate_settings` y el aviso RNF-23 vuelve a mostrarse; (5) `popupError` mostraba la acción de «cuenta en uso por una dApp» para un `-32000 resetBlocked` | `e2e/fixtures/h2.ts`, `e2e/fixtures/extension.ts`, `e2e/01-onboarding.spec.ts`, `e2e/06-reset.spec.ts`, `src/popup/popupErrors.ts` | **Arnés**: siembra coherente; selector acotado al `form`; nuevo `loseFocusToOtherPage` (CDP `Emulation.setFocusEmulationEnabled` + otra pestaña al frente = `blur` **real**); el test acepta el aviso antes de comprobar el estado vacío. **Producción**: `popupError` busca la acción por **plantilla del mensaje**. Ninguna aserción se relajó |

**Fallo reportado que no era un defecto:** `e2e/02-cuentas.spec.ts:23` fallaba porque **Anvil no
estaba en marcha** (el contraste lo hace `execFileSync('cast', ['balance', …])` desde el proceso de
prueba). Con Anvil arriba (`cast` está en el `PATH` del runner: `C:\Users\lucci\.cargo\bin\cast.exe`)
pasa sin cambios. No hay ningún test en `skip`/`fixme` ni ninguna espera fija añadida.

---

## 6. Evidencia archivada en `RepoTecnico/evidencia/H2/`

| Fichero | Contenido |
|---|---|
| `typecheck-2026-09-11.log` | Salida real de `npx tsc -b` (exit 0) |
| `build-2026-09-11.log` | Salida real de `npm run build` (exit 0, 6 entradas + manifest) |
| `lint-prohibited-2026-09-11.log` | Salida real de `npm run lint:prohibited` (exit 0) |
| `vitest-2026-09-11.log` | Salida real de `npm run test` (**290 passed / 18 ficheros**) |
| `vitest-coverage-2026-09-11.log` | Salida real de `npm run coverage` con la tabla por fichero |
| `coverage-2026-09-11.json` | `coverage-summary.json` de v8 (fuente de §3) |
| `playwright-2026-09-11.log`, `e2e-2026-09-11.{json,log}` | Informe de Playwright: **23 passed / 0 failed / 0 skipped / 0 flaky** |
| `e2e-global-setup-2026-09-11.{log,json}` | Build de `dist/`, plazos verificados y Anvil 31337 |
| `_verificacion-resumen.log` | Resumen de los 7 comandos con su `exit code` y los dos `rg` |
| `01-onboarding-2026-09-11.json` / `.png` | Flujo de onboarding y captura del popup 380×600 |
| `25-recuperacion-2026-09-11.png` | Captura del revelado (aviso de captura y cuenta atrás) |
| `reset-2026-09-11.json` | Claves tras el reset (solo `truekeate_logs`) y logs conservados |

---

## 7. Conclusión del acta

- **Tareas 2.16:** COMPLETADA. **Vitest 290 passed / 18 ficheros** (12 specs del hito) en verde;
  cobertura de `crypto/` **95,13 %** y de `shared/validation/` **97,27 %** (≥ 80 %); `tsc -b` y
  `lint:prohibited` en verde.
- **Tareas 2.17:** COMPLETADA. **Playwright 23 passed / 0 failed / 0 skipped / 0 flaky** con Anvil
  en marcha y `dist/` reconstruido por el `global-setup`; el flujo se demuestra contra la extensión
  REAL (no sobre dobles).
- **Hito H2:** ✅ **COMPLETADO (2026-09-11)** — los 11 RF Must y sus `CA-RF-xx` verificados con
  evidencia, con las **5 correcciones aceptadas** de esta sesión (**DEC-52..DEC-56**, §3.2.10 del
  plan). Sin tests en `skip`/`fixme`, sin `waitForTimeout` y sin ninguna aserción relajada.
- **Nada se declara cumplido sin haberlo ejecutado:** todo número de esta acta tiene su log en
  `RepoTecnico/evidencia/H2/`; la única nota de host es el uso de `rg` en lugar de `grep`.
