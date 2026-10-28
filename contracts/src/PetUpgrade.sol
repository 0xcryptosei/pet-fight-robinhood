// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PetNFT} from "./PetNFT.sol";

/// @notice Saves a dog's Hat, Cloth, Shoes, Food, and level on this contract.
///         Buying an item or upgrading transfers PETC here. PETC is not redeemed.
///         Hat, Cloth, and Shoes are 100 PETC each. One Food is 100 PETC. One upgrade buys 1 Hat, 1 Cloth, 1 Shoes, and 3 Food for 600 PETC.
contract PetUpgrade is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant HAT = 0;
    uint8 public constant CLOTH = 1;
    uint8 public constant SHOES = 2;
    uint8 public constant FOOD = 3;

    uint256 public constant ITEM_PRICE = 100 ether;
    uint256 public constant FOOD_COUNT = 3;
    uint256 public constant UPGRADE_COST = ITEM_PRICE * 6;

    struct Gear {
        uint64 hat;
        uint64 cloth;
        uint64 shoes;
        uint64 food;
        uint16 level;
    }

    IERC20 public immutable petc;
    PetNFT public immutable pets;

    mapping(uint256 => Gear) public gear;

    error ZeroAddress();
    error NothingToWithdraw();
    error NotOwner();
    error NotDog();
    error BadItem();

    event ItemBought(address indexed buyer, uint256 indexed tokenId, uint8 kind, uint256 count, uint256 petcPaid);
    event Upgraded(
        address indexed buyer,
        uint256 indexed tokenId,
        uint16 level,
        uint64 hat,
        uint64 cloth,
        uint64 shoes,
        uint64 food,
        uint256 petcPaid
    );
    event PetcWithdrawn(address indexed to, uint256 amount);

    constructor(IERC20 petc_, PetNFT pets_, address admin) {
        if (address(petc_) == address(0) || address(pets_) == address(0) || admin == address(0)) revert ZeroAddress();
        petc = petc_;
        pets = pets_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Buy one Hat, Cloth, Shoes, or Food for this dog. The count is saved. The level stays the same.
    function buyItem(uint256 tokenId, uint8 kind) external whenNotPaused nonReentrant {
        _ownDog(tokenId);
        if (kind > FOOD) revert BadItem();
        petc.safeTransferFrom(msg.sender, address(this), ITEM_PRICE);
        Gear storage pet = gear[tokenId];
        uint256 count;
        if (kind == HAT) count = ++pet.hat;
        else if (kind == CLOTH) count = ++pet.cloth;
        else if (kind == SHOES) count = ++pet.shoes;
        else count = ++pet.food;
        emit ItemBought(msg.sender, tokenId, kind, count, ITEM_PRICE);
    }

    /// @notice Buy the upgrade set and save it on this dog. Level increases by 1.
    ///         Also writes that level onto the NFT when this contract has the progression role.
    function buyUpgrade(uint256 tokenId) external whenNotPaused nonReentrant {
        _ownDog(tokenId);
        petc.safeTransferFrom(msg.sender, address(this), UPGRADE_COST);
        Gear storage pet = gear[tokenId];
        if (pet.level == 0) pet.level = _nftLevel(tokenId);
        pet.level += 1;
        pet.hat += 1;
        pet.cloth += 1;
        pet.shoes += 1;
        pet.food += uint64(FOOD_COUNT);
        _writeNftLevel(tokenId, pet.level);
        emit Upgraded(msg.sender, tokenId, pet.level, pet.hat, pet.cloth, pet.shoes, pet.food, UPGRADE_COST);
    }

    /// @notice Admin takes PETC that purchases paid. This is not a refund.
    function withdrawPetc(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert NothingToWithdraw();
        petc.safeTransfer(to, amount);
        emit PetcWithdrawn(to, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _ownDog(uint256 tokenId) internal view {
        if (pets.ownerOf(tokenId) != msg.sender) revert NotOwner();
        (uint8 speciesId,,,) = pets.pets(tokenId);
        if (speciesId != pets.SPECIES_DOG()) revert NotDog();
    }

    function _nftLevel(uint256 tokenId) internal view returns (uint16 level) {
        (, level,,) = pets.pets(tokenId);
        if (level == 0) level = 1;
    }

    function _writeNftLevel(uint256 tokenId, uint16 level) internal {
        (,, uint64 xp, uint32 meta) = pets.pets(tokenId);
        if (meta == 0) meta = 1;
        try pets.setProgression(tokenId, level, xp, meta) {} catch {}
    }
}
