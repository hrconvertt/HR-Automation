'use client'

/**
 * Manager "Team Leave" view.
 *
 *   ┌── My own balances + Request Leave (compact) ──┐
 *   ┌── Pending approvals inbox (actionable) ──────┐
 *   ┌── Team calendar — who's off when ────────────┐
 *   ┌── Recent team requests (history) ────────────┐
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { cachedFetch } from '@/lib/client-cache'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import {
  Calendar, CheckCircle2, XCircle, Clock, Inbox, Plus, Wallet,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { SUBMITTABLE_LEAVE_TYPES, LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, formatDays } from '@/lib/leave-types'

type Request = {
  id: string
  leaveType: string
  fromDate: string
  toDate: string
  days: number
  status: string
  reason: string
  employee: { fullName: string; employeeCode: string }
  employeeId: string
  /** Only present on PENDING rows — the requester's current balance for this leaveType */
  requesterBalance?: { remaining: number; allocated: number; used: number } | null
}

type Balance = {
  id: string
  balance: number
  used: number
  leavePolicy: { leaveType: string; daysPerYear: number }
}

// Use shared canonical labels (includes legacy values for historical records)
const LEAVE_LABEL = LEAVE_TYPE_LABELS

export default function TeamLeaveView({ managerEmployeeId, managerName }: { managerEmployeeId: string; managerName: string }) {
  const [requests, setRequests] = useState<Request[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading] = useState(true)
  const [applyOpen, setApplyOpen] = useState(false)

  const [form, setForm] = useState({
    leaveType: 'CASUAL',
    startDate: '',
    endDate: '',
    reason: '',
  })

  const fetchAll = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const [rData, bData] = await Promise.all([
        cachedFetch<{ requests?: unknown[] }>('/api/leave', { force }),
        cachedFetch<{ balances?: unknown[] }>('/api/leave/balances', { force }),
      ])
      setRequests((rData.requests ?? []) as never)
      setBalances((bData.balances ?? []) as never)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const teamRequests = useMemo(
    () => requests.filter((r) => r.employeeId !== managerEmployeeId),
    [requests, managerEmployeeId],
  )
  const myRequests = useMemo(
    () => requests.filter((r) => r.employeeId === managerEmployeeId),
    [requests, managerEmployeeId],
  )
  // Manager's queue — only requests waiting for them (PENDING). PENDING_HR
  // means they already approved; HR has it now.
  const pendingApprovals = teamRequests.filter((r) => r.status === 'PENDING')
  const awaitingHrAfterMe = teamRequests.filter((r) => r.status === 'PENDING_HR')

  // Today (start of day) for split between "on leave NOW" vs "upcoming"
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  // Currently on leave (today falls between fromDate and toDate inclusive)
  const onLeaveToday = teamRequests
    .filter((r) => r.status === 'APPROVED' &&
      new Date(r.fromDate) <= todayStart && new Date(r.toDate) >= todayStart)
    .sort((a, b) => new Date(a.toDate).getTime() - new Date(b.toDate).getTime())

  // Future approved leave (starts after today)
  const teamUpcoming = teamRequests
    .filter((r) => r.status === 'APPROVED' && new Date(r.fromDate) > todayStart)
    .sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime())

  // Approve / Reject for direct reports lives in the Approvals tab (unified inbox).
  // This view is read-only for team leave — see /dashboard/time?tab=approvals.

  const [applyError, setApplyError] = useState('')
  const [applying, setApplying] = useState(false)

  async function handleApply() {
    setApplyError('')
    if (!form.startDate || !form.endDate) {
      setApplyError('Pick start and end dates.')
      return
    }
    const isHalf = form.leaveType === 'HALF_DAY'
    const realType = isHalf ? 'CASUAL' : form.leaveType
    if (isHalf && form.startDate !== form.endDate) {
      setApplyError('Half day applies to a single day only — set start and end to the same date.')
      return
    }
    setApplying(true)
    const res = await fetch('/api/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveType: realType,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        firstDayHalf: isHalf,
      }),
    })
    setApplying(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setApplyError(d.error ?? 'Failed to submit')
      return
    }
    setApplyOpen(false)
    setForm({ leaveType: 'CASUAL', startDate: '', endDate: '', reason: '' })
    fetchAll(true)
  }

  return (
    <div className="space-y-5">

      {/* Header — same pattern as Team Time */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Team Leave</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* My own compact card — balances + request button + status of own pending requests */}
      {(() => {
        const myPending = myRequests.filter((r) => r.status === 'PENDING' || r.status === 'PENDING_HR')
        return (
          <Card>
            <CardContent className="p-4 border-l-4 border-slate-500 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">My own leave</p>
                  <div className="flex gap-3 mt-1 flex-wrap">
                    {balances.slice(0, 3).map((b) => (
                      <span key={b.id} className="text-sm text-slate-700">
                        {LEAVE_LABEL[b.leavePolicy.leaveType] ?? b.leavePolicy.leaveType}: <strong>{b.balance}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <Button size="sm" onClick={() => setApplyOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Request My Leave
                </Button>
              </div>
              {myPending.length > 0 && (
                <ul className="pt-2 border-t border-slate-100 space-y-1">
                  {myPending.map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">
                        {LEAVE_LABEL[r.leaveType] ?? r.leaveType} · {fmtDate(r.fromDate)} → {fmtDate(r.toDate)} · {formatDays(r.days)}
                      </span>
                      <Badge variant={r.status === 'PENDING' ? 'warning' : 'default'}>
                        {(r as unknown as { statusLabel?: string }).statusLabel ?? LEAVE_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* Pending approvals inbox moved to the Approvals tab — this Leave tab
          is now visibility/history only. A small reminder pill links across. */}
      {pendingApprovals.length > 0 && (
        <Link
          href="/dashboard/time?tab=approvals"
          className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-50 text-slate-900 border border-slate-100 hover:bg-slate-100 w-fit"
        >
          <Inbox className="w-3.5 h-3.5" />
          {pendingApprovals.length} leave request{pendingApprovals.length === 1 ? '' : 's'} waiting on you · review in Approvals →
        </Link>
      )}

      {/* Approved by me — awaiting HR — small informational strip */}
      {awaitingHrAfterMe.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-700" />
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-900 font-semibold">
                Approved by me · Awaiting HR
              </p>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 rounded-full px-2 py-0.5">
                {awaitingHrAfterMe.length}
              </span>
            </div>
            <ul>
              {awaitingHrAfterMe.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 last:border-b-0">
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {getInitials(r.employee.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{r.employee.fullName}</p>
                    <p className="text-[11px] text-slate-500">
                      {LEAVE_LABEL[r.leaveType] ?? r.leaveType} · {fmtDate(r.fromDate)} → {fmtDate(r.toDate)} · {formatDays(r.days)}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-700 font-medium shrink-0">
                    {LEAVE_STATUS_LABELS['PENDING_HR']}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* On leave today — only renders when there's at least one */}
      {onLeaveToday.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-700" />
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-900 font-semibold">On Leave Today</p>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 rounded-full px-2 py-0.5">
                {onLeaveToday.length}
              </span>
            </div>
            <ul>
              {onLeaveToday.map((r) => {
                const returnDate = new Date(r.toDate)
                returnDate.setDate(returnDate.getDate() + 1)
                return (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-50 last:border-b-0">
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {getInitials(r.employee.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{r.employee.fullName}</p>
                      <p className="text-[11px] text-slate-500">
                        {LEAVE_LABEL[r.leaveType] ?? r.leaveType} · {fmtDate(r.fromDate)} → {fmtDate(r.toDate)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-700 font-medium shrink-0">
                      Back {returnDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Team upcoming (future approved leave only) */}
      <Card>
        <CardContent className="p-0">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Team — Upcoming leave</p>
          </div>
          {teamUpcoming.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">No team members on leave coming up.</p>
          ) : (
            <ul>
              {teamUpcoming.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-50 last:border-b-0">
                  <Calendar className="w-4 h-4 text-slate-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{r.employee.fullName}</p>
                    <p className="text-[11px] text-slate-500">
                      {LEAVE_LABEL[r.leaveType] ?? r.leaveType} · {fmtDate(r.fromDate)} → {fmtDate(r.toDate)} · {formatDays(r.days)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* "Recent Decisions" intentionally removed from Manager view — kept the data
          available via API; HR's Leave Administration has the full audit table. */}

      {/* (Reject dialog removed — approve/reject for direct reports lives in the Approvals tab.) */}

      {/* My-own-apply dialog — same shape as the Employee dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request My Leave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Leave Type</label>
              <Select value={form.leaveType} onValueChange={(v) => setForm({ ...form, leaveType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBMITTABLE_LEAVE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{LEAVE_TYPE_LABELS[t]} Leave</SelectItem>
                  ))}
                  <SelectItem value="HALF_DAY">Half day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Start</label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">End</label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Reason</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={3}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                placeholder="Brief reason — helps HR approve faster."
              />
            </div>
            {applyError && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{applyError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button onClick={handleApply} disabled={applying}>{applying ? 'Submitting…' : 'Submit Request'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function fmtDate(s: string): string {
  const d = new Date(s)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', sameYear
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short', year: 'numeric' })
}
