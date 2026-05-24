'use client'

import { WalletProvider } from '../context/WalletContext'
import { MarketsProvider } from '../context/MarketsContext'
import WalletModal from './WalletModal'
import AdminPortal from './AdminPortal'
import StatusBanner from './StatusBanner'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <MarketsProvider>
        {children}
        <WalletModal />
        <AdminPortal />
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '600px', padding: '0 20px', zIndex: 300 }}>
          <StatusBanner />
        </div>
      </MarketsProvider>
    </WalletProvider>
  )
}
