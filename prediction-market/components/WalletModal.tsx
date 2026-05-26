'use client'

import Link from 'next/link'
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
    switchAccount,
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

  const handleDisconnect = useCallback(async () => {
    await disconnectWallet()
    setShowWalletModal(false)
  }, [disconnectWallet, setShowWalletModal])

  if (!showWalletModal) return null

  const isConnected = Boolean(account)
  const networkName =
    activeChainId === CHAIN_ID
      ? 'BSC Testnet'
      : activeChainId
        ? `Chain ${activeChainId}`
        : 'Unknown'

  const initials = account ? account.slice(2, 4).toUpperCase() : '??'
  const canSwitchAccount = connectionType === 'injected'

  return (
    <div className={styles.backdrop} onClick={() => setShowWalletModal(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>{isConnected ? 'My Wallet' : 'Connect Wallet'}</h2>
          <button className={styles.closeBtn} onClick={() => setShowWalletModal(false)} aria-label="Close">✕</button>
        </div>

        {isConnected ? (
          <div className={styles.connectedView}>
            {/* Avatar */}
            <div className={styles.avatarWrap}>
              <div className={styles.avatar}>{initials}</div>
              <div className={styles.avatarBadge}>
                <span className={styles.avatarBadgeDot} />
              </div>
            </div>

            {/* Address */}
            <div className={styles.addressBlock}>
              <span className={styles.address}>{shortenAddress(account)}</span>
              <button
                className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
                onClick={() => { void handleCopy() }}
                title="Copy full address"
              >
                {copied ? '✓ Copied' : '⧉ Copy'}
              </button>
            </div>
            <span className={styles.fullAddress}>{shortenAddress(account)}</span>

            <Link href={`/profile/${account}`} className={styles.profileLink} onClick={() => setShowWalletModal(false)}>
              View Public Profile
            </Link>

            {/* Info grid */}
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Network</span>
                <span className={isWrongNetwork ? styles.infoValueWarn : styles.infoValue}>
                  {isWrongNetwork ? '⚠ Wrong' : `● ${networkName}`}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Via</span>
                <span className={styles.infoValue}>
                  {connectionType === 'walletconnect' ? '🔗 WalletConnect' : '🦊 Browser'}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className={styles.actions}>
              <button
                className={styles.switchNetBtn}
                onClick={() => { if (isWrongNetwork) void switchActiveNetwork() }}
                disabled={isBusy || !isWrongNetwork}
              >
                {busyAction === 'switch-network'
                  ? 'Switching...'
                  : isWrongNetwork
                    ? 'Switch to BSC Testnet'
                    : 'On BSC Testnet'}
              </button>

              {canSwitchAccount && (
                <button
                  className={styles.switchAccBtn}
                  onClick={() => { void switchAccount() }}
                  disabled={isBusy}
                  title="Open wallet account picker"
                >
                  {busyAction === 'switch-account' ? 'Opening picker...' : '⇄ Switch Address'}
                </button>
              )}

              <button
                className={styles.disconnectBtn}
                onClick={() => { void handleDisconnect() }}
                disabled={isBusy}
              >
                ⏏ Disconnect &amp; Log Out
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.connectView}>
            <p className={styles.subtitle}>
              Connect your wallet to trade on prediction markets
            </p>

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
                  <span>MetaMask, Rabby &amp; other injected wallets</span>
                </div>
                {injectedAvailable
                  ? <span className={styles.optionChevron}>›</span>
                  : <span className={styles.optionBadge}>Not installed</span>}
              </button>

              <button
                className={styles.optionBtn}
                onClick={() => {
                  setShowWalletModal(false)
                  void connectWalletConnect()
                }}
                disabled={isBusy}
              >
                <div className={styles.optionIcon}>🔗</div>
                <div className={styles.optionInfo}>
                  <strong>WalletConnect</strong>
                  <span>Scan QR with any mobile wallet</span>
                </div>
                <span className={styles.optionChevron}>›</span>
              </button>
            </div>

            <p className={styles.footer}>
              By connecting you agree to our Terms of Service
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
