'use client'

/**
 * Working Days & Hours.
 *
 * Was seven day-pills and a save button, which could not express what the
 * company actually runs: a shorter Friday, a lunch break, or the holidays the
 * nav has always promised under "Schedule + holidays". The Holiday model and
 * its API already existed and were simply never wired to a screen.
 *
 * Per-day hours are stored under a `workDayHours` config key alongside the
 * existing `workingDays`, so no schema changes and the old key keeps its
 * meaning for everything already reading it.
 */

import { useState, useEffect, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CalendarDays, Clock, Plus, Trash2, Loader2, Check, AlertTriangle } from 'lucide-react'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
type Day = (typeof DAYS)[number]

interface DayHours { start: string; end: string; breakMins: number }
const DEFAULT_HOURS: DayHours = { start: '10:00', end: '19:00', breakMins: 60 }

interface Holiday { id: string; name: string; date: string; type: string }

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

export default function WorkingDaysSettingsPage() {
  const [working, setWorking] = useState<Day[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
  const [hours, setHours] = useState<Record<string, DayHours>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [hName, setHName] = useState('')
  const [hDate, setHDate] = useState('')
  const [hType, setHType] = useState('PUBLIC')
  const [addingHoliday, setAddingHoliday] = useState(false)

  const year = new Date().getFullYear()

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()).catch(() => ({})),
      fetch(`/api/holidays?year=${year}`).then((r) => r.json()).catch(() => ({ holidays: [] })),
    ]).then(([s, h]) => {
      try {
        const wd = s?.config?.workingDays
        if (wd) {
          const parsed = typeof wd === 'string' ? JSON.parse(wd) : wd
          if (Array.isArray(parsed) && parsed.length) setWorking(parsed as Day[])
        }
        const wh = s?.config?.workDayHours
        if (wh) setHours(typeof wh === 'string' ? JSON.parse(wh) : wh)
      } catch { /* fall back to defaults */ }
      setHolidays(Array.isArray(h?.holidays) ? h.holidays : [])
      setLoading(false)
    })
  }, [year])

  const hoursFor = (d: Day): DayHours => hours[d] ?? DEFAULT_HOURS
  const setDay = (d: Day, patch: Partial<DayHours>) =>
    setHours((p) => ({ ...p, [d]: { ...hoursFor(d), ...patch } }))

  const weekly = useMemo(
    () => working.reduce((sum, d) => sum + dayMinutes(hours[d] ?? DEFAULT_HOURS), 0),
    [working, hours],
  )
  const invalid = working.filter((d) => dayMinutes(hours[d] ?? DEFAULT_HOURS) === 0)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workingDays: working,
        workDayHours: Object.fromEntries(working.map((d) => [d, hoursFor(d)])),
      }),
    })
    setSaving(false)
    if (!res.ok) { setError('Could not save. Try again.'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function addHoliday() {
    if (!hName.trim() || !hDate) return
    setAddingHoliday(true)
    setError(null)
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: hName.trim(), date: hDate, type: hType }),
    })
    setAddingHoliday(false)
    if (!res.ok) { setError('Could not add that holiday.'); return }
    setHName(''); setHDate('')
    const h = await fetch(`/api/holidays?year=${year}`).then((r) => r.json()).catch(() => null)
    if (h?.holidays) setHolidays(h.holidays)
  }

  async function removeHoliday(id: string) {
    setHolidays((p) => p.filter((x) => x.id !== id))
    await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading…</div>

  return (
    <div className="space-y-4">
      {/* Computed rather than typed, so the summary cannot drift from the
          schedule below it. */}
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
        <CardHeader><CardTitle>Working week</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">
            Switch a day on to make it a working day, then set its hours. Days left off are
            treated as weekends by attendance and payroll.
          </p>

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

          {invalid.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              <span>
                {invalid.join(', ')} {invalid.length === 1 ? 'has' : 'have'} no usable hours —
                the end time must be after the start, and the break cannot exceed the day.
              </span>
            </p>
          )}
          {error && <p className="text-xs text-red-700">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={save} disabled={saving || working.length === 0 || invalid.length > 0}>
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Save changes
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            {working.length === 0 && (
              <span className="text-xs text-red-700">At least one working day is required.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Holidays — {year}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">
            Company-wide closures. Attendance treats these like weekends, so nobody is marked
            absent and payroll does not deduct.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Name">
              <input value={hName} onChange={(e) => setHName(e.target.value)}
                placeholder="e.g. Independence Day"
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-56" />
            </Field>
            <Field label="Date">
              <input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Type">
              <select value={hType} onChange={(e) => setHType(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
                <option value="PUBLIC">Public</option>
                <option value="COMPANY">Company</option>
                <option value="OPTIONAL">Optional</option>
              </select>
            </Field>
            <Button onClick={addHoliday} disabled={addingHoliday || !hName.trim() || !hDate} size="sm">
              {addingHoliday
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Plus className="w-3.5 h-3.5 mr-1.5" />}
              Add
            </Button>
          </div>

          {holidays.length === 0 ? (
            <p className="text-sm text-slate-400 py-5 text-center border border-dashed border-slate-200 rounded-lg">
              No holidays set for {year}. Every working day counts as expected until you add some.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="text-sm text-slate-900 font-medium min-w-0 flex-1 truncate">{h.name}</span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {new Date(h.date).toLocaleDateString('en-GB', {
                      weekday: 'short', day: '2-digit', month: 'short',
                    })}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {h.type}
                  </span>
                  <button onClick={() => removeHoliday(h.id)} aria-label={`Remove ${h.name}`}
                    className="text-slate-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
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
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-slate-500">{label}</span>
      {children}
    </label>
  )
}
