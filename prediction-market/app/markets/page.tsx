'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMarkets } from '../../context/MarketsContext'
import { getMarketCategory } from '../../lib/utils'
import MarketCard from '../../components/MarketCard'
import styles from './page.module.css'

const CATEGORIES = ['All', 'Crypto', 'Sports', 'Politics', 'Finance', 'Tech', 'Science', 'Entertainment', 'Other']
const STATUSES   = ['All', 'Live', 'Ended', 'Resolved']
const SORTS = [
  { label: 'Highest Volume', value: 'vol-desc' },
  { label: 'Lowest Volume',  value: 'vol-asc' },
  { label: 'Newest First',   value: 'newest' },
  { label: 'Ending Soon',    value: 'ending' },
  { label: 'Most YES %',     value: 'yes-desc' },
  { label: 'Most NO %',      value: 'no-desc' },
]

type SortKey = typeof SORTS[number]['value']

export default function MarketsPage() {
  const { markets, isLoadingMarkets, hasLoadedMarkets } = useMarkets()
  const [nowInSeconds, setNowInSeconds] = useState(() => Math.floor(Date.now() / 1000))
  const [search, setSearch]             = useState('')
  const [category, setCategory]         = useState('All')
  const [status, setStatus]             = useState('All')
  const [sort, setSort]                 = useState<SortKey>('newest')
  const [minYes, setMinYes]             = useState(0)
  const [maxYes, setMaxYes]             = useState(100)
  const [minVol, setMinVol]             = useState('')
  const [page, setPage]                 = useState(1)
  const PAGE_SIZE = 12

  useEffect(() => {
    const id = setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, category, status, sort, minVol, minYes, maxYes])

  const liveCount     = useMemo(() => markets.filter(m => !m.resolved && (nowInSeconds <= 0 || m.endTime > nowInSeconds)).length, [markets, nowInSeconds])
  const resolvedCount = useMemo(() => markets.filter(m => m.resolved).length, [markets])
  const endedCount    = useMemo(() => markets.filter(m => !m.resolved && nowInSeconds > 0 && m.endTime <= nowInSeconds).length, [markets, nowInSeconds])

  const filtered = useMemo(() => {
    const q     = search.trim().toLowerCase()
    const minV  = parseFloat(minVol) || 0

    return markets.filter(m => {
      const cat    = getMarketCategory(m.id, m.question)
      const isLive = !m.resolved && (nowInSeconds <= 0 || m.endTime > nowInSeconds)
      const isEnd  = !m.resolved && nowInSeconds > 0 && m.endTime <= nowInSeconds
      const total  = parseFloat(m.totalPool) || 0
      const yesP   = parseFloat(m.yesPool)   || 0
      const noP    = parseFloat(m.noPool)     || 0
      const yesOdds = total > 0 ? (yesP / total) * 100 : 50

      if (q && !m.question.toLowerCase().includes(q)) return false
      if (category !== 'All' && cat !== category) return false
      if (status === 'Live'     && !isLive)      return false
      if (status === 'Ended'    && !isEnd)        return false
      if (status === 'Resolved' && !m.resolved)  return false
      if (total < minV)                           return false
      if (yesOdds < minYes || yesOdds > maxYes)  return false
      return true
    })
  }, [markets, search, category, status, sort, minVol, minYes, maxYes, nowInSeconds])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const volA = parseFloat(a.totalPool) || 0
      const volB = parseFloat(b.totalPool) || 0
      const yesA = volA > 0 ? (parseFloat(a.yesPool) / volA) * 100 : 50
      const yesB = volB > 0 ? (parseFloat(b.yesPool) / volB) * 100 : 50
      if (sort === 'vol-desc')  return volB - volA
      if (sort === 'vol-asc')   return volA - volB
      if (sort === 'newest')    return b.id - a.id
      if (sort === 'ending')    return a.endTime - b.endTime
      if (sort === 'yes-desc')  return yesB - yesA
      if (sort === 'no-desc')   return (100 - yesB) - (100 - yesA)
      return 0
    })
  }, [filtered, sort])

  const totalVol = useMemo(() =>
    markets.reduce((s, m) => s + (parseFloat(m.totalPool) || 0), 0).toFixed(2),
    [markets]
  )

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paginated  = useMemo(() => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sorted, page])

  return (
    <div className={styles.page}>

      {/* ── Page header ───────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>All Markets</h1>
          <p className={styles.pageSub}>Browse, filter and trade on all prediction markets</p>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.hStat}>
            <span className={styles.hStatNum}>{markets.length}</span>
            <span className={styles.hStatLabel}>Total</span>
          </div>
          <div className={styles.hStat}>
            <span className={styles.hStatNum} style={{ color: '#00ff88' }}>{liveCount}</span>
            <span className={styles.hStatLabel}>Live</span>
          </div>
          <div className={styles.hStat}>
            <span className={styles.hStatNum}>{resolvedCount}</span>
            <span className={styles.hStatLabel}>Resolved</span>
          </div>
          <div className={styles.hStat}>
            <span className={styles.hStatNum}>{totalVol}</span>
            <span className={styles.hStatLabel}>tBNB vol</span>
          </div>
        </div>
      </div>

      {/* ── Horizontal filter bar ─────────────────────── */}
      <div className={styles.filterBar}>

        {/* Row 1: search + sort + reset */}
        <div className={styles.filterRow}>
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Search markets…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button className={styles.clearBtn} onClick={() => setSearch('')}>✕</button>}
          </div>

          <div className={styles.statusChips}>
            {STATUSES.map(s => (
              <button
                key={s}
                className={`${styles.chip} ${status === s ? styles.chipActive : ''}`}
                onClick={() => setStatus(s)}
              >
                {s === 'Live' && <span className={styles.liveDot} />}
                {s}
              </button>
            ))}
          </div>

          <select
            className={styles.sortSelect}
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
          >
            {SORTS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <div className={styles.volWrap}>
            <span className={styles.volLabel}>Min Vol</span>
            <input
              className={styles.volInput}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={minVol}
              onChange={e => setMinVol(e.target.value)}
            />
          </div>

          <button
            className={styles.resetBtn}
            onClick={() => {
              setSearch('')
              setCategory('All')
              setStatus('All')
              setSort('vol-desc')
              setMinVol('')
              setMinYes(0)
              setMaxYes(100)
            }}
          >
            Reset
          </button>
        </div>

        {/* Row 2: category chips */}
        <div className={styles.catRow}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              className={`${styles.catChip} ${category === c ? styles.catChipActive : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
          <div className={styles.yesRange}>
            <span className={styles.yesLabel}>YES%</span>
            <input
              className={styles.rangeInput}
              type="number"
              min="0" max="100"
              placeholder="0"
              value={minYes}
              onChange={e => setMinYes(Number(e.target.value))}
            />
            <span>–</span>
            <input
              className={styles.rangeInput}
              type="number"
              min="0" max="100"
              placeholder="100"
              value={maxYes}
              onChange={e => setMaxYes(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ── Results header ───────────────────────────── */}
      <div className={styles.resultsHeader}>
        <span className={styles.resultCount}>
          {sorted.length} {sorted.length === 1 ? 'market' : 'markets'}
          {sorted.length !== markets.length && ` (filtered from ${markets.length})`}
        </span>
        <span className={styles.sortingBy}>Sorted by: <strong>{SORTS.find(s => s.value === sort)?.label}</strong></span>
      </div>

      {/* ── Markets grid ─────────────────────────────── */}
      {!hasLoadedMarkets || isLoadingMarkets ? (
        <div className={styles.grid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonThumb} />
              <div className={styles.skeletonLine} style={{ width: '80%' }} />
              <div className={styles.skeletonLine} style={{ width: '55%' }} />
              <div className={styles.skeletonBar} />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔍</div>
          <h2>No Markets Match</h2>
          <p>Try adjusting your filters or search query</p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {paginated.map(m => (
              <MarketCard key={m.id} market={m} nowInSeconds={nowInSeconds} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                ← Prev
              </button>
              <div className={styles.pageNums}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | '…')[]>((acc, p, i, arr) => {
                    if (i > 0 && typeof arr[i - 1] === 'number' && (arr[i - 1] as number) < p - 1) acc.push('…')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === '…'
                      ? <span key={`dot-${i}`} className={styles.pageDots}>…</span>
                      : <button
                          key={p}
                          className={`${styles.pageNum} ${page === p ? styles.pageNumActive : ''}`}
                          onClick={() => setPage(p as number)}
                        >{p}</button>
                  )}
              </div>
              <button
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
