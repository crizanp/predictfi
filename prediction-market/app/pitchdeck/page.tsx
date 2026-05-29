import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pitch Deck',
  description: 'predictwin investor pitch deck — decentralised prediction market on BNB Chain with PWIN token.',
}

export default function PitchDeckPage() {
  return (
    <iframe
      src="/pitchdeck.html"
      loading="lazy"
      className="docsFrame"
      title="predictwin Pitch Deck"
    />
  )
}
