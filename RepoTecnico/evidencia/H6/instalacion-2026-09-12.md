# Ensayo de instalación (Perfil B) — 2026-09-12

**Hito:** H6 — Identidad visual, accesibilidad y entrega (tarea **6.10** de `plan_desarrollo.md` §3.6.5)
**Criterio:** `CU-36` / §3.6.6 — «el evaluador completa la instalación en **≤ 15 min** y `dist/` carga con **0 errores**», siguiendo **solo** `README.md` e `INSTRUCCIONES.md` y con **0 consultas al autor**.
**Resultado declarado:** ⚠️ **PARCIALMENTE VERIFICADO** — la parte mecánica está **verificada y cronometrada**; el ensayo **independiente** del Perfil B (persona externa que no conoce el proyecto) queda **NO VERIFICADO**, con el motivo y el alcance exacto al final de este documento.

---

## 1. Método

- **No** se ha usado ningún conocimiento previo no publicado: los pasos se han ejecutado **literalmente** en el orden en que aparecen en `README.md` §1 (pasos 0 a 4) y, para el uso, en el orden de `INSTRUCCIONES.md` §1.
- Cada comando se ha ejecutado tal cual está escrito, **sin** completar nada de memoria.
- Se han cronometrado con `System.Diagnostics.Stopwatch` los pasos que consumen tiempo de máquina.
- Se ha comprobado **cada afirmación verificable** de los dos documentos contra el repositorio (tabla §3).
- Entorno de la ejecución: **Windows**, Node `v24.16.0`, npm `11.13.0`, Foundry `1.7.2-dev`, `chromium-1243` (Playwright), Anvil `127.0.0.1:8545` chainId `31337`.
- Fecha de la ejecución: **2026-09-12**.

---

## 2. Paso a paso ejecutado (cronometrado)

| # | Paso del README | Comando ejecutado | Resultado real | Tiempo |
|---|---|---|---|---|
| 0 | Requisitos | `node -v`, `npm -v`, `anvil --version`, `chrome://version` | `v24.16.0`, `11.13.0`, `anvil 1.7.2-dev`, Chromium ≥ 114 ✔ | — |
| 1 | Instalar dependencias | `npm ci` | **exit 0**; instalación reproducible desde `package-lock.json` (aviso informativo de `npm audit`, no bloqueante) | **33 s** |
| 2 | Compilar el paquete | `npm run build` | **exit 0**; `✓ built in 7,93s`; `dist/manifest.json` generado (versión 1.0.0) | **22 s** |
| 3 | Cargar la extensión | `chrome://extensions` → Modo de desarrollador → *Cargar descomprimida* → `dist/` | **verificado por automatización equivalente** (ver §5): la suite `01-onboarding.spec.ts` carga `dist/` en Chromium con **0 errores** de consola y **0** en el badge, y descubre el ID estable | — |
| 4 | Usar la wallet | `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"` + `npm run dev` → `http://localhost:5174/test.html` | Anvil responde (`cast chain-id` = **31337**) y la dApp se sirve en el puerto **5174** | — |

**Tiempo de máquina medido del camino crítico (paso 1 + paso 2): 55 s** (33 s + 22 s). Es el único tramo que un evaluador no puede acelerar; el resto es lectura y tres clics en `chrome://extensions`.

**Contenido de `dist/` al terminar** (16 ficheros): las **6 entradas** obligatorias —`index.html`, `connect.html`, `notification.html`, `background.js`, `content-script.js`, `inject.js`—, `manifest.json`, los *bundles* de página (`index.js`, `connect.js`, `notification.js`), sus mapas de origen, `chunks/`, `assets/`, `fonts/` e `icons/`+`brand/`.

---

## 3. Verificación de las afirmaciones de los documentos

Cada fila se comprobó contra el repositorio (no contra la memoria del autor):

| Afirmación del documento | Comprobación | Resultado |
|---|---|---|
| «Node ≥ 20» | `node -v` = `v24.16.0` | ✔ |
| «Foundry ≥ 1.0.0 y < 2.0.0» | `anvil --version` = `1.7.2-dev` | ✔ |
| «Chrome/Edge ≥ 114» | `src/manifest.ts` declara `minimum_chrome_version: '114'` | ✔ |
| «`npm run build` produce las 6 entradas + `manifest.json`» | listado real de `dist/` | ✔ |
| «el build falla si falta una entrada o la `key`» | `manifestPlugin()` de `vite.config.ts` lanza en ese caso | ✔ |
| «ID de extensión `oiahebaliobknoeeonhgaacapjcpgblo`» | `EXTENSION_ID` derivado de la `key` fija del manifest, verificado en los E2E | ✔ |
| «tamaños 380×600 / 420×650 / 420×640» | tokens `--tk-popup-*`, `--tk-connect-*`, `--tk-notification-*` de `src/styles/tokens.css` | ✔ |
| «Anvil: `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"`, sin `--silent`» | `anvil --help` expone `--allow-origin`, `--host`, `--port`, `--chain-id`; `cast chain-id` responde `31337` | ✔ |
| «la dApp se sirve en el puerto 5174» | `vite.config.ts`: `server: { host: '127.0.0.1', port: 5174, strictPort: true }` y `webServer` de `playwright.config.ts` apunta a `http://localhost:5174/test.html` | ✔ |
| «los 4 comandos de la puerta de calidad» | `package.json` declara `test`, `test:e2e`, `forge:test` y `lint:prohibited` | ✔ |
| «`npm run coverage` falla si no se cumplen los umbrales» | `coverage.thresholds` declarado en el bloque `test` de `vite.config.ts` (70 % global, 80 % en los 3 ámbitos) | ✔ |
| «las tipografías se sirven del propio paquete, con licencia OFL-1.1» | `public/fonts/*.woff2` + `LICENSE-{poppins,inter,jetbrains-mono}.txt` versionados (`git ls-files`) | ✔ |
| «`LICENSE` (MIT, ANLU corporations) y `NOTICE`» | ambos ficheros existen y están versionados | ✔ |
| «la extensión funciona sin Anvil» | `4900`/«desconectado» es el estado previsto por RNF-07 cuando el nodo no responde | ✔ |

---

## 4. Incidencias encontradas al seguir los documentos

1. **`grep -rn "http" dist/` no da 0.** Siguiendo al pie de la letra el criterio 6.9 del plan, el comando devuelve **34 coincidencias** en 41 ficheros. **Ninguna es una URL de CDN ni un recurso remoto**: son (a) los `host_permissions` **locales** del manifest (`http://127.0.0.1:8545/*`, `http://localhost:8545/*`), exigidos por RT-04; (b) el *namespace* XML de los SVG de marca (`http://www.w3.org/...`); (c) la URL de la licencia OFL dentro de los tres `LICENSE-*.txt`; y (d) subcadenas de código minificado (`.map`/`.js`). La comprobación específica de CDN (**lista cerrada de hosts + patrones de recurso remoto**) la hace `npm run lint:prohibited` sobre `dist/`: **0 hallazgos de CDN**. Se registra como desviación **D-H6-G** en `plan_desarrollo.md` §3.6.10 para que el criterio se lea como «0 URLs de CDN», no como «0 apariciones de la subcadena `http`».
2. **Foundry en el `PATH`.** El README avisa de que en Windows `%USERPROFILE%\.cargo\bin` debe estar en el `PATH`; sin esa línea, `anvil` no se encuentra y el paso 4 falla. La advertencia ya está presente, así que no bloqueó el ensayo, pero es el único requisito cuya falta **no** se detecta en el paso 0 con un mensaje propio.
3. **La franja de «Acerca de» no aparece en el README.** Es información de uso, no de instalación; está en `INSTRUCCIONES.md` §18.1, que es donde un evaluador la busca. No se considera defecto.

Ninguna incidencia bloqueó la instalación. **Consultas al autor durante el ensayo: 0** (ningún paso exigió información que no estuviera en `README.md` o `INSTRUCCIONES.md`).

---

## 5. Qué queda NO VERIFICADO (declaración honesta)

Este ensayo **no sustituye** al del Perfil B, y se declara así de forma explícita:

| Punto del criterio 6.10 | Estado | Motivo |
|---|---|---|
| «un evaluador **sin conocimiento previo**» | ❌ **NO VERIFICADO** | Quien ha ejecutado el ensayo es el **autor del proyecto** y de los dos documentos: no puede simular desconocimiento. Un ensayo válido exige una persona externa. |
| «en **≤ 15 min**» | ⚠️ **parcial** | El tramo de máquina está medido (**55 s**) y es muy inferior al presupuesto; el tiempo de **lectura humana** de `README.md` + `INSTRUCCIONES.md` y de los clics en `chrome://extensions` **no se ha medido**, porque no es medible sin un sujeto externo. |
| «**0 consultas al autor**» | ⚠️ **débil** | Se cumple en la ejecución, pero la garantía es débil por el mismo motivo: el autor no necesita preguntarse nada. La evidencia fuerte es que **cada paso del README resolvió sin información externa** |
| «**0 errores** en consola y badge» | ✅ **verificado por automatización** | `e2e/01-onboarding.spec.ts` carga `dist/` en Chromium real, descubre el ID desde el Service Worker y asserta 0 errores de consola y 0 en el badge; `e2e/24-accesibilidad.spec.ts` añade `axe-core` con 0 violaciones A/AA |
| «instala y arranca» | ✅ **verificado** | `npm ci` + `npm run build` exit 0 desde cero y `dist/` con las 6 entradas + manifest |

**Recomendación para cerrar el punto:** que una persona que **no** haya participado en el proyecto ejecute los 4 pasos del `README.md` con un cronómetro, y registre (a) el tiempo total hasta ver el popup en estado vacío, (b) el número de consultas al autor y (c) cualquier paso que haya tenido que interpretar. El hueco de este ensayo es **de sujeto**, no de procedimiento.
