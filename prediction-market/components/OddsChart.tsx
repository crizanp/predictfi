'use client'

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
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
import { getOddsHistory, recordOddsSnapshot } from '../lib/supabase'
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

function downsampleSingle(points: ChartPoint[], bucketMs: number): ChartPoint[] {
  if (!Number.isFinite(bucketMs) || bucketMs <= 0) return []
  const map = new Map<number, ChartPoint>()
  for (const point of points) {
    if (!isValidTimestamp(point.ts)) continue
    const bucket = Math.floor(point.ts / bucketMs) * bucketMs
    if (!isValidTimestamp(bucket)) continue
    map.set(bucket, { ...point, ts: bucket, iso: safeIsoFromTs(bucket) })
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts)
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
  return Math.round((yes / total) * 100)
}

function seriesKey(eventId: number): string {
  return `event_${eventId}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SingleTooltip = ({ active, payload, label, yesLabel, noLabel }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTime}>{label}</p>
      <p className={styles.tooltipYes}>{yesLabel ?? 'YES'} {payload[0]?.value}%</p>
      <p className={styles.tooltipNo}>{noLabel ?? 'NO'} {payload[1]?.value}%</p>
    </div>
  )
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

      const pts: ChartPoint[] = snaps
        .filter((snap) => (eventId === undefined ? !snap.event_id : snap.event_id === eventId))
        .map((snap) => {
          const total = parseFloat(snap.total_pool)
          const yesPct = total > 0 ? Math.round((parseFloat(snap.yes_pool) / total) * 100) : 50
          const ts = coerceTs(snap.recorded_at)
          return {
            ts,
            iso: safeIsoFromTs(ts),
            yes: yesPct,
            no: 100 - yesPct,
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

    const yesPct = Math.round((parseFloat(yesPool) / total) * 100)
    const ts = Date.now()
    const pt: ChartPoint = { ts, iso: safeIsoFromTs(ts), yes: yesPct, no: 100 - yesPct }

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
    const sourceLen = isMultiSeries ? multiHistory.length : history.length
    const source = isMultiSeries ? multiHistory : history
    const spanMs = sourceLen > 1 ? source[sourceLen - 1].ts - source[0].ts : 0
    if (interval !== 'auto') {
      return INTERVAL_OPTIONS.find((item) => item.key === interval)?.ms ?? 5 * 60 * 1000
    }
    return autoBucketMs(sourceLen, spanMs)
  }, [history, interval, isMultiSeries, multiHistory])

  const singleChartData = useMemo<RenderPoint[]>(() => {
    const total = parseFloat(totalPool)
    const yesPct = total > 0 ? Math.round((parseFloat(yesPool) / total) * 100) : 50
    const ts = Date.now()
    const nowPt: ChartPoint = { ts, iso: safeIsoFromTs(ts), yes: yesPct, no: 100 - yesPct }

    if (history.length === 0) {
      const openTs = ts - 5 * 60 * 1000
      return [
        { ts: openTs, time: 'Open', yes: 50, no: 50 },
        { ts: nowPt.ts, time: formatTick(nowPt.ts, 5 * 60 * 1000), yes: nowPt.yes, no: nowPt.no },
      ]
    }

    const slicedByInterval = (() => {
      if (interval === 'auto') return history
      const ms = INTERVAL_OPTIONS.find((item) => item.key === interval)?.ms
      if (!ms) return history
      const minTs = ts - ms
      return history.filter((point) => point.ts >= minTs)
    })()

    const basePoints = slicedByInterval.length ? slicedByInterval : history
    const withCurrent = [...basePoints, nowPt].sort((a, b) => a.ts - b.ts)
    const sampled = downsampleSingle(withCurrent, bucketMs)
    const spanMs = sampled.length > 1 ? sampled[sampled.length - 1].ts - sampled[0].ts : 5 * 60 * 1000

    return sampled.map((point) => ({
      ts: point.ts,
      time: formatTick(point.ts, spanMs),
      yes: point.yes,
      no: point.no,
    }))
  }, [bucketMs, history, interval, totalPool, yesPool])

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
        { ts: open.ts, time: 'Open', ...open },
        { ts: current.ts, time: formatTick(current.ts, 5 * 60 * 1000), ...current },
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

  const renderData = isMultiSeries ? multiChartData : singleChartData

  useEffect(() => {
    if (renderData.length === 0) {
      setWindowStartIndex(0)
      setWindowEndIndex(0)
      return
    }
    const span = Math.max(10, Math.floor(renderData.length * 0.35))
    setWindowEndIndex(renderData.length - 1)
    setWindowStartIndex(Math.max(0, renderData.length - span))
  }, [interval, isMultiSeries, renderData.length])

  const hasBrush = renderData.length > 30
  const safeStart = Math.min(windowStartIndex, Math.max(0, renderData.length - 1))
  const safeEnd = Math.max(safeStart, Math.min(windowEndIndex, Math.max(0, renderData.length - 1)))

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

      <ResponsiveContainer width="100%" height={220}>
        {isMultiSeries ? (
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
        ) : (
          <AreaChart data={renderData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradYes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradNo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff3366" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff3366" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Area type="monotone" dataKey="yes" stroke="#00ff88" strokeWidth={2.5} fill="url(#gradYes)" dot={false} activeDot={{ r: 5, fill: '#00ff88', stroke: 'rgba(0,255,136,0.4)', strokeWidth: 4 }} />
            <Area type="monotone" dataKey="no" stroke="#ff3366" strokeWidth={2.5} fill="url(#gradNo)" dot={false} activeDot={{ r: 5, fill: '#ff3366', stroke: 'rgba(255,51,102,0.4)', strokeWidth: 4 }} />
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
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
