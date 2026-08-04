'use client'

/**
 * Shared list for Leave Requests / Leave Approved and their WFH twins.
 *
 * The reason has its own column now. Tucked under the employee's name it read
 * as a caption on the person rather than a fact about the request, and the two
 * approvals — lead first, HR second — had nowhere to show at all, so an
 * approved row could not say who approved it.
 *
 * The weekday stays visible: a Monday or Friday absence reads very differently
 * from a midweek one, and it is the first thing anyone checks for a pattern.
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Paperclip, AlertCircle, Pencil, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_TONE, formatDays } from '@/lib/leave-types'

type LeaveRow = {
  id: string
  category?: string
  leaveType: string
  fromDate: string
  toDate: string
  days: number
  status: string
  reason: string
  statusLabel?: string
  attachmentName?: string | null
  approvedByLead?: string | null
  approvedByHr?: string | null
  employee: { fullName: string; employeeCode: string; designation: string | null }
}

interface Props {
  title: string
  subtitle: string
  statuses: string[] // e.g. ['PENDING','PENDING_HR'] or ['APPROVED']
  category?: 'LEAVE' | 'WFH'
  /** HR only — lets a record be re-typed and given its reason. */
  canEdit?: boolean
}

/** Marker the attendance backfill leaves on rows nobody has confirmed yet. */
const UNCONFIRMED = 'not yet recorded'

const EDITABLE_TYPES = ['CASUAL', 'SICK', 'UNPAID', 'ANNUAL', 'MATERNITY', 'PATERNITY']

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

export function LeaveList({ title, subtitle, statuses, category = 'LEAVE', canEdit = false }: Props) {
  const [rows, setRows] = useState<LeaveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<LeaveRow | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    return Promise.all(
      statuses.map((s) =>
        fetch(`/api/leave?status=${encodeURIComponent(s)}&category=${category}`).then((r) =>
          r.ok ? r.json() : { requests: [] },
        ),
      ),
    )
      .then((results) => {
        const all = results.flatMap((r: { requests?: LeaveRow[] }) => r.requests ?? [])
        const seen = new Set<string>()
        const merged: LeaveRow[] = []
        for (const r of all) {
          if (!seen.has(r.id)) { seen.add(r.id); merged.push(r) }
        }
        merged.sort((a, b) => new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime())
        setRows(merged)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses.join(','), category])

  useEffect(() => { load() }, [load])

  const needsReason = rows.filter((r) => r.reason?.includes(UNCONFIRMED)).length
  const isWfh = category === 'WFH'

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
          {canEdit && <> Use <strong>Edit</strong> on the row to set them.</>}
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
                    <Th>Employee</Th>
                    <Th>Reason</Th>
                    {!isWfh && <Th>Type</Th>}
                    <Th>Dates</Th>
                    <Th right>Days</Th>
                    <Th>Approved by lead</Th>
                    <Th>Approved by HR</Th>
                    <Th>Status</Th>
                    {canEdit && <Th right>Edit</Th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const single = r.fromDate.slice(0, 10) === r.toDate.slice(0, 10)
                    const unconfirmed = r.reason?.includes(UNCONFIRMED)
                    return (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/leave/${r.id}`}
                            className="font-medium text-slate-900 hover:underline whitespace-nowrap"
                          >
                            {r.employee?.fullName ?? '—'}
                          </Link>
                          <p className="text-xs text-slate-500">{r.employee?.designation ?? ''}</p>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          {r.reason ? (
                            <p className={`text-xs ${unconfirmed ? 'text-amber-700 italic' : 'text-slate-700'}`}>
                              {r.reason}
                            </p>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
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
                        {!isWfh && (
                          <td className="px-4 py-3">
                            <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${TYPE_TONE[r.leaveType] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {r.leaveType}
                            </span>
                          </td>
                        )}
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
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {r.approvedByLead ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {r.approvedByHr ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={LEAVE_STATUS_TONE[r.status] ?? 'secondary'}>
                            {r.statusLabel ?? LEAVE_STATUS_LABELS[r.status] ?? r.status}
                          </Badge>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setEditing(r)}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                              title="Correct the type or fill in the reason"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EditDialog
          row={editing}
          isWfh={isWfh}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

/**
 * The correction most of this history needs.
 *
 * The records rebuilt from attendance know the day someone was away but not
 * why, so they all arrived as Casual with a placeholder. Casual and Sick draw
 * on separate balances — re-typing here moves the charge with it.
 */
function EditDialog({ row, isWfh, onClose, onSaved }: {
  row: LeaveRow
  isWfh: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [leaveType, setLeaveType] = useState(row.leaveType)
  const [reason, setReason] = useState(row.reason?.includes(UNCONFIRMED) ? '' : (row.reason ?? ''))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setErr(null)
    const res = await fetch(`/api/leave/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaveType, reason }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error ?? 'Could not save that.')
      return
    }
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit record — {row.employee?.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {fmt(row.fromDate, true)}
            {row.fromDate.slice(0, 10) !== row.toDate.slice(0, 10) && <> → {fmt(row.toDate, true)}</>}
            {' · '}{formatDays(row.days)}
          </p>

          {!isWfh && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2 bg-white"
              >
                {EDITABLE_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                ))}
              </select>
              {row.status === 'APPROVED' && leaveType !== row.leaveType && (
                <p className="text-[11px] text-amber-700 mt-1">
                  This day is already charged to {row.leaveType.toLowerCase()} — saving moves the
                  charge to {leaveType.toLowerCase()}.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="What the employee gave as the reason"
              className="w-full text-sm rounded-md border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>

          <p className="text-[11px] text-slate-400">
            Dates and day count are not editable here — changing those means rewriting the
            attendance already written for them.
          </p>
          {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
