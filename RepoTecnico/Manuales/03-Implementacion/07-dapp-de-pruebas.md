# 07 — dApp de pruebas y contrato auxiliar

Propósito: documentar, con referencias `ruta:línea` verificadas contra el código real, **la dApp de
pruebas `test.html`** (estructura, descubrimiento del provider, inventario real de controles y
flujos EIP-1193, eventos y formularios) y el **proyecto Foundry `contracts/`** (contrato verificador
EIP-712, fixtures, tests y relación con la wallet).

> Nota de método: cada cita `ruta:línea` fue leída en el fichero antes de escribirse. Lo no
> verificable se marca literalmente como «pendiente de confirmar». No se inventan botones, métodos
> ni direcciones de contrato. El encargo describe `test.html` con **904 líneas**; el fichero real
> tiene **990** (`test.html:1-990`) y este manual usa la numeración real.

---

## La dApp de pruebas `test.html`

### Estructura real del fichero (990 líneas)

#### Mapa de bloques, paneles y estilos

| Bloque | Líneas | Contenido |
|---|---|---|
| Cabecera | `test.html:1-8` | `doctype`, `<html lang="es">`, `charset`, `viewport`, `color-scheme`, `<title>` |
| Estilos | `test.html:9-339` | Un único `<style>` con los tokens de marca y todas las clases |
| Cuerpo (HTML) | `test.html:341-442` | `<header>` de marca y `<main>` con 4 paneles |
| Script | `test.html:444-988` | Un único `<script>` con una IIFE en modo estricto (`test.html:445-446`) |
| Cierre | `test.html:989-990` | `</body>` y `</html>` |

El título es `TrueKeate Wallet — dApp de pruebas` (`test.html:7`) y el favicon apunta a
`brand/truekeate-logo.ico` (`test.html:8`). Un comentario fija su servicio: «dApp de pruebas
autocontenida: se sirve en http://localhost:5174/test.html» (`test.html:342`). Los paneles son: el
encabezado de marca con el lema `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS`
(`test.html:349-362`, lema en `:360`); el encabezado «Flujos de la dApp» con el plazo de 5000 ms
(`test.html:365-374`); el **flujo 1** con estado, detalle, botones y lista EIP-6963
(`test.html:375-387`); los **flujos 2 a 7** con seis botones, el campo `red-destino` y
`#resultados` (`test.html:389-406`); la **tabla de errores** `4001`/`4900`/`4901`
(`test.html:408-436`); y el **historial** `<pre class="log" id="registro" role="status">`
(`test.html:438-441`).

Los estilos repiten los tokens medidos porque la página vive fuera de `src/` y se sirve suelta
(`test.html:10-12`): tokens en `:root` (`test.html:13-41`, con el degradado `--tk-grad-brand` en
`:26-34`). Gobiernan el comportamiento observable `.estado`/`.estado--ok` con el punto verde o rojo
(`test.html:90-107`), los tres estados de fila `.resultado--ok`/`--error`/`--pendiente`
(`test.html:247-257`), sus partes `.resultado__tiempo`/`__cuerpo`/`__accion` (`test.html:259-282`),
`.campo` (`test.html:284-305`), `table.errores` (`test.html:307-325`) y `.log` (`test.html:327-338`).

#### Bloques del script

| Zona | Líneas | Contenido |
|---|---|---|
| Constantes de plazo | `test.html:454`, `:462` | `LIMITE_MS = 5000` y `AVISO_EN_CURSO_MS = LIMITE_MS - 1500` |
| Estado | `test.html:464-466` | `lineas` (historial), `cuentas`, `seleccionada` |
| Utilidades de pintado | `test.html:468-516` | `anotar`, `textoEstado`, `mostrarDetalle`, `proveedor`, `describirProvider`, `json` |
| Catálogo de errores | `test.html:522-541` | `accionPara(code)` y `describirError(error)` |
| Filas de resultado | `test.html:544-607` | `fila(id, titulo)` y `pintarFila(item, estado, cuerpo, ms, code)` |
| Ejecutor de flujos | `test.html:620-692` | `ejecutar(id, titulo, fabrica, opciones)` con temporizador y `data-ms` |
| Flujo 1 · detectar | `test.html:701-743` | `detectar()` con reintento acotado a 4 s |
| Flujo 1.b · EIP-6963 | `test.html:747-774` | `anuncios()`, `pintarAnuncios()`, `pedirAnuncios()` |
| Flujos 2 a 7 | `test.html:777-960` | `conectar` (`:777-790`), `formatearEth`+`consultarSaldo` (`:793-832`), `DESTINO`+`enviar` (`:836-866`), `firmarEip712` (`:869-896`), `cambiarRed` (`:899-914`), `escucharEventos` (`:917-960`) |
| Arranque | `test.html:962-987` | Listener EIP-6963, los 8 `addEventListener` y la ejecución inicial |

### Descubrimiento del provider

#### La detección usa `window.truekeate`, no EIP-6963

`proveedor()` (`test.html:494-498`) comprueba **exclusivamente** `window.truekeate`:
`typeof window.truekeate === 'object' && window.truekeate !== null`. Conclusión verificada: **todos**
los flujos EIP-1193 se envían a `window.truekeate` (`test.html:782`, `810`, `826`, `843`, `852`,
`889`, `907`, `943-946`). El provider recibido por EIP-6963 **nunca** se usa para invocar métodos:
el anuncio solo se colecciona y se pinta (`test.html:964-975`, `test.html:754-767`), con la lista en
`window.__tkEip6963` (`test.html:747-752`). El provider real lo publica la extensión con dos
`Object.defineProperty` sobre las claves de `src/shared/constants.ts:216-217` (`truekeate` y su
alias `codecrypto`) con descriptor **no configurable** (`src/inject/index.ts:212-220`); que el alias
sea el **mismo objeto** es lo que la página comprueba en `test.html:711`.

#### EIP-6963: solo anuncio, con `eip6963:requestProvider`

- El listener `eip6963:announceProvider` se registra **antes** de pedir el anuncio
  (`test.html:963-975`; el comentario lo declara en `:963`).
- `pedirAnuncios()` emite `window.dispatchEvent(new Event('eip6963:requestProvider'))` (`:771`) y
  lo anota con su tiempo (`:772-773`); al cargar se ejecutan `detectar()` y `pedirAnuncios()`
  (`test.html:985-986`).
- El anuncio se pinta como `name · rdns · uuid` (`test.html:764-766`); sin anuncios el literal es
  `EIP-6963: sin anuncios todavía.` (`test.html:761`, texto inicial en `:386`).

#### Mensajes cuando el provider no está

| Situación | Literal pintado | Cita |
|---|---|---|
| Detección fallida (flujo 1) | `no se ha detectado el provider (¿está cargada la extensión?)` | `test.html:733` |
| Instrucción añadida al detalle | `Carga dist/ en chrome://extensions, recarga esta página y vuelve a intentarlo.` | `test.html:734-735` |
| Cualquier flujo sin provider | `No hay provider: carga dist/ en chrome://extensions.` | `test.html:625`, `:921` |

El reintento está acotado: si han pasado menos de 4000 ms desde el primer intento se reprograma
`detectar` cada 100 ms (`test.html:736-739`), con `intentosDeteccion` e `inicioDeteccionGlobal` en
`test.html:701-704`.

#### Criterio de «provider detectado»

Cuatro estados (`test.html:726-733`): (1) `truekeate !== null && mismoObjeto && noConfigurable` →
`provider detectado: TrueKeate` (verde); (2) con alias sin congelar → `provider detectado, pero el
alias no está congelado`; (3) alias apuntando a otro objeto → `el alias window.codecrypto no apunta
al mismo objeto`; (4) `null` → el mensaje de ausencia. El detalle visible (`test.html:720-724`)
publica la igualdad `truekeate === codecrypto`, `propiedad no configurable`, `isTrueKeate` y
`describirProvider()` — que enumera cuáles de `request`, `on` y `removeListener` existen
(`test.html:500-508`) —; el historial anota además el estado de ambas claves y el número de intento
(`test.html:715-718`).

### Inventario de controles y flujos reales

#### Controles de la página

Cruce de `id="` (`test.html:376-440`), `request(` (`test.html:782-907`) y los `addEventListener` de
arranque (`test.html:977-984`). Todas las líneas de la primera columna son de `test.html`:

| Control | Texto visible | Línea | Ejecuta | Método(s) EIP-1193 reales |
|---|---|---|---|---|
| `btn-detectar` | Volver a detectar | `:383` | `detectar` (`:977`) | Ninguno (introspección de `window`) |
| `btn-eip6963` | Anunciar por EIP-6963 | `:384` | `pedirAnuncios` (`:978`) | Ninguno (`dispatchEvent`) |
| `btn-conectar` | Conectar (eth_requestAccounts) | `:392` | `conectar` (`:979`) | `eth_requestAccounts` (`:782`) |
| `btn-saldo` | Consultar saldo (eth_getBalance) | `:393` | `consultarSaldo` (`:980`) | `eth_accounts` (`:810`) + `eth_getBalance` (`:826`) |
| `btn-enviar` | Enviar transacción (eth_sendTransaction) | `:394` | `enviar` (`:981`) | `eth_accounts` (`:843`) + `eth_sendTransaction` (`:852-861`) |
| `btn-eip712` | Firmar EIP-712 (eth_signTypedData_v4) | `:395` | `firmarEip712` (`:982`) | `eth_signTypedData_v4` (`:889-892`) |
| `btn-cambiar-red` | Cambiar de red (wallet_switchEthereumChain) | `:396` | `cambiarRed` (`:983`) | `wallet_switchEthereumChain` (`:907`) |
| `btn-eventos` | Escuchar eventos (accountsChanged, chainChanged) | `:397-399` | `escucharEventos` (`:984`) | Ninguno: `provider.on(...)` ×4 (`:943-946`) |
| `red-destino` (input) | chainId de destino para el cambio de red | `:403` | Lo lee `cambiarRed` (`:900-901`) | — |

Salidas: `#estado`/`#estado-texto` (`:377-379`), `#detalle` (`:381`), `#eip6963-lista` (`:386`),
`#resultados` (`:405`), `#errores-cuerpo` (`:418`), `#registro` (`:440`). Las filas se crean con
`fila()` (`:544-581`) y sus ids reales son `resultado-conectar` (`:779`), `resultado-saldo` (`:806`),
`resultado-enviar` (`:840`), `resultado-eip712` (`:871`), `resultado-cambiar-red` (`:903`) y
`resultado-eventos` (`:918`).

#### Cómo se pinta el resultado y el error

`ejecutar()` (`test.html:620-692`) es el envoltorio común: (1) sin provider pinta `error` inmediato
(`:624-627`); (2) con la opción `pendiente` pinta ya `Solicitud enviada a la ventana de
confirmación; esperando la decisión del usuario…` (`:632-641`); (3) programa un aviso a los 3500 ms
(`AVISO_EN_CURSO_MS`, `:462`) con `La operación sigue en curso: no ha respondido en 5000 ms. …`
(`:643-656`); (4) al resolver pinta `ok` con el JSON del valor o `error` con `describirError`, y
escribe en el historial (`:673-690`); (5) publica `data-ms`, `data-ms-final` y `data-code` en la
fila (`:587`, `:634`, `:678`, `:687`), que es lo que consume el E2E.

**Sí pinta `code` y `message`.** `describirError()` (`test.html:535-541`) devuelve
`Error <code>: <message>` y, si existe, añade `error.data` en JSON. `accionPara(code)` (`:522-532`)
traduce el código a una acción y `pintarFila` la antepone con el literal `Acción sugerida: `
(`:599-601`). Hay acción explícita para `4001`, `4100`, `4200`, `4900`, `4901`, `-32602`, `-32000`
y `-32603`; cualquier otro cae en `Reintentar la operación` (`:531`). La tabla estática del panel
documenta solo `4001`, `4900` y `4901` (`test.html:419-434`).

#### Flujo 1 · Detectar el provider

Métodos EIP-1193: ninguno. Pinta el estado (`test.html:741`), el detalle y cuatro líneas de
historial (`:715-718`), más el tiempo del flujo (`:742`). La ausencia de provider se pinta como
estado no-ok con punto rojo (`:98-103`), no como error EIP-1193.

#### Flujo 1.b · Anunciar por EIP-6963

Métodos EIP-1193: ninguno. Parámetro real: `new Event('eip6963:requestProvider')` sin `detail`
(`test.html:771`). Pinta el texto de `#eip6963-lista` (`:754-767`) y una línea de historial con el
tiempo del `dispatchEvent` (`:772-773`).

#### Flujo 2 · `eth_requestAccounts`

Método `eth_requestAccounts` sin `params` (`test.html:782`). Guarda el array en `cuentas` y la
primera dirección en `seleccionada` (`:783-785`); pinta el JSON del array (`:679`). Lleva
`pendiente: true` (`:788`), de modo que un `4001` de rechazo se pinta con código y acción (el E2E lo
comprueba en `e2e/22-dapp.spec.ts:321-325`). Etiqueta de historial: `eth_requestAccounts` (`:788`).

#### Flujo 3 · `eth_getBalance` (con `eth_accounts` previo)

`eth_accounts` **solo si** `seleccionada === null` (`test.html:808-815`; el comentario aclara que no
abre ventana, `:809`), y después `eth_getBalance` con `params: [cuenta, 'latest']` (`:826`). No
pinta el JSON crudo sino `'Cuenta ' + cuenta + '\nSaldo ' + wei + ' (' + formatearEth(wei) + ')'`
(`:828`). Sin cuenta autorizada lanza un error propio con `{ code: 4100 }` y `No hay ninguna cuenta
autorizada: usa antes «Conectar».` (`:817-822`). Va **sin** `pendiente` para que el `4900` real del
nodo caído llegue cuando llegue (`:823-824`); el E2E mide ese `4900` en
`e2e/22-dapp.spec.ts:362-369`.

#### Flujo 4 · `eth_sendTransaction` (envío simple)

`eth_accounts` primero (`test.html:843`) y después `eth_sendTransaction` (`:852-861`):

| Campo | Valor real | Cita |
|---|---|---|
| `from` | `seleccionada` (primera cuenta autorizada) | `test.html:856` |
| `to` | `DESTINO` = `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (cuenta 1 de Anvil, `:835`) | `test.html:857`, `:836` |
| `value` | `'0x2386F26FC10000'` (= 10 000 000 000 000 000 wei = 0,01 ETH) | `test.html:858` |

Es un **envío simple** (transferencia de valor, sin `data`), no una llamada a contrato. Pinta el
JSON del hash (`:679`); el E2E exige `/^0x[0-9a-f]{64}$/` (`e2e/22-dapp.spec.ts:180`). Lleva
`pendiente: true` (`:864`) y `4100` propio si no hay cuenta (`:846-851`).

#### Flujo 5 · `eth_signTypedData_v4` (EIP-712)

Método `eth_signTypedData_v4` con `params: [from, JSON.stringify(typedData)]` (`test.html:889-892`):
el typed data viaja **serializado como cadena** en la posición 1.

| Campo | Valor real | Cita |
|---|---|---|
| `domain.name` · `version` · `chainId` | `'TrueKeate'` · `'1'` · `31337` (número, no hex) | `test.html:875` |
| `types.SignMessage` | `account: address`, `message: string` | `test.html:877-881` |
| `primaryType` | `'SignMessage'` | `test.html:882` |
| `message.account` | `seleccionada \|\| DESTINO` | `test.html:884` |
| `message.message` | `'Firma de prueba de la dApp de TrueKeate'` | `test.html:885` |
| `from` (argumento 0) | `seleccionada \|\| DESTINO` | `test.html:888` |

Pinta el JSON de la firma; el E2E exige `/^0x[0-9a-f]{130}$/` (`e2e/22-dapp.spec.ts:246-248`).
Lleva `pendiente: true` (`:894`) y el rechazo deja `4001` con acción
(`e2e/22-dapp.spec.ts:432-437`).

> **Hallazgo verificado (dominio distinto).** La dApp firma el dominio
> `{ name: 'TrueKeate', version: '1', chainId: 31337 }` **sin `verifyingContract`**
> (`test.html:875`) y el tipo `SignMessage(address account, string message)` (`:877-881`). Los
> fixtures y tests Forge usan **otro** dominio (`TrueKeate Test App` con `verifyingContract`) y
> **otro** tipo (`SignMessage(string content, uint256 nonce, uint256 deadline)`,
> `contracts/test/fixtures/eip712-signature.json:4-31`). No hay correspondencia: **el flujo 5 de la
> dApp no es el que verifica el contrato**.

#### Flujo 6 · `wallet_switchEthereumChain`

Método `wallet_switchEthereumChain` con `params: [{ chainId: chainId }]` (`test.html:907`). El
`chainId` se lee del input `#red-destino` (`:900-901`), cuyo valor inicial es `0x7a6a` (`:403`) —
31338, el Anvil secundario (`e2e/fixtures/extension.ts:1109-1115`) —, con respaldo `'0x7a6a'` si
faltara (`:901`). Pinta `'wallet_switchEthereumChain(' + chainId + ') → ' + json(resultado)`
(`:908-910`). Lleva `pendiente: true` (`:912`); el `4901` de una red no dada de alta se pinta con su
acción y el E2E lo comprueba rellenando el campo con `0x89` (`e2e/22-dapp.spec.ts:328-335`).

#### Flujo 7 · Escuchar eventos

No invoca métodos de petición: usa `provider.on` cuatro veces (`test.html:943-946`). La fila lleva
`data-suscrito`; si ya está a `'true'` responde `La suscripción ya estaba activa; se mantiene.` sin
volver a suscribirse (`:925-929`). Pinta `Suscripción activa a accountsChanged y chainChanged. Los
eventos recibidos se añaden al historial de la página.` (`:949-955`) más una línea de historial
(`:956`), con `try`/`catch` y `describirError` alrededor de las cuatro suscripciones (`:957-959`).

#### Flujos que NO existen en `test.html`

Verificado por búsqueda literal: **no aparecen** como `provider.request({ method: … })` ni como
controles. Se listan para que no se supongan:

| Flujo esperado | Estado real | Evidencia |
|---|---|---|
| `eth_accounts` | **Sí existe, como paso interno** de los flujos 3 y 4, sin botón propio | `test.html:810`, `:843` |
| `eth_chainId` | **NO existe** ninguna llamada | Sin coincidencias en el fichero |
| `personal_sign` | **NO existe** | Solo como texto de acción del código `4200` (`test.html:525`) |
| `wallet_addEthereumChain` | **NO existe** ninguna llamada | Solo en la tabla de errores (`:432`) y en `accionPara` (`:527`) |
| `wallet_watchAsset` | **NO existe** | Sin coincidencias en el fichero |
| `eth_getTransactionReceipt` / seguimiento | **NO existe**: el flujo 4 devuelve el hash y no hace seguimiento | `test.html:852-861` |
| `eth_call` | **NO existe** | Sin coincidencias en el fichero |
| `eth_estimateGas` | **NO existe** en la página: lo hace el SW antes de la ventana | `src/background/approvals/dispatch.ts:774-785` |
| `eth_blockNumber` | **NO existe** | Sin coincidencias en el fichero |

El encabezado de la página declara su alcance: «Siete flujos operativos: detectar el provider,
conectar, consultar saldo, enviar una transacción, firmar datos EIP-712, cambiar de red y escuchar
eventos» (`test.html:368-369`).

### Eventos

#### Suscripción real: cuatro de los cinco

`escucharEventos()` se suscribe a **cuatro** eventos (`test.html:943-946`): `accountsChanged`
(`:943` → `alCambiarCuentas`, `:930-932`), `chainChanged` (`:944` → `alCambiarRed`, `:933-935`),
`connect` (`:945` → `alConectar`, `:936-938`) y `disconnect` (`:946` → `alDesconectar`,
`:939-941`). Los cuatro manejadores **solo escriben en el historial** (`evento <nombre> → <json>`);
no tocan filas ni estado. El texto de éxito menciona solo dos eventos (`:952-953`), igual que el
propio botón (`:398`), aunque el código se suscriba a cuatro.

#### El quinto evento: `message`

`message` **existe en el Service Worker** (`src/background/events.ts:194-195`, `emitMessage`), pero
su propio comentario declara que «**NO** se emite en H3 (no hay ningún método que lo produzca)»
(`src/background/events.ts:191-193`). La dApp **no se suscribe** y ningún flujo lo dispara: la
escucha es **4 de 5**. Los eventos llegan por el canal del provider: el content script reenvía el
sobre `TRUEKEATE_EVENT` y `src/inject/index.ts:201-208` lo emite con `emit(eventName,
message.data)`; `chainChanged` viaja **sin envoltorio** (el `data` es el `chainId` hexadecimal,
`src/background/events.ts:173-188`).

### Formularios y validación en la dApp

#### Inputs reales: solo uno

La página tiene **un único control de entrada**: `#red-destino`, tipo `text`, con `value="0x7a6a"`,
`autocomplete="off"` y `spellcheck="false"` (`test.html:401-404`), etiquetado `chainId de destino
para el cambio de red` (`:402`). **No existen** campos de dirección destino, importe, mensaje a
firmar ni JSON EIP-712; esos datos son constantes del script: la dirección destino es `DESTINO`
(`test.html:836`), el importe un literal hexadecimal en `params[0].value` (`:858`), el mensaje un
literal en `typedData.message.message` (`:885`), el JSON EIP-712 un objeto literal (`:874-887`) y la
cuenta `from` el valor `seleccionada` (`:784`, `:845`).

#### Construcción del `value` en wei

**No se usa `parseEther`** ni `ethers`: `test.html` no importa ninguna biblioteca (no hay `import`,
ni `<script src>`, ni `require`). El importe se envía ya en wei como literal hexadecimal,
`'0x2386F26FC10000'` (`test.html:858`). La única aritmética de wei es de **presentación**:
`formatearEth(weiHex)` (`:793-803`) convierte con `BigInt`, calcula `10n ** 18n`, toma el resto, lo
rellena a 18 dígitos con `padStart` y muestra los **4 primeros decimales** (`:796-799`) con el
formato `<entero>,<4 decimales> ETH` (`:799`); si el valor no es convertible devuelve `no se pudo
formatear el saldo` (`:800-802`).

#### El `chainId` que usa la página

| Uso | Valor | Cita |
|---|---|---|
| `domain.chainId` del typed data EIP-712 | `31337` (número decimal) | `test.html:875` |
| Red de destino del cambio de red | `0x7a6a` por defecto, editable en el formulario | `test.html:403`, `:901` |
| Cualquier otra lectura de red | No hay: la página **no llama** a `eth_chainId` | — |

El `31337` coincide con el Anvil principal (`RepoTecnico/entornos_globales.md:63-64`) y con los
fixtures Forge (`contracts/test/fixtures/eip712-signature.json:7`), pero el **dominio** no (véase el
hallazgo del flujo 5).

### Contrato de prueba desde la dApp

**La dApp no despliega ni llama a ningún contrato.** Verificado en el fichero: no hay `eth_call` ni
`eth_sendTransaction` con campo `data`; no aparece ninguna dirección de `contracts/` — la única
dirección literal es `DESTINO = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (`test.html:836`), que
es una **cuenta** de Anvil usada como destinatario de una transferencia simple —; no hay ABI ni
artefacto JSON; y `verifyingContract` no aparece en el typed data (`:875`). Conclusión: **la dApp y
`contracts/` no se comunican**; el contrato es un instrumento off-line que verifica firmas
producidas por M11 contra fixtures versionados.

---

## El proyecto Foundry `contracts/`

### Árbol real de `contracts/`

Obtenido con `glob` sobre `contracts/**/*`. Ficheros **propios** (excluidos `lib/forge-std/**`,
dependencia vendorizada, y los artefactos `out/**` y `cache/`):

| Fichero | Líneas | Papel |
|---|---|---|
| `contracts/foundry.toml` | 15 | Configuración de Foundry |
| `contracts/src/EIP712Verifier.sol` | 160 | Contrato verificador EIP-712 |
| `contracts/test/EIP712Verifier.t.sol` | 435 | Los 5 casos obligatorios + dominio + wallet |
| `contracts/test/EIP712VerifierFase4.t.sol` | 841 | Batería adversaria de Fase 4 |
| `contracts/test/fixtures/eip712-signature.json` | 51 | Fixture generado con `cast` |
| `contracts/test/fixtures/eip712-wallet-signature.json` | 42 | Fixture producido por la wallet |
| `contracts/scripts/generar-fixture-wallet.mjs` | script Node | Regenerador del fixture de la wallet |
| `contracts/scripts/typed-data-wallet.json` | typed data | Entrada de `cast wallet sign` |
| `contracts/README.md` | 201 | Documentación del instrumento |
| `contracts/.gitignore` | — | Exclusiones locales |

`contracts/lib/forge-std/**` es `forge-std` v1.16.2 vendorizada con
`forge install foundry-rs/forge-std --no-git` (`contracts/README.md:68-73`).

### `contracts/foundry.toml`

| Clave | Valor real | Cita |
|---|---|---|
| `solc` | `"0.8.24"` (fijado, no rango: reproducibilidad RNF-24) | `contracts/foundry.toml:6` |
| `evm_version` | `"cancun"` | `contracts/foundry.toml:7` |
| `optimizer` | `false` | `contracts/foundry.toml:8` |
| `src` / `test` / `out` / `libs` | `"src"`, `"test"`, `"out"`, `["lib"]` | `contracts/foundry.toml:9-12` |
| `fs_permissions` | `[{ access = "read", path = "./test/fixtures" }]` | `contracts/foundry.toml:14` |
| `verbosity` | `2` | `contracts/foundry.toml:15` |

La cabecera sitúa el proyecto: «Configuración de Foundry para el instrumento de prueba RT-11
(contrato verificador EIP-712). No forma parte del producto» (`contracts/foundry.toml:1-2`). El
permiso de lectura es explícito porque el fixture se lee con `vm.readFile` (`:13`).

### `contracts/src/EIP712Verifier.sol`

#### Propósito, licencia y versión de solc

| Aspecto | Valor real | Cita |
|---|---|---|
| SPDX | `MIT` | `contracts/src/EIP712Verifier.sol:1` |
| `pragma` | `solidity 0.8.24` (exacto) | `contracts/src/EIP712Verifier.sol:2` |
| Contrato | `contract EIP712Verifier` | `contracts/src/EIP712Verifier.sol:24` |
| Naturaleza | Instrumento RT-11 / P-07: **no** es producto, sin estado, no custodia fondos | `contracts/src/EIP712Verifier.sol:4-7` |
| API principal | `verify(address signer, bytes32 digest, bytes calldata signature) external view returns (bool)` | `contracts/src/EIP712Verifier.sol:39-45` |

Es **sin estado** (solo constantes): `DOMAIN_TYPEHASH` (`:27-28`) y `_SECP256K1N_HALF` (`:31-32`).
`recover` replica las guardas de `ECDSA.recover` (longitud 65, `v ∈ {27,28}`, `s` bajo EIP-2,
`r`/`s` no nulos, dirección no nula) y **nunca revierte** (`:95-130`); el precompilado se invoca con
`staticcall` desde `assembly` (`:136-151`). Declara `view` y no `pure`, con la desviación
documentada en el propio código: solc 0.8.24 prohíbe cualquier lectura de entorno —incluido el
`staticcall` a `ecrecover`— dentro de una función `pure` (`:17-23`).

#### El `domain` y los `types` reales

El contrato **no fija valores de dominio**: calcula el separador desde los cuatro campos que recibe
y verifica un `digest` ya calculado.

| Elemento | Valor / forma real | Cita |
|---|---|---|
| Typehash del dominio | `keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")` = `0x8b73c3c6…b39400f` | `EIP712Verifier.sol:25-28` |
| `domainSeparator(name, version, chainId, verifyingContract)` | `keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(name), keccak256(version), chainId, verifyingContract))` | `EIP712Verifier.sol:51-66` |
| Sobrecarga con struct | `domainSeparator(EIP712Domain)` delega en la anterior | `EIP712Verifier.sol:68-73` |
| Struct de dominio | `{ string name; string version; uint256 chainId; address verifyingContract; }` | `EIP712Verifier.sol:154-160` |
| `hashTypedData(separator, structHash)` | `keccak256(hex"1901" ‖ separator ‖ structHash)` | `EIP712Verifier.sol:75-78` |
| `verifyTypedData(signer, separator, structHash, signature)` | recompone el digest y verifica | `EIP712Verifier.sol:80-93` |
| Tipo firmado del fixture | `SignMessage(string content,uint256 nonce,uint256 deadline)`; typehash `0xdd8b5ee9…3af6dc` | `contracts/test/EIP712Verifier.t.sol:27-29` |

(Las citas `EIP712Verifier.sol` son de `contracts/src/EIP712Verifier.sol`.) El contrato **no conoce**
el tipo `SignMessage`: lo aporta el llamador. El typehash del dominio está en
`contracts/test/fixtures/eip712-signature.json:37` y el de `SignMessage` en `:38`.

#### Correspondencia con lo que firma la wallet (`src/background/crypto/sign.ts`)

Está declarada en el código de la wallet: «**`eth_signTypedData_v4` (EIP-712)** — firma
`domain`/`types`/`message` … Devuelve además el `digest`, que es lo que consume
`EIP712Verifier.verify(signer, digest, signature)` (§5.4 / RT-11)»
(`src/background/crypto/sign.ts:18-21`), campo documentado como «`TypedDataEncoder.hash(domain,
types, message)`: el `digest` que recibe el contrato» (`:515-516`). El cálculo real es
`digest = TypedDataEncoder.hash(input.domain, cleanTypes, input.message)` y
`signature = await wallet.signTypedData(...)` (`:592-593`), devueltos en `:601-608`; la firma es
`0x` + 130 hex (`:512`), exactamente lo que exige `bytes signature`. La vuelta existe también:
`recoverTypedDataSigner` (`:619-628`) y `typedDataDigest` (`:631-635`). **Quién produce y quién
verifica:** la wallet produce (`signTypedData`, `:582-609`); el contrato verifica
(`contracts/src/EIP712Verifier.sol:39-45`); el test `test_WalletSignatureVerifiesOnChain`
(`contracts/test/EIP712Verifier.t.sol:275-316`) une ambos extremos.

#### El `verifyingContract`

El contrato **no lo fija** (`contracts/README.md:91-92`: «El contrato **no fija el dominio**: recibe
el `digest` ya calculado»). El valor de los dos fixtures es
`0x8464135c8F25Da09e49BC8782676a84730C318bC`
(`contracts/test/fixtures/eip712-signature.json:8`,
`contracts/test/fixtures/eip712-wallet-signature.json:9`). Según `contracts/README.md:89-90` es «la
dirección determinista del despliegue del contrato desde la cuenta #0 de Anvil con nonce 0 (`cast
compute-address 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --nonce 0`, comprobado: coincide)».
**Nota de verificación:** el texto dice «cuenta #0» pero la dirección citada es la cuenta #1
(`0x7099…79C8`, la misma del `signer`, `contracts/README.md:96`). La inconsistencia **no se resuelve
aquí** porque el comando no se ha ejecutado: queda **pendiente de confirmar**.

### Tests Forge

#### `contracts/test/EIP712Verifier.t.sol` (10 pruebas)

`contract EIP712VerifierTest is Test` (`:18`). Su `setUp()` instancia el verificador, carga el
fixture y **rechaza un fixture incoherente** (`assertEq(json.readBytes32(".expectedDigest"), digest,
…)`, `assertEq(digestFromDomain, digest, …)`) en `:47-79`. Funciones `test…` reales:

| # | Función | Línea | Qué verifica |
|---|---|---|---|
| 1 | `test_FixtureDomainAndDigestMatchContract` | `:82` | Las dos sobrecargas de `domainSeparator` coinciden y el digest recompuesto on-chain es el del fixture; `name == 'TrueKeate Test App'` y `chainId == 31337` |
| 2 | `test_ValidSignatureReturnsTrue` | `:107` | Firma válida → `true`, por el digest guardado y por el recomputado |
| 3 | `test_ValidSignatureViaTypedDataReturnsTrue` | `:119` | `verifyTypedData` → `true` con el struct hash del fixture y `false` con otro |
| 4 | `test_WrongSignerReturnsFalse` | `:133` | Firmante ajeno (`0xBEEF` y la cuenta #2 de Anvil) → `false` |
| 5 | `test_AlteredDomainReturnsFalse` | `:146` | `chainId + 1` o `verifyingContract` alterado → `false` |
| 6 | `test_MalformedSignatureReturnsFalseWithoutRevert` | `:168` | Longitudes 64/66/0, `v ∈ {0,1,26,29,255}`, `s` alto, `s = 0`, `r = 0` → `false` sin revert |
| 7 | `test_OneAlteredByteReturnsFalse` | `:209` | Un byte alterado de `r`, de `s` y del digest → `false` |
| 8 | `test_WalletSignatureVerifiesOnChain` | `:275` | La firma de la wallet verifica on-chain; digest recompuesto idéntico; firmante = cuenta #1 de Anvil; los dos fixtures comparten `domainSeparator` y **no** `digest` |
| 9 | `test_WalletSignatureWithOneAlteredMessageByteReturnsFalse` | `:321` | Un byte alterado del contenido, `nonce ± 1`, `deadline ± 1` y un bit del digest → `false` |
| 10 | `test_WalletSignatureRejectsForeignSignerAndDomain` | `:379` | La firma de la wallet no vale con otro firmante ni con otro dominio |

(Líneas de `contracts/test/EIP712Verifier.t.sol`.) El total coincide con `contracts/README.md:170`:
«Incluye los 3 casos de correspondencia wallet ↔ contrato de H4 (tarea 4.16): **10 pruebas**».

#### `contracts/test/EIP712VerifierFase4.t.sol` (20 pruebas)

`contract EIP712VerifierFase4Test is Test` (`:35`). **Todas** las funciones empiezan por `testF4_`
para aislarlas con `--match-test testF4_` (`:13-14`). Las 20 reales, por frente (líneas de
`contracts/test/EIP712VerifierFase4.t.sol`):

| Frente | Funciones `testF4_…` y línea |
|---|---|
| ECDSA / EIP-2 | `LongitudesDistintasDe65DevuelvenFalse` (134), `FirmaConColaAnadidaDevuelveFalse` (153), `ValoresDeVFueraDeRangoDevuelvenFalse` (174), `FronterasDeSSeRechazan` (199), `FirmaMaleableConSAltoSeRechaza` (233), `RCeroYSCeroDevuelvenFalse` (259), `FirmanteAjenoYFirmanteCeroDevuelvenFalse` (273), `RecoverDevuelveCeroAnteFirmaInvalida` (296), `RecoverNuncaDevuelveDireccionCero` (319), `NingunaFirmaMalformadaRevierte` (355) |
| Dominio | `DominioAlteradoDevuelveFalse` (375), `ChainIdAjenoYVerifyingContractCeroDevuelvenFalse` (423), `TypehashYVerifyTypedDataEquivalen` (452) |
| Mensaje | `Fuzz_FirmaSoloValeParaElMensajeExacto` (492), `Fuzz_BitAlteradoDelDigestInvalida` (532), `ContentVacioYContentLargo` (550) |
| Correspondencia wallet ↔ contrato | `CorrespondenciaWalletContratoBidireccional` (583), `WalletUnBitAlteradoDevuelveFalse` (618) |
| Gas / estado | `GasDeterministaYEstable` (649), `ContratoSinEstado` (733) |

Son **20 pruebas**, como declara `contracts/README.md:173`. Ningún caso revierte: el contrato
devuelve `false` en todos y los tests pasan por eso (`contracts/README.md:184`).

#### Fixtures

**`contracts/test/fixtures/eip712-signature.json`** (51 líneas). Fixture del enunciado, generado
**una sola vez con `cast`** y versionado, de modo que los tests no dependen de red ni de claves
aleatorias (`:2`, `contracts/README.md:75-77`):

| Campo | Valor | Cita |
|---|---|---|
| `domain` | `TrueKeate Test App` / `1` / `31337` / `0x8464135c8F25Da09e49BC8782676a84730C318bC` | `:5-8` |
| `types` / `primaryType` | `SignMessage` con `content: string`, `nonce: uint256`, `deadline: uint256` | `:10-26` |
| `message.content` | `EIP-712 demo de TrueKeate: la cartera firma datos tipados y el contrato verificador los valida on-chain.` | `:28` |
| `message.nonce` / `deadline` | `"0"` / `"1000000000"` | `:29-30` |
| `typeHashes` | dominio `0x8b73c3c6…b39400f`; `SignMessage` `0xdd8b5ee9…3af6dc` | `:36-39` |
| `digest` = `expectedDigest` | `0xc39ddf1d66417c1a9ab929a18e122e9f5fff57a60c44c7565c75bd92a8d8b84b` | `:45-46` |
| `signer` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `:47` |
| `signature` | `0x73dd4d78…2cd2ec391c` (65 bytes, `r ‖ s ‖ v`) | `:48-49` |
| `generatedWith` | `cast 1.7.2-dev: cast keccak + cast abi-encode + cast wallet sign --data --from-file` | `:50` |

La clave privada es la de la **cuenta #1 de Anvil**, con el aviso de que es dato de prueba y nunca
debe usarse con fondos reales (`:3`, `contracts/README.md:94-99`).

**`contracts/test/fixtures/eip712-wallet-signature.json`** (42 líneas). Fixture de la
**correspondencia wallet ↔ contrato** (H4, tarea 4.16); **no** se generó con `cast`: lo produjo M11
(`src/background/crypto/sign.ts`, la misma vía que `eth_signTypedData_v4`) (`:2-4`):

| Campo | Valor | Cita |
|---|---|---|
| `domain` | `TrueKeate Test App` / `1` / `31337` / `0x8464135c8F25Da09e49BC8782676a84730C318bC` | `:5-10` |
| `types` / `primaryType` | `SignMessage(content: string, nonce: uint256, deadline: uint256)` | `:11-27` |
| `message.content` | `TrueKeate H4: firma EIP-712 generada por el Service Worker (M11) y verificada on-chain.` | `:29` |
| `message.nonce` / `deadline` | `"1"` / `"1700000000"` | `:30-31` |
| `digest` = `expectedDigest` | `0x617f47605752a33464938912ead84ac2283bca6d2e20eae51a5ca22b2348f52f` | `:37-38` |
| `signer` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `:39` |
| `signature` | `0x8dab2360…cd36ee1b` (v = 27) | `:40` |
| `generatedWith` | `M11 signTypedData() de la wallet TrueKeate (ethers v6 TypedDataEncoder)` | `:4` |

Diferencias verificadas por el test 8 (`contracts/test/EIP712Verifier.t.sol:309-315`): **comparten
`domainSeparator`** (mismo dominio) y **no comparten `digest`** (cada mensaje tiene el suyo).

### Ejecución: `package.json:17`

```json
"forge:test": "forge test --root contracts --match-contract EIP712VerifierTest"
```

(`package.json:17`). Ejecuta **solo** la clase `EIP712VerifierTest`, es decir las **10 pruebas** de
`contracts/test/EIP712Verifier.t.sol`; **no** ejecuta la batería de Fase 4
(`EIP712VerifierFase4Test`), que se invoca aparte. Otros comandos documentados: `forge build`,
`forge test --root contracts -vv`, `forge test --root contracts --match-contract
EIP712VerifierTest -vv`, `forge test --root contracts --match-test testF4_ -vv` y `forge test --root
contracts --gas-report` (`contracts/README.md:54-64`). El script npm se cita en `README.md:101` y
`:109`.

### Relación con la wallet

| Extremo | Módulo | Qué hace |
|---|---|---|
| **Produce la firma** | `src/background/crypto/sign.ts` — `signTypedData` | `digest` y `signature` con `TypedDataEncoder` (`sign.ts:592-593`, `:601-608`) |
| **Transporta la petición** | `src/background/approvals/dispatch.ts` | Tras la aprobación, `executeTypedDataSignature` (`dispatch.ts:833-834`) |
| **Verifica on-chain** | `contracts/src/EIP712Verifier.sol` — `verify` | Compara `recover(digest, signature)` con `signer` y exige `signer != address(0)` (`EIP712Verifier.sol:39-45`) |
| **Demuestra la correspondencia** | `contracts/test/EIP712Verifier.t.sol` — `test_WalletSignatureVerifiesOnChain` | Recompone el digest on-chain y exige que coincida con el de la wallet (`:286-302`) |

**La wallet firma, el contrato verifica**, y el fixture `eip712-wallet-signature.json` es el
eslabón versionado que une ambos extremos sin depender de la red. El instrumento se declara fuera
del producto (`contracts/README.md:14-15`).

### Cómo se conecta la dApp con el contrato

**No están conectados entre sí** (véase «Contrato de prueba desde la dApp»). Lo que sí está
documentado es el **despliegue manual opcional en Anvil**, en `contracts/README.md:141-151`:

| Dato | Valor real | Cita |
|---|---|---|
| Comentario | «Anvil en marcha (chainId 31337) en 127.0.0.1:8545» | `contracts/README.md:143` |
| Comando | `forge create --root contracts --rpc-url http://127.0.0.1:8545 --private-key 0x59c6… --broadcast src/EIP712Verifier.sol:EIP712Verifier` | `contracts/README.md:144-146` |
| Dirección esperada | `0x8464135c8F25Da09e49BC8782676a84730C318bC` («la MISMA del fixture: nonce 0») | `contracts/README.md:147` |
| Verificación | `cast call 0x8464135c… "verify(address,bytes32,bytes)(bool)" … --rpc-url http://127.0.0.1:8545` → `true` | `contracts/README.md:148-150` |

Parámetros de red reales, verificados en los documentos del repositorio:

| Elemento | Valor real | Cita |
|---|---|---|
| Nodo principal | `127.0.0.1:8545`, `chainId 31337`, con allowlist de CORS | `RepoTecnico/entornos_globales.md:63-64` |
| Comando del arnés E2E | `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --allow-origin "*"`, **sin** `--silent` | `RepoTecnico/entornos_globales.md:66-68` |
| Banderas inválidas medidas | `--http.corsdomain` no existe en 1.7.2-dev; `--silent` puede morir con exit 1 | `RepoTecnico/entornos_globales.md:70-75` |
| Nodo secundario | `anvil --port 8546 --chain-id 31338` | `RepoTecnico/entornos_globales.md:93` |
| Servidor de la dApp | `npm run dev`, puerto `5174` con `strictPort` | `RepoTecnico/entornos_globales.md:99`, `:119-121` |
| Arranque rápido | `anvil --host 127.0.0.1 --port 8545 … --allow-origin "*"` + `npm run dev` | `README.md:82-85` |
| Guía de usuario | idem, y `http://localhost:5174/test.html` | `INSTRUCCIONES.md:51-60` |
| El arnés levanta la dApp | `webServer: { command: 'npm run dev', url: 'http://localhost:5174/test.html' }` | `playwright.config.ts:36-38` |

**Pendiente de confirmar:** que el despliegue de `contracts/` en Anvil se haya ejecutado y que la
dirección resultante sea `0x8464135c8F25Da09e49BC8782676a84730C318bC`. Ningún script npm lo
despliega (`package.json:17` solo ejecuta tests), no forma parte de la suite E2E y esta
documentación **no ha ejecutado el comando**; el único sostén del valor es el literal de
`contracts/README.md:147-150`, citado como tal.

---

## Cierre

### Tabla resumen: flujo → métodos EIP-1193 → módulo del SW → prueba

| Flujo de `test.html` | Control | Método(s) EIP-1193 | Módulo del SW (`ruta:línea`) | Prueba que lo cubre |
|---|---|---|---|---|
| Detectar el provider | `#btn-detectar` (`:383`) | Ninguno: lee `window.truekeate` (`:494-498`) | `src/inject/index.ts:219-220` · `src/shared/constants.ts:216-217` | `e2e/07-provider.spec.ts:81` |
| Anunciar por EIP-6963 | `#btn-eip6963` (`:384`) | Ninguno: `eip6963:requestProvider` (`:771`) | `src/inject/eip6963.ts:65` | `e2e/21-eip6963.spec.ts:73` |
| Conectar | `#btn-conectar` (`:392`) | `eth_requestAccounts` (`:782`) | `src/background/rpc/pageMethods.ts:249` | `e2e/22-dapp.spec.ts:125` · `e2e/09-conectar.spec.ts:58` |
| Consultar saldo | `#btn-saldo` (`:393`) | `eth_accounts` (`:810`) + `eth_getBalance` (`:826`) | `src/background/rpc/pageMethods.ts:234` + `:185` | `e2e/22-dapp.spec.ts:163` |
| Enviar transacción | `#btn-enviar` (`:394`) | `eth_accounts` (`:843`) + `eth_sendTransaction` (`:852-861`) | `src/background/approvals/dispatch.ts:830-831` (tras `eth_estimateGas`, `:774-785`) | `e2e/22-dapp.spec.ts:171` · `e2e/10-aprobar-tx.spec.ts:54` |
| Firmar EIP-712 | `#btn-eip712` (`:395`) | `eth_signTypedData_v4` (`:889-892`) | `src/background/approvals/dispatch.ts:833-834` → `src/background/crypto/sign.ts:582` | `e2e/22-dapp.spec.ts:238` · `e2e/11-firmar-eip712.spec.ts:75` |
| Cambiar de red | `#btn-cambiar-red` (`:396`) + `#red-destino` (`:403`) | `wallet_switchEthereumChain` (`:907`) | `src/background/approvals/dispatch.ts:751-752` → `src/background/networks/switch.ts:180` | `e2e/22-dapp.spec.ts:253` · `e2e/12-redes.spec.ts:224` |
| Escuchar eventos | `#btn-eventos` (`:397-399`) | `provider.on` ×4 (`:943-946`): `accountsChanged`, `chainChanged`, `connect`, `disconnect` | `src/background/events.ts:157`, `:185`, `:164`, `:168` | `e2e/22-dapp.spec.ts:266` · `e2e/08-eventos.spec.ts:82` |
| Errores con acción sugerida (`4001`, `4900`, `4901`) | Filas de resultado | Los anteriores | `accionPara` de la dApp (`test.html:522-541`, `:599-601`) + códigos en `src/background/rpc/errors.ts:87`, `:93` | `e2e/22-dapp.spec.ts:301` (4001 y 4901) · `:340` (4900) |

Las líneas de la columna «Control» son de `test.html`. La prueba específica de la dApp, confirmada
por `glob` sobre `e2e/**/*.spec.ts`, es **`e2e/22-dapp.spec.ts`** (444 líneas, 5 pruebas):
`test.describe('22 · dApp de pruebas: los siete flujos (CA-RF-46)')` (`:116`), con pruebas en
`:125`, `:211`, `:301`, `:340` y `:405`. Mide el plazo de 5000 ms con `LIMITE_MS` (`:49`) y
contrasta el `data-ms` que publica la propia página (`:76-79`). **No existe** ningún fichero
`e2e/22-dapp-*.spec.ts`.

### Límites de esta documentación

- No se han ejecutado builds, tests, `forge`, `cast` ni Anvil: todo es lectura de ficheros.
- El despliegue de `contracts/` en Anvil y la dirección `0x8464135c…18bC` quedan **pendientes de
  confirmar**, igual que la incoherencia «cuenta #0» frente a la cuenta #1 en
  `contracts/README.md:89-90`.
- El typed data del flujo 5 de `test.html` (`domain.name = 'TrueKeate'`, sin `verifyingContract`,
  tipo `SignMessage(address,string)`) **no** es el de los fixtures de `contracts/`: se documenta como
  diferencia verificada, no como error, porque el contrato no está conectado a la dApp.
