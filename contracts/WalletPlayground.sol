// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WalletPlayground
/// @notice Contrato mínimo para probar la CodeCrypto Wallet contra anvil.
/// @dev Permite ejercitar los dos caminos de escritura de la wallet:
///      1. Transferencias nativas  → `deposit()` con `value` (ETH)
///      2. Transacciones con `data` → `increment()` / `setCounter()`
///      y luego verificar el resultado con `cast call`.
contract WalletPlayground {
    /// @notice Valor actual del contador.
    uint256 public counter;

    /// @notice Total de ETH depositado por todos los remitentes.
    uint256 public totalDeposits;

    /// @notice ETH depositado por cada dirección.
    mapping(address account => uint256 amount) public deposits;

    event CounterSet(address indexed caller, uint256 newValue);
    event Deposited(address indexed caller, uint256 amount);

    /// @notice Fija el contador en un valor arbitrario.
    /// @param newValue Nuevo valor del contador.
    function setCounter(uint256 newValue) external {
        counter = newValue;
        emit CounterSet(msg.sender, newValue);
    }

    /// @notice Incrementa el contador en 1.
    function increment() external {
        counter += 1;
        emit CounterSet(msg.sender, counter);
    }

    /// @notice Acepta ETH y lo registra a nombre del remitente.
    function deposit() external payable {
        require(msg.value > 0, "WalletPlayground: amount must be > 0");
        deposits[msg.sender] += msg.value;
        totalDeposits += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Retira el ETH depositado por el remitente.
    function withdraw() external {
        uint256 amount = deposits[msg.sender];
        require(amount > 0, "WalletPlayground: nothing to withdraw");
        deposits[msg.sender] = 0;
        totalDeposits -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "WalletPlayground: transfer failed");
    }

    /// @notice Acepta ETH enviado con una transferencia simple.
    receive() external payable {
        totalDeposits += msg.value;
        deposits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }
}
