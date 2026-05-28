'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { RiTwitterXLine, RiTelegramLine, RiDiscordLine } from 'react-icons/ri'
import { useWallet } from '../context/WalletContext'
import styles from './Sidebar.module.css'

const NAV = [
  { href: '/', label: 'Home', d: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { href: '/markets', label: 'Markets', d: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z' },
  { href: '/portfolio', label: 'Portfolio', d: 'M21.21 15.89A10 10 0 118 2.83M22 12A10 10 0 0012 2v10z' },
  { href: '/activity', label: 'Activity', d: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { href: '/leaderboard', label: 'Leaderboard', d: 'M18 20V10M12 20V4M6 20v-6' },
  { href: '/whitelist', label: 'Whitelist', d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
]

const MENU_LINKS = [
  { href: '/#prfi', label: 'PRFI Token', d: 'M12 2l3 3-3 3-3-3 3-3z M12 8v12 M7 15h10' },
  { href: '/whitepaper', label: 'Whitepaper', d: 'M6 3h9l3 3v15H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M15 3v4h4' },
  { href: '/pitchdeck', label: 'Pitchdeck', d: 'M4 19h16 M7 14l3-4 3 2 4-6' },
  { href: '/tokonomics', label: 'Tokenomics', d: 'M12 3v18 M5 8h14 M5 16h14' },
  { href: '/roadmap', label: 'Roadmap', d: 'M5 3v18 M5 4h10l-2 3 2 3H5' },
  { href: '/#social', label: 'Social', d: 'M18 8a3 3 0 1 0-2.8-4 M6 14a3 3 0 1 0 2.8 4 M8.7 15.2l6.6 3.6 M15.3 5.2L8.7 8.8' },
]

const DOC_MENU_LINKS = [
  { href: '/whitepaper', label: 'Whitepaper', d: 'M6 3h9l3 3v15H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M15 3v4h4' },
  { href: '/pitchdeck', label: 'Pitchdeck', d: 'M4 19h16 M7 14l3-4 3 2 4-6' },
  { href: '/tokonomics', label: 'Tokenomics', d: 'M12 3v18 M5 8h14 M5 16h14' },
  { href: '/roadmap', label: 'Roadmap', d: 'M5 3v18 M5 4h10l-2 3 2 3H5' },
]

const SOCIAL_LINKS = [
  { Icon: RiTwitterXLine, href: 'https://x.com/predictfi', label: 'Twitter / X' },
  { Icon: RiTelegramLine, href: 'https://t.me/predictfi', label: 'Telegram' },
  { Icon: RiDiscordLine, href: 'https://discord.gg/predictfi', label: 'Discord' },
]

export default function Sidebar({ docsOnly = false }: { docsOnly?: boolean }) {
  const pathname = usePathname()
  const { account, getEffectiveProvider } = useWallet()
  const [balance, setBalance] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const desktopLinks = docsOnly ? DOC_MENU_LINKS : NAV
  const mobileLinks = docsOnly ? [] : MENU_LINKS

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  useEffect(() => {
    if (docsOnly || !account) {
      const timer = setTimeout(() => {
        setBalance(null)
      }, 0)
      return () => clearTimeout(timer)
    }

    let cancelled = false
    const fetchBal = async () => {
      try {
        const provider = getEffectiveProvider()
        if (!provider) return
        const ethProvider = new ethers.BrowserProvider(provider)
        const bal = await ethProvider.getBalance(account)
        if (!cancelled) setBalance(parseFloat(ethers.formatEther(bal)).toFixed(4))
      } catch {
        // silent
      }
    }

    void fetchBal()
    const id = setInterval(fetchBal, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [account, docsOnly, getEffectiveProvider])

  return (
    <>
      <button
        className={`${styles.hamburger} ${docsOnly ? styles.hamburgerDocs : ''}`}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
      >
        {mobileOpen ? (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" />
            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" />
            <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" />
            <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" />
          </svg>
        )}
      </button>

      <div
        className={`${styles.overlay} ${mobileOpen ? styles.overlayVisible : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside className={`${styles.sidebar} ${docsOnly ? styles.sidebarDocs : ''} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logoWrap}>
          <Link href="/" className={styles.logo} onClick={() => setMobileOpen(false)}>
            <span className={styles.logoGreen}>Predict</span>
            <span className={styles.logoDot}>&#x2022;</span>
            <span className={styles.logoFi}>Fi</span>
          </Link>
          <span className={styles.beta}>BETA</span>
        </div>

        <nav className={styles.nav}>
          {desktopLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <svg className={styles.icon} viewBox="0 0 24 24" fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                {item.d.split('M').filter(Boolean).map((segment, index) => (
                  <path key={index} d={`M${segment}`} />
                ))}
              </svg>
              <span>{item.label}</span>
            </Link>
          ))}

          {!docsOnly && (
            <div className={styles.mobileOnlyMenu}>
              <div className={styles.navDivider} />

              {mobileLinks.map((item) => (
                <Link key={item.label} href={item.href} className={styles.navItem} onClick={() => setMobileOpen(false)}>
                  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                    {item.d.split('M').filter(Boolean).map((segment, index) => (
                      <path key={index} d={`M${segment}`} />
                    ))}
                  </svg>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>

        {!docsOnly && (
          <div className={styles.bottom}>
            {account && (
              <div className={styles.balanceCard}>
                <span className={styles.balLabel}>tBNB Balance</span>
                <div className={styles.balRow}>
                  <span className={styles.balDrop}>&#x1F4A7;</span>
                  <span className={styles.balValue}>{balance ?? '...'}</span>
                </div>
              </div>
            )}

            <div className={styles.avatarRow}>
              <div className={styles.avatar}>{account ? account.slice(2, 3).toUpperCase() : 'N'}</div>
            </div>

            <div className={styles.mobileSocialRow}>
              {SOCIAL_LINKS.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.mobileSocialIcon}
                  aria-label={label}
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
