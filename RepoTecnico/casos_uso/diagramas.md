# Diagramas UML — TrueKeate Wallet

> **Fase:** 2 — Auditoría/especificación · **Versión:** 1.1 · **Estado:** ✅ propuesto para revisión
> **Producto:** **TrueKeate Wallet** (extensión Chrome/Edge Manifest V3) + dApp de pruebas (`test.html`) sobre Foundry Anvil.
> **Fuentes (leídas antes de redactar):** `RepoTecnico/casos_uso/casos_uso.md` v1.2 (36 CU — **fuente principal**), `RepoTecnico/requerimientos.md` v1.6 (§1 RF-01..RF-50, §2 RNF-01..RNF-25, §3 RT-01..RT-13 y RE-01..RE-04, §4 rúbrica y MVP, §9 `CA-RF-xx`/`CA-RT-xx`), `RepoTecnico/diccionario_datos.md` v1.5 (claves `truekeate_*`, entidades, protocolo `TRUEKEATE_*`, catálogo RPC y códigos EIP-1193), `RepoTecnico/entornos_globales.md` v1.7 (permisos, constantes, comandos, nomenclatura) y `RepoTecnico/casos_uso/AUDITORIA_CASOS_USO_V1.md` (auditoría ya remediada: **no se reintroduce ningún hallazgo ACU-01..ACU-30**).
>
> **Convenciones de este documento**
> 1. **Fidelidad al corpus.** Los 36 CU, los actores y sus nombres, los estados de `PendingRequest`, los mensajes del protocolo, las claves de almacenamiento y las constantes (120 s / 60 s, 5 s de polling, backoff 1/2/4/8/16 s máx. 30 s, `pendingRequestsMax = 8`, 4 llamadas RPC 1+3, TTL de sesión 24 h) se transcriben **literalmente** de las fuentes. **No se inventa** ningún CU, actor, estado, mensaje ni constante.
> 2. **Un diagrama por bloque**, cada uno precedido de su título descriptivo. Los bloques son Mermaid puro: ` ```mermaid ` … ` ``` `.
> 3. **Coherencia de numeración CU.** `casos_uso.md` v1.2 (documento auditado) es la **fuente de verdad de los identificadores**: Conexión de dApp = **CU-17**, `eth_accounts` con sesión = **CU-18**, aviso de origen sin sesión = **CU-20**, envío de transacción = **CU-11**/**CU-13**. Las referencias abreviadas del encargo que no coinciden con esa numeración se han alineado al corpus (por ejemplo, «conexión con selección de cuenta» → **CU-17**, no CU-14/CU-15; «`eth_accounts` con sesión vigente/vencida» → **CU-18/A2**, no CU-17/CU-18; «dos transacciones simultáneas» → **CU-16/A2**, no CU-16/A4; «rechazo del usuario» → **CU-14/A1**, no CU-13/A2).
> 4. **Notación de relaciones.** Línea simple `-->` = asociación actor ↔ CU. `-.->|include|` = el CU destino aparece **citado explícitamente** como paso invocado (*«el Usuario decide en CU-13»*, *«continúa en CU-14»*, *«se aplica X-03»*). `-.->|extend|` = el CU origen se declara como **flujo alternativo o de excepción** de la ficha destino (*«A1 — desde el paso 4 … CU-20»*). Si una ficha no cita ninguna relación, **no se dibuja**.

---

## 1. Diagrama de casos de uso

**Figura 1 — Actores, los 36 casos de uso y sus relaciones.** Los actores se dibujan con forma de actor/estadio, los CU con forma de estadio (elipse aplanada) agrupados por área funcional, y las dependencias `include`/`extend` con línea discontinua. Los flujos alternativos consolidados (`X-01`…`X-10`) y las reglas transversales (`RNF-xx`) no son CU y por eso **no** aparecen como nodos.

```mermaid
flowchart LR
    A_Usuario@{ shape: person, label: "Usuario — dueño de la cartera" }
    A_Dapp@{ shape: stadium, label: "dApp de terceros — test.html" }
    A_DappNoAut@{ shape: stadium, label: "dApp no autorizada — adversario" }
    A_DappHostil@{ shape: stadium, label: "dApp hostil — adversario" }
    A_SW@{ shape: stadium, label: "Service Worker — background" }
    A_Anvil@{ shape: stadium, label: "Nodo RPC local — Anvil" }
    A_Navegador@{ shape: stadium, label: "Navegador Chrome/Edge — plataforma" }
    A_Docente@{ shape: person, label: "Docente/evaluador — Perfil B" }

    subgraph G1 [Cartera y cuentas]
        direction TB
        CU01([CU-01 · Crear una cartera nueva con frase semilla BIP-39])
        CU02([CU-02 · Importar una cartera desde frase de recuperación])
        CU03([CU-03 · Importar una cuenta por clave privada])
        CU04([CU-04 · Derivar y añadir cuentas HD])
        CU05([CU-05 · Renombrar una cuenta])
        CU06([CU-06 · Eliminar una cuenta importada])
        CU07([CU-07 · Revelar/exportar el material de recuperación])
        CU08([CU-08 · Reabrir el popup y restaurar el estado persistido])
        CU09([CU-09 · Recibir fondos: dirección, copiar y QR])
        CU10([CU-10 · Consultar el saldo y su actualización cada 5 s])
        CU30([CU-30 · Resetear la cartera])
    end

    subgraph G2 [Conexión y permisos]
        direction TB
        CU17([CU-17 · Conectar una dApp y elegir la cuenta a compartir])
        CU18([CU-18 · Mantener la conexión por origen entre recargas y reinicios])
        CU19([CU-19 · Revocar el permiso de una dApp])
    end

    subgraph G3 [Firma y transacciones]
        direction TB
        CU11([CU-11 · Enviar ETH a una dirección externa])
        CU12([CU-12 · Transferir ETH entre cuentas propias])
        CU13([CU-13 · Aprobar una transacción con vista previa decodificada])
        CU14([CU-14 · Rechazar una solicitud pendiente])
        CU15([CU-15 · Vencer una solicitud por plazo 120 s o 60 s])
        CU16([CU-16 · Atender dos solicitudes simultáneas y serializar por cuenta])
        CU27([CU-27 · Firmar datos tipados EIP-712])
        CU28([CU-28 · Firmar un mensaje de texto plano con personal_sign])
    end

    subgraph G4 [Redes]
        direction TB
        CU24([CU-24 · Cambiar de red y propagar chainChanged])
        CU25([CU-25 · Dar de alta una red nueva])
        CU26([CU-26 · Cambiar la cuenta activa y propagar accountsChanged])
    end

    subgraph G5 [Ciclo de aprobación MV3]
        direction TB
        CU22([CU-22 · Manifestar el provider window.truekeate y alias más EIP-6963])
    end

    subgraph G6 [Observabilidad]
        direction TB
        CU29([CU-29 · Consultar el registro de actividad y su persistencia])
        CU34([CU-34 · Interpretar los estados de error con color y mensaje correctos])
    end

    subgraph G7 [Marca y entrega]
        direction TB
        CU32([CU-32 · Validar entradas de formulario con feedback inline])
        CU33([CU-33 · Ver la bienvenida y Acerca de con la tagline de marca])
        CU35([CU-35 · Recorrer las tres ventanas solo con teclado])
        CU36([CU-36 · Instalar desde dist y verificar el build limpio])
    end

    subgraph G8 [Adversarios]
        direction TB
        CU20([CU-20 · Rechazar a una dApp no autorizada])
        CU21([CU-21 · Resistir a una dApp hostil])
    end

    subgraph G9 [Conexión de punta a punta]
        direction TB
        CU23([CU-23 · Ejecutar la dApp de pruebas de extremo a extremo])
    end

    A_Usuario --> CU01
    A_Usuario --> CU02
    A_Usuario --> CU03
    A_Usuario --> CU04
    A_Usuario --> CU05
    A_Usuario --> CU06
    A_Usuario --> CU07
    A_Usuario --> CU08
    A_Usuario --> CU09
    A_Usuario --> CU10
    A_Usuario --> CU11
    A_Usuario --> CU12
    A_Usuario --> CU13
    A_Usuario --> CU14
    A_Usuario --> CU17
    A_Usuario --> CU19
    A_Usuario --> CU24
    A_Usuario --> CU26
    A_Usuario --> CU30
    A_Usuario --> CU32
    A_Usuario --> CU33
    A_Usuario --> CU34
    A_Usuario --> CU35

    A_Dapp --> CU17
    A_Dapp --> CU18
    A_Dapp --> CU22
    A_Dapp --> CU23
    A_Dapp --> CU25
    A_Dapp --> CU27
    A_Dapp --> CU28

    A_DappNoAut --> CU20
    A_DappHostil --> CU21

    A_SW --> CU15
    A_SW --> CU16
    A_SW --> CU29
    A_SW --> CU31([CU-31 · Operar con el nodo RPC local caído])

    A_Anvil --> CU10
    A_Anvil --> CU11
    A_Anvil --> CU12
    A_Anvil --> CU15
    A_Anvil --> CU16
    A_Anvil --> CU17
    A_Anvil --> CU23
    A_Anvil --> CU24
    A_Anvil --> CU25
    A_Anvil --> CU27
    A_Anvil --> CU31

    A_Navegador --> CU08
    A_Navegador --> CU13
    A_Navegador --> CU14
    A_Navegador --> CU15
    A_Navegador --> CU18
    A_Navegador --> CU19
    A_Navegador --> CU20
    A_Navegador --> CU21
    A_Navegador --> CU22
    A_Navegador --> CU26
    A_Navegador --> CU29
    A_Navegador --> CU35
    A_Navegador --> CU36

    A_Docente --> CU36
    A_Docente --> CU23

    CU11 -.->|include| CU13
    CU12 -.->|include| CU13
    CU24 -.->|include| CU13
    CU25 -.->|include| CU13
    CU27 -.->|include| CU13
    CU28 -.->|include| CU13
    CU11 -.->|include| CU15
    CU12 -.->|include| CU15
    CU13 -.->|include| CU15
    CU17 -.->|include| CU15
    CU25 -.->|include| CU15
    CU24 -.->|include| CU26
    CU25 -.->|include| CU24
    CU23 -.->|include| CU17
    CU23 -.->|include| CU11
    CU23 -.->|include| CU27
    CU23 -.->|include| CU24
    CU23 -.->|include| CU13
    CU01 -.->|include| CU35
    CU02 -.->|include| CU35
    CU03 -.->|include| CU35
    CU05 -.->|include| CU35
    CU06 -.->|include| CU35
    CU13 -.->|include| CU35
    CU14 -.->|include| CU35
    CU18 -.->|include| CU08
    CU13 -.->|include| CU08
    CU15 -.->|include| CU08
    CU16 -.->|include| CU08
    CU27 -.->|include| CU08
    CU18 -.->|include| CU17
    CU32 -.->|extend| CU02
    CU32 -.->|extend| CU03
    CU32 -.->|extend| CU05
    CU32 -.->|extend| CU11
    CU32 -.->|extend| CU12
    CU32 -.->|extend| CU25
    CU34 -.->|extend| CU31
    CU20 -.->|extend| CU18
    CU20 -.->|extend| CU21
    CU28 -.->|extend| CU21
    CU25 -.->|extend| CU21
    CU14 -.->|extend| CU17
    CU19 -.->|extend| CU26
```

---

## 2. Diagramas de secuencia de los flujos principales

### Figura 2 — Conexión de una dApp con selección de cuenta (CU-17)

`eth_requestAccounts` → `connect.html` → `CONNECT_RESPONSE` → persistencia de la sesión por origen. El `origin` lo **recalcula** el SW desde `sender` y se normaliza a minúsculas, sin barra final y con puerto (`http://localhost:5174`).

```mermaid
sequenceDiagram
    autonumber
    participant page as page — dApp test.html
    participant inject as inject — window.truekeate
    participant content as content — content script
    participant SW as SW — Service Worker
    participant storage as storage — chrome.storage.local
    participant Anvil as Anvil — 127.0.0.1:8545

    page->>inject: request eth_requestAccounts
    inject->>content: TRUEKEATE_REQUEST con method eth_requestAccounts
    content->>content: valida event.source === window y event.origin === location.origin
    content->>SW: TRUEKEATE_RPC con method origen declarado y tabId
    SW->>SW: recalcula origin desde sender y lo normaliza a minusculas sin barra final
    SW->>storage: set truekeate_connect_request con requestId status pending
    Note over SW,storage: expiresAt = createdAt + CONNECT_TIMEOUT_MS con CONNECT_TIMEOUT_MS = 60000
    SW->>storage: chrome.alarms.create truekeate_expire requestId
    SW->>Anvil: eth_getBalance por cuenta visible
    Anvil-->>SW: saldos de las cuentas
    SW->>page: chrome.windows.create connect.html 420 x 650
    SW->>page: lista de cuentas con saldo y cuenta preseleccionada
    page->>SW: CONNECT_RESPONSE con requestId success true account y accountIndex
    SW->>SW: valida sender.id y sender.url en allowlist de connect.html
    SW->>storage: set truekeate_connected_sites con account chainId connectedAt lastUsedAt expiresAt
    Note over storage: expiresAt = lastUsedAt + truekeate_settings.sessionTtlMs igual a 86400000
    SW->>storage: purga truekeate_connect_request y recalcula el badge
    SW->>page: cierra la ventana connect.html
    SW-->>content: TRUEKEATE_RESPONSE con el resultado de eth_requestAccounts
    content-->>inject: TRUEKEATE_RESPONSE
    inject-->>page: promesa resuelta con la direccion elegida
    SW->>content: TRUEKEATE_EVENT eventName connect
    content->>page: window.postMessage TRUEKEATE_EVENT con targetOrigin location.origin
```

### Figura 3 — `eth_accounts` con sesión vigente y con sesión vencida (CU-18 y CU-18/A2, deslinde con CU-20)

Sin abrir ninguna ventana en ninguno de los dos caminos: la sesión vigente resuelve con la cuenta compartida y refresca `lastUsedAt`; la vencida se elimina y resuelve `[]`, obligando a pasar otra vez por CU-17. Un origen que **nunca** se conectó es el escenario de CU-20.

```mermaid
sequenceDiagram
    autonumber
    participant page as page — dApp test.html
    participant content as content — content script
    participant SW as SW — Service Worker
    participant storage as storage — chrome.storage.local

    page->>content: eth_accounts
    content->>SW: TRUEKEATE_RPC con method eth_accounts
    SW->>SW: recalcula y normaliza el origin desde sender
    SW->>storage: get truekeate_connected_sites

    alt Sesion vigente con expiresAt mayor que now
        SW->>storage: refresca lastUsedAt y recalcula expiresAt
        Note over storage: expiresAt = lastUsedAt + 86400000
        SW-->>content: TRUEKEATE_RESPONSE con la cuenta compartida
        content-->>page: resuelve con la direccion autorizada
        Note over SW,page: no se abre ninguna ventana y no se emite 4001
    else Sesion vencida con expiresAt menor o igual que now
        SW->>storage: elimina la entrada de truekeate_connected_sites
        SW-->>content: TRUEKEATE_RESPONSE con lista vacia
        content-->>page: resuelve con lista vacia
        Note over page,SW: la dApp debe volver a eth_requestAccounts y continua en CU-17
    else Origen nunca conectado
        SW-->>content: TRUEKEATE_RESPONSE con lista vacia sin abrir ventana
        content-->>page: resuelve con lista vacia
        Note over page,SW: escenario de CU-20 y la dApp no autorizada recibe 4100 en metodos sensibles
    end
```

### Figura 4 — Envío de transacción de punta a punta (CU-11 con CU-13 y CU-16)

Solicitud → `PendingRequest` persistido → puerto de larga vida → `notification.html` → aprobación → firma en el SW → `eth_sendTransaction` → hash devuelto. El nonce se recalcula con `getTransactionCount(account, 'pending')` y la transacción es EIP-1559 tipo 2 con el `chainId` activo (EIP-155).

```mermaid
sequenceDiagram
    autonumber
    participant page as page — dApp test.html
    participant content as content — content script
    participant SW as SW — Service Worker
    participant storage as storage — chrome.storage.local
    participant notif as notif — notification.html
    participant Anvil as Anvil — 127.0.0.1:8545

    page->>content: eth_sendTransaction con from to y value
    content->>SW: TRUEKEATE_RPC con method eth_sendTransaction
    SW->>SW: construye TxPreview con destino valor gasLimit y maxFeePerGas
    SW->>Anvil: eth_estimateGas y eth_getBalance y eth_getTransactionCount
    Anvil-->>SW: gas y saldo y nonce informativo
    SW->>SW: genera approvalId uuid v4 y persiste con status pending bajo rmwLock
    SW->>storage: set truekeate_pending_requests approvalId status pending
    Note over storage: expiresAt = createdAt + SIGN_TIMEOUT_MS con SIGN_TIMEOUT_MS = 120000
    content->>SW: connect name truekeate_approval
    Note over content,SW: tras 30 s sin actividad, RESUME con el mismo approvalId responde en < 200 ms (el puerto NO mantiene vivo el SW)
    SW->>SW: encola la firma en fifoByAccount y abre la ventana unica global de confirmacion (cola y contador, P-21)
    SW->>notif: chrome.windows.create focused true y type popup 420 x 640
    SW->>Anvil: eth_getBalance de la cuenta visible
    notif->>SW: SIGN_RESPONSE con approvalId success true
    SW->>SW: valida que la entrada sigue pending y no vencida
    SW->>Anvil: eth_getTransactionCount account pending y eth_gasPrice y eth_getFeeData
    Anvil-->>SW: nonce definitivo y feeData
    SW->>SW: firma EIP-1559 tipo 2 con chainId activo 0x7a69
    SW->>Anvil: eth_sendRawTransaction con la transaccion firmada
    Anvil-->>SW: hash 0x mas 64 hex
    SW->>storage: purga la entrada de truekeate_pending_requests y recalcula el badge
    SW->>notif: cierra notification.html
    SW->>storage: append truekeate_logs event tx_sent con txStatus pending
    SW-->>content: TRUEKEATE_RESPONSE con el hash
    content-->>page: eth_sendTransaction resuelve el hash
    SW->>Anvil: eth_getTransactionReceipt hash
    Anvil-->>SW: recibo con status 0x1
    SW->>storage: append truekeate_logs event tx_confirmed con el mismo hash
```

### Figura 5 — Expiración del plazo (CU-15, con CU-15/E2)

`chrome.alarms` despierta al SW aunque esté dormido, marca la entrada `expired` con `resolvedAt` y `errorCode: 4001`, cierra `notification.html`, purga el badge y entrega `4001` a la página por puerto vivo o por `chrome.tabs.sendMessage`. El reloj está **anclado a `createdAt`** y el SW es su dueño único; la capa inject solo tiene un margen de seguridad de `SIGN_TIMEOUT_MS + 5000`.

```mermaid
sequenceDiagram
    autonumber
    participant content as content — content script
    participant SW as SW — Service Worker
    participant alarms as alarms — chrome.alarms
    participant storage as storage — chrome.storage.local

    SW->>alarms: chrome.alarms.create truekeate_expire approvalId con when expiresAt
    Note over alarms: expiresAt = createdAt + 120000 para firmas y createdAt + 60000 para conexion
    Note over SW: el reloj avanza sin que el Usuario decida y el SW puede dormirse
    alarms->>SW: despierta al SW en expiresAt
    SW->>storage: set status expired con resolvedAt y errorCode 4001
    Note over storage: el vencimiento queda persistido y no solo en memoria
    SW->>SW: re-descubre la ventana con chrome.windows.getAll populate true
    SW->>SW: chrome.windows.remove windowId de notification.html
    Note over SW: si la ventana ya no existe marca expired sin dejar ventana huerfana
    SW->>storage: purga el badge con chrome.action.setBadgeText
    SW->>content: TRUEKEATE_RESPONSE con code 4001 y mensaje de vencimiento
    Note over SW,content: si el puerto esta cerrado pero la pestana vive usa chrome.tabs.sendMessage con tabId y frameId
    Note over SW,content: si la pestana ya no existe se descarta la entrega y queda traza en truekeate_logs
    content->>content: rechaza la promesa de la pagina con code 4001
    SW->>storage: append truekeate_logs event approval_expired
```

### Figura 6 — Service Worker dormido y reconexión (X-03, CU-16/E3 y CU-08)

Caída del puerto `truekeate_approval` → reconexión con backoff **1 s, 2 s, 4 s, 8 s, 16 s, máx. 30 s** → `RESUME` con el **mismo `approvalId`** → el SW contesta desde la entrada persistida (o `4001` si ya no está `pending`) sin crear entradas nuevas.

```mermaid
sequenceDiagram
    autonumber
    participant content as content — content script
    participant SW as SW — Service Worker
    participant storage as storage — chrome.storage.local
    participant alarms as alarms — chrome.alarms

    content->>SW: connect name truekeate_approval
    Note over SW: el SW se duerme y el puerto se cierra
    SW--xcontent: cierre del puerto
    content->>content: espera 1 s y reintenta
    content->>SW: connect name truekeate_approval
    content->>content: espera 2 s y reintenta
    content->>SW: connect name truekeate_approval
    content->>content: espera 4 s y reintenta
    content->>SW: connect name truekeate_approval
    content->>content: espera 8 s y reintenta
    content->>SW: connect name truekeate_approval
    content->>content: espera 16 s y reintenta
    Note over content: la espera nunca supera 30 s entre intentos
    content->>SW: RESUME con approvalId
    SW->>storage: get truekeate_pending_requests y reconstruye el estado
    SW->>storage: re-arma chrome.alarms desde el expiresAt persistido de cada pending
    alt La entrada sigue pending
        storage-->>SW: entrada persistida con el mismo approvalId
        SW-->>content: respuesta desde la entrada persistida en menos de 200 ms
        Note over storage: no se crea ninguna entrada nueva en truekeate_pending_requests
    else La entrada ya no esta pending
        SW-->>content: code 4001 con el mensaje de la tabla de errores
        Note over SW,content: no se reabre ninguna ventana notification.html
    end
    SW->>storage: append truekeate_logs event sw_started y sw_reconcile
```

### Figura 7 — Dos transacciones simultáneas de la misma cuenta (CU-16 y CU-16/A2)

Cola **FIFO por cuenta** (`fifoByAccount`) con **como máximo una transacción en vuelo por `from`** y recálculo del `nonce` al aprobar cada una con `getTransactionCount(account, 'pending')`. La segunda solicitud espera; **no** se rechaza (el rechazo por cardinalidad es para el mismo origen: máximo 1 `pending` por origen, 8 globales, 6 por minuto y origen).

```mermaid
sequenceDiagram
    autonumber
    participant page as page — dApp test.html
    participant content as content — content script
    participant SW as SW — Service Worker
    participant storage as storage — chrome.storage.local
    participant notif as notif — notification.html
    participant Anvil as Anvil — 127.0.0.1:8545

    page->>content: eth_sendTransaction numero 1
    content->>SW: TRUEKEATE_RPC con method eth_sendTransaction
    SW->>storage: persiste la entrada 1 con status pending y approvalId propio
    SW->>notif: abre notification.html de la entrada 1
    page->>content: eth_sendTransaction numero 2 desde la misma cuenta
    content->>SW: TRUEKEATE_RPC con method eth_sendTransaction
    SW->>storage: persiste la entrada 2 como entrada independiente con approvalId distinto
    Note over storage: puede haber dos entradas pending y una sola transaccion en vuelo por cuenta
    SW->>SW: encola la firma 2 en fifoByAccount porque la cuenta ya tiene una en vuelo
    SW->>Anvil: eth_getTransactionCount account pending
    Anvil-->>SW: nonce base de la cuenta
    SW->>notif: aprueba la entrada 1 y difunde una sola transaccion
    SW->>Anvil: eth_sendRawTransaction de la transaccion 1
    Anvil-->>SW: hash de la transaccion 1
    SW->>storage: elimina solo la entrada 1 y recalcula el badge
    Note over storage: resolver la primera no elimina ni altera la segunda
    SW->>SW: saca la firma 2 de fifoByAccount
    SW->>Anvil: eth_getTransactionCount account pending
    Anvil-->>SW: nonce recalculado
    SW->>Anvil: eth_sendRawTransaction de la transaccion 2
    Anvil-->>SW: hash de la transaccion 2
    SW->>storage: elimina la entrada 2 y la cola queda vacia
```

### Figura 8 — Rechazo del usuario, firma EIP-712 y `personal_sign` (CU-14/A1, CU-27 y CU-28)

Tres caminos de la ventana de decisión: rechazo explícito (`4001`), firma de datos tipados con vista de `domain`, `types` y `message`, y firma de texto plano con aviso de «contenido no legible» si el payload hexadecimal no es UTF-8.

```mermaid
sequenceDiagram
    autonumber
    participant page as page — dApp test.html
    participant SW as SW — Service Worker
    participant storage as storage — chrome.storage.local
    participant notif as notif — notification.html

    Note over page,notif: Camino 1 — rechazo segun CU-14 también con Esc o con la X
    page->>SW: eth_sendTransaction o personal_sign o eth_signTypedData_v4
    SW->>storage: entrada pending en truekeate_pending_requests
    SW->>notif: abre notification.html
    notif->>SW: SIGN_RESPONSE con success false
    SW->>storage: status rejected con resolvedAt y errorCode 4001
    SW->>storage: purga la entrada de la cola persistida y recalcula el badge
    SW->>notif: cierra la ventana
    SW->>storage: append truekeate_logs event approval_resolved con code 4001
    SW-->>page: code 4001 y mensaje Operacion cancelada por el Usuario

    Note over page,notif: Camino 2 — firma EIP-712 de CU-27
    page->>SW: eth_signTypedData_v4 con domain types primaryType y message
    SW->>SW: valida la estructura y elimina EIP712Domain de types
    SW->>SW: calcula primaryType y construye TypedDataPreview
    SW->>SW: compara domain.chainId con el chainId activo y verifyingContract con el declarado
    SW->>notif: muestra domain name y verifyingContract en claro mas types y message
    Note over notif: si hay domainChainMismatch o verifyingContractMismatch se muestra un aviso destacado en espanol
    notif->>SW: SIGN_RESPONSE con success true
    SW->>SW: firma con signer.signTypedData y cierra la ventana
    SW->>storage: append truekeate_logs event sign_typed_data con primaryType domain.name domain.chainId domain.verifyingContract y el hash
    SW-->>page: firma 0x mas 130 hex verificable por EIP712Verifier.verify

    Note over page,notif: Camino 3 — personal_sign de CU-28
    page->>SW: personal_sign con mensaje y cuenta
    SW->>SW: comprueba que la cuenta esta autorizada para ese origen y decodifica el payload como UTF-8
    SW->>notif: muestra el texto legible completo o el aviso contenido no legible con el numero de bytes
    notif->>SW: SIGN_RESPONSE con success true
    SW->>SW: firma con signer.signMessage y cierra la ventana
    SW->>storage: append truekeate_logs event sign_personal con la direccion y sha256 del mensaje
    SW-->>page: firma con prefijo Ethereum Signed Message
```

### Figura 9 — dApp hostil (CU-21, con CU-20 y CU-25)

`eth_sign` responde `4200` **sin abrir ventana**, la red con RPC no `https` fuera de local se rechaza con error tipado y sin pedir permiso de host, el `postMessage` saliente usa `targetOrigin = location.origin` (nunca `'*'`) y `setAccessLevel('TRUSTED_CONTEXTS')` impide que un content script —o un iframe hostil— lea `chrome.storage.local`.

```mermaid
sequenceDiagram
    autonumber
    participant hostil as page — dApp hostil
    participant content as content — content script
    participant inject as inject — inject.js
    participant SW as SW — Service Worker
    participant storage as storage — chrome.storage.local

    hostil->>content: eth_sign con un digest arbitrario
    content->>SW: TRUEKEATE_RPC con method eth_sign
    SW->>SW: method fuera del catalogo RPC
    SW-->>content: code 4200 El metodo solicitado no esta soportado
    Note over SW,hostil: no se abre ninguna ventana de confirmacion y se registra event rpc_error
    content-->>hostil: promesa rechazada con code 4200

    hostil->>content: wallet_addEthereumChain con rpcUrl http en 203.0.113.10
    content->>SW: TRUEKEATE_RPC con method wallet_addEthereumChain
    SW->>SW: valida esquema y host y rechaza por no ser https fuera de local
    SW-->>content: error tipado sin solicitar permiso de host
    Note over SW,storage: no se crea entrada pending y no se escribe en truekeate_networks

    hostil->>content: wallet_addEthereumChain con rpcUrl https legitima
    content->>SW: TRUEKEATE_RPC con method wallet_addEthereumChain
    SW->>storage: crea la entrada pending de CU-25
    Note over SW,hostil: exige aprobacion explicita y solo tras aprobar llama a chrome.permissions.request

    hostil->>content: iframe de origen distinto que intenta leer el storage
    content->>content: setAccessLevel con TRUSTED_CONTEXTS impide el acceso
    Note over content,storage: ningun content script puede leer truekeate_mnemonic ni las claves privadas

    SW->>content: TRUEKEATE_EVENT con eventName chainChanged
    content->>inject: reenvia el mismo evento sin transformar
    inject->>hostil: window.postMessage con targetOrigin location.origin
    Note over inject,hostil: nunca targetOrigin asterisco y validacion de event.source y event.origin entrantes
```

### Figura 10 — Origen sin sesión: `eth_accounts` vacío y `4100` en métodos sensibles (CU-20)

Complementa la Figura 3 con el lado negativo del mismo camino: un origen que nunca pasó por `eth_requestAccounts` recibe `[]` sin abrir ventana y `4100` en cualquier método sensible, sin crear ninguna entrada en la cola.

```mermaid
sequenceDiagram
    autonumber
    participant noaut as page — dApp no autorizada
    participant content as content — content script
    participant SW as SW — Service Worker
    participant storage as storage — chrome.storage.local

    noaut->>content: eth_accounts
    content->>content: valida event.source === window y event.origin === location.origin
    content->>SW: TRUEKEATE_RPC con method eth_accounts
    SW->>SW: recalcula el origin desde sender y no encuentra sesion
    SW-->>content: TRUEKEATE_RESPONSE con lista vacia
    content-->>noaut: eth_accounts resuelve lista vacia sin abrir ventana
    noaut->>content: eth_sendTransaction sin autorizacion
    content->>SW: TRUEKEATE_RPC con method eth_sendTransaction
    SW-->>content: code 4100 Esta dApp no tiene permiso para usar la cartera
    SW->>storage: append truekeate_logs event rpc_error level error
    Note over storage: truekeate_pending_requests permanece vacio
    content-->>noaut: promesa rechazada con code 4100
```

---

## 3. Diagrama de estados del ciclo de aprobación (`PendingRequest`)

**Figura 11 — Ciclo de vida de una entrada de `truekeate_pending_requests`.** Los cuatro estados son los del campo `status` del diccionario: `pending`, `approved`, `rejected` y `expired`. «Solo `pending` bloquea la cola» y solo `pending` cuenta para el badge, que es un índice derivado y no se persiste. Las entradas resueltas se **purgan**: el SW no conserva historial de solicitudes resueltas.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> pending : alta de la solicitud por el SW
    state "pending · approvalId generado y expiresAt anclado a createdAt" as pending
    state "approved · firma o difusion aplicada" as approved
    state "rejected · decision negativa del Usuario" as rejected
    state "expired · plazo agotado" as expired
    state "purga · entrada eliminada de la cola persistida" as purga
    state "sin destinatario · pestana cerrada o windowId perdido" as huerfana

    pending --> pending : RESUME con el mismo approvalId tras reconectar el puerto
    Note right of pending
        createdAt ancla el plazo
        expiresAt = createdAt + SIGN_TIMEOUT_MS con 120000
        o createdAt + CONNECT_TIMEOUT_MS con 60000
        puerto truekeate_approval con name truekeate_approval
        fifoByAccount con maximo una transaccion en vuelo por cuenta
        cardinalidad 8 globales y 1 por origen y 6 por minuto y origen
    end note

    pending --> approved : SIGN_RESPONSE con success true o CONNECT_RESPONSE con success true
    pending --> rejected : SIGN_RESPONSE con success false o Esc o cierre con la X con code 4001
    pending --> expired : chrome.alarms dispara truekeate_expire con approvalId
    pending --> huerfana : caida del puerto y el SW se duerme
    huerfana --> pending : reconciliacion al arrancar el SW reasociando por approvalId
    huerfana --> rejected : chrome.tabs.onRemoved con la pestana cerrada
    huerfana --> expired : la pestana se cierra cuando el plazo ya vencio
    huerfana --> expired : windowId no re-descubierto con chrome.windows.getAll populate true
    approved --> purga : purga de la entrada y recalculo del badge
    rejected --> purga : purga de la entrada y recalculo del badge
    expired --> purga : purga de la entrada y recalculo del badge
    purga --> [*]

    note left of approved
        errorCode no aplica
        resolvedAt anotado
        truekeate_logs event approval_resolved
        la ventana notification.html se cierra
    end note
    note left of rejected
        errorCode 4001 con resolvedAt
        purga de truekeate_pending_requests y de su indice de badge
        truekeate_logs event approval_resolved
    end note
    note right of expired
        errorCode 4001 con resolvedAt
        se cierra notification.html por windowId
        la pagina recibe el objeto EIP-1193 de 4001
        truekeate_logs event approval_expired
        al expirar prevalece expired sobre el cierre de ventana
    end note
```

---

## 4. Diagrama de arquitectura de componentes (contexto)

**Figura 12 — Los cuatro contextos, el almacenamiento y los canales de mensajería.** Se distinguen los dos canales (`window.postMessage` página ↔ content script y `chrome.runtime` content o UI ↔ SW), el puerto de larga vida `truekeate_approval`, que **no mantiene vivo** el SW (se suspende a los ~30 s): transporta y correlaciona, y la verdad vive en `chrome.storage.local` y `chrome.alarms` y `chrome.storage.local` como única fuente de verdad, con `setAccessLevel('TRUSTED_CONTEXTS')`.

```mermaid
flowchart LR
    subgraph C1 [Contexto pagina y dApp]
        direction TB
        PAGINA[dApp de terceros test.html en http://localhost:5174]
        INJECT[inject.js en document_start y all_frames]
        PROVIDER[window.truekeate con alias window.codecrypto]
        EIP6963[eip6963 requestProvider y announceProvider]
        PAGINA --> PROVIDER
        INJECT --> PROVIDER
        INJECT --> EIP6963
        PAGINA --> EIP6963
    end

    subgraph C2 [Contexto content script]
        direction TB
        CONTENT[content script con validacion de source y origin]
    end

    subgraph C3 [Contexto Service Worker]
        direction TB
        SW[Service Worker background]
        CRYPTO[crypto mnemonic y claves privadas]
        APPROVALS[approvals cola pending rmwLock y fifoByAccount]
        RPC[rpc ethers solo en background]
        LOGS[logger redaccion de payloads]
        SW --> CRYPTO
        SW --> APPROVALS
        SW --> RPC
        SW --> LOGS
    end

    subgraph C4 [Contexto popup y ventanas de la extension]
        direction TB
        POPUP[popup 380 x 600]
        CONNECT[connect.html 420 x 650]
        NOTIF[notification.html 420 x 640]
    end

    subgraph C5 [Almacenamiento]
        direction TB
        STORAGE[(chrome.storage.local con claves truekeate)]
    end

    ANVIL[Nodo RPC local Anvil en 127.0.0.1:8545]
    ALARMS[chrome.alarms con truekeate_expire approvalId]

    PAGINA <-->|canal 1 · window.postMessage con targetOrigin location.origin · TRUEKEATE_REQUEST y TRUEKEATE_RESPONSE| CONTENT
    CONTENT -->|TRUEKEATE_EVENT sin transformar| INJECT
    CONTENT -->|TRUEKEATE_ANNOUNCE con el info de EIP-6963| EIP6963
    CONTENT <-->|canal 2 · chrome.runtime sendMessage · TRUEKEATE_RPC| SW
    POPUP <-->|chrome.runtime sendMessage · TRUEKEATE_RPC| SW
    CONNECT -->|CONNECT_RESPONSE con sender.url en allowlist| SW
    NOTIF -->|SIGN_RESPONSE con sender.url en allowlist| SW
    CONTENT <-->|puerto de larga vida truekeate_approval · name truekeate_approval y RESUME| SW
    POPUP <-->|puerto de larga vida truekeate_approval| SW
    SW -->|chrome.windows.create focused true y type popup| CONNECT
    SW -->|chrome.windows.create focused true y type popup| NOTIF
    SW <-->|una sola fuente de verdad con escritura serializada rmwLock| STORAGE
    POPUP -->|solo lectura de la cola persistida| STORAGE
    CONNECT -->|solo lectura de cuentas y saldos| STORAGE
    NOTIF -->|solo lectura de la entrada y de su vista previa| STORAGE
    SW <-->|eth_call y eth_sendRawTransaction y recibos| ANVIL
    SW <-->|crea y re-arma el vencimiento al arrancar| ALARMS
    ALARMS -->|despierta al SW en expiresAt| SW
    CONNECT -->|eth_getBalance por cuenta visible| ANVIL
```

---

## 5. Índice de diagramas y trazabilidad

| # | Diagrama | Tipo Mermaid | CU que ilustra | RF / RNF / RT / RE |
|---|---|---|---|---|
| Figura 1 | Actores, casos de uso y relaciones | `flowchart` | CU-01 … CU-36 (los 36) | RF-01 … RF-50 · RNF-01 · RT-13 |
| Figura 2 | Conexión de una dApp con selección de cuenta | `sequenceDiagram` | CU-17 (con CU-15 y CU-16) | RF-16, RF-36, RF-17, RF-40 · RNF-05, RNF-08, RNF-10 · RT-13 |
| Figura 3 | `eth_accounts` con sesión vigente y vencida | `sequenceDiagram` | CU-18, CU-18/A2, CU-20 (deslinde) | RF-25, RF-17, RF-10 · RNF-08, RNF-11 · RE-04 |
| Figura 4 | Envío de transacción de punta a punta | `sequenceDiagram` | CU-11, CU-13, CU-16 | RF-08, RF-19, RF-35, RF-41, RF-42, RF-43 · RNF-05, RNF-12, RNF-25 |
| Figura 5 | Expiración del plazo de 120 s y de 60 s | `sequenceDiagram` | CU-15, CU-15/E2 | RF-40 · RNF-06, RNF-08 · RT-06 |
| Figura 6 | Service Worker dormido y reconexión con `RESUME` | `sequenceDiagram` | CU-16/E3, CU-08, CU-15/A2 | RF-41, RF-40, RF-09, RF-10, RF-17 · RNF-08 · RE-04 |
| Figura 7 | Dos transacciones simultáneas de la misma cuenta | `sequenceDiagram` | CU-16, CU-16/A2 | RF-37, RF-38, RF-39 · RNF-08 |
| Figura 8 | Rechazo del usuario, firma EIP-712 y `personal_sign` | `sequenceDiagram` | CU-14, CU-27, CU-28 | RF-35, RF-41, RF-14, RF-20, RF-21 · RNF-06, RNF-09, RNF-12, RNF-25 · RT-02, RT-11 |
| Figura 9 | dApp hostil: `eth_sign`, RPC no `https` y `targetOrigin` | `sequenceDiagram` | CU-21, CU-25, CU-20 | RF-14, RF-23 · RNF-09, RNF-10, RNF-12 · RT-03, RT-04, RT-13 |
| Figura 10 | Origen sin sesión: `[]` y `4100` | `sequenceDiagram` | CU-20, CU-20/E2 y CU-20/E3 | RF-17, RF-14 · RNF-10, RNF-11 · RT-13 |
| Figura 11 | Ciclo de vida del `PendingRequest` | `stateDiagram-v2` | CU-13, CU-14, CU-15, CU-16, CU-17 | RF-35, RF-37, RF-40, RF-41 · RNF-06, RNF-08 |
| Figura 12 | Arquitectura de componentes y contextos | `flowchart` | CU-08, CU-11, CU-13, CU-17, CU-18, CU-19, CU-22, CU-29, CU-31 | RF-13, RF-17, RF-25, RF-28, RF-44, RF-45 · RNF-10, RNF-11, RNF-14, RNF-16, RNF-20 · RT-04, RT-13 |

**Totales:** **12 diagramas** · 8 `sequenceDiagram` · 2 `flowchart` · 1 `stateDiagram-v2` · (la Figura 1 es el `flowchart` de casos de uso y la Figura 12 el de arquitectura).

**Mensajes del protocolo representados** (nombres literales del diccionario §4.1 y §4.2): `TRUEKEATE_REQUEST`, `TRUEKEATE_RESPONSE`, `TRUEKEATE_EVENT` y `TRUEKEATE_ANNOUNCE` (Figura 12, como contrato EIP-6963), `TRUEKEATE_RPC`, `SIGN_RESPONSE`, `CONNECT_RESPONSE` y `RESUME`.

**Códigos EIP-1193 dibujados:** `4001` (CU-13/A1, CU-14, CU-15 y CU-16), `4100` (CU-20) y `4200` (CU-21 y CU-28/A2). **Citados en el corpus y fuera de estas figuras:** `4900` (CU-31), `4901` (CU-24/A3), `-32602` (CU-32), `-32000` (CU-11/E1 y CU-11/E2) y `-32603` (CU-16/E4 y CU-30/E1), sin flujo propio en los diagramas críticos seleccionados.

---

## 6. Cómo renderizar estos diagramas

**Visores compatibles**

- **GitLab y GitHub** renderizan Mermaid de forma nativa en los archivos `.md` del repositorio: basta con abrir `RepoTecnico/casos_uso/diagramas.md` en la interfaz web.
- **VS Code** con la extensión de Mermaid (por ejemplo *Markdown Preview Mermaid Support*) o con la vista previa de Markdown integrada, si la extensión está instalada.
- **`mermaid.live`** (Mermaid Live Editor): pegar el contenido de **un solo bloque** (sin las vallas ```` ```mermaid ````) para inspeccionarlo o compartir un enlace.

**Exportación a SVG o PNG (comando opcional, no ejecutado por este documento)**

El corpus **prohíbe instalar paquetes** para generar esta documentación, así que el comando se deja escrito **sin ejecutarlo**; requiere disponer de `@mermaid-js/mermaid-cli` de forma previa y explícita:

```bash
# Requiere @mermaid-js/mermaid-cli ya instalado; NO se ejecuta desde este documento.
npx -p @mermaid-js/mermaid-cli mmdc -i RepoTecnico/casos_uso/diagramas.md -o docs/diagramas/ -e svg
```

> Extraer cada bloque a un archivo `.mmd` independiente antes de exportarlo da un SVG por figura y evita que el CLI tenga que separar los 12 bloques del mismo documento.

**Advertencias de sintaxis respetadas en este documento**

1. Cada bloque empieza con ```` ```mermaid ```` y cierra con ```` ``` ````; **un diagrama por bloque**.
2. En los `sequenceDiagram` **todos** los participantes se declaran con `participant` antes de usarse, y se usan alias cortos y sin espacios (`page`, `inject`, `content`, `SW`, `storage`, `alarms`, `notif`, `Anvil`).
3. En los `flowchart` los identificadores son simples (`CU01`, `A_Usuario`, `G1`) y las etiquetas con texto van entre corchetes, estadio o `person`; **no se usa `end` como etiqueta** y se evitan `()`, `:`, `/` y `«»` dentro de las etiquetas de nodo y de arista.
4. En el `stateDiagram-v2` los estados con espacios se declaran con `state "Nombre" as id`.
5. El diagrama de casos de uso usa `flowchart LR` con figuras básicas (`person`, `stadium`, `([...])`, `[...]`, `[(...)]`) para maximizar la compatibilidad entre versiones de Mermaid.

---

## Historial de cambios

| Versión | Fecha | Cambio |
|---|---|---|
ANCHOR_DIAGRAMAS con los 12 diagramas exigidos: casos de uso (36 CU y 8 actores), 8 secuencias de flujos críticos, estados del ciclo de aprobación, arquitectura de componentes, índice de trazabilidad e instrucciones de renderizado. Sin modificar ningún otro archivo y sin instalar paquetes. |
