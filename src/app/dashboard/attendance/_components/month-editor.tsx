'use client'

/**
 * MonthEditorDrawer — per-employee month bulk editor (HR-only).
 *
 * Opens from a click on an employee's NAME in the grid. Shows every day of the
 * selected month as a compact control:
 *   - Working days: a segmented P / WFH / L / HD control (click to set)
 *   - Weekends + public holidays: LOCKED, muted, labelled WE / HOL
 *   - Pre-join / post-exit days: LOCKED, muted
 * A live P/WFH/L/HD mini-summary tracks edits; changed days are highlighted.
 * "Fill remaining working days with P" one-clicks every still-unmarked working
 * day. "Save all" writes every changed day in ONE request; "Cancel"/"Reset"
 * discard. If the month's payroll is PAID, the drawer opens read-only.
 *
 * Monochrome slate only — no chromatic tokens.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Loader2, Lock } from 'lucide-react'
import type { Status } from '@/components/attendance/status-badge'

type EditStatus = 'PRESENT' | 'WFH' | 'LEAVE' | 'HALF_DAY'

interface EditorDay {
  day: number
  iso: string
  status: Status
  isWeekend: boolean
  isHoliday: boolean
  isFuture: boolean
  preJoin: boolean
  afterExit: boolean
  editable: boolean
  leaveDriven: boolean
}

interface EditorPayload {
  employee: { id: string; fullName: string }
  month: string
  monthLabel: string
  daysInMonth: number
  today: string
  locked: boolean
  days: EditorDay[]
}

const CYCLE: { value: EditStatus; label: string }[] = [
  { value: 'PRESENT', label: 'P' },
  { value: 'WFH', label: 'WFH' },
  { value: 'LEAVE', label: 'L' },
  { value: 'HALF_DAY', label: 'HD' },
]

/** Map an editor status → the grid badge status for the live summary. */
const STATUS_TO_BADGE: Record<EditStatus, Status> = {
  PRESENT: 'P', WFH: 'WFH', LEAVE: 'L', HALF_DAY: 'H',
}

/** Map a derived grid status → an editor status, when it's an editable value. */
function badgeToEdit(s: Status): EditStatus | null {
  if (s === 'P') return 'PRESENT'
  if (s === 'WFH') return 'WFH'
  if (s === 'L') return 'LEAVE'
  if (s === 'H') return 'HALF_DAY'
  return null // A / WE / HO / LOA — no baseline editable value
}

export function MonthEditorDrawer({
  employeeId,
  employeeName,
  month,
  onClose,
  onSaved,
}: {
  employeeId: string
  employeeName: string
  month: string
  onClose: () => void
  /** Called after a successful save so the grid can refetch. */
  onSaved: () => void
}) {
  const [data, setData] = useState<EditorPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // day number → chosen editable status (only holds user edits)
  const [edits, setEdits] = useState<Record<number, EditStatus>>({})

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/attendance/${employeeId}/bulk-month?month=${month}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load')
      setData(await res.json())
      setEdits({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [employeeId, month])

  useEffect(() => { load() }, [load])

  /** Effective status for a day: user edit → else baseline derived status. */
  const effectiveEdit = useCallback(
    (d: EditorDay): EditStatus | null => edits[d.day] ?? badgeToEdit(d.status),
    [edits],
  )

  const setDay = useCallback((day: number, value: EditStatus) => {
    setEdits((prev) => ({ ...prev, [day]: value }))
  }, [])

  const workingDays = useMemo(
    () => (data?.days ?? []).filter((d) => d.editable),
    [data],
  )

  const dirtyDays = useMemo(() => {
    if (!data) return []
    return data.days.filter((d) => {
      const e = edits[d.day]
      return e !== undefined && e !== badgeToEdit(d.status)
    })
  }, [data, edits])

  const summary = useMemo(() => {
    const t = { P: 0, WFH: 0, L: 0, H: 0, unmarked: 0 }
    for (const d of workingDays) {
      const eff = effectiveEdit(d)
      if (!eff) { t.unmarked++; continue }
      const b = STATUS_TO_BADGE[eff]
      if (b === 'P') t.P++
      else if (b === 'WFH') t.WFH++
      else if (b === 'L') t.L++
      else if (b === 'H') t.H++
    }
    return t
  }, [workingDays, effectiveEdit])

  const readOnly = !!data?.locked

  function fillRemaining() {
    if (readOnly) return
    setEdits((prev) => {
      const next = { ...prev }
      for (const d of workingDays) {
        const eff = prev[d.day] ?? badgeToEdit(d.status)
        if (!eff) next[d.day] = 'PRESENT' // only unmarked working days
      }
      return next
    })
  }

  async function save() {
    if (!data || readOnly || dirtyDays.length === 0) return
    setSaving(true)
    setError(null)
    const [year, mon] = data.month.split('-').map(Number)
    try {
      const res = await fetch(`/api/attendance/${employeeId}/bulk-month`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month: mon,
          days: dirtyDays.map((d) => ({ day: d.day, status: edits[d.day] })),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed')
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  const stats: { label: string; value: number }[] = [
    { label: 'P', value: summary.P },
    { label: 'WFH', value: summary.WFH },
    { label: 'L', value: summary.L },
    { label: 'HD', value: summary.H },
    { label: 'Unmarked', value: summary.unmarked },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Month attendance editor">
      {/* Backdrop */}
      <button
        aria-label="Close editor"
        onClick={() => !saving && onClose()}
        className="absolute inset-0 bg-slate-900/30 animate-[fadeIn_150ms_ease-out]"
      />
      {/* Panel — full-screen on mobile, side drawer on larger viewports */}
      <div className="relative h-full w-full sm:max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-[slideIn_200ms_ease-out]">
        <style>{`
          @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 truncate">{employeeName}</h2>
            <p className="text-xs text-slate-500">{data?.monthLabel ?? month}</p>
          </div>
          <button onClick={() => !saving && onClose()} className="text-slate-400 hover:text-slate-700 p-1 -mr-1 rounded shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live summary */}
        {data && !loading && (
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 shrink-0 overflow-x-auto">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center px-2 py-1 rounded-md bg-white border border-slate-200 min-w-[52px]">
                <span className="text-sm font-semibold text-slate-900 leading-none">{s.value}</span>
                <span className="text-[10px] text-slate-500 mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {readOnly && (
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs text-slate-700 shrink-0">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            This month&rsquo;s payroll is closed — attendance is read-only.
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading month…
            </div>
          )}
          {error && !loading && (
            <div className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-md px-3 py-2 mb-3">{error}</div>
          )}
          {data && !loading && (
            <ul className="space-y-1">
              {data.days.map((d) => {
                const eff = effectiveEdit(d)
                const isDirty = edits[d.day] !== undefined && edits[d.day] !== badgeToEdit(d.status)
                const lockLabel = d.isWeekend ? 'WE'
                  : d.isHoliday ? 'HOL'
                  : d.preJoin ? 'Pre-join'
                  : d.afterExit ? 'Post-exit'
                  : d.isFuture ? '—'
                  : d.leaveDriven ? (d.status === 'LOA' ? 'LOA' : d.status === 'H' ? 'HD' : 'Leave')
                  : '—'
                const dow = new Date(d.iso).toLocaleDateString('en-US', { weekday: 'short' })
                const canEdit = d.editable && !readOnly
                return (
                  <li
                    key={d.day}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 border ${
                      isDirty ? 'border-slate-900 bg-slate-50' : 'border-transparent'
                    } ${!canEdit ? 'opacity-60' : ''}`}
                  >
                    <div className="w-14 shrink-0">
                      <div className="text-xs font-semibold text-slate-900 leading-none">{dow} {d.day}</div>
                    </div>
                    {canEdit ? (
                      <div className="flex-1 inline-flex rounded-md border border-slate-200 overflow-hidden">
                        {CYCLE.map((c) => {
                          const active = eff === c.value
                          return (
                            <button
                              key={c.value}
                              onClick={() => setDay(d.day, c.value)}
                              className={`flex-1 px-1.5 py-1 text-[11px] font-semibold transition ${
                                active
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-white text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {c.label}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex-1 text-[11px] font-medium text-slate-400 pl-1 inline-flex items-center gap-1">
                        {!d.isFuture && <Lock className="w-3 h-3" />} {lockLabel}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer / toolbar */}
        {data && !loading && !readOnly && (
          <div className="border-t border-slate-200 px-4 py-3 shrink-0 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={fillRemaining}
                disabled={saving}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
              >
                Fill remaining with P
              </button>
              <button
                onClick={() => setEdits({})}
                disabled={saving || dirtyDays.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md transition disabled:opacity-40"
              >
                Reset
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => !saving && onClose()}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || dirtyDays.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Saving…' : dirtyDays.length > 0 ? `Save all (${dirtyDays.length})` : 'Save all'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
