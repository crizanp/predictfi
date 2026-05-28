import type { Metadata } from 'next'
import './globals.css'
import Providers from '../components/Providers'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import CornerNotifications from '../components/CornerNotifications'
import GlobalBanner from '../components/GlobalBanner'
import TopAnnouncement from '../components/TopAnnouncement'
import { ToastProvider } from '../context/ToastContext'

const SITE_URL = 'https://predictfi.io'
const SITE_NAME = 'PredictFi'
const SITE_DESCRIPTION =
  'PredictFi is a decentralised prediction market on BNB Smart Chain. Trade YES/NO outcome shares, earn BNB, and stake PRFI for governance and rewards.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Decentralised Prediction Market on BNB Chain`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'prediction market',
    'decentralised prediction',
    'BNB chain',
    'BSC prediction',
    'PRFI token',
    'crypto betting',
    'on-chain forecasting',
    'defi prediction',
    'web3 market',
    'PredictFi',
  ],
  authors: [{ name: 'PredictFi Team', url: SITE_URL }],
  creator: 'PredictFi',
  publisher: 'PredictFi',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Decentralised Prediction Market on BNB Chain`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'PredictFi — Decentralised Prediction Market',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@predictfi',
    creator: '@predictfi',
    title: `${SITE_NAME} — Decentralised Prediction Market on BNB Chain`,
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    other: [{ rel: 'mask-icon', url: '/favicon.svg', color: '#c084fc' }],
  },
  manifest: '/site.webmanifest',
  alternates: { canonical: SITE_URL },
  category: 'finance',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ToastProvider>
            <TopAnnouncement />
            <div className="appShell">
              <Sidebar />
              <div className="appMain">
                <Navbar />
                <GlobalBanner />
                {children}
              </div>
              <CornerNotifications />
            </div>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  )
}