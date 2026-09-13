# Manual de defectos corregidos de TrueKeate Wallet

Propósito: dejar constancia **verificable** de cómo se registraron, diagnosticaron y corrigieron los defectos del proyecto —los **15** de la Fase 4 (Pruebas) más los **4** de concurrencia y retención, los **12 residuales `R-01..R-12`** y las **18 contradicciones** de la Fase 2 (Auditoría), y las **desviaciones de los hitos H1..H6**—, agrupándolos además por **causa raíz** para que sirvan de patrón reutilizable.

> **Método y límites.** Todo se ha extraído **leyendo** `RepoTecnico/INFORME_PRUEBAS_FASE4.md`, `RepoTecnico/VEREDICTO_FASE2_V1.md`, `RepoTecnico/plan_desarrollo.md`, `RepoTecnico/estado_proyecto.md` y `RepoTecnico/evidencia/**`. **No se ha ejecutado ningún build ni test**: los recuentos finales de suites y cobertura se citan **como declarados en la documentación**, no re-verificados por el autor de este manual. Cuando un dato no aparece en las fuentes se escribe «**pendiente de confirmar**» en lugar de rellenarlo.

## Cómo se registraron los defectos

### El ciclo real de una pasada de pruebas

El proceso no fue «probar y arreglar», sino un ciclo documental de cinco pasos repetido en cada fase y cada hito: **batería de comandos** con `exit code` observado y log archivado → **informe de pruebas** con formato obligatorio → **acta por hito** → **corrección con spec de regresión** → **evidencia archivada**, incluidos los intentos fallidos.

### La regla de la batería en rojo/verde

`INFORME_PRUEBAS_FASE4.md:112` fija la regla: «Ningún fallo se resolvió declarándolo "entorno": se buscó la causa raíz con su `archivo:línea`, se corrigió y se añadió la prueba de regresión». El patrón «rojo primero» aparece medido y archivado en varios casos: la primera pasada de `lint:prohibited` en H6 salió **exit 1 con 33 hallazgos** (`plan_desarrollo.md:748`); la primera batería E2E de cierre de H6 cerró en **68 passed / 8 failed** por contaminación concurrente y el intento se conservó (`plan_desarrollo.md:755`); y el defecto crítico del popup se archivó **antes** de corregirlo con su sonda en crudo (`resumen-e2e-fase4.md:24`).

### El informe de pruebas y el acta por hito

`INFORME_PRUEBAS_FASE4.md` (746 líneas) es el informe consolidado: resumen global (`:19`), metodología (`:85`), resultados por suite (`:129`), los defectos (`:190`), los casos adversarios de Forge (`:453`), la trazabilidad por `CA-RF-*` (`:492`) y las limitaciones declaradas (`:577`). El formato de cada defecto es fijo y está declarado en `:192-195`: **(a) síntoma**, **(b) causa raíz** con `archivo:línea`, **(c) solución aplicada** y **(d) test que lo reveló**. Las actas por hito viven en `RepoTecnico/evidencia/H1..H6/ACTA_H*.md`.

### La evidencia por defecto

| Tipo | Ejemplo real | Uso |
|---|---|---|
| Texto en crudo | `RepoTecnico/evidencia/Fase4/DEFECTO-01-popup-send-4200.txt` | Salida literal de la sonda que reveló el defecto |
| Log de comando | `coverage-fase4-cierre.log`, `vitest-cierre-fase4.log`, `e2e-cierre-fase4.log`, `forge-cierre-fase4.log` | Cifras de la batería de cierre |
| JSON / PNG por spec | `10-aprobar-tx-2026-09-13.png`, `34-revelado-plazo-30s-2026-09-13.json` | Resultado observable de un flujo |
| Resumen de fase | `resumen-e2e-fase4.md` | Síntesis del frente E2E con sus defectos 1, 2 y 3 |
| Intento fallido conservado | `e2e-baseline-FALLO-servidor-dapp-caido.json`, `e2e-intento1-contaminado-2026-09-12.log` | Prueba del estado previo, **no borrada** |

El contenido de `DEFECTO-01-popup-send-4200.txt` es la traza literal de la sonda: `SONDA-E ventana: NINGUNA`, `SONDA-E ventanas de decisión: 0`, `SONDA-E cola persistida: {}`, `SONDA-E pendientes: 0` y la entrada `["rpc_error","eth_sendTransaction","warn",{"code":4200,…}]`.

### La corrección con spec de regresión, y lo que nunca se hizo

Cada defecto cierra con la prueba que lo fija: `src/shared/qrMask.spec.ts` (D-01), `src/background/approvals/approvalRateWindow.spec.ts` (D-03, D-04), `src/background/accountsRef.spec.ts` (D-05, D-06, D-07), `src/background/crypto/integrityHoles.spec.ts` (D-07, D-08), `src/background/security/redactionDeep.spec.ts` y `logRedaction.spec.ts` (D-12), `e2e/33-envio-desde-el-popup.spec.ts` (D-13) y `e2e/24-accesibilidad.spec.ts` (D-14).

`INFORME_PRUEBAS_FASE4.md:109-111` y `:123-125` declaran tres prohibiciones: **no** desactivar, saltar ni relajar pruebas (los únicos `test.skip` son el guardián `!distDisponible()`, previo y estándar); **no** «arreglar» cambiando el test hacia lo que el código hace —cuando corpus y código discrepaban se alineó **el código** y, si el test afirmaba lo contrario, se corrigió el test **en la dirección del corpus** dejando el motivo escrito—; y **no** inventar literales: toda causa nueva se registró en `diccionario_datos.md` §4.3 y se transcribió en `src/background/rpc/errors.ts`.

## Defectos de la Fase 4

El informe declara **15 defectos** (`INFORME_PRUEBAS_FASE4.md:5`, `:194-195`), etiquetados `D-01`..`D-14` más `D-15a`/`D-15b`, que **cuentan como uno solo** (`:195`). **Encontrados realmente en el informe: 16 etiquetas `###`, 15 defectos**, más **4** adicionales de concurrencia y retención (`C-1..C-4`, `:434-444`) que el propio informe declara fuera de la lista de 15. Total del expediente: **19 defectos medidos y corregidos**.

### Los 12 defectos de las pruebas unitarias (`D-01`..`D-12`)

#### D-01 — La máscara QR no acumulaba la regla 1 de ISO/IEC 18004

**Síntoma:** el QR seguía siendo decodificable, pero la máscara elegida no era la del estándar; medido: una matriz 21×21 toda oscura penalizaba **1300** donde el estándar manda **2098**. **Causa raíz:** `src/shared/qr.ts:480` — las dos pasadas de `runPenalty` descartaban el valor devuelto. **Corrección:** las dos pasadas **acumulan** (`penalty += runPenalty(...)`) en `src/shared/qr.ts:485-490`. **Regresión:** `src/shared/qrMask.spec.ts`, que reimplementa las cuatro reglas del estándar **con independencia del codificador** y compara con el argmin calculado fuera del módulo (7 pruebas, `INFORME_PRUEBAS_FASE4.md:135`).

#### D-02 — `padEnd(18)` sin truncar en `validation/amount.ts`

**Síntoma:** con `maxDecimals = 19`, `0.0000000000000000009` devolvía **9 wei** (lo correcto: **0**) y `1.0000000000000000001` devolvía `1e18 + 1`. **Causa raíz:** `src/shared/validation/amount.ts:73` — `fractionPart.padEnd(ETH_DECIMALS, '0')` no recorta y `BigInt` reinterpretaba la fracción como una magnitud 10^(n−18) veces mayor. **Corrección:** truncado hacia abajo con `fractionPart.slice(0, ETH_DECIMALS).padEnd(ETH_DECIMALS, '0')`; la cota de decimales aceptados se aplica **antes**. **Regresión:** `src/shared/validation/validation.spec.ts` — «un `maxDecimals` mayor que los 18 decimales de wei TRUNCA, no reescala la magnitud», con tres magnitudes de frontera.

#### D-03 — `normalizeRateWindow` no reiniciaba `approvalsInWindow`

**Síntoma:** la **primera** solicitud aprobable de una ventana nueva se rechazaba con `4001` y el origen quedaba bloqueado hasta la purga por inactividad de **10 min**. **Causa raíz:** `src/background/rpc/rateLimit.ts:120-134` — al vencer la ventana se reiniciaban `tokens` y `approvalWindowStart` pero **no** `approvalsInWindow`, que se quedaba en 6 para siempre. **Corrección:** el reinicio deja también `approvalsInWindow = 0`, como exige `diccionario_datos.md` §2.13 regla (4). **Regresión:** `src/background/approvals/approvalRateWindow.spec.ts` (8 pruebas).

#### D-04 — El contador de aprobables se incrementaba dos veces

**Síntoma:** el límite efectivo era de **3 aprobaciones por minuto** en vez de 6, y cualquier lectura previa lo agotaba. **Causa raíz:** `src/background/rpc/rateLimit.ts:155-163` — `consumeRateWindow` incrementaba el contador en **toda** llamada permitida (también lecturas) y la misma llamada aprobable lo incrementaba otra vez en `enqueueApprovalRequest`. **Corrección:** el contador pertenece a la **cola**; `consumeRateWindow` ya no lo toca y solo `normalizeRateWindow` lo reinicia al vencer. **Regresión:** `approvalRateWindow.spec.ts`.

#### D-05 — `parseAccountRef` no validaba la forma

**Síntoma:** `'idx:'` resolvía a la **cuenta 0** y `'idx:1e1'` a la **cuenta 10**; además `'9999999999'` se aceptaba mientras `'idx:9999999999'` se rechazaba. **Causa raíz:** `src/background/accounts.ts:97-102` — el cuerpo se convertía con `Number()`, que no es una validación de forma (`Number('') === 0`, `Number('1e1') === 10`, `Number('0x10') === 16`). **Corrección:** ambas ramas exigen `^\d+$` y pasan por `isValidDerivationIndex`; cualquier otra forma devuelve `null` → `-32602 unknownAccount`. **Regresión:** `src/background/accountsRef.spec.ts`.

#### D-06 — La importación persistía etiquetas que `renameAccount` rechaza

**Síntoma:** una etiqueta de 33 caracteres se **persistía** al importar y `renameAccount` la rechazaba con `-32602 invalidLabel`: dos caminos con la misma regla y distinto resultado. **Causa raíz:** `src/background/accounts.ts:576-580` — la importación solo miraba `check.label.length > 0`, sin comprobar `check.valid`. **Corrección:** se aplica la **misma** `validateLabel` que el renombrado; etiqueta ausente o vacía sigue significando «usa la de por defecto» (`Importada N`). **Regresión:** `accountsRef.spec.ts`.

#### D-07 — 🔴 Hueco no-cadena en `truekeate_accounts`: el revelado entregaba la clave de OTRA cuenta

> El informe lo marca como **el defecto más grave de la fase** (`INFORME_PRUEBAS_FASE4.md:279`).

**Síntoma:** con `truekeate_accounts = [A0, A1, null, A3]`, `wallet_revealSecret('idx:2')` entregaba la **clave privada de `A2`** bajo la **dirección `A3`**: el usuario veía una dirección y copiaba la clave de otra. **Causa raíz (dos capas):** `src/background/accounts.ts:154-175` — `sanitizeAccounts` descartaba las entradas no-cadena y **compactaba** la lista, y como el índice del array **ES** el índice BIP-44, `A3` pasaba a la posición 2; y `src/background/crypto/integrity.ts:98-107` — `readAddressList` **filtraba** las no-cadena, con lo que el hueco desaparecía del informe y los índices de los avisos se desplazaban. **Corrección (fallo CERRADO, sin corrección silenciosa):** una lista con hueco se trata como cartera **dañada** (RNF-22): `sanitizeAccounts` devuelve `[]` y M13 la marca como dañada; `readAddressList` **conserva las posiciones** representando el hueco con cadena vacía. Sin cuentas, toda referencia `idx:` responde `-32602 unknownAccount` en lugar de revelar la clave de otra cuenta. **Regresión:** `src/background/crypto/integrityHoles.spec.ts` (6 pruebas) y `accountsRef.spec.ts`.

#### D-08 — El informe de integridad decía `ok` con una importada ya descartada

**Síntoma:** una cuenta importada con `privateKey` no utilizable desaparecía de la cartera —no se listaba, no firmaba, no se podía borrar— y el informe seguía diciendo `ok`. **Causa raíz:** `src/background/crypto/integrity.ts:191-196` — la rama de `privateKey` no cadena se **saltaba en silencio**, mientras `sanitizeImportedAccounts` (M28) descartaba la entrada. **Corrección:** se emite el aviso `imported-key-mismatch` con su mensaje y su dirección, de modo que el informe **refleja** la corrupción. **Regresión:** `integrityHoles.spec.ts`.

#### D-09 — `toChainIdNumber` truncaba y emitía `'0x-5'`

**Síntoma:** `'1.5' → 1`, `'31337abc' → 31337` y `'-5' → -5`; el último producía además `chainIdHexOf(-5) === '0x-5'`, que **no es un hexadecimal válido**. **Causa raíz:** `src/background/crypto/sign.ts:123-132` — la rama de cadena usaba `Number.parseInt` sin comprobar la forma, mientras la propia spec del módulo ya exigía lo contrario para los números. **Corrección:** la cadena debe ser un entero decimal o hexadecimal **completo** (`parseChainIdOrNull`); lo demás cae al `chainId` por defecto (31337) y `chainIdHexOf` nunca emite una forma inválida. **Regresión:** `src/background/crypto/sign.spec.ts` y `eip155.spec.ts`.

#### D-10 — `domainChainMismatch` no se activaba con un `chainId` ininterpretable

**Síntoma:** con `domain.chainId` basura (`'no-es-un-numero'`, `''`, `'0x'`) y la red por defecto activa, **no** se emitía el aviso destacado ni la doble confirmación obligatoria. **Causa raíz:** `src/background/approvals/preview.ts:429-441` — la comparación usaba `toChainIdNumber` en ambos lados, y esa función cae al `chainId` por defecto: `31337 === 31337` → `domainChainMismatch: false`. **Corrección:** se compara con `parseChainIdOrNull` en los dos lados y un `chainId` declarado e **ininterpretable cuenta como discrepancia** (falla seguro); «ausente» sigue sin ser discrepancia. **Regresión:** `src/background/approvals/dispatch.spec.ts` y `productionWiring.spec.ts`.

#### D-11 — `localLabelFor` buscaba una dirección en el mapa de índices BIP-44

**Síntoma:** `toLabel` valía **«desconocido»** incluso para una cuenta propia y etiquetada, y la vista previa añadía el aviso «Destino sin etiqueta». **Causa raíz:** `src/background/approvals/dispatch.ts:324-333` — se indexaba `truekeate_settings.accountLabels` por **dirección**, pero ese mapa tiene el **índice BIP-44** como clave (`Record<number, string>`): `accountLabels['0x7099…']` no existe **nunca**. **Corrección:** se resuelve la etiqueta efectiva con `buildAccountViews`, el mismo mapa dirección → etiqueta que usa la ventana de decisión. **Regresión:** `dispatch.spec.ts`.

#### D-12 — 🔒 Privacidad: firma completa persistida, `privKey`/`seedWords` sin redactar y calldata sin truncar

**Síntoma (tres manifestaciones del mismo hueco, agrupadas como UN defecto):** `{ signature: { r, s, v } }` se persistía con `r` y `s` **completos**; `privKey` o `accountPrivateKey` **no** casaban con `privatekey` y la clave privada se persistía **íntegra** en `truekeate_logs` (exportable en JSON); y `{ txData: CALLDATA }` se persistía **completo**. **Causa raíz:** `src/background/security/redaction.ts:160-171` — la rama de objeto miraba solo la clave hija sin propagar el contexto de firma del padre; `redaction.ts:48-60` — la lista de tokens se consultaba con `includes` sobre la clave **exacta**, no por contención; `src/background/logging/logger.ts:266-276` — la lista de claves de calldata era de **igualdad exacta**. **Corrección:** se propaga `signatureContext` a los hijos; la lista de tokens se consulta por **contención**; y la cota de calldata usa un patrón cerrado pero realista (`txdata`, `inputdata`, `rawdata`, `hexdata`, `bytedata`, `calldatahex`, `transactiondata`), sin llegar a «cualquier clave que acabe en `data`» (`metadata` no es calldata). **Regresión:** `src/background/security/redactionDeep.spec.ts` (21 pruebas), `src/background/logging/logRedaction.spec.ts` (8), `src/background/crypto/revealHygiene.spec.ts` (14) y `secretsExport.spec.ts`.

### El defecto de producto y el de arnés del extremo a extremo

#### D-13 — 🔴 El popup no podía enviar nada (`4200`, sin ventana, cola vacía)

**Síntoma:** al pulsar «Enviar» en el popup, `eth_sendTransaction` respondía **`4200`**, **no se abría la ventana única** y `truekeate_pending_requests` quedaba **vacía** (`INFORME_PRUEBAS_FASE4.md:379-381`). **Causa raíz (dos capas, ambas necesarias):** `src/background/rpc/router.ts:595` — `entry.requiresApproval && !context.isExtensionContext` **saltaba la ruta aprobable para TODO contexto de extensión**; y `src/background/approvals/dispatch.ts:239` — `resolveApprovalOrigin` exigía una **sesión de dApp** para `context.origin`, y el popup no tiene sesión. **Corrección:** el contexto de extensión despacha también la ruta aprobable **salvo** `wallet_revokePermissions` (cuya confirmación es la UI de «Sitios conectados», RF-26); `resolveApprovalOrigin` firma en el popup con la **cuenta activa** y el nuevo `assertWalletAccount` (`dispatch.ts:767`) exige que la cuenta pedida **pertenezca a la cartera**. **Regresión:** `e2e/33-envio-desde-el-popup.spec.ts` (3 pruebas) — el recibo del nodo es `status 1`, tanto a dirección externa como entre cuentas propias.

#### D-14 — Aserción de zoom intermitente en el arnés de accesibilidad

**Síntoma:** `Expected: 93, Received: 98` en «el zoom no puede vaciar el DOM», de forma intermitente según la carga de la máquina. **Causa raíz:** `e2e/24-accesibilidad.spec.ts:222` — las dos cuentas de nodos se tomaban en **dos `evaluate` distintos**, así que un re-render del popup (polling de saldos, M47) se colaba entre ambas medidas. **Corrección:** las dos medidas se toman dentro de un **único bloque síncrono**. **La aserción es la misma: no se relajó.** **Regresión:** el propio `24-accesibilidad.spec.ts`.

### Los dos defectos documentales del contrato Forge

#### D-15a — El `README` citaba un `recoverSigner` inexistente

**Síntoma:** `contracts/README.md` documentaba una API (`recoverSigner`) que **no existe** en el contrato: un `grep` de `recoverSigner` sobre `contracts/` solo devolvía el propio README. **Causa raíz:** el README se escribió describiendo una versión **previa** del contrato y no se actualizó al renombrarse el envoltorio a `recover`. **Corrección:** el README cita ahora `recover(bytes32,bytes)` y anota expresamente la corrección. **Impacto declarado:** **nulo en seguridad** (ninguna llamada en código a ese nombre); real en **trazabilidad**. **Prueba que lo reveló:** `forge test --root contracts` más inspección `grep` del contrato.

#### D-15b — El comentario de `s` era impreciso respecto de `s > n/2`

**Síntoma:** el comentario de `_SECP256K1N_HALF` decía «`s` debe ser estrictamente menor», pero la guarda real admite `s = n/2` exacto. **Causa raíz:** imprecisión del comentario y del README, **no del código**: EIP-2 y el `ECDSA.recover` de OpenZeppelin usan `s > HALF_ORDER`. **Corrección:** nota «Frontera EIP-2» añadida a `contracts/README.md` con la frontera exacta. **Prueba que lo reveló:** `testF4_FronterasDeSSeRechazan` (`EIP712VerifierFase4Test`).

### Los 4 defectos de concurrencia y retención

No estaban en la lista de 15, pero son defectos medidos y corregidos en la misma pasada, con su prueba (`INFORME_PRUEBAS_FASE4.md:434-444`):

| # | Síntoma | Causa raíz | Solución | Prueba |
|---|---|---|---|---|
| C-1 | Dos `touchSession` simultáneos de orígenes distintos **perdían** una renovación (y una pestaña, o una revocación) | `src/background/sessions.ts:48` — RMW **sin cerrojo**: `readStorage` → mutar → `writeStorage` partía de la misma instantánea | Cerrojo FIFO `sessionsLock` (`withSessionsLock`) en `touchSession`, `connectSession`, `revokeSession`, `rememberTab` y `applyActiveAccountToSessions` | `src/background/sessions.spec.ts` (4 pruebas nuevas) |
| C-2 | Dos altas simultáneas del **mismo origen** creaban **dos** solicitudes y dos ventanas; la segunda escritura **borraba** el mapa de la primera | `src/background/connections.ts:84` — RMW sin cerrojo en `openConnectWindow` y `applyConnectResponse` | Cerrojo `connectRequestsLock` con el tramo crítico **completo**: leer + comprobar «1 pending por origen» + escribir | `src/background/connections.spec.ts` (2 pruebas) |
| C-3 | `truekeate_connect_request` **nunca se purgaba**: toda solicitud sin decidir se quedaba para siempre, con su origen y su lista de cuentas | `src/background/connections.ts:245` — solo se borraba la entrada que `applyConnectResponse` resolvía | **Doble motivo de purga**: por **vencimiento** (`planConnectRequestPurge`) y **al resolver** | `src/background/connections.spec.ts` (5 pruebas) |
| C-4 | Comprobar «máximo 1 pending por origen» **fuera** del cerrojo no bastaba: el cerrojo serializaba las escrituras, no la **decisión** | `src/background/connections.ts:495` — comprobación y alta eran dos tramos críticos distintos | Un **único** tramo crítico que lee, purga, comprueba y escribe; la segunda alta responde `4001` sin abrir ventana | `src/background/connections.spec.ts` |

Además, el cerrojo FIFO se extrajo a un módulo reutilizable **`src/background/state/serialLock.ts`** (identificado como M33.b) para que M14, M26 y el módulo de conexiones usen **la misma** implementación en vez de tres copias; `approvals/queue.ts` lo **reexporta** sin cambiar ningún nombre (`INFORME_PRUEBAS_FASE4.md:446-449`).

### Recuento real de lo encontrado

- **15 defectos** en la lista oficial (`D-01`..`D-14` + `D-15a`/`D-15b` contando como uno).
- **4 defectos adicionales** de concurrencia y retención (`C-1`..`C-4`), declarados aparte.
- **Total: 19** defectos medidos con síntoma, causa raíz con `archivo:línea`, solución y prueba.
- **0 pruebas** desactivadas, saltadas o relajadas para llegar a verde.
- **3** son de **arnés/entorno** y se declaran como tales, no como defectos del producto: D-14, más los dos fallos intermitentes de `INFORME_PRUEBAS_FASE4.md:614-633` (el `locator.click` de `09-conectar` bajo carga y los 37 `ERR_CONNECTION_REFUSED` cuando el `webServer` de la dApp muere por escrituras en el árbol vigilado).

## Hallazgos residuales de la Fase 2

Fuente: `RepoTecnico/VEREDICTO_FASE2_V1.md` **v1.3**. Es un **documento de cierre**, no un registro histórico. Ámbito declarado: las líneas de §3 y §4 corresponden al estado **previo** a la ejecución; §6 y §7, al **posterior** (`VEREDICTO_FASE2_V1.md:246`).

### Los 12 residuales `R-01..R-12`

Severidades declaradas: **3 ALTA · 8 MEDIA · 1 BAJA** (`VEREDICTO_FASE2_V1.md:34`, `:141-147`).

| ID | Sev. | Descripción | Estado real | Evidencia de cierre |
|---|---|---|---|---|
| R-01 | ALTA | Dos modelos de tabla de errores: §2.1 «un mensaje por código» frente a §4.3 «un mensaje por causa»; 28 citas de CU apuntaban a §2.1 | ✅ **Cerrado** (v1.7) | §2.1 pasa a catálogo de códigos y significado y remite a §4.3 como **fuente única de literales**; 28 citas redirigidas (`:252`) |
| R-02 | ALTA | El catálogo de eventos es de **24**, pero subsistían tres restos de «23» y `requerimientos.md` §2.2 no listaba `storage_quota_exceeded` | ✅ **Cerrado** (v1.7) | §2.2 y M31 listan los 24; `casos_uso.md` v1.3 cita «24 eventos» (`:253`) |
| R-03 | ALTA | «El puerto de larga vida **mantiene vivo** el SW» es **falso en MV3** y no falsable; el técnico lo corregía y los demás documentos no | ✅ **Cerrado** | «tras 30 s de inactividad, un `RESUME` con el mismo `approvalId` responde en **< 200 ms**» + «el puerto **no** garantiza la vida del SW» (`:254`) |
| R-04 | MEDIA | Subsistía «una sola ventana **por origen**» frente a P-21/DEC-38 (ventana única global con cola y contador) | ✅ **Cerrado** | `diagramas.md` v1.1 y `documento_tecnico.md` v1.2 dibujan la ventana única global (`:255`) |
| R-05 | MEDIA | `estado_proyecto.md` §2 declaraba versiones desactualizadas de **6 artefactos** | ✅ **Cerrado** | §2 sincronizado con las cabeceras reales; corrige **66 módulos (M1..M66)** y **9 `sequenceDiagram`** (`:256`) |
| R-06 | MEDIA | La tabla de evidencias de RNF usaba formas **no canónicas** (`Revisión:`), prohibidas por la convención 3 | ✅ **Cerrado** | Las **33** evidencias con `Revisión:` se reescriben a `Comando:`/`Inspección:` (`:257`) |
| R-07 | MEDIA | Criterios con **oráculo tautológico o sin magnitud** (el «Entonces» repite el «Dado/Cuando» o dice «sin errores») | ✅ **Cerrado** | CU-14, CU-20, CU-22/E2, CU-31 y CU-36; `CA-RF-34/42/46/49/50`; RNF-07/08/16, RT-05/07/10 ganan magnitud, método y evidencia (`:258`) |
| R-08 | MEDIA | Los criterios abreviados de la tabla de RF declaraban magnitud **sin método** ni evidencia concreta | ✅ **Cerrado** | Barrido de §5.4: la evidencia pasa a `E2E: <spec> — <flujo>` o `Vitest: <spec> — <aserción>` (`:259`) |
| R-09 | MEDIA | Dos causas citadas por los CU **no existían** en §4.3: «cuenta en uso por una dApp» y «reset incompleto» | ✅ **Cerrado con decisión de producto (DEC-45/DEC-46)** | `diccionario_datos.md` v1.7 gana en §4.3 **dos filas por causa** con `code: -32000`; §3.10 añade la guarda de sesión activa y **§3.11 es nueva**; aplicado en `requerimientos.md` v1.8, `casos_uso.md` v1.4 y `documento_tecnico.md` v1.3 (`:260`) |
| R-10 | MEDIA | Las cabeceras de `casos_uso.md`, `diagramas.md` y `documento_tecnico.md` citaban **versiones obsoletas** de sus fuentes | ✅ **Cerrado** | Los tres bloques de «Fuentes» se actualizan a las versiones vigentes y a DEC-01..DEC-44 (`:261`) |
| R-11 | MEDIA | La memoria no reflejaba la reevaluación: el paso 10 y el criterio §8.2 figuraban como pendientes | ✅ **Cerrado** | `estado_proyecto.md` v1.7 registra el veredicto, cierra el paso 10, abre el paso 11 y añade el criterio pendiente (`:262`) |
| R-12 | BAJA | Los historiales mezclaban el conteo viejo y el nuevo de eventos («23» y «hoy 24») en la misma celda | ✅ **Cerrado** | v1.6 separa el conteo histórico (23 en v1.4 → 24 desde v1.5) del valor vigente (`:263`) |

**Balance declarado: 12 cerrados · 0 pendientes** (`VEREDICTO_FASE2_V1.md:265`).

### Las 18 contradicciones residuales

Se listan completas en `VEREDICTO_FASE2_V1.md:151-176` con **ambos lados** citados como `ruta:línea`. Balance declarado: **17 por edición y 1 (`C-13`) por declaración de residuo** (`:176`); estado final **18/18 resueltas · 0 abiertas** (`:274`).

| # | Materia | Descripción en una línea | Estado real | Evidencia de cierre |
|---|---|---|---|---|
| C-01 | Fuente de literales | §2.1 «un mensaje por código» vs §4.3 «un mensaje por causa» | ✅ Resuelta | §2.1 pasa a «códigos y su significado» y remite a §4.3 |
| C-02 | Citas de la tabla de errores | 28 citas de CU y 2 del técnico apuntaban a §2.1 | ✅ Resuelta | Todas apuntan a §4.3 |
| C-03 | Ventana de confirmación | «una sola ventana global» vs «una sola ventana **por origen**» | ✅ Resuelta | Ambas citas pasan a «ventana única global con cola y contador» |
| C-04 | Vida del SW | «el puerto mantiene vivo el SW» vs «NO mantiene vivo» | ✅ Resuelta | Formulación falsable (`RESUME` < 200 ms tras 30 s) |
| C-05 | Vida del SW | `casos_uso.md:921` vs `documento_tecnico.md:191` y `:1959` | ✅ Resuelta | Ídem C-04 |
| C-06 | Vida del SW (diagrama) | `diagramas.md:317` vs `documento_tecnico.md:206` | ✅ Resuelta | Ídem C-04 |
| C-07 | Vida del SW (Figura 12) | `diagramas.md:620` vs `documento_tecnico.md:191`/`:256` | ✅ Resuelta | Ídem C-04 |
| C-08 | Catálogo de eventos | 23 eventos sin `storage_quota_exceeded` frente a 24 | ✅ Resuelta | Se añade el evento 24 a §2.2 |
| C-09 | Conteo de eventos | «catálogo de 23 nombres» vs «enum cerrado de 24 valores» | ✅ Resuelta | «24 eventos» |
| C-10 | Conteo de eventos | «enum de los 23 nombres» vs 24 nombres listados | ✅ Resuelta | Ídem |
| C-11 | Conteo de eventos | «campo `event` (23 nombres)» vs 24 eventos | ✅ Resuelta | Ídem |
| C-12 | Conteo en historial | «enum cerrado de 23 eventos (hoy 24…)» vs 24 | ✅ Resuelta | La traza histórica se conserva **solo** como historial |
| C-13 | Conteo en auditoría | `AUDITORIA_CASOS_USO_V1.md:38`/`:85` con «23 tipos» | ✅ **Resuelta por declaración de residuo**: el registro histórico conserva el 23 como prueba del cambio y el corpus vigente usa 24 (regla de §5.5) |
| C-14 | Versión de `diccionario_datos.md` | Memoria v1.4 vs cabecera 1.5 | ✅ Resuelta | §2 de la memoria sincronizada |
| C-15 | Versión de `entornos_globales.md` | Memoria v1.6 vs cabecera 1.7 | ✅ Resuelta | Ídem |
| C-16 | Versión de `casos_uso.md` y `documento_tecnico.md` | Memoria v1.1/v1.0 vs cabeceras 1.2/1.1 | ✅ Resuelta | Ídem |
| C-17 | Fuentes del técnico | Bloque «Fuentes» con diccionario v1.4, entornos v1.6, identidad v1.2, memoria v1.5 | ✅ Resuelta | Los tres bloques de fuentes se actualizan |
| C-18 | Fuentes de CU y diagramas | Bloques con requerimientos v1.4/v1.5 y diccionario v1.3/v1.4 | ✅ Resuelta | Ídem |

### Los 4 bloqueantes estructurales y los 10 defectos `VR-*`

El veredicto declara que la reevaluación **no reabrió ningún bloqueante estructural** (`:16`) y que los cuatro que impedían el cierre están cerrados y verificados (`:43-50`): **B-1** build/empaquetado MV3 ejecutable, **B-2** arnés de ejecución E2E real, **B-3** cola de aprobaciones persistida con dueño único del plazo y **B-4** anti-firma-ciega.

`VEREDICTO_FASE2_V1.md:299-316` documenta además **`VR-01..VR-10`** —**2 ALTA · 5 MEDIA · 3 BAJA**—, todos **cierres incompletos de remediaciones anteriores**, **ninguno de diseño**. Los más relevantes: `VR-01` (permisos del manifest contradictorios entre diccionario, técnico y entornos: se fija el conjunto cerrado `["storage","alarms","favicon","clipboardRead","clipboardWrite"]`) y `VR-02` (tres restos del conteo «23»). Los tres últimos son de nomenclatura y metadatos: `VR-07` (clave no canónica `settings.networks` → `truekeate_networks`), `VR-09` (el técnico declaraba 13 diagramas Mermaid y contiene 15) y `VR-10` (mojibake en CU-16, corregido a «reconciliación»).

### Estado final que declara el veredicto

> ✅ **CORPUS CONSISTENTE Y APTO PARA AUTORIZAR LA FASE 3** — **0 hallazgos abiertos** · **27 cerrados** · **8 parciales** (cerrados por `R-01..R-08`) · **0 residuales abiertos** (**12/12**) · **0 contradicciones** (**18/18** resueltas) · **0 defectos residuales de consistencia** (**10/10 `VR-01..VR-10`**) · **Fase 2 cerrada**. (`VEREDICTO_FASE2_V1.md:13-14`)

La verificación final de la v1.3 (`:318-332`) declara, entre otros: **0** apariciones del conteo antiguo fuera de los registros históricos, **0** `windowsByApprovalId`, **0** `settings.networks`, **0** formas de evidencia prohibidas, **0** caracteres `U+FFFD` y **0** mojibake en los nueve documentos del corpus, conjunto de permisos idéntico **4/4** y documentos fuente y registros históricos **intactos**.

## Desviaciones de los hitos

Fuente: `RepoTecnico/plan_desarrollo.md` §3.1.10 a §3.6.10, con los cierres registrados como `DEC-47..DEC-87` en `estado_proyecto.md`. Regla común declarada en cada tabla: **ninguna desviación rebaja un criterio de aceptación**; el efecto observable exigido se mantiene.

### H1 — Andamiaje, build MV3 y arnés

| # | Desviación | Por qué | Efecto observable |
|---|---|---|---|
| D-H1-1 | `exclude_matches` incluía `chrome-extension://*/*` | No es un patrón válido en `content_scripts`: Chrome **rechaza el manifest completo** y la extensión **no carga**; además `<all_urls>` no cubre ese esquema | Se elimina el patrón; la extensión carga con 0 errores |
| D-H1-2 | «un array de dos builds» en `vite.config.ts` | Vite 7 **no admite** que la config exporte un array, e `iife` + `inlineDynamicImports` exigen una entrada por build | **3 builds encadenados** con la API `build()` desde `closeBundle`; un solo `npm run build` sigue produciendo las **6 entradas** |
| D-H1-3 | `min-height: 100vh` como medida de las tres ventanas | Con `100vh` el `body` medía **720 px** en lugar de 600 y Chrome abría el popup con la altura por defecto | `width`/`height` **explícitos** con los tokens `--tk-*-width/height`; popup a 380 × 600 |
| D-H1-4 | Poppins como **fuente variable** | **Poppins no es variable**: tiene pesos discretos | Tres `.woff2` con un `@font-face` por peso y licencias OFL versionadas |
| D-H1-5 | `forge test` como literal normativo | **Falso verde**: sin `--root contracts` Foundry responde «Nothing to compile», ejecuta **0 pruebas** y sale con **exit 0** | El literal pasa a `forge test --root contracts --match-contract EIP712VerifierTest`, que ejecuta las 7 pruebas |

Registradas como **DEC-47..DEC-51**.

### H2 — Cartera, cuentas y recuperación

| # | Desviación | Por qué | Efecto observable |
|---|---|---|---|
| D-H2-G | El revelado se autoriza por **origen + ruta del popup**, no por `sender.tab` | `canRevealInContext` exigía `tabId === null`, pero el popup llega **con `sender.tab`**: `wallet_revealSecret` respondía **`4200` SIEMPRE** y `CA-RF-50` era inalcanzable por la UI | Se elimina esa condición y se conservan `isExtensionContext` + `REVEAL_ALLOWED_ROUTES = ['index.html']` |
| D-H2-H | **Orden de guardas** del reset y consulta previa del popup | (a) `handleResetWallet` comprobaba `confirm` **antes** que las guardas, invirtiendo el orden de CU-30 y dejando el `-32000` inalcanzable; (b) el popup abría el diálogo **sin** consultar las guardas | M33 aplica el orden; el popup usa `probeResetGuards` y pinta el `-32000` con el número exacto de pendientes **sin** abrir diálogo |
| D-H2-I | El aviso de éxito del reset no sobrevivía al **desmontaje** de la vista | El reset deja la cartera vacía y `SecurityView` se desmonta; CU-30 paso 6 exige volver al inicio **informando** | El aviso se eleva a `App` (`flash`) con `tone="success"` |
| D-H2-J | **Borrado del portapapeles aplazado** cuando el ocultado ocurre sin foco | Medido con navegador real: `navigator.clipboard.writeText('')` → `NotAllowedError: Document is not focused`, y `execCommand('copy')` devuelve `true` **sin** modificar el portapapeles | Se guarda solo la **huella SHA-256** y el borrado se ejecuta al recuperar el foco, con comparación por huella: **nunca** se borra a ciegas lo ajeno |
| D-H2-K | Correcciones del **arnés E2E**, no del producto | Cuatro causas: siembra incoherente que M13 clasificaba como «cartera dañada»; selector que resolvía a 2 elementos; una segunda pestaña que en headless **no** produce pérdida de foco; y el reset que borra `truekeate_settings` | Sembrado coherente, selector acotado al `form`, nuevo `loseFocusToOtherPage` con `Emulation.setFocusEmulationEnabled` y aceptación previa del aviso |

Registradas como **DEC-52..DEC-56**.

### H3 — Provider, conexión y lectura

| # | Desviación | Por qué | Efecto observable |
|---|---|---|---|
| D-H3-A | El cambio de cuenta activa desde el popup **no** emitía `accountsChanged` | `emitAccountsChanged` **no tenía ningún emisor de producción** ligado al cambio de cuenta: `CA-RF-15` quedaba a medias | `handleSetCurrentAccount` emite el evento con la cuenta nueva: **`CA-RF-15` pasa a CUMPLIDO** |
| D-H3-B | ¿La sesión por origen sigue a la cuenta activa? | Ambigüedad de contrato que hacía indecidible `CA-RF-15` sin fijar antes la semántica | Se adopta la opción MetaMask: la sesión viva comparte la **cuenta activa** y el cambio **actualiza** la cuenta de las sesiones vigentes sin borrarlas |
| D-H3-C | `senderGuard.ts` capturaba `INTERNAL_METHODS` al evaluar el módulo | Cadena circular de importación: `TypeError: Cannot read properties of undefined` y **`-32603` en cualquier petición** | La lista se extrae a un módulo hoja `src/background/rpc/internalMethods.ts`; `importOrder.spec.ts` lo fija |
| D-H3-D | **Defecto del arnés**: 11 E2E fallaban con `ERR_CONNECTION_REFUSED` en `localhost:5174` | El servidor de la dApp se **arrancaba a mano**: 26 passed / 11 failed | Se añade `webServer` a `playwright.config.ts`: **26/11 → 37 passed / 0 failed** |
| Anvil (nota operativa) | `--http.corsdomain` y `--silent` en el comando del arnés | `--http.corsdomain` **no existe** en Anvil 1.7.2-dev (el proceso muere); `--silent` no aparece en `--help` y con redirección de salida el arranque es frágil | Comando verificado: `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"`, **sin `--silent`** |

Registradas como **DEC-57..DEC-61**.

### H4 — Firma, aprobación y transacciones

| # | Desviación | Por qué | Efecto observable |
|---|---|---|---|
| D-H4-E1 | **Bloqueante**: ningún aprobable se encolaba y la ventana **nunca se abría** | Era un problema de **metadatos del catálogo**, no del router: los aprobables seguían con `implemented: false` y fuera de `supportedMethods`, así que el router respondía `4200` **antes** del despacho | Los 6 aprobables pasan a `implemented: true` y `supportedMethods` incluye `PAGE_APPROVAL_METHODS` |
| D-H4-E3 | **Defecto del arnés**: `--http.corsdomain` no existe en Anvil | El proceso muere y toda la suite posterior se queda sin nodo | Comando de Anvil corregido y documentado con los dos errores |
| D-H4-E9 | `18-concurrencia` rojo: el servidor de la dApp escuchaba **solo en IPv6** | `vite.config.ts` declaraba `server: { port: 5174, strictPort: true }` **sin `host`**, y el defecto de Vite resuelve a `::1` | Se añade `host: '127.0.0.1'` (y el mismo en `preview`); la prueba abre sus **dos orígenes** contra el MISMO servidor |
| D-H4-E10 | `29-sw-suspendido` rojo: la dApp recibía `-32603` en lugar de `4001` | (1) el `content-script` resolvía con `-32603` al cerrarse el canal; (2) el `4001` de la reconciliación se empujaba con `id = approvalId`, que **no correlaciona** con el `id` de la capa inject | El content script **espera** la resolución empujada; la correlación viaja como `requestId` en el sobre `TRUEKEATE_RPC` y se **persiste** con la entrada; `lastApprovalId` se asigna al observar el `approvalId` |
| D-H4-E11 | El cuerpo de la SIGUIENTE solicitud **nunca** llegaba a la ventana única | El empuje iba por `chrome.tabs.sendMessage(tabId, …)` y `notification.html` es una **página de la extensión**, no un content script: responde `Receiving end does not exist` | El empuje usa `chrome.runtime.sendMessage`, el único canal que alcanza páginas de la extensión, con `tabs.sendMessage` como respaldo |
| D-H4-E12 | Carrera de orden: la ventana mostraba la siguiente solicitud pero «Aprobar» quedaba **deshabilitado** | `handleSignResponse` re-renderizaba y empujaba la siguiente solicitud **dentro** del mismo ciclo que la respuesta, de modo que el empuje llegaba **antes** de procesar el `SIGN_RESPONSE` | `background.ts` responde `SIGN_RESPONSE` **primero** y hace la pasada de ventana **después** (`refreshApprovalWindowAfterDecision`), con reentrega idempotente |

Ya corregidos y fijados por specs antes del cierre: **D-H4-E5** (`isNotificationTabUrl` comparaba solo el `pathname`) y **D-H4-E6** (la traza de difusión interrumpida no rellenaba `LogEntry.txHash`). **D-H4-E2** se declaró **no reproducible como defecto de producción**: las tres pruebas están verdes y el síntoma corresponde al plazo de conexión **inyectado por el arnés** (`VITE_CONNECT_TIMEOUT_MS=2000`). Registradas como **DEC-62..DEC-68**.

### H5 — Redes y observabilidad

| # | Desviación | Por qué | Efecto observable |
|---|---|---|---|
| D-H5-A | El alta de red era **imposible**: `chrome.permissions.request` **no puede** llamarse desde el SW | Desde el SW Chrome responde `This function must be called during a user gesture`, incluso con el origen ya concedido | `requestHostPermission` consulta `contains` y no llama a `request` si ya está; el **clic del usuario** en el popup pide el permiso antes de invocar el alta |
| D-H5-B | El cambio y el alta de red no abrían la ventana única desde el popup (`4100`) | El `runner` de los métodos de red se construía sobre `dispatchApproval`, que exige **sesión de dApp** | El ciclo de red usa `runApprovalCycle` **sin exigir sesión**; no se duplica ni la cola ni el plazo |
| D-H5-C | **Reportado, no corregido en H5**: la vista previa tarda **7 s** con el nodo caído | `safeBalance` usa la política COMPLETA del cliente RPC (4 intentos + backoff 1/2/4 s) para un dato informativo | `approvals/**` era de solo lectura en el terreno de H5; con Anvil en marcha los 5 casos pasan en ~200 ms |
| D-H5-D | **`CA-RF-28` no era verificable**: el router no escribía ninguna traza por llamada | La observabilidad estaba implementada pero **sin cablear** al camino de las llamadas | `handleRPCRequest` envuelve `dispatchRPCRequest` y escribe **1 entrada por llamada**; la respuesta no depende de la escritura |
| D-H5-E | El descarte por cuota **re-persistía el lote descartado** | `persistQuotaDiagnostic` recibía `plan.retained`, que incluye las entradas recién rechazadas | Se persiste el histórico más la entrada de diagnóstico; `logEvent` devuelve la entrada del evento pedido |
| D-H5-H | Defectos del **arnés E2E** (ventana única perdida, cupo de tasa, suspensión del SW, «almacén intacto») | (a) el plazo inyectado es de 3 s y registrar la espera después del clic pierde la ventana; (b) la ventana es **única** y puede reutilizarse sin evento `page`; (c) la política real es 6/60 s y los 7 flujos encadenados se pasaban del cupo; (d) el polling mantiene el SW despierto e impide `stopWorker`; (e) con el nodo caído el SW escribe trazas **por diseño** | `conVentanaDeDecision`; los 7 flujos se reparten en dos pruebas con perfil nuevo; se sale de «Cuentas» antes de suspender; se excluyen las claves de observabilidad conservando la aserción de RNF-07 |
| D-H5-N | **Reportado**: el alta nacida en una **dApp** no puede aportar el gesto de `permissions.request` | El gesto tendría que aportarlo la ventana de confirmación, fuera del terreno de H5 | Modo de fallo observable: aprobación ⇒ permiso sin gesto ⇒ **`4001`** y red **no persistida** |
| D-H5-O | **NO VERIFICADO**: el alta de una red **nueva** desde el popup | Exige conceder `http://127.0.0.1:8546/*` respondiendo al aviso **nativo** de Chrome: imposible en headless | **No se marca como superado**: cobertura alternativa en `networks.spec.ts` y en el E2E `12-redes` T2 |
| D-H5-P | **Pérdida de un alta de red por concurrencia** (defecto de PRODUCTO) | `truekeate_networks` se escribe con RMW y la **siembra de arranque** (`seedDefaultNetwork`) y el alta (`upsertNetwork`) no estaban serializadas | Cerrojo por encadenamiento de promesas (`runSerializedNetworkWrite`) que envuelve lectura **y** escritura |
| D-H5-Q | `07-provider` en rojo intermitente: `truekeate_networks` ausente al leer el almacén | La prueba leía en cuanto existía el SW, pero la siembra del catálogo es **asíncrona** | Se espera la **condición observable** (`expect.poll`, 10 s); el oráculo no cambia |

Registradas como **DEC-69..DEC-78**.

### H6 — Identidad visual, accesibilidad y entrega

| # | Desviación | Por qué | Efecto observable |
|---|---|---|---|
| D-H6-A | La puerta de cobertura destapó que `approvals/` estaba por debajo del umbral | Medido: **473/732 = 64,62 %** de ramas frente al ≥ 80 % de RNF-17 | **245 pruebas nuevas** en `test/oracle/**` (11 ficheros) elevan la carpeta a **1233/1295 = 95,21 %**, **sin tocar `src/background/**`** |
| D-H6-B | El gate de RNF-18 marcaba los literales de color de los propios specs de contraste | La primera pasada salió **exit 1 con 33 hallazgos**, todos en `contrast.spec.ts` (27) y `goldUsage.spec.ts` (6): el código de **producto** nunca tuvo literales | **Cerrada en el mismo turno**: los dos specs **leen la paleta de `tokens.css`**; `lint:prohibited` da 0 hallazgos |
| D-H6-C | Dos citas de evidencia con nombre de fichero desactualizado en `requerimientos.md` §9.2 | RF-08 cita `tx.spec.ts` y RF-37 cita `approvalQueue.spec.ts`; los reales son `txContract.spec.ts` y `queue.spec.ts` | **Deriva documental, no falta de evidencia**: ambos specs existen y están en verde; se declara para la pasada de consistencia |
| D-H6-D | **RNF-15 no es verificable en Linux** en el equipo | `wsl -l -v` responde «no tiene distribuciones instaladas» y no hay CI | **RNF-15 se marca «verificado solo en Windows; pendiente en Linux», nunca «cumplido»** |
| D-H6-E | El ensayo del Perfil B **no es independiente** | Lo ejecutó el autor del proyecto y de los dos documentos | **Declarado NO VERIFICADO en su parte de sujeto**; sí queda el *dry-run* cronometrado (**55 s**) |
| D-H6-F | El diálogo «Acerca de» existe porque RNF-23 lo exige | Al implementarlo muestra además logotipo y tagline | **El alcance del MVP no cambia**: RF-48 **sigue Should** y no se promociona |
| D-H6-G | `grep -rn "http" dist/` no da 0 apariciones | Devuelve **34 coincidencias** y **ninguna es de CDN**: `host_permissions` locales, namespaces XML de los SVG, URL de la OFL en los `LICENSE-*.txt` y subcadenas del código minificado | El criterio se lee como «**0 URLs de CDN**», que es lo que comprueba `lint:prohibited` |
| D-H6-H | **35 ficheros de `src/` sin la cabecera JSDoc de contrato completa** | Faltaba la referencia `RF/RNF/RT` o el identificador de módulo | Se añade la línea en 34 ficheros y se convierte el bloque `//` de `src/manifest.ts`: **solo comentarios**, 0 líneas de lógica modificadas |
| D-H6-I | La primera batería E2E de cierre se **contaminó por concurrencia** | Dos cargas de trabajo ejecutaron Playwright a la vez sobre el mismo `dist/`, `test-results/` y carpeta de evidencia: **68 passed / 8 failed**, con `ENOENT` de ficheros sonda borrados a mitad de ejecución | Se conserva el intento contaminado y se repite en **ventana limpia**; regla nueva: las suites de Playwright de dos cargas **no pueden solaparse** |

Registradas como **DEC-79..DEC-87**.

### Las desviaciones del build MV3

Están documentadas **en el propio código**, en la cabecera de `vite.config.ts:14-28`, bajo el epígrafe «DESVIACIONES DOCUMENTADAS (el efecto observable exigido no cambia: un solo `npm run build` produce las 6 entradas en `dist/` con su formato y `dist/manifest.json`)»:

1. `vite.config.ts:16-19` — §7.5.3 pide «un array de dos builds», pero **Vite 7 no admite** que el fichero de configuración exporte un array (`config must export or return an object`); el build 2 se lanza con la API programática `build()` desde el hook `closeBundle` del build 1.
2. `vite.config.ts:20-23` — `format: 'iife'` + `inlineDynamicImports: true` exigen **una sola entrada por build** (Rollup rechaza el code-splitting en IIFE): build 1 = páginas + SW (ES), build 2 = `content-script` (IIFE), build 3 = `inject` (IIFE, que además genera y valida `dist/manifest.json`).
3. `vite.config.ts:24-28` — Vite emite los HTML en su ruta relativa a `root` (`dist/src/index.html`), así que el plugin `htmlRootOutput` reubica las 3 páginas en la raíz de `dist/` tal y como exige §7.5.5.

Correspondencia con el registro: es la desviación **D-H1-2**, cerrada como **DEC-48**.

### Las desviaciones de las constantes de tasa

Documentadas también **en el código**, en `src/shared/constants.ts:186-197`. El bloque `constants.ts:187-193` declara «**DESVIACIÓN CERRADA (fase 4, fleco 1)**: El diccionario declaraba `rateLimitBurst = 20` con recarga lineal `rateLimitRefillPerSecond = 5`, constantes **muertas** (ningún módulo las importaba) que contradecían la fuente autoritativa: `plan_desarrollo.md` §3.13 fija **6 solicitudes / 60 s por origen**… Se eliminan las dos constantes muertas y la ventana queda con UNA sola fuente (esta), sin debilitar la defensa: el límite efectivo sigue siendo el MÁS ESTRICTO de los dos (6/60 s)». La fuente única se materializa en `constants.ts:194` (`rateLimitWindowRequests = pendingRequestsPerMinute`) y `constants.ts:197` (`rateLimitWindowMs = RATE_WINDOW_MS`). Correspondencia: desviación **D-F4-1**, detallada en `plan_desarrollo.md:407-423` (§3.3.11) y en la fila de historial `plan_desarrollo.md:940`; el informe la cita como fleco resuelto en `INFORME_PRUEBAS_FASE4.md:642-654` y `estado_proyecto.md:225`.

### Tabla resumen de las desviaciones

| Hito | Etiquetas | Registro | Naturaleza |
|---|---|---|---|
| H1 | `D-H1-1`..`D-H1-5` | DEC-47..DEC-51 | 2 de build/plataforma, 1 de manifest, 1 de tipografía, 1 de literal de comando |
| H2 | `D-H2-G`..`D-H2-K` | DEC-52..DEC-56 | 1 de contexto de autorización, 1 de orden de guardas, 1 de UI, 1 de API de portapapeles, 1 de arnés |
| H3 | `D-H3-A`..`D-H3-D` + nota de Anvil | DEC-57..DEC-61 | 2 defectos de producto, 1 ambigüedad de contrato, 1 defecto de arnés, 1 nota operativa |
| H4 | `D-H4-E1`..`D-H4-E12` | DEC-62..DEC-68 | 1 bloqueante de catálogo, 1 defecto de producto de concurrencia, 4 de arnés, 2 de UI, 2 ya corregidos |
| H5 | `D-H5-A`..`D-H5-Q` | DEC-69..DEC-78 | 1 defecto de producto (cerrojo de redes), 3 corregidos, 2 **reportados**, 1 **NO VERIFICADO**, 5 de arnés |
| H6 | `D-H6-A`..`D-H6-I` | DEC-79..DEC-87 | 1 de cobertura, 2 documentales, 2 salvedades **declaradas no cumplidas**, 1 de alcance, 1 de criterio de grep, 1 de cabeceras, 1 de concurrencia de suites |

**Regla de esfuerzo declarada** (`plan_desarrollo.md:805`): si un hito consume más de **1,3 ×** su estimación (R9), se activa el recorte del ciclo posterior. `plan_desarrollo.md:799` declara que **no se activó**: la única desviación de esfuerzo observable es la de **D-H6-A** (245 pruebas nuevas no previstas en la tarea 6.8), absorbida dentro del hito.

## Lecciones y patrones de defecto

Síntesis de los 19 defectos de la Fase 4, los 12 residuales, los 10 `VR-*` y las desviaciones de los hitos, agrupados por **causa raíz**. Es la parte reutilizable del manual.

### Patrón 1 — Lectura-modificación-escritura sin cerrojo

El más repetido y el más peligroso, porque **pierde datos en silencio**: aparece en `C-1` (`sessions.ts:48`), `C-2` (`connections.ts:84`), `C-4` (`connections.ts:495`) y `D-H5-P` (`networks/catalog.ts`). La forma es siempre la misma: dos flujos leen la misma instantánea, ambos mutan y el segundo escribe encima del primero. La agravante de `C-4` es que el cerrojo serializaba las **escrituras** pero no la **decisión**: comprobar «máximo 1 pending por origen» fuera del cerrojo no basta. **Antídoto adoptado:** un cerrojo FIFO **reutilizable** (`src/background/state/serialLock.ts`) y la regla de envolver el **tramo crítico completo** —leer, comprobar y escribir—, con el test de concurrencia como parte del cierre de cada caso.

### Patrón 2 — Contrato de mensaje incompleto (correlación perdida)

`D-H4-E10` y `D-H4-E11`. El primero es el más instructivo: la reconciliación **sí** empujaba el `4001`, pero con `id = approvalId`, que **no correlaciona** con el `id` de la capa inject; el sobre no transportaba esa correlación y `lastApprovalId` estaba declarado y **nunca asignado**. El segundo es de **canal**: `chrome.tabs.sendMessage` no alcanza una página de la extensión. **Antídoto adoptado:** la correlación viaja como `requestId` en el sobre `TRUEKEATE_RPC` y se **persiste** con la `PendingRequest`, de modo que sobrevive a la suspensión del SW; y el canal se elige por **tipo de receptor**. Lección general: **verificar la identidad de un mensaje asíncrono no es lo mismo que verificar su entrega**.

### Patrón 3 — Constante muerta o duplicada

`D-F4-1` (`rateLimitBurst` / `rateLimitRefillPerSecond` en el diccionario) y `D-03`/`D-04` en `rateLimit.ts`. Una constante que **nadie importa** no es inocua: documenta un límite que no rige y desplaza la fuente de verdad. Y una constante que **se incrementa en dos sitios** duplica el efecto real (3 aprobaciones por minuto en vez de 6). **Antídoto adoptado:** una **sola fuente** por constante (`src/shared/constants.ts`), derivar en vez de repetir (`rateLimitWindowRequests = pendingRequestsPerMinute`) y eliminar la constante muerta en lugar de dejarla «por si acaso»; la cabecera `constants.ts:2-11` declara esa política.

### Patrón 4 — Nomenclatura divergente (la clave del mapa equivocado)

`D-11` es el ejemplo canónico: `accountLabels` tiene el **índice BIP-44** como clave, pero el código lo indexaba por **dirección**, de modo que la búsqueda **nunca** encontraba nada y `toLabel` valía «desconocido» para una cuenta propia. `D-12` es la misma enfermedad en la capa de privacidad: la lista de tokens se consultaba por **igualdad exacta** y `privKey` o `accountKey` no casaban con `privatekey`; y la lista de calldata solo reconocía `data`/`calldata`/`input`. **Antídoto adoptado:** resolver siempre por la **forma canónica** del almacén (el mismo `buildAccountViews` que usa la ventana de decisión) y, en privacidad, consultar **por contención** sobre la clave normalizada, con un patrón cerrado y realista para el calldata —sin caer en «cualquier clave que acabe en `data`», porque `metadata` no es calldata—.

### Patrón 5 — Entrega o autorización al contexto equivocado

Cuatro variantes del mismo malentendido sobre **quién llama**: `D-H2-G` (se exigía `sender.tab === undefined`, pero el popup del `action` **sí** llega con `sender.tab`, así que `wallet_revealSecret` respondía `4200` **siempre** y `CA-RF-50` era inalcanzable desde la UI); `D-13` (`router.ts:595` saltaba la ruta aprobable para **todo** contexto de extensión, y `resolveApprovalOrigin` exigía **sesión de dApp** al popup); `D-H5-B` (el `runner` de los métodos de red exigía sesión de dApp al popup, `4100`); y `D-H3-C` (el orden de importación podía evaluar un módulo antes que su dependencia, `-32603` en cualquier petición). **Antídoto adoptado:** autorizar por **origen + ruta** (allowlist explícita) en lugar de por una propiedad frágil del emisor; separar el ciclo de aprobación **de red** del ciclo de firma de la dApp; y extraer las listas compartidas a **módulos hoja**. Lección general: **una guarda de contexto demasiado estricta no falla seguro, falla cerrado y deja el requisito inalcanzable** — y eso no lo detecta un test unitario, lo detecta un E2E sobre el binario real.

### Patrón 6 — La suposición «una ventana por origen»

`D-H4-E12`, `D-H5-H`(b) y el residual `R-04`/`C-03`. La decisión P-21/DEC-38 fija **una sola** `notification.html` global con cola y contador, y el código y varios diagramas conservaban la invariante antigua. Consecuencias: carreras de orden al empujar la siguiente solicitud, ventanas reutilizadas **sin** emitir el evento `page` que el arnés esperaba, y artefactos documentales contradiciéndose. **Antídoto adoptado:** la ventana única es una **invariante verificada** (`windowQueue.spec.ts`, `windowRediscovery.spec.ts`), el empuje es idempotente y reentregable, y el corpus se sincronizó en los cuatro documentos que la describían.

### Patrón 7 — Cuota de almacenamiento y retención

`D-H5-E` (el descarte por cuota **re-persistía** el lote descartado, lo contrario de lo que promete el módulo), `C-3` (`truekeate_connect_request` **nunca** se purgaba: toda solicitud sin decidir se quedaba para siempre con su origen y su lista de cuentas) y `DEC-74` (el contador de descartes se reescribía en **cada** traza, llevando la reconstrucción del SW de < 1 s a 1,3-1,9 s y haciendo fallar la medición de RNF-08). También el conteo del catálogo de eventos (de **23** a **24**, con `storage_quota_exceeded`) generó cinco contradicciones documentales (`C-08..C-12`). **Antídoto adoptado:** **doble motivo de purga** (por vencimiento y al resolver), escritura **solo cuando el valor cambia** y una entrada de diagnóstico que **nunca** arrastra las entradas rechazadas. Lección general: en almacenamiento acotado, la purga y el descarte son **funcionalidad**, no limpieza.

### Patrón 8 — Validación de forma sustituida por coerción

`D-05` (`Number('') === 0`, `Number('1e1') === 10`, `Number('0x10') === 16`), `D-09` (`Number.parseInt` truncando `'1.5'` y aceptando `'-5'`, que producía el hexadecimal inválido `'0x-5'`), `D-10` (`toChainIdNumber` cayendo al `chainId` por defecto hacía que un `chainId` basura **coincidiera** con el activo y **desactivara** el aviso) y `D-02` (`padEnd` sin recortar reescalaba la magnitud en vez de truncarla). **Antídoto adoptado:** toda entrada pasa por un **parser explícito** que devuelve `null` ante una forma inválida (`^\d+$` + `isValidDerivationIndex`, `parseChainIdOrNull`), y **ante un valor ininterpretable se falla seguro** (se cuenta como discrepancia) en lugar de caer a un valor por defecto silencioso. `D-06` añade el corolario: **dos caminos con la misma regla tienen que usar la misma función** de validación.

### Patrón 9 — El spec que codifica el defecto

Uno de los hallazgos metodológicamente más valiosos: existían pruebas que **afirmaban el comportamiento defectuoso**. `DEC-52` lo dice literalmente: «se alinean **2 aserciones** de `secretsExport.spec.ts` (el spec codificaba el defecto)». Y `INFORME_PRUEBAS_FASE4.md:123-125` fija la regla de desempate: cuando corpus y código discrepaban se alineó **el código** y, si el test afirmaba lo contrario, se corrigió el test **en la dirección del corpus**, dejando escrito el motivo. Los dos únicos `*.spec.ts` tocados en el cierre de H4 fueron `messaging.spec.ts`, precisamente porque codificaban la afirmación de H3 («los 6 aprobables responden `4200`») que H4 **debía** sustituir. **Antídoto adoptado:** un test que falla **no** se «arregla» moviéndolo hacia el código; y todo cambio de un spec en dirección contraria al corpus exige una línea escrita de justificación.

### Patrón 10 — El «fallo cerrado» silencioso

`D-07` y `D-08` son el mismo vicio con dos caras: `sanitizeAccounts` **compactaba** una lista con huecos y `readAddressList` **filtraba** las entradas no-cadena, de modo que (a) el índice del array dejó de coincidir con el índice BIP-44 y `wallet_revealSecret('idx:2')` entregaba la clave privada de **otra** cuenta, y (b) el informe de integridad **seguía diciendo `ok`** con una cuenta importada ya descartada. La corrección declarada es deliberadamente incómoda: una lista con hueco se trata como **cartera dañada** (`sanitizeAccounts` devuelve `[]`) y el hueco se **conserva** en el informe. Es la misma filosofía de `D-15a` (documentar mal es en sí un defecto, aunque no rompa nada) y de `D-H5-O`/`D-H6-D`/`D-H6-E`: lo no verificado se declara **NO VERIFICADO**, nunca «cumplido». **Antídoto adoptado:** **fallar abierto y visible** antes que fallar cerrado y silencioso: una corrupción se reporta, un secreto ambiguo se bloquea con `-32000` y una salvedad de entorno se escribe con su motivo y lo que haría falta para cerrarla.

### Contra-patrón: el defecto que se declara «entorno»

`INFORME_PRUEBAS_FASE4.md:112` lo prohíbe explícitamente. Y sin embargo el proyecto conserva **tres** casos legítimos de defecto **de arnés** (D-14 y los dos intermitentes de `:614-633`), más `D-H3-D`, `D-H4-E3`, `D-H4-E9`, `D-H5-H` y `D-H6-I`. La diferencia entre un defecto de arnés legítimo y una excusa es el **expediente**: en todos los casos hay causa raíz medida, corrección aplicada y evidencia conservada —incluidos los **intentos fallidos**, que no se borran (`e2e-baseline-FALLO-servidor-dapp-caido.json`, `e2e-intento1-contaminado-2026-09-12.log`).

### Qué hacer con estos patrones

1. **Antes de añadir cualquier RMW**, envolver el tramo crítico completo con un cerrojo y escribir el test de concurrencia.
2. **Antes de tocar una guarda de contexto**, comprobar con un E2E que el camino queda **alcanzable** desde el emisor real.
3. **Antes de documentar una constante**, comprobar que alguien la importa; si nadie lo hace, se borra.
4. **Antes de indexar un mapa del almacén**, leer la forma canónica de su clave en `diccionario_datos.md`.
5. **Antes de dar por bueno un valor por defecto**, preguntar qué pasa con una entrada basura: si el resultado es «coincide», hay un aviso desactivado.
6. **Ante un fallo, no tocar la aserción**: buscar la causa raíz con su `archivo:línea` y corregir el código.

## Estado final declarado

**Todo lo de esta sección está declarado en la documentación del proyecto. El autor de este manual no ha re-ejecutado ninguna de estas cifras.**

### Cifras finales

| Frente | Declarado | Fichero y línea |
|---|---|---|
| Vitest | **1185 passed / 71 ficheros · 0 failed** | `INFORME_PRUEBAS_FASE4.md:25` y `:180` |
| Playwright | **84 passed / 0 failed / 0 flaky / 0 skipped · 33 specs** | `INFORME_PRUEBAS_FASE4.md:26` y `:181` |
| Forge | **30 passed · 2 suites** (`EIP712VerifierTest` 10 + `EIP712VerifierFase4Test` 20) | `INFORME_PRUEBAS_FASE4.md:27`, `:30-31` |
| Total | **1299 pruebas en 106 ficheros/suites · 0 failed · 0 flaky · 0 skipped** | `INFORME_PRUEBAS_FASE4.md:28` |
| Cobertura de ramas | global **86,11 %** · `crypto/` **86,98 %** · `approvals/` **95,60 %** · `shared/validation/` **93,13 %** | `INFORME_PRUEBAS_FASE4.md:46-49` y `:186` |

El mismo bloque se reproduce en `estado_proyecto.md:5`, `:7` y `:215-218` y en `plan_desarrollo.md:940`. La variación respecto de la pasada de auditoría está declarada y explicada, sin maquillar, en `INFORME_PRUEBAS_FASE4.md:55-63`: la cobertura global de ramas **baja** de 86,51 % a 86,11 % porque el código nuevo añade líneas y ramas defensivas que no todas quedan ejercitadas mientras el denominador crece, y «**ninguna rama que ya estaba cubierta dejó de estarlo**».

### Puertas de calidad

| Comando | Resultado declarado | Fuente |
|---|---|---|
| `npx tsc -b` | **exit 0** (`strict`, 0 errores) | `INFORME_PRUEBAS_FASE4.md:183`; `estado_proyecto.md:219` |
| `npm run build` | **exit 0** (6 entradas + `dist/manifest.json`) | `INFORME_PRUEBAS_FASE4.md:184` |
| `npm run lint:prohibited` | **exit 0 · 0 hallazgos** | `INFORME_PRUEBAS_FASE4.md:185` |
| `npm run coverage` | **exit 0** con los cuatro umbrales de RNF-17 cumplidos | `INFORME_PRUEBAS_FASE4.md:186` |

> **Matiz de nomenclatura, verificado por lectura:** `package.json:6-16` declara `lint:prohibited` pero **no** un script `lint` a secas. Las citas del corpus que dicen «`lint` exit 0» se refieren a **`npm run lint:prohibited`** (`estado_proyecto.md:7`, `:421`). **Pendiente de confirmar** si existe además una configuración ESLint ejecutada por otra vía: el repositorio contiene `eslint` y `typescript-eslint` en `devDependencies` (`package.json:30`, `:39`) y un `eslint.config.js`, pero **ningún script npm lo invoca**.

### Defectos y residuales

| Bloque | Cifra declarada | Fuente |
|---|---|---|
| Defectos de la Fase 4 | **15** (+4 de concurrencia y retención) | `INFORME_PRUEBAS_FASE4.md:696`; `estado_proyecto.md:223` |
| Defectos con prueba de regresión | **19/19** | `INFORME_PRUEBAS_FASE4.md:696-697` |
| Pruebas desactivadas o relajadas | **0** | `INFORME_PRUEBAS_FASE4.md:694` |
| Residuales de Fase 2 | **12/12 cerrados · 0 abiertos** | `VEREDICTO_FASE2_V1.md:35-36` |
| Contradicciones de Fase 2 | **18/18 resueltas · 0 abiertas** | `VEREDICTO_FASE2_V1.md:33`, `:274` |
| Defectos `VR-01..VR-10` | **10/10 cerrados · 0 abiertos** | `VEREDICTO_FASE2_V1.md:39-40` |
| Bloqueantes estructurales de Fase 2 | **4/4 cerrados** | `VEREDICTO_FASE2_V1.md:37`, `:43-50` |
| Trazabilidad del MVP | **40/40 RF Must · 25/25 RNF · 13/13 RT · 4/4 RE** | `INFORME_PRUEBAS_FASE4.md:563-566` |
| Criterios de cierre de la Fase 4 | **10 de 12 cumplidos** (los 11 y 12 declarados no cumplidos) | `INFORME_PRUEBAS_FASE4.md:686-715` |

### Las dos salvedades que siguen abiertas

`INFORME_PRUEBAS_FASE4.md:568-573` y `:709-711` dejan **dos** criterios sin cumplir, con su motivo, y **no** los declaran superados:

1. **RNF-15 — build y ejecución en Linux/CI:** verificado **solo en Windows**; no hay WSL2 ni CI en el equipo (`RepoTecnico/evidencia/H6/wsl2-no-disponible-2026-09-12.log`). `npm ci` + `npm run build` están verificados en Windows (33 s + 22 s, exit 0); **no** se declara cumplido en Linux.
2. **Ensayo del Perfil B (CU-36, con sujeto externo):** **no verificado de forma independiente**; el *dry-run* del autor midió **55 s**, pero un ensayo válido exige un sujeto **externo** que siga solo `README.md` e `INSTRUCCIONES.md`.

### Limitaciones declaradas que afectan a la lectura de los defectos

- **Avisos nativos de Chrome no verificables en headless** (`INFORME_PRUEBAS_FASE4.md:582-588`): el alta de una red nueva desde el popup queda **NO VERIFICADA** (`D-H5-O`) y el frontal se cubre por sus dos caminos verificables.
- **UI React con 0 % de líneas cubiertas por Vitest** (`:590-602`): `src/popup/**`, `src/connect/**` y `src/notification/**` se prueban **en el navegador** con Playwright; la cobertura **de líneas** (61,04 %) **no** es una medida útil porque el umbral de RNF-17 se evalúa sobre **ramas**.
- **Ramas defensivas inalcanzables** (`:604-612`): respaldos por tipos imposibles, `catch` de API ausente e índices con reloj movido hacia atrás están **escritos a propósito** y **sin cubrir**; no se añadieron pruebas artificiales para inflar la cifra.
- **Conflictos de especificación abiertos** (`:635-657`): el único que sigue abierto es la convivencia entre los *plazos inyectados* por el arnés y los de producción en `documento_tecnico.md` §5.1.1 y `casos_uso.md`; se declara cosmético para el producto y se recomienda unificarlo en la Fase 5.
- **Los 10 RF Should siguen fuera del MVP** (`:659-677`), con su estado real medido unidad por unidad (C1..C10) y orden de recorte **C3 → C4 → C5**.

### Lo que este manual no certifica

Es un **resumen veraz de lo declarado**, no una re-verificación. Quedan fuera de su alcance la re-ejecución de los tres frentes de prueba, la re-medición de la cobertura, la comprobación de que las capturas `*.png` muestran lo que sus specs afirman, y la validación de los conteos de §6.1/§6.2 del documento técnico más allá de su lectura. Los puntos marcados como «**pendiente de confirmar**» en el manual de trazabilidad —la referencia `RNF-31` en `test/oracle/calldata.spec.ts:4`, el identificador `M66` duplicado en `src/shared/i18n.ts:2`, la desincronización de versiones entre cabeceras y tabla §2 de `estado_proyecto.md`, y las dos citas de evidencia de `D-H6-C`— se resuelven con una pasada de consistencia, exactamente el tipo de trabajo que el residual `R-05`/`R-11` y los defectos `VR-*` de la Fase 2 ya requirieron dos veces.
