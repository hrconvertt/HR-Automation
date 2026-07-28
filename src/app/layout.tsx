import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Convertt HR',
  description: 'Complete HR Management System by Convertt Technologies',
}

// Clerk appearance — match the B&W slate-900 brand. Used by <SignIn/>,
// <SignUp/>, <UserProfile/> and any other Clerk component rendered downstream.
const clerkAppearance = {
  variables: {
    colorPrimary: '#0f172a',
    colorBackground: '#ffffff',
    colorText: '#0f172a',
    colorInputBackground: '#ffffff',
    colorInputText: '#0f172a',
    borderRadius: '0.5rem',
    fontFamily: 'var(--font-geist-sans)',
  },
  elements: {
    rootBox: 'mx-auto',
    card: 'shadow-lg border border-slate-200 bg-white',
    formButtonPrimary: 'bg-slate-900 hover:bg-slate-800 text-white',
    headerTitle: 'text-slate-900',
    headerSubtitle: 'text-slate-500',
    socialButtonsBlockButton: 'border border-slate-200 hover:bg-slate-50',
    formFieldInput: 'border border-slate-300 focus:border-slate-900 focus:ring-slate-900',
    footerActionLink: 'text-slate-900 hover:text-slate-700',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}
