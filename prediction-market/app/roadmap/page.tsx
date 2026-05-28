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
      style={{ width: '100%', height: 'calc(100dvh - 120px)', minHeight: 640, border: 'none', display: 'block' }}
      title="PredictFi Roadmap"
    />
  )
}
