'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { getOddsHistory, recordOddsSnapshot, type OddsSnapshot } from '../lib/supabase'
import styles from './OddsChart.module.css'

interface Props {
  marketId: number
  yesPool: string
  noPool: string
  totalPool: string
  resolved: boolean
}

interface ChartPoint {
  time: string
  yes: number
  no: number
}

function toChartPoint(snap: OddsSnapshot): ChartPoint {
  const total = parseFloat(snap.total_pool)
  const yes = parseFloat(snap.yes_pool)
  const yesPct = total > 0 ? Math.round((yes / total) * 100) : 50
  return {
    time: new Date(snap.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    yes: yesPct,
    no: 100 - yesPct,
  }
}

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

export default function OddsChart({ marketId, yesPool, noPool, totalPool, resolved }: Props) {
  const [history, setHistory] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)
  const snapshotRecorded = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)

      // Record current snapshot once (skip if resolved — no new activity expected)
      if (!snapshotRecorded.current && !resolved && parseFloat(totalPool) > 0) {
        snapshotRecorded.current = true
        void recordOddsSnapshot({ market_id: marketId, yes_pool: yesPool, no_pool: noPool, total_pool: totalPool })
      }

      const snaps = await getOddsHistory(marketId)
      if (!cancelled) {
        setHistory(snaps.map(toChartPoint))
        setLoading(false)
      }
    }

    void init()
    return () => { cancelled = true }
  }, [marketId, yesPool, noPool, totalPool, resolved])

  // Also add a synthetic "now" point from live props so chart always shows current state
  const chartData = useMemo(() => {
    const total = parseFloat(totalPool)
    const yes = parseFloat(yesPool)
    const yesPct = total > 0 ? Math.round((yes / total) * 100) : 50
    const now: ChartPoint = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      yes: yesPct,
      no: 100 - yesPct,
    }

    // Deduplicate last point if same time as now
    const base = history.filter((p) => p.time !== now.time)
    return [...base, now]
  }, [history, yesPool, totalPool])

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h3 className={styles.title}>Odds History</h3>
        <div className={styles.legend}>
          <span className={styles.legendYes}><span className={styles.dot} style={{ background: '#22c55e' }} />YES</span>
          <span className={styles.legendNo}><span className={styles.dot} style={{ background: '#ef4444' }} />NO</span>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading chart...</div>
      ) : chartData.length < 2 ? (
        <div className={styles.empty}>Not enough data yet — chart fills as predictions are placed.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradYes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradNo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="time" tick={{ fill: '#9880c8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#9880c8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ display: 'none' }} />
            <Area type="monotone" dataKey="yes" stroke="#22c55e" strokeWidth={2} fill="url(#gradYes)" dot={false} activeDot={{ r: 4, fill: '#22c55e' }} />
            <Area type="monotone" dataKey="no" stroke="#ef4444" strokeWidth={2} fill="url(#gradNo)" dot={false} activeDot={{ r: 4, fill: '#ef4444' }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
