'use client'

/**
 * Shared leave-list view used by /dashboard/leave/requests + /approved.
 * Calls GET /api/leave?status=… and renders a simple table with row links
 * to /dashboard/leave/<id>.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  employee: { fullName: string; employeeCode: string; designation: string | null }
}

interface Props {
  title: string
  subtitle: string
  statuses: string[] // e.g. ['PENDING','PENDING_HR'] or ['APPROVED']
}

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
        // Dedupe by id, sort newest first
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading && <p className="text-center py-10 text-slate-400 text-sm">Loading…</p>}
          {error && <p className="text-center py-10 text-slate-700 text-sm">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-sm">No requests in this view.</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Employee</th>
                  <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Type</th>
                  <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Dates</th>
                  <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Days</th>
                  <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/leave/${r.id}`} className="font-medium text-slate-900 hover:underline">
                        {r.employee?.fullName ?? '—'}
                      </Link>
                      <p className="text-xs text-slate-500">{r.employee?.designation ?? ''}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{r.leaveType}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {new Date(r.fromDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} →{' '}
                      {new Date(r.toDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{formatDays(r.days)}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={LEAVE_STATUS_TONE[r.status] ?? 'secondary'}>
                        {r.statusLabel ?? LEAVE_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
