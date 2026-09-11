# 🌐 Entornos Globales — CodeCrypto Wallet

> **Fase:** 1 — Concepto · **Versión:** 1.3
> Registro de configuración, rutas, variables de entorno y comandos importantes. Se actualiza a lo largo del proyecto.

---

## 1. Entorno de desarrollo verificado (máquina local)

| Elemento | Valor detectado | Notas |
|---|---|---|
| SO | Windows (PowerShell / `pwsh`) | Los comandos se documentan para PowerShell y también en bash cuando aplica. |
| Directorio del proyecto | `C:\Users\lucci\MasterCodeCripto\GitLab\chrome-wallet` | Raíz del workspace (el enunciado sugería `71_wallet_chrome_extension/`; ver D-08). |
| Node.js | `v24.16.0` | Compatible con Vite 7. |
| npm | `11.13.0` | Gestor de paquetes elegido. |
| Foundry | `anvil` / `forge` / `cast` **1.7.2-dev** | Binarios en `C:\Users\lucci\.cargo\bin\`. |
| Git | **Inicializado** — ramas `main` y `chrome-wallet-DSH` | `chrome-wallet-DSH` es la rama de trabajo activa. |
| Remotos | `origin` (GitHub), `gitlab` (GitLab.com), `codecrypto` (GitLab ANLU) | Ver §5. GitHub y GitLab.com **aún no existen**. |
| `gh` / `glab` CLI | **No instalados**; sin `GITHUB_TOKEN`/`GITLAB_TOKEN` | La creación de repos remotos debe hacerse por la web o aportando un token. |
| RPC local en `127.0.0.1:8545` | **No está escuchando** al inicio del proyecto | Se levanta con Anvil cuando se pruebe. |
| Chrome/Edge | No se detectó `chrome` en el `PATH` | Instalación estándar; se carga la extensión manualmente desde `chrome://extensions`. |
| GCP | **No aplica** | Decisión P-08: el alcance es **100 % local**, sin GCP. |

### Rutas de referencia

| Recurso | Ruta |
|---|---|
| Documentación técnica | `RepoTecnico/` |
| Enunciado fuente | `RepoTecnico/requisitos.md`, `RepoTecnico/TAREA_PARA_ESTUDIANTE.md` |
| Guía de pruebas rápida | `RepoTecnico/GUIA_RAPIDA_TESTING.md` |
| Código fuente | `src/` — **existe una versión completa en el remoto `codecrypto`** (§5), pendiente de adoptar (P-10) |
| Build de la extensión | `dist/` — **es la carpeta que se carga en Chrome** |
| dApp de pruebas | `test.html` (raíz y copia servida en `http://localhost:5174/test.html`) |
| Binarios Foundry | `C:\Users\lucci\.cargo\bin\{anvil,forge,cast}.exe` |
| Activos de marca originales | `TrueKeate/` (logo y título en SVG/PNG/JPG/ICO) |
| Activos de marca del proyecto | `public/brand/` (copias + `truekeate-mark-96.png`) |
| Iconos de la extensión | `public/icons/icon-{16,32,48,128}.png` (generados desde `TrueKeate/TrueKeate_logo.png`) |
| Guía de identidad visual | `RepoTecnico/identidad_visual.md` |
| Tokens de diseño (a crear) | `src/styles/tokens.css` |
| Fuentes auto-hospedadas (a crear) | `public/fonts/` (Poppins, Inter, JetBrains Mono en woff2) |

---

## 2. Comandos importantes

### 2.1 Red local de pruebas (Foundry Anvil)

```powershell
# Anvil por defecto: puerto 8545, chainId 31337, mnemonic "test ... junk", 10 000 ETH por cuenta
anvil

# Con CORS abierto para que la extensión pueda llamar al RPC (RE-04)
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --http.corsdomain "*"

# Verificar que responde
cast block-number --rpc-url http://127.0.0.1:8545
cast chain-id     --rpc-url http://127.0.0.1:8545     # -> 31337
cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://127.0.0.1:8545

# Ver una transacción enviada desde la wallet
cast tx <hash> --rpc-url http://127.0.0.1:8545
```

> **Decisión P-02:** Anvil es la **única** red. No se incluye Sepolia. El cambio de red (RF-22/RF-23) se prueba añadiendo una segunda red local con `wallet_addEthereumChain` (por ejemplo `anvil --port 8546 --chain-id 31338`).

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
chrome.storage.local.get(null, console.log);                    // Todo el storage
chrome.storage.local.set({ codecrypto_connected_sites: {} });   // Desconectar todos los sitios
```

```javascript
// En la consola de la dApp (test.html)
await window.codecrypto.request({ method: 'eth_requestAccounts' });
await window.codecrypto.request({ method: 'eth_accounts' });
await window.codecrypto.request({ method: 'eth_getBalance', params: [cuenta, 'latest'] });
```

### 2.5 Comandos git del proyecto

```powershell
git status                                   # Rama activa: chrome-wallet-DSH
git checkout main                            # Cambiar a main
git remote -v                                # Ver los 3 remotos
git ls-remote --heads codecrypto             # Comprobar ramas del remoto ANLU
git fetch codecrypto --prune                 # Traer las ramas del remoto
```

> Regla **RE-03:** no se hace `push` sin orden explícita del usuario (`/push`).

---

## 3. Variables de configuración de la extensión

No se usa `.env` en tiempo de ejecución (la extensión no tiene backend). La configuración vive en `chrome.storage.local` bajo `codecrypto_settings` (ver `diccionario_datos.md` §2.10) y en constantes de build.

| Constante | Valor por defecto | Dónde |
|---|---|---|
| `DEFAULT_CHAIN_ID` | `0x7a69` | `src/shared/constants.ts` |
| `DEFAULT_RPC_URL` | `http://127.0.0.1:8545` | `src/shared/constants.ts` |
| `DEFAULT_CHAIN_NAME` | `Anvil Local` | `src/shared/constants.ts` |
| `DEFAULT_MNEMONIC` | `test test test test test test test test test test test junk` | `src/shared/constants.ts` (solo hint de desarrollo, RF-12) |
| `DERIVED_ACCOUNTS` | `5` (+ botón "Añadir cuenta") | `src/shared/constants.ts` (RF-04 / P-04) |
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

> **GCP está fuera de alcance (P-08).** No se requieren `GCP_PROJECT_ID` ni credenciales; el tooling se limita a variables locales.

---

## 4. Permisos y `host_permissions` previstos (Manifest V3)

```jsonc
{
  "permissions": ["storage", "tabs", "activeTab", "notifications", "scripting"],
  "host_permissions": [
    "http://127.0.0.1:8545/*",
    "http://localhost:8545/*"
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

> Se retiró `https://rpc.sepolia.org/*` por la decisión **P-02**. Si algún día se añade una red con `wallet_addEthereumChain`, habrá que solicitar permiso de host en tiempo de ejecución (`chrome.permissions.request`) o declararlo aquí.

---

## 5. Repositorios remotos

| Remoto | URL | Ramas requeridas | Estado |
|---|---|---|---|
| `origin` | `https://github.com/anlucorporations/chrome-wallet.git` | `main`, `chrome-wallet-DSH` | ⚠️ **No existe** (verificado: "Repository not found"). Pendiente de crear por el usuario. |
| `gitlab` | `https://gitlab.com/anlucorporations/chrome-wallet.git` | `main`, `chrome-wallet-DSH` | ⚠️ **No existe** (verificado: "project could not be found"). Pendiente de crear por el usuario. |
| `codecrypto` | `https://gitlab.codecrypto.academy/anlucorporations/chrome-wallet.git` | `main`, `chrome-wallet-DSH` | ✅ **Existe.** Ramas en el remoto: `main`, `chrome-wallet-DSH`, `cromeWalltet-qwen` (todas apuntan al commit `632d890` "Initial commit" con la implementación previa). |

> El remoto `codecrypto` es accesible de forma anónima para lectura (`git ls-remote` funcionó). Se asume que el `push` requiere credenciales del usuario.

### Cómo crear los repositorios que faltan (acción del usuario)

```powershell
# Opción A — con GitHub CLI (requiere instalar gh y hacer `gh auth login`)
gh repo create anlucorporations/chrome-wallet --private --source . --remote origin

# Opción B — con GitLab CLI (requiere instalar glab y `glab auth login`)
glab repo create chrome-wallet --private
```

**Opción C — por la web (recomendada si no se quieren instalar CLIs):** crear el proyecto vacío en GitHub y en GitLab.com con el nombre `chrome-wallet` en la organización `anlucorporations`, sin README ni .gitignore (para poder hacer push de la historia local sin conflictos). Después avisarme para ejecutar `/push`.

> Nota: la historia local arranca con un commit raíz propio (docs de Fase 1) que **no** comparte ancestro con el commit `632d890` del remoto `codecrypto`. Antes de publicar hay que decidir la estrategia (ver P-10): adoptar el código del remoto y reescribir la historia local, o empujar la rama local con `--force`/`--allow-unrelated-histories`.

---

## 6. GCP

| Elemento | Valor | Estado |
|---|---|---|
| ¿Se despliega en GCP? | **No** | ✅ Resuelto (P-08): alcance 100 % local. |
| `project_id` | No aplica | — |
| Archivo de credenciales | No aplica | — |
| Tipo de servicio | No aplica (la extensión se carga desde `dist/` y Anvil corre local) | — |

> Nota: una extensión de navegador no se "despliega" en GCP; si se usa GCP será para servir la dApp de pruebas (`test.html`) y/o el nodo RPC de preview (p. ej. Cloud Run + un nodo de pruebas).

---

## 7. Historial de cambios de este documento

| Versión | Cambio |
|---|---|
| 1.0 | Entorno verificado inicial; comandos Anvil; permisos MV3; remotos y GCP pendientes. |
| 1.1 | P-01/P-02/P-03 aplicados: git inicializado, 3 remotos registrados, Sepolia retirada, verificación de existencia de remotos y descubrimiento de la implementación previa en `codecrypto`. |
| 1.2 | Fase 1 cerrada: P-04..P-10 aplicados. Reconstrucción desde cero (P-10), alcance 100 % local sin GCP (P-08), herramientas de prueba definidas (P-07) y convención de idioma (P-09). |

---

## 8. Herramientas de prueba y calidad (P-07)

| Herramienta | Ámbito | Comando | Requisitos |
|---|---|---|---|
| **Vitest** (+ jsdom) | Lógica pura del Service Worker: derivación BIP-44, validación BIP-39/clave privada, formateo, cola de aprobaciones, mapeo de errores EIP-1193. | `npm run test` | Ninguno (no necesita navegador). |
| **Playwright** (Chromium persistente) | E2E: cargar la extensión desde `dist/`, abrir el popup, conectar `test.html`, aprobar/rechazar firmas, verificar eventos `accountsChanged`/`chainChanged`. | `npm run test:e2e` | Chromium vía Playwright + **Anvil corriendo** en `127.0.0.1:8545`. |
| **Forge** | Proyecto Foundry mínimo con `EIP712Verifier.sol` + tests: comprobar que las firmas producidas por la wallet son válidas on-chain. | `forge test` | Foundry 1.7.2-dev (instalado). |

### Estructura prevista del proyecto Foundry auxiliar

```
contracts/
├── src/EIP712Verifier.sol      # verify(address, bytes32 digest, bytes signature)
├── test/EIP712Verifier.t.sol   # 3-4 tests (firma válida, firmante incorrecto, dominio distinto, firma malformada)
└── foundry.toml
```

> El contrato verificador **no forma parte del producto**: es un instrumento de prueba para demostrar que el firmado EIP-712 de la wallet es correcto y verificable en la EVM.
---

## 9. Identidad visual (marca TrueKeate)

Los activos originales están en `TrueKeate/` y **no se modifican**. A partir de ellos se generaron los recursos del proyecto:

### 9.1 Activos generados

| Archivo | Tamaño | Uso |
|---|---|---|
| `public/icons/icon-16.png` | 16 px | `action.default_icon` — variante **simplificada** (zoom a las flechas + saturación 1.45) |
| `public/icons/icon-32.png` | 32 px | `action.default_icon` — variante simplificada (saturación 1.35) |
| `public/icons/icon-48.png` | 48 px | `action.default_icon` — isologo completo |
| `public/icons/icon-128.png` | 128 px | Icono de tienda / `default_icon` — isologo completo |
| `public/brand/truekeate-mark-96.png` | 96 px | Marca de agua del encabezado y estados vacíos |
| `public/brand/truekeate-logo.{svg,png,ico}` | — | Copias de los activos originales |
| `public/brand/truekeate-titulo.{svg,png}` | — | Logotipo horizontal (bienvenida / "Acerca de") |

### 9.2 Cómo se regeneran los iconos

Script reutilizable: `scripts/generate-icons.ps1` (detecta el recorte, cuadra el lienzo y reduce). Los iconos se obtienen del isologo original recortando el contenido con un margen de 12 px, cuadrando el lienzo sobre fondo blanco y reduciendo con interpolación bicúbica de alta calidad. Para 16/32 px se recorta además el 60 % central (las flechas) y se aplica una matriz de saturación, porque el hexágono completo se emborrona a ese tamaño.

> Requiere .NET `System.Drawing` (disponible en Windows PowerShell 5.1). Si el proyecto se compila en Linux, la generación de iconos se hace una sola vez y los PNG resultantes se versionan en `public/icons/` (no se regeneran en cada build).

### 9.3 Paleta (resumen ejecutivo)

`#1D2B57` marino · `#2E4A7D` azul · `#3A6A85` acero · `#3E93A6` teal · `#5293A4` teal claro · `#88BFC4` cian · `#ACC9D1` cian claro · `#C9A97F` oro · `#E3C797` oro claro.
Degradado de marca: `linear-gradient(100deg, #1D2B57, #2E4A7D 22%, #3E93A6 52%, #88BFC4 72%, #C9A97F 92%, #E3C797)`.

El detalle completo (tokens, tipografías, componentes, reglas de uso y criterios de verificación) está en `RepoTecnico/identidad_visual.md`.

### 9.4 Historial

| Versión | Cambio |
|---|---|
| 1.3 | Incorporada la identidad visual TrueKeate: activos originales y generados, rutas, paleta e instrucciones de regeneración de iconos. |