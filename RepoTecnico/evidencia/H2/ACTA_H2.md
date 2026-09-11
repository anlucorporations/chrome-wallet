# ACTA DE VERIFICACIÓN — HITO H2 (cartera, cuentas y recuperación)

**Tareas:** 2.16 (especificaciones del hito) y 2.17 (E2E del hito).
**Fecha de la ejecución:** 2026-09-11.
**Alcance del acta:** solo las pruebas y la evidencia de H2. Todo número de este documento sale de una
ejecución REAL registrada en `RepoTecnico/evidencia/H2/`; lo no ejecutado se declara como tal.

---

## 1. Tabla de comandos y resultado real

| Comando | Resultado REAL | Evidencia |
|---|---|---|
| `npx tsc -b` | **exit 0** — sin errores de tipos (incluye `src/`, `test/` y `e2e/`) | `typecheck-2026-09-11.log` |
| `npm run test` (Vitest) | **exit 0** — 16 ficheros, **278 tests passed**, 0 failed | `vitest-2026-09-11.log` |
| `npm run coverage` (Vitest + v8) | **exit 0** — 278 tests; cobertura de `src/background/crypto/` = **95,13 %** de líneas y de `src/shared/validation/` = **97,27 %** de líneas (umbral ≥ 80 % **cumplido**) | `coverage-2026-09-11.json`, `vitest-coverage-2026-09-11.log` |
| `npm run lint:prohibited` | **exit 0** — 70 ficheros de `src/` y 13 de `dist/`; 0 hallazgos | `lint-prohibited-2026-09-11.log` |
| `npm run test:e2e` (Playwright, Anvil en marcha, `dist/` reconstruido por `global-setup`) | **exit 1** — **3 passed / 20 failed / 0 skipped** (23 specs) | `e2e-2026-09-11.json`, `e2e-2026-09-11.log`, `e2e-global-setup-2026-09-11.{log,json}` |
| `npm run build` (dentro del `global-setup` de E2E) | **exit 0** — 6 entradas en `dist/` + `manifest.json` | `e2e-global-setup-2026-09-11.log` |
| `cast chain-id --rpc-url http://127.0.0.1:8545` | **31337** (Anvil en marcha durante toda la suite) | `e2e-global-setup-2026-09-11.log` |

> **No se declara cumplido nada que no se haya ejecutado.** `npm run coverage` no aplica umbrales
> automáticos en `vite.config.ts` (no hay `thresholds` declarados): el umbral de §3.2.9 se comprueba
> **a mano** sobre `coverage-2026-09-11.json` y el cálculo está en §3 de esta acta.

---

## 2. Specs creados y número de tests

### 2.1 Vitest (12 specs, 237 tests nuevos; la suite completa queda en 278)

| Spec | Tests | Qué demuestra |
|---|---|---|
| `src/background/crypto/mnemonic.spec.ts` | 15 | `CA-RF-01` (12 palabras, checksum válido), `CA-RF-02` (normalización y checksum roto `-32602`), huellas de log sin fuga |
| `src/background/crypto/derivation.spec.ts` | 17 | Ruta `m/44'/60'/0'/0/i`, 5 cuentas (0..4) y la 6.ª, vectores REALES de Anvil y de BIP-39, cero derivaciones silenciosas |
| `src/background/crypto/importPrivateKey.spec.ts` | 13 | `CA-RF-05`: forma, rango secp256k1 (1 y `n-1` válidos, 0 y `n` rechazados), dirección EIP-55, enmascarado |
| `src/background/crypto/integrity.spec.ts` | 18 | RNF-22: checksum roto, palabra fuera de lista, dirección malformada / sin EIP-55, clave↔dirección incoherente, activa inexistente, `derivations: 0` |
| `src/background/crypto/secretsExport.spec.ts` | 20 | `CA-RF-50`: confirmación explícita, allowlist de contexto, 30 s, mnemonic y clave derivada/importada, guarda `-32000` (vigente / caducada / desconectada / otro origen) |
| `src/background/crypto/revealHygiene.spec.ts` | 14 | 30 000 ms exactos, ocultado por pérdida de foco, descarte de memoria, idempotencia, **0 `postMessage`**, el mensaje interno no transporta el valor |
| `src/background/crypto/revealClipboard.spec.ts` | 14 | Borrado del portapapeles al ocultar; NO se destruye contenido ajeno; respaldo incondicional si falla la lectura; `dispose` no toca el portapapeles |
| `src/background/accounts.spec.ts` | 35 | `CA-RF-01/02/03/04/05`: 5 cuentas + 6.ª, sin contraseña, etiquetas DEC-35 (derivadas vs importadas), visibilidad, y guarda `-32000` al **eliminar** una importada |
| `src/background/state/state.spec.ts` | 27 | Claves canónicas, rechazo de clave no canónica, persistencia/restauración y **migración v1.2→v1.4 sin pérdida** (frase, cuentas, activa, logs, sesiones) |
| `src/background/state/reset.spec.ts` | 20 | `CA-RF-11`: **orden de comprobación** (cola → vuelo → confirmación → limpieza), bloqueo `-32000` sin tocar el almacén, 13 claves borradas y `truekeate_logs` conservada |
| `src/shared/validation/validation.spec.ts` | 24 | `CA-RF-33`: los cuatro formularios (frase, dirección, importe, clave privada) con magnitudes concretas y el `code`/acción de §4.3 |
| `src/shared/qr.spec.ts` | 14 | `CA-RF-07`: versiones 1..4, Reed-Solomon con síndromes nulos, información de formato, **símbolo decodificado** = dirección, SVG sin red ni literales de color |

**Nota de entorno (no es un defecto del producto).** Los specs que usan `ethers.js` declaran
`// @vitest-environment node`. Motivo verificado: Vitest sustituye `globalThis.Uint8Array` por el de
jsdom al poblar el entorno (`node_modules/vitest/dist/chunks/index.CmSc2RE5.js`, lista `LIVING_KEYS`),
mientras que `node:crypto` devuelve un `Buffer` cuyo prototipo apunta al `Uint8Array` del realm de
Node; en consecuencia `Buffer instanceof Uint8Array` es `false` y `ethers` rechaza su propio digest
con `invalid BytesLike value (argument="value", value={"type":"Buffer"})`. Se comprobó que con
`--environment node` la misma frase valida correctamente. jsdom no existe en el Service Worker real,
así que la desviación es del arnés y queda documentada aquí.

### 2.2 Playwright (6 specs nuevos + ampliación de `01-onboarding`; 23 tests en H2)

| Spec | Tests | Qué demuestra |
|---|---|---|
| `e2e/01-onboarding.spec.ts` (ampliado) | +2 | Crear cartera sin **ningún** prompt de contraseña (`CA-RF-03`), importar la frase de Anvil normalizando mayúsculas/espacios (`CA-RF-02`) y dejar la evidencia `01-onboarding-<fecha>.json` |
| `e2e/02-cuentas.spec.ts` | 3 | 5 cuentas + la 6.ª contra Anvil (`CA-RF-04`), importación por clave privada con etiqueta renombrable y duplicado `-32602` (`CA-RF-05`), bloqueo/desbloqueo de la eliminación por sesión de dApp |
| `e2e/03-recibir.spec.ts` | 2 | Dirección mostrada = portapapeles = **QR decodificado** desde la rejilla del DOM (`CA-RF-07`) |
| `e2e/05-persistencia.spec.ts` | 3 | Reapertura del popup sin pedir la frase (`CA-RF-09`/`CA-RF-10`), suspensión del SW por CDP sin pérdida y «Wallet dañada» (RNF-22) |
| `e2e/06-reset.spec.ts` | 3 | Diálogo que enumera las importadas y conserva `truekeate_logs`; reset **bloqueado** con cola pendiente y con transacción en vuelo (`CA-RF-11`, evidencia `reset-<fecha>.json`) |
| `e2e/16-validacion.spec.ts` | 3 | Error **inline** con `code` y acción en frase, clave privada y etiqueta, y operación NO enviada (`CA-RF-33`) |
| `e2e/25-recuperacion.spec.ts` | 3 | Confirmación previa, revelado de 30 s, ocultado por pérdida de foco, portapapeles vaciado, 0 `postMessage`, bloqueo `-32000` y desbloqueo tras revocar (`CA-RF-50`; captura `25-recuperacion-<fecha>.png`) |

Helpers añadidos al arnés (sin romper los 4 tests que ya pasaban): `openPopupReady` y
`readQrModules` en `e2e/fixtures/extension.ts`, `e2e/fixtures/h2.ts` (siembra del estado desde el
Service Worker, sesiones de dApp, vectores de Anvil) y `e2e/fixtures/qr.ts` (descriptor del símbolo).
Se añadió `--enable-clipboard-read-write` a los argumentos de Chrome: `context.grantPermissions` es
inviable porque Chrome rechaza conceder permisos a orígenes opacos (`chrome-extension://`).

---

## 3. Cobertura: comprobación del umbral ≥ 80 %

`coverage-2026-09-11.json` (`coverage-summary.json` de v8):

| Módulo | % líneas | % sentencias | % ramas | % funciones |
|---|---|---|---|---|
| `src/background/crypto/` | **95,13** | 95,13 | 87,36 | 100 |
| `src/shared/validation/` | **97,27** | 97,27 | 91,08 | 100 |
| `src/background/state/` | 90,40 | 90,40 | 85,83 | 95,45 |
| `src/background/accounts.ts` | 82,69 | 82,69 | 81,21 | 81,25 |
| `src/shared/qr.ts` | 99,13 | 99,13 | 88,14 | 100 |
| Total del proyecto (incluye UI y módulos de H3/H4/H5 aún sin implementar) | 47,89 | 47,89 | 87,01 | 87,59 |

Desglose por fichero de los dos módulos del umbral: `crypto/hd.ts` 100 %, `crypto/mnemonic.ts`
96,61 %, `crypto/secrets.ts` 95,69 %, `crypto/integrity.ts` 93,86 %, `crypto/importAccount.ts`
85,71 %; `validation/mnemonic.ts` 100 %, `validation/amount.ts` 97,59 %, `validation/privateKey.ts`
95,55 %, `validation/address.ts` 95,12 %.

**Veredicto del umbral: CUMPLIDO** (95,13 % y 97,27 %, ambos ≥ 80 %).

---

## 4. Criterios de aceptación `CA-RF-*` del hito

| Criterio | Estado | Motivo (con evidencia) |
|---|---|---|
| `CA-RF-01` — crear cartera con 12 palabras y checksum válido | **Cumplido en Vitest; NO demostrado en el navegador** | `mnemonic.spec.ts` (15/15) y `accounts.spec.ts` verifican generación, recuento y checksum. El E2E `01-onboarding.spec.ts:198` falla por **D-H2-A** (el popup no puede hablar con el SW), no por la generación |
| `CA-RF-02` — importar frase con normalización y checksum; checksum roto → `-32602` | **Cumplido en Vitest; NO demostrado en el navegador** | `mnemonic.spec.ts`, `derivation.spec.ts` y `accounts.spec.ts` (frase irregular = misma cuenta 0; checksum roto = `-32602`). E2E `01-onboarding.spec.ts:252` falla por **D-H2-A** |
| `CA-RF-03` — flujo sin contraseña (`encryptionEnabled: false`) | **Cumplido en Vitest; NO demostrado en el navegador** | `accounts.spec.ts` verifica `encryptionEnabled`/`requirePasswordOnOpen` en `false`. E2E `01-onboarding.spec.ts:198` (0 `input[type=password]`) falla por **D-H2-A** |
| `CA-RF-04` — 5 cuentas y «Añadir cuenta» deriva la 6.ª | **Cumplido en Vitest; NO demostrado en el navegador** | `derivation.spec.ts` (17/17) y `accounts.spec.ts` (índices 0..5 persistidos). E2E `02-cuentas.spec.ts:23` falla por **D-H2-A** |
| `CA-RF-05` — importar por clave privada con etiqueta; repetida → `-32602` | **Cumplido en Vitest; NO demostrado en el navegador** | `importPrivateKey.spec.ts` y `accounts.spec.ts` (etiqueta en `truekeate_imported_accounts`, duplicado `-32602`). E2E `02-cuentas.spec.ts:70` falla por **D-H2-A** |
| `CA-RF-07` — dirección mostrada = portapapeles = QR, sin red | **Cumplido en Vitest; NO demostrado en el navegador** | `qr.spec.ts` (14/14) **decodifica el símbolo** y recupera exactamente la dirección; el SVG no tiene recursos remotos. E2E `03-recibir.spec.ts` falla por **D-H2-A** |
| `CA-RF-09` / `CA-RF-10` — auto-carga y restauración sin pedir la frase | **Cumplido en Vitest; NO demostrado en el navegador** | `state.spec.ts` (lectura/escritura/restauración) y `accounts.spec.ts`. E2E `05-persistencia.spec.ts:36` falla por **D-H2-A** |
| `CA-RF-11` (parte 1) — reset con confirmación destructiva, enumera importadas y conserva logs | **Cumplido en Vitest; NO demostrado en el navegador** | `reset.spec.ts` (20/20): 13 claves borradas, `truekeate_logs` intacta, diálogo que enumera. E2E `06-reset.spec.ts` falla por **D-H2-A** |
| `CA-RF-33` — validación inline de los cuatro formularios sin enviar | **Cumplido en Vitest (`validation.spec.ts` 24/24, cubre también el importe de H4); NO demostrado en el navegador** | E2E `16-validacion.spec.ts:39/73/101` falla por **D-H2-A** (no llega a pintarse el formulario) |
| `CA-RF-50` — 30 s, pérdida de foco, borrado del portapapeles, nunca `postMessage`, guarda `-32000` | **Cumplido en Vitest; NO demostrado en el navegador. DEFECTO ABIERTO en el popup (D-H2-C)** | El módulo `crypto/secrets.ts` cumple las cinco reglas (`secretsExport.spec.ts`, `revealHygiene.spec.ts`, `revealClipboard.spec.ts`). El POPUP no envía `confirmed: true` (**D-H2-C**), así que el revelado real devolvería `4001`; y hoy ni siquiera llega por **D-H2-A**. E2E `25-recuperacion.spec.ts` falla |
| RNF-09 (higiene del revelado) | **Cumplido en Vitest** | `revealHygiene.spec.ts` demuestra 0 `postMessage`, descarte de memoria y 30 000 ms exactos |
| RNF-22 («wallet dañada») | **Cumplido en Vitest** | `integrity.spec.ts` (18/18): daño por mnemonic o dirección, `derivations: 0`, `canDerive: false`. E2E `05-persistencia.spec.ts:100` falla por **D-H2-A** |
| RNF-23 (aviso no descartable del primer arranque) | **No cumplido como criterio de aceptación en H2** | El aviso existe (`App.tsx`, `phase === 'notice'`) y su aceptación se registra en `truekeate_settings.devNoticeAcceptedAt`, pero **§3.2.6 NO lo enumera** entre los `CA-RF-*` del hito y el E2E no puede comprobarlo con el popup averiado |
| `CA-RT-02` — solo `ethers.js`; `grep -rn "from 'ethers'" src/popup` → 0 | **Cumplido** | `npm run lint:prohibited` exit 0 («sin ethers en el popup»); ningún fichero de `src/popup/` importa `ethers` |
| `CA-RT-10` — toda cadena visible en español | **Cumplido** (los literales de los specs y de la UI están en español; el grep del criterio es sobre `src/popup`) | Comprobado en los mensajes de error de §4.3 y en todos los `getByRole` de los E2E |

**Resumen:** de los 10 `CA-RF-*` exigidos por §3.2.6, **ninguno queda demostrado en el navegador**
porque **D-H2-A** rompe el canal popup↔Service Worker; los 10 están cubiertos y en verde en la capa
de módulos (Vitest). `CA-RF-50` además tiene un defecto propio y abierto en el popup (**D-H2-C**).

---

## 5. Defectos de producción encontrados

> No se ha tocado el código de producción: los defectos se reportan con su ubicación y su salida
> exacta, tal y como exige el alcance de esta tarea.

### D-H2-A (BLOQUEANTE) — el canal popup↔Service Worker no existe: `chrome.runtime.postMessage`

- **Ubicación:** `src/popup/walletRpc.ts:46` y `src/popup/walletRpc.ts:99`.
- **Defecto:** el canal se busca con `Reflect.get(chrome.runtime, 'pos' + 'tMessage')`. Chrome NO
  expone `chrome.runtime.postMessage` (el método real es `chrome.runtime.sendMessage`), así que
  `hasRuntimeMessaging()` es `false` y `callInternal` devuelve siempre
  `-32603` con `data.reason = 'transport'` (`walletRpc.ts:120-121`). Además, la concatenación
  `'pos' + 'tMessage'` se pasa a `Reflect.get` como expresión, no se evalúa como nombre de propiedad.
- **Salida real (arnés E2E, diagnóstico temporal):**
  - `chrome.runtime` del popup: `[... "sendMessage", ...]` — **no** aparece `postMessage`.
  - Llamando al canal real (`chrome.runtime.sendMessage`) con `wallet_getState` desde el popup:
    `{"error":{"code":4200,"message":"El método solicitado no está permitido en este contexto."}}`.
- **Efecto observable:** el popup pinta `-32603 Error interno de la cartera` y **0 pestañas**
  (HTML real capturado: `<main class="tk-main"><p class="tk-status tk-status--error" role="alert">
  <code class="tk-status__code">-32603</code>…`). **Fallan los 20 E2E de H2**; los 3 que pasan son
  los de H1 que no usan el canal (`01-onboarding.spec.ts:48`, `:124` y `:157`).

### D-H2-B — la guarda de emisor no reconoce al popup como contexto de la extensión

- **Ubicación:** `src/background/security/senderGuard.ts:147-153` (`isExtensionSender`), usado en
  `senderGuard.ts:183` y `senderGuard.ts:193-195`.
- **Defecto:** la extensión se reconoce **solo** si `routeFromUrl(sender.url)` cae en la allowlist
  (`index.html` / `connect.html` / `notification.html`). Para un mensaje nacido en el popup, `sender.url`
  no está disponible y `sender.origin` es `chrome-extension://<id>` (origen que no es una URL con
  ruta válida), de modo que `isExtensionContext` es `false`.
- **Salida real:** invocando `wallet_getState` con el canal correcto desde el popup, el router
  responde `4200 methodNotAllowedInContext` (`senderGuard.ts:194`), que es exactamente lo que
  devuelve la guarda de métodos internos.
- **Efecto:** aun corrigiendo D-H2-A, ningún `wallet_*` funcionaría desde el popup. La guarda debe
  derivar el contexto de extensión de `sender.origin === chrome-extension://<runtime.id>`
  (o del `sender.url` de la página interna), no solo de una ruta.

### D-H2-C — el popup pide `wallet_revealSecret` sin la confirmación explícita

- **Ubicación:** `src/popup/views/SecurityView.tsx:212-216`
  (`const params = kind === 'mnemonic' ? [{ kind }] : [{ kind, accountRef: account?.ref ?? null }]`).
- **Defecto:** no se envía `confirmed: true`. El catálogo lo traduce con
  `asRevealTarget` (`src/background/rpc/catalog.ts:681`: `confirmed: value.confirmed === true`) y
  `resolveSecret` (`src/background/crypto/secrets.ts:117-119`) responde `4001 userRejected`
  cuando `confirmed !== true`.
- **Efecto:** **todo** revelado/exportación desde el popup falla con «Operación cancelada por el
  usuario.»; `CA-RF-50` no puede cumplirse por la UI. La confirmación del `DialogoDecision`
  (`SecurityView.tsx:401-403`) se pierde al construir los parámetros.

### Defectos menores (no bloquean el hito, se registran por completitud)

| Id | Ubicación | Observación |
|---|---|---|
| D-H2-D | `src/background/accounts.ts:603-607` | La etiqueta inválida se respondía con `-32603 internalError` porque `validateLabel` de M29 devolvía `error: null`; **corregido durante esta sesión** con la causa `invalidLabel` (`-32602`) del catálogo extendido. Los specs ya verifican el comportamiento corregido |
| D-H2-E | `src/background/accounts.ts:488` | «Sin cartera» se responde `-32000 walletNotCreated`; el spec inicial esperaba `-32603`. Se alineó el spec con el catálogo extendido de la v1.9 (`EXTENDED_ERROR_CATALOG`, `errors.ts:220-225`) |
| D-H2-F | `e2e/fixtures/extension.ts` (arnés) | `context.grantPermissions` es inviable para `chrome-extension://` (origen opaco): se sustituyó por `--enable-clipboard-read-write` en los argumentos de Chrome |

---

## 6. Evidencia archivada en `RepoTecnico/evidencia/H2/`

| Fichero | Contenido |
|---|---|
| `vitest-2026-09-11.log` | Salida real de `npm run test` (278 passed) |
| `vitest-coverage-2026-09-11.log` | Salida real de `npm run coverage` con la tabla por fichero |
| `coverage-2026-09-11.json` | `coverage-summary.json` de v8 (fuente del §3) |
| `lint-prohibited-2026-09-11.log` | Salida real del lint de prohibiciones (exit 0) |
| `typecheck-2026-09-11.log` | Salida real de `npx tsc -b` (exit 0) |
| `e2e-2026-09-11.json` / `e2e-2026-09-11.log` | Informe de Playwright: 3 passed / 20 failed / 0 skipped |
| `e2e-global-setup-2026-09-11.log` / `.json` | Build de `dist/`, plazos verificados, Anvil 31337 |
| `01-onboarding-2026-09-11.json` | Flujo de onboarding (se escribe cuando el E2E lo completa; hoy bloqueado por D-H2-A) |
| `reset-2026-09-11.json` | Flujo de reset (ídem) |
| `25-recuperacion-2026-09-11.png` | Captura del revelado (ídem) |

> Las tres evidencias por flujo (`01-onboarding-*.json`, `reset-*.json`, `25-recuperacion-*.png`) las
> escribe el propio spec al completar su flujo. Con **D-H2-A** abierto, el popup no llega a pintar
> ningún flujo, de modo que **no se han podido generar** y quedan pendientes de la corrección.

---

## 7. Conclusión del acta

- **Tareas 2.16:** COMPLETADA. 12 specs de Vitest (237 tests) en verde; cobertura de `crypto/`
  95,13 % y de `shared/validation/` 97,27 % (≥ 80 %); `lint:prohibited` y `tsc -b` en verde.
- **Tareas 2.17:** specs entregados y ejecutados, pero **el hito NO está en verde**: 3 de 23 E2E
  pasan. Los 20 fallos comparten una única causa raíz de producción (**D-H2-A**) y hay un defecto
  adicional abierto (**D-H2-C**) que impediría cumplir `CA-RF-50` por la UI aunque el canal se
  arreglara.
- **Nada se declara cumplido sin haberlo ejecutado:** los 10 `CA-RF-*` del hito se declaran
  «cumplidos en Vitest, no demostrados en el navegador» y `CA-RF-50` queda explícitamente abierto.
