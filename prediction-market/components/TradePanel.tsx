'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import { useMarkets } from '../context/MarketsContext'
import { Market, UserPrediction } from '../context/MarketsContext'
import { formatToken, computePoolMetrics, resultLabel } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import styles from './TradePanel.module.css'

interface FloatLabel { id: number; text: string; isYes: boolean }

interface Props {
  market: Market
  nowInSeconds: number
}

export default function TradePanel({ market, nowInSeconds }: Props) {
  const { account, isOwner, isBusy, busyAction, setShowWalletModal, isContractConfigured } = useWallet()
  const { userPredictions, totalInvested, placePrediction, resolveMarket, claimWinnings } = useMarkets()
  const { addToast } = useToast()

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
  const isResolving = busyAction?.startsWith(`resolve-`)
  const isClaiming = busyAction === `claim-${market.id}`

  const canBuy =
    isContractConfigured &&
    account !== null &&
    !isMarketClosed &&
    !isBusy

  const isAdding = Boolean(userPrediction) && canBuy

  const estimatedReturn = useMemo(() => {
    const amt = Number.parseFloat(amount || '0')
    if (!Number.isFinite(amt) || amt <= 0) return 0
    const sharePrice = activeOutcome === 1 ? metrics.yesPrice / 100 : metrics.noPrice / 100
    if (sharePrice <= 0) return 0
    return amt / sharePrice
  }, [amount, metrics.noPrice, metrics.yesPrice, activeOutcome])

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
        `Bought ${isYes ? 'YES' : 'NO'} · +${amount} tBNB on market #${market.id}`,
        isYes ? 'buy-yes' : 'buy-no'
      )
    } catch {
      addToast('Trade failed. Check your wallet and try again.', 'error')
    }
  }, [account, amount, market.id, placePrediction, activeOutcome, setShowWalletModal, addToast])

  const tradeButtonLabel = () => {
    if (!account) return 'Connect Wallet to Trade'
    if (!isContractConfigured) return 'Contract Not Configured'
    if (isBuyingThis) return 'Placing Trade...'
    if (isMarketClosed) return market.resolved ? 'Market Resolved' : 'Market Ended'
    if (isAdding) return activeOutcome === 1 ? '+ Add to YES' : '+ Add to NO'
    return activeOutcome === 1 ? 'Buy YES' : 'Buy NO'
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

      {/* Float-up animations */}
      <div className={styles.floatContainer} aria-hidden>
        {floats.map((f) => (
          <span key={f.id} className={`${styles.floatLabel} ${f.isYes ? styles.floatYes : styles.floatNo}`}>
            {f.text}
          </span>
        ))}
      </div>

      {/* ── Pool Stats ─────────────────────────────── */}
      <div className={styles.poolStats}>
        <div className={styles.poolSide}>
          <span className={styles.poolLabel}>YES Pool</span>
          <span className={styles.poolValueYes}>{formatToken(market.yesPool)}</span>
          <span className={styles.poolPctYes}>{metrics.yesPct}%</span>
        </div>
        <div className={styles.poolBar}>
          <div className={styles.barYes} style={{ width: `${metrics.yesPct}%` }} />
          <div className={styles.barNo}  style={{ width: `${metrics.noPct}%` }} />
        </div>
        <div className={styles.poolSide}>
          <span className={styles.poolLabel}>NO Pool</span>
          <span className={styles.poolValueNo}>{formatToken(market.noPool)}</span>
          <span className={styles.poolPctNo}>{metrics.noPct}%</span>
        </div>
      </div>

      <div className={styles.totalPool}>
        Total: <strong>{formatToken(market.totalPool)} tBNB</strong>
      </div>

      {/* ── Resolved Banner ────────────────────────── */}
      {market.resolved && (
        <div className={`${styles.resolvedBanner}`}>
          🏁 Resolved: <strong>{resultLabel(market.result)}</strong>
        </div>
      )}

      {/* ── Your Position ──────────────────────────── */}
      {userPrediction && (
        <div className={`${styles.positionCard}`}>
          <div className={styles.positionRow}>
            <span className={styles.positionLabel}>Your Position</span>
            <span className={`${userPrediction.choice === 1 ? styles.positionChoiceYes : styles.positionChoiceNo}`}>
              {userPrediction.choice === 1 ? 'YES' : 'NO'}
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
          {userPrediction.claimed && <div className={styles.claimedBadge}>✓ Winnings Claimed</div>}
        </div>
      )}

      {/* ── Trade Form ────────────────────────────── */}
      {!isMarketClosed && (
        <>
          {/* Outcome selector */}
          <div className={styles.outcomeSelect}>
            <button
              className={activeOutcome === 1 ? styles.outcomeYesActive : styles.outcomeBtn}
              onClick={() => { if (!lockedOutcome) setSelectedOutcome(1) }}
              disabled={Boolean(lockedOutcome && lockedOutcome !== 1)}
            >
              YES <span className={styles.outcomePct}>{metrics.yesPrice}¢</span>
            </button>
            <button
              className={activeOutcome === 2 ? styles.outcomeNoActive : styles.outcomeBtn}
              onClick={() => { if (!lockedOutcome) setSelectedOutcome(2) }}
              disabled={Boolean(lockedOutcome && lockedOutcome !== 2)}
            >
              NO <span className={styles.outcomePct}>{metrics.noPrice}¢</span>
            </button>
          </div>

          {lockedOutcome && (
            <p className={styles.addNote}>
              ↳ Adding to your existing <strong>{lockedOutcome === 1 ? 'YES' : 'NO'}</strong> position
            </p>
          )}

          {/* Amount input */}
          <div className={styles.amountSection}>
            <label className={styles.amountLabel} htmlFor="trade-amount">Amount (tBNB)</label>
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
                <button key={v} className={`${styles.preset} ${amount === v ? styles.presetActive : ''}`} onClick={() => setAmount(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span>Est. Return</span>
              <strong>{estimatedReturn > 0 ? `${estimatedReturn.toFixed(4)} tBNB` : '—'}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Direction</span>
              <strong className={activeOutcome === 1 ? styles.textYes : styles.textNo}>
                {activeOutcome === 1 ? 'YES' : 'NO'}
              </strong>
            </div>
          </div>
        </>
      )}

      {/* ── Primary Trade Button ───────────────────── */}
      <button
        className={`${styles.tradeBtn} ${activeOutcome === 1 ? styles.tradeBtnYes : styles.tradeBtnNo} ${flashBtn === 'yes' ? styles.flashYes : flashBtn === 'no' ? styles.flashNo : ''}`}
        onClick={() => { void handleBuy() }}
        disabled={!canBuy || isBuyingThis}
      >
        {isBuyingThis && <span className={styles.btnSpinner} />}
        {tradeButtonLabel()}
      </button>

      {/* ── Claim Winnings ─────────────────────────── */}
      {canClaimWinnings && (
        <button
          className={styles.claimBtn}
          onClick={() => { void claimWinnings(market.id) }}
          disabled={isClaiming || isBusy}
        >
          {isClaiming ? 'Claiming...' : '🏆 Claim Winnings'}
        </button>
      )}

      {/* ── Admin Resolve ──────────────────────────── */}
      {canResolve && (
        <div className={styles.resolveSection}>
          <p className={styles.resolveLabel}>⚡ Resolve Market (Owner Only)</p>
          <div className={styles.resolveBtns}>
            <button
              className={styles.resolveYesBtn}
              onClick={() => { void resolveMarket(market.id, 1) }}
              disabled={isResolving || isBusy}
            >
              {isResolving ? 'Resolving...' : 'YES Wins'}
            </button>
            <button
              className={styles.resolveNoBtn}
              onClick={() => { void resolveMarket(market.id, 2) }}
              disabled={isResolving || isBusy}
            >
              {isResolving ? 'Resolving...' : 'NO Wins'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}