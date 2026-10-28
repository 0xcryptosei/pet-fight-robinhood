// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PetCoin} from "../src/PetCoin.sol";
import {PetNFT} from "../src/PetNFT.sol";
import {PetUpgrade} from "../src/PetUpgrade.sol";

contract PetUpgradeTest is Test {
    PetCoin internal petc;
    PetNFT internal pets;
    PetUpgrade internal shop;

    address internal buyer = address(0xB0B);
    uint256 internal dogId;

    function setUp() public {
        petc = new PetCoin(1_000_000 ether, address(this));
        pets = new PetNFT(address(this), address(petc));
        shop = new PetUpgrade(petc, pets, address(this));
        petc.mint(buyer, 1_000 ether);
        pets.setAllowlist(buyer, true);
        vm.startPrank(buyer);
        dogId = pets.claimStarter();
        petc.approve(address(shop), type(uint256).max);
        vm.stopPrank();
    }

    function test_upgradeSavesGearAndTakesPetc() public {
        vm.prank(buyer);
        shop.buyUpgrade(dogId);
        (uint64 hat, uint64 cloth, uint64 shoes, uint64 food, uint16 level) = shop.gear(dogId);
        assertEq(hat, 1);
        assertEq(cloth, 1);
        assertEq(shoes, 1);
        assertEq(food, 3);
        assertEq(level, 2);
        assertEq(petc.balanceOf(buyer), 400 ether);
        assertEq(petc.balanceOf(address(shop)), 600 ether);
        (, uint16 nftLevel,,) = pets.pets(dogId);
        assertEq(nftLevel, 1);
    }

    function test_upgradeWritesNftLevelWhenGranted() public {
        pets.grantRole(pets.PROGRESSION_ROLE(), address(shop));
        vm.prank(buyer);
        shop.buyUpgrade(dogId);
        (, uint16 nftLevel,,) = pets.pets(dogId);
        assertEq(nftLevel, 2);
        (,,,, uint16 saved) = shop.gear(dogId);
        assertEq(saved, 2);
    }

    function test_buyItemSavesThatItemOnly() public {
        vm.prank(buyer);
        shop.buyItem(dogId, 2);
        (uint64 hat, uint64 cloth, uint64 shoes, uint64 food, uint16 level) = shop.gear(dogId);
        assertEq(hat, 0);
        assertEq(cloth, 0);
        assertEq(shoes, 1);
        assertEq(food, 0);
        assertEq(level, 0);
        assertEq(petc.balanceOf(address(shop)), 100 ether);
    }

    function test_secondUpgradeAddsToSavedGear() public {
        petc.mint(buyer, 600 ether);
        vm.startPrank(buyer);
        shop.buyUpgrade(dogId);
        shop.buyUpgrade(dogId);
        vm.stopPrank();
        (uint64 hat,, uint64 shoes, uint64 food, uint16 level) = shop.gear(dogId);
        assertEq(hat, 2);
        assertEq(shoes, 2);
        assertEq(food, 6);
        assertEq(level, 3);
        assertEq(petc.balanceOf(address(shop)), 1_200 ether);
    }

    function test_strangerCannotUpgrade() public {
        address stranger = address(0x1234);
        petc.mint(stranger, 600 ether);
        vm.startPrank(stranger);
        petc.approve(address(shop), type(uint256).max);
        vm.expectRevert(PetUpgrade.NotOwner.selector);
        shop.buyUpgrade(dogId);
        vm.stopPrank();
        assertEq(petc.balanceOf(stranger), 600 ether);
    }

    function test_shortBalanceRevertsAndKeepsPetc() public {
        address poor = address(0x1234);
        petc.mint(poor, 599 ether);
        pets.setAllowlist(poor, true);
        vm.startPrank(poor);
        uint256 id = pets.claimStarter();
        petc.approve(address(shop), type(uint256).max);
        vm.expectRevert();
        shop.buyUpgrade(id);
        vm.stopPrank();
        (,,,, uint16 level) = shop.gear(id);
        assertEq(level, 0);
        assertEq(petc.balanceOf(poor), 599 ether);
    }
}
