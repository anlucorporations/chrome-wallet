# 01 — Plataforma (Chrome/Edge Manifest V3)

Propósito: describir **cómo la plataforma de extensiones Chrome/Edge con Manifest V3 es utilizada
por TrueKeate Wallet**, con referencias verificables (`ruta:línea`) al código real: manifest,
Service Worker y su ciclo de vida, content script, provider inyectado, ventanas, permisos y límites
de la plataforma.

> Método: cada cita `ruta:línea` se leyó en el fichero antes de escribirse. Lo no verificable en el
> código se marca literalmente como «pendiente de confirmar».

## Manifest V3 en este proyecto

### Fuente única tipada: `src/manifest.ts`

El manifest **no se escribe a mano en JSON**: su fuente única es el módulo TypeScript
`src/manifest.ts` (92 líneas), que exporta el objeto `manifest` congelado con `as const`. Lo declara su
cabecera: «lo genera el plugin `closeBundle` de vite.config.ts a partir de este modulo, de modo que
`dist/manifest.json` y la suite `manifest.spec.ts` consumen exactamente los mismos valores congelados»
(`src/manifest.ts:1-10`).

#### Campos declarados

| Campo | Valor | Cita |
|---|---|---|
| `manifest_version` | `3` | `src/manifest.ts:39` |
| `name` | `'TrueKeate Wallet'` | `src/manifest.ts:40` |
| `version` | `pkg.version` (`package.json` → `1.0.0`) | `src/manifest.ts:41`, `package.json:3` |
| `description` | monedero no custodial para red local Anvil | `src/manifest.ts:42-43` |
| `key` | `MANIFEST_KEY` (RSA-2048, DER/SPKI en base64) | `src/manifest.ts:21-22`, `:44` |
| `minimum_chrome_version` | `'114'` | `src/manifest.ts:45` |
| `icons` | 16/32/48/128 px | `src/manifest.ts:46-51` |
| `action.default_popup` | `'index.html'` | `src/manifest.ts:52-53` |
| `background` | `service_worker: 'background.js'`, `type: 'module'` | `src/manifest.ts:61` |
| `permissions` | `storage`, `alarms`, `favicon`, `clipboardRead`, `clipboardWrite` | `src/manifest.ts:62` |
| `optional_permissions` | `['notifications']` | `src/manifest.ts:63` |
| `host_permissions` | `127.0.0.1:8545/*`, `localhost:8545/*` | `src/manifest.ts:64` |
| `optional_host_permissions` | `http://127.0.0.1/*`, `http://localhost/*`, `https://*/*` | `src/manifest.ts:65` |
| `content_scripts` | 1 entrada (`document_start`, `all_frames`) | `src/manifest.ts:66-81` |
| `web_accessible_resources` | `inject.js`, `use_dynamic_url: true` | `src/manifest.ts:83-89` |

#### La `key` fija el ID; las ausencias son deliberadas

`version` se toma de `package.json` «para que exista una sola fuente de version» (`src/manifest.ts:34`).
La `key` es la clave **pública** del par de firma del desarrollador (RSA-2048, DER/SPKI, base64), congelada
a propósito: «fija el ID de la extension en cualquier equipo e instalacion, lo que hace reproducible la
allowlist CORS de Anvil (RE-04) y la suite E2E» (`src/manifest.ts:14-20`). De ella deriva
`EXTENSION_ID = 'oiahebaliobknoeeonhgaacapjcpgblo'` (`:31`), «primeros 16 bytes del SHA-256 de la clave
DER, con cada nibble mapeado a `a`-`p`» (`:25-30`); ese ID lo consumen la allowlist CORS de Anvil,
`chrome-extension://<ID>/_favicon/` (ADT-22) y la suite E2E, que lo importa en vez de escribirlo a mano.
Ausencias deliberadas: «Sin `tabs`, sin `activeTab` y sin `scripting` (permisos retirados, H-36/D-P);
`notifications` vive SOLO en `optional_permissions` porque RF-39 pertenece al ciclo posterior» (`:35-36`).

### Generación de `dist/manifest.json`: el plugin `manifestPlugin`

El artefacto lo escribe `manifestPlugin()` (`vite.config.ts:109-146`), registrado en el **último** build
de la cadena (`:190`), «cuando las 6 entradas ya estan en disco»; el guardia `buildFailed` (`:110`,
`:114-118`) evita que una comprobación de manifest enmascare el error real de un build fallido. Su
`closeBundle()` (`:117-144`) **falla el build** si: (1) falta alguna de las 6 entradas obligatorias —
`REQUIRED_ENTRIES` (`:57-64`, comprobación en `:120-125`); (2) falta la `key`, «sin ella el ID de la
extension no es estable (D-N/ADT-19)` (`:126-128`); (3) `notifications` está en `permissions` en vez de
`optional_permissions` (`:129-133`); (4) aparecen permisos retirados `tabs`, `activeTab` o `scripting`
(`:134-137`). Si `notifications` no está en `optional_permissions` solo hay aviso por consola
(`:138-140`). La escritura es literal:
`writeFileSync(…, JSON.stringify(manifest, null, 2) + '\n', 'utf8')` (`:142`).

### La cadena de builds

`npm run build` = `tsc -b && vite build` (`package.json:9`). Vite 7 «NO admite que el fichero de
configuracion exporte un array», así que los builds 2 y 3 se lanzan con la API programática `build()`
desde el hook `closeBundle` del build 1 (`vite.config.ts:14-23`). Un solo comando produce las **6
entradas** en `dist/`: build 1 `es` con las 3 páginas y el Service Worker (`:41-46`, `:249-253`); build 2
`iife` con `content-script.js` (`:48-50`, `:189`); build 3 `iife` con `inject.js` y `dist/manifest.json`
(`:52-54`, `:190`). Los nombres de salida son estables (`entryFileNames: '[name].js'`, `:70-74`), y las
páginas — emitidas en `dist/src/*.html` — las reubica `htmlRootOutputPlugin` en la raíz de `dist/`: «los
assets se referencian con rutas absolutas, de modo que el traslado no rompe ninguna referencia»
(`:76-98`).

## El Service Worker

### `background.service_worker` con `type: 'module'`

El manifest declara `background: { service_worker: 'background.js', type: 'module' }`
(`src/manifest.ts:61`), coherente con el formato `es` del build 1: «`es` -> las 3 paginas HTML y el
Service Worker (`type: 'module'` en el manifest)» (`vite.config.ts:10`). La fuente es
`src/background.ts` (`:45`) y la salida `background.js`, una de las 6 entradas exigidas (`:57-64`).

### Arranque real: `bootstrap`

`bootstrap` está exportada para las pruebas: «Es **idempotente** y se expone para las pruebas del
arranque: cada invocación es un arranque y escribe SU entrada `sw_started` (una por arranque). El ciclo
normal lo dispara `onInstalled`, `onStartup` y la evaluación inicial del propio Service Worker»
(`src/background.ts:631-637`). Sus fases, en orden: 1) aislamiento del almacén con
`applyStorageAccessLevel()`, «lo ANTES posible» (M21), y 1.b `hydrateLogDiagnostics()`, el contador de
descartes de log visible tras la suspensión (`:639-643`); 2) migraciones de esquema (M34), antes de leer
estado (`:644-645`); 3) red por defecto (M23): siembra Anvil con `chainId 0x7a69` (`:646-647`); 4)
integridad (M13), que puede dejar la cartera «dañada» (`:648-649`); 5) auto-carga del estado: cuenta
activa, red, importadas, etiquetas y sesiones (`:650-651`); 6) reconciliación de plazos (M16): purga,
`4001` a huérfanas, rearme de alarmas, reconstrucción de `inflight` y ventanas de tasa, y restablecer la
ventana única (`:652-655`); 7) **UNA** entrada `sw_started` por arranque (`:669-670`). La cabecera resume
el orden con su marco temporal: «En cada arranque, y en menos de 1 s» (`src/background.ts:6`).

### Registro SÍNCRONO de listeners antes del primer `await`

Antes de la primera invocación de `bootstrap`, el módulo registra cuatro listeners de forma síncrona:
`registerApprovalPortListener()` (`src/background.ts:677`), `registerExpiryAlarmListener({…})`
(`:678-680`), `registerApprovalWindowListeners()` (`:681`) y `registerRpcMessageListener()` (`:682`).
«Los listeners se registran de forma SÍNCRONA: si el SW se despierta por una conexión, una alarma, un
mensaje o el cierre de la ventana única, todos deben existir ya al final del primer ciclo de evaluación»
(`src/background.ts:673-676`). Los módulos dueños repiten el motivo: «un `onConnect` puede ser justamente
el evento que lo despierte, así que el listener debe existir antes del primer `await` del arranque»
(`src/background/approvals/ports.ts:545-551`); «una alarma puede ser justamente el evento que lo
despierte» (`src/background/approvals/timeout.ts:478-485`); el cierre debe «marcar el rechazo aunque el
SW estuviera dormido» (`src/background/approvals/focus.ts:767-770`).

Hay **tres disparadores** y los tres comparten la misma secuencia (`src/background.ts:684-699`):
`chrome.runtime.onInstalled` → `void bootstrap()` (`:686-690`); `chrome.runtime.onStartup` →
`void bootstrap()` (`:691-695`); y la **evaluación inicial** del SW, sin evento previo:
`void bootstrap()` (`:698-699`). Da igual *por qué* despertó el SW: el estado se reconstruye igual.

### Medición de `bootMs` (RNF-08, cota < 1 s)

El instante de arranque se captura en la primera línea ejecutable: `const bootStartedAt = Date.now();`,
«para medir la cota de < 1 s de RNF-08» (`src/background.ts:120-121`). Al cerrar la fase 6 se calcula
`const bootMs = Date.now() - bootStartedAt;` (`:657`) y se guarda en `bootSnapshot` (`:658-667`), el
estado de arranque reconstruido en cada despertar (`:197-212`). `bootMs` viaja con `bytesInUse` en la
entrada `sw_started` (`:243-247`; medición en `:230-241`). La reconciliación mide además su coste y avisa
si supera la cota: «la reconciliación de aprobaciones superó 1 s: … (RNF-08)»
(`src/background/approvals/reconcile.ts:490-495`), con la cota en su cabecera: «**< 1 s con 50 pendientes**
y reloj inyectado (RNF-08, `CA-RF-41`)» (`:26-27`).

## Ciclo de vida y suspensión

### Qué NO se puede usar en un Service Worker

El navegador suspende el Service Worker cuando no hay trabajo, así que los temporizadores de proceso no
sirven como dueños de un plazo. El código lo dice literalmente en dos puntos de `src/background.ts`:
`:444-445` («Nunca usa `setTimeout` ni `setInterval` (prohibidos en el SW: no sobreviven a la suspensión)
y nunca rompe el arranque: un fallo se avisa por consola y el SW sigue operativo.», fase 6) y `:16`
(«**Reconciliación de plazos**: VACÍA en H2 (la cola persistida y `chrome.alarms` llegan con M16 en H4).
Nunca usa `setTimeout`/`setInterval` (prohibidos en el SW).»). El módulo dueño del plazo añade el modo de
fallo: «**Prohibidos `setTimeout` y `setInterval`**: no sobreviven a la suspensión del SW y el plazo
nunca dispararía» (`src/background/approvals/timeout.ts:16-18`); la reconciliación insiste: «Sin
`setTimeout` ni `setInterval`: el dueño del plazo es M15 (`chrome.alarms`)»
(`src/background/approvals/reconcile.ts:29`).

### `chrome.alarms`: el dueño único del plazo

El permiso `alarms` está declarado (`src/manifest.ts:62`) y su uso vive en
`src/background/approvals/timeout.ts`. `armAlarm(name, expiresAt)` llama a
`alarms.create(name, { when: expiresAt })` (`:174-190`), y su comentario advierte que «Si el instante ya
pasó, Chrome la dispara de inmediato»; un fallo de la API devuelve `false` sin lanzar. Sobre esa
primitiva se construyen `armExpiryAlarm` (`:209-214`) y `armInflightReleaseAlarm` (`:222-227`). La capa
sin `any` sobre `chrome.alarms` — `create`, `clear`, `getAll`, `onAlarm` — está en `getAlarmsApi`
(`:92-111`). El nombre canónico es `truekeate_expire:<approvalId>` (`:117-119`), construido con
`EXPIRE_ALARM_PREFIX = 'truekeate_expire:'` (`src/shared/constants.ts:222-223`);
`approvalIdFromExpiryAlarm` (`:121-123`) hace la lectura inversa y `listExpiryAlarmNames` (`:235-249`)
filtra de `alarms.getAll()` solo las alarmas de este módulo; existe además la familia de alarmas de
liberación de la marca en vuelo, `truekeate_expire:inflight:<cuenta>` (`:125-141`).

#### Plazo y vencimiento

`expiresAt` está **anclado a `createdAt`**: `signExpiresAt = createdAt + SIGN_TIMEOUT_MS`
(`src/background/approvals/timeout.ts:151-152`), con `SIGN_TIMEOUT_MS = 120_000` (`src/shared/constants.ts:92`)
y `CONNECT_TIMEOUT_MS = 60_000` para la conexión (`:95`, `src/background/approvals/timeout.ts:154-155`).
El margen de seguridad de la capa content es de 5 s: `TIMEOUT_SAFETY_MARGIN_MS` (`src/shared/constants.ts:98`;
`safetyTimeoutMs()`, `src/background/approvals/timeout.ts:157-161`). `expireApprovalRequest` (`:384-467`)
marca la entrada `expired` con `resolvedAt` y `errorCode: 4001`, entrega el objeto EIP-1193 de
vencimiento (`timeoutError`, `src/background/rpc/errors.ts:500-505`; literal «El usuario no respondió
en el plazo establecido (<segundos> s); la solicitud ha caducado.» en `src/background/rpc/errors.ts:52`),
pasa la ventana única a la siguiente `pending` o la cierra, purga el badge y escribe
`approval_expired`. Es **idempotente**: si la entrada ya no está `pending`, limpia su alarma y no
entrega nada (`:400-413`).

#### Rearme al despertar

`rearmExpiryAlarms(map, { now, alarms })` (`:277-310`) rearma la alarma de **cada** entrada `pending`
desde su `expiresAt` **persistido** y retira las huérfanas. Regla de seguridad: «Una entrada sin
`expiresAt` numérico se rearma con `now + SIGN_TIMEOUT_MS`: nunca se deja una solicitud sin plazo»
(`:281-282`). Devuelve `{ armed, cleared, pending }` (`:267-275`). El listener se registra de forma
síncrona (`registerExpiryAlarmListener`, `:486-513`) y atiende **solo** alarmas de su prefijo; el handler
no se envuelve en el `rmwLock` porque «anidarlo dos veces bloquearía la cadena para siempre» (`:482-485`).

### Reconciliación al despertar

El invariante «Reconciliación al arrancar» lo implementa `src/background/approvals/reconcile.ts`,
invocado desde la fase 6 (`src/background.ts:447-465`), que documenta: «nunca rompe el arranque: un fallo
se avisa por consola y el SW sigue operativo». `reconcileApprovals` (`:352-518`) ejecuta, en orden: (1)
**una sola lectura** de `truekeate_pending_requests`, `truekeate_inflight_tx`, `truekeate_rate_windows` y
`truekeate_approval_window` (`:366-375`); (2) **purga** de lo resuelto y lo vencido (`:377-383`); (3)
**`4001` a las huérfanas**, por puerto vivo o por su pestaña/frame (`:385-412`); (4) **rearme de alarmas**
desde el `expiresAt` persistido (`:414-415`); (5) **reconstrucción de `truekeate_inflight_tx`** con la
tabla de estados (`:417-425`; tabla en `:196-203`: `signing` vencida libera la cuenta, `broadcast` con
recibo se confirma o falla, `broadcast` sin recibo dentro del TTL se conserva); (6) **reconstrucción de
`truekeate_rate_windows`** reutilizando M3.b sin duplicar lógica (`:427-436`); (7) **ventana única**, «una
sola ventana mostrando la `pending` más antigua» (`:438-446`); (8) **UNA** entrada `sw_reconcile` más las
trazas de lo descartado, en un solo `set` (`:450-484`). El motivo de la cota está en su cabecera: «el
estado se lee una vez, las escrituras se agrupan y las trazas se escriben en un solo `set`» (`:26-27`).

### Puerto de larga vida: canal y correlación, NO keep-alive

`APPROVAL_PORT_NAME = 'truekeate_approval'` (`src/shared/constants.ts:219-220`), con el comentario «Puerto
de larga vida `chrome.runtime.connect` (canal, NO *keep-alive*)». El SW lo atiende en
`registerApprovalPortListener` (`src/background/approvals/ports.ts:545-591`): filtra por nombre, y si el
mensaje es `RESUME` del protocolo atiende el `approvalId` con `handleResume`; cualquier otro mensaje por
ese puerto se responde `4200` (`replyUnsupported`, `:532-543`). Al desconectarse retira del índice volátil
el vínculo de esa instancia (`:581-588`). `portsByApprovalId` es «estado VOLÁTIL admisible (solo índice de
transporte, reconstruible): el SW puede suspenderse y perderlo; el content script se reconecta con backoff
y reenvía `RESUME`» (`:134-139`). El puerto **no** mantiene vivo al Service Worker: «no impide que el
navegador suspenda el SW a los ~30 s de inactividad (ADT-15/R16)» (`:11-15`). Sirve para transportar la
solicitud completa al reanudar (`resumeResultFor`, `:256-281`) y para entregar la resolución:
`deliverApprovalResolution` (`:467-516`) prueba en orden puerto vivo (publica y **cierra** el puerto),
pestaña viva (`chrome.tabs.sendMessage` con el `frameId` exacto solo si es distinto de 0) y, sin
destinatario, `'none'`. `pushApprovalRequest` (`:324-378`) documenta una medición real del repositorio: el
único canal que alcanza `notification.html` es `chrome.runtime.sendMessage` porque la ventana es una
**página de la extensión**, no un content script; `chrome.tabs.sendMessage` se conserva como respaldo pero
«responde `Could not establish connection. Receiving end does not exist.` para una página
`chrome-extension://`» (`:330-341`).

## Content script

### Declaración en el manifest

`src/manifest.ts:66-81` declara una única entrada: `matches: ['<all_urls>']`, `exclude_matches` de
MetaMask, `js: ['content-script.js']`, `run_at: 'document_start'` (`:79`) y `all_frames: true` (`:80`).
`document_start` es lo que permite publicar `window.truekeate` «antes de cualquier script de la página»
(`src/content-script.ts:12-17`); `all_frames: true` instala el relay en todos los frames: «Marca de
instalación: el content script puede inyectarse en varios frames» (`:72-73`), y cada frame conserva su
`frameId` para que la respuesta vuelva al frame exacto (`src/background/approvals/ports.ts:26-27`).

#### La nota real sobre `chrome-extension://` (`src/manifest.ts:70-77`)

El manifest conserva el comentario de la corrección H1, transcrito íntegro: «NOTA (corregido en H1):
`chrome-extension://*/*` NO es un patrón de coincidencia válido para `content_scripts`. Chrome rechaza el
manifest completo con «Invalid value for 'content_scripts[0].exclude_matches[0]'» y la extensión no carga.
Es innecesario además: `<all_urls>` no incluye el esquema `chrome-extension://`. Se conservan las
exclusiones de MetaMask para no inyectar donde ya hay otro provider» (`src/manifest.ts:70-77`). Es decir:
**no** se excluye `chrome-extension://` porque (a) no es un patrón válido y rompería la carga de la
extensión y (b) `<all_urls>` ya no incluye ese esquema; las exclusiones conservadas son las de MetaMask
(`:75-76`), para no inyectar donde ya hay otro provider.

### El puente por `window.postMessage`

`src/content-script.ts` (603 líneas) es, según su cabecera, el «Relay página ↔ extensión en los **DOS
saltos** del protocolo» (`:2-3`). El protocolo tiene 8 tipos de mensaje cerrados
(`src/shared/protocol.ts:35-43`). Toda entrada desde la página pasa por `readPageEnvelope`, que exige
`event.source === window` **y** `event.origin === location.origin` y que el `type` esté en
`ACCEPTED_FROM_PAGE = ['TRUEKEATE_REQUEST', 'TRUEKEATE_ANNOUNCE']` (`:253-267`, lista en `:75-76`);
cualquier otro mensaje se descarta. La salida usa siempre `targetOrigin` cerrado: `postToPage` emplea
`location.origin`, nunca `'*'` — «el comodín está prohibido (H-32, RNF-10)» (`:210-218`) —, y los tipos
reenviados son el conjunto cerrado `FORWARDED_TO_PAGE = ['TRUEKEATE_RESPONSE', 'TRUEKEATE_EVENT']`
(`:78-83`, `:464-469`). `forwardToPage` reenvía el sobre **sin reconstruirlo**: «`eventName`, `data` y
cualquier campo extra (p. ej. el `origin` del sobre) viajan idénticos (nota H-39)» (`:454-463`); sus dos
únicos efectos son de observación (dar por resuelta una respuesta empujada que correlaciona con una
petición en vuelo y recordar el `approvalId` para el `RESUME`) (`:459-462`, `:470-484`).

### Su papel de relay

El relay **no interpreta** el método ni los parámetros: «el método viaja LITERAL (aunque no exista en el
catálogo): el SW responde `4200`» (`:421-423`), y origen, `tabId` y `frameId` viajan a `null` porque «el
SW los sustituye por `sender.tab.id` y `sender.frameId`» (`:424-432`). El `id` que generó la página viaja
como `requestId` para que el SW lo persista con la solicitud y la resolución vuelva con ese `id`
(`:44-48`, `:430-431`). Nada de esto lleva secretos: «Ningún secreto cruza `window.postMessage` ni este
relay (RNF-09)» (`:50-51`).

#### Transporte con espera acotada y reintento seguro

El relay mantiene las llamadas en vuelo en `inFlight` (`:311-312`) y distingue dos clases de fallo:
**recuperable**, `UNRECEIVED_TRANSPORT_PATTERN = /could not establish connection|receiving end does not exist/i`
(`:108-112`) — el mensaje no llegó a nadie, reintentarlo es seguro y despierta al SW dormido; el backoff
local es 250/500/1000/2000 ms (`:104-106`, `:314-316`) — y **fatal**,
`FATAL_TRANSPORT_PATTERN = /extension context invalidated/i` (`:114-122`) — la extensión se recargó o quedó
huérfana, se responde de inmediato. Cualquier otro fallo (el canal cerrado con el SW ya trabajando) **no**
se reintenta «sería un efecto duplicado» y se espera la resolución empujada hasta agotar
`TRANSPORT_TIMEOUT_MS = SIGN_TIMEOUT_MS + TIMEOUT_SAFETY_MARGIN_MS` (`:97-102`, `:406-408`); esos
temporizadores son locales al contexto y admisibles: «no son plazos de aprobación, el plazo lo posee
`chrome.alarms` en el SW» (`:292-298`).
### Instalación idempotente y orden de los canales

`installRelay` (`:565-597`) ejecuta cuatro pasos en orden deliberado: (1) canal **externo de entrada**
(`window.addEventListener('message', …)`) **antes** de inyectar nada, «para que el saludo EIP-6963 y la
primera petición encuentren siempre al relay escuchando» (`:567-580`); (2) canal **interno de entrada**
(`chrome.runtime.onMessage`) para respuestas empujadas y eventos (`:582-589`); (3) inyección **síncrona**
del provider (`:591-593`); (4) apertura del puerto de larga vida (`connectPort()`, `:595-596`). Es
idempotente por documento/frame mediante `__truekeateRelayInstalled__` (`:72-73`, `:599-603`). El puerto
lo abre `connectPort` (`:515-546`) con `chrome.runtime.connect({ name: APPROVAL_PORT_NAME })`, reenvía lo
que llegue con `forwardToPage` y, ante una desconexión, programa una reconexión con backoff 1/2/4/8/16 s
con tope de 30 s (`nextBackoffMs`, `:511-513`; constantes en `src/shared/constants.ts:237-239`); al
conectar reenvía un `RESUME` **solo si ya observó un `approvalId`**: «el puerto es canal de transporte y
correlación, nunca un *keep-alive*» (`:536-541`).

## Inyección del provider

### Cómo se construye la etiqueta `<script>`

`injectProviderBundle` (`src/content-script.ts:220-247`) crea un `<script>` con
`script.src = runtime.getURL(INJECT_SCRIPT_PATH)` — `INJECT_SCRIPT_PATH = 'inject.js'` (`:63-64`) —,
`script.async = false` y `script.setAttribute(RELAY_INJECT_ATTRIBUTE, '1')`, insertado en
`document.head ?? document.documentElement` (`:228-247`). El comentario explica por qué así y no con
`chrome.scripting`: «el manifest de mínimos privilegios retiró el permiso `scripting` (H-36/D-P) y
declara `inject.js` como `web_accessible_resource`» (`:220-227`); `async = false` garantiza que «la
ejecución respeta el orden de inserción respecto del resto de scripts» (`:236-237`).

#### Momento de la inserción y prueba de inyección

La inserción ocurre en el paso 3 de `installRelay` (`:591-596`), **después** de registrar el canal de
entrada del relay y **durante** `document_start`: «primero registra su propio canal de ENTRADA —para no
perder el saludo ni la primera petición— y acto seguido inyecta el bundle, de modo que `window.truekeate`
exista antes de cualquier script de la página» (`:12-17`). La etiqueta va marcada con
`data-truekeate-inject="1"`, «la prueba de inyección que M37 exige para creer que hay relay» (`:16-17`,
`:66-70`); del otro lado, `relayAttached()` comprueba en `document.currentScript` que el atributo vale
`'1'` (`src/inject/index.ts:107-121`): «Si el bundle se evalúa de otra forma, no hay content script al
que preguntar y el provider responde `4200` en lugar de dejar la promesa colgada» (`:108-111`). La
cabecera añade que ninguna otra ruta de carga (importación directa en un arnés o una copia servida por la
propia página) lleva la marca (`:43-49`). Como refuerzo, el provider y su alias se definen con
`Object.defineProperty(…, { writable: false, configurable: false, enumerable: true })` sobre
`window.truekeate` y `window.codecrypto` (`:212-220`), de modo que la página no puede reasignarlos ni
borrarlos (`:6-11`).

### Por qué el build de `inject` es `iife`

El bloque `vite.config.ts:9-28` lo razona en dos partes: (1) «`iife` -> `content-script.js` e `inject.js`:
un content script no admite `import` y el provider se inyecta como `<script>` sincrono en
`document_start`» (`:11-12`); (2) «`format: 'iife'` + `inlineDynamicImports: true` exigen UNA sola
entrada por build (Rollup rechaza el code-splitting en IIFE), de modo que hay un build IIFE por entrada:
build 1 = paginas + Service Worker (ES), build 2 = content-script (IIFE), build 3 = inject (IIFE, y es el
que genera y valida `dist/manifest.json`)» (`:20-23`). La configuración común fija `target: 'chrome114'`,
`format: 'iife'`, `inlineDynamicImports: true`, `emptyOutDir: false` y `publicDir: false` (`:148-175`). Un
bundle IIFE autocontenido es requisito del `<script>` clásico: cualquier `import` sería inválido en ese
contexto y el provider debe publicarse en el mundo de la página con una única evaluación.

### `web_accessible_resources` con `use_dynamic_url: true`

`src/manifest.ts:83-89` declara `resources: ['inject.js']` con `matches: ['<all_urls>']` y
`use_dynamic_url: true`: Chrome sirve `inject.js` a través de un **origen dinámico** propio de la
instalación en lugar de la URL literal `chrome-extension://<ID>/inject.js`. La consecuencia práctica es
que el ID de la extensión **no queda expuesto** en el `src` que la página puede leer, mientras que el
content script sigue obteniendo una URL válida porque la resuelve en tiempo de ejecución con
`chrome.runtime.getURL('inject.js')` (`src/content-script.ts:230-235`) en vez de componerla a mano. El ID
estable `EXTENSION_ID` (`src/manifest.ts:31`) sigue siendo el que consumen la allowlist CORS de Anvil y
`chrome-extension://<ID>/_favicon/`: `use_dynamic_url` afecta al recurso declarado, no a la identidad de
la extensión. El detalle de implementación del origen dinámico (caducidad exacta del identificador) no se
verifica dentro de este repositorio: **pendiente de confirmar** contra la documentación oficial.

## Ventanas de la extensión

### Las 3 páginas HTML y su tamaño declarado

| Página | Clase del `<body>` | Tamaño | Cita |
|---|---|---|---|
| `src/index.html` (popup) | `tk-popup` | 380 × 600 px | `src/index.html:8-11`, `src/styles/tokens.css:74-75` |
| `src/connect.html` (conexión) | `tk-connect` | 420 × 650 px | `src/connect.html:8-11`, `src/styles/tokens.css:76-77` |
| `src/notification.html` (confirmación) | `tk-notification` | 420 × 640 px | `src/notification.html:8-11`, `src/styles/tokens.css:78-79` |

Cada HTML es mínimo: metadatos, favicon, `<div id="root">` y el `main.tsx` de su vista
(`src/index.html:1-15`, `src/connect.html:1-15`, `src/notification.html:1-15`), con el tamaño normativo
en su comentario (`src/index.html:8`, `src/connect.html:8`, `src/notification.html:8`). Los valores viven
como variables en `src/styles/tokens.css:74-79` y se aplican al `body` en `src/styles/base.css:303-319`
(`width`/`height` con la variable y `overflow: hidden`); el comentario explica por qué la altura se fija
explícitamente: «Por eso la altura se fija aquí de forma explícita (nunca `100vh` en estas tres páginas),
y el contenedor interno la hereda al 100 % en lugar de estirarse a la altura de la pestaña» (`:296-300`),
y aclara que `test.html` no lleva esas clases porque allí el layout es fluido. Las reglas del contenedor
de montaje (`#root`, `.tk-window`) y la corrección que las motivó están en `:321-397`, con `@media` que
solo aplican el tamaño exacto cuando la ventana tiene al menos esas dimensiones.### Cómo se abren

#### `notification.html` y `connect.html`: `chrome.windows.create`; `index.html` (popup)

La ventana única se abre desde `showOldestPending` → `runShowOldestPending`
(`src/background/approvals/focus.ts:431-548`) con `windows.create({ url: notificationWindowUrl(…),
type: 'popup', width: NOTIFICATION_WINDOW_WIDTH, height: NOTIFICATION_WINDOW_HEIGHT, focused: true })`
(`:504-515`; medidas `420`/`640` en `:71-73`). La URL se compone con `chrome.runtime.getURL` y el
correlador `?approvalId=…&origin=…` (`:145-159`), porque «sin ese correlador la ventana no tiene nada que
pedir» (`:137-144`); `focusWindow` usa `chrome.windows.update(windowId, { focused: true })` solo al abrir
o al cambiar de solicitud (`:358-368`). La ventana de conexión se abre con el mismo patrón desde
`connections.ts`: compone `${getUrl(EXTENSION_ROUTE_CONNECT)}?requestId=…&origin=…` y llama a
`windows.create` con `type: 'popup'`, `width: CONNECT_WINDOW_WIDTH`, `height: CONNECT_WINDOW_HEIGHT` y
`focused: true` (`src/background/connections.ts:529-538`); las medidas `420`/`650` son constantes propias
(`:114-115`), y si la apertura falla la solicitud se rechaza con `4001` y **no** se persiste sesión
(`:539-544`). El popup, en cambio, no se abre con `chrome.windows.create`: lo declara el manifest como
`action.default_popup` (`src/manifest.ts:52-53`) y el navegador lo muestra al pulsar el icono, con las
dimensiones que fija el CSS de la página.

### La invariante de ventana ÚNICA de `notification.html` y el cierre con la X

`focus.ts` declara cinco invariantes (`src/background/approvals/focus.ts:13-31`); aquí importan tres: (1)
«**Como máximo UNA `notification.html` en toda la extensión**: `windowId !== null` implica exactamente una
ventana. Dos solicitudes simultáneas de orígenes distintos producen **una sola** llamada a
`chrome.windows.create` (el «leer → decidir → crear» va bajo un cerrojo)» (`:14-16`); (2) `shownApprovalId`
es SIEMPRE la `pending` más antigua (FIFO) y las demás esperan en la cola, sin ventana ni estado propio
(`:17-18`); (3) cuando la mostrada deja de estar `pending`, la **misma** ventana pasa a la siguiente y, si
no queda ninguna, se cierra y se persiste `windowId: null` (`:19-20`). El cerrojo que lo garantiza es
`focusLock` (`:259-267`), con el orden fijado: «se toma SIEMPRE `focusLock` antes que el `rmwLock` de
M14» (`:27-29`). El estado de la ventana es **persistido** (`truekeate_approval_window`, `:210-253`), así
que sobrevive a la suspensión del SW; de ahí el re-descubrimiento por URL (`findNotificationWindow`,
`:297-324`) y la comprobación de que la URL pertenece al origen de **esta** extensión
(`isNotificationTabUrl`, `:161-195`, que documenta el defecto D-H4-E5: comparar solo el `pathname` hacía
que una página de la dApp servida en `/notification.html` se diera por buena). El cierre del usuario lo
atiende `registerApprovalWindowListeners`, que registra `chrome.windows.onRemoved` de forma síncrona
(`:767-783`), y se interpreta así: «Cerrar con la X equivale a RECHAZO (`4001`), salvo que el plazo ya
haya vencido, en cuyo caso prevalece `expired`» (`:21-23`). Para no confundir ese cierre con los que hace
la propia extensión, el estado se marca cerrado **antes** de llamar a `windows.remove` (`:480-489`,
`:693-697`).

## Permisos

### `permissions`: los cinco declarados

`src/manifest.ts:62`: `['storage', 'alarms', 'favicon', 'clipboardRead', 'clipboardWrite']`. El
aislamiento del almacén **no** añade permisos: «El permiso `storage` ya está declarado en el manifest;
esta llamada no añade ninguno» (`src/background/security/accessLevel.ts:11`).

| Permiso | Para qué se usa en este proyecto | Cita |
|---|---|---|
| `storage` | Persistencia en `chrome.storage.local` (claves `truekeate_*`) y `setAccessLevel` | `src/background/security/accessLevel.ts:11`, `src/background.ts:31` |
| `alarms` | Dueño único del plazo: `truekeate_expire:<approvalId>` | `src/background/approvals/timeout.ts:16`, `src/shared/constants.ts:222-223` |
| `favicon` | Favicon del origen de la dApp para la ventana de decisión (`/_favicon/`) | `src/background/approvals/ports.ts:236-254` |
| `clipboardRead` | Política del portapapeles al ocultar un valor revelado | `src/shared/constants.ts:245-251` |
| `clipboardWrite` | Copia explícita de direcciones o valores desde la UI | `src/shared/constants.ts:245-251` |

### `optional_permissions`, hosts y `chrome.permissions.request`

`optional_permissions: ['notifications']` (`src/manifest.ts:63`); la razón está en el propio manifest:
«`notifications` vive SOLO en `optional_permissions` porque RF-39 pertenece al ciclo posterior»
(`:35-36`), es decir, se declara opcional desde el principio para no pedir en la instalación un permiso
que todavía no se usa. `host_permissions: ['http://127.0.0.1:8545/*', 'http://localhost:8545/*']`
(`:64`) son los dos orígenes del nodo local, coherentes con «monedero Ethereum no custodial para red
local Anvil (entorno de desarrollo, sin fondos reales)» (`:42-43`); la cabecera vincula el manifest a
«RF-23 (hosts)» (`:7`).

`optional_host_permissions: ['http://127.0.0.1/*', 'http://localhost/*', 'https://*/*']` (`:65`) es la
declaración sobre la que el alta de redes pide el permiso **en tiempo de ejecución**, y ese uso existe en
`src/background/networks/addChain.ts`: `getPermissionsApi()` lee `chrome.permissions` sin `any`
(`:270-285`); `hostPermissionPattern(rpcUrl)` compone el patrón `origen/*` (`:287-297`);
`requestHostPermission(rpcUrl)` consulta primero `contains({ origins: [pattern] })` y, si no está
concedido, llama a `request({ origins: [pattern] })` (`:299-345`); y se invoca siempre en el paso 4 del
alta, «también cuando el alta nace en el popup» (`:22-25`, `:450-455`). El defecto medido y su corrección
están documentados allí: «DEFECTO MEDIDO Y CORREGIDO AQUÍ (H5, `D-H5-A`): antes se llamaba a
`chrome.permissions.request` sin más, y ese API **exige un gesto de usuario en el contexto que llama**:
desde el Service Worker Chrome lo rechaza siempre con «This function must be called during a user
gesture» —medido incluso con el origen YA concedido—» (`:305-314`). De ahí las dos ramas: si la concesión
ya está vigente (`contains`) se acepta sin llamar a `request`; si no, un rechazo se responde como
denegación, `4001`, y la red **no** se persiste (`:310-320`). El gesto lo aporta la superficie que tiene
usuario —el popup— y para un alta nacida en una dApp quedaría la ventana de confirmación, reportado como
defecto `D-H5-B` con fallo observable `4001` sin persistir (`:316-320`). Existe una copia del mismo
comportamiento en el despacho de aprobaciones (`requestHostPermission`,
`src/background/approvals/dispatch.ts:442-481`), donde se afirma que la aprobación del usuario en la
ventana única **es** el gesto válido (`:447-451`).

### El build FALLA con ciertas combinaciones de permisos

`vite.config.ts:126-140` implementa las invariantes duras **sobre la fuente única**
(`DECLARED_PERMISSIONS = manifest.permissions`, `:66-67`), y las tres primeras **abortan el build**: falta
la `key` (`:126-128`); `notifications` dentro de `permissions` en vez de en `optional_permissions`
(«pertenece a `optional_permissions` (ADT-30/D-P)», `:129-133`); y cualquiera de los permisos retirados
`tabs`, `activeTab` o `scripting` (`:134-137`). La lista esperada está congelada también en la suite:
`EXPECTED_PERMISSIONS` y `RETIRED_PERMISSIONS` (`src/manifest/manifest.spec.ts:43-47`).
también en la suite: `EXPECTED_PERMISSIONS` y `RETIRED_PERMISSIONS`
(`src/manifest/manifest.spec.ts:43-47`).

## Límites de la plataforma

### Código remoto prohibido, CSP de MV3 y ausencia de `eval`

Manifest V3 no permite ejecutar código remoto: todo el JavaScript viaja en el paquete. Aquí la regla se
hace ejecutable en `scripts/lint-prohibited.mjs`, que revisa cada fichero de texto de `src/` y, si existe,
de `dist/`: prohíbe recursos remotos en el artefacto — `<script src="http…">`, `<link href="http…">`,
`@import http…`, `url(http…)`, `.src = 'http…'` — y una lista de hosts de CDN (`:43-56`, `:58-65`,
`:166-179`); prohíbe dependencias ajenas a `ethers` en la capa criptográfica (`viem`, `@scure/bip39`,
`@metamask/*`, `axios`) (`:8-13`, `:35-41`); prohíbe **llamadas propias a `fetch()`** — «el trafico RPC
sale unicamente por el proveedor del SW» (`:11`, `:139-144`) — y `chrome.storage.sync`: la persistencia es
`chrome.storage.local` (ADT-26) (`:12`, `:146-149`). Las fuentes también son locales (el paquete incluye
`public/fonts/*.woff2` con sus licencias) y el manifest **no** declara `content_security_policy` propia:
se usa la CSP por defecto de MV3, la que prohíbe el script remoto y la evaluación dinámica. En el código
de este repositorio no aparece ningún `eval` ni `new Function` (verificado por búsqueda sobre `src/`), y
la CSP por defecto de MV3 los impediría aunque se intentaran. Las decisiones que evitan la evaluación
dinámica están en el propio código: el content script **no** usa `chrome.scripting.executeScript` porque
ese permiso se retiró (`src/content-script.ts:220-227`) y el provider se inyecta como fichero declarado
`web_accessible_resource` (`src/manifest.ts:83-89`), con la marca de inyección como única prueba de
legitimidad (`src/inject/index.ts:107-121`).

### `chrome.storage.local` con `setAccessLevel('TRUSTED_CONTEXTS')` y cuota

`src/background/security/accessLevel.ts` (78 líneas) es el módulo M21: «Aislamiento del almacén:
`chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` en CADA arranque del Service
Worker» (`:1-4`). Motivo: «con el nivel por defecto, un content script inyectado en una página podría
leer `truekeate_mnemonic` y las claves privadas del almacén. El nivel TRUSTED_CONTEXTS deja fuera de
lectura a los content scripts y mantiene el acceso al Service Worker y a las páginas de la extensión
(popup, connect y notification)» (`:5-9`). `applyStorageAccessLevel` (`:57-78`) es idempotente, **no
lanza** y devuelve `false` si la API falta o falla, para no interrumpir el arranque; se invoca como
**primera** operación de `bootstrap`, «lo ANTES posible» (`src/background.ts:639-640`), antes de
cualquier lectura de estado. `hasSetAccessLevel` comprueba la disponibilidad y su comentario sitúa el
mínimo de plataforma: «Chrome la incorporó en la versión 102; el proyecto exige
`minimum_chrome_version: '114'`, así que en el navegador siempre existe, pero el stub de Vitest puede no
implementarla» (`:35-39`).

`STORAGE_QUOTA_BYTES = 10_485_760` (10 MB), «que es la cuota por defecto del almacén desde **Chrome 114**
—exactamente el `minimum_chrome_version` que exige el proyecto— y la que Chrome publica en
`chrome.storage.local.QUOTA_BYTES`» (`src/background/state/schema.ts:96-105`); el mismo comentario fija la
política: «**No** se declara `unlimitedStorage`: la política de §2.15 es reducir el consumo (retención
FIFO de M32) y hacer el desbordamiento OBSERVABLE» (`:101-103`). `getStorageQuotaApi()` devuelve
`chrome.storage.local` como superficie de cuota con `getBytesInUse(keys?)` y `QUOTA_BYTES` (`:153-174`);
`readStorageQuota` mide sin lanzar jamás —un fallo de la API devuelve `bytesInUse: null` (`:190-222`)— y
su informe incluye `usedRatio` y un indicador `warning` al llegar al 90 %
(`STORAGE_QUOTA_WARN_RATIO = 0.9`, `:107-112`, umbral aplicado en `:216`). La medición alimenta el evento
`sw_started` (`bytesInUse = (await local.getBytesInUse(null)) ?? null`, `src/background.ts:230-247`).

#### Modo de fallo observable de la cuota

`src/background/logging/logger.ts` implementa la política: si `set` se rechaza por cuota, **1 reintento**
tras aplicar la retención FIFO (`logLimit = 500` global, `logMaxPerOrigin = 200` por origen); si vuelve a
fallar, se **descarta** la entrada, se incrementa el contador que se publica en `wallet_getLogs.dropped`,
se avisa por consola y se intenta la entrada `storage_quota_exceeded` con el `rpc_error -32603` y el
mensaje «no se pudo guardar el registro por falta de espacio» en su `data` (`:25-31`). La detección tiene
fuente única: `isStorageQuotaError` compara nombre y mensaje contra `QuotaExceededError` y `QUOTA_BYTES`
(`src/background/state/schema.ts:114-151`). El contador se persiste en `truekeate_logs_dropped` «para
sobrevivir a la suspensión del Service Worker» (`src/background/logging/logger.ts:29-31`) y se reconstruye
al arrancar con `hydrateLogDiagnostics()` (`src/background.ts:641-643`). Regla de cierre: «**Nunca un
fallo silencioso** (riesgo R13)» (`:31`).

### El popup no toca el almacén (RNF-14)

**Solo el Service Worker** lee y escribe el almacén; el popup es UI pura: «**El popup es solo UI**
(RNF-14): no lee ni escribe el almacén de la extensión, no importa…» (`src/popup/walletState.ts:6`) y «el
Service Worker es el único custodio del estado» (`:139`). El popup replica literales de error en vez de
importarlos del SW porque la frontera de módulos lo impide (`src/popup/popupErrors.ts:13`) y tiene
prohibido `ethers` (`scripts/lint-prohibited.mjs:16`, `:134-137`). La misma regla alcanza a las ventanas:
la ventana de decisión recibe la solicitud **completa** en el sobre, «de modo que la ventana no necesita
leer el almacén (RNF-14)» (`src/background/approvals/ports.ts:64-72`), y `connect.html` la recibe por el
mismo camino (`src/background/connections.ts:701-704`). El reparto es viable por la plataforma:
`setAccessLevel('TRUSTED_CONTEXTS')` deja a los content scripts fuera de lectura y el canal
`chrome.runtime` es el único puente entre la UI y el SW.

## Compatibilidad

### Chrome/Edge >= 114 y APIs con versión mínima

El mínimo se declara en el manifest: `minimum_chrome_version: '114'` (`src/manifest.ts:45`), y la
cabecera lo asocia a RNF-04 (`:7`). Se aplica también al compilado, en los dos puntos donde se fija el
`target`: build 1 (páginas + Service Worker), `target: 'chrome114', // RNF-04/A2`
(`vite.config.ts:245`), y builds IIFE (content script e inject), `target: 'chrome114'` dentro de
`iifeBuildConfig` (`:162`). La salida no usa sintaxis que Chrome 114 no entienda y el paquete se puede
cargar en Chrome y en Edge, ambos basados en Chromium.

| API | Dónde se usa | Versión mínima | Cita / estado |
|---|---|---|---|
| `chrome.storage.local.setAccessLevel` | aislamiento del almacén (M21) | **102** (según el código) | `src/background/security/accessLevel.ts:35-39` |
| `chrome.storage.local.QUOTA_BYTES` = 10 MB | cuota observable | **114** (según el código) | `src/background/state/schema.ts:96-105` |
| `chrome.storage.local.getBytesInUse` | medición de cuota en `sw_started` | pendiente de confirmar | `src/background/state/schema.ts:153-174` |
| `chrome.alarms.create/clear/getAll/onAlarm` | dueño del plazo (M15) | pendiente de confirmar | `src/background/approvals/timeout.ts:70-111` |
| `chrome.runtime.connect` / `onConnect` y `chrome.runtime.getURL` | canal `truekeate_approval` y `/_favicon/` | pendiente de confirmar | `src/shared/constants.ts:219-220`, `src/background/approvals/ports.ts:236-254` |
| `chrome.windows.create/get/getAll/update/remove/onRemoved` | ventana única (M18) y conexión | pendiente de confirmar | `src/background/approvals/focus.ts:75-110`, `:771-783` |
| `chrome.permissions.request` / `contains` | permiso de host al dar de alta una red | pendiente de confirmar | `src/background/networks/addChain.ts:263-345` |
| `chrome.tabs.sendMessage(tabId, msg, { frameId })` | entrega de respuestas al frame exacto | pendiente de confirmar | `src/background/approvals/ports.ts:467-516` |
| `use_dynamic_url` en `web_accessible_resources` | origen dinámico de `inject.js` | pendiente de confirmar | `src/manifest.ts:83-89` |

Las dos filas con cifra son las que el propio repositorio documenta con número; las marcadas «pendiente
de confirmar» se usan en el código pero **su versión de introducción no está verificada dentro del
repositorio**, así que no se afirma ninguna cifra. El mínimo declarado de 114 está por encima de las dos
cifras conocidas (102 y 114).

### Nota sobre el ID y la firma

Como el ID deriva de la `key` (`src/manifest.ts:14-31`), cualquier instalación del paquete —de
desarrollo o empaquetada— obtiene el **mismo** ID (`oiahebaliobknoeeonhgaacapjcpgblo`). Eso hace
reproducibles la allowlist CORS de Anvil, la ruta `chrome-extension://<ID>/_favicon/` y la suite E2E en
cualquier equipo, y hace que la clave privada **no** sea necesaria para el funcionamiento del proyecto.
