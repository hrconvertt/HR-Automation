'use client'

/**
 * Nudge for sensitive-role users without MFA enabled.
 *
 * Shown above the dashboard if:
 *   - The user's primary role is HR_ADMIN, EXECUTIVE or FINANCE
 *   - Clerk reports the user has no second factor (TOTP, backup codes, etc.)
 *
 * Reads from Clerk's React hook so it updates immediately when MFA is set up
 * (no polling). Dismissals persist to localStorage so HR isn't nagged on
 * every page nav once they've acknowledged.
 *
 * B&W theme — slate-only, no chromatic accent.
 */
import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'

const SENSITIVE_ROLES = new Set(['HR_ADMIN', 'EXECUTIVE', 'FINANCE'])
const DISMISS_KEY = 'mfa-banner-dismissed-until'

function isMfaActuallyEnabled(user: ReturnType<typeof useUser>['user']): boolean {
  if (!user) return false
  // Clerk exposes several signals. Treat MFA as enabled if ANY second factor exists.
  // This catches TOTP, backup codes, and phone-based MFA.
  type ClerkUserMfa = {
    twoFactorEnabled?: boolean
    totpEnabled?: boolean
    backupCodeEnabled?: boolean
    verifiedPhoneNumbers?: unknown[]
  }
  const u = user as unknown as ClerkUserMfa
  if (u.twoFactorEnabled) return true
  if (u.totpEnabled) return true
  if (u.backupCodeEnabled) return true
  if (Array.isArray(u.verifiedPhoneNumbers) && u.verifiedPhoneNumbers.length > 0) return true
  return false
}

export default function MfaBanner({ role }: { role: string }) {
  const { isLoaded, user } = useUser()
  const [dismissed, setDismissed] = useState(true)  // default hidden until we know

  // Check persisted dismissal on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const until = window.localStorage.getItem(DISMISS_KEY)
      // Dismissal persists for 30 days, then re-nudges
      if (until && Number(until) > Date.now()) {
        setDismissed(true)
        return
      }
    } catch { /* localStorage unavailable */ }
    setDismissed(false)
  }, [])

  // Bail early if not a sensitive role
  if (!SENSITIVE_ROLES.has(role)) return null
  if (!isLoaded) return null
  if (isMfaActuallyEnabled(user)) return null
  if (dismissed) return null

  function handleDismiss() {
    setDismissed(true)
    try {
      // Stay quiet for 30 days
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
