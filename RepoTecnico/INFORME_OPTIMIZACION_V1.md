# 📋 INFORME DE OPTIMIZACIÓN V1 — TrueKeate Wallet

> **Proyecto:** TrueKeate Wallet (extensión Chrome/Edge MV3 estilo MetaMask + dApp de pruebas)
> **Fase auditada:** Fase 1 — Concepto (especificación; **no existe código todavía**)
> **Documento auditado:** `RepoTecnico/` (8 documentos, ver §3)
> **Método:** auditoría en 3 fases — 7 revisores en paralelo (Fase 1) + 7 verificadores adversariales (Fase 2) + síntesis (Fase 3)
> **Fecha:** sesión de auditoría sobre la línea base declarada v1.3 / v1.4
> **Hallazgos consolidados:** 42 (2 CRITICA · 14 ALTA · 21 MEDIA · 5 BAJA) + 27 descartados en la Fase 2

---

## 1) Resumen ejecutivo

**Veredicto explícito: la especificación NO está apta, en su estado actual, para pasar a la Fase 3 de desarrollo.** Es una Fase 1 de calidad notable —alcance cerrado, decisiones del usuario documentadas, catálogo de datos y de errores muy detallado, riesgos declarados— pero arrastra **dos defectos críticos** y **catorce graves** que impedirían construir y verificar el producto sin inventar decisiones de diseño sobre la marcha.

Los dos motivos que por sí solos bloquean el paso a Fase 3 son:

1. **H-01 (CRITICA) — Ningún RF ni RT tiene criterio de aceptación.** Los 49 RF y los 13 RT se especifican con ID, enunciado, fuente y prioridad, pero sin precondición, resultado esperado ni evidencia. La única puerta de aceptabilidad del proyecto, RNF-01, exige cobertura Gherkin **solo de los Must**, de modo que los 10 RF Should quedan sin ningún mecanismo de aceptación previsto. La matriz RF ↔ CU ↔ test que RNF-01 nombra **no existe** (`casos_uso/` está marcado ⏳ Fase 2): hoy no es posible derivar el oráculo de los tests sin inventarlo.
2. **H-02 (CRITICA) — La aprobación no se puede resolver si el Service Worker se duerme.** El mapa de promesas `PendingApproval` es volátil (`diccionario_datos.md:220-230`) y el propio documento admite el callejón sin salida («si la promesa original ya no existe, la solicitud se resuelve con error 4001», `:230`) cuando en realidad **no hay a quién resolverle**; no hay `chrome.alarms` en los permisos previstos y `setTimeout` no sobrevive a la suspensión del SW. Resultado probable: dApp colgada indefinidamente, ventana de notificación huérfana y ninguna traza de error.

Los tres hallazgos más graves de la lista, por impacto directo en la entrega, son: **H-11 (firma ciega: calldata sin decodificar, `verifyingContract` sin validar y `eth_sign` en el catálogo, con aprobación de valor real por el usuario)**, **H-02 (cola de aprobaciones rota ante la suspensión del SW)** y **H-01 (ausencia total de criterios de aceptación)**, seguidos de cerca por **H-08** (la cola persistida es una clave única pese a que RF-37 exige varias solicitudes simultáneas: se pierden actualizaciones) y **H-09** (los logs viven en `localStorage` del popup, almacén que el Service Worker no puede escribir, de modo que RNF-16 y RF-28..RF-31 no son alcanzables con el popup cerrado).

Diagnóstico general: el problema **no es el alcance ni la ambición, sino el cierre**. La mayoría de los hallazgos ALTA son *incoherencias documentales y de verificación* de arreglo barato (H-03, H-04, H-05, H-06) y *decisiones de arquitectura MV3* que deben escribirse antes de codificar (H-02, H-07, H-08, H-09, H-10, H-11). Ninguno exige rehacer el concepto.

**Condición de paso a Fase 3:** cerrar los criterios de aceptación de §10 (los 15 puntos, priorizando los 6 bloqueantes H-01, H-02, H-08, H-09, H-11 y H-07). Con ellos resueltos, el corpus queda **apto** para codificar. Sin ellos, la Fase 3 produciría una implementación sin criterio de aceptación verificable, que es exactamente lo que RNF-01 pretende evitar.

---

## 2) Metodología

### Fase 1 — Revisar (7 lentes en paralelo)
Siete revisores independientes, en modo lectura-only, recorrieron `RepoTecnico/` completo más el enunciado fuente (`TAREA_PARA_ESTUDIANTE.md`, `requisitos.md`), cada uno con una lente:

| # | Lente | Foco |
|---|-------|------|
| R1 | Ambigüedad y testabilidad | Términos vagos y criterios no medibles ni verificables |
| R2 | Consistencia | Contradicciones internas, versiones, conteos, nombres y flujos |
| R3 | Completitud RNF (ISO 25010) | Categorías ausentes o insuficientes |
| R4 | Stakeholders | Actores ausentes o sin rol definido |
| R5 | Trazabilidad con el brief | Requisitos perdidos e inventados; mapeo E-xx → RF-xx |
| R6 | Riesgos técnicos | SPOF, ciclo de vida MV3, concurrencia, rendimiento, plazo |
| R7 | Seguridad y legal | Superficie de firma, phishing, permisos, licencias, avisos |

### Fase 2 — Verificar (crítico adversarial por dimensión)
Un verificador adversarial por lente contrastó **cada** hallazgo contra los documentos reales (lectura íntegra de `requerimientos.md`, `diccionario_datos.md`, `entornos_globales.md`, `identidad_visual.md`, `estado_proyecto.md`, `GUIA_RAPIDA_TESTING.md` y secciones citadas del enunciado, con `grep` dirigido y conteos mecánicos de identificadores). Ajustó severidades al alza o a la baja con justificación, fusionó duplicados y **aplicó la regla de descarte: ante la duda, el hallazgo se elimina** (se descartaron 27; ver Anexo). Las decisiones del usuario **P-02, P-03, P-08, P-10 y P-13 no se reportan como hallazgo**; solo se reporta la incoherencia documental que dejaron abierta (H-04, H-15) o la contaminación de trazabilidad asociada (H-24).

### Fase 3 — Sintetizar (este informe)
Consolidación cruzada de los 7 informes verificados: deduplicación entre dimensiones (23 fusiones, indicadas en cada hallazgo como «Origen»), asignación de IDs únicos `H-01…H-42` priorizados por severidad, y redacción del plan de acción y de los criterios de aceptación.

### Trazabilidad del método
- **Evidencia:** todo hallazgo cita `ruta:línea`; se reprodujeron por lectura o `grep` las evidencias de los 42 supervivientes.
- **Lo no verificable en ejecución** (rendimiento, comportamiento bajo suspensión del SW, build Linux) se marca expresamente **«necesita verificación»**: sin código, build ni `dist/`, esas cifras no son medibles hoy.
- **Sin invención:** no se incorpora ningún hallazgo que no provenga de un informe verificado de la Fase 2.

---

## 3) Estado de calidad

### 3.1 Naturaleza del artefacto auditado
**No existe código.** El repositorio tiene 26 archivos versionados: 9 `.md`, 12 activos gráficos, `.gitignore`, `scripts/generate-icons.ps1` y el enunciado. **No hay `src/`, ni `package.json`, ni `test.html`, ni `dist/`, ni `casos_uso/`.** Por tanto esta auditoría es **de especificación**: no se ejecutaron tests, lint ni typecheck, y ningún hallazgo acredita un incumplimiento en ejecución. Los hallazgos de mérito son defectos de diseño, contrato de datos o criterio de verificación.

### 3.2 Métricas del corpus (recuento mecánico verificado)

| Artefacto | Conteo real | Metadatos declarados | Estado |
|---|---|---|---|
| `requerimientos.md` — RF | **49** (RF-01..RF-49) · **39 Must / 10 Should** | «Total: 47 RF» (`:50`), D-01 y DEC-01 dicen `RF-01..RF-47` | ❌ desincronizado |
| `requerimientos.md` — RNF | **20** (RNF-01..RNF-20) | `estado_proyecto.md:29` dice 17 | ❌ desincronizado |
| `requerimientos.md` — RT | **13** (RT-01..RT-13) | `estado_proyecto.md:29` dice 11; RT-13 impreso antes de RT-12 | ❌ desincronizado |
| `requerimientos.md` — RE | **4** (RE-01..RE-04) | 4 ✔ | ✅ |
| Desviaciones | **D-01..D-10** | `estado_proyecto.md:29` dice D-01..D-09 | ❌ desincronizado |
| Versiones | `requerimientos.md` **v1.3**, `entornos_globales.md` **v1.4**, `diccionario_datos.md` v1.2, `identidad_visual.md` v1.1 | memoria dice requerimientos v1.2 y entornos v1.2 (`estado_proyecto.md:29-31`, `:158`) | ❌ desincronizado |

### 3.3 Cobertura de criterios de verificación

| Familia | Filas | Con criterio de aceptación / verificación | Observación |
|---|---|---|---|
| RF | 49 | **0 / 49** | Tabla de 4 columnas (ID, Requerimiento, Fuente, Prioridad); ninguna fila define resultado observable |
| RT | 13 | **0 / 13** | Misma asimetría que los RF |
| RNF | 20 | **20 / 20 declarados**, de los cuales **~15 operacionalizados** | RNF-06, RNF-07, RNF-16 y RNF-18 no operacionalizan su enunciado; RNF-19 deja abierto su universo de medida |
| RE | 4 | No aplica (restricciones) | — |
| Casos de uso | 0 | `casos_uso/` ⏳ Fase 2 (`estado_proyecto.md:34`) | La matriz RF ↔ CU ↔ test que exige RNF-01 **no existe** |
| Mapeo E-xx → RF-xx | 37 viñetas | **34 / 37** con destino declarado | E-05, E-12 y E-26 sin destino; E-12 además mal atribuido a RF-45 (`identidad_visual.md:237`) |
| Rúbrica de evaluación | 100 puntos | **0 / 5 dimensiones mapeadas** | «rúbrica», «100 puntos» y «criterios de evaluación» no aparecen en ningún documento de diseño |

### 3.4 Métricas de ejecución
**No disponibles.** Sin build, sin `dist/` y con el RPC local detenido (`estado_proyecto.md:46`), los objetivos de rendimiento (RNF-02) y de polling (RNF-03) **no son medibles hoy** → *necesita verificación*. La mitad Linux de RNF-15 tampoco es comprobable desde el entorno auditado (Windows, `estado_proyecto.md:42`).

---

## 4) Tabla resumen por severidad

| Severidad | Nº | IDs |
|---|---|---|
| 🔴 CRITICA | **2** | H-01, H-02 |
| 🟠 ALTA | **14** | H-03, H-04, H-05, H-06, H-07, H-08, H-09, H-10, H-11, H-12, H-13, H-14, H-15, H-16 |
| 🟡 MEDIA | **21** | H-17, H-18, H-19, H-20, H-21, H-22, H-23, H-24, H-25, H-26, H-27, H-28, H-29, H-30, H-31, H-32, H-33, H-34, H-35, H-36, H-37 |
| 🔵 BAJA | **5** | H-38, H-39, H-40, H-41, H-42 |
| **TOTAL** | **42** | — |

**Distribución por dimensión de origen** (un hallazgo puede fusionar varias lentes):

| Lente | Hallazgos aportados (antes de fusionar) | Severidades tras verificación |
|---|---|---|
| R1 Ambigüedad/testabilidad | 10 | 1 CRITICA, 2 ALTA, 7 MEDIA |
| R2 Consistencia | 8 | 3 ALTA, 2 MEDIA, 3 BAJA |
| R3 Completitud RNF | 6 | 3 MEDIA, 3 BAJA |
| R4 Stakeholders | 9 | 3 ALTA, 5 MEDIA, 1 BAJA |
| R5 Trazabilidad brief | 9 | 4 ALTA, 4 MEDIA, 1 BAJA |
| R6 Riesgos técnicos | 9 | 1 CRITICA, 4 ALTA, 4 MEDIA |
| R7 Seguridad y legal | 9 | 1 ALTA, 6 MEDIA, 2 BAJA |

---

## 5) Hallazgos detallados

> Formato: **ID · Severidad · Área** — Título / Detalle / Evidencia / Recomendación / Responsable · Esfuerzo / Origen.
> Esfuerzo: **S** ≤ 1 día · **M** 2-5 días · **L** > 1 semana (estimación de edición documental/diseño, no de código).

---

### 🔴 CRITICA

#### H-01 · CRITICA · Testabilidad de RF y RT
**Título:** Ningún RF ni RT tiene criterio de aceptación, y RNF-01 excluye por diseño a los 10 RF Should.

**Detalle:** Las seis tablas de RF (`requerimientos.md:54-129`) usan solo las columnas ID, Requerimiento, Fuente y Prioridad: no hay criterio de aceptación, precondición, resultado esperado ni evidencia. La tabla de RT (`:163-181`) tampoco. Solo los RNF tienen columna «Criterio de verificación» (`:135`), lo que confirma la asimetría. Recuento verificado: 49 RF (39 Must, 10 Should). El agravante que ninguna otra lente detectó: RNF-01 (`:137`) exige que «el 100 % de los RF marcados **Must**» estén cubiertos por un caso de uso Gherkin, de modo que los **10 RF Should quedan sin ningún mecanismo de aceptación previsto por el propio documento**, y entre ellos hay requisitos con tramos ambiguos: RF-40 (timeout), RF-38 (badge), RF-32 (historial), RF-39 (notificaciones), RF-44 (EIP-6963), RF-47, RF-48, RF-06, RF-12 y RF-34. La única evidencia declarada de RNF-01 es la «Matriz de trazabilidad RF ↔ CU ↔ test», inexistente (`estado_proyecto.md:34`, `:147`). Ejemplos de oráculo a interpretación del redactor: RF-01 («frase semilla BIP-39 de 12 palabras», `:56`) no fija entropía ni si se valida el checksum al generar; RF-08 («enviar transferencias … con estimación de gas y confirmación», `:63`) no define el resultado observable del envío. La Fase 1 se cerró como COMPLETADA (`:3`, `estado_proyecto.md:5`) sin un solo criterio de aceptación por requisito. No es un problema de «no hay código»: es la especificación la que no permite derivar el oráculo de los tests de Fase 3/4.

**Evidencia:** `RepoTecnico/requerimientos.md:54` (cabecera RF sin columna de criterio) · `:56`, `:63` · `:135` (cabecera RNF con «Criterio de verificación») · `:137` (RNF-01: solo Must) · `:50` («Total: 47 RF» — el conteo real es 49) · `:163-181` (RT sin columna de criterio) · `RepoTecnico/estado_proyecto.md:34`, `:147`.

**Recomendación:** Añadir a cada tabla de RF y a la de RT una columna **«Criterio de aceptación (verificable)»** con formato Dado/Cuando/Entonces o aserción observable, más una columna **«Evidencia»** (test unitario Vitest / E2E Playwright / comando de medición). Hacerlo **antes** de `/casos_uso` y con 3 RF piloto (RF-01, RF-08, RF-40) revisados como puerta: si el formato no produce criterios medibles ahí, rediseñar la plantilla antes de replicarla a los 49. Ampliar RNF-01 para cubrir también los 10 RF Should **o** documentar explícitamente su exención en la matriz de trazabilidad.

**Responsable:** Autor (analista de requisitos) + Docente/evaluador (validación de aceptabilidad) · **Esfuerzo: M**
**Origen:** R1 (CRITICA) fusionado con R5 (MEDIA, «Ninguna fila RF tiene criterio de verificación y la matriz RF ↔ CU ↔ test no existe»).

---

#### H-02 · CRITICA · MV3 · Ciclo de vida del Service Worker / cola de aprobaciones
**Título:** El estado persistido de la aprobación no define cómo se responde al dApp si el SW se duerme: la promesa RPC queda sin resolver y sin timeout.

**Detalle:** El diseño reconoce el riesgo (RNF-08, DEC-05) y lo mitiga persistiendo la solicitud, pero `PendingApproval` guarda `resolve`/`reject` en un `Map` **en memoria** (`diccionario_datos.md:220-230`) que se pierde al dormirse el SW: al despertar no existe la promesa original ni la referencia al mensaje que la esperaba. El diccionario documenta el callejón sin salida **sin resolverlo**: «Si la promesa original ya no existe, la solicitud se resuelve con error 4001» (`:230`), cuando en realidad no hay a quién resolverle. Agravan el escenario: (a) el propio enunciado advierte que `sendResponse` falla con operaciones que esperan al usuario y propone sustituirlo por un mensaje `SIGN_RESPONSE` (`TAREA_PARA_ESTUDIANTE.md:2308-2323`), lo que rompe la correlación petición/respuesta natural de `chrome.runtime.sendMessage`; (b) el patrón de content script del enunciado hace `await chrome.runtime.sendMessage(...)` sin timeout propio (`:773-790`). El único reloj que cerraría el caso es `expiresAt = createdAt + 120000` (`diccionario_datos.md:136`), pero **no hay `chrome.alarms` en los permisos previstos** (`entornos_globales.md:148`) y un `setTimeout` de 120 s no sobrevive a la suspensión del SW: el plazo no se dispara nunca. Resultado probable: SW dormido en mitad de una aprobación → ventana de notificación huérfana, dApp colgada indefinidamente, hash nulo y ninguna traza de error 4001. **Necesita verificación en ejecución** (no hay código en Fase 1).

**Evidencia:** `RepoTecnico/diccionario_datos.md:220-230` · `:136` · `RepoTecnico/requerimientos.md:144` (RNF-08) · `RepoTecnico/estado_proyecto.md:60` (DEC-05) · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2308-2323` · `:773-790` · `RepoTecnico/entornos_globales.md:148`.

**Recomendación:** Sustituir el mapa de promesas en memoria por **correlación por `approvalId` persistido** y especificar el ciclo completo en `diccionario_datos.md` §3.3: (a) puerto de larga vida `chrome.runtime.connect` entre content script y SW, que mantiene vivo el SW durante la espera y se reconecta con backoff si el puerto se cierra; (b) rutina de arranque del SW que liste las solicitudes por `expiresAt`, marque `expired` y emita `4001`/`-32603` a todo `approvalId` huérfano; (c) `chrome.alarms` (o rearme del plazo al reconstruir) para que el vencimiento se dispare aunque el SW esté dormido, añadiendo `alarms` a `entornos_globales.md:148`; (d) timeout explícito en el content script que convierta el silencio en un error EIP-1193 hacia la página. Documentar la tabla de correlación `approvalId ↔ tabId/frameId` y su recuperación.

**Responsable:** Autor (arquitecto de extensión MV3) · **Esfuerzo: L**
**Origen:** R6 (CRITICA).

---

### 🟠 ALTA

#### H-03 · ALTA · Trazabilidad / metadatos, conteos y versiones
**Título:** El registro de renumeración, los conteos y las versiones están desincronizados en toda la documentación de estado.

**Detalle:** La fuente única declarada de la renumeración (D-01 y DEC-01) se quedó en «RF-01..RF-47» después de que §1.6 añadiera RF-48 y RF-49 (identidad visual): RF-49 es **Must**, y RNF-01 exige que el 100 % de los Must quede cubierto por un CU con criterio Gherkin, así que un Must fuera del rango declarado queda fuera de la matriz de trazabilidad RF ↔ CU ↔ test. A esto se suma que `estado_proyecto.md:29` —la memoria que se lee al inicio de cada turno— declara `requerimientos.md` v1.2 con «47 RF, 17 RNF, 11 RT y 4 RE … D-01..D-09», cuando el documento real es v1.3 y contiene **49 RF, 20 RNF, 13 RT y 4 RE y D-01..D-10**; marca `entornos_globales.md` como v1.2 cuando su cabecera dice v1.4, y `:158` repite «requerimientos.md v1.2». El problema no es solo de la memoria: `entornos_globales.md` declara v1.4 en cabecera (`:3`) pero su historial de cambios (§7) termina en la fila 1.2, con la fila 1.4 huérfana al final. Los identificadores son la base de la trazabilidad y no concuerdan; además la tabla de RT está desordenada (RT-13 en `:175` antes de RT-12 en `:176`). Consecuencia: los criterios de aceptación y la matriz de Fase 2 se construirían sobre conteos y versiones que no existen. Se fusiona aquí el hallazgo BAJA de la lente de stakeholders (baseline frente a memoria) y el de conteos RNF/RT de trazabilidad, por ser el mismo defecto.

**Evidencia:** `RepoTecnico/requerimientos.md:50` («Total: 47 RF»), `:3` («Versión: 1.3»), `:128-129` (RF-48/RF-49, RF-49 Must), `:201` (D-01 «RF-01..RF-47»), `:156` (RNF-20), `:175-176` (RT-13 antes de RT-12), `:210` (D-10) · `RepoTecnico/estado_proyecto.md:29-31`, `:56` (DEC-01), `:158` · `RepoTecnico/entornos_globales.md:3` (v1.4) · `RepoTecnico/identidad_visual.md:239` (RF-48).

**Recomendación:** Fijar el total real (**49 RF**) en `requerimientos.md:50` y sustituir «RF-01..RF-47» por «RF-01..RF-49» en D-01, DEC-01 y en la nota de alcance, dejando constancia de que RF-48/RF-49 son aportaciones de identidad visual sin correspondencia en el enunciado. Refrescar la tabla §2 de `estado_proyecto.md` (49/20/13/4, D-01..D-10, requerimientos v1.3, entornos v1.4, diccionario v1.2, identidad v1.1), declarar los totales dentro de cada tabla de `requerimientos.md`, añadir la fila 1.4 al historial de `entornos_globales.md`, reordenar RT-12/RT-13 y establecer la regla de que **toda edición de un documento de Fase 1 obliga a refrescar esta tabla y su propio historial en el mismo turno**.

**Responsable:** Autor (analista/documentación) · **Esfuerzo: S**
**Origen:** R2 (ALTA ×2: renumeración y versiones/conteos), R5 (ALTA renumeración + MEDIA conteos), R4 (BAJA baseline) — fusionados.

---

#### H-04 · ALTA · Coherencia con la decisión P-10
**Título:** `entornos_globales.md` sigue presentando el código del remoto como «pendiente de adoptar», en contradicción con P-10/DEC-09.

**Detalle:** Dos pasajes del mismo documento describen el código del remoto `codecrypto` como algo a adoptar: la tabla de rutas de §1 marca `src/` como «pendiente de adoptar (P-10)» —invocando explícitamente la decisión para sostener lo contrario de lo que decidió— y la nota de §5 plantea como primera opción «adoptar el código del remoto y reescribir la historia local». P-10 y DEC-09 establecen **reconstruir desde cero** y que el código del remoto es solo referencia y no se reutiliza ni se versiona. Es una incoherencia real en cómo quedó documentada una decisión ya tomada, y el riesgo concreto es que en Fase 3 se arrastre código heredado con la nomenclatura antigua (`codecrypto_*` / `window.codecrypto`), contradiciendo P-13/DEC-18 y RT-13.

**Evidencia:** `RepoTecnico/entornos_globales.md:31` («existe una versión completa en el remoto `codecrypto` … pendiente de adoptar (P-10)») y `:190` («adoptar el código del remoto y reescribir la historia local») · `RepoTecnico/requerimientos.md:44` y `:228` (P-10) · `RepoTecnico/estado_proyecto.md:64` (DEC-09).

**Recomendación:** Reescribir la fila de rutas como «`src/` — a crear en Fase 3; el código del remoto `codecrypto` es solo referencia de consulta (P-10/DEC-09)», reformular la nota de §5 limitándola a la estrategia de publicación de la historia git (`--force`/`--allow-unrelated-histories`) sin mencionar la adopción del código, y **eliminar la palabra «adoptar» de ambos pasajes**.

**Responsable:** Autor (analista/documentación) · **Esfuerzo: S**
**Origen:** R2 (ALTA).

---

#### H-05 · ALTA · Trazabilidad E-xx → RF-xx
**Título:** Tres ítems del enunciado (E-05, E-12, E-26) no tienen destino trazable, y E-12 está además mal atribuido a RF-45 en el anexo vinculante.

**Detalle:** El `grep` de `E-\d\d` en `requerimientos.md` no devuelve ninguna aparición de E-05, E-12 ni E-26 en la columna Fuente. (a) **E-05** (React 19 + TypeScript) está cubierto de facto por RT-01, pero esa equivalencia no se declara. (b) **E-26** (`chrome.storage.local`: guardar mnemonic, cuentas, configuración) sí está especificado en `diccionario_datos.md` §2 y en RNF-08, pero ninguna fila RF lo cita: el requisito funcional de persistencia queda implícito en RF-09/RF-10/RF-11 (que citan E-27/E-28/E-21). (c) **E-12** no solo se pierde: aparece una sola vez en todo `RepoTecnico/` y de forma **incorrecta**: `identidad_visual.md:237` etiqueta la fila como «RF-45/E-12 (Chrome/Edge)», pero RF-45 es EIP-1193 (`requerimientos.md:120`, fuente E-03) y la compatibilidad Chrome/Edge MV3 es RNF-04 (`:140`). El daño es mayor que una omisión: el anexo vinculante afirma que la compatibilidad de navegadores la cubre el requisito de interfaz EIP-1193. Los tres ítems están cubiertos de facto (RT-01; diccionario + RNF-08; RNF-04/RT-04) pero ninguna tabla declara la equivalencia, de modo que un evaluador que recorra el enunciado punto por punto no encuentra su destino.

**Evidencia:** `grep` de `E-\d\d` en `RepoTecnico/requerimientos.md` sin coincidencias de E-05, E-12 ni E-26 · `RepoTecnico/identidad_visual.md:237` · `RepoTecnico/requerimientos.md:120` (RF-45 = E-03, EIP-1193), `:164` (RT-01), `:140` (RNF-04), `:144` (RNF-08) · `RepoTecnico/requisitos.md:57` (E-05), `:70` (E-12), `:94` (E-26) · `RepoTecnico/diccionario_datos.md:22-29`, `:158-167`.

**Recomendación:** Añadir al §1 (o a un anexo de trazabilidad) las filas explícitas «**E-05 → RT-01**», «**E-12 → RNF-04, RT-04**» y «**E-26 → RF-09/RF-10 + `diccionario_datos.md` §2**», y corregir `identidad_visual.md:237` dividiéndola en «E-12 (compatibilidad Chrome/Edge) → RNF-04» por un lado y «E-03 → RF-13/RF-14/RF-45 (provider EIP-1193)» por otro.

**Responsable:** Autor (analista de trazabilidad) · **Esfuerzo: S**
**Origen:** R5 (ALTA).

---

#### H-06 · ALTA · Trazabilidad / colisión de numeración del enunciado
**Título:** El número repetido 20 (y el par 30/36) se propaga sin desambiguar: RF-23 y RF-35 citan ambos E-20, y RF-16/RF-36 citan ambos exactamente E-30, E-36.

**Detalle:** El enunciado duplica el número 20: E-20a «Gestion de Redes: Add nuevas redes» y E-20b «Modal de Confirmación». La renumeración conserva la etiqueta «E-20» sin desambiguar y la asigna a dos RF distintos: RF-23 (`wallet_addEthereumChain`, correcto para E-20a) y RF-35 (`notification.html`, que proviene de E-20b + E-29). Por tanto la fuente de RF-35 es parcialmente incorrecta y la columna Fuente es ambigua: no se puede determinar cuál de los dos ítems «20» cubre cada fila. El mismo defecto, sin colisión de número, afecta a las páginas independientes: RF-16 (`eth_requestAccounts`) y RF-36 (`connect.html`) citan **exactamente** la misma fuente «E-30, E-36», por lo que ambas filas quedan mutuamente indistinguibles; E-30 y E-36 describen dos viñetas distintas y la documentación no registra cuál implementa cada RF. Además RF-17 (`eth_accounts`, lectura sin UI) cita E-30, que es una viñeta de apertura de ventana, y esa derivación de RNF-11 no se declara. El impacto es que la cobertura de los ítems 20, 30 y 36 del enunciado **no es auditable**, que es precisamente lo que la fase de renumeración debía resolver. Se fusiona aquí el hallazgo BAJA de consistencia «RF-35 cita E-20» (mismo defecto, distinta redacción).

**Evidencia:** `RepoTecnico/requisitos.md:81` (E-20 redes) vs `:85` (E-20 modal); `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:89` vs `:93` · `RepoTecnico/requerimientos.md:83` (RF-23 | E-20), `:105` (RF-35 | E-20, E-29), `:76` (RF-16 | E-30, E-36), `:106` (RF-36 | E-30, E-36), `:77` (RF-17 | E-30), `:50` (convención Fuente = `E-n` o `NUEVO`, sin regla de desambiguación) · `RepoTecnico/requisitos.md:101`, `:107`.

**Recomendación:** Declarar la desambiguación en la convención de la columna Fuente (p. ej. `E-20a` = redes, `E-20b` = modal, y cualquier número repetido con sufijo) y corregir las filas: **RF-35 → «E-20b, E-29»**; **RF-23 → «E-20a»**; asignar E-30 solo a RF-36 (ventana de conexión) y E-36 solo a RF-16 (selección de cuenta) —o documentar explícitamente el reparto—; y marcar RF-17 como «DERIVADO (RNF-11)» sin fuente E. Si el reparto E-30/E-36 no es sostenible, dejar constancia escrita de que el enunciado no permite separarlos.

**Responsable:** Autor (analista de trazabilidad) · **Esfuerzo: S**
**Origen:** R5 (ALTA), R2 (BAJA «Fuente de RF-35») — fusionados.

---

#### H-07 · ALTA · Timeouts y ciclo de aprobación
**Título:** El plazo de la aprobación no tiene dueño único ni efecto sobre la UI: el usuario puede aprobar una solicitud que el dApp ya dio por fallida.

**Detalle:** Verificado que el proyecto es internamente coherente en sus constantes (`SIGN_TIMEOUT_MS=120000`, `CONNECT_TIMEOUT_MS=60000` en `entornos_globales.md:126-127`, alineadas con RF-40 en `requerimientos.md:110`) y que son los 30 s del material de referencia los que discrepan (`TAREA_PARA_ESTUDIANTE.md:705-710`, `:2085-2095`, `:2304`). No se sostiene la lectura de «contradicción entre documentos del proyecto», pero sí queda un defecto real de especificación: ningún documento define (a) **qué componente es dueño del reloj**; (b) qué margen tiene la capa de página frente al SW (el snippet de referencia rechaza a los 30 s, incompatible con una aprobación de 120 s: la firma que el usuario aprueba a los 40 s se perdería); (c) que al expirar se **cierre la ventana** de `notification.html`, se marque la solicitud como `expired` y se purgue del badge (RF-38). El error de vencimiento tampoco se especifica como objeto EIP-1193: la referencia rechaza con `new Error('Request timeout')` sin `code` (`:708`), mientras el diccionario mapea el timeout a `4001` (`diccionario_datos.md:292`). Además RF-40, que es el requisito normativo, no menciona el ancla del cómputo (aunque `expiresAt = createdAt + 120000/60000` sí está definido en `diccionario_datos.md:136` y `:154`) ni el caso del usuario que abre la ventana tarde, ni un método de prueba determinista (relojes falsos). Escenario de fallo: el usuario duda 45 s con la ventana abierta y, si el dApp ya venció su espera, al pulsar Aprobar el SW firma y difunde igualmente la transacción; el dApp nunca lo sabe y el usuario cree que la operación falló cuando se ejecutó.

**Evidencia:** `RepoTecnico/entornos_globales.md:126-127` · `RepoTecnico/requerimientos.md:110` (RF-40) · `RepoTecnico/diccionario_datos.md:136`, `:137` (status `expired`), `:154`, `:292` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:705-710`, `:2085-2095`, `:2304`.

**Recomendación:** Declarar en `entornos_globales.md` §3 una **única fuente de verdad del plazo**: el SW es dueño de `SIGN_TIMEOUT_MS`/`CONNECT_TIMEOUT_MS`; la capa inject/content solo actúa como red de seguridad con margen superior (p. ej. `SIGN_TIMEOUT_MS + 5000`) o sin timeout propio, delegando en el `approvalId`. Fijar en RF-40 el instante base del cómputo, especificar que el error que llega a la página es un objeto EIP-1193 (`code: 4001`, mensaje en español según RNF-06) y no `Error('Request timeout')`, y que al expirar el SW cierra la ventana de `notification.html`, marca `expired` y purga el badge. Exigir relojes inyectables/fake timers en Vitest y marcar el snippet de 30 s del enunciado como **no normativo**.

**Responsable:** Autor (arquitecto MV3 + analista) · **Esfuerzo: M**
**Origen:** R6 (ALTA), R1 (MEDIA) — fusionados.

---

#### H-08 · ALTA · Diccionario de datos · Cola de solicitudes
**Título:** `truekeate_pending_request` es una clave única pese a que RF-37 (Must) exige varias solicitudes simultáneas: pérdida de actualizaciones.

**Detalle:** RF-37 exige «cola de solicitudes pendientes con `approvalId`/`requestId` únicos; varias solicitudes simultáneas» (`requerimientos.md:107`) y RF-38 un badge con el número de pendientes (`:108`), pero el diccionario define `truekeate_pending_request` como **una sola** solicitud con los campos en la raíz (`diccionario_datos.md:120-137`) y el patrón de referencia escribe un objeto plano bajo esa clave (`requisitos.md:302-308`). Con una única clave, la segunda solicitud **sobrescribe** a la primera: la ventana abierta para la primera lee datos de la segunda o queda huérfana, y la cola persistida —base declarada de la mitigación RNF-08 y de DEC-05— pierde entradas. La incoherencia es interna al propio diccionario: §3.3 modela `PendingApproval` como un `Map` con clave `approvalId` (`:220-226`), es decir varias a la vez en memoria, pero la persistencia equivalente no tiene esa forma. `grep` de `pending_request` en `RepoTecnico/` no devuelve ningún esquema alternativo indexado por `approvalId`.

**Evidencia:** `RepoTecnico/diccionario_datos.md:120-137`, `:220-230`, `:323` · `RepoTecnico/requerimientos.md:107-108` (RF-37/RF-38) · `RepoTecnico/requisitos.md:302-308`.

**Recomendación:** Renombrar y remodelar la clave a `truekeate_pending_requests` como mapa `Record<approvalId, PendingRequest>` en `diccionario_datos.md` §2.8, con escritura read-modify-write serializada (chrome.storage no tiene transacciones), purga de entradas `expired`/`status !== 'pending'` al arrancar, índice derivado para el badge (RF-38) y regla explícita para dos solicitudes del mismo origen y cuenta. Actualizar el ejemplo de `requisitos.md:302-308` o marcarlo como no vinculante.

**Responsable:** Autor (arquitecto MV3) · **Esfuerzo: M**
**Origen:** R6 (ALTA).

---

#### H-09 · ALTA · Observabilidad · Persistencia de logs
**Título:** Los logs viven en `localStorage` del popup, que el Service Worker no puede escribir: RNF-16 y RF-28..RF-31 no son alcanzables con el popup cerrado.

**Detalle:** `truekeate_logs` se define en `localStorage` del popup (`diccionario_datos.md:13`, `:171-173`; RF-32 en `requerimientos.md:97`). El Service Worker de MV3 **no tiene `localStorage`** (solo `chrome.storage`), y es el SW quien recibe todas las llamadas RPC y emite los eventos (RT-04, `requerimientos.md:167`). No hay en ningún documento un mecanismo de transporte de logs SW → popup ni de agregación: `grep` de `localStorage|truekeate_logs|logLimit` en `RepoTecnico/` solo devuelve la definición del diccionario, RF-32 y una viñeta del enunciado (`TAREA_PARA_ESTUDIANTE.md:1754`); ninguna describe el camino de escritura. RNF-16 exige que los logs cubran «el 100 % de llamadas, eventos y errores, con timestamp, nivel y origen» (`requerimientos.md:152`) y su verificación es «Revisión del panel de logs»: con el diseño actual, toda operación disparada por `test.html` sin el popup abierto —el caso de uso normal de una dApp— no se registra, de modo que el criterio no es medible. RNF-03 además define su verificación como «Inspección de logs del Service Worker» (`:139`), lo que confirma que la fuente de verdad de los logs es el SW y no el popup.

**Evidencia:** `RepoTecnico/diccionario_datos.md:13`, `:171-173` · `RepoTecnico/requerimientos.md:97` (RF-32), `:139` (RNF-03), `:152` (RNF-16), `:167` (RT-04) · `RepoTecnico/requisitos.md:294-341`.

**Recomendación:** Decidir la **fuente de verdad del log** antes de la Fase 3: escribir **siempre** en `chrome.storage.local` (`truekeate_logs`, con `logLimit`) desde el SW, y que el popup renderice leyendo de storage. Para RF-32 (sobrevivir a `resetWallet`) basta **excluir `truekeate_logs` de la limpieza del reset** en lugar de moverlo a `localStorage`. Actualizar `diccionario_datos.md` §2.11 y añadir un criterio medible (p. ej. «un `eth_sendTransaction` ejecutado con el popup cerrado produce ≥ 3 entradas de log con timestamp, nivel y origen»).

**Responsable:** Autor (arquitecto MV3 / observabilidad) · **Esfuerzo: M**
**Origen:** R6 (ALTA).

---

#### H-10 · ALTA · Concurrencia · Nonce y aprobaciones en paralelo
**Título:** El `nonce` se fija en la vista previa persistida y ningún documento ordena recalcularlo al firmar.

**Detalle:** `TxPreview.nonce` se define como «Nonce pendiente» y forma parte del resumen persistido que alimenta la ventana de confirmación (`diccionario_datos.md:134`, `:205`), es decir se calcula **antes** de que el usuario decida. El flujo de firma del enunciado no fija `nonce` explícitamente (`TAREA_PARA_ESTUDIANTE.md:604-613`) y lo deja a `signer.sendTransaction`, mientras el diccionario mapea `-32000` a «nonce inválido» (`:299`) sin definir política alguna. Combinado con RF-37, que autoriza varias solicitudes simultáneas (`requerimientos.md:107`), no queda especificado: (a) si el `nonce` mostrado es informativo o vinculante; (b) si se recalcula en el momento de firmar; (c) si el envío se serializa por cuenta. Dos aprobaciones de la misma cuenta resueltas en paralelo pueden difundir con el mismo nonce y la segunda ser rechazada, o —peor— quedar una transacción difundida cuyo resultado el dApp ya no espera. `grep` de `nonce` en `RepoTecnico/` solo devuelve esas dos líneas del diccionario: no se menciona `getTransactionCount`.

**Evidencia:** `RepoTecnico/diccionario_datos.md:134`, `:205`, `:299` · `RepoTecnico/requerimientos.md:107` (RF-37) · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:604-613`.

**Recomendación:** Documentar en `diccionario_datos.md` §3.1 que «el nonce mostrado es **informativo**; el definitivo se recalcula al aprobar» y especificar en el diseño del SW una **cola FIFO por cuenta** (una transacción en vuelo por `from`), recalculando `nonce` y `getFeeData()` en el momento de firmar. Añadir en Fase 2 un caso de uso Gherkin de dos solicitudes simultáneas de la misma cuenta con resultado esperado (una difundida, la otra con error tipado).

**Responsable:** Autor (arquitecto MV3) · **Esfuerzo: S**
**Origen:** R6 (ALTA, «nonce»).

---

#### H-11 · ALTA · Seguridad · Aprobación de transacciones / firma ciega
**Título:** Se aprueban transacciones sin decodificar el calldata y firmas EIP-712 sin validar `verifyingContract`; el catálogo admite `eth_sign` (firma de digest arbitrario) pese a que el enunciado no lo exige.

**Detalle:** El `TxPreview` vinculante se limita a `data`, `dataLength` e `isContractCall` (`diccionario_datos.md:198-200`): no hay selector decodificado, nombre de función, parámetros legibles, etiquetado del contrato destino ni aviso para patrones peligrosos (`approve` con allowance ilimitada, `setApprovalForAll`, `data` no vacío desconocido). Coherentemente, RNF-05 exige mostrar solo «destino, valor, red y comisión estimada» (`requerimientos.md:141`) y el criterio del Test 4 solo «Para, Valor, Red» (`requisitos.md:576-577`), de modo que el vacío está en el propio criterio de verificación. En EIP-712, `TypedDataPreview` solo contempla `domainChainMismatch` (`diccionario_datos.md:214-218`) y no valida ni advierte sobre `domain.verifyingContract`, `domain.name` ni `primaryType`, mientras el ejemplo fuente de la dApp usa `verifyingContract: '0x0000…0000'`, lo que normaliza un dominio sin contrato verificable. Además el catálogo RPC lista `personal_sign` **y** `eth_sign` como métodos que requieren aprobación (`:279`), pero el enum `method` de `truekeate_pending_request` —el mismo documento— **no incluye `eth_sign`** (`:127`) y RF-21 solo confirma `personal_sign` (P-05): `eth_sign` firma un digest de 32 bytes sin interpretación, por lo que una dApp hostil puede hacer firmar el hash de una transacción y ejecutarla después. No hay tampoco regla de presentación para `personal_sign` (texto UTF-8 legible frente a hexadecimal opaco). Resultado de diseño: el usuario puede autorizar una transferencia de valor, una aprobación ilimitada o un permiso sin ver qué autoriza realmente. **Es el único riesgo ALTO de la auditoría que no está aceptado explícitamente por el usuario.**

**Evidencia:** `RepoTecnico/diccionario_datos.md:198-200`, `:214-218`, `:279` vs `:127` · `RepoTecnico/requerimientos.md:141` (RNF-05), `:79` (RF-19), `:81` (RF-21), `:235` (P-05) · `RepoTecnico/requisitos.md:576-577`, `:318-321` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:971`, `:2064`.

**Recomendación:** Ampliar `TxPreview` y RF-19/RF-20 en Fase 2: (1) selector + nombre de función decodificado y parámetros legibles; (2) contrato destino etiquetado y `data` no vacío desconocido marcado como «llamada a contrato no reconocida»; (3) aviso destacado para `approve`/`setApprovalForAll`/valor ilimitado; (4) en EIP-712, mostrar `verifyingContract` y `name` con advertencia cuando no coincidan con el contrato declarado por la dApp; (5) en `personal_sign`, previsualizar el texto UTF-8 y advertir si el payload es hexadecimal ilegible; (6) **resolver la contradicción de `eth_sign`**: retirarlo del catálogo (responder `4200 Unsupported method`, ya previsto en `diccionario_datos.md:294`) o añadirlo al enum y exigir advertencia bloqueante por defecto. Añadir los casos Gherkin negativos y actualizar el criterio de RNF-05.

**Responsable:** Autor (seguridad) + Autor (UX de previsualización) · **Esfuerzo: L**
**Origen:** R7 (ALTA), R2 (BAJA «eth_sign en el catálogo») — fusionados.

---

#### H-12 · ALTA · Criterios de verificación de RNF
**Título:** Cuatro RNF se rotulan «verificable» pero su criterio no operacionaliza el requisito (inspección visual o magnitud sin universo definido).

**Detalle:** La cabecera promete «Requerimiento (verificable)» (`requerimientos.md:135`) y ~15 de las 20 filas cumplen (magnitud + umbral + método). Cuatro no: (1) **RNF-07** (`:143`) — «reintentar sin bloquearse ni perder el estado persistido» con criterio «Test con Anvil detenido»: sin número máximo de reintentos, backoff, timeout por intento ni definición operativa de «bloquearse»; (2) **RNF-16** (`:152`) — «el 100 % de llamadas, eventos y errores» con criterio «Revisión del panel de logs»: el universo de llamadas es abierto y el criterio es observación visual, aunque el diccionario sí acota categorías (`call|event|tx|sign|system`, `diccionario_datos.md:180`) y niveles (`:179`); (3) **RNF-18** (`:154`) — exige que el 100 % de colores, tipografías y degradados provenga de tokens, pero su criterio solo busca `#[0-9a-f]{3,6}` y `rgb(` «en el CSS», sin delimitar rutas/ficheros ni comprobar familias tipográficas (que también son tokens, `identidad_visual.md:211-213`); (4) **RNF-06** (`:142`) — «causa y acción sugerida» con criterio «Revisión de UI», sin tabla de mensajes, aunque el diccionario fija códigos EIP-1193 (`:290-299`). Estas cuatro filas no se pueden aprobar o rechazar de forma reproducible. Se fusiona aquí el hallazgo BAJA de observabilidad (RNF-16 sin mecanismo de comprobación ni exportación de diagnóstico) por ser el mismo defecto.

**Evidencia:** `RepoTecnico/requerimientos.md:135`, `:142`, `:143`, `:152`, `:154` · `RepoTecnico/diccionario_datos.md:179-180`, `:290-299` · `RepoTecnico/identidad_visual.md:211-213`.

**Recomendación:** RNF-07 → política numérica cerrada («máx. 3 reintentos con backoff ×2 1s/2s/4s, timeout 5 s por intento, UI interactiva, storage intacto») y test con provider falso. RNF-16 → catálogo cerrado de eventos instrumentados, una entrada de log por evento, aserción tras la suite E2E completa (incluida la de que **ninguna entrada contiene claves**, RNF-09) y exportación del histórico en JSON para diagnóstico. RNF-18 → alcance explícito («todo CSS bajo `src/` salvo `tokens.css`») más verificación de familias tipográficas y degradados. RNF-06 → tabla de mensajes esperados por código EIP-1193 con aserción sobre causa y acción sugerida.

**Responsable:** Autor (analista de requisitos/RNF + QA) · **Esfuerzo: M**
**Origen:** R1 (ALTA), R3 (BAJA observabilidad) — fusionados.

---

#### H-13 · ALTA · RNF-02 (eficiencia de desempeño)
**Título:** «< 800 ms en frío» no define el estado «frío», ni las marcas de inicio/fin, ni el estadístico de las 5 ejecuciones; y las ventanas de aprobación/conexión no tienen presupuesto.

**Detalle:** RNF-02 (`requerimientos.md:138`) exige que el popup renderice en < 800 ms «en frío» y que `eth_getBalance` responda < 1,5 s contra la red local, con criterio «Medición con `performance.now()` en 5 ejecuciones». Queda sin definir: (a) qué es «frío» —SW detenido, extensión recién cargada desde `dist/` o navegador recién abierto son tres escenarios con tiempos muy distintos, y solo el primero es el relevante en MV3—; (b) los puntos de medida (inicio: ¿clic en el icono o `timeOrigin`?; fin: ¿primer pintado, `load` o saldo ya pintado?); (c) si las 5 ejecuciones exigen media, mediana o máximo; (d) la precondición de red, cuando el RPC local no está escuchando al inicio (`entornos_globales.md:20`) y RNF-07 contempla el RPC caído. Agravante: `notification.html` (420×640) y `connect.html` (420×650), que están en la ruta crítica de aprobación y bloquean al usuario, **no tienen ningún objetivo de tiempo** (`identidad_visual.md:137-138`); RNF-08 exige reconstruir el estado pendiente tras dormirse el SW sin cota de tiempo (`requerimientos.md:144`). Con esa indefinición, dos mediciones legítimas dan veredictos opuestos. **Necesita verificación:** sin build ni `dist/` ninguna cifra es medible hoy.

**Evidencia:** `RepoTecnico/requerimientos.md:138`, `:139` (RNF-03 por inspección manual), `:144` (RNF-08 sin presupuesto) · `RepoTecnico/entornos_globales.md:20`, `:71-73` (scripts build/test:e2e) · `RepoTecnico/identidad_visual.md:137-138` · `RepoTecnico/estado_proyecto.md:46` (RPC detenido).

**Recomendación:** Convertir RNF-02 en procedimiento: definir «frío» = «SW detenido (`Stop service worker`) + sin popup abierto», fijar marcas concretas (`performance.mark('popup-mount')`, `performance.mark('balance-rendered')`), exigir percentil 95 sobre ≥ 10 ejecuciones, precondición obligatoria «Anvil en marcha, cuenta 0 con saldo» y guardar el resultado como artefacto (JSON) comparable entre ciclos. Añadir presupuesto de apertura de `notification.html` y `connect.html` (p. ej. < 500 ms en caliente) y cota de reconstrucción del SW (< 1 s, RNF-08), y convertir RNF-03 en aserción sobre un contador de llamadas RPC instrumentado en los E2E.

**Responsable:** Autor (analista + QA) · **Esfuerzo: M**
**Origen:** R1 (ALTA), R3 (BAJA «Eficiencia sin presupuesto en la ruta crítica») — fusionados.

---

#### H-14 · ALTA · Stakeholders · Docente/evaluador (criterios de aceptación)
**Título:** La rúbrica de 100 puntos que rige la calificación no figura en el diseño: el interés del evaluador está representado por el conteo de especificaciones, no por el instrumento de evaluación.

**Detalle:** El único stakeholder humano de negocio reconocido es el «Docente/evaluador», cuyo objetivo declarado es «Verificar el cumplimiento de los 36 puntos del enunciado y los EIP» (`requerimientos.md:193`). Ese «36» es literal del enunciado (`requisitos.md:49`), pero el instrumento real de calificación es una **rúbrica cuantificada de 100 puntos** con cinco dimensiones (Funcionalidad 40, Arquitectura 20, UX/UI 15, Estándares 15, Documentación 10) que **no aparece en ningún documento de diseño**. Se comprobó por `grep` sobre los 8 `.md` de `RepoTecnico/` que «rúbrica», «100 puntos» y «criterios de evaluación» no existen fuera del enunciado fuente. Consecuencias operativas: (i) no hay matriz que traiga cada ítem puntuado a RF/RNF/RT ni a la evidencia que lo demuestra; (ii) hay ítems de la rúbrica sin requisito equivalente declarado, en particular «Popup funcional e intuitivo», «`notification.html` clara y profesional» (`TAREA_PARA_ESTUDIANTE.md:2430-2431`) y los 4 puntos de «Código limpio y comentado» (`:2426`), sin RNF asociado; (iii) ítems que sí existen (persistencia con `chrome.storage`, derivación de 5 cuentas HD) carecen de traza declarada. RNF-01 exige una matriz RF ↔ CU ↔ test que no cubre la rúbrica porque esta se expresa en puntos.

**Evidencia:** `RepoTecnico/requerimientos.md:193`, `:137` (RNF-01) · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2410`, `:2421`, `:2426`, `:2428`, `:2430-2431`, `:2435`, `:2442`, `:2448` («TOTAL: 100 puntos») · `RepoTecnico/requisitos.md:49` · `RepoTecnico/estado_proyecto.md:26`.

**Recomendación:** Añadir a `requerimientos.md` §4 una subsección **«Criterios de aceptación del evaluador»** que transcriba la rúbrica de `TAREA_PARA_ESTUDIANTE.md:2410-2448` y una matriz ítem-de-rúbrica ↔ RF/RNF/RT ↔ evidencia (test, comando, captura). Corregir el objetivo del evaluador para referenciar la rúbrica además de las 36 especificaciones, y usar RNF-01 como vehículo único de esa matriz.

**Responsable:** Autor (analista) + Docente/evaluador · **Esfuerzo: M**
**Origen:** R4 (ALTA).

---

#### H-15 · ALTA · Stakeholders · Docente/evaluador (riesgo de calificación)
**Título:** El nombre del provider lo puntúa la rúbrica (5 pts) y el diseño lo deja pendiente de una condición futura («si el evaluador lo exige»), sin responsable ni momento de decisión.

**Detalle:** La decisión P-13/DEC-18 renombra todo el producto a TrueKeate, incluido el provider inyectado (`requerimientos.md:210`, `estado_proyecto.md:73`, `entornos_globales.md:288`). Es una decisión ya tomada y no se cuestiona; lo que se reporta es la incoherencia documental de cómo quedó cerrada: D-10 se presenta como «Resuelto (P-13)» y en la misma celda mantiene una condición diferida («si el evaluador lo exige, se recupera la compatibilidad con una línea»), repetida en `entornos_globales.md:288` y en `identidad_visual.md:232`. El problema es cuantificable porque la rúbrica puntúa el nombre antiguo: «Provider `window.codecrypto` inyectado en páginas (5 pts)» (`TAREA_PARA_ESTUDIANTE.md:2414`), y el enunciado lo repite como requisitos 3 y 9 (`requisitos.md:55`, `:64`) y como entregable de la Fase 3 (`TAREA_PARA_ESTUDIANTE.md:1855`). **5 de 100 puntos dependen de una decisión que el diseño no resuelve ni en un sentido ni en otro**, y la mitigación técnica ya identificada no tiene dueño ni hito. Además, la mitigación textual choca con la restricción de que los documentos fuente no se modifican (`estado_proyecto.md:26-28`): el alias tendría que vivir en `inject.js`, y ningún documento de diseño lo dice.

**Evidencia:** `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2414`, `:1855` · `RepoTecnico/requisitos.md:55`, `:64` · `RepoTecnico/requerimientos.md:210` (D-10) · `RepoTecnico/estado_proyecto.md:73` (DEC-18), `:26-28` · `RepoTecnico/entornos_globales.md:288` · `RepoTecnico/identidad_visual.md:232`.

**Recomendación:** Resolver ahora y por escrito: implementar el alias `window.codecrypto = window.truekeate` desde la Fase 3 como criterio de aceptación (con un test que verifique ambos nombres), **o** registrar formalmente la renuncia a esos 5 puntos con la firma del usuario. Asignar responsable de la verificación de nomenclatura frente al evaluador y **eliminar la formulación condicional «si el evaluador lo exige»** de D-10, `entornos_globales.md` §10 e `identidad_visual.md`.

**Responsable:** Autor (decisión de producto) + Docente/evaluador · **Esfuerzo: S**
**Origen:** R4 (ALTA).

---

#### H-16 · ALTA · Stakeholders · Docente/evaluador (entregables)
**Título:** El paquete de entrega (README, INSTRUCCIONES, video, ZIP) y los 10 puntos de Documentación no están representados como expectativas del evaluador ni como criterios de fase.

**Detalle:** El enunciado define un paquete de entrega cerrado: código fuente, `dist/`, `README.md` e `INSTRUCCIONES.md`, video demo opcional y formato ZIP con nombre concreto (`TAREA_PARA_ESTUDIANTE.md:2634-2667`), y la rúbrica asigna 10 puntos a Documentación repartidos en README (4), comentarios (3) e instrucciones de instalación (3) (`:2442-2446`). En el diseño, ningún documento recoge esos entregables: se verificó por `grep` que «README», «INSTRUCCIONES» y «entregable» no aparecen en `requerimientos.md`, `diccionario_datos.md`, `entornos_globales.md` ni `identidad_visual.md`, salvo la mención de un README del intento anterior (`requerimientos.md:41`). `estado_proyecto.md` §2 (`:22-36`) lista solo artefactos internos de `RepoTecnico/`, y RT-09 (`requerimientos.md:172`) reduce la distribución a «carpeta `dist/`». El roadmap del enunciado sí contempla una Fase 10 de Documentación (`TAREA_PARA_ESTUDIANTE.md:1944-1952`), pero el plan de 5 fases del proyecto no la refleja: sus manuales se prevén para la Fase 5 sin vincularlos a los 10 puntos ni al formato de entrega. Consecuencia: el evaluador no puede saber, a partir del diseño, qué recibirá ni cuándo se produce.

**Evidencia:** `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2634-2667`, `:2442-2446`, `:1944-1952` · `RepoTecnico/requerimientos.md:172` (RT-09), `:41` · `RepoTecnico/estado_proyecto.md:22-36`.

**Recomendación:** Incorporar un bloque **«Entregables y aceptación»** en `requerimientos.md` §4 (o en `estado_proyecto.md`) con la lista del enunciado, el formato ZIP, el peso de cada documento en la rúbrica y la fase que lo produce, asignando README/INSTRUCCIONES y las guías de usuario a la fase de manuales para que los 10 puntos se cubran **por diseño** y no al final.

**Responsable:** Autor (analista) + Docente/evaluador · **Esfuerzo: S**
**Origen:** R4 (ALTA).

---

### 🟡 MEDIA

#### H-17 · MEDIA · RNF — Accesibilidad (ISO 25010, categoría insuficiente)
**Título:** Accesibilidad reducida a contraste de color, y RNF-19 con universo de medida abierto.

**Detalle:** La tabla de RNF no declara la categoría Accesibilidad: la única línea es RNF-19, etiquetada «Compatibilidad / Accesibilidad», y su contenido son tres reglas de contraste (`requerimientos.md:155`). `identidad_visual.md:83` repite el mismo bloque y `:164` añade modo oscuro, pero sin criterio de foco ni de teclado. No existe ningún requisito verificable de navegación por teclado en el popup (380×600) ni en las ventanas de conexión/confirmación (`:136-138`), de indicador de foco visible, de roles/etiquetas ARIA en la lista de cuentas (RF-36) y el panel de logs (RF-32), de anuncio a lectores de pantalla del resultado de aprobar/rechazar, ni de respeto de `prefers-reduced-motion` pese a que el spinner con degradado está especificado (`:155`). Es relevante porque el flujo crítico de aprobación (RF-19/RF-35/RNF-05) es Must y RNF-05 acepta «≤ 2 clics» sin exigir alternativa de teclado (`requerimientos.md:141`). Además, «Contraste del texto principal ≥ 4.5:1» no enumera los pares texto/fondo pese a que el propio anexo reconoce los casos en riesgo: teal ≈ 3.4:1 y oro ≈ 2.2:1 (`identidad_visual.md:83`), texto secundario `--tk-gray-600` (`:68`) y texto sobre el degradado de marca. Con ese alcance abierto, la verificación puede declararse cumplida midiendo solo el par navy/blanco (~12.6:1) sin cubrir los pares realmente en riesgo. El enunciado fuente **no menciona accesibilidad, teclado ni WCAG en ningún punto**: el requisito nace de la norma, no del brief.

**Evidencia:** `RepoTecnico/requerimientos.md:135`, `:141`, `:155` · `RepoTecnico/identidad_visual.md:83`, `:68`, `:136-138`, `:155`, `:164`, `:250`.

**Recomendación:** Añadir a la tabla RNF una categoría **Accesibilidad** con criterios medibles: (1) todas las acciones críticas (cargar wallet, importar clave, seleccionar cuenta, aprobar, rechazar, reset) ejecutables solo con teclado, verificado con Playwright; (2) foco visible con contraste ≥ 3:1 en todos los controles; (3) roles/etiquetas ARIA en lista de cuentas, tabs de red y panel de logs, verificado con axe-core dentro del E2E; (4) sin pérdida de contenido al 200 % de zoom (WCAG 1.4.4); (5) `prefers-reduced-motion` desactiva spinner y transiciones. Sustituir «texto principal» por una **matriz cerrada de pares** (token texto × token fondo × tamaño × modo claro/oscuro) con umbral WCAG aplicable y automatizar el cálculo en un test que lea `tokens.css`.

**Responsable:** Autor (UX/UI + QA) · **Esfuerzo: M**
**Origen:** R3 (MEDIA accesibilidad), R1 (MEDIA alcance de RNF-19) — fusionados.

---

#### H-18 · MEDIA · Cola de aprobaciones · cardinalidad, desbordamiento y tasa
**Título:** «Varias solicitudes simultáneas» sin cardinalidad máxima ni política de desbordamiento; el badge sin regla de conteo y sin control de tasa.

**Detalle:** RF-37 (`requerimientos.md:107`) exige «varias solicitudes simultáneas» —magnitud no medible— sin fijar: número máximo de solicitudes concurrentes; qué ocurre con la N+1 (¿se encolan, se rechazan con `4001`/`4100`, se abre otra ventana?); ni la relación entre los dos espacios de identificadores que el propio diseño separa, `approvalId` para firmas/aprobaciones (`diccionario_datos.md:126`) y `requestId` para conexión (`:147`), sin regla de unicidad global ni de precedencia. RF-38 (`requerimientos.md:108`) exige un badge «con el número de solicitudes pendientes» sin definir si cuenta por origen, por tipo o global. No hay tampoco máximo global, máximo por origen, ni limitación de frecuencia, ni previsión de agrupar solicitudes repetidas. Combinado con RF-39 (una notificación de Chrome por solicitud) y RF-38 (badge contador), una página hostil puede inundar al usuario con ventanas y notificaciones indistinguibles —fatiga de aprobación— y forzar la aprobación de la solicitud equivocada; además abre un vector de agotamiento de recursos y de `chrome.storage.local`, porque cada aprobación pendiente se persiste (RNF-08). La única mitigación documentada en D-06 es el timeout (RF-40), que no acota el volumen. Sin cardinalidad ni resultado esperado, el test de concurrencia no tiene oráculo.

**Evidencia:** `RepoTecnico/requerimientos.md:107`, `:108`, `:109`, `:206` (D-06) · `RepoTecnico/diccionario_datos.md:126`, `:127`, `:147`, `:227-230`.

**Recomendación:** Precisar en RF-37 el máximo de solicitudes concurrentes (valor numérico), la política ante exceso con código concreto, la unicidad global entre `approvalId` y `requestId` y el comportamiento documentado al dormirse el SW; en RF-38, la definición exacta del contador (por origen / por tipo / global). Añadir a RF-37/RF-40: máximo de 1 solicitud pendiente por origen (agrupando o rechazando las adicionales con `4001`), límite global de pendientes y control de tasa por origen, con agotamiento de notificación/badge **por origen** en lugar de por solicitud. Caso Gherkin con N solicitudes simultáneas de la misma y de distintas dApps, y otro de flood lanzado desde `test.html`.

**Responsable:** Autor (arquitecto MV3 + seguridad) · **Esfuerzo: M**
**Origen:** R1 (MEDIA RF-37/RF-38), R7 (MEDIA abuso de recursos) — fusionados.

---

#### H-19 · MEDIA · RNF-17 (testabilidad: cobertura)
**Título:** «Cobertura ≥ 70 %» sin métrica (líneas/ramas/funciones), sin regla global-vs-fichero y con un alcance distinto al declarado en `entornos_globales.md`.

**Detalle:** RNF-17 (`requerimientos.md:153`) fija «Cobertura de tests unitarios ≥ 70 % en esos módulos». Los módulos sí están enumerados como ámbitos funcionales («derivación, validación, formateo, cola de aprobaciones»), de modo que la objeción «no se enumeran los módulos» es solo parcialmente cierta (faltan rutas); lo que falta es lo que hace falsable la cifra: (a) el tipo de cobertura —Vitest reporta líneas, ramas, funciones y sentencias, con valores muy distintos—; (b) si el 70 % es global o por fichero/módulo (un 70 % global puede ocultar un módulo crítico al 0 %); (c) las exclusiones explícitas de glue no testeable en jsdom (mensajería `chrome.runtime`, envoltorios de ethers); (d) el comando y el artefacto de evidencia, y si un incumplimiento bloquea el hito. Además el alcance no coincide entre documentos: `entornos_globales.md:221` añade «mapeo de errores EIP-1193» al ámbito de Vitest, módulo que RNF-17 no incluye.

**Evidencia:** `RepoTecnico/requerimientos.md:153` · `RepoTecnico/entornos_globales.md:221`.

**Recomendación:** Especificar en RNF-17: métrica = **cobertura de ramas** con `@vitest/coverage-v8`; umbral 70 % global y ≥ 80 % en los módulos criptográficos y de aprobaciones; lista explícita de rutas en alcance y de exclusiones; comando exacto (`npm run test -- --coverage`) y su salida como evidencia del hito; unificar la lista de módulos con `entornos_globales.md:221`.

**Responsable:** Autor (QA) · **Esfuerzo: S**
**Origen:** R1 (MEDIA).

---

#### H-20 · MEDIA · RNF-15 (portabilidad)
**Título:** «Build limpio en ambas plataformas» no está definido y Linux no tiene mecanismo de verificación declarado.

**Detalle:** RNF-15 (`requerimientos.md:151`) exige compilar «en Windows y Linux con `npm install && npm run build`» y su criterio es «Build limpio en ambas plataformas». «Limpio» no se define: ¿código de salida 0?, ¿cero warnings?, ¿`tsc -b` estricto de RNF-13 (`:149`)? Y no existe mecanismo para verificar la mitad Linux: el entorno verificado es solo Windows con PowerShell/pwsh (`entornos_globales.md:12`), no hay CI ni WSL declarados. Corrección aplicada: el riesgo antes citado («en Linux no se regeneran los iconos») **ya está mitigado** por el propio documento —`entornos_globales.md:257` establece que en Linux la generación se hace una sola vez y los PNG se versionan en `public/icons/`—, por lo que el hallazgo es una indefinición del criterio y la falta de un medio de verificación Linux. **Necesita verificación** (no comprobable desde el entorno auditado: Windows, `estado_proyecto.md:42`).

**Evidencia:** `RepoTecnico/requerimientos.md:151`, `:149` · `RepoTecnico/entornos_globales.md:12`, `:257` · `RepoTecnico/estado_proyecto.md:42`.

**Recomendación:** Definir «build limpio» (exit 0, cero errores de tipos, warnings permitidos listados) y aportar un medio real de verificación en Linux: WSL2 documentado en `entornos_globales.md` o un workflow de CI (`ubuntu-latest`) que ejecute install+build+test. Si no hay Linux disponible, degradar RNF-15 a «verificado solo en Windows; pendiente en Linux», marcado explícitamente como **no verificado** en lugar de cumplido.

**Responsable:** Autor (build/entornos) · **Esfuerzo: M**
**Origen:** R1 (MEDIA).

---

#### H-21 · MEDIA · RF-27 / RNF-03 (polling de saldos)
**Título:** El ciclo de polling de 5 s no tiene disparador ni condición de parada, que es justo lo que RNF-03 pretende medir.

**Detalle:** RF-27 (`requerimientos.md:92`) fija el intervalo («cada 5 s») y RNF-03 (`:139`) acota «no debe superar 1 llamada RPC por cuenta visible por ciclo», con criterio «Inspección de logs del Service Worker» —inspección, no aserción—, pero ningún documento define las fronteras del ciclo: cuándo arranca (apertura del popup / de `connect.html`), cuándo se detiene (cierre de la vista, cambio de cuenta, RPC caído contemplado en RNF-07), si el intervalo es fijo o se reinicia tras cada cierre, y cuántas cuentas se pollean como máximo cuando la lista crece (la página de conexión lista todas las del mnemonic y RNF-03 no fija un máximo absoluto, de modo que las llamadas crecen linealmente). Los valores por defecto están en dos sitios coherentes entre sí (`diccionario_datos.md:163`; `entornos_globales.md:125`), pero sin la semántica de «ciclo» ni las condiciones de inicio/parada el test «1 llamada por cuenta por ciclo» no es reproducible.

**Evidencia:** `RepoTecnico/requerimientos.md:92`, `:139`, `:143` · `RepoTecnico/diccionario_datos.md:163` · `RepoTecnico/entornos_globales.md:125`.

**Recomendación:** Definir en RF-27 el disparador de inicio, la condición de parada, la semántica exacta de «ciclo» (ventana de 5 s con `chrome.alarms` o `setInterval`), el número máximo de cuentas polleadas, qué se muestra mientras la lectura está en vuelo y qué ocurre si falla. Acompañarlo de un test con contador de llamadas sobre un provider falso en lugar de «inspección de logs». Nota: si la implementación se hace en el popup, limpiar el intervalo al desmontar y no proponer `setInterval` en el SW (incompatible con MV3).

**Responsable:** Autor (arquitecto UI) · **Esfuerzo: S**
**Origen:** R1 (MEDIA).

---

#### H-22 · MEDIA · RF-08 / RF-19 / RF-31 y catálogo RPC (resultado observable de una transacción)
**Título:** No se define qué es una transacción «enviada con éxito» ni el comportamiento ante fallo de estimación de gas o revert.

**Detalle:** RF-08 pide enviar transferencias «con estimación de gas y confirmación del usuario» (`requerimientos.md:63`), RF-19 «solicitar aprobación al usuario y luego firmar y enviar» (`:79`) y RF-31 registrar las operaciones «con hash/firma resultante» (`:96`). Nada define el contrato observable: si el éxito se declara al devolver el hash o al confirmar recibo; los estados intermedios («firmada», «pendiente/confirmada», «revertida») y su representación en UI y logs; qué se hace si `estimateGas` revierte o falla (¿se bloquea el envío?, ¿se permite gasLimit manual?); ni qué se muestra ante un revert on-chain, caso frecuente en pruebas con Anvil. El catálogo RPC del diccionario (`:269-286`) incluye `eth_getTransactionByHash` (`:276`) pero **no `eth_getTransactionReceipt`**, y `TxPreview` (`:201-208`) solo modela `insufficientFunds` (`:208`); la tabla de códigos de error (`:290-299`) no cubre estimación fallida. Sin ese contrato, los tests de RF-08/RF-19/RF-31 solo pueden afirmar que la llamada devuelve algo.

**Evidencia:** `RepoTecnico/requerimientos.md:63`, `:79`, `:96` · `RepoTecnico/diccionario_datos.md:269-286`, `:276`, `:208`, `:290-299`.

**Recomendación:** Fijar en los RF el contrato observable: resultado de `eth_sendTransaction` = hash devuelto; estados de UI/log con sus transiciones; regla ante fallo de `estimateGas` (rechazar con código concreto y mensaje accionable, o permitir gasLimit manual); comportamiento ante revert. Añadir `eth_getTransactionReceipt` al catálogo RPC y un estado de «estimación fallida» a `TxPreview` si se va a verificar confirmación.

**Responsable:** Autor (arquitecto + analista) · **Esfuerzo: M**
**Origen:** R1 (MEDIA).

---

#### H-23 · MEDIA · Diccionario de datos · catálogo RPC ↔ entidad de cola
**Título:** `wallet_revokePermissions` requiere aprobación en el catálogo RPC pero no existe en el enum `method` de `truekeate_pending_request`.

**Detalle:** El catálogo de métodos de §4.3 marca `wallet_revokePermissions` como método que «Sí» requiere aprobación (`diccionario_datos.md:282`), y RF-26 lo confirma como Must desde el popup (DEC-06). Sin embargo el campo `method` de `truekeate_pending_request` enumera solo `eth_sendTransaction`, `eth_signTypedData_v4`, `personal_sign`, `wallet_switchEthereumChain` y `wallet_addEthereumChain` (`:127`). Una solicitud de revocación aprobable **no tendría representación persistida**, lo que contradice RNF-08 (reconstruir el estado pendiente desde `chrome.storage.local` tras dormirse el SW) para ese flujo, y deja sin contrato de datos un requisito Must. No hay ningún pasaje que documente una ejecución sin cola de aprobación.

**Evidencia:** `RepoTecnico/diccionario_datos.md:282` vs `:127` y `:230` · `RepoTecnico/requerimientos.md:86` (RF-26 Must), `:144` (RNF-08) · `RepoTecnico/estado_proyecto.md:61` (DEC-06).

**Recomendación:** Añadir `wallet_revokePermissions` al enum de `method` de `truekeate_pending_request` (con su `approvalId`, `origin` y estado) **o** documentar explícitamente que la revocación se ejecuta sin cola de aprobación —lo que obligaría a corregir la columna «¿Requiere aprobación?» del catálogo— y alinear ambos puntos con RF-26 en el mismo cambio.

**Responsable:** Autor (arquitecto de datos) · **Esfuerzo: S**
**Origen:** R2 (MEDIA).

---

#### H-24 · MEDIA · Línea base descartada / soporte e incidencias
**Título:** `GUIA_RAPIDA_TESTING.md` está desalineada con las decisiones cerradas, se usa como fuente de RF-25 y sigue catalogada como documento fuente; además no hay canal ni propietario de incidencias.

**Detalle:** Tres facetas del mismo defecto: (a) **Nomenclatura y esquemas contradictorios**: el diccionario define `truekeate_connected_sites` como mapa origen → objeto `{account, chainId, connectedAt, lastUsedAt}` (`diccionario_datos.md:104-116`), pero la guía documenta y opera sobre `codecrypto_connected_sites` con valor **string** (`GUIA_RAPIDA_TESTING.md:32-34`, `:74-76`, `:82-87`) y sobre `window.codecrypto` (`:23`, `:40`), a la vez que da por supuesto `npx hardhat node` (`:49`) en lugar de Anvil; son **dos contratos de storage distintos** para RF-25/RF-17/RF-26, lo que inducirá implementaciones divergentes en Fase 3. `entornos_globales.md:88-90` reproduce el snippet con la clave nueva pero sin advertir la forma canónica de cada entrada. Además `lastUsedAt` queda **huérfano de requisito**: no existe ningún RF que cubra expiración o caducidad de sesiones. (b) **Trazabilidad contaminada**: RF-25 (Must) declara como única fuente la etiqueta «**NUEVO** (guía de testing)» (`requerimientos.md:85`), y esa guía es documentación del prototipo anterior, la línea base que P-10/DEC-09 decidió no reutilizar; no existe fila de desviación que lo autorice. (c) **Documento fuente y escalado**: `estado_proyecto.md:28` cataloga `GUIA_RAPIDA_TESTING.md` como «✅ Fuente (no se modifica)», al mismo nivel que el enunciado, y su test completo remite a `FIX_DESCONEXION_SITIOS.md` (`GUIA_RAPIDA_TESTING.md:148`), documentación del intento anterior que por DEC-09 «no se reutiliza ni se versiona». El diseño no prevé canal de soporte, propietario de incidencias ni expectativa de respuesta: `estado_proyecto.md:143-152` termina en la Fase 3. Quien intente dar soporte siguiendo la guía que el proyecto conserva obtiene claves de storage inexistentes y un escalado hacia un archivo que no existirá.

**Evidencia:** `RepoTecnico/diccionario_datos.md:104-116` (objeto de 4 campos; `lastUsedAt` «para poder expirar/metricar sesiones»), `:110`, `:116` · `RepoTecnico/GUIA_RAPIDA_TESTING.md:23`, `:32-34`, `:40`, `:49`, `:74-76`, `:82-87`, `:93`, `:141`, `:148` · `RepoTecnico/entornos_globales.md:88-90` · `RepoTecnico/requerimientos.md:85` (RF-25), `:41` · `RepoTecnico/estado_proyecto.md:28`, `:64` (DEC-09), `:143-152`.

**Recomendación:** (1) Añadir nota vinculante en `diccionario_datos.md` §2.7 y `entornos_globales.md` §2.4 de que la forma canónica es el objeto por origen y que los snippets de `GUIA_RAPIDA_TESTING.md` corresponden al intento previo (P-10) y **no deben copiarse**; definir `chainId`/`lastUsedAt` (o eliminarlos) asociándolos a un RF explícito de expiración de sesiones o marcarlos como informativos. (2) Reclasificar la fuente de RF-25 como «NUEVO (decisión de diseño, no del enunciado)» anclada a RNF-11, sacar `GUIA_RAPIDA_TESTING.md` de la tabla de artefactos fuente y crear un documento de troubleshooting propio con nomenclatura `truekeate_`. (3) Definir el canal de soporte/incidencias con propietario y expectativa de respuesta.

**Responsable:** Autor (analista + soporte) · **Esfuerzo: M**
**Origen:** R2 (MEDIA esquemas/sesión), R5 (MEDIA fuente de RF-25), R4 (MEDIA soporte e incidencias) — fusionados.

---

#### H-25 · MEDIA · RNF — Capacidad de recuperación (ISO 25010, insuficiente)
**Título:** Sin RNF de respaldo/exportación ni de integridad: las cuentas importadas por clave privada son irrecuperables y `resetWallet` no tiene criterio de recuperación.

**Detalle:** RF-05 permite importar cuentas por clave privada y `diccionario_datos.md:49-50` guarda `privateKey` (32 bytes) asociada a la dirección: esa clave **no es re-derivable desde el mnemonic**, así que RF-11 (reset que «limpia la cartera (mnemonic, cuentas, sesiones)», `requerimientos.md:66`), la desinstalación o la corrupción de `chrome.storage.local` la destruyen de forma definitiva. Verificado por `grep`: **no existe** en ningún documento derivado un requisito ni un RNF de exportar/revelar el mnemonic o la clave privada, ni de confirmación destructiva en `resetWallet`, ni de retención/recuperación tras reset, ni de validación de integridad (checksum BIP-39 / EIP-55) al arrancar —las validaciones de `:49-50` son de entrada, no de integridad en reposo—. La tabla de riesgos (`requerimientos.md:270-281`) solo cubre fuga de claves, mnemonic en claro, CORS, inyección y numeración: no registra el riesgo de pérdida irrecuperable. La fuente contempla Export/Import solo como desafío **opcional** (`TAREA_PARA_ESTUDIANTE.md:2696-2697`) y su flujo de restauración solo promete cuenta activa, chainId y sesiones (`:104`, `:1015-1016`), por lo que el hueco es de la norma y no del brief.

**Evidencia:** `RepoTecnico/diccionario_datos.md:49-50` · `RepoTecnico/requerimientos.md:60` (RF-05 Must), `:66` (RF-11), `:133-156` (ningún RNF de respaldo), `:270-281` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2696-2697`, `:104`.

**Recomendación:** Añadir una categoría RNF de **Recuperación** con criterios verificables: (1) exportar/revelar mnemonic y clave privada protegido por confirmación explícita, nunca en logs (`diccionario_datos.md:184` prohíbe claves en `data`) ni al portapapeles sin aviso, verificado en E2E; (2) `resetWallet` exige confirmación destructiva e informa exactamente qué cuentas importadas se perderán (aserción E2E sobre el texto del diálogo); (3) al arrancar, validar checksum BIP-39 y EIP-55 de lo persistido y, ante corrupción, mostrar estado «wallet dañada» en lugar de derivar direcciones distintas en silencio; (4) registrar en la tabla de riesgos el riesgo «pérdida irrecuperable de cuentas importadas» con su mitigación.

**Responsable:** Autor (seguridad/cripto) · **Esfuerzo: M**
**Origen:** R3 (MEDIA).

---

#### H-26 · MEDIA · RNF — Cumplimiento y avisos al usuario (ISO 25010, ausente)
**Título:** El límite «solo desarrollo / sin fondos reales» no es requisito verificable y ninguna ventana muestra aviso de software, limitación de responsabilidad ni advertencia de riesgo.

**Detalle:** Verificado por `grep` que «cumplimiento», «licencia» y «CSP» no aparecen en `requerimientos.md` ni en `diccionario_datos.md`/`identidad_visual.md`, y que en la tabla RNF no existe la categoría Cumplimiento (`:135`). El enunciado fija un límite explícito («NO usar en producción / NO almacenar fondos reales / NO compartir mnemonic real», `TAREA_PARA_ESTUDIANTE.md:2599-2606`) que en los documentos derivados queda solo como riesgo aceptado (`requerimientos.md:207`, `:274`) y nota descriptiva (`:23`, `:58`), sin criterio de verificación ni requisito de que la UI lo anuncie. Tampoco hay RNF que exija justificar los permisos más auditados del diseño (`content_scripts.matches: ['<all_urls>']`, `all_frames: true`, `web_accessible_resources` con `<all_urls>`, `entornos_globales.md:153-159`). En la UI, la pantalla de bienvenida/«Acerca de» solo exige logotipo y tagline (RF-48, `requerimientos.md:128`); los formularios de creación/importación (RF-01/RF-02/RF-03), la exportación y el reset (RF-11) no exigen advertencia alguna; la búsqueda de «aviso legal|descargo|responsabilidad|garantía» en todo `RepoTecnico/` no arroja coincidencias. Vector concreto: la wallet acepta cualquier red con `wallet_addEthereumChain` sin validación y `isTestnet` es solo «Marca visual de red de pruebas» no vinculante (`diccionario_datos.md:88`, `:281`), de modo que un usuario puede añadir una red real y firmar sobre ella sin ninguna barrera; y al no existir cifrado, importar un mnemonic real deja la semilla en claro sin que el producto lo advierta. **Falso positivo retirado**: «no publicar en tienda» ya está cubierto por RT-09 y el RNF de CSP es redundante porque MV3 impone por defecto una CSP sin `unsafe-eval`.

**Evidencia:** `RepoTecnico/requerimientos.md:135`, `:23` (P-03), `:178` (RE-02), `:207`, `:274`, `:128-129`, `:172` · `RepoTecnico/diccionario_datos.md:88`, `:281` · `RepoTecnico/entornos_globales.md:153-159` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2599-2606` · `RepoTecnico/estado_proyecto.md:132`.

**Recomendación:** Añadir una categoría RNF de **Cumplimiento** con: (1) aviso no descartable en la UI («entorno de desarrollo, no usar con fondos reales») verificable por aserción E2E sobre el DOM, presente en el primer arranque, en la pantalla «Acerca de» y antes de la primera firma, con aceptación registrada en `truekeate_settings`; (2) advertencia al dar de alta redes no marcadas como `isTestnet`; (3) minimización y justificación por permiso en el manifest generado, contrastando `<all_urls>`/`all_frames` contra el mínimo necesario (`http://127.0.0.1:8545/*`, `http://localhost:8545/*`); (4) descargo de responsabilidad (software experimental sin garantía, el usuario es el único custodio de su frase y sus fondos); (5) fila en la tabla de excepciones que enlace el límite de la fuente con P-03/P-08 y su criterio de verificación.

**Responsable:** Autor (analista + UX) · **Esfuerzo: M**
**Origen:** R3 (MEDIA cumplimiento), R7 (MEDIA aviso legal/responsabilidad), R4 (MEDIA avisos «solo desarrollo») — fusionados.

---

#### H-27 · MEDIA · Stakeholders · Usuario final (perfil y expectativas)
**Título:** El usuario final no tiene perfil ni nivel de conocimientos: no se distingue al estudiante/desarrollador que levanta Anvil del evaluador que carga la extensión sin conocer el proyecto.

**Detalle:** El actor «Usuario (dueño de la wallet)» se define en una línea y sus objetivos son exclusivamente operativos (`requerimientos.md:188`): no hay perfil, nivel técnico ni expectativas de usabilidad. La ambigüedad es real y documental: el proyecto es formativo e individual (`requisitos.md:1`, `:13-15`; `TAREA_PARA_ESTUDIANTE.md:2810`) y el resumen ejecutivo lo describe como wallet no custodial «con las mismas capacidades básicas que MetaMask» (`requerimientos.md:12`), sin declarar que es una herramienta de desarrollo dirigida a un usuario que ya sabe qué es Anvil. El diseño asume conocimiento técnico sin declararlo: RF-12 ofrece un hint con la frase de prueba de Anvil (`:67`) y RF-23 da de alta redes pidiendo RPC/chainId/explorer (`:83`), campos que un evaluador externo no puede rellenar sin la guía. No existe ningún RF de ayuda/onboarding ni expectativa explícita para el evaluador que carga la extensión en un equipo limpio. Se mantiene MEDIA porque no hay ningún RF del enunciado perdido (la ayuda no es un requisito puntuado) y el perfil omitido es en gran medida el propio autor; el hallazgo subsiste porque el evaluador es un stakeholder declarado y su capacidad de operar el producto sin el autor es una expectativa legítima no documentada.

**Evidencia:** `RepoTecnico/requerimientos.md:188`, `:12`, `:67`, `:83` · `RepoTecnico/requisitos.md:1`, `:13-15` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2810`.

**Recomendación:** Definir en §4 dos perfiles con nivel técnico explícito («desarrollador/estudiante que levanta Anvil y prueba la dApp» y «evaluador que carga `dist/` sin conocer el proyecto»), con sus expectativas, y derivar de ellos los requisitos de ayuda y mensajes (posible RF nuevo). Aclarar en el resumen ejecutivo que es una herramienta formativa/de desarrollo, no un producto para usuarios finales.

**Responsable:** Autor (analista/UX) · **Esfuerzo: S**
**Origen:** R4 (MEDIA).

---

#### H-28 · MEDIA · Stakeholders · Custodia de claves y seguridad
**Título:** La custodia de claves recae en un componente y no en una persona: no hay propietario del riesgo ni decisión registrada sobre auditoría externa.

**Detalle:** La tabla de actores asigna la custodia a un actor de sistema («Service Worker (background) | Actor de sistema. | Custodiar material criptográfico…», `requerimientos.md:190`), que por definición no puede aceptar responsabilidad. Ningún humano responde por la protección, el ciclo de vida ni la recuperación del material criptográfico: RNF-09/RNF-10/RNF-12 (`:145-148`) definen controles técnicos, pero no hay propietario declarado ni expectativa de verificación independiente. El enunciado recomendaba para uso no experimental code review profesional, auditoría de seguridad y penetration testing (`TAREA_PARA_ESTUDIANTE.md:2625-2628`), y el diseño no registra ninguna decisión al respecto —ni para adoptarla ni para declararla explícitamente fuera de alcance—: las 20 decisiones DEC-01..DEC-20 de `estado_proyecto.md:54-75` no incluyen ninguna sobre propiedad de la seguridad o auditoría. Existe una acción de auditoría documental (`estado_proyecto.md:146` «Ejecutar /auditar»), pero es auditoría de requisitos, no de criptografía. Se mantiene MEDIA porque el proyecto es individual, formativo y en modo desarrollo: el defecto es la ausencia de decisión escrita, no la ausencia de auditoría.

**Evidencia:** `RepoTecnico/requerimientos.md:190`, `:145-148` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2625-2628` · `RepoTecnico/estado_proyecto.md:54-75`, `:146`.

**Recomendación:** Nombrar en §4 al responsable de seguridad del proyecto (el propio autor, con el alcance de lo que asume) y cerrar la expectativa con una decisión explícita del tipo «sin auditoría externa por alcance de Fase 1», compensada con evidencia reproducible: RNF-09 y RNF-10 ya prevén inspección de mensajes y el test de inyección desde iframe hostil (`requerimientos.md:145-146`).

**Responsable:** Autor (responsable de seguridad) · **Esfuerzo: S**
**Origen:** R4 (MEDIA).

---

#### H-29 · MEDIA · Stakeholders · Mantenimiento y actualizaciones
**Título:** El ciclo de vida termina en la entrega: no hay responsable del código, política de actualización de dependencias ni respuesta a cambios de la plataforma MV3.

**Detalle:** El proyecto se documenta hasta la fase de manuales y se detiene: `estado_proyecto.md:143-152` («Próximos pasos») cierra en la Fase 3 y no contempla mantenimiento, no hay propietario del código tras la entrega, ni política de actualización de dependencias, ni procedimiento ante cambios de MV3 o ante una vulnerabilidad en la librería criptográfica. Los riesgos concretos están ya identificados en los propios documentos y quedan sin dueño: RNF-04 fija Chrome/Edge ≥ 114 (`requerimientos.md:140`) mientras MV3 rompe extensiones con regularidad; RT-02 impone `ethers.js v6` como única librería criptográfica (`:165`), de modo que una vulnerabilidad en ethers no tiene procedimiento de actualización; y el entorno fija **Foundry 1.7.2-dev sin rango soportado** (`entornos_globales.md:16`), lo que puede hacer fallar pruebas E2E del evaluador en otro equipo por causas ajenas al producto. Se integra aquí la parte superviviente del hallazgo sobre el operador del nodo RPC (rango de versión de Foundry y verificación previa de las pruebas E2E), cuya parte sobre `chrome.permissions.request` se descartó por estar ya especificada en `entornos_globales.md:164`.

**Evidencia:** `RepoTecnico/estado_proyecto.md:143-152`, `:22-36` · `RepoTecnico/requerimientos.md:140` (RNF-04), `:165` (RT-02) · `RepoTecnico/entornos_globales.md:16`, `:222`.

**Recomendación:** Añadir en `estado_proyecto.md` una sección **«Mantenimiento y ciclo de vida»** con responsable, política de actualización de dependencias (incluido ethers) y de compatibilidad MV3, canal de reporte de defectos y criterio de congelación de versiones para la entrega (`package-lock.json` versionado y build reproducible). Documentar además la versión mínima y máxima de Foundry soportada y una verificación previa de las pruebas E2E.

**Responsable:** Autor (mantenimiento) · **Esfuerzo: M**
**Origen:** R4 (MEDIA).

---

#### H-30 · MEDIA · Trazabilidad · Requisitos inventados sin fila de desviación
**Título:** RF-07 (QR/copiar) y RF-25 (persistencia por origen, Must) no están cubiertos por ninguna fila D-xx ni por el registro de la entrevista.

**Detalle:** De los requisitos declarados NUEVO —RF-05, RF-06, RF-07, RF-21, RF-25, RF-26, RF-34, RF-37, RF-40, RF-48, RF-49— la mayoría están correctamente autorizados: RF-05/RF-06 en D-03 y P-06, RF-21 y RF-26 en P-05/P-06 (con DEC-06), RF-37 y RF-40 en D-06, RF-48/RF-49 en el anexo de identidad visual, RF-34 en P-09/RT-10, y el cambio de prioridad de RF-07 y RF-21 a Must está registrado en P-05 (`requerimientos.md:235`). Quedan dos huecos verificables: (a) **RF-07** (vista de recepción con QR y copiar) es Must y **no tiene fila D-xx**; D-04 solo registra la ambigüedad de lectura de «enviar y recibir», y ninguna desviación lo autoriza como requisito nuevo, aunque DEC-03 lo mencione de pasada; (b) **RF-25** es Must y no aparece en ninguna fila D-xx ni en ninguna respuesta de la entrevista, siendo además el de fuente más dudosa (H-24). Con RNF-01 exigiendo que el 100 % de los Must esté cubierto por un caso de uso trazado, dos requisitos Must sin autorización ni origen documentado impiden cerrar esa matriz. **Filtrado aplicado:** la afirmación de que RF-40 «queda sin fila de desviación» es falsa (D-06 lo añade explícitamente junto a RF-37), y la de que P-05 cambió prioridades sin registrar también es falsa (la propia fila P-05 lo registra); por eso se baja de ALTA a MEDIA.

**Evidencia:** `RepoTecnico/requerimientos.md:62` (RF-07 | NUEVO | Must), `:85` (RF-25 | NUEVO | Must), `:203-204` (D-03, D-04), `:206` (D-06), `:235` (P-05), `:137` (RNF-01).

**Recomendación:** Añadir una tabla **«trazabilidad de requisitos nuevos»** con columnas (RF | origen: fila D-xx o P-xx | justificación | prioridad resultante) que cubra los 11 RF NUEVO, y crear las filas de desviación que faltan para RF-07 y RF-25 (o degradarlos a Should si no se pueden justificar como Must).

**Responsable:** Autor (analista) · **Esfuerzo: S**
**Origen:** R5 (MEDIA).

---

#### H-31 · MEDIA · EIP-6963 · Inyección y descubrimiento del provider
**Título:** El contrato EIP-6963 queda en una línea de mitigación: falta el re-anuncio y el registro síncrono del listener.

**Detalle:** La premisa principal del hallazgo original era incorrecta: el auto-anuncio EIP-6963 **sí** aparece en la documentación de diseño (`requerimientos.md:277`: «Inyectar `inject.js` de forma síncrona y anunciar EIP-6963 al `DOMContentLoaded`»), y el `icon` **sí** está especificado como data-URI PNG del isologo de 96 px (`identidad_visual.md:236`, confirmado en P-13), además del uuid fijo y el `rdns` (`entornos_globales.md:280-282`). Lo que subsiste es que el requisito no se concreta en un contrato verificable: RF-44 es «Should» (`requerimientos.md:119`), el mensaje interno `TRUEKEATE_ANNOUNCE` existe en el protocolo (`diccionario_datos.md:252`) pero ningún documento define el mecanismo (cuándo se emite `eip6963:announceProvider`, si se re-emite en cada `eip6963:requestProvider`, si se conserva la última anunciación). El patrón de referencia solo atiende peticiones y hace un auto-anuncio por dispatch de `requestProvider` (`TAREA_PARA_ESTUDIANTE.md:1254-1269`), lo que no cubre a un dApp que registre su listener de `announceProvider` **después** de que se emita el anuncio único: sin re-emisión, ese dApp no encuentra el provider. Impacto acotado (3 de los 36 puntos del baremo, `TAREA_PARA_ESTUDIANTE.md:2440`) y corrección trivial.

**Evidencia:** `RepoTecnico/requerimientos.md:119`, `:277` · `RepoTecnico/entornos_globales.md:280-282` · `RepoTecnico/identidad_visual.md:236` · `RepoTecnico/diccionario_datos.md:252` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:1254-1269`, `:2440`.

**Recomendación:** Concretar el contrato en `entornos_globales.md` §10 y `diccionario_datos.md` §4.1: `eip6963:announceProvider` se emite (a) al cargar `inject.js`, (b) en cada `eip6963:requestProvider` recibido y (c) de nuevo en `DOMContentLoaded` para los dApp que registran tarde; el registro del listener debe hacerse de forma **síncrona** en el IIFE de `inject.js`, nunca tras un `await`. Especificar `detail: { info: { uuid, name, icon (data-URI), rdns }, provider: window.truekeate }` y añadir un caso Gherkin que verifique el descubrimiento con un dApp que emita `requestProvider` antes y después de `DOMContentLoaded`.

**Responsable:** Autor (arquitecto MV3) · **Esfuerzo: S**
**Origen:** R6 (MEDIA).

---

#### H-32 · MEDIA · Seguridad de la cadena de mensajes
**Título:** Falta la guarda de `sender` en el Service Worker y la lista cerrada de métodos internos; los métodos «interna (solo popup)» no tienen comprobación especificada.

**Detalle:** El diccionario exige validar `event.source === window` y `event.origin === location.origin` en la capa página↔content (`diccionario_datos.md:254`) y la tabla de métodos marca `wallet_deriveAccounts`, `wallet_generateMnemonic`, `wallet_importPrivateKey`, `wallet_getNetworks` y `wallet_getLogs` como «interna (solo popup)» (`:283-286`), pero ningún documento define cómo se comprueba esa condición del lado del SW: el mensaje `TRUEKEATE_RPC` lleva un campo `origin` que llega **como dato de la página** (`:129`, `:260`) y no hay ninguna exigencia de validar `sender.tab`/`sender.id` (`grep` de `sender.` en `RepoTecnico/` solo encuentra `sender.tab?.url` como lectura informativa en `TAREA_PARA_ESTUDIANTE.md:560`). Los tipos `SIGN_RESPONSE` y `CONNECT_RESPONSE` —que resuelven una aprobación o conexión pendiente— no exigen ni `sender.id === chrome.runtime.id`, ni allowlist de rutas (`notification.html`, `connect.html`, content scripts), ni validación de `sender.url`/`sender.tab`; RNF-10 enuncia la validación solo para «los mensajes entre página y extensión» y su criterio solo contempla el canal externo (iframe hostil, `requerimientos.md:146`). El patrón de referencia hace `postMessage(..., '*')` sin comprobar `event.source` ni `event.origin` (`TAREA_PARA_ESTUDIANTE.md:783-788`) y expone `wallet_deriveAccounts` invocable por mensaje con el mnemonic como parámetro (`:2896-2909`). Con `web_accessible_resources` sobre `<all_urls>` (`entornos_globales.md:159`) y sin tabla de métodos permitidos por contexto, el diseño no impide que un método interno llegue por el camino página→content→SW. Se cita, sin cuestionarla, la decisión P-03 (mnemonic en claro) como riesgo aceptado; lo que falta es un endurecimiento que no cuesta nada. **Necesita verificación en Fase 3**: es un requisito ausente, no un fallo demostrado.

**Evidencia:** `RepoTecnico/diccionario_datos.md:129`, `:254`, `:256-263`, `:283-286` · `RepoTecnico/entornos_globales.md:159` · `RepoTecnico/requerimientos.md:146` (RNF-10), `:145`, `:148` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:560`, `:783-788`, `:2896-2909`.

**Recomendación:** Reescribir RNF-10 como dos requisitos con criterio propio: (a) **canal externo** —la validación ya documentada, enviando siempre con `targetOrigin = location.origin` y nunca `'*'`, con test negativo de iframe del mismo origen—; (b) **canal interno** —validación obligatoria del emisor en `chrome.runtime.onMessage`: `sender.id === chrome.runtime.id` más allowlist de rutas para `SIGN_RESPONSE`/`CONNECT_RESPONSE`, con prueba negativa lanzada desde una página cualquiera—. Definir en `diccionario_datos.md` §4.2/§4.3 dos tablas de métodos con sus guardas (métodos de página: `sender.tab` presente y origen validado; métodos internos: solo si `sender.tab === undefined` y `sender.url` pertenece a una página de la extensión) y documentar como medida obligatoria `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` al arrancar el SW, que es la barrera que impide a un content script leer el mnemonic del storage en el escenario aceptado P-03.

**Responsable:** Autor (seguridad) · **Esfuerzo: M**
**Origen:** R6 (MEDIA seguridad de la cadena de mensajes), R7 (MEDIA autenticación de mensajes internos / RNF-10) — fusionados.

---

#### H-33 · MEDIA · Persistencia de sesiones por origen
**Título:** El origen de la dApp se fija con puerto pero no se configura el servidor de la dApp: la clave de sesión cambia y rompe RF-25/RF-26.

**Detalle:** `truekeate_connected_sites` se indexa por origen completo incluyendo puerto y lo ejemplifica como `http://localhost:5174` (`diccionario_datos.md:110`, `:116`), y `entornos_globales.md:33` sitúa la dApp de pruebas en `http://localhost:5174/test.html`. Sin embargo no existe configuración de servidor que fije ese puerto: la tabla de comandos solo dice `npm run dev` (`:70`) y el `vite.config.ts` documentado describe únicamente `input`/`output`/plugin de manifest, sin `server.port` ni `strictPort` (`TAREA_PARA_ESTUDIANTE.md:2853-2876`). El puerto por defecto de Vite es **5173** y se desplaza si está ocupado. Consecuencia encadenada: una sesión guardada bajo un origen no coincide con el nuevo → `eth_accounts` devuelve `[]` (RF-17/RF-25) y el usuario interpreta que la persistencia de conexión falla; y al revés, tras revocar (RF-26) el dApp puede quedar autorizado bajo un origen distinto del revocado. La propia guía lista «Connection lost after reload» como problema común (`GUIA_RAPIDA_TESTING.md:137`) y usa la forma `http://localhost:...` sin puerto fijo al desconectar sitios (`:84`), lo que confirma que el puerto se trata como incidental en lugar de como parte de la clave.

**Evidencia:** `RepoTecnico/diccionario_datos.md:110`, `:116` · `RepoTecnico/entornos_globales.md:33`, `:70` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2853-2876` · `RepoTecnico/GUIA_RAPIDA_TESTING.md:84`, `:137`.

**Recomendación:** Fijar el puerto en la documentación de entorno: añadir a `entornos_globales.md` §2.2 la configuración `server: { port: 5174, strictPort: true }` (y la equivalente de `preview`), declarar `test.html` servido en ese origen como requisito de las pruebas E2E, y documentar en `diccionario_datos.md` §2.7 que la clave de sesión es el **origen exacto con puerto** (normalizado: minúsculas, sin barra final). Incluir `http://localhost:5173/*` y `http://localhost:5174/*` en los `matches` de Playwright y sustituir el `'http://localhost:5174'` literal de la guía de depuración por la lectura de la clave real.

**Responsable:** Autor (build/entornos) · **Esfuerzo: S**
**Origen:** R6 (MEDIA).

---

#### H-34 · MEDIA · Alcance y plazo
**Título:** El plazo declarado de ~40 h contradice las 51-68 h que suman las fases del propio material fuente.

**Detalle:** El resumen ejecutivo fija «Duración estimada: ~40 h» (`requerimientos.md:25`) y el riesgo se clasifica como probabilidad Media/impacto Medio con mitigación «plan vertical por hitos» (`:280`, `estado_proyecto.md:137`). Los números del material fuente no cuadran: las Fases 1-10 del enunciado suman **51-68 h** (2-3 + 4-5 + 6-8 + 8-10 + 12-15 + 3-4 + 4-5 + 6-8 + 4-6 + 2-3, en `TAREA_PARA_ESTUDIANTE.md:1820-1944`) y el cronograma sugerido admite 40-55 h (`:2757-2770`). La discrepancia no es una estimación alternativa del revisor, sino una incoherencia entre el titular del documento y su fuente. Además, la Fase 1 amplió el alcance respecto al enunciado en partidas Must no presupuestadas allí: importación por clave privada (RF-05, `:60`), QR de recepción (RF-07, `:62`), revocación de permisos (RF-26, `:86`) e identidad visual en tres ventanas más la dApp (RF-49, Must, `:129`), sobre un stack de tres frameworks de prueba (RT-07, `:170`) y con reconstrucción desde cero (P-10). El «~40 h» no es por tanto defendible ni auditable frente a esas fuentes.

**Evidencia:** `RepoTecnico/requerimientos.md:25`, `:280`, `:60`, `:62`, `:86`, `:129`, `:170` · `RepoTecnico/estado_proyecto.md:137` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:1820-1944`, `:2757-2770`.

**Recomendación:** No arrastrar el «~40 h» como duración del proyecto: sustituirlo en el resumen ejecutivo por la estimación por hitos que se elabore en el `plan_desarrollo.md` de la Fase 3 y registrar en `estado_proyecto.md` una tabla **«Must del MVP vs Should postergables»** que haga explícito qué cae si el presupuesto se agota (candidatos: RF-06, RF-32, RF-38/RF-39 y acabados de identidad). Revisar la fila de riesgo de plazo con el valor real y su plan de recorte, en lugar de dejarla como Media/Media con una mitigación genérica.

**Responsable:** Autor (planificación) · **Esfuerzo: S**
**Origen:** R6 (MEDIA).

---

#### H-35 · MEDIA · Phishing / UI spoofing en la ventana de confirmación
**Título:** La ventana de aprobación no se abre con foco ni `alwaysOnTop`, y no hay requisito de mostrar el origen solicitante ni insignias de riesgo.

**Detalle:** La apertura documentada de la ventana de aprobación es `chrome.windows.create({ url: 'notification.html' })` **sin** `focused`/`alwaysOnTop` ni `chrome.windows.update(..., { focused: true })` (`requisitos.md:310`, `TAREA_PARA_ESTUDIANTE.md:1090`), y el diseño no exige que la pestaña de origen pase a primer plano al aprobar, por lo que una página puede lanzar ventanas de confirmación superpuestas o detrás de su propio contenido falso (patrón clásico de aprobación engañada). El diccionario registra el `origin` de la solicitud pendiente y el favicon del origen para la conexión (`diccionario_datos.md:129`, `:148-149`), y la fuente exige mostrar el origen en el flujo de conexión (`requisitos.md:557`), pero **no se exige lo mismo en la ventana de confirmación**: la UI descrita allí muestra solo Para/Valor/Red (`:318-321`). Tampoco hay requisito anti-spoofing (badge con el nombre de la extensión, origen visible junto al botón de aprobar, imposibilidad de imitar la apariencia) ni insignia de riesgo (origen desconocido / recién conectado / contrato no verificado). Asimetría verificada: la identidad visual define para `notification.html` «badge del tipo de solicitud (tx / firma / red)» y para `connect.html` «Igual + origen de la dApp» (`identidad_visual.md:137-138`), dejando la confirmación sin origen. La detección de phishing aparece únicamente en el enunciado bajo «Para Producción Requeriría» (`TAREA_PARA_ESTUDIANTE.md:2608-2623`).

**Evidencia:** `RepoTecnico/requisitos.md:310`, `:557`, `:318-321` · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:1090`, `:2608-2623` · `RepoTecnico/requerimientos.md:105` (RF-35) · `RepoTecnico/diccionario_datos.md:129`, `:148-149` · `RepoTecnico/identidad_visual.md:137-138`.

**Recomendación:** Añadir en Fase 2 a RF-35/RF-41: mostrar **siempre** en `notification.html` el origen solicitante con favicon e insignia de riesgo (origen desconocido / conectado hace menos de N minutos / contrato no verificado); abrir la ventana con foco y al frente (`focused: true`, `alwaysOnTop` o `chrome.windows.update`) y traer la pestaña de origen al primer plano al aprobar; impedir más de una ventana de confirmación simultánea por origen; y añadir un criterio de verificación negativo de UI suplantada (overlay HTML sobre la ventana de la extensión) junto a los ya previstos para RNF-10.

**Responsable:** Autor (UX + seguridad) · **Esfuerzo: M**
**Origen:** R7 (MEDIA).

---

#### H-36 · MEDIA · Permisos amplios / mínimos privilegios (MV3) y RPC arbitrario
**Título:** El borrador del manifest declara `tabs` y `activeTab` de forma solapada y sin uso que los justifique, y deja sin decidir la política de hosts RPC que la propia app admite en tiempo de ejecución.

**Detalle:** El borrador de permisos incluye `storage`, `tabs`, `activeTab`, `notifications` y `scripting` (`entornos_globales.md:148`). `tabs` y `activeTab` se declaran juntos sin que el diseño use sus capacidades exclusivas: `chrome.tabs.query`/`sendMessage` no requieren `tabs` (solo lo requieren la lectura de `url`/`title`/`favIconUrl`, y el diseño no exige leer ninguna de ellas en el SW), mientras que `activeTab` solo aplica a la pestaña tras una acción del usuario y no aporta nada al flujo de `chrome.tabs.query` por origen. La justificación heredada del enunciado («`tabs` // Para `chrome.tabs.query`», `TAREA_PARA_ESTUDIANTE.md:827-831`) es el ejemplo genérico de la implementación previa, no un uso derivado de estos requisitos. Por otro lado hay una incoherencia de diseño no resuelta: `host_permissions` solo cubre `http://127.0.0.1:8545/*` y `http://localhost:8545/*` (`entornos_globales.md:149-152`), pero RF-23 y `wallet_addEthereumChain` permiten dar de alta URLs RPC arbitrarias y el diccionario reconoce que la URL «debe estar en `host_permissions` o solicitarse permiso» (`diccionario_datos.md:84`) sin decidir cuál de las dos vías se implementa; `entornos_globales.md:164` deja la solicitud de permiso en tiempo de ejecución como posibilidad futura. Sin esa decisión, o la funcionalidad de añadir redes falla cuando el host no está declarado, o se acaba solicitando acceso amplio a hosts arbitrarios sin política de validación documentada (esquema/host), con el riesgo añadido de apuntar la wallet —y la firma del usuario— a un RPC no confiable que observe su actividad y devuelva estimaciones de gas/fee manipuladas.

**Evidencia:** `RepoTecnico/entornos_globales.md:148`, `:149-152`, `:164` · `RepoTecnico/diccionario_datos.md:84` · `RepoTecnico/requerimientos.md:83` (RF-23), `:167` (RT-04) · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:827-831`.

**Recomendación:** Ajustar el manifest al uso real en Fase 2-3: eliminar `tabs` si no se leen `url`/`title` (o documentar exactamente la funcionalidad que lo exige) y no declarar `activeTab` y `tabs` a la vez; declarar `scripting` solo si se usa realmente `chrome.scripting`. Definir explícitamente en `entornos_globales.md` §4 la **política de RPC añadidos por la dApp**: validación de esquema (`https` preferente, `http` solo en local) y host, `chrome.permissions.request` en runtime con permiso opcional, y registro del permiso concedido por red en `truekeate_networks`, con criterio de verificación en Fase 4.

**Responsable:** Autor (seguridad/plataforma) · **Esfuerzo: M**
**Origen:** R7 (MEDIA).

---

#### H-37 · MEDIA · Cumplimiento legal · Licencias de activos, fuentes y código
**Título:** No existe LICENSE ni NOTICE en el repositorio y los activos de marca y las fuentes auto-hospedadas se empaquetan sin trazabilidad de licencia.

**Detalle:** Verificado por listado recursivo y por `git ls-files`: el repositorio **no contiene `LICENSE`, `NOTICE`, `COPYING` ni `THIRD_PARTY_LICENSES.md`**. Los activos de marca están versionados y destinados a redistribuirse dentro del paquete (`TrueKeate/` → `public/brand/`, `public/icons/`, favicon de la dApp) declarando que «no se modifican» (`entornos_globales.md:239`, `:250-251`), pero ningún documento registra su origen, titularidad ni autorización de uso: `identidad_visual.md` solo describe su análisis de píxeles para extraer la paleta (DEC-15/DEC-16). Además se planifica auto-hospedar Poppins, Inter y JetBrains Mono en `public/fonts/` (RT-12, `requerimientos.md:176`) sin exigir la inclusión de sus licencias; las tres familias se distribuyen bajo SIL OFL-1.1, que obliga a conservar el aviso de copyright y el texto de licencia al redistribuir los woff2, y RNF-20 exige precisamente servir los activos desde el propio paquete (`:156`), es decir, redistribuirlos. El riesgo está acotado ahora (proyecto académico, repos remotos aún inexistentes y activos entregados por el propio usuario vía DEC-15), pero falta la trazabilidad que lo evite al publicar.

**Evidencia:** `git ls-files` sin `LICENSE`/`NOTICE`/`COPYING`; búsqueda recursiva de `^(LICENSE|NOTICE|COPYING|THIRD)` sin resultados (26 archivos versionados) · `RepoTecnico/entornos_globales.md:239` y `:250-251` · `RepoTecnico/requerimientos.md:176` (RT-12), `:156` (RNF-20) · `RepoTecnico/identidad_visual.md:24-28`, `:126`.

**Recomendación:** Crear `LICENSE` del código, `NOTICE`/`THIRD_PARTY_LICENSES.md` y `public/fonts/LICENSE-poppins.txt`, `LICENSE-inter.txt`, `LICENSE-jetbrains-mono.txt` con el texto OFL-1.1 y el aviso de copyright de cada familia; documentar en `identidad_visual.md` la procedencia y la autorización de uso de los activos TrueKeate (cesión del titular, licencia interna o marca propia, según DEC-15); y añadir un criterio de verificación en Fase 4: «todo activo o fuente redistribuido en `dist/` tiene su licencia registrada en el repositorio».

**Responsable:** Autor + titular de los activos de marca · **Esfuerzo: S**
**Origen:** R3 (MEDIA cumplimiento, parte de licencias), R7 (MEDIA licencias) — fusionados.

---

### 🔵 BAJA

#### H-38 · BAJA · Trazabilidad · columna Fuente
**Título:** RF-18 cita `eth_blockNumber` sin respaldo en el enunciado y RF-43 usa «Aprendizaje», valor que rompe la convención declarada.

**Detalle:** Dos desajustes de la misma columna: (a) **RF-18** agrupa `eth_chainId`, `eth_getBalance` y `eth_blockNumber` con fuente «E-06, E-11» (`requerimientos.md:78`); E-06 es «RPC por Defecto» y E-11 «Polling de Saldos», y la cadena `eth_blockNumber` **no aparece en ninguna parte del enunciado** (`grep` sin coincidencias en `TAREA_PARA_ESTUDIANTE.md`). (b) **RF-43** (EIP-155: incluir `chainId` en la firma y verificarlo) usa «Aprendizaje» como fuente (`:118`), único valor de las 40 filas que rompe la convención `E-n` o `NUEVO` (`:50`); remite a «Estándares Web3 (EIPs)» de los objetivos de aprendizaje, donde EIP-155 aparece **sin numeración E-xx** (`requisitos.md:29-34`). En ambos casos la funcionalidad es correcta; es la cita la que no es exacta, por lo que la matriz RF ↔ enunciado apuntará a la especificación equivocada. Nota de filtrado: la versión sustantiva del hallazgo sobre RF-43 («no existe ningún objetivo de aprendizaje que cubra EIP-155») fue **descartada como falso positivo** por R2 —el objetivo sí existe, `requisitos.md:30`—; solo sobrevive esta imprecisión formal de convención, por lo que el hallazgo se mantiene en BAJA.

**Evidencia:** `RepoTecnico/requerimientos.md:78` (RF-18 | E-06, E-11), `:118` (RF-43 | Aprendizaje), `:50` (convención Fuente) · `RepoTecnico/requisitos.md:58` (E-06), `:69` (E-11), `:29-34` (`✅ EIP-155: Replay Protection for Transactions`) · `grep` de `eth_blockNumber` en `RepoTecnico/TAREA_PARA_ESTUDIANTE.md`: 0 coincidencias.

**Recomendación:** Marcar `eth_blockNumber` en RF-18 como «**NUEVO (derivado de E-06/E-11)**» o como extensión del catálogo de lectura. Sustituir «Aprendizaje» en RF-43 por una referencia concreta («Objetivos de aprendizaje — Estándares Web3: EIP-155») o añadir formalmente la categoría `DERIVADO`/`OBJETIVO` a la convención de la columna Fuente, de modo que todo valor de esa columna sea auditable contra el enunciado.

**Responsable:** Autor (analista) · **Esfuerzo: S**
**Origen:** R2 (BAJA), R5 (BAJA) — fusionados.

---

#### H-39 · BAJA · Consistencia del protocolo de mensajes
**Título:** `TRUEKEATE_EVENT` designa dos saltos distintos (content → inject y SW → content) sin nota de reenvío.

**Detalle:** El protocolo declara `TRUEKEATE_EVENT` en dos tablas con direcciones diferentes y los mismos nombres de campo (`eventName`, `data`): en §4.1 como content → inject sobre `window.postMessage` (`diccionario_datos.md:251`) y en §4.2 como SW → content sobre `chrome.runtime.sendMessage` (`:263`). No hay contradicción de contenido, pero el mismo `type` cubre dos saltos consecutivos sin prefijo ni nota de que el content script reenvía sin transformación; el riesgo es que un implementador asuma un único canal (p. ej. que el SW publica directamente en la página o que el content script consume lo mismo que reenvía) y los eventos dejen de llegar al provider. Los demás tipos del protocolo sí están diferenciados por salto (`TRUEKEATE_RPC`, `SIGN_RESPONSE`, `CONNECT_RESPONSE`, `:249-263`).

**Evidencia:** `RepoTecnico/diccionario_datos.md:251` y `:263` · `:249-252` y `:260-263` · `RepoTecnico/entornos_globales.md:284` (nomenclatura de tipos, P-13/DEC-18).

**Recomendación:** Añadir en §4.1/§4.2 una nota explícita de que `TRUEKEATE_EVENT` atraviesa **dos saltos** (SW → content → página) y que el content script lo reenvía literalmente, o renombrar el salto interno (p. ej. `TRUEKEATE_EVENT_PUSH` para SW → content) reservando `TRUEKEATE_EVENT` para content → inject. **No es un cambio de decisión** (los tipos están congelados en P-13/DEC-18): si se renombra, debe registrarse como enmienda a P-13.

**Responsable:** Autor (arquitecto) · **Esfuerzo: S**
**Origen:** R2 (BAJA).

---

#### H-40 · BAJA · RNF — Seguridad (control anti-suplantación huérfano)
**Título:** `domainChainMismatch` se define como disparador de una advertencia en UI que ningún RF ni RNF exige.

**Detalle:** El diccionario de datos define `TypedDataPreview.domainChainMismatch` como «`true` si `domain.chainId ≠ chainId` activo → advertencia en UI» (`diccionario_datos.md:218`), pero ningún requisito recoge esa advertencia: RF-20 solo exige mostrar `domain`, `types` y `message` en la confirmación (`requerimientos.md:80`) y los RNF de seguridad (RNF-09..RNF-12, `:145-148`) cubren fuga de claves, validación de `origin`/`source`, `eth_accounts` y aprobación explícita, sin ningún criterio de advertencia por desajuste de dominio/red. Es un comportamiento especificado en el modelo de datos y **huérfano** en el catálogo de requisitos, justo en el punto donde la fuente sitúa la detección de phishing de producción (`TAREA_PARA_ESTUDIANTE.md:2623`). Se retiran del hallazgo original (cifrado PBKDF2, auto-lock, CSP, rate limiting), que la propia fuente agrupa bajo «Para Producción Requeriría» (`:2608-2623`) y cuya exclusión es coherente con el alcance.

**Evidencia:** `RepoTecnico/diccionario_datos.md:218` · `RepoTecnico/requerimientos.md:80` (RF-20), `:145-148` (RNF-09..RNF-12) · `RepoTecnico/TAREA_PARA_ESTUDIANTE.md:2608-2623`.

**Recomendación:** Cerrar el huérfano con un criterio mínimo en lugar de abrir el alcance de producción: añadir a RF-20 (o a un RNF de seguridad) que la ventana de confirmación de `eth_signTypedData_v4` muestre el `origin` de la dApp y, cuando `domainChainMismatch` sea `true`, un aviso destacado en español, verificado por aserción E2E sobre el DOM de `notification.html`. Registrar además en la tabla de excepciones (H-26) que cifrado/auto-lock/rate limiting/CSP quedan fuera por `TAREA_PARA_ESTUDIANTE.md:2608-2623` y por P-03/P-08.

**Responsable:** Autor (analista + seguridad) · **Esfuerzo: S**
**Origen:** R3 (BAJA).

---

#### H-41 · BAJA · Exposición del nodo local / endurecimiento
**Título:** El comando Anvil documentado abre CORS a cualquier origen contra el RPC local.

**Detalle:** La receta de arranque del nodo de pruebas usa `--http.corsdomain "*"` (`entornos_globales.md:53`), de modo que cualquier sitio visitado en el mismo equipo puede invocar el JSON-RPC local directamente (además de facilitar escenarios de DNS rebinding hacia `127.0.0.1`). La restricción RE-04 solo exige que el RPC permita CORS «desde el origen de la extensión» (`requerimientos.md:180`), objetivo que cumple igualmente una allowlist concreta, y el registro de riesgos documenta el problema CORS únicamente en la dirección contraria (que CORS bloquee la extensión, `estado_proyecto.md:134`). No compromete claves ni el mnemonic —estos no salen del Service Worker (RNF-09)—, por lo que el impacto se limita al entorno local y a la contaminación de la red de pruebas, pero es un endurecimiento de coste nulo.

**Evidencia:** `RepoTecnico/entornos_globales.md:52-53` · `RepoTecnico/requerimientos.md:180` (RE-04) · `RepoTecnico/estado_proyecto.md:134`.

**Recomendación:** Sustituir `--http.corsdomain "*"` por la lista concreta de orígenes necesarios (el origen de la extensión y `http://localhost:5174` para `test.html`) y dejar constancia en RE-04 de que el comodín solo sería aceptable en una máquina de desarrollo aislada y sin navegación a sitios de terceros.

**Responsable:** Autor (entornos) · **Esfuerzo: S**
**Origen:** R7 (BAJA).

---

#### H-42 · BAJA · Logs / privacidad
**Título:** El log persistente registra los `params` de cada llamada sin regla de redacción y sobrevive al reset de la cartera.

**Detalle:** RF-28 exige registrar cada llamada al provider con «método, params, origen y timestamp» (`requerimientos.md:93`) y RF-32 hace que los logs se guarden sobreviviendo a `resetWallet` (`:97`). El diccionario matiza que el campo `data` es un «payload resumido (sin claves privadas ni mnemonic)» (`diccionario_datos.md:184`), pero **no impone ninguna regla de redacción sobre los `params`**, de modo que el mensaje firmado en `personal_sign`, el JSON completo de `eth_signTypedData_v4` o el calldata de una transacción pueden quedar en claro en un almacén persistente que el usuario no asocia a contenido sensible; RNF-09 solo prohíbe que salgan el mnemonic y las claves privadas, no los payloads firmados. Falta también una política de expiración/máximo de entradas por origen (existe `logLimit = 500` global, `diccionario_datos.md:164`). Impacto bajo (almacén local del propio usuario, sin salida a red), pero es un requisito de redacción y un caso de prueba ausentes. **Necesita verificación** hasta que exista código.

**Evidencia:** `RepoTecnico/requerimientos.md:93` (RF-28), `:97` (RF-32), `:145` (RNF-09) · `RepoTecnico/diccionario_datos.md:171-173`, `:184`, `:164` · `RepoTecnico/requisitos.md:637` (Test 8: «Logs se mantienen (localStorage)»).

**Recomendación:** Definir en el diccionario una **política de redacción por método** (hash o truncado del mensaje en `personal_sign` y `eth_signTypedData_v4`, sin volcar `params` completos), un máximo de entradas y expiración por origen —aprovechando `settings.logLimit`— y un caso de test que verifique que ningún log contiene mensajes completos ni material sensible. Ampliar RNF-09 para cubrir payloads firmados, no solo claves. Coordinar con H-09 (fuente de verdad del log).

**Responsable:** Autor (seguridad/privacidad) · **Esfuerzo: S**
**Origen:** R7 (BAJA).

---

## 6) RNF faltantes o insuficientes (ISO 25010)

El corpus declara 20 RNF (`requerimientos.md:135-156`) con columna Categoría y Criterio de verificación. Cobertura verificada y huecos:

| Categoría ISO 25010 | Estado en el diseño | Hallazgos | Qué falta |
|---|---|---|---|
| Adecuación funcional | ✅ Presente | H-01 | RNF-01 existe pero su matriz es inexistente y excluye los RF Should |
| Eficiencia de desempeño | ⚠️ Insuficiente | H-13 | «Frío» sin definir, sin marcas ni estadístico; sin presupuesto para `notification.html`/`connect.html` ni para la reconstrucción del SW |
| Compatibilidad | ✅ Presente (RNF-04, RNF-19, RNF-20) | H-17 | RNF-19 mezcla compatibilidad y accesibilidad |
| Usabilidad | ⚠️ Parcial | H-12, H-17, H-26 | RNF-06 sin tabla de mensajes; sin criterios de teclado/ARIA/foco |
| **Accesibilidad** | ❌ **Ausente como categoría** | H-17 | Teclado, foco visible, ARIA, lectores de pantalla, `prefers-reduced-motion`, zoom 200 % |
| Fiabilidad | ⚠️ Parcial | H-02, H-12 | RNF-07 sin política numérica; RNF-08 no cierra el ciclo de reconstrucción |
| **Capacidad de recuperación** | ❌ **Ausente** | H-25 | Exportación/revelado, confirmación destructiva del reset, integridad del storage (BIP-39/EIP-55) |
| Seguridad | ⚠️ Parcial | H-11, H-32, H-40 | RNF-09/10/12 cubren lo esencial; faltan decodificación de calldata, `verifyingContract`, guarda de `sender`, `setAccessLevel` y cerrar el huérfano `domainChainMismatch` |
| Mantenibilidad | ✅ Presente (RNF-13, RNF-14, RNF-18) | H-12, H-29 | RNF-18 con alcance de búsqueda incompleto; sin política de dependencias |
| Portabilidad | ⚠️ Insuficiente | H-20 | RNF-15 sin definición de «build limpio» ni medio de verificación Linux |
| Observabilidad | ⚠️ Insuficiente | H-09, H-12, H-42 | Fuente de verdad del log en un almacén que el SW no puede escribir; criterio de RNF-16 no contrastable; sin política de redacción |
| Testabilidad | ⚠️ Insuficiente | H-01, H-19 | RNF-17 sin métrica ni regla global/fichero; sin matriz de trazabilidad |
| **Cumplimiento** | ❌ **Ausente** | H-26, H-37 | Límite «solo desarrollo» no verificable, avisos in-product, descargo de responsabilidad, justificación de permisos, licencias |

**Síntesis:** tres categorías ISO 25010 están directamente ausentes o inutilizables (Accesibilidad, Capacidad de recuperación, Cumplimiento) y cinco más están presentes pero con criterio no operacionalizable (Eficiencia, Usabilidad, Fiabilidad, Portabilidad, Observabilidad, Testabilidad). El defecto transversal no es la falta de categorías sino la **falta de magnitudes, universos y procedimientos** en las que ya existen.

---

## 7) Stakeholders faltantes o sin rol

| Actor | Estado en el diseño | Problema | Hallazgo |
|---|---|---|---|
| Usuario (dueño de la wallet) | Definido en una línea con objetivos operativos (`requerimientos.md:188`) | Sin perfil, nivel técnico ni expectativas; no se distingue al desarrollador que levanta Anvil del evaluador que carga `dist/` | H-27 |
| Docente/evaluador | Objetivo declarado: «verificar los 36 puntos del enunciado» (`:193`) | Su instrumento real (rúbrica de 100 puntos) no está en el diseño; el nombre del provider que puntúa y el paquete de entrega tampoco | H-14, H-15, H-16 |
| Custodia de claves | Asignada a un **actor de sistema** («Service Worker», `:190`) | Ningún humano responde por la protección, el ciclo de vida ni la recuperación del material criptográfico; sin decisión sobre auditoría externa | H-28 |
| Soporte / incidencias | **No existe** | Sin canal, propietario ni expectativa de respuesta; la única guía de diagnóstico está desalineada y escala a documentación descartada | H-24 |
| Mantenimiento / ciclo de vida | **No existe** (`estado_proyecto.md:143-152` termina en Fase 3) | Sin responsable del código tras la entrega, sin política de actualización de dependencias (ethers) ni de compatibilidad MV3; Foundry fijado sin rango soportado | H-29 |
| Titular de los activos de marca y de las fuentes | **No existe** | Activos TrueKeate y tipografías OFL redistribuidos sin origen, titularidad ni licencia registrada | H-37 |
| Operador del nodo Anvil/Foundry | Solo como procedimiento técnico (`entornos_globales.md:48-64`) | No se exige rango de versión soportada ni verificación previa de las pruebas E2E; **descartado como actor sin rol** en Fase 2, el residuo se integra en H-29 | H-29 |
| dApp de pruebas (`test.html`) | Definida como entregable (RF-46) | Sin rol de actor ni expectativas propias; **descartado como actor hostil** (el tratamiento del caso adverso ya existe: RNF-10/RNF-11) | — |

**Nota:** los hallazgos sobre la **dApp hostil** y sobre el **operador del nodo RPC como stakeholder independiente** fueron descartados por los verificadores (ver Anexo); lo que sobrevive de ellos está absorbido en H-29 y H-32 respectivamente, sin duplicar hallazgos.

---

## 8) Trazabilidad con el brief

### 8.1 Huecos del mapeo E-xx → RF-xx
- **E-05** (React 19 + TypeScript) → cubierto de facto por RT-01, **sin fila que lo declare** (H-05).
- **E-12** (Compatibilidad Chrome y Edge MV3) → cubierto por RNF-04/RT-04, **sin destino declarado y además mal atribuido a RF-45** en el anexo vinculante (`identidad_visual.md:237`) (H-05).
- **E-26** (`chrome.storage.local`) → cubierto por el diccionario y RNF-08, **sin ninguna fila RF que lo cite** (H-05).
- **Cobertura global:** 34 de 37 viñetas con destino declarado; **3 sin destino**.
- **Colisiones de numeración sin desambiguar:** el número 20 (redes vs modal) asignado a RF-23 y RF-35; el par «E-30, E-36» compartido literalmente por RF-16 y RF-36; RF-17 citando E-30 (apertura de ventana) para una lectura sin UI (H-06).
- **Citación inexacta:** RF-18 incluye `eth_blockNumber`, ausente del enunciado; RF-43 usa «Aprendizaje», valor fuera de la convención (H-38).

### 8.2 Requisitos huérfanos (definidos en datos sin requisito que los respalde)
| Elemento huérfano | Definido en | Sin requisito en |
|---|---|---|
| `lastUsedAt` (expiración de sesiones) | `diccionario_datos.md:114-116` | Ningún RF cubre expiración de sesiones (H-24) |
| `domainChainMismatch` (advertencia en UI) | `diccionario_datos.md:218` | RF-20 y RNF-09..RNF-12 (H-40) |
| `eth_sign` (método en catálogo RPC) | `diccionario_datos.md:279` | RF-21 y P-05 confirman solo `personal_sign` (H-11) |
| `wallet_revokePermissions` (contrato de datos) | Catálogo `diccionario_datos.md:282` | Enum `method` de `truekeate_pending_request` (`:127`) pese a RF-26 Must (H-23) |
| Objetos del protocolo (`TRUEKEATE_EVENT` en dos saltos) | `diccionario_datos.md:251`, `:263` | Sin nota de reenvío ni contrato de validación (H-39) |

### 8.3 Requisitos inventados o sin autorización
- **11 RF declarados NUEVO**; 9 correctamente trazados (D-03, D-06, P-05/P-06, anexo de identidad visual, P-09) y **2 sin fila D-xx ni origen en la entrevista: RF-07 (Must) y RF-25 (Must)** (H-30).
- **RF-48 y RF-49** son aportaciones de identidad visual sin correspondencia en el enunciado: legítimas, pero **quedaron fuera del rango declarado** en D-01/DEC-01 y del encabezado «Total: 47 RF», de modo que RF-49 (Must) no entraría en la matriz de trazabilidad (H-03).
- **RF-25 se declara «NUEVO (guía de testing)»**, es decir derivado de un documento del prototipo anterior que P-10/DEC-09 descartó (H-24).
- **Desviación consciente documentada:** la renuncia al nombre `window.codecrypto` (P-13/D-10) es legítima, pero queda condicionada y afecta a 5 puntos de rúbrica (H-15).

### 8.4 Trazabilidad RF ↔ CU ↔ test
Inexistente: `casos_uso/` está en ⏳ Fase 2 (`estado_proyecto.md:34`) y la matriz que RNF-01 nombra no se ha creado. **0 de 49 RF** tienen criterio de aceptación y **0 de 13 RT**; **0 ítems de la rúbrica** están mapeados a requisitos (H-01, H-14). Complementariamente, el conteo real de los artefactos (49/20/13/4) no coincide con los metadatos que el evaluador leería (47/17/11/4) (H-03).

---

## 9) Plan de acción

### 9.1 Quick wins — bajo esfuerzo, alto retorno, sin dependencias (≈ 1 día cada uno)
| # | Acción | Hallazgos | Responsable | Esfuerzo |
|---|---|---|---|---|
| QW-1 | Sincronizar conteos y versiones: 49 RF en `:50`, `RF-01..RF-49` en D-01/DEC-01, tabla §2 de `estado_proyecto.md`, historial 1.4 de `entornos_globales.md`, orden RT-12/RT-13 | H-03 | Autor (documentación) | S |
| QW-2 | Reformular los dos pasajes «adoptar el código del remoto» de `entornos_globales.md` | H-04 | Autor (documentación) | S |
| QW-3 | Corregir `identidad_visual.md:237` (E-12 → RNF-04) y declarar E-05 → RT-01, E-26 → RF-09/RF-10 | H-05 | Autor (trazabilidad) | S |
| QW-4 | Regla de desambiguación de E-20a/b y reparto E-30/E-36 | H-06 | Autor (trazabilidad) | S |
| QW-5 | Eliminar la condición «si el evaluador lo exige» y decidir el alias `window.codecrypto` | H-15 | Autor (producto) | S |
| QW-6 | Añadir `wallet_revokePermissions` al enum o corregir la columna «¿Requiere aprobación?» | H-23 | Autor (datos) | S |
| QW-7 | Tabla de trazabilidad de RF NUEVO y filas D-xx para RF-07 y RF-25 | H-30 | Autor (analista) | S |
| QW-8 | Fijar `server.port: 5174` + `strictPort` y normalizar la clave de sesión | H-33 | Autor (entornos) | S |
| QW-9 | Crear `LICENSE`, `NOTICE` y los `LICENSE-*.txt` de las tres familias OFL | H-37 | Autor + titular de marca | S |
| QW-10 | Corregir la Fuente de RF-18 y RF-43 | H-38 | Autor (analista) | S |
| QW-11 | Nota de reenvío de `TRUEKEATE_EVENT` entre saltos | H-39 | Autor (arquitecto) | S |
| QW-12 | Cerrar el huérfano `domainChainMismatch` con un criterio mínimo en RF-20 | H-40 | Autor (analista) | S |
| QW-13 | Allowlist de CORS en el comando Anvil | H-41 | Autor (entornos) | S |
| QW-14 | Política de redacción de `params` en los logs y ampliación de RNF-09 | H-42 | Autor (seguridad) | S |
| QW-15 | Definir los dos perfiles de usuario final y el canal de soporte | H-24, H-27 | Autor (analista) | S |
| QW-16 | Nombrar al responsable de seguridad y decidir sobre auditoría externa | H-28 | Autor (seguridad) | S |

### 9.2 Mejoras — Fase 2, esfuerzo S-M, antes de codificar la funcionalidad asociada
| # | Acción | Hallazgos | Responsable | Esfuerzo |
|---|---|---|---|---|
| M-1 | Operacionalizar RNF-06/07/16/18 y añadir la aserción de RNF-16 sobre la suite E2E | H-12 | Autor (RNF + QA) | M |
| M-2 | Convertir RNF-02 en procedimiento medible y presupuestar `notification.html`/`connect.html` y la reconstrucción del SW | H-13 | Autor (QA) | M |
| M-3 | Nueva categoría RNF de Accesibilidad con matriz de contraste cerrada y tests axe-core | H-17 | Autor (UX + QA) | M |
| M-4 | Cardinalidad máxima, política de desbordamiento, control de tasa y regla de conteo del badge | H-18 | Autor (arquitecto + seguridad) | M |
| M-5 | Especificar métrica, umbral por módulo y exclusiones de cobertura (RNF-17) | H-19 | Autor (QA) | S |
| M-6 | Definir «build limpio» y medio de verificación Linux (WSL2 o CI) | H-20 | Autor (build) | M |
| M-7 | Semántica de ciclo, disparador y parada del polling, con contador de llamadas en test | H-21 | Autor (UI) | S |
| M-8 | Contrato observable de transacción (hash, estados, `estimateGas`, revert) y `eth_getTransactionReceipt` | H-22 | Autor (arquitecto) | M |
| M-9 | Desalinear la guía heredada: nota vinculante de esquema, reclasificación de RF-25 y troubleshooting propio | H-24 | Autor (soporte) | M |
| M-10 | Nueva categoría RNF de Recuperación (exportación, reset destructivo, integridad BIP-39/EIP-55) | H-25 | Autor (cripto) | M |
| M-11 | Nueva categoría RNF de Cumplimiento y avisos in-product verificables | H-26 | Autor (analista + UX) | M |
| M-12 | Sección «Mantenimiento y ciclo de vida» con política de dependencias y compatibilidad MV3 | H-29 | Autor (mantenimiento) | M |
| M-13 | Contrato EIP-6963 completo (re-anuncio + listener síncrono) y caso Gherkin | H-31 | Autor (arquitecto) | S |
| M-14 | Guarda de `sender`, allowlist de métodos internos, `targetOrigin` y `setAccessLevel` | H-32 | Autor (seguridad) | M |
| M-15 | Sustituir el «~40 h» por estimación por hitos y tabla «Must vs Should postergables» | H-34 | Autor (planificación) | S |
| M-16 | Origen y riesgo visibles en `notification.html`; foco/alwaysOnTop; ventana única por origen | H-35 | Autor (UX + seguridad) | M |
| M-17 | Ajustar permisos del manifest al uso real y decidir la política de RPC arbitrario | H-36 | Autor (seguridad) | M |
| M-18 | Mapear la rúbrica de 100 puntos y el paquete de entrega a RF/RNF/RT y a fases | H-14, H-16 | Autor + evaluador | M |

### 9.3 Roadmap — rediseño de arquitectura/verificación antes de la Fase 3 (bloqueantes)
| # | Acción | Hallazgos | Responsable | Esfuerzo |
|---|---|---|---|---|
| RM-1 | Columna «Criterio de aceptación» + «Evidencia» en los 49 RF y 13 RT, con 3 RF piloto como puerta de plantilla | H-01 | Autor (analista) + evaluador | M |
| RM-2 | Rediseñar la aprobación MV3: `approvalId` persistido, puerto de larga vida, `chrome.alarms`, cierre de ventana y timeout de página | H-02, H-07 | Autor (arquitecto MV3) | L |
| RM-3 | Remodelar la cola persistida como `Record<approvalId, PendingRequest>` con read-modify-write serializado | H-08 | Autor (arquitecto) | M |
| RM-4 | Mover `truekeate_logs` a `chrome.storage.local` gestionado por el SW y excluirlo del reset | H-09 | Autor (arquitecto) | M |
| RM-5 | Política de nonce (informativo en preview, recalculado al firmar) y cola FIFO por cuenta | H-10 | Autor (arquitecto) | S |
| RM-6 | Ampliar `TxPreview`/RF-19/RF-20: decodificación de calldata, `verifyingContract`, avisos de riesgo y decisión sobre `eth_sign` | H-11 | Autor (seguridad + UX) | L |
| RM-7 | Matriz E-xx → RF-xx → CU → test con cobertura de los 39 Must y decisión explícita sobre los 10 Should | H-01, H-05, H-06, H-14 | Autor (trazabilidad) | M |

**Secuencia recomendada:** Quick wins (QW-1..QW-16) → RM-1/RM-2/RM-3/RM-6 (bloqueantes) → Mejoras M-1..M-18 en paralelo por área → Fase 3.

---

## 10) Criterios de aceptación para cerrar la Fase 2

La Fase 2 se considerará cerrada cuando **todos** estos criterios estén verificados documentalmente y con evidencia adjunta en `RepoTecnico/`:

1. **Criterios de aceptación por requisito (H-01).** Los 49 RF y los 13 RT tienen columna «Criterio de aceptación (verificable)» y «Evidencia»; los 3 RF piloto (RF-01, RF-08, RF-40) han sido revisados y la plantilla validada antes de replicarla. RNF-01 cubre también los 10 RF Should o documenta su exención.
2. **Matriz de trazabilidad (H-01, H-05, H-06, H-14).** Existe la matriz E-xx → RF-xx → CU → test con la desambiguación E-20a/b y el reparto E-30/E-36 resueltos; E-05, E-12 y E-26 tienen destino declarado; los 39 Must tienen al menos un caso Gherkin; cada ítem de la rúbrica de 100 puntos está mapeado a RF/RNF/RT y a su evidencia.
3. **Arquitectura de la cola de aprobaciones (H-02, H-07, H-08, H-10, H-18).** Documentados: correlación por `approvalId`, persistencia `Record<approvalId, PendingRequest>`, `chrome.alarms` en permisos, dueño único del plazo, cierre de `notification.html` al expirar, error EIP-1193 (`code 4001`) hacia la página, cardinalidad máxima y política de desbordamiento y tasa, y política de nonce (informativo + recálculo + cola FIFO por cuenta), con un caso Gherkin de dos solicitudes simultáneas.
4. **Observabilidad (H-09, H-12, H-42).** Decidida la fuente de verdad del log en `chrome.storage.local` gestionado por el SW; RNF-16 con aserción automatizable y evidencia; política de redacción de `params` y ampliación de RNF-09 a payloads firmados.
5. **Seguridad de la firma (H-11, H-32, H-35, H-40).** `TxPreview` con calldata decodificado, contrato etiquetado y avisos de riesgo; `verifyingContract`/`name` visibles en EIP-712; decisión escrita sobre `eth_sign`; guarda de `sender`, allowlist de métodos internos, `targetOrigin` cerrado y `setAccessLevel` especificados; `notification.html` con origen visible, foco garantizado y ventana única por origen; `domainChainMismatch` con requisito asociado.
6. **RNF faltantes (H-17, H-25, H-26, H-19, H-20, H-13).** Añadidas o completadas las categorías Accesibilidad, Recuperación y Cumplimiento, y operacionalizados RNF-02, RNF-06, RNF-07, RNF-15, RNF-16, RNF-17 y RNF-18 (magnitud + universo + procedimiento + evidencia).
7. **Metadatos y versiones (H-03, H-38, H-39, H-41).** Un único conteo verificable (49 RF / 20 RNF / 13 RT / 4 RE), versiones sincronizadas con sus historiales, RT-12/RT-13 ordenados, columna Fuente conforme a la convención y `TRUEKEATE_EVENT` documentado en sus dos saltos; CORS de Anvil restringido.
8. **Entorno reproducible (H-20, H-33, H-29, H-34).** Puerto 5174 con `strictPort`, política de versiones de dependencias y de Foundry, plan de estimación por hitos y tabla «Must del MVP vs Should postergables» en lugar del «~40 h».
9. **Stakeholders (H-14, H-15, H-16, H-24, H-27, H-28, H-29, H-37).** Perfiles de usuario definidos, rúbrica y entregables incorporados como criterios, propietario de seguridad nombrado, canal de soporte establecido, responsable de mantenimiento asignado, y licencias y autorización de activos registradas.
10. **Trazabilidad de la renumeración (H-03, H-30).** RF-48/RF-49 declarados como aportaciones de identidad visual dentro del rango oficial, y los 11 RF NUEVO con origen, justificación y prioridad resultante en la tabla de trazabilidad de requisitos nuevos.
11. **Cierre del baseline (H-04, H-24).** Sin rastro de la palabra «adoptar» referida al código del remoto; `GUIA_RAPIDA_TESTING.md` reclasificada como documentación de la línea base previa (no vinculante) y sustituida por un documento de troubleshooting propio con nomenclatura `truekeate_`.
12. **Veredicto de reevaluación.** Un revisor independiente confirma que los 42 hallazgos están cerrados o explícitamente aceptados por el usuario con fecha y justificación; solo entonces la especificación se declara **apta para la Fase 3**.

---

## Anexo — Hallazgos DESCARTADOS en la Fase 2 (27) y su motivo

Consolidación de los `discarded` de los 7 verificadores. **Regla aplicada: ante la duda, descartar.** Los residuos aprovechables de varios descartes se recogieron como sub-ítem de un hallazgo superviviente (indicado en la última columna).

| Dimensión | Hallazgo descartado | Motivo del descarte | Residuo recogido |
|---|---|---|---|
| R1 | RF-49 / RNF-18-19: «la identidad visual no es aprobable objetivamente» | Falso positivo mayoritario: el anexo tiene verificaciones objetivas (4 iconos, regex de colores, contraste 4.5:1, tagline), es vinculante y el degradado está garantizado por construcción al consumir el token único | H-01 (criterio por RF) e H-17 (alcance del contraste) |
| R1 | RF-32 / historial de logs sin límite verificable ni oráculo | El límite existe y es numérico (`logLimit = 500`); la persistencia está definida en dos planos coherentes; `data` prohíbe claves privadas y mnemonic | H-42 (redacción), H-09 (fuente de verdad) |
| R2 | RF-43 usa «Aprendizaje» como fuente sin objetivo de aprendizaje que cubra EIP-155 | **Falso positivo**: `requisitos.md:30` lista «EIP-155: Replay Protection for Transactions» como objetivo de aprendizaje. Solo queda la imprecisión formal de la convención | H-38 (BAJA, solo la convención) |
| R2 | El diccionario documenta 120 s para `truekeate_pending_request` y podría aplicarse a la conexión (60 s en RF-40) | **Falso positivo**: la conexión vive en `truekeate_connect_request` con `expiresAt = createdAt + 60000`; `eth_requestAccounts` no está en el enum y las constantes están separadas | — |
| R2 | La tabla de RT rompe el orden: RT-13 antes de RT-12 | Evidencia confirmada, pero descartado por severidad efectiva nula: desorden cosmético que no altera contenido, conteo ni trazabilidad | H-03 (se corrige como parte del saneamiento) |
| R2 | `TRUEKEATE_EVENT` se define en dos tablas con campos distintos / ausencia de espacio de nombres por canal | Se descarta como redacción separada: la dirección de cada mensaje está documentada en su tabla y los tipos de mensaje son una decisión congelada en P-13/DEC-18 | H-39 (BAJA, reformulado como falta de nota de reenvío) |
| R3 | RNF-15 exige build en Windows y Linux pero la generación de iconos es Windows-only | **Falso positivo**: el build documentado (`tsc -b && vite build`) no invoca el script de iconos y el propio documento resuelve el caso Linux versionando los PNG | H-20 (indefinición del criterio) |
| R3 | Comportamiento bajo crecimiento (cuota de localStorage, 500 logs, N cuentas, sesiones sin expirar) | Parcialmente falso y especulativo: la retención está acotada por `logLimit = 500`, RNF-03 acota el polling, `expiresAt`/`expired` existen y RF-41 limpia el estado pendiente | — |
| R3 | Los controles de producción (PBKDF2, auto-lock, CSP, rate limiting, anti-phishing) se excluyeron sin RNF sustituto ni excepción | Exclusión coherente con la fuente: el enunciado los agrupa bajo «Para Producción Requeriría»; la CSP de MV3 es la de por defecto y P-03/P-08 los excluyen | H-26 (tabla de excepciones), H-40 (huérfano) |
| R3 | RNF-17 fija 70 % sin módulos ni umbrales por criticidad; RNF-13/14 sin regla automatizable; RNF-16 sin mecanismo | Falso positivo en su núcleo: RNF-17 enumera el alcance, RNF-13 se verifica con `tsc -b` y RNF-14 por revisión de imports | H-12 (solo RNF-16), H-19 |
| R3 | RNF-05 y RNF-06 se verifican por prueba manual sin criterio objetivo | Falso positivo: ambos contienen criterio contrastable (≤ 2 clics con datos visibles; mensajes en español con causa y acción) y la tabla de códigos EIP-1193 es finita | — |
| R3 | El criterio de RNF-18 solo busca literales de color en CSS y deja fuera TSX/JS | Ya cubierto: `identidad_visual.md:247` fija el alcance «en los demás archivos → 0 resultados» y los tokens son fuente única | — |
| R4 | «El operador del nodo RPC local y las expectativas de plataforma quedan sin dueño ni procedimiento» | Falso positivo por omisión de evidencia: el permiso de host en runtime está especificado (`entornos_globales.md:164`, `diccionario_datos.md:84`) y el procedimiento operativo existe (comando, precondición, checklist) | H-29 (rango de versión de Foundry y verificación previa de E2E) |
| R4 | «Las dApps de terceros se modelan solo como consumidoras legítimas: no existe la dApp hostil como actor» | Doble motivo: la recomendación nuclear (mostrar el origen) ya está en el diseño y el tratamiento del caso adverso existe y es verificable (RNF-10, RNF-11, validación `event.source`/`event.origin`) | H-32, H-35 |
| R5 | RF-07, RF-21, RF-40 y el cambio de prioridad de P-05 «sin fila de desviación» | **Falso positivo verificado**: RF-40 y RF-37 están en D-06; RF-21/RF-26 en P-05/P-06 y DEC-06; RF-05/RF-06 en D-03; el cambio de prioridad consta en la propia fila P-05 | H-30 (solo RF-07 y RF-25) |
| R5 | E-16 y E-23 → RF-31/RF-47/RF-32 sin desglose, y la independencia `localStorage` / `chrome.storage.local` «no validada» | Descartado: la fuente es fiel y distinguible (E-16 = logs en tiempo real; el `test.html` ya incluye historial) y la independencia de almacenes está explícitamente diseñada (diccionario + Test 8) | — |
| R5 | RF-08 absorbe E-24 (transferencias internas) y lo diluye en «interna o a direcciones externas» | Descartado por falta de impacto trazable: RF-08 conserva el alcance interno y el enunciado lo define con un flujo de prueba completo (Cuenta 0 → Cuenta 1) | — |
| R5 | Cuatro conteos distintos de RF/RNF/RT (con «RT-13 sin RT-14») | Deduplicado y recortado, no descartado: la parte de RF queda en H-03 y la de RNF/RT con el orden en H-03; se elimina la inferencia «faltaba un RT-14», no verificable | H-03 |
| R5 | Revisión de cobertura: 37 viñetas del enunciado y recuento de viñetas | No es un hallazgo sino el resultado de la verificación: la cifra 37 ya está registrada en D-01 y la cabecera «Parte 4» se absorbe en la desambiguación de E-20 | H-06 |
| R6 | «No hay auto-anuncio EIP-6963 y el `icon` no está especificado» | **Falso positivo verificado**: `requerimientos.md:277` documenta el auto-anuncio y `identidad_visual.md:236` fija el icon como data-URI PNG, además de name/rdns/uuid | H-31 (solo el contrato de re-anuncio) |
| R6 | Sin presupuesto de tamaño ni control de code-splitting para ethers | Descartado por falso positivo y especulación: el enunciado fija los tamaños de referencia, RT-12 ya exige el subconjunto `latin` y no hay build que medir | — |
| R6 | CORS / `host_permissions` hacia Anvil sin fallback | Ya cubierto por el diseño con mitigación doble y alta de redes con permiso en runtime | H-41 (endurecimiento, aspecto distinto) |
| R6 | El polling de saldos no tiene dueño ni ciclo de vida definido | Rebajado y descartado por dudoso: es un requisito de UI y el dueño del polling es el popup por construcción; el hueco real es menor | H-21 |
| R6 | `wallet_deriveAccounts` transporta el mnemonic por mensaje pese a RNF-09 | Rebajado y absorbido: la parte esencial de RNF-09 se cumple (nada viaja por `window.postMessage`) y el patrón citado es material del remoto descartado por P-10 | H-32 (guarda de `sender` y `setAccessLevel`) |
| R7 | «El mnemonic y las claves privadas se almacenan en claro sin control compensatorio» (CRITICA) | Decisión del usuario ya tomada y documentada de forma coherente en cuatro lugares (P-03, RE-02, D-07, registro de riesgos) y acotada al entorno de desarrollo; la supuesta incoherencia por publicación no se sostiene (RT-09) | H-26 (aviso in-product), H-32 (`setAccessLevel`) |
| R7 | La validación de origen es insuficiente para iframes y no se fija el `targetOrigin` saliente | Falso positivo en su argumento principal: el `window` de un iframe es un objeto distinto, por lo que `event.source === window` sí bloquea la suplantación desde un frame; explotar un `targetOrigin` comodín exige código malicioso ya presente en la propia página | H-32 (redacción de RNF-10) |
| R7 | La «detección de phishing» solo aparece como mejora de producción | Duplicado parcial del hallazgo de phishing/UI-spoofing, que ya recoge ese hecho como evidencia | H-35, H-40 |

---

*Informe generado por el SINTETIZADOR de la Fase 3 sobre los 7 informes de verificación adversarial (R1..R7). No contiene hallazgos que no provengan de dichos informes; las fusiones entre dimensiones se indican en cada hallazgo como «Origen».*
