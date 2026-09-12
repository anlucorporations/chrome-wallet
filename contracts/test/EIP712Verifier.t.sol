// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {EIP712Verifier, EIP712Domain} from "../src/EIP712Verifier.sol";

/// @title EIP712VerifierTest
/// @notice Los 5 casos obligatorios de RT-11 / `CA-RT-11` (§3.1.5 tarea 1.17 y §5.4 del documento técnico):
///         1) firma válida del fixture → `true`;
///         2) firmante incorrecto → `false`;
///         3) dominio alterado (`chainId` o `verifyingContract`) → `false`;
///         4) firma malformada (longitud ≠ 65, `v` fuera de 27/28, `s` alto, `r`/`s` nulos) → `false` sin revert;
///         5) un byte alterado de la firma (y del mensaje) → `false`.
/// @dev El fixture `test/fixtures/eip712-signature.json` está versionado y **no** depende de red ni de
///      claves aleatorias: se generó una sola vez con `cast` a partir de la clave privada de prueba
///      de la cuenta #1 de Anvil (documentada en `contracts/README.md`).
contract EIP712VerifierTest is Test {
    using stdJson for string;

    string private constant FIXTURE_PATH = "test/fixtures/eip712-signature.json";

    /// @dev Mitad del orden de secp256k1: `s` debe ser estrictamente menor (EIP-2).
    uint256 private constant _SECP256K1N_HALF =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    /// @dev `keccak256("SignMessage(string content,uint256 nonce,uint256 deadline)")` del fixture.
    bytes32 private constant SIGN_MESSAGE_TYPEHASH =
        0xdd8b5ee9ab5c3b42d5b49a80aae19e0f09d737f491b947ab136e78386f3af6dc;

    EIP712Verifier private verifier;

    // Datos del fixture cargados en `setUp`.
    string private name;
    string private version;
    uint256 private chainId;
    address private verifyingContract;
    string private content;
    uint256 private nonce;
    uint256 private deadline;
    bytes32 private digest;
    bytes32 private digestFromDomain;
    bytes32 private structHash;
    address private signer;
    bytes private signature;

    function setUp() public {
        verifier = new EIP712Verifier();

        string memory json = vm.readFile(FIXTURE_PATH);
        name = json.readString(".domain.name");
        version = json.readString(".domain.version");
        chainId = json.readUint(".domain.chainId");
        verifyingContract = json.readAddress(".domain.verifyingContract");
        content = json.readString(".message.content");
        nonce = json.readUint(".message.nonce");
        deadline = json.readUint(".message.deadline");
        digest = json.readBytes32(".digest");
        signer = json.readAddress(".signer");
        signature = json.readBytes(".signature");

        // Hash del struct primario, recalculado en el test con el typehash de `SignMessage`.
        structHash = keccak256(
            abi.encode(
                SIGN_MESSAGE_TYPEHASH, keccak256(bytes(content)), nonce, deadline
            )
        );

        // Digest recomputado **on-chain** a partir de los campos del dominio y del mensaje, sin usar
        // el `digest` guardado: es el valor firmado por `cast` y el que ata el dominio al fixture.
        digestFromDomain = verifier.hashTypedData(
            verifier.domainSeparator(name, version, chainId, verifyingContract), structHash
        );

        // El fixture debe ser coherente consigo mismo antes de usarlo como oráculo.
        assertEq(json.readBytes32(".expectedDigest"), digest, "fixture: digest != expectedDigest");
        assertEq(signature.length, 65, "fixture: la firma debe tener 65 bytes");
        assertEq(digestFromDomain, digest, "fixture: el digest no corresponde al dominio declarado");
    }

    /// @notice El `digest` del fixture es el que reconstruye el contrato a partir del dominio y del mensaje.
    function test_FixtureDomainAndDigestMatchContract() public view {
        EIP712Domain memory domain = EIP712Domain({
            name: name,
            version: version,
            chainId: chainId,
            verifyingContract: verifyingContract
        });
        bytes32 separator = verifier.domainSeparator(domain);

        assertEq(
            separator,
            verifier.domainSeparator(name, version, chainId, verifyingContract),
            "las dos sobrecargas de domainSeparator deben coincidir"
        );
        assertTrue(separator != bytes32(0), "domain separator no puede ser cero");
        assertEq(verifier.hashTypedData(separator, structHash), digest, "digest recomuesto on-chain");

        // El dominio del fixture es el de la dApp de pruebas: `TrueKeate Test App`, chainId 31337.
        assertEq(keccak256(bytes(name)), keccak256(bytes("TrueKeate Test App")), "nombre del dominio");
        assertEq(chainId, 31337, "chainId del dominio");
    }

    /// @notice Caso 1: firma válida del fixture → `true`.
    /// @dev Se comprueba por las dos rutas: con el `digest` guardado en el fixture y con el `digest`
    ///      recomputado on-chain desde el dominio y el mensaje, que es lo que ata el fixture a la firma.
    function test_ValidSignatureReturnsTrue() public view {
        assertTrue(
            verifier.verify(signer, digest, signature),
            "la firma valida del fixture debe devolver true"
        );
        assertTrue(
            verifier.verify(signer, digestFromDomain, signature),
            "la firma valida debe verificar con el digest recomputado desde el dominio"
        );
    }

    /// @notice Caso 1b: `verifyTypedData` recompone el mismo `digest` que produjo la firma.
    function test_ValidSignatureViaTypedDataReturnsTrue() public view {
        bytes32 separator = verifier.domainSeparator(name, version, chainId, verifyingContract);

        assertTrue(
            verifier.verifyTypedData(signer, separator, structHash, signature),
            "verifyTypedData debe devolver true con el struct hash del fixture"
        );
        assertFalse(
            verifier.verifyTypedData(signer, separator, keccak256("otro mensaje"), signature),
            "verifyTypedData debe devolver false con otro struct hash"
        );
    }

    /// @notice Caso 2: firmante incorrecto (otra dirección) → `false`.
    function test_WrongSignerReturnsFalse() public view {
        assertFalse(
            verifier.verify(address(0xBEEF), digest, signature),
            "un firmante distinto debe devolver false"
        );
        // La cuenta #2 de Anvil no es la firmante del fixture.
        assertFalse(
            verifier.verify(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, digest, signature),
            "otra cuenta de Anvil debe devolver false"
        );
    }

    /// @notice Caso 3: dominio alterado (`chainId` o `verifyingContract`) → `false`.
    function test_AlteredDomainReturnsFalse() public view {
        bytes32 original = verifier.domainSeparator(name, version, chainId, verifyingContract);
        bytes32 alteredChainId =
            verifier.domainSeparator(name, version, chainId + 1, verifyingContract);
        bytes32 alteredContract =
            verifier.domainSeparator(name, version, chainId, address(0x1234));

        assertTrue(alteredChainId != original, "otro chainId debe dar otro domain separator");
        assertTrue(alteredContract != original, "otro verifyingContract debe dar otro domain separator");

        // Con el dominio alterado el digest cambia y la firma del fixture deja de verificar.
        assertFalse(
            verifier.verify(signer, verifier.hashTypedData(alteredChainId, structHash), signature),
            "otro chainId debe devolver false"
        );
        assertFalse(
            verifier.verify(signer, verifier.hashTypedData(alteredContract, structHash), signature),
            "otro verifyingContract debe devolver false"
        );
    }

    /// @notice Caso 4: firma malformada → `false` **sin revert**.
    function test_MalformedSignatureReturnsFalseWithoutRevert() public view {
        // 4.a longitud distinta de 65 bytes
        bytes memory tooShort = new bytes(64);
        bytes memory tooLong = new bytes(66);
        bytes memory empty = new bytes(0);
        for (uint256 i = 0; i < 64; i++) {
            tooShort[i] = signature[i];
        }
        for (uint256 i = 0; i < 65; i++) {
            tooLong[i] = signature[i];
        }
        tooLong[65] = bytes1(0x01);

        assertFalse(verifier.verify(signer, digest, tooShort), "longitud 64 debe devolver false");
        assertFalse(verifier.verify(signer, digest, tooLong), "longitud 66 debe devolver false");
        assertFalse(verifier.verify(signer, digest, empty), "longitud 0 debe devolver false");

        // 4.b `v` inválido (0, 1, 26, 29, 255)
        assertFalse(verifier.verify(signer, digest, _withV(signature, 0)), "v=0 debe devolver false");
        assertFalse(verifier.verify(signer, digest, _withV(signature, 1)), "v=1 debe devolver false");
        assertFalse(verifier.verify(signer, digest, _withV(signature, 26)), "v=26 debe devolver false");
        assertFalse(verifier.verify(signer, digest, _withV(signature, 29)), "v=29 debe devolver false");
        assertFalse(verifier.verify(signer, digest, _withV(signature, 255)), "v=255 debe devolver false");

        // 4.c `s` en la mitad alta (maleabilidad EIP-2), `s` nulo y `r` nulo
        bytes32 highS = bytes32(_SECP256K1N_HALF + 1);
        assertFalse(
            verifier.verify(signer, digest, _withS(signature, highS)),
            "s alto debe devolver false"
        );
        assertFalse(
            verifier.verify(signer, digest, _withS(signature, bytes32(0))),
            "s nulo debe devolver false"
        );
        assertFalse(
            verifier.verify(signer, digest, _withR(signature, bytes32(0))),
            "r nulo debe devolver false"
        );
    }

    /// @notice Caso 5: un byte alterado de la firma (o del mensaje) → `false`.
    function test_OneAlteredByteReturnsFalse() public view {
        assertFalse(
            verifier.verify(signer, digest, _flipByte(signature, 0)),
            "byte alterado en r debe devolver false"
        );
        assertFalse(
            verifier.verify(signer, digest, _flipByte(signature, 40)),
            "byte alterado en s debe devolver false"
        );
        // CA-RT-11: un byte alterado del mensaje cambia el digest y la firma deja de valer.
        assertFalse(
            verifier.verify(signer, digest ^ bytes32(uint256(1)), signature),
            "byte alterado del mensaje debe devolver false"
        );
    }

    // ---------------------------------------------------------------------
    // H4 / tarea 4.16 — correspondencia WALLET ↔ CONTRATO
    //
    // El fixture `test/fixtures/eip712-wallet-signature.json` NO se generó con `cast`: lo produjo
    // la propia wallet (M11 `src/background/crypto/sign.ts`, la misma vía que usa
    // `eth_signTypedData_v4`) sobre el dominio `TrueKeate Test App` con `chainId 31337`. Estos
    // casos demuestran que la firma de la wallet verifica **on-chain** (`true`) y que un solo byte
    // alterado del mensaje devuelve `false` (`CA-RT-11`).
    // ---------------------------------------------------------------------

    /// @dev Campos del fixture firmado por la wallet.
    struct WalletFixture {
        string name;
        string version;
        uint256 chainId;
        address verifyingContract;
        string content;
        uint256 nonce;
        uint256 deadline;
        bytes32 digest;
        bytes32 expectedDigest;
        address signer;
        bytes signature;
    }

    string private constant WALLET_FIXTURE_PATH = "test/fixtures/eip712-wallet-signature.json";

    /// @dev Carga el fixture firmado por la wallet y comprueba que es coherente consigo mismo.
    function _loadWalletFixture() private view returns (WalletFixture memory f) {
        string memory json = vm.readFile(WALLET_FIXTURE_PATH);
        f.name = json.readString(".domain.name");
        f.version = json.readString(".domain.version");
        f.chainId = json.readUint(".domain.chainId");
        f.verifyingContract = json.readAddress(".domain.verifyingContract");
        f.content = json.readString(".message.content");
        f.nonce = json.readUint(".message.nonce");
        f.deadline = json.readUint(".message.deadline");
        f.digest = json.readBytes32(".digest");
        f.expectedDigest = json.readBytes32(".expectedDigest");
        f.signer = json.readAddress(".signer");
        f.signature = json.readBytes(".signature");

        assertEq(f.expectedDigest, f.digest, "wallet: digest != expectedDigest");
        assertEq(f.signature.length, 65, "wallet: la firma debe tener 65 bytes");
    }

    /// @notice La firma EIP-712 de la WALLET verifica on-chain (`true`).
    /// @dev Además de `verify(signer, digest, signature)`, se recompone el `digest` **on-chain**
    ///      desde el dominio y el struct del fixture y se exige que coincida con el `digest` que
    ///      produjo la wallet: es la correspondencia exacta wallet ↔ contrato.
    function test_WalletSignatureVerifiesOnChain() public view {
        WalletFixture memory f = _loadWalletFixture();

        bytes32 contentHash = keccak256(bytes(f.content));
        bytes32 structHashWallet = keccak256(
            abi.encode(SIGN_MESSAGE_TYPEHASH, contentHash, f.nonce, f.deadline)
        );
        bytes32 separator =
            verifier.domainSeparator(f.name, f.version, f.chainId, f.verifyingContract);
        bytes32 digestOnChain = verifier.hashTypedData(separator, structHashWallet);

        assertEq(
            digestOnChain,
            f.digest,
            "wallet: el digest de M11 debe ser el que recompone el contrato"
        );
        assertTrue(
            verifier.verify(f.signer, f.digest, f.signature),
            "la firma de la wallet debe verificar on-chain"
        );
        assertTrue(
            verifier.verify(f.signer, digestOnChain, f.signature),
            "la firma de la wallet debe verificar con el digest recompuesto on-chain"
        );
        assertTrue(
            verifier.verifyTypedData(f.signer, separator, structHashWallet, f.signature),
            "verifyTypedData debe aceptar la firma de la wallet"
        );

        // Dominio y firmante exigidos por la tarea 4.16.
        assertEq(keccak256(bytes(f.name)), keccak256(bytes("TrueKeate Test App")), "nombre del dominio");
        assertEq(f.chainId, 31337, "chainId del dominio");
        assertEq(f.signer, 0x70997970C51812dc3A010C7d01b50e0d17dc79C8, "firmante = cuenta #1 de Anvil");

        // Los dos fixtures comparten dominio: el `domainSeparator` es el MISMO on-chain.
        assertEq(
            separator,
            verifier.domainSeparator(name, version, chainId, verifyingContract),
            "los dos fixtures deben compartir el domain separator"
        );
        assertTrue(f.digest != digest, "cada mensaje tiene su propio digest");
    }

    /// @notice Un BYTE alterado del mensaje de la wallet devuelve `false`.
    /// @dev Se altera el primer byte de `content` (y, por separado, `nonce` y `deadline`) y se
    ///      recomputa el `digest` on-chain: la firma de la wallet deja de verificar.
    function test_WalletSignatureWithOneAlteredMessageByteReturnsFalse() public view {
        WalletFixture memory f = _loadWalletFixture();
        bytes32 separator =
            verifier.domainSeparator(f.name, f.version, f.chainId, f.verifyingContract);

        // 1) Un byte alterado del CONTENIDO (mismo número de bytes: solo cambia un bit).
        //    Se COPIA el contenido: `bytes(memoryString)` comparte la memoria del string y
        //    alterarlo in situ cambiaría también el mensaje original.
        bytes memory original = bytes(f.content);
        bytes memory alterado = new bytes(original.length);
        for (uint256 i = 0; i < original.length; i++) {
            alterado[i] = original[i];
        }
        assertTrue(alterado.length > 0, "el contenido del fixture no puede quedar vacio");
        alterado[0] = alterado[0] ^ bytes1(0x01);
        assertTrue(
            keccak256(alterado) != keccak256(original),
            "alterar un byte debe cambiar el contentHash"
        );
        bytes32 structAlterado =
            keccak256(abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(alterado), f.nonce, f.deadline));
        assertFalse(
            verifier.verify(
                f.signer,
                verifier.hashTypedData(separator, structAlterado),
                f.signature
            ),
            "un byte alterado del mensaje debe devolver false"
        );
        assertFalse(
            verifier.verifyTypedData(f.signer, separator, structAlterado, f.signature),
            "verifyTypedData debe devolver false con el mensaje alterado"
        );

        // 2) `nonce` y `deadline` alterados en una unidad: el struct hash cambia y la firma no vale.
        bytes32 structNonce = keccak256(
            abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(bytes(f.content)), f.nonce + 1, f.deadline)
        );
        bytes32 structDeadline = keccak256(
            abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(bytes(f.content)), f.nonce, f.deadline + 1)
        );
        assertFalse(
            verifier.verify(f.signer, verifier.hashTypedData(separator, structNonce), f.signature),
            "otro nonce debe devolver false"
        );
        assertFalse(
            verifier.verify(f.signer, verifier.hashTypedData(separator, structDeadline), f.signature),
            "otro deadline debe devolver false"
        );

        // 3) El `digest` original con un bit cambiado: la firma tampoco verifica.
        assertFalse(
            verifier.verify(f.signer, f.digest ^ bytes32(uint256(1)), f.signature),
            "un bit alterado del digest debe devolver false"
        );
    }

    /// @notice La firma de la wallet NO verifica para otro firmante ni con otro dominio.
    function test_WalletSignatureRejectsForeignSignerAndDomain() public view {
        WalletFixture memory f = _loadWalletFixture();
        bytes32 structHashWallet = keccak256(
            abi.encode(SIGN_MESSAGE_TYPEHASH, keccak256(bytes(f.content)), f.nonce, f.deadline)
        );

        assertFalse(
            verifier.verify(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, f.digest, f.signature),
            "otra cuenta de Anvil debe devolver false"
        );

        bytes32 otroChainId =
            verifier.domainSeparator(f.name, f.version, f.chainId + 1, f.verifyingContract);
        bytes32 otroContrato =
            verifier.domainSeparator(f.name, f.version, f.chainId, address(0xBEEF));
        assertFalse(
            verifier.verify(f.signer, verifier.hashTypedData(otroChainId, structHashWallet), f.signature),
            "otro chainId debe devolver false"
        );
        assertFalse(
            verifier.verify(f.signer, verifier.hashTypedData(otroContrato, structHash), f.signature),
            "otro verifyingContract debe devolver false"
        );
    }

    // ---------------------------------------------------------------------
    // Utilidades internas del test
    // ---------------------------------------------------------------------

    function _flipByte(bytes memory data, uint256 index) private pure returns (bytes memory) {
        bytes memory copy = bytes.concat(data);
        copy[index] = copy[index] ^ bytes1(0x01);
        return copy;
    }

    function _withV(bytes memory data, uint8 newV) private pure returns (bytes memory) {
        bytes memory copy = bytes.concat(data);
        copy[64] = bytes1(newV);
        return copy;
    }

    function _withS(bytes memory data, bytes32 newS) private pure returns (bytes memory) {
        bytes memory copy = bytes.concat(data);
        for (uint256 i = 0; i < 32; i++) {
            copy[32 + i] = newS[i];
        }
        return copy;
    }

    function _withR(bytes memory data, bytes32 newR) private pure returns (bytes memory) {
        bytes memory copy = bytes.concat(data);
        for (uint256 i = 0; i < 32; i++) {
            copy[i] = newR[i];
        }
        return copy;
    }
}
