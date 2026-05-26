'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../../context/WalletContext'
import { useMarkets } from '../../../context/MarketsContext'
import {
  getUserProfile,
  upsertUserProfile,
  getUserContributionSummary,
  getUserRecentActivity,
  type UserContributionSummary,
  type UserProfile,
  type MarketActivity,
} from '../../../lib/supabase'
import styles from './page.module.css'

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function PublicProfilePage() {
  const params = useParams()
  const rawAddress = String(params?.address ?? '')
  const address = rawAddress.toLowerCase()

  const { account } = useWallet()
  const { markets } = useMarkets()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [summary, setSummary] = useState<UserContributionSummary>({
    predictions: 0,
    comments: 0,
    markets_participated: 0,
    total_staked_tbnb: 0,
  })
  const [activity, setActivity] = useState<MarketActivity[]>([])

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')

  const isValidAddress = useMemo(() => ethers.isAddress(rawAddress), [rawAddress])
  const isSelf = useMemo(() => {
    if (!account || !isValidAddress) return false
    return account.toLowerCase() === address
  }, [account, address, isValidAddress])

  const marketQuestionById = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of markets) map.set(m.id, m.question)
    return map
  }, [markets])

  const loadProfileData = useCallback(async () => {
    if (!isValidAddress) {
      setError('Invalid wallet address')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [profileData, summaryData, activityData] = await Promise.all([
      getUserProfile(address),
      getUserContributionSummary(address),
      getUserRecentActivity(address, 30),
    ])

    setProfile(profileData)
    setSummary(summaryData)
    setActivity(activityData)
    setDisplayName(profileData?.display_name ?? '')
    setBio(profileData?.bio ?? '')
    setLoading(false)
  }, [address, isValidAddress])

  useEffect(() => {
    const timer = setTimeout(() => { void loadProfileData() }, 0)
    return () => clearTimeout(timer)
  }, [loadProfileData])

  const handleSave = useCallback(async () => {
    if (!isSelf) return
    setSaving(true)
    const res = await upsertUserProfile(address, displayName, bio)
    if (!res.success) {
      setError(res.error ?? 'Could not save profile')
      setSaving(false)
      return
    }
    await loadProfileData()
    setSaving(false)
  }, [address, bio, displayName, isSelf, loadProfileData])

  if (!isValidAddress) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <p className={styles.error}>Invalid profile address.</p>
        </div>
      </main>
    )
  }

  const shownName = profile?.display_name?.trim() || shorten(address)

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>{shownName}</h1>
            <p className={styles.address}>{shorten(address)}</p>
          </div>
          <Link href="/markets" className={styles.backLink}>Back to markets</Link>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <section className={styles.statsGrid}>
          <article className={styles.statCard}><span className={styles.statNum}>{summary.predictions}</span><span className={styles.statLabel}>Predictions</span></article>
          <article className={styles.statCard}><span className={styles.statNum}>{summary.comments}</span><span className={styles.statLabel}>Comments</span></article>
          <article className={styles.statCard}><span className={styles.statNum}>{summary.markets_participated}</span><span className={styles.statLabel}>Markets Joined</span></article>
          <article className={styles.statCard}><span className={styles.statNum}>{summary.total_staked_tbnb.toFixed(3)}</span><span className={styles.statLabel}>Total Staked tBNB</span></article>
        </section>

        {isSelf && (
          <section className={styles.editorCard}>
            <h2 className={styles.sectionTitle}>Edit Public Profile</h2>
            <label className={styles.label}>Display Name</label>
            <input
              type="text"
              className={styles.input}
              placeholder="e.g. CryptoAnalyst99"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
            />
            <label className={styles.label}>Bio</label>
            <textarea
              className={styles.textarea}
              placeholder="What do you contribute to PredictFi?"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={180}
            />
            <button type="button" className={styles.saveBtn} onClick={() => { void handleSave() }} disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </section>
        )}

        <section className={styles.singleCol}>
          <article className={styles.listCard}>
            <h2 className={styles.sectionTitle}>Recent Contribution Activity</h2>
            {loading ? (
              <p className={styles.empty}>Loading activity...</p>
            ) : activity.length === 0 ? (
              <p className={styles.empty}>No trades yet.</p>
            ) : (
              <div className={styles.list}>
                {activity.map((row) => {
                  const q = marketQuestionById.get(row.market_id) ?? `Market #${row.market_id}`
                  return (
                    <div key={row.id} className={styles.itemRow}>
                      <span className={styles.itemTitle}>{row.choice === 1 ? 'UP/YES' : 'DOWN/NO'} on {q}</span>
                      <span className={styles.itemMeta}>{parseFloat(row.amount_eth).toFixed(4)} tBNB · {new Date(row.created_at).toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  )
}
