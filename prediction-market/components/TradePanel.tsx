'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import { useMarkets } from '../context/MarketsContext'
import { Market, UserPrediction } from '../context/MarketsContext'
import { formatToken, computePoolMetrics, resultLabel } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import type { MarketMeta } from '../lib/supabase'
import styles from './TradePanel.module.css'

interface FloatLabel { id: number; text: string; isYes: boolean }

interface MarketEventOption {
  key: string
  eventId: number
  name: string
  yesLabel?: string
  noLabel?: string
}

interface Props {
  market: Market
  nowInSeconds: number
  meta?: MarketMeta | null
  selectedEventKey?: string
  onSelectedEventKeyChange?: (eventKey: string) => void
}

function formatInputAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  return value
    .toFixed(6)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1')
}

export default function TradePanel({ market, nowInSeconds, meta, selectedEventKey: selectedEventKeyProp, onSelectedEventKeyChange }: Props) {
  const { account, isOwner, isBusy, busyAction, setShowWalletModal, isContractConfigured, isAuthenticated } = useWallet()
  const { getEventUserPrediction, placePrediction, sellPrediction, quoteSellPrediction, resolveMarket, claimWinnings } = useMarkets()
  const { addToast } = useToast()

  const eventOptions = useMemo<MarketEventOption[]>(() => {
    const baseYesLabel = meta?.yes_label || 'YES'
    const baseNoLabel = meta?.no_label || 'NO'

    let eventLabelOverrides: Array<{ yesLabel?: string; noLabel?: string }> = []
    const raw = meta?.events_json?.trim()
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          eventLabelOverrides = parsed.map((row) => {
            const obj = row as Record<string, unknown>
            return {
              yesLabel: String(obj.yesLabel ?? '').trim() || undefined,
              noLabel: String(obj.noLabel ?? '').trim() || undefined,
            }
          })
        }
      } catch {
        eventLabelOverrides = []
      }
    }

    const fromChain = market.events.map((event, index) => ({
      key: String(event.id),
      eventId: event.id,
      name: event.name,
      yesLabel: eventLabelOverrides[index]?.yesLabel || baseYesLabel,
      noLabel: eventLabelOverrides[index]?.noLabel || baseNoLabel,
    }))

    if (fromChain.length > 0) return fromChain

    return [{
      key: '1',
      eventId: 1,
      name: market.eventName || 'Main Event',
      yesLabel: baseYesLabel,
      noLabel: baseNoLabel,
    }]
  }, [market.eventName, market.events, meta])

  const [selectedEventKeyState, setSelectedEventKeyState] = useState('1')
  const selectedEventKey = selectedEventKeyProp ?? selectedEventKeyState

  useEffect(() => {
    if (selectedEventKeyProp !== undefined) {
      return
    }
    if (!eventOptions.some((event) => event.key === selectedEventKeyState) && eventOptions[0]) {
      const timer = setTimeout(() => {
        setSelectedEventKeyState(eventOptions[0].key)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [eventOptions, selectedEventKeyProp, selectedEventKeyState])

  const setSelectedEventKey = useCallback((eventKey: string) => {
    if (onSelectedEventKeyChange) {
      onSelectedEventKeyChange(eventKey)
      return
    }
    setSelectedEventKeyState(eventKey)
  }, [onSelectedEventKeyChange])

  const effectiveEventKey = eventOptions.some((e) => e.key === selectedEventKey)
    ? selectedEventKey
    : (eventOptions[0]?.key ?? '1')

  const selectedEvent = useMemo(
    () => eventOptions.find((e) => e.key === effectiveEventKey) ?? eventOptions[0],
    [eventOptions, effectiveEventKey]
  )
  const selectedEventId = Number.parseInt(selectedEvent?.key ?? '1', 10)
  const selectedEventState = useMemo(
    () => market.events.find((event) => event.id === selectedEventId) ?? market.events[0],
    [market.events, selectedEventId]
  )

  const yesLabel = selectedEvent?.yesLabel || meta?.yes_label || 'YES'
  const noLabel  = selectedEvent?.noLabel  || meta?.no_label  || 'NO'

  const userPrediction: UserPrediction | undefined = account ? getEventUserPrediction(market.id, selectedEventId) : undefined
  const userYesAmount = Number.parseFloat(userPrediction?.yesAmount ?? '0')
  const userNoAmount = Number.parseFloat(userPrediction?.noAmount ?? '0')
  const hasMixedPosition = userYesAmount > 0 && userNoAmount > 0

  const [selectedOutcome, setSelectedOutcome] = useState<1 | 2>(1)
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy')
  const activeOutcome = selectedOutcome

  const [amount, setAmount] = useState('0.01')
  const [sellAmount, setSellAmount] = useState('')
  const [sellQuote, setSellQuote] = useState({
    exitPriceBps: 0,
    grossPayout: 0,
    fee: 0,
    netPayout: 0,
  })
  const [isSellQuoteLoading, setIsSellQuoteLoading] = useState(false)
  const [flashBtn, setFlashBtn] = useState<'yes' | 'no' | null>(null)
  const [floats, setFloats] = useState<FloatLabel[]>([])
  const floatIdRef = useRef(0)

  const metrics = useMemo(
    () => computePoolMetrics(
      selectedEventState?.yesPool ?? '0',
      selectedEventState?.noPool ?? '0',
      selectedEventState?.totalPool ?? '0'
    ),
    [selectedEventState]
  )
  const isEnded = nowInSeconds > 0 && market.endTime <= nowInSeconds
  const isEventResolved = selectedEventState?.resolved ?? false
  const isMarketClosed = isEventResolved || isEnded
  const isBuyingThis = busyAction === `predict-${market.id}-${selectedEventId}-${activeOutcome}`
  const isSellingThis = busyAction === `sell-${market.id}-${selectedEventId}-${activeOutcome}`
  const isResolving  = busyAction?.startsWith(`resolve-${market.id}-${selectedEventId}-`)
  const isClaiming   = busyAction === `claim-${market.id}-${selectedEventId}`

  const canBuy = isContractConfigured && isAuthenticated && account !== null && !isMarketClosed && !isBusy
  const sellableAmount = activeOutcome === 1 ? userYesAmount : userNoAmount
  const canSell = isContractConfigured && isAuthenticated && account !== null && !isMarketClosed && !isBusy && sellableAmount > 0

  const estimatedPayout = useMemo(() => {
    const amt = Number.parseFloat(amount || '0')
    if (!Number.isFinite(amt) || amt <= 0) return 0
    const currentYes = Number.parseFloat(selectedEventState?.yesPool ?? '0')
    const currentNo = Number.parseFloat(selectedEventState?.noPool ?? '0')
    const winningPool = activeOutcome === 1 ? currentYes + amt : currentNo + amt
    const losingPool = activeOutcome === 1 ? currentNo : currentYes
    if (winningPool <= 0) return 0
    const userLosingShare = (losingPool * amt) / winningPool
    const fee = userLosingShare * 0.05
    return amt + userLosingShare - fee
  }, [amount, activeOutcome, selectedEventState])

  const handleBuy = useCallback(async () => {
    if (!account || !isAuthenticated) { setShowWalletModal(true); return }
    const isYes = activeOutcome === 1
    const id = ++floatIdRef.current
    setFloats((prev) => [...prev, { id, text: `+${amount} tBNB`, isYes }])
    setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 1500)
    try {
      await placePrediction(market.id, selectedEventId, activeOutcome, amount)
      setFlashBtn(isYes ? 'yes' : 'no')
      setTimeout(() => setFlashBtn(null), 700)
      addToast(
        `Bought ${isYes ? yesLabel : noLabel} — +${amount} tBNB on ${selectedEvent?.name ?? 'Main Event'} (market #${market.id})`,
        isYes ? 'buy-yes' : 'buy-no'
      )
    } catch {
      addToast('Trade failed. Check your wallet and try again.', 'error')
    }
  }, [account, amount, market.id, placePrediction, selectedEventId, activeOutcome, setShowWalletModal, addToast, yesLabel, noLabel, selectedEvent, isAuthenticated])

  const handleSell = useCallback(async () => {
    if (!account || !isAuthenticated) { setShowWalletModal(true); return }
    const parsed = Number.parseFloat(sellAmount || '0')
    if (!Number.isFinite(parsed) || parsed <= 0) {
      addToast('Enter a valid sell amount.', 'error')
      return
    }
    if (parsed > sellableAmount) {
      addToast('Sell amount exceeds your position.', 'error')
      return
    }

    try {
      await sellPrediction(market.id, selectedEventId, activeOutcome, sellAmount)
      setSellAmount('')
      addToast(
        `Sold ${activeOutcome === 1 ? yesLabel : noLabel} — ${sellAmount} tBNB on ${selectedEvent?.name ?? 'Main Event'} (market #${market.id})`,
        'info'
      )
    } catch {
      addToast('Sell failed. Check your wallet and try again.', 'error')
    }
  }, [account, isAuthenticated, sellAmount, sellableAmount, sellPrediction, market.id, selectedEventId, activeOutcome, addToast, yesLabel, noLabel, selectedEvent, setShowWalletModal])

  useEffect(() => {
    const parsed = Number.parseFloat(sellAmount || '0')
    if (!Number.isFinite(parsed) || parsed <= sellableAmount) return
    setSellAmount(formatInputAmount(sellableAmount))
  }, [sellAmount, sellableAmount])

  useEffect(() => {
    if (activeTab !== 'sell' || isMarketClosed || !account || !isAuthenticated) {
      setSellQuote({ exitPriceBps: 0, grossPayout: 0, fee: 0, netPayout: 0 })
      setIsSellQuoteLoading(false)
      return
    }

    const parsed = Number.parseFloat(sellAmount || '0')
    if (!Number.isFinite(parsed) || parsed <= 0 || sellableAmount <= 0) {
      setSellQuote({ exitPriceBps: 0, grossPayout: 0, fee: 0, netPayout: 0 })
      setIsSellQuoteLoading(false)
      return
    }

    let cancelled = false
    setIsSellQuoteLoading(true)
    const requestedAmount = Math.min(parsed, sellableAmount)
    const timer = setTimeout(() => {
      void quoteSellPrediction(market.id, selectedEventId, activeOutcome, formatInputAmount(requestedAmount)).then((quote) => {
        if (cancelled) return
        setSellQuote({
          exitPriceBps: quote.exitPriceBps,
          grossPayout: Number.parseFloat(quote.grossPayout || '0') || 0,
          fee: Number.parseFloat(quote.fee || '0') || 0,
          netPayout: Number.parseFloat(quote.netPayout || '0') || 0,
        })
        setIsSellQuoteLoading(false)
      })
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [account, activeOutcome, activeTab, isAuthenticated, isMarketClosed, market.id, quoteSellPrediction, selectedEventId, sellAmount, sellableAmount])

  const canClaimWinnings =
    isAuthenticated &&
    isEventResolved &&
    (selectedEventState?.result ?? 0) !== 0 &&
    userPrediction &&
    ((selectedEventState?.result ?? 0) === 1 ? userYesAmount : userNoAmount) > 0 &&
    !userPrediction.claimed

  const canResolve = isOwner && !isEventResolved && isEnded
  const currentLabel = activeOutcome === 1 ? yesLabel : noLabel

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

{/* -- Buy / Sell tabs -------------------------- */}
{!isMarketClosed && (
  <div className={styles.tradeTabs}>
    <button
      className={activeTab === 'buy' ? styles.tradeTabBuyActive : styles.tradeTab}
      onClick={() => setActiveTab('buy')}
    >
      Buy
    </button>
    <button
      className={activeTab === 'sell' ? styles.tradeTabSellActive : styles.tradeTab}
      onClick={() => setActiveTab('sell')}
      disabled={!userPrediction}
    >
      Sell
    </button>
  </div>
)}

      {eventOptions.length > 1 ? (
        <div className={styles.eventSelectWrap}>
          <label className={styles.eventLabel} htmlFor={`event-select-${market.id}`}>Event</label>
          <select
            id={`event-select-${market.id}`}
            className={styles.eventSelect}
            value={effectiveEventKey}
            onChange={(e) => setSelectedEventKey(e.target.value)}
          >
            {eventOptions.map((event) => (
              <option key={event.key} value={event.key}>{event.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className={styles.singleEventTag}>{selectedEvent?.name ?? 'Main Event'}</div>
      )}

      {/* -- Outcome selector + trade form ------------ */}
    {/* -- Outcome selector + trade form ------------ */}
<>
  {/* Resolved banner */}
  {isEventResolved && (
    <div className={`${styles.resolvedBanner} ${(selectedEventState?.result ?? 0) === 1 ? styles.resolvedYes : styles.resolvedNo}`}>
      &#10003; Resolved: <strong>{resultLabel(selectedEventState?.result ?? 0)}</strong>
    </div>
  )}

  {/* ── BUY TAB ───────────────────────────────── */}
  {(activeTab === 'buy' || isMarketClosed) && (
    <>
      {/* Outcome selector */}
      {!isMarketClosed && (
        <div className={styles.outcomeSelect}>
          <button
            className={`${styles.outcomeBtn} ${activeOutcome === 1 ? styles.outcomeBtnYesActive : ''}`}
            onClick={() => setSelectedOutcome(1)}
          >
            <span className={styles.outcomeLabelText}>{yesLabel}</span>
            <span className={styles.outcomePct}>{metrics.yesPrice}¢</span>
          </button>
          <button
            className={`${styles.outcomeBtn} ${activeOutcome === 2 ? styles.outcomeBtnNoActive : ''}`}
            onClick={() => setSelectedOutcome(2)}
          >
            <span className={styles.outcomeLabelText}>{noLabel}</span>
            <span className={styles.outcomePct}>{metrics.noPrice}¢</span>
          </button>
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

      {/* Est. payout row */}
      {!isMarketClosed && (
        <div className={styles.toWinRow}>
          <div className={styles.toWinLeft}>
            <span className={styles.toWinSub}>Est. payout
              <span className={styles.priceHintWrap}>
                <span className={styles.priceHintTrigger} tabIndex={0}>i</span>
                <span className={styles.priceHintBubble}>
                  This shows your estimated total payout if the selected side wins. It uses the current pool sizes, your stake, and the 5% platform fee applied to your share of the losing pool.
                </span>
              </span>
            </span>
          </div>
          <div className={`${styles.toWinAmount} ${activeOutcome === 1 ? styles.toWinYes : styles.toWinNo}`}>
            {estimatedPayout > 0 ? `${estimatedPayout.toFixed(4)} tBNB` : '—'}
          </div>
        </div>
      )}

      {/* Your position card */}
      {userPrediction && (
        <div className={`${styles.positionCard} ${hasMixedPosition ? styles.positionMixed : userPrediction.choice === 1 ? styles.positionYes : styles.positionNo}`}>
          <div className={styles.positionRow}>
            <span className={styles.positionLabel}>Your Position</span>
            <span className={`${styles.positionOutcome} ${hasMixedPosition ? styles.outcomeMixed : userPrediction.choice === 1 ? styles.outcomeYes : styles.outcomeNo}`}>
              {hasMixedPosition ? 'MIXED' : userPrediction.choice === 1 ? yesLabel : noLabel}
            </span>
          </div>
          {hasMixedPosition && (
            <>
              <div className={styles.positionRow}>
                <span className={styles.positionLabel}>{yesLabel} Staked</span>
                <span className={styles.positionAmount}>{formatToken(userPrediction.yesAmount ?? '0')} tBNB</span>
              </div>
              <div className={styles.positionRow}>
                <span className={styles.positionLabel}>{noLabel} Staked</span>
                <span className={styles.positionAmount}>{formatToken(userPrediction.noAmount ?? '0')} tBNB</span>
              </div>
            </>
          )}
          <div className={styles.positionRow}>
            <span className={styles.positionLabel}>Staked</span>
            <span className={styles.positionAmount}>{formatToken(userPrediction.amount)} tBNB</span>
          </div>
          {isEventResolved && (
            <div className={styles.positionRow}>
              <span className={styles.positionLabel}>Claim Status</span>
              <span className={canClaimWinnings ? styles.win : userPrediction.claimed ? styles.win : styles.lose}>
                {userPrediction.claimed ? 'CLAIMED' : canClaimWinnings ? 'CAN CLAIM ON-CHAIN' : 'NO CLAIM'}
              </span>
            </div>
          )}
          {userPrediction.claimed && <div className={styles.claimedBadge}>Payout claimed on-chain</div>}
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
          : !isAuthenticated
            ? 'Login / Signup'
            : isMarketClosed
              ? (isEventResolved ? 'Event Resolved' : 'Market Ended')
              : `Buy ${currentLabel}`}
      </button>

      {/* You Get (est.) */}
      {!isMarketClosed && estimatedPayout > 0 && (
        <div className={styles.youGetRow}>
          <span className={styles.youGetLabel}>You Get (est.)</span>
          <div className={styles.youGetRight}>
            <span className={styles.youGetAmount}>{estimatedPayout.toFixed(4)}</span>
            <span className={styles.youGetShares}>tBNB payout if {currentLabel.toUpperCase()} wins</span>
          </div>
        </div>
      )}
    </>
  )}

  {/* ── SELL TAB ──────────────────────────────── */}
  {activeTab === 'sell' && !isMarketClosed && (
    <div className={styles.sellTab}>
      {/* Outcome selector for sell */}
      <div className={styles.sellOutcomeSelect}>
        <button
          className={activeOutcome === 1 ? styles.sellOutcomeBtnYesActive : styles.sellOutcomeBtn}
          onClick={() => setSelectedOutcome(1)}
        >
          <span className={styles.outcomeLabelText}>{yesLabel}</span>
          <span className={styles.sellPositionAmt}>
            {userYesAmount > 0 ? `${userYesAmount.toFixed(4)}` : '0'}
          </span>
        </button>
        <button
          className={activeOutcome === 2 ? styles.sellOutcomeBtnNoActive : styles.sellOutcomeBtn}
          onClick={() => setSelectedOutcome(2)}
        >
          <span className={styles.outcomeLabelText}>{noLabel}</span>
          <span className={styles.sellPositionAmt}>
            {userNoAmount > 0 ? `${userNoAmount.toFixed(4)}` : '0'}
          </span>
        </button>
      </div>

      <div className={styles.sellInfo}>
        <div className={styles.sellRow}>
          <span className={styles.sellRowLabel}>Sellable {currentLabel}</span>
          <strong className={activeOutcome === 1 ? styles.textYes : styles.textNo}>
            {sellableAmount > 0 ? `${sellableAmount.toFixed(4)} tBNB` : '0.0000 tBNB'}
          </strong>
        </div>
        <p className={styles.sellNote}>
          Sell a partial amount or use MAX to close your full {currentLabel} position.
        </p>
      </div>

      {sellableAmount > 0 ? (
        <>
          <div className={styles.amountInputRow}>
            <span className={styles.amountCurrency}>tBNB</span>
            <input
              id="sell-amount"
              className={styles.amountInput}
              type="number"
              min="0"
              step="0.001"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              placeholder="0.01"
            />
          </div>
          <div className={styles.presets}>
            {[0.25, 0.5, 0.75].map((share) => (
              <button
                key={share}
                className={styles.preset}
                onClick={() => setSellAmount(formatInputAmount(sellableAmount * share))}
              >
                {Math.round(share * 100)}%
              </button>
            ))}
            <button
              className={styles.preset}
              onClick={() => setSellAmount(formatInputAmount(sellableAmount))}
            >
              MAX
            </button>
          </div>
          <button
            className={`${styles.tradeBtn} ${styles.sellBtn}`}
            onClick={() => { void handleSell() }}
            disabled={!canSell || isSellingThis}
          >
            {isSellingThis && <span className={styles.btnSpinner} />}
            {isSellingThis ? `Selling ${currentLabel}...` : `Sell ${currentLabel}`}
          </button>

          <div className={styles.youGetRow}>
            <span className={styles.youGetLabel}>You Get (est.)</span>
            <div className={styles.youGetRight}>
              <span className={styles.youGetAmount}>
                {isSellQuoteLoading
                  ? '...'
                  : sellQuote.netPayout > 0
                    ? `${sellQuote.netPayout.toFixed(4)} tBNB`
                    : '—'}
              </span>
              <span className={styles.youGetShares}>
                {sellQuote.exitPriceBps > 0
                  ? `exit @ ${(sellQuote.exitPriceBps / 100).toFixed(2)}% • fee ${sellQuote.fee.toFixed(4)} tBNB (2%)`
                  : 'includes market repricing and 2% sell fee'}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.noPosition}>No {currentLabel} position available to sell.</div>
      )}
    </div>
  )}
</>

      {/* -- Claim Winnings ---------------------------- */}
      {canClaimWinnings && (
        <button
          className={styles.claimBtn}
          onClick={() => { void claimWinnings(market.id, selectedEventId) }}
          disabled={isClaiming || isBusy}
        >
          {isClaiming ? 'Claiming...' : 'Claim Winnings'}
        </button>
      )}

      {/* -- Admin Resolve ----------------------------- */}
      {canResolve && (
        <div className={styles.resolveSection}>
          <p className={styles.resolveLabel}>Resolve Market (Owner Only)</p>
          <div className={styles.resolveBtns}>
            <button
              className={styles.resolveYesBtn}
              onClick={() => { void resolveMarket(market.id, 1, selectedEventId) }}
              disabled={isResolving || isBusy}
            >
              {isResolving ? 'Resolving...' : `${yesLabel} Wins`}
            </button>
            <button
              className={styles.resolveNoBtn}
              onClick={() => { void resolveMarket(market.id, 2, selectedEventId) }}
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

