// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Stakes an existing `$PET` token and pays PETC from a pre-funded pool.
///         Staking does not mint PETC. Unstaking returns `$PET` only. There is no ETH path.
/// @dev Placeholder economics, to be replaced before a public deployment:
///      0.000001 PETC per 1 `$PET` per day, and a 7-day lock on the whole position when
///      the user stakes again. Rewards can be claimed during the lock.
contract StakingVault is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev PETC wei earned per 1e18 `$PET` wei per day. 0.000001 PETC.
    uint256 public constant REWARD_PER_TOKEN_PER_DAY = 0.000001 ether;
    uint256 public constant LOCK = 7 days;

    IERC20 public immutable stakeToken;
    IERC20 public immutable rewardToken;

    uint256 public totalStaked;
    uint256 public accRewardPerToken;
    uint256 public lastUpdate;

    struct Position {
        uint256 amount;
        uint256 paid;
        uint256 pending;
        uint64 lockedUntil;
    }

    mapping(address => Position) public positions;

    error ZeroAddress();
    error SameToken();
    error ZeroAmount();
    error Locked();
    error TooMuch();
    error PoolShort();

    event Staked(address indexed user, uint256 amount, uint64 lockedUntil);
    event Withdrawn(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event RewardsFunded(address indexed from, uint256 amount);

    constructor(IERC20 stakeToken_, IERC20 rewardToken_, address admin) {
        if (address(stakeToken_) == address(0) || address(rewardToken_) == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        if (address(stakeToken_) == address(rewardToken_)) revert SameToken();
        stakeToken = stakeToken_;
        rewardToken = rewardToken_;
        lastUpdate = block.timestamp;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function pendingReward(address user) public view returns (uint256) {
        Position memory position = positions[user];
        uint256 acc = _previewAcc();
        return position.pending + position.amount * (acc - position.paid) / 1e18;
    }

    function stake(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue();
        _settle(msg.sender);
        Position storage position = positions[msg.sender];
        position.amount += amount;
        position.paid = accRewardPerToken;
        uint64 until = uint64(block.timestamp + LOCK);
        if (until > position.lockedUntil) position.lockedUntil = until;
        totalStaked += amount;
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, position.lockedUntil);
    }

    /// @notice Returns `$PET` after the lock. Pending PETC stays claimable.
    function withdraw(uint256 amount) external nonReentrant {
        Position storage position = positions[msg.sender];
        if (block.timestamp < position.lockedUntil) revert Locked();
        if (amount == 0) revert ZeroAmount();
        if (amount > position.amount) revert TooMuch();
        _accrue();
        _settle(msg.sender);
        position.amount -= amount;
        position.paid = accRewardPerToken;
        totalStaked -= amount;
        stakeToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Pays PETC only from the reward-token balance. Reverts if the pool is short.
    function claim() external nonReentrant {
        _accrue();
        _settle(msg.sender);
        uint256 owed = positions[msg.sender].pending;
        if (owed == 0) revert ZeroAmount();
        if (rewardToken.balanceOf(address(this)) < owed) revert PoolShort();
        positions[msg.sender].pending = 0;
        rewardToken.safeTransfer(msg.sender, owed);
        emit Claimed(msg.sender, owed);
    }

    /// @notice Anyone may add PETC to the reward pool. This does not mint.
    function fundRewards(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsFunded(msg.sender, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _previewAcc() internal view returns (uint256 acc) {
        acc = accRewardPerToken;
        if (totalStaked == 0) return acc;
        acc += (block.timestamp - lastUpdate) * REWARD_PER_TOKEN_PER_DAY / 1 days;
    }

    function _accrue() internal {
        accRewardPerToken = _previewAcc();
        lastUpdate = block.timestamp;
    }

    function _settle(address user) internal {
        Position storage position = positions[user];
        position.pending += position.amount * (accRewardPerToken - position.paid) / 1e18;
        position.paid = accRewardPerToken;
    }
}
