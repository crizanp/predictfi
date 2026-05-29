'use client'

import { useMemo } from 'react'
import {
  RiArrowUpLine,
  RiArrowDownLine,
  RiCheckDoubleLine,
  RiAddCircleLine,
  RiHistoryLine,
} from 'react-icons/ri'
import { useMarkets } from '../../context/MarketsContext'
import { useWallet } from '../../context/WalletContext'
import styles from './page.module.css'

type EventType = 'buy' | 'sell' | 'resolve' | 'create' | 'claim'

interface ActivityEvent {
  id: string
  type: EventType
  title: string
  desc: string
  time: string
  amount?: string
  accent: string
}

const ADDRESSES = ['0xaBc1…4F2d', '0xDef2…9C1a', '0x7c3D…E81f', '0xBee5…3A2b', '0xC0de…F9e3']

function randomAddr() {
  return ADDRESSES[Math.floor(Math.random() * ADDRESSES.length)]
}

function timeAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function ActivityPage() {
  const { markets, userPredictions } = useMarkets()
  const { account } = useWallet()

  const events = useMemo<ActivityEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000)
    const list: ActivityEvent[] = []

    // User's own trades
    Object.entries(userPredictions).forEach(([idStr, pred]) => {
      const id = Number(idStr)
      const market = markets.find((m) => m.id === id)
      if (!market) return
      const side = pred.choice === 1 ? 'YES' : 'NO'
      const shortQ = market.question.length > 44 ? market.question.slice(0, 44) + '…' : market.question
      const offset = Math.floor(Math.random() * 3600)

      if (pred.claimed) {
        list.push({
          id: `claim-${id}`,
          type: 'claim',
          title: 'Winnings Claimed',
          desc: `You claimed winnings from "${shortQ}"`,
          time: timeAgo(offset + 120),
          amount: pred.amount,
          accent: '#f59e0b',
        })
      }
      list.push({
        id: `pred-${id}`,
        type: pred.choice === 1 ? 'buy' : 'sell',
        title: `Voted ${side}`,
        desc: `You staked ${pred.amount} tBNB on ${side} — "${shortQ}"`,
        time: timeAgo(offset),
        amount: pred.amount,
        accent: pred.choice === 1 ? '#00ff88' : '#ff3366',
      })
    })

    // Market resolutions
    markets
      .filter((m) => m.resolved)
      .slice(0, 5)
      .forEach((m) => {
        const resultLabel = m.result === 1 ? 'YES' : 'NO'
        const shortQ = m.question.length > 44 ? m.question.slice(0, 44) + '…' : m.question
        list.push({
          id: `resolve-${m.id}`,
          type: 'resolve',
          title: 'Market Resolved',
          desc: `"${shortQ}" resolved as ${resultLabel}`,
          time: timeAgo(Math.floor(Math.random() * 86400) + 3600),
          accent: '#a855f7',
        })
      })

    // Market creations (recent markets)
    markets
      .slice(-5)
      .reverse()
      .forEach((m) => {
        const shortQ = m.question.length > 44 ? m.question.slice(0, 44) + '…' : m.question
        list.push({
          id: `create-${m.id}`,
          type: 'create',
          title: 'New Market Created',
          desc: `"${shortQ}"`,
          time: timeAgo(Math.floor(Math.random() * 172800) + 7200),
          accent: '#3b82f6',
        })
      })

    // Dummy global activity
    markets.slice(0, 8).forEach((m, i) => {
      const side = i % 2 === 0 ? 'YES' : 'NO'
      const shortQ = m.question.length > 44 ? m.question.slice(0, 44) + '…' : m.question
      const amt = (Math.random() * 0.2 + 0.01).toFixed(3)
      list.push({
        id: `dummy-${m.id}-${i}`,
        type: i % 2 === 0 ? 'buy' : 'sell',
        title: `${randomAddr()} voted ${side}`,
        desc: `Staked ${amt} tBNB on ${side} — "${shortQ}"`,
        time: timeAgo(Math.floor(Math.random() * 7200) + 60),
        amount: amt,
        accent: i % 2 === 0 ? '#00ff88' : '#ff3366',
      })
    })

    return list.sort(() => Math.random() - 0.5).slice(0, 24)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, userPredictions])

  const Icon = ({ type }: { type: EventType }) => {
    if (type === 'buy')     return <RiArrowUpLine />
    if (type === 'sell')    return <RiArrowDownLine />
    if (type === 'resolve') return <RiCheckDoubleLine />
    if (type === 'create')  return <RiAddCircleLine />
    return <RiHistoryLine />
  }

  return (
    <div className={styles.page}>

      {/* ── Header ────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Activity</h1>
          <p className={styles.pageSub}>Live feed of market activity across predictwin</p>
        </div>
        <div className={styles.liveChip}>
          <span className={styles.liveDot} /> LIVE
        </div>
      </div>

      {/* ── Timeline ──────────────────────────────────── */}
      {events.length === 0 ? (
        <div className={styles.emptyState}>
          <RiHistoryLine className={styles.emptyIcon} />
          <h2 className={styles.emptyTitle}>No Activity Yet</h2>
          <p className={styles.emptySub}>Activity will appear here as markets are created and traded</p>
        </div>
      ) : (
        <div className={styles.timeline}>
          {events.map((ev) => (
            <div key={ev.id} className={styles.event}>
              <div className={styles.eventLeft}>
                <div
                  className={styles.eventIcon}
                  style={{ color: ev.accent, background: `${ev.accent}18`, border: `1px solid ${ev.accent}30` }}
                >
                  <Icon type={ev.type} />
                </div>
                <div className={styles.connector} />
              </div>
              <div className={styles.eventBody}>
                <div className={styles.eventTop}>
                  <span className={styles.eventTitle}>{ev.title}</span>
                  <span className={styles.eventTime}>{ev.time}</span>
                </div>
                <p className={styles.eventDesc}>{ev.desc}</p>
                {ev.amount && (
                  <span
                    className={styles.eventAmount}
                    style={{ color: ev.accent, background: `${ev.accent}12`, border: `1px solid ${ev.accent}25` }}
                  >
                    {ev.type === 'buy' || ev.type === 'sell' ? '+' : ''}{ev.amount} tBNB
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
