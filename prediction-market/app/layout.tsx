import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PredictFi — Decentralized Prediction Market',
  description: 'Predict outcomes and earn BNB on BSC',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        background: '#020817',
        color: '#e2e8f0',
        minHeight: '100vh',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}>
        {children}
      </body>
    </html>
  )
}