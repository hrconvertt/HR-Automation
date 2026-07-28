'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Cake, PartyPopper, Megaphone, BellRing, Check } from 'lucide-react'

type Scope = 'TEAM_ONLY' | 'COMPANY_WIDE'

interface Props {
  initial: {
    birthdayNotificationScope: string
    anniversaryNotificationScope: string
    eventNotificationScope: string
  }
}

const SECTIONS: {
  key: 'birthdayNotificationScope' | 'anniversaryNotificationScope' | 'eventNotificationScope'
  title: string
  blurb: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  {
    key: 'birthdayNotificationScope',
    title: 'Birthdays',
    blurb: 'Who gets the “Birthday today: …” pop-up on someone’s birthday.',
    Icon: Cake,
  },
  {
    key: 'anniversaryNotificationScope',
    title: 'Work Anniversaries',
    blurb: 'Who gets pinged on someone’s joining-date anniversary.',
    Icon: PartyPopper,
  },
  {
    key: 'eventNotificationScope',
    title: 'Company Events',
    blurb: 'Town halls, Eid celebrations, retreats — broadcast scope for company-wide events.',
    Icon: Megaphone,
  },
]

export function CultureNotificationsClient({ initial }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    birthdayNotificationScope: (initial.birthdayNotificationScope as Scope) ?? 'TEAM_ONLY',
    anniversaryNotificationScope: (initial.anniversaryNotificationScope as Scope) ?? 'TEAM_ONLY',
    eventNotificationScope: (initial.eventNotificationScope as Scope) ?? 'COMPANY_WIDE',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    const res = await fetch('/api/settings/culture-notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to save')
      return
    }
    setSaved(true)
    router.refresh()
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-5">
      {/* Charcoal hero */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <BellRing className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Culture Notification Settings</h1>
            <p className="text-sm text-white/85 mt-1">
              Control who sees birthday and anniversary pop-ups. Default: only the celebrant’s own team
              gets pinged — HR is always notified for every event.
            </p>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="grid gap-4">
        {SECTIONS.map((s) => {
          const value = form[s.key]
          return (
            <Card key={s.key} className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 max-w-md">
                  <div className="rounded-lg bg-slate-100 p-2.5">
                    <s.Icon className="w-5 h-5 text-slate-700" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{s.title}</h2>
                    <p className="text-sm text-slate-600 mt-1">{s.blurb}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RadioChip
                    active={value === 'TEAM_ONLY'}
                    onClick={() => setForm({ ...form, [s.key]: 'TEAM_ONLY' })}
                  >
                    Team only
                  </RadioChip>
                  <RadioChip
                    active={value === 'COMPANY_WIDE'}
                    onClick={() => setForm({ ...form, [s.key]: 'COMPANY_WIDE' })}
                  >
                    Company-wide
                  </RadioChip>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {error && <span className="text-sm text-slate-700">{error}</span>}
        {saved && (
          <span className="text-sm text-slate-700 inline-flex items-center gap-1">
            <Check className="w-4 h-4" /> Saved
          </span>
        )}
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

function RadioChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ' +
        (active
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50')
      }
    >
      {active && <Check className="w-3 h-3" />}
      {children}
    </button>
  )
}
