# 🎓 PROYECTO: Construcción de una Wallet Ethereum como Extensión Chrome

## 📋 DESCRIPCIÓN DE LA TAREA

**Este documento describe el proyecto completo que debes desarrollar.**

Se trata de construir una **extensión de navegador Chrome** que funcione como una **wallet (billetera) de criptomonedas Ethereum**, similar a MetaMask, implementando los estándares más importantes del ecosistema Web3.

**Tecnologías:** React, TypeScript, Ethers.js, Chrome Extension APIs

---

## 🎯 OBJETIVOS DE APRENDIZAJE

Al completar este proyecto, habrás aprendido:

### 1. Desarrollo de Extensiones Chrome (Manifest V3)
- ✅ Service Workers (background scripts)
- ✅ Content Scripts e Inject Scripts
- ✅ Comunicación entre componentes (chrome.runtime.sendMessage)
- ✅ Persistencia con chrome.storage.local
- ✅ Gestión de ventanas y popups
- ✅ Permisos y host_permissions

### 2. Criptografía y Blockchain
- ✅ Generación de mnemonics BIP-39 (12 palabras)
- ✅ Derivación de claves HD (BIP32, BIP-44)

### 3. Estándares Web3 (EIPs)
- ✅ EIP-155: Replay Protection for Transactions
- ✅ EIP-1193: Ethereum Provider API
- ✅ EIP-712: Typed Structured Data Signing
- ✅ EIP-1559: Fee Market Change
- ✅ EIP-6963: Multi Injected Provider Discovery

### 4. Arquitectura de Software
- ✅ Separación de responsabilidades
- ✅ Comunicación asíncrona
- ✅ Manejo de estado
- ✅ Event-driven architecture
- ✅ Error handling robusto

### 5. React + TypeScript
- ✅ Componentes funcionales
- ✅ Hooks (useState, useEffect)
- ✅ Type safety
- ✅ Event handling

### Requisitos Funcionales (36 especificaciones)

#### Parte 1: Core Wallet (1-6)

1. **Mnemonic BIP-39**: Generar/importar frase de recuperación de 12 palabras
2. **Carga Sin Contraseña**: Acceso directo con la frase (para desarrollo)
3. **Provider window.codecrypto**: Inyectar proveedor Ethereum en todas las páginas web
4. **Solo Ethers.js**: Usar únicamente la librería ethers.js v6 (sin viem, sin @scure/bip39, sin fetch, axios)
5. **React + TypeScript**: Interfaz de usuario con React 19 y TypeScript
6. **RPC por Defecto**: Conectar a localhost:8545 (Hardhat) con chainId 0x7a69 (31337)

#### Parte 2: Operaciones Blockchain (7-10)

7. **eth_sendTransaction**: Firmar y enviar transacciones a la blockchain
8. **eth_signTypedData_v4**: Firmar mensajes estructurados según EIP-712
9. **Inyección Global**: window.codecrypto disponible en todas las páginas
10. **Evento accountsChanged**: Notificar a dApps cuando cambia la cuenta activa

#### Parte 3: UX y Logging (11-16)

11. **Polling de Saldos**: Actualizar balance cada 5 segundos
12. **Compatibilidad**: Chrome y Edge (Manifest V3)
13. **Logs de Llamadas**: Registrar todas las llamadas al proveedor
14. **Logs de Eventos**: Registrar eventos emitidos
15. **Logs de Errores**: Con colores (rojo para errores)
16. **Logs de Operaciones**: Transacciones y firmas en tiempo real

#### Parte 4: Estándares EIP (17-19)

17. **EIP-1559 Gas**: maxFeePerGas y maxPriorityFeePerGas
18. **EIP-6963**: Anuncio de proveedor para multi-wallet
19. **Cambio de Redes**: Switch entre redes
20. **Gestion de Redes**: Add nuevas redes

#### Parte 5: UI Avanzada (20-25)

20. **Modal de Confirmación**: Página independiente para aprobar transacciones
21. **Reset Wallet**: Botón para limpiar y empezar de nuevo
22. **Hint Interactivo**: Mnemonic de prueba clickeable
23. **Historial de Logs**: Persistente entre resets
24. **Transferencias Internas**: Entre cuentas de la misma wallet
25. **Validación de Formularios**: Input validation y feedback

#### Parte 6: Persistencia (26-28)

26. **chrome.storage.local**: Guardar mnemonic, cuentas, configuración
27. **Auto-carga**: Cargar wallet automáticamente si ya existe
28. **Restaurar Estado**: Cuenta activa y red al reabrir

#### Parte 7: Chrome Extension Avanzado (29-36)

29. **Confirmación Independiente**: notification.html separado del popup para firmas
30. **Conexión Independiente**: connect.html separado para seleccionar cuenta al conectar
31. **Badge Contador**: Mostrar número de solicitudes pendientes
32. **Notificaciones Chrome**: Alertar al usuario de nuevas solicitudes
33. **Inyección Robusta**: En todas las páginas y frames
34. **Sincronización de Eventos**: accountsChanged a todas las pestañas
35. **Sincronización de Red**: chainChanged a todas las pestañas
36. **Selección de Cuenta**: Usuario elige qué cuenta compartir con cada dApp

## 🔧 COMPONENTES DETALLADOS

### 1. App.tsx (Popup Principal - 654 líneas) ⭐ ACTUALIZADO

**Responsabilidades:**
- UI de gestión de la wallet (NO hace operaciones crypto directamente)
- Mostrar balance de cuentas (obtiene datos del background)
- Cambio de cuenta activa
- Cambio de red (chainId)
- Transferencias entre cuentas (vía background script)
- Logs en tiempo real
- Reset de wallet
- Persistencia en storage
- **Comunicación con background script vía chrome.runtime.sendMessage**
**Funciones Clave:**
- `sendRPCToBackground()`: Helper para enviar mensajes al background ⭐ NUEVO
- `handleLoadWallet()`: Solicita al background derivar cuentas HD ⭐ ACTUALIZADO
- `changeAccount()`: Cambia cuenta activa y notifica a dApps
- `changeChain()`: Cambia red y notifica a dApps
- `handleTransfer()`: Solicita al background enviar transacción ⭐ ACTUALIZADO
- `resetWallet()`: Limpia storage y estado
- `updateBalance()`: Obtiene balance vía background script ⭐ ACTUALIZADO

### 2. Notification.tsx (Página de Confirmación - 297 líneas) ⭐ ACTUALIZADO

**Responsabilidades:**
- Mostrar detalles de transacción o mensaje a firmar
- Obtener datos desde chrome.storage
- **Solo aprueba/rechaza (NO firma)** ⭐ CAMBIO IMPORTANTE
- Enviar respuesta al background
- Cerrar automáticamente

**Cambio Clave:**
- ❌ Antes: notification.html firmaba con ethers
- ✅ Ahora: notification.html solo aprueba/rechaza
- ✅ background.js firma después de la aprobación

### 3. Connect.tsx (Página de Conexión - 270 líneas) ⭐ NUEVO

**Responsabilidades:**
- Mostrar solicitud de conexión desde una dApp
- Listar todas las cuentas disponibles (5)
- Cargar y mostrar balance de cada cuenta
- Permitir al usuario seleccionar qué cuenta compartir
- Actualizar cuenta activa en storage
- Enviar respuesta al background

**Diferencias con notification.html:**
- Tamaño: 420x650 (más grande para lista de cuentas)
- Interacción: Selección + Confirmación (vs solo Aprobar/Rechazar)
- Carga datos: Balances en tiempo real
- Actualiza storage: Cambia cuenta activa
- Timeout: 60s (vs 120s para firmas)

### 4. background.ts (Service Worker - 659 líneas) ⭐ ACTUALIZADO

**Responsabilidades:**
- Recibir solicitudes RPC desde content scripts y popup
- Manejar métodos: wallet_deriveAccounts, eth_requestAccounts, eth_accounts, eth_chainId, eth_getBalance, eth_sendTransaction, eth_signTypedData_v4, wallet_switchEthereumChain
- **Derivar cuentas HD usando ethers** ⭐ NUEVO
- **Firmar transacciones con ethers después de aprobación** ⭐ NUEVO
- **Firmar mensajes EIP-712 con ethers después de aprobación** ⭐ NUEVO
- Abrir connect.html para selección de cuenta
- Abrir notification.html para confirmaciones de firmas
- Gestionar queue de solicitudes pendientes (firmas y conexiones)
- Emitir eventos a todas las pestañas
- **Incluye ethers.js bundled (no CDN)** 

### 5. inject.ts (Provider EIP-1193 - 175 líneas) ⭐ ACTUALIZADO

**Responsabilidades:**
- Crear objeto window.codecrypto
- Implementar interfaz EIP-1193
- Comunicarse con content-script via postMessage
- Gestionar event listeners
- Implementar EIP-6963 (provider discovery)
- **Compilado desde TypeScript con tipos completos**

### 6. content-script.ts (Relay - 93 líneas) ⭐ ACTUALIZADO

**Responsabilidades:**
- Inyectar inject.js en la página
- Relay de mensajes: página ↔ background
- Relay de eventos: background → página
- **Compilado desde TypeScript con tipos completos**

### 7. test.html (Aplicación de Prueba - 843 líneas)

**Propósito:**
Aplicación HTML standalone para probar todas las funcionalidades de la wallet.

**Funcionalidades:**
1. Detección de wallet (window.codecrypto)
2. Conexión a wallet (eth_requestAccounts)
3. Ver balance (eth_getBalance)
4. Enviar transacciones (eth_sendTransaction)
5. Firmar mensajes EIP-712 (eth_signTypedData_v4)
6. Cambiar red (wallet_switchEthereumChain)
7. Escuchar eventos (accountsChanged, chainChanged)
8. Historial de operaciones

## 🔄 FLUJOS COMPLETOS

### Flujo 1: Inicialización de Wallet

```
Usuario abre extensión (primera vez)
        ↓
index.html (popup) se carga
        ↓
App.tsx verifica storage
        ↓
¿Hay mnemonic guardado?
    ├─ NO → Mostrar formulario
    │        Usuario ingresa 12 palabras
    │        Click "Cargar Wallet"
    │        ↓
    │        handleLoadWallet()
    │        ├─ Validar mnemonic
    │        ├─ Derivar 5 cuentas HD (m/44'/60'/0'/0/0 a /4)
    │        ├─ Guardar en chrome.storage.local
    │        └─ Mostrar cuentas en UI
    │
    └─ SÍ → loadWalletFromMnemonic()
             ├─ Leer mnemonic desde storage
             ├─ Derivar 5 cuentas
             ├─ Restaurar cuenta activa (índice)
             ├─ Restaurar chainId
             └─ Mostrar en UI
```

### Flujo 2: Conexión desde dApp

```
Usuario en test.html
        ↓
Click "Conectar Wallet"
        ↓
window.codecrypto.request({ method: 'eth_requestAccounts' })
        ↓
inject.js recibe la llamada
        ↓
window.postMessage({ type: 'CODECRYPTO_REQUEST', method: 'eth_requestAccounts' })
        ↓
content-script.js escucha el postMessage
        ↓
chrome.runtime.sendMessage({ type: 'CODECRYPTO_RPC', method: 'eth_requestAccounts' })
        ↓
background.js recibe el mensaje
        ↓
handleRPCRequest('eth_requestAccounts', [])
        ↓
Leer storage:
  - codecrypto_accounts = ["0xf39...", "0x709...", ...]
  - codecrypto_current_account = "0"
        ↓
Validar que existen cuentas
        ↓
return [accounts[currentAccountIndex]]
        ↓
sendResponse({ result: ["0xf39..."], error: null })
        ↓
content-script.js recibe respuesta
        ↓
window.postMessage({ type: 'CODECRYPTO_RESPONSE', result: ["0xf39..."] })
        ↓
inject.js recibe respuesta
        ↓
resolve(["0xf39..."])
        ↓
test.html recibe las cuentas
        ↓
Actualiza UI: "Conectado a: 0xf39..."
```

### Flujo 3: Envío de Transacción (Completo) ⭐ ACTUALIZADO

```
test.html: Usuario click "Enviar Transacción"
        ↓
window.codecrypto.request({
  method: 'eth_sendTransaction',
  params: [{ to, value, data }]
})
        ↓
inject.js → postMessage → content-script.js → chrome.runtime.sendMessage
        ↓
background.ts recibe CODECRYPTO_RPC
        ↓
handleRPCRequest('eth_sendTransaction', params)
        ↓
requestUserApprovalAndSign(method, params, chainId)
        ↓
Guardar en storage:
  codecrypto_pending_request = {
    approvalId: 1,
    method: 'eth_sendTransaction',
    params: [{ to, value, data }],
    chainId: '0x7a69'
  }
        ↓
chrome.windows.create({ url: 'notification.html' })
        ↓
notification.html se abre como ventana popup
        ↓
Notification.tsx se monta
        ↓
useEffect: Leer codecrypto_pending_request desde storage
        ↓
Mostrar UI con detalles de la transacción:
  - Para: 0x709...
  - Valor: 0.1 ETH
  - Red: Hardhat Local (31337)
        ↓
Usuario ve la ventana de confirmación
        ↓
Usuario click "Aprobar"
        ↓
handleApprove() ejecuta: ⭐ SIMPLIFICADO
        ↓
chrome.runtime.sendMessage({
  type: 'SIGN_RESPONSE',
  success: true,
  approvalId: 1
})
        ↓
window.close() (cerrar ventana de confirmación)
        ↓
background.ts recibe SIGN_RESPONSE
        ↓
handleSignResponse(approvalId, response)
        ↓
Resolver Promise: pending.resolve(true)
        ↓
handleRPCRequest continúa después de la aprobación: ⭐ FIRMA EN BACKGROUND
        ↓
1. Leer mnemonic desde storage
2. Derivar wallet:
   const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic)
   const wallet = HDNodeWallet.fromMnemonic(mnemonicObj, path)
3. Conectar a provider:
   const provider = new ethers.JsonRpcProvider(rpcUrl)
   const signer = wallet.connect(provider)
4. Obtener fee data (EIP-1559):
   const feeData = await provider.getFeeData()
5. Preparar transacción:
   const txRequest = {
     to: tx.to,
     value: tx.value,
     maxFeePerGas: feeData.maxFeePerGas,
     maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
   }
6. Firmar y enviar:
   const txResponse = await signer.sendTransaction(txRequest)
7. Obtener hash:
   const txHash = txResponse.hash
        ↓
sendResponse({ result: txHash, error: null })
        ↓
content-script.js recibe respuesta
        ↓
window.postMessage({ type: 'CODECRYPTO_RESPONSE', result: txHash })
        ↓
inject.js recibe respuesta
        ↓
Promise en window.codecrypto.request() se resuelve con txHash
        ↓
test.html recibe txHash
        ↓
Actualiza UI: "✅ Transacción enviada: 0xABC123..."
```

**Cambio Clave:**
- ❌ Antes: Notification.tsx firmaba la transacción
- ✅ Ahora: Notification.tsx solo aprueba
- ✅ background.ts firma después de la aprobación

## 🔌 COMUNICACIÓN ENTRE COMPONENTES

### Patrón 1: Página Web → Extension

```
window.codecrypto.request()
        ↓
inject.js: window.postMessage({ type: 'CODECRYPTO_REQUEST' })
        ↓
content-script.js: escucha postMessage
        ↓
content-script.js: chrome.runtime.sendMessage({ type: 'CODECRYPTO_RPC' })
        ↓
background.js: onMessage.addListener()
        ↓
background.js: handleRPCRequest()
        ↓
background.js: sendResponse({ result })
        ↓
content-script.js: recibe respuesta
        ↓
content-script.js: window.postMessage({ type: 'CODECRYPTO_RESPONSE' })
        ↓
inject.js: escucha postMessage
        ↓
inject.js: resolve(result)
        ↓
test.html: recibe resultado
```

### Patrón 2: Extension → Todas las Pestañas (Eventos)

```
Popup: Usuario cambia cuenta
        ↓
App.tsx: changeAccount(newIndex)
        ↓
Actualizar storage: codecrypto_current_account = newIndex
        ↓
background.js: chrome.storage.onChanged listener detecta cambio
        ↓
background.js: chrome.tabs.query({}) para obtener todas las pestañas
        ↓
Para cada pestaña:
  chrome.tabs.sendMessage(tab.id, {
    type: 'CODECRYPTO_EVENT',
    eventName: 'accountsChanged',
    data: [newAccount]
  })
        ↓
content-script.js en cada pestaña: onMessage.addListener()
        ↓
content-script.js: window.postMessage({ type: 'CODECRYPTO_EVENT' })
        ↓
inject.js en cada pestaña: escucha postMessage
        ↓
inject.js: Llama callbacks de eventListeners['accountsChanged']
        ↓
test.html: callback ejecuta y actualiza UI
```

### Patrón 3: Solicitud de Firma ⭐ ACTUALIZADO

```
dApp: eth_sendTransaction
        ↓
inject.js → content-script.js → background.ts
        ↓
background.ts:
  ├─ Crear approvalId único (ej. 1)
  ├─ Guardar solicitud en storage:
  │    codecrypto_pending_request = {
  │      approvalId: 1,
  │      method: 'eth_sendTransaction',
  │      params: [{to, value, data}],
  │      chainId: '0x7a69'
  │    }
  ├─ Guardar Promise en Map:
  │    pendingApprovals.set(1, { resolve, reject })
  └─ Abrir ventana:
       chrome.windows.create({ url: 'notification.html' })
        ↓
notification.html se carga
        ↓
Notification.tsx:
  ├─ useEffect: Leer codecrypto_pending_request
  ├─ Mostrar detalles en UI
  └─ Esperar decisión del usuario
        ↓
Usuario click "Aprobar"
        ↓
handleApprove(): ⭐ SOLO APRUEBA (NO FIRMA)
  ├─ chrome.runtime.sendMessage({
  │    type: 'SIGN_RESPONSE',
  │    success: true,
  │    approvalId: 1
  │  })
  └─ window.close()
        ↓
background.ts: onMessage recibe SIGN_RESPONSE
        ↓
handleSignResponse(approvalId, response):
  ├─ Buscar Promise: pendingApprovals.get(1)
  ├─ Limpiar: chrome.storage.local.remove('codecrypto_pending_request')
  ├─ Limpiar: pendingApprovals.delete(1)
  └─ Resolver: pending.resolve(true)
        ↓
handleRPCRequest continúa: ⭐ FIRMA EN BACKGROUND
  ├─ Leer mnemonic desde storage
  ├─ Derivar wallet con ethers
  ├─ Conectar a provider
  ├─ Obtener fee data (EIP-1559)
  ├─ Firmar y enviar transacción
  └─ Obtener txHash
        ↓
sendResponse({ result: txHash })
        ↓
content-script.js → window.postMessage → inject.js → dApp
        ↓
test.html recibe txHash
        ↓
Muestra: "✅ Transacción enviada: 0xABC..."
```

**Arquitectura Mejorada:**
- ✅ Notification.tsx: Solo UI de aprobación (más simple)
- ✅ background.ts: Toda la lógica crypto con ethers
- ✅ Separación de responsabilidades clara
- ✅ Más seguro (mnemonic solo en background)

## 📊 CASOS DE USO Y TESTING

### Test 1: Inicialización de Wallet

**Pasos:**
1. Abrir popup de extensión
2. Verificar que muestra formulario (primera vez)
3. Ingresar mnemonic de prueba
4. Click "Cargar Wallet"
5. Verificar que aparecen 5 cuentas
6. Verificar balances (10,000 ETH c/u)

### Test 2: Persistencia

**Pasos:**
1. Configurar wallet (Test 1)
2. Cerrar popup
3. Cerrar navegador completamente
4. Abrir navegador de nuevo
5. Click en ícono de extensión

**Resultado esperado:**
- ✅ Wallet se carga automáticamente
- ✅ NO pide mnemonic de nuevo
- ✅ Misma cuenta activa
- ✅ Mismo chainId

### Test 3: Conexión desde dApp ⭐ ACTUALIZADO

**Pasos:**
1. Abrir test.html
2. Click "Conectar Wallet"
3. Esperar que se abra connect.html
4. Verificar lista de cuentas
5. Seleccionar una cuenta (ej. Cuenta 2)
6. Click "Conectar"

**Resultado esperado:**
- ✅ window.codecrypto detectado
- ✅ connect.html se abre automáticamente
- ✅ Muestra 5 cuentas con balances
- ✅ Muestra origen de la solicitud
- ✅ Permite seleccionar cuenta
- ✅ Al conectar: ventana se cierra
- ✅ test.html conectado a la cuenta seleccionada
- ✅ Esa cuenta se vuelve la activa

---

### Test 4: Transacción

**Pasos:**
1. test.html conectado (Test 3)
2. Click "Enviar Transacción"
3. Esperar que se abra ventana de confirmación
4. Verificar detalles
5. Click "Aprobar"
6. Esperar confirmación

**Resultado esperado:**
- ✅ notification.html se abre automáticamente
- ✅ Muestra: Para, Valor, Red
- ✅ Al aprobar: ventana se cierra
- ✅ test.html muestra: "Transacción enviada: 0x..."
- ✅ Hardhat muestra transacción en terminal

---

### Test 5: Firma EIP-712

**Pasos:**
1. test.html → Click "Firmar Mensaje EIP-712"
2. Esperar confirmación
3. Verificar JSON formateado
4. Aprobar

**Resultado esperado:**
- ✅ notification.html se abre
- ✅ JSON bien formateado con scroll
- ✅ Muestra domain, types, message
- ✅ Al aprobar: devuelve signature (0x... de 132 caracteres)

---

### Test 6: Cambio de Cuenta

**Pasos:**
1. Popup abierto
2. Cambiar a cuenta 1 (dropdown)
3. Ver test.html

**Resultado esperado:**
- ✅ test.html recibe evento accountsChanged
- ✅ UI se actualiza con nueva cuenta
- ✅ Balance actualizado
- ✅ Transacciones usan nueva cuenta

---

### Test 7: Cambio de Red

**Pasos:**
1. Popup → Cambiar a Sepolia (11155111)
2. Ver test.html

**Resultado esperado:**
- ✅ test.html recibe evento chainChanged
- ✅ UI se actualiza: "Red: Sepolia"
- ✅ Transacciones van a Sepolia

---

### Test 8: Reset Wallet

**Pasos:**
1. Popup → Click "Reset Wallet"
2. Verificar storage

**Resultado esperado:**
- ✅ Formulario de mnemonic aparece de nuevo
- ✅ chrome.storage.local está vacío
- ✅ Logs se mantienen (localStorage)

---

### Test 9: Transferencia entre Cuentas

**Pasos:**
1. Popup → Sección "Transfer"
2. De: Cuenta 0
3. A: Cuenta 1
4. Cantidad: 1 ETH
5. Click "Transferir"
6. Esperar confirmación

**Resultado esperado:**
- ✅ Cuenta 0 pierde 1 ETH + gas
- ✅ Cuenta 1 gana 1 ETH
- ✅ TX hash mostrado
- ✅ Hardhat muestra transacción

---

### Test 10: Badge y Notificaciones

**Pasos:**
1. Cerrar popup
2. test.html → Enviar TX
3. Observar ícono de extensión

**Resultado esperado:**
- ✅ Badge muestra "1"
- ✅ Notificación de Chrome aparece
- ✅ notification.html se abre automáticamente
- ✅ Al aprobar: badge desaparece

---

### Test 11: Selección de Cuenta al Conectar ⭐ NUEVO

**Pasos:**
1. Asegurar que Hardhat está corriendo (npx hardhat node)
2. Abrir test.html (nueva pestaña, sin conexión previa)
3. Click "Conectar Wallet"
4. Observar ventana connect.html que se abre
5. Ver que muestra 5 cuentas con balances
6. Seleccionar "Cuenta 3"
7. Click "Conectar"

**Resultado esperado:**
- ✅ connect.html se abre automáticamente (420x650)
- ✅ Muestra origen: "http://localhost:5174/test.html"
- ✅ Lista 5 cuentas con radio buttons
- ✅ Cada cuenta muestra: número, dirección, balance
- ✅ Balances: 10000.0000 ETH (si Hardhat está corriendo)
- ✅ Cuenta 0 pre-seleccionada inicialmente
- ✅ Al hacer click en Cuenta 3, se selecciona (fondo azul)
- ✅ Panel inferior muestra dirección completa de Cuenta 3
- ✅ Al hacer click "Conectar", ventana se cierra
- ✅ test.html conecta con Cuenta 3
- ✅ test.html muestra: "Conectado a: 0x90F79..."
- ✅ Cuenta 3 es ahora la activa (verificar en popup)