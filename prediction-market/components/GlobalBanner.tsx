'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'

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
}

type ImgState = 'loading' | 'loaded' | 'error'

function pageKey(pathname: string): string {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/markets')) return 'markets'
  if (pathname.startsWith('/market/')) return 'market_detail'
  if (pathname.startsWith('/portfolio')) return 'portfolio'
  if (pathname.startsWith('/activity')) return 'activity'
  if (pathname.startsWith('/leaderboard')) return 'leaderboard'
  if (pathname.startsWith('/whitelist')) return 'whitelist'
  return 'other'
}

export default function GlobalBanner() {
  const pathname = usePathname()
  const [ad, setAd] = useState<BannerAd | null | undefined>(undefined) // undefined = still loading
  const [imgState, setImgState] = useState<ImgState>('loading')

  const hideBannerOnDocs =
    pathname.startsWith('/whitepaper') ||
    pathname.startsWith('/pitchdeck') ||
    pathname.startsWith('/tokonomics') ||
    pathname.startsWith('/roadmap')

  useEffect(() => {
    const key = pageKey(pathname)
    const now = new Date().toISOString()

    void (async () => {
      try {
        const { data } = await supabase
          .from('banner_ads')
          .select('*')
          .eq('is_active', true)
          .lte('start_date', now)
          .gte('end_date', now)
          .order('created_at', { ascending: false })

        if (!data || data.length === 0) {
          setAd(null)
          return
        }

        // prefer a page-specific ad, fall back to 'all'
        const ads = data as BannerAd[]
        const specific = ads.find((a) => a.pages.includes(key))
        const allPages = ads.find((a) => a.pages.includes('all'))
        setAd(specific ?? allPages ?? null)
      } catch {
        setAd(null)
      }
    })()
  }, [pathname])

  // reset image state whenever the ad changes
  useEffect(() => { setImgState('loading') }, [ad])

  if (hideBannerOnDocs) {
    return null
  }

  // no active ad — show default placeholder banner
  if (ad === null) {
    return (
      <div className="globalPageBannerWrap">
        <div className="globalPageBanner">
          <span className="globalPageBannerAds">Ads</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/banner-placeholder.png"
            alt="PredictFi Banner"
            className="globalPageBannerImg globalPageBannerImgVisible"
          />
        </div>
      </div>
    )
  }

  const showSkeleton = ad === undefined || (ad !== null && imgState === 'loading')
  const showError   = ad !== null && imgState === 'error'

  const inner = (
    <div className="globalPageBanner">
      <span className="globalPageBannerAds">Ads</span>

      {/* shimmer while fetching ad record OR while image is loading */}
      {showSkeleton && <div className="globalPageBannerSkeleton" />}

      {/* no image_url but ad loaded — show text-only placeholder */}
      {ad && !ad.image_url && imgState !== 'loading' && (
        <div className="globalPageBannerTextOnly">
          <span className="globalPageBannerTextTitle">{ad.title}</span>
        </div>
      )}

      {/* image load error fallback */}
      {showError && (
        <div className="globalPageBannerTextOnly">
          <span className="globalPageBannerTextTitle">{ad?.title ?? 'Banner'}</span>
        </div>
      )}

      {/* actual banner image */}
      {ad?.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.image_url}
          alt={ad.title}
          className={`globalPageBannerImg${imgState === 'loaded' ? ' globalPageBannerImgVisible' : ''}`}
          onLoad={() => setImgState('loaded')}
          onError={() => setImgState('error')}
        />
      )}
    </div>
  )

  return (
    <div className="globalPageBannerWrap">
      {ad?.link_url ? (
        <a href={ad.link_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
          {inner}
        </a>
      ) : inner}
    </div>
  )
}
