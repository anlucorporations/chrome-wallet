# 🔐 TrueKeate Wallet — Extensión de Chrome

**Versión 1.1.0** · Wallet Ethereum como extensión de navegador (Manifest V3), al
estilo de MetaMask, con soporte para **EIP-1193**, **EIP-712**, **EIP-1559** y
**EIP-6963**.

Construida con **React 19 + TypeScript + Ethers.js v6** y **Foundry (anvil)** como
blockchain local de desarrollo.

> 🧩 **Wallet nativa de TrueKeate**: vive en `escrow/wallet-extension/`, se **instala desde la
> propia plataforma** (`/instalar-wallet`) y la dApp la detecta por **EIP-6963** para conectar,
> iniciar sesión (EIP-191) y firmar cada acción.
>
> ⚠️ Proyecto **educativo**: no debe usarse con fondos reales.

---

## ✨ Características

### Wallet y cuentas
- Frase de recuperación **BIP-39** (12 palabras) con validación en vivo (diccionario y checksum)
- **Crear una wallet nueva** con copia de seguridad guiada (se confirman 3 palabras al azar)
- **5 cuentas HD** derivadas con BIP-44 (`m/44'/60'/0'/0/i`)
- Auto-carga al abrir: solo pide el mnemonic la primera vez
- Restaura la **cuenta activa** y la **red** al reabrir
- **Transferencias entre cuentas propias** con validación inline del importe
- **Reset** que limpia la wallet conservando el historial de actividad

### Provider y estándares
- `window.codecrypto` (**EIP-1193**) inyectado en todas las páginas y frames
- Descubrimiento multi-wallet **EIP-6963**
- Firma de mensajes **EIP-712** (`eth_signTypedData_v4`) y **EIP-191**
  (`personal_sign`), que es la que usa TrueKeate para el login y para autorizar
  cada acción
- **Revocación del permiso del sitio** (`wallet_revokePermissions`)
- **Lecturas on-chain** (`eth_call`, `eth_blockNumber`, `eth_estimateGas`) para
  que las dApps puedan consultar contratos sin salir de la wallet
- Transacciones **EIP-1559** tipo 2 (`maxFeePerGas` / `maxPriorityFeePerGas`)
- **Gestión de redes** (EIP-3085 / EIP-3326): `wallet_addEthereumChain` y
  `wallet_switchEthereumChain`, con alta de redes desde el popup y validación del RPC
- Eventos `accountsChanged` y `chainChanged` emitidos a **todas las pestañas**

### Experiencia de aprobación (rediseño · RF-WN-28..33, 44..56 · D-NW-9)

- **Modelo de 10 bloques** en cada aprobación: Encabezado · **Quién lo pide** · Con qué cuenta ·
  Red · **Qué autorizas** · Detalles · **Qué pasará** · **Avisos** · Datos completos · Acciones.
- **EIP-191 muestra el mensaje** y traduce las acciones de TrueKeate (`TrueKeate: <acción> (ts=…)`)
  a lenguaje llano; los mensajes binarios se marcan como ilegibles (AV-01).
- **EIP-712** pinta dominio, tipo principal y tabla `campo → valor`, y avisa de tipos peligrosos
  (`Permit`/`Approve`).
- **Transacción** decodifica destino/función, y muestra valor, gas, tarifa, **coste total** y
  consecuencias; `approve` ilimitado y contratos desconocidos generan aviso.
- **Avisos AV-01…AV-12** con severidad; ante peligro, **confirmación extra** sin bloquear (D5).
- **Nivel de detalle** Básico/Completo/Experto (por defecto Completo) en **Perfil**; plantillas
  fijas del proyecto.
- **Cambio de red** confirmado por el usuario (D3). Las operaciones internas que firman usan el
  mismo modelo.
- **Un único espacio de 480 px**: el popup de la wallet. Las solicitudes de
  **conexión**, las **firmas** (`personal_sign`, `eth_signTypedData_v4`,
  `eth_sendTransaction`) y las **notificaciones** se muestran **dentro de la
  wallet**, con el mismo diseño que las páginas internas; ya no se abren ventanas
  flotantes (`connect.html` / `notification.html` quedan como páginas heredadas).
- **Cabecera alineada arriba**: línea 1 = logo + título **TrueKeate Wallet**;
  línea 2 = selector de cuenta (dirección acortada) + nombre de la red conectada.
- **Secciones como páginas**: Cuenta, Balance, Recibir, Enviar, Comprar, Cambiar,
  Contactos, Red, Características, Configuración, Conexiones, Notificaciones,
  Redes y Perfil ocupan todo el espacio y vuelven al inicio con la **flecha ←**.
- **Badge** con el número de solicitudes pendientes y **notificación** de Chrome
  para avisar de que hay que abrir la wallet.
- La dApp espera hasta **130 s** (la aprobación caduca a los 120 s)
- Las solicitudes **sobreviven** a que Chrome duerma el service worker
- **Panel de actividad** en el popup que muestra también lo que ocurre en las dApps:
  llamadas RPC, eventos, transacciones, firmas y errores (historial de 200 entradas
  persistido, con botón para limpiarlo)

### Identidad visual

La extensión usa el **sistema de diseño de TrueKeate** (RNF-08, «Bóveda Digital
Moderna»): los tokens viven en `src/theme.css` y son los mismos que
`escrow/web/app/globals.css` (navy `#1A2B4C`, teal `#2A9D8F`, gold `#D4AF37`).
Los iconos se generan con `npm run` → `node scripts/generate-icons.mjs`, que
dibuja el anillo hexagonal dorado sobre el degradado de marca, y los activos de
marca están en `public/brand/`.

### Página de pruebas

`test.html` es un banco de pruebas **externo a la extensión** (se comporta como
una dApp): descubre proveedores por EIP-6963, conecta, lee cuenta/red/balance,
firma EIP-191 y EIP-712, hace `eth_call` y revoca el permiso. Se abre en una
pestaña normal con la extensión cargada:

```bash
npm run dev      # y abre http://localhost:5173/test.html
```

### Desarrollo y pruebas
- **dApp de prueba** (`test.html`) con detección multi-wallet e historial de operaciones
- **Foundry**: `anvil` como nodo local, `forge` para contratos y `cast` para el CLI
- **Baterías propias**: importes (20), contratos (6), `background` (41) y bóveda cifrada (25)
- **Aceptación**: los 11 casos del enunciado contra anvil real (50 comprobaciones)
- **E2E de la plataforma** con esta extensión real: `cd ../web && npm run test:wallet` (50 tests)
- **Errores EIP-1193**: las dApps reciben `error.code` (4001, 4200, 4902, -32602…)
- **ESLint en 0 errores** y build de TypeScript estricto

---

## 🚀 Inicio rápido

### Requisitos

- **Node.js** 20 o superior
- **[Foundry](https://book.getfoundry.sh/getting-started/installation)** (anvil, forge, cast)

```bash
# Instalación de Foundry (una sola vez)
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

> Los scripts `npm run chain` y `npm run contracts:*` localizan las herramientas
> automáticamente mediante `scripts/foundry.sh`, así que funcionan aunque
> `~/.foundry/bin` no esté en el `PATH`.

### Puesta en marcha

```bash
npm install        # 1. dependencias
npm run chain      # 2. blockchain local (déjalo en su propia terminal)
npm run build      # 3. compila la extensión en dist/
npm run dev        # 4. sirve test.html en http://localhost:5173/test.html
```

### Cargar en Chrome

1. Abre `chrome://extensions/`
2. Activa **"Modo de desarrollador"**
3. Pulsa **"Cargar descomprimida"** y selecciona la carpeta **`dist/`**
4. Abre el popup y carga el mnemonic de prueba (hay un hint verde que lo autocompleta)

**📖 Guía detallada paso a paso: [`INSTRUCCIONES.md`](INSTRUCCIONES.md)**

---

## 🧩 Integración con TrueKeate (wallet nativa)

- **Instalación nativa**: la plataforma sirve el paquete en `/wallet/TrueKeateWallet.zip` y la
  guía en `/instalar-wallet`; el componente `InstalarWallet` (web) muestra el estado
  *instalada / no instalada*.
- **Descubrimiento**: la dApp escucha **EIP-6963** y la lista junto a MetaMask/Rabby/Backpack;
  el usuario elige en un popup y esa elección gobierna el login y las firmas de la sesión.
- **UI del popup** (identidad TrueKeate, ancho fijo 480 px, páginas a todo el ancho sin márgenes):
  - **Inicio** (rediseño 2026-09-15): ficha de **balance deslizable** (carrusel con ETH + tokens
    ERC-20 reales, flechas y puntos); **barra de operaciones** (Enviar · Recibir · Cambiar ·
    Comprar) que carga la operación **dentro** de la ficha de balance; y **ficha con pestañas**
    (Actividades · Tokens · NFTs · Contactos).
  - **Pie**: estado de la dApp + **icono de la red conectada** (icono + nombre corto, abre Redes) +
    botones icono **Configuración** (menú con Perfil · Redes · Ayuda · Notificaciones · Modo de
    vista), **Bloquear** y **Desconectar**. Queda anclado al fondo de la billetera.
  - Páginas completas con flecha de volver: **Redes** (pestañas Públicas/Prueba/**Personalizadas**,
    donde se **añaden y seleccionan** redes EVM propias), **Perfil**, **Conexiones** y
    **Notificaciones** (lista completa de la actividad con icono por tipo, hora y origen).
- **Modos de vista**: panel lateral, pestaña o **flotante** (overlay inyectado por content script).
- **Métodos solo-extensión**: `wallet_revealMnemonic`, `wallet_changeVaultPassword`,
  `wallet_exportVault`/`wallet_importVault`, `wallet_getConnectedSites`/`wallet_disconnectSite`
  (las dApps no pueden invocarlos).
- **E2E**: `cd ../web && npm run test:wallet` prueba la plataforma con esta extensión **real**
  (42 tests en `web/e2e-wallet/`).

---

## 🧪 Probar la extensión

1. Con `npm run chain` y `npm run dev` en marcha, abre <http://localhost:5173/test.html>
2. Pulsa **Conectar Wallet** → se abre `connect.html` con las 5 cuentas y sus balances
3. Prueba: enviar transacción, firmar EIP-712, cambiar de red, desconectar

`test.html` trata a `window.codecrypto` exactamente igual que a MetaMask (ambos son
proveedores EIP-1193), así que sirve también para comparar con otras wallets.

### Pruebas automatizadas

```bash
npm test                  # las cuatro baterías (96 comprobaciones)
npm run test:acceptance   # los 11 casos del enunciado contra anvil real (50)
npm run test:extension    # smoke test en Chrome real (7; requiere puppeteer)
npm run verify            # build + todas las pruebas
npm run test:amount       # conversión ETH → wei (20)
npm run test:contracts    # forge test (6)
npm run test:background   # service worker con chrome simulado (45)
npm run test:vault        # bóveda cifrada del mnemonic (25)
npm run lint              # ESLint (0 errores)
```

`npm run test:acceptance` arranca **anvil** por su cuenta, ejecuta los 11 casos de
`TAREA_PARA_ESTUDIANTE.md` de extremo a extremo (transacciones minadas de verdad,
firma EIP-712 verificada, eventos en las pestañas, reset, badge y selección de
cuenta) y escribe la evidencia en `documentacion/evidencia-fase4.md`.

### Entrega

```bash
bash scripts/package-delivery.sh      # genera el ZIP del entregable académico
python3 scripts/package-web.py        # publica TrueKeateWallet.zip en web/public/wallet/
```

El ZIP incluye el código, `dist/` ya compilado, los contratos y la documentación
vigente; excluye `node_modules` y el historial de desarrollo. `package-web.py` deja el
paquete que **sirve la plataforma** en `/wallet/TrueKeateWallet.zip`.

---

## 🔌 API del proveedor

```javascript
// Conectar
const [account] = await window.codecrypto.request({ method: 'eth_requestAccounts' })

// Consultar la cuenta autorizada (devuelve [] si el sitio no está autorizado)
await window.codecrypto.request({ method: 'eth_accounts' })

// Red actual
await window.codecrypto.request({ method: 'eth_chainId' })

// Balance
await window.codecrypto.request({ method: 'eth_getBalance', params: [account, 'latest'] })

// Enviar transacción (la aprobación aparece dentro de la wallet)
await window.codecrypto.request({
  method: 'eth_sendTransaction',
  params: [{ from: account, to: '0x…', value: '0x…', data: '0x' }]
})

// Firmar EIP-712
await window.codecrypto.request({
  method: 'eth_signTypedData_v4',
  params: [account, JSON.stringify(typedData)]
})

// Cambiar de red
await window.codecrypto.request({
  method: 'wallet_switchEthereumChain',
  params: [{ chainId: '0xaa36a7' }]
})

// Añadir una red nueva (EIP-3085); la wallet pide permiso para ese RPC
await window.codecrypto.request({
  method: 'wallet_addEthereumChain',
  params: [{
    chainId: '0x13882',
    chainName: 'Polygon Amoy',
    rpcUrls: ['https://rpc-amoy.polygon.technology'],
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    blockExplorerUrls: ['https://amoy.polygonscan.com']
  }]
})

// Eventos
window.codecrypto.on('accountsChanged', (accounts) => { … })
window.codecrypto.on('chainChanged', (chainId) => { … })
```

---

## 🌐 Redes

| Red | RPC | Chain ID |
|---|---|---|
| Local (Foundry / anvil) | `http://127.0.0.1:8545` | 31337 (`0x7a69`) |
| Sepolia | `https://rpc.sepolia.org` | 11155111 (`0xaa36a7`) |

El mnemonic de prueba (`test test … junk`) es también el de anvil por defecto, así
que las cuentas derivadas coinciden con las del nodo (cuenta 0 =
`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, 10 000 ETH cada una).

---

## 🏗️ Arquitectura

```
dApp (página web)
   │  window.codecrypto.request(…)          ← EIP-1193
   ▼
inject.ts            Crea el provider y anuncia EIP-6963
   │  window.postMessage
   ▼
content-script.ts    Puente aislado → chrome.runtime
   │  chrome.runtime.sendMessage
   ▼
background.ts        Service worker: RPC, aprobaciones, firma (ethers) y eventos
   │
   ├── connect.html / Connect.tsx            Autorizar sitios y elegir cuenta
   ├── notification.html / Notification.tsx  Aprobar o rechazar operaciones
   └── index.html / App.tsx                  Popup: cuentas, red, transferencias, logs
```

**Reparto de responsabilidades:** el popup es solo UI (no importa ethers); toda la
criptografía y la firma ocurren en el service worker, que es el único que lee el
mnemonic desde `chrome.storage.local`.

### Estructura

```
├── src/
│   ├── background.ts · vault.ts                     Service worker (RPC/firma) y bóveda cifrada
│   ├── inject.ts · content-script.ts · floating.ts  Provider EIP-1193/6963 y overlay flotante
│   ├── App.tsx · Connect.tsx · Notification.tsx     Popup (páginas + aprobaciones en línea)
│   ├── components/Aprobacion.tsx · Inicio.tsx · Pagina.tsx   Vistas del rediseño
│   └── components/                                  Tokens, NFT, Actividad, RecibirQR,
│                                                    Contactos, Comprar, Cambiar, Configuración,
│                                                    Redes, Perfil, ChainManager, VaultUnlock…
├── contracts/  test/       Contrato de ejemplo y pruebas (Foundry)
├── scripts/                Iconos, pruebas automatizadas, empaquetado web y lanzador Foundry
├── test.html               dApp de pruebas
├── dist/                   Extensión compilada (`npm run build`)
└── foundry.toml            Configuración de Foundry
```

---

## 📋 Cumplimiento del enunciado

Especificaciones funcionales de `TAREA_PARA_ESTUDIANTE.md`:

| Parte | Especificaciones | Estado |
|---|---|---|
| 1 · Core wallet | 1-6 | ✅ todas (incluye generar una wallet nueva) |
| 2 · Operaciones blockchain | 7-10 | ✅ todas |
| 3 · UX y logging | 11-16 | ✅ todas (panel de actividad con las llamadas, eventos, transacciones y firmas de las dApps) |
| 4 · Estándares EIP | 17-20 | ✅ todas (incluye añadir redes con `wallet_addEthereumChain`) |
| 5 · UI avanzada | 20-25 | ✅ todas (validación de formularios con feedback inline) |
| 6 · Persistencia | 26-28 | ✅ todas |
| 7 · Chrome Extension avanzado | 29-36 | ✅ todas |

**37/37 especificaciones implementadas.** Las mejoras pendientes (lint, tipado estricto
y desafíos opcionales) están en `documentacion/PLAN_MEJORA.md`.

---

## 📚 Documentación

| Documento | Contenido |
|---|---|
| [`INSTRUCCIONES.md`](INSTRUCCIONES.md) | Instalación, uso, los 11 casos de prueba y solución de problemas |
| [`GUIA_RAPIDA_TESTING.md`](GUIA_RAPIDA_TESTING.md) | Checklist de verificación rápida (5 minutos) |
| [`CHANGELOG.md`](CHANGELOG.md) | Novedades de la versión 1.1.0 |
| [`TAREA_PARA_ESTUDIANTE.md`](TAREA_PARA_ESTUDIANTE.md) | Enunciado del proyecto |
| [`documentacion/PLAN_MEJORA.md`](documentacion/PLAN_MEJORA.md) | Plan de mejora por fases con su estado |
| [`documentacion/historial/`](documentacion/historial/README.md) | Documentación del proceso de desarrollo |

---

## 🔒 Seguridad y limitaciones

- El mnemonic se guarda **cifrado con contraseña** (AES-GCM-256, clave derivada con
  PBKDF2-SHA256 de 600 000 iteraciones). La clave vive solo en memoria
  (`chrome.storage.session`) y se olvida al bloquear o tras 15 minutos de
  inactividad. El popup pide la contraseña al crear o importar la wallet, muestra
  una pantalla de desbloqueo cuando está cerrada, permite bloquear a mano
  (`🔒 Bloquear`) y avisa si aún queda una frase heredada en claro, ofreciendo
  cifrarla en un paso. El popup **ya no escribe la frase en disco**: solo datos
  públicos (direcciones, índice de cuenta y red).
- Solo el service worker accede a la frase; el popup nunca la maneja para firmar.
- Los permisos se conceden **por origen** y `eth_accounts` solo responde a los
  sitios autorizados.
- No usar con mnemónicos ni fondos reales: la frase de prueba es pública y sus
  claves son conocidas.

---

## 📄 Licencia

MIT
