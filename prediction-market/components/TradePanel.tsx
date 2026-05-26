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

export default function TradePanel({ market, nowInSeconds, meta, selectedEventKey: selectedEventKeyProp, onSelectedEventKeyChange }: Props) {
  const { account, isOwner, isBusy, busyAction, setShowWalletModal, isContractConfigured } = useWallet()
  const { getEventUserPrediction, placePrediction, resolveMarket, claimWinnings } = useMarkets()
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
      setSelectedEventKeyState(eventOptions[0].key)
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

  const [selectedOutcome, setSelectedOutcome] = useState<1 | 2>(1)
  const activeOutcome = selectedOutcome

  const [amount, setAmount] = useState('0.01')
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
  const isResolving  = busyAction?.startsWith(`resolve-${market.id}-${selectedEventId}-`)
  const isClaiming   = busyAction === `claim-${market.id}-${selectedEventId}`

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
    const total = Number.parseFloat(selectedEventState?.totalPool ?? '0')
    const winPool = userPrediction.choice === 1
      ? Number.parseFloat(selectedEventState?.yesPool ?? '0')
      : Number.parseFloat(selectedEventState?.noPool ?? '0')
    if (winPool <= 0) return 0
    return (Number.parseFloat(userPrediction.amount) * total) / winPool
  }, [selectedEventState, userPrediction])

  const handleBuy = useCallback(async () => {
    if (!account) { setShowWalletModal(true); return }
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
  }, [account, amount, market.id, placePrediction, selectedEventId, activeOutcome, setShowWalletModal, addToast, yesLabel, noLabel, selectedEvent])

  const canClaimWinnings =
    isEventResolved &&
    (selectedEventState?.result ?? 0) !== 0 &&
    userPrediction &&
    userPrediction.choice === (selectedEventState?.result ?? 0) &&
    !userPrediction.claimed

  const canResolve = isOwner && !isEventResolved && isEnded
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

          {/* Resolved banner */}
          {isEventResolved && (
            <div className={`${styles.resolvedBanner} ${(selectedEventState?.result ?? 0) === 1 ? styles.resolvedYes : styles.resolvedNo}`}>
              &#10003; Resolved: <strong>{resultLabel(selectedEventState?.result ?? 0)}</strong>
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
              {isEventResolved && (
                <div className={styles.positionRow}>
                  <span className={styles.positionLabel}>
                    {userPrediction.choice === (selectedEventState?.result ?? 0) ? 'Est. Reward' : 'Result'}
                  </span>
                  <span className={userPrediction.choice === (selectedEventState?.result ?? 0) ? styles.win : styles.lose}>
                    {userPrediction.choice === (selectedEventState?.result ?? 0)
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
                ? (isEventResolved ? 'Event Resolved' : 'Market Ended')
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
          onClick={() => { void claimWinnings(market.id, selectedEventId) }}
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

