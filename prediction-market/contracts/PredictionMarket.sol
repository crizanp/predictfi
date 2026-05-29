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
        uint256 entryPriceBps;
        bool claimed;
    }

    struct SellQuoteData {
        uint256 exitPriceBps;
        uint256 grossPayout;
        uint256 fee;
        uint256 netPayout;
    }

    uint256 public marketCount;
    uint256 public platformFee = 5; // 5%
    uint256 public sellFeeBps = 200; // 2%

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(uint256 => MarketEvent)) private marketEvents;
    mapping(uint256 => mapping(uint256 => mapping(address => Position[]))) private positions;

    event MarketCreated(uint256 indexed id, string question, uint256 endTime, uint256 eventCount);
    event MarketEventCreated(uint256 indexed marketId, uint256 indexed eventId, string name);
    event PredictionPlaced(uint256 indexed marketId, uint256 indexed eventId, address indexed user, Outcome choice, uint256 amount);
    event PredictionSold(
        uint256 indexed marketId,
        uint256 indexed eventId,
        address indexed user,
        Outcome choice,
        uint256 amount,
        uint256 grossPayout,
        uint256 fee,
        uint256 netPayout,
        uint256 exitPriceBps
    );
    event EventResolved(uint256 indexed marketId, uint256 indexed eventId, Outcome result);
    event WinningsClaimed(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function _clampPriceBps(uint256 _priceBps) private pure returns (uint256) {
        if (_priceBps < 1) return 1;
        if (_priceBps > 9999) return 9999;
        return _priceBps;
    }

    function _eventPriceBps(MarketEvent storage _eventMarket, Outcome _choice) private view returns (uint256) {
        if (_eventMarket.totalPool == 0) {
            return 5000;
        }
        uint256 raw = _choice == Outcome.YES
            ? (_eventMarket.yesPool * 10000) / _eventMarket.totalPool
            : (_eventMarket.noPool * 10000) / _eventMarket.totalPool;
        return _clampPriceBps(raw);
    }

    function _postSellPriceBps(MarketEvent storage _eventMarket, Outcome _choice, uint256 _amount) private view returns (uint256) {
        require(_amount > 0, "Amount must be > 0");
        require(_eventMarket.totalPool >= _amount, "Pool underflow");

        uint256 nextTotal = _eventMarket.totalPool - _amount;
        if (nextTotal == 0) {
            return 5000;
        }

        if (_choice == Outcome.YES) {
            require(_eventMarket.yesPool >= _amount, "Pool underflow");
            uint256 nextYes = _eventMarket.yesPool - _amount;
            return _clampPriceBps((nextYes * 10000) / nextTotal);
        }

        require(_eventMarket.noPool >= _amount, "Pool underflow");
        uint256 nextNo = _eventMarket.noPool - _amount;
        return _clampPriceBps((nextNo * 10000) / nextTotal);
    }

    function _quoteSellFromPositions(
        Position[] storage _userPositions,
        Outcome _choice,
        uint256 _amount,
        uint256 _exitPriceBps
    ) private view returns (uint256 grossPayout, uint256 availableAmount) {
        uint256 remaining = _amount;

        for (uint256 i = 0; i < _userPositions.length; i++) {
            Position storage position = _userPositions[i];
            if (position.claimed || position.choice != _choice || position.amount == 0) {
                continue;
            }

            availableAmount += position.amount;
            if (remaining == 0) {
                continue;
            }

            uint256 chunk = position.amount <= remaining ? position.amount : remaining;
            uint256 entryPriceBps = _clampPriceBps(position.entryPriceBps == 0 ? 5000 : position.entryPriceBps);

            // Realize PnL linearly from entry -> exit price to avoid unbounded multipliers.
            // If exit > entry, user gets a premium; if exit < entry, user takes a discount.
            if (_exitPriceBps >= entryPriceBps) {
                uint256 premium = (chunk * (_exitPriceBps - entryPriceBps)) / 10000;
                grossPayout += chunk + premium;
            } else {
                uint256 discount = (chunk * (entryPriceBps - _exitPriceBps)) / 10000;
                grossPayout += chunk > discount ? chunk - discount : 0;
            }
            remaining -= chunk;
        }

        require(availableAmount >= _amount, "Insufficient position");
    }

    function _quoteSellPredictionForUser(
        uint256 _marketId,
        uint256 _eventId,
        Outcome _choice,
        address _user,
        uint256 _amount
    ) private view returns (SellQuoteData memory quote) {
        require(_amount > 0, "Amount must be > 0");
        Market storage market = markets[_marketId];
        require(market.id != 0, "Market does not exist");
        require(_eventId > 0 && _eventId <= market.eventCount, "Event does not exist");

        MarketEvent storage eventMarket = marketEvents[_marketId][_eventId];
        require(!eventMarket.resolved, "Event resolved");
        require(block.timestamp < market.endTime, "Market ended");
        require(_choice == Outcome.YES || _choice == Outcome.NO, "Invalid choice");

        uint256 spotExitPriceBps = _eventPriceBps(eventMarket, _choice);
        uint256 postImpactPriceBps = _postSellPriceBps(eventMarket, _choice, _amount);
        quote.exitPriceBps = (spotExitPriceBps + postImpactPriceBps) / 2;
        Position[] storage userPositions = positions[_marketId][_eventId][_user];
        require(userPositions.length > 0, "No prediction found");

        (quote.grossPayout, ) = _quoteSellFromPositions(userPositions, _choice, _amount, quote.exitPriceBps);
        quote.fee = (quote.grossPayout * sellFeeBps) / 10000;
        quote.netPayout = quote.grossPayout - quote.fee;
    }

    function quoteSellPredictionForUser(
        uint256 _marketId,
        uint256 _eventId,
        Outcome _choice,
        address _user,
        uint256 _amount
    ) external view returns (uint256 exitPriceBps, uint256 grossPayout, uint256 fee, uint256 netPayout) {
        SellQuoteData memory quote = _quoteSellPredictionForUser(_marketId, _eventId, _choice, _user, _amount);
        return (quote.exitPriceBps, quote.grossPayout, quote.fee, quote.netPayout);
    }

    function _consumeSellPositions(
        Position[] storage _userPositions,
        Outcome _choice,
        uint256 _amount
    ) private {
        uint256 remainingToSell = _amount;
        for (uint256 i = 0; i < _userPositions.length && remainingToSell > 0; i++) {
            Position storage position = _userPositions[i];
            if (position.claimed || position.choice != _choice || position.amount == 0) {
                continue;
            }

            if (position.amount <= remainingToSell) {
                remainingToSell -= position.amount;
                position.amount = 0;
            } else {
                position.amount -= remainingToSell;
                remainingToSell = 0;
            }
        }
    }

    function _updatePoolsAfterSell(
        MarketEvent storage _eventMarket,
        Outcome _choice,
        uint256 _amount,
        uint256 _grossPayout
    ) private {
        uint256 oppositeDelta = _grossPayout >= _amount ? _grossPayout - _amount : _amount - _grossPayout;

        if (_choice == Outcome.YES) {
            require(_eventMarket.yesPool >= _amount, "Pool underflow");
            _eventMarket.yesPool -= _amount;
            if (_grossPayout >= _amount) {
                require(_eventMarket.noPool >= oppositeDelta, "Not enough liquidity");
                _eventMarket.noPool -= oppositeDelta;
            } else {
                _eventMarket.noPool += oppositeDelta;
            }
        } else {
            require(_eventMarket.noPool >= _amount, "Pool underflow");
            _eventMarket.noPool -= _amount;
            if (_grossPayout >= _amount) {
                require(_eventMarket.yesPool >= oppositeDelta, "Not enough liquidity");
                _eventMarket.yesPool -= oppositeDelta;
            } else {
                _eventMarket.yesPool += oppositeDelta;
            }
        }

        require(_eventMarket.totalPool >= _grossPayout, "Pool underflow");
        _eventMarket.totalPool -= _grossPayout;
    }

    function _settleSellPayout(address _seller, uint256 _fee, uint256 _netPayout) private {
        if (_fee > 0) {
            payable(owner).transfer(_fee);
        }
        payable(_seller).transfer(_netPayout);
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

        if (_choice == Outcome.YES) {
            eventMarket.yesPool += msg.value;
        } else {
            eventMarket.noPool += msg.value;
        }
        eventMarket.totalPool += msg.value;

        // Use post-trade price as entry to avoid immediate self-impact arbitrage.
        uint256 entryPriceBps = _eventPriceBps(eventMarket, _choice);

        positions[_marketId][_eventId][msg.sender].push(Position({
            choice: _choice,
            amount: msg.value,
            entryPriceBps: entryPriceBps,
            claimed: false
        }));

        emit PredictionPlaced(_marketId, _eventId, msg.sender, _choice, msg.value);
    }

    function sellPrediction(uint256 _marketId, uint256 _eventId, Outcome _choice, uint256 _amount) external {
        SellQuoteData memory quote = _quoteSellPredictionForUser(_marketId, _eventId, _choice, msg.sender, _amount);

        MarketEvent storage eventMarket = marketEvents[_marketId][_eventId];
        Position[] storage userPositions = positions[_marketId][_eventId][msg.sender];
        _consumeSellPositions(userPositions, _choice, _amount);
        _updatePoolsAfterSell(eventMarket, _choice, _amount, quote.grossPayout);
        _settleSellPayout(msg.sender, quote.fee, quote.netPayout);

        emit PredictionSold(
            _marketId,
            _eventId,
            msg.sender,
            _choice,
            _amount,
            quote.grossPayout,
            quote.fee,
            quote.netPayout,
            quote.exitPriceBps
        );
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
        bool hasActivePosition = false;

        for (uint256 i = 0; i < userPositions.length; i++) {
            Position storage position = userPositions[i];
            if (position.amount == 0) {
                continue;
            }
            require(!position.claimed, "Already claimed");
            hasActivePosition = true;

            if (position.choice == eventMarket.result) {
                winningAmount += position.amount;
            }
        }

        require(hasActivePosition, "No active prediction found");
        require(winningAmount > 0, "You lost");

        for (uint256 i = 0; i < userPositions.length; i++) {
            if (userPositions[i].amount == 0) {
                continue;
            }
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
        bool hasActivePosition = false;
        bool allClaimed = true;

        for (uint256 i = 0; i < userPositions.length; i++) {
            Position storage position = userPositions[i];
            if (position.amount == 0) {
                continue;
            }
            hasActivePosition = true;
            totalAmount += position.amount;
            latestChoice = position.choice;
            allClaimed = allClaimed && position.claimed;
        }

        if (!hasActivePosition) {
            return Prediction({ choice: Outcome.NONE, amount: 0, claimed: false });
        }

        return Prediction({ choice: latestChoice, amount: totalAmount, claimed: allClaimed });
    }

    function getUserPositionBreakdown(uint256 _marketId, uint256 _eventId, address _user) external view returns (uint256 yesAmount, uint256 noAmount, bool allClaimed) {
        Position[] storage userPositions = positions[_marketId][_eventId][_user];
        if (userPositions.length == 0) {
            return (0, 0, false);
        }

        bool hasActivePosition = false;
        uint256 yes = 0;
        uint256 no = 0;
        bool claimed = true;

        for (uint256 i = 0; i < userPositions.length; i++) {
            Position storage position = userPositions[i];
            if (position.amount == 0) {
                continue;
            }
            hasActivePosition = true;
            if (position.choice == Outcome.YES) {
                yes += position.amount;
            } else if (position.choice == Outcome.NO) {
                no += position.amount;
            }
            claimed = claimed && position.claimed;
        }

        if (!hasActivePosition) {
            return (0, 0, false);
        }

        return (yes, no, claimed);
    }

    function withdrawFees() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}
