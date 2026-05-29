'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from './WalletContext'
import { toErrorMessage } from '../lib/utils'
import { recordActivity } from '../lib/supabase'

export interface MarketEventSummary {
  id: number
  name: string
  resolved: boolean
  result: number
  yesPool: string
  noPool: string
  totalPool: string
  totalYesShares: string
  totalNoShares: string
}

export interface Market {
  id: number
  eventName: string
  question: string
  endTime: number
  eventCount: number
  events: MarketEventSummary[]
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
  yesAmount?: string
  noAmount?: string
  hasBothSides?: boolean
}

export interface PredictionEvent {
  address: string
  eventId: number
  choice: number
  amount: string
  txHash: string
  blockNumber: number
}

export interface ClaimEvent {
  address: string
  eventId: number
  amount: string
  txHash: string
  blockNumber: number
  claimedAt?: string
}

export interface MarketsContextValue {
  markets: Market[]
  userPredictions: Record<number, UserPrediction>
  eventPredictions: Record<string, UserPrediction>
  totalInvested: string
  isLoadingMarkets: boolean
  isLoadingPredictions: boolean
  hasLoadedMarkets: boolean
  loadMarkets: () => Promise<Market[]>
  loadUserPredictions: (account: string, mList: Market[]) => Promise<void>
  getEventUserPrediction: (marketId: number, eventId: number) => UserPrediction | undefined
  placePrediction: (marketId: number, eventId: number, choice: number, amount: string) => Promise<void>
  resolveMarket: (marketId: number, result: number, eventId?: number) => Promise<void>
  withdrawFees: () => Promise<void>
  claimWinnings: (marketId: number, eventId?: number) => Promise<void>
  createMarket: (question: string, durationMinutes: number, eventNames: string[]) => Promise<void>
  fetchMarket: (id: number) => Promise<Market | null>
  getMarketPredictions: (marketId: number, eventId?: number) => Promise<PredictionEvent[]>
  getMarketClaims: (marketId: number, eventId?: number) => Promise<ClaimEvent[]>
}

const MarketsContext = createContext<MarketsContextValue | null>(null)

function eventPredictionKey(marketId: number, eventId: number): string {
  return `${marketId}:${eventId}`
}

function marketLifecycleRank(market: Market, nowInSeconds = Math.floor(Date.now() / 1000)): number {
  const isLive = !market.resolved && (nowInSeconds <= 0 || market.endTime > nowInSeconds)
  const isEnded = !market.resolved && nowInSeconds > 0 && market.endTime <= nowInSeconds
  if (isLive) return 0
  if (isEnded) return 1
  return 2
}

const HIDE_OUTDATED_MARKETS = (process.env.NEXT_PUBLIC_HIDE_OUTDATED_MARKETS ?? 'true') !== 'false'
const MARKET_RETENTION_DAYS = Number(process.env.NEXT_PUBLIC_MARKET_RETENTION_DAYS ?? '21')
const MIN_VISIBLE_MARKET_ID = Number(process.env.NEXT_PUBLIC_MIN_VISIBLE_MARKET_ID ?? '1')

function isOutdatedMarket(market: Market, nowInSeconds: number): boolean {
  const retentionDays = Number.isFinite(MARKET_RETENTION_DAYS) ? Math.max(1, MARKET_RETENTION_DAYS) : 21
  const retentionSeconds = retentionDays * 24 * 60 * 60
  const endedOrResolved = market.resolved || market.endTime <= nowInSeconds
  if (!endedOrResolved) return false
  return nowInSeconds - market.endTime > retentionSeconds
}

async function hydrateMarket(contract: ethers.Contract, marketId: number): Promise<Market> {
  const market = await contract.getMarket(marketId)
  const eventCount = Number(market.eventCount)
  const events: MarketEventSummary[] = []

  for (let eventId = 1; eventId <= eventCount; eventId += 1) {
    const [eventMeta, eventPool] = await Promise.all([
      contract['getEvent(uint256,uint256)'](marketId, eventId),
      contract.eventPools(marketId, eventId),
    ])
    events.push({
      id: Number(eventMeta.id),
      name: String(eventMeta.name),
      resolved: Boolean(eventPool.resolved),
      result: Number(eventPool.result),
      yesPool: ethers.formatEther(eventPool.yesPool),
      noPool: ethers.formatEther(eventPool.noPool),
      totalPool: ethers.formatEther(eventPool.totalPool),
      totalYesShares: ethers.formatEther(eventPool.totalYesShares),
      totalNoShares: ethers.formatEther(eventPool.totalNoShares),
    })
  }

  const firstEvent = events[0]
  const aggregateYes = events.reduce((sum, e) => sum + parseFloat(e.yesPool), 0)
  const aggregateNo = events.reduce((sum, e) => sum + parseFloat(e.noPool), 0)
  const aggregateTotal = events.reduce((sum, e) => sum + parseFloat(e.totalPool), 0)

  return {
    id: Number(market.id),
    eventName: firstEvent?.name ?? 'Event 1',
    question: String(market.question),
    endTime: Number(market.endTime),
    eventCount,
    events,
    resolved: events.length > 0 ? events.every((event) => event.resolved) : false,
    result: firstEvent?.result ?? 0,
    yesPool: aggregateYes.toFixed(18),
    noPool: aggregateNo.toFixed(18),
    totalPool: aggregateTotal.toFixed(18),
  }
}

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
  const [eventPredictions, setEventPredictions] = useState<Record<string, UserPrediction>>({})
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false)
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(false)
  const [hasLoadedMarkets, setHasLoadedMarkets] = useState(false)

  const totalInvested = useMemo(() =>
    Object.values(userPredictions)
      .reduce((sum, p) => sum + Number(p.amount), 0)
      .toFixed(4)
  , [userPredictions])

  const silentRefreshRef = useRef<() => Promise<void>>(async () => {})

  const loadMarkets = useCallback(async (): Promise<Market[]> => {
    if (!isContractConfigured) {
      setMarkets([])
      setIsLoadingMarkets(false)
      setHasLoadedMarkets(true)
      return []
    }

    setIsLoadingMarkets(true)
    try {
      const contract = getReadContract()
      const count = Number(await contract.marketCount())
      const marketList: Market[] = []
      const nowInSeconds = Math.floor(Date.now() / 1000)

      for (let index = 1; index <= count; index += 1) {
        const hydrated = await hydrateMarket(contract, index)
        if (hydrated.id < MIN_VISIBLE_MARKET_ID) continue
        if (HIDE_OUTDATED_MARKETS && !isOwner && isOutdatedMarket(hydrated, nowInSeconds)) continue
        marketList.push(hydrated)
      }

      const sorted = [...marketList].sort((a, b) => {
        const rankDelta = marketLifecycleRank(a, nowInSeconds) - marketLifecycleRank(b, nowInSeconds)
        if (rankDelta !== 0) return rankDelta
        return b.id - a.id
      })
      setMarkets(sorted)
      setHasLoadedMarkets(true)
      return sorted
    } catch (error) {
      console.warn('loadMarkets failed:', toErrorMessage(error))
      setHasLoadedMarkets(true)
      return []
    } finally {
      setIsLoadingMarkets(false)
    }
  }, [getReadContract, isContractConfigured, isOwner])

  const fetchMarket = useCallback(
    async (id: number): Promise<Market | null> => {
      if (!isContractConfigured) return null
      try {
        const contract = getReadContract()
        return await hydrateMarket(contract, id)
      } catch {
        return null
      }
    },
    [getReadContract, isContractConfigured]
  )

  const loadUserPredictions = useCallback(
    async (currentAccount: string, mList: Market[]) => {
      setIsLoadingPredictions(true)
      if (!currentAccount || mList.length === 0 || !isContractConfigured) {
        setUserPredictions({})
        setEventPredictions({})
        setIsLoadingPredictions(false)
        return
      }

      try {
        const contract = getReadContract()
        const marketPredictionMap: Record<number, UserPrediction> = {}
        const eventPredictionMap: Record<string, UserPrediction> = {}

        for (const market of mList) {
          let aggregateAmount = 0
          let latestChoice = 0
          let aggregateYes = 0
          let aggregateNo = 0

          for (const event of market.events) {
            const shares = await contract.getUserShares(market.id, event.id, currentAccount)
            const yesSharesWei = (shares[0] as bigint) ?? BigInt(0)
            const noSharesWei = (shares[1] as bigint) ?? BigInt(0)
            const totalSharesWei = yesSharesWei + noSharesWei

            if (totalSharesWei > BigInt(0)) {
              const choice = yesSharesWei >= noSharesWei ? 1 : 2
              const mapped: UserPrediction = {
                choice,
                amount: ethers.formatEther(totalSharesWei),
                claimed: false,
                yesAmount: ethers.formatEther(yesSharesWei),
                noAmount: ethers.formatEther(noSharesWei),
                hasBothSides: yesSharesWei > BigInt(0) && noSharesWei > BigInt(0),
              }

              eventPredictionMap[eventPredictionKey(market.id, event.id)] = mapped
              aggregateAmount += Number(mapped.amount)
              aggregateYes += Number(mapped.yesAmount ?? '0')
              aggregateNo += Number(mapped.noAmount ?? '0')
              latestChoice = mapped.choice
            }
          }

          if (aggregateAmount > 0) {
            marketPredictionMap[market.id] = {
              choice: latestChoice || (aggregateYes >= aggregateNo ? 1 : 2),
              amount: aggregateAmount.toString(),
              claimed: false,
              yesAmount: aggregateYes.toString(),
              noAmount: aggregateNo.toString(),
              hasBothSides: aggregateYes > 0 && aggregateNo > 0,
            }
          }
        }

        setUserPredictions(marketPredictionMap)
        setEventPredictions(eventPredictionMap)
      } catch (error) {
        const message = toErrorMessage(error)
        if (message.toLowerCase().includes('missing response for request')) {
          console.warn('loadUserPredictions transient RPC failure:', message)
          setIsLoadingPredictions(false)
          return
        }
        setStatusMessage('error', `Could not load your predictions. ${message}`)
      } finally {
        setIsLoadingPredictions(false)
      }
    },
    [getReadContract, isContractConfigured, setStatusMessage]
  )

  const getEventUserPrediction = useCallback(
    (marketId: number, eventId: number): UserPrediction | undefined => eventPredictions[eventPredictionKey(marketId, eventId)],
    [eventPredictions]
  )

  const placePrediction = useCallback(
    async (marketId: number, eventId: number, choice: number, amountInput: string) => {
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

      setBusyAction(`predict-${marketId}-${eventId}-${choice}`)

      try {
        const contract = await getPreparedWriteContract()
        const tx = await contract.predict(marketId, eventId, choice, { value: parsedAmount })
        const receipt = await tx.wait()

        void recordActivity(
          marketId,
          account,
          choice,
          amount,
          tx.hash as string,
          receipt?.blockNumber as number | undefined,
          eventId
        )

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
    async (marketId: number, result: number, eventId = 1) => {
      if (!isOwner) {
        setStatusMessage('error', 'Only the market owner can resolve events.')
        return
      }

      setBusyAction(`resolve-${marketId}-${eventId}-${result}`)

      try {
        const contract = await getPreparedWriteContract()
        const tx = await contract.resolveEvent(marketId, eventId, result)
        await tx.wait()

        const loadedMarkets = await loadMarkets()
        if (account) await loadUserPredictions(account, loadedMarkets)
        setStatusMessage('success', `Event #${eventId} in market #${marketId} resolved.`)
      } catch (error) {
        setStatusMessage('error', `Resolve failed. ${toErrorMessage(error)}`)
      } finally {
        setBusyAction(null)
      }
    },
    [account, getPreparedWriteContract, isOwner, loadMarkets, loadUserPredictions, setStatusMessage, setBusyAction]
  )

  const withdrawFees = useCallback(
    async () => {
      if (!isOwner) {
        setStatusMessage('error', 'Only the contract owner can withdraw fees.')
        return
      }

      setBusyAction('withdraw-fees')
      try {
        const contract = await getPreparedWriteContract()
        const tx = await contract.withdrawFees()
        await tx.wait()

        const loadedMarkets = await loadMarkets()
        if (account) await loadUserPredictions(account, loadedMarkets)
        setStatusMessage('success', 'Protocol fees withdrawn successfully.')
      } catch (error) {
        setStatusMessage('error', `Withdraw failed. ${toErrorMessage(error)}`)
      } finally {
        setBusyAction(null)
      }
    },
    [account, getPreparedWriteContract, isOwner, loadMarkets, loadUserPredictions, setBusyAction, setStatusMessage]
  )

  const claimWinnings = useCallback(
    async (marketId: number, eventId = 1) => {
      setBusyAction(`claim-${marketId}-${eventId}`)

      try {
        const readContract = getReadContract()
        const [pool, shares] = await Promise.all([
          readContract.eventPools(marketId, eventId),
          account ? readContract.getUserShares(marketId, eventId, account) : null,
        ])

        const resolved = Boolean(pool.resolved)
        const result = Number(pool.result)
        const yesShares = shares ? Number(ethers.formatEther((shares[0] as bigint) ?? BigInt(0))) : 0
        const noShares = shares ? Number(ethers.formatEther((shares[1] as bigint) ?? BigInt(0))) : 0
        const winningShares = result === 1 ? yesShares : result === 2 ? noShares : 0

        if (!resolved || result === 0) {
          setStatusMessage('error', 'Event is not yet resolved. Cannot claim.')
          return
        }
        if (winningShares === 0) {
          setStatusMessage('error', 'No winning shares available to claim.')
          return
        }

        const contract = await getPreparedWriteContract()
        const tx = await contract.claimWinnings(marketId, eventId)
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
    async (question: string, durationMinutes: number, eventNames: string[]) => {
      const trimmedQuestion = question.trim()
      const normalizedEvents = eventNames
        .map((eventName) => eventName.trim())
        .filter((eventName) => eventName.length > 0)

      if (!trimmedQuestion || trimmedQuestion.length < 6) {
        setStatusMessage('error', 'Question must be at least 6 characters.')
        return
      }
      if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
        setStatusMessage('error', 'Enter a valid duration in minutes.')
        return
      }
      if (normalizedEvents.length === 0) {
        setStatusMessage('error', 'Add at least one event name.')
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
        await contract.createMarket.staticCall(trimmedQuestion, normalizedEvents, durationMinutes)
        const tx = await contract.createMarket(trimmedQuestion, normalizedEvents, durationMinutes)
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

  const getMarketPredictions = useCallback(
    async (marketId: number, eventId?: number): Promise<PredictionEvent[]> => {
      if (!isContractConfigured) return []
      try {
        const contract = getReadContract()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filter = (contract.filters as any).PredictionPlaced(marketId, eventId ?? null)
        const events = await contract.queryFilter(filter)
          return events.map((e) => {
          const args = (e as { args?: unknown[] }).args ?? []
          return {
            eventId: Number(args[1] ?? 0),
            address: (args[2] as string) ?? '0x???',
            choice: Number(args[3] ?? 0),
              amount: ethers.formatEther((args[4] as bigint) ?? BigInt(0)),
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
          }
        }).reverse()
      } catch {
        return []
      }
    },
    [getReadContract, isContractConfigured]
  )

  const getMarketClaims = useCallback(
    async (marketId: number, eventId?: number): Promise<ClaimEvent[]> => {
      if (!isContractConfigured) return []
      try {
        const contract = getReadContract()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filter = (contract.filters as any).WinningsClaimed(marketId, eventId ?? null, account ?? null)
        const events = await contract.queryFilter(filter)
        const rows = await Promise.all(events.map(async (e) => {
          const args = (e as { args?: unknown[] }).args ?? []
          let claimedAt: string | undefined
          try {
            const block = await e.getBlock()
            claimedAt = new Date(Number(block.timestamp) * 1000).toISOString()
          } catch {
            claimedAt = undefined
          }
          return {
            eventId: Number(args[1] ?? 0),
            address: (args[2] as string) ?? '0x???',
            amount: ethers.formatEther((args[3] as bigint) ?? BigInt(0)),
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
            claimedAt,
          }
        }))
        return rows.reverse()
      } catch {
        return []
      }
    },
    [account, getReadContract, isContractConfigured]
  )

  useEffect(() => {
    silentRefreshRef.current = async () => {
      if (!isContractConfigured) return
      try {
        const sorted = await loadMarkets()
        if (account) await loadUserPredictions(account, sorted)
      } catch {
        // silent fallback
      }
    }
  }, [account, isContractConfigured, loadMarkets, loadUserPredictions])

  useEffect(() => {
    if (!isContractConfigured) return
    let destroyed = false
    let wsProvider: ethers.WebSocketProvider | null = null
    let wsContract: ethers.Contract | null = null

    const setup = async () => {
      try {
        wsProvider = new ethers.WebSocketProvider('wss://bsc-testnet-rpc.publicnode.com')
        const { CONTRACT_ABI: ABI, CONTRACT_ADDRESS: ADDR } = await import('../lib/contract')
        if (destroyed) {
          await wsProvider.destroy().catch(() => {})
          return
        }

        wsContract = new ethers.Contract(ADDR, ABI, wsProvider)
        const refresh = () => { if (!destroyed) void silentRefreshRef.current() }

        await Promise.allSettled([
          wsContract.on('PredictionPlaced', refresh),
          wsContract.on('EventCreated', refresh),
          wsContract.on('EventResolved', refresh),
          wsContract.on('WinningsClaimed', refresh),
          wsContract.on('MarketCreated', refresh),
        ])
      } catch {
        // fallback to polling
      }
    }

    void setup()
    return () => {
      destroyed = true
      wsContract?.removeAllListeners()
      wsProvider?.destroy().catch(() => {})
    }
  }, [isContractConfigured])

  useEffect(() => {
    const timer = setTimeout(() => { void loadMarkets() }, 0)
    return () => clearTimeout(timer)
  }, [loadMarkets])

  useEffect(() => {
    if (account && markets.length > 0) {
      const timer = setTimeout(() => { void loadUserPredictions(account, markets) }, 0)
      return () => clearTimeout(timer)
    }
    if (!account) {
      const timer = setTimeout(() => {
        setUserPredictions({})
        setEventPredictions({})
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [account, markets, loadUserPredictions])

  return (
    <MarketsContext.Provider
      value={{
        markets,
        userPredictions,
        eventPredictions,
        totalInvested,
        isLoadingMarkets,
        isLoadingPredictions,
        hasLoadedMarkets,
        loadMarkets,
        loadUserPredictions,
        getEventUserPrediction,
        placePrediction,
        resolveMarket,
        withdrawFees,
        claimWinnings,
        createMarket,
        fetchMarket,
        getMarketPredictions,
        getMarketClaims,
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
