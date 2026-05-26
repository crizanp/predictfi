import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nmaqfkqoeqkblcgqhffw.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarketMeta {
  market_id: number
  image_url: string | null
  description: string | null
  rules: string | null
  card_bg: string | null
  card_text: string | null
  yes_label?: string | null
  no_label?: string | null
  updated_at?: string
}

export interface OddsSnapshot {
  market_id: number
  yes_pool: string
  no_pool: string
  total_pool: string
  recorded_at: string
}

// ── Market metadata ───────────────────────────────────────────────────────────

export async function getMarketMeta(marketId: number): Promise<MarketMeta | null> {
  if (!supabaseKey) return null
  const { data, error } = await supabase
    .from('market_metadata')
    .select('*')
    .eq('market_id', marketId)
    .maybeSingle()
  if (error) return null
  return data as MarketMeta | null
}

export async function upsertMarketMeta(meta: MarketMeta): Promise<boolean> {
  if (!supabaseKey) return false
  const { error } = await supabase
    .from('market_metadata')
    .upsert({ ...meta, updated_at: new Date().toISOString() }, { onConflict: 'market_id' })
  return !error
}

// ── Odds history (for chart) ──────────────────────────────────────────────────

export async function recordOddsSnapshot(snapshot: Omit<OddsSnapshot, 'recorded_at'>): Promise<void> {
  if (!supabaseKey) return
  await supabase.from('market_odds_history').insert({
    ...snapshot,
    recorded_at: new Date().toISOString(),
  })
}

export async function getOddsHistory(marketId: number): Promise<OddsSnapshot[]> {
  if (!supabaseKey) return []
  const { data, error } = await supabase
    .from('market_odds_history')
    .select('*')
    .eq('market_id', marketId)
    .order('recorded_at', { ascending: true })
    .limit(200)
  if (error) return []
  return (data as OddsSnapshot[]) ?? []
}

// ── Whitelist applications ────────────────────────────────────────────────────

export interface WhitelistApplication {
  id?: number
  wallet_address: string
  name: string
  email: string
  telegram: string
  status?: 'pending' | 'approved' | 'rejected'
  created_at?: string
}

export async function getWhitelistApplication(wallet: string): Promise<WhitelistApplication | null> {
  if (!supabaseKey) return null
  const { data, error } = await supabase
    .from('whitelist_applications')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle()
  if (error) return null
  return data as WhitelistApplication | null
}

export async function submitWhitelistApplication(app: Omit<WhitelistApplication, 'id' | 'status' | 'created_at'>): Promise<{ success: boolean; error?: string }> {
  if (!supabaseKey) return { success: false, error: 'Supabase not configured' }
  const { error } = await supabase
    .from('whitelist_applications')
    .upsert({
      ...app,
      wallet_address: app.wallet_address.toLowerCase(),
      status: 'pending',
      created_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Discussion comments ───────────────────────────────────────────────────────

export interface MarketComment {
  id: number
  market_id: number
  author_address: string
  content: string
  parent_id: number | null
  likes: number
  created_at: string
}

export async function getComments(marketId: number): Promise<MarketComment[]> {
  if (!supabaseKey) return []
  const { data } = await supabase
    .from('market_comments')
    .select('*')
    .eq('market_id', marketId)
    .order('created_at', { ascending: true })
  return (data as MarketComment[]) ?? []
}

export async function postComment(
  marketId: number,
  authorAddress: string,
  content: string,
  parentId?: number
): Promise<MarketComment | null> {
  if (!supabaseKey) return null
  const { data } = await supabase
    .from('market_comments')
    .insert({
      market_id: marketId,
      author_address: authorAddress.toLowerCase(),
      content,
      parent_id: parentId ?? null,
      likes: 0,
    })
    .select()
    .single()
  return data as MarketComment | null
}

export async function incrementCommentLikes(commentId: number): Promise<void> {
  if (!supabaseKey) return
  // Uses a DB function to avoid read-modify-write race
  const { error } = await supabase.rpc('increment_comment_likes', { cid: commentId })
  if (error) {
    // Fallback: optimistic local update only (no DB update)
    console.warn('increment_comment_likes RPC not available:', error.message)
  }
}

// ── Market activity (on-chain predictions mirrored to Supabase) ───────────────

export interface MarketActivity {
  id: number
  market_id: number
  user_address: string
  choice: number          // 1 = YES, 2 = NO
  amount_eth: string
  tx_hash: string
  block_number: number | null
  created_at: string
}

export interface BannerAd {
  id: number
  title: string
  image_url: string | null
  link_url: string | null
  pages: string[]
  start_date: string
  end_date: string
  is_active: boolean
  contact_handle: string | null
  created_at: string
}

export async function getActivity(marketId: number): Promise<MarketActivity[]> {
  if (!supabaseKey) return []
  const { data } = await supabase
    .from('market_activity')
    .select('*')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
  return (data as MarketActivity[]) ?? []
}

export async function recordActivity(
  marketId: number,
  userAddress: string,
  choice: number,
  amountEth: string,
  txHash: string,
  blockNumber?: number
): Promise<void> {
  if (!supabaseKey) return
  await supabase.from('market_activity').upsert(
    {
      market_id: marketId,
      user_address: userAddress.toLowerCase(),
      choice,
      amount_eth: amountEth,
      tx_hash: txHash,
      block_number: blockNumber ?? null,
    },
    { onConflict: 'tx_hash' }
  )
}

// ── Public profiles ───────────────────────────────────────────────────────────

export interface UserProfile {
  wallet_address: string
  display_name: string | null
  bio: string | null
  updated_at?: string
}

export interface UserContributionSummary {
  predictions: number
  comments: number
  markets_participated: number
  total_staked_tbnb: number
}

export async function getUserProfile(address: string): Promise<UserProfile | null> {
  if (!supabaseKey) return null
  const normalized = address.toLowerCase()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('wallet_address', normalized)
    .maybeSingle()
  if (error) return null
  return data as UserProfile | null
}

export async function upsertUserProfile(
  walletAddress: string,
  displayName: string,
  bio: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabaseKey) return { success: false, error: 'Supabase not configured' }
  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        wallet_address: walletAddress.toLowerCase(),
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'wallet_address' }
    )
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function getProfilesByAddresses(addresses: string[]): Promise<Record<string, UserProfile>> {
  if (!supabaseKey || addresses.length === 0) return {}
  const normalized = Array.from(new Set(addresses.map(a => a.toLowerCase())))
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .in('wallet_address', normalized)
  if (error || !data) return {}
  const map: Record<string, UserProfile> = {}
  for (const row of data as UserProfile[]) {
    map[row.wallet_address] = row
  }
  return map
}

export async function getUserContributionSummary(address: string): Promise<UserContributionSummary> {
  if (!supabaseKey) {
    return { predictions: 0, comments: 0, markets_participated: 0, total_staked_tbnb: 0 }
  }
  const normalized = address.toLowerCase()

  const [{ data: activityData }, { count: commentsCount }] = await Promise.all([
    supabase.from('market_activity').select('market_id, amount_eth').eq('user_address', normalized),
    supabase.from('market_comments').select('id', { count: 'exact', head: true }).eq('author_address', normalized),
  ])

  const activity = (activityData as Array<{ market_id: number; amount_eth: string }> | null) ?? []
  const uniqueMarkets = new Set(activity.map(a => a.market_id)).size
  const totalStaked = activity.reduce((sum, row) => sum + (parseFloat(row.amount_eth) || 0), 0)

  return {
    predictions: activity.length,
    comments: commentsCount ?? 0,
    markets_participated: uniqueMarkets,
    total_staked_tbnb: totalStaked,
  }
}

export async function getUserRecentComments(address: string, limit = 20): Promise<MarketComment[]> {
  if (!supabaseKey) return []
  const { data, error } = await supabase
    .from('market_comments')
    .select('*')
    .eq('author_address', address.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data as MarketComment[]) ?? []
}

export async function getUserRecentActivity(address: string, limit = 20): Promise<MarketActivity[]> {
  if (!supabaseKey) return []
  const { data, error } = await supabase
    .from('market_activity')
    .select('*')
    .eq('user_address', address.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data as MarketActivity[]) ?? []
}
