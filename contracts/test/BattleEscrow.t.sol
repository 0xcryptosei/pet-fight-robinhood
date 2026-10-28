// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PetCoin} from "../src/PetCoin.sol";
import {PetNFT} from "../src/PetNFT.sol";
import {BattleEscrow} from "../src/BattleEscrow.sol";

contract BattleEscrowTest is Test {
    uint256 internal constant SIGNER_KEY = 0xA11CE;
    uint256 internal constant HOST_KEY = 0x111;
    uint256 internal constant START = 10_000 ether;

    PetCoin internal coin;
    PetNFT internal pets;
    BattleEscrow internal escrow;

    address internal admin = address(this);
    address internal signer;
    address internal relayer;
    address internal host;
    address internal guest;
    address internal stranger;
    uint256 internal hostPet;
    uint256 internal guestPet;
    bytes32 internal rulesHash = keccak256("rules-v1");

    function setUp() public {
        signer = vm.addr(SIGNER_KEY);
        host = vm.addr(HOST_KEY);
        relayer = makeAddr("relayer");
        guest = makeAddr("guest");
        stranger = makeAddr("stranger");

        coin = new PetCoin(1_000_000 ether, admin);
        pets = new PetNFT(admin);
        escrow = new BattleEscrow(coin, address(pets), signer, relayer, admin, 10 minutes, 2 minutes, 30 minutes, 0);

        pets.setAllowlist(host, true);
        pets.setAllowlist(guest, true);
        vm.prank(host);
        hostPet = pets.claimStarter();
        vm.prank(guest);
        guestPet = pets.claimStarter();

        coin.mint(host, START);
        coin.mint(guest, START);
        vm.prank(host);
        coin.approve(address(escrow), START);
        vm.prank(guest);
        coin.approve(address(escrow), START);
    }

    function test_starterClaimIsOneDogAndKeepsItsId() public {
        assertEq(hostPet, 1);
        assertEq(guestPet, 2);
        assertEq(pets.ownerOf(hostPet), host);
        (uint8 speciesId, uint16 level, uint64 xp, uint32 metadataVersion) = pets.pets(hostPet);
        assertEq(speciesId, pets.SPECIES_DOG());
        assertEq(level, 1);
        assertEq(xp, 0);
        assertEq(metadataVersion, 1);

        (bool exists, bool starter, uint16 health, uint16 power, uint16 intelligence, string memory name) =
            pets.species(pets.SPECIES_CAT());
        assertTrue(exists);
        assertFalse(starter);
        assertEq(health, 80);
        assertEq(power, 55);
        assertEq(intelligence, 90);
        assertEq(name, "Cat");

        (exists, starter, health, power, intelligence, name) = pets.species(pets.SPECIES_PIG());
        assertTrue(exists);
        assertFalse(starter);
        assertEq(health, 120);
        assertEq(power, 75);
        assertEq(intelligence, 45);
        assertEq(name, "Pig");

        (exists, starter, health, power, intelligence, name) = pets.species(pets.SPECIES_BIRD());
        assertTrue(exists);
        assertFalse(starter);
        assertEq(health, 65);
        assertEq(power, 45);
        assertEq(intelligence, 70);
        assertEq(name, "Bird");

        uint8 dogId = pets.SPECIES_DOG();
        uint8 catSpecies = pets.SPECIES_CAT();
        uint8 pigSpecies = pets.SPECIES_PIG();
        uint8 birdSpecies = pets.SPECIES_BIRD();
        vm.expectRevert(PetNFT.NotCatalogueSpecies.selector);
        pets.grantCataloguePet(host, dogId);
        uint256 catId = pets.grantCataloguePet(host, catSpecies);
        uint256 pigId = pets.grantCataloguePet(host, pigSpecies);
        uint256 birdId = pets.grantCataloguePet(host, birdSpecies);
        assertEq(pets.ownerOf(catId), host);
        assertEq(pets.ownerOf(pigId), host);
        assertEq(pets.ownerOf(birdId), host);
        (speciesId,,,) = pets.pets(birdId);
        assertEq(speciesId, birdSpecies);
        assertEq(hostPet, 1);

        vm.prank(host);
        vm.expectRevert(PetNFT.AlreadyClaimed.selector);
        pets.claimStarter();

        vm.prank(stranger);
        vm.expectRevert(PetNFT.NotAllowlisted.selector);
        pets.claimStarter();

        pets.setProgression(hostPet, 3, 0, 2);
        assertEq(pets.ownerOf(hostPet), host);
        (, level, xp, metadataVersion) = pets.pets(hostPet);
        assertEq(level, 3);
        assertEq(xp, 0);
        assertEq(metadataVersion, 2);
        (speciesId,,,) = pets.pets(hostPet);
        assertEq(speciesId, pets.SPECIES_DOG());

        vm.expectRevert(PetNFT.BadProgression.selector);
        pets.setProgression(hostPet, 2, 0, 2);
    }

    function test_equipmentCatalogueHasNoStatBonus() public {
        uint256 id = pets.registerEquipment("Plain collar");
        (bool exists, uint16 head, uint16 body, string memory name) = pets.equipment(id);
        assertTrue(exists);
        assertEq(head, 0);
        assertEq(body, 0);
        assertEq(name, "Plain collar");
        vm.prank(host);
        pets.equip(hostPet, id);
        assertEq(pets.equipped(hostPet), id);
        (, uint16 level,,) = pets.pets(hostPet);
        assertEq(level, 1);
    }

    function test_rejectUnknownTierAndSelfJoin() public {
        vm.prank(host);
        vm.expectRevert(BattleEscrow.BadTier.selector);
        escrow.createRoom(15, 1, rulesHash, hostPet, true);

        uint256 roomId = _fund(20);
        vm.prank(host);
        vm.expectRevert(BattleEscrow.SelfJoin.selector);
        escrow.join(roomId, hostPet);
        vm.prank(guest);
        escrow.join(roomId, guestPet);
        vm.prank(stranger);
        vm.expectRevert(BattleEscrow.WrongState.selector);
        escrow.join(roomId, guestPet);
    }

    function test_fullPotAtFeeZero() public {
        uint256 roomId = _start(20);
        uint256 stake = 20 ether;
        _settle(_win(roomId, host, 2, 0));

        assertEq(uint8(_status(roomId)), uint8(BattleEscrow.Status.SETTLED));
        assertEq(coin.balanceOf(host), START - stake + (stake * 2));
        assertEq(coin.balanceOf(guest), START - stake);
        assertEq(coin.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalLocked(), 0);
        assertEq(escrow.lockedOf(host), 0);
        assertEq(escrow.pendingOf(host), 0);
        assertEq(escrow.pendingOf(guest), 0);

        _settleReverts(_win(roomId, host, 2, 0), BattleEscrow.WrongState.selector);
    }

    function test_markStartedDoesNotMoveTokens() public {
        uint256 roomId = _ready(20);
        uint256 escrowBefore = coin.balanceOf(address(escrow));
        uint256 hostBefore = coin.balanceOf(host);
        vm.prank(relayer);
        escrow.markStarted(roomId);
        assertEq(coin.balanceOf(address(escrow)), escrowBefore);
        assertEq(coin.balanceOf(host), hostBefore);
        assertEq(escrow.lockedOf(host), 0);
        assertEq(escrow.pendingOf(host), 20 ether);
        assertEq(escrow.pendingOf(guest), 20 ether);
        assertEq(escrow.totalLocked(), 40 ether);
    }

    function test_drawRefundsBoth() public {
        uint256 roomId = _start(20);
        BattleEscrow.MatchResult memory result = _win(roomId, address(0), 1, 1);
        _settle(result);
        assertEq(coin.balanceOf(host), START);
        assertEq(coin.balanceOf(guest), START);
        assertEq(uint8(_status(roomId)), uint8(BattleEscrow.Status.EXPIRED));
    }

    function test_rejectBadWinners() public {
        uint256 roomId = _start(50);
        _settleReverts(_win(roomId, stranger, 2, 0), BattleEscrow.BadResult.selector);
        _settleReverts(_win(roomId, host, 2, 2), BattleEscrow.BadResult.selector);
        _settleReverts(_win(roomId, host, 1, 0), BattleEscrow.BadResult.selector);
        _settleReverts(_win(roomId, address(0), 2, 0), BattleEscrow.BadResult.selector);
    }

    function test_guestCanSubmitTheRelayerSignature() public {
        uint256 roomId = _start(10);
        BattleEscrow.MatchResult memory result = _win(roomId, guest, 1, 2);
        bytes memory signature = _sign(result);
        vm.prank(guest);
        escrow.settle(result, signature);
        assertEq(coin.balanceOf(guest), START - 10 ether + 20 ether);
        assertEq(coin.balanceOf(host), START - 10 ether);
    }

    function test_cancelAndAllThreeDeadlinesRefund() public {
        uint256 created = _create(10);
        vm.prank(stranger);
        vm.expectRevert(BattleEscrow.NotAllowed.selector);
        escrow.refund(created);
        vm.prank(host);
        escrow.refund(created);
        assertEq(uint8(_status(created)), uint8(BattleEscrow.Status.CANCELLED));
        assertEq(coin.balanceOf(host), START);

        uint256 funded = _fund(100);
        (, , , , , uint64 joinDeadline,,,,,,) = escrow.roomView(funded);
        vm.warp(joinDeadline);
        vm.prank(stranger);
        escrow.refund(funded);
        assertEq(coin.balanceOf(host), START);
        assertEq(uint8(_status(funded)), uint8(BattleEscrow.Status.EXPIRED));

        uint256 ready = _ready(20);
        (, , , , , , uint64 startDeadline,,,,,) = escrow.roomView(ready);
        vm.warp(startDeadline - 1);
        vm.expectRevert(BattleEscrow.TooEarly.selector);
        escrow.refund(ready);
        vm.warp(startDeadline);
        escrow.refund(ready);
        assertEq(coin.balanceOf(host), START);
        assertEq(coin.balanceOf(guest), START);

        uint256 live = _start(1000);
        (, , , , , , , uint64 settleDeadline,,,,) = escrow.roomView(live);
        vm.warp(settleDeadline - 1);
        vm.expectRevert(BattleEscrow.TooEarly.selector);
        escrow.refund(live);
        vm.warp(settleDeadline);
        escrow.refund(live);
        assertEq(coin.balanceOf(host), START);
        assertEq(coin.balanceOf(guest), START);
        assertEq(escrow.totalLocked(), 0);
    }

    function test_hostCancelWhileFundedRefundsOnlyTheHost() public {
        uint256 roomId = _fund(20);
        vm.prank(host);
        escrow.refund(roomId);
        assertEq(uint8(_status(roomId)), uint8(BattleEscrow.Status.CANCELLED));
        assertEq(coin.balanceOf(host), START);
        assertEq(coin.balanceOf(guest), START);
    }

    function test_feeChangeDoesNotRewriteAFundedRoom() public {
        uint256 first = _create(20);
        address treasury = makeAddr("fee");
        escrow.proposeFeeRecipient(treasury);
        escrow.executeFeeRecipient();
        escrow.proposeFee(500);
        escrow.executeFee();

        (, , , , uint16 firstFee,,,,,,,) = escrow.roomView(first);
        assertEq(firstFee, 0);
        uint256 second = _start(20);
        (, , , , uint16 secondFee,,,,,,,) = escrow.roomView(second);
        assertEq(secondFee, 500);

        uint256 hostBefore = coin.balanceOf(host);
        uint256 guestBefore = coin.balanceOf(guest);
        _settle(_win(second, host, 2, 0));
        uint256 pot = 40 ether;
        uint256 fee = (pot * 500) / 10_000;
        assertEq(coin.balanceOf(host), hostBefore + (pot - fee));
        assertEq(coin.balanceOf(guest), guestBefore);
        assertEq(coin.balanceOf(treasury), fee);
        assertEq(coin.balanceOf(address(escrow)), 0);
    }

    function testFuzz_payoutMatchesFeeMath(uint16 bps, uint8 tierIndex) public {
        bps = uint16(bound(bps, 0, escrow.MAX_FEE_BPS()));
        uint16[5] memory tiers = [uint16(10), 20, 50, 100, 1000];
        uint16 tier = tiers[bound(tierIndex, 0, 4)];
        if (bps > 0) {
            escrow.proposeFeeRecipient(makeAddr("fee-fuzz"));
            escrow.executeFeeRecipient();
            escrow.proposeFee(bps);
            escrow.executeFee();
        }
        uint256 roomId = _start(tier);
        uint256 hostBefore = coin.balanceOf(host);
        uint256 guestBefore = coin.balanceOf(guest);
        address recipient = escrow.feeRecipient();
        uint256 recipientBefore = recipient == address(0) ? 0 : coin.balanceOf(recipient);
        _settle(_win(roomId, host, 2, 1));
        uint256 pot = uint256(tier) * 1e18 * 2;
        uint256 fee = (pot * bps) / 10_000;
        assertEq(coin.balanceOf(host) - hostBefore, pot - fee);
        assertEq(coin.balanceOf(guest), guestBefore);
        if (fee > 0) assertEq(coin.balanceOf(recipient) - recipientBefore, fee);
        assertEq(coin.balanceOf(address(escrow)), 0);
    }

    function test_signerRotationKillsUnsubmittedSignatures() public {
        uint256 roomId = _start(20);
        BattleEscrow.MatchResult memory result = _win(roomId, host, 2, 0);
        bytes memory oldSignature = _sign(result);
        uint256 nextKey = 0xB0B;
        escrow.proposeSigner(vm.addr(nextKey));
        escrow.executeSigner();
        vm.expectRevert(BattleEscrow.BadSigner.selector);
        escrow.settle(result, oldSignature);

        bytes32 digest = escrow.hashResult(result);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(nextKey, digest);
        escrow.settle(result, abi.encodePacked(r, s, v));
        assertEq(uint8(_status(roomId)), uint8(BattleEscrow.Status.SETTLED));
    }

    function test_signatureFromAnotherChainIsRejected() public {
        uint256 roomId = _start(20);
        BattleEscrow.MatchResult memory result = _win(roomId, host, 2, 0);
        bytes32 structHash = keccak256(
            abi.encode(
                escrow.MATCH_RESULT_TYPEHASH(),
                result.matchId,
                result.roomId,
                result.rulesVersion,
                result.rulesHash,
                result.player1,
                result.player2,
                result.winner,
                result.player1Rounds,
                result.player2Rounds,
                result.transcriptHash,
                result.deadline
            )
        );
        bytes32 domainType = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        bytes32 thisDomain = keccak256(
            abi.encode(domainType, keccak256(bytes("BattleEscrow")), keccak256(bytes("1")), block.chainid, address(escrow))
        );
        bytes32 thisDigest = keccak256(abi.encodePacked("\x19\x01", thisDomain, structHash));
        assertEq(thisDigest, escrow.hashResult(result));

        bytes32 otherDomain = keccak256(
            abi.encode(domainType, keccak256(bytes("BattleEscrow")), keccak256(bytes("1")), block.chainid + 1, address(escrow))
        );
        bytes32 otherDigest = keccak256(abi.encodePacked("\x19\x01", otherDomain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, otherDigest);
        vm.expectRevert(BattleEscrow.BadSigner.selector);
        escrow.settle(result, abi.encodePacked(r, s, v));
    }

    function test_pauseBlocksNewDepositsAndStillRefunds() public {
        uint256 roomId = _fund(20);
        escrow.pause();
        vm.prank(guest);
        vm.expectRevert();
        escrow.join(roomId, guestPet);
        vm.prank(host);
        escrow.refund(roomId);
        assertEq(coin.balanceOf(host), START);

        escrow.unpause();
        uint256 live = _start(20);
        escrow.pause();
        _settle(_win(live, host, 2, 0));
        assertEq(coin.balanceOf(host), START - 20 ether + 40 ether);
    }

    function test_exactPermitFundsTheRoom() public {
        uint256 roomId = _create(20);
        vm.prank(host);
        coin.approve(address(escrow), 0);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                host,
                address(escrow),
                20 ether,
                coin.nonces(host),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", coin.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(HOST_KEY, digest);
        vm.prank(host);
        escrow.fundWithPermit(roomId, deadline, v, r, s);
        assertEq(uint8(_status(roomId)), uint8(BattleEscrow.Status.HOST_FUNDED));
        assertEq(coin.allowance(host, address(escrow)), 0);
        assertEq(escrow.lockedOf(host), 20 ether);
    }

    function test_transferAfterFundingDoesNotReplaceTheCombatant() public {
        uint256 roomId = _fund(20);
        vm.prank(host);
        pets.transferFrom(host, stranger, hostPet);
        (, , , , , , , , , , uint256 recordedPet,) = escrow.roomView(roomId);
        assertEq(recordedPet, hostPet);
        assertEq(pets.ownerOf(hostPet), stranger);
        vm.prank(guest);
        escrow.join(roomId, guestPet);
        (address recordedHost,,,,,,,,,,,) = escrow.roomView(roomId);
        assertEq(recordedHost, host);
    }

    function test_tierRemovalDoesNotChangeAnExistingStake() public {
        uint256 roomId = _fund(50);
        escrow.proposeTier(50, false);
        escrow.executeTier();
        (, , uint256 recordedStake,,,,,,,,,) = escrow.roomView(roomId);
        assertEq(recordedStake, 50 ether);
        vm.prank(host);
        vm.expectRevert(BattleEscrow.BadTier.selector);
        escrow.createRoom(50, 1, rulesHash, hostPet, false);
    }

    function test_feeAboveCapIsRejected() public {
        vm.expectRevert(BattleEscrow.FeeCap.selector);
        escrow.proposeFee(501);
    }

    function _create(uint16 tier) internal returns (uint256 roomId) {
        vm.prank(host);
        roomId = escrow.createRoom(tier, 1, rulesHash, hostPet, true);
    }

    function _fund(uint16 tier) internal returns (uint256 roomId) {
        roomId = _create(tier);
        vm.prank(host);
        escrow.fund(roomId);
    }

    function _ready(uint16 tier) internal returns (uint256 roomId) {
        roomId = _fund(tier);
        vm.prank(guest);
        escrow.join(roomId, guestPet);
    }

    function _start(uint16 tier) internal returns (uint256 roomId) {
        roomId = _ready(tier);
        vm.prank(host);
        escrow.markStarted(roomId);
    }

    function _win(uint256 roomId, address winner, uint8 hostRounds, uint8 guestRounds)
        internal
        view
        returns (BattleEscrow.MatchResult memory result)
    {
        result = BattleEscrow.MatchResult({
            matchId: escrow.matchIdOf(roomId),
            roomId: roomId,
            rulesVersion: 1,
            rulesHash: rulesHash,
            player1: host,
            player2: guest,
            winner: winner,
            player1Rounds: hostRounds,
            player2Rounds: guestRounds,
            transcriptHash: keccak256("transcript"),
            deadline: block.timestamp + 1 days
        });
    }

    function _sign(BattleEscrow.MatchResult memory result) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, escrow.hashResult(result));
        return abi.encodePacked(r, s, v);
    }

    function _settle(BattleEscrow.MatchResult memory result) internal {
        escrow.settle(result, _sign(result));
    }

    function _settleReverts(BattleEscrow.MatchResult memory result, bytes4 selector) internal {
        bytes memory signature = _sign(result);
        vm.expectRevert(selector);
        escrow.settle(result, signature);
    }

    function _status(uint256 roomId) internal view returns (BattleEscrow.Status status) {
        (,,,,,,,,, status,,) = escrow.roomView(roomId);
    }
}
