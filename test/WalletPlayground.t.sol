// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WalletPlayground} from "../contracts/WalletPlayground.sol";

/// @title WalletPlaygroundTest
/// @notice Pruebas de `forge test` para el contrato de ejemplo.
/// @dev Se escriben sin `forge-std` (sin cheatcodes) para que la entrega del
///      proyecto no dependa de submódulos git: las aserciones se hacen con
///      `require`, que Foundry interpreta como fallo si revierten.
contract WalletPlaygroundTest {
    WalletPlayground internal playground;

    /// @dev Necesario para poder recibir el reembolso de `withdraw()`.
    receive() external payable {}

    function setUp() public {
        playground = new WalletPlayground();
    }

    function testIncrementStartsAtZeroAndIncrements() public {
        require(playground.counter() == 0, "counter inicial != 0");
        playground.increment();
        require(playground.counter() == 1, "counter != 1 tras increment");
        playground.increment();
        require(playground.counter() == 2, "counter != 2 tras segundo increment");
    }

    function testSetCounter() public {
        playground.setCounter(42);
        require(playground.counter() == 42, "counter != 42");
    }

    function testDepositRegistersBalance() public {
        // El propio test envía ETH al contrato: es intencional.
        // forge-lint: disable-next-line(arbitrary-send-eth)
        playground.deposit{value: 1 ether}();
        require(playground.totalDeposits() == 1 ether, "totalDeposits != 1 ether");
        require(playground.deposits(address(this)) == 1 ether, "deposits[this] != 1 ether");
    }

    function testDepositRejectsZero() public {
        (bool ok, ) = address(playground).call(abi.encodeCall(WalletPlayground.deposit, ()));
        require(!ok, "deposit(0) deberia revertir");
    }

    function testWithdrawReturnsFunds() public {
        // forge-lint: disable-next-line(arbitrary-send-eth)
        playground.deposit{value: 2 ether}();
        uint256 before = address(this).balance;
        // `withdraw()` devuelve el ETH al propio test (que implementa receive()).
        // forge-lint: disable-next-line(reentrancy-balance)
        playground.withdraw();
        // forge-lint: disable-next-line(incorrect-strict-equality)
        require(address(this).balance == before + 2 ether, "no se devolvieron los fondos");
        require(playground.deposits(address(this)) == 0, "deposits no se limpio");
        require(playground.totalDeposits() == 0, "totalDeposits no se limpio");
    }

    function testReceiveAcceptsPlainTransfer() public {
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool ok, ) = address(playground).call{value: 1 ether}("");
        require(ok, "receive() revirtio");
        require(playground.totalDeposits() == 1 ether, "totalDeposits != 1 ether");
    }
}
