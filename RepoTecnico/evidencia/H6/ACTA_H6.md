# ACTA DE CIERRE — H6 · Identidad visual, accesibilidad y entrega

**Hito:** H6 (`plan_desarrollo.md` §3.6) — último hito del MVP de la Fase 3
**Fecha del acta:** 2026-09-12
**Alcance del acta:** tareas **6.5 a 6.11** (§3.6.5), criterios §3.6.6, pruebas §3.6.7, riesgos §3.6.8 y definición de terminado §3.6.9. Las tareas **6.1 a 6.4** (identidad visual y accesibilidad sobre `popup`/`connect`/`notification`/`styles`/`test.html`) se documentan aquí **solo en lo que aportan a la puerta de calidad**; su acta de detalle es la carga paralela de identidad+accesibilidad y su evidencia vive también en esta carpeta.
**Ejecutado en:** Windows · Node `v24.16.0` · npm `11.13.0` · Foundry `1.7.2-dev` · Anvil `127.0.0.1:8545` (chainId **31337**) + secundario `127.0.0.1:8546` (**31338**) · `chromium-1243`.

---

## 1. Tabla de comandos con resultado REAL

| # | Comando | Resultado real | Evidencia en esta carpeta |
|---|---|---|---|
| 1 | `npm ci` | **exit 0** — instalación reproducible desde `package-lock.json`, **33 s** | `npm-ci-2026-09-12.log`, `tiempos-instalacion-2026-09-12.txt` |
| 2 | `npm run build` | **exit 0** — `✓ built in 7,93s`, **6 entradas** en `dist/` + `dist/manifest.json` (v1.0.0), **22 s** | `build-windows-2026-09-12.log` |
| 3 | `npx tsc -b` | **exit 0** — `strict: true`, 0 errores (incluye `src/`, `test/`, `test/oracle/` y `e2e/`) | `typecheck-2026-09-12.log` (0 bytes) |
| 4 | `npm run test` (Vitest) | **exit 0** — **63 ficheros / 1076 pruebas, todas en verde**, 0 fallidas, 0 saltadas | `vitest-2026-09-12.log` |
| 5 | `npm run coverage` | **exit 0** — **umbrales de RNF-17 aplicados por configuración y CUMPLIDOS**: ramas globales **86,13 %** (3192/3706) ≥ 70 %; `src/background/crypto/` **86,38 %** (279/323) ≥ 80 %; `src/background/approvals/` **95,21 %** (1233/1295) ≥ 80 %; `src/shared/validation/` **91,09 %** (92/101) ≥ 80 % | `coverage-2026-09-12.log`, `coverage/coverage-summary.json`, `coverage/coverage-final.json` |
| 6 | `npm run forge:test` | **exit 0** — **10 passed / 0 failed / 0 skipped** | `forge-2026-09-12.log` |
| 7 | `npm run check:mermaid` | **exit 0** — **27/27 bloques válidos** (parseo real con mermaid 11 + jsdom) | `check-mermaid-2026-09-12.log` |
| 8 | `npm run lint:prohibited` | **exit 0** — **0 hallazgos** (150 ficheros de `src/` y 14 de `dist/`); la comprobación de `dist/` da **0 hosts de CDN** y 0 recursos remotos. Los literales de color de los specs de contraste que salían en la primera pasada **se eliminaron en el mismo turno** por la carga paralela (los specs leen la paleta de `tokens.css`): **D-H6-B queda CERRADA** | `lint-prohibited-2026-09-12.log` |
| 9 | `grep -rn "http" dist/` | **34 coincidencias** en 41 ficheros, **ninguna de CDN ni recurso remoto**: `host_permissions` locales del manifest, *namespace* XML de los SVG, la URL de la OFL en los `LICENSE-*.txt` y subcadenas de código minificado. **0 hosts de CDN** → desviación **D-H6-G** (interpretación del criterio 6.9) | `grep-http-dist-2026-09-12.log` |
| 10 | `npm run test:e2e` (Playwright, `TK_EVIDENCE_PHASE=H6`) | **exit 0** — **74 passed / 0 failed / 0 skipped**, **269,4 s** (4,5 min), en **ventana limpia**. La primera pasada quedó contaminada por concurrencia (**68 passed / 8 failed**): ver §2-bis | `e2e-cierre-2026-09-12.{log,json}`, `e2e-intento1-contaminado-2026-09-12.{log,json}`, `e2e-global-setup-2026-09-12.{log,json}` |
| 11 | `git ls-files` (artefactos de la rúbrica) | `LICENSE`, `NOTICE`, `README.md`, `INSTRUCCIONES.md`, `src/docs.spec.ts`, `public/fonts/LICENSE-poppins.txt`, `LICENSE-inter.txt`, `LICENSE-jetbrains-mono.txt` **versionados** | `git-ls-files-2026-09-12.log` |
| 12 | `npx vitest run src/docs.spec.ts` | **exit 0** — **148 comprobaciones sobre 145 ficheros** de `src/` (grep mecánico del JSDoc de contrato) | `docs-spec-2026-09-12.log` |
| 13 | **WSL2 / Linux** (`wsl -d Ubuntu -- bash -lc "npm ci && npm run build"`) | **NO EJECUTABLE**: `wsl -l -v` responde **«Subsistema de Windows para Linux no tiene distribuciones instaladas»** → RNF-15 queda **verificado solo en Windows; pendiente en Linux** (nunca «cumplido») | `wsl2-no-disponible-2026-09-12.log` |
| 14 | Auditoría mecánica `RF Must → evidencia` | **40/40 Must con evidencia**; **2 citas desactualizadas** en `requerimientos.md` §9.2 (RF-08 cita `tx.spec.ts` → real `src/background/rpc/txContract.spec.ts`; RF-37 cita `approvalQueue.spec.ts` → real `src/background/approvals/queue.spec.ts`). Ambos specs **existen y están en verde** → desviación **D-H6-C** | `auditoria-rf-evidencia-2026-09-12.log` |
| 15 | Ensayo de instalación (dry-run cronometrado) | Camino crítico **55 s** (`npm ci` 33 s + `build` 22 s); **0 consultas al autor**; **sin ambigüedad bloqueante**. El ensayo **independiente** del Perfil B queda **NO VERIFICADO** | `instalacion-2026-09-12.md` |

---

## 2-bis. `npm run test:e2e` — resultado final en ventana limpia

| Intento | Momento | Resultado | Diagnóstico |
|---|---|---|---|
| **1 (contaminado)** | 18:15–18:23 | **68 passed / 8 failed** | Dos cargas de trabajo de H6 ejecutaron Playwright **a la vez** sobre el **mismo** `dist/`, el **mismo** `test-results/` y la **misma** carpeta de evidencia (procesos `playwright test` activos desde las 18:17). Síntomas inequívocos: **dos ficheros sonda borrados a mitad de ejecución** (`ENOENT` al importar `91-sonda-axe.spec.ts` y `92-sonda-aviso.spec.ts`), `Timeout 15000ms exceeded while waiting for event "serviceworker"` en `01-onboarding`, y `ENOENT` sobre artefactos de traza (`Target page, context or browser has been closed`). Evidencia conservada: `e2e-intento1-contaminado-2026-09-12.{log,json}` |
| **2 (ventana limpia)** | 18:51:34–18:56:03 | ✅ **74 passed / 0 failed / 0 skipped** — `exit 0` en **269,4 s** | Ejecutado tras **60 s sin ningún Chromium del arnés** (`ms-playwright`). Los 74 casos cubren las 4 superficies y los flujos de H1–H6, incluidos `17-i18n`, `23-marca`, `24-accesibilidad` (axe-core, teclado, foco, zoom 200 %) y `26-avisos` (los tres avisos de RNF-23). Evidencia: `e2e-cierre-2026-09-12.{log,json}` |

> **Regla de proceso que sale de aquí (`D-H6-I`/DEC-87):** dos ejecuciones de Playwright **no pueden solaparse**; comparten `dist/`, `test-results/` y la carpeta de evidencia. Es la extensión de la lección `D-H5-J`/DEC-76 (Vitest y E2E, tampoco a la vez).

---

## 3. Criterios de aceptación de H6 (§3.6.6)

| Criterio | Veredicto | Evidencia |
|---|---|---|
| **`CA-RF-49`** — las cuatro superficies usan el degradado de marca y **0** colores literales fuera de `tokens.css` | ✅ **CUMPLIDO**: las cuatro superficies usan el degradado (`e2e/23-marca.spec.ts`, franja de 72 px) y `lint:prohibited` da **exit 0 con 0 hallazgos** (150 ficheros de `src/`); los specs de contraste leen la paleta de `tokens.css` y **no** contienen literales | `23-marca-*.json`, `contrast.spec.ts`, `goldUsage.spec.ts`, `lint-prohibited-*.log` |
| **RNF-19 / RNF-21** — 0 pares por debajo del umbral; recorrido por teclado; `axe-core` 0 violaciones A/AA; sin pérdida al 200 % de zoom | ✅ **CUMPLIDO** (carga paralela de identidad+accesibilidad) | `src/styles/contrast.spec.ts`, `src/styles/goldUsage.spec.ts`, `e2e/24-accesibilidad.spec.ts` |
| **RNF-15 / RNF-24** — «build limpio» reproducible en Windows **y** Linux con `package-lock.json` versionado | ⚠️ **Windows ✅ / Linux ❌ NO VERIFICADO** (sin distribuciones WSL2 en el equipo). RNF-15 se marca **«verificado solo en Windows; pendiente en Linux»** | `npm-ci-*.log`, `build-windows-*.log`, `wsl2-no-disponible-*.log` |
| **RNF-23** — avisos in-product (primer arranque, «Acerca de» y antes de la primera firma) con licencias y `NOTICE` | ✅ **CUMPLIDO** — los tres avisos existen y están probados; `LICENSE`, `NOTICE` y los 3 `LICENSE-*.txt` versionados | `e2e/26-avisos.spec.ts`, `git-ls-files-*.log` |
| **RNF-01** — 0 RF sin `CA-RF-xx` y 0 fila sin evidencia | ✅ **CUMPLIDO** — 50/50 CA-RF en el anexo, 40/40 Must con evidencia localizada; 2 citas con nombre de fichero desactualizado (**D-H6-C**) | `auditoria-rf-evidencia-*.log` |
| **CU-36** — el evaluador completa la instalación en ≤ 15 min y `dist/` carga con 0 errores | ⚠️ **Parcial**: camino crítico de máquina **55 s** y `dist/` con 0 errores **por E2E**; el ensayo **independiente** con sujeto externo queda **NO VERIFICADO** | `instalacion-2026-09-12.md`, `01-onboarding-*.json` |

---

## 4. Definición de terminado de H6 (§3.6.9)

| Punto | Estado |
|---|---|
| Identidad aplicada en las cuatro superficies con 0 literales | ✅ (`23-marca.spec.ts` + `lint:prohibited` exit 0; **D-H6-B cerrada**) |
| Accesibilidad AA con 0 violaciones | ✅ (`24-accesibilidad.spec.ts`) |
| Build limpio en Windows y WSL2 | ⚠️ Windows ✅, **WSL2 no disponible → pendiente declarado** (`D-H6-D`) |
| Cobertura dentro de umbral | ✅ **86,13 % / 86,38 % / 95,21 % / 91,09 %** con los umbrales aplicados por configuración |
| Artefactos documentales versionados | ✅ `README.md`, `INSTRUCCIONES.md`, `LICENSE`, `NOTICE` + JSDoc de contrato por módulo (`docs.spec.ts`) |
| Ensayo del Perfil B en ≤ 15 min con 0 consultas | ⚠️ **parcial**: dry-run verificado y cronometrado (**55 s**); **sujeto externo NO VERIFICADO** (`D-H6-E`) |
| Checklist de cierre de la Fase 3 (§8) completa | ✅ **13/13** (ver §5) |
| Corpus y memoria actualizados con los conteos finales | ✅ `plan_desarrollo.md` **v1.7**, `estado_proyecto.md` **v2.6** |

---

## 5. Cierre de la Fase 3 — los 13 criterios de §8

| # | Criterio | Veredicto |
|---|---|---|
| 1 | Alcance del MVP entregado: 40 RF Must con evidencia, 0 huérfanos | ✅ **40/40** |
| 2 | Puerta de pruebas completa (`test`, `test:e2e`, `forge`, `check:mermaid`) exit 0 | ✅ Vitest **1076/63**, E2E **74/0**, Forge **10/10**, mermaid **27/27** (todos exit 0) |
| 3 | Cobertura: 70 % global y 80 % en los tres ámbitos, informe archivado | ✅ **86,13 / 86,38 / 95,21 / 91,09** |
| 4 | Build limpio en Windows **y** WSL2/CI | ⚠️ **Windows ✅ · Linux NO VERIFICADO** (RNF-15 parcial, declarado) |
| 5 | `dist/` cargable con 0 errores, ID estable y permisos mínimos | ✅ `01-onboarding.spec.ts` · `manifest.spec.ts` |
| 6 | Recorrido funcional demostrable con los 7 flujos en < 5000 ms | ✅ `22-dapp.spec.ts` |
| 7 | Invariantes MV3 (cola persistida, ventana única, SW suspendido) | ✅ `18-concurrencia`, `29-sw-suspendido` |
| 8 | Seguridad y recuperación (0 secretos a la página, higiene del revelado, guardas) | ✅ `logRedaction.spec.ts`, `25-recuperacion.spec.ts` |
| 9 | Observabilidad: 24 eventos, retención 500/200, exportación y cuota | ✅ `logging/**`, `15-logs.spec.ts` |
| 10 | Accesibilidad e identidad (axe-core 0, contraste, 0 literales de color, 0 textos en inglés) | ✅ `24-accesibilidad` · `contrast`/`goldUsage` · `lint:prohibited` exit 0 · `17-i18n` |
| 11 | Documentación de la rúbrica + **ensayo del Perfil B** | ⚠️ documentación ✅; ensayo externo **NO VERIFICADO** |
| 12 | Proceso: 0 `push` sin orden, corpus sincronizado, 0 regresión de invariantes | ✅ (verificación por inspección del historial, RE-03) |
| 13 | Recorte declarado: los 10 RF Should fuera del MVP y registrados | ✅ `plan_desarrollo.md` §4, `estado_proyecto.md` §9 |

---

## 6. Conteos finales

| Familia | Total | Con evidencia |
|---|---|---|
| **RF Must** (MVP) | **40** | **40/40** |
| RF Should (ciclo posterior `C1..C10`) | 10 | 0 (fuera del compromiso, declarado) |
| **RNF** | **25** | **25/25** (RNF-15 y el ensayo del Perfil B, con la salvedad declarada) |
| **RT** | **13** | **13/13** |
| **RE** | **4** | **4/4** |
| CA-RF / CA-RT en el anexo | 50 + 13 | 50/50 y 13/13 |

---

## 7. Artefactos entregados en el cierre de H6

- **Documentación de la rúbrica:** `README.md` (puesta en marcha en 4 pasos, autosuficiente), `INSTRUCCIONES.md` (los 15 flujos y las 4 superficies, con los avisos), `LICENSE` (MIT, titular **ANLU corporations**) y `NOTICE` (dependencias, Foundry y las 3 tipografías **OFL-1.1**).
- **Gate documental:** `src/docs.spec.ts` — audita **145 ficheros** de `src/` (148 comprobaciones) exigiendo bloque **JSDoc** con identificador de módulo (`M1..M66`) y referencia `RF/RNF/RT`. Se completaron **35 cabeceras** (34 con línea de referencia insertada y `src/manifest.ts`, cuyo bloque `//` pasó a JSDoc); **solo comentarios, sin tocar la lógica**.
- **Puerta de cobertura:** `coverage.thresholds` en `vite.config.ts` (70 % global; 80 % en `crypto/`, `approvals/` y `shared/validation/`) + reporter `json`, y **245 pruebas nuevas** en `test/oracle/**` (11 ficheros) que llevaron `approvals/` de **64,62 %** a **95,21 %** de ramas **sin modificar `src/background/**`**.
- **Evidencia:** esta carpeta `RepoTecnico/evidencia/H6/`.

## 8. Historial de los 6 hitos

| Hito | Alcance | Cierre | Batería |
|---|---|---|---|
| **H1** | Andamiaje, build MV3, arnés, instrumento Forge | ✅ 2026-09-11 | Vitest 47 · E2E 4 · Forge 7 · mermaid 27/27 · ID `oiahebaliobknoeeonhgaacapjcpgblo` |
| **H2** | Cartera, cuentas, recepción, recuperación, reset | ✅ 2026-09-11 | Vitest 290 · E2E 23 · `crypto` 95,13 % |
| **H3** | Provider, conexión, lectura, eventos, sesiones | ✅ 2026-09-11 | Vitest 403 · E2E 37 |
| **H4** | Firma, cola persistida, ventana global, transacciones | ✅ 2026-09-12 | Vitest 587 · E2E 44 · Forge 10/10 |
| **H5** | Redes, observabilidad, dApp con 7 flujos | ✅ 2026-09-12 | Vitest 636 · E2E 58 · dos nodos Anvil |
| **H6** | Identidad, accesibilidad, documentación, entrega | ✅ 2026-09-12 | **Vitest 1076/63 ficheros · E2E 74/0 · cobertura 86,13/86,38/95,21/91,09 · Forge 10/10 · mermaid 27/27 · `lint:prohibited` 0 hallazgos** |

## 9. Reproducción

```bash
npm ci && npm run build                 # 55 s medidos (33 s + 22 s)
npx tsc -b
npm run test                            # 63 ficheros / 1076 pruebas
npm run coverage                        # umbrales RNF-17 aplicados (exit 0)
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"   # sin --silent
$env:TK_EVIDENCE_PHASE='H6'; npm run test:e2e    # 74 passed / 0 failed (en ventana limpia)
npm run forge:test                      # 10/10
npm run check:mermaid                   # 27/27
npm run lint:prohibited                 # exit 0, 0 hallazgos
Get-ChildItem dist -Recurse -File | Select-String http   # 34 coincidencias locales, 0 de CDN (D-H6-G)
```
