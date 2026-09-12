# INSTRUCCIONES — TrueKeate Wallet

Guía de uso **paso a paso**, en español, de **cada flujo y cada pantalla** de la extensión y de su dApp de pruebas.

> **Cómo usar esta guía.** Empieza por §1 (arranque) y sigue los flujos en orden la primera vez. Cada flujo indica **qué debes ver** en cada paso y **qué puede salir mal**. Los requisitos, la instalación en 4 pasos y los comandos de prueba están en `README.md`; aquí no se repiten.

**Índice**

1. [Antes de empezar](#1-antes-de-empezar)
2. [Mapa de superficies](#2-mapa-de-superficies-las-4-superficies)
3. [Flujo 1 — Primer arranque: aviso de entorno de desarrollo](#flujo-1--primer-arranque-aviso-de-entorno-de-desarrollo)
4. [Flujo 2 — Crear una cartera nueva](#flujo-2--crear-una-cartera-nueva)
5. [Flujo 3 — Importar una frase de recuperación](#flujo-3--importar-una-frase-de-recuperación)
6. [Flujo 4 — Cuentas: lista, añadir, renombrar, ocultar](#flujo-4--cuentas-lista-añadir-renombrar-ocultar)
7. [Flujo 5 — Importar una cuenta por clave privada](#flujo-5--importar-una-cuenta-por-clave-privada)
8. [Flujo 6 — Recibir: dirección, copiar y QR](#flujo-6--recibir-dirección-copiar-y-qr)
9. [Flujo 7 — Seguridad: revelar y exportar material de recuperación](#flujo-7--seguridad-revelar-y-exportar-material-de-recuperación)
10. [Flujo 8 — Enviar ETH](#flujo-8--enviar-eth)
11. [Flujo 9 — Conectar una dApp y elegir cuenta](#flujo-9--conectar-una-dapp-y-elegir-cuenta)
12. [Flujo 10 — Sitios conectados y revocación](#flujo-10--sitios-conectados-y-revocación)
13. [Flujo 11 — Redes: listar, cambiar y dar de alta](#flujo-11--redes-listar-cambiar-y-dar-de-alta)
14. [Flujo 12 — Actividad: panel de registro y exportación](#flujo-12--actividad-panel-de-registro-y-exportación)
15. [Flujo 13 — Aprobar o rechazar una solicitud de firma](#flujo-13--aprobar-o-rechazar-una-solicitud-de-firma)
16. [Flujo 14 — Reset de la cartera](#flujo-14--reset-de-la-cartera)
17. [Flujo 15 — La dApp de pruebas (`test.html`)](#flujo-15--la-dapp-de-pruebas-testhtml)
18. [Avisos del sistema y qué NO hace la wallet](#18-avisos-del-sistema-y-qué-no-hace-la-wallet)
19. [Problemas frecuentes](#19-problemas-frecuentes)
20. [Glosario de códigos de error](#20-glosario-de-códigos-de-error)

---

## 1. Antes de empezar

### 1.1 Herramientas

| Necesitas | Para qué |
|---|---|
| Chrome o Edge **≥ 114** | Cargar la extensión (`chrome://extensions`). |
| Node.js **≥ 20** | Compilar (`npm ci && npm run build`). |
| Foundry (**`anvil`**) | Nodo local de pruebas. Sin él, la wallet funciona pero **sin red**. |
| *(Opcional)* `forge`, `cast` | Contrato verificador EIP-712 y consultas manuales al nodo. |

### 1.2 Arrancar el entorno

```bash
# 1) Compilar (una vez, y tras cada cambio de código)
npm ci
npm run build

# 2) Nodo local (terminal 1) — NO uses --silent
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"

# 3) dApp de pruebas (terminal 2)
npm run dev
```

**Qué debes ver**

- Anvil imprime las **10 cuentas de prueba** y, en cada una, su clave privada, y queda escuchando en `127.0.0.1:8545`. La primera cuenta es `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` y su frase semilla es `test test test test test test test test test test test junk`.
- `npm run dev` imprime `Local: http://localhost:5174/`. La dApp está en **`http://localhost:5174/test.html`**.
- **Sin Anvil** la wallet sigue siendo utilizable (crear/importar cartera, cuentas, QR, ajustes) pero los saldos muestran «desconectado».

### 1.3 Cargar la extensión

1. Abre **`chrome://extensions`** (Edge: `edge://extensions`).
2. Activa el **Modo de desarrollador**.
3. **Cargar descomprimida** → selecciona la carpeta **`dist/`**.
4. Fija la extensión a la barra de herramientas (icono de pieza → chincheta) para tenerla siempre a mano.

**Qué debes ver:** una tarjeta «TrueKeate Wallet» con el ID `oiahebaliobknoeeonhgaacapjcpgblo`, **sin** botón «Errores» ni avisos amarillos. Tras cambiar código, pulsa **↻** en la tarjeta antes de probar.

---

## 2. Mapa de superficies (las 4 superficies)

| Superficie | Cómo se abre | Tamaño | Para qué |
|---|---|---|---|
| **Popup** (icono de la extensión) | Clic en el icono, o `Alt+Shift+T` tras fijarlo | 380 × 600 | Todo el uso de la cartera: 7 pestañas. |
| **Ventana de conexión** (`connect.html`) | La abre una dApp al llamar a `eth_requestAccounts` | 420 × 650 | Elegir qué cuenta se comparte con el sitio. |
| **Ventana de confirmación** (`notification.html`) | La abre el Service Worker cuando hay algo que firmar | 420 × 640 | Aprobar/rechazar una transacción o una firma. **Es única**: si hay varias solicitudes, se muestran de una en una con un contador. |
| **dApp de pruebas** (`test.html`) | `http://localhost:5174/test.html` | página completa | Banco de pruebas: detecta el provider y ejercita 7 flujos. |

Las **7 pestañas del popup**, en orden: **Cuentas · Recibir · Enviar · Sitios · Seguridad · Redes · Actividad**.

---

## Flujo 1 — Primer arranque: aviso de entorno de desarrollo

**Pantalla: aviso modal (bloqueante).**

1. Pulsa el icono de TrueKeate con la cartera vacía.

**Qué debes ver**

- Un diálogo **no descartable** titulado «Entorno de desarrollo — no usar con fondos reales» con el texto que explica que la cartera funciona **sin contraseña** y que guarda la frase de recuperación en el almacén local de la extensión.
- Un único botón: **«He entendido, continuar»**. El diálogo **no** se cierra con `Escape`, ni pulsando fuera, ni con una «X»: solo con la aceptación explícita, que queda registrada en la configuración de la cartera.

2. Pulsa **«He entendido, continuar»**.

**Qué debes ver:** el formulario de bienvenida de la pestaña **Cuentas** con dos acciones: **«Crear cartera nueva»** e **«Importar frase»**. Este aviso **no vuelve a aparecer** salvo que hagas un reset (§ Flujo 14); su contenido sigue disponible en todo momento en el diálogo **«Acerca de»** (§18.1).

---

## Flujo 2 — Crear una cartera nueva

**Pantalla: Cuentas → bienvenida.**

1. Pulsa **«Crear cartera nueva»**.

**Qué debes ver:** un formulario con el título **«Frase de recuperación de 12 palabras»**, las 12 palabras separadas por espacios y la nota «Separa las palabras con espacios; da igual el uso de mayúsculas». El botón **«Continuar»** está **deshabilitado** hasta que confirmes la frase (se te pide volver a escribirla).

2. Copia o anota las 12 palabras y escríbelas en el campo de confirmación.
3. Pulsa **«Continuar»**.

**Qué debes ver**

- Aviso **«Cartera creada: revisa “Seguridad” para guardar tu frase.»**
- La pestaña **Cuentas** pasa a mostrar **5 cuentas derivadas** (índices 0 a 4, rutas `m/44'/60'/0'/0/0` … `/4`) con su **dirección abreviada** `0x1234…abcd`, la **cuenta activa** resaltada y el **saldo** de la cuenta activa contra Anvil.
- En **Redes** aparece la red local (**Anvil**, chainId **31337**, marcada como **red de pruebas**).

**Comprobación rápida:** con la frase `test test test test test test test test test test test junk` importada, la cuenta 0 debe ser `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` y su saldo **10 000 ETH** (Anvil). Si usas la frase que generó la extensión, el saldo será **0**.

> **Importante:** la cartera **no pide contraseña** y no cifra el almacén. En este modo, cualquiera con acceso a tu perfil de Chrome puede leer la frase. Por eso el aviso del Flujo 1 y por eso la wallet **no debe usarse con fondos reales**.

---

## Flujo 3 — Importar una frase de recuperación

**Pantalla: Cuentas → bienvenida → «Importar frase».**

1. Pulsa **«Importar frase»**.

**Qué debes ver:** un formulario con la etiqueta **«Frase de recuperación de 12 palabras»** y la nota de normalización («Separa las palabras con espacios; da igual el uso de mayúsculas»).

2. Pega las 12 palabras (por ejemplo la frase de Anvil `test test test test test test test test test test test junk`). Da igual si hay espacios dobles o mayúsculas irregulares: se normaliza.
3. Pulsa el botón de **importar/enviar** del formulario.

**Qué debe verse al terminar**

- Aviso **«Cartera importada desde la frase de recuperación.»**
- Las **5 cuentas derivadas** de esa frase, ya seleccionable la cuenta 0 y con su saldo.

**Si la frase es inválida** (11 palabras, una palabra alterada o checksum roto): se muestra **«frase inválida»** en el propio formulario con la acción sugerida y **no se crea ninguna cartera**. No hay que adivinar: el mensaje nombra la causa.

---

## Flujo 4 — Cuentas: lista, añadir, renombrar, ocultar

**Pantalla: pestaña «Cuentas».**

**Qué debes ver**

- La lista de cuentas con: etiqueta o «Cuenta N», **dirección abreviada** `0x1234…abcd` (con la dirección completa disponible al copiar), marca **«importada»** en las cuentas traídas por clave privada, **saldo** de la cuenta activa y un indicador de la cuenta seleccionada.
- Botones **«Añadir cuenta»**, **«Importar clave privada»** y, por cuenta, las acciones de **etiqueta**, **ocultar** y **eliminar** (esta última solo en cuentas importadas).

**Añadir una cuenta derivada**

1. Pulsa **«Añadir cuenta»**.
2. **Qué debes ver:** aparece la **6.ª cuenta**, con índice 5, una **dirección distinta** de las anteriores y el aviso **«Cuenta derivada y añadida a la lista.»**

**Renombrar**

1. Selecciona una cuenta, escribe la etiqueta (máximo 32 caracteres) y pulsa **«Guardar etiqueta»**.
2. **Qué debes ver:** el nuevo nombre en la lista; al cerrar y reabrir el popup, **la etiqueta persiste**.

**Seleccionar la cuenta activa**

1. Haz clic en otra cuenta de la lista (o muévete con el **teclado** y confirma con `Intro`).
2. **Qué debes ver:** el saldo y la dirección de la barra superior cambian; si hay una dApp conectada, recibe `accountsChanged` y su cuenta compartida se actualiza (la sesión **no** se pierde).

**Ocultar una cuenta derivada**

1. Usa la acción de ocultar de la cuenta.
2. **Qué debes ver:** la cuenta desaparece de la lista. Puede **volver a mostrarse** con la **misma dirección** (no se pierde la derivación).

---

## Flujo 5 — Importar una cuenta por clave privada

**Pantalla: Cuentas → «Importar clave privada».**

1. Pulsa **«Importar clave privada»**.

**Qué debes ver:** un formulario con el campo de clave privada y un campo **«Etiqueta (opcional, máximo 32 caracteres)»**, con la nota «La cuenta se añade marcada como importada y con etiqueta renombrable».

2. Pega una clave privada válida: `0x` + **64 dígitos hexadecimales** (copia una de las que imprime Anvil al arrancar).
3. Pulsa el botón de importar.

**Qué debes ver:** aviso **«Cuenta importada con su clave privada.»**; la cuenta aparece en la lista **marcada como importada** y con la dirección derivada de esa clave.

**Casos de error**

| Entrada | Qué debe verse |
|---|---|
| 63 dígitos, sin `0x`, o con caracteres no hexadecimales | Error **en línea** en el formulario (`-32602`) con la causa; **no** se añade nada. |
| Clave ya importada | Se rechaza con `-32602` (cuenta ya existente) y no se duplica. |
| La cuenta está en uso por una dApp conectada y se intenta **revelar su clave** o **eliminarla** | Bloqueo **`-32000`** con la causa «Cuenta en uso por una dApp conectada», nombrando **el origen**; la acción indicada es **revocar ese permiso en «Sitios»**. |

---

## Flujo 6 — Recibir: dirección, copiar y QR

**Pantalla: pestaña «Recibir».**

1. Selecciona la cuenta en **Cuentas** y abre **Recibir**.

**Qué debes ver**

- La **dirección completa** de la cuenta activa (`0x` + 40 hex), el **QR** que la codifica y un botón **«Copiar»**.
- Si no hay cuenta seleccionada: «Selecciona una cuenta en la pestaña «Cuentas» para recibir.»

2. Pulsa **«Copiar»**.

**Qué debes ver:** aviso **«Dirección copiada al portapapeles.»** y, al pegar en un editor, la dirección **completa** (no la abreviada). El QR es **local** (se dibuja en el propio paquete, sin servicios externos): puedes escanearlo desde otra cartera y la dirección coincide carácter a carácter con la mostrada.

> La vista previa del QR es decorativa y no lleva texto; la dirección legible está siempre en el texto de la pantalla.

---

## Flujo 7 — Seguridad: revelar y exportar material de recuperación

**Pantalla: pestaña «Seguridad» → «Material de recuperación».**

> Esta es la pantalla **más sensible** de la cartera. Se aplica la *higiene del revelado*: confirmación explícita, valores ocultos por defecto, revelado temporal de **30 s** y borrado del portapapeles.

1. Abre **Seguridad**. Verás **«Revelar frase semilla»** y, más abajo, la opción de revelar **la clave privada de una cuenta**.

**Qué debes ver:** los valores **ocultos** (puntos o campo vacío) y una **advertencia de riesgo** antes de revelar.

2. Pulsa **«Revelar frase semilla»** y confirma en el diálogo.

**Qué debes ver**

- La **frase de 12 palabras** en pantalla y un **contador de 30 s** en marcha.
- El botón **«Copiar»** (permitido mientras el valor está revelado) y el botón **«Ocultar ahora»**.
- La nota: **«La frase se borrará del portapapeles al ocultarse.»**

3. Deja pasar los 30 s, **o** cambia de ventana (pérdida de foco), **o** pulsa **«Ocultar ahora»**.

**Qué debes ver (las tres vías)**

| Disparador | Aviso que aparece |
|---|---|
| Plazo agotado | «El plazo de 30 s ha terminado: el valor se ha ocultado.» |
| Pérdida de foco | «La ventana ha perdido el foco: el valor se ha ocultado.» |
| Botón manual | «Has ocultado el valor.» |

En los tres casos el valor desaparece de la pantalla y, **si el portapapeles aún contenía la frase, se vacía**; si el borrado no pudo hacerse en el momento (ocultado sin foco), se hace **en cuanto la ventana recupera el foco** y se muestra **«Portapapeles vaciado al recuperar el foco.»** Se borra **solo si sigue conteniendo la semilla** (se compara por huella SHA-256), nunca a ciegas.

4. Para exportar una clave privada: elige la cuenta y pulsa su acción de revelar clave.

**Qué debes ver:** la clave privada `0x…` de esa cuenta con la misma higiene (30 s, ocultado por foco, borrado del portapapeles) y la **misma guarda `-32000`** del Flujo 5 si la cuenta está en uso por una dApp.

> **Nunca** verás la semilla ni una clave privada viajar hacia una página web: la dApp solo recibe firmas, hashes y direcciones autorizadas.

---

## Flujo 8 — Enviar ETH

**Pantalla: pestaña «Enviar».**

1. Abre **«Enviar»**.

**Qué debes ver:** el formulario **«Enviar criptoactivos»** con:
**«Cuenta de origen»** (la activa), **«Tipo de destino»** (Dirección externa / Cuenta propia de la cartera), **«Cuenta de destino»** o **«Dirección de destino»**, el importe, **«Saldo disponible»** y la zona de comisión.

2. Elige **«Cuenta propia de la cartera»** y selecciona otra cuenta.

**Qué debes ver:** la nota «Solo se ofrecen las demás cuentas de la cartera.» y la dirección de destino rellenada automáticamente.

3. *(Alternativa)* Elige **«Dirección externa»** y pega una dirección `0x` + 40 hex.

**Qué debes ver:** la pista «Dirección `0x` + 40 caracteres hexadecimales.» Si la dirección está malformada (EIP-55 incluido), el campo muestra error **en línea** y el botón de envío queda deshabilitado.

4. Escribe el importe y pulsa **«Calcular comisión»**.

**Qué debes ver:** un desglose con **«Comisión estimada»**, **«Límite de gas estimado»** y **«Total»**. La estimación la hace el nodo local (`eth_estimateGas` con `getFeeData()`).

5. Pulsa el botón de envío.

**Qué debes ver**

- Se abre **una sola** ventana de confirmación (Flujo 13) con el origen, el destino, el valor, la red y la comisión.
- Al **aprobar**: se difunde la transacción y la UI pasa a **pendiente → confirmada**, mostrando el **hash** `0x` + 64 hex. El panel **Actividad** registra el envío.
- Al **rechazar** (o si venciera el plazo): la dApp/popup recibe **`4001`** y **no se firma nada**.

**Errores frecuentes**

| Situación | Qué debe verse |
|---|---|
| El importe + la comisión superan el saldo | «Saldo insuficiente para cubrir el valor y la comisión estimada.» con la acción **«Reducir el importe o recargar la cuenta»**; el envío queda bloqueado **antes** de firmar. |
| El nodo rechaza `estimateGas` (revert previo) | Bloqueo con `-32000` y la acción **«Corregir la llamada»**; **no** se firma. |
| Anvil detenido | Estado **«desconectado»**, error **`4900`** y reintentos automáticos acotados; el almacén local queda intacto. |

---

## Flujo 9 — Conectar una dApp y elegir cuenta

**Pantallas: dApp (`test.html`) y ventana de conexión.**

1. Con `npm run dev` en marcha, abre **`http://localhost:5174/test.html`**.

**Qué debes ver:** la página de TrueKeate Test App con el estado de detección del provider. Si la extensión está cargada, anuncia **«TrueKeate»** (EIP-6963) y `window.truekeate` existe (el alias `window.codecrypto` apunta **al mismo objeto**).

2. En la dApp, pulsa el botón de **conectar**.

**Qué debes ver:** se abre la **ventana de conexión** («Solicitud de conexión») con:
el nombre del sitio solicitante y el **origen** (`http://localhost:5174`), la lista de cuentas con su saldo, un selector **«Cuenta que se comparte»** (navegable con las flechas), y los botones **«Conectar»** y **«Rechazar»**. La ventana recuerda que puedes **conectar con `Intro`** y **rechazar con `Escape`**.

3. Elige la cuenta y pulsa **«Conectar»**.

**Qué debes ver**

- En la ventana: **«Respuesta de conexión enviada.»** y el botón **«Cerrar ventana»**.
- En la dApp: `eth_requestAccounts` devuelve **la dirección elegida** y el **saldo** se pinta en la página.
- En el popup, la pestaña **Sitios** pasa a listar ese origen con la cuenta compartida y su vigencia.

**Antes de conectar**, `eth_accounts` de esa dApp devuelve **`[]`** (una dApp no autorizada no ve ninguna cuenta). Si el origen ya tiene sesión vigente, `eth_requestAccounts` responde **sin abrir ventana**.

**Si rechazas** (o cierras la ventana, o vence el plazo de 60 s): la dApp recibe **`4001`** y **no queda ninguna sesión** guardada.

---

## Flujo 10 — Sitios conectados y revocación

**Pantalla: pestaña «Sitios».**

1. Abre **«Sitios»** (o pulsa **«Actualizar lista»**).

**Qué debes ver:** la lista **«Sitios conectados»** («Cargando los sitios conectados…» mientras carga) con una fila por origen que incluye:
el **origen normalizado** a minúsculas y sin barra final, la **cuenta compartida**, el **favicon** del sitio y el estado de la sesión: **«Vigente, sin caducidad»** o **«Vencida: la dApp tendrá que pedir la conexión otra vez»** (la sesión dura **24 h renovables** con cada uso).

**Si no hay ninguna dApp conectada:** la lista aparece vacía con su estado vacío, sin error.

2. Escribe (o confirma) el origen en **«Revocar un permiso por origen»** y pulsa **«Revocar permiso»**.
3. Confirma en el diálogo **«Se eliminará la sesión de …»**.

**Qué debes ver:** el aviso de revocación, la fila desaparece de la lista y, en la dApp, `eth_accounts` vuelve a devolver **`[]`** y recibe `disconnect`/`accountsChanged` según corresponda. La cuenta revocada **ya no bloquea** su revelado ni su borrado (`-32000` desaparece).

---

## Flujo 11 — Redes: listar, cambiar y dar de alta

**Pantalla: pestaña «Redes».**

### 11.1 Listar y cambiar de red

1. Abre **«Redes»**.

**Qué debes ver:** **«Redes dadas de alta»** con una fila por red: nombre, **chainId**, símbolo, marcas **«Activa»**, **«Predeterminada»**, **«Red de pruebas»** / **«Red real»**, y la opción de **cambiar** a esa red. Con solo la red local verás una fila; si no hay ninguna: «Todavía no hay ninguna red dada de alta.»

2. Pulsa el cambio a otra red de la lista.

**Qué debes ver**

- Se abre la ventana de confirmación (Flujo 13) explicando el cambio de red; al aprobar, la red activa cambia y **todas** las pestañas conectadas reciben `chainChanged`.
- El popup refleja la nueva red activa y los saldos se releen contra el nuevo nodo.
- Si pulsas la red **que ya está activa**: **no** se abre ninguna ventana y no cambia nada (respuesta inmediata).

### 11.2 Dar de alta una red nueva

1. Rellena **«Dar de alta una red nueva»**: **«Nombre de la red»** (hasta 64 caracteres), **«chainId»** (en hexadecimal `0x7a6a` o decimal `31338`), **«Símbolo de la moneda nativa»** (1–8 caracteres, p. ej. ETH), la **URL del nodo**, el **explorador** (opcional) y la casilla **«Es una red de pruebas (testnet)»**.

**Qué debes ver (validación en línea, antes de enviar)**

| Si… | Mensaje |
|---|---|
| La URL no es válida | «La dirección del nodo no es una URL válida.» |
| La URL no tiene host | «La dirección del nodo no incluye host.» |
| El host es privado o local (`localhost`, `127.0.0.1`, rangos privados) | «No se admiten hosts privados ni de enlace local.» |
| Falta el nombre / supera 64 caracteres | «Escribe el nombre de la red.» / «El nombre no puede superar los 64 caracteres.» |
| Falta el chainId o no es hex/decimal | «Escribe el chainId en hexadecimal (0x7a6a) o en decimal (31338).» |
| El símbolo está mal | «El símbolo debe tener entre 1 y 8 caracteres visibles (por ejemplo ETH).» |

2. Pulsa **«Dar de alta la red»**.

**Qué debes ver:** se pide el **permiso de host** del navegador para ese dominio (aviso nativo de Chrome) y, si lo concedes, la red se añade a la lista **marcada como inactiva**. **Dar de alta NO activa la red**: para usarla hay que cambiarse a ella (§11.1).

3. Marca la casilla **«Es una red de pruebas (testnet)»** o déjala vacía.

**Qué debes ver:** si das de alta una **red real** (sin la casilla), aparece una **advertencia** de que no es una red de pruebas. Si **deniegas** el permiso de host, la operación se cancela con **`4001`** y **no se persiste** ninguna red.

> **Nodo secundario para practicar:** `anvil --host 127.0.0.1 --port 8546 --chain-id 31338 --allow-origin "*"` y da de alta esa red para probar el cambio entre dos redes locales.

---

## Flujo 12 — Actividad: panel de registro y exportación

**Pantalla: pestaña «Actividad».**

1. Abre **«Actividad»** (o pulsa **«Actualizar registro»**).

**Qué debes ver:** **«Panel de actividad»** con **«Entradas del registro»** («Cargando el registro de actividad…» mientras carga) y sus filtros:
**«Nivel»** (Todos los niveles / Información / … / Error), **«Categoría»** (Todas las categorías / Transacción / …) y el botón **«Exportar el histórico en JSON»**.
Cada entrada muestra **fecha y hora**, **nivel**, **categoría**, el **evento**, el **origen** y el **método RPC** cuando lo hay («sin método RPC» si no aplica).

2. Filtra por nivel **Error**.

**Qué debes ver:** las entradas de error **en rojo** con su **`code`** EIP-1193 visible, para que el diagnóstico sea inmediato.

3. Realiza alguna operación (conectar, enviar, firmar) y vuelve a **Actividad**.

**Qué debes ver:** la operación registrada con su **hash** o su **firma** cuando corresponde. El registro funciona **también con el popup cerrado** (lo escribe el Service Worker). Se conservan las **500** entradas más recientes (200 por origen) y, si el almacén se recorta o se agota la cuota, aparece un aviso de que **el registro está recortado** con la acción «exporta el histórico y borra los logs para liberar espacio».

4. Pulsa **«Exportar el histórico en JSON»**.

**Qué debes ver:** se descarga un fichero **JSON** con las entradas. La exportación es **local**: no hay ninguna petición de red.

> **Privacidad:** el registro **nunca** contiene la semilla, ninguna clave privada ni el contenido íntegro de lo firmado (solo hashes, longitudes y metadatos de la transacción).

---

## Flujo 13 — Aprobar o rechazar una solicitud de firma

**Pantalla: ventana de confirmación (`notification.html`).** Se abre cuando una dApp (o el propio popup) pide algo que hay que firmar.

**Qué debes ver siempre**

- El encabezado **TrueKeate Wallet** y el título **«Solicitud pendiente»** / **«Confirmación de la solicitud»**.
- El **origen solicitante** (de dónde viene la petición), el **destino**, el **valor**, la **red** y la **comisión estimada**.
- Los botones **«Aprobar»** y **«Rechazar»** (alcanzables **solo con el teclado**, con foco visible).
- Si hay más de una solicitud pendiente, el **contador** («2 solicitudes en espera»); **nunca** se muestran dos solicitudes a la vez: al resolver una, aparece la siguiente **en la misma ventana**.

**Qué cambia según lo que se firme**

| Tipo de solicitud | Qué se muestra además |
|---|---|
| **Transacción** (`eth_sendTransaction`) | La **vista previa decodificada**: si es una llamada a contrato, el **selector**, el **nombre de la función** y los **parámetros legibles**; si el destino es un contrato conocido, su etiqueta; y **avisos de riesgo** en aprobaciones peligrosas (`approve`, `setApprovalForAll`, importe ilimitado, selector desconocido). |
| **Datos firmados EIP-712** (`eth_signTypedData_v4`) | El **dominio** y el mensaje en JSON legible, con `name` y `verifyingContract` visibles y aviso si **no coinciden** con lo declarado. |
| **Mensaje personal** (`personal_sign`) | El **texto UTF-8** interpretado y un aviso si el contenido es **hexadecimal ilegible**. |
| **Cambio de red** (`wallet_switchEthereumChain`) | El nombre y el chainId de la red de destino. |
| **Alta de red** (`wallet_addEthereumChain`) | Los datos de la red que se va a añadir y la advertencia si **no** es red de pruebas. |
| **Revocación** (`wallet_revokePermissions`) | El origen cuyo permiso se va a revocar. |

1. Pulsa **«Aprobar»**.

**Qué debes ver:** la ventana se cierra (o muestra la siguiente solicitud), y quien pidió la firma recibe el resultado: el **hash** de la transacción o la **firma** `0x…`.

**Aviso «Antes de tu primera firma» (solo la primera vez).** La primera vez que apruebas una firma con una cartera recién creada, la ventana muestra antes un aviso con el título **«Antes de tu primera firma»**, el texto que explica que vas a firmar con la clave que guarda la extensión y la advertencia de entorno («Esto es un entorno de desarrollo con red local: no firmes operaciones con fondos reales»). El botón **«Aprobar»** queda **deshabilitado** hasta que marcas la casilla de acuse **«He leído el aviso y quiero firmar por primera vez con esta cartera.»**; una vez aceptado, el aviso **no vuelve a aparecer** (la aceptación queda registrada en la configuración de la cartera).

**Alternativas que también cuentan como rechazo (`4001`)**: pulsar **«Rechazar»**, **cerrar la ventana** sin decidir, o dejar pasar el **plazo de 120 s**. En los tres casos **no se firma nada** y el estado queda limpio (sin solicitudes huérfanas, sin doble difusión).

---

## Flujo 14 — Reset de la cartera

**Pantalla: pestaña «Seguridad» → «Reset de la cartera».**

1. Abre **Seguridad** y pulsa **«Reset wallet»**.

**Qué debes ver (según el estado)**

- **Con la cola vacía y sin transacciones en vuelo:** un diálogo destructivo que enumera, **por nombre**, **qué se va a perder**: la frase de recuperación, las cuentas derivadas y las sesiones de dApps; y, si las hay, la lista **«Estas cuentas importadas se perderán y no se pueden volver a derivar:»** con la advertencia «Si no has exportado su clave privada, guárdala antes de continuar.» Si no hay importadas: «No hay cuentas importadas: solo se perderá la cartera derivada.»
- **Con solicitudes pendientes o una transacción en vuelo:** el reset **se bloquea** con **`-32000`**, sin abrir el diálogo destructivo, indicando **cuántas** solicitudes quedan y ofreciendo **resolverlas** (aprobando o rechazando) o **esperar** a que expiren.

2. Confirma el reset.

**Qué debes ver:** el popup vuelve a la **pantalla inicial** (bienvenida) con el aviso **«Cartera reseteada»**; el aviso de entorno de desarrollo **vuelve a mostrarse** la próxima vez (se ha borrado la configuración). El **registro de actividad** (`truekeate_logs`) **se conserva**: es un histórico de diagnóstico, no material de cartera.

---

## Flujo 15 — La dApp de pruebas (`test.html`)

Abre **`http://localhost:5174/test.html`** con la extensión cargada y Anvil en marcha. La página recorre **7 flujos** y muestra **el resultado en pantalla** de cada uno (medido en **< 5000 ms**):

| # | Flujo | Qué debe verse |
|---|---|---|
| 1 | **Detectar el provider** | `window.truekeate` presente y anuncio EIP-6963 con la identidad «TrueKeate». |
| 2 | **Conectar** | Ventana de conexión → `eth_requestAccounts` devuelve la cuenta elegida; queda sesión en **Sitios**. |
| 3 | **Leer el saldo** | `eth_getBalance` con el saldo de la cuenta compartida contra Anvil. |
| 4 | **Enviar** | Ventana de confirmación con la vista previa → aprobar → **hash** y recibo con estado correcto. |
| 5 | **Firmar EIP-712** (`eth_signTypedData_v4`) | Ventana con el dominio y el mensaje → firma verificable (la comprueba también el contrato Forge). |
| 6 | **Cambiar de red** (`wallet_switchEthereumChain`) | Ventana de aprobación → la dApp recibe `chainChanged` con la nueva red. |
| 7 | **Eventos** | `accountsChanged` / `chainChanged` visibles en la página al cambiar de cuenta o de red desde el popup. |

Los errores se muestran en la propia página con su **código** y la **acción sugerida** (`4001`, `4900`, `4901`, `4100`, `4200`, `-32000`, `-32602`, `-32603`).

---

## 18. Avisos del sistema y qué NO hace la wallet

### 18.1 El diálogo «Acerca de»

Las **tres ventanas** (popup, conexión y confirmación) llevan en su cabecera un botón pequeño **«Acerca de»** que abre un diálogo informativo y **descartable** (se cierra con **«Cerrar»**, con `Escape` o pulsando el fondo; no bloquea ninguna operación de cartera).

**Qué debe verse dentro**

- El **logotipo horizontal** de TrueKeate (`brand/truekeate-titulo.png`) sobre superficie elevada — el wordmark nunca se retipea con una fuente del sistema.
- La **tagline** exacta: `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS`.
- El resumen del producto (monedero Ethereum no custodial para la red local de pruebas) y la **versión**.
- El **aviso de entorno** («Entorno de desarrollo — no usar con fondos reales…»), el mismo del primer arranque, para que siga visible cuando ya se aceptó.
- La sección **«Licencias y avisos legales»** con la referencia a `LICENSE` y `NOTICE`.

### 18.2 Los tres momentos del aviso de entorno (RNF-23)

1. **Primer arranque** (§ Flujo 1): aviso no descartable, con aceptación registrada.
2. **En «Acerca de»** (§18.1): el mismo aviso, siempre consultable.
3. **Antes de la primera firma** (§ Flujo 13): aviso con casilla de acuse que bloquea «Aprobar» hasta aceptarlo.

Además, al dar de alta una red **sin** marcar `isTestnet` aparece la **advertencia de red real** (§11.2).

### 18.3 Fuera del alcance de esta versión

Los **10 requisitos *Should*** (planificados para el ciclo posterior `C1..C10` de `RepoTecnico/plan_desarrollo.md` §4), **no promocionados** al MVP: **badge** de contador en el icono, **notificaciones del navegador**, **borrado** de cuentas importadas, **hint interactivo** de la frase de Anvil, **historial persistente** que sobreviva al reset, **EIP-6963 ampliado** con re-anuncio, **historial de la operación** en la dApp y **validación del ciclo de vida del plazo** (el mecanismo ya se construyó en H4).

> El diálogo **«Acerca de»** de §18.1 existe porque **RNF-23 lo exige** como superficie del aviso de entorno; de paso muestra el logotipo y la tagline. La **pantalla completa** de «Acerca de» como requisito independiente (RF-48) sigue en el ciclo posterior y **no** se declara cerrada aquí.

---

## 19. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| La tarjeta de `chrome://extensions` muestra «Errores» | Algún fichero de `dist/` está incompleto: recompila (`npm run build`) y pulsa **↻**. |
| El popup abre y no muestra saldos; aparece «desconectado» | Anvil no está en marcha: arráncalo con `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"`. **No uses `--silent`** (con la salida redirigida el nodo no arranca). |
| Toda la suite E2E falla con `ERR_CONNECTION_REFUSED` | Es lo mismo: mira primero si Anvil responde (`cast chain-id --rpc-url http://127.0.0.1:8545` ⇒ `31337`). |
| `http://localhost:5174/test.html` no responde | El servidor de la dApp se arranca con `npm run dev` (puerto 5174). Si lanzaste Vitest a la vez, reinícialo: el vigilante de Vite se reinicia al escribir en `src/`. |
| Al conectar, la dApp se queda esperando | Mira la ventana de conexión: si está detrás de la ventana principal, tráela al frente. El plazo es de **60 s**; al vencer llega `4001`. |
| `4901 Red no reconocida` | La dApp pidió una red que no está dada de alta: dala de alta primero (§11.2). |
| El error `4100` aparece al llamar a un método `wallet_*` | Es un método **interno** de la extensión: una página web no puede llamarlo (allowlist cerrada). |
| La importación de una clave privada falla con `-32602` | Formato incorrecto (debe ser `0x` + 64 hex) o la cuenta ya existe. |
| `-32000` con «Cuenta en uso por una dApp conectada» | Revoca el permiso de ese origen en **Sitios** y repite la operación. |
| `-32000` con «Reset bloqueado» | Hay solicitudes pendientes o una transacción en vuelo: resuélvelas (aprueba/rechaza) o espera a que expiren. |
| La frase semilla reaparece copiada | Vuelve a enfocar la ventana del popup: el borrado diferido del portapapeles se ejecuta al recuperar el foco y se avisa en pantalla. |
| El panel de Actividad avisa de que está recortado | Se superaron 500 entradas (200 por origen) o cuota del almacén: exporta el JSON y borra el registro. |

---

## 20. Glosario de códigos de error

| Código | Significado | Acción sugerida |
|---|---|---|
| **`4001`** | El usuario rechazó, se cerró la ventana, venció el plazo (120 s firma / 60 s conexión) o se denegó el permiso de host. | Repetir la operación si fue un despiste. |
| **`4100`** | Origen no autorizado, o método interno invocado desde un contexto no permitido. | Conectar primero la dApp (`eth_requestAccounts`); los métodos `wallet_*` son internos. |
| **`4200`** | Método fuera del catálogo (incluye `eth_sign`) o método interno fuera de contexto. | Usar `personal_sign` en lugar de `eth_sign`. |
| **`4900`** | La cartera no puede hablar con el nodo RPC. | Arrancar/verificar Anvil. |
| **`4901`** | La red pedida no está dada de alta. | Darla de alta en **Redes**. |
| **`-32000`** | Conflicto de estado: el nodo rechaza la operación (saldo, nonce, revert) **o** una guarda de la cartera la bloquea (cuenta en uso por una dApp, reset con cola). | Corregir la llamada, revocar el permiso o resolver la cola. |
| **`-32602`** | Parámetros inválidos: mnemonic, clave privada, dirección malformada, cuenta duplicada o payload > 64 KiB. | Revisar el dato de entrada que señala el mensaje. |
| **`-32603`** | Error interno de la cartera (incluida la cuota del almacén agotada). | Reintentar; si persiste, exportar la actividad y reiniciar la extensión. |

Todos los errores llegan con **`code` numérico**, **causa** y **acción sugerida** en español: nunca un mensaje opaco.
