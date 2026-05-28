'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import GlobalBanner from './GlobalBanner'
import TopAnnouncement from './TopAnnouncement'
import CornerNotifications from './CornerNotifications'

const DOC_ROUTE_PREFIXES = ['/whitepaper', '/pitchdeck', '/tokonomics', '/roadmap']

function isDocsRoute(pathname: string): boolean {
  return DOC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname.endsWith('.html')
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (isDocsRoute(pathname)) {
    return (
      <>
        <TopAnnouncement />
        <div className="appMain appMainDocs">
          <Navbar />
          {children}
        </div>
      </>
    )
  }

  return (
    <>
      <TopAnnouncement />
      <Sidebar />
      <div className="appMain">
        <Navbar />
        <GlobalBanner />
        {children}
      </div>
      <CornerNotifications />
    </>
  )
}