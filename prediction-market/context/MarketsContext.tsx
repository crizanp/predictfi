'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from './WalletContext'
import { toErrorMessage } from '../lib/utils'

export interface Market {
  id: number
  question: string
  endTime: number
  resolved: boolean
  result: number
  yesPool: string
  noPool: string
  totalPool: string
}

export interface UserPrediction {
  choice: number
  amount: string
  claimed: boolean
}

export interface MarketsContextValue {
  markets: Market[]
  userPredictions: Record<number, UserPrediction>
  totalInvested: string
  isLoadingMarkets: boolean
  loadMarkets: () => Promise<Market[]>
  loadUserPredictions: (account: string, mList: Market[]) => Promise<void>
  placePrediction: (marketId: number, choice: number, amount: string) => Promise<void>
  resolveMarket: (marketId: number, result: number) => Promise<void>
  claimWinnings: (marketId: number) => Promise<void>
  createMarket: (question: string, durationMinutes: number) => Promise<void>
  fetchMarket: (id: number) => Promise<Market | null>
}

const MarketsContext = createContext<MarketsContextValue | null>(null)

export function MarketsProvider({ children }: { children: React.ReactNode }) {
  const {
    account,
    isContractConfigured,
    isWrongNetwork,
    isOwner,
    setStatusMessage,
    setBusyAction,
    getPreparedWriteContract,
    getReadContract,
  } = useWallet()

  const [markets, setMarkets] = useState<Market[]>([])
  const [userPredictions, setUserPredictions] = useState<Record<number, UserPrediction>>({})
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false)

  const totalInvested = useMemo(() =>
    Object.values(userPredictions)
      .reduce((sum, p) => sum + Number(p.amount), 0)
      .toFixed(4)
  , [userPredictions])

  // Ref to always hold latest silent-refresh logic without recreating intervals
  const silentRefreshRef = useRef<() => Promise<void>>(async () => {})

  const loadMarkets = useCallback(async (): Promise<Market[]> => {
    if (!isContractConfigured) {
      setMarkets([])
      return []
    }

    setIsLoadingMarkets(true)
    try {
      const contract = getReadContract()
      const count = Number(await contract.marketCount())
      const marketList: Market[] = []

      for (let index = 1; index <= count; index += 1) {
        const market = await contract.getMarket(index)
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

      const sorted = [...marketList].reverse()
      setMarkets(sorted)
      return sorted
    } catch (error) {
      setStatusMessage('error', `Could not load markets. ${toErrorMessage(error)}`)
      return []
    } finally {
      setIsLoadingMarkets(false)
    }
  }, [getReadContract, isContractConfigured, setStatusMessage])

  const fetchMarket = useCallback(
    async (id: number): Promise<Market | null> => {
      if (!isContractConfigured) return null
      try {
        const contract = getReadContract()
        const market = await contract.getMarket(id)
        return {
          id: Number(market.id),
          question: market.question,
          endTime: Number(market.endTime),
          resolved: market.resolved,
          result: Number(market.result),
          yesPool: ethers.formatEther(market.yesPool),
          noPool: ethers.formatEther(market.noPool),
          totalPool: ethers.formatEther(market.totalPool),
        }
      } catch {
        return null
      }
    },
    [getReadContract, isContractConfigured]
  )

  const loadUserPredictions = useCallback(
    async (currentAccount: string, mList: Market[]) => {
      if (!currentAccount || mList.length === 0 || !isContractConfigured) {
        setUserPredictions({})
        return
      }

      try {
        const contract = getReadContract()
        const predictionMap: Record<number, UserPrediction> = {}

        for (const market of mList) {
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
    [getReadContract, isContractConfigured, setStatusMessage]
  )

  const placePrediction = useCallback(
    async (marketId: number, choice: number, amountInput: string) => {
      const amount = amountInput.trim()
      if (!amount) {
        setStatusMessage('error', 'Enter an amount before placing a prediction.')
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

        const loadedMarkets = await loadMarkets()
        if (account) await loadUserPredictions(account, loadedMarkets)
        setStatusMessage('success', 'Prediction placed successfully.')
      } catch (error) {
        setStatusMessage('error', `Prediction failed. ${toErrorMessage(error)}`)
      } finally {
        setBusyAction(null)
      }
    },
    [account, getPreparedWriteContract, loadMarkets, loadUserPredictions, setStatusMessage, setBusyAction]
  )

  const resolveMarket = useCallback(
    async (marketId: number, result: number) => {
      if (!isOwner) {
        setStatusMessage('error', 'Only the market owner can resolve markets.')
        return
      }

      setBusyAction(`resolve-${marketId}-${result}`)

      try {
        const contract = await getPreparedWriteContract()
        const tx = await contract.resolveMarket(marketId, result)
        await tx.wait()

        const loadedMarkets = await loadMarkets()
        if (account) await loadUserPredictions(account, loadedMarkets)
        setStatusMessage('success', `Market #${marketId} resolved.`)
      } catch (error) {
        setStatusMessage('error', `Resolve failed. ${toErrorMessage(error)}`)
      } finally {
        setBusyAction(null)
      }
    },
    [account, getPreparedWriteContract, isOwner, loadMarkets, loadUserPredictions, setStatusMessage, setBusyAction]
  )

  const claimWinnings = useCallback(
    async (marketId: number) => {
      setBusyAction(`claim-${marketId}`)

      try {
        // Re-fetch on-chain state before submitting to avoid stale-data reverts
        const readContract = getReadContract()
        const [freshMarket, freshPrediction] = await Promise.all([
          readContract.getMarket(marketId),
          account ? readContract.getUserPrediction(marketId, account) : null,
        ])

        const resolved = Boolean(freshMarket.resolved)
        const result = Number(freshMarket.result)
        const choice = freshPrediction ? Number(freshPrediction.choice) : 0
        const claimed = freshPrediction ? Boolean(freshPrediction.claimed) : true
        const amount = freshPrediction ? Number(freshPrediction.amount) : 0

        if (!resolved || result === 0) {
          setStatusMessage('error', 'Market is not yet resolved. Cannot claim.')
          return
        }
        if (amount === 0) {
          setStatusMessage('error', 'No prediction found for this market.')
          return
        }
        if (choice !== result) {
          setStatusMessage('error', 'Your prediction did not match the winning outcome.')
          return
        }
        if (claimed) {
          setStatusMessage('error', 'Winnings already claimed.')
          return
        }

        const contract = await getPreparedWriteContract()
        const tx = await contract.claimWinnings(marketId)
        await tx.wait()

        const loadedMarkets = await loadMarkets()
        if (account) await loadUserPredictions(account, loadedMarkets)
        setStatusMessage('success', 'Winnings claimed successfully.')
      } catch (error) {
        setStatusMessage('error', `Claim failed. ${toErrorMessage(error)}`)
      } finally {
        setBusyAction(null)
      }
    },
    [account, getReadContract, getPreparedWriteContract, loadMarkets, loadUserPredictions, setStatusMessage, setBusyAction]
  )

  const createMarket = useCallback(
    async (question: string, durationMinutes: number) => {
      const trimmedQuestion = question.trim()
      if (!trimmedQuestion || trimmedQuestion.length < 6) {
        setStatusMessage('error', 'Question must be at least 6 characters.')
        return
      }
      if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
        setStatusMessage('error', 'Enter a valid duration in minutes.')
        return
      }
      if (!isContractConfigured) {
        setStatusMessage('error', 'Contract not configured.')
        return
      }
      if (!account) {
        setStatusMessage('error', 'Connect wallet before creating a market.')
        return
      }
      if (isWrongNetwork) {
        setStatusMessage('error', 'Switch to BSC Testnet before creating a market.')
        return
      }
      if (!isOwner) {
        setStatusMessage('error', 'Only the contract owner can create markets.')
        return
      }

      setBusyAction('create-market')

      try {
        const contract = await getPreparedWriteContract()
        await contract.createMarket.staticCall(trimmedQuestion, durationMinutes)
        const tx = await contract.createMarket(trimmedQuestion, durationMinutes)
        await tx.wait()

        const loadedMarkets = await loadMarkets()
        if (account) await loadUserPredictions(account, loadedMarkets)
        setStatusMessage('success', 'Market created successfully.')
      } catch (error) {
        setStatusMessage('error', `Market creation failed. ${toErrorMessage(error)}`)
      } finally {
        setBusyAction(null)
      }
    },
    [account, getPreparedWriteContract, isContractConfigured, isOwner, isWrongNetwork, loadMarkets, loadUserPredictions, setStatusMessage, setBusyAction]
  )

  // Keep silentRefreshRef pointing to the latest fetch logic
  useEffect(() => {
    silentRefreshRef.current = async () => {
      if (!isContractConfigured) return
      try {
        const contract = getReadContract()
        const count = Number(await contract.marketCount())
        const list: Market[] = []
        for (let i = 1; i <= count; i++) {
          const m = await contract.getMarket(i)
          list.push({
            id: Number(m.id),
            question: m.question,
            endTime: Number(m.endTime),
            resolved: m.resolved,
            result: Number(m.result),
            yesPool: ethers.formatEther(m.yesPool),
            noPool: ethers.formatEther(m.noPool),
            totalPool: ethers.formatEther(m.totalPool),
          })
        }
        const sorted = [...list].reverse()
        setMarkets(sorted)
        if (account) await loadUserPredictions(account, sorted)
      } catch { /* silent — don't surface polling errors */ }
    }
  }, [isContractConfigured, getReadContract, account, loadUserPredictions])

  // Polling: refresh every 20 s without a loading spinner
  useEffect(() => {
    if (!isContractConfigured) return
    const id = setInterval(() => { void silentRefreshRef.current() }, 20_000)
    return () => clearInterval(id)
  }, [isContractConfigured])

  // WebSocket: push updates on contract events
  useEffect(() => {
    if (!isContractConfigured) return
    let destroyed = false
    let wsProvider: ethers.WebSocketProvider | null = null

    const setup = async () => {
      try {
        wsProvider = new ethers.WebSocketProvider('wss://bsc-testnet-rpc.publicnode.com')
        const { CONTRACT_ABI: ABI, CONTRACT_ADDRESS: ADDR } = await import('../lib/contract')
        const wsContract = new ethers.Contract(ADDR, ABI, wsProvider)
        const refresh = () => { if (!destroyed) void silentRefreshRef.current() }
        wsContract.on('PredictionPlaced', refresh)
        wsContract.on('MarketResolved', refresh)
        wsContract.on('WinningsClaimed', refresh)
        wsContract.on('MarketCreated', refresh)
      } catch {
        // WSS endpoint unavailable — polling is the fallback
      }
    }

    void setup()
    return () => {
      destroyed = true
      wsProvider?.destroy().catch(() => {})
    }
  }, [isContractConfigured])

  // Load markets on mount and when contract becomes available
  useEffect(() => {
    void loadMarkets()
  }, [loadMarkets])

  // Load user predictions when account or markets change
  useEffect(() => {
    if (account && markets.length > 0) {
      void loadUserPredictions(account, markets)
    } else if (!account) {
      setUserPredictions({})
    }
  }, [account, markets, loadUserPredictions])

  return (
    <MarketsContext.Provider
      value={{
        markets,
        userPredictions,
        totalInvested,
        isLoadingMarkets,
        loadMarkets,
        loadUserPredictions,
        placePrediction,
        resolveMarket,
        claimWinnings,
        createMarket,
        fetchMarket,
      }}
    >
      {children}
    </MarketsContext.Provider>
  )
}

export function useMarkets(): MarketsContextValue {
  const context = useContext(MarketsContext)
  if (!context) throw new Error('useMarkets must be used within MarketsProvider')
  return context
}


