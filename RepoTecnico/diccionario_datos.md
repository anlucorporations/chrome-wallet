# 🗂️ Diccionario de Datos — TrueKeate Wallet

> **Fase:** 1 — Concepto · **Versión:** 1.6
> Se actualiza de forma incremental durante el desarrollo. Fuente de verdad de claves de `chrome.storage.local`, mensajes y entidades en memoria.
> **v1.3:** cierra los hallazgos H-02, H-07, H-08, H-09, H-10, H-11a, H-11b, H-18, H-21, H-22, H-23, H-24, H-31, H-32, H-33, H-39, H-41 y H-42 de `INFORME_OPTIMIZACION_V1.md`. Detalle en §6.2 y §7.
> **v1.4:** cierra los hallazgos **ACU-03, ACU-04, ACU-05, ACU-06, ACU-16, ACU-17, ACU-25 y ACU-27** de `casos_uso/AUDITORIA_CASOS_USO_V1.md` con las decisiones **D-A, D-B, D-D, D-E, D-F, D-G** y **P-19**. Detalle en §6.3 y §7.
> **v1.5:** cierra los hallazgos **ADT-08, ADT-12, ADT-14, ADT-19, ADT-21, ADT-22, ADT-23, ADT-24, ADT-25, ADT-26 y ADT-30** de `AUDITORIA_DOCUMENTO_TECNICO_V1.md` con las decisiones **D-K, D-L, D-M, D-N, D-P, D-Q, D-R, D-S y D-T** y las decisiones del usuario **P-20, P-21 y P-22**. Nuevas claves `truekeate_inflight_tx`, `truekeate_rate_windows` y `truekeate_approval_window`, ventana única de confirmación, cota de payload de 64 KiB, cuota de 10 MB con fallo observable, tabla local cerrada de selectores y política de portapapeles del revelado. Detalle en §6.4 y §7.

---

## 1. Convenciones

| Prefijo / clave | Ámbito | Persistencia | Sensibilidad |
|---|---|---|---|
| `truekeate_` (resto de claves) | `chrome.storage.local`, accesible desde el Service Worker, el popup y las páginas de la extensión | Persistente | Mixta (ver columna) |
| `truekeate_logs` | `chrome.storage.local`; **lo escribe siempre el Service Worker** y el popup solo lo lee (H-09) | Persistente; **excluida de la limpieza de `resetWallet`** (RF-32) | Baja |
| *sin prefijo* | Memoria volátil del Service Worker (`Map` de puertos, ventanas, alarmas y colas) | Volátil (se pierde al dormirse el SW); reconstruible desde `chrome.storage.local` (RNF-08) | Alta |

Tipos: `Address` = string `0x` + 40 hex · `Hex` = string `0x…` · `WeiString` = string decimal (BigInt serializado) · `ChainIdHex` = string `0x…` · `uuid` = string UUID v4.

Notas vinculantes:

- **Prefijo obligatorio:** todo identificador persistido usa el prefijo `truekeate_`. La nomenclatura heredada `codecrypto_*` y `window.codecrypto` que aparece en `GUIA_RAPIDA_TESTING.md` (documentación del intento previo, P-10/DEC-09) **no es válida**: no debe copiarse ni implementarse (H-24).
- **Claves canónicas y nombre completo obligatorio (ACU-25).** Toda clave de `chrome.storage.local` se cita en este corpus **siempre** con su nombre completo con prefijo: `truekeate_settings`, `truekeate_networks`, `truekeate_accounts`, `truekeate_connected_sites`, `truekeate_pending_requests`, `truekeate_connect_request`, `truekeate_logs`, `truekeate_chain_id`, `truekeate_current_account`, `truekeate_imported_accounts`, `truekeate_mnemonic`, `truekeate_inflight_tx` (§2.12), `truekeate_rate_windows` (§2.13) y `truekeate_approval_window` (§2.14). **No existe ningún almacén llamado `settings.*`** (ni `settings.networks`): el nombre corto del campo (`settings.sessionTtlMs`, `settings.logLimit`, …) solo se admite **dentro de las propias filas de la tabla de `truekeate_settings`** (§2.10) y en la tabla de constantes de `entornos_globales.md` §3. Escribir `settings.networks` donde la clave real es `truekeate_networks` es un defecto de nomenclatura, no una abreviatura válida.
- **No hay `localStorage` en ningún componente.** El Service Worker de MV3 no lo tiene y el popup no lo usa; los logs viven en `chrome.storage.local` (§2.11).
- **Clave de origen canónica:** minúsculas y sin barra final; el puerto **forma parte** de la clave (`http://localhost:5174`) (H-33, §2.7).
- **Nivel de acceso al storage:** el SW ejecuta `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` al arrancar, para que ningún content script pueda leer el contenido de `chrome.storage.local` (H-32). Requiere el permiso `storage` ya previsto.
- **Almacén único: `chrome.storage.local`; `chrome.storage.sync` está prohibido (ADT-26 / D-S).** El proyecto **nunca** usa `chrome.storage.sync` ni `chrome.storage.session`, no declara `unlimitedStorage` y **jamás** migra ni replica claves `truekeate_*` a un almacén sincronizado: la sincronización accidental enviaría `truekeate_mnemonic` y las claves privadas a los servidores de la cuenta del navegador, rompiendo RNF-09 y RE-02. Dos comprobaciones lo garantizan: (a) `grep -rn "storage.sync" src/` debe devolver **0** coincidencias, con un test que falla si aparece (análogo al `grep` de `codecrypto_`); (b) ninguna clave `truekeate_*` se escribe fuera de `chrome.storage.local`. El único almacén es `local`, y su cuota y su modo de fallo se declaran en §2.15.
- **Cuota declarada de `chrome.storage.local` (ADT-14 / D-M):** **10 MB**, la cuota por defecto del almacén desde Chrome 114 (que es el `minimum_chrome_version` exigido). **No** se añade `unlimitedStorage`; el desbordamiento se hace observable según §2.15.

---

## 2. Entidades y claves de `chrome.storage.local`

### 2.1 `truekeate_mnemonic`

| Campo | Tipo | Obligatorio | Descripción | Origen | Sensible |
|---|---|---|---|---|---|
| — | `string` | Sí (si la wallet se creó por frase) | Frase BIP-39 de 12 palabras separadas por espacio, normalizada en minúsculas y con espacios simples. | RF-01/RF-02 | 🔴 Sí |

*Ejemplo:* `"test test test test test test test test test test test junk"`
*Nota:* si la wallet se creó solo con cuentas importadas por clave privada, esta clave puede no existir. Nunca se registra en `truekeate_logs` ni viaja por mensaje alguno (RNF-09, H-42).

---

### 2.2 `truekeate_accounts`

| Campo | Tipo | Descripción |
|---|---|---|
| — | `string[]` (Address) | Direcciones derivadas en orden BIP-44 `m/44'/60'/0'/0/i`. El índice del array **es** el índice de derivación. |

*Ejemplo:* `["0xf39F…2266","0x7099…79C8","0x3C44…93BC","0x90F7…b906","0x15d3…6A65"]`

---

### 2.3 `truekeate_imported_accounts`

> **Nuevo (RF-05, RF-06).**

| Campo | Tipo | Obligatorio | Descripción | Validación |
|---|---|---|---|---|
| `address` | `Address` | Sí | Dirección derivada de la clave privada. | Debe cumplir checksum EIP-55. |
| `privateKey` | `Hex` (32 bytes) | Sí | Clave privada importada. | 64 hex, rango válido de curva secp256k1. |
| `label` | `string` | No | Etiqueta editable por el usuario (por defecto `Importada N`). | ≤ 32 caracteres. |
| `importedAt` | `number` (epoch ms) | Sí | Fecha de importación. | — |
| `visible` | `boolean` | Sí | Si se muestra en la lista de cuentas. | — |

---

### 2.4 `truekeate_current_account`

| Campo | Tipo | Descripción | Validación |
|---|---|---|---|
| — | `string` | Identificador de la cuenta activa en el popup. Formato `idx:<n>` para derivadas o `imp:<address>` para importadas. | Debe existir en `truekeate_accounts` o `truekeate_imported_accounts`. |

*Ejemplo:* `"idx:0"` (retrocompatible con el formato antiguo `"0"`).

---

### 2.5 `truekeate_chain_id`

| Campo | Tipo | Descripción | Valores iniciales |
|---|---|---|---|
| — | `ChainIdHex` | Red activa. | `"0x7a69"` (Anvil 31337). **Única red incluida por defecto (P-02: sin Sepolia).** |

---

### 2.6 `truekeate_networks`

> **Nuevo (RF-23).** Por decisión P-02 el sistema arranca con **una sola red** (Anvil local); las demás se añaden en tiempo de ejecución con `wallet_addEthereumChain` o desde la UI.
> **Permiso de host en runtime, siempre y por red (ACU-27 / D-G, RT-04).** El alta de una red **siempre** solicita `chrome.permissions.request` para su `rpcUrl` —**también cuando el alta la inicia el popup**: el clic del usuario es el gesto válido que exige la API y no hay excepción por contexto—. La concesión se registra **por red** (es el propio registro de `truekeate_networks` el que da fe de la red autorizada) y, si el usuario **deniega** el permiso, la red **no se persiste** (no se escribe en `truekeate_networks`) y la llamada se resuelve con `4001` y mensaje específico «No se concedió el permiso de acceso a `<rpcUrl>`; la red no se ha añadido.» (§4.3). El conjunto declarado en el manifest se mantiene en mínimos privilegios (`optional_host_permissions`, nunca comodines nuevos en `host_permissions`).

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `chainId` | `ChainIdHex` | Sí | Clave del mapa. |
| `chainIdDecimal` | `number` | Sí | Para el campo `chainId` de EIP-712 y `wallet_addEthereumChain`. |
| `name` | `string` | Sí | Nombre visible (ej. "Anvil Local"). |
| `rpcUrl` | `string` (URL http/https) | Sí | Endpoint JSON-RPC. Debe estar en el `host_permissions` declarado **o** obtenerse con `chrome.permissions.request` en runtime al dar de alta la red (§4.3, ACU-27). |
| `symbol` | `string` | Sí | Símbolo de la moneda nativa (ej. `ETH`). |
| `decimals` | `number` | No (18) | Decimales de la moneda nativa. |
| `explorerUrl` | `string` | No | URL del explorador (puede no existir en local). |
| `isTestnet` | `boolean` | Sí | Marca visual de red de pruebas. |
| `isDefault` | `boolean` | Sí | Red usada al primer arranque. **El alta en runtime nunca activa una red**: toda red añadida con `wallet_addEthereumChain` se persiste con `isDefault: false` (ADT-25 / P-22). |

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

**El alta añade, no activa (ADT-25 / P-22).** `wallet_addEthereumChain` **solo** persiste la entrada nueva en `truekeate_networks` con `isDefault: false`. **No** escribe `truekeate_chain_id`, **no** emite `chainChanged`, **no** crea un `PendingRequest` de cambio de red y **no** altera la red activa: la instrumentación del alta es `event: 'network_added'` y nunca `chain_changed`. Para **usar** la red recién añadida hace falta una llamada aparte a `wallet_switchEthereumChain`, con su propia aprobación en la ventana única (§4.3, §3.8). Queda cerrada así la elusión de ADR-16 («cambiar la red activa exige aprobación específica»): envolver el cambio dentro de un alta ya no cambia nada. La ventana de confirmación del alta muestra los datos de la red **y** el aviso explícito de que la red **no** se activará.

---

### 2.7 `truekeate_connected_sites`

> **RF-25, RF-17, RF-26.** Mapa `origin normalizado → sesión de dApp`.

| Campo | Tipo | Descripción |
|---|---|---|
| *clave* | `string` | **Origen normalizado canónico**: esquema + host + puerto, todo en minúsculas y **sin barra final** (ej. `http://localhost:5174`). El puerto forma parte de la clave; `http://localhost:5174/` y `HTTP://LOCALHOST:5174` se normalizan a la misma entrada. |
| `account` | `Address` | Cuenta compartida con ese origen. |
| `chainId` | `ChainIdHex` | Red en el momento de la conexión. |
| `connectedAt` | `number` | Epoch ms. |
| `lastUsedAt` | `number` | Epoch ms. Se refresca en cada `eth_accounts`/`eth_requestAccounts` atendido; base del vencimiento de sesión (RF-25, H-33). |
| `expiresAt` | `number \| null` | Epoch ms. Caducidad de la sesión: `lastUsedAt + truekeate_settings.sessionTtlMs` (**24 h renovables**). `null` = sin caducidad. Al vencer, la sesión se elimina de `truekeate_connected_sites`, `eth_accounts` devuelve `[]` y el origen debe volver a pasar por `eth_requestAccounts` (RF-17, RF-25). |

*Ejemplo:*
```json
{
  "http://localhost:5174": {
    "account": "0xf39F…2266", "chainId": "0x7a69",
    "connectedAt": 1730000000000, "lastUsedAt": 1730000000000, "expiresAt": 1730086400000
  }
}
```

*Notas vinculantes (H-24, H-33; caducidad: ACU-17 / D-B):*
- Una sola forma canónica de clave. Los ejemplos de `GUIA_RAPIDA_TESTING.md` (`codecrypto_connected_sites` con **valor string**) corresponden al intento previo (P-10) y **no deben copiarse**: dos contratos de storage distintos romperían RF-25/RF-17/RF-26.
- La revocación (RF-26) elimina la entrada por su clave normalizada; por eso el `origin` que envía la dApp debe normalizarse antes de consultar el mapa.
- **Caducidad de sesión respaldada por RF-25 (D-B).** La fórmula `expiresAt = lastUsedAt + truekeate_settings.sessionTtlMs`, con `sessionTtlMs = 86400000` (**24 h renovables en cada uso**), ya no es una entidad sin requisito: **RF-25** la incorpora con su criterio y su evidencia (RF-25 lo actualiza otro agente en `requerimientos.md`).
- **Comportamiento al vencer (cadena completa y verificable).** Superado `expiresAt`: (1) la entrada se **elimina** de `truekeate_connected_sites`; (2) `eth_accounts` de ese origen devuelve **`[]`** sin abrir ventana (RF-17, RNF-11); (3) el origen debe **volver a pasar por `eth_requestAccounts`** (`connect.html`) para obtener sesión; (4) como `lastUsedAt` se refresca en cada uso, una sesión en uso continuo renueva su plazo y no caduca. La caducidad **no** emite `4001` ni ningún error: es un cambio de estado que se refleja en `truekeate_logs` con `event: 'accounts_changed'` y lista vacía.

---

### 2.8 `truekeate_pending_requests` — cola persistida de solicitudes de firma/aprobación

> **RF-19, RF-20, RF-21, RF-26, RF-35, RF-37, RF-38, RF-40. Remodelada en v1.3 (H-08).**
> Estructura: **`Record<approvalId, PendingRequest>`**. Sustituye a la clave única `truekeate_pending_request` de v1.2, que persistía los campos en la raíz y hacía que la segunda solicitud **sobrescribiera** a la primera. No hay alias ni migración: no existe código previo.

Campos de cada `PendingRequest`:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `approvalId` | `uuid` | Sí | Clave del mapa y correlación de la respuesta (§3.4). Único en el espacio global de identificadores: nunca colisiona con `requestId` (§2.9). |
| `method` | `string` | Sí | `eth_sendTransaction` \| `eth_signTypedData_v4` \| `personal_sign` \| `wallet_switchEthereumChain` \| `wallet_addEthereumChain` \| `wallet_revokePermissions`. Alineado con el catálogo §4.3 (H-23). **`eth_sign` no figura** (H-11a). |
| `params` | `unknown[]` | Sí | Parámetros originales de la llamada RPC. Es el **payload de firma**: se persiste íntegro —la firma debe sobrevivir a la suspensión del SW— pero **acotado a `MAX_PAYLOAD_BYTES = 65536`** (64 KiB, §3.9); por encima de la cota la solicitud **no se crea** y se responde `-32602`. Nunca se copia a `truekeate_logs` (allí se aplica siempre la redacción de §2.11) ni se exporta. |
| `origin` | `string` | Sí | Origen normalizado (§2.7) de la dApp solicitante. |
| `tabId` | `number \| null` | Sí | Pestaña que originó la solicitud (`null` si nace en el popup, p. ej. `wallet_revokePermissions` de RF-26). |
| `frameId` | `number \| null` | Sí | Frame solicitante (`0` = frame principal; `null` junto a `tabId`). |
| `account` | `Address` | Sí | Cuenta que firmará. |
| `chainId` | `ChainIdHex` | Sí | Red activa al crear la solicitud. |
| `txPreview` | `TxPreview` | No | Solo en `eth_sendTransaction` (ver §3.1). |
| `typedDataPreview` | `TypedDataPreview` | No | Solo en `eth_signTypedData_v4` (ver §3.2). |
| `signMessagePreview` | `PersonalSignPreview` | No | Solo en `personal_sign` (ver §3.3). |
| `createdAt` | `number` | Sí | Epoch ms. **Ancla del cómputo del plazo** (RF-40, H-07) y **orden FIFO de la cola**: la ventana única muestra siempre la `pending` con `createdAt` más antiguo (§3.8). |
| `expiresAt` | `number` | Sí | Epoch ms: `createdAt + SIGN_TIMEOUT_MS` (120 000 ms). |
| `status` | `'pending' \| 'approved' \| 'rejected' \| 'expired'` | Sí | Estado del ciclo de vida. Solo `pending` bloquea la cola. |
| `resolvedAt` | `number` | No | Epoch ms de la transición fuera de `pending`. |
| `errorCode` | `number` | No | Código EIP-1193 emitido al resolver (§4.3). |
| ~~`windowId`~~ | — | — | **Retirado en v1.5 (ADT-22 / P-21).** Deja de ser un campo por solicitud: existe **una única** ventana de confirmación global y su identificador vive en `truekeate_approval_window` (§2.14). Se conserva la fila tachada como traza de la migración. |

*Ejemplo (clave = `approvalId`):*
```json
{
  "8f1c2a90-4d3e-4c1b-9f77-0e2b7c5a1d33": {
    "approvalId": "8f1c2a90-4d3e-4c1b-9f77-0e2b7c5a1d33",
    "method": "eth_sendTransaction",
    "params": [{ "from": "0xf39F…2266", "to": "0x7099…79C8", "value": "0xde0b6b3a7640000" }],
    "origin": "http://localhost:5174",
    "tabId": 42, "frameId": 0,
    "account": "0xf39F…2266", "chainId": "0x7a69",
    "txPreview": { "nonceInformativo": 3 },
    "createdAt": 1730000000000, "expiresAt": 1730000120000,
    "status": "pending"
  }
}
```

**Reglas de escritura (H-08).** `chrome.storage.local` no tiene transacciones, así que:

1. **Read-modify-write serializada.** El Service Worker serializa toda mutación en una cola FIFO interna (`rmwLock`, §3.4): `get('truekeate_pending_requests')` → mutar una copia en memoria → `set` de la clave completa. Nunca se escriben subclaves ni se hace `set` parcial.
2. **Único escritor.** Solo el Service Worker escribe la cola. El popup, `notification.html`, `connect.html` y los content scripts solo leen; su comunicación con la cola es por mensaje (§4.2) o por puerto (§3.4).
3. **Purga al arrancar el SW (y al expirar).** Se eliminan las entradas con `status !== 'pending'` o con `expiresAt <= now`, previa emisión de `4001` a las huérfanas (§3.4). El SW no conserva historial de solicitudes resueltas.

**Cardinalidad, desbordamiento y tasa (H-18, RF-37).**

| Regla | Valor | Comportamiento al superarlo |
|---|---|---|
| Máximo global de solicitudes `pending` | `truekeate_settings.pendingRequestsMax = 8` | La nueva solicitud se rechaza de inmediato con `4001` (mensaje en español); **no** se persiste, **no** se abre ventana y **no** cuenta para el badge. Se registra en `truekeate_logs`. |
| Máximo por origen | `truekeate_settings.pendingRequestsMaxPerOrigin = 1` | La segunda solicitud del mismo origen mientras la primera esté `pending` se rechaza con `4001`. Evita la fatiga de aprobación dentro de la ventana única (H-18, H-35). |
| Límite de tasa por origen | `truekeate_settings.pendingRequestsPerMinute = 6` | Pasado el umbral en la ventana de 60 s, se rechaza con `4001` sin abrir ventana. Convive con el *token bucket* de todo el catálogo (§2.13): gobierna el límite que resulte **más estricto**. |
| Solicitudes mostradas a la vez | **1** (ventana única global, §3.8) | El resto **espera en la cola** sin ventana; se muestran al resolverse la actual. Nunca se abre una segunda ventana. |
| Duplicado exacto | mismo `origin` + `method` + `params` | Se trata como la regla «máximo por origen»: se rechaza con `4001` mientras la primera siga `pending`; una vez resuelta, se admite una nueva. |
| Unicidad de identificadores | `approvalId` y `requestId` son `uuid` v4 en un espacio global compartido | El SW rechaza con `-32603` cualquier identificador ya presente en `truekeate_pending_requests` o en `truekeate_connect_request`. |

**Dos solicitudes del mismo origen y cuenta (regla explícita).** Nunca hay dos `PendingRequest` `pending` con el mismo `origin`. Si además comparten `account`, la segunda se rechaza con `4001` (no se encola en espera) y el `errorCode` queda registrado; el dApp puede reintentar cuando la primera termine.

**Ventana única de confirmación global (ADT-22 / P-21).** Existe **una sola** ventana `notification.html` en todo el navegador, gobernada por el SW y registrada en `truekeate_approval_window` (§2.14). Muestra **una** solicitud a la vez —la `pending` con `createdAt` más antiguo (FIFO)— y **el resto espera en la cola persistida** de esta misma clave: **no** se abre una segunda ventana por origen, ni por método, ni por cuenta, ni por acumulación de pendientes. Al aprobarse, rechazarse o vencer la solicitud mostrada, la **misma** ventana pasa a renderizar la siguiente `pending`; solo se cierra cuando no queda ninguna. El **contador de pendientes** (`Object.values(map).filter(r => r.status === 'pending').length`) es el que alimenta el badge del icono y el indicador «N en espera» de la propia ventana. Con esto desaparece el *approval fatigue* que permitía hasta 8 ventanas de confirmación simultáneas (8 pendientes globales).

**Índice derivado del badge (RF-38).** El badge **no** se persiste: es un índice derivado que se recalcula tras cada escritura o purga como `Object.values(map).filter(r => r.status === 'pending').length` y se aplica con `chrome.action.setBadgeText` / `setBadgeBackgroundColor`. Regla de conteo: **global**, suma de todas las solicitudes `pending` de todos los orígenes y tipos (no por origen ni por tipo). Al purgar (expiración, aprobación, rechazo, cierre de ventana) el badge se recalcula y, si el total es 0, se limpia (`setBadgeText({ text: '' })`) (H-07, H-18).

---

### 2.9 `truekeate_connect_request` — solicitudes de conexión

> **RF-16, RF-36. Remodelada en v1.3 (H-18).**
> Estructura: **`Record<requestId, ConnectRequest>`** (mismo motivo que §2.8: con una clave única, dos orígenes que pidan conexión a la vez se sobrescribirían). Se conserva el nombre de clave por continuidad documental; ninguna decisión autoriza renombrarlo.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `requestId` | `uuid` | Sí | Clave del mapa. Espacio global compartido con `approvalId` (§2.8). |
| `origin` | `string` | Sí | Origen normalizado de la dApp (§2.7). |
| `favicon` | `string \| null` | No | URL del favicon, **construida siempre por el SW** contra el servicio de favicons del navegador: `chrome-extension://<id>/_favicon/?pageUrl=<origin codificado>&size=32` (permiso `favicon` en el manifest). Se **sanea** antes de renderizar: solo se admiten URLs `chrome-extension://<id>/_favicon/…` generadas por el propio SW; se **rechazan** `data:`, `blob:`, `javascript:` y cualquier URL remota, y **nunca** se acepta un favicon propuesto por la dApp. Si el servicio no devuelve icono, `null` y la UI usa el activo local por defecto. Contrato completo en §3.8. |
| `accounts` | `Address[]` | Sí | Cuentas ofrecidas al usuario. |
| `currentAccountIndex` | `number` | Sí | Preselección inicial. |
| `chainId` | `ChainIdHex` | Sí | Red actual. |
| `tabId` | `number` | Sí | Pestaña solicitante (para resolver por `chrome.tabs.sendMessage`). |
| `frameId` | `number` | Sí | Frame solicitante. |
| `createdAt` | `number` | Sí | Epoch ms. |
| `expiresAt` | `number` | Sí | Epoch ms (`createdAt + CONNECT_TIMEOUT_MS = 60000`; RF-40). |
| `status` | `'pending' \| 'approved' \| 'rejected' \| 'expired'` | Sí | Estado del ciclo de vida. |

*Reglas:* máximo **1 solicitud `pending` por origen**; el resto se rechaza con `4001`. La purga, la escritura serializada y el índice del badge son los mismos que en §2.8 (el badge suma `pending` de ambas colecciones). El vencimiento se dispara con `chrome.alarms` y el dueño del plazo es el SW (§3.4).

---

### 2.10 `truekeate_settings`

| Campo | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `derivedAccountCount` | `number` | `5` | Cuentas a derivar al cargar la wallet; el botón "Añadir cuenta" lo incrementa y extiende `truekeate_accounts` (RF-04, P-04). |
| `accountLabels` | `Record<indice, string>` | `{}` | **Nuevo (ACU-06 / D-F).** Etiqueta **opcional** por **índice de derivación BIP-44** (`m/44'/60'/0'/0/i`) de las cuentas derivadas del mnemonic (ej. `{ "0": "Cuenta principal", "3": "Pruebas" }`). Máximo 32 caracteres por etiqueta, igual que `truekeate_imported_accounts[].label`. |
| `balancePollMs` | `number` | `5000` | Intervalo de polling de saldos (RF-27, RNF-03). Semántica en la nota inferior (H-21). |
| `balancePollMaxAccounts` | `number` | `10` | Máximo de cuentas polleadas por ciclo cuando la lista crece (RNF-03, H-21). |
| `logLimit` | `number` | `500` | Máximo de entradas de log retenidas globalmente (RF-32). |
| `logMaxPerOrigin` | `number` | `200` | Máximo de entradas de log retenidas por origen (H-42). |
| `sessionTtlMs` | `number` | `86400000` | Caducidad de la sesión de dApp desde `lastUsedAt` (**24 h renovables**) (§2.7, H-33, ACU-17 / D-B). **Respaldada por RF-25.** |
| `pendingRequestsMax` | `number` | `8` | Máximo global de solicitudes `pending` (§2.8, H-18). |
| `pendingRequestsMaxPerOrigin` | `number` | `1` | Máximo de solicitudes `pending` por origen (§2.8, H-18). |
| `pendingRequestsPerMinute` | `number` | `6` | Límite de tasa por origen (§2.8, H-18). |
| `language` | `'es' \| 'en'` | `'es'` | Idioma de la UI (P-09). |
| `encryptionEnabled` | `boolean` | `false` | Cifrado del mnemonic — **descartado en P-03**; el flag se conserva por compatibilidad. |
| `requirePasswordOnOpen` | `boolean` | `false` | Bloqueo del popup (P-03). |

**Etiquetas de cuentas: dos orígenes, un solo renombrado (ACU-06 / D-F).** `accountLabels` (arriba) guarda las etiquetas de las **cuentas derivadas** por índice BIP-44 y `truekeate_imported_accounts[].label` (§2.3) guarda las de las **importadas** por dirección. Son complementarios y alimentan **el mismo renombrado de la UI**: la acción «Renombrar» escribe en uno u otro según el tipo de cuenta (`idx:<n>` → `accountLabels`, `imp:<address>` → `truekeate_imported_accounts[].label`), y la lista de cuentas muestra una única etiqueta por fila. Si no hay etiqueta, se aplica el nombre por defecto (`Cuenta N` para derivadas, `Importada N` para importadas).

**Semántica del polling de saldos (H-21, RF-27, RNF-03).**

- **Dueño:** el popup, y `connect.html` mientras está abierta. **Nunca** el Service Worker (`setInterval` no sobrevive a la suspensión del SW).
- **Ciclo:** ventana de `balancePollMs = 5000` ms. Un ciclo = una pasada de lectura por cada cuenta visible.
- **Disparador:** montaje del popup o apertura de `connect.html` (lectura inmediata y, después, `setInterval(balancePollMs)`).
- **Parada:** desmontaje del popup o cierre de `connect.html` (limpieza explícita del intervalo); pestaña oculta (`document.visibilityState === 'hidden'` pausa; al volver a `visible` se relanza con lectura inmediata); cambio de cuenta o de red (reinicia el ciclo); RPC caído (RNF-07: se conserva el último saldo y se muestra "desconectado" sin acumular llamadas en vuelo).
- **Alcance por ciclo:** exactamente **1 `eth_getBalance` por cuenta visible**, hasta `balancePollMaxAccounts = 10`; por encima de ese máximo solo se pollean las visibles en el viewport.
- **Contador verificable en test:** el provider falso de Vitest cuenta invocaciones por `(método, cuenta)`; la aserción es `llamadasPorCuentaPorCiclo === 1` tras avanzar `balancePollMs` con *fake timers*, y `0` llamadas tras desmontar la vista.

---

### 2.11 `truekeate_logs`

> **Almacenada en `chrome.storage.local` y escrita siempre por el Service Worker** (el SW no tiene `localStorage`). El popup solo renderiza leyendo de storage (H-09). **RF-32 se cumple excluyendo `truekeate_logs` de la limpieza de `resetWallet`**, no moviéndola a `localStorage`.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` | Identificador de la entrada. |
| `ts` | `number` | Epoch ms. |
| `level` | `'info' \| 'success' \| 'warn' \| 'error'` | Nivel (colorea la UI: rojo = error, RF-30). |
| `category` | `'call' \| 'event' \| 'tx' \| 'sign' \| 'system'` | **Taxonomía** de la entrada (RF-28..RF-31). Es **independiente** de `event`: indica a qué familia pertenece la entrada, no qué ocurrió. |
| `event` | `EventName` (enum cerrado de **24** valores) | **Nuevo (ACU-04 / D-D).** Nombre del evento instrumentado: **qué ocurrió**. Enum cerrado alineado con el catálogo de `requerimientos.md` §2.2 y con RNF-16. **v1.5 (ADT-14 / D-M):** se añade `storage_quota_exceeded`. |
| `message` | `string` | Texto legible en español (RNF-06). |
| `origin` | `string` | Origen de la dApp o `extension`. |
| `method` | `string` | Método RPC implicado, si aplica. |
| `data` | `unknown` | Payload **redactado** según la tabla inferior (H-42). Nunca contiene payloads íntegros: por encima de `PREVIEW_INLINE_MAX_BYTES = 4096` se guarda **hash + longitud** (§3.9, D-L). |
| `txHash` | `Hex` | Solo en `category: 'tx'`: hash devuelto por `eth_sendTransaction` (H-22, RF-31). |
| `txStatus` | `'pending' \| 'confirmed' \| 'failed'` | Solo en `category: 'tx'`: estado observable de la transacción (§3.6, H-22). |

**Enum `event` — catálogo cerrado de 24 eventos (ACU-04 / D-D; `storage_quota_exceeded` en v1.5, ADT-14 / D-M, RNF-16).**

`rpc_call` · `rpc_error` · `event_emit` · `tx_sent` · `tx_confirmed` · `tx_failed` · `tx_reverted` · `sign_personal` · `sign_typed_data` · `approval_created` · `approval_resolved` · `approval_expired` · `chain_changed` · `accounts_changed` · `wallet_created` · `wallet_imported` · `account_imported` · `account_removed` · `reset_wallet` · `network_added` · `permission_revoked` · `sw_started` · `sw_reconcile` · `storage_quota_exceeded`

> **Delta de v1.5 (ADT-14 / D-M), ya espejado en todo el corpus (v1.6).** `storage_quota_exceeded` se instrumenta con `category: 'system'`, `level: 'error'` y `data: { code: -32603, key, bytesInUse, retried: true }` (§2.15). El conteo pasó de **23** a **24** eventos y **ya está listado en `requerimientos.md` §2.2 y en el `documento_tecnico.md` (M31)**: los tres enumeran los mismos 24 nombres. El registro histórico de la auditoría que cita «23» se conserva como prueba del cambio (regla de residuo del veredicto de reevaluación, §5.5).

*Ejemplo de entrada completa:*
```json
{
  "id": "1a2b3c4d-…", "ts": 1730000000000, "level": "info",
  "category": "call", "event": "rpc_call",
  "message": "Llamada a eth_getBalance de http://localhost:5174",
  "origin": "http://localhost:5174", "method": "eth_getBalance",
  "data": { "result": "0xde0b6b3a7640000" }
}
```

*Notas vinculantes:*
- **`event` y `category` son campos independientes.** `category` es la taxonomía (`call|event|tx|sign|system`) y `event` es el nombre del evento del catálogo. Cada `event` tiene una `category` canónica (p. ej. `chain_changed` → `event`; `tx_sent` → `tx`; `sw_started` → `system`), pero **nunca se usa una categoría como si fuera un evento**: `system`, `call`, `tx`, `sign` y `event` **no** son valores válidos de `event`. Queda así corregido el uso de `system`/`account_imported` como eventos (ACU-04).
- **Regla de RNF-16:** **una entrada por evento del catálogo**, sin excepciones; ninguna entrada se registra con un `event` fuera del enum, y cada emisión produce exactamente 1 entrada.
- **La derivación HD no es una importación (ACU-04).** Registrar la derivación de cuentas (`wallet_deriveAccounts`, botón «Añadir cuenta») **no** debe usar `account_imported`: ese evento está **reservado en exclusiva** a la importación por clave privada (RF-05, §2.3). La derivación se instrumenta con `event: 'rpc_call'` (método `wallet_deriveAccounts`) y, si cambia la lista visible de cuentas, con `event: 'accounts_changed'`.
- Las aprobaciones de `wallet_switchEthereumChain` y `wallet_addEthereumChain` (§4.3) usan `approval_created`/`approval_resolved`/`approval_expired` como cualquier otra aprobación; al aplicarse el cambio de red se registra `chain_changed` y al persistirse la red nueva, `network_added`.

**Política de redacción de `params` y `data` (H-42).** Nunca se persisten claves privadas, el mnemonic, ni firmas completas. Adicionalmente:

| Método | Qué se registra |
|---|---|
| Cualquiera | `from`/`to`/`origen`/`method`/resultado. **Prohibido**: `privateKey`, mnemonic, `signature` completa (se trunca a `0x1234…abcd`). |
| `eth_sendTransaction` | `from`, `to`, `value`, `nonce` informativo, `dataLength` y los primeros 10 bytes de `data`. |
| `personal_sign` | La dirección y el **hash** del mensaje (`sha256:…`); nunca el texto completo firmado. |
| `eth_signTypedData_v4` | `primaryType`, `domain.name`, `domain.chainId`, `domain.verifyingContract` y el **hash** del `message`; nunca el `message` completo. |
| `wallet_importPrivateKey`, `wallet_generateMnemonic` | Solo `origin`, `method` y el resultado (`ok`/`error`); ningún valor sensible. |

> **Regla única de `data` en logs (ADT-12 / D-T): los primeros 10 bytes.** Con independencia del método, cualquier `data` (calldata) que se registre se trunca a sus **primeros 10 bytes** (`0x` + 20 caracteres hexadecimales) acompañados de `dataLength`; **no** existe ninguna variante de 4 bytes (solo el selector) ni de payload íntegro. El literal es el mismo en `documento_tecnico.md` y en la implementación (`data.slice(0, 22)`), y un test de redacción (`redaction.spec.ts`) lo fija para impedir la divergencia que detectó la auditoría (el técnico decía «solo el selector»).
>
> **Cota de payload y redacción en reposo (ADT-21 / D-L).** En `truekeate_logs` no se escribe jamás un payload completo: por encima de `PREVIEW_INLINE_MAX_BYTES = 4096` solo se persisten `hash` + longitud (§3.9). El límite de aceptación de una solicitud es `MAX_PAYLOAD_BYTES = 65536` (64 KiB) y se comprueba **antes** de crear la entrada de la cola.

**Retención:** FIFO por `ts`; se descartan las entradas más antiguas al superar `logLimit = 500` global o `logMaxPerOrigin = 200` por origen. La limpieza de `resetWallet` (RF-11) **excluye** esta clave. Esta retención es la primera defensa frente al agotamiento de la cuota de 10 MB (§2.15): el presupuesto objetivo de `truekeate_logs` es **≤ 2 MB** con las 500 entradas.

**Criterio medible de ejemplo (H-09, RNF-16).** Un `eth_sendTransaction` ejecutado **con el popup cerrado** produce **≥ 3 entradas** en `truekeate_logs` con `ts`, `level` y `origin` (p. ej. `call` de entrada, `sign` de aprobación y `tx` con `txHash` en estado `pending`). La aserción se ejecuta sobre `chrome.storage.local`, no sobre el DOM del popup.

---

### 2.12 `truekeate_inflight_tx` — marca de «transacción en vuelo» por cuenta

> **Nuevo en v1.5 (ADT-23 / D-R).** Persiste la garantía «**máximo 1 transacción en vuelo por `from`**», que hasta v1.4 vivía solo en la `Map` en memoria `fifoByAccount` (§3.4) —estado que el propio §1 (fila «*sin prefijo*») y §3.4 declaran volátil y que el axioma A6 (el SW puede dormirse en cualquier momento) invalida—. Estructura: **`Record<Address, InflightTx>`**; **como máximo una entrada por dirección**.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `account` | `Address` | Sí | Clave del mapa: el `from` de la transacción. |
| `approvalId` | `uuid` | Sí | Solicitud aprobada que originó la difusión (§2.8). |
| `phase` | `'signing' \| 'broadcast'` | Sí | `signing` = aprobada y en firma/difusión (bloquea la cuenta); `broadcast` = ya difundida y a la espera de recibo (no bloquea). |
| `nonce` | `number` | No | Nonce definitivo recalculado al aprobar (`getTransactionCount(account, 'pending')`); imprescindible para reconciliar una difusión interrumpida. |
| `txHash` | `Hex \| null` | Sí | `null` mientras `phase === 'signing'`; hash devuelto por el nodo en `broadcast`. |
| `startedAt` | `number` | Sí | Epoch ms del paso a `signing`. Ancla del TTL. |
| `expiresAt` | `number` | Sí | `startedAt + INFLIGHT_TTL_MS` con `INFLIGHT_TTL_MS = 180000` (3 min, constante en `entornos_globales.md` §3). |

*Valor inicial:* `{}`.
*Ejemplo:*
```json
{
  "0xf39F…2266": {
    "account": "0xf39F…2266",
    "approvalId": "8f1c2a90-4d3e-4c1b-9f77-0e2b7c5a1d33",
    "phase": "broadcast", "nonce": 7,
    "txHash": "0x9c1f…7be2",
    "startedAt": 1730000000000, "expiresAt": 1730000180000
  }
}
```

**Reglas de la marca (D-R).**

1. **Escritura, en este orden:** `phase: 'signing'` se escribe **antes** de firmar (nunca después de difundir); al recibir el hash del nodo se reescribe la misma entrada con `phase: 'broadcast'` y `txHash`.
2. **Semántica de bloqueo:** `signing` **bloquea la cuenta** —una segunda aprobación de la misma `account` espera en la cola y la ventana única lo indica (§3.8)—; `broadcast` **no** la bloquea, porque el nonce ya está consumido y el siguiente se recalcula con `getTransactionCount(account, 'pending')` (§3.1). La entrada `broadcast` se conserva solo para el seguimiento del recibo.
3. **Borrado:** al registrar `tx_confirmed`/`tx_failed`/`tx_reverted` (§3.6) o al vencer `expiresAt`.
4. **No es un `Map` de promesas ni resuelve nada:** es una marca de exclusión mutua persistida. La `Map` `fifoByAccount` queda como mero índice de encadenamiento dentro de la vida del SW y **deja de ser la garantía**.
5. **Segunda aprobación con marca `signing` vigente:** no se firma ni se difunde; la solicitud permanece `pending` y el usuario ve «hay una transacción en vuelo para esta cuenta». Se difunde cuando la marca pase a `broadcast` o se libere.

**Reconstrucción al arrancar el Service Worker (misma pasada de reconciliación de §3.4).**

| Estado leído | Acción |
|---|---|
| `broadcast` y `eth_getTransactionReceipt(txHash)` devuelve recibo | Se elimina la marca y se registra `tx_confirmed`/`tx_failed` (§3.6). |
| `broadcast`, sin recibo, `expiresAt > now` | Se conserva la marca y se continúa el seguimiento del recibo. |
| `broadcast`, sin recibo, `expiresAt <= now` | Se elimina la marca y se registra `rpc_error` `-32603` con `data: { txHash }` (traza; el usuario puede verificar el hash en el nodo). |
| `signing` con `expiresAt <= now` | Se **libera** la marca (la cuenta se desbloquea) y se registra `rpc_error` `-32603` con `data: { phase: 'signing', nonce }`. **Nunca** se reintenta la firma automáticamente: si la difusión quedó a medias, el usuario debe verificar el nonce en el nodo. |
| `signing` con `expiresAt > now` | Se conserva la marca y se rearma el `alarm` de liberación en `expiresAt`. |

*Test de aceptación:* suspender el SW a mitad de una aprobación (`Stop service worker`) y comprobar que, tras el rearme, **no hay doble difusión**: como máximo **1** llamada a `eth_sendRawTransaction` por `(account, nonce)`.

---

### 2.13 `truekeate_rate_windows` — *token bucket* por origen y ventana de tasa persistida

> **Nuevo en v1.5 (ADT-23 / D-R y ADT-24 / D-Q).** El limitador de tasa por origen y la ventana de aprobaciones vivían en memoria; se persisten para sobrevivir a la suspensión del SW. Estructura: **`Record<origin, RateWindow>`** con la misma clave canónica de origen de §2.7 (minúsculas, sin barra final, con puerto).

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `tokens` | `number` | Sí | Saldo actual del *token bucket* (`0` … `rateLimitBurst`). |
| `lastRefillAt` | `number` | Sí | Epoch ms de la última recarga (la recarga es **perezosa**: se calcula al llegar la llamada). |
| `approvalWindowStart` | `number` | Sí | Epoch ms de inicio de la ventana deslizante de 60 s de solicitudes aprobables. |
| `approvalsInWindow` | `number` | Sí | Solicitudes **aprobables** contadas dentro de la ventana vigente (`pendingRequestsPerMinute`, §2.8/§2.10). |
| `deniedCount` | `number` | Sí | Rechazos acumulados por límite (diagnóstico; se refleja en `truekeate_logs`). |
| `updatedAt` | `number` | Sí | Epoch ms de la última escritura; base de la purga por inactividad. |

**Constantes congeladas** (`entornos_globales.md` §3; **no** son ajustes de `truekeate_settings`, para que no puedan debilitarse desde la UI):

| Constante | Valor | Ámbito |
|---|---|---|
| `rateLimitBurst` | `20` | Capacidad del *token bucket* por origen, en tokens (1 token = 1 llamada RPC de página). |
| `rateLimitRefillPerSecond` | `5` | Recarga lineal por segundo. |
| `rateWindowTtlMs` | `600000` | Purga de entradas inactivas (10 min sin uso = bucket lleno). |
| `RATE_PERSIST_DEBOUNCE_MS` | `1000` | *Debounce* máximo de escritura para los métodos **no** aprobables (máx. 1 escritura/s por origen). |

**Algoritmo (recarga perezosa) y decisión.**

```
elapsed = max(0, now - lastRefillAt) / 1000
tokens  = min(rateLimitBurst, tokens + elapsed * rateLimitRefillPerSecond)
tokens  = tokens - 1                  // la llamada actual consume 1 token
si tokens < 0  →  rechazo 4001        // no se ejecuta la llamada
```

**Cobertura: todo el catálogo RPC (ADT-24 / D-Q).** El *token bucket* se aplica a **todas** las invocaciones de página del catálogo de §4.3 —`eth_accounts`, `eth_chainId`, `eth_blockNumber`, `eth_getBalance`, `eth_estimateGas`, `eth_gasPrice`, `eth_feeHistory`, `eth_getTransactionByHash`, `eth_getTransactionReceipt` y también los métodos aprobables `eth_sendTransaction`, `eth_signTypedData_v4`, `personal_sign`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`, `wallet_revokePermissions`—, **no solo a los aprobables**. Así se cierra el abuso descrito en la auditoría: una dApp hostil ya no puede saturar `eth_getBalance`/`eth_estimateGas`/`eth_blockNumber` sin abrir ninguna ventana.

**Error devuelto al superarlo.** Se responde el objeto EIP-1193 `{ code: 4001, message: "Se ha superado el límite de llamadas para este origen; espera unos segundos y reintenta." }` (§4.3), **sin** abrir ventana, **sin** crear `PendingRequest`, **sin** ejecutar la llamada al nodo y **sin** tocar el badge. Se registra **1** entrada en `truekeate_logs` con `event: 'rpc_error'`, `level: 'warn'`, `code: 4001` y `data: { tokensRestantes: 0 }`, y se incrementa `deniedCount`.

**Residuo declarado.** Los contextos de la propia extensión (`origin === 'extension'`: popup, `connect.html`, `notification.html`) **no** consumen tokens: el *polling* de saldos de §2.10 agotaría el bucket en un ciclo de 10 cuentas. Es una exención explícita y medida por el contador RPC de §2.10; el tráfico de dApps nunca se exime.

**Escritura y reconstrucción.** Solo el SW escribe, con la RMW serializada de §2.8; los métodos **no** aprobables se persisten con `RATE_PERSIST_DEBOUNCE_MS = 1000` (máximo 1 escritura por segundo y origen) y los aprobables, en el mismo `set` de la cola. Al arrancar el SW: (1) se lee el mapa y se aplica la recarga perezosa con `now`; (2) se descartan las entradas con `now - updatedAt > rateWindowTtlMs` (equivale a bucket lleno); (3) si `lastRefillAt` o `approvalWindowStart` están en el futuro (reloj movido hacia atrás) la entrada se reinicia a `{ tokens: rateLimitBurst, lastRefillAt: now, approvalWindowStart: now, approvalsInWindow: 0 }`; (4) si `now - approvalWindowStart >= 60000` la ventana se reinicia con `approvalsInWindow = 0`. Residuo: una suspensión puede perder hasta 1 s de contabilidad (≈ 5 tokens de los métodos de lectura); el bucket nunca es la única defensa, porque la cardinalidad de RF-37/§2.8 sigue aplicando.

*Test de aceptación:* 100 llamadas de lectura seguidas desde el mismo origen → la llamada 21 se rechaza con `4001` y ninguna supera el ritmo de recarga (medido con reloj inyectado sobre `truekeate_rate_windows`).

---

### 2.14 `truekeate_approval_window` — ventana única de confirmación

> **Nuevo en v1.5 (ADT-22 / P-21).** Sustituye al índice volátil `windowsByApprovalId` de §3.4 y hace persistente la existencia de la **única** ventana `notification.html`, de modo que su cierre, su re-render y su re-descubrimiento sobrevivan a la suspensión del SW.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `windowId` | `number \| null` | Sí | Identificador de `chrome.windows` de la ventana única; `null` = no hay ventana abierta. |
| `shownApprovalId` | `uuid \| null` | Sí | Solicitud `pending` que la ventana está mostrando (`null` si está abierta sin ninguna `pending`). |
| `openedAt` | `number \| null` | Sí | Epoch ms de apertura (diagnóstico y orden de re-render). |
| `updatedAt` | `number` | Sí | Epoch ms de la última escritura. |

*Valor inicial:* `{ "windowId": null, "shownApprovalId": null, "openedAt": null, "updatedAt": 0 }`.

**Invariantes.**

1. `windowId !== null` implica **exactamente una** ventana `notification.html` en el navegador. Test negativo obligatorio: dos solicitudes simultáneas de orígenes distintos producen **1 sola** llamada a `chrome.windows.create`.
2. `shownApprovalId` es siempre la solicitud `pending` con `createdAt` más antiguo (FIFO). Las demás **esperan en la cola** de §2.8, sin ventana y sin estado propio.
3. Cuando `shownApprovalId` deja de estar `pending` —aprobada, rechazada, vencida o purgada—, el SW **re-renderiza la siguiente `pending` en la misma ventana**, sin cerrarla ni crearla de nuevo; si no queda ninguna, la cierra y escribe `windowId: null`, `shownApprovalId: null`.
4. **Ventana huérfana o recarga:** la reconciliación (§3.4) re-descubre la ventana filtrando `chrome.windows.getAll({ populate: true })` por la URL `chrome-extension://<id>/notification.html`; si hay `pending` y no hay ventana, se abre una y se rellena `shownApprovalId`; si hay ventana y `shownApprovalId` ya no está `pending`, se aplica la regla 3.
5. El **origen** y el **favicon** que muestra la ventana se reconstruyen siempre desde `shownApprovalId` y su `origin` persistido (§3.8), **nunca** desde estado propio de la ventana: recargar `notification.html` no puede cambiar lo que el usuario ve.
6. El **contador de pendientes** que la ventana muestra («N en espera») es el índice derivado de §2.8, no un campo persistido.

---

### 2.15 Cuota de `chrome.storage.local` y modo de fallo observable

> **Nuevo en v1.5 (ADT-14 / D-M).** Hasta v1.4 la cuota no se declaraba y el agotamiento habría sido un fallo **silencioso**.

| Aspecto | Decisión |
|---|---|
| Cuota declarada | **10 MB**. Es la cuota por defecto de `chrome.storage.local` desde Chrome 114, que es exactamente el `minimum_chrome_version` exigido por el proyecto. |
| `unlimitedStorage` | **No se declara y no se usará** aunque el almacén se llene: la política es reducir el consumo (retención FIFO de §2.11) y hacer el fallo observable. Queda **prohibido** añadirlo sin reabrir esta decisión. |
| Almacén | Solo `chrome.storage.local`. `chrome.storage.sync` prohibido (§1, ADT-26 / D-S). |
| Presupuesto por clave (peor caso) | `truekeate_logs` ≤ 500 entradas (**≤ 2 MB** objetivo) · `truekeate_pending_requests` ≤ 8 × 64 KiB = **512 KiB** · `truekeate_networks`, `truekeate_settings`, `truekeate_accounts`, `truekeate_imported_accounts`, `truekeate_connected_sites` < 64 KiB cada una · `truekeate_approval_window`, `truekeate_inflight_tx`, `truekeate_rate_windows` < 64 KiB. Total peor caso ≪ 10 MB. |
| Medición | `chrome.storage.local.getBytesInUse()` se registra en el evento `sw_started` (dato de diagnóstico en `truekeate_logs`; no se persiste un contador propio). |
| Umbral de aviso | 90 % de la cuota (≈ 9 MB): se activa el aviso del panel (estado de UI **no persistido**, mismo patrón que el badge de §2.8). |

**Modo de fallo observable (pasos, en orden).** Cuando un `set` se rechaza por cuota (`chrome.runtime.lastError`/`QuotaExceededError` con `QUOTA_BYTES`):

1. **1 reintento inmediato** de la misma escritura.
2. Si vuelve a fallar, según la clave:
   - `truekeate_logs`: se descarta la entrada más antigua (FIFO de §2.11) y se reintenta **una** vez más. Si el fallo persiste, la traza **no puede** persistirse —es precisamente el almacén de logs el que falla— y el fallo se hace observable por el **aviso del panel** y por consola (`[truekeate] storage quota exceeded`), sin bucle de escritura.
   - Clave crítica (`truekeate_settings`, `truekeate_accounts`, `truekeate_imported_accounts`, `truekeate_pending_requests`, `truekeate_networks`): la operación **se aborta** (nunca se deja estado a medias: o se escribe la clave completa o no se escribe) y, si la operación venía de una llamada RPC, esta se resuelve con **`-32603`** y el mensaje «No hay espacio de almacenamiento en la extensión: la operación no se ha guardado.» (§4.3).
3. **Entrada de log** (cuando la clave que falló **no** es `truekeate_logs`) con `event: 'storage_quota_exceeded'`, `category: 'system'`, `level: 'error'` y `data: { code: -32603, key, bytesInUse, retried: true }`.
4. **Aviso en el panel:** banner **no descartable** en el popup y en la ventana única mientras `bytesInUse` supere el 90 % de la cuota, con el texto «Almacenamiento de la extensión casi lleno: exporta y borra los logs (RF-32).». Es estado de UI, **no** se persiste.

*Test de aceptación:* con `truekeate_logs` inflado hasta agotar la cuota simulada, un `eth_sendTransaction` produce exactamente **1 reintento**, la entrada `storage_quota_exceeded` (o el aviso del panel si la clave que falló es `truekeate_logs`) y **ningún** estado a medias en la clave crítica.

---

## 3. Entidades compuestas

### 3.1 `TxPreview` (resumen para la ventana de confirmación)

| Campo | Tipo | Descripción |
|---|---|---|
| `from` | `Address` | Cuenta que firma. |
| `to` | `Address \| null` | Destino (`null` = despliegue de contrato). |
| `toLabel` | `string` | Etiqueta del destino: nombre del contrato si está etiquetado en `truekeate_networks`/catálogo local, o `"desconocido"` (H-11b). |
| `valueWei` | `WeiString` | Valor en wei. |
| `valueEth` | `string` | Valor formateado a 18 decimales. |
| `data` | `Hex` | Calldata. |
| `dataLength` | `number` | Longitud en bytes de `data`. |
| `isContractCall` | `boolean` | `data !== '0x'`. |
| `selector` | `Hex \| null` | Primeros 4 bytes de `data` (H-11b). |
| `functionName` | `string \| null` | Firma decodificada **con la tabla local cerrada de selectores** de §3.7 (p. ej. `transfer(address,uint256)`); `null` si el selector no está en la tabla → aviso **bloqueante** «llamada a contrato no reconocida». **Prohibido** consultar servicios externos de firmas o ABIs (RT-03, D-K). |
| `decodedArgs` | `object \| null` | Argumentos legibles decodificados con el ABI mínimo de la tabla cerrada de §3.7; `null` si el selector no está en la tabla o la decodificación falla. Nunca se obtiene de un servicio externo. |
| `isUnrecognizedContractCall` | `boolean` | `true` si `data !== '0x'` y el selector no está en la tabla local cerrada de §3.7 → aviso «llamada a contrato no reconocida» (H-11b, D-K). |
| `riskWarnings` | `string[]` | Advertencias en español. Valores previstos: allowance ilimitada en `approve`, `setApprovalForAll`, `data` no vacío desconocido, destino sin etiqueta (H-11b). |
| `gasLimit` | `WeiString` | Estimación de gas (`estimateGas`), recalculada al aprobar (H-10). |
| `estimationFailed` | `object \| null` | `{ reason: string }` si `estimateGas` revirtió o falló; el envío se bloquea con `-32000` (§3.6, H-22). |
| `maxFeePerGas` | `WeiString` | EIP-1559, de `getFeeData()` recalculado al firmar (H-10). |
| `maxPriorityFeePerGas` | `WeiString` | EIP-1559, de `getFeeData()` recalculado al firmar (H-10). |
| `estimatedFeeEth` | `string` | `gasLimit × maxFeePerGas` formateado. |
| `nonceInformativo` | `number` | **Nonce informativo** obtenido al construir la vista previa (H-10). No es vinculante. |
| `txType` | `2` | Tipo de transacción (EIP-1559). |
| `chainId` | `ChainIdHex` | Red. |
| `insufficientFunds` | `boolean` | `valueWei + fee > balance`. |

**Nonce (H-10; reforzado en v1.5, ADT-23 / D-R).** El `nonce` mostrado en la vista previa es **informativo**: sirve para que el usuario entienda el orden, no para firmar. El nonce **definitivo se recalcula al aprobar** con `getTransactionCount(account, 'pending')`, junto con `getFeeData()`, en el momento exacto de firmar. El envío se serializa con la **marca persistida `truekeate_inflight_tx`** (§2.12) —como máximo **una transacción en vuelo por `from`**— apoyada en la cola FIFO en memoria `fifoByAccount` (§3.4), que ya **no** es la garantía frente a la suspensión del SW: una segunda aprobación de la misma cuenta, con marca `signing` vigente, espera en la cola y no se firma. Si el nodo rechaza el nonce, el error es `-32000` (§4.3).

> **Payload acotado (ADT-21 / D-L).** La vista previa se construye **después** de validar la cota: el SW mide `payloadBytes` de `params` y, si supera `MAX_PAYLOAD_BYTES = 65536` (64 KiB), rechaza con `-32602` **sin** construir `TxPreview` y sin abrir la ventana única (§3.9).

### 3.2 `TypedDataPreview` (EIP-712)

| Campo | Tipo | Descripción |
|---|---|---|
| `domain` | `object` | `name`, `version`, `chainId`, `verifyingContract`, `salt`. |
| `domainName` | `string \| null` | `domain.name` en claro, mostrado en la ventana de confirmación (H-11b). |
| `verifyingContract` | `Address \| null` | `domain.verifyingContract` en claro (H-11b). |
| `types` | `object` | Sin `EIP712Domain` (se elimina antes de firmar). |
| `message` | `object \| null` | Datos a firmar. **Redactado en reposo (ADT-21 / D-L):** si la serialización canónica del `message` supera `PREVIEW_INLINE_MAX_BYTES = 4096` bytes, este campo se persiste como `null` y la UI muestra el resumen (`messageHash` + `messageBytes`) con el aviso «mensaje demasiado largo: se muestra su hash». El payload íntegro (≤ 64 KiB) sigue en `params` (§2.8) porque es la entrada de firma. |
| `messageHash` | `string` | `sha256:<hex>` de la serialización canónica del `message`. Se persiste siempre; es lo único que va a `truekeate_logs` (§2.11). |
| `messageBytes` | `number` | Tamaño de la serialización canónica del `message` en bytes UTF-8. |
| `redacted` | `boolean` | `true` si `message` se sustituyó por el resumen por superar `PREVIEW_INLINE_MAX_BYTES` (§3.9). |
| `primaryType` | `string` | Tipo raíz detectado. |
| `domainChainMismatch` | `boolean` | `true` si `domain.chainId ≠ chainId` activo → advertencia destacada en UI (H-11). |
| `verifyingContractMismatch` | `boolean` | **Redefinido en v1.5 (ADT-08 / D-K):** `true` si `verifyingContract` es la **dirección cero** **o** no es un contrato desplegado (`eth_getCode(verifyingContract) === '0x'`) → advertencia destacada en UI. La comparación anterior con «el contrato declarado por la dApp» se retira: salía del mismo payload de la dApp y era **circular e incomputable** (H-11b). |

### 3.3 `PersonalSignPreview` (firma de texto plano, RF-21)

| Campo | Tipo | Descripción |
|---|---|---|
| `text` | `string \| null` | Payload decodificado como texto UTF-8 legible, mostrado tal cual en `notification.html`. **Redactado en reposo (ADT-21 / D-L):** si el payload supera `PREVIEW_INLINE_MAX_BYTES = 4096` bytes, se persiste solo el **extracto** de los primeros 4096 bytes con `truncated: true`; nunca el texto completo por encima de ese umbral (el payload de firma íntegro, ≤ 64 KiB, vive en `params`, §2.8). |
| `isHexPayload` | `boolean` | `true` si el payload es hexadecimal y **no** es legible como UTF-8 → advertencia destacada en español (H-11b). |
| `byteLength` | `number` | Longitud del payload en bytes. |
| `payloadHash` | `string` | `sha256:<hex>` del payload completo; se persiste siempre y es lo único que va a `truekeate_logs` (§2.11). |
| `truncated` | `boolean` | `true` si `text` es un extracto por superar `PREVIEW_INLINE_MAX_BYTES` (§3.9). |
| `bytesHex` | `Hex` | Payload original, solo para la UI de la ventana; nunca se copia a `truekeate_logs` (§2.11). |

### 3.4 Ciclo de aprobación: registro persistido + puerto de larga vida

> **v1.3 (H-02, H-07).** Sustituye a la entidad en memoria `PendingApproval` de v1.2. **Ya no existe** un `Map` de `resolve`/`reject` como fuente de verdad, ni la frase «si la promesa original ya no existe, la solicitud se resuelve con error `4001`»: no había a quién resolverle. La fuente de verdad es el registro persistido de §2.8 y la respuesta se entrega por el canal que se describe aquí.

**Estado volátil del SW (solo índice de transporte, reconstruible).**

| Estructura (sin prefijo, memoria) | Tipo | Descripción | Recuperación |
|---|---|---|---|
| `portsByApprovalId` | `Map<string, chrome.runtime.Port>` | Puerto de larga vida abierto por el content script o el popup que espera la respuesta (`chrome.runtime.connect({ name: 'truekeate_approval' })`). Mantiene vivo el SW durante la espera. | Si el SW se duerme, el puerto se cierra: el content script se **reconecta con backoff** (1 s, 2 s, 4 s, 8 s, 16 s, máx. 30 s) y envía `{ type: 'RESUME', approvalId }`; el SW contesta desde el registro persistido o con `4001` si la entrada ya no está `pending`. |
| `windowsByApprovalId` | ~~`Map<string, number>`~~ | **Retirada en v1.5 (ADT-22 / P-21):** ya no hay un `windowId` por solicitud. La ventana es **única y global** y su estado se persiste en `truekeate_approval_window` (§2.14), no en memoria. | La reconciliación re-descubre **la** ventana con `chrome.windows.getAll({ populate: true })` filtrando por la URL `chrome-extension://<id>/notification.html`; si hay `pending` y no hay ventana, la abre; si la ventana muestra una solicitud ya resuelta, la re-renderiza con la siguiente `pending`; si no queda ninguna, la cierra. |
| `expiryAlarms` | `Map<string, string>` | Nombre del `chrome.alarms` de vencimiento. | Se re-arma al arrancar desde `expiresAt` de cada entrada `pending`. |
| `fifoByAccount` | `Map<Address, Promise<void>>` | Encadenamiento FIFO de firma por cuenta dentro de la vida del SW (H-10). **Ya no es la garantía** de «una transacción en vuelo por `from`»: la garantía vive en la marca persistida `truekeate_inflight_tx` (§2.12). | Volátil por diseño; se recrea desde cero. El bloqueo real se reconstruye leyendo `truekeate_inflight_tx` y el orden de espera se deriva de `createdAt` (§2.8). |
| `rmwLock` | `Promise<void>` | Cerrojo de la escritura read-modify-write serializada de §2.8/§2.9 (y de §2.12–§2.14). | Se recrea al arrancar. |

**Dueño único del plazo (H-07).** El Service Worker es el **único** dueño de `SIGN_TIMEOUT_MS = 120000` y `CONNECT_TIMEOUT_MS = 60000`, anclados a `createdAt` (`expiresAt` persistido). La capa inject/content script **no fija timeout propio**; si se implementa como red de seguridad, debe usar un margen superior (`SIGN_TIMEOUT_MS + 5000 = 125000`) y delegar siempre en el `approvalId`. El snippet de 30 s del material de referencia **no es normativo**.

**Vencimiento con `chrome.alarms` (H-02, H-07).** Un `setTimeout` no sobrevive a la suspensión del SW, así que por cada solicitud `pending` el SW crea `chrome.alarms.create('truekeate_expire:<approvalId>', { when: expiresAt })` (requiere el permiso `alarms` en el manifest). Al expirar, el SW:

1. marca la entrada como `expired` con `resolvedAt` y `errorCode: 4001` (persistido, no solo en memoria);
2. **actualiza la ventana única** (§2.14): si la ventana mostraba esa solicitud y quedan otras `pending`, **re-renderiza la siguiente en la misma ventana** (no la cierra); si ya no queda ninguna `pending`, la cierra con `chrome.windows.remove(windowId)`;
3. emite a la página un **objeto EIP-1193**, nunca `new Error('Request timeout')`:
   ```json
   { "code": 4001, "message": "El usuario no respondió en el plazo establecido (120 s); la solicitud ha caducado." }
   ```
4. **purga el badge** (recalcula el índice derivado de §2.8).

**Reconciliación al arrancar el Service Worker (H-02; ampliada en v1.5 por ADT-23 / D-R y ADT-24 / D-Q).**

1. Purga de entradas de §2.8/§2.9 con `status !== 'pending'` o `expiresAt <= now`.
2. Para cada `pending` restante: rearmar `chrome.alarms` con `expiresAt`.
3. Para cada `approvalId` **huérfano** (sin puerto vivo o ya vencido): marcarlo `expired` y emitir `4001` a la pestaña/frame registrados con `chrome.tabs.sendMessage(tabId, mensaje, { frameId })`. Si la pestaña ya no existe, se descarta la entrada y se deja traza en `truekeate_logs`. El objetivo es que **nunca** quede una dApp colgada, una ventana huérfana ni una solicitud sin traza.
4. **Ventana única (§2.14):** se lee `truekeate_approval_window`, se contrasta con `chrome.windows.getAll({ populate: true })` y se restablece el invariante «una sola ventana, mostrando la `pending` más antigua»: si hay `pending` y no hay ventana se abre; si la ventana muestra una solicitud ya resuelta, se re-renderiza la siguiente; si no hay `pending`, se cierra y se escribe `windowId: null`.
5. **Marca de transacción en vuelo (§2.12):** se reconstruye `truekeate_inflight_tx` con su propia tabla de reconciliación (recibo, liberación por TTL, rearme del `alarm` de liberación), de modo que «máximo 1 transacción en vuelo por cuenta» **no dependa ya de la memoria**.
6. **Ventana de tasa por origen (§2.13):** se reconstruye `truekeate_rate_windows` aplicando la recarga perezosa del *token bucket* con el reloj actual, la purga por `rateWindowTtlMs` y el reinicio de la ventana de aprobaciones de 60 s: el limitador deja de nacer en cero tras cada suspensión.
7. Se escribe **1** entrada `sw_reconcile` con el recuento de marcas liberadas y de orígenes con ventana de tasa reconstruida.

**Tabla de correlación `approvalId ↔ tabId/frameId` y su recuperación.**

| Dato persistido | Valor | Uso |
|---|---|---|
| `approvalId` | `uuid` | Correlación entre la llamada RPC original, la ventana y la respuesta. |
| `tabId` | `number \| null` | Pestaña a la que se entrega la respuesta si no hay puerto. |
| `frameId` | `number \| null` | Frame exacto de entrega (`all_frames: true`, RF-13). |
| `origin` | `string` normalizado | Verificación de que la respuesta va al origen solicitante. |
| `windowId` | `number` (cuando existe) | **Ventana única global**: se lee de `truekeate_approval_window` (§2.14), no de la solicitud. Se usa para el re-render y para el cierre cuando no queda ninguna `pending`. |

*Recuperación, en orden de preferencia:* (1) **puerto vivo** → entregar por `portsByApprovalId` y cerrar el puerto; (2) **puerto cerrado + pestaña viva** → `chrome.tabs.sendMessage(tabId, { type: 'TRUEKEATE_RESPONSE', approvalId, result|error }, { frameId })`; (3) **pestaña cerrada** → `chrome.tabs.onRemoved` marca la solicitud `rejected` (o `expired` si el plazo ya venció) y purga el badge; (4) **`windowId` perdido o divergente** → la reconciliación re-descubre **la** ventana única por URL y reaplica el invariante de §2.14 (re-render de la siguiente `pending` o cierre); la solicitud de la que se perdió la ventana no se marca `expired` por ese solo motivo, solo si además venció o la pestaña desapareció. La solicitud **nunca** se resuelve «en el vacío»: si no hay destinatario, se marca, se registra y se purga.

### 3.5 `DappSession` (vista en memoria de `truekeate_connected_sites`)

| Campo | Tipo | Descripción |
|---|---|---|
| `origin` | `string` | Origen autorizado, **normalizado** (minúsculas, sin barra final) — misma forma canónica que la clave de §2.7 (H-33). |
| `account` | `Address` | Cuenta compartida. |
| `tabIds` | `number[]` | Pestañas vivas de ese origen. |
| `lastUsedAt` | `number` | Epoch ms; se refresca con cada llamada atendida. |
| `expiresAt` | `number \| null` | Copia en memoria de la caducidad de §2.7. |
| `connected` | `boolean` | Estado para el evento `connect`/`disconnect`. |

### 3.6 Contrato observable de una transacción (H-22, RF-08, RF-19, RF-31)

| Aspecto | Contrato |
|---|---|
| Resultado de `eth_sendTransaction` | Se resuelve con el **hash** de la transacción (`0x` + 64 hex) en cuanto se difunde. **No** espera al recibo. |
| `estimateGas` | Se ejecuta antes de abrir `notification.html`. Si revierte o falla, `TxPreview.estimationFailed = { reason }`, el envío **se bloquea** y la llamada RPC se rechaza con `-32000` y mensaje accionable en español (RNF-06). No hay `gasLimit` manual en el alcance actual. |
| Estado `pending` | Log `category: 'tx'`, `txStatus: 'pending'`, con `txHash`, tras difundir. |
| Estado `confirmed` | `eth_getTransactionReceipt(txHash)` devuelve `status === 0x1` → log `category: 'tx'`, `txStatus: 'confirmed'`. |
| Estado `failed` | Recibo con `status === 0x0` (revert on-chain) → log `category: 'tx'`, `txStatus: 'failed'`, `level: 'error'`; se anota el motivo del revert si el nodo lo devuelve. |
| Seguimiento | El SW consulta `eth_getTransactionReceipt` (método añadido al catálogo, §4.3) hasta obtener recibo o agotar el seguimiento. El seguimiento termina cuando el recibo devuelve `status` `0x1`/`0x0` o al vencer el plazo persistido con `chrome.alarms`, y cada transición escribe **exactamente 1 entrada** en `truekeate_logs` (§2.11): `Vitest: txContract.spec.ts — hash, transiciones, revert y estimación fallida`. Cada transición consulta además la marca persistida `truekeate_inflight_tx` (§2.12) y la limpia al cerrar el ciclo. |

---

### 3.7 Tabla local cerrada de selectores (ADT-08 / D-K)

> **Nuevo en v1.5.** Es la **única** fuente de decodificación del calldata. **Prohibido** consultar servicios externos de firmas o de ABIs de contrato (4byte, Etherscan, Sourcify o cualquier API): rompería RT-03 y RNF-09. Fuera de esta tabla, `functionName = null`, `decodedArgs = null`, `isUnrecognizedContractCall = true` y el aviso «llamada a contrato no reconocida» es **bloqueante** en la ventana única.

| Selector | Firma | Argumentos que se decodifican | Aviso de riesgo |
|---|---|---|---|
| `0xa9059cbb` | `transfer(address,uint256)` | `to`, `amount` | Destino sin etiqueta |
| `0x23b872dd` | `transferFrom(address,address,uint256)` | `from`, `to`, `amount` | Destino sin etiqueta |
| `0x095ea7b3` | `approve(address,uint256)` | `spender`, `amount` | **Allowance ilimitada** si `amount === 2^256-1` |
| `0x39509351` | `increaseAllowance(address,uint256)` | `spender`, `addedValue` | — |
| `0xa457c2d7` | `decreaseAllowance(address,uint256)` | `spender`, `subtractedValue` | — |
| `0xdd62ed3e` | `allowance(address,address)` | `owner`, `spender` | — |
| `0x70a08231` | `balanceOf(address)` | `account` | — |
| `0x18160ddd` | `totalSupply()` | — | — |
| `0x06fdde03` / `0x95d89b41` / `0x313ce567` | `name()` / `symbol()` / `decimals()` | — | — |
| `0xa22cb465` | `setApprovalForAll(address,bool)` | `operator`, `approved` | **Aprobación total de NFTs** si `approved === true` |
| `0x42842e0e` | `safeTransferFrom(address,address,uint256)` | `from`, `to`, `tokenId` | — |
| `0xb88d4fde` | `safeTransferFrom(address,address,uint256,bytes)` | `from`, `to`, `tokenId`, `data` | — |
| `0x6352211e` | `ownerOf(uint256)` | `tokenId` | — |
| `0xd505accf` | `permit(address,address,uint256,uint256,uint8,bytes32,bytes32)` | `owner`, `spender`, `value`, `deadline`, `v`, `r`, `s` | **Firma de permiso**: mostrar `spender`, `value` y `deadline` en claro |
| `0xd0e30db0` | `deposit()` | — | — |
| `0x2e1a7d4d` | `withdraw(uint256)` | `wad` | — |

**Generación y verificación (obligatorias).** La tabla vive en `src/background/rpc/selectors.ts` (M4) como literal y se **genera** con `keccak256(firma).slice(0, 10)` mediante un script de build (`scripts/generate-selectors.mjs`, sin dependencias de red). Un test de Vitest (`calldata.spec.ts`) recalcula los selectores y falla si alguno difiere del literal versionado; el mismo test comprueba que un selector desconocido (p. ej. `0xdeadbeef`) produce `functionName: null` y `isUnrecognizedContractCall: true`. Los valores de esta tabla son los canónicos del proyecto y coinciden con sus implementaciones de referencia (ERC-20, ERC-721 y ERC-2612 `permit`).

### 3.8 Ventana única de confirmación y favicon saneado (ADT-22 / P-21)

**Ventana única.** `notification.html` es **una sola** instancia global (persistida en `truekeate_approval_window`, §2.14), con **una** solicitud visible a la vez (la `pending` más antigua, FIFO) y **una cola** de espera formada por el resto de `truekeate_pending_requests`. Reglas vinculantes:

| Regla | Valor |
|---|---|
| Ventanas `notification.html` simultáneas | **Exactamente 1** (nunca una por origen, ni por método, ni por cuenta). |
| Contrato de apertura | `chrome.windows.create({ url: 'notification.html', type: 'popup', focused: true, width: 420, height: 640 })` + `chrome.windows.update(windowId, { focused: true })` solo en la **primera** apertura o al pasar a una solicitud nueva. |
| Solicitud mostrada | La `pending` con `createdAt` más antiguo; el resto **espera** (no se rechaza por ello: el rechazo por cardinalidad es otra regla, §2.8). |
| Al resolverse la mostrada | La **misma** ventana re-renderiza la siguiente `pending`; no se abre ni se cierra nada. Si no queda ninguna, se cierra la ventana. |
| Indicador visible | «N en espera», con `N` = índice derivado de §2.8 (mismo valor que el badge). |
| Estado de la ventana al recargar | Se reconstruye de `truekeate_approval_window` + la entrada persistida: si la solicitud ya no está `pending`, se muestra el estado resuelto y se pasa a la siguiente. |
| Cierre con la X | Equivale a **rechazar** la solicitud mostrada (`4001`), salvo plazo vencido, que prevalece como `expired`. |

**Favicon de la dApp: fuente, permiso y saneado.**

| Aspecto | Decisión |
|---|---|
| Fuente | **Servicio de favicons del navegador**, nunca un activo de la dApp ni una descarga de red propia: `chrome-extension://<id>/_favicon/?pageUrl=<origen normalizado codificado>&size=32` (el endpoint `_favicon/` es el servicio de favicons de MV3 y solo es accesible desde contextos de la extensión). |
| Permiso | **`favicon`** en `permissions` del manifest. Lo construye y lo sirve el propio navegador; no requiere `host_permissions` adicionales ni peticiones del SW. Si el permiso no estuviera declarado, el favicon no se muestra (queda `null`), **nunca** se cae a una URL remota. |
| Saneado | El SW construye la URL a partir del **origen normalizado** de §2.7 (nunca de un campo enviado por la dApp) y valida antes de renderizar que empiece por `chrome-extension://<id>/_favicon/`; se **rechazan** `data:`, `blob:`, `javascript:`, `file:` y cualquier URL remota. Un favicon propuesto por la dApp se **ignora** siempre. |
| Fallback | Si el servicio no devuelve icono, `favicon = null` y la UI usa el activo local del paquete (`public/brand/`), nunca un icono remoto. |
| Diferencia con el `icon` de EIP-6963 | El `icon` del anuncio EIP-6963 (§4.1.1) **sí** es un `data:` URI, pero es un PNG del **propio paquete** (isologo de 96 px, RNF-20), no un dato de la dApp: la prohibición de `data:` aplica a los favicons de origen, no al isologo de la wallet. |
| Ventana de conexión | `truekeate_connect_request.favicon` (§2.9) usa exactamente el mismo contrato. |

**Anti-phishing de la ventana (RF-35).** Origen normalizado **siempre visible** junto al nombre del sitio, favicon saneado, insignia del tipo de solicitud (tx / firma / red) y solo dos acciones: «Aprobar» y «Rechazar» (`Esc` = rechazar). El origen mostrado se deriva del `origin` persistido de la solicitud, nunca de la URL de la propia ventana.

### 3.9 Cota de payload de 64 KiB y redacción de previews en reposo (ADT-21 / D-L)

**Cota de aceptación.** El SW mide el payload **antes** de crear la solicitud:

```
payloadBytes = new TextEncoder().encode(JSON.stringify(params)).length
si payloadBytes > MAX_PAYLOAD_BYTES (65536, 64 KiB)  →  rechazo -32602
```

Al superarla: `{ code: -32602, message: "La carga útil de la solicitud supera el límite de 64 KiB." }` (§4.3), **sin** crear `PendingRequest`, **sin** abrir la ventana única, **sin** llamar al nodo y **sin** tocar el badge; se registra **1** entrada `rpc_error` con `data: { payloadBytes }`. La cota se aplica a `personal_sign`, `eth_signTypedData_v4`, `eth_sendTransaction` (donde el calldata es el payload) y a los parámetros de red, y es una cota **por solicitud**, no agregada.

**Redacción de previews largas en reposo.** La cota anterior limita lo que se persiste, pero no basta para lo que se **renderiza**:

| Constante | Valor | Regla |
|---|---|---|
| `MAX_PAYLOAD_BYTES` | `65536` (64 KiB) | Cota de aceptación de `params`; por encima, `-32602` y no se crea la solicitud. |
| `PREVIEW_INLINE_MAX_BYTES` | `4096` | Por encima, la preview se redacta en reposo: `PersonalSignPreview.text` guarda solo el extracto de 4096 bytes con `truncated: true`; `TypedDataPreview.message` pasa a `null` con `redacted: true` y la UI muestra `messageHash` + `messageBytes`. |
| Hash persistido | `sha256:<hex>` | `payloadHash` / `messageHash` se persisten siempre y son lo único que llega a `truekeate_logs` (§2.11). |
| Payload de firma | ≤ 64 KiB en `PendingRequest.params` | Es la entrada de la firma y debe sobrevivir a la suspensión del SW; **no** se copia a logs ni se exporta, y se borra con la entrada al purgar la cola. |
| Peor caso en reposo | 8 × 64 KiB = 512 KiB | Compatible con la cuota de 10 MB (§2.15). |

*Test de aceptación:* con un payload de 5 KiB en `personal_sign`, la entrada persistida **no** contiene el texto completo (`text.length === 4096`, `truncated === true`, `payloadHash` presente) y la UI muestra el aviso de truncamiento; con un payload de 65 537 bytes, la llamada se rechaza con `-32602` y la cola queda intacta.

### 3.10 Revelado de secretos y política de portapapeles (P-20, RF-50, ADT-09)

**Entidad `SecretReveal` (estado de UI; NO se persiste).** El revelado de la frase semilla y de las claves privadas (RF-50) no crea ninguna clave en `chrome.storage.local`: igual que el QR (P-05), es **estado de UI** que vive en memoria del popup y se descarta al ocultarse. Se intercambia con el SW por mensaje interno (revelado/exportación), nunca por `window.postMessage` (RNF-09).

| Campo | Tipo | Descripción |
|---|---|---|
| `kind` | `'mnemonic' \| 'privateKey'` | Qué se revela. |
| `account` | `Address \| null` | Cuenta revelada (`null` para el mnemonic). |
| `revealedAt` | `number` | Epoch ms del revelado; ancla del temporizador. |
| `hideAt` | `number` | `revealedAt + REVEAL_HIDE_MS`, con **`REVEAL_HIDE_MS = 30000`** (30 s, DEC-28; constante en `entornos_globales.md` §3). |
| `visible` | `boolean` | Estado de la UI: `true` solo mientras el valor está en pantalla. |
| `copiedAt` | `number \| null` | Epoch ms de la última copia al portapapeles (`null` si no se copió). |
| `clipboardHash` | `string \| null` | `sha256:<hex>` del valor copiado; permite comparar con el contenido del portapapeles **sin** conservar el secreto en una segunda variable. |

**Ocultado: dos disparadores, no uno.** El valor se oculta (a) por temporizador a los **30 s** y (b) en cuanto la vista **pierde el foco** (`blur`), se cierra (`pagehide`/desmontaje) o el usuario pulsa «Ocultar»; el disparador más temprano gana. Al ocultar se destruyen los campos en memoria (`visible: false` y las variables del secreto a `null`): ningún secreto permanece en la UI, en el estado del componente ni en el portapapeles.

**Política de portapapeles (P-20).** Copiar la frase semilla o la clave privada **está permitido** —es la vía real de respaldo del usuario—, pero la copia es **temporal y verificada**:

1. Al copiar se escriben `clipboardHash` y `copiedAt` y la UI advierte de que la extensión **borrará el portapapeles** al ocultar el valor.
2. Al ocultarse (30 s, pérdida de foco o cierre), **el mismo evento** que oculta el valor **borra el portapapeles** si todavía contiene la semilla o la clave: se lee el portapapeles, se compara `sha256(textoLeído)` con `clipboardHash` y, si coincide, se escribe una cadena vacía.
3. Implementación y permisos: la comparación usa `navigator.clipboard.readText()` y el borrado `navigator.clipboard.writeText('')` desde el **contexto de la extensión** (popup). Requiere declarar **`clipboardRead`** y **`clipboardWrite`** en el manifest —este último habilita escribir sin gesto del usuario—; **no** se usan content scripts para esto. Delta de manifest que debe reflejarse en `documento_tecnico.md` §7.3 y en `entornos_globales.md` §4.
4. Si la lectura del portapapeles falla (documento ya no enfocado en el instante del `blur` o permiso ausente), se hace un **borrado incondicional** con `clipboardWrite` (no requiere foco) y se registra el resultado en `truekeate_logs` con `event: 'rpc_error'` y `level: 'warn'`, **sin** ningún fragmento del secreto.
5. Si el usuario copió otra cosa después de la semilla, la comparación falla y **no** se borra nada: la política nunca destruye contenido ajeno.
6. `copiedAt`/`clipboardHash` **no** sobreviven al cierre de la vista: son estado de UI, coherente con el punto 1.
7. El secreto nunca se copia desde un content script ni desde `notification.html`: la acción de copiar existe solo en el popup (RF-50).

---

## 4. Protocolo de mensajes internos

### 4.1 Página web ↔ Inject ↔ Content Script (`window.postMessage`)

| `type` | Dirección | Campos | Notas |
|---|---|---|---|
| `TRUEKEATE_REQUEST` | inject → content | `id`, `method`, `params` | Salto 1 de una llamada. |
| `TRUEKEATE_RESPONSE` | content → inject | `id`, `result`, `error` | El `error` es un objeto EIP-1193 (`code`, `message`). |
| `TRUEKEATE_EVENT` | content → inject | `eventName`, `data` | **Salto 2** del mismo tipo (ver nota H-39). |
| `TRUEKEATE_ANNOUNCE` | inject → content | `info` (EIP-6963) | `info` es el objeto EIP-6963 de §4.1.1. |

> Validación obligatoria: `event.source === window` y `event.origin === location.origin`. **Todos los `postMessage` salientes usan `targetOrigin = location.origin`, nunca `'*'`** (H-32, RNF-10). Nunca transportan claves ni el mnemonic (RNF-09).

> **Nota de reenvío de `TRUEKEATE_EVENT` (H-39).** El mismo `type` recorre **dos saltos consecutivos**:
> 1. **SW → content script** por `chrome.runtime.sendMessage({ type: 'TRUEKEATE_EVENT', eventName, data })` (§4.2).
> 2. **content script → inject → página** por `window.postMessage({ type: 'TRUEKEATE_EVENT', eventName, data }, location.origin)`.
>
> Campo que se conserva: `eventName` y `data` viajan **idénticos** en ambos saltos; el content script reenvía **literalmente**, sin transformar, filtrar ni añadir campos. Lo único que cambia entre saltos es el transporte (`chrome.runtime` → `window`). Un implementador no debe asumir un canal único ni que el SW publique directamente en la página.

### 4.1.1 Contrato EIP-6963 (H-31, RF-44)

`inject.js` cumple, en este orden:

1. **Listener síncrono.** Registra `window.addEventListener('eip6963:requestProvider', …)` de forma **síncrona** dentro del IIFE, **antes** de emitir el primer anuncio y sin ningún `await` previo (si se registra tarde, el anuncio se pierde).
2. **Auto-anuncio.** Emite `eip6963:announceProvider` con `new CustomEvent(...)`:
   - (a) al cargar `inject.js`;
   - (b) en **cada** `eip6963:requestProvider` recibido (re-anuncio);
   - (c) de nuevo en `DOMContentLoaded`, para las dApp que registran su listener más tarde.
3. **`detail` exacto:**
   ```json
   {
     "info": {
       "uuid": "9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90",
       "name": "TrueKeate",
       "icon": "data:image/png;base64,<isologo de 96 px>",
       "rdns": "academy.codecrypto.truekeate"
     },
     "provider": window.truekeate
   }
   ```
   `uuid` es **constante** (fijo en el código, nunca regenerado por carga) e `icon` es un **data-URI PNG** del isologo de 96 px, servido desde el propio paquete (RNF-20).

**Valores vinculantes (ACU-03 / D-A, RF-44, RT-13).** La fuente de verdad de la identidad EIP-6963 es `requerimientos.md` **RT-13**: `name: "TrueKeate"` y `rdns: "academy.codecrypto.truekeate"` son literales **vinculantes**, no se abrevian, no se traducen y no admiten variantes (`"TrueKeate Wallet"` y `"com.truekeate.wallet"` quedan **descartados**). El `name` de EIP-6963 es el **nombre corto de la marca** y es un campo **distinto** de `manifest.name`, que vale `TrueKeate Wallet` (`entornos_globales.md` §10): el producto se llama «TrueKeate Wallet» y el provider se anuncia como «TrueKeate». Constantes equivalentes de código: `PROVIDER_NAME` y `PROVIDER_RDNS` (`entornos_globales.md` §3).

**Identidad del paquete congelada (ADT-19 / D-N).** El `uuid` del anuncio es una **constante literal congelada**, no un valor generado por carga:

| Constante | Valor | Ubicación |
|---|---|---|
| `PROVIDER_UUID` | `"9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90"` (UUID v4 literal, **congelado**) | `src/inject/provider.ts` (M35) y `entornos_globales.md` §3 |
| `manifest.key` | **`key` fija** en el manifest (misma en todos los equipos) | `src/manifest.ts` (M1) |

Consecuencia y motivo: la `key` fija hace que el **ID de la extensión sea estable** en cualquier perfil y equipo (`chrome-extension://<EXTENSION_ID>`), y de ese ID dependen la **allowlist CORS de Anvil** (`anvil --http.corsdomain "chrome-extension://<EXTENSION_ID>,http://localhost:5174"`, §5 y RE-04) y la **reproducibilidad de los E2E** (el ID descubierto en `context.serviceWorkers()` se compara con el literal congelado de `entornos_globales.md` §3). `PROVIDER_UUID` **nunca** se regenera, ni en el re-anuncio ni entre versiones: un UUID nuevo cambiaría la identidad del provider ante las dApp. Ambas constantes se verifican con test (`provider.spec.ts` y `manifest.spec.ts`).

**Provider no configurable y sin suplantación (ADT-26 / D-S).** El objeto se publica **antes** de cualquier script de la página y de forma no sustituible:

```js
Object.defineProperty(window, 'truekeate', { value: provider, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, 'codecrypto', { value: provider, writable: false, configurable: false, enumerable: true }); // el MISMO objeto (DEC-21)
```

Una asignación desde la página (`window.truekeate = fake`) **falla** (en modo estricto lanza `TypeError`) y **nunca** sustituye al provider real; un proveedor falso solo podría existir si la extensión no estuviera cargada. Test negativo obligatorio en `provider.spec.ts`: (a) `window.truekeate === window.codecrypto`; (b) reasignar lanza o no cambia el objeto; (c) `Object.getOwnPropertyDescriptor(window, 'truekeate').configurable === false`.

### 4.2 Content Script / popup ↔ Service Worker (`chrome.runtime`)

| `type` | Dirección | Campos | Guarda obligatoria |
|---|---|---|---|
| `TRUEKEATE_RPC` | content/popup → SW | `method`, `params`, `origin`, `tabId` | `sender.id === chrome.runtime.id`; el `origin` declarado por la página es **dato no fiable**: el SW lo recalcula **solo** desde `sender.origin` (§4.2, guarda 5) y consume el *token bucket* del origen (§2.13). |
| `SIGN_RESPONSE` | notification → SW | `approvalId`, `success`, `error?` | `sender.id === chrome.runtime.id` **y** `sender.url` en la allowlist de páginas de la extensión (`notification.html`). |
| `CONNECT_RESPONSE` | connect → SW | `requestId`, `success`, `account?`, `accountIndex?`, `error?` | Ídem, con `connect.html` en la allowlist. |
| `RESUME` | content/popup → SW (por puerto) | `approvalId` | Puerto `truekeate_approval`; dispara la reconexión de §3.4. |
| `TRUEKEATE_EVENT` | SW → content | `eventName`, `data` | Salto 1 de §4.1 (nota H-39). |

**Guardas de la cadena de mensajes (H-32, RNF-10).**

1. **Emisor.** En `chrome.runtime.onMessage` se exige `sender.id === chrome.runtime.id`. Cualquier mensaje con otro `id` se descarta con `4100`.
2. **Allowlist de rutas** para `SIGN_RESPONSE` y `CONNECT_RESPONSE`: solo `chrome-extension://<id>/notification.html` y `chrome-extension://<id>/connect.html`. Cualquier otra ruta → `4200`.
3. **Allowlist de métodos internos.** Los métodos `wallet_*` **solo** se aceptan desde páginas de la extensión (`sender.tab === undefined` y `sender.url` en la allowlist del popup), **nunca** desde content scripts. Si llegan con `sender.tab` presente → `4200 Unsupported method`.
4. **`targetOrigin` cerrado** en todo `postMessage` saliente (§4.1).
5. **`origin` recalculado y con precedencia fija (H-32, RNF-10; precisión ADT-07 / D-J).** El SW nunca confía en el campo `origin` que envía el content script: lo deriva **solo** de `sender.origin`, lo normaliza (§2.7) y lo usa para las claves de sesión. Con `sender.frameId !== 0` queda **prohibido** el respaldo a `sender.tab.url` (ese `url` es el del **top**, no el del frame): un iframe cross-origin no puede heredar la sesión del sitio anfitrión. El `frameId` del mensaje se persiste en la solicitud (§2.8) y las respuestas y eventos se entregan **solo a ese frame** (`chrome.tabs.sendMessage(tabId, mensaje, { frameId })`).
6. **`setAccessLevel`.** `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` al arrancar el SW, para que un content script no pueda leer `truekeate_mnemonic` ni las claves privadas del storage (H-32).

**Tabla de contextos permitidos por grupo de método**

| Grupo | Contextos permitidos | Si llega de otro contexto |
|---|---|---|
| Métodos de página (`eth_*`, `personal_sign`, `eth_signTypedData_v4`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`, `wallet_revokePermissions`) | content script de una dApp con `sender.tab` presente y origen validado | `4100` (sin sesión) o `4200` (método no permitido en ese contexto) |
| Métodos internos (`wallet_deriveAccounts`, `wallet_generateMnemonic`, `wallet_importPrivateKey`, `wallet_getNetworks`, `wallet_getLogs`) | solo páginas de la extensión: `sender.tab === undefined` **y** `sender.url` en la allowlist (popup) | `4200 Unsupported method` |

**RNF-10 actualizado.** Queda desdoblado en dos garantías verificables: (a) **canal externo** —validación `event.source === window` + `event.origin === location.origin` y `targetOrigin = location.origin` en los mensajes salientes, con test negativo de iframe hostil—; (b) **canal interno** —`sender.id === chrome.runtime.id`, allowlist de rutas y de métodos internos, con prueba negativa desde una página cualquiera—.

### 4.3 Métodos RPC soportados por el provider

| Método | Tipo | ¿Requiere aprobación? | Contexto | RF |
|---|---|---|---|---|
| `eth_requestAccounts` | conexión | Sí (`connect.html`) | página | RF-16 |
| `eth_accounts` | lectura | No | página | RF-17 |
| `eth_chainId` | lectura | No | página | RF-18 |
| `eth_blockNumber` | lectura | No | página | RF-18 |
| `eth_getBalance` | lectura | No | página | RF-18 |
| `eth_estimateGas` | lectura | No | página | RF-08 |
| `eth_gasPrice` / `eth_feeHistory` | lectura | No | página | RF-42 |
| `eth_getTransactionByHash` | lectura | No | página | RF-31 |
| `eth_getTransactionReceipt` | lectura | No | página | RF-31 (H-22) |
| `eth_sendTransaction` | escritura | **Sí** (`notification.html`) | página | RF-19 |
| `eth_signTypedData_v4` | firma | **Sí** | página | RF-20 |
| `personal_sign` | firma | **Sí** | página | RF-21 (P-05) |
| `eth_sign` | — | — | — | **Retirado (H-11a):** responde `4200 Unsupported method`. Alinea el catálogo con el enum `method` de §2.8. |
| `wallet_switchEthereumChain` | red | **Sí, cuando la red destino no es la activa** (crea `PendingRequest` y se aprueba en `notification.html`); **si ya es la activa, responde sin cambios ni aprobación** | página | RF-22 (P-19, ACU-16) |
| `wallet_addEthereumChain` | red | **Sí**, y además **solicita el permiso de host en runtime** para su `rpcUrl` (ACU-27 / D-G). **Solo añade la red: no la activa** (ADT-25 / P-22) | página **o popup** | RF-23 |
| `wallet_revokePermissions` | permisos | **Sí** | página o popup | RF-26. Desde el popup la confirmación es la propia UI (RF-26); desde una dApp se representa en `truekeate_pending_requests` (§2.8, H-23). |
| `wallet_deriveAccounts` | interna (solo popup) | No | popup | RF-04 |
| `wallet_generateMnemonic` | interna (solo popup) | No | popup | RF-01 |
| `wallet_importPrivateKey` | interna (solo popup) | No | popup | RF-05 |
| `wallet_getNetworks` / `wallet_getLogs` | interna (solo popup) | No | popup | RF-23/RF-28 |

**Tasa por origen sobre TODO el catálogo (ADT-24 / D-Q).** Toda invocación de página de esta tabla —aprobable o no, de lectura o de escritura— pasa por el ***token bucket* de §2.13** antes de ejecutarse (`rateLimitBurst = 20`, recarga `5/s`), y las aprobables pasan además por el límite de `pendingRequestsPerMinute = 6` de §2.8 (rige el más estricto). Al agotar el bucket se responde `4001` con el mensaje «Se ha superado el límite de llamadas para este origen; espera unos segundos y reintenta.» (fila propia en la tabla de errores), **sin** abrir la ventana única, **sin** crear entrada en la cola, **sin** llamar al nodo y **sin** tocar el badge. Las llamadas de los contextos de la propia extensión (`origin === 'extension'`) están exentas (§2.13).

**`wallet_switchEthereumChain` — ciclo completo (P-19, ACU-16, RF-22/RF-24).**

1. **La red destino ya es la activa** (`truekeate_chain_id`): responde de inmediato con `null`, **sin** crear `PendingRequest`, **sin** abrir `notification.html` y **sin** emitir `chainChanged` (no hay cambio que notificar ni nada que aprobar).
2. **La red destino está dada de alta** en `truekeate_networks` pero no es la activa: crea un `PendingRequest` con `method: 'wallet_switchEthereumChain'` (§2.8) y lo aprueba el usuario en `notification.html`. **Al aprobar**, el SW (a) escribe el nuevo `truekeate_chain_id`, (b) emite `chainChanged` con el nuevo `chainId` a **todas las pestañas** (RF-24), (c) registra `event: 'chain_changed'`/`approval_resolved` en `truekeate_logs` (§2.11) y (d) purga el badge.
3. **La red destino no está dada de alta**: `4901` «La red solicitada no está dada de alta.», sin ventana y sin `PendingRequest`.
4. **Rechazo o vencimiento** del plazo de 120 s: `4001` con el mensaje por causa de la tabla de errores (**sin** cambiar `truekeate_chain_id`).

> `wallet_switchEthereumChain` **figura en el enum `method` de `truekeate_pending_requests`** (§2.8), junto a los demás métodos aprobables (ACU-16).

**`wallet_addEthereumChain` — permiso de host en runtime, siempre y por red (ACU-27 / D-G, RT-04, RF-23).** El alta de una red recorre, en este orden: (1) **validación** de esquema y host (esquema `https` preferente; `http` solo para `127.0.0.1`/`localhost`; host ni privado ni de enlace local); (2) **aprobación explícita** del usuario mediante `PendingRequest` + `notification.html`; (3) **`chrome.permissions.request` sobre el `rpcUrl`** (gesto válido del usuario) contra `optional_host_permissions` —**también cuando el alta la inicia el popup**: el clic del usuario es el gesto válido y **no hay excepción por contexto**—; (4) **persistencia** en `truekeate_networks` con `isDefault: false`; (5) **nada más**: el alta **no activa** la red (ADT-25 / P-22) —`truekeate_chain_id` no cambia, no se emite `chainChanged` y no se encola ningún cambio de red—. La **concesión se registra por red** (la propia entrada persistida es la prueba de la red autorizada) y se instrumenta con `event: 'network_added'`. **Si el usuario deniega el permiso de host, la red no se persiste** y la llamada se resuelve con `4001` y el mensaje «No se concedió el permiso de acceso a `<rpcUrl>`; la red no se ha añadido.». Usar la red recién añadida exige **`wallet_switchEthereumChain`**, con su propia aprobación en la ventana única (§3.8): el alta no puede eludir ADR-16. El manifest no se amplía: sigue en mínimos privilegios con `optional_host_permissions` (`entornos_globales.md` §4).

`wallet_revokePermissions` **figura en el enum `method` de `truekeate_pending_requests`** (§2.8): un requisito Must con cola de aprobación no puede quedar sin representación persistida (H-23, RNF-08).

**Códigos de error EIP-1193 usados — tabla cerrada, un mensaje por causa (ACU-05 / D-E, RNF-06).** Un mismo `code` admite **varios mensajes**, uno por causa: el código clasifica la familia del error y el `message` identifica la causa concreta y la acción sugerida. Esta tabla es la fuente única de los `message` en español.

| Código | Causa | Mensaje (español) | Acción sugerida |
|---|---|---|---|
| `4001` | Rechazo explícito del usuario | «Operación cancelada por el usuario.» | Volver a solicitarla desde la dApp |
| `4001` | Vencimiento del plazo (120 s firma / 60 s conexión, RF-40) | «El usuario no respondió en el plazo establecido (**120 s**); la solicitud ha caducado.» — el mensaje incluye el **tiempo transcurrido** en segundos (60 s en conexión) | Reintentar cuando el usuario esté disponible |
| `4001` | Cierre de la ventana de confirmación sin decidir | «La ventana de confirmación se cerró sin respuesta; la solicitud se ha cancelado.» | Volver a solicitarla |
| `4001` | Exceso de cardinalidad o de tasa de solicitudes aprobables (§2.8) | «Hay demasiadas solicitudes pendientes para este origen; espera a que se resuelva la actual.» | Esperar y reintentar |
| `4001` | ***Token bucket* agotado en cualquier método del catálogo, aprobable o no (ADT-24 / D-Q, §2.13)** | «Se ha superado el límite de llamadas para este origen; espera unos segundos y reintenta.» | Esperar unos segundos y reintentar |
| `4001` | Permiso de host denegado al dar de alta una red (ACU-27 / D-G) | «No se concedió el permiso de acceso a `<rpcUrl>`; la red no se ha añadido.» | Repetir el alta y aceptar el permiso |
| `4100` | Origen sin sesión autorizada, o emisor no autorizado (§4.2) | «Esta dApp no tiene permiso para usar la cartera.» | Conectar con `eth_requestAccounts` |
| `4200` | Método fuera del catálogo (`eth_sign`) | «El método solicitado no está soportado por TrueKeate Wallet.» | Usar `personal_sign` o `eth_signTypedData_v4` |
| `4200` | Método interno invocado desde un contexto no permitido (§4.2) | «El método solicitado no está permitido en este contexto.» | Invocarlo desde el popup |
| `4900` | RPC local caído (RNF-07) | «Sin conexión con la red local (Anvil).» | Arrancar Anvil en `127.0.0.1:8545` |
| `4901` | `chainId` no dado de alta | «La red solicitada no está dada de alta.» | Darla de alta con `wallet_addEthereumChain` |
| `-32602` | **Mnemonic inválido** (nº de palabras o checksum BIP-39) | «La frase de recuperación no es válida: revisa las 12 palabras y su checksum.» | Revisar la frase |
| `-32602` | **Clave privada inválida** | «La clave privada no es válida: debe ser `0x` + 64 caracteres hexadecimales de la curva secp256k1.» | Revisar la clave |
| `-32602` | **Dirección malformada** (checksum EIP-55) | «La dirección no es válida: revisa el formato `0x` + 40 caracteres hexadecimales.» | Revisar la dirección |
| `-32602` | **Cuenta ya existente** en la cartera | «Esa cuenta ya está en la cartera.» | Usar otra cuenta |
| `-32602` | **Payload por encima de 64 KiB** (ADT-21 / D-L, §3.9) | «La carga útil de la solicitud supera el límite de 64 KiB.» | Reducir el tamaño del mensaje o del calldata |
| `-32000` | **Saldo insuficiente** para valor + comisión | «Saldo insuficiente para cubrir el valor y la comisión estimada.» | Reducir el importe o recargar la cuenta |
| `-32000` | **Nonce inválido** rechazado por el nodo | «La red rechazó la transacción: nonce inválido.» | Reintentar (el SW recalcula el nonce al firmar) |
| `-32000` | `estimateGas` fallido o revert previo a firmar (§3.6) | «La estimación de gas falló: <motivo>. El envío se ha bloqueado.» | Corregir la llamada |
| `-32603` | Fallo no clasificado del SW | «Error interno de la cartera.» | Exportar los logs en JSON y reportarlo |
| `-32603` | Identificador duplicado en la cola (§2.8) | «Ya existe una solicitud con ese identificador.» | Regenerar la solicitud |
| `-32603` | **Cuota de `chrome.storage.local` agotada** (ADT-14 / D-M, §2.15) | «No hay espacio de almacenamiento en la extensión: la operación no se ha guardado.» | Exportar y borrar los logs (RF-32) |
| `-32603` | **Difusión interrumpida** por suspensión del SW (ADT-23 / D-R, §2.12) | «La difusión de la transacción se interrumpió; verifica su estado en el nodo antes de reintentar.» | Comprobar el nonce/hash en Anvil y reintentar |

> **Regla (ACU-05 / D-E, RNF-06).** **Todo error que se muestre al usuario lleva `code` numérico** —hacia la página, en el popup y en `truekeate_logs`—: queda prohibido resolver o pintar un error sin `code` (corrige el caso detectado por la auditoría) y prohibido `new Error('Request timeout')`. El `message` procede de esta tabla, uno por causa; el campo `errorCode` de `PendingRequest` (§2.8) usa estos mismos valores. La **caducidad de sesión** (§2.7) no figura aquí: no es un error, es un cambio de estado silencioso.

*Mensajes de vencimiento (H-07):* el error que llega a la página es siempre un objeto EIP-1193, nunca un `Error` sin `code`, e incluye el tiempo transcurrido:
```json
{ "code": 4001, "message": "El usuario no respondió en el plazo establecido (120 s); la solicitud ha caducado." }
```

---

## 5. Entidades de red (persistencia del nodo de pruebas — no de la extensión)

| Entidad | Campo | Valor esperado (Anvil por defecto) |
|---|---|---|
| Red | RPC URL | `http://127.0.0.1:8545` |
| Red | chainId | `31337` / `0x7a69` |
| Red | Chain ID de firma (EIP-155) | `31337` |
| Red | CORS de Anvil | **Allowlist explícita**, nunca `*` (H-41): `anvil --http.corsdomain "chrome-extension://<EXTENSION_ID>,http://localhost:5174"` |
| Extensión | ID de la extensión | **Literal estable y congelado** gracias a la **`key` fija** del manifest (§4.1.1, ADT-19 / D-N). `<EXTENSION_ID>` se documenta como constante en `entornos_globales.md` §3 y es el valor exacto que consumen la allowlist CORS **y** los E2E; sin la `key`, el ID cambiaría por perfil y ni RE-04 ni las pruebas serían reproducibles. |
| Extensión | UUID del provider | `PROVIDER_UUID = "9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90"`, literal congelado (§4.1.1, ADT-19 / D-N, RT-13). |
| Cuenta | Mnemonic | `test test test test test test test test test test test junk` |
| Cuenta | Ruta de derivación | `m/44'/60'/0'/0/{0..4}` |
| Cuenta | Direcciones | `0xf39F…2266`, `0x7099…79C8`, `0x3C44…93BC`, `0x90F7…b906`, `0x15d3…6A65` |
| Cuenta | Saldo inicial | 10 000 ETH por cuenta (Anvil default) |

**Endurecimiento del nodo local (H-41).** `RE-04` exige que el RPC permita CORS «desde el origen de la extensión»; una **allowlist** concreta lo cumple igual que el comodín y evita que cualquier sitio visitado en el mismo equipo invoque el JSON-RPC local (y los escenarios de *DNS rebinding* hacia `127.0.0.1`). Además:

- **El RPC local no debe exponerse**: mantener Anvil escuchando solo en `127.0.0.1` (nunca `0.0.0.0` ni la IP de red), sin túneles ni reenvíos de puerto, y sin navegar a sitios de terceros en la misma máquina mientras el nodo está en marcha.
- El comodín `--http.corsdomain "*"` solo sería aceptable en una máquina de desarrollo aislada y sin navegación a terceros, y en ningún caso es el valor documentado del proyecto.

---

## 6. Decisiones aplicadas a este diccionario

### 6.1 Decisiones de la entrevista

| Tema | Estado |
|---|---|
| P-03 (contraseña/cifrado) | ✅ **Sin contraseña.** No se crea `truekeate_vault`; `encryptionEnabled=false` y `requirePasswordOnOpen=false`. |
| P-04 (nº de cuentas) | ✅ **5 por defecto + botón "Añadir cuenta"**; `derivedAccountCount` se incrementa y `truekeate_accounts` crece en orden BIP-44. |
| P-05 (personal_sign / QR) | ✅ Confirmado: `personal_sign` usa `truekeate_pending_requests`; el QR es estado de UI y **no** se persiste. |
| P-06 (permisos/etiquetas) | ✅ Confirmado: al revocar se elimina la entrada de `truekeate_connected_sites`; `truekeate_imported_accounts[].label` es renombrable. |
| P-08 (GCP) | ✅ **No aplica**: alcance 100 % local. |

### 6.2 Remediación aplicada en v1.3 (Informe de Optimización V1)

| Hallazgo | Decisión aplicada en este documento |
|---|---|
| H-02 / H-07 / H-08 | Cola persistida `truekeate_pending_requests` como `Record<approvalId, PendingRequest>` con escritura read-modify-write serializada, purga al arrancar, correlación por `approvalId` persistido, puerto de larga vida con backoff, `chrome.alarms`, reconciliación al arrancar el SW y dueño único del plazo en el SW (§2.8, §3.4). Se elimina la entidad en memoria `PendingApproval` y su callejón sin salida. |
| H-09 | `truekeate_logs` vive en `chrome.storage.local` y **lo escribe siempre el SW**; RF-32 se cumple excluyéndola de `resetWallet`; criterio medible de ≥ 3 entradas con el popup cerrado (§1, §2.11). |
| H-10 | El nonce mostrado es **informativo**; el definitivo se recalcula al aprobar (`getTransactionCount`, `pending`) junto con `getFeeData()`, con cola FIFO por cuenta (una transacción en vuelo por `from`) (§3.1). |
| H-11a | `eth_sign` **se retira** del catálogo (responde `4200`); solo se mantiene `personal_sign`. Enum `method` y catálogo quedan alineados (§2.8, §4.3). |
| H-11b | `TxPreview` ampliado con `selector`, `functionName`, `decodedArgs`, `toLabel`, `isUnrecognizedContractCall` y `riskWarnings[]`; `TypedDataPreview` con `verifyingContract`, `domainName` y `verifyingContractMismatch`; regla de presentación de `personal_sign` en `PersonalSignPreview` (§3.1–§3.3). |
| H-18 | Cardinalidad máxima y por origen, política de desbordamiento (`4001`), control de tasa, regla «una solicitud por origen y cuenta» y regla de conteo global del badge como índice derivado (§2.8, §2.10). |
| H-21 | Semántica completa del polling: ciclo de 5 s, disparador, parada (popup cerrado, pestaña oculta, cambio de cuenta/red, RPC caído), máximo de cuentas y contador verificable en test (§2.10). |
| H-22 | Contrato observable de la transacción: hash devuelto, estados `pending`/`confirmed`/`failed`, bloqueo con `-32000` si falla `estimateGas`, revert con motivo y `eth_getTransactionReceipt` en el catálogo (§2.11, §3.6, §4.3). |
| H-23 | `wallet_revokePermissions` añadido al enum `method` de la cola persistida, con la columna del catálogo coherente (§2.8, §4.3). |
| H-24 | Nota vinculante de que la nomenclatura y los esquemas `codecrypto_*` de la guía heredada no son válidos (§1, §2.7). |
| H-31 | Contrato EIP-6963 completo: auto-anuncio, re-anuncio en cada `requestProvider`, re-emisión en `DOMContentLoaded`, listener síncrono, `uuid` constante e `icon` como data-URI PNG de 96 px (§4.1.1). |
| H-32 | Guarda de `sender`, allowlist de rutas y de métodos internos, `targetOrigin` cerrado, `origin` recalculado y `setAccessLevel`; RNF-10 desdoblado en canal externo e interno (§4.1, §4.2). |
| H-33 | Clave de sesión por origen normalizada (minúsculas, sin barra final, con puerto) y caducidad con `lastUsedAt`/`expiresAt`/`sessionTtlMs` (§2.7, §2.10). |
| H-39 | Nota de reenvío de `TRUEKEATE_EVENT` en sus dos saltos, indicando el campo que se conserva (§4.1). |
| H-41 | CORS de Anvil con allowlist en lugar de `*` y aviso de no exponer el RPC local (§5). |
| H-42 | Política explícita de redacción de `params`/`data`: nunca claves privadas, mnemonic ni firmas completas; retención global y por origen (§2.11). |

### 6.3 Remediación aplicada en v1.4 (Auditoría de Casos de Uso V1)

| Hallazgo | Decisión | Aplicación en este documento |
|---|---|---|
| ACU-03 | **D-A** | Identidad EIP-6963 corregida a la fuente de verdad RT-13: `name: "TrueKeate"` y `rdns: "academy.codecrypto.truekeate"`, con nota vinculante de que el `name` de EIP-6963 es el nombre corto de marca y **no** es `manifest.name` (`TrueKeate Wallet`); `uuid` constante e `icon` como data-URI PNG se mantienen (§4.1.1). |
| ACU-04 | **D-D** | `truekeate_logs` gana el campo **`event`** con el enum cerrado de **23** eventos (v1.4: 23; v1.5 añade `storage_quota_exceeded` → 24, §2.11), independiente de `category` (taxonomía); regla «una entrada por evento del catálogo» (RNF-16) y nota de que la derivación HD **no** es una importación (`account_imported` reservado a RF-05) (§2.11). |
| ACU-05 | **D-E** | Tabla de errores EIP-1193 ampliada a **un mensaje por causa** (varios mensajes por código): `4001` (rechazo, vencimiento con tiempo transcurrido, cierre de ventana, cardinalidad/tasa, permiso de host denegado), `-32000` (saldo insuficiente, nonce inválido, `estimateGas`), `-32602` (mnemonic, clave privada, dirección, cuenta ya existente). Regla: **todo error mostrado al usuario lleva `code`** (§4.3). |
| ACU-06 | **D-F** | Definido `accountLabels: Record<indice, string>` en `truekeate_settings`, complementario de `truekeate_imported_accounts[].label`, con un único renombrado en la UI (§2.10). |
| ACU-16 | **P-19** | `wallet_switchEthereumChain` con columna de aprobación inequívoca («sí, si la red destino no es la activa») y ciclo completo documentado (`PendingRequest`, `notification.html`, `chainChanged` a todas las pestañas, actualización de `truekeate_chain_id`, `4901` si no está dada de alta) (§4.3, §2.8). |
| ACU-17 | **D-B** | `expiresAt = lastUsedAt + truekeate_settings.sessionTtlMs` (24 h renovables) queda **respaldado por RF-25**; comportamiento al vencer: borrado de `truekeate_connected_sites`, `eth_accounts → []` y nuevo `eth_requestAccounts` (§2.7, §2.10). |
| ACU-25 | — | Convención de **claves canónicas**: nombre completo con prefijo obligatorio en todo el documento; no existe ningún almacén `settings.*` y el nombre corto solo se admite dentro de las filas de `truekeate_settings` (§1, §2.7, §2.8). |
| ACU-27 | **D-G** | El alta de red **siempre** solicita `chrome.permissions.request` para su `rpcUrl` —también desde el popup—, la concesión se registra por red y la denegación implica no persistir la red y devolver `4001` (§2.6, §4.3). |

### 6.4 Remediación aplicada en v1.5 (Auditoría del Documento Técnico V1)

| Hallazgo | Decisión | Aplicación en este documento |
|---|---|---|
| ADT-08 | **D-K** | Decodificación del calldata con **tabla local cerrada de selectores** (§3.7: 18 selectores generados con `keccak256` y verificados por test, sin servicios externos); fuera de la tabla, `functionName = null` + aviso bloqueante. `TypedDataPreview.verifyingContractMismatch` pasa a significar «dirección cero **o** contrato no desplegado»: se retira la comparación circular con el contrato declarado por la dApp (§3.2). |
| ADT-12 | **D-T** | Redacción de logs unificada en **los primeros 10 bytes de `data`** (`data.slice(0, 22)`) + `dataLength`, con regla explícita y test de redacción; se prohíbe cualquier variante de 4 bytes (§2.11). |
| ADT-14 | **D-M** | Nueva **§2.15**: cuota de `chrome.storage.local` de **10 MB** (mínimo Chrome 114), **sin** `unlimitedStorage`, presupuesto por clave y **modo de fallo observable** (1 reintento, entrada `storage_quota_exceeded` con `code: -32603`, aviso de panel al 90 % y fila `-32603` en la tabla de errores). El enum de eventos pasa de 23 a **24** (§2.11). |
| ADT-19 | **D-N** | `PROVIDER_UUID` con el **literal congelado** `9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90` y **`key` fija** en el manifest que estabiliza el **ID de la extensión**, del que dependen la allowlist CORS de Anvil y los E2E (§4.1.1, §5). |
| ADT-21 | **D-L** | Nueva **§3.9**: cota **`MAX_PAYLOAD_BYTES = 65536`** (64 KiB) por payload con **`-32602`** al excederla (fila propia en §4.3) y **redacción de previews largas en reposo** con `PREVIEW_INLINE_MAX_BYTES = 4096`, `payloadHash`/`messageHash` y banderas `truncated`/`redacted` (§3.2, §3.3). |
| ADT-22 | **P-21** | Sustituido el modelo «una ventana por origen» por la **ventana única global** `notification.html` (§3.8) con cola de espera e indicador de pendientes; `windowsByApprovalId` retirada y sustituida por la clave persistida `truekeate_approval_window` (§2.14); campo `windowId` de `PendingRequest` retirado; **favicon** de la dApp con su fuente (servicio `_favicon` del navegador), el permiso **`favicon`** y el saneado estricto (sin `data:` ni URLs remotas) (§2.9, §3.8). |
| ADT-23 | **D-R** | Nuevas claves persistidas `truekeate_inflight_tx` (§2.12: marca de transacción en vuelo por cuenta con fases `signing`/`broadcast` y TTL de 180 s) y `truekeate_rate_windows` (§2.13: *token bucket* y ventana de aprobaciones por origen), con su reconstrucción al arrancar el SW en §3.4. `fifoByAccount` deja de ser la garantía. |
| ADT-24 | **D-Q** | El *token bucket* por origen cubre **todo el catálogo RPC** de §4.3 (`rateLimitBurst = 20`, recarga `5/s`), no solo los métodos aprobables; al agotarse responde `4001` con mensaje propio, sin ventana, sin entrada en la cola y sin tocar el badge; exención declarada para `origin === 'extension'` (§2.13, §4.3). |
| ADT-25 | **P-22** | `wallet_addEthereumChain` **solo añade**: persiste con `isDefault: false`, sin escribir `truekeate_chain_id`, sin `chainChanged` y sin `PendingRequest` de cambio de red; usar la red exige `wallet_switchEthereumChain` con aprobación (§2.6, §4.3). |
| ADT-26 | **D-S** | Prohibición explícita de **`chrome.storage.sync`** (almacén único `local`, verificado por `grep` + test) en §1 y §2.15; provider publicado con `Object.defineProperty` **no configurable** (el mismo objeto para `truekeate` y `codecrypto`) con test negativo de suplantación (§4.1.1). |
| ADT-30 | **D-P** | Sin impacto en el modelo de datos: `notifications` sale del MVP y pasa a `optional_permissions` (RF-39, ciclo posterior) y **no** existe ninguna clave ni evento del diccionario que dependa de ese permiso. Los permisos que sí afectan a este documento son **`favicon`** (§3.8) y **`clipboardRead`/`clipboardWrite`** (§3.10), que deben reflejarse en `documento_tecnico.md` §7.3 y `entornos_globales.md` §4. |
| ADT-09 | **P-20** | Nueva **§3.10**: entidad de UI `SecretReveal` (**no persistida**) con `REVEAL_HIDE_MS = 30000` (30 s), ocultado por temporizador **y** por pérdida de foco, y **política de portapapeles**: copiar permitido y borrado del portapapeles al ocultar si aún contiene la semilla (comparación por `sha256`), con los permisos necesarios y el borrado incondicional como respaldo. |
| ADT-07 | **D-J** | Precisión de coherencia en §4.2 (guarda 5): el origen se deriva **solo** de `sender.origin` y con `sender.frameId !== 0` queda prohibido el respaldo a `sender.tab.url`; la respuesta y los eventos se entregan solo al frame registrado. |

**Deltas que este documento deja señalados para el resto del corpus (no se editan aquí).** (1) `requerimientos.md` §2.2 y el catálogo de eventos del `documento_tecnico.md` (M31) deben incorporar `storage_quota_exceeded` (24 eventos) y la fila `-32602` de payload; (2) `documento_tecnico.md` §7.3 y `entornos_globales.md` §4 deben declarar los permisos `favicon`, `clipboardRead` y `clipboardWrite`, y `entornos_globales.md` §3 las constantes `MAX_PAYLOAD_BYTES`, `PREVIEW_INLINE_MAX_BYTES`, `REVEAL_HIDE_MS`, `INFLIGHT_TTL_MS`, `rateLimitBurst`, `rateLimitRefillPerSecond`, `rateWindowTtlMs`, `RATE_PERSIST_DEBOUNCE_MS`, `PROVIDER_UUID` y `EXTENSION_ID`; (3) RF-21 y RF-50 deben recoger la redacción de previews largas y la política de portapapeles.

---

## 7. Historial de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| 1.2 | — | Línea base auditada por `INFORME_OPTIMIZACION_V1.md`: entidades `truekeate_*`, `TxPreview`, `TypedDataPreview`, `PendingApproval` en memoria, protocolo de mensajes y catálogo RPC. |
| **1.3** | Sesión de remediación | Cierre de H-02, H-07, H-08, H-09, H-10, H-11a, H-11b, H-18, H-21, H-22, H-23, H-24, H-31, H-32, H-33, H-39, H-41 y H-42: `truekeate_pending_requests` como `Record<approvalId, PendingRequest>` con RMW serializada y purga; correlación persistida + puerto de larga vida con backoff; `chrome.alarms` y reconciliación al arrancar; dueño único del plazo en el SW con error EIP-1193 `4001` y cierre de ventana; `truekeate_logs` en `chrome.storage.local` escrito por el SW y excluido de `resetWallet`; nonce informativo con recálculo y cola FIFO por cuenta; retirada de `eth_sign`; previsualización ampliada (calldata, `verifyingContract`, avisos de riesgo, `personal_sign`); cardinalidad, tasa, desbordamiento y badge; semántica del polling; contrato observable de transacción y `eth_getTransactionReceipt`; `wallet_revokePermissions` en el enum; nomenclatura heredada invalidada; contrato EIP-6963 completo; guardas de la cadena de mensajes y `setAccessLevel`; normalización y caducidad de sesiones por origen; nota de reenvío de `TRUEKEATE_EVENT`; CORS de Anvil con allowlist; política de redacción de logs. |
| **1.4** | Sesión de auditoría de casos de uso | Cierre de **ACU-03, ACU-04, ACU-05, ACU-06, ACU-16, ACU-17, ACU-25 y ACU-27** (decisiones **D-A, D-B, D-D, D-E, D-F, D-G** y **P-19**): identidad EIP-6963 alineada con RT-13 (`name: "TrueKeate"`, `rdns: "academy.codecrypto.truekeate"`); campo `event` con enum cerrado (**23** en v1.4; **24** desde v1.5 al añadir `storage_quota_exceeded`; hoy **24**) separado de `category` y regla de una entrada por evento (RNF-16); tabla de errores con un mensaje por causa y obligación de `code` en todo error mostrado; `accountLabels` en `truekeate_settings`; ciclo completo de `wallet_switchEthereumChain`; caducidad de sesión (24 h renovables) respaldada por RF-25 con su comportamiento al vencer; claves canónicas con prefijo completo (sin almacén `settings.*`); permiso de host en runtime siempre y por red en `wallet_addEthereumChain` (también desde el popup). Detalle en §6.3. |
| **1.5** | Sesión de auditoría del documento técnico | Cierre de **ADT-08, ADT-12, ADT-14, ADT-19, ADT-21, ADT-22, ADT-23, ADT-24, ADT-25, ADT-26 y ADT-30** (decisiones **D-K, D-L, D-M, D-N, D-P, D-Q, D-R, D-S, D-T**, la precisión **D-J** y las decisiones del usuario **P-20, P-21 y P-22**): **ventana única global** de confirmación con cola y contador, `windowsByApprovalId` y el campo `windowId` retirados, nueva clave `truekeate_approval_window` (§2.14) y favicon de la dApp con fuente, permiso `favicon` y saneado (§3.8); **tres claves persistidas nuevas** `truekeate_inflight_tx` (§2.12) y `truekeate_rate_windows` (§2.13) con su reconstrucción al arrancar el SW (§3.4); *token bucket* por origen sobre **todo** el catálogo RPC con `4001` al agotarlo (§2.13, §4.3); cota de payload de **64 KiB** con `-32602` y redacción de previews en reposo (`PREVIEW_INLINE_MAX_BYTES = 4096`, §3.9, §3.2, §3.3); **cuota de 10 MB** de `chrome.storage.local` sin `unlimitedStorage` y fallo observable con `-32603` y el nuevo evento `storage_quota_exceeded` (24 eventos, §2.15, §2.11); tabla local cerrada de selectores y `verifyingContractMismatch` redefinido (§3.7, §3.2); `wallet_addEthereumChain` que **añade sin activar** (§2.6, §4.3); prohibición de `chrome.storage.sync` y provider no configurable (§1, §4.1.1); UUID congelado y `key` fija del manifest (§4.1.1, §5); política de portapapeles del revelado con borrado al ocultar (`REVEAL_HIDE_MS = 30000`, §3.10); y redacción de logs confirmada en los **primeros 10 bytes** de `data` (§2.11). Detalle en §6.4. |
 **1.6 (esta versión)** — cierre de los residuales del veredicto de reevaluación: el delta del **evento 24** (`storage_quota_exceeded`) se declara **ya espejado** en `requerimientos.md` §2.2 y en el `documento_tecnico.md` (M31); **§4.3 queda confirmada como fuente única de los literales** de error; el seguimiento de `eth_getTransactionReceipt` de §3.6 gana criterio observable (recibo `0x1`/`0x0` o vencimiento del plazo persistido, 1 entrada de log por transición); y se traza el conteo histórico 23 → 24 en el historial.
