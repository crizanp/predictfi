'use client'

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ethers } from 'ethers'
import { ColorType, createChart, LineSeries, type CandlestickData, type IChartApi, type ISeriesApi, type LineData, type MouseEventParams, type Time, type UTCTimestamp } from 'lightweight-charts'
import { getActivity, getOddsHistory, recordOddsSnapshot, type MarketActivity } from '../lib/supabase'
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
type CrosshairRow = { key: string; name: string; color: string; value: number }

type IntervalKey = 'all' | 'auto' | '5m' | '15m' | '1h' | '4h' | '12h' | '1d' | '7d' | '30d'

type ChartViewMode = 'normal' | 'min' | 'max'
type CrosshairPanelPos = { left: number; top: number }

const INTERVAL_OPTIONS: Array<{ key: IntervalKey; label: string; ms: number | null }> = [
  { key: 'all', label: 'All', ms: null },
  { key: 'auto', label: 'Auto', ms: null },
  { key: '5m', label: '5m', ms: 5 * 60 * 1000 },
  { key: '15m', label: '15m', ms: 15 * 60 * 1000 },
  { key: '1h', label: '1h', ms: 60 * 60 * 1000 },
  { key: '4h', label: '4h', ms: 4 * 60 * 60 * 1000 },
  { key: '12h', label: '12h', ms: 12 * 60 * 60 * 1000 },
  { key: '1d', label: '1d', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
]

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

function coerceTs(value: string | number | Date): number {
  const ts = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return isValidTimestamp(ts) ? ts : Date.now()
}

function nearestBucketMs(rawMs: number): number {
  const steps = [
    15 * 1000,
    30 * 1000,
    60 * 1000,
    2 * 60 * 1000,
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
  if (points <= 240) return 15 * 1000
  const raw = Math.max(15 * 1000, Math.floor(spanMs / 240))
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

function filterPointsInWindow<T extends { ts: number }>(
  points: T[],
  interval: IntervalKey,
  nowTs: number
): T[] {
  if (interval === 'all' || interval === 'auto') return points
  const ms = INTERVAL_OPTIONS.find((item) => item.key === interval)?.ms
  if (!ms) return points
  const minTs = nowTs - ms
  const filtered = points.filter((point) => point.ts >= minTs)
  if (filtered.length > 0) return filtered
  return points.length > 0 ? [points[points.length - 1]] : []
}

function formatCrosshairTime(time: Time | undefined): string {
  if (!time) return 'Latest'
  if (typeof time === 'number') {
    return new Date(time * 1000).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  if (typeof time === 'string') {
    const parsed = new Date(time)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
    return 'Latest'
  }
  if (typeof time === 'object' && time !== null && 'year' in time && 'month' in time && 'day' in time) {
    return new Date(time.year, time.month - 1, time.day).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }
  return 'Latest'
}

function pointFromSeriesMap(entry: unknown): number | null {
  if (!entry || typeof entry !== 'object') return null
  const maybePoint = entry as { value?: number; close?: number }
  if (typeof maybePoint.value === 'number' && Number.isFinite(maybePoint.value)) return maybePoint.value
  if (typeof maybePoint.close === 'number' && Number.isFinite(maybePoint.close)) return maybePoint.close
  return null
}

function toStrictAscLineData(data: LineData<UTCTimestamp>[]): LineData<UTCTimestamp>[] {
  if (data.length <= 1) return data
  const out: LineData<UTCTimestamp>[] = []
  for (const point of data) {
    const prev = out[out.length - 1]
    if (prev && prev.time === point.time) {
      out[out.length - 1] = point
      continue
    }
    out.push(point)
  }
  return out
}

function mergeChartPoints(...groups: ChartPoint[][]): ChartPoint[] {
  const map = new Map<number, ChartPoint>()
  for (const group of groups) {
    for (const point of group) {
      map.set(point.ts, point)
    }
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts).slice(-MAX_PTS)
}

function mergeMultiChartPoints(...groups: MultiChartPoint[][]): MultiChartPoint[] {
  const map = new Map<number, MultiChartPoint>()
  for (const group of groups) {
    for (const point of group) {
      const current = map.get(point.ts) ?? { ts: point.ts, iso: point.iso }
      map.set(point.ts, { ...current, ...point })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts).slice(-MAX_PTS)
}

function matchesActivityEvent(row: MarketActivity, eventId: number | undefined): boolean {
  if (eventId === undefined) return row.event_id == null
  return Number(row.event_id ?? Number.NaN) === eventId
}

function buildSingleActivityHistory(
  rows: MarketActivity[],
  eventId: number | undefined,
  currentYesPool: string,
  currentNoPool: string
): ChartPoint[] {
  const strictRows = rows.filter((row) => matchesActivityEvent(row, eventId))
  const legacyRows = eventId === undefined ? strictRows : rows.filter((row) => row.event_id == null)
  const selectedRows = strictRows.length > 0 ? strictRows : legacyRows
  const orderedRows = selectedRows
    .map((row) => ({
      ts: coerceTs(row.created_at),
      choice: Number(row.choice ?? 0),
      amount: parseFloat(row.amount_eth) || 0,
    }))
    .filter((row) => (row.choice === 1 || row.choice === 2) && row.amount > 0)
    .sort((a, b) => a.ts - b.ts)

  if (orderedRows.length === 0) return []

  const totalYesAdded = orderedRows.filter((row) => row.choice === 1).reduce((sum, row) => sum + row.amount, 0)
  const totalNoAdded = orderedRows.filter((row) => row.choice === 2).reduce((sum, row) => sum + row.amount, 0)
  let runningYes = Math.max(0, (parseFloat(currentYesPool) || 0) - totalYesAdded)
  let runningNo = Math.max(0, (parseFloat(currentNoPool) || 0) - totalNoAdded)

  const points: ChartPoint[] = []
  const initialTotal = runningYes + runningNo
  const initialYesPct = initialTotal > 0 ? Number(((runningYes / initialTotal) * 100).toFixed(4)) : 50
  const initialTs = Math.max(0, orderedRows[0].ts - 1)
  points.push({
    ts: initialTs,
    iso: safeIsoFromTs(initialTs),
    yes: initialYesPct,
    no: Number((100 - initialYesPct).toFixed(4)),
  })

  for (let index = 0; index < orderedRows.length; index += 1) {
    const row = orderedRows[index]
    if (row.choice === 1) runningYes += row.amount
    if (row.choice === 2) runningNo += row.amount
    const total = runningYes + runningNo
    const yesPct = total > 0 ? Number(((runningYes / total) * 100).toFixed(4)) : 50
    const ts = row.ts + index
    points.push({
      ts,
      iso: safeIsoFromTs(ts),
      yes: yesPct,
      no: Number((100 - yesPct).toFixed(4)),
    })
  }

  return points
}

function buildMultiActivityHistory(rows: MarketActivity[], events: SeriesEvent[]): MultiChartPoint[] {
  if (events.length === 0) return []

  const totalsByEvent = new Map<number, { yes: number; no: number }>()
  for (const event of events) {
    totalsByEvent.set(event.id, {
      yes: parseFloat(event.yesPool) || 0,
      no: Math.max(0, (parseFloat(event.totalPool) || 0) - (parseFloat(event.yesPool) || 0)),
    })
  }

  const orderedRows = rows
    .map((row) => ({
      eventId: Number(row.event_id ?? Number.NaN),
      ts: coerceTs(row.created_at),
      choice: Number(row.choice ?? 0),
      amount: parseFloat(row.amount_eth) || 0,
    }))
    .filter((row) => totalsByEvent.has(row.eventId) && (row.choice === 1 || row.choice === 2) && row.amount > 0)
    .sort((a, b) => a.ts - b.ts)

  if (orderedRows.length === 0) return []

  for (const row of orderedRows) {
    const totals = totalsByEvent.get(row.eventId)
    if (!totals) continue
    if (row.choice === 1) totals.yes = Math.max(0, totals.yes - row.amount)
    if (row.choice === 2) totals.no = Math.max(0, totals.no - row.amount)
  }

  const points: MultiChartPoint[] = []
  const initialTs = Math.max(0, orderedRows[0].ts - 1)
  const initialPoint: MultiChartPoint = { ts: initialTs, iso: safeIsoFromTs(initialTs) }
  for (const event of events) {
    const totals = totalsByEvent.get(event.id)
    const total = (totals?.yes ?? 0) + (totals?.no ?? 0)
    initialPoint[seriesKey(event.id)] = total > 0 ? Number((((totals?.yes ?? 0) / total) * 100).toFixed(4)) : 50
  }
  points.push(initialPoint)

  for (let index = 0; index < orderedRows.length; index += 1) {
    const row = orderedRows[index]
    const totals = totalsByEvent.get(row.eventId)
    if (!totals) continue
    if (row.choice === 1) totals.yes += row.amount
    if (row.choice === 2) totals.no += row.amount
    const total = totals.yes + totals.no
    const chance = total > 0 ? Number(((totals.yes / total) * 100).toFixed(4)) : 50
    const ts = row.ts + index
    points.push({
      ts,
      iso: safeIsoFromTs(ts),
      [seriesKey(row.eventId)]: chance,
    })
  }

  return points
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
  if (interval === 'all') return 60
  if (interval === '5m') return 5
  if (interval === '15m') return 15
  if (interval === '1h') return 60
  if (interval === '4h') return 180
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

  const [history, setHistory] = useState<ChartPoint[]>([])
  const [multiHistory, setMultiHistory] = useState<MultiChartPoint[]>([])
  const [activityHistory, setActivityHistory] = useState<MarketActivity[]>([])
  const [interval, setInterval] = useState<IntervalKey>('all')
  const [viewMode, setViewMode] = useState<ChartViewMode>('normal')
  const supabaseSynced = useRef(false)
  const lastSnapshotBucket = useRef<Record<string, number>>({})
  const tvContainerRef = useRef<HTMLDivElement | null>(null)
  const tvChartRef = useRef<IChartApi | null>(null)
  const tvYesSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const tvNoSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const tvMultiSeriesRef = useRef<Record<string, ISeriesApi<'Line'>>>({})
  const txHistorySyncedRef = useRef('')
  const [crosshairTime, setCrosshairTime] = useState('Latest')
  const [crosshairRows, setCrosshairRows] = useState<CrosshairRow[]>([])
  const [crosshairActive, setCrosshairActive] = useState(false)
  const [crosshairPanelPos, setCrosshairPanelPos] = useState<CrosshairPanelPos>({ left: 10, top: 10 })

  const chartHeight = viewMode === 'min' ? 130 : viewMode === 'max' ? 360 : 220

  useEffect(() => {
    setHistory([])
    setMultiHistory([])
    setActivityHistory([])
    supabaseSynced.current = false
    lastSnapshotBucket.current = {}
  }, [marketId, chartKey, eventId])

  useEffect(() => {
    if (supabaseSynced.current) return
    supabaseSynced.current = true

    void Promise.all([getOddsHistory(marketId), getActivity(marketId)]).then(([snaps, activityRows]) => {
      setActivityHistory(activityRows)

      if (isMultiSeries) {
        const validEventIds = new Set(seriesEvents.map((event) => event.id))
        const pointsByTs = new Map<number, MultiChartPoint>()
        for (const snap of snaps) {
          if (snap.event_id == null) continue
          if (!validEventIds.has(snap.event_id)) continue
          const ts = coerceTs(snap.recorded_at)
          if (!isValidTimestamp(ts)) continue
          const key = seriesKey(snap.event_id)
          const total = parseFloat(snap.total_pool)
          const chance = total > 0 ? Number(((parseFloat(snap.yes_pool) / total) * 100).toFixed(4)) : 50
          const current = pointsByTs.get(ts) ?? { ts, iso: safeIsoFromTs(ts) }
          current[key] = chance
          pointsByTs.set(ts, current)
        }

        const snapshotPoints = Array.from(pointsByTs.values()).sort((a, b) => a.ts - b.ts)
        const activityPoints = buildMultiActivityHistory(activityRows, seriesEvents)
        setMultiHistory(mergeMultiChartPoints(snapshotPoints, activityPoints))
        return
      }

      if (!snaps.length && activityRows.length === 0) return

      const strictEventSnaps = snaps.filter((snap) => (eventId === undefined ? snap.event_id == null : snap.event_id === eventId))
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

      const activityPoints = buildSingleActivityHistory(activityRows, eventId, yesPool, noPool)
      setHistory(mergeChartPoints(pts, activityPoints))
    })
  }, [chartKey, eventId, isMultiSeries, marketId, noPool, seriesEvents, yesPool])

  useEffect(() => {
    if (isMultiSeries) return
    if (activityHistory.length > 0) return
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
            return Array.from(map.values()).sort((a, b) => a.ts - b.ts).slice(-MAX_PTS)
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
  }, [activityHistory.length, chartKey, eventId, isMultiSeries, marketId, noPool, yesPool])

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
      return [...base, point].slice(-MAX_PTS)
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
      return [...prev, pt]
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_PTS)
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
    if (interval !== 'auto' && interval !== 'all') {
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

  const multiChartData = useMemo<MultiChartPoint[]>(() => {
    const ts = Date.now()
    const current: MultiChartPoint = { ts, iso: safeIsoFromTs(ts) }
    for (const entry of series) current[entry.key] = entry.chance

    if (multiHistory.length === 0) {
      const openTs = ts - 5 * 60 * 1000
      const open: MultiChartPoint = { ts: openTs, iso: safeIsoFromTs(openTs) }
      for (const entry of series) open[entry.key] = 50
      return [open, current]
    }

    const basePoints = filterPointsInWindow(multiHistory, interval, ts)
    const withCurrent = [...basePoints, current].sort((a, b) => a.ts - b.ts)
    if (withCurrent.length <= 900) return withCurrent
    return downsampleMulti(withCurrent, bucketMs)
  }, [bucketMs, interval, multiHistory, series])

  const singleTickData = useMemo<ChartPoint[]>(() => {
    if (isMultiSeries) return []

    const ts = Date.now()
    const total = parseFloat(totalPool)
    const yesPct = total > 0 ? Number(((parseFloat(yesPool) / total) * 100).toFixed(4)) : 50
    const nowPt: ChartPoint = { ts, iso: safeIsoFromTs(ts), yes: yesPct, no: Number((100 - yesPct).toFixed(4)) }
    const source = filterPointsInWindow(history, interval, ts).slice(-MAX_PTS)
    return [...source, nowPt].sort((a, b) => a.ts - b.ts)
  }, [history, interval, isMultiSeries, totalPool, yesPool])

  // Legacy candlestick pipeline is intentionally retained for future toggles.
  const candleBucketSec = useMemo(() => bucketSecFromInterval(interval, singleTickData), [interval, singleTickData])
  const singleCandleData = useMemo(() => buildCandles(singleTickData, candleBucketSec), [singleTickData, candleBucketSec])
  void singleCandleData
  const singleLineData = useMemo<ChartPoint[]>(() => {
    if (isMultiSeries) return []
    return singleTickData
  }, [isMultiSeries, singleTickData])

  const latestCrosshairRows = useMemo<CrosshairRow[]>(() => {
    if (isMultiSeries) {
      return series.map((entry) => ({
        key: entry.key,
        name: entry.name,
        color: entry.color,
        value: entry.chance,
      }))
    }
    const latest = singleLineData[singleLineData.length - 1]
    return [
      { key: 'yes', name: yesLabel, color: '#c084fc', value: latest?.yes ?? 50 },
      { key: 'no', name: noLabel, color: '#ff3366', value: latest?.no ?? 50 },
    ]
  }, [isMultiSeries, noLabel, series, singleLineData, yesLabel])

  useEffect(() => {
    if (crosshairActive) return
    setCrosshairRows(latestCrosshairRows)
    setCrosshairTime('Latest')
  }, [crosshairActive, latestCrosshairRows])

  useEffect(() => {
    const el = tvContainerRef.current
    if (!el) return

    if (tvChartRef.current) {
      tvChartRef.current.remove()
      tvChartRef.current = null
      tvYesSeriesRef.current = null
      tvNoSeriesRef.current = null
      tvMultiSeriesRef.current = {}
    }

    const chart = createChart(el, {
      height: chartHeight,
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
        secondsVisible: interval === '5m',
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

    if (isMultiSeries) {
      for (const entry of series) {
        const seriesLine = chart.addSeries(LineSeries, {
          color: entry.color,
          lineWidth: 2,
          priceLineVisible: true,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          title: entry.name,
        })
        tvMultiSeriesRef.current[entry.key] = seriesLine
      }
    } else {
      const yesSeries = chart.addSeries(LineSeries, {
        color: '#c084fc',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        title: yesLabel,
      })

      const noSeries = chart.addSeries(LineSeries, {
        color: '#ff3366',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        title: noLabel,
      })

      tvYesSeriesRef.current = yesSeries
      tvNoSeriesRef.current = noSeries
    }

    tvChartRef.current = chart

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
        tvYesSeriesRef.current = null
        tvNoSeriesRef.current = null
        tvMultiSeriesRef.current = {}
      }
    }
  }, [chartHeight, interval, isMultiSeries, noLabel, series, yesLabel])

  useEffect(() => {
    const chart = tvChartRef.current
    if (!chart) return

    if (isMultiSeries) {
      for (const entry of series) {
        const lineSeries = tvMultiSeriesRef.current[entry.key]
        if (!lineSeries) continue
        let lastValue = 50
        const lineData: LineData<UTCTimestamp>[] = multiChartData.map((point) => {
          const raw = Number(point[entry.key])
          if (Number.isFinite(raw)) lastValue = raw
          return {
            time: Math.floor(point.ts / 1000) as UTCTimestamp,
            value: lastValue,
          }
        })
        lineSeries.setData(toStrictAscLineData(lineData))
      }
    } else {
      const yesSeries = tvYesSeriesRef.current
      const noSeries = tvNoSeriesRef.current
      if (!yesSeries || !noSeries) return

      const yesData: LineData<UTCTimestamp>[] = singleLineData.map((point) => ({
        time: Math.floor(point.ts / 1000) as UTCTimestamp,
        value: point.yes,
      }))
      const noData: LineData<UTCTimestamp>[] = singleLineData.map((point) => ({
        time: Math.floor(point.ts / 1000) as UTCTimestamp,
        value: point.no,
      }))

      yesSeries.setData(toStrictAscLineData(yesData))
      noSeries.setData(toStrictAscLineData(noData))
    }

    chart.applyOptions({
      height: chartHeight,
      timeScale: { secondsVisible: interval === '5m' },
    })
    chart.timeScale().fitContent()
  }, [chartHeight, interval, isMultiSeries, multiChartData, series, singleLineData])

  useEffect(() => {
    const chart = tvChartRef.current
    if (!chart) return

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      const outside = !param.point || !param.time
      if (outside) {
        setCrosshairActive(false)
        setCrosshairRows(latestCrosshairRows)
        setCrosshairTime('Latest')
        setCrosshairPanelPos({ left: 10, top: 10 })
        return
      }

      const point = param.point!

      const containerWidth = tvContainerRef.current?.clientWidth ?? 0
      const panelWidth = 190
      const spacing = 12
      const preferredLeft = point.x + spacing
      const nextLeft = preferredLeft + panelWidth > containerWidth
        ? Math.max(10, point.x - panelWidth - spacing)
        : Math.max(10, preferredLeft)
      const nextTop = Math.max(10, Math.min(point.y + spacing, chartHeight - 92))
      setCrosshairPanelPos({ left: nextLeft, top: nextTop })

      if (isMultiSeries) {
        const rows = series.map((entry) => {
          const line = tvMultiSeriesRef.current[entry.key]
          const raw = line ? pointFromSeriesMap(param.seriesData.get(line)) : null
          return {
            key: entry.key,
            name: entry.name,
            color: entry.color,
            value: raw ?? entry.chance,
          }
        })
        setCrosshairRows(rows)
      } else {
        const yesLine = tvYesSeriesRef.current
        const noLine = tvNoSeriesRef.current
        const yesRaw = yesLine ? pointFromSeriesMap(param.seriesData.get(yesLine)) : null
        const noRaw = noLine ? pointFromSeriesMap(param.seriesData.get(noLine)) : null
        const latest = singleLineData[singleLineData.length - 1]
        setCrosshairRows([
          { key: 'yes', name: yesLabel, color: '#c084fc', value: yesRaw ?? latest?.yes ?? 50 },
          { key: 'no', name: noLabel, color: '#ff3366', value: noRaw ?? latest?.no ?? 50 },
        ])
      }

      setCrosshairActive(true)
      setCrosshairTime(formatCrosshairTime(param.time))
    }

    chart.subscribeCrosshairMove(onCrosshairMove)
    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove)
    }
  }, [chartHeight, isMultiSeries, latestCrosshairRows, noLabel, series, singleLineData, yesLabel])

  return (
    <div className={styles.wrapper}>
      <div className={styles.watermark} aria-hidden>predictwin.fun</div>
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
          <div className={styles.viewPills}>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === 'min' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('min')}
              aria-label="Minimize chart"
            >
              Min
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === 'normal' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('normal')}
              aria-label="Normal chart size"
            >
              Mid
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === 'max' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('max')}
              aria-label="Maximize chart"
            >
              Max
            </button>
          </div>
        </div>
        {!isMultiSeries && <span className={styles.modeBadge}>Line View</span>}
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

      <div className={styles.tvChartWrap} style={{ height: chartHeight }}>
        <div ref={tvContainerRef} className={styles.tvChart} />
        <div
          className={styles.crosshairPanel}
          aria-live="polite"
          style={{ left: crosshairPanelPos.left, top: crosshairPanelPos.top }}
        >
          <p className={styles.crosshairTime}>{crosshairActive ? crosshairTime : 'Latest'}</p>
          {crosshairRows.map((row) => (
            <p key={row.key} className={styles.crosshairRow} style={{ color: row.color }}>
              {row.name} {row.value.toFixed(2)}%
            </p>
          ))}
        </div>
        {((isMultiSeries && multiChartData.length === 0) || (!isMultiSeries && singleLineData.length === 0)) && (
          <div className={styles.tvEmpty}>Waiting for transaction activity...</div>
        )}
      </div>
    </div>
  )
}
