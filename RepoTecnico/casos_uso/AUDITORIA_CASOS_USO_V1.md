# 🔍 Auditoría de los Casos de Uso — TrueKeate Wallet

> **Fase:** 2 — Auditoría · **Versión:** 1.0
> **Objeto auditado:** `RepoTecnico/casos_uso/casos_uso.md` v1.0 (36 CU, 1787 líneas)
> **Contrastado con:** `requerimientos.md` v1.4 · `diccionario_datos.md` v1.3 · `entornos_globales.md` v1.5 · `identidad_visual.md` v1.2 · `estado_proyecto.md` v1.4 · `INFORME_OPTIMIZACION_V1.md`
> **Método:** 3 revisores independientes en paralelo con lentes complementarias (cobertura/trazabilidad, testabilidad Gherkin/EARS y consistencia entre documentos), consolidación con deduplicación y una regla adversaria: *ante la duda, no se reporta*.

---

## 1. Veredicto

| Lente | Veredicto | Métricas clave |
|---|---|---|
| **Cobertura y trazabilidad** | El alcance Must **existe** (39/39 RF Must con CU, 0 huérfanos), pero la **matriz de trazabilidad no es cerrada ni bidireccionalmente consistente**. | 39/39 Must · 10/10 Should · 0 huérfanos · **9 referencias cruzadas erróneas** · 2 CU ausentes de la matriz de actores |
| **Testabilidad** | Los CU **no son 100 % testeables**: 71 % de los bloques Gherkin son estrictamente correctos, pero hay 1 criterio autocontradictorio, 7 no verificables en CI, 9 evidencias defectuosas y 5 flujos alternativos sin criterio. | 173 criterios revisados · 84/118 Gherkin correctos · 0/62 `CA` sin evidencia · 0/36 CU sin flujos de excepción · 0 términos vagos de los clásicos |
| **Consistencia** | Corpus **mayoritariamente consistente**: la nomenclatura `truekeate_*`, el alias del provider, `eth_sign → 4200`, los plazos y las decisiones DEC-21..DEC-26 se cumplen sin excepción. | 225 identificadores cruzados · **12 hallazgos / 25 instancias** · 23 de 36 CU afectados |

**Conclusión:** los casos de uso son una especificación de trabajo sólida y muy por encima de la media, pero **no están aptos como matriz de aceptación cerrada** hasta cerrar los 2 hallazgos críticos y los 9 altos. Nada indica un problema de concepto: son defectos de cierre, consistencia y verificabilidad.

---

## 2. Hallazgos consolidados

Severidades: 🔴 CRITICA · 🟠 ALTA · 🟡 MEDIA · 🔵 BAJA. La columna **Origen** indica las lentes que lo reportaron (C = cobertura, T = testabilidad, S = consistencia).

### 🔴 Bloqueantes

| ID | Sev. | Área | Hallazgo | Evidencia | Recomendación | Origen |
|---|---|---|---|---|---|---|
| **ACU-01** | 🔴 | Trazabilidad | La matriz §5 y las fichas se contradicen **en las dos direcciones**: en la matriz y no en la ficha (RF-10 → CU-18/CU-24, RF-24 → CU-19); en la ficha y no en la matriz (RF-27 → CU-26, RF-49 → CU-34, RNF-02 → CU-10, RNF-18 → CU-33/CU-34, RNF-19 → CU-34, RT-11 → CU-27). RF-10 se marca «más de un CU» mientras el índice declara uno solo. | `casos_uso.md:1614-1661` vs fichas `:432`, `:782`, `:1036`, `:1120`, `:1162`, `:1417`, `:1457` | Fijar la regla «la ficha declara, la matriz agrega» y **regenerar §2, §5 y §7 desde las 36 fichas**; añadir la bidireccionalidad como aserción de RNF-01. | C H-01, S H-07 |
| **ACU-02** | 🔴 | Unicidad del oráculo | Criterio **autocontradictorio** en la política de reintentos RPC: «máximo 3 reintentos» con esperas 1/2/4 s (eso exige 4 intentos), el alternativo E1 dice «responde al cuarto intento» y la evidencia habla de «3 fallos y 1 éxito». Ninguna aserción puede pasar y fallar de forma determinista. | `casos_uso.md:1336`, `:1344`, `:1351`, `:1363`, `:1364`, `:1720` | Reescribir: «1 intento inicial + 3 reintentos = **4 llamadas RPC** contadas por el provider falso, con esperas observadas de 1/2/4 s» y fijar en la Gherkin el contador y el timeout por intento. | T H-01 |

### 🟠 Altas

| ID | Sev. | Área | Hallazgo | Evidencia | Recomendación | Origen |
|---|---|---|---|---|---|---|
| **ACU-03** | 🟠 | EIP-6963 | Divergencia de `name` y `rdns`: `requerimientos.md` RT-13 fija `name: "TrueKeate"` / `rdns: "academy.codecrypto.truekeate"`; el diccionario §4.1.1 fija `"TrueKeate Wallet"` / `"com.truekeate.wallet"`. CU-22 se redactó contra RT-13 sin escribir el literal, y §8.2 quedó autocircular («el rdns declarado en RT-13»). | `requerimientos.md:304` · `diccionario_datos.md:445-447` · `entornos_globales.md:162` · `casos_uso.md:979`, `:1756`, `:1772` | **Fuente de verdad: RT-13** (DEC-01). Corregir el diccionario a `name: "TrueKeate"` + `rdns: "academy.codecrypto.truekeate"`, escribir el literal del `rdns` en CU-22 y cerrar el hueco 1 de §9. | C H-03, S H-01 |
| **ACU-04** | 🟠 | Observabilidad | `truekeate_logs` **no tiene campo de nombre de evento**, pero RF-29 lo exige y RNF-16/CU-29 exigen «exactamente 1 entrada por evento del catálogo cerrado de 23 tipos»; el único campo cerrado es `category` (5 valores). Varios CU usan además categorías como si fueran eventos (`system` en CU-04/CU-07). | `requerimientos.md:137`, `:199`, `:227` · `diccionario_datos.md:262-273` · `casos_uso.md:211`, `:315`, `:325`, `:1243`, `:1280` | Añadir a §2.11 el campo `event` (enum de los 23 nombres) separado de `category`, y sustituir los usos de `system`/`account_imported` por eventos del catálogo. | S H-02 |
| **ACU-05** | 🟠 | Errores EIP-1193 | La tabla cerrada §2.1 asigna **un mensaje único por código**, pero los CU emiten mensajes distintos con el mismo `code` (CU-15 con `4001` por vencimiento, CU-11/E2 con `-32000` por fondos, CU-03/A1 y CU-06/E1 con `-32602` por causas distintas) y CU-30/E1 muestra un error **sin `code`**. | `requerimientos.md:214-220` · `casos_uso.md:181`, `:289`, `:490`, `:645`, `:1304`, `:1594` | Ampliar §2.1 con una fila por causa (o alinear los CU al mensaje único) y dar `code` al error de CU-30/E1. | S H-03 |
| **ACU-06** | 🟠 | Entidades | CU-05 exige persistir la etiqueta de las **cuentas derivadas** en un mapa dentro de `truekeate_settings` que **no existe** en el diccionario: `label` solo está definido para `truekeate_imported_accounts[]` y RF-05 ata la etiqueta renombrable solo a la importada. | `casos_uso.md:242-266` · `diccionario_datos.md:59`, `:232-239`, `:558` · `requerimientos.md:103` | Definir `accountLabels: Record<indice, string>` en §2.10 del diccionario, o limitar CU-05 a las importadas y ajustar su criterio y trazabilidad. | S H-04 |
| **ACU-07** | 🟠 | Alcance MVP | CU-16 (MVP) tiene su oráculo principal en **dos requisitos diferidos**: exige que el badge muestre 2 (RF-38, Should) y su flujo A3 exige notificaciones de Chrome (RF-39, Should). CU-15 cita además `CA-RF-38` para la purga del badge. | `casos_uso.md:55`, `:648`, `:691`, `:704`, `:717` · `requerimientos.md:390-393` | **Pendiente de decisión (P-17).** | C H-04 |
| **ACU-08** | 🟠 | Verificabilidad | `Entonces` que **nunca pueden fallar o no son observables**: (a) «el puerto mantiene vivo el Service Worker»; (b) «la UI sigue aceptando interacción»; (c) «sin errores» al cargar `dist/`. | `casos_uso.md:716`, `:1330`, `:1354`, `:1570` · `requerimientos.md:867` | (a) «tras 30 s sin actividad, un `RESUME` con el `approvalId` responde en < 200 ms»; (b) «el botón pasa a `loading` y la lista sigue respondiendo a `Tab`» + `axe-core`; (c) «0 errores en consola y 0 en el badge de errores de `chrome://extensions`». | T H-02 |
| **ACU-09** | 🟠 | Evidencia | El único oráculo de RNF-18 está **roto**: `grep -rnE "…" src` recorre todo `src/` **sin excluir `tokens.css`** (nunca daría 0) y **no incluye ningún patrón de degradado**, pese a que el criterio lo exige. | `casos_uso.md:1443`, `:1446`, `:1731` · `requerimientos.md:977-979` | `grep -rnE "#[0-9a-fA-F]{3,8}\|rgb\(\|hsl\(\|linear-gradient\|radial-gradient\|font-family:" src --exclude=tokens.css` con alcance cerrado. | T H-03 |
| **ACU-10** | 🟠 | Flujos alternativos | Cinco flujos alternativos están descritos pero **no tienen criterio ni evidencia**: X-03 (SW dormido → reconexión con backoff), CU-11/E3 (reintento de nonce), CU-29/E1 (reintento de escritura de log), CU-15/E1 (re-descubrir la ventana), CU-22/E1 (provider preexistente). | `casos_uso.md:491`, `:661`, `:707`, `:965`, `:1259`, `:1587` | Añadir un bloque Gherkin falsable por cada uno con evidencia `Vitest:` y fake timers. | T H-04 |

### 🟡 Medias

| ID | Sev. | Área | Hallazgo | Evidencia | Recomendación | Origen |
|---|---|---|---|---|---|---|
| **ACU-11** | 🟡 | Trazabilidad | **RE-03** (no hacer push sin orden) queda sin ningún CU mientras §9 afirma cobertura completa; el índice §2 omite RNF-02, RNF-18, RNF-19 y RT-11 que sí citan las fichas; CU-36 cita RE-01/RE-04 fuera de su índice. | `casos_uso.md:40-75`, `:1759`, `:1766` | Declarar RE-03 como restricción de proceso verificada por historial de comandos (sin CU) y completar la columna del índice. | C H-02 |
| **ACU-12** | 🟡 | Actores | La matriz §7 omite **CU-05 y CU-06** (Usuario primario); 6 CU declaran **dos actores primarios** («dApp / Usuario»), en contra de la convención 1 del propio documento; en CU-17 el índice dice «dApp / Usuario» y la ficha asigna el Usuario a secundarios; §7 declara al Usuario primario de CU-16 mientras §2 y la ficha asignan ese CU al Service Worker. | `casos_uso.md:9`, `:44`, `:45`, `:55`, `:56`, `:63-73`, `:642`, `:685`, `:1690` | Un actor primario por CU, el disparador alterno como flujo `A#`, y regenerar §7 desde las fichas. | C H-05/H-06, S H-08 |
| **ACU-13** | 🟡 | Objetivos | **CU-11, CU-12 y CU-13** reparten el mismo objetivo de actor (mover saldo) con criterios casi idénticos; CU-12 no declara RF-43 pese a que su EARS exige `chainId` activo. | `casos_uso.md:469`, `:471`, `:474`, `:511`, `:518`, `:520`, `:523`, `:547` | Declarar explícitamente el deslinde (dApp vs popup vs contrato) y añadir RF-43 a CU-12; o fusionar con flujo `A#`. | C H-07 |
| **ACU-14** | 🟡 | Alcance MVP | **CU-07** (revelar/exportar la frase semilla) está marcado MVP pero es **DERIVADO** sin RF que lo respalde (solo RNF-22), de modo que el alcance comprometido deja de ser «los 39 RF Must». | `casos_uso.md:46`, `:310`, `:1776` · `requerimientos.md:392` | **Pendiente de decisión (P-18).** | C H-08 |
| **ACU-15** | 🟡 | Rúbrica | El ítem **Documentación (10 pts: README 4 + instrucciones 3 + comentarios 3)** no tiene criterio en ningún CU: CU-36 solo lo menciona en su postcondición de éxito, sin Gherkin ni trazabilidad. | `casos_uso.md:1538`, `:1541` · `requerimientos.md:351-353`, `:365-367` | Añadir a CU-36 un Gherkin explícito de README / INSTRUCCIONES / JSDoc con evidencia `Inspección:`. | C H-09 |
| **ACU-16** | 🟡 | Contrato RPC | `wallet_switchEthereumChain` figura como **«Sí (si la red no es la activa)»** en el catálogo, pero CU-24 cambia de red **sin aprobación**, sin entrada `pending` y sin ventana. | `diccionario_datos.md:499` · `casos_uso.md:555`, `:1039-1043` · `requerimientos.md:125` | **Pendiente de decisión (P-19).** | S H-05 |
| **ACU-17** | 🟡 | Entidad sin requisito | `truekeate_connected_sites.lastUsedAt`/`expiresAt` y `settings.sessionTtlMs = 86400000` existen y CU-18 los verifica (A2 «sesión vencida por TTL de 24 h»), pero **ningún RF los respalda**: RF-25 solo cubre la persistencia por origen. | `diccionario_datos.md:123`, `:239` · `casos_uso.md:781`, `:1773` · `requerimientos.md:128` | **Decidido:** incorporar la caducidad de sesión a RF-25 (24 h renovables en cada uso) con criterio y evidencia. | S H-06 |
| **ACU-18** | 🟡 | Verificabilidad | «Se abre exactamente 1 ventana `notification.html`, **con foco y en primer plano**»: el foco real no es observable desde Playwright ni desde el SW. | `casos_uso.md:562`, `:590` · `requerimientos.md:844`, `:849` | Asertar el **contrato de apertura**: espía que verifica `chrome.windows.create({ focused: true, type: 'popup' })` y una llamada a `windows.update(id, { focused: true })`. | T H-05 |
| **ACU-19** | 🟡 | Notación | Seis **restricciones del sistema** están escritas como Gherkin («Cuando Anvil escucha…», «Cuando se inspeccionan encabezados…», «Cuando el SW arranca», «Cuando transcurren 5 s», «Cuando se produce un rechazo»). | `casos_uso.md:105`, `:380-386`, `:448-455`, `:1060-1063`, `:1268-1273`, `:1438-1444`, `:1480-1485` | Convertirlas a EARS y dejar el `Inspección:` como evidencia, no como `Cuando`. | T H-06 |
| **ACU-20** | 🟡 | Formato Gherkin | **13 bloques con 2+ `Cuando`/`Entonces`** (escenarios concatenados) y **25 bloques con `Pero` condicional** que introduce un escenario inverso no ejecutable en la misma prueba. | `casos_uso.md:108`, `:146`, `:225`, `:448`, `:495`, `:578`, `:673`, `:755`, `:1094` · `requerimientos.md:541`, `:647`, `:657`, `:668`, `:689`, `:731`, `:768` | Dividir en dos escenarios o usar `Ejemplos:` (Scenario Outline). | T H-07 |
| **ACU-21** | 🟡 | Oráculo vacío | Dos `Entonces` **tautológicos**: «el número de entradas nunca supera 500» con 5 entradas de partida; «la reconciliación completa en menos de 1 s» con 1 sola solicitud pendiente. | `casos_uso.md:381-384`, `:1278` · `requerimientos.md:817` | «Tras insertar 500+ entradas, conserva exactamente las 500 más recientes por `ts`» y «con **50** pendientes, el scrape completo < 1 s con reloj inyectado». | T H-08 |
| **ACU-22** | 🟡 | Medición | RNF-02 exige «< 500 ms **en caliente**» para `notification.html`/`connect.html` sin definir «caliente» ni el método, y CU-08 declara como `Comando:` una llamada a la API del navegador. | `casos_uso.md:388`, `:1715` | Definir «caliente» (SW arrancado, bundle en caché, 10 repeticiones, mediana) y cambiar la evidencia a `E2E:` con aserción sobre `performance.getEntriesByName(...)` + artefacto JSON. | T H-09 |
| **ACU-23** | 🟡 | Evidencia | RNF-19 exige que el oro `#C9A97F` sea «solo decorativo», pero su evidencia (`contrast.spec.ts`) solo lee `tokens.css` y no puede comprobar el **uso** del color en componentes. | `casos_uso.md:1487`, `:1732` | Añadir un test de uso: falla si un nodo cuyo color computado resuelve a `--tk-gold-500` contiene texto (excluyendo SVG con `aria-hidden`). | T H-10 |
| **ACU-24** | 🟡 | Postcondiciones | Dos postcondiciones verificables sin criterio: el umbral «si un flujo no responde en **5 s** o deja el contenedor vacío» (CU-23) y la tipografía/tracking/color exactos de la tagline (CU-33). | `casos_uso.md:992` vs `:1012-1023`; `:1414` vs `:1431-1444` | Añadir Gherkin con magnitud y evidencia `E2E:` asertando `getComputedStyle` (familia, peso, tracking, token de color). | T H-11 |
| **ACU-25** | 🟡 | Claves canónicas | Se citan claves no canónicas: «`settings.networks`» cuando la clave real es `truekeate_networks`, y se alterna `settings.*` con `truekeate_settings.*` para el mismo almacén. | `casos_uso.md:129`, `:209`, `:211`, `:431`, `:690`, `:781`, `:1063`, `:1245` vs `diccionario_datos.md:83` | Usar siempre el nombre completo con prefijo; es criterio de RT-13. | S H-09 |
| **ACU-26** | 🟡 | Duplicidad | Los CU reproducen literalmente los `CA-RF-xx` de §9 y **la copia ya derivó** (RNF-15: `npm ci` en los CU frente a `npm install` en `requerimientos.md`). | `casos_uso.md:1728`, `:1538`, `:1545` vs `requerimientos.md:198` | Fijar `npm ci` como literal único en RNF-15 y sustituir la copia por referencia al `CA-RF-xx` + el delta específico del CU. | S H-10 |
| **ACU-27** | 🟡 | Permisos | CU-25/A1 exime del permiso de host en runtime al alta de red hecha desde el popup, contradiciendo RT-04 y `entornos_globales.md` §4 (el alta siempre solicita `chrome.permissions.request`), y el propio CU-25/E2 contempla la denegación. | `casos_uso.md:1083-1090` · `requerimientos.md:295` · `entornos_globales.md:213` | Eliminar la excepción de A1: solicitar el permiso también desde el popup (el clic del usuario es el gesto válido). | S H-11 |
| **ACU-28** | 🟡 | Hueco mal clasificado | El hueco 10 de §9 presenta como «pertenece a `documento_tecnico.md` pendiente» el diseño de `rmwLock`, `fifoByAccount` y `portsByApprovalId`, que **ya es criterio de aceptación** de CU-16. | `casos_uso.md:1781` vs `:697`, `:707` | Reclasificarlo como «contrato observable ya especificado; quedan los detalles internos». | C H-03 |

### 🔵 Bajas

| ID | Sev. | Área | Hallazgo | Evidencia | Recomendación | Origen |
|---|---|---|---|---|---|---|
| **ACU-29** | 🔵 | Convención de evidencia | Se incumple la convención del propio documento (`Vitest:`/`E2E:`/`Comando:`/`Inspección:`): aparecen `Revisión:` y `E2E` sin identificar spec ni flujo. | `casos_uso.md:11`, `:1109`, `:1364`, `:1575` · `requerimientos.md:915` | Unificar `Revisión:` → `Inspección:` y completar cada evidencia con `spec`/flujo. | T H-12 |
| **ACU-30** | 🔵 | Precondición | CU-13 declara que la solicitud `pending` puede provenir de **CU-17**, pero la conexión no usa `truekeate_pending_requests` ni `notification.html`: vive en `truekeate_connect_request` y se aprueba en `connect.html`. | `casos_uso.md:555`, `:735`, `:743` vs `diccionario_datos.md:207-210` | Retirar CU-17 de la precondición de CU-13. | S H-12 |

---

## 3. Decisiones ya adoptadas al consolidar (no requieren consulta)

| # | Decisión | Cierra |
|---|---|---|
| **D-A** | **Fuente de verdad de EIP-6963 = `requerimientos.md` RT-13**: `name: "TrueKeate"`, `rdns: "academy.codecrypto.truekeate"`. Se corrige el diccionario y se escribe el literal en CU-22. | ACU-03 |
| **D-B** | La **caducidad de sesión** (24 h renovables, `sessionTtlMs = 86400000`) se incorpora a **RF-25** con su criterio y evidencia. | ACU-17 |
| **D-C** | El literal de build es **`npm ci && npm run build`** en todo el corpus (RNF-15, RNF-24 y CU). | ACU-26 |
| **D-D** | `truekeate_logs` gana el campo **`event`** (enum de los 23 eventos del catálogo), independiente de `category`; se corrigen los CU que usaban categorías como eventos. | ACU-04 |
| **D-E** | La tabla §2.1 de errores se amplía **un mensaje por causa** (varios mensajes por código) y todo error mostrado al usuario lleva `code`. | ACU-05 |
| **D-F** | Se define **`accountLabels: Record<indice, string>`** en `truekeate_settings` para las cuentas derivadas. | ACU-06 |
| **D-G** | El alta de red **siempre** solicita el permiso de host en runtime, también desde el popup. | ACU-27 |

## 4. Decisiones pendientes de consulta

| ID | Pregunta | Hallazgo |
|---|---|---|
| **P-17** | ¿Se separa el oráculo de CU-16 (MVP sin badge) o se promociona RF-38 a Must? | ACU-07 |
| **P-18** | ¿CU-07 (revelar/exportar la frase semilla) entra en el MVP con un RF propio o pasa al ciclo posterior? | ACU-14 |
| **P-19** | ¿`wallet_switchEthereumChain` requiere aprobación del usuario o es inmediato? | ACU-16 |

---

## 5. Anexo — Comprobaciones que salieron correctas

- **39/39 RF Must** con al menos un CU; **0 huérfanos**; los 10 Should coinciden exactamente con la tabla MVP de `requerimientos.md` §4.5.
- **Los 62 `CA` declaran evidencia** (regla dura cumplida) y **los 36 CU tienen flujos de excepción** que cubren rechazo, expiración, saldo insuficiente, mnemonic inválido, clave privada inválida, RPC caído, cadena equivocada, doble solicitud y ventana cerrada.
- **0 identificadores `CA-xx` inexistentes** entre los 49 `CA-RF` y 13 `CA-RT` citados.
- Nomenclatura `truekeate_*`, alias `window.truekeate === window.codecrypto` (verificado en CU-22), `eth_sign` siempre retirado con `4200`, plazos 120 s/60 s, polling 5 s, `logLimit = 500`, `truekeate_pending_requests` como `Record<approvalId, PendingRequest>` y las decisiones **DEC-21..DEC-26**: **sin excepción**.
- **Sin términos vagos** de los clásicos («rápido», «robusto», «óptimo», «adecuado») y con magnitudes fijadas (120 s/60 s, 5 s, < 1 s, < 800 ms p95, 200/500 entradas, 44×44 px, 4,5:1).
- Medidas de ventana, tokens de color y estados de CU-33/CU-34/CU-35 idénticos a `identidad_visual.md`.
- Estructura completa en las 36 fichas: flujo principal, criterios, EARS, trazabilidad, evidencia y datos implicados; sin referencias a CU inexistentes ni numeración rota.
