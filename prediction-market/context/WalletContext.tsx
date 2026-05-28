'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { CONTRACT_ABI, CONTRACT_ADDRESS, CONTRACT_OWNER, CHAIN_ID } from '../lib/contract'
import { toErrorMessage } from '../lib/utils'

export type ConnectionType = 'injected' | 'walletconnect' | null
export type StatusTone = 'info' | 'success' | 'error'

export interface StatusMessage {
  tone: StatusTone
  text: string
}

export interface AuthUser {
  address: string
  username: string
}

type ProviderRequestParams = unknown[] | Record<string, unknown>
type ProviderEvent = 'accountsChanged' | 'chainChanged' | 'disconnect'

export interface Eip1193Provider {
  isMetaMask?: boolean
  request: (args: { method: string; params?: ProviderRequestParams }) => Promise<unknown>
  on?: (event: ProviderEvent, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: ProviderEvent, handler: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    // Reown/appkit also declares ethereum as Record<string, unknown>; match it here
    ethereum?: Record<string, unknown>
  }
}

const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`

export const BSC_TESTNET_PARAMS = {
  chainId: CHAIN_HEX,
  chainName: 'BSC Testnet',
  rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  blockExplorerUrls: ['https://testnet.bscscan.com'],
}

export const READ_ONLY_RPC = BSC_TESTNET_PARAMS.rpcUrls[0]
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''
const EXTRA_ADMINS_STORAGE_KEY = 'predictfi-extra-admin-addresses'
const ENV_ADMIN_ADDRESSES = (process.env.NEXT_PUBLIC_EXTRA_ADMIN_ADDRESSES || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter((entry) => entry.length > 0 && ethers.isAddress(entry))

export interface WalletContextValue {
  account: string
  isOwner: boolean
  isAdmin: boolean
  adminAddresses: string[]
  activeChainId: number | null
  connectionType: ConnectionType
  walletProvider: Eip1193Provider | null
  injectedAvailable: boolean
  isBusy: boolean
  busyAction: string | null
  isWrongNetwork: boolean
  isContractConfigured: boolean
  status: StatusMessage | null
  showWalletModal: boolean
  showAdminPortal: boolean
  setShowWalletModal: (show: boolean) => void
  setShowAdminPortal: (show: boolean) => void
  setStatus: (status: StatusMessage | null) => void
  setStatusMessage: (tone: StatusTone, text: string) => void
  setBusyAction: (action: string | null) => void
  authUser: AuthUser | null
  authLoading: boolean
  isAuthenticated: boolean
  addAdminAddress: (address: string) => boolean
  removeAdminAddress: (address: string) => void
  connectInjectedWallet: () => Promise<void>
  connectWalletConnect: () => void
  setExternalProvider: (provider: Eip1193Provider | null, type: ConnectionType) => Promise<void>
  disconnectWallet: () => Promise<void>
  switchAccount: () => Promise<void>
  refreshAuthSession: () => Promise<void>
  signWithWalletAuth: (action: 'login' | 'signup', username?: string) => Promise<{ success: boolean; error?: string }>
  logoutUser: () => Promise<void>
  switchActiveNetwork: () => Promise<void>
  refreshWalletState: (options?: {
    requestAccounts?: boolean
    silent?: boolean
    providerOverride?: Eip1193Provider | null
  }) => Promise<string>
  getEffectiveProvider: (providerOverride?: Eip1193Provider | null) => Eip1193Provider | null
  requireProvider: (providerOverride?: Eip1193Provider | null) => Eip1193Provider
  getReadContract: () => ethers.Contract
  getWriteContract: (providerOverride?: Eip1193Provider | null) => Promise<ethers.Contract>
  getPreparedWriteContract: () => Promise<ethers.Contract>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const isContractConfigured = ethers.isAddress(CONTRACT_ADDRESS)

  const [account, setAccount] = useState('')
  const [isOwner, setIsOwner] = useState(false)
    const [adminAddresses, setAdminAddresses] = useState<string[]>(ENV_ADMIN_ADDRESSES)
  const [walletProvider, setWalletProvider] = useState<Eip1193Provider | null>(null)
  const [connectionType, setConnectionType] = useState<ConnectionType>(null)
  const [injectedAvailable, setInjectedAvailable] = useState(false)
  const [activeChainId, setActiveChainId] = useState<number | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [status, setStatus] = useState<StatusMessage | null>(
    isContractConfigured
      ? null
      : {
          tone: 'error',
          text: 'Contract address is missing. Add NEXT_PUBLIC_CONTRACT_ADDRESS to .env.local, then restart.',
        }
  )
  const [showWalletModal, setShowWalletModalState] = useState(false)
  const [showAdminPortal, setShowAdminPortal] = useState(false)
  const [blockExternalSync, setBlockExternalSync] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(EXTRA_ADMINS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return
      const normalized = Array.from(
        new Set(
          parsed
            .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
            .filter((entry) => entry.length > 0 && ethers.isAddress(entry))
            .concat(ENV_ADMIN_ADDRESSES)
        )
      )
      const timer = setTimeout(() => {
        setAdminAddresses(normalized)
      }, 0)
      return () => clearTimeout(timer)
    } catch {
      // Ignore invalid persisted admin list.
    }
  }, [])

  const setStatusMessage = useCallback((tone: StatusTone, text: string) => {
    setStatus({ tone, text })
  }, [])

  const setShowWalletModal = useCallback(
    (show: boolean) => {
      setShowWalletModalState(show)
    },
    []
  )

  const isBusy = busyAction !== null
  const isWrongNetwork = account !== '' && activeChainId !== null && activeChainId !== CHAIN_ID
  const isAdmin = account !== '' && (isOwner || adminAddresses.includes(account.toLowerCase()))
  const isAuthenticated = Boolean(authUser)

  const refreshAuthSession = useCallback(async () => {
    setAuthLoading(true)
    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' })
      const payload = (await response.json()) as { user?: AuthUser | null }
      setAuthUser(payload.user ?? null)
    } catch {
      setAuthUser(null)
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const persistAdminAddresses = useCallback((next: string[]) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(EXTRA_ADMINS_STORAGE_KEY, JSON.stringify(next))
  }, [])

  const addAdminAddress = useCallback((address: string): boolean => {
    const normalized = address.trim().toLowerCase()
    if (!ethers.isAddress(normalized)) return false
    let added = false
    setAdminAddresses((previous) => {
      if (previous.includes(normalized)) return previous
      const next = [...previous, normalized]
      persistAdminAddresses(next)
      added = true
      return next
    })
    return added
  }, [persistAdminAddresses])

  const removeAdminAddress = useCallback((address: string) => {
    const normalized = address.trim().toLowerCase()
    setAdminAddresses((previous) => {
      const next = previous.filter((entry) => entry !== normalized)
      persistAdminAddresses(next)
      return next
    })
  }, [persistAdminAddresses])

  const clearWalletSession = useCallback(() => {
    setAccount('')
    setIsOwner(false)
    setActiveChainId(null)
    setWalletProvider(null)
    setConnectionType(null)
  }, [])

  const getEffectiveProvider = useCallback(
    (providerOverride?: Eip1193Provider | null): Eip1193Provider | null => {
      if (providerOverride !== undefined) return providerOverride
      if (walletProvider) return walletProvider
      if (typeof window !== 'undefined' && window.ethereum) return window.ethereum as unknown as Eip1193Provider
      return null
    },
    [walletProvider]
  )

  const requireProvider = useCallback(
    (providerOverride?: Eip1193Provider | null): Eip1193Provider => {
      const provider = getEffectiveProvider(providerOverride)
      if (!provider) throw new Error('No wallet provider available. Connect wallet first.')
      return provider
    },
    [getEffectiveProvider]
  )

  const getReadContract = useCallback((): ethers.Contract => {
    if (!isContractConfigured) throw new Error('Contract address not configured.')
    // Always use public RPC for reads so market data stays visible even if
    // the connected wallet is on a wrong/unsupported network.
    const provider = new ethers.JsonRpcProvider(READ_ONLY_RPC)
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
  }, [isContractConfigured])

  const getWriteContract = useCallback(
    async (providerOverride?: Eip1193Provider | null): Promise<ethers.Contract> => {
      if (!isContractConfigured) throw new Error('Contract address not configured.')
      const providerSource = requireProvider(providerOverride)
      const provider = new ethers.BrowserProvider(providerSource)
      const signer = await provider.getSigner()
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
    },
    [isContractConfigured, requireProvider]
  )

  const checkOwner = useCallback(
    async (userAccount: string) => {
      const normalizedUser = userAccount.toLowerCase()
      let resolvedOwner = CONTRACT_OWNER

      if (isContractConfigured) {
        try {
          const contract = getReadContract()
          const ownerAddress = await contract.owner()
          if (typeof ownerAddress === 'string' && ethers.isAddress(ownerAddress)) {
            resolvedOwner = ownerAddress.toLowerCase()
          }
        } catch {
          // Keep fallback owner when on-chain lookup fails.
        }
      }

      setIsOwner(resolvedOwner === normalizedUser)
    },
    [getReadContract, isContractConfigured]
  )

  const switchToRequiredNetwork = useCallback(
    async (providerOverride?: Eip1193Provider | null) => {
      const provider = requireProvider(providerOverride)
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CHAIN_HEX }],
        })
      } catch (error) {
        const code = (error as { code?: number })?.code
        if (code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [BSC_TESTNET_PARAMS],
          })
          return
        }
        throw error
      }
    },
    [requireProvider]
  )

  const refreshWalletState = useCallback(
    async (options?: {
      requestAccounts?: boolean
      silent?: boolean
      providerOverride?: Eip1193Provider | null
    }): Promise<string> => {
      const requestAccounts = options?.requestAccounts ?? false
      const silent = options?.silent ?? false
      const providerSource = getEffectiveProvider(options?.providerOverride)

      setInjectedAvailable(typeof window !== 'undefined' && Boolean(window.ethereum))

      if (!providerSource) {
        clearWalletSession()
        return ''
      }

      try {
        const provider = new ethers.BrowserProvider(providerSource)
        const network = await provider.getNetwork()
        setActiveChainId(Number(network.chainId))

        const method = requestAccounts ? 'eth_requestAccounts' : 'eth_accounts'
        const accounts = (await providerSource.request({ method })) as string[]
        const selectedAccount = accounts[0] ?? ''

        if (!selectedAccount) {
          setAccount('')
          setIsOwner(false)
          return ''
        }

        setAccount(selectedAccount)
        await checkOwner(selectedAccount)
        return selectedAccount
      } catch (error) {
        if (!silent) {
          setStatusMessage('error', `Wallet sync failed. ${toErrorMessage(error)}`)
        }
        return ''
      }
    },
    [checkOwner, clearWalletSession, getEffectiveProvider, setStatusMessage]
  )

  const connectInjectedWallet = useCallback(async () => {
    setBlockExternalSync(false)
    setBusyAction('connect-injected')
    const injectedProvider = typeof window !== 'undefined' ? window.ethereum as unknown as Eip1193Provider ?? null : null

    if (!injectedProvider) {
      setInjectedAvailable(false)
      setStatusMessage('error', 'No browser wallet detected. Install MetaMask or use WalletConnect.')
      setBusyAction(null)
      return
    }

    setInjectedAvailable(true)

    try {
      setWalletProvider(injectedProvider)
      setConnectionType('injected')

      await switchToRequiredNetwork(injectedProvider)
      const selectedAccount = await refreshWalletState({
        requestAccounts: true,
        providerOverride: injectedProvider,
      })

      if (!selectedAccount) {
        setStatusMessage('info', 'Connection cancelled.')
        return
      }

      setStatusMessage('success', 'Wallet connected successfully.')
    } catch (error) {
      clearWalletSession()
      setStatusMessage('error', `Could not connect browser wallet. ${toErrorMessage(error)}`)
    } finally {
      setBusyAction(null)
    }
  }, [clearWalletSession, refreshWalletState, setStatusMessage, switchToRequiredNetwork])

  const connectWalletConnect = useCallback(() => {
    // Opens the Reown AppKit full connect modal; actual provider sync is done by ReownSync.
    setBlockExternalSync(false)
    if (!WALLETCONNECT_PROJECT_ID || WALLETCONNECT_PROJECT_ID === 'demo') {
      setStatusMessage('error', 'Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local to enable full Reown wallet options.')
      return
    }
    import('../lib/appkit').then(({ appKit }) => appKit.open({ view: 'Connect' })).catch(() => {
      setStatusMessage('error', 'Could not open wallet modal. Check your project ID in .env.local.')
    })
  }, [setStatusMessage])

  const setExternalProvider = useCallback(
    async (provider: Eip1193Provider | null, type: ConnectionType) => {
      if (!provider || !type) {
        clearWalletSession()
        return
      }
      if (blockExternalSync && type === 'walletconnect') {
        return
      }
      setWalletProvider(provider)
      setConnectionType(type)
      try {
        await refreshWalletState({ providerOverride: provider, silent: true })
      } catch {
        // silent
      }
    },
    [blockExternalSync, clearWalletSession, refreshWalletState]
  )

  const switchAccount = useCallback(async () => {
    if (connectionType !== 'injected') return
    setBusyAction('switch-account')
    try {
      const provider = requireProvider()
      await provider.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      })
      await refreshWalletState({ providerOverride: provider, silent: true })
    } catch (error) {
      // code 4001 = user rejected — not an error to surface
      if ((error as { code?: number })?.code !== 4001) {
        setStatusMessage('error', `Could not switch account. ${toErrorMessage(error)}`)
      }
    } finally {
      setBusyAction(null)
    }
  }, [connectionType, refreshWalletState, requireProvider, setStatusMessage])

  const disconnectWallet = useCallback(async () => {
    setBlockExternalSync(true)
    setBusyAction('disconnect-wallet')
    try {
      const { appKit } = await import('../lib/appkit')
      const runtime = appKit as {
        disconnect?: () => Promise<void>
        disconnectWallet?: () => Promise<void>
      }
      if (runtime.disconnect) {
        await runtime.disconnect()
      } else if (runtime.disconnectWallet) {
        await runtime.disconnectWallet()
      }
    } catch {
      // Ignore AppKit disconnect failures; fallback local clear still runs.
    }

    if (connectionType === 'walletconnect' && walletProvider) {
      const runtimeProvider = walletProvider as { disconnect?: () => Promise<void> }
      if (runtimeProvider.disconnect) {
        try { await runtimeProvider.disconnect() } catch { /* ignore */ }
      }
    }
    clearWalletSession()
    setAuthUser(null)
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore network errors while disconnecting
    }
    setStatusMessage('info', 'Wallet disconnected.')
    setBusyAction(null)
  }, [clearWalletSession, connectionType, setStatusMessage, walletProvider])

  const signWithWalletAuth = useCallback(
    async (action: 'login' | 'signup', username?: string): Promise<{ success: boolean; error?: string }> => {
      if (!account) {
        return { success: false, error: 'Connect wallet first.' }
      }

      setBusyAction(action === 'signup' ? 'auth-signup' : 'auth-login')
      try {
        const providerSource = requireProvider()
        const provider = new ethers.BrowserProvider(providerSource)
        const signer = await provider.getSigner()
        const signerAddress = (await signer.getAddress()).toLowerCase()

        if (signerAddress !== account.toLowerCase()) {
          return { success: false, error: 'Wallet account changed. Please reconnect and try again.' }
        }

        const nonceRes = await fetch(`/api/auth/nonce?address=${encodeURIComponent(signerAddress)}&action=${action}`, {
          credentials: 'include',
        })
        const noncePayload = (await nonceRes.json()) as { message?: string; error?: string }
        if (!nonceRes.ok || !noncePayload.message) {
          return { success: false, error: noncePayload.error || 'Failed to initialize sign message.' }
        }

        const signature = await signer.signMessage(noncePayload.message)

        const verifyRes = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            address: signerAddress,
            signature,
            action,
            username: username?.trim() || '',
          }),
        })

        const verifyPayload = (await verifyRes.json()) as {
          user?: AuthUser
          error?: string
        }

        if (!verifyRes.ok || !verifyPayload.user) {
          return { success: false, error: verifyPayload.error || 'Authentication failed.' }
        }

        setAuthUser(verifyPayload.user)
        setStatusMessage('success', action === 'signup' ? 'Account created successfully.' : 'Signed in successfully.')
        return { success: true }
      } catch (error) {
        return { success: false, error: toErrorMessage(error) }
      } finally {
        setBusyAction(null)
      }
    },
    [account, requireProvider, setStatusMessage]
  )

  const logoutUser = useCallback(async () => {
    setBusyAction('auth-logout')
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    setAuthUser(null)
    await disconnectWallet()
    setBusyAction(null)
  }, [disconnectWallet])

  const switchActiveNetwork = useCallback(async () => {
    setBusyAction('switch-network')
    try {
      const provider = requireProvider()
      await switchToRequiredNetwork(provider)
      await refreshWalletState({ providerOverride: provider, silent: true })
      setStatusMessage('success', 'Switched to BSC Testnet.')
    } catch (error) {
      setStatusMessage('error', `Network switch failed. ${toErrorMessage(error)}`)
    } finally {
      setBusyAction(null)
    }
  }, [refreshWalletState, requireProvider, setStatusMessage, switchToRequiredNetwork])

  const getPreparedWriteContract = useCallback(async (): Promise<ethers.Contract> => {
    if (!account) throw new Error('Connect wallet before sending a transaction.')
    const provider = requireProvider()
    await switchToRequiredNetwork(provider)
    await refreshWalletState({ providerOverride: provider, silent: true })
    return getWriteContract(provider)
  }, [account, getWriteContract, refreshWalletState, requireProvider, switchToRequiredNetwork])

  // Auto-connect on mount
  useEffect(() => {
    void (async () => {
      const injectedProvider = typeof window !== 'undefined' ? window.ethereum as unknown as Eip1193Provider ?? null : null
      if (!injectedProvider) return
      const selectedAccount = await refreshWalletState({
        providerOverride: injectedProvider,
        silent: true,
      })
      if (selectedAccount) {
        setWalletProvider(injectedProvider)
        setConnectionType('injected')
      }
    })()
  }, [refreshWalletState])

  useEffect(() => {
    void refreshAuthSession()
  }, [refreshAuthSession])

  useEffect(() => {
    if (!account) return
    if (!authUser) return
    if (authUser.address.toLowerCase() === account.toLowerCase()) return
    setAuthUser(null)
  }, [account, authUser])

  // Provider event listeners
  useEffect(() => {
    const provider = getEffectiveProvider()
    if (!provider?.on || !provider.removeListener) return

    const syncFromProvider = () => {
      void refreshWalletState({ providerOverride: provider, silent: true })
    }
    const handleDisconnect = () => { void disconnectWallet() }

    provider.on('accountsChanged', syncFromProvider)
    provider.on('chainChanged', syncFromProvider)
    provider.on('disconnect', handleDisconnect)

    return () => {
      provider.removeListener?.('accountsChanged', syncFromProvider)
      provider.removeListener?.('chainChanged', syncFromProvider)
      provider.removeListener?.('disconnect', handleDisconnect)
    }
  }, [disconnectWallet, getEffectiveProvider, refreshWalletState])

  return (
    <WalletContext.Provider
      value={{
        account,
        isOwner,
        isAdmin,
        adminAddresses,
        activeChainId,
        connectionType,
        walletProvider,
        injectedAvailable,
        isBusy,
        busyAction,
        isWrongNetwork,
        isContractConfigured,
        status,
        showWalletModal,
        showAdminPortal,
        setShowWalletModal,
        setShowAdminPortal,
        setStatus,
        setStatusMessage,
        setBusyAction,
        authUser,
        authLoading,
        isAuthenticated,
        addAdminAddress,
        removeAdminAddress,
        connectInjectedWallet,
        connectWalletConnect,
        setExternalProvider,
        disconnectWallet,
        switchAccount,
        refreshAuthSession,
        signWithWalletAuth,
        logoutUser,
        switchActiveNetwork,
        refreshWalletState,
        getEffectiveProvider,
        requireProvider,
        getReadContract,
        getWriteContract,
        getPreparedWriteContract,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within WalletProvider')
  return context
}
