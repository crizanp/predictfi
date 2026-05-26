'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../context/WalletContext'
import { shortenAddress } from '../lib/utils'
import styles from './Sidebar.module.css'

const NAV = [
  {
    href: '/',
    label: 'Home',
    d: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  },
  {
    href: '/markets',
    label: 'Markets',
    d: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  },
  {
    href: '/portfolio',
    label: 'Portfolio',
    d: 'M21.21 15.89A10 10 0 118 2.83M22 12A10 10 0 0012 2v10z',
  },
  {
    href: '/activity',
    label: 'Activity',
    d: 'M22 12h-4l-3 9L9 3l-3 9H2',
  },
  {
    href: '/leaderboard',
    label: 'Leaderboard',
    d: 'M18 20V10M12 20V4M6 20v-6',
  },
  {
    href: '/whitelist',
    label: 'Whitelist',
    d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    href: '/ads',
    label: 'Ads',
    d: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  },
  {
    href: '#',
    label: 'Create Market',
    d: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v8M8 12h8',
  },
  {
    href: '#',
    label: 'Governance',
    d: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { account, getEffectiveProvider } = useWallet()
  const [balance, setBalance] = useState<string | null>(null)

  useEffect(() => {
    if (!account) { setBalance(null); return }
    let cancelled = false
    const fetchBal = async () => {
      try {
        const provider = getEffectiveProvider()
        if (!provider) return
        const ethProvider = new ethers.BrowserProvider(provider)
        const bal = await ethProvider.getBalance(account)
        if (!cancelled) setBalance(parseFloat(ethers.formatEther(bal)).toFixed(4))
      } catch { /* silent */ }
    }
    void fetchBal()
    const id = setInterval(fetchBal, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [account, getEffectiveProvider])

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logoWrap}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoGreen}>Predict</span>
          <span className={styles.logoDot}>•</span>
          <span className={styles.logoFi}>Fi</span>
        </Link>
        <span className={styles.beta}>BETA</span>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {NAV.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
          >
            <svg className={styles.icon} viewBox="0 0 24 24" fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              {item.d.split('M').filter(Boolean).map((seg, i) => (
                <path key={i} d={`M${seg}`} />
              ))}
            </svg>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className={styles.bottom}>
        {account && (
          <div className={styles.balanceCard}>
            <span className={styles.balLabel}>tBNB Balance</span>
            <div className={styles.balRow}>
              <span className={styles.balDrop}>�</span>
              <span className={styles.balValue}>{balance ?? '...'}</span>
            </div>
          </div>
        )}
        <div className={styles.avatarRow}>
          <div className={styles.avatar}>
            {account ? account.slice(2, 3).toUpperCase() : 'N'}
          </div>
          {account && <span className={styles.avatarAddr}>{shortenAddress(account)}</span>}
          {account && <span className={styles.avatarArrow}>›</span>}
        </div>
      </div>
    </aside>
  )
}
