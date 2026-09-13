# Fase 4 · E2E en navegador (headless) — resumen de la verificación

Fecha: 2026-09-13 · Fase de evidencia: `TK_EVIDENCE_PHASE=Fase4`

## Resultado real de la suite

| Comando | Resultado |
| --- | --- |
| `npm run test:e2e` | **84 passed / 0 failed / 0 flaky / 0 skipped** en 9,4 min (33 specs) |
| `npx tsc -b` | exit 0 (sin errores) |
| `npm run lint:prohibited` | exit 0 (156 ficheros de `src/`, 14 de `dist/`, 0 hallazgos) |
| `npm run test` (Vitest, comprobación de no regresión de la corrección) | 69 ficheros / **1154 passed** |
| `npx vitest run` de los specs afectados por la corrección | 57 passed |

Los **74 E2E previos** siguen verdes y **ninguno** se desactivó: 84 − 10 nuevos = 74. Ningún
`skip`/`fixme`/`waitForTimeout` añadido; los únicos `test.skip` de los specs nuevos son el guardián
`!distDisponible()`, estándar de toda la suite.

## Defecto 1 (crítico) — la pestaña «Enviar» del popup no podía enviar nada

- **Síntoma**: al pulsar «Enviar» en el popup, `eth_sendTransaction` respondía
  `4200 «El método solicitado no está soportado por TrueKeate Wallet»`, **no se abría la ventana
  única** y `truekeate_pending_requests` quedaba vacía. Evidencia en crudo (antes de la corrección):
  `sonda-envio-popup.txt` / `DEFECTO-01-popup-send-4200.txt`.
- **Test que lo reveló**: `e2e/33-envio-desde-el-popup.spec.ts` (y las sondas previas de la fase).
- **Causa raíz** (dos capas, ambas necesarias):
  1. `src/background/rpc/router.ts:585` (hoy `:596`): `entry.requiresApproval && !context.isExtensionContext`
     saltaba la ruta aprobable para TODO contexto de extensión, de modo que los tres métodos de firma
     invocados por el popup caían al despacho interno → `4200`.
  2. `src/background/approvals/dispatch.ts:224` (hoy `:232-236`): `resolveApprovalOrigin` exigía una
     sesión de dApp para `context.origin`; el popup no tiene sesión → habría respondido `4100`.
- **Solución**: el contexto de extensión despacha también la ruta aprobable salvo
  `wallet_revokePermissions` (cuya confirmación es la UI de «Sitios conectados», RF-26);
  `resolveApprovalOrigin` firma en el popup con la **cuenta activa**, y el nuevo
  `assertWalletAccount` (`dispatch.ts:264`) exige que la cuenta pedida **pertenezca a la cartera**.
- **Verificación**: `e2e/33` aprueba y el recibo del nodo es `status 1` (0x1) con `from`/`to`
  correctos, tanto a dirección externa como entre cuentas propias.

## Defecto 2 (arnés) — aserción de zoom intermitente en `24-accesibilidad`

- **Síntoma**: `Expected: 93, Received: 98` en «el zoom no puede vaciar el DOM», de forma
  intermitente según la carga de la máquina.
- **Causa raíz**: `e2e/24-accesibilidad.spec.ts` tomaba las dos cuentas de nodos en DOS `evaluate`
  distintos, así que un re-render del popup (polling de saldos, M47) se colaba entre ambos.
- **Solución**: las dos medidas se toman dentro de un ÚNICO bloque síncrono. La aserción es la
  misma, no se relaja.

## Defecto 3 (identificado, NO corregido — requiere decisión de corpus)

- **Síntoma** (medido por `e2e/33`, archivado en `33-envio-desde-el-popup-2026-09-13.json`):
  cuando el nodo RECHAZA una estimación (`-32003 Insufficient funds for gas * price + value`), el
  motivo que acompaña al bloqueo `-32000` es «Sin conexión con la red local (Anvil).» —el literal de
  `4900`—, y el Service Worker marca la conexión como «desconectado»; además se gastan 4 intentos
  con 7 s de backoff para un fallo determinista.
- **Causa raíz**: `src/background/rpc/pageMethods.ts:192-194` reenvía el resultado crudo de
  `rpcSend`; `src/background/rpc/client.ts:209-219` convierte en `4900` cualquier fallo que agote la
  política, y `describeFailure` (`client.ts:164-175`) no puede distinguir en el navegador «el nodo
  respondió con error» de «no hubo respuesta», porque `fetch` no aporta `ECONNREFUSED` (por eso
  `27-rpc-caido.spec.ts` admite `rpc-error` como motivo).
- **Por qué NO se corrige aquí**: §4.3 reserva `-32000 estimateGasFailed` con motivo accionable
  para «estimateGas fallido o revert previo a firmar» y `4900` para la red caída, pero separar los
  dos casos exige una clase de fallo nueva en el cliente y su fila en el catálogo —documentación
  que es de otro frente—; las reglas de esta fase prohíben inventar códigos o literales. El E2E fija
  el `code` documentado (`-32000`) y **archiva el motivo engañoso** para que el hallazgo sea
  trazable.

## Hallazgo de entorno (no del producto)

El servidor de la dApp (`npm run dev`) **muere** con
`EBUSY: resource busy or locked, watch '...\.<fichero>.<pid>.<uuid>.tmpdir\<fichero>.tmp'` si otro
proceso escribe en el árbol vigilado mientras corre la suite: el watcher de Vite intenta observar el
directorio temporal de una escritura atómica y éste ya no existe. Provocó 28 fallos
`ERR_CONNECTION_REFUSED` en la primera pasada (archivados en
`e2e-baseline-FALLO-servidor-dapp-caido.json`, conservados como evidencia). Mitigación aplicada: no
escribir ficheros durante la ejecución.
