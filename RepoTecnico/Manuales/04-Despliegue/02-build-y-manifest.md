# Build y manifest de TrueKeate Wallet

Propósito: documentar **cómo un solo `npm run build` produce las seis entradas del paquete MV3**, con **qué formato** se empaqueta cada una y **por qué**, cómo se **genera y valida `dist/manifest.json`** desde la fuente tipada `src/manifest.ts`, qué significa la **`key` fija** y el **ID estable** de la extensión, y qué acaba exactamente en `dist/` y quién carga cada fichero. Todas las afirmaciones se apoyan en `vite.config.ts` (257 líneas, leído completo), `src/manifest.ts` (92 líneas), `src/manifest/manifest.spec.ts` (172 líneas), los tres HTML de entrada, `src/styles/tokens.css`, `public/` y la evidencia archivada de build.

> **Método.** Lectura de ficheros y de evidencia archivada; **no** se ha ejecutado ningún build en esta sesión. Donde el dato procede de un log de evidencia se cita la ruta exacta. Lo no verificable queda marcado como **pendiente de confirmar**.

## Panorama del pipeline

### Un solo comando, tres builds

#### Qué lanza `npm run build`

`package.json:9` declara `"build": "tsc -b && vite build"`. El primer tramo es el tipado por proyectos; el segundo, Vite, aplica la **cadena de tres builds** definida en `vite.config.ts`. El efecto observable está resumido en la cabecera del propio fichero de configuración, `vite.config.ts:14-15`: «un solo `npm run build` produce las 6 entradas en `dist/` con su formato y `dist/manifest.json`».

`README.md:53` lo formula para el usuario: «Un solo comando produce **las 6 entradas** de la extensión en `dist/` y genera `dist/manifest.json`».

#### La cadena, en una frase

| Build | Formato | Entradas | Plugin que lo lanza |
|---|---|---|---|
| **1** | `es` | `index.html`, `connect.html`, `notification.html`, `background.ts` | Configuración principal (`vite.config.ts:242-255`) |
| **2** | `iife` | `content-script.ts` | `contentAndInjectBuildsPlugin`, desde `closeBundle` del build 1 (`vite.config.ts:189`) |
| **3** | `iife` | `inject/index.ts` (+ genera el manifest) | `contentAndInjectBuildsPlugin` + `manifestPlugin` (`vite.config.ts:190`) |

### Ficheros implicados

#### Fuentes

| Fichero | Papel | Líneas |
|---|---|---|
| `vite.config.ts` | Configuración de build, los tres builds y los dos plugins propios | 257 |
| `src/manifest.ts` | **Fuente única tipada** del manifest (M1/RT-05) | 92 |
| `src/index.html`, `src/connect.html`, `src/notification.html` | Las 3 páginas de entrada | 15 cada uno |
| `src/background.ts`, `src/content-script.ts`, `src/inject/index.ts` | Las 3 entradas de código | — |
| `src/manifest/manifest.spec.ts` | Spec que audita manifest declarado y artefacto | 172 |

#### Evidencia archivada del build

`RepoTecnico/evidencia/H6/build-windows-2026-09-12.log` archiva una corrida real (`npm run build`). Su cola es la mejor prueba documental de lo que hace el pipeline: lista `dist/src/notification.html`, `dist/src/index.html` y `dist/src/connect.html` —es decir, los HTML **emitidos primero bajo `src/`**, tal como se explica en `vite.config.ts:24-28`—, después los *bundles* de página y, finalmente, `[manifest] dist/manifest.json generado (version 1.0.0).`

## Las seis entradas y su formato

### Tabla de entradas

#### Declaración literal

`vite.config.ts:40-54` declara los tres mapas de entrada. La tabla los reproduce con su nombre exacto en `dist/`:

| Nombre en `dist/` | Fichero fuente | Mapa | Formato | Línea de la declaración |
|---|---|---|---|---|
| `index.html` | `src/index.html` | `PAGES_AND_SERVICE_WORKER_INPUT` | `es` | `vite.config.ts:42` |
| `connect.html` | `src/connect.html` | `PAGES_AND_SERVICE_WORKER_INPUT` | `es` | `vite.config.ts:43` |
| `notification.html` | `src/notification.html` | `PAGES_AND_SERVICE_WORKER_INPUT` | `es` | `vite.config.ts:44` |
| `background.js` | `src/background.ts` | `PAGES_AND_SERVICE_WORKER_INPUT` | `es` | `vite.config.ts:45` |
| `content-script.js` | `src/content-script.ts` | `CONTENT_SCRIPT_INPUT` | `iife` | `vite.config.ts:49` |
| `inject.js` | `src/inject/index.ts` | `INJECT_INPUT` | `iife` | `vite.config.ts:53` |

Los comentarios del propio código identifican cada entrada por su papel: `index` es el «popup (action.default_popup)», `connect` la «ventana de conexión», `notification` la «ventana de decisión», `background` el «Service Worker (ESM)», `content-script` el «content script (IIFE)» e `inject` el «provider inyectado (IIFE)» (`vite.config.ts:42-53`).

### Por qué `es` en las páginas y en el Service Worker

#### El motivo declarado

`vite.config.ts:9-12` fija el formato **por entrada** como obligatorio (documento técnico §7.5.3):

```
 * Formato POR ENTRADA (obligatorio, §7.5.3):
 *   - `es`   -> las 3 paginas HTML y el Service Worker (`type: 'module'` en el manifest).
 *   - `iife` -> `content-script.js` e `inject.js`: un content script no admite `import` y el
 *               provider se inyecta como `<script>` sincrono en `document_start`.
```

En el caso de las páginas y del Service Worker, la coherencia es doble:

- Las tres páginas son **documentos de la extensión** cargados por el navegador; sus `<script>` son `type="module"` (`src/index.html:13`, `src/connect.html:13`, `src/notification.html:13`), de modo que el formato `es` es el que corresponde a esos puntos de entrada.
- El manifest declara el Service Worker como **módulo ES**: `background: { service_worker: 'background.js', type: 'module' }` (`src/manifest.ts:61`), que es exactamente lo que produce el build 1 con `format: 'es'` (`vite.config.ts:252`).

### Por qué `iife` en `content-script` e `inject`

#### Una sola entrada por build IIFE

`vite.config.ts:20-23` explica la restricción técnica que obliga a separar los builds:

```
 *   2. `format: 'iife'` + `inlineDynamicImports: true` exigen UNA sola entrada por build (Rollup
 *      rechaza el code-splitting en IIFE), de modo que hay un build IIFE por entrada:
 *      build 1 = paginas + Service Worker (ES), build 2 = content-script (IIFE),
 *      build 3 = inject (IIFE, y es el que genera y valida `dist/manifest.json`).
```

#### Configuración IIFE autocontenida

`iifeBuildConfig()` (`vite.config.ts:153-175`) materializa esa restricción:

- `format: 'iife'` e `inlineDynamicImports: true` (líneas 168-169), lo que **prohíbe el code-splitting** y obliga a una única entrada.
- `emptyOutDir: false` (línea 161) para **conservar** lo escrito por los builds anteriores.
- `publicDir: false` (línea 157) para **no recopiar** `public/` en cada paso de la cadena (el comentario de las líneas 149-152 lo dice: «evita recopiar `public/` en cada paso»).
- `logLevel: 'warn'` (línea 158) para no inundar la salida con dos builds adicionales.

#### Por qué el content script no admite `import`

El argumento está en `vite.config.ts:11-12`: «un content script **no admite `import`** y el provider se inyecta como `<script>` sincrono en `document_start`». La segunda mitad es literal en el manifest: el content script se declara con `run_at: 'document_start'` y `all_frames: true` (`src/manifest.ts:79-80`), y el provider se publica como recurso accesible desde la web (`src/manifest.ts:83-89`).

### Las entradas HTML y la raíz del proyecto

#### `root` es la raíz del repositorio

`vite.config.ts:236-238` justifica la elección de raíz:

```ts
// La raiz es la del repositorio para que `test.html` se sirva en http://localhost:5174/test.html
// (H-33/CA-RT-09) y `public/` se copie a `dist/` sin configuracion extra.
root: rootDir,
```

Esa decisión es también la causa del apartado siguiente: si `root` es la raíz, Vite emite cada HTML **en su ruta relativa a `root`**, es decir en `dist/src/`.

## La cadena de tres builds

### Build 1: páginas y Service Worker (formato `es`)

#### Entradas y salidas

`vite.config.ts:247-254` declara el build principal: `input: PAGES_AND_SERVICE_WORKER_INPUT` y `output: { ...SHARED_OUTPUT, format: 'es' }`. El `outDir` es `dist` con `emptyOutDir: true` (líneas 243-244), de modo que **el build 1 limpia la carpeta** y los builds 2 y 3 **añaden** sin borrar.

#### Qué produce, según la evidencia

La cola de `RepoTecnico/evidencia/H6/build-windows-2026-09-12.log` lista, para el build 1: los tres HTML bajo `dist/src/`, el CSS `dist/assets/base-DuyLKVtH.css` (25,31 kB), dos *chunks* (`useBalancePolling`, `format`), los tres *bundles* de página (`connect.js` 8,00 kB; `notification.js` 29,47 kB; `index.js` 57,42 kB), el *chunk* grande `base-C7gcRKvt.js` (234,58 kB) y `background.js` (466,65 kB). El total del build 1 se cierra con «✓ built in 7.93s».

### Builds 2 y 3: `content-script` e `inject` (formato `iife`)

#### Quién los lanza

`vite.config.ts:177-193` define `contentAndInjectBuildsPlugin()`:

```ts
async closeBundle() {
  if (started) return; // un solo arranque aunque Vite invoque el hook mas de una vez
  started = true;
  await viteBuild(iifeBuildConfig(CONTENT_SCRIPT_INPUT, []));
  await viteBuild(iifeBuildConfig(INJECT_INPUT, [manifestPlugin()]));
},
```

Los tres detalles que importan:

- Se ejecuta desde el hook **`closeBundle`** del build 1, que es —según `vite.config.ts:17-19`— «el hook que el propio documento ya usa para el manifest».
- Usa la **API programática** `build as viteBuild`, importada en `vite.config.ts:30`.
- El guardia `started` (líneas 182-188) evita lanzar la cadena **más de una vez** si Vite invoca el hook repetidamente.
- El **último** build incorpora `manifestPlugin()` (línea 190), y así el plugin encuentra las **6 entradas ya en disco** (`vite.config.ts:107-108`).

### Desviaciones documentadas respecto al documento técnico

#### Las tres desviaciones

`vite.config.ts:14-28` declara **tres desviaciones** con el efecto observable invariante («el efecto observable exigido no cambia»):

| # | Qué pide §7.5.2/§7.5.3 | Por qué no se puede cumplir al pie de la letra | Solución aplicada |
|---|---|---|---|
| 1 | §7.5.3 pide «un array de dos builds» | Vite 7 **no admite** que el fichero de configuración exporte un array: «config must export or return an object» (`vite.config.ts:16-17`) | El build 2 se lanza con la API programática `build()` desde `closeBundle` del build 1 |
| 2 | Un solo build para las entradas IIFE | `format: 'iife'` + `inlineDynamicImports: true` exigen **una sola entrada por build** porque Rollup rechaza el code-splitting en IIFE (`vite.config.ts:20-23`) | Un build IIFE por entrada: 3 builds en total |
| 3 | §7.5.5 exige `dist/index.html`, `dist/connect.html` y `dist/notification.html` en la raíz de `dist/` | Vite emite los HTML en su ruta relativa a `root` y `root` **debe** ser la raíz del repositorio (por `test.html` y `public/`), así que salen en `dist/src/*.html` (`vite.config.ts:24-28`) | El plugin `htmlRootOutput` los **reubica** en la raíz de `dist/` |

#### Por qué la tercera desviación no rompe nada

El comentario de `vite.config.ts:76-79` lo explica: «Los assets se referencian con rutas absolutas (`/index.js`, `/assets/...`), de modo que el traslado no rompe ninguna referencia». Es decir, el traslado es seguro **porque** los HTML generados no usan rutas relativas.

## Opciones comunes de build

### `SHARED_OUTPUT`: nombres estables

#### Declaración

`vite.config.ts:69-74` declara la salida compartida por los tres builds: `entryFileNames: '[name].js'`, `chunkFileNames: 'chunks/[name]-[hash].js'` y `assetFileNames: 'assets/[name]-[hash][extname]'`.

#### Consecuencia

`entryFileNames: '[name].js'` es lo que garantiza que la entrada `background` se llame **`background.js`** y no `background-<hash>.js`: el manifest declarado a mano referencia nombres **fijos** (`src/manifest.ts:61`, `:78`, `:85`), así que un hash roto en el nombre de entrada rompería el paquete. Los *chunks* y los *assets* sí llevan hash (`chunks/[name]-[hash].js`, `assets/[name]-[hash][extname]`), coherente con la evidencia (`chunks/useBalancePolling-CoTqe6cK.js`, `assets/base-DuyLKVtH.css`).

### `target`, `sourcemap`, `emptyOutDir` y `publicDir`

#### Tabla

| Opción | Valor | Dónde | Por qué |
|---|---|---|---|
| `target` | `'chrome114'` | `vite.config.ts:245` | RNF-04/A2: el mínimo declarado en `src/manifest.ts:45` |
| `sourcemap` | `true` | `vite.config.ts:246` | Mapas de origen en el paquete (visibles en el log de build) |
| `emptyOutDir` | `true` (build 1) | `vite.config.ts:244` | El build 1 parte de una carpeta limpia |
| `emptyOutDir` | `false` (builds 2 y 3) | `vite.config.ts:161` | Conservar lo escrito por los builds anteriores |
| `outDir` | `'dist'` | `vite.config.ts:243` y `:160` | Es la carpeta que se carga en el navegador |
| `publicDir` | `false` (builds 2 y 3) | `vite.config.ts:157` | Evitar recopiar `public/` en cada paso |
| `logLevel` | `'warn'` (builds 2 y 3) | `vite.config.ts:158` | Silenciar la salida de los builds internos |

#### El `publicDir` del build principal

El build 1 **no** desactiva `publicDir`, así que copia `public/` a `dist/`. La evidencia lo confirma: `RepoTecnico/evidencia/H6/instalacion-2026-09-12.md:32` enumera `fonts/` e `icons/`+`brand/` entre el contenido de `dist/` al terminar. El comentario de `vite.config.ts:236-237` lo da por hecho: con `root` en la raíz del repositorio, «`public/` se copie a `dist/` sin configuracion extra».

### `htmlRootOutputPlugin`: de `dist/src/` a la raíz

#### Qué hace

`vite.config.ts:76-98` documenta e implementa el plugin: en el hook **`writeBundle`** recorre las claves del bundle, y por cada fichero que empiece por `src/` y acabe en `.html` lo **renombra** a su ruta sin el prefijo (`renameSync(resolve(outDir, fileName), resolve(outDir, target))`, líneas 86-90); después intenta `rmdirSync(resolve(outDir, 'src'))` dentro de un `try/catch` cuyo comentario aclara que el directorio ausente o no vacío **no es un error del build** (líneas 91-95). El plugin se registra con `apply: 'build'` y el nombre `truekeate-html-root-output`.

#### Por qué

`vite.config.ts:24-28` (desviación 3) lo justifica: Vite emite los HTML en `dist/src/*.html` porque `root` es la raíz del repositorio, y §7.5.5 exige que estén en la raíz de `dist/`. El plugin corre en **`writeBundle`** (después de escribir el bundle) y es **idempotente ante el fallo del `rmdir`** (el `catch` vacío está comentado y no se traga errores reales del build).

#### Efecto verificable

El contraste entre dos evidencias prueba el traslado: el log de build **muestra** `dist/src/*.html` (salida de Vite) y `RepoTecnico/evidencia/H6/instalacion-2026-09-12.md:32` **enumera el contenido final** sin ninguna carpeta `src/`. Además, el propio `manifestPlugin` falla si `index.html` no está en la raíz de `dist/` (`vite.config.ts:57-64`, `:120-125`), de modo que un fallo silencioso del traslado sería un build roto, no un paquete incompleto.

## Generación y validación del manifest

### `manifestPlugin`

#### Qué hace y cuándo

`vite.config.ts:100-146` define `manifestPlugin()`. Su docstring (líneas 100-108) enumera lo que hace y **lo que rompe el build**:

- Genera `dist/manifest.json` desde `src/manifest.ts` (fuente única tipada, RT-05).
- **Falla** si (a) falta alguna de las 6 entradas en `dist/`, (b) falta la `key` o (c) `notifications` aparece en `permissions`.
- **Bloquea** los permisos retirados en H-36: `tabs`, `activeTab` y `scripting`.
- Se registra en el **último** build de la cadena, «cuando las 6 entradas ya están en disco».

#### La escritura y el guardia

`vite.config.ts:110-118` declara el guardia `buildFailed`, que se activa en `buildEnd(error)`; si el build falló, `closeBundle` **retorna sin comprobar nada**, para que «una comprobación de manifest enmascare el error real de un build fallido» (líneas 106-107). La escritura final es `writeFileSync(..., JSON.stringify(manifest, null, 2) + '\n')` (línea 142), con el aviso por consola de la línea 143 (`[manifest] dist/manifest.json generado (version …)`).

### Validación de las seis entradas

#### `REQUIRED_ENTRIES`

`vite.config.ts:56-64` declara la lista cerrada:

```ts
const REQUIRED_ENTRIES = [
  'index.html', 'connect.html', 'notification.html',
  'background.js', 'content-script.js', 'inject.js',
] as const;
```

Y `vite.config.ts:120-125` la comprueba con `existsSync` sobre cada nombre, lanzando un error que cita el documento normativo: `[manifest] faltan entradas obligatorias en dist/: … (documento_tecnico.md §7.5.2)`.

#### La misma lista, por duplicado

La lista aparece **también** en `src/manifest/manifest.spec.ts:34-41`, con el comentario «Las 6 entradas obligatorias del paquete MV3 (§7.5.2 / §7.5.5)». No es un descuido: es la comprobación **independiente** del artefacto (ver más abajo).

### Exigencia de la `key` y permisos prohibidos

#### Las cuatro comprobaciones bloqueantes

| Comprobación | Condición que la dispara | Mensaje / referencia | Línea |
|---|---|---|---|
| Entradas presentes | Falta alguna de las 6 en `dist/` | `faltan entradas obligatorias en dist/` (§7.5.2) | `vite.config.ts:120-125` |
| `key` presente | `manifest.key` no es `string` no vacía | `falta la 'key': sin ella el ID de la extension no es estable (D-N/ADT-19)` | `vite.config.ts:126-128` |
| `notifications` fuera de `permissions` | `permissions` incluye `notifications` | `pertenece a 'optional_permissions' (ADT-30/D-P)` | `vite.config.ts:129-133` |
| Permisos retirados | `permissions` incluye `tabs`, `activeTab` o `scripting` | `permisos retirados en H-36 presentes en 'permissions'` | `vite.config.ts:134-137` |

Además hay una comprobación **no bloqueante**: si `notifications` **no** está en `optional_permissions`, se emite un **aviso** por consola (líneas 138-140) con la referencia RF-39/ADT-30.

#### El conjunto de permisos que se valida

`vite.config.ts:66-67` toma los permisos **realmente declarados** de la fuente única:

```ts
/** Permisos realmente declarados: se comprueban contra las invariantes de CA-RT-04. */
const DECLARED_PERMISSIONS: readonly string[] = manifest.permissions;
```

El valor declarado es `['storage', 'alarms', 'favicon', 'clipboardRead', 'clipboardWrite']` (`src/manifest.ts:62`), con `optional_permissions: ['notifications']` (`src/manifest.ts:63`) y los hosts locales `host_permissions: ['http://127.0.0.1:8545/*', 'http://localhost:8545/*']` (`src/manifest.ts:64`).

### Qué garantiza `src/manifest/manifest.spec.ts`

#### Dos grupos, uno de ellos opcional

`src/manifest/manifest.spec.ts` (172 líneas) se organiza en **dos grupos** (cabecera, líneas 8-13):

1. **«Manifest declarado en la fuente»** — se ejecuta **siempre**: no necesita `dist/`. Verifica el conjunto cerrado de permisos sin `notifications` (líneas 95-98), `notifications` **solo** en `optional_permissions` (líneas 100-102), la ausencia de `tabs`/`activeTab`/`scripting` en **ambos** bloques (líneas 104-109), la coherencia MV3 (service worker de tipo módulo, `default_popup: 'index.html'`, `minimum_chrome_version: '114'`; líneas 111-116), la `key` fija con `EXTENSION_ID` literal (líneas 118-123) y el content script con `run_at: document_start` más `inject.js` como recurso web con `use_dynamic_url: true` (líneas 125-134).
2. **«Artefacto `dist/`»** — necesita un `dist/` construido y se **salta con el motivo escrito** si falta `dist/manifest.json` (`describe.skipIf(!distDisponible)`, línea 141; aviso en líneas 76-79). Verifica que el manifest del artefacto es **igual** al de la fuente única (`toEqual` contra `JSON.parse(JSON.stringify(manifest))`, línea 148), que las 6 entradas existen en `dist/` (líneas 151-154), que la `key` está y `notifications` no se cuela en `permissions` (líneas 156-162) y que el conjunto de permisos es el cerrado (líneas 164-171).

#### Qué garantiza en una frase

El spec es la **doble comprobación** del contrato CA-RT-04: el build **impide** generar un paquete inválido (`manifestPlugin`), y el spec **audita** tanto la fuente como el artefacto resultante. Nada de lo que declare `src/manifest.ts` puede divergir de `dist/manifest.json` sin que la suite lo diga.

## La `key` fija y el ID estable

### `MANIFEST_KEY`

#### Qué es

`src/manifest.ts:14-22` declara y documenta la clave:

```
 * Clave publica del par de firma del desarrollador, codificada en base64 (DER/SPKI, RSA-2048).
 * Congelada a proposito (D-N / ADT-19 / CA-RT-13): fija el ID de la extension en cualquier
 * equipo e instalacion, lo que hace reproducible la allowlist CORS de Anvil (RE-04) y la suite E2E.
```

Es decir: **clave pública RSA-2048 en base64 (DER/SPKI)**, expuesta como constante `MANIFEST_KEY` (`src/manifest.ts:21-22`) y usada como `key` del manifest (`src/manifest.ts:44`).

#### Solo la clave pública

`src/manifest.ts:19` cierra la duda de seguridad: **«Solo se conserva la clave PUBLICA: la privada no forma parte del repositorio ni del paquete»**. No hay ningún fichero de clave privada en `public/` ni en `dist/`, y el ID se deriva únicamente de la pública.

### `EXTENSION_ID`: de dónde sale

#### El algoritmo

`src/manifest.ts:24-31` documenta y declara el ID:

```
 * ID estable de la extension, derivado de {@link MANIFEST_KEY}
 * (primeros 16 bytes del SHA-256 de la clave DER, con cada nibble mapeado a `a`-`p`).
```

El valor es `oiahebaliobknoeeonhgaacapjcpgblo` (`src/manifest.ts:31`). Los consumidores que cita el comentario (líneas 26-29) son: la **allowlist CORS de Anvil** (§2.1 de `entornos_globales.md`), `chrome-extension://<ID>/_favicon/` (ADT-22) y la **suite E2E**.

#### La implementación independiente en el arnés

`e2e/fixtures/extension.ts:121-139` reimplementa el mismo algoritmo para **no escribir el ID a mano nunca**:

```ts
const hash = createHash('sha256').update(Buffer.from(key, 'base64')).digest();
let id = '';
for (let i = 0; i < 16; i += 1) {
  const byte = hash[i] ?? 0;
  id += String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 0x0f));
}
return id;
```

La equivalencia con la descripción de `src/manifest.ts:25-29` es exacta: **16 bytes**, dos nibbles por byte, cada nibble mapeado a una letra entre `a` (nibble 0) y `p` (nibble 15). Que existan **dos implementaciones** (la documentada en el código y la que usa el arnés) es una garantía: si la `key` cambiara, el ID esperado cambiaría en ambos sitios de la misma forma.

### Por qué está congelada

#### Los tres consumidores del ID

| Consumidor | Por qué necesita un ID estable | Fuente |
|---|---|---|
| Allowlist CORS de Anvil | El origen `chrome-extension://<ID>` debe estar en `--allow-origin` para que el Service Worker pueda hablar con el nodo local | `src/manifest.ts:27-28`, `RepoTecnico/entornos_globales.md:59-64` |
| Suite E2E | Descubre el ID del Service Worker y abre páginas internas por URL (`extensionUrl`, `e2e/fixtures/extension.ts:169-170`); un ID cambiante rompería cualquier URL fijada | `playwright.config.ts:7-9` |
| `favicon` del origen solicitante | `chrome-extension://<ID>/_favicon/?pageUrl=…&size=32` (ADT-22) | `src/manifest.ts:28` |

#### El coste de cambiarla

`src/manifest.ts:18` lo dice sin rodeos: «si la clave cambiara, cambiaria el ID». Y con el ID cambiarían la allowlist de CORS (habría que reescribir el comando de Anvil), el `EXTENSION_ID` literal y las expectativas del arnés. `README.md:177` resume la decisión en la tabla de decisiones de diseño: «`dist/` con `key` fija ⇒ ID de extensión estable. Hace reproducible la allowlist CORS de Anvil y la propia suite E2E».

## Tamaños de ventana y activos copiados

### Los tres tamaños declarados

#### En los HTML y en los tokens

Cada página de entrada documenta su tamaño en un comentario, y los tokens de diseño lo declaran como variable CSS:

| Ventana | Tamaño declarado | Comentario del HTML | Token en `src/styles/tokens.css` |
|---|---|---|---|
| Popup (`index.html`) | **380 × 600** | `src/index.html:8` (`identidad_visual.md §5.1, P1`) | `--tk-popup-width: 380px` / `--tk-popup-height: 600px` (líneas 74-75) |
| Conexión (`connect.html`) | **420 × 650** | `src/connect.html:8` (`P2`) | `--tk-connect-width: 420px` / `--tk-connect-height: 650px` (líneas 76-77) |
| Confirmación (`notification.html`) | **420 × 640** | `src/notification.html:8` (`P3 / P-21`) | `--tk-notification-width: 420px` / `--tk-notification-height: 640px` (líneas 78-79) |

#### Dónde se aplican

`src/styles/base.css:3-4` describe el ámbito: «Estilos base de las tres ventanas de la extensión (popup 380×600, connect 420×650 y notification 420×640) y de la dApp de pruebas (`test.html`)». Las tres medidas se aplican con **media queries** de tamaño mínimo: `@media (min-width: 380px) and (min-height: 600px)` (`src/styles/base.css:356`), `@media (min-width: 420px) and (min-height: 650px)` (línea 371) y `@media (min-width: 420px) and (min-height: 640px)` (línea 386).

`README.md:57-59` y `RepoTecnico/evidencia/H6/instalacion-2026-09-12.md:48` confirman que esos son los tamaños de referencia del producto (la evidencia los remite a los tokens `--tk-popup-*`, `--tk-connect-*` y `--tk-notification-*`).

> **Matiz.** El tamaño **real de la ventana** de `connect.html` y `notification.html` lo decide el Service Worker al crearla con `chrome.windows.create`; los valores de `tokens.css` y los comentarios de los HTML son la **referencia de diseño**. La comprobación del tamaño efectivo en el arnés *no está documentada en los ficheros leídos* — **pendiente de confirmar**.

### `public/` copiado a `dist/`

#### Contenido real de `public/`

| Ruta | Contenido | Uso declarado |
|---|---|---|
| `public/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png` | Iconos de la extensión | `manifest.icons` y `action.default_icon` (`src/manifest.ts:46-59`); declarados en `RepoTecnico/entornos_globales.md:44` |
| `public/brand/truekeate-logo.{svg,png,ico}`, `truekeate-titulo.{svg,png}`, `truekeate-mark-96.png` | Activos de marca | `RepoTecnico/entornos_globales.md:42-43` y `:404-405` |
| `public/fonts/poppins-latin-{400,600,700}.woff2`, `inter-latin.woff2`, `jetbrains-mono-latin.woff2` | Tipografías auto-hospedadas | `RepoTecnico/entornos_globales.md:47` |
| `public/fonts/LICENSE-{poppins,inter,jetbrains-mono}.txt` | Licencias OFL-1.1 de las fuentes | `RepoTecnico/entornos_globales.md:47` y `README.md:189` |

El favicon de las tres páginas se declara con una ruta relativa a `public/`: `<link rel="icon" href="brand/truekeate-logo.ico" />` (`src/index.html:9`, `src/connect.html:9`, `src/notification.html:9`).

#### Cómo llega a `dist/`

Lo copia Vite en el **build 1** (el único con `publicDir` activo, `vite.config.ts:238` con `root` en la raíz). Los builds 2 y 3 lo desactivan (`vite.config.ts:157`) para no repetir la copia. La evidencia `RepoTecnico/evidencia/H6/instalacion-2026-09-12.md:32` confirma que `fonts/` e `icons/`+`brand/` están en `dist/` al terminar.

#### Cuántos ficheros revisa el lint en `dist/`

`scripts/lint-prohibited.mjs:33` solo revisa extensiones de texto (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css`, `.html`, `.json`). Por eso la evidencia de H6 (`RepoTecnico/evidencia/H6/lint-prohibited-2026-09-12.log`) informa de **«dist/: 14 ficheros revisados»** mientras el contenido total de `dist/` es de **16 ficheros** (`RepoTecnico/evidencia/H6/instalacion-2026-09-12.md:32`): los `.woff2` y los `.png` quedan fuera del recuento por su extensión, no por exclusión expresa.

## Tabla final: qué hay en `dist/` y quién lo carga

### Inventario de `dist/`

#### Ruta → entrada de origen → formato → quién la carga

| Ruta en `dist/` | Entrada de origen | Formato | Quién la carga |
|---|---|---|---|
| `manifest.json` | Generado por `manifestPlugin` desde `src/manifest.ts` | JSON (2 espacios + `\n`) | El navegador, al cargar la carpeta descomprimida |
| `index.html` | `src/index.html` | `es` | El navegador como **popup**, vía `action.default_popup` (`src/manifest.ts:53`) |
| `connect.html` | `src/connect.html` | `es` | `chrome.windows.create` del Service Worker (ventana de conexión) |
| `notification.html` | `src/notification.html` | `es` | `chrome.windows.create` del Service Worker (ventana única de decisión) |
| `background.js` | `src/background.ts` | `es` (módulo) | El navegador, vía `background.service_worker` con `type: 'module'` (`src/manifest.ts:61`) |
| `content-script.js` | `src/content-script.ts` | `iife` | El navegador, vía `content_scripts[0].js` con `run_at: document_start` (`src/manifest.ts:78-79`) |
| `inject.js` | `src/inject/index.ts` | `iife` | **Inyectado** en el mundo de la página por el content script; declarado en `web_accessible_resources` (`src/manifest.ts:83-88`) |
| `index.js` | Entrada `index` | `es` (bundle de página) | `index.html` como `<script type="module">` |
| `connect.js` | Entrada `connect` | `es` (bundle de página) | `connect.html` |
| `notification.js` | Entrada `notification` | `es` (bundle de página) | `notification.html` |
| `chunks/*.js` | *Chunks* compartidos (`base`, `format`, `useBalancePolling`, …) | `es` | Importados por los bundles de página |
| `assets/*.css` | CSS agregado (`base-<hash>.css`) | — | Referenciado por los HTML |
| `*.js.map` | Mapas de origen (`sourcemap: true`) | — | Herramientas de depuración del navegador |
| `icons/*.png` | `public/icons/` | — | `manifest.icons` y `action.default_icon` |
| `brand/*`, `fonts/*` | `public/brand/`, `public/fonts/` | — | HTML/CSS del paquete (rutas relativas y `/fonts/...`) |

> La `key` dentro de `manifest.json` es `MANIFEST_KEY` (`src/manifest.ts:21-22`) y es lo que hace que el navegador derive **siempre el mismo ID** (`src/manifest.ts:31`); la fila de `manifest.json` de la tabla es, por tanto, la que transporta esa garantía.

#### Contrastado con la evidencia

Los nombres de los *bundles* y su tamaño aparecen literalmente en `RepoTecnico/evidencia/H6/build-windows-2026-09-12.log`: `dist/index.js` (57,42 kB), `dist/connect.js` (8,00 kB), `dist/notification.js` (29,47 kB), `dist/background.js` (466,65 kB), `dist/chunks/base-C7gcRKvt.js` (234,58 kB), `dist/chunks/format-C7P6YKvF.js`, `dist/chunks/useBalancePolling-CoTqe6cK.js` y `dist/assets/base-DuyLKVtH.css` (25,31 kB). El recuento de 16 ficheros y la lista de bloques (`chunks/`, `assets/`, `fonts/`, `icons/`+`brand/`) están en `RepoTecnico/evidencia/H6/instalacion-2026-09-12.md:32`.

### Comprobaciones manuales después de un build

#### Qué mirar

1. **Las 6 entradas están**: `dist/index.html`, `dist/connect.html`, `dist/notification.html`, `dist/background.js`, `dist/content-script.js`, `dist/inject.js` (lista exacta en `vite.config.ts:57-64`). Si falta alguna, el build **habrá fallado** con el mensaje del `manifestPlugin`, no habrá terminado en verde.
2. **`manifest.json` existe y declara la `key`**: sin ella el plugin habría lanzado (`vite.config.ts:126-128`).
3. **No hay carpeta `dist/src/`**: el `htmlRootOutputPlugin` la elimina; si quedara, el manifest no encontraría `index.html` en la raíz y el build sería incoherente (el plugin ya habría fallado).
4. **La extensión carga sin errores**: pasos en `README.md:69-74` (ver el manual `01-entornos-y-comandos.md`, sección de carga de `dist/`).

#### Qué NO hay que hacer

No hay que escribir `manifest.json` a mano: la cabecera de `src/manifest.ts:1-10` lo prohíbe explícitamente («El manifest NO se escribe a mano en JSON: lo genera el plugin `closeBundle` de vite.config.ts a partir de este modulo»), y el grupo 2 de `src/manifest/manifest.spec.ts` lo verifica con una comparación profunda (`src/manifest/manifest.spec.ts:148`). Cualquier edición manual de `dist/manifest.json` se pierde en el siguiente `npm run build` y, mientras tanto, hace que la suite falle.
