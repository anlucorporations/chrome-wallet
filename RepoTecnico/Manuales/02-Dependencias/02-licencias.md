# Manual de licencias de TrueKeate Wallet

Propósito: documentar la licencia del código propio, el aviso de terceros (`NOTICE`), la licencia real de cada dependencia instalada, las licencias de las tipografías auto-hospedadas y de los activos de marca, la licencia del contrato auxiliar de Foundry y las obligaciones de cumplimiento derivadas.

> **Regla de veracidad aplicada.** Cada licencia y cada titular citados proceden de un fichero leído del repositorio. Lo que no ha podido leerse de un fichero se marca como **pendiente de confirmar**. No se ha ejecutado ningún build, test ni `npm install`.

## Licencia del código propio

### Identificación de la licencia

#### Texto, titular y año

El fichero `LICENSE` (49 líneas, leído completo) contiene la **MIT License**:

| Campo | Valor | Fuente |
|---|---|---|
| Licencia | **MIT** | `LICENSE:1` — «MIT License» |
| Titular | **ANLU corporations** | `LICENSE:3` — «Copyright (c) 2026 ANLU corporations»; confirmado en `NOTICE:4` |
| Año del copyright | **2026** | `LICENSE:3` |
| Texto completo | Cláusula de permiso, aviso de copyright y exención de garantías | `LICENSE:5-21` |

`NOTICE:5` confirma la misma lectura: «Licencia del codigo propio: MIT (ver `LICENSE`)».

#### Obligación de la MIT

La MIT es **permisiva** y **no copyleft**. Su única obligación real es de **atribución**: el aviso de copyright y el texto de permiso deben incluirse en todas las copias o partes sustanciales del software (`LICENSE:12-13`). El software se entrega «AS IS», sin garantía (`LICENSE:15-21`).

### Alcance de la licencia

#### Qué cubre

`LICENSE:28-30` declara que cubre «el codigo fuente de TrueKeate Wallet y los ficheros de configuracion, pruebas y documentacion del repositorio», con titularidad de ANLU corporations.

#### Qué queda fuera

`LICENSE:32-42` enumera **tres exclusiones explícitas**, cada una con su régimen propio:

1. **Activos de marca TrueKeate** — carpeta `TrueKeate/` y copias en `public/brand/` y `public/icons/`, «cedidos al proyecto por su titular para este uso (decision DEC-15)» (`LICENSE:34-36`). DEC-15 está registrada en `RepoTecnico/estado_proyecto.md:249` como «Adoptar la marca **TrueKeate** entregada en `TrueKeate/` como identidad visual del producto».
2. **Tipografías auto-hospedadas** de `public/fonts/` — Poppins, Inter y JetBrains Mono, «distribuidas bajo SIL Open Font License 1.1», con los textos `LICENSE-poppins.txt`, `LICENSE-inter.txt` y `LICENSE-jetbrains-mono.txt` acompañando a cada fichero (`LICENSE:37-40`).
3. **Dependencias de terceros** (npm y Foundry), «con sus licencias enumeradas en `NOTICE`» (`LICENSE:41-42`).

#### Aviso de uso

`LICENSE:44-49` añade un aviso que **no es una cláusula de licencia** sino una advertencia de alcance: la cartera es de **desarrollo**, para una red local de pruebas, funciona **sin contraseña** y **no cifra** el almacén local, por lo que «no debe usarse con fondos reales ni con frases semilla que protejan valor real».

## Aviso de terceros (`NOTICE`)

### Naturaleza y estructura

`NOTICE` (126 líneas, leído completo) es el **fichero de atribuciones**. Su cabecera (`NOTICE:1-13`) declara titular, licencia y procedencia: se generó «en el cierre de H6 (Fase 3) a partir de `package.json`, `package-lock.json` y de los ficheros realmente instalados en `node_modules/`» (`NOTICE:6-7`). Se organiza en seis apartados numerados:

| Apartado | Líneas | Contenido |
|---|---|---|
| 1. Dependencias de ejecución | `NOTICE:16-30` | Los 3 paquetes que se empaquetan en `dist/` |
| 2. Herramientas de desarrollo y pruebas | `NOTICE:33-70` | 18 paquetes que **no** se empaquetan |
| 3. Contrato auxiliar de Foundry | `NOTICE:73-84` | Foundry y `forge-std` |
| 4. Tipografías (SIL OFL 1.1) | `NOTICE:87-104` | Poppins, Inter, JetBrains Mono |
| 5. Activos de marca | `NOTICE:107-113` | Fuera de la licencia MIT |
| 6. Software de terceros no distribuido | `NOTICE:116-126` | Chrome/Edge, Anvil, npm |

### Dependencias de ejecución

`NOTICE:19-23` reproduce la tabla de los tres paquetes empaquetados: `ethers` 6.15.0 / MIT / Richard Moore (ricmoo); `react` 19.3.0 / MIT / Meta Platforms, Inc. y colaboradores; `react-dom` 19.3.0 / MIT / los mismos. Las tres versiones coinciden exactamente con las instaladas (`node_modules/ethers/package.json`, `node_modules/react/package.json`, `node_modules/react-dom/package.json`).

`NOTICE:25-30` añade dos notas de diseño con relevancia legal indirecta: `ethers.js v6` es la **única** librería criptográfica del producto (RT-02) y React 19 se usa solo para la interfaz (RNF-14).

### Herramientas de desarrollo y notas de cumplimiento

`NOTICE:36-55` lista los 18 paquetes de desarrollo con versión, licencia y titular. `NOTICE:57-70` añade tres notas con consecuencias jurídicas:

- **`@axe-core/playwright` (MPL-2.0)** — `NOTICE:59-63`: uso exclusivo como dependencia de desarrollo en la suite E2E de accesibilidad (RNF-21), **sin modificar** y **sin distribuirse** en `dist/`. Si se modificara un fichero cubierto, habría que publicar la modificación.
- **`@playwright/test` y `typescript` (Apache-2.0)** — `NOTICE:64-67`: el `NOTICE` incluye el aviso de licencia y remite a `node_modules/<paquete>/LICENSE`, que contiene el texto completo, el `NOTICE` propio del proyecto y la cláusula de patentes.
- **Ninguna dependencia de desarrollo se empaqueta** — `NOTICE:68-70`: `dist/` contiene solo el código propio más `ethers`, `react` y `react-dom`, verificable con `npm run lint:prohibited`.

### Contrato auxiliar de Foundry

`NOTICE:76-79` declara el instrumento de prueba de `contracts/`:

| Componente | Versión | Licencia | Titular / autor |
|---|---|---|---|
| Foundry (`forge`, `anvil`, `cast`) | Declarado `>= 1.0.0 < 2.0.0`; verificado con `1.7.2-dev` | **MIT o Apache-2.0 (doble)** | Foundry contributors |
| `forge-std` (`contracts/lib/forge-std`) | Vendorizado como referencia de pruebas | **MIT o Apache-2.0 (doble)** | Foundry contributors |

`NOTICE:81-84` explica que `contracts/` es un instrumento de prueba (P-07) y que la licencia dual se conserva tal cual, «con los dos textos en `contracts/lib/forge-std/LICENSE-MIT` y `LICENSE-APACHE`». **Verificado**: ambos ficheros existen en disco.

### Tipografías, marca y software no distribuido

`NOTICE:90-104` documenta las tres familias auto-hospedadas en `public/fonts/` — 0 peticiones a CDN, RNF-20 — todas bajo **SIL Open Font License 1.1**, con el texto completo en el `LICENSE-*.txt` correspondiente (detalle en la sección «Tipografías»).

`NOTICE:110-113` insiste en que los activos de la marca TrueKeate (`TrueKeate/`, `public/brand/` y los iconos derivados de `public/icons/`) fueron cedidos al proyecto por su titular para este uso (DEC-15) y **no** se redistribuyen bajo la licencia MIT del código.

`NOTICE:119-126` cierra con lo que **no** se distribuye: Google Chrome / Microsoft Edge (plataforma), Anvil (nodo local que arranca el usuario) y npm (gestor de paquetes). Y con una declaración explícita de integridad: «Ni `ethers`, ni `react`, ni `react-dom`, ni ningun otro paquete de terceros se ha modificado» (`NOTICE:125-126`).

## Licencias de las dependencias

### Método de obtención

Para cada uno de los 21 paquetes se ha leído el campo `license` de `node_modules/<paquete>/package.json`. **En los 21 casos el campo existe**, de modo que no ha sido necesario buscar un fichero `LICENSE*` alternativo y **no queda ningún paquete pendiente de confirmar** por este motivo.

### Dependencias de ejecución

| Paquete | Versión instalada | Licencia | Obligaciones relevantes |
|---|---|---|---|
| `ethers` | 6.15.0 | MIT | Atribución: conservar aviso de copyright y texto MIT en la distribución |
| `react` | 19.3.0 | MIT | Atribución: conservar aviso de copyright y texto MIT |
| `react-dom` | 19.3.0 | MIT | Atribución: conservar aviso de copyright y texto MIT |

### Dependencias de desarrollo

| Paquete | Versión | Licencia | Obligaciones relevantes |
|---|---|---|---|
| `@axe-core/playwright` | 4.13.0 | **MPL-2.0** | Copyleft **a nivel de fichero**: modificar y distribuir un fichero cubierto obliga a publicar esa modificación. Aquí no se modifica ni se distribuye (`NOTICE:59-63`) |
| `@playwright/test` | 1.63.0 | **Apache-2.0** | Conservar licencia y `NOTICE` propio; cláusula de patentes (`NOTICE:64-67`) |
| `typescript` | 5.9.3 | **Apache-2.0** | Conservar licencia y `NOTICE`; cláusula de patentes |
| `@eslint/js` | 9.39.5 | MIT | Solo atribución; no se distribuye |
| `@types/chrome` | 0.1.43 | MIT | Solo atribución |
| `@types/node` | 24.13.4 | MIT | Solo atribución |
| `@types/react` | 19.3.0 | MIT | Solo atribución |
| `@types/react-dom` | 19.3.0 | MIT | Solo atribución |
| `@vitejs/plugin-react` | 5.2.0 | MIT | Solo atribución |
| `@vitest/coverage-v8` | 3.2.7 | MIT | Solo atribución |
| `eslint` | 9.39.5 | MIT | Solo atribución |
| `eslint-plugin-react-hooks` | 7.1.1 | MIT | Solo atribución |
| `globals` | 17.12.0 | MIT | Solo atribución |
| `jsdom` | 26.1.0 | MIT | Solo atribución |
| `mermaid` | 11.17.2 | MIT | Solo atribución |
| `typescript-eslint` | 8.70.0 | MIT | Solo atribución |
| `vite` | 7.3.6 | MIT | Solo atribución |
| `vitest` | 3.2.7 | MIT | Solo atribución |

### Lectura de las tres licencias presentes

#### MIT (18 de las 21 dependencias)

Permisiva y sin copyleft. La obligación operativa es **una**: incluir el aviso de copyright y el texto de la licencia en todas las copias o partes sustanciales (`LICENSE:12-13`). No impone publicar modificaciones ni afecta al código propio.

#### Apache-2.0 (`@playwright/test`, `typescript`)

Permisiva, pero **más exigente que la MIT** en dos puntos: (a) obliga a conservar los avisos de licencia, el fichero `NOTICE` propio del proyecto cuando exista y a indicar los ficheros modificados; y (b) incorpora una **cláusula de patentes** con cesión expresa. `NOTICE:64-67` reconoce ambas y remite a `node_modules/<paquete>/LICENSE`.

#### MPL-2.0 (`@axe-core/playwright`)

Copyleft **débil y a nivel de fichero**: el código propio que lo rodea no queda contaminado, pero cualquier **modificación de un fichero cubierto** que se distribuya debe publicarse bajo la MPL-2.0. `NOTICE:59-63` acota el riesgo declarando que el paquete se usa sin modificar, solo en desarrollo y que no se empaqueta en `dist/`.

### Paquetes sin licencia legible y alcance

**Ninguno**: los 21 campos `license` se han leído correctamente. Como comprobación cruzada, las versiones y licencias de las 18 dependencias de desarrollo coinciden una a una con `NOTICE:36-55`, y las 3 de ejecución con `NOTICE:19-23`; no hay discrepancias detectadas. Las licencias de las dependencias **transitivas** (no declaradas en `package.json`) quedan fuera del alcance y **pendiente de confirmar**.

## Tipografías (SIL Open Font License 1.1)

### Inventario real de `public/fonts/`

Listado obtenido con glob sobre `public/fonts/**`:

| Fichero | Tipo |
|---|---|
| `public/fonts/LICENSE-inter.txt` | Texto de licencia (93 líneas) — OFL-1.1 + cabecera de copyright |
| `public/fonts/LICENSE-poppins.txt` | Texto de licencia (93 líneas) — OFL-1.1 + cabecera de copyright |
| `public/fonts/LICENSE-jetbrains-mono.txt` | Texto de licencia (93 líneas) — OFL-1.1 + cabecera de copyright |
| `public/fonts/inter-latin.woff2` | Fuente variable — Inter |
| `public/fonts/jetbrains-mono-latin.woff2` | Fuente variable — JetBrains Mono |
| `public/fonts/poppins-latin-400.woff2` | Peso discreto 400 — Poppins |
| `public/fonts/poppins-latin-600.woff2` | Peso discreto 600 — Poppins |
| `public/fonts/poppins-latin-700.woff2` | Peso discreto 700 — Poppins |

Es decir: **3 textos de licencia OFL** y **5 ficheros de fuente** (3 pesos de Poppins, 1 Inter variable y 1 JetBrains Mono variable), coherente con `NOTICE:95-97`.

### Titulares de copyright de cada tipografía

Cabeceras leídas (`read` sobre las 12 primeras líneas de cada `LICENSE-*.txt`):

| Tipografía | Titular de copyright | Fichero y línea |
|---|---|---|
| **Poppins** | `Copyright 2020 The Poppins Project Authors (https://github.com/itfoundry/Poppins)` | `public/fonts/LICENSE-poppins.txt:1` |
| **Inter** | `Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)` | `public/fonts/LICENSE-inter.txt:1` |
| **JetBrains Mono** | `Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)` | `public/fonts/LICENSE-jetbrains-mono.txt:1` |

Los tres ficheros declaran a continuación la misma licencia —«This Font Software is licensed under the SIL Open Font License, Version 1.1»— en `LICENSE-poppins.txt:3`, `LICENSE-inter.txt:3` y `LICENSE-jetbrains-mono.txt:3`, y reproducen el texto completo desde la línea 8-12 de cada uno, con el encabezado «SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007».

### Obligaciones de la OFL-1.1

`NOTICE:100-104` resume las tres condiciones que impone la OFL-1.1 y que el proyecto cumple:

1. **No vender la fuente por sí sola** — la OFL permite uso, estudio, modificación y redistribución, pero la fuente no puede comercializarse como producto aislado.
2. **No reutilizar los nombres reservados en derivados** — un derivado no puede llamarse «Poppins», «Inter» ni «JetBrains Mono» sin autorización del titular.
3. **La licencia acompaña a la fuente** — el texto OFL debe viajar junto con los ficheros de fuente.

El proyecto redistribuye las fuentes **sin modificar** dentro del paquete de la extensión (`NOTICE:103-104`), lo que sitúa el caso en el escenario de mínima obligación: se conserva el texto, se conservan los nombres y no hay derivados. `LICENSE:37-40` cierra el círculo declarando que las tipografías quedan **fuera** del alcance de la MIT del proyecto y «se rigen por sus propias condiciones». La razón de auto-hospedarlas es RNF-20 (0 peticiones a CDN), declarada en `NOTICE:90-91`.

## Activos gráficos

### Marca en `public/brand/`

Listado con glob sobre `public/brand/**`: `truekeate-logo.ico`, `truekeate-logo.png`, `truekeate-logo.svg`, `truekeate-titulo.png`, `truekeate-titulo.svg` y `truekeate-mark-96.png`.

### Iconos en `public/icons/`

Listado con glob sobre `public/icons/**`:

| Fichero | Uso declarado |
|---|---|
| `public/icons/icon-16.png` | Icono de extensión 16 px — `src/manifest.ts:47` |
| `public/icons/icon-32.png` | Icono de extensión 32 px — `src/manifest.ts:48` |
| `public/icons/icon-48.png` | Icono de extensión 48 px — `src/manifest.ts:49` |
| `public/icons/icon-128.png` | Icono de extensión 128 px — `src/manifest.ts:50` |

Los cuatro tamaños se declaran también como iconos de acción en `src/manifest.ts:55-58`.

### Origen de los activos originales

Los originales entregados viven en `TrueKeate/`: `TrueKeate_logo.JPG`, `TrueKeate_logo.ico`, `TrueKeate_logo.png`, `TrueKeate_logo.svg`, `TrueKeate_titulo.png` y `TrueKeate_titulo.svg` (listado con glob).

### Qué declara `NOTICE` sobre autoría y licencia

`NOTICE:110-113` (apartado 5, «Activos de marca (fuera de la licencia MIT)») declara literalmente que los activos de la marca **TrueKeate** — `TrueKeate/`, `public/brand/` y «los iconos derivados de `public/icons/`» — «fueron cedidos al proyecto por su titular para este uso (DEC-15)» y que **«No** se redistribuyen bajo la licencia MIT del codigo: ver el apartado «Alcance de esta licencia» de `LICENSE`». `LICENSE:34-36` es la contrapartida en el fichero de licencia, y DEC-15 está registrada en `RepoTecnico/estado_proyecto.md:249` con el motivo «Petición explícita del usuario en Fase 1».

**Conclusión verificable:** la autoría de los activos de marca está declarada como una **cesión del titular al proyecto** (no como una licencia de código abierto), y el `NOTICE` **sí** menciona expresamente tanto `public/brand/` como `public/icons/`. El nombre concreto de la persona o entidad cedente **no** figura en `NOTICE` ni en `LICENSE` más allá de «su titular»: queda **pendiente de confirmar** si se desea identificar nominalmente (el titular del copyright del código sí consta: ANLU corporations, `LICENSE:3`). Los iconos `public/icons/*.png` se generan con `scripts/generate-icons.ps1`, según `RepoTecnico/entornos_globales.md:375` y `:411`, que advierten de su dependencia de .NET `System.Drawing` en Windows.

## Contrato auxiliar de Forge

### Identificador SPDX y versión de `solc`

| Fichero | Línea | Contenido verificado |
|---|---|---|
| `contracts/src/EIP712Verifier.sol` | 1 | `// SPDX-License-Identifier: MIT` |
| `contracts/src/EIP712Verifier.sol` | 2 | `pragma solidity 0.8.24;` |
| `contracts/test/EIP712Verifier.t.sol` | 1 | `// SPDX-License-Identifier: MIT` |
| `contracts/test/EIP712VerifierFase4.t.sol` | 1 | `// SPDX-License-Identifier: MIT` |
| `contracts/foundry.toml` | 6 | `solc = "0.8.24"` — **fijado**, no rango (RNF-24, §5.4) |
| `contracts/foundry.toml` | 7 | `evm_version = "cancun"` |
| `contracts/foundry.toml` | 1-2 | El directorio no forma parte del producto: es instrumento de prueba RT-11 |

Es decir: el contrato se distribuye bajo **MIT**, igual que el código propio, con la versión de compilador **fijada a 0.8.24** tanto en `contracts/foundry.toml:6` como en el `pragma` del contrato (`contracts/src/EIP712Verifier.sol:2`). El contrato se declara **sin estado y fuera del producto** (`contracts/src/EIP712Verifier.sol:5-7`).

### Licencia dual de `forge-std`

`contracts/lib/forge-std` está vendorizado y conserva sus **dos** textos de licencia, ambos existentes en disco: `contracts/lib/forge-std/LICENSE-MIT` (MIT) y `contracts/lib/forge-std/LICENSE-APACHE` (Apache-2.0). `NOTICE:79` declara la doble licencia «MIT o Apache-2.0 (doble)» con titular «Foundry contributors», y `NOTICE:83-84` confirma que se conserva tal cual con los dos textos. Los tests del contrato importan de `forge-std` (`contracts/test/EIP712Verifier.t.sol:4-6` y `contracts/test/EIP712VerifierFase4.t.sol:4-6`), lo que hace la licencia dual relevante para quien redistribuya `contracts/`.

> **Nota de verificación.** Se ha confirmado la **existencia** de `LICENSE-MIT` y `LICENSE-APACHE` y la declaración de `NOTICE:79`. No se ha leído el texto interno de ambos ficheros; su contenido literal queda **pendiente de confirmar** si se necesita citarlo textualmente.

### Foundry como binario (no distribuido)

Foundry (`forge`, `anvil`, `cast`) es un **binario externo**, no un paquete npm ni un fichero versionado. `NOTICE:78` lo declara bajo «MIT o Apache-2.0 (doble)», titular «Foundry contributors», rango declarado `>= 1.0.0 < 2.0.0` y verificado con `1.7.2-dev`; `NOTICE:121-122` aclara que Anvil «no se redistribuye». El rango y la versión detectada están en `RepoTecnico/entornos_globales.md:370` y `README.md:29`.

## Cumplimiento

### Ficheros que deben viajar con la distribución

| Fichero | Obligación que satisface | Fuente |
|---|---|---|
| `LICENSE` | Aviso de copyright y texto MIT del código propio; delimita las tres exclusiones | `LICENSE:5-21`, `LICENSE:32-42` |
| `NOTICE` | Atribución de las 21 dependencias, Foundry, `forge-std`, tipografías y marca | `NOTICE:1-13` |
| `public/fonts/LICENSE-poppins.txt` | OFL-1.1 de Poppins: la licencia acompaña a la fuente | `LICENSE-poppins.txt:1-10`, `NOTICE:95` |
| `public/fonts/LICENSE-inter.txt` | OFL-1.1 de Inter | `LICENSE-inter.txt:1-10`, `NOTICE:96` |
| `public/fonts/LICENSE-jetbrains-mono.txt` | OFL-1.1 de JetBrains Mono | `LICENSE-jetbrains-mono.txt:1-10`, `NOTICE:97` |
| `node_modules/{ethers,react,react-dom}/LICENSE` | Texto MIT de las tres librerías de ejecución | `NOTICE:10-13` |
| `contracts/lib/forge-std/LICENSE-MIT` y `LICENSE-APACHE` | Licencia dual del `forge-std` vendorizado | `NOTICE:83-84` |

Los `LICENSE-*.txt` de las tipografías viajan **dentro** del paquete de la extensión porque `public/` se copia a `dist/` en el build (`vite.config.ts:236-237`). Por tanto `dist/fonts/LICENSE-*.txt` existe en el artefacto cargable y la obligación de la OFL queda satisfecha **en la propia extensión**, sin depender de que el usuario reciba el repositorio.

### Verificaciones que este manual no ha podido ejecutar

La política de la tarea prohíbe ejecutar builds, tests, `npm install`, `npm ci` y `npm run lint:prohibited`. En consecuencia:

- La afirmación de `NOTICE:68-70` de que «`dist/` contiene solo el codigo propio mas `ethers`, `react` y `react-dom`» **no se ha comprobado inspeccionando `dist/`**: queda **pendiente de confirmar** mediante `npm run lint:prohibited` o inspección del artefacto.
- La afirmación de `NOTICE:99-100` de que los tres textos OFL están versionados y que «`git ls-files` los lista» **no se ha comprobado con `git`**: la existencia física de los tres ficheros sí se ha verificado con glob y lectura, pero su seguimiento por git queda **pendiente de confirmar**.
- Las licencias de las dependencias **transitivas** quedan fuera del alcance y **pendiente de confirmar**.

### Implicaciones de publicar el proyecto

#### Escenario A — publicar el repositorio tal cual

Es el escenario para el que el corpus está preparado. Implicaría:

1. **Conservar `LICENSE` y `NOTICE`** en la raíz (atribución MIT propia y de terceros).
2. **Conservar los tres `public/fonts/LICENSE-*.txt`** junto a las fuentes (obligación OFL).
3. **Conservar `contracts/lib/forge-std/LICENSE-MIT` y `LICENSE-APACHE`** (licencia dual del código vendorizado).
4. **No relicenciar** los activos de marca `TrueKeate/`, `public/brand/` y `public/icons/` bajo la MIT: son una cesión para este uso (`LICENSE:34-36`, `NOTICE:110-113`). Publicar el repositorio con esos activos sin autorización expresa del titular sería el punto jurídicamente más delicado del inventario, y el corpus lo trata como **excepción explícita** a la licencia del código.
5. **Mantener el aviso de uso** de `LICENSE:44-49`: la wallet no cifra el almacén local y no debe usarse con fondos reales.

#### Escenario B — distribuir el artefacto (`dist/`)

Aquí la obligación de terceros se reduce a **tres licencias MIT** (`ethers`, `react`, `react-dom`) más **tres OFL-1.1** (las tipografías), porque ninguna dependencia de desarrollo se empaqueta (`NOTICE:68-70`). Operativamente: incluir el texto MIT de los tres paquetes y conservar los tres `LICENSE-*.txt` dentro del paquete.

#### Escenario C — publicar con modificaciones

Si se modificara algún fichero cubierto por la **MPL-2.0** (`@axe-core/playwright`), habría que publicar esa modificación, según `NOTICE:59-63`. Si se modificaran las tipografías, dejarían de poder llamarse Poppins / Inter / JetBrains Mono (nombres reservados de la OFL, `NOTICE:101-103`). Ninguna de las dos situaciones se da hoy: ninguna dependencia de terceros se ha modificado (`NOTICE:125-126`) y las fuentes se redistribuyen sin modificar (`NOTICE:103-104`).

### Resumen ejecutivo de licencias por componente

| Componente | Licencia | Titular declarado | Copyleft | Fuente |
|---|---|---|---|---|
| Código propio (`src/`, `test/`, `e2e/`, configs, docs) | **MIT** | ANLU corporations (2026) | No | `LICENSE:1-3`, `LICENSE:28-30` |
| Contrato `contracts/src/EIP712Verifier.sol` y sus tests | **MIT** | No declarado en el fichero | No | `contracts/src/EIP712Verifier.sol:1` |
| `forge-std` vendorizado | **MIT o Apache-2.0** (dual) | Foundry contributors | No | `NOTICE:79`, `contracts/lib/forge-std/LICENSE-*` |
| Foundry (`forge`, `anvil`, `cast`) | **MIT o Apache-2.0** (dual) | Foundry contributors | No | `NOTICE:78` |
| 18 dependencias npm de desarrollo | MIT (16), Apache-2.0 (2), MPL-2.0 (1) | Según `NOTICE:36-55` | Solo MPL-2.0, a nivel de fichero | `node_modules/<pkg>/package.json` |
| 3 dependencias npm de ejecución | MIT | Richard Moore; Meta Platforms, Inc. | No | `NOTICE:19-23` |
| Tipografías Poppins, Inter, JetBrains Mono | **SIL OFL 1.1** | The Poppins / Inter / JetBrains Mono Project Authors (2020) | No (licencia de fuente con condiciones propias) | `public/fonts/LICENSE-*.txt:1-3` |
| Activos de marca (`TrueKeate/`, `public/brand/`, `public/icons/`) | **Cesión del titular para este uso** (DEC-15); fuera de la MIT | Titular de la marca TrueKeate (no identificado nominalmente en `LICENSE` ni `NOTICE`) | No aplica | `LICENSE:34-36`, `NOTICE:110-113`, `RepoTecnico/estado_proyecto.md:249` |
| Chrome / Edge, Anvil, npm | No distribuidos | — | No aplica | `NOTICE:116-126` |

### Cierre

El proyecto tiene una base de licencias **simple y permisiva**: MIT para el código propio y para la mayoría de las dependencias, Apache-2.0 en dos herramientas de desarrollo y MPL-2.0 en una sola (`@axe-core/playwright`), sin copyleft que alcance al código del producto. Las dos únicas situaciones que exigen atención al publicar son las **tipografías OFL-1.1** (conservar el texto y los nombres) y los **activos de marca**, expresamente excluidos de la MIT y cedidos solo para este uso. Todo lo anterior está respaldado por `LICENSE`, `NOTICE`, los tres `LICENSE-*.txt` de `public/fonts/` y el campo `license` de cada `node_modules/<paquete>/package.json`.
