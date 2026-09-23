# 📖 Instrucciones — CodeCrypto Wallet

Guía completa para **instalar, ejecutar y verificar** la extensión de wallet
Ethereum del proyecto, desde cero.

> **Resumen en 5 comandos** (si ya tienes Node y Foundry instalados):
>
> ```bash
> npm install        # 1. dependencias
> npm run chain      # 2. blockchain local (anvil) → déjalo en su propia terminal
> npm run build      # 3. compila la extensión en dist/
> npm test           # 4. 45 comprobaciones automáticas
> npm run dev        # 5. sirve test.html en http://localhost:5173/test.html
> ```
> Después carga `dist/` en `chrome://extensions` (paso 4 de esta guía).

---

## 1. Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| **Node.js** | 20 o superior | Compilar la extensión (Vite + TypeScript) |
| **Chrome o Edge** | Manifest V3 | Ejecutar la extensión |
| **Foundry** | última (`anvil` 1.x) | Blockchain local de desarrollo |

### Instalar Foundry (una sola vez)

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

> Si `anvil` no queda en tu `PATH`, no pasa nada: los scripts del proyecto
> (`npm run chain`, `npm run contracts:*`) lo localizan automáticamente mediante
> `scripts/foundry.sh`. También puedes añadirlo a mano:
> `export PATH="$PATH:$HOME/.foundry/bin"`.

Verifica que todo está listo:

```bash
node -v          # v20.x o superior
npm -v
bash scripts/foundry.sh anvil --version
```

---

## 2. Instalación de dependencias

```bash
npm install
```

Instala React 19, Ethers.js v6, Vite, TypeScript y las herramientas de lint y tipos.

---

## 3. Arrancar la blockchain local (anvil)

En **una terminal propia** (déjala abierta durante las pruebas):

```bash
npm run chain
```

Esto levanta `anvil` en `http://127.0.0.1:8545` con **chainId 31337** y 10 cuentas
con 10 000 ETH cada una.

```
Mnemonic: test test test test test test test test test test test junk
```

Ese mnemonic es **el mismo que usa la wallet como frase de prueba**, así que las 5
cuentas derivadas coinciden con las del nodo (cuenta 0 =
`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`).

---

## 4. Compilar y cargar la extensión en Chrome

```bash
npm run build
```

Se genera `dist/` con `dist/manifest.json`, `dist/background.js`, los content scripts y el popup.

1. Abre Chrome → `chrome://extensions/`
2. Activa **"Modo de desarrollador"** (arriba a la derecha)
3. Pulsa **"Cargar descomprimida"**
4. Selecciona la carpeta **`dist/`** del proyecto
5. Fija la extensión en la barra (icono de rompecabezas → 📌) para ver el badge

> Tras cada cambio en el código: `npm run build` y luego el botón **⟳ Recargar**
> de la tarjeta de la extensión.

---

## 5. Servir la dApp de prueba (`test.html`)

`test.html` es una página de pruebas incluida en el proyecto. Necesita servirse por
HTTP (no funciona abriéndola con `file://`, porque los content scripts no se
inyectan en ese esquema).

```bash
npm run dev        # servidor de Vite
```

Ábrela en **<http://localhost:5173/test.html>**.

> Alternativa sin Vite: `npx serve .` y abre el puerto que indique.

### Despliegue local en un solo comando

Para levantar la cadena y el servidor web de golpe:

```bash
bash scripts/local-deploy.sh start     # compila y arranca anvil + servidor web
bash scripts/local-deploy.sh status    # comprueba que ambos responden
bash scripts/local-deploy.sh logs      # muestra los registros
bash scripts/local-deploy.sh stop      # detiene los servicios
```

Los servicios escuchan en `127.0.0.1`, así que **si tu Chrome no está en la misma
máquina** abre antes un túnel SSH desde tu equipo:

```bash
ssh -L 5173:127.0.0.1:5173 -L 8545:127.0.0.1:8545 <usuario>@<host>
```

Después carga la extensión (paso 4) y abre <http://localhost:5173/test.html>.

---

## 6. Primer uso de la wallet

Tienes dos caminos: **importar** una frase existente o **crear** una wallet nueva.

### 6.1 Importar una frase de recuperación

1. Pulsa el icono de **CodeCrypto Wallet** en la barra de Chrome.
2. Pega la frase de prueba (o haz clic en el **hint verde** que la autocompleta):
   `test test test test test test test test test test test junk`
3. Mientras escribes, la wallet valida la frase en vivo (12 palabras, diccionario
   BIP-39 y checksum): si es correcta verás **"✅ Frase BIP-39 válida"** y el botón
   se habilita.
4. Pulsa **"Cargar Wallet"**.

### 6.2 Crear una wallet nueva

1. Pulsa **"✨ Crear una wallet nueva"**.
2. Aparecen las **12 palabras generadas**. Cópialas con el botón o anótalas en papel.
3. Pulsa **"Ya la he guardado"**.
4. La wallet pide **3 palabras al azar** para confirmar que hiciste copia; escríbelas
   y pulsa **"Crear wallet"**.

> Las palabras solo se muestran en ese momento: si cierras el popup sin confirmarlas,
> la wallet no se crea y deberás generar otra.

### 6.3 Qué verás con la wallet cargada

- La **cuenta 0** seleccionada, con su dirección y balance (**10 000 ETH** si anvil está corriendo)
- El selector para **cambiar de cuenta** (5 cuentas derivadas)
- La sección de **red** con un botón por red disponible y el alta de redes nuevas
- El formulario de **transferencia entre cuentas**
- El **panel de actividad**, que muestra tanto tus acciones como lo que hacen las dApps

### 6.4 Añadir una red

1. En la sección **Red**, pulsa **"➕ Añadir red"**.
2. Rellena **nombre**, **URL del RPC** (obligatoria), **chain ID** (en decimal o hex),
   **símbolo** y, si quieres, el explorador.
3. Pulsa **"💾 Añadir red"**: Chrome pedirá **permiso para ese RPC** (solo ese, no
   para todo internet). Después la wallet comprueba que el RPC responde con el
   chainId indicado y, si coincide, añade la red y **cambia a ella**.

Ejemplo de red de prueba (Polygon Amoy): RPC `https://rpc-amoy.polygon.technology`,
chain ID `80002`, símbolo `POL`.

### 6.5 Transferir entre cuentas propias

1. En *Transferir entre Cuentas*, elige la cuenta destino (por defecto la siguiente)
2. Escribe el importe, p. ej. `0.5` (ETH)
3. Pulsa **💸 Transferir** y aprueba en la ventana de confirmación

El formulario valida en vivo: formato del importe, que sea mayor que 0, que la
cuenta destino sea distinta y que **no superes el saldo disponible**.

### 6.6 Panel de actividad

Muestra con color por tipo (llamadas, eventos, errores, mensajes) la actividad de la
wallet **y la de las dApps**: `eth_requestAccounts`, `eth_sendTransaction`, cambios
de cuenta y de red, aprobaciones, hashes de transacción y errores. Se guardan las
últimas **200 entradas** y el botón **🗑️ Limpiar** vacía el historial.

### 6.7 Reset de la wallet

El botón **🔄 Reset Wallet** borra mnemonic, cuentas, red, sitios autorizados, redes
personalizadas y solicitudes pendientes (además de cerrar las ventanas de aprobación
abiertas). El **historial de actividad se conserva** entre resets.

---

## 7. Probar desde una dApp (`test.html`)

Con la wallet cargada, en la misma pestaña de `test.html`:

| Acción | Qué ocurre |
|---|---|
| **Conectar Wallet** | Se abre `connect.html` (420×650) con las 5 cuentas, su balance y el origen de la solicitud. Eliges una y pulsas **Conectar**. |
| **Enviar Transacción** | Se abre `notification.html` (400×600) con *Para*, *Valor*, *Data* y *Red*. Al aprobar, el background firma y envía con EIP-1559. |
| **Firmar Mensaje EIP-712** | Se abre `notification.html` con el JSON del mensaje y del dominio. Devuelve una firma de 132 caracteres. |
| **Cambiar de red** | Botones para anvil 31337 y Sepolia; las dApps reciben `chainChanged`. |
| **Desconectar** | Olvida la conexión sin recargar la página. |

### Cómo se comporta la aprobación (igual que MetaMask)

1. 🔔 Aparece un **badge naranja** con el número de solicitudes pendientes
2. 🔔 Se muestra una **notificación de Chrome** y se **abre la ventana** de confirmación
3. 👤 Apruebas o rechazas viendo todos los detalles
4. ✅ Solo entonces el service worker firma y responde a la dApp

Detalles de robustez ya implementados:

- La dApp espera hasta **130 s** (la aprobación caduca a los **120 s**), así que
  nunca aborta antes de que puedas decidir
- Si Chrome duerme el service worker, la solicitud **se conserva** y la ventana se reabre
- Si cierras la ventana con la ✕, la solicitud se **rechaza al instante** y el badge se apaga
- Rechazar devuelve un error legible a la dApp (no un `null`)

---

## 8. Verificación: los 11 casos de prueba del enunciado

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | Inicialización | Cargar el mnemonic de prueba | 5 cuentas, 10 000 ETH, cuenta 0 activa, chainId 0x7a69 |
| 2 | Persistencia | Cerrar el navegador y reabrir | No vuelve a pedir el mnemonic; misma cuenta y red |
| 3 | Conexión desde dApp | test.html → Conectar Wallet | Se abre `connect.html` con 5 cuentas y balances; la elegida pasa a ser la activa |
| 4 | Transacción | test.html → Enviar Transacción → Aprobar | `notification.html` muestra Para/Valor/Red; anvil registra la transacción y test.html muestra el hash |
| 5 | Firma EIP-712 | test.html → Firmar Mensaje | JSON formateado con scroll; firma de 132 caracteres |
| 6 | Cambio de cuenta | Popup → cambiar cuenta | test.html recibe `accountsChanged` y actualiza la UI |
| 7 | Cambio de red | Popup → Sepolia | test.html recibe `chainChanged` |
| 8 | Reset | Popup → Reset Wallet | Vuelve a pedir mnemonic; storage de la wallet vacío; los logs se conservan |
| 9 | Transferencia interna | Transferir 1 ETH de la cuenta 0 a la 1 | La cuenta 0 pierde 1 ETH + gas; la 1 los recibe; se muestra el hash |
| 10 | Badge y notificación | Con el popup cerrado, enviar TX desde test.html | Badge "1", notificación de Chrome y ventana abierta; al aprobar, el badge desaparece |
| 11 | Selección de cuenta al conectar | Conectar eligiendo la Cuenta 3 | `connect.html` muestra el origen y los balances; la Cuenta 3 queda activa en el popup |

---

## 9. Pruebas automatizadas

```bash
npm test                  # las cuatro baterías (92 comprobaciones)
npm run test:acceptance   # los 11 casos del enunciado contra anvil real (50)
npm run verify            # build + todas las pruebas
```

| Comando | Qué comprueba |
|---|---|
| `npm run test:amount` | Conversión exacta ETH → wei y validaciones del importe (**20**) |
| `npm run test:contracts` | Contrato de ejemplo con `forge test` (**6**) |
| `npm run test:background` | Service worker compilado con las APIs de `chrome` simuladas: permisos por origen, migración, persistencia de pendientes, cierre de ventanas, reset, validación BIP-39, generación de wallet, alta de redes, códigos de error EIP-1193, bus de logs y formato de los bundles (que los content scripts sigan siendo scripts clásicos) (**41**) |
| `npm run test:acceptance` | **Los 11 casos de la sección 8** contra un nodo anvil real: arranca el nodo, envía transacciones que se minan de verdad, verifica la firma EIP-712 recuperando la dirección, comprueba los eventos y la regla del Reset (**50**) |
| `npm run test:vault` | Bóveda cifrada del mnemonic de la integración con TrueKeate (**25**) |
| `npm run test:extension` | **Smoke test en un Chrome real** (requiere `npm i -D puppeteer`): instala `dist/`, comprueba que el service worker MV3 se registra, que `window.codecrypto` se inyecta, que EIP-6963 se anuncia y que una petición RPC recorre todo el puente hasta anvil y vuelve (**7**) |
| `npm run lint` | ESLint sobre todo el repositorio (**0 errores, 0 warnings**) |

`npm run test:acceptance` deja la evidencia de la ejecución (con hashes, gas y
balances) en `documentacion/evidencia-fase4.md`, y la valoración frente a la
rúbrica de 100 puntos en `documentacion/AUTOEVALUACION.md`.

En total son **149 comprobaciones** automáticas (92 + 50 + 7). Lo que no se puede automatizar
(ventanas reales, notificación de Chrome, aspecto visual) se verifica a mano
siguiendo la sección 8.

---

## 10. Contratos de ejemplo con Foundry

```bash
npm run contracts:build    # compila contracts/
npm run contracts:test     # 6 pruebas
npm run contracts:deploy   # despliega WalletPlayground en anvil
```

Con el contrato desplegado puedes practicar transacciones **con `data`** desde la
wallet (el popup y `test.html` envían `eth_sendTransaction`):

```bash
bash scripts/foundry.sh cast call <DIRECCIÓN> "counter()(uint256)" --rpc-url local
bash scripts/foundry.sh cast send <DIRECCIÓN> "setCounter(uint256)" 7 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url local
```

> La clave privada del comando es la cuenta 0 por defecto de anvil, pública y solo
> válida para desarrollo local.

---

## 11. Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| `Balance: 0.000000 ETH` | anvil no está corriendo → `npm run chain` en otra terminal |
| `Cannot get balance: … Make sure anvil is running` | Mismo caso: arranca el nodo local |
| `No accounts available` | No has cargado el mnemonic en el popup (`Cargar Wallet`) |
| `window.codecrypto` no aparece en la consola de la dApp | Recarga la página tras instalar/recargar la extensión |
| La dApp no detecta la wallet en `file://` | Sirve la página por HTTP (`npm run dev` → puerto 5173) |
| `Method not implemented` | La dApp usa un método RPC que la wallet no soporta (ver README) |
| La ventana de aprobación no se abre | Revisa los permisos de ventanas y la consola del service worker (`chrome://extensions` → *Service worker*) |
| El badge se queda encendido | La solicitud sigue pendiente; ábrela desde el popup o deja que caduque (120 s) |
| `Permiso denegado para http://…/*` al añadir una red | Rechazaste el permiso del RPC: vuelve a añadir la red y acepta el diálogo |
| `El RPC responde con chainId X, no con Y` | El chain ID escrito no coincide con el de la red; revisa el dato en el explorador de esa red |
| `Unrecognized chain ID` al conectar desde una dApp | La dApp pide una red que no está añadida: añádela en el popup y reintenta |
| Nada funciona tras cambiar el código | `npm run build` y luego **⟳ Recargar** en `chrome://extensions` |

---

## 12. Estructura del proyecto

```
├── src/                    Código fuente (100 % TypeScript)
│   ├── background.ts       Service worker: RPC, aprobaciones, firma
│   ├── inject.ts           Provider EIP-1193 (window.codecrypto)
│   ├── content-script.ts   Puente página ↔ extensión
│   ├── App.tsx             Popup principal
│   ├── Connect.tsx         Ventana de conexión de dApps
│   ├── Notification.tsx    Ventana de aprobación
│   ├── manifest.ts         Manifest V3 (genera dist/manifest.json)
│   └── utils/amount.ts     Conversión exacta ETH ↔ wei
├── contracts/              Contrato de ejemplo (Foundry)
├── test/                   Pruebas del contrato (forge test)
├── scripts/                Utilidades: iconos, pruebas, lanzador de Foundry
├── viewextensiondata/      Visor de chrome.storage.local
├── documentacion/          Plan de mejora e histórico del desarrollo
├── test.html               dApp de pruebas
├── dist/                   Extensión compilada (generada por `npm run build`)
└── foundry.toml            Configuración de Foundry
```

---

## 13. Notas de seguridad

- El **mnemonic se guarda cifrado con contraseña** (AES-256; clave derivada con
  PBKDF2-SHA256 de 600 000 iteraciones) y la wallet pide desbloquear. *(Antes se guardaba sin cifrar en `chrome.storage.local` y no pedía
  contraseña: es un requisito del enunciado para simplificar el desarrollo.
- **No uses frases de recuperación reales ni fondos reales.** El proyecto es una
  demo educativa, no una wallet de producción.
- La frase de prueba (`test test … junk`) es pública y sus claves son conocidas:
  cualquiera puede mover esos fondos en una red pública.

---

## 14. Errores que reciben las dApps (EIP-1193)

Cuando una petición falla, el proveedor rechaza la promesa con un `Error` cuyo
`.code` sigue el estándar, así que una dApp puede reaccionar sin leer el mensaje:

| Código | Significado | Ejemplo |
|---|---|---|
| `4001` | El usuario rechazó la solicitud | Cerraste la ventana de confirmación o dejaste caducar la aprobación |
| `4100` | Cuenta no autorizada | La wallet no está configurada o el sitio no está conectado |
| `4200` | Método no soportado | La dApp pidió un método que la wallet no implementa |
| `4902` | Red desconocida | `wallet_switchEthereumChain` a una red que no está añadida |
| `-32602` | Parámetros inválidos | Un chainId con formato incorrecto o un RPC que no coincide |
| `-32000` | Recurso no disponible | El RPC no responde (¿olvidaste `npm run chain`?) |
| `-32603` | Error interno | Fallo inesperado del service worker |

```javascript
try {
  await window.codecrypto.request({ method: 'eth_sendTransaction', params: [tx] })
} catch (error) {
  if (error.code === 4001) console.log('El usuario canceló la operación')
  else if (error.code === 4902) console.log('Hay que añadir esa red primero')
}
```

---

## 15. Entrega del proyecto

```bash
bash scripts/package-delivery.sh            # → codecrypto_wallet_entrega.zip
bash scripts/package-delivery.sh mi_nombre_wallet.zip   # con tu nombre
```

El script compila la extensión y empaqueta:

| Incluye | Detalle |
|---|---|
| `src/`, `public/`, `contracts/`, `test/`, `scripts/` | Código fuente completo en TypeScript (+ contrato y pruebas de Foundry) |
| `dist/` | **Extensión ya compilada**, lista para cargar sin ejecutar nada |
| `documentacion/` | Plan de mejora, evidencia de las pruebas y autoevaluación |
| Raíz | `README.md`, `INSTRUCCIONES.md`, `CHANGELOG.md`, `GUIA_RAPIDA_TESTING.md`, `TAREA_PARA_ESTUDIANTE.md`, `package.json`, configuraciones y las páginas HTML |

| Excluye | Motivo |
|---|---|
| `node_modules/` | Se reinstala con `npm install` |
| `documentacion/historial/` | Material de trabajo (incluye 8,2 MB de volcado de chat), no forma parte de la entrega |
| `out/`, `cache/`, `broadcast/` | Artefactos de compilación de Foundry |

Tras descomprimir, el evaluador solo necesita `npm install`, `npm run chain` y cargar
`dist/` en Chrome (pasos 3 y 4 de esta guía).
