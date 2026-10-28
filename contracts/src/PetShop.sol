// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Sells a pre-funded PETC inventory for ETH. There is no sell-back and no redemption.
///         ETH received is sale proceeds, not a user deposit. PETC is transferred from inventory
///         and is never minted here.
/// @dev Placeholder price: 10_000 PETC (human units) per 1 ETH. Update the constant before a
///      public sale. 1 PETC costs 0.0001 ETH.
contract PetShop is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Human PETC per 1 ETH. Both tokens use 18 decimals, so `msg.value * PETC_PER_ETH`
    ///      is the PETC amount in wei.
    uint256 public constant PETC_PER_ETH = 10_000;

    IERC20 public immutable petc;

    error ZeroAddress();
    error NothingToBuy();
    error InventoryShort();
    error NoProceeds();

    event Purchased(address indexed buyer, uint256 ethIn, uint256 petcOut);
    event ProceedsWithdrawn(address indexed to, uint256 amount);
    event UnsoldRecovered(address indexed to, uint256 amount);

    constructor(IERC20 petc_, address admin) {
        if (address(petc_) == address(0) || admin == address(0)) revert ZeroAddress();
        petc = petc_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function quote(uint256 ethIn) public pure returns (uint256 petcOut) {
        return ethIn * PETC_PER_ETH;
    }

    function buy() external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert NothingToBuy();
        uint256 petcOut = quote(msg.value);
        if (petc.balanceOf(address(this)) < petcOut) revert InventoryShort();
        petc.safeTransfer(msg.sender, petcOut);
        emit Purchased(msg.sender, msg.value, petcOut);
    }

    /// @notice Admin takes ETH that buyers paid. This is not a PETC redemption.
    function withdrawProceeds(address to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = address(this).balance;
        if (amount == 0) revert NoProceeds();
        (bool ok,) = to.call{value: amount}("");
        require(ok, "eth transfer failed");
        emit ProceedsWithdrawn(to, amount);
    }

    /// @notice Admin takes PETC that has not been sold. Buyers who already paid keep their PETC.
    function recoverUnsold(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert NothingToBuy();
        petc.safeTransfer(to, amount);
        emit UnsoldRecovered(to, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
