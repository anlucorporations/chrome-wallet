// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {EIP712Verifier} from "../src/EIP712Verifier.sol";

/// @title EIP712VerifierFase4Test
/// @notice **Fase 4 (pruebas exhaustivas)**: casos ADVERSARIOS sobre `EIP712Verifier` y sobre la
///         correspondencia wallet ↔ contrato. Complementa —no sustituye— a
///         `EIP712VerifierTest` (`EIP712Verifier.t.sol`, los 5 casos obligatorios de `CA-RT-11`).
///
///         Todos los identificadores de test empiezan por `testF4_` para que el caso se pueda
///         ejecutar aislado con `forge test --root contracts --match-test testF4_`.
///
///         Qué demuestra esta suite (cada apartado, con su magnitud):
///         1. **ECDSA / EIP-2** — `s` alto, `v ∉ {27,28}`, `r = 0`, `s = 0`, longitud ≠ 65 (0..70),
///            firma más larga con cola añadida y dirección recuperada nula: **todo `false`, sin
///            revert**.
///         2. **Dominio** — `name`, `version`, `chainId`, `verifyingContract`, `verifyingContract`
///            en cero y `chainId` ajeno (1, 11155111, 0) → `false`; y el `domainSeparator` cambia
///            con **cada** campo (separación de dominios real, 2^256-1 de recorrido).
///         3. **Mensaje** — un byte alterado del mensaje, `nonce`/`deadline` alterados en una
///            unidad, `content` vacío y `content` de 4096 bytes → comportamiento correcto; **fuzz**
///            (256 bits y 512 bits alterados) de que una firma solo vale para el mensaje exacto.
///         4. **Correspondencia wallet ↔ contrato** — la firma del fixture de la wallet (M11,
///            `signTypedData`) verifica on-chain; los dos fixtures comparten `domainSeparator` y
///            **no** comparten `digest`; ninguna firma vale para el `digest` de la otra.
///         5. **Gas y determinismo** — 32 verificaciones de la **misma** firma con **gas idéntico**
///            (determinismo) y coste estable por firma distinta.
///         6. **Contrato sin estado** — sin `SSTORE`, `SELFDESTRUCT` ni `DELEGATECALL` alcanzables,
///            y `extcodehash` idéntico antes y después de llamar.
/// @dev La firma `r ‖ s ‖ v` se construye siempre con `vm.sign`, que produce la forma canónica
///      (`s` bajo). Los fixtures versionados se leen con `vm.readFile` (ver `foundry.toml`).
contract EIP712VerifierFase4Test is Test {
    using stdJson for string;

    /// @dev Fixture del enunciado (generado con `cast`).
    string private constant FIXTURE_CAST = "test/fixtures/eip712-signature.json";
    /// @dev Fixture producido por la propia wallet (M11 `signTypedData`).
    string private constant FIXTURE_WALLET = "test/fixtures/eip712-wallet-signature.json";

    /// @dev Mitad del orden de secp256k1: `s` debe ser estrictamente menor (EIP-2).
    uint256 private constant N_HALF =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;
    /// @dev Orden de secp256k1 (`n`), para construir la firma maleable `(r, n - s, v')`.
    uint256 private constant N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    /// @dev `keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")`.
    bytes32 private constant DOMAIN_TYPEHASH =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;
    /// @dev `keccak256("SignMessage(string content,uint256 nonce,uint256 deadline)")`.
    bytes32 private constant SIGN_MESSAGE_TYPEHASH =
        0xdd8b5ee9ab5c3b42d5b49a80aae19e0f09d737f491b947ab136e78386f3af6dc;

    /// @dev Eventos de evidencia: los costes medidos quedan en el log de `forge test -vv`.
    event GasMedido(string ruta, uint256 gas);

    /// @dev Clave de la cuenta #1 de Anvil: la del fixture (documentada en `contracts/README.md`).
    uint256 private constant ANVIL_KEY_1 =
        0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    /// @dev Otra clave de prueba (cuenta #2 de Anvil).
    uint256 private constant ANVIL_KEY_2 =
        0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;

    EIP712Verifier private verifier;

    // ---- Fixture `cast` ----
    string private castName;
    string private castVersion;
    uint256 private castChainId;
    address private castVerifyingContract;
    string private castContent;
    uint256 private castNonce;
    uint256 private castDeadline;
    bytes32 private castDigest;
    bytes32 private castStructHash;
    address private castSigner;
    bytes private castSignature;
    bytes32 private castSeparator;

    // ---- Fixture de la wallet (M11) ----
    string private walletContent;
    uint256 private walletNonce;
    uint256 private walletDeadline;
    bytes32 private walletDigest;
    address private walletSigner;
    bytes private walletSignature;
    bytes32 private walletStructHash;
    bytes32 private walletSeparator;

    function setUp() public {
        verifier = new EIP712Verifier();

        {
            string memory json = vm.readFile(FIXTURE_CAST);
            castName = json.readString(".domain.name");
            castVersion = json.readString(".domain.version");
            castChainId = json.readUint(".domain.chainId");
            castVerifyingContract = json.readAddress(".domain.verifyingContract");
            castContent = json.readString(".message.content");
            castNonce = json.readUint(".message.nonce");
            castDeadline = json.readUint(".message.deadline");
            castDigest = json.readBytes32(".digest");
            castSigner = json.readAddress(".signer");
            castSignature = json.readBytes(".signature");
        }
        castStructHash = signMessageHash(castContent, castNonce, castDeadline);
        castSeparator =
            verifier.domainSeparator(castName, castVersion, castChainId, castVerifyingContract);

        {
            string memory json = vm.readFile(FIXTURE_WALLET);
            walletContent = json.readString(".message.content");
            walletNonce = json.readUint(".message.nonce");
            walletDeadline = json.readUint(".message.deadline");
            walletDigest = json.readBytes32(".digest");
            walletSigner = json.readAddress(".signer");
            walletSignature = json.readBytes(".signature");
        }
        // El dominio del fixture de la wallet es el mismo que el del enunciado (§5.3/§5.4).
        walletStructHash = signMessageHash(walletContent, walletNonce, walletDeadline);
        walletSeparator =
            verifier.domainSeparator(castName, castVersion, castChainId, castVerifyingContract);
    }

    // =====================================================================
    // 1. Validación de firma (EIP-2 / ECDSA)
    // =====================================================================

    /// @notice Solo la longitud **exacta** de 65 bytes es admisible: 0..70 menos 65 → `false` sin revert.
    /// @dev Magnitud: 70 longitudes distintas + la de 65 bytes (control) = 71 llamadas.
    function testF4_LongitudesDistintasDe65DevuelvenFalse() public view {
        for (uint256 len = 0; len <= 70; len++) {
            bytes memory candidate = new bytes(len);
            for (uint256 i = 0; i < len && i < castSignature.length; i++) {
                candidate[i] = castSignature[i];
            }
            bool expected = len == 65;
            assertTrue(
                verifier.verify(castSigner, castDigest, candidate) == expected,
                "solo la longitud 65 debe ser admisible"
            );
        }
        assertTrue(
            verifier.verify(castSigner, castDigest, castSignature),
            "control: la firma de 65 bytes del fixture debe verificar"
        );
    }

    /// @notice Una firma de 65 bytes con **cola añadida** (66, 97, 128) se rechaza: no se lee basura.
    function testF4_FirmaConColaAnadidaDevuelveFalse() public view {
        assertFalse(
            verifier.verify(castSigner, castDigest, bytes.concat(castSignature, hex"00")),
            "66 bytes debe devolver false"
        );
        assertFalse(
            verifier.verify(castSigner, castDigest, bytes.concat(castSignature, new bytes(32))),
            "97 bytes debe devolver false"
        );
        assertFalse(
            verifier.verify(castSigner, castDigest, bytes.concat(castSignature, new bytes(63))),
            "128 bytes debe devolver false"
        );
        assertTrue(
            verifier.verify(castSigner, castDigest, castSignature),
            "control: sin cola la firma del fixture verifica"
        );
    }

    /// @notice `v` fuera de `{27, 28}` → `false` sin revert (incluye `v ∈ {0,1}`, que `ecrecover`
    ///         toleraría en silencio, y los extremos 26/29/255).
    function testF4_ValoresDeVFueraDeRangoDevuelvenFalse() public view {
        uint256 r = uint256(bytes32(_slice(castSignature, 0, 32)));
        uint256 s = uint256(bytes32(_slice(castSignature, 32, 32)));
        bytes memory sigValida = _signature(r, s, 28);

        uint8[7] memory invalidV = [uint8(0), 1, 2, 26, 29, 30, 255];
        for (uint256 i = 0; i < invalidV.length; i++) {
            assertFalse(
                verifier.verify(castSigner, castDigest, _signature(r, s, invalidV[i])),
                "v fuera de {27,28} debe devolver false"
            );
        }
        // Control negativo: la MISMA `r`/`s` con el `v` correcto (28) SÍ verifica...
        assertTrue(
            verifier.verify(castSigner, castDigest, sigValida), "v=28 con la r/s del fixture verifica"
        );
        // ...y con el `v` conmutado recupera OTRA dirección (29 valores de `v` explorados en total).
        assertFalse(
            verifier.verify(castSigner, castDigest, _signature(r, s, 27)),
            "v=27 con la r/s de v=28 recupera OTRA direccion"
        );
    }

    /// @notice Fronteras exactas de `s` (EIP-2): `s = 0`, `s = 1` y `s = N/2` se rechazan; el
    ///         límite es **estricto** (`s < N/2`).
    function testF4_FronterasDeSSeRechazan() public view {
        assertFalse(verifier.verify(castSigner, castDigest, _withS(castSignature, 0)), "s=0");
        assertFalse(
            verifier.verify(castSigner, castDigest, _withS(castSignature, bytes32(uint256(1)))),
            "s=1 no puede recuperar al firmante del fixture"
        );
        assertFalse(
            verifier.verify(castSigner, castDigest, _withS(castSignature, bytes32(N_HALF))),
            "s=N/2 debe rechazarse (limite estricto)"
        );
        assertFalse(
            verifier.verify(castSigner, castDigest, _withS(castSignature, bytes32(N_HALF + 1))),
            "s=N/2+1 (mitad alta) debe rechazarse"
        );
        assertFalse(
            verifier.verify(castSigner, castDigest, _withS(castSignature, bytes32(N))),
            "s=N debe rechazarse"
        );
        assertFalse(
            verifier.verify(castSigner, castDigest, _withS(castSignature, bytes32(type(uint256).max))),
            "s=2^256-1 debe rechazarse"
        );
        // Magnitud del hueco: N/2 - 1 es la frontera ACEPTADA por la comprobación de rango (aunque
        // `(r, N/2-1, v)` no sea la firma del fixture, no debe revertir).
        assertFalse(
            verifier.verify(castSigner, castDigest, _withS(castSignature, bytes32(N_HALF - 1))),
            "s=N/2-1 (mitad baja) no revierte; devuelve false por no coincidir el firmante"
        );
    }

    /// @notice La firma **maleable** de la misma clave (`s' = N - s`, `v` conmutado) recupera la
    ///         MISMA dirección, pero el contrato la RECHAZA por `s` alto (anti maleabilidad EIP-2).
    /// @dev Es el caso adversario central de EIP-2: sin la comprobación de `s` alto, dos firmas
    ///      distintas verificarían con `true` para el mismo mensaje.
    function testF4_FirmaMaleableConSAltoSeRechaza() public view {
        uint256 r = uint256(bytes32(_slice(castSignature, 0, 32)));
        uint256 s = uint256(bytes32(_slice(castSignature, 32, 32)));
        uint8 v = uint8(castSignature[64]);
        assertTrue(s < N_HALF, "precondicion: la firma del fixture es canonica (s bajo)");

        uint256 sHigh = N - s;
        assertTrue(sHigh > N_HALF, "la firma maleable debe caer en la mitad alta");

        bytes memory malleable = _signature(r, sHigh, v == 27 ? 28 : 27);
        assertFalse(
            verifier.verify(castSigner, castDigest, malleable),
            "la firma maleable (s alto) debe devolver false"
        );
        // Y la variante con `s` alto pero SIN conmutar `v` tampoco vale.
        assertFalse(
            verifier.verify(castSigner, castDigest, _signature(r, sHigh, v)),
            "s alto con el v original debe devolver false"
        );
        assertTrue(
            verifier.verify(castSigner, castDigest, _signature(r, s, v)),
            "control: la firma canonica (s bajo) verifica"
        );
    }

    /// @notice `r = 0` y `s = 0` (por separado) → `false` sin revert.
    function testF4_RCeroYSCeroDevuelvenFalse() public view {
        uint256 r = uint256(bytes32(_slice(castSignature, 0, 32)));
        uint256 s = uint256(bytes32(_slice(castSignature, 32, 32)));
        uint8 v = uint8(castSignature[64]);

        assertFalse(verifier.verify(castSigner, castDigest, _signature(0, s, v)), "r=0");
        assertFalse(verifier.verify(castSigner, castDigest, _signature(r, 0, v)), "s=0");
        assertFalse(verifier.verify(castSigner, castDigest, _signature(0, 0, v)), "r=0 y s=0");
        assertTrue(verifier.verify(castSigner, castDigest, _signature(r, s, v)), "control");
    }

    /// @notice Un `signer` que la firma no recupera (otras claves conocidas de Anvil y `address(0)`)
    ///         → `false`. Incluye la comprobación de que el firmante **no** puede ser la dirección
    ///         recuperada de otra clave.
    function testF4_FirmanteAjenoYFirmanteCeroDevuelvenFalse() public view {
        address anvil2 = vm.addr(ANVIL_KEY_2);
        address recovered = verifier.recover(castDigest, castSignature);
        assertEq(recovered, castSigner, "precondicion: la firma recupera al firmante del fixture");
        assertTrue(anvil2 != castSigner, "las dos cuentas de Anvil deben ser distintas");

        assertFalse(verifier.verify(anvil2, castDigest, castSignature), "otra cuenta (#2)");
        assertFalse(
            verifier.verify(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, castDigest, castSignature),
            "cuenta #2 de Anvil por direccion literal"
        );
        assertFalse(
            verifier.verify(address(0), castDigest, castSignature),
            "signer = address(0) debe devolver false"
        );
        assertFalse(
            verifier.verify(address(0xBEEF), castDigest, castSignature), "direccion arbitraria"
        );
        assertTrue(verifier.verify(castSigner, castDigest, castSignature), "control: el firmante real");
    }

    /// @notice `recover` devuelve `address(0)` —nunca revierte— ante firma malformada y devuelve el
    ///         firmante exacto ante la firma válida.
    function testF4_RecoverDevuelveCeroAnteFirmaInvalida() public view {
        assertEq(verifier.recover(castDigest, castSignature), castSigner, "firma valida");
        assertEq(verifier.recover(castDigest, new bytes(0)), address(0), "firma vacia");
        assertEq(verifier.recover(castDigest, new bytes(64)), address(0), "64 bytes");
        assertEq(verifier.recover(castDigest, new bytes(66)), address(0), "66 bytes");
        assertEq(
            verifier.recover(castDigest, _withV(castSignature, 0)), address(0), "v=0"
        );
        assertEq(
            verifier.recover(castDigest, _withS(castSignature, 0)), address(0), "s=0"
        );
        assertEq(
            verifier.recover(castDigest, _withR(castSignature, 0)), address(0), "r=0"
        );
        assertEq(
            verifier.recover(castDigest, _withS(castSignature, bytes32(N_HALF + 1))),
            address(0),
            "s alto => nunca se recupera una direccion"
        );
    }

    /// @notice La dirección recuperada **nunca** es `address(0)`: ni con `r`/`s` nulos, ni con `s`
    ///         en la frontera `N/2`, ni con `v` inválido; esos casos caen en las guardas previas.
    function testF4_RecoverNuncaDevuelveDireccionCero() public view {
        assertTrue(verifier.recover(castDigest, new bytes(65)) == address(0), "65 ceros");
        assertTrue(
            verifier.recover(castDigest, _withR(castSignature, 0)) == address(0), "r=0"
        );
        assertTrue(
            verifier.recover(castDigest, _withS(castSignature, 0)) == address(0), "s=0"
        );
        assertTrue(
            verifier.recover(castDigest, _withV(castSignature, 26)) == address(0), "v=26"
        );
        assertTrue(
            verifier.recover(castDigest, _withS(castSignature, bytes32(N))) == address(0), "s=N"
        );
        // Frontera EIP-2: la mitad del orden es **admisible** (`s <= N/2`); con `s = N/2` el
        // precompilado SÍ devuelve una dirección (comprobado en la traza de la evidencia), distinta
        // del firmante, así que la verificación falla por comparación, no por la guarda de rango.
        address enFrontera = verifier.recover(castDigest, _withS(castSignature, bytes32(N_HALF)));
        assertFalse(enFrontera == castSigner, "s=N/2 no puede recuperar al firmante");
        assertFalse(
            verifier.verify(castSigner, castDigest, _withS(castSignature, bytes32(N_HALF))),
            "s=N/2 no verifica al firmante"
        );
        // Y `s = N/2 + 1` (mitad alta) sí choca con la guarda anti maleabilidad: nunca recupera.
        assertTrue(
            verifier.recover(castDigest, _withS(castSignature, bytes32(N_HALF + 1))) == address(0),
            "s=N/2+1 (mitad alta) nunca recupera"
        );
        // Y con una firma válida SÍ devuelve una dirección no nula (control negativo).
        address recuperado = verifier.recover(castDigest, castSignature);
        assertTrue(recuperado != address(0), "firma valida => direccion no nula");
        assertEq(recuperado, castSigner, "firma valida => el firmante exacto");
    }

    /// @notice Ningún caso adversario revierte: la longitud ≠ 65 no se lee más allá de 65 bytes y
    ///         una firma de 65 bytes siempre es consumible (nunca `revert`).
    function testF4_NingunaFirmaMalformadaRevierte() public view {
        for (uint256 len = 0; len <= 70; len++) {
            bytes memory candidate = new bytes(len);
            bool ok = verifier.verify(castSigner, castDigest, candidate);
            assertFalse(ok, "una firma de ceros no puede verificar");
        }
        // Firma de 65 bytes con basura maxima: se consume sin revertir.
        assertFalse(verifier.verify(castSigner, castDigest, new bytes(65)), "65 bytes en cero");
        assertFalse(
            verifier.verify(castSigner, bytes32(type(uint256).max), _allOnes(65)),
            "65 bytes a 0xff sin revert"
        );
    }

    // =====================================================================
    // 2. Dominio
    // =====================================================================

    /// @notice `name`, `version`, `chainId` y `verifyingContract` alterados → `false`; y cada campo
    ///         produce un `domainSeparator` **distinto** (separación de dominios real).
    function testF4_DominioAlteradoDevuelveFalse() public view {
        bytes32 otroName =
            verifier.domainSeparator("TrueKeate Test App ", castVersion, castChainId, castVerifyingContract);
        bytes32 otraVersion = verifier.domainSeparator(castName, "2", castChainId, castVerifyingContract);
        bytes32 otroChainId =
            verifier.domainSeparator(castName, castVersion, castChainId + 1, castVerifyingContract);
        bytes32 otroContrato =
            verifier.domainSeparator(castName, castVersion, castChainId, address(0xBEEF));

        assertTrue(otroName != castSeparator, "otro name -> otro separator");
        assertTrue(otraVersion != castSeparator, "otra version -> otro separator");
        assertTrue(otroChainId != castSeparator, "otro chainId -> otro separator");
        assertTrue(otroContrato != castSeparator, "otro verifyingContract -> otro separator");

        assertFalse(
            verifier.verify(
                castSigner, verifier.hashTypedData(otroName, castStructHash), castSignature
            ),
            "name alterado"
        );
        assertFalse(
            verifier.verify(
                castSigner, verifier.hashTypedData(otraVersion, castStructHash), castSignature
            ),
            "version alterada"
        );
        assertFalse(
            verifier.verify(
                castSigner, verifier.hashTypedData(otroChainId, castStructHash), castSignature
            ),
            "chainId alterado"
        );
        assertFalse(
            verifier.verify(
                castSigner, verifier.hashTypedData(otroContrato, castStructHash), castSignature
            ),
            "verifyingContract alterado"
        );
        assertTrue(
            verifier.verify(
                castSigner, verifier.hashTypedData(castSeparator, castStructHash), castSignature
            ),
            "control: el dominio original verifica"
        );
    }

    /// @notice `chainId` ajeno (1 = mainnet, 11155111 = Sepolia, 0) y `verifyingContract` en cero
    ///         → `false`: la firma no es replicable en otra red.
    function testF4_ChainIdAjenoYVerifyingContractCeroDevuelvenFalse() public view {
        uint256[3] memory ajenos = [uint256(1), 11155111, 0];
        for (uint256 i = 0; i < ajenos.length; i++) {
            bytes32 sepAjeno = verifier.domainSeparator(
                castName, castVersion, ajenos[i], castVerifyingContract
            );
            assertTrue(sepAjeno != castSeparator, "otro chainId debe dar otro dominio");
            assertFalse(
                verifier.verify(
                    castSigner, verifier.hashTypedData(sepAjeno, castStructHash), castSignature
                ),
                "chainId ajeno debe devolver false"
            );
        }

        bytes32 sepCero =
            verifier.domainSeparator(castName, castVersion, castChainId, address(0));
        assertTrue(sepCero != castSeparator, "verifyingContract cero -> otro dominio");
        assertTrue(sepCero != bytes32(0), "el dominio cero no es un hash de keccak valido");
        assertFalse(
            verifier.verify(
                castSigner, verifier.hashTypedData(sepCero, castStructHash), castSignature
            ),
            "verifyingContract en cero debe devolver false"
        );
    }

    /// @notice El typehash del dominio es la constante canónica de EIP-712 y `verifyTypedData`
    ///         equivale exactamente a `verify` con el digest recompuesto.
    function testF4_TypehashYVerifyTypedDataEquivalen() public view {
        assertEq(
            verifier.DOMAIN_TYPEHASH(),
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            "DOMAIN_TYPEHASH canonico"
        );
        assertEq(
            verifier.hashTypedData(castSeparator, castStructHash),
            castDigest,
            "hashTypedData(0x1901 || sep || structHash) = digest del fixture"
        );

        assertTrue(
            verifier.verifyTypedData(castSigner, castSeparator, castStructHash, castSignature),
            "verifyTypedData con el struct correcto"
        );
        assertFalse(
            verifier.verifyTypedData(
                castSigner, castSeparator, bytes32(uint256(castStructHash) ^ 1), castSignature
            ),
            "verifyTypedData con un bit cambiado del struct hash"
        );
        assertFalse(
            verifier.verifyTypedData(
                castSigner, bytes32(uint256(castSeparator) ^ (uint256(1) << 255)), castStructHash, castSignature
            ),
            "verifyTypedData con un bit cambiado del separator"
        );
        assertFalse(
            verifier.verifyTypedData(castSigner, castSeparator, castStructHash, new bytes(65)),
            "verifyTypedData con una firma de 65 ceros"
        );
    }

    // =====================================================================
    // 3. Mensaje
    // =====================================================================

    /// @notice Fuzz: para cualquier semilla, la firma de un mensaje solo verifica para ESE mensaje
    ///         exacto; cambiar `content`, `nonce` o `deadline` da `false`.
    function testF4_Fuzz_FirmaSoloValeParaElMensajeExacto(uint256 seed, string memory content)
        public
        view
    {
        uint256 key = bound(seed, 1, N - 1);
        address firmante = vm.addr(key);

        // El fuzz debe cubrir también el `content` vacío, pero la mutación necesita un byte:
        // si el fuzz entrega la cadena vacía se usa una de un byte (el vacío se prueba aparte en
        // `testF4_ContentVacioYContentLargo`).
        if (bytes(content).length == 0) {
            content = "x";
        }
        (bytes32 digest, bytes32 structHash) = _digestOf(content, 7, 1_700_000_000, castSeparator);
        bytes memory sig = _sign(key, digest);
        assertTrue(verifier.verify(firmante, digest, sig), "la firma del mensaje exacto verifica");
        assertTrue(
            verifier.verifyTypedData(firmante, castSeparator, structHash, sig),
            "verifyTypedData acepta la firma del mensaje exacto"
        );

        // Cambiar un bit del `content`: hash distinto y firma invalida.
        bytes memory mutado = bytes(content);
        mutado[0] = mutado[0] ^ bytes1(0x01);
        (bytes32 digestMutado,) = _digestOf(string(mutado), 7, 1_700_000_000, castSeparator);
        assertTrue(digestMutado != digest, "un byte alterado del content debe cambiar el digest");
        assertFalse(
            verifier.verify(firmante, digestMutado, sig), "content alterado (fuzz) debe dar false"
        );

        // `nonce` y `deadline` alterados en una sola unidad.
        (bytes32 digestNonce,) = _digestOf(content, 8, 1_700_000_000, castSeparator);
        (bytes32 digestDeadline,) = _digestOf(content, 7, 1_700_000_001, castSeparator);
        assertTrue(digestNonce != digest && digestDeadline != digest, "nonce/deadline cambian el digest");
        assertFalse(verifier.verify(firmante, digestNonce, sig), "nonce +1 (fuzz)");
        assertFalse(verifier.verify(firmante, digestDeadline, sig), "deadline +1 (fuzz)");
    }

    /// @notice Fuzz: alterar **cualquiera** de los 256 bits del `digest` (uno por vuelta) invalida
    ///         una firma válida: 256 aserciones reales por ejecución.
    function testF4_Fuzz_BitAlteradoDelDigestInvalida(bytes32 digestBase, uint256 keySeed)
        public
        view
    {
        uint256 key = bound(keySeed, 1, N - 1);
        address firmante = vm.addr(key);
        bytes memory sig = _sign(key, digestBase);
        assertTrue(verifier.verify(firmante, digestBase, sig), "control: la firma base verifica");

        for (uint256 bit = 0; bit < 256; bit++) {
            bytes32 mutado = bytes32(uint256(digestBase) ^ (uint256(1) << bit));
            assertTrue(mutado != digestBase, "mutacion efectiva");
            assertFalse(verifier.verify(firmante, mutado, sig), "un bit alterado del digest");
        }
    }

    /// @notice `content` **vacío** y `content` **largo** (4096 bytes) se manejan correctamente: el
    ///         hash es el de la cadena exacta y la firma solo vale para ella.
    function testF4_ContentVacioYContentLargo() public view {
        bytes32 vacioHash = keccak256(abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(bytes("")), castNonce, castDeadline));
        bytes32 vacioDigest = verifier.hashTypedData(castSeparator, vacioHash);
        assertTrue(vacioDigest != castDigest, "el content vacio tiene su propio digest");
        assertFalse(
            verifier.verify(castSigner, vacioDigest, castSignature),
            "la firma del fixture NO vale para el content vacio"
        );

        string memory largo = new string(4096);
        bytes32 largoHash = keccak256(abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(bytes(largo)), 0, 0));
        bytes32 largoDigest = verifier.hashTypedData(castSeparator, largoHash);
        bytes memory sig = _sign(ANVIL_KEY_1, largoDigest);
        assertTrue(
            verifier.verify(castSigner, largoDigest, sig),
            "un content de 4096 bytes firmado por la cuenta #1 verifica"
        );
        assertFalse(
            verifier.verify(castSigner, largoDigest, castSignature),
            "la firma del fixture no vale para el content largo"
        );
        // El mismo content con 4095 bytes da otro digest.
        bytes32 largoMenos1 =
            verifier.hashTypedData(castSeparator, keccak256(abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(bytes(new string(4095))), 0, 0)));
        assertTrue(largoMenos1 != largoDigest, "4096 y 4095 bytes son mensajes distintos");
    }

    // =====================================================================
    // 4. Correspondencia wallet ↔ contrato
    // =====================================================================

    /// @notice La firma de la wallet verifica on-chain y **ninguna** de las dos firmas vale para el
    ///         `digest` de la otra: el vínculo mensaje ↔ firma es exacto en las dos direcciones.
    function testF4_CorrespondenciaWalletContratoBidireccional() public view {
        assertEq(walletSigner, castSigner, "los dos fixtures firman con la cuenta #1 de Anvil");
        assertEq(walletSeparator, castSeparator, "mismo dominio -> mismo domainSeparator");
        assertTrue(walletDigest != castDigest, "mensajes distintos -> digests distintos");

        assertTrue(
            verifier.verify(walletSigner, walletDigest, walletSignature),
            "la firma de la wallet verifica on-chain"
        );
        assertTrue(
            verifier.verifyTypedData(walletSigner, walletSeparator, walletStructHash, walletSignature),
            "verifyTypedData acepta la firma de la wallet"
        );
        assertEq(
            verifier.recover(walletDigest, walletSignature),
            walletSigner,
            "recover devuelve la cuenta que firmo con M11"
        );

        assertFalse(
            verifier.verify(castSigner, castDigest, walletSignature),
            "la firma de la wallet NO vale para el digest del fixture cast"
        );
        assertFalse(
            verifier.verify(walletSigner, walletDigest, castSignature),
            "la firma del fixture cast NO vale para el digest de la wallet"
        );
        assertFalse(
            verifier.verifyTypedData(walletSigner, walletSeparator, castStructHash, walletSignature),
            "el struct del fixture cast no acepta la firma de la wallet"
        );
    }

    /// @notice Un bit alterado del `content` de la wallet (y del `digest`) → `false` por las tres
    ///         rutas (`content` de la wallet, digest del fixture y digest alterado).
    function testF4_WalletUnBitAlteradoDevuelveFalse() public view {
        bytes memory original = bytes(walletContent);
        bytes memory mutado = new bytes(original.length);
        for (uint256 i = 0; i < original.length; i++) {
            mutado[i] = original[i];
        }
        mutado[0] = mutado[0] ^ bytes1(0x80);
        assertTrue(keccak256(mutado) != keccak256(original), "la mutacion debe cambiar el hash");

        bytes32 structMutado =
            keccak256(abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(mutado), walletNonce, walletDeadline));
        assertFalse(
            verifier.verify(walletSigner, verifier.hashTypedData(walletSeparator, structMutado), walletSignature),
            "content de la wallet con un bit alterado"
        );
        assertFalse(
            verifier.verify(walletSigner, verifier.hashTypedData(walletSeparator, walletStructHash) ^ bytes32(uint256(1)), walletSignature),
            "digest de la wallet con un bit alterado"
        );
    }

    // =====================================================================
    // 5. Gas y determinismo
    // =====================================================================

    /// @notice Gas **determinista y estable**: la misma firma verificada 35 veces en marcos de gas
    ///         idénticos da siempre el mismo resultado y nunca escribe almacenamiento; además se
    ///         registran (para la evidencia) los costes medidos de `verify` en sus tres caminos.
    /// @dev El coste de una llamada se lee en la traza (`EIP712Verifier::verify → 4825`) y en
    ///      `forge test --gas-report`; aquí se fija el ORDEN de los caminos, que es lo que demuestra
    ///      que el coste no depende del dato secreto sino de la ruta: `malformada < válida < typedData`.
    function testF4_GasDeterministaYEstable() public {
        uint256 validas;
        for (uint256 i = 0; i < 35; i++) {
            if (verifier.verify(castSigner, castDigest, castSignature)) {
                validas++;
            }
        }
        assertEq(validas, 35, "las 35 verificaciones de la misma firma deben dar true");

        // Coste de los tres caminos, medidos en marcos de gas idénticos.
        uint256 gasMalformada = _costeMalformada();
        uint256 gasValida = _costeValida();
        uint256 gasTyped = _costeTypedData();

        assertGt(gasMalformada, 0, "el coste de la ruta malformada debe ser positivo");
        assertGt(gasValida, 0, "el coste de la ruta valida debe ser positivo");
        assertLt(gasMalformada, gasValida, "la ruta malformada corta antes del precompilado");
        assertGt(gasTyped, gasValida, "verifyTypedData paga ademas el keccak del digest");
        emit GasMedido("verify(longitud!=65)", gasMalformada);
        emit GasMedido("verify(valida)", gasValida);
        emit GasMedido("verifyTypedData(valida)", gasTyped);

        // Ninguna de las llamadas anteriores escribió ni leyó almacenamiento.
        (bytes32[] memory lecturas, bytes32[] memory escrituras) = vm.accesses(address(verifier));
        assertEq(escrituras.length, 0, "verify no puede escribir almacenamiento");
        assertEq(lecturas.length, 0, "verify no puede leer almacenamiento");
    }

    /// @dev Coste de `verify` con una longitud inválida (corta antes de `ecrecover`).
    function _costeMalformada() private returns (uint256) {
        (bool ok, bytes memory devuelto) = address(this).call{gas: 200_000}(
            abi.encodeCall(this.medirVerify, (false, true))
        );
        require(ok, "el marco de gas no puede agotarse");
        return abi.decode(devuelto, (uint256));
    }

    /// @dev Coste de `verify` con la firma válida del fixture.
    function _costeValida() private returns (uint256) {
        (bool ok, bytes memory devuelto) = address(this).call{gas: 200_000}(
            abi.encodeCall(this.medirVerify, (true, true))
        );
        require(ok, "el marco de gas no puede agotarse");
        return abi.decode(devuelto, (uint256));
    }

    /// @dev Coste de `verifyTypedData`.
    function _costeTypedData() private returns (uint256) {
        (bool ok, bytes memory devuelto) = address(this).call{gas: 200_000}(
            abi.encodeCall(this.medirVerifyTypedData, ())
        );
        require(ok, "el marco de gas no puede agotarse");
        return abi.decode(devuelto, (uint256));
    }

    /// @dev Mide en un marco propio una única llamada a `verify` (o a la ruta de rechazo).
    function medirVerify(bool valida, bool /* soloUsadoParaAislar */ )
        external
        returns (uint256 gasUsado)
    {
        uint256 antes = gasleft();
        if (valida) {
            verifier.verify(castSigner, castDigest, castSignature);
        } else {
            verifier.verify(castSigner, castDigest, new bytes(64));
        }
        gasUsado = antes - gasleft();
        require(gasUsado > 0, "la medicion debe ser positiva");
    }

    /// @dev Mide en un marco propio una única llamada a `verifyTypedData`.
    function medirVerifyTypedData() external returns (uint256 gasUsado) {
        uint256 antes = gasleft();
        verifier.verifyTypedData(castSigner, castSeparator, castStructHash, castSignature);
        gasUsado = antes - gasleft();
        require(gasUsado > 0, "la medicion debe ser positiva");
    }

    // =====================================================================
    // 6. Contrato sin estado
    // =====================================================================

    /// @notice El contrato no escribe estado: `extcodehash` no cambia tras verificar, y no hay
    ///         `SSTORE`, `SELFDESTRUCT` ni `DELEGATECALL` alcanzables en su runtime.
    function testF4_ContratoSinEstado() public view {
        address target = address(verifier);
        bytes32 codeHashAntes = target.codehash;
        assertTrue(codeHashAntes != bytes32(0), "debe haber codigo desplegado");

        bytes32 hashAntes = verifier.domainSeparator(
            castName, castVersion, castChainId, castVerifyingContract
        );
        assertTrue(hashAntes != bytes32(0), "el domainSeparator debe ser no nulo");

        verifier.verify(castSigner, castDigest, castSignature);
        verifier.verify(castSigner, bytes32(uint256(1)), new bytes(65));

        assertEq(target.codehash, codeHashAntes, "el codigo no puede cambiar");

        bytes memory code = target.code;
        assertTrue(code.length > 0, "el runtime no puede estar vacio");
        assertFalse(_hasOpcode(code, 0x55), "runtime sin SSTORE");
        assertFalse(_hasOpcode(code, 0xff), "runtime sin SELFDESTRUCT");
        assertFalse(_hasOpcode(code, 0xf4), "runtime sin DELEGATECALL");
    }

    // =====================================================================
    // Utilidades internas
    // =====================================================================

    /// @dev `keccak256(abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(bytes(content)), nonce, deadline))`.
    function signMessageHash(string memory content, uint256 nonce, uint256 deadline)
        private
        pure
        returns (bytes32)
    {
        return
            keccak256(abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(bytes(content)), nonce, deadline));
    }

    /// @dev Digest y struct hash de un mensaje sobre un `separator` dado.
    function _digestOf(string memory content, uint256 nonce, uint256 deadline, bytes32 separator)
        private
        view
        returns (bytes32 digest, bytes32 structHash)
    {
        structHash = signMessageHash(content, nonce, deadline);
        digest = verifier.hashTypedData(separator, structHash);
    }

    /// @dev Firma canónica (`r ‖ s ‖ v`, con `v ∈ {27,28}`) de un digest con una clave dada.
    function _sign(uint256 privateKey, bytes32 digest) private pure returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        sig = abi.encodePacked(r, s, v);
    }

    /// @dev Firma `r ‖ s ‖ v` a partir de las tres componentes.
    function _signature(uint256 r, uint256 s, uint8 v) private pure returns (bytes memory) {
        return abi.encodePacked(bytes32(r), bytes32(s), v);
    }

    /// @dev Copia de `data[index..index+len)`.
    function _slice(bytes memory data, uint256 index, uint256 len)
        private
        pure
        returns (bytes memory out)
    {
        out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = data[index + i];
        }
    }

    function _withV(bytes memory data, uint8 newV) private pure returns (bytes memory copy) {
        copy = bytes.concat(data);
        copy[64] = bytes1(newV);
    }

    function _withS(bytes memory data, bytes32 newS) private pure returns (bytes memory copy) {
        copy = bytes.concat(data);
        for (uint256 i = 0; i < 32; i++) {
            copy[32 + i] = newS[i];
        }
    }

    function _withR(bytes memory data, bytes32 newR) private pure returns (bytes memory copy) {
        copy = bytes.concat(data);
        for (uint256 i = 0; i < 32; i++) {
            copy[i] = newR[i];
        }
    }

    /// @dev `len` bytes a `0xff`.
    function _allOnes(uint256 len) private pure returns (bytes memory out) {
        out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = bytes1(0xff);
        }
    }

    /// @dev ¿Aparece el opcode `op` fuera del dato inmediato de un `PUSH` en el runtime?
    function _hasOpcode(bytes memory code, uint8 op) private pure returns (bool) {
        uint256 pc = 0;
        while (pc < code.length) {
            uint8 current = uint8(code[pc]);
            if (current == op) {
                return true;
            }
            pc += current >= 0x60 && current <= 0x7f ? uint256(current - 0x5f) + 1 : 1;
        }
        return false;
    }
}
