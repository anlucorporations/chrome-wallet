# ACTA H3 — Provider, conexión y lectura (tareas 3.15 y 3.16)

**Proyecto:** TrueKeate Wallet — extensión Chrome MV3 (`C:\Users\lucci\MasterCodeCripto\GitLab\chrome-wallet`)
**Fecha de la ejecución:** 2026-09-11
**Alcance de este acta:** las **pruebas** del hito H3 (`plan_desarrollo.md` §3.3.7, criterios §3.3.6).
**Versión del acta:** **v1.1 (2026-09-11)** — actualizada con la **batería final de cierre** (**Vitest 403 passed / 28 ficheros**, **Playwright 37 passed / 0 failed**) y con los **criterios `CA-RF-*` de H3 cumplidos**; la **v1.0** registró la ejecución previa (**394** / **36**) con los defectos **D-H3-A**, **D-H3-B** y **D-H3-C** abiertos.
**Entorno:** Anvil en `127.0.0.1:8545` (`chain-id 31337`), `npm run dev` sirviendo `test.html` en
`http://localhost:5174`, `dist/` reconstruido por `e2e/global-setup.ts` con los plazos inyectados
(`VITE_SIGN_TIMEOUT_MS=3000`, `VITE_CONNECT_TIMEOUT_MS=2000`) y los plazos de producción
verificados (120 000 / 60 000 / 30 000 ms).

---

## 1. Tabla de comandos y resultado REAL

| # | Comando | Resultado real | Evidencia |
|---|---|---|---|
| 1 | `npm run test` | **403 passed (403)**, **28 ficheros**, 0 failed, **exit 0** (línea base H2: 290; +113) | `evidencia/H3/vitest-2026-09-11.log` (ejecución previa al cierre: 394/26 — ver nota) |
| 2 | `npm run test:e2e` | **37 passed (37)**, 0 failed, 0 skipped, 0 flaky, **exit 0** (línea base H2: 23; +14) | `evidencia/H3/e2e-2026-09-11.log`, `e2e-2026-09-11.json` (**`expected: 37`**, `unexpected: 0`, `flaky: 0`, `skipped: 0`), `e2e-global-setup-2026-09-11.{log,json}` |
| 3 | `npm run lint:prohibited` | `src/: 91 ficheros revisados` · `dist/: 14 ficheros` · **OK**, **exit 0** | `evidencia/H3/lint-prohibited-2026-09-11.log` |
| 4 | `npm run coverage` | 394 passed, **exit 0**; `All files 52.18 % stmts / 83.09 % branch / 68.5 % funcs / 52.18 % lines` (**ejecución previa al cierre**: la cifra final de tests es **403**) | `evidencia/H3/coverage-2026-09-11.log` |
| 5 | `npx tsc -b` | **exit 0** (sin diagnósticos) | (árbol de cierre; misma batería que las filas 1-2) |
| 6 | `cast chain-id --rpc-url http://127.0.0.1:8545` | `31337` | `evidencia/H3/cast-2026-09-11.log` |
| 7 | `cast block-number --rpc-url …` | `2` (el spec `07` mina 2 bloques para la cota `≥ 1` de CA-RF-18) | `evidencia/H3/cast-2026-09-11.log` |
| 8 | `cast balance 0xf39F…2266 --rpc-url …` | `10000000000000000000000` wei = `10000.000000000000000000` ETH | `evidencia/H3/cast-2026-09-11.log` |
| 9 | `npm run build` | **exit 0** — 6 entradas en `dist/` + `dist/manifest.json` | `evidencia/H3/` (batería de cierre) |
| 10 | `rg -n "chrome\.storage" src/popup src/connect` | **0 coincidencias** (RNF-14) | `evidencia/H3/` (verificación de cierre) |
| 11 | `rg -n "from 'ethers'" src/popup src/connect` | **0 coincidencias** (`CA-RT-02`) | `evidencia/H3/` (verificación de cierre) |

> El informe JSON de Playwright de la ejecución final declara **`expected: 37`**, `unexpected: 0`,
> `flaky: 0`, `skipped: 0`. **Los 23 E2E de H1/H2 siguen verdes** (los ficheros `01`, `02`, `03`,
> `05`, `06`, `16` y `25`) y los **290 Vitest previos** también.
>
> **Nota de trazabilidad (evidencia archivada).** `e2e-2026-09-11.json` **sí** corresponde a la
> ejecución final (lo confirma su `expected: 37`). En cambio, `vitest-2026-09-11.log` y
> `coverage-2026-09-11.log` conservan la **ejecución previa al cierre** (**394 passed / 26
> ficheros**): la cifra final verificada del árbol entregado es **403 passed / 28 ficheros**, con los
> **9 tests nuevos** del cierre repartidos así: `src/background/rpc/setCurrentAccount.spec.ts` (**4**),
> `src/background/security/importOrder.spec.ts` (**3**) y **2 casos nuevos** en
> `src/background/sessions.spec.ts` (cuenta compartida de las sesiones vigentes, **D-H3-B**). Se deja
> constancia expresa para que ninguna de las dos ejecuciones se confunda con la otra.

### Evidencia específica exigida por §3.3.7

| Artefacto | Contenido real |
|---|---|
| `07-provider-2026-09-11.json` | `ethChainId: "0x7a69"`, `ethBlockNumber: "0x2"`, `ethGetBalance` = `0x21e19e0c9bab2400000` y **idéntico** al que responde Anvil por HTTP directo (`coincideConElNodo: true`); anuncio EIP-6963 con `uuid 9f2a4c1e-…`, `name TrueKeate`, `rdns academy.codecrypto.truekeate`, icono PNG 96×96 |
| `09-conectar-2026-09-11.png` | ventana `connect.html` con las 5 cuentas y sus saldos reales (`10000,0000 ETH`), con la 2.ª seleccionada |
| `09-conectar-2026-09-11.json` | cuenta elegida `0x70997970…79C8`, `ttlMs: 86400000`, `trasRecargar` y `trasReiniciarElSW` con la misma cuenta |
| `28-iframe-hostil-2026-09-11.json` | `origenDelTop: http://localhost:5174`, `origenDelIframe: http://127.0.0.1:<puerto>`, `cuentasIframe: []`, `sesionesPersistidas: ["http://localhost:5174"]`, `ethRequestAccountsDelIframe: "rechazado:4001"` |
| `rpc-caido-2026-09-11.log` | Anvil detenido (PID), `4900 "Sin conexión con la red local (Anvil)."` con `attempts: 4`, `backoffMs: [1000,2000,4000]` en **7112 ms**, UI «Desconectado: sin respuesta del nodo local», **7 claves comparadas y 0 cambiadas**, Anvil restaurado (`0x7a69`) |
| `08-eventos`, `13-revocar`, `14-polling` (`-2026-09-11.json`) | evidencia adicional de eventos, revocación y contador de polling |
| `08-cambio-cuenta-2026-09-11.json` | cierre de **D-H3-A**: el cambio de cuenta activa desde el popup emite `accountsChanged` con la **cuenta nueva** y `eth_accounts` devuelve esa misma cuenta |
| `diagnostico-ca-rf-15-2026-09-11.log` | medición del defecto **D-H3-A** (cambio de cuenta activa sin `accountsChanged`) |
| `diagnostico-import-order-2026-09-11.log` | medición de la fragilidad **D-H3-C** (captura de `INTERNAL_METHODS` en `senderGuard`) |

---

## 2. Especificaciones creadas y número de tests

### Vitest (`src/**/*.spec.ts`) — 113 tests nuevos (290 → 403, **28 ficheros**)

| Fichero | Tests | Qué fija |
|---|---|---|
| `src/inject/inject.spec.ts` | **14** | alias y superficie del provider, descriptores NO configurables, `all_frames`+`document_start`+`exclude_matches`, catálogo cerrado (4200 sin lanzar), escuchas y `removeListener`, cachés, anuncio EIP-6963 (uuid literal, `rdns`, icono PNG 96×96) |
| `src/shared/naming.spec.ts` (AMPLIADO, +2) | **13** | `providerInfo` con los 4 campos de RT-13 y publicación del alias con el mismo descriptor no configurable |
| `src/background/rpc/eip1193.spec.ts` | **13** | los **8 códigos** con sus literales de §4.3, lista cerrada, clonación estructurada, `data` opcional, marcadores resueltos |
| `src/background/messaging.spec.ts` | **29** | entrada `chrome.runtime.onMessage`: allowlist de los **16 internos** (4200), `sender.id` ajeno (4100), página sin origen (4100), `origin`/`frameId` declarados ignorados, redacción previa, `eth_sign` y los 6 aprobables |
| `src/background/sessions.spec.ts` | **13** | renovación `expiresAt = lastUsedAt + 86 400 000` en cada uso, purga a las 24 h, creación única por `connectSession`, lectura pura, clave normalizada, revocación idempotente sin cola, y **la cuenta compartida de las sesiones vigentes** (**D-H3-B**: se actualiza solo en las vigentes; sin sesiones vigentes no escribe nada) |
| `src/background/polling.spec.ts` | **6** | hook REAL (React 19 + jsdom) con *fake timers*: 1 `eth_getBalance` por cuenta visible y ciclo, periodo de 5 s, parada al cerrar, reinicio al cambiar de cuenta, suspensión si el RPC falla |
| `src/background/rpc/rpcRetry.spec.ts` | **8** | **1+3 = 4 llamadas** con backoff medido `[1000, 2000, 4000]`, timeout por intento, corte al primer éxito, `disconnected`/`connected`, almacén intacto |
| `src/background/rateLimit.spec.ts` | **10** | *token bucket* 6/60 s: **100 lecturas → 6 permitidas y 94 rechazadas**, persistencia en `truekeate_rate_windows`, exención de la extensión, purga a los 10 min, contador del router (6 llamadas al nodo de 100) |
| `src/background/originFrame.spec.ts` | **11** | frame ≠ 0 no hereda el origen del top (contraste de sesión top/iframe), destino exacto de la respuesta, y entrega de eventos por frame con reenvío literal |
| `src/background/rpc/setCurrentAccount.spec.ts` | **4** | **D-H3-A / D-H3-B**: el cambio de cuenta activa actualiza la sesión vigente y emite `accountsChanged` con la cuenta nueva **solo** a sus pestañas; `eth_accounts` devuelve la cuenta nueva; no emite nada a orígenes sin sesión vigente ni resucita sesiones vencidas; referencia inexistente → `-32602` sin emitir ni tocar sesiones |
| `src/background/security/importOrder.spec.ts` | **3** | **D-H3-C**: la allowlist de internos está completa aunque el catálogo se evalúe primero; un `wallet_*` desde una página responde **`4200`** (**nunca** `-32603`) pese al orden de importación; una lectura de página iniciada por la propia página sigue aceptándose |

### Playwright (`e2e/`) — 14 tests nuevos (23 → 37)

| Fichero | Tests | Qué fija |
|---|---|---|
| `e2e/07-provider.spec.ts` | **5** | alias + superficie, ID estable derivado de la `key`, EIP-6963 con icono real de 96 px, `4200` sin lanzamiento síncrono, **CA-RF-18** (`0x7a69`, bloque ≥ 1 y saldo contrastado con el nodo) |
| `e2e/08-eventos.spec.ts` | **2** | (1) `accountsChanged []` tras la revocación llega a **las dos pestañas conectadas** (y no a una tercera que nunca pidió cuentas), con reenvío literal y caché `selectedAddress` limpiada; (2) **D-H3-A**: el **cambio de cuenta activa desde el popup** emite `accountsChanged` con la **cuenta nueva** y `eth_accounts` deja de devolver la cuenta anterior (evidencia `08-cambio-cuenta-2026-09-11.json`) |
| `e2e/09-conectar.spec.ts` | **3** | test negativo (`[]` **sin abrir ventana**), elección de la cuenta 2 con saldos reales y teclado, TTL de 24 h, recarga y **reinicio del SW** sin nuevo prompt, rechazo → `4001` |
| `e2e/13-revocar.spec.ts` | **1** | revocación por la UI del popup (origen normalizado), `accountsChanged []`, `eth_accounts []`, **sin cola de aprobaciones**, idempotencia |
| `e2e/14-polling.spec.ts` | **1** | contador REAL `data-polling-requests/cycles`: 5 RPC por ciclo, periodo de 5 s, 0 ciclos con la vista cerrada y exactamente 1 al reabrir |
| `e2e/27-rpc-caido.spec.ts` | **1** | Anvil **detenido** → `4900` tras 4 intentos/7112 ms, UI desconectada, almacén intacto; Anvil **restaurado** |
| `e2e/28-iframe-hostil.spec.ts` | **1** | iframe cross-origin real (servidor efímero en `127.0.0.1`) que **no** hereda la sesión del top y entra en su propia conexión (`4001`) |

### Arnés

`e2e/fixtures/extension.ts` **ampliado solo con helpers** (registro/lectura de eventos de la dApp,
lectura de los contadores de polling, `conectarDapp`, `pedirALaDapp`/`cuentasDeLaDapp`,
`llamarDesdeLaExtension`, control del proceso Anvil y `consultarAlNodo`). **No se modificó ningún
test existente** y los 23 E2E previos siguen verdes.

`playwright.config.ts` declara **`webServer`** (**D-H3-D**, defecto del arnés): `command: 'npm run dev'`,
`url: 'http://localhost:5174/test.html'`, `reuseExistingServer: true` y `timeout: 120 s`. La suite
**se autosirve la dApp** en vez de depender de que alguien la arranque a mano.

---

## 3. Criterios `CA-RF-*` de H3 (§3.3.6) y estado

| Criterio | Estado | Justificación y evidencia |
|---|---|---|
| **CA-RF-13** | **CUMPLIDO** | `window.truekeate === window.codecrypto` (mismo objeto, descriptores `writable:false`/`configurable:false`) y `request`/`on`/`removeListener`: `inject.spec.ts` (14) y E2E `07` (test 1). Inyección en todas las páginas y frames con `all_frames:true` y `document_start`: `inject.spec.ts` (nuevo test del manifest) **y medición real** en un iframe cross-origin (E2E `28`) |
| **CA-RF-14 / CA-RF-45** | **CUMPLIDO** | Método desconocido (`eth_sign`) → `4200` con el literal de §4.3 y **sin lanzamiento síncrono** (Vitest `inject.spec`, `messaging.spec`; E2E `07`). Los **8 códigos** con sus literales: `eip1193.spec` + `errors.spec` (transcripción de la tabla §4.3) |
| **CA-RF-15** | **CUMPLIDO** | `on('accountsChanged')`/`removeListener` ✓ (`inject.spec`); el evento llega a todas las pestañas conectadas ✓ (E2E `08`); y **el cambio de cuenta activa desde el popup emite `accountsChanged` con la cuenta nueva** ✓ (E2E `08`, caso nuevo) tras corregir **D-H3-A** (`setCurrentAccount.spec.ts`; medición previa del defecto en `diagnostico-ca-rf-15-2026-09-11.log`) |
| **CA-RF-24** (parte `accountsChanged`) | **CUMPLIDO** | E2E `08`: la revocación emite `accountsChanged` con `[]` **a las dos pestañas conectadas** y **no** a una tercera no conectada, con el `data` literal; `originFrame.spec` fija el destino por frame y el reenvío literal (nota H-39) |
| **CA-RF-16 / CA-RF-36** | **CUMPLIDO** | E2E `09`: la ventana lista las **5 cuentas con saldo real** (10000 ETH) y origen visible, la flecha abajo mueve la selección (radio accesible), elegir la cuenta 2 resuelve `['0x7099…79C8']` y rechazar → `4001` con «Operación cancelada por el usuario.» |
| **CA-RF-17 / CA-RF-25** | **CUMPLIDO** | E2E `09`: origen no conectado → `[]` y **0 ventanas nuevas** (y ninguna sesión creada); conectado → cuenta autorizada **sin nuevo prompt** tras recargar `test.html` y tras **suspender el SW** por CDP. `sessions.spec`: `expiresAt = lastUsedAt + 86 400 000` renovado en cada uso y entrada eliminada a las 24 h |
| **CA-RF-18** | **CUMPLIDO** | E2E `07` (CA-RF-18): `eth_chainId` → `0x7a69`, `eth_blockNumber` → el mismo valor del nodo y `≥ 1` (se minan 2 bloques porque un Anvil recién arrancado está en el bloque 0), `eth_getBalance(cuenta0)` idéntico al de Anvil (`0x21e19e0c9bab2400000`, 10 000 ETH confirmados con `cast balance`) |
| **CA-RF-26** | **CUMPLIDO** | E2E `13`: revocación por la UI del popup (origen `HTTP://LOCALHOST:5174/` normalizado), `truekeate_connected_sites` sin el origen, `accountsChanged []`, `eth_accounts []` y `truekeate_pending_requests` vacío (0 entradas de cola); `sessions.spec` fija `revoked`/`tabIds`/idempotencia |
| **CA-RF-27** | **CUMPLIDO** | E2E `14`: instantáneas consistentes `requests = cycles × 5` (inválidas si hubiera 2 RPC por cuenta), periodo medido ≥ 4 s, **0 avance con la vista cerrada** y exactamente 1 ciclo al reabrir; `polling.spec` (hook real) fija el contador, la parada y la suspensión |
| **RNF-10 / RNF-11** | **CUMPLIDO** | `messaging.spec`: **ninguno** de los 16 `wallet_*` se despacha desde una página (4200 `methodNotAllowedInContext`, sin invocar el catálogo), emisor con otro `id` → `4100`, página sin origen utilizable → `4100`, `origin` declarado ignorado, redacción de `params` ANTES del despacho; `senderGuard.spec` (6, previo) |

**Resultado: los criterios del hito quedan CUMPLIDOS** —`CA-RF-13`, `CA-RF-14`/`CA-RF-45`, **`CA-RF-15` (cerrado tras D-H3-A)**, `CA-RF-16`/`CA-RF-36`, `CA-RF-17`/`CA-RF-25`, `CA-RF-18`, `CA-RF-24` (parte `accountsChanged`), `CA-RF-26`, `CA-RF-27` y RNF-10/RNF-11—, con la evidencia de esta acta y de `RepoTecnico/evidencia/H3/`.

**Extra §3.3.7 (`manifest.spec.ts`)**: `use_dynamic_url` ✓ (`manifest.spec.ts:131`, y observable en
E2E `07`: el `src` de `inject.js` usa un UUID dinámico en lugar del ID de la extensión),
`notifications` fuera de `permissions` ✓ (`manifest.spec.ts:95`/`99`), `exclude_matches` **no** lo
cubre `manifest.spec.ts` (fichero fuera de este alcance): se cubre con el test nuevo de
`src/inject/inject.spec.ts` (lista cerrada `https://metamask.io/*`, `https://*.metamask.io/*`).

---

## 4. Defectos y hallazgos de producción

### D-H3-A — `CA-RF-15`: el cambio de cuenta activa desde el popup NO emitía `accountsChanged` — ✅ **CORREGIDO**

* **Ubicación del defecto:** `src/background/rpc/catalog.ts:966` (`handleSetCurrentAccount`: solo
  persiste la referencia) y `src/background/events.ts:152` (`emitAccountsChanged` **sin ninguna
  llamada de producción**; solo la usan las pruebas). Tampoco hay ningún oyente de
  `chrome.storage.onChanged` sobre `truekeate_current_account`.
* **Comando y salida reales** (búsqueda de puntos de emisión):
  `Select-String -Path src/background/*.ts,src/background/**/*.ts -Pattern "emitAccountsChanged|emitProviderEvent\("`
  → `events.ts:152` (definición), `session`/`disconnect`/`message` en `events.ts:160/166/173`,
  `router.ts:180` (emisión de `connect` al recuperar la sesión) y `catalog.ts:1180` (revocación).
  **No hay ningún emisor ligado al cambio de cuenta.**
* **Medición (diagnóstico temporal, log archivado):**
  `wallet_setCurrentAccount` → `{"result":{"currentAccountRef":"idx:1"}}`;
  `accountsChanged recibidos tras el cambio: []`;
  `eth_accounts tras el cambio: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]` (la cuenta 0).
  Evidencia: `RepoTecnico/evidencia/H3/diagnostico-ca-rf-15-2026-09-11.log`.
* **Impacto:** la dApp conectada no se entera del cambio de cuenta (la caché
  `provider.selectedAddress` de la página queda obsoleta hasta el siguiente `eth_accounts`).
* **Corrección aplicada (2026-09-11, `DEC-57`):** `handleSetCurrentAccount`
  (`src/background/rpc/catalog.ts`) persiste la referencia y **emite `accountsChanged` con la cuenta
  nueva** a las pestañas afectadas, actualizando antes la **cuenta compartida de las sesiones
  vigentes** (`applyActiveAccountToSessions`, M26) conforme a **D-H3-B**; el evento viaja **solo** a
  las pestañas de sesiones vigentes (RNF-11).
* **Verificación:** `src/background/rpc/setCurrentAccount.spec.ts` (**4** tests) y el caso nuevo del
  E2E `08-eventos.spec.ts`, con la evidencia `08-cambio-cuenta-2026-09-11.json` (`accountsChanged`
  con la cuenta nueva y `eth_accounts` devolviendo esa misma cuenta). **`CA-RF-15` queda CUMPLIDO.**

### D-H3-B — Ambigüedad de contrato: `eth_accounts` mantenía la cuenta fijada en la conexión — ✅ **RESUELTA (opción (a))**

* **Ubicación:** `src/background/rpc/pageMethods.ts:209-217` (`handleAccounts` devuelve
  `session.account`) y `src/background/sessions.ts` (`DappSession.account`).
* **Observación medida:** tras `wallet_setCurrentAccount { ref: 'idx:1' }`, la sesión de la dApp
  sigue autorizando `idx:0`. Es coherente con §3.2 («la sesión guarda la cuenta autorizada»), pero
  implica que el «cambio desde el popup» de `CA-RF-15` no puede reflejarse sin decidir además si la
  sesión debe seguir la cuenta activa. Se reportó como **ambigüedad**, no como defecto.
* **Decisión (2026-09-11, `DEC-58`):** se adopta la **opción (a)** —equivalente a MetaMask—: mientras
  la sesión siga vigente, la dApp comparte la **cuenta activa**; el cambio de cuenta **actualiza la
  cuenta compartida de las sesiones vigentes** (`applyActiveAccountToSessions`) y emite
  `accountsChanged`, **sin borrar la sesión**. La **alternativa (b)** —sesión fijada a la cuenta
  elegida en la conexión— queda **descartada** y no debe reintroducirse.
* **Verificación:** `src/background/sessions.spec.ts` (**2** tests nuevos: «actualiza la cuenta
  compartida SOLO de las sesiones vigentes y devuelve sus pestañas» y «sin sesiones vigentes que
  cambiar NO escribe nada») y `setCurrentAccount.spec.ts` («`eth_accounts` devuelve la cuenta nueva
  tras el cambio (fin de la ambigüedad D-H3-B)»).

### D-H3-C — Fragilidad latente: `senderGuard` capturaba `INTERNAL_METHODS` en su evaluación de módulo — ✅ **CORREGIDO**

* **Ubicación:** `src/background/security/senderGuard.ts:220`
  (`export const INTERNAL_METHOD_NAMES: readonly string[] = INTERNAL_METHODS;`) dentro de la cadena
  circular `catalog → connections → sessions → senderGuard → catalog`.
* **Comando y salida reales** (diagnóstico temporal, log archivado):
  `npx vitest run src/background/_diagnostico-import-order.spec.ts` →
  `TypeError: Cannot read properties of undefined (reading 'includes')`,
  `Tests 1 failed (1)`. Evidencia:
  `RepoTecnico/evidencia/H3/diagnostico-import-order-2026-09-11.log`.
* **Impacto:** si `catalog` se evalúa antes que `senderGuard`, `isInternalMethodName` lanza y el
  router responde `-32603` a **cualquier** petición. El entry de producción (`src/background.ts`)
  no cae en ese orden y la suite pasa, pero basta reordenar imports (o consumir `catalog` primero)
  para romper la guarda. **No es un fallo activo**, es una fragilidad de inicialización.
* **Corrección aplicada (2026-09-11, `DEC-59`):** la lista se extrae a
  **`src/background/rpc/internalMethods.ts`** (módulo hoja, sin dependencias) y `senderGuard` la
  consume **sin depender del orden de importación**; la mitigación perezosa queda descartada por
  innecesaria. `messaging.spec.ts` sigue usando la allowlist de **16** métodos.
* **Verificación:** `src/background/security/importOrder.spec.ts` (**3** tests): la allowlist está
  completa aunque el catálogo se evalúe primero, un `wallet_*` desde una página responde **`4200`**
  (nunca `-32603`) pese al orden de importación, y una lectura de página iniciada por la propia
  página sigue aceptándose.

### D-H3-D — DEFECTO DEL ARNÉS: 11 E2E fallaban con `ERR_CONNECTION_REFUSED` en `test.html` — ✅ **CORREGIDO**

* **Síntoma medido:** `page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5174/test.html`
  en **11** pruebas → **26 passed / 11 failed**. El servidor de la dApp (`npm run dev`, puerto 5174
  con `strictPort`) se **arrancaba a mano**, de modo que la suite dependía de un paso externo que no
  controlaba.
* **Naturaleza:** **defecto del arnés, no del producto**: ningún criterio de aceptación estaba en
  juego y **ninguna aserción se relajó**.
* **Corrección aplicada (2026-09-11, `DEC-60`):** `playwright.config.ts` declara **`webServer`**
  (`command: 'npm run dev'`, `url: 'http://localhost:5174/test.html'`, `reuseExistingServer: true`,
  `timeout: 120 s`, `stdout: 'ignore'`): la suite **se autosirve la dApp**, espera a que responda, la
  reutiliza si ya estaba levantada y la apaga al terminar.
* **Resultado:** **26 passed / 11 failed → 37 passed / 0 failed**. **Lección vinculante:** la suite
  **no** debe depender de que alguien arranque la dApp a mano.

### Nota operativa de Anvil — `anvil --silent` no arranca con `Start-Process` y redirección de salida

* **Observación (2026-09-11, `DEC-61`):** `anvil --silent` lanzado mediante `Start-Process` con
  redirección de salida **no arranca**: el proceso muere con **exit 1** y toda la suite E2E falla con
  `ERR_CONNECTION_REFUSED` / `error sending request`, un síntoma que se confunde con un defecto de la
  extensión.
* **Comando verificado:** `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --http.corsdomain "*"`
  **sin `--silent`** (registrado en `entornos_globales.md` §2.1).
* **Recomendación:** el `global-setup` **debe abortar con un mensaje claro si Anvil no responde**
  (`cast chain-id` ≠ `31337`); hoy solo emite un `AVISO` y las pruebas con red se saltan o fallan más
  tarde (`entornos_globales.md` §2.4).

### Hallazgos positivos verificados de paso

* El **token bucket** es real y observable de extremo a extremo: la primera versión del E2E `08`
  agotó la ventana (7.ª petición del origen) y recibió `4001`; el arnés ahora devuelve el `code` del
  rechazo en lugar de un `page.evaluate: Object` opaco.
* `use_dynamic_url: true` se observa en el navegador: el `src` de `inject.js` lleva un **UUID por
  sesión**, no el ID de la extensión (E2E `07`).

---

## 5. Confirmación de alcance

**Creados (solo pruebas):** `src/inject/inject.spec.ts`,
`src/background/rpc/eip1193.spec.ts`, `src/background/messaging.spec.ts`,
`src/background/sessions.spec.ts`, `src/background/polling.spec.ts`,
`src/background/rpc/rpcRetry.spec.ts`, `src/background/rateLimit.spec.ts`,
`src/background/originFrame.spec.ts`, `e2e/07-provider.spec.ts`, `e2e/08-eventos.spec.ts`,
`e2e/09-conectar.spec.ts`, `e2e/13-revocar.spec.ts`, `e2e/14-polling.spec.ts`,
`e2e/27-rpc-caido.spec.ts`, `e2e/28-iframe-hostil.spec.ts`,
`src/background/rpc/setCurrentAccount.spec.ts` y `src/background/security/importOrder.spec.ts`.

**Ampliados:** `src/shared/naming.spec.ts` (+2 tests), `src/background/sessions.spec.ts` (+2 tests
de **D-H3-B**) y `e2e/08-eventos.spec.ts` (+1 test de **D-H3-A**); `e2e/fixtures/extension.ts` (solo
helpers; ningún test existente modificado).

**Evidencia:** `RepoTecnico/evidencia/H3/**` y este `ACTA_H3.md`.

**Corregido en el producto al cerrar los defectos (única intervención fuera de las pruebas):**
`src/background/rpc/catalog.ts` (**D-H3-A**/**D-H3-B**: `handleSetCurrentAccount` y
`syncActiveAccount`), `src/background/sessions.ts` (`applyActiveAccountToSessions`),
`src/background/rpc/internalMethods.ts` (módulo hoja nuevo) y
`src/background/security/senderGuard.ts` (**D-H3-C**). **Arnés:** `playwright.config.ts`
(`webServer`, **D-H3-D**).

**No se ha tocado:** el resto del código de producción (`src/popup/**`, `src/connect/**`,
`src/inject/**`, `src/shared/**`), `contracts/`, `public/`, el resto de configuraciones
(`package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `eslint.config.js`,
`scripts/`) ni ningún otro `RepoTecnico/*.md`. Los dos ficheros de diagnóstico temporales
(`e2e/_diagnostico-ca-rf-15.spec.ts`, `src/background/_diagnostico-import-order.spec.ts`) se
eliminaron tras archivar su salida, y la batería se repitió **después** del cierre: **Vitest 403
passed / 28 ficheros** y **Playwright 37 passed / 0 failed**, que son las cifras finales del árbol
entregado.

> Nota: los PIDs de Anvil se matan **por PID** y el nodo se restaura y se verifica (`0x7a69`) antes
> de terminar la prueba `27`; el estado del nodo queda en marcha al acabar la suite.

---

## 6. Historial de este acta

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2026-09-11 | Acta inicial de la ejecución de pruebas de H3: **394 passed / 26 ficheros** y **36 E2E** (con **26 passed / 11 failed** antes de añadir el `webServer`), con los defectos **D-H3-A**, **D-H3-B** y **D-H3-C** abiertos. |
| **1.1 (esta versión)** | 2026-09-11 | **Cierre de H3**: batería final **Vitest 403 passed / 28 ficheros** y **Playwright 37 passed / 0 failed**; **D-H3-A**, **D-H3-C** y **D-H3-D** corregidos, **D-H3-B** resuelta con la **opción (a)** y nota operativa de Anvil; **todos los `CA-RF-*` de H3 cumplidos**, incluido **`CA-RF-15`**; decisiones **DEC-57..DEC-61** de `estado_proyecto.md` v2.2. |
