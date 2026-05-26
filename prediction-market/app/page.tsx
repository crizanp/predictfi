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

type UseCase = typeof tokenUseCases[number]

const tokenUseCases = [
  {
    Icon: RiPercentLine,
    color: '#c084fc',
    title: 'Fee Discounts',
    desc: 'Pay platform fees in PRFI and unlock up to 50% discount on trading costs.',
  },
  {
    Icon: RiStackLine,
    color: '#a855f7',
    title: 'Staking Rewards',
    desc: 'Stake PRFI to earn a portion of protocol fees and long-term yield incentives.',
  },
  {
    Icon: RiGovernmentLine,
    color: '#3b82f6',
    title: 'Governance',
    desc: 'Vote on proposals, market listings, and key protocol upgrade decisions.',
  },
  {
    Icon: RiVipCrownLine,
    color: '#f59e0b',
    title: 'Priority Access',
    desc: 'PRFI holders get early entry into high-volume markets and new launches.',
  },
  {
    Icon: RiGiftLine,
    color: '#06b6d4',
    title: 'Airdrop Rewards',
    desc: 'Top predictors receive campaign airdrops based on performance and activity.',
  },
  {
    Icon: RiDiamondLine,
    color: '#ff3366',
    title: 'Premium Markets',
    desc: 'Unlock exclusive high-stakes market rooms available to PRFI participants.',
  },
]

const tokenAllocations = [
  {
    label: 'Public Sale',
    pct: 40,
    color: '#c084fc',
    desc: 'Community distribution',
    why: 'A large public allocation creates broad ownership from day one and builds trust through transparent access.',
    plan: 'Release across presale and listing phases, with strict caps per wallet to reduce concentration risk.',
  },
  {
    label: 'Ecosystem & Rewards',
    pct: 20,
    color: '#3b82f6',
    desc: 'Liquidity and incentives',
    why: 'Protocol growth requires active market makers, referral incentives, and liquidity support for new markets.',
    plan: 'Stream rewards by season, tied to measurable activity like volume, retention, and market quality.',
  },
  {
    label: 'Team (3yr vesting)',
    pct: 15,
    color: '#a855f7',
    desc: 'Long-term alignment',
    why: 'Team allocation is designed to align contributors with long-term execution instead of short-term price moves.',
    plan: 'Use a cliff plus linear vesting schedule, with milestone-linked unlock policies and full wallet transparency.',
  },
  {
    label: 'Reserve',
    pct: 10,
    color: '#f59e0b',
    desc: 'Strategic treasury',
    why: 'A reserve fund gives the protocol flexibility to respond to market volatility, security events, and partnerships.',
    plan: 'Deploy only through governance-approved proposals with published rationale and post-execution reporting.',
  },
  {
    label: 'Advisors',
    pct: 10,
    color: '#06b6d4',
    desc: 'Expert execution support',
    why: 'Specialist advisors help on token design, legal frameworks, security review, and go-to-market quality.',
    plan: 'Unlock in milestone buckets tied to delivered outcomes such as audits, listings, and ecosystem integrations.',
  },
  {
    label: 'Airdrop',
    pct: 5,
    color: '#ff3366',
    desc: 'User growth engine',
    why: 'Airdrops attract early users, reward accurate predictors, and strengthen social distribution before mainnet scale.',
    plan: 'Distribute in campaign waves with anti-sybil filtering and public eligibility criteria.',
  },
]

const DOC_LINKS = [
  { label: 'Whitepaper', href: '#' },
  { label: 'Pitchdeck', href: '#' },
  { label: 'Download PDF Outline', href: '#' },
  { label: 'Audit', href: '#' },
  { label: 'Roadmap', href: '#' },
]

export default function HomePage() {
  const { markets, isLoadingMarkets, hasLoadedMarkets } = useMarkets()
  const [nowInSeconds, setNowInSeconds] = useState(() => Math.floor(Date.now() / 1000))
  const [activeAllocation, setActiveAllocation] = useState(tokenAllocations[0].label)
  const [isTokenomicsModalOpen, setIsTokenomicsModalOpen] = useState(false)
  const [activeUseCase, setActiveUseCase] = useState<UseCase | null>(null)

  useEffect(() => {
    const interval = setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const isOpen = isTokenomicsModalOpen || activeUseCase !== null
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTokenomicsModalOpen(false)
        setActiveUseCase(null)
      }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isTokenomicsModalOpen, activeUseCase])

  // Top 6 – latest first
  const top6 = useMemo(() =>
    [...markets].sort((a, b) => b.id - a.id).slice(0, 6),
    [markets]
  )

  const selectedAllocation = useMemo(() =>
    tokenAllocations.find((allocation) => allocation.label === activeAllocation) ?? tokenAllocations[0],
    [activeAllocation]
  )

  const donutSlices = useMemo(() => {
    const cx = 80
    const cy = 80
    const outerRadius = 62
    const innerRadius = 40
    const format = (value: number) => value.toFixed(4)

    return tokenAllocations.map((slice, index) => {
      const angle = (slice.pct / 100) * 2 * Math.PI
      const startAngle = tokenAllocations
        .slice(0, index)
        .reduce((accumulator, allocation) => accumulator + (allocation.pct / 100) * 2 * Math.PI, -Math.PI / 2)
      const endAngle = startAngle + angle

      const x1 = cx + outerRadius * Math.cos(startAngle)
      const y1 = cy + outerRadius * Math.sin(startAngle)
      const ix1 = cx + innerRadius * Math.cos(startAngle)
      const iy1 = cy + innerRadius * Math.sin(startAngle)

      const x2 = cx + outerRadius * Math.cos(endAngle)
      const y2 = cy + outerRadius * Math.sin(endAngle)
      const ix2 = cx + innerRadius * Math.cos(endAngle)
      const iy2 = cy + innerRadius * Math.sin(endAngle)

      const largeArcFlag = angle > Math.PI ? 1 : 0
      const d =
        `M ${format(x1)} ${format(y1)} ` +
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${format(x2)} ${format(y2)} ` +
        `L ${format(ix2)} ${format(iy2)} ` +
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${format(ix1)} ${format(iy1)} Z`

      return {
        ...slice,
        d,
      }
    })
  }, [])

  const openTokenomicsModal = (label: string) => {
    setActiveAllocation(label)
    setIsTokenomicsModalOpen(true)
  }

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
          </div>
          <Link href="/markets" className={styles.viewAllBtn}>
            View All Markets →
          </Link>
        </div>

        {!hasLoadedMarkets || isLoadingMarkets ? (
          <div className={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.skeletonCard}>
                <div className={styles.skeletonContent}>
                  <div className={`${styles.skeletonLine} ${styles.skeletonBadge}`} />
                  <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
                  <div className={`${styles.skeletonLine} ${styles.skeletonTitleShort}`} />
                  <div className={`${styles.skeletonLine} ${styles.skeletonOdds}`} />
                  <div className={styles.skeletonBar} />
                </div>
                <div className={styles.skeletonThumb} />
              </div>
            ))}
          </div>
        ) : markets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔮</div>
            <h2>No Markets Yet</h2>
            <p>Connect as the owner to create prediction markets via the Admin Portal.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {top6.map((market, index) => (
              <MarketCard key={market.id} market={market} nowInSeconds={nowInSeconds} isTrending={index < 3} />
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
          <h2 className={styles.prfiTitle}>
            <span className={styles.prfiGreen}>PRFI</span> Token
          </h2>
          <p className={styles.prfiTagline}>
            The utility token powering the PredictFi ecosystem
          </p>
          <div className={styles.prfiTrustRow}>
            <div className={styles.prfiTrustItem}>
              <RiShieldCheckLine />
              <span>Transparent Emissions</span>
            </div>
            <div className={styles.prfiTrustItem}>
              <RiTrophyLine />
              <span>Incentives For Accuracy</span>
            </div>
            <div className={styles.prfiTrustItem}>
              <RiGovernmentLine />
              <span>Community Governance Path</span>
            </div>
          </div>
        </div>

        {/* Use Cases Grid */}
        <div className={styles.useCasesGrid}>
          {tokenUseCases.map((item) => (
            <button
              key={item.title}
              type="button"
              className={styles.useCase}
              onClick={() => setActiveUseCase(item)}
            >
              <item.Icon className={styles.useCaseIcon} style={{ color: item.color }} />
              <div className={styles.useCaseTitle}>{item.title}</div>
              <div className={styles.useCaseDesc}>{item.desc}</div>
            </button>
          ))}
        </div>
        </div>  {/* Tokenomics + Presale row */}
        <div className={styles.prfiRow}>

          {/* Tokenomics */}
          <div className={styles.tokenomicsCard}>
            <div className={styles.cardLabel}>TOKENOMICS</div>
            <div className={styles.totalSupply}>1,000,000,000 <span>PRFI</span></div>

            {/* SVG Donut chart */}
            <div className={styles.donutWrap}>
              <svg viewBox="0 0 160 160" className={styles.donut}>
                {donutSlices.map((slice) => (
                  <g
                    key={slice.label}
                    className={`${styles.donutSlice} ${activeAllocation === slice.label ? styles.donutSliceActive : ''}`}
                    onClick={() => openTokenomicsModal(slice.label)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openTokenomicsModal(slice.label)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${slice.label} allocation`}
                    aria-pressed={activeAllocation === slice.label}
                  >
                    <path d={slice.d} fill={slice.color} opacity="0.9" stroke="#05060e" strokeWidth="1.5" />
                  </g>
                ))}
                <text x="80" y="76" textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="700">TOTAL</text>
                <text x="80" y="90" textAnchor="middle" fontSize="8" fill="#9ca3af" fontWeight="600">1B PRFI</text>
              </svg>
            </div>

            <div className={styles.allocationList}>
              {tokenAllocations.map((row) => (
                <button
                  type="button"
                  key={row.label}
                  className={`${styles.allocRow} ${activeAllocation === row.label ? styles.allocRowActive : ''}`}
                  onClick={() => openTokenomicsModal(row.label)}
                >
                  <div className={styles.allocDot} style={{ background: row.color }} />
                  <div className={styles.allocLabelWrap}>
                    <span className={styles.allocLabel}>{row.label}</span>
                    <span className={styles.allocHint}>{row.desc}</span>
                  </div>
                  <div className={styles.allocBarWrap}>
                    <div className={styles.allocBar} style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                  <span className={styles.allocPct}>{row.pct}%</span>
                </button>
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

            <div className={styles.presalePurpose}>
              <div className={styles.presalePurposeLabel}>Why this presale exists</div>
              <p>
                The presale is designed to bootstrap fair liquidity, fund launch operations, and ensure long-term runway
                before full governance decentralization.
              </p>
            </div>

            <div className={styles.presaleRoadmap}>
              {[
                'Phase 1: Community onboarding and whitelist validation',
                'Phase 2: Liquidity deployment and token claim opening',
                'Phase 3: Governance activation and rewards kickoff',
              ].map((step) => (
                <div key={step} className={styles.presaleRoadmapItem}>
                  <span className={styles.presaleRoadmapDot} />
                  <span>{step}</span>
                </div>
              ))}
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

      {isTokenomicsModalOpen && (
        <div className={styles.tokenomicsModalOverlay} onClick={() => setIsTokenomicsModalOpen(false)}>
          <div
            className={styles.tokenomicsModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tokenomics-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.tokenomicsModalClose}
              onClick={() => setIsTokenomicsModalOpen(false)}
              aria-label="Close tokenomics modal"
            >
              ✕ Close
            </button>

            <div className={styles.tokenomicsModalHead}>
              <div className={styles.tokenomicsModalBadge}>TOKENOMICS DETAIL</div>
              <h3 id="tokenomics-modal-title" className={styles.tokenomicsModalTitle}>
                {selectedAllocation.label} <span>{selectedAllocation.pct}%</span>
              </h3>
              <p className={styles.tokenomicsModalSubtitle}>{selectedAllocation.desc}</p>
            </div>

            <div className={styles.tokenomicsModalGrid}>
              <div className={styles.tokenomicsModalCard}>
                <div className={styles.tokenomicsModalCardLabel}>Why it exists</div>
                <p>{selectedAllocation.why}</p>
              </div>
              <div className={styles.tokenomicsModalCard}>
                <div className={styles.tokenomicsModalCardLabel}>Execution plan</div>
                <p>{selectedAllocation.plan}</p>
              </div>
            </div>
          </div>
        </div>
      )}


      

      {activeUseCase && (
        <div className={styles.tokenomicsModalOverlay} onClick={() => setActiveUseCase(null)}>
          <div
            className={styles.tokenomicsModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="usecase-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.tokenomicsModalClose}
              onClick={() => setActiveUseCase(null)}
              aria-label="Close use case modal"
            >
              ✕ Close
            </button>
            <div className={styles.tokenomicsModalHead}>
              <div className={styles.tokenomicsModalBadge} style={{ background: `${activeUseCase.color}18`, borderColor: `${activeUseCase.color}44`, color: activeUseCase.color }}>PRFI UTILITY</div>
              <h3 id="usecase-modal-title" className={styles.tokenomicsModalTitle}>
                {activeUseCase.title}
              </h3>
              <p className={styles.tokenomicsModalSubtitle}>{activeUseCase.desc}</p>
            </div>
            <div className={styles.tokenomicsModalGrid}>
              <div className={styles.tokenomicsModalCard} style={{ gridColumn: '1 / -1' }}>
                <div className={styles.tokenomicsModalCardLabel}>What this means for holders</div>
                <p>{activeUseCase.desc}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Whitepaper Section ──────────────────────────── */}
      <div id="whitepaper" className={styles.whitepaperSection}>
        <h2 className={styles.whitepaperTitle}>Understand the Protocol</h2>
        <p className={styles.whitepaperDesc}>
          Dive deep into the PredictFi architecture — automated market makers, oracle integrations,
          PRFI tokenomics, and governance mechanisms. Everything you need to know about how the
          decentralized prediction market engine works.
        </p>
        <div className={styles.docLinks}>
          {DOC_LINKS.map((doc) => (
            <a key={doc.label} href={doc.href} className={styles.docLink}>
              {doc.label}
            </a>
          ))}
        </div>
      </div>

      {/* ── Social / Community Section ───────────────────── */}
      <div id="social" className={styles.socialSection}>
        <span className={styles.cornerTL} aria-hidden />
        <span className={styles.cornerTR} aria-hidden />
        <span className={styles.cornerBL} aria-hidden />
        <span className={styles.cornerBR} aria-hidden />
        <div className={styles.socialHeader}>
          <h2 className={styles.socialTitle}>Join the Community</h2>
          <p className={styles.socialSub}>Stay updated, get alpha, and connect with other predictors</p>
        </div>
        <div className={styles.socialGrid}>
          {[
            { Icon: RiTwitterXLine, label: 'Twitter/X',   handle: '@PredictFi',     color: '#0f172a', bg: '#111111', href: 'https://x.com/PredictFi' },
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