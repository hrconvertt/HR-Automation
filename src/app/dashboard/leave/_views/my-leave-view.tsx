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
import { toastError } from '@/components/ui/toaster'
import { cachedFetch } from '@/lib/client-cache'
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
  ANNUAL:    { tone: 'bg-slate-50 text-slate-700 border-slate-100',       label: 'Annual' },
  CASUAL:    { tone: 'bg-slate-50 text-slate-700 border-slate-100', label: 'Casual' },
  SICK:      { tone: 'bg-slate-50 text-slate-700 border-slate-100',       label: 'Sick' },
  EMERGENCY: { tone: 'bg-slate-50 text-slate-700 border-slate-100',    label: 'Emergency' },
  UNPAID:    { tone: 'bg-slate-50 text-slate-700 border-slate-200',    label: 'Unpaid' },
  MATERNITY: { tone: 'bg-slate-50 text-slate-700 border-slate-100',       label: 'Maternity' },
  PATERNITY: { tone: 'bg-slate-50 text-slate-700 border-slate-100', label: 'Paternity' },
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

  /**
   * Everything a leave record can actually hold. The API has accepted
   * `category`, the two half-day flags and an attachment since it was written;
   * this form only ever sent a type, two dates and a reason. So there was no
   * way to request work from home, no way to take half a *sick* day, no way to
   * make the *last* day of a range a half day — and no way to attach the
   * evidence that the Friday/Monday rule refuses the request without.
   */
  const [form, setForm] = useState({
    category: 'LEAVE' as 'LEAVE' | 'WFH',
    leaveType: 'CASUAL',
    startDate: '',
    endDate: '',
    firstDayHalf: false,
    lastDayHalf: false,
    reason: '',
  })
  const [file, setFile] = useState<{ name: string; mime: string; base64: string } | null>(null)
  const [fileError, setFileError] = useState('')

  // Mirrors the server's own limits, so the refusal happens before the upload
  // rather than after it.
  const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
  async function pickFile(f: File | null) {
    setFileError('')
    if (!f) { setFile(null); return }
    if (!ALLOWED_MIME.includes(f.type.toLowerCase())) {
      setFileError('Evidence must be a PDF, JPG or PNG.'); return
    }
    if (f.size > 5 * 1024 * 1024) { setFileError('Evidence must be under 5 MB.'); return }
    const buf = await f.arrayBuffer()
    let bin = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    setFile({ name: f.name, mime: f.type, base64: btoa(bin) })
  }

  // ── Live impact preview: chargeable days + overlap + balance-after ──────
  type Preview = {
    chargeableDays: number
    dayMarks: { date: string; mark: 'L' | 'HD' | 'WE' | 'HOLIDAY' }[]
    overlap: { leaveType: string; status: string; range: string } | null
    balance: { remaining: number; afterApproval: number } | null
  }
  const [preview, setPreview] = useState<Preview | null>(null)
  useEffect(() => {
    if (!applyOpen || !form.startDate || !form.endDate || form.endDate < form.startDate) {
      setPreview(null)
      return
    }
    const single = form.startDate === form.endDate
    const controller = new AbortController()
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          start: form.startDate,
          end: form.endDate,
          leaveType: form.category === 'WFH' ? 'CASUAL' : form.leaveType,
          ...(form.firstDayHalf ? { firstDayHalf: '1' } : {}),
          ...(!single && form.lastDayHalf ? { lastDayHalf: '1' } : {}),
        })
        const res = await fetch(`/api/leave/preview?${params}`, { signal: controller.signal })
        if (res.ok) setPreview(await res.json())
        else setPreview(null)
      } catch { /* aborted or offline — preview is best-effort */ }
    }, 350)
    return () => { clearTimeout(t); controller.abort() }
  }, [applyOpen, form.startDate, form.endDate, form.leaveType, form.category,
    form.firstDayHalf, form.lastDayHalf])

  const fetchLeave = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const [reqData, balData] = await Promise.all([
        cachedFetch<{ requests?: LeaveRequest[] }>('/api/leave', { force }),
        cachedFetch<{ balances?: LeaveBalance[] }>('/api/leave/balances', { force }),
      ])
      setRequests(reqData.requests ?? [])
      setBalances(balData.balances ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeave() }, [fetchLeave])

  async function handleApply() {
    setFormError('')
    if (!form.startDate || !form.endDate) {
      setFormError('Pick start and end dates.')
      return
    }
    const single = form.startDate === form.endDate
    setSubmitting(true)
    const res = await fetch('/api/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Working from home travels the same approval path; it simply spends
        // no balance and marks the day WFH. The type rides along as the
        // carrier, matching every WFH row already on file.
        category: form.category,
        leaveType: form.category === 'WFH' ? 'CASUAL' : form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        firstDayHalf: form.firstDayHalf,
        lastDayHalf: single ? false : form.lastDayHalf,
        attachmentBase64: file?.base64,
        attachmentMime: file?.mime,
        attachmentName: file?.name,
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setFormError(data.error ?? 'Failed to submit'); return }
    setApplyOpen(false)
    setForm({ category: 'LEAVE', leaveType: 'CASUAL', startDate: '', endDate: '',
      firstDayHalf: false, lastDayHalf: false, reason: '' })
    setFile(null)
    fetchLeave(true)
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancel this leave request?')) return
    const res = await fetch(`/api/leave/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toastError('Could not cancel the request.', d.error)
      return
    }
    fetchLeave(true)
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
          <Card className="border border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-900 font-semibold">Annual Entitlement</p>
                  <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">
                    {remaining}<span className="text-base text-slate-700/70 font-normal"> / {allocated} days remaining</span>
                  </p>
                  <p className="text-xs text-slate-900 mt-1">
                    {used} day{used === 1 ? '' : 's'} used so far this year
                    {' · '}{annual.map((b) => `${b.balance} ${b.leavePolicy.leaveType.charAt(0) + b.leavePolicy.leaveType.slice(1).toLowerCase()}`).join(' + ')} left
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <div className="h-2 bg-white/70 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-700" style={{ width: `${usedPct}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-900/70 mt-1 text-right">{usedPct}% used</p>
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
                <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-md bg-slate-50/50 border border-slate-100">
                  <Calendar className="w-4 h-4 text-slate-700" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {LEAVE_COLORS[r.leaveType]?.label ?? r.leaveType} · {formatDays(r.days)}
                    </p>
                    <p className="text-[11px] text-slate-700">
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
                    r.status === 'APPROVED'    ? 'bg-slate-300' :
                    r.status === 'PENDING'     ? 'bg-slate-300' :
                    r.status === 'PENDING_HR'  ? 'bg-slate-300' :
                    r.status === 'REJECTED'    ? 'bg-slate-300' :
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
                      <p className="text-xs text-slate-700 mt-0.5">
                        <AlertCircle className="w-3 h-3 inline mr-1" />
                        Rejected: {r.rejectionReason}
                      </p>
                    )}
                  </div>
                  <Badge variant={STATUS_TONE[r.status] ?? 'secondary'}>{(r as unknown as { statusLabel?: string }).statusLabel ?? STATUS_LABEL[r.status] ?? r.status}</Badge>
                  {(r.status === 'PENDING' || r.status === 'PENDING_HR' ||
                    (r.status === 'APPROVED' && new Date(r.fromDate) >= new Date(new Date().toDateString()))) && (
                    <button
                      onClick={() => handleCancel(r.id)}
                      className="text-xs text-slate-400 hover:text-slate-700"
                      title={r.status === 'APPROVED'
                        ? 'Cancel this approved leave — your balance will be restored'
                        : 'Cancel request'}
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
            {/* What kind of day this is. Work from home was simply not
                offerable here before, though a quarter of the records are. */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Request</label>
              <div className="inline-flex bg-slate-100 p-1 rounded-lg w-full">
                {([['LEAVE', 'Leave'], ['WFH', 'Work from home']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm({ ...form, category: v })}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition ${
                      form.category === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {form.category === 'LEAVE' && (
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Leave Type</label>
                <Select value={form.leaveType} onValueChange={(v) => setForm({ ...form, leaveType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBMITTABLE_LEAVE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{LEAVE_TYPE_LABELS[t]} Leave</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

            {/* Half days. "Half day" used to be an option in the type list,
                which meant it was always half a Casual day and always the
                first one — you could not take half a sick day, or finish a
                range at midday. */}
            {form.startDate && form.endDate && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-700">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.firstDayHalf}
                    onChange={(e) => setForm({ ...form, firstDayHalf: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  {form.startDate === form.endDate ? 'Half day' : 'First day is a half day'}
                </label>
                {form.startDate !== form.endDate && (
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.lastDayHalf}
                      onChange={(e) => setForm({ ...form, lastDayHalf: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    Last day is a half day
                  </label>
                )}
              </div>
            )}

            {/* Evidence. Sick leave and WFH on a Friday or Monday are refused
                without it, and there was no way to attach one from here. */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
                Evidence {form.category === 'WFH' || form.leaveType === 'SICK'
                  ? <span className="text-slate-400 normal-case tracking-normal font-normal">— required on a Friday or Monday</span>
                  : <span className="text-slate-400 normal-case tracking-normal font-normal">— optional</span>}
              </label>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                className="block w-full text-[13px] text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:text-slate-700 file:text-[13px]"
              />
              {file && <p className="text-[11px] text-slate-500 mt-1">Attached: {file.name}</p>}
              {fileError && <p className="text-[11px] text-red-700 mt-1">{fileError}</p>}
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
            {/* Live impact preview — days charged + attendance cells + balance after */}
            {preview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs text-slate-700">
                <p>
                  <strong className="tabular-nums">{formatDays(preview.chargeableDays)}</strong> will be charged.
                  {(() => {
                    const marked = preview.dayMarks.filter((m) => m.mark === 'L' || m.mark === 'HD')
                    const we = preview.dayMarks.filter((m) => m.mark === 'WE').length
                    const hol = preview.dayMarks.filter((m) => m.mark === 'HOLIDAY').length
                    const fmtD = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    const days = marked.slice(0, 6).map((m) => `${fmtD(m.date)} (${m.mark})`).join(', ')
                    const extra = marked.length > 6 ? ` +${marked.length - 6} more` : ''
                    const skips = [
                      we > 0 ? `${we} weekend day${we > 1 ? 's' : ''}` : null,
                      hol > 0 ? `${hol} public holiday${hol > 1 ? 's' : ''}` : null,
                    ].filter(Boolean).join(' + ')
                    return marked.length > 0
                      ? <> Attendance will show {days}{extra}{skips ? <> — skips {skips}</> : null}.</>
                      : <> No working days in this range{skips ? ` (${skips})` : ''}.</>
                  })()}
                </p>
                {preview.balance && (
                  <p className={preview.balance.afterApproval < 0 ? 'text-red-700 font-medium' : ''}>
                    Balance: {preview.balance.remaining} day{preview.balance.remaining === 1 ? '' : 's'} left
                    {' → '}{preview.balance.afterApproval} after this request
                    {preview.balance.afterApproval < 0 && ' — not enough balance.'}
                  </p>
                )}
                {preview.overlap && (
                  <p className="text-amber-800 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Overlaps your {preview.overlap.status === 'APPROVED' ? 'approved' : 'pending'} {LEAVE_TYPE_LABELS[preview.overlap.leaveType] ?? preview.overlap.leaveType} leave ({preview.overlap.range}) — this will be refused.
                  </p>
                )}
              </div>
            )}
            {formError && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{formError}</p>}
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
    amber:   'bg-slate-50 border-slate-100 text-slate-900',
    emerald: 'bg-slate-50 border-slate-100 text-slate-900',
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
