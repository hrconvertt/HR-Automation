'use client'

/**
 * /sign-in — Path A emergency login.
 *
 * Bypasses Clerk entirely. Posts email + password to
 * /api/auth/emergency-signin, which validates against the existing
 * bcrypt hash and sets the `hr_token` cookie. verifyToken's fallback
 * branch picks it up.
 *
 * Use this when /login (Clerk's SignIn) is broken.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SignInPage() {
  const router = useRouter()
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
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="text-white text-xl font-bold">Convertt HR</span>
          </div>
          <div className="mt-16">
            <h2 className="text-white text-4xl font-bold leading-tight">
              Sign in to Convertt&nbsp;HR
            </h2>
            <p className="text-slate-400 mt-4 text-lg">
              Enter the email and password your HR set up for you.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="text-slate-900 text-xl font-bold">Convertt HR</span>
          </div>

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

          <p className="mt-6 text-center text-xs text-slate-500">
            Don&apos;t have an account?{' '}
            <span className="text-slate-700 font-medium">Contact HR for an invitation.</span>
          </p>

          <p className="mt-8 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} Convertt HR. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
