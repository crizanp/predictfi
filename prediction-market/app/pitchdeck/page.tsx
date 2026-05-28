import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pitch Deck',
  description: 'PredictFi investor pitch deck — decentralised prediction market on BNB Chain with PRFI token.',
}

export default function PitchDeckPage() {
  return (
    <iframe
      src="/pitchdeck.html"
      loading="lazy"
      style={{ width: '100%', height: 'calc(100dvh - 120px)', minHeight: 640, border: 'none', display: 'block' }}
      title="PredictFi Pitch Deck"
    />
  )
}
