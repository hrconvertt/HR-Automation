'use client'

/**
 * Employee "My Leave" view.
 *
 *   ┌── Balance KPI tiles per leave type ──┐
 *   ┌── + Request Leave (hero button) ─────┐
 *   ┌── My Requests history table ─────────┐
 *   ┌── Upcoming leave calendar strip ─────┐
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import {
  Calendar, Plus, AlertCircle, CheckCircle2, Clock, X, Trash2,
} from 'lucide-react'
import { SUBMITTABLE_LEAVE_TYPES, LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_STATUS_TONE, formatDays } from '@/lib/leave-types'

type LeaveRequest = {
  id: string
  leaveType: string
  fromDate: string
  toDate: string
  days: number
  status: string
  reason: string
  rejectionReason?: string | null
}

type LeaveBalance = {
  id: string
  balance: number
  used: number
  leavePolicy: { leaveType: string; daysPerYear: number }
}

const LEAVE_COLORS: Record<string, { tone: string; label: string }> = {
  ANNUAL:    { tone: 'bg-blue-50 text-blue-700 border-blue-200',       label: 'Annual' },
  CASUAL:    { tone: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Casual' },
  SICK:      { tone: 'bg-rose-50 text-rose-700 border-rose-200',       label: 'Sick' },
  EMERGENCY: { tone: 'bg-amber-50 text-amber-700 border-amber-200',    label: 'Emergency' },
  UNPAID:    { tone: 'bg-slate-50 text-slate-700 border-slate-200',    label: 'Unpaid' },
  MATERNITY: { tone: 'bg-pink-50 text-pink-700 border-pink-200',       label: 'Maternity' },
  PATERNITY: { tone: 'bg-indigo-50 text-indigo-700 border-indigo-200', label: 'Paternity' },
}

// Use shared two-stage status helpers (PENDING vs PENDING_HR vs APPROVED/REJECTED/CANCELLED)
const STATUS_TONE = LEAVE_STATUS_TONE
const STATUS_LABEL = LEAVE_STATUS_LABELS

export default function MyLeaveView({ employeeName }: { employeeId: string; employeeName: string }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [applyOpen, setApplyOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // The form's `leaveType` field uses combined values that include half-day
  // variants (e.g. CASUAL_HALF). Submitted to the API as { leaveType, firstDayHalf }.
  const [form, setForm] = useState({
    leaveType: 'CASUAL',
    startDate: '',
    endDate: '',
    reason: '',
  })

  const fetchLeave = useCallback(async () => {
    setLoading(true)
    const [reqRes, balRes] = await Promise.all([
      fetch('/api/leave'),
      fetch('/api/leave/balances'),
    ])
    const reqData = await reqRes.json()
    const balData = await balRes.json()
    setRequests(reqData.requests ?? [])
    setBalances(balData.balances ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchLeave() }, [fetchLeave])

  async function handleApply() {
    setFormError('')
    if (!form.startDate || !form.endDate) {
      setFormError('Pick start and end dates.')
      return
    }
    // "Half day" → treat as a half day of CASUAL (Convertt default for short absences)
    const isHalf = form.leaveType === 'HALF_DAY'
    const realType = isHalf ? 'CASUAL' : form.leaveType
    if (isHalf && form.startDate !== form.endDate) {
      setFormError('Half day applies to a single day only — set start and end to the same date.')
      return
    }
    setSubmitting(true)
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
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setFormError(data.error ?? 'Failed to submit'); return }
    setApplyOpen(false)
    setForm({ leaveType: 'CASUAL', startDate: '', endDate: '', reason: '' })
    fetchLeave()
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancel this leave request?')) return
    const res = await fetch(`/api/leave/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Could not cancel the request.')
      return
    }
    fetchLeave()
  }

  // Pending = anything not yet finalised (either manager or HR stage)
  const pending = requests.filter((r) => r.status === 'PENDING' || r.status === 'PENDING_HR').length
  const approved = requests.filter((r) => r.status === 'APPROVED').length
  const upcoming = requests
    .filter((r) => r.status === 'APPROVED' && new Date(r.toDate) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime())

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Leave</h1>
          <p className="text-sm text-slate-500 mt-0.5">{employeeName} · Your leave balances and requests</p>
        </div>
        <Button onClick={() => setApplyOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Request Leave
        </Button>
      </div>

      {/* Annual entitlement summary — only counts CASUAL + SICK (per Convertt policy) */}
      {(() => {
        const annual = balances.filter((b) => ['CASUAL', 'SICK'].includes(b.leavePolicy.leaveType))
        if (annual.length === 0) return null
        const allocated = annual.reduce((s, b) => s + b.leavePolicy.daysPerYear, 0)
        const used = annual.reduce((s, b) => s + b.used, 0)
        const remaining = annual.reduce((s, b) => s + b.balance, 0)
        const usedPct = allocated > 0 ? Math.min(100, Math.round((used / allocated) * 100)) : 0
        return (
          <Card className="border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-blue-900 font-semibold">Annual Entitlement</p>
                  <p className="text-3xl font-bold text-blue-900 tabular-nums mt-1">
                    {remaining}<span className="text-base text-blue-700/70 font-normal"> / {allocated} days remaining</span>
                  </p>
                  <p className="text-xs text-blue-800 mt-1">
                    {used} day{used === 1 ? '' : 's'} used so far this year
                    {' · '}{annual.map((b) => `${b.balance} ${b.leavePolicy.leaveType.charAt(0) + b.leavePolicy.leaveType.slice(1).toLowerCase()}`).join(' + ')} left
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <div className="h-2 bg-white/70 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600" style={{ width: `${usedPct}%` }} />
                  </div>
                  <p className="text-[10px] text-blue-800/70 mt-1 text-right">{usedPct}% used</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Balance KPI tiles — per-type breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {balances.length === 0 && !loading ? (
          <Card className="col-span-full">
            <CardContent className="p-6 text-center text-slate-400 text-sm">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No leave balances yet. HR will initialise them at the start of the year.
            </CardContent>
          </Card>
        ) : (
          balances.map((b) => {
            const meta = LEAVE_COLORS[b.leavePolicy.leaveType] ?? { tone: 'bg-slate-50 text-slate-700 border-slate-200', label: b.leavePolicy.leaveType }
            const pct = b.leavePolicy.daysPerYear > 0
              ? Math.min(100, Math.round((b.used / b.leavePolicy.daysPerYear) * 100))
              : 0
            return (
              <Card key={b.id} className={`border ${meta.tone.split(' ').filter(c => c.startsWith('border-')).join(' ')}`}>
                <CardContent className={`p-4 ${meta.tone}`}>
                  <p className="text-[11px] uppercase tracking-wider font-semibold opacity-80">{meta.label}</p>
                  <p className="text-3xl font-bold mt-1 tabular-nums">{b.balance}</p>
                  <p className="text-[11px] opacity-70 mt-0.5">{b.used} used of {b.leavePolicy.daysPerYear} days</p>
                  <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div className="h-full bg-current opacity-70 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Quick status pills */}
      <div className="flex gap-3 flex-wrap">
        <StatusChip icon={Clock}        label="Pending"  count={pending}  tone="amber" />
        <StatusChip icon={CheckCircle2} label="Approved" count={approved} tone="emerald" />
      </div>

      {/* Upcoming leave */}
      {upcoming.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-3">Upcoming leave</p>
            <div className="space-y-2">
              {upcoming.slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-md bg-emerald-50/50 border border-emerald-100">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-900">
                      {LEAVE_COLORS[r.leaveType]?.label ?? r.leaveType} · {formatDays(r.days)}
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      {fmtDate(r.fromDate)} → {fmtDate(r.toDate)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* My Requests */}
      <Card>
        <CardContent className="p-0">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">My Requests</p>
          </div>
          {loading ? (
            <p className="text-center py-8 text-slate-400 text-sm">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">No requests yet. Click &quot;Request Leave&quot; above to apply.</p>
          ) : (
            <ul>
              {requests.map((r) => (
                <li key={r.id} className="flex items-center gap-4 px-5 py-3 border-b border-slate-50 last:border-b-0">
                  <div className={`w-1 self-stretch rounded-full ${
                    r.status === 'APPROVED'    ? 'bg-emerald-400' :
                    r.status === 'PENDING'     ? 'bg-amber-400' :
                    r.status === 'PENDING_HR'  ? 'bg-blue-400' :
                    r.status === 'REJECTED'    ? 'bg-rose-400' :
                    'bg-slate-300'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">
                        {LEAVE_COLORS[r.leaveType]?.label ?? r.leaveType}
                      </span>
                      <span className="text-xs text-slate-500">
                        {fmtDate(r.fromDate)} → {fmtDate(r.toDate)} · {formatDays(r.days)}
                      </span>
                    </div>
                    {r.reason && <p className="text-xs text-slate-500 mt-0.5 truncate">{r.reason}</p>}
                    {r.status === 'REJECTED' && r.rejectionReason && (
                      <p className="text-xs text-rose-700 mt-0.5">
                        <AlertCircle className="w-3 h-3 inline mr-1" />
                        Rejected: {r.rejectionReason}
                      </p>
                    )}
                  </div>
                  <Badge variant={STATUS_TONE[r.status] ?? 'secondary'}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  {(r.status === 'PENDING' || r.status === 'PENDING_HR') && (
                    <button
                      onClick={() => handleCancel(r.id)}
                      className="text-xs text-slate-400 hover:text-rose-600"
                      title="Cancel request"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Apply dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
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
                placeholder="Brief reason — helps your manager approve faster."
              />
            </div>
            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button onClick={handleApply} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusChip({ icon: Icon, label, count, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; count: number; tone: 'amber' | 'emerald';
}) {
  const tones = {
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}: <strong>{count}</strong>
    </span>
  )
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
