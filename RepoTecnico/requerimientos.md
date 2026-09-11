# 📑 Requerimientos — TrueKeate Wallet (Extensión Chrome estilo MetaMask)

> **Fase:** 1 — Concepto · **Versión:** 1.9 · **Estado:** ✅ **FASE 1 COMPLETADA** (entrevista cerrada; pendiente solo la creación de repos remotos)
> **Documento fuente:** `RepoTecnico/requisitos.md` (enunciado original) y `RepoTecnico/TAREA_PARA_ESTUDIANTE.md`.
> **Guía principal de desarrollo:** este archivo. Se actualiza de forma incremental durante todo el proyecto.
> **Anexo vinculante de diseño:** `RepoTecnico/identidad_visual.md` (marca TrueKeate: paleta, tipografía, degradados, iconos y tokens CSS).
> **Historial de cambios:** v1.0 borrador de extracción · v1.1 renumeración `RF-01..RF-47` · v1.2 identidad visual (RF-48/RF-49) y RNF-18..RNF-20 · v1.3 decisiones P-13..P-15 y RE-04 · v1.4 — remedia el informe `INFORME_OPTIMIZACION_V1.md` (49 RF vigentes entonces): H-01 criterio de aceptación + evidencia en los 49 RF y 13 RT y nuevo **Anexo A (§9)** con `CA-RF-xx`/`CA-RT-xx` en Gherkin/EARS · H-02/H-07/H-08 ciclo de aprobación MV3 (puerto de larga vida, `chrome.alarms`, cola `Record<approvalId, PendingRequest>`, reconciliación al arrancar, cierre de ventana y `4001`) · H-11a retirada de `eth_sign` · H-11b vista previa con decodificación y avisos · H-15 alias `window.codecrypto` · H-03/H-05/H-06/H-30/H-38 conteos, desambiguación de Fuente y trazabilidad de NUEVO · H-12/H-13/H-17/H-19/H-20/H-22/H-25/H-26/H-29/H-40/H-42 RNF operacionalizados y categorías nuevas (Accesibilidad, Recuperación, Cumplimiento, Mantenimiento) · H-14/H-16/H-24/H-27/H-28/H-34/H-35/H-36/H-37 rúbrica, entregables, stakeholders, MVP y licencias · **v1.5 — remedia `casos_uso/AUDITORIA_CASOS_USO_V1.md` (ACU-01..ACU-30, decisiones D-A..D-G y P-17/P-18/P-19):** conteos a **50 RF (40 Must / 10 Should)** · **RF-50 (Must)** revelar y exportar la frase semilla (BIP-39) y las claves privadas con confirmación explícita y su **`CA-RF-50`** en Gherkin y EARS · desviación **D-13** (aportación de diseño, H-25/RNF-22) · **P-17** el MVP no depende del badge y RF-38/RF-39 siguen en el ciclo posterior · **P-19** `wallet_switchEthereumChain` exige aprobación cuando la red destino no es la activa (RF-22 y `CA-RF-22`) · **D-B** caducidad de sesión de dApp de 24 h renovables en RF-25 y `CA-RF-25` · **D-C** build limpio `npm ci && npm run build` (RNF-15) · **D-A** RT-13 como fuente de verdad de EIP-6963 · **D-D** campo `event` en `truekeate_logs` · **D-E** varios mensajes por código EIP-1193 · **D-F** `accountLabels` · **D-G** permiso de host en runtime siempre · rúbrica de Documentación (§4.1) apuntada a la evidencia existente · **v1.6 (esta versión) — remedia `AUDITORIA_DOCUMENTO_TECNICO_V1.md` (hallazgos ADT-04, ADT-06, ADT-09, ADT-12, ADT-14, ADT-19, ADT-20, ADT-22, ADT-25 y ADT-30; decisiones D-J, D-K, D-L, D-M, D-N, D-O, D-P, D-Q y D-T) e incorpora las decisiones del usuario P-20, P-21 y P-22:** **RF-50/`CA-RF-50`** con plazo de revelado de **30 s** (retirada toda mención a 60 s en el revelado), **ocultado por pérdida de foco** y **política de portapapeles de la semilla (P-20/DEC-37)**: copiar permitido y **borrado del portapapeles al ocultar** con test que verifica que no conserva la semilla · **RNF-09** reescrito: el mnemonic y las claves privadas **nunca viajan por `window.postMessage` ni hacia la página web** (sí al popup y a las ventanas de la extensión por RF-50), con verificación de la **higiene del revelado** · **RNF-10** corregido: `inject.js` se expone a **todas** las páginas (`<all_urls>`, `use_dynamic_url` y `exclude_matches` para orígenes de extensiones), con la exigencia real de validación de `sender`/`origin`, allowlist de métodos internos y `targetOrigin` cerrado · **RF-23/`CA-RF-23`**: el alta de red **añade sin activar** y usar la red nueva exige `wallet_switchEthereumChain` con su propia aprobación (**P-22/DEC-39**, RF-22/`CA-RF-22`/P-19) · **RF-35/`CA-RF-35`**: **una sola ventana global** de `notification.html` con **cola** y **contador de pendientes** (**P-21/DEC-38**), en sustitución de «única por origen» · **RT-04**: `notifications` sale del conjunto obligatorio y pasa a **permiso opcional** ligado a RF-39 (ciclo posterior, **ADT-30/DEC-44**) · **RT-13**: el **UUID del provider es una constante literal congelada** y el manifest incluye una **`key` fija** que estabiliza el ID de la extensión (allowlist CORS de Anvil RE-04 y reproducibilidad de los E2E, **ADT-19/DEC-43**) · **redacción de logs** en **los primeros 10 bytes** de `data` (**ADT-12/D-T**). **Los conteos se mantienen y se verifican: 50 RF (40 Must / 10 Should) · 25 RNF · 13 RT · 4 RE.** · **v1.9 (esta versión) — cierre de los residuales de la última pasada de consistencia:** **`VR-01`** fija en **RT-04**/`CA-RT-04` el conjunto exacto de permisos declarados —`storage`, `alarms`, `favicon`, `clipboardRead` y `clipboardWrite`, cada uno justificado (icono de origen de la dApp y política de portapapeles de R-09/P-20)—, idéntico al de `documento_tecnico.md` §7.3, `entornos_globales.md` §4 y `diccionario_datos.md` §3.8/§3.10; **`VR-07`** sustituye `settings.networks` por la clave canónica `truekeate_networks` en **RT-06**; y **`VR-08`** normaliza cuatro evidencias a las formas admitidas (`E2E: 04-enviar.spec.ts — recibo type 2` en RF-42, `Vitest: contrast.spec.ts` en la matriz de contraste y `Comando: forge test --root contracts --match-contract EIP712VerifierTest` en RT-11 y `CA-RF-20`). Sin cambios en los conteos.

---

## 0. Resumen ejecutivo

Construir una **extensión de navegador Chrome/Edge (Manifest V3)** que funcione como **wallet Ethereum no custodial**, con las mismas capacidades básicas que MetaMask: creación/importación de cartera, gestión de múltiples cuentas, firma y envío de transacciones, firma de datos tipados (EIP-712) y un **provider inyectado (`window.truekeate`)** que permita conectarse a una **dApp de pruebas** y operar contra una **red local de Foundry (Anvil)**, con posibilidad de añadir/cambiar redes.

| Aspecto | Definición |
|---|---|
| Nombre del producto | **TrueKeate Wallet** (marca TrueKeate; ver `identidad_visual.md`) |
| Provider inyectado | **`window.truekeate`** (EIP-1193) **y el alias `window.codecrypto = window.truekeate`** (el mismo objeto, por compatibilidad con E-03 y con la rúbrica) — decisiones P-13 y P-16 |
| Tipo de sistema | Extensión de navegador (MV3) + dApp de pruebas (HTML/JS) |
| Blockchain objetivo | Ethereum (EVM), red local de pruebas |
| Red por defecto | `http://127.0.0.1:8545`, chainId `31337` (`0x7a69`) — **Anvil, sin Sepolia** (P-02) |
| Moneda nativa mostrada | ETH |
| Custodia | No custodial — las claves se derivan en el Service Worker |
| Cifrado de la semilla | **No** (modo desarrollo, sin contraseña) — P-03 |
| Usuarios | Dos perfiles de usuario final (§4.3): el estudiante/autor que opera Anvil y el evaluador que carga `dist/` |
| Duración estimada | **Sin cifra única**: se retira el «~40 h» y se sustituye por la estimación por hitos del `plan_desarrollo.md` (Fase 3), con el recorte declarado en §4.5 — H-34 |
| Alcance del MVP | **40 RF Must** (incluye RF-50); los **10 RF Should** se planifican en un ciclo posterior (§4.5). El MVP **no depende del badge**: RF-38 y RF-39 quedan fuera del alcance comprometido (P-17) |
| Referencia de aceptación | **Rúbrica de 100 puntos** del enunciado (`TAREA_PARA_ESTUDIANTE.md:2408-2448`), transcrita y mapeada en §4.1 |

### 0.1 Antecedente: línea base existente (hallazgo de Fase 1)

El remoto `https://gitlab.codecrypto.academy/anlucorporations/chrome-wallet.git` **ya contiene una implementación previa completa** en las ramas `main` y `chrome-wallet-DSH` (mismo commit `632d890`, "Initial commit"):

| Artefacto en el remoto | Tamaño | Observación |
|---|---|---|
| `src/App.tsx` | 23 KB | Popup de gestión de la wallet. |
| `src/background.ts` | 27 KB | Service Worker con derivación, firma y RPC. |
| `src/inject.ts` | 5 KB | Provider EIP-1193 + EIP-6963. |
| `src/content-script.ts` | 3 KB | Relay página ↔ extensión. |
| `src/Connect.tsx` / `src/Notification.tsx` | 9 KB / 7 KB | Páginas de conexión y confirmación. |
| `src/manifest.ts` | 2 KB | Manifest generado desde TypeScript. |
| `test.html` | 36 KB | dApp de pruebas. |
| `package.json`, `vite.config.ts`, `tsconfig*.json` | — | Build Vite 7 + React 19 + ethers 6.15. |
| `README.md`, `CHANGELOG.md`, `EIP1559_IMPLEMENTACION.md`, `FIX_DESCONEXION_SITIOS.md`, `RESUMEN_*.md` | — | Documentación del intento anterior. |
| `exportchatia.txt` (8,2 MB) y `user_messages.txt` | — | Exportaciones de conversación; **no deben versionarse** (ver DEC-07). |

**Implicación y decisión (P-10):** aunque existe esta línea base, el usuario decidió **reconstruir el proyecto desde cero**. El código del remoto se conserva **únicamente como referencia** de consulta y **no se reutiliza**; la nueva implementación se desarrolla desde cero en las Fases 3 y 4 a partir de estos requerimientos.

---

## 1. Requerimientos funcionales (RF)

Convención de identificadores: `RF-XX`. La columna **Fuente** indica el número del enunciado original (`E-n`) o `NUEVO` si proviene de la petición explícita del usuario en la entrevista. **Total: 50 RF** (40 Must / 10 Should; el MVP son los 40 Must — §4.5).

**Regla de desambiguación de la columna Fuente (H-06):** el enunciado **repite números** (el 20 aparece como «Gestión de Redes» y como «Modal de Confirmación»). Por tanto todo número repetido se cita con sufijo: **`E-20a` = «Gestión de Redes: Add nuevas redes»** y **`E-20b` = «Modal de Confirmación»**. Los valores admitidos en la columna Fuente son `E-n`, `E-20a`/`E-20b`, `NUEVO`, `DERIVADO` y `OBJETIVO`; ningún otro valor es válido. Cada fila declara además su **criterio de aceptación abreviado** (≤ 120 caracteres, medible) y su **evidencia**; el criterio completo en Gherkin/EARS de cada RF está en el **Anexo A (§9)** con la etiqueta `CA-RF-xx`.

### 1.0 Trazabilidad del enunciado (H-05, H-06, H-30, H-38)

**Ítems del enunciado sin fila RF propia** — equivalencias declaradas; cierran el mapeo 37/37 viñetas:

| Ítem E-xx | Contenido | Destino declarado |
|---|---|---|
| E-05 | React 19 + TypeScript | **RT-01** (y RNF-13) |
| E-12 | Compatibilidad Chrome y Edge (Manifest V3) | **RNF-04 y RT-04** |
| E-26 | `chrome.storage.local` (mnemonic, cuentas, configuración) | **RF-09 / RF-10** + `diccionario_datos.md` §2 |

> Nota (H-05): `identidad_visual.md:237` atribuye E-12 a «RF-45»; RF-45 es EIP-1193 (fuente E-03) y la compatibilidad Chrome/Edge corresponde a RNF-04/RT-04. La corrección de ese anexo queda **fuera del alcance de este documento**.

**Trazabilidad de los requisitos `NUEVO` (H-30)** — 12 filas con origen, justificación y prioridad resultante:

| RF | Origen | Justificación | Prioridad resultante |
|---|---|---|---|
| RF-05 | D-03 · P-06 | El usuario pidió importar por clave privada y renombrar cuentas; el enunciado no lo cubre. | Must |
| RF-06 | D-03 (propuesto) | Cierra el ciclo de la cuenta importada; no aporta al MVP. | Should |
| RF-07 | **D-11 (nueva fila)** · P-05 | P-05 confirmó la vista de recepción con QR y copiar; D-04 solo registraba la ambigüedad de lectura de «enviar y recibir». | Must |
| RF-21 | P-05 | Firma de texto plano confirmada explícitamente por el usuario. | Must |
| RF-25 | **D-12 (nueva fila)** · RNF-11 | Deriva de la restricción de seguridad de `eth_accounts`; **no** proviene de `GUIA_RAPIDA_TESTING.md` (documento descartado por P-10, ver H-24). | Must |
| RF-26 | P-06 · DEC-06 | Revocación de permiso por origen. | Must |
| RF-34 | P-09 · RT-10 | UI en español; formato de ETH a 4 decimales y direcciones abreviadas. | Should |
| RF-37 | D-06 | El enunciado no define el comportamiento ante solicitudes simultáneas. | Must |
| RF-40 | D-06 | El enunciado no define timeout de aprobación. | Should |
| RF-48 | Identidad visual | Aportación de marca sin correspondencia en el enunciado (H-03). | Should |
| RF-49 | Identidad visual | Aplicación de la identidad visual en las tres ventanas y en la dApp (H-03). | Must |
| RF-50 | **D-13 (nueva fila)** · RNF-22 · H-25 | **Aportación de diseño por requisito de recuperación:** el enunciado no pide revelar ni exportar la semilla o las claves privadas, pero sin ello las cuentas importadas por clave privada son irrecuperables (RNF-22, H-25). | Must |

**Requisitos con fuente distinta de `E-n`/`NUEVO` (H-06, H-38):**

| RF | Fuente | Justificación |
|---|---|---|
| RF-17 | **DERIVADO (RNF-11)** | `eth_accounts` sin UI se deriva de la restricción de seguridad RNF-11; el enunciado no lo pide como viñeta propia. |
| RF-18 | E-06, E-11 + **DERIVADO** | `eth_blockNumber` no aparece en el enunciado (0 coincidencias en `TAREA_PARA_ESTUDIANTE.md`); se declara derivado del catálogo de lectura de E-06/E-11. |
| RF-43 | **OBJETIVO — `requisitos.md:30`** | «EIP-155: Replay Protection for Transactions» (objetivo de aprendizaje de «Estándares Web3 (EIPs)», sin numeración E-xx). |

> **RF-48, RF-49 y RF-50** quedan **dentro del rango oficial** `RF-01..RF-50`: RF-48 y RF-49 son aportaciones de identidad visual sin correspondencia en el enunciado (H-03) y RF-50 es una aportación de diseño por requisito de recuperación (H-25), declaradas en **D-01** y **D-13** y en la tabla anterior.

### 1.1 Core Wallet — **Total: 13 RF (11 Must / 2 Should)**

| ID | Requerimiento | Fuente | Prioridad | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|
| RF-01 | **Generar** una frase semilla BIP-39 de 12 palabras usando exclusivamente `ethers.js v6`. | E-01 | Must | Dado el popup sin cartera, Cuando pulso «Crear cartera», Entonces obtengo 12 palabras con checksum BIP-39 válido. | `Vitest: mnemonic.spec.ts` · `E2E: 01-onboarding.spec.ts` |
| RF-02 | **Importar** una wallet a partir de una frase de recuperación de 12 palabras, validando checksum BIP-39 y normalizando espacios/mayúsculas. | E-01 | Must | Al importar 12 palabras con espacios/mayúsculas irregulares, la cuenta 0 derivada coincide con la canónica. | `Vitest: mnemonic.spec.ts — normaliza y valida checksum` |
| RF-03 | **Carga sin contraseña**: al cargar/importar la frase, la wallet queda operativa de inmediato (modo desarrollo). | E-02 | Must | Al cargar o importar la frase, el popup muestra la cuenta 0 y su saldo sin pedir contraseña. | `E2E: 01-onboarding.spec.ts — sin prompt de contraseña` |
| RF-04 | **Derivar cuentas HD** BIP-32/BIP-44 con ruta `m/44'/60'/0'/0/i`: **5 cuentas por defecto** y botón **"Añadir cuenta"** para derivar la siguiente (P-04). | E-01 | Must | Al crear la cartera hay exactamente 5 cuentas (índices 0..4) y «Añadir cuenta» deriva la 6.ª. | `Vitest: derivation.spec.ts` · `E2E: 02-cuentas.spec.ts` |
| RF-05 | **Importar cuenta por clave privada** (0x + 64 hex). La cuenta se añade marcada como "importada" y con **etiqueta renombrable** (P-06); su clave privada solo puede **revelarse o eliminarse mientras la cuenta no esté en uso por una dApp** (**R-09a/DEC-45**). | **NUEVO** (usuario) | Must | Al importar `0x`+64 hex, la cuenta aparece marcada «importada» y su etiqueta renombrada persiste; con una sesión de dApp vigente sobre esa cuenta, revelar o eliminar se bloquea con `-32000` y el mensaje de la causa «Cuenta en uso por una dApp conectada» de `diccionario_datos.md` §4.3. | `Vitest: importPrivateKey.spec.ts` · `Vitest: accounts.spec.ts — guarda de sesión de dApp activa (bloqueo -32000)` · `E2E: 02-cuentas.spec.ts` |
| RF-06 | **Eliminar cuenta importada** (las derivadas del mnemonic no se eliminan, solo se ocultan). **Se bloquea** si la cuenta tiene una sesión de dApp vigente (**R-09a/DEC-45**). | **NUEVO** (propuesto) | Should | Eliminar una importada borra su clave de storage; las derivadas solo se ocultan y siguen derivándose; con sesión de dApp vigente el borrado se rechaza con `-32000` (R-09a/DEC-45) y `truekeate_imported_accounts` queda intacto hasta revocar el permiso. | `Vitest: accounts.spec.ts — borrado de importada` · `Vitest: accounts.spec.ts — bloqueo con sesión activa (-32000)` · `E2E: 25-recuperacion.spec.ts — bloqueo y desbloqueo tras revocar` |
| RF-07 | **Recibir transferencias**: dirección completa + copiar al portapapeles + **QR**, y saldo actualizado. **Confirmado en P-05.** | **NUEVO** (usuario) | Must | En «Recibir», la dirección mostrada, el portapapeles y el QR decodificado son la misma cadena `0x…`. | `E2E: 03-recibir.spec.ts — copiar y QR` |
| RF-08 | **Enviar transferencias** desde cualquiera de las cuentas de la wallet (interna o a direcciones externas) con estimación de gas y confirmación del usuario. | E-24 | Must | Al enviar 1 ETH entre cuentas de Anvil, la llamada devuelve hash `0x`+64 hex y el recibo es `status 1`. | `E2E: 04-enviar.spec.ts` · `Vitest: tx.spec.ts` |
| RF-09 | **Auto-carga**: al abrir el popup, si existe wallet en storage se restaura sin pedir la frase. | E-27 | Must | Al reabrir el popup con cartera en storage, se muestra la cuenta activa sin solicitar la frase. | `E2E: 05-persistencia.spec.ts` |
| RF-10 | **Restaurar estado**: al reabrir, se restaura cuenta activa, red, cuentas importadas y sesiones de dApp. | E-28 | Must | Tras reabrir el popup se restauran cuenta activa, red, importadas y sesiones con los mismos valores. | `E2E: 05-persistencia.spec.ts` · `Vitest: state.spec.ts` |
| RF-11 | **Reset wallet**: botón que limpia la cartera (mnemonic, cuentas, sesiones) y vuelve al formulario inicial. **Se bloquea** con la cola `truekeate_pending_requests` no vacía o una transacción en vuelo en `truekeate_inflight_tx` (**R-09b/DEC-46**). | E-21 | Must | Con la cola vacía y sin transacción en vuelo, al confirmar «Reset wallet» el storage queda sin mnemonic/cuentas/sesiones y el popup vuelve al inicio; con `<n>` solicitudes pendientes o transacción en vuelo el reset se rechaza con `-32000`, la UI indica cuántas quedan y ninguna clave se borra. | `E2E: 06-reset.spec.ts — reset con la cola vacía y reset bloqueado` · `Vitest: reset.spec.ts — orden de comprobación y bloqueo (-32000)` |
| RF-12 | **Hint interactivo**: la frase semilla de prueba de Anvil es clickeable y rellena el formulario. | E-22 | Should | Al pulsar el hint, el campo queda relleno con las 12 palabras de Anvil y «Importar» pasa a habilitado. | `E2E: 01-onboarding.spec.ts — hint Anvil` |
| RF-50 | **Revelar y exportar** la **frase semilla (BIP-39)** y las **claves privadas** de las cuentas **bajo confirmación explícita del usuario**: advertencia de riesgo, valores ocultos por defecto, revelado temporal de **30 s** con **ocultado también por pérdida de foco**, **política de portapapeles** (copiar permitido; **borrado del portapapeles al ocultar** si aún contiene la semilla) y prohibición de exponerlos por `window.postMessage` (**aportación de diseño D-13**, H-25; **P-20**). **Se bloquea** si la cuenta —o alguna derivada del mnemonic revelado— tiene una sesión de dApp vigente (**R-09a/DEC-45**). | **NUEVO** (diseño, D-13) | Must | Con confirmación explícita, el valor oculto por defecto se revela **30 s** y se oculta al expirar el plazo **o al perder el foco**; copiar está permitido y al ocultarse **se borra el portapapeles** si aún contiene la semilla; el valor nunca viaja por `window.postMessage`; con sesión de dApp vigente sobre la cuenta el revelado/exportación se rechaza con `-32000` sin entregar el valor. | `Vitest: secretsExport.spec.ts — confirmación, 30 s, pérdida de foco, borrado del portapapeles y no postMessage` · `Vitest: secretsExport.spec.ts — bloqueo con sesión de dApp activa (-32000)` · `E2E: 25-recuperacion.spec.ts — revelado temporal, clipboard borrado` |

### 1.2 Provider inyectado y operaciones blockchain — **Total: 14 RF (14 Must / 0 Should)**

| ID | Requerimiento | Fuente | Prioridad | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|
| RF-13 | Inyectar el provider EIP-1193 en `window.truekeate` **y en su alias `window.codecrypto` (el mismo objeto)** en **todas las páginas y frames** (`all_frames: true`, `document_start`). | E-03, E-09, E-33 | Must | En una página cualquiera, `window.truekeate === window.codecrypto` y ambos exponen `request`, `on` y `removeListener`. | `Vitest: inject.spec.ts — alias window.codecrypto` · `E2E: 07-provider.spec.ts` |
| RF-14 | Implementar `request({ method, params })` con manejo de errores estilo EIP-1193 (`code`, `message`). El catálogo **no incluye `eth_sign`**: responde `4200 Unsupported method` (H-11a). | E-03 | Must | Un método desconocido resuelve con error `code: 4200` y mensaje en español; ningún método lanza de forma síncrona. | `Vitest: errors.spec.ts` (códigos de §2.1; literales de tabla §4.3 de `diccionario_datos.md`) |
| RF-15 | Implementar `on()`, `removeListener()` y `emit` para `accountsChanged`, `chainChanged`, `connect`, `disconnect`, `message`. | E-03, E-10 | Must | `on('accountsChanged', cb)` invoca el callback al cambiar de cuenta desde el popup y `removeListener` deja de invocarlo. | `E2E: 08-eventos.spec.ts` |
| RF-16 | `eth_requestAccounts`: abre la **página de conexión** para que el usuario elija qué cuenta compartir con esa dApp. | E-36 | Must | Al elegir la cuenta 2 en `connect.html`, `eth_requestAccounts` resuelve `['<cuenta2>']`; al rechazar, `code 4001`. | `E2E: 09-conectar.spec.ts` |
| RF-17 | `eth_accounts`: devuelve la cuenta autorizada **sin volver a pedir permiso** si el origen ya está conectado; `[]` si no. | **DERIVADO (RNF-11)** | Must | Origen no conectado → `eth_accounts` resuelve `[]` sin abrir ventana; origen conectado → `['<cuenta>']`. | `Vitest: accounts.spec.ts — RNF-11` · `E2E: 09-conectar.spec.ts` |
| RF-18 | `eth_chainId`, `eth_getBalance`, `eth_blockNumber` como métodos de lectura soportados. | E-06, E-11 + **DERIVADO** | Must | Con Anvil: `eth_chainId`→`0x7a69`, `eth_getBalance(cuenta0)` = saldo de Anvil y `eth_blockNumber` ≥ 1. | `E2E: 07-provider.spec.ts` · `Comando: cast balance` |
| RF-19 | `eth_sendTransaction`: solicitar aprobación al usuario y luego **firmar y enviar** la transacción. La vista previa **decodifica el calldata** (selector, función y parámetros legibles) y etiqueta el destino (H-11b). | E-07 | Must | Al aprobar, la dApp recibe el hash y la vista previa mostró selector, nombre de función y parámetros decodificados. | `E2E: 10-aprobar-tx.spec.ts` · `Vitest: calldata.spec.ts` |
| RF-20 | `eth_signTypedData_v4`: firmar datos estructurados EIP-712 mostrando `domain`, `types` y `message` en la confirmación, con `name` y `verifyingContract` y aviso si `domainChainMismatch` (H-11b, H-40). | E-08 | Must | La confirmación EIP-712 muestra `name`/`verifyingContract`; si `domain.chainId ≠` red activa, muestra aviso destacado. | `E2E: 11-firmar-eip712.spec.ts` · `Vitest: typedData.spec.ts` |
| RF-21 | `personal_sign`: firma de mensajes de texto plano (con prefijo `\x19Ethereum Signed Message`). **Confirmado en P-05.** | **NUEVO** (usuario) | Must | `personal_sign` muestra el texto UTF-8 y avisa si el payload es hex ilegible; `eth_sign` responde `code 4200`. | `Vitest: personalSign.spec.ts` · `E2E: 11-firmar-mensaje.spec.ts` |
| RF-22 | `wallet_switchEthereumChain`: si la red destino **ya es la activa**, responde sin cambios y sin abrir ninguna ventana; si **no lo es**, exige **aprobación del usuario** creando una solicitud en `truekeate_pending_requests` que se resuelve en `notification.html` (P-19) y, al aprobarse, cambia de red y notifica `chainChanged` a todas las pestañas. | E-19 | Must | Con la red destino ya activa responde sin abrir ventana; hacia otra red crea 1 entrada `pending` y solo tras aprobarla `eth_chainId` devuelve su id y todas las pestañas reciben `chainChanged`. | `E2E: 12-redes.spec.ts — aprobación del cambio de red` · `Vitest: networks.spec.ts — red ya activa` |
| RF-23 | `wallet_addEthereumChain`: dar de alta redes nuevas (nombre, chainId, RPC, símbolo, explorer) desde la dApp o desde la UI. El alta **solo añade la red y nunca la activa** (P-22); usar la red nueva exige su propio `wallet_switchEthereumChain` con aprobación (RF-22/`CA-RF-22`/P-19). | E-20a | Must | `wallet_addEthereumChain` exige aprobación; al aprobar, la red aparece en la lista con el `chainId` declarado **sin pasar a ser la activa**; solo un `wallet_switchEthereumChain` posterior y aprobado cambia `eth_chainId` a esa red. | `E2E: 12-redes.spec.ts — alta sin activación y cambio posterior` · `Vitest: networks.spec.ts — add no cambia la red activa` |
| RF-24 | **Propagación de eventos**: `accountsChanged` y `chainChanged` se envían a **todas las pestañas** cuando cambian desde el popup o desde la dApp. | E-10, E-34, E-35 | Must | Cambiar de cuenta en el popup emite `accountsChanged` con la nueva cuenta en todas las pestañas conectadas. | `E2E: 08-eventos.spec.ts — 2 pestañas` |
| RF-25 | **Persistencia de conexión por origen con caducidad**: cada dApp recuerda la cuenta autorizada entre recargas y reinicios del Service Worker, y la sesión vence por inactividad con `expiresAt = lastUsedAt + 86400000` (24 h **renovables en cada uso**, D-B). | **NUEVO** (diseño, D-12) | Must | Tras recargar `test.html` y reiniciar el Service Worker, `eth_accounts` devuelve la cuenta autorizada sin nuevo prompt; con `lastUsedAt` a más de 24 h, la sesión está vencida (`eth_accounts` → `[]`) y cualquier uso renueva `expiresAt`. | `E2E: 05-persistencia.spec.ts — sesión por origen y TTL 24 h` · `Vitest: sessions.spec.ts — renovación de expiresAt` |
| RF-26 | **Revocar permiso** de un origen (desconectar dApp) desde el popup. **Confirmado en P-06.** | **NUEVO** (usuario) | Must | Al revocar un origen desde el popup, ese origen recibe `accountsChanged []` y `eth_accounts` posterior devuelve `[]`. | `E2E: 13-revocar.spec.ts` |

### 1.3 UX, logging y observabilidad — **Total: 8 RF (6 Must / 2 Should)**

| ID | Requerimiento | Fuente | Prioridad | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|
| RF-27 | **Polling de saldos** cada 5 s de la cuenta activa (y de la lista de cuentas en la página de conexión). El ciclo arranca al abrir la vista, se detiene al cerrarla o al cambiar de cuenta y se suspende si el RPC no responde (RNF-07). | E-11 | Must | Con el popup abierto se ejecuta 1 `eth_getBalance` por cuenta visible cada 5 s; al cerrarlo, el polling se detiene. | `Vitest: polling.spec.ts — contador RPC` · `E2E: 14-polling.spec.ts` |
| RF-28 | **Log de llamadas**: registrar cada llamada al provider (método, params, origen, timestamp). | E-13 | Must | Con el popup cerrado, un `eth_blockNumber` desde la dApp deja ≥ 1 entrada de log con método, origen y timestamp. | `E2E: 15-logs.spec.ts` · `Vitest: logger.spec.ts` |
| RF-29 | **Log de eventos**: registrar cada evento emitido (`accountsChanged`, `chainChanged`, …). | E-14 | Must | Emitir un evento desde la extensión genera una entrada con `category: event`, el campo `event` con el nombre del evento y el origen (D-D). | `Vitest: logger.spec.ts — eventos` |
| RF-30 | **Log de errores** resaltados en rojo con código y mensaje. | E-15 | Must | El log de un error EIP-1193 se pinta en rojo y muestra el `code` numérico y el `message` en español. | `E2E: 15-logs.spec.ts — rojo` |
| RF-31 | **Log de operaciones**: transacciones y firmas en tiempo real, con hash/firma resultante. | E-16 | Must | Cada transacción o firma aprobada produce una entrada con estado final y el hash o la firma en `0x`+hex. | `E2E: 15-logs.spec.ts — operaciones` |
| RF-32 | **Historial de logs persistente** que sobrevive a `resetWallet` (fuente de verdad: `chrome.storage.local` gestionado por el Service Worker, con `settings.logLimit = 500`; H-09). | E-23 | Should | Tras `resetWallet`, el panel conserva al menos las 5 últimas entradas previas y el máximo almacenado es 500. | `Vitest: logger.spec.ts — reset` |
| RF-33 | **Validación de formularios** con feedback inline (frase inválida, dirección inválida, saldo insuficiente, clave privada inválida). | E-25 | Must | Frase, dirección, saldo o clave privada inválidos muestran mensaje inline y la operación no se envía. | `Vitest: validation.spec.ts` · `E2E: 16-validacion.spec.ts` |
| RF-34 | UI en **español**, con formato de ETH a 4 decimales y direcciones abreviadas `0x1234…abcd`. | **NUEVO** (propuesto) | Should | Todo texto visible está en español; ETH se muestra con 4 decimales y las direcciones como `0x1234…abcd`. | `Vitest: src/popup/i18n.spec.ts` (texto visible sin palabras inglesas; **v2.0**, regla corregida en H2) · `E2E: 17-i18n.spec.ts — formato 1,0000 ETH y dirección 0x1234…abcd` |

### 1.4 Páginas independientes y ciclo de aprobación — **Total: 7 RF (4 Must / 3 Should)**

| ID | Requerimiento | Fuente | Prioridad | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|
| RF-35 | `notification.html`: ventana independiente de **aprobación/rechazo** de transacciones y firmas (solo decide, no firma). Muestra el **origen y favicon de la dApp** siempre visibles, se abre con foco y en primer plano, usa `alwaysOnTop` cuando la plataforma lo permite y es **una sola ventana global** (P-21): las demás solicitudes **esperan en la cola** y la ventana muestra el **contador de pendientes** (H-35). | E-20b, E-29 | Must | Existe **como máximo una** ventana `notification.html` enfocada; con 2 solicitudes simultáneas se abre una sola ventana y la segunda permanece en la cola con el contador en `2`; la ventana nunca muestra dos solicitudes a la vez. | `E2E: 10-aprobar-tx.spec.ts — foco, origen y ventana única global` · `E2E: 18-concurrencia.spec.ts — 2 pendientes y contador` |
| RF-36 | `connect.html`: ventana independiente de **conexión** con lista de cuentas y saldos, selección de cuenta a compartir. | E-30 | Must | `connect.html` lista las cuentas con su saldo; al elegir una, se comparte exactamente esa dirección y ninguna otra. | `E2E: 09-conectar.spec.ts` |
| RF-37 | **Cola de solicitudes pendientes** persistida como `Record<approvalId, PendingRequest>` en `chrome.storage.local`, con `approvalId`/`requestId` únicos, **puerto de larga vida** (`chrome.runtime.connect`) entre content script y Service Worker, y reconciliación al arrancar el SW (H-02, H-08). | E-29 | Must | Con 2 solicitudes simultáneas, ambas coexisten en la cola persistida `Record<approvalId, PendingRequest>` sin sobrescribirse. | `Vitest: approvalQueue.spec.ts` · `E2E: 18-concurrencia.spec.ts` |
| RF-38 | **Badge contador** en el ícono de la extensión con el número de solicitudes pendientes. | E-31 | Should | Con 2 solicitudes pendientes el badge muestra exactamente `2`; con 0 no muestra badge. | `E2E: 19-badge.spec.ts` |
| RF-39 | **Notificaciones de Chrome** al llegar una nueva solicitud de firma/conexión. | E-32 | Should | Cada nueva solicitud genera 1 notificación de Chrome con el origen; al resolverse deja de estar pendiente. | `E2E: 20-notificaciones.spec.ts` |
| RF-40 | **Timeout** de solicitudes: 120 s para firmas y 60 s para conexión, con **dueño único del plazo = Service Worker** mediante `chrome.alarms` (H-02, H-07); al expirar, el SW cierra la ventana, marca `expired`, purga el badge y la página recibe un error EIP-1193 con `code: 4001`. | **NUEVO** (propuesto) | Should | A los 120 s de una firma pendiente, el SW cierra la ventana y la página recibe `code 4001` (conexión: 60 s). | `Vitest: approvalTimeout.spec.ts` (fake timers + `chrome.alarms`) |
| RF-41 | Cerrar automáticamente la ventana de confirmación tras aprobar/rechazar, limpiar el estado pendiente y **reconciliar la cola al arrancar el Service Worker** reasociando por `approvalId` (H-02). | E-29 | Must | Tras aprobar o rechazar, la ventana se cierra y la entrada resuelta desaparece de la cola persistida. | `E2E: 10-aprobar-tx.spec.ts` · `Vitest: approvalReconcile.spec.ts` |

### 1.5 Estándares EIP — **Total: 4 RF (3 Must / 1 Should)**

| ID | Requerimiento | Fuente | Prioridad | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|
| RF-42 | **EIP-1559**: construir transacciones tipo 2 con `maxFeePerGas`/`maxPriorityFeePerGas` obtenidos de `getFeeData()`. | E-17 | Must | Toda transacción se difunde tipo 2 con `maxFeePerGas` y `maxPriorityFeePerGas` > 0 de `getFeeData()`. | `Vitest: eip1559.spec.ts` · `E2E: 04-enviar.spec.ts — recibo type 2` |
| RF-43 | **EIP-155**: incluir `chainId` en la firma (protección de replay) y verificar el `chainId` de la red activa. | **OBJETIVO — `requisitos.md:30` (EIP-155)** | Must | La firma incluye el `chainId` activo (`v` = `chainId*2+35`/`36`) y una tx con chainId ajeno se rechaza. | `Vitest: eip155.spec.ts` |
| RF-44 | **EIP-6963**: anunciar el provider (`uuid`, `name`, `icon`, `rdns`) y responder a `eip6963:requestProvider`. | E-18 | Should | Tras `DOMContentLoaded`, `eip6963:requestProvider` recibe `announceProvider` con `uuid`, `name`, `icon` y `rdns`. | `E2E: 21-eip6963.spec.ts` |
| RF-45 | **EIP-1193**: cumplir la interfaz `request/on/removeListener` y el catálogo de errores estándar. | E-03 | Must | El provider expone `request`/`on`/`removeListener` y mapea 4001/4100/4200/4900/4901 a errores EIP-1193. | `Vitest: eip1193.spec.ts` (códigos de §2.1; literales de tabla §4.3 de `diccionario_datos.md`) |

### 1.6 dApp de pruebas — **Total: 4 RF (2 Must / 2 Should)**

| ID | Requerimiento | Fuente | Prioridad | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|
| RF-46 | `test.html`: dApp standalone que permita detectar, conectar, consultar saldo, enviar transacción, firmar EIP-712, cambiar de red y escuchar eventos. | E-07..E-11 | Must | `test.html` ejecuta detectar, conectar, saldo, enviar, EIP-712, cambiar red y eventos, con resultado en pantalla. | `E2E: 22-dapp.spec.ts` |
| RF-47 | La dApp muestra un historial de operaciones y el detalle de la última respuesta. | E-16 | Should | Tras cada operación, la dApp añade una fila al historial y muestra el JSON de la última respuesta sin recortar. | `E2E: 22-dapp.spec.ts — historial` |
| RF-48 | **Pantalla de bienvenida / "Acerca de"** con el logotipo horizontal de TrueKeate y la tagline `PRODUCTOS \| SERVICIOS \| CRIPTOACTIVOS TOKENIZADOS`. | **NUEVO** (identidad visual) | Should | «Acerca de» muestra el logotipo horizontal y la tagline `PRODUCTOS \| SERVICIOS \| CRIPTOACTIVOS TOKENIZADOS`. | `E2E: 23-marca.spec.ts` |
| RF-49 | **Aplicación de la identidad visual**: encabezados con el degradado de marca, isologo, tipografías y estados de color definidos en `identidad_visual.md` en las tres ventanas (popup, connect, notification) y en la dApp. | **NUEVO** (identidad visual) | Must | Popup, connect, notification y dApp usan el degradado de marca y 0 colores literales fuera de `tokens.css`. | `Comando: grep -rnE "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(|linear-gradient|radial-gradient|font-family:" src --exclude=tokens.css` → 0 coincidencias · `E2E: 23-marca.spec.ts — degradado de marca en popup, connect, notification y dApp` |

> **Totales por tabla (H-03):** 1.1 = 13 RF (11 Must / 2 Should) · 1.2 = 14 RF (14 Must / 0 Should) · 1.3 = 8 RF (6 Must / 2 Should) · 1.4 = 7 RF (4 Must / 3 Should) · 1.5 = 4 RF (3 Must / 1 Should) · 1.6 = 4 RF (2 Must / 2 Should). **Suma: 50 RF = 40 Must + 10 Should.**

---

## 2. Requerimientos no funcionales (RNF) — ISO/IEC 25010

**Total: 25 RNF** (RNF-01..RNF-25). Las categorías **Accesibilidad**, **Capacidad de recuperación**, **Cumplimiento** y **Mantenimiento/ciclo de vida** se añaden en la v1.4 (H-17, H-25, H-26, H-29) y **Fiabilidad** incorpora el contrato observable de transacción (H-22). Las magnitudes sin universo ni procedimiento se cierran en las subsecciones §2.1 a §2.6.

| ID | Categoría | Requerimiento (verificable) | Criterio de verificación |
|---|---|---|---|
| RNF-01 | Adecuación funcional | El 100 % de los RF, **Must y Should**, está implementado y cubierto por un criterio de aceptación `CA-RF-xx` (§9) y por al menos un caso de uso. | Matriz de trazabilidad **`E-xx → RF-xx → CA/CU → test`** (§9 y `casos_uso/`); aserción: 0 RF sin `CA-RF-xx` y 0 fila sin evidencia |
| RNF-02 | Eficiencia de desempeño | Con «frío» = **Service Worker detenido + sin popup abierto**, el popup renderiza en **< 800 ms** y `eth_getBalance` responde en **< 1,5 s** contra la red local. | Procedimiento §2.3: marcas `performance.mark('popup-mount')` y `performance.mark('balance-rendered')`, **percentil 95 sobre ≥ 10 ejecuciones**, precondición «Anvil en marcha y cuenta 0 con saldo», resultado guardado en JSON comparable |
| RNF-03 | Eficiencia de desempeño | El polling de saldos (cada 5 s) no supera **1 llamada RPC por cuenta visible por ciclo**. | **Aserción sobre un contador de llamadas RPC instrumentado** (`Vitest: polling.spec.ts`), no inspección visual |
| RNF-04 | Compatibilidad | Debe cargar y funcionar en Chrome ≥ 114 y Edge ≥ 114 sin `manifest_version: 2`. | Carga en `chrome://extensions` y `edge://extensions` |
| RNF-05 | Usabilidad | Toda solicitud de firma/conexión es aprobable o rechazable en ≤ 2 clics y la ventana muestra **origen solicitante**, destino, valor, red y comisión estimada; en llamadas a contrato, el **calldata decodificado** (selector, función, parámetros) y los avisos de riesgo de H-11b. La confirmación se atiende en **una sola ventana global** (`notification.html`) con la **cola de pendientes** y su **contador** (RF-35, P-21): nunca se muestran dos solicitudes a la vez. | `E2E: 10-aprobar-tx.spec.ts` con conteo de clics y aserción sobre nodos del DOM + `E2E: 18-concurrencia.spec.ts` (una sola ventana y contador de pendientes) |
| RNF-06 | Usabilidad | Los mensajes de error se muestran en español e indican **causa y acción sugerida**, conforme a la **tabla cerrada por código EIP-1193 (§2.1)**. | `Vitest: errors.spec.ts` contrasta cada código con §2.1: causa y acción presentes |
| RNF-07 | Fiabilidad | Si el RPC no responde, la UI muestra «desconectado» y reintenta con **política numérica cerrada**: máximo **3 reintentos con backoff ×2 (1 s / 2 s / 4 s)**, **timeout de 5 s por intento**, UI interactiva y `chrome.storage.local` intacto. | `Vitest: rpcRetry.spec.ts — provider falso y fake timers (3 fallos + 1 éxito)` · `E2E: 27-rpc-caido.spec.ts — Anvil detenido` |
| RNF-08 | Fiabilidad | El Service Worker puede reiniciarse en cualquier momento: la cola `Record<approvalId, PendingRequest>` se reconstruye desde `chrome.storage.local` y la reconciliación al arrancar tarda **< 1 s** sin dejar solicitudes huérfanas (H-02). | `Vitest: approvalReconcile.spec.ts` · `E2E: 18-concurrencia.spec.ts — stop service worker y reconciliación < 1 s medida con performance.now()` |
| RNF-09 | Seguridad | El mnemonic y las claves privadas **nunca viajan por `window.postMessage` ni hacia la página web** (la página solo recibe firmas, hashes y las direcciones autorizadas). **Sí** pueden mostrarse en las superficies de la propia extensión mediante el flujo de revelado de RF-50 (popup y ventanas de la extensión), que aplica la **higiene del revelado**: confirmación explícita, ocultado por plazo de **30 s** o pérdida de foco, borrado del portapapeles al ocultar y descarte del valor de la memoria de la UI. Tampoco se registran en logs los **payloads firmados completos** (mensaje de `personal_sign`, JSON de `eth_signTypedData_v4`, calldata) (H-42, P-20). | Inspección de mensajes en content-script (0 mensajes con mnemonic o clave hacia la página) + `Vitest: logRedaction.spec.ts` (0 coincidencias de mnemonic, clave o payload íntegro en los logs) + **verificación de la higiene del revelado**: `Vitest: secretsExport.spec.ts` y `E2E: 25-recuperacion.spec.ts` (ocultado a los 30 s y por pérdida de foco, portapapeles sin la semilla tras ocultarse y valor descartado de la UI) |
| RNF-10 | Seguridad | `inject.js` se expone a **todas** las páginas (`<all_urls>` con `all_frames: true`), **no solo a páginas autorizadas**: la exposición se acota con `use_dynamic_url: true` y `exclude_matches` para los orígenes de extensiones; el control real está en el receptor, que **valida `sender`/`origin`** en cada mensaje, mantiene una **allowlist cerrada de métodos internos** (el resto responde `4200`) y publica con **`targetOrigin` cerrado** (nunca `*`). | `Vitest: manifest.spec.ts` (el manifest declara `use_dynamic_url` y `exclude_matches`; una página arbitraria no obtiene `inject.js`) + `Vitest: messaging.spec.ts` (allowlist de métodos internos y rechazo de `sender`/`origin` no válidos) + intento de inyección desde iframe hostil |
| RNF-11 | Seguridad | Una dApp no autorizada recibe `[]` en `eth_accounts` y debe pasar por `eth_requestAccounts`. | `Vitest: accounts.spec.ts — RNF-11 (sin sesión → `[]`)` · `E2E: 09-conectar.spec.ts — test negativo de origen no conectado` |
| RNF-12 | Seguridad | Toda transacción/firma requiere aprobación explícita del usuario; ningún método sensible firma en silencio. | `Inspección: handleRPCRequest (0 métodos sensibles sin entrada pending)` · `E2E: 10-aprobar-tx.spec.ts` |
| RNF-13 | Mantenibilidad | Código 100 % TypeScript con `strict: true`; el build falla ante errores de tipos. | `Comando: npx tsc -b` (strict, 0 errores y 0 `any` implícitos) |
| RNF-14 | Mantenibilidad | Separación estricta: React = UI sin criptografía; el Service Worker = criptografía y RPC. | `Comando: grep -rn "from 'ethers'" src/popup src/components` → 0 coincidencias |
| RNF-15 | Portabilidad | **«Build limpio» = `npm ci && npm run build` con exit 0, cero errores de tipos (`tsc -b`) y solo los warnings permitidos en §2.6**, en Windows y en **Linux (WSL2 o CI `ubuntu-latest`)** (H-20, D-C). | `Comando: npm ci && npm run build` en Windows y en WSL2/CI; salida adjunta como evidencia |
| RNF-16 | Observabilidad | **Catálogo cerrado de eventos instrumentados (§2.2)**: exactamente una entrada de log por evento, con timestamp, nivel y origen; el log vive en `chrome.storage.local` (gestionado por el SW) y se exporta en JSON; **ninguna entrada contiene claves, mnemonic ni payloads firmados completos** (H-09, H-12, H-42). | `Vitest: logger.spec.ts — 1 entrada por evento del catálogo` · `Inspección: chrome.storage.local.get('truekeate_logs') tras la suite E2E (0 entradas con clave o payload íntegro)` · `Inspección: exportación del histórico en JSON` |
| RNF-17 | Testabilidad | Cobertura de **ramas** con `@vitest/coverage-v8`: **70 % global** y **≥ 80 %** en `src/background/crypto/`, `src/background/approvals/` y `src/shared/validation/`; con exclusiones declaradas (H-19). | `Comando: npm run test -- --coverage`; el hito no se cierra por debajo del umbral |
| RNF-18 | Usabilidad / Mantenibilidad | **Consistencia visual:** todo el CSS y TSX bajo `src/` **salvo `src/styles/tokens.css`** consume tokens de `identidad_visual.md`; 0 literales de color (`#…`, `rgb(`, `hsl(`), 0 familias tipográficas literales y 0 degradados fuera de tokens (H-12). | `Comando: grep -rnE "#[0-9a-fA-F]{3,8}\|rgb\(\|hsl\(\|font-family:" src` → 0 coincidencias fuera de `tokens.css` |
| RNF-19 | Compatibilidad | Contraste del texto principal ≥ 4.5:1 sobre la **matriz cerrada de pares texto/fondo de §2.4**; el teal de marca (`#3E93A6`) no se usa para texto menor de 18 px sobre blanco; el oro (`#C9A97F`) es solo decorativo. | `Vitest: contrast.spec.ts — recalcula desde tokens.css los pares de §2.4 (0 por debajo del umbral)` · `E2E: 24-accesibilidad.spec.ts — axe-core 0 violaciones A/AA` |
| RNF-20 | Portabilidad | Los activos de marca y las fuentes se sirven **desde el propio paquete** de la extensión (`public/brand/`, `public/fonts/`), sin peticiones a CDN en runtime. | Inspección del bundle y de las peticiones de red del popup |
| RNF-21 | **Accesibilidad** (H-17) | Todas las acciones críticas (cargar wallet, importar clave, seleccionar cuenta, aprobar, rechazar, reset) son ejecutables **solo con teclado**; foco visible con contraste ≥ 3:1; roles/etiquetas ARIA en la lista de cuentas, las pestañas de red y el panel de logs; sin pérdida de contenido al 200 % de zoom; `prefers-reduced-motion` desactiva spinner y transiciones. | `E2E: 24-accesibilidad.spec.ts` (recorrido por teclado) + `axe-core` en los E2E (0 violaciones críticas) + test de contraste de §2.4 |
| RNF-22 | **Capacidad de recuperación** (H-25) | Exportación/revelado del mnemonic y de las claves privadas tras confirmación explícita; `resetWallet` exige confirmación destructiva que enumera las cuentas importadas que se perderán; al arrancar se valida el checksum BIP-39 y el formato EIP-55 y, ante corrupción, se muestra «wallet dañada» en lugar de derivar direcciones distintas en silencio. | `E2E: 25-recuperacion.spec.ts` (texto exacto del diálogo destructivo) + `Vitest: integrity.spec.ts` (mnemonic y dirección corruptos) |
| RNF-23 | **Cumplimiento y avisos al usuario** (H-26, H-37) | Aviso no descartable «entorno de desarrollo — no usar con fondos reales» en el primer arranque, en «Acerca de» y antes de la primera firma, con la aceptación registrada en `truekeate_settings`; advertencia al dar de alta una red no marcada `isTestnet`; `LICENSE`, `NOTICE` y `LICENSE-poppins.txt`/`LICENSE-inter.txt`/`LICENSE-jetbrains-mono.txt` (OFL-1.1) presentes en el repositorio; activos de marca TrueKeate cedidos por el titular del proyecto. | `E2E: 26-avisos.spec.ts` (aserción sobre el DOM) + `Inspección: git ls-files (LICENSE, NOTICE y los 3 LICENSE-*.txt)` + tabla de excepciones §2.5 |
| RNF-24 | **Mantenimiento / ciclo de vida** (H-29) | Política de versiones de dependencias (ethers, React, Vite) con `package-lock.json` versionado y build reproducible; rango de versión de Foundry soportado declarado y verificado antes de la suite E2E; revisión de compatibilidad MV3 en cada actualización mayor de Chrome/Edge. | `Inspección: §2.6` · `Comando: npm ci && npm run build` en Windows y WSL2 (mismo `dist/`) |
| RNF-25 | Fiabilidad | **Contrato observable de una transacción (H-22):** `eth_sendTransaction` devuelve el **hash** al difundir; la UI y el log reflejan los estados `pending → confirmada`/`fallida`; un `estimateGas` fallido bloquea el envío con error tipado y mensaje accionable; un revert se muestra con su motivo; el catálogo incluye `eth_getTransactionReceipt`. | `Vitest: txContract.spec.ts` (hash, transiciones, revert y estimación fallida) + `E2E: 04-enviar.spec.ts` con recibo `status 1` |

### 2.1 Tabla cerrada de códigos de error EIP-1193 y su significado (H-12 · RNF-06 · ACU-05/D-E)

> **Reparto de fuentes (ACU-05 / D-E, ADT-03).** Esta tabla es la **tabla de códigos y su significado**: fija qué códigos existen, qué significa cada uno y cuándo se emite. **No** fija los literales de los mensajes: la **fuente única de los `message` en español es `diccionario_datos.md` §4.3**, que admite **varios mensajes por código** (uno por causa) e incluye la causa y la acción sugerida. Toda cita de un mensaje en este corpus (**casos de uso, documento técnico, identidad visual**) apunta a `diccionario_datos.md` §4.3, nunca a esta tabla.

| Código | Significado | Cuándo se emite |
|---|---|---|
| `4001` | Cancelación por el usuario o vencimiento del plazo | El usuario rechaza explícitamente, la solicitud vence (120 s firma / 60 s conexión, RF-40), se cierra la ventana sin decidir, se excede la cardinalidad o la tasa aprobable, se agota el *token bucket* o se deniega el permiso de host del alta de red (`diccionario_datos.md` §4.3) |
| `4100` | Origen no autorizado | Método sensible sin sesión autorizada (RNF-11), o método interno invocado desde un contexto no permitido (`diccionario_datos.md` §4.2) |
| `4200` | Método no soportado, o método interno fuera de contexto | Método fuera del catálogo RPC —incluye `eth_sign`— (H-11a); método interno llamado desde un contexto no permitido (RT-06) |
| `4900` | Cartera desconectada del RPC | RPC local caído o inalcanzable (RNF-07) |
| `4901` | Red no reconocida | `wallet_switchEthereumChain` a un `chainId` que no está dado de alta |
| `-32000` | Conflicto de estado | El nodo rechaza la operación —saldo insuficiente, nonce inválido o `estimateGas` fallido / revert previo a firmar (`diccionario_datos.md` §3.6)— **o** el estado de la propia cartera impide una operación por lo demás legítima: **cuenta en uso por una dApp** (bloquea el revelado/exportación y el borrado, R-09a/DEC-45) y **reset con la cola no vacía o una transacción en vuelo** (bloquea el reset, R-09b/DEC-46) |
| `-32602` | Parámetros o material de entrada inválidos | Mnemonic o clave privada inválidos, dirección malformada (EIP-55), cuenta ya existente, o payload por encima de **64 KiB** (RF-33; `diccionario_datos.md` §3.9) |
| `-32603` | Error interno de la cartera | Fallo no clasificado del Service Worker, identificador duplicado en la cola, cuota de `chrome.storage.local` agotada, o difusión interrumpida por suspensión del SW (`diccionario_datos.md` §2.15 y §2.12) |

> Regla (RNF-06): **toda** respuesta de error hacia la página es un objeto EIP-1193 con `code` numérico y `message` en español; queda prohibido resolver con `new Error('Request timeout')` u objetos sin `code`.
> **Regla de cita (ACU-05/D-E).** Ningún criterio de este corpus reproduce el literal de un mensaje: se cita `diccionario_datos.md` §4.3 por su **causa** o por su **código**. La tabla §4.3 de `diccionario_datos.md` es la fuente de verdad de las filas del catálogo de errores; esta §2.1 lo es de la lista de códigos admitidos.

### 2.2 Catálogo cerrado de eventos instrumentados y redacción de `params` (H-12, H-42 · RNF-16)

Una entrada de log por evento, sin excepciones. El catálogo es **cerrado** y tiene **24 eventos** (incluye `storage_quota_exceeded`, ADT-14/D-M; `diccionario_datos.md` §2.11): `rpc_call`, `rpc_error`, `event_emit`, `tx_sent`, `tx_confirmed`, `tx_failed`, `tx_reverted`, `sign_personal`, `sign_typed_data`, `approval_created`, `approval_resolved`, `approval_expired`, `chain_changed`, `accounts_changed`, `wallet_created`, `wallet_imported`, `account_imported`, `account_removed`, `reset_wallet`, `network_added`, `permission_revoked`, `sw_started`, `sw_reconcile`, `storage_quota_exceeded`.

> **Evento 24 (ADT-14 / D-M).** `storage_quota_exceeded` se instrumenta con `category: 'system'`, `level: 'error'` y `data: { code: -32603, key, bytesInUse, retried: true }` cuando el rechazo por cuota de `chrome.storage.local` se hace observable (§2.6 y `diccionario_datos.md` §2.15). El conteo vigente es **24**; el valor «23» solo consta en los registros históricos de auditoría.

**Política de redacción de `params` (H-42, ADT-12/D-T) — obligatoria:** nunca se registran claves privadas ni el mnemonic (ya prohibido en `diccionario_datos.md:184`) y **tampoco** el payload firmado íntegro: en `personal_sign` y `eth_signTypedData_v4` se guarda el **hash keccak256 del payload** y su longitud; en `eth_sendTransaction` se guardan `to`, `value`, `dataLength` y **los primeros 10 bytes de `data`** (4 bytes de selector + 6 bytes de prefijo de argumentos, el literal del diccionario), nunca el `data` completo. El log se exporta en JSON para diagnóstico y vive en `chrome.storage.local` gestionado por el Service Worker.

### 2.3 Procedimiento de medición de desempeño (H-13 · RNF-02, RNF-03, RNF-08)

1. **Estado «frío»:** Service Worker detenido desde `chrome://extensions` («Stop service worker») y **sin** popup abierto.
2. **Precondición obligatoria:** Anvil en marcha en `127.0.0.1:8545` y cuenta 0 con saldo > 0.
3. **Marcas:** `performance.mark('popup-mount')` en el montaje de React y `performance.mark('balance-rendered')` cuando el saldo ya está pintado.
4. **Estadístico:** **percentil 95** sobre **≥ 10 ejecuciones** (no media ni máximo).
5. **Artefacto:** el resultado se guarda como JSON (`RepoTecnico/perf/popup-<fecha>.json`) para compararlo entre ciclos.
6. **Presupuestos añadidos:** apertura de `notification.html` y de `connect.html` **< 500 ms en caliente**; reconstrucción de la cola del SW tras dormirse **< 1 s** (RNF-08).
7. RNF-03 se verifica con un **contador de llamadas RPC** sobre provider falso, no con inspección de logs.

### 2.4 Matriz cerrada de contraste (H-17 · RNF-19, RNF-21)

| Par texto / fondo | Ratio mínimo exigido | Modo |
|---|---|---|
| `--tk-navy` sobre blanco | ≥ 7:1 | claro |
| `--tk-gray-600` sobre blanco | ≥ 4.5:1 | claro |
| Texto blanco sobre `--tk-navy` | ≥ 7:1 | claro |
| Texto sobre el degradado de marca (extremo más claro) | ≥ 4.5:1 | claro |
| Texto principal sobre fondo oscuro | ≥ 4.5:1 | oscuro |
| Indicador de foco sobre cualquier fondo | ≥ 3:1 | ambos |
| Teal de marca (`#3E93A6`) como texto | ≥ 4.5:1 **o** tamaño ≥ 18 px | claro |
| Oro de marca (`#C9A97F`) | no se usa como texto (solo decorativo) | ambos |

**Evidencia:** `Vitest: contrast.spec.ts` (matriz de contraste WCAG de cada par de tokens de `tokens.css`) · `E2E: 24-accesibilidad.spec.ts` (0 violaciones críticas de `axe-core`).

### 2.5 Cumplimiento, avisos al usuario y excepciones explícitas (H-26)

Tabla de **excepciones declaradas**: lo que el enunciado agrupa bajo «Para Producción Requeriría» (`TAREA_PARA_ESTUDIANTE.md:2608-2623`) queda **fuera de alcance** y se documenta con su justificación, sin requisito sustituto.

| Exclusión | Justificación | Referencia |
|---|---|---|
| Cifrado con PBKDF2 y contraseña | Decisión P-03: modo desarrollo sin contraseña; riesgo aceptado y declarado. | P-03, RE-02, D-07 |
| Auto-lock por inactividad | Ídem P-03: sin contraseña no hay estado que bloquear. | P-03 |
| Rate limiting por origen | Fuera del alcance del MVP (ningún RF Must lo exige); la exposición se acota con la cardinalidad y el control de tasa de RF-37. | `TAREA_PARA_ESTUDIANTE.md:2622` |
| Detección de phishing avanzada | Se cubre el mínimo verificable: origen visible en `notification.html` (RF-35) y aviso de `domainChainMismatch` (RF-20). | H-35, H-40 |
| CSP explícita | MV3 impone por defecto una CSP sin `unsafe-eval`; un requisito propio sería redundante. | H-26 |
| Auditoría externa / pentest | Decisión del responsable de seguridad: **no prevista en este alcance** (§4.4). | H-28 |
| Publicación en tiendas | Entrega local como carpeta `dist/` y dApp servida en local. | RT-09 |

**Avisos in-product obligatorios (RNF-23):** aviso no descartable de software experimental y de red de pruebas sin custodia de fondos reales en el **primer arranque**, en la pantalla **«Acerca de» (RF-48)** y **antes de la primera firma**, con la aceptación registrada en `truekeate_settings`; y advertencia adicional al dar de alta una red no marcada `isTestnet` (RF-23).

### 2.6 Mantenimiento y ciclo de vida (H-29 · RNF-15, RNF-24)

| Elemento | Política |
|---|---|
| Responsable | El autor del proyecto (único mantenedor; ver §4.4) |
| Dependencias (`ethers`, `react`, `vite`) | Versión **fijada** en `package.json` y `package-lock.json` versionado; actualización solo por ciclo, con `npm ci && npm run build && npm run test` en verde |
| `ethers` (RT-02, única librería criptográfica) | Revisión de avisos de seguridad antes de cada hito; una vulnerabilidad se trata como incidencia bloqueante del hito |
| Foundry / Anvil | Rango soportado declarado en `entornos_globales.md` y **verificado antes** de la suite E2E (comando de versión + cadena de arranque) |
| Compatibilidad MV3 | Revisión explícita en cada actualización mayor de Chrome/Edge ≥ 114 (RNF-04); los cambios de plataforma se registran como decisión |
| Warnings permitidos en el build | Solo los de dependencias de terceros listados aquí; cualquier warning del código propio invalida el «build limpio» (RNF-15) |
| Canal de incidencias | Repositorio del proyecto (GitHub/GitLab, P-01); sin SLA comprometido en este alcance |

---

## 3. Requerimientos técnicos (RT) y restricciones (RE)

**Total: 13 RT (RT-01..RT-13, aquí en orden) y 4 RE (RE-01..RE-04).** Cada RT declara criterio de aceptación (aserción EARS) y evidencia; su detalle está en el Anexo A (§9) como `CA-RT-xx`.

| ID | Tipo | Definición | Criterio de aceptación | Evidencia |
|---|---|---|---|---|
| RT-01 | Stack UI | React 19 + TypeScript 5.9 + Vite 7. | `package.json` fija React 19, TypeScript 5.9 y Vite 7 como únicas dependencias de UI y build. | `Comando: npm ls react typescript vite` |
| RT-02 | Librería criptográfica | **Únicamente** `ethers.js v6` para mnemonic, HD, firma, provider y serialización. | El sistema deberá usar exclusivamente `ethers` v6 para mnemonic, HD, firma, provider y serialización. | `Comando: npm ls ethers` · `Comando: grep -rn "from 'ethers'" src/popup` → 0 coincidencias |
| RT-03 | Prohibiciones | No usar `viem`, `@scure/bip39`, `@metamask/*`, `axios` ni `fetch` directo en el código propio (lo usa ethers internamente). | `grep` de `viem\|@scure/bip39\|@metamask/\|axios` en `src/` y de `fetch(` propio devuelve 0 coincidencias. | `Comando: npm run lint:prohibited` |
| RT-04 | Plataforma | Chrome Extension Manifest V3: Service Worker (`type: module`), Content Script, Inject Script, `chrome.storage.local`, `chrome.alarms`, `chrome.windows` y `chrome.notifications` **solo como permiso opcional** (H-02, ADT-30/DEC-44). **Permisos declarados (conjunto cerrado, idéntico en `documento_tecnico.md` §7.3 y `entornos_globales.md` §4):** `["storage", "alarms", "favicon", "clipboardRead", "clipboardWrite"]`; el favicon se declara para el **icono de origen de la dApp** en `notification.html` (RF-35, ADT-22/P-21) y `clipboardRead`/`clipboardWrite` para la **política de portapapeles del revelado** (RF-50, P-20/ADT-09), nunca para copiar secretos desde la página. **Permisos mínimos (H-36):** `tabs`, `activeTab` y `scripting` solo se declaran si el código usa una capacidad que los exija; `host_permissions` solo para las redes dadas de alta; **`notifications` no se declara en `permissions`**: vive en **`optional_permissions`** y se solicita en runtime cuando se activa el ciclo posterior de RF-39. El **favicon** de origen y la **política de portapapeles** del revelado **sí** exigen permisos declarados (`favicon`, `clipboardRead`, `clipboardWrite`). **Política de RPC arbitrario (H-36):** `wallet_addEthereumChain` valida esquema (`https` preferente; `http` solo en local) y host, exige aprobación explícita del usuario y solicita el permiso en runtime (`chrome.permissions.request`), registrándolo por red en `truekeate_networks`. | `manifest.json` declara en `permissions` exactamente `["storage", "alarms", "favicon", "clipboardRead", "clipboardWrite"]`, y `notifications` únicamente en `optional_permissions`; `tabs`/`activeTab`/`scripting` solo con uso demostrado; el alta de red sin permiso de host se rechaza con error tipado. | `Vitest: manifest.spec.ts` · `Inspección: dist/manifest.json (permissions = storage, alarms, favicon, clipboardRead, clipboardWrite; notifications solo en optional_permissions)` · `E2E: 12-redes.spec.ts — permiso en runtime` |
| RT-05 | Build | El `manifest.json` se **genera** desde `src/manifest.ts` y el bundle de ethers se incluye localmente (sin CDN). | `npm run build` genera `manifest.json` desde `src/manifest.ts` y el bundle de ethers vive en `dist/` sin URLs de CDN. | `Comando: npm run build && grep -rn "http" dist/` → 0 URLs de CDN |
| RT-06 | Red de pruebas | **Foundry Anvil** en `127.0.0.1:8545`, chainId `31337` (sin Sepolia — P-02). | Con Anvil en `127.0.0.1:8545`, `eth_chainId` devuelve `0x7a69` y `truekeate_networks` no contiene Sepolia. | `Comando: anvil` + `E2E: 07-provider.spec.ts` |
| RT-07 | Pruebas | Unitarias/integración: **Vitest** (jsdom) sobre módulos del Service Worker. E2E: **Playwright** con Chromium persistente, la extensión cargada desde `dist/` y Anvil en marcha. Contratos: **Forge** sobre un contrato verificador de firmas **EIP-712** (P-07). | `npm run test`, `npm run test:e2e` y `forge test` (contrato `EIP712Verifier.sol`) existen y terminan con exit 0. | `Comando: npm run test && npm run test:e2e && forge test --root contracts --match-contract EIP712VerifierTest` (exit 0 en los tres) |
| RT-08 | Tipos | `@types/chrome` para las APIs del navegador y `@types/node` para el script de build. | `tsc -b` compila con `@types/chrome` y `@types/node` instalados y sin `any` implícitos. | `Comando: npx tsc -b` |
| RT-09 | Despliegue | **100 % local** (P-08): sin GCP. La extensión se distribuye como carpeta `dist/` y la dApp de pruebas se sirve en local. | No existe despliegue remoto: el artefacto es `dist/` y la dApp se sirve en `http://localhost:5174`. | `Inspección: dist/ y vite.config.ts (port 5174, strictPort)` |
| RT-10 | Idioma | UI, mensajes de error y documentación en **español**; identificadores de código en **inglés** (P-09). | Toda cadena **visible** está en español y todo identificador de código en inglés; no hay literales de UI en inglés. La comprobación mira SOLO texto visible (texto JSX, atributos JSX y literales de cadena): **exime** identificadores del API y nombres de propiedades, que son legítimamente ingleses. | `Vitest: src/popup/i18n.spec.ts` (recorre el AST de `src/popup`, `src/connect` y `src/notification`) · `E2E: 17-i18n.spec.ts` |
| RT-11 | Contrato auxiliar | Proyecto Foundry mínimo con un contrato verificador de firmas EIP-712 (`EIP712Verifier.sol`) y sus tests, usado como prueba de extremo a extremo del firmado (P-07). | `forge test` verifica una firma EIP-712 producida por la wallet: `verify` devuelve `true` y `false` si se altera un byte. | `Comando: forge test --root contracts --match-contract EIP712VerifierTest` |
| RT-12 | Identidad visual y licencias | Activos de marca en `public/brand/`, iconos de la extensión en `public/icons/` (generados desde `TrueKeate/TrueKeate_logo.png`), tokens en `src/styles/tokens.css`. Tipografías Poppins + Inter + JetBrains Mono **auto-hospedadas** en `public/fonts/` (woff2, subconjunto latin). **Licencias (H-37):** `LICENSE` del código, `NOTICE` y `public/fonts/LICENSE-poppins.txt`, `LICENSE-inter.txt` y `LICENSE-jetbrains-mono.txt` (OFL-1.1); los activos de marca TrueKeate fueron **proporcionados por el titular del proyecto** (DEC-15), que autoriza su uso y redistribución en este paquete. | Iconos en `public/icons/`, activos en `public/brand/`, woff2 latin + `LICENSE-*.txt` OFL en `public/fonts/` y tokens en `src/styles/tokens.css`; todo activo redistribuido tiene licencia registrada. | `Inspección: árbol public/ y git ls-files LICENSE NOTICE public/fonts/*.txt` |
| RT-13 | Nomenclatura e identidad del paquete | Producto **TrueKeate Wallet**; provider `window.truekeate` **con alias `window.codecrypto`**; EIP-6963 `name: "TrueKeate"` y `rdns: "academy.codecrypto.truekeate"`; prefijo de storage `truekeate_`; tipos de mensaje `TRUEKEATE_REQUEST/RESPONSE/EVENT/RPC`; dominio EIP-712 de la dApp `TrueKeate Test App`. **Identidad estable del paquete (ADT-19/DEC-43):** el **UUID del provider es una constante literal congelada** (UUID v4 literal en `src/inject/provider.ts`, nunca generado en runtime) y el `manifest.json` generado incluye una **`key` fija** (clave pública en base64) que estabiliza el **ID de la extensión** entre equipos y reinstalaciones — requisito para la **allowlist de CORS de Anvil (RE-04)** y para la **reproducibilidad de la suite E2E**. | `window.truekeate === window.codecrypto`, prefijo `truekeate_` y tipos `TRUEKEATE_*`; `rdns` = `academy.codecrypto.truekeate`; el UUID del provider y la `key` del manifest son **literales versionados** e idénticos en dos equipos, y el ID de la extensión es el mismo en ambos. | `Vitest: naming.spec.ts` (UUID literal y `key` presente en el manifest generado) · `Comando: grep -rn "codecrypto_" src/` → 0 coincidencias · `E2E: 07-provider.spec.ts — ID de extensión estable entre ejecuciones` |
| RE-01 | Restricción | No existe backend propio: toda la comunicación es directa dApp ↔ extensión ↔ nodo RPC. | El sistema deberá operar sin backend: ninguna petición sale hacia un servicio propio. | `Inspección: peticiones de red del popup (0 hacia servicios propios)` |
| RE-02 | Restricción | El modo "sin contraseña" (RF-03) implica que el mnemonic queda en claro en `chrome.storage.local` → riesgo aceptado solo para entorno de desarrollo (P-03). | Mientras el modo desarrollo esté activo, el sistema deberá avisar de que no se usen fondos reales (RNF-23). | `E2E: 26-avisos.spec.ts` |
| RE-03 | Restricción | No se hace `push` a repositorios remotos sin orden explícita del usuario (`/push`). | El sistema deberá abstenerse de hacer `push`: solo se ejecuta con la orden explícita `/push`. | `Inspección: historial de comandos (0 git push sin /push)` |
| RE-04 | Restricción | El RPC debe permitir CORS desde el origen de la extensión (`--http.corsdomain` en Anvil), con **allowlist concreta** (origen de la extensión y `http://localhost:5174`), no `*` (H-41). | Con la allowlist declarada, la extensión accede al RPC y un origen no listado es rechazado por CORS. | `Comando: anvil --http.corsdomain <lista>` |

---

## 4. Actores y stakeholders

| Actor | Descripción | Objetivos principales |
|---|---|---|
| **Usuario (dueño de la wallet)** | Persona que instala la extensión. Se desdobla en **dos perfiles** (§4.3): estudiante/autor que opera Anvil y evaluador que carga `dist/`. | Crear/importar cartera, gestionar cuentas, enviar/recibir ETH, aprobar o rechazar solicitudes. |
| **dApp** (ej. `test.html`) | Aplicación web de terceros que consume `window.truekeate` y su alias `window.codecrypto`. | Conectar, leer saldo, enviar transacciones, firmar datos, escuchar eventos. |
| **Service Worker (background)** | Actor de sistema. | Custodiar material criptográfico, ejecutar RPC, orquestar la cola de aprobaciones (puerto de larga vida y `chrome.alarms`), reconciliar al arrancar y emitir eventos. |
| **Nodo RPC local (Anvil)** | Actor de sistema externo. | Ejecutar y validar transacciones, entregar feeData y saldos. |
| **Navegador (Chrome/Edge)** | Plataforma. | Ciclo de vida del Service Worker, permisos, ventanas, notificaciones. |
| **Docente/evaluador** | Stakeholder de negocio. | Verificar el cumplimiento de la **rúbrica de 100 puntos** (§4.1) además de los 36 puntos del enunciado y los EIP. |
| **Responsable de seguridad** (el autor del proyecto) | Rol humano de custodia y decisiones de seguridad (§4.4). | Responder por la protección, el ciclo de vida y la recuperación del material criptográfico. |
| **Titular de los activos de marca y de las fuentes** | Titular que cedió los activos TrueKeate (DEC-15). | Autorizar el uso y la redistribución de la marca y de las tipografías OFL (RT-12, RNF-23). |

### 4.1 Criterios de aceptación del evaluador (H-14, H-16)

Transcripción de la **rúbrica de 100 puntos** (`TAREA_PARA_ESTUDIANTE.md:2408-2448`) y matriz ítem de la rúbrica ↔ RF/RNF/RT ↔ evidencia.

| Dimensión (puntos) | Ítem de la rúbrica (puntos) | Requisito que lo cubre | Evidencia declarada |
|---|---|---|---|
| Funcionalidad (40) | Wallet genera y carga mnemonic correctamente (5) | RF-01, RF-02, RF-03 (`CA-RF-01/02/03`) | `Vitest: mnemonic.spec.ts` · `E2E: 01-onboarding.spec.ts` |
| Funcionalidad (40) | Deriva 5 cuentas HD con rutas correctas (5) | RF-04 | `Vitest: derivation.spec.ts` |
| Funcionalidad (40) | **Provider `window.codecrypto` inyectado en páginas (5)** | **RF-13 + RT-13 (decisión H-15: alias `window.codecrypto`)** | `Vitest: inject.spec.ts — alias window.codecrypto` · `E2E: 07-provider.spec.ts` |
| Funcionalidad (40) | `eth_requestAccounts` funciona (3) | RF-16, RF-17 | `E2E: 09-conectar.spec.ts` |
| Funcionalidad (40) | `eth_sendTransaction` firma y envía correctamente (8) | RF-08, RF-19, RNF-25 | `E2E: 04-enviar.spec.ts`, `10-aprobar-tx.spec.ts` |
| Funcionalidad (40) | `eth_signTypedData_v4` firma mensajes EIP-712 (7) | RF-20, RT-11, RNF-25 | `E2E: 11-firmar-eip712.spec.ts` · `Comando: forge test --root contracts --match-contract EIP712VerifierTest` |
| Funcionalidad (40) | Eventos `accountsChanged` y `chainChanged` funcionan (4) | RF-15, RF-24 | `E2E: 08-eventos.spec.ts` |
| Funcionalidad (40) | Persistencia con `chrome.storage` (3) | RF-09, RF-10, RF-25, RNF-08 (equivalencia E-26 en §1.0) | `E2E: 05-persistencia.spec.ts` |
| Arquitectura (20) | Separación correcta de componentes (5) | RNF-14 | `Comando: grep -rn "from 'ethers'" src/popup src/components` → 0 coincidencias |
| Arquitectura (20) | Comunicación asíncrona robusta (5) | RF-37, RNF-08, RT-04 (puerto de larga vida + `chrome.alarms`) | `Vitest: approvalReconcile.spec.ts` · `E2E: 18-concurrencia.spec.ts` |
| Arquitectura (20) | Manejo de errores apropiado (5) | RF-14, RNF-06 (códigos de §2.1 y literales de tabla §4.3 de `diccionario_datos.md`) | `Vitest: errors.spec.ts` |
| Arquitectura (20) | **Código limpio y comentado (5)** — *sin requisito equivalente en v1.3* | **Cerrado por RNF-13 + RNF-14 + RNF-24 y la regla nueva: todo módulo de criptografía, aprobaciones y mensajería lleva JSDoc de contrato (entradas, salidas, errores)** | `Comando: npx tsc -b` · `Comando: grep -rn "@param|@returns" src/background/crypto` (cobertura JSDoc) |
| UX/UI (15) | **Popup funcional e intuitivo (5)** — *sin requisito equivalente en v1.3* | **Cerrado por RNF-05 (≤ 2 clics), RNF-21 (teclado y axe-core), RF-27 (polling con parada) y RF-34 (español y formato)** | `E2E: 24-accesibilidad.spec.ts`, `14-polling.spec.ts`, `17-i18n.spec.ts` |
| UX/UI (15) | **`notification.html` clara y profesional (5)** — *sin requisito equivalente en v1.3* | **Cerrado por RF-35 (origen visible, foco, ventana única), RF-41 y RNF-05** | `E2E: 10-aprobar-tx.spec.ts — foco y origen` |
| UX/UI (15) | `test.html` funcional (3) | RF-46, RF-47 | `E2E: 22-dapp.spec.ts` |
| UX/UI (15) | Logs útiles y bien formateados (2) | RF-28..RF-32, RNF-16 (§2.2) | `E2E: 15-logs.spec.ts` |
| Estándares (15) | EIP-1193 implementado correctamente (4) | RF-45, RF-14 | `Vitest: eip1193.spec.ts` |
| Estándares (15) | EIP-712 implementado correctamente (4) | RF-20, RT-11 | `E2E: 11-firmar-eip712.spec.ts` · `Forge` |
| Estándares (15) | EIP-1559 gas management (4) | RF-42 | `Vitest: eip1559.spec.ts` · recibo `type: 2` |
| Estándares (15) | EIP-6963 provider discovery (3) | RF-44 | `E2E: 21-eip6963.spec.ts` |
| Documentación (10) | README completo (4) | Entregable `README.md` de §4.2 (**criterio en CU-36**) | `Inspección: README.md` (descripción, instalación, uso, decisiones y evidencias) |
| Documentación (10) | Comentarios en código (3) | RNF-13, RNF-14 + regla de JSDoc de esta sección (**criterio en CU-36**) | `Inspección: JSDoc de contrato en src/background/crypto/**, src/background/approvals/** y src/shared/**` |
| Documentación (10) | Instrucciones de instalación (3) | Entregable `INSTRUCCIONES.md` de §4.2 (**criterio en CU-36**) | `Inspección: INSTRUCCIONES.md` (extensión + dApp paso a paso) |

**Ítems de rúbrica cerrados por esta versión** (no tenían requisito equivalente en v1.3): «Código limpio y comentado», «Popup funcional e intuitivo» y «`notification.html` clara y profesional». **Todos los 100 puntos quedan mapeados** a un requisito y a una evidencia.

### 4.2 Entregables y aceptación (H-16)

Paquete de entrega definido en `TAREA_PARA_ESTUDIANTE.md:2632-2667`, con su peso en la rúbrica y la fase que lo produce:

| Entregable | Contenido | Peso en la rúbrica | Fase que lo produce |
|---|---|---|---|
| Código fuente | `src/`, `public/` y archivos de configuración | Funcionalidad + Arquitectura + Estándares (75 pts) | Fases 3 y 4 |
| Build compilado | `dist/` listo para cargar en `chrome://extensions` | Requisito de entrega (RT-05, RT-09) | Fase 4 |
| `README.md` | Descripción, instalación, uso, decisiones y evidencias | Documentación (4 pts) | Fase 5 — Manuales (cubierto **por diseño**) |
| `INSTRUCCIONES.md` | Instalación paso a paso de la extensión y de la dApp | Documentación (3 pts) | Fase 5 — Manuales (cubierto **por diseño**) |
| Comentarios en código | JSDoc de contrato en criptografía, aprobaciones y mensajería | Documentación (3 pts) | Fases 3 y 4 |
| `video_demo.mp4` (**opcional**) | Inicialización, conexión desde dApp, envío, EIP-712, cambio de cuenta/red | No puntúa directamente; evidencia de UX/UI | Fase 5 |
| ZIP de entrega | `apellido_nombre_wallet.zip` con `src/`, `public/`, `dist/`, `README.md`, `package.json` y el vídeo opcional | Formato exigido por el enunciado | Fase 5 (cierre) |

**Criterio de aceptación:** el ZIP contiene la estructura exacta del enunciado, `dist/` se carga con **0 errores en consola y 0 en el badge** de `chrome://extensions`, y un evaluador del Perfil B completa la instalación y el arranque en **≤ 15 min** siguiendo solo `README.md` e `INSTRUCCIONES.md`, con **0 consultas al autor** (`E2E: 01-onboarding.spec.ts — carga de dist/ con 0 errores` · `Inspección: ensayo de instalación en RepoTecnico/evidencia/H5/`).

### 4.3 Perfiles de usuario final (H-27)

| Perfil | Descripción y nivel técnico | Expectativas |
|---|---|---|
| **A — Estudiante/autor (desarrollador)** | Levanta Anvil, conoce EIP-1193/712/1559/6963 y usa `test.html` como banco de pruebas. Es el usuario principal durante el desarrollo. | Iterar rápido, ver logs completos, forzar estados (RPC caído, rechazo, timeout) y disponer del hint de la frase de Anvil (RF-12). |
| **B — Evaluador** | Carga `dist/` en un equipo limpio **sin conocer el proyecto**; puede no tener Anvil en marcha. | Instalar y ver el producto en pocos minutos con `INSTRUCCIONES.md`; entender qué es y qué no es (aviso de red de pruebas, RNF-23); interpretar estados vacíos o «desconectado» (RNF-07) sin ambigüedad; textos en español (RF-34). |

**Derivación:** de estos dos perfiles nacen RF-12 (hint de Anvil), RF-34 (español y formato), RNF-06 (§2.1) y RNF-23 (avisos in-product), y la exigencia del paquete de entrega de §4.2.

### 4.4 Responsable de seguridad y auditoría (H-28)

- **Responsable de seguridad: el autor del proyecto** (rol humano, no delegable al Service Worker). Asume el alcance de RNF-09, RNF-10, RNF-12, RNF-22 y RNF-23 y la custodia lógica del material criptográfico.
- **Decisión sobre auditoría externa: NO prevista en este alcance** (proyecto individual, formativo y en modo desarrollo). Queda registrada aquí para que no se interprete como omisión.
- **Compensación con evidencia reproducible:** inspección de los mensajes del content script, test de inyección desde un iframe hostil (RNF-10), `logRedaction.spec.ts` (RNF-09 + H-42) y validación de integridad BIP-39/EIP-55 (RNF-22). Las recomendaciones de producción del enunciado (`TAREA_PARA_ESTUDIANTE.md:2625-2628`) se declaran fuera de alcance en §2.5.

### 4.5 MVP (40 RF Must) vs ciclo posterior (10 RF Should) (H-34 · P-17)

| Grupo | RF | Consecuencia |
|---|---|---|
| **MVP — 40 Must** | RF-01..RF-05, RF-07..RF-11, RF-13..RF-31, RF-33, RF-35..RF-37, RF-41..RF-43, RF-45, RF-46, RF-49 y **RF-50** | Es el alcance que se compromete en la entrega; los 40 tienen `CA-RF-xx` y evidencia (§9). **El MVP no depende del badge:** RF-38 y RF-39 quedan fuera. |
| **Ciclo posterior — 10 Should** | RF-06 (borrar importada), RF-12 (hint Anvil), RF-32 (historial persistente), RF-34 (i18n/formato), **RF-38 (badge)**, **RF-39 (notificaciones Chrome)**, RF-40 (timeout), RF-44 (EIP-6963), RF-47 (historial de la dApp), RF-48 («Acerca de») | Se planifican en un ciclo posterior y **deben quedar listados como tales**; si el presupuesto se agota, es el primer recorte. |

> **P-17 — El MVP no depende del badge (ACU-07):** RF-38 (badge) y RF-39 (notificaciones) **permanecen en el ciclo posterior y no se promociona ninguno**. El oráculo del caso central de la cola de aprobaciones (CU-16) pasa a ser **«2 entradas `pending` en `truekeate_pending_requests` + 1 transacción en vuelo por cuenta»**, verificable con RF-37/RF-41 y `CA-RF-37`/`CA-RF-41` sin depender de `CA-RF-38` ni de las notificaciones de Chrome.
> **P-18 — RF-50 entra en el MVP (Must):** el revelado y la exportación de la semilla y de las claves privadas es un requisito de **capacidad de recuperación** (RNF-22, H-25), documentado como desviación **D-13**; sin él, las cuentas importadas por clave privada serían irrecuperables.

**Estimación:** se **retira el «~40 h»** del resumen ejecutivo (contradecía las 51-68 h del material fuente) y la duración se expresa **por hitos** en el `plan_desarrollo.md` de la Fase 3, con este orden mínimo: (H1) onboarding y persistencia, (H2) provider y lectura, (H3) firma, aprobación y tiempo límite, (H4) redes, logs y UI, (H5) identidad visual y suite E2E/Forge.

### 4.6 Nota sobre `GUIA_RAPIDA_TESTING.md` (H-24)

`RepoTecnico/GUIA_RAPIDA_TESTING.md` es documentación de la **línea base previa descartada** por P-10/DEC-09: usa la nomenclatura antigua (`codecrypto_*`, `window.codecrypto`, `npx hardhat node`) y **no es vinculante** ni constituye fuente de requisitos (por eso RF-25 se reclasifica en §1.0). Sus esquemas de storage **no deben copiarse**: la forma canónica es la de `diccionario_datos.md` §2. El proyecto tendrá su **propia guía de troubleshooting** con nomenclatura `truekeate_`, entregada en la fase de manuales (§4.2).

---

## 5. Desviaciones y ambigüedades detectadas en el enunciado fuente

| # | Hallazgo | Impacto | Propuesta |
|---|---|---|---|
| D-01 | El enunciado dice 36 RF pero la numeración se **repite**: el 20 aparece como "Gestion de Redes" y como "Modal de Confirmación"; el 26 y el 29 también colisionan. El conteo real de viñetas es 37. | Trazabilidad confusa | Renumerado a **`RF-01..RF-50`** (50 RF = 40 Must + 10 Should) con este documento como fuente única. **RF-48 y RF-49 son aportaciones de identidad visual** y **RF-50 una aportación de diseño por recuperación (D-13)**, todas sin correspondencia en el enunciado y dentro del rango oficial (H-03, H-25). Los números repetidos se citan con sufijo `E-20a`/`E-20b` (§1). |
| D-02 | El enunciado indica **Hardhat** (`npx hardhat node`) pero el usuario pidió una **red de Foundry en local**. Ambos usan puerto 8545, chainId 31337 y la misma frase `test … junk`. | Bajo | **Resuelto (P-02):** Anvil como única red y **se retira Sepolia**. El cambio de red (RF-22/RF-23) se prueba entre redes locales vía `wallet_addEthereumChain`. |
| D-03 | No está en el enunciado la **importación por clave privada**, que el usuario sí pidió. | Medio | Añadido como RF-05/RF-06. |
| D-04 | "Enviar y recibir transferencias entre cuentas" puede leerse como transferencias internas (RF-08) o como mostrar la dirección para recibir (RF-07). | Bajo | Se cubren ambos explícitamente. |
| D-05 | E-04 prohíbe `fetch`/`axios`, pero `ethers.JsonRpcProvider` usa `fetch` internamente. | Bajo | La restricción aplica al código propio; se documenta la excepción. |
| D-06 | El enunciado no define el comportamiento ante **varias solicitudes simultáneas** ni el **timeout**. | Medio | Se añaden RF-37 y RF-40. |
| D-07 | El enunciado no menciona cifrado del mnemonic ni bloqueo por contraseña (E-02 lo excluye). | Alto (seguridad) | **Resuelto (P-03):** se mantiene la **carga sin contraseña**; el riesgo se acepta y se documenta como modo desarrollo. |
| D-08 | La ruta del proyecto en el enunciado es `71_wallet_chrome_extension/`, pero el workspace es la raíz `chrome-wallet/`. | Bajo | El proyecto se desarrolla en la raíz del workspace. |
| D-09 | Existe una **implementación previa completa** en el remoto `codecrypto` (§0.1) que no está en el workspace local. | Alto (alcance) | **Resuelto (P-10):** se **reconstruye desde cero**; el remoto queda solo como referencia. |
| D-10 | El enunciado exige el provider **`window.codecrypto`** y el nombre «CodeCrypto», pero la identidad visual entregada es la marca **TrueKeate**. La rúbrica puntúa literalmente «Provider `window.codecrypto` inyectado en páginas (5 pts)». | Alto (nomenclatura) | **DECISIÓN FIRME (P-13 + P-16, sin condiciones):** el producto se llama **TrueKeate Wallet**; el provider inyectado expone **`window.truekeate`** y **además el alias `window.codecrypto = window.truekeate`** (el **mismo objeto**). El alias se implementa desde la Fase 3 en `inject.js` y es un criterio de aceptación (RF-13, `CA-RF-13`), con un test que verifica **ambos nombres** (`window.truekeate === window.codecrypto`). No queda ninguna condición diferida ni pendiente de decisión futura en este documento: la compatibilidad es obligatoria y verificable. |
| D-11 | La **vista de recepción con QR y copiar** (RF-07) es un requisito `NUEVO` Must que **no tenía fila D-xx**: D-04 solo registraba la ambigüedad de lectura de «enviar y recibir transferencias». | Medio | **Añadida esta fila (H-30).** Autorizado por P-05 («sí a ambos: `personal_sign` + vista de recepción con QR y copiar»), que además elevó RF-07 a Must. Justificación completa en la tabla de requisitos `NUEVO` de §1.0. |
| D-12 | La **persistencia de conexión por origen** (RF-25) es un requisito `NUEVO` Must que **no tenía fila D-xx** ni respuesta de entrevista, y se atribuía a `GUIA_RAPIDA_TESTING.md` (documento descartado por P-10). | Medio | **Añadida esta fila (H-30).** RF-25 se reclasifica como **`NUEVO` (diseño)** derivado de **RNF-11** (una dApp no autorizada recibe `[]`), y su fuente deja de ser la guía descartada (ver §1.0 y §4.6). |
| D-13 | El **revelado y exportación de la frase semilla (BIP-39) y de las claves privadas** (RF-50) **no proviene del enunciado**: es una **aportación de diseño por requisito de recuperación** (hallazgo **H-25** del `INFORME_OPTIMIZACION_V1.md`), ligada a la categoría RNF **Capacidad de recuperación** (RNF-22). | Medio (alcance) | **Añadida esta fila (P-18, ACU-14).** Entra en el MVP como **RF-50 (Must)** con `CA-RF-50` en §9 (Gherkin **y** EARS): confirmación explícita del usuario, advertencia de riesgo, valores ocultos por defecto, revelado temporal de 30 s y prohibición de exponerlos por `window.postMessage`. |

---

## 6. Entrevista de la Fase 1

### Bloque 1 — Entorno, repositorios y seguridad ✅ RESUELTO

| ID | Pregunta | Respuesta | Acción tomada |
|---|---|---|---|
| P-01 | Repositorios remotos | Crear en **GitHub** `chrome-wallet` con ramas `main` y `chrome-wallet-DSH`; crear en **GitLab** `chrome-wallet` con las mismas ramas; agregar `https://gitlab.codecrypto.academy/anlucorporations/chrome-wallet.git`. | Repo local inicializado con `main` + `chrome-wallet-DSH` y los 3 remotos configurados. El repo de `codecrypto` **ya existía y trae la implementación previa**; GitHub y GitLab.com **aún no existen** y no hay `gh`/`glab` ni tokens → creación pendiente por el usuario (`entornos_globales.md` §5). |
| P-02 | Red por defecto | **Solo Anvil local, sin Sepolia.** | `DEFAULT_RPC_URL=http://127.0.0.1:8545`, chainId `0x7a69`; se elimina `0xaa36a7` del diccionario y de `host_permissions`. |
| P-03 | Seguridad del mnemonic | **Sin contraseña** (modo desarrollo). | RF-03 confirmado; `settings.encryptionEnabled=false`, `requirePasswordOnOpen=false`. Riesgo aceptado (§8). |

### Bloque 1-bis — Línea base existente ✅ RESUELTO

| ID | Pregunta | Respuesta |
|---|---|---|
| P-10 | ¿Adoptar la implementación previa del remoto `codecrypto`? | **Reconstruir desde cero.** El código del remoto queda **únicamente como referencia**; no se reutiliza. La nueva implementación se escribe desde cero en las Fases 3 y 4. |

### Bloque 2 — Alcance funcional ✅ RESUELTO

| ID | Pregunta | Respuesta | Impacto |
|---|---|---|---|
| P-04 | Nº de cuentas derivadas | **5 por defecto + botón "Añadir cuenta"** para derivar la siguiente. | RF-04 ampliado; `settings.derivedAccountCount` inicial = 5. |
| P-05 | `personal_sign` y QR | **Sí a ambos**: `personal_sign` + vista de recepción con **QR y copiar**. | RF-21 y RF-07 pasan a **Must** (confirmados). |
| P-06 | Permisos y etiquetas | **Sí a ambos**: revocar permiso por origen + renombrar cuentas. | RF-26 y RF-05 confirmados (**Must**). |

### Bloque 4 — Identidad visual ✅ RESUELTO

| ID | Pregunta | Estado |
|---|---|---|
| P-13 | Conciliación marca/nomenclatura | ✅ **Renombrar todo a TrueKeate**, incluido el provider inyectado (`window.truekeate`). |
| P-14 | Sistema de diseño | ✅ **Aprobado tal cual** (`identidad_visual.md`): paleta medida, Poppins + Inter + JetBrains Mono auto-hospedadas, ventanas 380×600 / 420×650 / 420×640. |
| P-15 | Iconos pequeños | ✅ **Aprobada** la variante simplificada para 16/32 px (zoom a las flechas + saturación). |
| P-16 | Alias del provider (cierre de H-15) | ✅ **Decisión firme, sin condiciones:** el provider expone `window.truekeate` **y** `window.codecrypto = window.truekeate` (el mismo objeto). Se implementa desde la Fase 3 y se verifica con un test que comprueba **ambos nombres**. Cubre los 5 pts de la rúbrica (ítem «Provider `window.codecrypto` inyectado en páginas») sin renunciar a la marca TrueKeate. Retira la condición diferida que constaba en D-10 y que debe retirarse igualmente de `entornos_globales.md` §10 e `identidad_visual.md`. |

### Bloque 3 — Calidad, pruebas y entrega ✅ RESUELTO

| ID | Pregunta | Respuesta | Impacto |
|---|---|---|---|
| P-07 | Frameworks de prueba | **Vitest + Playwright + contrato verificador EIP-712 probado con Forge.** | RT-07 y RT-11 añadidos; se crea un proyecto Foundry mínimo con el contrato verificador y sus tests. |
| P-08 | Despliegue | **100 % local, sin GCP.** | GCP sale del alcance (`entornos_globales.md` §6 cerrado). |
| P-09 | Idioma | **UI y documentación en español; identificadores de código en inglés.** | RT-10 añadido; RF-34 confirmado. |

---

## 7. Criterios de aceptación de la Fase 1 ✅ COMPLETADA

- [x] Extracción de RF / RNF / RT / RE del enunciado fuente.
- [x] `requerimientos.md`, `diccionario_datos.md` y `entornos_globales.md` creados en `RepoTecnico/`.
- [x] `estado_proyecto.md` con el resumen de fase.
- [x] Bloque 1 respondido (P-01, P-02, P-03).
- [x] Decisión sobre la línea base existente (**P-10**: reconstruir desde cero).
- [x] Bloques 2 y 3 respondidos (P-04 .. P-09).
- [x] Repositorio local inicializado con `main` y `chrome-wallet-DSH` y los 3 remotos configurados.
- [x] **v1.4 — remediación de `INFORME_OPTIMIZACION_V1.md`:** criterios de aceptación y evidencia en los 49 RF y 13 RT + Anexo A (§9); trazabilidad, conteos y desambiguación (H-03, H-05, H-06, H-30, H-38); ciclo de aprobación MV3, `eth_sign` retirado, vista previa decodificada y alias del provider (H-02, H-07, H-08, H-11a, H-11b, H-15); RNF operacionalizados y categorías nuevas (H-12, H-13, H-17, H-19, H-20, H-22, H-25, H-26, H-29, H-40, H-42); rúbrica, entregables, stakeholders, MVP y licencias (H-14, H-16, H-24, H-27, H-28, H-34, H-35, H-36, H-37).
- [x] **v1.5 — remediación de `casos_uso/AUDITORIA_CASOS_USO_V1.md` (ACU-01..ACU-30, D-A..D-G):** conteos a **50 RF (40 Must / 10 Should)**; **RF-50 (Must)** con `CA-RF-50` en Gherkin y EARS y desviación **D-13**; **P-17** (el MVP no depende del badge; RF-38/RF-39 siguen en el ciclo posterior), **P-18** y **P-19** (`wallet_switchEthereumChain` exige aprobación si la red destino no es la activa) aplicadas; caducidad de sesión de dApp de 24 h renovables en RF-25 y `CA-RF-25` (**D-B**); literal de build `npm ci && npm run build` (**D-C**, RNF-15); RT-13 como fuente de verdad de EIP-6963 (**D-A**); campo `event` en `truekeate_logs` (**D-D**); varios mensajes por código EIP-1193 (**D-E**); `accountLabels` (**D-F**); permiso de host en runtime siempre (**D-G**); rúbrica de Documentación (§4.1) apuntada a la evidencia existente.
 **v1.7 — cierre de los residuales del veredicto de reevaluación (`VEREDICTO_FASE2_V1.md`, R-01 y R-09):** §2.1 pasa a ser la **tabla de códigos EIP-1193 y su significado** y los **literales de mensaje** quedan con **fuente única en `diccionario_datos.md` §4.3** (todas las citas de los casos de uso, del Anexo A y del documento técnico apuntan allí); se añade el **evento 24** (`storage_quota_exceeded`) a §2.2; la afirmación **no falsable** del puerto de larga vida se sustituye por los criterios observables «tras 30 s de inactividad, un `RESUME` con el mismo `approvalId` responde en < 200 ms» y «el puerto no garantiza la vida del SW»; y las **evidencias con forma no canónica** (`Revisión:`) se reescriben a `Comando:`/`Inspección:` con magnitud y método (R-06, R-07, R-08).
 **v1.8 (esta versión) — cierre de `R-09` (`VEREDICTO_FASE2_V1.md` v1.2, DEC-45/DEC-46):** los **criterios de aceptación** de **RF-05, RF-06, RF-11 y RF-50** (`CA-RF-05`, `CA-RF-06`, `CA-RF-11` y `CA-RF-50`) recogen las **dos guardas nuevas**: (a) **cuenta en uso por una dApp conectada** → bloquea el revelado/exportación de su clave privada y el borrado de la cuenta importada con `-32000` (**R-09a/DEC-45**); (b) **reset bloqueado** por cola `truekeate_pending_requests` no vacía o transacción en vuelo en `truekeate_inflight_tx` → bloquea el reset con `-32000`, la UI indica cuántas solicitudes quedan y ofrece resolverlas (aprobar o rechazar) o esperar a que expiren (**R-09b/DEC-46**). §2.1 reasigna ambas causas a la fila `-32000` (conflicto de estado) y retira «cuenta en uso por una dApp» de `-32602` y «reset incompleto» de `-32603`. Los **literales** siguen con fuente única en `diccionario_datos.md` §4.3 y los **conteos no cambian**: **50 RF (40 Must / 10 Should) · 25 RNF · 13 RT · 4 RE**.
 **v1.9 (esta versión) — cierre de `VR-01`, `VR-07` y `VR-08` de la última pasada de consistencia:** **RT-04** y **`CA-RT-04`** declaran el **conjunto cerrado de permisos** `["storage", "alarms", "favicon", "clipboardRead", "clipboardWrite"]` con la justificación de cada uno (`favicon` = icono de origen de la dApp, RF-35/ADT-22; `clipboardRead`/`clipboardWrite` = política de portapapeles del revelado, RF-50/P-20) y con la evidencia `Inspección: dist/manifest.json`; el conjunto queda **idéntico** en los cuatro documentos. **RT-06** cita la clave canónica `truekeate_networks` (ACU-25) y cuatro evidencias pasan a las formas admitidas (RF-42, matriz de contraste de §2.4, RT-11 y `CA-RF-20`).
- [ ] Repositorios de GitHub y GitLab.com creados por el usuario (acción externa; no bloquea la Fase 2).
- [ ] Confirmación del usuario para pasar a la Fase 2.

---

## 8. Riesgos identificados

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Mnemonic en claro en `chrome.storage.local` (RF-03) | Alta | Alto | **Riesgo aceptado (P-03)**; documentado como modo desarrollo exclusivo, con aviso in-product obligatorio (RNF-23). |
| Ciclo de vida del Service Worker MV3 (se duerme y pierde estado en memoria) | Alta | Alto | Cola persistida `Record<approvalId, PendingRequest>`, puerto de larga vida, `chrome.alarms` para el vencimiento y reconciliación al arrancar (RF-37, RF-40, RF-41, RNF-08). |
| CORS/`host_permissions` bloquean el RPC local | Media | Medio | `host_permissions` para `http://127.0.0.1:8545/*` y `--http.corsdomain` con allowlist concreta en Anvil (RE-04). |
| Inyección en `document_start` compite con la carga de la dApp | Media | Medio | Inyectar `inject.js` de forma síncrona y anunciar EIP-6963 al `DOMContentLoaded` (RF-44). |
| Colisión de numeración del enunciado (D-01) | Alta | Bajo | Renumeración `RF-XX` como fuente única en este documento, con sufijos `E-20a`/`E-20b` (§1). |
| Fuga de la clave privada hacia la página vía `postMessage` | Baja | Crítico | RNF-09/RNF-10: nunca se envían claves; solo firmas y hashes, con redacción de `params` en los logs (H-42). |
| **Pérdida irrecuperable de cuentas importadas por clave privada** (RF-05; no re-derivables del mnemonic) | Media | Alto | **Nuevo (H-25):** exportación/revelado con confirmación explícita, reset destructivo que enumera lo que se pierde e integridad BIP-39/EIP-55 al arrancar (RNF-22). |
| Reconstruir desde cero dentro del presupuesto | Media | Medio | **Se retira el «~40 h»**: estimación **por hitos** en `plan_desarrollo.md` y tabla del recorte MVP (**40 Must**) vs ciclo posterior (10 Should) en §4.5 (H-34). |
| Volumen de trabajo de Playwright + Forge + Vitest en solitario | Media | Medio | Los tests se construyen por ciclo, no al final; el contrato EIP-712 es mínimo (una función `verify`). |

---

## 9. Anexo A — Criterios de aceptación detallados (H-01)

> Cada `CA-RF-xx` / `CA-RT-xx` es la versión completa del criterio abreviado de las tablas de §1 y §3, y es la unidad que deben citar los casos de uso de la Fase 2. **Comportamientos de usuario → Gherkin** (`Dado / Cuando / Entonces / Y / Pero`); **restricciones del sistema → EARS** (`Mientras…`, `Cuando…`, `Si… entonces…`, `El sistema deberá…`). Todos los criterios son falsables: si el código deja de cumplirlos, el test asociado falla.

### 9.1 Validación de la plantilla con los 3 RF piloto (puerta de calidad de H-01)

| Piloto | Criterio abreviado | Aserción del test | Mutación que lo hace fallar |
|---|---|---|---|
| **RF-01** | 12 palabras con checksum BIP-39 válido | `expect(Mnemonic.isValidMnemonic(frase)).toBe(true)` y `frase.split(' ').length === 12` | Generar 11 palabras o saltarse el checksum |
| **RF-08** | hash `0x`+64 hex y recibo `status 1` | `expect(hash).toMatch(/^0x[0-9a-f]{64}$/)` y `expect(recibo.status).toBe(1)` | No difundir (devolver `null`) o enviar a otra dirección |
| **RF-40** | A los 120 s → cierre de ventana + `code 4001` | fake timers avanzan 120 s: `expect(err.code).toBe(4001)` | Usar `setTimeout` (no dispara con el SW dormido) o rechazar con un `Error` sin `code` |

**Resultado de la validación:** los tres pilotos producen aserciones **observables y falsables** (una de generación, una de contrato con la red y una de temporización con relojes falsos). El formato **no requiere rediseño** y se replica a los 50 RF y a los 13 RT.

### 9.2 Criterios de aceptación de los RF

#### CA-RF-01 · Generar frase semilla BIP-39
```gherkin
Dado el popup abierto sin cartera en chrome.storage.local
Cuando el usuario pulsa «Crear cartera nueva»
Entonces la pantalla muestra 12 palabras separadas por espacios
Y ethers.Mnemonic.isValidMnemonic(frase) devuelve true
Y la UI exige confirmar la frase antes de habilitar «Continuar»
```
**Evidencia:** `Vitest: mnemonic.spec.ts — 12 palabras, checksum y entropía de 128 bits`.

#### CA-RF-02 · Importar frase de recuperación
```gherkin
Dado el formulario de importación
Cuando pego las 12 palabras con espacios dobles y mayúsculas irregulares
Entonces la cuenta 0 derivada coincide con la derivación canónica de la frase normalizada
Pero si altero una palabra, la UI muestra «frase inválida» y no crea la cartera
```
**Evidencia:** `Vitest: mnemonic.spec.ts — normalización y checksum`.

#### CA-RF-03 · Carga sin contraseña
```gherkin
Dado una frase válida cargada o importada
Cuando la operación termina
Entonces el popup muestra la cuenta 0 y su saldo
Y en ningún momento aparece un campo de contraseña
```
**Evidencia:** `E2E: 01-onboarding.spec.ts — sin prompt de contraseña`.

#### CA-RF-04 · Derivación HD de 5 cuentas
```gherkin
Dado una cartera recién creada
Cuando se abre la lista de cuentas
Entonces hay exactamente 5 cuentas con rutas m/44'/60'/0'/0/0 a /4
Cuando el usuario pulsa «Añadir cuenta»
Entonces aparece la 6.ª con índice 5 y con una dirección distinta de las anteriores
```
**Evidencia:** `Vitest: derivation.spec.ts` · `E2E: 02-cuentas.spec.ts`.

#### CA-RF-05 · Importar cuenta por clave privada
```gherkin
Dado el formulario «Importar cuenta»
Cuando introduzco 0x más 64 hex válidos
Entonces la cuenta aparece marcada «importada» y con la dirección derivada de esa clave
Y al renombrarla, la etiqueta persiste tras reabrir el popup
Pero con 63 hex o sin el prefijo 0x la UI muestra error inline y no añade nada
```
```gherkin
Dado una cuenta importada cubierta por una sesión vigente en truekeate_connected_sites
Cuando intento revelar su clave privada o eliminarla
Entonces la operación se rechaza con el error tipado -32000 de la causa «Cuenta en uso por una dApp conectada» (diccionario_datos.md §4.3; R-09a/DEC-45)
Y ninguna escritura de chrome.storage.local ha tenido lugar
```
**Evidencia:** `Vitest: importPrivateKey.spec.ts — validación de 0x+64 hex` · `Vitest: accounts.spec.ts — guarda de sesión de dApp activa (bloqueo -32000)` · `E2E: 02-cuentas.spec.ts — importación y renombrado`.

#### CA-RF-06 · Eliminar cuenta importada
```gherkin
Dado una cuenta importada con etiqueta y sin sesión de dApp que la use
Cuando el usuario confirma «Eliminar cuenta»
Entonces la cuenta desaparece y su clave privada ya no existe en chrome.storage.local
Y al ocultar una cuenta derivada, la cuenta puede volver a mostrarse con la misma dirección
```
```gherkin
Dado una cuenta importada con una sesión vigente en truekeate_connected_sites
Cuando el usuario confirma «Eliminar cuenta»
Entonces el popup y el SW rechazan la operación con el error tipado -32000 de la causa «Cuenta en uso por una dApp conectada» (diccionario_datos.md §4.3; R-09a/DEC-45)
Y truekeate_imported_accounts conserva la entrada con su privateKey
Y el mensaje nombra la dApp cuyo permiso debe revocarse antes de reintentar
```
**Evidencia:** `Vitest: accounts.spec.ts — borrado de importada` · `Vitest: accounts.spec.ts — bloqueo con sesión activa (-32000) y borrado tras revocar` · `E2E: 25-recuperacion.spec.ts — bloqueo por sesión y desbloqueo tras revocar el permiso`.

#### CA-RF-07 · Recibir: dirección, copiar y QR
```gherkin
Dado la cuenta activa seleccionada
Cuando el usuario abre «Recibir»
Entonces se muestra la dirección completa 0x más 40 hex
Y al pulsar «Copiar», el portapapeles contiene exactamente esa dirección
Y el QR decodificado devuelve la misma cadena
```
**Evidencia:** `E2E: 03-recibir.spec.ts — copiar y QR`.

#### CA-RF-08 · Enviar transferencias
```gherkin
Dado Anvil en marcha con la cuenta 0 con saldo y la cuenta 1 con 0
Cuando envío 1 ETH de la cuenta 0 a la 1 y apruebo en notification.html
Entonces eth_sendTransaction resuelve un hash 0x más 64 hex
Y eth_getTransactionReceipt(hash).status es 1
Y el saldo de la cuenta 1 aumenta en 1 ETH menos la comisión
Pero si el valor supera el saldo, la UI bloquea el envío con «saldo insuficiente»
```
**Evidencia:** `E2E: 04-enviar.spec.ts` · `Vitest: tx.spec.ts` (incluye `estimateGas` fallido y revert de RNF-25).

#### CA-RF-09 · Auto-carga
```gherkin
Dado una cartera existente en chrome.storage.local
Cuando se abre el popup
Entonces se muestra la cuenta activa y su saldo
Y no se solicita la frase semilla en ninguna pantalla
```
**Evidencia:** `E2E: 05-persistencia.spec.ts`.

#### CA-RF-10 · Restaurar estado
```gherkin
Dado el estado: cuenta activa 2, red X, 1 cuenta importada y 1 sesión de dApp
Cuando se cierra y se reabre el popup
Entonces se restauran los cuatro elementos con los mismos valores
```
**Evidencia:** `E2E: 05-persistencia.spec.ts` · `Vitest: state.spec.ts`.

#### CA-RF-11 · Reset wallet
```gherkin
Dado una cartera con mnemonic, cuentas importadas y sesiones
Y truekeate_pending_requests sin entradas pending y truekeate_inflight_tx vacío
Cuando el usuario pulsa «Reset wallet» y confirma el diálogo destructivo
Entonces chrome.storage.local no contiene mnemonic, cuentas ni sesiones
Y el popup vuelve al formulario inicial
Pero truekeate_logs se conserva (RF-32)
```
```gherkin
Dado truekeate_pending_requests con 2 entradas en estado pending
Cuando el usuario pulsa «Reset wallet»
Entonces el reset no se ejecuta y el popup muestra el error tipado -32000 de la causa «Reset bloqueado» (diccionario_datos.md §4.3; R-09b/DEC-46)
Y la UI indica que quedan 2 solicitudes y ofrece resolverlas (aprobar o rechazar) o esperar a que expiren
Y ninguna clave truekeate_* se ha borrado
```
```gherkin
Dado truekeate_inflight_tx con 1 transacción en vuelo vigente y la cola de solicitudes vacía
Cuando el usuario pulsa «Reset wallet»
Entonces el reset no se ejecuta y recibe el mismo error -32000 mientras la entrada siga vigente (TTL de 180 s)
```
**Evidencia:** `Vitest: reset.spec.ts — orden de comprobación: cola vacía → sin transacción en vuelo → confirmación destructiva → limpieza` · `Vitest: reset.spec.ts — bloqueo con 2 pending y con transacción en vuelo (-32000)` · `Vitest: reset.spec.ts — texto del diálogo destructivo en RNF-22` · `E2E: 06-reset.spec.ts — reset con la cola vacía y reset bloqueado con 2 pendientes`.

#### CA-RF-12 · Hint interactivo de Anvil
```gherkin
Dado el formulario de importación vacío
Cuando el usuario pulsa el hint de la frase de Anvil
Entonces el campo contiene exactamente las 12 palabras de prueba
Y el botón «Importar» queda habilitado
```
**Evidencia:** `E2E: 01-onboarding.spec.ts — hint Anvil`.

#### CA-RF-13 · Inyección del provider y alias `window.codecrypto`
```gherkin
Dado una página con un script que lee el provider en document_start
Cuando la página se carga
Entonces window.truekeate existe y window.truekeate === window.codecrypto
Y ambos exponen request, on y removeListener
Y en un iframe (all_frames: true) el provider también está presente
```
**Evidencia:** `Vitest: inject.spec.ts — alias window.codecrypto` · `E2E: 07-provider.spec.ts`. **Cierra H-15/P-16 (5 pts de la rúbrica).**

#### CA-RF-14 · `request` y catálogo de errores (sin `eth_sign`)
```gherkin
Dado el provider inyectado
Cuando la página llama a request con un método inexistente o con eth_sign
Entonces la promesa se rechaza con un objeto que tiene code 4200
Y el message está en español y coincide con el literal de la tabla §4.3 de `diccionario_datos.md` para la causa «Método fuera del catálogo» · `Vitest: errors.spec.ts — 4200 con el literal de §4.3`
Y ninguna llamada lanza una excepción síncrona
```
**Evidencia:** `Vitest: errors.spec.ts` (código 4200 de §2.1; literal de tabla §4.3 de `diccionario_datos.md`). **Cierra H-11a.**

#### CA-RF-15 · `on` / `removeListener` / `emit`
```gherkin
Dado un dApp suscrito con on('accountsChanged', cb)
Cuando el usuario cambia de cuenta en el popup
Entonces cb se invoca una vez con la nueva cuenta
Cuando el dApp ejecuta removeListener('accountsChanged', cb) y el usuario vuelve a cambiar
Entonces cb no se invoca
```
**Evidencia:** `E2E: 08-eventos.spec.ts`.

#### CA-RF-16 · `eth_requestAccounts`
```gherkin
Dado un origen no conectado
Cuando el dApp llama eth_requestAccounts
Entonces se abre connect.html con la lista de cuentas y sus saldos
Cuando el usuario elige la cuenta 2 y aprueba
Entonces la promesa resuelve ['0x…cuenta2']
Pero si el usuario rechaza, la promesa rechaza con code 4001
```
**Evidencia:** `E2E: 09-conectar.spec.ts`.

#### CA-RF-17 · `eth_accounts`
```gherkin
Dado un origen que nunca se ha conectado
Cuando el dApp llama eth_accounts
Entonces resuelve [] y no se abre ninguna ventana
Dado un origen ya conectado con la cuenta 2
Cuando el dApp llama eth_accounts
Entonces resuelve ['0x…cuenta2'] sin pedir permiso
```
**Evidencia:** `Vitest: accounts.spec.ts — RNF-11` · `E2E: 09-conectar.spec.ts`.

#### CA-RF-18 · Métodos de lectura
```gherkin
Dado Anvil escuchando en 127.0.0.1:8545
Cuando la dApp llama a los tres métodos de lectura
Entonces eth_chainId devuelve 0x7a69
Y eth_getBalance(cuenta 0) coincide con el saldo de Anvil
Y eth_blockNumber devuelve un entero mayor o igual que 1
```
**Evidencia:** `E2E: 07-provider.spec.ts` · `Comando: cast balance`.

#### CA-RF-19 · `eth_sendTransaction` con vista previa decodificada
```gherkin
Dado una transacción con data de un approve ilimitado hacia un contrato no reconocido
Cuando se abre notification.html
Entonces la vista previa muestra selector, nombre de función y parámetros legibles
Y etiqueta el destino como «contrato no reconocido»
Y muestra un aviso destacado por allowance ilimitada
Cuando el usuario aprueba
Entonces la dApp recibe el hash y la transacción se difunde
```
**Evidencia:** `E2E: 10-aprobar-tx.spec.ts` · `Vitest: calldata.spec.ts`. **Cierra H-11b (calldata).**

#### CA-RF-20 · `eth_signTypedData_v4` y `domainChainMismatch`
```gherkin
Dado un eth_signTypedData_v4 con domain.name y verifyingContract declarados
Cuando se abre la confirmación
Entonces se muestran domain, types, message, name y verifyingContract
Y si domain.chainId es distinto del activo aparece un aviso destacado en español
Y si verifyingContract no coincide con el contrato declarado aparece una advertencia
Y si se altera un byte del mensaje, la firma deja de verificar en el contrato Foundry
```
**Evidencia:** `E2E: 11-firmar-eip712.spec.ts` · `Vitest: typedData.spec.ts` · `Comando: forge test --root contracts --match-contract EIP712VerifierTest`. **Cierra H-11b (EIP-712) y H-40.**

#### CA-RF-21 · `personal_sign` (y retirada de `eth_sign`)
```gherkin
Dado un personal_sign con payload UTF-8
Cuando se abre la confirmación
Entonces se muestra el texto legible completo
Pero con un payload hexadecimal no decodificable aparece el aviso «contenido no legible»
Y eth_sign responde code 4200 sin abrir ninguna ventana
```
**Evidencia:** `Vitest: personalSign.spec.ts` · `E2E: 11-firmar-mensaje.spec.ts`. **Cierra H-11a y H-11b (personal_sign).**

#### CA-RF-22 · `wallet_switchEthereumChain` con aprobación (P-19)
```gherkin
Dado la red activa 31337 y una segunda red local (31338) dada de alta
Cuando la dApp llama wallet_switchEthereumChain con 31337 (la red ya activa)
Entonces la promesa resuelve sin cambiar nada y sin abrir ninguna ventana
Y no se crea ninguna entrada en truekeate_pending_requests
Cuando la dApp llama wallet_switchEthereumChain con 31338 (distinta de la activa)
Entonces se crea exactamente 1 entrada pending en truekeate_pending_requests y se abre notification.html
Y solo tras la aprobación eth_chainId devuelve 0x7a6a y todas las pestañas con provider reciben chainChanged con 0x7a6a
Pero si el usuario rechaza, la promesa rechaza con code 4001 y la red activa sigue siendo 31337
```
**Evidencia:** `E2E: 12-redes.spec.ts — aprobación del cambio de red` · `Vitest: networks.spec.ts — red ya activa`.
**EARS:** *Si* la red solicitada es la activa, *el sistema deberá* responder sin cambios y sin abrir ventana; *si* es distinta de la activa, *el sistema deberá* crear una solicitud `pending` en `truekeate_pending_requests` y esperar la aprobación del usuario en `notification.html` antes de cambiarla y emitir `chainChanged` (P-19).

#### CA-RF-23 · `wallet_addEthereumChain` y política de RPC (alta sin activación, P-22)
```gherkin
Dado un wallet_addEthereumChain con chainId 31338 y RPC local no dado de alta
Cuando llega la solicitud
Entonces se exige aprobación explícita del usuario y se solicita el permiso de host en runtime
Cuando el usuario aprueba
Entonces la red aparece en la lista con ese chainId
Pero la red activa sigue siendo la anterior y eth_chainId no cambia con el alta
Cuando la dApp llama después a wallet_switchEthereumChain con 31338
Entonces se crea 1 entrada pending en truekeate_pending_requests y se abre notification.html
Y solo tras esa segunda aprobación eth_chainId devuelve el id de la red nueva
Y con un RPC no https fuera de local, la solicitud se rechaza con error tipado
```
**Evidencia:** `E2E: 12-redes.spec.ts — alta sin activación y cambio posterior` · `Vitest: networks.spec.ts — add no cambia la red activa`. **Cierra H-36 (política de RPC arbitrario) y ADT-25/P-22 (el alta no activa la red; el cambio exige su propia aprobación, RF-22/`CA-RF-22`).**

#### CA-RF-24 · Propagación de eventos a todas las pestañas
```gherkin
Dado dos pestañas (A y B) con el provider conectado
Cuando el usuario cambia de cuenta en el popup
Entonces A y B reciben accountsChanged con la nueva cuenta
Y si el cambio se origina en la dApp de A, B también lo recibe
```
**Evidencia:** `E2E: 08-eventos.spec.ts — 2 pestañas`.

#### CA-RF-25 · Persistencia de conexión por origen con caducidad (D-B)
```gherkin
Dado el origen http://localhost:5174 conectado con la cuenta 2
Cuando se recarga test.html y se detiene el Service Worker
Entonces eth_accounts devuelve ['0x…cuenta2'] sin abrir connect.html
Y la sesión declara expiresAt = lastUsedAt + 86400000
Cuando el origen vuelve a usarse antes de las 24 h
Entonces lastUsedAt y expiresAt se renuevan (expiresAt = lastUsedAt + 86400000)
Pero si lastUsedAt tiene más de 24 h, eth_accounts devuelve [] y exige eth_requestAccounts
```
**Evidencia:** `E2E: 05-persistencia.spec.ts — sesión por origen y TTL 24 h` · `Vitest: sessions.spec.ts — renovación y vencimiento`.
**EARS:** *Cuando* una dApp autorizada use su sesión, *el sistema deberá* renovar `expiresAt = lastUsedAt + 86400000`; *si* transcurren 24 h sin uso, *entonces* la sesión se considerará vencida y `eth_accounts` devolverá `[]` (D-B, cierra ACU-17).

#### CA-RF-26 · Revocar permiso por origen
```gherkin
Dado un origen conectado con la cuenta 2
Cuando el usuario pulsa «Revocar permiso» en el popup
Entonces el origen recibe accountsChanged con []
Y un eth_accounts posterior resuelve [] y exige eth_requestAccounts
```
**Evidencia:** `E2E: 13-revocar.spec.ts`.

#### CA-RF-27 · Polling de saldos con ciclo definido
```gherkin
Dado el popup abierto con 1 cuenta visible y un contador RPC instrumentado
Cuando transcurren 5 s
Entonces el contador registra exactamente 1 eth_getBalance
Y a los 10 s el total es exactamente 2
Cuando el popup se cierra
Entonces no se registra ninguna llamada de polling adicional
```
**Evidencia:** `Vitest: polling.spec.ts — contador RPC` · `E2E: 14-polling.spec.ts`. **Cierra H-21 (disparador y parada).**

#### CA-RF-28 · Log de llamadas
```gherkin
Dado el popup cerrado y test.html abierto
Cuando la dApp llama eth_blockNumber
Entonces truekeate_logs contiene al menos 1 entrada con el método, el origen y el timestamp
```
**Evidencia:** `E2E: 15-logs.spec.ts` · `Vitest: logger.spec.ts`.

#### CA-RF-29 · Log de eventos
```gherkin
Dado el log activo
Cuando la extensión emite chainChanged
Entonces se añade exactamente 1 entrada con category event, el nombre del evento y el origen
```
**Evidencia:** `Vitest: logger.spec.ts — eventos`.

#### CA-RF-30 · Log de errores en rojo
```gherkin
Dado el log activo
Cuando se produce un rechazo del usuario (code 4001)
Entonces la entrada se renderiza en rojo
Y contiene el código 4001 y el mensaje de la tabla §4.3 de `diccionario_datos.md` para esa causa
```
**Evidencia:** `E2E: 15-logs.spec.ts — rojo`.

#### CA-RF-31 · Log de operaciones
```gherkin
Dado una transacción aprobada
Cuando la difusión termina
Entonces existe 1 entrada con estado pending y el hash 0x más 64 hex
Y al confirmarse, la misma entrada pasa a confirmada con el mismo hash
```
**Evidencia:** `E2E: 15-logs.spec.ts — operaciones` · `Vitest: txContract.spec.ts` (RNF-25).

#### CA-RF-32 · Historial persistente que sobrevive al reset
```gherkin
Dado un log con al menos 5 entradas
Cuando el usuario ejecuta resetWallet
Entonces las 5 últimas entradas siguen presentes
Y el número de entradas almacenadas nunca supera 500
```
**Evidencia:** `Vitest: logger.spec.ts — reset`.

#### CA-RF-33 · Validación de formularios
```gherkin
Dado el formulario de envío o de importación
Cuando introduzco una dirección inválida, un valor mayor que el saldo, una frase con checksum erróneo o una clave privada de 63 hex
Entonces cada caso muestra su mensaje inline en español
Y la operación no se envía en ningún caso
```
**Evidencia:** `Vitest: validation.spec.ts` · `E2E: 16-validacion.spec.ts`.

#### CA-RF-34 · UI en español y formatos
```gherkin
Dado cualquier pantalla de la extensión
Cuando se inspecciona el texto visible
Entonces todo está en español
Y los importes de ETH se muestran con 4 decimales
Y las direcciones se abrevian como 0x1234…abcd
```
**Evidencia:** `E2E: 17-i18n.spec.ts — formato y abreviación` · `Vitest: src/popup/i18n.spec.ts` (regla corregida en la v2.0: se comprueba el **texto visible** del AST —texto JSX, atributos y literales de cadena— y se **eximen** los identificadores del API como `chrome.runtime.sendMessage`).

#### CA-RF-35 · `notification.html` anti-phishing y ventana global única (P-21)
```gherkin
Dado el popup abierto
Cuando un origen solicita una firma
Entonces se abre exactamente una ventana notification.html, con foco y en primer plano
Y la ventana muestra el origen solicitante con su favicon
Y solo ofrece «Aprobar» y «Rechazar»
Cuando un segundo origen solicita otra firma mientras la primera sigue pendiente
Entonces no se abre una segunda ventana: notification.html es una sola ventana global
Y la segunda solicitud queda en la cola visible con el contador de pendientes en 2
Pero la ventana nunca muestra dos solicitudes a la vez
```
**Evidencia:** `E2E: 10-aprobar-tx.spec.ts — foco, origen y ventana única global` · `E2E: 18-concurrencia.spec.ts — 2 pendientes y contador`. **Cierra H-35 y ADT-22/P-21 (una sola ventana global con cola y contador, DEC-38).**

#### CA-RF-36 · `connect.html`
```gherkin
Dado un eth_requestAccounts desde test.html
Cuando se abre connect.html
Entonces la lista muestra todas las cuentas con su saldo actual
Y al elegir una se comparte exactamente esa dirección
Pero si el usuario cancela, la dApp recibe code 4001
```
**Evidencia:** `E2E: 09-conectar.spec.ts`.

#### CA-RF-37 · Cola persistida de solicitudes
```gherkin
Dado el popup con la cola de solicitudes vacía
Cuando dos orígenes distintos envían una firma cada uno
Entonces truekeate_pending_requests contiene 2 entradas con claves approvalId distintas
Y resolver la primera no elimina ni altera la segunda
Y el puerto chrome.runtime.connect es el canal de respuesta, no un keep-alive: el Service Worker puede suspenderse a los 30 s de inactividad
Y tras 30 s de inactividad, un RESUME con el mismo approvalId obtiene respuesta en menos de 200 ms
Y el vencimiento se rearma con chrome.alarms y la cola se reconstruye por reconciliación al arrancar
```
**Evidencia:** `Vitest: approvalQueue.spec.ts` · `E2E: 18-concurrencia.spec.ts`. **Cierra H-02 y H-08.**

#### CA-RF-38 · Badge contador
```gherkin
Dado 0 solicitudes pendientes
Cuando llegan 2 solicitudes
Entonces el badge del icono muestra 2
Y al resolverse una pasa a 1, y al resolverse la última desaparece
```
**Evidencia:** `E2E: 19-badge.spec.ts`.

#### CA-RF-39 · Notificaciones de Chrome (permiso opcional, ciclo posterior)
```gherkin
Dado el permiso notifications declarado en optional_permissions y todavía no concedido
Cuando la extensión intenta mostrar una notificación sin haberlo solicitado en runtime
Entonces no se muestra ninguna notificación y la solicitud sigue pendiente sin error visible
Cuando el usuario concede el permiso en runtime (chrome.permissions.request) y llega una solicitud
Entonces se muestra 1 notificación de Chrome con el origen
Pero descartar la notificación no resuelve la solicitud pendiente
```
**Evidencia:** `E2E: 20-notificaciones.spec.ts` · `Vitest: manifest.spec.ts — notifications solo en optional_permissions`. **Cierra ADT-30/DEC-44 (RF-39 pertenece al ciclo posterior y su permiso es opcional).**

#### CA-RF-40 · Timeout con dueño único en el Service Worker
```gherkin
Dado una firma pendiente creada en t0, con expiresAt = t0 + 120000 y el SW como dueño del plazo
Cuando el reloj avanza 120 s (con el SW dormido entre medias y despertado por chrome.alarms)
Entonces el SW cierra notification.html, marca la solicitud expired y purga el badge
Y la página recibe un error EIP-1193 con code 4001 y el mensaje que la tabla §4.3 de `diccionario_datos.md` fija para la causa «vencimiento del plazo»
Y para una conexión el plazo es de 60 s
```
**Evidencia:** `Vitest: approvalTimeout.spec.ts` (fake timers + `chrome.alarms`). **Cierra H-02 y H-07.**

#### CA-RF-41 · Cierre y reconciliación de la cola
```gherkin
Dado una solicitud pendiente en la cola persistida
Cuando el usuario aprueba o rechaza
Entonces la ventana se cierra, la entrada desaparece de la cola y el badge se recalcula
Y si el SW se reinicia en mitad del flujo, al arrancar reasocia la solicitud por approvalId sin duplicarla ni dejarla huérfana
```
**Evidencia:** `E2E: 10-aprobar-tx.spec.ts` · `Vitest: approvalReconcile.spec.ts`. **Cierra H-02.**

#### CA-RF-42 · EIP-1559
```gherkin
Dado Anvil en marcha
Cuando la wallet firma cualquier transacción
Entonces el recibo tiene type 2
Y maxFeePerGas y maxPriorityFeePerGas son mayores que 0
Y el recibo es type 2
Y al inyectar otro feeData en el provider falso cambian los valores de la transacción (procedencia observable)
```
**Evidencia:** `Vitest: eip1559.spec.ts — feeData inyectado en provider falso` · `E2E: 04-enviar.spec.ts — recibo type 2 y maxFeePerGas > 0`.

#### CA-RF-43 · EIP-155
```gherkin
Dado un eth_sendTransaction
Cuando la wallet firma
Entonces el chainId de la firma es el de la red activa (v = chainId*2+35 o chainId*2+36)
Pero una transacción con chainId distinto del activo se rechaza con error tipado
```
**Evidencia:** `Vitest: eip155.spec.ts`.

#### CA-RF-44 · EIP-6963 con re-anuncio
```gherkin
Dado inject.js cargado de forma síncrona en document_start
Cuando la dApp registra su listener de eip6963:announceProvider después de DOMContentLoaded y emite eip6963:requestProvider
Entonces recibe un announceProvider con uuid fijo, name «TrueKeate», icon en data-URI y rdns academy.codecrypto.truekeate
Y detail.provider es window.truekeate
```
**Evidencia:** `E2E: 21-eip6963.spec.ts`. **Cierra H-31 (re-anuncio y listener síncrono).**

#### CA-RF-45 · EIP-1193
```gherkin
Dado el provider inyectado
Cuando se inspecciona su interfaz
Entonces expone request, on y removeListener
Y los códigos 4001, 4100, 4200, 4900 y 4901 se mapean a objetos EIP-1193 con `code` de §2.1 y el `message` de la tabla §4.3 de `diccionario_datos.md`
```
**Evidencia:** `Vitest: eip1193.spec.ts`.

#### CA-RF-46 · dApp de pruebas
```gherkin
Dado test.html servido en http://localhost:5174 con la extensión cargada
Cuando el usuario recorre los 7 flujos: detectar, conectar, saldo, enviar, EIP-712, cambiar red y eventos
Entonces cada flujo muestra en pantalla su resultado (hash, firma, chainId o error)
Y los 7 flujos pintan su resultado en menos de 5000 ms medidos con performance.now() desde el clic, sin quedar ninguno en blanco ni sin respuesta
```
**Evidencia:** `E2E: 22-dapp.spec.ts`.

#### CA-RF-47 · Historial de la dApp
```gherkin
Dado test.html tras ejecutar 3 operaciones
Cuando se revisa el historial
Entonces hay 3 filas con la operación y su resultado
Y la última respuesta se muestra como JSON completo sin recortar
```
**Evidencia:** `E2E: 22-dapp.spec.ts — historial`.

#### CA-RF-48 · Pantalla «Acerca de»
```gherkin
Dado el popup recién abierto
Cuando el usuario abre «Acerca de»
Entonces se muestra el logotipo horizontal de TrueKeate
Y la tagline exacta PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS
```
**Evidencia:** `E2E: 23-marca.spec.ts`.

#### CA-RF-49 · Aplicación de la identidad visual
```gherkin
Dado popup, connect, notification y la dApp
Cuando se inspeccionan encabezados y estilos
Entonces los encabezados usan el degradado de marca y el isologo
Y las tipografías son Poppins, Inter y JetBrains Mono auto-hospedadas
Y el número de colores literales fuera de tokens.css es 0
```
**Evidencia:** `Comando: grep -rnE "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(|linear-gradient|radial-gradient|font-family:" src --exclude=tokens.css` → 0 coincidencias · `E2E: 23-marca.spec.ts — identidad en las 3 ventanas y la dApp`.

#### CA-RF-50 · Revelar y exportar la semilla y las claves privadas (D-13, P-20)
```gherkin
Dado el popup con cartera y sin ningún valor sensible visible
Cuando el usuario abre «Revelar frase semilla» o «Exportar clave privada» de una cuenta
Entonces el sistema muestra una advertencia de riesgo y exige una confirmación explícita
Y mientras no confirme, el valor permanece oculto (ofuscado)
Cuando el usuario confirma
Entonces el valor se revela durante 30 s y se vuelve a ocultar automáticamente
Y también se oculta de inmediato si la ventana pierde el foco
Y copiar la semilla al portapapeles está permitido mientras el valor está revelado
Pero al ocultarse (por plazo o por pérdida de foco), el sistema borra el portapapeles si aún contiene la semilla
Y el valor nunca se envía a ninguna página por window.postMessage ni queda registrado en truekeate_logs
Y si el usuario cancela la confirmación, no se revela ni se exporta nada
```
```gherkin
Dado una cuenta con una sesión vigente en truekeate_connected_sites (o el mnemonic, alguna de cuyas cuentas derivadas la tiene)
Cuando el usuario abre «Revelar frase semilla» o «Exportar clave privada»
Entonces la operación se rechaza con el error tipado -32000 de la causa «Cuenta en uso por una dApp conectada» (diccionario_datos.md §4.3; R-09a/DEC-45)
Y no se muestra ni se entrega el valor y ninguna entrada de truekeate_logs lo contiene
```
**Evidencia:** `Vitest: secretsExport.spec.ts — confirmación, ocultación por defecto, 30 s, ocultado por pérdida de foco, borrado del portapapeles y no postMessage` · `Vitest: secretsExport.spec.ts — bloqueo con sesión de dApp activa (-32000)` · `E2E: 25-recuperacion.spec.ts — revelado temporal, ocultado al perder el foco y portapapeles sin la semilla`.
**EARS:** *El sistema deberá* exigir **confirmación explícita** del usuario antes de revelar o exportar la frase semilla BIP-39 o una clave privada; *el sistema no deberá* exponer nunca esos valores por `window.postMessage` ni a la página web; *cuando* el usuario confirme, *el sistema deberá* advertir del riesgo y mostrar el valor solo de forma temporal (**30 s**) o hasta que la ventana pierda el foco, permaneciendo **oculto por defecto**; *cuando* el valor se oculte, *el sistema deberá* **borrar el portapapeles** si aún contiene la semilla; *si* la cuenta —o alguna cuenta derivada del mnemonic revelado— tiene una **sesión de dApp vigente** en `truekeate_connected_sites`, *entonces* *el sistema deberá* **bloquear** la operación con `-32000` y no entregar el valor hasta que se revoque ese permiso (**R-09a/DEC-45**). **Cierra D-13 (P-18), RNF-22 (H-25), ADT-09/P-20 (higiene del revelado y portapapeles, DEC-37) y R-09a (DEC-45).**

### 9.3 Criterios de aceptación de los RT (notación EARS)

#### CA-RT-01 · Stack UI (EARS)
*El sistema deberá* construir su interfaz y su build exclusivamente con React 19, TypeScript 5.9 y Vite 7. *Cuando* se ejecute `npm ls react typescript vite`, las versiones mayores serán 19, 5.9 y 7.
**Evidencia:** `Comando: npm ls react typescript vite`.

#### CA-RT-02 · Única librería criptográfica (EARS)
*Mientras* el código realice operaciones de mnemonic, HD, firma, provider o serialización, *el sistema deberá* usar únicamente `ethers.js v6`.
**Evidencia:** `Comando: npm ls ethers` (solo ethers como dependencia criptográfica) · `Comando: grep -rn "from 'ethers'" src/popup` → 0 coincidencias.

#### CA-RT-03 · Prohibiciones (EARS)
*Si* el código propio incluye `viem`, `@scure/bip39`, `@metamask/*`, `axios` o una llamada `fetch` directa, *entonces* el lint de prohibiciones fallará el build.
**Evidencia:** `Comando: npm run lint:prohibited`.

#### CA-RT-04 · Plataforma MV3, permisos mínimos y RPC (EARS)
*El sistema deberá* generar un `manifest.json` MV3 con Service Worker de tipo módulo, content script e inject script. *Si* un permiso (`tabs`, `activeTab`, `scripting`) no se usa, *entonces* no se declarará. *El sistema deberá* declarar en `permissions` **exactamente** `["storage", "alarms", "favicon", "clipboardRead", "clipboardWrite"]` —`favicon` para el **icono de origen de la dApp** en `notification.html` (RF-35) y `clipboardRead`/`clipboardWrite` para la **política de portapapeles del revelado** (RF-50, P-20)— y *no deberá* declarar ningún permiso fuera de ese conjunto. *El sistema deberá* declarar `notifications` únicamente en **`optional_permissions`** y solicitar ese permiso en runtime cuando se active RF-39. *Cuando* la dApp dé de alta una red cuyo host no esté declarado, *el sistema deberá* solicitar el permiso en runtime o rechazar la solicitud con error tipado.
**Evidencia:** `Vitest: manifest.spec.ts` · `Inspección: dist/manifest.json (permissions = storage, alarms, favicon, clipboardRead, clipboardWrite; notifications solo en optional_permissions)` · `E2E: 12-redes.spec.ts — permiso de host en runtime`. **Cierra H-36 (permisos y política de RPC), ADT-30/DEC-44 (`notifications` como permiso opcional ligado a RF-39) y `VR-01` (conjunto de permisos idéntico en los cuatro documentos).**

#### CA-RT-05 · Build y manifest generado (EARS)
*Cuando* se ejecute `npm run build`, *el sistema deberá* generar `manifest.json` desde `src/manifest.ts` e incluir el bundle de ethers localmente, sin URLs de CDN.
**Evidencia:** `Comando: npm run build` + `grep` de `http` en `dist/`.

#### CA-RT-06 · Red de pruebas Anvil (EARS)
*Mientras* Anvil escuche en `127.0.0.1:8545`, *el sistema deberá* responder `eth_chainId` = `0x7a69` y no tener Sepolia entre las redes dadas de alta.
**Evidencia:** `Comando: anvil` · `E2E: 07-provider.spec.ts`.

#### CA-RT-07 · Frameworks de prueba (EARS)
*El sistema deberá* pasar `npm run test` (Vitest), `npm run test:e2e` (Playwright con `dist/`) y `forge test` (`EIP712Verifier.sol`) antes de cerrar cada hito.
**Evidencia:** `Comando: npm run test && npm run test:e2e && forge test --root contracts --match-contract EIP712VerifierTest`.

#### CA-RT-08 · Tipos (EARS)
*Cuando* se ejecute `tsc -b`, *el sistema deberá* compilar con `@types/chrome` y `@types/node` instalados y sin `any` implícitos.
**Evidencia:** `Comando: npx tsc -b`.

#### CA-RT-09 · Despliegue local (EARS)
*El sistema deberá* distribuirse 100 % en local: artefacto `dist/` y dApp servida en `http://localhost:5174`; *no deberá* existir despliegue remoto.
**Evidencia:** `Inspección: dist/ y vite.config.ts (port 5174, strictPort)` · `Comando: grep -rn "https://" dist/` → 0 despliegues remotos.

#### CA-RT-10 · Idioma (EARS)
*El sistema deberá* escribir la UI, los mensajes de error y la documentación en español, y los identificadores de código en inglés.
**Precisión de la regla (v2.0, corrección `D-H2-A` de H2):** el criterio apunta SOLO al **texto visible** para el usuario (nodos de texto JSX, atributos JSX y literales de cadena). Los **identificadores del API y los nombres de propiedades** (`chrome.runtime.sendMessage`, `{ confirm: true }`, `settings.language`) son código en inglés y quedan **exentos**: la formulación anterior, un `grep -rniE "(send|cancel|copy|confirm)"` sobre cualquier aparición, los prohibía también a ellos —empujó a ofuscar el API real del runtime y rompió el popup— y además marcaba palabras españolas correctas como «confirmación» (subcadena `confirm`) y comentarios.
**Evidencia:** `Vitest: src/popup/i18n.spec.ts` — recorre el AST de `src/popup`, `src/connect` y `src/notification` y exige 0 coincidencias de `send|cancel|copy|confirm|settings` (con límites de palabra) en el texto visible; incluye control positivo, control de no-regresión de los identificadores del API y el recuento de ficheros cubiertos · `E2E: 17-i18n.spec.ts — textos visibles en español`.

#### CA-RT-11 · Contrato auxiliar Foundry (EARS)
*Cuando* `forge test` verifique una firma EIP-712 producida por la wallet, `verify` *deberá* devolver `true`; *si* se altera un byte del mensaje, *entonces* deberá devolver `false`.
**Evidencia:** `Comando: forge test --root contracts --match-contract EIP712VerifierTest`.

#### CA-RT-12 · Activos, tipografías y licencias (EARS)
*El sistema deberá* servir los activos en `public/brand/`, los iconos en `public/icons/` y las fuentes woff2 (subconjunto latin) en `public/fonts/`, con los `LICENSE-*.txt` OFL-1.1 correspondientes y sin peticiones a CDN. *De acuerdo con* DEC-15, el titular del proyecto autorizó el uso y la redistribución de los activos de marca TrueKeate.
**Evidencia:** `Inspección: árbol public/ y git ls-files LICENSE NOTICE public/fonts/*.txt` (5 ficheros de licencia).

#### CA-RT-13 · Nomenclatura e identidad estable del paquete (EARS)
*El sistema deberá* exponer `window.truekeate` con el alias `window.codecrypto` (el mismo objeto), usar el prefijo `truekeate_` y los tipos `TRUEKEATE_*`, y publicar en EIP-6963 el `name` `TrueKeate`, el `rdns` `academy.codecrypto.truekeate` (**fuente de verdad de EIP-6963: RT-13, D-A**) y un **UUID v4 literal y congelado** (nunca generado en runtime). *El sistema deberá* incluir una **`key` fija** en el `manifest.json` generado para estabilizar el **ID de la extensión** entre equipos y reinstalaciones. *Si* alguna cadena de código conserva el prefijo heredado `codecrypto_`, *entonces* el `grep` de nomenclatura fallará.
**Evidencia:** `Vitest: naming.spec.ts` · `Comando: grep -rn "codecrypto_" src/` → 0 coincidencias · `E2E: 07-provider.spec.ts — ID de extensión estable entre ejecuciones`. **Cierra ADT-19/DEC-43 (UUID literal y `key` fija para la allowlist CORS de RE-04 y la reproducibilidad de los E2E).**

### 9.4 Cobertura del anexo (H-01 · RNF-01)

| Familia | Criterios | Must | Should | Con evidencia declarada |
|---|---|---|---|---|
| RF | **50** (`CA-RF-01`..`CA-RF-50`) | 40 | 10 | 50 / 50 |
| RT | **13** (`CA-RT-01`..`CA-RT-13`) | — | — | 13 / 13 |
| RNF | **25** (criterio en la tabla de §2 y en §2.1..§2.6; los literales de mensaje remiten a `diccionario_datos.md` §4.3) | — | — | 25 / 25 |

**Matriz de trazabilidad única (RNF-01):** `E-xx → RF-xx → CA/CU → test`. Su versión completa se materializa en `casos_uso/` (Fase 2) tomando como columna `CA/CU` las etiquetas `CA-RF-xx` de este anexo; la parte `E-xx → RF-xx` ya está declarada en §1 y §1.0.