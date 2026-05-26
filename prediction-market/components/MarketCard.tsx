'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import {
  RiBarChartBoxLine,
  RiCalendarEventLine,
  RiChat3Line,
  RiGroupLine,
  RiPulseLine,
  RiStackLine,
} from 'react-icons/ri'
import { computePoolMetrics } from '../lib/utils'
import { getMarketMeta } from '../lib/supabase'
import type { Market } from '../context/MarketsContext'
import styles from './MarketCard.module.css'

interface Props {
  market: Market
  nowInSeconds: number
  isTrending?: boolean
}

interface EventRowOption {
  key: string
  eventId?: number
  name: string
  yesLabel: string
  noLabel: string
  chance?: number
  yesPrice?: number
  noPrice?: number
  yesPool?: string
  noPool?: string
  totalPool?: string
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

function parseEventRows(
  raw: string | null | undefined,
  onChainEvents: Array<{ id: number; name: string; yesPool: string; noPool: string; totalPool: string }>,
  fallbackName: string,
  fallbackYesLabel: string,
  fallbackNoLabel: string
): EventRowOption[] {
  const onChainRows: EventRowOption[] = onChainEvents.map((event) => {
    const total = parseFloat(event.totalPool) || 0
    const yes = parseFloat(event.yesPool) || 0
    const yesChance = total > 0 ? Math.round((yes / total) * 100) : 50
    return {
      key: String(event.id),
      eventId: event.id,
      name: event.name,
      yesLabel: fallbackYesLabel,
      noLabel: fallbackNoLabel,
      chance: yesChance,
      yesPool: event.yesPool,
      noPool: event.noPool,
      totalPool: event.totalPool,
    }
  })

  const fallback: EventRowOption[] = onChainRows.length > 0
    ? onChainRows
    : [{ key: 'default', name: fallbackName, yesLabel: fallbackYesLabel, noLabel: fallbackNoLabel }]

  if (!raw?.trim()) return fallback

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback

    const overrides: Array<Partial<EventRowOption>> = parsed.map((item, index) => {
      const row = item as Record<string, unknown>
      const chanceRaw = Number(row.chance)
      const yesPriceRaw = Number(row.yesPrice)
      const noPriceRaw = Number(row.noPrice)
      const name = String(row.name ?? '').trim()
      const yesLabel = String(row.yesLabel ?? '').trim()
      const noLabel = String(row.noLabel ?? '').trim()
      return {
        key: String(row.key ?? `event-${index + 1}`),
        name: name || undefined,
        yesLabel: yesLabel || undefined,
        noLabel: noLabel || undefined,
        chance: Number.isFinite(chanceRaw) ? chanceRaw : undefined,
        yesPrice: Number.isFinite(yesPriceRaw) ? yesPriceRaw : undefined,
        noPrice: Number.isFinite(noPriceRaw) ? noPriceRaw : undefined,
      }
    })

    if (onChainRows.length > 0) {
      return onChainRows.map((baseRow, index) => {
        const override = overrides[index]
        return {
          ...baseRow,
          key: baseRow.key,
          name: override?.name || baseRow.name,
          yesLabel: override?.yesLabel || baseRow.yesLabel,
          noLabel: override?.noLabel || baseRow.noLabel,
          chance: override?.chance ?? baseRow.chance,
          yesPrice: override?.yesPrice,
          noPrice: override?.noPrice,
        }
      })
    }

    const normalized = overrides
      .map((override, index) => ({
        key: String(override.key ?? `event-${index + 1}`),
        name: override.name || fallbackName,
        yesLabel: override.yesLabel || fallbackYesLabel,
        noLabel: override.noLabel || fallbackNoLabel,
        chance: override.chance,
        yesPrice: override.yesPrice,
        noPrice: override.noPrice,
      }))
      .filter((row) => row.name.trim().length > 0)

    return normalized.length > 0 ? normalized : fallback
  } catch {
    return fallback
  }
}

export default function MarketCard({ market, nowInSeconds, isTrending: _isTrending }: Props) {
  const [imageUrl, setImageUrl]     = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState(false)
  const [cardBg, setCardBg]         = useState<string | null>(null)
  const [cardText, setCardText]     = useState<string | null>(null)
  const [yesLabel, setYesLabel]     = useState('YES')
  const [noLabel, setNoLabel]       = useState('NO')
  const [eventRows, setEventRows] = useState<EventRowOption[]>([])

  useEffect(() => {
    getMarketMeta(market.id).then((meta) => {
      if (meta?.image_url) { setImgLoading(true); setImageUrl(meta.image_url) }
      if (meta?.card_bg)   setCardBg(meta.card_bg)
      if (meta?.card_text) setCardText(meta.card_text)
      const nextYesLabel = meta?.yes_label?.trim() || 'YES'
      const nextNoLabel = meta?.no_label?.trim() || 'NO'
      setYesLabel(nextYesLabel)
      setNoLabel(nextNoLabel)
      const fallbackEventName = market.eventName?.trim() || 'Main Event'
      setEventRows(parseEventRows(meta?.events_json, market.events, fallbackEventName, nextYesLabel, nextNoLabel))
    })
  }, [market.eventName, market.id, market.events])

  const yesPool = parseFloat(market.yesPool) || 0
  const noPool  = parseFloat(market.noPool)  || 0
  const total   = yesPool + noPool

  const timeLeft = formatTimeLeft(market.endTime, nowInSeconds)
  const closeDate = new Date(market.endTime * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const statusLabel = market.resolved ? 'Resolved' : timeLeft === 'Ended' ? 'Ended' : 'Live'

  /* ── Dynamic color system ─────────────────────────────── */
  const hasBg     = Boolean(cardBg)
  const darkBg    = hasBg ? isDark(cardBg!) : true
  const baseText  = hasBg ? (cardText ?? (darkBg ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)')) : undefined
  const mutedText = hasBg ? (darkBg ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)') : undefined
  const yesClr = hasBg ? (darkBg ? '#5fa5ff' : '#2563eb') : '#5fa5ff'
  const noClr = hasBg ? (darkBg ? '#ff666f' : '#dc2626') : '#ff666f'

  const volumeLabel = `${total.toFixed(2)} tBNB`
  const rowsToShow = eventRows.length > 0
    ? eventRows
    : [{ key: 'default', name: market.eventName || 'Main Event', yesLabel, noLabel }]

  return (
    <Link
      href={`/market/${market.id}`}
      className={styles.card}
      style={{ ...(cardBg ? { background: cardBg } : {}), ...(baseText ? { color: baseText } : {}) }}
    >
      {market.resolved && <div className={styles.resolvedOverlay} aria-hidden />}

      <div className={styles.header}>
        <div className={styles.media} style={hasBg ? { background: darkBg ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)' } : undefined}>
          {imgLoading && !imageUrl && <div className={styles.thumbSkeleton} />}
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt=""
              fill
              className={styles.mediaImg}
              unoptimized
              onLoad={() => setImgLoading(false)}
              onError={() => { setImgLoading(false); setImageUrl(null) }}
            />
          ) : (
            <div className={styles.mediaPlaceholder}>
              <span className={styles.mediaEmoji}>●</span>
            </div>
          )}
        </div>

        <h3 className={styles.question} style={hasBg ? { color: baseText } : undefined}>{market.question}</h3>
      </div>

      <div className={styles.rowsWrap}>
        {rowsToShow.map((row) => {
          const rowMetrics = computePoolMetrics(row.yesPool ?? '0', row.noPool ?? '0', row.totalPool ?? '0')
          const chance = Number.isFinite(row.chance) ? Math.max(0, Math.min(100, Math.round(row.chance as number))) : rowMetrics.yesPrice
          const rowYesPrice = Number.isFinite(row.yesPrice) ? Math.max(0, Math.round(row.yesPrice as number)) : rowMetrics.yesPrice
          const rowNoPrice = Number.isFinite(row.noPrice) ? Math.max(0, Math.round(row.noPrice as number)) : rowMetrics.noPrice

          return (
            <div key={row.key} className={styles.eventRow}>
              <span className={styles.rowName}>{row.name}</span>
              <span className={styles.rowChance}>{chance}%</span>
              <span className={styles.rowYes} style={{ color: yesClr, borderColor: `${yesClr}55` }}>{row.yesLabel} {rowYesPrice}¢</span>
              <span className={styles.rowNo} style={{ color: noClr, borderColor: `${noClr}55` }}>{row.noLabel} {rowNoPrice}¢</span>
            </div>
          )
        })}
      </div>

      <div className={styles.iconBar} style={hasBg ? { color: mutedText } : undefined}>
        <span className={styles.iconItem} title={`Volume ${volumeLabel}`} aria-label={`Volume ${volumeLabel}`}>
          <RiStackLine />
        </span>
        <span className={styles.iconItem} title={`Date ${closeDate}`} aria-label={`Date ${closeDate}`}>
          <RiCalendarEventLine />
        </span>
        <span
          className={`${styles.iconItem} ${statusLabel === 'Live' ? styles.iconLive : statusLabel === 'Resolved' ? styles.iconResolved : styles.iconEnded}`}
          title={`Status ${statusLabel}`}
          aria-label={`Status ${statusLabel}`}
        >
          <RiPulseLine />
        </span>
        <span className={styles.iconItem} title="Discussion" aria-label="Discussion">
          <RiChat3Line />
        </span>
        <span className={styles.iconItem} title="Activity" aria-label="Activity">
          <RiBarChartBoxLine />
        </span>
        <span className={styles.iconItem} title="Holders" aria-label="Holders">
          <RiGroupLine />
        </span>
      </div>
    </Link>
  )
}