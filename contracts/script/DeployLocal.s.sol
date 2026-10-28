// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {PetCoin} from "../src/PetCoin.sol";
import {PetNFT} from "../src/PetNFT.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";

/// @notice Deploys to a local Anvil chain only.
///         Chain ids 4663 and 46630 are unverified planning assumptions.
///         This script refuses every other chain, including those two.
contract DeployLocal is Script {
    error LocalAnvilOnly(uint256 chainId);

    function run() external {
        if (block.chainid != 31337) revert LocalAnvilOnly(block.chainid);

        uint256 cap = vm.envOr("LOCAL_PETC_CAP", uint256(1_000_000 ether));
        address admin = vm.envOr("LOCAL_ADMIN", msg.sender);
        address signer = vm.envOr("LOCAL_RESULT_SIGNER", msg.sender);
        address relayer = vm.envOr("LOCAL_RELAYER", msg.sender);

        vm.startBroadcast();
        PetCoin coin = new PetCoin(cap, admin);
        PetNFT pets = new PetNFT(admin);
        BattleEscrow escrow = new BattleEscrow(
            coin, address(pets), signer, relayer, admin, 10 minutes, 2 minutes, 30 minutes, 1 hours
        );
        vm.stopBroadcast();

        console2.log("PetCoin", address(coin));
        console2.log("PetNFT", address(pets));
        console2.log("BattleEscrow", address(escrow));
    }
}
