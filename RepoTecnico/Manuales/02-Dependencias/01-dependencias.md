# Manual de dependencias de TrueKeate Wallet

Propósito: inventariar **cada** paquete declarado en `package.json`, contrastar la versión declarada con la **realmente instalada** en `node_modules/`, justificar su uso concreto en este repositorio con referencias `ruta:línea`, detectar dependencias declaradas sin uso y cerrar con la tabla resumen y las herramientas externas al gestor de paquetes (Foundry, Node y npm).

> **Método.** Todo dato procede de ficheros leídos del repositorio: `package.json` (44 líneas, leído completo), el `package.json` de cada paquete en `node_modules/` (campos `version` y `license`) y búsquedas sobre `src/`, `e2e/`, `test/`, `scripts/`, `contracts/`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js` y los `tsconfig*.json`. No se ha ejecutado ningún build, test ni `npm install`.

## Inventario general

### Fuente de verdad y separación de ámbitos

`package.json` es la única fuente declarativa y separa dos bloques:

- **`dependencies`** (`package.json:19-23`): 3 paquetes. Son los que **sí viajan** en el artefacto cargable `dist/` (`NOTICE:16-23`, `NOTICE:68-70`).
- **`devDependencies`** (`package.json:24-43`): 18 paquetes. Construcción, pruebas, lint y tipado; **no** se empaquetan (`NOTICE:33-34`).

Total: **21 dependencias declaradas**, todas presentes en `node_modules/` con versión resoluble.

### Cómo se ha verificado el uso real

El uso no se deduce del nombre del paquete: cada ficha cita al menos una línea donde el paquete se importa, se declara en una configuración o se invoca desde un script npm. Los paquetes de tipos (`@types/*`) y el proveedor de cobertura se consumen de forma **indirecta** (resolución de tipos o `provider: 'v8'`) y así se indica.

## Dependencias de ejecución (`dependencies`)

### `ethers`

#### Ficha y uso

- **Declarada** `~6.15.0` (`package.json:20`) · **instalada** **6.15.0** (`node_modules/ethers/package.json`) · **ámbito** runtime · **licencia** MIT (`NOTICE:21`).
- Es, por diseño, la **única** librería criptográfica del producto (RT-02, `NOTICE:25-28`):
  - **RPC**: `src/background/rpc/client.ts:23` importa `JsonRpcProvider`, `Network`, `isError`, `toBeHex`; el provider es único y cacheado (`src/background/rpc/client.ts:3-16`) y se construye con red estática en `src/background/rpc/client.ts:205-206`.
  - **Derivación y claves**: `src/background/crypto/hd.ts:17` (`HDNodeWallet`, BIP-44), `src/background/crypto/mnemonic.ts:18` (`Mnemonic`, `randomBytes`, `sha256`, `wordlists`, `LangEn`), `src/background/crypto/importAccount.ts:14` (`computeAddress`), `src/background/crypto/integrity.ts:22` (`getAddress`, EIP-55).
  - **Firma**: `src/background/crypto/sign.ts:44` cubre EIP-1559, EIP-155, EIP-712 y `personal_sign` (nota sobre `TypedDataEncoder.recover` en `src/background/crypto/sign.ts:616`).
  - **Aprobaciones**: `src/background/approvals/calldata.ts:26` (`AbiCoder`, `keccak256`, `hexlify`) y `src/background/approvals/preview.ts:31` (`isBytesLike`, `isHexString`, `getBytes`).
  - **Seguridad**: `src/background/security/hash.ts:25` (`sha256`) y `src/background/security/redaction.ts:22` (`Mnemonic`, `wordlists`).
  - **Pruebas** que contrastan las firmas propias contra `ethers`: `src/background/crypto/eip1559.spec.ts:11`, `src/background/crypto/eip155.spec.ts:10`, `src/background/crypto/personalSign.spec.ts:10`, `src/background/crypto/sign.spec.ts:11`, `src/background/crypto/typedData.spec.ts:14`, `src/background/rpc/rpcRetry.spec.ts:9`.

### `react`

#### Ficha y uso

- **Declarada** `^19.0.0` (`package.json:21`) · **instalada** **19.3.0** · **ámbito** runtime · **licencia** MIT (`NOTICE:22`).
- Construye las **tres ventanas** y la dApp, sin criptografía en la capa de interfaz (RNF-14, `NOTICE:29-30`). Puntos de entrada: `src/popup/main.tsx:6` (`StrictMode`), `src/connect/main.tsx:13`, `src/notification/main.tsx:11`.
- 34 coincidencias de importación en `src/`, p. ej. `src/popup/App.tsx:26`, `src/popup/views/SendView.tsx:26`, `src/notification/TypedDataPanel.tsx:19`, `src/connect/App.tsx:34`.
- Prueba con render real: `src/background/polling.spec.ts:14` (`act`, `createElement`).

### `react-dom`

#### Ficha y uso

- **Declarada** `^19.0.0` (`package.json:22`) · **instalada** **19.3.0** · **ámbito** runtime · **licencia** MIT (`NOTICE:23`).
- Montador real de React 19, siempre por el subcamino `react-dom/client`: `src/popup/main.tsx:7` (`createRoot`), `src/connect/main.tsx:14`, `src/notification/main.tsx:12`.
- `src/background/polling.spec.ts:15` monta un árbol real (`createRoot`, tipo `Root`) para verificar el ciclo de sondeo del Service Worker frente a la interfaz.

## Dependencias de desarrollo (`devDependencies`)

### Empaquetado y compilación

#### `vite`

- **Declarada** `^7.0.0` (`package.json:41`) · **instalada** **7.3.6** · **licencia** MIT (`NOTICE:38`).
- **Uso:** empaquetador único. Se importa en `vite.config.ts:30` (`build as viteBuild`, `defineConfig`, `Plugin`, `UserConfig`) y ejecuta tres builds: el principal (`vite.config.ts:242-255`, formato `es`, `target: 'chrome114'`) y los `iife` de `content-script.js` e `inject.js` desde el plugin `contentAndInjectBuildsPlugin` (`vite.config.ts:181-193`, invocaciones en `vite.config.ts:189-190`). Su servidor sirve `test.html` en el puerto 5174 (`vite.config.ts:240`) y Playwright lo arranca solo con `command: 'npm run dev'` (`playwright.config.ts:37`).

#### `@vitejs/plugin-react`

- **Declarada** `^5.0.0` (`package.json:32`) · **instalada** **5.2.0** · **licencia** MIT (`NOTICE:39`).
- **Uso:** transform de React (JSX y Fast Refresh). Se importa como `react` en `vite.config.ts:31` y se registra en `vite.config.ts:239`. Como `vitest.config.ts` sustituye a `vite.config.ts` cuando existe, el plugin se vuelve a declarar allí (`vitest.config.ts:12` y `vitest.config.ts:16`) para que los specs importen módulos `.tsx`.

#### `typescript`

- **Declarada** `~5.9.0` (`package.json:39`) · **instalada** **5.9.3** · **licencia** Apache-2.0 (`NOTICE:40`).
- **Uso:** compilador y verificador de tipos. El script `build` lo ejecuta antes de Vite (`package.json:9`: `tsc -b && vite build`) y `typecheck` lo aísla (`package.json:16`). Configura `tsconfig.json` (`strict: true` en `tsconfig.json:17`, `noEmit` en `tsconfig.json:28`) y `tsconfig.node.json` (`composite` y `emitDeclarationOnly` en `tsconfig.node.json:10-13`, con la desviación TS6310 documentada en `tsconfig.node.json:6-8`).

### Pruebas unitarias y de integración

#### `vitest`

- **Declarada** `^3.0.0` (`package.json:42`) · **instalada** **3.2.7** · **licencia** MIT (`NOTICE:41`).
- **Uso:** ejecutor de pruebas unitarias y de contrato interno: `package.json:10` (`vitest run`), `package.json:11` (vigilancia) y `package.json:12` (`--coverage`). Su bloque de configuración vive en `vite.config.ts:215-233` bajo el nombre exportado `testConfig` (documentado en `vite.config.ts:195-214`) y `vitest.config.ts:11-17` lo reutiliza como fuente única. Referencia de tipos en `vite.config.ts:1` y `tsconfig.json:16` (`vitest/globals`, porque `globals: true` en `vite.config.ts:219`). El `setupFiles` apunta a `./test/setup/chrome-stub.ts` (`vite.config.ts:217`, explicado en `test/setup/chrome-stub.ts:8-11`).

#### `@vitest/coverage-v8`

- **Declarada** `^3.0.0` (`package.json:33`) · **instalada** **3.2.7** · **licencia** MIT (`NOTICE:42`).
- **Uso (indirecto):** no se importa en ningún fichero; se selecciona con `coverage.provider: 'v8'` en `vite.config.ts:221`. Sobre él se declaran los umbrales de ramas de RNF-17 en `vite.config.ts:226-231` (70 % global y 80 % en `src/background/crypto/**`, `src/background/approvals/**` y `src/shared/validation/**`), explicados en `vite.config.ts:199-205`.

#### `jsdom`

- **Declarada** `^26.0.0` (`package.json:37`) · **instalada** **26.1.0** · **licencia** MIT (`NOTICE:43`).
- **Uso en dos frentes:** (1) entorno de Vitest con `environment: 'jsdom'` (`vite.config.ts:216`), para que los specs dispongan de `document` y `window`; (2) puerta de CI de los diagramas, donde `scripts/check-mermaid.mjs:235` importa dinámicamente `JSDOM` para instalar un DOM global antes de cargar Mermaid (`scripts/check-mermaid.mjs:236`), camino documentado en `scripts/check-mermaid.mjs:8-9`.

### Pruebas de extremo a extremo (E2E)

#### `@playwright/test`

- **Declarada** `^1.50.0` (`package.json:27`) · **instalada** **1.63.0** · **licencia** Apache-2.0 (`NOTICE:44`).
- **Uso:** arnés E2E sobre Chromium con la extensión cargada. La configuración es `playwright.config.ts` completa: `defineConfig` en `playwright.config.ts:14`, `testDir: 'e2e'` en `playwright.config.ts:25`, `globalSetup` en `playwright.config.ts:26`, `webServer` de la dApp en `playwright.config.ts:36-43`, un único worker en `playwright.config.ts:46-47` y el proyecto `chromium-extension` con `channel: 'chromium'` en `playwright.config.ts:72-78`. Lo usan los tests en `e2e/fixtures/extension.ts:25` (`chromium`, `expect`, `test as base`) y como tipo en `e2e/24-accesibilidad.spec.ts:29`, `e2e/12-redes.spec.ts:29`, `e2e/17-i18n.spec.ts:21`, `e2e/22-dapp.spec.ts:17`, `e2e/28-iframe-hostil.spec.ts:18`, `e2e/31-persistencia-navegador.spec.ts:22`, `e2e/32-aprobacion-vence-y-cierre.spec.ts:19` y `e2e/fixtures/h2.ts:11`. Se lanza con `playwright test` (`package.json:13`).

#### `@axe-core/playwright`

- **Declarada** `^4.13.0` (`package.json:25`) · **instalada** **4.13.0** · **licencia** **MPL-2.0** (`NOTICE:45`).
- **Uso:** único destino, la suite de accesibilidad RNF-21. Se importa como `AxeBuilder` en `e2e/24-accesibilidad.spec.ts:28` y se ejecuta sobre las cuatro superficies (popup, `connect.html`, `notification.html` y `test.html`) según `e2e/24-accesibilidad.spec.ts:7-8`; resumen por superficie y aserción de cero violaciones en `e2e/24-accesibilidad.spec.ts:57`, `:70` y `:94`. Es la única dependencia con licencia MPL-2.0 del repositorio (`NOTICE:59-63`; detalle en `02-licencias.md`).

### Calidad de código (ESLint 9, configuración plana)

#### `eslint`

- **Declarada** `^9.0.0` (`package.json:34`) · **instalada** **9.39.5** · **licencia** MIT (`NOTICE:46`).
- **Uso:** linter con configuración plana; `eslint.config.js:11` abre con `tseslint.config(...)`. El objetivo (avisos de estilo, errores solo de corrección) está en `eslint.config.js:1-5` y las rutas excluidas en `eslint.config.js:14-24`.

#### `@eslint/js`

- **Declarada** `^9.0.0` (`package.json:26`) · **instalada** **9.39.5** · **licencia** MIT (`NOTICE:47`).
- **Uso:** reglas recomendadas del núcleo. Importación en `eslint.config.js:6` y aplicación en `eslint.config.js:26` (`js.configs.recommended`).

#### `typescript-eslint`

- **Declarada** `^8.0.0` (`package.json:40`) · **instalada** **8.70.0** · **licencia** MIT (`NOTICE:48`).
- **Uso:** helper `config` y reglas recomendadas de TypeScript. Importación en `eslint.config.js:9`, difusión en `eslint.config.js:27` (`...tseslint.configs.recommended`) y reglas propias en `eslint.config.js:44-49`.

#### `eslint-plugin-react-hooks`

- **Declarada** `^7.1.1` (`package.json:35`) · **instalada** **7.1.1** · **licencia** MIT (`NOTICE:49`).
- **Uso:** reglas de React restringidas a módulos con JSX. Importación en `eslint.config.js:8`, registro del plugin en `eslint.config.js:59` y las dos únicas reglas de React del proyecto en `eslint.config.js:61-62` (`rules-of-hooks` como error, `exhaustive-deps` como aviso).

#### `globals`

- **Declarada** `^17.0.0` (`package.json:36`) · **instalada** **17.12.0** · **licencia** MIT (`NOTICE:50`).
- **Uso:** catálogo de variables globales por entorno. Importación en `eslint.config.js:7` y aplicación en tres puntos: navegador + Node para el código general (`eslint.config.js:35-36`, con `chrome: 'readonly'` añadido en `eslint.config.js:37`) y solo Node para los scripts `.mjs` (`eslint.config.js:69`).

### Documentación y diagramas

#### `mermaid`

- **Declarada** `^11.0.0` (`package.json:38`) · **instalada** **11.17.2** · **licencia** MIT (`NOTICE:51`).
- **Uso:** no interviene en la interfaz; es el **validador de los diagramas** de la documentación. El script `check:mermaid` (`package.json:15`) ejecuta `scripts/check-mermaid.mjs`, que carga Mermaid 11 en modo real (`scripts/check-mermaid.mjs:265`), lo inicializa (`scripts/check-mermaid.mjs:266`) y llama a `mermaid.parse()` sobre cada bloque (`scripts/check-mermaid.mjs:305`). Si no puede cargarse, degrada al MODO B estructural (`scripts/check-mermaid.mjs:291-297`).

### Paquetes de tipos (`@types/*`)

> **Nota de método:** estos cuatro paquetes no se importan por su nombre en ningún fichero. Su uso es **indirecto**: se consumen por resolución de módulos (`react`, `react-dom`, `chrome`) o porque están listados en el campo `types` de los `tsconfig`. Se documentan igualmente porque ese array los activa de forma deliberada.

#### `@types/chrome`

- **Declarada** `^0.1.0` (`package.json:28`) · **instalada** **0.1.43** · **licencia** MIT (`NOTICE:52`).
- **Uso:** declaraciones de la API MV3 (`chrome.storage`, `chrome.alarms`, `chrome.windows`…). Activado en `tsconfig.json:16` y `tsconfig.node.json:20` (`"types": ["chrome", …]`, justificado en `tsconfig.json:13`). El stub que la implementa en memoria es `test/setup/chrome-stub.ts`, cuya razón está en `test/setup/chrome-stub.ts:11` («jsdom no trae `chrome`»).

#### `@types/node`

- **Declarada** `^24.0.0` (`package.json:29`) · **instalada** **24.13.4** · **licencia** MIT (`NOTICE:53`).
- **Uso:** tipos de Node para el tooling. Activado en `tsconfig.json:16` y `tsconfig.node.json:20`; su efecto se ve en los imports `node:*` de la configuración de Vite (`vite.config.ts:32-34`: `node:fs`, `node:path`, `node:url`) y de los scripts (`scripts/lint-prohibited.mjs:23-24`, `scripts/check-mermaid.mjs:22-23`, `scripts/generate-icon-data.mjs:13-15`), además de `process.env` y `process.exit` (`scripts/lint-prohibited.mjs:209` y `:214`).

#### `@types/react`

- **Declarada** `^19.0.0` (`package.json:30`) · **instalada** **19.3.0** · **licencia** MIT (`NOTICE:54`).
- **Uso:** tipado de la superficie de React 19. Resuelve el tipo `JSX` que los módulos importan explícitamente (p. ej. `src/popup/components/Field.tsx:9`) y da sentido a `jsx: "react-jsx"` en `tsconfig.json:11` y `tsconfig.node.json:19`.

#### `@types/react-dom`

- **Declarada** `^19.0.0` (`package.json:31`) · **instalada** **19.3.0** · **licencia** MIT (`NOTICE:55`).
- **Uso:** tipado del montador en el cliente. Resuelve el módulo `react-dom/client` que importan los tres puntos de entrada (`src/popup/main.tsx:7`, `src/connect/main.tsx:14`, `src/notification/main.tsx:12`) y el spec que monta un árbol real (`src/background/polling.spec.ts:15`).

## Dependencias declaradas sin uso verificado

### Resultado de la comprobación

Tras buscar los 21 paquetes en `src/`, `e2e/`, `test/`, `scripts/`, `contracts/` y en los ficheros de configuración (`vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `tsconfig.json`, `tsconfig.node.json`):

**No se ha encontrado ninguna dependencia declarada sin uso.** No hay candidatas a retirada en este inventario.

### Matices que conviene registrar

No son dependencias muertas, pero su uso no aparece como un `import` con su nombre:

- `@vitest/coverage-v8` — uso indirecto vía `coverage.provider: 'v8'` (`vite.config.ts:221`). **Confirmado.**
- `@types/chrome`, `@types/node`, `@types/react`, `@types/react-dom` — uso indirecto vía el campo `types` de los `tsconfig` y la resolución de módulos. **Confirmado.**
- `react-dom` — siempre se importa por el subcamino `react-dom/client`, nunca por el paquete raíz; una búsqueda del literal `from 'react-dom'` no devuelve coincidencias y **no** implica ausencia de uso (`src/popup/main.tsx:7`). **Confirmado.**
- `eslint` — no se importa desde el código; es el binario que consume `eslint.config.js`. **Confirmado.**

### Límites de esta comprobación

Este manual **no** ejecuta `npm ls`, `npm run lint:prohibited`, `npm ci` ni ningún build o test: la política de la tarea lo prohíbe. La afirmación «todas las dependencias se usan» se limita a la evidencia citada arriba. Las dependencias **transitivas** (no declaradas en `package.json`) quedan fuera del alcance y **pendiente de confirmar**.

## Herramientas externas al gestor de paquetes

### Foundry (`forge`, `anvil`, `cast`)

#### Naturaleza y ámbito

Foundry **no** es una dependencia npm: no figura en `package.json` y se instala aparte. Cumple dos papeles distintos:

- **`anvil`**: nodo local de pruebas. La wallet es 100 % local y opera contra `127.0.0.1:8545` (`README.md:3`, `README.md:82`).
- **`forge`**: compila y ejecuta el contrato auxiliar de `contracts/`, que es un **instrumento de prueba** y no parte del producto (`contracts/foundry.toml:1-2`, `contracts/src/EIP712Verifier.sol:5-7`).

#### Versión requerida y detectada

| Fuente | Dato |
|---|---|
| `RepoTecnico/entornos_globales.md:21` | Foundry `anvil`/`forge`/`cast` **1.7.2-dev**; binarios en `C:\Users\lucci\.cargo\bin\` |
| `RepoTecnico/entornos_globales.md:370` | Rango soportado **`>=1.0.0 <2.0.0`**; la detectada es una build `-dev` |
| `README.md:29` | **≥ 1.0.0 y < 2.0.0** (probado con 1.7.2-dev) |
| `contracts/foundry.toml:6` | `solc = "0.8.24"`, **fijado** (no rango) por reproducibilidad (RNF-24) |
| `contracts/foundry.toml:7` | `evm_version = "cancun"` |

La versión de `solc` no la impone Foundry de forma abierta: el repositorio la fija en `contracts/foundry.toml:6` y el propio contrato la repite con `pragma solidity 0.8.24;` en `contracts/src/EIP712Verifier.sol:2`.

#### Comando normativo del proyecto

`package.json:17` declara el script `forge:test`:

```
forge test --root contracts --match-contract EIP712VerifierTest
```

`RepoTecnico/entornos_globales.md:364` explica por qué el literal incluye `--root contracts` (aviso DEC-51 / H1: `forge test` sin `--root contracts` da un **falso verde** — «Nothing to compile», 0 pruebas, exit 0). `contracts/foundry.toml:14` añade el permiso de lectura `fs_permissions` que necesita el fixture leído con `vm.readFile`.

### Node.js y npm

#### Requisito de versión

| Fuente | Requisito |
|---|---|
| `RepoTecnico/entornos_globales.md:19` | **Node.js `v24.16.0`**, «Compatible con Vite 7» |
| `RepoTecnico/entornos_globales.md:20` | **npm `11.13.0`**, «Gestor de paquetes elegido» |
| `RepoTecnico/entornos_globales.md:374` | Política de versiones (H-20/H-29): Node `v24.16.0` / npm `11.13.0` — entorno verificado |
| `README.md:27` | **Node.js ≥ 20** (probado con v24); comprobar con `node -v` |
| `README.md:28` | **npm ≥ 10** (viene con Node); comprobar con `npm -v` |
| `README.md:30` | **Chrome o Edge ≥ 114** para cargar la extensión MV3 |

#### Instalación y reproducibilidad

El literal único de «build limpio» del corpus es **`npm ci && npm run build`**, no `npm install`: está fijado en `RepoTecnico/entornos_globales.md:110` (decisión D-C), repetido en `README.md:45`, mostrado en `README.md:42` y `README.md:50`. El motivo es que `package-lock.json` está versionado y `npm ci` instala exactamente lo que ese fichero fija. La compatibilidad Node ↔ Vite 7 está anotada en `RepoTecnico/entornos_globales.md:19`.

#### Relación con el navegador objetivo

`vite.config.ts` fija el `target` de compilación a `chrome114` (`vite.config.ts:245`), coherente con el requisito de navegador del `README.md:30`.

## Tabla resumen de dependencias

| Paquete | Declarada | Instalada | Ámbito | Uso en este proyecto | Licencia |
|---|---|---|---|---|---|
| `ethers` | `~6.15.0` | 6.15.0 | runtime | Única librería criptográfica: RPC, HD, firma EIP-1559/155/712, `personal_sign` (`src/background/rpc/client.ts:23`, `src/background/crypto/sign.ts:44`) | MIT |
| `react` | `^19.0.0` | 19.3.0 | runtime | Interfaz de popup, connect y notification (`src/popup/main.tsx:6`) | MIT |
| `react-dom` | `^19.0.0` | 19.3.0 | runtime | Montaje en el DOM vía `react-dom/client` (`src/popup/main.tsx:7`) | MIT |
| `@axe-core/playwright` | `^4.13.0` | 4.13.0 | dev | Suite E2E de accesibilidad RNF-21 (`e2e/24-accesibilidad.spec.ts:28`) | MPL-2.0 |
| `@eslint/js` | `^9.0.0` | 9.39.5 | dev | Reglas recomendadas del núcleo ESLint (`eslint.config.js:26`) | MIT |
| `@playwright/test` | `^1.50.0` | 1.63.0 | dev | Arnés E2E Chromium (`playwright.config.ts:14`) | Apache-2.0 |
| `@types/chrome` | `^0.1.0` | 0.1.43 | dev | Tipos de la API MV3 (`tsconfig.json:16`) | MIT |
| `@types/node` | `^24.0.0` | 24.13.4 | dev | Tipos de Node para tooling y scripts (`vite.config.ts:32`) | MIT |
| `@types/react` | `^19.0.0` | 19.3.0 | dev | Tipo `JSX` y superficie de React (`src/popup/components/Field.tsx:9`) | MIT |
| `@types/react-dom` | `^19.0.0` | 19.3.0 | dev | Tipos de `react-dom/client` (`src/popup/main.tsx:7`) | MIT |
| `@vitejs/plugin-react` | `^5.0.0` | 5.2.0 | dev | Transform de React en Vite y Vitest (`vite.config.ts:31`, `vitest.config.ts:12`) | MIT |
| `@vitest/coverage-v8` | `^3.0.0` | 3.2.7 | dev | Proveedor de cobertura (`vite.config.ts:221`) | MIT |
| `eslint` | `^9.0.0` | 9.39.5 | dev | Linter con configuración plana (`eslint.config.js:11`) | MIT |
| `eslint-plugin-react-hooks` | `^7.1.1` | 7.1.1 | dev | Reglas de hooks de React (`eslint.config.js:61-62`) | MIT |
| `globals` | `^17.0.0` | 17.12.0 | dev | Variables globales por entorno en ESLint (`eslint.config.js:35-36`) | MIT |
| `jsdom` | `^26.0.0` | 26.1.0 | dev | Entorno de Vitest y DOM para validar Mermaid (`vite.config.ts:216`, `scripts/check-mermaid.mjs:235`) | MIT |
| `mermaid` | `^11.0.0` | 11.17.2 | dev | `mermaid.parse()` sobre los diagramas del corpus (`scripts/check-mermaid.mjs:305`) | MIT |
| `typescript` | `~5.9.0` | 5.9.3 | dev | `tsc -b` del build y del typecheck (`package.json:9`, `package.json:16`) | Apache-2.0 |
| `typescript-eslint` | `^8.0.0` | 8.70.0 | dev | Reglas recomendadas de TS (`eslint.config.js:27`) | MIT |
| `vite` | `^7.0.0` | 7.3.6 | dev | Empaquetador y servidor de desarrollo puerto 5174 (`vite.config.ts:30`) | MIT |
| `vitest` | `^3.0.0` | 3.2.7 | dev | Pruebas unitarias y de integración (`vite.config.ts:215-233`) | MIT |

### Herramientas externas (no son dependencias npm)

| Herramienta | Versión requerida | Fuente de la declaración | Uso en este proyecto |
|---|---|---|---|
| Foundry (`forge`, `anvil`, `cast`) | `>= 1.0.0 < 2.0.0` (probado con 1.7.2-dev) | `RepoTecnico/entornos_globales.md:370`, `README.md:29` | Nodo local de pruebas y contrato verificador EIP-712 (`package.json:17`) |
| `solc` | `0.8.24` (fijado) | `contracts/foundry.toml:6`, `contracts/src/EIP712Verifier.sol:2` | Compilación de `contracts/src/EIP712Verifier.sol` |
| Node.js | **≥ 20** (probado con v24.16.0) | `README.md:27`, `RepoTecnico/entornos_globales.md:19` | Compilar y ejecutar el tooling |
| npm | **≥ 10** (probado con 11.13.0) | `README.md:28`, `RepoTecnico/entornos_globales.md:20` | Instalación reproducible (`npm ci`) |
| Chrome / Edge | **≥ 114** | `README.md:30` | Cargar la extensión MV3 |

### Cierre

Las 21 dependencias declaradas en `package.json` están instaladas y tienen un uso localizable en el repositorio. Las tres de ejecución (`ethers`, `react`, `react-dom`) son las únicas que viajan en `dist/` (`NOTICE:68-70`); las 18 restantes son herramientas de desarrollo y no se empaquetan. Las licencias asociadas se detallan en `02-licencias.md`.
