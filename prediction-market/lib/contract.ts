export const CONTRACT_ABI = [
  "function createMarket(string memory _question, uint256 _durationInMinutes) external",
  "function predict(uint256 _marketId, uint8 _choice) external payable",
  "function resolveMarket(uint256 _marketId, uint8 _result) external",
  "function claimWinnings(uint256 _marketId) external",
  "function getMarket(uint256 _marketId) external view returns (tuple(uint256 id, string question, uint256 endTime, bool resolved, uint8 result, uint256 yesPool, uint256 noPool, uint256 totalPool))",
  "function getUserPrediction(uint256 _marketId, address _user) external view returns (tuple(uint8 choice, uint256 amount, bool claimed))",
  "function marketCount() external view returns (uint256)",
  "event MarketCreated(uint256 indexed id, string question, uint256 endTime)",
  "event PredictionPlaced(uint256 indexed marketId, address indexed user, uint8 choice, uint256 amount)",
  "event MarketResolved(uint256 indexed marketId, uint8 result)",
  "event WinningsClaimed(uint256 indexed marketId, address indexed user, uint256 amount)"
];

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
export const CHAIN_ID = 97 // BSC Testnet
