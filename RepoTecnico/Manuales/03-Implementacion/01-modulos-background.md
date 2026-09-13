# 01 — Núcleo del Service Worker (arranque, estado, RPC y observabilidad)

> **Propósito.** Documentar el núcleo del *Service Worker* (SW) de **TrueKeate Wallet**: la secuencia
> real de arranque de `src/background.ts`, el registro de sus canales, el router RPC
> (`src/background/rpc/router.ts`), el catálogo cerrado de métodos, el cliente JSON-RPC, el catálogo de
> errores EIP-1193, el esquema de `chrome.storage.local` con sus migraciones y el servicio de
> observabilidad. Toda referencia es `ruta:línea`, verificada leyendo la línea citada.
>
> **Conteos medidos** (el enunciado daba otros; se usan los reales): `src/background.ts` **699**,
> `rpc/router.ts` **780**, `rpc/catalog.ts` **1338**, `rpc/errors.ts` **688**, `rpc/client.ts` **359**,
> `rpc/internalMethods.ts` **48**, `rpc/pageMethods.ts` **329**, `state/schema.ts` **662**,
> `state/serialLock.ts` **51**, `state/migrations.ts` **392**, `logging/logger.ts` **759**,
> `logging/events.ts` **403**, `logging/retention.ts` **148**, `background/events.ts` **195**.

## Arranque (`src/background.ts`, M2)
### Secuencia real de `bootstrap()`
#### Los ochos pasos, con su línea de llamada
`bootstrap()` está declarado en `src/background.ts:638` y exportado para que las pruebas lo invoquen:
cada invocación **es** un arranque y escribe **su** entrada `sw_started`. La secuencia real es esta (el
comentario del encabezado, `src/background.ts:5-17`, la numera del 1 al 6 y omite los pasos 1.b y 3):

| # | Paso | Llamada real | Línea | Qué hace |
|---|---|---|---|---|
| 1 | Aislamiento del almacén (M21) | `await applyStorageAccessLevel()` | `:640` | `accessLevel: 'TRUSTED_CONTEXTS'` lo antes posible, para que ningún content script lea `truekeate_mnemonic` ni las claves |
| 1.b | Diagnóstico de logs (M30/§2.15) | `await hydrateLogDiagnostics()` | `:643` | Reconstruye el contador de descartes por cuota, para que siga visible en `wallet_getLogs.dropped` tras una suspensión |
| 2 | Migraciones de esquema (M34) | `const migration = await runMigrationsPhase()` | `:645` | Migra v1.2 → v1.4 **antes** de leer estado |
| 3 | Red por defecto (M23) | `await seedDefaultNetworkPhase()` | `:647` | Siembra Anvil local (`0x7a69`, `isDefault: true`) en `truekeate_networks` y fija `truekeate_chain_id` si falta o es inválido |
| 4 | Integridad (M13) | `const integrity = await runIntegrityPhase()` | `:649` | Checksum BIP-39 y EIP-55: puede dejar la cartera «dañada» sin derivar nada en silencio |
| 5 | Auto-carga del estado (M33/M28/M29) | `const autoLoaded = await autoLoadStatePhase()` | `:651` | Una sola lectura de claves canónicas reconstruye cuenta activa, red, importadas, etiquetas y sesiones (`CA-RF-09`/`CA-RF-10`) |
| 6 | Reconciliación de plazos (M16) | `const reconciliation = await runApprovalReconciliation()` | `:655` | Purga la cola, responde `4001` a las huérfanas, rearma `chrome.alarms`, reconstruye `truekeate_inflight_tx`/`truekeate_rate_windows`, restablece la ventana única y escribe **UNA** entrada `sw_reconcile` |
| 7 | Log de arranque | `await writeStartupLog(snapshot)` | `:670` | **UNA sola** entrada `sw_started` por arranque |

El paso 3 (red por defecto) corre **después** de las migraciones y **antes** de la integridad
(`src/background.ts:647`), porque la integridad y la auto-carga ya necesitan una red activa válida.
`bootStartedAt` se captura antes de cualquier `await` (`:121`), `bootMs` se calcula en `:657` y la
instantánea se construye y se asigna al estado volátil en `:658-667` (`bootSnapshot = snapshot;`).

#### Fases normalizadas (tolerantes a fallo)
Cada fase envuelve su módulo real en un `try/catch` que **nunca rompe el arranque**:
`asMigrationSnapshot` (`:266`) y `runMigrationsPhase` (`:307`, degrada a `{ ok: false, … }` en
`:309-313`); `asIntegritySnapshot` (`:283`, con `status !== 'damaged'` ⇒ `ok: true` en `:300`) y
`runIntegrityPhase` (`:321`, degrada a `{ ok: false, status: 'damaged', problems:
['integrity-check-failed'] }` en `:329-332`); `autoLoadStatePhase` (`:355`, usa `readStorage`, que
nunca lanza, y devuelve `empty` con almacén vacío en `:377-379`); `seedDefaultNetworkPhase` (`:410`,
avisa por consola y continúa en `:413-415`); y `runApprovalReconciliation` (`:447`, degrada a
`{ pendingProcessed: 0, elapsedMs, logged: false }` en `:459-464`).

#### `writeStartupLog` y la entrada `sw_started`
`writeStartupLog` (`:230`) mide la cuota con `getStorageQuotaApi()` y `local.getBytesInUse(null)`
(`:231-239`) y llama a `logEvent` (`:242-255`) con `event: 'sw_started'`, `origin: 'extension'` y
`data` = `bytesInUse`, `bootMs`, `schemaVersion`, `migrations`, `integrity: { ok, status }`,
`autoLoaded` y `pendingProcessed`. Un fallo de escritura no rompe el arranque: solo avisa por consola
(`:256-258`). Aquí no se duplica la construcción de la entrada, ni la retención FIFO, ni el modo de
fallo de la cuota: eso es de M30 (`:219-229`).

### Registro SÍNCRONO de los listeners
El bloque de registro corre **sin `await`**, al final del primer ciclo de evaluación, para que si el SW
se despierta por una conexión, una alarma, un mensaje o el cierre de la ventana única todos los canales
existan ya (`src/background.ts:673-676`): `registerApprovalPortListener()` (M17, puerto
`truekeate_approval`, `:677`); `registerExpiryAlarmListener({ onInflightRelease: (account) =>
releaseInflightOnAlarm(account) })` (M15, `:678-680`); `registerApprovalWindowListeners()` (M18,
ventana de decisión única, `:681`); y `registerRpcMessageListener()` (M3, `chrome.runtime.onMessage`,
`:682`).

### Disparadores del arranque
Tras el registro, se obtiene `chrome.runtime` con `runtimeApi()` (`:684`) y se enganchan `onInstalled`
(`:686-690`) y `onStartup` (`:691-695`), ambos con `void bootstrap()`. El **arranque inmediato** para el
caso «SW despertado por un evento, no por instalación ni por navegador» está en `:699`
(`void bootstrap();`).

### `BootSnapshot`, `getBootSnapshot` e `isWalletDamaged`
#### Estructura declarada
`BootSnapshot` (`:198-206`) tiene `startedAt`, `bootMs`, `schemaVersion`, `migration:
MigrationSnapshot`, `integrity: IntegritySnapshot`, `autoLoaded: AutoLoadedState` y `reconciliation:
ReconciliationSnapshot`; los tipos auxiliares están en `:167`, `:175`, `:185` y `:419`. El estado
volátil es `let bootSnapshot: BootSnapshot | null = null;` (`:209`).

#### Accesores
`export const getBootSnapshot = (): BootSnapshot | null => bootSnapshot;` (`:212`) y
`export const isWalletDamaged = (): boolean => bootSnapshot !== null && !bootSnapshot.integrity.ok;`
(`:215-216`). Es decir: **sin instantánea todavía la cartera NO se considera dañada**; solo
`integrity.ok === false` (`status === 'damaged'`) la marca como tal.

#### Qué usa la UI
`getBootSnapshot` e `isWalletDamaged` **no tienen ningún consumidor en `src/`**: buscar
`getBootSnapshot|isWalletDamaged` en `src/**` solo devuelve sus dos declaraciones (`:212` y `:215`), y
tampoco aparecen en `test/`. Son superficie exportada para pruebas/diagnóstico — **pendiente de
confirmar** si algún consumidor externo (e2e o panel) los usa.

La UI **no** consume la instantánea: consume el método interno `wallet_getState`. El popup lo invoca en
`src/popup/walletState.ts:145` y su tipo de respuesta está en `src/popup/walletState.ts:87`. En el SW lo
atiende `handleGetState` (`src/background/rpc/catalog.ts:1003`), que **recalcula** la integridad con
`deps.integrity.checkWalletIntegrity()` (`:1005`) en vez de leer `bootSnapshot`, y devuelve `hasWallet`,
`integrity` (`status`, `label`, `problems`, `mnemonicPresent`, `mnemonicValid`, `canDerive`),
`accounts`, `currentAccountRef`, `networks`, `currentChainId`, `settings` y `connectedSites`
(`:1008-1024`). Es la vía por la que el popup pinta «wallet dañada» sin tocar el almacén
(RNF-14/RNF-22).

## Registro del listener de mensajes (`registerRpcMessageListener`)
### Discriminante por tipo
`registerRpcMessageListener` está en `src/background.ts:561`. Obtiene la API con `runtimeApi()` y sale
sin hacer nada si no hay `onMessage.addListener` (`:562-565`). El listener se registra en `:566` y su
discriminante es: (1) **no es del protocolo** —`record === null ||
!isTruekeateMessageType(record.type)`— ⇒ `return undefined` (`:568-571`), sin responder y sin retener
el canal, para no dejar colgada a otra superficie; el predicado real es `isTruekeateMessageType`
(`src/shared/protocol.ts:161`), que reconoce los **8** tipos cerrados de `src/shared/protocol.ts:35-43`;
(2) **`SIGN_RESPONSE`** (`:572`), decisión del usuario en `notification.html`; (3)
**`CONNECT_RESPONSE`** (`:590`), elección en `connect.html`; y (4) **el resto** (`TRUEKEATE_RPC`,
`RESUME`, `TRUEKEATE_REQUEST`, `TRUEKEATE_RESPONSE`, `TRUEKEATE_EVENT`, `TRUEKEATE_ANNOUNCE`) cae en
`handleRpcMessage` (`:605`), que responde `4200` a los tipos del protocolo que no son `TRUEKEATE_RPC`
(`src/background/rpc/router.ts:722-728`).

### El `return true` asíncrono
Los tres caminos devuelven `true` (`:588`, `:603`, `:627`). Es la semántica de `chrome.runtime` («la
respuesta llegará de forma asíncrona») y es obligatorio porque el despacho de los métodos internos toca
el almacén (`:556-558`). El mensaje que no pertenece al protocolo devuelve `undefined` y, por tanto,
**no** se marca como asíncrono.

### `deliverToPage`
`deliverToPage` (`:480`) entrega una lectura de página a su pestaña y, con `frameId !== 0`, **SOLO** a
ese frame (DEC-40/ADT-07): sin `tabId` no hay destinatario (`:484-486`); sin API `chrome.tabs` tampoco
(`:487-490`); el mensaje es `{ type: 'TRUEKEATE_RESPONSE', ...response }` (`:491`); con `frameId !==
null && frameId !== 0` se envía con `{ frameId }` (`:493-494`) y si no sin opciones (`:496`); y un fallo
de entrega (pestaña sin content script o cerrada) se ignora y devuelve `false` (`:499-501`), porque la
respuesta ya viajó por `sendResponse` cuando procedía. La respuesta se entrega **dos veces** cuando el
emisor es un content script: por `onMessage` (`sendResponse(routed.response)`, `:614`) y a la pestaña
(`await deliverToPage(routed.target, routed.response)`, `:615`). Si el router no reconoce el mensaje
(`routed === undefined`), se acusa recibo sin cuerpo (`:607-610`).

### Orden obligatorio y su motivo real
`handleSignResponseMessage` (`:532-536`) delega en `handleSignResponse` con `{ refresh: false }`.
`refreshApprovalWindowAfterDecision` (`:543`) ejecuta `showOldestPending({ repush: true })` y nunca
propaga el fallo (`:546-548`). El orden **obligatorio** lo fija el comentario de `:517-531` (cierre de
`D-H4-E10`): primero se **responde al emisor** (`sendResponse({ ok: true, outcome })`, `:577`) y
**después** se hace la pasada de la ventana única (`await refreshApprovalWindowAfterDecision()`,
`:578`). **Motivo real**: al re-renderizar, M18 empuja a la ventana el cuerpo de la siguiente solicitud;
si ese empuje llega **antes** que la respuesta de su propio `SIGN_RESPONSE`, la ventana marca la vista
como resuelta —botón «Aprobar» deshabilitado— aunque muestre la solicitud correcta, y **la cola se queda
atascada**. Responder primero y re-empujar después elimina la carrera. La ventana **decide, no firma**
(`CA-RF-35`): la firma y la difusión las aplica el despacho de M19.b, que espera el desenlace de esa
misma entrada.

### Traducción de toda excepción a error EIP-1193
Ninguna excepción escapa del listener (`:559`). Cada `catch` llama a `internalError` (M6) con un
`reason` distinto y un `detail` que es el `message` del `Error` o `'unhandled'`: `'sign-response'`
(`:582-585`), `'connect-response'` (`:597-600`) y `'rpc-listener'`, la «última red de seguridad: jamás
un error sin `code` hacia el popup» (`:619-623`). `internalError` es `src/background/rpc/errors.ts:585`
y produce `code: -32603` con el literal «Error interno de la cartera.»
(`src/background/rpc/errors.ts:180-182`).

## Router RPC (`src/background/rpc/router.ts`, M3)
### Flujo real de un mensaje `TRUEKEATE_RPC`
El despacho puro vive en `dispatchRPCRequest` (`src/background/rpc/router.ts:513`), envuelto por
`handleRPCRequest` (`:457`), que añade la traza. Los pasos, en orden:

#### 1. Redacción de `params` (M22) — `:520-521`
`redactSafely` (`:432`) llama a `deps.redactParams`; si la política falla, avisa y devuelve `[]`
(`:435-438`), porque es preferible perder detalle de traza antes que filtrar un secreto (H-42/RNF-09).

#### 2. Guardas de `sender` (M20) — `:529-536`
`isCatalogMethod(method)` decide el `guardedMethod` y se llama a `guardSender(sender, declared,
guardedMethod)`. Si la guarda falla, se devuelve el error con `context: null` y `target: NO_TARGET`
(`:532-534`); si no, `context = guard.context` y `target = responseTargetFor(guard.context)`
(`:535-536`). `NO_TARGET` es `{ tabId: null, frameId: null }` (`:150`). El `origin` se recalcula SOLO
desde `sender.origin` (D-J/ADT-07).

#### 3. Clasificación del método — `:538-547`
Método fuera del catálogo ⇒ `unsupportedMethodError()` (`4200`) con el contexto ya fijado (`:539-541`);
es el caso real de **`eth_sign`**, que la unión cerrada deja fuera (`src/shared/types.ts:118`) y que
responde `4200` **sin existir** en el catálogo (`src/background/rpc/router.ts:44-45`). Método declarado
pero **sin implementación** ⇒ también `4200`, sin lanzar de forma síncrona (`:542-547`); desde H4
`getCatalogEntry` solo devuelve entradas declaradas **e** implementadas
(`src/background/rpc/catalog.ts:515-516`). La distinción interno `wallet_*` / página EIP-1193 /
aprobable la dan los metadatos: `isInternalMethod` (`catalog.ts:486`), `isPageMethod` (`:490`),
`isExtensionInvokable` (`:503`) y `entry.requiresApproval` (`router.ts:596`).

#### 4. Allowlist de contextos — `:549-564`
`extensionOnly = isInternalMethod(method) || isExtensionInvokable(method)` (`:555`). Si es
`extensionOnly`, el contexto **no** es de la extensión y el método **no** es `isExtensionInvokable`, se
responde `4200 methodNotAllowedInContextError()` (`:556-564`). Las excepciones declaradas son la
revocación del popup y los dos métodos de red.

#### 5. Limitador de tasa (M3.b) — `:566-571`
`const rate = await deps.decideRateLimit({ origin: context.origin, now: deps.now() })`; si
`!rate.allowed` ⇒ `rateLimitExceededError()` (`4001`) **sin abrir ventana y sin llamar al nodo**. El
*token bucket* cubre **TODO** el catálogo (también las lecturas), está persistido en
`truekeate_rate_windows` y los contextos de la extensión están exentos
(`src/background/rpc/rateLimit.ts:94`); el límite efectivo es 6 solicitudes / 60 s por origen
(`src/shared/constants.ts:194` y `:197`). Justo después hay una defensa en profundidad: si
`method === 'wallet_revealSecret'` y el contexto no es confiable, se responde
`methodNotAllowedInContextError()` (`:573-576`).

#### 6. Despacho de los aprobables — `:578-609`
`isNetworkMethod` (`:591-592`) y `revocacionDesdeElPopup` (`:594-595`) se excluyen del ciclo genérico.
Cuando `entry.requiresApproval && !isNetworkMethod && !revocacionDesdeElPopup`, se llama a
`deps.approve({ method, params, context, now: deps.now(), ...requestId })` (`:597-605`) y el resultado
se traduce a la forma del router (`:606-608`). El `requestId` se transporta sin interpretarlo
(`:602-604`).

#### 7. Despacho de lecturas, red e internos — `:611-660`
Con `entry.resolve === true` se construye `PageCallContext` y se llama a
`deps.invokePage(method, params, call, deps.page)` (`:612-623`). Con `isNetworkMethod` se llama a
`deps.network.switchChain` o `deps.network.addChain`, con la cuenta de sesión resuelta por
`sessionAccountFor` (`:631-653`). En cualquier otro caso se llama a
`deps.invokeInternal(method as InternalMethod | 'wallet_revokePermissions', params, context)`
(`:655-659`).

#### Cierre: ninguna excepción sin `code` — `:661-670`
`toEip1193Error` (`:674-677`) devuelve el error tal cual si `isEip1193Error` o construye
`internalError({ reason: 'unhandled-exception', method })`.

### Traza de observabilidad
`handleRPCRequest` (`:457`) ejecuta el despacho y **después** `traceRouteCall` (`:483`). Cada llamada
del catálogo deja **exactamente 1 entrada** en `truekeate_logs` (RNF-16): `rpc_call` (`category:
'call'`, `level: 'info'`) con los `params` ya redactados cuando se resolvió (`:490-496`), o `rpc_error`
(`category: 'call'`, `level: 'warn'`) con `code` y `message` cuando falló (`:498-503`). El origen de la
traza se recalcula en `traceOrigin` (`:467`), que cae a `EXTENSION_ORIGIN` (`'extension'`,
`src/shared/constants.ts:226`) si la URL del emisor no es parseable.

### Nombres reales de funciones y líneas
Todo se declara como `const` flecha, así que no hay ningún `async function`:
`NO_TARGET` (`:150`), `redactSafely` (`:432`), `traceOrigin` (`:467`), `traceRouteCall` (`:483`),
`dispatchRPCRequest` (`:513`), `asRecord` (`:684`); las factorías internas `rpcClient` (`:275`),
`sessionsApi` (`:281`), `eventsApi` (`:290`), `openConnect` (`:300`), `networkRunner` (`:325`),
`runNetworkCycle` (`:347`) y `sessionAccountFor` (`:375`). Exportados: `toRpcResponse` (`:153`),
`defaultRouterDeps` (`:383`), `handleRPCRequest` (`:457`), `toEip1193Error` (`:674`),
`handleRpcMessage` (`:709`), `createCatalogInvoker` (`:768`) y la reexportación
`export { canonicalKeyProblem } from '../state/schema';` (`:117`). Tipos: `RpcResponse` (`:128`),
`RouterResult` (`:131`), `RedactParams` (`:165`), `InternalInvoker` (`:168`), `PageInvoker` (`:176`),
`ApprovalInvoker` (`:188`), `RateLimitDecider` (`:201`), `NetworkDispatchDeps` (`:212`),
`NetworkDispatchOutcome` (`:230`), `NetworkCycleInput` (`:241`), `NetworkCycleInvoker` (`:252`),
`RouterDeps` (`:255`), `HandleRpcRequestParams` (`:416`), `RoutedMessage` (`:690`),
`CatalogInvoker` (`:758`).

### `RoutedMessage` y `RpcResponse`
`RpcResponse` (`:128`) es una unión **excluyente**: `{ result: unknown }` **o** `{ error: Eip1193Error }`,
nunca los dos; el `error` es SIEMPRE un objeto EIP-1193 con `code` numérico (ACU-05/RNF-06), y lo
produce `toRpcResponse` (`:153-154`). `RoutedMessage` (`:690-695`) lleva `response: RpcResponse`,
`target: ResponseTarget` y `context: TrustedSenderContext | null`; lo construye `handleRpcMessage`
(`:709`), que devuelve `undefined` si el mensaje no es del protocolo (`:715-717`),
`{ error: unsupportedMethodError(), target: NO_TARGET, context: null }` si es del protocolo pero no es
`TRUEKEATE_RPC` (`:722-728`) y el resultado real de `handleRPCRequest` (`:729-750`).

## Catálogo RPC (`src/background/rpc/catalog.ts`, M4)
### Estructura real del catálogo
Se declara en tres niveles. **(1) Listas de nombres**: `PAGE_READ_METHODS` (`:146`, las 10 lecturas),
`PAGE_APPROVAL_METHODS` (`:160`, los 6 aprobables), `INTERNAL_METHODS` (`:175`, reexportado del módulo
hoja `./internalMethods`; la reexportación es deliberada porque elimina el ciclo
`catalog → sessions → senderGuard → catalog` que hacía frágil la guarda de emisor según el orden de
evaluación, defecto `D-H3-C`), `EXTENSION_INVOKABLE_INTERNAL_METHODS` (`:190`, los `wallet_*` que el
popup puede invocar: `wallet_revokePermissions`, `wallet_switchEthereumChain`,
`wallet_addEthereumChain`) y `CATALOG_METHODS` (`:197`, las tres listas concatenadas). **(2) Metadato
por método**, `CatalogEntry` (`:214-227`): `method`, `kind: 'read' | 'approval' | 'internal'` (`:208`),
`context: 'page' | 'extension' | 'any'` (`:211`), `requiresApproval` (`true` cuando abre la ventana
única), `implemented` (`true` cuando su implementación vive ya en el SW) y `resolve` (`true` cuando el
router debe construir el contexto de página y despachar por `rpc/pageMethods.ts`). **(3) Mapas de
entradas**: `INTERNAL_ENTRIES` (`:230`), `PAGE_READ_ENTRIES` (`:377`), `PAGE_APPROVAL_ENTRIES`
(`:398`), `REVOKE_ENTRY` (`:419`), `NETWORK_ENTRIES` (`:441`) y el mapa final `CATALOG` (`:472`);
`supportedMethods` (`:465`) es la lista de los implementados.

La validación de parámetros **no** vive en el catálogo genérico: cada manejador estrecha su `params[0]`
con sus propias ayudas, por ejemplo `asRevealTarget` (`:945-959`) o `asPayload`/`asAccountRef`
(`:1068-1069`); el único método validado fuera del manejador es la guarda de contexto de
`wallet_revealSecret` en el router (`src/background/rpc/router.ts:573-576`).

### Familias y línea de inicio
- **Cuentas** (internos, M28): entradas desde `:231`; manejadores `handleGenerateMnemonic` `:859`,
  `handleImportMnemonic` `:869`, `handleDeriveAccounts` `:881`, `handleImportPrivateKey` `:896`.
- **Estado y UI** (internos, v1.6): entradas desde `:292`; manejadores desde `handleGetState` `:1003`
  hasta `handleAcceptDevNotice` `:1184`.
- **Conexión** (interno, v1.7): `wallet_getConnectRequest`, entrada `:360`, manejador `:1039`.
- **Revelado de secretos** (interno): `wallet_revealSecret`, entrada `:281`, manejador `:969`.
- **Observabilidad** (interno): `wallet_getLogs`, entrada `:271`, manejador `:928`.
- **Revocación**: `REVOKE_ENTRY` `:419`, manejador `handleRevokePermissions` `:1206`, registro popup
  en `EXTENSION_HANDLERS` `:1255`.
- **Chain / red**: `handleGetNetworks` `:907`; `wallet_switchEthereumChain` y `wallet_addEthereumChain`
  en `NETWORK_ENTRIES` `:441`.
- **Bloque, saldo y gas** (lecturas de nodo): `PAGE_READ_METHODS` `:146`; manejadores en
  `rpc/pageMethods.ts` — `handleChainId` `:173`, `handleBlockNumber` `:179`, `handleGasPrice` `:182`,
  `handleGetBalance` `:185`, `handleFeeHistory` `:195`, `handleEstimateGas` `:207`.
- **Cuentas de página**: `handleAccounts` `rpc/pageMethods.ts:234` y `handleRequestAccounts` `:249`.
- **Transacciones y firmas (aprobables)**: `eth_sendTransaction`, `eth_signTypedData_v4`,
  `personal_sign` en `PAGE_APPROVAL_METHODS` `:160-167`; el recibo y la transacción por hash son
  lecturas, `handleGetTransactionByHash` `rpc/pageMethods.ts:222` y `handleGetTransactionReceipt`
  `:226`.
- **Despacho**: `INTERNAL_HANDLERS` (`:1232`), `EXTENSION_HANDLERS` (`:1255`), `defaultInternalDeps`
  (`:1267`) e `invokeInternalMethod` (`:1324`).

Ayudas de consulta: `isCatalogMethod` (`:482`), `isInternalMethod` (`:486`), `isPageMethod` (`:490`),
`isSupportedMethod` (`:495`), `requiresPageResolution` (`:499`), `isExtensionInvokable` (`:503`),
`exposesEthSign` (`:507`), `getCatalogEntry` (`:515`), `getDeclaredEntry` (`:519`). El contrato de
retorno se transcribe en `InternalWalletResultMap` (`:531`): `wallet_getLogs` devuelve `{ entries:
LogEntry[]; truncated: boolean; dropped: number }` (`:541`) y `wallet_getState` se declara en `:546`.

### Qué queda FUERA del catálogo
**`eth_sign`**: no está en ninguna unión (`src/shared/types.ts:53-54` y `:115-116`) ni en ninguna lista
del catálogo; `exposesEthSign()` (`:507-508`) debe devolver SIEMPRE `false` y el router lo rechaza con
`4200` por la unión cerrada (`src/background/rpc/router.ts:538-541`). También quedan fuera las
categorías de log usadas como nombres (`system`, `call`, `tx`, `sign`, `event` son categorías,
`src/background/logging/events.ts:36`) y los nombres heredados de almacén, cuyo tratamiento es de M34.

## Métodos internos y de página
### `src/background/rpc/internalMethods.ts` (M4.a)
Es un **módulo HOJA**: su única importación es `import type { InternalMethod }` (`:25`), que el
compilador borra, así que no depende de ningún otro módulo en tiempo de ejecución. `INTERNAL_METHODS`
se declara en `:28` con `as const satisfies readonly InternalMethod[]` (`:48`), de modo que la lista
está **atada por tipos** a la unión cerrada. Sus **16** entradas: `wallet_generateMnemonic` (`:30`),
`wallet_importMnemonic` (`:31`), `wallet_deriveAccounts` (`:32`), `wallet_importPrivateKey` (`:33`),
`wallet_getNetworks` (`:34`), `wallet_getLogs` (`:35`), `wallet_revealSecret` (`:36`),
`wallet_getState` (`:38`), `wallet_setCurrentAccount` (`:39`), `wallet_addDerivedAccount` (`:40`),
`wallet_renameAccount` (`:41`), `wallet_setAccountVisible` (`:42`),
`wallet_deleteImportedAccount` (`:43`), `wallet_resetWallet` (`:44`), `wallet_acceptDevNotice` (`:45`)
y `wallet_getConnectRequest` (`:47`). La allowlist se aplica en la guarda de emisor y en el router:
solo se aceptan desde contextos de la extensión (`:27`), y desde un content script la respuesta es
`4200`. `eth_sign` no está ni estará en la lista (`:20`).

### Unión `InternalMethod` en `src/shared/types.ts` (M55)
`InternalMethod` se declara en `src/shared/types.ts:73` y enumera los mismos 16 nombres (`:75-97`),
agrupados por contrato original (H2), ampliación v1.6 (estado y UI) y ampliación v1.7 (entrega de la
solicitud de conexión). Se acompaña de `PageReadMethod` (`:100`, 10 lecturas),
`PageMethod = PageReadMethod | ApprovalMethod` (`:118`), `WalletMethod = PageMethod | InternalMethod`
(`:121`) y `ApprovalMethod` (`:56`, 6 métodos). Como el catálogo declara
`satisfies readonly InternalMethod[]`, añadir un nombre a la unión sin declararlo en la lista —o al
revés— **no compila**.

### `src/background/rpc/pageMethods.ts` (M4.b)
Registro **CERRADO** de las **10 lecturas de página** en `PAGE_READ_HANDLERS` (`:293`), congelado con
`Object.freeze`: `eth_chainId`→`handleChainId` (`:173`, registro `:294`), `eth_blockNumber`→`:179`
(`:295`), `eth_gasPrice`→`:182` (`:296`), `eth_getBalance`→`:185` (`:297`), `eth_feeHistory`→`:195`
(`:298`), `eth_estimateGas`→`:207` (`:299`), `eth_getTransactionByHash`→`:222` (`:300`),
`eth_getTransactionReceipt`→`:226` (`:301`), `eth_accounts`→`:234` (`:302`) y
`eth_requestAccounts`→`:249` (`:303`). La allowlist se comprueba con `isPageReadMethod` (`:307`) y el
despacho con `invokePageMethod` (`:315`), que lanza `unsupportedMethodError()` si el método no tiene
manejador (`:321-324`) y `missingDeps` (`:130`) si faltan dependencias (`:325-327`). Detalles reales:
`eth_chainId` consulta al nodo por el cliente único y cae a `DEFAULT_CHAIN_ID` si la respuesta no es
hexadecimal (`:173-176`); `eth_estimateGas` **no** devuelve `4900` ante un rechazo determinista, lo tipa
como `-32000 estimateGasFailed` con el motivo del nodo (`:207-219`); `eth_accounts` **nunca** abre
ventana y renueva `expiresAt = lastUsedAt + 86400000` (`SESSION_TTL_MS`, `src/shared/constants.ts:104`)
devolviendo la cuenta o `[]` (`:234-242`); y `eth_requestAccounts` resuelve la sesión vigente sin nuevo
*prompt* emitiendo `connect`, o abre `connect.html` y, si se cancela, lanza `4001 userRejectedError`
(`:249-286`).

## Cliente JSON-RPC (`src/background/rpc/client.ts`, M5)
### Provider único
`getRpcProvider` (`:194`) mantiene **UN SOLO** `ethers.JsonRpcProvider` cacheado en `cachedProvider`
(`:168`) e indexado por `rpcUrl` (`:196-198`); al cambiar de red descarta la referencia anterior con
`provider.destroy()` (`:199-203`). La red se declara **estática** (`new Network(...)` +
`{ staticNetwork: network }`, `:205-206`) para que `ethers` no gaste una llamada adicional en
`eth_chainId`. `resetRpcProvider` (`:212`) destruye el caché. No se usa `fetch` propio ni se crea un
proveedor por petición (`:8-10`).

### Política CERRADA de reintentos
Declarada en `src/shared/constants.ts:118-131` y aplicada por `resolvedOptions`
(`src/background/rpc/client.ts:174-181`) y el bucle de `rpcSend` (`:276`): `RPC_ATTEMPTS = 4`
(`src/shared/constants.ts:125`), `RPC_RETRIES = 3` (`:127`), `RPC_BACKOFF_MS = [1_000, 2_000, 4_000]`
(`:129`) y `RPC_TIMEOUT_MS = 5_000` (`:131`). El backoff se aplica **antes** de cada reintento
(`:287-290`) y su valor lo resuelve `backoffFor` (`:184-185`); el timeout entra por `attemptCall`
(`:228`) y `describeFailure` (`:252-263`) distingue `TIMEOUT`, `ECONNREFUSED`/`ENOTFOUND` y
`rpc-error`. La política **no es ajustable** desde la UI ni desde `truekeate_settings` (`:11-12`).

### Rechazo del nodo: no se reintenta
`nodeRejectionOf` (`:99`) reconoce un error JSON-RPC de servidor: exige `code` numérico (`:106`) y el
rango `-32768 … -32000` (`:113`), de modo que los códigos propios de la cartera (4001, 4100, 4200,
4900, 4901) quedan fuera a propósito. `findNodeRejection` (`:146`) recorre la cadena anidada de
`ethers`. En `attemptCall`, un rechazo marca `status = 'connected'` y se **lanza tal cual** para que no
se reintente (`:242-246`).

### Lecturas tipadas de conveniencia
`getNetworkInfo` (`eth_chainId`, `:318`), `getBlockNumber` (`eth_blockNumber`, `bigint`, `:332`),
`getBalanceWei` (`eth_getBalance` con `'latest'`, `:338`), `getGasPrice` (`eth_gasPrice`, `:347`) y
`estimateGas` (`eth_estimateGas`, `:353`). **No existe** en este fichero ninguna función `getFeeData`,
ni `eth_getTransactionCount(..., 'pending')`, ni `getTransactionReceipt`: los usos reales están fuera
de M5 y se apoyan en el **mismo** provider único. `getFeeData()` se inyecta en
`src/background/rpc/txContract.ts:91` (`deps.feeData ?? (async () =>
getRpcProvider().provider.getFeeData())`, con el tipo `FeeDataLike` en `:80`) y también se documenta en
`src/background/crypto/sign.ts:160`. `getTransactionCount(address, 'pending')` está en
`src/background/rpc/txContract.ts:95`, con el `nonce` definitivo en `:344` y el contrato de M19.b en
`src/background/approvals/dispatch.ts:153`. `eth_getTransactionReceipt` está en
`src/background/rpc/txContract.ts:465` y en la reconciliación
`src/background/approvals/reconcile.ts:261`, `:272` y `:301`.

### Qué error ve la página al agotarse la política
Agotados los `attempts`, `rpcSend` fija `status = 'disconnected'` y lanza `rpcUnavailableError(...)` con
`reason`, `detail`, `method`, `attempts`, `retries`, `backoffMs`, `timeoutMs` y `rpcUrl` (`:299-310`).
La causa es `rpcUnavailable`, `code: 4900`, mensaje «Sin conexión con la red local (Anvil).» y acción
«Arrancar Anvil en 127.0.0.1:8545» (`src/background/rpc/errors.ts:102-106`). El almacén **no** se toca
(RNF-07). La política se verifica en `src/background/rpc/rpcRetry.spec.ts`, que sustituye `sleep` y
`timeoutMs` para contar las 4 llamadas y comprobar el backoff sin esperar 7 s reales (`client.ts:19-20`);
el rechazo del nodo y las lecturas tipadas se cubren en `src/background/rpc/txContract.spec.ts` (`:476`
para el `nonce`, `:454` para `getFeeData`).

## Catálogo de errores (`src/background/rpc/errors.ts`, M6)
### Tabla real de códigos
El catálogo tiene **8 códigos** y **37 causas** en cuatro bloques: `ERROR_CATALOG` (25 filas, `:41`),
`EXTENDED_ERROR_CATALOG` (7 filas, v1.9/H2, `:217`), `H4_ERROR_CATALOG` (2 filas, v1.10, `:279`) y
`H5_ERROR_CATALOG` (3 filas, v1.11, `:309`); los une `ALL_ERROR_DEFINITIONS` (`:338`), los códigos
únicos están en `ERROR_CODES` (`:378`) y el índice `code → filas` en `ERROR_BY_CODE` (`:381`).

| Código | Causas (`cause`) | Constructor real (línea) | Cuándo se usa (línea de la fila) |
|---|---|---|---|
| `4001` | `userRejected` | `userRejectedError` (`:497`) | Rechazo explícito del usuario (`:43`) |
| `4001` | `timeout` | `timeoutError` (`:504`), `connectTimeoutError` (`:508`) | Vencimiento del plazo: 120 s firma, 60 s conexión (`:49`) |
| `4001` | `approvalWindowClosed` | `approvalWindowClosedError` (`:511`) | La ventana se cerró sin decidir (`:56`) |
| `4001` | `tooManyPendingRequests` | `tooManyPendingRequestsError` (`:515`) | Exceso de cardinalidad de la cola (`:63`) |
| `4001` | `rateLimitExceeded` | `rateLimitExceededError` (`:519`) | *Token bucket* agotado en todo el catálogo (`:70`) |
| `4001` | `hostPermissionDenied` | `hostPermissionDeniedError` (`:523`) | Permiso de host denegado al dar de alta una red (`:77`) |
| `4100` | `unauthorizedOrigin` | `unauthorizedOriginError` (`:527`) | Origen sin sesión autorizada o emisor no autorizado (`:85`) |
| `4200` | `unsupportedMethod` | `unsupportedMethodError` (`:531`) | Método fuera del catálogo; **es el caso de `eth_sign`** (`:91`) |
| `4200` | `methodNotAllowedInContext` | `methodNotAllowedInContextError` (`:534`) | Método interno invocado desde un contexto no permitido (`:97`) |
| `4900` | `rpcUnavailable` | `rpcUnavailableError` (`:538`) | RPC local caído tras agotar los 4 intentos (RNF-07) (`:103`) |
| `4901` | `chainNotRegistered`, `chainIdMismatch` | `chainNotRegisteredError` (`:548`), `chainIdMismatchError` (`:683`) | La red solicitada no está dada de alta o el nodo declara otro `chainId` (`:109`, `:325`) |
| `-32602` | `invalidMnemonic`, `invalidPrivateKey`, `invalidAddress`, `duplicateAccount`, `payloadTooLarge`, `unknownAccount`, `invalidAmount`, `invalidLabel`, `invalidRpcUrl`, `invalidNetworkDefinition` | `invalidMnemonicError` (`:552`), `invalidPrivateKeyError` (`:555`), `invalidAddressError` (`:558`), `duplicateAccountError` (`:561`), `payloadTooLargeError` (`:564`), `unknownAccountError` (`:613`), `invalidAmountError` (`:617`), `invalidLabelError` (`:621`), `invalidRpcUrlError` (`:666`), `invalidNetworkDefinitionError` (`:674`) | Material de entrada inválido (`:115`, `:120`, `:127`, `:134`, `:140`, `:233`, `:239`, `:245`, `:311`, `:318`) |
| `-32000` | `insufficientFunds`, `invalidNonce`, `estimateGasFailed`, `accountInUseByDapp`, `resetBlocked`, `walletNotCreated`, `inflightTxInProgress`, `broadcastRejected` | `insufficientFundsError` (`:567`), `invalidNonceError` (`:570`), `estimateGasFailedError` (`:573`), `accountInUseByDappError` (`:577`), `resetBlockedError` (`:581`), `walletNotCreatedError` (`:609`), `inflightTxInProgressError` (`:644`), `broadcastRejectedError` (`:652`) | Conflicto de estado o rechazo del nodo (`:146`, `:152`, `:158`, `:164`, `:171`, `:227`, `:281`, `:288`) |
| `-32603` | `internalError`, `duplicateApprovalId`, `storageQuotaExceeded`, `broadcastInterrupted`, `damagedWallet`, `clipboardFailure`, `migrationWriteFailed` | `internalError` (`:585`), `duplicateApprovalIdError` (`:589`), `storageQuotaExceededError` (`:593`), `broadcastInterruptedError` (`:597`), `damagedWalletError` (`:605`), `clipboardFailureError` (`:625`), `migrationWriteFailedError` (`:629`) | Fallo interno o de plataforma (`:179`, `:185`, `:191`, `:197`, `:220`, `:251`, `:259`) |

#### Nombres que NO existen en el catálogo real
La lista `userRejected`, `unauthorized`, `unsupportedMethod`, `disconnected`, `chainDisconnected`,
`invalidParams`, `resourceUnavailable`, `expired` **no** corresponde a este módulo. Los nombres reales
son los de la tabla, todos con sufijo `Error` salvo `internalError`. En particular: no hay
`unauthorized` (el real es `unauthorizedOriginError`, `:527`); no hay `disconnected` ni
`chainDisconnected` (el equivalente es `rpcUnavailableError`, `4900`, `:538`); no hay `invalidParams`
(el `-32602` se reparte en causas concretas); no hay `resourceUnavailable` (equivale a
`rpcUnavailableError`); y no hay `expired` (el vencimiento es la causa `timeout`, `timeoutError`, `:504`,
y la solicitud vencida en cola se traza con el evento `approval_expired`).

### Construcción y verificación
`createEip1193Error(cause, args, data?)` (`:434`) construye `{ code, message, data? }` y omite `data` si
no se aporta (`:458-460`); una causa fuera del catálogo degrada al `internalError` (`:444-453`).
`fillMessage` (`:410`) sustituye los marcadores `<segundos>`, `<rpcUrl>`, `<origen>`, `<n>` y `<motivo>`
(`ErrorMessageArgs`, `:396-407`). `createErrorFromCode` (`:468`) usa la primera fila registrada de un
código como mensaje por defecto; `isEip1193Error` (`:484`) valida `code` numérico y `message` string sin
`any`; y `errorDefinitionFor` (`:364`) devuelve el literal de una causa sin construir el objeto. La
tabla se verifica en `src/background/rpc/errors.spec.ts`. Ninguna entrada inventa un mensaje: `errors.ts`
transcribe la tabla cerrada `diccionario_datos.md` §4.3, donde un mismo `code` admite varios mensajes,
uno por causa (`:19-20`), y la regla dura ACU-05/RNF-06 exige que **todo** error que ve el usuario lleve
`code` numérico, quedando prohibido `new Error('Request timeout')` (`:22-23`).

## Estado y esquema (`src/background/state/schema.ts`, M33)
### `STORAGE_KEYS` y `SCHEMA_VERSION`
`SCHEMA_VERSION = '1.4'` (`:30`): el corpus vigente es la base v1.2 → v1.3 → v1.4; es la versión que
viaja en `BootSnapshot.schemaVersion` (`src/background.ts:661`) y la que M34 escribe dentro de
`truekeate_settings`. `SCHEMA_VERSION_KEY = 'truekeate_schema_version'` (`:37`) es **documental**: la
versión se declara dentro de `truekeate_settings`, no como clave propia (`:32-36`). `STORAGE_KEYS`
(`:40`) son los nombres canónicos de las **14** claves: `mnemonic` (`:42`), `accounts` (`:44`),
`importedAccounts` (`:46`), `currentAccount` (`:48`), `chainId` (`:50`), `networks` (`:52`),
`connectedSites` (`:54`), `pendingRequests` (`:56`), `connectRequest` (`:58`), `approvalWindow` (`:60`),
`inflightTx` (`:62`), `rateWindows` (`:64`), `logs` (`:66`) y `settings` (`:68`);
`CANONICAL_STORAGE_KEYS` (`:75`) es la lista en orden de declaración. `LOG_DROPPED_COUNTER_KEY =
'truekeate_logs_dropped'` (`:90`) **no** entra en `STORAGE_KEYS` ni en `CANONICAL_STORAGE_KEYS` (la
lista sigue siendo de 14) y **sobrevive al reset**, como el resto de la observabilidad (`:81-89`).

### Verificación de claves canónicas
`STORAGE_KEY_PREFIX = 'truekeate_'` (`:226`); `hasCanonicalPrefix` (`:229`); `isCanonicalStorageKey`
(`:235`), que rechaza toda clave sin prefijo o con prefijo pero no declarada; `assertCanonicalStorageKey`
(`:239`), que lanza con el mensaje `[truekeate] clave de almacén no canónica: «…»` (`:241-243`); y
`canonicalKeyProblem` (`:255`), que devuelve `{ code: -32603, message: 'Error interno de la cartera.',
data: { reason: 'non-canonical-key', key, expectedPrefix } }` o `null` si la clave es correcta
(`:258-264`). Ese `canonicalKeyProblem` es el que el router **reexporta**
(`src/background/rpc/router.ts:117`).

### Acceso tipado al almacén
| Función | Firma real | Línea | Modo de fallo |
|---|---|---|---|
| `getStorageLocal` | `(): StorageLocalLike \| null` | `:309` | `null` si falta la API |
| `readStorage` | `(keys = null, storage = getStorageLocal())` | `:338` | **nunca lanza**: devuelve `{}` |
| `writeStorage` | `(items, storage)` | `:360` | **1 reintento inmediato**; después `false` |
| `removeStorage` | `(keys, storage)` | `:381` | misma política de reintento que `writeStorage` |

`writeStorage` implementa la política del corpus (`documento_tecnico.md` §3.9) con un bucle de dos
intentos (`for (let attempt = 0; attempt < 2; attempt += 1)`, `:367`) y devuelve `false` para que el
llamador responda `-32603` o `-32603 storageQuotaExceeded` (`:356-358`). `STORAGE_DEFAULTS` (`:267`)
fija los valores iniciales de las claves cuyo tipo raíz es mapa o lista (`:267-283`).

### `getStorageQuotaApi` y la cuota observable
`STORAGE_QUOTA_BYTES = 10_485_760` (10 MB, cuota por defecto desde Chrome 114, `:105`),
`STORAGE_QUOTA_WARN_RATIO = 0.9` (`:112`) y `STORAGE_QUOTA_ERROR_NAMES =
['QuotaExceededError', 'QUOTA_BYTES']` (`:120-123`). `isStorageQuotaError` (`:148`) es la **fuente
única** de la detección de cuota y M30 la usa para decidir si aplica el modo de fallo observable de
§2.15 (`:144-146`). `getStorageQuotaApi(): StorageQuotaLike | null` (`:164`) devuelve
`chrome.storage.local` con `getBytesInUse` o `null` si la API no lo expone (`:169-173`); y
`readStorageQuota(key = null, storage)` (`:195`) devuelve `{ bytesInUse, quotaBytes, usedRatio,
warning, key }` sin lanzar jamás (`:219-222`).

### `resetWallet` y la exclusión de logs
`STORAGE_KEYS_PRESERVED_ON_RESET = [STORAGE_KEYS.logs]` (`:78`): los logs sobreviven al reset (RF-32).
`STORAGE_KEYS_CLEARED_ON_RESET` (`:402`) es el complemento. El orden ESTRICTO se declara como dato en
`RESET_GUARD_ORDER` (`['cola-vacia', 'sin-transaccion-en-vuelo', 'confirmacion-destructiva',
'limpieza']`, `:460-465`), con las guardas `countPendingRequests` (`:422`), `countActiveInflightTx`
(`:436`, exige `expiresAt > now`) y `checkResetGuards` (`:479`), que devuelve `-32000 resetBlocked` con
`data: { pendingCount, inflightCount, step, reason: 'reset-guard' }` (`:493-496`).
`defaultResetCleanup` (`:552`) cancela las alarmas `truekeate_expire:*` (prefijo `EXPIRE_ALARM_PREFIX`,
`:574`) y purga el badge (`:582-600`) sin lanzar. `resetWallet(options)` (`:618`) lee la instantánea
(`:621`), evalúa las guardas (`:623`), devuelve `blocked` si no puede proceder (`:633-635`),
`cancelled` sin tocar nada si falta `confirm` (`:638-640`), ejecuta la limpieza de plataforma
(`:644-651`), borra `STORAGE_KEYS_CLEARED_ON_RESET` (`:653`) y termina en `failed` con
`internalError({ reason: 'reset-write-failed', … })` (`:654-660`) o en `done` (`:661`).
`RESET_WALLET_LOG_EVENT: LogEventName = 'reset_wallet'` (`:407`): el módulo **no** escribe en
`truekeate_logs`, solo devuelve el evento a instrumentar (`:615-616`). Pruebas:
`src/background/state/state.spec.ts` y `src/background/state/reset.spec.ts`.

## Serialización de escrituras (`src/background/state/serialLock.ts`, M33.b)
Declara la interfaz `SerialLock` (`:21`) con `run<T>(task: () => Promise<T>): Promise<T>` (`:26`) y
`depth(): number` (`:28`), y la fábrica `createSerialLock()` (`:32`). Su implementación es un cerrojo
**FIFO por encadenamiento de promesas**: mantiene un `tail: Promise<void>` (`:33`) y un contador
`pending` (`:34`); `run` encadena la tarea al `tail` (`:38`) y reasigna `tail` con el asentamiento de la
tarea, contabilizando el descenso de `pending` tanto en el camino de éxito como en el de error
(`:39-46`), de modo que **un fallo NO rompe la cadena**. Es un cerrojo **volátil** y admisible,
reconstruible en cada arranque del SW; **no es fuente de verdad** — la verdad vive siempre en el
almacén (`:14-16`). Se usa, con un cerrojo por mapa, en: `rmwLock` de la cola de aprobaciones (M14,
`src/background/approvals/queue.ts:94`, envuelto por `withRmwLock` en `:97`), `connectRequestsLock`
(M26.b, `src/background/connections.ts:89`), `sessionsLock` (M26, `src/background/sessions.ts:57`) y
`focusLock` (M18, `src/background/approvals/focus.ts:264`). `approvals/queue.ts` reexporta
`createSerialLock`, `SerialLock` y `withRmwLock` (`:88`) para no cambiar los nombres históricos. El
motivo de extraerlo a un módulo propio está en el encabezado: la auditoría de unitarias de la fase 4
midió que `sessions.ts` y `connections.ts` hacían su lectura-modificación-escritura **sin cerrojo** y
que `truekeate_connect_request` nunca se purgaba (`:6-12`). El orden de toma importa: `focusLock`
SIEMPRE antes que el `rmwLock` (`src/background/approvals/focus.ts:27` y `:262`).

## Migraciones (`src/background/state/migrations.ts`, M34)
### Versiones reales que migra
`SUPPORTED_SCHEMA_VERSIONS = ['1.2', '1.3', '1.4']` (`:45`) y `BASE_SCHEMA_VERSION = '1.2'` (`:48`):
una instantánea **sin** versión declarada se considera v1.2 (`:47`). La versión se lee con
`readStoredSchemaVersion` (`:134`), que mira primero `truekeate_settings[schemaVersion]` (`:135-141`) y
luego los nombres heredados `schema_version`/`schemaVersion` (`:142-147`).

### Qué transforma en cada paso
`planMigration(snapshot)` (`:198`) es **pura** (no escribe ni muta) e idempotente. Primero hace el
**reparto de claves** (`:204-228`): las canónicas se copian tal cual (`:208-211`), las de
`RETIRED_STORAGE_KEYS` —hoy `['truekeate_pending_request']` (`:51`)— se eliminan (`:213-216`), los
nombres heredados de `LEGACY_KEY_ALIASES` (`:57-77`) se **renombran** a su clave canónica (`:217-226`,
ganando siempre la canónica sobre su alias) y todo lo demás se acumula en `rejectedKeys` (`:227`).
Después aplica los dos pasos: **v1.2 → v1.3** (`step13`, `:270-296`) retira la clave singular
(`:275`), convierte con `migrateConnectedSites` (`:152`) el valor `string` heredado de
`truekeate_connected_sites` a la forma canónica (`:158-171`), rellena `event` de forma determinista
desde `category` con `migrateLogs` (`:178`) usando `LEGACY_CATEGORY_TO_EVENT` (`:80-86`:
`call→rpc_call`, `event→event_emit`, `tx→tx_sent`, `sign→sign_personal`, `system→sw_reconcile`, con
`rpc_call` de respaldo en `:189`) y añade `accountLabels` vacío si falta (`:292-295`); **v1.3 → v1.4**
(`step14`, `:299-315`) aplica los renombrados acumulados (`:303`), añade
`SETTINGS_SCHEMA_VERSION_FIELD` (`:305`), normaliza `truekeate_current_account` de la forma heredada
`"0"` a `idx:0` (`:308-312`) y escribe la versión en los ajustes (`:313`). `changed` se calcula mirando
si algún paso renombró, eliminó, añadió o reescribió algo (`:317-323`).

### Cómo rechaza claves no canónicas
Una versión **desconocida** no se migra hacia atrás —eso sí sería pérdida de datos—: se informa y no se
toca nada, con `internalError({ reason: 'unknown-schema-version', from })` (`:230-248`).
`isNonCanonicalKey` (`:376`) e `isRejectedKey` (`:383`) formalizan la decisión: se RECHAZA toda clave
que no sea canónica, no sea un alias heredado migrable y no esté retirada (`:383-386`); las rechazadas
se informan en `rejectedKeys` y **no se tocan ni se copian** al esquema migrado (`:20-24`).
`migrateSchema(storage)` (`:347`) aplica el plan: si ya está al día o no hay cambios devuelve el informe
tal cual (`:352-354`); si no, escribe el snapshot (`:358`), elimina las claves heredadas y retiradas por
su nombre literal (`:356-362`), resume el resultado en `applied`/`ok`/`migrated` (`:365-367`) y, si
falla, devuelve `migrationWriteFailedError({ reason: 'migration-write-failed' })` (`:369`).
`runMigrations = migrateSchema` (`:392`) es **exactamente** el nombre con el que M2 invoca la migración
(`src/background.ts:38` y `:309`).

## Observabilidad: logger, catálogo de eventos y retención
### `logging/logger.ts` (M30): UNA entrada por evento y firma de `logEvent`
`logEvent` está en `src/background/logging/logger.ts:492` con la firma real
`logEvent(request: LogRequest, options: WriteLogOptions = {}): Promise<LogEntry | null>`. `LogRequest`
(`:68`) exige solo `event` y admite `level`, `variant`, `message`, `origin`, `method`, `data`, `txHash`
y `txStatus`. El flujo real: valida el evento contra el catálogo cerrado (`:496-500`), resuelve la
pareja `(category, level)` con `placementForEntry` (`:501`), resuelve el mensaje con
`logEventDescription` si no se aporta (`:502-505`) y delega en `writeLogEntries` (`:506-520`). Devuelve
la entrada del evento **pedido** cuando quedó escrita y `null` si no se persistió —incluido el descarte
por cuota, en el que lo que se guarda es la entrada de diagnóstico `storage_quota_exceeded`
(`:521-523`)—. Un `event` fuera del catálogo lanza `RangeError` con el texto `[truekeate] «…» no
pertenece al catálogo cerrado de 24 eventos (M31/RNF-16)` (`:497-499` y `:544-546`): es un **error de
programación**, nunca una entrada con un evento inventado (`:19-20`). `writeLogEntries(items, options)`
(`:535`) escribe **N** entradas con UNA sola lectura y UNA sola escritura (`:552-598`), lo que permite
que la reconciliación deje su traza y la de cada huérfana sin pagar N ciclos de almacén (cota < 1 s de
RNF-08); `appendLogEntries` (`:686`) es su alias y `appendLogEntry` (`:692`) la forma de una entrada,
conservadas por compatibilidad con H3/H4 (`:675-676`).

#### Serialización, saneado y política de cuota
El logger tiene su propio cerrojo: `runSerialized` (`:400`) sobre `writeTail` (`:393`); sin él, dos
eventos simultáneos podrían leer la misma lista y la segunda escritura pisaría a la primera
(incumplimiento de RNF-16, `:396-398`). El saneado de última instancia es `sanitizeLogData` (`:341`),
que aplica `truncateCalldataDeep` (`:304`) y `redactLogData` de M22 (`:345`); el calldata se recorta a
sus **primeros 10 bytes** + `dataLength` (`truncateCalldata`, `:289`; patrón de claves
`CALLDATA_KEY_PATTERN`, `:272-273`) y un `data` textual por encima de `PREVIEW_INLINE_MAX_BYTES` (4096,
`src/shared/constants.ts:151`) se sustituye por `{ payloadHash, payloadBytes, truncated: true }`
(`:346-352`). `buildEntry` (`:357`) construye la entrada con `id` (uuid v4 o respaldo `log-…`,
`newLogId`, `:232-241`), `ts`, `level`, `category`, `event`, `message`, `origin` normalizado
(`normalizeOrigin`, `:244`) y `method`. `writeOnce` (`:417`) clasifica el fallo en
`'ok' | 'quota' | 'error' | 'unavailable'` usando `isStorageQuotaError` de M33 (`:428-430`), y
`writeWithQuotaPolicy` (`:447`) implementa §2.15: si el `set` se rechaza por **cuota**, aplica la
retención ya calculada y reintenta **UNA** vez (`diagnostics.retries += 1`, `:462-467`); si el reintento
vuelve a fallar por cuota, incrementa `diagnostics.dropped` y avisa con `console.warn('[truekeate]
storage quota exceeded')` (`:468-471`). Nunca hay bucle de escritura.

#### `hydrateLogDiagnostics` y el contador de descartes por cuota
`hydrateLogDiagnostics(storage)` (`:157`) reconstruye el contador desde `truekeate_logs_dropped` al
arrancar el SW (`:164-175`) y marca lo hidratado como «ya persistido» (`:180`), para que el descarte
siga siendo visible tras una suspensión; se apoya en `diagnostics` (`:135`) y en
`persistedDiagnostics` (`:146`, inicializado a `-1` = «aún no persistido»). `readLogDiagnostics` (`:185`)
devuelve una copia y `resetLogDiagnostics` (`:188`) es de uso exclusivo de pruebas. `persistDiagnostics`
(`:202`) **solo escribe si los contadores cambiaron** (`:206-211`); el motivo medido está en `:137-145`:
escribir en cada traza costaba DOS operaciones de almacén y llevaba la reconstrucción a ~2 s en el E2E
`29-sw-suspendido`, contra la cota < 1 s de RNF-08. El contador se publica en `wallet_getLogs.dropped`:
`readLogsView` (`:739`) devuelve `{ entries, truncated, dropped, trimmed }` (`LogsView`, `:723-732`) con
`truncated: plan.truncated || diagnostics.dropped > 0` (`:749`), y `handleGetLogs` (M4) lo traduce a
`{ entries, truncated, dropped }` (`src/background/rpc/catalog.ts:928-935`). La entrada de diagnóstico
`storage_quota_exceeded` la construye `persistQuotaDiagnostic` (`:614`), que reescribe el **histórico ya
persistido** más la entrada de diagnóstico y **nunca** las entradas descartadas (`:588-591`), lleva el
`rpc_error` `code: -32603` y el mensaje «no se pudo guardar el registro por falta de espacio» en su
`data` (`:622`, `:633-643`) y solo se produce cuando la causa es la cuota (`:580-585`).
`measureLogBytes` (`:250`) y `measureStorageBytes` (`:658`) completan el diagnóstico.

### `logging/events.ts` (M31): catálogo CERRADO de 24 eventos y 5 categorías
`LOG_CATEGORIES` (`src/background/logging/events.ts:36`) son las **5** categorías
`['call', 'event', 'tx', 'sign', 'system']`; `LOG_LEVELS` (`:39`) son los **4** niveles
`['info', 'success', 'warn', 'error']`. `LOG_EVENT_SPECS` (`:91`) declara, con `as const satisfies
Record<LogEventName, LogEventSpec>` (`:242`), los **24** eventos; `LOG_EVENT_NAMES` (`:258`) es la lista
de nombres y los conteos exactos son `LOG_EVENT_COUNT = 24` (`:261`), `LOG_CATEGORY_COUNT = 5` (`:264`)
y `LOG_LEVEL_COUNT = 4` (`:267`). `event` y `category` son campos **independientes**: usar una categoría
como si fuera un evento es el defecto que corrige ACU-04 y `isLogEventName` lo impide (`:277-278`).

Los 24 eventos, con su línea real: `rpc_call` `:92`, `rpc_error` `:97`, `event_emit` `:117`, `tx_sent`
`:122`, `tx_confirmed` `:127`, `tx_failed` `:132`, `tx_reverted` `:137`, `sign_personal` `:142`,
`sign_typed_data` `:147`, `approval_created` `:152`, `approval_resolved` `:157`, `approval_expired`
`:169`, `chain_changed` `:174`, `accounts_changed` `:179`, `wallet_created` `:184`, `wallet_imported`
`:189`, `account_imported` `:194`, `account_removed` `:200`, `reset_wallet` `:205`, `network_added`
`:210`, `permission_revoked` `:215`, `sw_started` `:220`, `sw_reconcile` `:225` y
`storage_quota_exceeded` `:237`. Declaran variantes `rpc_error` (variantes `system`, `quota` y `''`, que
es la situación de código inválido, `:101-115`), `approval_resolved` (`warn`, `:161-167`) y
`sw_reconcile` (`warn`, `:229-235`).

Consultas del catálogo: `logEventSpec` (`:281`), `logEventVariant` (`:291`), `canonicalCategoryFor`
(`:297`), `defaultLogLevelFor` (`:301`), `logEventDescription` (`:304`), `categoriesFor` (`:308`),
`levelsFor` (`:314`), `resolveLogPlacement` (`:327`) y `placementForEntry` (`:358`), que es la que usa
M30 y garantiza que ninguna entrada escrita lleva una `category` o un `level` inventados (`:319-325`).
El puente con el provider EIP-1193 está en `PROVIDER_EVENT_TO_LOG_EVENT` (`:389-395`:
`chainChanged→chain_changed`, `accountsChanged→accounts_changed`, y `connect`/`disconnect`/`message`
→ `event_emit`) y en `logEventForProviderEvent` (`:402`). Pruebas:
`src/background/logging/events.spec.ts`.

### `logging/retention.ts` (M32): retención FIFO `logLimit = 500`, `logMaxPerOrigin = 200`
Los límites normativos vienen de `src/shared/constants.ts:154` (`logLimit = 500`) y `:155`
(`logMaxPerOrigin = 200`). `RETENTION_LIMITS` (`src/background/logging/retention.ts:48`) los congela y
`effectiveLimits` (`:61`) acepta los que aporte `truekeate_settings` si son enteros positivos, cayendo a
los normativos si no: **un ajuste corrupto nunca deja la retención sin límite** (`:57-59`).
`planRetention(entries, limits)` (`:85`) es **pura** y aplica el orden del corpus: ordena por `ts`
ascendente con desempate estable por índice (`:90-93`), recorta por el límite **global** descartando las
más antiguas (`:95-97`) y después recorta **por origen** sobre lo que sobrevivió (`:99-118`); devuelve
`{ retained, droppedGlobal, droppedPerOrigin, dropped, truncated }` (`RetentionPlan`, `:26-37`). Una
entrada sin `ts` numérico se considera la más antigua (`orderOf`, `:67-68`). `applyRetention` (`:135`) y
`mergeWithRetention` (`:144`) son atajos. El módulo es PURO: la escritura la hace M30, que es el ÚNICO
que toca el almacén (`:16-17`). Pruebas asociadas: `src/background/logging/logger.spec.ts`,
`loggerRetry.spec.ts`, `storageQuota.spec.ts` y `logRedaction.spec.ts`.

## Propagación de eventos (`src/background/events.ts`, M27)
### Funciones reales de emisión
El sobre `TruekeateEventEnvelope` (`src/background/events.ts:28-33`) lleva `type: 'TRUEKEATE_EVENT'`,
`eventName` y `data`, y se entrega **sin transformar**: el content script lo reenvía **literalmente** a
la página (dos saltos, `:6-7`). Las funciones reales son `emitProviderEvent(eventName, data, options)`
(`:134`, genérico, devuelve cuántas pestañas lo recibieron), `emitAccountsChanged(accounts, options)`
(`:157`, `accountsChanged` con el array de direcciones, `[]` al revocar), `emitConnect(chainId,
options)` (`:164`, `connect` con `{ chainId }`), `emitDisconnect(error, options)` (`:168`, `disconnect`
con `{ code, message }`), `emitChainChanged(chainId, options)` (`:185`, `chainChanged` con el
`ChainIdHex` **sin envoltorio**) y `emitMessage(payload, options)` (`:194`, `message` con la carga
arbitraria). `emitMessage` no se emite en H3 porque ningún método lo produce: se publica para que
H4/H5 tengan el canal cerrado (`:190-193`). `emitChainChanged` se emite a **TODAS** las pestañas
abiertas —el cambio puede nacer en el popup o en una dApp— y su `data` es el propio `ChainIdHex` porque
EIP-1193 lo exige así (`:173-184`).

### A quién se entregan
`getTabsApi` (`:63`) devuelve `chrome.tabs` sin `any` o `null`, y `defaultEventsDeps` (`:80`) lo
inyecta. `allTabIds(tabs)` (`:83`) consulta **todas** las pestañas abiertas con `tabs.query({})` y
filtra las que tienen `id` numérico, devolviendo `[]` si la API falta o falla (`:95-97`).
`emitProviderEvent` (`:134`) decide los destinatarios: `options.tabIds` si se aporta y, si no,
`allTabIds` (`:140`), y recorre la lista contando las entregas reales (`:143-153`). `sendEventToTab`
(`:106`) es el **ÚNICO** punto que llama a `tabs.sendMessage`: con `frameId !== null && frameId !== 0`
envía `{ frameId }` (`:116-117`) y en caso contrario sin opciones (`:118-120`), conforme a
DEC-40/ADT-07; nunca usa `sender.tab.url` para deducir origen (`:103-104`). La acotación a «sesiones
conectadas» no vive aquí sino en los llamadores: por ejemplo `syncActiveAccount` emite
`accountsChanged` **solo** a las pestañas de las sesiones vigentes (`{ tabIds: synced.tabIds }`), con el
motivo explícito de no publicar la dirección en orígenes sin sesión
(`src/background/rpc/catalog.ts:1309-1313`). Omitir `options` emite a **todas** las pestañas: es el
valor real de producción para `chainChanged`.

### El reenvío literal por `TRUEKEATE_EVENT`
Un fallo de entrega —pestaña sin content script, cerrada entre la consulta y el envío, o frame
inexistente— **no rompe la propagación**: `sendEventToTab` captura el error, devuelve `false` y el resto
de pestañas sigue recibiendo el evento (`:122-126`), conforme a la regla «sin fallo en cascada» del
encabezado (`:16-17`). El módulo no usa `setTimeout`/`setInterval` ni escribe en `truekeate_logs`
(`:18-19`): la instrumentación de estos eventos es de M31/M30, que traduce el nombre del provider con
`logEventForProviderEvent` (`src/background/logging/events.ts:402`). El reenvío literal implica que el
`envelope` viaja tal cual hasta `window.postMessage` en la capa inject
(`src/shared/protocol.ts:77-82`).
