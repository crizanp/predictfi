// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PredictionMarket {
    address public owner;

    enum Outcome { NONE, YES, NO }

    struct Market {
        uint256 id;
        string question;
        uint256 endTime;
        uint256 eventCount;
    }

    struct MarketEvent {
        uint256 id;
        string name;
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

    struct Position {
        Outcome choice;
        uint256 amount;
        bool claimed;
    }

    uint256 public marketCount;
    uint256 public platformFee = 5; // 5%

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(uint256 => MarketEvent)) private marketEvents;
    mapping(uint256 => mapping(uint256 => mapping(address => Position[]))) private positions;

    event MarketCreated(uint256 indexed id, string question, uint256 endTime, uint256 eventCount);
    event MarketEventCreated(uint256 indexed marketId, uint256 indexed eventId, string name);
    event PredictionPlaced(uint256 indexed marketId, uint256 indexed eventId, address indexed user, Outcome choice, uint256 amount);
    event EventResolved(uint256 indexed marketId, uint256 indexed eventId, Outcome result);
    event WinningsClaimed(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createMarket(string memory _question, string[] memory _eventNames, uint256 _durationInMinutes) external onlyOwner {
        require(bytes(_question).length > 0, "Question required");
        require(_eventNames.length > 0, "At least one event required");
        require(_eventNames.length <= 50, "Too many events");
        marketCount++;
        markets[marketCount] = Market({
            id: marketCount,
            question: _question,
            endTime: block.timestamp + (_durationInMinutes * 1 minutes),
            eventCount: _eventNames.length
        });

        for (uint256 i = 0; i < _eventNames.length; i++) {
            require(bytes(_eventNames[i]).length > 0, "Event name empty");
            uint256 eventId = i + 1;
            marketEvents[marketCount][eventId] = MarketEvent({
                id: eventId,
                name: _eventNames[i],
                resolved: false,
                result: Outcome.NONE,
                yesPool: 0,
                noPool: 0,
                totalPool: 0
            });
            emit MarketEventCreated(marketCount, eventId, _eventNames[i]);
        }

        emit MarketCreated(marketCount, _question, markets[marketCount].endTime, _eventNames.length);
    }

    function predict(uint256 _marketId, uint256 _eventId, Outcome _choice) external payable {
        Market storage market = markets[_marketId];
        require(market.id != 0, "Market does not exist");
        require(_eventId > 0 && _eventId <= market.eventCount, "Event does not exist");
        require(block.timestamp < market.endTime, "Market ended");
        MarketEvent storage eventMarket = marketEvents[_marketId][_eventId];
        require(!eventMarket.resolved, "Event resolved");
        require(_choice == Outcome.YES || _choice == Outcome.NO, "Invalid choice");
        require(msg.value > 0, "Must send BNB");

        positions[_marketId][_eventId][msg.sender].push(Position({
            choice: _choice,
            amount: msg.value,
            claimed: false
        }));

        if (_choice == Outcome.YES) {
            eventMarket.yesPool += msg.value;
        } else {
            eventMarket.noPool += msg.value;
        }
        eventMarket.totalPool += msg.value;

        emit PredictionPlaced(_marketId, _eventId, msg.sender, _choice, msg.value);
    }

    function resolveEvent(uint256 _marketId, uint256 _eventId, Outcome _result) external onlyOwner {
        Market storage market = markets[_marketId];
        require(market.id != 0, "Market does not exist");
        require(_eventId > 0 && _eventId <= market.eventCount, "Event does not exist");
        require(block.timestamp >= market.endTime, "Market not ended yet");
        MarketEvent storage eventMarket = marketEvents[_marketId][_eventId];
        require(!eventMarket.resolved, "Already resolved");
        require(_result == Outcome.YES || _result == Outcome.NO, "Invalid result");

        eventMarket.resolved = true;
        eventMarket.result = _result;

        emit EventResolved(_marketId, _eventId, _result);
    }

    function claimWinnings(uint256 _marketId, uint256 _eventId) external {
        Market storage market = markets[_marketId];
        require(market.id != 0, "Market does not exist");
        require(_eventId > 0 && _eventId <= market.eventCount, "Event does not exist");
        MarketEvent storage eventMarket = marketEvents[_marketId][_eventId];
        require(eventMarket.resolved, "Not resolved yet");

        Position[] storage userPositions = positions[_marketId][_eventId][msg.sender];
        require(userPositions.length > 0, "No prediction found");

        uint256 winningAmount = 0;
        bool hasUnclaimedWinningPosition = false;

        for (uint256 i = 0; i < userPositions.length; i++) {
            Position storage position = userPositions[i];
            require(!position.claimed, "Already claimed");

            if (position.choice == eventMarket.result) {
                winningAmount += position.amount;
                hasUnclaimedWinningPosition = true;
            }
        }

        require(hasUnclaimedWinningPosition, "You lost");

        for (uint256 i = 0; i < userPositions.length; i++) {
            userPositions[i].claimed = true;
        }

        uint256 winningPool = eventMarket.result == Outcome.YES ? eventMarket.yesPool : eventMarket.noPool;
        uint256 losingPool = eventMarket.result == Outcome.YES ? eventMarket.noPool : eventMarket.yesPool;
        require(winningPool > 0, "No winning pool");

        // Fee is proportional to this user's share of the losing pool.
        // This ensures total fees across ALL claimants = exactly platformFee% of losingPool,
        // so the contract never runs short regardless of how many winners there are.
        uint256 userLosingShare = (losingPool * winningAmount) / winningPool;
        uint256 fee = (userLosingShare * platformFee) / 100;
        uint256 winnings = winningAmount + userLosingShare - fee;

        if (fee > 0) {
            payable(owner).transfer(fee);
        }
        payable(msg.sender).transfer(winnings);

        emit WinningsClaimed(_marketId, _eventId, msg.sender, winnings);
    }

    function getMarket(uint256 _marketId) external view returns (Market memory) {
        return markets[_marketId];
    }

    function getEvent(uint256 _marketId, uint256 _eventId) external view returns (MarketEvent memory) {
        return marketEvents[_marketId][_eventId];
    }

    function getUserPrediction(uint256 _marketId, uint256 _eventId, address _user) external view returns (Prediction memory) {
        Position[] storage userPositions = positions[_marketId][_eventId][_user];
        if (userPositions.length == 0) {
            return Prediction({ choice: Outcome.NONE, amount: 0, claimed: false });
        }

        uint256 totalAmount = 0;
        Outcome latestChoice = Outcome.NONE;
        bool allClaimed = true;

        for (uint256 i = 0; i < userPositions.length; i++) {
            totalAmount += userPositions[i].amount;
            latestChoice = userPositions[i].choice;
            allClaimed = allClaimed && userPositions[i].claimed;
        }

        return Prediction({ choice: latestChoice, amount: totalAmount, claimed: allClaimed });
    }

    function withdrawFees() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}
