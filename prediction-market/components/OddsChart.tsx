'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { getOddsHistory, recordOddsSnapshot } from '../lib/supabase'
import styles from './OddsChart.module.css'

interface Props {
  marketId: number
  yesPool: string
  noPool: string
  totalPool: string
  resolved: boolean
  yesLabel?: string
  noLabel?: string
}

interface ChartPoint {
  time: string
  yes: number
  no: number
}

// â”€â”€ localStorage helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LS_KEY = (id: number) => `pf_odds_${id}`
const MAX_PTS = 120

function loadLocal(id: number): ChartPoint[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_KEY(id)) ?? '[]') } catch { return [] }
}

function saveLocal(id: number, pts: ChartPoint[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LS_KEY(id), JSON.stringify(pts.slice(-MAX_PTS))) } catch {}
}

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// â”€â”€ Tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTime}>{label}</p>
      <p className={styles.tooltipYes}>YES {payload[0]?.value}%</p>
      <p className={styles.tooltipNo}>NO {payload[1]?.value}%</p>
    </div>
  )
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function OddsChart({ marketId, yesPool, noPool, totalPool, resolved, yesLabel = 'YES', noLabel = 'NO' }: Props) {
  const [history, setHistory] = useState<ChartPoint[]>(() => loadLocal(marketId))
  const supabaseSynced = useRef(false)
  const snapshotSent = useRef(false)

  // Merge Supabase history once on mount
  useEffect(() => {
    if (supabaseSynced.current) return
    supabaseSynced.current = true
    void getOddsHistory(marketId).then((snaps) => {
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
        saveLocal(marketId, merged)
        return merged
      })
    })
  }, [marketId])

  // Record a snapshot whenever pool values change
  useEffect(() => {
    const total = parseFloat(totalPool)
    if (total <= 0) return
    const yesPct = Math.round((parseFloat(yesPool) / total) * 100)
    const now = nowLabel()
    const pt: ChartPoint = { time: now, yes: yesPct, no: 100 - yesPct }

    setHistory((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.time === now && last.yes === yesPct) return prev
      const updated = [...prev, pt].slice(-MAX_PTS)
      saveLocal(marketId, updated)
      return updated
    })

    if (!snapshotSent.current && !resolved) {
      snapshotSent.current = true
      void recordOddsSnapshot({ market_id: marketId, yes_pool: yesPool, no_pool: noPool, total_pool: totalPool })
    }
  }, [marketId, yesPool, noPool, totalPool, resolved])

  // Build chart data â€” always at least 2 points so chart renders
  const chartData = useMemo(() => {
    const total = parseFloat(totalPool)
    const yesPct = total > 0 ? Math.round((parseFloat(yesPool) / total) * 100) : 50
    const now = nowLabel()
    const nowPt: ChartPoint = { time: now, yes: yesPct, no: 100 - yesPct }

    if (history.length === 0) {
      // No history yet â€” show opening 50/50 and current state
      return [{ time: 'Open', yes: 50, no: 50 }, nowPt]
    }

    const base = history.filter((p) => p.time !== now)
    return [...base, nowPt]
  }, [history, yesPool, totalPool])

  return (
    <div className={styles.wrapper}>
      <div className={styles.watermark} aria-hidden>predictfi.fun</div>
      <div className={styles.header}>
        <h3 className={styles.title}>Odds History</h3>
        <div className={styles.legend}>
          <span className={styles.legendYes}><span className={styles.dot} style={{ background: '#c084fc' }} />{yesLabel}</span>
          <span className={styles.legendNo}><span className={styles.dot} style={{ background: '#ff3366' }} />{noLabel}</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ display: 'none' }} />
          <Area type="monotone" dataKey="yes" stroke="#00ff88" strokeWidth={2.5} fill="url(#gradYes)" dot={false} activeDot={{ r: 5, fill: '#00ff88', stroke: 'rgba(0,255,136,0.4)', strokeWidth: 4 }} />
          <Area type="monotone" dataKey="no" stroke="#ff3366" strokeWidth={2.5} fill="url(#gradNo)" dot={false} activeDot={{ r: 5, fill: '#ff3366', stroke: 'rgba(255,51,102,0.4)', strokeWidth: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

