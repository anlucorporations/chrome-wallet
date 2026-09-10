# 🗂️ Diccionario de Datos — CodeCrypto Wallet

> **Fase:** 1 — Concepto · **Versión:** 1.0
> Se actualiza de forma incremental durante el desarrollo. Fuente de verdad de claves de `chrome.storage.local`, `localStorage`, mensajes y entidades en memoria.

---

## 1. Convenciones

| Prefijo | Ámbito | Persistencia | Sensibilidad |
|---|---|---|---|
| `codecrypto_` | `chrome.storage.local` (Service Worker + popup) | Persistente | Mixta (ver columna) |
| `codecrypto_logs` | `localStorage` del popup | Persistente entre resets | Baja |
| *sin prefijo* | Memoria del Service Worker (`Map`) | Volátil (se pierde al dormir el SW) | Alta |

Tipos: `Address` = string `0x` + 40 hex · `Hex` = string `0x…` · `WeiString` = string decimal (BigInt serializado) · `ChainIdHex` = string `0x…`.

---

## 2. Entidades y claves de `chrome.storage.local`

### 2.1 `codecrypto_mnemonic`

| Campo | Tipo | Obligatorio | Descripción | Origen | Sensible |
|---|---|---|---|---|---|
| — | `string` | Sí (si la wallet se creó por frase) | Frase BIP-39 de 12 palabras separadas por espacio, normalizada en minúsculas y con espacios simples. | RF-01/RF-02 | 🔴 Sí |

*Ejemplo:* `"test test test test test test test test test test test junk"`
*Nota:* si la wallet se creó solo con cuentas importadas por clave privada, esta clave puede no existir.

---

### 2.2 `codecrypto_accounts`

| Campo | Tipo | Descripción |
|---|---|---|
| — | `string[]` (Address) | Direcciones derivadas en orden BIP-44 `m/44'/60'/0'/0/i`. El índice del array **es** el índice de derivación. |

*Ejemplo:* `["0xf39F…2266","0x7099…79C8","0x3C44…93BC","0x90F7…b906","0x15d3…6A65"]`

---

### 2.3 `codecrypto_imported_accounts`

> **Nuevo (RF-05, RF-06).**

| Campo | Tipo | Obligatorio | Descripción | Validación |
|---|---|---|---|---|
| `address` | `Address` | Sí | Dirección derivada de la clave privada. | Debe cumplir checksum EIP-55. |
| `privateKey` | `Hex` (32 bytes) | Sí | Clave privada importada. | 64 hex, rango válido de curva secp256k1. |
| `label` | `string` | No | Etiqueta editable por el usuario (por defecto `Importada N`). | ≤ 32 caracteres. |
| `importedAt` | `number` (epoch ms) | Sí | Fecha de importación. | — |
| `visible` | `boolean` | Sí | Si se muestra en la lista de cuentas. | — |

---

### 2.4 `codecrypto_current_account`

| Campo | Tipo | Descripción | Validación |
|---|---|---|---|
| — | `string` | Identificador de la cuenta activa en el popup. Formato `idx:<n>` para derivadas o `imp:<address>` para importadas. | Debe existir en `codecrypto_accounts` o `codecrypto_imported_accounts`. |

*Ejemplo:* `"idx:0"` (retrocompatible con el formato antiguo `"0"`).

---

### 2.5 `codecrypto_chain_id`

| Campo | Tipo | Descripción | Valores iniciales |
|---|---|---|---|
| — | `ChainIdHex` | Red activa. | `"0x7a69"` (Anvil 31337). **Única red incluida por defecto (P-02: sin Sepolia).** |

---

### 2.6 `codecrypto_networks`

> **Nuevo (RF-23).** Por decisión P-02 el sistema arranca con **una sola red** (Anvil local); las demás se añaden en tiempo de ejecución con `wallet_addEthereumChain` o desde la UI.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `chainId` | `ChainIdHex` | Sí | Clave del mapa. |
| `chainIdDecimal` | `number` | Sí | Para el campo `chainId` de EIP-712 y `wallet_addEthereumChain`. |
| `name` | `string` | Sí | Nombre visible (ej. "Anvil Local"). |
| `rpcUrl` | `string` (URL http/https) | Sí | Endpoint JSON-RPC. Debe estar en `host_permissions` o solicitarse permiso. |
| `symbol` | `string` | Sí | Símbolo de la moneda nativa (ej. `ETH`). |
| `decimals` | `number` | No (18) | Decimales de la moneda nativa. |
| `explorerUrl` | `string` | No | URL del explorador (puede no existir en local). |
| `isTestnet` | `boolean` | Sí | Marca visual de red de pruebas. |
| `isDefault` | `boolean` | Sí | Red usada al primer arranque. |

*Valor por defecto (único registro inicial):*
```json
{
  "0x7a69": {
    "chainId": "0x7a69", "chainIdDecimal": 31337, "name": "Anvil Local",
    "rpcUrl": "http://127.0.0.1:8545", "symbol": "ETH", "decimals": 18,
    "isTestnet": true, "isDefault": true
  }
}
```

---

### 2.7 `codecrypto_connected_sites`

> **RF-25, RF-17, RF-26.** Mapa `origin → sesión de dApp`.

| Campo | Tipo | Descripción |
|---|---|---|
| *clave* | `string` | `origin` de la dApp (ej. `http://localhost:5174`). |
| `account` | `Address` | Cuenta compartida con ese origen. |
| `chainId` | `ChainIdHex` | Red en el momento de la conexión. |
| `connectedAt` | `number` | Epoch ms. |
| `lastUsedAt` | `number` | Epoch ms (para poder expirar/metrificar sesiones). |

*Ejemplo:* `{ "http://localhost:5174": { "account": "0xf39F…2266", "chainId": "0x7a69", "connectedAt": 1730000000000, "lastUsedAt": 1730000000000 } }`

---

### 2.8 `codecrypto_pending_request` — solicitud de firma/aprobación

> **RF-19, RF-20, RF-35, RF-37, RF-40.**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `approvalId` | `string` (uuid) | Sí | Identificador único de la aprobación. |
| `method` | `string` | Sí | `eth_sendTransaction` \| `eth_signTypedData_v4` \| `personal_sign` \| `wallet_switchEthereumChain` \| `wallet_addEthereumChain`. |
| `params` | `unknown[]` | Sí | Parámetros originales de la llamada RPC. |
| `origin` | `string` | Sí | Origen de la dApp solicitante (`sender.origin` / `sender.tab.url`). |
| `tabId` | `number` | No | Pestaña que originó la solicitud (para resolver la respuesta). |
| `frameId` | `number` | No | Frame solicitante. |
| `account` | `Address` | Sí | Cuenta que firmará. |
| `chainId` | `ChainIdHex` | Sí | Red activa al momento de la solicitud. |
| `txPreview` | `TxPreview` | No | Resumen calculado para la UI (ver 3.1). |
| `createdAt` | `number` | Sí | Epoch ms. |
| `expiresAt` | `number` | Sí | Epoch ms (`createdAt + 120000`). |
| `status` | `'pending' \| 'approved' \| 'rejected' \| 'expired'` | Sí | Estado del ciclo de vida. |

---

### 2.9 `codecrypto_connect_request` — solicitud de conexión

> **RF-16, RF-36.**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `requestId` | `string` (uuid) | Sí | Identificador de la solicitud. |
| `origin` | `string` | Sí | Origen de la dApp. |
| `favicon` | `string` | No | Favicon del origen (`chrome://favicon`). |
| `accounts` | `Address[]` | Sí | Cuentas ofrecidas al usuario. |
| `currentAccountIndex` | `number` | Sí | Preselección inicial. |
| `chainId` | `ChainIdHex` | Sí | Red actual. |
| `createdAt` | `number` | Sí | Epoch ms. |
| `expiresAt` | `number` | Sí | Epoch ms (`createdAt + 60000`). |

---

### 2.10 `codecrypto_settings`

| Campo | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `derivedAccountCount` | `number` | `5` | Cuentas derivadas por defecto (RF-04, P-04). |
| `balancePollMs` | `number` | `5000` | Intervalo de polling de saldos (RF-27). |
| `logLimit` | `number` | `500` | Máximo de entradas de log retenidas (RF-32). |
| `language` | `'es' \| 'en'` | `'es'` | Idioma de la UI (P-09). |
| `encryptionEnabled` | `boolean` | `false` | Cifrado del mnemonic (P-03). |
| `requirePasswordOnOpen` | `boolean` | `false` | Bloqueo del popup (P-03). |

---

### 2.11 `codecrypto_logs`

> Almacenado en **`localStorage`** del popup para sobrevivir a `resetWallet` (RF-32).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` (uuid) | Identificador de la entrada. |
| `ts` | `number` | Epoch ms. |
| `level` | `'info' \| 'success' \| 'warn' \| 'error'` | Nivel (colorea la UI: rojo = error, RF-30). |
| `category` | `'call' \| 'event' \| 'tx' \| 'sign' \| 'system'` | Categoría (RF-28..RF-31). |
| `message` | `string` | Texto legible. |
| `origin` | `string` | Origen de la dApp o `extension`. |
| `method` | `string` | Método RPC implicado, si aplica. |
| `data` | `unknown` | Payload resumido (sin claves privadas ni mnemonic). |

---

## 3. Entidades compuestas

### 3.1 `TxPreview` (resumen para la ventana de confirmación)

| Campo | Tipo | Descripción |
|---|---|---|
| `from` | `Address` | Cuenta que firma. |
| `to` | `Address \| null` | Destino (`null` = despliegue de contrato). |
| `valueWei` | `WeiString` | Valor en wei. |
| `valueEth` | `string` | Valor formateado a 18 decimales. |
| `data` | `Hex` | Calldata. |
| `dataLength` | `number` | Longitud en bytes de `data`. |
| `isContractCall` | `boolean` | `data !== '0x'`. |
| `gasLimit` | `WeiString` | Estimación de gas (`estimateGas`). |
| `maxFeePerGas` | `WeiString` | EIP-1559. |
| `maxPriorityFeePerGas` | `WeiString` | EIP-1559. |
| `estimatedFeeEth` | `string` | `gasLimit × maxFeePerGas` formateado. |
| `nonce` | `number` | Nonce pendiente. |
| `txType` | `2` | Tipo de transacción (EIP-1559). |
| `chainId` | `ChainIdHex` | Red. |
| `insufficientFunds` | `boolean` | `valueWei + fee > balance`. |

### 3.2 `TypedDataPreview` (EIP-712)

| Campo | Tipo | Descripción |
|---|---|---|
| `domain` | `object` | `name`, `version`, `chainId`, `verifyingContract`, `salt`. |
| `types` | `object` | Sin `EIP712Domain` (se elimina antes de firmar). |
| `message` | `object` | Datos a firmar. |
| `primaryType` | `string` | Tipo raíz detectado. |
| `domainChainMismatch` | `boolean` | `true` si `domain.chainId ≠ chainId` activo → advertencia en UI. |

### 3.3 `PendingApproval` (memoria del Service Worker — **volátil**)

| Campo | Tipo | Descripción |
|---|---|---|
| *clave* | `string` | `approvalId`. |
| `resolve` | `(value: RpcResult) => void` | Resuelve la promesa del RPC en curso. |
| `reject` | `(reason: Eip1193Error) => void` | Rechaza la promesa. |
| `windowId` | `number` | Ventana de `notification.html` abierta. |
| `timer` | `number` | Timeout (RF-40). |

> ⚠️ Al dormirse el Service Worker este `Map` se pierde: la reconstrucción se hace desde `codecrypto_pending_request` (RNF-08). Si la promesa original ya no existe, la solicitud se resuelve con error `4001`.

### 3.4 `DappSession` (vista en memoria de `codecrypto_connected_sites`)

| Campo | Tipo | Descripción |
|---|---|---|
| `origin` | `string` | Origen autorizado. |
| `account` | `Address` | Cuenta compartida. |
| `tabIds` | `number[]` | Pestañas vivas de ese origen. |
| `connected` | `boolean` | Estado para el evento `connect`/`disconnect`. |

---

## 4. Protocolo de mensajes internos

### 4.1 Página web ↔ Inject ↔ Content Script (`window.postMessage`)

| `type` | Dirección | Campos |
|---|---|---|
| `CODECRYPTO_REQUEST` | inject → content | `id`, `method`, `params` |
| `CODECRYPTO_RESPONSE` | content → inject | `id`, `result`, `error` |
| `CODECRYPTO_EVENT` | content → inject | `eventName`, `data` |
| `CODECRYPTO_ANNOUNCE` | inject → content | `info` (EIP-6963) |

> Validación obligatoria: `event.source === window` y `event.origin === location.origin` (RNF-10). Nunca transportan claves ni el mnemonic (RNF-09).

### 4.2 Content Script ↔ Service Worker (`chrome.runtime.sendMessage`)

| `type` | Dirección | Campos |
|---|---|---|
| `CODECRYPTO_RPC` | content/popup → SW | `method`, `params`, `origin`, `tabId` |
| `SIGN_RESPONSE` | notification → SW | `approvalId`, `success`, `error?` |
| `CONNECT_RESPONSE` | connect → SW | `requestId`, `success`, `account?`, `accountIndex?`, `error?` |
| `CODECRYPTO_EVENT` | SW → content | `eventName`, `data` |

### 4.3 Métodos RPC soportados por el provider

| Método | Tipo | ¿Requiere aprobación? | RF |
|---|---|---|---|
| `eth_requestAccounts` | conexión | Sí (`connect.html`) | RF-16 |
| `eth_accounts` | lectura | No | RF-17 |
| `eth_chainId` | lectura | No | RF-18 |
| `eth_blockNumber` | lectura | No | RF-18 |
| `eth_getBalance` | lectura | No | RF-18 |
| `eth_estimateGas` | lectura | No | RF-08 |
| `eth_gasPrice` / `eth_feeHistory` | lectura | No | RF-42 |
| `eth_getTransactionByHash` | lectura | No | RF-31 |
| `eth_sendTransaction` | escritura | **Sí** (`notification.html`) | RF-19 |
| `eth_signTypedData_v4` | firma | **Sí** | RF-20 |
| `personal_sign` / `eth_sign` | firma | **Sí** | RF-21 |
| `wallet_switchEthereumChain` | red | Sí (si la red no es la activa) | RF-22 |
| `wallet_addEthereumChain` | red | **Sí** | RF-23 |
| `wallet_revokePermissions` | permisos | Sí | RF-26 |
| `wallet_deriveAccounts` | interna (solo popup) | No | RF-04 |
| `wallet_generateMnemonic` | interna (solo popup) | No | RF-01 |
| `wallet_importPrivateKey` | interna (solo popup) | No | RF-05 |
| `wallet_getNetworks` / `wallet_getLogs` | interna (solo popup) | No | RF-23/RF-28 |

**Códigos de error EIP-1193 usados**

| Código | Significado | Cuándo |
|---|---|---|
| `4001` | User rejected request | Rechazo, timeout, cierre de ventana (RF-40). |
| `4100` | Unauthorized | Método que requiere conexión previa sin sesión. |
| `4200` | Unsupported method | Método no implementado. |
| `4900` | Disconnected | RPC local caído (RNF-07). |
| `4901` | Chain disconnected | `chainId` no soportado. |
| `-32602` | Invalid params | Parámetros inválidos (p. ej. mnemonic inválido, dirección malformada). |
| `-32603` | Internal error | Error inesperado del SW. |
| `-32000` | Invalid input / funds | Saldo insuficiente, nonce inválido. |

---

## 5. Entidades de red (persistencia del nodo de pruebas — no de la extensión)

| Entidad | Campo | Valor esperado (Anvil por defecto) |
|---|---|---|
| Red | RPC URL | `http://127.0.0.1:8545` |
| Red | chainId | `31337` / `0x7a69` |
| Red | Chain ID de firma (EIP-155) | `31337` |
| Cuenta | Mnemonic | `test test test test test test test test test test test junk` |
| Cuenta | Ruta de derivación | `m/44'/60'/0'/0/{0..4}` |
| Cuenta | Direcciones | `0xf39F…2266`, `0x7099…79C8`, `0x3C44…93BC`, `0x90F7…b906`, `0x15d3…6A65` |
| Cuenta | Saldo inicial | 10 000 ETH por cuenta (Anvil default) |

---

## 6. Cambios pendientes de confirmar en la entrevista

| Tema | Impacto en este diccionario |
|---|---|
| P-03 (contraseña/cifrado) | Añadiría `codecrypto_vault` (`{ ciphertext, iv, salt, kdf }`) y el flag `encryptionEnabled`. |
| P-04 (nº de cuentas) | Afecta `settings.derivedAccountCount` y el tamaño de `codecrypto_accounts`. |
| P-05 (personal_sign / QR) | Confirma RF-21 y añade el estado de UI para el QR (no persiste). |
| P-08 (GCP) | Añadiría credenciales y el endpoint de preview a `entornos_globales.md`. |
