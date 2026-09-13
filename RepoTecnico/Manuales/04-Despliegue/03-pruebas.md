# Pruebas de TrueKeate Wallet

Propósito: documentar **las cuatro suites** del proyecto (Vitest, Playwright, Forge y las guardas del corpus), **qué configuración exacta tienen**, **qué cubre cada spec**, **cómo se ejecutan** y **cómo se interpreta la evidencia archivada** en `RepoTecnico/evidencia/`, citando siempre el fichero y la línea que sostienen cada afirmación.

> **Advertencia de veracidad.** Este manual **no re-ejecuta ninguna suite**: se ha elaborado leyendo `package.json`, `vitest.config.ts`, `vite.config.ts`, `playwright.config.ts`, `test/setup/chrome-stub.ts`, `e2e/**`, `test/oracle/**`, `contracts/**`, `scripts/**`, `src/docs.spec.ts` y los logs archivados. Los totales de pruebas y coberturas son **cifras declaradas por el proyecto** (`RepoTecnico/estado_proyecto.md` e `RepoTecnico/INFORME_PRUEBAS_FASE4.md`) y se citan con línea; donde esta lectura aporta un conteo **estático** propio, se dice expresamente.

## Panorama de las cuatro suites

### Suites, comandos y cifras declaradas

#### Tabla de suites

`README.md:96-103` presenta los cuatro comandos como «la **puerta de calidad** del proyecto»; `README.md:114-119` añade los auxiliares (`coverage`, `typecheck`, `check:mermaid`, `test:watch`).

| Suite | Comando | Literal en `package.json` | Requisito de entorno |
|---|---|---|---|
| **Vitest** (unitarias e integración) | `npm run test` | `vitest run` (línea 10) | Ninguno: `jsdom` en memoria |
| **Playwright** (E2E reales) | `npm run test:e2e` | `playwright test` (línea 13) | **Anvil en marcha** (`127.0.0.1:8545`, `chainId` 31337) |
| **Forge** (contrato EIP-712) | `npm run forge:test` | `forge test --root contracts --match-contract EIP712VerifierTest` (línea 17) | Foundry `>=1.0.0 <2.0.0` |
| **Guardas del corpus** | `npm run lint:prohibited` | `node scripts/lint-prohibited.mjs` (línea 14) | Ninguno |

#### Qué cubre cada frente

`README.md:107-110` lo resume: Vitest cubre criptografía BIP-39/EIP-55, derivación HD, cola de aprobaciones, redacción de logs, validación de formularios, contrato interno del SW y cabecera JSDoc de cada módulo (RNF-13, RNF-17, RT-02, RT-07); Playwright cubre la carga de `dist/` con 0 errores y los flujos de usuario hasta la accesibilidad y la marca (RF-46, RNF-21, RT-07, RT-09, RT-13); Forge, que la firma EIP-712 de la wallet sea verificable on-chain (RF-20, RT-11); las guardas, 0 `fetch`/`axios`/CDN, 0 `chrome.storage.sync`, 0 literales de color fuera de `tokens.css`, 0 nomenclatura heredada y `ethers` fuera del popup.

#### Cifras declaradas (no medidas aquí)

| Magnitud | Valor declarado | Fuente |
|---|---|---|
| Vitest | **1185 pasadas / 71 ficheros · 0 failed** | `RepoTecnico/estado_proyecto.md:215` · `INFORME_PRUEBAS_FASE4.md:25` |
| Playwright | **84 pasadas / 0 failed / 0 flaky · 33 specs** | `RepoTecnico/estado_proyecto.md:217` · `INFORME_PRUEBAS_FASE4.md:26` |
| Forge | **30 pasadas / 2 suites** (`EIP712VerifierTest` 10 + `EIP712VerifierFase4Test` 20) | `INFORME_PRUEBAS_FASE4.md:27` y `:30-31` |
| Cobertura de ramas: global / `crypto/` / `approvals/` / `validation/` | **86,11 % · 86,98 % · 95,60 % · 93,13 %** (umbrales 70 % y 80 %) | `INFORME_PRUEBAS_FASE4.md:46-49` |
| Puerta de cierre: `tsc -b`, `build`, `lint:prohibited`, `coverage` | **exit 0** | `RepoTecnico/estado_proyecto.md:219-221` |

#### Lo que esta lectura sí ha verificado (conteo estático)

Hay **60 ficheros `*.spec.ts` bajo `src/`** y **11 bajo `test/oracle/`**: **60 + 11 = 71**, exactamente los «71 ficheros» declarados (patrón de `vite.config.ts:218`). Los **bloques** `it(`/`test(` contados estáticamente son **747** en `src/` y **247** en `test/oracle/` (**994**), por debajo de las 1185 pruebas declaradas: la diferencia es esperable porque el corpus usa `it.each(...)` —que expande una plantilla en N pruebas— y `src/docs.spec.ts` genera una prueba por fichero auditado. El conteo estático es, por tanto, un **límite inferior**.

## Vitest

### Configuración

#### Una sola fuente de verdad

`vite.config.ts:215-233` exporta el bloque `test` como `testConfig`; `vitest.config.ts` (18 líneas) **no duplica valores**: importa ese objeto (`vitest.config.ts:13`) y lo aplica junto al plugin de React (`vitest.config.ts:16-17`), porque «cuando existe `vitest.config.ts`, Vitest no lee `vite.config.ts`» (`vitest.config.ts:8-9`). Valores efectivos: `environment: 'jsdom'`, `setupFiles: ['./test/setup/chrome-stub.ts']`, `include: ['src/**/*.spec.ts', 'test/oracle/**/*.spec.ts']` y `globals: true` (`vite.config.ts:216-219`).

#### Entorno `jsdom` y tipos

`environment: 'jsdom'` (`vite.config.ts:216`) da DOM a los specs. `tsconfig.json:16` declara `"types": ["chrome", "node", "vite/client", "vitest/globals"]`, con el comentario de que `vitest/globals` está ahí porque el bloque `test` activa `globals` (`tsconfig.json:14-15`).

### El stub de `chrome.*`

#### Superficie que simula

`setupFiles: ['./test/setup/chrome-stub.ts']` (`vite.config.ts:217`) carga, **una vez por fichero de prueba y antes de los casos**, el stub en memoria descrito en `test/setup/chrome-stub.ts:8-12`. El fichero tiene **1019 líneas**:

| Superficie del stub | Qué ofrece | Líneas |
|---|---|---|
| `chrome.storage.local` | Almacén en memoria con callbacks y promesas, `QUOTA_BYTES`, `setAccessLevel`, `getBytesInUse`, historial de escrituras y `simulateWriteFailure()` para simular cuota agotada | `:132-147`, `:324-449` |
| `chrome.alarms` | Reloj **propio y determinista** (`STUB_EPOCH_MS`), `create`/`get`/`clear`, `onAlarm` y disparo manual con `fire(name)` | `:149-164`, `:540-585` |
| `chrome.runtime` + `chrome.windows` + `chrome.tabs` | `onMessage`/`onConnect`, puertos emparejados, `lastError`, ventanas y pestañas simuladas, `addTab`/`setMessageHandler` por pestaña | `:166-198`, `:625-811` |
| `chrome.permissions` + `chrome.action` + `chrome.notifications` | Permisos con concesión forzable (`setGranted(false)`), badge por pestaña y notificaciones creadas | `:255-283`, `:813-902` |

El stub **no implementa a propósito** tres cosas (`test/setup/chrome-stub.ts:47-49`): `chrome.storage.sync` (prohibido por ADT-26), la API de red del nodo (el RPC sale por el proveedor del SW) y cualquier límite de cuota real (se simula con `simulateWriteFailure()`).

#### Reloj inyectable y aislamiento entre pruebas

- **Reloj propio:** el stub mantiene su epoch `STUB_EPOCH_MS = 1_700_000_000_000` (`test/setup/chrome-stub.ts:62`) porque `chrome.alarms.create({ delayInMinutes })` se resuelve contra **ese** reloj y no contra `setTimeout` (`:28-31`). Se avanza con `advanceAlarms(ms)` (`:1000-1003`), que además mueve los *fake timers* de Vitest si están activos, o con `chromeStub.clock.set/advance` (`:512-538`).
- **Aislamiento total:** un `beforeEach` global llama a `resetChromeStub()` (`:1017-1019`), que deja almacén vacío, cero alarmas, cero listeners, cero ventanas y pestañas, badge vacío, permisos sin conceder, `lastError` limpio y el reloj de nuevo en la epoch (`:913-950`).
- **ID sintético:** `STUB_EXTENSION_ID = 'tk-stub-extension-id-for-tests'` (`:59`), deliberadamente **distinto** del ID real, que en el E2E se descubre del Service Worker.

### Universo de specs y corpus

#### `include` y las dos ubicaciones

`include: ['src/**/*.spec.ts', 'test/oracle/**/*.spec.ts']` (`vite.config.ts:218`). `vite.config.ts:211-213` explica por qué hay **dos** ubicaciones: `src/**` son los specs **junto al módulo** (convención del corpus) y `test/oracle/**` son «specs de cobertura adicional que NO viven junto al modulo por una razon de terreno: H6 cerro la puerta de cobertura de `approvals/**` sin modificar `src/background/**`». La convención mayoritaria es la primera: `src/background/crypto/mnemonic.spec.ts` junto a `mnemonic.ts`, `src/shared/validation/validation.spec.ts` junto a `validation.ts`. Se han contado **60** ficheros `*.spec.ts` en `src/`.

### Cobertura V8 y umbrales

#### Configuración declarada

`vite.config.ts:220-232`: `provider: 'v8'`, *reporters* `['text', 'json-summary', 'json', 'html']`, `reportsDirectory: './coverage'`, `include: ['src/**/*.{ts,tsx}']` y los umbrales `branches: 70` más `80` en `src/background/crypto/**`, `src/background/approvals/**` y `src/shared/validation/**`.

#### Por qué ramas y por qué bloqueantes

`vite.config.ts:198-205` documenta la decisión (RNF-17, tarea 6.8): la métrica es **cobertura de RAMAS** con `@vitest/coverage-v8`, y se declaran umbrales de configuración —y no una comprobación manual— «para que `npm run coverage` **falle** si el hito baja del umbral». La semántica de las claves está escrita (líneas 204-205): «La clave sin glob es el minimo global; cada clave con glob es un minimo agregado de ese arbol». `README.md:121` lo confirma y añade que el informe HTML queda en `coverage/`.

### Exclusiones declaradas y por qué

#### Las tres exclusiones

`vite.config.ts:207-209` declara `exclude: ['src/**/*.spec.ts', 'src/manifest.ts', 'src/**/*.d.ts']` con este motivo: los specs «no son codigo de producto»; `src/manifest.ts` es «fuente de datos congelados del manifest, verificada por `manifest.spec.ts` contra el JSON generado»; y los `.d.ts` no son código ejecutable. Y cierra: «**No** se excluye ningun modulo funcional».

#### Un límite declarado (no una exclusión)

`INFORME_PRUEBAS_FASE4.md:590-602` (§7.2) documenta que `src/popup/**` (vistas), `src/connect/**` y `src/notification/**` presentan **0 % de líneas** en Vitest **porque se prueban en el navegador con Playwright**, no porque estén excluidas. La consecuencia se dice sin maquillar: la cobertura global de **líneas** (61,04 %) es baja y «**no** es una medida útil del proyecto: el umbral de RNF-17 se evalúa sobre **ramas** de la lógica». La lógica extraída de la UI (`popup/validation.ts`, `popup/popupErrors.ts`, `popup/walletRpc.ts`, `popup/hooks/useBalancePolling.ts`) **sí** tiene pruebas.

### Comandos de la suite

#### Los tres comandos y la regla de no solapar

`npm test` (`vitest run`, una pasada), `npm run coverage` (`vitest run --coverage`, aplica y **exige** los umbrales) y `npm run test:watch` (`vitest`, vigilancia). `README.md:123` prohíbe solapar suites: «**No ejecutes Vitest y Playwright a la vez** (Vitest escribe temporales en `src/` y el vigilante de Vite reinicia y tumba el servidor de la dApp)». La regla figura como metodología en `INFORME_PRUEBAS_FASE4.md:114-116` («Una suite pesada a la vez»).

### Inventario de `test/oracle/**`

#### Los 11 ficheros y qué cubren

| Fichero | `describe` | Bloques `it(` |
|---|---|---|
| `test/oracle/calldata.spec.ts` | M66 · tabla local cerrada de selectores (RF-19 / RF-20) | 21 |
| `test/oracle/dispatch-coverage.spec.ts` | M19.b · contexto de la sesión del origen (RNF-11) | 31 |
| `test/oracle/focus-coverage.spec.ts` | M18 · localización de la API y de la ventana única | 28 |
| `test/oracle/ports.spec.ts` | M17 · índice volátil de puertos (estado admisible, §3.4) | 31 |
| `test/oracle/preview.spec.ts` | M19 · extracción tolerante de los parámetros de la dApp | 40 |
| `test/oracle/queue-coverage.spec.ts` | M14 · cerrojo de escritura serializada (H-08 / CA-RF-37) | 38 |
| `test/oracle/reconcile-coverage.spec.ts` | M16 · plan de reconstrucción de `inflight` (§2.12, función pura) | 12 |
| `test/oracle/responses.spec.ts` | M14.c · `handleSignResponse`: allowlist de ruta e idempotencia (X-06) | 12 |
| `test/oracle/timeout.spec.ts` | M15 · plazos normativos (RF-40) | 24 |
| `test/oracle/crypto-numeric.spec.ts` | M11 · `toBigIntOrNull`: solo valores utilizables se convierten | 5 |
| `test/oracle/decisions.spec.ts` | M14.b · espera y desenlace de la decisión (RF-37) | 5 |

#### Cómo se lee este inventario

- El nombre de cada fichero (`*-coverage`) delata su origen: cierran la **cobertura de ramas** de módulos que no admitían un spec junto al módulo sin tocar `src/background/**` (`vite.config.ts:211-213`).
- Los **dos últimos** son specs funcionales de la Fase 4, no de cobertura: `INFORME_PRUEBAS_FASE4.md:146-147` los lista con 5 pruebas cada uno y los describe como «Magnitudes numéricas de la capa criptográfica» y «Máquina de decisión de la cola de aprobaciones».
- Los conteos de la tercera columna son **estáticos** (bloques `it(` del fichero) y, por tanto, un **límite inferior** de las pruebas que producen.

## Playwright

### Configuración

#### Reglas de la cabecera

`playwright.config.ts` tiene **79 líneas**. Su cabecera (`:1-12`) fija cinco reglas: `testDir: 'e2e'` con un `globalSetup` que reconstruye `dist/` con los plazos inyectados; **un solo worker** (la extensión vive en un contexto persistente y comparte el ID estable); **cero reutilización de perfiles** (perfil nuevo por prueba con `mkdtemp`); `headless` conmutable con `E2E_HEADLESS=false`; y evidencia archivada como `RepoTecnico/evidencia/<fase>/<nombre>-<fecha>.json`.

#### Valores efectivos

| Clave | Valor | Línea |
|---|---|---|
| `testDir` / `globalSetup` | `'e2e'` / `'./e2e/global-setup.ts'` | `:25`, `:26` |
| `webServer` | `command: 'npm run dev'`, `url: 'http://localhost:5174/test.html'`, `reuseExistingServer: true`, `timeout: 120_000` | `:36-43` |
| Paralelismo | `fullyParallel: false`, `workers: 1`, `forbidOnly: process.env.CI !== undefined` | `:46-48` |
| Reintentos y plazos | `retries: 0`, `timeout: 60_000`, `expect.timeout: 10_000` | `:49-52` |
| Salidas | `outputDir: 'test-results'` | `:55` |
| `use` | `headless: E2E_HEADLESS !== 'false'`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'off'`, `actionTimeout: 15_000`, `navigationTimeout: 30_000` | `:63-70` |

#### Proyecto y *reporter*

`playwright.config.ts:72-78` declara **un único proyecto**, `chromium-extension`, con `use: { channel: 'chromium' }`; el comentario precisa que el fixture llama a `chromium.launchPersistentContext(dir, { channel: 'chromium' })`, es decir se usa el **canal** del sistema (que sí soporta las API de extensión), no el Chromium empaquetado por Playwright. El *reporter* (`:57-61`) tiene tres destinos: `list` por consola, `json` a `${EVIDENCE_DIR}/e2e-${RUN_DATE}.json` y `html` a `playwright-report/` con `open: 'never'`; la carpeta de evidencia se compone con `EVIDENCE_PHASE` (`:17-19`), por defecto `H1`.

### `globalSetup`: qué prepara

#### Los pasos, con su línea

`e2e/global-setup.ts` (347 líneas) prepara la corrida **antes** de cualquier prueba:

| # | Qué hace | Línea |
|---|---|---|
| 1 | Crea la carpeta de evidencia del hito | `:138` |
| 2 | **Verifica los plazos de producción** en `src/shared/constants.ts` (120 000 / 60 000 / 30 000 ms) y **lanza** si no son el valor por defecto | `:149-160` |
| 3 | **Reconstruye `dist/`** con `npm run build` y `VITE_SIGN_TIMEOUT_MS=3000` + `VITE_CONNECT_TIMEOUT_MS=2000`; si falla, intenta `npx vite build` y **registra ambos fallos** | `:162-193` |
| 4 | Comprueba si hay artefacto cargable (`dist/manifest.json`) y lo avisa | `:195-207` |
| 5 | Comprueba **Anvil principal** con `cast chain-id` y **ABORTA la suite** si no responde o el `chainId` no es `31337` | `:209-239`, `:342-346` |
| 6 | Arranca el **Anvil secundario** (8546 / 31338) si falta; si no lo consigue, **no** aborta: las pruebas de red que lo necesiten quedan NO VERIFICADAS | `:241-292` |
| 7 | Escribe `e2e-global-setup-<fecha>.log` y `.json`, e imprime el resumen | `:294-340` |

#### Por qué el aborto por Anvil es un requisito

`e2e/global-setup.ts:210-214` explica la causa: la suite de H3..H6 depende del nodo local y «si Anvil no responde, los E2E con red fallan más tarde de forma confusa (`ERR_CONNECTION_REFUSED`, `4900` espurios…)». El mensaje de aborto incluye **el comando exacto** que arranca el nodo (`:218-227`) y el aviso de no añadir `--silent`: es la recomendación vinculante que dejó escrita `RepoTecnico/entornos_globales.md:162` (H3/DEC-61).

#### El registro que se archiva

`e2e/global-setup.ts:295-315` define el objeto que se escribe en `e2e-global-setup-<fecha>.json`: `fase`, `fecha`, `repositorio`, `dist`, `manifestDisponible`, `plazosInyectados`, `plazosProduccion`, `build` (comando, exit code, ok), `buildAlternativo`, `anvil` (rpcUrl, disponible, chainId), `anvilSecundario` (con `arrancadoPorElArnes` y su comando) y `advertencias`.

### Fixtures del arnés

#### Qué expone `e2e/fixtures/extension.ts`

El fichero (más de 1200 líneas) define el `test` extendido con tres *fixtures* (`e2e/fixtures/extension.ts:460-486`): `context` (contexto persistente con la extensión cargada desde `dist/`, con perfil nuevo por prueba y borrado en el `finally`), `extensionId` (**descubierto** del Service Worker, `:152-159`) y `background` (el propio Service Worker, `:162-166`).

| Helper | Para qué | Línea |
|---|---|---|
| `requireDist()` / `expectedExtensionId()` | Fallar con mensaje accionable si falta `dist/manifest.json` / derivar el ID de la `key` con el algoritmo de Chrome | `:114-139` |
| `openPopupReady()` / `loseFocusToOtherPage()` | Abrir el popup aceptando el aviso no descartable (RNF-23) / provocar pérdida de foco **real** por CDP | `:387-401`, `:363-381` |
| `stopServiceWorker()` / `watchServiceWorker()` | Suspender el SW por **CDP** y observar `stopped`/`running` | `:246-332` |
| `conectarDapp()` / `iniciarPeticionDeFirma()` / `aprobarEnLaVentana()` | Flujo de conexión, firma sin bloquear y resolución de la ventana única | `:737-774`, `:887-949`, `:1032-1045` |
| `readChromeStorage()` / `writeChromeStorage()` / `archivarEvidencia()` | Leer y sembrar `chrome.storage.local` desde el SW / escribir o **fusionar** la evidencia JSON | `:433-454`, `:1072-1095` |
| `detenerAnvil()` / `arrancarAnvil()` / `RED_SECUNDARIA_EIP3085` | Control del proceso Anvil y segunda red de los flujos de cambio/alta | `:585-621`, `:1118-1165` |

Dos ayudas adicionales viven en ficheros propios: `e2e/fixtures/h2.ts` (frase y direcciones **reales** de Anvil, siembra del estado y lectura del QR; líneas 15-41) y `e2e/fixtures/qr.ts` (descriptor del QR que recorre la matriz **en sentido inverso** al codificador, líneas 1-31).

#### Desviaciones del arnés documentadas

Dos explican por qué el código no coincide con el bloque literal del documento técnico: (a) `e2e/fixtures/extension.ts:11-13` — «el documento usa `path.resolve(__dirname, ...)`, que NO existe en un paquete `"type": "module"`», así que la raíz se calcula con `import.meta.url` + `fileURLToPath`; y (b) `:232-245` documenta **tres** mecanismos de suspensión del SW que **no** funcionan (sesión CDP sobre el Worker, `registration.unregister()` y `waitForEvent('serviceworker')` al re-arrancar) frente al que sí: el dominio CDP `ServiceWorker` sobre una **página** de la extensión.

### Inventario de los specs E2E (33 de producto + 1 sonda)

#### Cómo se ha elaborado

Se ha listado `e2e/**/*` (34 ficheros `*.spec.ts`, más `global-setup.ts` y tres ficheros de `e2e/fixtures/`) y se ha leído el **primer `test(...)`** de cada uno.

#### Reconciliación del recuento (divergencia real, verificada)

La documentación del proyecto declara «**84 passed … 33 specs**» (`RepoTecnico/estado_proyecto.md:217`). El conteo estático de este repositorio da: **34 ficheros `*.spec.ts`** y **84 bloques `test(`**, de los cuales:

| Conjunto | Ficheros `*.spec.ts` | Bloques `test(` |
|---|---|---|
| Specs de producto (tabla siguiente) | 33 | 83 |
| `90-sonda.spec.ts` (material de diagnóstico, `e2e/90-sonda.spec.ts:1-3`) | 1 | 1 |
| **Total en `e2e/`** | **34** | **84** |

Es decir: la cifra de pruebas (**84**) cuenta el fichero de sonda y la cifra de ficheros (**33**) no; ambas son ciertas por separado, pero no describen el mismo conjunto. Los `test.describe` (34 en total, uno por spec de producto) agrupan sin multiplicar, así que el conteo de bloques `test(` no es un límite inferior. Los recuentos de esta tabla son estáticos (lectura del código), no una ejecución: **pendiente de confirmar** con `npm run test:e2e`.

| # | Spec | Flujo que cubre (primer `test`) | `test(` |
|---|---|---|---|
| 1 | `01-onboarding.spec.ts` | La extensión carga desde `dist/` y el ID se descubre del Service Worker | 6 |
| 2 | `02-cuentas.spec.ts` | 5 cuentas con las direcciones de Anvil y «Añadir cuenta» crea la 6.ª (CA-RF-04) | 3 |
| 3 | `03-recibir.spec.ts` | «Recibir» muestra la dirección de la cuenta activa y su QR la codifica (CA-RF-07) | 2 |
| 4 | `04-enviar.spec.ts` | La dApp recibe el hash al aprobar y el recibo del nodo es `status 1` | 1 |
| 5 | `05-persistencia.spec.ts` | Reabrir el popup restaura cuenta activa e importadas sin pedir la frase (CA-RF-09/10) | 3 |
| 6 | `06-reset.spec.ts` | El reset enumera las importadas, borra cartera y sesiones y **conserva** los logs (CA-RF-11) | 3 |
| 7 | `07-provider.spec.ts` | La dApp recibe `window.truekeate === window.codecrypto` con la superficie completa | 5 |
| 8 | `08-eventos.spec.ts` | `accountsChanged []` llega a las **dos** pestañas conectadas y a ninguna más | 2 |
| 9 | `09-conectar.spec.ts` | Un origen **no** conectado devuelve `[]` y **no** abre ventana (sin prompt implícito) | 3 |
| 10 | `10-aprobar-tx.spec.ts` | La vista previa decodifica el calldata, la ventana es única y está enfocada | 1 |
| 11 | `11-firmar-eip712.spec.ts` | La ventana muestra `name`/`verifyingContract` y la firma verifica el digest del contrato | 1 |
| 12 | `11-firmar-mensaje.spec.ts` | La ventana muestra el texto y la firma recupera la cuenta autorizada | 1 |
| 13 | `12-redes.spec.ts` | La red destino ya activa responde `null` sin abrir la ventana (CA-RF-22) | 5 |
| 14 | `13-revocar.spec.ts` | Revocar elimina la sesión, emite `accountsChanged []` y no crea cola | 1 |
| 15 | `14-polling.spec.ts` | El contador real del popup marca 5 RPC por ciclo, arranca y para con la vista | 1 |
| 16 | `15-logs.spec.ts` | La llamada se registra con método, origen y `ts` **con el popup cerrado** (CA-RF-28) | 3 |
| 17 | `16-validacion.spec.ts` | La frase inválida muestra el error inline y no envía la operación | 3 |
| 18 | `17-i18n.spec.ts` | El saldo del popup usa 4 decimales con coma | 4 |
| 19 | `18-concurrencia.spec.ts` | Dos solicitudes simultáneas de orígenes distintos comparten una ventana con contador 2 | 1 |
| 20 | `21-eip6963.spec.ts` | La dApp recibe el anuncio con la identidad vinculante y el icono incrustado | 1 |
| 21 | `22-dapp.spec.ts` | Flujos 1 a 4 de `test.html` con resultado en pantalla en **< 5000 ms** | 5 |
| 22 | `23-marca.spec.ts` | El degradado de marca es idéntico en popup, connect y notification, de 72 px | 4 |
| 23 | `24-accesibilidad.spec.ts` | `axe-core`: 0 violaciones A/AA en las cuatro superficies | 5 |
| 24 | `25-recuperacion.spec.ts` | El revelado exige confirmación, dura 30 s y no pasa por `postMessage` (CA-RF-50) | 3 |
| 25 | `26-avisos.spec.ts` | El aviso del primer arranque es no descartable y se registra al aceptarlo | 3 |
| 26 | `27-rpc-caido.spec.ts` | Con Anvil detenido la lectura responde `4900` tras 4 intentos y el almacén no cambia | 1 |
| 27 | `28-iframe-hostil.spec.ts` | El iframe de otro origen recibe `[]` y nunca la cuenta del top | 1 |
| 28 | `29-sw-suspendido.spec.ts` | La alarma despierta al SW: `4001` sin doble difusión y reconstrucción **< 1 s** | 1 |
| 29 | `30-cuentas-visibilidad.spec.ts` | Ocultar una derivada la retira sin borrar su derivación y «Mostrar» la devuelve igual | 2 |
| 30 | `31-persistencia-navegador.spec.ts` | Cerrar Chromium y reabrirlo sobre el mismo perfil restaura cartera, sesiones y registro | 1 |
| 31 | `32-aprobacion-vence-y-cierre.spec.ts` | Dejar vencer el plazo (3 s inyectados) cierra la ventana, entrega `4001` y no difunde | 3 |
| 32 | `33-envio-desde-el-popup.spec.ts` | El popup envía 1 ETH a una dirección externa y el recibo es `status 1` | 3 |
| 33 | `34-revelado-plazo-30s.spec.ts` | El revelado dura 30 s, se oculta solo con el aviso del plazo y vacía el portapapeles | 1 |

**Total de la tabla: 33 ficheros de spec de producto y 83 bloques `test(`; con `90-sonda.spec.ts` (1 prueba) el árbol `e2e/` suma 34 ficheros y 84 pruebas.**

#### Notas sobre el inventario

- Los prefijos numéricos **no** son consecutivos: faltan `19`, `20` y los `35+` porque esos números se reservaron a otros hitos; **no** hay specs borrados.
- `90-sonda.spec.ts` (1 prueba, «sonda: `personal_sign` con diagnostico», `e2e/90-sonda.spec.ts:22`) es **material de diagnóstico** del arnés, no una prueba de contrato del producto: es el fichero que falta para cuadrar «33 specs» con «84 pruebas» (véase la reconciliación de arriba). Su propia cabecera declara que «se elimina al cerrar H4» y «no es evidencia del hito» (`e2e/90-sonda.spec.ts:1-3`), pero sigue en el árbol.
- Varios specs no son 1:1 con su nombre: `22-dapp.spec.ts` cubre los 7 flujos de `test.html` y `24-accesibilidad.spec.ts` recorre cuatro superficies.
- La evolución por hitos está declarada en `INFORME_PRUEBAS_FASE4.md:157-166`: los **10** E2E nuevos de la Fase 4 son `30-cuentas-visibilidad` (2), `31-persistencia-navegador` (1), `32-aprobacion-vence-y-cierre` (3), `33-envio-desde-el-popup` (3) y `34-revelado-plazo-30s` (1), y «los **74** E2E previos (H1..H6) siguen verdes: 84 − 10 = 74».

### Cómo se lanzan

#### Comando, requisitos y depuración

`npm run test:e2e` (`package.json:13`) ejecuta `playwright test`. Antes de la primera prueba: **Anvil debe estar en marcha** en `127.0.0.1:8545` con `chainId` 31337 (si no, el `globalSetup` aborta, `e2e/global-setup.ts:344-346`), el comando del nodo es el de `RepoTecnico/entornos_globales.md:68` y `README.md:123`, y `npm run dev` **no** hace falta arrancarlo a mano porque lo levanta el `webServer`. `E2E_HEADLESS=false` abre el navegador visible (`playwright.config.ts:11`, `:22`); con `retries: 0` (`:49`) y `trace: 'retain-on-failure'` (`:65`) un fallo deja traza y captura en `test-results/` y el informe HTML en `playwright-report/`.

## Forge

### Comando y configuración

#### El literal normativo y su trampa

`package.json:17` declara `forge test --root contracts --match-contract EIP712VerifierTest`. El literal está documentado como normativo en `RepoTecnico/entornos_globales.md:364`, con la advertencia de **DEC-51/H1**: «el literal `forge test` sin `--root contracts` da un **falso verde** («Nothing to compile», 0 pruebas, exit 0)».

#### Configuración de Foundry

`contracts/foundry.toml` fija `solc = "0.8.24"` (versión **fijada**, no rango: «para cerrar la reproducibilidad del artefacto (RNF-24, §5.4)», línea 5), `evm_version = "cancun"` (línea 7), `optimizer = false` (línea 8), `src`/`test`/`out`/`libs` (líneas 9-12), `fs_permissions` de lectura de `./test/fixtures` porque «el fixture versionado se lee con `vm.readFile`, que exige permisos explícitos de lectura» (líneas 13-14) y `verbosity = 2` (línea 15).

### Qué verifica

#### La API del contrato

`contracts/README.md:18-28` documenta `function verify(address signer, bytes32 digest, bytes calldata signature) external view returns (bool);`, con `digest = keccak256(0x1901 ‖ domainSeparator ‖ structHash)` ya calculado por quien llama y `signature` de 65 bytes en el orden `r ‖ s ‖ v` con `v ∈ {27, 28}`. Devuelve `true` **solo** si la dirección recuperada coincide con `signer`; ante firma malformada devuelve **`false` sin revert** (longitud ≠ 65, `v` fuera de `{27,28}`, `s` en la mitad alta por EIP-2, `r = 0` o `s = 0`).

#### Los cinco casos obligatorios

`contracts/test/EIP712Verifier.t.sol:9-14` enumera los 5 casos de `CA-RT-11`: firma válida del fixture → `true`; firmante incorrecto → `false`; dominio alterado (`chainId` o `verifyingContract`) → `false`; firma malformada → `false` sin revert; y un byte alterado de la firma (y del mensaje) → `false`.

#### Las dos mitades del fixture

`contracts/README.md:75-92` documenta `eip712-signature.json`, generado **una sola vez** con `cast` y versionado (los tests no dependen de red ni de claves aleatorias); `contracts/README.md:111-139` documenta el **segundo** fixture, `eip712-wallet-signature.json`, que **no** se generó con `cast` sino con la **propia wallet** (M11 `src/background/crypto/sign.ts`, la misma vía que `eth_signTypedData_v4`). Ese segundo fixture convierte la suite en una comprobación de **correspondencia wallet ↔ contrato**. `contracts/README.md:3-5` y `:14-15` dejan claro qué es: instrumento de prueba de RT-11/`CA-RT-11` que «**no forma parte del producto**», sin estado y sin lógica de producción (P-07).

### Suites y cuántos tests hay

#### Conteo declarado

| Suite | Pruebas | Contenido | Fuente |
|---|---|---|---|
| `EIP712VerifierTest` | **10** | Los 5 obligatorios de `CA-RT-11` + correspondencia de fixture, firma de la wallet y firma de `cast` | `contracts/README.md:154-170`, `INFORME_PRUEBAS_FASE4.md:172` |
| `EIP712VerifierFase4Test` | **20** | Batería adversaria (prefijo `testF4_`): longitudes, `v` fuera de rango, `r`/`s` cero y altos, firma maleable, firmante ajeno, dominio/mensaje alterados, fuzz y ausencia de estado | `contracts/README.md:172-184`, `INFORME_PRUEBAS_FASE4.md:173` |
| **Total** | **30** | `forge build --root contracts` exit 0 | `INFORME_PRUEBAS_FASE4.md:174` |

#### Verificación parcial en esta lectura

`RepoTecnico/evidencia/H6/forge-2026-09-12.log` **sí** se ha leído y muestra el cierre de la suite de 10: `Suite result: ok. 10 passed; 0 failed; 0 skipped; finished in 7.48ms` y `Ran 1 test suite … 10 tests passed, 0 failed, 0 skipped (10 total tests)`. Ese log corresponde a **H6**, antes de la batería adversaria, por lo que el total de 30 es una **cifra declarada**, no re-ejecutada aquí.

#### Cobertura de la batería adversaria

`INFORME_PRUEBAS_FASE4.md:459-472` tabula las familias: longitudes 0..70, `v` fuera de `{27,28}`, `r`/`s` nulos, fronteras de `s` (incluido `s = n/2` exacto), firma maleable, firmante ajeno y cero, dominio y mensaje alterados, fuzz (**256** vueltas por defecto y **512** con semilla fija `0x547275654b656174652d4661736534`) y ausencia de estado (**0 SSTORE / 0 SLOAD / 0 DELEGATECALL / 0 SELFDESTRUCT**). Con una precisión importante: «Ningún caso revierte: el contrato devuelve `false` en todos ellos (los tests *pasan* justamente por eso)».

## Puertas de calidad

### `npm run typecheck`

#### Qué hace y qué cubre

`tsc -b` sobre los dos proyectos referenciados (`tsconfig.json:33`), con criterio «0 errores y 0 avisos de tipos (RNF-13)» (`RepoTecnico/entornos_globales.md:101`) y cierre declarado en `INFORME_PRUEBAS_FASE4.md:183` («**exit 0** (sin errores, `strict`)»). El proyecto de aplicación incluye `src`, `test` y `e2e` (`tsconfig.json:31`), de modo que los specs y el arnés están tipados; el de configuración cubre `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `src/manifest.ts` y `package.json` (`tsconfig.node.json:32-38`), porque `vite.config.ts` importa el manifest y un proyecto `composite` exige listar todos los ficheros del programa (`tsconfig.node.json:30-31`).

### `npm run lint:prohibited`: qué literales prohíbe

#### Las siete comprobaciones

| # | Qué prohíbe | Literales exactos | Línea |
|---|---|---|---|
| 1 | Dependencias prohibidas en los especificadores de import | `viem`, `viem/*`, `@scure/bip39`, `@scure/bip39/*`, `@metamask/*`, `axios`, `axios/*` | `scripts/lint-prohibited.mjs:36-41` |
| 2 | Llamadas **propias** a `fetch` | `fetch(` (con *lookbehind* para no casar `prefetch`), `window.fetch`, `globalThis.fetch`, `self.fetch` | `:140-144` |
| 3 | `chrome.storage.sync` | El patrón tolera espacios: `chrome . storage . sync` | `:147-149` |
| 4 | Prefijo heredado | Literal `codecrypto_` | `:152-154` |
| 5 | Literales de **color** fuera de `src/styles/tokens.css` | Hexadecimal `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`, `rgb()`/`rgba()`/`hsl()`/`hsla()` y `linear-gradient`/`radial-gradient`/`conic-gradient` | `:67-71`, `:157-163` |
| 6 | `ethers` importado desde `src/popup/` | Cualquier especificador `ethers` o `ethers/*` en ese árbol | `:134-136` |
| 7 | Recursos remotos en `dist/` (si existe) | `<script src="http…">`, `<link href="http…">`, `@import` remoto, `url(http…)`, `X.src = "http…"` y una **lista cerrada de 11 hosts de CDN** | `:59-65`, `:166-179` |

La lista cerrada de hosts (`unpkg.com`, `cdn.jsdelivr.net`, `jsdelivr.net`, `cdnjs.cloudflare.com`, `esm.sh`, `skypack.dev`, `cdn.skypack.dev`, `raw.githubusercontent.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `ajax.googleapis.com`) está en `scripts/lint-prohibited.mjs:44-56`.

#### Detalles que importan al interpretar la salida

- **Solo revisa extensiones de texto** (`:33`), así que las fuentes `.woff2` y los `.png` no cuentan en el recuento de ficheros.
- El **único fichero exento de la regla de color** es `src/styles/tokens.css` (`:30`, `:125`), porque es «la única fuente de color y degradados» (RNF-18).
- **`fetch` sí está permitido en el arnés E2E**: el escáner solo recorre `src/` (`:182-190`); por eso `e2e/fixtures/extension.ts:628` puede usar `fetch` para contrastar contra el nodo.
- **Sale con `exit 1`** si hay algún hallazgo, listando `ruta:línea: mensaje` (`:206-210`).
- Evidencia de H6: «src/: 150 ficheros revisados», «dist/: 14 ficheros revisados (0 URLs de CDN exigido por CA-RT-05)» y el bloque final `OK: sin dependencias prohibidas, sin fetch propio, sin chrome.storage.sync, sin prefijo codecrypto_, sin colores fuera de tokens.css y sin ethers en el popup` (`RepoTecnico/evidencia/H6/lint-prohibited-2026-09-12.log`).

### `npm run check:mermaid`

#### Los dos modos y las reglas permanentes

`scripts/check-mermaid.mjs` (322 líneas) valida los bloques Mermaid del directorio que recibe por argumento —en `package.json:15` es **`RepoTecnico`**—. **MODO A (real)**: `mermaid.parse()` de mermaid 11 sobre cada bloque con `jsdom` aportando el DOM (`:233-267`, `:302-311`); si un bloque no parsea, el comando termina con **exit 1**. **MODO B (estructural, respaldo)**: solo si `mermaid` no puede inicializarse; valida cerca abre/cierra, tipo declarado y reconocido, participantes de `sequenceDiagram` declarados antes de usarse, ausencia de `;` en el texto de un mensaje y ausencia de `:` en etiquetas de `stateDiagram-v2`. Reglas **siempre** activas: el carácter `;` dentro del texto de un mensaje de `sequenceDiagram` es **error en ambos modos** (`:16-17`, `:198-200`); un bloque sin cerrar es error inmediato (`:140-142`); un tipo de diagrama no reconocido es error (`:165-167`) contra la lista de 30 tipos de las líneas 28-59. `TK_MERMAID_STRUCTURAL=1` fuerza el MODO B (`:231-233`). Evidencia de H6: `[check:mermaid] OK: 27/27 bloques validos.` (`RepoTecnico/evidencia/H6/check-mermaid-2026-09-12.log`), con avisos (no errores) sobre `:` en etiquetas de `documento_tecnico.md`.

### El gate documental `src/docs.spec.ts`

#### Qué audita

`src/docs.spec.ts` (136 líneas) es una **prueba de Vitest** —no un script— que audita el árbol de `src/`. Su cabecera (`:1-16`) declara el contrato: **todo módulo de `src/`** debe abrir con un bloque **JSDoc de contrato** que declare (a) su identificador de módulo en la forma `M<numero>` (rango **M1..M66**, `:24-25` y `:46-47`) y (b) al menos una referencia de requisito real (`RF-xx`, `RNF-xx` o `RT-xx`, `:44`).

#### Las reglas de forma

`src/docs.spec.ts:20-28`: «abre con un bloque JSDoc» significa **antes de la primera sentencia o declaración**, admitiendo delante comentarios `//` y líneas en blanco (y BOM opcional), implementado en `firstJsDocBlock()` (`:75-88`); el identificador debe estar en el rango **M1..M66** y «un `M99` inventado no pasa» (`:99-104`); y el universo son **todos** los `.ts` y `.tsx` de `src/`, a cualquier profundidad, **incluidos los `*.spec.ts`** y el propio fichero (`:26-28`, `:50`).

#### Cuántos ficheros y cuántas comprobaciones

La estructura del spec produce **una prueba por fichero más tres pruebas agregadas** (los tres `it` de `:114-134` y el `it.each(FILES)` de `:125`). La evidencia archivada de H6 registra el resultado real: `✓ src/docs.spec.ts (148 tests)` con `Tests 148 passed (148)` (`RepoTecnico/evidencia/H6/docs-spec-2026-09-12.log`). Es decir, **148 comprobaciones = 145 ficheros auditados + 3 agregadas**. *Nota de esta lectura:* hoy `src/` contiene **154 ficheros `.ts`/`.tsx`** (contados por extensión), así que una ejecución actual produciría **157** comprobaciones; el aumento corresponde a los módulos y specs añadidos en la Fase 4. Es un **conteo estático**, no una ejecución — **pendiente de confirmar** con `npm test`.

#### Qué se rompe si el gate falla

El spec es **falsable y nombra el fichero**: si un módulo entra sin cabecera, o si alguien borra el identificador o la referencia de requisito, la prueba falla indicando `fichero: problemas` (`:125-135`). Es el mecanismo que sostiene la trazabilidad de cada fichero hasta `documento_tecnico.md` §2.4 y hasta el Anexo A de `requerimientos.md` (`:9-13`).

## Cómo se interpreta la evidencia

### Estructura de `RepoTecnico/evidencia/`

#### Carpetas y qué contienen

`README.md:185` describe el propósito: «Toda la evidencia de ejecución se archiva por hito en **`RepoTecnico/evidencia/H1 … H6`**: log de cada comando, informe JSON de Playwright, capturas, volcados de cobertura y un **acta** (`ACTA_H1.md` … `ACTA_H6.md`) con la tabla de comandos y su resultado real». La Fase 4 añade `RepoTecnico/evidencia/Fase4/` (`INFORME_PRUEBAS_FASE4.md:105`).

| Carpeta | Contenido |
|---|---|
| `H1` | Andamiaje, build MV3 y arnés: `build-2026-09-11.log`, `typecheck-*.log`, `lint-prohibited-*.log`, `playwright-*.log`, `manifest-2026-09-11.json`, `e2e-global-setup-*.{log,json}`, `diagnostico-*.log`, `ACTA_H1.md` |
| `H2` … `H5` | Cartera/cuentas/recepción/reset (`vitest-*.log`, `coverage-*.json`, capturas PNG); provider y conexión (`cast-*.log`, JSON por spec); firma y transacciones (`RESULTADO-H4-*.json`, `extremo-a-extremo-*`, `forge-*.log`); redes y registro (`12-redes`, `15-logs`, `logs-export`) |
| `H6` | Identidad visual, accesibilidad y entrega: `instalacion-2026-09-12.md`, `wsl2-no-disponible-*.log`, `build-windows-*.log`, `npm-ci-*.log`, `tiempos-instalacion-*.txt`, `docs-spec-*.log`, `e2e-cierre-*.{log,json}`, `ACTA_H6.md` |
| `Fase4` | Cierre de pruebas: `coverage-fase4-cierre.log`, `e2e-cierre-fase4.log`, `e2e-2026-09-13.json`, `vitest-cierre-fase4.log`, `forge-cierre-fase4.log`, `resumen-e2e-fase4.md`, `e2e-fase4-final.txt`, más los JSON y PNG por spec y los diagnósticos de defectos (`DEFECTO-01-popup-send-4200.txt`, `sonda-envio-popup.txt`) |

#### Qué se busca en cada tipo de fichero

| Sufijo | Qué es | Qué se busca en él |
|---|---|---|
| `*.log` | Salida literal de un comando | El resumen de la herramienta: `Tests N passed`, `Suite result: ok`, `✓ built in`, `OK: …` |
| `*.json` | Registro estructurado (Playwright, `globalSetup`, cobertura) | Los campos de entorno (`plazosInyectados`, `anvil.disponible`), el `status` por prueba y los contadores de cobertura |
| `*.png` / `ACTA_H*.md` / `*.txt` | Captura de una superficie / acta del hito / notas y sondas de diagnóstico | La evidencia visual, la tabla de comandos con su resultado real y el síntoma medido antes de corregir un defecto |

### Ficheros concretos que conviene leer

#### Tres lecturas recomendadas

1. **`RepoTecnico/evidencia/H6/build-windows-2026-09-12.log`** — prueba documental del pipeline: lista los HTML emitidos bajo `dist/src/`, los *bundles* de página con su tamaño, `background.js` y el cierre `✓ built in 7.93s` seguido de `[manifest] dist/manifest.json generado (version 1.0.0).`
2. **`RepoTecnico/evidencia/H6/docs-spec-2026-09-12.log`** — registra `src/docs.spec.ts (148 tests)` y `Tests 148 passed (148)`; es la evidencia del gate documental y la que fija el par 145 ficheros / 148 comprobaciones.
3. **`RepoTecnico/evidencia/Fase4/coverage-fase4-cierre.log`** — informe de cobertura por carpeta; en su cola se leen las filas de `src/shared/validation` (ramas **93,13**) y las de `src/popup/views` con **0 %** de líneas, que es el límite declarado en `INFORME_PRUEBAS_FASE4.md:590-602`.

#### Dos más, si se busca el entorno de la corrida

- **`RepoTecnico/evidencia/H6/e2e-global-setup-2026-09-12.json`** (y su `.log`): contiene el registro del `globalSetup` descrito arriba; es el primer fichero que hay que abrir cuando una corrida E2E «falla raro».
- **`RepoTecnico/evidencia/H6/wsl2-no-disponible-2026-09-12.log`**: fichero en **UTF-16** con la salida de `wsl -l -v` — «Subsistema de Windows para Linux no tiene distribuciones instaladas» y `exit code de wsl -l -v: -1`; es la evidencia de por qué RNF-15 está pendiente (para leerlo en PowerShell hace falta `-Encoding Unicode`).

### Reglas de honestidad al interpretar la evidencia

#### Lo que el proyecto declara

- Las cifras de cierre provienen de **ventanas limpias**: `INFORME_PRUEBAS_FASE4.md:117-119` («Cifras reales, no inventadas») y `:614-633`, donde se **conservan** dos fallos intermitentes medidos en lugar de borrarlos.
- **Prohibido desactivar, saltar o relajar pruebas**: `INFORME_PRUEBAS_FASE4.md:109-111` aclara que los únicos `test.skip` son el guardián `!distDisponible()` de los specs que necesitan la extensión compilada.
- **No se escribe en el repositorio mientras la suite E2E corre** (`INFORME_PRUEBAS_FASE4.md:630-633`): es la regla operativa que separa «84 passed» de «37 fallos por `ERR_CONNECTION_REFUSED`».
- **Una suite pesada a la vez**: Vitest y `test:e2e` no se solapan porque comparten `dist/`, `test-results/` y la carpeta de evidencia (`INFORME_PRUEBAS_FASE4.md:114-116`).

#### Lo que NO debe deducirse

No debe deducirse que **todo** esté verificado: `INFORME_PRUEBAS_FASE4.md:568-573` mantiene abiertas **RNF-15** («verificado solo en Windows; pendiente en Linux», sin WSL2 ni CI en el equipo) y el **ensayo del Perfil B** («no verificado de forma independiente», porque un ensayo válido exige un sujeto externo); y `:582-588` declara que el **aviso nativo de permisos de host** de Chrome **no es verificable en headless**, de modo que el alta de red iniciada desde el popup queda **NO VERIFICADA**.

## Trazabilidad de las cifras

### Tabla consolidada (cifras declaradas por el proyecto)

| Suite / puerta | Cifra declarada | Fichero que la declara | Evidencia citada por el proyecto |
|---|---|---|---|
| Vitest (`npm run test`) | **1185 passed / 71 ficheros** | `RepoTecnico/estado_proyecto.md:215` | `evidencia/Fase4/coverage-fase4-cierre.log` |
| Cobertura (`npm run coverage`) | Global **86,11 %**; `crypto/` **86,98 %**; `approvals/` **95,60 %**; `validation/` **93,13 %** | `RepoTecnico/estado_proyecto.md:216` | `evidencia/Fase4/coverage-fase4-cierre.log`, `coverage/coverage-summary.json` |
| Playwright (`npm run test:e2e`) | **84 passed / 0 failed / 0 flaky · 33 specs** | `RepoTecnico/estado_proyecto.md:217` | `evidencia/Fase4/e2e-cierre-fase4.log`, `e2e-2026-09-13.json` |
| Forge (`forge test --root contracts`) | **30 passed / 0 failed · 2 suites** | `RepoTecnico/estado_proyecto.md:218` | `evidencia/Fase4/forge-2026-09-12.log` |
| `npx tsc -b` / `npm run build` / `npm run lint:prohibited` | **exit 0** / **exit 0** (6 entradas + manifest) / **exit 0 · 0 hallazgos** | `RepoTecnico/estado_proyecto.md:219-221` | salida de la puerta de cierre |

### Qué ha verificado esta lectura y qué no

#### Verificado leyendo ficheros (conteo estático)

Que existen **71 ficheros de spec** (60 en `src/` + 11 en `test/oracle/`); que el árbol `e2e/` tiene **34 ficheros `*.spec.ts`** con **84 bloques `test(`** (33 de producto con 83 pruebas + `90-sonda.spec.ts` con 1), de modo que la cifra declarada de pruebas E2E (84) es exacta pero la de ficheros (33) excluye la sonda; que los logs archivados **leídos** dicen lo que este manual dice de ellos (`docs-spec` 148 pruebas, `lint:prohibited` 150 ficheros de `src/` y 14 de `dist/`, `check:mermaid` 27/27 bloques, `forge` 10 passed en H6, `vitest` 1076 passed / 63 ficheros en H6 y `build` con las seis entradas); y que los **umbrales** declarados (70 % global, 80 % en los tres ámbitos) son los de `vite.config.ts:226-231`.

#### NO verificado

- **No se ha ejecutado ninguna suite** en esta sesión: los totales de 1185 / 84 / 30 y las coberturas de cierre son **cifras declaradas por la documentación del proyecto**, no medidas aquí.
- Los logs de **H6** corresponden a un momento anterior al cierre de la Fase 4 (por eso `vitest` marca 1076/63 y no 1185/71); el log de cierre que el proyecto cita es `RepoTecnico/evidencia/Fase4/coverage-fase4-cierre.log`, del que esta lectura solo ha inspeccionado la **cola** del informe de cobertura.
- El detalle de `RepoTecnico/evidencia/Fase4/e2e-2026-09-13.json` (informe JSON de Playwright, una entrada por prueba) **no se ha abierto aquí**; su estructura está garantizada por `playwright.config.ts:59` e `INFORME_PRUEBAS_FASE4.md:217`.
