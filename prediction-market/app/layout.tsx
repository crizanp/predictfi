import type { Metadata } from 'next'
import './globals.css'
import Providers from '../components/Providers'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import CornerNotifications from '../components/CornerNotifications'
import GlobalBanner from '../components/GlobalBanner'
import { ToastProvider } from '../context/ToastContext'

export const metadata: Metadata = {
  title: 'PredictFi — Decentralized Prediction Market',
  description: 'Predict outcomes and earn BNB on BSC Testnet',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Providers>
          <ToastProvider>
            <div className="mainnetBanner">
              🚀 <strong>Mainnet launches after PRFI token claim</strong> · Presale{' '}
              <a href="https://moonsale.app" target="_blank" rel="noopener noreferrer">
                Jun 1–7 on moonsale.app
              </a>
              {' '}· Total raise: 150 BNB
            </div>
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