# 04 — Seguridad del monedero
Propósito: documentar con referencias `ruta:línea` leídas del código real qué protege TrueKeate
Wallet, de qué adversarios, con qué controles concretos y qué riesgos residuales quedan abiertos
por decisión de diseño.

> **Alcance y método.** Todo dato procede de ficheros leídos del repositorio:
> `src/background/security/{accessLevel,senderGuard,redaction,hash}.ts`,
> `src/background/rpc/{router,catalog,pageMethods,internalMethods,rateLimit,errors}.ts`,
> `src/background/approvals/{queue,timeout,dispatch,preview,calldata}.ts`,
> `src/background/crypto/{secrets,integrity,sign}.ts`, `src/background/logging/logger.ts`,
> `src/background/state/schema.ts`, `src/shared/{constants,protocol,types}.ts`,
> `src/background.ts`, `src/manifest.ts`, `src/popup/{walletRpc,walletState}.ts`,
> `src/popup/views/SecurityView.tsx`, `src/notification/App.tsx` y los specs citados. Lo no
> verificable se marca como **«pendiente de confirmar»**.
## 1. Modelo de amenaza y activos
### 1.1 Qué protege el sistema
#### 1.1.1 Frase BIP-39
Es el activo raíz: de ella se derivan todas las cuentas HD. Vive en `chrome.storage.local` bajo
`truekeate_mnemonic` (`src/background/state/schema.ts:42`) y **puede no existir** si solo hay
cuentas importadas (mismo comentario). Nunca sale hacia la página ni por `window.postMessage`:
solo puede mostrarse en superficies de la propia extensión mediante el revelado de RF-50
(`RepoTecnico/requerimientos.md:194`, RNF-09).
#### 1.1.2 Claves privadas
Las **derivadas** se recalculan con `derivePrivateKey` (`src/background/crypto/secrets.ts:192`);
las **importadas** se persisten en claro dentro de `truekeate_imported_accounts`
(`src/background/state/schema.ts:46`; campo `privateKey` en `src/shared/types.ts:430`). La firma
ocurre en un único módulo (`src/background/crypto/sign.ts:1-6`).
#### 1.1.3 Sesiones por origen y cola de aprobaciones
`truekeate_connected_sites` guarda `Record<origen normalizado, DappSession>` con TTL de 24 h
renovables (`schema.ts:54`; `src/shared/constants.ts:104`) y decide qué dApp ve qué cuenta.
`truekeate_pending_requests` es `Record<approvalId, PendingRequest>` (`schema.ts:56`) y contiene
los `params` **originales**, es decir, el payload que se va a firmar; está protegida por
cardinalidad (§6.1), cota de tamaño (§6.3), plazo (§6.4) y anti-replay (§6.5).
### 1.2 Activos reales en `chrome.storage.local`
#### 1.2.1 Las 14 claves canónicas
`STORAGE_KEYS` declara exactamente 14 claves con prefijo `truekeate_`
(`src/background/state/schema.ts:39-69`):

| Clave | Línea | Contenido |
|---|---|---|
| `truekeate_mnemonic` | `schema.ts:42` | Frase BIP-39 de 12 palabras |
| `truekeate_accounts` | `schema.ts:44` | Direcciones derivadas; el índice ES el índice BIP-44 |
| `truekeate_imported_accounts` | `schema.ts:46` | Dirección + **clave privada** + etiqueta |
| `truekeate_current_account` | `schema.ts:48` | Cuenta activa (`idx:<n>` \| `imp:<address>`) |
| `truekeate_chain_id` | `schema.ts:50` | Red activa (inicial `0x7a69`) |
| `truekeate_networks` | `schema.ts:52` | Redes dadas de alta |
| `truekeate_connected_sites` | `schema.ts:54` | Sesiones por origen (24 h renovables) |
| `truekeate_pending_requests` | `schema.ts:56` | Cola de aprobaciones |
| `truekeate_connect_request` | `schema.ts:58` | Solicitudes de conexión (máx. 1 por origen) |
| `truekeate_approval_window` | `schema.ts:60` | Ventana única de confirmación (P-21) |
| `truekeate_inflight_tx` | `schema.ts:62` | Marca de transacción en vuelo por cuenta |
| `truekeate_rate_windows` | `schema.ts:64` | Ventana de tasa por origen |
| `truekeate_logs` | `schema.ts:66` | Registro de actividad (retención FIFO) |
| `truekeate_settings` | `schema.ts:68` | Defaults, etiquetas y aceptación de avisos |
#### 1.2.2 Controles estructurales
`LOG_DROPPED_COUNTER_KEY = 'truekeate_logs_dropped'` (`schema.ts:90`) queda fuera de
`CANONICAL_STORAGE_KEYS` y **sobrevive al reset**, igual que los logs (`schema.ts:77-78`).
`assertCanonicalStorageKey` lanza si la clave no empieza por `truekeate_` o no está declarada
(`schema.ts:239-246`). El corpus prohíbe `chrome.storage.sync` porque enviaría
`truekeate_mnemonic` a los servidores de la cuenta del navegador
(`RepoTecnico/diccionario_datos.md:33`). `resetWallet` exige cola vacía, sin transacción en vuelo
y confirmación destructiva, en ese orden (`schema.ts:460-465`, `:618-661`).
### 1.3 Adversarios considerados
#### 1.3.1 dApp hostil, iframe hostil y content script ajeno
La **dApp hostil** puede llamar a `window.truekeate.request` con cualquier `method` y saturar el
canal: se defiende con la unión cerrada (§4), el *token bucket* de todo el catálogo (§6.2), la
decodificación local del calldata (§10) y la ventana de decisión (§7). El **iframe hostil** es el
vector `D-J`/`ADT-07`: si el SW dedujera el origen de `sender.tab.url`, ese `url` es el del **top
frame** y el iframe heredaría la sesión del anfitrión
(`src/background/originFrame.spec.ts:1-8`); lo cierran §3.1.3 y §3.1.5. El **content script de
otra extensión** comparte el DOM pero no el `id` de runtime: se defiende con la allowlist de
`sender.id` (§3.1.1) y con el nivel de acceso al almacén (§2).
#### 1.3.2 Página que lee `chrome.storage` y fuga por logs
Una página web **no** tiene la API `chrome.storage` en su contexto; el vector realista es el
content script, que sí vive en un contexto con acceso al almacén, y es exactamente lo que cierra
`TRUSTED_CONTEXTS` (§2.1). La **fuga por logs** es real porque `truekeate_logs` es exportable en
JSON: se defiende con la redacción **antes** de cualquier traza
(`src/background/rpc/router.ts:520-521`), con la política de §5 y con la prohibición bloqueante de
payload íntegro (`src/background/logging/logRedaction.spec.ts:1-8`).
## 2. Aislamiento de claves
### 2.1 `applyStorageAccessLevel`
#### 2.1.1 Implementación y llamada PRIMERA
`src/background/security/accessLevel.ts` (78 líneas) declara el literal no configurable
`TRUSTED_CONTEXTS` (`accessLevel.ts:15`), comprueba que la API existe —`setAccessLevel` llegó en
Chrome 102 y el proyecto exige `minimum_chrome_version: '114'` (`src/manifest.ts:45`)—
(`accessLevel.ts:40-46`) y aplica
`api.storage.local.setAccessLevel({ accessLevel: TRUSTED_CONTEXTS })` (`accessLevel.ts:64-77`).
Es idempotente y **no lanza**: si falta la API o falla, devuelve `false` y avisa por consola para
no interrumpir el arranque (`accessLevel.ts:57-63`, `:73-77`). `bootstrap()` la invoca **antes**
de cualquier otra fase, como paso 1 y «lo ANTES posible» (`src/background.ts:638-640`); después
vienen el contador de descartes, la migración, la siembra de red, la integridad, la auto-carga y
la reconciliación (`background.ts:641-655`).
#### 2.1.2 Por qué un content script no puede leer `truekeate_mnemonic`
Con el nivel por defecto, un content script inyectado en una página podría leer
`truekeate_mnemonic` y las claves privadas del almacén; `TRUSTED_CONTEXTS` deja fuera de lectura a
los content scripts y mantiene el acceso al Service Worker y a las páginas de la extensión
(popup, connect y notification) —razón escrita en la cabecera del módulo
(`accessLevel.ts:6-9`)—. La llamada no añade permisos: `storage` ya está declarado
(`src/manifest.ts:62`).
### 2.2 El invariante «el popup no custodia estado» (RNF-14)
#### 2.2.1 Todo pasa por `wallet_*` en el router
El popup es **solo UI**: no lee ni escribe el almacén, no importa `ethers` y no custodia estado;
todas las lecturas y mutaciones viajan por `chrome.runtime.sendMessage` con los métodos internos
del contrato, que el SW despacha (`src/popup/walletState.ts:5-13`). El estado que el popup pinta
lo compone el SW en `handleGetState` a partir de M28 (cuentas), M13 (integridad), M33 (redes y
`chainId`) y M26 (sitios conectados) (`src/background/rpc/catalog.ts:1003-1025`).
#### 2.2.2 Verificación en `walletRpc.ts` y `walletState.ts`
`src/popup/walletRpc.ts` es «el único punto del popup por el que se habla con el Service Worker»
(`walletRpc.ts:1-3`) y se declara «**cero criptografía y cero `ethers`**» (`walletRpc.ts:20`):
`buildWalletMessage` fija `origin: EXTENSION_ORIGIN` (`= 'extension'`,
`src/shared/constants.ts:226`) y `tabId`/`frameId` a `null` (`walletRpc.ts:66-76`), y
`callWalletMethod` traduce cualquier fallo de transporte a un error EIP-1193 tipado sin lanzar
(`walletRpc.ts:110-138`). `src/popup/walletState.ts` documenta que «**sustituye** al respaldo que
escribía directo en el almacén: cualquier operación sin método interno propio sería hoy un defecto
de contrato, no un atajo de la UI» (`walletState.ts:12-13`), y hasta la consulta previa del reset
pasa por el SW: `probeResetGuards` llama a `wallet_resetWallet` con `{ confirm: false }` en vez de
leer `truekeate_pending_requests` (`walletState.ts:280-301`).
#### 2.2.3 Evidencia de cierre
`rg -n "chrome\.storage" src/popup` → **0 coincidencias**
(`RepoTecnico/estado_proyecto.md:119`) y, ampliado, `src/popup src/connect` → **0**
(`estado_proyecto.md:135`). La ventana de decisión repite el invariante: «no lee ni escribe el
almacén de la extensión» (`src/notification/App.tsx:20-21`).
## 3. Guardas de sender / origen / frame
### 3.1 La guarda principal: `guardSender`
`src/background/security/senderGuard.ts` tiene **335 líneas** (no 307, como afirmaban las notas
previas) e implementa cuatro controles documentados en su cabecera (`senderGuard.ts:1-22`). No
toca la cola ni la ventana: solo decide si el mensaje puede continuar y hacia dónde vuelve la
respuesta (`senderGuard.ts:18-19`).
#### 3.1.1 Allowlist de `sender.id` y de rutas internas
Si existe `chrome.runtime.id` y `sender.id` no coincide, se responde `4100 unauthorizedOrigin`
(`senderGuard.ts:245-249`; `getRuntimeId` en `:93-100`); el control se repite en
`guardResponseRoute` (`senderGuard.ts:290-293`). `EXTENSION_ROUTE_ALLOWLIST` es una lista
**cerrada** con las tres rutas internas (`senderGuard.ts:39-44`), importadas de
`src/shared/protocol.ts:164-171`: `EXTENSION_ROUTE_POPUP = 'index.html'`,
`EXTENSION_ROUTE_CONNECT = 'connect.html'` y `EXTENSION_ROUTE_NOTIFICATION = 'notification.html'`
(`protocol.ts:165-171`). Para respuestas internas, `ROUTE_BY_RESPONSE_TYPE` fija que
`SIGN_RESPONSE` solo puede venir de `notification.html` y `CONNECT_RESPONSE` solo de
`connect.html` (`senderGuard.ts:46-50`); otra ruta responde `4200` (`senderGuard.ts:294-299`). Una
página de la extensión fuera de la allowlist tampoco es contexto confiable
(`senderGuard.ts:8-9`).
#### 3.1.2 El origen se calcula SOLO desde `sender.origin`
`resolveOrigin` (`senderGuard.ts:159-173`) normaliza `sender.origin` y, si es del esquema
`chrome-extension://`, lo colapsa a la clave canónica `extension`; un origen `http(s)` se devuelve
tal cual. La regla dura está en la cabecera: «Nunca se usa `sender.tab.url`»
(`senderGuard.ts:149-152`). Con `sender.frameId !== 0` **queda prohibido** respaldarse en
`sender.tab.url`, porque en un iframe cross-origin ese `url` es el del top y el iframe heredaría
la sesión del anfitrión (`senderGuard.ts:14-16`); el `frameId` que manda es el **del emisor real**
(`senderGuard.ts:265-267`), no el declarado por el mensaje. El criterio de «contexto de la
extensión» exige `sender.id` propio y origen de extensión, y **no** exige
`sender.tab === undefined`: el popup del `action` y una página de la extensión abierta en una
pestaña llegan **con** `tab`, y esa condición dejaba fuera a los dos (`senderGuard.ts:175-190`);
una URL u origen de página web nunca es contexto de extensión (`senderGuard.ts:200-206`).
#### 3.1.3 Entrega al frame exacto: `deliverToPage` y `ResponseTarget`
`guardSender` devuelve `respondToFrameOnly: frameId !== 0` (`senderGuard.ts:278`) y
`responseTargetFor` traduce el contexto confiable a un `ResponseTarget`: a un top frame se le
responde sin opciones y a un iframe **solo a su frame** (`senderGuard.ts:315-332`). La entrega
efectiva está en `src/background.ts:480-502`: si `target.frameId !== null && !== 0` se llama a
`tabs.sendMessage(tabId, message, { frameId })`; si no, al top (`background.ts:493-497`). Un fallo
de entrega se ignora: la respuesta ya viajó por el canal de `onMessage` cuando procedía
(`background.ts:476-478`).
### 3.2 El escenario del iframe hostil y el spec `originFrame.spec.ts`
`src/background/originFrame.spec.ts` (293 líneas) está marcado como riesgo **BLOQUEANTE**
(`originFrame.spec.ts:1-8`). Simula dos emisores con el **mismo `tabId`** y el mismo
`sender.tab.url`: el top (`frameId: 0`, origen `http://localhost:5174`,
`originFrame.spec.ts:41-47`) y el iframe hostil (`frameId: 3`, origen
`http://127.0.0.1:5199`, `originFrame.spec.ts:54-60`); la discrepancia `origin ≠ tab.url` es
«justo el vector del defecto que este spec debe detectar» (`originFrame.spec.ts:50-53`). Las
pruebas son de **router real** (`handleRPCRequest` + `defaultRouterDeps`): la sesión del top se
siembra en el almacén y se verifica que el iframe responde `[]` mientras el top responde su cuenta,
y que el iframe tampoco crea una sesión nueva para sí (`originFrame.spec.ts:10-12`).
### 3.3 Los 8 tipos de mensaje y el contexto confiable
`TrustedSenderContext` transporta `runtimeId`, `origin`, `isExtensionContext`, `route`, `tabId`,
`frameId`, `respondToFrameOnly` y `declaredOrigin` —este último conservado **solo** para detectar
discrepancias— (`senderGuard.ts:70-85`); el `origin` declarado por el mensaje se ignora y se
recalcula (`senderGuard.ts:63-68`). El protocolo tiene **8** tipos cerrados
(`src/shared/protocol.ts:35-43`, lista en tiempo de ejecución en `:46-55`): `TRUEKEATE_REQUEST`,
`TRUEKEATE_RESPONSE`, `TRUEKEATE_EVENT`, `TRUEKEATE_ANNOUNCE`, `TRUEKEATE_RPC`, `SIGN_RESPONSE`,
`CONNECT_RESPONSE` y `RESUME`. Cualquier otro `type` no es del protocolo y el router **no
responde** (`src/background/rpc/router.ts:718-728`).
## 4. Allowlist de métodos internos
### 4.1 La lista cerrada `internalMethods.ts`
`src/background/rpc/internalMethods.ts` tiene **48 líneas** y su única importación es un
`import type`, que el compilador borra (`internalMethods.ts:1-6`). Esa separación elimina el ciclo
`catalog → sessions → senderGuard → catalog` que hacía que la constante se capturara como
`undefined` según el orden de evaluación (defecto `D-H3-C`), con el consiguiente `-32603` en el
router (`internalMethods.ts:8-15`); `catalog.ts` la importa y la **reexporta**, de modo que sigue
habiendo una sola declaración (`src/background/rpc/catalog.ts:96-98`, `:175`).
#### 4.1.1 Los 16 métodos internos
La lista literal (`internalMethods.ts:28-48`) contiene `wallet_generateMnemonic`,
`wallet_importMnemonic`, `wallet_deriveAccounts`, `wallet_importPrivateKey`, `wallet_getNetworks`,
`wallet_getLogs`, `wallet_revealSecret`, `wallet_getState`, `wallet_setCurrentAccount`,
`wallet_addDerivedAccount`, `wallet_renameAccount`, `wallet_setAccountVisible`,
`wallet_deleteImportedAccount`, `wallet_resetWallet`, `wallet_acceptDevNotice` y
`wallet_getConnectRequest`. La unión `InternalMethod` de `src/shared/types.ts:73-97` declara los
mismos 16; `eth_sign` **no está ni estará** (`internalMethods.ts:20`). `isInternalMethodName`
consulta la lista con `includes` (`senderGuard.ts:230-231`) y `guardSender` la usa: un `wallet_*`
desde un content script se rechaza con `methodNotAllowedInContextError`
(`senderGuard.ts:260-263`).
### 4.2 Qué puede invocar una PÁGINA
#### 4.2.1 Las 10 lecturas y los 6 aprobables
`PAGE_READ_METHODS` (`catalog.ts:146-157`) y `PageReadMethod` (`src/shared/types.ts:100-110`):
`eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `eth_blockNumber`, `eth_getBalance`,
`eth_estimateGas`, `eth_gasPrice`, `eth_feeHistory`, `eth_getTransactionByHash` y
`eth_getTransactionReceipt`. Su entrada es `kind: 'read'`, `context: 'any'`, `resolve: true`
(`catalog.ts:377-391`) y el router las despacha a `invokePageMethod` con el contexto de página
(`router.ts:612-624`); el catálogo cerrado de página vive en
`src/background/rpc/pageMethods.ts:1-25`. `PAGE_APPROVAL_METHODS` (`catalog.ts:160-167`) coincide
con `ApprovalMethod` (`src/shared/types.ts:56-62`): `eth_sendTransaction`,
`eth_signTypedData_v4`, `personal_sign`, `wallet_switchEthereumChain`, `wallet_addEthereumChain` y
`wallet_revokePermissions`; desde una página recorren la ruta aprobable completa
(`router.ts:578-609`). `eth_sign` queda **fuera** de la unión a propósito
(`src/shared/types.ts:112-118`).
#### 4.2.2 La unión que cruza la frontera
`WalletMethod = PageMethod | InternalMethod` (`src/shared/types.ts:121`) es la única unión que
puede cruzar la frontera popup ↔ Service Worker, y el catálogo la usa para declarar lo que existe
(`catalog.ts:196-201`).
### 4.3 Qué es solo para contextos de la extensión
Los 16 internos declaran `context: 'extension'` y `requiresApproval: false`
(`catalog.ts:229-368`). Ningún interno abre la ventana única (P-21): la aprobación del revelado es
una **confirmación explícita dentro del propio contexto**, no una `PendingRequest`
(`catalog.ts:35-37`, `:279-288`). `EXTENSION_INVOKABLE_INTERNAL_METHODS` (`catalog.ts:190-194`)
permite al **popup** invocar `wallet_revokePermissions`, `wallet_switchEthereumChain` y
`wallet_addEthereumChain`: la revocación desde el popup no abre ventana porque su confirmación es
la propia UI de «Sitios conectados» (`router.ts:591-596`), y los dos métodos de red siguen la ruta
aprobable en ambos contextos (`router.ts:626-653`; `catalog.ts:428-459`). Además de la allowlist,
el router vuelve a comprobar el contexto antes de despachar: `wallet_revealSecret` desde un
contexto no confiable responde `4200` aunque hubiera pasado las guardas anteriores
(`router.ts:573-576`). Las consultas que deciden todo esto son `isCatalogMethod`,
`isInternalMethod`, `isExtensionInvokable` y `getCatalogEntry` (`catalog.ts:482-520`), usadas en
`router.ts:529-564`.
### 4.4 Método desconocido: códigos reales
| Situación | Comprobación | Código y causa reales |
|---|---|---|
| `sender.id` ajeno | `senderGuard.ts:245-249` | `4100 unauthorizedOrigin` (`errors.ts:84-88`) |
| Origen no utilizable | `senderGuard.ts:255-258` | `4100 unauthorizedOrigin` |
| Ruta de respuesta fuera de allowlist | `senderGuard.ts:294-299` | `4200 methodNotAllowedInContext` (`errors.ts:95-100`) |
| `wallet_*` desde una página | `senderGuard.ts:260-263`, `router.ts:549-564` | `4200 methodNotAllowedInContext` |
| Método fuera del catálogo (`eth_sign`, inventado) | `router.ts:538-547` | `4200 unsupportedMethod` (`errors.ts:89-94`) |
| Tasa agotada | `router.ts:566-571` | `4001 rateLimitExceeded` (`errors.ts:69-75`) |

`unsupportedMethodError()` devuelve «El método solicitado no está soportado por TrueKeate
Wallet.» con `code: 4200` y acción «Usar personal_sign o eth_signTypedData_v4»
(`src/background/rpc/errors.ts:89-94`, `:531`); `methodNotAllowedInContextError()` usa el mismo
`4200` con «El método solicitado no está permitido en este contexto.» y acción «Invocarlo desde el
popup» (`errors.ts:95-100`, `:534-535`). Cualquier excepción no tipada se convierte en `-32603`
mediante `toEip1193Error` (`router.ts:661-677`): **nunca** escapa un error sin `code`.
## 5. Redacción de logs
### 5.1 Política de redacción (`redaction.ts`)
`src/background/security/redaction.ts` (329 líneas) es la política; su cabecera enumera las reglas
«sin excepción» (`redaction.ts:6-15`).
#### 5.1.1 Campos sensibles y firmas
`SENSITIVE_PARAM_KEYS` (`redaction.ts:54-66`) contiene `privatekey`, `privkey`, `mnemonic`,
`seed`, `passphrase`, `password`, `secret`, `vault`, `keystore`, `entropy` y `phrase`, y la
comparación es por **contención** sobre la clave normalizada —minúsculas y sin separadores,
`normalizeParamKey` en `:42`—, no por igualdad exacta: ese era el defecto medido que persistía
`privKey` o `seedWords` íntegros (`redaction.ts:44-52`). El valor se sustituye por
`REDACTED = '[redactado]'` (`redaction.ts:30`). `isSignatureKey` (`redaction.ts:80-86`) reconoce
`signature*`, `sig`, `sighex`, `rsv`, `ecdsa` y `ecdsasig`; una firma hexadecimal se recorta a
`0x1234…abcd` con `previewSignature` (`redaction.ts:119-120`) y los alias cortos se comparan por
igualdad exacta para no mutilar `signer`, que es una dirección (`redaction.ts:68-76`). La condición
de «objeto de firma» se **propaga a los hijos**, de modo que `{ signature: { r, s, v } }` no deja
`r` y `s` completos (`redaction.ts:153-170`). Además, `looksLikeMnemonic` valida 12 palabras contra
la lista inglesa y el checksum (`redaction.ts:122-132`) y `containsSecretMaterial` recorre la
estructura hasta profundidad 6 (`redaction.ts:134-151`), así que una frase se redacta **aunque su
clave no esté en la lista**.
#### 5.1.2 Calldata: primeros 10 bytes
`DATA_PREVIEW_BYTES = 10` y `DATA_PREVIEW_CHARS = 22` (`redaction.ts:36-39`): el calldata se
registra con sus **primeros 10 bytes** más `dataLength`, y **no existe ninguna variante de 4
bytes** (regla única de `D-T`, `redaction.ts:8-9`, `:108-116`).
#### 5.1.3 Redacción específica por método
`redactParams` (`redaction.ts:247-317`) trata caso por caso: `personal_sign` guarda `address`,
`messageHash` y `messageBytes` —corrigiendo el defecto de elegir el primer parámetro con forma de
dirección, ahora se toma la **última** posición como dirección (`:250-268`)—;
`eth_signTypedData_v4` guarda `primaryType`, `domain.name`, `domain.chainId`,
`domain.verifyingContract` y el **hash** + longitud del `message`, nunca el `message` completo
(`:270-299`); `eth_sendTransaction` guarda `from`, `to`, `value`, `nonce` y el preview de `data`
(`:300-309`); `wallet_importPrivateKey` y `wallet_generateMnemonic` solo dejan
`{ redacted: true }` (`:310-313`).
#### 5.1.4 Umbral `PREVIEW_INLINE_MAX_BYTES = 4096`
`src/shared/constants.ts:151` fija el umbral de redacción de previews en reposo. Por encima,
`redactLargePayload` sustituye el texto por `{ payloadHash, payloadBytes, truncated: true }`
(`redaction.ts:203-208`) y `redactValue` lo aplica a cualquier cadena larga (`:184-186`).
`redactSignedPayload` es la implementación única de «hash + longitud» para el payload firmado
(`:210-231`) y `measurePayloadBytes` mide el payload serializado para la cota de 64 KiB
(`:233-240`).
### 5.2 Normalización de `sha256` (`hash.ts`)
`src/background/security/hash.ts` (42 líneas) registra una implementación de `sha256` que
**envuelve** la nativa y garantiza que devuelve un `Uint8Array` utilizable (`hash.ts:34-40`),
porque `ethers` v6 delega el algoritmo en el runtime y, cuando cae a `node:crypto`, devuelve un
`Buffer` de otro reino que la comprobación interna rechaza con `invalid BytesLike value`
(`hash.ts:5-13`). El registro se ejecuta al importar el módulo (`hash.ts:42`) y en el navegador es
idempotente y sin coste (`hash.ts:14-17`); `redaction.ts` lo importa antes de usar `sha256`
(`redaction.ts:22-25`) y `hashValue` produce `sha256:<hex>` (`redaction.ts:97-106`).
### 5.3 Dónde se aplica: `sanitizeLogData`
El router redacta los `params` **antes** de cualquier persistencia o traza (`router.ts:520-521`,
cabecera `:9-11`) y, si la política fallara, registra un aviso y devuelve lista vacía —«mejor
perder detalle de traza que filtrar un secreto»— (`router.ts:428-439`). Después,
`sanitizeLogData` (`src/background/logging/logger.ts:341-354`) se aplica **siempre**, aunque el
llamador ya haya redactado: recorta el calldata de cualquier `data`/`input`/`calldata` a
profundidad (`truncateCalldataDeep`, `logger.ts:303-327`, con el patrón de claves en `:272-276`),
pasa el resto por `redactLogData` (`= redactValue`, `redaction.ts:329`) y, si el resultado textual
supera `PREVIEW_INLINE_MAX_BYTES`, devuelve `payloadHash` + `payloadBytes` + `truncated: true`
(`logger.ts:346-352`); la garantía **no depende del llamador**. El logger es el **único** que
escribe `truekeate_logs` (`logger.ts:14-15`), escribe exactamente 1 entrada por evento (`:16-18`),
exige un evento del catálogo cerrado (`:19-20`) y aplica retención FIFO de `logLimit = 500` global
y `logMaxPerOrigin = 200` por origen (`logger.ts:24`; `src/shared/constants.ts:154-155`).
### 5.4 Specs de la redacción
`src/background/security/redactionDeep.spec.ts` cubre el hueco que dejaba la comprobación con
claves exactas —variantes de nombre (`privKey`, `accountPrivateKey`, `sig`, `txData`, `inputData`)
y firmas anidadas—, afirmando sobre el **texto serializado** que acaba en `truekeate_logs`
(`redactionDeep.spec.ts:6-12`). `src/background/logging/logRedaction.spec.ts` es la prohibición
**bloqueante** de que una entrada contenga payload íntegro, claves privadas, el mnemonic o firmas
completas (`logRedaction.spec.ts:1-11`), con las constantes de recorte importadas del propio
módulo (`logRedaction.spec.ts:16-17`).
## 6. Cola de aprobaciones y anti-abuso
### 6.1 Cardinalidad
`src/shared/constants.ts:162-171` fija las tres cotas: `pendingRequestsMax = 8` global,
`pendingRequestsMaxPerOrigin = 1` por origen y `pendingRequestsPerMinute = 6`. El alta
`enqueueApprovalRequest` las aplica en orden: duplicado de identificador → `-32603`
(`queue.ts:431-434`), cardinalidad global → `4001` (`:441-450`), cardinalidad por origen → `4001`
(`:451-460`) y ventana de tasa → `4001` (`:462-474`). Al exceder se responde **de inmediato, sin
persistir, sin abrir ventana y sin contar para el badge** (`queue.ts:19-21`). Los literales son «Hay
demasiadas solicitudes pendientes para este origen…» (`errors.ts:62-68`) y «Se ha superado el
límite de llamadas para este origen…» (`errors.ts:69-75`), ambos `4001`. `pendingCount` es un
índice **derivado** (`queue.ts:203-208`), `oldestPending` elige la `pending` de menor `createdAt`
—desempate por `approvalId`— para la ventana única (`queue.ts:218-231`) y el badge se recalcula tras
cada escritura sin persistirse (`queue.ts:822-851`).
### 6.2 *Token bucket* por origen de TODO el catálogo
`rateLimitWindowRequests` se **deriva** de `pendingRequestsPerMinute` y `rateLimitWindowMs` de
`RATE_WINDOW_MS` (`src/shared/constants.ts:194-197`), de modo que el bucket y la cardinalidad de
aprobables tienen una sola fuente; las constantes muertas que contradecían el corpus se eliminaron
(`constants.ts:187-193`). El estado vive en `truekeate_rate_windows`, así que **sobrevive a la
suspensión del Service Worker** (`src/background/rpc/rateLimit.ts:11-12`). `consumeRateWindow` es
una función **pura** (`rateLimit.ts:151-177`) y `normalizeRateWindow` recarga la ventana al vencer,
reinicia el reloj si va hacia atrás y acota los tokens (`rateLimit.ts:109-137`); el detalle
incómodo está documentado: la rama de reinicio no reseteaba `approvalsInWindow`, de modo que el
origen quedaba bloqueado hasta la purga por inactividad (`rateLimit.ts:120-134`). El bucket cubre
**también las lecturas**, así que una dApp hostil no puede saturar `eth_getBalance`,
`eth_estimateGas` o `eth_blockNumber` (`rateLimit.ts:8-10`); los contextos de la extensión
(`origin === 'extension'`) están **exentos** porque el *polling* de saldos agotaría el bucket en un
ciclo (`rateLimit.ts:15-16`, `:93-94`). La decisión se aplica en el router antes del despacho y
responde `4001` sin llamar al nodo (`router.ts:566-571`). `reconcileRateWindows` descarta las
entradas con más de `rateWindowTtlMs = 600 000` ms sin uso y reinicia las de reloj futuro
(`rateLimit.ts:233-264`; `constants.ts:174`).
### 6.3 Cota de payload de 64 KiB
`MAX_PAYLOAD_BYTES = 65 536` (`src/shared/constants.ts:145`, con el alias `PAYLOAD_MAX_BYTES` en
`:148`). `enqueueApprovalRequest` mide con `measurePayloadBytes` **antes** de crear la entrada y,
si supera la cota, devuelve `createEip1193Error('payloadTooLarge', …)` sin persistir ni abrir
ventana (`queue.ts:400-407`). La causa está registrada con `code: -32602` y el mensaje «La carga
útil de la solicitud supera el límite de 64 KiB.» (`src/background/rpc/errors.ts:139-144`), y su
consumo se prueba en `src/background/approvals/payloadLimit.spec.ts`.
### 6.4 Ventana de vencimiento con `chrome.alarms`
`expiresAt = createdAt + SIGN_TIMEOUT_MS` (120 000 ms) **anclado a `createdAt`**, nunca a la
apertura de la ventana (`src/background/approvals/timeout.ts:12-13`, `:151-152`); para la conexión
son 60 000 ms (`timeout.ts:154-155`). `setTimeout` y `setInterval` están **prohibidos** porque no
sobreviven a la suspensión del SW (`timeout.ts:16-18`) y el fichero no contiene ninguno. La alarma
se llama `truekeate_expire:<approvalId>` (`timeout.ts:117-119`; prefijo en
`src/shared/constants.ts:223`) y se arma con `when: expiresAt` (`timeout.ts:174-190`). Al arrancar,
`rearmExpiryAlarms` rearma las `pending` desde su `expiresAt` **persistido** y retira las huérfanas
(`timeout.ts:277-310`), y `reconcileInflightAlarms` hace lo propio con las marcas en vuelo
(`:318-350`). `expireApprovalRequest` marca la entrada `expired` con `resolvedAt` y
`errorCode: 4001`, entrega a la página el objeto EIP-1193 (`timeoutError`, 4001), deja la ventana
única en la siguiente `pending` o la cierra, purga el badge y escribe la traza `approval_expired`
(`timeout.ts:384-467`); el literal es «El usuario no respondió en el plazo establecido (120 s); la
solicitud ha caducado.» (`errors.ts:48-54`).
### 6.5 Anti-replay de respuestas duplicadas
`resolveApprovalRequest` devuelve `null` cuando la entrada ya no está `pending`: **respuesta
duplicada ignorada** (`X-06`), «el SW nunca firma ni difunde dos veces» (`queue.ts:563-566`,
`:578-580`). Si el plazo ya venció, **prevalece `expired`** aunque la decisión fuera aprobar
(`queue.ts:581-582`). El vencimiento es idempotente por la misma vía: si la entrada ya no está
`pending`, solo limpia su alarma y no entrega nada (`timeout.ts:400-413`, `:22-23`).
### 6.6 La marca `truekeate_inflight_tx`
La marca vive en `truekeate_inflight_tx` (`src/background/state/schema.ts:62`) y garantiza «máximo
1 transacción en vuelo por `from`»: `phase: 'signing'` bloquea la cuenta y `'broadcast'` la libera
(`queue.ts:22-24`). `beginInflightTx` escribe `signing` **antes** de firmar; si la cuenta ya está
bloqueada responde `inflightTxInProgress` (`-32000`, `errors.ts:280-290`) y la solicitud permanece
`pending` (`queue.ts:722-767`). `markInflightBroadcast` reescribe la MISMA entrada con
`phase: 'broadcast'` y el hash del nodo (`queue.ts:778-804`) y `releaseInflightTx` la libera al
confirmar, fallar o vencer (`:806-820`). `INFLIGHT_TTL_MS = 180 000`
(`src/shared/constants.ts:107`) y una entrada sin `expiresAt` numérico **no** se considera vigente,
para que no bloquee el reset para siempre (`schema.ts:431-443`); el estado de exclusión mutua es
`free | signing | broadcast` (`queue.ts:691-705`). La misma marca participa en las guardas del
reset: `checkResetGuards` bloquea con `-32000 resetBlocked` si hay cola `pending` o transacción en
vuelo vigente (`schema.ts:479-500`; `errors.ts:171-176`).
## 7. La ventana decide, no firma
### 7.1 La DECISIÓN es de la UI
`src/notification/App.tsx` (1338 líneas) lo declara en su cabecera: «**Decide, no firma**
(`CA-RF-35`): solo envía `SIGN_RESPONSE { approvalId, success }`. La firma, la difusión y la
escritura de la cola son del Service Worker» (`App.tsx:9-12`); también declara que no lee ni
escribe el almacén, no importa `ethers` y no ejecuta criptografía (`App.tsx:20-21`).
`deliverSignResponse` usa el canal del runtime y traduce cualquier fallo a un error tipado
(`App.tsx:446-462`). La función de decisión es `decide(success)`: comprueba que hay solicitud, que
no está ocupada, que no se ha decidido ya y que **no hay avisos bloqueantes sin marcar**; después
construye el `SIGN_RESPONSE` y lo entrega (`App.tsx:1215-1245`). Cerrar con la X equivale a
rechazo: entrega un `SIGN_RESPONSE` con `success: false` y el error `4001` (`App.tsx:1247-1259`;
literal en `App.tsx:76-79`). El cuerpo de la solicitud se pide al Service Worker por el puerto de
aprobación (`APPROVAL_PORT_NAME = 'truekeate_approval'`, `src/shared/constants.ts:220`) o se recibe
por el canal del runtime (`App.tsx:23-37`): la ventana **pinta** lo que el SW le entrega, no lo
reconstruye. Los avisos de severidad bloqueante se marcan en `App.tsx:537-539` y condicionan la
aprobación (`App.tsx:904`, `:1076`, `:1221-1223`).
### 7.2 La FIRMA es del Service Worker
`src/background/crypto/sign.ts` (719 líneas) es «**ÚNICA VÍA DE FIRMA** de TrueKeate Wallet.
Ninguna otra parte del sistema firma ni toca la clave privada» (`sign.ts:1-6`). Firma transacción
EIP-1559 tipo 2, transacción legada EIP-155 con `v = chainId*2 + 35/36`, EIP-712 (`domain` +
`types` + `message`, eliminando `EIP712Domain` de `types` antes de firmar) y `personal_sign` con el
prefijo `\x19Ethereum Signed Message:\n<longitud>` (`sign.ts:8-26`). Un `chainId` que no sea el
activo se rechaza con `4901 chainNotRegistered` **sin firmar nada**: «nunca se firma una
transacción para otra red» (`sign.ts:25-26`; literal en `errors.ts:107-112`). El módulo declara lo
que queda fuera: no difunde (M7), no abre ventanas (M18), no escribe la cola (M14) y **no
registra** ni el `data` íntegro, ni la firma completa, ni la clave (`sign.ts:28-29`).
### 7.3 La orquestación (`dispatch.ts`, M19.b)
`src/background/approvals/dispatch.ts` documenta los nueve pasos del orden normativo
(`dispatch.ts:17-50`): contexto y red activa (sin sesión → `4100` sin abrir ventana), estimación
previa de gas, vista previa (M19), alta en la cola (M14), plazo (M15), ventana única (M18), espera
de la decisión (M14.b), efecto según el método y rechazo/vencimiento con `4001`; el paso 8 incluye,
para `eth_sendTransaction`, recalcular nonce y comisiones, tomar la marca `signing`, firmar tipo 2
(M11), difundir (M7) y pasar la marca a `broadcast` (`dispatch.ts:32-36`). El módulo se declara
como **orquestación**: «**no duplica lógica**» —M19 construye las previews, M14 la cola y la marca
en vuelo, M15 el plazo, M17 la entrega, M18 la ventana única, **M11 la firma** y M7 la difusión—
(`dispatch.ts:13-15`); sus importaciones lo confirman: `signTransaction`, `signPersonalMessage` y
`signTypedData` vienen de `../crypto/sign` (`dispatch.ts:82-87`). El router corrige un defecto
medido: los tres métodos de firma invocados por el POPUP también recorren la ruta aprobable, y la
única exclusión legítima del contexto de extensión es `wallet_revokePermissions`
(`router.ts:582-596`), de modo que el envío desde el popup abre la MISMA ventana única y la firma
sigue siendo del SW.
## 8. Higiene del revelado (RF-50)
### 8.1 Política en `secrets.ts`
`src/background/crypto/secrets.ts` (429 líneas) declara cuatro reglas: confirmación explícita
obligatoria sin la cual no se entrega nada (`4001`); solo contextos de confianza con ruta en la
allowlist; guarda `-32000` si la cuenta está en uso por una dApp vigente; e higiene del revelado
—oculto por defecto, plazo de **30 s**, ocultado también por pérdida de foco, descarte del valor de
la memoria de la UI y borrado del portapapeles al ocultar— (`secrets.ts:9-23`).
`REVEAL_ALLOWED_ROUTES = [EXTENSION_ROUTE_POPUP]` (`secrets.ts:100-101`) y `canRevealInContext`
exige contexto de extensión **y** ruta del popup (`:116-119`). El valor **jamás** viaja por
`window.postMessage`: el canal es el mensaje interno del protocolo (`secrets.ts:15-16`).
`SECRET_HIDE_MS = REVEAL_HIDE_MS` (`secrets.ts:45-46`; `REVEAL_HIDE_MS = 30 000` en
`src/shared/constants.ts:101`). Sin `confirmed: true` se responde `4001` (`secrets.ts:140-143`) y
con una sesión vigente sobre la cuenta —o sobre cualquiera de las que deriva el mnemonic— se
responde `-32000 accountInUseByDapp` (`secrets.ts:150-158`, `:185-188`; literal en
`errors.ts:163-169`).
### 8.2 Sesión de revelado, temporizador y pérdida de foco
`createRevealSession` guarda el valor en una **clausura** y lo anula al ocultar, de modo que no
queda copia en el estado de la UI (`secrets.ts:336-351`); `hide(reason)` marca no visible, descarta
el valor, cancela el temporizador y aplica la política de portapapeles (`:380-410`), y el primer
disparador gana mientras los siguientes son un no-op (`:337-340`). `hideOnFocusLoss()` es el atajo
del `blur` (`:411`).
### 8.3 Implementación en la UI (`SecurityView.tsx`)
`src/popup/views/SecurityView.tsx` (576 líneas) enumera su higiene: aceptación previa, oculto por
defecto (el nodo del DOM no existe cuando está oculto, no se esconde con CSS), plazo único de 30 s
con cuenta atrás y botón «Ocultar ahora», doble disparador (temporizador **o** pérdida de foco),
descarte al ocultar, prohibición de `window.postMessage` y aviso de captura
(`SecurityView.tsx:6-22`). El valor se pide al SW con `wallet_revealSecret`
(`SecurityView.tsx:319-320`) y la cuenta atrás se deriva de `REVEAL_HIDE_MS` (`:402-404`). El
temporizador compara el tiempo transcurrido y llama a `hideSecret('timer')` (`:263-264`); la
pérdida de foco se cubre con **dos** escuchas, `window.blur` y `visibilitychange` hacia oculto,
ambas llamando a `hideSecret('blur')` (`:274-293`), y recuperar el foco **no** vuelve a mostrar el
valor (`:15-16`). Al ocultar, el valor se descarta del estado y del `ref` antes de tocar el
portapapeles (`:150-160`).
### 8.4 Portapapeles
`CLIPBOARD_CLEAR_ON_HIDE = true` (`src/shared/constants.ts:251`): al ocultarse el valor, si el
portapapeles **aún lo contiene**, se sobrescribe con cadena vacía; la comparación es por `sha256`
del valor revelado, así que nunca se destruye contenido ajeno (comentario normativo en
`constants.ts:245-250`). `CLIPBOARD_POLICY_ENABLED` refleja esa constante (`secrets.ts:48-49`) y
`clearClipboardIfContains` implementa el borrado condicional, con borrado incondicional de respaldo
**solo** si la lectura falla, informándolo siempre —«nunca en silencio»— (`secrets.ts:259-286`). En
la vista, el borrado **inmediato** compara el contenido con el valor
(`SecurityView.tsx:180-183`); cuando el ocultado ocurre **sin foco**, Chrome rechaza leer y escribir
el portapapeles (`NotAllowedError: Document is not focused`), así que se guarda solo la **huella
SHA-256** (`hashText`, `SecurityView.tsx:99-114`) en un `ref` y el borrado se aplaza hasta recuperar
el foco, comparando entonces la huella y sobrescribiendo **solo** si coincide
(`SecurityView.tsx:136-142`, `:213-231`); si no hay digest se aplica el borrado incondicional de
respaldo (`:172-175`) y un fallo real se pinta con la causa canónica `clipboardFailure` (`-32603`,
`errors.ts:250-256`). El corpus describe el mecanismo como `clipboardHash` y el módulo del SW
declara la sustitución por la comparación **directa** «que es lo que exige §3.8 regla 5 y evita
introducir criptografía en la capa de UI» (`secrets.ts:32-34`); la UI sí usa
`crypto.subtle.digest` cuando necesita conservar la huella sin el valor (`SecurityView.tsx:99-114`).
Ambas conductas están en el código y documentadas en esos dos puntos.
### 8.5 Prohibición de revelar por `postMessage` y specs
RNF-09 exige que el mnemonic y las claves privadas **nunca** viajen por `window.postMessage` ni
hacia la página web (`RepoTecnico/requerimientos.md:194`); el valor solo puede salir por el canal
interno, y el propio reveal revalida el contexto (§4.3).
`src/background/crypto/revealHygiene.spec.ts` fija ese punto —«el valor **nunca** viaja por
`window.postMessage` ni por `chrome.runtime.sendMessage`» (`revealHygiene.spec.ts:6-13`)— y cubre
el plazo de 30 s con temporizador inyectable, el ocultado por pérdida de foco y el descarte de
memoria (`read()` pasa a `null`), con reloj fijo (`revealHygiene.spec.ts:1-16`, `:33-34`).
`src/background/crypto/revealClipboard.spec.ts` cubre el criterio de «fuga por el portapapeles»
—si aún lo contiene se sobrescribe con cadena vacía; si no, **no** se destruye contenido ajeno— con
un portapapeles falso que registra cada escritura (`revealClipboard.spec.ts:1-13`, `:34-35`,
`:40-45`). La verificación en navegador del doble disparador y del borrado real se declara en el E2E
`e2e/25-recuperacion.spec.ts` (`revealHygiene.spec.ts:11-13`).
## 9. Integridad de la cartera
### 9.1 Checksum BIP-39 y EIP-55 al arrancar
`src/background/crypto/integrity.ts` (288 líneas) garantiza que un mnemonic con **checksum BIP-39
roto** o una dirección con **EIP-55 inválido** dejan el estado en «wallet dañada», y que la única
criptografía que ejecuta es **verificación**: checksum de la frase, checksum de las direcciones y
contraste clave privada ↔ dirección de una importada (`integrity.ts:5-15`).
`inspectWalletIntegrity` es una función **pura** que no escribe nada (`integrity.ts:112-119`):
valida la frase (`:125-138`), recorre las direcciones derivadas conservando posiciones y avisa de
forma y checksum (`:151-170`), contrasta cada importada con su clave (`:172-211`) y comprueba que
la cuenta activa exista (`:213-233`). Un hueco en la lista de cuentas se representa con cadena
vacía en lugar de eliminarse, porque el índice del array ES el índice BIP-44 y compactarlo en
silencio entregaría la clave privada de otra cuenta (`integrity.ts:94-110`).
### 9.2 El estado `'damaged'`
`IntegrityStatus` es `'absent' | 'ok' | 'damaged'` (`integrity.ts:33-34`) y el estado se decide con
`damaged ? 'damaged' : empty ? 'absent' : 'ok'` (`integrity.ts:235-237`). El daño fija la etiqueta
`DAMAGED_WALLET_LABEL = 'Wallet dañada'` (`integrity.ts:30-31`, `:251`) y produce un error tipado
del catálogo: `damagedWallet` con `code: -32603` («La cartera guardada está dañada y no se puede
usar: no se derivan cuentas nuevas desde ella.», `errors.ts:218-224`) más los motivos en `issues`
(`integrity.ts:252`). `canDerive` exige frase válida **y** ausencia de daño (`integrity.ts:238`).
### 9.3 El SW NO deriva nada en silencio
El informe declara `derivations: 0` **siempre**: «CERO derivaciones silenciosas: este módulo NO
deriva ninguna cuenta del mnemonic» y ninguna rutina de arranque puede sustituir una dirección
persistida por otra derivada «por si acaso», porque esa corrección silenciosa es exactamente lo que
RNF-22 prohíbe (`integrity.ts:7-11`, `:64-65`, `:249`). La fase 3 del arranque ejecuta la
comprobación y, si la cartera está dañada, avisa por consola —**sin volcar material sensible**,
solo los motivos— y devuelve la instantánea «dañada» para la UI, pero el SW **sigue operativo**
(`src/background.ts:316-333`; invocación en `:648-649`). El estado llega al popup por
`wallet_getState`, que proyecta `status`, `label`, `problems`, `mnemonicPresent`, `mnemonicValid` y
`canDerive` (`src/background/rpc/catalog.ts:1003-1025`; forma en `catalog.ts:588-597`).
`isWalletUsable` expone la comprobación reutilizable (`integrity.ts:275-276`) y `checkIntegrity` es
el nombre con el que la invoca el arranque (`integrity.ts:284-288`).
## 10. Decodificación sin servicios externos
### 10.1 Tabla LOCAL cerrada de selectores (M66)
`src/background/approvals/calldata.ts` (484 líneas) es la «Tabla **LOCAL Y CERRADA** de selectores:
la ÚNICA fuente de decodificación del calldata» y el oráculo anti-firma-ciega de R5
(`calldata.ts:1-7`). El conjunto de selectores reconocidos es **exactamente** el del cuadro
normativo y **no se amplía en runtime**: ninguna lista remota, ningún ABI descargado, ningún
servicio de firmas (RT-03) (`calldata.ts:8-11`). `SELECTOR_TABLE` (`calldata.ts:131-198`) contiene
`transfer(address,uint256)`, `transferFrom(address,address,uint256)`, `approve(address,uint256)`,
`increaseAllowance(address,uint256)`, `setApprovalForAll(address,bool)`,
`permit(address,address,uint256,uint256,uint8,bytes32,bytes32)` y `multicall(bytes[])`; la lista
derivada tiene 7 entradas (`calldata.ts:208-211`). La única criptografía que se usa es `keccak256`
de `ethers` v6 para **verificar** que cada selector literal coincide con su firma canónica
(`calldata.ts:10-11`, `:222-230`), y el runtime nunca amplía la tabla con ese cálculo
(`:226-227`). `decodedArgs` se limita a **escalares y direcciones** serializables: los `uintN`/
`intN` se devuelven como **cadena decimal** (nunca `bigint`, que no es serializable en
`chrome.storage.local`), las direcciones con checksum EIP-55 y los `bytes` largos truncados a
`0x1234…abcd` (`calldata.ts:15-18`; implementación en `:263-298`); `multicall(bytes[])` se
decodifica **recursivamente** con la misma tabla, de modo que una sub-llamada desconocida sigue
marcándose como no reconocida (`calldata.ts:19-20`, `:366-388`).
### 10.2 Fuera de la tabla: `functionName = null` y aviso bloqueante
`decodeCalldata` documenta el contrato exacto (`calldata.ts:390-400`): `data` vacío (`0x`) es
transferencia simple; un selector **fuera** de la tabla devuelve `functionName = null`,
`decodedArgs = null`, `isUnrecognizedContractCall: true` y el aviso estructural `unrecognized`
(`calldata.ts:420-428`); un selector **dentro** con argumentos que no encajan conserva la firma y
devuelve `decodedArgs = null` con `decode-failed` (`:429-438`, `:457-465`). `calldata.ts` **no**
redacta los textos: M19 los convierte en `riskWarnings[]` para que los literales vivan en un único
lugar (`calldata.ts:62-65`). `RISK_WARNINGS` define `unrecognizedContract` —«Llamada a contrato NO
RECONOCIDA: el selector no está en la tabla local cerrada de TrueKeate…»—
(`src/background/approvals/preview.ts:80-82`) y `BLOCKING_RISK_WARNINGS` lo marca como
**bloqueante** junto con `undecodableArguments`, `multicallWithUnrecognized` y
`verifyingContractMismatch` (`preview.ts:106-112`); `preview.ts` declara que fuera de la tabla el
aviso es bloqueante «(R5: la firma ciega invalida el hito)» (`preview.ts:9-12`) y
`hasBlockingRiskWarning` expone la comprobación (`:114-116`).
### 10.3 Otros avisos obligatorios y prohibición de servicios externos
Además de los bloqueantes, la vista previa avisa de allowance ilimitada
(`approve`/`increaseAllowance` con `2^256-1`), aprobación total de NFTs
(`setApprovalForAll(operator, true)`), firma `permit`, destino sin etiqueta, despliegue de
contrato, payload no legible, mensaje largo y `domainChainMismatch` (`preview.ts:70-104`; cálculo
en `:227-264`), con los flags estructurales derivados del calldata (`calldata.ts:341-364`). La
regla de origen es tajante: «**Prohibido** consultar servicios externos de firmas o de ABIs de
contrato (4byte, Etherscan, Sourcify o cualquier API)», porque rompería RT-03
(`RepoTecnico/diccionario_datos.md:625`); `calldata.ts` repite la prohibición en su cabecera
(`calldata.ts:8-10`) y declara que la tabla es **código propio**, no una dependencia
(`:22-23`). `computeSelector` permite a `test/oracle/calldata.spec.ts` recalcular cada selector y
fallar si alguno difiere del literal versionado (`calldata.ts:22-23`, `:222-230`); el spec vive en
`test/oracle/calldata.spec.ts` (no en `src/`, que es donde el corpus lo citaba).
## 11. Riesgos residuales y limitaciones conocidas
### 11.1 Sin contraseña y sin cifrado en reposo
`P-03 / RE-02`: `encryptionEnabled` es **SIEMPRE** `false` y `requirePasswordOnOpen` **SIEMPRE**
`false`; los campos se conservan por compatibilidad y el módulo de ajustes los fuerza aunque el
almacén traiga otro valor (`src/background/settings.ts:6-9`, `:219-220`). El tipo lo fija como
literal `false` (`src/shared/types.ts:421-423`, con el comentario «Cifrado descartado en P-03») y
RE-02 lo dice sin ambigüedad: el modo sin contraseña **implica que el mnemonic queda en claro en
`chrome.storage.local`**, riesgo aceptado solo para entorno de desarrollo
(`RepoTecnico/requerimientos.md:313`); «Cifrado con PBKDF2 y contraseña» figura como decisión
descartada por P-03 con riesgo aceptado y declarado (`requerimientos.md:269`). El E2E comprueba que
los dos flags quedan en `false` tras el alta (`e2e/01-onboarding.spec.ts:228-229`). En la práctica,
quien tenga acceso al perfil del navegador puede leer el almacén sin acreditar nada: la única
barrera para **mostrar** el secreto en el popup es la confirmación explícita de la UI y la guarda
`-32000` de sesión de dApp vigente (`src/background/crypto/secrets.ts:140-158`), y esa guarda **no**
actúa si no hay ninguna dApp conectada. Es una limitación de diseño declarada en RE-02 y compensada
con el aviso no descartable (RNF-23).
### 11.2 Sin hardware wallet
No se ha encontrado ninguna referencia a firma con dispositivo externo (Ledger, Trezor o
equivalente) en el código ni en el corpus: las búsquedas de `hardware`, `Ledger` y `Trezor` sobre
`src/` y `RepoTecnico/` no devuelven coincidencias. La consecuencia es que la clave privada
**siempre** reside en memoria del Service Worker durante la firma
(`src/background/crypto/sign.ts:1-6`). Si el proyecto prevé soporte futuro, **pendiente de
confirmar**: no consta en los requisitos leídos.
### 11.3 Red local Anvil sin fondos reales
La red por defecto es Anvil local (`0x7a69`, `http://127.0.0.1:8545`,
`src/shared/constants.ts:22-32`) y el propio manifest describe el producto como «Monedero Ethereum
no custodial para red local Anvil (entorno de desarrollo, **sin fondos reales**)»
(`src/manifest.ts:42-43`); la frase de Anvil se declara **solo** como pista de desarrollo y nunca
se persiste como cartera del usuario (`constants.ts:59-64`). `host_permissions` se limita a
`http://127.0.0.1:8545/*` y `http://localhost:8545/*` (`manifest.ts:64`) y los hosts adicionales
son **opcionales**, pedidos en runtime al dar de alta una red (`manifest.ts:65`); cuando la red
activa no es de pruebas se emite el aviso de RNF-23 (`NON_TESTNET_WARNING`,
`src/shared/constants.ts:47-49`). El riesgo residual real es el RPC local: si Anvil escucha más
allá de `127.0.0.1` o con CORS abierto, cualquiera en la máquina puede hablar con él; la norma del
producto exige allowlist de CORS con el ID estable de la extensión
(`RepoTecnico/entornos_globales.md:59`; `RepoTecnico/estado_proyecto.md:389`).
### 11.4 Superficie de inyección y permisos de portapapeles
El manifest inyecta `content-script.js` en **todas** las URLs y en **todos** los frames, en
`document_start` (`src/manifest.ts:66-82`), y expone `inject.js` como recurso accesible desde la
web (`manifest.ts:83-89`); la acotación es `use_dynamic_url: true` —evita que un tercero
referencie el recurso por URL estable— y las exclusiones de MetaMask (`manifest.ts:69-77`, `:87`).
El alcance real está documentado sin adornos: lo único que la inyección expone es el provider
(`window.truekeate` y su alias `window.codecrypto`), **nunca** claves, mnemonic ni el storage
(`RepoTecnico/entornos_globales.md:287`). RNF-10 lo formula igual: `inject.js` se expone a todas
las páginas, **no solo a páginas autorizadas**, y el control real está en el receptor, que valida
`sender`/`origin` en cada mensaje, mantiene la allowlist cerrada de métodos internos y publica con
`targetOrigin` cerrado (`RepoTecnico/requerimientos.md:195`). Por tanto la superficie amplia es un
hecho aceptado y la defensa no es la ocultación, sino las guardas de §2 y §3. Además,
`clipboardRead` y `clipboardWrite` están declarados (`manifest.ts:62`) porque el borrado del
portapapeles al ocultar el secreto lo necesita, y se usan **solo** desde el popup
(`RepoTecnico/entornos_globales.md:278`); el riesgo residual es que la extensión **puede** leer el
portapapeles del usuario, ya que el permiso existe a nivel de manifest y no se puede limitar por
contexto.
### 11.5 Logs, cuota y observabilidad
`truekeate_logs` guarda los `params` **ya redactados** y sobrevive al reset
(`src/background/state/schema.ts:77-78`, `:402`). Aunque la redacción es profunda y verificada por
specs (§5.4), el riesgo residual es de **metadatos**: origen, método, instante, direcciones de
destino y primeros 10 bytes de calldata quedan en disco en claro; un atacante con acceso al perfil
obtiene el historial de actividad, no los secretos. El proyecto **no** declara `unlimitedStorage` a
propósito: la política es reducir el consumo con retención FIFO y hacer el desbordamiento
**observable** (`schema.ts:96-104`; cuota objetivo `STORAGE_QUOTA_BYTES = 10 485 760` en `:105`),
con aviso no descartable por encima del 90 % (`schema.ts:107-112`) y contador de descartes
publicado en `wallet_getLogs.dropped` (`logger.ts:24-31`). Riesgo residual: bajo presión de cuota
se **pierden entradas** de auditoría —de forma visible, pero se pierden—.
### 11.6 Otras limitaciones y aspectos pendientes
Los contextos de la extensión **no** pasan por el *token bucket*: `isRateLimitExempt` exime a
`origin === 'extension'` (`src/background/rpc/rateLimit.ts:93-94`) porque el *polling* de saldos
agotaría el bucket; el riesgo residual es que un popup anómalo, o un XSS en una superficie de la
extensión que invocara el canal, **no** encontraría límite de tasa, y la mitigación efectiva es que
el popup no ejecuta código de la página ni lee el almacén (§2.2). `src/manifest.ts` (92 líneas)
**no** declara `content_security_policy`, así que se aplica la CSP por defecto de MV3: **pendiente
de confirmar** si se considera suficiente o si falta declararla explícitamente. El almacén único es
`chrome.storage.local`, sin `storage.sync` ni `storage.session`
(`RepoTecnico/diccionario_datos.md:33`), de modo que la marca en vuelo, la ventana de tasa y la
cola **deben** sobrevivir a la suspensión del SW y su reconciliación al arranque es obligatoria
(§6.4, §6.6). Por último, dos recuentos de las notas de encargo no coinciden con el fichero actual y
quedan corregidos aquí: `src/background/security/senderGuard.ts` tiene **335** líneas (no 307) y
`src/background/rpc/internalMethods.ts` tiene **48** líneas (no 46). El resto de los datos
verificados —`applyStorageAccessLevel()` en `src/background.ts:640`, `deliverToPage` en
`src/background.ts:480`, los 8 tipos de mensaje en `src/shared/protocol.ts:35-43` y
`APPROVAL_PORT_NAME = 'truekeate_approval'` en `src/shared/constants.ts:220`— coinciden
exactamente con el código.
