'use client'

/**
 * HR review queue for attendance correction requests.
 * Approve applies the change to the attendance grid; Reject requires a comment.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, X, Inbox } from 'lucide-react'
import { StatusBadge, type Status } from '@/components/attendance/status-badge'
import { getInitials } from '@/lib/utils'

export interface CorrectionRow {
  id: string
  employeeId: string
  employeeName: string
  department: string
  date: string
  currentStatus: string
  requestedStatus: string
  reason: string
  status: string
  reviewComment: string | null
  createdAt: string
}

const REQUESTED_LABEL: Record<string, string> = {
  PRESENT: 'Present',
  WFH: 'Work From Home',
  LEAVE: 'Leave (Full Day)',
  HALF_DAY: 'Half Day',
}
const REQUESTED_BADGE: Record<string, Status> = {
  PRESENT: 'P',
  WFH: 'WFH',
  LEAVE: 'L',
  HALF_DAY: 'H',
}
const GRID_STATUSES: Status[] = ['P', 'WFH', 'L', 'H', 'A', 'WE']

function CurrentBadge({ code }: { code: string }) {
  if (GRID_STATUSES.includes(code as Status)) return <StatusBadge status={code as Status} />
  return <span className="text-xs text-slate-500">{code}</span>
}

export function CorrectionsQueue({ initial }: { initial: CorrectionRow[] }) {
  const [rows, setRows] = useState<CorrectionRow[]>(initial)
  const [tab, setTab] = useState<'PENDING' | 'REVIEWED'>('PENDING')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<CorrectionRow | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pending = useMemo(() => rows.filter((r) => r.status === 'PENDING'), [rows])
  const reviewed = useMemo(() => rows.filter((r) => r.status !== 'PENDING'), [rows])
  const visible = tab === 'PENDING' ? pending : reviewed

  async function review(row: CorrectionRow, action: 'APPROVE' | 'REJECT', comment?: string) {
    setBusyId(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/attendance/corrections/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Review failed')
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED', reviewComment: comment ?? r.reviewComment }
            : r,
        ),
      )
      setRejecting(null)
      setRejectComment('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/dashboard/attendance"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back to grid
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Attendance Corrections</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Employee-requested fixes to their own attendance days. Approving updates the grid and notifies the employee.
          </p>
        </div>
      </div>

      <div className="inline-flex bg-slate-100 p-1 rounded-lg">
        {(['PENDING', 'REVIEWED'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t === 'PENDING' ? `Pending (${pending.length})` : `Reviewed (${reviewed.length})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-md px-3 py-2">{error}</div>
      )}

      {visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
          <Inbox className="w-6 h-6 mx-auto mb-2 text-slate-300" />
          {tab === 'PENDING' ? 'No pending correction requests.' : 'No reviewed requests yet.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Employee</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Day</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Change</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Reason</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    {tab === 'PENDING' ? 'Actions' : 'Outcome'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {getInitials(r.employeeName)}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/attendance/${r.employeeId}`}
                            className="font-medium text-slate-900 hover:underline"
                          >
                            {r.employeeName}
                          </Link>
                          <div className="text-[11px] text-slate-500">{r.department}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{r.date}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <CurrentBadge code={r.currentStatus} />
                        <span className="text-slate-400">→</span>
                        {REQUESTED_BADGE[r.requestedStatus] ? (
                          <StatusBadge status={REQUESTED_BADGE[r.requestedStatus]} />
                        ) : null}
                        <span className="text-xs text-slate-600">
                          {REQUESTED_LABEL[r.requestedStatus] ?? r.requestedStatus}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 max-w-[320px]">
                      <span className="line-clamp-3">{r.reason}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.status === 'PENDING' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => review(r, 'APPROVE')}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-50 rounded-md"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => {
                              setRejecting(r)
                              setRejectComment('')
                            }}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-md"
                          >
                            <X className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs">
                          <span
                            className={`px-1.5 py-0.5 rounded font-semibold ${
                              r.status === 'APPROVED' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.status}
                          </span>
                          {r.reviewComment && (
                            <div className="text-slate-500 mt-1 max-w-[220px] truncate" title={r.reviewComment}>
                              {r.reviewComment}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject modal — a comment is required */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setRejecting(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-sm p-4"
            role="dialog"
            aria-label="Reject correction request"
          >
            <h3 className="text-sm font-semibold text-slate-900">Reject correction</h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">
              {rejecting.employeeName} · {rejecting.date} — the comment below is sent to the employee.
            </p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Why is this request being rejected? (required)"
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRejecting(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={() => review(rejecting, 'REJECT', rejectComment.trim())}
                disabled={!rejectComment.trim() || busyId === rejecting.id}
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 rounded-md"
              >
                {busyId === rejecting.id ? 'Rejecting…' : 'Reject request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
