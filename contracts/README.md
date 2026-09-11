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
function verify(address signer, bytes32 digest, bytes calldata signature) external pure returns (bool);
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

Funciones auxiliares para el test y para documentar el cálculo del dominio:
`domainSeparator(name, version, chainId, verifyingContract)`, la sobrecarga `domainSeparator(EIP712Domain)`,
`hashTypedData(separator, structHash)`, `verifyTypedData(...)`, `recover(...)` y `recoverSigner(...)`
(envoltorio público para inspeccionar firmas con `cast call`), más la constante
`DOMAIN_TYPEHASH` = `0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f`.

## Cómo se ejecuta
```powershell
cd contracts
forge --version                                                  # 1.7.2-dev
forge install foundry-rs/forge-std --no-git                      # solo la primera vez (red)
forge build
forge test --match-contract EIP712VerifierTest -vv
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
nonce 0 (`cast compute-address 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --nonce 0`). El contrato **no fija
el dominio**: recibe el `digest` ya calculado; el valor solo se usa para que la firma sea real y verificable.

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

## Casos de prueba (los 5 obligatorios de `CA-RT-11`)
`test/EIP712Verifier.t.sol` (`contract EIP712VerifierTest is Test`, cargado con `setUp()`) cubre:

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
la suite.

## Trazabilidad
RT-11 · `CA-RT-11` · CU-27 · RF-20 · tarea 1.17 (H1) · §5.4 del documento técnico · P-07.
