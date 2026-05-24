'use client'

import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { CONTRACT_ABI, CONTRACT_ADDRESS, CHAIN_ID } from '../lib/contract'

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

declare global {
  interface Window {
    ethereum?: any
  }
}

export default function Home() {
  const [account, setAccount] = useState<string>('')
  const [isOwner, setIsOwner] = useState(false)
  const [markets, setMarkets] = useState<Market[]>([])
  const [userPredictions, setUserPredictions] = useState<{ [key: number]: UserPrediction }>({})
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  // Admin form
  const [question, setQuestion] = useState('')
  const [duration, setDuration] = useState('')

  // Prediction form
  const [predictAmount, setPredictAmount] = useState<{ [key: number]: string }>({})

  const getProvider = () => {
    if (!window.ethereum) throw new Error('MetaMask not found')
    return new ethers.BrowserProvider(window.ethereum)
  }

  const getContract = async (withSigner = false) => {
    const provider = getProvider()
    if (withSigner) {
      const signer = await provider.getSigner()
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
    }
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
  }

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert('Please install MetaMask!')
        return
      }
      const provider = getProvider()
      const network = await provider.getNetwork()
      if (Number(network.chainId) !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x61' }],
          })
        } catch {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x61',
              chainName: 'BSC Testnet',
              rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
              nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
              blockExplorerUrls: ['https://testnet.bscscan.com'],
            }],
          })
        }
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setAccount(accounts[0])
      checkOwner(accounts[0])
      loadMarkets()
    } catch (err: any) {
      setStatus('Error: ' + err.message)
    }
  }

  const checkOwner = async (userAccount: string) => {
    try {
      const contract = await getContract()
      const ownerAddress = await contract.owner()
      setIsOwner(ownerAddress.toLowerCase() === userAccount.toLowerCase())
    } catch (err) {
      console.error(err)
    }
  }

  const loadMarkets = useCallback(async () => {
    try {
      const contract = await getContract()
      const count = await contract.marketCount()
      const marketList: Market[] = []
      for (let i = 1; i <= Number(count); i++) {
        const m = await contract.getMarket(i)
        marketList.push({
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
      setMarkets(marketList.reverse())
    } catch (err) {
      console.error(err)
    }
  }, [])

  const loadUserPredictions = useCallback(async () => {
    if (!account) return
    try {
      const contract = await getContract()
      const preds: { [key: number]: UserPrediction } = {}
      for (const market of markets) {
        const p = await contract.getUserPrediction(market.id, account)
        if (Number(p.amount) > 0) {
          preds[market.id] = {
            choice: Number(p.choice),
            amount: ethers.formatEther(p.amount),
            claimed: p.claimed,
          }
        }
      }
      setUserPredictions(preds)
    } catch (err) {
      console.error(err)
    }
  }, [account, markets])

  useEffect(() => {
    if (account && markets.length > 0) loadUserPredictions()
  }, [account, markets, loadUserPredictions])

  const createMarket = async () => {
    if (!question || !duration) return
    setLoading(true)
    setStatus('Creating market...')
    try {
      const contract = await getContract(true)
      const tx = await contract.createMarket(question, parseInt(duration))
      await tx.wait()
      setStatus('Market created!')
      setQuestion('')
      setDuration('')
      loadMarkets()
    } catch (err: any) {
      setStatus('Error: ' + err.message)
    }
    setLoading(false)
  }

  const placePrediction = async (marketId: number, choice: number) => {
    const amount = predictAmount[marketId]
    if (!amount || parseFloat(amount) <= 0) {
      setStatus('Enter an amount first')
      return
    }
    setLoading(true)
    setStatus('Placing prediction...')
    try {
      const contract = await getContract(true)
      const tx = await contract.predict(marketId, choice, {
        value: ethers.parseEther(amount)
      })
      await tx.wait()
      setStatus('Prediction placed!')
      loadMarkets()
      loadUserPredictions()
    } catch (err: any) {
      setStatus('Error: ' + (err.reason || err.message))
    }
    setLoading(false)
  }

  const resolveMarket = async (marketId: number, result: number) => {
    setLoading(true)
    setStatus('Resolving market...')
    try {
      const contract = await getContract(true)
      const tx = await contract.resolveMarket(marketId, result)
      await tx.wait()
      setStatus('Market resolved!')
      loadMarkets()
    } catch (err: any) {
      setStatus('Error: ' + (err.reason || err.message))
    }
    setLoading(false)
  }

  const claimWinnings = async (marketId: number) => {
    setLoading(true)
    setStatus('Claiming winnings...')
    try {
      const contract = await getContract(true)
      const tx = await contract.claimWinnings(marketId)
      await tx.wait()
      setStatus('Winnings claimed!')
      loadMarkets()
      loadUserPredictions()
    } catch (err: any) {
      setStatus('Error: ' + (err.reason || err.message))
    }
    setLoading(false)
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    if (date < now) return 'Ended'
    const diff = Math.floor((date.getTime() - now.getTime()) / 1000)
    if (diff < 60) return `${diff}s left`
    if (diff < 3600) return `${Math.floor(diff / 60)}m left`
    return `${Math.floor(diff / 3600)}h left`
  }

  const getResultLabel = (result: number) => {
    if (result === 1) return 'YES'
    if (result === 2) return 'NO'
    return 'PENDING'
  }

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: 24, fontFamily: 'monospace' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>🎯 PredictFi</h1>
        {account ? (
          <div style={{ background: '#1a1a1a', padding: '8px 16px', borderRadius: 8, fontSize: 13 }}>
            {account.slice(0, 6)}...{account.slice(-4)}
            {isOwner && <span style={{ color: '#facc15', marginLeft: 8 }}>ADMIN</span>}
          </div>
        ) : (
          <button onClick={connectWallet} style={btnStyle('#3b82f6')}>
            Connect Wallet
          </button>
        )}
      </div>

      {/* Status */}
      {status && (
        <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13 }}>
          {status}
        </div>
      )}

      {/* Admin Panel */}
      {isOwner && (
        <div style={{ background: '#0f172a', border: '1px solid #facc15', borderRadius: 12, padding: 20, marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, color: '#facc15' }}>⚡ Admin — Create Market</h2>
          <input
            placeholder="Question e.g. Will BTC reach $100k by June?"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Duration in minutes (e.g. 60 = 1 hour)"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            type="number"
            style={{ ...inputStyle, marginTop: 10 }}
          />
          <button onClick={createMarket} disabled={loading} style={{ ...btnStyle('#facc15'), color: '#000', marginTop: 12 }}>
            {loading ? 'Creating...' : 'Create Market'}
          </button>
        </div>
      )}

      {/* Load Markets Button */}
      {account && (
        <button onClick={loadMarkets} style={{ ...btnStyle('#374151'), marginBottom: 20, fontSize: 13 }}>
          🔄 Refresh Markets
        </button>
      )}

      {/* Markets List */}
      {markets.length === 0 && account && (
        <div style={{ textAlign: 'center', color: '#666', padding: 40 }}>
          No markets yet. {isOwner ? 'Create one above!' : 'Check back soon.'}
        </div>
      )}

      {markets.map(market => {
        const userPred = userPredictions[market.id]
        const ended = market.endTime * 1000 < Date.now()
        const totalPool = parseFloat(market.totalPool)
        const yesPool = parseFloat(market.yesPool)
        const noPool = parseFloat(market.noPool)
        const yesPct = totalPool > 0 ? Math.round((yesPool / totalPool) * 100) : 50
        const noPct = 100 - yesPct

        return (
          <div key={market.id} style={{
            background: '#0f172a',
            border: market.resolved ? '1px solid #333' : '1px solid #1e40af',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16
          }}>
            {/* Question */}
            <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12 }}>
              {market.question}
            </div>

            {/* Status row */}
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#888', marginBottom: 14 }}>
              <span>{formatTime(market.endTime)}</span>
              <span>Pool: {parseFloat(market.totalPool).toFixed(4)} tBNB</span>
              {market.resolved && (
                <span style={{ color: market.result === 1 ? '#22c55e' : '#ef4444' }}>
                  Result: {getResultLabel(market.result)}
                </span>
              )}
            </div>

            {/* Pool bar */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: '#22c55e' }}>YES {yesPct}%</span>
                <span style={{ color: '#ef4444' }}>NO {noPct}%</span>
              </div>
              <div style={{ background: '#ef4444', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{ background: '#22c55e', width: `${yesPct}%`, height: '100%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555', marginTop: 3 }}>
                <span>{yesPool.toFixed(4)} tBNB</span>
                <span>{noPool.toFixed(4)} tBNB</span>
              </div>
            </div>

            {/* User prediction status */}
            {userPred && (
              <div style={{ background: '#1e293b', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>
                Your prediction: <strong style={{ color: userPred.choice === 1 ? '#22c55e' : '#ef4444' }}>
                  {userPred.choice === 1 ? 'YES' : 'NO'}
                </strong> — {parseFloat(userPred.amount).toFixed(4)} tBNB
                {userPred.claimed && <span style={{ color: '#888', marginLeft: 8 }}>(claimed)</span>}
              </div>
            )}

            {/* Actions */}
            {account && !market.resolved && !ended && !userPred && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  placeholder="Amount (tBNB)"
                  type="number"
                  value={predictAmount[market.id] || ''}
                  onChange={e => setPredictAmount(prev => ({ ...prev, [market.id]: e.target.value }))}
                  style={{ ...inputStyle, flex: 1, padding: '8px 12px', fontSize: 13 }}
                />
                <button onClick={() => placePrediction(market.id, 1)} disabled={loading} style={btnStyle('#22c55e')}>
                  YES
                </button>
                <button onClick={() => placePrediction(market.id, 2)} disabled={loading} style={btnStyle('#ef4444')}>
                  NO
                </button>
              </div>
            )}

            {/* Admin resolve */}
            {isOwner && !market.resolved && ended && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => resolveMarket(market.id, 1)} disabled={loading} style={btnStyle('#22c55e')}>
                  Resolve YES
                </button>
                <button onClick={() => resolveMarket(market.id, 2)} disabled={loading} style={btnStyle('#ef4444')}>
                  Resolve NO
                </button>
              </div>
            )}

            {/* Claim winnings */}
            {account && market.resolved && userPred && !userPred.claimed && userPred.choice === market.result && (
              <button onClick={() => claimWinnings(market.id)} disabled={loading} style={btnStyle('#facc15')}>
                🏆 Claim Winnings
              </button>
            )}

            {/* Lost */}
            {account && market.resolved && userPred && !userPred.claimed && userPred.choice !== market.result && (
              <div style={{ fontSize: 13, color: '#666' }}>Better luck next time 😅</div>
            )}
          </div>
        )
      })}

      {!account && (
        <div style={{ textAlign: 'center', padding: 60, color: '#444' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🎯</div>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Decentralized Prediction Market</div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>Connect your wallet to start predicting</div>
          <button onClick={connectWallet} style={btnStyle('#3b82f6')}>
            Connect MetaMask
          </button>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#333', marginTop: 40 }}>
        Running on BSC Testnet · Get free tBNB at testnet.binance.org/faucet-smart
      </div>
    </main>
  )
}

const btnStyle = (color: string) => ({
  background: color,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 18px',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 'bold' as const,
})

const inputStyle = {
  width: '100%',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: '10px 14px',
  color: '#fff',
  fontSize: 14,
  boxSizing: 'border-box' as const,
}