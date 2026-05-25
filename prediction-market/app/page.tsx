'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMarkets } from '../context/MarketsContext'
import MarketCard from '../components/MarketCard'
import styles from './page.module.css'

export default function HomePage() {
  const { markets, isLoadingMarkets } = useMarkets()
  const [nowInSeconds, setNowInSeconds] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  const liveCount = useMemo(() =>
    markets.filter((m) => !m.resolved && (nowInSeconds <= 0 || m.endTime > nowInSeconds)).length,
    [markets, nowInSeconds]
  )

  const totalPoolTBNB = useMemo(() =>
    markets.reduce((sum, m) => sum + (parseFloat(m.totalPool) || 0), 0).toFixed(2),
    [markets]
  )

  // Top 6 by volume for homepage
  const top6 = useMemo(() =>
    [...markets].sort((a, b) => (parseFloat(b.totalPool) || 0) - (parseFloat(a.totalPool) || 0)).slice(0, 6),
    [markets]
  )

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

      {/* ── Trending Markets (top 6) ─────────────────────── */}
      <div className={styles.content}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>🔥 Trending Markets</h2>
            <p className={styles.sectionSub}>Highest volume markets right now</p>
          </div>
          <Link href="/markets" className={styles.viewAllBtn}>
            View All Markets →
          </Link>
        </div>

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
        ) : (
          <div className={styles.grid}>
            {top6.map((market) => (
              <MarketCard key={market.id} market={market} nowInSeconds={nowInSeconds} />
            ))}
          </div>
        )}

        {markets.length > 6 && (
          <div className={styles.viewAllWrap}>
            <Link href="/markets" className={styles.viewAllBig}>
              Explore all {markets.length} markets →
            </Link>
          </div>
        )}
      </div>

      {/* ── PRFI Token Section ──────────────────────────── */}
      <div className={styles.prfiSection}>

        {/* Header */}
        <div className={styles.prfiHeader}>
          <div className={styles.prfiBadge}>TOKEN</div>
          <h2 className={styles.prfiTitle}>
            <span className={styles.prfiGreen}>PRFI</span> Token
          </h2>
          <p className={styles.prfiTagline}>
            The utility token powering the PredictFi ecosystem
          </p>
        </div>

        {/* Use Cases Grid */}
        <div className={styles.useCasesGrid}>
          {[
            { icon: '💸', title: 'Fee Discounts', desc: 'Pay platform fees in PRFI and get up to 50% discount on trading fees' },
            { icon: '🏆', title: 'Staking Rewards', desc: 'Stake PRFI to earn a share of platform revenue and yield' },
            { icon: '🗳️', title: 'Governance', desc: 'Vote on new market proposals, fee structures, and protocol upgrades' },
            { icon: '⚡', title: 'Priority Access', desc: 'PRFI holders get early access to high-volume markets and new features' },
            { icon: '🎁', title: 'Airdrop Rewards', desc: 'Active predictors earn PRFI airdrops based on accuracy and volume' },
            { icon: '🔮', title: 'Premium Markets', desc: 'Unlock exclusive high-stakes markets only accessible with PRFI' },
          ].map((item) => (
            <div key={item.title} className={styles.useCase}>
              <div className={styles.useCaseIcon}>{item.icon}</div>
              <div className={styles.useCaseTitle}>{item.title}</div>
              <div className={styles.useCaseDesc}>{item.desc}</div>
            </div>
          ))}
        </div>

        {/* Tokenomics + Presale row */}
        <div className={styles.prfiRow}>

          {/* Tokenomics */}
          <div className={styles.tokenomicsCard}>
            <div className={styles.cardLabel}>TOKENOMICS</div>
            <div className={styles.totalSupply}>1,000,000,000 <span>PRFI</span></div>
            <div className={styles.allocationList}>
              {[
                { label: 'Public Sale', pct: 40, color: '#00ff88' },
                { label: 'Ecosystem & Rewards', pct: 20, color: '#3b82f6' },
                { label: 'Team (3yr vesting)', pct: 15, color: '#a855f7' },
                { label: 'Reserve', pct: 10, color: '#f59e0b' },
                { label: 'Advisors', pct: 10, color: '#06b6d4' },
                { label: 'Airdrop', pct: 5, color: '#ff3366' },
              ].map((row) => (
                <div key={row.label} className={styles.allocRow}>
                  <div className={styles.allocDot} style={{ background: row.color }} />
                  <span className={styles.allocLabel}>{row.label}</span>
                  <div className={styles.allocBarWrap}>
                    <div className={styles.allocBar} style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                  <span className={styles.allocPct}>{row.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Presale */}
          <div className={styles.presaleCard}>
            <div className={styles.cardLabel}>PRESALE</div>
            <div className={styles.presalePlatform}>
              <div className={styles.moonIcon}>🌙</div>
              <div>
                <div className={styles.presalePlatformName}>Launching on</div>
                <div className={styles.presalePlatformBig}>Moonsale</div>
              </div>
            </div>
            <div className={styles.presaleDivider} />
            <div className={styles.presaleDetails}>
              <div className={styles.presaleDetail}>
                <span className={styles.detailLabel}>SALE DATE</span>
                <span className={styles.detailValue}>TBA</span>
              </div>
              <div className={styles.presaleDetail}>
                <span className={styles.detailLabel}>TOTAL RAISE</span>
                <span className={styles.detailValue}>TBA</span>
              </div>
              <div className={styles.presaleDetail}>
                <span className={styles.detailLabel}>INITIAL PRICE</span>
                <span className={styles.detailValue}>TBA</span>
              </div>
              <div className={styles.presaleDetail}>
                <span className={styles.detailLabel}>VESTING</span>
                <span className={styles.detailValue}>TBA</span>
              </div>
            </div>
            <button className={styles.waitlistBtn}>
              🔔 &nbsp;Join the Waitlist
            </button>
            <p className={styles.waitlistSub}>Get notified when the sale goes live</p>
          </div>

        </div>
      </div>

      {/* ── Features bar ────────────────────────────────── */}
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