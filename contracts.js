// ── Rare Protocol — Contract ABIs & Addresses (Sepolia) ──

const CONTRACTS = {
  bazaar: "0xCE999aeF38E1316A510615b80713b494658807c6",
  minter: "0xf689b3344090DdE8b7a2C6b942730fF05De29451",
  factory: "0xeF4aac03af2684bE0BE2B07c451949CC4246085F",
  appRegistry: "0x3ad7694F899804206076F9A8E6F06719E360A90b",
  rareToken: "0x197FaeF3f59eC80113e773Bb6206a17d183F97CB",
};

const SEPOLIA_CHAIN_ID = 11155111;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETHERSCAN_BASE = "https://sepolia.etherscan.io";

// ── Minimal ABIs (write + read functions we actually call) ──

const FACTORY_ABI = [
  "function createSovereignNFTContract(string _name, string _symbol) external returns (address)",
  "event ContractCreated(address indexed _contractAddress, address indexed _owner, string _name, string _symbol)",
];

const SOVEREIGN_NFT_ABI = [
  "function mintTo(string _uri, address _receiver, address _royaltyReceiver) external returns (uint256)",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const MINTER_ABI = [
  "function prepareMintDirectSale(address _contractAddress, address _currencyAddress, uint256 _price, uint256 _startTime, uint256 _maxMints, address[] _splitRecipients, uint16[] _splitRatios) external",
  "function mintDirectSale(address _contractAddress, address _currencyAddress, uint256 _price, uint8 _numMints, bytes32[] _proof) external payable",
  "function getDirectSaleConfig(address) external view returns (tuple(address currencyAddress, uint256 price, uint256 startTime, uint256 maxMints, address[] splitRecipients, uint16[] splitRatios))",
];

const BAZAAR_ABI = [
  // Write
  "function setSalePrice(address _originContract, uint256 _tokenId, address _currencyAddress, uint256 _listPrice, address _target, address[] _splitAddresses, uint16[] _splitRatios, address _app) external",
  "function buy(address _originContract, uint256 _tokenId, address _currencyAddress, uint256 _amount) external payable",
  "function offer(address _originContract, uint256 _tokenId, address _currencyAddress, uint256 _amount, bool _convertible, address _app) external payable",
  "function acceptOffer(address _originContract, uint256 _tokenId, address _currencyAddress, uint256 _amount, address[] _splitAddresses, uint16[] _splitRatios) external",
  "function cancelOffer(address _originContract, uint256 _tokenId, address _currencyAddress) external",
  "function configureAuction(bytes32 _auctionType, address _originContract, uint256 _tokenId, uint256 _startingAmount, address _currencyAddress, uint256 _lengthOfAuction, uint256 _startTime, address[] _splitAddresses, uint16[] _splitRatios, address _app) external",
  "function bid(address _originContract, uint256 _tokenId, address _currencyAddress, uint256 _amount) external payable",
  "function settleAuction(address _originContract, uint256 _tokenId) external",
  "function cancelAuction(address _originContract, uint256 _tokenId) external",
  "function removeSalePrice(address _originContract, uint256 _tokenId, address _target) external",
  // Read
  "function getSalePrice(address _originContract, uint256 _tokenId, address _target) external view returns (address, address, uint256, address[], uint16[])",
  "function getAuctionDetails(address _originContract, uint256 _tokenId) external view returns (address, uint256, uint256, uint256, address, uint256, bytes32, address[], uint16[])",
  "function tokenCurrentOffers(address, uint256, address) external view returns (address, uint256, uint256, uint16, bool, address)",
  "function auctionBids(address, uint256) external view returns (address, address, uint256, uint16)",
  "function COLDIE_AUCTION() external view returns (bytes32)",
  "function SCHEDULED_AUCTION() external view returns (bytes32)",
  "function NO_AUCTION() external view returns (bytes32)",
];

const APP_REGISTRY_ABI = [
  "function registerApp(uint16 _feeBp) external",
  "function setAppFee(uint16 _newFeeBp) external",
  "function getAppFee(address _app) external view returns (uint16)",
  "event AppRegistered(address indexed _app, uint16 _feeBp)",
  "event AppFeeUpdated(address indexed _app, uint16 _oldFeeBp, uint16 _newFeeBp)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
];
