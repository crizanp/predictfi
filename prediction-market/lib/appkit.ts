// Client-side only -- imported from 'use client' components.
import { createAppKit } from '@reown/appkit/react'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { defineChain } from '@reown/appkit/networks'

export const bscTestnet = defineChain({
  id: 97,
  caipNetworkId: 'eip155:97',
  chainNamespace: 'eip155',
  name: 'BSC Testnet',
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://data-seed-prebsc-1-s1.binance.org:8545/'] } },
  blockExplorers: { default: { name: 'BscScan Testnet', url: 'https://testnet.bscscan.com' } },
  testnet: true,
})

export const ethersAdapter = new EthersAdapter()

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo'

export const appKit = createAppKit({
  adapters: [ethersAdapter],
  networks: [bscTestnet],
  projectId,
  metadata: {
    name: 'PredictFi',
    description: 'Decentralized Prediction Market on BSC',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://predictfi.app',
    icons: [],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
    onramp: false,
    swaps: false,
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-color-mix': '#120c23',
    '--w3m-color-mix-strength': 24,
    '--w3m-accent': '#c084fc',
    '--w3m-border-radius-master': '18px',
    '--w3m-font-family': 'Space Grotesk, Segoe UI, sans-serif',
    '--w3m-font-size-master': '10px',
    '--w3m-z-index': 2200,
  },
})

export type AppKitType = typeof appKit