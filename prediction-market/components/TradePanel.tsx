'use client'

import { useState, useMemo, useCallback } from 'react'
import { useWallet } from '../context/WalletContext'
import { useMarkets } from '../context/MarketsContext'
import { Market, UserPrediction } from '../context/MarketsContext'
import { formatToken, computePoolMetrics, resultLabel } from '../lib/utils'
import styles from './TradePanel.module.css'

interface Props {
  market: Market
  nowInSeconds: number
}

export default function TradePanel({ market, nowInSeconds }: Props) {
  const { account, isOwner, isBusy, busyAction, setShowWalletModal, isContractConfigured } = useWallet()
  const { userPredictions, placePrediction, resolveMarket, claimWinnings } = useMarkets()

  const [selectedOutcome, setSelectedOutcome] = useState<1 | 2>(1)
  const [amount, setAmount] = useState('0.01')

  const userPrediction: UserPrediction | undefined = account ? userPredictions[market.id] : undefined
  const metrics = useMemo(() => computePoolMetrics(market.yesPool, market.noPool, market.totalPool), [market])
  const isEnded = nowInSeconds > 0 && market.endTime <= nowInSeconds
  const isMarketClosed = market.resolved || isEnded
  const isBuyingThis = busyAction === `predict-${market.id}-${selectedOutcome}`
  const isResolving = busyAction?.startsWith(`resolve-${market.id}`)
  const isClaiming = busyAction === `claim-${market.id}`

  const estimatedReturn = useMemo(() => {
    const amt = Number.parseFloat(amount || '0')
    if (!Number.isFinite(amt) || amt <= 0) return 0
    const sharePrice = selectedOutcome === 1 ? metrics.yesPrice / 100 : metrics.noPrice / 100
    if (sharePrice <= 0) return 0
    return amt / sharePrice
  }, [amount, metrics.noPrice, metrics.yesPrice, selectedOutcome])

  const potentialReward = useMemo(() => {
    if (!userPrediction) return 0
    const total = Number.parseFloat(market.totalPool)
    const winningPool = userPrediction.choice === 1
      ? Number.parseFloat(market.yesPool)
      : Number.parseFloat(market.noPool)
    if (winningPool <= 0) return 0
    const amt = Number.parseFloat(userPrediction.amount)
    return (amt * total) / winningPool
  }, [market, userPrediction])

  const handleBuy = useCallback(async () => {
    if (!account) {
      setShowWalletModal(true)
      return
    }
    await placePrediction(market.id, selectedOutcome, amount)
  }, [account, amount, market.id, placePrediction, selectedOutcome, setShowWalletModal])

  const canBuy =
    isContractConfigured &&
    account &&
    !isMarketClosed &&
    !userPrediction &&
    !isBusy

  const tradeButtonLabel = () => {
    if (!account) return 'Connect Wallet to Trade'
    if (!isContractConfigured) return 'Contract Not Configured'
    if (isBuyingThis) return 'Placing...'
    if (isMarketClosed) return market.resolved ? 'Market Resolved' : 'Market Ended'
    if (userPrediction) return 'Position Already Placed'
    return selectedOutcome === 1 ? 'Buy YES' : 'Buy NO'
  }

  const canClaimWinnings =
    market.resolved &&
    market.result !== 0 &&
    userPrediction &&
    userPrediction.choice === market.result &&
    !userPrediction.claimed

  const canResolve = isOwner && !market.resolved && isEnded

  return (
    <div className={styles.panel}>
      {/* Pool Stats */}
      <div className={styles.poolStats}>
        <div className={styles.poolStat}>
          <span className={styles.poolLabel}>YES Pool</span>
          <span className={styles.poolValueYes}>{formatToken(market.yesPool)} tBNB</span>
          <span className={styles.poolPct}>{metrics.yesPct}%</span>
        </div>
        <div className={styles.poolBar}>
          <div className={styles.barYes} style={{ width: `${metrics.yesPct}%` }} />
          <div className={styles.barNo} style={{ width: `${metrics.noPct}%` }} />
        </div>
        <div className={styles.poolStat}>
          <span className={styles.poolLabel}>NO Pool</span>
          <span className={styles.poolValueNo}>{formatToken(market.noPool)} tBNB</span>
          <span className={styles.poolPct}>{metrics.noPct}%</span>
        </div>
      </div>

      {/* Total Pool */}
      <div className={styles.totalPool}>
        Total Pool: <strong>{formatToken(market.totalPool)} tBNB</strong>
      </div>

      {/* Resolved Result */}
      {market.resolved && (
        <div className={`${styles.resolvedBanner} ${market.result === 1 ? styles.resolvedYes : styles.resolvedNo}`}>
          Market resolved: <strong>{resultLabel(market.result)}</strong>
        </div>
      )}

      {/* Your Position (if exists) */}
      {userPrediction && (
        <div className={`${styles.positionCard} ${userPrediction.choice === 1 ? styles.positionYes : styles.positionNo}`}>
          <div className={styles.positionRow}>
            <span className={styles.positionLabel}>Your Position</span>
            <span className={`${styles.positionOutcome} ${userPrediction.choice === 1 ? styles.outcomeYes : styles.outcomeNo}`}>
              {userPrediction.choice === 1 ? 'YES' : 'NO'}
            </span>
          </div>
          <div className={styles.positionRow}>
            <span className={styles.positionLabel}>Staked</span>
            <span>{formatToken(userPrediction.amount)} tBNB</span>
          </div>
          {market.resolved && (
            <div className={styles.positionRow}>
              <span className={styles.positionLabel}>
                {userPrediction.choice === market.result ? 'Reward Est.' : 'Result'}
              </span>
              <span className={userPrediction.choice === market.result ? styles.win : styles.lose}>
                {userPrediction.choice === market.result
                  ? `${formatToken(String(potentialReward))} tBNB`
                  : 'Lost'}
              </span>
            </div>
          )}
          {userPrediction.claimed && (
            <div className={styles.claimedBadge}>Winnings Claimed ✓</div>
          )}
        </div>
      )}

      {/* Trade Form */}
      {!isMarketClosed && !userPrediction && (
        <>
          <div className={styles.outcomeSelect}>
            <button
              className={selectedOutcome === 1 ? styles.outcomeYesActive : styles.outcomeBtn}
              onClick={() => setSelectedOutcome(1)}
            >
              YES {metrics.yesPrice}¢
            </button>
            <button
              className={selectedOutcome === 2 ? styles.outcomeNoActive : styles.outcomeBtn}
              onClick={() => setSelectedOutcome(2)}
            >
              NO {metrics.noPrice}¢
            </button>
          </div>

          <div className={styles.amountSection}>
            <label className={styles.amountLabel} htmlFor="trade-amount">
              Amount (tBNB)
            </label>
            <input
              id="trade-amount"
              className={styles.amountInput}
              type="number"
              min="0"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.01"
            />
            <div className={styles.presets}>
              {['0.01', '0.05', '0.1', '0.5'].map((v) => (
                <button key={v} className={styles.preset} onClick={() => setAmount(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span>Est. Return</span>
              <strong>{estimatedReturn > 0 ? `${estimatedReturn.toFixed(4)} tBNB` : '-'}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Outcome</span>
              <strong className={selectedOutcome === 1 ? styles.textYes : styles.textNo}>
                {selectedOutcome === 1 ? 'YES' : 'NO'}
              </strong>
            </div>
          </div>
        </>
      )}

      {/* Primary Action */}
      {!isMarketClosed || !market.resolved ? (
        <button
          className={`${styles.tradeBtn} ${selectedOutcome === 1 ? styles.tradeBtnYes : styles.tradeBtnNo} ${!canBuy ? styles.tradeBtnDisabled : ''}`}
          onClick={() => { void handleBuy() }}
          disabled={!canBuy || isBuyingThis}
        >
          {tradeButtonLabel()}
        </button>
      ) : null}

      {/* Claim Winnings */}
      {canClaimWinnings && (
        <button
          className={styles.claimBtn}
          onClick={() => { void claimWinnings(market.id) }}
          disabled={isClaiming || isBusy}
        >
          {isClaiming ? 'Claiming...' : 'Claim Winnings'}
        </button>
      )}

      {/* Admin Resolve */}
      {canResolve && (
        <div className={styles.resolveSection}>
          <p className={styles.resolveLabel}>Resolve Market (Owner Only)</p>
          <div className={styles.resolveBtns}>
            <button
              className={styles.resolveYesBtn}
              onClick={() => { void resolveMarket(market.id, 1) }}
              disabled={isResolving || isBusy}
            >
              {isResolving ? 'Resolving...' : 'Resolve YES'}
            </button>
            <button
              className={styles.resolveNoBtn}
              onClick={() => { void resolveMarket(market.id, 2) }}
              disabled={isResolving || isBusy}
            >
              {isResolving ? 'Resolving...' : 'Resolve NO'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
