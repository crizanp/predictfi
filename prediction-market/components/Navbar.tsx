'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { RiSettings3Line, RiTwitterXLine, RiTelegramLine, RiDiscordLine } from 'react-icons/ri'
import { useWallet } from '../context/WalletContext'
import { CHAIN_ID } from '../lib/contract'
import styles from './Navbar.module.css'

const SOCIAL_LINKS = [
  { Icon: RiTwitterXLine,  href: 'https://x.com/predictfi',       label: 'Twitter / X' },
  { Icon: RiTelegramLine,  href: 'https://t.me/predictfi',         label: 'Telegram' },
  { Icon: RiDiscordLine,   href: 'https://discord.gg/predictfi',   label: 'Discord' },
]

const HOME_NAV = [
  { label: 'PRFI Token', href: '#prfi' },
  { label: 'Whitepaper', href: '/whitepaper' },
  { label: 'Pitchdeck', href: '/pitchdeck' },
  { label: 'Roadmap', href: '/roadmap' },
]

export default function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === '/'

  const {
    account,
    isAdmin,
    activeChainId,
    isWrongNetwork,
    isBusy,
    busyAction,
    setShowWalletModal,
    setShowAdminPortal,
    switchActiveNetwork,
    authUser,
    isAuthenticated,
    logoutUser,
  } = useWallet()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      window.requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - lastY.current

        if (y < 24 || delta < -10) {
          setHidden(false)
        } else if (delta > 10) {
          setHidden(true)
          setMenuOpen(false)
        }

        lastY.current = y
        ticking.current = false
      })
    }

    lastY.current = window.scrollY
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const networkLabel =
    activeChainId === null ? 'Unknown'
    : activeChainId === CHAIN_ID ? 'BSC Testnet'
    : 'Wrong Network'

  return (
    <header className={`${styles.header} ${hidden ? styles.headerHidden : ''}`}>
      <div className={styles.controlsRow}>
        <div className={styles.pageNavLeft}>
          <Link href="/" className={styles.backToHome}>← PredictFi</Link>
          <nav className={styles.homeNav}>
            {HOME_NAV.map((item) => {
              const href = item.href.startsWith('#') && !isHome ? `/${item.href}` : item.href
              if (href.startsWith('#')) {
                return (
                  <a key={item.label} href={href} className={styles.homeNavLink}>
                    {item.label}
                  </a>
                )
              }
              return (
                <Link key={item.label} href={href} className={styles.homeNavLink}>
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className={styles.mobileCenterBrand}>
          <span className={styles.brandPredict}>Predict</span>
          <span className={styles.brandDot}>•</span>
          <span className={styles.brandFi}>Fi</span>
        </div>

        <div className={styles.right}>
          <div className={styles.socialLinks}>
            {SOCIAL_LINKS.map(({ Icon, href, label }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                 className={styles.socialIcon} aria-label={label}>
                <Icon />
              </a>
            ))}
          </div>
          {isAdmin && (
            <button className={styles.adminBtn} onClick={() => setShowAdminPortal(true)}>
              <RiSettings3Line className={styles.adminIcon} /> ADMIN
            </button>
          )}
          {!isAuthenticated ? (
            <button
              className={styles.connectBtn}
              onClick={() => setShowWalletModal(true)}
              disabled={isBusy && busyAction?.startsWith('connect')}
            >
              {isBusy && busyAction?.startsWith('connect') ? 'Connecting...' : 'Login / Signup'}
            </button>
          ) : (
            <div className={styles.accountGroup}>
              {isWrongNetwork ? (
                <button
                  className={styles.switchNetBtn}
                  onClick={() => { void switchActiveNetwork() }}
                  disabled={isBusy}
                >
                  {busyAction === 'switch-network' ? 'Switching...' : 'Wrong Network'}
                </button>
              ) : (
                <div className={styles.networkPill}>
                  <span className={styles.networkDot} />
                  {networkLabel}
                </div>
              )}
              <div className={styles.userMenuWrap}>
                <button
                  className={styles.accountPill}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen((open) => !open)
                  }}
                >
                  {authUser?.username || 'Account'}
                  <span className={styles.chevron}>v</span>
                </button>
                {menuOpen && (
                  <div className={styles.userMenu} onClick={(e) => e.stopPropagation()}>
                    <Link href={`/profile/${authUser?.address || account}`} className={styles.userMenuItem}>
                      View Profile
                    </Link>
                    <button
                      className={styles.userMenuItem}
                      onClick={() => {
                        const code = authUser?.username || 'predictfi'
                        const url = `${window.location.origin}/?ref=${encodeURIComponent(code)}`
                        void navigator.clipboard.writeText(url)
                        setMenuOpen(false)
                      }}
                    >
                      Refer Friend
                    </button>
                    <button
                      className={`${styles.userMenuItem} ${styles.userMenuDanger}`}
                      onClick={() => {
                        void logoutUser()
                        setMenuOpen(false)
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

     
      {/* Wrong-network banner — shown below nav, full width */}
      {account && isWrongNetwork && (
        <div className={styles.wrongNetworkBanner}>
          <span>⚠ Wrong network selected. Please switch to BSC Testnet.</span>
          <button
            className={styles.switchNetBannerBtn}
            onClick={() => { void switchActiveNetwork() }}
            disabled={isBusy}
          >
            {busyAction === 'switch-network' ? 'Switching…' : 'Switch Network'}
          </button>
        </div>
      )}

    </header>
  )
}