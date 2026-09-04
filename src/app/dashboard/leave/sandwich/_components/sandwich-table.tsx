'use client'

/**
 * Sandwich deductions — the unpaid days a Friday or Monday absence cost.
 *
 * Every row can be waived and reinstated, because the decision behind it is a
 * judgement about whether notice was given, and judgements get revisited when
 * the person explains themselves.
 *
 * The warning letter opens editable. Copy puts it on the clipboard for HR to
 * paste into Gmail, which is how mail actually leaves this company today;
 * Send goes through the system, and says plainly when the system can only
 * queue it.
 */

import { useEffect, useState, useCallback } from 'react'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Mail, Copy, Check, Loader2, Undo2, Ban, Calculator, Trash2, MoreHorizontal } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

interface Row {
  id: string
  trigger: string
  triggerDate: string
  dates: string[]
  days: number
  month: number
  year: number
  fullMonthNet: number
  divisorDays: number
  perDayAmount: number
  amount: number
  status: string
  note: string | null
  warningSubject: string | null
  warningBody: string | null
  warningSentAt: string | null
  warningSentTo: string | null
  employee: { id: string; fullName: string; employeeCode: string; designation: string | null; email: string | null }
  leaveRequest: { id: string; leaveType: string; reason: string } | null
}

interface Pending {
  leaveId: string
  employee: { id: string; fullName: string; employeeCode: string; designation: string | null }
  leaveType: string
  reason: string
  fromDate: string
  toDate: string
  trigger: string
  triggerDate: string
  dates: string[]
  days: number
  exempt: boolean
  exemptReason: string | null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const pkr = (n: number) =>
  'PKR ' + n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Takes either "2026-07-31" or a full ISO timestamp — the API sends both, and
// blindly appending a time to the second produced "Invalid Date" on screen.
const shortDay = (d: string) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })

export function SandwichTable() {
  const [rows, setRows] = useState<Row[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [writing, setWriting] = useState<string | null>(null)
  const [letter, setLetter] = useState<Row | null>(null)
  const [sums, setSums] = useState<Row | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    return fetch('/api/sandwich')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load deductions'))))
      .then((d) => { setRows(d.deductions ?? []); setPending(d.pending ?? []) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  /** Answer the question on a leave nobody has ruled on yet. */
  async function decide(pnd: Pending, apply: boolean) {
    setWriting(pnd.leaveId)
    const res = await fetch(`/api/leave/${pnd.leaveId}/sandwich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apply, informed: !apply }),
    })
    setWriting(null)
    if (res.ok) {
      toastSuccess(apply
        ? `Sandwich applied to ${pnd.employee.fullName}`
        : `${pnd.employee.fullName} — no deduction recorded`)
    } else {
      toastError('That decision was not recorded', (await res.json().catch(() => ({}))).error)
    }
    load()
  }

  async function remove(row: Row) {
    if (!confirm(
      `Delete the ${row.days}-day deduction for ${row.employee.fullName}? `
      + 'Waive keeps the record and stops the charge; this removes it entirely.',
    )) return
    setWriting(row.id)
    const res = await fetch(`/api/sandwich/${row.id}`, { method: 'DELETE' })
    setWriting(null)
    if (res.ok) toastSuccess(`Deduction removed for ${row.employee.fullName}`)
    else toastError('That record was not removed', (await res.json().catch(() => ({}))).error)
    load()
  }

  async function setStatus(row: Row, status: 'APPLIED' | 'WAIVED') {
    setWriting(row.id)
    const res = await fetch(`/api/sandwich/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setWriting(null)
    if (res.ok) {
      toastSuccess(status === 'WAIVED'
        ? `Waived — ${row.employee.fullName} will not be charged`
        : `Reinstated — ${pkr(row.amount)} will be charged`)
    } else {
      toastError('That change was not saved', (await res.json().catch(() => ({}))).error)
    }
    load()
  }

  const applied = rows.filter((r) => r.status === 'APPLIED')
  const total = applied.reduce((s, r) => s + r.amount, 0)
  const totalDays = applied.reduce((s, r) => s + r.days, 0)

  if (loading) return <p className="text-sm text-slate-400 py-10 text-center">Loading…</p>
  if (error) return <p className="text-sm text-red-700">{error}</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Applied" value={String(applied.length)} sub={`of ${rows.length} recorded`} />
        <Stat label="Unpaid days" value={String(totalDays)} sub="charged to pay" />
        <Stat label="Total deduction" value={pkr(total)} sub="across all months" />
        <Stat
          label="Warnings sent"
          value={String(rows.filter((r) => r.warningSentAt).length)}
          sub={`of ${rows.length}`}
        />
      </div>

      {pending.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">
              Waiting on you · {pending.length}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Leave sitting on a Friday or a Monday that nobody has ruled on. Nothing is
              charged until you say so — the rule turns on whether notice was given, and
              only you know that.
            </p>
          </div>
          <div className="divide-y divide-slate-50">
            {pending.map((pnd) => (
              <div key={pnd.leaveId} className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">
                    <span className="font-medium">{pnd.employee.fullName}</span>
                    <span className="text-slate-500"> · {shortDay(pnd.triggerDate)}</span>
                    <span className={`ml-2 inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                      pnd.exempt
                        ? 'bg-slate-50 text-slate-500 border-slate-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>{pnd.leaveType}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 max-w-2xl">
                    {pnd.exempt
                      ? pnd.exemptReason
                      : `Would charge ${pnd.days} unpaid days — ${pnd.dates.map(shortDay).join(', ')}.`}
                  </p>
                  {pnd.reason && (
                    <p className="text-[11px] text-slate-400 mt-0.5 max-w-2xl line-clamp-2">{pnd.reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    disabled={writing === pnd.leaveId}
                    onClick={() => decide(pnd, true)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  >
                    {writing === pnd.leaveId && <Loader2 className="w-3 h-3 animate-spin" />}
                    Apply sandwich
                  </button>
                  <button
                    type="button"
                    disabled={writing === pnd.leaveId}
                    onClick={() => decide(pnd, false)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  >
                    Not applicable
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12 border border-slate-200 rounded-xl bg-white">
          Nothing recorded. A deduction appears here when you apply the sandwich rule
          to a Friday or Monday leave from the Edit dialog on a leave record.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <Th>Employee</Th><Th>Trigger</Th><Th>Unpaid days</Th>
                  <Th>Month</Th><Th right>Per day</Th><Th right>Deduction</Th>
                  <Th>Status</Th><Th>Warning</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                    <td className="px-4 py-2.5">
                      <p className="text-slate-900 font-medium">{r.employee.fullName}</p>
                      <p className="text-[11px] text-slate-500">{r.employee.designation ?? r.employee.employeeCode}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                      {shortDay(r.triggerDate)}
                      <span className="block text-[11px] text-slate-400">
                        {r.trigger === 'FRIDAY' ? 'Friday' : 'Monday'}
                        {r.leaveRequest ? ` · ${r.leaveRequest.leaveType.toLowerCase()}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-[11px]">
                      {r.dates.map((d) => <span key={d} className="block whitespace-nowrap">{shortDay(d)}</span>)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                      {MONTHS[r.month - 1]} {r.year}
                      <span className="block text-[11px] text-slate-400">{r.divisorDays} days</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums whitespace-nowrap">
                      {pkr(r.perDayAmount)}
                      <span className="block text-[11px] text-slate-400">net ÷ {r.divisorDays}</span>
                    </td>
                    {/* The number is the button. "Calculation" was a pill in the
                        actions column explaining a figure two columns away; it
                        belongs on the figure. */}
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSums(r)}
                        title="See how this was worked out"
                        className="group inline-flex flex-col items-end"
                      >
                        <span className={`tabular-nums font-medium underline decoration-dotted decoration-slate-300 underline-offset-4 group-hover:decoration-slate-500 ${
                          r.status === 'WAIVED' ? 'text-slate-400 line-through' : 'text-slate-900'
                        }`}>
                          {pkr(r.amount)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400 font-normal">
                          <Calculator className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          {r.days} days
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        r.status === 'APPLIED'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {r.status === 'APPLIED' ? 'Applied' : 'Waived'}
                      </span>
                      {r.note && <p className="text-[11px] text-slate-400 mt-1 max-w-[14rem]">{r.note}</p>}
                    </td>
                    {/* Status and action in one place. The column said "Not sent"
                        while the button that sends it sat four columns away. */}
                    <td className="px-4 py-2.5 text-[11px] whitespace-nowrap">
                      {r.warningSentAt ? (
                        <>
                          <span className="text-slate-600">
                            Sent {new Date(r.warningSentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                          <button
                            type="button"
                            onClick={() => setLetter(r)}
                            className="block text-slate-400 hover:text-slate-700 underline underline-offset-2"
                          >
                            Send again
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLetter(r)}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900"
                        >
                          <Mail className="w-3 h-3" />
                          <span className="underline underline-offset-2 decoration-slate-300">Send warning</span>
                        </button>
                      )}
                    </td>
                    {/* One decision, and a menu for the rest. Four pills of
                        identical weight per row — 172 of them down the page —
                        made the destructive one look like the others and the
                        real decision look like none of them. */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          disabled={writing === r.id}
                          onClick={() => setStatus(r, r.status === 'APPLIED' ? 'WAIVED' : 'APPLIED')}
                          className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-40 ${
                            r.status === 'APPLIED'
                              ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                              : 'border-transparent bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          {writing === r.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : r.status === 'APPLIED' ? <Ban className="w-3.5 h-3.5" /> : <Undo2 className="w-3.5 h-3.5" />}
                          {r.status === 'APPLIED' ? 'Waive' : 'Reinstate'}
                        </button>

                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              type="button"
                              aria-label={`More for ${r.employee.fullName}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 data-[state=open]:bg-slate-100"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              align="end"
                              sideOffset={4}
                              className="z-50 min-w-[210px] rounded-xl border border-slate-200 bg-white shadow-lg p-1.5 text-[13px]"
                            >
                              <DropdownMenu.Item
                                onSelect={() => setSums(r)}
                                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-700 outline-none data-[highlighted]:bg-slate-50 cursor-pointer"
                              >
                                <Calculator className="w-3.5 h-3.5 text-slate-400" /> See the calculation
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                onSelect={() => setLetter(r)}
                                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-700 outline-none data-[highlighted]:bg-slate-50 cursor-pointer"
                              >
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                {r.warningSentAt ? 'Send the warning again' : 'Send a warning'}
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="h-px bg-slate-100 my-1" />
                              {/* Removing is not the same as waiving, and it is
                                  the only thing here that cannot be undone —
                                  so it sits apart, in red, behind the menu. */}
                              <DropdownMenu.Item
                                onSelect={(e) => {
                                  // Let the menu finish closing before a
                                  // blocking confirm() takes over the thread.
                                  e.preventDefault()
                                  setTimeout(() => remove(r), 0)
                                }}
                                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-red-700 outline-none data-[highlighted]:bg-red-50 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove this record
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        A day is worth a full month&apos;s net pay divided by the calendar length of that month,
        and the unpaid days are charged against net. Waiving a row keeps the record and stops
        the charge — the history of what was decided is worth more than a tidy list.
      </p>

      {sums && (
        <CalculationDialog
          row={sums}
          all={rows}
          onClose={() => setSums(null)}
          onSaved={() => { setSums(null); load() }}
        />
      )}

      {letter && (
        <WarningDialog row={letter} onClose={() => setLetter(null)} onSent={() => { setLetter(null); load() }} />
      )}
    </div>
  )
}

/**
 * How the number was arrived at, line by line.
 *
 * A deduction that lands on somebody's payslip has to be explainable without
 * anyone reaching for a calculator — the person it is taken from will ask, and
 * "the system worked it out" is not an answer.
 */
function CalculationDialog({ row, all, onClose, onSaved }: {
  row: Row; all: Row[]; onClose: () => void; onSaved: () => void
}) {
  const [net, setNet] = useState(String(row.fullMonthNet))
  const [divisor, setDivisor] = useState(String(row.divisorDays))
  const [days, setDays] = useState(String(row.days))
  const [perDay, setPerDay] = useState(String(row.perDayAmount))
  const [amount, setAmount] = useState(String(row.amount))
  const [linked, setLinked] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // While the figures are linked the two derived lines follow the three that
  // are typed. Unlinking is for the month somebody agreed a different number
  // — the arithmetic is the default, not the law.
  function recalc(nextNet: string, nextDivisor: string, nextDays: string) {
    if (!linked) return
    const n = Number(nextNet)
    const dv = Number(nextDivisor)
    const dy = Number(nextDays)
    if (!Number.isFinite(n) || !Number.isFinite(dv) || dv <= 0 || !Number.isFinite(dy)) return
    const pd = Math.round((n / dv) * 100) / 100
    setPerDay(String(pd))
    setAmount(String(Math.round(pd * dy * 100) / 100))
  }

  const mine = all.filter((r) => r.employee.id === row.employee.id && r.status === 'APPLIED')
  const cumulative = mine.reduce((n, r) => n + (r.id === row.id ? Number(amount) || 0 : r.amount), 0)
  const cumulativeDays = mine.reduce((n, r) => n + (r.id === row.id ? Number(days) || 0 : r.days), 0)
  const dirty =
    Number(net) !== row.fullMonthNet || Number(divisor) !== row.divisorDays ||
    Number(days) !== row.days || Number(perDay) !== row.perDayAmount ||
    Number(amount) !== row.amount

  async function save() {
    setBusy(true); setErr(null)
    const res = await fetch(`/api/sandwich/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullMonthNet: net, divisorDays: divisor, days,
        perDayAmount: perDay, amount,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not save that.')
      return
    }
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-slate-100 pb-3">
          <DialogTitle>Calculation — {row.employee.fullName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {MONTHS[row.month - 1]} {row.year} · {row.trigger === 'FRIDAY' ? 'Friday' : 'Monday'}{' '}
            {shortDay(row.triggerDate)}
            {row.leaveRequest ? ` · ${row.leaveRequest.leaveType.toLowerCase()}` : ''}
          </p>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Row3 label="Net pay for a full month" hint="as actually paid that month">
              <Num value={net} onChange={(v) => { setNet(v); recalc(v, divisor, days) }} />
            </Row3>
            <Row3 label={`Days in ${MONTHS[row.month - 1]}`} hint="calendar days, not working days">
              <Num value={divisor} onChange={(v) => { setDivisor(v); recalc(net, v, days) }} step="1" />
            </Row3>
            <Row3 label="Unpaid days" hint={row.dates.map(shortDay).join(', ')}>
              <Num value={days} onChange={(v) => { setDays(v); recalc(net, divisor, v) }} step="0.5" />
            </Row3>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
            Work the last two out from the three above
          </label>

          <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50/60">
            <Row3 label="One day of salary" hint={`${pkr(Number(net) || 0)} ÷ ${divisor}`}>
              <Num value={perDay} onChange={setPerDay} readOnly={linked} />
            </Row3>
            <Row3 label="Total deduction" hint={`${pkr(Number(perDay) || 0)} × ${days}`} strong>
              <Num value={amount} onChange={setAmount} readOnly={linked} strong />
            </Row3>
          </div>

          <div className="flex items-baseline justify-between gap-3 px-1">
            <div>
              <p className="text-sm font-medium text-slate-700">Charged to date</p>
              <p className="text-[11px] text-slate-400">
                {mine.length === 0
                  ? 'nothing applied against them'
                  : `${mine.length} deduction${mine.length === 1 ? '' : 's'} · ${cumulativeDays} unpaid days`}
              </p>
            </div>
            <p className="tabular-nums font-semibold text-slate-900">{pkr(cumulative)}</p>
          </div>

          {row.status !== 'APPLIED' && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              Waived — recorded but not charged, so it is not in the total above.
            </p>
          )}
          {dirty && (
            <p className="text-[11px] text-slate-500">
              Changing these does not rewrite the warning letter. Use Reset to the record on it
              afterwards so the two agree.
            </p>
          )}
          {err && <p className="text-xs text-red-700">{err}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <Button onClick={save} disabled={busy || !dirty}>
            {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row3({ label, hint, strong, children }: {
  label: string; hint?: string; strong?: boolean; children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 last:border-b-0">
      <div className="min-w-0">
        <p className={`text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{label}</p>
        {hint && <p className="text-[11px] text-slate-400 truncate">{hint}</p>}
      </div>
      <div className="w-40 flex-shrink-0">{children}</div>
    </div>
  )
}

function Num({ value, onChange, step = '0.01', readOnly, strong }: {
  value: string; onChange: (v: string) => void
  step?: string; readOnly?: boolean; strong?: boolean
}) {
  return (
    <input
      type="number"
      min="0"
      step={step}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      className={
        'w-full text-right tabular-nums rounded-md border px-2 py-1.5 text-sm '
        + (readOnly
          ? 'border-transparent bg-transparent text-slate-900 '
          : 'border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 ')
        + (strong ? 'font-bold' : '')
      }
    />
  )
}

function WarningDialog({ row, onClose, onSent }: {
  row: Row; onClose: () => void; onSent: () => void
}) {
  const [subject, setSubject] = useState(row.warningSubject ?? '')
  const [body, setBody] = useState(row.warningBody ?? '')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Does the letter still describe the record? Cheap and blunt on purpose —
  // the amount and the day count are the two things that must appear, and a
  // letter missing either has drifted from what it is charging.
  const drifted = !!body && (
    !body.includes(pkr(row.amount))
    || !new RegExp(`\b${row.days} unpaid days\b`).test(body)
  )

  async function regenerate() {
    setBusy(true); setErr(null); setMsg(null)
    const res = await fetch(`/api/sandwich/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regenerate: true }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(d.error ?? 'Could not rebuild it.'); return }
    setSubject(d.deduction?.warningSubject ?? '')
    setBody(d.deduction?.warningBody ?? '')
    setMsg('Rebuilt from the record.')
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setErr('The browser would not give access to the clipboard — select the text and copy it.')
    }
  }

  async function save() {
    setBusy(true); setErr(null)
    await fetch(`/api/sandwich/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warningSubject: subject, warningBody: body }),
    })
    setBusy(false)
    setMsg('Saved.')
  }

  async function send() {
    setBusy(true); setErr(null); setMsg(null)
    const res = await fetch(`/api/sandwich/${row.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(d.error ?? 'Could not send it.'); return }
    if (d.delivered) { onSent(); return }
    // Queued, not delivered — say so rather than letting it read as sent.
    setMsg(
      `Stored for ${d.to}, but not delivered — no mail server is configured, so nothing `
      + 'has actually left the system. Use Copy and send it from Gmail.',
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-slate-100 pb-3">
          <DialogTitle>Warning — {row.employee.fullName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            To {row.employee.email ?? <span className="text-amber-700">no address on file</span>}
            {' · '}{row.days} unpaid days{' · '}{pkr(row.amount)}
          </p>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm leading-relaxed"
            />
          </label>

          {drifted && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded p-2">
              This letter no longer states {pkr(row.amount)} and {row.days} unpaid days, which is
              what the record says. Edited text is kept as written — use Reset to the record if it
              has drifted.
            </p>
          )}
          {msg && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">{msg}</p>}
          {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="outline" onClick={copy} disabled={busy}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="outline" onClick={regenerate} disabled={busy}>Reset to the record</Button>
          <Button variant="outline" onClick={save} disabled={busy}>Save draft</Button>
          <Button onClick={send} disabled={busy || !row.employee.email}>
            {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Send through the system
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
