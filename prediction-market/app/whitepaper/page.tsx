import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Whitepaper',
  description: 'PredictFi whitepaper — full technical documentation on markets, prediction mechanics, PRFI tokenomics, and winner calculations.',
}

export default function WhitepaperPage() {
  return (
    <iframe
      src="/whitepaper.html"
      loading="lazy"
      style={{ width: '100%', height: 'calc(100dvh - 120px)', minHeight: 640, border: 'none', display: 'block' }}
      title="PredictFi Whitepaper"
    />
  )
}
