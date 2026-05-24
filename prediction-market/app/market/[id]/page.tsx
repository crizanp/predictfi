'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMarkets } from '../../../context/MarketsContext'
import { getMarketCategory, formatTimeLeft, resultLabel } from '../../../lib/utils'
import { getMarketMeta, type MarketMeta } from '../../../lib/supabase'
import TradePanel from '../../../components/TradePanel'
import OddsChart from '../../../components/OddsChart'
import styles from './page.module.css'

const CATEGORY_COLORS: Record<string, string> = {
  Sports: '#3b82f6',
  Crypto: '#8b5cf6',
  Politics: '#f59e0b',
  Esports: '#ec4899',
  Finance: '#06b6d4',
  Economy: '#14b8a6',
  Culture: '#f97316',
  Trending: '#8b5cf6',
  New: '#a78bfa',
}

export default function MarketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { fetchMarket } = useMarkets()

  const [market, setMarket] = useState<Awaited<ReturnType<typeof fetchMarket>>>(null)
  const [loading, setLoading] = useState(true)
  const [nowInSeconds, setNowInSeconds] = useState(Math.floor(Date.now() / 1000))
  const [meta, setMeta] = useState<MarketMeta | null>(null)

  const marketId = Number(params?.id)

  useEffect(() => {
    if (!marketId || Number.isNaN(marketId)) {
      router.replace('/')
      return
    }
    setLoading(true)
    fetchMarket(marketId).then((m) => {
      setMarket(m)
      setLoading(false)
    })
    getMarketMeta(marketId).then(setMeta)
  }, [fetchMarket, marketId, router])

  useEffect(() => {
    const interval = setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  const category = useMemo(() => market ? getMarketCategory(market.id, market.question) : '', [market])
  const timeLeft = useMemo(() => market ? formatTimeLeft(market.endTime, nowInSeconds) : '', [market, nowInSeconds])
  const isEnded = market ? nowInSeconds > 0 && market.endTime <= nowInSeconds : false
  const catColor = CATEGORY_COLORS[category] ?? '#8b5cf6'

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
        <p>Loading market...</p>
      </div>
    )
  }

  if (!market) {
    return (
      <div className={styles.notFound}>
        <span className={styles.notFoundIcon}>🔍</span>
        <h1>Market Not Found</h1>
        <p>This market doesn&apos;t exist or couldn&apos;t be loaded.</p>
        <Link href="/" className={styles.backLink}>← Back to Markets</Link>
      </div>
    )
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Link href="/" className={styles.back}>← All Markets</Link>

        {/* Hero image */}
        {meta?.image_url && (
          <div className={styles.heroImage}>
            <img src={meta.image_url} alt={market.question} />
          </div>
        )}

        <div className={styles.header}>
          <div className={styles.badges}>
            <span className={styles.catBadge} style={{ color: catColor, borderColor: `${catColor}44`, background: `${catColor}18` }}>
              {category}
            </span>
            {market.resolved ? (
              <span className={styles.badgeResolved}>
                Resolved: {resultLabel(market.result)}
              </span>
            ) : isEnded ? (
              <span className={styles.badgeEnded}>Ended · Awaiting Resolution</span>
            ) : (
              <span className={styles.badgeLive}>
                <span className={styles.liveDot} />
                Live
              </span>
            )}
          </div>

          <h1 className={styles.question}>{market.question}</h1>

          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Market ID</span>
              <span className={styles.metaValue}>#{market.id}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{isEnded ? 'Ended' : 'Closes in'}</span>
              <span className={styles.metaValue}>{timeLeft}</span>
            </div>
          </div>
        </div>

        <div className={styles.body}>
          <TradePanel market={market} nowInSeconds={nowInSeconds} />

          <OddsChart
            marketId={market.id}
            yesPool={market.yesPool}
            noPool={market.noPool}
            totalPool={market.totalPool}
            resolved={market.resolved}
          />

          {/* Description */}
          {meta?.description && (
            <div className={styles.infoSection}>
              <h3 className={styles.infoTitle}>About this Market</h3>
              <p className={styles.infoText}>{meta.description}</p>
            </div>
          )}

          {/* Rules */}
          {meta?.rules && (
            <div className={styles.infoSection}>
              <h3 className={styles.infoTitle}>Resolution Rules</h3>
              <p className={styles.infoText}>{meta.rules}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
