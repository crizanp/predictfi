import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tokenomics',
  description: 'PRFI token distribution, vesting schedule, utility, and economic model for PredictFi.',
}

export default function TokenomicsPage() {
  return (
    <iframe
      src="/tokonomics.html"
      loading="lazy"
      style={{ width: '100%', height: 'calc(100dvh - 120px)', minHeight: 640, border: 'none', display: 'block' }}
      title="PredictFi Tokenomics"
    />
  )
}
