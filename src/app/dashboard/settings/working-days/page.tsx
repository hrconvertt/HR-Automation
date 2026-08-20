'use client'

/**
 * Working Days & Hours — per country.
 *
 * Convertt runs in Pakistan and the UAE (HR Playbook 1.2), and their working
 * weeks differ, so the schedule is chosen per location from a country dropdown
 * and stored per country (workingDays:PK, workDayHours:UAE, …). Pakistan also
 * mirrors the legacy config keys so attendance and payroll keep reading them.
 *
 * The page opens read-only — the schedule as it stands — with an Edit button.
 * Editing reveals the controls and a Save; saving returns to the read-only
 * view. So the common case (looking at the hours) is calm, and changing them
 * is a deliberate act.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CalendarDays, Clock, Loader2, Check, AlertTriangle, Pencil, X, MapPin } from 'lucide-react'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
type Day = (typeof DAYS)[number]

interface DayHours { start: string; end: string; breakMins: number }
const DEFAULT_HOURS: DayHours = { start: '10:00', end: '19:00', breakMins: 60 }

/** The locations Convertt operates in. The dropdown's options. */
const COUNTRIES = [
  { code: 'PK', label: 'Pakistan (Lahore)' },
  { code: 'UAE', label: 'United Arab Emirates (Dubai)' },
] as const
type CountryCode = (typeof COUNTRIES)[number]['code']

const DEFAULT_WORKING: Day[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

/** Minutes worked in a day, after the break. A negative span reads as 0. */
function dayMinutes(h: DayHours): number {
  const [sh, sm] = h.start.split(':').map(Number)
  const [eh, em] = h.end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm) - (h.breakMins || 0)
  return mins > 0 ? mins : 0
}
const fmtHours = (mins: number) => {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
/** "10:00" → "10:00 am", for the read-only view. */
function label12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

export default function WorkingDaysSettingsPage() {
  const [config, setConfig] = useState<Record<string, string>>({})
  const [country, setCountry] = useState<CountryCode>('PK')
  const [working, setWorking] = useState<Day[]>(DEFAULT_WORKING)
  const [hours, setHours] = useState<Record<string, DayHours>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Pull the working week + hours for a country out of the loaded config. */
  const loadForCountry = useCallback((cfg: Record<string, string>, c: CountryCode) => {
    // Namespaced key first; Pakistan falls back to the legacy un-namespaced one.
    const wdRaw = cfg[`workingDays:${c}`] ?? (c === 'PK' ? cfg.workingDays : undefined)
    const whRaw = cfg[`workDayHours:${c}`] ?? (c === 'PK' ? cfg.workDayHours : undefined)
    try {
      const wd = wdRaw ? JSON.parse(wdRaw) : null
      setWorking(Array.isArray(wd) && wd.length ? (wd as Day[]) : DEFAULT_WORKING)
    } catch { setWorking(DEFAULT_WORKING) }
    try {
      setHours(whRaw ? JSON.parse(whRaw) : {})
    } catch { setHours({}) }
  }, [])

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).catch(() => ({})).then((s) => {
      const cfg = (s?.config ?? {}) as Record<string, string>
      setConfig(cfg)
      loadForCountry(cfg, 'PK')
      setLoading(false)
    })
  }, [loadForCountry])

  function pickCountry(c: CountryCode) {
    setCountry(c)
    setEditing(false)
    setError(null)
    loadForCountry(config, c)
  }

  const hoursFor = (d: Day): DayHours => hours[d] ?? DEFAULT_HOURS
  const setDay = (d: Day, patch: Partial<DayHours>) =>
    setHours((p) => ({ ...p, [d]: { ...hoursFor(d), ...patch } }))

  const weekly = useMemo(
    () => working.reduce((sum, d) => sum + dayMinutes(hours[d] ?? DEFAULT_HOURS), 0),
    [working, hours],
  )
  const invalid = working.filter((d) => dayMinutes(hours[d] ?? DEFAULT_HOURS) === 0)
  const countryLabel = COUNTRIES.find((c) => c.code === country)?.label ?? country

  async function save() {
    setSaving(true)
    setError(null)
    const workDayHours = Object.fromEntries(working.map((d) => [d, hoursFor(d)]))
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, workingDays: working, workDayHours }),
    })
    setSaving(false)
    if (!res.ok) { setError('Could not save. Try again.'); return }
    // Keep the local config in step so switching country and back shows the save.
    setConfig((c) => ({
      ...c,
      [`workingDays:${country}`]: JSON.stringify(working),
      [`workDayHours:${country}`]: JSON.stringify(workDayHours),
      ...(country === 'PK'
        ? { workingDays: JSON.stringify(working), workDayHours: JSON.stringify(workDayHours) }
        : {}),
    }))
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading…</div>

  return (
    <div className="space-y-4">
      {/* Location picker */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <MapPin className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Location</span>
          <select
            value={country}
            onChange={(e) => pickCountry(e.target.value as CountryCode)}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
          >
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <span className="text-[11px] text-slate-400">
            Each location has its own working week.
          </span>
        </CardContent>
      </Card>

      {/* Summary — always visible. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Working days" value={`${working.length} / week`} icon={CalendarDays} />
        <Stat label="Weekly hours" value={fmtHours(weekly)} icon={Clock} />
        <Stat
          label="Average day"
          value={working.length ? fmtHours(Math.round(weekly / working.length)) : '—'}
          icon={Clock}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Working week — {countryLabel}</CardTitle>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              Editing
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {editing && (
            <p className="text-xs text-slate-500">
              Switch a day on to make it a working day, then set its hours. Days left off are
              treated as weekends by attendance and payroll.
            </p>
          )}

          {/* ── Read-only view ─────────────────────────────────────── */}
          {!editing ? (
            <div className="divide-y divide-slate-50">
              {DAYS.map((d) => {
                const on = working.includes(d)
                const h = hoursFor(d)
                return (
                  <div key={d} className="flex items-center justify-between py-2.5">
                    <span className={`text-sm w-32 ${on ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
                      {d}
                    </span>
                    {on ? (
                      <span className="text-sm text-slate-600 flex-1">
                        {label12(h.start)} – {label12(h.end)}
                        <span className="text-slate-400"> · {h.breakMins} min break</span>
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400 flex-1">Weekend</span>
                    )}
                    <span className={`text-xs font-medium ${on ? 'text-slate-500' : 'text-slate-300'}`}>
                      {on ? fmtHours(dayMinutes(h)) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── Edit view ─────────────────────────────────────────── */
            <div className="space-y-2">
              {DAYS.map((d) => {
                const on = working.includes(d)
                const h = hoursFor(d)
                const mins = dayMinutes(h)
                return (
                  <div
                    key={d}
                    className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${
                      on ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 w-40 shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setWorking((p) => (e.target.checked
                            ? [...p, d].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))
                            : p.filter((x) => x !== d)))
                        }
                        className="w-4 h-4 accent-slate-900"
                      />
                      <span className={`text-sm ${on ? 'font-medium text-slate-900' : 'text-slate-500'}`}>{d}</span>
                    </label>

                    {on ? (
                      <>
                        <Field label="Start">
                          <input type="time" value={h.start}
                            onChange={(e) => setDay(d, { start: e.target.value })}
                            className="border border-slate-300 rounded-md px-2 py-1 text-sm" />
                        </Field>
                        <Field label="End">
                          <input type="time" value={h.end}
                            onChange={(e) => setDay(d, { end: e.target.value })}
                            className="border border-slate-300 rounded-md px-2 py-1 text-sm" />
                        </Field>
                        <Field label="Break">
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} max={240} step={15} value={h.breakMins}
                              onChange={(e) => setDay(d, { breakMins: Number(e.target.value) || 0 })}
                              className="border border-slate-300 rounded-md px-2 py-1 text-sm w-20" />
                            <span className="text-xs text-slate-500">min</span>
                          </div>
                        </Field>
                        <span className={`ml-auto text-xs font-medium ${mins ? 'text-slate-600' : 'text-red-600'}`}>
                          {mins ? fmtHours(mins) : 'End is not after start'}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Weekend</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {editing && invalid.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              <span>
                {invalid.join(', ')} {invalid.length === 1 ? 'has' : 'have'} no usable hours —
                the end time must be after the start, and the break cannot exceed the day.
              </span>
            </p>
          )}
          {error && <p className="text-xs text-red-700">{error}</p>}

          {editing && (
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={save} disabled={saving || working.length === 0 || invalid.length > 0}>
                {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save changes
              </Button>
              <Button variant="outline" onClick={() => { setEditing(false); loadForCountry(config, country) }}>
                <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
              </Button>
              {working.length === 0 && (
                <span className="text-xs text-red-700">At least one working day is required.</span>
              )}
            </div>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, icon: Icon }: {
  label: string; value: string; icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-lg bg-slate-50 p-2"><Icon className="w-4 h-4 text-slate-600" /></div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-lg font-semibold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">{label}</p>
      {children}
    </div>
  )
}
