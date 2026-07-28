'use client'

/**
 * /dashboard/settings/preferences
 * Theme + language + privacy toggles. Time zone is fixed to Asia/Karachi
 * for now (server-wide) — surfaced read-only so users see what's in play.
 */
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SettingsSidebar from '@/components/settings-sidebar'
import { Sun, Moon, Monitor } from 'lucide-react'

const LANGUAGES = [
  { code: 'EN', label: 'English' },
  { code: 'UR', label: 'اردو (Urdu)' },
  { code: 'AR', label: 'العربية (Arabic)' },
  { code: 'HI', label: 'हिन्दी (Hindi)' },
  { code: 'BN', label: 'বাংলা (Bengali)' },
  { code: 'ZH', label: '中文 (Chinese)' },
  { code: 'ES', label: 'Español (Spanish)' },
  { code: 'FR', label: 'Français (French)' },
  { code: 'DE', label: 'Deutsch (German)' },
  { code: 'RU', label: 'Русский (Russian)' },
] as const

const TIMEZONES = [
  { value: 'Asia/Karachi',        label: 'Asia/Karachi (PKT, UTC+5) — Pakistan' },
  { value: 'Asia/Kolkata',        label: 'Asia/Kolkata (IST, UTC+5:30) — India' },
  { value: 'Asia/Dubai',          label: 'Asia/Dubai (GST, UTC+4) — UAE' },
  { value: 'Asia/Riyadh',         label: 'Asia/Riyadh (AST, UTC+3) — Saudi' },
  { value: 'Asia/Dhaka',          label: 'Asia/Dhaka (BST, UTC+6) — Bangladesh' },
  { value: 'UTC',                 label: 'UTC (UTC+0)' },
  { value: 'Europe/London',       label: 'Europe/London (BST/GMT, UTC+0/+1)' },
  { value: 'America/New_York',    label: 'America/New_York (EST/EDT, UTC-5/-4)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT, UTC-8/-7)' },
  { value: 'Asia/Singapore',      label: 'Asia/Singapore (SGT, UTC+8)' },
  { value: 'Asia/Tokyo',          label: 'Asia/Tokyo (JST, UTC+9)' },
  { value: 'Australia/Sydney',    label: 'Australia/Sydney (AEDT/AEST, UTC+10/+11)' },
] as const

export default function PreferencesPage() {
  const [role, setRole] = useState<string | undefined>()
  const [theme, setTheme] = useState<'LIGHT' | 'DARK' | 'SYSTEM'>('LIGHT')
  const [language, setLanguage] = useState<string>('EN')
  const [timezone, setTimezone] = useState<string>('Asia/Karachi')
  const [hideBirthday, setHideBirthday] = useState(false)
  const [hideAnniversary, setHideAnniversary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setRole(d.user?.role)).catch(() => {})
    fetch('/api/profile/preferences').then((r) => r.json()).then((d) => {
      if (d.theme) setTheme(d.theme)
      if (d.language) setLanguage(d.language)
      if (d.timezone) setTimezone(d.timezone)
      setHideBirthday(!!d.hideBirthday)
      setHideAnniversary(!!d.hideAnniversary)
    }).catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/profile/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, language, timezone, hideBirthday, hideAnniversary }),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Preferences</h1>
        <p className="text-sm text-slate-500 mt-1">Personalize how the app looks and what others see about you.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        <SettingsSidebar role={role} />

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Appearance</CardTitle></CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-slate-600">Choose how the interface looks. System matches your OS.</p>
              <div className="grid grid-cols-3 gap-3 max-w-md">
                <ThemeCard value="LIGHT" current={theme} onPick={setTheme} icon={Sun} label="Light" />
                <ThemeCard value="DARK" current={theme} onPick={setTheme} icon={Moon} label="Dark" />
                <ThemeCard value="SYSTEM" current={theme} onPick={setTheme} icon={Monitor} label="System" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Language & region</CardTitle></CardHeader>
            <CardContent className="p-6 space-y-4 max-w-md">
              <Field label="Language" hint="Most languages are placeholders — full translation rolling out.">
                <select value={language} onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Time zone" hint="Affects how dates/times are displayed for you. Server clock unaffected.">
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  {TIMEZONES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Privacy</CardTitle></CardHeader>
            <CardContent className="p-6 space-y-5">
              <Toggle label="Hide my birthday" sub="Won't appear in celebrations or the team calendar."
                checked={hideBirthday} onChange={setHideBirthday} />
              <Toggle label="Hide my work anniversary" sub="Won't appear in milestones or the calendar."
                checked={hideAnniversary} onChange={setHideAnniversary} />
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving}>{saved ? '✓ Saved' : saving ? 'Saving…' : 'Save preferences'}</Button>
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

function ThemeCard<T extends string>({ value, current, onPick, icon: Icon, label }: {
  value: T; current: T; onPick: (v: T) => void; icon: React.ComponentType<{ className?: string }>; label: string
}) {
  const active = value === current
  return (
    <button onClick={() => onPick(value)}
      className={`rounded-lg border p-4 flex flex-col items-center gap-2 transition ${
        active ? 'border-slate-500 bg-slate-50 ring-2 ring-slate-100' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}>
      <Icon className={`w-6 h-6 ${active ? 'text-slate-700' : 'text-slate-500'}`} />
      <span className={`text-sm font-medium ${active ? 'text-slate-900' : 'text-slate-700'}`}>{label}</span>
    </button>
  )
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
        <div className="w-11 h-6 bg-slate-200 peer-checked:bg-slate-700 rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
      </label>
    </div>
  )
}
