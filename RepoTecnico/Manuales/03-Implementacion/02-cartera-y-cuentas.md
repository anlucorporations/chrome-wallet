# 02 — Cartera, cuentas y ajustes

Propósito: documentar el ciclo de vida completo de la cartera de TrueKeate Wallet (creación, restauración, importación, cuentas, ajustes, validación de entrada, formato, revelado e integridad) citando el código real con `ruta:línea`; toda afirmación no verificable se marca como «pendiente de confirmar».

## Alcance y mapa de módulos

Esta sección fija el reparto de responsabilidades del subsistema y las claves de almacenamiento que gobierna, que es lo que permite leer el resto del documento sin ambigüedad.

### Módulos que intervienen

Los módulos que forman el ciclo de vida de la cartera y las cuentas son los siguientes, con su ruta real y su cometido verificado en la cabecera de cada fichero:

| Módulo | Fichero | Cometido |
| --- | --- | --- |
| M8 | `src/background/crypto/mnemonic.ts` | BIP-39 en el Service Worker: generación, palabras y checksum |
| M9 | `src/background/crypto/hd.ts` | Derivación HD de las cuentas (`m/44'/60'/0'/0/i`) |
| M10 | `src/background/crypto/importAccount.ts` | Importación de cuenta por clave privada |
| M12 | `src/background/crypto/secrets.ts` | Revelado y exportación del material de recuperación |
| M13 | `src/background/crypto/integrity.ts` | Integridad de la cartera al arrancar |
| M28 | `src/background/accounts.ts` | Cuentas: alta, etiquetas, visibilidad, activa y baja |
| M29 | `src/background/settings.ts` | `truekeate_settings`: defaults, lectura/escritura y avisos |
| M57 | `src/shared/constants.ts` | Fuente única de las constantes de build |
| M58/M59/M60/M61 | `src/shared/validation/{address,mnemonic,amount,privateKey}.ts` | Validación estructural compartida (popup + SW) |
| M62 | `src/shared/format.ts` | Formato de importes, direcciones y marcas de tiempo |
| M4.a | `src/background/rpc/internalMethods.ts` | Lista cerrada de los métodos internos `wallet_*` |

La frontera de responsabilidad es explícita y la repite cada módulo en su cabecera: la capa compartida `src/shared/**` la consume el popup y **no importa `ethers`** (RNF-14), mientras que el bundle criptográfico vive solo en el Service Worker (`src/shared/validation/address.ts:6-9`).

### Claves de `chrome.storage.local` implicadas

Los nombres canónicos de las 14 claves se declaran en `src/background/state/schema.ts:40-69`. Las que este subsistema gobierna son:

- `truekeate_mnemonic` — frase BIP-39 normalizada; puede no existir si solo hay importadas (`src/background/state/schema.ts:42`).
- `truekeate_accounts` — `string[]` de direcciones; **el índice del array ES el índice BIP-44** (`src/background/state/schema.ts:44`).
- `truekeate_imported_accounts` — `ImportedAccount[]` (dirección, clave privada, etiqueta, alta y visibilidad) (`src/background/state/schema.ts:46`).
- `truekeate_current_account` — `AccountRef` activa (`idx:<n>` | `imp:<address>`) (`src/background/state/schema.ts:48`).
- `truekeate_settings` — defaults, etiquetas y aceptación de avisos (`src/background/state/schema.ts:68`).

La versión de esquema vigente es `SCHEMA_VERSION = '1.4'` (`src/background/state/schema.ts:30`), declarada **dentro** de `truekeate_settings.schemaVersion` y no como clave propia (`src/background/settings.ts:15-16`).

#### Forma de `AccountRef`

El tipo compartido admite tres formas: `` `idx:${number}` ``, `` `imp:${Address}` `` y la forma heredada sin prefijo `` `${number}` `` (`src/shared/types.ts:40`). M28 las interpreta en `parseAccountRef` (`src/background/accounts.ts:104-126`).

#### Forma de `ImportedAccount`

El contrato persistido de una cuenta importada es `{ address, privateKey, label, importedAt, visible }` con `label` de máximo 32 caracteres (`src/shared/types.ts:428-435`).

## Creación de la cartera (onboarding)

El alta de una cartera nueva combina generación de entropía, derivación determinista y una escritura atómica del estado.

### Generación de la frase BIP-39 (M8)

`generateMnemonic` genera una frase de **12 palabras** con **128 bits** de entropía del CSPRNG y devuelve la frase ya con su checksum BIP-39 aplicado (`src/background/crypto/mnemonic.ts:120-129`). La entropía se declara explícitamente como `MNEMONIC_ENTROPY_BYTES = 16` (`src/background/crypto/mnemonic.ts:38`), es decir 16 bytes = 128 bits, que es exactamente lo que produce 12 palabras.

#### Normalización previa obligatoria de la entropía

El generador **no** pasa el resultado de `randomBytes` directamente: lo envuelve en `Uint8Array.from(...)` (`src/background/crypto/mnemonic.ts:127`). El motivo está documentado en el propio código (`src/background/crypto/mnemonic.ts:121-126`): `randomBytes` de `ethers` v6 puede devolver un `Buffer` de Node según el build que resuelva el empaquetador, y `Mnemonic.fromEntropy` lo rechaza con «invalid BytesLike value» porque su `getBytes` comprueba `value instanceof Uint8Array`. Es un defecto estructural de H2 ya cerrado.

#### Lista de palabras y checksum

La lista BIP-39 inglesa (2048 palabras) es una instancia única del Service Worker: `wordlists.en ?? LangEn.wordlist()` (`src/background/crypto/mnemonic.ts:35`). El checksum no se implementa a mano: lo aporta `Mnemonic.fromEntropy` al generar (`src/background/crypto/mnemonic.ts:128`) y `Mnemonic.isValidMnemonic` al verificar (`src/background/crypto/mnemonic.ts:95`).

`checkMnemonic` valida la frase completa en tres pasos y distingue la causa del fallo (`src/background/crypto/mnemonic.ts:74-111`): forma vía M59, pertenencia a la lista de 2048 palabras y checksum. Los dos últimos producen el **mismo** error del catálogo, `invalidMnemonicError()` (`src/background/crypto/mnemonic.ts:92` y `:101`), porque el literal es único.

`isMnemonicWord` comprueba la pertenencia con `getWordIndex(word) >= 0` dentro de un `try` (`src/background/crypto/mnemonic.ts:60-66`).

### Derivación HD (M9)

La ruta de derivación es **única y vinculante** y está confirmada como literal en el código: el prefijo `DERIVATION_PREFIX = "m/44'/60'/0'/0"` (`src/background/crypto/hd.ts:22`) y la ruta completa `m/44'/60'/0'/0/i` construida por `derivationPath(index)` (`src/background/crypto/hd.ts:35`). La cabecera del módulo lo declara como «Ruta única y vinculante» y añade que `i` es el índice del array `truekeate_accounts` (`src/background/crypto/hd.ts:6-7`).

Las funciones exportadas son: `derivationPath` (`src/background/crypto/hd.ts:35`), `isValidDerivationIndex` (`src/background/crypto/hd.ts:38-39`), `deriveAddress` (`src/background/crypto/hd.ts:56-57`), `derivePrivateKey` (`src/background/crypto/hd.ts:63-64`), `deriveAccount` (`src/background/crypto/hd.ts:67-73`), `deriveAccounts` (`src/background/crypto/hd.ts:80-97`) e `isDerivationConsistent` (`src/background/crypto/hd.ts:104-111`).

#### Cota de índice

`MAX_DERIVATION_INDEX = 0x7fffffff` (2^31-1, BIP-32 usa 31 bits sin el bit duro) (`src/background/crypto/hd.ts:25`). `isValidDerivationIndex` exige entero, `>= 0` y `<= MAX_DERIVATION_INDEX` (`src/background/crypto/hd.ts:38-39`).

#### Cero derivaciones ante una frase inválida

`hdWalletAt` devuelve `null` si la frase normalizada está vacía, si el índice no es válido o si `HDNodeWallet.fromPhrase` lanza (`src/background/crypto/hd.ts:42-53`). `deriveAccounts` devuelve **lista vacía** en cuanto una derivación falla, en lugar de entregar un resultado parcial: «NUNCA se inventan direcciones» (RNF-22) (`src/background/crypto/hd.ts:76-97`).

### Cuántas cuentas se derivan y con qué semilla de desarrollo

`DERIVED_ACCOUNTS = 5` (`src/shared/constants.ts:67`) es el número de cuentas derivadas al crear la cartera (índices 0..4); el botón «Añadir cuenta» lo incrementa y la cabecera de M9 lo confirma (`src/background/crypto/hd.ts:7-8`).

El *hint* de Anvil es `DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk'` (`src/shared/constants.ts:63-64`). La advertencia es explícita y literal en el código: es **SOLO** una pista de desarrollo (RF-12), **nunca** se persiste como cartera del usuario ni se escribe en `truekeate_logs` (`src/shared/constants.ts:59-62`).

### Persistencia del alta (M28)

`persistWalletFromMnemonic` es la función interna que escribe la cartera derivada de una frase ya validada (`src/background/accounts.ts:433-465`). Su comportamiento verificado:

1. Ejecuta todo dentro de `runSettingsRmw`, el cerrojo compartido de lectura-modificación-escritura (`src/background/accounts.ts:437`).
2. Calcula el número de cuentas con `initialAccountCount`, que hace `Math.max(1, Math.floor(settings.derivedAccountCount))` (`src/background/accounts.ts:424-425`).
3. Deriva con `deriveAccounts(mnemonic, count, 0)` y, si el número devuelto no coincide con el pedido, responde `internalError({ reason: 'derivation-failed' })` porque es un fallo interno y no de entrada (`src/background/accounts.ts:440-444`).
4. **Reinicia** `accountLabels: {}` y `hiddenAccounts: []` porque la cartera es nueva (`src/background/accounts.ts:446-451`).
5. Escribe de una vez `truekeate_mnemonic`, `truekeate_accounts`, `truekeate_current_account = idx:0` y `truekeate_settings` (`src/background/accounts.ts:452-460`).
6. Si el almacén rechaza la escritura devuelve `storageQuotaExceededError()` (`src/background/accounts.ts:461-463`).

`createWallet` genera la frase y delega la persistencia, devolviendo además `mnemonic` para que el popup la muestre **una vez**; a partir de ahí solo se obtiene por el revelado de RF-50 (`src/background/accounts.ts:467-478`).

### Flujo de UI del alta

`AccountsView.tsx` es la pestaña «Cuentas»: lista, cuenta activa, añadir, importar (frase o clave privada), renombrar y eliminar (`src/popup/views/AccountsView.tsx:3`). Importa las operaciones de `../walletState` (`src/popup/views/AccountsView.tsx:30-37`) y la validación inline del popup (`src/popup/views/AccountsView.tsx:40`).

El botón de creación vive en la sección «Cartera» (`src/popup/views/AccountsView.tsx:194-198`) y su manejador es `handleCreate` (`src/popup/views/AccountsView.tsx:105-110`), que muestra el aviso «Cartera creada: revisa «Seguridad» para guardar tu frase.» (`src/popup/views/AccountsView.tsx:106`).

#### Métodos `wallet_*` que invoca el alta

El alta **no** usa un único método: el popup pide primero la frase y después la importa. `createWallet` del popup llama a `wallet_generateMnemonic` (`src/popup/walletState.ts:182-188`, la llamada en `:183`) y reenvía el resultado a `importMnemonic`, que llama a `wallet_importMnemonic` con la frase como único parámetro (`src/popup/walletState.ts:191-196`, la llamada en `:194`). Este encadenado está descrito en el catálogo: `wallet_generateMnemonic` genera y **no persiste nada**, el popup la muestra y, si el usuario confirma, llama a `wallet_importMnemonic` (`src/background/rpc/catalog.ts:855-862`).

## Restauración / importación de frase

La restauración reutiliza el mismo camino de persistencia que el alta, pero cambia el origen de la frase y añade la verificación completa del checksum.

### Validación estructural compartida (M59)

M59 vive en `src/shared/validation/mnemonic.ts` y la consume el popup, así que **no importa `ethers` ni hace criptografía** (`src/shared/validation/mnemonic.ts:6-9`). Su fuente de verdad es de forma: 12 palabras, minúsculas y separadas por espacios simples.

- `MNEMONIC_WORD_COUNT = 12` (`src/shared/validation/mnemonic.ts:24`).
- Longitudes admitidas de palabra: `MNEMONIC_WORD_MIN_LENGTH = 3` y `MNEMONIC_WORD_MAX_LENGTH = 8` (`src/shared/validation/mnemonic.ts:27-28`).
- Patrón de palabra: `/^[a-z]+$/` (`src/shared/validation/mnemonic.ts:31`).

#### Normalización NFKD (fuente única)

`normalizeMnemonic` recorta, elimina diacríticos con NFKD, pasa a minúsculas, colapsa cualquier espacio en blanco a uno simple y vuelve a recortar (`src/shared/validation/mnemonic.ts:52-65`). El comentario explica por qué se normaliza **antes** de rechazar una palabra acentuada: para que el error sea siempre el mismo (`-32602 invalidMnemonic`) y no dependa del teclado del usuario (`src/shared/validation/mnemonic.ts:58-60`).

Es una función **determinista**: dos entradas con espacios o mayúsculas irregulares producen la misma cadena (`src/shared/validation/mnemonic.ts:50`), y `sameMnemonic` lo comprueba (`src/shared/validation/mnemonic.ts:114-115`).

M8 **reexporta** `MNEMONIC_WORD_COUNT` y `normalizeMnemonic` de M59 para no duplicar la regla (`src/background/crypto/mnemonic.ts:30-32`).

#### Qué valida la UI y qué no

`validateMnemonicShape` comprueba forma y alfabeto y devuelve un fallo tipado con `invalidMnemonicError()` en los tres casos (`src/shared/validation/mnemonic.ts:80-108`): `empty`, `wordCount` y `wordFormat`. El checksum **no** se comprueba aquí: es criptografía y vive en el Service Worker (M8) (`src/shared/validation/mnemonic.ts:77-79`).

En el popup, `validateMnemonic` es la regla de inline de la vista (`src/popup/validation.ts:47`), que también exige 12 palabras (`src/popup/validation.ts:53`); `normalizeMnemonicInput` es su normalizador (`src/popup/validation.ts:43`) y `AccountsView` lo aplica antes de enviar la frase (`src/popup/views/AccountsView.tsx:118`).

### Importación en el Service Worker (M28 + M8)

El método interno es `importWalletFromMnemonic` (`src/background/accounts.ts:484-494`) — no existe una función llamada `importMnemonic` en M8 ni en M9; la lista real de exportaciones de M8 (`generateMnemonic`, `checkMnemonic`, `isValidMnemonic`, `mnemonicFingerprint`, `mnemonicShortFingerprint`, `isMnemonicWord`, `MNEMONIC_ENTROPY_BYTES`) y de M9 está en `src/background/crypto/mnemonic.ts:38-141` y `src/background/crypto/hd.ts:22-111`.

El comportamiento verificado de `importWalletFromMnemonic`:

1. Llama a `checkMnemonic(input)`, que aplica normalización, lista y checksum (`src/background/accounts.ts:488`).
2. Si no es válida, devuelve el error del veredicto o, en su defecto, `invalidMnemonicError()` — **sin escribir nada** (`src/background/accounts.ts:489-491`).
3. Si es válida, persiste con `check.normalized`, es decir con la frase ya normalizada (`src/background/accounts.ts:492-493`).

La cabecera de la función lo resume: «normaliza espacios y mayúsculas y comprueba el checksum BIP-39. Un checksum roto responde `-32602 invalidMnemonic` sin escribir nada» (`src/background/accounts.ts:480-483`).

### Error devuelto con una frase inválida

El código real del catálogo es `-32602` con causa `invalidMnemonic`, mensaje «La frase de recuperación no es válida: revisa las 12 palabras y su checksum.» y acción «Revisar la frase» (`src/background/rpc/errors.ts:113-118`). La función que lo construye es `invalidMnemonicError()` (`src/background/rpc/errors.ts:552`).

Esto cubre **los tres** motivos (forma, palabra desconocida y checksum): M8 documenta que distingue «palabra desconocida» de «checksum inválido» para el diagnóstico, pero **ambos** se comunican con el mismo error del catálogo (`src/background/crypto/mnemonic.ts:68-73`).

## Importación por clave privada

La importación por clave privada calcula la dirección a partir del escalar y persiste una entrada propia, independiente de la derivación HD.

### Validación estructural y rango secp256k1 (M61)

M61 comprueba dos cosas sin criptografía (`src/shared/validation/privateKey.ts:6-16`): la forma `0x` + 64 hex y el rango `0 < d < n`.

- Longitud exigida del cuerpo hex: `PRIVATE_KEY_HEX_LENGTH = 64` (`src/shared/validation/privateKey.ts:24`).
- Patrón canónico: `/^0x[0-9a-fA-F]{64}$/` (`src/shared/validation/privateKey.ts:27`).
- Orden del grupo: `SECP256K1_N = BigInt(SECP256K1_N_HEX)` (`src/shared/validation/privateKey.ts:30`), con la constante declarada como `'0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'` (`src/shared/constants.ts:281-282`).
- Cota inferior: `SECP256K1_MIN = 1n` (`src/shared/validation/privateKey.ts:33`).

El comentario de la constante explica por qué puede vivir en la capa compartida: comprobar el rango es **aritmética, no criptografía**, y por eso el popup la puede usar (`src/shared/constants.ts:276-280`).

`isPrivateKeyInSecp256k1Range` exige primero la forma y después `scalar >= 1n && scalar < SECP256K1_N` (`src/shared/validation/privateKey.ts:57-64`). `validatePrivateKey` nunca lanza y describe el fallo con `invalidPrivateKeyError()` (`src/shared/validation/privateKey.ts:70-89`), cuya causa real en el catálogo es `-32602 invalidPrivateKey` con el mensaje «La clave privada no es válida: debe ser `0x` + 64 caracteres hexadecimales de la curva secp256k1.» (`src/background/rpc/errors.ts:119-125`).

#### Enmascarado para trazas

`maskPrivateKey` devuelve `0xac09…ff80` o `0x…` si la forma no es válida (`src/shared/validation/privateKey.ts:98-104`). La clave completa **nunca** se persiste en logs ni se registra (H-42) (`src/shared/validation/privateKey.ts:94-97`).

### `computeAddress` y checksum EIP-55 (M10)

`addressFromPrivateKey` valida con M61 y calcula la dirección con `computeAddress` de `ethers` v6, que es la **única** vía de cálculo (RT-02) (`src/background/crypto/importAccount.ts:37-48`). El `try/catch` descarta sin lanzar si la clave resulta fuera de rango o de longitud inesperada, porque el error tipado lo pone M28 (`src/background/crypto/importAccount.ts:44-47`).

`importPrivateKey` devuelve el candidato `{ address, privateKey }` o `null` (`src/background/crypto/importAccount.ts:55-65`). La cabecera del módulo fija que la dirección se devuelve **con checksum EIP-55**, que es la forma persistida (`src/background/crypto/importAccount.ts:6-8`).

`isPrivateKeyForAddress` contrasta clave y dirección y se usa en la verificación de integridad (M13) (`src/background/crypto/importAccount.ts:67-70`). M10 reexporta M61 para que la validación tenga una única implementación: `validatePrivateKey as checkPrivateKey` y `maskPrivateKey as maskPrivateKeyInput` (`src/background/crypto/importAccount.ts:29-31`).

### Cómo se marca una cuenta importada

`importAccountByPrivateKey` es la operación de M28 que persiste la importación (RF-05 / CU-03) (`src/background/accounts.ts:551-616`). Su contrato verificado:

1. Valida con M10; si el candidato es `null` responde `invalidPrivateKeyError()` (`src/background/accounts.ts:563-566`).
2. Detecta duplicados comparando en minúsculas contra **derivadas e importadas**: si ya existe, responde `duplicateAccountError()` (`src/background/accounts.ts:567-575`), causa real `-32602 duplicateAccount`, «Esa cuenta ya está en la cartera.» (`src/background/rpc/errors.ts:133-138`).
3. Valida la etiqueta con `validateLabel`; una etiqueta **presente** e inválida responde `invalidLabelError` con su `problem` (`src/background/accounts.ts:581-588`). El defecto cerrado en fase 4 está documentado en el propio código: antes solo se miraba `label.length > 0` y una etiqueta de 33 caracteres se persistía tal cual (`src/background/accounts.ts:576-580`).
4. Construye la entrada con `label` (proporcionada o `Importada N` por defecto), `importedAt: Date.now()` y **`visible: true`** (`src/background/accounts.ts:589-596`).
5. Escribe `truekeate_imported_accounts` y devuelve la vista con `ref` canónica `imp:<address>` (`src/background/accounts.ts:597-615`).

El campo de marcado es por tanto **`visible`** en `truekeate_imported_accounts[]` (`src/shared/types.ts:434`), y la etiqueta vive en el `label` de la propia entrada, no en `truekeate_settings` (DEC-35 / ACU-06) (`src/background/accounts.ts:15-16`).

#### Etiquetas por defecto

`defaultImportedLabel(ordinal)` produce `Importada N` (`src/background/settings.ts:342-344`) y `defaultDerivedLabel(index)` produce `Cuenta N` con `N = índice + 1` (`src/background/settings.ts:338-340`). Los prefijos son las constantes `IMPORTED_LABEL_PREFIX = 'Importada'` y `DERIVED_LABEL_PREFIX = 'Cuenta'` (`src/background/settings.ts:60-61`).

### Specs de la importación

- `src/background/crypto/importPrivateKey.spec.ts` cubre `CA-RF-05` (M10 + M61): `0x` + 64 hex **dentro del rango** de secp256k1, cálculo de la dirección con checksum EIP-55 y descarte de la clave fuera de rango; la detección de duplicados es de M28 y se prueba en `accounts.spec.ts` (`src/background/crypto/importPrivateKey.spec.ts:2-8`).
- `src/background/security/importOrder.spec.ts` es la regresión de **D-H3-C**: reproduce el orden de importación que rompía la guarda (`catalog` primero) y falla si alguien vuelve a importar `INTERNAL_METHODS` desde el catálogo en vez del módulo hoja `rpc/internalMethods` (`src/background/security/importOrder.spec.ts:2-20`).

## Modelo de cuentas (`src/background/accounts.ts`)

M28 es el módulo que gobierna las cuentas. Su cabecera enumera las cinco claves que toca: `truekeate_mnemonic`, `truekeate_accounts`, `truekeate_imported_accounts`, `truekeate_current_account` y `truekeate_settings` (`derivedAccountCount`, `accountLabels` y `hiddenAccounts`) vía M29 (`src/background/accounts.ts:6-12`).

### Tipos y referencias

- `AccountKind = 'derived' | 'imported'` (`src/background/accounts.ts:50`).
- `AccountView` es la cuenta tal y como la consume la UI: `ref`, `address`, `kind`, `index` (solo derivadas), `label`, `visible`, `importedAt`, `isCurrent` (`src/background/accounts.ts:52-64`).
- `AccountsResult<T>` es una unión discriminada que **nunca lanza** (`src/background/accounts.ts:66-67`).
- `WalletState` es la instantánea tipada del almacén (`src/background/accounts.ts:69-76`).
- `accountRefForIndex(index)` produce `idx:<n>` (`src/background/accounts.ts:88`) y `accountRefForAddress(address)` produce `imp:<address>` (`src/background/accounts.ts:91`).

#### Interpretación estricta de referencias

`parseAccountRef` acepta la forma heredada sin prefijo y la canónica `idx:`, y exige dígitos en **ambas** ramas antes de pasar por `isValidDerivationIndex` (`src/background/accounts.ts:104-126`). El defecto cerrado está documentado: antes `Number('') === 0` hacía que `'idx:'` resolviera a la cuenta 0 —revelar, renombrar o fijar «ninguna cuenta» actuaba sobre la primera— y `'9999999999'` se aceptaba sin comprobar rango (`src/background/accounts.ts:93-103`).

### Lectura del estado y saneado

`readWalletStateFromSnapshot` es una función **pura** que normaliza la instantánea (`src/background/accounts.ts:205-215`) y `readWalletState` la aplica sobre `readStorage` de las cinco claves (`src/background/accounts.ts:218-232`). `walletExists` decide el estado inicial del popup: hay cartera si hay frase, cuentas derivadas o cuentas importadas (`src/background/accounts.ts:235-236`).

#### Fallo cerrado ante una lista con huecos

`sanitizeAccounts` **no** compacta: si alguna entrada no tiene forma de dirección, devuelve la lista entera como `[]` (`src/background/accounts.ts:163-176`). El motivo es que el índice del array ES el índice BIP-44, y compactar haría que `wallet_revealSecret('idx:2')` entregara la clave privada de otra cuenta etiquetada con la dirección mostrada (`src/background/accounts.ts:151-162`). Sin cuentas, toda referencia `idx:` responde `-32602 unknownAccount` en lugar de revelar la clave de otra cuenta (`src/background/accounts.ts:160-161`).

`sanitizeImportedAccounts` es más tolerante entrada a entrada: descarta las que no tienen dirección válida o `privateKey` de tipo cadena, y normaliza `label`, `importedAt` y `visible` (`visible: record.visible !== false`) (`src/background/accounts.ts:179-202`).

### Vistas de cuenta y visibilidad

`buildAccountViews` es una función **pura** (`src/background/accounts.ts:248-276`). El orden es el de `truekeate_accounts` (índice BIP-44) y **después** las importadas por orden de alta (`:275`). Las ocultas se incluyen con `visible: false`; quien decide si se pintan es `visibleAccounts` (`src/background/accounts.ts:278-280`).

- Derivadas: `label` de `labelForDerivedAccount(state.settings, index)` y `visible: !state.settings.hiddenAccounts.includes(index)` (`src/background/accounts.ts:253-262`).
- Importadas: `label` de la entrada o `defaultImportedLabel(ordinal + 1)` si está vacía, y `visible: entry.visible` (`src/background/accounts.ts:264-273`).

### Clave persistida de cada cosa

| Concepto | Dónde se persiste | Referencia |
| --- | --- | --- |
| Frase semilla | `truekeate_mnemonic` (cadena normalizada) | `src/background/accounts.ts:454`, `src/background/state/schema.ts:42` |
| Cuentas derivadas | `truekeate_accounts` (`string[]`, índice = BIP-44) | `src/background/accounts.ts:455`, `src/background/state/schema.ts:44` |
| Cuentas importadas | `truekeate_imported_accounts` (entrada con `privateKey`) | `src/background/accounts.ts:599`, `src/background/state/schema.ts:46` |
| Cuenta activa | `truekeate_current_account` (`idx:<n>` \| `imp:<address>`) | `src/background/accounts.ts:456`, `src/background/state/schema.ts:48` |
| Etiqueta de derivada | `truekeate_settings.accountLabels[índice]` | `src/background/accounts.ts:648`, `src/background/settings.ts:150-163` |
| Etiqueta de importada | `truekeate_imported_accounts[].label` | `src/background/accounts.ts:655-659` |
| Visibilidad de derivada | `truekeate_settings.hiddenAccounts[]` (índices) | `src/background/accounts.ts:693-702`, `src/background/settings.ts:28-32` |
| Visibilidad de importada | `truekeate_imported_accounts[].visible` | `src/background/accounts.ts:707-709` |
| Nº de derivadas | `truekeate_settings.derivedAccountCount` | `src/background/accounts.ts:520-523`, `src/background/settings.ts:80` |

### Alta de una cuenta derivada

`deriveNextAccount` deriva la **siguiente** cuenta, con índice igual a la longitud actual de `truekeate_accounts`, la persiste y amplía `derivedAccountCount` (`src/background/accounts.ts:500-545`). Es idempotente frente a reintentos: si el índice ya existe, no vuelve a escribir (`src/background/accounts.ts:501-503`).

Sin semilla no se deriva: responde `walletNotCreatedError({ reason: 'wallet-not-created' })` (`src/background/accounts.ts:510-513`), causa real `-32000 walletNotCreated`, «Todavía no hay ninguna cartera: no se puede derivar ninguna cuenta.» (`src/background/rpc/errors.ts:225-230`). Si la derivación falla, responde `internalError({ reason: 'derivation-failed', index })` (`src/background/accounts.ts:516-518`).

### Baja de cuenta

La baja de una importada es `removeImportedAccount` (`src/background/accounts.ts:741-792`) y aplica tres guardas **en este orden** (`src/background/accounts.ts:730-740`):

1. La referencia debe apuntar a una importada existente; si no, `unknownAccountError` o `invalidAddressError` (`src/background/accounts.ts:748-756`).
2. Si una dApp tiene sesión **vigente** sobre esa dirección, responde `-32000 accountInUseByDapp` y `truekeate_imported_accounts` queda intacto (R-09a / DEC-45) (`src/background/accounts.ts:757-765`).
3. Si la cuenta eliminada era la activa, la activa pasa a `idx:0` cuando existe, o a la primera importada restante (`src/background/accounts.ts:769-781`).

Las cuentas derivadas **no** se pueden eliminar por esta vía: solo se ocultan (`src/background/accounts.ts:739`; `RF-06 / DEC-45` en `src/background/accounts.ts:17-18`). Mostrar una derivada oculta devuelve **la misma dirección** (`CA-RF-06`) (`src/background/accounts.ts:676-680`).

#### Guarda de sesión de dApp

`activeDappOriginFor` considera vigente una sesión si existe, no está marcada como desconectada (`connected === false`) y no ha vencido (`expiresAt === null` = sin caducidad) (`src/background/accounts.ts:297-330`). `accountInUseError` es la guarda que **comparten** el revelado (M12) y la baja de una importada (M28) (`src/background/accounts.ts:363-375`). La causa real es `-32000 accountInUseByDapp` (`src/background/rpc/errors.ts:163-169`).

### Etiquetas

`renameAccount` escribe `accountLabels[índice]` en las derivadas y `label` en las importadas (DEC-35) (`src/background/accounts.ts:622-674`). Una etiqueta fuera de 1..32 caracteres responde `-32602 invalidLabel` (`src/background/accounts.ts:624-626`; causa en `src/background/rpc/errors.ts:241-247`).

`MAX_LABEL_LENGTH = 32` (`src/shared/constants.ts:254`) es la misma cota para derivadas e importadas y M29 la reexporta (`src/background/settings.ts:56-57`).

### Cuenta activa

`getCurrentAccountRef` devuelve la referencia guardada si sigue existiendo y, si no, **la primera cuenta disponible** (`src/background/accounts.ts:381-401`). `getCurrentAddress` resuelve la dirección de esa referencia (`src/background/accounts.ts:403-410`) y `addressForRef` es la resolución dentro de un estado ya leído (`src/background/accounts.ts:131-145`).

`setCurrentAccount` canonicaliza la referencia y responde `unknownAccountError` si no apunta a ninguna cuenta existente (`src/background/accounts.ts:798-825`).

### Diferencia entre cuenta derivada, importada y visible

- **Cuenta derivada**: su dirección se calcula de la frase con `m/44'/60'/0'/0/i`; vive en `truekeate_accounts` y **su índice en el array es su índice BIP-44** (`src/background/state/schema.ts:43-44`). No se elimina: solo se oculta (`src/background/accounts.ts:17-18`). Su etiqueta va a `accountLabels[índice]`.
- **Cuenta importada**: su clave privada se guarda como material propio en `truekeate_imported_accounts[]` y **no** se puede volver a derivar de la frase (`src/shared/types.ts:428-435`). Es la única que se puede **eliminar**, y con la guarda de sesión de dApp (`src/background/accounts.ts:730-740`). Su etiqueta va en su propio `label`.
- **Cuenta visible**: no es un tercer tipo de cuenta, es una **bandera**. En las derivadas la gobierna `truekeate_settings.hiddenAccounts` (se oculta por índice) (`src/background/settings.ts:17-23`); en las importadas, el campo `visible` de su entrada (`src/background/accounts.ts:266-273`). `visibleAccounts` filtra por esa bandera y es lo que pinta el popup (`src/background/accounts.ts:278-280`).

### Proyección para la UI

`getWalletStateView` es la proyección del contrato `wallet_getState`: presencia de cartera, cuentas (incluidas las **ocultas**, con su bandera `visible`), cuenta activa y ajustes, de modo que el popup deja de leer el almacén (RNF-14) (`src/background/accounts.ts:902-922`). No duplica reglas: reutiliza `getAccountsSnapshot` (`src/background/accounts.ts:827-850`), y evita depender de `crypto/integrity` para no crear un ciclo de importaciones (`src/background/accounts.ts:906-910`). `asWalletStateAccount` renombra el campo de la cuenta activa a `current` porque así lo fija el contrato (§5.1.1) (`src/background/accounts.ts:856-900`).

## Ajustes (`src/background/settings.ts`)

M29 gobierna `truekeate_settings`: defaults, lectura/escritura tipada, etiquetas y aceptación de avisos (`src/background/settings.ts:1-4`).

### Campos reales y valores por defecto

`StoredSettings` es el contrato compartido `TruekeateSettings` más el campo `schemaVersion` (`src/background/settings.ts:73-76`). Los defaults se declaran en `DEFAULT_SETTINGS` (`src/background/settings.ts:78-95`):

| Campo | Valor por defecto | Fuente de la constante |
| --- | --- | --- |
| `derivedAccountCount` | `DERIVED_ACCOUNTS` = 5 | `src/shared/constants.ts:67` |
| `accountLabels` | `{}` | `src/background/settings.ts:81` |
| `balancePollMs` | `BALANCE_POLL_MS` = 5000 | `src/shared/constants.ts:110` |
| `balancePollMaxAccounts` | `BALANCE_POLL_MAX_ACCOUNTS` = 10 | `src/shared/constants.ts:113` |
| `logLimit` | `logLimit` = 500 | `src/shared/constants.ts:154` |
| `logMaxPerOrigin` | `logMaxPerOrigin` = 200 | `src/shared/constants.ts:155` |
| `sessionTtlMs` | `SESSION_TTL_MS` = 86400000 (24 h) | `src/shared/constants.ts:104` |
| `pendingRequestsMax` | 8 | `src/shared/constants.ts:162` |
| `pendingRequestsMaxPerOrigin` | 1 | `src/shared/constants.ts:166` |
| `pendingRequestsPerMinute` | 6 | `src/shared/constants.ts:170` |
| `language` | `'es'` | `src/background/settings.ts:90` |
| `encryptionEnabled` | `false` **forzado** | P-03, `src/background/settings.ts:91` |
| `requirePasswordOnOpen` | `false` **forzado** | P-03, `src/background/settings.ts:92` |
| `schemaVersion` | `SCHEMA_VERSION` = `'1.4'` | `src/background/state/schema.ts:30` |
| `hiddenAccounts` | `[]` | `src/background/settings.ts:94` |

El contrato compartido declara los mismos campos más `devNoticeAcceptedAt?` (`src/shared/types.ts:402-425`). `hiddenAccounts` es clave canónica del objeto, junto a `accountLabels` (`src/shared/types.ts:406-411`).

#### Invariantes de P-03

`encryptionEnabled` es **siempre** `false` y `requirePasswordOnOpen` **siempre** `false`: se conservan por compatibilidad y el módulo los fuerza aunque el almacén traiga otro valor (`src/background/settings.ts:6-9`, aplicado en `:218-220`).

### Lectura y escritura tipada

- `sanitizeSettings` combina lo persistido con los defaults **sin confiar en la forma almacenada** (`src/background/settings.ts:179-228`). Combina los ajustes persistidos y fuerza las invariantes.
- `readSettingsFromSnapshot` es la versión pura para pruebas (`src/background/settings.ts:230-232`).
- `getSettings` **nunca lanza**: ante un fallo devuelve los defaults (`src/background/settings.ts:234-237`).
- `writeSettings` sanea y escribe; si el almacén la rechaza devuelve `-32603 storageQuotaExceeded` (`src/background/settings.ts:243-251`).
- `updateSettings` aplica un parche bajo el cerrojo (`src/background/settings.ts:253-274`).

#### Cerrojo compartido con M28

`settingsWriteLock` es un cerrojo único creado por encadenamiento de promesas, sin `setTimeout`, apto para el Service Worker (`src/background/settings.ts:106-132`). `runSettingsRmw` lo expone (`src/background/settings.ts:134-135`) y es el que usan **todas** las operaciones de M28 para que dos modificaciones concurrentes no se pisen (`src/background/settings.ts:127-131`).

#### Saneado de `hiddenAccounts` y `accountLabels`

`sanitizeHiddenAccounts` acepta solo enteros no negativos, elimina repeticiones y **ordena** (`src/background/settings.ts:165-177`). `sanitizeAccountLabels` acepta claves de índice y valores de texto no vacío (`src/background/settings.ts:149-163`).

### Etiquetas: validación y prefijos

`validateLabel` exige 1..32 caracteres y rechaza caracteres de control (`/[\u0000-\u001f\u007f]/`), devolviendo `invalidLabelError` con el `problem` correspondiente (`src/background/settings.ts:316-336`). Los `LabelProblem` posibles son `'empty' | 'tooLong' | 'control'` (`src/background/settings.ts:293-294`).

`normalizeLabel` recorta y colapsa espacios internos y **no** recorta a 32 caracteres, porque eso «sería aceptar en silencio algo que el usuario no pidió» (`src/background/settings.ts:308-314`). `labelForDerivedAccount` devuelve la guardada o `Cuenta N` (`src/background/settings.ts:346-348`).

### Aceptación de avisos (RNF-23)

El flag es `devNoticeAcceptedAt?: number` (`src/shared/types.ts:424`), registrado por `sanitizeSettings` solo si es un instante finito y positivo (`src/background/settings.ts:224-226`).

La regla dura: **el aviso del primer arranque no es descartable**. `updateSettings` garantiza que `devNoticeAcceptedAt` no se puede borrar ni desplazar, y que la aceptación es idempotente —la **primera** fija el instante y una aceptación posterior no lo mueve— (`src/background/settings.ts:253-274`, con el comentario en `:255-257`).

- `isDevNoticeAccepted` comprueba el flag (`src/background/settings.ts:276-278`).
- `acceptDevNotice` lo registra y conserva el instante más antiguo (`src/background/settings.ts:280-287`).
- El método interno es `wallet_acceptDevNotice` (`src/background/rpc/internalMethods.ts:45`), cuya entrada declara la sección como «aviso no descartable» (`src/background/rpc/catalog.ts:61`); el manejador devuelve `devNoticeAcceptedAt` (`src/background/rpc/catalog.ts:1181-1191`).
- En el popup lo consume `App.tsx`: la fase pasa a `'notice'` si `devNoticeAcceptedAt === undefined` y a `'ready'` en caso contrario (`src/popup/App.tsx:118`, `:135`), y el botón de aceptación llama a `acceptDevNotice()` (`src/popup/App.tsx:151`).

### Avisos de red: `NON_TESTNET_WARNING` y `ADD_CHAIN_ACTIVATION_NOTE`

Ambos textos viven en M57 porque el hecho que los dispara lo resuelve otro módulo:

- `NON_TESTNET_WARNING` (**RNF-23**, tarea 5.3): «Atención: no es una red de pruebas. Las operaciones se firman contra una red real y pueden comprometer fondos reales.» (`src/shared/constants.ts:47-49`). El propietario del dato es el Service Worker, que lo publica en `NetworkPreview.warning`; el texto vive en M57 porque el hecho que lo dispara (`isTestnet`) lo resuelve M23 (`src/shared/constants.ts:41-46`).
- `ADD_CHAIN_ACTIVATION_NOTE` (**ADT-25 / P-22**): «La red se añadirá a la lista, pero seguirás en la red actual: para usarla tendrás que cambiarla con una solicitud aparte.» (`src/shared/constants.ts:55-57`).

#### Dónde se consumen

- `NON_TESTNET_WARNING` se publica en la vista previa: `warning: network.isTestnet ? null : NON_TESTNET_WARNING` (`src/background/networks/addChain.ts:185`). En la UI de redes, `NetworksView.tsx` lo pinta en tres puntos (`src/popup/views/NetworksView.tsx:34`, `:393`, `:499`).
- `ADD_CHAIN_ACTIVATION_NOTE` viaja como `activationNote` en la vista previa del alta (`src/background/networks/addChain.ts:220`) y se muestra en la vista de redes (`src/popup/views/NetworksView.tsx:426`).

## Validación de entrada compartida

Los cuatro validadores viven en `src/shared/validation/**` y los consume el popup, así que **ninguno importa `ethers`**: la criptografía de verificación es del Service Worker (`src/shared/validation/address.ts:6-9`, `src/shared/validation/mnemonic.ts:6-8`, `src/shared/validation/amount.ts:6-9`, `src/shared/validation/privateKey.ts:6-7`).

### Dirección (M58)

- `ADDRESS_HEX_LENGTH = 40` (`src/shared/validation/address.ts:26`) y patrón `/^0x[0-9a-fA-F]{40}$/` (`src/shared/validation/address.ts:29`).
- `addressCaseStyle` clasifica la entrada en `'lowercase' | 'uppercase' | 'mixed'` (`src/shared/validation/address.ts:56-67`).
- `validateAddress` devuelve un `AddressCheck` con `address`, `caseStyle` y **`checksumVerified: false` siempre** (`src/shared/validation/address.ts:73-92`).

#### Por qué el checksum EIP-55 no se verifica aquí

EIP-55 exige `keccak256`, así que la verificación criptográfica es del Service Worker: M10 al importar, M13 al arrancar y el propio `eth_sendTransaction` (`src/shared/validation/address.ts:15-19`). El veredicto autoritativo es siempre el del SW; esta validación evita enviar una operación con una dirección manifiestamente malformada (`CA-RF-33`) (`src/shared/validation/address.ts:17-19`). El campo `checksumVerified` se expone para que la UI no dé por buena una dirección mixta sin advertirlo (`src/shared/validation/address.ts:41-46`).

El error es `invalidAddressError()`, causa real `-32602 invalidAddress`, «La dirección no es válida: revisa el formato `0x` + 40 caracteres hexadecimales.» (`src/background/rpc/errors.ts:126-131`, función en `:558`). `addressesEqual` compara sin distinguir mayúsculas (`src/shared/validation/address.ts:104-105`).

### Importe ETH (M60)

- Forma aceptada: `/^\d+(?:\.\d+)?$/` — dígitos con **punto** decimal, sin signo, sin notación científica y sin separador de millares (`src/shared/validation/amount.ts:32-33`).
- Cota de decimales aceptados: `ETH_AMOUNT_MAX_DECIMALS = 4` (`src/shared/constants.ts:264`), con el corpus fijando ETH a 4 decimales (RF-34/M60) y la cota parametrizable para no cerrar la puerta a más precisión (`src/shared/constants.ts:259-263`).
- Escala de wei: `ETH_DECIMALS = 18` (`src/shared/constants.ts:267`), usada como base del paso de ETH a wei (`src/shared/validation/amount.ts:80-82`).
- Cota del EVM: `MAX_UINT256 = (1n << 256n) - 1n` (`src/shared/validation/amount.ts:30`).

`ethToWei` convierte con aritmética `bigint` exacta, sin coma flotante —un `Number` perdería precisión a partir de 2^53 wei— (`src/shared/validation/amount.ts:6-9`). El truncado por debajo de 18 decimales es deliberado y está documentado como defecto corregido: `padEnd` no recortaba y `BigInt` reinterpretaba la fracción como una magnitud mayor (`src/shared/validation/amount.ts:74-80`).

`validateAmount` devuelve un `AmountCheck` con `wei` exacto en cadena decimal y `normalized` canónico sin ceros sobrantes (`src/shared/validation/amount.ts:94-131`). Los `AmountProblem` son `'empty' | 'format' | 'decimals' | 'overflow'` (`src/shared/validation/amount.ts:36`).

#### Comprobación de decimales y de saldo suficiente

El fallo por decimales se produce cuando `fraction.length > maxDecimals` (`src/shared/validation/amount.ts:116-119`), es decir con 5 decimales y la cota de 4.

El contraste con el saldo es una comparación exacta en wei: `compareWei` (`src/shared/validation/amount.ts:141-149`), `hasSufficientBalance` (`src/shared/validation/amount.ts:151-155`) e `insufficientBalanceError`, que devuelve la causa `-32000 insufficientFunds` solo cuando el saldo **no** cubre el importe (`src/shared/validation/amount.ts:157-166`; causa real en `src/background/rpc/errors.ts:145-150`).

#### Error tipado del importe

El fallo de formato se describe con el error **tipado** `-32602 invalidAmount` (`EXTENDED_ERROR_CATALOG` de M6), con `data.problem` como diagnóstico interno (`src/shared/validation/amount.ts:15-23`, aplicado en `:100-108`). El importe se normaliza con `canonicalizeAmount` (`src/shared/validation/amount.ts:86-92`).

### Clave privada (M61)

Ya documentada en la sección de importación: forma (`src/shared/validation/privateKey.ts:53-54`), rango (`:57-64`) y veredicto tipado (`:70-89`). Sus helpers booleanos son `isPrivateKeyShape` (`:53`) e `isValidPrivateKey` (`:92`).

### Spec que cubre los cuatro

`src/shared/validation/validation.spec.ts` cubre `CA-RF-33` (validación inline de los cuatro formularios: frase, dirección, importe y clave privada) con magnitudes concretas: cada fallo se describe con su `problem` y su error del catálogo (`-32602`), y cada acierto con el valor normalizado exacto (`src/shared/validation/validation.spec.ts:1-13`).

## Formato de presentación (`src/shared/format.ts`)

M62 formatea importes, direcciones y marcas de tiempo para **toda** la UI (M62, §5.2; RF-34) y **no** importa `ethers` (RNF-14) (`src/shared/format.ts:1-17`).

### `formatEthWithSymbol` y la familia de importes

`formatEthWithSymbol` devuelve el importe con su símbolo, con el símbolo por defecto de la red Anvil: `${formatEthEs(value, decimals)} ${symbol}` (`src/shared/format.ts:55-60`), es decir `1,0000 ETH`.

Se apoya en dos funciones:

- `formatEth` trunca (nunca redondea hacia arriba: la UI no debe mostrar más saldo del que existe) y usa **punto** decimal (`src/shared/format.ts:39-49`).
- `formatEthEs` es igual pero con **coma** decimal, para la UI en español (`CA-RT-10`) (`src/shared/format.ts:51-53`).

`ETH_DISPLAY_DECIMALS = 4` (`src/shared/constants.ts:257`) es el valor por defecto de ambas. Ningún formato usa separador de millares ni notación científica, para que el valor se pueda copiar sin ambigüedad (`src/shared/format.ts:7-9`).

### Recorte de direcciones y hashes

`shortHex` recorta a `0x1234…abcd`: prefijo de 6 caracteres (incluye el `0x`), elipsis y sufijo de 4; si la entrada es más corta que el recorte, se devuelve tal cual (`src/shared/format.ts:62-76`). Las funciones reales de recorte son `formatAddress` (`src/shared/format.ts:78-79`, RF-34) y `formatTxHash`, con el mismo criterio (`src/shared/format.ts:81-82`).

Las constantes son `ADDRESS_SHORT_PREFIX = 6` y `ADDRESS_SHORT_SUFFIX = 4` (`src/shared/constants.ts:270-271`) y `SHORT_ELLIPSIS = '…'`, el carácter U+2026 y **no** tres puntos (`src/shared/constants.ts:273-274`).

### Marcas de tiempo y utilidades

`formatTimestamp` produce `dd/mm/aaaa hh:mm:ss` en formato español determinista, implementado a mano y no con `Intl` para que la salida sea idéntica en el popup, en los logs y en las pruebas (`src/shared/format.ts:84-101`). `formatWordCount` alimenta la etiqueta `12/12 palabras` de la UI (`src/shared/format.ts:103-104`) y `pluralize` produce `1 cuenta` / `3 cuentas` (`src/shared/format.ts:106-108`).

## Revelado y exportación del material de recuperación

M12 implementa RF-50 en `src/background/crypto/secrets.ts` con la higiene de P-20 y la guarda de sesión de dApp activa (R-09a / DEC-45) (`src/background/crypto/secrets.ts:1-4`).

### Contrato del revelado y sus cuatro reglas

Las reglas están enumeradas en la cabecera del módulo (`src/background/crypto/secrets.ts:9-22`):

1. **Confirmación explícita obligatoria**: sin `confirmed: true` no se entrega nada (`4001`).
2. **Solo contextos de confianza**: contexto de la extensión **y** ruta en la allowlist (`index.html`); cualquier otro responde `4200`. La frontera es el **origen**, no `sender.tab`.
3. **Guarda `-32000`** de sesión vigente en `truekeate_connected_sites`.
4. **Higiene del revelado**: oculto por defecto, plazo de 30 s, ocultado también por pérdida de foco, descarte del valor y borrado del portapapeles.

`resolveSecret` aplica las tres guardas **en ese orden**: contexto (`src/background/crypto/secrets.ts:136-139`), confirmación (`:140-143`) y sesión de dApp (`:150-158` para la frase, `:185-188` para la clave privada).

- Sin confirmación responde `userRejectedError({ reason: 'reveal-not-confirmed' })` (`src/background/crypto/secrets.ts:141-143`).
- La allowlist es solo el popup: `REVEAL_ALLOWED_ROUTES = [EXTENSION_ROUTE_POPUP]` (`src/background/crypto/secrets.ts:100-101`); `canRevealInContext` exige contexto de extensión, ruta no nula y pertenencia a la allowlist (`:116-119`).

#### `REVEAL_HIDE_MS = 30000`

`SECRET_HIDE_MS = REVEAL_HIDE_MS` (`src/background/crypto/secrets.ts:45-46`) y la constante vale 30 s, inyectable por `VITE_REVEAL_HIDE_MS` solo para el arnés E2E conservando el valor de producción por defecto (`src/shared/constants.ts:100-101`, con la nota en `:11-13`).

El secreto devuelto incluye la ventana temporal calculada: `hideAt: revealedAt + SECRET_HIDE_MS` y `hideAfterMs: SECRET_HIDE_MS` (`src/background/crypto/secrets.ts:159-170` para el mnemonic y `:202-213` para la clave privada).

### Ocultado por temporizador y por pérdida de foco

`createRevealSession` implementa los **dos** disparadores y es **idempotente**: el primer disparador gana y los siguientes son un no-op (`null`) (`src/background/crypto/secrets.ts:336-345`, comprobación en `:380-383`).

- **Temporizador**: se arma al crear la sesión con `setTimer(..., secret.hideAfterMs)` salvo que `autoStart === false`, e invoca `hide('timer')` (`src/background/crypto/secrets.ts:423-427`).
- **Pérdida de foco**: `hideOnFocusLoss()` es el atajo del disparador `blur` / `visibilitychange` y llama a `hide('focus-loss')` (`src/background/crypto/secrets.ts:330-331`, `:411`).

Los motivos posibles son `HideReason = 'timer' | 'focus-loss' | 'manual' | 'closed'` (`src/background/crypto/secrets.ts:54-55`).

### Descarte del estado

Al ocultar, el valor se anula **antes** de tocar el portapapeles, usando la copia local de la clausura, que es la última que existe (`src/background/crypto/secrets.ts:384-392`). Después, `read()` devuelve `null` porque el valor ya no está (`:363`) y `dispose()` cancela el temporizador y descarta el valor **sin** tocar el portapapeles, para el desmontaje (`:412-420`).

### Borrado del portapapeles al ocultar

`CLIPBOARD_CLEAR_ON_HIDE = true` (`src/shared/constants.ts:251`) es la política activa, expuesta como `CLIPBOARD_POLICY_ENABLED` (`src/background/crypto/secrets.ts:48-49`).

`clearClipboardIfContains` **nunca destruye contenido ajeno**: solo sobrescribe con cadena vacía cuando el texto leído **coincide** con el valor revelado (`src/background/crypto/secrets.ts:259-286`, comparación en `:273-276`). Si la lectura falla, aplica el borrado incondicional de respaldo y lo informa (`:278-285`). Los desenlaces posibles son `'cleared' | 'not-present' | 'unconditional' | 'unavailable'` (`src/background/crypto/secrets.ts:227-236`) y el informe `warn` marca cuándo hay que avisar al usuario: «nunca en silencio» (`:238-243`).

La comparación se hace contra la copia local del valor revelado; la desviación declarada respecto a §3.10 sustituye el campo de UI `clipboardHash` por esa comparación directa, que es lo que exige §3.8 regla 5 y evita introducir criptografía en la capa de UI (`src/background/crypto/secrets.ts:32-34`).

### Exportación y el hecho de que el material NUNCA viaja por `postMessage`

La exportación de la clave privada de una cuenta concreta resuelve el valor según el tipo de cuenta: para una **derivada** usa `derivePrivateKey(state.mnemonic, parsed.index)` y para una **importada** lee su `privateKey` persistida (`src/background/crypto/secrets.ts:190-198`). Si el valor no está disponible responde `internalError({ reason: 'secret-unavailable', accountRef })` (`:199-201`).

La frontera de seguridad es explícita en el código: **el valor jamás viaja por `window.postMessage`** (RNF-09); el canal es el mensaje interno del protocolo (`src/background/crypto/secrets.ts:14-16`). El router añade defensa en profundidad: `wallet_revealSecret` desde un contexto no confiable responde `methodNotAllowedInContextError()` (`src/background/rpc/router.ts:573-576`).

#### Nota de empaquetado (RNF-14)

Este módulo resuelve el secreto con `ethers` (M9/M10), así que **el popup no debe importarlo**: arrastraría el paquete de `ethers` al bundle de la UI. La vista de seguridad consume el revelado por `TRUEKEATE_RPC` con `wallet_revealSecret` y reproduce el **mecanismo** de ocultado con las constantes de M57 (`src/background/crypto/secrets.ts:24-30`).

### La vista de seguridad (M46)

`src/popup/views/SecurityView.tsx` es la pestaña «Seguridad»: revelado/exportación (RF-50) y reset destructivo (RF-11) (`src/popup/views/SecurityView.tsx:1-3`). Implementa, una por una, las siete reglas de higiene (`src/popup/views/SecurityView.tsx:6-22`):

1. Aceptación previa y explícita: sin aceptar el diálogo no se pide nada al SW.
2. Oculto por defecto: el nodo del DOM **no existe** cuando está oculto (no se oculta con CSS).
3. Plazo único de 30 s leído de `shared/constants` (`src/popup/views/SecurityView.tsx:36`), con cuenta atrás y barra de progreso que se vacía (`:402-404`) y botón «Ocultar ahora» (`:463`).
4. Doble disparador: temporizador **o** pérdida de foco (`window.blur` y `visibilitychange` con `document.hidden`); recuperar el foco **no** vuelve a mostrarlo (`:274-293`).
5. Descarte al ocultar y sobrescritura con cadena vacía solo si el portapapeles sigue conteniendo el valor (`:150-203`).
6. Nunca por `window.postMessage`.
7. Aviso de captura durante el revelado.

El revelado envía `confirmed: true` y solo se invoca desde `DialogoDecision.onAfirmar`, es decir tras la aceptación del usuario; sin ese campo M12 y el catálogo responden `4001` y el revelado no llega a producirse (`src/popup/views/SecurityView.tsx:303-322`, llamada en `:319-321`).

#### Los tres specs de la higiene

- `secretsExport.spec.ts` cubre `CA-RF-50` en su parte de servicio: confirmación explícita obligatoria, contexto de confianza, plazo de 30 s y guarda `-32000` de sesión activa (R-09a / DEC-45) (`src/background/crypto/secretsExport.spec.ts:2-7`).
- `revealHygiene.spec.ts` cubre lo que el módulo garantiza por sí mismo: el plazo de 30 s con temporizador inyectable, la pérdida de foco, el **descarte de memoria** (`read()` pasa a `null`) y que el valor **nunca** viaja por `window.postMessage` ni por `chrome.runtime.sendMessage` (`src/background/crypto/revealHygiene.spec.ts:5-9`).
- `revealClipboard.spec.ts` cubre el criterio «fuga por el portapapeles» de §3.2.8: al ocultarse, si el portapapeles todavía contiene el valor se sobrescribe con cadena vacía; si no lo contiene, **no** se destruye contenido ajeno (`src/background/crypto/revealClipboard.spec.ts:5-8`).

## Integridad (`src/background/crypto/integrity.ts`)

M13 comprueba la integridad de la cartera al arrancar (RNF-22) (`src/background/crypto/integrity.ts:1-3`).

### Qué comprueba

`inspectWalletIntegrity` es una función **pura**: no escribe nada y no deriva nada (`src/background/crypto/integrity.ts:112-115`). Comprueba:

1. **La frase**: si está presente, `checkMnemonic`; un fallo produce el aviso `mnemonic-checksum` o `mnemonic-shape` con su mensaje en español (`src/background/crypto/integrity.ts:125-138`).
2. **Las direcciones derivadas**, una por índice: forma (`address-shape`) y checksum EIP-55 (`address-checksum`) (`src/background/crypto/integrity.ts:151-170`).
3. **Las cuentas importadas**: forma, checksum, presencia de una clave utilizable y contraste clave ↔ dirección, ambos como `imported-key-mismatch` (`src/background/crypto/integrity.ts:172-211`).
4. **La cuenta activa**: si la referencia guardada ya no existe, aviso `current-account-missing` (`src/background/crypto/integrity.ts:213-233`).

Los códigos posibles son `'mnemonic-shape' | 'mnemonic-checksum' | 'address-shape' | 'address-checksum' | 'imported-key-mismatch' | 'current-account-missing'` (`src/background/crypto/integrity.ts:36-43`).

#### La única criptografía es de verificación

`isChecksummedAddress` verifica con `getAddress(address) === address`, es decir que la dirección sea exactamente su forma canónica EIP-55 (`src/background/crypto/integrity.ts:74-88`). Una dirección en un solo caso no puede verificarse (no lleva checksum) y se considera válida en forma, pero solo se acepta como persistida si `getAddress` la devuelve idéntica, que es el caso de todo lo que escribe el SW (`:74-78`).

#### Huecos conservados a propósito

`readAddressList` **conserva las posiciones**: un hueco se representa con la cadena vacía en lugar de eliminarse (`src/background/crypto/integrity.ts:94-110`). El defecto cerrado está documentado: al filtrar, el informe decía `status: 'ok'` y los índices de los avisos se desplazaban, con el riesgo de entregar la clave privada de otra cuenta (`:96-106`).

### Cómo marca la cartera «dañada»

`DAMAGED_WALLET_LABEL = 'Wallet dañada'` (`src/background/crypto/integrity.ts:30-31`) es la etiqueta de estado exigida por RNF-22 y **no** es un literal de la tabla de errores (`:30`).

`status` se calcula con esta precedencia: `'damaged'` si hay algún aviso, si no `'absent'` si no hay ni frase ni cuentas, si no `'ok'` (`src/background/crypto/integrity.ts:235-237`). El informe incluye además:

- `derivations: 0` **siempre**, con el tipo literal `0`: «CERO derivaciones silenciosas» (`src/background/crypto/integrity.ts:8-11`, `:64-65`, `:249`).
- `canDerive = mnemonicValid && !damaged`: solo se puede derivar si la frase es válida y la cartera **no** está dañada (`src/background/crypto/integrity.ts:66-67`, `:238`).
- `label` con «Wallet dañada» y un error tipado `damagedWalletError({ reason: 'wallet-damaged', issues })` (`src/background/crypto/integrity.ts:68-71`, `:251-252`). La causa real es `-32603 damagedWallet`, «La cartera guardada está dañada y no se puede usar: no se derivan cuentas nuevas desde ella.» (`src/background/rpc/errors.ts:217-224`).

`checkWalletIntegrity` es la versión que lee el almacén (`src/background/crypto/integrity.ts:256-272`); `isWalletUsable` resume el veredicto (`:274-276`) y `damagedAddresses` extrae las direcciones afectadas para la UI de «wallet dañada» (`:278-282`). `checkIntegrity` es el alias con el que lo invoca el arranque (M2) (`:284-288`).

### Qué hace la UI con el estado dañado

El arranque del Service Worker ejecuta la integridad como fase 4, antes de la auto-carga del estado (`src/background.ts:648-651`), y resume el informe en `IntegritySnapshot`: `ok` es `status !== 'damaged'`, con el `status` y los motivos en texto (`src/background.ts:174-182`, normalización en `:283-301`). Un arranque que lanza deja `{ ok: false, status: 'damaged', problems: ['integrity-check-failed'] }` (`src/background.ts:330-331`).

La instantánea se guarda en memoria en `bootSnapshot` (`src/background.ts:208-212`) y `isWalletDamaged()` la consulta (`src/background.ts:214-216`). Si la cartera está dañada el arranque **no** falla: solo registra un aviso con los motivos, sin volcar material sensible (`src/background.ts:324-327`).

#### Consumo en la UI

El popup obtiene la integridad por `wallet_getState` (`src/popup/walletState.ts:137-173`, la llamada en `:145`): `readSnapshot` marca `damaged = integrity.status === 'damaged'` (`:152`) y compone `damagedReason` uniendo los `problems` con un espacio (`:166-170`). El tipo `WalletIntegrity` del popup declara `status`, `label`, `problems`, `mnemonicPresent`, `mnemonicValid` y `canDerive` (`src/popup/walletState.ts:41-51`).

`App.tsx` pinta el estado dañado cuando `snapshot.damaged` es verdadero, mostrando `damagedReason` o el error tipado `damagedWallet` con los problemas de integridad (`src/popup/App.tsx:267-275`). El literal de la causa está en `src/popup/popupErrors.ts:118`.

## Recorrido completo de ejemplo

Este recorrido narra el alta de una cartera nueva con los nombres reales, desde el clic hasta el estado en la UI. Cada flecha lleva su `ruta:línea`.

### Paso a paso del alta

1. **El usuario pulsa «Crear cartera»** en la sección «Cartera» de la pestaña «Cuentas» → `src/popup/views/AccountsView.tsx:198`, que invoca `handleCreate` → `src/popup/views/AccountsView.tsx:105`.
2. **El popup pide la frase al Service Worker**: `handleCreate` llama a `createWallet` de `walletState` → `src/popup/views/AccountsView.tsx:106` → `src/popup/walletState.ts:182`.
3. **Primer método interno: `wallet_generateMnemonic`** → `src/popup/walletState.ts:183`. El envoltorio es `TRUEKEATE_RPC` con `origin: 'extension'` → `src/popup/walletRpc.ts:7-9`, construido por `buildInternalMessage` → `src/popup/walletRpc.ts:79` y enviado por `callInternal` → `src/popup/walletRpc.ts:144`.
4. **El mensaje entra en el Service Worker** por el listener de `chrome.runtime.onMessage` → `src/background.ts:566`, que lo enruta con `handleRpcMessage` tras comprobar que es un tipo del protocolo → `src/background.ts:605`, `src/background/rpc/router.ts:709-751`.
5. **El router valida el contexto** —los `wallet_*` internos solo desde páginas de la extensión— → `src/background/rpc/router.ts:549-564`, y despacha al catálogo → `src/background/rpc/catalog.ts:1324-1337`.
6. **El catálogo ejecuta `handleGenerateMnemonic`** → `src/background/rpc/catalog.ts:859-862`, que llama a `deps.mnemonic.generateMnemonic()`.
7. **M8 genera la frase**: 16 bytes de entropía del CSPRNG normalizados con `Uint8Array.from` y `Mnemonic.fromEntropy` con la lista inglesa → `src/background/crypto/mnemonic.ts:127-128`. Devuelve `{ mnemonic, wordCount: 12 }` → `src/background/rpc/catalog.ts:861`. **Nada se persiste en este paso** → `src/background/rpc/catalog.ts:855-857`.
8. **El popup recibe la frase y la reenvía**: `createWallet` del popup llama a `importMnemonic(generated.result.mnemonic)` → `src/popup/walletState.ts:187`, que emite **`wallet_importMnemonic`** con la frase como único parámetro → `src/popup/walletState.ts:194`.
9. **El catálogo ejecuta `handleImportMnemonic`** → `src/background/rpc/catalog.ts:869-875`, que llama a `deps.accounts.importWalletFromMnemonic(params[0])`.
10. **M28 valida la frase completa (M8)**: `checkMnemonic` comprueba forma (M59), pertenencia a la lista de 2048 palabras y checksum BIP-39 → `src/background/accounts.ts:488` → `src/background/crypto/mnemonic.ts:74-111`. Si falla, responde `-32602 invalidMnemonic` **sin escribir nada** → `src/background/accounts.ts:489-491`.
11. **M28 persiste la cartera** dentro del cerrojo `runSettingsRmw` → `src/background/accounts.ts:437`. Deriva las cuentas con `deriveAccounts(mnemonic, count, 0)` → `src/background/accounts.ts:440`, es decir 5 cuentas por `DERIVED_ACCOUNTS` → `src/shared/constants.ts:67`.
12. **M9 deriva cada cuenta** por la ruta vinculante `m/44'/60'/0'/0/i` → `src/background/crypto/hd.ts:22`, `:35`, `:67-73`, `:80-97`.
13. **Escritura atómica en `chrome.storage.local`** → `src/background/accounts.ts:452-460`: `truekeate_mnemonic` con la frase normalizada, `truekeate_accounts` con las 5 direcciones EIP-55, `truekeate_current_account = idx:0` y `truekeate_settings` con `derivedAccountCount: 5`, `accountLabels: {}` y `hiddenAccounts: []`. El contrato de la escritura es `writeStorage` → `src/background/state/schema.ts:360`.
14. **Fallo de cuota**: si el almacén rechaza la escritura, se devuelve `-32603 storageQuotaExceeded` → `src/background/accounts.ts:461-463`.
15. **Respuesta al popup**: `createWallet` devuelve `{ accounts, currentAccount: idx:0, derivedAccountCount: 5, mnemonic }` → `src/background/accounts.ts:464`, `:472-478`. La frase se devuelve para mostrarla **una vez**; a partir de ahí solo se obtiene por el revelado de RF-50 → `src/background/accounts.ts:467-471`.
16. **El popup refresca su estado**: `handleCreate` llama a `onChanged()` dentro de `run` → `src/popup/views/AccountsView.tsx:100-106`, que relee el estado con `readSnapshot` → `src/popup/walletState.ts:144`.
17. **Estado en la UI**: `readSnapshot` emite **`wallet_getState`** → `src/popup/walletState.ts:145`. El catálogo lo atiende en `handleGetState` → `src/background/rpc/catalog.ts:1003-1025`, que compone M28 (`getWalletStateView`, `src/background/accounts.ts:912-922`), M13 (`checkWalletIntegrity`, `src/background/crypto/integrity.ts:256-272`), las redes y las sesiones → `src/background/rpc/catalog.ts:1004-1007`. El popup marca cada cuenta con `asAccountRow` y calcula `damaged` → `src/popup/walletState.ts:150-152`.
18. **Mensaje de confirmación**: «Cartera creada: revisa «Seguridad» para guardar tu frase.» → `src/popup/views/AccountsView.tsx:106`, y el formulario se cierra → `:107-109`.

### Resumen de la cadena

`AccountsView.handleCreate` (`src/popup/views/AccountsView.tsx:105`) → `walletState.createWallet` (`src/popup/walletState.ts:182`) → `wallet_generateMnemonic` (`src/popup/walletState.ts:183`) → `handleRpcMessage` (`src/background/rpc/router.ts:709`) → `invokeInternalMethod` (`src/background/rpc/catalog.ts:1324`) → `handleGenerateMnemonic` (`src/background/rpc/catalog.ts:859`) → `generateMnemonic` M8 (`src/background/crypto/mnemonic.ts:120`) → **vuelta al popup** → `wallet_importMnemonic` (`src/popup/walletState.ts:194`) → `handleImportMnemonic` (`src/background/rpc/catalog.ts:869`) → `importWalletFromMnemonic` M28 (`src/background/accounts.ts:484`) → `checkMnemonic` M8 (`src/background/crypto/mnemonic.ts:74`) → `deriveAccounts` M9 (`src/background/crypto/hd.ts:80`) → `writeStorage` (`src/background/state/schema.ts:360`) → `onChanged` → `wallet_getState` (`src/popup/walletState.ts:145`) → `getWalletStateView` (`src/background/accounts.ts:912`) → estado en la UI.

### Nota sobre eventos

La escritura del alta **no** emite un evento de cambio a dApps: el evento `accountsChanged` se emite al **cambiar la cuenta activa**, y solo a las pestañas de las sesiones vigentes, porque emitirlo a todas publicaría la dirección en orígenes sin sesión (RNF-11) (`src/background/rpc/catalog.ts:1300-1315`). El mecanismo de cambio de cuenta activa está documentado en `src/background/rpc/setCurrentAccount.spec.ts:3-12`.

## Métodos internos del subsistema

`INTERNAL_METHODS` es la lista **cerrada** de los métodos internos `wallet_*` del contrato §5.1.1 (v1.7), en un módulo **hoja** cuya única importación es un `import type` (`src/background/rpc/internalMethods.ts:1-5`). Los que gobiernan este subsistema son:

| Método interno | Manejador (catálogo) | Implementación |
| --- | --- | --- |
| `wallet_generateMnemonic` | `handleGenerateMnemonic` `src/background/rpc/catalog.ts:859` | M8 `generateMnemonic` `src/background/crypto/mnemonic.ts:120` |
| `wallet_importMnemonic` | `handleImportMnemonic` `src/background/rpc/catalog.ts:869` | M28 `importWalletFromMnemonic` `src/background/accounts.ts:484` |
| `wallet_deriveAccounts` | `handleDeriveAccounts` `src/background/rpc/catalog.ts:881` | M28 `deriveNextAccount` `src/background/accounts.ts:505` |
| `wallet_importPrivateKey` | `handleImportPrivateKey` `src/background/rpc/catalog.ts:896` | M28 `importAccountByPrivateKey` `src/background/accounts.ts:557` |
| `wallet_getState` | `handleGetState` `src/background/rpc/catalog.ts:1003` | M28 `getWalletStateView` `src/background/accounts.ts:912` |
| `wallet_setCurrentAccount` | `handleSetCurrentAccount` `src/background/rpc/catalog.ts:1069` | M28 `setCurrentAccount` `src/background/accounts.ts:799` |
| `wallet_addDerivedAccount` | `handleAddDerivedAccount` `src/background/rpc/catalog.ts:1087` | M28 `deriveNextAccount` `src/background/accounts.ts:505` |
| `wallet_renameAccount` | `handleRenameAccount` `src/background/rpc/catalog.ts:1106` | M28 `renameAccount` `src/background/accounts.ts:627` |
| `wallet_setAccountVisible` | `handleSetAccountVisible` `src/background/rpc/catalog.ts:1122` | M28 `setAccountVisible` `src/background/accounts.ts:681` |
| `wallet_deleteImportedAccount` | `handleDeleteImportedAccount` `src/background/rpc/catalog.ts:1138` | M28 `removeImportedAccount` `src/background/accounts.ts:741` |
| `wallet_revealSecret` | `handleRevealSecret` `src/background/rpc/catalog.ts:1239` | M12 `resolveSecret` `src/background/crypto/secrets.ts:128` |
| `wallet_resetWallet` | `handleResetWallet` `src/background/rpc/catalog.ts:1162` | M33 `resetWallet` `src/background/state/schema.ts:653` |
| `wallet_acceptDevNotice` | `handleAcceptDevNotice` `src/background/rpc/catalog.ts:1185` | M29 `acceptDevNotice` `src/background/settings.ts:284` |

La declaración cerrada completa está en `src/background/rpc/internalMethods.ts:28-48` y su unión de tipos `InternalMethod` en `src/shared/types.ts:73-97`; el catálogo la importa y la **reexporta** desde `src/background/rpc/catalog.ts:175` para no duplicar la declaración (`src/background/rpc/internalMethods.ts:17-18`).

`eth_sign` **no** está ni estará en la lista (DEC-22 / H-11a): responde `4200` (`src/background/rpc/internalMethods.ts:20`).

## Specs que cubren este subsistema

| Fichero de prueba | Qué garantiza |
| --- | --- |
| `src/background/crypto/mnemonic.spec.ts` | `CA-RF-01` (generación BIP-39 de 12 palabras con checksum válido) y `CA-RF-02` (normalización de espacios/mayúsculas y rechazo del checksum roto con `-32602`); usa vectores REALES de BIP-39/BIP-44 (`:2-16`) |
| `src/background/crypto/derivation.spec.ts` | `CA-RF-04`: la ruta vinculante `m/44'/60'/0'/0/i`, las 5 cuentas iniciales (índices 0..4) y la 6.ª al añadir, con vectores reales verificados también contra Anvil en el E2E (`:2-11`) |
| `src/background/crypto/importPrivateKey.spec.ts` | `CA-RF-05` (M10 + M61): `0x` + 64 hex dentro del rango secp256k1, dirección con checksum EIP-55 y descarte fuera de rango; los duplicados son de M28 (`:2-11`) |
| `src/background/crypto/secretsExport.spec.ts` | `CA-RF-50` en su parte de servicio: confirmación explícita, contexto de confianza, plazo de 30 s y guarda `-32000` de sesión de dApp activa (`:2-10`) |
| `src/background/crypto/revealHygiene.spec.ts` | RNF-09 / `CA-RF-50`: plazo de 30 s con temporizador inyectable, pérdida de foco, descarte de memoria al ocultar y que el valor **nunca** viaja por `window.postMessage` ni `chrome.runtime.sendMessage` (`:2-16`) |
| `src/background/crypto/revealClipboard.spec.ts` | Criterio «fuga por el portapapeles» de §3.2.8: sobrescritura con cadena vacía solo si el portapapeles contiene el valor; nunca se destruye contenido ajeno (`:2-13`) |
| `src/background/crypto/integrity.spec.ts` | RNF-22: un mnemonic con checksum roto o una dirección con EIP-55 inválido dejan la cartera en «wallet dañada», con `derivations: 0` y `canDerive: false` (`:2-10`) |
| `src/background/crypto/integrityHoles.spec.ts` | Huecos de detección de M13: un hueco no-cadena en la lista (que desplazaba el índice BIP-44) y una cuenta importada sin clave utilizable; antes el informe decía `status: 'ok'` (`:2-12`) |
| `src/background/accounts.spec.ts` | M28 sobre el almacén simulado: 5 cuentas al crear y la 6.ª al añadir, normalización en la importación, ausencia de contraseña, etiqueta de importada persistida y duplicado rechazado con `-32602`, etiquetas DEC-35 y guarda `-32000` al eliminar una importada (`:2-16`) |
| `src/background/accountsRef.spec.ts` | Forma ESTRICTA de `parseAccountRef` (cuerpo de `idx:` con dígitos, sin `Number('')`) y que la **importación** aplique la misma cota de 1..32 caracteres que el renombrado (`:2-11`) |
| `src/background/rpc/setCurrentAccount.spec.ts` | `CA-RF-15` en el SW: el cambio de cuenta activa desde el popup actualiza la sesión compartida de las dApps vigentes y emite `accountsChanged` con la cuenta nueva (`:2-19`) |
| `src/background/security/importOrder.spec.ts` | RNF-10 / regresión de D-H3-C: la lista de métodos internos vive en un módulo hoja y la guarda funciona sea cual sea el orden de importación (`:2-20`) |
| `src/shared/validation/validation.spec.ts` | `CA-RF-33`: validación inline de los cuatro formularios (frase, dirección, importe y clave privada) con magnitudes concretas, cada fallo con su `problem` y su `-32602` (`:1-13`) |
| `src/shared/format.spec.ts` | ETH a 4 decimales con truncado hacia abajo, direcciones `0x1234…abcd` con elipsis U+2026, marcas de tiempo españolas deterministas y ausencia de separador de millares (`:2-16`) |

### Sobre las pruebas de M29

Existe cobertura de los ajustes **de forma indirecta**: `accounts.spec.ts` importa `getSettings` del módulo de ajustes y comprueba `CA-RF-03` (`derivedAccountCount`, ausencia de contraseña) (`src/background/accounts.spec.ts:9`, `:20`). **No** se ha localizado un fichero `src/background/settings.spec.ts` dedicado en el árbol: **pendiente de confirmar** con el inventario de pruebas del proyecto.

### Cobertura E2E relacionada

`e2e/26-avisos.spec.ts` verifica la aceptación del aviso de entorno desde el Service Worker, comprobando que `devNoticeAcceptedAt` está ausente antes y presente después (`e2e/26-avisos.spec.ts:10`, `:90-105`). `e2e/12-redes.spec.ts` transcribe a propósito el literal de RNF-23 y lo compara con el aviso pintado (`e2e/12-redes.spec.ts:62-67`, `:203`).
