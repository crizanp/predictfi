'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMarkets } from '../context/MarketsContext'
import { getMarketCategory } from '../lib/utils'
import MarketCard from '../components/MarketCard'
import CategoryBar from '../components/CategoryBar'
import styles from './page.module.css'

export default function HomePage() {
  const { markets, isLoadingMarkets } = useMarkets()
  const [nowInSeconds, setNowInSeconds] = useState(0)
  const [activeCategory, setActiveCategory] = useState('Trending')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const interval = setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  const liveCount = useMemo(() =>
    markets.filter((m) => !m.resolved && (nowInSeconds <= 0 || m.endTime > nowInSeconds)).length,
    [markets, nowInSeconds]
  )

  const newestId = useMemo(() =>
    markets.length > 0 ? Math.max(...markets.map((m) => m.id)) : 0,
    [markets]
  )

  const visibleMarkets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return markets.filter((market) => {
      const category = getMarketCategory(market.id, market.question)

      const categoryMatch =
        activeCategory === 'Trending'
          ? true
          : activeCategory === 'New'
            ? market.id >= newestId - 5
            : category === activeCategory

      const searchMatch = !q || market.question.toLowerCase().includes(q)
      return categoryMatch && searchMatch
    })
  }, [activeCategory, markets, newestId, searchQuery])

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <CategoryBar
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          liveCount={liveCount}
        />

        {isLoadingMarkets ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading markets from BSC Testnet...</p>
          </div>
        ) : markets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>??</div>
            <h2>No Markets Yet</h2>
            <p>
              Connect as the owner to create prediction markets via the Admin Portal.
            </p>
          </div>
        ) : visibleMarkets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>??</div>
            <h2>No Markets Found</h2>
            <p>No markets match this filter. Try a different category or search.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleMarkets.map((market) => (
              <MarketCard key={market.id} market={market} nowInSeconds={nowInSeconds} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}