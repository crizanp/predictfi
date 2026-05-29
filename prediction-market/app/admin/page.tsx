'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ethers } from 'ethers'
import { useWallet } from '../../context/WalletContext'
import { useMarkets } from '../../context/MarketsContext'
import {
  AVAILABLE_CATEGORIES,
  formatTimeLeft,
  formatToken,
  getMarketCategory,
  getStoredCategories,
  setStoredCategory,
  shortenAddress,
} from '../../lib/utils'
import {
  getMarketMeta,
  getWhitelistApplications,
  updateWhitelistApplicationStatus,
  upsertMarketMeta,
  type MarketMeta,
  type WhitelistApplication,
} from '../../lib/supabase'
import { CONTRACT_OWNER } from '../../lib/contract'
import styles from './page.module.css'

type TabKey = 'dashboard' | 'create' | 'markets' | 'whitelist' | 'team'
type WhitelistFilter = 'all' | 'pending' | 'approved' | 'rejected'

export default function AdminPage() {
  const {
    account,
    isOwner,
    isAdmin,
    isContractConfigured,
    isBusy,
    busyAction,
    setShowWalletModal,
    adminAddresses,
    addAdminAddress,
    removeAdminAddress,
  } = useWallet()

  const {
    markets,
    isLoadingMarkets,
    loadMarkets,
    createMarket,
    resolveMarket,
    withdrawFees,
  } = useMarkets()

  const [tab, setTab] = useState<TabKey>('dashboard')
  const [nowInSeconds, setNowInSeconds] = useState(0)

  const [storedCategories, setStoredCategoriesState] = useState<Record<string, string>>({})

  const [question, setQuestion] = useState('')
  const [eventNamesText, setEventNamesText] = useState('')
  const [duration, setDuration] = useState('60')

  const [newAdminAddress, setNewAdminAddress] = useState('')
  const [adminFeedback, setAdminFeedback] = useState('')

  const [metaEditing, setMetaEditing] = useState<Record<number, Partial<MarketMeta>>>({})
  const [metaLoading, setMetaLoading] = useState<Record<number, boolean>>({})
  const [uploadingImage, setUploadingImage] = useState<Record<number, boolean>>({})
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const [whitelistRows, setWhitelistRows] = useState<WhitelistApplication[]>([])
  const [whitelistLoading, setWhitelistLoading] = useState(false)
  const [whitelistFilter, setWhitelistFilter] = useState<WhitelistFilter>('all')
  const [whitelistSearch, setWhitelistSearch] = useState('')
  const [whitelistActionBusy, setWhitelistActionBusy] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const boot = window.setTimeout(() => {
      setStoredCategoriesState(getStoredCategories())
      void loadMarkets()
      setNowInSeconds(Math.floor(Date.now() / 1000))
    }, 0)
    const timer = window.setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => {
      window.clearTimeout(boot)
      window.clearInterval(timer)
    }
  }, [loadMarkets])

  const stats = useMemo(() => {
    const total = markets.length
    const resolved = markets.filter((m) => m.resolved).length
    const live = markets.filter((m) => !m.resolved && (nowInSeconds <= 0 || m.endTime > nowInSeconds)).length
    const ended = markets.filter((m) => !m.resolved && nowInSeconds > 0 && m.endTime <= nowInSeconds).length
    const totalVol = markets.reduce((acc, m) => acc + Number.parseFloat(m.totalPool || '0'), 0)
    return { total, resolved, live, ended, totalVol }
  }, [markets, nowInSeconds])

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
    setQuestion('')
    setEventNamesText('')
  }, [createMarket, duration, eventNamesText, question])

  const loadMeta = useCallback(async (marketId: number) => {
    setMetaLoading((prev) => ({ ...prev, [marketId]: true }))
    const meta = await getMarketMeta(marketId)

    setMetaEditing((prev) => ({
      ...prev,
      [marketId]: {
        image_url: meta?.image_url ?? '',
        description: meta?.description ?? '',
        rules: meta?.rules ?? '',
        card_bg: meta?.card_bg ?? '',
        card_text: meta?.card_text ?? '',
        events_json: meta?.events_json ?? '',
        yes_label: meta?.yes_label ?? '',
        no_label: meta?.no_label ?? '',
      },
    }))
    setMetaLoading((prev) => ({ ...prev, [marketId]: false }))
  }, [])

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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image upload failed'
      window.alert(`Upload failed: ${message}`)
    } finally {
      setUploadingImage((prev) => ({ ...prev, [marketId]: false }))
      const input = fileInputRefs.current[marketId]
      if (input) input.value = ''
    }
  }, [])

  const handleAddAdmin = useCallback(() => {
    const normalized = newAdminAddress.trim().toLowerCase()
    if (!ethers.isAddress(normalized)) {
      setAdminFeedback('Enter a valid wallet address.')
      return
    }
    const added = addAdminAddress(normalized)
    if (!added) {
      setAdminFeedback('Address already exists.')
      return
    }
    setNewAdminAddress('')
    setAdminFeedback('Admin added successfully.')
  }, [addAdminAddress, newAdminAddress])

  const loadWhitelist = useCallback(async () => {
    setWhitelistLoading(true)
    const rows = await getWhitelistApplications(500)
    setWhitelistRows(rows)
    setWhitelistLoading(false)
  }, [])

  useEffect(() => {
    if (tab !== 'whitelist') return
    const timer = window.setTimeout(() => {
      void loadWhitelist()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadWhitelist, tab])

  const updateWhitelistStatus = useCallback(async (wallet: string, status: 'pending' | 'approved' | 'rejected') => {
    setWhitelistActionBusy((prev) => ({ ...prev, [wallet]: true }))
    const result = await updateWhitelistApplicationStatus(wallet, status)
    if (result.success) {
      setWhitelistRows((prev) => prev.map((row) => (
        row.wallet_address.toLowerCase() === wallet.toLowerCase() ? { ...row, status } : row
      )))
    } else {
      window.alert(result.error || 'Failed to update whitelist status')
    }
    setWhitelistActionBusy((prev) => ({ ...prev, [wallet]: false }))
  }, [])

  const filteredWhitelist = useMemo(() => {
    const search = whitelistSearch.trim().toLowerCase()
    return whitelistRows.filter((row) => {
      const statusPass = whitelistFilter === 'all' || (row.status ?? 'pending') === whitelistFilter
      if (!statusPass) return false
      if (!search) return true
      return row.wallet_address.toLowerCase().includes(search) || row.name.toLowerCase().includes(search)
    })
  }, [whitelistFilter, whitelistRows, whitelistSearch])

  if (!account || !isAdmin) {
    return (
      <main className={styles.page}>
        <section className={styles.gateCard}>
          <h1 className={styles.gateTitle}>Admin Access Required</h1>
          <p className={styles.gateText}>Connect an owner or delegated admin wallet to open the admin dashboard.</p>
          {!account ? (
            <button className={styles.primaryBtn} onClick={() => setShowWalletModal(true)}>Connect Wallet</button>
          ) : (
            <Link href="/markets" className={styles.secondaryBtn}>Back To Markets</Link>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <div>
          <p className={styles.eyebrow}>Operations Console</p>
          <h1 className={styles.title}>PredictWin Admin</h1>
          <p className={styles.subtitle}>Create markets, resolve outcomes, manage metadata, review whitelist entries, and maintain admin access.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn} onClick={() => { void loadMarkets() }} disabled={isLoadingMarkets}>
            {isLoadingMarkets ? 'Refreshing...' : 'Refresh Markets'}
          </button>
          <button className={styles.primaryBtn} onClick={() => { void withdrawFees() }} disabled={!isOwner || isBusy}>
            {busyAction === 'withdraw-fees' ? 'Withdrawing...' : isOwner ? 'Withdraw Fees' : 'Owner Only'}
          </button>
        </div>
      </section>

      {!isContractConfigured && (
        <div className={styles.warning}>Contract not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in env.</div>
      )}

      <nav className={styles.tabs}>
        {[
          ['dashboard', 'Dashboard'],
          ['create', 'Create Market'],
          ['markets', 'Manage Markets'],
          ['whitelist', 'Whitelist'],
          ['team', 'Admin Team'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? styles.tabActive : styles.tab}
            onClick={() => setTab(key as TabKey)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && (
        <section className={styles.panel}>
          <div className={styles.statsGrid}>
            <StatCard label="Total Markets" value={String(stats.total)} />
            <StatCard label="Live" value={String(stats.live)} tone="live" />
            <StatCard label="Awaiting Resolve" value={String(stats.ended)} tone="ended" />
            <StatCard label="Resolved" value={String(stats.resolved)} tone="resolved" />
            <StatCard label="Total Volume" value={`${stats.totalVol.toFixed(3)} tBNB`} tone="volume" />
          </div>
          <p className={styles.hint}>Resolution controls are in Manage Markets. Contract rule: only owner can resolve after market end.</p>
          <div className={styles.rowActions}>
            <button className={styles.secondaryBtn} onClick={() => setTab('markets')}>
              Open Resolve Controls
            </button>
          </div>
        </section>
      )}

      {tab === 'create' && (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Create A New Market</h2>
          <div className={styles.formGrid}>
            <label className={styles.fieldLabel}>
              Market Question
              <input
                className={styles.input}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Will BTC close above 120k this week?"
              />
            </label>
            <label className={styles.fieldLabel}>
              Duration (minutes)
              <input
                className={styles.input}
                type="number"
                min="1"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </label>
          </div>
          <label className={styles.fieldLabel}>
            Events (one per line or comma separated)
            <textarea
              className={styles.textarea}
              rows={5}
              value={eventNamesText}
              onChange={(e) => setEventNamesText(e.target.value)}
              placeholder="Team A&#10;Team B&#10;Team C"
            />
          </label>
          <div className={styles.rowActions}>
            <button className={styles.primaryBtn} onClick={() => { void handleCreate() }} disabled={!isOwner || isBusy || !question.trim() || !eventNamesText.trim()}>
              {busyAction === 'create-market' ? 'Creating...' : isOwner ? 'Create Market' : 'Owner Only'}
            </button>
            {!isOwner && <span className={styles.hint}>Only owner can create on-chain markets.</span>}
          </div>
        </section>
      )}

      {tab === 'markets' && (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Manage Markets</h2>
          <p className={styles.hint}>
            Resolve options are shown under each event. Contract rule: only owner can resolve after market end.
          </p>
          <p className={styles.hint}>
            Owner status: {isOwner ? 'Owner wallet connected' : 'Not owner wallet (resolve disabled)'}
          </p>
          <p className={styles.hint}>
            Connected: {account || 'Not connected'} | Contract owner: {CONTRACT_OWNER}
          </p>
          <div className={styles.marketList}>
            {markets.map((market) => {
              const isEnded = nowInSeconds > 0 && market.endTime <= nowInSeconds
              const canResolve = !market.resolved && isEnded
              const currentCat = storedCategories[String(market.id)] || getMarketCategory(market.id, market.question)
              const editing = metaEditing[market.id]
              const isMetaLoading = metaLoading[market.id]
              const isUploading = uploadingImage[market.id]

              return (
                <article key={market.id} className={styles.marketCard}>
                  <div className={styles.marketHead}>
                    <div>
                      <p className={styles.marketId}>#{market.id}</p>
                      <h3 className={styles.marketQuestion}>{market.question}</h3>
                    </div>
                    <span className={market.resolved ? styles.badgeResolved : isEnded ? styles.badgeEnded : styles.badgeLive}>
                      {market.resolved ? 'Resolved' : isEnded ? 'Ended' : 'Live'}
                    </span>
                  </div>
                  <div className={styles.marketMeta}>
                    <span>Pool: {formatToken(market.totalPool)} tBNB</span>
                    <span>{formatTimeLeft(market.endTime, nowInSeconds)}</span>
                  </div>

                  <div className={styles.controlsRow}>
                    <label className={styles.inlineLabel}>
                      Category
                      <select className={styles.select} value={currentCat} onChange={(e) => handleCategoryChange(market.id, e.target.value)}>
                        {AVAILABLE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className={styles.eventsGrid}>
                    {market.events.map((event) => (
                      <div key={event.id} className={styles.eventResolveCard}>
                        <p className={styles.eventName}>{event.name}</p>
                        <div className={styles.resolveButtons}>
                          <button
                            className={styles.resolveYes}
                            onClick={() => { void resolveMarket(market.id, 1, event.id) }}
                            disabled={!isOwner || isBusy || event.resolved || !canResolve}
                          >
                            {event.resolved ? 'Resolved' : !isOwner ? 'Owner Only' : !canResolve ? 'Market Live' : 'Resolve YES'}
                          </button>
                          <button
                            className={styles.resolveNo}
                            onClick={() => { void resolveMarket(market.id, 2, event.id) }}
                            disabled={!isOwner || isBusy || event.resolved || !canResolve}
                          >
                            {event.resolved ? 'Resolved' : !isOwner ? 'Owner Only' : !canResolve ? 'Market Live' : 'Resolve NO'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!editing ? (
                    <button className={styles.secondaryBtn} onClick={() => { void loadMeta(market.id) }}>
                      {isMetaLoading ? 'Loading...' : 'Edit Metadata'}
                    </button>
                  ) : (
                    <div className={styles.metaEditor}>
                      <div className={styles.imageRow}>
                        {editing.image_url && <img src={editing.image_url} alt="market" className={styles.preview} />}
                        <div className={styles.rowActions}>
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
                          <button className={styles.secondaryBtn} onClick={() => fileInputRefs.current[market.id]?.click()} disabled={isUploading}>
                            {isUploading ? 'Uploading...' : 'Upload Image'}
                          </button>
                          <button className={styles.ghostBtn} onClick={() => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], image_url: '' } }))}>Clear</button>
                        </div>
                      </div>

                      <label className={styles.fieldLabel}>
                        Description
                        <textarea
                          className={styles.textarea}
                          rows={3}
                          value={editing.description ?? ''}
                          onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], description: e.target.value } }))}
                        />
                      </label>

                      <label className={styles.fieldLabel}>
                        Rules
                        <textarea
                          className={styles.textarea}
                          rows={3}
                          value={editing.rules ?? ''}
                          onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], rules: e.target.value } }))}
                        />
                      </label>

                      <div className={styles.formGrid}>
                        <label className={styles.fieldLabel}>
                          YES label
                          <input
                            className={styles.input}
                            value={(editing as Record<string, unknown>).yes_label as string || ''}
                            onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], yes_label: e.target.value } }))}
                          />
                        </label>
                        <label className={styles.fieldLabel}>
                          NO label
                          <input
                            className={styles.input}
                            value={(editing as Record<string, unknown>).no_label as string || ''}
                            onChange={(e) => setMetaEditing((prev) => ({ ...prev, [market.id]: { ...prev[market.id], no_label: e.target.value } }))}
                          />
                        </label>
                      </div>

                      <div className={styles.rowActions}>
                        <button className={styles.primaryBtn} onClick={() => { void saveMeta(market.id) }} disabled={isMetaLoading}>
                          {isMetaLoading ? 'Saving...' : 'Save Metadata'}
                        </button>
                        <button
                          className={styles.ghostBtn}
                          onClick={() => setMetaEditing((prev) => {
                            const next = { ...prev }
                            delete next[market.id]
                            return next
                          })}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {tab === 'whitelist' && (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Whitelist Entries</h2>
          <div className={styles.filterRow}>
            <input
              className={styles.input}
              placeholder="Search by wallet or name"
              value={whitelistSearch}
              onChange={(e) => setWhitelistSearch(e.target.value)}
            />
            <select className={styles.select} value={whitelistFilter} onChange={(e) => setWhitelistFilter(e.target.value as WhitelistFilter)}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <button className={styles.secondaryBtn} onClick={() => { void loadWhitelist() }} disabled={whitelistLoading}>
              {whitelistLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div className={styles.whitelistTableWrap}>
            <table className={styles.whitelistTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Wallet</th>
                  <th>Status</th>
                  <th>Applied</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWhitelist.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyCell}>No entries found.</td>
                  </tr>
                ) : (
                  filteredWhitelist.map((entry) => {
                    const wallet = entry.wallet_address.toLowerCase()
                    const status = entry.status ?? 'pending'
                    const isRowBusy = whitelistActionBusy[wallet] === true
                    return (
                      <tr key={wallet}>
                        <td>{entry.name}</td>
                        <td>
                          <div>
                            <div>{entry.email || '-'}</div>
                            <div>{entry.telegram || '-'}</div>
                          </div>
                        </td>
                        <td title={wallet}>{shortenAddress(wallet)}</td>
                        <td><span className={status === 'approved' ? styles.statusApproved : status === 'rejected' ? styles.statusRejected : styles.statusPending}>{status}</span></td>
                        <td>{entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}</td>
                        <td>
                          <div className={styles.tableActions}>
                            <button className={styles.resolveYes} onClick={() => { void updateWhitelistStatus(wallet, 'approved') }} disabled={isRowBusy || status === 'approved'}>Approve</button>
                            <button className={styles.resolveNo} onClick={() => { void updateWhitelistStatus(wallet, 'rejected') }} disabled={isRowBusy || status === 'rejected'}>Reject</button>
                            <button className={styles.ghostBtn} onClick={() => { void updateWhitelistStatus(wallet, 'pending') }} disabled={isRowBusy || status === 'pending'}>Reset</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'team' && (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Admin Team</h2>
          <p className={styles.hint}>Owner can add/remove delegated admins for operations and metadata.</p>
          <div className={styles.rowActions}>
            <input
              className={styles.input}
              placeholder="0x..."
              value={newAdminAddress}
              onChange={(e) => setNewAdminAddress(e.target.value)}
              disabled={!isOwner}
            />
            <button className={styles.primaryBtn} onClick={handleAddAdmin} disabled={!isOwner || !newAdminAddress.trim()}>
              Add Admin
            </button>
          </div>
          {adminFeedback && <p className={styles.hint}>{adminFeedback}</p>}

          <div className={styles.adminList}>
            {adminAddresses.length === 0 ? (
              <div className={styles.emptyCell}>No delegated admins yet.</div>
            ) : (
              adminAddresses.map((address) => (
                <div key={address} className={styles.adminItem}>
                  <div>
                    <p className={styles.addr}>{address}</p>
                    <p className={styles.addrShort}>{shortenAddress(address)}</p>
                  </div>
                  <button className={styles.ghostBtn} onClick={() => removeAdminAddress(address)} disabled={!isOwner}>Remove</button>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  )
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'live' | 'ended' | 'resolved' | 'volume' }) {
  return (
    <div className={`${styles.statCard} ${
      tone === 'live' ? styles.statLive :
      tone === 'ended' ? styles.statEnded :
      tone === 'resolved' ? styles.statResolved :
      tone === 'volume' ? styles.statVolume : ''
    }`}>
      <p className={styles.statValue}>{value}</p>
      <p className={styles.statLabel}>{label}</p>
    </div>
  )
}
