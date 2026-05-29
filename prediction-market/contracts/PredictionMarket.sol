// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
Fee model:
- A platform fee is charged only when winners claim, in basis points via platformFeeBps.
- Fees are accumulated in collectedFees and can be withdrawn only by owner via withdrawFees.
- withdrawFees never uses address(this).balance, so user liquidity is not sweepable as protocol fees.

Share model:
- Users buy YES or NO shares per event using BNB.
- Shares are minted pro-rata versus existing side shares:
  shares = amount * totalSideShares / sidePool (or 1:1 when side is empty).
- This removes entry/exit price tracking entirely and avoids per-position bookkeeping.

claimWinnings math:
- After resolve, only winning-side shares are redeemable.
- grossPayout = userWinningShares * totalPool / totalWinningShares.
- fee = grossPayout * platformFeeBps / 10000, netPayout = grossPayout - fee.
*/
contract PredictionMarket {
    address public owner;

    uint256 private _status = 1;

    enum Outcome {
        NONE,
        YES,
        NO
    }

    struct Market {
        uint256 id;
        string question;
        uint256 endTime;
        uint256 eventCount;
    }

    struct MarketEvent {
        uint256 id;
        string name;
    }

    struct EventPool {
        uint256 yesPool;
        uint256 noPool;
        uint256 totalPool;
        uint256 totalYesShares;
        uint256 totalNoShares;
        bool resolved;
        Outcome result;
    }

    uint256 public marketCount;
    uint256 public collectedFees;
    uint256 public platformFeeBps = 300;
    uint256 public constant RESOLVE_BUFFER = 0;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(uint256 => MarketEvent)) public marketEvents;
    mapping(uint256 => mapping(uint256 => EventPool)) public eventPools;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public userYesShares;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public userNoShares;

    event MarketCreated(uint256 indexed id, string question, uint256 endTime, uint256 eventCount);
    event EventCreated(uint256 indexed marketId, uint256 indexed eventId, string name);
    event PredictionPlaced(
        uint256 indexed marketId,
        uint256 indexed eventId,
        address indexed user,
        Outcome choice,
        uint256 amount,
        uint256 sharesReceived
    );
    event EventResolved(uint256 indexed marketId, uint256 indexed eventId, Outcome result);
    event WinningsClaimed(uint256 indexed marketId, uint256 indexed eventId, address indexed user, uint256 amount);
    event FeesWithdrawn(address indexed owner, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier nonReentrant() {
        require(_status == 1, "Reentrant call");
        _status = 2;
        _;
        _status = 1;
    }

    constructor() {
        owner = msg.sender;
    }

    function _validateMarketAndEvent(uint256 marketId, uint256 eventId) private view returns (Market storage market) {
        market = markets[marketId];
        require(market.id != 0, "Market does not exist");
        require(eventId > 0 && eventId <= market.eventCount, "Event does not exist");
    }

    /// @notice Creates a new market with one or more named events.
    /// @param question Human-readable market question (for example: "World Cup 2026 Winner").
    /// @param eventNames Array of event labels under the market.
    /// @param durationInMinutes Market open duration in minutes from creation time.
    function createMarket(
        string memory question,
        string[] memory eventNames,
        uint256 durationInMinutes
    ) external onlyOwner {
        require(bytes(question).length > 0, "Question required");
        require(eventNames.length > 0, "At least one event required");
        require(eventNames.length <= 50, "Too many events");
        require(durationInMinutes > 0, "Duration must be > 0");

        marketCount += 1;
        uint256 newMarketId = marketCount;
        uint256 endTime = block.timestamp + (durationInMinutes * 1 minutes);

        markets[newMarketId] = Market({
            id: newMarketId,
            question: question,
            endTime: endTime,
            eventCount: eventNames.length
        });

        for (uint256 i = 0; i < eventNames.length; i++) {
            require(bytes(eventNames[i]).length > 0, "Event name empty");
            uint256 eventId = i + 1;

            marketEvents[newMarketId][eventId] = MarketEvent({
                id: eventId,
                name: eventNames[i]
            });

            eventPools[newMarketId][eventId].result = Outcome.NONE;
            emit EventCreated(newMarketId, eventId, eventNames[i]);
        }

        emit MarketCreated(newMarketId, question, endTime, eventNames.length);
    }

    /// @notice Places a YES or NO prediction using BNB and mints side shares.
    /// @param marketId Market identifier.
    /// @param eventId Event identifier within the market.
    /// @param choice Side to buy shares on: YES or NO.
    function predict(uint256 marketId, uint256 eventId, Outcome choice) external payable nonReentrant {
        Market storage market = _validateMarketAndEvent(marketId, eventId);
        require(block.timestamp < market.endTime, "Market ended");
        require(choice == Outcome.YES || choice == Outcome.NO, "Invalid choice");
        require(msg.value > 0, "Must send BNB");

        EventPool storage pool = eventPools[marketId][eventId];
        require(!pool.resolved, "Event resolved");

        uint256 shares;

        if (choice == Outcome.YES) {
            shares = (pool.totalYesShares == 0)
                ? msg.value
                : (msg.value * pool.totalYesShares) / pool.yesPool;
            require(shares > 0, "Amount too small");

            pool.yesPool += msg.value;
            pool.totalPool += msg.value;
            pool.totalYesShares += shares;
            userYesShares[marketId][eventId][msg.sender] += shares;
        } else {
            shares = (pool.totalNoShares == 0)
                ? msg.value
                : (msg.value * pool.totalNoShares) / pool.noPool;
            require(shares > 0, "Amount too small");

            pool.noPool += msg.value;
            pool.totalPool += msg.value;
            pool.totalNoShares += shares;
            userNoShares[marketId][eventId][msg.sender] += shares;
        }

        emit PredictionPlaced(marketId, eventId, msg.sender, choice, msg.value, shares);
    }

    /// @notice Resolves an event once the market has ended.
    /// @param marketId Market identifier.
    /// @param eventId Event identifier within the market.
    /// @param result Final result side: YES or NO.
    function resolveEvent(uint256 marketId, uint256 eventId, Outcome result) external onlyOwner {
        Market storage market = _validateMarketAndEvent(marketId, eventId);
        require(block.timestamp >= market.endTime + RESOLVE_BUFFER, "Market not ended");
        require(result == Outcome.YES || result == Outcome.NO, "Invalid result");

        EventPool storage pool = eventPools[marketId][eventId];
        require(!pool.resolved, "Already resolved");

        pool.resolved = true;
        pool.result = result;

        emit EventResolved(marketId, eventId, result);
    }

    /// @notice Claims resolved winnings for caller from one market event.
    /// @param marketId Market identifier.
    /// @param eventId Event identifier within the market.
    function claimWinnings(uint256 marketId, uint256 eventId) external nonReentrant {
        _validateMarketAndEvent(marketId, eventId);
        EventPool storage pool = eventPools[marketId][eventId];
        require(pool.resolved, "Not resolved");

        uint256 userShares;
        uint256 totalWinningShares;

        if (pool.result == Outcome.YES) {
            userShares = userYesShares[marketId][eventId][msg.sender];
            totalWinningShares = pool.totalYesShares;
            userYesShares[marketId][eventId][msg.sender] = 0;
        } else {
            userShares = userNoShares[marketId][eventId][msg.sender];
            totalWinningShares = pool.totalNoShares;
            userNoShares[marketId][eventId][msg.sender] = 0;
        }

        require(userShares > 0, "No winning position");
        require(totalWinningShares > 0, "No winners");

        uint256 grossPayout = (userShares * pool.totalPool) / totalWinningShares;
        uint256 fee = (grossPayout * platformFeeBps) / 10000;
        uint256 netPayout = grossPayout - fee;

        collectedFees += fee;
        (bool payoutOk, ) = payable(msg.sender).call{value: netPayout}("");
        require(payoutOk, "Payout failed");

        emit WinningsClaimed(marketId, eventId, msg.sender, netPayout);
    }

    /// @notice Withdraws only accumulated protocol fees.
    function withdrawFees() external onlyOwner {
        uint256 amount = collectedFees;
        require(amount > 0, "Nothing to withdraw");

        collectedFees = 0;
        (bool withdrawalOk, ) = payable(owner).call{value: amount}("");
        require(withdrawalOk, "Withdraw failed");

        emit FeesWithdrawn(owner, amount);
    }

    /// @notice Returns market metadata by id.
    /// @param marketId Market identifier.
    /// @return Market struct for the requested market.
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    /// @notice Returns event metadata by market and event id.
    /// @param marketId Market identifier.
    /// @param eventId Event identifier.
    /// @return MarketEvent struct for the requested event.
    function getEvent(uint256 marketId, uint256 eventId) external view returns (MarketEvent memory) {
        return marketEvents[marketId][eventId];
    }

    /// @notice Returns current implied YES probability in basis points.
    /// @param marketId Market identifier.
    /// @param eventId Event identifier.
    /// @return yesPriceBps Current YES price in bps, where 10000 = 100%.
    function getYesPriceBps(uint256 marketId, uint256 eventId) external view returns (uint256 yesPriceBps) {
        EventPool storage pool = eventPools[marketId][eventId];
        if (pool.totalPool == 0) {
            return 5000;
        }
        return (pool.yesPool * 10000) / pool.totalPool;
    }

    /// @notice Returns a user's YES and NO shares for one event.
    /// @param marketId Market identifier.
    /// @param eventId Event identifier.
    /// @param user User address to query.
    /// @return yesShares User YES shares.
    /// @return noShares User NO shares.
    function getUserShares(uint256 marketId, uint256 eventId, address user)
        external
        view
        returns (uint256 yesShares, uint256 noShares)
    {
        return (
            userYesShares[marketId][eventId][user],
            userNoShares[marketId][eventId][user]
        );
    }

    /// @notice Estimates the caller-selected side payout after fee if that side wins.
    /// @param marketId Market identifier.
    /// @param eventId Event identifier.
    /// @param user User address to estimate for.
    /// @param side Side to estimate against, YES or NO.
    /// @return netPayout Estimated payout after platform fee.
    function estimatePayout(uint256 marketId, uint256 eventId, address user, Outcome side)
        external
        view
        returns (uint256 netPayout)
    {
        EventPool storage pool = eventPools[marketId][eventId];
        uint256 shares = side == Outcome.YES
            ? userYesShares[marketId][eventId][user]
            : userNoShares[marketId][eventId][user];
        uint256 totalShares = side == Outcome.YES ? pool.totalYesShares : pool.totalNoShares;

        if (shares == 0 || totalShares == 0) {
            return 0;
        }

        uint256 gross = (shares * pool.totalPool) / totalShares;
        uint256 fee = (gross * platformFeeBps) / 10000;
        return gross - fee;
    }
}

/*
Test scenario (exact numbers):
1) Alice predicts YES with 0.1 BNB.
   - YES pool = 0.1, NO pool = 0, totalPool = 0.1
   - Alice YES shares = 0.1
2) Bob predicts NO with 0.2 BNB.
   - YES pool = 0.1, NO pool = 0.2, totalPool = 0.3
   - Bob NO shares = 0.2
3) Owner resolves event as YES once endTime is reached.
4) Alice claims:
   - userShares = 0.1, totalWinningShares = 0.1
   - grossPayout = 0.1 * 0.3 / 0.1 = 0.3 BNB
   - fee = 0.3 * 300 / 10000 = 0.009 BNB
   - netPayout = 0.291 BNB
   - collectedFees increases by 0.009 BNB
*/
