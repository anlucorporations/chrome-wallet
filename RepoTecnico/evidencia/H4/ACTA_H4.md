# ACTA H4 — Firma, aprobación y transacciones (tareas 4.16, 4.17 y 4.18)

Fecha de la batería: **2026-09-12** (UTC) · Repositorio: `C:\Users\lucci\MasterCodeCripto\GitLab\chrome-wallet`
Especificación vinculante: `plan_desarrollo.md` §3.4.7 (pruebas y evidencia) y §3.4.6 (criterios).
Regla aplicada: **no se declara cumplido nada que no se haya ejecutado**; todo resultado de esta acta es salida real.
Esta acta **sustituye** a la del 2026-09-11 en todo lo relativo a resultados de comandos y estado de los criterios.

---

## 1. Comandos ejecutados y resultado REAL

| Comando | Resultado real (esta batería) | Evidencia |
|---|---|---|
| `npx tsc -b` | **exit 0** — 0 errores (incluye `src/`, `test/` y `e2e/`) | `evidencia/H4/typecheck-2026-09-12.log` (0 bytes = sin salida) |
| `npm run build` | **exit 0** — 6 entradas en `dist/` + `dist/manifest.json` (versión 1.0.0) | `evidencia/H4/build-2026-09-12.log` |
| `npm run lint:prohibited` | **exit 0** — 127 ficheros de `src/`, 14 de `dist/`, 0 hallazgos | `evidencia/H4/lint-prohibited-2026-09-12.log` |
| `npm run test` (Vitest) | **exit 0** — **587 passed / 41 ficheros, 0 failed** | `evidencia/H4/vitest-2026-09-12.log` |
| `npm run test:e2e` (Playwright, `TK_EVIDENCE_PHASE=H4`) | **exit 1** — **42 passed / 2 failed** (ver §4) | `evidencia/H4/e2e-2026-09-12.{log,json}`, `e2e-global-setup-2026-09-12.{log,json}` |
| `npm run forge:test` | **exit 0** — **10 passed / 0 failed** | `evidencia/H4/forge-2026-09-12.log` |
| Prueba real de extremo a extremo (sonda propia, fuera de `e2e/**`) | **OK** — `node RepoTecnico/evidencia/H4/prueba-extremo-a-extremo.mjs` (ver §2) | `evidencia/H4/extremo-a-extremo-2026-09-12.{json,png}` |

---

## 2. Prueba real de extremo a extremo (§2 de la orden de trabajo)

Sonda independiente `evidencia/H4/prueba-extremo-a-extremo.mjs` (Node + Playwright, carga `dist/` como
extensión descompuesta, siembra la cartera desde el Service Worker y lee el almacén **desde el propio SW**).
Anvil `1.7.2-dev` en `127.0.0.1:8545` (`--allow-origin "*"`) y la dApp servida por `npm run dev`.

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

## 3. Qué se corrigió en esta batería (producción)

| # | Defecto | Causa raíz medida | Corrección |
|---|---|---|---|
| **D-H4-E1** | **Bloqueante**: ningún método aprobable se encolaba y la ventana de confirmación **nunca se abría** (`waitForEvent("page") Timeout 20000 ms` en `04-enviar`, `10-aprobar-tx`, `11-firmar-mensaje`) | El despacho de M19.b **ya existía** en `src/background/rpc/router.ts` (paso 6 → `defaultRouterDeps.approve` → `approvals/dispatch.ts`), pero era **inalcanzable**: `getCatalogEntry` (`rpc/catalog.ts`) filtra por `isSupportedMethod`, y los 5 aprobables restantes seguían con `implemented: false` y **fuera** de `supportedMethods`, así que el router respondía `4200` en el paso 3 **antes** del despacho | `rpc/catalog.ts`: los 6 aprobables pasan a `implemented: true` y `supportedMethods` incluye `PAGE_APPROVAL_METHODS`; en `rpc/router.ts` la guarda de contexto deja pasar `wallet_revokePermissions` desde una PÁGINA hacia el despacho de aprobaciones (desde el popup conserva el manejador interno de la tarea 3.11) |
| **D-H4-E7** (nuevo) | `10-aprobar-tx` fallaba con *strict mode violation*: `locator('.tk-section', { hasText: 'Llamada a contrato' })` resolvía a **dos** elementos | `TxPreviewPanel.tsx` anidaba un `<div className="tk-section">` dentro de la sección del panel, con el mismo texto de título | El bloque usa `tk-view` (misma disposición en columna) y deja UNA sola `tk-section` identificable por su título (`src/notification/TxPreviewPanel.tsx`) |
| **D-H4-E8** (nuevo) | `11-firmar-eip712` no veía el contrato verificador | `TypedDataPanel.tsx` pintaba `shortHex(verifyingContract)`: la dirección completa solo estaba en el `title` | Se pinta la dirección **completa** (`CA-RF-20`: el contrato verificador se muestra en claro), conservando el `title` (`src/notification/TypedDataPanel.tsx`) |
| **D-H4-E5** | `isNotificationTabUrl` comparaba solo el `pathname` | Una página de la dApp servida en `/notification.html` se confundiría con la ventana única | **Ya corregido** en `focus.ts` (exige esquema `chrome-extension:` + `host` = `runtime.id`) y verificado por `windowRediscovery.spec.ts:91` (`http://localhost:5174/notification.html` → `false`) |
| **D-H4-E6** | La traza de difusión interrumpida no rellenaba `LogEntry.txHash` | El hash viajaba solo en `data.txHash`; el panel de actividad de H5 (RF-31) lee el campo de primer nivel | **Ya corregido** en `reconcile.ts` (se rellena `txHash` cuando el dato existe) y verificado por `approvalReconcile.spec.ts:319` |
| **D-H4-E3** | Defecto del ARNÉS: `--http.corsdomain` **no existe** en Anvil 1.7.2-dev | Medido: `anvil … --http.corsdomain "*"` muere con `error: unexpected argument '--http.corsdomain' found` (y con ello toda la suite posterior sin nodo) | Documentado y corregido en `entornos_globales.md` **v2.2** §2.1: el comando del arnés es `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"`, **sin `--silent`**; se documentan los **dos** errores y que `--allow-origin` admite lista separada por comas y **no** puede repetirse |

**D-H4-E2 (regresión de H3) — VERIFICADA EN VERDE, sin defecto de producción reproducible.** Las tres
pruebas que la anterior acta daba por rojas (`08-eventos.spec.ts:73`, `08-eventos.spec.ts:162` y
`09-conectar.spec.ts:77`) están **verdes** en esta batería, tanto aisladas como dentro de la suite completa
(3 ejecuciones). Su síntoma registrado («el flujo de conexión falló: `4001`») corresponde al plazo de
conexión **inyectado por el arnés** (`VITE_CONNECT_TIMEOUT_MS=2000`, `e2e/global-setup.ts:47`): si el
equipo está cargado, la ventana `connect.html` puede tardar más de 2 s en pintar sus 5 filas con saldo real
antes de que la prueba pulse «Conectar», y el SW vence la solicitud. No se ha tocado producción por ello
(no hay defecto que corregir) y **no** se ha desactivado ni saltado ninguna prueba.

**Conflicto de spec (punto 5 de la orden) — no existe en el estado actual.** `queue.spec.ts:468-480` ya
exige `-32000` (`inflightTxInProgress`) para la 2.ª firma de la misma cuenta, que es lo que manda la
especificación (`diccionario_datos.md` §4.3 v1.10 y `errors.ts` `inflightTxInProgressError`); el código
cumple y **no** hubo que ajustar ese spec. Los dos únicos `*.spec.ts` tocados son de `messaging.spec.ts` y
codificaban una afirmación de H3 que H4 **debe** sustituir: «los 6 aprobables responden `4200` mientras la
cola no existe» y «`wallet_revokePermissions` desde una página es un aprobable sin implementar: 4200».
Ahora fijan el comportamiento vigente (despacho a M19.b) con la línea de motivo en cada uno.

---

## 4. Criterios de aceptación de H4 (§3.4.6) — estado real

| Criterio | Estado | Evidencia / motivo |
|---|---|---|
| **`CA-RF-08`** (1 ETH → hash `0x`+64 hex y recibo `status 1`) | **CUMPLIDO** | `e2e/04-enviar.spec.ts` **verde** + sonda de extremo a extremo §2: hash `0x21f9…33a6`, recibo `0x1`, cola vacía; `evidencia/H4/04-enviar-2026-09-12.json` y `extremo-a-extremo-2026-09-12.json` |
| **`CA-RF-19`** (vista previa decodificada + aviso bloqueante fuera de la tabla) | **CUMPLIDO** | `e2e/10-aprobar-tx.spec.ts` **verde**: selector `0x095ea7b3`, función `approve(address,uint256)`, datos, aviso de allowance ilimitada y UNA sola ventana con contador |
| **`CA-RF-20`** (`name` y `verifyingContract` visibles + aviso de dominio) | **CUMPLIDO** | `e2e/11-firmar-eip712.spec.ts` **verde**: la ventana muestra `TrueKeate Test App` y la dirección completa del contrato; `typedData.spec.ts` + `forge test` atan el `digest` |
| **`CA-RF-21`** (texto UTF-8 visible, aviso si hex ilegible, `eth_sign` → `4200`) | **CUMPLIDO** | `e2e/11-firmar-mensaje.spec.ts` **verde** (texto visible y firma que recupera la cuenta autorizada); `personalSign.spec.ts` (7) fija el prefijo EIP-191; `eth_sign` → `4200` por la unión cerrada |
| **`CA-RF-35`** (como máximo UNA ventana; contador `2` con 2 solicitudes) | **PARCIAL** | La unicidad de la ventana y el contador están cubiertos y verdes en Vitest (`windowQueue.spec.ts` 15 + `windowRediscovery.spec.ts` 14) y en el E2E `10` (1 ventana, contador `1`). El caso de **2 solicitudes simultáneas** (`18-concurrencia`) queda **bloqueado por el entorno** (§5) |
| **`CA-RF-37`** (2 solicitudes coexisten sin sobrescribirse) | **CUMPLIDO** | `queue.spec.ts`: dos altas simultáneas coexisten (`rmwLock.depth()`), cola intacta |
| **`CA-RF-41`** (tras resolver se cierra/avanza, la entrada desaparece y la reconciliación reasocia) | **PARCIAL** | Vitest verde (`queue.spec.ts`, `windowQueue.spec.ts`, `approvalReconcile.spec.ts`); el E2E `29` de suspensión real por CDP queda **bloqueado** (§5) |
| **`CA-RF-42` / `CA-RF-43`** (tipo 2 con comisiones > 0; `chainId` en la firma) | **CUMPLIDO** | `sign.spec.ts` (19) + `eip1559.spec.ts` (9) + `eip155.spec.ts` (6) + el hash real de §2 |
| **`CA-RF-11` (parte 2)** (reset bloqueado con cola o transacción en vuelo) | **CUMPLIDO** | `reset.spec.ts` / `state.spec.ts` (H2) + `e2e/06-reset.spec.ts` verde |
| **RNF-08** (reconstrucción < 1 s tras suspender el SW, sin huérfanas ni doble difusión) | **PARCIAL** | Vitest: 50 pendientes → `elapsedMs` 999 ms y vencimiento por alarma con reloj del stub. La suspensión real por CDP (`29-sw-suspendido`) queda **bloqueada** (§5) |
| **RNF-25** (`estimateGas` fallido bloquea el envío) | **CUMPLIDO** | `txContract.spec.ts`: `-32000` con motivo, sin escrituras y sin ventana |
| **`CA-RT-11`** (correspondencia wallet ↔ contrato) | **CUMPLIDO** | `forge test` **10/10**; la firma de M11 verifica on-chain y un byte alterado devuelve `false` |

---

## 5. Bloqueos abiertos (fuera del terreno autorizado de esta sesión)

| # | Prueba roja | Causa raíz medida | Corrección necesaria (NO aplicada: fichero prohibido) |
|---|---|---|---|
| **D-H4-E9** | `e2e/18-concurrencia.spec.ts:48` — `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5174/test.html` | La prueba usa **dos orígenes del mismo servidor** (`http://localhost:5174` y `http://127.0.0.1:5174`), pero el servidor de la dApp escucha **solo en IPv6** `[::1]:5174`: `vite.config.ts:server` declara `port: 5174` y `strictPort: true` **sin `host`**, y el valor por defecto de Vite es `localhost`, que en este equipo resuelve a `::1`. Medido: `Get-NetTCPConnection -LocalPort 5174` → `LocalAddress ::1` y `Invoke-WebRequest http://127.0.0.1:5174/test.html` → *no es posible conectar con el servidor remoto* | Añadir `host: '127.0.0.1'` (o `host: true`) al bloque `server` de **`vite.config.ts`** — **configuración**, expresamente fuera del terreno de esta sesión |
| **D-H4-E10** | `e2e/29-sw-suspendido.spec.ts:129` — la dApp recibe `-32603` en vez de `4001` | Al suspender el SW por CDP, el canal `chrome.runtime.sendMessage` del content script se cierra: `src/content-script.ts:225` (`buildResponse` → `internalTransportError()`) responde a la página **`-32603` «Error interno de la cartera.»** ~130 ms después de la suspensión (traza: `Unchecked runtime.lastError: … the message channel closed before a response was received`), y la promesa de la página se resuelve con ese error **antes** de que la alarma despierte al SW. El `4001` de la reconciliación (`reconcile.ts:392` → `deliverApprovalResolution`) sí se empuja, pero con `id = approvalId`, que **no correlaciona** con el `id` que generó la capa inject (el `TRUEKEATE_RPC` del content script no lo transporta: `src/content-script.ts:266-277`). Contradice H-07 («la capa inject/content es solo red de seguridad con margen superior y **delega siempre en el `approvalId``») | Que el relay **no** resuelva la petición de página con `internalTransportError()` cuando el canal se cierra, y que la entrega empujada por el SW se correlacione con la petición en vuelo (estado `lastApprovalId` de `src/content-script.ts:311`, hoy declarado y **nunca asignado**) — ambos en **`src/content-script.ts`**, expresamente fuera del terreno de esta sesión |

---

## 6. Conclusión

- **Vitest 587/587 en verde** (los 403 de H1–H3 intactos), `tsc -b`, `build`, `lint:prohibited` y `forge:test` (10/10) en verde.
- **E2E 42 passed / 2 failed**: los 6 E2E del hito que estaban rojos por `D-H4-E1` (`04-enviar`, `10-aprobar-tx`, `11-firmar-eip712`, `11-firmar-mensaje`, más las partes de `18`/`29` que no dependen del entorno) y las 3 pruebas de H3 de `D-H4-E2` están **verdes**; quedan rojas **exactamente dos**, ambas por causas **fuera del terreno autorizado** (§5) y **ninguna** por la ruta de aprobación.
- **H4 queda EN CURSO, no completado**: `CA-RF-35`, `CA-RF-41` (parte E2E) y RNF-08 (parte E2E) siguen **PARCIAL** hasta que se apliquen las dos correcciones de §5. Los criterios `CA-RF-08`, `CA-RF-19`, `CA-RF-20`, `CA-RF-21`, `CA-RF-37`, `CA-RF-42`, `CA-RF-43`, `CA-RF-11` (parte 2), RNF-25 y `CA-RT-11` quedan **CUMPLIDOS**.
