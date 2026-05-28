import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Roadmap',
  description: 'PredictFi product roadmap — milestones, feature releases, and ecosystem expansion timeline.',
}

export default function RoadmapPage() {
  return (
    <iframe
      src="/roadmap.html"
      loading="lazy"
      className="docsFrame"
      title="PredictFi Roadmap"
    />
  )
}
