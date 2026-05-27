'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../context/WalletContext'
import { useMarkets } from '../context/MarketsContext'
import {
  AVAILABLE_CATEGORIES,
  formatToken,
  formatTimeLeft,
  getMarketCategory,
  getStoredCategories,
  setStoredCategory,
  shortenAddress,
} from '../lib/utils'
import { getMarketMeta, upsertMarketMeta, type MarketMeta } from '../lib/supabase'
import styles from './AdminPortal.module.css'

export default function AdminPortal() {
  const {
    showAdminPortal,
    setShowAdminPortal,
    isOwner,
    isAdmin,
    adminAddresses,
    addAdminAddress,
    removeAdminAddress,
    isBusy,
    busyAction,
    isContractConfigured,
  } = useWallet()
  const { markets, isLoadingMarkets, loadMarkets, createMarket, resolveMarket } = useMarkets()

  const [nowInSeconds, setNowInSeconds] = useState(0)
  const [eventNamesText, setEventNamesText] = useState('')
  const [question, setQuestion] = useState('')
  const [duration, setDuration] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'create' | 'markets' | 'team'>('overview')
  const [storedCategories, setStoredCategoriesState] = useState<Record<string, string>>({})
  const [newAdminAddress, setNewAdminAddress] = useState('')
  const [adminFeedback, setAdminFeedback] = useState('')

  // Per-market metadata editing state
  const [metaEditing, setMetaEditing] = useState<Record<number, Partial<MarketMeta>>>({})
  const [metaLoading, setMetaLoading] = useState<Record<number, boolean>>({})
  const [uploadingImage, setUploadingImage] = useState<Record<number, boolean>>({})
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  useEffect(() => {
    const interval = setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (showAdminPortal) {
      const timer = setTimeout(() => setStoredCategoriesState(getStoredCategories()), 0)
      return () => clearTimeout(timer)
    }
  }, [showAdminPortal])

  const handleCategoryChange = useCallback((marketId: number, category: string) => {
    setStoredCategory(marketId, category)
    setStoredCategoriesState((prev) => ({ ...prev, [String(marketId)]: category }))
  }, [])

  const handleCreate = useCallback(async () => {
    const durationNum = Number.parseInt(duration, 10)
    const eventNames = eventNamesText
      .split(/\r?\n|,|;|\|/)
      .map((row) => row.trim())
      .filter((row) => row.length > 0)

    await createMarket(question, durationNum, eventNames)
    setEventNamesText('')
    setQuestion('')
    setDuration('')
  }, [createMarket, duration, eventNamesText, question])

  const loadMeta = useCallback(async (marketId: number) => {
    setMetaLoading((prev) => ({ ...prev, [marketId]: true }))
    const meta = await getMarketMeta(marketId)
    const market = markets.find((entry) => entry.id === marketId)
    const derivedEventsJson = market && market.events.length > 0
      ? JSON.stringify(
          market.events.map((event, index) => ({
            key: String(event.id),
            name: event.name,
            yesLabel: index === 0 ? 'Up' : 'Yes',
            noLabel: index === 0 ? 'Down' : 'No',
          })),
          null,
          2
        )
      : ''

    const isDummyEventsJson = (value: string | null | undefined): boolean => {
      const raw = value?.trim()
      if (!raw) return false
      try {
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed) || parsed.length === 0) return false
        return parsed.every((row, index) => {
          const item = row as Record<string, unknown>
          const key = String(item.key ?? '').toLowerCase()
          const name = String(item.name ?? '').toLowerCase()
          return (
            key === `e${index + 1}` ||
            key === `event-${index + 1}` ||
            key === String(index + 1) ||
            name === `event ${index + 1}` ||
            name === 'main event'
          )
        })
      } catch {
        return false
      }
    }

    const normalizedEventsJson = isDummyEventsJson(meta?.events_json)
      ? derivedEventsJson
      : (meta?.events_json ?? derivedEventsJson)

    setMetaEditing((prev) => ({
      ...prev,
      [marketId]: {
        image_url: meta?.image_url ?? '',
        description: meta?.description ?? '',
        rules: meta?.rules ?? '',
        card_bg: meta?.card_bg ?? '',
        card_text: meta?.card_text ?? '',
        events_json: normalizedEventsJson,
        yes_label: meta?.yes_label ?? '',
        no_label: meta?.no_label ?? '',
      },
    }))
    setMetaLoading((prev) => ({ ...prev, [marketId]: false }))
  }, [markets])

  const saveMeta = useCallback(async (marketId: number) => {
    const current = metaEditing[marketId] ?? {}
    setMetaLoading((prev) => ({ ...prev, [marketId]: true }))
    await upsertMarketMeta({
      market_id: marketId,
      image_url: current.image_url ?? null,
      description: current.description ?? null,
      rules: current.rules ?? null,
      card_bg: (current.card_bg as string | undefined) || null,
      card_text: (current.card_text as string | undefined) || null,
      events_json: (current.events_json as string | undefined) || null,
      yes_label: (current.yes_label as string | undefined) || null,
      no_label: (current.no_label as string | undefined) || null,
    })
    setMetaLoading((prev) => ({ ...prev, [marketId]: false }))
  }, [metaEditing])

  const handleImageUpload = useCallback(async (marketId: number, file: File) => {
    setUploadingImage((prev) => ({ ...prev, [marketId]: true }))
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('marketId', String(marketId))
      const res = await fetch('/api/upload-market-image', { method: 'POST', body: form })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Image upload failed')
      }

      setMetaEditing((prev) => ({ ...prev, [marketId]: { ...prev[marketId], image_url: data.url } }))

      const current = metaEditing[marketId] ?? {}
      await upsertMarketMeta({
        market_id: marketId,
        image_url: data.url,
        description: (current.description as string | undefined) || null,
        rules: (current.rules as string | undefined) || null,
        card_bg: (current.card_bg as string | undefined) || null,
        card_text: (current.card_text as string | undefined) || null,
        events_json: (current.events_json as string | undefined) || null,
        yes_label: (current.yes_label as string | undefined) || null,
        no_label: (current.no_label as string | undefined) || null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image upload failed'
      window.alert(`Upload failed: ${message}`)
    } finally {
      setUploadingImage((prev) => ({ ...prev, [marketId]: false }))
      const input = fileInputRefs.current[marketId]
      if (input) input.value = ''
    }
  }, [metaEditing])

  const stats = useMemo(() => {
    const total = markets.length
    const resolved = markets.filter((m) => m.resolved).length
    const live = markets.filter((m) => !m.resolved && (nowInSeconds <= 0 || m.endTime > nowInSeconds)).length
    const ended = markets.filter((m) => !m.resolved && nowInSeconds > 0 && m.endTime <= nowInSeconds).length
    const totalVol = markets.reduce((acc, m) => acc + Number.parseFloat(m.totalPool || '0'), 0)
    return { total, resolved, live, ended, totalVol }
  }, [markets, nowInSeconds])

  const handleAddAdmin = useCallback(() => {
    const normalized = newAdminAddress.trim().toLowerCase()
    if (!ethers.isAddress(normalized)) {
      setAdminFeedback('Enter a valid wallet address.')
      return
    }
    const added = addAdminAddress(normalized)
    if (!added) {
      setAdminFeedback('Address is already in the admin list.')
      return
    }
    setNewAdminAddress('')
    setAdminFeedback('Admin added successfully.')
  }, [addAdminAddress, newAdminAddress])

  if (!showAdminPortal || !isAdmin) return null

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
          <button className={activeTab === 'team' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('team')}>
            Admin Team <span className={styles.tabCount}>{adminAddresses.length}</span>
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
                  <label className={styles.fieldLabel} htmlFor="admin-event-list">
                    Events (one per line or comma separated)
                  </label>
                  <textarea
                    id="admin-event-list"
                    className={styles.input}
                    value={eventNamesText}
                    onChange={(e) => setEventNamesText(e.target.value)}
                    placeholder={'Match Winner, Total Goals Over 2.5, Both Teams to Score'}
                    disabled={isBusy || !isContractConfigured}
                    rows={4}
                  />
                </div>

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
                  disabled={isBusy || !eventNamesText.trim() || !question.trim() || !duration || !isContractConfigured || !isOwner}
                >
                  {busyAction === 'create-market' ? 'Creating...' : isOwner ? 'Create Market on BSC Testnet' : 'Owner Wallet Required'}
                </button>
                {!isOwner && (
                  <div className={styles.warning}>Only contract owner can create or resolve markets. Co-admins can manage metadata and categories.</div>
                )}
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
                    const canResolveAny = isEnded
                    const currentCat = storedCategories[String(market.id)] || getMarketCategory(market.id, market.question)

                    const editing = metaEditing[market.id]
                    const isMetaLoading = metaLoading[market.id]
                    const isUploading = uploadingImage[market.id]

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
                        {market.events.length > 0 && (
                          <div className={styles.marketMeta}>
                            <span className={styles.metaItem}>
                              Events: {market.events.map((event) => event.name).join(' | ')}
                            </span>
                          </div>
                        )}
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

                          {canResolveAny && (
                            <div className={styles.resolveBtns}>
                              {market.events.map((event) => (
                                <div key={event.id} className={styles.categoryField}>
                                  <label className={styles.catLabel}>{event.name}</label>
                                  <div className={styles.resolveBtns}>
                                    <button
                                      className={styles.resolveYes}
                                      onClick={() => { void resolveMarket(market.id, 1, event.id) }}
                                      disabled={isBusy || event.resolved || !isOwner}
                                    >
                                      {event.resolved ? 'Resolved' : !isOwner ? 'Owner Only' : 'Resolve YES'}
                                    </button>
                                    <button
                                      className={styles.resolveNo}
                                      onClick={() => { void resolveMarket(market.id, 2, event.id) }}
                                      disabled={isBusy || event.resolved || !isOwner}
                                    >
                                      {event.resolved ? 'Resolved' : !isOwner ? 'Owner Only' : 'Resolve NO'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Metadata panel */}
                        {!editing ? (
                          <button className={styles.metaToggle} onClick={() => { void loadMeta(market.id) }}>
                            {isMetaLoading ? 'Loading...' : '✏ Edit Details (image / description / rules)'}
                          </button>
                        ) : (
                          <div className={styles.metaPanel}>
                            <div className={styles.metaImageRow}>
                              {editing.image_url && (
                                <img src={editing.image_url} alt="market" className={styles.metaPreview} />
                              )}
                              <div className={styles.metaImageBtns}>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  ref={(el) => { fileInputRefs.current[market.id] = el }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) void handleImageUpload(market.id, file)
                                  }}
                                />
                                <button
                                  className={styles.uploadBtn}
                                  onClick={() => fileInputRefs.current[market.id]?.click()}
                                  disabled={isUploading}
                                >
                                  {isUploading ? 'Uploading...' : '📷 Upload Image'}
                                </button>
                                {editing.image_url && (
                                  <button
                                    className={styles.clearBtn}
                                    onClick={() => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], image_url: '' } }))}
                                  >
                                    ✕ Clear
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className={styles.metaField}>
                              <label className={styles.metaLabel}>Description</label>
                              <textarea
                                className={styles.metaTextarea}
                                rows={3}
                                value={editing.description ?? ''}
                                onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], description: e.target.value } }))}
                                placeholder="Describe what this market is about..."
                              />
                            </div>

                            <div className={styles.metaField}>
                              <label className={styles.metaLabel}>Rules</label>
                              <textarea
                                className={styles.metaTextarea}
                                rows={3}
                                value={editing.rules ?? ''}
                                onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], rules: e.target.value } }))}
                                placeholder="How will this market be resolved? Source of truth?"
                              />
                            </div>

                            <div className={styles.metaField}>
                              <label className={styles.metaLabel}>Card Background Color (optional)</label>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                  type="color"
                                  value={(editing as Record<string, unknown>).card_bg as string || '#0d1014'}
                                  onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], card_bg: e.target.value } }))}
                                  style={{ width: 36, height: 36, border: 'none', cursor: 'pointer', borderRadius: 6, background: 'none' }}
                                />
                                <input
                                  className={styles.metaInput}
                                  type="text"
                                  value={(editing as Record<string, unknown>).card_bg as string || ''}
                                  onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], card_bg: e.target.value } }))}
                                  placeholder="e.g. #1a0a2e or rgba(26,10,46,0.95)"
                                />
                              </div>
                            </div>

                            <div className={styles.metaField}>
                              <label className={styles.metaLabel}>Card Text Color (optional)</label>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                  type="color"
                                  value={(editing as Record<string, unknown>).card_text as string || '#f0f0f5'}
                                  onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], card_text: e.target.value } }))}
                                  style={{ width: 36, height: 36, border: 'none', cursor: 'pointer', borderRadius: 6, background: 'none' }}
                                />
                                <input
                                  className={styles.metaInput}
                                  type="text"
                                  value={(editing as Record<string, unknown>).card_text as string || ''}
                                  onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], card_text: e.target.value } }))}
                                  placeholder="e.g. #ffffff or #f0f0f5"
                                />
                              </div>
                            </div>

                            <div className={styles.metaField}>
                              <label className={styles.metaLabel}>Events (JSON array for single or multiple events)</label>
                              <textarea
                                className={styles.metaTextarea}
                                rows={6}
                                value={(editing as Record<string, unknown>).events_json as string || ''}
                                onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], events_json: e.target.value } }))}
                                placeholder={'[{"key":"1","name":"X Man","yesLabel":"Up","noLabel":"Down"}]'}
                              />
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className={styles.preset}
                                  onClick={() => setMetaEditing((prev) => ({
                                    ...prev,
                                    [market.id]: {
                                      ...prev[market.id],
                                      events_json: JSON.stringify(
                                        market.events.slice(0, 1).map((event) => ({
                                          key: String(event.id),
                                          name: event.name,
                                          yesLabel: 'Up',
                                          noLabel: 'Down',
                                        })),
                                        null,
                                        2
                                      ),
                                    },
                                  }))}
                                >
                                  Single Event Template
                                </button>
                                <button
                                  type="button"
                                  className={styles.preset}
                                  onClick={() => setMetaEditing((prev) => ({
                                    ...prev,
                                    [market.id]: {
                                      ...prev[market.id],
                                      events_json: JSON.stringify(
                                        market.events.map((event, index) => ({
                                          key: String(event.id),
                                          name: event.name,
                                          yesLabel: index === 0 ? 'Up' : 'Yes',
                                          noLabel: index === 0 ? 'Down' : 'No',
                                        })),
                                        null,
                                        2
                                      ),
                                    },
                                  }))}
                                >
                                  Load On-Chain Events
                                </button>
                              </div>
                            </div>

                            <div className={styles.metaField}>
                              <label className={styles.metaLabel}>YES Outcome Label (e.g. Trump, Team A)</label>
                              <input
                                className={styles.metaInput}
                                type="text"
                                value={(editing as Record<string, unknown>).yes_label as string || ''}
                                onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], yes_label: e.target.value } }))}
                                placeholder="Leave blank for default YES"
                              />
                            </div>

                            <div className={styles.metaField}>
                              <label className={styles.metaLabel}>NO Outcome Label (e.g. Biden, Team B)</label>
                              <input
                                className={styles.metaInput}
                                type="text"
                                value={(editing as Record<string, unknown>).no_label as string || ''}
                                onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], no_label: e.target.value } }))}
                                placeholder="Leave blank for default NO"
                              />
                            </div>

                            <div className={styles.metaSaveBtns}>
                              <button
                                className={styles.saveBtn}
                                onClick={() => { void saveMeta(market.id) }}
                                disabled={isMetaLoading}
                              >
                                {isMetaLoading ? 'Saving...' : '✓ Save Details'}
                              </button>
                              <button
                                className={styles.cancelBtn}
                                onClick={() => setMetaEditing((prev) => { const n = { ...prev }; delete n[market.id]; return n })}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'team' && (
            <div className={styles.teamTab}>
              <h2 className={styles.sectionTitle}>Admin Team</h2>
              <p className={styles.teamSub}>Add up to trusted co-admin wallets for metadata and operational management.</p>

              <div className={styles.teamInputRow}>
                <input
                  className={styles.input}
                  value={newAdminAddress}
                  onChange={(e) => setNewAdminAddress(e.target.value)}
                  placeholder="0x..."
                  disabled={!isOwner}
                />
                <button className={styles.createBtn} onClick={handleAddAdmin} disabled={!isOwner || !newAdminAddress.trim()}>
                  Add Admin
                </button>
              </div>
              {!isOwner && (
                <div className={styles.warning}>Only the contract owner can add or remove admin addresses.</div>
              )}
              {adminFeedback && <div className={styles.teamFeedback}>{adminFeedback}</div>}

              <div className={styles.teamList}>
                {adminAddresses.length === 0 ? (
                  <div className={styles.empty}>No delegated admins yet.</div>
                ) : (
                  adminAddresses.map((address) => (
                    <div key={address} className={styles.teamItem}>
                      <div>
                        <div className={styles.teamAddr}>{address}</div>
                        <div className={styles.teamAddrShort}>{shortenAddress(address)}</div>
                      </div>
                      <button
                        className={styles.clearBtn}
                        onClick={() => removeAdminAddress(address)}
                        disabled={!isOwner}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
