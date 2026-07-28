'use client'

import { useClerk } from '@clerk/nextjs'
import { useState } from 'react'

/**
 * Used on the /unauthorized page. A plain <Link href="/login"> would
 * just bounce them back here, because Clerk's SignIn component sees
 * the still-valid session cookie and re-redirects to /dashboard,
 * which then catches the missing-DB-row case and sends them back to
 * /unauthorized. Calling signOut() first clears the cookie so the
 * next /login visit is a clean slate.
 */
export default function UnauthorizedSignOutButton() {
  const { signOut } = useClerk()
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await signOut({ redirectUrl: '/login' })
        } catch {
          // fall back to a hard redirect if Clerk fails for any reason
          window.location.href = '/login'
        }
      }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition"
    >
      {busy ? 'Signing out…' : 'Back to sign-in'}
    </button>
  )
}
