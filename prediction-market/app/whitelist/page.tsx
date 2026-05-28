'use client'

import { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../context/WalletContext'
import { getWhitelistApplication, getWhitelistApplications, submitWhitelistApplication } from '../../lib/supabase'
import type { WhitelistApplication } from '../../lib/supabase'
import styles from './page.module.css'

const MIN_BNB = 0.01
const MAINNET_CHAIN_ID = 56
const DUMMY_INVESTOR_COUNT = 57
const JOINERS_PAGE_SIZE = 10

function maskIdentity(value: string): string {
  const cleaned = value.trim()
  if (cleaned.length <= 5) return cleaned
  return `${cleaned.slice(0, 2)}***${cleaned.slice(-3)}`
}

function buildDummyJoiners(total: number): WhitelistApplication[] {
  const now = Date.now()
  return Array.from({ length: total }, (_, index) => {
    const rank = index + 1
    const hex = rank.toString(16).padStart(40, '0')
    const status: WhitelistApplication['status'] =
      rank % 11 === 0 ? 'approved'
      : rank % 7 === 0 ? 'rejected'
      : 'pending'

    return {
      wallet_address: `0x${hex}`,
      name: `Investor ${String(rank).padStart(2, '0')}`,
      email: `investor${rank}@predictfi.demo`,
      telegram: `@investor${String(rank).padStart(2, '0')}`,
      status,
      created_at: new Date(now - (total - rank) * 60000).toISOString(),
    }
  })
}

export default function WhitelistPage() {
  const { account, walletProvider, setShowWalletModal, connectInjectedWallet } = useWallet()

  const [balance, setBalance] = useState<number | null>(null)
  const [isMainnet, setIsMainnet] = useState<boolean | null>(null)
  const [networkLabel, setNetworkLabel] = useState('Unknown')
  const [existing, setExisting] = useState<WhitelistApplication | null | undefined>(undefined)
  const [joinedList, setJoinedList] = useState<WhitelistApplication[]>([])
  const [form, setForm] = useState({ name: '', email: '', telegram: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [checkingBalance, setCheckingBalance] = useState(false)
  const [loadingJoined, setLoadingJoined] = useState(false)
  const [joinedPage, setJoinedPage] = useState(1)

  useEffect(() => {
    const loadJoinedList = async () => {
      setLoadingJoined(true)
      const rows = await getWhitelistApplications(300)
      setJoinedList(rows)
      setLoadingJoined(false)
    }
    void loadJoinedList()
  }, [])

  // Fetch balance and existing application
  useEffect(() => {
    if (!account) {
      setBalance(null)
      setIsMainnet(null)
      setNetworkLabel('Unknown')
      setExisting(undefined)
      return
    }
    setCheckingBalance(true)
    const fetchData = async () => {
      try {
        if (walletProvider) {
          const provider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
          const network = await provider.getNetwork()
          const chainId = Number(network.chainId)
          setIsMainnet(chainId === MAINNET_CHAIN_ID)
          setNetworkLabel(chainId === MAINNET_CHAIN_ID ? 'BNB Smart Chain Mainnet' : `Chain ${chainId}`)

          const bal = await provider.getBalance(account)
          setBalance(parseFloat(ethers.formatEther(bal)))
        } else {
          setBalance(0)
          setIsMainnet(false)
          setNetworkLabel('No wallet provider')
        }

        const app = await getWhitelistApplication(account)
        setExisting(app)
      } catch {
        setBalance(0)
        setIsMainnet(false)
        setNetworkLabel('Unable to read network')
      } finally {
        setCheckingBalance(false)
      }
    }
    void fetchData()
  }, [account, walletProvider])

  const hasEnoughBNB = balance !== null && balance >= MIN_BNB
  const isEligible = Boolean(hasEnoughBNB && isMainnet)

  const joinersWithFallback = useMemo(() => {
    const normalizedReal = joinedList.map((row) => ({
      ...row,
      email: row.email ?? '',
      telegram: row.telegram ?? '',
      status: row.status ?? 'pending',
    }))

    if (normalizedReal.length >= DUMMY_INVESTOR_COUNT) {
      return normalizedReal
    }

    const existingAddresses = new Set(normalizedReal.map((row) => row.wallet_address.toLowerCase()))
    const dummyRows = buildDummyJoiners(DUMMY_INVESTOR_COUNT)
      .filter((row) => !existingAddresses.has(row.wallet_address.toLowerCase()))

    return [...normalizedReal, ...dummyRows].slice(0, DUMMY_INVESTOR_COUNT)
  }, [joinedList])

  const joinedTotalPages = Math.max(1, Math.ceil(joinersWithFallback.length / JOINERS_PAGE_SIZE))
  const safeJoinedPage = Math.min(joinedPage, joinedTotalPages)
  const pageStart = (safeJoinedPage - 1) * JOINERS_PAGE_SIZE
  const pagedJoiners = useMemo(
    () => joinersWithFallback.slice(pageStart, pageStart + JOINERS_PAGE_SIZE),
    [joinersWithFallback, pageStart]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account || !isEligible) return

    setSubmitting(true)
    setSubmitError('')

    const result = await submitWhitelistApplication({
      wallet_address: account,
      name: form.name.trim(),
      email: form.email.trim(),
      telegram: form.telegram.trim(),
    })

    if (result.success) {
      setSubmitted(true)
      const [app, rows] = await Promise.all([
        getWhitelistApplication(account),
        getWhitelistApplications(300),
      ])
      setExisting(app)
      setJoinedList(rows)
    } else {
      setSubmitError(result.error ?? 'Submission failed. Please try again.')
    }

    setSubmitting(false)
  }

  const statusColor: Record<string, string> = {
    pending: '#f59e0b',
    approved: '#c084fc',
    rejected: '#ff3366',
  }

  return (
    <main className={styles.main}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Apply for Early Access</h1>
        <p className={styles.pageSub}>
          Secure your spot in the PredictFi PRFI token presale on{' '}
          <a href="https://moonsale.app" target="_blank" rel="noopener noreferrer" className={styles.link}>
            moonsale.app
          </a>{' '}
          · Jun 1–7 · 150 BNB raise
        </p>
      </div>

      {/* Main content */}
      <div className={styles.contentArea}>
        <section className={styles.leftPanel}>
          {!account ? (
            <div className={styles.connectCard}>
              <div className={styles.connectIcon}>Secure Access</div>
              <h2 className={styles.connectTitle}>Connect Your Wallet</h2>
              <p className={styles.connectSub}>Connect wallet first. Eligibility needs 0.01+ real BNB on BNB Smart Chain Mainnet.</p>
              <button
                className={styles.connectBtn}
                onClick={() => { void connectInjectedWallet() }}
              >
                Connect Wallet
              </button>
              <button className={styles.secondaryBtn} onClick={() => setShowWalletModal(true)}>
                More Wallet Options
              </button>
            </div>
          ) : checkingBalance ? (
            <div className={styles.loadingCard}>
              <div className={styles.spinner} />
              <p>Checking network and real BNB balance...</p>
            </div>
          ) : (
            <div className={styles.formArea}>
              <div className={`${styles.walletStatus} ${isEligible ? styles.walletOk : styles.walletFail}`}>
                <div className={styles.walletRow}>
                  <span className={styles.walletLabel}>Connected Wallet</span>
                  <span className={styles.walletAddr}>{maskIdentity(account)}</span>
                </div>
                <div className={styles.walletRow}>
                  <span className={styles.walletLabel}>Network</span>
                  <span className={styles.walletBal}>{networkLabel}</span>
                </div>
                <div className={styles.walletRow}>
                  <span className={styles.walletLabel}>BNB Balance</span>
                  <span className={styles.walletBal}>{balance !== null ? `${balance.toFixed(4)} BNB` : '...'}</span>
                </div>
                <div className={styles.walletRow}>
                  <span className={styles.walletLabel}>Eligibility</span>
                  <span className={`${styles.eligibility} ${isEligible ? styles.eligible : styles.ineligible}`}>
                    {isEligible ? 'Eligible (real BNB >= 0.01)' : 'Not eligible yet'}
                  </span>
                </div>
              </div>

              {existing && !submitted && (
                <div className={styles.existingCard}>
                  <div className={styles.existingTitle}>Your Application</div>
                  <div className={styles.existingRow}>
                    <span>Status</span>
                    <span className={styles.statusBadge} style={{ color: statusColor[existing.status ?? 'pending'], borderColor: statusColor[existing.status ?? 'pending'] }}>
                      {(existing.status ?? 'pending').toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.existingRow}>
                    <span>Name</span><span>{existing.name}</span>
                  </div>
                  <div className={styles.existingRow}>
                    <span>Email</span><span>{existing.email}</span>
                  </div>
                  <div className={styles.existingRow}>
                    <span>Telegram</span><span>{existing.telegram}</span>
                  </div>
                  <p className={styles.existingNote}>You can re-submit to update your information.</p>
                </div>
              )}

              {submitted && (
                <div className={styles.successCard}>
                  <div className={styles.successTitle}>Application Submitted</div>
                  <p>You are on the FCFS list. We will contact selected users before Jun 1.</p>
                </div>
              )}

              {!submitted && (
                <form onSubmit={(e) => { void handleSubmit(e) }} className={styles.form}>
                  <div className={styles.formTitle}>{existing ? 'Update Application' : 'Apply for Whitelist'}</div>

                  {(!isMainnet || !hasEnoughBNB) && (
                    <div className={styles.warningBanner}>
                      {!isMainnet
                        ? 'Use BNB Smart Chain Mainnet. Testnet balance is not accepted for whitelist eligibility.'
                        : `Need at least ${MIN_BNB} real BNB in this wallet. Current balance: ${(balance ?? 0).toFixed(4)} BNB.`}
                    </div>
                  )}

                  <div className={styles.field}>
                    <label className={styles.label}>Full Name <span className={styles.required}>*</span></label>
                    <input
                      className={styles.input}
                      type="text"
                      placeholder="Satoshi Nakamoto"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Email Address <span className={styles.required}>*</span></label>
                    <input
                      className={styles.input}
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Telegram Handle <span className={styles.required}>*</span></label>
                    <input
                      className={styles.input}
                      type="text"
                      placeholder="@yourhandle"
                      value={form.telegram}
                      onChange={(e) => setForm((p) => ({ ...p, telegram: e.target.value }))}
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Wallet Address</label>
                    <input
                      className={`${styles.input} ${styles.inputDisabled}`}
                      type="text"
                      value={account}
                      readOnly
                    />
                  </div>

                  {submitError && <div className={styles.errorMsg}>{submitError}</div>}

                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={submitting || !form.name || !form.email || !form.telegram || !isEligible}
                  >
                    {submitting ? 'Submitting...' : existing ? 'Update Application' : 'Apply for Whitelist'}
                  </button>
                </form>
              )}
            </div>
          )}
        </section>

        <aside className={styles.rightPanel}>
          <div className={styles.infoCard}>
            <h3 className={styles.infoTitle}>Why Join The Whitelist</h3>
            <p className={styles.infoText}>Whitelist users get priority consideration for the PRFI presale allocation.</p>
            <div className={styles.infoList}>
              <div className={styles.infoItem}>First come, first serve review order.</div>
              <div className={styles.infoItem}>Minimum eligibility: 0.01 real BNB on BNB Mainnet.</div>
              <div className={styles.infoItem}>Application data can be updated anytime before final review.</div>
            </div>
          </div>

          <div className={styles.feedCard}>
            <div className={styles.feedHeader}>
              <h3 className={styles.feedTitle}>Whitelist Joiners</h3>
              <span className={styles.feedCount}>{joinersWithFallback.length} joined</span>
            </div>
            <p className={styles.feedSub}>Ordered by join time (oldest first). Dynamic list with pagination.</p>

            <div className={styles.feedList}>
              {loadingJoined ? (
                <div className={styles.feedEmpty}>Loading joiners...</div>
              ) : joinersWithFallback.length === 0 ? (
                <div className={styles.feedEmpty}>No applications yet.</div>
              ) : (
                pagedJoiners.map((row, index) => (
                  <div key={`${row.wallet_address}-${row.created_at ?? index}`} className={styles.feedRow}>
                    <span className={styles.feedRank}>#{pageStart + index + 1}</span>
                    <span className={styles.feedName}>{maskIdentity(row.name || 'Unknown')}</span>
                    <span className={styles.feedAddress}>{maskIdentity(row.wallet_address)}</span>
                    <span className={styles.feedStatus}>{(row.status ?? 'pending').toUpperCase()}</span>
                  </div>
                ))
              )}
            </div>

            {joinersWithFallback.length > JOINERS_PAGE_SIZE && (
              <div className={styles.feedPager}>
                <button
                  className={styles.feedPagerBtn}
                  onClick={() => setJoinedPage((current) => Math.max(1, current - 1))}
                  disabled={safeJoinedPage <= 1}
                >
                  ← Prev
                </button>
                <span className={styles.feedPagerMeta}>Page {safeJoinedPage} / {joinedTotalPages}</span>
                <button
                  className={styles.feedPagerBtn}
                  onClick={() => setJoinedPage((current) => Math.min(joinedTotalPages, current + 1))}
                  disabled={safeJoinedPage >= joinedTotalPages}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}
