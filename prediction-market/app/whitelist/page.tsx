'use client'

import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../context/WalletContext'
import { getWhitelistApplication, submitWhitelistApplication } from '../../lib/supabase'
import type { WhitelistApplication } from '../../lib/supabase'
import styles from './page.module.css'

const MIN_BNB = 0.1

export default function WhitelistPage() {
  const { account, walletProvider, setShowWalletModal } = useWallet()

  const [balance, setBalance] = useState<number | null>(null)
  const [existing, setExisting] = useState<WhitelistApplication | null | undefined>(undefined)
  const [form, setForm] = useState({ name: '', email: '', telegram: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [checkingBalance, setCheckingBalance] = useState(false)

  // Fetch balance and existing application
  useEffect(() => {
    if (!account) { setBalance(null); setExisting(undefined); return }
    setCheckingBalance(true)
    const fetchData = async () => {
      try {
        // get balance
        if (walletProvider) {
          const provider = new ethers.BrowserProvider(walletProvider as Parameters<typeof ethers.BrowserProvider>[0])
          const bal = await provider.getBalance(account)
          setBalance(parseFloat(ethers.formatEther(bal)))
        }
        // check existing application
        const app = await getWhitelistApplication(account)
        setExisting(app)
      } catch {
        setBalance(0)
      } finally {
        setCheckingBalance(false)
      }
    }
    void fetchData()
  }, [account, walletProvider])

  const hasEnoughBNB = balance !== null && balance >= MIN_BNB

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account) return
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
      const app = await getWhitelistApplication(account)
      setExisting(app)
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
        <div className={styles.headerBadge}>PRESALE WHITELIST</div>
        <h1 className={styles.pageTitle}>Apply for Early Access</h1>
        <p className={styles.pageSub}>
          Secure your spot in the PredictFi PRFI token presale on{' '}
          <a href="https://moonsale.app" target="_blank" rel="noopener noreferrer" className={styles.link}>
            moonsale.app
          </a>{' '}
          · Jun 1–7 · 150 BNB raise
        </p>
      </div>

      {/* Rules card */}
      <div className={styles.rulesCard}>
        <div className={styles.rulesTitle}>Eligibility Rules</div>
        <ul className={styles.rulesList}>
          <li className={styles.rulesItem}>
            <span className={styles.ruleIcon}>💜</span>
            <div>
              <strong>Minimum 0.1 BNB balance</strong> in your connected wallet.
              Your BNB is <em>not deducted</em> — it just proves you&apos;re a real participant.
            </div>
          </li>
          <li className={styles.rulesItem}>
            <span className={styles.ruleIcon}>🔗</span>
            <div><strong>Wallet must be connected</strong> to BSC Testnet at time of application.</div>
          </li>
          <li className={styles.rulesItem}>
            <span className={styles.ruleIcon}>📋</span>
            <div>One application per wallet address. Duplicates update your existing application.</div>
          </li>
          <li className={styles.rulesItem}>
            <span className={styles.ruleIcon}>✅</span>
            <div>Selected applicants will be contacted via email/Telegram before presale opens.</div>
          </li>
        </ul>
      </div>

      {/* Main content */}
      <div className={styles.contentArea}>

        {!account ? (
          <div className={styles.connectCard}>
            <div className={styles.connectIcon}>🔒</div>
            <h2 className={styles.connectTitle}>Connect Your Wallet</h2>
            <p className={styles.connectSub}>Connect your wallet to check eligibility and apply.</p>
            <button className={styles.connectBtn} onClick={() => setShowWalletModal(true)}>
              Connect Wallet
            </button>
          </div>
        ) : checkingBalance ? (
          <div className={styles.loadingCard}>
            <div className={styles.spinner} />
            <p>Checking your wallet balance...</p>
          </div>
        ) : (
          <div className={styles.formArea}>

            {/* Wallet status */}
            <div className={`${styles.walletStatus} ${hasEnoughBNB ? styles.walletOk : styles.walletFail}`}>
              <div className={styles.walletRow}>
                <span className={styles.walletLabel}>Connected Wallet</span>
                <span className={styles.walletAddr}>{account.slice(0, 6)}…{account.slice(-4)}</span>
              </div>
              <div className={styles.walletRow}>
                <span className={styles.walletLabel}>BNB Balance</span>
                <span className={styles.walletBal}>
                  {balance !== null ? `${balance.toFixed(4)} BNB` : '…'}
                </span>
              </div>
              <div className={styles.walletRow}>
                <span className={styles.walletLabel}>Eligibility</span>
                <span className={`${styles.eligibility} ${hasEnoughBNB ? styles.eligible : styles.ineligible}`}>
                  {hasEnoughBNB ? '✓ Eligible (≥ 0.1 BNB)' : `✗ Need ≥ 0.1 BNB (have ${(balance ?? 0).toFixed(4)})`}
                </span>
              </div>
            </div>

            {/* Existing application status */}
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
                <div className={styles.successIcon}>🎉</div>
                <div className={styles.successTitle}>Application Submitted!</div>
                <p>You&apos;re on the list. We&apos;ll contact you before Jun 1 if selected.</p>
              </div>
            )}

            {/* Form */}
            {!submitted && (
              <form onSubmit={(e) => { void handleSubmit(e) }} className={styles.form}>
                <div className={styles.formTitle}>{existing ? 'Update Application' : 'Apply for Whitelist'}</div>

                {!hasEnoughBNB && (
                  <div className={styles.warningBanner}>
                    ⚠ Your balance is below the minimum 0.1 BNB required. You can still fill the form, but your application won&apos;t be eligible.
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
                  disabled={submitting || !form.name || !form.email || !form.telegram}
                >
                  {submitting ? 'Submitting…' : existing ? 'Update Application' : 'Apply for Whitelist'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
