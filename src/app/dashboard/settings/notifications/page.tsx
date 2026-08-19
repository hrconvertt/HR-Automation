'use client'

/**
 * /dashboard/settings/notifications
 *
 * Every notification the app can send, one switch each, plus theme and sound.
 *
 * This replaced seven category switches. Turning off "Payroll" to stop a
 * reminder also stopped the payslip, which is the one notification nobody
 * wants to miss — so the switches are now per notification, and the ones that
 * carry money or a deadline are marked so it is a deliberate choice to silence
 * them rather than a side effect.
 */

import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SettingsSidebar from '@/components/settings-sidebar'
import {
  Sun, Moon, Monitor, Volume2, VolumeX, Search, Check, Loader2, AlertTriangle,
} from 'lucide-react'
import {
  groupedCatalog, GROUP_LABELS, THEMES, THEME_LABELS,
  NOTIFICATION_SOUNDS, SOUND_LABELS,
  type Theme, type NotificationSound,
} from '@/lib/notification-catalog'

interface Pref { type: string; emailEnabled: boolean; inAppEnabled: boolean }

const THEME_ICON: Record<Theme, React.ReactNode> = {
  LIGHT: <Sun className="w-4 h-4" />,
  DARK: <Moon className="w-4 h-4" />,
  SYSTEM: <Monitor className="w-4 h-4" />,
}

function Toggle({ on, onChange, label }: {
  on: boolean; onChange: (v: boolean) => void; label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
        on ? 'bg-slate-900' : 'bg-slate-200'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function NotificationsSettingsPage() {
  const [role, setRole] = useState<string | undefined>()
  const [prefs, setPrefs] = useState<Pref[]>([])
  const [theme, setTheme] = useState<Theme>('LIGHT')
  const [sound, setSound] = useState<NotificationSound>('CHIME')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setRole(d.user?.role)).catch(() => {})
    fetch('/api/profile/notification-settings')
      .then((r) => r.json())
      .then((d) => {
        setPrefs(d.prefs ?? [])
        setTheme(d.theme ?? 'LIGHT')
        setSound(d.sound ?? 'CHIME')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const byType = useMemo(() => new Map(prefs.map((p) => [p.type, p])), [prefs])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return groupedCatalog()
      .map((g) => ({
        ...g,
        items: needle
          ? g.items.filter(
              (i) =>
                i.label.toLowerCase().includes(needle)
                || i.when.toLowerCase().includes(needle)
                || GROUP_LABELS[g.group].toLowerCase().includes(needle),
            )
          : g.items,
      }))
      .filter((g) => g.items.length > 0)
  }, [q])

  function setPref(type: string, key: 'emailEnabled' | 'inAppEnabled', v: boolean) {
    setPrefs((prev) => {
      const found = prev.find((p) => p.type === type)
      if (found) return prev.map((p) => (p.type === type ? { ...p, [key]: v } : p))
      return [...prev, { type, emailEnabled: true, inAppEnabled: true, [key]: v } as Pref]
    })
    setSaved(false)
  }

  /** Flip a whole group at once — the reason people open this page. */
  function setGroup(types: string[], key: 'emailEnabled' | 'inAppEnabled', v: boolean) {
    setPrefs((prev) => {
      const next = [...prev]
      for (const type of types) {
        const i = next.findIndex((p) => p.type === type)
        if (i >= 0) next[i] = { ...next[i], [key]: v }
        else next.push({ type, emailEnabled: true, inAppEnabled: true, [key]: v } as Pref)
      }
      return next
    })
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/profile/notification-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs, theme, sound }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  const offCount = prefs.filter((p) => !p.inAppEnabled && !p.emailEnabled).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Notifications</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every notification Convertt HR can send, one switch each — plus how the app looks
          and sounds.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        <SettingsSidebar role={role} />

        <div className="min-w-0 space-y-5">
          {/* ── Appearance ─────────────────────────────────────── */}
          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Appearance</CardTitle></CardHeader>
            <CardContent className="p-5 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Theme</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTheme(t); setSaved(false) }}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        theme === t
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {THEME_ICON[t]} {THEME_LABELS[t].label}
                        {theme === t && <Check className="w-3.5 h-3.5 ml-auto" />}
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-1">
                        {THEME_LABELS[t].hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                  Notification sound
                </p>
                <div className="flex flex-wrap gap-2">
                  {NOTIFICATION_SOUNDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSound(s); setSaved(false) }}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        sound === s
                          ? 'border-slate-900 bg-slate-50 font-medium text-slate-900'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {s === 'NONE' ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      {SOUND_LABELS[s]}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Silent turns the sound off without switching any notification off.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── The switches ───────────────────────────────────── */}
          <Card>
            <CardHeader className="border-b border-slate-100 flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle>
                What you get told about
                {offCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {offCount} fully off
                  </span>
                )}
              </CardTitle>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Find a notification"
                  className="pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-sm w-56"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <p className="text-sm text-slate-400 text-center py-10 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading your settings…
                </p>
              ) : groups.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">
                  Nothing matches &ldquo;{q}&rdquo;.
                </p>
              ) : (
                groups.map((g) => {
                  const types = g.items.map((i) => i.type)
                  const allInApp = types.every((t) => byType.get(t)?.inAppEnabled ?? true)
                  const allEmail = types.every((t) => byType.get(t)?.emailEnabled ?? true)
                  return (
                    <div key={g.group}>
                      <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50 border-y border-slate-100">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex-1">
                          {GROUP_LABELS[g.group]}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 w-14 text-center">
                          In-app
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 w-14 text-center">
                          Email
                        </span>
                        <span className="w-14 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setGroup(types, 'inAppEnabled', !allInApp)
                              setGroup(types, 'emailEnabled', !allEmail)
                            }}
                            className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                          >
                            {allInApp && allEmail ? 'All off' : 'All on'}
                          </button>
                        </span>
                      </div>
                      {g.items.map((n) => {
                        const p = byType.get(n.type)
                        const inApp = p?.inAppEnabled ?? true
                        const email = p?.emailEnabled ?? true
                        const silenced = !inApp && !email
                        return (
                          <div
                            key={n.type}
                            className="flex items-center gap-3 px-5 py-3 border-b border-slate-50 last:border-b-0"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-900 flex items-center gap-1.5 flex-wrap">
                                {n.label}
                                {n.important && silenced && (
                                  <span
                                    title="This one carries money or a deadline"
                                    className="inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5" /> worth keeping on
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">{n.when}</p>
                            </div>
                            <span className="w-14 flex justify-center">
                              <Toggle
                                on={inApp}
                                label={`${n.label} in-app`}
                                onChange={(v) => setPref(n.type, 'inAppEnabled', v)}
                              />
                            </span>
                            <span className="w-14 flex justify-center">
                              <Toggle
                                on={email}
                                label={`${n.label} email`}
                                onChange={(v) => setPref(n.type, 'emailEnabled', v)}
                              />
                            </span>
                            <span className="w-14" />
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <div className="sticky bottom-0 flex items-center justify-between gap-3 flex-wrap bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
            <p className="text-[11px] text-slate-500">
              {saved ? 'Saved.' : 'Changes are not saved until you press Save.'}
            </p>
            <Button size="sm" onClick={save} disabled={saving || loading}>
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {saved ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
