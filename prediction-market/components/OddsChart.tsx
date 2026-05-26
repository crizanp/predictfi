'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
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
  time: string
  yes: number
  no: number
}

type MultiChartPoint = { time: string } & Record<string, number | string>

const LS_KEY = (id: number, chartKey?: string) => `pf_odds_${id}_${chartKey ?? 'default'}`
const MAX_PTS = 120
const LINE_COLORS = ['#7c5cff', '#ffad66', '#ff72b6', '#4da3ff', '#38d39f', '#f97316', '#eab308', '#22d3ee']

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

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  const supabaseSynced = useRef(false)
  const snapshotSent = useRef(false)

  useEffect(() => {
    if (isMultiSeries) {
      setMultiHistory(loadLocal<MultiChartPoint>(marketId, chartKey))
    } else {
      setHistory(loadLocal<ChartPoint>(marketId, chartKey))
    }
    supabaseSynced.current = false
    snapshotSent.current = false
  }, [isMultiSeries, marketId, chartKey])

  useEffect(() => {
    if (isMultiSeries || supabaseSynced.current) return
    supabaseSynced.current = true

    void getOddsHistory(marketId, eventId).then((snaps) => {
      if (!snaps.length) return

      const pts: ChartPoint[] = snaps.map((s) => {
        const total = parseFloat(s.total_pool)
        const yesPct = total > 0 ? Math.round((parseFloat(s.yes_pool) / total) * 100) : 50
        return {
          time: new Date(s.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          yes: yesPct,
          no: 100 - yesPct,
        }
      })

      setHistory((prev) => {
        const seen = new Set<string>()
        const merged = [...pts, ...prev].filter((p) => {
          if (seen.has(p.time)) return false
          seen.add(p.time)
          return true
        })
        saveLocal(marketId, merged, chartKey)
        return merged
      })
    })
  }, [isMultiSeries, marketId, eventId, chartKey])

  useEffect(() => {
    if (!isMultiSeries) return

    const now = nowLabel()
    const point: MultiChartPoint = { time: now }
    for (const seriesEvent of seriesEvents) {
      point[seriesKey(seriesEvent.id)] = toChance(seriesEvent.yesPool, seriesEvent.totalPool)
    }

    setMultiHistory((prev) => {
      const last = prev[prev.length - 1]
      const sameTime = last && last.time === now
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
    if (isMultiSeries) return

    const total = parseFloat(totalPool)
    if (total <= 0) return

    const yesPct = Math.round((parseFloat(yesPool) / total) * 100)
    const now = nowLabel()
    const pt: ChartPoint = { time: now, yes: yesPct, no: 100 - yesPct }

    setHistory((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.time === now && last.yes === yesPct) return prev
      const updated = [...prev, pt].slice(-MAX_PTS)
      saveLocal(marketId, updated, chartKey)
      return updated
    })

    if (!snapshotSent.current && !resolved) {
      snapshotSent.current = true
      void recordOddsSnapshot({
        market_id: marketId,
        event_id: eventId,
        yes_pool: yesPool,
        no_pool: noPool,
        total_pool: totalPool,
      })
    }
  }, [isMultiSeries, marketId, eventId, chartKey, yesPool, noPool, totalPool, resolved])

  const singleChartData = useMemo(() => {
    const total = parseFloat(totalPool)
    const yesPct = total > 0 ? Math.round((parseFloat(yesPool) / total) * 100) : 50
    const now = nowLabel()
    const nowPt: ChartPoint = { time: now, yes: yesPct, no: 100 - yesPct }

    if (history.length === 0) return [{ time: 'Open', yes: 50, no: 50 }, nowPt]

    const base = history.filter((p) => p.time !== now)
    return [...base, nowPt]
  }, [history, yesPool, totalPool])

  const series = useMemo(() =>
    seriesEvents.map((seriesEvent, index) => ({
      key: seriesKey(seriesEvent.id),
      name: seriesEvent.name,
      color: LINE_COLORS[index % LINE_COLORS.length],
      chance: toChance(seriesEvent.yesPool, seriesEvent.totalPool),
    })),
  [seriesEvents])

  const multiChartData = useMemo(() => {
    const now = nowLabel()
    const current: MultiChartPoint = { time: now }
    for (const entry of series) current[entry.key] = entry.chance

    if (multiHistory.length === 0) {
      const open: MultiChartPoint = { time: 'Open' }
      for (const entry of series) open[entry.key] = 50
      return [open, current]
    }

    const base = multiHistory.filter((point) => point.time !== now)
    return [...base, current]
  }, [multiHistory, series])

  return (
    <div className={styles.wrapper}>
      <div className={styles.watermark} aria-hidden>predictfi.fun</div>
      <div className={styles.header}>
        <h3 className={styles.title}>{isMultiSeries ? 'Events Odds History' : 'Odds History'}</h3>
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
          <LineChart data={multiChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="time" tick={{ fill: '#5a7a63', fontSize: 11 }} axisLine={false} tickLine={false} />
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
          </LineChart>
        ) : (
          <AreaChart data={singleChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
            <XAxis dataKey="time" tick={{ fill: '#5a7a63', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#5a7a63', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<SingleTooltip yesLabel={yesLabel} noLabel={noLabel} />} />
            <Legend wrapperStyle={{ display: 'none' }} />
            <Area type="monotone" dataKey="yes" stroke="#00ff88" strokeWidth={2.5} fill="url(#gradYes)" dot={false} activeDot={{ r: 5, fill: '#00ff88', stroke: 'rgba(0,255,136,0.4)', strokeWidth: 4 }} />
            <Area type="monotone" dataKey="no" stroke="#ff3366" strokeWidth={2.5} fill="url(#gradNo)" dot={false} activeDot={{ r: 5, fill: '#ff3366', stroke: 'rgba(255,51,102,0.4)', strokeWidth: 4 }} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
