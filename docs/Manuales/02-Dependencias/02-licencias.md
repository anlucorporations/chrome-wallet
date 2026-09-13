# Manual de licencias de TrueKeate Wallet

Este manual explica, sin tecnicismos, qué licencia tiene el código de TrueKeate Wallet, qué licencia tiene cada pieza ajena que usa y qué obligaciones nacen de todo ello al publicar el proyecto.

Una **licencia** es el permiso legal que dice qué puedes hacer con un programa: usarlo, copiarlo, cambiarlo o repartirlo. Cuando hablamos de **copyleft** nos referimos a licencias que obligan a compartir las modificaciones; la MIT no lo hace, la MPL-2.0 sí, pero solo para el fichero que toques.

## Empezar en 5 minutos

### Qué necesitas

- Saber si vas a **publicar el repositorio**, **repartir la extensión construida** (`dist/`) o **modificar** algo.
- Los ficheros `LICENSE` y `NOTICE` de la raíz. Son los dos documentos que recogen todas las atribuciones.
- Saber que los activos de la marca y las tipografías **no** van con la licencia del código.

### Qué vas a conseguir

- Entender qué es MIT, qué es Apache-2.0 y qué es MPL-2.0, y en qué te afectan.
- Saber exactamente qué ficheros de licencia deben viajar con el producto.
- Evitar el error más habitual: dar por hecho que la marca y las fuentes se pueden usar como cualquier otra parte del código.

### Los pasos mínimos

1. Lee la licencia del código propio:

```powershell
Get-Content LICENSE
```

2. Lee el aviso de terceros, que reúne la atribución de todas las piezas ajenas:

```powershell
Get-Content NOTICE
```

3. Comprueba que los textos de las tipografías siguen junto a las fuentes:

```powershell
Get-ChildItem public\fonts
```

4. Si vas a repartir la extensión construida, verifica que dentro del paquete solo entran las tres librerías permitidas:

```powershell
npm run lint:prohibited
```

5. Si vas a publicar, revisa la lista de «Ficheros que deben viajar con la distribución» de este manual antes de subir nada.

## Licencia del código propio

### Identificación de la licencia

#### Texto, titular y año

El fichero `LICENSE` contiene la **MIT License**:

| Dato | Valor |
|---|---|
| Licencia | **MIT** |
| Titular | **ANLU corporations** |
| Año del copyright | **2026** |
| Texto | Cláusula de permiso, aviso de copyright y exención de garantías |

El fichero `NOTICE` confirma lo mismo: «Licencia del código propio: MIT».

#### Obligación de la MIT

La MIT es **permisiva** y **no copyleft**. Su única obligación real es de **atribución**: hay que conservar el aviso de copyright y el texto del permiso en todas las copias o en las partes sustanciales del programa. El software se entrega «tal cual», sin garantía de ningún tipo.

### Alcance de la licencia

#### Qué cubre

Cubre el código fuente de TrueKeate Wallet y también los ficheros de configuración, las pruebas y la documentación del repositorio. La titularidad es de ANLU corporations.

#### Qué queda fuera

Hay **tres excepciones** expresas, cada una con sus propias reglas:

1. **Activos de marca TrueKeate** (la carpeta `TrueKeate/` y sus copias en `public/brand/` y `public/icons/`). Se cedieron al proyecto por su titular solo para este uso (decisión DEC-15). **No** van con la MIT.
2. **Tipografías auto-hospedadas** de `public/fonts/` (Poppins, Inter y JetBrains Mono), distribuidas bajo la **SIL Open Font License 1.1**. Cada una viaja con su fichero de licencia (`LICENSE-poppins.txt`, `LICENSE-inter.txt` y `LICENSE-jetbrains-mono.txt`).
3. **Dependencias de terceros** (los paquetes de npm y Foundry), con sus licencias recogidas en `NOTICE`.

#### Aviso de uso

`LICENSE` incluye además un aviso que **no** es una cláusula de licencia, sino una advertencia de alcance: esta cartera es de **desarrollo**, funciona contra una red local de pruebas, **no tiene contraseña** y **no cifra** el almacén local. Por eso no debe usarse con fondos reales ni con frases semilla que protejan valor real.

## Aviso de terceros (`NOTICE`)

### Naturaleza y estructura

`NOTICE` es el fichero de atribuciones del proyecto. Se generó en el cierre del hito H6 a partir de `package.json`, `package-lock.json` y los paquetes realmente instalados en `node_modules/`. Se organiza en seis apartados:

| Apartado | Contenido |
|---|---|
| 1. Dependencias de ejecución | Los 3 paquetes que viajan en `dist/` |
| 2. Herramientas de desarrollo y pruebas | Los 18 paquetes que **no** se empaquetan |
| 3. Contrato auxiliar de Foundry | Foundry y `forge-std` |
| 4. Tipografías (SIL OFL 1.1) | Poppins, Inter y JetBrains Mono |
| 5. Activos de marca | Fuera de la licencia MIT |
| 6. Software de terceros no distribuido | Chrome/Edge, Anvil y npm |

### Dependencias de ejecución

Las tres piezas que viajan dentro de la extensión son:

- `ethers` 6.15.0, licencia MIT, autor Richard Moore (ricmoo).
- `react` 19.3.0, licencia MIT, de Meta Platforms, Inc. y colaboradores.
- `react-dom` 19.3.0, licencia MIT, de los mismos autores.

Dos notas de diseño con efecto legal indirecto: `ethers.js v6` es la **única** librería criptográfica del producto, y React 19 se usa solo para la interfaz.

### Herramientas de desarrollo y notas de cumplimiento

El aviso lista los 18 paquetes de desarrollo con su versión, licencia y titular, y añade tres notas que importan:

- **`@axe-core/playwright` (MPL-2.0)**: se usa solo como herramienta de desarrollo, sin modificar y sin entrar en `dist/`. Si alguien modificara un fichero cubierto, tendría que publicar esa modificación.
- **`@playwright/test` y `typescript` (Apache-2.0)**: hay que conservar el aviso de licencia y el `NOTICE` propio del paquete, y se aplica su cláusula de patentes.
- **Ninguna herramienta de desarrollo se empaqueta**: `dist/` solo contiene el código propio más `ethers`, `react` y `react-dom`. Esto se puede comprobar con `npm run lint:prohibited`.

### Contrato auxiliar de Foundry

El contrato de `contracts/` es un instrumento de prueba:

| Componente | Versión | Licencia | Titular |
|---|---|---|---|
| Foundry (`forge`, `anvil`, `cast`) | Declarado `>= 1.0.0 < 2.0.0`; verificado con `1.7.2-dev` | MIT o Apache-2.0 (doble) | Foundry contributors |
| `forge-std` (`contracts/lib/forge-std`) | Incluido en el repositorio como referencia de pruebas | MIT o Apache-2.0 (doble) | Foundry contributors |

La doble licencia se conserva tal cual, con los dos textos en `contracts/lib/forge-std/LICENSE-MIT` y `LICENSE-APACHE`.

### Tipografías, marca y software no distribuido

Las tres familias de letra están guardadas dentro del propio proyecto (cero peticiones a servidores externos), todas bajo la **SIL Open Font License 1.1**, con el texto completo en su fichero `LICENSE-*.txt`.

Los activos de la marca TrueKeate (`TrueKeate/`, `public/brand/` y los iconos derivados de `public/icons/`) fueron cedidos al proyecto para este uso (DEC-15) y **no** se reparten bajo la licencia MIT del código.

Por último, el aviso aclara lo que **no** se distribuye: Google Chrome y Microsoft Edge (son la plataforma), Anvil (lo arranca cada usuario en su equipo) y npm (el gestor de paquetes). Y declara expresamente que **ningún** paquete de terceros se ha modificado.

## Licencias de las dependencias

### Método de obtención

Para cada uno de los 21 paquetes se leyó el campo `license` de su `package.json` dentro de `node_modules/`. En los 21 casos el campo existe, así que **no hay ningún paquete pendiente de confirmar** por este motivo.

### Dependencias de ejecución

| Paquete | Versión | Licencia | Qué obliga |
|---|---|---|---|
| `ethers` | 6.15.0 | MIT | Conservar el aviso de copyright y el texto de la licencia |
| `react` | 19.3.0 | MIT | Conservar el aviso de copyright y el texto de la licencia |
| `react-dom` | 19.3.0 | MIT | Conservar el aviso de copyright y el texto de la licencia |

### Dependencias de desarrollo

| Paquete | Versión | Licencia | Qué obliga |
|---|---|---|---|
| `@axe-core/playwright` | 4.13.0 | **MPL-2.0** | Copyleft por fichero: si lo modificas y lo repartes, publica el cambio. Aquí no se modifica ni se reparte |
| `@playwright/test` | 1.63.0 | **Apache-2.0** | Conservar licencia y `NOTICE`; cláusula de patentes |
| `typescript` | 5.9.3 | **Apache-2.0** | Conservar licencia y `NOTICE`; cláusula de patentes |
| `@eslint/js` | 9.39.5 | MIT | Solo atribución; no se reparte |
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

Es permisiva y no tiene copyleft. La obligación práctica es **una**: incluir el aviso de copyright y el texto de la licencia en las copias o en las partes sustanciales. No obliga a publicar modificaciones ni afecta al código propio.

#### Apache-2.0 (`@playwright/test`, `typescript`)

También es permisiva, pero **más exigente** que la MIT en dos puntos: obliga a conservar los avisos de licencia y el fichero `NOTICE` propio del paquete cuando exista, e incorpora una **cláusula de patentes** con cesión expresa.

#### MPL-2.0 (`@axe-core/playwright`)

Es un copyleft **débil y a nivel de fichero**: el código propio que la rodea no queda contaminado, pero si modificas un fichero cubierto y lo repartes, tienes que publicar esa modificación bajo la MPL-2.0. Aquí el riesgo está acotado porque el paquete se usa sin modificar, solo en desarrollo y no entra en `dist/`.

### Paquetes sin licencia legible y alcance

**Ninguno**: los 21 campos `license` se leyeron correctamente y las versiones coinciden con las del aviso `NOTICE`, sin discrepancias.

Las licencias de las dependencias **transitivas** (las que traen consigo otros paquetes sin estar declaradas en `package.json`) quedan fuera del alcance de este manual y están **pendiente de confirmar**.

## Tipografías (SIL Open Font License 1.1)

### Inventario real de `public/fonts/`

Dentro de esa carpeta hay **3 textos de licencia** y **5 ficheros de fuente**:

- Tres ficheros `LICENSE-*.txt` (Poppins, Inter y JetBrains Mono), cada uno con el texto de la OFL-1.1 y la cabecera de copyright.
- `inter-latin.woff2` (fuente variable), `jetbrains-mono-latin.woff2` (fuente variable) y tres pesos de Poppins: 400, 600 y 700.

### Titulares de copyright de cada tipografía

| Tipografía | Titular del copyright |
|---|---|
| **Poppins** | Copyright 2020 The Poppins Project Authors |
| **Inter** | Copyright 2020 The Inter Project Authors |
| **JetBrains Mono** | Copyright 2020 The JetBrains Mono Project Authors |

Los tres ficheros declaran la misma licencia: «This Font Software is licensed under the SIL Open Font License, Version 1.1», y reproducen el texto completo a continuación.

### Obligaciones de la OFL-1.1

La licencia impone tres condiciones, y el proyecto cumple las tres:

1. **No vender la fuente por sí sola.** Se puede usar, estudiar, modificar y redistribuir, pero la fuente no puede venderse como producto aislado.
2. **No reutilizar los nombres reservados en versiones derivadas.** Una versión modificada no puede llamarse «Poppins», «Inter» ni «JetBrains Mono» sin autorización.
3. **La licencia acompaña a la fuente.** El texto de la OFL debe viajar junto con los ficheros de fuente.

El proyecto reparte las fuentes **sin modificar** dentro del paquete de la extensión, que es el escenario de mínima obligación: se conserva el texto, se conservan los nombres y no hay versiones derivadas. Por eso las tipografías quedan **fuera** de la MIT del proyecto y se rigen por sus propias condiciones. La razón de guardarlas dentro del proyecto es no depender de ningún servidor externo.

## Activos gráficos

### Marca en `public/brand/`

La carpeta contiene el logotipo de TrueKeate en varios formatos (`.ico`, `.png`, `.svg`), el título de marca (`.png` y `.svg`) y una marca de 96 píxeles.

### Iconos en `public/icons/`

| Fichero | Para qué se usa |
|---|---|
| `public/icons/icon-16.png` | Icono de la extensión de 16 px |
| `public/icons/icon-32.png` | Icono de la extensión de 32 px |
| `public/icons/icon-48.png` | Icono de la extensión de 48 px |
| `public/icons/icon-128.png` | Icono de la extensión de 128 px |

Los cuatro tamaños se declaran también como iconos del botón de la extensión.

### Origen de los activos originales

Los originales entregados viven en la carpeta `TrueKeate/`: logotipo en `.JPG`, `.ico`, `.png` y `.svg`, y título en `.png` y `.svg`.

### Qué declara `NOTICE` sobre autoría y licencia

El aviso declara literalmente que los activos de la marca **TrueKeate** —la carpeta `TrueKeate/`, `public/brand/` y los iconos derivados de `public/icons/`— «fueron cedidos al proyecto por su titular para este uso (DEC-15)» y que **no** se redistribuyen bajo la licencia MIT del código.

Conclusión comprobable: la autoría de la marca está declarada como una **cesión del titular al proyecto**, no como una licencia de código abierto. El nombre concreto de la persona o entidad que cedió los activos **no** figura en `NOTICE` ni en `LICENSE` más allá de «su titular»: queda **pendiente de confirmar** si se quiere identificar nominalmente. El titular del copyright del código sí consta: ANLU corporations.

Los iconos de `public/icons/` se generan con el guion `scripts/generate-icons.ps1`, que depende de la librería `System.Drawing` de Windows.

## Contrato auxiliar de Forge

### Identificador SPDX y versión de `solc`

| Fichero | Contenido |
|---|---|
| `contracts/src/EIP712Verifier.sol` | `// SPDX-License-Identifier: MIT` y `pragma solidity 0.8.24;` |
| `contracts/test/EIP712Verifier.t.sol` | `// SPDX-License-Identifier: MIT` |
| `contracts/test/EIP712VerifierFase4.t.sol` | `// SPDX-License-Identifier: MIT` |
| `contracts/foundry.toml` | `solc = "0.8.24"` (fijado) y `evm_version = "cancun"` |

Es decir: el contrato se distribuye bajo **MIT**, igual que el código propio, con la versión del compilador **fijada** tanto en la configuración como en la primera línea del propio contrato. El directorio `contracts/` no forma parte del producto: es un instrumento de prueba.

### Licencia dual de `forge-std`

`contracts/lib/forge-std` está incluido en el repositorio y conserva sus **dos** textos de licencia: `LICENSE-MIT` (MIT) y `LICENSE-APACHE` (Apache-2.0). El aviso declara la doble licencia «MIT o Apache-2.0 (doble)», con titular «Foundry contributors», y confirma que se conserva tal cual. Las pruebas del contrato usan este paquete, así que su licencia importa a quien reparta la carpeta `contracts/`.

> **Nota de verificación.** Se ha confirmado que los dos ficheros existen y lo que declara el aviso. No se ha leído su texto interno: su contenido literal queda **pendiente de confirmar** si se necesita citarlo palabra por palabra.

### Foundry como binario (no distribuido)

Foundry (`forge`, `anvil`, `cast`) es un **programa externo**, no un paquete de npm ni un fichero guardado en el repositorio. El aviso lo declara bajo «MIT o Apache-2.0 (doble)», con titular «Foundry contributors», rango declarado `>= 1.0.0 < 2.0.0` y versión verificada `1.7.2-dev`. Anvil **no se redistribuye**: lo instala y lo arranca cada usuario en su equipo.

## Cumplimiento

### Ficheros que deben viajar con la distribución

| Fichero | Qué obligación cumple |
|---|---|
| `LICENSE` | Aviso de copyright y texto MIT del código propio; además delimita las tres excepciones |
| `NOTICE` | Atribución de las 21 dependencias, Foundry, `forge-std`, tipografías y marca |
| `public/fonts/LICENSE-poppins.txt` | Licencia OFL-1.1 de Poppins |
| `public/fonts/LICENSE-inter.txt` | Licencia OFL-1.1 de Inter |
| `public/fonts/LICENSE-jetbrains-mono.txt` | Licencia OFL-1.1 de JetBrains Mono |
| `node_modules/{ethers,react,react-dom}/LICENSE` | Texto MIT de las tres librerías de ejecución |
| `contracts/lib/forge-std/LICENSE-MIT` y `LICENSE-APACHE` | Licencia dual del paquete incluido |

Los ficheros `LICENSE-*.txt` de las tipografías viajan **dentro** del paquete de la extensión, porque la carpeta `public/` se copia a `dist/` durante la construcción. Eso significa que la obligación de la OFL queda cumplida en la propia extensión, sin depender de que el usuario reciba el repositorio.

### Verificaciones que este manual no ha podido ejecutar

- Que `dist/` contenga solo el código propio más `ethers`, `react` y `react-dom` **no** se comprobó inspeccionando la carpeta: queda **pendiente de confirmar** con `npm run lint:prohibited` o revisando el artefacto.
- Que los tres textos de la OFL estén registrados en git **no** se comprobó con `git`. Su existencia física sí se verificó.
- Las licencias de las dependencias **transitivas** quedan fuera del alcance: **pendiente de confirmar**.

### Implicaciones de publicar el proyecto

#### Escenario A — publicar el repositorio tal cual

Es el escenario para el que está preparado todo. Implica:

1. **Conservar `LICENSE` y `NOTICE`** en la raíz.
2. **Conservar los tres ficheros `public/fonts/LICENSE-*.txt`** junto a las fuentes.
3. **Conservar `contracts/lib/forge-std/LICENSE-MIT` y `LICENSE-APACHE`**.
4. **No relicenciar** los activos de marca `TrueKeate/`, `public/brand/` y `public/icons/` bajo la MIT: son una cesión para este uso. Es el punto jurídicamente más delicado del inventario.
5. **Mantener el aviso de uso**: la cartera no cifra el almacén local y no debe usarse con fondos reales.

#### Escenario B — distribuir el artefacto (`dist/`)

Aquí las obligaciones de terceros se reducen a **tres licencias MIT** (`ethers`, `react` y `react-dom`) más **tres licencias OFL-1.1** (las tipografías), porque ninguna herramienta de desarrollo se empaqueta. En la práctica: incluir el texto MIT de los tres paquetes y conservar los tres ficheros `LICENSE-*.txt` dentro del paquete.

#### Escenario C — publicar con modificaciones

Si modificaras algún fichero cubierto por la **MPL-2.0** (`@axe-core/playwright`), tendrías que publicar ese cambio. Si modificaras las tipografías, ya no podrían llamarse Poppins, Inter ni JetBrains Mono. Hoy no ocurre ninguna de las dos cosas: no se ha modificado ningún paquete de terceros y las fuentes se reparten sin modificar.

### Resumen ejecutivo de licencias por componente

| Componente | Licencia | Titular declarado | ¿Copyleft? |
|---|---|---|---|
| Código propio (`src/`, `test/`, `e2e/`, configuración y documentos) | **MIT** | ANLU corporations (2026) | No |
| Contrato `contracts/src/EIP712Verifier.sol` y sus pruebas | **MIT** | No declarado en el fichero | No |
| `forge-std` incluido en el repositorio | **MIT o Apache-2.0** (dual) | Foundry contributors | No |
| Foundry (`forge`, `anvil`, `cast`) | **MIT o Apache-2.0** (dual) | Foundry contributors | No |
| 18 dependencias de desarrollo | MIT (16), Apache-2.0 (2), MPL-2.0 (1) | Según `NOTICE` | Solo MPL-2.0, por fichero |
| 3 dependencias de ejecución | MIT | Richard Moore; Meta Platforms, Inc. | No |
| Tipografías Poppins, Inter y JetBrains Mono | **SIL OFL 1.1** | The Poppins / Inter / JetBrains Mono Project Authors (2020) | No, pero con condiciones propias |
| Activos de marca | **Cesión del titular para este uso** (DEC-15) | Titular de la marca TrueKeate (sin identificar nominalmente) | No aplica |
| Chrome / Edge, Anvil, npm | No se distribuyen | — | No aplica |

### Cierre

El proyecto tiene una base de licencias **sencilla y permisiva**: MIT para el código propio y para la mayoría de las dependencias, Apache-2.0 en dos herramientas y MPL-2.0 en una sola, sin copyleft que alcance al código del producto.

Las dos únicas situaciones que exigen atención al publicar son las **tipografías OFL-1.1** (conservar el texto y los nombres) y los **activos de marca**, excluidos expresamente de la MIT y cedidos solo para este uso.

## Problemas frecuentes

### Quiero usar el logotipo de TrueKeate en otro proyecto y no sé si puedo

**Causa.** Los activos de marca no van con la licencia MIT del código. Fueron cedidos al proyecto por su titular solo para este uso (DEC-15).

**Solución.** Pide autorización expresa al titular de la marca. Si vas a publicar el repositorio, mantén los activos fuera de cualquier relicenciamiento y conserva el aviso que los excluye.

### He repartido la extensión construida y no sé si me falta algún texto de licencia

**Causa.** Dentro de `dist/` solo viajan tres librerías MIT y las tres tipografías con licencia OFL-1.1. Es fácil olvidar que las fuentes también tienen su licencia.

**Solución.** Incluye el texto MIT de `ethers`, `react` y `react-dom`, y comprueba que los tres ficheros `LICENSE-*.txt` de `public/fonts/` siguen dentro del paquete. Como `public/` se copia a `dist/` en cada construcción, la obligación de la OFL se cumple sola si no los borras.

### He modificado el paquete de accesibilidad y no sé qué debo publicar

**Causa.** `@axe-core/playwright` es la única pieza con licencia MPL-2.0, que es copyleft **por fichero**: si modificas y repartes un fichero cubierto, tienes que publicar ese cambio.

**Solución.** Publica la modificación de ese fichero concreto bajo MPL-2.0. Hoy el proyecto no lo modifica, así que no hay nada que publicar; basta con no modificarlo.

### He cambiado el nombre de una tipografía y ahora tengo dudas

**Causa.** La OFL-1.1 reserva los nombres de las fuentes. Una versión derivada no puede usar el nombre original sin autorización del titular.

**Solución.** Quita el nombre reservado a la versión modificada. El proyecto reparte las fuentes sin tocar, de modo que no tiene este problema.

### No encuentro la licencia de la librería que se usa para hablar con el nodo

**Causa.** Esa librería es `ethers`, y su licencia no está en un fichero del proyecto, sino en el propio paquete instalado.

**Solución.** Consulta `node_modules/ethers/LICENSE`; el aviso `NOTICE` ya la resume como MIT, con autor Richard Moore.

### Quiero saber si puedo guardar fondos reales en esta cartera

**Causa.** El propio `LICENSE` incluye un aviso de alcance: la cartera es de desarrollo, no tiene contraseña y no cifra el almacén local.

**Solución.** No la uses con fondos reales ni con frases semilla que protejan valor real. Es una decisión de diseño declarada, no un defecto pendiente de arreglar.

### No sé si el proyecto puede usar un paquete con licencia distinta a la MIT

**Causa.** Las licencias permisivas (MIT y Apache-2.0) y la MPL-2.0 conviven sin problema mientras no se modifiquen los ficheros cubiertos por la MPL ni se empaqueten herramientas de desarrollo.

**Solución.** Comprueba dos cosas: que la pieza no se modifica y que no entra en `dist/`. El comando `npm run lint:prohibited` ayuda a confirmar lo segundo.

### Quiero citar la autoría de una fuente del proyecto

**Causa.** Cada tipografía tiene su propio titular de copyright, y no es el mismo que el del código.

**Solución.** Copia la cabecera del fichero correspondiente de `public/fonts/`: The Poppins Project Authors, The Inter Project Authors o The JetBrains Mono Project Authors, todos de 2020.
