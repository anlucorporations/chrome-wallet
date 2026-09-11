# Plan de Desarrollo — TrueKeate Wallet (Fase 3)

> **Fase:** 3 — Desarrollo · **Versión:** 1.1 · **Estado:** 🚧 **EN CURSO — H1 ✅ COMPLETADO (2026-09-11)**; hito en curso: **H2 — Cartera, cuentas y recuperación**
> **Cambios de la v1.1 (resumen).** Se registra el **cierre de H1** (§3.1.9: fecha, ID de extensión `oiahebaliobknoeeonhgaacapjcpgblo` y batería real de comandos; §6: H1 marcado **COMPLETADO**) y se abre la nueva **§3.1.10 «Cierre de H1: desviaciones aceptadas»** con las **5 desviaciones** del corpus descubiertas al implementar —`chrome-extension://` prohibido en `matches`/`exclude_matches`, **3 builds encadenados** en lugar de un array de dos, tamaño explícito del `body` en las tres ventanas, **Poppins no variable** (tres ficheros + licencias OFL) y el **falso verde** de `forge test` sin `--root contracts`—, cada una con su motivo y su impacto (decisiones **DEC-47..DEC-51** de `estado_proyecto.md`).
> **Producto:** **TrueKeate Wallet** — extensión de navegador Chrome/Edge **Manifest V3** (wallet Ethereum no custodial) + **dApp de pruebas** (`test.html`) sobre **Foundry Anvil** local. Directorio: `C:\Users\lucci\MasterCodeCripto\GitLab\chrome-wallet`.
> **Alcance de este documento:** convertir el **MVP de 40 RF Must** (`requerimientos.md` §4.5, DEC-26/P-17/P-18) en **6 hitos verticales, demostrables y verificables**, con tareas identificadas por archivo, criterios de aceptación citados por su `CA-xx` real, pruebas de Vitest / Playwright / Forge y evidencia archivada. **Este documento sustituye toda estimación genérica anterior** (el «~40 h» está retirado del corpus por H-34/DEC-26) y **pasa a ser la fuente única de la estimación y del cronograma**; la secuencia H1–H5 de `documento_tecnico.md` §9 queda como **referencia**, ajustada aquí a **H1–H6**.
> **Fuentes obligatorias leídas (versiones vigentes del corpus):** `RepoTecnico/documento_tecnico.md` **v1.4** (66 módulos M1..M66, 20 ADR, árbol de `src/`, contratos internos §2.5, §7.4 arnés de pruebas, §7.5 build MV3, §8 riesgos R1..R19, §9 plan de referencia) · `RepoTecnico/requerimientos.md` **v1.9** (50 RF = 40 Must + 10 Should · 25 RNF · 13 RT · 4 RE · §2.1 códigos EIP-1193 · §2.2 catálogo de 24 eventos · §4.5 MVP vs ciclo posterior · §9 Anexo A con los `CA-RF-xx`/`CA-RT-xx`) · `RepoTecnico/casos_uso/casos_uso.md` **v1.5** (36 CU, matrices §2/§5/§7 y huecos §9) · `RepoTecnico/diccionario_datos.md` **v1.8** (claves `truekeate_*`, protocolo `TRUEKEATE_*`, catálogo RPC §4.3, literales de error §4.3, guardas §3.10/§3.11) · `RepoTecnico/entornos_globales.md` **v1.9** · `RepoTecnico/estado_proyecto.md` **v1.9** (DEC-01..DEC-46) · `RepoTecnico/VEREDICTO_FASE2_V1.md` **v1.3** (0 residuales abiertos, 18/18 contradicciones resueltas).
> **Regla de no regresión:** ningún defecto cerrado por `INFORME_OPTIMIZACION_V1.md` (H-01..H-42), `casos_uso/AUDITORIA_CASOS_USO_V1.md` (ACU-01..ACU-30) ni `AUDITORIA_DOCUMENTO_TECNICO_V1.md` (ADT-01..ADT-33) se reintroduce al implementar; los invariantes de `documento_tecnico.md` §2.3 son **contrato de aceptación**, no recomendaciones.
> **Convenciones:** todo en español; identificadores de código, métodos RPC, nombres de archivo y claves de storage en su **forma original**; las claves de `chrome.storage.local` se citan siempre con el prefijo completo `truekeate_`.
> **Convención de hitos:** los hitos se numeran **H1..H6** (MVP) y **C1..C10** (ciclo posterior). La evidencia se archiva en `RepoTecnico/evidencia/H<n>/<test>-<YYYY-MM-DD>.{json,png,log}` conforme a `documento_tecnico.md` §7.4.1.f; los nombres de los ficheros de prueba son los citados por `requerimientos.md`/`casos_uso.md` y su ruta sigue la convención de `documento_tecnico.md` §7.4: **Vitest** `src/<modulo>/<modulo>.spec.ts`, **Playwright** `e2e/NN-flujo.spec.ts`, **Forge** `contracts/test/<Contrato>.t.sol`.

---

## 1. Estrategia

### 1.1 Desarrollo vertical por hitos: cada hito es una entrega 100 % operativa y demostrable

Se desarrolla en **6 hitos verticales**. Un hito **no** es «la mitad del módulo X»: es una **rebanada funcional de punta a punta** (Service Worker + mensajería + UI + persistencia + prueba) que el usuario puede **abrir, usar y comprobar** con `anvil` en marcha y `http://localhost:5174/test.html` en el navegador. El orden respeta las dependencias reales del sistema:

| # | Hito | Qué queda operativo al terminar (demostración) |
|---|---|---|
| H1 | Andamiaje, build MV3 y arnés | `npm ci && npm run build` produce `dist/`; la extensión carga en `chrome://extensions` con **0 errores**, aparece **el icono del toolbar** y el popup 380×600; `test.html` se sirve en `http://localhost:5174` y **detecta** `window.truekeate` / `window.codecrypto`; las tres suites arrancan en verde |
| H2 | Cartera, cuentas y recuperación | Crear/importar cartera (12 palabras), 5 cuentas HD + «Añadir cuenta», importar por clave privada, etiquetar, recibir con QR, revelar/exportar con higiene de 30 s, reset y persistencia |
| H3 | Provider, conexión y lectura | `window.truekeate` con alias, catálogo de lectura y errores EIP-1193, eventos, `eth_requestAccounts` con `connect.html`, sesión de 24 h, revocación y polling de saldos contra Anvil |
| H4 | Firma, aprobación y transacciones | Envío EIP-1559 tipo 2 con vista previa del calldata decodificado, `personal_sign`, EIP-712, **cola persistida + `chrome.alarms` + ventana global única** y contrato `EIP712Verifier` verificando la firma |
| H5 | Redes y observabilidad | Cambio y alta de redes con permiso de host en runtime, `chainChanged` a todas las pestañas, los **24 eventos** en `truekeate_logs`, cuota de 10 MB observable y `test.html` con los **7 flujos** |
| H6 | Identidad visual, accesibilidad y entrega | Identidad aplicada en las tres ventanas y la dApp, accesibilidad AA verificada, build limpio en Windows y WSL2, documentación de la rúbrica y **`dist/` entregable** |

**Regla de verticalidad:** ninguna tarea de un hito puede quedar «pendiente de integrar» al cerrarlo. Si una tarea depende de algo que no existe todavía, se **adelanta** la parte mínima necesaria dentro del mismo hito (p. ej. H1 incluye el catálogo RPC **vacío** y `content-script.ts` como relay, sin lógica de aprobación). Cada hito termina con un **acta de cierre** en `RepoTecnico/evidencia/H<n>/` (comandos, salidas, capturas y conteos de cobertura).

### 1.2 Definición de «hito terminado»

Un hito está terminado **solo** cuando se cumplen las cinco condiciones, sin excepciones ni «pendientes menores»:

1. **Código**: todos los módulos declarados en su §3.x.4 existen, llevan su **cabecera JSDoc con el identificador M-xx** y el requisito que satisfacen (`documento_tecnico.md` §9.2), y `npx tsc -b` termina con **0 errores y 0 `any` implícitos** (`CA-RT-08`, RNF-13).
2. **Pruebas**: los specs de Vitest y de Playwright del hito existen, **pasan** y la cobertura de ramas no baja de **70 % global** ni de **80 %** en `src/background/crypto/`, `src/background/approvals/` y `src/shared/validation/` (`CA-RT-07`, RNF-17).
3. **Evidencia**: cada criterio de aceptación del hito tiene su artefacto versionado en `RepoTecnico/evidencia/H<n>/` en una de las cuatro formas canónicas (`Vitest:`, `E2E: <spec> — <flujo>`, `Comando:`, `Inspección:`), con magnitud y método.
4. **Memoria**: se actualizan `RepoTecnico/estado_proyecto.md` (fase, decisiones nuevas y próximos pasos) y, si el hito revela una brecha, el corpus completo según §7 de este plan. **Ningún hito se cierra con la memoria desactualizada** (R15/Veredicto R-05/R-11).
5. **Puerta de comandos**: desde **H1** y en todos los hitos siguientes, `npm run test`, `npm run test:e2e`, `forge test --root contracts --match-contract EIP712VerifierTest` y `npm run check:mermaid` terminan con **exit 0** (`CA-RT-07`, `documento_tecnico.md` §9). **Nota (desviación D-H1-5, §3.1.10):** el literal sin `--root contracts` produce un **falso verde** —Foundry responde «Nothing to compile», ejecuta **0 pruebas** y sale con exit 0—, de modo que queda prohibido como comando normativo.

### 1.3 Convención de ramas y commits

- **Rama de trabajo:** `chrome-wallet-DSH` (rama vigente del repositorio local, `documento_tecnico.md` §7.1). `main` queda como rama de entrega.
- **Rama por hito:** `feat/H<n>-<slug>` (p. ej. `feat/H4-aprobaciones`, `feat/H5-redes-logs`), creada desde `chrome-wallet-DSH` y fusionada **solo** con la puerta de comandos en verde. Una tarea = una rama corta; un hito = una fusión a `chrome-wallet-DSH`.
- **Commits:** `tipo(H<n>): descripción en imperativo` con `tipo` ∈ `feat`, `fix`, `test`, `refactor`, `docs`, `build`, `chore`, `perf`. Ejemplos: `feat(H4): cola persistida con rmwLock y cardinalidad`, `test(H2): secretsExport — 30 s, blur y borrado del portapapeles`, `docs(H5): evidencia de los 24 eventos del catálogo`. Un commit mezcla **código y su prueba** o **no se acepta**.
- **`push`:** **prohibido** sin la orden explícita `/push` (RE-03, DEC-10). La estrategia de publicación en los 3 remotos sigue siendo el pendiente P-3.7/P-12 y **no bloquea** el desarrollo.
- **Tamaño:** ningún commit supera ~400 líneas útiles; los hitos H4 y H2 se trocean por tarea.

### 1.4 Gestión de riesgos del plan

Riesgos técnicos heredados de `documento_tecnico.md` §8.1, **asignados al hito donde se materializan**, más los riesgos propios de la ejecución del plan. Cada riesgo tiene un **disparador** observable (lo que lo convierte en incidencia) y una **acción** decidida de antemano.

| Riesgo | Hito | Disparador observable | Acción decidida |
|---|---|---|---|
| R1 ciclo de vida del Service Worker | H4, H5 | Un test con `stopServiceWorker` deja una entrada huérfana o la reconciliación tarda ≥ 1 s | No se cierra el hito; se corrige la persistencia (`truekeate_pending_requests`, `truekeate_inflight_tx`) **antes** de tocar UI |
| R2 mnemonic en claro (modo desarrollo) | H2 | — (riesgo aceptado) | Aviso no descartable RNF-23 en el primer arranque; `truekeate_vault` **no** se crea |
| R3 ausencia de auditoría externa | H1..H6 | — (decisión aceptada) | Compensación con evidencia reproducible y los tests negativos de CU-20/CU-21 |
| R4 fuga de clave hacia la página | H2, H3, H4 | Cualquier `postMessage` con mnemonic/clave o un log con payload íntegro | Bloqueante: falla `logRedaction.spec.ts` / la inspección del content script; se revisa el emisor antes de seguir |
| R5 firma ciega | H4 | Un calldata fuera de la tabla que muestre `functionName` no nulo o sin aviso bloqueante | Se detiene la tarea; la tabla local cerrada (M66) es contrato, no heurística |
| R6 CORS / `host_permissions` | H1, H3 | `4900` con Anvil en marcha | Verificación previa obligatoria (`anvil --version`, `cast chain-id` = 31337) y allowlist CORS con el ID estable (RE-04) |
| R7 pérdida irrecuperable de cuentas importadas | H2 | Cuenta importada sin `wallet_revealSecret` operativo | RF-50 bloquea el cierre de H2; es Must (P-18/D-13) |
| R8 RPC local caído | H3, H5 | `rpcRetry.spec.ts` con un conteo distinto de 4 llamadas (1+3) | Se corrige la política cerrada (1 s/2 s/4 s, timeout 5 s) antes de continuar |
| R9 volumen de trabajo en solitario | Todos | Un hito consume > 1,3 × su estimación | Se aplica el recorte ya decidido: los 10 RF Should (C1..C10) salen del ciclo; **nunca** se recorta un RF Must |
| R13 cuota de `chrome.storage.local` (10 MB) | H5 | `storageQuota.spec.ts` no observa el reintento ni el `-32603` | Se ajusta retención/redacción; `unlimitedStorage` **no** se declara (D-M) |
| R14 `estimateGas`/`getFeeData()` inestables | H4 | Envío bloqueado sin mensaje accionable | Error tipado `-32000` con motivo y bloqueo previo a la firma |
| R16 el puerto no mantiene vivo el SW | H3, H4 | Un diseño que dependa del puerto para sobrevivir al sueño | Prohibido por contrato (§2.3 del documento técnico): la verdad vive en storage, `chrome.alarms` y la reconciliación |
| R17 alarmas retardadas o perdidas | H4 | Entrada vencida que no se resuelve sin que dispare el alarm | La reconciliación al arrancar **no** depende del alarm (`approvalReconcile.spec.ts` con `expiresAt` ya pasado) |
| R18 ventana huérfana o dos ventanas | H4 | `18-concurrencia.spec.ts` observa 2 ventanas | Bloqueante (P-21/DEC-38); se corrige el re-descubrimiento por URL antes de seguir |
| R19 bundle de `ethers`, CSP y tamaño | H1, H6 | `background.js` + chunks ≥ 1,5 MB sin comprimir o una URL remota en `dist/` | `ethers` solo en el SW (RNF-14) y empaquetado local (RT-02/RT-05/RNF-20) |
| **P-R1** inestabilidad del arnés E2E en Windows | H1, H4 | Fallo intermitente de `launchPersistentContext` o perfil residual | Perfil nuevo por prueba (`mkdtemp`), ruta `dist/` absoluta con `path.resolve`, `E2E_HEADLESS=false` para depurar; nunca se reutiliza perfil (prohibido por §7.4.1.b) |
| **P-R2** deriva entre el código y los `CA-xx` | Todos | Un `CA-RF-xx` no es verificable con el código escrito | Se abre brecha y se aplica §7 (gestión del cambio) en el mismo turno |

### 1.5 Dependencias externas

| Dependencia | Valor exigido | Verificación previa a usarla | Hitos que la consumen |
|---|---|---|---|
| **Anvil** (red primaria) | `127.0.0.1:8545`, chainId `31337` (`0x7a69`), `--host 127.0.0.1`, `--http.corsdomain "chrome-extension://<ID>,http://localhost:5174,http://127.0.0.1:5174"` (nunca `*`) | `anvil --version` dentro de `>=1.0.0 <2.0.0` y `cast chain-id --rpc-url http://127.0.0.1:8545` → `31337` | H2, H3, H4, H5, H6 |
| **Anvil** (red secundaria para RF-22/RF-23) | `--port 8546 --chain-id 31338` | `cast chain-id --rpc-url http://127.0.0.1:8546` → `31338` | H5 |
| **Foundry (`forge`)** | Mismo rango `>=1.0.0 <2.0.0` | `forge --version` y `forge test --root contracts --match-contract EIP712VerifierTest` | H1 (instrumento), H4 (correspondencia wallet↔contrato), H6 (cierre) |
| **Chromium de Playwright** | Canal `chromium` del paquete `@playwright/test` (versión **exacta fijada al arrancar la Fase 3**, cierre de P-3.10), `headless: true` salvo depuración | `npx playwright install chromium` y arranque de un contexto persistente vacío | H1..H6 |
| **Node / npm** | `v24.16.0` / `11.13.0`; `package-lock.json` versionado | `npm ci` reproducible en Windows **y** en WSL2/CI (RNF-15/D-C) | H1..H6 |
| **Chrome/Edge** | `≥ 114` (MV3, `chrome.alarms`) | Carga manual de `dist/` en `chrome://extensions` con 0 errores | H1..H6 |
| **Si Anvil no responde o su versión está fuera de rango** | — | — | La suite E2E **no se ejecuta** y el hito se marca **no verificado** (nunca «satisfactorio», `documento_tecnico.md` §7.2) |

---

## 2. Resumen de hitos

| Hito | Objetivo (una línea) | RF Must cubiertos | CU principales | Módulos (§2.4 del documento técnico) | Pruebas | Esfuerzo |
|---|---|---|---|---|---|---|
| **H1 ✅ COMPLETADO (2026-09-11)** | Andamiaje, build MV3 de las 6 entradas y arnés de pruebas | **— (0 RF; habilita RT-01..RT-13)** | CU-22 (detección), CU-36 (build) | M1, M2, M3/M4 (esqueleto), M6, M20, M21, M33, M35, M36, M37, M38, M55, M56, M57, M64, M65, `contracts/`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `test/`, `e2e/`, `test.html` | `Comando:` build/tsc/lint · `Vitest: 47 passed / 4 ficheros` · `E2E: 01-onboarding.spec.ts — 4 passed` · `Forge: 7 passed` (§3.1.9) | **16 h / 4 sesiones** |
| **H2** | Cartera, cuentas HD, importación, recepción, persistencia, recuperación y reset | RF-01, RF-02, RF-03, RF-04, RF-05, RF-07, RF-09, RF-10, RF-11, RF-33, RF-50 | CU-01..CU-09, CU-30, CU-32, CU-33 | M8, M9, M10, M12, M13, M28, M29, M33, M34, M39, M40, M41, M46, M57, M58, M59, M60, M61, M62, M63 | `Vitest: mnemonic`, `derivation`, `importPrivateKey`, `accounts`, `state`, `integrity`, `secretsExport`, `revealHygiene`, `revealClipboard`, `validation`, `reset`, `qr` · `E2E: 01-onboarding`, `02-cuentas`, `03-recibir`, `05-persistencia`, `06-reset`, `16-validacion`, `25-recuperacion` | **24 h / 6 sesiones** |
| **H3** | Provider inyectado con alias, conexión de dApps, lectura y eventos contra Anvil | RF-13, RF-14, RF-15, RF-16, RF-17, RF-18, RF-25, RF-26, RF-27, RF-36, RF-45 | CU-08, CU-10, CU-17..CU-22, CU-26, CU-31 | M2, M3, M4, M5, M6, M20, M21, M22, M23, M26, M27, M35, M36, M37, M38, M44, M47, M48, M49, M55, M56, `test.html` (4 flujos) | `Vitest: inject`, `naming`, `errors`, `eip1193`, `messaging`, `manifest`, `accounts`, `sessions`, `polling`, `rpcRetry`, `rateLimit`, `originFrame` · `E2E: 07-provider`, `08-eventos`, `09-conectar`, `13-revocar`, `14-polling`, `27-rpc-caido`, `28-iframe-hostil` | **20 h / 5 sesiones** |
| **H4** | Firma, aprobación con vista previa decodificada y transacciones EIP-1559/EIP-155 | RF-08, RF-19, RF-20, RF-21, RF-35, RF-37, RF-41, RF-42, RF-43 (+ guarda de RF-11) | CU-11..CU-16, CU-27, CU-28, CU-30 (guarda) | M7, M11, M14, M15, M16, M17, M18, M19, M42, M50, M51, M52, M53, M54, M66, M33 (`truekeate_inflight_tx`), `contracts/` | `Vitest: approvalQueue`, `approvalTimeout`, `approvalReconcile`, `approvalResume`, `connectRequest`, `windowQueue`, `windowRediscovery`, `calldata`, `typedData`, `personalSign`, `eip1559`, `eip155`, `txContract`, `payloadLimit` · `E2E: 04-enviar`, `10-aprobar-tx`, `11-firmar-eip712`, `11-firmar-mensaje`, `18-concurrencia` + `sw-suspend` · `forge test` | **28 h / 7 sesiones** |
| **H5** | Redes con permiso en runtime, observabilidad completa y dApp de pruebas con los 7 flujos | RF-22, RF-23, RF-24, RF-28, RF-29, RF-30, RF-31, RF-46 | CU-19, CU-24, CU-25, CU-29, CU-34, CU-23 | M14, M15, M22, M23, M24, M25, M27, M30, M31, M32, M33, M43, M45, `test.html` (7 flujos) | `Vitest: networks`, `logger`, `logRedaction`, `loggerRetry`, `storageQuota`, `sessions` · `E2E: 12-redes`, `15-logs`, `22-dapp`, `21-eip6963` | **20 h / 5 sesiones** |
| **H6** | Identidad visual, accesibilidad AA, documentación de la rúbrica y entrega | RF-49 (+ cierre de RF-11) | CU-33, CU-34, CU-35, CU-36 | M39..M46, M48, M50, M62, M64, M65, `README.md`, `INSTRUCCIONES.md`, `LICENSE`, `NOTICE`, `public/fonts/LICENSE-*.txt` | `Vitest: contrast`, `goldUsage`, `docs` · `E2E: 23-marca`, `24-accesibilidad`, `25-recuperacion`, `26-avisos`, `17-i18n` · `Comando:` build en Windows y WSL2 + `--coverage` | **20 h / 5 sesiones** |
| | | | | | **Total MVP** | **128 h / 32 sesiones** |

> **Nota sobre H1 (0 RF Must).** H1 **no entrega ningún RF Must por diseño**: entrega la **puerta técnica** de toda la Fase 3 (`CA-RT-01`..`CA-RT-13`, RNF-04/13/14/15/20/24, y el instrumento Forge de RT-11) sin la cual ningún RF es demostrable. La cobertura de los 40 RF Must se completa en H2..H6 y se detalla en §6 (0 huérfanos).
> **Nota sobre el contrato Forge.** `contracts/EIP712Verifier.sol`, su test y su *fixture* versionado se crean en **H1** (es un instrumento **independiente** de la wallet: `verify(signer, digest, signature)` recibe el `digest` ya calculado y **no** depende de la red, `documento_tecnico.md` §5.4); la **correspondencia wallet↔contrato** (que la firma producida por M11 verifique on-chain) se cierra en **H4** con `11-firmar-eip712.spec.ts` + `forge test`.
> **Nota sobre RF-11.** H2 entrega el reset y su confirmación destructiva (`CA-RF-11`, parte 1); la **guarda de cola no vacía / transacción en vuelo** (`CA-RF-11`, parte 2, R-09b/DEC-46) se verifica en **H4**, cuando existen `truekeate_pending_requests` y `truekeate_inflight_tx`.

---

## 3. Hitos detallados

### 3.1 H1 — Andamiaje, build MV3 y arnés de pruebas

#### 3.1.1 Objetivo
Dejar el repositorio en estado **construible, cargable y probable**: las **6 entradas** de Vite salen a `dist/` con el formato correcto, el `manifest.json` se genera desde `src/manifest.ts` con `key` fija e ID estable, la extensión se carga en `chrome://extensions` con **0 errores** y **el icono del toolbar** visible con su popup de 380×600, `test.html` se sirve en `http://localhost:5174` y **detecta** el provider, y las **tres suites** (Vitest, Playwright, Forge) ejecutan y pasan.

#### 3.1.2 Alcance
**Entra:** `package.json`/`package-lock.json`, `tsconfig*.json`, `eslint.config.js`, `vite.config.ts` (6 entradas y doble build ES/IIFE), `src/manifest.ts` con el plugin `closeBundle`, las 3 páginas HTML esqueleto, `tokens.css`/`base.css`, activos e iconos (`public/icons`, `public/brand`, `public/fonts`), `background.ts` mínimo (arranque + `setAccessLevel` + `sw_started` + reconciliación vacía), `senderGuard`/`accessLevel` como esqueleto de guardas, `inject` que publica `window.truekeate` + alias `window.codecrypto` con **catálogo vacío** (`4200`), `content-script.ts` como relay con `targetOrigin` cerrado y puerto `truekeate_approval`, el catálogo RPC **cerrado pero vacío** (sin `eth_sign`), `errors.ts` con los literales de `diccionario_datos.md` §4.3, el stub de `chrome.*`, el arnés de Playwright (`launchPersistentContext`, descubrimiento de ID, `stopServiceWorker`, plazos inyectables), `scripts/` (lint, mermaid, iconos) y el proyecto Foundry `contracts/`.

**NO entra:** ninguna persistencia de cartera, ninguna derivación HD, ninguna ventana de aprobación, ningún envío, ningún log de actividad, ninguna red distinta de la declarada, ningún método RPC funcional (el catálogo responde `4200` salvo los `InternalMethod` aún no implementados), ninguna notificación y **ningún** RF Should.

#### 3.1.3 Requisitos cubiertos
| Tipo | Requisitos | Nota |
|---|---|---|
| RF Must | **—** | H1 es habilitador; la cobertura empieza en H2 (§6) |
| RF/RNF/RT citados | `CA-RT-01`..`CA-RT-09`, `CA-RT-13`; RNF-04, RNF-13, RNF-14, RNF-15 (parcial), RNF-20, RNF-24 (parcial); RE-01, RE-04 (declaración) | `CA-RT-04` y `CA-RT-05` se cierran aquí por completo |
| CU | CU-22 (la página detecta el provider), CU-36 (build limpio y carga de `dist/`), CU-01 (estado vacío del popup) | Parcial en CU-22/CU-01 |

#### 3.1.4 Módulos implementados
M1 `manifest.ts` · M2 `background.ts` (esqueleto operativo) · M3 `rpc/router.ts` y M4 `rpc/catalog.ts` (**catálogo vacío**, sin `eth_sign`) · M6 `rpc/errors.ts` (8 códigos, literales de `diccionario_datos.md` §4.3) · M20 `security/senderGuard.ts` y M21 `security/accessLevel.ts` (esqueleto con allowlist de rutas y `TRUSTED_CONTEXTS`) · M33 `state/schema.ts` (versión de esquema y claves canónicas `truekeate_*`) · M35/M36/M37 `inject/*` · M38 `content-script.ts` · M55 `shared/types.ts` · M56 `shared/protocol.ts` · M57 `shared/constants.ts` · M64 `styles/tokens.css` · M65 `styles/base.css` · M39 `popup/App.tsx` (estado vacío) · `contracts/foundry.toml`, `contracts/src/EIP712Verifier.sol`, `contracts/test/EIP712Verifier.t.sol`, `contracts/test/fixtures/eip712-signature.json` · `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `e2e/fixtures/extension.ts`, `test/setup/chrome-stub.ts`, `scripts/lint-prohibited.mjs`, `scripts/check-mermaid.mjs`, `scripts/generate-icons.ps1` · `test.html` (esqueleto con detección de provider).

#### 3.1.5 Tareas
| # | Tarea | Archivo que crea o modifica | Resultado observable |
|---|---|---|---|
| 1.1 | Fijar el proyecto npm y el bloque literal de `scripts` de §7.5.1 | `package.json`, `package-lock.json` | `npm ci` exit 0; `npm ls ethers react typescript vite` con `ethers@~6.15.0`, `react@^19`, `typescript@~5.9`, `vite@^7` (`CA-RT-01`, `CA-RT-02`) |
| 1.2 | TypeScript estricto y tipos de plataforma | `tsconfig.json`, `tsconfig.node.json` | `npx tsc -b` exit 0 con `strict: true` y `@types/chrome` + `@types/node` (`CA-RT-08`, RNF-13) |
| 1.3 | Constantes normativas (una sola fuente) | `src/shared/constants.ts` (M57) | Constantes exportadas: `DEFAULT_CHAIN_ID='0x7a69'`, `DEFAULT_RPC_URL`, `DERIVED_ACCOUNTS=5`, `SESSION_TTL_MS=86400000`, `SIGN_TIMEOUT_MS`/`CONNECT_TIMEOUT_MS`/`REVEAL_HIDE_MS` leídas de `import.meta.env.VITE_*` **con el valor de producción por defecto**, `PAYLOAD_MAX_BYTES=65536`, `logLimit=500`, `logMaxPerOrigin=200`, `pendingRequestsMax=8`/`1`/`6`, `PROVIDER_NAME='TrueKeate'`, `RDNS='academy.codecrypto.truekeate'` |
| 1.4 | Tipos de dominio y protocolo | `src/shared/types.ts` (M55), `src/shared/protocol.ts` (M56) | Los **8** tipos `TRUEKEATE_*`, `APPROVAL_PORT_NAME='truekeate_approval'`, `EXPIRE_ALARM_PREFIX='truekeate_expire:'` y las uniones cerradas `ApprovalMethod`/`InternalMethod`/`PageMethod` compilan (`CA-RT-13`) |
| 1.5 | Manifest generado desde TypeScript | `src/manifest.ts` (M1) + plugin `closeBundle` en `vite.config.ts` | `dist/manifest.json` con `key` fija, `permissions: ['storage','alarms']`, `notifications` **solo** en `optional_permissions`, `exclude_matches`, `use_dynamic_url: true`, `minimum_chrome_version: '114'`; el build **falla** si falta una entrada, falta la `key` o `notifications` aparece en `permissions` (`CA-RT-04`, `CA-RT-05`) |
| 1.6 | Build de las **6 entradas** con formato por entrada | `vite.config.ts` | `dist/index.html`, `dist/connect.html`, `dist/notification.html`, `dist/background.js` (ESM), `dist/content-script.js` (IIFE), `dist/inject.js` (IIFE) y `dist/manifest.json`; array de dos builds con `emptyOutDir: false` en el segundo (§7.5.3) |
| 1.7 | Páginas de las tres ventanas | `src/index.html`, `src/connect.html`, `src/notification.html` | Tres HTML con las medidas 380×600 / 420×650 / 420×640 y encabezado de marca de 72 px; cargan sus `App.tsx` como módulo |
| 1.8 | Tokens y estilos base | `src/styles/tokens.css` (M64), `src/styles/base.css` (M65) | Paleta, tipografías y degradados **medidos** (DEC-16); 0 literales de color fuera de `tokens.css` (`CA-RT-12`, RNF-18) |
| 1.9 | Activos e **icono del toolbar** | `public/icons/icon-{16,32,48,128}.png`, `public/brand/`, `public/fonts/*.woff2`, `scripts/generate-icons.ps1` | `action.default_icon` y `icons` resuelven en `dist/icons/*`; **el icono aparece en el toolbar** al cargar `dist/`; los iconos se versionan y no se regeneran en Linux |
| 1.10 | Service Worker mínimo operativo | `src/background.ts` (M2), `src/background/security/accessLevel.ts` (M21) | Al instalar/arrancar: `setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })`, 1 entrada `sw_started` y reconciliación vacía **< 1 s**; la consola del SW no muestra errores (`CA-RF-09` se cierra en H2) |
| 1.11 | Guarda de `sender` y allowlist de contextos | `src/background/security/senderGuard.ts` (M20) | Mensaje con `sender.id !== chrome.runtime.id` → `4100`; ruta fuera de la allowlist → `4200`; `origin` recalculado **solo** desde `sender.origin`; con `frameId !== 0` la respuesta vuelve solo a ese frame (RNF-10) |
| 1.12 | Provider publicado con alias y EIP-6963 | `src/inject/provider.ts` (M35), `src/inject/eip6963.ts` (M36), `src/inject/index.ts` (M37) | En `test.html`: `window.truekeate === window.codecrypto` (mismo objeto) y ambos exponen `request`/`on`/`removeListener`; `PROVIDER_UUID` **literal**; el anuncio EIP-6963 responde con `name: 'TrueKeate'` y `rdns: 'academy.codecrypto.truekeate'` (`CA-RT-13`); cualquier método responde `4200` **sin lanzar de forma síncrona** |
| 1.13 | Relay de página con puerto de larga vida | `src/content-script.ts` (M38) | `postMessage` siempre con `targetOrigin = location.origin` (nunca `'*'`); validación de `event.source`/`event.origin`; `chrome.runtime.connect({ name: APPROVAL_PORT_NAME })` con reconexión y mensaje `RESUME` (la cola llega en H4) |
| 1.14 | Catálogo cerrado, errores y lint de prohibiciones | `src/background/rpc/catalog.ts` (M4), `rpc/errors.ts` (M6), `scripts/lint-prohibited.mjs` | `npm run lint:prohibited` exit 0: 0 usos de `viem`/`@scure/bip39`/`@metamask/*`/`axios`/`fetch(` propio, 0 `chrome.storage.sync`, 0 `codecrypto_`, 0 colores fuera de `tokens.css` (`CA-RT-03`) |
| 1.15 | Stub de `chrome.*` con reloj inyectable | `test/setup/chrome-stub.ts`, bloque `test` de `vite.config.ts` | En memoria: `storage.local` (`get/set/remove/clear/setAccessLevel`), `alarms` (`create/clear/onAlarm`), `runtime`, `windows`, `tabs`, `permissions.request`, `action.setBadgeText`; cada prueba lo reinicia en `beforeEach` |
| 1.16 | Arnés E2E y plazos inyectables | `playwright.config.ts`, `e2e/fixtures/extension.ts`, `e2e/global-setup.ts` | `launchPersistentContext` con perfil nuevo (`mkdtemp`) y `dist` **absoluto**; ID descubierto del service worker (nunca escrito a mano); `stopServiceWorker(context, extensionId)` por CDP; `globalSetup` reconstruye con `VITE_SIGN_TIMEOUT_MS=3000`/`VITE_CONNECT_TIMEOUT_MS=2000` y una aserción comprueba los valores por defecto de producción |
| 1.17 | Instrumento Foundry del contrato verificador | `contracts/foundry.toml` (`solc` **fijado** `0.8.24`, `evm_version = "cancun"`, `optimizer = false`), `contracts/src/EIP712Verifier.sol`, `contracts/test/EIP712Verifier.t.sol`, `contracts/test/fixtures/eip712-signature.json` | `forge test --root contracts --match-contract EIP712VerifierTest` exit 0 con los **5 casos obligatorios** (firma válida `true`; firmante incorrecto `false`; dominio alterado `false`; firma malformada `false` **sin revert**; byte alterado `false`); el fixture está versionado y no depende de claves aleatorias ni de red (`CA-RT-11`) |
| 1.18 | Verificación de CI de los diagramas | `scripts/check-mermaid.mjs` | `npm run check:mermaid` ejecuta `mermaid.parse()` sobre los bloques de `RepoTecnico/` y termina con exit 0 (13/13) |
| 1.19 | Popup en estado vacío y dApp esqueleto | `src/popup/App.tsx` (M39), `test.html` | Popup 380×600 con el estado vacío en español y la llamada a la acción «Crear cartera» (aún sin lógica); `test.html` en `http://localhost:5174/test.html` muestra «provider detectado: TrueKeate» y el listado de flujos pendientes |
| 1.20 | Acta de cierre del hito | `RepoTecnico/evidencia/H1/*.json`, `*.log` | Salidas de `npm ci && npm run build`, `npx tsc -b`, `npm run test`, `npm run test:e2e`, `forge test`, `npm run check:mermaid` y `dist/manifest.json` archivadas |

#### 3.1.6 Criterios de aceptación
- `CA-RT-04` — el manifest declara en `permissions` **solo** `storage` y `alarms`; `notifications` aparece **únicamente** en `optional_permissions`; no hay `tabs`, `activeTab` ni `scripting`.
- `CA-RT-05` — `npm run build` genera `manifest.json` desde `src/manifest.ts` e incluye el bundle de `ethers` localmente; `grep -rn "http" dist/` no encuentra URLs de CDN.
- `CA-RT-09` — el artefacto es la carpeta `dist/` y la dApp se sirve en `http://localhost:5174` con `strictPort: true`; no existe despliegue remoto.
- `CA-RT-13` — `PROVIDER_UUID` y la `key` del manifest son **literales versionados**; el ID de la extensión es el mismo en dos equipos/ejecuciones; `grep -rn "codecrypto_" src/` → 0 coincidencias.
- `CA-RT-11` — `forge test` verifica una firma EIP-712 del fixture (`true` con la firma correcta, `false` si se altera un byte).
- RNF-13/RNF-14 — `npx tsc -b` exit 0 y `grep -rn "from 'ethers'" src/popup` → 0 coincidencias (el bundle de `ethers` vive solo en el SW).
- Carga de `dist/` con **0 errores en consola y 0 en el badge** de `chrome://extensions` (criterio de CU-36, `requerimientos.md` §4.2).

#### 3.1.7 Pruebas y evidencia
- **Vitest** (`npm run test`): `src/manifest/manifest.spec.ts` (6 entradas en `dist/`, `key` presente, `notifications` fuera de `permissions`), `naming.spec.ts` (UUID literal, prefijo `truekeate_`, tipos `TRUEKEATE_*`, `codecrypto_` = 0), `windowContract.spec.ts` (`window.truekeate === window.codecrypto` sobre el stub), `errors.spec.ts` (los 8 códigos y sus literales contra `diccionario_datos.md` §4.3).
- **Playwright** (`npm run test:e2e`): `01-onboarding.spec.ts` en su primera aserción — la extensión carga desde `dist/`, el popup abre en 380×600 y no hay errores de consola.
- **Forge**: `forge test --root contracts --match-contract EIP712VerifierTest` (5 casos).
- **Comandos**: `npm ci && npm run build`, `npx tsc -b`, `npm run lint:prohibited`, `npm run check:mermaid`, `anvil --version` + `cast chain-id`.
- **Evidencia**: `RepoTecnico/evidencia/H1/build-<fecha>.log`, `H1/manifest-<fecha>.json`, `H1/01-onboarding-<fecha>.png`, `H1/forge-eip712verifier-<fecha>.log`, `H1/typecheck-<fecha>.log`.

#### 3.1.8 Riesgos específicos
- **Emisión del `content-script.js`/`inject.js` como ESM** (rompe con `Cannot use import statement outside a module`): mitigado por el **doble build** con `format: 'iife'` y `inlineDynamicImports: true` (§7.5.3); se verifica abriendo una página arbitraria y comprobando que el provider existe.
- **ID de extensión inestable**: rompe la allowlist CORS de Anvil (RE-04) y la reproducibilidad E2E; mitigado con la `key` **congelada** y la aserción de `naming.spec.ts`.
- **Bundle de `ethers` en la UI**: si `ethers` se importa desde `popup/`, RNF-14 falla y el bundle crece; el `lint:prohibited` lo detecta en el commit, no al final.
- **`launchPersistentContext` inestable en Windows**: se usa ruta absoluta, perfil nuevo por prueba y `headless` conmutables; prohibido reutilizar perfil.
- **Diagramas Mermaid**: `npm run check:mermaid` entra ya como puerta para que la documentación no derive (R15).

#### 3.1.9 Definición de terminado (H1) — ✅ **COMPLETADO el 2026-09-11**
`npm ci && npm run build` exit 0 con las 6 entradas y `dist/manifest.json`; `npx tsc -b`, `npm run test`, `npm run test:e2e`, `forge test --root contracts --match-contract EIP712VerifierTest` y `npm run check:mermaid` en verde; `dist/` cargado en `chrome://extensions` sin errores, con icono en el toolbar, popup 380×600 en estado vacío y `test.html` detectando `window.truekeate`/`window.codecrypto`; acta y evidencia archivadas en `RepoTecnico/evidencia/H1/`; `estado_proyecto.md` actualizado.

**Cierre verificado (2026-09-11).** Hito **COMPLETADO**. **ID de extensión: `oiahebaliobknoeeonhgaacapjcpgblo`** (derivado de la `key` fija del manifest, estable entre equipos). Batería real ejecutada, con su evidencia archivada en `RepoTecnico/evidencia/H1/` y el acta `ACTA_H1.md`:

| Comando | Resultado real (2026-09-11) | Evidencia |
|---|---|---|
| `npm run build` | **exit 0** — **6 entradas** en `dist/` (`index.html`, `connect.html`, `notification.html`, `background.js`, `content-script.js`, `inject.js`) **+ `dist/manifest.json`** | `build-2026-09-11.log`, `manifest-2026-09-11.json` |
| `npx tsc -b` | **exit 0** (strict, 0 errores) | `typecheck-2026-09-11.log` |
| `npm run test` (Vitest) | **47 passed / 4 ficheros** (`manifest.spec.ts` 10, `errors.spec.ts` 16, `naming.spec.ts` 11, `windowContract.spec.ts` 10) | `vitest-2026-09-11.log` |
| `npm run test:e2e` (Playwright) | **4 passed** (`01-onboarding.spec.ts`) | `playwright-2026-09-11.log`, `e2e-2026-09-11.json` |
| `npm run lint:prohibited` | **exit 0** — 0 dependencias prohibidas, 0 `fetch(` propio, 0 `chrome.storage.sync`, 0 `codecrypto_`, 0 colores fuera de `tokens.css` y 0 `ethers` en el popup | `lint-prohibited-2026-09-11.log` |
| `npm run forge:test` (`forge test --root contracts --match-contract EIP712VerifierTest`) | **7 passed, 0 failed, 0 skipped** | `forge-eip712verifier-contracts-2026-09-11.log` |
| `npm run check:mermaid` | **27/27 bloques válidos** | `check-mermaid-2026-09-11.log` |
| Carga de `dist/` en Chromium (Playwright) | ID `oiahebaliobknoeeonhgaacapjcpgblo`, popup **380×600** en estado vacío, 0 errores de consola y 0 en el badge | `01-onboarding-2026-09-11.png`, `playwright-2026-09-11.log` |

#### 3.1.10 Cierre de H1: desviaciones aceptadas

Cinco desviaciones del corpus se descubrieron **al implementar** H1: tres de ellas (D-H1-1, D-H1-3 y D-H1-5) habrían roto el producto o la verificación si se hubieran seguido literalmente. Se corrigen en el corpus conforme a §7 (gestión del cambio) y quedan registradas como **DEC-47..DEC-51** en `estado_proyecto.md`. **Ninguna rebaja un criterio de aceptación**: el efecto observable exigido se mantiene en todos los casos.

| # | Desviación respecto al corpus | Motivo real (medido en H1) | Impacto y corrección |
|---|---|---|---|
| **D-H1-1** | `exclude_matches` incluía **`chrome-extension://*/*`** | **No es un patrón válido en `content_scripts`**: Chrome **rechaza el manifest completo** («Invalid value for 'content_scripts[0].exclude_matches[0]'») y la extensión **no carga** (el Service Worker nunca aparece). Además es **innecesario**: `<all_urls>` **no** cubre el esquema `chrome-extension://` | Se elimina el patrón; se conservan las exclusiones de `https://metamask.io/*` y `https://*.metamask.io/*`. **Regla vinculante:** **prohibido** usar el esquema `chrome-extension://` en `matches`/`exclude_matches`. `documento_tecnico.md` §7.3, `entornos_globales.md` §4, `requerimientos.md` (RNF-10) |
| **D-H1-2** | «un **array de dos builds**» en `vite.config.ts` | **Vite 7 no admite que el fichero de configuración exporte un array de builds**; y `format: 'iife'` + `inlineDynamicImports: true` exigen **una entrada por build** (Rollup rechaza el *code-splitting* en IIFE) | Se encadenan **3 builds** con la API programática `build()` desde el hook `closeBundle` del build 1: **ES** (páginas + Service Worker), **IIFE** (`content-script`) y **IIFE** (`inject`, que además genera y valida el manifest). Un solo `npm run build` sigue produciendo las **6 entradas**. `documento_tecnico.md` §7.5.2/§7.5.3 |
| **D-H1-3** | `min-height: 100vh` como medida de las tres ventanas | Con `100vh` el `body` medía **720 px** de alto en lugar de 600 y Chrome abría el popup con la **altura por defecto del navegador** | El `body` declara `width`/`height` **explícitos** con los tokens `--tk-popup-width/height`, `--tk-connect-*` y `--tk-notification-*` (`body.tk-popup` / `body.tk-connect` / `body.tk-notification`) y el contenedor interno (`.tk-window`) hereda `height: 100%`; `test.html` **no** lleva esas clases (allí el layout es fluido). `identidad_visual.md` §5.1, `documento_tecnico.md` §5.2 |
| **D-H1-4** | Poppins como **fuente variable** (un único `.woff2` con `font-weight: 400 700`) | **Poppins no es variable**: tiene pesos **discretos** | Se descargan y **auto-hospedan tres** ficheros (`poppins-latin-400/600/700.woff2`) con un `@font-face` **por peso**; **Inter** y **JetBrains Mono** sí son variables (`inter-latin.woff2`, `jetbrains-mono-latin.woff2`). Se versionan además las **licencias OFL-1.1** (`public/fonts/LICENSE-{poppins,inter,jetbrains-mono}.txt`). `identidad_visual.md` §4, `entornos_globales.md` §2, `requerimientos.md` (RT-12, RNF-23) |
| **D-H1-5** | `forge test` como literal normativo | **Falso verde:** sin `--root contracts` Foundry responde «Nothing to compile», ejecuta **0 pruebas** y termina con **exit 0** | El literal normativo pasa a **`forge test --root contracts --match-contract EIP712VerifierTest`** (`npm run forge:test`), que ejecuta las **7** pruebas. Se corrige el literal en este plan, en `documento_tecnico.md` (§7.2, §7.4, §5.4 y §9) y en `requerimientos.md` (RT-07/RT-11 y Anexo A) |

---

### 3.2 H2 — Cartera, cuentas y recuperación

#### 3.2.1 Objetivo
Entregar la **cartera operativa en frío y sin contraseña**: crear una cartera con 12 palabras BIP-39, importarla normalizando espacios/mayúsculas, derivar las **5 cuentas** `m/44'/60'/0'/0/i` y añadir la siguiente, importar por clave privada con etiqueta renombrable, recibir con dirección + copiar + QR, **revelar/exportar** el material de recuperación con higiene de 30 s y borrado del portapapeles, **resetear** con confirmación destructiva y **restaurar** todo el estado al reabrir el popup — con Anvil mostrando los saldos de las cuentas derivadas.

#### 3.2.2 Alcance
**Entra:** generación y validación BIP-39, derivación BIP-32/44, importación por clave privada, `truekeate_accounts`/`truekeate_imported_accounts`/`truekeate_current_account`/`truekeate_settings`, etiquetas (`accountLabels` + `label` de importadas), visibilidad y borrado **bloqueado** por sesión de dApp activa, recepción con QR local, revelado/exportación (`wallet_revealSecret`), integridad al arrancar («wallet dañada»), `resetWallet` con confirmación destructiva y exclusión de `truekeate_logs`, validación inline de los cuatro formularios, migración de esquema y el **aviso no descartable** del primer arranque.

**NO entra:** ninguna inyección funcional, ninguna lectura RPC de saldo/polling (llega en H3), ninguna aprobación, ningún envío, ningún log de actividad (llega en H5; el SW solo escribe `sw_started`/`sw_reconcile`), el bloqueo del reset por cola (`truekeate_pending_requests`/`truekeate_inflight_tx` se materializan en H4), el hint de Anvil (RF-12, Should) y «Acerca de» (RF-48, Should).

#### 3.2.3 Requisitos cubiertos
| Tipo | Requisitos |
|---|---|
| RF Must | **RF-01, RF-02, RF-03, RF-04, RF-05, RF-07, RF-09, RF-10, RF-11 (parte 1), RF-33, RF-50** |
| RNF / RT | RNF-06, RNF-09 (higiene del revelado), RNF-18 (parcial), RNF-21 (parcial), RNF-22, RNF-23 (primer arranque); `CA-RT-02`, `CA-RT-10`, `CA-RT-12` (parcial) |
| CU | CU-01, CU-02, CU-03, CU-04, CU-05, CU-07, CU-08, CU-09, CU-30, CU-32, CU-33 (parcial) |

#### 3.2.4 Módulos implementados
M8 `crypto/mnemonic.ts` · M9 `crypto/hd.ts` · M10 `crypto/importAccount.ts` · M12 `crypto/secrets.ts` · M13 `crypto/integrity.ts` · M28 `accounts.ts` · M29 `settings.ts` · M33 `state/schema.ts` (`resetWallet`, claves canónicas) · M34 `state/migrations.ts` · M3 `rpc/router.ts` (despacho de `InternalMethod`) · M39 `popup/App.tsx` (pestañas) · M40 `popup/views/AccountsView.tsx` · M41 `popup/views/ReceiveView.tsx` · M46 `popup/views/SecurityView.tsx` · M57 `shared/constants.ts` (ampliación) · M58 `shared/validation/address.ts` · M59 `shared/validation/mnemonic.ts` · M60 `shared/validation/amount.ts` · M61 `shared/validation/privateKey.ts` · M62 `shared/format.ts` · M63 `shared/qr.ts` · M22 `security/redaction.ts` (aplicada a `params` persistidos).

#### 3.2.5 Tareas
| # | Tarea | Archivo que crea o modifica | Resultado observable |
|---|---|---|---|
| 2.1 | Generar y validar la frase BIP-39 de 12 palabras | `src/background/crypto/mnemonic.ts` (M8), `src/shared/validation/mnemonic.ts` (M59) | «Crear cartera nueva» devuelve 12 palabras con checksum BIP-39 válido; `Mnemonic.isValidMnemonic` y `wordCount === 12` (`CA-RF-01`) |
| 2.2 | Importar frase con normalización y checksum | `src/background/crypto/mnemonic.ts` (M8), M59 | 12 palabras con espacios/mayúsculas irregulares derivan la **misma** cuenta 0 canónica; checksum inválido → `-32602` (`CA-RF-02`) |
| 2.3 | Derivable el flujo sin contraseña | `src/background.ts` (M2), `src/popup/views/AccountsView.tsx` (M40) | Al cargar/importar, el popup muestra la cuenta 0 y su estado **sin prompt de contraseña**; `settings.encryptionEnabled = false` (`CA-RF-03`, RE-02) |
| 2.4 | Derivación HD y «Añadir cuenta» | `src/background/crypto/hd.ts` (M9), `src/background/accounts.ts` (M28) | Tras crear hay **exactamente 5** cuentas (índices 0..4) y «Añadir cuenta» deriva y persiste la 6.ª (`CA-RF-04`, DEC-11) |
| 2.5 | Importar por clave privada con etiqueta | `src/background/crypto/importAccount.ts` (M10), `src/shared/validation/privateKey.ts` (M61), M28 | `0x`+64 hex en rango secp256k1 añade la cuenta marcada «importada»; clave repetida → `-32602`; la etiqueta renombrada persiste en `truekeate_imported_accounts` (`CA-RF-05`) |
| 2.6 | Etiquetas y visibilidad de cuentas | `src/background/accounts.ts` (M28), `src/background/settings.ts` (M29), M40 | Renombrar una derivada escribe `accountLabels[índice]`; ocultar una derivada la retira de la lista sin borrar su derivación (DEC-35) |
| 2.7 | Guarda de sesión de dApp activa | `src/background/accounts.ts` (M28), `src/background/crypto/secrets.ts` (M12) | Con una entrada vigente en `truekeate_connected_sites`, revelar y eliminar responden **`-32000`** con la causa de `diccionario_datos.md` §4.3 que nombra el `origen` y la acción de revocar (DEC-45/R-09a) |
| 2.8 | Recepción: dirección, copiar y QR local | `src/popup/views/ReceiveView.tsx` (M41), `src/shared/qr.ts` (M63), `src/shared/format.ts` (M62) | La dirección mostrada, la del portapapeles y la del QR decodificado son la **misma** cadena `0x…`; el QR se genera sin red y sin dependencias remotas (`CA-RF-07`) |
| 2.9 | Revelado/exportación con higiene | `src/background/crypto/secrets.ts` (M12), `rpc/router.ts` (`wallet_revealSecret`), `src/popup/views/SecurityView.tsx` (M46) | Confirmación explícita; valor oculto por defecto; revelado **30 s** (`REVEAL_HIDE_MS`) con ocultado **también por pérdida de foco**; al ocultar se **borra el portapapeles** si aún contiene la semilla; el valor **nunca** viaja por `window.postMessage` (`CA-RF-50`, DEC-37/P-20) |
| 2.10 | Integridad al arrancar | `src/background/crypto/integrity.ts` (M13) | Mnemonic con checksum roto o dirección con EIP-55 inválido → estado «wallet dañada» y **0** derivaciones silenciosas distintas (RNF-22) |
| 2.11 | Esquema, versionado y migración | `src/background/state/schema.ts` (M33), `src/background/state/migrations.ts` (M34) | Claves canónicas `truekeate_*` con versión de esquema; una clave no canónica se rechaza; la migración v1.2 → v1.4 no pierde datos |
| 2.12 | `resetWallet` con confirmación destructiva | `src/background/state/schema.ts` (M33), `M46` | Con la cola vacía y sin transacción en vuelo, el reset borra mnemonic, cuentas y sesiones y deja el popup en el inicio; el diálogo **enumera** las cuentas importadas que se perderán y **conserva** `truekeate_logs` (`CA-RF-11`, parte 1; RF-32 se activa como Should) |
| 2.13 | Auto-carga y restauración del estado | `src/background.ts` (M2), M13/M33/M34/M28/M29 | Al reabrir el popup se restauran cuenta activa, red, importadas y sesiones con los mismos valores y **sin** pedir la frase (`CA-RF-09`, `CA-RF-10`) |
| 2.14 | Validación inline de formularios | `src/shared/validation/address.ts` (M58), `mnemonic.ts` (M59), `amount.ts` (M60), `privateKey.ts` (M61), M40/M41/M46 | Frase, dirección, importe o clave inválidos muestran mensaje inline **y** la operación no se envía (código y acción de `diccionario_datos.md` §4.3) (`CA-RF-33`) |
| 2.15 | Aviso in-product del primer arranque | `src/popup/App.tsx` (M39), `src/background/settings.ts` (M29) | Aviso **no descartable** «entorno de desarrollo — no usar con fondos reales» en el primer arranque, con la aceptación registrada en `truekeate_settings.devNoticeAcceptedAt` (RNF-23, RE-02) |
| 2.16 | Especificaciones del hito | `src/background/crypto/*.spec.ts`, `src/background/accounts.spec.ts`, `src/background/state/*.spec.ts`, specs de validación | Todos los specs de §3.2.7 en verde con la cobertura de `crypto/` y `shared/validation/` ≥ 80 % |
| 2.17 | E2E del hito | `e2e/01-onboarding.spec.ts`, `02-cuentas.spec.ts`, `03-recibir.spec.ts`, `05-persistencia.spec.ts`, `06-reset.spec.ts`, `16-validacion.spec.ts`, `25-recuperacion.spec.ts` | Cada flujo demuestra su criterio contra Anvil en marcha; capturas y JSON en `RepoTecnico/evidencia/H2/` |

#### 3.2.6 Criterios de aceptación
- `CA-RF-01`, `CA-RF-02`, `CA-RF-03`, `CA-RF-04`, `CA-RF-05` (incluida la guarda `-32000` de R-09a), `CA-RF-07`, `CA-RF-09`, `CA-RF-10`, `CA-RF-11` (parte 1), `CA-RF-33`, `CA-RF-50` (30 s, pérdida de foco, borrado del portapapeles, nunca `postMessage`, guarda `-32000`).
- RNF-22 — revelado solo tras confirmación explícita, diálogo destructivo que enumera las importadas y «wallet dañada» ante corrupción.
- RNF-09 (higiene del revelado) — 0 mensajes con mnemonic o clave hacia la página; el valor se descarta de la memoria de la UI al ocultarse.
- RNF-23 (parcial) — el aviso del primer arranque es no descartable y queda registrado en `truekeate_settings`.
- `CA-RT-02` — mnemonic, HD e importación usan **solo** `ethers.js v6`; `grep -rn "from 'ethers'" src/popup` → 0 coincidencias.
- `CA-RT-10` — toda cadena visible en español; `grep -rniE "(send|cancel|copy|confirm)" src/popup` → 0 coincidencias.

#### 3.2.7 Pruebas y evidencia
- **Vitest**: `mnemonic.spec.ts` (generación, normalización, checksum), `derivation.spec.ts` (ruta `m/44'/60'/0'/0/i`, 5 cuentas, índices), `importPrivateKey.spec.ts` (rango secp256k1, duplicada), `accounts.spec.ts` (etiquetas, visibilidad, guarda `-32000`), `state.spec.ts` (persistencia y restauración), `integrity.spec.ts` (mnemonic y dirección corruptos), `secretsExport.spec.ts` (confirmación, 30 s, pérdida de foco, borrado del portapapeles, no `postMessage`, bloqueo `-32000`), `revealHygiene.spec.ts`, `revealClipboard.spec.ts`, `validation.spec.ts`, `reset.spec.ts` (**orden de comprobación** y bloqueo `-32000`), `qr.spec.ts`.
- **Playwright**: `01-onboarding.spec.ts` (crear, importar y **sin prompt de contraseña**), `02-cuentas.spec.ts` (5 cuentas y 6.ª), `03-recibir.spec.ts` (copiar y QR), `05-persistencia.spec.ts` (reabrir y restaurar), `06-reset.spec.ts` (reset con la cola vacía y reset bloqueado), `16-validacion.spec.ts`, `25-recuperacion.spec.ts` (revelado temporal, portapapeles borrado, bloqueo y desbloqueo tras revocar).
- **Comandos**: `cast balance <cuenta0>` como contraste del saldo mostrado.
- **Evidencia**: `RepoTecnico/evidencia/H2/01-onboarding-<fecha>.json`, `H2/25-recuperacion-<fecha>.png`, `H2/reset-<fecha>.json`, `H2/coverage-<fecha>.json`.

#### 3.2.8 Riesgos específicos
- **Mnemonic en claro** (R2): riesgo aceptado P-03/RE-02; se compensa con el aviso no descartable y con la higiene del revelado.
- **Fuga por el portapapeles**: el borrado al ocultar (temporizador **y** blur) es criterio, no cortesía; `revealClipboard.spec.ts` falla si el portapapeles conserva la semilla.
- **Cuentas importadas irrecuperables** (R7): RF-50 es Must y bloquea el cierre de H2.
- **QR con dependencias remotas**: prohibido por RNF-20/RT-03; `qr.ts` se implementa localmente.
- **Etiquetas confundidas entre derivadas e importadas**: `accountLabels` (DEC-35) aplica a derivadas y `label` a importadas; el test cubre ambos.

#### 3.2.9 Definición de terminado (H2)
Todos los `CA-RF-xx` del hito verificados con su evidencia; `npm run test` y `npm run test:e2e` en verde con cobertura ≥ 80 % en `crypto/` y `shared/validation/`; crear/importar/derivar/importar-clave/recibir/revelar/resetear/restaurar demostrados con Anvil en marcha; evidencia en `RepoTecnico/evidencia/H2/`; corpus y memoria actualizados.

---

### 3.3 H3 — Provider, conexión y lectura

#### 3.3.1 Objetivo
Convertir la extensión en un **proveedor EIP-1193 real y utilizable por una dApp**: `window.truekeate` con el alias `window.codecrypto` en todas las páginas y frames, catálogo cerrado de lectura contra Anvil, errores tipados con `code`, eventos, `eth_requestAccounts` con `connect.html`, sesión por origen de **24 h renovables**, revocación desde el popup y **polling de saldos** — todo ello ejercitado ya desde `test.html` (detectar, conectar, saldo, eventos).

#### 3.3.2 Alcance
**Entra:** provider completo (`request`/`on`/`removeListener`, `chainId` y `selectedAddress` cacheados), EIP-6963 anunciado y re-anunciado, `content-script` completo (dos saltos de eventos), `router` de métodos de página, catálogo de lectura (`eth_chainId`, `eth_getBalance`, `eth_blockNumber`, `eth_gasPrice`, `eth_feeHistory`, `eth_estimateGas`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`), `eth_accounts`/`eth_requestAccounts`, `JsonRpcProvider` único con reintentos, `truekeate_connected_sites` con TTL, `connect.html`, `SitesView` con revocación, propagación de `accountsChanged`/`connect`/`disconnect`/`message`, `useBalancePolling`, *token bucket* por origen persistido y `test.html` con 4 flujos.

**NO entra:** ningún método aprobable (`eth_sendTransaction`, `personal_sign`, `eth_signTypedData_v4`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`, `wallet_revokePermissions` desde la dApp) → todos responden `4200`/`4100` con la cola **aún no implementada**; ningún log de actividad en `truekeate_logs` (llega en H5); ninguna red distinta de Anvil; `chainChanged` por cambio de red (llega en H5, con el `switch` aprobable).

#### 3.3.3 Requisitos cubiertos
| Tipo | Requisitos |
|---|---|
| RF Must | **RF-13, RF-14, RF-15, RF-16, RF-17, RF-18, RF-25, RF-26, RF-27, RF-36, RF-45** |
| RNF / RT | RNF-06, RNF-07, RNF-08 (reconciliación vacía), RNF-10, RNF-11, RNF-12 (parcial), RNF-16 (parcial), RNF-25 (parcial); `CA-RT-04`, `CA-RT-06`, `CA-RT-13` |
| CU | CU-08, CU-10, CU-17, CU-18, CU-19, CU-20, CU-21, CU-22, CU-26, CU-31 |

#### 3.3.4 Módulos implementados
M2 `background.ts` (cableado completo) · M3 `rpc/router.ts` (PageMethod + InternalMethod) · M4 `rpc/catalog.ts` (catálogo cerrado de §4.3 con `eth_sign` fuera → `4200`) · M5 `rpc/client.ts` (`JsonRpcProvider` único, feeData, nonce, `estimateGas`, recibo) · M6 `rpc/errors.ts` · M20 `security/senderGuard.ts` · M21 `security/accessLevel.ts` · M22 `security/redaction.ts` · M23 `networks/catalog.ts` (Anvil por defecto) · M26 `sessions.ts` (`truekeate_connected_sites`, TTL 24 h renovable) · M27 `events.ts` · M35/M36/M37 `inject/*` · M38 `content-script.ts` · M44 `popup/views/SitesView.tsx` · M47 `popup/hooks/useBalancePolling.ts` · M48 `connect/App.tsx` · M49 `connect/ConnectRow.tsx` · M55/M56 · `test.html` (4 flujos) · M33 (`truekeate_rate_windows`).

#### 3.3.5 Tareas
| # | Tarea | Archivo que crea o modifica | Resultado observable |
|---|---|---|---|
| 3.1 | Guarda de `sender` completa | `src/background/security/senderGuard.ts` (M20) | `sender.id !== chrome.runtime.id` → `4100`; `origin` **solo** desde `sender.origin` normalizado; con `sender.frameId !== 0` **prohibido** caer a `sender.tab.url` y la respuesta vuelve a ese frame (DEC-40/ADT-07) |
| 3.2 | Catálogo RPC cerrado | `src/background/rpc/catalog.ts` (M4) | Método fuera del catálogo → `4200`; `eth_sign` **fuera** (DEC-22); los métodos aprobables responden `4200` mientras la cola no existe (sin lanzar de forma síncrona) |
| 3.3 | Router de métodos de página | `src/background/rpc/router.ts` (M3) | `TRUEKEATE_RPC` valida contexto permitido y método; devuelve lecturas y errores tipados; **ningún** método sensible firma en silencio (RNF-12) |
| 3.4 | Cliente RPC con política cerrada de reintentos | `src/background/rpc/client.ts` (M5) | `eth_chainId` → `0x7a69`, `eth_getBalance` → saldo de Anvil, `eth_blockNumber` ≥ 1; con el RPC caído: 4 llamadas (1 + 3) con backoff 1 s/2 s/4 s, timeout 5 s por intento, UI «desconectado» y storage intacto (`CA-RF-18`, RNF-07) |
| 3.5 | Errores y redacción | `src/background/rpc/errors.ts` (M6), `src/background/security/redaction.ts` (M22) | Todo error que ve la página es un objeto EIP-1193 con `code` y mensaje en español (causa + acción) tomado de `diccionario_datos.md` §4.3; ningún `new Error('...')` sin `code` (RNF-06) |
| 3.6 | Red por defecto Anvil | `src/background/networks/catalog.ts` (M23) | `truekeate_networks` se siembra con Anvil (`0x7a69`, `isDefault: true`), símbolo `ETH` y validación de `chainId`; **sin** Sepolia (`CA-RT-06`) |
| 3.7 | Sesiones por origen con TTL de 24 h | `src/background/sessions.ts` (M26) | `eth_accounts` sin sesión → `[]` **sin abrir ventana**; con sesión → la cuenta autorizada; `expiresAt = lastUsedAt + 86400000` **renovable en cada uso**; tras 24 h → `[]` (`CA-RF-17`, `CA-RF-25`, DEC-31) |
| 3.8 | Propagación de eventos | `src/background/events.ts` (M27), `src/content-script.ts` (M38) | `accountsChanged`, `connect`, `disconnect` y `message` llegan **a todas las pestañas** con la cuenta nueva; el content script reenvía el evento **literalmente**, sin transformar (`CA-RF-15`, `CA-RF-24` parcial) |
| 3.9 | EIP-6963 y superficie del provider | `src/inject/eip6963.ts` (M36), `src/inject/provider.ts` (M35) | Tras `DOMContentLoaded`, `eip6963:requestProvider` recibe `announceProvider` con `uuid` (literal), `name: 'TrueKeate'`, `icon` (data-URI PNG de 96 px) y `rdns: 'academy.codecrypto.truekeate'`; `window.truekeate === window.codecrypto` (`CA-RF-13`, `CA-RF-45`) |
| 3.10 | `eth_requestAccounts` y `connect.html` | `src/connect/App.tsx` (M48), `src/connect/ConnectRow.tsx` (M49), M26, M18 (apertura de ventana) | Al elegir la cuenta 2, `eth_requestAccounts` resuelve `['<cuenta2>']`; al cancelar → `4001`; la ventana lista **todas** las cuentas con su saldo y es seleccionable por teclado (`CA-RF-16`, `CA-RF-36`) |
| 3.11 | Revocación desde el popup | `src/popup/views/SitesView.tsx` (M44), M26 | Revocar un origen lo elimina de `truekeate_connected_sites`, emite `accountsChanged []` y `eth_accounts` pasa a `[]`; desde el popup **no** se crea entrada en la cola (`CA-RF-26`) |
| 3.12 | Polling de saldos | `src/popup/hooks/useBalancePolling.ts` (M47), M5 | 1 `eth_getBalance` por cuenta visible cada 5 s; el ciclo arranca al abrir la vista, para al cerrarla o cambiar de cuenta y se suspende si el RPC no responde (`CA-RF-27`, RNF-03) |
| 3.13 | *Token bucket* por origen persistido | `src/background/rpc/router.ts` (M3), M33 (`truekeate_rate_windows`) | La ventana de 6 solicitudes/60 s cubre **todo** el catálogo (también lecturas) y sobrevive a la suspensión del SW; al exceder → `4001` **sin abrir ventana** (DEC-44/ADT-24) |
| 3.14 | dApp de pruebas: 4 flujos | `test.html` | Detectar, conectar, consultar saldo y escuchar eventos muestran resultado en pantalla en **< 5000 ms**; los flujos de envío, EIP-712 y cambio de red se marcan «pendiente de hito» |
| 3.15 | Especificaciones del hito | `src/inject/*.spec.ts`, `src/background/rpc/*.spec.ts`, `sessions.spec.ts`, `polling.spec.ts`, `accounts.spec.ts`, `messaging.spec.ts`, `originFrame.spec.ts`, `rateLimit.spec.ts` | Todos en verde; `rpcRetry.spec.ts` con contador de 4 llamadas |
| 3.16 | E2E del hito | `e2e/07-provider.spec.ts`, `08-eventos.spec.ts`, `09-conectar.spec.ts`, `13-revocar.spec.ts`, `14-polling.spec.ts`, `27-rpc-caido.spec.ts`, `28-iframe-hostil.spec.ts` | Provider con alias, eventos en 2 pestañas, conexión con test negativo de origen no conectado, revocación, polling y RPC caído; iframe cross-origin **no** hereda la sesión del top |

#### 3.3.6 Criterios de aceptación
- `CA-RF-13` — `window.truekeate === window.codecrypto` (el mismo objeto) y ambos exponen `request`/`on`/`removeListener`; inyección en todas las páginas y frames con `all_frames: true` y `document_start`.
- `CA-RF-14` / `CA-RF-45` — método desconocido → `code: 4200` con mensaje en español; **ningún** método lanza de forma síncrona; los 8 códigos de `requerimientos.md` §2.1 se mapean con los literales de `diccionario_datos.md` §4.3.
- `CA-RF-15` / `CA-RF-24` (parte `accountsChanged`) — `on('accountsChanged', cb)` responde al cambio desde el popup y `removeListener` deja de invocarlo; el evento llega a **todas** las pestañas conectadas.
- `CA-RF-16` / `CA-RF-36` — elección de cuenta en `connect.html` con saldos; rechazo → `4001`.
- `CA-RF-17` / `CA-RF-25` — origen no conectado → `[]` sin ventana; conectado → cuenta autorizada **sin nuevo prompt** tras recargar `test.html` y reiniciar el SW; vencida a las 24 h → `[]` y cualquier uso renueva `expiresAt`.
- `CA-RF-18` — `eth_chainId` → `0x7a69`, `eth_getBalance(cuenta0)` = saldo de Anvil y `eth_blockNumber` ≥ 1.
- `CA-RF-26` — revocación con `accountsChanged []` posterior.
- `CA-RF-27` — 1 `eth_getBalance` por cuenta visible y ciclo, con parada al cerrar.
- RNF-10, RNF-11 — 0 mensajes privilegiados desde página arbitraria; `4100` en método sensible sin sesión.

#### 3.3.7 Pruebas y evidencia
- **Vitest**: `inject.spec.ts` (alias y superficie), `naming.spec.ts` (UUID literal y `rdns`), `errors.spec.ts` / `eip1193.spec.ts` (los 8 códigos), `messaging.spec.ts` (allowlist de métodos internos y rechazo de `sender`/`origin` inválidos), `manifest.spec.ts` (`use_dynamic_url`, `exclude_matches`, sin `notifications` en `permissions`), `accounts.spec.ts` (RNF-11), `sessions.spec.ts` (renovación de `expiresAt`), `polling.spec.ts` (contador RPC), `rpcRetry.spec.ts` (1+3 con backoff), `rateLimit.spec.ts` (100 lecturas disparan el *token bucket*), `originFrame.spec.ts` (frame ≠ 0), `windowContract.spec.ts`.
- **Playwright**: `07-provider.spec.ts` (alias, ID de extensión estable entre ejecuciones), `08-eventos.spec.ts` (2 pestañas), `09-conectar.spec.ts` (elección y test negativo), `13-revocar.spec.ts`, `14-polling.spec.ts`, `27-rpc-caido.spec.ts` (Anvil detenido → `4900`), `28-iframe-hostil.spec.ts`.
- **Comandos**: `cast chain-id`, `cast block-number`, `cast balance 0xf39F…2266`.
- **Evidencia**: `RepoTecnico/evidencia/H3/07-provider-<fecha>.json`, `H3/09-conectar-<fecha>.png`, `H3/28-iframe-hostil-<fecha>.json`, `H3/rpc-caido-<fecha>.log`.

#### 3.3.8 Riesgos específicos
- **Creencia de que el puerto mantiene vivo el SW** (R16): prohibida por contrato; el evento y la sesión se reconstruyen desde storage.
- **Heredar la sesión del top en un iframe**: bloqueante si `originFrame.spec.ts` no observa la respuesta aislada (DEC-40).
- **CORS/host permissions** (R6): si `eth_chainId` devuelve `4900` con Anvil arriba, se revisa la allowlist CORS antes de tocar código.
- **RPC caído** (R8): la política cerrada de 4 llamadas es criterio, no sugerencia; la UI se mantiene interactiva.
- **Polling desmedido**: cada ciclo debe ser exactamente 1 RPC por cuenta visible; un contador mayor invalida el hito (RNF-03).

#### 3.3.9 Definición de terminado (H3)
`test.html` detecta, conecta, lee saldo y recibe eventos contra Anvil, con la sesión de 24 h persistida y revocable; los `CA-RF-xx` de la lista verificados con evidencia en `RepoTecnico/evidencia/H3/`; RPC caído deja el storage intacto y la UI «desconectado»; `npm run test` + `npm run test:e2e` en verde; corpus y memoria actualizados.

---

### 3.4 H4 — Firma, aprobación y transacciones

#### 3.4.1 Objetivo
Hacer que **toda operación sensible pase por la cola persistida** con una **ventana de confirmación global única**, vista previa **decodificada** y plazo con **dueño único en el Service Worker** (`chrome.alarms`): enviar ETH (a dirección externa y entre cuentas propias) con EIP-1559 tipo 2 y EIP-155, `personal_sign`, `eth_signTypedData_v4` con `name`/`verifyingContract` y aviso de `domainChainMismatch`, y que la firma EIP-712 producida por la wallet **verifique on-chain** con `EIP712Verifier.sol`.

#### 3.4.2 Alcance
**Entra:** cola `truekeate_pending_requests` con `rmwLock` y cardinalidad (8 globales / 1 por origen / 6 por minuto), `chrome.alarms` con `truekeate_expire:<approvalId>`, puerto `truekeate_approval` con `RESUME` y backoff, **una sola** `notification.html` global con contador, reconciliación al arrancar, marca `truekeate_inflight_tx`, `TxPreview`/`TypedDataPreview`/`PersonalSignPreview`, `M66` tabla **local cerrada** de selectores, cota de payload de **64 KiB**, firma EIP-1559/EIP-155/EIP-712/`personal_sign`, contrato observable de transacción, `SendView` y **guarda de reset** por cola/inflight, y la correspondencia wallet↔`EIP712Verifier`.

**NO entra:** el cambio y alta de **redes** (`wallet_switchEthereumChain`/`wallet_addEthereumChain` responden `4901`/`4200` hasta H5), `chainChanged`, el **log de actividad** en la UI (`truekeate_logs` llega en H5; el SW solo escribe los eventos imprescindibles), el badge (RF-38, Should) y las notificaciones de Chrome (RF-39, Should), y el timeout como **RF-40** (su **mecanismo** es estructural y se implementa aquí; su `CA-RF-40` se valida en C10).

#### 3.4.3 Requisitos cubiertos
| Tipo | Requisitos |
|---|---|
| RF Must | **RF-08, RF-19, RF-20, RF-21, RF-35, RF-37, RF-41, RF-42, RF-43** + **guarda de RF-11** (parte 2) |
| RNF / RT | RNF-05, RNF-08, RNF-09 (redacción del payload), RNF-12, RNF-25; `CA-RT-07`, `CA-RT-11` |
| CU | CU-11, CU-12, CU-13, CU-14, CU-15, CU-16, CU-27, CU-28, CU-30 (flujo E1) |

#### 3.4.4 Módulos implementados
M7 `rpc/txContract.ts` · M11 `crypto/sign.ts` · M14 `approvals/queue.ts` · M15 `approvals/timeout.ts` · M16 `approvals/reconcile.ts` · M17 `approvals/ports.ts` · M18 `approvals/focus.ts` · M19 `approvals/preview.ts` · M66 `approvals/calldata.ts` · M42 `popup/views/SendView.tsx` · M50 `notification/App.tsx` · M51 `TxPreviewPanel.tsx` · M52 `RiskWarnings.tsx` · M53 `TypedDataPanel.tsx` · M54 `PersonalSignPanel.tsx` · M33 (`truekeate_pending_requests`, `truekeate_inflight_tx`, `truekeate_approval_window`) · M22 `security/redaction.ts` (primeros 10 bytes de `data`, hash y longitud del payload firmado) · `contracts/*` (correspondencia).

#### 3.4.5 Tareas
| # | Tarea | Archivo que crea o modifica | Resultado observable |
|---|---|---|---|
| 4.1 | Cola persistida con RMW serializado | `src/background/approvals/queue.ts` (M14) | `truekeate_pending_requests` = `Record<approvalId, PendingRequest>`; dos solicitudes simultáneas **coexisten** sin sobrescribirse (`CA-RF-37`); al exceder 8 globales / 1 por origen / 6 por minuto → `4001` **inmediato sin persistir ni abrir ventana** |
| 4.2 | Plazo con dueño único | `src/background/approvals/timeout.ts` (M15) | `expiresAt = createdAt + SIGN_TIMEOUT_MS` (120 s) o `+ CONNECT_TIMEOUT_MS` (60 s), **anclado a `createdAt`**; `chrome.alarms.create('truekeate_expire:<approvalId>', { when: expiresAt })`; **prohibidos** `setTimeout`/`setInterval` |
| 4.3 | Puerto de larga vida y `RESUME` | `src/background/approvals/ports.ts` (M17), `src/content-script.ts` | Reconexión con backoff 1→2→4→8→16→30 s y `RESUME { approvalId }`; respuesta desde el registro persistido o `4001` si ya no está `pending`; el puerto **no** se usa como *keep-alive* |
| 4.4 | Ventana de decisión **global única** | `src/background/approvals/focus.ts` (M18) | Como máximo **una** `notification.html` en toda la extensión (P-21): la ventana se abre/reutiliza por `windowId` y, si se pierde, por re-descubrimiento de URL; muestra la `pending` de menor `createdAt` y el **contador de pendientes**; al resolver se muestra la siguiente o se cierra; cerrar con la X equivale a rechazo (`4001`) salvo vencimiento (`CA-RF-35`, `CA-RF-41`) |
| 4.5 | Reconciliación al arrancar | `src/background/approvals/reconcile.ts` (M16) | En cada arranque: purga de entradas con `status !== 'pending'` o `expiresAt <= now`, `4001` a las huérfanas, rearme de `alarms` desde el `expiresAt` persistido, reconstrucción de `truekeate_inflight_tx` y `truekeate_rate_windows`, y **1** entrada `sw_reconcile`; **< 1 s** con 50 pendientes y reloj inyectado (`CA-RF-41`, RNF-08) |
| 4.6 | Serialización por cuenta | `src/background/approvals/queue.ts` (M14), M33 | **Máximo 1 transacción en vuelo por `from`** mediante `truekeate_inflight_tx`; el `nonce` definitivo se recalcula con `getTransactionCount(account, 'pending')` junto a `getFeeData()`; `nonceInformativo` es solo informativo |
| 4.7 | Vista previa decodificada y avisos | `src/background/approvals/preview.ts` (M19), `src/background/approvals/calldata.ts` (M66), M51, M52 | La vista previa muestra selector, `functionName`, `decodedArgs` y `toLabel`; **fuera de la tabla local cerrada** `functionName = null` con **aviso bloqueante** y sin servicios externos (DEC-41/ADT-08); avisos de riesgo de `allowance` ilimitada, `setApprovalForAll` y contrato no reconocido (`CA-RF-19`) |
| 4.8 | Cota de payload de 64 KiB | `src/background/approvals/queue.ts` (M14), M22, `src/shared/constants.ts` | Payload > 64 KiB → `-32602` sin persistir; las previews largas se persisten **redactadas en reposo** (DEC-42/ADT-21) |
| 4.9 | Firma EIP-1559, EIP-155, EIP-712 y `personal_sign` | `src/background/crypto/sign.ts` (M11) | Única vía de firma: tipo 2 con `maxFeePerGas`/`maxPriorityFeePerGas` > 0 de `getFeeData()`; `chainId` dentro de la firma (`v` = `chainId*2+35`/`36`) y rechazo de `chainId` ajeno; EIP-712 con `domain`/`types`/`message` y `primaryType`; `personal_sign` con prefijo `\x19Ethereum Signed Message` (`CA-RF-42`, `CA-RF-43`, `CA-RF-20`, `CA-RF-21`) |
| 4.10 | Contrato observable de la transacción | `src/background/rpc/txContract.ts` (M7) | `eth_sendTransaction` devuelve el hash **al difundir**; la UI y el contrato interno reflejan `pending → confirmed`/`failed`/`reverted` consultando `eth_getTransactionReceipt`; `estimateGas` fallido **bloquea el envío** con `-32000` y motivo accionable, sin abrir la ventana (RNF-25) |
| 4.11 | Ventana `notification.html` y paneles | `src/notification/App.tsx` (M50), `TxPreviewPanel.tsx` (M51), `RiskWarnings.tsx` (M52), `TypedDataPanel.tsx` (M53), `PersonalSignPanel.tsx` (M54) | Origen y favicon **siempre visibles**, insignia de riesgo, contador de pendientes, resumen (cuenta, destino etiquetado, valor, red, comisión estimada) y **solo** «Aprobar» y «Rechazar» (`Esc` = rechazar); la ventana **no firma** (`CA-RF-35`) |
| 4.12 | EIP-712: `name`, `verifyingContract` y aviso de dominio | `src/notification/TypedDataPanel.tsx` (M53), M19 | Se muestran `domain.name` y `verifyingContract`; si `domain.chainId ≠` red activa, aviso **destacado** (`domainChainMismatch`); `verifyingContractMismatch` = dirección cero o contrato no desplegado (`CA-RF-20`) |
| 4.13 | `personal_sign` legible | `src/notification/PersonalSignPanel.tsx` (M54), M19 | Texto UTF-8 visible y aviso «contenido no legible» si el payload es hex no decodificable; los bytes **nunca** se copian a `truekeate_logs` (`CA-RF-21`) |
| 4.14 | Formulario de envío | `src/popup/views/SendView.tsx` (M42) | Envío a dirección externa y entre cuentas propias con comisión estimada, validación inline y `insufficientFunds` bloqueante (`CA-RF-08`, `CA-RF-33`) |
| 4.15 | Guarda de reset por estado de la cola | `src/background/state/schema.ts` (M33), M46 | Con `truekeate_pending_requests` no vacía o `truekeate_inflight_tx` vigente, el reset se **bloquea** con `-32000`, la UI indica **cuántas** solicitudes quedan y ofrece resolverlas o esperar; orden estricto **cola vacía → sin transacción en vuelo → confirmación destructiva → limpieza** (DEC-46/R-09b; cierra `CA-RF-11`) |
| 4.16 | Correspondencia wallet ↔ contrato verificador | `contracts/test/EIP712Verifier.t.sol`, `contracts/test/fixtures/eip712-signature.json`, `e2e/11-firmar-eip712.spec.ts` | La firma EIP-712 producida por M11 sobre el dominio `TrueKeate Test App` (`chainId 31337`) verifica **on-chain** (`true`) y un byte alterado del mensaje devuelve `false` (`CA-RT-11`) |
| 4.17 | Especificaciones del hito | `src/background/approvals/*.spec.ts`, `crypto/sign.spec.ts`, `rpc/txContract.spec.ts`, `typedData.spec.ts`, `personalSign.spec.ts`, `eip1559.spec.ts`, `eip155.spec.ts`, `payloadLimit.spec.ts`, `windowQueue.spec.ts`, `windowRediscovery.spec.ts`, `connectRequest.spec.ts` | `approvalTimeout.spec.ts` con **fake timers + reloj del stub de `chrome.alarms`** (sin esperar 120 s); `approvalReconcile.spec.ts` con entradas ya vencidas y **sin** disparar el alarm |
| 4.18 | E2E del hito | `e2e/04-enviar.spec.ts`, `10-aprobar-tx.spec.ts`, `11-firmar-eip712.spec.ts`, `11-firmar-mensaje.spec.ts`, `18-concurrencia.spec.ts`, prueba de suspensión del SW por CDP | Envío con recibo `status 1`; aprobación con foco/origen/ventana única; 2 solicitudes → **exactamente una** ventana con contador `2`; suspensión del SW en mitad de una aprobación → reconstrucción < 1 s y 0 doble difusión |

#### 3.4.6 Criterios de aceptación
- `CA-RF-08` — 1 ETH entre cuentas de Anvil devuelve hash `0x`+64 hex y el recibo es `status 1`.
- `CA-RF-19` — al aprobar, la dApp recibe el hash y la vista previa mostró selector, nombre de función y parámetros decodificados; fuera de la tabla local, aviso bloqueante.
- `CA-RF-20` — `name` y `verifyingContract` visibles y aviso destacado si `domain.chainId ≠` red activa.
- `CA-RF-21` — texto UTF-8 visible, aviso si es hex ilegible y `eth_sign` → `4200`.
- `CA-RF-35` — **como máximo una** ventana `notification.html` enfocada; con 2 solicitudes simultáneas el contador marca `2` y la ventana nunca muestra dos a la vez.
- `CA-RF-37` — 2 solicitudes coexisten en `Record<approvalId, PendingRequest>` sin sobrescribirse, con el puerto de larga vida y la reconciliación al arrancar.
- `CA-RF-41` — tras aprobar o rechazar la ventana se cierra, la entrada desaparece de la cola persistida y la reconciliación reasocia por `approvalId`.
- `CA-RF-42` / `CA-RF-43` — toda transacción se difunde tipo 2 con `maxFeePerGas`/`maxPriorityFeePerGas` > 0 y la firma incluye el `chainId` activo.
- `CA-RF-11` (parte 2) — con cola no vacía o transacción en vuelo el reset se rechaza con `-32000` sin borrar ninguna clave.
- RNF-08 — tras suspender el SW en mitad de una aprobación, la cola se reconstruye en **< 1 s** sin huérfanas y sin doble difusión.

#### 3.4.7 Pruebas y evidencia
- **Vitest**: `approvalQueue.spec.ts`, `approvalTimeout.spec.ts` (fake timers + `advanceAlarms(ms)`), `approvalReconcile.spec.ts`, `approvalResume.spec.ts`, `windowQueue.spec.ts`, `windowRediscovery.spec.ts`, `connectRequest.spec.ts`, `calldata.spec.ts` (tabla cerrada y fuera de tabla), `typedData.spec.ts` (`domainChainMismatch`), `personalSign.spec.ts`, `eip1559.spec.ts`, `eip155.spec.ts`, `txContract.spec.ts` (hash, transiciones, revert, estimación fallida), `payloadLimit.spec.ts`, `sign.spec.ts`.
- **Playwright**: `04-enviar.spec.ts`, `10-aprobar-tx.spec.ts` (≤ 2 clics, origen y foco, ventana única global), `11-firmar-eip712.spec.ts`, `11-firmar-mensaje.spec.ts`, `18-concurrencia.spec.ts` (2 pendientes + contador + `stopServiceWorker` con `performance.now()`), `sw-suspend`.
- **Forge**: `forge test --root contracts --match-contract EIP712VerifierTest` sobre el fixture y sobre la firma de la wallet.
- **Evidencia**: `RepoTecnico/evidencia/H4/10-aprobar-tx-<fecha>.json`, `H4/18-concurrencia-<fecha>.png`, `H4/sw-suspend-<fecha>.json`, `H4/eip712-<fecha>.log`.

#### 3.4.8 Riesgos específicos
- **Reintroducir `setTimeout`** para el plazo: prohibido; el vencimiento solo con `chrome.alarms` + reconciliación (R17).
- **Dos ventanas de confirmación** (R18): bloqueante si `18-concurrencia.spec.ts` observa 2.
- **Firma ciega** (R5): cualquier calldata fuera de la tabla **sin** aviso bloqueante invalida el hito.
- **Cola sobrescrita** por dos RMW concurrentes: `rmwLock` es obligatorio; el test de 2 solicitudes simultáneas es el oráculo.
- **Fuga del payload íntegro** a `truekeate_logs` (R4): se registran hash + longitud (firmas) y `to`/`value`/`dataLength` + **primeros 10 bytes** de `data` (transacciones).
- **Esperar 120 s reales en la suite**: mitigado con plazos inyectables por `VITE_SIGN_TIMEOUT_MS`/`VITE_CONNECT_TIMEOUT_MS` (solo pruebas) y aserción sobre los valores de producción.

#### 3.4.9 Definición de terminado (H4)
Enviar, firmar EIP-712 y firmar texto funcionan de extremo a extremo con aprobación humana en **una sola** ventana global; la vista previa decodifica el calldata y avisa del riesgo; el vencimiento cierra la ventana y devuelve `4001`; la suspensión del SW no pierde ni duplica solicitudes; `forge test` verifica la firma de la wallet; specs y E2E del hito en verde; evidencia en `RepoTecnico/evidencia/H4/`; corpus y memoria actualizados.

---

### 3.5 H5 — Redes y observabilidad

#### 3.5.1 Objetivo
Cerrar el ciclo funcional: **cambiar de red con aprobación** y **dar de alta redes nuevas sin activarlas** (con permiso de host en runtime), propagar `chainChanged` a **todas** las pestañas, y dejar la **observabilidad completa** (los **24 eventos** del catálogo en `truekeate_logs`, escrito siempre por el Service Worker, con retención 500/200, cuota de 10 MB observable y exportación JSON). `test.html` ejecuta ya los **7 flujos**.

#### 3.5.2 Alcance
**Entra:** `truekeate_networks` completo (alta, validación de `chainId` y símbolo, `isTestnet`), `wallet_switchEthereumChain` aprobable, `wallet_addEthereumChain` con `chrome.permissions.request` **siempre**, denegación de permiso → `4001` sin persistir, `NetworksView`, `chainChanged`, `logging/events.ts` (24 eventos/5 categorías/4 niveles), `logger.ts`, `retention.ts`, cuota de 10 MB con reintento y `storage_quota_exceeded`, `LogsView` con exportación JSON, `wallet_getLogs` con `dropped`, y `test.html` con los 7 flujos + historial.

**NO entra:** badge (RF-38) y notificaciones de Chrome (RF-39), ambos Should y con permiso opcional; el *hint* de Anvil (RF-12), la persistencia de logs a través del reset (RF-32), la i18n fina de 4 decimales (RF-34), el historial de la dApp (RF-47) y «Acerca de» (RF-48) — todos al ciclo posterior (§4); la identidad visual final y la accesibilidad llegan en H6.

#### 3.5.3 Requisitos cubiertos
| Tipo | Requisitos |
|---|---|
| RF Must | **RF-22, RF-23, RF-24, RF-28, RF-29, RF-30, RF-31, RF-46** |
| RNF / RT | RNF-06, RNF-07, RNF-16, RNF-23 (red no testnet), RNF-25; `CA-RT-06`, `CA-RT-09`, riesgo R13 (cuota) |
| CU | CU-19, CU-23, CU-24, CU-25, CU-29, CU-34 |

#### 3.5.4 Módulos implementados
M14/M15 (aprobación de red y de revocación desde la dApp) · M22 `security/redaction.ts` (completa) · M23 `networks/catalog.ts` · M24 `networks/switch.ts` · M25 `networks/addChain.ts` · M27 `events.ts` (`chainChanged`) · M30 `logging/logger.ts` · M31 `logging/events.ts` · M32 `logging/retention.ts` · M33 `state/schema.ts` (cuota y `wallet_getLogs`) · M43 `popup/views/NetworksView.tsx` · M45 `popup/views/LogsView.tsx` · M3 (`wallet_getLogs`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`, `wallet_revokePermissions`) · `test.html` (7 flujos).

#### 3.5.5 Tareas
| # | Tarea | Archivo que crea o modifica | Resultado observable |
|---|---|---|---|
| 5.1 | `wallet_switchEthereumChain` con aprobación | `src/background/networks/switch.ts` (M24), M14 | Si la red destino **ya es la activa**, responde `null` **sin abrir ventana**; si no, crea **1** entrada `pending` y, tras aprobarla, `eth_chainId` devuelve su id y todas las pestañas reciben `chainChanged`; `chainId` no dado de alta → `4901` (`CA-RF-22`, DEC-29/P-19) |
| 5.2 | `wallet_addEthereumChain` con permiso en runtime | `src/background/networks/addChain.ts` (M25) | Valida esquema (`https` preferente; `http` solo en local) y host, exige aprobación y solicita **siempre** `chrome.permissions.request`; al aprobar, la red aparece en la lista **sin pasar a ser la activa**; denegación → `4001` y red **no** persistida (`CA-RF-23`, DEC-36/DEC-39/ADT-25) |
| 5.3 | Aviso de red no testnet | `src/background/networks/addChain.ts` (M25), `src/popup/views/NetworksView.tsx` (M43) | Al dar de alta una red con `isTestnet: false` se muestra la advertencia exigida por RNF-23 |
| 5.4 | Propagación de `chainChanged` | `src/background/events.ts` (M27), M38 | Cambiar de red desde el popup o desde la dApp emite `chainChanged` en **todas** las pestañas conectadas (cierra `CA-RF-24`) |
| 5.5 | Catálogo cerrado de eventos | `src/background/logging/events.ts` (M31) | Enum de **24** eventos (incluido `storage_quota_exceeded`), 5 categorías y 4 niveles, sin valores fuera del catálogo (RNF-16) |
| 5.6 | Escritura del log por el Service Worker | `src/background/logging/logger.ts` (M30) | **Exactamente 1 entrada** por evento del catálogo con `ts`, `level`, `category`, `event`, `origin` y `method`, en `truekeate_logs`; el popup **solo lee**; ninguna entrada contiene claves, mnemonic ni payload íntegro (RNF-09/RNF-16) |
| 5.7 | Retención | `src/background/logging/retention.ts` (M32) | FIFO por `ts` con `logLimit = 500` global y `logMaxPerOrigin = 200` |
| 5.8 | Cuota de 10 MB observable | `src/background/state/schema.ts` (M33), M30 | Si `set` es rechazado por cuota: **1 reintento** tras la retención FIFO, descarte de la entrada con `rpc_error` (`code: -32603`), evento `storage_quota_exceeded` (`category: 'system'`, `level: 'error'`) y contador de descartes visible; **sin** `unlimitedStorage` (DEC-42/R13) |
| 5.9 | `wallet_getLogs` con descarte visible | `src/background/rpc/router.ts` (M3) | Devuelve `{ entries, truncated, dropped }`; el descarte por cuota es visible en el panel |
| 5.10 | Panel de actividad | `src/popup/views/LogsView.tsx` (M45) | Errores en **rojo** con `code` numérico y mensaje en español; transacciones y firmas con su hash/firma; **exportación JSON** del histórico (`CA-RF-30`, `CA-RF-31`) |
| 5.11 | dApp de pruebas con los 7 flujos | `test.html` | Detectar, conectar, saldo, enviar, EIP-712, cambiar red y eventos, cada uno con resultado en pantalla en **< 5000 ms**; errores `4001`, `4900` y `4901` mostrados con su acción sugerida (`CA-RF-46`) |
| 5.12 | Especificaciones del hito | `src/background/networks/*.spec.ts`, `logger.spec.ts`, `logRedaction.spec.ts`, `loggerRetry.spec.ts`, `storageQuota.spec.ts`, `sessions.spec.ts` | `storageQuota.spec.ts` llena el stub hasta el rechazo y afirma (a) 1 reintento, (b) 1 `rpc_error` con `-32603` y (c) contador de descartes |
| 5.13 | E2E del hito | `e2e/12-redes.spec.ts`, `15-logs.spec.ts`, `22-dapp.spec.ts`, `21-eip6963.spec.ts` | Red ya activa sin ventana; alta sin activación y cambio posterior aprobado; permiso en runtime; log con popup cerrado; los 7 flujos de la dApp |

#### 3.5.6 Criterios de aceptación
- `CA-RF-22` — red destino ya activa → respuesta sin ventana; hacia otra red → **1** entrada `pending` y, tras aprobarla, `eth_chainId` con su id y `chainChanged` en todas las pestañas.
- `CA-RF-23` — el alta exige aprobación; al aprobar, la red aparece con su `chainId` declarado **sin ser la activa**; solo un `wallet_switchEthereumChain` posterior y aprobado cambia `eth_chainId`.
- `CA-RF-24` — `accountsChanged` y `chainChanged` se envían a **todas** las pestañas cuando cambian desde el popup o desde la dApp.
- `CA-RF-28` / `CA-RF-29` / `CA-RF-30` / `CA-RF-31` — log de llamadas (método, params redactados, origen, `ts`), de eventos (`category: event` + campo `event`), de errores en rojo con `code` y de operaciones con hash/firma.
- `CA-RF-46` — `test.html` ejecuta los 7 flujos con resultado en pantalla.
- RNF-16 — 1 entrada por evento del catálogo, exportable en JSON y sin claves ni payloads íntegros.
- `CA-RT-06` — `eth_chainId` = `0x7a69` con Anvil y ausencia de Sepolia en `truekeate_networks`.

#### 3.5.7 Pruebas y evidencia
- **Vitest**: `networks.spec.ts` (red ya activa; `add` no cambia la red activa), `logger.spec.ts` (1 entrada por evento del catálogo y eventos), `logRedaction.spec.ts` (0 claves, 0 payload íntegro, primeros 10 bytes de `data`), `loggerRetry.spec.ts`, `storageQuota.spec.ts`, `sessions.spec.ts`.
- **Playwright**: `12-redes.spec.ts` (aprobación del cambio, alta sin activación, permiso en runtime), `15-logs.spec.ts` (método/origen/`ts` con el popup cerrado, rojo en errores, operaciones), `22-dapp.spec.ts` (7 flujos), `21-eip6963.spec.ts`.
- **Comandos**: `anvil --port 8546 --chain-id 31338`, `cast chain-id --rpc-url http://127.0.0.1:8546`; `chrome.storage.local.get('truekeate_logs')` tras la suite.
- **Evidencia**: `RepoTecnico/evidencia/H5/12-redes-<fecha>.json`, `H5/15-logs-<fecha>.png`, `H5/22-dapp-<fecha>.json`, `H5/storageQuota-<fecha>.json`, `H5/logs-export-<fecha>.json`.

#### 3.5.8 Riesgos específicos
- **Conceder el permiso de host sin pedirlo** (o pedirlo solo desde la dApp): DEC-36 exige pedirlo **siempre**, también desde el popup; la denegación no persiste la red.
- **Activar la red al darla de alta**: prohibido por P-22/DEC-39; el test lo comprueba explícitamente.
- **Cuota agotada que rompe la extensión** (R13): el modo de fallo debe ser **observable** (1 reintento + `-32603` + aviso), nunca un fallo silencioso.
- **Log que guarda el payload íntegro** (R4): los primeros 10 bytes de `data` son el máximo; `logRedaction.spec.ts` es bloqueante.
- **Segunda red ausente**: los flujos de cambio/alta requieren el Anvil secundario en `8546`/`31338`; si no está, el E2E se marca **no verificado**.

#### 3.5.9 Definición de terminado (H5)
Cambiar de red y dar de alta una red funcionan con aprobación y permiso en runtime, `chainChanged` llega a todas las pestañas, el panel de actividad muestra los 24 eventos con exportación JSON y la cuota se comporta de forma observable; `test.html` completa los 7 flujos; specs y E2E en verde; evidencia en `RepoTecnico/evidencia/H5/`; corpus y memoria actualizados.

---

### 3.6 H6 — Identidad visual, accesibilidad y entrega

#### 3.6.1 Objetivo
Dejar el producto **entregable y evaluable por un tercero**: identidad visual aplicada en las **tres ventanas y la dApp** desde tokens (0 literales), accesibilidad AA verificada con recorrido por teclado y `axe-core`, **build limpio en Windows y WSL2/CI**, cobertura de ramas dentro de umbral, los artefactos documentales de la rúbrica, el **ensayo de instalación del Perfil B** y el cierre formal de la Fase 3.

#### 3.6.2 Alcance
**Entra:** aplicación de `tokens.css` en `popup`, `connect`, `notification` y `test.html`; contraste, foco, ARIA, zoom 200 %, `prefers-reduced-motion`; `README.md`, `INSTRUCCIONES.md`, `LICENSE`, `NOTICE`, `public/fonts/LICENSE-*.txt`; JSDoc por módulo con su `M-xx`; build limpio en ambos entornos; `npm run test -- --coverage`; `npm run check:mermaid`; ensayo de instalación y acta de cierre de Fase 3.

**NO entra:** el ZIP `apellido_nombre_wallet.zip` y el `video_demo.mp4` opcional, que son entregables de la **Fase 5 — Manuales** (`requerimientos.md` §4.2); H6 los deja listos (contenido y estructura) sin empaquetarlos. Tampoco entran los 10 RF Should (ciclo posterior, §4).

#### 3.6.3 Requisitos cubiertos
| Tipo | Requisitos |
|---|---|
| RF Must | **RF-49** + cierre de **RF-11** |
| RNF / RT | RNF-01, RNF-15, RNF-17, RNF-18, RNF-19, RNF-20, RNF-21, RNF-23, RNF-24; `CA-RT-01`, `CA-RT-05`, `CA-RT-08`, `CA-RT-09`, `CA-RT-10`, `CA-RT-12`; RE-01, RE-02, RE-03, RE-04 |
| CU | CU-33, CU-34, CU-35, CU-36 |

#### 3.6.4 Módulos implementados
M39..M46 (acabado visual y accesible) · M48, M50 (encabezado y estados) · M62 `shared/format.ts` (formato de ETH y direcciones abreviadas) · M64 `styles/tokens.css` · M65 `styles/base.css` · `test.html` (identidad) · `README.md`, `INSTRUCCIONES.md`, `LICENSE`, `NOTICE`, `public/fonts/LICENSE-*.txt` · `src/**/**.ts` (JSDoc de contrato con `M-xx`).

#### 3.6.5 Tareas
| # | Tarea | Archivo que crea o modifica | Resultado observable |
|---|---|---|---|
| 6.1 | Identidad visual en las tres ventanas y la dApp | M39..M46, M48, M50, M64, M65, `test.html` | Encabezado de marca de 72 px, isologo, degradados, tipografías y estados de color de `identidad_visual.md`; `grep -rnE "#[0-9a-fA-F]{3,8}\|rgb\(\|hsl\(\|linear-gradient\|radial-gradient\|font-family:" src --exclude=tokens.css` → **0** coincidencias (`CA-RF-49`, RNF-18) |
| 6.2 | Contraste verificado por cálculo | `src/styles/tokens.css`, `contrast.spec.ts`, `goldUsage.spec.ts` | `contrast.spec.ts` recalcula la matriz cerrada de §2.4 de `requerimientos.md` desde `tokens.css` y **0** pares quedan por debajo del umbral; `goldUsage.spec.ts` falla si un nodo con `--tk-gold-500` contiene texto (oro **solo decorativo**) (`CA-RF-49`, RNF-19) |
| 6.3 | Accesibilidad de las acciones críticas | M39..M46, M48, M49, M50, `e2e/24-accesibilidad.spec.ts` | Cargar cartera, importar clave, seleccionar cuenta, aprobar, rechazar y reset son ejecutables **solo con teclado**; foco visible ≥ 3:1; roles y etiquetas ARIA en cuentas, pestañas de red y panel de logs; sin pérdida de contenido al **200 %** de zoom; `prefers-reduced-motion` desactiva spinner y transiciones; `axe-core` **0 violaciones** A/AA (RNF-21, CU-35) |
| 6.4 | Formato y textos | `src/shared/format.ts` (M62), M39..M46 | ETH a 4 decimales, direcciones `0x1234…abcd`, textos visibles en español; `grep -rniE "(send|cancel|copy|confirm|settings)" src/popup src/connect src/notification` → **0** coincidencias (`CA-RT-10`) |
| 6.5 | Documentación de la rúbrica | `README.md`, `INSTRUCCIONES.md`, `LICENSE`, `NOTICE`, `public/fonts/LICENSE-poppins.txt`, `LICENSE-inter.txt`, `LICENSE-jetbrains-mono.txt` | README con puesta en marcha en 4 pasos que basta para `npm ci && npm run build` y cargar `dist/` **sin leer otro documento**; INSTRUCCIONES con cada flujo y pantalla; `git ls-files` contiene `LICENSE`, `NOTICE` y los 3 `LICENSE-*.txt` OFL-1.1 (RNF-23, `CA-RT-12`) |
| 6.6 | JSDoc de contrato por módulo | Todo `src/**/**.ts` | `docs.spec.ts` comprueba mecánicamente que cada fichero abre con un bloque JSDoc con su identificador **M-xx** y una referencia RF/RNF/RT (criterio de la rúbrica de Documentación) |
| 6.7 | Build limpio en ambas plataformas | `package.json`, `package-lock.json`, `vite.config.ts` | `npm ci && npm run build` con **exit 0**, 0 errores de tipos y solo los warnings permitidos en Windows **y** en `wsl -d Ubuntu -- bash -lc "npm ci && npm run build && npm test"` (RNF-15/D-C, RNF-24); sin el medio Linux se marca «verificado solo en Windows; pendiente en Linux» |
| 6.8 | Cobertura y puertas de calidad | `vitest.config.ts` | `npm run test -- --coverage` con ≥ **70 %** de ramas global y ≥ **80 %** en `crypto/`, `approvals/` y `shared/validation/` (RNF-17); `npm run check:mermaid` exit 0 |
| 6.9 | Verificación de cierre de la suite | `npm run test`, `npm run test:e2e`, `forge test`, `npm run lint:prohibited` | Los cuatro comandos con exit 0; `grep -rn "http" dist/` → 0 URLs de CDN; 0 literales de color fuera de tokens |
| 6.10 | Ensayo de instalación del Perfil B | `RepoTecnico/evidencia/H6/instalacion-<fecha>.md` | Un evaluador sin conocimiento previo instala y arranca en **≤ 15 min** siguiendo solo `README.md` e `INSTRUCCIONES.md`, con **0 consultas al autor** y **0 errores** en la consola y el badge de `chrome://extensions` |
| 6.11 | Acta de cierre de la Fase 3 | `RepoTecnico/estado_proyecto.md`, `RepoTecnico/evidencia/H6/*` | Conteos finales (40/40 Must con evidencia, 25/25 RNF, 13/13 RT, 4/4 RE), historial de los 6 hitos y checklist de §8 completada |

#### 3.6.6 Criterios de aceptación
- `CA-RF-49` — popup, `connect`, `notification` y dApp usan el degradado de marca y **0** colores literales fuera de `tokens.css`.
- RNF-19 / RNF-21 — 0 pares de contraste por debajo del umbral; recorrido completo por teclado; `axe-core` con 0 violaciones A/AA; sin pérdida al 200 % de zoom.
- RNF-15 / RNF-24 — «build limpio» reproducible en Windows y Linux con `package-lock.json` versionado y rango de Foundry verificado.
- RNF-23 — avisos in-product en primer arranque, «Acerca de» y antes de la primera firma, con licencias y `NOTICE` presentes.
- RNF-01 — 0 RF sin `CA-RF-xx` y 0 fila sin evidencia (matriz de §6 y §9.4 de `requerimientos.md`).
- CU-36 — el evaluador completa la instalación en ≤ 15 min y `dist/` carga con 0 errores.

#### 3.6.7 Pruebas y evidencia
- **Vitest**: `contrast.spec.ts`, `goldUsage.spec.ts`, `docs.spec.ts`, `manifest.spec.ts` (revalidación), `naming.spec.ts` (ID estable entre ejecuciones).
- **Playwright**: `23-marca.spec.ts` (degradado de marca en las 4 superficies), `24-accesibilidad.spec.ts` (teclado + `axe-core`), `25-recuperacion.spec.ts` (cierre), `26-avisos.spec.ts`, `17-i18n.spec.ts` (formato `1,0000 ETH` y `0x1234…abcd`), `01-onboarding.spec.ts` (carga de `dist/` con 0 errores).
- **Comandos**: `npm ci && npm run build` en Windows y en WSL2/CI; `npm run test -- --coverage`; `npm run check:mermaid`; `forge test --root contracts --match-contract EIP712VerifierTest`; `git ls-files`.
- **Evidencia**: `RepoTecnico/evidencia/H6/build-windows-<fecha>.log`, `H6/build-wsl2-<fecha>.log`, `H6/24-accesibilidad-<fecha>.json`, `H6/23-marca-<fecha>.png`, `H6/instalacion-<fecha>.md`.

#### 3.6.8 Riesgos específicos
- **Identidad aplicada solo al popup** (RF-49 incompleto): el criterio cubre las **cuatro** superficies.
- **Accesibilidad tratada como acabado estético**: es requisito (RNF-21) con `axe-core` bloqueante.
- **Documentación escrita al final y a medias**: `INSTRUCCIONES.md` debe cubrir cada flujo y pantalla; el ensayo de instalación del Perfil B es la prueba.
- **Linux sin verificar**: si WSL2 no está disponible, RNF-15 se marca **parcialmente verificado** (nunca «cumplido»).
- **Bundle que crece por encima del presupuesto** (R19): medición de `dist/` en cada build y 0 URLs remotas.

#### 3.6.9 Definición de terminado (H6)
Identidad aplicada en las cuatro superficies con 0 literales; accesibilidad AA con 0 violaciones; build limpio en Windows y WSL2; cobertura dentro de umbral; artefactos documentales versionados; ensayo del Perfil B en ≤ 15 min con 0 consultas; **checklist de cierre de Fase 3 (§8) completa**; corpus y memoria actualizados con los conteos finales.

---

## 4. Ciclo posterior (los 10 RF Should)

Los 10 RF Should (`requerimientos.md` §4.5, `casos_uso/casos_uso.md` §6) **no forman parte del compromiso de entrega** y son el primer recorte si se agota el presupuesto (R9/DEC-26). Se ejecutan en unidades **C1..C10** después del MVP, en este orden, que respeta las dependencias reales (lo que necesita cola, red o UI ya existente va después de su hito):

| # | RF | Objetivo | Depende de | Horas / sesiones |
|---|---|---|---|---|
| C1 | **RF-12** | Hint interactivo con la frase de Anvil que rellena el formulario | H2 (`Mnemonic`, `constants`) | 2 h / 1 sesión |
| C2 | **RF-34** | UI en español con ETH a 4 decimales y direcciones `0x1234…abcd` en todas las vistas | H2, H3 (M62/M47/M39) | 4 h / 1 sesión |
| C3 | **RF-48** | Pantalla «Acerca de» con logotipo horizontal y la tagline `PRODUCTOS \| SERVICIOS \| CRIPTOACTIVOS TOKENIZADOS` | H6 (tokens y activos) | 4 h / 1 sesión |
| C4 | **RF-47** | Historial de operaciones y JSON de la última respuesta sin recortar en `test.html` | H5 (7 flujos) | 4 h / 1 sesión |
| C5 | **RF-44** | EIP-6963 completo con re-anuncio sincrónico y en `DOMContentLoaded` en todos los frames | H3 (M35/M36) | 4 h / 1 sesión |
| C6 | **RF-32** | `truekeate_logs` exenta de `resetWallet`, con `logLimit = 500` verificado tras el reset | H5 (M30/M32/M33) | 4 h / 1 sesión |
| C7 | **RF-06** | Eliminar cuenta importada con clave borrada de `truekeate_imported_accounts` y **bloqueo `-32000`** con sesión de dApp vigente | H2 (M28) + H3 (`truekeate_connected_sites`) | 6 h / 1,5 sesiones |
| C8 | **RF-38** | Badge contador (`chrome.action.setBadgeText`) calculado como índice derivado con conteo **global** | H4 (cola y purgas) | 4 h / 1 sesión |
| C9 | **RF-39** | Notificaciones de Chrome con `notifications` solicitado en **runtime** desde `optional_permissions`; descartar la notificación **no** resuelve la solicitud | H4, H5 | 6 h / 1,5 sesiones |
| C10 | **RF-40** | Validación de `CA-RF-40`: 120 s/60 s, cierre de ventana, `expired`, purga del badge y `4001` (el **mecanismo** ya se construyó en H4) | H4 | 2 h / 0,5 sesión |
| | | | **Total ciclo posterior** | **40 h / 10 sesiones** |

**Reglas del ciclo posterior:** (a) ninguno de estos RF puede **rebajar** un invariante del MVP (p. ej. RF-38 no puede sustituir el contador de pendientes de la ventana global); (b) RF-39 exige `manifest.spec.ts` actualizado para seguir probando que `notifications` **no** está en `permissions`; (c) cada unidad C<n> cierra con la puerta de comandos completa y su evidencia en `RepoTecnico/evidencia/C<n>/`; (d) si el presupuesto se agota, el orden de recorte es **C3 → C4 → C5** (los menos estructurales).

---

## 5. Calendario y esfuerzo

La estimación se expresa **por hito**, en horas de trabajo efectivo y en **sesiones de 4 h**, y **sustituye cualquier estimación genérica anterior** (el «~40 h» retirado por H-34/DEC-26 y la secuencia de referencia de `documento_tecnico.md` §9). Incluye el tiempo de escribir los tests y la evidencia de cada hito, que **no** es trabajo diferido.

| Hito | Alcance | Horas | Sesiones (4 h) | Acumulado |
|---|---|---|---|---|
| H1 ✅ **(cerrado 2026-09-11)** | Andamiaje, build MV3, arnés, instrumento Forge | 16 | 4 | 16 h |
| H2 | Cartera, cuentas, recepción, recuperación, reset | 24 | 6 | 40 h |
| H3 | Provider, conexión, lectura, eventos, sesiones | 20 | 5 | 60 h |
| H4 | Firma, cola persistida, ventana global, transacciones | 28 | 7 | 88 h |
| H5 | Redes, observabilidad, dApp con 7 flujos | 20 | 5 | 108 h |
| H6 | Identidad, accesibilidad, documentación, entrega | 20 | 5 | **128 h** |
| | **Total MVP (40 RF Must)** | **128** | **32** | |
| C1..C10 | Ciclo posterior (10 RF Should) | 40 | 10 | 168 h |
| | **Total con ciclo posterior** | **168** | **42** | |

**Reparto por naturaleza del trabajo (MVP):** ~45 % implementación de módulos, ~30 % pruebas (Vitest + Playwright + Forge) y evidencia, ~15 % documentación y memoria, ~10 % integración y depuración con Anvil/Chromium. El **28 % del esfuerzo total en H4** es deliberado: es el hito con más superficie de fallo (ciclo de vida del SW, concurrencia, plazos, firma) y donde se concentran R1, R16, R17 y R18.

**Lectura del calendario:** a **3 sesiones por semana**, el MVP son **~11 semanas** y el ciclo posterior añade **~3,5 semanas**. La estimación **no** incluye la Fase 5 (Manuales, ZIP y vídeo, `requerimientos.md` §4.2). Los hitos H1 y H3 son los más apropiados para paralelizar con el arranque de la documentación de la rúbrica (6.5), porque no dependen de la UI final.

**Regla de desviación:** si un hito consume más de **1,3 ×** su estimación (R9), se **activa el recorte del ciclo posterior** (empezando por C3/C4/C5) y se registra la decisión en `estado_proyecto.md` **antes** de continuar; **nunca** se recorta un RF Must ni la evidencia de un criterio de aceptación.

---

## 6. Matriz de trazabilidad hito → RF → CU → módulo → prueba

Los **40 RF Must** quedan asignados a un hito **sin huérfanos**. La columna «Módulo(s) principal(es)» coincide con la §6.2 de `documento_tecnico.md` (los que **implementan**, no los que consumen); la columna «CU» y «CA» coinciden con la matriz de `casos_uso/casos_uso.md` §5.1 y con el Anexo A de `requerimientos.md` §9.

| Hito | RF (Must) | CU | Módulo(s) principal(es) | `CA` | Prueba / evidencia |
|---|---|---|---|---|---|
| H2 | RF-01 | CU-01 | M8, M39, M40 | `CA-RF-01` | `Vitest: mnemonic.spec.ts` |
| H2 | RF-02 | CU-02 | M8, M59, M39 | `CA-RF-02` | `Vitest: mnemonic.spec.ts — normaliza y valida checksum` |
| H2 | RF-03 | CU-01, CU-02 | M2, M8, M39 | `CA-RF-03` | `E2E: 01-onboarding.spec.ts — sin prompt de contraseña` |
| H2 | RF-04 | CU-04 | M9, M28, M29 | `CA-RF-04` | `Vitest: derivation.spec.ts` · `E2E: 02-cuentas.spec.ts` |
| H2 | RF-05 | CU-03, CU-05 | M10, M28, M61, M40 | `CA-RF-05` | `Vitest: importPrivateKey.spec.ts` · `Vitest: accounts.spec.ts — guarda -32000` |
| H2 | RF-07 | CU-09 | M41, M63, M62 | `CA-RF-07` | `E2E: 03-recibir.spec.ts — copiar y QR` |
| H2 | RF-09 | CU-08 | M2, M13, M33, M39 | `CA-RF-09` | `E2E: 05-persistencia.spec.ts` |
| H2 | RF-10 | CU-04, CU-05, CU-08, CU-18, CU-24, CU-26 | M26, M28, M13, M16, M33 | `CA-RF-10` | `Vitest: state.spec.ts` · `E2E: 05-persistencia.spec.ts` |
| H2 | RF-11 (parte 1) | CU-30 | M33, M34, M46 | `CA-RF-11` | `Vitest: reset.spec.ts — orden de comprobación` · `E2E: 06-reset.spec.ts` |
| H2 | RF-33 | CU-02, CU-03, CU-11, CU-32 | M58, M59, M60, M61, M62, M39 | `CA-RF-33` | `Vitest: validation.spec.ts` · `E2E: 16-validacion.spec.ts` |
| H2 | RF-50 | CU-07 | M12, M46, M3, M22, M57 | `CA-RF-50` | `Vitest: secretsExport.spec.ts` · `E2E: 25-recuperacion.spec.ts` |
| H3 | RF-13 | CU-22 | M37, M35, M38, M1 | `CA-RF-13` | `Vitest: inject.spec.ts — alias window.codecrypto` · `E2E: 07-provider.spec.ts` |
| H3 | RF-14 | CU-14, CU-20, CU-21, CU-28 | M3, M4, M6, M20 | `CA-RF-14` | `Vitest: errors.spec.ts` |
| H3 | RF-15 | CU-26 | M27, M35, M56, M38 | `CA-RF-15` | `E2E: 08-eventos.spec.ts` |
| H3 | RF-16 | CU-17 | M3, M26, M48, M18 | `CA-RF-16` | `E2E: 09-conectar.spec.ts` |
| H3 | RF-17 | CU-08, CU-17, CU-18, CU-20 | M26, M3, M38 | `CA-RF-17` | `Vitest: accounts.spec.ts — RNF-11` · `E2E: 09-conectar.spec.ts` |
| H3 | RF-18 | CU-10, CU-31 | M5, M3, M47 | `CA-RF-18` | `E2E: 07-provider.spec.ts` · `Comando: cast balance` |
| H3 | RF-25 | CU-18 | M26, M29, M57 | `CA-RF-25` | `Vitest: sessions.spec.ts — renovación de expiresAt` · `E2E: 05-persistencia.spec.ts` |
| H3 | RF-26 | CU-19 | M44, M26, M14 | `CA-RF-26` | `E2E: 13-revocar.spec.ts` |
| H3 | RF-27 | CU-10, CU-26, CU-31 | M47, M5, M48 | `CA-RF-27` | `Vitest: polling.spec.ts — contador RPC` · `E2E: 14-polling.spec.ts` |
| H3 | RF-36 | CU-17 | M48, M49, M18 | `CA-RF-36` | `E2E: 09-conectar.spec.ts` |
| H3 | RF-45 | CU-22 | M35, M3, M4, M6, M56 | `CA-RF-45` | `Vitest: eip1193.spec.ts` |
| H4 | RF-08 | CU-11, CU-12 | M7, M42, M50 | `CA-RF-08` | `E2E: 04-enviar.spec.ts` · `Vitest: tx.spec.ts` |
| H4 | RF-19 | CU-11, CU-12, CU-13 | M7, M11, M19, M51, M42 | `CA-RF-19` | `Vitest: calldata.spec.ts` · `E2E: 10-aprobar-tx.spec.ts` |
| H4 | RF-20 | CU-27 | M11, M19, M53 | `CA-RF-20` | `Vitest: typedData.spec.ts` · `E2E: 11-firmar-eip712.spec.ts` · `Forge` |
| H4 | RF-21 | CU-28 | M11, M19, M54 | `CA-RF-21` | `Vitest: personalSign.spec.ts` · `E2E: 11-firmar-mensaje.spec.ts` |
| H4 | RF-35 | CU-13, CU-14 | M50, M18, M19 | `CA-RF-35` | `E2E: 10-aprobar-tx.spec.ts — foco, origen y ventana única` · `E2E: 18-concurrencia.spec.ts` |
| H4 | RF-37 | CU-16 | M14, M17, M16, M15, M2 | `CA-RF-37` | `Vitest: approvalQueue.spec.ts` · `E2E: 18-concurrencia.spec.ts` |
| H4 | RF-41 | CU-13, CU-14 | M18, M16, M14, M17 | `CA-RF-41` | `Vitest: approvalReconcile.spec.ts` · `E2E: 10-aprobar-tx.spec.ts` |
| H4 | RF-42 | CU-11, CU-12 | M11, M5, M7 | `CA-RF-42` | `Vitest: eip1559.spec.ts` · E2E con recibo `type: 2` |
| H4 | RF-43 | CU-11, CU-12 | M11, M5, M23 | `CA-RF-43` | `Vitest: eip155.spec.ts` |
| H4 | **RF-11 (parte 2 — guarda)** | CU-30 (E1) | M33 (`truekeate_pending_requests`, `truekeate_inflight_tx`), M46 | `CA-RF-11` | `Vitest: reset.spec.ts — bloqueo -32000` · `E2E: 06-reset.spec.ts — reset bloqueado` |
| H5 | RF-22 | CU-24, CU-25 | M24, M14, M43, M50 | `CA-RF-22` | `Vitest: networks.spec.ts — red ya activa` · `E2E: 12-redes.spec.ts` |
| H5 | RF-23 | CU-21, CU-25 | M25, M1, M43 | `CA-RF-23` | `Vitest: networks.spec.ts — add no cambia la red activa` · `E2E: 12-redes.spec.ts` |
| H5 | RF-24 | CU-19, CU-24, CU-26 | M27, M24, M38, M31 | `CA-RF-24` | `E2E: 08-eventos.spec.ts — 2 pestañas` (parte `accountsChanged` en H3) |
| H5 | RF-28 | CU-29 | M30, M22, M3 | `CA-RF-28` | `E2E: 15-logs.spec.ts` · `Vitest: logger.spec.ts` |
| H5 | RF-29 | CU-29 | M30, M31, M27 | `CA-RF-29` | `Vitest: logger.spec.ts — eventos` |
| H5 | RF-30 | CU-29, CU-34 | M30, M6, M45, M62, M64 | `CA-RF-30` | `E2E: 15-logs.spec.ts — rojo` |
| H5 | RF-31 | CU-29 | M30, M7, M22 | `CA-RF-31` | `E2E: 15-logs.spec.ts — operaciones` |
| H5 | RF-46 | CU-23 | `test.html`, M37, M38, M48 | `CA-RF-46` | `E2E: 22-dapp.spec.ts` |
| H6 | RF-49 | CU-01, CU-09, CU-33, CU-34 | M64, M65, M39, M48, M50 | `CA-RF-49` | `E2E: 23-marca.spec.ts` · `Comando: grep` de literales de color |
| **H1 — ✅ COMPLETADO (2026-09-11)** | **H1: 0 RF Must (habilitador)** | CU-22, CU-36 (parcial) | M1, M2, M20, M21, M33, M35..M38, M55..M57, M64, M65, `contracts/`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `test/`, `e2e/`, `test.html` | `CA-RT-01`..`CA-RT-13` | `Comando: npm ci && npm run build` **exit 0** (6 entradas + `manifest.json`) · `Vitest: 47 passed / 4 ficheros` · `E2E: 01-onboarding.spec.ts — 4 passed` · `Forge: 7 passed` · `check:mermaid 27/27` — ID de extensión **`oiahebaliobknoeeonhgaacapjcpgblo`** (§3.1.9, `ACTA_H1.md`) |

**Resultado: 40 / 40 RF Must asignados a un hito · RF Must huérfanos: 0.** Reparto: H2 = 11 · H3 = 11 · H4 = 9 (+ guarda de RF-11) · H5 = 8 · H6 = 1 · H1 = 0 (habilitador por diseño). **Ningún RF debe quedar sin encaje:** los 40 encajan en H2..H6 sin excepciones; los 10 RF Should quedan asignados a C1..C10 (§4) y **no** cuentan para el compromiso del MVP.

> **Estado de la matriz (2026-09-11).** La fila de **H1** pasa a **✅ COMPLETADO**: las 6 entradas y `dist/manifest.json` se generan con un solo `npm run build`, la extensión carga desde `dist/` con **ID estable `oiahebaliobknoeeonhgaacapjcpgblo`** y la puerta de comandos (`tsc -b`, Vitest **47**, Playwright **4**, Forge **7** con `--root contracts`, `check:mermaid` **27/27**) está en verde (§3.1.9). El hito en curso es **H2** y las 5 desviaciones aceptadas de H1 quedan registradas en **§3.1.10** (**DEC-47..DEC-51**).

**Cobertura de los transversales por hito (25/25 RNF · 13/13 RT · 4/4 RE):** H1 → RT-01..RT-09, RT-11 (instrumento), RT-13, RE-01, RE-04; RNF-04, RNF-13, RNF-14, RNF-20 · H2 → RNF-06, RNF-09 (higiene del revelado), RNF-18 (parcial), RNF-21 (parcial), RNF-22, RNF-23 (primer arranque); RT-02, RT-10, RT-12 (parcial) · H3 → RNF-07, RNF-08 (reconciliación vacía), RNF-10, RNF-11, RNF-12, RNF-16 (parcial), RNF-25 (parcial); RT-04, RT-06 · H4 → RNF-05, RNF-08, RNF-09 (redacción del payload), RNF-12, RNF-25; RT-07, RT-11 (correspondencia) · H5 → RNF-06, RNF-07, RNF-16, RNF-23 (red no testnet), RNF-25; RT-06, RT-09 · H6 → RNF-01, RNF-15, RNF-17, RNF-18, RNF-19, RNF-20, RNF-21, RNF-23, RNF-24; RT-01, RT-05, RT-08, RT-09, RT-10, RT-12, RT-13; RE-02, RE-03 (inspección del historial de comandos, sin CU).

---

## 7. Gestión del cambio

**Qué es una brecha.** Se considera **brecha de especificación** cualquiera de estos hechos, detectado al implementar un hito: (a) un `CA-RF-xx`/`CA-RT-xx` **no es verificable** con el diseño del documento técnico; (b) dos criterios o dos documentos del corpus **se contradicen**; (c) un requisito **no tiene módulo** o un módulo **no tiene requisito**; (d) una decisión **falta** para poder escribir el código (p. ej. un literal, un valor, una política); (e) el código **no puede** cumplir el criterio sin cambiar el alcance.

**Qué NO es una brecha:** una dificultad de implementación, un fallo de una dependencia externa (Anvil, Chromium) o un test intermitente. Esos se tratan como **incidencia del hito** (`§1.4`), no como cambio de especificación.

**Procedimiento obligatorio (en el mismo turno, sin excepciones):**

1. **Detener** la tarea afectada; **no** se escribe código que contradiga el corpus para «seguir avanzando» (regla de no regresión).
2. **Registrar la brecha** como fila nueva en `RepoTecnico/estado_proyecto.md` (con identificador de decisión **DEC-47** en adelante, el hito, el requisito afectado y la evidencia que la motivó).
3. **Actualizar el corpus en el mismo turno**, en este orden y con subida de versión de cada documento tocado:
   - `requerimientos.md`: el RF/RNF/RT y su `CA-xx` (si cambia el criterio, es **decisión de producto**, no técnica), más los conteos de §1/§4.5.
   - `casos_uso/casos_uso.md`: la ficha del CU y **la regeneración de §2, §5 y §7** (equivalencia bidireccional ficha ↔ matriz, ACU-01).
   - `documento_tecnico.md`: módulos, contratos de §2.5, ADR, §7.4/§7.5 y §10.4 (historial).
   - `diccionario_datos.md`: claves `truekeate_*`, protocolo `TRUEKEATE_*`, literales de §4.3 y guardas.
   - `entornos_globales.md`: entorno, comandos, nomenclatura o permisos afectados.
4. **Reejecutar** la puerta de comandos del hito (`npm run test`, `npm run test:e2e`, `forge test`, `npm run check:mermaid`) y **regenerar la evidencia** afectada.
5. **Añadir la fila al historial de cambios** de cada documento tocado y al de este plan (§9).

**Quién aprueba:**

| Tipo de cambio | Aprueba | Consecuencia si no se aprueba |
|---|---|---|
| Cambio de un `CA-RF-xx`/`CA-RT-xx`, alta o baja de un RF, cambio del alcance Must/Should | **Autor del proyecto** (`requerimientos.md` §4.4) con registro `DEC-xx` | El hito no se cierra; el requisito conserva su criterio y el código se ajusta |
| Cualquier cambio que afecte a RNF-09, RNF-10, RNF-12, RNF-22 o RNF-23 (material criptográfico, guardas, avisos) | **Responsable de seguridad = autor del proyecto** (§4.4), con registro explícito | Bloqueante: no se implementa ninguna relajación |
| Cambio de la nomenclatura congelada (`window.truekeate`, alias, prefijo `truekeate_`, `rdns`, UUID, `key` del manifest, tipos `TRUEKEATE_*`) | Autor del proyecto (ADR-19/RT-13) | Bloqueante: rompe RE-04 y la reproducibilidad de los E2E |
| Cambio de identidad visual, activos de marca o licencias | **Titular de los activos** (DEC-15) | No se redistribuye el activo |
| Publicación en remotos (`/push`) | **Orden explícita del usuario** (RE-03) | No se ejecuta ningún `push` |
| Reajuste de estimación o activación del recorte del ciclo posterior | Autor del proyecto, registrado en `estado_proyecto.md` | Se aplica solo sobre RF **Should** |

**Brechas ya previstas al redactar este plan** (se registran para que su tratamiento sea inmediato, no improvisado):

| ID | Brecha detectada | Tratamiento propuesto |
|---|---|---|
| **G-01** | La convención de evidencia de `documento_tecnico.md` §7.4.1.f nombra las fases como `H1..H5`, pero el plan tiene **6 hitos** (`H1..H6`) | Actualizar §7.4.1.f a `H1..H6` y `estado_proyecto.md` (versión de `documento_tecnico.md` → v1.4) en el primer turno de H1 |
| **G-02** | Los plazos inyectables `VITE_SIGN_TIMEOUT_MS`/`VITE_CONNECT_TIMEOUT_MS`/`VITE_REVEAL_HIDE_MS` solo están especificados en §7.4.1.d | Formalizarlos en `src/shared/constants.ts` (M57) con aserción de los valores de producción por defecto y registrarlo en `entornos_globales.md` |
| **G-03** | `RF-11` tiene dos mitades con hitos distintos (limpieza en H2, guarda por cola en H4) | Declararlo así en `estado_proyecto.md` y en la memoria; **no** se cambia el RF ni su `CA-RF-11` |
| **G-04** | El ZIP de entrega y el vídeo figuran como entregables de Fase 5 (`requerimientos.md` §4.2) y no de H6 | Dejarlo explícito en el acta de cierre de H6 (contenido listo, empaquetado en Fase 5); sin cambio de requisitos |

---

## 8. Definition of Done global y criterios de cierre de la Fase 3

**Definition of Done global (aplica a cada hito, §1.2):** código con JSDoc `M-xx` + `tsc -b` limpio · pruebas del hito en verde y cobertura dentro de umbral · evidencia canónica archivada · memoria actualizada · puerta de comandos exit 0.

**Criterios de cierre de la Fase 3** (todos verificables; ninguno es declarativo):

1. **Alcance del MVP entregado:** los **40 RF Must** implementados y con evidencia; **0 RF Must sin `CA-RF-xx`** y **0 fila sin evidencia** (RNF-01); 0 huérfanos en la matriz de §6.
2. **Puerta de pruebas completa:** `npm run test`, `npm run test:e2e`, `forge test --root contracts --match-contract EIP712VerifierTest` y `npm run check:mermaid` con **exit 0** (RT-07).
3. **Cobertura:** ramas ≥ **70 %** global y ≥ **80 %** en `src/background/crypto/`, `src/background/approvals/` y `src/shared/validation/` (RNF-17), con el informe `--coverage` archivado.
4. **Build limpio:** `npm ci && npm run build` exit 0, 0 errores de tipos y solo los warnings permitidos, **en Windows y en WSL2/CI**; si Linux no está disponible, RNF-15 se marca **parcialmente verificado** (nunca cumplido).
5. **Artefacto cargable:** `dist/` carga en `chrome://extensions` con **0 errores en consola y 0 en el badge**, con **ID de extensión estable** (RT-13) y `dist/manifest.json` con los permisos mínimos (`notifications` solo en `optional_permissions`).
6. **Recorrido funcional demostrable** con Anvil en marcha y `test.html`: los 7 flujos (detectar, conectar, saldo, enviar, EIP-712, cambiar red, eventos) con resultado en pantalla en **< 5000 ms**.
7. **Invariantes MV3 verificados:** cola persistida con `chrome.alarms` y reconciliación **< 1 s**; **una sola** ventana de confirmación global con contador; puerto de larga vida como canal (nunca *keep-alive*); suspensión del SW sin huérfanas ni doble difusión (R1/R16/R17/R18).
8. **Seguridad y recuperación:** 0 mensajes con mnemonic o clave hacia la página; 0 payloads íntegros en `truekeate_logs`; higiene del revelado (30 s, blur, portapapeles); guardas `-32000` de R-09a/R-09b operativas (RNF-09, RNF-22).
9. **Observabilidad:** catálogo cerrado de **24 eventos** con exactamente 1 entrada por evento, retención 500/200, exportación JSON y rechazo por cuota observable (RNF-16, R13).
10. **Accesibilidad e identidad:** `axe-core` 0 violaciones A/AA, recorrido completo por teclado, contraste conforme a la matriz cerrada, 0 literales de color fuera de `tokens.css` y 0 textos de UI en inglés (RNF-18/19/21, `CA-RF-49`).
11. **Documentación de la rúbrica:** `README.md`, `INSTRUCCIONES.md`, `LICENSE`, `NOTICE` y los 3 `LICENSE-*.txt` versionados; JSDoc de contrato por módulo; **ensayo del Perfil B** en ≤ 15 min con 0 consultas (CU-36).
12. **Proceso:** 0 `push` sin la orden `/push` (RE-03, inspección del historial de comandos); corpus y memoria sincronizados (0 identificadores inexistentes, 0 contradicciones); **0 regresión** de los invariantes de H-01..H-42, ACU-01..ACU-30 y ADT-01..ADT-33.
13. **Recorte declarado:** los **10 RF Should** (C1..C10) quedan **explícitamente** fuera del cierre del MVP (`requerimientos.md` §4.5) y su estado se registra en `estado_proyecto.md`.

**Cierre formal:** el acta en `RepoTecnico/evidencia/H6/` recoge los 13 puntos con su salida de comando o inspección, los conteos finales (**40/40 Must · 25/25 RNF · 13/13 RT · 4/4 RE**) y el historial de los 6 hitos; `estado_proyecto.md` pasa a **Fase 3 completada** y se habilita la **Fase 4 — Pruebas** y la **Fase 5 — Manuales**.

---

## 9. Historial de cambios

| Versión | Fecha | Cambios | Fuentes |
|---|---|---|---|
| **1.1** | 2026-09-11 | **Cierre de H1 y desviaciones aceptadas.** (a) **§3.1.9** pasa a **✅ COMPLETADO (2026-09-11)** con el **ID de extensión `oiahebaliobknoeeonhgaacapjcpgblo`** y la tabla de la **batería real**: `npm run build` exit 0 (6 entradas + `dist/manifest.json`), `npx tsc -b` exit 0 (strict), Vitest **47 passed / 4 ficheros**, Playwright **4 passed**, `npm run lint:prohibited` exit 0, `forge test --root contracts --match-contract EIP712VerifierTest` **7 passed**, `check:mermaid` **27/27**, y carga de `dist/` con 0 errores (evidencia en `RepoTecnico/evidencia/H1/` y `ACTA_H1.md`). (b) **Nueva §3.1.10 «Cierre de H1: desviaciones aceptadas»** con las **5 desviaciones** del corpus y su impacto: **D-H1-1** `chrome-extension://` **prohibido** en `matches`/`exclude_matches` (Chrome rechaza el manifest completo y la extensión no carga; `<all_urls>` no cubre ese esquema); **D-H1-2** **3 builds encadenados** con la API `build()` desde `closeBundle` (Vite 7 no admite exportar un array de builds y el IIFE exige una entrada por build); **D-H1-3** tamaño **explícito** del `body` de las tres ventanas (`body.tk-popup/connect/notification` con los tokens y `.tk-window { height: 100% }`; con `100vh` el popup medía 720 px); **D-H1-4** **Poppins no es variable** (`poppins-latin-400/600/700.woff2` + un `@font-face` por peso; Inter y JetBrains Mono sí lo son) y las licencias **OFL** versionadas; **D-H1-5** `forge test` sin `--root contracts` es un **falso verde** (0 pruebas, exit 0) y el literal normativo pasa a `forge test --root contracts --match-contract EIP712VerifierTest`. (c) **§2, §5 y §6** marcan **H1 ✅ COMPLETADO** (fecha, ID y resultados) y la fila de la matriz de §6 pasa de «—» a la fila de H1 completada. (d) El literal de Forge se corrige en todo el plan (**§1.2**, §1.5, §3.1.5, §3.1.7, §3.2.7, §3.6.7, §6, §7.4, §8). Decisiones **DEC-47..DEC-51** de `estado_proyecto.md` v2.0. | `estado_proyecto.md` v2.0 · `documento_tecnico.md` v1.5 · `entornos_globales.md` v2.0 · `identidad_visual.md` v1.5 · `requerimientos.md` v1.9 · `evidencia/H1/ACTA_H1.md` |
| **1.0** | — | **Versión inicial del plan de la Fase 3.** Se propone el desarrollo en **6 hitos verticales** (H1 andamiaje y build MV3 · H2 cartera, cuentas y recuperación · H3 provider, conexión y lectura · H4 firma, aprobación y transacciones · H5 redes y observabilidad · H6 identidad, accesibilidad y entrega) y **10 unidades de ciclo posterior** (C1..C10) para los 10 RF Should. Contenido: estrategia vertical y definición de «hito terminado»; convención de ramas y commits; riesgos del plan asignados por hito; dependencias externas (Anvil, Foundry, Chromium de Playwright); resumen de hitos; hitos detallados con tareas identificadas por archivo, criterios de aceptación citados por su `CA-xx` real, pruebas de Vitest/Playwright/Forge y evidencia; ciclo posterior; calendario y esfuerzo (**128 h / 32 sesiones** de MVP y **40 h / 10 sesiones** de ciclo posterior; **168 h / 42 sesiones** en total), que **sustituye el «~40 h» retirado** por H-34/DEC-26; matriz de trazabilidad con los **40 RF Must asignados sin huérfanos**; gestión del cambio con brechas previstas **G-01..G-04**; Definition of Done global y **13 criterios de cierre** de la Fase 3. La secuencia **H1–H5** de `documento_tecnico.md` §9 queda como referencia y se ajusta a **H1–H6** (brecha **G-01**, con la propuesta de actualizar §7.4.1.f). | `documento_tecnico.md` v1.3 · `requerimientos.md` v1.8 · `casos_uso/casos_uso.md` v1.4 · `diccionario_datos.md` v1.7 · `entornos_globales.md` v1.8 · `estado_proyecto.md` v1.8 · `VEREDICTO_FASE2_V1.md` v1.2 |
