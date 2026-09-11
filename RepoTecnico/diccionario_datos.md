# 🗂️ Diccionario de Datos — TrueKeate Wallet

> **Fase:** 1 — Concepto · **Versión:** 1.4
> Se actualiza de forma incremental durante el desarrollo. Fuente de verdad de claves de `chrome.storage.local`, mensajes y entidades en memoria.
> **v1.3:** cierra los hallazgos H-02, H-07, H-08, H-09, H-10, H-11a, H-11b, H-18, H-21, H-22, H-23, H-24, H-31, H-32, H-33, H-39, H-41 y H-42 de `INFORME_OPTIMIZACION_V1.md`. Detalle en §6.2 y §7.
> **v1.4:** cierra los hallazgos **ACU-03, ACU-04, ACU-05, ACU-06, ACU-16, ACU-17, ACU-25 y ACU-27** de `casos_uso/AUDITORIA_CASOS_USO_V1.md` con las decisiones **D-A, D-B, D-D, D-E, D-F, D-G** y **P-19**. Detalle en §6.3 y §7.

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
- **Claves canónicas y nombre completo obligatorio (ACU-25).** Toda clave de `chrome.storage.local` se cita en este corpus **siempre** con su nombre completo con prefijo: `truekeate_settings`, `truekeate_networks`, `truekeate_accounts`, `truekeate_connected_sites`, `truekeate_pending_requests`, `truekeate_connect_request`, `truekeate_logs`, `truekeate_chain_id`, `truekeate_current_account`, `truekeate_imported_accounts`, `truekeate_mnemonic`. **No existe ningún almacén llamado `settings.*`** (ni `settings.networks`): el nombre corto del campo (`settings.sessionTtlMs`, `settings.logLimit`, …) solo se admite **dentro de las propias filas de la tabla de `truekeate_settings`** (§2.10) y en la tabla de constantes de `entornos_globales.md` §3. Escribir `settings.networks` donde la clave real es `truekeate_networks` es un defecto de nomenclatura, no una abreviatura válida.
- **No hay `localStorage` en ningún componente.** El Service Worker de MV3 no lo tiene y el popup no lo usa; los logs viven en `chrome.storage.local` (§2.11).
- **Clave de origen canónica:** minúsculas y sin barra final; el puerto **forma parte** de la clave (`http://localhost:5174`) (H-33, §2.7).
- **Nivel de acceso al storage:** el SW ejecuta `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` al arrancar, para que ningún content script pueda leer el contenido de `chrome.storage.local` (H-32). Requiere el permiso `storage` ya previsto.

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
| `params` | `unknown[]` | Sí | Parámetros originales de la llamada RPC, persistidos **redactados** según la política de §2.11 (H-42). |
| `origin` | `string` | Sí | Origen normalizado (§2.7) de la dApp solicitante. |
| `tabId` | `number \| null` | Sí | Pestaña que originó la solicitud (`null` si nace en el popup, p. ej. `wallet_revokePermissions` de RF-26). |
| `frameId` | `number \| null` | Sí | Frame solicitante (`0` = frame principal; `null` junto a `tabId`). |
| `account` | `Address` | Sí | Cuenta que firmará. |
| `chainId` | `ChainIdHex` | Sí | Red activa al crear la solicitud. |
| `txPreview` | `TxPreview` | No | Solo en `eth_sendTransaction` (ver §3.1). |
| `typedDataPreview` | `TypedDataPreview` | No | Solo en `eth_signTypedData_v4` (ver §3.2). |
| `signMessagePreview` | `PersonalSignPreview` | No | Solo en `personal_sign` (ver §3.3). |
| `createdAt` | `number` | Sí | Epoch ms. **Ancla del cómputo del plazo** (RF-40, H-07). |
| `expiresAt` | `number` | Sí | Epoch ms: `createdAt + SIGN_TIMEOUT_MS` (120 000 ms). |
| `status` | `'pending' \| 'approved' \| 'rejected' \| 'expired'` | Sí | Estado del ciclo de vida. Solo `pending` bloquea la cola. |
| `resolvedAt` | `number` | No | Epoch ms de la transición fuera de `pending`. |
| `errorCode` | `number` | No | Código EIP-1193 emitido al resolver (§4.3). |
| `windowId` | `number` | No | Ventana de `notification.html` asociada, si se abrió. |

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
    "status": "pending", "windowId": 1187
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
| Máximo por origen | `truekeate_settings.pendingRequestsMaxPerOrigin = 1` | La segunda solicitud del mismo origen mientras la primera esté `pending` se rechaza con `4001`. Evita la fatiga de aprobación y la ventana duplicada del mismo origen (H-18, H-35). |
| Límite de tasa por origen | `truekeate_settings.pendingRequestsPerMinute = 6` | Pasado el umbral en la ventana de 60 s, se rechaza con `4001` sin abrir ventana. |
| Duplicado exacto | mismo `origin` + `method` + `params` | Se trata como la regla «máximo por origen»: se rechaza con `4001` mientras la primera siga `pending`; una vez resuelta, se admite una nueva. |
| Unicidad de identificadores | `approvalId` y `requestId` son `uuid` v4 en un espacio global compartido | El SW rechaza con `-32603` cualquier identificador ya presente en `truekeate_pending_requests` o en `truekeate_connect_request`. |

**Dos solicitudes del mismo origen y cuenta (regla explícita).** Nunca hay dos `PendingRequest` `pending` con el mismo `origin`. Si además comparten `account`, la segunda se rechaza con `4001` (no se encola en espera) y el `errorCode` queda registrado; el dApp puede reintentar cuando la primera termine. La regla «máximo por origen» es la que gobierna la ventana de `notification.html`: **una sola ventana de confirmación por origen**.

**Índice derivado del badge (RF-38).** El badge **no** se persiste: es un índice derivado que se recalcula tras cada escritura o purga como `Object.values(map).filter(r => r.status === 'pending').length` y se aplica con `chrome.action.setBadgeText` / `setBadgeBackgroundColor`. Regla de conteo: **global**, suma de todas las solicitudes `pending` de todos los orígenes y tipos (no por origen ni por tipo). Al purgar (expiración, aprobación, rechazo, cierre de ventana) el badge se recalcula y, si el total es 0, se limpia (`setBadgeText({ text: '' })`) (H-07, H-18).

---

### 2.9 `truekeate_connect_request` — solicitudes de conexión

> **RF-16, RF-36. Remodelada en v1.3 (H-18).**
> Estructura: **`Record<requestId, ConnectRequest>`** (mismo motivo que §2.8: con una clave única, dos orígenes que pidan conexión a la vez se sobrescribirían). Se conserva el nombre de clave por continuidad documental; ninguna decisión autoriza renombrarlo.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `requestId` | `uuid` | Sí | Clave del mapa. Espacio global compartido con `approvalId` (§2.8). |
| `origin` | `string` | Sí | Origen normalizado de la dApp (§2.7). |
| `favicon` | `string` | No | Favicon del origen (`chrome://favicon`). |
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
| `event` | `EventName` (enum cerrado de **23** valores) | **Nuevo (ACU-04 / D-D).** Nombre del evento instrumentado: **qué ocurrió**. Enum cerrado alineado con el catálogo de `requerimientos.md` §2.2 y con RNF-16. |
| `message` | `string` | Texto legible en español (RNF-06). |
| `origin` | `string` | Origen de la dApp o `extension`. |
| `method` | `string` | Método RPC implicado, si aplica. |
| `data` | `unknown` | Payload **redactado** según la tabla inferior (H-42). |
| `txHash` | `Hex` | Solo en `category: 'tx'`: hash devuelto por `eth_sendTransaction` (H-22, RF-31). |
| `txStatus` | `'pending' \| 'confirmed' \| 'failed'` | Solo en `category: 'tx'`: estado observable de la transacción (§3.6, H-22). |

**Enum `event` — catálogo cerrado de 23 eventos (ACU-04 / D-D, RNF-16).**

`rpc_call` · `rpc_error` · `event_emit` · `tx_sent` · `tx_confirmed` · `tx_failed` · `tx_reverted` · `sign_personal` · `sign_typed_data` · `approval_created` · `approval_resolved` · `approval_expired` · `chain_changed` · `accounts_changed` · `wallet_created` · `wallet_imported` · `account_imported` · `account_removed` · `reset_wallet` · `network_added` · `permission_revoked` · `sw_started` · `sw_reconcile`

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

**Retención:** FIFO por `ts`; se descartan las entradas más antiguas al superar `logLimit = 500` global o `logMaxPerOrigin = 200` por origen. La limpieza de `resetWallet` (RF-11) **excluye** esta clave.

**Criterio medible de ejemplo (H-09, RNF-16).** Un `eth_sendTransaction` ejecutado **con el popup cerrado** produce **≥ 3 entradas** en `truekeate_logs` con `ts`, `level` y `origin` (p. ej. `call` de entrada, `sign` de aprobación y `tx` con `txHash` en estado `pending`). La aserción se ejecuta sobre `chrome.storage.local`, no sobre el DOM del popup.

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
| `functionName` | `string \| null` | Firma decodificada (p. ej. `transfer(address,uint256)`) o `null` si el selector es desconocido. |
| `decodedArgs` | `object \| null` | Argumentos legibles decodificados con el ABI disponible; `null` si no se puede decodificar. |
| `isUnrecognizedContractCall` | `boolean` | `true` si `data !== '0x'` y el selector no se reconoce → aviso «llamada a contrato no reconocida» (H-11b). |
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

**Nonce (H-10).** El `nonce` mostrado en la vista previa es **informativo**: sirve para que el usuario entienda el orden, no para firmar. El nonce **definitivo se recalcula al aprobar** con `getTransactionCount(account, 'pending')`, junto con `getFeeData()`, en el momento exacto de firmar. El envío se serializa con una **cola FIFO por cuenta** (`fifoByAccount`, §3.4): como máximo **una transacción en vuelo por `from`**; una segunda aprobación de la misma cuenta espera a que la primera se difunda. Si el nodo rechaza el nonce, el error es `-32000` (§4.3).

### 3.2 `TypedDataPreview` (EIP-712)

| Campo | Tipo | Descripción |
|---|---|---|
| `domain` | `object` | `name`, `version`, `chainId`, `verifyingContract`, `salt`. |
| `domainName` | `string \| null` | `domain.name` en claro, mostrado en la ventana de confirmación (H-11b). |
| `verifyingContract` | `Address \| null` | `domain.verifyingContract` en claro (H-11b). |
| `types` | `object` | Sin `EIP712Domain` (se elimina antes de firmar). |
| `message` | `object` | Datos a firmar. |
| `primaryType` | `string` | Tipo raíz detectado. |
| `domainChainMismatch` | `boolean` | `true` si `domain.chainId ≠ chainId` activo → advertencia destacada en UI (H-11). |
| `verifyingContractMismatch` | `boolean` | `true` si `verifyingContract` es la dirección cero, no es un contrato desplegado o no coincide con el contrato declarado por la dApp → advertencia destacada en UI (H-11b). |

### 3.3 `PersonalSignPreview` (firma de texto plano, RF-21)

| Campo | Tipo | Descripción |
|---|---|---|
| `text` | `string \| null` | Payload decodificado como texto UTF-8 legible, mostrado tal cual en `notification.html`. |
| `isHexPayload` | `boolean` | `true` si el payload es hexadecimal y **no** es legible como UTF-8 → advertencia destacada en español (H-11b). |
| `byteLength` | `number` | Longitud del payload en bytes. |
| `bytesHex` | `Hex` | Payload original, solo para la UI de la ventana; nunca se copia a `truekeate_logs` (§2.11). |

### 3.4 Ciclo de aprobación: registro persistido + puerto de larga vida

> **v1.3 (H-02, H-07).** Sustituye a la entidad en memoria `PendingApproval` de v1.2. **Ya no existe** un `Map` de `resolve`/`reject` como fuente de verdad, ni la frase «si la promesa original ya no existe, la solicitud se resuelve con error `4001`»: no había a quién resolverle. La fuente de verdad es el registro persistido de §2.8 y la respuesta se entrega por el canal que se describe aquí.

**Estado volátil del SW (solo índice de transporte, reconstruible).**

| Estructura (sin prefijo, memoria) | Tipo | Descripción | Recuperación |
|---|---|---|---|
| `portsByApprovalId` | `Map<string, chrome.runtime.Port>` | Puerto de larga vida abierto por el content script o el popup que espera la respuesta (`chrome.runtime.connect({ name: 'truekeate_approval' })`). Mantiene vivo el SW durante la espera. | Si el SW se duerme, el puerto se cierra: el content script se **reconecta con backoff** (1 s, 2 s, 4 s, 8 s, 16 s, máx. 30 s) y envía `{ type: 'RESUME', approvalId }`; el SW contesta desde el registro persistido o con `4001` si la entrada ya no está `pending`. |
| `windowsByApprovalId` | `Map<string, number>` | `windowId` de `notification.html`. | Se re-descubre con `chrome.windows.getAll({ populate: true })` filtrando por la URL de la extensión; si no aparece ninguna, la solicitud se marca `expired`. |
| `expiryAlarms` | `Map<string, string>` | Nombre del `chrome.alarms` de vencimiento. | Se re-arma al arrancar desde `expiresAt` de cada entrada `pending`. |
| `fifoByAccount` | `Map<Address, Promise<void>>` | Cola FIFO de firma por cuenta (H-10): una transacción en vuelo por `from`. | Volátil por diseño; el orden se deriva de `createdAt`. |
| `rmwLock` | `Promise<void>` | Cerrojo de la escritura read-modify-write serializada de §2.8/§2.9. | Se recrea al arrancar. |

**Dueño único del plazo (H-07).** El Service Worker es el **único** dueño de `SIGN_TIMEOUT_MS = 120000` y `CONNECT_TIMEOUT_MS = 60000`, anclados a `createdAt` (`expiresAt` persistido). La capa inject/content script **no fija timeout propio**; si se implementa como red de seguridad, debe usar un margen superior (`SIGN_TIMEOUT_MS + 5000 = 125000`) y delegar siempre en el `approvalId`. El snippet de 30 s del material de referencia **no es normativo**.

**Vencimiento con `chrome.alarms` (H-02, H-07).** Un `setTimeout` no sobrevive a la suspensión del SW, así que por cada solicitud `pending` el SW crea `chrome.alarms.create('truekeate_expire:<approvalId>', { when: expiresAt })` (requiere el permiso `alarms` en el manifest). Al expirar, el SW:

1. marca la entrada como `expired` con `resolvedAt` y `errorCode: 4001` (persistido, no solo en memoria);
2. **cierra la ventana** de `notification.html` (`chrome.windows.remove(windowId)`);
3. emite a la página un **objeto EIP-1193**, nunca `new Error('Request timeout')`:
   ```json
   { "code": 4001, "message": "El usuario no respondió en el plazo establecido (120 s); la solicitud ha caducado." }
   ```
4. **purga el badge** (recalcula el índice derivado de §2.8).

**Reconciliación al arrancar el Service Worker (H-02).**

1. Purga de entradas de §2.8/§2.9 con `status !== 'pending'` o `expiresAt <= now`.
2. Para cada `pending` restante: rearmar `chrome.alarms` con `expiresAt` y verificar si su ventana sigue abierta.
3. Para cada `approvalId` **huérfano** (sin puerto vivo, sin ventana o ya vencido): marcarlo `expired` y emitir `4001` a la pestaña/frame registrados con `chrome.tabs.sendMessage(tabId, mensaje, { frameId })`. Si la pestaña ya no existe, se descarta la entrada y se deja traza en `truekeate_logs`. El objetivo es que **nunca** quede una dApp colgada, una ventana huérfana ni una solicitud sin traza.

**Tabla de correlación `approvalId ↔ tabId/frameId` y su recuperación.**

| Dato persistido | Valor | Uso |
|---|---|---|
| `approvalId` | `uuid` | Correlación entre la llamada RPC original, la ventana y la respuesta. |
| `tabId` | `number \| null` | Pestaña a la que se entrega la respuesta si no hay puerto. |
| `frameId` | `number \| null` | Frame exacto de entrega (`all_frames: true`, RF-13). |
| `origin` | `string` normalizado | Verificación de que la respuesta va al origen solicitante. |
| `windowId` | `number` (cuando existe) | Cierre de `notification.html` al expirar o resolver. |

*Recuperación, en orden de preferencia:* (1) **puerto vivo** → entregar por `portsByApprovalId` y cerrar el puerto; (2) **puerto cerrado + pestaña viva** → `chrome.tabs.sendMessage(tabId, { type: 'TRUEKEATE_RESPONSE', approvalId, result|error }, { frameId })`; (3) **pestaña cerrada** → `chrome.tabs.onRemoved` marca la solicitud `rejected` (o `expired` si el plazo ya venció) y purga el badge; (4) **`windowId` perdido** → re-descubrir la ventana por URL; si no existe, `expired` + `4001`. La solicitud **nunca** se resuelve «en el vacío»: si no hay destinatario, se marca, se registra y se purga.

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
| Seguimiento | El SW consulta `eth_getTransactionReceipt` (método añadido al catálogo, §4.3) hasta obtener recibo o agotar el seguimiento; el resultado se refleja en los logs (§2.11), que es la evidencia verificable de RF-31. |

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

### 4.2 Content Script / popup ↔ Service Worker (`chrome.runtime`)

| `type` | Dirección | Campos | Guarda obligatoria |
|---|---|---|---|
| `TRUEKEATE_RPC` | content/popup → SW | `method`, `params`, `origin`, `tabId` | `sender.id === chrome.runtime.id`; el `origin` declarado por la página es **dato no fiable**: el SW lo recalcula desde `sender.origin`/`sender.tab.url` (§4.3). |
| `SIGN_RESPONSE` | notification → SW | `approvalId`, `success`, `error?` | `sender.id === chrome.runtime.id` **y** `sender.url` en la allowlist de páginas de la extensión (`notification.html`). |
| `CONNECT_RESPONSE` | connect → SW | `requestId`, `success`, `account?`, `accountIndex?`, `error?` | Ídem, con `connect.html` en la allowlist. |
| `RESUME` | content/popup → SW (por puerto) | `approvalId` | Puerto `truekeate_approval`; dispara la reconexión de §3.4. |
| `TRUEKEATE_EVENT` | SW → content | `eventName`, `data` | Salto 1 de §4.1 (nota H-39). |

**Guardas de la cadena de mensajes (H-32, RNF-10).**

1. **Emisor.** En `chrome.runtime.onMessage` se exige `sender.id === chrome.runtime.id`. Cualquier mensaje con otro `id` se descarta con `4100`.
2. **Allowlist de rutas** para `SIGN_RESPONSE` y `CONNECT_RESPONSE`: solo `chrome-extension://<id>/notification.html` y `chrome-extension://<id>/connect.html`. Cualquier otra ruta → `4200`.
3. **Allowlist de métodos internos.** Los métodos `wallet_*` **solo** se aceptan desde páginas de la extensión (`sender.tab === undefined` y `sender.url` en la allowlist del popup), **nunca** desde content scripts. Si llegan con `sender.tab` presente → `4200 Unsupported method`.
4. **`targetOrigin` cerrado** en todo `postMessage` saliente (§4.1).
5. **`origin` recalculado.** El SW nunca confía en el campo `origin` que envía el content script: lo deriva de `sender.origin`/`sender.tab.url`, lo normaliza (§2.7) y lo usa para las claves de sesión.
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
| `wallet_addEthereumChain` | red | **Sí**, y además **solicita el permiso de host en runtime** para su `rpcUrl` (ACU-27 / D-G) | página **o popup** | RF-23 |
| `wallet_revokePermissions` | permisos | **Sí** | página o popup | RF-26. Desde el popup la confirmación es la propia UI (RF-26); desde una dApp se representa en `truekeate_pending_requests` (§2.8, H-23). |
| `wallet_deriveAccounts` | interna (solo popup) | No | popup | RF-04 |
| `wallet_generateMnemonic` | interna (solo popup) | No | popup | RF-01 |
| `wallet_importPrivateKey` | interna (solo popup) | No | popup | RF-05 |
| `wallet_getNetworks` / `wallet_getLogs` | interna (solo popup) | No | popup | RF-23/RF-28 |

**`wallet_switchEthereumChain` — ciclo completo (P-19, ACU-16, RF-22/RF-24).**

1. **La red destino ya es la activa** (`truekeate_chain_id`): responde de inmediato con `null`, **sin** crear `PendingRequest`, **sin** abrir `notification.html` y **sin** emitir `chainChanged` (no hay cambio que notificar ni nada que aprobar).
2. **La red destino está dada de alta** en `truekeate_networks` pero no es la activa: crea un `PendingRequest` con `method: 'wallet_switchEthereumChain'` (§2.8) y lo aprueba el usuario en `notification.html`. **Al aprobar**, el SW (a) escribe el nuevo `truekeate_chain_id`, (b) emite `chainChanged` con el nuevo `chainId` a **todas las pestañas** (RF-24), (c) registra `event: 'chain_changed'`/`approval_resolved` en `truekeate_logs` (§2.11) y (d) purga el badge.
3. **La red destino no está dada de alta**: `4901` «La red solicitada no está dada de alta.», sin ventana y sin `PendingRequest`.
4. **Rechazo o vencimiento** del plazo de 120 s: `4001` con el mensaje por causa de la tabla de errores (**sin** cambiar `truekeate_chain_id`).

> `wallet_switchEthereumChain` **figura en el enum `method` de `truekeate_pending_requests`** (§2.8), junto a los demás métodos aprobables (ACU-16).

**`wallet_addEthereumChain` — permiso de host en runtime, siempre y por red (ACU-27 / D-G, RT-04, RF-23).** El alta de una red recorre, en este orden: (1) **validación** de esquema y host (esquema `https` preferente; `http` solo para `127.0.0.1`/`localhost`; host ni privado ni de enlace local); (2) **aprobación explícita** del usuario mediante `PendingRequest` + `notification.html`; (3) **`chrome.permissions.request` sobre el `rpcUrl`** (gesto válido del usuario) contra `optional_host_permissions` —**también cuando el alta la inicia el popup**: el clic del usuario es el gesto válido y **no hay excepción por contexto**—; (4) **persistencia** en `truekeate_networks`. La **concesión se registra por red** (la propia entrada persistida es la prueba de la red autorizada) y se instrumenta con `event: 'network_added'`. **Si el usuario deniega el permiso de host, la red no se persiste** y la llamada se resuelve con `4001` y el mensaje «No se concedió el permiso de acceso a `<rpcUrl>`; la red no se ha añadido.». El manifest no se amplía: sigue en mínimos privilegios con `optional_host_permissions` (`entornos_globales.md` §4).

`wallet_revokePermissions` **figura en el enum `method` de `truekeate_pending_requests`** (§2.8): un requisito Must con cola de aprobación no puede quedar sin representación persistida (H-23, RNF-08).

**Códigos de error EIP-1193 usados — tabla cerrada, un mensaje por causa (ACU-05 / D-E, RNF-06).** Un mismo `code` admite **varios mensajes**, uno por causa: el código clasifica la familia del error y el `message` identifica la causa concreta y la acción sugerida. Esta tabla es la fuente única de los `message` en español.

| Código | Causa | Mensaje (español) | Acción sugerida |
|---|---|---|---|
| `4001` | Rechazo explícito del usuario | «Operación cancelada por el usuario.» | Volver a solicitarla desde la dApp |
| `4001` | Vencimiento del plazo (120 s firma / 60 s conexión, RF-40) | «El usuario no respondió en el plazo establecido (**120 s**); la solicitud ha caducado.» — el mensaje incluye el **tiempo transcurrido** en segundos (60 s en conexión) | Reintentar cuando el usuario esté disponible |
| `4001` | Cierre de la ventana de confirmación sin decidir | «La ventana de confirmación se cerró sin respuesta; la solicitud se ha cancelado.» | Volver a solicitarla |
| `4001` | Exceso de cardinalidad o de tasa (§2.8) | «Hay demasiadas solicitudes pendientes para este origen; espera a que se resuelva la actual.» | Esperar y reintentar |
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
| `-32000` | **Saldo insuficiente** para valor + comisión | «Saldo insuficiente para cubrir el valor y la comisión estimada.» | Reducir el importe o recargar la cuenta |
| `-32000` | **Nonce inválido** rechazado por el nodo | «La red rechazó la transacción: nonce inválido.» | Reintentar (el SW recalcula el nonce al firmar) |
| `-32000` | `estimateGas` fallido o revert previo a firmar (§3.6) | «La estimación de gas falló: <motivo>. El envío se ha bloqueado.» | Corregir la llamada |
| `-32603` | Fallo no clasificado del SW | «Error interno de la cartera.» | Exportar los logs en JSON y reportarlo |
| `-32603` | Identificador duplicado en la cola (§2.8) | «Ya existe una solicitud con ese identificador.» | Regenerar la solicitud |

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
| Red | CORS de Anvil | **Allowlist explícita**, nunca `*` (H-41): `anvil --http.corsdomain "chrome-extension://<id>,http://localhost:5174"` |
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
| ACU-04 | **D-D** | `truekeate_logs` gana el campo **`event`** con el enum cerrado de **23** eventos, independiente de `category` (taxonomía); regla «una entrada por evento del catálogo» (RNF-16) y nota de que la derivación HD **no** es una importación (`account_imported` reservado a RF-05) (§2.11). |
| ACU-05 | **D-E** | Tabla de errores EIP-1193 ampliada a **un mensaje por causa** (varios mensajes por código): `4001` (rechazo, vencimiento con tiempo transcurrido, cierre de ventana, cardinalidad/tasa, permiso de host denegado), `-32000` (saldo insuficiente, nonce inválido, `estimateGas`), `-32602` (mnemonic, clave privada, dirección, cuenta ya existente). Regla: **todo error mostrado al usuario lleva `code`** (§4.3). |
| ACU-06 | **D-F** | Definido `accountLabels: Record<indice, string>` en `truekeate_settings`, complementario de `truekeate_imported_accounts[].label`, con un único renombrado en la UI (§2.10). |
| ACU-16 | **P-19** | `wallet_switchEthereumChain` con columna de aprobación inequívoca («sí, si la red destino no es la activa») y ciclo completo documentado (`PendingRequest`, `notification.html`, `chainChanged` a todas las pestañas, actualización de `truekeate_chain_id`, `4901` si no está dada de alta) (§4.3, §2.8). |
| ACU-17 | **D-B** | `expiresAt = lastUsedAt + truekeate_settings.sessionTtlMs` (24 h renovables) queda **respaldado por RF-25**; comportamiento al vencer: borrado de `truekeate_connected_sites`, `eth_accounts → []` y nuevo `eth_requestAccounts` (§2.7, §2.10). |
| ACU-25 | — | Convención de **claves canónicas**: nombre completo con prefijo obligatorio en todo el documento; no existe ningún almacén `settings.*` y el nombre corto solo se admite dentro de las filas de `truekeate_settings` (§1, §2.7, §2.8). |
| ACU-27 | **D-G** | El alta de red **siempre** solicita `chrome.permissions.request` para su `rpcUrl` —también desde el popup—, la concesión se registra por red y la denegación implica no persistir la red y devolver `4001` (§2.6, §4.3). |

---

## 7. Historial de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| 1.2 | — | Línea base auditada por `INFORME_OPTIMIZACION_V1.md`: entidades `truekeate_*`, `TxPreview`, `TypedDataPreview`, `PendingApproval` en memoria, protocolo de mensajes y catálogo RPC. |
| **1.3** | Sesión de remediación | Cierre de H-02, H-07, H-08, H-09, H-10, H-11a, H-11b, H-18, H-21, H-22, H-23, H-24, H-31, H-32, H-33, H-39, H-41 y H-42: `truekeate_pending_requests` como `Record<approvalId, PendingRequest>` con RMW serializada y purga; correlación persistida + puerto de larga vida con backoff; `chrome.alarms` y reconciliación al arrancar; dueño único del plazo en el SW con error EIP-1193 `4001` y cierre de ventana; `truekeate_logs` en `chrome.storage.local` escrito por el SW y excluido de `resetWallet`; nonce informativo con recálculo y cola FIFO por cuenta; retirada de `eth_sign`; previsualización ampliada (calldata, `verifyingContract`, avisos de riesgo, `personal_sign`); cardinalidad, tasa, desbordamiento y badge; semántica del polling; contrato observable de transacción y `eth_getTransactionReceipt`; `wallet_revokePermissions` en el enum; nomenclatura heredada invalidada; contrato EIP-6963 completo; guardas de la cadena de mensajes y `setAccessLevel`; normalización y caducidad de sesiones por origen; nota de reenvío de `TRUEKEATE_EVENT`; CORS de Anvil con allowlist; política de redacción de logs. |
| **1.4** | Sesión de auditoría de casos de uso | Cierre de **ACU-03, ACU-04, ACU-05, ACU-06, ACU-16, ACU-17, ACU-25 y ACU-27** (decisiones **D-A, D-B, D-D, D-E, D-F, D-G** y **P-19**): identidad EIP-6963 alineada con RT-13 (`name: "TrueKeate"`, `rdns: "academy.codecrypto.truekeate"`); campo `event` con enum cerrado de 23 eventos separado de `category` y regla de una entrada por evento (RNF-16); tabla de errores con un mensaje por causa y obligación de `code` en todo error mostrado; `accountLabels` en `truekeate_settings`; ciclo completo de `wallet_switchEthereumChain`; caducidad de sesión (24 h renovables) respaldada por RF-25 con su comportamiento al vencer; claves canónicas con prefijo completo (sin almacén `settings.*`); permiso de host en runtime siempre y por red en `wallet_addEthereumChain` (también desde el popup). Detalle en §6.3. |
