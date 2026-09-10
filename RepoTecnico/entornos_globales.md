# 🌐 Entornos Globales — CodeCrypto Wallet

> **Fase:** 1 — Concepto · **Versión:** 1.0
> Registro de configuración, rutas, variables de entorno y comandos importantes. Se actualiza a lo largo del proyecto.

---

## 1. Entorno de desarrollo verificado (2026-02, máquina local)

| Elemento | Valor detectado | Notas |
|---|---|---|
| SO | Windows (PowerShell / `pwsh`) | Los comandos se documentan para PowerShell y también en bash cuando aplica. |
| Directorio del proyecto | `C:\Users\lucci\MasterCodeCripto\GitLab\chrome-wallet` | Raíz del workspace (el enunciado sugería `71_wallet_chrome_extension/`; ver D-08). |
| Node.js | `v24.16.0` | Compatible con Vite 7. |
| npm | `11.13.0` | Gestor de paquetes elegido. |
| Foundry | `anvil` / `forge` / `cast` **1.7.2-dev** | Binarios en `C:\Users\lucci\.cargo\bin\`. |
| Git | Repositorio **no inicializado** todavía | `git rev-parse` → `fatal: not a git repository`. |
| Remotos GitLab/GitHub | **Pendientes** (P-01) | Se registrarán aquí al confirmarse. |
| RPC local en `127.0.0.1:8545` | **No está escuchando** al inicio del proyecto | Se levanta con Anvil cuando se pruebe. |
| Chrome/Edge | No se detectó `chrome` en el `PATH` | Instalación estándar; se carga la extensión manualmente desde `chrome://extensions`. |
| GCP | Sin credenciales configuradas | Pendiente de P-08. |

### Rutas de referencia

| Recurso | Ruta |
|---|---|
| Documentación técnica | `RepoTecnico/` |
| Enunciado fuente | `RepoTecnico/requisitos.md`, `RepoTecnico/TAREA_PARA_ESTUDIANTE.md` |
| Guía de pruebas rápida | `RepoTecnico/GUIA_RAPIDA_TESTING.md` |
| Código fuente (a crear) | `src/` |
| Build de la extensión (a crear) | `dist/` — **es la carpeta que se carga en Chrome** |
| dApp de pruebas (a crear) | `test.html` (raíz y copia servida en `http://localhost:5174/test.html`) |
| Binarios Foundry | `C:\Users\lucci\.cargo\bin\{anvil,forge,cast}.exe` |

---

## 2. Comandos importantes

### 2.1 Red local de pruebas (Foundry Anvil)

```powershell
# Anvil por defecto: puerto 8545, chainId 31337, mnemonic "test ... junk", 10 000 ETH por cuenta
anvil

# Con CORS/host abiertos para que la extensión pueda llamar al RPC (RE-04)
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --http.corsdomain "*"

# Verificar que responde
cast block-number --rpc-url http://127.0.0.1:8545
cast chain-id     --rpc-url http://127.0.0.1:8545     # -> 31337
cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://127.0.0.1:8545

# Alternativa Hardhat (compatible: mismo puerto, chainId y mnemonic)
npx hardhat node
```

### 2.2 Proyecto (a partir de la Fase 3)

```powershell
npm install          # Instalar dependencias
npm run dev          # Vite dev (dApp de pruebas / desarrollo de UI)
npm run build        # tsc -b && vite build  -> genera dist/ + dist/manifest.json
npm run test         # Vitest (unitarias / integración)
npm run test:e2e     # Playwright (extensión cargada con --load-extension=dist)
```

### 2.3 Cargar la extensión en el navegador

1. Abrir `chrome://extensions/` (o `edge://extensions/`).
2. Activar **Modo de desarrollador**.
3. **Cargar descomprimida** → seleccionar la carpeta `dist/`.
4. Tras cada `npm run build`: pulsar **Recargar** en la tarjeta de la extensión.
5. Consola del Service Worker: tarjeta de la extensión → **Service worker**.

### 2.4 Depuración rápida (de `GUIA_RAPIDA_TESTING.md`)

```javascript
// En la consola del Service Worker
chrome.storage.local.get('codecrypto_connected_sites', console.log);
chrome.storage.local.get(null, console.log);                 // Todo el storage
chrome.storage.local.set({ codecrypto_connected_sites: {} }); // Desconectar todos los sitios
```

```javascript
// En la consola de la dApp (test.html)
await window.codecrypto.request({ method: 'eth_requestAccounts' });
await window.codecrypto.request({ method: 'eth_accounts' });
await window.codecrypto.request({ method: 'eth_getBalance', params: [cuenta, 'latest'] });
```

---

## 3. Variables de configuración de la extensión

No se usa `.env` en tiempo de ejecución (la extensión no tiene backend). La configuración vive en `chrome.storage.local` bajo `codecrypto_settings` (ver `diccionario_datos.md` §2.10) y en constantes de build.

| Constante | Valor por defecto | Dónde |
|---|---|---|
| `DEFAULT_CHAIN_ID` | `0x7a69` | `src/shared/constants.ts` |
| `DEFAULT_RPC_URL` | `http://127.0.0.1:8545` | `src/shared/constants.ts` |
| `DEFAULT_CHAIN_NAME` | `Anvil Local` | `src/shared/constants.ts` |
| `DEFAULT_MNEMONIC` | `test test test test test test test test test test test junk` | `src/shared/constants.ts` (solo hint de desarrollo, RF-12) |
| `DERIVED_ACCOUNTS` | `5` | `src/shared/constants.ts` (RF-04 / P-04) |
| `BALANCE_POLL_MS` | `5000` | `src/shared/constants.ts` (RF-27) |
| `SIGN_TIMEOUT_MS` | `120000` | `src/background/approvals.ts` (RF-40) |
| `CONNECT_TIMEOUT_MS` | `60000` | `src/background/approvals.ts` (RF-40) |
| `PROVIDER_RDNS` | `io.codecrypto` | `src/inject/provider.ts` (RF-44) |
| `PROVIDER_UUID` | UUID fijo de la extensión | `src/inject/provider.ts` (RF-44) |

### Variables de entorno para el tooling (`.env.local`, no versionado)

| Variable | Uso | Estado |
|---|---|---|
| `ANVIL_RPC_URL` | RPC para los tests de integración | Pendiente de crear |
| `ANVIL_MNEMONIC` | Frase para los tests | Pendiente de crear |
| `ANVIL_CHAIN_ID` | `31337` | Pendiente de crear |
| `E2E_HEADLESS` | `true/false` para Playwright | Pendiente de crear |

> Si se confirma GCP (P-08) se añadirán `GCP_PROJECT_ID`, `GCP_CREDENTIALS_PATH` y la URL de preview.

---

## 4. Permisos y `host_permissions` previstos (Manifest V3)

```jsonc
{
  "permissions": ["storage", "tabs", "activeTab", "notifications", "scripting"],
  "host_permissions": [
    "http://127.0.0.1:8545/*",
    "http://localhost:8545/*",
    "https://rpc.sepolia.org/*"
  ],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content-script.js"],
    "run_at": "document_start",
    "all_frames": true
  }],
  "web_accessible_resources": [{ "resources": ["inject.js"], "matches": ["<all_urls>"] }],
  "background": { "service_worker": "background.js", "type": "module" }
}
```

---

## 5. Repositorios remotos

| Remoto | URL | Rama | Estado |
|---|---|---|---|
| GitLab | — | — | ⏳ Pendiente (P-01) |
| GitHub | — | — | ⏳ Pendiente (P-01) |

Regla: **no se hace `push` sin orden explícita del usuario** (`/push`).

---

## 6. GCP

| Elemento | Valor | Estado |
|---|---|---|
| ¿Se despliega en GCP? | — | ⏳ Pendiente (P-08) |
| `project_id` | — | — |
| Archivo de credenciales | — | — |
| Tipo de servicio | — | — |

> Nota: una extensión de navegador no se "despliega" en GCP; si se usa GCP será para servir la dApp de pruebas y/o el nodo RPC de preview (p. ej. Cloud Run + un nodo de pruebas).
