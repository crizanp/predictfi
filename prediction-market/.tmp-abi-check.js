const { ethers } = require('ethers')
const abi = [
  "function createMarket(string memory _question, string[] memory _eventNames, uint256 _durationInMinutes) external",
  "function predict(uint256 _marketId, uint256 _eventId, uint8 _choice) external payable",
  "function resolveEvent(uint256 _marketId, uint256 _eventId, uint8 _result) external",
  "function claimWinnings(uint256 _marketId, uint256 _eventId) external",
  "function owner() external view returns (address)",
  "function getMarket(uint256 _marketId) external view returns (tuple(uint256 id, string question, uint256 endTime, uint256 eventCount))",
  "function getEvent(uint256 _marketId, uint256 _eventId) external view returns (tuple(uint256 id, string name, bool resolved, uint8 result, uint256 yesPool, uint256 noPool, uint256 totalPool))",
  "function getUserPrediction(uint256 _marketId, uint256 _eventId, address _user) external view returns (tuple(uint8 choice, uint256 amount, bool claimed))",
  "function marketCount() external view returns (uint256)",
  "event MarketCreated(uint256 indexed id, string question, uint256 endTime, uint256 eventCount)",
  "event MarketEventCreated(uint256 indexed marketId, uint256 indexed eventId, string name)",
  "event PredictionPlaced(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint8 choice, uint256 amount)",
  "event EventResolved(uint256 indexed marketId, uint256 indexed eventId, uint8 result)",
  "event WinningsClaimed(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint256 amount)"
]
try {
  const iface = new ethers.Interface(abi)
  console.log('ok fragments', iface.fragments.length)
} catch (e) {
  console.error('parse-failed', e)
}
