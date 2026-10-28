// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PetCoin} from "../src/PetCoin.sol";
import {PetNFT} from "../src/PetNFT.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";
import {PetShop} from "../src/PetShop.sol";
import {StakingVault} from "../src/StakingVault.sol";

/// @notice Deploys to Robinhood Chain testnet only.
///         Mainnet chain id 4663 and every other chain are refused.
///         The signer must be the funded testnet deployer. The private key is not in this file.
contract DeployRobinhoodTestnet is Script {
    error WrongChain(uint256 chainId);
    error UnexpectedDeployer(address deployer);

    address internal constant DEPLOYER = 0xdc28De74214F892b13727ba54AfA804A5fC0a4a8;
    /// @dev Test `$PET` on Robinhood testnet 46630. Name Pet, symbol PET, 18 decimals. No code on mainnet.
    address internal constant TEST_PET = 0x1E9d9FCe560d8A691d6Bce813460891215300b2b;

    function run() external {
        if (block.chainid != 46630) revert WrongChain(block.chainid);

        vm.startBroadcast();
        if (msg.sender != DEPLOYER) revert UnexpectedDeployer(msg.sender);

        PetCoin coin = new PetCoin(1_000_000 ether, DEPLOYER);
        PetNFT pets = new PetNFT(DEPLOYER, address(coin));
        coin.grantRole(coin.MINTER_ROLE(), address(pets));
        BattleEscrow escrow = new BattleEscrow(
            coin,
            address(pets),
            DEPLOYER,
            DEPLOYER,
            DEPLOYER,
            10 minutes,
            2 minutes,
            30 minutes,
            1 hours
        );
        PetShop shop = new PetShop(coin, DEPLOYER);
        StakingVault vault = new StakingVault(IERC20(TEST_PET), coin, DEPLOYER);
        coin.mint(DEPLOYER, 10_000 ether);
        coin.mint(address(shop), 10_000 ether);
        coin.mint(address(vault), 1_000 ether);
        pets.setAllowlist(DEPLOYER, true);
        pets.claimStarter();
        pets.grantCataloguePet(DEPLOYER, pets.SPECIES_CAT());
        pets.grantCataloguePet(DEPLOYER, pets.SPECIES_PIG());
        pets.grantCataloguePet(DEPLOYER, pets.SPECIES_BIRD());
        vm.stopBroadcast();

        console2.log("PetCoin", address(coin));
        console2.log("PetNFT", address(pets));
        console2.log("BattleEscrow", address(escrow));
        console2.log("PetShop", address(shop));
        console2.log("StakingVault", address(vault));
        console2.log("TestPET", TEST_PET);
    }
}
