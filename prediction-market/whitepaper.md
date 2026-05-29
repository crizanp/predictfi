# predictwin Whitepaper

**Version 1.0 · May 2026**

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Vision & Mission](#vision--mission)
3. [How predictwin Works](#how-predictwin-works)
4. [Market Architecture](#market-architecture)
5. [Prediction Mechanics](#prediction-mechanics)
6. [Winner Calculation & Payout Formula](#winner-calculation--payout-formula)
7. [Smart Contract Deep Dive](#smart-contract-deep-dive)
8. [PWIN Token](#PWIN-token)
9. [Tokenomics](#tokenomics)
10. [Fee Structure](#fee-structure)
11. [Leaderboard & Reputation](#leaderboard--reputation)
12. [Whitelist & Presale](#whitelist--presale)
13. [Roadmap](#roadmap)
14. [Security & Audits](#security--audits)
15. [Team & Governance](#team--governance)
16. [Legal Disclaimer](#legal-disclaimer)

---

## 1. Executive Summary

predictwin is a fully on-chain, non-custodial prediction market protocol deployed on BNB Smart Chain (BSC). It enables anyone to trade outcome shares (YES / NO) on real-world events using BNB as collateral, with instant payouts settled directly by the smart contract.

predictwin is differentiated from centralised prediction platforms by:

- **Trustless settlement** — no human intermediary decides who wins; the contract enforces payouts.
- **Transparent odds** — all pool sizes are on-chain and visible to every participant.
- **PWIN incentives** — a utility and governance token that rewards accurate predictors, stakers, and active community members.
- **Zero withdrawal delays** — winners claim BNB immediately after market resolution.

Current deployment: BSC Testnet (`0xA789688f1ce8CF64f49c62798aF2259D73B598CC`). Mainnet launch follows the PWIN presale and token distribution.

---

## 2. Vision & Mission

**Vision:** Make prediction markets the standard tool for on-chain information aggregation — where real-world probability is priced transparently, 24/7, by a global crowd.

**Mission:** Build the most accessible, lowest-friction decentralised prediction market on BNB Chain — combining the speed and liquidity of BNB with the incentive power of PWIN.

---

## 3. How predictwin Works

### 3.1 High-Level Flow

```
1. Admin creates a market (question + events + deadline)
         ↓
2. Users browse open markets and select an event
         ↓
3. Users place a YES or NO prediction by sending BNB
         ↓
4. Market closes at the deadline (endTime)
         ↓
5. Admin resolves each event with the verified result
         ↓
6. Winners call claimWinnings() and receive BNB instantly
```

### 3.2 Participants

| Role | Description |
|------|-------------|
| **Admin (Owner)** | Creates markets, sets event names, resolves outcomes. Currently controlled by the predictwin team; governance will transition to PWIN holders post-mainnet. |
| **Predictors** | Any wallet that sends BNB to place a YES or NO position on a market event before closing time. |
| **Winners** | Predictors whose chosen outcome matches the resolved result. They receive their stake back plus a proportional share of the losing pool (minus platform fee). |
| **Losers** | Predictors on the wrong side. Their BNB is distributed to winners minus the platform fee. |

---

## 4. Market Architecture

### 4.1 Market Structure

Each market has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | uint256 | Auto-incrementing unique ID |
| `question` | string | The headline question (e.g. "FIFA World Cup 2026 — Who wins?") |
| `endTime` | uint256 | UNIX timestamp after which no new predictions are accepted |
| `eventCount` | uint256 | Number of sub-events (outcomes) within the market |

### 4.2 Market Events (Sub-Outcomes)

A single market can have **1 to 50 events**. Each event is an independently tradeable YES/NO binary outcome:

| Field | Type | Description |
|-------|------|-------------|
| `id` | uint256 | Event index (1-based) |
| `name` | string | Event label (e.g. "Brazil wins", "Spain wins") |
| `resolved` | bool | Whether the admin has settled this event |
| `result` | Outcome | `NONE` (default), `YES`, or `NO` |
| `yesPool` | uint256 | Total BNB staked on YES |
| `noPool` | uint256 | Total BNB staked on NO |
| `totalPool` | uint256 | `yesPool + noPool` |

### 4.3 User Positions

Each user can place **multiple positions** on the same event. All positions are stored as an array and aggregated for display. The contract tracks:

- `choice` — YES or NO
- `amount` — BNB sent
- `claimed` — whether winnings have been collected

---

## 5. Prediction Mechanics

### 5.1 Placing a Prediction

A user calls `predict(marketId, eventId, choice)` and attaches BNB as `msg.value`.

**Validation rules enforced on-chain:**
- Market must exist (`market.id != 0`)
- Event must be within range (`1 ≤ eventId ≤ eventCount`)
- Current timestamp must be **before** `market.endTime`
- Event must **not** be resolved
- Choice must be `YES` (1) or `NO` (2)
- `msg.value` must be greater than 0

### 5.2 Implied Probability / Live Odds

The implied probability of YES at any moment is:

$$P_{YES} = \frac{\text{yesPool}}{\text{totalPool}}$$

The implied probability of NO:

$$P_{NO} = \frac{\text{noPool}}{\text{totalPool}}$$

These update in real-time as predictions are placed. The UI displays them as percentage bars on each market card.

### 5.3 Multi-Event Markets

For markets with multiple events (e.g., a sports tournament bracket), each event is independently priced and resolved. Users can predict on one, some, or all events within a market.

---

## 6. Winner Calculation & Payout Formula

This is the core economic engine of predictwin, implemented transparently in the smart contract.

### 6.1 Core Concept

predictwin uses a **parimutuel-style** settlement model. There is no house liquidity — the losers' pool is entirely redistributed to winners, minus the platform fee.

### 6.2 Step-by-Step Calculation

After an event is resolved with outcome `R` (either YES or NO):

**Step 1 — Define pools:**
```
winningPool = pool of the correct side  (yesPool if R=YES, noPool if R=NO)
losingPool  = pool of the incorrect side (noPool if R=YES, yesPool if R=NO)
```

**Step 2 — User's winning amount (their stake on the correct side):**
```
winningAmount = sum of all the user's correct positions
```

**Step 3 — User's proportional share of the losing pool:**
$$\text{userLosingShare} = \frac{\text{losingPool} \times \text{winningAmount}}{\text{winningPool}}$$

This formula gives each winner a share of the losing pool proportional to how much of the winning pool they contributed. A winner who staked 10% of the winning pool receives 10% of the losing pool.

**Step 4 — Platform fee:**
$$\text{fee} = \frac{\text{userLosingShare} \times \text{platformFee}}{100}$$

The platform fee (5%) is **only applied to the loser share** — not to the winner's original stake. This means:
- If you bet on the correct side, you **always** get your original stake back in full.
- The fee only reduces the profit portion.

**Step 5 — Final payout:**
$$\text{winnings} = \text{winningAmount} + \text{userLosingShare} - \text{fee}$$

### 6.3 Example Walkthrough

Suppose a market has the following state when resolved as **YES**:

| Pool | Amount |
|------|--------|
| yesPool | 10 BNB |
| noPool | 30 BNB |
| totalPool | 40 BNB |

A user placed 2 BNB on YES.

```
winningPool    = 10 BNB
losingPool     = 30 BNB
winningAmount  = 2 BNB

userLosingShare = (30 × 2) / 10 = 6 BNB

fee             = (6 × 5) / 100 = 0.3 BNB

winnings        = 2 + 6 − 0.3 = 7.7 BNB
```

The user's **net profit** is 5.7 BNB on a 2 BNB stake — a 285% return. The effective odds were 4× (40 BNB total ÷ 10 BNB YES pool), and after the 5% fee on profits, the user received 7.7 BNB.

### 6.4 Why This Fee Design?

The fee formula is designed so that:

$$\sum_{\text{all winners}} \text{fee}_i = \frac{\text{platformFee} \times \text{losingPool}}{100}$$

This means the **total fees collected exactly equal 5% of the losing pool**, regardless of how many winners there are or how they distribute their claims. The contract never runs into a shortfall.

### 6.5 Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| User predicted the **losing side** | `claimWinnings` reverts with "You lost" |
| All stakes are on **one side** | The other pool is 0; no redistribution needed — users get their stake back; fee = 0 |
| User has **already claimed** | Transaction reverts with "Already claimed" |
| Market **not resolved** | Transaction reverts with "Not resolved yet" |

---

## 7. Smart Contract Deep Dive

### 7.1 Contract Address

| Network | Address |
|---------|---------|
| BSC Testnet | `0xA789688f1ce8CF64f49c62798aF2259D73B598CC` |
| BSC Mainnet | TBD (post-presale) |

### 7.2 Key Functions

| Function | Access | Description |
|----------|--------|-------------|
| `createMarket(question, eventNames[], durationMinutes)` | Owner only | Deploy a new market with up to 50 events |
| `predict(marketId, eventId, choice)` | Public (payable) | Place YES or NO prediction, send BNB |
| `resolveEvent(marketId, eventId, result)` | Owner only | Set the outcome after market closes |
| `claimWinnings(marketId, eventId)` | Public | Collect payout for a resolved winning position |
| `getMarket(marketId)` | View | Return market metadata |
| `getEvent(marketId, eventId)` | View | Return event state including pool sizes |
| `getUserPrediction(marketId, eventId, user)` | View | Return aggregated user position |
| `withdrawFees()` | Owner only | Withdraw accumulated contract balance |

### 7.3 Security Properties

- **Non-custodial** — BNB is held in the contract and paid out directly to users; no intermediary wallet.
- **No reentrancy risk** — claim logic marks positions as claimed **before** calling `transfer()`.
- **Owner-gated resolution** — only the deployer address can call `resolveEvent`, preventing manipulation from third parties.
- **Immutable pool math** — once a market closes, pool sizes are final; no oracle manipulation risk on the settlement calculation.

### 7.4 Events Emitted

| Event | Parameters | Description |
|-------|-----------|-------------|
| `MarketCreated` | id, question, endTime, eventCount | Fired when a new market is created |
| `MarketEventCreated` | marketId, eventId, name | Fired for each sub-event |
| `PredictionPlaced` | marketId, eventId, user, choice, amount | Fired on each prediction |
| `EventResolved` | marketId, eventId, result | Fired when admin resolves an event |
| `WinningsClaimed` | marketId, eventId, user, amount | Fired on successful payout |

---

## 8. PWIN Token

### 8.1 Overview

PWIN is the native utility and governance token of predictwin. It is a BEP-20 token on BNB Smart Chain.

**Total Supply:** 1,000,000,000 PWIN (1 billion, fixed supply)

### 8.2 Utility

| Use Case | Description |
|----------|-------------|
| **Fee Discounts** | Pay platform fees in PWIN for up to 50% discount on trading costs |
| **Staking Rewards** | Stake PWIN to earn a share of protocol revenue |
| **Governance** | Vote on market listings, fee changes, and protocol upgrades |
| **Priority Access** | PWIN holders get early entry to high-volume markets |
| **Airdrop Rewards** | Top predictors receive PWIN airdrops based on activity |
| **Premium Markets** | Unlock exclusive high-stakes market rooms |

### 8.3 Presale Details

| Parameter | Value |
|-----------|-------|
| Presale Platform | moonsale.app |
| Presale Dates | June 1–7, 2026 |
| Total Raise Target | 150 BNB |
| Presale Price | TBA on moonsale.app |
| Listing | PancakeSwap V3 |

---

## 9. Tokenomics

### 9.1 Allocation Table

| Category | Allocation | Vesting |
|----------|-----------|---------|
| Public Sale | 40% (400M PWIN) | Unlocked at TGE |
| Ecosystem & Rewards | 20% (200M PWIN) | Streamed by season tied to protocol activity |
| Team | 15% (150M PWIN) | 3-year vesting with 6-month cliff |
| Reserve | 10% (100M PWIN) | Governance-approved deployment only |
| Advisors | 10% (100M PWIN) | Milestone-unlocked buckets |
| Airdrop | 5% (50M PWIN) | Campaign waves with anti-sybil filtering |

### 9.2 Why These Allocations?

**Public Sale (40%)** — A large public allocation ensures broad community ownership from day one and builds trust through transparent, open access.

**Ecosystem & Rewards (20%)** — Protocol growth requires active market makers, referral incentives, and liquidity support. Rewards stream by measurable season metrics.

**Team (15%, 3-year vest)** — Aligns contributors with long-term execution rather than short-term price. Cliff plus linear vest with milestone-linked policies.

**Reserve (10%)** — Treasury buffer for market volatility, security events, and strategic partnerships. Only deployed via governance proposals.

**Advisors (10%)** — Specialist advisors on token design, legal, security, and go-to-market. Milestones tied to audits, listings, and ecosystem integrations.

**Airdrop (5%)** — Rewards early users, accurate predictors, and drives social distribution ahead of mainnet scale.

---

## 10. Fee Structure

| Fee Type | Rate | Applied To |
|----------|------|-----------|
| Platform Fee | 5% | Applied only to the loser-pool share redistributed to winners — never to the original stake |
| Withdrawal Fee | 0% | No fee for claiming winnings |
| Listing Fee | 0% | Free for approved markets |

The 5% platform fee is mathematically guaranteed to equal exactly 5% of the losing pool in aggregate across all winners (see Section 6.4 for proof). There are no hidden fees.

---

## 11. Leaderboard & Reputation

predictwin maintains an on-chain-derived leaderboard tracking:

- **Total winnings (BNB)** — cumulative BNB earned from correct predictions
- **Win rate (%)** — percentage of resolved predictions that were correct
- **Total volume** — total BNB staked across all markets
- **Rank** — global percentile ranking updated after each market resolution

Leaderboard data is indexed off-chain via Supabase from contract event logs and is publicly viewable at `/leaderboard`. Top performers are eligible for PWIN airdrop campaigns.

---

## 12. Whitelist & Presale

The predictwin whitelist grants early access to:

- Presale allocation at the lowest available price tier
- Guaranteed participation before public opening
- Priority PWIN airdrop eligibility
- Beta feature access during testnet

To join the whitelist, visit `/whitelist` and submit your wallet address. Whitelist snapshot is taken 48 hours before presale opens.

---

## 13. Roadmap

### Phase 1 — Foundation (Q1–Q2 2026) ✅
- [x] Smart contract development and deployment on BSC Testnet
- [x] Core prediction UI (market browse, detail, trade panel)
- [x] Wallet integration (MetaMask, WalletConnect)
- [x] Admin portal for market creation and resolution
- [x] Leaderboard and portfolio tracking
- [x] Whitelist registration system
- [x] PWIN presale launch on moonsale.app (June 1–7, 2026)

### Phase 2 — Mainnet Launch (Q3 2026)
- [ ] BSC Mainnet smart contract deployment
- [ ] PWIN token deployment and PancakeSwap listing
- [ ] Staking module (stake PWIN, earn BNB revenue share)
- [ ] Governance module (on-chain proposals and voting)
- [ ] Mobile-responsive progressive web app
- [ ] Security audit by a top-tier firm

### Phase 3 — Ecosystem Growth (Q4 2026)
- [ ] Multi-category markets (sports, crypto, politics, entertainment)
- [ ] Market creation by whitelisted community members
- [ ] PWIN fee discount system
- [ ] Partnership integrations (data oracles, DeFi protocols)
- [ ] Cross-chain expansion (Ethereum, Arbitrum)

### Phase 4 — Decentralisation (2027)
- [ ] Full governance handover to PWIN holders
- [ ] Oracle-verified auto-resolution of markets
- [ ] Layer-2 deployment for lower gas fees
- [ ] API access for third-party integrations

---

## 14. Security & Audits

### Current Status
The predictwin smart contract is currently deployed on BSC Testnet for community testing. A formal security audit is scheduled for Q3 2026 prior to mainnet launch.

### Security Design Principles

1. **Claim-before-transfer** — positions are marked as claimed before any `transfer()` call, preventing reentrancy.
2. **Input validation** — all function inputs are validated on-chain with explicit require statements.
3. **Owner-gated resolution** — market resolution is restricted to the contract owner; cannot be manipulated by predictors.
4. **Fixed-supply math** — payout calculations are deterministic and overflow-safe under Solidity 0.8.x's built-in checked arithmetic.
5. **No flash loan risk** — prediction amounts are locked until market close; pool values cannot be manipulated within a single transaction.

### Responsible Disclosure
If you discover a vulnerability in the predictwin smart contract or frontend, please contact security@predictwin.io before public disclosure. Responsible disclosures may receive PWIN bug bounty rewards.

---

## 15. Team & Governance

### Current Governance
In the current beta phase, the predictwin team (contract owner wallet) controls market creation and resolution. All actions are publicly verifiable on BSCScan.

### Transition to Decentralisation
Post-mainnet, governance will transition to PWIN token holders via an on-chain governance module:

- Any holder of ≥ 10,000 PWIN can submit a proposal.
- Proposals are voted on over a 7-day window.
- A 5% quorum of circulating supply is required for a proposal to pass.

Governance scope includes: fee parameters, new market categories, contract upgrades (via proxy), treasury allocations.

---

## 16. Legal Disclaimer

predictwin is a decentralised protocol. Participation in prediction markets involves financial risk. Predictions can result in the total loss of staked BNB. This whitepaper does not constitute financial or investment advice.

PWIN tokens are utility tokens that provide access to protocol features. They are not securities and do not represent ownership, equity, or a claim on future profits of any legal entity. Token values are market-determined and may fluctuate significantly.

Users are solely responsible for complying with the laws of their jurisdiction. Participation from jurisdictions where prediction markets or crypto-assets are restricted is at the user's own risk.

**This document is provided for informational purposes only and is subject to change as the protocol evolves.**

---

*© 2026 predictwin. All rights reserved.*
