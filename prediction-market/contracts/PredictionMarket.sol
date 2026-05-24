// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PredictionMarket {
    address public owner;

    enum Outcome { NONE, YES, NO }

    struct Market {
        uint256 id;
        string question;
        uint256 endTime;
        bool resolved;
        Outcome result;
        uint256 yesPool;
        uint256 noPool;
        uint256 totalPool;
    }

    struct Prediction {
        Outcome choice;
        uint256 amount;
        bool claimed;
    }

    uint256 public marketCount;
    uint256 public platformFee = 5; // 5%

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Prediction)) public predictions;

    event MarketCreated(uint256 indexed id, string question, uint256 endTime);
    event PredictionPlaced(uint256 indexed marketId, address indexed user, Outcome choice, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Outcome result);
    event WinningsClaimed(uint256 indexed marketId, address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createMarket(string memory _question, uint256 _durationInMinutes) external onlyOwner {
        marketCount++;
        markets[marketCount] = Market({
            id: marketCount,
            question: _question,
            endTime: block.timestamp + (_durationInMinutes * 1 minutes),
            resolved: false,
            result: Outcome.NONE,
            yesPool: 0,
            noPool: 0,
            totalPool: 0
        });
        emit MarketCreated(marketCount, _question, markets[marketCount].endTime);
    }

    function predict(uint256 _marketId, Outcome _choice) external payable {
        Market storage market = markets[_marketId];
        require(market.id != 0, "Market does not exist");
        require(block.timestamp < market.endTime, "Market ended");
        require(!market.resolved, "Market resolved");
        require(_choice == Outcome.YES || _choice == Outcome.NO, "Invalid choice");
        require(msg.value > 0, "Must send BNB");

        Prediction storage userPred = predictions[_marketId][msg.sender];
        if (userPred.amount > 0) {
            // User already has a position — must stay in the same direction
            require(userPred.choice == _choice, "Cannot change prediction direction");
            userPred.amount += msg.value;
        } else {
            userPred.choice = _choice;
            userPred.amount = msg.value;
            userPred.claimed = false;
        }

        if (_choice == Outcome.YES) {
            market.yesPool += msg.value;
        } else {
            market.noPool += msg.value;
        }
        market.totalPool += msg.value;

        emit PredictionPlaced(_marketId, msg.sender, _choice, msg.value);
    }

    function resolveMarket(uint256 _marketId, Outcome _result) external onlyOwner {
        Market storage market = markets[_marketId];
        require(market.id != 0, "Market does not exist");
        require(block.timestamp >= market.endTime, "Market not ended yet");
        require(!market.resolved, "Already resolved");
        require(_result == Outcome.YES || _result == Outcome.NO, "Invalid result");

        market.resolved = true;
        market.result = _result;

        emit MarketResolved(_marketId, _result);
    }

    function claimWinnings(uint256 _marketId) external {
        Market storage market = markets[_marketId];
        require(market.resolved, "Not resolved yet");

        Prediction storage userPrediction = predictions[_marketId][msg.sender];
        require(userPrediction.amount > 0, "No prediction found");
        require(!userPrediction.claimed, "Already claimed");
        require(userPrediction.choice == market.result, "You lost");

        userPrediction.claimed = true;

        uint256 winningPool = market.result == Outcome.YES ? market.yesPool : market.noPool;
        uint256 losingPool = market.result == Outcome.YES ? market.noPool : market.yesPool;

        // Fee is proportional to this user's share of the losing pool.
        // This ensures total fees across ALL claimants = exactly platformFee% of losingPool,
        // so the contract never runs short regardless of how many winners there are.
        uint256 userLosingShare = (losingPool * userPrediction.amount) / winningPool;
        uint256 fee = (userLosingShare * platformFee) / 100;
        uint256 winnings = userPrediction.amount + userLosingShare - fee;

        if (fee > 0) {
            payable(owner).transfer(fee);
        }
        payable(msg.sender).transfer(winnings);

        emit WinningsClaimed(_marketId, msg.sender, winnings);
    }

    function getMarket(uint256 _marketId) external view returns (Market memory) {
        return markets[_marketId];
    }

    function getUserPrediction(uint256 _marketId, address _user) external view returns (Prediction memory) {
        return predictions[_marketId][_user];
    }

    function withdrawFees() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}
