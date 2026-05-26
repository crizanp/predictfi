'use client'

import { useEffect } from 'react'
import { useAppKitProvider, useAppKitAccount } from '@reown/appkit/react'
// Side-effect: initializes AppKit when this module is loaded (client-only)
import '../lib/appkit'
import { WalletProvider, useWallet, type Eip1193Provider } from '../context/WalletContext'
import { MarketsProvider } from '../context/MarketsContext'
import AdminPortal from './AdminPortal'
import StatusBanner from './StatusBanner'

/**
 * Bridges Reown AppKit connection into WalletContext.
 * Works for ALL wallet types: MetaMask, Phantom, Coinbase, WalletConnect, etc.
 */
function ReownSync() {
  const { setExternalProvider } = useWallet()
  const { walletProvider } = useAppKitProvider('eip155')
  const { address, isConnected } = useAppKitAccount()

  useEffect(() => {
    if (isConnected && walletProvider && address) {
      void setExternalProvider(walletProvider as unknown as Eip1193Provider, 'walletconnect')
    } else if (!isConnected) {
      void setExternalProvider(null, null)
    }
  }, [isConnected, walletProvider, address, setExternalProvider])

  return null
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <MarketsProvider>
        <ReownSync />
        {children}
        <AdminPortal />
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '600px', padding: '0 20px', zIndex: 300 }}>
          <StatusBanner />
        </div>
      </MarketsProvider>
    </WalletProvider>
  )
}

