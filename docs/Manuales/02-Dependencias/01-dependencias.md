# Manual de dependencias de TrueKeate Wallet

Este manual explica en lenguaje corriente qué piezas de software ajenas usa TrueKeate Wallet, para qué sirve cada una y cuáles son de verdad obligatorias.

Una **dependencia** es un programa ya hecho por otras personas que el proyecto reutiliza en lugar de escribirlo desde cero. Se descargan con npm (el gestor de paquetes que viene con Node.js) y quedan guardadas en la carpeta `node_modules/`.

## Empezar en 5 minutos

### Qué necesitas

- Node.js 20 o superior. El proyecto se ha probado con la versión **v24.16.0**.
- npm 10 o superior. El proyecto se ha probado con la versión **11.13.0**; viene incluido con Node.
- Foundry (`anvil`, `forge`, `cast`), que **no** es una dependencia de npm y se instala aparte. Versión admitida: desde `1.0.0` hasta menos de `2.0.0`. Probado con `1.7.2-dev`.
- El fichero `package-lock.json`, que ya viene en el repositorio. Es la lista exacta de versiones que hay que instalar.

### Qué vas a conseguir

- Saber cuántas dependencias tiene el proyecto, cómo se llaman y para qué se usa cada una.
- Distinguir las **tres** que viajan dentro de la extensión que se instala en el navegador de las **dieciocho** que solo sirven para construir y probar.
- Instalar exactamente las mismas versiones que el resto del equipo con un solo comando.

### Los pasos mínimos

1. Comprueba las versiones que tienes:

```powershell
node -v
npm -v
```

2. Instala las dependencias de forma reproducible (usa el fichero de bloqueo, no la versión más nueva de cada paquete):

```powershell
npm ci
```

3. Comprueba que compila y que los tipos están bien:

```powershell
npm run build
```

4. Comprueba que no queda ninguna dependencia prohibida dentro del paquete:

```powershell
npm run lint:prohibited
```

5. Si vas a usar la red local de pruebas, instala Foundry aparte y verifica que responde:

```powershell
foundryup
anvil --version
```

## Inventario general

### Fuente de verdad y separación de ámbitos

El único fichero que declara dependencias es `package.json`, y las separa en dos bloques con propósitos muy distintos:

- **`dependencies`**: 3 paquetes. Son los que **sí viajan** dentro de la extensión terminada (`dist/`), es decir, los que acaban en el ordenador de quien la usa.
- **`devDependencies`**: 18 paquetes. Sirven para construir, probar y revisar el código. **No** se empaquetan.

En total son **21 dependencias declaradas**, y las 21 están instaladas en `node_modules/`.

### Cómo se ha verificado el uso real

No basta con mirar el nombre de un paquete para saber si se usa. El manual técnico comprobó cada uno citando al menos una línea donde se importa, se configura o se lanza desde un guion de npm.

Dos excepciones merecen explicación, porque **sí se usan aunque no se vean**:

- Los paquetes de tipos (`@types/*`) se consumen de forma indirecta: el compilador los busca solo, porque están declarados en los `tsconfig`.
- El medidor de cobertura (`@vitest/coverage-v8`) se usa cuando se pide `coverage.provider: 'v8'`, sin importarlo por su nombre.

## Dependencias de ejecución (`dependencies`)

### `ethers`

#### Ficha y uso

- Declarada `~6.15.0`, instalada **6.15.0**, ámbito de ejecución, licencia MIT.
- Es, por diseño, la **única** librería criptográfica del producto. Todo lo delicado pasa por ella:
  - **Hablar con el nodo** (RPC): `src/background/rpc/client.ts`.
  - **Derivar cuentas desde la frase** y manejar claves: `src/background/crypto/hd.ts`, `mnemonic.ts`, `importAccount.ts` e `integrity.ts`.
  - **Firmar** transacciones y mensajes: `src/background/crypto/sign.ts`.
  - **Leer y preparar los datos** que se muestran antes de aprobar: `src/background/approvals/calldata.ts` y `preview.ts`.
  - **Seguridad**: huellas y ocultación de datos sensibles en `src/background/security/hash.ts` y `redaction.ts`.
  - **Pruebas** que comparan las firmas propias con las de `ethers`.

### `react`

#### Ficha y uso

- Declarada `^19.0.0`, instalada **19.3.0**, ámbito de ejecución, licencia MIT.
- Construye las **tres ventanas** de la extensión (popup, conexión y decisión) y la dApp de pruebas. En la capa de interfaz no hay criptografía.
- Puntos de entrada: `src/popup/main.tsx`, `src/connect/main.tsx` y `src/notification/main.tsx`.

### `react-dom`

#### Ficha y uso

- Declarada `^19.0.0`, instalada **19.3.0**, ámbito de ejecución, licencia MIT.
- Es lo que coloca de verdad la interfaz dentro de la página. Siempre se usa por el subcamino `react-dom/client`: `createRoot` en los tres puntos de entrada.
- También se usa en una prueba que monta una interfaz real para comprobar el sondeo de saldos.

## Dependencias de desarrollo (`devDependencies`)

### Empaquetado y compilación

#### `vite`

- Declarada `^7.0.0`, instalada **7.3.6**, licencia MIT.
- Es el **empaquetador** (la herramienta que junta todo el código en ficheros que el navegador entiende). Ejecuta tres construcciones distintas: la principal y dos para `content-script.js` e `inject.js`.
- Su servidor de desarrollo sirve la dApp de pruebas en el puerto **5174**.

#### `@vitejs/plugin-react`

- Declarada `^5.0.0`, instalada **5.2.0**, licencia MIT.
- Traduce el formato de React (JSX) y permite recargar en caliente al editar. Se declara dos veces, en `vite.config.ts` y en `vitest.config.ts`, porque Vitest no lee la primera cuando existe la segunda.

#### `typescript`

- Declarada `~5.9.0`, instalada **5.9.3**, licencia Apache-2.0.
- Es el compilador y el revisor de tipos. El comando `npm run build` lo ejecuta antes de Vite, y `npm run typecheck` lo ejecuta solo.

### Pruebas unitarias y de integración

#### `vitest`

- Declarada `^3.0.0`, instalada **3.2.7**, licencia MIT.
- Es el ejecutor de las pruebas unitarias. Se lanza con `npm run test`, `npm run test:watch` y `npm run coverage`.

#### `@vitest/coverage-v8`

- Declarada `^3.0.0`, instalada **3.2.7**, licencia MIT.
- Mide cuánto código queda cubierto por las pruebas. No se importa por su nombre: se activa pidiendo el proveedor `v8`. Sobre él se declaran los umbrales mínimos de cobertura.

#### `jsdom`

- Declarada `^26.0.0`, instalada **26.1.0**, licencia MIT.
- Simula un navegador dentro de las pruebas, para que existan `document` y `window`. También se usa para poder validar los diagramas de la documentación.

### Pruebas de extremo a extremo (E2E)

#### `@playwright/test`

- Declarada `^1.50.0`, instalada **1.63.0**, licencia Apache-2.0.
- Es el arnés de **pruebas de extremo a extremo** (E2E: pruebas que abren un navegador de verdad y usan la extensión como lo haría una persona). Usa Chromium con la extensión cargada, un solo trabajador a la vez y un perfil nuevo por prueba.

#### `@axe-core/playwright`

- Declarada `^4.13.0`, instalada **4.13.0**, licencia **MPL-2.0**.
- Se usa solo para la suite de **accesibilidad**: revisa las cuatro superficies (popup, conexión, decisión y dApp) y exige cero violaciones. Es la única dependencia del proyecto con licencia MPL-2.0.

### Calidad de código (ESLint 9, configuración plana)

#### `eslint`

- Declarada `^9.0.0`, instalada **9.39.5**, licencia MIT.
- Es el **linter** (la herramienta que señala malas prácticas y errores de estilo). Usa la configuración nueva, de un solo fichero.

#### `@eslint/js`

- Declarada `^9.0.0`, instalada **9.39.5**, licencia MIT.
- Aporta las reglas recomendadas básicas de JavaScript.

#### `typescript-eslint`

- Declarada `^8.0.0`, instalada **8.70.0**, licencia MIT.
- Aporta las reglas recomendadas para TypeScript y el ayudante que une todo en la configuración.

#### `eslint-plugin-react-hooks`

- Declarada `^7.1.1`, instalada **7.1.1**, licencia MIT.
- Vigila las dos reglas de React del proyecto: que los *hooks* se usen en el orden correcto (error) y que las dependencias de los efectos estén completas (aviso).

#### `globals`

- Declarada `^17.0.0`, instalada **17.12.0**, licencia MIT.
- Es el catálogo de variables globales de cada entorno, para que el linter no se queje de `window`, `document` o `chrome`.

### Documentación y diagramas

#### `mermaid`

- Declarada `^11.0.0`, instalada **11.17.2**, licencia MIT.
- **No** interviene en la interfaz. Es el validador de los diagramas de la documentación: `npm run check:mermaid` los revisa uno a uno.

### Paquetes de tipos (`@types/*`)

#### `@types/chrome`

- Declarada `^0.1.0`, instalada **0.1.43**, licencia MIT.
- Describe la API de extensiones de Chrome (`chrome.storage`, `chrome.alarms`, `chrome.windows`…). En las pruebas se sustituye por un doble en memoria, porque el entorno simulado no trae `chrome`.

#### `@types/node`

- Declarada `^24.0.0`, instalada **24.13.4**, licencia MIT.
- Describe las utilidades de Node que usan las herramientas y los guiones (leer ficheros, rutas, salir con un código de error).

#### `@types/react`

- Declarada `^19.0.0`, instalada **19.3.0**, licencia MIT.
- Describe la superficie de React 19 y el tipo `JSX`.

#### `@types/react-dom`

- Declarada `^19.0.0`, instalada **19.3.0**, licencia MIT.
- Describe el montador `react-dom/client`.

## Dependencias declaradas sin uso verificado

### Resultado de la comprobación

Tras buscar los 21 paquetes por todo el repositorio (código, pruebas, guiones y ficheros de configuración), **no se encontró ninguna dependencia declarada sin uso**. No hay candidatas a retirada.

### Matices que conviene registrar

No son dependencias muertas, pero su uso no aparece como un `import` con su nombre:

- `@vitest/coverage-v8`: se activa con `coverage.provider: 'v8'`. Confirmado.
- `@types/chrome`, `@types/node`, `@types/react` y `@types/react-dom`: se activan desde el campo `types` de los `tsconfig`. Confirmado.
- `react-dom`: siempre se importa como `react-dom/client`. Buscar el texto exacto `from 'react-dom'` no devuelve nada y **no** significa que no se use. Confirmado.
- `eslint`: no se importa desde el código; es el programa que lee `eslint.config.js`. Confirmado.

### Límites de esta comprobación

El manual técnico no ejecutó `npm ls`, `npm ci` ni ninguna construcción o prueba. Por eso la frase «todas las dependencias se usan» se limita a las pruebas citadas. Las dependencias **transitivas** (las que traen consigo otras dependencias, sin estar declaradas en `package.json`) quedan fuera del alcance: **pendiente de confirmar**.

## Herramientas externas al gestor de paquetes

### Foundry (`forge`, `anvil`, `cast`)

#### Naturaleza y ámbito

Foundry **no** es una dependencia de npm: no aparece en `package.json` y se instala aparte. Cumple dos papeles:

- **`anvil`**: el nodo local de pruebas. La cartera es totalmente local y trabaja contra `127.0.0.1:8545`.
- **`forge`**: compila y ejecuta el contrato auxiliar de `contracts/`. Ese contrato es un **instrumento de prueba**, no parte del producto.

#### Versión requerida y detectada

- Versión detectada: **1.7.2-dev**, con los programas en `C:\Users\lucci\.cargo\bin\`.
- Rango admitido: **`>=1.0.0 <2.0.0`**. La versión detectada es una compilación de desarrollo (`-dev`), así que otro equipo puede comportarse de forma algo distinta.
- El compilador de Solidity (`solc`) está **fijado** en `0.8.24` en `contracts/foundry.toml`, no como rango, para que el resultado sea siempre el mismo.

#### Comando normativo del proyecto

```powershell
forge test --root contracts --match-contract EIP712VerifierTest
```

El texto `--root contracts` **no es opcional**. Sin él, `forge test` responde «Nothing to compile», ejecuta 0 pruebas y termina con código 0: un falso verde.

### Node.js y npm

#### Requisito de versión

- Node.js **≥ 20** (probado con **v24.16.0**), compatible con Vite 7.
- npm **≥ 10** (probado con **11.13.0**).
- Chrome o Edge **≥ 114** para cargar la extensión MV3.

#### Instalación y reproducibilidad

El texto único de «construcción limpia» del proyecto es:

```powershell
npm ci && npm run build
```

Se usa `npm ci` y **no** `npm install` porque `package-lock.json` está guardado en el repositorio y `npm ci` instala exactamente lo que ese fichero fija. Con `npm install`, el resultado suele ser equivalente, pero las versiones pueden moverse.

#### Relación con el navegador objetivo

El código se compila apuntando a `chrome114`, la misma versión mínima que exige el manifiesto de la extensión.

## Tabla resumen de dependencias

| Paquete | Declarada | Instalada | Ámbito | Para qué se usa | Licencia |
|---|---|---|---|---|---|
| `ethers` | `~6.15.0` | 6.15.0 | ejecución | Única librería criptográfica: nodo, derivación y firma | MIT |
| `react` | `^19.0.0` | 19.3.0 | ejecución | Interfaz de las tres ventanas y la dApp | MIT |
| `react-dom` | `^19.0.0` | 19.3.0 | ejecución | Montaje en la página, vía `react-dom/client` | MIT |
| `@axe-core/playwright` | `^4.13.0` | 4.13.0 | desarrollo | Pruebas de accesibilidad | MPL-2.0 |
| `@eslint/js` | `^9.0.0` | 9.39.5 | desarrollo | Reglas básicas del linter | MIT |
| `@playwright/test` | `^1.50.0` | 1.63.0 | desarrollo | Pruebas de extremo a extremo en Chromium | Apache-2.0 |
| `@types/chrome` | `^0.1.0` | 0.1.43 | desarrollo | Tipos de la API de extensiones | MIT |
| `@types/node` | `^24.0.0` | 24.13.4 | desarrollo | Tipos de Node para las herramientas | MIT |
| `@types/react` | `^19.0.0` | 19.3.0 | desarrollo | Tipos de React | MIT |
| `@types/react-dom` | `^19.0.0` | 19.3.0 | desarrollo | Tipos de `react-dom/client` | MIT |
| `@vitejs/plugin-react` | `^5.0.0` | 5.2.0 | desarrollo | Traducción de React en Vite y Vitest | MIT |
| `@vitest/coverage-v8` | `^3.0.0` | 3.2.7 | desarrollo | Medición de cobertura | MIT |
| `eslint` | `^9.0.0` | 9.39.5 | desarrollo | Revisión de estilo y errores | MIT |
| `eslint-plugin-react-hooks` | `^7.1.1` | 7.1.1 | desarrollo | Reglas de los *hooks* de React | MIT |
| `globals` | `^17.0.0` | 17.12.0 | desarrollo | Variables globales por entorno | MIT |
| `jsdom` | `^26.0.0` | 26.1.0 | desarrollo | Navegador simulado en las pruebas | MIT |
| `mermaid` | `^11.0.0` | 11.17.2 | desarrollo | Validación de los diagramas del manual | MIT |
| `typescript` | `~5.9.0` | 5.9.3 | desarrollo | Compilación y revisión de tipos | Apache-2.0 |
| `typescript-eslint` | `^8.0.0` | 8.70.0 | desarrollo | Reglas de TypeScript | MIT |
| `vite` | `^7.0.0` | 7.3.6 | desarrollo | Empaquetado y servidor del puerto 5174 | MIT |
| `vitest` | `^3.0.0` | 3.2.7 | desarrollo | Pruebas unitarias y de integración | MIT |

### Herramientas externas (no son dependencias npm)

| Herramienta | Versión requerida | Para qué se usa |
|---|---|---|
| Foundry (`forge`, `anvil`, `cast`) | `>= 1.0.0 < 2.0.0` (probado con 1.7.2-dev) | Nodo local y contrato verificador EIP-712 |
| `solc` | `0.8.24` (fijado) | Compilar el contrato de `contracts/` |
| Node.js | **≥ 20** (probado con v24.16.0) | Construir y ejecutar las herramientas |
| npm | **≥ 10** (probado con 11.13.0) | Instalación reproducible con `npm ci` |
| Chrome / Edge | **≥ 114** | Cargar la extensión MV3 |

### Cierre

Las 21 dependencias declaradas están instaladas y tienen un uso localizable. Solo las tres de ejecución (`ethers`, `react` y `react-dom`) viajan dentro del paquete que se instala en el navegador; las 18 restantes son herramientas de trabajo y no se empaquetan. Las licencias se detallan en el manual de licencias.

## Problemas frecuentes

### Instalo con `npm install` y me aparecen versiones distintas de las esperadas

**Causa.** `npm install` puede actualizar paquetes dentro del margen permitido por `package.json`. El proyecto fija las versiones exactas en `package-lock.json`.

**Solución.** Usa el comando de instalación reproducible:

```powershell
npm ci
```

### `forge test` dice «Nothing to compile» y termina sin ejecutar pruebas

**Causa.** Falta la opción `--root contracts`. Foundry busca los contratos en la raíz del repositorio, no los encuentra y responde con un falso verde: 0 pruebas y código de salida 0.

**Solución.** Ejecuta el comando tal y como está declarado en el proyecto:

```powershell
npm run forge:test
```

### Busco si `react-dom` se usa y no encuentro ninguna línea con `from 'react-dom'`

**Causa.** El paquete siempre se importa por su subcamino `react-dom/client`, que es la forma correcta en React 19.

**Solución.** No es un error y no hay nada que retirar. Busca `react-dom/client` y verás los tres puntos de entrada y la prueba que monta una interfaz real.

### Creo que `mermaid` se usa en la interfaz de la extensión

**Causa.** El nombre del paquete se parece al de la librería que dibujaría diagramas en pantalla, pero aquí su único destino es revisar los bloques de diagramas de la documentación.

**Solución.** No busques su uso en `src/`: solo aparece cuando se lanza `npm run check:mermaid`.

### `anvil`, `forge` o `cast` no se reconocen como comando

**Causa.** Foundry no es una dependencia de npm; se instala aparte y sus programas viven en `%USERPROFILE%\.cargo\bin`. Si esa carpeta no está en el `PATH`, el sistema no los encuentra.

**Solución.** Instálalo y añade la carpeta al `PATH`:

```powershell
curl -L https://foundry.paradigm.xyz | bash
foundryup
anvil --version
```

### La construcción se queja de la versión de Node

**Causa.** Vite 7 necesita un Node moderno. El proyecto se ha probado con la versión **v24.16.0**, y el mínimo declarado es Node 20.

**Solución.** Comprueba tu versión con `node -v` y actualiza si es anterior a la 20.

### Un paquete que sí se usa parece «no importado» y creo que sobra

**Causa.** Los paquetes de tipos y el medidor de cobertura se usan de forma indirecta: el compilador y el ejecutor de pruebas los buscan solos.

**Solución.** No los quites de `package.json`. Están declarados a propósito en el campo `types` de los `tsconfig` o como proveedor de cobertura.
