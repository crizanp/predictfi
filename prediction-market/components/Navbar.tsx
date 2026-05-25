'use client'

import { useWallet } from '../context/WalletContext'
import { shortenAddress } from '../lib/utils'
import { CHAIN_ID } from '../lib/contract'
import styles from './Navbar.module.css'

const TICKER_ITEMS = [
  { label: '0xaBc1 bought YES on "BTC hits $120K" +0.05 tBNB', type: 'buy' },
  { label: '0xDef2 bought NO on "ETH flips BTC?" +0.02 tBNB', type: 'sell' },
  { label: '0x1234 bought YES on "Next halving bull run?" +0.1 tBNB', type: 'buy' },
  { label: 'RESOLVED: "BNB above $800" YES winners claimed', type: 'neutral' },
  { label: '0xFeed bought NO on "US inflation drops?" +0.03 tBNB', type: 'sell' },
  { label: 'NEW MARKET: "Will DOGE reach $1?"', type: 'neutral' },
  { label: '0x9aB3 bought YES on "Next world cup host?" +0.15 tBNB', type: 'buy' },
  { label: '0x7c3D bought NO on "Fed rate cut in Q1?" +0.08 tBNB', type: 'sell' },
  { label: '0xBee5 bought YES on "AI AGI by 2026?" +0.25 tBNB', type: 'buy' },
]
const tickerAll = [...TICKER_ITEMS, ...TICKER_ITEMS]

export default function Navbar() {
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

  const networkLabel =
    activeChainId === null ? 'Unknown'
    : activeChainId === CHAIN_ID ? 'BSC Testnet'
    : 'Wrong Network'

  return (
    <header className={styles.header}>
      <div className={styles.controlsRow}>
        <div className={styles.right}>
          {isOwner && (
            <button className={styles.adminBtn} onClick={() => setShowAdminPortal(true)}>
              <span className={styles.adminIcon}>⚙</span> ADMIN
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

      <div className={styles.tickerRow}>
        <span className={styles.liveLabel}>LIVE</span>
        <div className={styles.tickerMask}>
          <div className={styles.tickerTrack}>
            {tickerAll.map((item, i) => (
              <span key={i} className={`${styles.tickerItem} ${item.type === 'buy' ? styles.buy : item.type === 'sell' ? styles.sell : styles.neutral}`}>
                {item.type === 'buy' ? '▲' : item.type === 'sell' ? '▼' : '●'} {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}