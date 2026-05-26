'use client'

import { useEffect, useRef, useState } from 'react'
import { useMarkets } from '../context/MarketsContext'
import styles from './CornerNotifications.module.css'

interface Notif {
  id: number
  text: string
  leaving: boolean
}

const DUMMY_ADDRS = ['0xaB1c', '0xDe2f', '0x8A4e', '0xFe3d', '0x9C5b', '0x7D6a', '0xBe4c', '0xC0d5']
const ACTIONS = ['bought YES', 'bought NO', 'claimed reward', 'joined market']

function makeNotif(markets: { question: string }[], counter: number): string {
  if (markets.length === 0) {
    const snippets = [
      '0xaB1c bought YES on "BTC hits $120K" +0.05 tBNB',
      '0xDe2f joined market "ETH flips BTC?"',
      '0x8A4e claimed reward +0.12 tBNB',
    ]
    return snippets[counter % snippets.length]
  }
  const addr = DUMMY_ADDRS[Math.floor(Math.random() * DUMMY_ADDRS.length)]
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)]
  const m = markets[Math.floor(Math.random() * markets.length)]
  const q = m.question.length > 34 ? m.question.slice(0, 34) + '…' : m.question
  const amt = (Math.random() * 0.18 + 0.01).toFixed(3)
  return `${addr} ${action} on "${q}"${action.includes('bought') ? ` +${amt} tBNB` : ''}`
}

let notifCounter = 0

export default function CornerNotifications() {
  const { markets } = useMarkets()
  const marketsRef = useRef(markets)
  useEffect(() => { marketsRef.current = markets }, [markets])

  const [queue, setQueue] = useState<Notif[]>([])
  const [atTop, setAtTop] = useState(true)
  const counterRef = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      setAtTop(window.scrollY < 40)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const show = () => {
      counterRef.current += 1
      const id = ++notifCounter
      const text = makeNotif(marketsRef.current, counterRef.current)
      // add notification
      setQueue((prev) => [...prev, { id, text, leaving: false }])
      // mark as leaving after 2s
      setTimeout(() => {
        setQueue((prev) => prev.map((n) => n.id === id ? { ...n, leaving: true } : n))
      }, 2000)
      // remove after exit animation
      setTimeout(() => {
        setQueue((prev) => prev.filter((n) => n.id !== id))
      }, 2600)
    }

    // First notification after 1.5s, then every 4s
    const first = setTimeout(show, 1500)
    const interval = setInterval(show, 4000)
    return () => { clearTimeout(first); clearInterval(interval) }
  }, [])

  if (queue.length === 0) return null

  return (
    <div
      className={`${styles.container} ${atTop ? styles.atTop : styles.scrolled}`}
      aria-live="polite"
      aria-label="Live activity"
    >
      {queue.map((n) => (
        <div
          key={n.id}
          className={`${styles.notif} ${n.leaving ? styles.leaving : styles.entering}`}
        >
          <span className={styles.dot} />
          <span className={styles.text}>{n.text}</span>
        </div>
      ))}
    </div>
  )
}
