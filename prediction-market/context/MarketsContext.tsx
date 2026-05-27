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

async function hydrateMarket(contract: ethers.Contract, marketId: number): Promise<Market> {
  const market = await contract.getMarket(marketId)
  const eventCount = Number(market.eventCount)
  const events: MarketEventSummary[] = []

  for (let eventId = 1; eventId <= eventCount; eventId += 1) {
    const eventMarket = await contract['getEvent(uint256,uint256)'](marketId, eventId)
    events.push({
      id: Number(eventMarket.id),
      name: String(eventMarket.name),
      resolved: Boolean(eventMarket.resolved),
      result: Number(eventMarket.result),
      yesPool: ethers.formatEther(eventMarket.yesPool),
      noPool: ethers.formatEther(eventMarket.noPool),
      totalPool: ethers.formatEther(eventMarket.totalPool),
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

      for (let index = 1; index <= count; index += 1) {
        marketList.push(await hydrateMarket(contract, index))
      }

      const nowInSeconds = Math.floor(Date.now() / 1000)
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
  }, [getReadContract, isContractConfigured])

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
          let allClaimed = true
          let aggregateYes = 0
          let aggregateNo = 0

          for (const event of market.events) {
            const [prediction, placedEvents] = await Promise.all([
              contract.getUserPrediction(market.id, event.id, currentAccount),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              contract.queryFilter((contract.filters as any).PredictionPlaced(market.id, event.id, currentAccount)),
            ])

            let yesAmountWei = BigInt(0)
            let noAmountWei = BigInt(0)
            let latestChoiceForEvent = Number(prediction.choice)

            for (const placedEvent of placedEvents) {
              const args = (placedEvent as { args?: unknown[] }).args ?? []
              const choice = Number(args[3] ?? 0)
              const amountWei = (args[4] as bigint) ?? BigInt(0)
              if (choice === 1) yesAmountWei += amountWei
              if (choice === 2) noAmountWei += amountWei
              if (choice === 1 || choice === 2) latestChoiceForEvent = choice
            }

            const totalFromLogs = yesAmountWei + noAmountWei
            const fallbackAmount = (prediction.amount as bigint) ?? BigInt(0)
            const totalAmountWei = totalFromLogs > BigInt(0) ? totalFromLogs : fallbackAmount
            if (totalAmountWei > BigInt(0)) {
              const resolvedYesWei = yesAmountWei > BigInt(0)
                ? yesAmountWei
                : (latestChoiceForEvent === 1 ? totalAmountWei : BigInt(0))
              const resolvedNoWei = noAmountWei > BigInt(0)
                ? noAmountWei
                : (latestChoiceForEvent === 2 ? totalAmountWei : BigInt(0))

              const mapped: UserPrediction = {
                choice: latestChoiceForEvent || Number(prediction.choice),
                amount: ethers.formatEther(totalAmountWei),
                claimed: Boolean(prediction.claimed),
                yesAmount: ethers.formatEther(resolvedYesWei),
                noAmount: ethers.formatEther(resolvedNoWei),
                hasBothSides: resolvedYesWei > BigInt(0) && resolvedNoWei > BigInt(0),
              }
              eventPredictionMap[eventPredictionKey(market.id, event.id)] = mapped

              aggregateAmount += Number(mapped.amount)
              aggregateYes += Number(mapped.yesAmount ?? '0')
              aggregateNo += Number(mapped.noAmount ?? '0')
              latestChoice = mapped.choice
              allClaimed = allClaimed && mapped.claimed
            }
          }

          if (aggregateAmount > 0) {
            marketPredictionMap[market.id] = {
              choice: latestChoice || (aggregateYes >= aggregateNo ? 1 : 2),
              amount: aggregateAmount.toString(),
              claimed: allClaimed,
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

  const claimWinnings = useCallback(
    async (marketId: number, eventId = 1) => {
      setBusyAction(`claim-${marketId}-${eventId}`)

      try {
        const readContract = getReadContract()
        const [freshEvent, freshPrediction] = await Promise.all([
          readContract['getEvent(uint256,uint256)'](marketId, eventId),
          account ? readContract.getUserPrediction(marketId, eventId, account) : null,
        ])

        const resolved = Boolean(freshEvent.resolved)
        const result = Number(freshEvent.result)
        const claimed = freshPrediction ? Boolean(freshPrediction.claimed) : true
        const amount = freshPrediction ? Number(freshPrediction.amount) : 0

        if (!resolved || result === 0) {
          setStatusMessage('error', 'Event is not yet resolved. Cannot claim.')
          return
        }
        if (amount === 0) {
          setStatusMessage('error', 'No prediction found for this event.')
          return
        }
        if (claimed) {
          setStatusMessage('error', 'Winnings already claimed.')
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

    const setup = async () => {
      try {
        wsProvider = new ethers.WebSocketProvider('wss://bsc-testnet-rpc.publicnode.com')
        const { CONTRACT_ABI: ABI, CONTRACT_ADDRESS: ADDR } = await import('../lib/contract')
        const wsContract = new ethers.Contract(ADDR, ABI, wsProvider)
        const refresh = () => { if (!destroyed) void silentRefreshRef.current() }
        wsContract.on('PredictionPlaced', refresh)
        wsContract.on('EventResolved', refresh)
        wsContract.on('WinningsClaimed', refresh)
        wsContract.on('MarketCreated', refresh)
      } catch {
        // fallback to polling
      }
    }

    void setup()
    return () => {
      destroyed = true
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
