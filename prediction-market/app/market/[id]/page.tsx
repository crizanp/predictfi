'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMarkets, type PredictionEvent } from '../../../context/MarketsContext'
import { useWallet } from '../../../context/WalletContext'
import { getMarketCategory, formatTimeLeft, resultLabel } from '../../../lib/utils'
import { getMarketMeta, type MarketMeta } from '../../../lib/supabase'
import TradePanel from '../../../components/TradePanel'
import OddsChart from '../../../components/OddsChart'
import styles from './page.module.css'

const CATEGORY_COLORS: Record<string, string> = {
  Sports: '#3b82f6', Crypto: '#8b5cf6', Politics: '#f59e0b',
  Esports: '#ec4899', Finance: '#06b6d4', Economy: '#14b8a6',
  Culture: '#f97316', Trending: '#8b5cf6', New: '#a78bfa',
}

let nextCommentId = 1

interface Reply  { id: number; author: string; text: string; likes: number; liked: boolean }
interface Comment { id: number; author: string; text: string; likes: number; liked: boolean; replies: Reply[]; replyOpen: boolean; replyInput: string }

export default function MarketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { fetchMarket, markets: ctxMarkets, getMarketPredictions } = useMarkets()
  const { account, setShowWalletModal } = useWallet()

  const marketId = Number(params?.id)

  const [market, setMarket]       = useState<Awaited<ReturnType<typeof fetchMarket>>>(null)
  const [loading, setLoading]     = useState(true)
  const [nowInSeconds, setNowInSeconds] = useState(Math.floor(Date.now() / 1000))
  const [meta, setMeta]           = useState<MarketMeta | null>(null)

  const [activeTab, setActiveTab] = useState<'discussion' | 'holders' | 'activity'>('discussion')
  const [comments, setComments]   = useState<Comment[]>([])
  const [commentInput, setCommentInput] = useState('')

  // Holders / Activity data
  const [predictions, setPredictions]     = useState<PredictionEvent[]>([])
  const [predsLoading, setPredsLoading]   = useState(false)

  // Initial load
  useEffect(() => {
    if (!marketId || Number.isNaN(marketId)) { router.replace('/'); return }
    setLoading(true)
    fetchMarket(marketId).then((m) => { setMarket(m); setLoading(false) })
    getMarketMeta(marketId).then(setMeta)
  }, [fetchMarket, marketId, router])

  // Live updates: whenever context markets array refreshes (WSS-driven), sync this market
  useEffect(() => {
    if (!marketId || !ctxMarkets.length) return
    const live = ctxMarkets.find(m => m.id === marketId)
    if (live) setMarket(live)
  }, [ctxMarkets, marketId])

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNowInSeconds(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  // Load predictions when holders/activity tab first activated
  useEffect(() => {
    if ((activeTab === 'holders' || activeTab === 'activity') && predictions.length === 0 && !predsLoading) {
      setPredsLoading(true)
      getMarketPredictions(marketId).then(p => { setPredictions(p); setPredsLoading(false) })
    }
  }, [activeTab, marketId, getMarketPredictions, predictions.length, predsLoading])

  const category = useMemo(() => market ? getMarketCategory(market.id, market.question) : '', [market])
  const timeLeft  = useMemo(() => market ? formatTimeLeft(market.endTime, nowInSeconds) : '', [market, nowInSeconds])
  const isEnded   = market ? nowInSeconds > 0 && market.endTime <= nowInSeconds : false
  const catColor  = CATEGORY_COLORS[category] ?? '#8b5cf6'
  const hashId    = market ? `#${market.id.toString(16).padStart(6, '0').toUpperCase()}` : ''

  // Holders: unique addresses, aggregated
  const holders = useMemo(() => {
    const map = new Map<string, { choice: number; totalAmount: number }>()
    for (const p of predictions) {
      const prev = map.get(p.address)
      if (prev) prev.totalAmount += parseFloat(p.amount)
      else map.set(p.address, { choice: p.choice, totalAmount: parseFloat(p.amount) })
    }
    return Array.from(map.entries())
      .map(([addr, v]) => ({ addr, ...v }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
  }, [predictions])

  // Comment handlers
  const handlePostComment = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!commentInput.trim()) return
    const author = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Anon'
    setComments(prev => [...prev, {
      id: nextCommentId++, author, text: commentInput.trim(),
      likes: 0, liked: false, replies: [], replyOpen: false, replyInput: '',
    }])
    setCommentInput('')
  }, [commentInput, account])

  const likeComment = useCallback((id: number) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, likes: c.liked ? c.likes - 1 : c.likes + 1, liked: !c.liked } : c))
  }, [])

  const toggleReply = useCallback((id: number) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, replyOpen: !c.replyOpen } : c))
  }, [])

  const updateReplyInput = useCallback((id: number, val: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, replyInput: val } : c))
  }, [])

  const postReply = useCallback((id: number) => {
    setComments(prev => prev.map(c => {
      if (c.id !== id || !c.replyInput.trim()) return c
      const author = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Anon'
      return { ...c, replyOpen: false, replyInput: '',
        replies: [...c.replies, { id: nextCommentId++, author, text: c.replyInput.trim(), likes: 0, liked: false }] }
    }))
  }, [account])

  const likeReply = useCallback((commentId: number, replyId: number) => {
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, replies: c.replies.map(r => r.id === replyId ? { ...r, likes: r.liked ? r.likes - 1 : r.likes + 1, liked: !r.liked } : r) }
        : c
    ))
  }, [])

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
        <p>Loading market…</p>
      </div>
    )
  }

  if (!market) {
    return (
      <div className={styles.notFound}>
        <span className={styles.notFoundIcon}>🔍</span>
        <h1>Market Not Found</h1>
        <p>This market doesn&apos;t exist or couldn&apos;t be loaded.</p>
        <Link href="/markets" className={styles.backLink}>← Back to Markets</Link>
      </div>
    )
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Link href="/markets" className={styles.back}>← All Markets</Link>

        {/* ── Two-column layout ── */}
        <div className={styles.layout}>
          <div className={styles.leftCol}>
            {/* Header */}
            <div className={styles.header}>
              {meta?.image_url && (
                <div className={styles.logoWrap}>
                  <img src={meta.image_url} alt="" className={styles.logoImg} />
                </div>
              )}
              <div className={styles.headerContent}>
                <div className={styles.badges}>
                  <span className={styles.catBadge} style={{ color: catColor, borderColor: `${catColor}44`, background: `${catColor}18` }}>{category}</span>
                  {market.resolved ? (
                    <span className={styles.badgeResolved}>Resolved: {resultLabel(market.result)}</span>
                  ) : isEnded ? (
                    <span className={styles.badgeEnded}>Ended · Awaiting Resolution</span>
                  ) : (
                    <span className={styles.badgeLive}><span className={styles.liveDot} />Live</span>
                  )}
                </div>
                <h1 className={styles.question}>{market.question}</h1>
                <div className={styles.meta}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Market ID</span>
                    <span className={styles.metaValue}>{hashId}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>{isEnded ? 'Ended' : 'Closes in'}</span>
                    <span className={`${styles.metaValue} ${styles.closesIn}`}>{timeLeft}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Pool</span>
                    <span className={styles.metaValue}>{parseFloat(market.totalPool).toFixed(3)} tBNB</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart — live via WSS context */}
            <OddsChart
              marketId={market.id}
              yesPool={market.yesPool}
              noPool={market.noPool}
              totalPool={market.totalPool}
              resolved={market.resolved}
            />

            {meta?.description && (
              <div className={styles.infoSection}>
                <h3 className={styles.infoTitle}>About this Market</h3>
                <p className={styles.infoText}>{meta.description}</p>
              </div>
            )}
            {meta?.rules && (
              <div className={styles.infoSection}>
                <h3 className={styles.infoTitle}>Resolution Rules</h3>
                <p className={styles.infoText}>{meta.rules}</p>
              </div>
            )}
          </div>

          {/* RIGHT sidebar */}
          <div className={styles.rightCol}>
            <div className={styles.sidebarSticky}>
              <TradePanel market={market} nowInSeconds={nowInSeconds} meta={meta ?? undefined} />
            </div>
          </div>
        </div>

        {/* ── Discussion / Holders / Activity ── */}
        <div className={styles.discussionSection}>
          <div className={styles.tabsRow}>
            <button className={`${styles.tabBtn} ${activeTab === 'discussion' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('discussion')}>
              Discussion ({comments.length})
            </button>
            <button className={`${styles.tabBtn} ${activeTab === 'holders' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('holders')}>
              Holders {holders.length > 0 ? `(${holders.length})` : ''}
            </button>
            <button className={`${styles.tabBtn} ${activeTab === 'activity' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('activity')}>
              Activity {predictions.length > 0 ? `(${predictions.length})` : ''}
            </button>
          </div>

          {/* Discussion tab */}
          {activeTab === 'discussion' && (
            <div className={styles.discussionTab}>
              {!account ? (
                <button className={styles.connectToComment} onClick={() => setShowWalletModal(true)}>
                  Connect wallet to join the discussion
                </button>
              ) : (
                <form className={styles.commentForm} onSubmit={handlePostComment}>
                  <textarea className={styles.commentInput} placeholder="Share your thoughts…"
                    value={commentInput} onChange={e => setCommentInput(e.target.value)} rows={3} />
                  <div className={styles.commentFormFooter}>
                    <span className={styles.commentAs}>Posting as <strong>{account.slice(0, 6)}…{account.slice(-4)}</strong></span>
                    <button type="submit" className={styles.commentSubmit} disabled={!commentInput.trim()}>Post</button>
                  </div>
                </form>
              )}
              {comments.length === 0 ? (
                <div className={styles.emptyState}>No comments yet. Be the first!</div>
              ) : (
                <div className={styles.commentsList}>
                  {comments.map((c) => (
                    <div key={c.id} className={styles.commentCard}>
                      <div className={styles.commentHeader}>
                        <span className={styles.commentAuthor}>{c.author}</span>
                      </div>
                      <p className={styles.commentText}>{c.text}</p>
                      <div className={styles.commentActions}>
                        <button className={`${styles.actionBtn} ${c.liked ? styles.likedBtn : ''}`} onClick={() => likeComment(c.id)}>♥ {c.likes}</button>
                        <button className={styles.actionBtn} onClick={() => toggleReply(c.id)}>↩ Reply</button>
                      </div>
                      {c.replyOpen && (
                        <div className={styles.replyBox}>
                          <textarea className={styles.replyInput} placeholder="Write a reply…"
                            value={c.replyInput} onChange={e => updateReplyInput(c.id, e.target.value)} rows={2} />
                          <button className={styles.replySubmit} onClick={() => postReply(c.id)} disabled={!c.replyInput.trim()}>Reply</button>
                        </div>
                      )}
                      {c.replies.length > 0 && (
                        <div className={styles.repliesList}>
                          {c.replies.map(r => (
                            <div key={r.id} className={styles.replyCard}>
                              <span className={styles.commentAuthor}>{r.author}</span>
                              <p className={styles.commentText}>{r.text}</p>
                              <button className={`${styles.actionBtn} ${r.liked ? styles.likedBtn : ''}`} onClick={() => likeReply(c.id, r.id)}>♥ {r.likes}</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Holders tab */}
          {activeTab === 'holders' && (
            <div className={styles.discussionTab}>
              {predsLoading ? (
                <div className={styles.tabLoading}><div className={styles.spinner} /></div>
              ) : holders.length === 0 ? (
                <div className={styles.emptyState}>No positions placed yet.</div>
              ) : (
                <div className={styles.holdersList}>
                  <div className={styles.holdersHeader}>
                    <span>Address</span><span>Side</span><span>Amount</span>
                  </div>
                  {holders.map((h, i) => (
                    <div key={h.addr} className={styles.holderRow}>
                      <span className={styles.holderRank}>#{i + 1}</span>
                      <span className={styles.holderAddr}>{h.addr.slice(0, 6)}…{h.addr.slice(-4)}</span>
                      <span className={h.choice === 1 ? styles.holderYes : styles.holderNo}>
                        {h.choice === 1 ? (meta?.yes_label ?? 'YES') : (meta?.no_label ?? 'NO')}
                      </span>
                      <span className={styles.holderAmount}>{h.totalAmount.toFixed(4)} tBNB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activity tab */}
          {activeTab === 'activity' && (
            <div className={styles.discussionTab}>
              {predsLoading ? (
                <div className={styles.tabLoading}><div className={styles.spinner} /></div>
              ) : predictions.length === 0 ? (
                <div className={styles.emptyState}>No activity yet.</div>
              ) : (
                <div className={styles.activityList}>
                  {predictions.map((p) => (
                    <div key={p.txHash} className={styles.activityRow}>
                      <span className={p.choice === 1 ? styles.holderYes : styles.holderNo}>
                        {p.choice === 1 ? '▲ YES' : '▼ NO'}
                      </span>
                      <span className={styles.activityAddr}>{p.address.slice(0, 6)}…{p.address.slice(-4)}</span>
                      <span className={styles.activityAmount}>{parseFloat(p.amount).toFixed(4)} tBNB</span>
                      <a href={`https://testnet.bscscan.com/tx/${p.txHash}`} target="_blank" rel="noopener noreferrer" className={styles.activityTx}>↗ Tx</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

