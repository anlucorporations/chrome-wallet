# 03 — Stack Web3

Propósito: documentar, contra el código real de TrueKeate Wallet, qué estándares Web3 se usan, con qué librería y versión se implementan, en qué fichero y línea vive cada pieza, y qué estándares **no** están implementados; todas las referencias son `ruta:línea` sobre el árbol de este repositorio y lo no verificable se marca «pendiente de confirmar».

---

## ethers v6

La única librería criptográfica permitida del proyecto es `ethers.js` v6, declarada en `package.json:20` como `"ethers": "~6.15.0"`. Es una dependencia de producción (`package.json:19-23`), no de desarrollo, porque el Service Worker la usa en tiempo de ejecución.

### Versión y política de uso

#### Versión declarada y rango

- `package.json:20` — `"ethers": "~6.15.0"`.
- El rango `~6.15.0` admite parches `6.15.x` y mantiene la API mayor 6. La versión efectivamente instalada no se verifica en este manual (no se ejecutan `npm ls` ni builds); **pendiente de confirmar** con `package-lock.json`.

#### Dónde puede importarse `ethers`

El import real de la librería aparece en 15 ficheros de `src/`. La regla de arquitectura del proyecto es que el bundle de `ethers` vive en el Service Worker y **no** en la capa compartida consumida por el popup: `src/shared/validation/mnemonic.ts:7-8` lo declara explícitamente («este módulo vive en `src/shared/` y lo consume el popup, así que **no importa `ethers` ni hace criptografía**»). Por eso el validador de forma de la frase no usa la librería y el checksum sí.

#### Ficheros que importan `ethers` (verificado con `grep "from 'ethers'"`)

| Fichero | Línea | Símbolos importados |
|---|---|---|
| `src/background/crypto/mnemonic.ts` | 18 | `LangEn, Mnemonic, randomBytes, sha256, toUtf8Bytes, wordlists` |
| `src/background/crypto/hd.ts` | 17 | `HDNodeWallet` |
| `src/background/crypto/importAccount.ts` | 14 | `computeAddress` |
| `src/background/crypto/sign.ts` | 32-44 | `Transaction, TypedDataEncoder, Wallet, getBytes, hashMessage, isHexString, recoverAddress, toBeHex, toUtf8Bytes` (+ tipos `TypedDataDomain`, `TypedDataField`) |
| `src/background/crypto/integrity.ts` | 22 | `getAddress` |
| `src/background/rpc/client.ts` | 23 | `JsonRpcProvider, Network, isError, toBeHex` |
| `src/background/approvals/preview.ts` | 31 | `getAddress, getBytes, hexlify, isBytesLike, isHexString` |
| `src/background/approvals/calldata.ts` | 26 | `AbiCoder, getAddress, getBytes, hexlify, keccak256, toUtf8Bytes` |
| `src/background/security/hash.ts` | 25 | `sha256` |
| `src/background/security/redaction.ts` | 22 | `LangEn, Mnemonic, sha256, toUtf8Bytes, wordlists` |
| `src/background/crypto/eip155.spec.ts` | 10 | `Signature, Transaction, keccak256, recoverAddress` |
| `src/background/crypto/eip1559.spec.ts` | 11 | `Transaction` |
| `src/background/crypto/sign.spec.ts` | 11 | `Transaction, Wallet, keccak256` |
| `src/background/crypto/personalSign.spec.ts` | 10 | `getBytes, hashMessage, keccak256, recoverAddress, toUtf8Bytes, verifyMessage` |
| `src/background/crypto/typedData.spec.ts` | 14 | `Signature, TypedDataEncoder, recoverAddress, verifyTypedData` |

### Tabla de símbolos de ethers usados y su punto de uso

#### Proveedor y red

- `JsonRpcProvider` — `src/background/rpc/client.ts:206` (`new JsonRpcProvider(rpcUrl, network, { staticNetwork: network })`). Es **UN ÚNICO** proveedor cacheado por `(rpcUrl, chainId)` (`src/background/rpc/client.ts:167-209`).
- `Network` — `src/background/rpc/client.ts:205` (`new Network('truekeate', 31337)`), red declarada estática para que `ethers` no gaste una llamada en `eth_chainId`.
- `getFeeData()` (método del proveedor, no símbolo importado) — `src/background/rpc/txContract.ts:91`; `getTransactionCount(address, 'pending')` — `src/background/rpc/txContract.ts:95`; `provider.send(method, params)` — `src/background/rpc/client.ts:235`; `provider.destroy()` — `src/background/rpc/client.ts:201` y `:213`.

#### Claves, mnemónicos y direcciones

- `Mnemonic.fromEntropy` — `src/background/crypto/mnemonic.ts:128`.
- `Mnemonic.isValidMnemonic` — `src/background/crypto/mnemonic.ts:95` y `src/background/security/redaction.ts:131`.
- `randomBytes` — `src/background/crypto/mnemonic.ts:127`.
- `wordlists` / `LangEn` — `src/background/crypto/mnemonic.ts:35` y `src/background/security/redaction.ts:33`.
- `HDNodeWallet.fromPhrase` — `src/background/crypto/hd.ts:48`.
- `computeAddress` — `src/background/crypto/importAccount.ts:43`.
- `Wallet` — `src/background/crypto/sign.ts:267` (`new Wallet(privateKey)`).
- `getAddress` — `src/background/crypto/integrity.ts:84`, `src/background/approvals/preview.ts:136`, `src/background/approvals/calldata.ts:280`.

#### Firma, recuperación y hashing

- `Wallet.signTransaction` — `src/background/crypto/sign.ts:441` (tipo 2) y `:474` (legada).
- `Wallet.signTypedData` — `src/background/crypto/sign.ts:593`.
- `Wallet.signMessage` — `src/background/crypto/sign.ts:708`.
- `TypedDataEncoder.hash` — `src/background/crypto/sign.ts:592`, `:626`, `:635`.
- `recoverAddress` — `src/background/crypto/sign.ts:627`.
- `hashMessage` — `src/background/crypto/sign.ts:682`.
- `Transaction.from` — `src/background/crypto/sign.ts:407`.
- `keccak256` — `src/background/approvals/calldata.ts:230` (selector) y en las specs (`eip155.spec.ts:90`, `sign.spec.ts:77`, `personalSign.spec.ts:41`).
- `sha256` — `src/background/crypto/mnemonic.ts:137` y `src/background/security/hash.ts:35-36`.

#### Bytes, codificación y utilidades

- `getBytes` — `src/background/crypto/sign.ts:674`, `preview.ts:549`, `calldata.ts:441`, `:477`.
- `toUtf8Bytes` — `src/background/crypto/sign.ts:675,678`, `mnemonic.ts:137`, `calldata.ts:230`.
- `hexlify` — `src/background/approvals/preview.ts:598`, `calldata.ts:477`.
- `toBeHex` — `src/background/crypto/sign.ts:719` (`toBytes32Hex`), `src/background/rpc/client.ts:343`.
- `isHexString` — `src/background/crypto/sign.ts:364,673`, `preview.ts:547,602`.
- `isBytesLike` — `src/background/approvals/preview.ts:556`.
- `isError(error, 'TIMEOUT')` — `src/background/rpc/client.ts:253`.
- `AbiCoder.defaultAbiCoder()` — `src/background/approvals/calldata.ts:125`; `abiCoder.decode(...)` — `:314`.
- `Signature.from` / `verifyMessage` / `verifyTypedData` — solo en specs: `eip155.spec.ts:96`, `personalSign.spec.ts:97-98`, `typedData.spec.ts:163`.

#### Símbolos de ethers que NO se usan

Comprobado por búsqueda global: **no** aparecen `formatEther` ni `parseEther`. El formateo de ETH es propio del proyecto (`formatEth` en `src/shared/format.ts:43`), y el paso de ETH a wei se resuelve con la validación del proyecto, no con `parseEther`. Tampoco se importan `JsonRpcBatchProvider` ni utilidades de *batching*; **pendiente de confirmar** si algún helper de ethers no importado se usa de forma indirecta.

---

## BIP-39

### Generación y validación de la frase de recuperación

#### Generación desde entropía de 128 bits

La generación vive en el Service Worker, en `src/background/crypto/mnemonic.ts`:

- `MNEMONIC_ENTROPY_BYTES = 16` — `src/background/crypto/mnemonic.ts:38` (16 bytes = 128 bits, que producen 12 palabras).
- `generateMnemonic()` — `src/background/crypto/mnemonic.ts:120-129`: `Uint8Array.from(randomBytes(MNEMONIC_ENTROPY_BYTES))` y `Mnemonic.fromEntropy(entropy, undefined, ENGLISH_WORDLIST).phrase`.
- El comentario de `src/background/crypto/mnemonic.ts:121-126` documenta un defecto medido: `randomBytes` de ethers v6 puede devolver un `Buffer` de Node y `Mnemonic.fromEntropy` lo rechaza con «invalid BytesLike value»; por eso la entropía se normaliza **siempre** con `Uint8Array.from(...)`.
- `Mnemonic.fromEntropy` aplica internamente el **checksum** BIP-39 y la lista de 2048 palabras indicada (`src/background/crypto/mnemonic.ts:117-118`).
- La lista usada es la inglesa: `const ENGLISH_WORDLIST = wordlists.en ?? LangEn.wordlist()` — `src/background/crypto/mnemonic.ts:35`.

El consumidor de alto nivel es `createWallet()` — `src/background/accounts.ts:472-478` —, que llama a `generateMnemonic()` (`:475`) y persiste la frase con `persistWalletFromMnemonic`. El método interno `wallet_generateMnemonic` (`src/background/rpc/catalog.ts:231-232`, manejador en `:860-861`) genera 12 palabras y **no persiste nada**.

#### Normalización NFKD

La normalización es **compartida** y vive en `src/shared/validation/mnemonic.ts:52-65` (`normalizeMnemonic`), fuera de la capa criptográfica:

1. `.normalize('NFKD')` (`:57`);
2. eliminación de marcas diacríticas combinantes `[\u0300-\u036f]` (`:61`), con el razonamiento explícito de que una palabra acentuada nunca es BIP-39 pero el error debe ser siempre el mismo;
3. `.toLowerCase()` (`:62`);
4. unificación de espacios en blanco en un espacio simple (`:63`) y `trim()` (`:64`).

`src/background/crypto/mnemonic.ts:32` reexporta `normalizeMnemonic` y `MNEMONIC_WORD_COUNT` para que el dominio del Service Worker tenga un único punto de entrada sin reimplementar la regla.

#### Checksum y validación de 12 palabras

- `MNEMONIC_WORD_COUNT = 12` — `src/shared/validation/mnemonic.ts:24`.
- Longitudes admitidas por palabra: 3 a 8 caracteres — `src/shared/validation/mnemonic.ts:27-28`; patrón `^[a-z]+$` — `:31`.
- `validateMnemonicShape` — `src/shared/validation/mnemonic.ts:80-108`: falla por `empty` (`:92-94`), `wordCount` (`:95-97`) o `wordFormat` (`:98-106`).
- Pertenercia a la lista: `isMnemonicWord` usa `ENGLISH_WORDLIST.getWordIndex(word) >= 0` — `src/background/crypto/mnemonic.ts:60-66`.
- Checksum: `Mnemonic.isValidMnemonic(shape.normalized, ENGLISH_WORDLIST)` — `src/background/crypto/mnemonic.ts:95`. Si falla, el problema es `'checksum'` (`:100`).
- `checkMnemonic` distingue `'unknownWord'` (`:91`) de `'checksum'` (`:100`), pero **ambos** se comunican con el mismo error del catálogo `-32602 invalidMnemonic` (`invalidMnemonicError()` en `:92` y `:101`; definición en `src/background/rpc/errors.ts:114-118`).

#### Validación de la UI frente a la del Service Worker

El reparto es explícito en `src/shared/validation/mnemonic.ts:11-17`:

- **UI / capa compartida** (`src/shared/validation/mnemonic.ts`, módulo M59): forma, recuento y alfabeto. No importa `ethers` ni hace criptografía.
- **Service Worker** (`src/background/crypto/mnemonic.ts`, módulo M8): pertenencia a la lista de 2048 palabras y checksum BIP-39. Además, `checkMnemonic` reutiliza la forma de M59 como primer paso (`src/background/crypto/mnemonic.ts:75`) para no duplicar la regla.

En flujo real: `importWalletFromMnemonic` (`src/background/accounts.ts:484-494`) llama a `checkMnemonic(input)` (`:488`) y, si no es válida, devuelve `check.error ?? invalidMnemonicError()` (`:490`) **sin escribir nada**. La integridad de arranque también revalida: `inspectWalletIntegrity` llama a `checkMnemonic(rawMnemonic)` (`src/background/crypto/integrity.ts:126`) y clasifica el aviso como `mnemonic-checksum` o `mnemonic-shape` (`:130`).

#### Trazabilidad sin exponer la frase

`mnemonicFingerprint` devuelve `sha256:<hex>` de la frase normalizada (`src/background/crypto/mnemonic.ts:136-137`) y `mnemonicShortFingerprint` recorta a `sha256:<8 hex>` (`:140-141`). El módulo documenta que el valor nunca se registra ni viaja por mensaje (`src/background/crypto/mnemonic.ts:14-15`).

---

## BIP-32 / BIP-44

### Derivación jerárquica determinista de cuentas

#### Ruta de derivación real

- Literal vinculante: `export const DERIVATION_PREFIX = "m/44'/60'/0'/0" as const;` — `src/background/crypto/hd.ts:22`.
- Ruta completa por índice: `` `${DERIVATION_PREFIX}/${index}` `` — `src/background/crypto/hd.ts:35`, es decir `m/44'/60'/0'/0/i`.
- La derivación efectiva es `HDNodeWallet.fromPhrase(phrase, undefined, derivationPath(index))` — `src/background/crypto/hd.ts:48`.
- El comentario de cabecera lo fija como ruta única y vinculante — `src/background/crypto/hd.ts:6-8`.

La semántica de la ruta es la de BIP-44: propósito `44'`, moneda `60'` (Ethereum), cuenta `0'`, cambio `0` y el **índice del array** como dirección (`src/background/crypto/hd.ts:21`).

#### Cuenta por defecto y número de cuentas derivadas

- `DERIVED_ACCOUNTS = 5` — `src/shared/constants.ts:67`: «Cuentas derivadas al crear la cartera; el botón "Añadir cuenta" lo incrementa (RF-04)».
- `persistWalletFromMnemonic` deriva `deriveAccounts(mnemonic, count, 0)` (`src/background/accounts.ts:440`) y fija la cuenta activa en el índice 0 con `accountRefForIndex(0)` (`:456`).
- Índice máximo: `MAX_DERIVATION_INDEX = 0x7fffffff` — `src/background/crypto/hd.ts:25`; la comprobación `isValidDerivationIndex` exige entero en `[0, 2^31-1]` (`:38-39`).
- Cómo se expone la dirección: `deriveAddress` (`src/background/crypto/hd.ts:56-57`), `derivePrivateKey` (`:63-64`) y `deriveAccount` (`:67-73`), que devuelve `{ index, path, address }` con el `path` reportado por ethers o el calculado (`:72`).
- `deriveAccounts` devuelve lista vacía si la frase no es válida (`src/background/crypto/hd.ts:80-97`), con el comentario de RNF-22: «NUNCA se inventan direcciones» (`:76-78`).

#### Integridad y coherencia de la derivación

- `isDerivationConsistent(mnemonic, index, expectedAddress)` — `src/background/crypto/hd.ts:104-111` — contrasta la dirección persistida con la derivada. La usa la verificación de integridad cuando el operador lo pide, **no** el arranque (`src/background/crypto/hd.ts:99-103`).
- `inspectWalletIntegrity` **no deriva nada**: el informe declara `derivations: 0` de forma literal (`src/background/crypto/integrity.ts:64-65`, valor fijado en `:249`) y explica que la corrección silenciosa es lo que RNF-22 prohíbe (`:8-11`).
- Un hueco en `truekeate_accounts` (p. ej. `null` en medio) se considera cartera **dañada** y no se compacta: `readAddressList` conserva posiciones (`src/background/crypto/integrity.ts:107-110`) y el comentario `:98-105` documenta el defecto medido (revelar la clave de otra cuenta por desplazamiento de índices).

---

## EIP-1193

La interfaz, los eventos y los errores del provider siguen EIP-1193. El objeto se publica desde la capa inject y su superficie es `request` / `on` / `removeListener`.

### Interfaz `request({ method, params })`

#### Tipos

- `RequestArguments { method: string; params?: unknown[] | Record<string, unknown> }` — `src/shared/types.ts:139-142`.
- `Eip1193Provider { request; on; removeListener }` — `src/shared/types.ts:152-156`.
- `TruekeateProvider extends Eip1193Provider` con `isTrueKeate: true`, `chainId: ChainIdHex | null`, `selectedAddress: Address | null` — `src/shared/types.ts:159-163`.
- `Eip1193Error { code: number; message: string; data?: unknown }` — `src/shared/types.ts:145-149`, con la nota de que todo error que ve el usuario lleva `code` numérico.

#### Implementación (`src/inject/provider.ts`)

- Fábrica `createTruekeateProvider(relay?)` — `src/inject/provider.ts:228`, que devuelve `{ provider, emit }` (`:353`).
- `request(args)` — `src/inject/provider.ts:241-265`. Orden de guardas documentado en `:238-240`: forma del argumento → catálogo cerrado local → puente disponible → transporte.
- Lee `method` sin lanzar nunca (`readMethod`, `:202-206`) y normaliza `params` a lista (`readParams`, `:209-218`; un objeto de `params` se envuelve en lista de un elemento).
- Catálogo **cerrado** de 16 métodos: `PAGE_METHODS` — `src/inject/provider.ts:97-114`; fuera de él responde `4200` sin viaje de ida y vuelta (`:243-246`). `eth_sign` no figura a propósito (`:94-96`).
- Sin puente (`relay.attached === false`) responde `4200` de inmediato en lugar de colgar la promesa (`:247-250`).
- El puente nunca rechaza: `relay.send(...).then(...)` traduce `{ error }` a rechazo y cualquier rechazo del puente a `internalTransportError()` (`:252-264`).
- Publicación no manipulable: `Object.defineProperty` con `writable: false, configurable: false` en el alias y en la clave — `src/inject/index.ts:213-220`, con `PROVIDER_WINDOW_KEY = 'truekeate'` y `PROVIDER_WINDOW_ALIAS = 'codecrypto'` (`src/shared/constants.ts:216-217`).
- Red de seguridad de tiempo: `PAGE_REQUEST_TIMEOUT_MS = SIGN_TIMEOUT_MS + TIMEOUT_SAFETY_MARGIN_MS` (`src/inject/index.ts:59`) y resolución con error `4001` tipado si no llega respuesta (`:158-160`, literal en `pageTimeoutError`, `src/inject/provider.ts:73-76`).

### Catálogo de eventos `PROVIDER_EVENTS` (5 nombres) y su propagación

- `PROVIDER_EVENTS` — `src/shared/constants.ts:229-235`: `accountsChanged`, `chainChanged`, `connect`, `disconnect`, `message`.
- Tipo espejo: `ProviderEventName` — `src/shared/types.ts:124-129`.
- `isProviderEvent` valida contra el catálogo — `src/inject/provider.ts:130-131`; `on` ignora eventos fuera del catálogo sin romper la página (`:267-276`); `removeListener` (`:278-284`).
- Cachés del provider: `observe` refresca `provider.chainId` en `chainChanged`/`connect` y `provider.selectedAddress` en `accountsChanged`, y limpia ambas en `disconnect` (`src/inject/provider.ts:292-316`); `observeResponse` hace lo mismo con el resultado de `eth_chainId`/`eth_accounts`/`eth_requestAccounts` (`:323-331`); `emit` refresca primero y luego avisa a las escuchas con copia de la lista y `try/catch` por escucha (`:334-351`).

### Códigos de error EIP-1193 reales

Extraídos de `src/background/rpc/errors.ts` (fuente única de literales: `diccionario_datos.md` §4.3). Son **8 códigos** con **25 filas** en el núcleo (`ERROR_CATALOG`, `:41-203`) más bloques añadidos que reutilizan códigos:

| Código | Causas registradas (`cause`) | Líneas |
|---|---|---|
| `4001` | `userRejected`, `timeout`, `approvalWindowClosed`, `tooManyPendingRequests`, `rateLimitExceeded`, `hostPermissionDenied` | `errors.ts:43,49,56,63,70,77` |
| `4100` | `unauthorizedOrigin` | `errors.ts:84` |
| `4200` | `unsupportedMethod`, `methodNotAllowedInContext` | `errors.ts:90,96` |
| `4900` | `rpcUnavailable` | `errors.ts:102` |
| `4901` | `chainNotRegistered`, `chainIdMismatch` | `errors.ts:108,325` |
| `-32602` | `invalidMnemonic`, `invalidPrivateKey`, `invalidAddress`, `duplicateAccount`, `payloadTooLarge`, `unknownAccount`, `invalidAmount`, `invalidLabel`, `invalidRpcUrl`, `invalidNetworkDefinition` | `errors.ts:114,120,127,134,140,232,238,244,311,318` |
| `-32000` | `insufficientFunds`, `invalidNonce`, `estimateGasFailed`, `accountInUseByDapp`, `resetBlocked`, `walletNotCreated`, `inflightTxInProgress`, `broadcastRejected` | `errors.ts:146,152,158,164,171,226,281,288` |
| `-32603` | `internalError`, `duplicateApprovalId`, `storageQuotaExceeded`, `broadcastInterrupted`, `damagedWallet`, `clipboardFailure`, `migrationWriteFailed` | `errors.ts:179,185,191,197,219,250,258` |

Notas verificadas:

- `ERROR_CODES` es la lista de códigos únicos en orden de aparición — `src/background/rpc/errors.ts:378`.
- `ERROR_BY_CODE` indexa `code → filas` — `src/background/rpc/errors.ts:381-389`.
- `createEip1193Error(cause, args, data)` construye el objeto y solo añade `data` si se aporta — `src/background/rpc/errors.ts:434-462`.
- `isEip1193Error` exige `code` numérico y `message` de tipo cadena — `src/background/rpc/errors.ts:484-490`.
- La capa inject transcribe tres literales por no importar módulos del Service Worker: `4200` (`src/inject/provider.ts:59-62`), `4001` de vencimiento (`:73-76`) y `-32603` de transporte (`:83-86`).
- El cliente RPC reconoce los rechazos del nodo por rango JSON-RPC de servidor `-32000 … -32099` / implementación `-32768 … -32000` y excluye a propósito los códigos propios `4001, 4100, 4200, 4900, 4901` — `src/background/rpc/client.ts:109-115`.

### Propagación de eventos del Service Worker a las pestañas

- Sobre `TRUEKEATE_EVENT { type, eventName, data }` — `src/background/events.ts:28-33`.
- `emitProviderEvent` recorre todas las pestañas (o las indicadas) y devuelve cuántas lo recibieron — `src/background/events.ts:134-154`.
- Helpers tipados: `emitAccountsChanged` (`:157-158`), `emitConnect` con `{ chainId }` (`:164-165`), `emitDisconnect` (`:168-171`), `emitChainChanged` con el `ChainIdHex` **sin envoltorio** (`:185-188`) y `emitMessage` (no emitido hoy, `:194-195`).
- `sendEventToTab` usa `sendMessage` con `{ frameId }` solo cuando el frame no es 0 — `src/background/events.ts:106-127`.
- Recepción en la página: `installProvider` escucha `message` y emite el evento si el nombre pertenece al catálogo — `src/inject/index.ts:201-208`.

---

## EIP-6963

El anuncio multi-provider se implementa en `src/inject/eip6963.ts` (módulo M36) y se instala desde `src/inject/index.ts:225-232`.

### Eventos y forma del `detail`

#### Literales de los dos eventos

- `EIP6963_REQUEST_EVENT = 'eip6963:requestProvider'` — `src/inject/eip6963.ts:33`.
- `EIP6963_ANNOUNCE_EVENT = 'eip6963:announceProvider'` — `src/inject/eip6963.ts:34`.

#### Forma del `detail`

- Tipo declarado: `Eip6963ProviderDetail { info: Eip6963ProviderInfo; provider: TruekeateProvider }` — `src/shared/types.ts:174-177`.
- `Eip6963ProviderInfo { uuid, name, icon, rdns }` — `src/shared/types.ts:166-171`.
- Construcción del anuncio: `const detail: Eip6963ProviderDetail = { info: providerInfo(cachedIcon), provider: publishedProvider(provider) }` — `src/inject/eip6963.ts:75-78`, con el comentario de que el `detail` es NUEVO en cada anuncio (`:74`).
- `providerInfo(icon)` — `src/inject/provider.ts:138-143` — compone `{ uuid: PROVIDER_UUID, name: PROVIDER_NAME, icon, rdns: PROVIDER_RDNS }`.
- `publishedProvider` exige que `detail.provider` sea **el mismo objeto** que `window.truekeate`: se busca `PROVIDER_WINDOW_KEY` y se comprueba que tenga `request` y `on` antes de aceptarlo — `src/inject/eip6963.ts:51-60`.
- Emisión: `window.dispatchEvent(new CustomEvent<Eip6963ProviderDetail>(EIP6963_ANNOUNCE_EVENT, { detail }))` dentro de `try/catch` — `src/inject/eip6963.ts:80-85`.

#### Literales de identidad

- `PROVIDER_NAME = 'TrueKeate'` — `src/shared/constants.ts:204`; se aclara que **no** es `manifest.name` (`:203`).
- `PROVIDER_RDNS = 'academy.codecrypto.truekeate'` — `src/shared/constants.ts:207`.
- `PROVIDER_UUID = '9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90'` — `src/shared/constants.ts:213`, literal congelado que «nunca se regenera por carga» (`:210-212`).
- `providerIdentity` reexporta `{ name: 'TrueKeate', rdns, uuid }` para pruebas y `test.html` — `src/inject/eip6963.ts:112-116` (aquí el `name` va como literal local, no importado).

#### Icono

- `PROVIDER_ICON_DATA_URI` se importa de `src/inject/icon-data.ts` — `src/inject/eip6963.ts:29`.
- `loadProviderIcon()` devuelve el data-URI cacheado de forma síncrona — `src/inject/eip6963.ts:40-43`.
- `PROVIDER_ICON_PATH = 'brand/truekeate-mark-96.png'` — `src/inject/eip6963.ts:37`, solo informativa.
- El icono va incrustado en el bundle en tiempo de compilación (`src/inject/eip6963.ts:20-24`), de modo que el anuncio no depende de la red.

### Ciclo de anuncio: listener síncrono, auto-anuncio y re-anuncio en `DOMContentLoaded`

`installEip6963Announce(provider, onAnnounce?)` — `src/inject/eip6963.ts:69-109`:

1. **Listener síncrono** de `eip6963:requestProvider`, registrado dentro del IIFE y sin `await` previo — `src/inject/eip6963.ts:89-92`. Si se registra tarde, el anuncio se pierde (`:10-12`).
2. **Auto-anuncio** al cargar `inject.js` — `src/inject/eip6963.ts:94-95`.
3. **Re-anuncio** en `DOMContentLoaded`: si `document.readyState === 'loading'` se añade el listener con `{ once: true }` (`:98-105`); si el documento ya cargó, se anuncia con `queueMicrotask(announce)` (`:106-108`). El motivo declarado es atender a las dApp que registran su listener más tarde (`:15`).

Aviso opcional al puente: `onAnnounce?.(detail)` — `src/inject/eip6963.ts:86` —, que `inject/index.ts:225-232` usa para enviar `TRUEKEATE_ANNOUNCE { type, info }` al content script. La nota de contrato de `src/inject/index.ts:70-79` explica la desviación declarada: el `detail` completo no se puede clonar por `postMessage` (contiene funciones), así que por el puente viajan solo los 4 campos clonables de `info` y el `detail` íntegro se entrega por `CustomEvent`.

---

## EIP-712

La firma de datos tipados (`eth_signTypedData_v4`) se implementa en `src/background/crypto/sign.ts`, se previsualiza en `src/notification/TypedDataPanel.tsx` y se verifica on-chain con `contracts/src/EIP712Verifier.sol`.

### Firma en la cartera (`src/background/crypto/sign.ts`)

#### Entrada, tipos y resultado

- `TypedDataTypes` — `src/background/crypto/sign.ts:498` (`Record<string, Array<Pick<TypedDataField,'name'|'type'>>>`).
- `TypedDataSigningInput { from, domain, types, message, primaryType? }` — `src/background/crypto/sign.ts:501-508`.
- `TypedDataSignature { signature, from, digest, primaryType, types, domain }` — `src/background/crypto/sign.ts:511-522`.

#### Reglas aplicadas

- `stripEip712Domain(types)` elimina `EIP712Domain` de `types` — `src/background/crypto/sign.ts:528-539`; el motivo está documentado en `:524-527`: el dominio no es un tipo firmable y ethers lo rechaza si se cuela. El literal del nombre está en `src/background/approvals/calldata.ts:50` (`EIP712_DOMAIN_TYPE = 'EIP712Domain'`).
- `inferPrimaryType(types)` — `src/background/crypto/sign.ts:546-562`: la raíz es el tipo que no aparece como campo de ningún otro; si todos aparecen, cae al primer tipo declarado; lista vacía devuelve `null`.
- `resolvePrimaryType(types, requested)` — `src/background/crypto/sign.ts:565-575`: usa el declarado si existe en `types` y, si no, el inferido; sin tipos lanza `internalError({ reason: 'invalid-typed-data' })` (`:572`).
- `signTypedData(input, deps)` — `src/background/crypto/sign.ts:582-609`: limpia tipos, resuelve `primaryType`, obtiene la cartera de firma y ejecuta `TypedDataEncoder.hash(domain, cleanTypes, message)` (`:592`) y `wallet.signTypedData(domain, cleanTypes, message)` (`:593`). Si ethers no puede hashear, el error es `internalError({ reason: 'unhashable-typed-data' })` (`:596-599`): «firma bloqueada, nunca a medias» (`:595`).
- Recuperación y digest expuestos: `recoverTypedDataSigner` (`:619-628`), con la nota de que ethers v6 no expone `TypedDataEncoder.recover` y la recuperación se hace con `recoverAddress` sobre el digest canónico (`:616-617`); `typedDataDigest` (`:631-635`).

#### `domain`, `types`, `message` y el `chainId` dentro del domain

- El `domain` llega tal cual de la dApp y se firma dentro del `digest` (no se reescribe): se devuelve sin cambios en `TypedDataSignature.domain` (`src/background/crypto/sign.ts:607`).
- El `chainId` del domain forma parte del `domainSeparator` que ethers calcula; su presencia se controla con `parseChainIdOrNull` (`src/background/crypto/sign.ts:103-117`) y `toChainIdNumber` (`:131-132`), que distingue «no declarado» de «declarado e ininterpretable» (`:98-102`).
- La vista previa calcula `domainChainMismatch` comparando el `chainId` declarado con el activo y **falla seguro** ante un valor ilegible: `src/background/approvals/preview.ts:429-441`, con el defecto medido documentado en `:429-435`.
- `verifyingContractMismatch` se define como «dirección cero» **o** «`eth_getCode` devuelve `0x`» — `src/background/approvals/preview.ts:375-387` —, sin comparar con nada declarado por la dApp (`:371-373`).
- Redacción en reposo: por encima de `PREVIEW_INLINE_MAX_BYTES` el `message` se guarda como `null` conservando `messageHash` y `messageBytes` — `src/background/approvals/preview.ts:454-457` y `:474`.

### Panel de confirmación (`src/notification/TypedDataPanel.tsx`)

- Muestra siempre `domain.name` (`:130-132`), el `chainId` del dominio junto al de la red activa (`:133-139`), el `verifyingContract` **en claro** (`:140-153`, con el motivo en `:142-147`) y el `primaryType` (`:154-157`).
- Aviso destacado si `domainChainMismatch` (`:160-164`, literal en `:24-25`) y aviso de peligro si `verifyingContractMismatch` (`:166-170`, literal en `:28-29`).
- Lista los campos que se firman a partir de `preview.types` (`:118-120` y `:174-188`) y el contenido del mensaje (`:190-215`); si el mensaje llegó redactado, pinta el resumen `messageHash`/`messageBytes` (`:49-65` y `:195-207`).

### Contrato verificador y correspondencia wallet ↔ contrato

#### `contracts/src/EIP712Verifier.sol`

- Contrato **sin estado**, declarado como instrumento de prueba (RT-11, P-07): `contracts/src/EIP712Verifier.sol:4-7`.
- Nota de mutabilidad documentada: `verify` es `view` (no `pure`) porque `ecrecover` exige lectura de entorno — `contracts/src/EIP712Verifier.sol:17-23` y `:39-42`.
- `DOMAIN_TYPEHASH` = `0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f` — `contracts/src/EIP712Verifier.sol:27-28`.
- `verify(address signer, bytes32 digest, bytes calldata signature)` — `contracts/src/EIP712Verifier.sol:39-45`: devuelve `recover(digest, signature) == signer && signer != address(0)`.
- `domainSeparator` con los cuatro campos y su sobrecarga con el struct `EIP712Domain` — `contracts/src/EIP712Verifier.sol:51-73`; el struct se declara al final del fichero (`:154-160`).
- `hashTypedData(separator, structHash)` = `keccak256(0x1901 ‖ separator ‖ structHash)` — `contracts/src/EIP712Verifier.sol:76-78`.
- `verifyTypedData(signer, separator, structHash, signature)` — `contracts/src/EIP712Verifier.sol:85-93`.
- `recover` replica las comprobaciones de `ECDSA.recover`: longitud 65 (`:102-104`), `s` en la mitad baja y `v ∈ {27,28}` (`:116-119`), `r`/`s` no nulos (`:120-122`) y dirección recuperada distinta de cero (`:124-129`). **Nunca revierte** ante firma inválida (`:15`).

#### Correspondencia con la firma de la cartera

- El `digest` que devuelve `signTypedData` (`src/background/crypto/sign.ts:592`) es literalmente lo que consume `EIP712Verifier.verify(signer, digest, signature)`: la relación se declara en `src/background/crypto/sign.ts:20-21` y `:512-513`.
- `contracts/test/EIP712Verifier.t.sol` verifica las dos rutas: con el `digest` guardado y con el `digest` recompuesto on-chain desde el dominio y el struct (`contracts/test/EIP712Verifier.t.sol:107-116`), además de `verifyTypedData` (`:119-130`).
- El `domainSeparator` se recalcula on-chain y se compara con el fixture en `setUp` — `contracts/test/EIP712Verifier.t.sol:71-78`.
- El test exige el dominio de la dApp de pruebas `TrueKeate Test App` y `chainId 31337` — `contracts/test/EIP712Verifier.t.sol:100-101` y `:305-306`.
- La firma **de la wallet** se verifica on-chain en `test_WalletSignatureVerifiesOnChain` — `contracts/test/EIP712Verifier.t.sol:275-316` — con firmante `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (cuenta #1 de Anvil, `:307`).
- Un solo byte alterado (contenido, `nonce`, `deadline` o bit del digest) devuelve `false` — `contracts/test/EIP712Verifier.t.sol:321-376`.
- Otro firmante u otro dominio (chainId o verifyingContract) devuelve `false` — `contracts/test/EIP712Verifier.t.sol:379-402`.

#### Fixtures versionados

- `contracts/test/fixtures/eip712-signature.json` **existe** (51 líneas). Contiene `domain` (`:4-9`), `types` con `SignMessage` (`:10-25`), `primaryType` (`:26`), `message` (`:27-31`), los `typeHashes` (`:36-39`), los hashes intermedios (`:40-44`), el `digest` (`:45-46`), el `signer` (`:47`) y la `signature` (`:48`) con el formato `r ‖ s ‖ v` (`:49`) y la clave de prueba anotada en `:3`.
- `contracts/test/fixtures/eip712-wallet-signature.json` **existe** y lo produce la propia wallet, no `cast` (`contracts/test/EIP712Verifier.t.sol:226-233`); se carga en el test con `WALLET_FIXTURE_PATH` (`:250-269`).
- El script de generación está en `contracts/scripts/generar-fixture-wallet.mjs` (existencia confirmada; su contenido no se ha leído en este manual — **pendiente de confirmar** en detalle).

---

## EIP-1559

### Transacción tipo 2 y política de comisiones

#### Tipo 2 como única vía de `eth_sendTransaction`

- `TX_TYPE_EIP1559 = 2` — `src/shared/constants.ts:292`, con el comentario de que es el tipo que produce **siempre** `eth_sendTransaction`.
- `EIP1559_TX_TYPE = TX_TYPE_EIP1559` — `src/background/crypto/sign.ts:60`.
- `buildType2Transaction` fija `type: TX_TYPE_EIP1559` — `src/background/crypto/sign.ts:392` —, y `signTransaction` añade una defensa en profundidad: si el tipo observado en la transacción serializada no es 2, lanza `internalError({ reason: 'unexpected-tx-type' })` — `src/background/crypto/sign.ts:443-446`.
- La vista previa declara `txType: TX_TYPE_EIP1559` — `src/background/approvals/preview.ts:330` — y el tipo del contrato interno lo fija en el literal `2` (`src/shared/types.ts:210`: `txType: 2`).
- La comprobación de los tests confirma `parseada.type === 2` y `firmada.txType === EIP1559_TX_TYPE` — `src/background/crypto/sign.spec.ts:63-68`.

#### `maxFeePerGas` y `maxPriorityFeePerGas`

- `resolveEip1559Fees(feeData)` — `src/background/crypto/sign.ts:185-205` — garantiza el invariante **ambas > 0**:
  1. `maxPriorityFeePerGas`: el del nodo si es > 0; si no, el mínimo del proyecto acotado por el `gasPrice` (nunca por encima de él) y, sin `gasPrice`, el mínimo — `src/background/crypto/sign.ts:190-192`.
  2. `maxFeePerGas`: el del nodo si es > 0; si no, `2 × base`, donde `base` es el `gasPrice` del nodo o el mínimo del proyecto — `:193`. Si queda por debajo de la prioridad, se iguala (`:194-196`).
- Trazabilidad de la procedencia: `source: { maxFeePerGas: 'node'|'derived', maxPriorityFeePerGas: ... }` — `src/background/crypto/sign.ts:171-172` y `:200-203`.
- Los valores se escriben en la transacción tipo 2 — `src/background/crypto/sign.ts:394-395` — y se devuelven como cadena en `SignedTransaction` (`:450-451`).
- Los tests fijan el comportamiento de respaldo: con `maxFeePerGas: 0` y `maxPriorityFeePerGas: 0` y `gasPrice: 5n` el resultado es prioridad 5 y máximo 10 (`src/background/crypto/eip1559.spec.ts:55-65`); sin ninguna comisión se usan los mínimos del proyecto y el máximo derivado es `2 × GWEI` (`:68-78`); y `maxFeePerGas` nunca queda por debajo de la prioridad (`:80-89`).

#### Mínimos de 1 gwei

- `MIN_MAX_PRIORITY_FEE_PER_GAS = 1_000_000_000n` — `src/shared/constants.ts:304`, con el motivo documentado en `:300-303` («una transacción con prioridad 0 no es aceptada por la red y la deja inválida»).
- `MIN_MAX_FEE_PER_GAS = 1_000_000_000n` — `src/shared/constants.ts:307`.
- Consumo en la derivación: `src/background/crypto/sign.ts:190` (base), `:192` (prioridad mínima) y `:193` (`base * 2n`).
- Los tests comprueban que ambos mínimos valen `GWEI` y de dónde salen los valores derivados — `src/background/crypto/eip1559.spec.ts:71-77`.

#### De dónde salen las comisiones: `getFeeData()` y `eth_feeHistory`

- `readEip1559Fees(deps)` — `src/background/rpc/txContract.ts:332-342` — llama a `resolveDeps(deps).feeData()` y, si esa llamada falla, pasa `null` a `resolveEip1559Fees` para que M11 derive los mínimos válidos (`:337-341`).
- El `feeData` real de producción es `getRpcProvider().provider.getFeeData()` — `src/background/rpc/txContract.ts:91` —, es decir, el proveedor ÚNICO de `src/background/rpc/client.ts`.
- `eth_feeHistory` existe como método de página y se reenvía al nodo tal cual: `handleFeeHistory` — `src/background/rpc/pageMethods.ts:194-196` — y su entrada en el catálogo de lectura `PAGE_READ_METHODS` (`src/background/rpc/catalog.ts:154`) y en `PAGE_METHODS` del provider (`src/inject/provider.ts:105`). Su resultado no alimenta hoy la firma: la firma usa `getFeeData()`. **Pendiente de confirmar** si algún flujo de la UI consume `eth_feeHistory` para mostrar comisiones.

#### Nonce definitivo

- `readPendingNonce(address, deps)` — `src/background/rpc/txContract.ts:344-348` — delega en `transactionCount(address)`.
- La implementación de producción es `getRpcProvider().provider.getTransactionCount(address, 'pending')` — `src/background/rpc/txContract.ts:92-95`.
- El nonce se **recalcula al aprobar**, no al encolar: `executeTransaction` llama a `deps.readNonce(account)` antes de firmar — `src/background/approvals/dispatch.ts:505` — y pasa ese valor a `signTransaction` (`:519-533`). El comentario de cabecera lo explica como H-10 (`src/background/approvals/dispatch.ts:32`).
- En la vista previa el nonce es solo informativo: `nonceInformativo` (`src/background/approvals/preview.ts:307-308`) y el comentario del tipo (`src/shared/types.ts:208`).
- Además hay una marca de «transacción en vuelo» (`phase: 'signing'`) que bloquea una segunda firma de la misma cuenta — `src/background/approvals/dispatch.ts:508-516` — con la causa `-32000 inflightTxInProgress` (`src/background/rpc/errors.ts:281-286`).
- Seguimiento posterior: `eth_getTransactionReceipt` con `TX_RECEIPT_POLL_MS = 1_000`, `TX_RECEIPT_TIMEOUT_MS = 120_000` y `TX_RECEIPT_MAX_POLLS = 120` (`src/shared/constants.ts:314,317,320`), usado por `followTransaction` (`src/background/rpc/txContract.ts:524-582`).

---

## EIP-155 (legado)

### Firma legada con el `chainId` dentro de la firma

#### Protección de replay con `v = chainId*2 + 35/36`

- Fórmula expuesta y verificable: `eip155V(chainId, yParity) = chainId * 2 + 35 + (yParity === 1 ? 1 : 0)` — `src/background/crypto/sign.ts:147-148`, con el comentario de que con `chainId = 31337` el `v` solo puede ser `62709` o `62710` (`:142-145`).
- `TX_TYPE_LEGACY = 0` — `src/shared/constants.ts:298` — y `LEGACY_TX_TYPE = TX_TYPE_LEGACY` (`src/background/crypto/sign.ts:63`).
- `signLegacyTransaction(input, deps)` — `src/background/crypto/sign.ts:463-491`:
  - exige red activa coincidente con `assertActiveChain` (`:467`);
  - exige `gasPrice > 0` y, si falta, lanza `internalError({ reason: 'missing-gas-price' })` (`:468-471`); el comentario `:459-461` explica que sin `chainId` ethers firmaría una transacción PRE-EIP-155 replicable en otra red, y eso está prohibido;
  - firma con `type: TX_TYPE_LEGACY`, `chainId` y `gasPrice` (`:474-480`);
  - fija el `v` al valor de EIP-155: `v: described.v >= 35 ? described.v : expectedV` (`:486`), con `expectedV = eip155V(described.chainId, described.yParity)` (`:482`). El comentario es literal: «El `v` de una transacción EIP-155 es exactamente `chainId * 2 + 35/36`» (`:485`).

#### Confirmación en el spec real

`src/background/crypto/eip155.spec.ts` (146 líneas) comprueba:

- la fórmula con varios `chainId`: `eip155V(1,0)=37`, `(1,1)=38`, `(5,0)=45`, `(5,1)=46`, `(31337,0)=62709`, `(31337,1)=62710` — `:60-65` — y que la diferencia entre paridades es siempre 1 (`:67`);
- que el `v` de EIP-155 nunca cae en el rango pre-EIP-155 27/28: `:70-75`;
- que la transacción firmada no empieza por `0x02`, tiene `type === 0`, `chainId === 31337n` y `v === eip155V(31337, yParity)` — `:79-92`;
- que el `hash` es `keccak256(rawTransaction)` — `:90`;
- que el `unsignedHash` **depende del `chainId`** y que la firma solo se recupera con el de su red — `:94-108` (usa `Signature.from` y `recoverAddress`, `:96-107`);
- que el mismo payload en dos redes produce `rawTransaction` y `hash` distintos, con `delta de v = 2·ΔchainId + Δparidad` — `:110-125`;
- que un `chainId` ajeno al activo se rechaza con `4901` y `data.reason = 'chain-id-mismatch'` — `:127-134`;
- que la transacción legada conserva `gasPrice` y **no inventa** comisiones EIP-1559 (`maxFeePerGas` y `maxPriorityFeePerGas` son `null` en ethers) — `:136-145`.

---

## personal_sign

### Firma de mensaje con prefijo EIP-191

#### Construcción del payload y prefijo EIP-191

- `PersonalSignInput { from, message }` — `src/background/crypto/sign.ts:641-646`.
- `PersonalSignPayload { bytes, prefix, prefixed, hash }` — `src/background/crypto/sign.ts:648-658`.
- `buildPersonalSignPayload(message)` — `src/background/crypto/sign.ts:670-683`:
  - interpretación del parámetro igual que MetaMask: cadena hexadecimal → **bytes** (`getBytes`, `:674`); cadena no hexadecimal → **UTF-8** (`toUtf8Bytes`, `:675`); `Uint8Array` → tal cual (`:676`), tal y como documenta `:665-668`;
  - prefijo literal: `` const prefix = `\x19Ethereum Signed Message:\n${bytes.length}` `` — `src/background/crypto/sign.ts:677`;
  - concatenación prefijo + mensaje en un `Uint8Array` — `:678-681`;
  - hash: `hashMessage(bytes)` — `:682` —, que es `keccak256` del mensaje con el prefijo EIP-191.
- El prefijo se expone aparte de la firma precisamente para poder comprobarlo byte a byte sin clave (`src/background/crypto/sign.ts:22-24` y `:660-664`).

#### Firma y recuperación

- `signPersonalMessage(input, deps)` — `src/background/crypto/sign.ts:702-716`: construye el payload, resuelve la cartera de firma y ejecuta `wallet.signMessage(payload.bytes)` (`:708`), devolviendo `signature`, `from`, `messageHash`, `prefix` y `byteLength` (`:709-715`).
- `PersonalSignature` — `src/background/crypto/sign.ts:686-695`.
- Comprobación del prefijo y del hash en los tests: `personalSign.spec.ts:27` (bytes = `toUtf8Bytes('hola')`), `:32` (prefijo + mensaje), `:40-42` (`payload.hash === hashMessage(...) === keccak256(prefixed)` y **distinto** de `keccak256(mensaje)`), `:73` (prefijo con longitud 0), `:96-98` (recuperación con `recoverAddress` y verificación con `verifyMessage`, tanto en hexadecimal como en texto).
- El `prefix` también se devuelve al llamador para trazabilidad de la regla (`src/background/crypto/sign.ts:692-693`).

#### Panel de confirmación (`src/notification/PersonalSignPanel.tsx`)

- El texto se muestra como UTF-8 legible y completo (`src/notification/PersonalSignPanel.tsx:47-61`), con el aviso de que la firma no mueve fondos pero puede autorizar acciones (`:49-52`).
- Si el texto quedó truncado en reposo, se avisa con `TRUNCATED_PAYLOAD_NOTICE` (`:28-29` y `:53-57`).
- Si el payload hexadecimal **no** es legible, se muestra `ILLEGIBLE_PAYLOAD_NOTICE` (`:22` y `:64-66`) con la longitud en bytes y el contenido truncado con `shortHex` (`:67-78`); los bytes solo se pintan en la UI y nunca se copian a los logs (`:12-13`).
- La decisión «legible o no» se toma en el Service Worker: `buildPersonalSignPreview` (`src/background/approvals/preview.ts:591-627`) usa `decodeUtf8Strict` (`:512-518`) y `isReadableText` (`:521-533`), y marca `isHexPayload: true` cuando la entrada era hexadecimal y no legible (`:606-615`).

---

## Estándares presentes pero NO implementados

Tabla construida a partir de búsquedas reales en el repositorio. «No aparece» significa: búsqueda global en `src/` y `contracts/src`/`contracts/test` sin coincidencias; se indica el término buscado.

| Estándar / capacidad | Estado | Evidencia / término buscado |
|---|---|---|
| **EIP-2930 (listas de acceso, tipo 1)** | NO implementado | No aparece `accessList`, `EIP-2930` ni `type: 1` en `src/`. La única vía de `eth_sendTransaction` es tipo 2 (`src/shared/constants.ts:292`, `src/background/crypto/sign.ts:392`). La firma legada usa `type: 0`. |
| **EIP-4844 (blobs, tipo 3)** | NO implementado | No aparece `EIP-4844`, `blob`, `blobVersionedHashes` ni `type: 3` en `src/`. |
| **EIP-1271 (firma de contratos)** | NO implementado | No aparece `1271` en `src/` ni en `contracts/`. El único verificador es `EIP712Verifier`, que recupera con `ecrecover` y compara con una EOA (`contracts/src/EIP712Verifier.sol:39-45`). |
| **JSON-RPC batching** | NO implementado | No hay proveedor *batch* ni envío de arrays de peticiones: `rpcSend` envía un método y sus parámetros (`src/background/rpc/client.ts:276-311`) y el provider responde con una única promesa (`src/inject/provider.ts:241-265`). |
| **WalletConnect** | NO implementado | No aparece `WalletConnect` ni `walletconnect` en `src/`. |
| **Cartera hardware (Ledger/Trezor)** | NO implementado | No aparece `Ledger`, `Trezor` ni `hardware` en `src/`. La firma se resuelve con claves derivadas de la frase o importadas (`src/background/crypto/sign.ts:227-243`). |
| **`eth_sign`** | Retirado a propósito | No está en la unión de métodos ni en el catálogo: responde `4200`. Evidencia: `src/shared/types.ts:115-117`, `src/inject/provider.ts:94-96`, `src/background/rpc/catalog.ts:17` y el guardián `catalog.ts:506-508`. |
| **EIP-1102 (`eth_requestAccounts` como método de exposición)** | Presente | `eth_requestAccounts` sí figura en `PAGE_READ_METHODS` (`src/background/rpc/catalog.ts:147`) y en `PAGE_METHODS` (`src/inject/provider.ts:98`). |
| **EIP-3085 (`wallet_addEthereumChain`)** | Presente | Figura en `PAGE_APPROVAL_METHODS` (`src/background/rpc/catalog.ts:165`) y en `PAGE_METHODS` (`src/inject/provider.ts:112`), con validación propia (`invalidNetworkDefinition`, `src/background/rpc/errors.ts:318-323`). |
| **EIP-6963** | Presente | `src/inject/eip6963.ts` completo (ver la sección EIP-6963). |
| **EIP-191 (`personal_sign`)** | Presente | `src/background/crypto/sign.ts:670-716`. |
| **EIP-55 (checksum de direcciones)** | Presente | `getAddress` en `src/background/crypto/integrity.ts:84`, `preview.ts:136`, `calldata.ts:280`. |
| **EIP-2612 (`permit`) como firma de la cartera** | Parcial: solo decodificación | `permit` está en la tabla local de selectores (`src/background/approvals/calldata.ts:179-191`) y dispara aviso (`:357-359`), pero no hay flujo de firma EIP-2612 propio; la firma se haría por `eth_signTypedData_v4`. |
| **`formatEther` / `parseEther` de ethers** | No usados | Sin coincidencias de `formatEther`/`parseEther` en `src/`; el formateo es propio (`src/shared/format.ts:43`). |
| **Otros nodos/redes remotas** | Fuera de alcance por diseño | La URL por defecto es `http://127.0.0.1:8545` (`src/shared/constants.ts:29`) y el catálogo dice que solo existe Anvil (`src/background/rpc/client.ts:190-192`). |

### Lo que queda pendiente de confirmar

- Si existen dependencias adicionales con contenido Web3 en el árbol de `node_modules` que no se importen (no se inspeccionan artefactos instalados en este manual).
- Si algún fichero de `e2e/` o `test/` ejercita estándares no cubiertos aquí: esos directorios no se han revisado en esta pasada y quedan **pendientes de confirmar**.
- La versión exacta de ethers instalada (solo se ha verificado el rango de `package.json:20`).
- El contenido detallado de `contracts/scripts/generar-fixture-wallet.mjs` y del fixture `contracts/test/fixtures/eip712-wallet-signature.json` (su existencia y su uso en los tests sí están verificados).
