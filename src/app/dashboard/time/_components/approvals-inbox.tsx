'use client'

/**
 * Unified Approvals Inbox — single actionable list for OT + Leave.
 *
 * Manager: their direct reports' OT + Leave (manager stage)
 * HR Admin: company-wide OT + Leave (HR final stage)
 *
 * Each row dispatches to the existing approve/reject endpoints — no new
 * action contracts. Reject opens a reason dialog (shared with Leave admin).
 */

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, Inbox, Clock, Plane, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS } from '@/lib/leave-types'
import { safeFetch } from '@/lib/safe-fetch'

type OTItem = {
  kind: 'OT'
  id: string
  employeeId: string
  fullName: string
  department: string
  date: string
  overtimeHours: number
  hoursWorked: number | null
}
type LeaveItem = {
  kind: 'LEAVE'
  id: string
  employeeId: string
  fullName: string
  department: string
  leaveType: string
  fromDate: string
  toDate: string
  days: number
  reason: string
  stage: 'PENDING' | 'PENDING_HR'
  requesterBalance: { remaining: number; allocated: number; used: number } | null
}

type Filter = 'ALL' | 'OT' | 'LEAVE'

export function ApprovalsInbox({ role }: { role: string }) {
  const [ot, setOT] = useState<OTItem[]>([])
  const [leave, setLeave] = useState<LeaveItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [acting, setActing] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<LeaveItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await safeFetch<{ ot: OTItem[]; leave: LeaveItem[] }>('/api/time/approvals')
    if (r.ok && r.data) {
      setOT(r.data.ot ?? [])
      setLeave(r.data.leave ?? [])
    } else {
      setOT([]); setLeave([])
      // Soft-fail: the empty-state copy below will show "All caught up".
      // For session-expired, the user will see the login redirect on next nav.
      if (!r.sessionExpired) console.warn('[approvals]', r.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function approveOT(item: OTItem) {
    setActing(item.id)
    const r = await safeFetch('/api/attendance/overtime', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceLogId: item.id, overtimeHours: item.overtimeHours, approve: true }),
    })
    setActing(null)
    if (!r.ok) alert(r.error ?? 'Could not approve.')
    fetchData()
  }
  async function rejectOT(item: OTItem) {
    if (!confirm(`Reject ${item.overtimeHours.toFixed(1)}h of OT for ${item.fullName}? They will not be paid for these hours.`)) return
    setActing(item.id)
    const r = await safeFetch('/api/attendance/overtime', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceLogId: item.id, overtimeHours: item.overtimeHours, approve: false }),
    })
    setActing(null)
    if (!r.ok) alert(r.error ?? 'Could not reject.')
    fetchData()
  }
  async function approveLeave(item: LeaveItem) {
    setActing(item.id)
    const r = await safeFetch(`/api/leave/${item.id}/approve`, { method: 'POST' })
    setActing(null)
    if (!r.ok) alert(r.error ?? 'Could not approve.')
    fetchData()
  }
  async function submitReject() {
    if (!rejectTarget || !rejectReason.trim()) return
    setActing(rejectTarget.id)
    const r = await safeFetch(`/api/leave/${rejectTarget.id}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectReason }),
    })
    setActing(null)
    if (!r.ok) { alert(r.error ?? 'Could not reject.'); return }
    setRejectTarget(null)
    setRejectReason('')
    fetchData()
  }

  const all = [...leave, ...ot]
  const visible: Array<OTItem | LeaveItem> =
    filter === 'OT' ? ot :
    filter === 'LEAVE' ? leave :
    all

  const counts = { all: all.length, ot: ot.length, leave: leave.length }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Approvals</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Everything waiting on you — overtime and leave, in one place
        </p>
      </div>

      <div className="bg-white border border-slate-200">
        {/* Workday-blue header */}
        <div className="bg-[#005691] text-white px-4 py-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Inbox className="w-4 h-4" /> My Inbox
          </h2>
          <div className="text-[11px] text-white/90">{counts.all} item{counts.all === 1 ? '' : 's'}</div>
        </div>

        {/* Filter chips */}
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2 text-xs">
          <FilterChip label="All" count={counts.all} active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
          <FilterChip label="Overtime" count={counts.ot} active={filter === 'OT'} onClick={() => setFilter('OT')} icon={<Clock className="w-3 h-3" />} />
          <FilterChip label="Leave" count={counts.leave} active={filter === 'LEAVE'} onClick={() => setFilter('LEAVE')} icon={<Plane className="w-3 h-3" />} />
        </div>

        {/* List */}
        {loading ? (
          <p className="text-center text-slate-400 py-10 text-sm">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">All caught up</p>
            <p className="text-xs text-slate-500 mt-1">
              {filter === 'ALL' ? 'Nothing waiting on you right now.' :
               filter === 'OT' ? 'No overtime requests waiting.' :
               'No leave requests waiting.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="px-4 py-3 hover:bg-blue-50/30">
                {item.kind === 'OT' ? (
                  <OTRow
                    item={item}
                    acting={acting === item.id}
                    onApprove={() => approveOT(item)}
                    onReject={() => rejectOT(item)}
                  />
                ) : (
                  <LeaveRow
                    item={item}
                    role={role}
                    acting={acting === item.id}
                    onApprove={() => approveLeave(item)}
                    onReject={() => setRejectTarget(item)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reject reason dialog (Leave only) */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason('') } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject leave request</DialogTitle></DialogHeader>
          {rejectTarget && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                <strong>{rejectTarget.fullName}</strong> — {LEAVE_TYPE_LABELS[rejectTarget.leaveType] ?? rejectTarget.leaveType}, {rejectTarget.days} day{rejectTarget.days === 1 ? '' : 's'}
              </p>
              <label className="block text-sm font-medium text-slate-700">Reason</label>
              <textarea
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="The employee will see this — be specific."
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason('') }}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim()} onClick={submitReject}>
              {acting ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterChip({ label, count, active, onClick, icon }: {
  label: string; count: number; active: boolean; onClick: () => void; icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ' +
        (active ? 'bg-[#005691] text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200')
      }
    >
      {icon}
      {label}
      <span className={
        'inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full px-1 ' +
        (active ? 'bg-white/20' : 'bg-slate-100')
      }>{count}</span>
    </button>
  )
}

function OTRow({ item, acting, onApprove, onReject }: {
  item: OTItem; acting: boolean; onApprove: () => void; onReject: () => void
}) {
  const date = new Date(item.date)
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">
        OT
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-900">{item.fullName}</p>
          <Badge variant="warning">Overtime</Badge>
          <span className="text-xs text-slate-500">
            {date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            {item.hoursWorked != null && <> · {item.hoursWorked.toFixed(1)}h worked</>}
            {' · '}<strong className="text-amber-700">{item.overtimeHours.toFixed(1)}h OT</strong>
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">{item.department}</p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Button size="sm" onClick={onApprove} disabled={acting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} disabled={acting} className="text-rose-600 border-rose-200 hover:bg-rose-50">
          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
        </Button>
      </div>
    </div>
  )
}

function LeaveRow({ item, role, acting, onApprove, onReject }: {
  item: LeaveItem; role: string; acting: boolean; onApprove: () => void; onReject: () => void
}) {
  const from = new Date(item.fromDate)
  const to = new Date(item.toDate)
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const stageLabel = LEAVE_STATUS_LABELS[item.stage] ?? item.stage
  const isHRSignOff = item.stage === 'PENDING_HR'

  const after = item.requesterBalance ? item.requesterBalance.remaining - item.days : null
  const insufficient = after !== null && after < 0

  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 shrink-0 flex items-center justify-center">
        <Plane className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-900">{item.fullName}</p>
          <Badge variant={isHRSignOff ? 'default' : 'warning'}>{stageLabel}</Badge>
          <Badge variant="secondary">{LEAVE_TYPE_LABELS[item.leaveType] ?? item.leaveType}</Badge>
          <span className="text-xs text-slate-500">
            {fmt(from)} → {fmt(to)} · {item.days} day{item.days === 1 ? '' : 's'}
          </span>
        </div>
        {item.requesterBalance && (
          <p className={'text-[11px] mt-1 flex items-center gap-1.5 ' + (insufficient ? 'text-rose-700 font-medium' : 'text-slate-500')}>
            <Wallet className="w-3 h-3" />
            {insufficient
              ? <>Only <strong>{item.requesterBalance.remaining}</strong> day{item.requesterBalance.remaining === 1 ? '' : 's'} left — would go {Math.abs(after!)} day{Math.abs(after!) === 1 ? '' : 's'} over.</>
              : <>Has <strong>{item.requesterBalance.remaining}</strong> day{item.requesterBalance.remaining === 1 ? '' : 's'} left · {after} after this</>
            }
          </p>
        )}
        {item.reason && <p className="text-xs text-slate-600 mt-1 italic">&quot;{item.reason}&quot;</p>}
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Button size="sm" onClick={onApprove} disabled={acting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} disabled={acting} className="text-rose-600 border-rose-200 hover:bg-rose-50">
          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
        </Button>
      </div>
    </div>
  )
}
