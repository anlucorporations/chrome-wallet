# Práctica de integración — CodeCrypto Wallet contra TrueKeate en GCP

> **Fase 3** del plan de integración. Objetivo: cargar la extensión **desempaquetada**
> (no se distribuye) y operar con ella contra la plataforma desplegada en Google Cloud.
>
> Esta guía se ejecuta en la máquina del director: el entorno de desarrollo donde se
> construyó la extensión no tiene navegador (falta `libnspr4.so`), así que **los pasos
> interactivos no se han podido validar aquí**; sí está verificado lo que se indica en
> «Estado comprobado».

---

## 1. Qué se necesita

| Elemento | Valor |
|---|---|
| Extensión construida | `npm run build` en `chrome-wallet/` → carpeta `dist/` |
| Navegador | Chrome o Chromium de escritorio |
| Cadena de la plataforma | `https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app` — **chain 31337** (`0x7a69`) |
| Web desplegada | `https://truekeate-web-593453426217.europe-west1.run.app` |
| API desplegada | `https://truekeate-api-593453426217.europe-west1.run.app` |

## 2. Cargar la extensión

1. `npm run build` (genera `dist/` con el manifest y los iconos de la marca).
2. Abre `chrome://extensions`, activa **Modo de desarrollador**.
3. **Cargar descomprimida** → selecciona la carpeta `dist/`.
4. Fija la extensión en la barra. Comprueba que el icono es el de TrueKeate (hexágono
   dorado sobre degradado navy→teal).

## 3. Crear la bóveda

Al abrir el popup por primera vez:

1. Importa una frase de 12 palabras **o** genera una nueva.
2. La wallet pedirá una **contraseña** (mínimo 8 caracteres): cifra la frase con
   AES-256. Anótala: sin ella solo se recupera con las 12 palabras.
3. Comprueba el ciclo: **🔒 Bloquear** → pantalla de desbloqueo → contraseña → vuelve
   a estar operativa.

> Si ya tenías una wallet con la frase en claro, aparecerá un aviso con el botón
> **«Cifrarla ahora»**: al pulsarlo, la frase se cifra y **desaparece del disco**.

## 4. Añadir la red de la plataforma

La wallet solo puede hablar con RPC para los que tiene permiso. Al añadir la red, el
popup **pide ese permiso solo para esa URL** (`chrome.permissions.request`), y el
service worker valida antes que el RPC responde con el chainId declarado.

1. En el popup, abre la gestión de redes (**Añadir red**).
2. Rellena:
   - **Nombre**: `Anvil GCP (TrueKeate)`
   - **RPC**: `https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app`
   - **Chain ID**: `31337`
   - **Símbolo**: `ETH`
3. Acepta el permiso del navegador. Si el RPC no responde con chainId 31337, la wallet
   **rechaza** la red (es la validación correcta, no un fallo).

> **Limitación conocida:** la wallet identifica las redes por su `chainId`, y el anvil
> local y el de GCP **comparten el 31337**. No pueden convivir como dos entradas
> distintas: para pasar de uno a otro hay que editar la red (o eliminarla y volver a
> crearla). Conviene tenerlo presente en el aula.

## 5. Probar la wallet aislada (página de pruebas)

```bash
npm run dev          # sirve la página en http://localhost:5173/test.html
```

Ejecuta las comprobaciones en orden y anota el resultado de cada una:

| # | Prueba | Qué demuestra |
|---|---|---|
| 1 | Descubrimiento EIP-6963 | La wallet se anuncia y se lista, junto a MetaMask si está instalada |
| 2 | Conectar / leer cuentas / balance / bloque | El proveedor EIP-1193 responde |
| 3 | **Firma EIP-191 (`personal_sign`)** | Firma de 65 bytes con el mensaje de TrueKeate |
| 4 | Firma EIP-712 | Datos tipados, el formato de `SmartAccount` |
| 5 | `eth_call` | Lectura de contrato desde el navegador |
| 6 | Revocar permiso | `eth_accounts` vuelve a devolver `[]` |

**Firma esperada:** `0x` + 130 caracteres hexadecimales, con `v` en {27, 28} o {0, 1}.
Una firma mal formada o un error `-32601` significa que el método no llegó a la wallet.

## 6. Integrarse con la plataforma desplegada

1. Abre `https://truekeate-web-593453426217.europe-west1.run.app`.
2. Con MetaMask **y** la wallet propia instaladas, el botón de conexión muestra el
   **selector de billetera**: elige `CodeCrypto Wallet`. La elección se recuerda.
3. Conecta e inicia sesión: se pedirá **una firma EIP-191** del mensaje
   `TrueKeate: iniciar sesión`. El backend la verifica con `ethers.verifyMessage`.
4. Recorre el alta: inscripción → verificación por código → certificación.
5. Si la wallet está **bloqueada**, la firma se rechaza con un aviso que pide
   desbloquear (no se abre ninguna ventana de aprobación): es el comportamiento
   diseñado.

## 7. Estado comprobado desde el entorno de desarrollo

- La **cadena de GCP responde** y declara `chainId = 0x7a69` (31337), bloque `0x113`.
- La **plataforma está desplegada**: `truekeate-web` rev. `00032-t7x`,
  `truekeate-api` rev. `00025-484`, con sus secretos y variables intactos.
- La extensión **pide el permiso de host** al añadir una red (`ChainManager.tsx:60`).
- **Suite de la extensión en verde**: importes, contratos, service worker (41
  comprobaciones) y bóveda (25 comprobaciones).
- **Pendiente de validar en navegador** (no se puede hacer en el entorno de
  construcción): los pasos 2 a 6 de esta guía y el selector de billetera con dos
  wallets instaladas a la vez.

## 8. Qué hacer si algo falla

| Síntoma | Causa probable |
|---|---|
| La web no lista la wallet propia | La extensión no está cargada o está deshabilitada en `chrome://extensions` |
| Error al añadir la red | El permiso de host no se concedió, o el RPC no responde 31337 |
| La firma se rechaza con «bloqueada» | La bóveda está cerrada: desbloquéala en el popup |
| La web dice que la firma no es válida | Se firmó con otra cuenta o con MetaMask en lugar de la elegida |
| `eth_call` devuelve error | La red activa no es la que tiene el contrato, o falta el permiso del RPC |
