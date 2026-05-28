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
      className="docsFrame"
      title="PredictFi Tokenomics"
    />
  )
}
