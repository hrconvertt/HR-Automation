'use client'

/**
 * HR reconciliation list — one row per employee-day where time tracking and
 * leave/attendance disagree. Read-only by design: the "Review day" link goes
 * to the attendance detail page, which owns cell editing.
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { safeFetch } from '@/lib/safe-fetch'

type Conflict = {
  type: 'CLOCKED_IN_ON_LEAVE' | 'LEAVE_NOT_WRITTEN'
  employeeId: string
  fullName: string
  employeeCode: string
  date: string
  detail: string
}

const TYPE_META: Record<Conflict['type'], { label: string; variant: 'warning' | 'destructive' }> = {
  CLOCKED_IN_ON_LEAVE: { label: 'Clocked in on leave', variant: 'destructive' },
  LEAVE_NOT_WRITTEN: { label: 'Leave not on grid', variant: 'warning' },
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ConflictsList() {
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await safeFetch<{ conflicts: Conflict[] }>(`/api/time/conflicts?month=${month}`)
    setConflicts(r.ok && r.data ? r.data.conflicts : [])
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    setMonth(monthKey(new Date(y, m - 1 + delta, 1)))
  }

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const isCurrentMonth = month === monthKey(new Date())

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Time vs Leave Conflicts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Days where clock-ins and approved leave disagree. Fix the cell from the attendance page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[130px] text-center">{monthLabel}</span>
          <button
            onClick={() => shiftMonth(1)}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center text-slate-400 py-10 text-sm">Checking {monthLabel}…</p>
          ) : conflicts.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">No conflicts in {monthLabel}</p>
              <p className="text-xs text-slate-500 mt-1">Time tracking, leave, and attendance all agree.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {conflicts.map((c, i) => {
                const meta = TYPE_META[c.type]
                return (
                  <li key={i} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50/40">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900">{c.fullName}</p>
                        <span className="text-[11px] text-slate-400 font-mono">{c.employeeCode}</span>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        <span className="text-xs text-slate-500">
                          {new Date(c.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{c.detail}</p>
                    </div>
                    <Link
                      href={`/dashboard/attendance/${c.employeeId}`}
                      className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                    >
                      Review day <ExternalLink className="w-3 h-3" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-slate-400">
        Read-only view — correcting a day (e.g. clearing an L cell or logging the missed leave)
        happens on the employee&apos;s attendance page or via the corrections workflow.
      </p>
    </div>
  )
}
