'use client'

/**
 * Assign as required learning — HR's side of a Workday learning campaign.
 *
 * Who it goes to (everyone, one department, or people you pick), how long
 * they have, and an optional line added to the notification. Pressing Send
 * marks it required on each person's record with the due date, and notifies
 * them. Anyone who has already completed the course is left alone.
 */

import { useMemo, useState } from 'react'
import { Loader2, Users, Building2, UserCheck, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toastSuccess, toastError } from '@/components/ui/toaster'

export interface AssignOptions {
  departments: { id: string; name: string; people: number }[]
  staff: { id: string; fullName: string; employeeCode: string; department: string | null }[]
}

type Audience = 'ALL' | 'DEPARTMENT' | 'EMPLOYEES'
const PRESETS = [7, 14, 30, 60, 90]
const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

export function AssignDialog({ programId, programTitle, open, onClose, options }: {
  programId: string
  programTitle: string
  open: boolean
  onClose: () => void
  options: AssignOptions
}) {
  const [audience, setAudience] = useState<Audience>('ALL')
  const [departmentId, setDepartmentId] = useState(options.departments[0]?.id ?? '')
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [dueDays, setDueDays] = useState(60)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.staff
    return options.staff.filter((s) =>
      [s.fullName, s.employeeCode, s.department].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [options.staff, query])

  const pickedSet = new Set(picked)
  const reach =
    audience === 'ALL' ? options.staff.length
      : audience === 'DEPARTMENT' ? options.departments.find((d) => d.id === departmentId)?.people ?? 0
        : picked.length
  const valid = reach > 0 && dueDays >= 1 && dueDays <= 365

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function send() {
    setSending(true)
    try {
      const res = await fetch(`/api/learning/programs/${programId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience,
          departmentId: audience === 'DEPARTMENT' ? departmentId : undefined,
          employeeIds: audience === 'EMPLOYEES' ? picked : undefined,
          dueDays,
          note,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        toastError('Not sent', d.error ?? null)
        return
      }
      toastSuccess(
        `Sent to ${d.assigned} ${d.assigned === 1 ? 'person' : 'people'}`,
        d.alreadyDone
          ? `${d.alreadyDone} had already completed it and were left alone.`
          : `Due ${new Date(`${d.dueDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}.`,
      )
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign as required learning</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-2 truncate">{programTitle}</p>

        <div className="space-y-4">
          {/* Who */}
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Who it goes to</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {([
                ['ALL', 'Everyone', Users],
                ['DEPARTMENT', 'A department', Building2],
                ['EMPLOYEES', 'People I pick', UserCheck],
              ] as const).map(([key, label, Icon]) => (
                <label
                  key={key}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 cursor-pointer text-center ${
                    audience === key ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input type="radio" name="assign-audience" checked={audience === key} onChange={() => setAudience(key)} className="sr-only" />
                  <Icon className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-medium text-slate-800">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {audience === 'DEPARTMENT' && (
            <select className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Department">
              {options.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.people})</option>
              ))}
            </select>
          )}

          {audience === 'EMPLOYEES' && (
            <div className="rounded-lg border border-slate-200">
              <label className="relative block border-b border-slate-100">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people"
                  aria-label="Search people"
                  className="w-full text-sm pl-8 pr-3 py-2 rounded-t-lg focus:outline-none"
                />
              </label>
              <ul className="max-h-52 overflow-y-auto divide-y divide-slate-50">
                {shown.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={pickedSet.has(s.id)} onChange={() => toggle(s.id)} className="rounded border-slate-300" />
                      <span className="flex-1 min-w-0 truncate text-slate-800">{s.fullName}</span>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">{s.department ?? s.employeeCode}</span>
                    </label>
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-4 text-xs text-slate-400 text-center">Nobody matches that.</li>}
              </ul>
              <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">{picked.length} picked</p>
            </div>
          )}

          {/* When */}
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Complete within</legend>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDueDays(n)}
                  aria-pressed={dueDays === n}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    dueDays === n ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {n} days
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={365}
                value={dueDays}
                onChange={(e) => setDueDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                aria-label="Days to complete"
                className="w-20 px-2 py-1.5 rounded-md border border-slate-300 text-xs"
              />
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Message <span className="font-normal text-slate-400">(optional — added to the notification)</span>
            </span>
            <textarea className={`${inputCls} mt-1 min-h-[60px]`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        <DialogFooter className="items-center">
          <span className="text-xs text-slate-500 mr-auto">
            {reach} {reach === 1 ? 'person' : 'people'} · anyone who has finished it is skipped
          </span>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending || !valid} className="gap-1.5">
            {sending && <Loader2 className="w-4 h-4 animate-spin" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
