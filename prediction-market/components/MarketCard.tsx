'use client'

import Link from 'next/link'
import { Market } from '../context/MarketsContext'
import { computePoolMetrics, formatTimeLeft, getMarketCategory } from '../lib/utils'
import styles from './MarketCard.module.css'

interface Props {
  market: Market
  nowInSeconds: number
}

const categoryColors: Record<string, string> = {
  Sports: '#3b82f6',
  Politics: '#f59e0b',
  Crypto: '#8b5cf6',
  Esports: '#ec4899',
  Finance: '#10b981',
  Economy: '#06b6d4',
  Culture: '#f97316',
  Trending: '#a78bfa',
  New: '#22c55e',
}

export default function MarketCard({ market, nowInSeconds }: Props) {
  const { yesPct, noPct } = computePoolMetrics(market.yesPool, market.noPool, market.totalPool)
  const category = getMarketCategory(market.id, market.question)
  const timeLeft = formatTimeLeft(market.endTime, nowInSeconds)
  const isLive = !market.resolved && (nowInSeconds <= 0 || market.endTime > nowInSeconds)
  const isEnded = !market.resolved && nowInSeconds > 0 && market.endTime <= nowInSeconds
  const totalPoolNum = Number.parseFloat(market.totalPool)

  return (
    <Link href={`/market/${market.id}`} className={styles.card}>
      <div className={styles.cardTop}>
        <span
          className={styles.category}
          style={{ color: categoryColors[category] || '#a78bfa' }}
        >
          {category.toUpperCase()}
        </span>
        <span
          className={
            market.resolved
              ? styles.statusResolved
              : isEnded
                ? styles.statusEnded
                : styles.statusLive
          }
        >
          {market.resolved ? 'Resolved' : isEnded ? 'Ended' : '● Live'}
        </span>
      </div>

      <h3 className={styles.question}>{market.question}</h3>

      <div className={styles.barTrack}>
        <div className={styles.barYes} style={{ width: `${yesPct}%` }} />
        <div className={styles.barNo} style={{ width: `${noPct}%` }} />
      </div>

      <div className={styles.oddsRow}>
        <span className={styles.yes}>YES {yesPct}%</span>
        <span className={styles.no}>NO {noPct}%</span>
      </div>

      <div className={styles.footer}>
        <span className={styles.pool}>
          {totalPoolNum.toFixed(4)} tBNB pooled
        </span>
        <span className={styles.time}>{timeLeft}</span>
      </div>
    </Link>
  )
}
