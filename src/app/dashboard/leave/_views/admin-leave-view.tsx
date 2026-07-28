'use client'

import { useState, useEffect, useCallback } from 'react'
import { cachedFetch } from '@/lib/client-cache'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { SUBMITTABLE_LEAVE_TYPES, LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_STATUS_TONE, formatDays } from '@/lib/leave-types'

interface LeaveRequest {
  id: string
  leaveType: string
  fromDate: string
  toDate: string
  days: number
  status: string
  reason: string
  employee: { fullName: string; employeeCode: string }
}

interface LeaveBalance {
  id: string
  balance: number
  used: number
  leavePolicy: { leaveType: string; daysPerYear: number }
}

interface EmployeeBalanceGroup {
  employeeId: string
  fullName: string
  employeeCode: string
  department: string
  balances: { leaveType: string; allocated: number; used: number; remaining: number }[]
  totalAllocated: number
  totalUsed: number
  totalRemaining: number
}

// Use shared two-stage tone & label maps
const statusVariant = LEAVE_STATUS_TONE

export default function AdminLeaveView() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [groupedBalances, setGroupedBalances] = useState<EmployeeBalanceGroup[]>([])
  const [balanceSearch, setBalanceSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [applyOpen, setApplyOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectFor, setRejectFor] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const [form, setForm] = useState({
    leaveType: 'CASUAL',
    startDate: '',
    endDate: '',
    reason: '',
  })
  const [formError, setFormError] = useState('')

  const fetchLeave = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const [reqData, balData] = await Promise.all([
        cachedFetch<{ requests?: unknown[] }>('/api/leave', { force }),
        cachedFetch<{ grouped?: unknown[] }>('/api/leave/balances?all=true', { force }),
      ])
      setRequests((reqData.requests ?? []) as never)
      setGroupedBalances((balData.grouped ?? []) as never)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeave() }, [fetchLeave])

  async function handleApply() {
    setFormError('')
    const res = await fetch('/api/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error || 'Failed'); return }
    setApplyOpen(false)
    setForm({ leaveType: 'CASUAL', startDate: '', endDate: '', reason: '' })
    fetchLeave(true)
  }

  async function handleApprove(id: string) {
    setActionLoading(id)
    await fetch(`/api/leave/${id}/approve`, { method: 'POST' })
    setActionLoading(null)
    fetchLeave(true)
  }

  async function handleReject(id: string, reason: string) {
    if (!reason.trim()) return
    setActionLoading(id)
    await fetch(`/api/leave/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setActionLoading(null)
    setRejectFor(null)
    setRejectReason('')
    fetchLeave(true)
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(
      `Delete the leave request from ${label}?\n\n` +
      `If it was approved, the matching attendance entries (L / HD) will be ` +
      `removed and the leave balance will be restored. This cannot be undone.`,
    )) return
    setActionLoading(id)
    const res = await fetch(`/api/leave/${id}`, { method: 'DELETE' })
    setActionLoading(null)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Failed to delete leave')
      return
    }
    fetchLeave(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave — Administration</h1>
          <p className="text-sm text-slate-500 mt-0.5">All requests across the company, balances and approvals.</p>
        </div>
        <Button onClick={() => setApplyOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Apply Leave
        </Button>
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400">Loading…</TableCell></TableRow>
                ) : requests.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400">No leave requests.</TableCell></TableRow>
                ) : (
                  requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium text-gray-900">{r.employee.fullName}</p>
                        <p className="text-xs text-gray-400">{r.employee.employeeCode}</p>
                      </TableCell>
                      <TableCell>{LEAVE_TYPE_LABELS[r.leaveType] ?? r.leaveType}</TableCell>
                      <TableCell>{formatDate(r.fromDate)}</TableCell>
                      <TableCell>{formatDate(r.toDate)}</TableCell>
                      <TableCell>{formatDays(r.days)}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-gray-500">{r.reason}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[r.status] ?? 'secondary'}>{(r as unknown as { statusLabel?: string }).statusLabel ?? LEAVE_STATUS_LABELS[r.status] ?? r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {(r.status === 'PENDING' || r.status === 'PENDING_HR') && (
                            <>
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() => handleApprove(r.id)}
                                disabled={actionLoading === r.id}
                                title={r.status === 'PENDING' ? 'Approve — manager has not yet acted, this will finalise' : 'Final HR sign-off'}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setRejectFor(r.id)}
                                disabled={actionLoading === r.id}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {/* HR can hard-delete any leave (test cleanup or mistakes).
                              Side-effects (AttendanceLog + LeaveBalance) are unwound
                              in the API. */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(r.id, r.employee?.fullName ?? 'this employee')}
                            disabled={actionLoading === r.id}
                            title="Delete this leave (restores attendance + balance if approved)"
                            className="text-slate-700 border-slate-300 hover:bg-slate-50"
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="balances">
          {/* Per-employee balance table — searchable */}
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <Input
              placeholder="Search employee or code…"
              value={balanceSearch}
              onChange={(e) => setBalanceSearch(e.target.value)}
              className="max-w-xs"
            />
            <p className="text-xs text-gray-500">
              {groupedBalances.length} employees · year {new Date().getFullYear()}
            </p>
          </div>
          {(() => {
            const filtered = groupedBalances.filter((g) => {
              if (!balanceSearch.trim()) return true
              const q = balanceSearch.toLowerCase()
              return g.fullName.toLowerCase().includes(q) ||
                g.employeeCode.toLowerCase().includes(q) ||
                g.department.toLowerCase().includes(q)
            })
            // Build column set from all leave types present
            const allTypes = Array.from(new Set(
              groupedBalances.flatMap((g) => g.balances.map((b) => b.leaveType)),
            )).sort()
            return (
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">Employee</TableHead>
                        <TableHead>Dept</TableHead>
                        {allTypes.map((t) => (
                          <TableHead key={t} className="text-right text-xs">
                            {LEAVE_TYPE_LABELS[t] ?? t}
                          </TableHead>
                        ))}
                        <TableHead className="text-right font-bold">Total Left</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={allTypes.length + 3} className="text-center py-8 text-gray-400">Loading…</TableCell>
                        </TableRow>
                      ) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={allTypes.length + 3} className="text-center py-8 text-gray-400">
                            {groupedBalances.length === 0 ? 'No balances initialised yet.' : 'No matches.'}
                          </TableCell>
                        </TableRow>
                      ) : filtered.map((g) => {
                        const byType = new Map(g.balances.map((b) => [b.leaveType, b]))
                        return (
                          <TableRow key={g.employeeId}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-gray-900">{g.fullName}</p>
                                <p className="text-xs text-gray-400 font-mono">{g.employeeCode}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-gray-600">{g.department}</TableCell>
                            {allTypes.map((t) => {
                              const b = byType.get(t)
                              if (!b) return <TableCell key={t} className="text-right text-gray-300 text-xs">—</TableCell>
                              const lowOnRemaining = b.allocated > 0 && b.remaining / b.allocated < 0.25
                              return (
                                <TableCell key={t} className="text-right tabular-nums">
                                  <span className={lowOnRemaining ? 'text-slate-700 font-semibold' : 'text-gray-900 font-semibold'}>{b.remaining}</span>
                                  <span className="text-xs text-gray-400"> /{b.allocated}</span>
                                </TableCell>
                              )
                            })}
                            <TableCell className="text-right font-bold tabular-nums text-slate-700">
                              {g.totalRemaining}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )
          })()}
        </TabsContent>

        <TabsContent value="holidays">
          <HolidaysPanel />
        </TabsContent>
      </Tabs>

      {/* Apply Leave Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
              <Select value={form.leaveType} onValueChange={(v) => setForm({ ...form, leaveType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBMITTABLE_LEAVE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{LEAVE_TYPE_LABELS[t]} Leave</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                placeholder="Brief reason for leave…"
              />
            </div>
            {formError && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button onClick={handleApply}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog — replaces the old native prompt() */}
      <Dialog open={!!rejectFor} onOpenChange={(open) => { if (!open) { setRejectFor(null); setRejectReason('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Reason for rejection</label>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
              placeholder="Explain why this request is being rejected. The employee will see this."
            />
            <p className="text-[11px] text-gray-400">Required — the employee receives this in their notification.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectFor(null); setRejectReason('') }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || actionLoading === rejectFor}
              onClick={() => rejectFor && handleReject(rejectFor, rejectReason)}
            >
              {actionLoading === rejectFor ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Holidays panel ────────────────────────────────────────────────────────

interface Holiday { id: string; name: string; date: string; type: string }

function HolidaysPanel() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [type, setType] = useState('PUBLIC')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/holidays?year=${year}`)
    const data = await res.json()
    setHolidays(data.holidays ?? [])
  }, [year])
  useEffect(() => { load() }, [load])

  async function add() {
    setError('')
    if (!name || !date) { setError('Name and date are required'); return }
    setBusy(true)
    const res = await fetch('/api/holidays', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, date, type }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not save')
      return
    }
    setName(''); setDate(''); setType('PUBLIC')
    load()
  }

  async function remove(id: string) {
    if (!confirm('Remove this holiday?')) return
    await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Days marked as <strong>Public</strong> are skipped from leave-day counting so they don&apos;t burn an employee&apos;s balance.
        </p>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-9 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
        >
          {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-600">Add Holiday</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_140px_auto] gap-2">
            <Input placeholder="Holiday name (e.g. Eid-ul-Fitr)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">Public (paid)</SelectItem>
                <SelectItem value="OPTIONAL">Optional</SelectItem>
                <SelectItem value="COMPANY">Company</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={add} disabled={busy}>{busy ? 'Saving…' : 'Add'}</Button>
          </div>
          {error && <p className="text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">No holidays set for {year} yet.</TableCell></TableRow>
            ) : holidays.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="font-mono text-xs">{new Date(h.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                <TableCell className="text-xs text-gray-500">{new Date(h.date).toLocaleDateString('en-GB', { weekday: 'long' })}</TableCell>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell>
                  <Badge variant={h.type === 'PUBLIC' ? 'success' : h.type === 'OPTIONAL' ? 'warning' : 'secondary'}>
                    {h.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => remove(h.id)}>Remove</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
