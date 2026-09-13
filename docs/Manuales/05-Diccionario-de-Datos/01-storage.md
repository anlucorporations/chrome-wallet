# 01 — Diccionario de almacenamiento (chrome.storage.local)

Esta parte del manual cuenta, en lenguaje corriente, **todo lo que TrueKeate Wallet guarda** dentro del navegador y **con qué nombre lo guarda**. No habla de botones: habla de la trastienda.

Cuatro ideas antes de empezar:

- **Almacén del navegador.** Chrome y Edge prestan a cada extensión un cajón privado para datos que no se pierden al cerrar el navegador. Su nombre técnico es `chrome.storage.local`.
- **Clave.** Cada dato guardado tiene un nombre fijo. Todos los nombres de esta cartera empiezan por `truekeate_`.
- **Service Worker (SW).** Es el «motor» de la extensión: se despierta cuando hace falta y se duerme cuando no. Al dormirse pierde la memoria, así que todo lo importante se guarda en el cajón.
- **Migración.** Es el trabajo de «traducir» los datos de una versión antigua a la nueva sin perder nada.

> Aviso de honestidad: solo se afirma lo comprobado en el repositorio. Lo no verificado aparece como «pendiente de confirmar».

## Visión general

### Un único almacén persistente

Todo vive en un solo cajón: `chrome.storage.local`. El módulo `src/background/state/schema.ts` es la **fuente única** de los nombres: ningún otro fichero escribe una clave `truekeate_` a mano. Ese módulo prohíbe cuatro cosas: nombres cortos inventados del tipo `settings.*`; el prefijo antiguo `codecrypto_`; `chrome.storage.sync` (copiaría la frase y las claves privadas a los servidores de la cuenta del navegador); y `localStorage`, que no existe dentro de un Service Worker.

Solo tres funciones tocan el cajón: `readStorage` (leer), `writeStorage` (escribir) y `removeStorage` (borrar). Ninguna revienta el programa: una lectura que falla devuelve una foto vacía, y una escritura que falla lo intenta una vez más antes de devolver «no» (`false`).

### Aislamiento con `setAccessLevel('TRUSTED_CONTEXTS')`

Lo primero que hace el motor al despertarse es pedir al navegador que **solo las páginas de la propia extensión** puedan leer el cajón. Con el ajuste por defecto, un script inyectado en una web podría leer la frase de recuperación y las claves privadas; con `TRUSTED_CONTEXTS` («solo contextos de confianza») los scripts de las webs quedan fuera, y siguen dentro el motor y las tres páginas propias (popup, conexión y decisión). La orden es idempotente y **no rompe** el arranque: si falla, avisa con un «no» y la extensión sigue.

### Versión de esquema REAL

La versión del formato de los datos es la **1.4**. La constante `SCHEMA_VERSION = '1.4'` está declarada en el código, pero **no** se guarda en una clave propia: se escribe **dentro** de `truekeate_settings`, en el campo `schemaVersion`. Existe además una constante documental, `truekeate_schema_version`, que **no** forma parte del catálogo y que ningún módulo del producto escribe. La migración admite tres versiones de partida: `1.2`, `1.3` y `1.4`; un almacén sin versión declarada se considera 1.2.

### Tabla índice de las claves canónicas

Son **14 claves oficiales**. Estas son, en una frase cada una:

| N.º | Clave guardada | Qué guarda | ¿Se borra al resetear? |
|---|---|---|---|
| 1 | `truekeate_mnemonic` | La frase de recuperación de 12 palabras | Sí |
| 2 | `truekeate_accounts` | Las direcciones de las cuentas derivadas | Sí |
| 3 | `truekeate_imported_accounts` | Las cuentas importadas con su clave privada | Sí |
| 4 | `truekeate_current_account` | Cuál es la cuenta activa | Sí |
| 5 | `truekeate_chain_id` | La red activa | Sí |
| 6 | `truekeate_networks` | El catálogo de redes dadas de alta | Sí |
| 7 | `truekeate_connected_sites` | Las sesiones abiertas con páginas web | Sí |
| 8 | `truekeate_pending_requests` | La cola de solicitudes pendientes de tu decisión | Sí |
| 9 | `truekeate_connect_request` | Las peticiones de conexión de una web | Sí |
| 10 | `truekeate_approval_window` | El estado de la ventana única de confirmación | Sí |
| 11 | `truekeate_inflight_tx` | La marca de «transacción en vuelo» por cuenta | Sí |
| 12 | `truekeate_rate_windows` | El contador de llamadas por web y minuto | Sí |
| 13 | `truekeate_logs` | El registro de actividad | **No: se conserva** |
| 14 | `truekeate_settings` | Ajustes, etiquetas y avisos aceptados | Sí |

Ninguna es efímera: todas sobreviven a que el motor se duerma. Lo temporal (los cerrojos que evitan choques, la foto de arranque y las conexiones en curso) **no** se guarda y se reconstruye.

### Orden de arranque del SW y claves implicadas

Cada despertar recorre siete pasos, siempre en el mismo orden:

| Paso | Qué hace con los datos | Claves que toca |
|---|---|---|
| 1 | Pide que solo las páginas propias puedan leer el cajón | Ninguna |
| 1.b | Reconstruye el contador de entradas descartadas | `truekeate_logs_dropped` |
| 2 | Migra el formato a la versión 1.4 | Todas las canónicas y las heredadas |
| 3 | Siembra la red por defecto (Anvil Local) | `truekeate_networks`, `truekeate_chain_id` |
| 4 | Comprueba la integridad; si algo no cuadra, marca la cartera como dañada (no borra nada) | `truekeate_mnemonic`, `truekeate_accounts`, `truekeate_imported_accounts` |
| 5 | Carga el estado en **una sola lectura** | Frase, cuentas, importadas, cuenta activa, red, redes, sesiones y ajustes |
| 6 | Reordena lo que quedó a medias (purga, avisos, alarmas, marcas y ventanas de tasa) | `pendingRequests`, `inflightTx`, `rateWindows`, `approvalWindow`, `logs` |
| 7 | Anota **una** entrada «motor arrancado» con el espacio usado | `logs` |

Ningún paso puede impedir el arranque: si algo falla, se deja un aviso en la consola y la extensión sigue funcionando.

### Claves con prefijo `truekeate_` fuera del catálogo canónico

Dos nombres empiezan por `truekeate_` pero **no** son oficiales:

- `truekeate_logs_dropped`: contador de entradas de registro descartadas por falta de espacio. Es diagnóstico, no estado de la cartera, y **sobrevive al reset**.
- `truekeate_schema_version`: constante documental. Ningún módulo del producto la escribe, así que no llega a existir en el almacén.

### Divergencias detectadas (globales)

Cuatro diferencias entre lo que dice la documentación y lo que hace el código. No se han «arreglado» desde aquí; se dejan escritas.

1. **Recuento de líneas.** El encargo describía `schema.ts` con 609 líneas; tiene 662. La cita estaba desactualizada.
2. **`truekeate_schema_version` no existe por código.** Ningún módulo la escribe, pero aparece en el arnés de pruebas y en varias evidencias guardadas. **Pendiente de confirmar** su origen (probablemente, un resto de una compilación anterior).
3. **`truekeate_logs_dropped` se rechaza en la migración.** Al no ser oficial ni alias antiguo, se informa en la lista de claves rechazadas y **no se copia**. El efecto es inocuo, pero nunca se «adopta» formalmente.
4. **`truekeate_mnemonic` puede no existir.** Ocurre en carteras creadas solo con cuentas importadas; el código lo confirma.

## Clave `truekeate_mnemonic`

Aquí vive la **frase de recuperación**: las 12 palabras que permiten reconstruir todas las cuentas derivadas. Es el dato más sensible de la cartera.

### Forma y tipos

- Nombre guardado: `truekeate_mnemonic`. Contenido: una cadena de texto con la frase BIP-39 (12 palabras), en minúsculas y con espacios simples.
- Puede **no existir**: si la cartera se creó solo con cuentas importadas, la clave falta. No tiene valor inicial.
- Ejemplo (frase de prueba de Anvil, nunca una cartera real): `test test test test test test test test test test test junk`.

### Campos

| Qué guarda | Cómo | ¿Obligatorio? | Para qué sirve |
|---|---|---|---|
| La frase entera | Texto (una cadena) | No: solo si la cartera nació de una frase | Reconstruir la cartera y derivar cuentas nuevas |

### Ciclo de vida

- **Se crea** al crear o importar la cartera, en la **misma** operación que las cuentas, la cuenta activa y los ajustes.
- **Se modifica** solo si vuelves a crear o importar una cartera: se reescribe la frase y se reinician etiquetas y cuentas ocultas. Las importadas y el registro no se tocan.
- **Se borra** únicamente al resetear. La comprobación de integridad **no** la borra: marca la cartera como dañada.
- **Al resetear:** se borra. **Si el motor se duerme:** sobrevive (es la base para restaurar sin volver a pedir la frase).

### Invariantes y errores

- Antes de guardarla se comprueba su «checksum» (la suma de control que valida las 12 palabras). Si falla: `-32602 invalidMnemonic` y **no se escribe nada**.
- La frase **nunca** se anota en el registro de actividad ni viaja por ningún mensaje.
- Si el checksum pasa pero la derivación falla: `-32603` con motivo `derivation-failed`, sin guardar nada.
- Si el navegador rechaza la escritura por falta de espacio: `-32603 storageQuotaExceeded`.

## Clave `truekeate_accounts`

Es la lista de direcciones de las cuentas **derivadas** de la frase: las que la cartera crea sola.

### Forma y tipos

- Nombre guardado: `truekeate_accounts`. Contenido: una lista de direcciones en orden, con valor inicial `[]`.
- **La posición en la lista es el índice de derivación** (la ruta BIP-44 `m/44'/60'/0'/0/i`): la cuenta número 2 es siempre la tercera de la lista.
- Ejemplo: `["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"]`.

### Campos

| Qué guarda | Cómo | ¿Obligatorio? | Para qué sirve |
|---|---|---|---|
| Las direcciones derivadas | Lista de textos | Sí (puede estar vacía) | Saber qué cuentas hay y en qué orden |

### Ciclo de vida

- **Se crea** al crear o importar la cartera, con las primeras cuentas derivadas.
- **Se amplía** con «Añadir cuenta»: la cuenta nueva toma como índice la longitud actual de la lista, así que repetir la operación no duplica nada.
- **No se recorta** cuenta a cuenta: una derivada nunca se elimina, solo se **oculta** desde los ajustes.
- **Al resetear:** se borra. **Si el motor se duerme:** sobrevive.

### Invariantes y errores

- El saneado **falla cerrado**: si una sola entrada no es una dirección válida, la lista entera se considera inutilizable y se devuelve vacía. Es deliberado: compactar la lista haría que la posición dejara de coincidir con el índice y se podría entregar la clave privada de **otra** cuenta.
- Una referencia a una cuenta inexistente responde `-32602 unknownAccount`.
- Siempre se escribe la lista **completa**; nunca trozos sueltos.

## Clave `truekeate_imported_accounts`

Son las cuentas que traes de fuera con su clave privada.

### Forma y tipos

- Nombre guardado: `truekeate_imported_accounts`. Contenido: una lista de fichas, con valor inicial `[]`.
- Ejemplo: `[{ "address": "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF", "privateKey": "0x…", "label": "Ahorros", "importedAt": 1730000000000, "visible": true }]`.

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `address` | Dirección de la cuenta (con checksum EIP-55, que detecta erratas al escribirla) | Sí | Se calcula desde la clave privada |
| `privateKey` | La clave privada importada (32 bytes) | Sí | — |
| `label` | Etiqueta editable, máximo 32 caracteres | Sí | `Importada N` si no pones ninguna |
| `importedAt` | Fecha de importación en milisegundos | Sí | `0` si el dato guardado no es un número |
| `visible` | Si se muestra en la lista | Sí | `true` (visible) |

### Ciclo de vida

- **Se crea** al importar una clave privada.
- **Se modifica** al renombrar (campo `label`) o al mostrar u ocultar (campo `visible`).
- **Se borra** solo con la baja de la cuenta importada: es la **única** vía de baja de una cuenta.
- **Al resetear:** se borra. **Si el motor se duerme:** sobrevive.

### Invariantes y errores

- Una cuenta repetida (derivada o importada) responde `-32602 duplicateAccount`; una clave privada inválida, `-32602 invalidPrivateKey`.
- Las etiquetas deben tener entre 1 y 32 caracteres.
- **Guarda de sesión activa:** si una web tiene sesión vigente sobre esa cuenta, la baja se bloquea con `-32000 accountInUseByDapp` y la clave queda **intacta**.
- Las fichas malformadas se descartan al leerlas: no se inventan campos que falten.

## Clave `truekeate_current_account`

Indica **cuál es la cuenta activa**: la que firma y la que se comparte con las webs conectadas.

### Forma y tipos

- Nombre guardado: `truekeate_current_account`. Contenido: una referencia de cuenta, con dos formas válidas: `idx:<n>` (derivada número n) o `imp:<dirección>` (importada). Existe una tercera forma antigua (solo un número) que las migraciones convierten a `idx:<n>`.
- No tiene valor inicial: si falta o no vale, se usa la primera cuenta disponible. Ejemplo: `"idx:0"`.

### Campos

| Qué guarda | Cómo | ¿Obligatorio? | Para qué sirve |
|---|---|---|---|
| La cuenta activa | Referencia `idx:…` o `imp:…` | No | Saber qué cuenta firma y qué cuenta ven las webs conectadas |

### Ciclo de vida

- **Se crea** al crear o importar una cartera: se escribe `idx:0`.
- **Se modifica** al cambiar de cuenta. Si borras la importada que estaba activa, pasa a `idx:0` o a la primera importada.
- **Se borra** al resetear. Además, la migración reescribe la forma antigua (`"0"`) a `idx:0`.
- **Al resetear:** se borra. **Si el motor se duerme:** sobrevive.

### Invariantes y errores

- La cuenta referenciada debe existir; si no, `-32602 unknownAccount`.
- La referencia debe ser un número entero dentro del rango válido: se rechazan `idx:` vacío, `0x10` o `1e1`.
- Si la cuenta guardada ya no existe, la cartera usa la primera disponible **sin** reescribir el almacén.

## Clave `truekeate_chain_id`

Es la **red activa**: a qué cadena de bloques está conectada la cartera ahora mismo.

### Forma y tipos

- Nombre guardado: `truekeate_chain_id`. Contenido: el identificador de red en hexadecimal.
- Valor inicial normativo: `0x7a69`, la red local de pruebas «Anvil Local» (31337 en decimal). No tiene valor por defecto guardado: se siembra en el arranque.

### Campos

| Qué guarda | Cómo | ¿Obligatorio? | Para qué sirve |
|---|---|---|---|
| La red activa | Texto hexadecimal que empieza por `0x` | Sí, tras el primer arranque | Saber contra qué nodo se hacen las llamadas |

### Ciclo de vida

- **Se crea o se repara** en cada arranque: si la red guardada no está dada de alta, se vuelve a la red por defecto.
- **Se modifica** al aprobar un cambio de red o al añadir una red.
- **Se borra** al resetear; tras el siguiente arranque vuelve Anvil Local.
- **Al resetear:** se borra. **Si el motor se duerme:** sobrevive.

### Invariantes y errores

- La forma debe ser `0x` seguido de dígitos hexadecimales; se normaliza a minúsculas.
- Si la red activa no está registrada, se usa la red por defecto y se llama a `http://127.0.0.1:8545`.
- Si falla la escritura al activar una red: `-32603` con motivo `chain-id-write-failed`. El guardado ocurre **antes** de avisar a las páginas del cambio.

## Clave `truekeate_networks`

Es el **catálogo de redes**: las cadenas de bloques que la cartera conoce, con su nodo y su moneda.

### Forma y tipos

- Nombre guardado: `truekeate_networks`. Contenido: un mapa donde la clave es el identificador de red y el valor, la ficha de la red.
- Valor inicial: mapa vacío `{}`. Tras el arranque hay siempre, al menos, «Anvil Local».

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `chainId` | Identificador de la red en hexadecimal; es la clave del mapa | Sí | `0x7a69` |
| `chainIdDecimal` | El mismo número en decimal (lo piden algunos estándares) | Sí | `31337` |
| `name` | Nombre visible | Sí | «Anvil Local» |
| `rpcUrl` | Dirección del nodo | Sí | `http://127.0.0.1:8545` |
| `symbol` / `decimals` | Símbolo y decimales de la moneda nativa | Sí / No | `ETH` / `18` |
| `isTestnet` / `isDefault` | Marca de red de pruebas y de red por defecto | Sí | `true` en Anvil; solo una es la de por defecto |
| `explorerUrl` | Enlace al explorador de bloques | No | Puede faltar |

### Ciclo de vida

- **Se crea** al sembrar la red por defecto en el primer arranque, de forma repetible sin duplicar.
- **Se modifica** al dar de alta una red. Una red nueva **nunca** se activa sola.
- **Se borra** al resetear; Anvil vuelve a sembrarse en el arranque siguiente.
- Las escrituras están protegidas por un cerrojo para que el sembrado del arranque y un alta simultánea no se pisen.

### Invariantes y errores

- Las entradas sin identificador hexadecimal válido se descartan al leerlas.
- La dirección del nodo se valida antes de guardar: se prefiere `https` y se admite `http` **solo** para `127.0.0.1` y `localhost`.
- Si falla el guardado: `-32603 storageQuotaExceeded` y la operación se **aborta** sin dejar estado a medias.
- **Divergencia detectada:** una función interna considera «red de pruebas» por defecto cualquier red desconocida, mientras el dato guardado convierte lo que falta en `false`. Son dos momentos distintos (declarar y leer), pero conviene tenerlo presente.

## Clave `truekeate_connected_sites`

Aquí se guardan las **sesiones** con páginas web: qué web está conectada, con qué cuenta y hasta cuándo.

### Forma y tipos

- Nombre guardado: `truekeate_connected_sites`. Contenido: un mapa donde la clave es el origen normalizado (la dirección de la web en minúsculas, sin barra final y con su puerto) y el valor es la sesión. Valor inicial: `{}`.

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `origin` | El origen de la web, dentro de la ficha | Sí | Se copia de la clave si falta |
| `account` | La cuenta compartida con esa web | Sí | La cuenta activa al conectar |
| `chainId` | La red que había al conectar | Sí | `0x7a69` |
| `tabIds` | Pestañas que han usado la sesión | Sí (puede estar vacía) | Lista vacía al principio |
| `connectedAt` / `lastUsedAt` | Cuándo se conectó / cuándo se usó por última vez | Sí | Fechas en milisegundos |
| `expiresAt` | Cuándo caduca: último uso + 24 horas | Sí | `null` significa «sin caducidad» |
| `connected` | Marca de sesión viva | Sí | `true` |

### Ciclo de vida

- **Se crea** solo cuando tú eliges la cuenta en la ventana de conexión: es la **única** forma de que una web consiga sesión.
- **Se modifica** con cada uso (se renueva el plazo) y al cambiar la cuenta activa, que se propaga a las sesiones vigentes **sin** tocar los plazos.
- **Se borra** al revocar el permiso o sola al caducar (el borrado por caducidad no da error).
- **Al resetear:** se borra. **Si el motor se duerme:** sobrevive.

### Invariantes y errores

- La sesión dura **24 horas renovables**: cada uso vuelve a poner el reloj a cero.
- Una sesión es válida si no está marcada como desconectada y si no ha caducado.
- Toda modificación pasa por un cerrojo, porque dos renovaciones a la vez se pisaban entre sí.
- Una sesión vigente **bloquea** revelar o exportar la clave de esa cuenta y borrarla como importada (error `-32000`).
- **Divergencia detectada:** el diccionario del proyecto solo enumeraba cinco campos, mientras el código exige además `origin`, `tabIds` y `connected`.

## Clave `truekeate_pending_requests`

Es la **cola de solicitudes**: las peticiones que esperan tu aprobación (firmar un mensaje, enviar una transacción, cambiar de red…).

### Forma y tipos

- Nombre guardado: `truekeate_pending_requests`. Contenido: un mapa donde la clave es el identificador de la solicitud y el valor es la ficha completa. Valor inicial: `{}`.

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `approvalId` / `method` | Identificador de la solicitud y qué se pide (uno de los 6 aprobables) | Sí | — |
| `params` | Datos de la firma, **ya redactados** al guardarse | Sí | Lista vacía si falta |
| `origin` / `tabId` / `frameId` | La web que lo pide (o `extension`) y su pestaña y marco | Sí | — |
| `account` / `chainId` | La cuenta que firmará y la red de la solicitud | Sí | — |
| `txPreview` / `typedDataPreview` / `signMessagePreview` | Resumen según el método (transacción, datos o mensaje) | No | — |
| `createdAt` / `expiresAt` | Cuándo se creó y cuándo caduca: creación + 120 segundos | Sí | Fechas en milisegundos |
| `status` | `pending`, `approved`, `rejected` o `expired` | Sí | `pending` |
| `resolvedAt` / `errorCode` / `requestId` | Cuándo se resolvió, con qué error y con qué identificador de petición | No | Solo al resolverse |

### Ciclo de vida

- **Se crea** al encolar la solicitud: la cola y la ventana de tasa se guardan en la **misma** operación.
- **Se modifica** al resolver: se marca y se limpia a la vez.
- **Se borra** al resolverla, al caducar o al descartarla. El reset exige que la cola esté **vacía**.
- **Suspensión del motor:** sobrevive por diseño, para no perder una aprobación pendiente.

### Invariantes y errores

- **Tamaño máximo:** 64 KiB (65 536 bytes) por solicitud; si se pasa, `-32602 payloadTooLarge` y **no se guarda nada**.
- **Cantidad máxima:** 8 en total, **1 por origen** y **6 por minuto y origen**, comprobadas en ese orden.
- Un identificador repetido responde `-32603`.
- **Plazo:** 120 segundos desde la creación (no desde que se abre la ventana). El orden de atención es el más antiguo primero.
- Siempre se escribe la clave completa; si falla por espacio, la operación se aborta con `-32603 storageQuotaExceeded`.

## Clave `truekeate_connect_request`

Son las **peticiones de conexión**: cuando una web pide «déjame ver tus cuentas», se guarda aquí mientras decides.

### Forma y tipos

- Nombre guardado: `truekeate_connect_request`. Contenido: un mapa donde la clave es el identificador de la petición. Valor inicial: `{}`.
- Regla clave: **como máximo 1 petición pendiente por web**.

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `requestId` / `origin` | Identificador de la petición y la web que se conecta | Sí | — |
| `favicon` | Icono de la web, preparado por la propia cartera | No | Falta si no hay icono |
| `accounts` / `currentAccountIndex` | Cuentas ofrecidas y cuál viene preseleccionada | Sí | Lista en orden canónico; `0` |
| `chainId` / `tabId` / `frameId` | Red, pestaña y marco de la petición | Sí | — |
| `createdAt` / `expiresAt` | Cuándo se creó y cuándo caduca: 60 segundos | Sí | Fechas en milisegundos |
| `status` | Estado de la petición | Sí | `pending` |

### Ciclo de vida

- **Se crea** antes de abrir la ventana de conexión (420 × 650 píxeles).
- **Se modifica o borra** al responder, y también caduca sola.
- **Al resetear:** se borra. **Si el motor se duerme:** sobrevive.

### Invariantes y errores

- La comprobación de «máximo 1 por web» y la escritura ocurren en el **mismo** tramo crítico, de modo que dos peticiones simultáneas no crean dos ventanas.
- El plazo es de **60 segundos**; superado, la solicitud no se entrega.
- Si eliges una cuenta que no estaba en la lista: `4100 unauthorizedOrigin` y **no** se crea sesión.
- **Divergencia detectada:** el diccionario declaraba el icono como «texto o nulo», mientras el código lo define como opcional (se omite si no hay icono).

## Clave `truekeate_approval_window`

Guarda el estado de la **ventana única de confirmación**: la ventana donde apruebas o rechazas. Solo puede haber una.

### Forma y tipos

- Nombre guardado: `truekeate_approval_window`. Valor inicial exacto: `{ windowId: null, shownApprovalId: null, openedAt: null, updatedAt: 0 }`.

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `windowId` | Identificador de la ventana abierta; `null` si no hay ninguna | Sí | `null` |
| `shownApprovalId` | La solicitud que se está mostrando | Sí | `null` |
| `openedAt` / `updatedAt` | Cuándo se abrió / cuándo se escribió por última vez | Sí | `null` / `0` |

### Ciclo de vida

- Hay **una sola** función que escribe esta clave, y siempre escribe la ficha completa con la fecha de actualización renovada.
- Al cerrar la ventana, `windowId` vuelve a `null`, pero la clave sigue existiendo con sus valores iniciales.
- **Al resetear:** se borra. **Si el motor se duerme:** sobrevive.

### Invariantes y errores

- Si `windowId` no es `null`, hay **exactamente una** ventana de decisión abierta (420 × 640 píxeles).
- La solicitud mostrada es siempre la pendiente **más antigua** que se pueda presentar.
- El estado se marca como cerrado **antes** de cerrar la ventana, para no confundir un cierre técnico con el que haces tú con la «X».
- Cerrar con la «X» equivale a rechazar (`4001`), salvo que el plazo ya hubiera vencido: entonces manda «caducada».
- Si la ventana se pierde de vista, se localiza de nuevo por su dirección y se repara el dato guardado.

## Clave `truekeate_inflight_tx`

Es la marca de **«transacción en vuelo»**: indica que una cuenta está firmando o difundiendo una transacción y que no se puede lanzar otra a la vez.

### Forma y tipos

- Nombre guardado: `truekeate_inflight_tx`. Contenido: un mapa donde la clave es la dirección de la cuenta. Valor inicial: `{}`.
- Regla clave: **como máximo una entrada por dirección**.

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `account` / `approvalId` | La cuenta marcada y la solicitud que originó el envío | Sí | La cuenta es la clave del mapa |
| `phase` | Fase: `signing` (firmando) o `broadcast` (ya difundida) | Sí | `broadcast` si el valor no vale |
| `nonce` | Número de orden definitivo de la transacción | No | Se recalcula al aprobar |
| `txHash` | Huella de la transacción; `null` mientras se firma | Sí | `null` |
| `startedAt` / `expiresAt` | Cuándo empezó y cuándo caduca: 3 minutos | Sí | Fechas en milisegundos |

### Ciclo de vida

- **Se crea** antes de firmar, con la fase `signing`. Si ya había una firma vigente: `-32000 inflightTxInProgress` y **no se firma**.
- **Se modifica** al recibir la huella del nodo: pasa a `broadcast`.
- **Se borra** al confirmarse, al fallar o al caducar; el reordenado del arranque también la limpia.
- **Al resetear:** se borra; además, una marca vigente **bloquea** el reset. **Si el motor se duerme:** sobrevive y se reconstruye.

### Invariantes y errores

- El plazo es de **3 minutos** (180 000 milisegundos).
- Vigencia estricta: la caducidad debe estar en el futuro. Un valor no numérico **no** cuenta como vigente.
- Una segunda aprobación con una firma en curso responde `-32000 inflightTxInProgress`, no «demasiadas solicitudes pendientes».
- El reordenado **nunca** reintenta una firma ni una difusión: libera la marca, descarta y deja constancia.

## Clave `truekeate_rate_windows`

Es el **contador de llamadas**: cuántas peticiones lleva hechas cada web en el último minuto. Sirve para frenar abusos.

### Forma y tipos

- Nombre guardado: `truekeate_rate_windows`. Contenido: un mapa donde la clave es el origen de la web. Valor inicial: `{}`; una ventana nueva empieza con 6 fichas.

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `tokens` | Fichas disponibles (de 0 a 6) | Sí | `6` |
| `lastRefillAt` / `approvalWindowStart` | Última recarga y comienzo de la ventana de 60 segundos | Sí | Momento actual |
| `approvalsInWindow` | Solicitudes aprobables contadas en la ventana | Sí | `0` |
| `deniedCount` | Rechazos acumulados, para diagnóstico | Sí | `0` |
| `updatedAt` | Última escritura; sirve para la limpieza por inactividad | Sí | Momento actual |

### Ciclo de vida

- **Se crea** al primer uso de esa web; **se modifica** al consumir una ficha y al contar una solicitud aprobable.
- **Se borra** cuando la web lleva mucho tiempo inactiva, o entera con el reset.
- **Si el motor se duerme:** sobrevive, para que el contador no se reinicie con cada siesta.

### Invariantes y errores

- El límite es de **6 solicitudes por minuto y por origen**; la limpieza por inactividad se hace a los **10 minutos**.
- Si el reloj del sistema va hacia atrás, la entrada se reinicia por completo.
- Al vencer la ventana se reinicia **también** el contador de aprobables (era un defecto medido y corregido en la fase de pruebas).
- Las peticiones nacidas dentro de la propia extensión (`origin: extension`) no consumen fichas.
- Al agotarse las fichas, la respuesta es `4001` y la llamada **no se ejecuta**.

## Clave `truekeate_logs`

Es el **registro de actividad**: la lista de lo que ha ido ocurriendo (llamadas, eventos, transacciones, firmas y avisos del sistema). Es la única clave que **sobrevive** al reseteo.

### Forma y tipos

- Nombre guardado: `truekeate_logs`. Contenido: una lista ordenada de entradas, con retención FIFO (al llenarse, se descarta la más antigua). Valor inicial: `[]`.

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `id` / `ts` | Identificador de la entrada y fecha en milisegundos (ordena la lista) | Sí | Se generan al crearla |
| `level` | `info`, `success`, `warn` o `error` (da color a la pantalla) | Sí | El del catálogo |
| `category` | Familia: `call`, `event`, `tx`, `sign` o `system` | Sí | La del catálogo |
| `event` | Qué ocurrió, de un catálogo cerrado de 24 nombres | Sí | — |
| `message` | Texto legible en español | Sí | El del catálogo |
| `origin` / `method` | La web de origen (o `extension`) y el método implicado | Sí | `extension` si falta |
| `data` | Datos **redactados**; si superan 4096 bytes, se guarda su huella y su tamaño | Sí | — |
| `txHash` / `txStatus` | Huella y estado de una transacción | No | Solo en entradas de transacción |

### Ciclo de vida

- **Lo escribe solo** el módulo de registro: es el único camino de escritura, para no perder entradas.
- **No se borra** al resetear la cartera: es la excepción, para que quede constancia de lo ocurrido.
- Al llenarse, se descartan las entradas más antiguas.

### Invariantes y errores

- **Una entrada, un evento**, de un catálogo cerrado de 24 nombres. Un evento fuera del catálogo es un error de programación y el programa avisa con un `RangeError`.
- **Retención:** 500 entradas en total y 200 por origen.
- **Redacción obligatoria:** nunca se guardan claves privadas, la frase de recuperación ni una firma completa.
- El objetivo de tamaño es no pasar de **2 MB** con las 500 entradas; las escrituras están serializadas para no perder entradas simultáneas.

## Clave `truekeate_settings`

Son los **ajustes**: cuántas cuentas derivar, sus etiquetas, cuáles están ocultas, los límites de la cola, el tamaño del registro y la versión del formato.

### Forma y tipos

- Nombre guardado: `truekeate_settings`. Contenido: una ficha con todos los ajustes, que se reconstruye campo a campo al leerla (sin fiarse de la forma guardada).
- No tiene valor inicial en la tabla de valores por defecto: se construye con los ajustes estándar.

### Campos

| Campo | Qué es | ¿Obligatorio? | Valor habitual |
|---|---|---|---|
| `derivedAccountCount` | Cuántas cuentas derivar; «Añadir cuenta» lo sube | Sí | `5` |
| `accountLabels` / `hiddenAccounts` | Etiquetas por índice y lista de índices ocultos | Sí | `{}` / `[]` |
| `balancePollMs` / `balancePollMaxAccounts` | Cada cuánto se consultan los saldos y cuántas cuentas por ciclo | Sí | `5000` ms / `10` |
| `logLimit` / `logMaxPerOrigin` | Máximo de entradas del registro, en total y por web | Sí | `500` / `200` |
| `sessionTtlMs` | Duración de una sesión de web | Sí | `86400000` ms (24 h) |
| `pendingRequestsMax` / `pendingRequestsMaxPerOrigin` / `pendingRequestsPerMinute` | Los tres límites de la cola | Sí | `8` / `1` / `6` |
| `language` | Idioma de la interfaz | Sí | `'es'` |
| `encryptionEnabled` / `requirePasswordOnOpen` | Cifrado y contraseña, descartados por diseño | Sí | Siempre `false` |
| `devNoticeAcceptedAt` | Cuándo aceptaste el aviso de entorno de desarrollo | No | Falta si no lo aceptaste |
| `schemaVersion` | Versión del formato, guardada aquí dentro | Sí | `'1.4'` |

### Ciclo de vida

- **Se crea** con el primer guardado: al crear o importar una cartera, al derivar una cuenta o al cambiar cualquier ajuste.
- **Se modifica** al cambiar de ajuste, al poner o quitar etiquetas y al ocultar o mostrar cuentas derivadas.
- **Se borra** entero al resetear la cartera.
- **Al resetear:** se borra. **Si el motor se duerme:** sobrevive.

### Invariantes y errores

- **Sin cifrado y sin contraseña, por decisión de diseño:** aunque el almacén traiga otro valor, ambos campos se fuerzan a `false`.
- La fecha de aceptación del aviso de desarrollo **no se puede borrar ni mover**: la primera aceptación fija el momento.
- Las etiquetas deben tener entre 1 y 32 caracteres y ningún carácter de control; si no, `-32602 invalidLabel`.
- La lista de cuentas ocultas se sanea: enteros no negativos, sin repeticiones y ordenados.
- Si falla la escritura: `-32603 storageQuotaExceeded`, nunca un error sin código.
- **Divergencia detectada:** el diccionario no enumeraba `schemaVersion` ni `devNoticeAcceptedAt`, pero ambos existen y se escriben.

## Reset de la cartera

Resetear es **borrar la cartera** y dejarla como recién instalada. Aquí se explica qué se lleva por delante y qué no.

### Qué borra exactamente

Borra **13 de las 14 claves oficiales**: `truekeate_mnemonic`, `truekeate_accounts`, `truekeate_imported_accounts`, `truekeate_current_account`, `truekeate_chain_id`, `truekeate_networks`, `truekeate_connected_sites`, `truekeate_pending_requests`, `truekeate_connect_request`, `truekeate_approval_window`, `truekeate_inflight_tx`, `truekeate_rate_windows` y `truekeate_settings`.

El borrado se hace con la función `removeStorage`, que incluye un reintento por si la primera vez falla.

### Qué conserva

**Se conserva `truekeate_logs`**: es la única clave que sobrevive, para tener constancia de lo ocurrido incluso después de vaciar la cartera. La clave **no oficial** `truekeate_logs_dropped` tampoco se borra, porque no está en la lista de claves a eliminar.

### Guardas y orden

El orden es **estricto**: primero la cola vacía, después ninguna transacción en vuelo, luego la confirmación destructiva y, solo entonces, la limpieza.

1. **Cola vacía.** Solo cuentan las solicitudes en estado `pending`.
2. **Sin transacción en vuelo vigente.** Hace falta que la marca no esté caducada.
3. **Confirmación destructiva.** Sin confirmar, el resultado es `cancelled` y **no se toca ninguna clave**.
4. **Limpieza.** Primero la parte de plataforma (cancelar las alarmas de vencimiento y limpiar el distintivo) y después el almacén. Si la parte de plataforma falla, el material sensible se borra igual.

Los resultados posibles son `done` (hecho), `blocked` (bloqueado, con `-32000 resetBlocked` y el número de pendientes), `cancelled` (cancelado) y `failed` (falló, con `-32603`).

### Evidencia

- **Pruebas unitarias:** el caso principal comprueba que se borran 13 claves, que **se conserva** `truekeate_logs` y que el estado final es `done`. Verifica además que no queda rastro de la frase ni de la clave privada importada, y cubre el bloqueo sin escrituras, la repetición del reset y el fallo con almacén no disponible.
- **Pruebas de navegador:** el caso del reset prepara una cartera con una cuenta importada, una sesión activa y una entrada de registro testigo, y comprueba que el diálogo avisa de que el registro de actividad se conserva.

## Migraciones de esquema

Una **migración** es el trabajo de traducir los datos guardados por una versión antigua al formato nuevo, sin perder nada.

### Versiones reales

- Versiones admitidas: `1.2`, `1.3` y `1.4`. Un almacén sin versión declarada se considera **1.2**.
- Destino: la **1.4**, que se escribe en `truekeate_settings.schemaVersion`.
- Clave retirada: `truekeate_pending_request` (en singular), que ya no se usa.
- Para leer la versión declarada se aceptan la forma canónica y dos formas heredadas.

### Qué transforma cada paso

**Paso de 1.2 a 1.3:**

| Qué se encuentra | Qué se hace |
|---|---|
| `truekeate_pending_request` (en singular) | Se **elimina**: el proyecto prohíbe los alias y los lectores antiguos |
| `truekeate_connected_sites` guardado como texto suelto | Se convierte a la ficha completa conservando la cuenta |
| Entradas de registro sin el campo `event` | Se rellena de forma predecible desde la categoría; **ninguna entrada se pierde** |
| Ajustes sin `accountLabels` | Se añade vacío |

**Paso de 1.3 a 1.4:**

| Qué se encuentra | Qué se hace |
|---|---|
| Claves antiguas sin prefijo `truekeate_` | Se **renombran** a su nombre oficial; si existen las dos, gana la oficial |
| Cuenta activa con la forma antigua `"0"` | Se normaliza a `idx:0` |
| Versión del esquema | Se escribe la 1.4 en los ajustes |

El plan de migración es **puro** (no escribe nada mientras lo calcula) y **repetible**: si ya estás en la 1.4, informa de que está al día sin tocar el almacén.

### Cómo rechaza claves no canónicas

Una clave que no es oficial, no es un alias antiguo y no está retirada se **rechaza**: se informa en la lista de claves rechazadas y **no se copia**. El principio es claro: «nunca se destruyen datos que el producto no entiende».

Un formato de versión **desconocido** (por ejemplo la 2.0) **no se migra hacia atrás**: se responde con `ok: false`, el error `-32603` y el motivo `unknown-schema-version`, y no se escribe nada.

### Qué pasa si falla

- **Falla la escritura o el borrado:** la migración informa de que no se aplicó y devuelve el error canónico «fallo de escritura de migración». Nunca revienta el programa.
- **El arranque continúa.** Si la migración lanza una excepción, el arranque la captura, deja un aviso en la consola («la migración de esquema falló; se continúa con el estado actual») y sigue con el resto de pasos.
- El informe de la migración viaja dentro de la entrada «motor arrancado» del registro.

### Idempotencia y verificación

- La migración es **idempotente**: si ya estás en la 1.4, informa de que está al día sin escribir. Repetir el arranque no reescribe el almacén.
- Solo se escribe cuando hay algo que escribir; si no hay nada que renombrar, eliminar, añadir ni reescribir, no se toca el almacén.
- Las claves antiguas y las retiradas se eliminan **por su nombre literal**, y el borrado se agrupa en una sola operación sin duplicados.
- Pruebas de referencia: cubren la versión vigente, el rechazo de claves no oficiales y el salto de 1.2 a 1.4 sin pérdida de datos.

## Cuota de almacenamiento

La **cuota** es el espacio máximo que el navegador concede a la extensión. Aquí se explica cómo se mide y qué pasa cuando se llena.

### Medición

- **Cuota objetivo:** 10 MB (10 485 760 bytes), el espacio que Chrome concede por defecto desde la versión 114, que es la versión mínima que exige la extensión.
- **Umbral de aviso:** el 90 % (unos 9 MB). Es un aviso de pantalla: **no** se guarda ningún contador propio para ello.
- La medición se hace con la función del navegador `getBytesInUse`, que mide una clave o el almacén entero. **Nunca** revienta: si falla, informa de que no hay medida.
- En el arranque, la entrada «motor arrancado» incluye cuántos bytes se están usando, junto con el tiempo de arranque, la versión del esquema y los resúmenes de la migración, la integridad y el reordenado.

### Modo de fallo por cuota

La detección del error de espacio es **única**: se compara el nombre y el mensaje del error contra dos textos conocidos, porque el navegador no garantiza una detección estable entre contextos. La política del registro de actividad es esta:

1. Se intenta escribir. Si va bien, se acabó.
2. Si el rechazo es por **falta de espacio**, se aplica la retención (se descartan las entradas más antiguas) y se reintenta **una** vez. Nunca hay un bucle de escritura.
3. Si el reintento vuelve a fallar, la entrada se **descarta** y se avisa por consola.
4. Se intenta guardar una entrada de diagnóstico («cuota superada») que resume qué se descartó, de qué origen y cuántas veces se reintentó. Lo que se reescribe es el histórico ya guardado más ese diagnóstico: las entradas descartadas **no** se cuelan por la puerta de atrás.
5. Se mide el espacio usado para dejar constancia.

Las claves consideradas críticas siguen la otra rama: la operación se **aborta** con `-32603 storageQuotaExceeded` y nunca deja estado a medias. Así ocurre en los ajustes, en el alta de solicitudes, en el alta de cuentas y en el alta de redes. Las funciones genéricas de escritura y borrado aplican su propio reintento: dos intentos y, si persiste, informan de que no se pudo.

### Presupuesto por clave (peor caso)

El proyecto fija un presupuesto orientativo por clave para justificar que el total quede muy por debajo de los 10 MB:

| Clave | Presupuesto previsto |
|---|---|
| `truekeate_logs` | Hasta 500 entradas (objetivo: 2 MB o menos) |
| `truekeate_pending_requests` | Hasta 8 × 64 KiB = 512 KiB |
| `truekeate_networks`, `truekeate_settings`, `truekeate_accounts`, `truekeate_imported_accounts`, `truekeate_connected_sites` | Menos de 64 KiB cada una |
| `truekeate_approval_window`, `truekeate_inflight_tx`, `truekeate_rate_windows` | Menos de 64 KiB |

**No** se pide espacio ilimitado al navegador: la política es reducir el consumo (retención del registro) y hacer que el desbordamiento sea **visible**.

### El contador que publica `wallet_getLogs.dropped`

- El módulo de registro lleva tres contadores en memoria: entradas descartadas, reintentos e intentos.
- Solo se guardan **cuando cambian**: si no hay cambio, no se escribe. Es una optimización para no ralentizar el arranque.
- Al arrancar se reconstruye el contador desde `truekeate_logs_dropped`, para que el descarte siga siendo visible después de una siesta del motor.
- El método `wallet_getLogs` devuelve la lista, si está recortada y cuántas entradas se descartaron. Los intentos cuentan solo los de escritura de la traza (uno, o dos con el reintento).

## Claves de `chrome.storage.local` NO pertenecientes al monedero

Aquí se aclara qué **no** usa la cartera, para no buscar problemas donde no los hay.

### `chrome.storage.session`

**No se usa.** Es un cajón que se vacía al cerrar el navegador y el proyecto no lo necesita. El aislamiento se resuelve con el ajuste «solo contextos de confianza» sobre el almacén normal, no con un segundo cajón.

### `chrome.storage.sync`

**Prohibido.** No hay ni una sola escritura a ese almacén en el código del producto: ese cajón replica los datos en los servidores de la cuenta del navegador, y ahí no pueden acabar la frase de recuperación ni las claves privadas. El simulador de pruebas ni siquiera lo implementa, a propósito.

### `localStorage` y `sessionStorage`

**No se usan.** Son cajones de las páginas web y no existen dentro de un Service Worker. No hay ninguna referencia a ellos en el código del producto.

### Claves que introduce el arnés E2E/Playwright

El arnés de pruebas automáticas **no** añade claves propias: escribe y lee solo claves oficiales de la cartera a través del protocolo de depuración de Chrome. La única excepción declarada es `truekeate_schema_version`, que figura como clave «volátil» del almacén y aparece en varias evidencias guardadas. Como ningún módulo del producto la escribe, su presencia queda **pendiente de confirmar**.

### Resumen de claves reales con prefijo `truekeate_`

- **14 canónicas**, documentadas una a una en este manual.
- **1 auxiliar escrita por el producto:** `truekeate_logs_dropped`, fuera del catálogo y fuera del reset.
- **1 declarada y no escrita:** `truekeate_schema_version`.
- Ninguna otra clave con ese prefijo se escribe desde el código del producto.

## Problemas frecuentes

### El aviso de «no hay espacio» y no se guardan mis cambios

**Causa.** El almacén ha llegado a su límite (10 MB). El registro de actividad es lo que más ocupa, porque guarda las últimas 500 entradas.

**Solución.** La cartera descarta primero las entradas más antiguas del registro y reintenta una vez. Si el aviso persiste, resuelve las solicitudes pendientes (aprueba o rechaza) para vaciar la cola y vuelve a intentarlo. Las operaciones críticas (cuentas, ajustes, redes) no se guardan a medias: avisan con `-32603 storageQuotaExceeded` y hay que repetirlas.

### El registro de actividad tiene menos entradas de las que esperaba

**Causa.** La retención es limitada a propósito: 500 entradas en total y 200 por web. Al superarse, se descartan las más antiguas. También puede haber descartes por falta de espacio.

**Solución.** Es el comportamiento previsto. Si quieres conservar algo importante, apúntalo aparte. Recuerda que el registro **se conserva** aunque resetees la cartera.

### He reseteado la cartera y siguen apareciendo registros antiguos

**Causa.** Es deliberado: el registro es la única clave que sobrevive al reset, para que quede constancia de lo ocurrido.

**Solución.** No es un error. El propio diálogo de confirmación lo avisa. El reset vacía las cuentas, las sesiones y los ajustes, pero no el registro.

### La cartera aparece marcada como «dañada» y no deja derivar cuentas nuevas

**Causa.** La comprobación de integridad del arranque no ha podido validar la frase o la lista de cuentas. Un caso típico es una lista con un hueco en medio. El sistema prefiere marcar la cartera como dañada antes que arriesgarse a entregar la clave privada equivocada.

**Solución.** Es una protección, no un castigo: la cartera no se borra sola y no se derivan cuentas nuevas desde ella. Restaura el acceso con la frase de recuperación o con la clave privada y, si el problema se repite, anota lo que ves antes de resetear.

### Una cuenta importada ha desaparecido de la lista

**Causa.** Dos motivos posibles: que la ficha se guardara mal y se descarte al leerla, o que siga ahí pero marcada como oculta. En versiones anteriores hubo un caso en el que una cuenta con la clave privada ilegible desaparecía y el informe seguía diciendo que todo estaba bien; está corregido y ahora se avisa con el problema «clave importada que no corresponde».

**Solución.** Mira primero el informe de integridad: si aparece ese aviso, la ficha está corrupta y conviene volver a importar la cuenta. Si no aparece, revisa si está marcada como no visible.

### Mis datos siguen en un formato antiguo y la cartera no los ve

**Causa.** Venían de una versión anterior y la migración no pudo completarse (por un fallo de escritura o por falta de espacio). El arranque continúa con el estado tal cual está.

**Solución.** Deja espacio libre y vuelve a abrir la extensión: la migración se reintenta en cada arranque y es repetible, así que no duplica ni pierde nada. Si el formato guardado es **más nuevo** que el que entiende la cartera (por ejemplo, 2.0), no se migra hacia atrás: se informa con el motivo `unknown-schema-version` y no se toca el almacén.

### No puedo resetear la cartera

**Causa.** Quedan solicitudes pendientes o hay una transacción en vuelo. El reset tiene un orden de guardas estricto y no se salta ningún paso.

**Solución.** Resuelve lo pendiente: aprueba o rechaza las solicitudes de la ventana de decisión y espera a que la transacción en vuelo se confirme o caduque (el plazo máximo es de 3 minutos). El aviso de bloqueo te dice cuántos elementos faltan.

### Una web me da error y no sé si es culpa de la cartera

**Causa.** La cartera responde siempre con un código de error estándar, y cada código significa una cosa distinta.

**Solución.** Consulta la lista de los 8 códigos en el manual de entidades y protocolo. Para orientarte rápido: `4001` es una cancelación o un plazo agotado, `4100` es que la web no tiene permiso, `4200` es que el método no existe o no vale en ese contexto, `4900` es que no se pudo hablar con el nodo local y `4901` que la red no está registrada. El resto son datos inválidos (`-32602`), problemas de fondos, estimación o cuenta bloqueada (`-32000`) y errores internos (`-32603`).
