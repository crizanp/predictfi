'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import WalletConnectEthereumProvider from '@walletconnect/ethereum-provider'
import { ethers } from 'ethers'
import styles from './page.module.css'
import { CHAIN_ID, CONTRACT_ABI, CONTRACT_ADDRESS, CONTRACT_OWNER } from '../lib/contract'

interface Market {
  id: number
  question: string
  endTime: number
  resolved: boolean
  result: number
  yesPool: string
  noPool: string
  totalPool: string
}

interface UserPrediction {
  choice: number
  amount: string
  claimed: boolean
}

type StatusTone = 'info' | 'success' | 'error'
type ConnectionType = 'injected' | 'walletconnect' | null

interface StatusMessage {
  tone: StatusTone
  message: string
}

type ProviderRequestParams = unknown[] | Record<string, unknown>
type ProviderEvent = 'accountsChanged' | 'chainChanged' | 'disconnect'

interface Eip1193Provider {
  isMetaMask?: boolean
  request: (args: { method: string; params?: ProviderRequestParams }) => Promise<unknown>
  on?: (event: ProviderEvent, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: ProviderEvent, handler: (...args: unknown[]) => void) => void
}

interface WalletConnectRuntimeProvider extends Eip1193Provider {
  enable?: () => Promise<unknown>
  disconnect?: () => Promise<void>
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`
const BSC_TESTNET_PARAMS = {
  chainId: CHAIN_HEX,
  chainName: 'BSC Testnet',
  rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  blockExplorerUrls: ['https://testnet.bscscan.com'],
}

const READ_ONLY_RPC = BSC_TESTNET_PARAMS.rpcUrls[0]
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''

const shortenAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`

const formatToken = (value: string): string => {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    return '0.0000'
  }
  return parsed.toFixed(4)
}

const resultLabel = (result: number): string => {
  if (result === 1) return 'YES'
  if (result === 2) return 'NO'
  return 'Pending'
}

const formatTimeLeft = (endTimeInSeconds: number, nowInSeconds: number): string => {
  if (nowInSeconds <= 0) return 'Loading...'

  const diffInSeconds = Math.floor(endTimeInSeconds - nowInSeconds)
  if (diffInSeconds <= 0) return 'Ended'
  if (diffInSeconds < 60) return `${diffInSeconds}s left`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m left`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h left`
  return `${Math.floor(diffInSeconds / 86400)}d left`
}

const toErrorCode = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }

  const rawCode = (error as { code?: number | string }).code
  if (typeof rawCode === 'number') {
    return rawCode
  }
  if (typeof rawCode === 'string' && rawCode.trim()) {
    const parsed = Number(rawCode)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

const toErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const detail = error as {
      shortMessage?: string
      reason?: string
      message?: string
      info?: { error?: { message?: string } }
      error?: { message?: string }
      data?: { message?: string }
    }

    const candidate =
      detail.shortMessage ||
      detail.reason ||
      detail.data?.message ||
      detail.error?.message ||
      detail.info?.error?.message ||
      detail.message

    if (candidate && typeof candidate === 'string') {
      return candidate.replace(/^execution reverted:?\s*/i, '').trim()
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return String(error)
}

export default function Home() {
  const isContractConfigured = ethers.isAddress(CONTRACT_ADDRESS)

  const [account, setAccount] = useState('')
  const [isOwner, setIsOwner] = useState(false)
  const [markets, setMarkets] = useState<Market[]>([])
  const [userPredictions, setUserPredictions] = useState<Record<number, UserPrediction>>({})

  const [question, setQuestion] = useState('')
  const [duration, setDuration] = useState('')
  const [predictAmount, setPredictAmount] = useState<Record<number, string>>({})

  const [walletProvider, setWalletProvider] = useState<Eip1193Provider | null>(null)
  const [connectionType, setConnectionType] = useState<ConnectionType>(null)
  const [injectedAvailable, setInjectedAvailable] = useState(false)
  const [activeChainId, setActiveChainId] = useState<number | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusMessage | null>(() =>
    isContractConfigured
      ? null
      : {
          tone: 'error',
          message:
            'Contract address is missing. Add NEXT_PUBLIC_CONTRACT_ADDRESS to .env.local, then restart the dev server.',
        },
  )
  const [nowInSeconds, setNowInSeconds] = useState(0)

  const isBusy = busyAction !== null
  const isWrongNetwork = account !== '' && activeChainId !== null && activeChainId !== CHAIN_ID
  const connectorLabel =
    connectionType === 'walletconnect' ? 'WalletConnect' : connectionType === 'injected' ? 'Browser Wallet' : 'None'

  const stats = useMemo(() => {
    const total = markets.length
    const resolved = markets.filter((market) => market.resolved).length
    const live = total - resolved
    const totalPool = markets.reduce((acc, market) => acc + Number.parseFloat(market.totalPool || '0'), 0)
    return { total, live, resolved, totalPool }
  }, [markets])

  const createMarketBlockReason = useMemo(() => {
    if (!isContractConfigured) {
      return 'Contract is not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local and restart dev server.'
    }
    if (!account) return 'Connect your wallet to create a market.'
    if (isWrongNetwork) return `Switch wallet to BSC Testnet (${CHAIN_ID}) to create markets.`
    if (!isOwner) return `Only owner ${shortenAddress(CONTRACT_OWNER)} can create markets.`
    return ''
  }, [account, isContractConfigured, isOwner, isWrongNetwork])

  const canCreateMarket = createMarketBlockReason === ''

  const statusClassName =
    status?.tone === 'error'
      ? styles.statusError
      : status?.tone === 'success'
        ? styles.statusSuccess
        : styles.statusInfo

  const setStatusMessage = useCallback((tone: StatusTone, message: string) => {
    setStatus({ tone, message })
  }, [])

  const clearWalletSession = useCallback(() => {
    setAccount('')
    setIsOwner(false)
    setActiveChainId(null)
    setUserPredictions({})
    setPredictAmount({})
    setWalletProvider(null)
    setConnectionType(null)
  }, [])

  const getEffectiveProvider = useCallback(
    (providerOverride?: Eip1193Provider | null): Eip1193Provider | null => {
      if (providerOverride) return providerOverride
      if (walletProvider) return walletProvider
      if (typeof window !== 'undefined' && window.ethereum) return window.ethereum
      return null
    },
    [walletProvider],
  )

  const requireProvider = useCallback(
    (providerOverride?: Eip1193Provider | null): Eip1193Provider => {
      const provider = getEffectiveProvider(providerOverride)
      if (!provider) {
        throw new Error('No wallet provider available. Connect Browser Wallet or WalletConnect first.')
      }
      return provider
    },
    [getEffectiveProvider],
  )

  const getReadContract = useCallback(() => {
    if (!isContractConfigured) {
      throw new Error('Contract address is not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local.')
    }

    const providerSource = getEffectiveProvider()
    const provider = providerSource
      ? new ethers.BrowserProvider(providerSource)
      : new ethers.JsonRpcProvider(READ_ONLY_RPC)

    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
  }, [getEffectiveProvider, isContractConfigured])

  const getWriteContract = useCallback(
    async (providerOverride?: Eip1193Provider | null) => {
      if (!isContractConfigured) {
        throw new Error('Contract address is not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local.')
      }

      const providerSource = requireProvider(providerOverride)
      const provider = new ethers.BrowserProvider(providerSource)
      const signer = await provider.getSigner()
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
    },
    [isContractConfigured, requireProvider],
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
          // Fallback to configured owner when on-chain owner lookup is unavailable.
        }
      }

      setIsOwner(resolvedOwner === normalizedUser)
    },
    [getReadContract, isContractConfigured],
  )

  const refreshOwnerStatus = useCallback(async () => {
    if (!account) {
      setStatusMessage('info', 'Connect wallet first to verify owner permissions.')
      return
    }

    await checkOwner(account)
    setStatusMessage('info', 'Owner permissions were refreshed.')
  }, [account, checkOwner, setStatusMessage])

  const loadMarkets = useCallback(async (): Promise<Market[]> => {
    if (!isContractConfigured) {
      setMarkets([])
      return []
    }

    try {
      const contract = getReadContract()
      const count = Number(await contract.marketCount())
      const marketList: Market[] = []

      for (let i = 1; i <= count; i += 1) {
        const market = await contract.getMarket(i)
        marketList.push({
          id: Number(market.id),
          question: market.question,
          endTime: Number(market.endTime),
          resolved: market.resolved,
          result: Number(market.result),
          yesPool: ethers.formatEther(market.yesPool),
          noPool: ethers.formatEther(market.noPool),
          totalPool: ethers.formatEther(market.totalPool),
        })
      }

      const sortedMarkets = marketList.reverse()
      setMarkets(sortedMarkets)
      return sortedMarkets
    } catch (error) {
      setStatusMessage('error', `Could not load markets. ${toErrorMessage(error)}`)
      return []
    }
  }, [getReadContract, isContractConfigured, setStatusMessage])

  const loadUserPredictions = useCallback(
    async (currentAccount: string, sourceMarkets: Market[]) => {
      if (!currentAccount || sourceMarkets.length === 0 || !isContractConfigured) {
        setUserPredictions({})
        return
      }

      try {
        const contract = getReadContract()
        const predictionMap: Record<number, UserPrediction> = {}

        for (const market of sourceMarkets) {
          const prediction = await contract.getUserPrediction(market.id, currentAccount)
          if (Number(prediction.amount) > 0) {
            predictionMap[market.id] = {
              choice: Number(prediction.choice),
              amount: ethers.formatEther(prediction.amount),
              claimed: prediction.claimed,
            }
          }
        }

        setUserPredictions(predictionMap)
      } catch (error) {
        setStatusMessage('error', `Could not load your predictions. ${toErrorMessage(error)}`)
      }
    },
    [getReadContract, isContractConfigured, setStatusMessage],
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
          setUserPredictions({})
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
    [checkOwner, clearWalletSession, getEffectiveProvider, setStatusMessage],
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
        const errorCode = toErrorCode(error)

        if (errorCode === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [BSC_TESTNET_PARAMS],
          })
          return
        }

        throw error
      }
    },
    [requireProvider],
  )

  const connectInjectedWallet = useCallback(async () => {
    setBusyAction('connect-injected')

    const injectedProvider = typeof window !== 'undefined' ? window.ethereum ?? null : null
    if (!injectedProvider) {
      setInjectedAvailable(false)
      setStatusMessage('error', 'No browser wallet detected. Install MetaMask (or another extension).')
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
        setStatusMessage('info', 'Browser wallet connection was cancelled.')
        return
      }

      const loadedMarkets = await loadMarkets()
      await loadUserPredictions(selectedAccount, loadedMarkets)
      setStatusMessage('success', 'Browser wallet connected successfully.')
    } catch (error) {
      clearWalletSession()
      setStatusMessage('error', `Could not connect browser wallet. ${toErrorMessage(error)}`)
    } finally {
      setBusyAction(null)
    }
  }, [
    clearWalletSession,
    loadMarkets,
    loadUserPredictions,
    refreshWalletState,
    setStatusMessage,
    switchToRequiredNetwork,
  ])

  const connectWalletConnect = useCallback(async () => {
    setBusyAction('connect-walletconnect')

    if (!WALLETCONNECT_PROJECT_ID) {
      setStatusMessage(
        'error',
        'WalletConnect is not configured. Add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local and restart.',
      )
      setBusyAction(null)
      return
    }

    let createdProvider: WalletConnectRuntimeProvider | null = null

    try {
      createdProvider = (await WalletConnectEthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: [CHAIN_ID],
        optionalChains: [CHAIN_ID],
        rpcMap: { [CHAIN_ID]: READ_ONLY_RPC },
        showQrModal: true,
        metadata: {
          name: 'PredictFi Pro',
          description: 'Professional decentralized prediction market',
          url: 'https://predictfi.app',
          icons: ['https://walletconnect.com/walletconnect-logo.png'],
        },
      })) as unknown as WalletConnectRuntimeProvider

      if (createdProvider.enable) {
        await createdProvider.enable()
      }

      setWalletProvider(createdProvider)
      setConnectionType('walletconnect')

      const selectedAccount =
        (await refreshWalletState({ providerOverride: createdProvider, silent: true })) ||
        (await refreshWalletState({ providerOverride: createdProvider, requestAccounts: true }))

      if (!selectedAccount) {
        throw new Error('WalletConnect did not provide an account.')
      }

      await switchToRequiredNetwork(createdProvider)

      const loadedMarkets = await loadMarkets()
      await loadUserPredictions(selectedAccount, loadedMarkets)
      setStatusMessage('success', 'WalletConnect session connected.')
    } catch (error) {
      if (createdProvider?.disconnect) {
        try {
          await createdProvider.disconnect()
        } catch {
          // Ignore disconnect cleanup failures.
        }
      }
      clearWalletSession()
      setStatusMessage('error', `WalletConnect failed. ${toErrorMessage(error)}`)
    } finally {
      setBusyAction(null)
    }
  }, [
    clearWalletSession,
    loadMarkets,
    loadUserPredictions,
    refreshWalletState,
    setStatusMessage,
    switchToRequiredNetwork,
  ])

  const disconnectWallet = useCallback(async () => {
    if (connectionType === 'walletconnect' && walletProvider) {
      const runtimeProvider = walletProvider as WalletConnectRuntimeProvider
      if (runtimeProvider.disconnect) {
        try {
          await runtimeProvider.disconnect()
        } catch {
          // Ignore disconnect cleanup failures.
        }
      }
    }

    clearWalletSession()
    setStatusMessage('info', 'Wallet disconnected from this app session.')
  }, [clearWalletSession, connectionType, setStatusMessage, walletProvider])

  const switchActiveNetwork = useCallback(async () => {
    setBusyAction('switch-network')

    try {
      const provider = requireProvider()
      await switchToRequiredNetwork(provider)

      const selectedAccount = await refreshWalletState({
        providerOverride: provider,
        silent: true,
      })

      const loadedMarkets = await loadMarkets()
      if (selectedAccount) {
        await loadUserPredictions(selectedAccount, loadedMarkets)
      }

      setStatusMessage('success', 'Switched to BSC Testnet.')
    } catch (error) {
      setStatusMessage('error', `Network switch failed. ${toErrorMessage(error)}`)
    } finally {
      setBusyAction(null)
    }
  }, [loadMarkets, loadUserPredictions, refreshWalletState, requireProvider, setStatusMessage, switchToRequiredNetwork])

  const getPreparedWriteContract = useCallback(async () => {
    if (!account) {
      throw new Error('Connect wallet before sending a transaction.')
    }

    const provider = requireProvider()
    await switchToRequiredNetwork(provider)
    await refreshWalletState({ providerOverride: provider, silent: true })
    return getWriteContract(provider)
  }, [account, getWriteContract, refreshWalletState, requireProvider, switchToRequiredNetwork])

  const refreshAllData = useCallback(async () => {
    setBusyAction('refresh')

    try {
      const selectedAccount = await refreshWalletState({ silent: true })
      const loadedMarkets = await loadMarkets()
      if (selectedAccount) {
        await loadUserPredictions(selectedAccount, loadedMarkets)
      }
      setStatusMessage('success', 'Platform data refreshed.')
    } catch (error) {
      setStatusMessage('error', `Refresh failed. ${toErrorMessage(error)}`)
    } finally {
      setBusyAction(null)
    }
  }, [loadMarkets, loadUserPredictions, refreshWalletState, setStatusMessage])

  const createMarket = useCallback(async () => {
    const trimmedQuestion = question.trim()
    const durationValue = Number.parseInt(duration, 10)

    if (!trimmedQuestion || trimmedQuestion.length < 6) {
      setStatusMessage('error', 'Please enter a clear market question (at least 6 characters).')
      return
    }

    if (!Number.isInteger(durationValue) || durationValue <= 0) {
      setStatusMessage('error', 'Please enter a valid duration in minutes.')
      return
    }

    if (!canCreateMarket) {
      setStatusMessage('error', createMarketBlockReason)
      return
    }

    setBusyAction('create-market')

    try {
      const contract = await getPreparedWriteContract()
      await contract.createMarket.staticCall(trimmedQuestion, durationValue)
      const tx = await contract.createMarket(trimmedQuestion, durationValue)
      await tx.wait()

      setQuestion('')
      setDuration('')

      const loadedMarkets = await loadMarkets()
      await loadUserPredictions(account, loadedMarkets)
      setStatusMessage('success', 'Market created successfully.')
    } catch (error) {
      setStatusMessage('error', `Market creation failed. ${toErrorMessage(error)}`)
    } finally {
      setBusyAction(null)
    }
  }, [
    account,
    canCreateMarket,
    createMarketBlockReason,
    duration,
    getPreparedWriteContract,
    loadMarkets,
    loadUserPredictions,
    question,
    setStatusMessage,
  ])

  const placePrediction = useCallback(
    async (marketId: number, choice: number) => {
      const amount = (predictAmount[marketId] ?? '').trim()

      if (!amount) {
        setStatusMessage('error', 'Enter an amount before submitting your prediction.')
        return
      }

      let parsedAmount: bigint
      try {
        parsedAmount = ethers.parseEther(amount)
      } catch {
        setStatusMessage('error', 'Amount format is invalid.')
        return
      }

      if (parsedAmount <= BigInt(0)) {
        setStatusMessage('error', 'Amount must be greater than zero.')
        return
      }

      setBusyAction(`predict-${marketId}-${choice}`)

      try {
        const contract = await getPreparedWriteContract()
        const tx = await contract.predict(marketId, choice, { value: parsedAmount })
        await tx.wait()

        setPredictAmount((prev) => ({ ...prev, [marketId]: '' }))

        const loadedMarkets = await loadMarkets()
        await loadUserPredictions(account, loadedMarkets)
        setStatusMessage('success', 'Prediction submitted successfully.')
      } catch (error) {
        setStatusMessage('error', `Prediction failed. ${toErrorMessage(error)}`)
      } finally {
        setBusyAction(null)
      }
    },
    [account, getPreparedWriteContract, loadMarkets, loadUserPredictions, predictAmount, setStatusMessage],
  )

  const resolveMarket = useCallback(
    async (marketId: number, result: number) => {
      setBusyAction(`resolve-${marketId}-${result}`)

      try {
        const contract = await getPreparedWriteContract()
        const tx = await contract.resolveMarket(marketId, result)
        await tx.wait()

        const loadedMarkets = await loadMarkets()
        await loadUserPredictions(account, loadedMarkets)
        setStatusMessage('success', `Market #${marketId} resolved.`)
      } catch (error) {
        setStatusMessage('error', `Could not resolve market. ${toErrorMessage(error)}`)
      } finally {
        setBusyAction(null)
      }
    },
    [account, getPreparedWriteContract, loadMarkets, loadUserPredictions, setStatusMessage],
  )

  const claimWinnings = useCallback(
    async (marketId: number) => {
      setBusyAction(`claim-${marketId}`)

      try {
        const contract = await getPreparedWriteContract()
        const tx = await contract.claimWinnings(marketId)
        await tx.wait()

        const loadedMarkets = await loadMarkets()
        await loadUserPredictions(account, loadedMarkets)
        setStatusMessage('success', 'Winnings claimed successfully.')
      } catch (error) {
        setStatusMessage('error', `Claim failed. ${toErrorMessage(error)}`)
      } finally {
        setBusyAction(null)
      }
    },
    [account, getPreparedWriteContract, loadMarkets, loadUserPredictions, setStatusMessage],
  )

  useEffect(() => {
    void (async () => {
      const injectedProvider = typeof window !== 'undefined' ? window.ethereum ?? null : null
      setInjectedAvailable(Boolean(injectedProvider))

      let selectedAccount = ''
      if (injectedProvider) {
        selectedAccount = await refreshWalletState({
          providerOverride: injectedProvider,
          silent: true,
        })

        if (selectedAccount) {
          setWalletProvider(injectedProvider)
          setConnectionType('injected')
        }
      }

      const loadedMarkets = await loadMarkets()
      if (selectedAccount && loadedMarkets.length > 0) {
        await loadUserPredictions(selectedAccount, loadedMarkets)
      }
    })()
  }, [loadMarkets, loadUserPredictions, refreshWalletState])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowInSeconds(Math.floor(Date.now() / 1000))
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const provider = getEffectiveProvider()
    if (!provider?.on || !provider.removeListener) {
      return
    }

    const syncFromProvider = () => {
      void (async () => {
        const selectedAccount = await refreshWalletState({
          providerOverride: provider,
          silent: true,
        })
        const loadedMarkets = await loadMarkets()
        if (selectedAccount && loadedMarkets.length > 0) {
          await loadUserPredictions(selectedAccount, loadedMarkets)
        }
      })()
    }

    const handleDisconnect = () => {
      void disconnectWallet()
    }

    provider.on('accountsChanged', syncFromProvider)
    provider.on('chainChanged', syncFromProvider)
    provider.on('disconnect', handleDisconnect)

    return () => {
      provider.removeListener?.('accountsChanged', syncFromProvider)
      provider.removeListener?.('chainChanged', syncFromProvider)
      provider.removeListener?.('disconnect', handleDisconnect)
    }
  }, [disconnectWallet, getEffectiveProvider, loadMarkets, loadUserPredictions, refreshWalletState])

  const contractLink = isContractConfigured
    ? `https://testnet.bscscan.com/address/${CONTRACT_ADDRESS}`
    : 'https://testnet.bscscan.com'

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.navbar}>
          <div className={styles.brandWrap}>
            <div className={styles.logoBadge}>PF</div>
            <div>
              <p className={styles.brandLine}>PredictFi Pro Exchange</p>
              <h1 className={styles.mainHeading}>Turn Predictions Into Profits</h1>
              <p className={styles.mainSubheading}>
                The BNB-native information market where accurate forecasting turns into on-chain rewards.
              </p>
            </div>
          </div>

          <div className={styles.navWalletPanel}>
            <div className={styles.walletInfoRow}>
              <span>Connector: {connectorLabel}</span>
              <span>
                Network:{' '}
                {activeChainId === null
                  ? 'Unknown'
                  : activeChainId === CHAIN_ID
                    ? `BSC Testnet (${CHAIN_ID})`
                    : `Wrong chain (${activeChainId})`}
              </span>
            </div>

            <div className={styles.walletInfoRow}>
              <span>{account ? `Wallet: ${shortenAddress(account)}` : 'Wallet not connected'}</span>
              <a className={styles.inlineLink} href={contractLink} target="_blank" rel="noreferrer">
                Contract
              </a>
            </div>

            <div className={styles.navActions}>
              {!account ? (
                <>
                  <button
                    className={`${styles.button} ${styles.buttonPrimary}`}
                    onClick={connectInjectedWallet}
                    disabled={isBusy || !injectedAvailable}
                  >
                    {busyAction === 'connect-injected' ? 'Connecting...' : 'Connect Browser Wallet'}
                  </button>

                  <button
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    onClick={connectWalletConnect}
                    disabled={isBusy || !WALLETCONNECT_PROJECT_ID}
                  >
                    {busyAction === 'connect-walletconnect' ? 'Opening WalletConnect...' : 'Connect WalletConnect'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    onClick={refreshAllData}
                    disabled={isBusy}
                  >
                    {busyAction === 'refresh' ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <button
                    className={`${styles.button} ${styles.buttonGhost}`}
                    onClick={() => void disconnectWallet()}
                    disabled={isBusy}
                  >
                    Disconnect
                  </button>
                </>
              )}

              {isWrongNetwork && account && (
                <button
                  className={`${styles.button} ${styles.buttonWarning}`}
                  onClick={switchActiveNetwork}
                  disabled={isBusy}
                >
                  {busyAction === 'switch-network' ? 'Switching...' : 'Switch Network'}
                </button>
              )}
            </div>

            {!injectedAvailable && (
              <p className={styles.walletHint}>No browser wallet extension detected. Use WalletConnect to continue.</p>
            )}

            {!WALLETCONNECT_PROJECT_ID && (
              <p className={styles.walletHint}>
                WalletConnect is disabled until NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set in .env.local.
              </p>
            )}
          </div>
        </header>

        {status && <div className={`${styles.statusBanner} ${statusClassName}`}>{status.message}</div>}

        <section className={styles.statsBar}>
          <article className={styles.statPill}>
            <span>Total Markets</span>
            <strong>{stats.total}</strong>
          </article>
          <article className={styles.statPill}>
            <span>Live</span>
            <strong>{stats.live}</strong>
          </article>
          <article className={styles.statPill}>
            <span>Resolved</span>
            <strong>{stats.resolved}</strong>
          </article>
          <article className={styles.statPill}>
            <span>Total Liquidity</span>
            <strong>{formatToken(String(stats.totalPool))} tBNB</strong>
          </article>
        </section>

        <section className={styles.createPanel}>
          <div className={styles.createPanelHead}>
            <h2>Create Market</h2>
            <div className={styles.createHeadActions}>
              <span className={isOwner ? styles.ownerGood : styles.ownerBad}>
                {isOwner ? `Owner verified: ${shortenAddress(account)}` : `Owner required: ${shortenAddress(CONTRACT_OWNER)}`}
              </span>
              <button className={`${styles.button} ${styles.buttonGhost}`} onClick={refreshOwnerStatus} disabled={isBusy || !account}>
                Recheck Owner
              </button>
            </div>
          </div>

          <div className={styles.createForm}>
            <input
              className={styles.input}
              placeholder="Question (example: Will BTC close above $110k this week?)"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={!canCreateMarket || isBusy}
            />
            <input
              className={styles.input}
              placeholder="Duration in minutes"
              type="number"
              min="1"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              disabled={!canCreateMarket || isBusy}
            />
            <button
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={createMarket}
              disabled={isBusy || !canCreateMarket}
            >
              {busyAction === 'create-market' ? 'Creating...' : 'Create Market'}
            </button>
          </div>

          {createMarketBlockReason && <p className={styles.createBlockReason}>{createMarketBlockReason}</p>}
        </section>

        <section className={styles.marketsSection}>
          <div className={styles.sectionHeader}>
            <h2>Live Prediction Board</h2>
            <p>Bet on outcomes with transparent, on-chain liquidity.</p>
          </div>

          {markets.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No markets available yet.</h3>
              <p>{isOwner ? 'Create your first market above.' : 'Markets will appear here once created by the owner.'}</p>
            </div>
          ) : (
            <div className={styles.marketGrid}>
              {markets.map((market) => {
                const userPrediction = userPredictions[market.id]
                const ended = nowInSeconds > 0 && market.endTime <= nowInSeconds
                const totalPool = Number.parseFloat(market.totalPool)
                const yesPool = Number.parseFloat(market.yesPool)
                const yesPct = totalPool > 0 ? Math.round((yesPool / totalPool) * 100) : 50
                const noPct = 100 - yesPct
                const yesPrice = Math.max(1, Math.min(99, yesPct))
                const noPrice = 100 - yesPrice

                const userWon = Boolean(
                  userPrediction && market.resolved && !userPrediction.claimed && userPrediction.choice === market.result,
                )

                return (
                  <article className={styles.marketCard} key={market.id}>
                    <div className={styles.marketTopRow}>
                      <div className={styles.marketIcon}>M{market.id}</div>
                      <div className={styles.marketHeadingBlock}>
                        <p className={styles.marketQuestion}>{market.question}</p>
                        <span className={styles.marketTime}>{formatTimeLeft(market.endTime, nowInSeconds)}</span>
                      </div>
                      <span
                        className={`${styles.marketState} ${
                          market.resolved ? styles.marketResolved : ended ? styles.marketAwaiting : styles.marketLive
                        }`}
                      >
                        {market.resolved ? `Resolved ${resultLabel(market.result)}` : ended ? 'Awaiting Resolve' : 'Live'}
                      </span>
                    </div>

                    <div className={styles.probabilityRow}>
                      <span>{yesPct}%</span>
                      <div className={styles.poolTrack}>
                        <div className={styles.poolYes} style={{ width: `${yesPct}%` }} />
                      </div>
                      <span>{noPct}%</span>
                    </div>

                    <div className={styles.betButtonsRow}>
                      <button
                        className={`${styles.optionButton} ${styles.optionUp}`}
                        onClick={() => placePrediction(market.id, 1)}
                        disabled={isBusy || !account || market.resolved || ended || Boolean(userPrediction) || !isContractConfigured}
                      >
                        UP {yesPrice}c
                      </button>
                      <button
                        className={`${styles.optionButton} ${styles.optionDown}`}
                        onClick={() => placePrediction(market.id, 2)}
                        disabled={isBusy || !account || market.resolved || ended || Boolean(userPrediction) || !isContractConfigured}
                      >
                        DOWN {noPrice}c
                      </button>
                    </div>

                    {account && !market.resolved && !ended && !userPrediction && (
                      <div className={styles.amountRow}>
                        <input
                          className={styles.input}
                          placeholder="Amount in tBNB"
                          type="number"
                          min="0"
                          step="0.0001"
                          value={predictAmount[market.id] ?? ''}
                          onChange={(event) =>
                            setPredictAmount((prev) => ({
                              ...prev,
                              [market.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    )}

                    {userPrediction && (
                      <div className={styles.userPrediction}>
                        You picked {userPrediction.choice === 1 ? 'UP' : 'DOWN'} with {formatToken(userPrediction.amount)} tBNB
                        {userPrediction.claimed && <span className={styles.claimedTag}>Claimed</span>}
                      </div>
                    )}

                    <div className={styles.marketFootRow}>
                      <span>Pool {formatToken(market.totalPool)} tBNB</span>
                      <span className={styles.liveDot}>{market.resolved ? 'Closed' : 'Live'}</span>
                    </div>

                    {account && isOwner && !market.resolved && ended && (
                      <div className={styles.resolveRow}>
                        <button
                          className={`${styles.button} ${styles.buttonSuccess}`}
                          onClick={() => resolveMarket(market.id, 1)}
                          disabled={isBusy || !isContractConfigured}
                        >
                          Resolve UP
                        </button>
                        <button
                          className={`${styles.button} ${styles.buttonDanger}`}
                          onClick={() => resolveMarket(market.id, 2)}
                          disabled={isBusy || !isContractConfigured}
                        >
                          Resolve DOWN
                        </button>
                      </div>
                    )}

                    {account && userWon && (
                      <button
                        className={`${styles.button} ${styles.buttonPrimary}`}
                        onClick={() => claimWinnings(market.id)}
                        disabled={isBusy || !isContractConfigured}
                      >
                        Claim Winnings
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
