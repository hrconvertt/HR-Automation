'use client'

/**
 * Emergency email + password sign-in form.
 *
 * Bypasses Clerk entirely: POSTs to /api/auth/emergency-signin, which
 * validates against the bcrypt hash stored on the User row and sets the
 * `hr_token` cookie. verifyToken()'s fallback branch picks it up.
 *
 * Rendered by the /login page when Clerk fails to load (watchdog fallback)
 * or when the user explicitly opts into password sign-in.
 */
import { useState } from 'react'

export function EmergencySignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/auth/emergency-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Sign-in failed.')
        setBusy(false)
        return
      }
      // Hard navigation so middleware re-evaluates with the new cookie
      window.location.href = data.redirectTo || '/dashboard'
    } catch {
      setError('Network error. Try again.')
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h1>
      <p className="text-sm text-slate-500 mb-6">Sign in with your email and password.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-800 mb-1">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            placeholder="you@convertt.co"
            disabled={busy}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800 mb-1">Password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            placeholder="••••••••"
            disabled={busy}
          />
        </div>

        {error && (
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-slate-900 text-white py-2.5 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
