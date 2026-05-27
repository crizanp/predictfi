'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { RiBarChart2Line, RiFireLine, RiLineChartLine, RiUserStarLine } from 'react-icons/ri'
import { useMarkets } from '../../context/MarketsContext'
import { getProfilesByAddresses, getRecentActivity } from '../../lib/supabase'
import { getMarketDetailPath, shortenAddress } from '../../lib/utils'
import styles from './page.module.css'

type LeaderRow = {
  address: string
  name: string
  volume: number
  predictions: number
  markets: number
  wins: number
  resolvedPredictions: number
  winRate: number
}

export default function LeaderboardPage() {
  const { markets, isLoadingMarkets, hasLoadedMarkets } = useMarkets()
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [isLoadingRows, setIsLoadingRows] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoadingRows(true)
      void (async () => {
        try {
          const activity = await getRecentActivity(10000)
          const marketMap = new Map(markets.map((market) => [market.id, market]))
          const aggregate = new Map<string, {
            volume: number
            predictions: number
            markets: Set<number>
            wins: number
            resolvedPredictions: number
          }>()

          for (const row of activity) {
            const address = row.user_address.toLowerCase()
            const current = aggregate.get(address) ?? {
              volume: 0,
              predictions: 0,
              markets: new Set<number>(),
              wins: 0,
              resolvedPredictions: 0,
            }

            const amount = parseFloat(row.amount_eth) || 0
            current.volume += amount
            current.predictions += 1
            current.markets.add(row.market_id)

            const market = marketMap.get(row.market_id)
            const eventId = Number(row.event_id ?? 1)
            const event = market?.events.find((eventItem) => eventItem.id === eventId)
            if (event?.resolved && (event.result === 1 || event.result === 2)) {
              current.resolvedPredictions += 1
              if (Number(row.choice) === event.result) current.wins += 1
            }

            aggregate.set(address, current)
          }

          const addresses = Array.from(aggregate.keys())
          const profiles = await getProfilesByAddresses(addresses)

          const nextRows: LeaderRow[] = addresses
            .map((address) => {
              const data = aggregate.get(address)
              if (!data) return null
              const winRate = data.resolvedPredictions > 0
                ? Math.round((data.wins / data.resolvedPredictions) * 100)
                : 0
              return {
                address,
                name: profiles[address]?.display_name?.trim() || '',
                volume: data.volume,
                predictions: data.predictions,
                markets: data.markets.size,
                wins: data.wins,
                resolvedPredictions: data.resolvedPredictions,
                winRate,
              }
            })
            .filter((entry): entry is LeaderRow => entry !== null)
            .sort((a, b) => {
              if (b.volume !== a.volume) return b.volume - a.volume
              if (b.wins !== a.wins) return b.wins - a.wins
              return b.predictions - a.predictions
            })

          setRows(nextRows)
        } finally {
          setIsLoadingRows(false)
        }
      })()
    }, 0)

    return () => clearTimeout(timer)
  }, [markets])

  const topMarkets = useMemo(() =>
    [...markets]
      .sort((a, b) => (parseFloat(b.totalPool) || 0) - (parseFloat(a.totalPool) || 0))
      .slice(0, 5),
    [markets]
  )

  const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0)
  const totalPredictions = rows.reduce((sum, row) => sum + row.predictions, 0)
  const avgWinRate = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.winRate, 0) / rows.length) : 0
  const isLoading = isLoadingRows || !hasLoadedMarkets || isLoadingMarkets

  const renderStat = (value: string | number) => (
    isLoading ? <div className={styles.statSkeleton} /> : value
  )

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Leaderboard</h1>
          <p className={styles.pageSub}>Live ranking from recent platform activity</p>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={`${styles.statCard} ${styles.statCardUsers}`}>
          <RiUserStarLine className={styles.statIcon} />
          <div className={styles.statNum}>{renderStat(rows.length)}</div>
          <div className={styles.statLabel}>Active Traders</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardVolume}`}>
          <RiBarChart2Line className={styles.statIcon} />
          <div className={styles.statNum}>{renderStat(totalVolume.toFixed(4))}</div>
          <div className={styles.statLabel}>Total Volume (tBNB)</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardPredictions}`}>
          <RiLineChartLine className={styles.statIcon} />
          <div className={styles.statNum}>{renderStat(totalPredictions)}</div>
          <div className={styles.statLabel}>Predictions</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardRate}`}>
          <RiFireLine className={styles.statIcon} />
          <div className={styles.statNum}>{renderStat(`${avgWinRate}%`)}</div>
          <div className={styles.statLabel}>Avg Win Rate</div>
        </div>
      </div>

      <div className={styles.sectionLabel}>Top Traders</div>
      {isLoading ? (
        <div className={styles.tableCard}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={styles.rowSkeleton} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className={styles.emptyState}>No trading activity found yet.</div>
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.tableHead}>
            <span>Rank</span>
            <span>Trader</span>
            <span>Predictions</span>
            <span>Markets</span>
            <span>Wins</span>
            <span>Win Rate</span>
            <span>Volume</span>
          </div>
          {rows.map((row, index) => (
            <div key={row.address} className={styles.tableRow}>
              <span className={styles.rankCell}>#{index + 1}</span>
              <span className={styles.addressCell}>{row.name || shortenAddress(row.address)}</span>
              <span>{row.predictions}</span>
              <span>{row.markets}</span>
              <span>{row.wins}/{row.resolvedPredictions || 0}</span>
              <span>{row.winRate}%</span>
              <span>{row.volume.toFixed(4)} tBNB</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.sectionLabel}>Hot Markets</div>
      <div className={styles.marketGrid}>
        {topMarkets.map((market) => {
          const totalPool = parseFloat(market.totalPool) || 0
          const yesPool = parseFloat(market.yesPool) || 0
          const yesPct = totalPool > 0 ? Math.round((yesPool / totalPool) * 100) : 50
          return (
            <Link key={market.id} href={getMarketDetailPath(market.question, market.id)} className={styles.marketCard}>
              <div className={styles.marketQuestion}>{market.question}</div>
              <div className={styles.marketMeta}>YES {yesPct}% · Pool {totalPool.toFixed(3)} tBNB</div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
