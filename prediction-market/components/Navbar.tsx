'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { RiSettings3Line, RiTwitterXLine, RiTelegramLine, RiDiscordLine } from 'react-icons/ri'
import { useWallet } from '../context/WalletContext'
import { useMarkets } from '../context/MarketsContext'
import { shortenAddress } from '../lib/utils'
import { CHAIN_ID } from '../lib/contract'
import styles from './Navbar.module.css'

interface TickerItem { label: string; type: 'buy' | 'sell' | 'neutral' }

const DUMMY_ADDRS = ['0xaBc1', '0xDef2', '0x1234', '0xFeed', '0x9aB3', '0x7c3D', '0xBee5', '0xC0de', '0xD3aD', '0xF00d', '0xA55e', '0xB0b5']

function buildTickerItems(markets: { question: string; resolved: boolean }[]): TickerItem[] {
  if (markets.length === 0) return [
    { label: '0xaBc1 bought YES on "BTC hits $120K" +0.05 tBNB', type: 'buy' },
    { label: '0xDef2 bought NO on "ETH flips BTC?" +0.02 tBNB', type: 'sell' },
    { label: '0x1234 bought YES on "Next halving bull run?" +0.1 tBNB', type: 'buy' },
  ]

  return markets.slice(0, 9).map((m) => {
    const addr = DUMMY_ADDRS[Math.floor(Math.random() * DUMMY_ADDRS.length)]
    const side = Math.random() > 0.45 ? 'YES' : 'NO'
    const amt  = (Math.random() * 0.19 + 0.01).toFixed(2)
    const type: 'buy' | 'sell' | 'neutral' = m.resolved ? 'neutral' : side === 'YES' ? 'buy' : 'sell'
    const q    = m.question.length > 38 ? m.question.slice(0, 38) + '…' : m.question
    if (m.resolved) return { label: `RESOLVED: "${q}" — winners claimed`, type }
    return { label: `${addr} bought ${side} on "${q}" +${amt} tBNB`, type }
  })
}

const SOCIAL_LINKS = [
  { Icon: RiTwitterXLine,  href: 'https://x.com/predictfi',       label: 'Twitter / X' },
  { Icon: RiTelegramLine,  href: 'https://t.me/predictfi',         label: 'Telegram' },
  { Icon: RiDiscordLine,   href: 'https://discord.gg/predictfi',   label: 'Discord' },
]

const HOME_NAV = [
  { label: 'PRFI Token', href: '#prfi' },
  { label: 'Whitepaper', href: '#whitepaper' },
  { label: 'Whitelist', href: '/whitelist' },
  { label: 'Partnership', href: '#partnership' },
  { label: 'Social', href: '#social' },
]

const INNER_NAV = [
  { label: 'Markets', href: '/markets' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'Activity', href: '/activity' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Whitelist', href: '/whitelist' },
]

export default function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === '/'

  const {
    account,
    isOwner,
    activeChainId,
    isWrongNetwork,
    isBusy,
    busyAction,
    setShowWalletModal,
    setShowAdminPortal,
    switchActiveNetwork,
  } = useWallet()
  const { markets } = useMarkets()

  const latestMarketsRef = useRef(markets)
  useEffect(() => { latestMarketsRef.current = markets }, [markets])

  const [tickerItems, setTickerItems] = useState<TickerItem[]>(() => buildTickerItems([]))

  // Generate ticker from real markets; refresh at a random interval (5–13 s)
  const hasMarkets = markets.length > 0
  useEffect(() => {
    if (!hasMarkets) return
    setTickerItems(buildTickerItems(latestMarketsRef.current))

    let id: ReturnType<typeof setTimeout>
    const schedule = () => {
      id = setTimeout(() => {
        setTickerItems(buildTickerItems(latestMarketsRef.current))
        schedule()
      }, 5000 + Math.random() * 8000)
    }
    schedule()
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMarkets])

  const tickerAll = useMemo(() => [...tickerItems, ...tickerItems], [tickerItems])

  const networkLabel =
    activeChainId === null ? 'Unknown'
    : activeChainId === CHAIN_ID ? 'BSC Testnet'
    : 'Wrong Network'

  return (
    <header className={styles.header}>
      <div className={styles.controlsRow}>
        {isHome ? (
          <nav className={styles.homeNav}>
            {HOME_NAV.map(item => (
              <a key={item.label} href={item.href} className={styles.homeNavLink}>
                {item.label}
              </a>
            ))}
          </nav>
        ) : (
          <div className={styles.pageNavLeft}>
            <Link href="/" className={styles.backToHome}>← PredictFi</Link>
            <nav className={styles.innerNav}>
              {INNER_NAV.map(item => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`${styles.innerNavLink} ${pathname === item.href ? styles.activeLink : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
        <div className={styles.right}>
          <div className={styles.socialLinks}>
            {SOCIAL_LINKS.map(({ Icon, href, label }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                 className={styles.socialIcon} aria-label={label}>
                <Icon />
              </a>
            ))}
          </div>
          {isOwner && (
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