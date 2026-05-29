export const CONTRACT_ABI = [
  "function createMarket(string question, string[] eventNames, uint256 durationInMinutes) external",
  "function predict(uint256 marketId, uint256 eventId, uint8 choice) external payable",
  "function resolveEvent(uint256 marketId, uint256 eventId, uint8 result) external",
  "function claimWinnings(uint256 marketId, uint256 eventId) external",
  "function withdrawFees() external",
  "function owner() external view returns (address)",
  "function platformFeeBps() external view returns (uint256)",
  "function collectedFees() external view returns (uint256)",
  "function RESOLVE_BUFFER() external view returns (uint256)",
  "function getMarket(uint256 marketId) external view returns (tuple(uint256 id, string question, uint256 endTime, uint256 eventCount))",
  "function getEvent(uint256 marketId, uint256 eventId) external view returns (tuple(uint256 id, string name))",
  "function eventPools(uint256 marketId, uint256 eventId) external view returns (uint256 yesPool, uint256 noPool, uint256 totalPool, uint256 totalYesShares, uint256 totalNoShares, bool resolved, uint8 result)",
  "function getYesPriceBps(uint256 marketId, uint256 eventId) external view returns (uint256)",
  "function getUserShares(uint256 marketId, uint256 eventId, address user) external view returns (uint256 yesShares, uint256 noShares)",
  "function estimatePayout(uint256 marketId, uint256 eventId, address user, uint8 side) external view returns (uint256)",
  "function marketCount() external view returns (uint256)",
  "event MarketCreated(uint256 indexed id, string question, uint256 endTime, uint256 eventCount)",
  "event EventCreated(uint256 indexed marketId, uint256 indexed eventId, string name)",
  "event PredictionPlaced(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint8 choice, uint256 amount, uint256 sharesReceived)",
  "event EventResolved(uint256 indexed marketId, uint256 indexed eventId, uint8 result)",
  "event WinningsClaimed(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint256 amount)",
  "event FeesWithdrawn(address indexed owner, uint256 amount)"
];

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
export const CONTRACT_OWNER = (
  process.env.NEXT_PUBLIC_CONTRACT_OWNER ||
  '0x8fb5B5608daf460602ddcEb3Abca40f4B67D271e'
).toLowerCase();
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97) // BSC Testnet
