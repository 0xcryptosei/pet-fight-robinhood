// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PetCoin} from "../src/PetCoin.sol";
import {PetShop} from "../src/PetShop.sol";
import {StakingVault} from "../src/StakingVault.sol";

contract MockPet is ERC20 {
    constructor() ERC20("PET", "PET") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract Phase5Test is Test {
    PetCoin internal petc;
    MockPet internal pet;
    PetShop internal shop;
    StakingVault internal vault;

    address internal admin = address(this);
    address internal buyer = address(0xB0B);
    address internal staker = address(0x57A);

    function setUp() public {
        petc = new PetCoin(1_000_000 ether, admin);
        pet = new MockPet();
        shop = new PetShop(petc, admin);
        vault = new StakingVault(pet, petc, admin);
        petc.mint(address(shop), 100_000 ether);
        petc.mint(admin, 1_000 ether);
        petc.approve(address(vault), type(uint256).max);
        pet.mint(staker, 1_000 ether);
        vm.prank(staker);
        pet.approve(address(vault), type(uint256).max);
        vm.deal(buyer, 1 ether);
    }

    function test_buyPriceIsTenThousandPetcPerEth() public {
        vm.prank(buyer);
        shop.buy{value: 0.0001 ether}();
        assertEq(petc.balanceOf(buyer), 1 ether);
        assertEq(buyer.balance, 1 ether - 0.0001 ether);
        assertEq(address(shop).balance, 0.0001 ether);
    }

    function test_buyRevertsWhenInventoryIsShort() public {
        vm.deal(buyer, 11 ether);
        vm.prank(buyer);
        vm.expectRevert(PetShop.InventoryShort.selector);
        shop.buy{value: 11 ether}();
    }

    function test_buyerCannotWithdrawProceeds() public {
        vm.prank(buyer);
        shop.buy{value: 0.001 ether}();
        vm.prank(buyer);
        vm.expectRevert();
        shop.withdrawProceeds(buyer);
        assertEq(petc.balanceOf(buyer), 10 ether);
    }

    function test_adminWithdrawsEthProceedsOnly() public {
        vm.prank(buyer);
        shop.buy{value: 0.001 ether}();
        address treasury = address(0xAD);
        uint256 before = treasury.balance;
        shop.withdrawProceeds(treasury);
        assertEq(treasury.balance - before, 0.001 ether);
        assertEq(address(shop).balance, 0);
        assertEq(petc.balanceOf(buyer), 10 ether);
    }

    function test_stakePaysOneMillionthPetcPerPetPerDayFromThePool() public {
        vault.fundRewards(100 ether);
        vm.prank(staker);
        vault.stake(100 ether);
        vm.warp(block.timestamp + 1 days);
        vm.prank(staker);
        vault.claim();
        assertEq(petc.balanceOf(staker), 0.0001 ether);
        assertEq(pet.balanceOf(address(vault)), 100 ether);
        assertEq(pet.balanceOf(staker), 900 ether);
    }

    function test_unstakeBeforeLockRevertsAndAfterLockReturnsPet() public {
        vm.prank(staker);
        vault.stake(100 ether);
        vm.prank(staker);
        vm.expectRevert(StakingVault.Locked.selector);
        vault.withdraw(100 ether);
        vm.warp(block.timestamp + 7 days);
        vm.prank(staker);
        vault.withdraw(100 ether);
        assertEq(pet.balanceOf(staker), 1_000 ether);
        assertEq(vault.totalStaked(), 0);
    }

    function test_claimRevertsWhenThePoolIsEmptyAndKeepsTheStake() public {
        vm.prank(staker);
        vault.stake(100 ether);
        vm.warp(block.timestamp + 1 days);
        vm.prank(staker);
        vm.expectRevert(StakingVault.PoolShort.selector);
        vault.claim();
        (uint256 amount,,,) = vault.positions(staker);
        assertEq(amount, 100 ether);
        assertGt(vault.pendingReward(staker), 0);
    }

    function test_sameTokenVaultReverts() public {
        vm.expectRevert(StakingVault.SameToken.selector);
        new StakingVault(petc, petc, admin);
    }

    function test_pauseBlocksNewStakeAndStillAllowsClaim() public {
        vault.fundRewards(100 ether);
        vm.prank(staker);
        vault.stake(100 ether);
        vault.pause();
        vm.prank(staker);
        vm.expectRevert();
        vault.stake(1 ether);
        vm.warp(block.timestamp + 1 days);
        vm.prank(staker);
        vault.claim();
        assertEq(petc.balanceOf(staker), 0.0001 ether);
    }
}
