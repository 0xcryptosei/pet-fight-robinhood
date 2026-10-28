// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Pet ownership and compact progression.
///         On-chain fields are species, level, XP checkpoint, and metadata version.
///         Health, power, and intelligence in the species catalogue are a rules-version mirror,
///         not a second combat authority. Version 1 grants no XP.
///         One starter dog per allow-listed wallet. The token id does not change when progression updates.
///         Equipment entries store zero stat bonuses.
contract PetNFT is ERC721Enumerable, AccessControl, Pausable {
    bytes32 public constant ALLOWLIST_ROLE = keccak256("ALLOWLIST_ROLE");
    bytes32 public constant PROGRESSION_ROLE = keccak256("PROGRESSION_ROLE");

    uint8 public constant SPECIES_DOG = 1;
    uint8 public constant SPECIES_CAT = 2;
    uint8 public constant SPECIES_PIG = 3;
    uint8 public constant SPECIES_BIRD = 4;

    struct Species {
        bool exists;
        bool starter;
        uint16 baseHealth;
        uint16 basePower;
        uint16 baseIntelligence;
        string name;
    }

    struct Pet {
        uint8 speciesId;
        uint16 level;
        uint64 xpCheckpoint;
        uint32 metadataVersion;
    }

    struct Equipment {
        bool exists;
        uint16 headDefenseMilli;
        uint16 bodyDefenseMilli;
        string name;
    }

    uint256 public nextTokenId = 1;
    uint256 public equipmentCount;

    mapping(uint8 => Species) public species;
    mapping(uint256 => Pet) public pets;
    mapping(address => bool) public allowlist;
    mapping(address => bool) public claimedStarter;
    mapping(uint256 => Equipment) public equipment;
    mapping(uint256 => uint256) public equipped;

    event AllowlistUpdated(address indexed wallet, bool allowed);
    event StarterClaimed(address indexed owner, uint256 indexed tokenId, uint8 speciesId);
    event CatalogueMinted(address indexed owner, uint256 indexed tokenId, uint8 speciesId);
    event ProgressionUpdated(uint256 indexed tokenId, uint16 level, uint64 xpCheckpoint, uint32 metadataVersion);
    event EquipmentRegistered(uint256 indexed equipmentId, string name, uint16 headDefenseMilli, uint16 bodyDefenseMilli);
    event Equipped(uint256 indexed tokenId, uint256 indexed equipmentId);

    error ZeroAddress();
    error NotAllowlisted();
    error AlreadyClaimed();
    error UnknownPet();
    error BadProgression();
    error EmptyName();
    error UnknownEquipment();
    error NotOwner();
    error NotCatalogueSpecies();

    constructor(address admin) ERC721("Pet Fight Pet", "PET") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ALLOWLIST_ROLE, admin);
        _grantRole(PROGRESSION_ROLE, admin);
        species[SPECIES_DOG] = Species({
            exists: true,
            starter: true,
            baseHealth: 100,
            basePower: 70,
            baseIntelligence: 50,
            name: "Dog"
        });
        species[SPECIES_CAT] = Species({
            exists: true,
            starter: false,
            baseHealth: 80,
            basePower: 55,
            baseIntelligence: 90,
            name: "Cat"
        });
        species[SPECIES_PIG] = Species({
            exists: true,
            starter: false,
            baseHealth: 120,
            basePower: 75,
            baseIntelligence: 45,
            name: "Pig"
        });
        species[SPECIES_BIRD] = Species({
            exists: true,
            starter: false,
            baseHealth: 65,
            basePower: 45,
            baseIntelligence: 70,
            name: "Bird"
        });
    }

    function setAllowlist(address wallet, bool allowed) external onlyRole(ALLOWLIST_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        allowlist[wallet] = allowed;
        emit AllowlistUpdated(wallet, allowed);
    }

    function setAllowlistBatch(address[] calldata wallets, bool allowed) external onlyRole(ALLOWLIST_ROLE) {
        uint256 length = wallets.length;
        for (uint256 i = 0; i < length; ++i) {
            if (wallets[i] == address(0)) revert ZeroAddress();
            allowlist[wallets[i]] = allowed;
            emit AllowlistUpdated(wallets[i], allowed);
        }
    }

    /// @notice Mint the one starter dog for an allow-listed wallet. The id is stable for the life of the pet.
    function claimStarter() external whenNotPaused returns (uint256 tokenId) {
        if (!allowlist[msg.sender]) revert NotAllowlisted();
        if (claimedStarter[msg.sender]) revert AlreadyClaimed();
        tokenId = nextTokenId++;
        claimedStarter[msg.sender] = true;
        pets[tokenId] = Pet({speciesId: SPECIES_DOG, level: 1, xpCheckpoint: 0, metadataVersion: 1});
        _safeMint(msg.sender, tokenId);
        emit StarterClaimed(msg.sender, tokenId, SPECIES_DOG);
    }

    /// @notice Mint a cat, pig, or bird. The free starter remains the dog claim.
    ///         There is no sale price. Stats are the spec placeholders, not a combat rules change.
    function grantCataloguePet(address to, uint8 speciesId) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        Species storage spec = species[speciesId];
        if (!spec.exists || spec.starter) revert NotCatalogueSpecies();
        tokenId = nextTokenId++;
        pets[tokenId] = Pet({speciesId: speciesId, level: 1, xpCheckpoint: 0, metadataVersion: 1});
        _safeMint(to, tokenId);
        emit CatalogueMinted(to, tokenId, speciesId);
    }

    /// @notice Update progression in place. Species and token id stay the same.
    ///         Level and the XP checkpoint only move forward. Version 1 gameplay does not call this.
    function setProgression(uint256 tokenId, uint16 level, uint64 xpCheckpoint, uint32 metadataVersion)
        external
        onlyRole(PROGRESSION_ROLE)
    {
        Pet storage pet = pets[tokenId];
        if (pet.speciesId == 0) revert UnknownPet();
        if (level < pet.level || xpCheckpoint < pet.xpCheckpoint || metadataVersion == 0) revert BadProgression();
        pet.level = level;
        pet.xpCheckpoint = xpCheckpoint;
        pet.metadataVersion = metadataVersion;
        emit ProgressionUpdated(tokenId, level, xpCheckpoint, metadataVersion);
    }

    /// @notice Catalogue entry with zero combat bonuses.
    function registerEquipment(string calldata name) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 id) {
        if (bytes(name).length == 0) revert EmptyName();
        id = ++equipmentCount;
        equipment[id] = Equipment({exists: true, headDefenseMilli: 0, bodyDefenseMilli: 0, name: name});
        emit EquipmentRegistered(id, name, 0, 0);
    }

    function equip(uint256 tokenId, uint256 equipmentId) external whenNotPaused {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (!equipment[equipmentId].exists) revert UnknownEquipment();
        equipped[tokenId] = equipmentId;
        emit Equipped(tokenId, equipmentId);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
