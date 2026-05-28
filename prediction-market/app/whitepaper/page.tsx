import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Whitepaper',
  description: 'PredictFi whitepaper — full technical documentation on markets, prediction mechanics, PRFI tokenomics, and winner calculations.',
}

export default function WhitepaperPage() {
  return (
    <iframe
      src="/whitepaper.html"
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="PredictFi Whitepaper"
    />
  )
}
