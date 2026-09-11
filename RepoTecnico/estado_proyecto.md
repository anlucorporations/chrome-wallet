# 📌 Estado del Proyecto — TrueKeate Wallet

> Memoria de trabajo del proyecto. Se lee al inicio de cada turno y se actualiza de forma incremental.

**Última actualización:** Fase 2 — Auditoría 🔄 **EN CURSO** (documentación de Fase 1 auditada y remediada — `INFORME_OPTIMIZACION_V1.md`, **42 hallazgos** —; **casos de uso generados** (36 CU, `casos_uso/casos_uso.md`) y **auditados** (`casos_uso/AUDITORIA_CASOS_USO_V1.md`, **30 hallazgos**) con su remediación aplicada; pendientes los gráficos y el documento técnico)
**Versión de este documento:** ✅ **v1.5**
**Fase actual:** **2 de 5 — Auditoría** (auditoría ejecutada y remediada; pendientes los gráficos de los casos de uso, el documento técnico y su auditoría)
**Comando para continuar:** `/graficos` (Fase 2) · `/documento_tecnico` · `/auditar_documento` · `/estado` · `/push`
**Rama de trabajo activa:** `chrome-wallet-DSH`
**Historial de cambios:** v1.4 decisiones DEC-21..DEC-26 y remediación de `INFORME_OPTIMIZACION_V1.md` · **v1.5 (esta versión)** decisiones **DEC-27..DEC-36** (P-17, P-18, P-19 y D-A..D-G), `requerimientos.md` **v1.5** con **50 RF (40 Must / 10 Should)** y desviaciones **D-01..D-13**, y alta de los artefactos de casos de uso (**36 CU**) y de su auditoría (**30 hallazgos**).

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
| `requerimientos.md` | ✅ v1.5 | **50 RF (40 Must / 10 Should)**, 25 RNF, 13 RT y 4 RE, actores, desviaciones **D-01..D-13**, riesgos, entrevista cerrada y **criterio de aceptación + evidencia por RF/RT** (H-01/DEC-25). Incorpora **RF-50** (revelar/exportar semilla y claves privadas con confirmación explícita, D-13), la **caducidad de sesión de dApp** en RF-25 (D-B) y la **aprobación del cambio de red** en RF-22 (P-19). |
| `diccionario_datos.md` | ✅ v1.3 | Claves de storage, entidades, protocolo de mensajes y catálogo RPC/errores. Red única Anvil. Decisiones P-03..P-08 aplicadas. |
| `entornos_globales.md` | ✅ v1.5 | Entorno verificado, comandos, constantes, permisos de **mínimos privilegios**, política de versiones, 3 remotos, herramientas de prueba y GCP cerrado. |
| `identidad_visual.md` | ✅ v1.2 (aprobado, P-14) | **Anexo vinculante de diseño**: marca TrueKeate, paleta medida, degradados, tipografía, componentes, tokens CSS, **matriz de contraste cerrada** y criterios de accesibilidad (H-17). |
| `INFORME_OPTIMIZACION_V1.md` | ✅ v1 (Fase 2) | **Informe de auditoría de la Fase 2**: **42 hallazgos** (2 CRITICA · 14 ALTA · 21 MEDIA · 5 BAJA) y **27 descartados**, con plan de acción (QW-1..QW-16, M-1..M-18, RM-1..RM-7) y criterios de aceptación. |
| `estado_proyecto.md` | ✅ v1.5 (este archivo) | Memoria de trabajo. |
| `casos_uso/casos_uso.md` | ✅ v1.1 (Fase 2) | **36 casos de uso** (Gherkin/EARS) con fichas completas, flujos alternativos y de excepción, criterios con evidencia y matriz de trazabilidad `E-xx → RF-xx → CU → test`. Los **gráficos Mermaid/SVG** quedan pendientes. |
| `casos_uso/AUDITORIA_CASOS_USO_V1.md` | ✅ v1.0 (Fase 2) | **Auditoría de los 36 CU**: **30 hallazgos** (ACU-01..ACU-30: 2 CRITICA · 8 ALTA · 18 MEDIA · 2 BAJA), decisiones **D-A..D-G** y **P-17/P-18/P-19** resueltas; su remediación se aplica en `requerimientos.md` v1.5 y en esta memoria (**DEC-27..DEC-36**). |
| `documento_tecnico.md` | ⏳ Fase 2 | Arquitectura y especificación técnica. **Pendiente** (después se audita con `/auditar_documento`). |
| `plan_desarrollo.md` | ⏳ Fase 3 | Plan de desarrollo vertical por hitos y **estimación por hitos** (sustituye al «~40 h», H-34). |

---

## 3. Entorno verificado (resumen)

- Windows · Node `v24.16.0` · npm `11.13.0`.
- Foundry `anvil`/`forge`/`cast` **1.7.2-dev** instalados (`C:\Users\lucci\.cargo\bin`); rango soportado `>=1.0.0 <2.0.0` (`entornos_globales.md` §8).
- Repositorio git **inicializado**: `main` (commit raíz con la documentación) y rama de trabajo `chrome-wallet-DSH`.
- Remotos configurados: `origin` (GitHub, **no existe**), `gitlab` (GitLab.com, **no existe**), `codecrypto` (GitLab ANLU, **existe con el código previo, solo como referencia**).
- **El proyecto se reconstruye desde cero (DEC-09):** el código del remoto `codecrypto` **no se adopta, no se reutiliza y no se versiona**; `src/` se crea en la Fase 3 y el remoto solo se consulta. No hay ninguna vía de reutilización de ese código en este plan.
- RPC local en `127.0.0.1:8545` **detenido** (se levanta con `anvil` al probar, con allowlist de CORS).
- Sin `gh`/`glab` ni tokens; GCP fuera de alcance.
- Identidad visual **TrueKeate** incorporada: 6 activos originales en `TrueKeate/`, 4 iconos generados en `public/icons/` (versionados, no se regeneran en Linux) y 6 activos de marca en `public/brand/`.

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
| DEC-33 | `truekeate_logs` incorpora el campo **`event`** (enum de los **23 eventos** del catálogo de §2.2) **separado de `category`** (5 valores); se corrigen los CU que usaban categorías como eventos. | Cierra **ACU-04** (**D-D**). |
| DEC-34 | La **tabla cerrada de errores EIP-1193 (§2.1)** admite **varios mensajes por código** (uno por causa) y **todo error mostrado al usuario lleva `code`**. | Cierra **ACU-05** (**D-E**). |
| DEC-35 | Se define **`accountLabels: Record<indice, string>`** en `truekeate_settings` para etiquetar las **cuentas derivadas** (además del `label` de las importadas). | Cierra **ACU-06** (**D-F**). |
| DEC-36 | El **alta de red siempre solicita el permiso de host en runtime** (`chrome.permissions.request`), **también desde el popup**: no hay excepción por el origen de la UI. | Cierra **ACU-27** (**D-G**); coherente con RT-04 y `entornos_globales.md` §4. |

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
| P-14 | Sistema de diseño | ✅ **Aprobado tal cual** (`identidad_visual.md`, hoy v1.2). |
| P-15 | Iconos pequeños | ✅ **Aprobada** la variante simplificada para 16/32 px. |

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
| Fuga de clave privada hacia la página | Baja | Crítico | Nunca se envían claves por `postMessage` (RNF-09/RNF-10); `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` (H-32). |
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
6. Ejecutar `/graficos` (Mermaid/SVG de los 36 CU auditados); **pendiente**.
7. Ejecutar `/documento_tecnico` (arquitectura y especificación técnica); **pendiente**.
8. Ejecutar `/auditar_documento` (auditoría del documento técnico); **pendiente**.
9. ~~Responder el Bloque 4 de identidad visual~~ ✅ **hecho** (P-13/P-14/P-15).
10. Crear los repositorios de GitHub y GitLab.com (P-11).
11. Pasar a la **Fase 3 – Desarrollo** con `/plan_desarrollo` (estimación por hitos y MVP de **40 Must**, DEC-26).

---

## 8. Criterios de aceptación por fase

### 8.1 Fase 1 — Concepto ✅ CUMPLIDOS

- [x] Extracción de RF / RNF / RT / RE del enunciado fuente (`requerimientos.md` **v1.5**: 50 RF (**40 Must / 10 Should**) / 25 RNF / 13 RT / 4 RE, desviaciones **D-01..D-13**).
- [x] `requerimientos.md`, `diccionario_datos.md` y `entornos_globales.md` creados y consolidados.
- [x] `estado_proyecto.md` con el resumen de la fase.
- [x] Bloque 1, Bloque 1-bis, Bloque 2 y Bloque 3 de la entrevista respondidos (P-01..P-10).
- [x] Repositorio local inicializado con `main` y `chrome-wallet-DSH` y los 3 remotos configurados.
- [x] Decisión de alcance cerrada: red única Anvil, sin GCP, reconstrucción desde cero (DEC-09).
- [ ] Repositorios de GitHub y GitLab.com creados por el usuario (P-11, no bloquea la Fase 2).

### 8.2 Fase 2 — Auditoría 🔄 EN CURSO

- [x] Auditoría ejecutada en 3 fases (7 revisores + 7 verificadores adversariales + síntesis): **42 hallazgos** (2 CRITICA · 14 ALTA · 21 MEDIA · 5 BAJA) y **27 descartados**, en `INFORME_OPTIMIZACION_V1.md`.
- [x] Quick wins documentales aplicados en `entornos_globales.md` v1.5, `identidad_visual.md` v1.2 y esta memoria: H-03, H-04, H-05, H-07 (dueño del plazo), H-15, H-20, H-24, H-29, H-33, H-34, H-36, H-41 y H-02 (permisos).
- [x] Decisiones de remediación del usuario registradas: **DEC-21..DEC-26** (auditoría de Fase 1) y **DEC-27..DEC-36** (auditoría de los casos de uso).
- [x] **Criterios de aceptación por requisito** (H-01): los **50 RF** y los 13 RT con criterio y evidencia en `requerimientos.md` v1.5 (§1, §3 y Anexo A §9), con **`CA-RF-50`** nuevo en Gherkin y EARS.
- [x] **Casos de uso generados** (**36 CU**, `casos_uso/casos_uso.md` v1.1) y **auditados** (`casos_uso/AUDITORIA_CASOS_USO_V1.md` v1.0, **30 hallazgos**) con su remediación aplicada.
- [ ] **Matriz de trazabilidad** E-xx → RF-xx → CU → test con los **40 Must** cubiertos (H-01/H-05/H-06/H-14); depende de la remediación de los CU.
- [ ] Gráficos de los casos de uso (Mermaid/SVG); **pendientes**.
- [ ] `documento_tecnico.md` y su auditoría con `/auditar_documento`; **pendientes**.
- [ ] Veredicto de reevaluación: un revisor independiente confirma el cierre de los 42 hallazgos (§10.12 del informe) y de los **30 ACU** antes de declarar la Fase 2 cerrada.

---

## 9. Alcance del MVP vs ciclo posterior (H-34 / DEC-26 / P-17 / P-18)

| Bloque | Alcance | Momento |
|---|---|---|
| **MVP (obligatorio)** | **40 RF Must** (incluye **RF-50**) + los RNF y RT asociados (40 de los 50 RF). **No depende del badge** (P-17) | Fases 3-4 |
| **Ciclo posterior** | **10 RF Should**: RF-06, RF-12, RF-32, RF-34, **RF-38**, **RF-39**, RF-40, RF-44, RF-47 y RF-48 (según H-01; **lista canónica en `requerimientos.md` §4.5 «MVP (40 RF Must) vs ciclo posterior (10 RF Should)»**) | tras el MVP, si el presupuesto lo permite |

> **P-17:** RF-38 (badge) y RF-39 (notificaciones) permanecen en el ciclo posterior y **no se promociona ninguno**; el oráculo del caso central de la cola de aprobaciones (CU-16) es «**2 entradas `pending` en `truekeate_pending_requests` + 1 transacción en vuelo por cuenta**». **P-18:** RF-50 entra en el MVP Must como requisito de recuperación (D-13).
> La estimación «~40 h» queda **retirada**: el cronograma se fija por **hitos** en `plan_desarrollo.md` (Fase 3), con el MVP Must como compromiso mínimo y los Should como alcance ampliable. Si el presupuesto se agota, el recorte ya está decidido por diseño y no se negocia a mitad de la Fase 4.
