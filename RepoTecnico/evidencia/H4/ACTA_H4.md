# ACTA H4 — Firma, aprobación y transacciones (tareas 4.16, 4.17 y 4.18)

Fecha de la batería de cierre: **2026-09-12** (UTC) · Repositorio: `C:\Users\lucci\MasterCodeCripto\GitLab\chrome-wallet`
Especificación vinculante: `plan_desarrollo.md` §3.4.7 (pruebas y evidencia) y §3.4.6 (criterios).
Regla aplicada: **no se declara cumplido nada que no se haya ejecutado**; todo resultado de esta acta es salida real.
Esta acta **sustituye** a las del 2026-09-11 y del 2026-09-12 (primera pasada) en todo lo relativo a resultados de comandos y estado de los criterios.

---

## 1. Comandos ejecutados y resultado REAL

| Comando | Resultado real (batería de cierre) | Evidencia |
|---|---|---|
| `npx tsc -b` | **exit 0** — 0 errores (incluye `src/`, `test/` y `e2e/`) | `evidencia/H4/typecheck-2026-09-12.log` (0 bytes = sin salida) |
| `npm run build` | **exit 0** — 6 entradas en `dist/` + `dist/manifest.json` (versión 1.0.0) | `evidencia/H4/build-2026-09-12.log` |
| `npm run lint:prohibited` | **exit 0** — 127 ficheros de `src/`, 14 de `dist/`, 0 hallazgos | `evidencia/H4/lint-prohibited-2026-09-12.log` |
| `npm run test` (Vitest) | **exit 0** — **587 passed / 41 ficheros, 0 failed** (los 403 de H1–H3 intactos) | `evidencia/H4/vitest-2026-09-12.log` |
| `npm run test:e2e` (Playwright, `TK_EVIDENCE_PHASE=H4`) | **exit 0** — **44 passed / 0 failed / 0 skipped** (los 37 de H1–H3 siguen verdes) | `evidencia/H4/e2e-2026-09-12.{log,json}`, `e2e-global-setup-2026-09-12.{log,json}` |
| `npm run forge:test` | **exit 0** — **10 passed / 0 failed** | `evidencia/H4/forge-2026-09-12.log` |
| Prueba real de extremo a extremo (sonda propia, fuera de `e2e/**`) | **OK** — `node RepoTecnico/evidencia/H4/prueba-extremo-a-extremo.mjs` (ver §2) | `evidencia/H4/extremo-a-extremo-2026-09-12.{json,png}` |
| `e2e/29-sw-suspendido.spec.ts` (suspensión REAL del SW por CDP) | **verde** — la alarma despierta al SW, la cola queda sin huérfanas, la dApp recibe **`4001`** («plazo establecido»), `nonce` sin avanzar y reconstrucción **< 1 s** | `evidencia/H4/29-sw-suspendido-2026-09-12.{json,log}` |
| `e2e/18-concurrencia.spec.ts` (2 orígenes del mismo servidor) | **verde** — 2 `pending` coexistentes en **UNA** sola ventana con contador «2 solicitudes en espera» y las dos firmas obtenidas de esa MISMA ventana | `evidencia/H4/18-concurrencia-2026-09-12.json` |

**Entorno de la batería:** Anvil `1.7.2-dev` en `127.0.0.1:8545` (`cast chain-id` = **31337**), arrancado con **`anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"`** **sin `--silent`**; dApp autoservida por el `webServer` de `playwright.config.ts` con **`server: { host: '127.0.0.1', port: 5174, strictPort: true }`** en `vite.config.ts`; `dist/` reconstruido por el `global-setup` con los plazos inyectados (`VITE_SIGN_TIMEOUT_MS=3000`, `VITE_CONNECT_TIMEOUT_MS=2000`).

---

## 2. Prueba real de extremo a extremo (§2 de la orden de trabajo)

Sonda independiente `evidencia/H4/prueba-extremo-a-extremo.mjs` (Node + Playwright, carga `dist/` como
extensión descompuesta, siembra la cartera desde el Service Worker y lee el almacén **desde el propio SW**).

| Paso | Observado (real) |
|---|---|
| `test.html` envía 1 ETH con `window.truekeate.request({ method: 'eth_sendTransaction', … })` | petición lanzada para `0xf39F…2266` → `0x7099…79C8`, `value 0xde0b6b3a7640000` |
| Ventanas `notification.html` abiertas | **1** (`ventanasAbiertas: 1`) |
| Origen y encabezado de la ventana | `http://localhost:5174` · panel **«Envío de transacción»** · contador **«1 solicitud en espera»** |
| Vista previa decodificada | etiquetas `Cuenta`, `Destino`, `Valor`, `Red`, `Comisión estimada`, `Tipo de transacción`, `Plazo`; 1 aviso de riesgo visible |
| Aprobar en la ventana → la dApp recibe el hash | `0x21f97614e3117d6e9083ba46b8b2be20c428008e5f6801adcc19fc00741833a6` |
| Recibo consultado DIRECTAMENTE al nodo (`eth_getTransactionReceipt`) | `status 0x1`, `blockNumber 0x1`, `from`/`to` los esperados |
| Cola persistida `truekeate_pending_requests` | **vacía** (`colaVacia: true`, 0 entradas) |
| Marca `truekeate_inflight_tx` | `phase: 'broadcast'` con ese `txHash` → **cuenta LIBERADA** (ya no bloquea: solo `signing` bloquea, §2.12 regla 2) |
| Traza `truekeate_logs` | `tx_sent` con `txHash` y `origin` |
| Saldo de la cuenta #0 | `10 000 ETH` → gastado `1 000 042 000 000 000 000` wei (1 ETH + comisión) |

---

## 3. Qué se corrigió en H4 (producción y arnés)

| # | Defecto | Causa raíz medida | Corrección |
|---|---|---|---|
| **D-H4-E1** | **Bloqueante**: ningún método aprobable se encolaba y la ventana de confirmación **nunca se abría** (`waitForEvent("page") Timeout 20000 ms` en `04-enviar`, `10-aprobar-tx`, `11-firmar-mensaje`) | El despacho de M19.b **ya existía** en `src/background/rpc/router.ts` (paso 6 → `defaultRouterDeps.approve` → `approvals/dispatch.ts`), pero era **inalcanzable**: `getCatalogEntry` (`rpc/catalog.ts`) filtra por `isSupportedMethod`, y los 5 aprobables restantes seguían con `implemented: false` y **fuera** de `supportedMethods`, así que el router respondía `4200` en el paso 3 **antes** del despacho | `rpc/catalog.ts`: los 6 aprobables pasan a `implemented: true` y `supportedMethods` incluye `PAGE_APPROVAL_METHODS`; en `rpc/router.ts` la guarda de contexto deja pasar `wallet_revokePermissions` desde una PÁGINA hacia el despacho de aprobaciones (desde el popup conserva el manejador interno de la tarea 3.11) |
| **D-H4-E7** (nuevo) | `10-aprobar-tx` fallaba con *strict mode violation*: `locator('.tk-section', { hasText: 'Llamada a contrato' })` resolvía a **dos** elementos | `TxPreviewPanel.tsx` anidaba un `<div className="tk-section">` dentro de la sección del panel, con el mismo texto de título | El bloque usa `tk-view` (misma disposición en columna) y deja UNA sola `tk-section` identificable por su título (`src/notification/TxPreviewPanel.tsx`) |
| **D-H4-E8** (nuevo) | `11-firmar-eip712` no veía el contrato verificador | `TypedDataPanel.tsx` pintaba `shortHex(verifyingContract)`: la dirección completa solo estaba en el `title` | Se pinta la dirección **completa** (`CA-RF-20`: el contrato verificador se muestra en claro), conservando el `title` (`src/notification/TypedDataPanel.tsx`) |
| **D-H4-E5** | `isNotificationTabUrl` comparaba solo el `pathname` | Una página de la dApp servida en `/notification.html` se confundiría con la ventana única | **Ya corregido** en `focus.ts` (exige esquema `chrome-extension:` + `host` = `runtime.id`) y verificado por `windowRediscovery.spec.ts:91` (`http://localhost:5174/notification.html` → `false`) |
| **D-H4-E6** | La traza de difusión interrumpida no rellenaba `LogEntry.txHash` | El hash viajaba solo en `data.txHash`; el panel de actividad de H5 (RF-31) lee el campo de primer nivel | **Ya corregido** en `reconcile.ts` (se rellena `txHash` cuando el dato existe) y verificado por `approvalReconcile.spec.ts:319` |
| **D-H4-E3** | Defecto del ARNÉS: `--http.corsdomain` **no existe** en Anvil 1.7.2-dev | Medido: `anvil … --http.corsdomain "*"` muere con `error: unexpected argument '--http.corsdomain' found` (y con ello toda la suite posterior sin nodo) | Documentado y corregido en `entornos_globales.md` **v2.2** §2.1: el comando del arnés es `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"`, **sin `--silent`**; se documentan los **dos** errores y que `--allow-origin` admite lista separada por comas y **no** puede repetirse |
| **D-H4-E9** | `18-concurrencia` rojo con `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5174/test.html` | La prueba necesita **dos orígenes del mismo servidor** (`localhost` y `127.0.0.1`), pero el servidor de la dApp escuchaba **solo en IPv6** `[::1]:5174`: `vite.config.ts` declaraba `server: { port: 5174, strictPort: true }` **sin `host`** (medido: `netstat` → `::1:5174`) | **Corregido** en **`vite.config.ts`**: `server: { host: '127.0.0.1', port: 5174, strictPort: true }` (y el mismo `host` en `preview`): la dApp responde ya en `http://127.0.0.1:5174/test.html` y la prueba abre sus dos orígenes contra el MISMO servidor |
| **D-H4-E10** | `29-sw-suspendido` rojo: la dApp recibía **`-32603`** en lugar de `4001` ~130 ms después de suspender el SW, antes de que la alarma lo despertara | (1) Al cerrarse el canal `chrome.runtime.sendMessage` del relay, `src/content-script.ts` (`buildResponse` → `internalTransportError()`) respondía **`-32603`** de inmediato. (2) El `4001` de la reconciliación **sí** se empujaba, pero con `id = approvalId`, que **no correlaciona** con el `id` que genera la capa inject: el `TRUEKEATE_RPC` del relay **no lo transportaba** y `lastApprovalId` estaba declarado y **nunca asignado**. Contradecía H-07 | **Corregido** en tres piezas: (a) `src/content-script.ts` ya **no** resuelve la petición con `-32603` al cerrarse el canal: reintenta **solo** cuando el fallo garantiza que el mensaje no llegó a nadie (`Could not establish connection. Receiving end does not exist.`) y, en cualquier otro fallo de transporte, **espera** la resolución empujada hasta agotar `SIGN_TIMEOUT_MS + TIMEOUT_SAFETY_MARGIN_MS`; (b) la **correlación del salto 1** viaja como `requestId` en el sobre `TRUEKEATE_RPC` (`shared/protocol.ts`), el router la propaga (`rpc/router.ts` → `approvals/dispatch.ts` → `approvals/queue.ts`) y se **persiste** con la entrada (`PendingRequest.requestId`, `shared/types.ts`), de modo que `deliverApprovalResolution` responde con **ese** `id` y no con `approvalId`, sobreviviendo a la suspensión del SW; (c) `lastApprovalId` se asigna al **observar** el `approvalId` que acompaña a la resolución empujada, sin transformar el sobre (H-39) |
| **D-H4-E11** | Defecto medido al poner `18-concurrencia` en verde: el cuerpo de la SIGUIENTE solicitud **nunca** llegaba a la ventana única, que se quedaba con la anterior | El empuje iba por **`chrome.tabs.sendMessage(tabId, …)`** y `notification.html` es una **página de la extensión**, no un content script: medido con sonda propia (Playwright + `dist/`), `chrome.tabs.sendMessage` a una pestaña con una página `chrome-extension://` responde **`Could not establish connection. Receiving end does not exist.`**; además el `tabId` era irresoluble sin el permiso `tabs` (retirado en H-36: `windows.getAll({ populate: true })` devuelve `url: null`) | **Corregido** en `approvals/ports.ts`: el empuje usa **`chrome.runtime.sendMessage`**, el único canal que alcanza a las páginas de la extensión, conservando `tabs.sendMessage` como respaldo para receptores que sí sean content scripts. **RNF-09 verificado con la misma sonda**: un `chrome.runtime.sendMessage` emitido por el SW **no** llega a los content scripts (la dApp no recibe nada) |
| **D-H4-E12** | Defecto medido en el mismo flujo: la ventana mostraba la siguiente solicitud pero su botón «Aprobar» quedaba **deshabilitado** y la cola se atascaba | `handleSignResponse` re-renderizaba la ventana (y empujaba la siguiente solicitud) **dentro** del mismo ciclo que la respuesta a `notification.html`, así que el empuje llegaba **antes** de que la ventana procesara su propio `SIGN_RESPONSE` y el `setOutcome('approved')`/`decided` posterior pisaba el estado del empuje (medido: `Aprobar` deshabilitado con la solicitud `pending` correcta en la ventana) | **Corregido**: `background.ts` responde `SIGN_RESPONSE` **primero** y hace la pasada de M18 **después** (`refreshApprovalWindowAfterDecision` → `showOldestPending({ repush: true })`), con `responses.ts` aceptando `refresh: false` y `focus.ts` re-entregando el cuerpo (idempotente) cuando la ventana ya mostraba esa solicitud |

**D-H4-E2 (regresión de H3) — VERIFICADA EN VERDE, sin defecto de producción reproducible.** Las tres
pruebas que una acta anterior daba por rojas (`08-eventos.spec.ts:73`, `08-eventos.spec.ts:162` y
`09-conectar.spec.ts:77`) están **verdes** en la batería de cierre. Su síntoma registrado («el flujo de conexión falló: `4001`»)
corresponde al plazo de conexión **inyectado por el arnés** (`VITE_CONNECT_TIMEOUT_MS=2000`, `e2e/global-setup.ts:47`): si el
equipo está cargado, la ventana `connect.html` puede tardar más de 2 s en pintar sus 5 filas con saldo real
antes de que la prueba pulse «Conectar», y el SW vence la solicitud. No se ha tocado producción por ello
(no hay defecto que corregir) y **no** se ha desactivado ni saltado ninguna prueba.

**Conflicto de spec.** `queue.spec.ts:468-480` ya exigía `-32000` (`inflightTxInProgress`) para la 2.ª firma de la
misma cuenta, que es lo que manda la especificación: el código cumple y **no** hubo que ajustar ese spec. Los
`*.spec.ts` tocados son: `messaging.spec.ts` (dos aserciones de H3 que H4 **debe** sustituir: «los 6 aprobables
responden `4200`» → ahora fijan el despacho a M19.b, con la línea de motivo) y **una línea** de
`e2e/18-concurrencia.spec.ts:81`, que contaba las ventanas de forma **síncrona** antes de esperar su apertura,
que es **asíncrona y posterior** a la escritura de la cola (§2.14: `enqueue` → `showOldestPending` →
`chrome.windows.create`); ahora espera la condición observable (`esperarVentanaDeDecision`) y **después** cuenta
—la expectativa del corpus («exactamente 1 `notification.html`») **no** cambia y **no** se relaja ninguna aserción—.

---

## 4. Criterios de aceptación de H4 (§3.4.6) — estado real

| Criterio | Estado | Evidencia / motivo |
|---|---|---|
| **`CA-RF-08`** (1 ETH → hash `0x`+64 hex y recibo `status 1`) | **CUMPLIDO** | `e2e/04-enviar.spec.ts` **verde** + sonda de extremo a extremo §2: hash `0x21f9…33a6`, recibo `0x1`, cola vacía; `evidencia/H4/04-enviar-2026-09-12.json` y `extremo-a-extremo-2026-09-12.json` |
| **`CA-RF-19`** (vista previa decodificada + aviso bloqueante fuera de la tabla) | **CUMPLIDO** | `e2e/10-aprobar-tx.spec.ts` **verde**: selector `0x095ea7b3`, función `approve(address,uint256)`, datos, aviso de allowance ilimitada y UNA sola ventana con contador |
| **`CA-RF-20`** (`name` y `verifyingContract` visibles + aviso de dominio) | **CUMPLIDO** | `e2e/11-firmar-eip712.spec.ts` **verde**: la ventana muestra `TrueKeate Test App` y la dirección completa del contrato; `typedData.spec.ts` + `forge test` atan el `digest` |
| **`CA-RF-21`** (texto UTF-8 visible, aviso si hex ilegible, `eth_sign` → `4200`) | **CUMPLIDO** | `e2e/11-firmar-mensaje.spec.ts` **verde** (texto visible y firma que recupera la cuenta autorizada); `personalSign.spec.ts` fija el prefijo EIP-191; `eth_sign` → `4200` por la unión cerrada |
| **`CA-RF-35`** (como máximo UNA ventana; contador `2` con 2 solicitudes) | **CUMPLIDO** | `e2e/18-concurrencia.spec.ts` **verde**: 2 `pending` simultáneas de dos orígenes del mismo servidor en **UNA** sola ventana, contador «2 solicitudes en espera» y ambas firmas decididas desde esa MISMA ventana; en Vitest lo fijan `windowQueue.spec.ts` y `windowRediscovery.spec.ts`. Cierra **D-H4-E9** (host de Vite), **D-H4-E11** (canal del empuje) y **D-H4-E12** (orden respecto de `SIGN_RESPONSE`) |
| **`CA-RF-37`** (2 solicitudes coexisten sin sobrescribirse) | **CUMPLIDO** | `queue.spec.ts`: dos altas simultáneas coexisten (`rmwLock.depth()`), cola intacta; `18-concurrencia` observa las 2 entradas `pending` en la cola persistida |
| **`CA-RF-41`** (tras resolver se cierra/avanza, la entrada desaparece y la reconciliación reasocia) | **CUMPLIDO** | `e2e/29-sw-suspendido.spec.ts` **verde**: con el SW suspendido por CDP a mitad de aprobación, la alarma despierta al SW, la cola queda **sin huérfanas**, la dApp recibe **`4001`** («plazo establecido») y la reconstrucción mide **< 1 s**; Vitest lo fijan `queue.spec.ts`, `windowQueue.spec.ts` y `approvalReconcile.spec.ts`. Cierra **D-H4-E10** |
| **`CA-RF-42` / `CA-RF-43`** (tipo 2 con comisiones > 0; `chainId` en la firma) | **CUMPLIDO** | `sign.spec.ts` + `eip1559.spec.ts` + `eip155.spec.ts` + el hash real de §2 |
| **`CA-RF-11` (parte 2)** (reset bloqueado con cola o transacción en vuelo) | **CUMPLIDO** | `reset.spec.ts` / `state.spec.ts` (H2) + `e2e/06-reset.spec.ts` verde |
| **RNF-08** (reconstrucción < 1 s tras suspender el SW, sin huérfanas ni doble difusión) | **CUMPLIDO** | `e2e/29-sw-suspendido.spec.ts` **verde**: `msReconstruccion < 1 000`, `nonce` sin avanzar (0 doble difusión) y `truekeate_inflight_tx` vacío; en Vitest, 50 pendientes con reloj del stub |
| **RNF-25** (`estimateGas` fallido bloquea el envío) | **CUMPLIDO** | `txContract.spec.ts`: `-32000` con motivo, sin escrituras y sin ventana |
| **`CA-RT-11`** (correspondencia wallet ↔ contrato) | **CUMPLIDO** | `forge test` **10/10**; la firma de M11 verifica on-chain y un byte alterado devuelve `false` |

**Resultado: los 13 criterios de H4 quedan CUMPLIDOS.**

---

## 5. Bloqueos abiertos

**Ninguno.** Los dos bloqueos que arrastraba H4 quedan **cerrados y verificados** en esta batería:

| # | Estado | Verificación |
|---|---|---|
| **D-H4-E9** | ✅ **CERRADO** | `vite.config.ts` declara `server.host: '127.0.0.1'`; `e2e/18-concurrencia.spec.ts` abre sus dos orígenes (`http://localhost:5174` y `http://127.0.0.1:5174`) contra el MISMO servidor y pasa |
| **D-H4-E10** | ✅ **CERRADO** | `e2e/29-sw-suspendido.spec.ts` en verde: la dApp recibe `4001` (no `-32603`), la cola se purga y no hay doble difusión |
| **D-H4-E11** / **D-H4-E12** | ✅ **CERRADOS** | Detectados y corregidos al poner `18-concurrencia` en verde (canal del empuje a la ventana única y orden respecto de la respuesta de la decisión); verificados por ese mismo E2E |

---

## 6. Conclusión

- **Vitest 587/587 en verde** (los 403 de H1–H3 intactos), `tsc -b`, `build`, `lint:prohibited` y `forge:test` (10/10) en verde.
- **E2E 44 passed / 0 failed / 0 skipped**: los 37 de H1–H3 siguen verdes y los 6 del hito (`04-enviar`, `10-aprobar-tx`, `11-firmar-eip712`, `11-firmar-mensaje`, `18-concurrencia` y `29-sw-suspendido`) también.
- **H4 queda ✅ COMPLETADO (2026-09-12)**: los 13 criterios de aceptación quedan **CUMPLIDOS** y **no queda ningún bloqueo abierto**. El hito en curso pasa a **H5 — Redes y observabilidad**.
