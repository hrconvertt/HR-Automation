'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, X } from 'lucide-react'

/**
 * Client half of /set-password — password + confirm with live rule
 * validation. On success the API sets the hr_token cookie; we hard-navigate
 * to /dashboard so the session is picked up server-side.
 */
export function SetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const rules = useMemo(
    () => [
      { label: 'At least 10 characters', ok: password.length >= 10 },
      { label: 'Contains a letter', ok: /[a-zA-Z]/.test(password) },
      { label: 'Contains a number', ok: /[0-9]/.test(password) },
      { label: 'Both passwords match', ok: password.length > 0 && password === confirm },
    ],
    [password, confirm],
  )
  const allOk = rules.every((r) => r.ok)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!allOk || submitting) return
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      setDone(true)
      window.location.href = data.redirectTo ?? '/dashboard'
    } catch {
      setError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
        Password set — signing you in…
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1">
          New password
        </label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
          autoFocus
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">
          Confirm password
        </label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••••"
        />
      </div>

      {/* Live rule checklist */}
      <ul className="space-y-1.5">
        {rules.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            {r.ok ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <X className="w-3.5 h-3.5 text-slate-300" />
            )}
            <span className={r.ok ? 'text-slate-700' : 'text-slate-400'}>{r.label}</span>
          </li>
        ))}
      </ul>

      {error && (
        <p className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={!allOk || submitting}>
        {submitting ? 'Setting password…' : 'Set password & sign in'}
      </Button>

      <p className="text-[11px] text-slate-500 text-center">
        You can also sign in any time with <span className="font-medium">Continue with Google</span>{' '}
        using the same email address this invite was sent to.
      </p>
    </form>
  )
}
