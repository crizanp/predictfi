import type { Metadata } from 'next'
import './globals.css'
import Providers from '../components/Providers'
import Navbar from '../components/Navbar'

export const metadata: Metadata = {
  title: 'PredictFi — Decentralized Prediction Market',
  description: 'Predict outcomes and earn BNB on BSC Testnet',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  )
}