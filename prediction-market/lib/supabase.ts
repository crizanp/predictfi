import { createClient } from '@supabase/supabase-js'
import { CONTRACT_ADDRESS } from './contract'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nmaqfkqoeqkblcgqhffw.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseKey)

let oddsHistoryEventIdSupported: boolean | null = null
const CONTRACT_SCOPE = CONTRACT_ADDRESS.toLowerCase()
const HAS_CONTRACT_SCOPE = /^0x[a-f0-9]{40}$/.test(CONTRACT_SCOPE)
const DEPLOYED_AT_MS = Number(process.env.NEXT_PUBLIC_CONTRACT_DEPLOYED_AT_MS || '0')

function isMissingColumnError(error: { message?: string } | null | undefined, column: string): boolean {
  if (!error?.message) return false
  const msg = error.message.toLowerCase()
  return msg.includes(column.toLowerCase()) && (msg.includes('column') || msg.includes('schema cache'))
}

function isAfterDeploy(value: string | undefined | null): boolean {
  if (!DEPLOYED_AT_MS || DEPLOYED_AT_MS <= 0) return true
  if (!value) return false
  const ts = new Date(value).getTime()
  if (!Number.isFinite(ts)) return false
  return ts >= DEPLOYED_AT_MS
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarketMeta {
  market_id: number
  image_url: string | null
  description: string | null
  rules: string | null
  card_bg: string | null
  card_text: string | null
  events_json?: string | null
  yes_label?: string | null
  no_label?: string | null
  updated_at?: string
}

export interface OddsSnapshot {
  market_id: number
  event_id?: number | null
  yes_pool: string
  no_pool: string
  total_pool: string
  recorded_at: string
}

// ── Market metadata ───────────────────────────────────────────────────────────

export async function getMarketMeta(marketId: number): Promise<MarketMeta | null> {
  if (!supabaseKey) return null

  if (HAS_CONTRACT_SCOPE) {
    const { data, error } = await supabase
      .from('market_metadata')
      .select('*')
      .eq('market_id', marketId)
      .eq('contract_address', CONTRACT_SCOPE)
      .maybeSingle()

    if (!error) return data as MarketMeta | null
    if (!isMissingColumnError(error, 'contract_address')) return null
  }

  const { data, error } = await supabase
    .from('market_metadata')
    .select('*')
    .eq('market_id', marketId)
    .maybeSingle()
  if (error) return null
  return isAfterDeploy((data as MarketMeta | null)?.updated_at) ? (data as MarketMeta | null) : null
}

export async function upsertMarketMeta(meta: MarketMeta): Promise<boolean> {
  if (!supabaseKey) return false

  const payload = {
    ...meta,
    updated_at: new Date().toISOString(),
    ...(HAS_CONTRACT_SCOPE ? { contract_address: CONTRACT_SCOPE } : {}),
  }

  if (HAS_CONTRACT_SCOPE) {
    const scoped = await supabase
      .from('market_metadata')
      .upsert(payload, { onConflict: 'market_id,contract_address' })
    if (!scoped.error) return true
    if (!isMissingColumnError(scoped.error, 'contract_address')) {
      const fallbackScoped = await supabase
        .from('market_metadata')
        .upsert(payload, { onConflict: 'market_id' })
      if (!fallbackScoped.error) return true
      if (!isMissingColumnError(fallbackScoped.error, 'contract_address')) return false
    }
  }

  const { error } = await supabase
    .from('market_metadata')
    .upsert({ ...meta, updated_at: new Date().toISOString() }, { onConflict: 'market_id' })
  return !error
}

// ── Odds history (for chart) ──────────────────────────────────────────────────

export async function recordOddsSnapshot(snapshot: Omit<OddsSnapshot, 'recorded_at'>): Promise<void> {
  if (!supabaseKey) return
  const row = {
    ...snapshot,
    recorded_at: new Date().toISOString(),
    ...(HAS_CONTRACT_SCOPE ? { contract_address: CONTRACT_SCOPE } : {}),
  }

  if (oddsHistoryEventIdSupported === false) {
    const { event_id, ...legacyRow } = row
    void event_id
    const { error } = await supabase.from('market_odds_history').insert(legacyRow)
    if (error) {
      console.warn('recordOddsSnapshot legacy insert failed:', error.message)
    }
    return
  }

  const { error } = await supabase.from('market_odds_history').insert(row)
  if (!error) {
    oddsHistoryEventIdSupported = true
    return
  }

  const msg = error.message.toLowerCase()
  const hasEventIdSchemaMismatch =
    msg.includes('event_id') &&
    (msg.includes('column') || msg.includes('schema cache'))

  const hasContractScopeSchemaMismatch = isMissingColumnError(error, 'contract_address')

  if (hasContractScopeSchemaMismatch) {
    const { contract_address, ...legacyContractRow } = row as typeof row & { contract_address?: string }
    void contract_address
    const retry = await supabase.from('market_odds_history').insert(legacyContractRow)
    if (!retry.error) {
      oddsHistoryEventIdSupported = true
      return
    }
  }

  if (hasEventIdSchemaMismatch) {
    oddsHistoryEventIdSupported = false
    const { event_id, ...legacyRow } = row
    void event_id
    const { error: fallbackError } = await supabase.from('market_odds_history').insert(legacyRow)
    if (fallbackError) {
      console.warn('recordOddsSnapshot fallback insert failed:', fallbackError.message)
    }
    return
  }

  console.warn('recordOddsSnapshot failed:', error.message)
}

export async function getOddsHistory(marketId: number, eventId?: number, limit = 2000): Promise<OddsSnapshot[]> {
  if (!supabaseKey) return []

  let query = supabase
    .from('market_odds_history')
    .select('*')
    .eq('market_id', marketId)
    .order('recorded_at', { ascending: false })
    .limit(limit)

  if (HAS_CONTRACT_SCOPE) {
    query = query.eq('contract_address', CONTRACT_SCOPE)
  }

  if (eventId !== undefined) {
    query = query.eq('event_id', eventId)
  }

  const { data, error } = await query
  if (error) {
    const msg = error.message.toLowerCase()
    const hasEventIdSchemaMismatch =
      eventId !== undefined &&
      msg.includes('event_id') &&
      (msg.includes('column') || msg.includes('schema cache'))

    const hasContractScopeSchemaMismatch = isMissingColumnError(error, 'contract_address')

    if (!hasEventIdSchemaMismatch && !hasContractScopeSchemaMismatch) return []

    let fallbackQuery = supabase
      .from('market_odds_history')
      .select('*')
      .eq('market_id', marketId)
      .order('recorded_at', { ascending: false })
      .limit(limit)

    if (eventId !== undefined && !hasEventIdSchemaMismatch) {
      fallbackQuery = fallbackQuery.eq('event_id', eventId)
    }

    const { data: fallbackData, error: fallbackError } = await fallbackQuery

    if (fallbackError) return []
    const fallbackOrdered = ((fallbackData as OddsSnapshot[]) ?? [])
      .filter((row) => isAfterDeploy(row.recorded_at))
      .slice()
      .reverse()
    return fallbackOrdered
  }
  const ordered = ((data as OddsSnapshot[]) ?? [])
    .filter((row) => isAfterDeploy(row.recorded_at))
    .slice()
    .reverse()
  return ordered
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

export async function getWhitelistApplications(limit = 250): Promise<WhitelistApplication[]> {
  if (!supabaseKey) return []
  const { data, error } = await supabase
    .from('whitelist_applications')
    .select('wallet_address, name, email, telegram, status, created_at')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) return []
  return (data as WhitelistApplication[]) ?? []
}

export async function updateWhitelistApplicationStatus(
  walletAddress: string,
  status: 'pending' | 'approved' | 'rejected'
): Promise<{ success: boolean; error?: string }> {
  if (!supabaseKey) return { success: false, error: 'Supabase not configured' }

  const normalized = walletAddress.trim().toLowerCase()
  if (!normalized) return { success: false, error: 'Wallet address is required' }

  const { error } = await supabase
    .from('whitelist_applications')
    .update({ status })
    .eq('wallet_address', normalized)

  if (error) {
    return { success: false, error: error.message }
  }

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

  let query = supabase
    .from('market_comments')
    .select('*')
    .eq('market_id', marketId)
    .order('created_at', { ascending: true })

  if (HAS_CONTRACT_SCOPE) {
    query = query.eq('contract_address', CONTRACT_SCOPE)
  }

  const { data, error } = await query
  if (error && isMissingColumnError(error, 'contract_address')) {
    const fallback = await supabase
      .from('market_comments')
      .select('*')
      .eq('market_id', marketId)
      .order('created_at', { ascending: true })
    return ((fallback.data as MarketComment[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
  }

  return ((data as MarketComment[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
}

export async function postComment(
  marketId: number,
  authorAddress: string,
  content: string,
  parentId?: number
): Promise<MarketComment | null> {
  if (!supabaseKey) return null

  const payload = {
    market_id: marketId,
    author_address: authorAddress.toLowerCase(),
    content,
    parent_id: parentId ?? null,
    likes: 0,
    ...(HAS_CONTRACT_SCOPE ? { contract_address: CONTRACT_SCOPE } : {}),
  }

  const scoped = await supabase
    .from('market_comments')
    .insert(payload)
    .select()
    .single()

  if (!scoped.error) return scoped.data as MarketComment | null
  if (!isMissingColumnError(scoped.error, 'contract_address')) return null

  const { contract_address, ...legacyPayload } = payload as typeof payload & { contract_address?: string }
  void contract_address

  const fallback = await supabase
    .from('market_comments')
    .insert(legacyPayload)
    .select()
    .single()

  return fallback.data as MarketComment | null
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
  event_id?: number | null
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

  let query = supabase
    .from('market_activity')
    .select('*')
    .eq('market_id', marketId)
    .order('id', { ascending: false })
    .order('created_at', { ascending: false })

  if (HAS_CONTRACT_SCOPE) {
    query = query.eq('contract_address', CONTRACT_SCOPE)
  }

  const { data, error } = await query
  if (error && isMissingColumnError(error, 'contract_address')) {
    const fallback = await supabase
      .from('market_activity')
      .select('*')
      .eq('market_id', marketId)
      .order('id', { ascending: false })
      .order('created_at', { ascending: false })
    return ((fallback.data as MarketActivity[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
  }

  return ((data as MarketActivity[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
}

export async function getActivityByUserAddress(userAddress: string): Promise<MarketActivity[]> {
  if (!supabaseKey) return []
  const normalizedAddress = userAddress.trim()

  let query = supabase
    .from('market_activity')
    .select('*')
    .ilike('user_address', normalizedAddress)
    .order('id', { ascending: false })
    .order('created_at', { ascending: false })

  if (HAS_CONTRACT_SCOPE) {
    query = query.eq('contract_address', CONTRACT_SCOPE)
  }

  const { data, error } = await query
  if (error && isMissingColumnError(error, 'contract_address')) {
    const fallback = await supabase
      .from('market_activity')
      .select('*')
      .ilike('user_address', normalizedAddress)
      .order('id', { ascending: false })
      .order('created_at', { ascending: false })
    return ((fallback.data as MarketActivity[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
  }

  return ((data as MarketActivity[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
}

export async function getRecentActivity(limit = 5000): Promise<MarketActivity[]> {
  if (!supabaseKey) return []

  let query = supabase
    .from('market_activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (HAS_CONTRACT_SCOPE) {
    query = query.eq('contract_address', CONTRACT_SCOPE)
  }

  const { data, error } = await query
  if (error && isMissingColumnError(error, 'contract_address')) {
    const fallback = await supabase
      .from('market_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (fallback.error) return []
    return ((fallback.data as MarketActivity[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
  }

  if (error) return []
  return ((data as MarketActivity[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
}

export async function recordActivity(
  marketId: number,
  userAddress: string,
  choice: number,
  amountEth: string,
  txHash: string,
  blockNumber?: number,
  eventId?: number
): Promise<void> {
  if (!supabaseKey) return
  const baseRow = {
    market_id: marketId,
    user_address: userAddress.toLowerCase(),
    choice,
    amount_eth: amountEth,
    tx_hash: txHash,
    block_number: blockNumber ?? null,
    ...(HAS_CONTRACT_SCOPE ? { contract_address: CONTRACT_SCOPE } : {}),
  }

  const withEvent = { ...baseRow, event_id: eventId ?? null }
  const { error: upsertError } = await supabase
    .from('market_activity')
    .upsert(withEvent, { onConflict: 'tx_hash' })

  if (!upsertError) return

  const msg = upsertError.message.toLowerCase()
  const hasEventIdSchemaMismatch =
    msg.includes('event_id') &&
    (msg.includes('column') || msg.includes('schema cache'))

  const hasContractScopeSchemaMismatch = isMissingColumnError(upsertError, 'contract_address')

  if (hasContractScopeSchemaMismatch) {
    const { contract_address, ...legacyBaseRow } = baseRow as typeof baseRow & { contract_address?: string }
    void contract_address

    const legacyWithEvent = { ...legacyBaseRow, event_id: eventId ?? null }
    const scopedRetry = await supabase
      .from('market_activity')
      .upsert(legacyWithEvent, { onConflict: 'tx_hash' })

    if (!scopedRetry.error) return
  }

  if (hasEventIdSchemaMismatch) {
    const { event_id, ...legacyBaseRow } = baseRow as typeof baseRow & { event_id?: number | null }
    void event_id

    const { error: fallbackError } = await supabase
      .from('market_activity')
      .upsert(legacyBaseRow, { onConflict: 'tx_hash' })
    if (!fallbackError) return
    console.warn('recordActivity fallback insert failed:', fallbackError.message)
    return
  }

  console.warn('recordActivity failed:', upsertError.message)
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

  const activityQuery = HAS_CONTRACT_SCOPE
    ? supabase.from('market_activity').select('market_id, amount_eth, created_at').eq('user_address', normalized).eq('contract_address', CONTRACT_SCOPE)
    : supabase.from('market_activity').select('market_id, amount_eth, created_at').eq('user_address', normalized)

  const commentsQuery = HAS_CONTRACT_SCOPE
    ? supabase.from('market_comments').select('id', { count: 'exact', head: true }).eq('author_address', normalized).eq('contract_address', CONTRACT_SCOPE)
    : supabase.from('market_comments').select('id', { count: 'exact', head: true }).eq('author_address', normalized)

  const [{ data: activityData, error: activityError }, { count: commentsCount, error: commentsError }] = await Promise.all([
    activityQuery,
    commentsQuery,
  ])

  let fallbackActivityData = activityData
  let fallbackCommentsCount = commentsCount
  if (activityError && isMissingColumnError(activityError, 'contract_address')) {
    const fallback = await supabase.from('market_activity').select('market_id, amount_eth, created_at').eq('user_address', normalized)
    fallbackActivityData = fallback.data
  }
  if (commentsError && isMissingColumnError(commentsError, 'contract_address')) {
    const fallback = await supabase.from('market_comments').select('id', { count: 'exact', head: true }).eq('author_address', normalized)
    fallbackCommentsCount = fallback.count
  }

  const activity = ((fallbackActivityData as Array<{ market_id: number; amount_eth: string; created_at?: string }> | null) ?? [])
    .filter((row) => isAfterDeploy(row.created_at))
  const uniqueMarkets = new Set(activity.map(a => a.market_id)).size
  const totalStaked = activity.reduce((sum, row) => sum + (parseFloat(row.amount_eth) || 0), 0)

  return {
    predictions: activity.length,
    comments: fallbackCommentsCount ?? 0,
    markets_participated: uniqueMarkets,
    total_staked_tbnb: totalStaked,
  }
}

export async function getUserRecentComments(address: string, limit = 20): Promise<MarketComment[]> {
  if (!supabaseKey) return []

  let query = supabase
    .from('market_comments')
    .select('*')
    .eq('author_address', address.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit)

  if (HAS_CONTRACT_SCOPE) {
    query = query.eq('contract_address', CONTRACT_SCOPE)
  }

  const { data, error } = await query
  if (error && isMissingColumnError(error, 'contract_address')) {
    const fallback = await supabase
      .from('market_comments')
      .select('*')
      .eq('author_address', address.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit)
    if (fallback.error) return []
    return ((fallback.data as MarketComment[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
  }

  if (error) return []
  return ((data as MarketComment[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
}

export async function getUserRecentActivity(address: string, limit = 20): Promise<MarketActivity[]> {
  if (!supabaseKey) return []

  let query = supabase
    .from('market_activity')
    .select('*')
    .eq('user_address', address.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit)

  if (HAS_CONTRACT_SCOPE) {
    query = query.eq('contract_address', CONTRACT_SCOPE)
  }

  const { data, error } = await query
  if (error && isMissingColumnError(error, 'contract_address')) {
    const fallback = await supabase
      .from('market_activity')
      .select('*')
      .eq('user_address', address.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit)
    if (fallback.error) return []
    return ((fallback.data as MarketActivity[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
  }

  if (error) return []
  return ((data as MarketActivity[]) ?? []).filter((row) => isAfterDeploy(row.created_at))
}
