# Entornos y comandos de TrueKeate Wallet

Propósito: fijar **qué hay que tener instalado**, **qué comando exacto se ejecuta para cada tarea** y **en qué puerto y red local se trabaja** en este repositorio, transcribiendo los literales reales de `package.json`, `README.md`, `INSTRUCCIONES.md`, `RepoTecnico/entornos_globales.md` (fuente normativa de entorno), `vite.config.ts`, `playwright.config.ts` y `src/manifest.ts`, e indicando en cada afirmación el fichero y la línea que la sostienen.

> **Método y alcance.** Este manual es de **solo lectura** sobre el código: no se ha ejecutado ningún build, test ni `npm install`. Las cifras y comandos que aparecen aquí o bien están **transcritos literalmente** de un fichero del repositorio (con `ruta:línea`), o bien están marcados como **pendiente de confirmar**. Los conteos de pruebas y coberturas que se citan son **cifras declaradas por la documentación del proyecto**, no medidas en esta sesión (el detalle está en el manual `03-pruebas.md`).

## Requisitos previos

### Sistema operativo y máquina de referencia

#### Entorno verificado

`RepoTecnico/entornos_globales.md:17` declara el sistema operativo de referencia: **Windows (PowerShell / `pwsh`)**. La misma línea precisa que «los comandos se documentan para PowerShell y también en bash cuando aplica», y `RepoTecnico/entornos_globales.md:18` fija el directorio del proyecto en `C:\Users\lucci\MasterCodeCripto\GitLab\chrome-wallet`.

El proyecto **no es multiplataforma verificado**: la verificación en Linux está pendiente por falta de medio, no por decisión de diseño. `RepoTecnico/entornos_globales.md:112` indica que la verificación en Linux se hace en **WSL2** (`wsl -d Ubuntu -- bash -lc "npm ci && npm run build && npm test"`) o, en su defecto, en un workflow de CI `ubuntu-latest` con los mismos tres pasos; **sin ese medio, RNF-15 se marca como «verificado solo en Windows; pendiente en Linux»**.

#### Trazas de plataforma en el propio repositorio

Hay dos dependencias de Windows que conviene conocer antes de intentar un despliegue en otra plataforma: (a) `scripts/generate-icons.ps1` (cabecera, líneas 9-13) requiere **.NET `System.Drawing`** —«disponible en Windows PowerShell 5.1»— y `RepoTecnico/entornos_globales.md:411` cierra la cuestión: si el proyecto se compila en Linux, **la generación de iconos se hace una sola vez y los PNG resultantes se versionan** en `public/icons/`; y (b) el arnés E2E usa `tasklist` (línea 569) y `taskkill` (línea 588) para detener Anvil y `where` (línea 595) para localizar el binario en `e2e/fixtures/extension.ts` — material de pruebas, no del producto.

### Node.js y npm

#### Versiones declaradas

| Elemento | Valor detectado | Fuente |
|---|---|---|
| Node.js | `v24.16.0` | `RepoTecnico/entornos_globales.md:19` |
| npm | `11.13.0` | `RepoTecnico/entornos_globales.md:20` |

`README.md:27` declara el **mínimo** con el que se ha probado: **Node.js ≥ 20 (probado con v24)** y la comprobación `node -v`; `README.md:28` declara **npm ≥ 10 (viene con Node)** con la comprobación `npm -v`. `RepoTecnico/entornos_globales.md:19` añade el motivo de que esa versión importa: es **compatible con Vite 7**.

#### Gestor de paquetes e instalación reproducible

`package.json:4` declara `"type": "module"` (paquete ESM), lo que condiciona el tooling: los ficheros de configuración y los scripts de `scripts/` se escriben como módulos ES (por ejemplo `scripts/lint-prohibited.mjs:23` importa con `import { ... } from 'node:fs'`).

La instalación reproducible es **`npm ci`** desde `package-lock.json` versionado (`RepoTecnico/entornos_globales.md:98`). El **literal único de build limpio** en todo el corpus es **`npm ci && npm run build`** y `npm install` **no** es el literal de build limpio (`RepoTecnico/entornos_globales.md:110`, decisión ACU-26 / D-C). `README.md:45` lo matiza: si se prefiere `npm install`, «el resultado es equivalente, pero la puerta de calidad usa `npm ci`».

### Foundry (`anvil`, `forge`, `cast`)

#### Versión instalada y rango soportado

`RepoTecnico/entornos_globales.md:21` registra Foundry **1.7.2-dev** con los binarios en `C:\Users\lucci\.cargo\bin\`. La política de versiones está en `RepoTecnico/entornos_globales.md:370`: **`>=1.0.0 <2.0.0`**, con la advertencia de que la detectada es una build de desarrollo (*-dev*) y que otro equipo puede comportarse distinto.

`README.md:29` declara el requisito mínimo y la comprobación (`anvil --version`), y `README.md:33` documenta la instalación: `curl -L https://foundry.paradigm.xyz | bash` y después `foundryup`, con el aviso de que en Windows `%USERPROFILE%\.cargo\bin` debe estar en el `PATH`.

#### Verificación previa a los E2E

`RepoTecnico/entornos_globales.md:152-160` exige comprobar **antes de `npm run test:e2e`** que la versión de Foundry está en rango y que Anvil responde:

```powershell
anvil --version                                           # debe estar en el rango soportado (ver §8)
cast chain-id --rpc-url http://127.0.0.1:8545             # debe devolver 31337
cast block-number --rpc-url http://127.0.0.1:8545         # Anvil responde: devuelve la altura actual
```

Y cierra: «Si Anvil no responde o la versión está fuera de rango, la suite E2E **no se ejecuta** y se marca como **no verificada** (nunca como satisfactoria)».

### Navegador Chrome o Edge ≥ 114

#### Requisito

`src/manifest.ts:45` declara `minimum_chrome_version: '114'` dentro del manifest MV3. Es la fuente de verdad del requisito: el paquete **no carga** en navegadores anteriores.

`README.md:30` lo refleja como fila de la tabla de requisitos («Chrome o Edge **≥ 114**» con comprobación `chrome://version`) y `INSTRUCCIONES.md:38` lo repite («Chrome o Edge **≥ 114** | Cargar la extensión (`chrome://extensions`)»).

#### Nota sobre el binario del navegador

`RepoTecnico/entornos_globales.md:26` deja constancia de que en la máquina verificada **no se detectó `chrome` en el `PATH`** y que la instalación es estándar: la extensión se carga **manualmente** desde `chrome://extensions`. Para la suite E2E no se usa ese navegador, sino el **canal `chromium` de Playwright** (`playwright.config.ts:76`).

### Herramientas opcionales y fuera de alcance

#### Git, CLIs de forja y GCP

`RepoTecnico/entornos_globales.md:22` indica que Git está inicializado con las ramas `main` y `chrome-wallet-DSH` (esta última es la rama de trabajo activa). `RepoTecnico/entornos_globales.md:24` registra que **`gh` y `glab` no están instalados** y que no hay `GITHUB_TOKEN`/`GITLAB_TOKEN`, de modo que la creación de repositorios remotos se hace por la web o aportando un token; `README.md:31` marca Git como **opcional**. `RepoTecnico/entornos_globales.md:27` zanja el punto de GCP: **no aplica** (decisión P-08, alcance 100 % local) y `:230` añade que no se requieren `GCP_PROJECT_ID` ni credenciales. El despliegue real de este producto **es copiar `dist/` a una carpeta y cargarla en el navegador**; no hay backend ni publicación remota.

## Catálogo completo de scripts npm

### Tabla de los scripts declarados

`package.json:7-18` declara **exactamente diez** scripts. Esta tabla los transcribe y resume qué hace cada uno, con la fuente que lo define:

| Script | Literal declarado (`package.json`) | Qué hace |
|---|---|---|
| `dev` | `vite` (línea 8) | Servidor de desarrollo de Vite sobre la **raíz del repositorio**: sirve `test.html` (dApp de pruebas) en `http://localhost:5174/test.html` y es el que arranca Playwright por sí solo. |
| `build` | `tsc -b && vite build` (línea 9) | Tipado por proyectos y **cadena de tres builds** de Vite; produce las **6 entradas** y `dist/manifest.json`. |
| `test` | `vitest run` (línea 10) | Suite **Vitest** completa, una sola pasada, sin vigilancia. |
| `test:watch` | `vitest` (línea 11) | Vitest en **modo vigilancia** para desarrollo. |
| `coverage` | `vitest run --coverage` (línea 12) | Vitest con `@vitest/coverage-v8`; **falla** si no se cumplen los umbrales de ramas de RNF-17. |
| `test:e2e` | `playwright test` (línea 13) | Suite **Playwright**: Chromium persistente con la extensión cargada desde `dist/`. |
| `lint:prohibited` | `node scripts/lint-prohibited.mjs` (línea 14) | Guardas del corpus sobre `src/` y `dist/`: dependencias prohibidas, `fetch` propio, `chrome.storage.sync`, prefijo `codecrypto_`, colores fuera de `tokens.css`, `ethers` en el popup y recursos remotos. |
| `check:mermaid` | `node scripts/check-mermaid.mjs RepoTecnico` (línea 15) | Valida los bloques ```` ```mermaid ```` de **`RepoTecnico/`**. |
| `typecheck` | `tsc -b` (línea 16) | Comprobación de tipos por proyectos, **sin emitir** (el proyecto de aplicación tiene `noEmit: true`, `tsconfig.json:28`). |
| `forge:test` | `forge test --root contracts --match-contract EIP712VerifierTest` (línea 17) | Suite **Forge** de los 5 casos obligatorios de `CA-RT-11` en `contracts/`. |

### Detalle script por script

#### `npm run dev`

Arranca Vite con la configuración de `vite.config.ts`. Los dos extremos de esa configuración que importan para el uso son:

- `root: rootDir` (`vite.config.ts:238`) — la raíz es la del **repositorio**, no `src/`.
- `server: { host: '127.0.0.1', port: 5174, strictPort: true }` (`vite.config.ts:240`).

`playwright.config.ts:37` usa `command: 'npm run dev'` como `webServer`, así que este script es también la forma **automatizada** de levantar la dApp durante los E2E.

#### `npm run build`

Encadena dos herramientas: primero `tsc -b` (tipado por proyectos, `strict: true` con `tsconfig.json:17` y `noEmit` en `tsconfig.json:28`) y después `vite build`, que aplica la cadena de tres builds descrita en el manual `02-build-y-manifest.md`. `RepoTecnico/entornos_globales.md:100` resume el efecto observable: «genera `dist/` (6 entradas + 3 páginas HTML) + `dist/manifest.json`».

La evidencia medida de ese comando está archivada en `RepoTecnico/evidencia/H6/build-windows-2026-09-12.log` (termina con `✓ built in 7.93s` y `[manifest] dist/manifest.json generado (version 1.0.0).`) y su cronometraje en `RepoTecnico/evidencia/H6/instalacion-2026-09-12.md:26`: **22 s**.

#### `test`, `test:watch`, `coverage` y `test:e2e`

`test` y `test:watch` ejecutan Vitest con el bloque `test` exportado en `vite.config.ts:215-233`; `vitest.config.ts` (18 líneas) **no duplica valores** (importa `testConfig` en `vitest.config.ts:13` y lo aplica con el plugin de React en `:16-17`, porque «cuando existe `vitest.config.ts`, Vitest no lee `vite.config.ts`» (`:8-9`). `coverage` añade la cobertura V8 con **umbrales bloqueantes** —70 % de ramas global y 80 % en `src/background/crypto/**`, `src/background/approvals/**` y `src/shared/validation/**` (`vite.config.ts:226-231`)—, con la garantía de que «**falla** si no se cumplen los umbrales» (`README.md:121`). `test:e2e` ejecuta Playwright con `playwright.config.ts` (79 líneas): su `globalSetup` (`:26`) prepara la corrida y **aborta si Anvil no responde** (`e2e/global-setup.ts:344-346`), y `README.md:123` recuerda no solaparlo con Vitest: «**No ejecutes Vitest y Playwright a la vez** (Vitest escribe temporales en `src/` y el vigilante de Vite reinicia y tumba el servidor de la dApp)». El detalle de las cuatro va en el manual `03-pruebas.md`.

#### `lint:prohibited`, `check:mermaid`, `typecheck` y `forge:test`

- `lint:prohibited` ejecuta `scripts/lint-prohibited.mjs` (214 líneas): recorre `src/` y, si existe, `dist/` (`:182-201`) y termina con `exit 1` si hay algún hallazgo (`:209`). El resultado esperado es **`0 hallazgos`** (`RepoTecnico/entornos_globales.md:105`); la lista exacta de literales prohibidos está en el manual `03-pruebas.md`.
- `check:mermaid` ejecuta `scripts/check-mermaid.mjs` (322 líneas) sobre **`RepoTecnico`** (`package.json:15`), con un MODO A de `mermaid.parse()` real apoyado en `jsdom` (`:294-311`) y un MODO B estructural de respaldo (`:292-298`). Como valida `RepoTecnico/` completo, cualquier bloque Mermaid añadido a `RepoTecnico/Manuales/**` pasa por esa puerta; **este manual no incluye bloques Mermaid** para no introducir riesgo en una puerta ajena a su competencia.
- `typecheck` es el primer tramo de `build` aislado: `tsc -b` con los dos proyectos referenciados (`tsconfig.json:33`). El proyecto de aplicación cubre `src`, `test` y `e2e` (`tsconfig.json:31`) y **no emite**; el de la configuración (`tsconfig.node.json:32-38`) cubre las configs, `src/manifest.ts` y `package.json`, y emite **solo declaraciones** a `./node_modules/.tmp/types` porque un proyecto `composite` no puede desactivar la emisión (`tsconfig.node.json:6-8`). Criterio: «0 errores y 0 avisos de tipos (RNF-13)» (`RepoTecnico/entornos_globales.md:101`).
- `forge:test` ejecuta la suite de contrato restringida por `--match-contract EIP712VerifierTest`; el literal es normativo (`RepoTecnico/entornos_globales.md:364`) y lleva el aviso de que `forge test` **sin `--root contracts`** da un **falso verde** («Nothing to compile», 0 pruebas, exit 0).

### Scripts que NO existen (y una discrepancia declarada)

#### Ausencia de `prebuild`

`scripts/generate-icon-data.mjs:8` afirma en su cabecera: «Uso: `node scripts/generate-icon-data.mjs` (también se ejecuta en `prebuild`)». Sin embargo, **`package.json:7-18` no declara ningún script `prebuild`**, de modo que npm **no** ejecuta ese gancho al lanzar `npm run build`: la regeneración de `src/inject/icon-data.ts` es **manual**, y el propio script indica que el fichero está **versionado** «para que `tsc -b` funcione en un clon limpio sin necesidad de ejecutar este script antes» (`:10-11`). *Discrepancia documental detectada en esta lectura; no rompe el build, pero la cabecera describe un gancho inexistente.*

#### Scripts citados por la documentación que no son npm

`RepoTecnico/entornos_globales.md:409` cita `scripts/generate-icons.ps1` como «script reutilizable» y no aparece en `package.json`; se invoca a mano (`scripts/generate-icons.ps1:5`). `contracts/README.md:127` cita `node contracts/scripts/generar-fixture-wallet.mjs`, que tampoco es un script npm.

## Anvil: la red local de pruebas

### El comando normativo del producto (allowlist de CORS)

#### Literal con allowlist

`RepoTecnico/entornos_globales.md:59-64` documenta la configuración **normativa del producto**, con el marcador `<ID>` que se sustituye por el ID estable de la extensión:

```powershell
# CORS con allowlist: solo el origen de la extensión y la dApp de pruebas (RE-04, H-41)
# NOTA: <ID> es el ID estable de la extensión (se fija con la "key" del manifest); se sustituye al primer build.
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 `
      --allow-origin "chrome-extension://<ID>,http://localhost:5174,http://127.0.0.1:5174"
```

Las dos notas que acompañan al bloque son operativas y hay que respetarlas:

- `--allow-origin` admite **UNA lista separada por comas** y **no puede repetirse** (`RepoTecnico/entornos_globales.md:61-62`: «the argument '--allow-origin <ALLOW_ORIGIN>' cannot be used multiple times»).
- No se expone el RPC local: `RepoTecnico/entornos_globales.md:89` advierte que `--allow-origin "*"` permitiría a cualquier sitio visitado llamar al JSON-RPC local y facilita escenarios de *DNS rebinding* hacia `127.0.0.1`; **nunca** se publica el puerto 8545 fuera de `127.0.0.1` (nada de `--host 0.0.0.0`).

La variante con `--host 0.0.0.0` **no está documentada en ningún fichero del repositorio**; se menciona aquí solo como prohibición expresa.

#### Allowlist con el ID real de la extensión

`RepoTecnico/entornos_globales.md:205` declara la constante `EXTENSION_ID` como «literal congelado al primer build, derivado de la `key` fija del manifest (M1)» y precisa que es el `<ID>`/`<EXTENSION_ID>` que consumen la **allowlist CORS de Anvil** y la suite E2E.

El valor concreto es `oiahebaliobknoeeonhgaacapjcpgblo` (`src/manifest.ts:31`, `README.md:12`). Sustituyendo el marcador, la allowlist normativa queda:

```powershell
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 `
      --allow-origin "chrome-extension://oiahebaliobknoeeonhgaacapjcpgblo,http://localhost:5174,http://127.0.0.1:5174"
```

> **Nota de fidelidad.** El repositorio **no transcribe** la allowlist ya sustituida en ningún fichero leído: `RepoTecnico/entornos_globales.md:59-64` la deja con el marcador `<ID>` y remite a §5 para la sustitución. Por tanto, la línea anterior es la **sustitución aritmética** del marcador por el literal de `src/manifest.ts:31`, no una cita literal.

### El comando verificado del arnés E2E

#### Literal

`RepoTecnico/entornos_globales.md:66-68` fija el comando del arnés, **medido** con Anvil 1.7.2-dev:

```powershell
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"
```

`README.md:82` lo transcribe igual, con el comentario «OBLIGATORIO el comodín de CORS: la extensión tiene origen propio», y `INSTRUCCIONES.md:51` repite el mismo literal precedido de «**NO uses `--silent`**». `RepoTecnico/INFORME_PRUEBAS_FASE4.md:100` lo registra como entorno de la corrida de cierre.

El comodín queda **acotado a la máquina de desarrollo del arnés** y «nunca se documenta ni se usa como configuración del producto» (`RepoTecnico/entornos_globales.md:91`).

### Los dos errores medidos (y por qué importan)

#### `--http.corsdomain` no existe

`RepoTecnico/entornos_globales.md:70-73` documenta el **ERROR 1**: en Anvil 1.7.2-dev esa bandera **no existe**; el proceso muere con `error: unexpected argument '--http.corsdomain' found` y «la suite entera falla después con ERR_CONNECTION_REFUSED / error sending request». La bandera equivalente es `--allow-origin`.

#### `--silent` es frágil con redirección

`RepoTecnico/entornos_globales.md:74-75` documenta el **ERROR 2**: `--silent` **no aparece** en `anvil --help` y, lanzado por el arnés **con redirección de salida**, el proceso «puede morir con exit 1». De ahí la regla: **el comando del arnés no lleva `--silent`**. `README.md:88` lo recalca y `INSTRUCCIONES.md:515` lo incluye en la tabla de problemas frecuentes.

> **Matiz medido y documentado.** `e2e/fixtures/extension.ts:606-612` explica que `--silent` **sí funciona** cuando se lanza con `spawn` + `stdio: 'ignore'`, que es lo que usa ese helper (función `arrancarAnvil`, línea 614, con sus argumentos en la línea 617) para **restaurar** el nodo tras la prueba de RPC caído. La prohibición afecta al **arranque manual con redirección de salida**, no a un `spawn` desacoplado.

### Puerto, red y verificación

#### Puertos y `chainId`

| Elemento | Valor | Fuente |
|---|---|---|
| Puerto del nodo principal | **8545** | `RepoTecnico/entornos_globales.md:63` |
| `chainId` decimal | **31337** | `RepoTecnico/entornos_globales.md:63` |
| `chainId` hexadecimal | **`0x7a69`** | `RepoTecnico/entornos_globales.md:184` (`DEFAULT_CHAIN_ID`) y `e2e/fixtures/extension.ts:496` (`ANVIL_CHAIN_ID_HEX`) |
| Host | `127.0.0.1` | `RepoTecnico/entornos_globales.md:63` |
| Mnemonic por defecto | `test test test test test test test test test test test junk` | `RepoTecnico/entornos_globales.md:56` y `e2e/fixtures/h2.ts:16` |
| Saldo por cuenta | 10 000 ETH | `RepoTecnico/entornos_globales.md:56` |
| Dirección de la cuenta 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `INSTRUCCIONES.md:59` y `e2e/fixtures/h2.ts:20` |

`RepoTecnico/entornos_globales.md:185-186` fija además los valores por defecto que el producto usa: `DEFAULT_RPC_URL = http://127.0.0.1:8545` y `DEFAULT_CHAIN_NAME = Anvil Local`.

#### Comandos de verificación y consulta

`RepoTecnico/entornos_globales.md:77-86` documenta el bloque de comprobación:

```powershell
cast block-number --rpc-url http://127.0.0.1:8545
cast chain-id     --rpc-url http://127.0.0.1:8545     # -> 31337
cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://127.0.0.1:8545
cast tx <hash> --rpc-url http://127.0.0.1:8545
anvil --version
```

#### Segunda red local (8546 / 31338)

`RepoTecnico/entornos_globales.md:93` fija la decisión **P-02**: Anvil es la **única** red y **no** se incluye Sepolia; el cambio de red (RF-22/RF-23) se prueba **añadiendo una segunda red local** con `wallet_addEthereumChain`, por ejemplo `anvil --port 8546 --chain-id 31338`.

`e2e/global-setup.ts:67-70` la materializa como constante del arnés:

```ts
const ANVIL_SECUNDARIO_RPC_URL = 'http://127.0.0.1:8546';
const ANVIL_SECUNDARIO_CHAIN_ID = '31338';
const COMANDO_ANVIL_SECUNDARIO =
  'anvil --host 127.0.0.1 --port 8546 --chain-id 31338 --allow-origin "*"';
```

Y `INSTRUCCIONES.md:383` la ofrece al usuario para practicar: `anvil --host 127.0.0.1 --port 8546 --chain-id 31338 --allow-origin "*"`.

## Carga de `dist/` en el navegador

### Pasos numerados

#### Secuencia canónica

El bloque más explícito del repositorio es `RepoTecnico/entornos_globales.md:126-132` (§2.3 «Cargar la extensión en el navegador»):

1. Abrir `chrome://extensions/` (o `edge://extensions/`).
2. Activar **Modo de desarrollador**.
3. **Cargar descomprimida** → seleccionar la carpeta `dist/`.
4. Tras cada `npm run build`: pulsar **Recargar** en la tarjeta de la extensión.
5. Consola del Service Worker: tarjeta de la extensión → **Service worker**.

`README.md:69-72` da la misma secuencia con un matiz importante en el paso 3 («selecciona la carpeta **`dist/`** del repositorio (no `src/`, no la raíz)») y añade en el paso 4 la **comprobación de éxito**: debe aparecer **TrueKeate Wallet** con el ID de extensión `oiahebaliobknoeeonhgaacapjcpgblo`, **sin** ningún error en la tarjeta ni en la consola del Service Worker.

`INSTRUCCIONES.md:63-70` (§1.3) repite los cuatro pasos y añade una acción de conveniencia: «Fija la extensión a la barra de herramientas (icono de pieza → chincheta) para tenerla siempre a mano», con la comprobación «una tarjeta «TrueKeate Wallet» con el ID `oiahebaliobknoeeonhgaacapjcpgblo`, **sin** botón «Errores» ni avisos amarillos».

#### Ensayo de instalación cronometrado

`RepoTecnico/evidencia/H6/instalacion-2026-09-12.md` recoge el ensayo de instalación (tarea 6.10): su §2 (líneas 22-30) tabula paso, comando, resultado real y tiempo, el paso 3 consta como «**verificado por automatización equivalente** (ver §5)» y la línea 30 mide el camino crítico de máquina en **55 s** (33 s de `npm ci` + 22 s de `build`). Su línea 32 describe el **contenido de `dist/` al terminar** (16 ficheros) y su línea 5 declara el resultado como **PARCIALMENTE VERIFICADO**: el ensayo lo ejecutó el **autor**, así que «un evaluador **sin conocimiento previo**» queda **NO VERIFICADO** y el tiempo de lectura humana no se midió (no es medible sin un sujeto externo, §5, líneas 69-81).

### El ID esperado y cómo comprobarlo

#### Valor, derivación y comprobación automática

| Dónde se lee | Valor | Fuente |
|---|---|---|
| Tarjeta de `chrome://extensions` | `oiahebaliobknoeeonhgaacapjcpgblo` | `README.md:72`, `INSTRUCCIONES.md:70` |
| Constante del código | `EXTENSION_ID` | `src/manifest.ts:31` |

El ID **no se escribe a mano en las pruebas**: se **deriva** de la `key` del manifest generado. `e2e/fixtures/extension.ts:121-139` implementa con `expectedExtensionId()` el algoritmo exacto que usa Chrome: lee `dist/manifest.json`, decodifica la `key` en base64, calcula su **SHA-256** y mapea los **primeros 16 bytes** a letras `a`-`p` (dos nibbles por byte); si el manifest no declara `key`, lanza un error explícito (`:129-131`). La descripción canónica está en `src/manifest.ts:25-29` («primeros 16 bytes del SHA-256 de la clave DER, con cada nibble mapeado a `a`-`p`»). En la suite, el ID se descubre **desde el Service Worker** con `context.serviceWorkers()` (`e2e/fixtures/extension.ts:152-159`), nunca de una constante escrita a mano (`playwright.config.ts:8-9`).

### Tras cada cambio de código

#### Recarga manual y recarga en la suite

`README.md:74`: «Si el navegador está en el paso de compilación, repite el paso 2 tras cualquier cambio de código: `chrome://extensions` → botón **↻** de la tarjeta». En la suite no hay recarga manual: `e2e/global-setup.ts:176` **reconstruye** `dist/` con `npm run build` (o `npx vite build` si el primero falla, `:182-186`) y la extensión se carga desde la ruta absoluta de `dist/` con `--load-extension` (`e2e/fixtures/extension.ts:66-72`).

## Puertos y arranque de la dApp

### Tabla de puertos

| Puerto | Servicio | Host | Fuente |
|---|---|---|---|
| **5174** | Vite dev y Vite preview (sirve `test.html`) | `127.0.0.1` | `vite.config.ts:240-241` |
| **8545** | Anvil (red principal, `chainId` 31337) | `127.0.0.1` | `RepoTecnico/entornos_globales.md:63` |
| **8546** | Anvil secundario (`chainId` 31338), solo para los flujos de cambio/alta de red | `127.0.0.1` | `e2e/global-setup.ts:67-70` |

No se ha encontrado en los ficheros leídos ningún otro puerto en uso por el producto.

### `npm run dev` y la URL de la dApp

#### Comando y URL

`INSTRUCCIONES.md:53-54` documenta el arranque en dos terminales, con el nodo en la primera y la dApp en la segunda:

```bash
# 2) Nodo local (terminal 1) — NO uses --silent
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"

# 3) dApp de pruebas (terminal 2)
npm run dev
```

La URL resultante es **`http://localhost:5174/test.html`**. El comentario real que lo fija está en `vite.config.ts:236-237`:

```ts
// La raiz es la del repositorio para que `test.html` se sirva en http://localhost:5174/test.html
// (H-33/CA-RT-09) y `public/` se copie a `dist/` sin configuracion extra.
```

`INSTRUCCIONES.md:60` describe la salida esperada: «`npm run dev` imprime `Local: http://localhost:5174/`. La dApp está en **`http://localhost:5174/test.html`**».

### `strictPort` y host `127.0.0.1`

#### Por qué el puerto está fijado

`RepoTecnico/entornos_globales.md:114` explica que la configuración fija el puerto «para que el origen sea estable y coincida con la clave de sesión persistida en `truekeate_connected_sites`». Y `RepoTecnico/entornos_globales.md:124` cierra la consecuencia: «si el puerto está ocupado, el arranque **falla** en lugar de desplazarse a 5173 (lo que rompería RF-17/RF-25/RF-26)». La **clave de sesión por origen** se normaliza «sin barra final y en minúsculas», por ejemplo `http://localhost:5174`.

#### Por qué el host es explícito

El `host: '127.0.0.1'` **no es decorativo**: se añadió como corrección de un defecto medido. `RepoTecnico/plan_desarrollo.md:550` (defecto **D-H4-E9**) documenta el síntoma y la causa: la prueba `18-concurrencia` necesitaba **dos orígenes del mismo servidor** (`localhost` y `127.0.0.1`) pero el servidor escuchaba **solo en IPv6**, porque `vite.config.ts` declaraba `server: { port: 5174, strictPort: true }` **sin `host`** y el defecto de Vite resuelve a `::1` en ese equipo (medido con `netstat` → `::1:5174`). La corrección fijó `host: '127.0.0.1'` en `server` y en `preview` (`vite.config.ts:240-241`).

### El `webServer` de Playwright

#### Declaración

`playwright.config.ts:36-43` declara el servidor de la dApp con `command: 'npm run dev'`, `url: 'http://localhost:5174/test.html'`, `reuseExistingServer: true`, `timeout: 120_000`, `stdout: 'ignore'` y `stderr: 'pipe'`.

#### Por qué es obligatorio declararlo

El comentario de `playwright.config.ts:31-34` explica que los E2E que abren la dApp fallaban con `net::ERR_CONNECTION_REFUSED` «en cuanto el servidor no estaba levantado, que es un fallo del arnés y no del producto». La lección vinculante quedó registrada en `RepoTecnico/plan_desarrollo.md:402` (defecto **D-H3-D**), con el antes y el después medidos: **26 passed / 11 failed → 37 passed / 0 failed**, y la conclusión de que «la suite **no** debe depender de que alguien arranque la dApp a mano». Consecuencia operativa: al ejecutar `npm run test:e2e` **no hay que arrancar `npm run dev` a mano**.

## Variables de entorno

### Variables de tooling (`.env.local`, no versionado)

#### Tabla declarada

`RepoTecnico/entornos_globales.md:221-228` declara las variables de entorno para el tooling, **todas con estado «Pendiente de crear»**:

| Variable | Uso | Estado declarado |
|---|---|---|
| `ANVIL_RPC_URL` | RPC para los tests de integración | Pendiente de crear |
| `ANVIL_MNEMONIC` | Frase para los tests | Pendiente de crear |
| `ANVIL_CHAIN_ID` | `31337` | Pendiente de crear |
| `E2E_HEADLESS` | `true/false` para Playwright | Pendiente de crear |

`RepoTecnico/entornos_globales.md:180` aclara que **no se usa `.env` en tiempo de ejecución**: «la extensión no tiene backend», y la configuración vive en `chrome.storage.local` bajo `truekeate_settings` y en constantes de build.

### Variables que sí consume el arnés hoy

#### `E2E_HEADLESS` y los plazos inyectados

`playwright.config.ts:22` lee `const HEADLESS = process.env.E2E_HEADLESS !== 'false';`: **cualquier valor distinto de `false` (o su ausencia) es headless** (`:11` lo documenta como la vía para depurar). La misma semántica está en `e2e/fixtures/extension.ts:56` y se aplica en `lanzarContextoPersistente` (`:94`). Además, `e2e/global-setup.ts:45-48` inyecta **solo para la suite** `VITE_SIGN_TIMEOUT_MS=3000` y `VITE_CONNECT_TIMEOUT_MS=2000`, mientras que `:51-55` declara los valores de **producción** que deben seguir siendo el valor por defecto de `src/shared/constants.ts` (`120_000`, `60_000` y `30_000` ms); la verificación es **bloqueante** (`:157-160`) y el motivo está en la cabecera (`:6-11`): «para que el vencimiento se observe en ~3 s».

#### Variables de control del arnés

| Variable | Efecto | Fuente |
|---|---|---|
| `TK_EVIDENCE_PHASE` | Cambia la carpeta de evidencia (por defecto `H1`) | `playwright.config.ts:17`, `e2e/global-setup.ts:40`, `e2e/fixtures/extension.ts:46` |
| `TK_E2E_SKIP_BUILD=1` | Omite la reconstrucción de `dist/` (iteración local) | `e2e/global-setup.ts:22` y `:171-173` |
| `TK_DIST_DIR` | Sustituye `dist/` (depurar el propio arnés) | `e2e/fixtures/extension.ts:22` y `:43` |
| `TK_DAPP_URL` | Cambia la URL de la dApp de pruebas | `e2e/fixtures/extension.ts:22` y `:53` |
| `CI` | Activa `forbidOnly` | `playwright.config.ts:48` |
| `TK_MERMAID_STRUCTURAL=1` | Fuerza el MODO B del validador Mermaid | `scripts/check-mermaid.mjs:233` |

## Solución de problemas

### Lo que el repositorio documenta

#### Tabla de problemas frecuentes

`INSTRUCCIONES.md:510-526` (§19) es la tabla de troubleshooting del producto. Los síntomas de **entorno** (los que competen a este manual) son:

| Síntoma | Causa y solución documentada | Línea |
|---|---|---|
| La tarjeta de `chrome://extensions` muestra «Errores» | Algún fichero de `dist/` está incompleto: recompila (`npm run build`) y pulsa **↻**. | `INSTRUCCIONES.md:514` |
| El popup abre y no muestra saldos; aparece «desconectado» | Anvil no está en marcha: arráncalo con `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"`. **No uses `--silent`**. | `INSTRUCCIONES.md:515` |
| Toda la suite E2E falla con `ERR_CONNECTION_REFUSED` | Es lo mismo: mira primero si Anvil responde (`cast chain-id --rpc-url http://127.0.0.1:8545` ⇒ `31337`). | `INSTRUCCIONES.md:516` |
| `http://localhost:5174/test.html` no responde | El servidor se arranca con `npm run dev` (puerto 5174). Si lanzaste Vitest a la vez, reinícialo: el vigilante de Vite se reinicia al escribir en `src/`. | `INSTRUCCIONES.md:517` |

`README.md:78` añade un comportamiento contraintuitivo pero esperado: «La extensión **ya funciona sin Anvil**» — se puede crear o importar una cartera y verás «desconectado» / «sin red» sin errores; el nodo solo hace falta para saldos, envíos, firmas y cambio de red.

#### Puerto ocupado

El repositorio **no documenta un mensaje de error concreto** para el caso «puerto 5174 ocupado», pero la consecuencia está derivada de la configuración: con `strictPort: true` (`vite.config.ts:240-241`), Vite **falla** en lugar de desplazarse (`RepoTecnico/entornos_globales.md:124`). La solución implícita es liberar el puerto; *el texto exacto del error queda pendiente de confirmar* (no está archivado en ninguna evidencia leída).

### WSL2 no disponible: RNF-15 pendiente

#### El hecho medido

`RepoTecnico/evidencia/H6/wsl2-no-disponible-2026-09-12.log` archiva la salida de `wsl -l -v` (fichero en UTF-16): «Subsistema de Windows para Linux no tiene distribuciones instaladas», con `exit code de wsl -l -v: -1`.

`RepoTecnico/estado_proyecto.md:201` lo registra en la tabla de resultados de H6 como **«NO EJECUTABLE»** y concluye: «**RNF-15 verificado solo en Windows; pendiente en Linux** (`D-H6-D`)». `RepoTecnico/INFORME_PRUEBAS_FASE4.md:572` mantiene la salvedad abierta al cierre de la Fase 4.

#### Qué haría falta para cerrarlo

`RepoTecnico/entornos_globales.md:112` da las dos vías: WSL2 con `wsl -d Ubuntu -- bash -lc "npm ci && npm run build && npm test"`, o un workflow de CI `ubuntu-latest` con los mismos tres pasos. Mientras no exista ninguno de los dos, **no se declara cumplido**.

### No escribir ficheros durante la suite E2E

#### La regla operativa

`RepoTecnico/INFORME_PRUEBAS_FASE4.md:630-633` documenta un fallo medido y la regla que se deriva:

- **Síntoma:** 37 fallos `net::ERR_CONNECTION_REFUSED at http://localhost:5174/test.html` cuando el `webServer` de la dApp **muere a mitad de la suite** por escribir ficheros en el árbol vigilado durante la ejecución.
- **Error exacto:** `Error: EBUSY: resource busy or locked, watch '…\RepoTecnico\.estado_proyecto.md.<pid>.<uuid>.tmpdir\estado_proyecto.md.tmp'`.
- **Regla:** «**no se escribe ningún fichero del repositorio mientras la suite E2E corre** (ni editores automáticos, ni `git`, ni otra herramienta). Con el árbol quieto, la suite cierra en **84 passed / 0 failed**».

#### Por qué importa para el despliegue

Es un límite del **arnés**, no del producto: los mismos 33 specs pasan cuando nadie escribe. Quien automatice la puerta de calidad debe **serializar** los comandos pesados (Vitest, Playwright, `build`) y no tocar el árbol durante la corrida. La misma regla está recogida como «Una suite pesada a la vez» en `RepoTecnico/INFORME_PRUEBAS_FASE4.md:114-116`.

### Lo NO documentado (declaración honesta)

#### Casos sin texto en el repositorio

- **RPC caído durante el desarrollo manual:** el repositorio sí documenta el comportamiento del producto (`INSTRUCCIONES.md:293`: estado «desconectado», error `4900` y reintentos acotados) y su E2E (`e2e/27-rpc-caido.spec.ts`), pero **no** un procedimiento manual de recuperación del nodo: se reduce a volver a arrancar Anvil con el comando de la sección de Anvil de este manual.
- **Conflictos de versión de Node:** no se ha encontrado ninguna matriz de versiones soportadas más allá de «≥ 20» (`README.md:27`) y el valor verificado «v24.16.0» (`RepoTecnico/entornos_globales.md:19`).
- **Mensajes de error de Vite con el puerto ocupado y de Chrome al recargar la extensión:** no archivados; *pendiente de confirmar*.

#### Lo que este manual NO afirma

No se afirma que la instalación se haya completado en **≤ 15 min** por un sujeto externo: ese ensayo está **declarado NO VERIFICADO** (`RepoTecnico/evidencia/H6/instalacion-2026-09-12.md:75`). No se afirma que el build funcione en Linux: **pendiente** (RNF-15). Y no se afirma ningún conteo de pruebas medido en esta sesión: las cifras del proyecto son **declaradas** y se citan con su fuente en el manual `03-pruebas.md`.
