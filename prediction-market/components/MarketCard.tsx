'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { RiBarChart2Line, RiTimeLine, RiCheckboxCircleLine } from 'react-icons/ri'
import { computePoolMetrics } from '../lib/utils'
import { getActivity, getComments, getMarketMeta } from '../lib/supabase'
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
  const days = Math.floor(secs / 86400)
  const hours = Math.floor((secs % 86400) / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m ${secs % 60}s`
}

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

    const overrides = parsed.map((item, index) => {
      const row = item as Record<string, unknown>
      const chanceRaw = Number(row.chance)
      const yesPriceRaw = Number(row.yesPrice)
      const noPriceRaw = Number(row.noPrice)
      return {
        key: String(row.key ?? `event-${index + 1}`),
        name: String(row.name ?? '').trim() || undefined,
        yesLabel: String(row.yesLabel ?? '').trim() || undefined,
        noLabel: String(row.noLabel ?? '').trim() || undefined,
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
  const [eventRows, setEventRows]   = useState<EventRowOption[]>([])
  const [discussionCount, setDiscussionCount] = useState(0)
  const [holderCount, setHolderCount] = useState(0)
  const [bnbUsdPrice, setBnbUsdPrice] = useState<number | null>(null)

  useEffect(() => {
    getMarketMeta(market.id).then((meta) => {
      if (meta?.image_url) { setImgLoading(true); setImageUrl(meta.image_url) }
      if (meta?.card_bg)   setCardBg(meta.card_bg)
      if (meta?.card_text) setCardText(meta.card_text)
      const nextYesLabel = meta?.yes_label?.trim() || 'YES'
      const nextNoLabel  = meta?.no_label?.trim()  || 'NO'
      setYesLabel(nextYesLabel)
      setNoLabel(nextNoLabel)
      const fallbackName = market.eventName?.trim() || 'Main Event'
      setEventRows(parseEventRows(meta?.events_json, market.events, fallbackName, nextYesLabel, nextNoLabel))
    })
  }, [market.eventName, market.id, market.events])

  useEffect(() => {
    let alive = true
    void Promise.all([getComments(market.id), getActivity(market.id)]).then(([comments, activity]) => {
      if (!alive) return
      setDiscussionCount(comments.length)
      setHolderCount(new Set(activity.map((row) => row.user_address.toLowerCase())).size)
    })
    return () => { alive = false }
  }, [market.id])

  useEffect(() => {
    let alive = true
    const cached = typeof window !== 'undefined' ? window.localStorage.getItem('predictfi_bnb_usd_price') : null
    if (cached) {
      const parsed = Number.parseFloat(cached)
      if (Number.isFinite(parsed) && parsed > 0) setBnbUsdPrice(parsed)
    }

    void fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd', {
      headers: { accept: 'application/json' },
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { binancecoin?: { usd?: number } } | null) => {
        const nextPrice = data?.binancecoin?.usd
        if (!alive || !nextPrice || !Number.isFinite(nextPrice) || nextPrice <= 0) return
        setBnbUsdPrice(nextPrice)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('predictfi_bnb_usd_price', String(nextPrice))
        }
      })
      .catch(() => {
        // Keep cached or fallback values if the price API is unavailable.
      })

    return () => { alive = false }
  }, [])

  const yesPool = parseFloat(market.yesPool) || 0
  const noPool  = parseFloat(market.noPool)  || 0
  const total   = yesPool + noPool

  const timeLeft    = formatTimeLeft(market.endTime, nowInSeconds)
  const statusLabel = market.resolved ? 'Resolved' : timeLeft === 'Ended' ? 'Ended' : 'Live'

  const hasBg    = Boolean(cardBg)
  const darkBg   = hasBg ? isDark(cardBg!) : true
  const baseText = hasBg ? (cardText ?? (darkBg ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)')) : undefined

  const rowsToShow   = eventRows.length > 0
    ? eventRows
    : [{ key: 'default', name: market.eventName || 'Main Event', yesLabel, noLabel }]
  const isMultiEvent = rowsToShow.length > 1
  const eventCount   = Math.max(rowsToShow.length, market.events.length)

  const volumeCompact = `${total.toFixed(4)} tBNB`
  const volumeUsd = bnbUsdPrice ? total * bnbUsdPrice : null
  const volumeUsdLabel = volumeUsd !== null
    ? `~$${volumeUsd >= 1000 ? volumeUsd.toFixed(0) : volumeUsd.toFixed(2)}`
    : null

  const countdownLabel = useMemo(() => {
    if (market.resolved) return 'Resolved'
    const secs = market.endTime - nowInSeconds
    if (secs <= 0) return 'Ended'
    const days = Math.floor(secs / 86400)
    const hours = Math.floor((secs % 86400) / 3600)
    const mins = Math.floor((secs % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m ${secs % 60}s`
  }, [market.endTime, market.resolved, nowInSeconds])
  // For single-event cards: big progress bar layout (Polymarket style)
  const singleRow   = rowsToShow[0]
  const singleMetrics = singleRow
    ? computePoolMetrics(singleRow.yesPool ?? '0', singleRow.noPool ?? '0', singleRow.totalPool ?? '0')
    : null
  const singleChance  = singleRow && Number.isFinite(singleRow.chance)
    ? Math.max(0, Math.min(100, Math.round(singleRow.chance as number)))
    : (singleMetrics?.yesPrice ?? 50)
  const singleYesPrice = singleRow && Number.isFinite(singleRow.yesPrice)
    ? Math.round(singleRow.yesPrice as number)
    : (singleMetrics?.yesPrice ?? 50)
  const singleNoPrice  = singleRow && Number.isFinite(singleRow.noPrice)
    ? Math.round(singleRow.noPrice as number)
    : (singleMetrics?.noPrice ?? 50)

  return (
    <Link
      href={`/market/${market.id}`}
      className={`${styles.card} ${isMultiEvent ? styles.multiCard : styles.singleCard}`}
      style={{ ...(cardBg ? { background: cardBg } : {}), ...(baseText ? { color: baseText } : {}) }}
    >
      {market.resolved && <div className={styles.resolvedOverlay} aria-hidden />}

      <div className={styles.header}>
        <div className={styles.media}>
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
              <span>●</span>
            </div>
          )}
        </div>

        <div className={styles.headerMeta}>
          <h3 className={styles.question} style={hasBg ? { color: baseText } : undefined}>
            {market.question}
          </h3>
          <div className={styles.headerBadges}>
            <span className={`${styles.badge} ${styles.badgeId}`}>#{market.id}</span>
            <span className={styles.badge}>{eventCount}E</span>
            {_isTrending && <span className={styles.badgeTrending}>Trending</span>}
          </div>
        </div>
      </div>

      {!isMultiEvent && singleRow && (
        <div className={styles.singleBody}>
          <div className={styles.barRow}>
            <span className={styles.barYesPct}>{singleChance}%</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressYes} style={{ width: `${singleChance}%` }} />
            </div>
            <span className={styles.barNoPct}>{100 - singleChance}%</span>
          </div>
          <div className={styles.btnRow}>
            <button className={styles.btnYes} tabIndex={-1}>
              {singleRow.yesLabel} {singleYesPrice}¢
            </button>
            <button className={styles.btnNo} tabIndex={-1}>
              {singleRow.noLabel} {singleNoPrice}¢
            </button>
          </div>
        </div>
      )}

      {isMultiEvent && (
        <div className={styles.rowsWrap}>
          {rowsToShow.map((row, idx) => {
            const m = computePoolMetrics(row.yesPool ?? '0', row.noPool ?? '0', row.totalPool ?? '0')
            const chance = Number.isFinite(row.chance)
              ? Math.max(0, Math.min(100, Math.round(row.chance as number)))
              : m.yesPrice
            const yesPrice = Number.isFinite(row.yesPrice) ? Math.round(row.yesPrice as number) : m.yesPrice
            const noPrice = Number.isFinite(row.noPrice) ? Math.round(row.noPrice as number) : m.noPrice

            return (
              <div key={row.key} className={styles.eventRow}>
                <span className={styles.rowIdx}>{String(idx + 1).padStart(2, '0')}</span>
                <span className={styles.rowName}>{row.name}</span>
                <span className={styles.rowChance}>{chance}%</span>
                <span className={styles.rowYes}>{row.yesLabel} {yesPrice}¢</span>
                <span className={styles.rowNo}>{row.noLabel} {noPrice}¢</span>
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.footerItem} title={`Volume ${volumeCompact}`}>
          <RiBarChart2Line className={styles.footerIcon} />
          <span className={styles.footerStack}>
            <strong className={styles.footerMainValue}>{volumeUsdLabel ?? volumeCompact}</strong>
            <span className={styles.footerSubValue}>{volumeUsdLabel ? volumeCompact : 'tBNB'}</span>
          </span>
        </span>
        <span className={styles.footerItem} title={`Countdown ${countdownLabel}`}>
          <RiTimeLine className={styles.footerIcon} />
          <strong>{countdownLabel}</strong>
        </span>
        <span className={styles.footerItem} title={`Discussion ${discussionCount}`}>
          <span className={styles.footerIconText}>💬</span>
          <strong>{discussionCount}</strong>
        </span>
        <span className={styles.footerItem} title={`Holders ${holderCount}`}>
          <span className={styles.footerIconText}>👥</span>
          <strong>{holderCount}</strong>
        </span>
      </div>
    </Link>
  )
}