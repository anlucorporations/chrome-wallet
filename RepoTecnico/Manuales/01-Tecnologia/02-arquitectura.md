# 02 — Arquitectura por módulos (M1..M66)

Propósito: describir módulo a módulo, con la RUTA REAL de cada fichero, qué responsabilidad tiene,
qué requisitos declara y qué superficie pública expone. Cada responsabilidad se apoya en la cabecera
JSDoc real del fichero, citada como `ruta:línea` (sin ruta = mismo fichero del encabezado). Lo no
verificado se marca «pendiente de confirmar».

## Vista de pájaro — capas reales y sentido de las dependencias

El árbol normativo (`RepoTecnico/documento_tecnico.md:270`, sección 2.4) declara **66 módulos
M1..M66**; el `src/` real tiene **94 ficheros de producción** y **60 specs** (véase §3.4).

| # | Capa | Módulos |
|---|---|---|
| 1 | Manifest y build | M1 |
| 2 | Service Worker (raíz) | M2 |
| 3 | Núcleo RPC (router, catálogo, cliente, errores, tx) | M3, M3.b, M4, M4.a, M4.b, M5, M6, M7 |
| 4 | Criptografía (BIP-39, HD, firma, revelado, integridad) | M8..M13 |
| 5 | Aprobaciones (cola, plazo, ventana, previews, calldata) | M14, M14.b, M14.c, M15..M19.b, M66 |
| 6 | Seguridad (`sender`, nivel de acceso, redacción, hash) | M20, M21, M22, M22.a |
| 7 | Redes, sesiones y eventos | M23..M27 |
| 8 | Cuentas, ajustes, logs y estado | M28..M34 |
| 9 | Inyección en la página | M35..M38 |
| 10 | UI del popup | M39..M47 |
| 11 | UI de conexión (`connect.html`) | M48, M49 |
| 12 | UI de confirmación (`notification.html`) | M50..M54 |
| 13 | Capa compartida | M55..M63 |
| 14 | Estilos | M64, M65 |
| 15 | dApp de pruebas (`test.html` sobre Anvil) | fuera de `src/` |

**Sentido de las dependencias.** RNF-14 manda: el bundle de `ethers` vive SOLO en el Service Worker,
así que la UI no importa ni `ethers` ni `src/background/**`. Verificado con `grep` de `from 'ethers'`
en `src/popup/**`, que no devuelve ninguna coincidencia; la prohibición se declara en
`src/popup/main.tsx:3`, `src/popup/App.tsx:23`, `src/popup/walletState.ts:6`,
`src/popup/views/SendView.tsx:18` y `src/popup/hooks/useBalancePolling.ts:20`.

```
inject/**          ──► shared/**
content-script.ts  ──► shared/** ──► chrome.runtime ──► background.ts (M2)
popup/**           ──► shared/**     (NUNCA background/**, NUNCA ethers)  [RNF-14]
connect/**         ──► shared/** + popup/walletState (tipos de fila)
notification/**    ──► shared/**
background/**      ──► ethers + shared/** + chrome.*
```

Existe una **inversión deliberada**: `src/shared/validation/*` (M58..M61), creados para que el popup
valide sin `ethers`, importan los constructores de error del SW
(`src/shared/validation/address.ts:23`, `mnemonic.ts:20`, `amount.ts:27`, `privateKey.ts:21`) porque
la tabla de literales de §4.3 tiene una sola fuente. Es dependencia de constructores puros, no de
criptografía.

## Capa 1 — Manifest y build
### M1 `src/manifest.ts`
#### Detalle
Fuente única del manifest MV3, que no se escribe a mano (`:2`); RF-13, RF-23 y RNF-04 (`:7`). El manifest lo
genera el plugin `closeBundle` de `vite.config.ts` (`:3`); `EXTENSION_ID` deriva de `MANIFEST_KEY` (`:21`,
`:31`).

## Capa 2 — Service Worker (raíz)
### M2 `src/background.ts`
#### Detalle
Punto de entrada del Service Worker ESM (`:2`); RF-09, RF-10, RF-13, RF-15, RF-24, RF-37 y RF-41 (RNF-08,
RNF-10) (`:28`). Orden de arranque: `setAccessLevel` (M21) → migraciones (M34) → integridad (M13) → auto-carga
(M33) → reconciliación (M16) → UNA entrada `sw_started` (`:6`); los canales `onConnect`/`onMessage` se registran
de forma síncrona antes del primer `await` (`:19`).

## Capa 3 — Núcleo RPC
### M3 `src/background/rpc/router.ts`
#### Detalle
Despachador del canal interno `TRUEKEATE_RPC` (`:2`); requisitos pendientes de confirmar (cita §3.7 y §4.2 del
diccionario, `:6`). Orden de controles: redacción (M22) → guarda de `sender` (M20) → unión cerrada (M56) +
catálogo (M4) → allowlist de contextos → *token bucket* (M3.b) → 6 aprobables (M19.b) → despacho interno y de
lecturas (`:9`).
### M3.b `src/background/rpc/rateLimit.ts`
#### Detalle
*Token bucket* por origen de TODO el catálogo, persistido en `truekeate_rate_windows` (`:2`); RF-28 (RNF-16)
(`:24`). Ventana de 6 solicitudes/60 s que cubre también las lecturas; persistido, así que sobrevive a la
suspensión del SW; al exceder responde `4001` sin abrir ventana; `origin === 'extension'` no consume tokens;
escritura diferida con `RATE_PERSIST_DEBOUNCE_MS` (`:8`).
### M4 `src/background/rpc/catalog.ts`
#### Detalle
Catálogo RPC CERRADO con los 16 internos `wallet_*` y las 10 lecturas de página (`:2`); requisitos pendientes de
confirmar (cita §5.1.1, §2.5 y §4.2/§4.3). `eth_sign` NO está y nunca se añadirá (DEC-22/H-11a);
`wallet_revokePermissions` es el único con doble contexto; ningún interno abre la ventana única (P-21) (`:17`).
### M4.a `src/background/rpc/internalMethods.ts`
#### Detalle
Lista CERRADA de internos `wallet_*` de §5.1.1 v1.7, en módulo HOJA (`:2`); RF-14 y RF-45 (RNF-10) (`:22`).
Antes vivía en `catalog.ts` y cerraba el ciclo `catalog → sessions → senderGuard → catalog`, que hacía responder
`-32603` a CUALQUIER petición (`:7`).
### M4.b `src/background/rpc/pageMethods.ts`
#### Detalle
Catálogo CERRADO de los métodos de PÁGINA EIP-1193, las 10 lecturas de H3 (`:2`); requisitos pendientes de
confirmar (cita §3.2 y §4.3). `eth_accounts` NUNCA abre ventana y renueva `expiresAt = lastUsedAt + 86400000`
(DEC-31); `eth_requestAccounts` abre `connect.html` (420×650) solo sin sesión vigente; sin estado propio
(`:19`).
### M5 `src/background/rpc/client.ts`
#### Detalle
UN ÚNICO `JsonRpcProvider` de `ethers` para todo el tráfico, con política CERRADA de reintentos (`:2`);
requisitos pendientes de confirmar (cita §2.3, ADT-23). 1 intento + 3 reintentos = 4 llamadas, backoff 1/2/4 s y
timeout de 5 s por intento, no ajustable desde la UI (`:11`); agotados los intentos lanza siempre `4900
rpcUnavailable` de M6 (`:13`).
### M6 `src/background/rpc/errors.ts`
#### Detalle
Catálogo de códigos EIP-1193 y construcción de los objetos de error (`:2`); ACU-05/D-E y RNF-06 — todo error
visible lleva `code` numérico (`:22`). Transcribe §4.3 en cuatro bloques (núcleo de 25 filas, v1.9/H2 de 7,
v1.10/H4 de 2 y v1.11/H5 de 3) sobre **8 códigos** (`:9`).
### M7 `src/background/rpc/txContract.ts`
#### Detalle
Contrato observable de la transacción (§3.6) (`:2`); RNF-25 y §3.1 reglas 1, 6 y 8 (`:3`). `eth_sendTransaction`
devuelve el HASH sin esperar recibo; la estimación precede a la ventana (si falla, `-32000 estimateGasFailed` y
no se abre nada); estados `pending → confirmed / reverted / failed`; reutiliza M5 (`:6`); `txLogEntryFor` da
exactamente una entrada por transición (`:15`).

## Capa 4 — Criptografía (solo Service Worker)
### M8 `src/background/crypto/mnemonic.ts`
#### Detalle
BIP-39 en el SW —generación (128 bits → 12 palabras), normalización y checksum— (`:2`); requisitos pendientes de
confirmar (cita §2.4 M8, §3.3 y tareas 2.1/2.2). La normalización y el recuento son de M59; M8 añade la
pertenencia a las 2048 palabras y el checksum (`:9`); el valor nunca se registra y para logs existe
`mnemonicFingerprint` (`:14`).
### M9 `src/background/crypto/hd.ts`
#### Detalle
Derivación HD de las cuentas (`:2`); requisitos pendientes de confirmar (cita §2.4 M9, §3.3 y tareas 2.4/2.13).
Ruta vinculante `m/44'/60'/0'/0/i`, con `i` = índice de `truekeate_accounts` (DEC-11) y 5 cuentas por defecto
(`:6`); las claves que expone no salen del SW salvo por el revelado de RF-50 (M12) y NUNCA van a
`truekeate_logs` (`:12`).
### M10 `src/background/crypto/importAccount.ts`
#### Detalle
Importación de una cuenta por clave privada (`:2`); requisitos pendientes de confirmar (cita §2.4 M10, §3.3,
tarea 2.5 y CU-03). Valida `0x` + 64 hex en el rango de secp256k1 (M61), calcula la dirección con
`computeAddress` y la devuelve con checksum EIP-55, que es la forma persistida (`:6`); el material sensible
nunca se registra (`:10`).
### M11 `src/background/crypto/sign.ts`
#### Detalle
ÚNICA VÍA DE FIRMA; ninguna otra parte firma ni toca la clave privada (`:3`); §3.4 reglas 1, 2, 4 y 5, §3.6 y
tarea 4.9 (`:5`). Firma EIP-1559 tipo 2 con comisiones siempre > 0 y `chainId` dentro de la firma; EIP-155
legada con `v = chainId * 2 + 35/36`; EIP-712 eliminando `EIP712Domain` de `types`; `personal_sign` con el
prefijo `\x19Ethereum Signed Message:\n<longitud>` (`:9`); red ajena RECHAZADA con `4901` sin firmar (`:25`).
### M12 `src/background/crypto/secrets.ts`
#### Detalle
Revelado y exportación del material de recuperación (RF-50) con la higiene de P-20 y la guarda de sesión de dApp
(R-09a/DEC-45) (`:2`); RF-50, §3.8, §3.10 y tareas 2.7/2.9 (`:6`). Confirmación explícita obligatoria; solo
contextos de confianza con ruta en allowlist; guarda `-32000` con sesión vigente; higiene de 30 s
(`REVEAL_HIDE_MS`) con ocultado por pérdida de foco y borrado del portapapeles (`:10`); el popup NO debe
importarlo porque arrastraría `ethers` (RNF-14) —M46 lo consume por `wallet_revealSecret`— (`:24`).
### M13 `src/background/crypto/integrity.ts`
#### Detalle
Integridad de la cartera al arrancar (`:2`); RNF-22, con §2.4 M13 y §3.3 (`:3`). Checksum BIP-39 o EIP-55
inválidos dejan el estado en «wallet dañada», con CERO derivaciones silenciosas —`derivations` es siempre `0`—
(`:6`); el informe devuelve además un error tipado de M6 (`:17`).

## Capa 5 — Aprobaciones
### M14 `src/background/approvals/queue.ts`
#### Detalle
Cola persistida `truekeate_pending_requests` como `Record<approvalId, PendingRequest>` (`:2`; su cabecera usa un
guion largo mal codificado, `M14 â€”`, sin efecto funcional); requisitos pendientes de confirmar (cita §2.8,
§2.12, §2.13, §3.9 y §2.3/§3.1, `:7`). RMW serializado con `withRmwLock`; único escritor el SW; cardinalidad 8
globales / 1 por origen / 6 por minuto; cota de payload de 64 KiB; serialización por cuenta con
`truekeate_inflight_tx`; cero temporizadores (`:14`).
### M14.b `src/background/approvals/decisions.ts`
#### Detalle
Registro de ESPERA de la decisión de una solicitud (`:2`); RF-37 y RF-41 (RNF-08) (`:25`). `chrome.storage` no
puede resolver una promesa, así que este es el punto ÚNICO donde se resuelve, por cualquiera de las tres vías de
cierre —`SIGN_RESPONSE`, la X o el vencimiento— (`:6`); el mapa de esperas es volátil y nunca se persiste
(`:21`).
### M14.c `src/background/approvals/responses.ts`
#### Detalle
Decisión del usuario por el canal `SIGN_RESPONSE` de `notification.html` (`:3`); tareas 4.1/4.3, §3.1 y §4.2
(`:4`). Allowlist de ruta —solo `notification.html` decide—; respuestas duplicadas se ignoran (X-06); rechazo y
vencimiento → `4001`; la misma ventana pasa a la siguiente o se cierra (`:14`).
### M15 `src/background/approvals/timeout.ts`
#### Detalle
Dueño ÚNICO del plazo, con `chrome.alarms` (`:2`); RF-37, RF-40 y RF-41 (RNF-06, RNF-08) (`:25`). `expiresAt =
createdAt + SIGN_TIMEOUT_MS` (120 000 ms) o `+ CONNECT_TIMEOUT_MS` (60 000 ms);
`chrome.alarms.create('truekeate_expire:<approvalId>', { when })`; prohibidos `setTimeout` y `setInterval`;
vencimiento con `errorCode: 4001` persistido (`:12`).
### M16 `src/background/approvals/reconcile.ts`
#### Detalle
Reconciliación al arrancar el SW (`:2`); requisitos pendientes de confirmar (cita H-02, ACU-21, ADT-23/D-R y los
7 pasos de §3.4, `:6`). Una sola lectura de cuatro claves; purga de no-`pending`/vencidas; `4001` a huérfanas;
rearme de alarmas; reconstrucción de `truekeate_inflight_tx` y de `truekeate_rate_windows` reutilizando M3.b;
ventana única; UNA entrada `sw_reconcile` (`:12`); cota < 1 s con 50 pendientes (`:26`).
### M17 `src/background/approvals/ports.ts`
#### Detalle
Puerto de larga vida `truekeate_approval` —registro de puertos, `RESUME { approvalId }` y entrega de la
respuesta— (`:2`); requisitos pendientes de confirmar (cita §2.3 y §2.5.1). El puerto es transporte y
correlación, NO *keep-alive* (ADT-15/R16); el `RESUME` lleva la solicitud COMPLETA con las tres previews;
recuperación puerto vivo → pestaña viva con `frameId` exacto → descarte trazado; `portsByApprovalId` es volátil
(`:12`).
### M18 `src/background/approvals/focus.ts`
#### Detalle
Ventana de decisión GLOBAL ÚNICA (`notification.html`, P-21) —abrir o reutilizar por `windowId`, re-descubrir
por URL y mostrar la `pending` más antigua con su contador— (`:3`); requisitos pendientes de confirmar (cita
§2.3, §3.1 regla 4 y §2.14/§3.8, `:7`). Como máximo UNA `notification.html`; `shownApprovalId` es SIEMPRE la
`pending` más antigua (FIFO); cerrar con la X equivale a `4001` salvo vencimiento; estado persistido en
`truekeate_approval_window` (`:14`); se toma SIEMPRE `focusLock` antes que el `rmwLock` de M14 (`:27`).
### M19 `src/background/approvals/preview.ts`
#### Detalle
Construcción de las TRES vistas previas de la ventana única y de sus avisos de riesgo (`:3`); §3.4 y su tabla de
avisos, §3.4.1 decisión (c) y §3.1/§3.2/§3.3 (`:4`). Nada se decodifica aquí —`selector`, `functionName` y
`decodedArgs` vienen LITERALMENTE de M66—; `toLabel` usa la etiqueta local o `"desconocido"`;
`verifyingContractMismatch` si es la dirección cero o `eth_getCode` devuelve `0x`; `domainChainMismatch` exige
doble confirmación; redacción en reposo por encima de `PREVIEW_INLINE_MAX_BYTES = 4096` (`:9`).
### M19.b `src/background/approvals/dispatch.ts`
#### Detalle
Ruta de producción de los 6 métodos aprobables, cierre de `D-H4-E1` (`:3`). Hasta su llegada los 6 aprobables
estaban declarados pero no los consumía nadie y la ventana nunca se abría —`waitForEvent("page") Timeout 20000
ms` en `e2e/04-enviar`, `10-aprobar-tx` y `11-firmar-mensaje`— (`:10`). Orquesta sin duplicar —M19 previews, M14
cola y marca en vuelo, M15 plazo, M17 entrega, M18 ventana, M11 firma y M7 difusión— (`:13`); orden: contexto y
red activa (sin sesión → `4100`) → `eth_estimateGas` antes de la ventana → preview → alta en cola → plazo →
ventana → espera (`:17`).
### M66 `src/background/approvals/calldata.ts`
#### Detalle
Tabla LOCAL Y CERRADA de selectores, única fuente de decodificación del calldata (`:3`); es el oráculo
anti-firma-ciega de R5 (`:7`); §3.4.1 (D-K/ADT-08), §3.4 regla 6, §3.1/§3.7 y tarea 4.7 (`:4`). Los selectores
reconocidos no se amplían en runtime —sin lista remota, sin ABI descargado, sin servicio de firmas—; fuera de la
tabla `functionName = null` e `isUnrecognizedContractCall = true`; `decodedArgs` solo escalares y direcciones,
con `uint256` como cadena decimal (nunca `bigint`); `multicall(bytes[])` se decodifica recursivamente (`:8`).

## Capa 6 — Seguridad
### M20 `src/background/security/senderGuard.ts`
#### Detalle
Guardas del canal interno content script/popup ↔ SW (`:3`); RF-14 y RF-23 (RNF-09, RNF-10, RNF-12) (`:21`).
`sender.id === chrome.runtime.id` (si no, `4100`); allowlist de rutas —`SIGN_RESPONSE` solo desde
`notification.html`, `CONNECT_RESPONSE` solo desde `connect.html`—; allowlist de métodos internos; el `origin`
se recalcula SOLO desde `sender.origin` y con `frameId !== 0` queda prohibido respaldarse en `sender.tab.url`
(D-J/ADT-07) (`:5`).
### M21 `src/background/security/accessLevel.ts`
#### Detalle
`setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` en CADA arranque (`:3`); RNF-09, RNF-10 y H-32 —sin él un
content script podría leer `truekeate_mnemonic` y las claves— (`:6`). El permiso `storage` ya está declarado en
el manifest y esta llamada no añade ninguno (`:11`).
### M22 `src/background/security/redaction.ts`
#### Detalle
Política de redacción de los `params` y del `data` que se persisten (`:3`); RF-28..RF-31 y RF-50 (RNF-09,
RNF-16) (`:19`). Nunca se persiste el mnemonic, una clave privada ni una firma completa; `data` se trunca a sus
primeros 10 bytes (`data.slice(0, 22)`) más `dataLength`, sin variante de 4 bytes (D-T); `personal_sign` guarda
dirección y hash; `eth_signTypedData_v4` guarda el hash del `message` (`:6`); lo consume SOLO el SW porque usa
`ethers` (`:17`).
### M22.a `src/background/security/hash.ts`
#### Detalle
Normalización del `sha256` de `ethers`, defecto de entorno medido (`:3`); RT-02 (RNF-22) (`:22`). En Vitest
`ethers` obtiene un `Buffer` de `node:crypto` de otro reino y su comprobación `instanceof Uint8Array` falla con
`invalid BytesLike value` (`:7`); en el navegador el valor ya es un `Uint8Array` y se devuelve sin tocar, así
que la corrección es idempotente y sin coste (`:14`). Debe importarse ANTES de usar `sha256` (`:19`).

## Capa 7 — Redes, sesiones y eventos
### M23 `src/background/networks/catalog.ts`
#### Detalle
Catálogo de redes del SW con la red Anvil local por defecto (`:3`); `CA-RT-06` (sin Sepolia), `ADT-25`/P-22 (el
alta nunca activa) y RNF-23 (`isTestnet`) (`:7`). Sin redes remotas —la única sembrada es
`http://127.0.0.1:8545` (RE-04)—; `chainId` validado en forma hexadecimal canónica o decimal coherente; lectura
y escritura por M33; validación previa de esquema y host del `rpcUrl`, con rechazo de hosts privados y de enlace
local (`:11`).
### M24 `src/background/networks/switch.ts`
#### Detalle
`wallet_switchEthereumChain` aprobable (`:3`); `CA-RF-22`, `CA-RF-24`, P-19/DEC-29, `ADT-25`/P-22 (ADR-16)
(`:8`). Cuatro casos: ya activa → `null` sin `PendingRequest`, sin ventana y sin `chainChanged`; dada de alta y
distinta → exactamente 1 `pending`, y al aprobar escribe `truekeate_chain_id`, emite `chainChanged` a TODAS las
pestañas y responde `null`; no dada de alta → `4901` sin ventana ni cola; rechazo o vencimiento → `4001` y la
red NO cambia (`:10`).
### M25 `src/background/networks/addChain.ts`
#### Detalle
`wallet_addEthereumChain` con aprobación del usuario y permiso de host en runtime (`:3`); `CA-RF-23`, RNF-23 y
`ADT-25`/P-22 (`:11`). Orden: validación PREVIA (esquema, host, `chainId`, `symbol`, `isTestnet`) → coherencia
de red contra el nodo → aprobación explícita → `chrome.permissions.request` SIEMPRE en runtime, también desde el
popup (DEC-36/DEC-41/ADT-25) → persistencia con `isDefault: false` sin tocar `truekeate_chain_id` (`:14`);
permiso denegado: la red NO se persiste y se responde `4001` (`:30`).
### M26 `src/background/sessions.ts`
#### Detalle
Sesiones de dApp por origen sobre `truekeate_connected_sites` (`:3`); `CA-RF-17`/`CA-RF-25` y DEC-31 —TTL de 24
h renovables— (`:12`). Sin sesión → `[]` y ninguna ventana; leer una sesión vigente refresca `lastUsedAt` y
recalcula `expiresAt`; tras 24 h sin uso la entrada se ELIMINA y `eth_accounts` vuelve a `[]` sin error;
`revokeSession` no crea ninguna entrada en la cola (`:15`).
### M26.b `src/background/connections.ts`
#### Detalle
Solicitudes de conexión de `eth_requestAccounts`, ventana `connect.html` y `CONNECT_RESPONSE` (`:3`); RF-16
(RNF-11) (`:21`). La verdad está en `truekeate_connect_request`; vencimiento PEREZOSO contra `expiresAt =
createdAt + CONNECT_TIMEOUT_MS` (60 s); máximo 1 `pending` por origen; `settlePendingConnect` es el ÚNICO punto
que cierra el ciclo (`:12`).
### M27 `src/background/events.ts`
#### Detalle
Propagación de eventos EIP-1193 del SW a TODAS las pestañas (`:3`); `CA-RF-15`/`CA-RF-24` (`:8`). Canal único
`chrome.tabs.sendMessage` con `{ frameId }` SOLO si el frame origen no es 0 (DEC-40/ADT-07); una pestaña sin
content script no rompe la propagación; SW puro, sin `setTimeout`/`setInterval` ni escritura en `truekeate_logs`
(`:14`).

## Capa 8 — Cuentas, ajustes, logs y estado
### M28 `src/background/accounts.ts`
#### Detalle
Cuentas de la cartera —alta, etiquetas, visibilidad, cuenta activa y baja— (`:3`); DEC-35/ACU-06 (etiquetas),
RF-06/DEC-45 (R-09a: las derivadas solo se ocultan) y ACU-04 (derivar no es importar) (`:15`). Gobierna
`truekeate_mnemonic`, `truekeate_accounts`, `truekeate_imported_accounts`, `truekeate_current_account` y
`truekeate_settings` vía M29 (`:7`).
### M29 `src/background/settings.ts`
#### Detalle
`truekeate_settings` —defaults, lectura/escritura tipada, etiquetas y aceptación de avisos— (`:3`); P-03/RE-02
(sin contraseña), DEC-35/ACU-06, RNF-23 (`devNoticeAcceptedAt`) y RF-06/DEC-35 (`hiddenAccounts`) (`:7`).
`encryptionEnabled` y `requirePasswordOnOpen` son SIEMPRE `false` y el módulo los fuerza aunque el almacén
traiga otro valor; la versión del esquema se declara DENTRO de `truekeate_settings.schemaVersion` (`:15`).
### M30 `src/background/logging/logger.ts`
#### Detalle
Escritura de `truekeate_logs`, SIEMPRE desde el SW, con exactamente 1 entrada por evento del catálogo y el modo
de fallo observable de la cuota de 10 MB (`:3`); RNF-16, con §2.15 y §3.6 (`:4`). Escritura exclusiva del SW;
catálogo cerrado de M31 —un `event` fuera del enum lanza `RangeError`—; redacción obligatoria por M22; retención
FIFO de M32; cuota observable con 1 reintento y contador de descartes persistido en `truekeate_logs_dropped`
(`:14`).
### M31 `src/background/logging/events.ts`
#### Detalle
Catálogo CERRADO de la observabilidad —24 eventos, 5 categorías y 4 niveles— (`:3`); RNF-16, con §3.6 regla 2 y
la nota de que `event` y `category` son campos independientes (`:6`). La unión `LogEventName` de M55 se
contrasta evento a evento con `satisfies`, de modo que añadir un nombre sin declararlo no compila; `system`,
`call`, `tx`, `sign` y `event` NO son valores válidos de `event`; el módulo es PURO (`:17`).
### M32 `src/background/logging/retention.ts`
#### Detalle
Retención FIFO por `ts` de `truekeate_logs` —500 globales y 200 por origen— (`:3`); RF-32 (RNF-16) (`:19`). Los
límites viven en `truekeate_settings` (M29) y su valor normativo en `shared/constants.ts`; se descartan siempre
las MÁS ANTIGUAS; el módulo es PURO y la escritura la hace M30 (`:12`).
### M33 `src/background/state/schema.ts`
#### Detalle
Versión de esquema y claves canónicas de `chrome.storage.local` (`:3`); ACU-25 y ADT-26/D-S —prohibidos los
nombres cortos, el prefijo heredado del intento previo y el almacén sincronizado— y RF-32/ADR-11 para el reset
con exclusión de `truekeate_logs` (`:5`). TODA clave persistida lleva el prefijo `truekeate_` y este módulo es
su fuente única (`:6`).
### M33.b `src/background/state/serialLock.ts`
#### Detalle
Cerrojo FIFO de lectura-modificación-escritura serializada sobre `chrome.storage.local` (invariante H-08)
(`:3`); RF-16, RF-25 y RF-37 (RNF-11, RNF-16) (`:17`). La auditoría de unitarias de la fase 4 midió que M26 y
M26.b hacían su RMW sin cerrojo y que `truekeate_connect_request` nunca se purgaba; aquí se extrae el MISMO
patrón (`:7`); es volátil y admisible, nunca fuente de verdad (`:14`).
### M34 `src/background/state/migrations.ts`
#### Detalle
Versionado y migración del esquema —base v1.2 → v1.3 → v1.4— (`:3`); requisitos pendientes de confirmar (cita
§2.4 M34, §4.3 y tarea 2.11). Deltas sin pérdida de datos: `truekeate_pending_request` (singular) se elimina;
`truekeate_connected_sites` con valor `string` se convierte al objeto canónico; `event` en `truekeate_logs` se
rellena deterministamente desde `category`; `accountLabels` se añade vacío si falta; las claves sin prefijo se
renombran; `truekeate_current_account` con la forma heredada `"0"` se normaliza a `idx:0` (`:10`); una clave no
declarada o desconocida se RECHAZA e informa en `rejectedKeys` sin copiarla (`:21`).

## Capa 9 — Inyección en la página
### M35 `src/inject/provider.ts`
#### Detalle
Objeto EIP-1193 publicado en la página —`request`/`on`/`removeListener`— con `chainId` y `selectedAddress`
cacheados y refrescados al llegar un evento (`:3`); `CA-RF-13`, `CA-RF-14`, `CA-RF-15` y `CA-RF-45` (`:10`).
`request` devuelve SIEMPRE una promesa y nunca lanza de forma síncrona; solo los 16 métodos de `PageMethod`
(M55) cruzan el puente y cualquier otro responde `4200` —caso de `eth_sign`, retirado en H-11a/DEC-22—; sin
puente con el content script se responde `4200` en lugar de dejar la promesa colgada (`:14`).
### M36 `src/inject/eip6963.ts`
#### Detalle
Anuncio y RE-anuncio EIP-6963 del provider (`:3`); H-31/RF-44 y `CA-RF-13`/`CA-RF-45` (`:5`). Listener SÍNCRONO
de `eip6963:requestProvider` registrado en el IIFE antes del primer anuncio; auto-anuncio al cargar, en cada
solicitud y de nuevo en `DOMContentLoaded`; `detail` exacto con `uuid` literal y congelado (`PROVIDER_UUID`) e
`icon` como data-URI PNG de 96 px (`:9`); el icono va incrustado en el bundle porque RT-03 prohíbe `fetch` y el
anuncio debe ser síncrono (`:20`).
### M37 `src/inject/index.ts`
#### Detalle
Entrada SÍNCRONA de `document_start` —publica el provider y su alias, instala el anuncio EIP-6963, inyecta el
puente con el content script y correlaciona respuestas— (`:3`); ADT-26/D-S, DEC-21 y `CA-RF-13` (`:6`).
`window.truekeate` y `window.codecrypto` apuntan al MISMO objeto y se definen con `Object.defineProperty(..., {
writable: false, configurable: false, enumerable: true })`; todo `postMessage` saliente usa `targetOrigin =
location.origin`, nunca `'*'` (H-32, RNF-10) (`:7`).
### M38 `src/content-script.ts`
#### Detalle
Relay página ↔ extensión en los DOS saltos del protocolo (`:3`); `CA-RF-14`, `CA-RF-15`, `CA-RF-45` y la nota de
reenvío H-39 (`:9`). Inyecta `inject.js` en `document_start` con la etiqueta marcada
`data-truekeate-inject="1"`; en el salto 1 valida `event.source === window` Y `event.origin ===
location.origin`; en el salto 2 usa `chrome.runtime.sendMessage` y trata `origin`/`tabId`/`frameId` como datos
NO fiables que el SW recalcula; el `TRUEKEATE_EVENT` se reenvía LITERALMENTE (`:12`).

## Capa 10 — UI del popup
### M39 `src/popup/App.tsx`
#### Detalle
Contenedor del popup 380×600 —encabezado de marca, pestañas, estado global y los estados de carga, vacío, error
y «wallet dañada»— (`:3`); RF-09/RF-10, P-03/RE-02, RNF-23 y RNF-14 (`:11`). Pestañas declaradas: Cuentas (M40),
Recibir (M41), Sitios (M44) y Seguridad (M46) (`:6`); al abrir pide el estado con `wallet_getState` y nunca lee
el almacén (`:11`).
### M40 `src/popup/views/AccountsView.tsx`
#### Detalle
Pestaña «Cuentas» —lista, cuenta activa, añadir, importar (frase o clave privada), renombrar, ocultar y
eliminar— (`:3`); RF-01..RF-06, RF-33 y RNF-23 (`:8`). Ninguna contraseña (P-03); cero criptografía —crear,
importar y derivar son métodos internos del SW—; validación inline antes de enviar (RF-33); los saldos llegan de
M47 y la vista no hace ninguna llamada por su cuenta (`:11`).
### M41 `src/popup/views/ReceiveView.tsx`
#### Detalle
Pestaña «Recibir» —dirección completa, copia al portapapeles y QR local (RF-07)— (`:3`); RF-07 / `CA-RF-07`, con
RNF-20 y RT-03 para el QR, y RNF-14 (`:9`). La dirección mostrada, la del portapapeles y la del QR son la MISMA
cadena, porque las tres salen del único valor `address` de la vista (`:5`).
### M42 `src/popup/views/SendView.tsx`
#### Detalle
Pestaña «Enviar» —transferencia a dirección externa o entre cuentas propias— (`:3`); `CA-RF-08`, `CA-RF-33`,
RF-33 y RNF-25 (`:4`). Valida en línea dirección, importe y saldo; estima la comisión con `eth_estimateGas` +
`eth_gasPrice`, y un `estimateGas` fallido BLOQUEA el envío y no abre `notification.html`; el saldo insuficiente
es bloqueante; no firma y no difunde (`:8`). El fichero dice transcribir los literales de §4.3 «porque
`src/popup/popupErrors.ts` —fuera del alcance de esta tarea— aún no los incluye» (`:20`): pendiente de confirmar
si esa duplicación se resolvió después.
### M43 `src/popup/views/NetworksView.tsx`
#### Detalle
Pestaña «Redes» —lista con la activa marcada, cambio de red con aprobación y alta sin activarla, con el aviso de
red no testnet de RNF-23— (`:3`); RNF-23, RNF-14, `ADT-25`/P-22 y DEC-36 (`:14`). La lista y la red activa las
publica `wallet_getState` (`networks`, `currentChainId`); el cambio se pide con `wallet_switchEthereumChain` y
el alta con `wallet_addEthereumChain` (EIP-3085) (`:16`).
### M44 `src/popup/views/SitesView.tsx`
#### Detalle
Pestaña «Sitios» —sitios conectados con su cuenta compartida, último uso y vigencia, y revocación por origen
(RF-26 / CU-19)— (`:3`); RF-26, `CA-RF-26` y RNF-19/RNF-21 (accesibilidad) (`:4`). La lista la publica el SW en
`wallet_getState.connectedSites` y la revocación se pide con `wallet_revokePermissions`, que desde el popup NO
crea entrada en `truekeate_pending_requests` (`:6`).
### M45 `src/popup/views/LogsView.tsx`
#### Detalle
Pestaña «Actividad» —panel de logs con los 24 eventos, errores en rojo con su `code`, operaciones con hash/firma
y exportación JSON del histórico— (`:3`); `CA-RF-28`..`CA-RF-31` y RNF-19/RNF-21 (`:10`). La lectura es SIEMPRE
`wallet_getLogs` → `{ entries, truncated, dropped }`; no toca el almacén ni limpia nada —el popup solo lee— y su
única escritura es la descarga del JSON generado en memoria con un `Blob` (`:15`).
### M46 `src/popup/views/SecurityView.tsx`
#### Detalle
Pestaña «Seguridad» —revelado/exportación del material de recuperación (RF-50) y reset destructivo (RF-11, parte
1)— (`:3`); RF-50 / P-20 / DEC-37 y RF-11 / DEC-46 (`:6`). Higiene: aceptación previa y explícita; oculto por
defecto —el nodo del DOM no existe cuando está oculto, no se oculta con CSS—; plazo único de 30 s
(`REVEAL_HIDE_MS`) con barra de progreso; doble disparador por temporizador o pérdida de foco; descarte al
ocultar con sobrescritura del portapapeles solo si aún contiene el valor; nunca por `window.postMessage` (`:9`);
el orden estricto de guardas del reset lo aplica el SW dentro de `wallet_resetWallet` (`:24`).
### M47 `src/popup/hooks/useBalancePolling.ts`
#### Detalle
Polling de saldos con exactamente 1 `eth_getBalance` por cuenta VISIBLE y ciclo, con ciclo de 5 s (`:3`);
`CA-RF-27` / RNF-03 y RNF-14 (`:6`). Arranca al abrir la vista, para al cerrarla y al cambiar de cuenta activa;
se suspende si el RPC no responde sin perder los datos leídos; nunca dispara dos ciclos solapados; es contable
con `requestCount` y `cycleCount` (`:7`).

## Capa 11 — UI de la ventana de conexión
### M48 `src/connect/App.tsx`
#### Detalle
Ventana de conexión `connect.html`, 420 × 650 (`:3`); `CA-RF-16` / `CA-RF-36` (`:5`). Muestra el origen
solicitante, todas las cuentas con su saldo real y el selector, con la cuenta activa preseleccionada; navegación
por teclado con flechas + `Enter` y `Esc` para rechazar; al confirmar envía `CONNECT_RESPONSE { requestId,
success: true, account, accountIndex }` y al cancelar el mismo mensaje con `success: false` y `4001` (`:5`);
etiquetas con `wallet_getState`, saldos con `eth_getBalance` y solicitud pendiente con
`wallet_getConnectRequest`, correlacionada por el `requestId` de la URL (`:15`).
### M49 `src/connect/ConnectRow.tsx`
#### Detalle
Fila de cuenta seleccionable de la ventana de conexión (`:3`); `identidad_visual.md` §5.2 y §5.3 regla 7, y
RNF-21 (`:5`). Tarjeta seleccionada con borde de 2 px del token de acento y fondo teñido; la fila entera es la
etiqueta del `<input type="radio">` del grupo `tk-connect-account`; área táctil ≥ 44 px; dirección truncada
`0x1234…abcd` en mono con el `title` completo (`:6`).

## Capa 12 — UI de la ventana de confirmación
### M50 `src/notification/App.tsx`
#### Detalle
Ventana GLOBAL ÚNICA de decisión `notification.html`, 420 × 640, P-21 (`:3`); `CA-RF-35` (decide, no firma) y
RNF-14 (`:10`). Envía solo `SIGN_RESPONSE { approvalId, success }`; muestra UNA solicitud a la vez —la `pending`
de menor `createdAt`— con el contador; mantiene siempre visibles origen, favicon, insignia de riesgo y resumen;
ofrece solo «Aprobar» y «Rechazar», con `Escape` y la X equivalentes a rechazo `4001` (`:10`); el correlador
llega en la URL y el cuerpo se pide por el puerto `truekeate_approval` con `RESUME { approvalId }` y por
`chrome.runtime.onMessage` (`:24`).
### M51 `src/notification/TxPreviewPanel.tsx`
#### Detalle
Resumen de la transacción de la ventana única (`CA-RF-19`) (`:3`); `CA-RF-19`, §3.4 y §2.5.2 (`TxPreview`)
(`:5`). Resumen siempre visible con cuenta de origen, destino etiquetado (`toLabel`), valor, red y comisión
estimada; si hay `data` se muestra el calldata decodificado por la tabla local cerrada de M66 y fuera de ella el
aviso bloqueante lo pinta M52; `estimationFailed` bloquea el envío (`-32000`, RNF-25); `to === null` significa
despliegue de contrato (`:10`).
### M52 `src/notification/RiskWarnings.tsx`
#### Detalle
Insignia de riesgo y avisos de la ventana única (`:3`); DEC-23 (tabla de avisos obligatorios) y RNF-21 / H-17
(`:6`). Los avisos están siempre visibles antes de decidir y cada uno lleva `role="alert"`; un aviso `blocking`
—contrato no reconocido, `verifyingContractMismatch` o saldo insuficiente— impide aprobar hasta marcarlo
explícitamente y es la «firma ciega» que el hito declara invalidante (riesgo R-05); un aviso `highlight`
—allowance ilimitada, `setApprovalForAll` o destino sin etiqueta— no bloquea; el panel es SOLO presentación
(`:10`).
### M53 `src/notification/TypedDataPanel.tsx`
#### Detalle
Panel de vista previa de `eth_signTypedData_v4` (EIP-712) (`:3`); `CA-RF-20`, §3.4 y §2.5.2 (`TypedDataPreview`)
(`:5`). Se muestran siempre `domain.name` y `verifyingContract` en claro, además del `chainId` del dominio, el
`primaryType`, los `types` y el `message`; si `domain.chainId ≠` red activa el aviso es destacado y exige doble
confirmación; `verifyingContractMismatch` —dirección cero o contrato no desplegado, redefinido en D-K/ADT-08— es
bloqueante por defecto (`:9`).
### M54 `src/notification/PersonalSignPanel.tsx`
#### Detalle
Panel de vista previa de `personal_sign` (`CA-RF-21`) (`:3`); `CA-RF-21`, §3.4 y §2.5.2 (`PersonalSignPreview`)
(`:5`). El contenido se muestra como texto UTF-8 legible y completo, nunca en hexadecimal cuando es legible; si
el payload es hexadecimal no decodificable (`isHexPayload`) se avisa con su `byteLength`; los bytes solo se
pintan truncados en la UI y NUNCA se copian a `truekeate_logs` (H-42 / RNF-09) (`:9`).

## Capa 13 — Capa compartida
### M55 `src/shared/types.ts`
#### Detalle
Tipos de dominio compartidos por SW, content script, provider inyectado y las tres ventanas (`:3`);
RF-13..RF-25, RF-35 y RF-37 (RNF-13, RNF-14, RT-08) (`:14`). Sin `any` —lo que la especificación tipa como `any`
se modela `unknown`— y el módulo NO importa nada (`:12`).
### M56 `src/shared/protocol.ts`
#### Detalle
Tipos y nombres de los mensajes internos —qué `type` viaja por cada canal, en qué dirección y con qué guarda—
(`:3`); RF-13, RF-15, RF-24, RF-37 y RF-45 (RNF-10, RT-13) (`:10`). Son **8** tipos de mensaje (ADT-29), no 6:
la tabla heredada omitía `TRUEKEATE_ANNOUNCE` y `RESUME` (`:6`).
### M57 `src/shared/constants.ts`
#### Detalle
Fuente ÚNICA de las constantes de build (`:3`); RF-04, RF-12, RF-18, RF-25, RF-27 y RF-40 (RT-06, RT-13)
(`:15`). Ninguna constante de tiempo compartida se declara dos veces —M2, M3, M6, M15, M20, M21, M33, M35, M36,
M37 y M38 importan de aquí—; las constantes del limitador de tasa no son ajustes de `truekeate_settings`, para
que la UI no pueda debilitarlas; `SIGN_TIMEOUT_MS`, `CONNECT_TIMEOUT_MS` y `REVEAL_HIDE_MS` se pueden inyectar
por `import.meta.env.VITE_*` solo para el arnés E2E (`:5`).
### M58 `src/shared/validation/address.ts`
#### Detalle
Validación ESTRUCTURAL de una dirección para el popup y el SW (`:3`); RT-02/RT-03, RNF-14 y `CA-RF-33` (`:6`).
No usa criptografía ni `ethers` —si lo hiciera, el paquete viajaría al bundle de la UI, que es lo que RNF-14
prohíbe—; comprueba forma `0x` + 40 hex y estilo de mayúsculas, y la verificación criptográfica del checksum
EIP-55 es del SW (M10, M13 y `eth_sendTransaction`) (`:15`).
### M59 `src/shared/validation/mnemonic.ts`
#### Detalle
Validación ESTRUCTURAL de la frase BIP-39 para la UI y el SW (`:3`); RF-01/RF-02 (12 palabras) y `CA-RF-02`
(checksum inválido → `-32602 invalidMnemonic`) (`:5`). No importa `ethers` ni hace criptografía; comprueba 12
palabras, minúsculas y separadas por espacios simples; es la fuente única de la normalización y del recuento,
que M8 reutiliza (`:16`).
### M60 `src/shared/validation/amount.ts`
#### Detalle
Validación del importe en ETH y contraste con el saldo (`:3`); `-32602 invalidAmount` (fila de §4.3.1 desde la
v1.9), RF-34 (ETH a 4 decimales) y `insufficientFundsError` de M6 (`:15`). No importa `ethers`: el paso de ETH a
wei usa aritmética `bigint` exacta, sin coma flotante, porque un `Number` perdería precisión a partir de 2^53
wei (`:6`).
### M61 `src/shared/validation/privateKey.ts`
#### Detalle
Validación ESTRUCTURAL de una clave privada para el popup y el SW (`:3`); `-32602 invalidPrivateKey` de §4.3 y
RT-02/RT-03 con RNF-14 (`:6`). Aquí NO se usa `ethers`; se comprueba la forma `0x` + 64 hex y el rango de
secp256k1 (`0 < d < n`) con `SECP256K1_N_HEX`; la comprobación criptográfica es del SW (M10 y M13) (`:13`).
### M62 `src/shared/format.ts`
#### Detalle
Formato de importes, direcciones y marcas de tiempo para TODA la UI (`:3`); §2.4 M62, §5.2 y RF-34 (`:4`). ETH
con 4 decimales y sin separador de millares, con variante española de coma decimal aparte (`formatEthEs`);
direcciones recortadas a `0x1234…abcd` con elipsis U+2026, no tres puntos; marcas de tiempo en `dd/mm/aaaa
hh:mm:ss` sin depender del `Intl` del entorno; no importa `ethers` porque lo consume el popup (`:15`).
### M63 `src/shared/qr.ts`
#### Detalle
Generación LOCAL del QR de la dirección de recepción (RF-07 / `CA-RF-07`) (`:3`); RNF-20 / RT-03 / `CA-RT-05`
(sin red ni dependencias remotas) y RNF-18 (sin literales de color) (`:6`). Versiones 1 a 4 con corrección L y
M; tabla de bloques de ISO/IEC 18004 para esas ocho combinaciones; un texto que no quepa no se dibuja —devuelve
`ok: false` con el motivo, nunca un QR incorrecto— (`:15`).

## Capa 14 — Estilos
### M64 `src/styles/tokens.css`
#### Detalle
ÚNICA fuente de color, tipografía y degradados (RNF-18) (`:3`). Es copia literal del bloque de tokens de
`RepoTecnico/identidad_visual.md` §6, medido sobre los activos originales; fuera de este fichero no puede
existir ningún literal de color y lo verifica `scripts/lint-prohibited.mjs` (`CA-RT-12`) (`:7`).
### M65 `src/styles/base.css`
#### Detalle
Estilos base de las tres ventanas —popup 380×600, connect 420×650 y notification 420×640— y de la dApp de
pruebas `test.html` (`:3`); RNF-18 y H-17 (foco visible de 2 px, área táctil ≥ 44 px, sin `outline: none`)
(`:11`). Todo el color sale de `tokens.css` (M64) vía `var(--tk-*)`; las fuentes se auto-hospedan si los
`.woff2` existen en `public/fonts/` y, mientras no existan, el `@font-face` usa `src: local(...)` (`:8`).

## Capa 15 — dApp de pruebas
`test.html` y `test/` (servida en `http://localhost:5174/test.html`) NO son un módulo `M*` de `src/`:
es el consumidor externo que ejerce de dApp contra `window.truekeate` y Foundry Anvil
(`RepoTecnico/documento_tecnico.md:376`). Sus tres responsabilidades como capa: forzar el recorrido de
los 16 métodos de página con un origen web real; servir de banco de pruebas de los aprobables —envío,
`personal_sign` y `eth_signTypedData_v4`—; y validar la firma EIP-712 con el contrato auxiliar
`contracts/src/EIP712Verifier.sol` (RT-11). Comparte los estilos de M65 y consume la capa compartida
(M55..M63) igual que la UI. **Pendiente de confirmar**: la lista exacta de ficheros de `test/` y sus
cabeceras no se ha leído; el alcance de este documento es el árbol `M1..M66` de `src/`.

## 3. Divergencias y hallazgos

### 3.1 Colisión real de nomenclatura: dos módulos se llaman M66
El documento técnico asigna **M66** a `src/background/approvals/calldata.ts`
(`RepoTecnico/documento_tecnico.md:311`, «Tabla LOCAL cerrada de selectores y decodificación
(D-K/ADT-08)»), y el fichero lo confirma: `src/background/approvals/calldata.ts:2` dice
`M66 — src/background/approvals/calldata.ts`. Pero **un segundo fichero se autodenomina también M66**:
`src/shared/i18n.ts:2` dice `M66 — src/shared/i18n.ts`, y su cabecera explica que centraliza los
textos de UI en español (`CA-RT-10` / RF-34) para las cuatro superficies del producto, nacido en la
tarea 6.4 del plan §3.6.5 (`src/shared/i18n.ts:6`). La colisión es de fase: el número ya estaba tomado
por calldata cuando la fase 6 añadió el módulo de textos. **Consecuencia práctica**: citar «M66» es
ambiguo en cualquier conversación, issue o commit; debe citarse la ruta completa, o usar `i18n` para el
segundo. Pendiente de confirmar si el documento técnico v1.11 o el estado del proyecto registran ya
esta colisión como decisión formal.

### 3.2 Submódulos `.a/.b/.c`: ampliaciones del árbol original
| Módulo | Ruta | Motivo declarado en su cabecera |
|---|---|---|
| M3.b | `src/background/rpc/rateLimit.ts` | *Token bucket* persistido de todo el catálogo (tarea 3.13) |
| M4.a | `src/background/rpc/internalMethods.ts` | Romper el ciclo `catalog → sessions → senderGuard → catalog` (`:7`) |
| M4.b | `src/background/rpc/pageMethods.ts` | Separar el catálogo de página del de internos |
| M14.b | `src/background/approvals/decisions.ts` | `chrome.storage` no puede resolver una promesa (`:6`) |
| M14.c | `src/background/approvals/responses.ts` | El camino de `SIGN_RESPONSE` estaba sin implementar (`:6`) |
| M19.b | `src/background/approvals/dispatch.ts` | Cerrar `D-H4-E1`: la ventana nunca se abría (`:5`) |
| M22.a | `src/background/security/hash.ts` | Normalizar el `sha256` de `ethers` en el arnés de Vitest (`:5`) |
| M26.b | `src/background/connections.ts` | Ciclo de vida de la conexión; M26 no depende de `chrome.windows` (`:6`) |
| M33.b | `src/background/state/serialLock.ts` | M26 y M26.b hacían RMW sin cerrojo (fase 4, `:7`) |

**M26.b no aparece en el árbol de §2.4** aunque su fichero sí declara número propio: por eso figura
aquí y también en §3.3.

### 3.3 Ficheros de `src/` que no están en el árbol de la sección 2.4
Comparando el árbol normativo (`RepoTecnico/documento_tecnico.md:274`..`:372`) con el `src/` real,
estos ficheros de producción NO aparecen en la sección 2.4 (ordenados por ruta):

| Fichero real | Cabecera declara | Qué es |
|---|---|---|
| `src/popup/main.tsx` | sin número (`:1`) | Entry del popup: monta M39 en `#root` |
| `src/popup/walletRpc.ts` | M39 (soporte) (`:2`) | Único punto del popup que habla con el SW |
| `src/popup/walletState.ts` | M39 (soporte) (`:2`) | Estado y operaciones de cartera del popup |
| `src/popup/runtimeChannel.ts` | M39 (soporte) (`:2`) | Encapsula `chrome.runtime.sendMessage` |
| `src/popup/popupErrors.ts` | M39 (soporte) (`:2`) | Réplica de la tabla de errores §4.3 para el popup |
| `src/popup/validation.ts` | M40/M41/M46 (soporte) (`:2`) | Validación de presentación de los formularios |
| `src/popup/components/AboutDialog.tsx` | M39/M50 (soporte) (`:2`) | Pantalla «Acerca de» compartida |
| `src/popup/components/AccountCard.tsx` | M39 (soporte) (`:2`) | Tarjeta de cuenta de la identidad visual |
| `src/popup/components/AccountPicker.tsx` | M42 (soporte) (`:2`) | Selector de cuenta del formulario de envío |
| `src/popup/components/DialogoDecision.tsx` | M39 (soporte) (`:2`) | Diálogo de decisión previa sobre capa modal |
| `src/popup/components/Field.tsx` | M39 (soporte) (`:2`) | Campo con etiqueta, ayuda y validación inline |
| `src/popup/components/QrCode.tsx` | M41 (soporte) (`:2`) | Pintado del QR a partir de la matriz de M63 |
| `src/popup/components/StatusMessage.tsx` | M39 (soporte) (`:2`) | Único sitio del popup que pinta errores |
| `src/connect/main.tsx` | sin número (`:1`) | Entry de `connect.html`: monta M48 |
| `src/notification/main.tsx` | sin número (`:1`) | Entry de `notification.html`: monta M50 |
| `src/notification/Notification.tsx` | M50 (esqueleto) (`:2`) | Esqueleto de H1, superado por M50 (`main.tsx:5`) |
| `src/notification/firstSignature.ts` | M50 (soporte) (`:2`) | Oráculo del aviso «antes de la primera firma» |
| `src/notification/FirstSignatureNotice.tsx` | M50/M52 (soporte) (`:2`) | Aviso bloqueante antes de la primera firma |
| `src/inject/icon-data.ts` | «Módulo(s) de contrato: M35 y M36» (`:10`) | Data-URI del isologo, ARCHIVO GENERADO |
| `src/styles/cssTokens.ts` | M64 (soporte de pruebas) (`:2`) | Lector de tokens y aritmética WCAG 2.1 |
| `src/shared/i18n.ts` | M66 (colisión, §3.1) (`:2`) | Textos de UI centralizados en español |
| `src/background/connections.ts` | M26.b (`:2`) | Ampliación del árbol (§3.2) |

Las tres páginas HTML (`src/index.html`, `src/connect.html`, `src/notification.html`) SÍ están en el
árbol de §2.4 —como P1/P2/P3—, pero como páginas, no como módulos. Y la sección 2.4 no menciona ningún
`*.spec.ts`, de los que hay 60 en `src/`.

### 3.4 Recuento honesto
| Categoría | Ficheros `.ts`/`.tsx` |
|---|---|
| Total en `src/` | **154** |
| Specs (`*.spec.ts`) | **60** |
| **Producción (no spec)** | **94** |

Reparto de los 94 de producción, leído fichero a fichero de sus cabeceras:

| Grupo | Nº | Detalle |
|---|---|---|
| Módulos del árbol §2.4 con número propio | 65 | M1..M65 |
| M66 (calldata) | 1 | `src/background/approvals/calldata.ts` |
| Submódulos `.a/.b/.c` | 8 | M3.b, M4.a, M4.b, M14.b, M14.c, M19.b, M22.a, M33.b |
| Soporte de UI con cabecera «(soporte)» | 16 | 5 en `popup/`, 7 en `popup/components/`, `popup/validation.ts` y 3 en `notification/` |
| Entries sin número | 3 | `popup/main.tsx`, `connect/main.tsx`, `notification/main.tsx` |
| Generado en build | 1 | `src/inject/icon-data.ts` |
| Soporte de pruebas | 1 | `src/styles/cssTokens.ts` |
| Colisión de número | 1 | `src/shared/i18n.ts` (dice M66, ver §3.1) |

**Cómo se explica la diferencia frente a los «66 módulos»**: los 66 son los módulos normativos del
diseño. El repositorio real contiene ese diseño MÁS (a) los submódulos que resolvieron defectos medidos
en las fases 3 a 5, (b) el soporte de UI que no merecía número propio —canal de runtime, estado de
cartera, errores del popup, componentes reutilizables y los tres entries de página—, (c) un fichero
generado en tiempo de compilación y (d) los 60 specs que verifican todo lo anterior. En una línea:
**66 módulos de diseño → 94 ficheros de producción → 154 ficheros en `src/`, specs incluidos**. Dos
matices: (1) `src/shared/i18n.ts` cuenta arriba como módulo con número porque su cabecera dice `M66`,
pero es una segunda asignación del mismo número (§3.1): con un identificador propio, el reparto sería
65 del árbol + 29 de soporte; (2) la frontera entre «módulo del árbol» y «soporte» se ha trazado
leyendo la cabecera JSDoc de cada fichero, no una lista externa —cinco ficheros no tienen línea `M<n>`
utilizable: los tres `main.tsx` (su cabecera empieza por «Entry de…»), `src/inject/icon-data.ts`
(«Módulo(s) de contrato: M35 y M36») y `src/styles/cssTokens.ts` («M64 (soporte de pruebas)»).

### 3.5 Otros hallazgos verificables
**La tabla de errores está duplicada a propósito** entre `src/background/rpc/errors.ts` (M6) y
`src/popup/popupErrors.ts`: el popup no puede importar del SW por RNF-14, así que la replica
literalmente y «cualquier cambio de la tabla se aplica en los dos sitios» (`src/popup/popupErrors.ts:12`).
Es un punto de fricción real de mantenimiento.
**La validación de presentación podría estar delegando ya en M58..M61**, pero no se ha confirmado:
`src/popup/validation.ts:11` se declara «punto de integración» a la espera de que «M58..M61 existan», y
M58..M61 ya existen; **pendiente de confirmar** leyendo el cuerpo completo del fichero.
**`src/notification/Notification.tsx` es código superado**: su cabecera lo llama «esqueleto» de H1 y
`src/notification/main.tsx:5` confirma que «queda superado por M50»; sigue en el árbol y cuenta en los
154 ficheros. **Los tres `main.tsx` no están en el árbol normativo** aunque son las entradas reales que
Vite emite como `dist/index.html`, `dist/connect.html` y `dist/notification.html`; el documento técnico
congela esas rutas de salida (`RepoTecnico/documento_tecnico.md:374`) pero no nombra los ficheros TSX
que las montan. **`src/styles/cssTokens.ts` no es dependencia de producción**: su cabecera aclara que
`tsc -b` lo comprueba pero ningún componente de la UI lo importa (`src/styles/cssTokens.ts:11`).