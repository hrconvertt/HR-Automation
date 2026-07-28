'use client'

/**
 * /dashboard/settings/notifications
 * Per-category email + in-app toggles.
 */
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SettingsSidebar from '@/components/settings-sidebar'

interface Pref { category: string; emailEnabled: boolean; inAppEnabled: boolean }

const LABELS: Record<string, { title: string; sub: string }> = {
  LEAVE:        { title: 'Leave',         sub: 'Requests, approvals, balance changes' },
  PROBATION:    { title: 'Probation',     sub: 'Confirmation reminders, extension alerts' },
  PERFORMANCE:  { title: 'Performance',   sub: 'Reviews, goals, feedback, show-cause' },
  DOCUMENTS:    { title: 'Documents',     sub: 'Policy acknowledgments, letter requests' },
  CELEBRATIONS: { title: 'Celebrations',  sub: 'Birthdays, anniversaries, kudos' },
  PAYROLL:      { title: 'Payroll',       sub: 'Payslip released, salary changes' },
  LIFECYCLE:    { title: 'Lifecycle',     sub: 'Onboarding tasks, exit clearance' },
}

export default function NotificationsSettingsPage() {
  const [role, setRole] = useState<string | undefined>()
  const [prefs, setPrefs] = useState<Pref[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setRole(d.user?.role)).catch(() => {})
    fetch('/api/profile/notifications').then((r) => r.json()).then((d) => setPrefs(d.prefs ?? [])).catch(() => {})
  }, [])

  function toggle(cat: string, key: 'emailEnabled' | 'inAppEnabled', v: boolean) {
    setPrefs((prev) => prev.map((p) => p.category === cat ? { ...p, [key]: v } : p))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/profile/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs }),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Notifications</h1>
        <p className="text-sm text-slate-500 mt-1">Choose how Convertt HR reaches you for each category.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        <SettingsSidebar role={role} />

        <div className="min-w-0">
          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Notification channels</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[1fr,120px,120px] items-center px-6 py-3 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Category</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 text-center">Email</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 text-center">In-app</span>
              </div>
              {prefs.map((p) => (
                <div key={p.category} className="grid grid-cols-[1fr,120px,120px] items-center px-6 py-4 border-b border-slate-100">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{LABELS[p.category]?.title ?? p.category}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{LABELS[p.category]?.sub ?? ''}</p>
                  </div>
                  <div className="flex justify-center">
                    <ToggleSwitch checked={p.emailEnabled} onChange={(v) => toggle(p.category, 'emailEnabled', v)} />
                  </div>
                  <div className="flex justify-center">
                    <ToggleSwitch checked={p.inAppEnabled} onChange={(v) => toggle(p.category, 'inAppEnabled', v)} />
                  </div>
                </div>
              ))}
              <div className="px-6 py-4">
                <Button onClick={save} disabled={saving}>{saved ? '✓ Saved' : saving ? 'Saving…' : 'Save notification settings'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-11 h-6 bg-slate-200 peer-checked:bg-slate-700 rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
    </label>
  )
}
