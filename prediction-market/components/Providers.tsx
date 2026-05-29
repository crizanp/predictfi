'use client'

import { useEffect } from 'react'
import { useAppKitProvider, useAppKitAccount } from '@reown/appkit/react'
import { WalletProvider, useWallet, type Eip1193Provider } from '../context/WalletContext'
import { MarketsProvider } from '../context/MarketsContext'
import StatusBanner from './StatusBanner'
import WalletModal from './WalletModal'

/**
 * Bridges Reown AppKit connection into WalletContext.
 * Works for ALL wallet types: MetaMask, Phantom, Coinbase, WalletConnect, etc.
 */
function ReownSync() {
  const { setExternalProvider, connectionType } = useWallet()
  const { walletProvider } = useAppKitProvider('eip155')
  const { address, isConnected } = useAppKitAccount()

  useEffect(() => {
    if (isConnected && walletProvider && address) {
      void setExternalProvider(walletProvider as unknown as Eip1193Provider, 'walletconnect')
    } else if (!isConnected && connectionType === 'walletconnect') {
      void setExternalProvider(null, null)
    }
  }, [connectionType, isConnected, walletProvider, address, setExternalProvider])

  return null
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <MarketsProvider>
        <ReownSync />
        {children}
        <WalletModal />
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '600px', padding: '0 20px', zIndex: 300 }}>
          <StatusBanner />
        </div>
      </MarketsProvider>
    </WalletProvider>
  )
}

