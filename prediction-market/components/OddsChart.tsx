'use client'

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ethers } from 'ethers'
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CandlestickSeries, ColorType, createChart, type CandlestickData, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { getOddsHistory, recordOddsSnapshot } from '../lib/supabase'
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../lib/contract'
import styles from './OddsChart.module.css'

interface SeriesEvent {
  id: number
  name: string
  yesPool: string
  totalPool: string
}

interface Props {
  marketId: number
  eventId?: number
  chartKey?: string
  yesPool: string
  noPool: string
  totalPool: string
  resolved: boolean
  yesLabel?: string
  noLabel?: string
  seriesEvents?: SeriesEvent[]
}

interface ChartPoint {
  ts: number
  iso: string
  yes: number
  no: number
}

type MultiChartPoint = { ts: number; iso: string } & Record<string, number | string>

type RenderPoint = { ts: number; time: string } & Record<string, number | string>

type IntervalKey = 'auto' | '5m' | '30m' | '3h' | '12h' | '1d' | '7d' | '30d'

const INTERVAL_OPTIONS: Array<{ key: IntervalKey; label: string; ms: number | null }> = [
  { key: 'auto', label: 'Auto', ms: null },
  { key: '5m', label: '5m', ms: 5 * 60 * 1000 },
  { key: '30m', label: '30m', ms: 30 * 60 * 1000 },
  { key: '3h', label: '3h', ms: 3 * 60 * 60 * 1000 },
  { key: '12h', label: '12h', ms: 12 * 60 * 60 * 1000 },
  { key: '1d', label: '1d', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
]

const LS_KEY = (id: number, chartKey?: string) => `pf_odds_${id}_${chartKey ?? 'default'}`
const MAX_PTS = 5000
const MIN_VALID_TS = -8640000000000000
const MAX_VALID_TS = 8640000000000000
const LINE_COLORS = ['#7c5cff', '#ffad66', '#ff72b6', '#4da3ff', '#38d39f', '#f97316', '#eab308', '#22d3ee']

function isValidTimestamp(ts: unknown): ts is number {
  return typeof ts === 'number' && Number.isFinite(ts) && ts >= MIN_VALID_TS && ts <= MAX_VALID_TS
}

function safeIsoFromTs(ts: number): string {
  return isValidTimestamp(ts) ? new Date(ts).toISOString() : new Date(Date.now()).toISOString()
}

function loadLocal<T>(id: number, chartKey?: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LS_KEY(id, chartKey)) ?? '[]') as T[]
  } catch {
    return []
  }
}

function saveLocal<T>(id: number, pts: T[], chartKey?: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY(id, chartKey), JSON.stringify(pts.slice(-MAX_PTS)))
  } catch {
    // ignore
  }
}

function formatTick(ts: number, spanMs: number): string {
  if (!Number.isFinite(ts)) return ''
  const date = new Date(ts)
  if (spanMs > 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  if (spanMs > 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short', hour: 'numeric' })
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function coerceTs(value: string | number | Date): number {
  const ts = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return isValidTimestamp(ts) ? ts : Date.now()
}

function nearestBucketMs(rawMs: number): number {
  const steps = [
    5 * 60 * 1000,
    30 * 60 * 1000,
    60 * 60 * 1000,
    3 * 60 * 60 * 1000,
    12 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000,
    30 * 24 * 60 * 60 * 1000,
  ]
  for (const step of steps) {
    if (rawMs <= step) return step
  }
  return steps[steps.length - 1]
}

function autoBucketMs(points: number, spanMs: number): number {
  if (points <= 140) return 5 * 60 * 1000
  const raw = Math.max(5 * 60 * 1000, Math.floor(spanMs / 140))
  return nearestBucketMs(raw)
}

function downsampleMulti(points: MultiChartPoint[], bucketMs: number): MultiChartPoint[] {
  if (!Number.isFinite(bucketMs) || bucketMs <= 0) return []
  const map = new Map<number, MultiChartPoint>()
  for (const point of points) {
    if (!isValidTimestamp(point.ts)) continue
    const bucket = Math.floor(point.ts / bucketMs) * bucketMs
    if (!isValidTimestamp(bucket)) continue
    map.set(bucket, { ...point, ts: bucket, iso: safeIsoFromTs(bucket) })
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts)
}

function toChance(yesPool: string, totalPool: string): number {
  const total = parseFloat(totalPool)
  const yes = parseFloat(yesPool)
  if (!Number.isFinite(total) || total <= 0) return 50
  if (!Number.isFinite(yes) || yes <= 0) return 0
  return Number(((yes / total) * 100).toFixed(4))
}

function seriesKey(eventId: number): string {
  return `event_${eventId}`
}

function autoCandleBucketSec(points: ChartPoint[]): number {
  if (points.length <= 100) return 1
  if (points.length < 2) return 60
  const spanMs = points[points.length - 1].ts - points[0].ts
  if (spanMs <= 0) return 60
  const avgGapMs = spanMs / Math.max(1, points.length - 1)
  if (avgGapMs <= 2000) return 1
  if (avgGapMs <= 7000) return 5
  if (avgGapMs <= 25000) return 15
  return 60
}

function bucketSecFromInterval(interval: IntervalKey, points: ChartPoint[]): number {
  if (interval === 'auto') return autoCandleBucketSec(points)
  if (interval === '5m') return 5
  if (interval === '30m') return 15
  if (interval === '3h') return 60
  if (interval === '12h') return 300
  if (interval === '1d') return 900
  if (interval === '7d') return 3600
  return 14400
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function buildCandles(points: ChartPoint[], bucketSec: number): CandlestickData<UTCTimestamp>[] {
  const bucketMs = Math.max(1, bucketSec) * 1000
  const map = new Map<number, { open: number; high: number; low: number; close: number }>()

  for (const point of points) {
    if (!isValidTimestamp(point.ts)) continue
    const bucket = Math.floor(point.ts / bucketMs) * bucketMs
    const current = map.get(bucket)
    if (!current) {
      map.set(bucket, { open: point.yes, high: point.yes, low: point.yes, close: point.yes })
      continue
    }
    if (point.yes > current.high) current.high = point.yes
    if (point.yes < current.low) current.low = point.yes
    current.close = point.yes
  }

  const ordered = Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  const result: CandlestickData<UTCTimestamp>[] = []
  // Start from first bucket open when available so fresh/incognito sessions
  // don't render a giant first candle from an artificial baseline.
  let prevClose = ordered.length > 0 ? ordered[0][1].open : 50
  const minBody = 0.2
  const minRange = 0.35

  for (const [ts, candle] of ordered) {
    const open = prevClose
    const close = candle.close
    let high = Math.max(candle.high, open, close)
    let low = Math.min(candle.low, open, close)

    if (Math.abs(close - open) < minBody) {
      const mid = (open + close) / 2
      const halfBody = minBody / 2
      const adjustedOpen = clampPct(mid - halfBody)
      const adjustedClose = clampPct(mid + halfBody)
      high = Math.max(high, adjustedOpen, adjustedClose)
      low = Math.min(low, adjustedOpen, adjustedClose)
      prevClose = adjustedClose
      result.push({
        time: Math.floor(ts / 1000) as UTCTimestamp,
        open: adjustedOpen,
        high,
        low,
        close: adjustedClose,
      })
      continue
    }

    if (high - low < minRange) {
      const mid = (high + low) / 2
      const half = minRange / 2
      high = clampPct(mid + half)
      low = clampPct(mid - half)
    }

    prevClose = close
    result.push({
      time: Math.floor(ts / 1000) as UTCTimestamp,
      open,
      high,
      low,
      close,
    })
  }

  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MultiTooltip = ({ active, payload, label, series }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTime}>{label}</p>
      {series.map((entry: { key: string; name: string; color: string }) => {
        const match = payload.find((point: { dataKey?: string }) => point.dataKey === entry.key)
        return (
          <p key={entry.key} className={styles.tooltipLine} style={{ color: entry.color }}>
            {entry.name} {typeof match?.value === 'number' ? `${match.value}%` : '50%'}
          </p>
        )
      })}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SingleTooltip = ({ active, payload, label, yesLabel, noLabel }: any) => {
  if (!active || !payload?.length) return null
  const yesValue = payload.find((point: { dataKey?: string }) => point.dataKey === 'yes')?.value
  const noValue = payload.find((point: { dataKey?: string }) => point.dataKey === 'no')?.value
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTime}>{label}</p>
      <p className={styles.tooltipYes}>{yesLabel} {typeof yesValue === 'number' ? `${yesValue}%` : '50%'}</p>
      <p className={styles.tooltipNo}>{noLabel} {typeof noValue === 'number' ? `${noValue}%` : '50%'}</p>
    </div>
  )
}

export default function OddsChart({
  marketId,
  eventId,
  chartKey,
  yesPool,
  noPool,
  totalPool,
  resolved,
  yesLabel = 'YES',
  noLabel = 'NO',
  seriesEvents = [],
}: Props) {
  const isMultiSeries = seriesEvents.length > 1

  const [history, setHistory] = useState<ChartPoint[]>(() => loadLocal<ChartPoint>(marketId, chartKey))
  const [multiHistory, setMultiHistory] = useState<MultiChartPoint[]>(() => loadLocal<MultiChartPoint>(marketId, chartKey))
  const [interval, setInterval] = useState<IntervalKey>('auto')
  const [windowStartIndex, setWindowStartIndex] = useState(0)
  const [windowEndIndex, setWindowEndIndex] = useState(0)
  const supabaseSynced = useRef(false)
  const lastSnapshotBucket = useRef<Record<string, number>>({})
  const tvContainerRef = useRef<HTMLDivElement | null>(null)
  const tvChartRef = useRef<IChartApi | null>(null)
  const tvSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const txHistorySyncedRef = useRef('')

  useEffect(() => {
    const localSingle = loadLocal<ChartPoint>(marketId, chartKey)
      .map((point) => {
        const legacy = point as ChartPoint & { time?: string }
        if (isValidTimestamp(point.ts)) return { ...point, iso: safeIsoFromTs(point.ts) }
        if (legacy.time) {
          const guessed = coerceTs(new Date().toDateString() + ' ' + legacy.time)
          return { ts: guessed, iso: safeIsoFromTs(guessed), yes: point.yes, no: point.no }
        }
        return null
      })
      .filter((point): point is ChartPoint => Boolean(point))

    const localMulti = loadLocal<MultiChartPoint>(marketId, chartKey)
      .map((point) => {
        const legacy = point as MultiChartPoint & { time?: string }
        if (isValidTimestamp(point.ts)) return { ...point, iso: safeIsoFromTs(point.ts) }
        if (legacy.time) {
          const guessed = coerceTs(new Date().toDateString() + ' ' + legacy.time)
          return { ...point, ts: guessed, iso: safeIsoFromTs(guessed) }
        }
        return null
      })
      .filter((point): point is MultiChartPoint => Boolean(point))

    setHistory(localSingle)
    setMultiHistory(localMulti)
    supabaseSynced.current = false
    lastSnapshotBucket.current = {}
  }, [marketId, chartKey])

  useEffect(() => {
    if (supabaseSynced.current) return
    supabaseSynced.current = true

    void getOddsHistory(marketId).then((snaps) => {
      if (!snaps.length) return

      if (isMultiSeries) {
        const buckets = new Map<number, MultiChartPoint>()
        for (const snap of snaps) {
          if (!snap.event_id) continue
          const ts = coerceTs(snap.recorded_at)
          const bucket = Math.floor(ts / (5 * 60 * 1000)) * (5 * 60 * 1000)
          if (!isValidTimestamp(bucket)) continue
          const key = seriesKey(snap.event_id)
          const total = parseFloat(snap.total_pool)
          const chance = total > 0 ? Math.round((parseFloat(snap.yes_pool) / total) * 100) : 50
          const current = buckets.get(bucket) ?? { ts: bucket, iso: safeIsoFromTs(bucket) }
          current[key] = chance
          buckets.set(bucket, current)
        }

        const pts = Array.from(buckets.values()).sort((a, b) => a.ts - b.ts)
        setMultiHistory((prev) => {
          const map = new Map<number, MultiChartPoint>()
          for (const point of prev) map.set(point.ts, point)
          for (const point of pts) {
            const current = map.get(point.ts) ?? { ts: point.ts, iso: point.iso }
            map.set(point.ts, { ...current, ...point })
          }
          const merged = Array.from(map.values()).sort((a, b) => a.ts - b.ts).slice(-MAX_PTS)
          saveLocal(marketId, merged, chartKey)
          return merged
        })
        return
      }

      const strictEventSnaps = snaps.filter((snap) => (eventId === undefined ? !snap.event_id : snap.event_id === eventId))
      const legacySnaps = eventId === undefined
        ? strictEventSnaps
        : snaps.filter((snap) => snap.event_id == null)
      const fallbackAllSnaps = eventId === undefined ? strictEventSnaps : snaps

      // Prefer exact event matches, then legacy null event rows, then all rows.
      const selectedSnaps = strictEventSnaps.length >= 2
        ? strictEventSnaps
        : (strictEventSnaps.length + legacySnaps.length >= 2
          ? [...strictEventSnaps, ...legacySnaps]
          : fallbackAllSnaps)

      const pts: ChartPoint[] = selectedSnaps
        .map((snap) => {
          const total = parseFloat(snap.total_pool)
          const yesPct = total > 0 ? Number(((parseFloat(snap.yes_pool) / total) * 100).toFixed(4)) : 50
          const ts = coerceTs(snap.recorded_at)
          return {
            ts,
            iso: safeIsoFromTs(ts),
            yes: yesPct,
            no: Number((100 - yesPct).toFixed(4)),
          }
        })

      setHistory((prev) => {
        const map = new Map<number, ChartPoint>()
        for (const point of prev) map.set(point.ts, point)
        for (const point of pts) map.set(point.ts, point)
        const merged = Array.from(map.values()).sort((a, b) => a.ts - b.ts).slice(-MAX_PTS)
        saveLocal(marketId, merged, chartKey)
        return merged
      })
    })
  }, [isMultiSeries, marketId, eventId, chartKey])

  useEffect(() => {
    if (isMultiSeries) return
    if (!ethers.isAddress(CONTRACT_ADDRESS)) return

    const syncKey = `${marketId}:${eventId ?? 0}:${chartKey ?? 'default'}`
    if (txHistorySyncedRef.current === syncKey) return
    txHistorySyncedRef.current = syncKey

    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const provider = new ethers.JsonRpcProvider('https://data-seed-prebsc-1-s1.binance.org:8545/')
          const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const filter = (contract.filters as any).PredictionPlaced(marketId, eventId ?? null)
          const events = await contract.queryFilter(filter)
          if (!events.length) return

          const blockNumbers = Array.from(new Set(events.map((entry) => entry.blockNumber)))
          const blocks = await Promise.all(
            blockNumbers.map(async (blockNumber) => ({
              blockNumber,
              block: await provider.getBlock(blockNumber),
            }))
          )
          const timestampByBlock = new Map<number, number>()
          for (const { blockNumber, block } of blocks) {
            const ts = Number(block?.timestamp ?? 0)
            timestampByBlock.set(blockNumber, ts > 0 ? ts * 1000 : Date.now())
          }

          const txs = events
            .map((entry) => {
              const args = (entry as { args?: unknown[] }).args ?? []
              return {
                ts: timestampByBlock.get(entry.blockNumber) ?? Date.now(),
                choice: Number(args[3] ?? 0),
                amount: parseFloat(ethers.formatEther((args[4] as bigint) ?? BigInt(0))) || 0,
              }
            })
            .filter((entry) => (entry.choice === 1 || entry.choice === 2) && entry.amount > 0)
            .sort((a, b) => a.ts - b.ts)

          if (!txs.length) return

          const totalYesAdded = txs.filter((entry) => entry.choice === 1).reduce((sum, entry) => sum + entry.amount, 0)
          const totalNoAdded = txs.filter((entry) => entry.choice === 2).reduce((sum, entry) => sum + entry.amount, 0)
          let runningYes = Math.max(0, (parseFloat(yesPool) || 0) - totalYesAdded)
          let runningNo = Math.max(0, (parseFloat(noPool) || 0) - totalNoAdded)
          const txPoints: ChartPoint[] = []

          for (let index = 0; index < txs.length; index += 1) {
            const tx = txs[index]
            if (tx.choice === 1) runningYes += tx.amount
            if (tx.choice === 2) runningNo += tx.amount
            const total = runningYes + runningNo
            const yesPct = total > 0 ? Number(((runningYes / total) * 100).toFixed(4)) : 50
            const tsWithOffset = tx.ts + index
            txPoints.push({
              ts: tsWithOffset,
              iso: safeIsoFromTs(tsWithOffset),
              yes: yesPct,
              no: Number((100 - yesPct).toFixed(4)),
            })
          }

          if (cancelled || txPoints.length === 0) return

          setHistory((prev) => {
            const map = new Map<number, ChartPoint>()
            for (const point of prev) map.set(point.ts, point)
            for (const point of txPoints) map.set(point.ts, point)
            const merged = Array.from(map.values()).sort((a, b) => a.ts - b.ts).slice(-MAX_PTS)
            saveLocal(marketId, merged, chartKey)
            return merged
          })
        } catch {
          // ignore tx-history fallback failures
        }
      })()
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [chartKey, eventId, isMultiSeries, marketId, noPool, yesPool])

  useEffect(() => {
    if (!isMultiSeries) return

    const ts = Date.now()
    const point: MultiChartPoint = { ts, iso: safeIsoFromTs(ts) }
    for (const seriesEvent of seriesEvents) {
      point[seriesKey(seriesEvent.id)] = toChance(seriesEvent.yesPool, seriesEvent.totalPool)
    }

    setMultiHistory((prev) => {
      const last = prev[prev.length - 1]
      const sameTime = last && ts - last.ts < 5 * 60 * 1000
      const unchanged = sameTime && seriesEvents.every((seriesEvent) => {
        const key = seriesKey(seriesEvent.id)
        return Number(last?.[key] ?? -1) === Number(point[key] ?? -2)
      })
      if (unchanged) return prev

      const base = sameTime ? prev.slice(0, -1) : prev
      const updated = [...base, point].slice(-MAX_PTS)
      saveLocal(marketId, updated, chartKey)
      return updated
    })
  }, [isMultiSeries, seriesEvents, marketId, chartKey])

  useEffect(() => {
    if (!isMultiSeries || resolved) return
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000))
    for (const seriesEvent of seriesEvents) {
      const key = `event-${seriesEvent.id}`
      if (lastSnapshotBucket.current[key] === bucket) continue
      lastSnapshotBucket.current[key] = bucket
      const noPoolValue = Math.max(0, (parseFloat(seriesEvent.totalPool) || 0) - (parseFloat(seriesEvent.yesPool) || 0))
      void recordOddsSnapshot({
        market_id: marketId,
        event_id: seriesEvent.id,
        yes_pool: seriesEvent.yesPool,
        no_pool: noPoolValue.toString(),
        total_pool: seriesEvent.totalPool,
      })
    }
  }, [isMultiSeries, marketId, resolved, seriesEvents])

  useEffect(() => {
    if (isMultiSeries) return

    const total = parseFloat(totalPool)
    if (total <= 0) return

    const yesPct = Number(((parseFloat(yesPool) / total) * 100).toFixed(4))
    const ts = Date.now()
    const pt: ChartPoint = { ts, iso: safeIsoFromTs(ts), yes: yesPct, no: Number((100 - yesPct).toFixed(4)) }

    setHistory((prev) => {
      const last = prev[prev.length - 1]
      if (last && ts - last.ts < 60 * 1000 && last.yes === yesPct) return prev
      const updated = [...prev, pt]
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_PTS)
      saveLocal(marketId, updated, chartKey)
      return updated
    })

    if (!resolved) {
      const key = `event-${eventId ?? 0}`
      const bucket = Math.floor(Date.now() / (5 * 60 * 1000))
      if (lastSnapshotBucket.current[key] === bucket) return
      lastSnapshotBucket.current[key] = bucket
      void recordOddsSnapshot({
        market_id: marketId,
        event_id: eventId,
        yes_pool: yesPool,
        no_pool: noPool,
        total_pool: totalPool,
      })
    }
  }, [isMultiSeries, marketId, eventId, chartKey, yesPool, noPool, totalPool, resolved])

  const bucketMs = useMemo(() => {
    const sourceLen = multiHistory.length
    const source = multiHistory
    const spanMs = sourceLen > 1 ? source[sourceLen - 1].ts - source[0].ts : 0
    if (interval !== 'auto') {
      return INTERVAL_OPTIONS.find((item) => item.key === interval)?.ms ?? 5 * 60 * 1000
    }
    return autoBucketMs(sourceLen, spanMs)
  }, [interval, multiHistory])

  const series = useMemo(() =>
    seriesEvents.map((seriesEvent, index) => ({
      key: seriesKey(seriesEvent.id),
      name: seriesEvent.name,
      color: LINE_COLORS[index % LINE_COLORS.length],
      chance: toChance(seriesEvent.yesPool, seriesEvent.totalPool),
    })),
  [seriesEvents])

  const multiChartData = useMemo<RenderPoint[]>(() => {
    const ts = Date.now()
    const current: MultiChartPoint = { ts, iso: safeIsoFromTs(ts) }
    for (const entry of series) current[entry.key] = entry.chance

    if (multiHistory.length === 0) {
      const openTs = ts - 5 * 60 * 1000
      const open: MultiChartPoint = { ts: openTs, iso: safeIsoFromTs(openTs) }
      for (const entry of series) open[entry.key] = 50
      return [
        { ...open, time: 'Open' },
        { ...current, time: formatTick(current.ts, 5 * 60 * 1000) },
      ]
    }

    const slicedByInterval = (() => {
      if (interval === 'auto') return multiHistory
      const ms = INTERVAL_OPTIONS.find((item) => item.key === interval)?.ms
      if (!ms) return multiHistory
      const minTs = ts - ms
      return multiHistory.filter((point) => point.ts >= minTs)
    })()

    const basePoints = slicedByInterval.length ? slicedByInterval : multiHistory
    const withCurrent = [...basePoints, current].sort((a, b) => a.ts - b.ts)
    const sampled = downsampleMulti(withCurrent, bucketMs)
    const spanMs = sampled.length > 1 ? sampled[sampled.length - 1].ts - sampled[0].ts : 5 * 60 * 1000

    return sampled.map((point) => ({
      ...point,
      ts: point.ts,
      time: formatTick(point.ts, spanMs),
    }))
  }, [bucketMs, interval, multiHistory, series])

  const renderData = multiChartData

  const singleTickData = useMemo<ChartPoint[]>(() => {
    if (isMultiSeries) return []

    const ts = Date.now()
    const total = parseFloat(totalPool)
    const yesPct = total > 0 ? Number(((parseFloat(yesPool) / total) * 100).toFixed(4)) : 50
    const nowPt: ChartPoint = { ts, iso: safeIsoFromTs(ts), yes: yesPct, no: Number((100 - yesPct).toFixed(4)) }
    const slicedByInterval = (() => {
      if (interval === 'auto') return history
      const ms = INTERVAL_OPTIONS.find((item) => item.key === interval)?.ms
      if (!ms) return history
      const minTs = ts - ms
      return history.filter((point) => point.ts >= minTs)
    })()

    const source = (slicedByInterval.length ? slicedByInterval : history).slice(-MAX_PTS)
    return [...source, nowPt].sort((a, b) => a.ts - b.ts)
  }, [history, interval, isMultiSeries, totalPool, yesPool])

  const candleBucketSec = useMemo(() => bucketSecFromInterval(interval, singleTickData), [interval, singleTickData])
  const singleCandleData = useMemo(() => buildCandles(singleTickData, candleBucketSec), [singleTickData, candleBucketSec])
  const useCommonLineForSingle = !isMultiSeries && singleTickData.length > 100
  const singleLineData = useMemo<RenderPoint[]>(() => {
    if (isMultiSeries) return []
    const spanMs = singleTickData.length > 1 ? singleTickData[singleTickData.length - 1].ts - singleTickData[0].ts : 5 * 60 * 1000
    return singleTickData.map((point) => ({
      ...point,
      time: formatTick(point.ts, spanMs),
    }))
  }, [isMultiSeries, singleTickData])

  useEffect(() => {
    if (!isMultiSeries) return
    if (renderData.length === 0) {
      setWindowStartIndex(0)
      setWindowEndIndex(0)
      return
    }
    const span = Math.max(10, Math.floor(renderData.length * 0.35))
    setWindowEndIndex(renderData.length - 1)
    setWindowStartIndex(Math.max(0, renderData.length - span))
  }, [interval, isMultiSeries, renderData.length])

  const hasBrush = isMultiSeries && renderData.length > 30
  const safeStart = Math.min(windowStartIndex, Math.max(0, renderData.length - 1))
  const safeEnd = Math.max(safeStart, Math.min(windowEndIndex, Math.max(0, renderData.length - 1)))

  useEffect(() => {
    if (isMultiSeries) {
      if (tvChartRef.current) {
        tvChartRef.current.remove()
        tvChartRef.current = null
        tvSeriesRef.current = null
      }
      return
    }

    const el = tvContainerRef.current
    if (!el || tvChartRef.current) return

    const chart = createChart(el, {
      height: 220,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9aa8bf',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        rightOffset: 2,
        timeVisible: true,
        secondsVisible: candleBucketSec < 60,
      },
      crosshair: {
        vertLine: { color: 'rgba(192,132,252,0.55)' },
        horzLine: { color: 'rgba(192,132,252,0.35)' },
      },
      localization: {
        priceFormatter: (price: number) => `${price.toFixed(2)}%`,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#a855f7',
      downColor: '#ff3366',
      wickUpColor: '#c084fc',
      wickDownColor: '#ff5a83',
      borderVisible: false,
    })

    tvChartRef.current = chart
    tvSeriesRef.current = candleSeries

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width })
      }
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
      if (tvChartRef.current) {
        tvChartRef.current.remove()
        tvChartRef.current = null
        tvSeriesRef.current = null
      }
    }
  }, [candleBucketSec, isMultiSeries])

  useEffect(() => {
    if (isMultiSeries) return
    const chart = tvChartRef.current
    const candleSeries = tvSeriesRef.current
    if (!chart || !candleSeries) return

    candleSeries.setData(singleCandleData)
    chart.applyOptions({
      timeScale: { secondsVisible: candleBucketSec < 60 },
    })
    chart.timeScale().fitContent()
  }, [candleBucketSec, isMultiSeries, singleCandleData])

  return (
    <div className={styles.wrapper}>
      <div className={styles.watermark} aria-hidden>predictfi.fun</div>
      <div className={styles.header}>
        <h3 className={styles.title}>{isMultiSeries ? 'Events Odds History' : 'Odds History'}</h3>
        <div className={styles.chartControls}>
          <div className={styles.intervalPills}>
            {INTERVAL_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`${styles.intervalBtn} ${interval === item.key ? styles.intervalBtnActive : ''}`}
                onClick={() => setInterval(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {!isMultiSeries && (
          <span className={styles.modeBadge}>
            {useCommonLineForSingle ? 'Common View' : 'Candle View'}
          </span>
        )}
        <div className={styles.legend}>
          {isMultiSeries ? (
            series.map((entry) => (
              <span key={entry.key} className={styles.legendItem} style={{ color: entry.color }}>
                <span className={styles.dot} style={{ background: entry.color }} />
                {entry.name} {entry.chance}%
              </span>
            ))
          ) : (
            <>
              <span className={styles.legendYes}><span className={styles.dot} style={{ background: '#c084fc' }} />{yesLabel}</span>
              <span className={styles.legendNo}><span className={styles.dot} style={{ background: '#ff3366' }} />{noLabel}</span>
            </>
          )}
        </div>
      </div>

      {isMultiSeries ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={renderData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="time"
              tick={{ fill: '#5a7a63', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis domain={[0, 100]} tick={{ fill: '#5a7a63', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<MultiTooltip series={series} />} />
            <Legend wrapperStyle={{ display: 'none' }} />
            {series.map((entry) => (
              <Line
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                stroke={entry.color}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4, fill: entry.color, stroke: 'rgba(255,255,255,0.2)', strokeWidth: 3 }}
                isAnimationActive={false}
              />
            ))}
            {hasBrush && (
              <Brush
                dataKey="time"
                height={18}
                stroke="rgba(192,132,252,0.6)"
                startIndex={safeStart}
                endIndex={safeEnd}
                travellerWidth={10}
                onChange={(next) => {
                  if (typeof next?.startIndex === 'number' && typeof next?.endIndex === 'number') {
                    setWindowStartIndex(next.startIndex)
                    setWindowEndIndex(next.endIndex)
                  }
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      ) : useCommonLineForSingle ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={singleLineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="time"
              tick={{ fill: '#5a7a63', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis domain={[0, 100]} tick={{ fill: '#5a7a63', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<SingleTooltip yesLabel={yesLabel} noLabel={noLabel} />} />
            <Legend wrapperStyle={{ display: 'none' }} />
            <Line
              type="monotone"
              dataKey="yes"
              stroke="#c084fc"
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, fill: '#c084fc', stroke: 'rgba(255,255,255,0.2)', strokeWidth: 3 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="no"
              stroke="#ff3366"
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, fill: '#ff3366', stroke: 'rgba(255,255,255,0.2)', strokeWidth: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className={styles.tvChartWrap}>
          <div ref={tvContainerRef} className={styles.tvChart} />
          {singleCandleData.length === 0 && (
            <div className={styles.tvEmpty}>Waiting for transaction activity...</div>
          )}
        </div>
      )}
    </div>
  )
}
