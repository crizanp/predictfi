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
  isTrending?: boolean
}

const CATEGORY_EMOJI: Record<string, string> = {
  Sports: '⚽', Politics: '🗳️', Crypto: '₿', Science: '🔬',
  Entertainment: '🎬', Finance: '📈', Tech: '💻', Other: '🌐',
}

const CATEGORY_COLORS: Record<string, string> = {
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

/** Returns true if the hex color is perceived as dark */
function isDark(hex: string): boolean {
  try {
    const h = hex.replace('#', '')
    if (h.length < 6) return true
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55
  } catch { return true }
}

export default function MarketCard({ market, nowInSeconds, isTrending }: Props) {
  const [imageUrl, setImageUrl]     = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState(false)
  const [cardBg, setCardBg]         = useState<string | null>(null)
  const [cardText, setCardText]     = useState<string | null>(null)

  useEffect(() => {
    getMarketMeta(market.id).then((meta) => {
      if (meta?.image_url) { setImgLoading(true); setImageUrl(meta.image_url) }
      if (meta?.card_bg)   setCardBg(meta.card_bg)
      if (meta?.card_text) setCardText(meta.card_text)
    })
  }, [market.id])

  const yesPool = parseFloat(market.yesPool) || 0
  const noPool  = parseFloat(market.noPool)  || 0
  const total   = yesPool + noPool
  const yesOdds = total > 0 ? Math.round((yesPool / total) * 100) : 50
  const noOdds  = 100 - yesOdds

  const isLive  = !market.resolved && (nowInSeconds <= 0 || market.endTime > nowInSeconds)
  const isEnded = !market.resolved && nowInSeconds > 0 && market.endTime <= nowInSeconds
  const timeLeft = formatTimeLeft(market.endTime, nowInSeconds)
  const category = getMarketCategory(market.id, market.question)
  const emoji    = CATEGORY_EMOJI[category] ?? '🌐'
  const catColor = CATEGORY_COLORS[category] ?? '#6b7280'

  /* ── Dynamic color system ─────────────────────────────── */
  const hasBg     = Boolean(cardBg)
  const darkBg    = hasBg ? isDark(cardBg!) : true
  const baseText  = hasBg ? (cardText ?? (darkBg ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)')) : undefined
  const mutedText = hasBg ? (darkBg ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)') : undefined
  const yesClr    = hasBg ? (darkBg ? '#c084fc' : '#7c3aed') : '#c084fc'
  const noClr     = hasBg ? (darkBg ? '#ff3366' : '#dc2626') : '#ff3366'
  const barBg     = hasBg ? (darkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)') : undefined

  const badgeStyle = hasBg
    ? { color: baseText, borderColor: darkBg ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)', background: darkBg ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)' }
    : undefined

  return (
    <Link
      href={`/market/${market.id}`}
      className={styles.card}
      style={{ ...(cardBg ? { background: cardBg } : {}), ...(baseText ? { color: baseText } : {}) }}
    >
      {market.resolved && <div className={styles.resolvedOverlay} aria-hidden />}
      {isTrending && <span className={styles.fireBadge} aria-label="Trending">🔥</span>}

      <div className={styles.content}>
        {/* Status badges */}
        <div className={styles.badgeRow}>
          {isLive  && <span className={styles.statusLive}  style={badgeStyle}><span className={styles.liveDot} style={hasBg ? { background: yesClr } : undefined} />LIVE</span>}
          {isEnded && !market.resolved && <span className={styles.statusEnded} style={badgeStyle}>ENDED</span>}
        </div>

        {/* Category */}
        <div className={styles.catBadge} style={{ color: hasBg ? baseText : catColor, opacity: 0.75 }}>
          {emoji}&nbsp;{category.toUpperCase()}
        </div>

        {/* Question */}
        <p className={styles.question} style={hasBg ? { color: baseText } : undefined}>
          {market.question}
        </p>

        {/* Odds */}
        <div className={styles.oddsRow}>
          <div className={styles.oddsYes}>
            <span className={styles.oddsNum} style={{ color: yesClr }}>{yesOdds}<span className={styles.oddsPct}>%</span></span>
            <span className={styles.oddsLabel} style={hasBg ? { color: mutedText } : undefined}>YES</span>
          </div>
          <div className={styles.oddsVs} style={hasBg ? { color: mutedText } : undefined}>vs</div>
          <div className={styles.oddsNo}>
            <span className={styles.oddsNum} style={{ color: noClr }}>{noOdds}<span className={styles.oddsPct}>%</span></span>
            <span className={styles.oddsLabel} style={hasBg ? { color: mutedText } : undefined}>NO</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className={styles.barTrack} style={barBg ? { background: barBg } : undefined}>
          <div className={styles.barYes} style={{ width: `${yesOdds}%`, background: yesClr }} />
          <div className={styles.barNo}  style={{ width: `${noOdds}%`,  background: noClr  }} />
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.pool} style={hasBg ? { color: mutedText } : undefined}>💧 {total.toFixed(3)} tBNB</span>
          <span className={styles.time} style={hasBg ? { color: mutedText } : undefined}>
            {market.resolved ? 'Resolved ✓' : isEnded ? 'Ended ✓' : isLive ? `⏱ ${timeLeft}` : timeLeft}
          </span>
        </div>
      </div>

      {/* Thumbnail */}
      <div className={styles.thumb} style={hasBg ? { background: darkBg ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.12)' } : undefined}>
        {imgLoading && !imageUrl && <div className={styles.thumbSkeleton} />}
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill className={styles.thumbImg} unoptimized
            onLoad={() => setImgLoading(false)}
            onError={() => { setImgLoading(false); setImageUrl(null) }}
          />
        ) : (
          <div className={styles.thumbPlaceholder}>
            <span className={styles.thumbEmoji}>{emoji}</span>
          </div>
        )}
      </div>
    </Link>
  )
}