# ⚖️ Veredicto de Reevaluación — Fase 2 · TrueKeate Wallet

> **Fase:** 2 — Auditoría (reevaluación) · **Versión:** 1.2 · **Fecha:** 2026-10-09
> **Objeto:** cierre de la Fase 2 tras la remediación de las **tres auditorías** (`INFORME_OPTIMIZACION_V1.md`, `casos_uso/AUDITORIA_CASOS_USO_V1.md`, `AUDITORIA_DOCUMENTO_TECNICO_V1.md`).
> **Revisor:** arquitecto de documentación técnica y auditor de consistencia (revisión independiente).
> **Naturaleza de este archivo:** **entregable de la reevaluación**. Es un documento de cierre (no un registro histórico) y se actualiza cuando el plan de §5 se ejecuta.
> **Historial de cambios:** v1.0 emisión del veredicto, tabla de cierre por severidad, **12 hallazgos residuales `R-01..R-12`** y **18 contradicciones residuales**, con el plan de cierre por bloques. · **v1.1** ejecución de los bloques 1, 2 y 3 sobre el corpus y **estado de cierre por residual** (§6): los 8 parciales de las tres auditorías quedan cerrados y **R-09 queda pendiente de una decisión de producto**. · **v1.2 (esta versión)** cierre del residual **`R-09`** con las decisiones de producto **DEC-45** (bloqueo del revelado/exportación y del borrado de una cuenta importada cuando la cuenta está en uso por una dApp) y **DEC-46** (bloqueo del reset con la cola no vacía o una transacción en vuelo): **0 residuales abiertos**, **18/18 contradicciones resueltas** y veredicto ajustado a ✅ **Fase 2 apta para el cierre**, **pendiente solo de la última pasada de consistencia** solicitada por el usuario antes de autorizar la Fase 3.

---

## 1. Veredicto

> ### ✅ **FASE 2 APTA PARA EL CIERRE**
> **0 hallazgos abiertos** · **27 cerrados** · **8 parciales** (cerrados por los residuales `R-01..R-08`) · **0 residuales abiertos** (**12/12 `R-01..R-12` cerrados**, `R-09` en la v1.2) · **0 contradicciones** (**18/18 resueltas**) · **pendiente solo la última pasada de consistencia** solicitada por el usuario.

**Lectura del veredicto.** La reevaluación **no reabre ningún bloqueante estructural**: los cuatro bloqueantes que impedían el cierre (build/empaquetado MV3, arnés de ejecución E2E, cola de aprobaciones persistida con dueño único del plazo, y anti-firma-ciega) están **cerrados y verificados**. Lo que estaba pendiente era **edición documental** en tres bloques —más la **decisión de producto de `R-09`**, ya resuelta con **DEC-45/DEC-46**— y **no toca arquitectura, alcance ni modelo de datos**. Los tres bloques del plan de §5 —**ejecutados** en la v1.1— eran:

1. **Bloque 1 — Consistencia de valores.** Valores canónicos que no se citan igual en todo el corpus (conteo de eventos, plazo de revelado, ventana de confirmación, tipos de mensaje, identidad EIP-6963, cota de payload, cuota de storage, redacción de logs, conteos de requisitos y versiones de documento).
2. **Bloque 2 — Verificabilidad de criterios.** Criterios que aún carecen de magnitud, de método o de evidencia, o cuyo oráculo es tautológico; el caso residual más citado es la afirmación **no falsable** de que el puerto de larga vida «mantiene vivo» el Service Worker.
3. **Bloque 3 — Memoria y metadatos.** `estado_proyecto.md` §2 declara versiones **desactualizadas** de casi todos los artefactos, y las cabeceras de `casos_uso.md`, `diagramas.md` y `documento_tecnico.md` siguen citando versiones anteriores de sus fuentes.

**Consecuencia.** El plan de §5 está **ejecutado** y los **12 residuales cerrados**: el cierre queda **condicionado solo a la última pasada de consistencia** por `grep` solicitada por el usuario, sin necesidad de una cuarta auditoría completa.

### 1.1 Métricas

| Métrica | Valor |
|---|---|
| Hallazgos auditados en total (H-01..H-42 + ACU-01..ACU-30 + ADT-01..ADT-33) | **105** |
| Cerrados (sin residual) | **27** |
| Parciales (cerrados por los residuales `R-01..R-08`) | **8** |
| Abiertos | **0** |
| Contradicciones residuales detectadas | **18** |
| Contradicciones resueltas | **18 / 18** — **0 pendientes** |
| Hallazgos residuales (`R-01..R-12`) | **12** (3 ALTA · 8 MEDIA · 1 BAJA) |
| Residuales cerrados | **12 / 12** (`R-09` cerrado en la v1.2 con **DEC-45/DEC-46**) |
| Residuales abiertos | **0** |
| Bloqueantes estructurales | **4 / 4 cerrados** |
| Naturaleza de lo pendiente | **solo la última pasada de consistencia** (verificación documental por `grep`; ningún cambio de arquitectura ni de alcance) |

### 1.2 Bloqueantes estructurales (verificados como cerrados)

| # | Bloqueante | Evidencia del cierre |
|---|---|---|
| B-1 | **Build/empaquetado MV3 ejecutable** | `documento_tecnico.md` §7.5 y `entornos_globales.md` §2.2: 7 scripts npm, 6 entradas, 3 páginas HTML, `key` fija y manifest en mínimos privilegios (ADT-01/D-O, ADT-19/D-N). |
| B-2 | **Arnés de ejecución E2E real** | `documento_tecnico.md` §7.4: `chromium.launchPersistentContext` con `--load-extension`, generación de `dist/`, verificación previa de Anvil y comprobación de parseo de los Mermaid (ADT-05, §7.5). |
| B-3 | **Cola de aprobaciones persistida y dueño único del plazo** | `diccionario_datos.md` §2.8/§2.12–§2.14 y §3.4: `Record<approvalId, PendingRequest>`, RMW serializada, `truekeate_inflight_tx`, `truekeate_rate_windows`, `truekeate_approval_window`, `chrome.alarms` y reconciliación al arrancar (H-02/H-07/H-08, ADT-23/D-R). |
| B-4 | **Anti-firma-ciega** | `documento_tecnico.md` §3.4/§3.7 y `diccionario_datos.md` §3.2/§3.7: `eth_sign` fuera del catálogo (`4200`), calldata decodificado con tabla local cerrada de selectores, `verifyingContract`/`name` visibles y avisos de riesgo (H-11a/H-11b, ADT-08/D-K). |

---

## 2. Tabla de cierre de los hallazgos CRITICOS y ALTOS de las tres auditorías

> Criterio de la tabla: **CRITICA** y **ALTA** de las tres auditorías. «Estado» = cerrado / parcial / abierto. La columna «Residual» enlaza con `R-xx` o con la contradicción `C-xx` de §3 y §4.

### 2.1 `INFORME_OPTIMIZACION_V1.md` — Fase 1 (H-01..H-42; 2 CRITICA · 14 ALTA)

| ID | Sev. | Título | Estado | Residual |
|---|---|---|---|---|
| H-01 | 🔴 CRITICA | Sin criterio de aceptación ni evidencia por requisito | ✅ Cerrado | `requerimientos.md` v1.6 §1/§3/§9 (Anexo A con `CA-RF-xx`/`CA-RT-xx`) |
| H-02 | 🔴 CRITICA | Ciclo de aprobación MV3 sin persistencia (SW dormido pierde la cola) | ✅ Cerrado | DEC-24; `diccionario_datos.md` §2.8/§3.4 |
| H-03 | 🟠 ALTA | Conteos de RF/RNF/RT/RE inconsistentes | ✅ Cerrado | 50 RF (40 Must / 10 Should) · 25 RNF · 13 RT · 4 RE; verificado por conteo en §5 |
| H-04 | 🟠 ALTA | Rastro de reutilización del código del remoto `codecrypto` | ✅ Cerrado | DEC-09; `estado_proyecto.md` §3 |
| H-05 | 🟠 ALTA | Trazabilidad del enunciado rota (37 viñetas) | ✅ Cerrado | `requerimientos.md` §1.0 |
| H-06 | 🟠 ALTA | Números repetidos del enunciado (20, 26, 29) | ✅ Cerrado | `requerimientos.md` §1 regla `E-20a`/`E-20b` |
| H-07 | 🟠 ALTA | Dueño del plazo indefinido (múltiples relojes) | ✅ Cerrado | `entornos_globales.md` §3 y `documento_tecnico.md` §2.3 (SW dueño único, `timeout.ts`) |
| H-08 | 🟠 ALTA | Pérdida de estado del SW sin reconciliación | ✅ Cerrado | DEC-24; §3.4 del diccionario |
| H-09 | 🟠 ALTA | Doble fuente de verdad de los logs | ✅ Cerrado | `diccionario_datos.md` §2.11 (los escribe siempre el SW) |
| H-10 | 🟠 ALTA | Nonce manipulado por la página | ✅ Cerrado | `diccionario_datos.md` §2.12/§3.6 (nonce informativo, recalculado al aprobar) |
| H-11a | 🟠 ALTA | `eth_sign` (firma ciega) en el catálogo | ✅ Cerrado | DEC-22; `4200` y ausencia en `requerimientos.md` §2.1 |
| H-11b | 🟠 ALTA | Vista previa sin decodificación del calldata | ✅ Cerrado | DEC-23; `documento_tecnico.md` §3.7 (tabla local cerrada de selectores, ADT-08/D-K) |
| H-12 | 🟠 ALTA | Catálogo de errores sin mensajes ni causa/acción | ⚠️ Parcial | `R-01`, `C-01`, `C-02` (mensajes por causa: §2.1 vs §4.3) |
| H-14 | 🟠 ALTA | Matriz de trazabilidad `E-xx → RF-xx → CU → test` ausente | ✅ Cerrado | `casos_uso.md` §2/§5/§7 y `requerimientos.md` §1.0/§9.4 |
| H-18 | 🟠 ALTA | Cardinalidad y tasa de solicitudes sin definir | ✅ Cerrado | `diccionario_datos.md` §2.8/§2.13 |
| H-35 | 🟠 ALTA | Ventana de confirmación sin invariante (fatiga de aprobación) | ✅ Cerrado | DEC-38/P-21; ventana única global (verificar residuo de cita `C-03`) |

### 2.2 `casos_uso/AUDITORIA_CASOS_USO_V1.md` (ACU-01..ACU-30; 2 CRITICA · 8 ALTA)

| ID | Sev. | Título | Estado | Residual |
|---|---|---|---|---|
| ACU-01 | 🔴 CRITICA | Trazabilidad de fichas vs matrices contradictoria | ✅ Cerrado | Regla «la ficha declara, la matriz agrega» (convención 7) |
| ACU-02 | 🔴 CRITICA | Criterios sin evidencia en las fichas | ✅ Cerrado | Regla dura de evidencias (convención 3); ver `R-06..R-08` para lo que subsiste |
| ACU-03 | 🟠 ALTA | Divergencia de `name`/`rdns` de EIP-6963 | ✅ Cerrado | DEC-30; `TrueKeate` / `academy.codecrypto.truekeate` unificados (constancia en §5) |
| ACU-04 | 🟠 ALTA | `truekeate_logs` sin campo `event` | ⚠️ Parcial | `R-02`, `C-13` (restos de «23 eventos/nombres») |
| ACU-05 | 🟠 ALTA | Errores sin `code` y tabla de mensajes ambigua | ⚠️ Parcial | `R-01`, `C-01`, `C-02` |
| ACU-06 | 🟠 ALTA | Etiquetas de cuentas derivadas sin almacén | ✅ Cerrado | D-F; `accountLabels` en `truekeate_settings` |
| ACU-07 | 🟠 ALTA | Alcance del MVP dependiente del badge | ✅ Cerrado | DEC-27/P-17; oráculo de CU-16 sin badge |
| ACU-08 | 🟠 ALTA | `Entonces` no observables (puerto «mantiene vivo» el SW) | ⚠️ Parcial | `R-03`, `C-04..C-07` |
| ACU-14 | 🟠 ALTA | Semilla no recuperable (sin revelado/exportación) | ✅ Cerrado | DEC-28/RF-50 (`CA-RF-50`) |
| ACU-16 | 🟠 ALTA | `wallet_switchEthereumChain` sin aprobación | ✅ Cerrado | DEC-29/P-19; RF-22 y `CA-RF-22` |
| ACU-29 | 🟠 ALTA | Evidencias con forma inválida (`Revisión:`, `E2E` sin spec) | ⚠️ Parcial | `R-06`, `R-07` (evidencias con forma no canónica en el corpus) |

### 2.3 `AUDITORIA_DOCUMENTO_TECNICO_V1.md` (ADT-01..ADT-33; 0 CRITICA · 12 ALTA)

| ID | Sev. | Título | Estado | Residual |
|---|---|---|---|---|
| ADT-01 | 🟠 ALTA | Pipeline de build MV3 no especificado | ✅ Cerrado | `entornos_globales.md` §1/§2.2 y `documento_tecnico.md` §7.5 |
| ADT-02 | 🟠 ALTA | Entradas/páginas del bundle sin inventario | ✅ Cerrado | §2.2 de `entornos_globales.md` (6 entradas, 3 HTML) |
| ADT-03 | 🟠 ALTA | Cita errónea del mensaje de `estimateGas` | ⚠️ Parcial | `R-01`, `C-01` (fuente única de literales = §4.3) |
| ADT-04 | 🟠 ALTA | Cobertura de RF/RNF sin evidencia | ✅ Cerrado | `requerimientos.md` v1.6 |
| ADT-05 | 🟠 ALTA | Arnés E2E no ejecutable | ✅ Cerrado | `documento_tecnico.md` §7.4 |
| ADT-06 | 🟠 ALTA | RF-50 sin flujo ni contrato temporal | ✅ Cerrado | §3.8 del técnico; `REVEAL_HIDE_MS = 30000` |
| ADT-07 | 🟠 ALTA | Origen derivado de datos no fiables (`sender.tab.url`) | ✅ Cerrado | DEC-40/D-J; RNF-10/RNF-11 y flujo X-11 |
| ADT-09 | 🟠 ALTA | Política de portapapeles del revelado ausente | ✅ Cerrado | DEC-37/P-20; §3.10 y CU-07 |
| ADT-12 | 🟠 ALTA | Redacción de logs divergente (4 vs 10 bytes) | ✅ Cerrado | D-T; **primeros 10 bytes** unificados |
| ADT-15 | 🟠 ALTA | Riesgos MV3 ausentes; creencia errónea del *keep-alive* | ⚠️ Parcial | `R-03`, `C-04..C-07` (corregido en el técnico, no en el resto) |
| ADT-19 | 🟠 ALTA | UUID del provider y `key` del manifest inestables | ✅ Cerrado | DEC-43/D-N |
| ADT-22 | 🟠 ALTA | Ventana de confirmación «por origen» (hasta 8) | ⚠️ Parcial | `R-04`, `C-03` |
| ADT-25 | 🟠 ALTA | `wallet_addEthereumChain` activaba la red | ✅ Cerrado | DEC-39/P-22; RF-23 y `CA-RF-23` |
| ADT-29 | 🟠 ALTA | Tipos de mensaje del protocolo sin conteo cerrado | ✅ Cerrado | `entornos_globales.md` §10 (**8 tipos**, constancia en §5) |
| ADT-30 | 🟠 ALTA | `notifications` obligatorio y *token bucket* parcial | ✅ Cerrado | DEC-44/D-P/D-Q; `optional_permissions` |
| ADT-32 | 🟠 ALTA | Botón fantasma con dos especificaciones | ✅ Cerrado | `identidad_visual.md` v1.3 §2.4/§5.2 |

**Resumen de §2:** ningún hallazgo CRITICA o ALTA queda **abierto**; los **8 parciales** corresponden a `H-12`, `ACU-04`, `ACU-05`, `ACU-08`, `ACU-29`, `ADT-03`, `ADT-15` y `ADT-22`, y se cierran con los residuales `R-01` a `R-08`.

---

## 3. Hallazgos residuales `R-01..R-12`

> Convención de evidencia: se citan **ambos lados** de la contradicción como `ruta:línea`. Las líneas son las del estado del disco **antes** de aplicar §5.

### 3.1 Tabla completa

| ID | Sev. | Área | Hallazgo | Evidencia (ambos lados) | Recomendación |
|---|---|---|---|---|---|
| **R-01** | 🟠 **ALTA** | Errores EIP-1193 (`ACU-05`/`ADT-03`) | La tabla de mensajes de error tiene **dos modelos**: `requerimientos.md` §2.1 usa **un mensaje por código** y `diccionario_datos.md` §4.3 usa **un mensaje por causa**; las 28 citas de los casos de uso y las 2 del documento técnico siguen apuntando a §2.1, que no es la fuente de los literales. | `requerimientos.md:212` (`### 2.1 Tabla cerrada de mensajes por código EIP-1193`) frente a `diccionario_datos.md:843` (`Códigos de error EIP-1193 usados — tabla cerrada, un mensaje por causa … Esta tabla es la fuente única de los `message` en español.`); citas: `casos_uso/casos_uso.md:19`, `:2133`, `:2273`; `documento_tecnico.md:283`, `:1322`; mensaje divergente: `requerimientos.md:221` («nonce o gas inválidos», un mensaje) frente a `diccionario_datos.md:864-865` (dos filas: nonce inválido y `estimateGas` fallido) | Declarar **fuente única de literales = `diccionario_datos.md` §4.3**; convertir §2.1 en tabla de **código → significado/regla de emisión** que remita a §4.3; redirigir **todas** las citas de los casos de uso y del documento técnico a `diccionario_datos.md` §4.3` |
| **R-02** | 🟠 **ALTA** | Logs / catálogo de eventos (`ACU-04`) | El catálogo es de **24 eventos** (incluye `storage_quota_exceeded`), pero subsisten **tres restos de «23»** en los casos de uso y un **catálogo incompleto** en `requerimientos.md` §2.2, que no lista el evento nuevo. | `diccionario_datos.md:292` (`catálogo cerrado de 24 eventos`) frente a `casos_uso/casos_uso.md:384` (`catálogo de 23 nombres`), `:2338` (`enum de los 23 nombres`), `:2382` (`23 nombres`); `requerimientos.md:229` (lista de 23 eventos, **sin** `storage_quota_exceeded`) frente a `diccionario_datos.md:296` (`El conteo pasa de 23 a 24 eventos, por lo que `requerimientos.md` §2.2 … deben listarlo también`) | Añadir `storage_quota_exceeded` a `requerimientos.md` §2.2 y sustituir los tres «23 nombres» por **«24 eventos»**; declarar el conteo 24 en el `documento_tecnico.md` M31 (ya consta en `documento_tecnico.md:978`) |
| **R-03** | 🟠 **ALTA** | Verificabilidad / MV3 (`ACU-08`/`ADT-15`) | Se afirma que el **puerto de larga vida mantiene vivo el Service Worker**: es **falso en MV3** (el SW se suspende a los ~30 s de inactividad) y **no es falsable**. El documento técnico ya lo corrige, pero `requerimientos.md`, `casos_uso.md` y `diagramas.md` conservan la afirmación. | `documento_tecnico.md:191` («El **puerto de larga vida NO mantiene vivo el Service Worker** … el puerto es solo canal») frente a `requerimientos.md:891` («Y el puerto chrome.runtime.connect mantiene vivo el Service Worker durante la espera»), `casos_uso/casos_uso.md:921` («que mantiene vivo el SW durante la espera»), `diagramas.md:317` (`Note over content,SW: el puerto de larga vida mantiene vivo el SW durante la espera`) y `diagramas.md:620` («el **puerto de larga vida** … que mantiene vivo el SW durante la espera») | Sustituir las 4 afirmaciones por la formulación falsable: «tras **30 s** de inactividad, un `RESUME` con el mismo `approvalId` obtiene respuesta en **< 200 ms**» y «el puerto **no** garantiza la vida del SW: el vencimiento se rearma con `chrome.alarms` y la reconciliación al arrancar» |
| **R-04** | 🟡 MEDIA | Ventana de confirmación (`ADT-22`) | Subsiste la invariante antigua **«una sola ventana por origen»** en `diagramas.md` (nota de secuencia) y en la Figura 12 del documento técnico, pese a que la decisión P-21/DEC-38 fija **una única ventana global** con cola y contador. | `diccionario_datos.md:214` («Existe **una sola** ventana `notification.html` en todo el navegador … **no** se abre una segunda ventana por origen») frente a `diagramas.md:318` («abre una sola ventana por origen») y `documento_tecnico.md:646` (`"windows.create({ focused: true, type: 'popup' }) - una por origen"`) | Sustituir ambas por «abre la **ventana única global** (cola y contador de pendientes, P-21/DEC-38)» |
| **R-05** | 🟡 MEDIA | Metadatos / memoria (`bloque 3`) | `estado_proyecto.md` §2 declara versiones **desactualizadas** de 6 artefactos: la memoria es la fuente de estado del proyecto y hoy miente sobre el corpus. | `estado_proyecto.md:32` (`diccionario_datos.md ✅ v1.4`) frente a `diccionario_datos.md:3` (`**Versión:** 1.5`); `estado_proyecto.md:33` (`entornos_globales.md ✅ v1.6`) frente a `entornos_globales.md:3` (`1.7`); `estado_proyecto.md:34` (`identidad_visual.md ✅ v1.2`) frente a `identidad_visual.md:3` (`1.3`); `estado_proyecto.md:37` (`casos_uso.md ✅ v1.1`) frente a `casos_uso/casos_uso.md:3` (`1.2`); `estado_proyecto.md:40` (`documento_tecnico.md ✅ v1.0`) frente a `documento_tecnico.md:3` (`1.1`); `estado_proyecto.md:36` (memoria `v1.6`) | Sincronizar §2 con las cabeceras reales **tras** aplicar §5 y subir la propia memoria a v1.7 |
| **R-06** | 🟡 MEDIA | Verificabilidad (`ACU-29`) | La tabla de evidencias de RNF de `requerimientos.md` §2 usa **formas no canónicas** de evidencia (`Revisión:`), prohibidas por la convención 3 de `casos_uso.md` (`Vitest:` · `E2E: <spec> — <flujo>` · `Comando:` · `Inspección:`). | `casos_uso/casos_uso.md:13` (regla dura: «no se admite `Revisión:` ni `E2E` sin identificar spec y flujo») frente a `requerimientos.md:208` (`+ Revisión: git ls-files …`), `:209` (`Revisión: §2.6 + Comando: …`) | Sustituir `Revisión:` por `Inspección:` o `Comando:` en las filas afectadas y mantener las cuatro formas canónicas como únicas válidas |
| **R-07** | 🟡 MEDIA | Verificabilidad (`ACU-02`/`ACU-29`) | Criterios con **oráculo tautológico o sin magnitud**: el «Entonces» repite el «Dado/Cuando» o enuncia «sin errores»/«sigue funcionando» sin umbral ni método. | `casos_uso/casos_uso.md:13` (regla dura) y `:2386` (`«sin errores» al cargar dist/ → 0 errores en consola y 0 en el badge de chrome://extensions`) frente a los párrafos de criterio de RNF/CA del Anexo A de `requerimientos.md` (Anexo A §9) que aún no fijan magnitud; barrido de §5.4 | Reescribir cada criterio con **número, método y evidencia** en una de las cuatro formas canónicas (ver el barrido sistemático del bloque 2) |
| **R-08** | 🟡 MEDIA | Verificabilidad (`H-01`) | Los criterios abreviados de la columna «Criterio de aceptación» de la tabla de RF (`requerimientos.md` §1) declaran una **magnitud sin método** en varios RF (criterio medible, pero sin indicar cómo se mide ni con qué evidencia), y algunos RF remiten a la evidencia de forma genérica. | `requerimientos.md:55` (regla: criterio abreviado «≤ 120 caracteres, medible» + evidencia) frente a las filas de §1 cuya columna de evidencia repite `Vitest`/`E2E` sin flujo o sin spec completa; verificación por barrido de §5.4 | Completar la columna de evidencia con la forma canónica `E2E: <spec> — <flujo>` o `Vitest: <spec> — <aserción>` en todos los RF/RT |
| **R-09** | 🟡 MEDIA | Errores EIP-1193 (`ACU-05`) | Dos causas citadas por los casos de uso **no existen** en la tabla de §4.3: «cuenta en uso por una dApp» (`-32602`) y «reset incompleto» (`-32603`), de modo que ninguna fila de §4.3 satisface esas citas. | `casos_uso/casos_uso.md:353` (`el mensaje de la causa «cuenta en uso por una dApp» … un mensaje por causa`) y `:1774` (`el mensaje de la causa «reset incompleto»`) frente a `diccionario_datos.md:845-869` (tabla §4.3: **ninguna fila** con esas causas) | **Requiere decisión:** o se añaden las dos causas a §4.3 (mensaje literal nuevo, **decisión de producto**) o los CU pasan a citar el código (`-32602`/`-32603`) sin prometer un literal inexistente. No se inventa el literal en esta reevaluación | ✅ **CERRADO en la v1.2 con decisión de producto:** las dos causas se añaden a `diccionario_datos.md` §4.3 con **literal propio y `code: -32000`** (familia de conflicto de estado) —«Cuenta en uso por una dApp conectada» (**DEC-45**) y «Reset bloqueado» (**DEC-46**)—, con guardas operativas en §3.10/§3.11; los CA y los CU las citan **por causa**. Detalle en §6.1 |
| **R-10** | 🟡 MEDIA | Metadatos / citas de fuentes | Las cabeceras de `casos_uso.md`, `diagramas.md` y `documento_tecnico.md` citan **versiones obsoletas** de sus fuentes (bloques «Fuentes vinculantes» y «Fuentes obligatorias leídas»), de modo que la cadena de custodia documental es falsa. | `documento_tecnico.md:9-15` (`requerimientos.md **v1.5**`, `casos_uso.md **v1.1**`, `diccionario_datos.md **v1.4**`, `entornos_globales.md **v1.6**`, `identidad_visual.md **v1.2**`, `estado_proyecto.md **v1.5** (DEC-01..DEC-36)`) frente a las cabeceras reales `requerimientos.md:3` (1.6), `casos_uso/casos_uso.md:3` (1.2), `diccionario_datos.md:3` (1.5), `entornos_globales.md:3` (1.7), `identidad_visual.md:3` (1.3), `estado_proyecto.md:6` (v1.6); `casos_uso/casos_uso.md:8` (`requerimientos.md v1.4 … diccionario_datos.md v1.3 … entornos_globales.md v1.5`); `diagramas.md:5` (`casos_uso.md v1.1`, `requerimientos.md v1.5`, `diccionario_datos.md v1.4`, `entornos_globales.md v1.6`) | Actualizar los tres bloques de fuentes a las versiones reales tras §5 y dejar constancia en el historial de cada documento |
| **R-11** | 🟡 MEDIA | Metadatos / memoria | La memoria no refleja el estado real de la reevaluación: el «Próximos pasos» 10 y el criterio §8.2 del veredicto figuran como **pendientes**, y no existe constancia del presente veredicto ni de los 12 residuales. | `estado_proyecto.md:195` («ejecutar el **veredicto de reevaluación** … **pendiente**») y `:224` (`- [ ] **Veredicto de reevaluación (único criterio pendiente)**`) frente a `VEREDICTO_FASE2_V1.md` §1 (veredicto emitido: **Fase 2 NO cerrada**, 12 residuales) | Añadir a `estado_proyecto.md` la referencia al veredicto, el recuento de residuales y la nueva condición de cierre (plan de §5 ejecutado) |
| **R-12** | 🔵 BAJA | Consistencia histórica | El historial de `diccionario_datos.md` y el de `casos_uso.md` mezclan el conteo **viejo y el nuevo** de eventos («23» y «hoy 24») en la misma celda, lo que conserva la ambigüedad aunque el valor vigente esté claro. | `diccionario_datos.md:940` («enum cerrado de **23** eventos (hoy **24**: v1.5 añade `storage_quota_exceeded`)») frente a `diccionario_datos.md:292`/`:294` (enum de **24** eventos) | Mantener la traza histórica **solo** en las filas de historial (marcadas con la versión en que cambió el conteo) y dejar el valor vigente sin doble número en el cuerpo del documento |

### 3.2 Resumen por severidad

| Severidad | IDs | Nº |
|---|---|---|
| 🟠 **ALTA** | `R-01` (tabla de errores), `R-02` (24 eventos), `R-03` (*keep-alive* no falsable) | **3** |
| 🟡 **MEDIA** | `R-04` (ventana por origen), `R-05` (versiones en §2), `R-06` (`Revisión:`), `R-07` (oráculos tautológicos), `R-08` (criterios sin método), `R-09` (causas de error inexistentes), `R-10` (citas de fuentes), `R-11` (memoria desactualizada) | **8** |
| 🔵 **BAJA** | `R-12` (doble conteo en historial) | **1** |

---

## 4. Las 18 contradicciones residuales

> «Valor A» y «Valor B» son los dos valores en conflicto, cada uno con su `ruta:línea`. «Cierre» = cómo queda resuelta con el plan de §5.

| # | Materia | Valor A (`ruta:línea`) | Valor B (`ruta:línea`) | Cierre |
|---|---|---|---|---|
| **C-01** | Fuente de los literales de error | `requerimientos.md:212` — «Tabla cerrada de **mensajes** por código EIP-1193» (§2.1, un mensaje por código) | `diccionario_datos.md:843` — «tabla cerrada, **un mensaje por causa** … fuente única de los `message`» (§4.3) | §5.2: §2.1 pasa a «códigos y su significado» y remite a §4.3 |
| **C-02** | Citas de la tabla de errores | `casos_uso/casos_uso.md:19` — «la tabla §2.1 de `requerimientos.md`» (ídem `:617`, `:833`, `:1189`, `:1730`, `:1995`, `:2133`, `:2273` y 20 más) | `diccionario_datos.md:843` — §4.3 es la fuente única | §5.2: las 28 citas de `casos_uso.md` y las 2 de `documento_tecnico.md` apuntan a §4.3 |
| **C-03** | Ventana de confirmación | `casos_uso/casos_uso.md:20` — «**una sola** ventana global `notification.html` por perfil … contador de pendientes» (P-21/DEC-38) | `diagramas.md:318` — «abre una sola ventana **por origen**»; `documento_tecnico.md:646` — «`windows.create({...}) - una por origen`» | §5.3: ambas citas pasan a «ventana única global con cola y contador» |
| **C-04** | Vida del Service Worker | `requerimientos.md:891` — «el puerto … **mantiene vivo** el Service Worker durante la espera» | `documento_tecnico.md:191` — «el **puerto de larga vida NO mantiene vivo** el Service Worker» | §5.3: formulación falsable (`RESUME` < 200 ms tras 30 s) |
| **C-05** | Vida del Service Worker | `casos_uso/casos_uso.md:921` — «que **mantiene vivo** el SW durante la espera» | `documento_tecnico.md:191` (ídem) y `documento_tecnico.md:1959` (riesgo R16: «MV3 lo termina a los ~30 s») | §5.3 |
| **C-06** | Vida del Service Worker (diagrama) | `diagramas.md:317` — `Note over content,SW: el puerto de larga vida mantiene vivo el SW durante la espera` | `documento_tecnico.md:206` — `"El puerto es un canal, NO un keep-alive (el SW se suspende a los 30 s)"` | §5.3 |
| **C-07** | Vida del Service Worker (Figura 12) | `diagramas.md:620` — «el **puerto de larga vida** … que **mantiene vivo** el SW durante la espera» | `documento_tecnico.md:191`/`:256` («inactividad de 30 s (lo decide el navegador)») | §5.3 |
| **C-08** | Catálogo de eventos | `requerimientos.md:229` — catálogo de **23** eventos (sin `storage_quota_exceeded`) | `diccionario_datos.md:292`/`:294` — catálogo cerrado de **24** eventos, con `storage_quota_exceeded` | §5.1: se añade el evento 24 a §2.2 |
| **C-09** | Conteo de eventos citado | `casos_uso/casos_uso.md:384` — «catálogo de **23 nombres**» | `diccionario_datos.md:284` — «enum cerrado de **24** valores» | §5.1: «24 eventos» |
| **C-10** | Conteo de eventos citado | `casos_uso/casos_uso.md:2338` — «enum de los **23 nombres**» | `diccionario_datos.md:294` — 24 nombres listados | §5.1 |
| **C-11** | Conteo de eventos citado | `casos_uso/casos_uso.md:2382` — «campo **`event`** (**23 nombres**)» | `diccionario_datos.md:292` — 24 eventos | §5.1 |
| **C-12** | Conteo de eventos en historial | `diccionario_datos.md:940` — «enum cerrado de **23** eventos (hoy **24**…)» | `diccionario_datos.md:292` — 24 eventos | §5.1/§5.5: se conserva la traza solo como historial |
| **C-13** | Conteo de eventos en auditoría | `casos_uso/AUDITORIA_CASOS_USO_V1.md:38`/`:85` — «catálogo cerrado de **23 tipos**» (**registro histórico, no se edita**) | `diccionario_datos.md:296` — «el conteo pasa de **23** a **24**» | **Resuelta por declaración de residuo:** el registro histórico conserva el 23 y el corpus vigente usa 24; se declara la regla en §5.5 |
| **C-14** | Versión de `diccionario_datos.md` | `estado_proyecto.md:32` — «`diccionario_datos.md` ✅ **v1.4** (ver cabecera)» | `diccionario_datos.md:3` — «**Versión:** 1.5» | §5.5: se sincroniza §2 de la memoria |
| **C-15** | Versión de `entornos_globales.md` | `estado_proyecto.md:33` — «`entornos_globales.md` ✅ **v1.6**» | `entornos_globales.md:3` — «**Versión:** 1.7» | §5.5 |
| **C-16** | Versión de `casos_uso.md` y de `documento_tecnico.md` | `estado_proyecto.md:37` — «`casos_uso/casos_uso.md` ✅ **v1.1**»; `:40` — «`documento_tecnico.md` ✅ **v1.0**» | `casos_uso/casos_uso.md:3` — «**Versión:** 1.2»; `documento_tecnico.md:3` — «**Versión:** 1.1» | §5.5 |
| **C-17** | Versión de las fuentes (documento técnico) | `documento_tecnico.md:12-15` — «`diccionario_datos.md` **v1.4** … `entornos_globales.md` **v1.6** … `identidad_visual.md` **v1.2** … `estado_proyecto.md` **v1.5** (DEC-01..DEC-36)» | Cabeceras reales: `diccionario_datos.md:3` (1.5), `entornos_globales.md:3` (1.7), `identidad_visual.md:3` (1.3), `estado_proyecto.md:6` (v1.6, DEC-01..DEC-44) | §5.4/§5.5: se actualizan los tres bloques de fuentes |
| **C-18** | Versión de las fuentes (casos de uso y diagramas) | `casos_uso/casos_uso.md:8` — «`requerimientos.md` v1.4 … `diccionario_datos.md` v1.3 … `entornos_globales.md` v1.5»; `diagramas.md:5` — «`casos_uso.md` v1.1 … `requerimientos.md` v1.5 … `diccionario_datos.md` v1.4 … `entornos_globales.md` v1.6» | Cabeceras reales: `requerimientos.md:3` (1.6), `diccionario_datos.md:3` (1.5), `entornos_globales.md:3` (1.7), `casos_uso/casos_uso.md:3` (1.2) | §5.4/§5.5 |

**Balance:** 18 contradicciones residuales, de las cuales **17 se cierran por edición** (§5) y **1 (`C-13`) se cierra por declaración de residuo**: el registro histórico `casos_uso/AUDITORIA_CASOS_USO_V1.md` conserva el literal «23 tipos» por ser prueba de la auditoría de la que nace el cambio, y el corpus vigente usa 24.

---

## 5. Plan de cierre por bloques

> Todos los cambios son **edición documental** en `RepoTecnico/`. **Prohibido** tocar los registros históricos (`INFORME_OPTIMIZACION_V1.md`, `casos_uso/AUDITORIA_CASOS_USO_V1.md`, `AUDITORIA_DOCUMENTO_TECNICO_V1.md`) y las fuentes (`requisitos.md`, `TAREA_PARA_ESTUDIANTE.md`, `GUIA_RAPIDA_TESTING.md`).

### 5.1 Bloque 1 — Consistencia de valores

| Tarea | Cierra | Esfuerzo |
|---|---|---|
| Unificar el catálogo de eventos a **24** (añadir `storage_quota_exceeded` a `requerimientos.md` §2.2; corregir los 3 «23 nombres» de `casos_uso.md`) | `R-02`, `C-08..C-12` | 0,5 h |
| Unificar el plazo de revelado de la semilla a **30 s** (`REVEAL_HIDE_MS = 30000`) y confirmar que el única 60 s es el de conexión | — (verificado) | 0,25 h |
| Unificar **una sola ventana global** de confirmación (retirar «por origen» de `diagramas.md` y del técnico) | `R-04`, `C-03` | 0,25 h |
| Confirmar **8 tipos de mensaje** del protocolo (`entornos_globales.md` §10) | — (verificado) | 0,1 h |
| Confirmar `name`/`rdns` de EIP-6963 (`TrueKeate` / `academy.codecrypto.truekeate`) | — (verificado) | 0,1 h |
| Confirmar cota de payload **64 KiB** / `MAX_PAYLOAD_BYTES = 65536` | — (verificado) | 0,1 h |
| Confirmar cuota de `chrome.storage.local` de **10 MB** sin `unlimitedStorage` | — (verificado) | 0,1 h |
| Confirmar redacción de logs a los **primeros 10 bytes** de `data` | — (verificado) | 0,1 h |
| Confirmar conteos **50 RF (40 Must / 10 Should) · 25 RNF · 13 RT · 4 RE** y desviaciones **D-01..D-13** por conteo real | — (verificado) | 0,25 h |
| Sincronizar versiones de cabecera con la tabla §2 de `estado_proyecto.md` | `R-05`, `C-14..C-16` | 0,5 h |
| **Subtotal** | | **≈ 2,25 h** |

### 5.2 Bloque 2 — Verificabilidad de criterios

| Tarea | Cierra | Esfuerzo |
|---|---|---|
| Declarar **fuente única de literales = `diccionario_datos.md` §4.3**; convertir §2.1 de `requerimientos.md` en tabla de códigos y significado con remisión a §4.3 | `R-01`, `ADT-03`, `C-01` | 1,0 h |
| Redirigir las **28 citas** de `casos_uso.md` y las 2 de `documento_tecnico.md` a §4.3 | `R-01`, `C-02` | 0,75 h |
| Resolver las dos causas sin fila en §4.3 (`cuenta en uso por una dApp`, `reset incompleto`) | `R-09` | ✅ **hecho**: dos filas nuevas en §4.3 con `code: -32000` y guardas en §3.10/§3.11 (**DEC-45/DEC-46**) |
| Barrido de criterios de RF/RT/RNF/`CA-xx` sin magnitud, sin método o con oráculo tautológico y reescritura con número + método + evidencia canónica | `R-07`, `R-08`, `ACU-02`, `ACU-29` | 2,5 h |
| Sustituir las formas de evidencia no canónicas (`Revisión:` → `Inspección:`/`Comando:`) | `R-06` | 0,5 h |
| Sustituir las 4 afirmaciones no falsables del puerto por la formulación «`RESUME` < 200 ms tras 30 s» + «el puerto no garantiza la vida del SW» | `R-03`, `C-04..C-07` | 0,75 h |
| **Subtotal** | | **≈ 5,5 h + 1 decisión** |

### 5.3 Bloque 3 — Memoria y metadatos

| Tarea | Cierra | Esfuerzo |
|---|---|---|
| Actualizar los bloques «Fuentes» de `casos_uso.md`, `diagramas.md` y `documento_tecnico.md` a las versiones vigentes | `R-10`, `C-17`, `C-18` | 0,75 h |
| Actualizar `estado_proyecto.md`: fase, versiones de §2, rango DEC-01..DEC-44, artefactos, riesgos, próximos pasos y criterios de la Fase 2 (marcar lo cumplido y lo que falta) | `R-05`, `R-11` | 1,0 h |
| Registrar en la memoria el presente veredicto, los 12 residuales y la nueva condición de cierre | `R-11` | 0,5 h |
| Subir la versión de cada documento modificado y añadir su línea de historial; sincronizar de nuevo la tabla §2 | — | 0,5 h |
| Verificación final por `grep` (valores corregidos ausentes, `\uFFFD` ausente, sin ficheros temporales) | — | 0,5 h |
| **Subtotal** | | **≈ 3,25 h** |

### 5.4 Estimación total y condición de cierre

| Bloque | Esfuerzo |
|---|---|
| Bloque 1 — Consistencia de valores | ≈ 2,25 h |
| Bloque 2 — Verificabilidad | ≈ 5,5 h (+ 1 decisión) |
| Bloque 3 — Memoria y metadatos | ≈ 3,25 h |
| **Total** | **≈ 11 h** (más la respuesta a `R-09`) |

**La Fase 2 se declara cerrada cuando:** (a) los 12 residuales `R-01..R-12` están cerrados o declarados como residuo aceptado con motivo —✅ **cumplido: 12/12**—; (b) las 18 contradicciones de §4 están resueltas —✅ **cumplido: 18/18**—; y (c) la verificación por `grep` no encuentra ninguno de los valores corregidos ni caracteres corruptos (`\uFFFD`) —**pendiente solo la última pasada de consistencia solicitada por el usuario**.

### 5.5 Reglas de ejecución

1. **Ediciones dirigidas** documento a documento, tras leerlo; nunca sustituciones de cadenas de un solo carácter.
2. Si se usa un script de sustitución, **comprobar el número de reemplazos esperados** antes de escribirlo.
3. **Regla de residuo histórico (C-13):** los tres informes de auditoría conservan sus literales originales («23 tipos/eventos»); el corpus vigente usa **24**.
4. Al terminar, `grep` de comprobación: `23 eventos`/`23 nombres` (solo historial), `mantiene vivo`, `una ventana por origen`, `Revisión:`, `tabla §2.1`, `v1.4`/`v1.5`/`v1.6`/`v1.2` en citas de fuentes, y `\uFFFD`.
5. Cada documento modificado sube de versión y añade su línea de historial; al final se sincroniza la tabla §2 de `estado_proyecto.md`.

---

## 6. Estado de cierre tras la ejecución (v1.2)

> **Alcance de las líneas de esta sección:** las de §3 y §4 corresponden al estado **previo** a la ejecución; las de esta sección, al estado **posterior**.

### 6.1 Residuales cerrados

| ID | Estado | Corrección aplicada (documento · versión) |
|---|---|---|
| `R-01` | ✅ **Cerrado** | `requerimientos.md` v1.7 §2.1 es ahora **catálogo de códigos y su significado** y remite a `diccionario_datos.md` §4.3 como **fuente única de los literales**; las **28** citas de `casos_uso.md` v1.3 y las del `documento_tecnico.md` v1.2 apuntan a §4.3 |
| `R-02` | ✅ **Cerrado** | `requerimientos.md` v1.7 §2.2 y `documento_tecnico.md` v1.2 (M31) listan los **24** eventos, con `storage_quota_exceeded`; `casos_uso.md` v1.3 cita «24 eventos» y `diccionario_datos.md` v1.6 retira la advertencia de delta pendiente |
| `R-03` | ✅ **Cerrado** | Las 4 afirmaciones no falsables se sustituyen por «tras 30 s de inactividad, un `RESUME` con el mismo `approvalId` responde en < 200 ms» y «el puerto **no** garantiza la vida del SW» (`requerimientos.md` v1.7 —CA-RF-37—, `casos_uso.md` v1.3 —CU-16—, `diagramas.md` v1.1 —Figuras 4 y 12—) |
| `R-04` | ✅ **Cerrado** | `diagramas.md` v1.1 y `documento_tecnico.md` v1.2 dibujan la **ventana única global** con cola y contador (P-21/DEC-38) |
| `R-05` | ✅ **Cerrado** | `estado_proyecto.md` v1.7 §2 sincroniza las versiones con las cabeceras reales (v1.7 · v1.6 · v1.8 · v1.4 · v1.3 · v1.1 · v1.2) y corrige **66 módulos (M1..M66)** y **9 `sequenceDiagram`** |
| `R-06` | ✅ **Cerrado** | Las **33** evidencias con forma no canónica (`Revisión:`) del corpus se reescriben a `Comando:`/`Inspección:` con comando o criterio explícito (`requerimientos.md` §1/§2/§3/§9A, `documento_tecnico.md` §9.2 y §9.5, `entornos_globales.md` §3, `identidad_visual.md` §8, `casos_uso.md` §8.1/§8.2) |
| `R-07` | ✅ **Cerrado** | Los oráculos tautológicos detectados por el barrido ganan magnitud, método y evidencia (CU-14, CU-20, CU-22/E2, CU-31, CU-36; CA-RF-34, CA-RF-42, CA-RF-46, CA-RF-49, CA-RF-50; RNF-07, RNF-08, RNF-16, RT-05, RT-07, RT-10) |
| `R-08` | ✅ **Cerrado** | Los criterios abreviados de RF/RT y los RNF afectados pasan a indicar **cómo se mide** y con qué evidencia canónica (barrido de §5.4) |
| `R-09` | ✅ **Cerrado** | **Decisión de producto aplicada (v1.2, DEC-45/DEC-46):** `diccionario_datos.md` **v1.7** gana en **§4.3** **dos filas por causa** con `code: -32000` —«Cuenta en uso por una dApp conectada» y «Reset bloqueado», justificadas como familia de **conflicto de estado** en su **§6.5**—; **§3.10** añade la guarda de sesión de dApp activa (revelado/exportación y borrado de la cuenta importada) y **§3.11 es nueva** (guardas y orden de comprobación del reset). Aplicado en `requerimientos.md` **v1.8** (`CA-RF-05`, `CA-RF-06`, `CA-RF-11` y `CA-RF-50`), `casos_uso.md` **v1.4** (CU-06, CU-07 y CU-30, con flujo alternativo, Gherkin y evidencia) y `documento_tecnico.md` **v1.3** (§3.8 regla 9 y §3.9) |
| `R-10` | ✅ **Cerrado** | `documento_tecnico.md` v1.2, `casos_uso.md` v1.3 y `diagramas.md` v1.1 actualizan sus bloques de «Fuentes» a las versiones vigentes (y DEC-01..DEC-44) |
| `R-11` | ✅ **Cerrado** | `estado_proyecto.md` v1.7 registra el veredicto en §2, marca el cierre del paso 10, abre el paso 11 (plan de residuales) y añade el criterio pendiente en §8.2 |
| `R-12` | ✅ **Cerrado** | `diccionario_datos.md` v1.6 separa el conteo histórico (23 en v1.4 → 24 desde v1.5) del valor vigente y retira la nota de delta pendiente |

**Balance:** **12 cerrados** y **0 pendientes** (`R-09` cerrado en la v1.2 con DEC-45/DEC-46).

### 6.2 Contradicciones resueltas

| Contradicciones | Estado |
|---|---|
| `C-01` a `C-12`, `C-14` a `C-18` | ✅ **Resueltas** por edición del corpus (fuente única de literales, 24 eventos, ventana única, versiones y citas de fuentes) |
| `C-13` | ✅ **Resuelta por declaración de residuo**: el registro histórico `casos_uso/AUDITORIA_CASOS_USO_V1.md` conserva «23 tipos» como prueba del cambio; el corpus vigente usa **24** (regla de §5.5) |

**Balance: 18/18 resueltas · 0 contradicciones abiertas.**

### 6.3 Verificación final ejecutada

| Comprobación | Resultado |
|---|---|
| `23 nombres` / `catálogo de 23 tipos` en el corpus vigente | **0** (solo historiales y la traza «v1.4: 23 → v1.5: 24») |
| `mantiene vivo el SW` / `mantiene vivo el Service Worker` | **0** en afirmaciones del corpus; solo en los registros históricos que documentan la corrección y en el propio veredicto |
| `tabla §2.1` como fuente de literales | **0**; todas las citas apuntan a `diccionario_datos.md` §4.3 |
| `Revisión:` en celdas de criterio | **0**; solo la propia regla que lo prohíbe (convención 3) y los historiales |
| `una ventana por origen` como invariante vigente | **0**; solo en los registros de la decisión que la sustituye |
| Caracteres corruptos (`U+FFFD`) | **0** en los 9 documentos de `RepoTecnico/` |
| Registros históricos y fuentes | **Intactos** (`INFORME_OPTIMIZACION_V1.md`, `casos_uso/AUDITORIA_CASOS_USO_V1.md`, `AUDITORIA_DOCUMENTO_TECNICO_V1.md`, `requisitos.md`, `TAREA_PARA_ESTUDIANTE.md`, `GUIA_RAPIDA_TESTING.md`) |
| Versiones de los documentos modificados (estado de la v1.2) | `requerimientos.md` **v1.8** · `diccionario_datos.md` **v1.7** · `entornos_globales.md` **v1.8** · `identidad_visual.md` **v1.4** · `estado_proyecto.md` **v1.8** · `casos_uso/casos_uso.md` **v1.4** · `casos_uso/diagramas.md` **v1.1** · `documento_tecnico.md` **v1.3** · `VEREDICTO_FASE2_V1.md` **v1.2** |
| Causas de `R-09` con fila en §4.3 | **2/2** («Cuenta en uso por una dApp conectada» y «Reset bloqueado», ambas `-32000`); **0** referencias a una fila inexistente en el corpus vigente |
| Literales duplicados fuera de la fuente única | **0**: `requerimientos.md`, `casos_uso.md` y `documento_tecnico.md` citan la **causa** o el **código** de `diccionario_datos.md` §4.3 |
| Guardas de estado documentadas | **2/2**: revelado/borrado con sesión de dApp activa (§3.10 del diccionario, §3.8 del técnico) y reset con cola no vacía o transacción en vuelo (§3.11 del diccionario, §3.9 del técnico) |
| Conteos de requisitos | **Sin cambios**: **50 RF = 40 Must + 10 Should · 25 RNF · 13 RT · 4 RE** |

### 6.4 Condición de cierre vigente

`R-09` quedó **cerrado** en la **v1.2** con la decisión de producto del usuario (**DEC-45**/**DEC-46**): las dos causas tienen **fila propia** en `diccionario_datos.md` §4.3 con `code: -32000` y sus **guardas operativas** (§3.10 y §3.11), citadas por causa desde `requerimientos.md`, `casos_uso.md` y `documento_tecnico.md`. Con los **12 residuales cerrados** y las **18 contradicciones resueltas**, la Fase 2 es **apta para el cierre** y queda **pendiente solo la última pasada de consistencia** solicitada por el usuario: el barrido con `grep` de §6.3 sobre el corpus completo. Aprobada esa pasada, la Fase 2 se declara cerrada y se autoriza la **Fase 3**.
