import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Roadmap',
  description: 'PredictFi product roadmap — milestones, feature releases, and ecosystem expansion timeline.',
}

export default function RoadmapPage() {
  return (
    <iframe
      src="/roadmap.html"
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="PredictFi Roadmap"
    />
  )
}
