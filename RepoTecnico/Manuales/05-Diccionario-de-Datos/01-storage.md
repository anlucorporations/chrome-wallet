# 01 — Diccionario de almacenamiento (chrome.storage.local)

> **Propósito.** Inventariar, clave por clave, todo lo que TrueKeate Wallet persiste en `chrome.storage.local`: el tipo TypeScript real de cada valor, sus campos, quién lo escribe y quién lo lee, cuándo se crea y se borra, si sobrevive al reset de la cartera y a la suspensión del Service Worker (SW), y los invariantes que el código hace cumplir. Fuentes primarias: `src/background/state/schema.ts` (M33), `src/background/state/migrations.ts` (M34), los módulos que escriben cada clave y `RepoTecnico/diccionario_datos.md` §2 (especificación normativa). Todas las rutas son relativas a la raíz del repositorio.

## Visión general

### Un único almacén persistente

`chrome.storage.local` es el **único** almacén persistente del producto. El módulo `src/background/state/schema.ts` es su **fuente única**: ningún otro fichero escribe una cadena `truekeate_` a mano (`src/background/state/schema.ts:5-6`). Las prohibiciones que ese módulo hace cumplir están declaradas en su cabecera (`src/background/state/schema.ts:8-12`):

- nombres cortos tipo `settings.*` usados como si fueran almacenes;
- el prefijo heredado del intento previo (`codecrypto_*`, DEC-09), que no es válido;
- **`chrome.storage.sync`**, prohibido (evita replicar el mnemonic y las claves privadas a los servidores de la cuenta del navegador);
- el almacén volátil del documento (`localStorage`), que no existe en un Service Worker.

La superficie real que consume el dominio está tipada estructuralmente en `StorageLocalLike` (`src/background/state/schema.ts:302-306`), y el acceso pasa siempre por tres funciones: `readStorage` (`:338-353`), `writeStorage` (`:360-378`) y `removeStorage` (`:381-399`). Ninguna de las tres lanza: una lectura que falla degrada a instantánea vacía (`:349-352`) y una escritura que falla devuelve `false` tras **un** reintento (`:367-377`).

### Aislamiento con `setAccessLevel('TRUSTED_CONTEXTS')`

Lo primero que hace el arranque del SW es `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` (`src/background.ts:639-640`, invocando `applyStorageAccessLevel` de `src/background/security/accessLevel.ts:64-78`). El motivo es explícito en la cabecera del módulo: con el nivel por defecto un content script inyectado podría **leer** `truekeate_mnemonic` y las claves privadas del almacén; `TRUSTED_CONTEXTS` deja fuera de lectura a los content scripts y mantiene el acceso al SW y a las páginas de la extensión (`popup`, `connect`, `notification`) (`src/background/security/accessLevel.ts:3-9`). El literal exigido se declara como constante no configurable (`src/background/security/accessLevel.ts:15`). La llamada es idempotente y **no lanza**: si la API falta o falla, devuelve `false` y el arranque continúa (`:64-78`).

### Versión de esquema REAL

- **`SCHEMA_VERSION = '1.4'`** — declarado en `src/background/state/schema.ts:30` (constante `as const`).
- La versión **no** se persiste como clave propia: se declara **dentro** de `truekeate_settings`, en el campo `schemaVersion` (`src/background/settings.ts:51`, `src/background/settings.ts:73-76`; escrito por la migración en `src/background/state/migrations.ts:313`).
- `SCHEMA_VERSION_KEY = 'truekeate_schema_version'` (`src/background/state/schema.ts:37`) se conserva como constante **documental** y **no** forma parte de `STORAGE_KEYS` (comentario en `src/background/state/schema.ts:32-36`).
- Versiones soportadas por la migración: `['1.2', '1.3', '1.4']` (`src/background/state/migrations.ts:45`), con línea base v1.2 (`:48`).

### Tabla índice de las claves canónicas

Lista definitiva extraída de `STORAGE_KEYS` (`src/background/state/schema.ts:40-69`): **14 claves**. `CANONICAL_STORAGE_KEYS` es exactamente `Object.values(STORAGE_KEYS)` (`:74-75`).

| # | Clave | Tipo TypeScript | Escribe | Lee | Persistencia | Reset |
|---|---|---|---|---|---|---|
| 1 | `truekeate_mnemonic` | `string` | `accounts.ts` (`persistWalletFromMnemonic`) | `accounts.ts`, `background.ts` | Persistente | Se borra |
| 2 | `truekeate_accounts` | `Address[]` (`string[]`) | `accounts.ts` (alta y derivación) | `accounts.ts`, `background.ts` | Persistente | Se borra |
| 3 | `truekeate_imported_accounts` | `ImportedAccount[]` | `accounts.ts` | `accounts.ts`, `background.ts` | Persistente | Se borra |
| 4 | `truekeate_current_account` | `AccountRef` | `accounts.ts` | `accounts.ts`, `background.ts` | Persistente | Se borra |
| 5 | `truekeate_chain_id` | `ChainIdHex` | `networks/catalog.ts`, `networks/switch.ts`, `networks/addChain.ts`, `approvals/dispatch.ts` | `networks/catalog.ts`, `background.ts` | Persistente | Se borra |
| 6 | `truekeate_networks` | `Record<string, StoredNetwork>` | `networks/catalog.ts` | `networks/*`, ventana de red | Persistente | Se borra |
| 7 | `truekeate_connected_sites` | `Record<string, DappSession>` | `sessions.ts` | `sessions.ts`, `accounts.ts`, `connections.ts` | Persistente | Se borra |
| 8 | `truekeate_pending_requests` | `Record<Uuid, PendingRequest>` | `approvals/queue.ts`, `approvals/reconcile.ts` | `approvals/*`, `schema.ts` | Persistente | Se borra |
| 9 | `truekeate_connect_request` | `Record<string, ConnectRequest>` | `connections.ts` | `connections.ts` | Persistente | Se borra |
| 10 | `truekeate_approval_window` | `ApprovalWindow` | `approvals/focus.ts` | `approvals/focus.ts`, `reconcile.ts` | Persistente | Se borra |
| 11 | `truekeate_inflight_tx` | `Record<Address, InflightTx>` | `approvals/queue.ts`, `approvals/reconcile.ts` | `approvals/*`, `schema.ts` | Persistente | Se borra |
| 12 | `truekeate_rate_windows` | `Record<string, RateWindow>` | `rpc/rateLimit.ts`, `approvals/queue.ts` | `rpc/rateLimit.ts` | Persistente | Se borra |
| 13 | `truekeate_logs` | `LogEntry[]` | `logging/logger.ts` (**único**) | `logging/logger.ts`, panel (`wallet_getLogs`) | Persistente | **Se conserva** |
| 14 | `truekeate_settings` | `StoredSettings` | `settings.ts`, `accounts.ts` | `settings.ts`, `accounts.ts`, `background.ts` | Persistente | Se borra |

Ninguna clave canónica es efímera: **todas** viven en `chrome.storage.local` y por tanto sobreviven a la suspensión del SW. El estado que sí es volátil (cerrojos «por encadenamiento de promesas», `bootSnapshot`, `pendingConnects`) **no** se persiste y se reconstruye (`src/background.ts:197-209`, `src/background/approvals/queue.ts:90-97`, `src/background/sessions.ts:44-57`).

### Orden de arranque del SW y claves implicadas

Cada despertar del Service Worker recorre una secuencia fija (`bootstrap`, `src/background.ts:638-671`) que toca el almacén en un orden deliberado:

| Fase | Acción sobre el almacén | Claves implicadas | Cita |
|---|---|---|---|
| 1 | `setAccessLevel('TRUSTED_CONTEXTS')` | Ninguna (configura el acceso, no lee ni escribe datos) | `src/background.ts:639-640` |
| 1.b | `hydrateLogDiagnostics()` reconstruye el contador de descartes | `truekeate_logs_dropped` | `src/background.ts:641-643` |
| 2 | Migración de esquema v1.2 → v1.4 | Todas las canónicas + alias heredados y `truekeate_pending_request` (retirada) | `src/background.ts:644-645` |
| 3 | Siembra de la red por defecto (Anvil) | `truekeate_networks`, `truekeate_chain_id` | `src/background.ts:646-647` |
| 4 | Comprobación de integridad M13 (no escribe; puede marcar «dañada») | `truekeate_mnemonic`, `truekeate_accounts`, `truekeate_imported_accounts` | `src/background.ts:648-649` |
| 5 | Auto-carga en **una sola lectura** | `mnemonic`, `accounts`, `importedAccounts`, `currentAccount`, `chainId`, `networks`, `connectedSites`, `settings` | `src/background.ts:367-376` |
| 6 | Reconciliación: purga de cola, `4001` a huérfanas, rearme de alarmas, reconstrucción de marca en vuelo y ventanas de tasa, ventana única, traza | `pendingRequests`, `inflightTx`, `rateWindows`, `approvalWindow`, `logs` | `src/background/approvals/reconcile.ts:366-375` |
| 7 | **Una** entrada `sw_started` con `bytesInUse` | `logs` | `src/background.ts:669-670` |

Ninguna fase puede romper el arranque: la migración (`src/background.ts:307-314`), la siembra (`:410-416`), la integridad (`:321-333`), la auto-carga y la reconciliación (`:459-465`) degradan a un informe con aviso por consola y el SW sigue operativo.

### Claves con prefijo `truekeate_` fuera del catálogo canónico

El módulo declara dos claves con prefijo canónico que **no** entran en `STORAGE_KEYS`:

| Clave | Declaración | Naturaleza | Reset |
|---|---|---|---|
| `truekeate_logs_dropped` | `LOG_DROPPED_COUNTER_KEY`, `src/background/state/schema.ts:90` | Contador de diagnóstico del servicio de logs (no es estado de cartera) | No está en ninguna de las dos listas del reset: **sobrevive** |
| `truekeate_schema_version` | `SCHEMA_VERSION_KEY`, `src/background/state/schema.ts:37` | Constante documental, sin escritor en `src/` | No procede (no se escribe) |

El comentario de `LOG_DROPPED_COUNTER_KEY` es explícito: vive junto a las canónicas «para que su nombre cumpla la nomenclatura `truekeate_` (ACU-25) sin que ningún módulo escriba una cadena a mano; NO entra en `STORAGE_KEYS` ni en `CANONICAL_STORAGE_KEYS` […] y, como el resto de la observabilidad, **sobrevive al reset**» (`src/background/state/schema.ts:81-90`).

### Divergencias detectadas (globales)

1. **Recuento de líneas.** El encargo de este manual describe `schema.ts` como «M33, 609 líneas»; el fichero real tiene **662 líneas** (leído completo). No afecta al contenido semántico, pero la cita del corpus está desactualizada.
2. **`truekeate_schema_version` no existe en el almacén por código.** Ningún módulo de `src/` la escribe (solo se usa en pruebas: `src/background/state/state.spec.ts:202`), sin embargo el arnés E2E la declara como clave volátil del almacén en `e2e/fixtures/extension.ts:508` y aparece en varias evidencias JSON (`RepoTecnico/evidencia/H3/13-revocar-2026-09-11.json:18` y posteriores). **Pendiente de confirmar** su origen real (probable residuo de artefactos `dist/` de un build anterior).
3. **`truekeate_logs_dropped` se rechaza en la migración.** Al no ser canónica ni alias ni clave retirada, `isRejectedKey` devuelve `true` (`src/background/state/migrations.ts:383-386`): la migración la informa en `rejectedKeys` y **no la copia** al esquema migrado. El efecto práctico es benigno —`writeStorage` solo escribe claves canónicas y `removeStorage` solo borra las heredadas/retiradas—, pero la clave existente nunca se «adopta» formalmente. Documentado, no corregido.
4. **`truekeate_mnemonic`: el diccionario dice «Sí (si la wallet se creó por frase)»** (`RepoTecnico/diccionario_datos.md:44`); el código lo confirma con `string | null` en la proyección (`src/background/accounts.ts:71`) y `hasMnemonic` en la auto-carga (`src/background.ts:393`).

## Clave `truekeate_mnemonic`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:42` (`mnemonic: 'truekeate_mnemonic'`).
- Tipo real: `string` (frase BIP-39 de 12 palabras). La proyección del dominio lo declara como `string | null`, porque la clave puede no existir: `mnemonic: string | null` en `src/background/accounts.ts:71`; la lectura efectiva está en `src/background/accounts.ts:206-209` (`typeof mnemonic === 'string' && mnemonic.trim().length > 0 ? mnemonic : null`).
- No tiene valor en `STORAGE_DEFAULTS` (`src/background/state/schema.ts:267-283`): no hay valor inicial.
- Ejemplo: `"test test test test test test test test test test test junk"` (frase de Anvil, `RepoTecnico/diccionario_datos.md:46`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| — (valor raíz) | `string` | Opcional: existe si la cartera se creó o importó por frase | Frase BIP-39 normalizada (minúsculas, espacios simples) | No hay (clave ausente) |

### Ciclo de vida

- **Crea:** `persistWalletFromMnemonic` (`src/background/accounts.ts:433-465`), invocada por `createWallet` (`:472-478`, RF-01) e `importWalletFromMnemonic` (`:484-494`, RF-02). La escritura está en `src/background/accounts.ts:452-460`, en el **mismo** `set` que `truekeate_accounts`, `truekeate_current_account` y `truekeate_settings`.
- **Modifica:** no hay actualización parcial. Volver a crear o importar una cartera **reescribe** la frase y reinicia `accountLabels`/`hiddenAccounts` del objeto de ajustes (`src/background/accounts.ts:446-451`), sin tocar las importadas ni los logs.
- **Borra:** solo `resetWallet` (figura en `STORAGE_KEYS_CLEARED_ON_RESET`, `src/background/state/schema.ts:402-404`). La comprobación de integridad M13 **no** la borra: marca la cartera como dañada (`src/background.ts:317-333`).
- **Reset:** se borra.
- **Suspensión del SW:** sobrevive (persistente, y es la base de la restauración sin pedir la frase, `src/background.ts:347-354`).

### Invariantes y errores

- Checksum BIP-39 verificado antes de persistir: `checkMnemonic(input)` y, si falla, `-32602 invalidMnemonic` **sin escribir nada** (`src/background/accounts.ts:488-491`).
- Nunca se registra en `truekeate_logs` ni viaja por mensaje alguno (RNF-09/H-42): `RepoTecnico/diccionario_datos.md:47`.
- Si la derivación falla tras pasar el checksum, el alta responde `-32603` con `reason: 'derivation-failed'` sin persistir (`src/background/accounts.ts:441-444`).
- Si el `set` es rechazado, el alta responde `-32603 storageQuotaExceeded` delegando en `storageQuotaExceededError()` (`src/background/accounts.ts:461-463`).

## Clave `truekeate_accounts`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:44` (`accounts: 'truekeate_accounts'`; comentario: «`string[]` de direcciones; el índice del array ES el índice BIP-44»).
- Tipo real del dominio: `Address[]` (`src/background/accounts.ts:72`), con `Address = \`0x${string}\`` (`src/shared/types.ts:22`).
- Valor inicial: `[]` (`STORAGE_DEFAULTS`, `src/background/state/schema.ts:268`).
- Ejemplo: `["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"]`.

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| — (valor raíz) | `Address[]` | Sí (puede ser `[]`) | Direcciones derivadas en orden BIP-44 `m/44'/60'/0'/0/i`; el índice del array **es** el índice de derivación | `[]` |

### Ciclo de vida

- **Crea:** `persistWalletFromMnemonic` con las `derivedAccountCount` primeras cuentas (`src/background/accounts.ts:440-455`).
- **Modifica:** `deriveNextAccount` añade una cuenta cuyo índice es la longitud actual del array y sube `derivedAccountCount` (`src/background/accounts.ts:514-528`). Es idempotente frente a reintentos porque el índice se deriva de la longitud.
- **Borra:** solo `resetWallet`. Las cuentas derivadas **nunca** se eliminan individualmente: se ocultan vía `truekeate_settings.hiddenAccounts` (RF-06, `src/background/accounts.ts:676-724`).
- **Reset:** se borra. **Suspensión del SW:** sobrevive.

### Invariantes y errores

- El saneado **falla cerrado**: si alguna entrada no es una dirección normalizable, la lista entera se considera inutilizable y se devuelve `[]`, para no compactar índices y no entregar la clave privada de otra cuenta (`src/background/accounts.ts:151-176`).
- Una referencia `idx:<n>` fuera de rango responde `-32602 unknownAccount` (`src/background/accounts.ts:104-126`, `:816-819`).
- Escribir la lista completa es obligatorio: nunca se escriben subclaves (regla de RMW serializada sobre `truekeate_accounts`/`truekeate_settings` vía `runSettingsRmw`, `src/background/settings.ts:132-135`).

## Clave `truekeate_imported_accounts`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:46`.
- Tipo real: `ImportedAccount[]` (`src/background/accounts.ts:73`), con `ImportedAccount` declarado en `src/shared/types.ts:428-435`.
- Valor inicial: `[]` (`src/background/state/schema.ts:269`).
- Ejemplo: `[{ "address": "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF", "privateKey": "0x…", "label": "Ahorros", "importedAt": 1730000000000, "visible": true }]`.

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| `address` | `Address` | Sí | Dirección derivada de la clave privada, con checksum EIP-55 | — |
| `privateKey` | `Hex` (32 bytes) | Sí | Clave privada importada | — |
| `label` | `string` | Sí en el tipo (`string`, no opcional) | Etiqueta editable; máximo 32 caracteres | `Importada N` al importar sin etiqueta (`src/background/accounts.ts:589-593`) |
| `importedAt` | `number` (epoch ms) | Sí | Fecha de importación | `0` si el valor persistido no es numérico (`src/background/accounts.ts:197`) |
| `visible` | `boolean` | Sí | Si se muestra en la lista | `true` (se proyecta `visible: record.visible !== false`, `src/background/accounts.ts:198`) |

### Ciclo de vida

- **Crea:** `importAccountByPrivateKey` (`src/background/accounts.ts:557-616`; escritura en `:598-601`).
- **Modifica:** `renameAccount` (`:654-667`, escribe `label`), `setAccountVisible` (`:706-717`, escribe `visible`).
- **Borra:** `removeImportedAccount` (FIFO de guardas: referencia válida → guarda de sesión de dApp → reescritura; `src/background/accounts.ts:741-792`). Es la **única** vía de baja de una cuenta.
- **Reset:** se borra. **Suspensión del SW:** sobrevive.

### Invariantes y errores

- Un duplicado (derivado o importado) responde `-32602 duplicateAccount` (`src/background/accounts.ts:568-575`).
- Clave privada inválida → `-32602 invalidPrivateKey` (`:563-566`); etiqueta de 1..32 caracteres obligatoria cuando se aporta (`:581-588`).
- **Guarda de sesión activa (R-09a / DEC-45):** si una dApp tiene sesión **vigente** sobre la dirección, la baja se bloquea con `-32000 accountInUseByDapp` y la clave queda **intacta** (`src/background/accounts.ts:757-765`, guarda en `:302-375`).
- Las entradas malformadas se descartan al proyectar, no se inventan campos (`src/background/accounts.ts:179-202`).

## Clave `truekeate_current_account`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:48` (comentario: «`AccountRef` activa (`idx:<n>` | `imp:<address>`)»).
- Tipo real: `AccountRef = \`idx:${number}\` | \`imp:${Address}\` | \`${number}\`` (`src/shared/types.ts:40`); la proyección del estado lo lee como `string | null` (`src/background/accounts.ts:74`).
- No tiene valor en `STORAGE_DEFAULTS`; el arranque cae a la primera cuenta disponible cuando falta o es inválida (`src/background/accounts.ts:381-401`).
- Ejemplo: `"idx:0"`.

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| — (valor raíz) | `AccountRef` | Opcional | Identificador de la cuenta activa del popup | Sin valor: `getCurrentAccountRef` devuelve la primera cuenta disponible (`src/background/accounts.ts:400`) |

### Ciclo de vida

- **Crea:** al crear/importar cartera se escribe `idx:0` (`src/background/accounts.ts:456`).
- **Modifica:** `setCurrentAccount` (`src/background/accounts.ts:799-825`); al eliminar la cuenta importada activa pasa a `idx:0` o a la primera importada (`:776-781`).
- **Borra:** `resetWallet`. Es además una de las claves que la migración **reescribe** (`"0"` → `idx:0`, `src/background/state/migrations.ts:308-312`).
- **Reset:** se borra. **Suspensión del SW:** sobrevive.

### Invariantes y errores

- La referencia debe existir en `truekeate_accounts` o `truekeate_imported_accounts`; si no, `-32602 unknownAccount` (`src/background/accounts.ts:806-819`).
- `parseAccountRef` exige dígitos y rango BIP-44 válido: rechaza `'idx:'` vacío, `'0x10'`, `'1e1'` y valores fuera de rango (`src/background/accounts.ts:93-126`).
- Si el valor guardado no existe al leer, la cuenta activa se resuelve a la primera disponible **sin** reescribir el almacén (`src/background/accounts.ts:381-401`).

## Clave `truekeate_chain_id`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:50` (comentario: «`ChainIdHex` activo; inicial `0x7a69`»).
- Tipo real: `ChainIdHex = \`0x${string}\`` (`src/shared/types.ts:31`).
- Valor normativo inicial: `0x7a69` (Anvil 31337; `src/shared/constants.ts:23-26`, `RepoTecnico/diccionario_datos.md:89`).
- No figura en `STORAGE_DEFAULTS`: se siembra en el arranque.

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| — (valor raíz) | `ChainIdHex` | Sí tras el primer arranque | Red activa, en hexadecimal canónico | `0x7a69` sembrado por `seedDefaultNetwork` (`src/background/networks/catalog.ts:210-213`) |

### Ciclo de vida

- **Crea/Repara:** `seedDefaultNetwork` escribe la clave si el `chainId` guardado no está dado de alta en el catálogo (`src/background/networks/catalog.ts:209-213`), invocada en cada arranque desde `src/background.ts:646-647`.
- **Modifica:** `activateChain` al aprobar `wallet_switchEthereumChain` (`src/background/networks/switch.ts:117-131`); `persistActiveChainId` (`src/background/networks/addChain.ts:515-518`) y `approvals/dispatch.ts:438` y `:746`.
- **Borra:** `resetWallet` (vuelve al default Anvil tras el siguiente arranque).
- **Reset:** se borra. **Suspensión del SW:** sobrevive.

### Invariantes y errores

- Forma canónica `0x` + hex, con patrón `CHAIN_ID_PATTERN = /^0x[0-9a-fA-F]+$/` (`src/background/networks/catalog.ts:80`) y normalización a minúsculas (`:87-92`).
- Si el `chainId` activo no está registrado, `resolveActiveNetwork` devuelve la red por defecto y `rpcUrlFor` cae a `http://127.0.0.1:8545` (`src/background/networks/catalog.ts:156-163`, `:224-228`).
- Un fallo de escritura al activar la red lanza `-32603` con `reason: 'chain-id-write-failed'`; la persistencia va **antes** de emitir `chainChanged` (`src/background/networks/switch.ts:113-127`).

## Clave `truekeate_networks`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:52` (comentario: «Mapa `chainId → StoredNetwork`; default único Anvil Local»).
- Tipo real: `NetworksCatalog = Record<string, StoredNetwork>` (`src/background/networks/catalog.ts:54-55`), con `StoredNetwork` en `src/shared/types.ts:438-452`.
- Valor inicial: `{}` (`src/background/state/schema.ts:270`) y, tras el arranque, un único registro Anvil (`ANVIL_NETWORK`, `src/background/networks/catalog.ts:61-70`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| `chainId` | `ChainIdHex` | Sí | Clave del mapa y `chainId` de la red | — |
| `chainIdDecimal` | `number` | Sí | Forma decimal (EIP-712 y EIP-3085) | Se deriva con `Number.parseInt(chainId, 16)` si falta (`src/background/networks/catalog.ts:111-114`) |
| `name` | `string` | Sí | Nombre visible | El propio `chainId` si falta (`:115`) |
| `rpcUrl` | `string` | Sí | Endpoint JSON-RPC | `''` en la proyección si falta (`:116`); `rpcUrlFor` cae al default (`:224-228`) |
| `symbol` | `string` | Sí | Símbolo de la moneda nativa | `ETH` (`:117`, `src/shared/constants.ts:35`) |
| `decimals` | `number` | No | Decimales de la moneda nativa | `18` (`:118`, `src/shared/constants.ts:36`) |
| `isTestnet` | `boolean` | Sí | Marca de red de pruebas | `false` en la proyección (`value.isTestnet === true`, `:119`) |
| `isDefault` | `boolean` | Sí | Red por defecto | `false` en el alta (`:120`, `:550-551`) |
| `explorerUrl` | `string` | No | Explorador declarado por EIP-3085 | Ausente (`src/shared/types.ts:447-451`) |

### Ciclo de vida

- **Crea:** `seedDefaultNetwork` siembra Anvil de forma idempotente (`src/background/networks/catalog.ts:197-222`).
- **Modifica:** `upsertNetwork` da de alta o reemplaza una red **sin** tocar `truekeate_chain_id` (`src/background/networks/catalog.ts:555-580`). El alta es siempre `isDefault: false` (`:542-553`).
- **Borra:** `resetWallet` (vuelve a sembrarse Anvil en el siguiente arranque).
- **Reset:** se borra. **Suspensión del SW:** sobrevive.
- La escritura está serializada por un cerrojo propio (`networkWriteTail`, `src/background/networks/catalog.ts:165-186`) para evitar el *lost update* entre la siembra del arranque y un alta concurrente.

### Invariantes y errores

- Entradas sin `chainId` hexadecimal válido se descartan al proyectar (`src/background/networks/catalog.ts:94-124`).
- El `rpcUrl` se valida antes de persistir: `https` preferente y `http` **solo** para `127.0.0.1`/`localhost`; se rechazan hosts privados y de enlace local (`src/background/networks/catalog.ts:347-414`).
- Si el `set` del alta falla, el error es `-32603 storageQuotaExceeded` y la operación se **aborta** sin dejar estado a medias (`src/background/networks/catalog.ts:570-578`).
- **Divergencia detectada:** `isTestnetChain` documenta «por defecto `true`» para redes desconocidas (`src/background/networks/catalog.ts:432-443`), mientras que la proyección persistida convierte cualquier valor ausente en `false` (`:119`). Son dos momentos distintos (declaración vs. lectura), pero conviene tenerlo presente al auditar avisos RNF-23.

## Clave `truekeate_connected_sites`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:54` (comentario: «`Record<origen normalizado, DappSession>` con TTL de 24 h renovables»).
- Tipo real: `DappSessionsByOrigin = Record<string, DappSession>` (`src/shared/types.ts:544`), con `DappSession` en `src/shared/types.ts:480-490`.
- Valor inicial: `{}` (`src/background/state/schema.ts:271`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| *clave del mapa* | `string` | Sí | Origen normalizado (minúsculas, sin barra final, con puerto) | — |
| `origin` | `string` | Sí en el tipo | Origen normalizado dentro de la entrada | La clave del mapa si falta (`src/background/sessions.ts:76`) |
| `account` | `Address` | Sí | Cuenta autorizada/compartida | `0x` si falta en la proyección (`:71-77`) |
| `chainId` | `ChainIdHex` | Sí | Red en la conexión | `0x0` si falta (`:78`) |
| `tabIds` | `number[]` | Sí (puede ser `[]`) | Pestañas que usaron la sesión (destino de `accountsChanged`) | `[]` (`:79-81`) |
| `connectedAt` | `number` (epoch ms) | Sí | Alta de la conexión | `0` (`:82`) |
| `lastUsedAt` | `number` (epoch ms) | Sí | Último uso; base del vencimiento | `0` (`:83`) |
| `expiresAt` | `number \| null` | Sí | `lastUsedAt + sessionTtlMs`; `null` = sin caducidad | `null` (`:84`) |
| `connected` | `boolean` | Sí | Marca de sesión viva | `true` (`value.connected !== false`, `:85`) |

### Ciclo de vida

- **Crea:** `connectSession` tras la elección del usuario en `connect.html`; es la **única** vía por la que un origen consigue sesión (`src/background/sessions.ts:272-308`).
- **Modifica:** `touchSession` renueva `lastUsedAt`/`expiresAt` en cada uso y purga la entrada vencida (`src/background/sessions.ts:144-188`); `rememberTab` añade pestañas (`:357-386`); `applyActiveAccountToSessions` reescribe `account` de las sesiones vigentes al cambiar la cuenta activa, **sin** tocar los plazos (`:400-451`).
- **Borra:** `revokeSession` elimina la entrada por su clave normalizada (`src/background/sessions.ts:327-351`); `touchSession` la elimina si venció (`:163-168`); el borrado por vencimiento **no emite error**.
- **Reset:** se borra. **Suspensión del SW:** sobrevive (es estado persistente, no memoria).

### Invariantes y errores

- TTL de 24 h renovables: `SESSION_TTL_MS = 86_400_000` (`src/shared/constants.ts:104`) y `expiresAtFrom(lastUsedAt, ttlMs) = lastUsedAt + ttlMs` (`src/background/sessions.ts:125-127`).
- `isSessionValid` exige `connected !== false` y `expiresAt === null || expiresAt > now` (`src/background/sessions.ts:111-123`).
- Toda mutación pasa por `sessionsLock` (cerrojo FIFO volátil) porque dos renovaciones solapadas se pisaban (`src/background/sessions.ts:44-60`).
- Una entrada vigente **bloquea** el revelado/exportación de su cuenta y la baja de la importada con `-32000` (`src/background/accounts.ts:294-375`).
- **Divergencia detectada:** el diccionario §2.7 declara solo `account`, `chainId`, `connectedAt`, `lastUsedAt` y `expiresAt` (`RepoTecnico/diccionario_datos.md:129-136`), mientras el código exige además `origin`, `tabIds` y `connected` (`src/shared/types.ts:480-490`). El código es más estricto que la tabla normativa.

## Clave `truekeate_pending_requests`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:56` (comentario: «`Record<approvalId, PendingRequest>`: la cola persistida»).
- Tipo real: `PendingRequestsMap = Record<Uuid, PendingRequest>` (`src/shared/types.ts:538`), con `PendingRequest` en `src/shared/types.ts:258-296`.
- Valor inicial: `{}` (`src/background/state/schema.ts:272`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| `approvalId` | `Uuid` | Sí | Clave del mapa y correlación de la respuesta | — |
| `method` | `ApprovalMethod` | Sí | Método aprobable (`src/shared/types.ts:56-71`) | — |
| `params` | `unknown[]` | Sí | Payload de firma, **redactado** en reposo | `[]` si falta (`src/background/approvals/queue.ts:135`) |
| `origin` | `string` | Sí | Origen normalizado o `extension` | `''` (`:136`) |
| `tabId` | `number \| null` | Sí | Pestaña solicitante | `null` (`:137`) |
| `frameId` | `number \| null` | Sí | Frame solicitante (`0` = top) | `null` (`:138`) |
| `account` | `Address` | Sí | Cuenta que firmará | `0x` (`:139`) |
| `chainId` | `ChainIdHex` | Sí | Red de la solicitud | `0x0` (`:140`) |
| `txPreview` | `TxPreview` | No | Solo `eth_sendTransaction` | Ausente (`:148-150`) |
| `typedDataPreview` | `TypedDataPreview` | No | Solo `eth_signTypedData_v4` | Ausente (`:151-153`) |
| `signMessagePreview` | `PersonalSignPreview` | No | Solo `personal_sign` | Ausente (`:154-156`) |
| `createdAt` | `number` (epoch ms) | Sí | Ancla del plazo FIFO | `0` (`:141`) |
| `expiresAt` | `number` | Sí | `createdAt + SIGN_TIMEOUT_MS` | `NaN` si el persistido no es numérico (`:142-144`) |
| `status` | `ApprovalStatus` | Sí | `pending`/`approved`/`rejected`/`expired` | `'pending'` (`:145-146`) |
| `resolvedAt` | `number` | No | Instante de resolución | Ausente (`:157-159`) |
| `errorCode` | `number` | No | Código EIP-1193 emitido (4001 en rechazo/vencimiento) | Ausente (`:160-162`) |
| `requestId` | `string` | No | Correlación con el salto 1 (D-H4-E10) | Ausente (`:163-166`) |

### Ciclo de vida

- **Crea:** `enqueueApprovalRequest`, que escribe la cola **y** la ventana de tasa en el **mismo** `set` (`src/background/approvals/queue.ts:509-521`).
- **Modifica:** `resolveApprovalRequest` marca y **purga** en la misma operación (`src/background/approvals/queue.ts:569-602`); `purgePendingRequests` (`:294-313`) y `planQueuePurge` (`:270-288`) retiran resueltas y vencidas; la reconciliación del arranque repite la purga (`src/background/approvals/reconcile.ts:377-383`).
- **Borra:** `dropPendingRequest` (`:605-619`) y las purgas anteriores. El reset exige la cola **vacía** (`src/background/state/schema.ts:483-499`).
- **Reset:** se borra (y, además, solo puede ejecutarse si no hay `pending`). **Suspensión del SW:** sobrevive por diseño (H-02/H-07).

### Invariantes y errores

- **Cota de payload**: `params` > `MAX_PAYLOAD_BYTES = 65_536` (`src/shared/constants.ts:145`) → `payloadTooLarge` (`-32602`) **sin persistir** (`src/background/approvals/queue.ts:400-407`).
- **Cardinalidad**: 8 globales / 1 por origen / 6 por minuto (`src/shared/constants.ts:162-170`), comprobadas en este orden (`src/background/approvals/queue.ts:440-474`).
- **Identificador duplicado** → `-32603` (`:431-434`).
- **Plazo**: `expiresAt = createdAt + SIGN_TIMEOUT_MS` (120 s, `src/shared/constants.ts:92`), anclado a `createdAt` y no a la apertura de la ventana (`src/background/approvals/queue.ts:390-392`, `:492`).
- **FIFO**: la ventana muestra la `pending` con `createdAt` más antiguo, con desempate por `approvalId` (`:218-231`).
- Escritura siempre de la clave **completa** bajo `rmwLock`; nunca subclaves (`src/background/approvals/queue.ts:14-18`).
- Si el `set` falla por cuota: la operación se **aborta** con `-32603 storageQuotaExceeded` (`:518-521`).

## Clave `truekeate_connect_request`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:58` (comentario: «`Record<requestId, ConnectRequest>`: máximo 1 `pending` por origen»).
- Tipo real: `Record<string, ConnectRequest>` (`src/background/connections.ts:167-201`), con `ConnectRequest` en `src/shared/types.ts:299-312`.
- Valor inicial: `{}` (`src/background/state/schema.ts:273`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| `requestId` | `Uuid` | Sí | Clave del mapa | — |
| `origin` | `string` | Sí | Origen normalizado de la dApp | — |
| `favicon` | `string` (opcional) | No | URL del favicon **construida por el SW** contra el servicio `_favicon` | Ausente (`src/shared/types.ts:302`) |
| `accounts` | `Address[]` | Sí | Cuentas ofrecidas | `[]` (`src/background/connections.ts:184-186`) |
| `currentAccountIndex` | `number` | Sí | Preselección inicial | `0` (`:187-188`) |
| `chainId` | `ChainIdHex` | Sí | Red actual | `0x0` (`:189`) |
| `tabId` | `number` | Sí | Pestaña solicitante | `-1` (`:190`) |
| `frameId` | `number` | Sí | Frame solicitante | `0` (`:191`) |
| `createdAt` | `number` (epoch ms) | Sí | Alta de la solicitud | `0` (`:192`) |
| `expiresAt` | `number` (epoch ms) | Sí | `createdAt + CONNECT_TIMEOUT_MS` | `0` (`:193`) |
| `status` | `ApprovalStatus` | Sí | Estado del ciclo | `'pending'` (`:194-197`) |

### Ciclo de vida

- **Crea:** `openConnectWindow` persiste la entrada **antes** de abrir la ventana 420×650 (`src/background/connections.ts:455-516`).
- **Modifica/Borra:** `applyConnectResponse` resuelve y retira la entrada (`src/background/connections.ts:558-680`); `purgeConnectRequests` la retira por vencimiento o por resolución, que son los **dos** motivos de purga (`:275-291`, `:242-273`).
- **Reset:** se borra. **Suspensión del SW:** sobrevive (invariante 1 del módulo, `:11-13`).

### Invariantes y errores

- **Máximo 1 `pending` por origen**: la comprobación y la escritura ocurren dentro del **mismo** tramo crítico (`connectRequestsLock`), de modo que dos altas simultáneas no crean dos solicitudes (`src/background/connections.ts:492-519`).
- Plazo `CONNECT_TIMEOUT_MS = 60_000` (`src/shared/constants.ts:95`); superado, la solicitud no se entrega (`src/background/connections.ts:710-735`).
- Una cuenta que no esté en `accounts` responde `4100` `unauthorizedOrigin` y **no** crea sesión (`:633-645`).
- **Divergencia detectada:** el diccionario declara `favicon` como `string | null` (`RepoTecnico/diccionario_datos.md:234`), mientras el tipo real es `favicon?: string` —opcional, no nulable— (`src/shared/types.ts:302`). Quien escriba `null` explícito queda fuera del contrato.

## Clave `truekeate_approval_window`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:60` (comentario: «Ventana ÚNICA de confirmación (`ApprovalWindow`, P-21)»).
- Tipo real: `ApprovalWindow` (`src/shared/types.ts:336-341`).
- Valor inicial **exacto**: `{ windowId: null, shownApprovalId: null, openedAt: null, updatedAt: 0 }`, duplicado de forma coherente en `STORAGE_DEFAULTS` (`src/background/state/schema.ts:274-279`) y en `INITIAL_APPROVAL_WINDOW` (`src/background/approvals/focus.ts:214-219`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| `windowId` | `number \| null` | Sí | Identificador de `chrome.windows` de la ventana única; `null` = sin ventana | `null` (`src/background/approvals/focus.ts:228`) |
| `shownApprovalId` | `Uuid \| null` | Sí | `pending` mostrada | `null` (`:229`) |
| `openedAt` | `number \| null` | Sí | Epoch ms de apertura | `null` (`:230`) |
| `updatedAt` | `number` | Sí | Epoch ms de la última escritura | `0` (`:231`) |

### Ciclo de vida

- **Crea/Modifica:** `writeApprovalWindow` es la **única** escritura de la clave (`src/background/approvals/focus.ts:241-253`, `:251`); siempre escribe el objeto completo con `updatedAt` nuevo.
- **Borra la entrada:** `resetWallet`. El `windowId` se pone a `null` al cerrar la ventana, pero la clave sigue existiendo con el objeto inicial (`:466-484`, `:616-642`).
- **Reset:** se borra. **Suspensión del SW:** sobrevive (invariante 5 del módulo, `:24-25`).

### Invariantes y errores

- `windowId !== null` implica **exactamente una** `notification.html`; el «leer → decidir → crear» va bajo `focusLock` (`src/background/approvals/focus.ts:13-16`, `:259-267`).
- `shownApprovalId` es siempre la `pending` más antigua y **presentable** (`isPresentable`, `:405-429`).
- El estado se marca cerrado **antes** de `windows.remove`, para que `onRemoved` no lo confunda con la «X» del usuario (`:480-489`, `:693-697`).
- Cerrar con la «X» equivale a rechazo (`4001`), salvo que el plazo ya haya vencido, en cuyo caso prevalece `expired` (`:713-731`).
- Si la ventana se redescubre por URL, se repara el `windowId` persistido y se reempuja el cuerpo (`:570-586`).

## Clave `truekeate_inflight_tx`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:62` (comentario: «`Record<Address, InflightTx>`: marca de “transacción en vuelo” por cuenta»).
- Tipo real: `InflightTxByAccount = Record<Address, InflightTx>` (`src/shared/types.ts:541`), con `InflightTx` en `src/shared/types.ts:513-522`.
- Valor inicial: `{}` (`src/background/state/schema.ts:280`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| *clave del mapa* | `Address` | Sí | El `from` de la transacción | — |
| `account` | `Address` | Sí | Cuenta marcada | La clave del mapa si falta (`src/background/approvals/queue.ts:632`) |
| `approvalId` | `Uuid` | Sí | Solicitud que originó la difusión | `''` (`:633`) |
| `phase` | `'signing' \| 'broadcast'` | Sí | `signing` bloquea la cuenta; `broadcast` no | `'broadcast'` si el valor no es `signing` (`:630`) |
| `nonce` | `number` | No | Nonce definitivo recalculado al aprobar | Ausente (`:635`) |
| `txHash` | `Hex \| null` | Sí | `null` mientras `signing` | `null` (`:636`) |
| `startedAt` | `number` (epoch ms) | Sí | Paso a `signing`; ancla del TTL | `0` (`:637`) |
| `expiresAt` | `number` | Sí | `startedAt + INFLIGHT_TTL_MS` | `NaN` si falta (`:638`) |

### Ciclo de vida

- **Crea:** `beginInflightTx` escribe `phase: 'signing'` **antes** de firmar; si ya hay una marca `signing` vigente devuelve `inflightTxInProgress` (`-32000`) y no firma (`src/background/approvals/queue.ts:722-767`).
- **Modifica:** `markInflightBroadcast` reescribe la misma entrada con `broadcast` y el hash del nodo (`:778-804`).
- **Borra:** `releaseInflightTx` al confirmar, fallar o vencer (`:806-820`); la reconciliación la elimina según la tabla de §2.12 (`src/background/approvals/reconcile.ts:191-310`); la alarma de liberación la libera con TTL agotado (`:316-350`).
- **Reset:** se borra (y solo puede haber llegado vacío: una marca vigente **bloquea** el reset, `src/background/state/schema.ts:436-443`, `:483-499`).
- **Suspensión del SW:** sobrevive; su reconstrucción es un paso propio de la reconciliación (`src/background/approvals/reconcile.ts:417-425`).

### Invariantes y errores

- **Como máximo una entrada por dirección** (`RepoTecnico/diccionario_datos.md:343`).
- TTL `INFLIGHT_TTL_MS = 180_000` (3 min, `src/shared/constants.ts:107`).
- Vigencia estricta: `expiresAt > now`; un `expiresAt` no numérico **no** es vigente y no puede bloquear el reset para siempre (`src/background/approvals/queue.ts:687-689`, `src/background/state/schema.ts:431-443`).
- Segunda aprobación con `signing` vigente → `-32000 inflightTxInProgress` (causa de la v1.10 del diccionario), no `tooManyPendingRequests` (`src/background/approvals/queue.ts:722-749`).
- La reconciliación **nunca** reintenta una firma ni una difusión: libera, descarta y deja traza (`src/background/approvals/reconcile.ts:230-306`).

## Clave `truekeate_rate_windows`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:64` (comentario: «`Record<origin, RateWindow>`: ventana de tasa persistida (ADT-24 / D-Q)»).
- Tipo real: `RateWindowsByOrigin = Record<string, RateWindow>` (`src/shared/types.ts:535`), con `RateWindow` en `src/shared/types.ts:525-532`.
- Valor inicial: `{}` (`src/background/state/schema.ts:281`); una ventana nueva se construye con `freshRateWindow(now)` (`src/background/rpc/rateLimit.ts:39-46`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| `tokens` | `number` | Sí | Saldo del *token bucket* (0…6) | `6` (`src/background/rpc/rateLimit.ts:40`) |
| `lastRefillAt` | `number` (epoch ms) | Sí | Última recarga (perezosa) | `now` (`:41`) |
| `approvalWindowStart` | `number` (epoch ms) | Sí | Inicio de la ventana de 60 s | `now` (`:42`) |
| `approvalsInWindow` | `number` | Sí | Solicitudes **aprobables** de la ventana | `0` (`:43`) |
| `deniedCount` | `number` | Sí | Rechazos acumulados (diagnóstico) | `0` (`:44`) |
| `updatedAt` | `number` (epoch ms) | Sí | Base de la purga por inactividad | `now` (`:45`) |

### Ciclo de vida

- **Crea:** `decideRateLimit` con la persistencia por defecto (`src/background/rpc/rateLimit.ts:215-231`); una ventana leída como `null` se normaliza a `freshRateWindow` (`:113-115`).
- **Modifica:** consumo de token (`consumeRateWindow`, `:151-177`); incremento de `approvalsInWindow` por las solicitudes aprobables, en el mismo `set` que la cola (`src/background/approvals/queue.ts:475-517`).
- **Borra:** `reconcileRateWindows` purga las entradas inactivas (`now - updatedAt > rateWindowTtlMs`) y reinicia las de reloj futuro (`src/background/rpc/rateLimit.ts:240-264`); el reset borra la clave entera.
- **Reset:** se borra. **Suspensión del SW:** sobrevive (el bucket no nace lleno tras cada suspensión, `src/background/rpc/rateLimit.ts:11-12`).

### Invariantes y errores

- Ventana de **6 solicitudes / 60 s por origen** (`rateLimitWindowRequests = pendingRequestsPerMinute`, `src/shared/constants.ts:194`; `rateLimitWindowMs = RATE_WINDOW_MS`, `:197`).
- Purga por inactividad: `rateWindowTtlMs = 600_000` (10 min, `src/shared/constants.ts:174`).
- Reloj movido hacia atrás (`lastRefillAt > now` o `approvalWindowStart > now`) → reinicio completo de la entrada (`src/background/rpc/rateLimit.ts:116-119`).
- Al vencer la ventana se reinicia **también** `approvalsInWindow = 0` (defecto medido y corregido en la fase 4, `src/background/rpc/rateLimit.ts:120-135`).
- Exención declarada: `origin === 'extension'` no consume tokens (`src/background/rpc/rateLimit.ts:93-94`, `:218-220`).
- Al agotarse, la respuesta es `4001` **sin** abrir ventana y **sin** ejecutar la llamada (`RepoTecnico/diccionario_datos.md:431`).

## Clave `truekeate_logs`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:66` (comentario: «`LogEntry[]` con retención FIFO; EXCLUIDA de `resetWallet` (RF-32)»).
- Tipo real: `LogEntry[]` (`src/shared/types.ts:381-395`); el almacén guarda un `Array` plano, validado al leer con `Array.isArray(current)` (`src/background/logging/logger.ts:553-555`).
- Valor inicial: `[]` (`src/background/state/schema.ts:282`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| `id` | `Uuid` | Sí | Identificador de la entrada (`uuid` v4 si el entorno lo permite) | Se genera en cada entrada (`src/background/logging/logger.ts:232-241`) |
| `ts` | `number` (epoch ms) | Sí | Marca temporal (clave del orden FIFO) | `now` (`:550`, `:561`) |
| `level` | `LogLevel` | Sí | `info`/`success`/`warn`/`error` (colorea la UI) | El del catálogo si no se aporta (`:501-505`) |
| `category` | `LogCategory` | Sí | `call`/`event`/`tx`/`sign`/`system` (taxonomía) | La del catálogo (`:501`) |
| `event` | `LogEventName` | Sí | Evento del **catálogo cerrado de 24** | Obligatorio: fuera del catálogo lanza `RangeError` (`:496-500`) |
| `message` | `string` | Sí | Texto legible en español | El de la descripción del evento (`:502-505`) |
| `origin` | `string` | Sí | Origen normalizado o `extension` | `extension` si falta (`:243-245`, `:376`) |
| `method` | `string` | Sí | Método RPC implicado | `''` (`:377`) |
| `data` | `unknown` | Sí | Payload **redactado** (M22); > 4096 bytes → `{ payloadHash, payloadBytes, truncated }` | `undefined` si no se aporta (`:341-354`) |
| `txHash` | `Hex` | No | Hash de la transacción (lo lee el panel, RF-31) | Ausente (`:380-382`) |
| `txStatus` | `'pending' \| 'confirmed' \| 'failed'` | No | Estado observable de la transacción | Ausente (`:383-385`) |

### Ciclo de vida

- **Crea/Modifica:** **solo** `logger.ts`. `writeOnce` es el único `set` sobre esta clave (`src/background/logging/logger.ts:417-434`, `:425`); el resto de módulos reexportan `appendLogEntry`/`appendLogEntries` para no abrir un segundo camino de escritura (`src/background/approvals/queue.ts:854-869`).
- **Borra:** `resetWallet` **no** la toca (es la única excepción, ver más abajo). La retención FIFO descarta las entradas más antiguas al escribir.
- **Reset:** **se conserva** (RF-32 / ADR-11).
- **Suspensión del SW:** sobrevive; el popup solo lee (por `wallet_getLogs`), nunca escribe (H-09).

### Invariantes y errores

- **Un evento por entrada** y catálogo cerrado de 24 nombres (`src/shared/types.ts:354-378`, `src/background/logging/logger.ts:16-20`); un `event` fuera del catálogo es un **error de programación** y lanza `RangeError` (`:543-547`).
- **Retención FIFO**: `logLimit = 500` global y `logMaxPerOrigin = 200` por origen (`src/shared/constants.ts:154-155`), aplicada en dos pasos —global y luego por origen— sobre entradas ordenadas por `ts` (`src/background/logging/retention.ts:74-127`).
- **Redacción obligatoria**: cualquier clave de calldata se trunca a sus primeros 10 bytes + `dataLength` (`src/background/logging/logger.ts:258-327`); nunca se persiste una clave privada, un mnemonic ni una firma completa (`RepoTecnico/diccionario_datos.md:321-331`).
- **Escrituras serializadas** por un cerrojo de promesas para no perder entradas concurrentes (`src/background/logging/logger.ts:393-407`).
- El presupuesto objetivo de la clave es **≤ 2 MB** con las 500 entradas (`RepoTecnico/diccionario_datos.md:335`).

## Clave `truekeate_settings`

### Forma y tipos

- Nombre canónico: `src/background/state/schema.ts:68` (comentario: «`TruekeateSettings`: defaults, etiquetas y aceptación de avisos»).
- Tipo real: `StoredSettings extends TruekeateSettings` con `schemaVersion: string` (`src/background/settings.ts:73-76`); `TruekeateSettings` en `src/shared/types.ts:402-425`.
- Defaults: `DEFAULT_SETTINGS` (`src/background/settings.ts:79-95`), y `sanitizeSettings` recompone el objeto campo a campo sin confiar en la forma almacenada (`:184-228`).
- Valor inicial en `STORAGE_DEFAULTS`: **no** hay entrada para esta clave (se construye con `DEFAULT_SETTINGS`/`sanitizeSettings`).

### Campos

| Campo | Tipo | Obligatoriedad | Descripción | Valor por defecto |
|---|---|---|---|---|
| `derivedAccountCount` | `number` | Sí | Cuentas a derivar; «Añadir cuenta» lo incrementa | `5` (`DERIVED_ACCOUNTS`, `src/shared/constants.ts:67`) |
| `accountLabels` | `Record<number, string>` | Sí | Etiquetas de las derivadas por índice BIP-44 (máx. 32) | `{}` |
| `hiddenAccounts` | `number[]` | Sí | Índices BIP-44 ocultos (únicos y ordenados) | `[]` |
| `balancePollMs` | `number` | Sí | Intervalo de polling de saldos | `5_000` (`src/shared/constants.ts:110`) |
| `balancePollMaxAccounts` | `number` | Sí | Cuentas polleadas por ciclo | `10` (`:113`) |
| `logLimit` | `number` | Sí | Retención global de logs | `500` (`:154`) |
| `logMaxPerOrigin` | `number` | Sí | Retención por origen | `200` (`:155`) |
| `sessionTtlMs` | `number` | Sí | Caducidad de sesión de dApp | `86_400_000` (`:104`) |
| `pendingRequestsMax` | `number` | Sí | Máximo global de `pending` | `8` (`:162`) |
| `pendingRequestsMaxPerOrigin` | `number` | Sí | Máximo por origen | `1` (`:166`) |
| `pendingRequestsPerMinute` | `number` | Sí | Límite de tasa por origen | `6` (`:170`) |
| `language` | `'es' \| 'en'` | Sí | Idioma de la UI | `'es'` (`:188`) |
| `encryptionEnabled` | `false` | Sí | Cifrado descartado (P-03); se conserva por compatibilidad | `false` forzado (`src/background/settings.ts:219`) |
| `requirePasswordOnOpen` | `false` | Sí | Bloqueo del popup (P-03) | `false` forzado (`:220`) |
| `devNoticeAcceptedAt` | `number` | No | Aceptación del aviso de entorno de desarrollo (RNF-23) | Ausente si no se aceptó (`:224-226`) |
| `schemaVersion` | `string` | Sí | Versión del esquema, declarada **dentro** del objeto | `'1.4'` (`:221`, `src/background/state/migrations.ts:313`) |

### Ciclo de vida

- **Crea:** primer `writeSettings` — al crear/importar cartera (`src/background/accounts.ts:457`), al derivar una cuenta (`:527`) o al aplicar cualquier parche de ajustes.
- **Modifica:** `writeSettings` (`src/background/settings.ts:244-251`) bajo el cerrojo compartido `settingsWriteLock` (`:127-135`); `updateSettings` (`:259-274`), `setAccountLabel` (`:351-367`), `setDerivedAccountCount` (`:376-379`), `hideDerivedAccount`/`showDerivedAccount` (`:390-412`).
- **Borra:** `resetWallet` (el objeto completo). El diccionario lo confirma para `hiddenAccounts` (`RepoTecnico/diccionario_datos.md:254`).
- **Reset:** se borra. **Suspensión del SW:** sobrevive.

### Invariantes y errores

- **P-03 forzado**: `encryptionEnabled` y `requirePasswordOnOpen` se reimponen a `false` aunque el almacén traiga otro valor (`src/background/settings.ts:217-220`).
- `devNoticeAcceptedAt` **no se puede borrar ni desplazar**: la primera aceptación fija el instante y una posterior no lo mueve (`src/background/settings.ts:253-274`).
- Etiquetas: 1..32 caracteres, sin caracteres de control; el incumplimiento responde `-32602 invalidLabel` (`src/background/settings.ts:308-336`).
- `hiddenAccounts` se sanea a enteros no negativos, sin repeticiones y ordenados (`src/background/settings.ts:165-177`).
- Un fallo de escritura devuelve `{ ok: false, error: storageQuotaExceededError() }` (`-32603`), nunca un error sin `code` (`src/background/settings.ts:244-251`).
- **Divergencia detectada:** el diccionario §2.10 no declara `schemaVersion` ni `devNoticeAcceptedAt` (`RepoTecnico/diccionario_datos.md:250-265`), pero ambos existen en el tipo y se escriben (`src/background/settings.ts:73-76`, `:224-226`, `src/background/state/migrations.ts:313`). La v1.9 del diccionario sí añadió `hiddenAccounts`, ya presente en el tipo (`src/shared/types.ts:411`).

## Reset de la cartera

### Qué borra exactamente

`resetWallet` (`src/background/state/schema.ts:618-662`) elimina **13** claves: todas las canónicas menos la preservada. La lista efectiva es `STORAGE_KEYS_CLEARED_ON_RESET`, construida por filtrado en `src/background/state/schema.ts:402-404`:

```ts
export const STORAGE_KEYS_CLEARED_ON_RESET: readonly StorageKey[] = CANONICAL_STORAGE_KEYS.filter(
  (key) => !STORAGE_KEYS_PRESERVED_ON_RESET.includes(key),
);
```

Borrado: `truekeate_mnemonic`, `truekeate_accounts`, `truekeate_imported_accounts`, `truekeate_current_account`, `truekeate_chain_id`, `truekeate_networks`, `truekeate_connected_sites`, `truekeate_pending_requests`, `truekeate_connect_request`, `truekeate_approval_window`, `truekeate_inflight_tx`, `truekeate_rate_windows` y `truekeate_settings`. El borrado se ejecuta con `removeStorage` (reintento único incluido, `src/background/state/schema.ts:653`).

### Qué conserva

**Se conserva `truekeate_logs`.** La línea que lo decide es `src/background/state/schema.ts:78`:

```ts
export const STORAGE_KEYS_PRESERVED_ON_RESET: readonly StorageKey[] = [STORAGE_KEYS.logs];
```

El corpus dice que se conservan los logs y **el código lo confirma**: `preservedKeys: STORAGE_KEYS_PRESERVED_ON_RESET` en `src/background/state/schema.ts:626` y el retorno final `removedKeys: STORAGE_KEYS_CLEARED_ON_RESET` (`:661`). Además, `resetWallet` **no escribe** en `truekeate_logs`: en H2 la observabilidad llega en H5 y el evento a instrumentar se devuelve en `logEvent` (`reset_wallet`, `src/background/state/schema.ts:406-407`, `:615-616`).

La clave **no canónica** `truekeate_logs_dropped` tampoco se borra: no está en `STORAGE_KEYS_CLEARED_ON_RESET` porque no está en `CANONICAL_STORAGE_KEYS` (`src/background/state/schema.ts:81-90`).

### Guardas y orden

Orden **estricto** declarado como dato en `RESET_GUARD_ORDER` (`src/background/state/schema.ts:460-465`): cola vacía → sin transacción en vuelo → confirmación destructiva → limpieza.

1. **Cola vacía**: `countPendingRequests` cuenta solo `status === 'pending'` (`src/background/state/schema.ts:422-429`).
2. **Sin transacción en vuelo vigente**: `countActiveInflightTx` exige `expiresAt > now` (`:436-443`).
3. **Confirmación destructiva**: sin `confirm` el resultado es `cancelled` y **no se toca ninguna clave** (`:637-640`).
4. **Limpieza**: primero plataforma —cancelación de las alarmas `truekeate_expire:*` y purga del badge— y después el almacén (`:642-661`; implementación en `defaultResetCleanup`, `:552-601`). Un fallo de plataforma no impide borrar el material sensible (`:648-651`).

Estados posibles: `done`, `blocked` (`-32000 resetBlocked` con `pendingCount`/`inflightCount` en `data`), `cancelled` y `failed` (`-32603` si el borrado no se pudo completar) (`src/background/state/schema.ts:507-522`, `:653-661`).

### Evidencia

- **Unitario:** `src/background/state/reset.spec.ts`. El caso principal comprueba literalmente «borra 13 claves, CONSERVA `truekeate_logs` y deja el estado en `done`» (`src/background/state/reset.spec.ts:120-142`), verifica que el almacén restante es exactamente `[STORAGE_KEYS.logs]` (`:134-141`) y que no queda rastro del mnemonic ni de la clave privada importada (`:144-150`). También cubre el bloqueo sin escrituras (`:182-200`), la idempotencia (`:170-178`) y el `failed` con almacén nulo (`:314-321`).
- **E2E:** `e2e/06-reset.spec.ts` (patrón `e2e/**/*.spec.ts`). Su caso «el reset enumera las importadas, borra cartera y sesiones y CONSERVA los logs (CA-RF-11 / RF-32)» siembra una cartera con importada, sesión activa y un log testigo (`e2e/06-reset.spec.ts:56-65`) y comprueba que el diálogo avisa de que «El registro de actividad (`truekeate_logs`) se conserva» (`:78`).

## Migraciones de esquema

### Versiones reales

`src/background/state/migrations.ts` declara:

- `SUPPORTED_SCHEMA_VERSIONS = ['1.2', '1.3', '1.4']` (`:45`).
- `BASE_SCHEMA_VERSION = '1.2'`: una instantánea sin versión declarada se considera v1.2 (`:48`).
- Destino: `SCHEMA_VERSION` (`'1.4'`, `src/background/state/schema.ts:30`), escrito en `truekeate_settings.schemaVersion` (`:313`).
- `RETIRED_STORAGE_KEYS = ['truekeate_pending_request']` (`:51`).
- La lectura de la versión declarada acepta la forma canónica y dos heredadas: `truekeate_settings.schemaVersion`, `schema_version` y `schemaVersion` (`readStoredSchemaVersion`, `:133-149`).

### Qué transforma cada paso

**Paso v1.2 → v1.3** (`MigrationStep` con `id: 'v1.2→v1.3'`, `:270-296`):

| Delta | Tratamiento |
|---|---|
| `truekeate_pending_request` (singular) | Se **elimina**; H-08 prohíbe alias y lectores (`:213-216`, `:275`) |
| `truekeate_connected_sites` con valor `string` | Se convierte al objeto canónico conservando la cuenta (`migrateConnectedSites`, `:151-175`) |
| `event` ausente en `truekeate_logs` | Se rellena de forma determinista desde `category` con `LEGACY_CATEGORY_TO_EVENT` (`:79-86`, `:177-192`); ninguna entrada se pierde |
| `accountLabels` en `truekeate_settings` | Se añade vacío si falta (`:289-295`) |

**Paso v1.3 → v1.4** (`id: 'v1.3→v1.4'`, `:298-315`):

| Delta | Tratamiento |
|---|---|
| Claves heredadas sin prefijo | Se **renombran** a su nombre canónico con `LEGACY_KEY_ALIASES` (`:57-77`); una clave canónica siempre gana sobre su alias (`:209-211`) |
| `truekeate_current_account` con forma heredada `"0"` | Se normaliza a `idx:0` (`:308-312`) |
| Versión del esquema | Se escribe `settingsRecord[schemaVersion] = SCHEMA_VERSION` (`:305`, `:313-314`) |

`planMigration` es **pura**: no escribe ni muta la entrada, y es idempotente —si ya está en v1.4 devuelve `alreadyCurrent: true` sin tocar nada (`:194-266`). `migrateSchema` aplica el plan: escribe las claves canónicas migradas y elimina las heredadas y las retiradas con un solo `remove` agrupado (`:347-371`).

### Cómo rechaza claves no canónicas

Una clave que no está en `STORAGE_KEYS`, no es alias heredado y no es clave retirada se **rechaza**: se informa en `report.rejectedKeys` y **no se copia** al esquema migrado (`src/background/state/migrations.ts:200-228`, `:376-386`). El principio está escrito en la cabecera: «Nunca se destruyen datos que el producto no entiende» (`:21-24`). El caso probado es `truekeate_vault` —una clave que el proyecto nunca crea (P-03)—: se informa y no se copia (`src/background/state/state.spec.ts:214-221`).

Un esquema de versión **desconocida** (por ejemplo `2.0`) **no se migra hacia atrás**: se devuelve `ok: false` con `-32603` y `reason: 'unknown-schema-version'`, y no se escribe nada (`src/background/state/migrations.ts:230-248`; prueba en `src/background/state/state.spec.ts:223-233`).

### Qué pasa si falla

- **Fallo de escritura o de borrado:** `migrateSchema` devuelve `applied/ok/migrated` a `false` y el error canónico «fallo de escritura de migración» (`migrationWriteFailedError`, `src/background/state/migrations.ts:363-370`). Nunca lanza.
- **El arranque continúa.** La fase de migración está envuelta en `try/catch` y una excepción se traduce en `{ ok: false, from: SCHEMA_VERSION, to: SCHEMA_VERSION, migrated: false }` con aviso por consola: «la migración de esquema falló; se continúa con el estado actual» (`src/background.ts:307-314`). El estado se lee tal cual está y el arranque sigue con la siembra de red, integridad, auto-carga y reconciliación (`src/background.ts:644-655`).
- El informe de la migración viaja en la entrada `sw_started` del arranque (`src/background.ts:249`, `:265-274`).

### Idempotencia y verificación

- `migrateSchema` es **idempotente**: si el esquema ya está en v1.4 devuelve `alreadyCurrent: true` sin escribir (`src/background/state/migrations.ts:250-266`, `:352-354`). Repetir el arranque no reescribe el almacén.
- `runMigrations` es el nombre con el que el arranque invoca la migración: es exactamente el mismo contrato que `migrateSchema` (`src/background/state/migrations.ts:388-392`).
- Solo se escribe cuando hay algo que escribir: `changed` es la suma de renombrados, eliminados, añadidos y reescritos de todos los pasos (`:317-323`).
- Las claves heredadas y las retiradas se eliminan **por su nombre literal** (no son `StorageKey`, precisamente por eso se migran) y el borrado se agrupa en un único `remove` sin duplicados (`:356-362`).
- Pruebas de referencia: `src/background/state/state.spec.ts` cubre la versión vigente y el rechazo de claves no canónicas (`:199-233`) y el salto v1.2 → v1.4 sin pérdida de datos (`:236-239`).

## Cuota de almacenamiento

### Medición

- Cuota objetivo declarada: `STORAGE_QUOTA_BYTES = 10_485_760` (10 MB) — la cuota por defecto de `chrome.storage.local` desde Chrome 114, que es el `minimum_chrome_version` del proyecto (`src/background/state/schema.ts:96-105`).
- Umbral de aviso: `STORAGE_QUOTA_WARN_RATIO = 0.9` (≈ 9 MB); es **estado de UI**, no se persiste ningún contador propio (`src/background/state/schema.ts:107-112`).
- Superficie de medida: `getStorageQuotaApi()` devuelve `chrome.storage.local` como `StorageQuotaLike` con `getBytesInUse` y `QUOTA_BYTES`, o `null` si no está disponible (`src/background/state/schema.ts:154-174`).
- `readStorageQuota` mide sin lanzar jamás: mide la clave o el almacén completo, calcula `usedRatio` y `warning`, y ante cualquier fallo devuelve `bytesInUse: null` (`src/background/state/schema.ts:190-223`).
- **En `sw_started`:** `writeStartupLog` llama a `getBytesInUse(null)` y publica `bytesInUse` en el `data` de la entrada, junto a `bootMs`, `schemaVersion`, el informe de migración, el resumen de integridad y los contadores de auto-carga y reconciliación (`src/background.ts:230-259`; la llamada exacta en `:231-239`).

### Modo de fallo por cuota

La detección es **única**: `isStorageQuotaError` compara el nombre y el mensaje contra `STORAGE_QUOTA_ERROR_NAMES = ['QuotaExceededError', 'QUOTA_BYTES']`, porque la API no garantiza un `instanceof` estable entre reinos (`src/background/state/schema.ts:114-151`).

`writeWithQuotaPolicy` aplica la política observable (`src/background/logging/logger.ts:436-473`):

1. Un primer `set`. Si va bien, termina.
2. Si el rechazo es por **cuota**, se aplica la retención FIFO ya calculada y se reintenta **una** vez (nunca un bucle de escritura): `diagnostics.retries += 1`.
3. Si el reintento vuelve a fallar por cuota, se **descarta** la entrada: `diagnostics.dropped += 1` y aviso por consola `[truekeate] storage quota exceeded` (`src/background/logging/logger.ts:468-472`).
4. Se intenta persistir la entrada de diagnóstico `storage_quota_exceeded` (`category: 'system'`, `level: 'error'`) con `data: { code: -32603, key: 'truekeate_logs', bytesInUse, retried, droppedEvent, droppedCount, droppedOrigin, droppedData }` (`persistQuotaDiagnostic`, `:614-655`). Lo que se reescribe es el **histórico ya persistido** más el diagnóstico: las entradas descartadas **no** se cuelan por la puerta de atrás (`:586-597`).
5. `measureStorageBytes` mide con `getBytesInUse` sin lanzar, y devuelve `null` si la API no la expone (`:658-672`).

Las claves críticas siguen la otra rama del corpus: la operación se **aborta** con `-32603 storageQuotaExceeded` y nunca se deja estado a medias (`RepoTecnico/diccionario_datos.md:483`). En el código se ve en `writeSettings` (`src/background/settings.ts:250`), en el alta de solicitudes de la cola (`src/background/approvals/queue.ts:518-521`), en el alta de cuentas (`src/background/accounts.ts:461-463`, `:602-604`) y en el alta de redes (`src/background/networks/catalog.ts:574-578`).

`writeStorage`/`removeStorage` aplican además su propio reintento genérico: dos intentos y, si persiste, `false` (`src/background/state/schema.ts:355-399`).

### Presupuesto por clave (peor caso)

El corpus fija un presupuesto orientativo por clave para justificar que el total quede muy por debajo de los 10 MB (`RepoTecnico/diccionario_datos.md:474`):

| Clave | Presupuesto declarado |
|---|---|
| `truekeate_logs` | ≤ 500 entradas (**≤ 2 MB** objetivo) |
| `truekeate_pending_requests` | ≤ 8 × 64 KiB = **512 KiB** |
| `truekeate_networks`, `truekeate_settings`, `truekeate_accounts`, `truekeate_imported_accounts`, `truekeate_connected_sites` | < 64 KiB cada una |
| `truekeate_approval_window`, `truekeate_inflight_tx`, `truekeate_rate_windows` | < 64 KiB |

No se declara `unlimitedStorage`: la política es reducir el consumo (retención FIFO de `truekeate_logs`) y hacer el desbordamiento **observable** (`src/background/state/schema.ts:96-105`). El umbral del 90 % lo evalúa `readStorageQuota` sin persistir nada (`:184-188`, `:216`).

### El contador que publica `wallet_getLogs.dropped`

- Contabilidad en memoria: `diagnostics: { dropped, retries, attempts }` (`src/background/logging/logger.ts:124-135`).
- Persistencia **solo cuando cambia** (optimización de RNF-08, DEC-74): `persistDiagnostics` compara con `persistedDiagnostics` y escribe `truekeate_logs_dropped = { dropped, retries, updatedAt }` únicamente si hay cambio (`:137-146`, `:195-225`).
- Reconstrucción al arrancar: `hydrateLogDiagnostics()` se invoca en el primer paso del `bootstrap`, para que el descarte siga siendo visible tras la suspensión del SW (`src/background.ts:641-643`; implementación en `src/background/logging/logger.ts:152-182`).
- Publicación: `readLogsView` devuelve `{ entries, truncated, dropped, trimmed }`, donde `dropped` es el contador de descartes por cuota y `truncated` es `planRetention(...).truncated || diagnostics.dropped > 0` (`src/background/logging/logger.ts:722-753`). Es lo que el método `wallet_getLogs` publica en `dropped`.
- `attempts` cuenta solo los intentos de la traza (1, o 2 con el reintento): las escrituras del contador no cuentan como reintentos (`:443-451`).

## Claves de `chrome.storage.local` NO pertenecientes al monedero

### `chrome.storage.session`

**No procede: el proyecto no usa `chrome.storage.session`.** Una búsqueda de `storage.session` en todo el árbol `*.ts` solo devuelve un comentario del doble de pruebas (`test/setup/chrome-stub.ts:47`), y la regla del corpus es explícita: el proyecto «**nunca** usa `chrome.storage.sync` ni `chrome.storage.session`» (`RepoTecnico/diccionario_datos.md:33`). El aislamiento se resuelve con `setAccessLevel('TRUSTED_CONTEXTS')` sobre `local` (`src/background/security/accessLevel.ts:64-78`), no con un segundo almacén.

### `chrome.storage.sync`

**Prohibido.** No hay ninguna escritura de `storage.sync` en `src/` (`grep -rn "storage.sync" src/` → 0 coincidencias, tal y como exige el corpus, `RepoTecnico/diccionario_datos.md:33`). El stub de pruebas ni lo implementa, a propósito (`test/setup/chrome-stub.ts:47`).

### `localStorage` y `sessionStorage`

No se usan: el SW no los tiene, y el motivo está en la cabecera de M33 (`src/background/state/schema.ts:12`). No hay coincidencias de `localStorage`/`sessionStorage` en código de producto.

### Claves que introduce el arnés E2E/Playwright

Playwright **no** añade claves propias al `chrome.storage.local` de la extensión: los fixtures escriben y leen únicamente claves canónicas del monedero a través de CDP (`e2e/fixtures/h2.ts:105-125`: `truekeate_imported_accounts`, `truekeate_settings`, `truekeate_accounts`, `truekeate_current_account`, `truekeate_mnemonic`, `truekeate_connected_sites`, `truekeate_pending_requests`, `truekeate_inflight_tx`, `truekeate_logs`; lecturas en `e2e/fixtures/extension.ts:1049`, `:1180`, `:1187`, `:1194`).

La única excepción declarada es `truekeate_schema_version`, listada como clave **volátil** del almacén en `e2e/fixtures/extension.ts:508` (`CLAVES_VOLATILES = ['truekeate_logs', 'truekeate_schema_version']`) y visible en varias evidencias JSON (`RepoTecnico/evidencia/H5/13-revocar-2026-09-12.json:18`). Como ningún módulo de `src/` la escribe (solo la cita `src/background/state/state.spec.ts:202`), su presencia se marca **pendiente de confirmar** (ver «Divergencias detectadas (globales)»).

### Resumen de claves reales con prefijo `truekeate_`

- **14 canónicas** en `STORAGE_KEYS` (`src/background/state/schema.ts:40-69`), documentadas una por una en este manual.
- **1 auxiliar escrita por el producto:** `truekeate_logs_dropped` (`src/background/state/schema.ts:90`), fuera del catálogo y fuera del reset.
- **1 declarada y no escrita:** `truekeate_schema_version` (`src/background/state/schema.ts:37`).
- Ninguna otra clave con ese prefijo se escribe desde `src/`.
