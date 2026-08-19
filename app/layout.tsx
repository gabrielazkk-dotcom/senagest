import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '../contexts/AuthContext'
import { OfflineQueueProvider } from '../contexts/OfflineQueueContext'
import PushNotificationManager from '../components/PushNotificationManager'
import AppShell from '../components/AppShell'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SenaGest — Gestão Técnica',
  description: 'Sistema de gestão para equipes técnicas',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SenaGest',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#b91c1c',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans bg-surface-950 text-surface-50 antialiased`}>
        <AuthProvider>
        <OfflineQueueProvider>
          <PushNotificationManager />
          <AppShell>{children}</AppShell>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#18181b',
                color: '#f4f4f5',
                border: '1px solid #27272a',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#eab308', secondary: '#000000' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#000000' } },
            }}
          />
        </OfflineQueueProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
