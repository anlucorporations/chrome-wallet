// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title EIP712Verifier
/// @notice Instrumento de prueba (RT-11, P-07) que comprueba **on-chain** que una firma EIP-712
///         es válida. NO forma parte del producto: no se despliega como funcionalidad de la
///         cartera, no tiene estado y no custodia fondos.
/// @dev Contrato **sin estado** (ninguna variable de almacenamiento mutable; solo constantes) que
///      replica las comprobaciones de seguridad de `ECDSA.recover` de OpenZeppelin (EIP-2 / EIP-150):
///        - longitud exacta de 65 bytes;
///        - `v ∈ {27, 28}` (se rechaza `v ∈ {0, 1}`, que `ecrecover` tolera en silencio);
///        - `s` en la mitad baja del orden de secp256k1 (anti maleabilidad, EIP-2);
///        - `r != 0` y `s != 0`;
///        - dirección recuperada distinta de `address(0)`.
///      Ante cualquier firma inválida o malformada devuelve `false`: **nunca revierte**.
///
///      Nota de mutabilidad (desviación mínima y documentada respecto de §5.4 del documento técnico,
///      que escribe `external pure`): el compilador solc 0.8.24 prohíbe cualquier lectura de entorno
///      —incluido `staticcall` al precompilado `ecrecover`— dentro de una función declarada `pure`,
///      de modo que la mutabilidad **honesta y compilable** es `view`. `view` no debilita ninguna
///      garantía de seguridad: el contrato sigue sin estado y `view` es lo que corresponde a delegar
///      en `ECDSA.recover`, tal como describe el propio §5.4. La firma de la función (nombre, orden
///      y tipos de los parámetros y valor de retorno) es exactamente la exigida.
contract EIP712Verifier {
    /// @dev `keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")`.
    ///      Es el typehash canónico de EIP-712 (§5.4 del documento técnico).
    bytes32 public constant DOMAIN_TYPEHASH =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

    /// @dev Mitad del orden de secp256k1: `s` debe ser estrictamente menor (EIP-2).
    uint256 private constant _SECP256K1N_HALF =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    /// @notice Verifica una firma EIP-712 sobre un `digest` ya calculado.
    /// @param signer Dirección que se espera como firmante.
    /// @param digest Hash final EIP-712 (`keccak256(0x1901 ‖ domainSeparator ‖ structHash)`).
    /// @param signature Firma de 65 bytes en el orden `r ‖ s ‖ v`, con `v ∈ {27, 28}`.
    /// @return `true` solo si la dirección recuperada coincide **exactamente** con `signer`.
    function verify(address signer, bytes32 digest, bytes calldata signature)
        external
        view
        returns (bool)
    {
        return recover(digest, signature) == signer && signer != address(0);
    }

    /// @notice Calcula el `domain separator` de EIP-712 a partir de los campos del dominio.
    /// @dev Se expone para que el test compruebe que el dominio del fixture reproduce el
    ///      `0x1901` ‖ separator ‖ structHash usado al firmar. La constante `DOMAIN_TYPEHASH` es la
    ///      canónica de EIP-712 (`0x8b73c3c6…b39400f`).
    function domainSeparator(
        string calldata name,
        string calldata version,
        uint256 chainId,
        address verifyingContract
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifyingContract
            )
        );
    }

    /// @notice Sobrecarga de comodidad sobre `domainSeparator` con los cuatro campos del dominio juntos.
    function domainSeparator(EIP712Domain calldata domain) external pure returns (bytes32) {
        return domainSeparator(
            domain.name, domain.version, domain.chainId, domain.verifyingContract
        );
    }

    /// @notice Devuelve el hash final EIP-712 (`digest`) que debe firmarse.
    function hashTypedData(bytes32 separator, bytes32 structHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(hex"1901", separator, structHash));
    }

    /// @notice Variante de `verify` que recibe el mensaje tipado separado en `separator` y `structHash`.
    /// @dev Es la ruta «con `TypedDataEncoder`»: el llamador calcula el hash del struct primario con su
    ///      typehash (aquí `SignMessage(string content,uint256 nonce,uint256 deadline)`) y este contrato
    ///      recompone el digest con `hashTypedData`. Equivale a
    ///      `verify(signer, hashTypedData(separator, structHash), signature)`.
    function verifyTypedData(
        address signer,
        bytes32 separator,
        bytes32 structHash,
        bytes calldata signature
    ) external view returns (bool) {
        return recover(hashTypedData(separator, structHash), signature) == signer
            && signer != address(0);
    }

    /// @notice Recupera la dirección firmante siguiendo las reglas de `ECDSA.recover`.
    /// @return `address(0)` si la firma es inválida o malformada (nunca revierte).
    function recover(bytes32 digest, bytes calldata signature)
        public
        view
        returns (address)
    {
        if (signature.length != 65) {
            return address(0);
        }

        bytes32 r;
        bytes32 s;
        uint8 v;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        // EIP-2: solo se admite la mitad baja del orden; `v` debe ser 27 o 28.
        if (uint256(s) > _SECP256K1N_HALF || (v != 27 && v != 28)) {
            return address(0);
        }
        if (r == bytes32(0) || s == bytes32(0)) {
            return address(0);
        }

        (bool ok, address recovered) = _ecrecoverPrecompile(digest, v, r, s);

        if (!ok || recovered == address(0)) {
            return address(0);
        }
        return recovered;
    }

    /// @dev Invoca el precompilado `ecrecover` (dirección `0x01`) con `staticcall` desde `assembly`.
    ///      Se usa `staticcall` —y no `call`— para que el precompilado no pueda modificar estado, igual
    ///      que hace `ECDSA.recover` de OpenZeppelin. El buffer se escribe en el scratch space
    ///      (`0x00..0x7f`), cuyos 32 primeros bytes se usan luego como salida.
    function _ecrecoverPrecompile(bytes32 digest, uint8 v, bytes32 r, bytes32 s)
        internal
        view
        returns (bool ok, address recovered)
    {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, digest)
            mstore(add(ptr, 0x20), v)
            mstore(add(ptr, 0x40), r)
            mstore(add(ptr, 0x60), s)
            ok := staticcall(gas(), 0x01, ptr, 0x80, 0x00, 0x20)
            recovered := mload(0x00)
        }
    }
}

/// @notice Dominio EIP-712 tal como lo define el fixture (`name`, `version`, `chainId`, `verifyingContract`).
struct EIP712Domain {
    string name;
    string version;
    uint256 chainId;
    address verifyingContract;
}
