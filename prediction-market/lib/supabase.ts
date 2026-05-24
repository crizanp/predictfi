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