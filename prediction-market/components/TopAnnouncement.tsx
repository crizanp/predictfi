'use client'

import { useEffect, useRef, useState } from 'react'

export default function TopAnnouncement() {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true

      requestAnimationFrame(() => {
        const y = window.scrollY
        const prev = lastY.current
        const delta = y - prev

        if (y <= 12) {
          setHidden(false)
        } else if (delta > 12) {
          setHidden(true)
        } else if (delta < -12) {
          setHidden(false)
        }

        lastY.current = y
        ticking.current = false
      })
    }

    lastY.current = window.scrollY
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('banner-hidden', hidden)
    return () => document.body.classList.remove('banner-hidden')
  }, [hidden])

  return (
    <div className={`mainnetBanner${hidden ? ' mainnetBannerHidden' : ''}`}>
      🚀 <strong>Mainnet launches after PRFI token claim</strong> · Presale{' '}
      <a href="https://moonsale.app" target="_blank" rel="noopener noreferrer">
        Jun 1–7 on moonsale.app
      </a>
      {' '}· Total raise: 150 BNB
    </div>
  )
}
