'use client'

import Link from 'next/link'
import { useWallet } from '../context/WalletContext'
import { shortenAddress } from '../lib/utils'
import { CHAIN_ID } from '../lib/contract'
import styles from './Navbar.module.css'

export default function Navbar() {
  const {
    account,
    isOwner,
    activeChainId,
    isWrongNetwork,
    isBusy,
    busyAction,
    connectionType,
    setShowWalletModal,
    setShowAdminPortal,
    disconnectWallet,
    switchActiveNetwork,
  } = useWallet()

  const networkLabel =
    activeChainId === null
      ? 'Unknown'
      : activeChainId === CHAIN_ID
        ? 'BSC Testnet'
        : `Wrong Network`

  return (
    <nav className={styles.navbar}>
      <div className={styles.navInner}>
        <div className={styles.left}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandPurple}>Predict</span>Fi
          </Link>
          <span className={styles.beta}>beta</span>
        </div>

        <div className={styles.right}>
          {isOwner && (
            <button
              className={styles.adminBtn}
              onClick={() => setShowAdminPortal(true)}
            >
              <span className={styles.adminIcon}>⚙</span>
              Admin Portal
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
                  {busyAction === 'switch-network' ? 'Switching...' : '⚠ Switch to BSC Testnet'}
                </button>
              ) : (
                <div className={styles.networkPill}>
                  <span className={styles.networkDot} />
                  {networkLabel}
                </div>
              )}
              <button
                className={styles.accountPill}
                onClick={() => setShowWalletModal(true)}
                title={`Connected via ${connectionType === 'walletconnect' ? 'WalletConnect' : 'Browser Wallet'}`}
              >
                <span className={styles.accountDot} />
                {shortenAddress(account)}
              </button>
              <button
                className={styles.disconnectBtn}
                onClick={() => { void disconnectWallet() }}
                disabled={isBusy}
                title="Disconnect wallet"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
