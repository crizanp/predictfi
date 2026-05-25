'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  RiWallet3Line,
  RiTrophyLine,
  RiBarChart2Line,
  RiPieChartLine,
  RiArrowUpSLine,
  RiArrowDownSLine,
  RiCheckLine,
} from 'react-icons/ri'
import { useWallet } from '../../context/WalletContext'
import { useMarkets } from '../../context/MarketsContext'
import styles from './page.module.css'

export default function PortfolioPage() {
  const { account, setShowWalletModal } = useWallet()
  const { markets, userPredictions, totalInvested, claimWinnings } = useMarkets()

  const positions = useMemo(() => {
    return Object.entries(userPredictions)
      .map(([idStr, pred]) => {
        const id = Number(idStr)
        const market = markets.find((m) => m.id === id)
        if (!market) return null
        const yesPool = parseFloat(market.yesPool) || 0
        const noPool  = parseFloat(market.noPool)  || 0
        const total   = yesPool + noPool
        const poolForSide = pred.choice === 1 ? yesPool : noPool
        const amount  = parseFloat(pred.amount) || 0
        const potentialReturn = poolForSide > 0 ? (amount / poolForSide) * total : 0
        const pnl = potentialReturn - amount

        const won  = market.resolved && market.result === pred.choice
        const lost = market.resolved && market.result !== pred.choice
        const canClaim = won && !pred.claimed

        return { market, pred, id, potentialReturn, pnl, won, lost, canClaim }
      })
      .filter(Boolean)
  }, [markets, userPredictions])

  const resolvedCount = positions.filter((p) => p?.market.resolved).length
  const wins  = positions.filter((p) => p?.won).length
  const losses = positions.filter((p) => p?.lost).length
  const winRate = resolvedCount > 0 ? Math.round((wins / resolvedCount) * 100) : 0

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
        <div className={styles.statCard}>
          <RiWallet3Line className={styles.statIcon} style={{ color: '#00ff88' }} />
          <div className={styles.statNum}>{totalInvested}</div>
          <div className={styles.statLabel}>tBNB Invested</div>
        </div>
        <div className={styles.statCard}>
          <RiPieChartLine className={styles.statIcon} style={{ color: '#a855f7' }} />
          <div className={styles.statNum}>{positions.length}</div>
          <div className={styles.statLabel}>Total Positions</div>
        </div>
        <div className={styles.statCard}>
          <RiTrophyLine className={styles.statIcon} style={{ color: '#f59e0b' }} />
          <div className={styles.statNum}>{wins}</div>
          <div className={styles.statLabel}>Wins</div>
        </div>
        <div className={styles.statCard}>
          <RiBarChart2Line className={styles.statIcon} style={{ color: '#3b82f6' }} />
          <div className={styles.statNum}>{winRate}%</div>
          <div className={styles.statLabel}>Win Rate</div>
        </div>
      </div>

      {/* ── Positions ───────────────────────────────────── */}
      {positions.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <h2 className={styles.emptyTitle}>No Positions Yet</h2>
          <p className={styles.emptySub}>Start trading on markets to build your portfolio</p>
          <Link href="/markets" className={styles.browseBtn}>Browse Markets →</Link>
        </div>
      ) : (
        <>
          <div className={styles.sectionLabel}>Your Positions ({positions.length})</div>
          <div className={styles.posGrid}>
            {positions.map((pos) => {
              if (!pos) return null
              const sideLabel = pos.pred.choice === 1 ? 'YES' : 'NO'
              return (
                <div
                  key={pos.id}
                  className={`${styles.posCard} ${pos.canClaim ? styles.canClaim : ''} ${pos.won ? styles.wonCard : ''} ${pos.lost ? styles.lostCard : ''}`}
                >
                  <div className={styles.posTop}>
                    <span className={`${styles.sideBadge} ${pos.pred.choice === 1 ? styles.sideYes : styles.sideNo}`}>
                      {sideLabel}
                    </span>
                    <div className={styles.posStatus}>
                      {pos.won && !pos.pred.claimed && (
                        <span className={styles.wonBadge}><RiTrophyLine /> WON</span>
                      )}
                      {pos.won && pos.pred.claimed && (
                        <span className={styles.claimedBadge}><RiCheckLine /> Claimed</span>
                      )}
                      {pos.lost && (
                        <span className={styles.lostBadge}><RiArrowDownSLine /> LOST</span>
                      )}
                      {!pos.market.resolved && (
                        <span className={styles.activeBadge}><span className={styles.liveDot} /> ACTIVE</span>
                      )}
                    </div>
                  </div>

                  <p className={styles.posQuestion}>{pos.market.question}</p>

                  <div className={styles.posFooter}>
                    <div className={styles.posAmount}>
                      <span className={styles.posAmountLabel}>Staked</span>
                      <span className={styles.posAmountVal}>{pos.pred.amount} tBNB</span>
                    </div>
                    {!pos.market.resolved && (
                      <div className={styles.posPotential}>
                        <span className={styles.posAmountLabel}>Potential</span>
                        <span className={styles.posAmountValGreen}>
                          <RiArrowUpSLine style={{ display: 'inline' }} />
                          {pos.potentialReturn.toFixed(4)} tBNB
                        </span>
                      </div>
                    )}
                    {pos.canClaim && (
                      <button
                        className={styles.claimBtn}
                        onClick={() => claimWinnings(pos.id)}
                      >
                        Claim Winnings
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
