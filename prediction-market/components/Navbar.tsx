'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { RiSettings3Line, RiTwitterXLine, RiTelegramLine, RiDiscordLine } from 'react-icons/ri'
import { useWallet } from '../context/WalletContext'
import { shortenAddress } from '../lib/utils'
import { CHAIN_ID } from '../lib/contract'
import { getUserProfile } from '../lib/supabase'
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
  } = useWallet()
  const [profileName, setProfileName] = useState('')

  useEffect(() => {
    if (!account) return

    let cancelled = false
    const timer = setTimeout(() => {
      void getUserProfile(account).then((profile) => {
        if (cancelled) return
        setProfileName(profile?.display_name?.trim() || '')
      })
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [account])

  const networkLabel =
    activeChainId === null ? 'Unknown'
    : activeChainId === CHAIN_ID ? 'BSC Testnet'
    : 'Wrong Network'

  return (
    <header className={styles.header}>
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
          {!account ? (
            <button
              className={styles.connectBtn}
              onClick={() => setShowWalletModal(true)}
              disabled={isBusy && busyAction?.startsWith('connect')}
            >
              {isBusy && busyAction?.startsWith('connect') ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : (
            <div className={styles.accountGroup}>
              {profileName && (
                <Link href={`/profile/${account}`} className={styles.profileNamePill}>
                  {profileName}
                </Link>
              )}
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
              <button className={styles.accountPill} onClick={() => setShowWalletModal(true)}>
                {shortenAddress(account)}
                <span className={styles.chevron}>v</span>
              </button>
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