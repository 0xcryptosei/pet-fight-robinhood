// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PetCoin} from "../src/PetCoin.sol";
import {PetNFT} from "../src/PetNFT.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";

contract EscrowHandler is Test {
    uint256 internal constant SIGNER_KEY = 0xA11CE;
    uint16[5] internal tiers = [uint16(10), 20, 50, 100, 1000];

    PetCoin public coin;
    PetNFT public pets;
    BattleEscrow public escrow;
    address[] public actors;
    uint256[] public roomIds;
    bytes32 internal rulesHash = keccak256("rules-v1");

    constructor() {
        address signer = vm.addr(SIGNER_KEY);
        coin = new PetCoin(1_000_000 ether, address(this));
        pets = new PetNFT(address(this));
        escrow = new BattleEscrow(coin, address(pets), signer, address(this), address(this), 10 minutes, 2 minutes, 30 minutes, 0);
        for (uint256 i = 0; i < 3; ++i) {
            address actor = vm.addr(uint256(keccak256(abi.encode("actor", i))));
            actors.push(actor);
            pets.setAllowlist(actor, true);
            vm.prank(actor);
            pets.claimStarter();
            coin.mint(actor, 200_000 ether);
            vm.prank(actor);
            coin.approve(address(escrow), type(uint256).max);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function createAndFund(uint256 actorSeed, uint256 tierSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint16 tier = tiers[tierSeed % tiers.length];
        uint256 petId = pets.tokenOfOwnerByIndex(actor, 0);
        vm.prank(actor);
        try escrow.createRoom(tier, 1, rulesHash, petId, true) returns (uint256 roomId) {
            roomIds.push(roomId);
            vm.prank(actor);
            try escrow.fund(roomId) {} catch {}
        } catch {}
    }

    function joinRoom(uint256 roomSeed, uint256 actorSeed) external {
        if (roomIds.length == 0) return;
        uint256 roomId = roomIds[roomSeed % roomIds.length];
        address actor = actors[actorSeed % actors.length];
        uint256 petId = pets.tokenOfOwnerByIndex(actor, 0);
        vm.prank(actor);
        try escrow.join(roomId, petId) {} catch {}
    }

    function cancelOrRefund(uint256 roomSeed) external {
        if (roomIds.length == 0) return;
        uint256 roomId = roomIds[roomSeed % roomIds.length];
        try escrow.refund(roomId) {} catch {}
    }

    function startRoom(uint256 roomSeed) external {
        if (roomIds.length == 0) return;
        uint256 roomId = roomIds[roomSeed % roomIds.length];
        try escrow.markStarted(roomId) {} catch {}
    }

    function settleWin(uint256 roomSeed, bool hostWins) external {
        if (roomIds.length == 0) return;
        uint256 roomId = roomIds[roomSeed % roomIds.length];
        (address host, address guest,,,,,,,,,,) = escrow.roomView(roomId);
        if (host == address(0) || guest == address(0)) return;
        BattleEscrow.MatchResult memory result = BattleEscrow.MatchResult({
            matchId: escrow.matchIdOf(roomId),
            roomId: roomId,
            rulesVersion: 1,
            rulesHash: rulesHash,
            player1: host,
            player2: guest,
            winner: hostWins ? host : guest,
            player1Rounds: hostWins ? 2 : 0,
            player2Rounds: hostWins ? 1 : 2,
            transcriptHash: keccak256(abi.encode(roomId, hostWins)),
            deadline: block.timestamp + 1 days
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, escrow.hashResult(result));
        try escrow.settle(result, abi.encodePacked(r, s, v)) {} catch {}
    }

    function settleDraw(uint256 roomSeed) external {
        if (roomIds.length == 0) return;
        uint256 roomId = roomIds[roomSeed % roomIds.length];
        (address host, address guest,,,,,,,,,,) = escrow.roomView(roomId);
        if (guest == address(0)) return;
        BattleEscrow.MatchResult memory result = BattleEscrow.MatchResult({
            matchId: escrow.matchIdOf(roomId),
            roomId: roomId,
            rulesVersion: 1,
            rulesHash: rulesHash,
            player1: host,
            player2: guest,
            winner: address(0),
            player1Rounds: 1,
            player2Rounds: 1,
            transcriptHash: keccak256(abi.encode("draw", roomId)),
            deadline: block.timestamp + 1 days
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, escrow.hashResult(result));
        try escrow.settle(result, abi.encodePacked(r, s, v)) {} catch {}
    }

    function skipTime(uint256 secondsSeed) external {
        vm.warp(block.timestamp + bound(secondsSeed, 1, 40 minutes));
    }

    function sumBalances() external view returns (uint256 sum) {
        for (uint256 i = 0; i < actors.length; ++i) {
            sum += coin.balanceOf(actors[i]);
        }
        sum += coin.balanceOf(address(escrow));
    }
}

contract EscrowInvariant is Test {
    EscrowHandler internal handler;

    function setUp() public {
        handler = new EscrowHandler();
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = handler.createAndFund.selector;
        selectors[1] = handler.joinRoom.selector;
        selectors[2] = handler.cancelOrRefund.selector;
        selectors[3] = handler.startRoom.selector;
        selectors[4] = handler.settleWin.selector;
        selectors[5] = handler.settleDraw.selector;
        selectors[6] = handler.skipTime.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_escrowCoversLockedDeposits() public view {
        assertGe(handler.coin().balanceOf(address(handler.escrow())), handler.escrow().totalLocked());
    }

    function invariant_userLocksMatchTotal() public view {
        uint256 sum;
        uint256 count = handler.actorCount();
        for (uint256 i = 0; i < count; ++i) {
            address actor = handler.actors(i);
            sum += handler.escrow().lockedOf(actor) + handler.escrow().pendingOf(actor);
        }
        assertEq(sum, handler.escrow().totalLocked());
    }

    function invariant_supplyStaysWithActorsOrEscrow() public view {
        assertEq(handler.coin().totalSupply(), handler.sumBalances());
    }
}
