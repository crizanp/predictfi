import type { Metadata } from 'next'
import './globals.css'
import Providers from '../components/Providers'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import { ToastProvider } from '../context/ToastContext'

export const metadata: Metadata = {
  title: 'PredictFi — Decentralized Prediction Market',
  description: 'Predict outcomes and earn BNB on BSC Testnet',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ToastProvider>
            <div className="appShell">
              <Sidebar />
              <div className="appMain">
                <Navbar />
                {children}
              </div>
            </div>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  )
}