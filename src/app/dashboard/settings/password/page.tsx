'use client'

/**
 * /dashboard/settings/password
 *
 * Change-password form + Sign-out-everywhere button.
 * Triggers when a user's mustChangePass=true: shows the same banner
 * as /settings/account.
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import SettingsSidebar from '@/components/settings-sidebar'
import { ShieldAlert, LogOut } from 'lucide-react'

export default function PasswordPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | undefined>(undefined)
  const [mustChange, setMustChange] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      setRole(d.user?.role)
      setMustChange(!!d.user?.mustChangePass)
    }).catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setOk(false)
    if (next !== confirm) { setError('New password and confirmation do not match'); return }
    if (next.length < 8)  { setError('New password must be at least 8 characters'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to change password'); return }
      setOk(true); setCurrent(''); setNext(''); setConfirm('')
      setMustChange(false)
      // If they were on must-change flow, send them to dashboard
      setTimeout(() => { router.push('/dashboard'); router.refresh() }, 1500)
    } finally { setSubmitting(false) }
  }

  async function signOutEverywhere() {
    if (!window.confirm('Sign out of every browser and device? You will need to log in again here too.')) return
    await fetch('/api/auth/sign-out-all', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Password & Security</h1>
        <p className="text-sm text-slate-500 mt-1">Change your sign-in password and manage active sessions.</p>
      </div>

      {mustChange && (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-slate-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Please set a new password before continuing</p>
            <p className="text-xs text-slate-900 mt-0.5">You are using the temporary password. Pick one only you know.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        <SettingsSidebar role={role} />

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Change password</CardTitle></CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submit} className="space-y-4 max-w-md">
                <Field label="Current password">
                  <Input type="password" required autoComplete="current-password"
                    value={current} onChange={(e) => setCurrent(e.target.value)} />
                </Field>
                <Field label="New password" hint="Minimum 8 characters">
                  <Input type="password" required autoComplete="new-password"
                    value={next} onChange={(e) => setNext(e.target.value)} />
                </Field>
                <Field label="Confirm new password">
                  <Input type="password" required autoComplete="new-password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </Field>
                {error && (
                  <div className="bg-slate-50 border border-slate-100 text-slate-700 text-sm rounded-md px-3 py-2">{error}</div>
                )}
                {ok && (
                  <div className="bg-slate-50 border border-slate-100 text-slate-700 text-sm rounded-md px-3 py-2">
                    Password updated. Redirecting…
                  </div>
                )}
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Update password'}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Two-factor authentication</CardTitle></CardHeader>
            <CardContent className="p-6">
              <Toggle disabled label="Enable two-factor (2FA)" sub="Coming soon — adds a 6-digit code on every login." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Active sessions</CardTitle></CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                You are currently signed in on this device. Use the button below to invalidate every other browser
                where you might be logged in (lost laptop, shared computer, etc.). You will also be signed out here.
              </p>
              <Button variant="outline" onClick={signOutEverywhere} className="text-slate-700 border-slate-100 hover:bg-slate-50">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out everywhere
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ label, sub, checked, onChange, disabled }: {
  label: string; sub: string; checked?: boolean; onChange?: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-60' : ''}`}>
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" disabled={disabled} checked={!!checked}
          onChange={(e) => onChange?.(e.target.checked)} className="sr-only peer" />
        <div className="w-11 h-6 bg-slate-200 peer-checked:bg-slate-700 rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
      </label>
    </div>
  )
}
