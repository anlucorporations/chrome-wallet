# Acta de cierre del hito H1 — verificación de las tareas 1.14 (parte de verificación), 1.15, 1.16, 1.20 y §3.1.7

- **Proyecto:** TrueKeate Wallet (`C:\Users\lucci\MasterCodeCripto\GitLab\chrome-wallet`)
- **Fecha de ejecución:** 2026-09-11
- **Entorno:** Windows, Node v24.16.0, npm 11.13.0, Chromium de Playwright 1243 (Chrome for Testing 153.0.8010.12), Foundry 1.7.2-dev, Anvil **no** en marcha.
- **Alcance de este acta:** las pruebas del hito H1 (§3.1.7), el arnés de pruebas (§7.4/§7.4.1) y la evidencia de los comandos de §3.1.5 (tarea 1.20).
- **Regla aplicada:** nada se declara cumplido sin haberlo ejecutado. Todo resultado es el real, incluidos los fallos.

## 1. Resultado real de cada comando

| # | Comando | exit code | Resumen real | Evidencia |
|---|---|---|---|---|
| 1 | `npm run build` | **1** | `tsc -b` falla con 3 errores TypeScript (2 en `src/`, 1 en `vite.config.ts`); el paso `vite build` no llega a ejecutarse. **Defecto ajeno.** | `build-2026-09-11.log` |
| 2 | `npx tsc -b` | **1** | 3 errores: `vite.config.ts:155` TS2353, `src/background/rpc/errors.ts:304` TS2532, `src/inject/eip6963.ts:55` TS2345. | `typecheck-2026-09-11.log` |
| 3 | `npm run test` (Vitest) | **0** | **43 passed | 4 skipped (47)** en 4 ficheros: `errors.spec.ts` 16/16, `naming.spec.ts` 11/11, `windowContract.spec.ts` 10/10, `manifest.spec.ts` 6/6 + 4 saltadas. | `vitest-2026-09-11.log` |
| 4 | `npm run test:e2e` (Playwright) | **0** | **4 skipped, 0 ejecutadas**: sin `dist/` cargable el grupo de `01-onboarding.spec.ts` se salta con el motivo escrito (§4.1). `globalSetup` termina OK con avisos (build fallido + Anvil ausente). | `playwright-2026-09-11.log`, `e2e-2026-09-11.json`, `e2e-global-setup-2026-09-11.{log,json}` |
| 5 | `npm run lint:prohibited` | **1** | **1 hallazgo**: `src/inject/eip6963.ts:70` — «llamada propia a `fetch()`». El resto de reglas (dependencias prohibidas, `codecrypto_`, colores fuera de `tokens.css`, `ethers` en el popup) sin hallazgos. **Defecto ajeno.** | `lint-prohibited-2026-09-11.log` |
| 6 | `npm run check:mermaid` | **0** | **27/27 bloques válidos** (MODO A, `mermaid.parse()` real) y 4 avisos de `stateDiagram-v2` en `documento_tecnico.md`. | `check-mermaid-2026-09-11.log` |
| 7 | `forge test --match-contract EIP712VerifierTest` | **0** | **0 pruebas ejecutadas**: desde la raíz del repositorio imprime «Nothing to compile» y sale 0 (resultado engañoso, ver §4.5). | `forge-eip712verifier-2026-09-11.log` |
| 8 | `npm run forge:test` (`forge test --root contracts --match-contract EIP712VerifierTest`) | **0** | **7 passed, 0 failed, 0 skipped** (`EIP712VerifierTest`). | `forge-eip712verifier-contracts-2026-09-11.log` |
| 9 | `npx vite build` con plazos inyectados (lo lanza `globalSetup`) | **1** | Error enmascarado: `[manifest] faltan entradas obligatorias en dist/: index.html, connect.html, notification.html, background.js`. **Defecto ajeno.** | `e2e-global-setup-2026-09-11.log` |
| 10 | `npx vite build --config <config de diagnóstico>` (build 1 aislado) | **1** | **Error raíz**: `[vite:build-html] Failed to resolve /popup/main.tsx from src/index.html` con `✓ 0 modules transformed`. **Defecto ajeno.** | `diagnostico-build-2026-09-11.log` |
| 11 | Autoprueba del arnés E2E contra una extensión MV3 temporal fuera de `dist/` | **0** | **4 passed**: lanzamiento persistente con perfil `mkdtemp`, descubrimiento del ID, apertura del popup, lectura/escritura de `chrome.storage.local` desde el SW y suspensión + re-arranque del SW por CDP. | `diagnostico-arnes-e2e-2026-09-11.log` |
| 12 | Sonda CDP de mecanismos de suspensión del Service Worker | **0** | **2 passed**: `stopWorker` y `stopAllWorkers` funcionan sobre la sesión de una página de la extensión; se documentan los 3 mecanismos del §7.4.1.c que **no** funcionan (§5). | `diagnostico-servicio-worker-2026-09-11.log` |
| 13 | `grep -rn "codecrypto_" src/` · `grep -rn "from 'ethers'" src/popup` · `grep -rn "chrome.storage.sync" src/` | — | **0 / 0 / 0** coincidencias. | `grep-nomenclatura-2026-09-11.log` |
| 14 | `copy dist/manifest.json → H1/manifest-<fecha>.json` | — | **No archivado**: `dist/manifest.json` no existe (el build está bloqueado, ver §4). | — |

Las ejecuciones 11 y 12 usaron una extensión MV3 mínima **temporal** creada y eliminada en la misma sesión (no queda en el repositorio) para poder validar el arnés pese al bloqueo del build.

## 2. Criterios de aceptación de §3.1.6

| Criterio | Estado | Detalle |
|---|---|---|
| **CA-RT-04** — `permissions` solo `storage`+`alarms` (conjunto cerrado del corpus), `notifications` únicamente en `optional_permissions`, sin `tabs`/`activeTab`/`scripting` | **Parcial (fuente OK, artefacto no verificable)** | Las 6 aserciones sobre `src/manifest.ts` pasan en Vitest. Las 4 aserciones sobre `dist/manifest.json` están **saltadas** porque el artefacto no se genera (§4.2). |
| **CA-RT-05** — `npm run build` genera `manifest.json` desde `src/manifest.ts`, con el bundle de `ethers` local y sin URLs de CDN | **NO CUMPLIDO** | `npm run build` sale **1** por los defectos §4.1 y §4.2: `dist/` no contiene `manifest.json` ni las 6 entradas. |
| **CA-RT-09** — artefacto `dist/` y dApp servida en `http://localhost:5174` con `strictPort`, sin despliegue remoto | **Parcial** | `vite.config.ts` declara `server/preview` en 5174 con `strictPort: true` y no hay despliegue remoto. El artefacto `dist/` no es cargable (§4.2) y `playwright.config.ts` no declara `webServer`, así que `openDapp()` no se puede ejercitar (§4.4). |
| **CA-RT-13** — UUID literal y congelado, `key` fija, ID estable entre equipos, `codecrypto_` = 0, `truekeate_`/`TRUEKEATE_*` | **CUMPLIDO** | `naming.spec.ts` 11/11: UUID v4 literal congelado y no generado en runtime, 14 claves `truekeate_` idénticas a `diccionario_datos.md` §2.1..§2.14, 8 tipos de mensaje, 24 eventos idénticos a §2.11, ID derivado del SHA-256 de la `key` = `oiahebaliobknoeeonhgaacapjcpgblo`, y **0** coincidencias de `codecrypto_` en `src/`. |
| **CA-RT-11** — `forge test` verifica la firma EIP-712 del fixture | **CUMPLIDO** | 7 pruebas en verde (`npm run forge:test`). Ojo: el literal de §3.1.7 sin `--root contracts` ejecuta 0 pruebas (§4.5). |
| **RNF-13** — `npx tsc -b` exit 0 | **NO CUMPLIDO** | Exit 1 con 3 errores ajenos (§4.1). Los 4 `.spec.ts` y el arnés E2E aportados por esta tarea **no** producen errores de tipo. |
| **RNF-14** — el bundle de `ethers` vive solo en el SW | **CUMPLIDO (por inspección)** | `grep -rn "from 'ethers'" src/popup` → 0; `lint:prohibited` no reporta `ethers` en el popup. No se puede comprobar el tamaño del artefacto sin build. |
| **Carga de `dist/` con 0 errores de consola y 0 en el badge** (CU-36) | **NO VERIFICABLE** | La prueba existe (`01-onboarding.spec.ts`: 380×600, estado vacío en español, captura PNG, cero errores de consola y de página) pero se salta porque no hay extensión que cargar (§4.2). |
| **RNF-15** — build limpio en Windows **y** Linux | **NO VERIFICADO** | Solo se ha ejecutado en Windows; el corpus exige declararlo así, nunca como cumplido. |
| **CA-RT-07** — las tres suites pasan antes de cerrar el hito | **Parcial** | Vitest ✔ (43/4), Forge ✔ (7), Playwright: 0 ejecutadas / 4 saltadas por el bloqueo del build. |

## 3. Estado global del hito

H1 **no puede cerrarse** con el árbol actual: el bloqueo es del **build** (`npm run build` → exit 1) y afecta a CA-RT-05, RNF-13, CU-36, al artefacto de CA-RT-04 y a toda la suite E2E. Lo aportado por esta tarea (stub, arnés, 4 specs, evidencia y acta) está terminado y en verde en todo lo que no depende de un `dist/` cargable.

## 4. Defectos AJENOS encontrados (no corregidos: fuera de alcance)

### 4.1 `npx tsc -b` → 3 errores TypeScript (bloquea `npm run build`)

```
vite.config.ts(155,5): error TS2353: Object literal may only specify known properties, and 'configFile' does not exist in type 'UserConfig'.
src/background/rpc/errors.ts(304,29): error TS2532: Object is possibly 'undefined'.
src/inject/eip6963.ts(55,35): error TS2345: Argument of type 'number | undefined' is not assignable to parameter of type 'number'.
```

- `vite.config.ts:155` — `iifeBuildConfig` declara el retorno como `UserConfig`, pero el objeto incluye `configFile`, que solo existe en `InlineConfig`.
- `src/background/rpc/errors.ts:304` — `rows[0].cause` sin comprobar `undefined` bajo `noUncheckedIndexedAccess`.
- `src/inject/eip6963.ts:55` — `bytes[index]` es `number | undefined` y se pasa a `String.fromCharCode`.

### 4.2 `npx vite build` → las 3 páginas no resuelven su entry (bloquea `dist/`)

```
[vite:build-html] Failed to resolve /popup/main.tsx from C:/Users/lucci/MasterCodeCripto/GitLab/chrome-wallet/src/index.html
✓ 0 modules transformed.
```

- **Causa:** `src/index.html:13` (`/popup/main.tsx`), `src/connect.html:13` (`/connect/main.tsx`) y `src/notification.html:13` (`/notification/main.tsx`) usan rutas absolutas que Vite resuelve contra `root` (la raíz del repositorio), donde no existen: los entries viven en `src/{popup,connect,notification}/main.tsx`.
- **Consecuencia:** el build 1 no emite ninguna de sus 4 entradas y, al no existir `index.html`, `connect.html`, `notification.html` ni `background.js`, el plugin del manifest falla y **enmascara** el error real:
  `[manifest] faltan entradas obligatorias en dist/: index.html, connect.html, notification.html, background.js`.
- **Efecto:** `dist/` queda con `content-script.js` e `inject.js` solamente, sin `manifest.json` → la extensión no se puede cargar y la suite E2E no puede ejecutarse.

### 4.3 `npm run lint:prohibited` → 1 hallazgo

```
[lint:prohibited] 1 hallazgo(s):
  - src\inject\eip6963.ts:70: llamada propia a fetch(): el RPC sale solo por el proveedor del SW
```

Regla 2 de `scripts/lint-prohibited.mjs` (0 llamadas propias a `fetch(`). El origen es la carga del isologo EIP-6963 (`loadProviderIcon`).

### 4.4 `playwright.config.ts` sin `webServer` para la dApp

§7.2 exige la dApp en `http://localhost:5174` con `strictPort`, y §3.1.1 la da por servida. El `playwright.config.ts` no declara `webServer`, así que `openDapp()` (helper de §7.4.1) no se puede ejercitar sin arrancar `npm run dev` a mano. No bloquea H1 (ninguna prueba de H1 usa la dApp), sí a los hitos con flujos de página.

### 4.5 Trampa de §3.1.7/§3.1.9: `forge test` sin `--root contracts`

El literal `forge test --match-contract EIP712VerifierTest` ejecutado desde la raíz del repositorio imprime **«Nothing to compile»**, ejecuta **0 pruebas** y termina con **exit 0** (falso verde). El script del proyecto (`npm run forge:test`) añade `--root contracts` y sí ejecuta las 7 pruebas. Conviene citar siempre la variante del script.

## 5. Desviaciones documentadas del arnés respecto a §7.4.1 (con evidencia)

| Punto | Literal del documento | Qué ocurre en realidad | Sustituto usado |
|---|---|---|---|
| §7.4.1.a | `path.resolve(__dirname, '..', '..', 'dist')` | `__dirname` no existe en un paquete `"type": "module"` | `dirname(fileURLToPath(import.meta.url))` |
| §7.4.1.c | `context.newCDPSession(sw)` con el Service Worker | La API solo acepta `Page \| Frame` (`playwright-core/types/types.d.ts:10325`): no compila | Sesión CDP de una **página** de la extensión + dominio `ServiceWorker` |
| §7.4.1.c | `self.registration.unregister()` | Falla con `AbortError: Failed to unregister a ServiceWorkerRegistration: Worker disallowed` | `ServiceWorker.stopWorker({ versionId })` (y `stopAllWorkers` como respaldo) |
| §7.4.1.c | `context.waitForEvent('serviceworker')` como oráculo del re-arranque | **No se emite**: Chrome reutiliza el mismo target y Playwright conserva el mismo objeto `Worker` (se midió un `TimeoutError` de 8 s con el SW ya en `running`) | Oráculo observable `runningStatus` (`stopped` → `running`) con `expect.poll` |

Detalle completo, con las trazas de las tres comprobaciones: `diagnostico-servicio-worker-2026-09-11.log`.

## 6. Archivos creados (solo dentro del alcance autorizado)

| Archivo | Contenido |
|---|---|
| `test/setup/chrome-stub.ts` | Stub en memoria de `chrome.*` con reloj inyectable, `storage.local` (callbacks y promesas, `setAccessLevel`, `onChanged`), `alarms` (`create/clear/clearAll/onAlarm` + `advanceAlarms`), `runtime` (`id/getURL/sendMessage/onMessage/onConnect/connect/lastError`), `windows`, `tabs`, `permissions.request`, `action.setBadgeText` y `notifications`; reinicio completo en `beforeEach`. |
| `e2e/fixtures/extension.ts` | `launchPersistentContext` con perfil `mkdtemp` y ruta absoluta a `dist/`, descubrimiento del ID desde `context.serviceWorkers()`, y helpers `getExtensionId`, `openPopup`, `openDapp`, `openExtensionPage`, `stopServiceWorker`, `watchServiceWorker`, `readChromeStorage`, `writeChromeStorage`, `expectedExtensionId`. |
| `e2e/global-setup.ts` | Crea `RepoTecnico/evidencia/H1/`, reconstruye `dist/` con `VITE_SIGN_TIMEOUT_MS=3000`/`VITE_CONNECT_TIMEOUT_MS=2000`, verifica los plazos de producción (120000/60000/30000), comprueba Anvil (`cast chain-id` = 31337) y archiva la evidencia del arranque. |
| `e2e/01-onboarding.spec.ts` | La primera aserción del hito: carga desde `dist/`, ID derivado de la `key`, popup 380×600, estado vacío en español, cero errores de consola, captura `01-onboarding-<fecha>.png`, entrada `sw_started` y suspensión/re-arranque del SW. Se salta con motivo escrito mientras no haya `dist/`. |
| `src/manifest/manifest.spec.ts` | Manifest: conjunto cerrado de permisos, `notifications` solo opcional, sin `tabs`/`activeTab`/`scripting`, 6 entradas en `dist/`, `key` presente y manifest del artefacto idéntico a la fuente. |
| `src/shared/naming.spec.ts` | UUID literal, prefijo `truekeate_`, tipos `TRUEKEATE_*`, 24 eventos contra §2.11, 14 claves contra §2, `codecrypto_` = 0 e ID estable derivado de la `key`. |
| `src/inject/windowContract.spec.ts` | `window.truekeate === window.codecrypto` sobre el stub, propiedades no configurables, `request` → `4200` sin lanzar de forma síncrona y anuncio EIP-6963. |
| `src/background/rpc/errors.spec.ts` | Los 25 literales de `diccionario_datos.md` §4.3 leídos del propio diccionario y comparados fila a fila, los 8 códigos y un constructor por causa. |
| `RepoTecnico/evidencia/H1/*` | Logs y JSON de todas las ejecuciones de §1, más esta acta. |

**No** se ha modificado `src/` (salvo los 4 `.spec.ts` autorizados), ni `package.json`, ni `vite.config.ts`, ni `vitest.config.ts`, ni `playwright.config.ts`, ni ningún `RepoTecnico/*.md`. No queda ningún archivo temporal ni perfil de navegador en el repositorio; `dist/` es un artefacto ignorado por git y se regenera con el build. Como reparación de entorno (fuera del repositorio) se ejecutó `npx playwright install chromium`, porque la revisión instalada (1243) no estaba descargada y sin ella el arnés no puede ni abrir el navegador.

## 7. Qué hace falta para cerrar H1

1. Corregir los 3 errores de tipo de §4.1 (`vite.config.ts:155`, `src/background/rpc/errors.ts:304`, `src/inject/eip6963.ts:55`).
2. Corregir la resolución de los entries HTML de §4.2 (referenciar `/src/<ventana>/main.tsx` o ajustar `root`), y considerar desenmascarar el error del manifest para que no oculte el fallo real del build 1.
3. Resolver el hallazgo de `fetch(` de §4.3 (p. ej. mover la carga del isologo al proveedor del SW o ajustar la regla con justificación).
4. Con `dist/` construido: reejecutar `npm run test:e2e` (las 4 pruebas de `01-onboarding` dejarán de saltarse; ya están validadas contra una extensión temporal), archivar `dist/manifest.json` y `01-onboarding-<fecha>.png`.
5. Decidir si `playwright.config.ts` declara `webServer` para la dApp de §4.4 y si el corpus actualiza el bloque §7.4.1.c conforme a §5.
