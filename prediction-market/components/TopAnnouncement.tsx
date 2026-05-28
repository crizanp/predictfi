'use client'

import { useEffect, useRef, useState } from 'react'

export default function TopAnnouncement() {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const prev = lastY.current

      if (y <= 8) {
        setHidden(false)
      } else if (y > prev + 6) {
        setHidden(true)
      } else if (y < prev - 6) {
        setHidden(false)
      }

      lastY.current = y
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
