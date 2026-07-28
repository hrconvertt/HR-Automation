'use client'

/**
 * /reset-session — emergency cookie-flush page.
 *
 * Anyone stuck in the Clerk redirect loop (stale session cookie + no
 * matching DB row) can navigate here to force a clean sign-out. We:
 *   1. Call Clerk's signOut() — clears the session cookie
 *   2. Clear localStorage / sessionStorage as a belt-and-braces measure
 *   3. Redirect to /login as a clean slate
 *
 * Linked from /login automatically when the page detects an active
 * Clerk session but the user keeps bouncing.
 */
import { useEffect, useState } from 'react'
import { useClerk } from '@clerk/nextjs'

export default function ResetSessionPage() {
  const { signOut } = useClerk()
  const [step, setStep] = useState<'starting' | 'signing-out' | 'clearing' | 'done' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function reset() {
      try {
        setStep('signing-out')
        // Sign out of Clerk — clears session cookie
        await signOut().catch(() => { /* may fail if no session, that's fine */ })
        if (cancelled) return
        setStep('clearing')
        // Belt-and-braces: also wipe localStorage / sessionStorage
        try {
          window.localStorage.clear()
          window.sessionStorage.clear()
        } catch { /* ignore */ }
        if (cancelled) return
        setStep('done')
        // Hard redirect (not next/navigation push) — forces a fresh page load
        // so middleware re-evaluates from scratch
        setTimeout(() => {
          window.location.href = '/login'
        }, 800)
      } catch (e) {
        if (cancelled) return
        setStep('error')
        setErrorMsg(e instanceof Error ? e.message : 'Unknown error')
      }
    }
    reset()
    return () => { cancelled = true }
  }, [signOut])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="max-w-md w-full text-center">
        <div className="text-5xl mb-4 select-none">🧹</div>
        <h1 className="text-2xl font-bold text-slate-900">Resetting your session…</h1>
        <p className="mt-3 text-sm text-slate-600">
          Clearing any stale cookies and sending you back to a clean sign-in.
        </p>
        <p className="mt-6 text-xs text-slate-500">
          {step === 'starting'    && 'Initialising…'}
          {step === 'signing-out' && 'Signing out of Clerk…'}
          {step === 'clearing'    && 'Clearing local storage…'}
          {step === 'done'        && 'All clear — redirecting…'}
          {step === 'error'       && `Failed: ${errorMsg ?? 'unknown'}`}
        </p>
        {step === 'error' && (
          <button
            type="button"
            onClick={() => { window.location.href = '/login' }}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            Go to login anyway
          </button>
        )}
      </div>
    </div>
  )
}
