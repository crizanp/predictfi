export const CONTRACT_ABI = [
  "function createMarket(string memory _question, string[] memory _eventNames, uint256 _durationInMinutes) external",
  "function predict(uint256 _marketId, uint256 _eventId, uint8 _choice) external payable",
  "function sellPrediction(uint256 _marketId, uint256 _eventId, uint8 _choice, uint256 _amount) external",
  "function resolveEvent(uint256 _marketId, uint256 _eventId, uint8 _result) external",
  "function claimWinnings(uint256 _marketId, uint256 _eventId) external",
  "function owner() external view returns (address)",
  "function getMarket(uint256 _marketId) external view returns (tuple(uint256 id, string question, uint256 endTime, uint256 eventCount))",
  "function getEvent(uint256 _marketId, uint256 _eventId) external view returns (tuple(uint256 id, string name, bool resolved, uint8 result, uint256 yesPool, uint256 noPool, uint256 totalPool))",
  "function getUserPrediction(uint256 _marketId, uint256 _eventId, address _user) external view returns (tuple(uint8 choice, uint256 amount, bool claimed))",
  "function getUserPositionBreakdown(uint256 _marketId, uint256 _eventId, address _user) external view returns (uint256 yesAmount, uint256 noAmount, bool allClaimed)",
  "function marketCount() external view returns (uint256)",
  "event MarketCreated(uint256 indexed id, string question, uint256 endTime, uint256 eventCount)",
  "event MarketEventCreated(uint256 indexed marketId, uint256 indexed eventId, string name)",
  "event PredictionPlaced(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint8 choice, uint256 amount)",
  "event PredictionSold(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint8 choice, uint256 amount)",
  "event EventResolved(uint256 indexed marketId, uint256 indexed eventId, uint8 result)",
  "event WinningsClaimed(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint256 amount)"
];

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
export const CONTRACT_OWNER = (
  process.env.NEXT_PUBLIC_CONTRACT_OWNER ||
  '0x8fb5B5608daf460602ddcEb3Abca40f4B67D271e'
).toLowerCase();
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97) // BSC Testnet
