'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMarkets } from '../../../context/MarketsContext'
import { useWallet } from '../../../context/WalletContext'
import { getMarketCategory, formatTimeLeft, resultLabel } from '../../../lib/utils'
import {
  supabase,
  getMarketMeta,
  getComments,
  postComment,
  incrementCommentLikes,
  getActivity,
  type MarketMeta,
  type MarketComment,
  type MarketActivity,
} from '../../../lib/supabase'
import TradePanel from '../../../components/TradePanel'
import OddsChart from '../../../components/OddsChart'
import styles from './page.module.css'

const CATEGORY_COLORS: Record<string, string> = {
  Sports: '#3b82f6', Crypto: '#8b5cf6', Politics: '#f59e0b',
  Esports: '#ec4899', Finance: '#06b6d4', Economy: '#14b8a6',
  Culture: '#f97316', Trending: '#8b5cf6', New: '#a78bfa',
}

/* Expand a flat comment list into threaded tree */
interface CommentNode extends MarketComment {
  replies: CommentNode[]
}

function buildTree(flat: MarketComment[]): CommentNode[] {
  const map = new Map<number, CommentNode>()
  for (const c of flat) map.set(c.id, { ...c, replies: [] })
  const roots: CommentNode[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.replies.push(node)
    else roots.push(node)
  }
  return roots
}

export default function MarketDetailPage() {
  const params   = useParams()
  const router   = useRouter()
  const { fetchMarket, markets: ctxMarkets } = useMarkets()
  const { account, setShowWalletModal }      = useWallet()

  const marketId = Number(params?.id)

  const [market, setMarket]             = useState<Awaited<ReturnType<typeof fetchMarket>>>(null)
  const [loading, setLoading]           = useState(true)
  const [nowInSeconds, setNowInSeconds] = useState(Math.floor(Date.now() / 1000))
  const [meta, setMeta]                 = useState<MarketMeta | null>(null)

  const [activeTab, setActiveTab] = useState<'discussion' | 'holders' | 'activity'>('discussion')

  // ── Discussion ──────────────────────────────────────────────────────────────
  const [rawComments, setRawComments]   = useState<MarketComment[]>([])
  const [commentInput, setCommentInput] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [posting, setPosting]           = useState(false)
  // track local reply UI (open/input) by comment id
  const [replyUI, setReplyUI] = useState<Record<number, { open: boolean; input: string }>>({})
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())

  // ── Activity / Holders ─────────────────────────────────────────────────────
  const [activity, setActivity]           = useState<MarketActivity[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)

  const mergeComments = useCallback((prev: MarketComment[], incoming: MarketComment) => {
    if (prev.some(c => c.id === incoming.id)) return prev
    return [...prev, incoming]
  }, [])

  const mergeActivity = useCallback((prev: MarketActivity[], incoming: MarketActivity) => {
    if (prev.some(a => a.id === incoming.id || a.tx_hash === incoming.tx_hash)) return prev
    return [incoming, ...prev]
  }, [])

  // Initial load
  useEffect(() => {
    if (!marketId || Number.isNaN(marketId)) { router.replace('/'); return }
    setLoading(true)
    fetchMarket(marketId).then(m => { setMarket(m); setLoading(false) })
    getMarketMeta(marketId).then(setMeta)
  }, [fetchMarket, marketId, router])

  // Live market state via context (WSS-driven)
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

  // Load comments + subscribe for real-time inserts
  useEffect(() => {
    if (!marketId) return
    setCommentLoading(true)
    getComments(marketId).then(data => { setRawComments(data); setCommentLoading(false) })

    // Supabase real-time: new comments appear instantly
    const ch = supabase
      .channel(`comments-${marketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'market_comments', filter: `market_id=eq.${marketId}` },
        (payload) => {
          const incoming = payload.new as MarketComment
          setRawComments(prev => mergeComments(prev, incoming))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'market_comments', filter: `market_id=eq.${marketId}` },
        (payload) => {
          const updated = payload.new as MarketComment
          setRawComments(prev => prev.map(c => c.id === updated.id ? { ...c, likes: updated.likes } : c))
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(ch) }
  }, [marketId, mergeComments])

  // Load activity immediately so holders/activity stay fresh without tab switching
  useEffect(() => {
    if (!marketId || activityLoaded || activityLoading) return
    setActivityLoading(true)
    getActivity(marketId).then(data => { setActivity(data); setActivityLoaded(true); setActivityLoading(false) })
  }, [activityLoaded, activityLoading, marketId])

  // Subscribe for new activity rows (new bets placed by anyone)
  useEffect(() => {
    if (!marketId) return
    const ch = supabase
      .channel(`activity-${marketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'market_activity', filter: `market_id=eq.${marketId}` },
        (payload) => {
          const incoming = payload.new as MarketActivity
          setActivity(prev => mergeActivity(prev, incoming))
        }
      )
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [marketId, mergeActivity])

  // Fallback polling keeps UI live when Supabase realtime isn't available.
  useEffect(() => {
    if (!marketId) return
    const tick = window.setInterval(async () => {
      const [latestComments, latestActivity] = await Promise.all([
        getComments(marketId),
        getActivity(marketId),
      ])
      setRawComments(prev => {
        let next = prev
        for (const comment of latestComments) {
          if (!next.some(c => c.id === comment.id)) next = [...next, comment]
        }
        return next
      })
      setActivity(latestActivity)
      setActivityLoaded(true)
    }, 5000)
    return () => window.clearInterval(tick)
  }, [marketId])

  // Derived state
  const category = useMemo(() => market ? getMarketCategory(market.id, market.question) : '', [market])
  const timeLeft  = useMemo(() => market ? formatTimeLeft(market.endTime, nowInSeconds) : '', [market, nowInSeconds])
  const isEnded   = market ? nowInSeconds > 0 && market.endTime <= nowInSeconds : false
  const catColor  = CATEGORY_COLORS[category] ?? '#8b5cf6'
  const hashId    = market ? `#${market.id.toString(16).padStart(6, '0').toUpperCase()}` : ''

  const commentTree = useMemo(() => buildTree(rawComments), [rawComments])
  const topLevelCount = commentTree.length

  const holders = useMemo(() => {
    const map = new Map<string, { choice: number; totalAmount: number }>()
    for (const a of activity) {
      const prev = map.get(a.user_address)
      if (prev) prev.totalAmount += parseFloat(a.amount_eth)
      else map.set(a.user_address, { choice: a.choice, totalAmount: parseFloat(a.amount_eth) })
    }
    return Array.from(map.entries())
      .map(([addr, v]) => ({ addr, ...v }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
  }, [activity])

  // Comment actions
  const handlePostComment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account || !commentInput.trim() || posting) return
    setPosting(true)
    const inserted = await postComment(marketId, account, commentInput.trim())
    if (inserted) {
      setRawComments(prev => mergeComments(prev, inserted))
    }
    setCommentInput('')
    setPosting(false)
  }, [account, commentInput, marketId, posting, mergeComments])

  const handleLike = useCallback(async (id: number) => {
    if (likedIds.has(id)) return
    setLikedIds(prev => new Set(prev).add(id))
    setRawComments(prev => prev.map(c => c.id === id ? { ...c, likes: c.likes + 1 } : c))
    await incrementCommentLikes(id)
  }, [likedIds])

  const toggleReply = useCallback((id: number) => {
    setReplyUI(prev => ({
      ...prev,
      [id]: { open: !prev[id]?.open, input: prev[id]?.input ?? '' },
    }))
  }, [])

  const updateReplyInput = useCallback((id: number, val: string) => {
    setReplyUI(prev => ({ ...prev, [id]: { ...prev[id], input: val } }))
  }, [])

  const handlePostReply = useCallback(async (parentId: number) => {
    const text = replyUI[parentId]?.input?.trim()
    if (!account || !text || posting) return
    setPosting(true)
    setReplyUI(prev => ({ ...prev, [parentId]: { open: false, input: '' } }))
    const inserted = await postComment(marketId, account, text, parentId)
    if (inserted) {
      setRawComments(prev => mergeComments(prev, inserted))
    }
    setPosting(false)
  }, [account, marketId, posting, replyUI, mergeComments])

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.detailSkeletonWrap}>
            <div className={styles.detailSkeletonHeader} />
            <div className={styles.detailSkeletonPanel} />
            <div className={styles.detailSkeletonPanel} />
          </div>
        </div>
      </main>
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

  const yesLabel = meta?.yes_label ?? 'YES'
  const noLabel  = meta?.no_label  ?? 'NO'

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Link href="/markets" className={styles.back}>← All Markets</Link>

        {/* ── Two-column layout ── */}
        <div className={styles.layout}>
          <div className={styles.leftCol}>
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

          <div className={styles.rightCol}>
            <div className={styles.sidebarSticky}>
              <TradePanel market={market} nowInSeconds={nowInSeconds} meta={meta ?? undefined} />
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className={styles.discussionSection}>
          <div className={styles.tabsRow}>
            <button className={`${styles.tabBtn} ${activeTab === 'discussion' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('discussion')}>
              Discussion {topLevelCount > 0 ? `(${topLevelCount})` : ''}
            </button>
            <button className={`${styles.tabBtn} ${activeTab === 'holders' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('holders')}>
              Holders {holders.length > 0 ? `(${holders.length})` : ''}
            </button>
            <button className={`${styles.tabBtn} ${activeTab === 'activity' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('activity')}>
              Activity {activity.length > 0 ? `(${activity.length})` : ''}
            </button>
          </div>

          {/* ── Discussion ── */}
          {activeTab === 'discussion' && (
            <div className={styles.discussionTab}>
              {commentLoading ? (
                <div className={styles.tabLoading}><div className={styles.spinner} /></div>
              ) : (
                <>
                  {!account ? (
                    <button className={styles.connectToComment} onClick={() => setShowWalletModal(true)}>
                      Connect wallet to join the discussion
                    </button>
                  ) : (
                    <form className={styles.commentForm} onSubmit={handlePostComment}>
                      <textarea className={styles.commentInput} placeholder="Share your thoughts…"
                        value={commentInput} onChange={e => setCommentInput(e.target.value)} rows={3} />
                      <div className={styles.commentFormFooter}>
                        <span className={styles.commentAs}>
                          Posting as <strong>{account.slice(0, 6)}…{account.slice(-4)}</strong>
                        </span>
                        <button type="submit" className={styles.commentSubmit}
                          disabled={!commentInput.trim() || posting}>
                          {posting ? 'Posting…' : 'Post'}
                        </button>
                      </div>
                    </form>
                  )}

                  {commentTree.length === 0 ? (
                    <div className={styles.emptyState}>No comments yet. Be the first!</div>
                  ) : (
                    <div className={styles.commentsList}>
                      {commentTree.map(c => (
                        <div key={c.id} className={styles.commentCard}>
                          <div className={styles.commentHeader}>
                            <span className={styles.commentAuthor}>
                              {c.author_address.slice(0, 6)}…{c.author_address.slice(-4)}
                            </span>
                            <span className={styles.commentTime}>
                              {new Date(c.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className={styles.commentText}>{c.content}</p>
                          <div className={styles.commentActions}>
                            <button
                              type="button"
                              className={`${styles.actionBtn} ${likedIds.has(c.id) ? styles.likedBtn : ''}`}
                              onClick={() => { void handleLike(c.id) }}>
                              ♥ {c.likes}
                            </button>
                            {account && (
                              <button type="button" className={styles.actionBtn} onClick={() => toggleReply(c.id)}>
                                ↩ Reply
                              </button>
                            )}
                          </div>
                          {replyUI[c.id]?.open && (
                            <div className={styles.replyBox}>
                              <textarea className={styles.replyInput} placeholder="Write a reply…"
                                value={replyUI[c.id]?.input ?? ''}
                                onChange={e => updateReplyInput(c.id, e.target.value)}
                                rows={2} />
                              <button type="button" className={styles.replySubmit}
                                onClick={() => { void handlePostReply(c.id) }}
                                disabled={!replyUI[c.id]?.input?.trim() || posting}>
                                Reply
                              </button>
                            </div>
                          )}
                          {c.replies.length > 0 && (
                            <div className={styles.repliesList}>
                              {c.replies.map(r => (
                                <div key={r.id} className={styles.replyCard}>
                                  <div className={styles.commentHeader}>
                                    <span className={styles.commentAuthor}>
                                      {r.author_address.slice(0, 6)}…{r.author_address.slice(-4)}
                                    </span>
                                    <span className={styles.commentTime}>
                                      {new Date(r.created_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <p className={styles.commentText}>{r.content}</p>
                                  <button
                                    type="button"
                                    className={`${styles.actionBtn} ${likedIds.has(r.id) ? styles.likedBtn : ''}`}
                                    onClick={() => { void handleLike(r.id) }}>
                                    ♥ {r.likes}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Holders ── */}
          {activeTab === 'holders' && (
            <div className={styles.discussionTab}>
              {activityLoading ? (
                <div className={styles.tabLoading}><div className={styles.spinner} /></div>
              ) : holders.length === 0 ? (
                <div className={styles.emptyState}>No positions placed yet.</div>
              ) : (
                <div className={styles.holdersList}>
                  <div className={styles.holdersHeader}>
                    <span>#</span><span>Address</span><span>Side</span><span>Amount</span>
                  </div>
                  {holders.map((h, i) => (
                    <div key={h.addr} className={styles.holderRow}>
                      <span className={styles.holderRank}>#{i + 1}</span>
                      <span className={styles.holderAddr}>{h.addr.slice(0, 6)}…{h.addr.slice(-4)}</span>
                      <span className={h.choice === 1 ? styles.holderYes : styles.holderNo}>
                        {h.choice === 1 ? yesLabel : noLabel}
                      </span>
                      <span className={styles.holderAmount}>{h.totalAmount.toFixed(4)} tBNB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Activity ── */}
          {activeTab === 'activity' && (
            <div className={styles.discussionTab}>
              {activityLoading ? (
                <div className={styles.tabLoading}><div className={styles.spinner} /></div>
              ) : activity.length === 0 ? (
                <div className={styles.emptyState}>No activity yet.</div>
              ) : (
                <div className={styles.activityList}>
                  {activity.map(a => (
                    <div key={a.id} className={styles.activityRow}>
                      <span className={a.choice === 1 ? styles.holderYes : styles.holderNo}>
                        {a.choice === 1 ? `▲ ${yesLabel}` : `▼ ${noLabel}`}
                      </span>
                      <span className={styles.activityAddr}>{a.user_address.slice(0, 6)}…{a.user_address.slice(-4)}</span>
                      <span className={styles.activityAmount}>{parseFloat(a.amount_eth).toFixed(4)} tBNB</span>
                      <span className={styles.activityTime}>
                        {new Date(a.created_at).toLocaleDateString()}
                      </span>
                      <a href={`https://testnet.bscscan.com/tx/${a.tx_hash}`} target="_blank"
                        rel="noopener noreferrer" className={styles.activityTx}>↗ Tx</a>
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



