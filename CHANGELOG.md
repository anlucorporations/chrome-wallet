# 📝 Changelog — CodeCrypto Wallet

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

> El historial de desarrollo previo a la entrega (versiones 1.1.0 → 1.3.1) se
> conserva en `documentacion/historial/CHANGELOG-historico.md`.

## [1.1.0] — Septiembre 2026

Integración con **TrueKeate**: identidad visual de la plataforma, los métodos que
faltaban para poder usarla como wallet de la dApp y una página de pruebas
mantenida.

### ✅ Agregado

- **`personal_sign` (EIP-191)** con aprobación del usuario: es la firma que usa
  TrueKeate para el inicio de sesión y para autorizar cada acción. Sin ella, la
  wallet no podía sustituir a MetaMask en la plataforma.
- **`wallet_revokePermissions`**: revoca el permiso del sitio solicitante, para
  que la desconexión de la dApp sea real y no solo local.
- **Lecturas on-chain**: `eth_call`, `eth_blockNumber` y `eth_estimateGas`, que
  permiten a las dApps leer contratos (paneles de balances) y calcular gas.
- **Página de pruebas mantenida** (`test.html`, incluida en el build): descubre
  proveedores por EIP-6963, conecta, lee cuenta/red/balance/bloque, firma EIP-191
  y EIP-712, ejecuta `eth_call`, revoca permisos y muestra el resultado de cada
  comprobación. Es independiente de la plataforma.

- **Bóveda cifrada del mnemonic** (`src/vault.ts`): la frase deja de guardarse en
  claro. Se cifra con **AES-GCM-256** usando una clave derivada de la contraseña
  con **PBKDF2-SHA256 (600 000 iteraciones + salt de 16 B)**. La clave derivada
  vive solo en `chrome.storage.session` (memoria; se pierde al cerrar el
  navegador) y se olvida al bloquear o tras **15 minutos de inactividad**.
  Métodos: `wallet_createVault`, `wallet_unlock`, `wallet_lock` y
  `wallet_vaultStatus`, **reservados a la propia wallet** (una dApp no puede
  invocarlos: si no, podría intentar fuerza bruta contra la contraseña).
  Si existe un mnemonic heredado en claro, la wallet lo sigue usando hasta que se
  cree la bóveda, y al crearla **se borra**.

- **Interfaz de la bóveda en el popup**: pide la contraseña al crear o importar la
  wallet (`VaultPassword`), muestra una pantalla de desbloqueo cuando está cerrada
  (`VaultUnlock`), permite bloquear a mano y avisa —con un botón para cifrarla— si
  queda una frase heredada en claro.

### 🔧 Cambiado

- **El popup ya no guarda la frase en disco**: `applyWallet` escribía
  `codecrypto_mnemonic` en `chrome.storage.local` en cada carga; ahora solo
  persiste las cuentas derivadas, el índice y la red.
- **La firma pasa por la bóveda** (`personal_sign`, `eth_signTypedData_v4`,
  `eth_sendTransaction`): con la bóveda bloqueada se rechaza la firma con un
  mensaje que pide desbloquear, sin abrir la ventana de aprobación.
- **Identidad visual de TrueKeate (RNF-08)**: nuevos tokens en `src/theme.css`
  (los mismos de `escrow/web/app/globals.css`) aplicados al popup, a la ventana de
  conexión y a la de confirmación, que dejan atrás la paleta heredada del
  template (morado/verde).
- **Iconos** regenerados con la paleta de marca (degradado navy→teal con anillo
  hexagonal dorado) por `scripts/generate-icons.mjs`.
- El icono que la wallet anuncia por **EIP-6963** usa ahora el color de la marca.
- El texto de la notificación de firma deja de decir «EIP-712» cuando la firma es
  EIP-191.

## [1.0.0] — Octubre 2025

Versión de entrega: **wallet Ethereum como extensión de Chrome (Manifest V3)**,
construida con React 19 + TypeScript y Ethers.js v6, con **Foundry/anvil** como
blockchain local de desarrollo.

### ✅ Agregado

#### Wallet y cuentas
- Importación de mnemonic BIP-39 (12 palabras) con **validación en vivo** (diccionario y checksum, delegada al service worker)
- **Generación de una wallet nueva** (`wallet_generateMnemonic`) con copia de seguridad guiada: se muestran las 12 palabras, se copian y se piden 3 aleatorias para confirmar que se guardaron
- Derivación de 5 cuentas HD (BIP-44, `m/44'/60'/0'/0/i`)
- Auto-carga de la wallet al abrir el popup y restauración de la cuenta activa y la red
- Persistencia en `chrome.storage.local`
- Transferencias entre cuentas propias con validación inline del importe

#### Redes
- **Gestión de redes (EIP-3085 / EIP-3326)**: `wallet_addEthereumChain` y `wallet_switchEthereumChain`
- Formulario para añadir redes desde el popup (nombre, RPC, chainId, símbolo y explorador)
- El service worker **valida que el RPC responde con el chainId declarado** antes de aceptar la red
- Permisos de host **opcionales**: al añadir una red se pide acceso solo a su RPC
  (`chrome.permissions.request`), en lugar de pedir acceso a todo internet
- Selector de red dinámico: anvil, Sepolia y las redes que añada el usuario

#### Provider y estándares
- `window.codecrypto` (EIP-1193) inyectado en todas las páginas y frames
- Anuncio y descubrimiento de proveedor EIP-6963 (`io.codecrypto.wallet`)
- Firma de mensajes EIP-712 (`eth_signTypedData_v4`)
- Transacciones EIP-1559 tipo 2 (`maxFeePerGas` / `maxPriorityFeePerGas`)
- Métodos RPC: `eth_requestAccounts`, `eth_accounts`, `eth_chainId`,
  `eth_getBalance`, `eth_sendTransaction`, `eth_signTypedData_v4`,
  `wallet_switchEthereumChain`, `wallet_addEthereumChain` y los internos
  `wallet_deriveAccounts`, `wallet_generateMnemonic`, `wallet_validateMnemonic`
- Eventos `accountsChanged` y `chainChanged` difundidos a todas las pestañas

#### Experiencia de aprobación (estilo MetaMask)
- `connect.html` (420×650) para elegir qué cuenta compartir con cada dApp
- `notification.html` (400×600) para aprobar o rechazar transacciones y firmas
- Badge con el número de solicitudes pendientes y notificación de Chrome
- Solicitudes pendientes persistidas en `chrome.storage.session`, con reapertura
  de la ventana si Chrome duerme el service worker
- Rechazo inmediato al cerrar la ventana de aprobación a mano

#### Blockchain local y contratos (Foundry)
- `anvil` como nodo local: `npm run chain` → http://127.0.0.1:8545 (chainId 31337)
- `foundry.toml` con alias RPC (`local`, `sepolia`) para `forge` y `cast`
- `contracts/WalletPlayground.sol` (depósito, contador con `data` y retiro) y
  `test/WalletPlayground.t.sol` (6 pruebas de `forge test`)
- `scripts/foundry.sh`: localiza las herramientas aunque `~/.foundry/bin` no esté
  en el `PATH`

#### Interfaz y utilidades
- Popup con selector de cuenta y de red (dinámico), saldo con polling cada 5 s,
  transferencias, gestión de redes, botón de reset y **panel de actividad** con la
  traza de las dApps y las acciones de la wallet
- Componentes separados: `WalletSetup`, `ChainManager`, `TransferSection` y `LogsPanel`
- `test.html`: dApp de prueba con detección multi-wallet, conexión, transacciones,
  firma EIP-712, cambio de red e historial de operaciones
- `viewextensiondata/`: visor del `chrome.storage.local` (LevelDB de Chrome)
- Iconos PNG 16/48/128 generados con `scripts/generate-icons.mjs`

#### Calidad de código
- **`src/types.ts`**: modelo de datos y mensajes compartidos entre el service
  worker y las interfaces (unión discriminada `BackgroundMessage`), más `AppError`
- **Errores tipados de extremo a extremo**: la dApp recibe un `Error` con su
  `.code` de EIP-1193 (4001 rechazo del usuario, 4100 no autorizado, 4200 método
  no soportado, 4902 red desconocida, -32602 parámetros inválidos, -32603 error
  interno, -32000 RPC no disponible)
- **ESLint a cero**: **0 errores y 0 warnings** en todo el repositorio (antes 30
  errores y 1 warning), sin `any` explícitos ni variables sin usar; incluye
  `viewextensiondata/`
- Comentarios de cabecera con la responsabilidad y el flujo de cada archivo
- `Connect` y `Notification` reescritos con tipos precisos (ya no usan
  `(window as any)`), leen las redes configuradas y toleran un JSON malformado
  sin romper la ventana

#### Pruebas
- `npm test` ejecuta tres baterías: **20** comprobaciones de conversión de importes,
  **6** pruebas de contratos con Foundry y **41** comprobaciones del service worker
  compilado con las APIs de `chrome` simuladas (permisos por origen, migración,
  persistencia de pendientes, cierre de ventanas, reset, validación BIP-39,
  generación de wallet, alta de redes, códigos de error EIP-1193, bus de logs y formato de los bundles (que los content scripts sigan siendo scripts clásicos))
- **`npm run test:acceptance`**: los **11 casos de prueba del enunciado** contra un
  nodo **anvil real** (**50** comprobaciones), con transacciones minadas de verdad,
  firma EIP-712 verificada por recuperación de dirección, eventos difundidos a las
  pestañas y la evidencia escrita en `documentacion/evidencia-fase4.md`
- **`npm run test:extension`**: **smoke test en un Chrome real** (**7** comprobaciones)
  que instala `dist/` y verifica que el service worker MV3 se registra, que
  `window.codecrypto` se inyecta en una página, que EIP-6963 se anuncia y que una
  petición RPC recorre todo el puente (página → inject → content script → service
  worker → anvil → vuelta), incluidos los códigos de error EIP-1193
- **149 comprobaciones automáticas** en total (incluye la bóveda cifrada de la integración)

#### Entrega
- `scripts/package-delivery.sh` genera el ZIP de entrega (código, `dist/` compilado,
  contratos y documentación vigente), excluyendo el historial de desarrollo
- `documentacion/AUTOEVALUACION.md` con la rúbrica de 100 puntos justificada

### 🐛 Corregido

- **Permisos por origen**: los sitios conectados se guardaban con la URL completa
  (`…/test.html`) mientras `eth_accounts` consultaba por origen, de modo que
  ningún sitio quedaba autorizado y la sesión se perdía al recargar
- **Reset incompleto**: "Reset Wallet" no borraba los sitios conectados ni las
  solicitudes pendientes; tras cargar otro mnemonic los sitios recibían una
  dirección obsoleta
- **Timeout del provider**: la dApp abortaba a los 30 s mientras la aprobación
  esperaba 120 s, así que el usuario no llegaba a aprobar
- **Errores de timeout**: se devolvía `null` a la dApp en lugar del mensaje de error
- **Log falso de "timeout"** después de una respuesta correcta (temporizador que
  no se cancelaba)
- **Precisión de importes**: `BigInt(parseFloat(amount) * 1e18)` desviaba valores
  reales (`1.1 ETH` → `1100000000000000128` wei)
- **Iconos**: el manifest usaba `vite.svg`, formato que Chrome no admite como icono
- **Mnemonic en consola**: la frase de recuperación aparecía completa en los logs

### 🔒 Seguridad

- El mnemonic se usa únicamente en el service worker; el popup no importa ethers
- Los permisos se conceden por origen y `eth_accounts` solo responde a sitios autorizados
- **Proyecto solo para desarrollo**: no cifra el mnemonic ni pide contraseña (así
  lo especifica el enunciado), por lo que no debe usarse con fondos reales

### 📌 Pendiente (fuera del alcance de esta entrega)

- Desafíos opcionales del enunciado: dark mode, export/import, historial on-chain, QR
- Cifrado del mnemonic y contraseña de acceso (la versión educativa los omite a propósito)
