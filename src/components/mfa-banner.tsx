'use client'

/**
 * Nudge for sensitive-role users without MFA enabled.
 *
 * Shown above the dashboard if:
 *   - The user's primary role is HR_ADMIN, EXECUTIVE or FINANCE
 *   - Clerk reports `twoFactorEnabled === false`
 *
 * Hard enforcement (block the dashboard) is opt-in via MFA_ENFORCED_ROLES env;
 * the banner itself is always shown for the sensitive roles.
 */
import { useEffect, useState } from 'react'

const SENSITIVE_ROLES = new Set(['HR_ADMIN', 'EXECUTIVE', 'FINANCE'])

export default function MfaBanner({ role }: { role: string }) {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!SENSITIVE_ROLES.has(role)) return
    // Clerk's client-side user object carries twoFactorEnabled
    let cancelled = false
    async function check() {
      try {
        const clerk = (window as unknown as { Clerk?: { user?: { twoFactorEnabled?: boolean } } }).Clerk
        if (clerk?.user) {
          if (!cancelled) setMfaEnabled(!!clerk.user.twoFactorEnabled)
          return
        }
      } catch { /* ignore */ }
      if (!cancelled) setMfaEnabled(null)
    }
    check()
    const t = setInterval(check, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [role])

  if (!SENSITIVE_ROLES.has(role)) return null
  if (mfaEnabled !== false) return null
  if (dismissed) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between text-sm">
      <p className="text-amber-900">
        <strong>Your role requires MFA.</strong>{' '}
        Sensitive data access is protected by two-factor authentication.{' '}
        <a href="/dashboard/settings/security" className="underline font-semibold">Set up now</a>
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-700 hover:text-amber-900 ml-4"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
