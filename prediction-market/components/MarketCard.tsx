'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { getMarketCategory } from '../lib/utils'
import { getMarketMeta } from '../lib/supabase'
import type { Market } from '../context/MarketsContext'
import styles from './MarketCard.module.css'

interface Props {
  market: Market
  nowInSeconds: number
}

const CATEGORY_EMOJI: Record<string, string> = {
  Sports: '⚽', Politics: '🗳️', Crypto: '₿', Science: '🔬',
  Entertainment: '🎬', Finance: '📈', Tech: '💻', Other: '🌐',
}

const categoryColors: Record<string, string> = {
  Sports: '#3b82f6', Politics: '#a855f7', Crypto: '#c084fc',
  Science: '#06b6d4', Entertainment: '#f59e0b', Finance: '#c084fc',
  Tech: '#8b5cf6', Other: '#6b7280', Trending: '#c084fc', New: '#c084fc',
}

function formatTimeLeft(endTime: number, nowInSeconds: number): string {
  if (nowInSeconds <= 0) return '...'
  const secs = endTime - nowInSeconds
  if (secs <= 0) return 'Ended'
  if (secs < 3600) return `${Math.floor(secs / 60)}m left`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h left`
  return `${Math.floor(secs / 86400)}d left`
}

export default function MarketCard({ market, nowInSeconds }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [cardBg, setCardBg] = useState<string | null>(null)
  const [cardText, setCardText] = useState<string | null>(null)

  useEffect(() => {
    getMarketMeta(market.id).then((meta) => {
      if (meta?.image_url) setImageUrl(meta.image_url)
      if (meta?.card_bg) setCardBg(meta.card_bg)
      if (meta?.card_text) setCardText(meta.card_text)
    })
  }, [market.id])

  const yesPool = parseFloat(market.yesPool) || 0
  const noPool  = parseFloat(market.noPool)  || 0
  const total   = yesPool + noPool

  const yesOdds = total > 0 ? Math.round((yesPool / total) * 100) : 50
  const noOdds  = 100 - yesOdds

  const isLive    = !market.resolved && (nowInSeconds <= 0 || market.endTime > nowInSeconds)
  const isEnded   = !market.resolved && nowInSeconds > 0 && market.endTime <= nowInSeconds
  const timeLeft  = formatTimeLeft(market.endTime, nowInSeconds)
  const category  = getMarketCategory(market.id, market.question)
  const emoji     = CATEGORY_EMOJI[category] ?? '🌐'
  const catColor  = categoryColors[category] ?? '#6b7280'

  return (
    <Link
      href={`/market/${market.id}`}
      className={styles.card}
      style={{
        ...(cardBg ? { background: cardBg } : {}),
        ...(cardText ? { color: cardText } : {}),
      }}
    >      {/* ── Resolved overlay ──────────────────────────── */}
      {market.resolved && <div className={styles.resolvedOverlay} aria-hidden />}
      {/* ── Content (left) ──────────────────────── */}
      <div className={styles.content}>

        {/* Status badges */}
        <div className={styles.badgeRow}>
          {isLive && <span className={styles.statusLive}><span className={styles.liveDot} />LIVE</span>}
          {isEnded && !market.resolved && <span className={styles.statusEnded}>ENDED</span>}
        </div>

        {/* Category */}
        <div className={styles.catBadge} style={{ color: catColor }}>
          {emoji}&nbsp;{category.toUpperCase()}
        </div>

        {/* Question */}
        <p className={styles.question}>{market.question}</p>

        {/* Odds */}
        <div className={styles.oddsRow}>
          <div className={styles.oddsYes}>
            <span className={styles.oddsNum}>{yesOdds}<span className={styles.oddsPct}>%</span></span>
            <span className={styles.oddsLabel}>YES</span>
          </div>
          <div className={styles.oddsVs}>vs</div>
          <div className={styles.oddsNo}>
            <span className={styles.oddsNum}>{noOdds}<span className={styles.oddsPct}>%</span></span>
            <span className={styles.oddsLabel}>NO</span>
          </div>
        </div>

        {/* Bar */}
        <div className={styles.barTrack}>
          <div className={styles.barYes} style={{ width: yesOdds + '%' }} />
          <div className={styles.barNo}  style={{ width: noOdds  + '%' }} />
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.pool}>💧 {total.toFixed(3)} tBNB</span>
          <span className={styles.time}>
            {market.resolved ? 'Resolved ✓' : isEnded ? 'Ended ✓' : isLive ? `⏱ ${timeLeft}` : timeLeft}
          </span>
        </div>
      </div>

      {/* ── Thumbnail (right) ───────────────────── */}
      <div className={styles.thumb}>
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill className={styles.thumbImg} unoptimized />
        ) : (
          <div className={styles.thumbPlaceholder}>
            <span className={styles.thumbEmoji}>{emoji}</span>
          </div>
        )}
      </div>
    </Link>
  )
}