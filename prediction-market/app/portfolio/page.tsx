'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  RiWallet3Line,
  RiTrophyLine,
  RiBarChart2Line,
  RiPieChartLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiArrowUpSLine,
  RiCheckLine,
} from 'react-icons/ri'
import { useWallet } from '../../context/WalletContext'
import { ClaimEvent, useMarkets } from '../../context/MarketsContext'
import { getActivityByUserAddress, type MarketActivity } from '../../lib/supabase'
import styles from './page.module.css'

const PLATFORM_FEE_PCT = 5

function eventKey(marketId: number, eventId: number): string {
  return `${marketId}:${eventId}`
}

function formatDateTime(value?: string): string {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PortfolioPage() {
  const { account, setShowWalletModal } = useWallet()
  const { markets, userPredictions, getEventUserPrediction, claimWinnings, getMarketClaims, isLoadingMarkets, isLoadingPredictions, hasLoadedMarkets } = useMarkets()
  const [activeMarketId, setActiveMarketId] = useState<number | null>(null)
  const [activityByMarket, setActivityByMarket] = useState<Record<number, MarketActivity[]>>({})
  const [claimsByEvent, setClaimsByEvent] = useState<Record<string, ClaimEvent[]>>({})
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const isPortfolioLoading = Boolean(account) && (!hasLoadedMarkets || isLoadingMarkets || isLoadingPredictions || isDetailsLoading)

  useEffect(() => {
    if (!account) {
      const timer = setTimeout(() => {
        setActivityByMarket({})
        setClaimsByEvent({})
        setIsDetailsLoading(false)
      }, 0)
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      setIsDetailsLoading(true)

      void (async () => {
        try {
          const activityRows = await getActivityByUserAddress(account)
          const marketIds = Array.from(new Set([
            ...activityRows.map((row) => row.market_id),
            ...Object.keys(userPredictions).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
          ]))

          if (marketIds.length === 0) {
            setActivityByMarket({})
            setClaimsByEvent({})
            return
          }

          const claimRows = await Promise.all(
            marketIds.map(async (marketId) => ({ marketId, rows: await getMarketClaims(marketId) }))
          )

          const nextActivityByMarket: Record<number, MarketActivity[]> = {}
          for (const row of activityRows) {
            const current = nextActivityByMarket[row.market_id] ?? []
            current.push(row)
            nextActivityByMarket[row.market_id] = current
          }

          const nextClaimsByEvent: Record<string, ClaimEvent[]> = {}
          for (const item of claimRows) {
            for (const claim of item.rows) {
              const key = eventKey(item.marketId, claim.eventId)
              const current = nextClaimsByEvent[key] ?? []
              current.push(claim)
              nextClaimsByEvent[key] = current
            }
          }

          setActivityByMarket(nextActivityByMarket)
          setClaimsByEvent(nextClaimsByEvent)
        } finally {
          setIsDetailsLoading(false)
        }
      })()
    }, 0)

    return () => clearTimeout(timer)
  }, [account, getMarketClaims, userPredictions])

  const portfolioMarkets = useMemo(() => {
    return markets
      .map((market) => {
        const id = market.id
        const pred = userPredictions[id] ?? {
          choice: 0,
          amount: '0',
          claimed: false,
          yesAmount: '0',
          noAmount: '0',
          hasBothSides: false,
        }

        const userEvents = market.events.map((eventItem) => {
          const eventActivity = (activityByMarket[id] ?? []).filter((row) => Number(row.event_id ?? 1) === eventItem.id)
          const claims = claimsByEvent[eventKey(id, eventItem.id)] ?? []
          const claimedAmount = claims.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0)
          const prediction = getEventUserPrediction(id, eventItem.id)
          const predictedAmount = Number(prediction?.amount ?? 0)
          const predictedYes = Number(prediction?.yesAmount ?? 0)
          const predictedNo = Number(prediction?.noAmount ?? 0)
          const hasEventPosition =
            eventActivity.length > 0 ||
            predictedAmount > 0 ||
            predictedYes > 0 ||
            predictedNo > 0 ||
            Boolean(prediction?.claimed) ||
            claimedAmount > 0
          if (!hasEventPosition) return null

          const investedYes = eventActivity
            .filter((row) => row.choice === 1)
            .reduce((sum, row) => sum + (parseFloat(row.amount_eth) || 0), 0)
          const investedNo = eventActivity
            .filter((row) => row.choice === 2)
            .reduce((sum, row) => sum + (parseFloat(row.amount_eth) || 0), 0)
          const investedTotal = investedYes + investedNo

          const winnerSide = eventItem.result
          const winningStake = winnerSide === 1 ? investedYes : winnerSide === 2 ? investedNo : 0
          const losingStake = investedTotal - winningStake

          const yesPool = parseFloat(eventItem.yesPool) || 0
          const noPool = parseFloat(eventItem.noPool) || 0
          const winningPool = winnerSide === 1 ? yesPool : winnerSide === 2 ? noPool : 0
          const losingPool = winnerSide === 1 ? noPool : winnerSide === 2 ? yesPool : 0

          const userLosingShare = winningPool > 0 ? (losingPool * winningStake) / winningPool : 0
          const platformFee = (userLosingShare * PLATFORM_FEE_PCT) / 100
          const grossPayout = winningStake + userLosingShare
          const netPayout = grossPayout - platformFee

          const hasClaimed = Boolean(prediction?.claimed) || claimedAmount > 0
          const canClaim = eventItem.resolved && winningStake > 0 && !hasClaimed
          const effectiveClaimedAmount = claimedAmount > 0
            ? claimedAmount
            : (hasClaimed && winningStake > 0 ? netPayout : 0)

          const firstTx = eventActivity[eventActivity.length - 1]
          const lastTx = eventActivity[0]

          return {
            event: eventItem,
            investedYes,
            investedNo,
            investedTotal,
            winningStake,
            losingStake,
            userLosingShare,
            platformFee,
            grossPayout,
            netPayout,
            hasClaimed,
            canClaim,
            claimedAmount: effectiveClaimedAmount,
            firstAt: firstTx?.created_at,
            lastAt: lastTx?.created_at,
            txs: eventActivity,
            claims,
            estimatedProfit: (hasClaimed ? effectiveClaimedAmount : netPayout) - investedTotal,
            estimatedLoss: winningStake > 0 ? 0 : losingStake,
          }
        }).filter((row): row is NonNullable<typeof row> => row !== null)

        if (userEvents.length === 0) return null

        const latestTxTimestamp = userEvents.reduce((max, row) => {
          if (!row) return max
          const txMax = row.txs.reduce((innerMax, tx) => {
            const ms = Date.parse(tx.created_at)
            return Number.isFinite(ms) ? Math.max(innerMax, ms) : innerMax
          }, 0)
          const claimMax = row.claims.reduce((innerMax, claim) => {
            const ms = claim.claimedAt ? Date.parse(claim.claimedAt) : Number.NaN
            return Number.isFinite(ms) ? Math.max(innerMax, ms) : innerMax
          }, 0)
          return Math.max(max, txMax, claimMax)
        }, 0)

        const marketInvested = userEvents.reduce((sum, row) => sum + row.investedTotal, 0)
        const marketClaimable = userEvents.reduce((sum, row) => sum + (row.canClaim ? row.netPayout : 0), 0)
        const marketClaimed = userEvents.reduce((sum, row) => sum + row.claimedAmount, 0)
        const marketProfit = userEvents.reduce((sum, row) => sum + row.estimatedProfit, 0)
        const marketLoss = userEvents.reduce((sum, row) => sum + row.estimatedLoss, 0)
        const liveYesPool = market.events.reduce((sum, eventItem) => sum + (parseFloat(eventItem.yesPool) || 0), 0)
        const liveNoPool = market.events.reduce((sum, eventItem) => sum + (parseFloat(eventItem.noPool) || 0), 0)
        const liveTotalPool = liveYesPool + liveNoPool
        const liveYesPct = liveTotalPool > 0 ? Math.round((liveYesPool / liveTotalPool) * 100) : 50
        const liveNoPct = liveTotalPool > 0 ? Math.round((liveNoPool / liveTotalPool) * 100) : 50

        return {
          id,
          market,
          pred,
          events: userEvents,
          marketInvested,
          marketClaimable,
          marketClaimed,
          marketProfit,
          marketLoss,
          liveYesPct,
          liveNoPct,
          latestTxTimestamp,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => {
        if (!a || !b) return 0
        if (b.latestTxTimestamp !== a.latestTxTimestamp) {
          return b.latestTxTimestamp - a.latestTxTimestamp
        }
        return b.id - a.id
      })
  }, [activityByMarket, claimsByEvent, getEventUserPrediction, markets, userPredictions])

  const portfolioTotalInvested = portfolioMarkets.reduce((sum, market) => sum + (market?.marketInvested ?? 0), 0)

  const resolvedCount = portfolioMarkets.filter((m) => m?.events.some((e) => e.event.resolved)).length
  const wins = portfolioMarkets.reduce((sum, m) => sum + (m?.events.filter((e) => e.winningStake > 0 && e.event.resolved).length ?? 0), 0)
  const winRate = resolvedCount > 0 ? Math.round((wins / resolvedCount) * 100) : 0
  const totalClaimable = portfolioMarkets.reduce((sum, m) => sum + (m?.marketClaimable ?? 0), 0)
  const totalClaimed = portfolioMarkets.reduce((sum, m) => sum + (m?.marketClaimed ?? 0), 0)

  const activeMarket = activeMarketId === null
    ? null
    : (portfolioMarkets.find((m) => m?.id === activeMarketId) ?? null)

  const renderStatValue = (value: string | number) => (
    isPortfolioLoading ? <div className={styles.statValueSkeleton} /> : value
  )

  const renderPortfolioSkeleton = () => (
    <>
      <div className={styles.sectionLabel}>Your Markets</div>
      <div className={styles.posGrid}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={styles.posCard}>
            <div className={styles.rowSkeletonTop} />
            <div className={styles.lineSkeletonLg} />
            <div className={styles.lineSkeletonMd} />
            <div className={styles.posFooterSkeleton}>
              <div className={styles.lineSkeletonSm} />
              <div className={styles.lineSkeletonSm} />
              <div className={styles.buttonSkeleton} />
            </div>
          </div>
        ))}
      </div>
    </>
  )

  if (!account) {
    return (
      <div className={styles.page}>
        <div className={styles.connectPrompt}>
          <RiWallet3Line className={styles.promptIcon} />
          <h2 className={styles.promptTitle}>Connect Your Wallet</h2>
          <p className={styles.promptSub}>Connect to view your portfolio and track positions</p>
          <button className={styles.connectBtn} onClick={() => setShowWalletModal(true)}>
            Connect Wallet
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>

      {/* ── Header ──────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>My Portfolio</h1>
          <p className={styles.pageSub}>Your positions and performance on PredictFi</p>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────── */}
      <div className={styles.statsRow}>
        <div className={`${styles.statCard} ${styles.statCardWallet}`}>
          <RiWallet3Line className={styles.statIcon} style={{ color: '#00ff88' }} />
          <div className={styles.statNum}>{renderStatValue(portfolioTotalInvested.toFixed(4))}</div>
          <div className={styles.statLabel}>tBNB Invested</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardPositions}`}>
          <RiPieChartLine className={styles.statIcon} style={{ color: '#a855f7' }} />
          <div className={styles.statNum}>{renderStatValue(portfolioMarkets.length)}</div>
          <div className={styles.statLabel}>Total Positions</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardWins}`}>
          <RiTrophyLine className={styles.statIcon} style={{ color: '#f59e0b' }} />
          <div className={styles.statNum}>{renderStatValue(wins)}</div>
          <div className={styles.statLabel}>Wins</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardRate}`}>
          <RiBarChart2Line className={styles.statIcon} style={{ color: '#3b82f6' }} />
          <div className={styles.statNum}>{renderStatValue(`${winRate}%`)}</div>
          <div className={styles.statLabel}>Win Rate</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardClaimable}`}>
          <RiArrowUpSLine className={styles.statIcon} style={{ color: '#a855f7' }} />
          <div className={styles.statNum}>{renderStatValue(totalClaimable.toFixed(4))}</div>
          <div className={styles.statLabel}>Claimable tBNB</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardClaimed}`}>
          <RiCheckLine className={styles.statIcon} style={{ color: '#22c55e' }} />
          <div className={styles.statNum}>{renderStatValue(totalClaimed.toFixed(4))}</div>
          <div className={styles.statLabel}>Claimed tBNB</div>
        </div>
      </div>

      {/* ── Positions ───────────────────────────────────── */}
      {isPortfolioLoading ? (
        renderPortfolioSkeleton()
      ) : portfolioMarkets.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <h2 className={styles.emptyTitle}>No Positions Yet</h2>
          <p className={styles.emptySub}>Start trading on markets to build your portfolio</p>
          <Link href="/markets" className={styles.browseBtn}>Browse Markets →</Link>
        </div>
      ) : (
        <>
          <div className={styles.sectionLabel}>Your Markets ({portfolioMarkets.length})</div>
          <div className={styles.posGrid}>
            {portfolioMarkets.map((pos) => {
              if (!pos) return null
              const hasClaimable = pos.events.some((e) => e.canClaim)
              const hasClaimed = pos.events.some((e) => e.hasClaimed)
              const resolvedAll = pos.events.length > 0 && pos.events.every((e) => e.event.resolved)
              const wonAny = pos.events.some((e) => e.winningStake > 0 && e.event.resolved)
              const lostAll = resolvedAll && !wonAny
              return (
                <div
                  key={pos.id}
                  className={`${styles.posCard} ${hasClaimable ? styles.canClaim : ''} ${wonAny ? styles.wonCard : ''} ${lostAll ? styles.lostCard : ''}`}
                >
                  <div className={styles.posTop}>
                    <div className={styles.liveSplitBadge}>
                      <span className={styles.liveSplitYes}>YES {pos.liveYesPct}%</span>
                      <span className={styles.liveSplitNo}>NO {pos.liveNoPct}%</span>
                    </div>
                    <div className={styles.posStatus}>
                      {wonAny && hasClaimed && (
                        <span className={styles.wonBadge}><RiTrophyLine /> WON</span>
                      )}
                      {hasClaimed && (
                        <span className={styles.claimedBadge}><RiCheckLine /> Claimed</span>
                      )}
                      {lostAll && (
                        <span className={styles.lostBadge}><RiArrowDownSLine /> LOST</span>
                      )}
                      {!resolvedAll && (
                        <span className={styles.activeBadge}><span className={styles.liveDot} /> ACTIVE</span>
                      )}
                    </div>
                  </div>

                  <p className={styles.posQuestion}>{pos.market.question}</p>

                  <div className={styles.posFooter}>
                    <div className={styles.posAmount}>
                      <span className={styles.posAmountLabel}>Staked</span>
                      <span className={styles.posAmountVal}>{pos.marketInvested.toFixed(4)} tBNB</span>
                    </div>
                    <div className={styles.posPotential}>
                      <span className={styles.posAmountLabel}>Claimable</span>
                      <span className={styles.posAmountValGreen}>{pos.marketClaimable.toFixed(4)} tBNB</span>
                    </div>
                    {!hasClaimed && hasClaimable && (
                      <button
                        className={styles.claimBtn}
                        onClick={() => {
                          const firstClaimable = pos.events.find((row) => row.canClaim)
                          if (!firstClaimable) return
                          void claimWinnings(pos.id, firstClaimable.event.id)
                        }}
                      >
                        Claim Next
                      </button>
                    )}
                    {hasClaimed && (
                      <span className={`${styles.claimBtn} ${styles.claimBtnDisabled}`}>Claimed</span>
                    )}
                    <button className={styles.expandBtn} onClick={() => setActiveMarketId(pos.id)}>
                      Show Details <RiArrowRightSLine className={styles.expandIcon} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {activeMarket && (
            <div className={styles.modalOverlay} onClick={() => setActiveMarketId(null)}>
              <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <div>
                    <div className={styles.modalTitle}>Market #{activeMarket.id}</div>
                    <p className={styles.modalQuestion}>{activeMarket.market.question}</p>
                  </div>
                  <button className={styles.modalClose} onClick={() => setActiveMarketId(null)}>
                    Close
                  </button>
                </div>

                <div className={styles.detailsWrap}>
                  {activeMarket.events.map((eventRow) => (
                    <div key={eventRow.event.id} className={styles.eventCard}>
                      <div className={styles.eventHead}>
                        <strong>Event {eventRow.event.id}: {eventRow.event.name}</strong>
                        <span className={styles.eventState}>
                          {eventRow.event.resolved
                            ? eventRow.winningStake > 0
                              ? eventRow.hasClaimed ? 'Won and Claimed' : 'Won - Not Claimed Yet'
                              : 'Lost'
                            : 'Open'}
                        </span>
                      </div>

                      <div className={styles.eventGrid}>
                        <span>Invested YES: {eventRow.investedYes.toFixed(4)} tBNB</span>
                        <span>Invested NO: {eventRow.investedNo.toFixed(4)} tBNB</span>
                        <span>Total Invested: {eventRow.investedTotal.toFixed(4)} tBNB</span>
                        <span>First Trade: {formatDateTime(eventRow.firstAt)}</span>
                        <span>Last Trade: {formatDateTime(eventRow.lastAt)}</span>
                        <span>Winner Side Stake: {eventRow.winningStake.toFixed(4)} tBNB</span>
                      </div>

                      {eventRow.event.resolved && (
                        <div className={styles.eventBreakdown}>
                          <span>Losing Pool Share: {eventRow.userLosingShare.toFixed(4)} tBNB</span>
                          <span>Platform Fee ({PLATFORM_FEE_PCT}%): {eventRow.platformFee.toFixed(4)} tBNB</span>
                          <span>Gross Win: {eventRow.grossPayout.toFixed(4)} tBNB</span>
                          <span>Net Win: {eventRow.netPayout.toFixed(4)} tBNB</span>
                          <span>Claimable Now: {eventRow.canClaim ? eventRow.netPayout.toFixed(4) : '0.0000'} tBNB</span>
                          <span>Claimed Amount: {eventRow.claimedAmount.toFixed(4)} tBNB</span>
                          <span>Profit: {eventRow.estimatedProfit.toFixed(4)} tBNB</span>
                          <span>Loss: {eventRow.estimatedLoss.toFixed(4)} tBNB</span>
                        </div>
                      )}

                      {eventRow.txs.length > 0 && (
                        <div className={styles.txList}>
                          {eventRow.txs.map((tx) => (
                            <div key={tx.id} className={styles.txRow}>
                              <span>{tx.choice === 1 ? 'YES' : 'NO'} {parseFloat(tx.amount_eth).toFixed(4)} tBNB</span>
                              <span>{formatDateTime(tx.created_at)}</span>
                            </div>
                          ))}
                          {eventRow.claims.map((claim) => (
                            <div key={claim.txHash} className={styles.txRowClaim}>
                              <span>CLAIM +{parseFloat(claim.amount).toFixed(4)} tBNB</span>
                              <span>{formatDateTime(claim.claimedAt)} · {claim.txHash.slice(0, 8)}...{claim.txHash.slice(-6)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
