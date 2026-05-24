export const toErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const detail = error as {
      shortMessage?: string
      reason?: string
      message?: string
      data?: { message?: string }
      error?: { message?: string }
      info?: { error?: { message?: string } }
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
  if (error instanceof Error) return error.message
  return String(error)
}

export const shortenAddress = (address: string): string =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''

export const formatToken = (value: string | number): string => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value as string)
  if (!Number.isFinite(parsed)) return '0.0000'
  return parsed.toFixed(4)
}

export const formatTimeLeft = (endTimeInSeconds: number, nowInSeconds: number): string => {
  if (nowInSeconds <= 0) return '...'
  const diff = Math.floor(endTimeInSeconds - nowInSeconds)
  if (diff <= 0) return 'Ended'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
  const hours = Math.floor(diff / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  return `${hours}h ${minutes}m`
}

export const resultLabel = (result: number): string => {
  if (result === 1) return 'YES'
  if (result === 2) return 'NO'
  return 'Pending'
}

export const AVAILABLE_CATEGORIES = [
  'Trending', 'New', 'Sports', 'Politics', 'Crypto',
  'Esports', 'Finance', 'Economy', 'Culture',
]

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Sports: ['match', 'football', 'soccer', 'basketball', 'tennis', 'napoli', 'udinese', 'team', 'vs', 'league', 'cup', 'nfl', 'nba'],
  Politics: ['election', 'president', 'vote', 'senate', 'policy', 'trump', 'biden', 'congress', 'government'],
  Crypto: ['btc', 'bitcoin', 'eth', 'ethereum', 'bnb', 'crypto', 'sol', 'usdt', 'defi', 'nft', 'token'],
  Esports: ['dota', 'valorant', 'cs2', 'esports', 'gaming', 'fortnite', 'lol'],
  Finance: ['s&p', 'nasdaq', 'dow', 'forex', 'gold', 'oil', 'stock', 'market', 'ipo', 'nyse'],
  Economy: ['cpi', 'inflation', 'gdp', 'fed', 'rates', 'recession', 'unemployment', 'tariff'],
  Culture: ['movie', 'music', 'award', 'celebrity', 'oscar', 'grammy', 'film', 'album'],
}

export const inferCategory = (question: string): string => {
  const normalized = question.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return category
  }
  return 'Trending'
}

const CATEGORIES_STORAGE_KEY = 'predictfi_market_categories'

export const getStoredCategories = (): Record<string, string> => {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(CATEGORIES_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export const setStoredCategory = (marketId: number, category: string): void => {
  const stored = getStoredCategories()
  stored[String(marketId)] = category
  localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(stored))
}

export const getMarketCategory = (marketId: number, question: string): string => {
  const stored = getStoredCategories()
  return stored[String(marketId)] || inferCategory(question)
}

export const computePoolMetrics = (yesPool: string, noPool: string, totalPool: string) => {
  const total = Number.parseFloat(totalPool)
  const yes = Number.parseFloat(yesPool)
  const no = Number.parseFloat(noPool)
  const yesPct = total > 0 ? Math.round((yes / total) * 100) : 50
  const noPct = 100 - yesPct
  return {
    total,
    yes,
    no,
    yesPct,
    noPct,
    yesPrice: Math.max(1, Math.min(99, yesPct)),
    noPrice: Math.max(1, Math.min(99, noPct)),
  }
}
