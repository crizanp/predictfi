'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '../../context/WalletContext'
import styles from './profile-home.module.css'

export default function ProfileHomePage() {
  const router = useRouter()
  const { account, setShowWalletModal } = useWallet()

  useEffect(() => {
    if (account) router.replace(`/profile/${account}`)
  }, [account, router])

  if (account) {
    return (
      <main className={styles.wrap}>
        <div className={styles.card}>Redirecting to your profile...</div>
      </main>
    )
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Public Profiles</h1>
        <p className={styles.text}>Connect your wallet to open your profile page.</p>
        <button type="button" className={styles.btn} onClick={() => setShowWalletModal(true)}>
          Connect Wallet
        </button>
      </div>
    </main>
  )
}
