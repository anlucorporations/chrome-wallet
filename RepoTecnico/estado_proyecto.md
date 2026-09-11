# 📌 Estado del Proyecto — TrueKeate Wallet

> Memoria de trabajo del proyecto. Se lee al inicio de cada turno y se actualiza de forma incremental.

**Última actualización:** 2026-09-11 — Fase 3 — Desarrollo **EN CURSO**: **H1 ✅ COMPLETADO** (build MV3 de las 6 entradas, arnés de pruebas e instrumento Forge; batería completa en verde; ID de extensión **`oiahebaliobknoeeonhgaacapjcpgblo`**) con las **5 desviaciones aceptadas** registradas en **DEC-47..DEC-51**. La Fase 2 quedó **CERRADA** (`VEREDICTO_FASE2_V1.md` v1.3: **0 residuales**, 18/18 contradicciones, 10/10 `VR-01..VR-10`).
**Versión de este documento:** ✅ **v2.0**
**Fase actual:** **3 de 5 — Desarrollo 🚧 EN CURSO** — H1 completado el **2026-09-11**; **hito actual: H2 — Cartera, cuentas y recuperación** (`plan_desarrollo.md` §3.2). Fases 1 y 2 ✅ cerradas.
**Comando para continuar:** `/estado` · **H2 — Cartera, cuentas y recuperación** (`plan_desarrollo.md` §3.2) · `/push` (solo con orden explícita)
**Rama de trabajo activa:** `chrome-wallet-DSH`
**Historial de cambios:** v1.4 decisiones DEC-21..DEC-26 y remediación de `INFORME_OPTIMIZACION_V1.md` · v1.5 decisiones **DEC-27..DEC-36** (P-17, P-18, P-19 y D-A..D-G), `requerimientos.md` v1.5 con **50 RF (40 Must / 10 Should)** y desviaciones **D-01..D-13**, y alta de los artefactos de casos de uso (**36 CU**) y de su auditoría (**30 hallazgos**) · **v1.6** decisiones **DEC-37..DEC-44** (P-20, P-21, P-22 y D-J..D-Q), `requerimientos.md` **v1.6** (RF-50 con 30 s, ocultado por pérdida de foco y política de portapapeles; RNF-09 y RNF-10 corregidos; RF-23/RF-35 y RT-04/RT-13 ajustados) y `estado_proyecto.md` **v1.6** con el **cierre de la Fase 2** y los artefactos `documento_tecnico.md` v1.0 (+`AUDITORIA_DOCUMENTO_TECNICO_V1.md`, 33 hallazgos) y `casos_uso/diagramas.md` v1.0 (12 diagramas).
 · **v1.7** sincronización de la memoria con el **veredicto de reevaluación** (`VEREDICTO_FASE2_V1.md` v1.0, registrado en §2): la Fase 2 queda **NO cerrada** con **12 residuales `R-01..R-12`** y **18 contradicciones** en cierre documental; se alinean las versiones reales de todos los artefactos (`requerimientos.md` v1.7, `diccionario_datos.md` v1.6, `entornos_globales.md` v1.8, `identidad_visual.md` v1.4, `casos_uso.md` v1.3, `diagramas.md` v1.1, `documento_tecnico.md` v1.2) y se corrigen los conteos (66 módulos M1..M66, 9 `sequenceDiagram`), los próximos pasos y los criterios de aceptación de la Fase 2.
 · **v1.8** cierre de **`R-09`** con las decisiones **DEC-45** (bloqueo del revelado/exportación y del borrado de una cuenta importada cuando la cuenta está en uso por una dApp) y **DEC-46** (bloqueo del reset con la cola `truekeate_pending_requests` no vacía o una transacción en vuelo en `truekeate_inflight_tx`): se sincronizan la tabla §2, los próximos pasos y los criterios de la Fase 2 con el **`VEREDICTO_FASE2_V1.md` v1.2** (**0 residuales abiertos**, **18/18 contradicciones resueltas**) y queda **pendiente solo la última pasada de consistencia** antes de la Fase 3.
 · **v1.9** cierre de la Fase 2: la última pasada de consistencia cerró los **10 defectos residuales `VR-01..VR-10`** —permisos del manifest unificados en los cuatro documentos (`favicon`, `clipboardRead` y `clipboardWrite`), catálogo de eventos a **24**, tabla de errores del técnico convertida en **índice código → causa** contra `diccionario_datos.md` §4.3, retirada de `windowsByApprovalId`/`windowId` sustituidos por `truekeate_approval_window`, afirmación no falsable del puerto reescrita, `settings.networks` → `truekeate_networks`, evidencias normalizadas, **15** diagramas Mermaid en el técnico, fuentes sincronizadas y **0 mojibake**— y `VEREDICTO_FASE2_V1.md` **v1.3** declara el corpus ✅ **consistente y apto para autorizar la Fase 3**; se sincroniza la tabla §2 con las versiones finales y se marcan cumplidos los criterios de la Fase 2.
 · **v2.0 (esta versión)** apertura de la **Fase 3 — Desarrollo** y **cierre de H1** (2026-09-11): fase actual **3 de 5 🚧 EN CURSO**, hito completado **H1** (andamiaje, build MV3 de las 6 entradas e instrumento Forge; ID de extensión **`oiahebaliobknoeeonhgaacapjcpgblo`**) e **hito actual H2**; **§2** incorpora los artefactos de código creados (`src/`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig*.json`, `eslint.config.js`, `scripts/`, `contracts/`, `test/`, `e2e/`, `test.html`, `package.json`/`package-lock.json`, `public/fonts/`) y la evidencia de H1; **§3** recoge los **comandos verificados con su resultado real**; **§4** añade las decisiones **DEC-47..DEC-51** (las 5 desviaciones aceptadas de H1, documentadas con su motivo e impacto en `plan_desarrollo.md` §3.1.10); **§7** y **§8.3** se actualizan con los próximos pasos de H2; versiones del corpus sincronizadas (`plan_desarrollo.md` v1.1, `documento_tecnico.md` v1.5, `entornos_globales.md` v2.0, `identidad_visual.md` v1.5).

---

## 1. Resumen del proyecto

Extensión de navegador Chrome/Edge (Manifest V3) que funciona como **wallet Ethereum estilo MetaMask**, con provider EIP-1193 inyectado (`window.truekeate`), gestión de cuentas HD e importadas por clave privada, envío y recepción de transferencias (con QR), firma de transacciones y de datos EIP-712, firma de mensajes (`personal_sign`), y una **dApp de pruebas** que consume la wallet contra una **red local de Foundry (Anvil)**.

**Stack:** React 19 · TypeScript 5.9 · Vite 7 · ethers.js v6 · Chrome Extension APIs (MV3).
**Pruebas:** Vitest + Playwright + Forge (contrato verificador EIP-712).
**Alcance de despliegue:** 100 % local (sin GCP).

---

## 2. Artefactos de `RepoTecnico/`

| Archivo | Estado | Contenido |
|---|---|---|
| `requisitos.md` | ✅ Fuente (no se modifica) | Enunciado original de la tarea (36 especificaciones). |
| `TAREA_PARA_ESTUDIANTE.md` | ✅ Fuente (no se modifica) | Enunciado extendido con arquitectura y ejemplos de código. |
| `GUIA_RAPIDA_TESTING.md` | ⏳ Línea base previa (**no vinculante**) | Guía del prototipo anterior (nomenclatura `codecrypto_*`); P-10/DEC-09 decidió **no reutilizarla** (H-24). El proyecto tendrá su propia guía de troubleshooting. |
| `requerimientos.md` | ✅ **v1.9** (ver cabecera) | **50 RF (40 Must / 10 Should)**, 25 RNF, 13 RT y 4 RE, actores, desviaciones **D-01..D-13**, riesgos, entrevista cerrada y **criterio de aceptación + evidencia por RF/RT** (H-01/DEC-25). Incorpora **RF-50** (revelar/exportar semilla y claves privadas con confirmación explícita, D-13), la **caducidad de sesión de dApp** en RF-25 (D-B) y la **aprobación del cambio de red** en RF-22 (P-19). **v1.6 (ADT-04/06/09/12/14/19/20/22/25/30; P-20/P-21/P-22):** RF-50 con **30 s**, ocultado por pérdida de foco y **política de portapapeles**; **RNF-09** («nunca hacia la página ni por `postMessage`») y **RNF-10** (`<all_urls>` con `use_dynamic_url` y `exclude_matches`) reescritos; RF-23 **añade sin activar**; RF-35 → **una sola ventana global**; RT-04 con `notifications` **opcional**; RT-13 con **UUID literal y `key` fija**; redacción de logs a **10 bytes** de `data`. **v1.8 (R-09/DEC-45/DEC-46):** `CA-RF-05`, `CA-RF-06`, `CA-RF-11` y `CA-RF-50` recogen las **dos guardas de estado** (cuenta en uso por una dApp y reset con cola no vacía o transacción en vuelo, ambas `-32000`). **v1.9 (`VR-01`/`VR-07`/`VR-08`):** RT-04 y `CA-RT-04` fijan el **conjunto cerrado de permisos** (`storage`, `alarms`, `favicon`, `clipboardRead`, `clipboardWrite`) con la justificación de cada uno, RT-06 cita la clave canónica `truekeate_networks` y cuatro evidencias pasan a las formas admitidas. |
| `diccionario_datos.md` | ✅ **v1.8** (ver cabecera) | Claves de storage, entidades, protocolo de mensajes y catálogo RPC/errores. Red única Anvil. Decisiones P-03..P-08 aplicadas. **§4.3 es la fuente única de los literales de mensaje** (ACU-05/D-E) y el catálogo de eventos tiene **24** valores. **v1.7 (R-09/DEC-45/DEC-46):** dos filas nuevas en §4.3 (causas «Cuenta en uso por una dApp conectada» y «Reset bloqueado», ambas con `-32000`), guarda de sesión activa en §3.10 y **§3.11 nueva** con las guardas y el orden de comprobación del reset. **v1.8 (`VR-01`/`VR-03`/`VR-06`):** permisos del manifest unificados con el técnico y `entornos_globales.md` §4, referencias a las constantes de §3 de ese documento ya existentes y formulación falsable del puerto de larga vida en §3.4. |
| `entornos_globales.md` | ✅ **v2.0** (ver cabecera) | Entorno verificado, comandos, constantes, permisos de **mínimos privilegios**, política de versiones, 3 remotos, herramientas de prueba, identidad visual y GCP cerrado. **v1.9 (`VR-01`/`VR-03`):** `permissions` = `storage`, `alarms`, `favicon`, `clipboardRead` y `clipboardWrite`, con fila de justificación por permiso, y **siete constantes nuevas** en la tabla de §3. **v2.0 (H1 / DEC-47, DEC-49 y DEC-51):** **prohibido** el esquema `chrome-extension://` en `matches`/`exclude_matches` (§4, patrón eliminado), **ficheros de fuente reales** con Poppins no variable y licencias OFL (§1/§2) y literal normativo de Forge `forge test --root contracts --match-contract EIP712VerifierTest` (§2/§8). |
| `identidad_visual.md` | ✅ **v1.5** (ver cabecera; aprobado, P-14) | **Anexo vinculante de diseño**: marca TrueKeate, paleta medida, degradados, tipografía, componentes, tokens CSS, **matriz de contraste cerrada** y criterios de accesibilidad (H-17). **v1.5 (H1 / DEC-49 y DEC-50):** **tamaño explícito del `body`** de las tres ventanas con los tokens `--tk-*-width/height` (§5.1) y **ficheros de fuente reales** —Poppins en tres pesos discretos, Inter y JetBrains Mono variables, licencias OFL— (§4). |
| `INFORME_OPTIMIZACION_V1.md` | ✅ v1 (Fase 2) | **Informe de auditoría de la Fase 2**: **42 hallazgos** (2 CRITICA · 14 ALTA · 21 MEDIA · 5 BAJA) y **27 descartados**, con plan de acción (QW-1..QW-16, M-1..M-18, RM-1..RM-7) y criterios de aceptación. |
| `estado_proyecto.md` | ✅ **v2.0** (este archivo) | Memoria de trabajo. Decisiones **DEC-01..DEC-51**. **v2.0:** apertura de la Fase 3 con **H1 ✅ completado** (2026-09-11), hito actual **H2**, tabla §2 con los artefactos de código, comandos verificados de H1, decisiones **DEC-47..DEC-51** (las 5 desviaciones aceptadas) y próximos pasos de H2. |
| `casos_uso/casos_uso.md` | ✅ **v1.5** (Fase 2, ver cabecera) | **36 casos de uso** (Gherkin/EARS) con fichas completas, flujos alternativos y de excepción, criterios con evidencia y matriz de trazabilidad `E-xx → RF-xx → CU → test`. Sus gráficos viven en `casos_uso/diagramas.md`. **v1.4 (R-09):** convención 13 (guardas de estado) y flujos/criterios nuevos en CU-06, CU-07 y CU-30; §2, §5 y §7 siguen siendo idénticas entre sí. **v1.5 (`VR-04`/`VR-05`/`VR-08`/`VR-10`):** literal de vencimiento de CU-15 con «(120 s)», retirada de `windowsByApprovalId` y del `windowId` por solicitud (CU-08 y CU-15) a favor de `truekeate_approval_window`, evidencias canónicas y mojibake corregido. |
| `casos_uso/AUDITORIA_CASOS_USO_V1.md` | ✅ v1.0 (Fase 2) | **Auditoría de los 36 CU**: **30 hallazgos** (ACU-01..ACU-30: 2 CRITICA · 8 ALTA · 18 MEDIA · 2 BAJA), decisiones **D-A..D-G** y **P-17/P-18/P-19** resueltas; su remediación se aplicó en `requerimientos.md` v1.5 y en esta memoria (**DEC-27..DEC-36**). |
| `casos_uso/diagramas.md` | ✅ **v1.2** (Fase 2) | **12 diagramas** UML de los 36 CU: 9 `sequenceDiagram` (Figuras 2–10), 2 `flowchart` (Figura 1 de casos de uso y Figura 12 de arquitectura) y 1 `stateDiagram-v2` (Figura 11, ciclo de vida del `PendingRequest`), con índice de trazabilidad y notas de renderizado. **v1.2 (`VR-09`):** bloque «Fuentes» sincronizado con las versiones vigentes (`casos_uso.md` v1.5, `requerimientos.md` v1.9, `diccionario_datos.md` v1.8 y `entornos_globales.md` v1.9) e historial reparado. |
| `documento_tecnico.md` | ✅ **v1.5** (ver cabecera) | Arquitectura y especificación técnica: **66 módulos (M1..M66)**, **20 ADR**, **15** diagramas Mermaid, contratos internos, contrato Forge y trazabilidad. Auditado en `AUDITORIA_DOCUMENTO_TECNICO_V1.md`, con la remediación ya aplicada. **v1.4:** permisos del manifest idénticos a `entornos_globales.md` §4, catálogo de eventos a **24**, tabla de errores convertida en índice código → causa, retirada de `windowsByApprovalId` y del `windowId` por solicitud, y conteo de **15** diagramas Mermaid. **v1.5 (H1 / DEC-47..DEC-51):** **prohibido** `chrome-extension://` en `matches`/`exclude_matches` (§7.3), **3 builds encadenados** con la API `build()` desde `closeBundle` (§7.5.2/§7.5.3), **tamaño explícito del `body`** en las tres ventanas (§5.2) y literal normativo `forge test --root contracts --match-contract EIP712VerifierTest` con la nota del **falso verde** (§7.2/§7.4). §7.4.1.f pasa a `H1..H6` (cierre de la brecha **G-01**). |
| `AUDITORIA_DOCUMENTO_TECNICO_V1.md` | ✅ **v1.0** (Fase 2) | **Auditoría del documento técnico**: **33 hallazgos** (ADT-01..ADT-33), decisiones **D-H..D-U** y **P-20/P-21/P-22** resueltas; su remediación se aplica al `documento_tecnico.md`, a `requerimientos.md` v1.6 y a esta memoria (**DEC-37..DEC-44**). |
| `VEREDICTO_FASE2_V1.md` | ✅ **v1.3** (Fase 2, reevaluación y cierre) | **Veredicto de reevaluación y cierre de la Fase 2**: ✅ **corpus consistente y apto para autorizar la Fase 3** (**0 residuales abiertos** —12/12 `R-01..R-12` cerrados, `R-09` con DEC-45/DEC-46—, **18/18 contradicciones resueltas** y **0 defectos residuales** de consistencia —10/10 `VR-01..VR-10` cerrados en la **v1.3**, §7—). Incluye la tabla de cierre CRITICA/ALTA de las tres auditorías, la evidencia `ruta:línea` de ambos lados de cada contradicción y el plan de cierre por bloques (§5). |
| `plan_desarrollo.md` | ✅ **v1.1** (Fase 3, H1 cerrado) | Plan de desarrollo vertical por hitos y **estimación por hitos** (sustituye al «~40 h», H-34). **v1.1:** §3.1.9 marca **H1 ✅ COMPLETADO (2026-09-11)** con el ID de extensión y la batería real; **§3.1.10 nueva** con las **5 desviaciones aceptadas** de H1; §2, §5 y §6 marcan H1 completado. Hito en curso: **H2**. |
| **Código de la extensión (creado en H1)** | ✅ existe y verificado (`npm run build` exit 0) | `src/` con **31 ficheros**: `manifest.ts` (M1) · `background.ts` (M2) y `background/rpc/{router,catalog,errors}.ts` (M3/M4/M6) · `background/security/{senderGuard,accessLevel}.ts` (M20/M21) · `background/state/schema.ts` (M33) · `inject/{index,provider,eip6963,icon-data}.ts` (M35..M37) · `content-script.ts` (M38) · `popup/{main.tsx,App.tsx}` (M39) · `connect/`, `notification/` · `shared/{types,protocol,constants}.ts` (M55..M57) · `styles/{tokens,base}.css` (M64/M65) · los 4 `.spec.ts` de H1 (`manifest`, `naming`, `windowContract`, `errors`). |
| `package.json` / `package-lock.json` | ✅ versionados (H1) | **9 scripts** (`dev`, `build`, `test`, `test:watch`, `coverage`, `test:e2e`, `lint:prohibited`, `check:mermaid`, `typecheck`, `forge:test`). Dependencias: `ethers` `~6.15.0`, `react`/`react-dom` `^19.0.0`; herramienta: `typescript` `~5.9.0`, `vite` `^7.0.0`, `vitest` `^3.0.0`, `@vitest/coverage-v8` `^3.0.0`, `jsdom` `^26.0.0`, `@playwright/test` `^1.50.0`, `eslint` `^9.0.0`, `typescript-eslint` `^8.0.0`, `mermaid` `^11.0.0`, `@types/chrome` `^0.1.0`, `@types/node` `^24.0.0`. |
| Configuración de build y pruebas (H1) | ✅ existe y verificado | `vite.config.ts` (3 builds encadenados: ES + IIFE × 2 y **generación del manifest** desde `src/manifest.ts`), `vitest.config.ts` (jsdom + `test/setup/chrome-stub.ts`), `playwright.config.ts` (proyecto `chromium-extension`, `globalSetup`), `tsconfig.json`/`tsconfig.node.json` (strict), `eslint.config.js`. |
| `scripts/` (H1) | ✅ existe y verificado | `lint-prohibited.mjs` (RT-03, nomenclatura, colores, `chrome.storage.sync`, `ethers` en el popup y 0 URLs de CDN en `dist/`), `check-mermaid.mjs` (**27/27** bloques), `generate-icons.ps1` y `generate-icon-data.mjs`. |
| `contracts/` (instrumento Forge, H1) | ✅ existe y verificado (**7 passed**) | Proyecto Foundry: `foundry.toml` (`solc` **0.8.24** fijado, `evm_version = "cancun"`, `optimizer = false`), `src/EIP712Verifier.sol`, `test/EIP712Verifier.t.sol` y `test/fixtures/eip712-signature.json` (fixture versionado), con `lib/forge-std` vendorizado (solo referencia de pruebas). |
| `test/` y `e2e/` (H1) | ✅ existe y verificado (**4 passed**) | `test/setup/chrome-stub.ts` (stub de `chrome.*` con reloj inyectable), `e2e/fixtures/extension.ts` (`launchPersistentContext` con perfil nuevo y descubrimiento del ID), `e2e/global-setup.ts` (plazos inyectados + evidencia) y `e2e/01-onboarding.spec.ts`. |
| `test.html` (H1) | ✅ existe | dApp de pruebas en la raíz, servida en `http://localhost:5174/test.html` (`strictPort`); la detección del provider en página real se cierra en **H3** (`E2E: 07-provider.spec.ts`). |
| `public/fonts/` (H1) | ✅ existe y versionado | **Poppins** en tres pesos discretos (`poppins-latin-400.woff2`, `-600`, `-700`), **Inter** variable (`inter-latin.woff2`), **JetBrains Mono** variable (`jetbrains-mono-latin.woff2`) y licencias **OFL-1.1** (`LICENSE-poppins.txt`, `LICENSE-inter.txt`, `LICENSE-jetbrains-mono.txt`). |
| `RepoTecnico/evidencia/H1/` | ✅ archivado (2026-09-11) | `build-*.log`, `typecheck-*.log`, `vitest-*.log`, `playwright-*.log`, `e2e-*.json`, `lint-prohibited-*.log`, `forge-eip712verifier-*.log`, `check-mermaid-*.log`, `manifest-*.json`, `01-onboarding-*.png` y **`ACTA_H1.md`**. |

---

## 3. Entorno verificado (resumen)

- Windows · Node `v24.16.0` · npm `11.13.0`.
- Foundry `anvil`/`forge`/`cast` **1.7.2-dev** instalados (`C:\Users\lucci\.cargo\bin`); rango soportado `>=1.0.0 <2.0.0` (`entornos_globales.md` §8).
- Repositorio git **inicializado**: `main` (commit raíz con la documentación) y rama de trabajo `chrome-wallet-DSH`.
- Remotos configurados: `origin` (GitHub, **no existe**), `gitlab` (GitLab.com, **no existe**), `codecrypto` (GitLab ANLU, **existe con el código previo, solo como referencia**).
- **El proyecto se reconstruye desde cero (DEC-09):** el código del remoto `codecrypto` **no se adopta, no se reutiliza y no se versiona**; `src/` **se creó en H1** (2026-09-11) y el remoto solo se consulta. No hay ninguna vía de reutilización de ese código en este plan.
- RPC local en `127.0.0.1:8545` **detenido** (se levanta con `anvil` al probar, con allowlist de CORS).
- Sin `gh`/`glab` ni tokens; GCP fuera de alcance.
- Identidad visual **TrueKeate** incorporada: 6 activos originales en `TrueKeate/`, 4 iconos generados en `public/icons/` (versionados, no se regeneran en Linux) y 6 activos de marca en `public/brand/`.
- **Tipografías auto-hospedadas (H1/DEC-50):** `Poppins` en **tres** pesos discretos (`poppins-latin-400/600/700.woff2`), `Inter` y `JetBrains Mono` **variables** (`inter-latin.woff2`, `jetbrains-mono-latin.woff2`) y las licencias **OFL-1.1** en `public/fonts/LICENSE-{poppins,inter,jetbrains-mono}.txt`.
- **ID de extensión estable (H1):** **`oiahebaliobknoeeonhgaacapjcpgblo`**, derivado de la `key` fija del manifest (DEC-43) y verificado en los E2E; es el `<ID>` que consume la allowlist CORS de Anvil (RE-04).
- **`dist/` cargable (H1):** 6 entradas (`index.html`, `connect.html`, `notification.html`, `background.js`, `content-script.js`, `inject.js`) + `dist/manifest.json`, generado por un solo `npm run build`.

### 3.1 Comandos verificados en H1 (2026-09-11)

| Comando | Resultado real | Evidencia |
|---|---|---|
| `npm run build` | **exit 0** — 6 entradas en `dist/` + `dist/manifest.json` | `evidencia/H1/build-2026-09-11.log`, `manifest-2026-09-11.json` |
| `npx tsc -b` | **exit 0** (strict, 0 errores) | `evidencia/H1/typecheck-2026-09-11.log` |
| `npm run test` (Vitest) | **47 passed / 4 ficheros** | `evidencia/H1/vitest-2026-09-11.log` |
| `npm run test:e2e` (Playwright) | **4 passed** (`01-onboarding.spec.ts`) | `evidencia/H1/playwright-2026-09-11.log`, `e2e-2026-09-11.json` |
| `npm run lint:prohibited` | **exit 0** (0 hallazgos; 0 URLs de CDN en `dist/`) | `evidencia/H1/lint-prohibited-2026-09-11.log` |
| `forge test --root contracts --match-contract EIP712VerifierTest` | **7 passed, 0 failed, 0 skipped** | `evidencia/H1/forge-eip712verifier-contracts-2026-09-11.log` |
| `npm run check:mermaid` | **27/27 bloques válidos** | `evidencia/H1/check-mermaid-2026-09-11.log` |

> **Regla vinculante (DEC-51):** el comando normativo de Foundry es **`forge test --root contracts --match-contract EIP712VerifierTest`** (`npm run forge:test`). El literal **sin `--root contracts`** responde «Nothing to compile», ejecuta **0 pruebas** y sale con **exit 0**: es un **falso verde** y queda prohibido en el corpus.

---

## 4. Decisiones tomadas

| # | Decisión | Motivo |
|---|---|---|
| DEC-01 | Renumerar los requerimientos como `RF-01..RF-50` usando `requerimientos.md` como **fuente única**. | El enunciado repite los números 20, 26 y 29 (D-01); RF-48/RF-49 son aportaciones de identidad visual (**más RF-50 en DEC-28**) y quedan dentro del rango oficial (H-03). |
| DEC-02 | Adoptar **Foundry Anvil** como red por defecto y **única**. | Petición explícita del usuario (D-02). |
| DEC-03 | Añadir la **importación por clave privada** (RF-05/RF-06) y la **recepción de fondos con QR/copiar dirección** (RF-07). | Petición explícita del usuario (D-03/D-04). |
| DEC-04 | Mantener la arquitectura del enunciado: **React = solo UI**, **Service Worker = criptografía y RPC**. | Ya está validada y refuerza RNF-09/RNF-14. |
| DEC-05 | Incluir desde el diseño la **cola de aprobaciones persistida** y los **timeouts** (RF-37/RF-40/RNF-08). | El Service Worker MV3 se duerme y pierde el estado en memoria. **Rediseñada en DEC-24** (H-02/H-07/H-08). |
| DEC-06 | Confirmar `personal_sign` (RF-21) y `wallet_revokePermissions` (RF-26) dentro del alcance. | Respuestas **P-05** y **P-06** del usuario. |
| DEC-07 | **Retirar Sepolia** del alcance y de `host_permissions`. | Decisión **P-02**. |
| DEC-08 | Mantener la **carga sin contraseña** del mnemonic, documentándolo como modo desarrollo. | Decisión **P-03**. |
| DEC-09 | **Reconstruir el proyecto desde cero**: el código del remoto `codecrypto` es solo **referencia** y no se reutiliza ni se versiona en el nuevo proyecto. | Decisión **P-10** (bloqueante, resuelta). |
| DEC-10 | Registrar **3 remotos** (`origin`, `gitlab`, `codecrypto`) pero **no hacer push** hasta orden explícita (`/push`, RE-03). | Regla del proceso + remotos de GitHub/GitLab.com aún inexistentes. |
| DEC-11 | **5 cuentas HD por defecto + botón "Añadir cuenta"** para derivar la siguiente. | Decisión **P-04**. |
| DEC-12 | **Vitest + Playwright + contrato verificador EIP-712 con Forge** como stack de pruebas. | Decisión **P-07**. |
| DEC-13 | **100 % local, sin GCP.** | Decisión **P-08**. |
| DEC-14 | **UI y documentación en español; identificadores de código en inglés.** | Decisión **P-09**. |
| DEC-15 | Adoptar la marca **TrueKeate** entregada en `TrueKeate/` como identidad visual del producto, con el documento vinculante `identidad_visual.md`. | Petición explícita del usuario en Fase 1. |
| DEC-16 | La paleta se obtuvo por **medición de píxeles** de los activos originales (no por estimación visual) y se congeló en tokens CSS. | RNF-18 exige que no haya colores fuera de los tokens. |
| DEC-17 | Los iconos de 16/32 px usan una **variante simplificada** (zoom a las flechas + saturación) y los de 48/128 el isologo completo. | El isologo completo se emborrona por debajo de 48 px. |
| DEC-18 | **Renombrar todo el producto a TrueKeate**, incluido el provider inyectado (`window.truekeate`), el prefijo de storage (`truekeate_`) y los tipos de mensaje. | Decisión **P-13** (desviación consciente del literal E-03 del enunciado). El alias de compatibilidad se cierra en **DEC-21**. |
| DEC-19 | Aprobar el sistema de diseño de `identidad_visual.md` tal cual: paleta medida de los activos, Poppins + Inter + JetBrains Mono auto-hospedadas, ventanas de 380×600 / 420×650 / 420×640. | Decisión **P-14**. |
| DEC-20 | Iconos de 16/32 px con **variante simplificada** (zoom a las flechas + saturación); 48/128 con el isologo completo. | Decisión **P-15**. |
| DEC-21 | El provider inyectado expone **`window.truekeate`** **y además el alias `window.codecrypto = window.truekeate`** (el **mismo objeto**), con un **test que verifica ambos nombres**. | Cierra **H-15** y protege los **5 puntos de la rúbrica** ligados al nombre literal del enunciado. Decisión firme del usuario (sustituye a «si el evaluador lo exige»). |
| DEC-22 | **`eth_sign` retirado del catálogo RPC**: se responde `4200` (Unsupported method) y solo se admite **`personal_sign`**. | Cierra **H-11**: `eth_sign` firma un digest de 32 bytes sin interpretación, el enunciado no lo exige y P-05 confirma solo `personal_sign`. |
| DEC-23 | **Vista previa con decodificación completa del calldata y avisos de riesgo**: selector y nombre de función, parámetros legibles, contrato destino etiquetado y aviso en `approve`/`setApprovalForAll`/valor ilimitado; en EIP-712 se muestran `verifyingContract` y `name` (con aviso si no coinciden con lo declarado); en `personal_sign` se previsualiza el **texto UTF-8** (aviso si el payload es hexadecimal ilegible). | Cierra **H-11**: el usuario debe ver qué autoriza realmente antes de firmar. |
| DEC-24 | **Rediseño del ciclo de aprobación MV3**: puerto de larga vida (`chrome.runtime.connect` con reconexión y backoff), **`chrome.alarms`** en los permisos, **cola persistida `Record<approvalId, PendingRequest>`** con *read-modify-write* serializado, **reconciliación al arrancar** el SW (marca `expired` y responde `4001` a los huérfanos) y **SW dueño único del plazo** (`SIGN_TIMEOUT_MS` 120 s / `CONNECT_TIMEOUT_MS` 60 s anclados a `createdAt`); al expirar cierra la ventana, marca `expired` y purga el badge. | Cierra **H-02, H-07 y H-08**; completa DEC-05. |
| DEC-25 | Los **50 RF y los 13 RT** llevan columna de **criterio de aceptación (verificable)** y **evidencia**; los criterios Gherkin viven en **`requerimientos.md` §9 (anexo)** y en los casos de uso. | Cierra **H-01**: sin oráculo por requisito no se puede derivar el test. La redacción dentro de `requerimientos.md` corresponde al analista. |
| DEC-26 | **MVP = los 40 RF Must** (incluye **RF-50**, DEC-28); los **10 RF Should** se planifican en un **ciclo posterior**. La estimación «~40 h» se sustituye por **estimación por hitos** en `plan_desarrollo.md`. | Cierra **H-34** y hace explícito qué cae si se agota el presupuesto (§9). |
| DEC-27 | **El MVP no depende del badge (P-17):** **RF-38 (badge)** y **RF-39 (notificaciones)** permanecen en el **ciclo posterior** y **no se promociona ninguno**; el oráculo del caso central de la cola de aprobaciones (CU-16) pasa a ser «**2 entradas `pending` en `truekeate_pending_requests` + 1 transacción en vuelo por cuenta**». | Cierra **ACU-07**; el alcance comprometido (§9) deja de depender de dos RF Should. |
| DEC-28 | Se añade **RF-50 (Must)**: **revelar y exportar** la frase semilla (BIP-39) y las claves privadas de las cuentas **bajo confirmación explícita** del usuario (advertencia de riesgo, valores ocultos por defecto, revelado temporal de **30 s** y prohibición de exponerlos por `window.postMessage`), con **`CA-RF-50`** en Gherkin y EARS y desviación **D-13**. | Cierra **ACU-14** (**P-18**): sin revelado/exportación, las cuentas importadas por clave privada son irrecuperables (H-25/RNF-22). |
| DEC-29 | **`wallet_switchEthereumChain` exige aprobación del usuario cuando la red destino no es la activa**: crea una solicitud en `truekeate_pending_requests` que se resuelve en `notification.html`; si **ya es la red activa**, responde **sin cambios ni ventana**. | Cierra **ACU-16** (**P-19**); se alinea en RF-22, `CA-RF-22` y el catálogo RPC del diccionario de datos. |
| DEC-30 | **Fuente de verdad de EIP-6963 = RT-13**: `name: "TrueKeate"` y `rdns: "academy.codecrypto.truekeate"`; el diccionario de datos y los casos de uso se alinean a esos literales. | Cierra **ACU-03** (**D-A**); elimina la divergencia con el diccionario §4.1.1. |
| DEC-31 | La **caducidad de la sesión de dApp** (`expiresAt = lastUsedAt + 86400000`, **24 h renovables en cada uso**) forma parte de **RF-25**, con criterio de aceptación y evidencia propios. | Cierra **ACU-17** (**D-B**); `lastUsedAt`/`expiresAt` y `sessionTtlMs` dejan de ser entidades sin requisito. |
| DEC-32 | El literal de «build limpio» es **`npm ci && npm run build`** en todo el corpus (RNF-15, RNF-24 y §2.6), en sustitución de `npm install`. | Cierra **ACU-26** (**D-C**). |
| DEC-33 | `truekeate_logs` incorpora el campo **`event`** (enum de los **24 eventos** del catálogo de §2.2) **separado de `category`** (5 valores); se corrigen los CU que usaban categorías como eventos. | Cierra **ACU-04** (**D-D**). |
| DEC-34 | La **tabla cerrada de errores EIP-1193 (§2.1)** admite **varios mensajes por código** (uno por causa) y **todo error mostrado al usuario lleva `code`**. | Cierra **ACU-05** (**D-E**). |
| DEC-35 | Se define **`accountLabels: Record<indice, string>`** en `truekeate_settings` para etiquetar las **cuentas derivadas** (además del `label` de las importadas). | Cierra **ACU-06** (**D-F**). |
| DEC-36 | El **alta de red siempre solicita el permiso de host en runtime** (`chrome.permissions.request`), **también desde el popup**: no hay excepción por el origen de la UI. | Cierra **ACU-27** (**D-G**); coherente con RT-04 y `entornos_globales.md` §4. |
| DEC-37 | **Política de portapapeles de la semilla y plazo de revelado (P-20):** copiar la frase semilla **está permitido** mientras el valor está revelado; el revelado dura **30 s** y se oculta también **por pérdida de foco**; al ocultarse, la extensión **borra el portapapeles** si aún contiene la semilla, con **test E2E que lo comprueba**. | Cierra **ADT-09**, **ADT-06** y **P-20**; se aplica en RF-50, `CA-RF-50` y RNF-09 (higiene del revelado). Retira cualquier mención a 60 s en el revelado. |
| DEC-38 | **Una sola ventana global de confirmación (P-21):** existe **como máximo una** `notification.html`; el resto de solicitudes **esperan en la cola** y la ventana muestra el **contador de pendientes** (nunca dos solicitudes a la vez). Sustituye la invariante «una ventana por origen». | Cierra **ADT-22** y **ADT-14** (**P-21**); se aplica en RF-35, `CA-RF-35` y RNF-05. |
| DEC-39 | **El alta de red no activa la red (P-22):** `wallet_addEthereumChain` **solo añade** la red y la deja inactiva; usar la red nueva exige su propio `wallet_switchEthereumChain` con aprobación del usuario. | Cierra **ADT-25** (**P-22**); coherente con RF-22/`CA-RF-22`/P-19 y DEC-29. |
| DEC-40 | **El origen de una petición se deriva solo de `sender.origin`**; con **`frameId !== 0`** queda prohibido el respaldo a `sender.tab.url` (un iframe hostil no hereda la sesión del sitio anfitrión) y la respuesta se envía solo a ese frame. | Cierra **ADT-07** (**D-J**); se aplica a RNF-10/RNF-11 y al ciclo de aprobación. |
| DEC-41 | **Decodificación del calldata con tabla local cerrada de selectores**, sin servicios externos de firmas (RT-03); fuera de la tabla, `functionName = null` con aviso bloqueante. **`verifyingContractMismatch`** pasa a significar **dirección cero o contrato no desplegado**. | Cierra **ADT-08** (**D-K**); se aplica a RF-19/RF-20 y a DEC-23. |
| DEC-42 | **Cota de payload de 64 KiB** (por encima, `-32602`) con previews largas redactadas en reposo, y **cuota objetivo de `chrome.storage.local` de 10 MB** (mínimo exigido Chrome 114) **sin `unlimitedStorage`**: el rechazo por cuota es **observable** con 1 reintento, `code: -32603` y aviso en el panel. | Cierra **ADT-21** y **ADT-14** (**D-L/D-M**); se aplica a RF-37, RF-28..RF-32 y RNF-16. |
| DEC-43 | **UUID literal del provider y `key` fija del manifest:** el UUID v4 del provider EIP-6963 es una **constante literal congelada** y el manifest generado incluye una **`key` fija** que estabiliza el **ID de la extensión**. | Cierra **ADT-19** (**D-N**); requisito para la allowlist CORS de Anvil (RE-04) y para la reproducibilidad de los E2E (RT-13/`CA-RT-13`). |
| DEC-44 | **`notifications` pasa a permiso opcional** (`optional_permissions`, solicitado en runtime al activar RF-39, ciclo posterior) y el ***token bucket* por origen cubre todo el catálogo RPC**, no solo los métodos aprobables. | Cierra **ADT-30** y **ADT-24** (**D-P/D-Q**); se aplica a RT-04/`CA-RT-04`, a la tabla de excepciones de §2.5 y a RF-28. |
| DEC-45 | **Bloqueo por sesión de dApp activa (R-09a).** Si una cuenta tiene una **entrada vigente en `truekeate_connected_sites`**, la extensión **bloquea** el **revelado/exportación** de su clave privada —y del mnemonic que la deriva si cualquiera de sus cuentas está en uso— y la **eliminación** de la cuenta importada, con error tipado **`-32000`** y el literal de la causa «Cuenta en uso por una dApp conectada» de `diccionario_datos.md` §4.3, que nombra el `origen` y la acción (revocar ese permiso). **No se permite continuar.** | Cierra **R-09a** del veredicto de reevaluación; se aplica a **RF-05, RF-06 y RF-50** (`CA-RF-05`, `CA-RF-06`, `CA-RF-50`), a `diccionario_datos.md` §3.10, a CU-06/CU-07 y a `documento_tecnico.md` §3.8 (regla 9). |
| DEC-46 | **Bloqueo del reset por cola o transacción en vuelo (R-09b).** Pulsar **Reset Wallet** con solicitudes `pending` en `truekeate_pending_requests` o con una transacción en vuelo vigente en `truekeate_inflight_tx` **bloquea** el reset con error tipado **`-32000`** (error de validación de UI: ningún método RPC lo devuelve) y el literal de la causa «Reset bloqueado» de `diccionario_datos.md` §4.3; la UI indica **cuántas** solicitudes quedan y ofrece **resolverlas** (aprobar o rechazar) o **esperar** a que expiren. Orden estricto: **cola vacía → sin transacción en vuelo → confirmación destructiva → limpieza**; solo entonces procede y se conserva `truekeate_logs` (RF-32). | Cierra **R-09b** del veredicto de reevaluación; se aplica a **RF-11** (`CA-RF-11`), a `diccionario_datos.md` §3.11, a CU-30 y a `documento_tecnico.md` §3.9. |
| DEC-47 | **Prohibido el esquema `chrome-extension://` en `matches`/`exclude_matches` (desviación D-H1-1).** El patrón `chrome-extension://*/*` **no es válido** en `content_scripts`: Chrome **rechaza el manifest completo** («Invalid value for 'content_scripts[0].exclude_matches[0]'») y la extensión **no carga** (el Service Worker nunca aparece). Se elimina; las exclusiones quedan en `https://metamask.io/*` y `https://*.metamask.io/*`. Además es **innecesario**: `<all_urls>` **no** incluye el esquema `chrome-extension://`. | Evidencia directa de H1: el manifest con ese patrón no cargaba en Chromium; con el patrón eliminado, `dist/` carga con 0 errores (`E2E: 01-onboarding.spec.ts — 4 passed`). Se aplica a `documento_tecnico.md` §7.3 (fragmento del manifest, tabla de justificación y nota de superficie amplia), `entornos_globales.md` §2/§4 y `requerimientos.md` (RNF-10). |
| DEC-48 | **El build MV3 se implementa como 3 builds encadenados con la API programática `build()` (desviación D-H1-2).** **Vite 7 no admite** que el fichero de configuración **exporte un array de builds**; y `format: 'iife'` + `inlineDynamicImports: true` **exigen una entrada por build**. Cadena: **build 1 ES** (3 páginas + Service Worker), **build 2 IIFE** (`content-script`), **build 3 IIFE** (`inject`, que además genera y valida `dist/manifest.json`), lanzados desde el hook `closeBundle`. | El efecto observable del corpus se mantiene: **un solo `npm run build`** produce las **6 entradas** y `dist/manifest.json` (`build-2026-09-11.log`). Se documenta en `documento_tecnico.md` §7.5.2/§7.5.3. **No** cambia ningún criterio de aceptación (`CA-RT-05` sigue cumplido). |
| DEC-49 | **Las tres ventanas declaran `width`/`height` explícitos en el `body` (desviación D-H1-3).** `body.tk-popup` / `body.tk-connect` / `body.tk-notification` usan los tokens `--tk-popup-width/height`, `--tk-connect-width/height` y `--tk-notification-width/height`, y el contenedor interno (`.tk-window`) hereda `height: 100%`. Con `min-height: 100vh` el `body` medía **720 px** de alto en lugar de 600 y Chrome abría el popup con la **altura por defecto del navegador**. `test.html` **no** lleva esas clases (layout fluido). | El popup se abre a **380 × 600** y las ventanas a 420 × 650 / 420 × 640, verificado en el E2E de H1 (`01-onboarding.spec.ts`). Se documenta en `identidad_visual.md` §5.1 y `documento_tecnico.md` §5.2. |
| DEC-50 | **Poppins se auto-hospeda en tres ficheros y las licencias OFL se versionan (desviación D-H1-4).** **Poppins no es una fuente variable**: tiene pesos **discretos**, de modo que se descargan `poppins-latin-400.woff2`, `poppins-latin-600.woff2` y `poppins-latin-700.woff2`, con **un `@font-face` por peso**. **Inter** y **JetBrains Mono** sí son variables (`inter-latin.woff2`, `jetbrains-mono-latin.woff2`). Se añaden las licencias **OFL-1.1** `public/fonts/LICENSE-{poppins,inter,jetbrains-mono}.txt`. | Cierra la suposición errónea del corpus (un único `.woff2` con `font-weight: 400 700`); la tipografía se sirve sin CDN y con licencia registrada (RT-12, RNF-20, RNF-23). Se documenta en `identidad_visual.md` §4 y `entornos_globales.md` §1/§2/§9. |
| DEC-51 | **El literal normativo de Foundry es `forge test --root contracts --match-contract EIP712VerifierTest` (desviación D-H1-5).** `forge test` **sin** `--root contracts` se ejecuta desde la raíz del repositorio, responde «Nothing to compile», ejecuta **0 pruebas** y termina con **exit 0**: es un **falso verde** y **queda prohibido** como comando normativo. El script `npm run forge:test` ya incluye `--root contracts`. | Evidencia de H1: 7 pruebas con `--root contracts` (`forge-eip712verifier-contracts-2026-09-11.log`). Se corrige el literal en `plan_desarrollo.md` (puerta de comandos y §3.1.10), `documento_tecnico.md` (§5.4, §7.2, §7.4 y §9) y `requerimientos.md` (RT-07/RT-11 y Anexo A), con la nota del falso verde. |

---

## 5. Entrevista de la Fase 1 ✅ CERRADA

### Bloque 1 — Entorno, repositorios y seguridad

| ID | Pregunta | Respuesta |
|---|---|---|
| P-01 | Repositorios remotos | Crear en GitHub `chrome-wallet` (`main` + `chrome-wallet-DSH`), crear en GitLab `chrome-wallet` (mismas ramas), agregar `gitlab.codecrypto.academy/anlucorporations/chrome-wallet.git`. |
| P-02 | Red por defecto | **Solo Anvil local** (`127.0.0.1:8545`, chainId 31337), **sin Sepolia**. |
| P-03 | Seguridad del mnemonic | **Sin contraseña** (modo desarrollo); riesgo aceptado. |

### Bloque 1-bis — Línea base existente

| ID | Pregunta | Respuesta |
|---|---|---|
| P-10 | ¿Qué se hace con la implementación previa del remoto `codecrypto`? | **Reconstruir desde cero** (DEC-09): el remoto queda solo como **referencia de consulta** y su código no se reutiliza ni se versiona. |

### Bloque 2 — Alcance funcional

| ID | Pregunta | Respuesta |
|---|---|---|
| P-04 | Nº de cuentas derivadas | **5 por defecto + botón "Añadir cuenta"**. |
| P-05 | `personal_sign` y QR de recepción | **Sí a ambos.** |
| P-06 | Revocar permisos y renombrar cuentas | **Sí a ambos.** |

### Bloque 3 — Calidad, pruebas y entrega

| ID | Pregunta | Respuesta |
|---|---|---|
| P-07 | Frameworks de prueba | **Vitest + Playwright + contrato verificador EIP-712 con Forge.** |
| P-08 | Despliegue | **100 % local, sin GCP.** |
| P-09 | Idioma | **UI y documentación en español; identificadores de código en inglés.** |

### Bloque 4 — Identidad visual ✅ RESUELTO

| ID | Pregunta | Estado |
|---|---|---|
| P-13 | Nomenclatura marca/enunciado | ✅ **Renombrar todo a TrueKeate**, incluido el provider (`window.truekeate`) y su alias `window.codecrypto` (DEC-21). |
| P-14 | Sistema de diseño | ✅ **Aprobado tal cual** (`identidad_visual.md`, hoy v1.4). |
| P-15 | Iconos pequeños | ✅ **Aprobada** la variante simplificada para 16/32 px. |

### Bloque 5 — Decisiones de la auditoría del documento técnico ✅ RESUELTO

| ID | Pregunta | Respuesta |
|---|---|---|
| P-20 | ¿Qué política se aplica al **portapapeles** al revelar la frase semilla? | ✅ **Copiar permitido** mientras el valor está revelado, con **borrado del portapapeles al ocultar** si aún contiene la semilla; revelado de **30 s** con **ocultado por pérdida de foco** y test E2E que lo comprueba (**DEC-37**). |
| P-21 | ¿**Una sola** ventana de confirmación global o una por origen? | ✅ **Una sola ventana global** de `notification.html`; el resto de solicitudes **esperan en la cola** y la ventana muestra el **contador de pendientes** (**DEC-38**). |
| P-22 | ¿`wallet_addEthereumChain` **activa** la red nueva? | ✅ **No**: el alta **solo añade** la red; usar la red nueva exige su propio `wallet_switchEthereumChain` con aprobación (**DEC-39**). |

### Pendiente administrativo (no bloqueante)

| ID | Acción | Responsable |
|---|---|---|
| P-11 | Crear los repositorios `chrome-wallet` en **GitHub** y **GitLab.com** (organización `anlucorporations`, ramas `main` y `chrome-wallet-DSH`) y avisar para ejecutar `/push`. | Usuario |
| P-12 | Definir la estrategia de publicación frente a la historia divergente del remoto `codecrypto` (su `main`/`chrome-wallet-DSH` apuntan al commit `632d890`, sin ancestro común con la nueva historia). | Usuario (al llegar `/push`) |

---

## 6. Riesgos principales

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Mnemonic en claro en `chrome.storage.local` (modo sin contraseña) | Alta | Alto | **Riesgo aceptado (P-03)**; documentado como modo desarrollo. |
| Service Worker dormido pierde la cola de aprobaciones | Alta | Alto | **DEC-24**: puerto de larga vida + `chrome.alarms` + cola persistida `Record<approvalId, PendingRequest>` con reconciliación al arrancar y SW dueño único del plazo (RNF-08); al expirar, cierra la ventana, marca `expired` y responde `4001`. |
| Firma ciega: el usuario aprueba sin decodificar el calldata | Media | Alto | **DEC-22/DEC-23**: `eth_sign` fuera del catálogo (`4200`), decodificación del calldata, `verifyingContract`/`name` visibles y avisos de riesgo antes de firmar. |
| Bloqueo o exposición del RPC local | Media | Medio | `host_permissions` + **allowlist de CORS** en Anvil (RE-04, H-41); nunca `--http.corsdomain "*"` ni escucha fuera de `127.0.0.1`. |
| Fuga de clave privada hacia la página | Baja | Crítico | Nunca se envían claves ni el mnemonic a la página ni por `postMessage` (RNF-09/RNF-10, **DEC-40/DEC-41**); `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` (H-32). |
| **Semilla o clave privada retenida fuera de la UI tras el revelado** (portapapeles, memoria de la UI, capturas de pantalla) | Media | Alto | **DEC-37**: revelado de **30 s** con **ocultado por pérdida de foco**, **borrado del portapapeles** al ocultar si aún contiene la semilla, descarte del valor de la memoria de la UI, aviso in-product de que el revelado es vulnerable a capturas y test E2E que comprueba que el portapapeles no la conserva (P-20, ADT-09). |
| Numeración inconsistente del enunciado | Alta | Bajo | Renumeración `RF-01..RF-50` (DEC-01) y conteos sincronizados en la tabla §2 (H-03). |
| **Alcance y plazo:** el MVP (40 RF Must) no cabe en el presupuesto de la asignatura | **Alta** | **Alto** | **MVP por hitos (DEC-26/DEC-27)**: los 10 RF Should pasan a un ciclo posterior; estimación por hitos en `plan_desarrollo.md` (sustituye al «~40 h»); tabla «MVP vs ciclo posterior» (§9). |
| Combinar Playwright + Forge + Vitest en solitario | Media | Medio | Los tests se construyen en cada ciclo, no al final; el contrato EIP-712 es mínimo. |
| Historia local y remota sin ancestro común en `codecrypto` | Alta | Medio | Definir la estrategia de publicación (solo historia git) antes del primer `/push` (**P-12**), sin reutilizar código (DEC-09). |

---

## 7. Próximos pasos

1. ~~Confirmar el cierre de la Fase 1 y pasar a la Fase 2~~ ✅ **hecho**.
2. ~~Ejecutar `/auditar`~~ ✅ **hecho**: `INFORME_OPTIMIZACION_V1.md` (42 hallazgos, 27 descartados).
3. ~~Cerrar la remediación documental de la Fase 2 (`INFORME_OPTIMIZACION_V1.md`, 42 hallazgos)~~ ✅ **hecho**.
4. ~~Ejecutar `/casos_uso` (Gherkin/EARS + matriz `E-xx → RF-xx → CU → test`)~~ ✅ **hecho**: **36 CU** en `casos_uso/casos_uso.md`.
5. ~~Auditar los casos de uso, resolver `P-17`/`P-18`/`P-19` y aplicar la remediación~~ ✅ **hecho**: `casos_uso/AUDITORIA_CASOS_USO_V1.md` (**30 hallazgos**) con remediación aplicada (**DEC-27..DEC-36**, `requerimientos.md` v1.5).
6. ~~Ejecutar `/graficos` (Mermaid/SVG de los 36 CU auditados)~~ ✅ **hecho**: `casos_uso/diagramas.md` (**12 diagramas**).
7. ~~Ejecutar `/documento_tecnico` (arquitectura y especificación técnica)~~ ✅ **hecho**: `documento_tecnico.md` (66 módulos, 20 ADR, 15 diagramas).
8. ~~Ejecutar `/auditar_documento` (auditoría del documento técnico)~~ ✅ **hecho**: `AUDITORIA_DOCUMENTO_TECNICO_V1.md` (**33 hallazgos ADT-01..ADT-33**), con **P-20/P-21/P-22** resueltas y remediación aplicada (`requerimientos.md` v1.6, `documento_tecnico.md` y **DEC-37..DEC-44**).
9. ~~Responder el Bloque 4 de identidad visual~~ ✅ **hecho** (P-13/P-14/P-15).
10. ~~**Cerrar la Fase 2:** ejecutar el **veredicto de reevaluación** que confirme el cierre de los 42 hallazgos, los 30 ACU y los 33 ADT~~ ✅ **hecho**: `VEREDICTO_FASE2_V1.md` v1.0 emitido (❌ Fase 2 NO cerrada en ese momento: 0 abiertos · 27 cerrados · 8 parciales · **12 residuales `R-01..R-12`** y **18 contradicciones**) y **hoy en v1.3**: ✅ **corpus consistente y apto para autorizar la Fase 3**, con **0 residuales abiertos**, **18/18 contradicciones resueltas** y **`VR-01..VR-10` cerrados**.
11. ~~**Ejecutar el plan de cierre de los residuales (`VEREDICTO_FASE2_V1.md` §5)**: bloques 1 (consistencia de valores), 2 (verificabilidad de criterios) y 3 (memoria y metadatos), y repetir la verificación por `grep`~~ ✅ **hecho**: los **12 residuales `R-01..R-12` cerrados** (el último, **`R-09`**, con **DEC-45/DEC-46**) y **18/18 contradicciones resueltas**; `VEREDICTO_FASE2_V1.md` **v1.2 → v1.3**.
12. ~~**Última pasada de consistencia** solicitada por el usuario (barrido final del corpus con `grep`: citas, versiones, conteos y `\uFFFD`) antes de dar por cerrada la Fase 2~~ ✅ **hecha** (`VR-01..VR-10` cerrados; `VEREDICTO_FASE2_V1.md` v1.3).
13. Crear los repositorios de GitHub y GitLab.com (P-11).
14. ~~Pasar a la **Fase 3 – Desarrollo** con `/plan_desarrollo` (estimación por hitos y MVP de **40 Must**, DEC-26)~~ ✅ **hecho**: `plan_desarrollo.md` v1.0 con **H1..H6** + **C1..C10** y el MVP de **40 RF Must**.
15. ~~Ejecutar **H1 — Andamiaje, build MV3 y arnés de pruebas**~~ ✅ **hecho (2026-09-11)**: **H1 ✅ COMPLETADO** — 6 entradas + `dist/manifest.json` con un solo `npm run build`, ID de extensión **`oiahebaliobknoeeonhgaacapjcpgblo`**, batería en verde (tsc `-b` exit 0 strict · Vitest **47** · Playwright **4** · Forge **7** con `--root contracts` · `lint:prohibited` exit 0 · `check:mermaid` **27/27**) y evidencia en `RepoTecnico/evidencia/H1/` (`ACTA_H1.md`). **5 desviaciones aceptadas** registradas en **DEC-47..DEC-51** y en `plan_desarrollo.md` §3.1.10.
16. **Hito actual — H2 «Cartera, cuentas y recuperación»** (`plan_desarrollo.md` §3.2): RF-01..RF-05, RF-07, RF-09..RF-11 y RF-33/RF-50 (11 RF Must) con M8..M13, M28/M29, M33/M34, M39..M41, M46 y M57..M63. **Criterio de cierre:** crear/importar cartera (12 palabras), derivar las 5 cuentas HD y añadir la siguiente, importar por clave privada, recibir con QR, revelar/exportar con higiene de 30 s, reset con confirmación destructiva y persistencia al reabrir el popup, con Anvil mostrando los saldos; specs y E2E del hito en verde y evidencia en `RepoTecnico/evidencia/H2/`.
17. Tras H2: **H3** (provider, conexión y lectura) → **H4** (firma, aprobación y transacciones) → **H5** (redes y observabilidad) → **H6** (identidad, accesibilidad y entrega); los **10 RF Should** quedan en el ciclo posterior **C1..C10**.

---

## 8. Criterios de aceptación por fase

### 8.1 Fase 1 — Concepto ✅ CUMPLIDOS

- [x] Extracción de RF / RNF / RT / RE del enunciado fuente (`requerimientos.md` **v1.9**: 50 RF (**40 Must / 10 Should**) / 25 RNF / 13 RT / 4 RE, desviaciones **D-01..D-13**).
- [x] `requerimientos.md`, `diccionario_datos.md` y `entornos_globales.md` creados y consolidados.
- [x] `estado_proyecto.md` con el resumen de la fase.
- [x] Bloque 1, Bloque 1-bis, Bloque 2 y Bloque 3 de la entrevista respondidos (P-01..P-10).
- [x] Repositorio local inicializado con `main` y `chrome-wallet-DSH` y los 3 remotos configurados.
- [x] Decisión de alcance cerrada: red única Anvil, sin GCP, reconstrucción desde cero (DEC-09).
- [ ] Repositorios de GitHub y GitLab.com creados por el usuario (P-11, no bloquea la Fase 2).

### 8.2 Fase 2 — Auditoría ✅ **CERRADA** (veredicto v1.3: 0 residuales abiertos, 0 contradicciones y 0 defectos de consistencia; corpus consistente y apto para autorizar la Fase 3)

- [x] Auditoría ejecutada en 3 fases (7 revisores + 7 verificadores adversariales + síntesis): **42 hallazgos** (2 CRITICA · 14 ALTA · 21 MEDIA · 5 BAJA) y **27 descartados**, en `INFORME_OPTIMIZACION_V1.md`.
- [x] Quick wins documentales aplicados en `entornos_globales.md` v1.6, `identidad_visual.md` v1.2 y esta memoria: H-03, H-04, H-05, H-07 (dueño del plazo), H-15, H-20, H-24, H-29, H-33, H-34, H-36, H-41 y H-02 (permisos).
- [x] Decisiones de remediación del usuario registradas: **DEC-21..DEC-26** (auditoría de Fase 1), **DEC-27..DEC-36** (auditoría de los casos de uso), **DEC-37..DEC-44** (auditoría del documento técnico: **P-20/P-21/P-22** y **D-J..D-Q**) y **DEC-45/DEC-46** (cierre de `R-09`).
- [x] **Criterios de aceptación por requisito** (H-01): los **50 RF** y los 13 RT con criterio y evidencia en `requerimientos.md` **v1.9** (§1, §3 y Anexo A §9), con **`CA-RF-50`** (30 s, pérdida de foco, portapapeles y guarda de sesión de dApp activa), **`CA-RF-23`** (alta sin activación), **`CA-RF-35`** (ventana global única), **`CA-RF-39`** (permiso opcional), **`CA-RF-05`/`CA-RF-06`/`CA-RF-11`** (guardas de estado de `R-09`) y **`CA-RT-04`**/**`CA-RT-13`** (UUID literal y `key` fija).
- [x] **Casos de uso generados** (**36 CU**, `casos_uso/casos_uso.md` v1.5) y **auditados** (`casos_uso/AUDITORIA_CASOS_USO_V1.md` v1.0, **30 hallazgos**) con su remediación aplicada.
- [x] **Matriz de trazabilidad** `E-xx → RF-xx → CU → test` con los **40 Must** cubiertos (H-01/H-05/H-06/H-14): declarada en `requerimientos.md` §1/§1.0/§9.4 y materializada en la matriz de `casos_uso/casos_uso.md` v1.5 (40/40 Must con CU y evidencia; §2, §5 y §7 idénticas entre sí).
- [x] **Gráficos de los casos de uso** generados: `casos_uso/diagramas.md` **v1.2** con **12 diagramas** (9 `sequenceDiagram`, 2 `flowchart` y 1 `stateDiagram-v2`).
- [x] **`documento_tecnico.md` v1.4** redactado (66 módulos, 20 ADR, 15 diagramas) y **auditado** con `/auditar_documento`: `AUDITORIA_DOCUMENTO_TECNICO_V1.md` **v1.0** con **33 hallazgos** (ADT-01..ADT-33), decisiones **D-H..D-U** y **P-20/P-21/P-22** resueltas.
- [x] **Remediación de la auditoría del documento técnico aplicada**: hallazgos **ADT-04, ADT-06, ADT-09, ADT-12, ADT-14, ADT-19, ADT-20, ADT-22, ADT-25 y ADT-30** cerrados en `requerimientos.md` **v1.7** (conteos verificados y **sin cambios en v1.9**: **50 RF = 40 Must + 10 Should · 25 RNF · 13 RT · 4 RE**).
- [x] **Veredicto de reevaluación cerrado:** el revisor independiente confirmó **0 hallazgos abiertos**, **27 cerrados** y **8 parciales**; ejecutado el plan de cierre, quedan **0 residuales abiertos** (los **12 `R-01..R-12` cerrados**, `R-09` con **DEC-45/DEC-46**) y **18/18 contradicciones resueltas**: `VEREDICTO_FASE2_V1.md` **v1.2 → v1.3**.
- [x] **Última pasada de consistencia** del corpus ✅ **hecha**: cerró los **10 defectos residuales `VR-01..VR-10`** (permisos, catálogo de eventos, constantes, tabla de errores, modelo de ventana retirado, afirmación no falsable, clave canónica, formas de evidencia, metadatos de diagramas y mojibake) y `VEREDICTO_FASE2_V1.md` **v1.3** (§7) declara el **corpus consistente y apto para autorizar la Fase 3**, con **0 `U+FFFD`** y **0 mojibake**; la **Fase 2 queda cerrada**.

### 8.3 Fase 3 — Desarrollo 🚧 **EN CURSO** (H1 ✅ completado el 2026-09-11; hito actual **H2**)

**H1 — Andamiaje, build MV3 y arnés de pruebas: ✅ COMPLETADO (2026-09-11).** Definición de terminado de `plan_desarrollo.md` §3.1.9, verificada con la batería real (§3.1 de esta memoria):

- [x] **Código:** los módulos de H1 (`manifest.ts`, `background.ts` y `background/**`, `inject/**`, `content-script.ts`, `popup/`, `connect/`, `notification/`, `shared/`, `styles/`) existen con su cabecera `M-xx`; `npx tsc -b` **exit 0** con `strict: true` (RNF-13/`CA-RT-08`).
- [x] **Pruebas:** Vitest **47 passed / 4 ficheros**, Playwright **4 passed** (`01-onboarding.spec.ts`) y Forge **7 passed** con `--root contracts` (`CA-RT-07`). *(La cobertura de ramas de RNF-17 con umbrales se activa en H2..H5, cuando existen los módulos cubribles.)*
- [x] **Evidencia:** `RepoTecnico/evidencia/H1/` con los logs de todos los comandos, `manifest-2026-09-11.json`, `01-onboarding-2026-09-11.png` y `ACTA_H1.md`.
- [x] **Memoria:** esta memoria en **v2.0** (fase, decisiones **DEC-47..DEC-51**, tabla §2, comandos verificados y próximos pasos) y corpus corregido (`plan_desarrollo.md` v1.1, `documento_tecnico.md` v1.5, `entornos_globales.md` v2.0, `identidad_visual.md` v1.5, `requerimientos.md` v1.9).
- [x] **Puerta de comandos:** `npm run build` **exit 0** (6 entradas + manifest), `npx tsc -b` **exit 0**, `npm run test` **47**, `npm run test:e2e` **4**, `npm run lint:prohibited` **exit 0**, `npm run forge:test` **7** y `npm run check:mermaid` **27/27** (`CA-RT-07`).
- [x] **Artefacto cargable:** `dist/` con **6 entradas** + `manifest.json`, ID de extensión **`oiahebaliobknoeeonhgaacapjcpgblo`**, popup **380×600** en estado vacío y **0 errores** de consola y de badge (`CU-36`).
- [x] **Desviaciones aceptadas:** **DEC-47** (`chrome-extension://` prohibido en `matches`/`exclude_matches`), **DEC-48** (3 builds encadenados), **DEC-49** (tamaño explícito del `body`), **DEC-50** (Poppins en tres ficheros + licencias OFL), **DEC-51** (`forge test --root contracts`), documentadas en `plan_desarrollo.md` §3.1.10.
- [ ] **Pendiente por diseño (hitos posteriores), no bloquea H1:** `test.html` detectando el provider **en página real** → **H3** (`E2E: 07-provider.spec.ts`; en H1 se verifica sobre el stub en `windowContract.spec.ts`); build limpio **en Linux/WSL2** (RNF-15) y cobertura con umbrales (RNF-17) → **H6**; los **10 RF Should** → ciclo posterior **C1..C10**.

**H2 — Cartera, cuentas y recuperación: 🚧 EN CURSO (siguiente hito).** Ver `plan_desarrollo.md` §3.2 y el punto 16 de §7.

---

## 9. Alcance del MVP vs ciclo posterior (H-34 / DEC-26 / P-17 / P-18)

| Bloque | Alcance | Momento |
|---|---|---|
| **MVP (obligatorio)** | **40 RF Must** (incluye **RF-50**) + los RNF y RT asociados (40 de los 50 RF). **No depende del badge** (P-17) | Fases 3-4 |
| **Ciclo posterior** | **10 RF Should**: RF-06, RF-12, RF-32, RF-34, **RF-38**, **RF-39**, RF-40, RF-44, RF-47 y RF-48 (según H-01; **lista canónica en `requerimientos.md` §4.5 «MVP (40 RF Must) vs ciclo posterior (10 RF Should)»**) | tras el MVP, si el presupuesto lo permite |

> **P-17:** RF-38 (badge) y RF-39 (notificaciones) permanecen en el ciclo posterior y **no se promociona ninguno**; el oráculo del caso central de la cola de aprobaciones (CU-16) es «**2 entradas `pending` en `truekeate_pending_requests` + 1 transacción en vuelo por cuenta**». **P-18:** RF-50 entra en el MVP Must como requisito de recuperación (D-13). **P-21/P-22 (DEC-38/DEC-39):** el MVP usa **una sola ventana global** de `notification.html` con cola y contador (RF-35) y el alta de red **no activa** la red (RF-23). **DEC-44:** el permiso `notifications` ligado a RF-39 es **opcional** y no forma parte del conjunto obligatorio del manifest.
> La estimación «~40 h» queda **retirada**: el cronograma se fija por **hitos** en `plan_desarrollo.md` (Fase 3), con el MVP Must como compromiso mínimo y los Should como alcance ampliable. Si el presupuesto se agota, el recorte ya está decidido por diseño y no se negocia a mitad de la Fase 4.
