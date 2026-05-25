'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  RiFireLine,
  RiShieldCheckLine,
  RiTrophyLine,
  RiFlashlightLine,
  RiPercentLine,
  RiStackLine,
  RiGovernmentLine,
  RiVipCrownLine,
  RiGiftLine,
  RiDiamondLine,
  RiTwitterXLine,
  RiTelegramLine,
  RiDiscordLine,
  RiMailLine,
} from 'react-icons/ri'
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

  // Top 6 by volume for homepage
  const top6 = useMemo(() =>
    [...markets].sort((a, b) => (parseFloat(b.totalPool) || 0) - (parseFloat(a.totalPool) || 0)).slice(0, 6),
    [markets]
  )

  return (
    <main className={styles.main}>

      {/* ── Hero ────────────────────────────────────────── */}
     

      {/* ── Homepage Banner (1680 × 238) ────────────────── */}
      <div className={styles.heroBannerWrap}>
        <div className={styles.heroBanner}>
          {/* Drop your 1680×238 image into /public/banner.png to replace this placeholder */}
          <img
            src="/banner-placeholder.png"
            alt="PredictFi Banner"
            className={styles.heroBannerImg}
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).src = '/banner-placeholder.svg'
            }}
          />
        </div>
      </div>

      {/* ── Trending Markets (top 6) ─────────────────────── */}
      <div className={styles.content}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}><RiFireLine style={{verticalAlign:'middle', marginRight:6}} />Trending Markets</h2>
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
      <div id="prfi" className={styles.prfiSection}>

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
            { Icon: RiPercentLine,   color: '#c084fc', title: 'Fee Discounts',    desc: 'Pay platform fees in PRFI and get up to 50% discount on trading fees' },
            { Icon: RiStackLine,     color: '#a855f7', title: 'Staking Rewards',  desc: 'Stake PRFI to earn a share of platform revenue and yield' },
            { Icon: RiGovernmentLine,color: '#3b82f6', title: 'Governance',       desc: 'Vote on new market proposals, fee structures, and protocol upgrades' },
            { Icon: RiVipCrownLine,  color: '#f59e0b', title: 'Priority Access',  desc: 'PRFI holders get early access to high-volume markets and new features' },
            { Icon: RiGiftLine,      color: '#06b6d4', title: 'Airdrop Rewards',  desc: 'Active predictors earn PRFI airdrops based on accuracy and volume' },
            { Icon: RiDiamondLine,   color: '#ff3366', title: 'Premium Markets',  desc: 'Unlock exclusive high-stakes markets only accessible with PRFI' },
          ].map((item) => (
            <div key={item.title} className={styles.useCase}>
              <item.Icon className={styles.useCaseIcon} style={{ color: item.color }} />
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
            <div className={styles.supplySubtitle}>Fixed supply · No inflation · Deflationary buybacks</div>

            {/* SVG Donut chart */}
            <div className={styles.donutWrap}>
              <svg viewBox="0 0 160 160" className={styles.donut}>
                {(() => {
                  const slices = [
                    { label: 'Public Sale', pct: 40, color: '#c084fc' },
                    { label: 'Ecosystem', pct: 20, color: '#3b82f6' },
                    { label: 'Team', pct: 15, color: '#a855f7' },
                    { label: 'Reserve', pct: 10, color: '#f59e0b' },
                    { label: 'Advisors', pct: 10, color: '#06b6d4' },
                    { label: 'Airdrop', pct: 5, color: '#ff3366' },
                  ]
                  const cx = 80, cy = 80, r = 62, inner = 40
                  let cumAngle = -Math.PI / 2
                  return slices.map((s) => {
                    const angle = (s.pct / 100) * 2 * Math.PI
                    const x1 = cx + r * Math.cos(cumAngle)
                    const y1 = cy + r * Math.sin(cumAngle)
                    const ix1 = cx + inner * Math.cos(cumAngle)
                    const iy1 = cy + inner * Math.sin(cumAngle)
                    cumAngle += angle
                    const x2 = cx + r * Math.cos(cumAngle)
                    const y2 = cy + r * Math.sin(cumAngle)
                    const ix2 = cx + inner * Math.cos(cumAngle)
                    const iy2 = cy + inner * Math.sin(cumAngle)
                    const large = angle > Math.PI ? 1 : 0
                    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1} Z`
                    return <path key={s.label} d={d} fill={s.color} opacity="0.85" stroke="#0a0d14" strokeWidth="1.5" />
                  })
                })()}
                <text x="80" y="76" textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="700">TOTAL</text>
                <text x="80" y="90" textAnchor="middle" fontSize="8" fill="#9ca3af" fontWeight="600">1B PRFI</text>
              </svg>
            </div>

            <div className={styles.allocationList}>
              {[
                { label: 'Public Sale', pct: 40, color: '#c084fc' },
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
                <a href="https://moonsale.app" target="_blank" rel="noopener noreferrer" className={styles.presalePlatformBig}>moonsale.app</a>
              </div>
            </div>
            <div className={styles.presaleDivider} />
            <div className={styles.presaleDetails}>
              <div className={styles.presaleDetail}>
                <span className={styles.detailLabel}>SALE DATE</span>
                <span className={styles.detailValue}>Jun 1 – Jun 7</span>
              </div>
              <div className={styles.presaleDetail}>
                <span className={styles.detailLabel}>TOTAL RAISE</span>
                <span className={styles.detailValue}>150 BNB</span>
              </div>
              <div className={styles.presaleDetail}>
                <span className={styles.detailLabel}>INITIAL PRICE</span>
                <span className={styles.detailValue}>0.00015 BNB</span>
              </div>
              <div className={styles.presaleDetail}>
                <span className={styles.detailLabel}>VESTING</span>
                <span className={styles.detailValue}>25% TGE · 3mo linear</span>
              </div>
            </div>

            {/* Fundraising progress */}
            <div className={styles.presaleProgressWrap}>
              <div className={styles.presaleProgressLabel}>
                <span>0 BNB raised</span>
                <span>Goal: 150 BNB</span>
              </div>
              <div className={styles.presaleProgressBar}>
                <div className={styles.presaleProgressFill} style={{ width: '2%' }} />
              </div>
              <div className={styles.presaleProgressSub}>
                <span>Opens Jun 1</span>
                <span>0% filled</span>
              </div>
            </div>

            <a href="https://moonsale.app" target="_blank" rel="noopener noreferrer" className={styles.waitlistBtn}>
              <RiMailLine style={{verticalAlign:'middle',marginRight:6}} />Join the Waitlist
            </a>
            <p className={styles.waitlistSub}>Get notified when the sale goes live</p>
          </div>

        </div>
      </div>

      {/* ── Whitepaper Section ──────────────────────────── */}
      <div id="whitepaper" className={styles.whitepaperSection}>
        <div className={styles.whitepaperLeft}>
          <div className={styles.whitepaperBadge}>WHITEPAPER</div>
          <h2 className={styles.whitepaperTitle}>Understand the Protocol</h2>
          <p className={styles.whitepaperDesc}>
            Dive deep into the PredictFi architecture — automated market makers, oracle integrations, 
            PRFI tokenomics, and governance mechanisms. Everything you need to know about how the 
            decentralized prediction market engine works.
          </p>
          <div className={styles.whitepaperActions}>
            <a href="#whitepaper" className={styles.readBtn}><RiFlashlightLine style={{verticalAlign:'middle',marginRight:6}} />Read Whitepaper</a>
            <a href="#whitepaper" className={styles.downloadBtn}>Download PDF</a>
          </div>
        </div>
        <div className={styles.whitepaperRight}>
          {[
            { num: '01', title: 'Protocol Overview',    desc: 'Architecture and smart contract design' },
            { num: '02', title: 'Market Mechanics',     desc: 'AMM model, liquidity, and price discovery' },
            { num: '03', title: 'PRFI Token',           desc: 'Utility, tokenomics, and distribution' },
            { num: '04', title: 'Governance',           desc: 'On-chain voting and protocol upgrades' },
          ].map((ch) => (
            <div key={ch.num} className={styles.chapterCard}>
              <div className={styles.chapterNum}>{ch.num}</div>
              <div>
                <div className={styles.chapterTitle}>{ch.title}</div>
                <div className={styles.chapterDesc}>{ch.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Social / Community Section ───────────────────── */}
      <div id="social" className={styles.socialSection}>
        <div className={styles.socialHeader}>
          <h2 className={styles.socialTitle}>Join the Community</h2>
          <p className={styles.socialSub}>Stay updated, get alpha, and connect with other predictors</p>
        </div>
        <div className={styles.socialGrid}>
          {[
            { Icon: RiTwitterXLine, label: 'Twitter/X',   handle: '@PredictFi',     color: '#e8eaf0', bg: '#111111', href: 'https://x.com/PredictFi' },
            { Icon: RiTelegramLine, label: 'Telegram',    handle: 't.me/predictfi', color: '#229ED9', bg: '#0a1828', href: 'https://t.me/predictfi' },
            { Icon: RiDiscordLine,  label: 'Discord',     handle: 'discord.gg/predictfi', color: '#5865F2', bg: '#0a0c1e', href: 'https://discord.gg/predictfi' },
          ].map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className={styles.socialCard} style={{ borderColor: `${s.color}18` }}>
              <s.Icon className={styles.socialIcon} style={{ color: s.color }} />
              <div className={styles.socialLabel}>{s.label}</div>
              <div className={styles.socialHandle} style={{ color: s.color }}>{s.handle}</div>
            </a>
          ))}
        </div>
      </div>

    </main>
  )
}