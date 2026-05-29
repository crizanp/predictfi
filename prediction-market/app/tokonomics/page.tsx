import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tokenomics',
  description: 'PWIN token distribution, vesting schedule, utility, and economic model for predictwin.',
}

export default function TokenomicsPage() {
  return (
    <iframe
      src="/tokonomics.html"
      loading="lazy"
      className="docsFrame"
      title="predictwin Tokenomics"
    />
  )
}
