# TrueKeate Wallet

Extensión de navegador **Chrome/Edge (Manifest V3)** que funciona como **monedero Ethereum** al estilo de MetaMask: crea o importa una cartera, deriva cuentas HD, recibe y envía ETH, firma transacciones (EIP-1559 / EIP-155) y datos (EIP-712 y `personal_sign`), inyecta un provider **EIP-1193** (`window.truekeate`, con alias `window.codecrypto`) y expone un anuncio **EIP-6963**. Incluye una **dApp de pruebas** (`test.html`) y un **panel de actividad** con exportación JSON. Todo funciona **100 % en local** contra una red de pruebas **Anvil** de Foundry: **no hay backend, no hay telemetría y no hay peticiones a CDN** (las tipografías y los activos de marca se sirven desde el propio paquete).

| | |
|---|---|
| **Producto** | TrueKeate Wallet |
| **Titular** | ANLU corporations |
| **Licencia** | `LICENSE` (MIT) · avisos de terceros en `NOTICE` |
| **Stack** | React 19 · TypeScript 5.9 (strict) · Vite 7 · ethers.js v6 · Chrome Extension APIs MV3 |
| **Pruebas** | Vitest (unitarias) · Playwright (E2E sobre Chromium) · Forge (contrato verificador EIP-712) |
| **ID de extensión** | `oiahebaliobknoeeonhgaacapjcpgblo` (fijado por la `key` del manifest: es reproducible en cualquier equipo) |
| **Idioma de la UI y de la documentación** | Español (los identificadores de código están en inglés) |

> **Aviso importante.** Esto es una **cartera de desarrollo**: funciona **sin contraseña** y guarda la frase de recuperación en el almacén local de la extensión. Está pensada para la red local de pruebas y para practicar. **No la uses con fondos reales.**

---

## 1. Puesta en marcha en 4 pasos

Estos 4 pasos bastan para tener la extensión funcionando. No hace falta leer ningún otro documento.

### Paso 0 · Requisitos (una sola vez)

| Herramienta | Versión mínima | Comprobación | Para qué |
|---|---|---|---|
| **Node.js** | **≥ 20** (probado con v24) | `node -v` | Compilar el paquete (`npm ci && npm run build`). |
| **npm** | ≥ 10 (viene con Node) | `npm -v` | Instalar dependencias. |
| **Foundry** (`anvil`, `forge`, `cast`) | ≥ 1.0.0 y < 2.0.0 (probado con 1.7.2-dev) | `anvil --version` | Red local de pruebas y contrato verificador EIP-712. |
| **Chrome o Edge** | **≥ 114** | `chrome://version` | Cargar la extensión (Manifest V3). |
| **Git** *(opcional)* | cualquiera | `git --version` | Clonar el repositorio. |

Instalación de Foundry (si no lo tienes): `curl -L https://foundry.paradigm.xyz | bash` y después `foundryup`. En Windows, asegúrate de que `%USERPROFILE%\.cargo\bin` está en el `PATH`.

> Solo si vas a **usar** la wallet (paso 4-bis) necesitas además Anvil en marcha. Para **cargar la extensión** no hace falta Anvil.

### Paso 1 · Instalar dependencias

Desde la raíz del repositorio:

```bash
npm ci
```

`npm ci` instala exactamente lo que fija `package-lock.json` (que está versionado). Si prefieres `npm install`, el resultado es equivalente, pero la puerta de calidad usa `npm ci`.

### Paso 2 · Compilar el paquete

```bash
npm run build
```

Un solo comando produce **las 6 entradas** de la extensión en `dist/` y genera `dist/manifest.json`:

| Entrada en `dist/` | Qué es |
|---|---|
| `index.html` | Popup (ventana principal, 380 × 600). |
| `connect.html` | Ventana de solicitud de conexión de una dApp (420 × 650). |
| `notification.html` | Ventana única de confirmación de firma (420 × 640). |
| `background.js` | Service Worker (módulo ES). |
| `content-script.js` | Content script (IIFE, relay entre la página y el Service Worker). |
| `inject.js` | Provider inyectado `window.truekeate` (IIFE). |
| `manifest.json` | Manifest MV3 generado y validado por el build (falla si falta una entrada o la `key`). |

El build termina con **exit 0** y **0 errores de tipos** (`tsc -b` en modo `strict`).

### Paso 3 · Cargar la extensión en el navegador

1. Abre **`chrome://extensions`** (en Edge: `edge://extensions`).
2. Activa el **«Modo de desarrollador»** (interruptor de la esquina superior derecha).
3. Pulsa **«Cargar descomprimida»** y selecciona la carpeta **`dist/`** del repositorio (no `src/`, no la raíz).
4. Debe aparecer **TrueKeate Wallet** con el ID de extensión **`oiahebaliobknoeeonhgaacapjcpgblo`**, **sin** ningún error en la tarjeta ni en la consola del Service Worker (enlace «service worker» de la tarjeta).

> Si el navegador está en el paso de compilación, repite el paso 2 tras cualquier cambio de código: `chrome://extensions` → botón **↻** de la tarjeta.

### Paso 4 · Usar la wallet

La extensión **ya funciona sin Anvil**: puedes crear o importar una cartera y verás el estado «desconectado» / «sin red» sin errores. Para operar de verdad (saldos, envíos, firmas, cambio de red) levanta Anvil y la dApp:

```bash
# Terminal 1 — nodo local (OBLIGATORIO el comodín de CORS: la extensión tiene origen propio)
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"

# Terminal 2 — dApp de pruebas (se sirve en http://localhost:5174/test.html)
npm run dev
```

> **No añadas `--silent`.** Con `--silent` y la salida redirigida, Anvil no arranca y toda la suite E2E falla con `ERR_CONNECTION_REFUSED`, un síntoma que se confunde con un defecto del producto.

Después: pulsa el icono de TrueKeate, acepta el aviso de entorno de desarrollo, **crea una cartera nueva** (o importa la frase de Anvil) y abre `http://localhost:5174/test.html` para conectar la dApp. El recorrido detallado, pantalla por pantalla, está en **`INSTRUCCIONES.md`**.

---

## 2. Las 4 suites y las puertas de calidad

Los cuatro comandos siguientes son la **puerta de calidad** del proyecto. Con **Anvil en marcha** (paso 4) y desde la raíz:

```bash
npm run test          # 1) Vitest: pruebas unitarias y de contrato interno
npm run test:e2e      # 2) Playwright: E2E reales sobre Chromium con la extensión cargada
npm run forge:test    # 3) Foundry: contrato verificador EIP-712
npm run lint:prohibited   # 4) Guardas del corpus (RT-03, nomenclatura, colores, CDN)
```

| Suite | Comando | Qué cubre | Requisitos que verifica |
|---|---|---|---|
| **Vitest** | `npm run test` (o `npm run coverage`) | Criptografía BIP-39/EIP-55, derivación HD, cola de aprobaciones, redacción de logs, validación de formularios, contrato interno del SW, cabecera JSDoc de cada módulo. | RNF-13, RNF-17, RT-02, RT-07 |
| **Playwright** | `npm run test:e2e` | Carga de `dist/` con 0 errores, onboarding, cuentas, recepción, envío, persistencia, reset, provider, eventos, conexión, aprobación de transacción, EIP-712, `personal_sign`, redes, revocación, polling, actividad, accesibilidad, marca, recuperación, RPC caído, iframe hostil, SW suspendido. | RF-46, RNF-21, RT-07, RT-09, RT-13 |
| **Forge** | `npm run forge:test` | Que la firma EIP-712 producida por la wallet sea verificable on-chain por `EIP712Verifier.sol`. | RF-20, RT-11 |
| **Guardas** | `npm run lint:prohibited` | 0 `fetch`/`axios`/CDN, 0 `chrome.storage.sync`, 0 literales de color fuera de `tokens.css`, 0 nomenclatura heredada, `ethers` fuera del popup. | RNF-18, RNF-20, RT-02, RT-03, RT-10, RNF-14 |

Comandos auxiliares:

```bash
npm run coverage      # Vitest + informe de cobertura (umbrales de RNF-17 aplicados)
npm run typecheck     # tsc -b (strict), sin emitir
npm run check:mermaid # valida todos los diagramas Mermaid de RepoTecnico/
npm run test:watch    # Vitest en modo vigilancia (desarrollo)
```

**Cobertura (RNF-17).** `npm run coverage` **falla** si no se cumplen los umbrales: **≥ 70 % de ramas global** y **≥ 80 % de ramas** en `src/background/crypto/`, `src/background/approvals/` y `src/shared/validation/`. El informe HTML queda en `coverage/`.

**Antes de ejecutar los E2E:** Anvil en marcha (`anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"`). Playwright levanta y apaga **por sí solo** el servidor de la dApp (`npm run dev`, puerto 5174) gracias a `webServer`: no hay que arrancarlo a mano. **No ejecutes Vitest y Playwright a la vez** (Vitest escribe temporales en `src/` y el vigilante de Vite reinicia y tumba el servidor de la dApp).

---

## 3. Estructura del repositorio

```
chrome-wallet/
├── src/
│   ├── background.ts                 Service Worker: arranque, cola, alarmas, mensajería
│   ├── background/
│   │   ├── crypto/                   BIP-39, derivación HD, claves, firma (ethers.js v6)
│   │   ├── approvals/                Cola persistida, plazos, ventana única, previews
│   │   ├── networks/                 Alta y cambio de red
│   │   ├── logging/                  Registro de actividad, retención y cuota
│   │   ├── rpc/                      Router, catálogo, cliente JSON-RPC, errores EIP-1193
│   │   ├── security/                 Guardas de emisor, redacción de secretos, niveles
│   │   └── state/                    Esquema y migraciones de chrome.storage.local
│   ├── inject/                       Provider EIP-1193 + EIP-6963 (IIFE)
│   ├── content-script.ts             Relay página ↔ Service Worker
│   ├── popup/                        Las 7 pestañas del popup (React 19)
│   ├── connect/                      Ventana de conexión de dApp
│   ├── notification/                 Ventana de confirmación de firma
│   ├── shared/                       Tipos, protocolo, constantes, formato, validación
│   ├── styles/                       tokens.css y base.css (identidad TrueKeate)
│   └── manifest.ts                   Fuente tipada del manifest MV3
├── contracts/                        Proyecto Foundry: EIP712Verifier.sol + test
├── e2e/                              Suite Playwright y su arnés (fixtures, global-setup)
├── test/setup/                       Stub de las APIs de chrome.* para Vitest
├── scripts/                          Guardas del corpus, validador Mermaid, generadores
├── public/                           Iconos, activos de marca y tipografías OFL-1.1
├── RepoTecnico/                      Documentación del proyecto y evidencia de los hitos
├── test.html                         dApp de pruebas (7 flujos)
├── LICENSE · NOTICE                  Licencia y avisos de terceros
└── README.md · INSTRUCCIONES.md      Este documento y el recorrido funcional completo
```

---

## 4. Decisiones de diseño que conviene conocer

Las decisiones completas están en `RepoTecnico/estado_proyecto.md` (tabla de decisiones **DEC-01…DEC-78**) y en `RepoTecnico/documento_tecnico.md` (ADR). Las que más afectan al uso o a la evaluación:

| Decisión | Por qué |
|---|---|
| **Red única: Anvil local** (31337), sin Sepolia. | El proyecto es 100 % local y sin GCP: el cambio de red se prueba entre redes locales con `wallet_addEthereumChain`. |
| **Sin contraseña, en modo desarrollo.** | Decisión explícita del alcance; el riesgo se acepta y se documenta, y se compensa con avisos in-product (RNF-23) y con la higiene del revelado. |
| **El producto se llama TrueKeate; el provider expone `window.truekeate` *y* el alias `window.codecrypto`** (el **mismo** objeto). | Mantiene la compatibilidad con el nombre del enunciado sin renunciar a la marca. |
| **Una sola ventana de confirmación global** (`notification.html`) con contador de pendientes; el resto de solicitudes esperan en la cola. | Evita ventanas duplicadas y hace el orden de decisión determinista. |
| **El alta de red no activa la red.** | Añadir una red y empezar a usarla son dos actos con consentimiento separado. |
| **Cola persistida + `chrome.alarms` + reconciliación al arrancar.** | El Service Worker MV3 se suspende: el estado crítico no puede vivir solo en memoria. |
| **`eth_sign` retirado** (responde `4200`); solo `personal_sign`. | `eth_sign` firma un digest opaco, sin interpretación para el usuario. |
| **3 builds encadenados en Vite** (ES + 2 IIFE) y **manifest generado** desde `src/manifest.ts`. | Vite 7 no admite un array de builds y el *code-splitting* es incompatible con IIFE; el manifest se valida en el propio build. |
| **Poppins en 3 pesos discretos e Inter/JetBrains Mono variables, auto-hospedadas con licencia OFL-1.1.** | Cero CDN (RNF-20) y licencias registradas (`NOTICE`). |
| **`dist/` con `key` fija ⇒ ID de extensión estable.** | Hace reproducible la allowlist CORS de Anvil y la propia suite E2E. |

**Lo que la wallet *no* hace (alcance fuera del MVP):** badge de contador, notificaciones del navegador, eliminación de cuentas importadas, hint de la frase de Anvil, historial de la dApp y validación del ciclo de vida del plazo. Son los **10 requisitos *Should*** (RF-06, RF-12, RF-32, RF-34, RF-38…RF-40, RF-44, RF-47, RF-48), planificados en el ciclo posterior `C1..C10` de `RepoTecnico/plan_desarrollo.md` §4. *(El diálogo «Acerca de» que sí existe es la superficie que exige RNF-23 para el aviso de entorno; la pantalla completa de RF-48 no se declara cerrada.)*

---

## 5. Evidencias

Toda la evidencia de ejecución se archiva por hito en **`RepoTecnico/evidencia/H1 … H6`**: log de cada comando, informe JSON de Playwright, capturas, volcados de cobertura y un **acta** (`ACTA_H1.md` … `ACTA_H6.md`) con la tabla de comandos y su resultado real. El punto de entrada de la documentación es `RepoTecnico/estado_proyecto.md`; el plan por hitos, `RepoTecnico/plan_desarrollo.md`; los requisitos y su criterio de aceptación, `RepoTecnico/requerimientos.md`.

## 6. Licencia

El código de TrueKeate Wallet se distribuye bajo la licencia **MIT** — ver **`LICENSE`** (titular: **ANLU corporations**). Las dependencias de terceros y las tipografías (Poppins, Inter y JetBrains Mono, bajo **SIL Open Font License 1.1**) se detallan en **`NOTICE`**, con los textos completos de las fuentes en `public/fonts/LICENSE-*.txt`.
