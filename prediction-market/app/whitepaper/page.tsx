import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Whitepaper',
  description: 'predictwin whitepaper — full technical documentation on markets, prediction mechanics, PWIN tokenomics, and winner calculations.',
}

export default function WhitepaperPage() {
  return (
    <iframe
      src="/whitepaper.html"
      loading="lazy"
      className="docsFrame"
      title="predictwin Whitepaper"
    />
  )
}
