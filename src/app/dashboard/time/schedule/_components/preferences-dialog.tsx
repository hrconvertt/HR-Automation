'use client'

/**
 * Change My Schedule Preferences — the web version of Workday's form.
 *
 * Position and effective date, available on-call, the voluntary standby list,
 * preferred weekly hours, where, and which days. Workday also asks for a
 * preferred role and location from a list of stores; here everyone has one
 * role and one office, so "where" is office, home or hybrid instead.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toastSuccess, toastError } from '@/components/ui/toaster'

export interface SchedulePrefs {
  weeklyHours: number | null
  location: string | null
  preferredDays: string[]
  onCall: boolean
  standby: boolean
  effectiveFrom: string
  note: string | null
  updatedAt: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WHERE: [string, string][] = [['OFFICE', 'In the office'], ['WFH', 'From home'], ['HYBRID', 'Hybrid']]
const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

export function PreferencesDialog({ open, onClose, initial, designation, todayKey }: {
  open: boolean
  onClose: () => void
  initial: SchedulePrefs | null
  designation: string | null
  todayKey: string
}) {
  const router = useRouter()
  const [effectiveFrom, setEffectiveFrom] = useState(todayKey)
  const [onCall, setOnCall] = useState(false)
  const [standby, setStandby] = useState(false)
  const [weeklyHours, setWeeklyHours] = useState('')
  const [location, setLocation] = useState<string | null>(null)
  const [days, setDays] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Start from what is saved each time the form opens. The reset lands in a
  // microtask rather than straight down the effect body.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setEffectiveFrom(todayKey)
      setOnCall(initial?.onCall ?? false)
      setStandby(initial?.standby ?? false)
      setWeeklyHours(initial?.weeklyHours ? String(initial.weeklyHours) : '')
      setLocation(initial?.location ?? null)
      setDays(initial?.preferredDays ?? [])
      setNote(initial?.note ?? '')
    })
    return () => { cancelled = true }
  }, [open, initial, todayKey])

  async function submit() {
    setSaving(true)
    try {
      const res = await fetch('/api/schedule/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effectiveFrom,
          onCall,
          standby,
          weeklyHours: weeklyHours === '' ? null : Number(weeklyHours),
          location,
          preferredDays: days,
          note,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        toastError('Preferences not saved', d.error ?? null)
        return
      }
      toastSuccess('Preferences saved', 'Whoever plans the week will see them.')
      onClose()
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (d: string) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change my schedule preferences</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Position</p>
              <p className="text-sm text-slate-900 mt-1">{designation ?? '—'}</p>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Effective date</span>
              <input type="date" className={`${inputCls} mt-1`} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </label>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
              <input type="checkbox" checked={onCall} onChange={(e) => setOnCall(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-blue-600" />
              Available on call
            </label>
            <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
              <input type="checkbox" checked={standby} onChange={(e) => setStandby(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-blue-600" />
              Opt in to the voluntary standby list
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-900">Preferred weekly hours</span>
            <input
              type="number"
              min={1}
              max={80}
              className={`${inputCls} mt-1.5 w-40`}
              value={weeklyHours}
              placeholder="e.g. 40"
              onChange={(e) => setWeeklyHours(e.target.value)}
            />
          </label>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Preferred place of work</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {WHERE.map(([key, label]) => (
                <label
                  key={key}
                  className={`relative rounded-lg border px-3 py-2.5 text-sm cursor-pointer text-center ${
                    location === key ? 'border-slate-900 bg-slate-50 font-medium' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="pref-location"
                    checked={location === key}
                    onChange={() => setLocation(key)}
                    className="sr-only"
                  />
                  {label}
                  {location === key && <Check className="w-3.5 h-3.5 absolute top-1.5 right-1.5" />}
                </label>
              ))}
            </div>
            {location && (
              <button type="button" onClick={() => setLocation(null)} className="text-xs text-slate-500 hover:text-slate-900 mt-1.5">
                No preference
              </button>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Preferred days</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={days.includes(d)}
                  className={`w-12 py-1.5 rounded-full border text-xs ${
                    days.includes(d) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-semibold text-slate-900">
              Anything else <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <textarea className={`${inputCls} mt-1.5 min-h-[60px]`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
