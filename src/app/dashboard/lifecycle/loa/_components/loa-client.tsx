'use client'

/**
 * Leave of Absence — client renderer. Server page gates to HR_ADMIN.
 *
 * Tabs: Active (ACTIVE + EXTENDED, overdue returns highlighted) / Returned.
 * Actions: Mark Returned, Extend. "Start Leave of Absence" dialog picks any
 * active employee (picker data from /api/job-changes/options — HR-only).
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
import { Plane, Plus } from 'lucide-react'

interface LoaRow {
  id: string
  type: string
  typeLabel: string
  startDate: string
  expectedReturn: string
  actualReturn: string | null
  paid: boolean
  notes: string | null
  status: string
  createdAt: string
  employee: { id: string; fullName: string; employeeCode: string; designation: string }
}

const LOA_TYPES = [
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'MATERNITY', label: 'Maternity' },
  { value: 'PATERNITY', label: 'Paternity' },
  { value: 'SABBATICAL', label: 'Sabbatical' },
  { value: 'UNPAID_PERSONAL', label: 'Unpaid Personal' },
]

const inputCls =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

export function LoaClient({ isPreviewMode }: { isPreviewMode: boolean }) {
  const [rows, setRows] = useState<LoaRow[] | null>(null)
  const [tab, setTab] = useState<'ACTIVE' | 'RETURNED'>('ACTIVE')
  const [startOpen, setStartOpen] = useState(false)
  const [returnRow, setReturnRow] = useState<LoaRow | null>(null)
  const [extendRow, setExtendRow] = useState<LoaRow | null>(null)
  const canWrite = !isPreviewMode

  const load = useCallback(() => {
    fetch('/api/loa', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setRows(d.loas ?? []))
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    if (!rows) return []
    return tab === 'ACTIVE'
      ? rows.filter((r) => r.status === 'ACTIVE' || r.status === 'EXTENDED')
      : rows.filter((r) => r.status === 'RETURNED')
  }, [rows, tab])

  const activeCount = rows?.filter((r) => r.status !== 'RETURNED').length ?? 0
  const returnedCount = rows?.filter((r) => r.status === 'RETURNED').length ?? 0
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <Plane className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Leave of Absence</h1>
            <p className="text-white/85 mt-1 text-sm">
              Extended leave — medical, maternity, sabbatical. Days on LOA show automatically on the attendance grid.
            </p>
          </div>
          {canWrite && (
            <Button
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={() => setStartOpen(true)}
            >
              <Plus className="w-4 h-4" /> Start Leave of Absence
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-lg px-2 py-2 flex items-center gap-1 text-sm">
        {([
          { key: 'ACTIVE', label: 'Active', count: activeCount },
          { key: 'RETURNED', label: 'Returned', count: returnedCount },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md font-medium ${
              tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-white/70' : 'text-slate-400'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {rows === null ? (
        <Card><CardContent className="py-10 text-center text-slate-400">Loading…</CardContent></Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-slate-500">
              {tab === 'ACTIVE' ? 'No one is currently on a leave of absence.' : 'No completed leaves of absence yet.'}
            </p>
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
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">{tab === 'ACTIVE' ? 'Expected return' : 'Returned'}</th>
                  <th className="px-4 py-3 font-medium">Pay</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                  {tab === 'ACTIVE' && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => {
                  const overdue = r.status !== 'RETURNED' && r.expectedReturn.slice(0, 10) < today
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/employees/${r.employee.id}`} className="font-medium text-slate-900 hover:underline">
                          {r.employee.fullName}
                        </Link>
                        <p className="text-xs text-slate-400">{r.employee.designation}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{r.typeLabel}</Badge>
                        {r.status === 'EXTENDED' && (
                          <span className="block text-xs text-slate-500 mt-1">Extended</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(r.startDate)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {tab === 'ACTIVE' ? (
                          <span className={overdue ? 'font-semibold text-slate-900 underline decoration-2 underline-offset-2' : 'text-slate-700'}>
                            {formatDate(r.expectedReturn)}
                            {overdue && <span className="block text-xs font-medium text-slate-500 no-underline">overdue</span>}
                          </span>
                        ) : (
                          <span className="text-slate-700">{r.actualReturn ? formatDate(r.actualReturn) : '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.paid ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {r.paid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={r.notes ?? ''}>
                        {r.notes ?? '—'}
                      </td>
                      {tab === 'ACTIVE' && (
                        <td className="px-4 py-3">
                          {canWrite && (
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" onClick={() => setReturnRow(r)}>Mark Returned</Button>
                              <Button size="sm" variant="outline" onClick={() => setExtendRow(r)}>Extend</Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <StartLoaDialog open={startOpen} onClose={() => setStartOpen(false)} onDone={load} />
      <MarkReturnedDialog row={returnRow} onClose={() => setReturnRow(null)} onDone={load} />
      <ExtendDialog row={extendRow} onClose={() => setExtendRow(null)} onDone={load} />
    </div>
  )
}

// ── Start LOA ────────────────────────────────────────────────────────────────
function StartLoaDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [employees, setEmployees] = useState<{ id: string; fullName: string; employeeCode: string; designation: string }[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [type, setType] = useState('MEDICAL')
  const [startDate, setStartDate] = useState('')
  const [expectedReturn, setExpectedReturn] = useState('')
  const [paid, setPaid] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmployeeId('')
    setType('MEDICAL')
    setStartDate(new Date().toISOString().slice(0, 10))
    setExpectedReturn('')
    setPaid(false)
    setNotes('')
    fetch('/api/job-changes/options', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((d) => setEmployees(d.employees ?? []))
      .catch(() => setEmployees([]))
  }, [open])

  const canSubmit = !!employeeId && !!startDate && !!expectedReturn && expectedReturn > startDate

  async function submit() {
    if (!canSubmit || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/loa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, type, startDate, expectedReturn, paid, notes: notes.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'Could not start leave', description: data.error ?? 'Unknown error', variant: 'destructive' })
        return
      }
      toast({ title: 'Leave of absence started' })
      onClose()
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Leave of Absence</DialogTitle>
          <DialogDescription>
            The employee's attendance shows LOA for the whole period — no daily leave requests needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
            <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode}) — {e.designation}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Leave type</label>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {LOA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Start date</label>
              <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Expected return</label>
              <input type="date" className={inputCls} min={startDate} value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} />
            </div>
          </div>
          {startDate && expectedReturn && expectedReturn <= startDate && (
            <p className="text-xs text-slate-600">Expected return must be after the start date.</p>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="accent-slate-900" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            Paid leave
          </label>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes <span className="text-slate-400">(optional)</span></label>
            <textarea className={`${inputCls} min-h-[60px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, documentation received, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>{saving ? 'Starting…' : 'Start leave'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Mark returned ────────────────────────────────────────────────────────────
function MarkReturnedDialog({ row, onClose, onDone }: { row: LoaRow | null; onClose: () => void; onDone: () => void }) {
  const [actualReturn, setActualReturn] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (row) setActualReturn(new Date().toISOString().slice(0, 10))
  }, [row])

  async function submit() {
    if (!row || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/loa/${row.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualReturn: actualReturn || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'Could not mark returned', description: data.error ?? 'Unknown error', variant: 'destructive' })
        return
      }
      toast({ title: 'Marked as returned' })
      onClose()
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark returned</DialogTitle>
          <DialogDescription>
            {row && <>Record {row.employee.fullName}'s return from {row.typeLabel.toLowerCase()} leave.</>}
          </DialogDescription>
        </DialogHeader>
        <label className="block text-xs font-medium text-slate-600 mb-1">Actual return date</label>
        <input
          type="date"
          className={inputCls}
          min={row?.startDate.slice(0, 10)}
          value={actualReturn}
          onChange={(e) => setActualReturn(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !actualReturn}>{saving ? 'Saving…' : 'Mark returned'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Extend ───────────────────────────────────────────────────────────────────
function ExtendDialog({ row, onClose, onDone }: { row: LoaRow | null; onClose: () => void; onDone: () => void }) {
  const [expectedReturn, setExpectedReturn] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (row) setExpectedReturn('') }, [row])

  const minDate = row ? row.expectedReturn.slice(0, 10) : undefined
  const canSubmit = !!expectedReturn && (!minDate || expectedReturn > minDate)

  async function submit() {
    if (!row || !canSubmit || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/loa/${row.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedReturn }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'Could not extend leave', description: data.error ?? 'Unknown error', variant: 'destructive' })
        return
      }
      toast({ title: 'Leave extended' })
      onClose()
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend leave</DialogTitle>
          <DialogDescription>
            {row && <>Current expected return: {formatDate(row.expectedReturn)}. Pick the new expected return date.</>}
          </DialogDescription>
        </DialogHeader>
        <label className="block text-xs font-medium text-slate-600 mb-1">New expected return</label>
        <input
          type="date"
          className={inputCls}
          min={minDate}
          value={expectedReturn}
          onChange={(e) => setExpectedReturn(e.target.value)}
        />
        {expectedReturn && minDate && expectedReturn <= minDate && (
          <p className="text-xs text-slate-600 mt-1">Must be later than the current expected return.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>{saving ? 'Extending…' : 'Extend'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
