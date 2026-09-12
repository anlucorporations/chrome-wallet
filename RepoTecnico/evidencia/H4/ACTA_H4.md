# ACTA H4 — Firma, aprobación y transacciones (tareas 4.16, 4.17 y 4.18)

Fecha de la batería: **2026-09-11 / 2026-09-12** (UTC) · Repositorio: `C:\Users\lucci\MasterCodeCripto\GitLab\chrome-wallet`
Especificación vinculante: `plan_desarrollo.md` §3.4.7 (pruebas y evidencia) y §3.4.6 (criterios).
Regla aplicada: **no se declara cumplido nada que no se haya ejecutado**; todo resultado de esta acta es salida real.

---

## 1. Comandos ejecutados y resultado REAL

| Comando | Resultado real (esta batería) | Evidencia |
|---|---|---|
| `npx tsc -b` | **exit 0** — 0 errores (incluye `src/`, `test/` y `e2e/`) | `evidencia/H4/typecheck-2026-09-11.log` (0 bytes = sin salida) |
| `npm run build` | **exit 0** — 6 entradas en `dist/` + `dist/manifest.json` (versión 1.0.0) | salida de consola de la sesión |
| `npm run test` (Vitest) | **exit 0** — **574 passed / 40 ficheros, 0 failed** (403 previos de H1–H3 siguen verdes + 168 nuevos + 3 añadidos por el trabajo de H4 en curso) | `evidencia/H4/vitest-2026-09-11.log` |
| `npm run lint:prohibited` | **exit 0** — 122 ficheros de `src/`, 14 de `dist/`, 0 hallazgos | `evidencia/H4/lint-prohibited-2026-09-11.log` |
| `npm run forge:test` | **exit 0** — **10 passed / 0 failed** (7 previos + 3 nuevos de la correspondencia wallet ↔ contrato) | `evidencia/H4/forge-2026-09-11.log` |
| `npm run coverage` | **exit 0** — ramas: **80,86 % total**, `crypto/` **85,94 %**, `approvals/` **72,51 %**, `shared/validation/` **91,09 %** | `evidencia/H4/coverage-2026-09-11.log`, `coverage-summary-2026-09-11.json` |
| `npm run test:e2e` (Playwright, `TK_EVIDENCE_PHASE=H4`) | **exit 1** — **34 passed / 9 failed** (ver §4) | `evidencia/H4/e2e-2026-09-12.json`, `e2e-global-setup-2026-09-12.{json,log}` |

> **Los 403 Vitest previos siguen verdes** (574 ≥ 403). **Los 37 E2E previos NO se mantienen**: 3 de los 9 fallos son de suites de H3 (`08-eventos` ×2 y `09-conectar`) y no pertenecen a mi alcance; los otros 6 son los cinco specs nuevos de H4 más `04-enviar`, y su causa raíz está en el hueco de producción descrito en §5 (D-H4-E1), no en las propias pruebas.

---

## 2. Vitest creado (12 ficheros, 168 tests) — todos en verde

| Fichero | Tests | Qué fija |
|---|---|---|
| `src/background/approvals/queue.spec.ts` | **22** | `Record<approvalId, PendingRequest>`, dos altas simultáneas que **coexisten** (`rmwLock` con `depth()===4`), cardinalidad 8/1/6, duplicado `-32603`, purga perezosa, FIFO, resolución + purga (`CA-RF-41`), duplicados ignorados, `expired` prevalece, badge derivado, `truekeate_inflight_tx` (`signing` bloquea / `broadcast` libera / TTL) |
| `src/background/approvals/payloadLimit.spec.ts` | **6** | 64 KiB exactos aceptados; 64 KiB + 1 byte → **`-32602` sin escribir NADA** (ni cola ni ventana de tasa); medida en **bytes UTF-8** (32 761 «á» = 65 537 B rechazados, 65 535 B aceptados); payload no serializable = infinito; tope inyectable |
| `src/background/approvals/approvalTimeout.spec.ts` | **17** | **fake timers + reloj del stub de `chrome.alarms`**: 119 999 ms no disparan y 1 ms más sí (sin esperar 120 s); nombres de alarma; entrega del `4001` del literal con traza `approval_expired` **redactada**; idempotencia; rearme desde el `expiresAt` persistido sin disparar; `reconcileInflightAlarms` |
| `src/background/approvals/approvalReconcile.spec.ts` | **14** | purga de resueltas y **ya vencidas** con `4001` a las huérfanas y **1** traza `sw_reconcile`; rearme sin disparar; idempotencia; **50 pendientes con reloj inyectado → `elapsedMs` 999 < 1 s (RNF-08)**; reconstrucción de `inflight` (liberada/confirmada/descartada); ventana única y `rate_windows` |
| `src/background/approvals/windowQueue.spec.ts` | **15** | ventana **global única** (medidas 420×640, `windows.update` con foco), re-render de la siguiente en la MISMA ventana, cierre sin pendientes, contador «N en espera» + badge, `focusLock` serializando dos pasadas (una sola ventana), entrada no presentable, **X = rechazo `4001`** y X con plazo vencido = `expired` |
| `src/background/approvals/windowRediscovery.spec.ts` | **14** | re-descubrimiento por URL `notification.html` (con `?query`) sin abrir una segunda ventana, reparación del `windowId` persistido, `isNotificationTabUrl`, proyección/escritura de `truekeate_approval_window` |
| `src/background/crypto/sign.spec.ts` | **19** | tipo 2 con envoltorio `0x02`, hash `0x`+64 = `keccak256(raw)`, recuperación del firmante, determinismo RFC 6979, despliegue con `to: null`, `gasLimit` 0 omitido, `unknownAccount` sin firmar con clave ajena, `4901` para red ajena |
| `src/background/crypto/eip1559.spec.ts` | **9** | `maxFeePerGas`/`maxPriorityFeePerGas` **> 0** siempre (nodo, 0, nulo, hex, negativo), `maxFee ≥ maxPriority`, y la transacción FIRMADA con comisiones derivadas |
| `src/background/crypto/eip155.spec.ts` | **6** | `v = chainId*2+35/36` (62 709/62 710), firma legada tipo 0, **la firma solo se recupera con el `unsignedHash` de su `chainId`** (en otra red da otra cuenta) y `4901` |
| `src/background/crypto/typedData.spec.ts` | **11** | `EIP712Domain` fuera de `types` sin mutar, `primaryType` declarado/inferido, `digest` = `TypedDataEncoder.hash`, firma recuperable, **un byte alterado del mensaje rompe la correspondencia**, dominio atado (`chainId`/`verifyingContract`/`name`) y **`digest` idéntico al del fixture de Forge** |
| `src/background/crypto/personalSign.spec.ts` | **7** | prefijo literal `\x19Ethereum Signed Message:\n<longitud>` byte a byte, `keccak256(prefijo‖mensaje)`, hex = BYTES (`0x686f6c61` ≡ `hola`), UTF-8 por bytes, mensaje vacío, recuperación con `verifyMessage` |
| `src/background/rpc/txContract.spec.ts` | **28** | **hash al difundir** (`eth_sendRawTransaction`), respuesta sin hash `-32603`, rechazo del nodo → `-32000 broadcastRejected` con motivo accionable, transporte → `4900`; **`estimateGas` bloqueante** (`-32000` + motivo, **sin escribir nada y sin ventana**, RNF-25); `pending → confirmed/reverted/failed` con **una transición por cambio** y plazo agotado; comisiones/nonce/código |

**Forge — `contracts/test/EIP712Verifier.t.sol` ampliado (+3 casos) y fixture nuevo `contracts/test/fixtures/eip712-wallet-signature.json`**, generado **por la propia wallet** (M11 `signTypedData`, la vía de `eth_signTypedData_v4`) sobre el dominio `TrueKeate Test App` (`chainId 31337`, `verifyingContract 0x8464135c8F25Da09e49BC8782676a84730C318bC`):
`test_WalletSignatureVerifiesOnChain` (el contrato recompone on-chain el MISMO `digest` y `verify`/`verifyTypedData` → `true`), `test_WalletSignatureWithOneAlteredMessageByteReturnsFalse` (un byte alterado del `content`, `nonce`, `deadline` o un bit del `digest` → `false`) y `test_WalletSignatureRejectsForeignSignerAndDomain` (otro firmante/`chainId`/`verifyingContract` → `false`).

---

## 3. Playwright creado (6 specs) y arnés

| Spec | Estado real | Motivo medido |
|---|---|---|
| `e2e/04-enviar.spec.ts` | **FALLIDO** | 1.ª ejecución: `waitForEvent("page")` 20 s agotados, **la extensión no abrió `notification.html`**; última: el paso previo de conexión devolvió `4001` |
| `e2e/10-aprobar-tx.spec.ts` | **FALLIDO** | `waitForEvent("page")` 20 s: no se abre la ventana de confirmación (no hay encolado) |
| `e2e/11-firmar-eip712.spec.ts` | **FALLIDO** | fallo previo de conexión de la dApp («Sin respuesta en 5000 ms») |
| `e2e/11-firmar-mensaje.spec.ts` | **FALLIDO** | `waitForEvent("page")` 20 s: no se abre la ventana de confirmación |
| `e2e/18-concurrencia.spec.ts` | **FALLIDO** | fallo previo de conexión A (`4001`) |
| `e2e/29-sw-suspendido.spec.ts` | **FALLIDO** | fallo previo de conexión de la dApp; en la 1.ª ejecución, `ECONNREFUSED 127.0.0.1:8545` porque **`27-rpc-caido` dejó el nodo caído** (defecto del arnés, ya corregido: D-H4-E3) |

Ampliaciones del arnés (permitidas y dentro de mi alcance): en `e2e/fixtures/extension.ts` se añadieron `iniciarPeticionDeFirma`/`leerResultadoDeFirma`/`esperarResultadoDeFirma` (petición de firma sin bloquear la prueba), `esperarVentanaDeDecision`/`ventanasDeDecision`/`leerContadorDeLaVentana`, `aprobarEnLaVentana`/`rechazarEnLaVentana` (marcan los avisos bloqueantes), `contarPendientes`, `archivarEvidencia` y `ESPERA_FIRMA_MS`; **no se rompió ninguna de las suites existentes por estas ayudas**.

---

## 4. Criterios de aceptación de H4 (§3.4.6) — estado real

| Criterio | Estado | Evidencia / motivo |
|---|---|---|
| **`CA-RF-08`** (1 ETH → hash `0x`+64 hex y recibo `status 1`) | **NO CUMPLIDO** | `e2e/04-enviar.spec.ts` rojo: la extensión **no abre la ventana** para `eth_sendTransaction` porque ninguna ruta de producción encola métodos aprobables (D-H4-E1). No hay ningún otro test que lo cubra |
| **`CA-RF-19`** (preview con selector/función/args + aviso bloqueante fuera de la tabla) | **NO CUMPLIDO** | `e2e/10-aprobar-tx.spec.ts` rojo por el mismo hueco. La tabla local de M66 (`approvals/calldata.ts`) **no tiene spec en mi alcance** (`calldata.spec.ts` figura en §3.4.7 fuera de la lista asignada) |
| **`CA-RF-20`** (`name` y `verifyingContract` visibles + aviso de dominio) | **PARCIAL / NO CUMPLIDO** | `typedData.spec.ts` (11 tests) demuestra que M11 conserva `domain.name`, `verifyingContract` y `chainId` y que el `digest` está atado a ellos; la **visibilidad en la UI** no se pudo verificar (`e2e/11-firmar-eip712.spec.ts` rojo) y `domainChainMismatch` vive en `preview.ts`, sin spec asignada |
| **`CA-RF-21`** (texto UTF-8 visible, aviso si hex ilegible, `eth_sign` → `4200`) | **PARCIAL / NO CUMPLIDO** | `personalSign.spec.ts` (7 tests) fija el prefijo EIP-191 y la interpretación hex/UTF-8 byte a byte; `eth_sign → 4200` está cubierto por H3 (`errors.spec.ts`/`eip1193.spec.ts`). La UI (`PersonalSignPanel`) no se pudo verificar extremo a extremo |
| **`CA-RF-35`** (como máximo UNA ventana; contador `2` con 2 solicitudes) | **CUMPLIDO en Vitest; E2E BLOQUEADO** | `windowQueue.spec.ts` (15) + `windowRediscovery.spec.ts` (14): una sola llamada a `windows.create` incluso con dos pasadas simultáneas, foco, contador y badge derivados. El E2E `10`/`18` no llega a ejecutarse por D-H4-E1 |
| **`CA-RF-37`** (2 solicitudes coexisten sin sobrescribirse) | **CUMPLIDO** | `queue.spec.ts`: `Promise.all` de dos altas de orígenes distintos → mapa con las dos entradas intactas y `rmwLock.depth() === 4` con 4 altas concurrentes. El puerto de larga vida (`ports.ts`) queda fuera de mi lista asignada (`approvalResume.spec.ts` en §3.4.7) |
| **`CA-RF-41`** (tras resolver se cierra/avanza, la entrada desaparece y la reconciliación reasocia) | **CUMPLIDO** | `queue.spec.ts` (purga + `resolvedAt` + duplicado ignorado), `windowQueue.spec.ts` (X → rechazo y purga) y `approvalReconcile.spec.ts` (huérfanas con `4001`, rearme por `approvalId`) |
| **`CA-RF-42` / `CA-RF-43`** (tipo 2 con comisiones > 0; `chainId` dentro de la firma) | **CUMPLIDO** | `sign.spec.ts` (19) + `eip1559.spec.ts` (9) + `eip155.spec.ts` (6): envoltorio `0x02`, comisiones derivadas > 0 con el nodo devolviendo 0/nulo, `v = chainId*2+35/36` y firma **no replicable** en otra red |
| **`CA-RF-11` (parte 2)** (reset bloqueado con cola o transacción en vuelo) | **CUMPLIDO por la suite de H2** | `state.spec.ts` / `reset.spec.ts` (guarda `checkResetGuards` con `pendingCount`/`inflightCount`), ya verdes en la base de 403 |
| **RNF-08** (reconstrucción < 1 s tras suspender el SW, sin huérfanas ni doble difusión) | **PARCIAL** | Vitest: **50 pendientes → `elapsedMs` 999 ms** (`approvalReconcile.spec.ts`) y vencimiento por alarma con reloj del stub (`approvalTimeout.spec.ts`). La suspensión real por CDP (`e2e/29-sw-suspendido.spec.ts`) quedó bloqueada por el fallo previo de conexión |
| **RNF-25** (`estimateGas` fallido bloquea el envío) | **CUMPLIDO** | `txContract.spec.ts`: `-32000` con motivo accionable, **sin ninguna escritura** (`storage.writes() === []`) y **sin ventana** |
| **`CA-RT-11`** (correspondencia wallet ↔ contrato) | **CUMPLIDO** | `forge test`: 10/10, con el fixture **firmado por M11** verificando on-chain (`true`) y un byte alterado devolviendo `false`; además `typedData.spec.ts` compara el `digest` de la wallet con el del fixture |

---

## 5. Defectos y desviaciones

### D-H4-E1 — **PRODUCCIÓN (bloqueante): falta la ruta de solicitud aprobable en el Service Worker**
- **Medido**: `e2e/04-enviar.spec.ts` 1.ª ejecución → `browserContext.waitForEvent: Timeout 20000ms exceeded while waiting for event "page"` (no se abrió ninguna `notification.html`); `e2e/10-aprobar-tx.spec.ts` y `e2e/11-firmar-mensaje.spec.ts` → idéntico.
- **Evidencia estática**: `requiresApproval: true` se declara en `src/background/rpc/catalog.ts:378-401` y **no lo consume nadie**; `enqueueApprovalRequest` (`src/background/approvals/queue.ts:409`) **no tiene llamador de producción**; `buildTxPreview`/`buildTypedDataPreview`/`buildPersonalSignPreview` (`src/background/approvals/preview.ts:271,420,568`) solo se usan dentro de su propio módulo; `showOldestPending` solo se invoca desde `focus.ts`/`timeout.ts`/`reconcile.ts`. No hay despacho de los 6 métodos aprobables en `src/background/rpc/router.ts`.
- **Consecuencia**: `CA-RF-08`, `CA-RF-19`, `CA-RF-20`, `CA-RF-21` no cumplidos; E2E 04/10/11/18/29 rojos. **No lo he corregido** (está fuera de mi alcance: otro agente está cerrando ese hueco ahora).

### D-H4-E2 — **Regresión observada en suites de H3 (ajena a mi alcance)**
- `e2e/08-eventos.spec.ts:73` y `:162` → «el flujo de conexión falló: Error 4001: Operación cancelada por el usuario»; `e2e/09-conectar.spec.ts:77` → `#resultado-conectar` con `resultado--error`. Ambas estaban **verdes en la entrega de H3** y fallan con los cambios de H4 en curso. Evidencia: `evidencia/H4/e2e-2026-09-12.json`.
- Efecto colateral: 3 de mis 6 specs fallan en ese mismo paso previo (conexión de la dApp) y no llegan a ejercitar la aprobación.

### D-H4-E3 — **Defecto del ARNÉS (corregido por mí): `--http.corsdomain` no existe en el Anvil instalado**
- `27-rpc-caido.spec.ts` quedaba en «Anvil NO se pudo restaurar: el nodo queda caído» y **toda la suite posterior se ejecutaba sin nodo** (`e2e/29-sw-suspendido.spec.ts` falló con `ECONNREFUSED 127.0.0.1:8545`).
- Causa medida: `anvil 1.7.2-dev` responde `error: unexpected argument '--http.corsdomain' found`. La bandera equivalente es **`--allow-origin`** (verificada).
- Corrección en `e2e/fixtures/extension.ts` (`arrancarAnvil`): `--host 127.0.0.1 --port 8545 --chain-id 31337 --silent --allow-origin *`. Con ella, `27-rpc-caido` vuelve a **pasar** (1 passed) y restaura el nodo.
- Nota de honestidad sobre la nota operativa del plan: en este equipo **`--silent` sí funciona** con `spawn` + `stdio: 'ignore'` (es el comando con el que H3 quedó verde); el fallo real era la bandera de CORS, no `--silent`.

### D-H4-E4 — **Defecto del ARNÉS (corregido por mí): el `globalSetup` avisaba en lugar de abortar sin Anvil**
- `e2e/global-setup.ts` ahora, tras archivar la evidencia, **lanza** un error con el comando exacto de arranque y el aviso de no usar `--silent` (líneas 196-227 y 264-268). Antes, un Anvil ausente producía fallos confusos más tarde.

### D-H4-E5 — **Observación menor de producción**: `isNotificationTabUrl` compara **solo el `pathname`**
- `src/background/approvals/focus.ts:127-137`: una página de la dApp servida en `/notification.html` se reconocería como la ventana única y podría impedir que se abriera la de verdad. Medido y documentado en `windowRediscovery.spec.ts` (`isNotificationTabUrl('http://localhost:5174/notification.html') === true`). No bloquea H4; se reporta.

### D-H4-E6 — **Observación menor de producción**: la traza de difusión interrumpida no rellena `LogEntry.txHash`
- `src/background/approvals/reconcile.ts:290-302`: el hash viaja en `data.txHash` pero no en el campo `txHash` del `LogEntry` que consumirá el panel de actividad de H5 (RF-31). Documentado en `approvalReconcile.spec.ts`.

### D-H4-E7 — Cambio de contrato ajeno que mis specs **siguen** (no es un defecto)
- Durante la batería, otro agente registró en `diccionario_datos.md` §4.3 v1.10 las causas `inflightTxInProgress` y `broadcastRejected` (`src/background/rpc/errors.ts`). La 2.ª firma de la misma cuenta pasa de `4001` a **`-32000`** con el literal «Ya hay una transacción de esta cuenta en vuelo…». `queue.spec.ts` verifica el **comportamiento real actual**.

---

## 6. Alcance: archivos tocados (solo los permitidos)

- **Specs Vitest nuevos (12)**: los 12 ficheros de §2, todos `src/**/*.spec.ts` de la lista asignada.
- **Playwright (6 specs nuevos)**: `e2e/04-enviar.spec.ts`, `e2e/10-aprobar-tx.spec.ts`, `e2e/11-firmar-eip712.spec.ts`, `e2e/11-firmar-mensaje.spec.ts`, `e2e/18-concurrencia.spec.ts`, `e2e/29-sw-suspendido.spec.ts`.
- **Arnés**: `e2e/fixtures/extension.ts` (ayudas nuevas + `arrancarAnvil` corregido) y `e2e/global-setup.ts` (aborto por Anvil ausente).
- **Forge**: `contracts/test/EIP712Verifier.t.sol` (ampliado) y `contracts/test/fixtures/eip712-wallet-signature.json` (nuevo).
- **Evidencia**: `RepoTecnico/evidencia/H4/**` y esta acta.
- **No se tocó** ningún fichero de producción (`src/background/**` salvo `*.spec.ts` de la lista, `src/notification/**`, `src/popup/**`, `src/shared/**` salvo specs), ni `src/inject/**`, ni configuraciones, ni `public/`, ni `test.html`, ni otros `RepoTecnico/*.md`.

---

## 7. Conclusión

- **Vitest: 574/574 en verde** (403 previos intactos), con la cola, el plazo (`chrome.alarms` + fake timers, sin esperar 120 s), la ventana única, el re-descubrimiento, las cuatro vías de firma y el contrato observable de la transacción cubiertos con magnitudes concretas.
- **Forge: 10/10 en verde**, con la firma de la wallet verificando on-chain y el byte alterado devolviendo `false` (`CA-RT-11`).
- **E2E: 34 passed / 9 failed** (`npm run test:e2e` exit 1). **No puedo declarar H4 terminado**: falta la ruta de producción que encola y aprueba las solicitudes (D-H4-E1) y hay una regresión en el flujo de conexión de la dApp (D-H4-E2). Los criterios `CA-RF-08`, `CA-RF-19`, `CA-RF-20` y `CA-RF-21` quedan **NO CUMPLIDOS** con el motivo medido en §4.
