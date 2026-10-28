// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Non-redeemable PETC. 18 decimals. Minting is role-gated and capped.
///         There is no redemption, treasury withdrawal, or public mint.
contract PetCoin is ERC20, ERC20Permit, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 public immutable maxSupply;

    error CapExceeded();
    error ZeroAddress();

    constructor(uint256 maxSupply_, address admin) ERC20("Pet Fight Coin", "PETC") ERC20Permit("Pet Fight Coin") {
        if (maxSupply_ == 0) revert CapExceeded();
        if (admin == address(0)) revert ZeroAddress();
        maxSupply = maxSupply_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (totalSupply() + amount > maxSupply) revert CapExceeded();
        _mint(to, amount);
    }
}
