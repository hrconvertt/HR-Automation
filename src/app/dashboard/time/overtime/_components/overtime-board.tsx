'use client'

/**
 * The overtime record.
 *
 * Approving used to be the end of the story — the row left the inbox and there
 * was nowhere to see it again. This is where an approved hour lands: what was
 * worked, the rate applied to it, what that is worth, and who signed it off.
 *
 * The rate is per occurrence, not per employee. Convertt has paid overtime at
 * the flat hourly rate (Usman's came through as a straight addition to his
 * 110,000), but a premium is a decision someone should be able to make on the
 * day rather than one baked into the code.
 */

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Clock, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import {
  OT_STATUS_LABELS, OT_STATUS_TONE, OT_RATES, formatHours,
  STANDARD_WORKING_DAYS, STANDARD_HOURS_PER_DAY,
} from '@/lib/overtime'

type Row = {
  id: string
  date: string
  employee: { fullName: string; employeeCode: string; designation: string | null; department: string }
  hoursWorked: number | null
  overtimeHours: number
  ratePct: number
  hourlyRate: number | null
  amount: number | null
  status: string
  decidedAt: string | null
  decidedBy: string | null
  note: string | null
}
type Totals = { hours: number; approvedHours: number; approvedAmount: number; pending: number }

const money = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 })
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })

const TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Awaiting approval' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
] as const

export function OvertimeBoard() {
  const params = useSearchParams()
  // The sidebar's "OT Approved" entry is this same screen filtered — one table,
  // one set of columns, no second implementation to keep in step.
  const initial = (params.get('tab') ?? '').toUpperCase() === 'APPROVED' ? 'APPROVED' : 'ALL'

  const [tab, setTab] = useState<string>(initial)
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [canDecide, setCanDecide] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setTab(initial) }, [initial])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/time/overtime?status=${tab}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Could not load overtime.')
      setRows(j.rows ?? [])
      setTotals(j.totals ?? null)
      setCanDecide(!!j.canDecide)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load overtime.')
      setRows([])
    }
    setLoading(false)
  }, [tab])

  useEffect(() => { load() }, [load])

  async function setRate(row: Row, ratePct: number) {
    setBusy(row.id)
    const res = await fetch('/api/attendance/overtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendanceLogId: row.id,
        overtimeHours: row.overtimeHours,
        approve: row.status === 'APPROVED',
        ratePct,
      }),
    })
    setBusy(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Could not change the rate.')
      return
    }
    load()
  }

  async function decide(row: Row, approve: boolean) {
    let note: string | null = null
    if (!approve) {
      note = window.prompt(
        `Why is ${row.employee.fullName}'s ${formatHours(row.overtimeHours)} of overtime not being approved? They will see this.`,
        '',
      )
      if (note === null) return
    }
    setBusy(row.id)
    const res = await fetch('/api/attendance/overtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendanceLogId: row.id,
        overtimeHours: row.overtimeHours,
        approve,
        ratePct: row.ratePct,
        ...(note ? { note } : {}),
      }),
    })
    setBusy(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Could not record that decision.')
      return
    }
    load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overtime</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Every hour claimed, the rate applied and what it is worth
        </p>
      </div>

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Hours in view" value={formatHours(totals.hours)} />
          <Stat label="Approved hours" value={formatHours(totals.approvedHours)} />
          <Stat label="Approved value" value={`PKR ${money(totals.approvedAmount)}`} />
          <Stat label="Awaiting approval" value={String(totals.pending)} />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                'px-3 py-1 rounded-full text-xs font-medium transition-colors ' +
                (tab === t.key
                  ? 'bg-[#005691] text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200')
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-700 px-4 py-2">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}

        {loading ? (
          <p className="text-center py-12 text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-14">
            <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No overtime in this view</p>
            <p className="text-xs text-slate-500 mt-1">
              Overtime appears here once hours beyond the standard day are logged.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <Th>Employee</Th>
                  <Th>Date</Th>
                  <Th right>Worked</Th>
                  <Th right>Overtime</Th>
                  <Th>Rate applied</Th>
                  <Th right>Value</Th>
                  <Th>Decided by</Th>
                  <Th>Status</Th>
                  {canDecide && <Th right>Action</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{r.employee.fullName}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.employee.employeeCode}
                        {r.employee.designation ? ` · ${r.employee.designation}` : ''}
                      </p>
                      {r.note && <p className="text-[11px] text-slate-600 italic mt-1">{r.note}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums whitespace-nowrap">
                      {r.hoursWorked != null ? `${r.hoursWorked.toFixed(1)} h` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatHours(r.overtimeHours)}
                    </td>
                    <td className="px-4 py-3">
                      {canDecide && r.status !== 'REJECTED' ? (
                        <select
                          value={r.ratePct}
                          disabled={busy === r.id}
                          onChange={(e) => setRate(r, Number(e.target.value))}
                          className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white"
                        >
                          {OT_RATES.map((o) => (
                            <option key={o.pct} value={o.pct}>{o.pct}%</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-700 tabular-nums">{r.ratePct}%</span>
                      )}
                      {r.hourlyRate != null && (
                        <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                          PKR {money(r.hourlyRate)}/h
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {r.amount != null
                        ? <span className={r.status === 'APPROVED' ? 'font-semibold text-slate-900' : 'text-slate-500'}>
                            {money(r.amount)}
                          </span>
                        : <span className="text-slate-400" title="No salary on record for this employee">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-600 whitespace-nowrap">
                      {r.decidedBy ?? <span className="text-slate-400">—</span>}
                      {r.decidedAt && (
                        <p className="text-slate-400">
                          {new Date(r.decidedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap ${OT_STATUS_TONE[r.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {OT_STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    {canDecide && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {busy === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                          ) : r.status === 'PENDING' ? (
                            <>
                              <button
                                onClick={() => decide(r, true)}
                                className="inline-flex items-center gap-1 rounded-md bg-slate-900 text-white text-[11px] px-2 py-1"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => decide(r, false)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 text-slate-700 text-[11px] px-2 py-1 hover:bg-slate-50"
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => decide(r, r.status !== 'APPROVED')}
                              className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline"
                            >
                              {r.status === 'APPROVED' ? 'Withdraw approval' : 'Approve after all'}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        Value is worked out from the monthly salary over a standard month of{' '}
        {STANDARD_WORKING_DAYS} days at {STANDARD_HOURS_PER_DAY} hours — Convertt records a
        monthly figure, so the hourly one has to be derived. It is an indication for the payroll
        run, not a posted payment.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
