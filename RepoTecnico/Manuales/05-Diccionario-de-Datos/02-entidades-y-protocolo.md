# Entidades compuestas y protocolo de TrueKeate Wallet

Propósito: inventariar las entidades reales de `src/shared/types.ts`, los 8 tipos de mensaje de
`src/shared/protocol.ts`, el catálogo RPC cerrado, el catálogo de errores EIP-1193, los ciclos de
vida persistidos y las divergencias medidas contra `RepoTecnico/diccionario_datos.md`.

> **Regla de veracidad aplicada.** Cada entidad, campo, código y literal citados proceden de un
> fichero leído del repositorio; las referencias `ruta:línea` apuntan al código real. Lo que no se ha
> podido verificar se marca **pendiente de confirmar**. No se ha ejecutado ningún build ni test.

## Entidades compuestas

`src/shared/types.ts` (550 líneas, leído completo) declara **45 entidades**: **21** alias o uniones
(`export type`) y **24** interfaces, cada una con su tabla de campos (nombre · tipo · obligatoriedad ·
descripción) y su destino. `Sí` = obligatorio; `No` = `?` o anulable.
### Alias de dominio — `types.ts:22-43`
| Alias | Definición | Significado | `ruta:línea` |
|---|---|---|---|
| `Address` · `Hex` | `` `0x${string}` `` | Dirección Ethereum (checksum EIP-55 al persistir) y cadena hexadecimal | `types.ts:22`, `:25` |
| `WeiString` | `string` | BigInt serializado en decimal; nunca `bigint` en storage | `types.ts:28` |
| `ChainIdHex` | `` `0x${string}` `` | `chainId` hexadecimal (`0x7a69` con Anvil) | `types.ts:31` |
| `Uuid` | `string` | Identificador UUID v4 (cola y conexión) | `types.ts:43` |
| `AccountRef` | `` `idx:${number}` \| `imp:${Address}` \| `${number}` `` | Cuenta canónica; la tercera forma es la heredada, normalizada por M34 | `types.ts:40` |
| `PendingRequestsMap` · `DappSessionsByOrigin` · `InflightTxByAccount` · `RateWindowsByOrigin` | `Record<…>` de cada clave | Mapas completos de `truekeate_pending_requests`, `truekeate_connected_sites`, `truekeate_inflight_tx` y `truekeate_rate_windows` | `types.ts:535-544` |

### Uniones cerradas — `types.ts:50-129`
| Unión | Valores reales | N.º | `ruta:línea` |
|---|---|---|---|
| `ApprovalStatus` | `pending` · `approved` · `rejected` · `expired` | 4 | `types.ts:50` |
| `ApprovalMethod` | `eth_sendTransaction` · `eth_signTypedData_v4` · `personal_sign` · `wallet_switchEthereumChain` · `wallet_addEthereumChain` · `wallet_revokePermissions` | 6 | `types.ts:56-62` |
| `InternalMethod` | los 16 `wallet_*` (7 originales + 8 de UI + `wallet_getConnectRequest`) | 16 | `types.ts:73-97` |
| `PageReadMethod` | `eth_requestAccounts` · `eth_accounts` · `eth_chainId` · `eth_blockNumber` · `eth_getBalance` · `eth_estimateGas` · `eth_gasPrice` · `eth_feeHistory` · `eth_getTransactionByHash` · `eth_getTransactionReceipt` | 10 | `types.ts:100-110` |
| `PageMethod` | `PageReadMethod` ∪ `ApprovalMethod` | 16 | `types.ts:118` |
| `WalletMethod` | `PageMethod` ∪ `InternalMethod` | 32 | `types.ts:121` |
| `ProviderEventName` | `accountsChanged` · `chainChanged` · `connect` · `disconnect` · `message` | 5 | `types.ts:124-129` |
| `LogCategory` | `call` · `event` · `tx` · `sign` · `system` | 5 | `types.ts:348` |
| `LogLevel` | `info` · `success` · `warn` · `error` | 4 | `types.ts:351` |
| `LogEventName` | catálogo cerrado de 24 eventos instrumentados | 24 | `types.ts:354-378` |

`eth_sign` **no pertenece a ninguna unión** y está retirado del catálogo: responde `4200`. La
comprobación viva es `exposesEthSign()` (`rpc/catalog.ts:507-508`), que debe devolver siempre `false`.

### La solicitud aprobable

#### `PendingRequest` — entrada de la cola · destino: `truekeate_pending_requests` · `types.ts:258-296`
| Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| `approvalId` | `Uuid` | Sí | Clave del mapa y correlación de la respuesta |
| `method` | `ApprovalMethod` | Sí | Uno de los 6 aprobables; `eth_sign` no puede aparecer |
| `params` | `unknown[]` | Sí | Payload de firma persistido **redactado** y acotado a 64 KiB |
| `origin` | `string` | Sí | Origen normalizado: minúsculas, sin barra final, con puerto |
| `tabId` | `number \| null` | Sí | `null` si la solicitud nace en el popup |
| `frameId` | `number \| null` | Sí | `0` = top frame; distinto de 0 exige responder solo a ese frame |
| `account` | `Address` | Sí | Cuenta que firmará |
| `chainId` | `ChainIdHex` | Sí | Red activa al crear la solicitud |
| `txPreview` | `TxPreview` | No | Solo `eth_sendTransaction` |
| `typedDataPreview` | `TypedDataPreview` | No | Solo `eth_signTypedData_v4` |
| `signMessagePreview` | `PersonalSignPreview` | No | Solo `personal_sign` |
| `createdAt` | `number` | Sí | Epoch ms; ancla del plazo y orden FIFO de la ventana única |
| `expiresAt` | `number` | Sí | `createdAt + SIGN_TIMEOUT_MS` (120 000 ms) |
| `status` | `ApprovalStatus` | Sí | Solo `pending` bloquea la cola |
| `resolvedAt` | `number` | No | Epoch ms de la transición fuera de `pending` |
| `errorCode` | `number` | No | Código EIP-1193 emitido al resolver |
| `requestId` | `string` | No | Correlación con el salto 1 (H-07); ausente en emisores internos |

#### `TxPreview` — resumen de transacción · destino: `PendingRequest.txPreview` · `types.ts:184-213`
| Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| `from` | `Address` | Sí | Cuenta que firma |
| `to` | `Address \| null` | Sí | `null` = despliegue de contrato |
| `toLabel` | `string` | Sí | Nombre del contrato o «desconocido» |
| `valueWei` | `WeiString` | Sí | Valor en wei |
| `valueEth` | `string` | Sí | Valor formateado a 18 decimales |
| `data` | `Hex` | Sí | Calldata |
| `dataLength` | `number` | Sí | Longitud de `data` en bytes |
| `isContractCall` | `boolean` | Sí | `data !== '0x'` |
| `selector` | `Hex \| null` | Sí | Primeros 4 bytes de `data` |
| `functionName` | `string \| null` | Sí | Firma decodificada con la tabla local cerrada; `null` si no está |
| `decodedArgs` | `Record<string, unknown> \| null` | Sí | Argumentos decodificados; `null` si no se pudieron |
| `isUnrecognizedContractCall` | `boolean` | Sí | `true` si el selector no está en la tabla local |
| `riskWarnings` | `string[]` | Sí | Avisos en español (allowance ilimitada, contrato no reconocido…) |
| `gasLimit` | `WeiString` | Sí | Estimación de gas |
| `estimationFailed` | `{ reason: string } \| null` | Sí | Relleno si `estimateGas` falló; bloquea el envío |
| `maxFeePerGas` | `WeiString` | Sí | EIP-1559 |
| `maxPriorityFeePerGas` | `WeiString` | Sí | EIP-1559 |
| `estimatedFeeEth` | `string` | Sí | `gasLimit × maxFeePerGas` formateado |
| `nonceInformativo` | `number` | Sí | Solo informativo: el nonce definitivo se recalcula al aprobar |
| `txType` | `2` | Sí | Tipo EIP-1559 (literal, no unión) |
| `chainId` | `ChainIdHex` | Sí | Red |
| `insufficientFunds` | `boolean` | Sí | `valueWei + fee > balance` |

#### Previews de firma — `types.ts:216-252`

| Entidad | Destino | Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|---|---|
| `TypedDataDomain` | dentro de `TypedDataPreview.domain` | `name` | `string` | No | Nombre del dominio |
| `TypedDataDomain` | dentro de `TypedDataPreview.domain` | `version` | `string` | No | Versión del dominio |
| `TypedDataDomain` | dentro de `TypedDataPreview.domain` | `chainId` | `number \| string` | No | Red declarada por la dApp (hex o decimal) |
| `TypedDataDomain` | dentro de `TypedDataPreview.domain` | `verifyingContract` | `Address` | No | Contrato verificador |
| `TypedDataDomain` | dentro de `TypedDataPreview.domain` | `salt` | `Hex` | No | Salt EIP-712 |
| `TypedDataPreview` | `PendingRequest.typedDataPreview` | `domain` | `TypedDataDomain` | Sí | Dominio recibido |
| `TypedDataPreview` | `PendingRequest.typedDataPreview` | `domainName` | `string \| null` | Sí | `domain.name` en claro |
| `TypedDataPreview` | `PendingRequest.typedDataPreview` | `verifyingContract` | `Address \| null` | Sí | `domain.verifyingContract` en claro |
| `TypedDataPreview` | `PendingRequest.typedDataPreview` | `types` | `Record<string, Array<{ name: string; type: string }>>` | Sí | Tipos **sin** `EIP712Domain` |
| `TypedDataPreview` | `PendingRequest.typedDataPreview` | `message` | `Record<string, unknown> \| null` | Sí | `null` si la serialización supera `PREVIEW_INLINE_MAX_BYTES` (4096 B) |
| `TypedDataPreview` | `PendingRequest.typedDataPreview` | `primaryType` | `string` | Sí | Tipo raíz detectado |
| `TypedDataPreview` | `PendingRequest.typedDataPreview` | `domainChainMismatch` | `boolean` | Sí | `domain.chainId` ≠ `chainId` activo → aviso destacado |
| `TypedDataPreview` | `PendingRequest.typedDataPreview` | `verifyingContractMismatch` | `boolean` | Sí | Contrato inexistente o dirección cero → aviso destacado |
| `PersonalSignPreview` | `PendingRequest.signMessagePreview` | `text` | `string \| null` | Sí | Payload decodificado como UTF-8; `null` si no es legible |
| `PersonalSignPreview` | `PendingRequest.signMessagePreview` | `isHexPayload` | `boolean` | Sí | `true` si es hexadecimal y no legible como texto |
| `PersonalSignPreview` | `PendingRequest.signMessagePreview` | `byteLength` | `number` | Sí | Longitud del payload en bytes |
| `PersonalSignPreview` | `PendingRequest.signMessagePreview` | `bytesHex` | `Hex` | Sí | Payload original; solo para la UI, nunca a `truekeate_logs` |

### La conexión de dApp
| Entidad | Destino | Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|---|---|
| `ConnectRequest` | `truekeate_connect_request[requestId]` (máx. 1 `pending` por origen) | `requestId` | `Uuid` | Sí | Clave del mapa y correlación de la respuesta |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `origin` | `string` | Sí | Origen normalizado que pide la conexión |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `favicon` | `string` | No | URL saneada por el SW; ausente si no hay icono |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `accounts` | `Address[]` | Sí | Cuentas ofrecidas, en orden canónico |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `currentAccountIndex` | `number` | Sí | Posición preseleccionada dentro de `accounts` |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `chainId` | `ChainIdHex` | Sí | Red en el momento de la solicitud |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `tabId` | `number` | Sí | Pestaña solicitante |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `frameId` | `number` | Sí | Frame solicitante |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `createdAt` | `number` | Sí | Epoch ms |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `expiresAt` | `number` | Sí | `createdAt + CONNECT_TIMEOUT_MS` (60 000 ms) |
| `ConnectRequest` | `truekeate_connect_request[requestId]` | `status` | `ApprovalStatus` | Sí | Reutiliza la unión de la cola |
| `ConnectRequestView` | canal: retorno de `wallet_getConnectRequest` | `requestId` | `Uuid` | Sí | Identificador de la solicitud |
| `ConnectRequestView` | canal: retorno de `wallet_getConnectRequest` | `origin` | `string` | Sí | Origen normalizado |
| `ConnectRequestView` | canal: retorno de `wallet_getConnectRequest` | `accounts` | `Address[]` | Sí | Cuentas ofrecidas |
| `ConnectRequestView` | canal: retorno de `wallet_getConnectRequest` | `currentAccountIndex` | `number` | Sí | Posición preseleccionada |
| `ConnectRequestView` | canal: retorno de `wallet_getConnectRequest` | `chainId` | `ChainIdHex` | Sí | Red |
| `ConnectRequestView` | canal: retorno de `wallet_getConnectRequest` | `expiresAt` | `number` | Sí | Superado, la solicitud ya no se entrega |

### Ventana única y observabilidad

`ApprovalWindow` (ventana única, `truekeate_approval_window`, `types.ts:336-341`) arranca en
`{windowId: null, shownApprovalId: null, openedAt: null, updatedAt: 0}` (`state/schema.ts:274-279`).
`LogEntry` (observabilidad, `truekeate_logs`, `types.ts:381-395`) la escribe **siempre** el Service
Worker, con retención FIFO y excluida del reset (`logging/logger.ts:535-686`).

| Entidad | Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|---|
| `ApprovalWindow` | `windowId` | `number \| null` | Sí | Id de `chrome.windows`; `null` = no hay ventana abierta |
| `ApprovalWindow` | `shownApprovalId` | `Uuid \| null` | Sí | Solicitud mostrada; siempre la `pending` más antigua (FIFO) |
| `ApprovalWindow` | `openedAt` | `number \| null` | Sí | Epoch ms de apertura |
| `ApprovalWindow` | `updatedAt` | `number` | Sí | Epoch ms de la última escritura |
| `LogEntry` | `id` | `Uuid` | Sí | Identificador de la entrada |
| `LogEntry` | `ts` | `number` | Sí | Epoch ms |
| `LogEntry` | `level` | `LogLevel` | Sí | Nivel |
| `LogEntry` | `category` | `LogCategory` | Sí | Taxonomía, independiente de `event` |
| `LogEntry` | `event` | `LogEventName` | Sí | Qué ocurrió (catálogo cerrado de 24) |
| `LogEntry` | `message` | `string` | Sí | Texto legible en español |
| `LogEntry` | `origin` | `string` | Sí | Origen normalizado o `extension` |
| `LogEntry` | `method` | `string` | Sí | Método RPC implicado, si aplica |
| `LogEntry` | `data` | `unknown` | Sí | Payload **redactado**; nunca íntegro |
| `LogEntry` | `txHash` | `Hex` | No | Solo en `category: 'tx'` |
| `LogEntry` | `txStatus` | `'pending' \| 'confirmed' \| 'failed'` | No | Solo en `category: 'tx'` (3 valores, no 4) |

### Cartera, ajustes y redes

#### `TruekeateSettings` — ajustes persistidos · destino: `truekeate_settings` · `types.ts:402-425`
| Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| `derivedAccountCount` | `number` | Sí | Cuentas derivadas cargadas |
| `accountLabels` | `Record<number, string>` | Sí | Etiquetas de las derivadas, por índice BIP-44 |
| `hiddenAccounts` | `number[]` | Sí | Índices de derivadas ocultas: una derivada nunca se elimina |
| `balancePollMs` | `number` | Sí | Intervalo de polling de saldos |
| `balancePollMaxAccounts` | `number` | Sí | Máximo de cuentas polleadas por ciclo |
| `logLimit` | `number` | Sí | Máximo global de entradas de log |
| `logMaxPerOrigin` | `number` | Sí | Máximo de entradas de log por origen |
| `sessionTtlMs` | `number` | Sí | TTL de la sesión de dApp desde `lastUsedAt` |
| `pendingRequestsMax` | `number` | Sí | Máximo global de solicitudes `pending` |
| `pendingRequestsMaxPerOrigin` | `number` | Sí | Máximo de `pending` por origen |
| `pendingRequestsPerMinute` | `number` | Sí | Límite de tasa por origen |
| `language` | `'es' \| 'en'` | Sí | Idioma de la UI |
| `encryptionEnabled` | `false` | Sí | Cifrado descartado en P-03; el literal lo fija en `false` |
| `requirePasswordOnOpen` | `false` | Sí | Bloqueo del popup descartado en P-03 |
| `devNoticeAcceptedAt` | `number` | No | Instante de aceptación del aviso no descartable (RNF-23) |

#### Cartera y redes — `types.ts:428-452` y `:547-550`
| Entidad | Destino | Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|---|---|
| `ImportedAccount` | `truekeate_imported_accounts[]` | `address` | `Address` | Sí | Dirección derivada de la clave privada |
| `ImportedAccount` | `truekeate_imported_accounts[]` | `privateKey` | `Hex` | Sí | Clave privada importada (32 bytes) |
| `ImportedAccount` | `truekeate_imported_accounts[]` | `label` | `string` | Sí | Etiqueta de usuario, máximo 32 caracteres |
| `ImportedAccount` | `truekeate_imported_accounts[]` | `importedAt` | `number` | Sí | Epoch ms del alta |
| `ImportedAccount` | `truekeate_imported_accounts[]` | `visible` | `boolean` | Sí | Si se muestra en la lista de cuentas |
| `StoredNetwork` | `truekeate_networks[chainId]` | `chainId` | `ChainIdHex` | Sí | Clave del mapa |
| `StoredNetwork` | `truekeate_networks[chainId]` | `chainIdDecimal` | `number` | Sí | Forma decimal, para EIP-712 y EIP-3085 |
| `StoredNetwork` | `truekeate_networks[chainId]` | `name` | `string` | Sí | Nombre visible |
| `StoredNetwork` | `truekeate_networks[chainId]` | `rpcUrl` | `string` | Sí | Endpoint JSON-RPC |
| `StoredNetwork` | `truekeate_networks[chainId]` | `symbol` | `string` | Sí | Símbolo de la moneda nativa |
| `StoredNetwork` | `truekeate_networks[chainId]` | `decimals` | `number` | Sí | Decimales de la moneda nativa |
| `StoredNetwork` | `truekeate_networks[chainId]` | `isTestnet` | `boolean` | Sí | Marca de red de pruebas |
| `StoredNetwork` | `truekeate_networks[chainId]` | `isDefault` | `boolean` | Sí | Red del primer arranque; el alta nunca la activa |
| `StoredNetwork` | `truekeate_networks[chainId]` | `explorerUrl` | `string` | No | Explorador declarado por EIP-3085 |
| `StoredWallet` | proyección de `truekeate_mnemonic` y `truekeate_current_account` | `truekeate_mnemonic` | `string` | No | Frase BIP-39; ausente si solo hay importadas |
| `StoredWallet` | proyección de `truekeate_mnemonic` y `truekeate_current_account` | `truekeate_current_account` | `AccountRef` | Sí | Referencia de la cuenta activa |

#### `NetworkPreview` — vista de red · canal: preview de `wallet_switchEthereumChain` y `wallet_addEthereumChain` · `types.ts:459-477`
| Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| `kind` | `'switch' \| 'add'` | Sí | Tipo de solicitud de red |
| `chainId` | `ChainIdHex` | Sí | Red destino |
| `chainIdDecimal` | `number` | Sí | Forma decimal |
| `name` | `string` | Sí | Nombre visible |
| `rpcUrl` | `string` | Sí | Endpoint |
| `symbol` | `string` | Sí | Símbolo |
| `decimals` | `number` | Sí | Decimales |
| `isTestnet` | `boolean` | Sí | `false` dispara `NON_TESTNET_WARNING` (RNF-23) |
| `warning` | `string \| null` | Sí | Aviso literal; `null` si la red es de pruebas |
| `currentChainId` | `ChainIdHex` | Sí | Red activa al crear la solicitud |
| `alreadyRegistered` | `boolean` | No | Solo en el alta: la red ya existía y se reemplaza |
| `activationNote` | `string` | No | Solo en el alta: aviso explícito de no activación (P-22) |

### Sesiones, exclusión mutua y tasa
| Entidad | Destino | Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|---|---|
| `DappSession` | `truekeate_connected_sites[origen]` | `origin` | `string` | Sí | Origen normalizado (clave del mapa) |
| `DappSession` | `truekeate_connected_sites[origen]` | `account` | `Address` | Sí | Cuenta compartida con ese origen |
| `DappSession` | `truekeate_connected_sites[origen]` | `chainId` | `ChainIdHex` | Sí | Red en el momento de la conexión |
| `DappSession` | `truekeate_connected_sites[origen]` | `tabIds` | `number[]` | Sí | Pestañas asociadas; **no** se publica a la UI |
| `DappSession` | `truekeate_connected_sites[origen]` | `connectedAt` | `number` | Sí | Epoch ms del alta de la sesión |
| `DappSession` | `truekeate_connected_sites[origen]` | `lastUsedAt` | `number` | Sí | Epoch ms del último uso; base del vencimiento |
| `DappSession` | `truekeate_connected_sites[origen]` | `expiresAt` | `number \| null` | Sí | `lastUsedAt + sessionTtlMs`; `null` = sin caducidad |
| `DappSession` | `truekeate_connected_sites[origen]` | `connected` | `boolean` | Sí | `false` invalida la sesión aunque no venciera |
| `ConnectedSiteView` | canal: `wallet_getState.connectedSites` | `origin` | `string` | Sí | Origen normalizado |
| `ConnectedSiteView` | canal: `wallet_getState.connectedSites` | `account` | `Address` | Sí | Cuenta compartida |
| `ConnectedSiteView` | canal: `wallet_getState.connectedSites` | `chainId` | `ChainIdHex` | Sí | Red de la sesión |
| `ConnectedSiteView` | canal: `wallet_getState.connectedSites` | `connectedAt` | `number` | Sí | Epoch ms del alta |
| `ConnectedSiteView` | canal: `wallet_getState.connectedSites` | `lastUsedAt` | `number` | Sí | Epoch ms del último uso |
| `ConnectedSiteView` | canal: `wallet_getState.connectedSites` | `expiresAt` | `number \| null` | Sí | Caducidad; `null` = sin caducidad |
| `ConnectedSiteView` | canal: `wallet_getState.connectedSites` | `current` | `boolean` | Sí | `true` = sesión vigente en la lectura |
| `InflightTx` | `truekeate_inflight_tx[address]` | `account` | `Address` | Sí | Clave del mapa: el `from` |
| `InflightTx` | `truekeate_inflight_tx[address]` | `approvalId` | `Uuid` | Sí | Solicitud aprobada que originó la difusión |
| `InflightTx` | `truekeate_inflight_tx[address]` | `phase` | `'signing' \| 'broadcast'` | Sí | `signing` bloquea la cuenta; `broadcast` no |
| `InflightTx` | `truekeate_inflight_tx[address]` | `nonce` | `number` | No | Nonce definitivo recalculado al aprobar |
| `InflightTx` | `truekeate_inflight_tx[address]` | `txHash` | `Hex \| null` | Sí | `null` mientras `phase === 'signing'` |
| `InflightTx` | `truekeate_inflight_tx[address]` | `startedAt` | `number` | Sí | Epoch ms del paso a `signing` |
| `InflightTx` | `truekeate_inflight_tx[address]` | `expiresAt` | `number` | Sí | `startedAt + INFLIGHT_TTL_MS` (180 000 ms) |
| `RateWindow` | `truekeate_rate_windows[origen]` | `tokens` | `number` | Sí | Saldo de la ventana deslizante |
| `RateWindow` | `truekeate_rate_windows[origen]` | `lastRefillAt` | `number` | Sí | Epoch ms de la última recarga perezosa |
| `RateWindow` | `truekeate_rate_windows[origen]` | `approvalWindowStart` | `number` | Sí | Epoch ms de inicio de la ventana de 60 s |
| `RateWindow` | `truekeate_rate_windows[origen]` | `approvalsInWindow` | `number` | Sí | Solicitudes aprobables contadas en la ventana |
| `RateWindow` | `truekeate_rate_windows[origen]` | `deniedCount` | `number` | Sí | Rechazos por límite (diagnóstico) |
| `RateWindow` | `truekeate_rate_windows[origen]` | `updatedAt` | `number` | Sí | Epoch ms de la última escritura |

### Superficies EIP-1193, EIP-6963 e integridad

No se persisten: viajan por la frontera de página (`types.ts:132-177`), y `WalletIntegrityView` en el
retorno de `wallet_getState` (`crypto/integrity.ts:116-275`, `catalog.ts:588-597`).

| Entidad | Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|---|
| `RequestArguments` | `method` | `string` | Sí | Método solicitado por la dApp |
| `RequestArguments` | `params` | `unknown[] \| Record<string, unknown>` | No | Parámetros |
| `Eip1193Error` | `code` | `number` | Sí | Código EIP-1193 del catálogo |
| `Eip1193Error` | `message` | `string` | Sí | Literal en español de la tabla de errores |
| `Eip1193Error` | `data` | `unknown` | No | Diagnóstico; se omite si no se aporta |
| `Eip1193Provider` | `request` | `(args: RequestArguments) => Promise<unknown>` | Sí | Única vía de llamada RPC |
| `Eip1193Provider` | `on` | `(eventName: ProviderEventName, listener: ProviderListener) => this` | Sí | Alta de escucha |
| `Eip1193Provider` | `removeListener` | `(eventName: ProviderEventName, listener: ProviderListener) => this` | Sí | Baja de escucha |
| `TruekeateProvider` | `isTrueKeate` | `true` | Sí | Marca literal de identidad |
| `TruekeateProvider` | `chainId` | `ChainIdHex \| null` | Sí | Red cacheada en la página |
| `TruekeateProvider` | `selectedAddress` | `Address \| null` | Sí | Cuenta activa cacheada en la página |
| `Eip6963ProviderInfo` | `uuid` | `string` | Sí | UUID v4 literal y congelado: nunca se regenera |
| `Eip6963ProviderInfo` | `name` | `string` | Sí | Nombre corto de marca: `TrueKeate` |
| `Eip6963ProviderInfo` | `icon` | `string` | Sí | Data-URI del isologo (96 px) |
| `Eip6963ProviderInfo` | `rdns` | `string` | Sí | `academy.codecrypto.truekeate` |
| `Eip6963ProviderDetail` | `info` | `Eip6963ProviderInfo` | Sí | Identidad del provider |
| `Eip6963ProviderDetail` | `provider` | `TruekeateProvider` | Sí | Objeto provider publicado |
| `ProviderListener` | *(tipo función)* | `(...args: unknown[]) => void` | — | Escucha de los 5 eventos del provider |
| `WalletIntegrityView` | `status` | `'absent' \| 'ok' \| 'damaged'` | Sí | Estado de integridad de la cartera |
| `WalletIntegrityView` | `label` | `string \| null` | Sí | Etiqueta `Wallet dañada` cuando procede |
| `WalletIntegrityView` | `problems` | `string[]` | Sí | Mensajes en español; nunca material de la cartera |
| `WalletIntegrityView` | `mnemonicPresent` | `boolean` | Sí | Hay frase semilla guardada |
| `WalletIntegrityView` | `mnemonicValid` | `boolean` | Sí | La frase supera la comprobación |
| `WalletIntegrityView` | `canDerive` | `boolean` | Sí | Se puede derivar sin dañar nada |

### Nombres del encargo que no existen literalmente en el código

`NetworkEntry` es `StoredNetwork` (`types.ts:438-452`); `ConnectedSite` es `DappSession` para la
sesión persistida (`:480-490`) y `ConnectedSiteView` para la UI (`:500-510`); `AccountLabels` es el
campo `accountLabels` de `TruekeateSettings` (`:404-405`) y `Settings` es `TruekeateSettings`
(`:402-425`). `PersonalSignPreview` (`:245-252`), `InternalMethod` (`:73-97`), `PageMethod` (`:118`),
`ApprovalMethod` (`:56-62`) y `Uuid` (`:43`) **sí** existen con esos nombres; los cuatro últimos son
uniones o alias.

## Los 8 tipos de mensaje

`src/shared/protocol.ts` (171 líneas, leído completo) cierra `TruekeateMessageType` con **8** tipos
(`protocol.ts:35-43`) y su espejo `TRUEKEATE_MESSAGE_TYPES` (`:46-55`). Las interfaces del encargo
(líneas 62-153) son `TruekeateRequestMessage` (62-67), `TruekeateResponseMessage` (70-75),
`TruekeateEventMessage` (78-82), `TruekeateAnnounceMessage` (85-88), `TruekeateRpcMessage` (105-122),
`SignResponseMessage` (125-130), `ConnectResponseMessage` (133-140), `ResumeMessage` (143-146).

| Tipo | Dirección (quién → quién) | Canal | Campos reales | Guarda que lo protege | `ruta:línea` |
|---|---|---|---|---|---|
| `TRUEKEATE_REQUEST` | inject → content script | `window.postMessage` | `id`, `method`, `params?` | `event.source === window` y `event.origin === location.origin` | `protocol.ts:62-67` |
| `TRUEKEATE_RESPONSE` | content → inject → página | `window.postMessage` | `id`, `result?`, `error?` (`Eip1193Error`) | `targetOrigin = location.origin`, nunca `'*'` | `protocol.ts:70-75` |
| `TRUEKEATE_EVENT` | SW → content → inject → página | `chrome.runtime.sendMessage` y luego `window.postMessage` | `eventName`, `data` | Reenvío **literal**, sin transformar ni filtrar | `protocol.ts:78-82` |
| `TRUEKEATE_ANNOUNCE` | inject → content (y re-anuncio al `window`) | `window.postMessage` / `CustomEvent` `eip6963:announceProvider` | `info` (`Eip6963ProviderDetail`) | Listener registrado de forma síncrona; `isTruekeateMessageType` | `protocol.ts:85-88` |
| `TRUEKEATE_RPC` | content script o popup → SW | `chrome.runtime.sendMessage` | `method`, `params?`, `origin`, `tabId`, `frameId`, `requestId?` | `sender.id === chrome.runtime.id` (si no, `4100`); origen recalculado; allowlist de internos (`4200`) | `protocol.ts:105-122` |
| `SIGN_RESPONSE` | `notification.html` → SW | `chrome.runtime.sendMessage` | `approvalId`, `success`, `error?` | `guardSender` + allowlist de rutas (si no, `4200`) | `protocol.ts:125-130` |
| `CONNECT_RESPONSE` | `connect.html` → SW | `chrome.runtime.sendMessage` | `requestId`, `success`, `account?`, `accountIndex?`, `error?` | `guardSender` + allowlist de rutas | `protocol.ts:133-140` |
| `RESUME` | content script o popup → SW | puerto de larga vida `truekeate_approval` | `approvalId` | Puerto nombrado; `registerApprovalPortListener` | `protocol.ts:143-146` |

`PageMessage` (`:91-95`) reúne los cuatro tipos de `window.postMessage` y `RuntimeMessage` (`:149-153`)
reúne `TRUEKEATE_RPC`, `SIGN_RESPONSE`, `CONNECT_RESPONSE` y `RESUME`; `TruekeateMessage` (`:156-158`)
es la unión de los 8 y la guarda es `isTruekeateMessageType` (`:161-162`). Canal y alarmas salen de
`APPROVAL_PORT` (`:29`) y `EXPIRE_ALARM` (`:32`), con literales en `constants.ts:220`, `:223`.
### Campos que son dato NO fiable
| Campo | Por qué no es fiable | Qué hace el SW | `ruta:línea` |
|---|---|---|---|
| `origin` | Lo declara el content script y una página puede mentir | Lo **recalcula** solo desde `sender.origin` y lo normaliza | `security/senderGuard.ts:159-171` |
| `tabId` | Puede no corresponder al emisor real | Se toma del `sender` del mensaje, no del payload | `security/senderGuard.ts:240-284` |
| `frameId` | Con `sender.frameId !== 0` queda **prohibido** el respaldo a `sender.tab.url` (ese `url` es el del top) | Se persiste en la solicitud y la respuesta se entrega **solo** a ese frame | `types.ts:266-267` |
| `requestId` | Es el `id` que puso la página | El SW **no lo interpreta**: solo lo persiste para que la resolución empujada vuelva con el `id` que espera la promesa de la dApp | `types.ts:284-295` |

## Catálogo RPC

El catálogo es **cerrado** y declara `kind`, `context`, `requiresApproval`, `implemented` y `resolve`
(`catalog.ts:214-227`); los conjuntos son `PAGE_READ_METHODS` (`:146-157`), `PAGE_APPROVAL_METHODS`
(`:160-167`), `INTERNAL_METHODS` (`internalMethods.ts:28-48`), `CATALOG_METHODS` (`:197-201`) y
`supportedMethods` (`:465-469`), y el despacho vive en `pageMethods.ts:293-329` y `catalog.ts:1324`.

### Lecturas de página (no aprobables, `context: 'any'`)
| Método | ¿Aprobable? | Invocable desde | Módulo que lo atiende | `ruta:línea` |
|---|---|---|---|---|
| `eth_requestAccounts` | No crea `PendingRequest`, pero abre `connect.html` | Página | `pageMethods.ts:249-286` | `catalog.ts:147` |
| `eth_accounts` | No (nunca abre ventana) | Página | `pageMethods.ts:234-242` | `catalog.ts:148` |
| `eth_chainId` | No | Página | `pageMethods.ts:173-176` | `catalog.ts:149` |
| `eth_blockNumber` | No | Página | `pageMethods.ts:179` | `catalog.ts:150` |
| `eth_getBalance` | No | Página | `pageMethods.ts:185-192` | `catalog.ts:151` |
| `eth_estimateGas` | No | Página | `pageMethods.ts:207-219` | `catalog.ts:152` |
| `eth_gasPrice` | No | Página | `pageMethods.ts:182` | `catalog.ts:153` |
| `eth_feeHistory` | No | Página | `pageMethods.ts:195-196` | `catalog.ts:154` |
| `eth_getTransactionByHash` | No | Página | `pageMethods.ts:222-223` | `catalog.ts:155` |
| `eth_getTransactionReceipt` | No | Página | `pageMethods.ts:226-227` | `catalog.ts:156` |

### Aprobables (crean `PendingRequest` y abren `notification.html`)
| Método | ¿Aprobable? | Invocable desde | Módulo que lo atiende | `ruta:línea` |
|---|---|---|---|---|
| `eth_sendTransaction` | **Sí** | Página | `approvals/dispatch.ts` (ruta M19→M19.b) | `catalog.ts:161` |
| `eth_signTypedData_v4` | **Sí** | Página | `approvals/dispatch.ts` | `catalog.ts:162` |
| `personal_sign` | **Sí** | Página | `approvals/dispatch.ts` | `catalog.ts:163` |
| `wallet_switchEthereumChain` | **Sí**, cuando la red destino no es la activa | Página (el popup también puede invocarlo y pasa por la misma ruta aprobable) | `networks/switch.ts` | `catalog.ts:443-450` |
| `wallet_addEthereumChain` | **Sí**, y además pide permiso de host en runtime | Página **o** popup (`context: 'any'`) | `networks/addChain.ts` | `catalog.ts:451-458` |
| `wallet_revokePermissions` | **Sí** desde una página; desde el popup es revocación directa (sin ventana) | Página o popup (`context: 'any'`) | `sessions.ts` + `events.ts` | `catalog.ts:419-426` |

### Internos `wallet_*` (solo contextos de la extensión)

Los 16 son `context: 'extension'`, `requiresApproval: false` y `resolve: false` (`catalog.ts:230-368`);
los atiende `invokeInternalMethod` (`catalog.ts:1324`).

| Método | ¿Aprobable? | Invocable desde | Módulo que lo atiende | `ruta:línea` |
|---|---|---|---|---|
| `wallet_generateMnemonic` | No (no persiste nada) | Popup | `crypto/mnemonic.ts` | `catalog.ts:231-238` |
| `wallet_importMnemonic` | No | Popup | `accounts.ts` | `catalog.ts:239-246` |
| `wallet_deriveAccounts` | No | Popup | `accounts.ts` | `catalog.ts:247-254` |
| `wallet_importPrivateKey` | No | Popup | `accounts.ts` | `catalog.ts:255-262` |
| `wallet_getNetworks` | No | Popup | `state/schema.ts` (lectura) | `catalog.ts:263-270` |
| `wallet_getLogs` | No | Popup | `logging/logger.ts` | `catalog.ts:271-278` |
| `wallet_revealSecret` | No: confirmación explícita dentro del contexto | Popup | `crypto/secrets.ts` | `catalog.ts:281-288` |
| `wallet_getState` | No | Popup | `accounts.ts` + `sessions.ts` + `crypto/integrity.ts` | `catalog.ts:292-299` |
| `wallet_setCurrentAccount` | No | Popup | `accounts.ts` + `sessions.ts` | `catalog.ts:300-307` |
| `wallet_addDerivedAccount` | No | Popup | `accounts.ts` | `catalog.ts:308-315` |
| `wallet_renameAccount` | No | Popup | `accounts.ts` | `catalog.ts:316-323` |
| `wallet_setAccountVisible` | No | Popup | `accounts.ts` | `catalog.ts:324-331` |
| `wallet_deleteImportedAccount` | No | Popup | `accounts.ts` | `catalog.ts:332-339` |
| `wallet_resetWallet` | No: confirmación destructiva del popup | Popup | `state/schema.ts` | `catalog.ts:342-349` |
| `wallet_acceptDevNotice` | No | Popup | `settings.ts` | `catalog.ts:350-357` |
| `wallet_getConnectRequest` | No | `connect.html` | `connections.ts` | `catalog.ts:360-367` |

### Métodos que NO están en el catálogo

`eth_sign` no figura en ninguna unión (`types.ts:115-117`), no está en `CATALOG_METHODS` y
`exposesEthSign()` debe devolver siempre `false` (`catalog.ts:507-508`): se responde **`4200
unsupportedMethod`** sin crear entrada en la cola y sin abrir ventana (`errors.ts:90-94`). Otro método
desconocido recibe la misma respuesta (`pageMethods.ts:321-324`), y un método **interno** desde una
página se rechaza con **`4200 methodNotAllowedInContext`** (`errors.ts:96-100`).

## Errores EIP-1193

La tabla cerrada está en `src/background/rpc/errors.ts` (688 líneas, leído): **8 códigos** y **37
causas** —25 filas del núcleo (`ERROR_CATALOG`, `:41-203`), 7 de la v1.9 (`EXTENDED_ERROR_CATALOG`,
`:217-264`), 2 de la v1.10 (`H4_ERROR_CATALOG`, `:279-293`) y 3 de la v1.11 (`H5_ERROR_CATALOG`,
`:309-330`)—. Se construyen con `createEip1193Error` (`:434-462`), `createErrorFromCode` (`:468-481`) y
`fillMessage` (`:410-428`).

| Código | Causa / constructor | Literal del mensaje (código) | Cuándo se lanza | `ruta:línea` |
|---|---|---|---|---|
| `4001` | `userRejected` — `userRejectedError()` | «Operación cancelada por el usuario.» | Rechazo explícito del usuario | `errors.ts:43-47`, `497-498` |
| `4001` | `timeout` — `timeoutError(segundos)` | «El usuario no respondió en el plazo establecido (`<segundos>` s); la solicitud ha caducado.» | Vencimiento del plazo (120 s firma; 60 s conexión) | `errors.ts:49-54`, `504-508` |
| `4001` | `approvalWindowClosed` — `approvalWindowClosedError()` | «La ventana de confirmación se cerró sin respuesta; la solicitud se ha cancelado.» | La ventana única se cierra sin decidir | `errors.ts:56-61`, `511-512` |
| `4001` | `tooManyPendingRequests` — `tooManyPendingRequestsError()` | «Hay demasiadas solicitudes pendientes para este origen; espera a que se resuelva la actual.» | Exceso de cardinalidad de la cola | `errors.ts:63-68`, `515-516` |
| `4001` | `rateLimitExceeded` — `rateLimitExceededError()` | «Se ha superado el límite de llamadas para este origen; espera unos segundos y reintenta.» | Ventana de tasa agotada en cualquier método del catálogo | `errors.ts:70-75`, `519-520` |
| `4001` | `hostPermissionDenied` — `hostPermissionDeniedError(rpcUrl)` | «No se concedió el permiso de acceso a `<rpcUrl>`; la red no se ha añadido.» | Permiso de host denegado al dar de alta una red | `errors.ts:77-82`, `523-524` |
| `4100` | `unauthorizedOrigin` — `unauthorizedOriginError()` | «Esta dApp no tiene permiso para usar la cartera.» | Origen sin sesión autorizada o emisor no autorizado | `errors.ts:84-88`, `527-528` |
| `4200` | `unsupportedMethod` — `unsupportedMethodError()` | «El método solicitado no está soportado por TrueKeate Wallet.» | Método fuera del catálogo (caso de `eth_sign`) | `errors.ts:90-94`, `531` |
| `4200` | `methodNotAllowedInContext` — `methodNotAllowedInContextError()` | «El método solicitado no está permitido en este contexto.» | Método interno invocado desde un contexto no permitido | `errors.ts:96-100`, `534-535` |
| `4900` | `rpcUnavailable` — `rpcUnavailableError()` | «Sin conexión con la red local (Anvil).» | RPC local caído tras agotar la política de reintentos | `errors.ts:102-106`, `538-539` |
| `4901` | `chainNotRegistered` — `chainNotRegisteredError()` | «La red solicitada no está dada de alta.» | `chainId` no dado de alta o distinto del activo | `errors.ts:108-112`, `548-549` |
| `4901` | `chainIdMismatch` — `chainIdMismatchError(declared, observed)` | «La red solicitada no está dada de alta.» (reutiliza el literal anterior) | El nodo declara un `chainId` distinto del declarado | `errors.ts:325-329`, `683-688` |
| `-32602` | `invalidMnemonic` — `invalidMnemonicError()` | «La frase de recuperación no es válida: revisa las 12 palabras y su checksum.» | Frase inválida o checksum BIP-39 incorrecto | `errors.ts:114-118`, `552` |
| `-32602` | `invalidPrivateKey` — `invalidPrivateKeyError()` | «La clave privada no es válida: debe ser `0x` + 64 caracteres hexadecimales de la curva secp256k1.» | Clave privada inválida | `errors.ts:120-125`, `555` |
| `-32602` | `invalidAddress` — `invalidAddressError()` | «La dirección no es válida: revisa el formato `0x` + 40 caracteres hexadecimales.» | Dirección malformada o checksum EIP-55 incorrecto | `errors.ts:127-132`, `558` |
| `-32602` | `duplicateAccount` — `duplicateAccountError()` | «Esa cuenta ya está en la cartera.» | La cuenta ya existe | `errors.ts:134-138`, `561` |
| `-32602` | `payloadTooLarge` — `payloadTooLargeError()` | «La carga útil de la solicitud supera el límite de 64 KiB.» | Payload por encima de `MAX_PAYLOAD_BYTES` | `errors.ts:140-144`, `564` |
| `-32000` | `insufficientFunds` — `insufficientFundsError()` | «Saldo insuficiente para cubrir el valor y la comisión estimada.» | Saldo insuficiente para valor + comisión | `errors.ts:146-150`, `567` |
| `-32000` | `invalidNonce` — `invalidNonceError()` | «La red rechazó la transacción: nonce inválido.» | Nonce rechazado por el nodo | `errors.ts:152-156`, `570` |
| `-32000` | `estimateGasFailed` — `estimateGasFailedError(motivo)` | «La estimación de gas falló: `<motivo>`. El envío se ha bloqueado.» | `estimateGas` fallido o revert previo a firmar | `errors.ts:158-162`, `573-574` |
| `-32000` | `accountInUseByDapp` — `accountInUseByDappError(origen)` | «La cuenta está en uso por la dApp `<origen>`: revoca ese permiso antes de revelar su clave privada o eliminarla.» | Cuenta con sesión vigente y operación destructiva | `errors.ts:164-169`, `577-578` |
| `-32000` | `resetBlocked` — `resetBlockedError(n)` | «No se puede resetear la cartera: quedan `<n>` solicitudes pendientes o una transacción en vuelo. Resuélvelas (aprueba o rechaza) o espera a que expiren.» | Cola `pending` o marca en vuelo vigente | `errors.ts:171-177`, `581-582` |
| `-32603` | `internalError` — `internalError()` | «Error interno de la cartera.» | Fallo no clasificado del SW | `errors.ts:179-183`, `585-586` |
| `-32603` | `duplicateApprovalId` — `duplicateApprovalIdError()` | «Ya existe una solicitud con ese identificador.» | Identificador duplicado en la cola | `errors.ts:185-189`, `589-590` |
| `-32603` | `storageQuotaExceeded` — `storageQuotaExceededError()` | «No hay espacio de almacenamiento en la extensión: la operación no se ha guardado.» | Cuota de `chrome.storage.local` agotada | `errors.ts:191-195`, `593-594` |
| `-32603` | `broadcastInterrupted` — `broadcastInterruptedError()` | «La difusión de la transacción se interrumpió; verifica su estado en el nodo antes de reintentar.» | Suspensión del SW durante la difusión | `errors.ts:197-202`, `597-598` |
| `-32603` | `damagedWallet` — `damagedWalletError()` | «La cartera guardada está dañada y no se puede usar: no se derivan cuentas nuevas desde ella.» | Integridad persistida rota (RNF-22) | `errors.ts:219-224`, `605-606` |
| `-32000` | `walletNotCreated` — `walletNotCreatedError()` | «Todavía no hay ninguna cartera: no se puede derivar ninguna cuenta.» | Se pide derivar sin frase ni cuentas | `errors.ts:226-230`, `609-610` |
| `-32602` | `unknownAccount` — `unknownAccountError()` | «La cuenta indicada no existe en la cartera.» | `AccountRef` inexistente | `errors.ts:232-236`, `613-614` |
| `-32602` | `invalidAmount` — `invalidAmountError()` | «El importe no es válido: usa un número decimal positivo con hasta 18 decimales.» | Importe malformado o no positivo | `errors.ts:238-242`, `617-618` |
| `-32602` | `invalidLabel` — `invalidLabelError()` | «La etiqueta no es válida: debe tener entre 1 y 32 caracteres.» | Etiqueta fuera de 1..32 caracteres | `errors.ts:244-248`, `621-622` |
| `-32603` | `clipboardFailure` — `clipboardFailureError()` | «No se pudo usar el portapapeles: el valor no se ha copiado o no se ha podido borrar.» | Fallo del portapapeles en el revelado | `errors.ts:250-256`, `625-626` |
| `-32603` | `migrationWriteFailed` — `migrationWriteFailedError()` | «No se pudo guardar la migración del esquema: los datos se han quedado sin actualizar.» | Fallo de escritura de la migración | `errors.ts:258-263`, `629-630` |
| `-32000` | `inflightTxInProgress` — `inflightTxInProgressError()` | «Ya hay una transacción de esta cuenta en vuelo; espera a que se difunda antes de firmar otra.» | 2.ª aprobación con marca `signing` vigente | `errors.ts:281-286`, `644-645` |
| `-32000` | `broadcastRejected` — `broadcastRejectedError(motivo)` | «La red rechazó la transacción: `<motivo>`.» | El nodo rechaza una transacción ya firmada | `errors.ts:288-292`, `652-655` |
| `-32602` | `invalidRpcUrl` — `invalidRpcUrlError()` | «La dirección del nodo no es válida: usa `https` o, solo para el RPC local, `http` en `127.0.0.1`/`localhost`.» | Validación previa del `rpcUrl` fallida | `errors.ts:311-316`, `666-667` |
| `-32602` | `invalidNetworkDefinition` — `invalidNetworkDefinitionError()` | «Los datos de la red no son válidos: revisa el `chainId`, el nombre y el símbolo de la moneda nativa.» | Datos EIP-3085 no utilizables | `errors.ts:318-323`, `674-675` |

### Códigos que NO existen

`4902` **no está en el fichero**: no aparece en `src/background/rpc/errors.ts`. Los códigos reales son
**ocho** (`ERROR_CODES`, `errors.ts:378`): `4001`, `4100`, `4200`, `4900`, `4901`, `-32000`, `-32602`
y `-32603`; ante un `4902` (EIP-3085) la respuesta es **`4901`** (`chainNotRegistered`).

### Invariantes del catálogo de errores

- **Todo error que ve el usuario lleva `code` numérico**; la guarda es `isEip1193Error`
  (`errors.ts:484-490`).
- **Un `code` admite varias causas**, una por mensaje; el mensaje por defecto de un código es el de su
  primera causa registrada (`createErrorFromCode`, `errors.ts:468-481`).
- **Ningún literal se inventa fuera de la tabla**: `errorDefinitionFor` (`errors.ts:364-375`) permite
  leer el mensaje sin construir el objeto (`txContract.ts:57`); una causa desconocida degrada a
  `-32603` (`errors.ts:444-453`).
## Estados y transiciones

### Ciclo de vida de una solicitud de la cola

Literales: **`pending` · `approved` · `rejected` · `expired`** (`ApprovalStatus`, `types.ts:50`; también
`ConnectRequest.status`, `:311`); lo resuelto es `ResolvedStatus = Exclude<ApprovalStatus,'pending'>`
(`approvals/queue.ts:541`).

| Transición | Disparador | Módulo y línea |
|---|---|---|
| (nada) → `pending` | Alta con `expiresAt = createdAt + SIGN_TIMEOUT_MS` | `approvals/queue.ts:393-530` (literal en `:493`) |
| `pending` → `approved` | Aprobación del usuario | `approvals/queue.ts:569-600` |
| `pending` → `rejected` | Rechazo, cierre de la ventana o desaparición de la pestaña | `approvals/queue.ts:569-600`, `approvals/focus.ts:755` |
| `pending` → `expired` | Vencimiento: **prevalece `expired`** aunque la decisión fuera otra | `approvals/queue.ts:578-587`, `approvals/timeout.ts:390` |
| Resuelta → fuera del mapa | Purga de `status !== 'pending'` y de las vencidas; sin aprobación se fija `errorCode: 4001` | `approvals/queue.ts:270-287`, `:587` |

### Ciclo de vida de una transacción

Literales: **`pending` · `confirmed` · `reverted` · `failed`** (`TxLifecycleState`,
`rpc/txContract.ts:116`). El `txStatus` **persistido** en `LogEntry` solo admite **3** valores:
`txStatusFor` colapsa `reverted` y `failed` en `'failed'` (`txContract.ts:131-132`, `types.ts:394`), y
los efectos por estado son `txLogEventFor`, `txLogLevelFor` y `TX_TRANSITION_MESSAGES` (`:135-172`).

| Transición | Disparador | Módulo y línea |
|---|---|---|
| → `pending` | Tras difundir, primer ciclo del seguimiento | `rpc/txContract.ts:551` |
| → `confirmed` | Recibo con `status === '0x1'` | `txContract.ts:473-478` |
| → `reverted` | Recibo con `status === '0x0'` | `txContract.ts:473-478`, `:564` |
| → `failed` | Difusión rechazada o plazo de seguimiento agotado | `txContract.ts:576-581` |

### Ciclo de vida de la marca «transacción en vuelo»

`InflightTx.phase` admite **`signing` · `broadcast`** (`types.ts:517`) y el bloqueo de una cuenta se
proyecta como **`free` · `signing` · `broadcast`** (`AccountLockState`, `approvals/queue.ts:692-695`).
Pasa a `signing` antes de firmar (`queue.ts:730-768`), a `broadcast` al recibir el hash
(`queue.ts:782-806`), se elimina con `tx_confirmed`/`tx_failed`/`tx_reverted` o al vencer el TTL
(`queue.ts:807-830`) y se reconstruye al arrancar (`reconcile.ts:356-449`, `:204-315`).

### Estado de integridad de la cartera

Literales: **`absent` · `ok` · `damaged`** (`IntegrityStatus`, `crypto/integrity.ts:34`; el mismo trío
en `catalog.ts:589`). El cálculo es `damaged ? 'damaged' : empty ? 'absent' : 'ok'`
(`integrity.ts:237`), con la etiqueta `Wallet dañada` (`:31`), los avisos `mnemonic-shape`,
`mnemonic-checksum`, `address-shape`, `address-checksum`, `imported-key-mismatch` y
`current-account-missing` (`:37-43`) y la puerta de uso `isWalletUsable` (`:275-276`).

### Estado de la ventana única de aprobación

Estado persistido `ApprovalWindow` (`types.ts:336-341`), con `FocusAction` (`opened` · `re-rendered` ·
`focused` · `closed` · `unchanged` · `none`, `focus.ts:375`). Inicial en `state/schema.ts:274-279`.

| Estado | Invariante | Módulo y línea |
|---|---|---|
| `windowId === null` | No hay ventana abierta | `approvals/focus.ts:459-468` |
| `windowId !== null` | Exactamente una ventana `notification.html`, en 420 × 640 | `approvals/focus.ts:145-172`, `:301`, `:72-73` |
| `shownApprovalId` | Siempre la `pending` más antigua (FIFO) | `approvals/focus.ts:411-420`, `:612` |
| La mostrada deja de ser `pending` | Se re-renderiza la siguiente en la **misma** ventana | `approvals/focus.ts:612-644` |
| No queda ninguna `pending` | Se cierra la ventana y se escribe `windowId: null` | `approvals/focus.ts:645-651` |
| Ventana cerrada por el usuario | `handleApprovalWindowRemoved` decide el desenlace | `approvals/focus.ts:755-761` |
| Reconciliación al arrancar | Se re-descubre por URL (M18) y se restablece el invariante | `approvals/reconcile.ts:356-449` |

### Otros estados con literales cerrados

- **Reset**: `ResetWalletStatus` = `done` · `blocked` · `cancelled` · `failed` (`state/schema.ts:507`),
  con el orden estricto `RESET_GUARD_ORDER` (`:460-465`) aplicado por `checkResetGuards` (`:479-500`) y
  `resetWallet` (`:618-662`).
- **Ventana de tasa**: se reinicia si el reloj va por delante o si `now - approvalWindowStart >=
  rateLimitWindowMs` (`rpc/rateLimit.ts:109-150`); `tokens <= 0` rechaza sin ejecutar
  (`rateLimit.ts:151-179`) y se reconstruye al arrancar (`:240-266`). El origen `extension` está exento
  (`rateLimit.ts:94`).
- **Alarmas**: `truekeate_expire:<approvalId>` (`timeout.ts:118`) y
  `truekeate_expire:inflight:<address>` (`:126-140`), rearmadas por `rearmExpiryAlarms` (`:284`) y
  purgadas en el reset (`state/schema.ts:566-580`).

## Divergencias

Contraste entre `RepoTecnico/diccionario_datos.md` (norma) y el código real; se documentan las dos
versiones y ninguna se ha «corregido» desde este manual.

| Aspecto | Diccionario (norma) | Código real | `ruta:línea` |
|---|---|---|---|
| `TypedDataPreview` | Incluye `messageHash`, `messageBytes` y `redacted` | `types.ts` **no** los declara; viven en el tipo ampliado `TypedDataPreviewResult` | norma: `diccionario_datos.md:533-535`; código: `types.ts:225-242`, `approvals/preview.ts:341-348` |
| `PersonalSignPreview` | Incluye `payloadHash` y `truncated` | `types.ts` **no** los declara; viven en `PersonalSignPreviewResult` | norma: `diccionario_datos.md:547-548`; código: `types.ts:245-252`, `approvals/preview.ts:504-509` |
| `PendingRequest.requestId` | No figura en la tabla de §2.8 | Campo opcional de correlación del salto 1 (H-07) | norma: `diccionario_datos.md:163-181`; código: `types.ts:284-295` |
| `DappSession` | §2.7 no declara `tabIds` ni `connected` | `types.ts` los declara obligatorios | norma: `diccionario_datos.md:129-136`; código: `types.ts:480-490` |
| `ConnectRequest.favicon` | `string \| null`, obligatorio | `favicon?: string`, opcional (ausente si no hay icono) | norma: `diccionario_datos.md:234`; código: `types.ts:302` |
| `TruekeateSettings` | §2.10 no declara `devNoticeAcceptedAt` | Campo opcional adicional (RNF-23) | norma: `diccionario_datos.md:250-265`; código: `types.ts:424` |
| Entidad volátil `expiryAlarms` | `Map<string, string>` en memoria | **No existe ese mapa**: las alarmas viven en `chrome.alarms` y se rearman por nombre | norma: `diccionario_datos.md:561`; código: `approvals/timeout.ts:284-312` |
| Entidad volátil `fifoByAccount` | `Map<Address, Promise<void>>` | **No existe** con ese nombre; el orden real está en `waitersByApprovalId` y en la marca persistida | norma: `diccionario_datos.md:562`; código: `approvals/decisions.ts:41`, `approvals/queue.ts:730` |
| `rmwLock` | Tipado `Promise<void>` | Es un objeto `SerialLock` (`run` + `depth`) | norma: `diccionario_datos.md:563`; código: `state/serialLock.ts:21-29`, `approvals/queue.ts:94` |
| `TRUEKEATE_EVENT` | §4.2 lo lista entre los mensajes de `chrome.runtime` | Se modela en `PageMessage`, no en `RuntimeMessage` (aunque viaja por `chrome.runtime` en el primer salto) | norma: `diccionario_datos.md:823`; código: `protocol.ts:78-95`, `:149-153` |
| Internos en §4.3 y §4.2 | §4.3 enumera 6 de los 7 originales y la tabla de contextos nombra 5 | El tipo y la lista declaran **16** internos | norma: `diccionario_datos.md:839`, `:863-866`; código: `types.ts:73-97`, `rpc/internalMethods.ts:28-48` |
| Causa `nodeRejected` (v1.13) | §4.3.4 la registra como causa documentada | **No hay fila propia en `errors.ts`**: se entrega con el literal de `estimateGasFailed` | norma: `diccionario_datos.md:963-967`; código: `rpc/errors.ts:158-162` |
| Clave no canónica | §4.3 no registra causa para «clave no canónica» | Se clasifica como `-32603` con `data.reason = 'non-canonical-key'` | norma: `diccionario_datos.md:883-913`; código: `state/schema.ts:255-264` |
| Claves extra del almacén | §2 declara **14** claves canónicas | `STORAGE_KEYS` declara 14 y, **fuera** de esa lista, `truekeate_schema_version` y `truekeate_logs_dropped` | norma: `diccionario_datos.md:38-463`; código: `state/schema.ts:37`, `:90` |

El encargo cita la omisión de `wallet_importMnemonic` en la tabla de §4.3: el propio tipo anota la
discrepancia y sigue el documento técnico (`types.ts:68-72`). El diccionario reconoce además la
desviación de `chainIdMismatch` al reutilizar el literal de `chainNotRegistered`, que el código
confirma (`diccionario_datos.md:957`, `errors.ts:683-688`).
### Pendiente de confirmar

- Si la ventana de aprobación pinta un indicador distinto del contador derivado de `pending` (`approvals/queue.ts:207-208`): el cálculo existe, pero su pintado pertenece a la UI, no leída aquí.
- La versión exacta del manifiesto y su `minimum_chrome_version`: no se ha leído `src/manifest.ts`.
