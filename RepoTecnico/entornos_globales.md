# 🌐 Entornos Globales — TrueKeate Wallet

> **Fase:** 1 — Concepto · **Versión:** 2.0
> Registro de configuración, rutas, variables de entorno y comandos importantes. Se actualiza a lo largo del proyecto.
> **v1.9 (esta versión):** cierra los residuales de la última pasada de consistencia **`VR-01`** (permisos del manifest: `favicon`, `clipboardRead` y `clipboardWrite` declarados y justificados en §4, y el favicon deja de ser condicional) y **`VR-03`** (las constantes `PREVIEW_INLINE_MAX_BYTES`, `INFLIGHT_TTL_MS`, `rateLimitBurst`, `rateLimitRefillPerSecond`, `rateWindowTtlMs`, `RATE_PERSIST_DEBOUNCE_MS` y `EXTENSION_ID` se declaran en la tabla de §3, cerrando las referencias colgantes de `diccionario_datos.md` §2.12/§2.13/§3.9/§4.1.1 y §5). Detalle en §7.
> **v1.7:** cierra los hallazgos **ADT-01, ADT-14, ADT-19, ADT-20, ADT-21, ADT-28, ADT-29 y ADT-30** de `AUDITORIA_DOCUMENTO_TECNICO_V1.md` con las decisiones **D-L, D-M, D-N, D-O, D-P y D-U**: pipeline MV3 real con los 7 scripts npm y las 3 páginas HTML (§1, §2.2); ruta vigente de las constantes del plazo en `src/background/approvals/timeout.ts` (ADT-28); los **8 tipos de mensaje** en §10 (ADT-29); `notifications` como permiso **opcional** ligado a RF-39 (ADT-30); `key` fija del manifest y UUID literal de EIP-6963 (ADT-19); alcance real de la inyección con `exclude_matches` y `use_dynamic_url` (ADT-20); cota de payload de **64 KiB**, cuota de **10 MB** sin `unlimitedStorage` y `REVEAL_HIDE_MS` (ADT-14, ADT-21). Detalle en §7.
> **v1.6:** cierra los hallazgos **ACU-03, ACU-17, ACU-25 y ACU-27** de `casos_uso/AUDITORIA_CASOS_USO_V1.md` con las decisiones **D-A, D-B, D-C y D-G**: constantes `PROVIDER_NAME`/`PROVIDER_RDNS`/`SESSION_TTL_MS` en §3 con la distinción entre el `name` de EIP-6963 y `manifest.name`; literal único de build limpio `npm ci && npm run build` (§2.2); permiso de host en runtime y por red —también desde el popup— con el manifest en mínimos privilegios (§4); claves canónicas con prefijo completo. Detalle en §7.

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
| Código fuente | `src/` — **a crear en Fase 3**; el código del remoto `codecrypto` (§5) es **solo referencia de consulta** (P-10/DEC-09) y no se reutiliza ni se versiona |
| Build de la extensión | `dist/` — **es la carpeta que se carga en Chrome** (6 entradas JS + 3 páginas HTML + `manifest.json` generado) |
| Páginas HTML de la extensión (entradas del build) | `index.html` (popup), `connect.html` (ventana de conexión) y `notification.html` (ventana de decisión) — en la raíz del proyecto, **junto a `test.html`** |
| dApp de pruebas | `test.html` (raíz y copia servida en `http://localhost:5174/test.html`) |
| Scripts npm del proyecto | `package.json` (**Fase 3**): `dev`, `build`, `typecheck`, `test`, `coverage`, `test:e2e`, `lint:prohibited` — detalle en §2.2 |
| Binarios Foundry | `C:\Users\lucci\.cargo\bin\{anvil,forge,cast}.exe` |
| Activos de marca originales | `TrueKeate/` (logo y título en SVG/PNG/JPG/ICO) |
| Activos de marca del proyecto | `public/brand/` (copias + `truekeate-mark-96.png`) |
| Iconos de la extensión | `public/icons/icon-{16,32,48,128}.png` (generados desde `TrueKeate/TrueKeate_logo.png`) |
| Guía de identidad visual | `RepoTecnico/identidad_visual.md` |
| Tokens de diseño (a crear) | `src/styles/tokens.css` |
| Fuentes auto-hospedadas | `public/fonts/`: `poppins-latin-{400,600,700}.woff2` (**Poppins no es variable**: un fichero por peso), `inter-latin.woff2` y `jetbrains-mono-latin.woff2` (variables), más `LICENSE-{poppins,inter,jetbrains-mono}.txt` (OFL-1.1) |

---

## 2. Comandos importantes

### 2.1 Red local de pruebas (Foundry Anvil)

```powershell
# Anvil por defecto: puerto 8545, chainId 31337, mnemonic "test ... junk", 10 000 ETH por cuenta
anvil

# CORS con allowlist: solo el origen de la extensión y la dApp de pruebas (RE-04, H-41)
# NOTA: <ID> es el ID estable de la extensión (se fija con la "key" del manifest); se sustituye al primer build.
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 `
      --http.corsdomain "chrome-extension://<ID>,http://localhost:5174,http://127.0.0.1:5174"

# Verificar que responde
cast block-number --rpc-url http://127.0.0.1:8545
cast chain-id     --rpc-url http://127.0.0.1:8545     # -> 31337
cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://127.0.0.1:8545

# Ver una transacción enviada desde la wallet
cast tx <hash> --rpc-url http://127.0.0.1:8545

# Versión del nodo (debe estar en el rango soportado; ver §8)
anvil --version
```

> ⚠️ **No exponer el RPC local (H-41).** `--http.corsdomain "*"` permitiría a **cualquier** sitio visitado en el equipo llamar al JSON-RPC local (y facilita escenarios de *DNS rebinding* hacia `127.0.0.1`). Se usa siempre la **allowlist concreta** de arriba. El comodín solo sería aceptable en una máquina de desarrollo aislada y sin navegación a sitios de terceros, y en ningún caso se publica el puerto 8545 fuera de `127.0.0.1` (nada de `--host 0.0.0.0`).

> **Decisión P-02:** Anvil es la **única** red. No se incluye Sepolia. El cambio de red (RF-22/RF-23) se prueba añadiendo una segunda red local con `wallet_addEthereumChain` (por ejemplo `anvil --port 8546 --chain-id 31338`, con su propia allowlist de CORS).

### 2.2 Proyecto (a partir de la Fase 3)

```powershell
npm ci                   # Instalación reproducible desde package-lock.json (build limpio)
npm run dev              # Vite dev (dApp de pruebas / desarrollo de UI; puerto 5174 con strictPort)
npm run build            # tsc -b && vite build  -> genera dist/ (6 entradas + 3 páginas HTML) + dist/manifest.json
npm run typecheck        # tsc -b (strict: true): 0 errores y 0 avisos de tipos (RNF-13)
npm run test             # Vitest (unitarias / integración, jsdom)
npm run coverage         # Vitest con @vitest/coverage-v8 (umbrales de ramas de RNF-17)
npm run test:e2e         # Playwright: Chromium persistente con la extensión cargada desde dist/ (ruta absoluta)
npm run lint:prohibited  # Prohibiciones de RT-03: viem, @scure/bip39, @metamask/*, axios y fetch propio
```

> **Pipeline MV3 real (ADT-01 / D-U).** El `package.json` expone exactamente los **7 scripts** de arriba (además de `npm ci`): `dev`, `build`, `typecheck`, `test`, `coverage`, `test:e2e` y `lint:prohibited`. `npm run build` construye las **6 entradas** (popup, connect, notification, background, content e inject) y toma como entradas HTML las **3 páginas** `index.html`, `connect.html` y `notification.html`, y genera `dist/manifest.json` desde `src/manifest.ts` (RT-05) con **formato por entrada**: `es` (módulo) para el Service Worker y `iife` para `content-script.js` e `inject.js`, que no admiten `import`. El literal de «build limpio» no cambia: **`npm ci && npm run build`** (D-C). El detalle de entradas, nombres de salida y plantilla de scripts vive en el **§7.5 «Build y empaquetado»** de `documento_tecnico.md` (decisión D-U), que es la fuente normativa del pipeline.

**«Build limpio» — definición (H-20, D-C).** El **literal único** de build limpio en todo el corpus (este documento, `requerimientos.md` y los casos de uso) es **`npm ci && npm run build`**; **`npm install` no es el literal de build limpio** y allí donde aparezca debe leerse como `npm ci` (ACU-26 / D-C). El comando termina con **código de salida 0**, **cero errores de tipos** (`tsc -b` con `strict: true`, RNF-13) y **cero avisos de tipos**; los avisos permitidos (si los hay) se listan expresamente en `plan_desarrollo.md` y ninguno puede provenir de `tsc`. `package-lock.json` se versiona y la build es reproducible.

**Verificación en Linux (H-20).** Se ejecuta en **WSL2** (`wsl -d Ubuntu -- bash -lc "npm ci && npm run build && npm test"`) o, en su defecto, en un workflow de CI `ubuntu-latest` con los mismos tres pasos. Sin ese medio, RNF-15 se marca como **«verificado solo en Windows; pendiente en Linux»** y no como cumplido.

**Puerto de la dApp de pruebas (H-33).** La configuración de Vite fija el puerto para que el origen sea estable y coincida con la clave de sesión persistida en `truekeate_connected_sites`:

```ts
// vite.config.ts (extracto)
export default defineConfig({
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
})
```

Así `http://localhost:5174/test.html` es siempre el mismo origen; si el puerto está ocupado, el arranque **falla** en lugar de desplazarse a 5173 (lo que rompería RF-17/RF-25/RF-26). La **clave de sesión por origen** se normaliza igual en ambos lados: **origen canónico sin barra final y en minúsculas** (esquema, host y puerto explícitos), p. ej. `http://localhost:5174`.

### 2.3 Cargar la extensión en el navegador

1. Abrir `chrome://extensions/` (o `edge://extensions/`).
2. Activar **Modo de desarrollador**.
3. **Cargar descomprimida** → seleccionar la carpeta `dist/`.
4. Tras cada `npm run build`: pulsar **Recargar** en la tarjeta de la extensión.
5. Consola del Service Worker: tarjeta de la extensión → **Service worker**.

### 2.4 Depuración rápida

> ⚠️ **`GUIA_RAPIDA_TESTING.md` no es vinculante (H-24).** Ese documento describe la **línea base previa descartada**: usa la nomenclatura antigua (`codecrypto_connected_sites` con valor *string*, `window.codecrypto`) y da por supuesto `npx hardhat node` en lugar de Anvil. P-10/DEC-09 decidió **no reutilizar** ese código ni su documentación, así que **sus snippets no deben copiarse**: la forma canónica de `truekeate_connected_sites` es el objeto por origen de `diccionario_datos.md` §2.7. El proyecto tendrá su **propia guía de troubleshooting** con nomenclatura `truekeate_` (Fase 4).

```javascript
// En la consola del Service Worker
chrome.storage.local.get('truekeate_connected_sites', console.log);
chrome.storage.local.get(null, console.log);                    // Todo el storage
chrome.storage.local.set({ truekeate_connected_sites: {} });   // Desconectar todos los sitios
```

```javascript
// En la consola de la dApp (test.html)
await window.truekeate.request({ method: 'eth_requestAccounts' });
await window.truekeate.request({ method: 'eth_accounts' });
await window.truekeate.request({ method: 'eth_getBalance', params: [cuenta, 'latest'] });
```

**Verificación previa a los E2E (H-29).** Antes de `npm run test:e2e` hay que comprobar que **la versión de Foundry está dentro del rango soportado** (§8) y que **Anvil responde** en `127.0.0.1:8545`:

```powershell
anvil --version                                           # debe estar en el rango soportado (ver §8)
cast chain-id --rpc-url http://127.0.0.1:8545             # debe devolver 31337
cast block-number --rpc-url http://127.0.0.1:8545         # Anvil responde: devuelve la altura actual
```

Si Anvil no responde o la versión está fuera de rango, la suite E2E **no se ejecuta** y se marca como **no verificada** (nunca como satisfactoria).

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

No se usa `.env` en tiempo de ejecución (la extensión no tiene backend). La configuración vive en `chrome.storage.local` bajo `truekeate_settings` (ver `diccionario_datos.md` §2.10) y en constantes de build.

| Constante | Valor por defecto | Dónde |
|---|---|---|
| `DEFAULT_CHAIN_ID` | `0x7a69` | `src/shared/constants.ts` |
| `DEFAULT_RPC_URL` | `http://127.0.0.1:8545` | `src/shared/constants.ts` |
| `DEFAULT_CHAIN_NAME` | `Anvil Local` | `src/shared/constants.ts` |
| `DEFAULT_MNEMONIC` | `test test test test test test test test test test test junk` | `src/shared/constants.ts` (solo hint de desarrollo, RF-12) |
| `DERIVED_ACCOUNTS` | `5` (+ botón "Añadir cuenta") | `src/shared/constants.ts` (RF-04 / P-04) |
| `BALANCE_POLL_MS` | `5000` | `src/shared/constants.ts` (RF-27) |
| `SIGN_TIMEOUT_MS` | `120000` | **`src/background/approvals/timeout.ts`** (M15; RF-40) — ruta vigente (ADT-28) |
| `CONNECT_TIMEOUT_MS` | `60000` | **`src/background/approvals/timeout.ts`** (M15; RF-40) — ruta vigente (ADT-28) |
| `SESSION_TTL_MS` | `86400000` | `src/shared/constants.ts` — **caducidad de la sesión de dApp** (24 h renovables desde `lastUsedAt`, `expiresAt = lastUsedAt + SESSION_TTL_MS`) **respaldada por RF-25** (ACU-17 / D-B) |
| `REVEAL_HIDE_MS` | `30000` | `src/shared/constants.ts` (M57) — **ocultado automático del material revelado** (RF-50; ADT-06) |
| `MAX_PAYLOAD_BYTES` | `65536` (**64 KiB**) | `src/shared/constants.ts` (M57) — **cota del payload** aceptado; por encima → `-32602` (ADT-21 / D-L) |
| Cuota de `chrome.storage.local` | `10485760` bytes (**10 MB**) | **Plataforma** (Chrome ≥ 114, mínimo exigido por el proyecto): no es constante de código; **no** se declara `unlimitedStorage` (ADT-14 / D-M) |
| `PROVIDER_NAME` | `TrueKeate` | `src/inject/provider.ts` (EIP-6963, RF-44 / RT-13) — **nombre corto de marca, vinculante** (ACU-03 / D-A) |
| `PROVIDER_RDNS` | `academy.codecrypto.truekeate` | `src/inject/provider.ts` (EIP-6963, RF-44 / RT-13) — **vinculante** (ACU-03 / D-A) |
| `PROVIDER_UUID` | `9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90` | `src/inject/provider.ts` (EIP-6963, RF-44) — **literal congelado**, nunca regenerado por carga (`diccionario_datos.md` §4.1.1; ADT-19 / D-N) |
| `PREVIEW_INLINE_MAX_BYTES` | `4096` | `src/shared/constants.ts` (M57) — **umbral de redacción de previews en reposo**: por encima, `PersonalSignPreview.text` guarda solo el extracto de 4096 bytes (`truncated: true`) y `TypedDataPreview.message` pasa a `null` (`redacted: true`) (`diccionario_datos.md` §3.9; ADT-21 / D-L) |
| `INFLIGHT_TTL_MS` | `180000` (**3 min**) | `src/shared/constants.ts` (M57) — **TTL de la marca de transacción en vuelo** `truekeate_inflight_tx` (`expiresAt = startedAt + INFLIGHT_TTL_MS`) (`diccionario_datos.md` §2.12; ADT-23 / D-R) |
| `rateLimitBurst` | `20` | `src/shared/constants.ts` (M57) — **capacidad del *token bucket* por origen** (1 token = 1 llamada RPC de página) sobre **todo** el catálogo RPC; no es ajuste de `truekeate_settings` (`diccionario_datos.md` §2.13; ADT-24 / D-Q) |
| `rateLimitRefillPerSecond` | `5` | `src/shared/constants.ts` (M57) — **recarga lineal por segundo** del *token bucket* (`diccionario_datos.md` §2.13) |
| `rateWindowTtlMs` | `600000` (**10 min**) | `src/shared/constants.ts` (M57) — **purga de entradas inactivas** de `truekeate_rate_windows` (10 min sin uso = bucket lleno) (`diccionario_datos.md` §2.13) |
| `RATE_PERSIST_DEBOUNCE_MS` | `1000` | `src/shared/constants.ts` (M57) — ***debounce* máximo de escritura** de la ventana de tasa para los métodos **no** aprobables (máx. 1 escritura/s por origen) (`diccionario_datos.md` §2.13) |
| `EXTENSION_ID` | `<ID estable>`: literal **congelado al primer build**, derivado de la `key` fija del manifest (M1) | `src/manifest.ts` (M1) — **ID estable de la extensión**; es el `<ID>`/`<EXTENSION_ID>` que consumen la **allowlist CORS de Anvil** (§2.1 y RE-04) y la suite E2E, y no cambia entre perfiles ni equipos (`diccionario_datos.md` §4.1.1 y §5; ADT-19 / D-N) |

> **Constantes congeladas del limitador y del payload (`VR-03`).** Las siete constantes anteriores se declaran **aquí** y **no** son ajustes de `truekeate_settings`: `diccionario_datos.md` (§2.12, §2.13, §3.9, §4.1.1 y §5) las cita en esta sección, de modo que **ninguna referencia queda colgante**. `EXTENSION_ID` se congela con la `key` fija del manifest en el primer build y su valor exacto sustituye el marcador `<ID>` de §2.1.

> **Identidad del provider (ACU-03 / D-A, RT-13).** `PROVIDER_NAME = TrueKeate` y `PROVIDER_RDNS = academy.codecrypto.truekeate` son los valores **vinculantes** del anuncio EIP-6963 (`truekeate:announceProvider`), y son la misma historia que `diccionario_datos.md` §4.1.1. **Atención: el `name` de EIP-6963 no es `manifest.name`.** El manifest declara `TrueKeate Wallet` (§10) y el provider se anuncia con el nombre corto de marca `TrueKeate`; se trata de dos campos distintos que no deben confundirse ni igualarse. `PROVIDER_UUID` es la constante fija de la extensión (nunca se regenera por carga) y el `icon` es un data-URI PNG del isologo de 96 px.

> **Ruta vigente de las constantes del plazo (ADT-28 / COH-08).** `SIGN_TIMEOUT_MS` y `CONNECT_TIMEOUT_MS` viven en **`src/background/approvals/timeout.ts`** (módulo M15: `chrome.alarms`, armado, rearme y vencimiento) y las **constantes compartidas** —`DEFAULT_CHAIN_ID`, `DERIVED_ACCOUNTS`, `SESSION_TTL_MS`, `REVEAL_HIDE_MS`, `MAX_PAYLOAD_BYTES`…— en **`src/shared/constants.ts`** (M57), conforme al árbol de `documento_tecnico.md` §2.4. La ruta **`src/background/approvals.ts`** que declaraba este documento **queda sustituida** por el árbol vigente: pertenecía al borrador previo y no existe en el diseño actual.

> **Caducidad de la sesión de dApp (ACU-17 / D-B, RF-25).** `SESSION_TTL_MS = 86400000` (**24 h renovables**): `expiresAt = lastUsedAt + SESSION_TTL_MS` en `truekeate_connected_sites`, y `lastUsedAt` se refresca en cada `eth_accounts`/`eth_requestAccounts` atendido. Al vencer, la sesión se elimina del mapa, `eth_accounts` devuelve `[]` y el origen debe volver a pasar por `eth_requestAccounts`; no se emite error. El mismo valor vive como `truekeate_settings.sessionTtlMs` (`diccionario_datos.md` §2.7 y §2.10).

> **Cota de payload, cuota de storage y modo de fallo (ADT-14 / D-M, ADT-21 / D-L).** Tamaño máximo de payload: **64 KiB** (`MAX_PAYLOAD_BYTES = 65536`); al excederlo la llamada se rechaza con **`-32602`** y las previews de los tipos de dato largos (`TypedDataPreview.message`, `PersonalSignPreview.text`) se guardan **redactadas en reposo** (hash + resumen), nunca íntegras. Cuota objetivo de `chrome.storage.local`: **10 MB** (la del mínimo exigido, Chrome 114) y **sin** `unlimitedStorage`; el rechazo por cuota es **observable**: 1 reintento, error con `code: -32603` y aviso en el panel de la UI, de modo que una escritura de log descartada nunca queda silenciosa (`Vitest: storageQuota.spec.ts — 1 reintento, 1 entrada `storage_quota_exceeded` con -32603 y contador de descartes visible`).

> **Temporizador de revelado (RF-50; ADT-06).** `REVEAL_HIDE_MS = 30000` (**30 s**): el material de recuperación se revela solo de forma temporal y se **oculta al vencer el temporizador y al perder el foco** el popup. El comportamiento de UI asociado (aviso de borrado del portapapeles, progreso del temporizador y botón de ocultado inmediato) se especifica en `identidad_visual.md` §5.2 (P-20).

> **Dueño único del plazo de aprobación (H-07).** El **Service Worker es el único dueño del reloj**: `expiresAt = createdAt + SIGN_TIMEOUT_MS` (120 000 ms) para firmas/aprobaciones y `createdAt + CONNECT_TIMEOUT_MS` (60 000 ms) para conexión, **anclados a `createdAt`** (no al instante en que el usuario abre la ventana). El vencimiento se dispara con **`chrome.alarms`**, de modo que ocurre aunque el SW esté dormido. La capa inject/content **no tiene reloj propio**: es solo **red de seguridad con margen superior** (`SIGN_TIMEOUT_MS + 5000` ms) y delega siempre en el `approvalId`; si su temporizador vence, la solicitud ya fue resuelta por el SW. Al expirar, el SW **cierra la ventana** de `notification.html`, marca la solicitud como `expired` y **purga el badge** (RF-38); el error que llega a la página es un objeto **EIP-1193** con `code: 4001` y mensaje en español (RNF-06), nunca un `Error('Request timeout')` sin `code`.

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

Conjunto de **mínimos privilegios** (H-02/H-36): solo lo que el diseño usa de verdad, con la justificación de cada permiso.

```jsonc
{
  // ADT-19 / D-N: clave pública fija (base64) que estabiliza el ID de la extensión;
  // el valor concreto se congela en src/manifest.ts (M1) al primer build.
  "key": "<clave pública fija del desarrollador>",
  "permissions": ["storage", "alarms", "favicon", "clipboardRead", "clipboardWrite"],
  "optional_permissions": ["notifications"],   // RF-39, ciclo posterior (ADT-30 / D-P)
  "host_permissions": [
    "http://127.0.0.1:8545/*",
    "http://localhost:8545/*"
  ],
  "optional_host_permissions": [
    "http://127.0.0.1/*",
    "http://localhost/*",
    "https://*/*"
  ],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    // ADT-20 / D-O + DEC-47 (H1): PROHIBIDO el esquema «chrome-extension://» en matches/exclude_matches;
    // Chrome rechaza el manifest COMPLETO si aparece: «Invalid value for content_scripts[0].exclude_matches[0]».
    "exclude_matches": ["https://metamask.io/*", "https://*.metamask.io/*"],
    "js": ["content-script.js"],
    "run_at": "document_start",
    "all_frames": true
  }],
  "web_accessible_resources": [{
    "resources": ["inject.js"],
    "matches": ["<all_urls>"],
    "use_dynamic_url": true
  }],
  "background": { "service_worker": "background.js", "type": "module" }
}
```

| Permiso | ¿Por qué? |
|---|---|
| `storage` | Persistir cartera, sesiones y cola de aprobaciones en `chrome.storage.local` (RNF-08, RF-25, RF-37). El SW **no tiene** `localStorage`. |
| `alarms` | **Vencimiento del plazo de aprobación aunque el SW esté dormido** (H-02): `setTimeout` no sobrevive a la suspensión del Service Worker, así que `expiresAt` se dispara con `chrome.alarms` (§3). |
| `favicon` | **Icono de origen de la dApp** en `notification.html` (RF-35, ADT-22/P-21): el favicon lo sirve el **propio navegador** (`chrome-extension://<EXTENSION_ID>/_favicon/?pageUrl=…&size=32`) y **solo** es accesible desde contextos de la extensión con este permiso; sin él el icono queda `null` y se usa el activo local del paquete, **nunca** una URL remota ni un `data:` de la dApp. El permiso es **declarado y obligatorio**, no condicional. |
| `clipboardRead` | **Política de portapapeles de R-09/P-20 (RF-50, ADT-09):** al ocultarse el secreto revelado hay que **leer** el portapapeles (`navigator.clipboard.readText()`) para comparar su `sha256` con `clipboardHash` y borrarlo **solo** si todavía contiene la semilla o la clave privada; sin el permiso la comparación no puede hacerse y la extensión nunca destruiría contenido ajeno. |
| `clipboardWrite` | **Borrado del portapapeles al ocultar el secreto (RF-50, ADT-09):** habilita escribir (`writeText('')`) **sin gesto del usuario** en el instante del `blur`/cierre y también en el **borrado incondicional** de respaldo cuando la lectura falla; es la vía por la que la semilla no sobrevive en el portapapeles. Se usa **solo** desde el popup: **no** se copia ni se borra desde content scripts ni desde `notification.html` (RNF-09, P-20). |
| `optional_permissions` (`notifications`) | Aviso al usuario de cada solicitud pendiente (**RF-39**, que está en el **ciclo posterior**, P-17). Es un permiso **opcional** (ADT-30 / D-P) y se solicita en runtime cuando la función existe; **el manifest del MVP no lo declara**. |
| `host_permissions` (RPC local) | Llamar al JSON-RPC de Anvil en `127.0.0.1:8545` / `localhost:8545` (RT-04). No se declara ningún host remoto. |
| `optional_host_permissions` | Permiso de host **en runtime y por red** para las redes dadas de alta con `wallet_addEthereumChain` (RF-23, **ACU-27 / D-G**): se solicita con `chrome.permissions.request` sobre el `rpcUrl` **siempre que se da de alta una red, también cuando el alta la inicia el popup** —el clic del usuario es el gesto válido que exige la API y no hay excepción por contexto—, y la concesión se registra por red en `truekeate_networks`. Si el usuario **deniega** el permiso, la red **no se persiste** y la llamada devuelve `4001`. Validación previa obligatoria: esquema `https` preferente (`http` solo para `127.0.0.1`/`localhost`) y host que no sea privado ni de enlace local. |
| `content_scripts` (`<all_urls>` + `all_frames`) | Alcance **real** de la inyección (ADT-20 / D-O): un provider EIP-1193/EIP-6963 debe estar en cualquier dApp visitada y en **todos** los frames (RF-13, RT-13). Se acota con `exclude_matches` y `use_dynamic_url` (nota inferior). |
| `web_accessible_resources` (`inject.js`) | El content script publica el provider en el mundo de la página; con `use_dynamic_url: true` el recurso no queda referenciable por una URL estable desde terceros (ADT-20 / D-O). |

> **Identidad del paquete: `key` fija y UUID congelado (ADT-19 / D-N).** El manifest declara una **`key` fija** (clave pública del par de firma del desarrollador) cuyo valor se congela en `src/manifest.ts` (M1): con ella el **ID de la extensión es estable en cualquier equipo**, lo que hace reproducible la **allowlist CORS de Anvil (RE-04)** —el `<ID>` de §2.1— y la suite E2E. El `uuid` de EIP-6963 es asimismo un **literal congelado** en `src/inject/provider.ts` (`9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90`, `diccionario_datos.md` §4.1.1), nunca regenerado por carga.

> **Alcance real de la inyección (ADT-20 / D-O).** `content_scripts` se declara con **`<all_urls>` + `all_frames: true`** (justificación en la tabla) y `inject.js` como recurso accesible desde la web. Para que esa amplitud no genere doble inyección ni superficies ajenas: **`exclude_matches`** con `chrome-extension://*/*` y los orígenes de otras wallets (lista cerrada en M1) —no se inyecta en páginas de extensiones ni en las de otras wallets—, y **`use_dynamic_url: true`**, que evita que un tercero referencie el recurso mediante una URL estable. Lo único que la inyección expone es el provider (`window.truekeate` y su alias `window.codecrypto`); **nunca** claves, mnemonic ni el storage (`setAccessLevel: TRUSTED_CONTEXTS`, RNF-09). La redacción de RNF-10 («solo se expone a páginas autorizadas») se corrige en `requerimientos.md` conforme a ADT-20: el alcance efectivo es `<all_urls>` con estas exclusiones.

> **Favicon de `notification.html` (ADT-22; permiso cerrado en la v1.9 / `VR-01`).** El origen solicitante se muestra con el favicon que sirve el **propio navegador** (`chrome-extension://<EXTENSION_ID>/_favicon/?pageUrl=…&size=32`) —nunca con una URL remota ni con un `data:` enviado por la dApp— y se **sanea** antes de pintarlo. El permiso que lo habilita es **`favicon`**, **declarado en `permissions`** (tabla anterior y `documento_tecnico.md` §7.3); ya **no** es condicional: el conjunto de permisos es **idéntico** en `entornos_globales.md` §4, `documento_tecnico.md` §7.3 y `diccionario_datos.md` §3.8/§3.10. Si el navegador no devuelve icono, se usa el activo local del paquete.

> **Permisos retirados respecto del borrador anterior (H-36).** `tabs`: no se leen `url`/`title`/`favIconUrl`, y la pestaña destino se identifica con el `sender.tab.id` del propio mensaje, de modo que `chrome.tabs.query`/`sendMessage` no lo necesitan. `activeTab`: solo aplica a la pestaña tras una acción del usuario y no aporta nada al flujo por mensaje. `scripting`: la inyección se hace con `content_scripts` declarativos + `web_accessible_resources`, no con `chrome.scripting`. Si en Fase 3 alguna funcionalidad exige uno de ellos, se documenta aquí el uso exacto antes de volver a declararlo.

> Se retiró `https://rpc.sepolia.org/*` por la decisión **P-02**. Cualquier red nueva se da de alta con `chrome.permissions.request` sobre `optional_host_permissions` (nunca ampliando `host_permissions` con comodines).

> **Mínimos privilegios + runtime (ACU-27 / D-G).** El conjunto **declarado** en el manifest se mantiene en **mínimos privilegios**: `host_permissions` solo cubre el RPC local y **no crece** cuando se dan de alta redes nuevas. Todo permiso de host adicional se pide **en runtime y por red** sobre `optional_host_permissions`, tanto si el alta nace en la dApp como si nace en el **popup**; la concesión queda registrada por red en `truekeate_networks` (`diccionario_datos.md` §2.6) y la denegación impide persistir la red (`4001`).

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

> Nota: la historia local arranca con un commit raíz propio (docs de Fase 1) que **no** comparte ancestro con el commit `632d890` del remoto `codecrypto`. La estrategia de publicación se limita a la **historia git** (P-10/DEC-09): empujar la rama local con `--force` o `--allow-unrelated-histories`, o dejar `codecrypto` intacto como referencia y publicar solo en `origin`/`gitlab`. **El código del remoto no se reutiliza**: el proyecto se reconstruye desde cero y este documento no contempla ninguna reutilización de ese código.

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
| 1.3 | Incorporada la identidad visual TrueKeate (§9): activos originales y generados, rutas, paleta e instrucciones de regeneración de iconos. |
| 1.4 | Renombrado global a TrueKeate (P-13): provider `window.truekeate`, prefijo `truekeate_` y nomenclatura congelada en §10. |
| 1.5 | Remediación de la auditoría (Fase 2): sin rastro de reutilización del código del remoto (H-04), permiso `alarms` y mínimos privilegios (H-02/H-36), dueño único del plazo (H-07), «build limpio» + verificación Linux + política de versiones (H-20), puerto 5174 con `strictPort` y clave de sesión normalizada (H-33), CORS con allowlist (H-41), guía heredada no vinculante y verificación previa de E2E (H-24/H-29), alias del provider (H-15). |
| 1.6 | Cierre de la auditoría de casos de uso (decisiones D-A, D-B, D-C y D-G): `PROVIDER_NAME = TrueKeate` y `PROVIDER_RDNS = academy.codecrypto.truekeate` en §3 con la nota de que el `name` de EIP-6963 **no** es `manifest.name` (ACU-03); `SESSION_TTL_MS = 86400000` respaldado por RF-25 (ACU-17); literal único de build limpio `npm ci && npm run build` —`npm install` deja de ser válido como literal— (ACU-26 / D-C); permiso de host en runtime y por red, también desde el popup, con el manifest en mínimos privilegios (§4, ACU-27 / D-G); claves canónicas con prefijo completo (ACU-25). |
| **1.7** | Cierre de los hallazgos **ADT-01, ADT-14, ADT-19, ADT-20, ADT-21, ADT-28, ADT-29 y ADT-30** de `AUDITORIA_DOCUMENTO_TECNICO_V1.md` (decisiones D-L, D-M, D-N, D-O, D-P y D-U): **pipeline MV3 real** con los 7 scripts npm (`dev`, `build`, `typecheck`, `test`, `coverage`, `test:e2e`, `lint:prohibited`), las 6 entradas y las 3 páginas HTML junto a `test.html` (§1, §2.2; ADT-01); **ruta vigente de las constantes del plazo** en `src/background/approvals/timeout.ts` y de las compartidas en `src/shared/constants.ts`, declarando **sustituida** `src/background/approvals.ts` (§3; ADT-28); **cota de payload 64 KiB** con `-32602` y previews redactadas en reposo, **cuota de 10 MB** sin `unlimitedStorage` con 1 reintento y `-32603`, y **`REVEAL_HIDE_MS = 30000`** (§3; ADT-14, ADT-21); **`key` fija** del manifest y **UUID literal** de EIP-6963 (§3, §4; ADT-19); **`notifications` como permiso opcional** de RF-39 y manifest del MVP sin declararlo (§4; ADT-30); **alcance real de la inyección** `<all_urls>` + `all_frames` con `exclude_matches`, `use_dynamic_url` y favicon saneado del navegador (§4; ADT-20); **§10 con los 8 tipos de mensaje** (ADT-29); verificación previa de Anvil reforzada antes de los E2E (§2.4). |
 **1.8** — cierre del residual **R-08** del veredicto de reevaluación: el modo de fallo observable de la cuota de `chrome.storage.local` incorpora su evidencia reproducible (`Vitest: storageQuota.spec.ts`).
 **1.9 (esta versión)** — cierre de los residuales **`VR-01`** y **`VR-03`** de la última pasada de consistencia: **permisos del manifest** ampliados a `["storage", "alarms", "favicon", "clipboardRead", "clipboardWrite"]` en el fragmento `jsonc` de §4 y en su tabla de justificación (una fila nueva por permiso, con motivo y requisito), con la nota del favicon reescrita como permiso **declarado** y no condicional, de modo que el conjunto es idéntico en los cuatro documentos; y **siete constantes nuevas** en la tabla de §3 (`PREVIEW_INLINE_MAX_BYTES`, `INFLIGHT_TTL_MS`, `rateLimitBurst`, `rateLimitRefillPerSecond`, `rateWindowTtlMs`, `RATE_PERSIST_DEBOUNCE_MS` y `EXTENSION_ID`) con su valor y módulo responsable, cerrando las referencias que `diccionario_datos.md` hacía a esta sección.

---

## 8. Herramientas de prueba y calidad (P-07)

| Herramienta | Ámbito | Comando | Requisitos |
|---|---|---|---|
| **Vitest** (+ jsdom) | Lógica pura del Service Worker: derivación BIP-44, validación BIP-39/clave privada, formateo, cola de aprobaciones, mapeo de errores EIP-1193. | `npm run test` (cobertura: `npm run coverage`) | Ninguno (no necesita navegador). |
| **Playwright** (Chromium persistente) | E2E: cargar la extensión desde `dist/`, abrir el popup, conectar `test.html`, aprobar/rechazar firmas, verificar eventos `accountsChanged`/`chainChanged`. | `npm run test:e2e` | Chromium vía Playwright + **Anvil corriendo** en `127.0.0.1:8545` (verificación previa en §2.4). |
| **Forge** | Proyecto Foundry mínimo con `EIP712Verifier.sol` + tests: comprobar que las firmas producidas por la wallet son válidas on-chain. | `forge test --root contracts --match-contract EIP712VerifierTest` | Foundry dentro del rango soportado. **Aviso (DEC-51 / H1):** el literal `forge test` sin `--root contracts` da un **falso verde** («Nothing to compile», 0 pruebas, exit 0). |

### Política de versiones (H-20/H-29)

| Componente | Versión de referencia | Rango soportado / nota |
|---|---|---|
| **Foundry** (`anvil`, `forge`, `cast`) | **1.7.2-dev** (detectada en la máquina del proyecto) | **`>=1.0.0 <2.0.0`**. La detectada es una build de desarrollo (*-dev*), así que otro equipo puede comportarse distinto: los E2E y `forge test` se consideran válidos solo dentro del rango y tras la verificación previa de §2.4. |
| **ethers.js** | **6.15.x** | Única librería criptográfica permitida (RT-02); se fija la *minor* en `package.json` (`~6.15.0`). |
| **React** | **19.x** | Requisito de la fuente (E-05). |
| **Vite** | **7.x** | Requisito de la fuente; el puerto de la dApp está fijado en §2.2. |
| **Node.js / npm** | `v24.16.0` / `11.13.0` | Entorno verificado (§1). |
| **Iconos** | `public/icons/icon-{16,32,48,128}.png` | **Se versionan y no se regeneran en Linux** (§9.2): `scripts/generate-icons.ps1` depende de `System.Drawing` (Windows). |

> Cualquier cambio de versión de las dependencias principales se registra en este apartado y en el historial (§7) antes de la entrega, junto con la ejecución de `npm ci && npm run build` y la suite de pruebas.

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
| 1.4 | Renombrado global a TrueKeate (P-13): nomenclatura fijada en §10 y remoto `codecrypto` registrado como referencia. |
| 1.5 | Remediación de la auditoría: sin cambios de paleta; se añaden la política de versiones (§8), la verificación Linux y el puerto 5174 (§2.2) y la decisión firme sobre el alias del provider (§10). |
| 1.7 | Sin cambios de paleta; la referencia cruzada de este anexo se alinea con `identidad_visual.md` **v1.3** (botón fantasma accesible, portapapeles del revelado y contador de solicitudes pendientes). |
---

## 10. Nomenclatura del producto (decisión P-13)

| Elemento | Valor |
|---|---|
| Nombre del producto | **TrueKeate Wallet** |
| `manifest.name` | `TrueKeate Wallet` |
| Provider inyectado | **`window.truekeate`** (EIP-1193) |
| Alias de compatibilidad del provider | **`window.codecrypto = window.truekeate`** — **el mismo objeto** (no una copia ni un envoltorio), asignado en `inject.js` (H-15) |
| EIP-6963 `name` | `TrueKeate` |
| EIP-6963 `rdns` | `academy.codecrypto.truekeate` |
| EIP-6963 `uuid` | `9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90` — **literal congelado**, no aleatorio en cada carga (ADT-19 / D-N) |
| Prefijo de claves de storage | `truekeate_` |
| Tipos de mensaje internos (**8**) | `TRUEKEATE_REQUEST`, `TRUEKEATE_RESPONSE`, `TRUEKEATE_EVENT`, `TRUEKEATE_ANNOUNCE` (página ↔ inject ↔ content) · `TRUEKEATE_RPC`, `SIGN_RESPONSE`, `CONNECT_RESPONSE`, `RESUME` (content/popup ↔ service worker) — nombres literales de `diccionario_datos.md` §4.1 y §4.2 (ADT-29) |
| Dominio EIP-712 de la dApp | `TrueKeate Test App` |
| dApp de pruebas | `test.html` consumiendo `window.truekeate` |

> **Desviación consciente (P-13) — decisión firme (H-15/DEC-21).** El enunciado (E-03) exige `window.codecrypto`; el producto se llama TrueKeate, así que el provider es `window.truekeate`. Para **no perder los 5 puntos de la rúbrica** ligados al nombre antiguo, `inject.js` publica **además el alias `window.codecrypto = window.truekeate`** —el **mismo objeto**, no una copia ni un envoltorio— desde la Fase 3. Un **test verifica ambos nombres** (presentes, idénticos y con el mismo `request`/`on`) y el alias forma parte del entregable. No es una decisión diferida: es un criterio de aceptación.
