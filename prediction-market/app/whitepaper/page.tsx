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
      className="docsFrame"
      title="PredictFi Whitepaper"
    />
  )
}
