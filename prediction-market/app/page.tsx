'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMarkets } from '../context/MarketsContext'
import { getMarketCategory } from '../lib/utils'
import MarketCard from '../components/MarketCard'
import CategoryBar from '../components/CategoryBar'
import styles from './page.module.css'

export default function HomePage() {
  const { markets, isLoadingMarkets, totalInvested } = useMarkets()
  const [nowInSeconds, setNowInSeconds] = useState(0)
  const [activeCategory, setActiveCategory] = useState('Trending')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const interval = setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  const liveCount = useMemo(() =>
    markets.filter((m) => !m.resolved && (nowInSeconds <= 0 || m.endTime > nowInSeconds)).length,
    [markets, nowInSeconds]
  )

  const totalPoolTBNB = useMemo(() => {
    if (typeof totalInvested === 'bigint') {
      return (Number(totalInvested) / 1e18).toFixed(2)
    }
    return '0.00'
  }, [totalInvested])

  const newestId = useMemo(() =>
    markets.length > 0 ? Math.max(...markets.map((m) => m.id)) : 0,
    [markets]
  )

  const visibleMarkets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return markets.filter((market) => {
      const category = getMarketCategory(market.id, market.question)
      const categoryMatch =
        activeCategory === 'Trending' ? true
        : activeCategory === 'New' ? market.id >= newestId - 5
        : category === activeCategory
      const searchMatch = !q || market.question.toLowerCase().includes(q)
      return categoryMatch && searchMatch
    })
  }, [activeCategory, markets, newestId, searchQuery])

  return (
    <main className={styles.main}>

      {/* ── Stats bar ───────────────────────────────────── */}
      <div className={styles.statsBar}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>MARKETS</span>
          <span className={styles.statBig}>{markets.length}</span>
          <span className={styles.statSub}>Active markets</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statLabel}>LIVE NOW</span>
          <span className={styles.statBig}>{liveCount}</span>
          <span className={styles.statSub}>Happening now</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statLabel}>TOTAL VOLUME</span>
          <span className={styles.statBig}>{totalPoolTBNB} <span className={styles.statUnit}>tBNB</span></span>
          <span className={styles.statSub}>All-time volume</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statLabel}>NETWORK</span>
          <span className={styles.statBig}>BSC Testnet</span>
          <span className={styles.statSub}>Testnet environment</span>
        </div>
        <div className={styles.sparklineWrap} aria-hidden>
          <svg viewBox="0 0 200 60" className={styles.sparkline} preserveAspectRatio="none">
            <polyline points="0,50 20,42 40,46 60,28 80,34 100,20 120,26 140,14 160,18 180,10 200,14" fill="none" stroke="#00ff88" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────── */}
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Predict.{' '}
          <span className={styles.heroAccent}>Win Big.</span>
        </h1>
        <p className={styles.heroSub}>
          Decentralized prediction markets on BSC · Bet on outcomes, earn on the truth
        </p>
      </div>

      {/* ── Market grid ─────────────────────────────────── */}
      <div className={styles.content}>
        <CategoryBar
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          liveCount={liveCount}
        />

        {isLoadingMarkets ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading markets from BSC Testnet...</p>
          </div>
        ) : markets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔮</div>
            <h2>No Markets Yet</h2>
            <p>Connect as the owner to create prediction markets via the Admin Portal.</p>
          </div>
        ) : visibleMarkets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔍</div>
            <h2>No Markets Found</h2>
            <p>No markets match this filter. Try a different category or search.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleMarkets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                nowInSeconds={nowInSeconds}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Features ────────────────────────────────────── */}
      <div className={styles.features}>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <div>
            <div className={styles.featureTitle}>Fair &amp; Transparent</div>
            <div className={styles.featureSub}>Outcomes verified on-chain<br/>No central authority</div>
          </div>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15c-2.21 0-4-1.79-4-4V5h8v6c0 2.21-1.79 4-4 4z"/><path d="M8.5 21h7M12 15v6M7 5H5v2M17 5h2v2"/>
            </svg>
          </div>
          <div>
            <div className={styles.featureTitle}>Win Rewards</div>
            <div className={styles.featureSub}>Correct predictions earn<br/>tBNB rewards</div>
          </div>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
            <div className={styles.featureTitle}>Instant Settlement</div>
            <div className={styles.featureSub}>Fast payouts after<br/>market resolution</div>
          </div>
        </div>
      </div>
    </main>
  )
}