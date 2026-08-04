'use client'

/**
 * Shared leave-list view used by /dashboard/leave/requests + /approved.
 *
 * Shows the weekday alongside each date — a Monday or Friday absence reads very
 * differently from a midweek one, and it is the first thing anyone checks when
 * looking for a pattern. The reason sits on its own line under the employee
 * rather than in a column of its own, so long text can breathe instead of
 * squeezing every other column.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Paperclip, AlertCircle } from 'lucide-react'
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_TONE, formatDays } from '@/lib/leave-types'

type LeaveRow = {
  id: string
  leaveType: string
  fromDate: string
  toDate: string
  days: number
  status: string
  reason: string
  statusLabel?: string
  attachmentName?: string | null
  employee: { fullName: string; employeeCode: string; designation: string | null }
}

interface Props {
  title: string
  subtitle: string
  statuses: string[] // e.g. ['PENDING','PENDING_HR'] or ['APPROVED']
}

/** Marker the attendance backfill leaves on rows nobody has confirmed yet. */
const UNCONFIRMED = 'not yet recorded'

const TYPE_TONE: Record<string, string> = {
  SICK: 'bg-rose-50 text-rose-700 border-rose-200',
  CASUAL: 'bg-sky-50 text-sky-700 border-sky-200',
  ANNUAL: 'bg-violet-50 text-violet-700 border-violet-200',
  UNPAID: 'bg-slate-100 text-slate-600 border-slate-200',
}

const fmt = (iso: string, withYear = false) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  })

export function LeaveList({ title, subtitle, statuses }: Props) {
  const [rows, setRows] = useState<LeaveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all(
      statuses.map((s) =>
        fetch(`/api/leave?status=${encodeURIComponent(s)}`).then((r) =>
          r.ok ? r.json() : { requests: [] },
        ),
      ),
    )
      .then((results) => {
        if (cancelled) return
        const all = results.flatMap((r: { requests?: LeaveRow[] }) => r.requests ?? [])
        const seen = new Set<string>()
        const merged: LeaveRow[] = []
        for (const r of all) {
          if (!seen.has(r.id)) { seen.add(r.id); merged.push(r) }
        }
        merged.sort((a, b) => new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime())
        setRows(merged)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses.join(',')])

  const needsReason = rows.filter((r) => r.reason?.includes(UNCONFIRMED)).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {subtitle}
          {rows.length > 0 && <> · {rows.length} record{rows.length === 1 ? '' : 's'}</>}
        </p>
      </div>

      {needsReason > 0 && (
        <p className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {needsReason} record{needsReason === 1 ? '' : 's'} still need a reason and leave type
          confirming — they were reconstructed from attendance.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {loading && <p className="text-center py-10 text-slate-400 text-sm">Loading…</p>}
          {error && <p className="text-center py-10 text-slate-700 text-sm">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-sm">No requests in this view.</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <Th>Employee &amp; reason</Th>
                    <Th>Type</Th>
                    <Th>Dates</Th>
                    <Th right>Days</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const single = r.fromDate.slice(0, 10) === r.toDate.slice(0, 10)
                    const unconfirmed = r.reason?.includes(UNCONFIRMED)
                    return (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                        <td className="px-4 py-3 max-w-md">
                          <Link
                            href={`/dashboard/leave/${r.id}`}
                            className="font-medium text-slate-900 hover:underline"
                          >
                            {r.employee?.fullName ?? '—'}
                          </Link>
                          <p className="text-xs text-slate-500">{r.employee?.designation ?? ''}</p>
                          {r.reason && (
                            <p className={`text-xs mt-1 ${unconfirmed ? 'text-amber-700 italic' : 'text-slate-600'}`}>
                              {r.reason}
                            </p>
                          )}
                          {r.attachmentName && (
                            <Link
                              href={`/dashboard/leave/${r.id}`}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 mt-1"
                            >
                              <Paperclip className="w-3 h-3" />
                              {r.attachmentName}
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${TYPE_TONE[r.leaveType] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {r.leaveType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {single ? (
                            fmt(r.fromDate, true)
                          ) : (
                            <>
                              {fmt(r.fromDate)}
                              <span className="text-slate-400"> → </span>
                              {fmt(r.toDate, true)}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 text-right whitespace-nowrap">
                          {formatDays(r.days)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={LEAVE_STATUS_TONE[r.status] ?? 'secondary'}>
                            {r.statusLabel ?? LEAVE_STATUS_LABELS[r.status] ?? r.status}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
