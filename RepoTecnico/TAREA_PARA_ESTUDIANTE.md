# 🎓 PROYECTO: Construcción de una Wallet Ethereum como Extensión Chrome

## 📋 DESCRIPCIÓN DE LA TAREA

**Este documento describe el proyecto completo que debes desarrollar.**

Se trata de construir una **extensión de navegador Chrome** que funcione como una **wallet (billetera) de criptomonedas Ethereum**, similar a MetaMask, implementando los estándares más importantes del ecosistema Web3.

**Duración estimada:**  alrededor de 40 horas usando IA.

**Nivel:** Avanzado

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

---

## 📝 ESPECIFICACIONES TÉCNICAS

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

---

## 🏗️ ARQUITECTURA DEL SISTEMA ⭐ ACTUALIZADO

### Componentes Principales

```
┌─────────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────┐      ┌────────────────┐                 │
│  │  index.html    │      │notification y connect html│                │
│  │  (Popup)       │      │ (Confirmación) │                 │
│  │                │      │                │                 │
│  │ - App.tsx      │      │ - Notification │                 │
│  │ - Solo UI      │      │ - Solo UI      │ ⭐ NO firman    │
│  │ - Mensajes RPC │      │ - Aprueba/     │                 │
│  │ - Balance      │      │   Rechaza      │                 │
│  │ - Logs         │      │                │                 │
│  └────────┬───────┘      └────────┬───────┘                │
│           │                       │                          │
│           │   chrome.runtime.sendMessage                    │
│           └───────┬───────────────┘                          │
│                   │                                          │
│           ┌───────▼────────────────────┐                    │
│           │  background.ts              │ ⭐ FIRMA CON ETHERS│
│           │  (Service Worker)           │                    │
│           │                             │                    │
│           │ - import { ethers }         │                    │
│           │ - RPC Handler               │                    │
│           │ - wallet_deriveAccounts     │                    │
│           │ - Firma transacciones       │                    │
│           │ - Firma EIP-712             │                    │
│           │ - Queue de solicitudes      │                    │
│           │ - Bundled localmente        │                    │
│           └───────┬─────────────────────┘                    │
│                   │                                          │
└───────────────────┼──────────────────────────────────────────┘
                    │
            ┌───────▼────────┐
            │ chrome.storage  │
            │   .local        │
            │                 │
            │ - mnemonic      │
            │ - accounts      │
            │ - current_acc   │
            │ - chain_id      │
            └────────────────┘
```

### Flujo de Datos: Quién Usa Ethers

```
┌─────────────┐                    ┌──────────────────┐
│   Popup     │ ──mensajes RPC──> │  background.ts   │
│  (App.tsx)  │ <─ respuestas ─── │ (service worker) │
└─────────────┘                    └──────────────────┘
     ↑                                       ↑
     │                                       │
     └─── NO usa ethers                     └─── USA ethers
          Solo UI                                 - Deriva cuentas
          Delega todo                             - Obtiene balances
                                                  - Firma transacciones
                                                  - Firma EIP-712
```

### Inyección en Páginas Web

```
┌──────────────────────────────────────────┐
│         PÁGINA WEB (ej. test.html)       │
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────────┐                     │
│  │  inject.js     │ ← Ejecuta en contexto de página
│  │                │                      │
│  │ window.codecrypto = {                │
│  │   request: fn,                       │
│  │   on: fn,                            │
│  │   ...                                │
│  │ }                                    │
│  └────────┬───────┘                     │
│           │ window.postMessage           │
│  ┌────────▼───────┐                     │
│  │content-script  │ ← Relay de mensajes │
│  │                │                      │
│  │ Escucha mensajes                     │
│  │ y los reenvía al                     │
│  │ background                           │
│  └────────┬───────┘                     │
│           │ chrome.runtime.sendMessage   │
└───────────┼──────────────────────────────┘
            │
       ┌────▼────┐
       │Extension│
       └─────────┘
```

---

## 📁 ESTRUCTURA DE ARCHIVOS

### Directorio Raíz (TODO en TypeScript ⭐ ACTUALIZADO)

```
71_wallet_chrome_extension/
│
├── src/                          # TODO el código fuente en TypeScript
│   ├── App.tsx                   # Componente principal del popup
│   ├── App.css                   # Estilos del popup
│   ├── main.tsx                  # Entry point del popup
│   ├── Connect.tsx               # Componente de conexión
│   ├── connect-main.tsx          # Entry point de conexión
│   ├── Notification.tsx          # Componente de confirmación
│   ├── notification-main.tsx     # Entry point de confirmación
│   ├── background.ts             # Service worker (TypeScript) ⭐ NUEVO
│   ├── content-script.ts         # Content script (TypeScript) ⭐ NUEVO
│   ├── inject.ts                 # Inject script (TypeScript) ⭐ NUEVO
│   └── manifest.ts               # Manifest (TypeScript) ⭐ NUEVO
│
├── public/                       # Solo recursos estáticos
│   └── vite.svg                  # Ícono de la extensión
│
├── index.html                    # HTML del popup
├── connect.html                  # HTML de conexión
├── notification.html             # HTML de confirmación
├── test.html                     # Aplicación de prueba
├── package.json                  # Dependencias
├── vite.config.ts                # Configuración de Vite + Plugin
└── tsconfig.json                 # Configuración TypeScript
```

### Archivos Generados (dist/) - Auto-generados desde TypeScript ⭐

```
dist/
├── index.html                    # Popup compilado
├── connect.html                  # Conexión compilada
├── notification.html             # Confirmación compilada
├── manifest.json                 # ✨ Generado desde src/manifest.ts
├── background.js                 # ✨ Compilado desde src/background.ts (con ethers)
├── content-script.js             # ✨ Compilado desde src/content-script.ts
├── inject.js                     # ✨ Compilado desde src/inject.ts
└── assets/
    ├── hdwallet-*.js             # Bundle de ethers HDWallet (~66 KB)
    ├── provider-jsonrpc-*.js     # Bundle de ethers JsonRpcProvider (~258 KB)
    ├── connect-*.js              # Bundle de conexión (5.1 KB)
    ├── notification-*.js         # Bundle de confirmación (5.8 KB)
    ├── App-*.js                  # Bundle del popup (194 KB)
    └── *.css                     # Estilos compilados
```

---

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

**Estado Principal:**
```typescript
const [mnemonic, setMnemonic] = useState('')
const [isWalletLoaded, setIsWalletLoaded] = useState(false) // ✨ No guarda wallets ethers
const [accounts, setAccounts] = useState<string[]>([])      // Solo direcciones
const [currentAccountIndex, setCurrentAccountIndex] = useState(0)
const [balance, setBalance] = useState('0')
const [chainId, setChainId] = useState('0x7a69')
const [logs, setLogs] = useState<Log[]>([])
const [isLoading, setIsLoading] = useState(true)
```

**Funciones Clave:**
- `sendRPCToBackground()`: Helper para enviar mensajes al background ⭐ NUEVO
- `handleLoadWallet()`: Solicita al background derivar cuentas HD ⭐ ACTUALIZADO
- `changeAccount()`: Cambia cuenta activa y notifica a dApps
- `changeChain()`: Cambia red y notifica a dApps
- `handleTransfer()`: Solicita al background enviar transacción ⭐ ACTUALIZADO
- `resetWallet()`: Limpia storage y estado
- `updateBalance()`: Obtiene balance vía background script ⭐ ACTUALIZADO

**Comunicación con Background (NUEVO):**
```typescript
// Helper para enviar RPC al background
async function sendRPCToBackground(method: string, params?: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CODECRYPTO_RPC', method, params: params || [] },
      (response: { result?: unknown; error?: string }) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (response.error) {
          reject(new Error(response.error))
          return
        }
        resolve(response.result)
      }
    )
  })
}

// Derivar cuentas (delega al background)
const derivedAccounts = await sendRPCToBackground('wallet_deriveAccounts', [mnemonic, 5])

// Obtener balance (delega al background)
const balanceHex = await sendRPCToBackground('eth_getBalance', [address, 'latest'])

// Enviar transacción (delega al background)
const txHash = await sendRPCToBackground('eth_sendTransaction', [tx])
```

**Persistencia:**
```typescript
// Guardar
chrome.storage.local.set({
  codecrypto_mnemonic: mnemonic,
  codecrypto_accounts: accounts,
  codecrypto_current_account: index.toString(),
  codecrypto_chain_id: chainId
})

// Cargar al iniciar
chrome.storage.local.get([...], (result) => {
  if (result.codecrypto_mnemonic) {
    loadWalletFromMnemonic(result.codecrypto_mnemonic, ...)
  }
})
```

---

### 2. Notification.tsx (Página de Confirmación - 297 líneas) ⭐ ACTUALIZADO

**Responsabilidades:**
- Mostrar detalles de transacción o mensaje a firmar
- Obtener datos desde chrome.storage
- **Solo aprueba/rechaza (NO firma)** ⭐ CAMBIO IMPORTANTE
- Enviar respuesta al background
- Cerrar automáticamente

**Flujo (Actualizado):**
```typescript
useEffect(() => {
  // 1. Leer solicitud pendiente desde storage
  const result = await chrome.storage.local.get('codecrypto_pending_request')
  
  // 2. Mostrar datos en UI
  setData(result.codecrypto_pending_request)
}, [])

const handleApprove = async () => {
  // 3. Solo enviar aprobación al background (sin firmar)
  chrome.runtime.sendMessage({
    type: 'SIGN_RESPONSE',
    success: true,
    approvalId: data.approvalId
  })
  
  // 4. Cerrar ventana
  window.close()
  
  // NOTA: El background script se encarga de firmar después
}

const handleReject = () => {
  // Enviar rechazo al background
  chrome.runtime.sendMessage({
    type: 'SIGN_RESPONSE',
    success: false,
    error: 'User rejected',
    approvalId: data.approvalId
  })
  
  window.close()
}
```

**Cambio Clave:**
- ❌ Antes: notification.html firmaba con ethers
- ✅ Ahora: notification.html solo aprueba/rechaza
- ✅ background.js firma después de la aprobación

**UI:**
- Header con gradiente
- Detalles de transacción/mensaje formateados
- JSON con scroll para mensajes largos
- Botones grandes de Aprobar/Rechazar

---

### 3. Connect.tsx (Página de Conexión - 270 líneas) ⭐ NUEVO

**Responsabilidades:**
- Mostrar solicitud de conexión desde una dApp
- Listar todas las cuentas disponibles (5)
- Cargar y mostrar balance de cada cuenta
- Permitir al usuario seleccionar qué cuenta compartir
- Actualizar cuenta activa en storage
- Enviar respuesta al background

**Flujo:**
```typescript
useEffect(() => {
  // 1. Leer solicitud de conexión desde storage
  const result = await chrome.storage.local.get('codecrypto_connect_request')
  
  // 2. Obtener lista de cuentas
  const { accounts, currentAccountIndex, origin } = result.codecrypto_connect_request
  
  // 3. Cargar balances de cada cuenta
  for (let account of accounts) {
    const balance = await provider.getBalance(account)
    accountsWithBalance.push({ address: account, balance })
  }
  
  // 4. Mostrar en UI
  setAccounts(accountsWithBalance)
  setSelectedIndex(currentAccountIndex)
}, [])

const handleConnect = async () => {
  // 5. Actualizar cuenta actual en storage
  await chrome.storage.local.set({
    codecrypto_current_account: selectedIndex.toString()
  })
  
  // 6. Enviar resultado al background
  chrome.runtime.sendMessage({
    type: 'CONNECT_RESPONSE',
    success: true,
    account: accounts[selectedIndex].address,
    accountIndex: selectedIndex,
    requestId: data.requestId
  })
  
  // 7. Cerrar ventana
  window.close()
}
```

**UI:**
- Header con gradiente
- Muestra origen de la solicitud (URL de la dApp)
- Lista de 5 cuentas con:
  - Radio button (🔘 seleccionada, ⚪ no seleccionada)
  - Número de cuenta
  - Dirección (corta y completa)
  - Balance (con 4 decimales)
- Panel de cuenta seleccionada (dirección completa)
- Botones de Cancelar y Conectar

**Diferencias con notification.html:**
- Tamaño: 420x650 (más grande para lista de cuentas)
- Interacción: Selección + Confirmación (vs solo Aprobar/Rechazar)
- Carga datos: Balances en tiempo real
- Actualiza storage: Cambia cuenta activa
- Timeout: 60s (vs 120s para firmas)

---

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
- **Incluye ethers.js bundled (no CDN)** ⭐ NUEVO

**Estructura:**
```javascript
// Map de solicitudes pendientes
const pendingApprovals = new Map()
let approvalIdCounter = 0

// Map de conexiones pendientes ⭐ NUEVO
const pendingConnections = new Map()
let connectionIdCounter = 0

// Handler principal
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CODECRYPTO_RPC') {
    handleRPCRequest(message.method, message.params, sender)
      .then(result => sendResponse({ result, error: null }))
      .catch(error => sendResponse({ result: null, error: error.message }))
    return true
  }
  
  if (message.type === 'CONNECT_RESPONSE') {  // ⭐ NUEVO
    handleConnectResponse(message.requestId, message)
    return true
  }
  
  if (message.type === 'SIGN_RESPONSE') {
    handleSignResponse(message.approvalId, message)
    return true
  }
  
  // ... otros tipos de mensajes
})
```

**Métodos Implementados:**

1. **wallet_deriveAccounts**: Deriva cuentas HD desde mnemonic ⭐ NUEVO
   ```typescript
   // Validar mnemonic (ethers v6)
   const isValid = ethers.Mnemonic.isValidMnemonic(mnemonicPhrase)
   if (!isValid) throw new Error('Invalid mnemonic phrase')
   
   // Crear objeto Mnemonic
   const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonicPhrase)
   
   // Derivar N cuentas usando HDNodeWallet
   const derivedAccounts: string[] = []
   for (let i = 0; i < numAccounts; i++) {
     const path = `m/44'/60'/0'/0/${i}`
     const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path)
     derivedAccounts.push(wallet.address)
   }
   
   return derivedAccounts
   ```

2. **eth_requestAccounts**: Abre connect.html para que usuario seleccione cuenta
   ```typescript
   const origin = sender.tab?.url || 'unknown'
   const connectResult = await requestUserConnection(origin, accounts, currentAccountIndex)
   
   if (connectResult.error) {
     throw new Error(connectResult.error)
   }
   
   return [connectResult.account]  // Cuenta elegida por usuario
   ```

3. **eth_chainId**: Devuelve chainId actual
   ```typescript
   return storage.codecrypto_chain_id  // "0x7a69" o "0xaa36a7"
   ```

4. **eth_getBalance**: Obtiene balance usando ethers ⭐ ACTUALIZADO
   ```typescript
   const rpcUrl = chainId === '0x7a69' 
     ? 'http://localhost:8545' 
     : 'https://rpc.sepolia.org'
   
   const provider = new ethers.JsonRpcProvider(rpcUrl)
   const balance = await provider.getBalance(address)
   const balanceHex = '0x' + balance.toString(16)
   
   return balanceHex
   ```

5. **eth_sendTransaction**: Aprobación + Firma ⭐ ACTUALIZADO
   ```typescript
   // 1. Solicitar aprobación al usuario (abre notification.html)
   await requestUserApprovalAndSign(method, params, chainId)
   
   // 2. Usuario aprobó, ahora firmar en background
   const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic)
   const path = `m/44'/60'/0'/0/${currentAccountIndex}`
   const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path)
   
   // 3. Conectar a provider y obtener fee data
   const provider = new ethers.JsonRpcProvider(rpcUrl)
   const signer = wallet.connect(provider)
   const feeData = await provider.getFeeData()
   
   // 4. Preparar y enviar transacción (EIP-1559)
   const txRequest = {
     to: tx.to,
     value: tx.value || '0x0',
     data: tx.data || '0x',
     maxFeePerGas: feeData.maxFeePerGas,
     maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
   }
   
   const txResponse = await signer.sendTransaction(txRequest)
   return txResponse.hash
   ```

6. **eth_signTypedData_v4**: Aprobación + Firma EIP-712 ⭐ ACTUALIZADO
   ```typescript
   // 1. Solicitar aprobación al usuario
   await requestUserApprovalAndSign(method, params, chainId)
   
   // 2. Usuario aprobó, ahora firmar en background
   const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic)
   const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path)
   
   // 3. Firmar mensaje EIP-712
   const typedData = JSON.parse(params[1])
   const domain = typedData.domain
   const types = { ...typedData.types }
   delete types.EIP712Domain
   const value = typedData.message
   
   const signature = await wallet.signTypedData(domain, types, value)
   return signature
   ```

**Sincronización de Eventos:**
```javascript
// Cuando cambia la cuenta en el popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.codecrypto_current_account) {
    // Emitir accountsChanged a TODAS las pestañas
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CODECRYPTO_EVENT',
          eventName: 'accountsChanged',
          data: [newAccount]
        })
      })
    })
  }
})
```

---

### 5. inject.ts (Provider EIP-1193 - 175 líneas) ⭐ ACTUALIZADO

**Responsabilidades:**
- Crear objeto window.codecrypto
- Implementar interfaz EIP-1193
- Comunicarse con content-script via postMessage
- Gestionar event listeners
- Implementar EIP-6963 (provider discovery)
- **Compilado desde TypeScript con tipos completos** ⭐ NUEVO

**Estructura:**
```typescript
(function() {
  console.log('🚀 CodeCrypto inject.js cargando...')
  
  let requestIdCounter = 0
  const eventListeners = {}
  
  window.codecrypto = {
    isCodeCrypto: true,
    isMetaMask: false,
    
    request: async ({ method, params }) => {
      const id = ++requestIdCounter
      
      // Enviar al content script
      window.postMessage({
        type: 'CODECRYPTO_REQUEST',
        id,
        method,
        params
      }, '*')
      
      // Esperar respuesta
      return new Promise((resolve, reject) => {
        const handler = (event) => {
          if (event.data.type === 'CODECRYPTO_RESPONSE' && event.data.id === id) {
            window.removeEventListener('message', handler)
            if (event.data.error) {
              reject(new Error(event.data.error))
            } else {
              resolve(event.data.result)
            }
          }
        }
        
        window.addEventListener('message', handler)
        
        // Timeout de 30s
        setTimeout(() => {
          window.removeEventListener('message', handler)
          reject(new Error('Request timeout'))
        }, 30000)
      })
    },
    
    on: (eventName, callback) => {
      if (!eventListeners[eventName]) {
        eventListeners[eventName] = []
      }
      eventListeners[eventName].push(callback)
    },
    
    removeListener: (eventName, callback) => {
      if (eventListeners[eventName]) {
        const index = eventListeners[eventName].indexOf(callback)
        if (index > -1) {
          eventListeners[eventName].splice(index, 1)
        }
      }
    }
  }
  
  // EIP-6963: Provider Discovery
  window.addEventListener('eip6963:requestProvider', () => {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: {
          uuid: 'codecrypto-unique-id',
          name: 'CodeCrypto',
          icon: 'data:image/svg+xml,...',
          rdns: 'io.codecrypto'
        },
        provider: window.codecrypto
      }
    }))
  })
  
  // Escuchar eventos desde background
  window.addEventListener('message', (event) => {
    if (event.data.type === 'CODECRYPTO_EVENT') {
      const listeners = eventListeners[event.data.eventName] || []
      listeners.forEach(callback => callback(event.data.data))
    }
  })
})()
```

---

### 6. content-script.ts (Relay - 93 líneas) ⭐ ACTUALIZADO

**Responsabilidades:**
- Inyectar inject.js en la página
- Relay de mensajes: página ↔ background
- Relay de eventos: background → página
- **Compilado desde TypeScript con tipos completos** ⭐ NUEVO

**Código:**
```typescript
// Inyectar inject.js
const script = document.createElement('script')
script.src = chrome.runtime.getURL('inject.js')
document.head.appendChild(script)

// Escuchar mensajes desde la página
window.addEventListener('message', async (event) => {
  if (event.data.type === 'CODECRYPTO_REQUEST') {
    // Enviar al background
    const response = await chrome.runtime.sendMessage({
      type: 'CODECRYPTO_RPC',
      method: event.data.method,
      params: event.data.params
    })
    
    // Devolver respuesta a la página
    window.postMessage({
      type: 'CODECRYPTO_RESPONSE',
      id: event.data.id,
      result: response.result,
      error: response.error
    }, '*')
  }
})

// Escuchar eventos desde background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CODECRYPTO_EVENT') {
    // Reenviar a la página
    window.postMessage({
      type: 'CODECRYPTO_EVENT',
      eventName: message.eventName,
      data: message.data
    }, '*')
  }
})
```

---

### 7. manifest.ts (Configuración - 86 líneas) ⭐ NUEVO

**Archivo TypeScript que genera manifest.json automáticamente**

**Configuración Chrome Extension:**
```typescript
// src/manifest.ts - Tipado completo con ManifestV3 interface
interface ManifestV3 {
  manifest_version: 3;
  name: string;
  version: string;
  // ... tipos completos
}

const manifest: ManifestV3 = {
  manifest_version: 3,
  name: 'CodeCrypto Wallet',
  version: '1.0.0',
  description: 'Wallet extension para Ethereum con soporte EIP-1193, EIP-712 y EIP-6963',
  
  permissions: [
    'storage',      // Para chrome.storage.local
    'activeTab',    // Para interactuar con pestaña activa
    'tabs',         // Para chrome.tabs.query
    'notifications' // Para chrome.notifications
  ],
  
  host_permissions: [
    'http://localhost:8545/*',     // Hardhat local
    'https://rpc.sepolia.org/*'    // Sepolia testnet
  ],
  
  action: {
    default_popup: 'index.html',
    default_icon: { '16': 'vite.svg', '48': 'vite.svg', '128': 'vite.svg' }
  },
  
  background: {
    service_worker: 'background.js',
    type: 'module'  // ⭐ Requerido para importar ethers
  },
  
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['content-script.js'],
    run_at: 'document_start',
    all_frames: true
  }],
  
  web_accessible_resources: [{
    resources: ['inject.js'],
    matches: ['<all_urls>']
  }]
}

export default manifest;
```

**Generación Automática:**
```typescript
// vite.config.ts - Plugin personalizado
function manifestPlugin(): Plugin {
  return {
    name: 'manifest-generator',
    closeBundle: async () => {
      const manifestModule = await import('./src/manifest.js')
      const manifest = manifestModule.default
      
      writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2))
      console.log('✅ manifest.json generado en dist/')
    }
  }
}
```

**Ventajas:**
- ✅ Type safety para el manifest
- ✅ Autocompletado en IDE
- ✅ Validación en tiempo de compilación
- ✅ Single source of truth
- ✅ Se genera automáticamente en `npm run build`

---

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

**Código de Conexión:**
```javascript
const connectBtn = document.getElementById('connectBtn')
connectBtn.addEventListener('click', async () => {
  try {
    const accounts = await window.codecrypto.request({
      method: 'eth_requestAccounts'
    })
    
    currentAccount = accounts[0]
    console.log('✅ Conectado a:', currentAccount)
    
    // Escuchar eventos
    window.codecrypto.on('accountsChanged', (accounts) => {
      currentAccount = accounts[0]
      updateUI()
    })
    
    window.codecrypto.on('chainChanged', (newChainId) => {
      currentChainId = newChainId
      updateUI()
    })
  } catch (error) {
    console.error('Error conectando:', error)
  }
})
```

**Código de Transacción:**
```javascript
const sendBtn = document.getElementById('sendTxBtn')
sendBtn.addEventListener('click', async () => {
  try {
    const txHash = await window.codecrypto.request({
      method: 'eth_sendTransaction',
      params: [{
        from: currentAccount,
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '0x' + (0.1 * 1e18).toString(16),
        data: '0x'
      }]
    })
    
    console.log('✅ Transacción enviada:', txHash)
  } catch (error) {
    console.error('❌ Error:', error)
  }
})
```

**Código de Firma EIP-712:**
```javascript
const signBtn = document.getElementById('signBtn')
signBtn.addEventListener('click', async () => {
  const typedData = {
    types: {
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' }
      ]
    },
    domain: {
      name: 'CodeCrypto Test App',
      version: '1',
      chainId: parseInt(currentChainId, 16),
      verifyingContract: '0x0000000000000000000000000000000000000000'
    },
    message: {
      name: 'Alice',
      wallet: currentAccount
    }
  }
  
  const signature = await window.codecrypto.request({
    method: 'eth_signTypedData_v4',
    params: [currentAccount, JSON.stringify(typedData)]
  })
  
  console.log('✅ Firma:', signature)
})
```

---

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

---

## 🔐 IMPLEMENTACIÓN DE ESTÁNDARES EIP

### EIP-1193: Ethereum Provider JavaScript API

**Métodos Requeridos:**
```javascript
interface EIP1193Provider {
  request(args: { method: string; params?: any[] }): Promise<any>
  on(eventName: string, callback: Function): void
  removeListener(eventName: string, callback: Function): void
}
```

**Implementación:**
- ✅ request() en inject.js
- ✅ on() para eventos
- ✅ removeListener() para cleanup
- ✅ Eventos: accountsChanged, chainChanged, connect, disconnect

**Métodos Soportados:**
- `eth_requestAccounts`
- `eth_accounts`
- `eth_chainId`
- `eth_getBalance`
- `eth_sendTransaction`
- `eth_signTypedData_v4`
- `wallet_switchEthereumChain`

---

### EIP-712: Typed Structured Data Hashing and Signing

**Estructura de Mensaje:**
```javascript
{
  types: {
    EIP712Domain: [...],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' }
    ]
  },
  domain: {
    name: 'App Name',
    version: '1',
    chainId: 31337,
    verifyingContract: '0x...'
  },
  message: {
    name: 'Alice',
    wallet: '0xf39...'
  }
}
```

**Firma:**
```typescript
const signature = await wallet.signTypedData(domain, types, message)
```

---

### EIP-1559: Fee Market Change for ETH 1.0 Chain

**Gestión de Gas:**
```typescript
const feeData = await provider.getFeeData()

const tx = {
  to: '0x...',
  value: '0x...',
  maxFeePerGas: feeData.maxFeePerGas,
  maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
}
```

**Campos:**
- `maxFeePerGas`: Máximo gas dispuesto a pagar
- `maxPriorityFeePerGas`: Propina para mineros

---

### EIP-6963: Multi Injected Provider Discovery

**Anuncio de Provider:**
```javascript
window.addEventListener('eip6963:requestProvider', () => {
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: {
      info: {
        uuid: 'codecrypto-unique-id',
        name: 'CodeCrypto',
        icon: 'data:image/svg+xml,...',
        rdns: 'io.codecrypto'
      },
      provider: window.codecrypto
    }
  }))
})

// Auto-anuncio al cargar
window.dispatchEvent(new Event('eip6963:requestProvider'))
```

---

## 📚 DEPENDENCIAS Y TECNOLOGÍAS

### package.json ⭐ ACTUALIZADO

```json
{
  "dependencies": {
    "ethers": "^6.15.0",      // Librería Ethereum
    "react": "^19.1.1",       // UI framework
    "react-dom": "^19.1.1"    // React DOM
  },
  "devDependencies": {
    "@types/chrome": "^0.1.24",        // ⭐ Tipos de Chrome API
    "@types/node": "^24.6.0",          // ⭐ Tipos de Node.js
    "@vitejs/plugin-react": "^5.0.4",
    "typescript": "~5.9.3",
    "vite": "^7.1.7"
  },
  "scripts": {
    "build": "tsc -b && vite build"    // ⭐ Simplificado (sin copy)
  }
}
```

**Dependencias Clave:**
- `@types/chrome` - Tipos TypeScript para Chrome Extension API
- `@types/node` - Tipos para Node.js (usado en vite.config.ts)
- `ethers` - Solo se importa en background.ts, no en popup

### Ethers.js v6 - Conceptos Clave

#### 1. Mnemonic (BIP-39)
```typescript
import { ethers } from 'ethers'

// Generar mnemonic aleatorio
const mnemonic = ethers.Wallet.createRandom().mnemonic

// Desde frase existente
const mnemonicObj = ethers.Mnemonic.fromPhrase('test test test...')
```

#### 2. HD Wallet (BIP-44)
```typescript
// Ruta estándar Ethereum: m/44'/60'/0'/0/index
const path = `m/44'/60'/0'/0/${index}`

// Derivar wallet
const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path)

console.log(wallet.address)     // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
console.log(wallet.privateKey)  // 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

#### 3. JsonRpcProvider
```typescript
const provider = new ethers.JsonRpcProvider('http://localhost:8545')

// Obtener balance
const balance = await provider.getBalance(address)

// Obtener fee data
const feeData = await provider.getFeeData()
```

#### 4. Signer
```typescript
const signer = wallet.connect(provider)

// Enviar transacción
const tx = await signer.sendTransaction({
  to: '0x...',
  value: ethers.parseEther('0.1')
})

await tx.wait()  // Esperar confirmación
```

#### 5. Typed Data Signing (EIP-712)
```typescript
const signature = await wallet.signTypedData(
  domain,   // { name, version, chainId, verifyingContract }
  types,    // { Person: [{ name: 'name', type: 'string' }] }
  message   // { name: 'Alice', wallet: '0x...' }
)
```

---

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

---

## 💾 PERSISTENCIA Y STORAGE

### Datos Guardados en chrome.storage.local

```javascript
{
  // Mnemonic de 12 palabras (BIP-39)
  codecrypto_mnemonic: "test test test test test test test test test test test junk",
  
  // Array de 5 direcciones derivadas (BIP-44)
  codecrypto_accounts: [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",  // Cuenta 0
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",  // Cuenta 1
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",  // Cuenta 2
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906",  // Cuenta 3
    "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"   // Cuenta 4
  ],
  
  // Índice de la cuenta activa (0-4)
  codecrypto_current_account: "0",
  
  // Chain ID actual
  codecrypto_chain_id: "0x7a69",  // 31337 (Hardhat) o "0xaa36a7" (Sepolia)
  
  // Solicitud pendiente de firma (temporal)
  codecrypto_pending_request: {
    approvalId: 1,
    method: "eth_sendTransaction",
    params: [{ to, value, data }],
    chainId: "0x7a69"
  }
}
```

### API de Storage

```javascript
// Guardar
await chrome.storage.local.set({
  key: value
})

// Leer
chrome.storage.local.get(['key1', 'key2'], (result) => {
  console.log(result.key1, result.key2)
})

// O con Promise:
const result = await new Promise((resolve) => {
  chrome.storage.local.get(['key'], resolve)
})

// Limpiar todo
chrome.storage.local.clear()

// Eliminar una clave
chrome.storage.local.remove('key')

// Escuchar cambios
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (changes.key) {
    console.log('Nuevo valor:', changes.key.newValue)
    console.log('Valor anterior:', changes.key.oldValue)
  }
})
```

---

## 🧪 TESTING Y DESARROLLO

### Setup del Entorno

```bash
# 1. Clonar/crear proyecto
npm install

# 2. Iniciar Hardhat (blockchain local)
# Terminal 1:
npx hardhat node

# Output esperado:
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
...

# 3. Build de la extensión
# Terminal 2:
npm run build

# 4. Cargar en Chrome
chrome://extensions/
→ Modo desarrollador: ON
→ Cargar extensión sin empaquetar
→ Seleccionar carpeta: dist/

# 5. Configurar wallet
→ Click en ícono de extensión
→ Ingresar mnemonic: test test test test test test test test test test test junk
→ Click "Cargar Wallet"
→ Verificar 5 cuentas

# 6. Probar
→ Abrir test.html en navegador
→ Conectar
→ Hacer transacciones
```

### Mnemonic de Prueba (Compatible con Hardhat)

```
test test test test test test test test test test test junk
```

**Genera estas cuentas (compatibles con Hardhat):**

| Índice | Dirección | Balance Hardhat |
|--------|-----------|-----------------|
| 0 | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 | 10,000 ETH |
| 1 | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | 10,000 ETH |
| 2 | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC | 10,000 ETH |
| 3 | 0x90F79bf6EB2c4f870365E785982E1f101E93b906 | 10,000 ETH |
| 4 | 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 | 10,000 ETH |

---

## 📊 CASOS DE USO Y TESTING

### Test 1: Inicialización de Wallet

**Pasos:**
1. Abrir popup de extensión
2. Verificar que muestra formulario (primera vez)
3. Ingresar mnemonic de prueba
4. Click "Cargar Wallet"
5. Verificar que aparecen 5 cuentas
6. Verificar balances (10,000 ETH c/u)

**Resultado esperado:**
- ✅ 5 cuentas listadas
- ✅ Balances correctos
- ✅ Cuenta 0 seleccionada por defecto
- ✅ Chain ID: 0x7a69 (31337)

---

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

---

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

---

## 🛠️ GUÍA DE IMPLEMENTACIÓN

### Fase 1: Setup Inicial (2-3 horas)

**Tareas:**
1. ✅ Crear proyecto con Vite + React + TypeScript
2. ✅ Instalar ethers.js
3. ✅ Crear estructura de carpetas
4. ✅ Configurar vite.config.ts para múltiples entry points
5. ✅ Crear manifest.json básico

**Entregable:** Proyecto que compila con `npm run build`

---

### Fase 2: UI Básica del Popup (4-5 horas)

**Tareas:**
1. ✅ Crear App.tsx con formulario de mnemonic
2. ✅ Implementar derivación de cuentas HD
3. ✅ Mostrar lista de cuentas
4. ✅ Mostrar balance (hardcoded por ahora)
5. ✅ Estilo básico con CSS

**Entregable:** Popup funcional que deriva 5 cuentas

---

### Fase 3: Provider EIP-1193 (6-8 horas)

**Tareas:**
1. ✅ Crear inject.js con window.codecrypto
2. ✅ Implementar método request()
3. ✅ Implementar on() y removeListener()
4. ✅ Crear content-script.js para relay
5. ✅ Implementar comunicación con postMessage

**Entregable:** window.codecrypto disponible en páginas web

---

### Fase 4: Background Service Worker (8-10 horas)

**Tareas:**
1. ✅ Crear background.js
2. ✅ Implementar handleRPCRequest()
3. ✅ Implementar eth_requestAccounts
4. ✅ Implementar eth_chainId
5. ✅ Implementar eth_getBalance (con fetch)
6. ✅ Gestión de storage

**Entregable:** Métodos básicos funcionando

---

### Fase 5: Páginas Independientes (12-15 horas)

**Tareas:**
1. ✅ Crear Connect.tsx y connect.html ⭐ NUEVO
2. ✅ Implementar selección de cuenta al conectar
3. ✅ Crear Notification.tsx y notification.html
4. ✅ Implementar sistema de queue (pendingApprovals + pendingConnections)
5. ✅ Guardar solicitudes en storage
6. ✅ Abrir ventanas automáticamente
7. ✅ Derivar wallet en páginas independientes
8. ✅ Firmar transacción con ethers.js
9. ✅ Enviar respuestas (CONNECT_RESPONSE, SIGN_RESPONSE)
10. ✅ Resolver Promises en background

**Entregable:** eth_requestAccounts y eth_sendTransaction con UI profesional independiente

---

### Fase 6: Firma EIP-712 (3-4 horas)

**Tareas:**
1. ✅ Implementar eth_signTypedData_v4 en background
2. ✅ Soporte en Notification.tsx
3. ✅ UI para mostrar JSON formateado
4. ✅ Firma con wallet.signTypedData()

**Entregable:** Firma de mensajes tipados funcionando

---

### Fase 7: Eventos y Sincronización (4-5 horas)

**Tareas:**
1. ✅ Implementar accountsChanged
2. ✅ Implementar chainChanged
3. ✅ chrome.storage.onChanged listener
4. ✅ Emitir eventos a todas las pestañas
5. ✅ Soporte en inject.js para eventos

**Entregable:** Cambios sincronizados entre popup y dApps

---

### Fase 8: Features Avanzadas (6-8 horas)

**Tareas:**
1. ✅ Transferencias entre cuentas
2. ✅ Reset wallet
3. ✅ Badge contador
4. ✅ Notificaciones Chrome
5. ✅ Historial de logs
6. ✅ Auto-carga desde storage

**Entregable:** Todas las 36 especificaciones completadas

---

### Fase 9: Testing y Debugging (4-6 horas)

**Tareas:**
1. ✅ Probar todos los casos de uso
2. ✅ Verificar persistencia
3. ✅ Probar con Hardhat
4. ✅ Probar con Sepolia
5. ✅ Manejo de errores
6. ✅ Logs detallados

**Entregable:** Extensión completamente funcional

---

### Fase 10: Documentación (2-3 horas)

**Tareas:**
1. ✅ README.md completo
2. ✅ Comentarios en código
3. ✅ Guías de usuario
4. ✅ Troubleshooting

**Entregable:** Documentación completa

---

## 📖 CONCEPTOS CLAVE A DOMINAR

### 1. BIP-39: Mnemonic Phrases

**¿Qué es?**
Un estándar para generar frases de recuperación de 12-24 palabras que pueden regenerar una wallet completa.

**Ejemplo:**
```
test test test test test test test test test test test junk
```

**Implementación:**
```typescript
import { ethers } from 'ethers'

// Crear mnemonic aleatorio
const wallet = ethers.Wallet.createRandom()
const phrase = wallet.mnemonic.phrase

// Desde frase existente
const mnemonic = ethers.Mnemonic.fromPhrase(phrase)
```

---

### 2. BIP-44: HD Wallet Derivation

**¿Qué es?**
Estándar para derivar múltiples direcciones desde un solo mnemonic.

**Ruta Ethereum:**
```
m / 44' / 60' / 0' / 0 / index
│    │     │     │    │    │
│    │     │     │    │    └─ Índice de cuenta (0, 1, 2, ...)
│    │     │     │    └────── Change (siempre 0 para recibir)
│    │     │     └─────────── Account (siempre 0)
│    │     └───────────────── Coin type (60 = Ethereum)
│    └─────────────────────── BIP-44 purpose
└──────────────────────────── Master
```

**Implementación:**
```typescript
const mnemonicObj = ethers.Mnemonic.fromPhrase(phrase)

for (let i = 0; i < 5; i++) {
  const path = `m/44'/60'/0'/0/${i}`
  const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path)
  
  console.log(`Cuenta ${i}:`, wallet.address)
}
```

---

### 3. Chrome Extension Manifest V3

**Diferencias con V2:**
- Background pages → Service workers
- executeScript → Scripting API
- Promises más usadas que callbacks

**Service Workers:**
- No tienen acceso a DOM
- No pueden usar `window`
- No pueden cargar librerías desde CDN
- Son event-driven (se duermen cuando no hay actividad)

**Content Scripts:**
- Tienen acceso a DOM
- Pueden comunicarse con background via chrome.runtime
- Pueden inyectar scripts en página

**Inject Scripts:**
- Ejecutan en contexto de página
- Tienen acceso a window
- Pueden modificar window.ethereum, window.codecrypto, etc.
- Se comunican con content script via postMessage

---

### 4. Provider Pattern (EIP-1193)

**Concepto:**
Un objeto global (window.codecrypto) que expone métodos para interactuar con la blockchain.

**Interfaz:**
```typescript
interface EthereumProvider {
  request(args: RequestArguments): Promise<unknown>
  on(eventName: string, listener: (...args: any[]) => void): void
  removeListener(eventName: string, listener: (...args: any[]) => void): void
}

interface RequestArguments {
  method: string
  params?: unknown[]
}
```

**Métodos Comunes:**
- `eth_requestAccounts`: Solicitar acceso a cuentas
- `eth_accounts`: Obtener cuentas (sin solicitar)
- `eth_chainId`: Obtener ID de red
- `eth_getBalance`: Obtener balance
- `eth_sendTransaction`: Enviar transacción
- `eth_sign`: Firmar mensaje (legacy)
- `eth_signTypedData_v4`: Firmar mensaje tipado
- `personal_sign`: Firmar mensaje personal

**Eventos:**
- `accountsChanged`: Cuando cambia la cuenta
- `chainChanged`: Cuando cambia la red
- `connect`: Cuando se conecta
- `disconnect`: Cuando se desconecta

---

### 5. Async Communication Patterns

**Pattern A: Request-Response con Promises**
```javascript
// inject.js
const promise = new Promise((resolve, reject) => {
  const id = Date.now()
  
  // Guardar resolver
  pendingRequests.set(id, { resolve, reject })
  
  // Enviar solicitud
  window.postMessage({ type: 'REQUEST', id, data }, '*')
  
  // Timeout
  setTimeout(() => {
    pendingRequests.delete(id)
    reject(new Error('Timeout'))
  }, 30000)
})

// Cuando llega respuesta
window.addEventListener('message', (event) => {
  if (event.data.type === 'RESPONSE') {
    const pending = pendingRequests.get(event.data.id)
    pending.resolve(event.data.result)
  }
})
```

**Pattern B: Event Emitter**
```javascript
const eventListeners = {}

function on(eventName, callback) {
  if (!eventListeners[eventName]) {
    eventListeners[eventName] = []
  }
  eventListeners[eventName].push(callback)
}

function emit(eventName, data) {
  const listeners = eventListeners[eventName] || []
  listeners.forEach(callback => callback(data))
}
```

**Pattern C: Chrome Runtime Messaging**
```javascript
// Enviar mensaje
chrome.runtime.sendMessage({
  type: 'MY_TYPE',
  data: {...}
}, (response) => {
  console.log('Respuesta:', response)
})

// Recibir mensaje
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MY_TYPE') {
    // Procesar
    sendResponse({ result: 'OK' })
    return true  // Mantener canal abierto si es async
  }
})
```

---

## 🎨 UI/UX CONSIDERACIONES

### Popup Principal (index.html)

**Layout:**
```
┌─────────────────────────┐
│  🔐 CodeCrypto Wallet   │
├─────────────────────────┤
│  Cuenta: [Dropdown ▼]  │
│  0xf39...               │
│  Balance: 10,000 ETH    │
│                         │
│  Red: [Dropdown ▼]      │
│  Hardhat (31337)        │
├─────────────────────────┤
│  🔄 Transfer            │
│  De: [Cuenta 0 ▼]      │
│  A:  [Cuenta 1 ▼]      │
│  ETH: [____]           │
│  [💸 Transferir]       │
├─────────────────────────┤
│  📊 LOGS                │
│  > eth_requestAccounts  │
│  > accountsChanged      │
│  > eth_sendTransaction  │
│  ...                    │
├─────────────────────────┤
│  [🔄 Reset Wallet]      │
└─────────────────────────┘
```

### Página de Confirmación (notification.html)

**Layout:**
```
┌─────────────────────────┐
│  🔐 CodeCrypto Wallet  │
│  Solicitud de Firma    │
├─────────────────────────┤
│                         │
│  💸 Confirmar TX        │
│                         │
│  ┌─────────────────────┐│
│  │ PARA:               ││
│  │ 0x709...            ││
│  └─────────────────────┘│
│                         │
│  ┌─────────────────────┐│
│  │ VALOR:              ││
│  │ 0.1 ETH             ││
│  └─────────────────────┘│
│                         │
│  ┌─────────────────────┐│
│  │ RED:                ││
│  │ Hardhat (31337)     ││
│  └─────────────────────┘│
│                         │
├─────────────────────────┤
│  [❌ Rechazar] [✅ OK]  │
└─────────────────────────┘
```

**Principios de Diseño:**
- ✅ Información clara y concisa
- ✅ Botones grandes y obvios
- ✅ Colores: Rojo (rechazar), Verde (aprobar)
- ✅ Gradiente en header (profesional)
- ✅ Monospace para addresses y hashes
- ✅ Scroll solo si es necesario

---

## ⚠️ PROBLEMAS COMUNES Y SOLUCIONES

### Problema 1: "Cannot derive root path"

**Error:**
```
TypeError: cannot derive root path (i.e. path starting with "m/") 
for a node at non-zero depth 5
```

**Causa:**
```typescript
// ❌ INCORRECTO:
const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic)
wallet.derivePath("m/44'/60'/0'/0/0")  // Error!
```

**Solución:**
```typescript
// ✅ CORRECTO:
const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic)
const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, "m/44'/60'/0'/0/0")
```

---

### Problema 2: "Cannot use import statement outside a module" ⭐ ACTUALIZADO

**Causa:**
Service worker usa imports ES6 pero manifest.json no declara `"type": "module"`:
```javascript
// ❌ Error si falta "type": "module" en manifest:
import { ethers } from 'ethers'  // SyntaxError!
```

**Solución:**
```json
// manifest.json (generado desde src/manifest.ts)
{
  "background": {
    "service_worker": "background.js",
    "type": "module"  // ✅ Requerido para ES6 imports
  }
}
```

**Arquitectura Correcta:**
- ✅ src/background.ts importa ethers directamente
- ✅ Vite hace bundle con ethers incluido localmente
- ✅ NO se usa CDN (viola Content Security Policy)
- ✅ background.js generado incluye todo el código de ethers
- ✅ manifest.json declara "type": "module"

---

### Problema 3: "No accounts available"

**Causa:**
Storage vacío o wallet no configurada.

**Solución:**
```javascript
// Siempre verificar:
const accounts = storage.codecrypto_accounts

if (!Array.isArray(accounts) || accounts.length === 0) {
  throw new Error('No accounts available. Please setup wallet.')
}

if (currentAccountIndex >= accounts.length) {
  throw new Error('Invalid account index')
}
```

---

### Problema 4: Timeout en Solicitudes

**Causa:**
- Popup cerrado cuando llega mensaje
- Storage vacío
- Race condition

**Solución:**
- ✅ Derivar wallet desde storage en notification.html
- ✅ No depender de estado del popup
- ✅ Timeout apropiado (30s inject.js, 120s background)

---

### Problema 5: Hash/Signature Llega como null

**Causa:**
`sendResponse` no funciona bien con operaciones muy asíncronas (esperar usuario + firmar).

**Solución:**
```javascript
// ❌ NO usar sendResponse para operaciones largas
sendResponse({ result: hash })  // Puede fallar

// ✅ Usar nuevo mensaje
chrome.runtime.sendMessage({
  type: 'SIGN_RESPONSE',
  result: hash
})
```

---

## 📐 DIAGRAMA DE SECUENCIA COMPLETO

### Envío de Transacción (eth_sendTransaction)

```
Usuario (test.html)
    │
    │ Click "Enviar TX"
    ├──────────────────────────────────────────────────────┐
    │                                                       │
    ▼                                                       │
window.codecrypto.request({ eth_sendTransaction })         │
    │                                                       │
    ▼                                                       │
inject.js                                                  │
    │ window.postMessage({ CODECRYPTO_REQUEST })          │
    ├─────────────────────────────────────┐               │
    │                                     │               │
    │                                     ▼               │
    │                              content-script.js      │
    │                                     │               │
    │                                     │ chrome.runtime.sendMessage
    │                                     │               │
    │                                     ▼               │
    │                              background.js          │
    │                                     │               │
    │                                     │ handleRPCRequest
    │                                     │               │
    │                                     │ Guardar en storage
    │                                     │               │
    │                                     │ chrome.windows.create
    │                                     │               │
    │                                     ▼               │
    │                              notification.html      │
    │                                     │               │
    │                                     │ Cargar datos storage
    │                                     │               │
    │                                     │ Mostrar detalles
    │                                     │               │
    │                              Usuario ve confirmación│
    │                                     │               │
    │                                     │ Click "Aprobar"
    │                                     │               │
    │                                     │ Derivar wallet
    │                                     │               │
    │                                     │ Firmar TX
    │                                     │               │
    │                                     │ txHash = "0x..."
    │                                     │               │
    │                                     │ SIGN_RESPONSE │
    │                                     │               │
    │                                     ▼               │
    │                              background.js          │
    │                                     │               │
    │                                     │ Resolver Promise
    │                                     │               │
    │                                     │ sendResponse  │
    │                                     │               │
    │                                     ▼               │
    │                              content-script.js      │
    │                                     │               │
    │                                     │ postMessage   │
    ├─────────────────────────────────────┘               │
    │                                                       │
    ▼                                                       │
inject.js                                                  │
    │ Resolve Promise                                      │
    │                                                       │
    ▼                                                       │
test.html                                                  │
    │                                                       │
    │ Recibe txHash                                        │
    │                                                       │
    ├───────────────────────────────────────────────────────┘
    │
    ▼
Muestra: "✅ Transacción enviada: 0xABC..."
```

---

## 🎓 CRITERIOS DE EVALUACIÓN

### Funcionalidad (40 puntos)

- [ ] Wallet genera y carga mnemonic correctamente (5 pts)
- [ ] Deriva 5 cuentas HD con rutas correctas (5 pts)
- [ ] Provider window.codecrypto inyectado en páginas (5 pts)
- [ ] eth_requestAccounts funciona (3 pts)
- [ ] eth_sendTransaction firma y envía correctamente (8 pts)
- [ ] eth_signTypedData_v4 firma mensajes EIP-712 (7 pts)
- [ ] Eventos accountsChanged y chainChanged funcionan (4 pts)
- [ ] Persistencia con chrome.storage (3 pts)

### Arquitectura (20 puntos)

- [ ] Separación correcta de componentes (5 pts)
- [ ] Comunicación asíncrona robusta (5 pts)
- [ ] Manejo de errores apropiado (5 pts)
- [ ] Código limpio y comentado (5 pts)

### UX/UI (15 puntos)

- [ ] Popup funcional e intuitivo (5 pts)
- [ ] notification.html clara y profesional (5 pts)
- [ ] test.html funcional (3 pts)
- [ ] Logs útiles y bien formateados (2 pts)

### Estándares (15 puntos)

- [ ] EIP-1193 implementado correctamente (4 pts)
- [ ] EIP-712 implementado correctamente (4 pts)
- [ ] EIP-1559 gas management (4 pts)
- [ ] EIP-6963 provider discovery (3 pts)

### Documentación (10 puntos)

- [ ] README completo (4 pts)
- [ ] Comentarios en código (3 pts)
- [ ] Instrucciones de instalación (3 pts)

**TOTAL: 100 puntos**

---

## 📚 RECURSOS DE REFERENCIA

### Documentación Oficial

1. **Ethers.js:** https://docs.ethers.org/v6/
2. **Chrome Extensions:** https://developer.chrome.com/docs/extensions/
3. **EIP-1193:** https://eips.ethereum.org/EIPS/eip-1193
4. **EIP-712:** https://eips.ethereum.org/EIPS/eip-712
5. **EIP-1559:** https://eips.ethereum.org/EIPS/eip-1559
6. **EIP-6963:** https://eips.ethereum.org/EIPS/eip-6963
7. **BIP-39:** https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
8. **BIP-44:** https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki

### Herramientas

1. **Hardhat:** Framework de desarrollo Ethereum
2. **Vite:** Build tool para React
3. **TypeScript:** Type safety
4. **Chrome DevTools:** Debugging

---

## ⚙️ COMANDOS ÚTILES

### Desarrollo

```bash
# Instalar dependencias (incluye @types/chrome)
npm install

# Desarrollo (con hot reload)
npm run dev

# Build para producción ⭐ ACTUALIZADO
npm run build
# Esto ejecuta:
# 1. tsc -b (compila TypeScript)
# 2. vite build (genera bundles)
#    - Compila src/background.ts → dist/background.js (con ethers)
#    - Compila src/content-script.ts → dist/content-script.js
#    - Compila src/inject.ts → dist/inject.js
#    - Genera dist/manifest.json desde src/manifest.ts
#    - Compila React (App, Connect, Notification)

# Linter
npm run lint
```

**Output esperado:**
```
dist/
├── manifest.json          ✨ Auto-generado
├── background.js         ✨ Compilado con ethers (~11 KB)
├── content-script.js     ✨ Compilado (~1 KB)
├── inject.js            ✨ Compilado (~2 KB)
├── index.html
├── notification.html
├── connect.html
└── assets/
    ├── hdwallet-*.js     (~66 KB)
    ├── provider-jsonrpc-*.js (~258 KB)
    ├── App-*.js          (~194 KB)
    └── ...
```

### Chrome Extension

```bash
# Cargar extensión
chrome://extensions/
→ Load unpacked → dist/

# Recargar después de cambios
chrome://extensions/
→ Reload button

# Ver logs de service worker
chrome://extensions/
→ service worker → Console

# Ver logs de popup
Click derecho en popup → Inspect

# Ver logs de notification
Click derecho en notification → Inspect (antes de aprobar)
```

### Storage

```bash
# Ver storage (en service worker console)
chrome.storage.local.get(null, console.log)

# Limpiar storage
chrome.storage.local.clear()

# Eliminar una clave
chrome.storage.local.remove('codecrypto_mnemonic')
```

### Hardhat

```bash
# Iniciar nodo local
npx hardhat node

# En otra terminal, deploy de contratos (opcional)
npx hardhat run scripts/deploy.js --network localhost

# Verificar balance
npx hardhat console --network localhost
> await ethers.provider.getBalance('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
```

---

## 🔍 DEBUGGING

### Herramientas de Debugging

1. **Chrome DevTools:**
   - Console para logs
   - Network para ver RPC calls
   - Sources para breakpoints

2. **React DevTools:**
   - Ver estado de componentes
   - Props inspector

3. **Logs Extensivos:**
   ```javascript
   console.log('🔵 Paso 1:', data)
   console.log('✅ Éxito:', result)
   console.error('❌ Error:', error)
   ```

4. **Storage Inspector:**
   ```javascript
   chrome.storage.local.get(null, (data) => {
     console.table(data)
   })
   ```

---

## 🚨 SEGURIDAD Y ADVERTENCIAS

### ⚠️ SOLO PARA DESARROLLO

**Este proyecto es SOLO para aprendizaje y desarrollo:**

- ❌ NO usar en producción
- ❌ NO almacenar fondos reales
- ❌ NO compartir mnemonic real
- ❌ Mnemonic sin encriptar (solo OK para desarrollo)

### 🔐 Para Producción Requeriría:

1. **Encriptación:**
   - Mnemonic encriptado con contraseña
   - Derivación de clave con PBKDF2
   - Salt único por usuario

2. **Auto-lock:**
   - Timeout de inactividad
   - Requiere contraseña para desbloquear

3. **Seguridad Adicional:**
   - CSP (Content Security Policy)
   - Validación de inputs
   - Rate limiting
   - Detección de phishing

4. **Auditoría:**
   - Code review profesional
   - Auditoría de seguridad
   - Penetration testing

---

## 📝 ENTREGA DEL PROYECTO

### Archivos a Entregar

1. **Código fuente completo:**
   - src/
   - public/
   - Archivos de configuración

2. **Build compilado:**
   - dist/ (para probar directamente)

3. **Documentación:**
   - README.md
   - INSTRUCCIONES.md
   - Comentarios en código

4. **Video demo (opcional):**
   - Inicialización
   - Conexión desde dApp
   - Envío de transacción
   - Firma EIP-712
   - Cambio de cuenta/red

### Formato

```
apellido_nombre_wallet.zip
├── src/
├── public/
├── dist/
├── README.md
├── package.json
├── video_demo.mp4 (opcional)
└── ...
```

---

## 🎯 DESAFÍOS ADICIONALES (Opcional)

Si terminas antes y quieres más:

### Desafío 1: Múltiples Mnemonics
Permitir múltiples wallets, cambiar entre ellas.

### Desafío 2: ERC-20 Tokens
Mostrar y transferir tokens ERC-20.

### Desafío 3: ENS Support
Resolver nombres ENS (ej. vitalik.eth)

### Desafío 4: Transaction History
Mostrar historial on-chain de transacciones.

### Desafío 5: QR Code
Generar QR para recibir fondos.

### Desafío 6: Dark Mode
Theme switcher.

### Desafío 7: Multi-idioma
Soporte para español e inglés.

### Desafío 8: Export/Import
Exportar/importar datos de wallet.

---

## 📊 ESTADÍSTICAS DEL PROYECTO ⭐ ACTUALIZADO

### Líneas de Código (Aproximadas)

| Archivo | Líneas | Notas |
|---------|--------|-------|
| App.tsx | 654 | ⭐ Reducido (delegó crypto al background) |
| Connect.tsx | 270 | - |
| Notification.tsx | 297 | ⭐ Simplificado (solo aprueba) |
| background.ts | 659 | ⭐ Aumentado (hace firma con ethers) |
| inject.ts | 175 | ⭐ TypeScript |
| content-script.ts | 93 | ⭐ TypeScript |
| manifest.ts | 86 | ⭐ NUEVO (TypeScript) |
| test.html | 843 | - |
| App.css | 501 | - |
| **TOTAL CÓDIGO** | **~3,600** | Más limpio y organizado |

### Archivos TypeScript

- **App.tsx, Connect.tsx, Notification.tsx** - React componentes
- **background.ts** - Service worker con ethers ⭐ NUEVO
- **content-script.ts** - Content script ⭐ NUEVO
- **inject.ts** - Inject script ⭐ NUEVO
- **manifest.ts** - Manifest generator ⭐ NUEVO
- **Total:** 100% TypeScript

### Compilado (dist/)

- **background.js:** ~11 KB (incluye lógica de firma)
- **content-script.js:** ~1.1 KB
- **inject.js:** ~2 KB
- **Bundle popup (App):** ~194 KB
- **Bundle ethers (hdwallet):** ~66 KB
- **Bundle ethers (provider-jsonrpc):** ~258 KB
- **Bundle connect:** ~5.1 KB
- **Bundle notification:** ~5.8 KB
- **Total:** ~543 KB (optimizado con tree-shaking)

### Páginas HTML

- **index.html** - Popup principal (gestión)
- **connect.html** - Selección de cuenta
- **notification.html** - Confirmación de firmas

### Arquitectura

- ✅ **100% TypeScript** (todo el código)
- ✅ **Type-safe** (interfaces y tipos completos)
- ✅ **Auto-generado** (manifest, scripts de extensión)
- ✅ **Bundle optimizado** (Vite + tree-shaking)
- ✅ **CSP compliant** (sin CDN, todo local)

---

## ⏱️ CRONOGRAMA SUGERIDO

### Semana 1 (15-20 horas)
- Días 1-2: Setup + UI básica (Fases 1-2)
- Días 3-4: Provider EIP-1193 (Fase 3)
- Días 5-7: Background worker (Fase 4)

### Semana 2 (15-20 horas)
- Días 8-10: Firma de transacciones (Fase 5)
- Días 11-12: Firma EIP-712 (Fase 6)
- Días 13-14: Eventos (Fase 7)

### Semana 3 (10-15 horas)
- Días 15-17: Features avanzadas (Fase 8)
- Días 18-19: Testing completo (Fase 9)
- Día 20: Documentación (Fase 10)

---

## 🎓 CONCLUSIÓN

Este proyecto te dará experiencia práctica en:

- ✅ Desarrollo de extensiones Chrome complejas
- ✅ Integración con blockchain Ethereum
- ✅ Implementación de estándares Web3
- ✅ Arquitecturas asíncronas y event-driven
- ✅ Criptografía aplicada (HD wallets)
- ✅ React + TypeScript avanzado
- ✅ UX para aplicaciones crypto

Al completarlo, tendrás un **portfolio project** sólido que demuestra conocimientos avanzados en desarrollo Web3.

---

## 📞 PREGUNTAS FRECUENTES

### ¿Puedo usar otras librerías además de ethers.js?

NO. La especificación requiere usar **solo ethers.js** para operaciones crypto. No uses viem, web3.js, @scure/bip39, etc.

### ¿Puedo cambiar el diseño de la UI?

SÍ. Mientras cumpla con las especificaciones funcionales, puedes personalizar colores, layout, etc.

### ¿Debo usar TypeScript?

SÍ. El proyecto debe usar TypeScript para type safety.

### ¿Funciona en Firefox?

NO directamente. Chrome Extension Manifest V3 no es totalmente compatible con Firefox. El proyecto está diseñado para Chrome/Edge.

### ¿Puedo hacer el proyecto en equipo?

Consultar con el instructor. Generalmente es individual.

---

---

## 🏗️ ARQUITECTURA ACTUALIZADA (TypeScript + Background Signing) ⭐

### Cambios Clave en la Arquitectura

Este proyecto ha sido actualizado con una arquitectura mejorada:

#### 1. **100% TypeScript**
- ✅ Todos los archivos de extensión en TypeScript
- ✅ `src/background.ts` - Service worker con ethers
- ✅ `src/content-script.ts` - Content script tipado
- ✅ `src/inject.ts` - Inject script tipado
- ✅ `src/manifest.ts` - Manifest con validación de tipos

#### 2. **Background Script Firma Todo** (Cambio de Arquitectura)

**Antes:**
```
Popup (App.tsx) → usa ethers directamente → firma transacciones ❌
Notification.tsx → usa ethers directamente → firma después de aprobar ❌
```

**Ahora:**
```
Popup (App.tsx) → envía mensajes al background → NO usa ethers ✅
Notification.tsx → solo aprueba/rechaza → NO firma ✅
background.ts → recibe aprobación → firma con ethers ✅
```

**Ventajas:**
- ✅ Cumple con Content Security Policy
- ✅ Popup puede cerrarse sin afectar operaciones
- ✅ Mnemonic solo accesible en background (más seguro)
- ✅ Separación de responsabilidades clara
- ✅ Más fácil de mantener y debuggear

#### 3. **Vite Build System Completo**

**vite.config.ts incluye:**
```typescript
{
  input: {
    main: './index.html',              // Popup
    notification: './notification.html', // Confirmación
    connect: './connect.html',          // Conexión
    background: 'src/background.ts',    // Service worker ⭐
    'content-script': 'src/content-script.ts', // Content script ⭐
    inject: 'src/inject.ts',            // Inject script ⭐
  },
  output: {
    entryFileNames: (chunkInfo) => {
      // Scripts de extensión en raíz de dist/
      if (chunkInfo.name === 'background' || 
          chunkInfo.name === 'content-script' || 
          chunkInfo.name === 'inject') {
        return '[name].js'
      }
      // React bundles en assets/
      return 'assets/[name]-[hash].js'
    }
  }
}
```

**Plugin personalizado para manifest:**
```typescript
function manifestPlugin(): Plugin {
  return {
    name: 'manifest-generator',
    closeBundle: async () => {
      const manifest = await import('./src/manifest.js')
      writeFileSync('dist/manifest.json', JSON.stringify(manifest.default, null, 2))
    }
  }
}
```

#### 4. **Comunicación RPC Background ↔ Popup**

**Nuevo método en background:**
```typescript
case 'wallet_deriveAccounts':
  // Derivar cuentas HD con ethers
  const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonicPhrase)
  for (let i = 0; i < numAccounts; i++) {
    const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path)
    derivedAccounts.push(wallet.address)
  }
  return derivedAccounts
```

**Popup lo usa así:**
```typescript
// App.tsx - NO usa ethers, delega al background
const derivedAccounts = await sendRPCToBackground('wallet_deriveAccounts', [mnemonic, 5])
```

#### 5. **Flujo de Firma Actualizado**

**Paso 1:** dApp solicita firma (eth_sendTransaction)  
**Paso 2:** background.ts abre notification.html  
**Paso 3:** Usuario aprueba en notification.html  
**Paso 4:** notification.html envía SIGN_RESPONSE con `success: true`  
**Paso 5:** background.ts **firma la transacción con ethers** ⭐  
**Paso 6:** background.ts retorna el hash firmado  

**Clave:** La firma ocurre en el **background después** de la aprobación, no en notification.html

### Ventajas de esta Arquitectura

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Popup** | Usa ethers directamente | Solo UI + mensajes RPC ✅ |
| **Notification** | Firma transacciones | Solo aprueba/rechaza ✅ |
| **Background** | Solo coordina | Firma con ethers ✅ |
| **CSP** | Violaba reglas | 100% compliant ✅ |
| **Seguridad** | Mnemonic en múltiples lugares | Solo en background ✅ |
| **Mantenibilidad** | Lógica duplicada | Centralizada ✅ |
| **Type Safety** | Parcial | 100% TypeScript ✅ |
| **Build** | Manual copy | Auto-generado ✅ |

---

**¡Buena suerte con tu proyecto de wallet CodeCrypto! 🚀**

**Si tienes dudas durante el desarrollo, consulta los 20+ archivos de documentación incluidos en el proyecto.**

