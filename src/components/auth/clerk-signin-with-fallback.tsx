'use client'

/**
 * Clerk <SignIn/> wrapped in a load watchdog.
 *
 * State machine:
 *   loading  → spinner ("Preparing secure sign-in…")
 *   clerk    → Clerk's JS mounted; render <SignIn/>
 *   fallback → Clerk failed to load (script error, or the deployment's
 *              domain isn't allowed on the Clerk instance) OR the 6-second
 *              watchdog fired OR the user clicked the manual escape hatch.
 *              Renders the emergency email + password form.
 *
 * The fallback posts to /api/auth/emergency-signin — no new auth logic;
 * Clerk remains the primary path whenever it mounts.
 */
import { useEffect, useRef, useState } from 'react'
import { SignIn, ClerkLoaded, ClerkFailed, useClerk } from '@clerk/nextjs'
import { EmergencySignInForm } from './emergency-signin-form'

const WATCHDOG_MS = 6000

/** Invisible probe rendered inside <ClerkLoaded>: fires once Clerk mounts. */
function ClerkMountProbe({ onMounted }: { onMounted: () => void }) {
  useEffect(() => {
    onMounted()
  }, [onMounted])
  return null
}

/** Invisible probe rendered inside <ClerkFailed>: fires if Clerk load errors. */
function ClerkFailProbe({ onFailed }: { onFailed: () => void }) {
  useEffect(() => {
    onFailed()
  }, [onFailed])
  return null
}

export function ClerkSignInWithFallback({
  startInPasswordMode = false,
}: {
  startInPasswordMode?: boolean
}) {
  const [mode, setMode] = useState<'loading' | 'clerk' | 'fallback'>(
    startInPasswordMode ? 'fallback' : 'loading',
  )
  const clerkMountedRef = useRef(false)
  const clerk = useClerk()

  const markMounted = () => {
    clerkMountedRef.current = true
    setMode((m) => (m === 'loading' ? 'clerk' : m))
  }

  const fallBack = (reason: string) => {
    if (clerkMountedRef.current) return
    // eslint-disable-next-line no-console
    console.error(
      `[auth] Clerk failed to load — falling back to password sign-in (${reason})`,
    )
    setMode('fallback')
  }

  // Hard watchdog: if Clerk hasn't mounted within 6s, fall back.
  useEffect(() => {
    if (startInPasswordMode) return
    const t = setTimeout(() => {
      if (!clerkMountedRef.current) fallBack(`watchdog ${WATCHDOG_MS}ms timeout`)
    }, WATCHDOG_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startInPasswordMode])

  // Belt-and-braces: some Clerk versions expose `loaded` synchronously.
  useEffect(() => {
    if (clerk?.loaded) markMounted()
  }, [clerk?.loaded])

  if (mode === 'fallback') {
    return <FallbackPane onRetryClerk={() => setMode(clerkMountedRef.current ? 'clerk' : 'loading')} />
  }

  return (
    <div>
      {mode === 'loading' && (
        <div className="flex flex-col items-center justify-center py-16" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
          <p className="mt-4 text-sm text-slate-500">Preparing secure sign-in…</p>
        </div>
      )}

      <ClerkLoaded>
        <ClerkMountProbe onMounted={markMounted} />
        <SignIn
          routing="path"
          path="/login"
          forceRedirectUrl="/dashboard"
          fallbackRedirectUrl="/dashboard"
          appearance={{
            elements: {
              // Invite-only — hide all sign-up affordances. New employees
              // arrive via HR-sent Clerk invitations, not self-registration.
              footerAction: 'hidden',
              footerActionLink: 'hidden',
              footer: 'hidden',
            },
          }}
        />
      </ClerkLoaded>

      <ClerkFailed>
        <ClerkFailProbe onFailed={() => fallBack('ClerkFailed — clerk-js load error')} />
      </ClerkFailed>

      {/* Persistent manual escape hatch — visible even when Clerk works */}
      <p className="mt-4 text-center text-xs text-slate-500">
        Having trouble signing in?{' '}
        <button
          type="button"
          onClick={() => setMode('fallback')}
          className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
        >
          Use email &amp; password
        </button>
      </p>
    </div>
  )
}

function FallbackPane({ onRetryClerk }: { onRetryClerk: () => void }) {
  return (
    <div>
      <EmergencySignInForm />
      <p className="mt-4 text-center text-xs text-slate-500">
        <button
          type="button"
          onClick={onRetryClerk}
          className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
        >
          Back to standard sign-in
        </button>
      </p>
    </div>
  )
}
