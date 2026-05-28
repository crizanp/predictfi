'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
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
    signWithWalletAuth,
    authUser,
    isAuthenticated,
    switchActiveNetwork,
    isWrongNetwork,
  } = useWallet()

  const [copied, setCopied] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [authError, setAuthError] = useState('')
  const [checkingName, setCheckingName] = useState(false)
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null)

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

  const normalizedUsername = username.trim()
  const usernameValid = useMemo(() => /^[a-zA-Z0-9]{4,20}$/.test(normalizedUsername), [normalizedUsername])

  const generateUsername = useCallback(() => {
    const suffix = account ? account.slice(2, 8).toLowerCase() : Math.random().toString(36).slice(2, 8)
    setUsername(`user${suffix}`)
    setNameAvailable(null)
    setAuthError('')
  }, [account])

  const checkAvailability = useCallback(async () => {
    if (!usernameValid) {
      setNameAvailable(false)
      return
    }
    setCheckingName(true)
    try {
      const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(normalizedUsername)}`)
      const payload = (await res.json()) as { available?: boolean; reason?: string }
      setNameAvailable(Boolean(payload.available))
      if (!payload.available) setAuthError(payload.reason || 'Username is not available.')
      else setAuthError('')
    } catch {
      setNameAvailable(null)
    } finally {
      setCheckingName(false)
    }
  }, [normalizedUsername, usernameValid])

  const handleAuth = useCallback(async () => {
    setAuthError('')
    if (!account) {
      setAuthError('Connect wallet first.')
      return
    }
    if (authMode === 'signup' && !usernameValid) {
      setAuthError('Username must be 4-20 letters or numbers only.')
      return
    }

    const result = await signWithWalletAuth(authMode, normalizedUsername)
    if (!result.success) {
      setAuthError(result.error || 'Could not authenticate.')
      return
    }

    setShowWalletModal(false)
  }, [account, authMode, normalizedUsername, setShowWalletModal, signWithWalletAuth, usernameValid])

  if (!showWalletModal) return null

  const isConnected = Boolean(account)
  const networkName =
    activeChainId === CHAIN_ID
      ? 'BSC Testnet'
      : activeChainId
        ? `Chain ${activeChainId}`
        : 'Unknown'

  const initials = account ? account.slice(2, 4).toUpperCase() : '??'

  return (
    <div className={styles.backdrop} onClick={() => setShowWalletModal(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>{isConnected ? 'My Wallet' : 'Connect Wallet'}</h2>
          <button className={styles.closeBtn} onClick={() => setShowWalletModal(false)} aria-label="Close">✕</button>
        </div>

        {isConnected && isAuthenticated ? (
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
              <span className={styles.address}>{authUser?.username || shortenAddress(account)}</span>
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
            <p className={styles.subtitle}>Connect wallet, then sign to {authMode === 'signup' ? 'create account' : 'log in'}.</p>

            <div className={styles.authTabs}>
              <button
                className={`${styles.authTabBtn} ${authMode === 'login' ? styles.authTabActive : ''}`}
                onClick={() => {
                  setAuthMode('login')
                  setAuthError('')
                }}
              >
                Login
              </button>
              <button
                className={`${styles.authTabBtn} ${authMode === 'signup' ? styles.authTabActive : ''}`}
                onClick={() => {
                  setAuthMode('signup')
                  setAuthError('')
                }}
              >
                Signup
              </button>
            </div>

            <div className={styles.options}>
              <button
                className={styles.optionBtn}
                onClick={() => {
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

            {isConnected && (
              <div className={styles.authPanel}>
                <div className={styles.authWalletRow}>
                  <span>Connected:</span>
                  <strong>{shortenAddress(account)}</strong>
                </div>

                {authMode === 'signup' && (
                  <>
                    <label className={styles.authLabel} htmlFor="signup-username">
                      Username (4-20 letters/numbers)
                    </label>
                    <div className={styles.authInputRow}>
                      <input
                        id="signup-username"
                        className={styles.authInput}
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value)
                          setNameAvailable(null)
                          setAuthError('')
                        }}
                        placeholder="Enter username"
                        autoComplete="off"
                        maxLength={20}
                      />
                      <button className={styles.inlineBtn} type="button" onClick={generateUsername}>
                        Auto
                      </button>
                      <button className={styles.inlineBtn} type="button" onClick={() => { void checkAvailability() }} disabled={checkingName || !usernameValid}>
                        {checkingName ? 'Checking...' : 'Check'}
                      </button>
                    </div>
                    {nameAvailable === true && <p className={styles.authHintOk}>Username available.</p>}
                    {nameAvailable === false && <p className={styles.authHintErr}>Username unavailable.</p>}
                  </>
                )}

                {authError && <p className={styles.authHintErr}>{authError}</p>}

                <button
                  className={styles.primaryAuthBtn}
                  onClick={() => {
                    void handleAuth()
                  }}
                  disabled={isBusy || (authMode === 'signup' && !usernameValid)}
                >
                  {busyAction === 'auth-login' || busyAction === 'auth-signup'
                    ? 'Awaiting Wallet Signature...'
                    : authMode === 'signup'
                      ? 'Sign & Create Account'
                      : 'Sign & Login'}
                </button>
              </div>
            )}

            <p className={styles.footer}>
              By connecting you agree to our Terms of Service
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
