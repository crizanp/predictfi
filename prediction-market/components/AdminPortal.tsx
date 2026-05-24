'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useWallet } from '../context/WalletContext'
import { useMarkets } from '../context/MarketsContext'
import {
  AVAILABLE_CATEGORIES,
  formatToken,
  formatTimeLeft,
  getMarketCategory,
  getStoredCategories,
  setStoredCategory,
} from '../lib/utils'
import styles from './AdminPortal.module.css'

export default function AdminPortal() {
  const { showAdminPortal, setShowAdminPortal, isOwner, isBusy, busyAction, isContractConfigured } = useWallet()
  const { markets, isLoadingMarkets, loadMarkets, createMarket, resolveMarket } = useMarkets()

  const [nowInSeconds, setNowInSeconds] = useState(0)
  const [question, setQuestion] = useState('')
  const [duration, setDuration] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'create' | 'markets'>('overview')
  const [storedCategories, setStoredCategoriesState] = useState<Record<string, string>>({})

  useEffect(() => {
    const interval = setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (showAdminPortal) {
      setStoredCategoriesState(getStoredCategories())
    }
  }, [showAdminPortal])

  const handleCategoryChange = useCallback((marketId: number, category: string) => {
    setStoredCategory(marketId, category)
    setStoredCategoriesState((prev) => ({ ...prev, [String(marketId)]: category }))
  }, [])

  const handleCreate = useCallback(async () => {
    const durationNum = Number.parseInt(duration, 10)
    await createMarket(question, durationNum)
    setQuestion('')
    setDuration('')
  }, [createMarket, duration, question])

  const stats = useMemo(() => {
    const total = markets.length
    const resolved = markets.filter((m) => m.resolved).length
    const live = markets.filter((m) => !m.resolved && (nowInSeconds <= 0 || m.endTime > nowInSeconds)).length
    const ended = markets.filter((m) => !m.resolved && nowInSeconds > 0 && m.endTime <= nowInSeconds).length
    const totalVol = markets.reduce((acc, m) => acc + Number.parseFloat(m.totalPool || '0'), 0)
    return { total, resolved, live, ended, totalVol }
  }, [markets, nowInSeconds])

  if (!showAdminPortal || !isOwner) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.portal}>
        <div className={styles.portalHeader}>
          <div className={styles.portalBrand}>
            <span className={styles.portalIcon}>⚙</span>
            <div>
              <h1 className={styles.portalTitle}>Admin Portal</h1>
              <p className={styles.portalSub}>PredictFi Market Management</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={() => setShowAdminPortal(false)}>✕ Close</button>
        </div>

        <div className={styles.tabs}>
          <button className={activeTab === 'overview' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('overview')}>Overview</button>
          <button className={activeTab === 'create' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('create')}>Create Market</button>
          <button className={activeTab === 'markets' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('markets')}>
            Manage Markets <span className={styles.tabCount}>{markets.length}</span>
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === 'overview' && (
            <div className={styles.overviewTab}>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.total}</span>
                  <span className={styles.statLabel}>Total Markets</span>
                </div>
                <div className={`${styles.statCard} ${styles.statLive}`}>
                  <span className={styles.statValue}>{stats.live}</span>
                  <span className={styles.statLabel}>Live Now</span>
                </div>
                <div className={`${styles.statCard} ${styles.statEnded}`}>
                  <span className={styles.statValue}>{stats.ended}</span>
                  <span className={styles.statLabel}>Awaiting Resolve</span>
                </div>
                <div className={`${styles.statCard} ${styles.statResolved}`}>
                  <span className={styles.statValue}>{stats.resolved}</span>
                  <span className={styles.statLabel}>Resolved</span>
                </div>
                <div className={`${styles.statCard} ${styles.statVol}`}>
                  <span className={styles.statValue}>{stats.totalVol.toFixed(3)}</span>
                  <span className={styles.statLabel}>Total tBNB Volume</span>
                </div>
              </div>

              {!isContractConfigured && (
                <div className={styles.warning}>
                  ⚠ Contract not configured. Add NEXT_PUBLIC_CONTRACT_ADDRESS to .env.local and restart.
                </div>
              )}

              <button
                className={styles.refreshBtn}
                onClick={() => { void loadMarkets() }}
                disabled={isLoadingMarkets}
              >
                {isLoadingMarkets ? 'Loading...' : '↻ Refresh Data'}
              </button>
            </div>
          )}

          {activeTab === 'create' && (
            <div className={styles.createTab}>
              <h2 className={styles.sectionTitle}>Create New Market</h2>

              <div className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="admin-question">
                    Market Question
                  </label>
                  <input
                    id="admin-question"
                    className={styles.input}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. Will BTC close above $120k this week?"
                    disabled={isBusy || !isContractConfigured}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="admin-duration">
                    Duration (minutes)
                  </label>
                  <input
                    id="admin-duration"
                    className={styles.input}
                    type="number"
                    min="1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g. 60"
                    disabled={isBusy || !isContractConfigured}
                  />
                </div>

                <div className={styles.presets}>
                  <span className={styles.presetsLabel}>Quick Duration:</span>
                  {[5, 15, 30, 60, 120, 1440].map((min) => (
                    <button key={min} className={styles.preset} onClick={() => setDuration(String(min))}>
                      {min >= 1440 ? `${min / 1440}d` : min >= 60 ? `${min / 60}h` : `${min}m`}
                    </button>
                  ))}
                </div>

                <button
                  className={styles.createBtn}
                  onClick={() => { void handleCreate() }}
                  disabled={isBusy || !question.trim() || !duration || !isContractConfigured}
                >
                  {busyAction === 'create-market' ? 'Creating...' : 'Create Market on BSC Testnet'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'markets' && (
            <div className={styles.marketsTab}>
              <h2 className={styles.sectionTitle}>All Markets</h2>

              {isLoadingMarkets ? (
                <div className={styles.loading}>Loading markets...</div>
              ) : markets.length === 0 ? (
                <div className={styles.empty}>No markets yet. Create one in the Create tab.</div>
              ) : (
                <div className={styles.marketList}>
                  {markets.map((market) => {
                    const isEnded = nowInSeconds > 0 && market.endTime <= nowInSeconds
                    const canResolve = !market.resolved && isEnded
                    const currentCat = storedCategories[String(market.id)] || getMarketCategory(market.id, market.question)

                    return (
                      <div key={market.id} className={styles.marketRow}>
                        <div className={styles.marketRowHeader}>
                          <span className={styles.marketId}>#{market.id}</span>
                          <span className={
                            market.resolved ? styles.badgeResolved :
                            isEnded ? styles.badgeEnded :
                            styles.badgeLive
                          }>
                            {market.resolved ? 'Resolved' : isEnded ? 'Ended' : 'Live'}
                          </span>
                        </div>
                        <p className={styles.marketQuestion}>{market.question}</p>
                        <div className={styles.marketMeta}>
                          <span className={styles.metaItem}>Pool: {formatToken(market.totalPool)} tBNB</span>
                          <span className={styles.metaItem}>{formatTimeLeft(market.endTime, nowInSeconds)}</span>
                        </div>

                        <div className={styles.marketActions}>
                          <div className={styles.categoryField}>
                            <label className={styles.catLabel}>Category:</label>
                            <select
                              className={styles.catSelect}
                              value={currentCat}
                              onChange={(e) => handleCategoryChange(market.id, e.target.value)}
                            >
                              {AVAILABLE_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>

                          {canResolve && (
                            <div className={styles.resolveBtns}>
                              <button
                                className={styles.resolveYes}
                                onClick={() => { void resolveMarket(market.id, 1) }}
                                disabled={isBusy}
                              >
                                Resolve YES
                              </button>
                              <button
                                className={styles.resolveNo}
                                onClick={() => { void resolveMarket(market.id, 2) }}
                                disabled={isBusy}
                              >
                                Resolve NO
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
