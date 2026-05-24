'use client'

import { useCallback, useState } from 'react'
import { useWallet } from '../context/WalletContext'
import { shortenAddress } from '../lib/utils'
import { CHAIN_ID } from '../lib/contract'
import styles from './WalletModal.module.css'

export default function WalletModal() {
  const {
    account,
    activeChainId,
    connectionType,
    injectedAvailable,
    isBusy,
    busyAction,
    showWalletModal,
    setShowWalletModal,
    connectInjectedWallet,
    connectWalletConnect,
    disconnectWallet,
    switchActiveNetwork,
    isWrongNetwork,
  } = useWallet()

  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!account) return
    await navigator.clipboard.writeText(account)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [account])

  if (!showWalletModal) return null

  const isConnected = Boolean(account)
  const networkName =
    activeChainId === CHAIN_ID
      ? 'BSC Testnet'
      : activeChainId
        ? `Chain ${activeChainId}`
        : 'Unknown'

  return (
    <div className={styles.backdrop} onClick={() => setShowWalletModal(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{isConnected ? 'Wallet' : 'Connect Wallet'}</h2>
          <button className={styles.closeBtn} onClick={() => setShowWalletModal(false)}>✕</button>
        </div>

        {isConnected ? (
          <div className={styles.connectedView}>
            <div className={styles.avatarWrap}>
              <div className={styles.avatar}>
                {account.slice(2, 4).toUpperCase()}
              </div>
            </div>

            <div className={styles.addressRow}>
              <span className={styles.address}>{shortenAddress(account)}</span>
              <button className={styles.copyBtn} onClick={() => { void handleCopy() }}>
                {copied ? '✓' : '⧉'}
              </button>
            </div>

            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Network</span>
                <span className={isWrongNetwork ? styles.infoValueWarn : styles.infoValue}>
                  {isWrongNetwork ? '⚠ ' : ''}{networkName}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Connection</span>
                <span className={styles.infoValue}>
                  {connectionType === 'walletconnect' ? 'WalletConnect' : 'Browser Wallet'}
                </span>
              </div>
            </div>

            {isWrongNetwork && (
              <button
                className={styles.switchBtn}
                onClick={() => { void switchActiveNetwork() }}
                disabled={isBusy}
              >
                {busyAction === 'switch-network' ? 'Switching...' : 'Switch to BSC Testnet'}
              </button>
            )}

            <button
              className={styles.disconnectBtn}
              onClick={() => {
                void disconnectWallet()
                setShowWalletModal(false)
              }}
              disabled={isBusy}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className={styles.connectView}>
            <p className={styles.subtitle}>Choose how to connect your wallet</p>

            <div className={styles.options}>
              <button
                className={styles.optionBtn}
                onClick={() => {
                  setShowWalletModal(false)
                  void connectInjectedWallet()
                }}
                disabled={isBusy || !injectedAvailable}
              >
                <div className={styles.optionIcon}>🦊</div>
                <div className={styles.optionInfo}>
                  <strong>Browser Wallet</strong>
                  <span>MetaMask, Rabby &amp; injected wallets</span>
                </div>
                {!injectedAvailable && <span className={styles.optionBadge}>Not detected</span>}
              </button>

              <button
                className={styles.optionBtn}
                onClick={() => {
                  setShowWalletModal(false)
                  void connectWalletConnect()
                }}
                disabled={isBusy || !process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
              >
                <div className={styles.optionIcon}>🔗</div>
                <div className={styles.optionInfo}>
                  <strong>WalletConnect</strong>
                  <span>Connect via QR code with 600+ wallets</span>
                </div>
              </button>
            </div>

            <p className={styles.footer}>
              By connecting you agree to our Terms &amp; Privacy Policy
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
