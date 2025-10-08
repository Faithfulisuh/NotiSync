import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NotiSync - Smart Notification Hub',
  description: 'Cross-device notification synchronization with intelligent categorization',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}