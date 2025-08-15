// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract CrawlRegistry is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    struct CrawlMetadata {
        string source_url;
        bytes32 content_hash;
        string content_link;
        string embed_vector_id;
        uint256 created_at;
        string[] tags;
        address owner;
    }

    struct Bounty {
        uint256 amount;
        address creator;
        address[] contributors;
        mapping(address => bool) claimed;
        bool distributed;
    }

    mapping(uint256 => CrawlMetadata) public crawls;
    mapping(address => uint256[]) public crawlMetadataByCreator;

    mapping(uint256 => Bounty) public bounties;
    uint256 public nextBountyId;

    address public admin;

    constructor() ERC721("CrawlMetadataNFT", "CMDNFT") {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    event MetadataMinted(uint256 indexed tokenId, address indexed owner);
    event BountyCreated(uint256 id, address indexed creator, uint256 amount);
    event ContributorAdded(uint256 bountyId, address contributor);
    event BountyDistributed(uint256 id);

    function mintMetadataNFT(
        string memory source_url,
        bytes32 content_hash,
        string memory content_link,
        string memory embed_vector_id,
        uint256 created_at,
        string[] memory tags,
        string memory tokenURI
    ) public returns (uint256) {
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, tokenURI);

        crawls[newTokenId] = CrawlMetadata({
            source_url: source_url,
            content_hash: content_hash,
            content_link: content_link,
            embed_vector_id: embed_vector_id,
            created_at: created_at,
            tags: tags,
            owner: msg.sender
        });

        crawlMetadataByCreator[msg.sender].push(newTokenId);

        emit MetadataMinted(newTokenId, msg.sender);
        return newTokenId;
    }

    function donateToCreator(uint256 metadataId) public payable {
        address creator = crawls[metadataId].owner;
        require(creator != address(0), "Invalid creator");
        payable(creator).transfer(msg.value);
    }

    function getMetadata(uint256 tokenId) external view returns (CrawlMetadata memory) {
        require(_ownerOf(tokenId) != address(0), "Metadata does not exist");
        return crawls[tokenId];
    }

    function getMetadataByCreator(address creator) external view returns (uint256[] memory) {
        return crawlMetadataByCreator[creator];
    }

    function getBounty(uint256 bountyId) external view returns (
        uint256 amount,
        address creator,
        address[] memory contributors,
        bool distributed
    ) {
        Bounty storage bounty = bounties[bountyId];
        return (
            bounty.amount,
            bounty.creator,
            bounty.contributors,
            bounty.distributed
        );
    }

    function createBounty() public payable returns (uint256) {
        require(msg.value > 0, "Must stake some token");

        Bounty storage bounty = bounties[nextBountyId];
        bounty.amount = msg.value;
        bounty.creator = msg.sender;
        bounty.distributed = false;

        emit BountyCreated(nextBountyId, msg.sender, msg.value);
        return nextBountyId++;
    }

    function addContributor(uint256 bountyId, address contributor) public onlyAdmin {
        Bounty storage bounty = bounties[bountyId];
        require(!bounty.distributed, "Already distributed");

        bounty.contributors.push(contributor);
        emit ContributorAdded(bountyId, contributor);
    }

    function distributeBounty(uint256 bountyId) public onlyAdmin {
        Bounty storage bounty = bounties[bountyId];
        require(!bounty.distributed, "Already distributed");
        require(bounty.contributors.length > 0, "No contributors");

        uint256 reward = bounty.amount / bounty.contributors.length;

        for (uint256 i = 0; i < bounty.contributors.length; i++) {
            address contributor = bounty.contributors[i];
            if (!bounty.claimed[contributor]) {
                bounty.claimed[contributor] = true;
                payable(contributor).transfer(reward);
            }
        }

        bounty.distributed = true;
        emit BountyDistributed(bountyId);
    }
}