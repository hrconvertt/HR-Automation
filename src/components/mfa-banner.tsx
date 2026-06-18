'use client'

/**
 * Nudge for sensitive-role users without MFA enabled.
 *
 * `mfaEnabled` is computed server-side in the dashboard layout and passed in.
 * No client-side Clerk hooks — keeps this resilient if Clerk's client SDK
 * fails to hydrate for any reason (which would otherwise show stale state).
 *
 * Dismissals persist 30 days in localStorage so HR isn't nagged constantly.
 * B&W theme — slate-only.
 */
import { useEffect, useState } from 'react'

const SENSITIVE_ROLES = new Set(['HR_ADMIN', 'EXECUTIVE', 'FINANCE'])
const DISMISS_KEY = 'mfa-banner-dismissed-until'

interface Props {
  role: string
  mfaEnabled?: boolean
}

export default function MfaBanner({ role, mfaEnabled = true }: Props) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const until = window.localStorage.getItem(DISMISS_KEY)
      if (until && Number(until) > Date.now()) {
        setDismissed(true)
        return
      }
    } catch { /* ignore */ }
    setDismissed(false)
  }, [])

  if (!SENSITIVE_ROLES.has(role)) return null
  if (mfaEnabled) return null
  if (dismissed) return null

  function handleDismiss() {
    setDismissed(true)
    try {
      const until = Date.now() + 30 * 24 * 60 * 60 * 1000
      window.localStorage.setItem(DISMISS_KEY, String(until))
    } catch { /* ignore */ }
  }

  return (
    <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 flex items-center justify-between text-sm">
      <p className="text-slate-800">
        <strong>Enable two-factor authentication.</strong>{' '}
        Recommended for HR / Executive / Finance roles.{' '}
        <a href="/dashboard/settings/security" className="underline font-semibold text-slate-900 hover:text-black">
          Set up now
        </a>
      </p>
      <button
        onClick={handleDismiss}
        className="text-slate-600 hover:text-slate-900 ml-4"
        aria-label="Dismiss for 30 days"
        title="Hide for 30 days"
      >
        ✕
      </button>
    </div>
  )
}
