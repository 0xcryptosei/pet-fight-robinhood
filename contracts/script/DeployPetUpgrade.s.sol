// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PetNFT} from "../src/PetNFT.sol";
import {PetUpgrade} from "../src/PetUpgrade.sol";

/// @notice Deploys only the upgrade shop on Robinhood testnet.
///         It uses the PETC contract that is already deployed. It does not deploy a new pet or coin.
contract DeployPetUpgrade is Script {
    error WrongChain(uint256 chainId);

    address internal constant PETC = 0xD33BbB7C15DFc7334c3D2CefA3acbb51fa24c6f2;
    address internal constant PETS = 0x2995Ab130Ff920D964E57e260a2Ffce1A1B8966F;

    function run() external {
        if (block.chainid != 46630) revert WrongChain(block.chainid);
        vm.startBroadcast();
        PetNFT pets = PetNFT(PETS);
        PetUpgrade shop = new PetUpgrade(IERC20(PETC), pets, msg.sender);
        pets.grantRole(pets.PROGRESSION_ROLE(), address(shop));
        vm.stopBroadcast();
        console2.log("PetUpgrade", address(shop));
    }
}
