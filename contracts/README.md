# `contracts/` — Contrato verificador EIP-712 (instrumento de prueba RT-11)

## Qué es
Proyecto Foundry **mínimo** con un único contrato, `src/EIP712Verifier.sol`, que comprueba **on-chain**
que una firma EIP-712 es válida. Es el instrumento de prueba del requisito transversal **RT-11** y de su
criterio **`CA-RT-11`** (tarea **1.17** de `RepoTecnico/plan_desarrollo.md` §3.1.5, especificado en
`RepoTecnico/documento_tecnico.md` §5.4).

## Por qué existe
Permite demostrar, sin confiar en la propia cartera, que la firma EIP-712 que produce la wallet
(§5.3, dominio `TrueKeate Test App`, `chainId 31337`) verifica con `true` y que **un byte alterado devuelve
`false`**. Es la mitad on-chain de la comprobación de extremo a extremo de `eth_signTypedData_v4`.

> **Naturaleza (P-07):** el contrato **no forma parte del producto**: no se despliega como funcionalidad de
> la cartera, no tiene estado y no debe añadírsele lógica de producción.

## API
```solidity
function verify(address signer, bytes32 digest, bytes calldata signature) external view returns (bool);
```
* `digest` = `keccak256(0x1901 ‖ domainSeparator ‖ structHash)` ya calculado por quien llama.
* `signature` = 65 bytes en el orden `r ‖ s ‖ v`, con `v ∈ {27, 28}`.
* Devuelve `true` **solo** si la dirección recuperada coincide exactamente con `signer`.
* Ante firma malformada o inválida devuelve **`false` sin revert**: longitud ≠ 65, `v` fuera de `{27,28}`,
  `s` en la mitad alta (EIP-2), `r = 0` o `s = 0` y dirección recuperada nula.
* Contrato **sin estado** (solo constantes `public`), réplica de las comprobaciones de `ECDSA.recover` de
  OpenZeppelin; la llamada al precompilado `ecrecover` se hace por `assembly` con `staticcall` en un helper
  interno, para no añadir ninguna dependencia externa a este instrumento.

> **Nota de mutabilidad (desviación mínima y documentada de §5.4).** §5.4 escribe `external pure`, pero
> `solc 0.8.24` prohíbe **cualquier** lectura de entorno —incluido el `staticcall` con el que se invoca el
> precompilado `ecrecover`— dentro de una función declarada `pure` (error `2527`/`8961`). La mutabilidad
> honesta y compilable es `view`. No debilita ninguna garantía: el contrato sigue sin estado y `view` es
> además lo que corresponde a «delegar en `ECDSA.recover`», tal como describe el propio §5.4. El nombre, el
> orden y los tipos de los parámetros y el valor de retorno de `verify` son **exactamente** los exigidos.

> **Frontera EIP-2 (exactitud del límite).** La guarda es `s > n/2 → inválida`, es decir se admite
> `s <= n/2`, que es **literalmente** lo que exige EIP-2 y lo que hace `ECDSA.recover` de OpenZeppelin
> (`if (s > HALF_ORDER) return (address(0), 0, false)`). Con `s = n/2` exacto el precompilado **sí**
> devuelve una dirección (comprobado en la traza de la evidencia de Fase 4), distinta del firmante, de modo
> que la verificación falla por comparación y no por la guarda. Todas las firmas productores conocidos
> (la wallet, `cast`, `ethers`) usan `s` estrictamente menor.

Funciones auxiliares para el test y para documentar el cálculo del dominio:
`domainSeparator(name, version, chainId, verifyingContract)`, la sobrecarga `domainSeparator(EIP712Domain)`,
`hashTypedData(separator, structHash)`, `verifyTypedData(...)`, `recover(bytes32,bytes)` —envoltorio público
que devuelve `address(0)` ante firma inválida y es el que se inspecciona con `cast call`— y la constante
`DOMAIN_TYPEHASH` = `0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f`.

> **Corrección (Fase 4).** Una versión anterior de este README citaba también un `recoverSigner(...)` que
> **no existe** en el contrato. Era una referencia documental a un símbolo inexistente (la función se llama
> `recover`); se ha corregido aquí. No había ninguna llamada en código a ese nombre.

## Cómo se ejecuta
```powershell
cd contracts
forge --version                                                  # 1.7.2-dev
forge install foundry-rs/forge-std --no-git                      # solo la primera vez (red)
forge build
forge test --root contracts -vv                                  # desde la RAÍZ del repositorio
forge test --root contracts --match-contract EIP712VerifierTest -vv
forge test --root contracts --match-test testF4_ -vv             # solo la batería adversaria de Fase 4
forge test --root contracts --gas-report                         # tabla de gas por función
```
`foundry.toml` fija **`solc = "0.8.24"`** (versión exacta, no rango), `evm_version = "cancun"` y
`optimizer = false`, tal como exige §5.4 (reproducibilidad, RNF-24).

### Dependencia de test
El test usa **`forge-std` v1.16.2**, vendorizado en `lib/forge-std` con
`forge install foundry-rs/forge-std --no-git` (carpeta ignorada por git; solo necesita red la primera vez).
Se emplea únicamente por comodidad: `Test` (aserciones), `stdJson` y `vm.readFile`/`vm.parseJson` para leer
el fixture. El test **también comprueba el digest recalculado on-chain** con `abi.encode`, de modo que no
depende de que `ethers.js` esté presente.

## Fixture versionado
`test/fixtures/eip712-signature.json` se genera **una sola vez** y se versiona: los tests no dependen de red
ni de claves aleatorias. Contenido resumido:

| Campo | Valor |
|---|---|
| `domain.name` | `TrueKeate Test App` |
| `domain.version` | `1` |
| `domain.chainId` | `31337` |
| `domain.verifyingContract` | `0x8464135c8F25Da09e49BC8782676a84730C318bC` |
| `types` / `primaryType` | `SignMessage(string content,uint256 nonce,uint256 deadline)` |
| `digest` (= `expectedDigest`) | `0xc39ddf1d66417c1a9ab929a18e122e9f5fff57a60c44c7565c75bd92a8d8b84b` |
| `signer` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |

`verifyingContract` es la dirección determinista del despliegue del contrato desde la cuenta #0 de Anvil con
nonce 0 (`cast compute-address 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --nonce 0`, comprobado: coincide).
El contrato **no fija el dominio**: recibe el `digest` ya calculado; el valor solo se usa para que la firma
sea real y verificable.

### Clave privada usada (SOLO PRUEBAS)
```
0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d  →  0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```
Es la **cuenta #1 de Anvil**: una clave pública y notoria, usada aquí únicamente como dato de prueba. **No
debe usarse nunca con fondos reales.** El fixture no contiene ninguna clave distinta de esta.

### Cómo se generó
Con `cast` (sin nodo ni claves aleatorias), en este orden:
1. `cast keccak` de los typehashes del dominio y de `SignMessage`;
2. `cast from-utf8` + `cast keccak` para `keccak256(name)`, `keccak256(version)` y el hash del `content`;
3. `cast abi-encode` + `cast keccak` para el `domainSeparator` y el `structHash`;
4. `digest` = `cast keccak (0x1901 ‖ domainSeparator ‖ structHash)`;
5. `cast wallet sign --data --from-file typed-data.json --private-key 0x59c6…` para firmar el typed data;
6. normalización de la firma a `r ‖ s ‖ v` con `v ∈ {27,28}`, y verificación cruzada con
   `cast wallet verify --data` (resultado: *Validation succeeded*).

## Segundo fixture: la firma de la WALLET (H4 / Fase 4)
`test/fixtures/eip712-wallet-signature.json` **no** se generó con `cast`: lo produjo la propia wallet
(M11 `src/background/crypto/sign.ts`, la misma vía que `eth_signTypedData_v4`) sobre el dominio
`TrueKeate Test App` / `chainId 31337` / `verifyingContract 0x8464135c…18bC`. Sus valores son:

| Campo | Valor |
|---|---|
| `message.content` | `TrueKeate H4: firma EIP-712 generada por el Service Worker (M11) y verificada on-chain.` |
| `message.nonce` / `message.deadline` | `1` / `1700000000` |
| `digest` (= `expectedDigest`) | `0x617f47605752a33464938912ead84ac2283bca6d2e20eae51a5ca22b2348f52f` |
| `signer` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| `signature` | `0x8dab2360…cd36ee1b` (`v = 27`) |

### Cómo se regenera (dos vías independientes, ambas reproducibles)
```powershell
# Vía 1 — la MISMA operación de M11 con ethers v6 (comprueba; --write regenera)
node contracts/scripts/generar-fixture-wallet.mjs            # exit 0 si el fixture es coherente
node contracts/scripts/generar-fixture-wallet.mjs --write    # regenera digest y firma

# Vía 2 — `cast` sobre el mismo typed data (tercer oráculo independiente)
cd contracts
cast wallet sign --data --from-file scripts/typed-data-wallet.json `
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
cast wallet verify --data --from-file scripts/typed-data-wallet.json `
  --address 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 <firma>   # "Validation succeeded"
```
Las dos vías dan **exactamente** la misma firma que el fixture versionado (comprobado en la evidencia de
Fase 4), de modo que el fixture no puede quedarse obsoleto en silencio: si se cambia el mensaje o el dominio
sin refirmar, el script falla con exit 1 y `setUp()` del test falla.

### Comprobación de extremo a extremo con un nodo real (opcional)
```powershell
# Anvil en marcha (chainId 31337) en 127.0.0.1:8545
forge create --root contracts --rpc-url http://127.0.0.1:8545 `
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d `
  src/EIP712Verifier.sol:EIP712Verifier --broadcast
# Deployed to: 0x8464135c8F25Da09e49BC8782676a84730C318bC  (la MISMA del fixture: nonce 0)
cast call 0x8464135c8F25Da09e49BC8782676a84730C318bC "verify(address,bytes32,bytes)(bool)" `
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 0x617f4760…48f52f 0x8dab2360…cd36ee1b --rpc-url http://127.0.0.1:8545
# → true
```

## Casos de prueba
### `test/EIP712Verifier.t.sol` — los 5 obligatorios de `CA-RT-11`
`contract EIP712VerifierTest is Test`, cargado con `setUp()`, cubre:

1. `test_ValidSignatureReturnsTrue` — firma válida del fixture → `true`; y
   `test_ValidSignatureViaTypedDataReturnsTrue` — la ruta `verifyTypedData` y el digest recomuesto on-chain.
2. `test_WrongSignerReturnsFalse` — firmante incorrecto (otra dirección / cuenta #2 de Anvil) → `false`.
3. `test_AlteredDomainReturnsFalse` — `chainId` o `verifyingContract` alterados → `false`.
4. `test_MalformedSignatureReturnsFalseWithoutRevert` — longitud ≠ 65, `v ∉ {27,28}`, `s` alto, `r`/`s` nulos
   → `false` sin revert.
5. `test_OneAlteredByteReturnsFalse` — un byte alterado de la firma y un byte alterado del mensaje → `false`.

Además, `test_FixtureDomainAndDigestMatchContract` comprueba que el dominio del fixture y el `digest`
recalculado on-chain (`keccak256(0x1901 ‖ separator ‖ structHash)`) coinciden con los del fixture, y `setUp()`
rechaza un fixture incoherente (`digest != expectedDigest` o `digest` que no corresponda a
`domain`/`message`): si alguien regenera el fixture mal, el test falla en lugar de dar un falso verde. Se
verificó por mutación que alterar `chainId`, `verifyingContract` o `message.content` del fixture hace fallar
la suite. Incluye los 3 casos de correspondencia wallet ↔ contrato de H4 (tarea 4.16): **10 pruebas**.

### `test/EIP712VerifierFase4.t.sol` — batería adversaria (Fase 4)
`contract EIP712VerifierFase4Test is Test` (20 pruebas, prefijo `testF4_`). Complementa —no sustituye— a la
anterior y **rompe** el contrato a propósito por cada frente:

| Frente | Casos |
|---|---|
| ECDSA / EIP-2 | longitudes 0..70 (solo 65 admisible), cola añadida (66/97/128), `v ∈ {0,1,2,26,29,30,255}`, `v` conmutado, `r = 0`, `s = 0`, `r = s = 0`, `s ∈ {1, n/2, n/2+1, n, 2^256-1}`, frontera `s <= n/2`, firma **maleable** (`n - s`, `v` conmutado) |
| Dominio | `name`, `version`, `chainId`, `verifyingContract` alterados; `chainId ∈ {1, 11155111, 0}`; `verifyingContract` en cero; typehash canónico; `verifyTypedData` con un bit cambiado de `separator`/`structHash` |
| Mensaje | un byte alterado (fuzz sobre `content`), `nonce`/`deadline` ± 1, `content` vacío, `content` de 4096 y 4095 bytes, **fuzz de 256 bits** del `digest` (256 aserciones por vuelta), fuzz de mensaje exacto (`seed`, `string`) |
| Correspondencia | la firma de la wallet verifica on-chain; los dos fixtures comparten `domainSeparator` y **no** `digest`; ninguna firma vale para el `digest` de la otra; `recover` devuelve la cuenta que firmó |
| Gas / estado | orden de rutas medido (`malformada < válida < verifyTypedData`), 35 verificaciones idénticas, `vm.accesses` sin lecturas ni escrituras, runtime **sin `SSTORE`/`SELFDESTRUCT`/`DELEGATECALL`** alcanzables, `extcodehash` estable |

**Ningún caso revierte**: el contrato devuelve `false` en todos ellos (los tests *pasan* justamente por eso).

### Gas medido (`forge test --root contracts --gas-report`)
| Función | Min | Media | Mediana | Máx | Nota |
|---|---|---|---|---|---|
| `verify` (ruta de rechazo, longitud ≠ 65) | 1233 | — | — | — | corta antes del precompilado |
| `verify` (firma válida, `ecrecover` real) | — | — | 4780 | **4825** | coste de una verificación real |
| `verifyTypedData` | 5635 | 5657 | 5657 | 5680 | incluye `keccak256(0x1901‖sep‖structHash)` |
| `hashTypedData` | 1403 | 1403 | 1403 | 1403 | puro |
| `domainSeparator(string,string,uint256,address)` | 2681 | 2681 | 2681 | 2681 | puro |
| `domainSeparator((string,string,uint256,address))` | 2709 | 2709 | 2709 | 2709 | sobrecarga |

La llamada `verify` **es determinista**: la traza muestra el mismo consumo (4825 gas) en todas las vueltas
con la misma firma; la ruta de rechazo es siempre más barata y `verifyTypedData` siempre más caro.

## Trazabilidad
RT-11 · `CA-RT-11` · CU-27 · RF-20 · tarea 1.17 (H1) · tarea 4.16 (H4) · Fase 4 · §5.4 del documento
técnico · P-07.
