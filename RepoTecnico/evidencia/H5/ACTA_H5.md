# ACTA H5 — Redes y observabilidad (tareas 5.10 a 5.13 y cierre del hito)

> **Hito:** H5 — Redes y observabilidad (`plan_desarrollo.md` §3.5) · **Fecha de cierre:** 2026-09-12
> **Alcance de esta acta:** la **batería real** de los 6 comandos obligatorios, los **5 errores de
> tipos** corregidos, los **defectos de producción** corregidos en el hito, el **estado real** de los
> criterios `CA-RF-*`/RNF de §3.5.6, el **alcance verificado y NO verificado** del arnés E2E y la
> evidencia archivada en `RepoTecnico/evidencia/H5/`.

---

## 1. Comandos ejecutados y resultado REAL

| Comando | Resultado real (batería de cierre) | Evidencia |
|---|---|---|
| `npx tsc -b` | **exit 0** — 0 errores (incluye `src/`, `test/` y `e2e/`); los **5** `TS18048` de los specs nuevos de `logging/` corregidos | `evidencia/H5/typecheck-2026-09-12.log` (0 bytes = sin salida) |
| `npm run build` | **exit 0** — 6 entradas en `dist/` + `dist/manifest.json` | `evidencia/H5/build-2026-09-12.log` |
| `npm run lint:prohibited` | **exit 0** — 0 hallazgos (140 ficheros de `src/`, 14 de `dist/`): sin dependencias prohibidas, sin `fetch` propio, sin `chrome.storage.sync`, sin `codecrypto_`, **sin colores fuera de `tokens.css`** y sin `ethers` en el popup | `evidencia/H5/lint-prohibited-2026-09-12.log` |
| `npm run test` (Vitest) | **exit 0** — **636 passed / 47 ficheros, 0 failed** (los **587** de H1–H4 siguen verdes; +49 pruebas del hito) | `evidencia/H5/vitest-2026-09-12.log` |
| `npm run test:e2e` (Playwright, `TK_EVIDENCE_PHASE=H5`) | **exit 0** — **58 passed / 0 failed / 0 skipped** (los **44** de H1–H4 siguen verdes; +14 del hito: `12-redes` 5, `15-logs` 3, `21-eip6963` 1 y `22-dapp` 5) | `evidencia/H5/e2e-2026-09-12.{log,json}`, `e2e-global-setup-2026-09-12.{log,json}` |
| `npm run forge:test` | **exit 0** — **10 passed / 0 failed** | `evidencia/H5/forge-2026-09-12.log` |
| Anvil principal (bloqueante del arnés) | **OK** — `cast chain-id --rpc-url http://127.0.0.1:8545` = **31337** | `evidencia/H5/e2e-global-setup-2026-09-12.log` |
| **Anvil secundario** (segunda red de §3.5.7) | **OK** — `cast chain-id --rpc-url http://127.0.0.1:8546` = **31338** (arrancado por el `globalSetup` con `anvil --host 127.0.0.1 --port 8546 --chain-id 31338 --allow-origin "*"`, sin `--silent`) | `evidencia/H5/e2e-global-setup-2026-09-12.{log,json}` |

Los artefactos de diagnóstico (sondas propias, **fuera** de `e2e/**` y ya eliminadas del árbol) quedan
archivados como prueba de las causas raíz medidas:
`diagnostico-permiso-host-gesto-prompt.log`, `diagnostico-permiso-host-ya-concedido.log`,
`diagnostico-aprobacion-red-4100.log`, `diagnostico-ventana-unica-reuso.log`,
`diagnostico-eip712.log` y `diagnostico-envio-redes.log`.

---

## 2. Los 5 errores de tipos (`TS18048`) — causa y corrección

Los cinco venían de la MISMA causa: el `get` del doble de pruebas de `chrome.storage.local`
(`test/setup/chrome-stub.ts`) se tipa con la sobrecarga con `callback` de la API real, de modo que su
resultado unificado **puede resolverse como `undefined`**; los specs indexaban ese resultado sin
estrechar el tipo.

| # | Fichero:línea | Corrección aplicada (sin `any` ni `@ts-ignore`) |
|---|---|---|
| 1 | `src/background/logging/logger.spec.ts:31` | `const items = (await chromeStub.storage.local.get(...)) ?? {}` — una lectura ausente es una instantánea **vacía** (misma semántica que `readStorage`, M33) |
| 2 | `src/background/logging/loggerRetry.spec.ts:46` | idéntica al anterior |
| 3 | `src/background/logging/logRedaction.spec.ts:34` | idéntica al anterior |
| 4 | `src/background/logging/storageQuota.spec.ts:67` | idéntica al anterior |
| 5 | `src/background/logging/storageQuota.spec.ts:142` | `const persistido = (await chromeStub.storage.local.get(LOG_DROPPED_COUNTER_KEY)) ?? {}` |

Además se retiraron **dos `console.log('DEBUG …')`** que quedaban de la depuración en
`logRedaction.spec.ts` y `loggerRetry.spec.ts`.

---

## 3. Defectos de PRODUCCIÓN corregidos en H5 (causa raíz medida)

| # | Defecto | Causa raíz medida | Corrección y verificación |
|---|---|---|---|
| **D-H5-A** | **Alta de red IMPOSIBLE (RF-23)**: `chrome.permissions.request` rechaza SIEMPRE desde el Service Worker, así que `wallet_addEthereumChain` terminaba siempre en `4001` | Medido con una sonda propia (Playwright + `dist/`): desde el SW, `permissions.request` se **rechaza** con `This function must be called during a user gesture` —**incluso con el origen YA concedido**—; desde el popup **sin** gesto la promesa **nunca se resuelve** y **con** gesto aparece el aviso nativo de Chrome (no accionable sin interfaz). El corpus (DEC-36) suponía que la aprobación de la ventana única era gesto válido para una llamada hecha en el SW, y **no lo es** | (1) `networks/addChain.ts`: `requestHostPermission` consulta primero `contains` y **no** llama a `request` si la concesión ya está vigente (una concesión vigente es la prueba que exige DEC-36). (2) `popup/views/NetworksView.tsx` (M43): el **clic del usuario** pide el permiso de host del `rpcUrl` **antes** de invocar el alta, que es el gesto que Chrome exige; si se deniega, la red **no** se persiste y se pinta el `4001` de §4.3. Verificado por `networks.spec.ts` (concedido ⇒ se persiste; denegado ⇒ `4001` y sin persistir) y por el E2E `12-redes` (denegación real ⇒ `4001` y red NO persistida). **Desviación aceptada** en `plan_desarrollo.md` §3.5.10 |
| **D-H5-B** | **Cambio de red y alta IMPOSIBLES desde el popup (y sin cuenta de sesión desde una dApp)**: la ventana de confirmación **nunca se abría** y la llamada respondía **`4100`** | Medido con una sonda propia (`diagnostico-aprobacion-red-4100.log`): `rpc/router.ts` construía el `runner` de los métodos de red llamando a `dispatchApproval`, que empieza por `resolveApprovalOrigin` → **exige sesión de dApp**. Desde el popup el origen es `extension` y no hay sesión ⇒ `4100` («Esta dApp no tiene permiso para usar la cartera», `reason: no-session-for-approval`) sin ventana; desde una dApp, M24/M25 tampoco recibían la cuenta de la sesión | **Corregido** en `rpc/router.ts`: el ciclo de red usa `runApprovalCycle` (cola M14 → plazo M15 → ventana única M18 → decisión) **sin exigir sesión** —la cuenta y la red las resuelve M24/M25 (`resolveApprovalAccount`) y viajan en el borrador— y el router pasa `sessionAccount` resuelto con `authorizedAccountFor` cuando el emisor es una página. Nueva costura inyectable `RouterDeps.runNetworkCycle` (opcional, para no romper los dobles existentes). Verificado por `e2e/12-redes` (T2 alta desde el popup, T4 denegación desde la dApp, T5 cambio aprobado con `chainChanged`) y por los 40 ficheros de Vitest de `src/background` |
| **D-H5-C** | **REPORTADO (no corregido)**: la vista previa de una aprobación tarda **7 s** con el nodo caído y 5 casos de `dispatch.spec.ts` (H4) agotan el plazo de 5 s de Vitest en ese escenario | `safeBalance` (`src/background/approvals/dispatch.ts`) lee el saldo con la política COMPLETA del cliente RPC (4 intentos + backoff 1/2/4 s) para un dato **informativo** de la vista previa (medido en la línea base con Anvil detenido: `ECONNREFUSED` × 4 intentos) | **No corregido en H5**: `src/background/approvals/**` es **de solo lectura** en el terreno del hito (la regla pide **reportar**). Corrección propuesta (1 línea, H6): `getBalanceWei(address, { attempts: 1 })`, el mismo criterio *fail-fast* que la estimación de gas de RNF-25. Con **Anvil en marcha** —entorno de la batería de cierre— los 5 casos pasan en ~200 ms y la suite queda **verde**: el defecto es el **retraso de la ventana de confirmación** cuando el nodo no responde |
| **D-H5-D** | **`CA-RF-28` no era verificable**: el router **no** escribía ninguna traza por llamada (no existía ninguna llamada a `logEvent` en `rpc/router.ts`) | La observabilidad de H5 estaba implementada en `logging/**` pero **sin cablear** al camino de las llamadas | `rpc/router.ts`: `handleRPCRequest` pasa a ser un envoltorio transparente que delega en `dispatchRPCRequest` y escribe **EXACTAMENTE 1** entrada por llamada (`rpc_call` con `method`, `origin`, `ts` y los `params` ya redactados por M22; `rpc_error` con el `code` de §4.3). La respuesta a la dApp no depende de que el log se escriba. Verificado por `15-logs.spec.ts` (una llamada ⇒ una entrada nueva, con el popup **cerrado**) y por los 47 ficheros de Vitest que siguen verdes |
| **D-H5-E** | El descarte por cuota **re-persistía el lote descartado**: la escritura de la entrada de diagnóstico volcaba `plan.retained` (que incluía las entradas nuevas) en lugar del histórico | `logger.ts` → `persistQuotaDiagnostic` recibía el plan con las entradas nuevas | `logger.ts`: se le pasa el **histórico ya persistido** (`previous`) y el plan se calcula sobre `[...histórico, diagnóstico]`; además `logEvent` devuelve la entrada **del evento pedido** (o `null`), nunca la de diagnóstico. Verificado por `storageQuota.spec.ts` (la entrada descartada no aparece en `truekeate_logs` **y** el `storage_quota_exceeded` sí) |
| **D-H5-F** | `eip1193.spec.ts` fijaba **34** causas del catálogo de errores y H5 añadió 3 (`invalidRpcUrl`, `invalidNetworkDefinition`, `chainIdMismatch`) | El conteo del spec era el de H4 | Se actualiza a **37** (`25 + 12`) con la anotación de las 3 filas de la v1.11 de §4.3 |
| **D-H5-G** | `storageQuota.spec.ts` y `loggerRetry.spec.ts` no modelaban el modo de fallo documentado | (a) `instalarCuotaAgotada` rechazaba **todas** las escrituras, de modo que la entrada de diagnóstico no podía persistirse **nunca** (contradicción con la propia prueba); (b) la contabilidad `attempts` contaba también la siembra previa del caso | (a) el doble rechaza las **N** primeras escrituras: **2** (lote + reintento) para el caso normal, **4** para el caso extremo «no cabe nada»; (b) `resetLogDiagnostics()` antes de medir, para aislar el ciclo de la entrada bajo prueba. Ninguna aserción se relaja |

---

## 3.b Defectos del ARNÉS medidos y corregidos en H5

| # | Hallazgo | Causa raíz medida | Corrección |
|---|---|---|---|
| **D-H5-H** | La **ventana única** de decisión se perdía: tres E2E de H5 fallaban con `waitForEvent("page") Timeout 20000 ms` y otra con `locator.click` agotado, **solo en la suite completa** | (a) el plazo inyectado es `VITE_SIGN_TIMEOUT_MS=3000`: registrar la espera **después** del clic pierde una ventana que nace y muere dentro de ese margen (`diagnostico-eip712.log`); (b) la ventana es **ÚNICA** (P-21) y el SW puede reutilizarla para la siguiente solicitud, en cuyo caso **no hay evento `page`** (`diagnostico-ventana-unica-reuso.log`); (c) el *polling* de saldos del popup mantiene el SW despierto y `09-conectar` (H3) no lograba suspenderlo (`ServiceWorker.stopWorker` sin efecto durante 30 s) | `conVentanaDeDecision` registra la espera ANTES de la acción y admite **tanto** la ventana nueva **como** la reutilizada; `09-conectar` sale de la pestaña «Cuentas» antes de suspender (el sujeto de la prueba —la sesión sobrevive— no cambia); `12-redes` espera explícitamente el botón (visible y habilitado) antes del clic |
| **D-H5-I** | El E2E de los 7 flujos fallaba con **`4001 rateLimitExceeded`** a mitad de la secuencia | La política REAL es de **6 solicitudes por ventana de 60 s por origen** (`pendingRequestsPerMinute`, §2.13): los 7 flujos encadenados superan el cupo (el 6.º/7.º método se rechaza **sin abrir ventana**) | Los 7 flujos se reparten en **dos pruebas** con perfil nuevo cada una (contadores en `truekeate_rate_windows`): flujos 1–4 y flujos 5–7. **No se relaja ninguna aserción**; el reparto es de arnés (documentado en la cabecera del spec) |
| **D-H5-J** | `12-redes` provocaba el **corte del servidor de la dApp** en la primera ejecución (`ERR_CONNECTION_REFUSED` en 30 pruebas) | Defecto del **proceso** de verificación, no del producto: se ejecutó `npx vitest run` **a la vez** que la suite E2E; Vitest escribe ficheros temporales `.networks.spec.ts.timestamp-*.mjs` en `src/`, el *watcher* de Vite recibe `EBUSY` y el servidor de la dApp muere | Se ejecutan **en serie**: nunca Vitest durante un `test:e2e`. Los dos intentos descartados quedan archivados con su causa raíz |
| **D-H5-K** | `e2e/12-redes.spec.ts` no compilaba/arrancaba: `TypeError: Cannot read properties of undefined (reading 'VITE_SIGN_TIMEOUT_MS')` | Los ficheros de `e2e/**` se ejecutan en **Node**: importar `src/shared/constants.ts` arrastra `import.meta.env`, que solo existe en el empaquetado de Vite | El literal de RNF-23 se **transcribe** en el spec (con el comentario de por qué), de modo que un cambio del literal en el producto rompe la prueba |
| **D-H5-L** | `e2e/27-rpc-caido.spec.ts` (H3) en rojo: «el RPC caído modificó el almacén» | H5 hace que el SW escriba **una traza por llamada** (`CA-RF-28`) y su contador de descartes (`truekeate_logs_dropped`): con el nodo caído esas claves cambian **por diseño**, que es justo lo que hay que registrar | La comparación «almacén intacto» excluye las claves de **observabilidad** (`truekeate_logs`, `truekeate_logs_dropped`) y mantiene intacta la aserción de RNF-07 sobre el estado de la cartera (`truekeate_accounts`) |
| **D-H5-P** | **Pérdida de un alta de red por lectura-modificación-escritura concurrente** (defecto de PRODUCTO, en `networks/catalog.ts`) | `truekeate_networks` se escribe con RMW: la **siembra de arranque** (`seedDefaultNetwork`, en cada despertar del SW) y el **alta** (`upsertNetwork`) leían el mapa y lo reescribían sin serialización. Si la siembra leía **antes** de un alta y escribía **después**, el mapa resultante era `{ ...catálogo_leído, Anvil }` y **la red nueva desaparecía**. Medido en el arnés: la siembra de la segunda red se perdía de forma intermitente (la guarda de diagnóstico de `12-redes` lo detectó: «el catálogo sembrado no tiene las dos redes») | **Corregido**: cerrojo por encadenamiento de promesas (`runSerializedNetworkWrite`, mismo patrón que M29/M30) que envuelve **la lectura y la escritura** de `seedDefaultNetwork` y de `upsertNetwork`, de modo que nunca se intercalan. Verificado por `networks.spec.ts` (9 casos) y por el E2E `12-redes` en verde. La escritura **externa** del arnés (por CDP) no participa del cerrojo: su siembra se **reintenta comprobándola** dentro del test |
| **D-H5-Q** | `e2e/07-provider.spec.ts` (H3) en rojo de forma intermitente: `truekeate_networks` ausente al leer el almacén | La prueba leía el almacén en cuanto existía el Service Worker, pero la **siembra del catálogo la hace el arranque del SW**: es una condición **asíncrona** y el test la trataba como si ya estuviera hecha (defecto de arnés, agravado por el hop extra del cerrojo) | Se espera la **condición observable** (`expect.poll` sobre la existencia de la clave, 10 s) antes de la aserción; el oráculo no cambia |
| **D-H5-M** | `e2e/29-sw-suspendido.spec.ts` (H4, RNF-08) en rojo por medición: reconstrucción 1,3–1,9 s | (a) el intervalo **adaptativo** de `expect.poll` (50 → 100 → 250 → 500 → 1000 ms) añadía hasta ~1,5 s de sobrecoste PROPIO del arnés a una medida comparada con un umbral de 1 s; (b) el diagnóstico de cuota se reescribía en **cada** traza (dos operaciones de almacén por entrada) | `intervals: [50]` en la medición (el umbral no cambia) y `persistDiagnostics` escribe **solo cuando los contadores cambian** (una operación por entrada). Resultado: la medición vuelve a < 1 s (`29-sw-suspendido-2026-09-12.json`) |

---

## 3.c Defecto REPORTADO (no corregido en H5, fuera de su terreno)

| # | Defecto | Causa raíz medida | Modo de fallo actual y corrección propuesta |
|---|---|---|---|
| **D-H5-N** | **Alta de red nacida en una dApp con permiso de host concedido**: la red no llega a persistirse | Para un alta originada en una página, el gesto de usuario que exige `chrome.permissions.request` tendría que aportarlo la **ventana de confirmación** (`src/notification/**`), que **no pertenece al terreno autorizado de H5** (solo lectura). En el popup sí se aporta (M43, `D-H5-A`), y por eso el alta desde el popup funciona | **Observable y verificado**: aprobación en la ventana única ⇒ el SW pide el permiso **sin gesto** ⇒ Chrome lo rechaza ⇒ `permissions.request` resuelve `false` ⇒ **`4001`** con el literal «No se concedió el permiso de acceso…» y **red NO persistida** (`e2e/12-redes` T4, `networks.spec.ts`). Corrección propuesta para H6: que el botón «Aprobar» de `notification.html` pida el permiso de host de `networkPreview.rpcUrl` antes de responder `SIGN_RESPONSE` (un clic real en esa ventana SÍ es gesto válido) |

---

## 4. Criterios de aceptación de H5 (§3.5.6) — estado real

| Criterio | Estado | Evidencia |
|---|---|---|
| **`CA-RF-22`** — red destino ya activa ⇒ respuesta sin ventana; hacia otra red ⇒ **1** `pending` y, tras aprobarla, `eth_chainId` con su id y `chainChanged` en todas las pestañas | **CUMPLIDO** | `networks.spec.ts` (red ya activa ⇒ el `runner` **no** se llama, cola vacía, sin ventanas, `chainId` intacto) · `e2e/12-redes.spec.ts` (T1: `wallet_switchEthereumChain` a la red activa ⇒ `null`, 0 ventanas, cola vacía; T5: cambio aprobado ⇒ `truekeate_chain_id` nuevo y `chainChanged` en **las 2** pestañas) |
| **`CA-RF-23`** — el alta exige aprobación; la red aparece con su `chainId` **sin ser la activa**; solo un cambio posterior y aprobado cambia `eth_chainId` | **CUMPLIDO** | `networks.spec.ts` (alta ⇒ `isDefault: false`, `truekeate_chain_id` **no** cambia; denegación ⇒ `4001` y sin persistir) · `e2e/12-redes.spec.ts` (T2: aprobación en la ventana única, red persistida **sin** activar, permiso de host concedido verificado con `chrome.permissions.contains`) · **alcance del arnés** en §5 |
| **`CA-RF-24`** — `accountsChanged` y `chainChanged` a **todas** las pestañas cuando cambian desde el popup o desde la dApp | **CUMPLIDO** | `e2e/12-redes.spec.ts` T5 (`chainChanged` con el `chainId` nuevo en 2 pestañas) · `e2e/08-eventos.spec.ts` (parte `accountsChanged`, H3, sigue verde) |
| **`CA-RF-28`** — log de llamadas (método, params redactados, origen, `ts`) | **CUMPLIDO** | `e2e/15-logs.spec.ts` T1: con el popup **cerrado**, una llamada de la dApp deja **exactamente 1** entrada nueva con `event: rpc_call`, `category: call`, `method: eth_chainId`, `origin: http://localhost:5174` y `ts` numérico; el error de `eth_sign` deja `rpc_error` con `code: 4200` (`D-H5-D`) |
| **`CA-RF-29`** — log de eventos (`category: event` + campo `event`) | **CUMPLIDO** | `logger.spec.ts` (los 24 eventos del catálogo ⇒ 24 entradas, 1 por evento, con sus 6 campos) · `events.spec.ts` (catálogo cerrado: 24 eventos, 5 categorías, 4 niveles) · E2E `12-redes` (el cambio de red escribe su traza) |
| **`CA-RF-30`** — log de errores **en rojo** con su `code` | **CUMPLIDO** | `e2e/15-logs.spec.ts` T2: la fila de `storage_quota_exceeded` lleva `data-level="error"`, la clase `tk-log--error` y su `code -32603`, y el color **calculado** de su nivel es `rgb(166, 47, 47)` (`--tk-danger-dark` de `tokens.css`) frente al de una fila informativa |
| **`CA-RF-31`** — log de operaciones con hash/firma | **CUMPLIDO** | `e2e/15-logs.spec.ts` T2: la entrada de `tx_sent` muestra su `txHash` y la de `sign_personal` su firma recortada |
| **`CA-RF-46`** — `test.html` ejecuta los **7 flujos** con resultado en pantalla | **CUMPLIDO** | `e2e/22-dapp.spec.ts`: los 7 flujos (detectar, conectar, saldo, enviar, EIP-712, cambiar red, eventos) con resultado en pantalla **medido por la prueba** en < 5000 ms, hash de la transacción, firma `0x`+130 hex, `chainChanged` del cambio de red y 0 etiquetas «pendiente de hito»; los errores `4001`, `4900` y `4901` con su **acción sugerida** (3 casos) |
| **RNF-16** — 1 entrada por evento del catálogo, exportable en JSON y sin claves ni payloads íntegros | **CUMPLIDO** | `logger.spec.ts` (1 entrada por evento; `event` fuera del catálogo ⇒ `RangeError` sin persistir) · `logRedaction.spec.ts` (0 claves, 0 mnemonic, 0 payload íntegro, primeros 10 bytes de `data` + `dataLength`) · `e2e/15-logs.spec.ts` T3: la exportación JSON descarga un `Blob` **sin ninguna petición de red** y su contenido tiene las 4 entradas esperadas |
| **`CA-RT-06`** — `eth_chainId` = `0x7a69` con Anvil y **ausencia de Sepolia** en `truekeate_networks` | **CUMPLIDO** | `networks.spec.ts` («solo Anvil en el catálogo, sin Sepolia»: catálogo por defecto = `['0x7a69']` con `chainIdDecimal 31337` y `0xaa36a7` ausente) · E2E `12-redes`/`22-dapp` (la dApp y el SW operan con `0x7a69`) · `cast chain-id` **31337** |
| **RNF-23** — aviso de red no testnet | **CUMPLIDO** | `networks.spec.ts` (la vista previa publica el literal de `NON_TESTNET_WARNING` solo si `isTestnet: false`) · `e2e/12-redes.spec.ts` T3: el aviso es visible con su literal exacto al desmarcar «Es una red de pruebas» |
| **RNF-09 / RNF-14** — sin secretos en el log y sin almacén en el popup | **CUMPLIDO** | `logRedaction.spec.ts` (bloqueante) · `lint:prohibited` exit 0 (0 `chrome.storage` en `src/popup`, 0 `ethers`, 0 `fetch` propio) · `15-logs.spec.ts` T3 (el JSON exportado no contiene `mnemonic` ni `privateKey`) |
| **R13 / §2.15** — la cuota agotada es **observable** (1 reintento, `rpc_error -32603`, contador de descartes) | **CUMPLIDO** | `storageQuota.spec.ts` (relleno hasta el rechazo: **1** reintento, **1** `storage_quota_exceeded` con `code: -32603` y el mensaje «no se pudo guardar el registro por falta de espacio», contador persistido `dropped: 1`/`retries: 1` y `wallet_getLogs.dropped`; caso extremo «no cabe nada» ⇒ el descarte sigue visible) · `loggerRetry.spec.ts` (1 reintento, sin bucle) · panel `M45` con el contador a la vista |

---

## 5. Alcance verificado y NO VERIFICADO del arnés E2E (declaración honesta)

`E2E_HEADLESS` (el arnés se ejecuta **sin interfaz**): el aviso nativo de concesión de permisos de
host de Chrome **no es accionable** por Playwright (no es DOM), y se midió que la promesa de
`chrome.permissions.request` **queda pendiente** cuando el aviso aparece (sonda archivada). Por eso:

| Caso | Estado | Motivo y cobertura alternativa |
|---|---|---|
| Permiso de host **denegado** ⇒ `4001` y red **no** persistida | **VERIFICADO (E2E)** | `12-redes` T4: alta desde una dApp con sesión, aprobada en la ventana única; el SW no tiene gesto ⇒ Chrome rechaza ⇒ `4001` con el literal «No se concedió el permiso de acceso…» y `truekeate_networks` sin la red |
| Permiso de host **concedido** ⇒ alta persistida **sin** activar la red | **VERIFICADO (E2E, con origen ya concedido por el manifest)** | `12-redes` T2: el alta usa `http://127.0.0.1:8545/*`, concedido por `host_permissions` en la instalación, así que no hay aviso que responder; se verifica aprobación, persistencia con `isDefault: false`, `truekeate_chain_id` **intacto** y `chrome.permissions.contains` = `true` |
| Alta de una red **NUEVA** (chainId distinto del activo) desde el popup | **NO VERIFICADO en E2E** | Exige conceder `http://127.0.0.1:8546/*`, que **solo** se concede respondiendo al aviso nativo: imposible en `E2E_HEADLESS`. Cobertura: `networks.spec.ts` (concedido ⇒ `upsert` con `isDefault: false` y `chain_id` intacto; denegado ⇒ `4001`) y el E2E T2 (persistencia sin activación). **No se marca como superado**: queda declarado aquí y en §3.5.10 |
| Alta nacida en una **dApp** con permiso concedido | **NO VERIFICADO (defecto reportado `D-H5-B`)** | Necesita el gesto de la ventana de confirmación (`src/notification/**`, fuera del terreno de H5) |
| `4900` con el nodo detenido | **VERIFICADO (E2E)** | `22-dapp`: se detiene Anvil, el flujo muestra su resultado en < 5000 ms, el error llega con `code 4900` y la acción «Arrancar Anvil en 127.0.0.1:8545», y el nodo principal **y** el secundario se **restauran** y se comprueba que responden |
| Segunda red (Anvil 8546/31338) | **DISPONIBLE Y USADA** | `anvilMainSecundario`: el `globalSetup` la arranca si falta y lo registra; el E2E `12-redes` T5 (cambio de red) la usa y no se salta ningún caso |

---

## 6. Evidencia archivada (`RepoTecnico/evidencia/H5/`)

| Fichero | Contenido |
|---|---|
| `typecheck-2026-09-12.log`, `build-2026-09-12.log`, `lint-prohibited-2026-09-12.log`, `vitest-2026-09-12.log`, `forge-2026-09-12.log` | salida REAL de los comandos de §1 |
| `e2e-2026-09-12.json`, `e2e-2026-09-12.log`, `e2e-global-setup-2026-09-12.{log,json}` | informe JSON de Playwright (**58 passed / 0 failed / 0 skipped**), salida del comando y evidencia del `globalSetup` (build, plazos, **los dos nodos Anvil**) |
| `12-redes-2026-09-12.json` | cambio de red aprobado: `chainId` anterior/nuevo, redes persistidas y `chainChanged` recibido por **las 2** pestañas |
| `15-logs-2026-09-12.json` + `15-logs-sw-2026-09-12.json` | exportación JSON del histórico (fichero, bytes, entradas, 0 peticiones de red) y la entrada escrita por el SW **con el popup cerrado** |
| `logs-export-2026-09-12.json` | el histórico exportado tal cual lo descarga el panel |
| `21-eip6963-2026-09-12.json` | anuncio EIP-6963: `name`, `rdns`, `uuid` (estable entre anuncios), tamaño del icono, `provider` idéntico y alias congelado |
| `22-dapp-flujos-1-4-2026-09-12.json` y `22-dapp-flujos-5-7-2026-09-12.json` | los 7 flujos con sus **tiempos medidos por la prueba**, hash de la transacción, firma EIP-712, red activa e historial |
| `22-dapp-4900-2026-09-12.json` | el `4900` con el nodo detenido, su acción sugerida y la restauración de los dos nodos |
| `diagnostico-*.log` | sondas propias (ya retiradas del árbol) con las mediciones que fundamentan `D-H5-A` (gesto/prompt de permisos), `D-H5-B` (`4100` sin sesión en la aprobación de red), `D-H5-H` (ventana única: reuso y plazo de 3 s) |
| `e2e-intento1-fallido-import.log`, `e2e-intento2-fallido-vitest-concurrente.log`, `e2e-intento3-fallido-ventana-3s.log` | los tres intentos descartados, con su causa raíz (importación de `constants.ts` con `import.meta.env` en Node; servidor de la dApp caído por ejecutar Vitest **en paralelo** —`EBUSY: watch`—; ventana única perdida por registrar la espera después del clic), un defecto del **proceso de verificación**, no del producto |
