// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IPetNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice Fixed-tier room deposits, three deadlines, and one EIP-712 settlement per room.
///         The result signer cannot withdraw. There is no admin function that picks a winner
///         or edits a funded room. Pause blocks new rooms and new deposits only.
contract BattleEscrow is EIP712, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 500;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    bytes32 public constant MATCH_RESULT_TYPEHASH = keccak256(
        "MatchResult(bytes32 matchId,uint256 roomId,uint32 rulesVersion,bytes32 rulesHash,address player1,address player2,address winner,uint8 player1Rounds,uint8 player2Rounds,bytes32 transcriptHash,uint256 deadline)"
    );
    bytes32 private constant FEE_KEY = keccak256("fee");
    bytes32 private constant SIGNER_KEY = keccak256("signer");
    bytes32 private constant RELAYER_KEY = keccak256("relayer");
    bytes32 private constant RECIPIENT_KEY = keccak256("feeRecipient");
    bytes32 private constant TIER_KEY = keccak256("tier");

    enum Status {
        NONE,
        CREATED,
        HOST_FUNDED,
        READY,
        SETTLED,
        CANCELLED,
        EXPIRED
    }

    enum RefundReason {
        Cancel,
        JoinExpired,
        StartExpired,
        SettleExpired,
        Draw
    }

    struct Room {
        address host;
        address guest;
        uint256 hostPetId;
        uint256 guestPetId;
        uint256 stake;
        uint16 stakeTier;
        uint16 feeBps;
        uint32 rulesVersion;
        bytes32 rulesHash;
        uint64 joinDeadline;
        uint64 startDeadline;
        uint64 settleDeadline;
        uint64 startedAt;
        Status status;
        bytes32 transcriptHash;
        address winner;
        bool isPublic;
    }

    struct MatchResult {
        bytes32 matchId;
        uint256 roomId;
        uint32 rulesVersion;
        bytes32 rulesHash;
        address player1;
        address player2;
        address winner;
        uint8 player1Rounds;
        uint8 player2Rounds;
        bytes32 transcriptHash;
        uint256 deadline;
    }

    struct Pending {
        bool active;
        uint64 eta;
        uint256 value;
        address addr;
        bool flag;
    }

    IERC20 public immutable petc;
    IPetNFT public immutable pets;
    uint48 public immutable joinWindow;
    uint48 public immutable startWindow;
    uint48 public immutable settleWindow;
    uint48 public immutable timelockDelay;

    address public resultSigner;
    address public relayer;
    address public feeRecipient;
    uint16 public feeBps;
    uint256 public nextRoomId = 1;
    uint256 public totalLocked;

    mapping(uint256 => Room) public rooms;
    mapping(uint16 => bool) public tierEnabled;
    mapping(address => uint256) public lockedOf;
    mapping(address => uint256) public pendingOf;
    mapping(bytes32 => Pending) private proposals;

    event RoomCreated(
        uint256 indexed roomId,
        address indexed host,
        uint16 stakeTier,
        uint256 stake,
        uint16 feeBps,
        uint32 rulesVersion,
        bytes32 rulesHash,
        uint64 joinDeadline,
        uint256 hostPetId,
        bool isPublic
    );
    event RoomFunded(uint256 indexed roomId, address indexed host, uint256 amount);
    event RoomJoined(uint256 indexed roomId, address indexed guest, uint256 guestPetId, uint256 amount, uint64 startDeadline);
    event RoomStarted(uint256 indexed roomId, uint64 startedAt, uint64 settleDeadline);
    event RoomSettled(
        uint256 indexed roomId,
        bytes32 indexed matchId,
        address winner,
        uint256 payout,
        uint256 fee,
        bytes32 transcriptHash,
        uint8 player1Rounds,
        uint8 player2Rounds
    );
    event RoomRefunded(uint256 indexed roomId, Status status, RefundReason reason, uint256 hostAmount, uint256 guestAmount);
    event ParameterProposed(bytes32 indexed key, uint256 value, address addr, bool flag, uint64 eta);
    event FeeUpdated(uint16 feeBps);
    event SignerUpdated(address signer);
    event RelayerUpdated(address relayer);
    event FeeRecipientUpdated(address recipient);
    event TierUpdated(uint16 stakeTier, bool enabled);

    error ZeroAddress();
    error BadTier();
    error BadRules();
    error FeeCap();
    error NoFeeRecipient();
    error WrongState();
    error TooEarly();
    error Expired();
    error NotAllowed();
    error SelfJoin();
    error NotPetOwner();
    error BadSigner();
    error BadResult();
    error ProposalNotReady();
    error WindowUnset();

    constructor(
        IERC20 petc_,
        address pets_,
        address signer_,
        address relayer_,
        address admin_,
        uint48 joinWindow_,
        uint48 startWindow_,
        uint48 settleWindow_,
        uint48 timelockDelay_
    ) EIP712("BattleEscrow", "1") {
        if (address(petc_) == address(0) || pets_ == address(0) || signer_ == address(0) || admin_ == address(0)) {
            revert ZeroAddress();
        }
        if (joinWindow_ == 0 || startWindow_ == 0 || settleWindow_ == 0) revert WindowUnset();
        petc = petc_;
        pets = IPetNFT(pets_);
        resultSigner = signer_;
        relayer = relayer_;
        joinWindow = joinWindow_;
        startWindow = startWindow_;
        settleWindow = settleWindow_;
        timelockDelay = timelockDelay_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        tierEnabled[10] = true;
        tierEnabled[20] = true;
        tierEnabled[50] = true;
        tierEnabled[100] = true;
        tierEnabled[1000] = true;
    }

    function createRoom(uint16 stakeTier, uint32 rulesVersion, bytes32 rulesHash, uint256 hostPetId, bool isPublic)
        external
        whenNotPaused
        returns (uint256 roomId)
    {
        if (!tierEnabled[stakeTier]) revert BadTier();
        if (rulesVersion == 0 || rulesHash == bytes32(0)) revert BadRules();
        if (feeBps > 0 && feeRecipient == address(0)) revert NoFeeRecipient();
        if (pets.ownerOf(hostPetId) != msg.sender) revert NotPetOwner();

        roomId = nextRoomId++;
        uint64 deadline = uint64(block.timestamp + joinWindow);
        rooms[roomId] = Room({
            host: msg.sender,
            guest: address(0),
            hostPetId: hostPetId,
            guestPetId: 0,
            stake: uint256(stakeTier) * 1e18,
            stakeTier: stakeTier,
            feeBps: feeBps,
            rulesVersion: rulesVersion,
            rulesHash: rulesHash,
            joinDeadline: deadline,
            startDeadline: 0,
            settleDeadline: 0,
            startedAt: 0,
            status: Status.CREATED,
            transcriptHash: bytes32(0),
            winner: address(0),
            isPublic: isPublic
        });
        emit RoomCreated(roomId, msg.sender, stakeTier, uint256(stakeTier) * 1e18, feeBps, rulesVersion, rulesHash, deadline, hostPetId, isPublic);
    }

    function fund(uint256 roomId) external nonReentrant whenNotPaused {
        _fund(roomId);
    }

    /// @notice Exact-tier permit. Callers should not sign an unlimited allowance.
    function fundWithPermit(uint256 roomId, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
        whenNotPaused
    {
        Room storage room = rooms[roomId];
        if (room.status != Status.CREATED || room.host != msg.sender) revert WrongState();
        IERC20Permit(address(petc)).permit(msg.sender, address(this), room.stake, deadline, v, r, s);
        _fund(roomId);
    }

    function join(uint256 roomId, uint256 guestPetId) external nonReentrant whenNotPaused {
        _join(roomId, guestPetId);
    }

    function joinWithPermit(uint256 roomId, uint256 guestPetId, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
        whenNotPaused
    {
        Room storage room = rooms[roomId];
        if (room.status != Status.HOST_FUNDED) revert WrongState();
        IERC20Permit(address(petc)).permit(msg.sender, address(this), room.stake, deadline, v, r, s);
        _join(roomId, guestPetId);
    }

    /// @notice Records the start time and the settle deadline. Does not move tokens.
    function markStarted(uint256 roomId) external {
        Room storage room = rooms[roomId];
        if (room.status != Status.READY || room.startedAt != 0) revert WrongState();
        if (block.timestamp >= room.startDeadline) revert Expired();
        if (msg.sender != room.host && msg.sender != room.guest && msg.sender != relayer) revert NotAllowed();
        room.startedAt = uint64(block.timestamp);
        room.settleDeadline = uint64(block.timestamp + settleWindow);
        _moveToPending(room.host, room.stake);
        _moveToPending(room.guest, room.stake);
        emit RoomStarted(roomId, room.startedAt, room.settleDeadline);
    }

    function settle(MatchResult calldata result, bytes calldata signature) external nonReentrant {
        Room storage room = rooms[result.roomId];
        if (room.status != Status.READY || room.startedAt == 0) revert WrongState();
        if (block.timestamp >= room.settleDeadline || block.timestamp >= result.deadline) revert Expired();
        if (result.matchId != matchIdOf(result.roomId)) revert BadResult();
        if (result.rulesVersion != room.rulesVersion || result.rulesHash != room.rulesHash) revert BadResult();
        if (result.player1 != room.host || result.player2 != room.guest) revert BadResult();
        address signer = ECDSA.recover(_hashTypedDataV4(_hashResult(result)), signature);
        if (signer != resultSigner) revert BadSigner();

        room.transcriptHash = result.transcriptHash;
        if (result.winner == address(0)) {
            if (result.player1Rounds >= 2 || result.player2Rounds >= 2) revert BadResult();
            _refund(result.roomId, Status.EXPIRED, RefundReason.Draw);
            return;
        }
        if (result.winner != room.host && result.winner != room.guest) revert BadResult();
        uint8 winnerRounds = result.winner == room.host ? result.player1Rounds : result.player2Rounds;
        uint8 loserRounds = result.winner == room.host ? result.player2Rounds : result.player1Rounds;
        if (winnerRounds < 2 || winnerRounds <= loserRounds) revert BadResult();

        uint256 pot = room.stake * 2;
        uint256 fee = (pot * room.feeBps) / BPS_DENOMINATOR;
        uint256 payout = pot - fee;
        room.status = Status.SETTLED;
        room.winner = result.winner;
        _clearPending(room.host, room.stake);
        _clearPending(room.guest, room.stake);
        if (payout > 0) petc.safeTransfer(result.winner, payout);
        if (fee > 0) petc.safeTransfer(feeRecipient, fee);
        emit RoomSettled(
            result.roomId, result.matchId, result.winner, payout, fee, result.transcriptHash, result.player1Rounds, result.player2Rounds
        );
    }

    /// @notice Permissionless refund for a host cancel, or after join, start, or settle deadline.
    function refund(uint256 roomId) external nonReentrant {
        Room storage room = rooms[roomId];
        Status status = room.status;
        if (status == Status.CREATED) {
            if (block.timestamp < room.joinDeadline && msg.sender != room.host) revert NotAllowed();
            room.status = block.timestamp < room.joinDeadline ? Status.CANCELLED : Status.EXPIRED;
            emit RoomRefunded(roomId, room.status, block.timestamp < room.joinDeadline ? RefundReason.Cancel : RefundReason.JoinExpired, 0, 0);
            return;
        }
        if (status == Status.HOST_FUNDED) {
            if (block.timestamp < room.joinDeadline && msg.sender != room.host) revert NotAllowed();
            bool hostCancel = block.timestamp < room.joinDeadline;
            _refund(roomId, hostCancel ? Status.CANCELLED : Status.EXPIRED, hostCancel ? RefundReason.Cancel : RefundReason.JoinExpired);
            return;
        }
        if (status == Status.READY && room.startedAt == 0) {
            if (block.timestamp < room.startDeadline) revert TooEarly();
            _refund(roomId, Status.EXPIRED, RefundReason.StartExpired);
            return;
        }
        if (status == Status.READY && room.startedAt != 0) {
            if (block.timestamp < room.settleDeadline) revert TooEarly();
            _refund(roomId, Status.EXPIRED, RefundReason.SettleExpired);
            return;
        }
        revert WrongState();
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function proposeFee(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_FEE_BPS) revert FeeCap();
        _propose(FEE_KEY, bps, address(0), false);
    }

    function executeFee() external {
        Pending memory proposal = _take(FEE_KEY);
        if (proposal.value > 0 && feeRecipient == address(0)) revert NoFeeRecipient();
        feeBps = uint16(proposal.value);
        emit FeeUpdated(feeBps);
    }

    function proposeSigner(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next == address(0)) revert ZeroAddress();
        _propose(SIGNER_KEY, 0, next, false);
    }

    function executeSigner() external {
        resultSigner = _take(SIGNER_KEY).addr;
        emit SignerUpdated(resultSigner);
    }

    function proposeRelayer(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _propose(RELAYER_KEY, 0, next, false);
    }

    function executeRelayer() external {
        relayer = _take(RELAYER_KEY).addr;
        emit RelayerUpdated(relayer);
    }

    function proposeFeeRecipient(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next == address(0)) revert ZeroAddress();
        _propose(RECIPIENT_KEY, 0, next, false);
    }

    function executeFeeRecipient() external {
        feeRecipient = _take(RECIPIENT_KEY).addr;
        emit FeeRecipientUpdated(feeRecipient);
    }

    function proposeTier(uint16 stakeTier, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (stakeTier == 0) revert BadTier();
        _propose(TIER_KEY, stakeTier, address(0), enabled);
    }

    function executeTier() external {
        Pending memory proposal = _take(TIER_KEY);
        tierEnabled[uint16(proposal.value)] = proposal.flag;
        emit TierUpdated(uint16(proposal.value), proposal.flag);
    }

    function roomView(uint256 roomId)
        external
        view
        returns (
            address host,
            address guest,
            uint256 stake,
            uint16 stakeTier,
            uint16 roomFeeBps,
            uint64 joinDeadline,
            uint64 startDeadline,
            uint64 settleDeadline,
            uint64 startedAt,
            Status status,
            uint256 hostPetId,
            bool isPublic
        )
    {
        Room storage room = rooms[roomId];
        return (
            room.host,
            room.guest,
            room.stake,
            room.stakeTier,
            room.feeBps,
            room.joinDeadline,
            room.startDeadline,
            room.settleDeadline,
            room.startedAt,
            room.status,
            room.hostPetId,
            room.isPublic
        );
    }

    function matchIdOf(uint256 roomId) public pure returns (bytes32) {
        return keccak256(abi.encode(roomId, uint256(1)));
    }

    function hashResult(MatchResult calldata result) external view returns (bytes32) {
        return _hashTypedDataV4(_hashResult(result));
    }

    function _fund(uint256 roomId) internal {
        Room storage room = rooms[roomId];
        if (room.status != Status.CREATED || msg.sender != room.host) revert WrongState();
        if (block.timestamp >= room.joinDeadline) revert Expired();
        if (pets.ownerOf(room.hostPetId) != room.host) revert NotPetOwner();
        room.status = Status.HOST_FUNDED;
        _addLocked(room.host, room.stake);
        petc.safeTransferFrom(room.host, address(this), room.stake);
        emit RoomFunded(roomId, room.host, room.stake);
    }

    function _join(uint256 roomId, uint256 guestPetId) internal {
        Room storage room = rooms[roomId];
        if (room.status != Status.HOST_FUNDED) revert WrongState();
        if (msg.sender == room.host) revert SelfJoin();
        if (block.timestamp >= room.joinDeadline) revert Expired();
        if (pets.ownerOf(guestPetId) != msg.sender) revert NotPetOwner();
        room.guest = msg.sender;
        room.guestPetId = guestPetId;
        room.startDeadline = uint64(block.timestamp + startWindow);
        room.status = Status.READY;
        _addLocked(room.guest, room.stake);
        petc.safeTransferFrom(msg.sender, address(this), room.stake);
        emit RoomJoined(roomId, msg.sender, guestPetId, room.stake, room.startDeadline);
    }

    function _refund(uint256 roomId, Status next, RefundReason reason) internal {
        Room storage room = rooms[roomId];
        bool pending = room.startedAt != 0;
        uint256 hostAmount = room.stake;
        uint256 guestAmount = room.status == Status.READY ? room.stake : 0;
        address host = room.host;
        address guest = room.guest;
        room.status = next;
        if (pending) _clearPending(host, hostAmount);
        else _clearLocked(host, hostAmount);
        if (guestAmount > 0) {
            if (pending) _clearPending(guest, guestAmount);
            else _clearLocked(guest, guestAmount);
        }
        petc.safeTransfer(host, hostAmount);
        if (guestAmount > 0) petc.safeTransfer(guest, guestAmount);
        emit RoomRefunded(roomId, next, reason, hostAmount, guestAmount);
    }

    function _addLocked(address who, uint256 amount) internal {
        lockedOf[who] += amount;
        totalLocked += amount;
    }

    function _clearLocked(address who, uint256 amount) internal {
        lockedOf[who] -= amount;
        totalLocked -= amount;
    }

    function _clearPending(address who, uint256 amount) internal {
        pendingOf[who] -= amount;
        totalLocked -= amount;
    }

    function _moveToPending(address who, uint256 amount) internal {
        lockedOf[who] -= amount;
        pendingOf[who] += amount;
    }

    function _hashResult(MatchResult calldata result) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                MATCH_RESULT_TYPEHASH,
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
    }

    function _propose(bytes32 key, uint256 value, address addr, bool flag) internal {
        uint64 eta = uint64(block.timestamp + timelockDelay);
        proposals[key] = Pending({active: true, eta: eta, value: value, addr: addr, flag: flag});
        emit ParameterProposed(key, value, addr, flag, eta);
    }

    function _take(bytes32 key) internal returns (Pending memory proposal) {
        proposal = proposals[key];
        if (!proposal.active || block.timestamp < proposal.eta) revert ProposalNotReady();
        delete proposals[key];
    }
}
