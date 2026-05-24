'use client'

import { useWallet } from '../context/WalletContext'
import styles from './StatusBanner.module.css'

export default function StatusBanner() {
  const { status, setStatus } = useWallet()

  if (!status) return null

  return (
    <div className={`${styles.banner} ${styles[status.tone]}`}>
      <span className={styles.icon}>
        {status.tone === 'success' ? '✓' : status.tone === 'error' ? '✕' : 'ℹ'}
      </span>
      <span className={styles.text}>{status.text}</span>
      <button className={styles.close} onClick={() => setStatus(null)}>✕</button>
    </div>
  )
}
