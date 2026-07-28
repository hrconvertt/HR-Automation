'use client'

/**
 * Job Changes — client renderer. Server page gates to HR_ADMIN + MANAGER.
 *
 * Tabs: Pending / Approved / Enacted / All. Row actions depend on role +
 * status (all re-checked server-side):
 *   - HR on PENDING_APPROVAL  → Approve (optional note) / Reject (comment required)
 *   - HR on APPROVED, due     → Enact now (confirm dialog)
 *   - Requester or HR pending → Cancel
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toaster'
import { formatDate } from '@/lib/utils'
import { TrendingUp, Plus, ArrowRight } from 'lucide-react'
import JobChangeDialog from '@/components/job-change-dialog'

export interface JobChangeRow {
  id: string
  changeType: string
  changeTypeLabel: string
  effectiveDate: string
  status: string
  reason: string | null
  decisionNote: string | null
  requestedById: string
  requestedByName: string
  enactedAt: string | null
  createdAt: string
  employee: {
    id: string
    fullName: string
    employeeCode: string
    designation: string
    departmentName: string | null
  }
  fromDesignation: string | null
  toDesignation: string | null
  fromDepartmentName: string | null
  toDepartmentName: string | null
  fromManagerName: string | null
  toManagerName: string | null
  letterUrl: string | null
}

const TABS = [
  { key: 'PENDING_APPROVAL', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'ENACTED', label: 'Enacted' },
  { key: 'ALL', label: 'All' },
] as const

const STATUS_CHIP: Record<string, string> = {
  PENDING_APPROVAL: 'bg-slate-100 text-slate-700 border border-slate-200',
  APPROVED: 'bg-slate-900 text-white',
  ENACTED: 'bg-white text-slate-900 border border-slate-900',
  REJECTED: 'bg-slate-50 text-slate-400 border border-slate-200 line-through',
  CANCELLED: 'bg-slate-50 text-slate-400 border border-slate-200',
}

function statusLabel(s: string) {
  return s === 'PENDING_APPROVAL' ? 'Pending' : s.charAt(0) + s.slice(1).toLowerCase()
}

/** "Designer → Senior Designer · Dept: BD → MDT" summary of a change. */
export function changeSummary(r: JobChangeRow): string {
  const parts: string[] = []
  if (r.toDesignation) parts.push(`${r.fromDesignation ?? '—'} → ${r.toDesignation}`)
  if (r.toDepartmentName) parts.push(`Dept: ${r.fromDepartmentName ?? '—'} → ${r.toDepartmentName}`)
  if (r.toManagerName) parts.push(`Manager: ${r.fromManagerName ?? '—'} → ${r.toManagerName}`)
  return parts.join(' · ') || '—'
}

export function JobChangesClient({
  viewerRole,
  viewerUserId,
  isPreviewMode,
}: {
  viewerRole: string
  viewerUserId: string
  isPreviewMode: boolean
}) {
  const [rows, setRows] = useState<JobChangeRow[] | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('PENDING_APPROVAL')
  const [newOpen, setNewOpen] = useState(false)
  // Action dialogs
  const [approveRow, setApproveRow] = useState<JobChangeRow | null>(null)
  const [rejectRow, setRejectRow] = useState<JobChangeRow | null>(null)
  const [enactRow, setEnactRow] = useState<JobChangeRow | null>(null)
  const [cancelRow, setCancelRow] = useState<JobChangeRow | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const isHR = viewerRole === 'HR_ADMIN'
  const canWrite = !isPreviewMode

  const load = useCallback(() => {
    fetch('/api/job-changes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setRows(d.jobChanges ?? []))
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    if (!rows) return []
    if (tab === 'ALL') return rows
    return rows.filter((r) => r.status === tab)
  }, [rows, tab])

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows?.length ?? 0 }
    for (const t of TABS) if (t.key !== 'ALL') c[t.key] = rows?.filter((r) => r.status === t.key).length ?? 0
    return c
  }, [rows])

  async function act(url: string, body: Record<string, unknown>, success: string) {
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'Action failed', description: data.error ?? 'Unknown error', variant: 'destructive' })
        return false
      }
      toast({ title: success })
      load()
      return true
    } finally {
      setBusy(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <TrendingUp className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Job Changes</h1>
            <p className="text-white/85 mt-1 text-sm">
              Promotions, transfers, manager changes and retitles — requested, approved, then enacted on the effective date.
            </p>
          </div>
          {canWrite && (
            <Button
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={() => setNewOpen(true)}
            >
              <Plus className="w-4 h-4" /> New Job Change
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-lg px-2 py-2 flex items-center gap-1 text-sm overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap ${
              tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-white/70' : 'text-slate-400'}`}>
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {rows === null ? (
        <Card><CardContent className="py-10 text-center text-slate-400">Loading…</CardContent></Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-slate-500">
              {tab === 'PENDING_APPROVAL' ? 'No job changes waiting for approval.' : 'No job changes here yet.'}
            </p>
            {canWrite && (
              <Button variant="outline" className="mt-4" onClick={() => setNewOpen(true)}>
                <Plus className="w-4 h-4" /> New Job Change
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Change</th>
                  <th className="px-4 py-3 font-medium">Effective</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => {
                  const due = r.effectiveDate.slice(0, 10) <= today
                  const canApprove = isHR && canWrite && r.status === 'PENDING_APPROVAL'
                  const canEnact = isHR && canWrite && r.status === 'APPROVED' && due
                  const canCancel =
                    canWrite && r.status === 'PENDING_APPROVAL' && (isHR || r.requestedById === viewerUserId)
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/employees/${r.employee.id}`} className="font-medium text-slate-900 hover:underline">
                          {r.employee.fullName}
                        </Link>
                        <p className="text-xs text-slate-400 font-mono">{r.employee.employeeCode}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{r.changeTypeLabel}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs">
                        <span className="inline-flex items-center gap-1 flex-wrap">{changeSummary(r)}</span>
                        {r.reason && <p className="text-xs text-slate-400 mt-0.5 truncate" title={r.reason}>{r.reason}</p>}
                        {r.decisionNote && (
                          <p className="text-xs text-slate-500 mt-0.5 italic" title={r.decisionNote}>
                            HR: {r.decisionNote}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {formatDate(r.effectiveDate)}
                        {r.status === 'APPROVED' && !due && (
                          <p className="text-xs text-slate-400">upcoming</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CHIP[r.status] ?? 'bg-slate-100 text-slate-700'}`}>
                          {statusLabel(r.status)}
                        </span>
                        {r.letterUrl && (
                          <a href={r.letterUrl} target="_blank" rel="noreferrer" className="block text-xs text-slate-600 hover:underline mt-1">
                            Promotion letter →
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.requestedByName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {canApprove && (
                            <>
                              <Button size="sm" onClick={() => { setNote(''); setApproveRow(r) }}>Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => { setNote(''); setRejectRow(r) }}>Reject</Button>
                            </>
                          )}
                          {canEnact && (
                            <Button size="sm" onClick={() => setEnactRow(r)}>Enact now</Button>
                          )}
                          {canCancel && (
                            <Button size="sm" variant="ghost" onClick={() => setCancelRow(r)}>Cancel</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New job change */}
      <JobChangeDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={load} />

      {/* Approve */}
      <Dialog open={!!approveRow} onOpenChange={(o) => { if (!o) setApproveRow(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve job change</DialogTitle>
            <DialogDescription>
              {approveRow && (
                <>Approve the {approveRow.changeTypeLabel.toLowerCase()} for {approveRow.employee.fullName} ({changeSummary(approveRow)}), effective {formatDate(approveRow.effectiveDate)}. HR enacts it on or after that date.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <label className="block text-xs font-medium text-slate-600 mb-1">Note (optional)</label>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[60px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any approval note…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveRow(null)} disabled={busy}>Back</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!approveRow) return
                const ok = await act(`/api/job-changes/${approveRow.id}/approve`, { decisionNote: note }, 'Job change approved')
                if (ok) setApproveRow(null)
              }}
            >
              {busy ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject — comment required */}
      <Dialog open={!!rejectRow} onOpenChange={(o) => { if (!o) setRejectRow(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject job change</DialogTitle>
            <DialogDescription>
              {rejectRow && (
                <>Reject the {rejectRow.changeTypeLabel.toLowerCase()} for {rejectRow.employee.fullName}. A reason is required — the requester will see it.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Rejection reason <span className="text-slate-400">(required)</span>
          </label>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[70px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this being rejected?"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectRow(null)} disabled={busy}>Back</Button>
            <Button
              variant="destructive"
              disabled={busy || !note.trim()}
              onClick={async () => {
                if (!rejectRow) return
                const ok = await act(`/api/job-changes/${rejectRow.id}/reject`, { decisionNote: note.trim() }, 'Job change rejected')
                if (ok) setRejectRow(null)
              }}
            >
              {busy ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enact — confirm what will be applied */}
      <Dialog open={!!enactRow} onOpenChange={(o) => { if (!o) setEnactRow(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enact job change</DialogTitle>
            <DialogDescription>
              This applies the change to the employee record immediately.
            </DialogDescription>
          </DialogHeader>
          {enactRow && (
            <div className="text-sm text-slate-700 space-y-2">
              <p className="font-medium text-slate-900">
                {enactRow.employee.fullName} — {enactRow.changeTypeLabel}
              </p>
              <ul className="space-y-1">
                {enactRow.toDesignation && (
                  <li className="flex items-center gap-2">
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    Designation: {enactRow.fromDesignation ?? '—'} → <span className="font-medium">{enactRow.toDesignation}</span>
                  </li>
                )}
                {enactRow.toDepartmentName && (
                  <li className="flex items-center gap-2">
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    Department: {enactRow.fromDepartmentName ?? '—'} → <span className="font-medium">{enactRow.toDepartmentName}</span>
                  </li>
                )}
                {enactRow.toManagerName && (
                  <li className="flex items-center gap-2">
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    Manager: {enactRow.fromManagerName ?? '—'} → <span className="font-medium">{enactRow.toManagerName}</span>
                  </li>
                )}
              </ul>
              <p className="text-xs text-slate-500">
                A role-history entry is recorded and the employee is notified{enactRow.changeType === 'PROMOTION' ? '; a promotion letter is generated' : ''}.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnactRow(null)} disabled={busy}>Back</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!enactRow) return
                const ok = await act(`/api/job-changes/${enactRow.id}/enact`, {}, 'Job change enacted')
                if (ok) setEnactRow(null)
              }}
            >
              {busy ? 'Enacting…' : 'Enact now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel */}
      <Dialog open={!!cancelRow} onOpenChange={(o) => { if (!o) setCancelRow(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel job change</DialogTitle>
            <DialogDescription>
              {cancelRow && (
                <>Withdraw the pending {cancelRow.changeTypeLabel.toLowerCase()} request for {cancelRow.employee.fullName}? This cannot be undone.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelRow(null)} disabled={busy}>Keep it</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!cancelRow) return
                const ok = await act(`/api/job-changes/${cancelRow.id}/cancel`, {}, 'Job change cancelled')
                if (ok) setCancelRow(null)
              }}
            >
              {busy ? 'Cancelling…' : 'Cancel request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
