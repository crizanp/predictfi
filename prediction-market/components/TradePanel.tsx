'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import { useMarkets } from '../context/MarketsContext'
import { Market, UserPrediction } from '../context/MarketsContext'
import { formatToken, computePoolMetrics, resultLabel } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import type { MarketMeta } from '../lib/supabase'
import styles from './TradePanel.module.css'

interface FloatLabel { id: number; text: string; isYes: boolean }

interface Props {
  market: Market
  nowInSeconds: number
  meta?: MarketMeta | null
}

export default function TradePanel({ market, nowInSeconds, meta }: Props) {
  const { account, isOwner, isBusy, busyAction, setShowWalletModal, isContractConfigured } = useWallet()
  const { userPredictions, placePrediction, resolveMarket, claimWinnings } = useMarkets()
  const { addToast } = useToast()

  const yesLabel = meta?.yes_label || 'YES'
  const noLabel  = meta?.no_label  || 'NO'

  const userPrediction: UserPrediction | undefined = account ? userPredictions[market.id] : undefined

  const [selectedOutcome, setSelectedOutcome] = useState<1 | 2>(1)
  const lockedOutcome = userPrediction ? (userPrediction.choice as 1 | 2) : null
  const activeOutcome = lockedOutcome ?? selectedOutcome

  const [amount, setAmount] = useState('0.01')
  const [flashBtn, setFlashBtn] = useState<'yes' | 'no' | null>(null)
  const [floats, setFloats] = useState<FloatLabel[]>([])
  const floatIdRef = useRef(0)

  const metrics = useMemo(() => computePoolMetrics(market.yesPool, market.noPool, market.totalPool), [market])
  const isEnded = nowInSeconds > 0 && market.endTime <= nowInSeconds
  const isMarketClosed = market.resolved || isEnded
  const isBuyingThis = busyAction === `predict-${market.id}`
  const isResolving  = busyAction?.startsWith('resolve-')
  const isClaiming   = busyAction === `claim-${market.id}`

  const canBuy = isContractConfigured && account !== null && !isMarketClosed && !isBusy

  const estimatedShares = useMemo(() => {
    const amt = Number.parseFloat(amount || '0')
    if (!Number.isFinite(amt) || amt <= 0) return 0
    const sharePrice = activeOutcome === 1 ? metrics.yesPrice / 100 : metrics.noPrice / 100
    if (sharePrice <= 0) return 0
    return amt / sharePrice
  }, [amount, metrics, activeOutcome])

  const potentialReward = useMemo(() => {
    if (!userPrediction) return 0
    const total = Number.parseFloat(market.totalPool)
    const winPool = userPrediction.choice === 1
      ? Number.parseFloat(market.yesPool)
      : Number.parseFloat(market.noPool)
    if (winPool <= 0) return 0
    return (Number.parseFloat(userPrediction.amount) * total) / winPool
  }, [market, userPrediction])

  const handleBuy = useCallback(async () => {
    if (!account) { setShowWalletModal(true); return }
    const isYes = activeOutcome === 1
    const id = ++floatIdRef.current
    setFloats((prev) => [...prev, { id, text: `+${amount} tBNB`, isYes }])
    setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 1500)
    try {
      await placePrediction(market.id, activeOutcome, amount)
      setFlashBtn(isYes ? 'yes' : 'no')
      setTimeout(() => setFlashBtn(null), 700)
      addToast(
        `Bought ${isYes ? yesLabel : noLabel} — +${amount} tBNB on market #${market.id}`,
        isYes ? 'buy-yes' : 'buy-no'
      )
    } catch {
      addToast('Trade failed. Check your wallet and try again.', 'error')
    }
  }, [account, amount, market.id, placePrediction, activeOutcome, setShowWalletModal, addToast, yesLabel, noLabel])

  const canClaimWinnings =
    market.resolved &&
    market.result !== 0 &&
    userPrediction &&
    userPrediction.choice === market.result &&
    !userPrediction.claimed

  const canResolve = isOwner && !market.resolved && isEnded
  const currentLabel = activeOutcome === 1 ? yesLabel : noLabel
  const currentPrice = activeOutcome === 1 ? metrics.yesPrice : metrics.noPrice

  return (
    <div className={styles.panel}>

      {/* Float-up animations */}
      <div className={styles.floatContainer} aria-hidden>
        {floats.map((f) => (
          <span key={f.id} className={`${styles.floatLabel} ${f.isYes ? styles.floatYes : styles.floatNo}`}>
            {f.text}
          </span>
        ))}
      </div>

      {/* -- Header ------------------------------------ */}
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Predict</span>
        <span className={styles.orderType}>Market Order</span>
      </div>

      {/* -- Outcome selector + trade form ------------ */}
      <>
          {/* Outcome selector */}
          {!isMarketClosed && (
            <div className={styles.outcomeSelect}>
              <button
                className={`${styles.outcomeBtn} ${activeOutcome === 1 ? styles.outcomeBtnYesActive : ''}`}
                onClick={() => { if (!lockedOutcome) setSelectedOutcome(1) }}
                disabled={Boolean(lockedOutcome && lockedOutcome !== 1)}
              >
                <span className={styles.outcomeLabelText}>{yesLabel}</span>
                <span className={styles.outcomePct}>{metrics.yesPrice}¢</span>
              </button>
              <button
                className={`${styles.outcomeBtn} ${activeOutcome === 2 ? styles.outcomeBtnNoActive : ''}`}
                onClick={() => { if (!lockedOutcome) setSelectedOutcome(2) }}
                disabled={Boolean(lockedOutcome && lockedOutcome !== 2)}
              >
                <span className={styles.outcomeLabelText}>{noLabel}</span>
                <span className={styles.outcomePct}>{metrics.noPrice}¢</span>
              </button>
            </div>
          )}

          {/* Resolved banner */}
          {market.resolved && (
            <div className={`${styles.resolvedBanner} ${market.result === 1 ? styles.resolvedYes : styles.resolvedNo}`}>
              &#10003; Resolved: <strong>{resultLabel(market.result)}</strong>
            </div>
          )}

          {/* Amount input */}
          {!isMarketClosed && (
            <div className={styles.amountSection}>
              <div className={styles.amountHeader}>
                <span className={styles.amountLabel}>Amount</span>
                <span className={styles.amountBalance}>Balance: tBNB</span>
              </div>
              <div className={styles.amountInputRow}>
                <span className={styles.amountCurrency}>tBNB</span>
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
              </div>
              <div className={styles.presets}>
                {['0.01', '0.05', '0.1', '0.5'].map((v) => (
                  <button
                    key={v}
                    className={`${styles.preset} ${amount === v ? styles.presetActive : ''}`}
                    onClick={() => setAmount(v)}
                  >{v}</button>
                ))}
                <button
                  className={`${styles.preset} ${amount === '1.0' ? styles.presetActive : ''}`}
                  onClick={() => setAmount('1.0')}
                >MAX</button>
              </div>
            </div>
          )}

          {/* To Win row */}
          {!isMarketClosed && (
            <div className={styles.toWinRow}>
              <div className={styles.toWinLeft}>
                <span className={styles.toWinLabel}>To Win</span>
                <span className={styles.toWinSub}>Avg. Price: {currentPrice}¢</span>
              </div>
              <div className={`${styles.toWinAmount} ${activeOutcome === 1 ? styles.toWinYes : styles.toWinNo}`}>
                {estimatedShares > 0 ? `${estimatedShares.toFixed(4)} tBNB` : '—'}
              </div>
            </div>
          )}

          {/* Your position card */}
          {userPrediction && (
            <div className={`${styles.positionCard} ${userPrediction.choice === 1 ? styles.positionYes : styles.positionNo}`}>
              <div className={styles.positionRow}>
                <span className={styles.positionLabel}>Your Position</span>
                <span className={`${styles.positionOutcome} ${userPrediction.choice === 1 ? styles.outcomeYes : styles.outcomeNo}`}>
                  {userPrediction.choice === 1 ? yesLabel : noLabel}
                </span>
              </div>
              <div className={styles.positionRow}>
                <span className={styles.positionLabel}>Staked</span>
                <span className={styles.positionAmount}>{formatToken(userPrediction.amount)} tBNB</span>
              </div>
              {market.resolved && (
                <div className={styles.positionRow}>
                  <span className={styles.positionLabel}>
                    {userPrediction.choice === market.result ? 'Est. Reward' : 'Result'}
                  </span>
                  <span className={userPrediction.choice === market.result ? styles.win : styles.lose}>
                    {userPrediction.choice === market.result
                      ? `${potentialReward.toFixed(4)} tBNB`
                      : 'LOST'}
                  </span>
                </div>
              )}
              {userPrediction.claimed && <div className={styles.claimedBadge}>? Winnings Claimed</div>}
            </div>
          )}

          {/* Buy button */}
          <button
            className={`${styles.tradeBtn} ${activeOutcome === 1 ? styles.tradeBtnYes : styles.tradeBtnNo} ${flashBtn === 'yes' ? styles.flashYes : flashBtn === 'no' ? styles.flashNo : ''}`}
            onClick={() => { void handleBuy() }}
            disabled={!canBuy || isBuyingThis}
          >
            {isBuyingThis && <span className={styles.btnSpinner} />}
            {!account
              ? 'Connect Wallet'
              : isMarketClosed
                ? (market.resolved ? 'Market Resolved' : 'Market Ended')
                : `Buy ${currentLabel}`}
          </button>

          {/* You Get (est.) */}
          {!isMarketClosed && estimatedShares > 0 && (
            <div className={styles.youGetRow}>
              <span className={styles.youGetLabel}>You Get (est.)</span>
              <div className={styles.youGetRight}>
                <span className={styles.youGetAmount}>{estimatedShares.toFixed(3)}</span>
                <span className={styles.youGetShares}>{currentLabel.toUpperCase()} Shares</span>
              </div>
            </div>
          )}
        </>

      {/* -- Claim Winnings ---------------------------- */}
      {canClaimWinnings && (
        <button
          className={styles.claimBtn}
          onClick={() => { void claimWinnings(market.id) }}
          disabled={isClaiming || isBusy}
        >
          {isClaiming ? 'Claiming...' : '?? Claim Winnings'}
        </button>
      )}

      {/* -- Admin Resolve ----------------------------- */}
      {canResolve && (
        <div className={styles.resolveSection}>
          <p className={styles.resolveLabel}>? Resolve Market (Owner Only)</p>
          <div className={styles.resolveBtns}>
            <button
              className={styles.resolveYesBtn}
              onClick={() => { void resolveMarket(market.id, 1) }}
              disabled={isResolving || isBusy}
            >
              {isResolving ? 'Resolving...' : `${yesLabel} Wins`}
            </button>
            <button
              className={styles.resolveNoBtn}
              onClick={() => { void resolveMarket(market.id, 2) }}
              disabled={isResolving || isBusy}
            >
              {isResolving ? 'Resolving...' : `${noLabel} Wins`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

