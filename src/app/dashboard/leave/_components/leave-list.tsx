'use client'

/**
 * Shared list for Leave Requests / Leave Approved and their WFH twins.
 *
 * The reason has its own column now. Tucked under the employee's name it read
 * as a caption on the person rather than a fact about the request, and the two
 * approvals — lead first, HR second — had nowhere to show at all, so an
 * approved row could not say who approved it.
 *
 * The weekday stays visible: a Monday or Friday absence reads very differently
 * from a midweek one, and it is the first thing anyone checks for a pattern.
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Paperclip, AlertCircle, Pencil, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_TONE, formatDays } from '@/lib/leave-types'

type LeaveRow = {
  id: string
  category?: string
  leaveType: string
  fromDate: string
  toDate: string
  days: number
  status: string
  reason: string
  statusLabel?: string
  firstDayHalf?: boolean
  lastDayHalf?: boolean
  attachmentName?: string | null
  approvedByLead?: string | null
  approvedByHr?: string | null
  employee: { fullName: string; employeeCode: string; designation: string | null }
}

interface Props {
  title: string
  subtitle: string
  statuses: string[] // e.g. ['PENDING','PENDING_HR'] or ['APPROVED']
  category?: 'LEAVE' | 'WFH'
  /** HR only — lets a record be re-typed and given its reason. */
  canEdit?: boolean
}

type SandwichInfo = {
  applies: boolean
  windows: Array<{ trigger: 'FRIDAY' | 'MONDAY'; triggerDate: string; dates: string[] }>
  dates: string[]
  days: number
  money: { perDay: number; amount: number; divisor: number; fullMonthNet: number; month: number; year: number } | null
  existing: { id: string; status: string; days: number; amount: number; note: string | null; warningSentAt: string | null } | null
}

/** Marker the attendance backfill leaves on rows nobody has confirmed yet. */
const UNCONFIRMED = 'not yet recorded'

const EDITABLE_TYPES = ['CASUAL', 'SICK', 'UNPAID', 'ANNUAL', 'MATERNITY', 'PATERNITY']

const TYPE_TONE: Record<string, string> = {
  SICK: 'bg-rose-50 text-rose-700 border-rose-200',
  CASUAL: 'bg-sky-50 text-sky-700 border-sky-200',
  ANNUAL: 'bg-violet-50 text-violet-700 border-violet-200',
  UNPAID: 'bg-slate-100 text-slate-600 border-slate-200',
}

const fmt = (iso: string, withYear = false) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  })

export function LeaveList({ title, subtitle, statuses, category = 'LEAVE', canEdit = false }: Props) {
  const [rows, setRows] = useState<LeaveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<LeaveRow | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    return Promise.all(
      statuses.map((s) =>
        fetch(`/api/leave?status=${encodeURIComponent(s)}&category=${category}`).then((r) =>
          r.ok ? r.json() : { requests: [] },
        ),
      ),
    )
      .then((results) => {
        const all = results.flatMap((r: { requests?: LeaveRow[] }) => r.requests ?? [])
        const seen = new Set<string>()
        const merged: LeaveRow[] = []
        for (const r of all) {
          if (!seen.has(r.id)) { seen.add(r.id); merged.push(r) }
        }
        merged.sort((a, b) => new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime())
        setRows(merged)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses.join(','), category])

  useEffect(() => { load() }, [load])

  const needsReason = rows.filter((r) => r.reason?.includes(UNCONFIRMED)).length
  const isWfh = category === 'WFH'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {subtitle}
          {rows.length > 0 && <> · {rows.length} record{rows.length === 1 ? '' : 's'}</>}
        </p>
      </div>

      {needsReason > 0 && (
        <p className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {needsReason} record{needsReason === 1 ? '' : 's'} still need a reason and leave type
          confirming — they were reconstructed from attendance.
          {canEdit && <> Use <strong>Edit</strong> on the row to set them.</>}
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {loading && <p className="text-center py-10 text-slate-400 text-sm">Loading…</p>}
          {error && <p className="text-center py-10 text-slate-700 text-sm">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-sm">No requests in this view.</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <Th>Employee</Th>
                    <Th>Reason</Th>
                    {!isWfh && <Th>Type</Th>}
                    <Th>Dates</Th>
                    <Th right>Days</Th>
                    <Th>Approved by lead</Th>
                    <Th>Approved by HR</Th>
                    <Th>Status</Th>
                    {canEdit && <Th right>Edit</Th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const single = r.fromDate.slice(0, 10) === r.toDate.slice(0, 10)
                    const unconfirmed = r.reason?.includes(UNCONFIRMED)
                    return (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/leave/${r.id}`}
                            className="font-medium text-slate-900 hover:underline whitespace-nowrap"
                          >
                            {r.employee?.fullName ?? '—'}
                          </Link>
                          <p className="text-xs text-slate-500">{r.employee?.designation ?? ''}</p>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          {r.reason ? (
                            <p className={`text-xs ${unconfirmed ? 'text-amber-700 italic' : 'text-slate-700'}`}>
                              {r.reason}
                            </p>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                          {r.attachmentName && (
                            <Link
                              href={`/dashboard/leave/${r.id}`}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 mt-1"
                            >
                              <Paperclip className="w-3 h-3" />
                              {r.attachmentName}
                            </Link>
                          )}
                        </td>
                        {!isWfh && (
                          <td className="px-4 py-3">
                            <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${TYPE_TONE[r.leaveType] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {r.leaveType}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {single ? (
                            fmt(r.fromDate, true)
                          ) : (
                            <>
                              {fmt(r.fromDate)}
                              <span className="text-slate-400"> → </span>
                              {fmt(r.toDate, true)}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 text-right whitespace-nowrap">
                          {formatDays(r.days)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {r.approvedByLead ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {r.approvedByHr ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={LEAVE_STATUS_TONE[r.status] ?? 'secondary'}>
                            {r.statusLabel ?? LEAVE_STATUS_LABELS[r.status] ?? r.status}
                          </Badge>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setEditing(r)}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                              title="Correct the type or fill in the reason"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EditDialog
          row={editing}
          isWfh={isWfh}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

/**
 * The whole record, editable.
 *
 * This used to offer Type and Reason only, on the grounds that moving dates
 * means rewriting the attendance the approval already wrote. The API does that
 * rewrite now, so the rest of the record is here: dates, day count, half days,
 * category and status.
 *
 * A Friday or a Monday in the range brings up the sandwich question. It is a
 * question rather than an automatic charge because the policy turns on whether
 * notice was given, and only HR knows that.
 */
function EditDialog({ row, isWfh, onClose, onSaved }: {
  row: LeaveRow
  isWfh: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [leaveType, setLeaveType] = useState(row.leaveType)
  const [category, setCategory] = useState(row.category ?? 'LEAVE')
  const [status, setStatus] = useState(row.status)
  const [fromDate, setFromDate] = useState(row.fromDate.slice(0, 10))
  const [toDate, setToDate] = useState(row.toDate.slice(0, 10))
  const [days, setDays] = useState(String(row.days))
  const [firstDayHalf, setFirstDayHalf] = useState(!!row.firstDayHalf)
  const [lastDayHalf, setLastDayHalf] = useState(!!row.lastDayHalf)
  const [reason, setReason] = useState(row.reason?.includes(UNCONFIRMED) ? '' : (row.reason ?? ''))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Sandwich
  const [sand, setSand] = useState<SandwichInfo | null>(null)
  const [applySandwich, setApplySandwich] = useState<boolean | null>(null)
  const [informed, setInformed] = useState(false)
  const [sandNote, setSandNote] = useState('')

  // Ask the server what the rule would cost. It knows the salary and the
  // public holidays; the browser knows neither.
  useEffect(() => {
    if (isWfh) return
    let live = true
    fetch(`/api/leave/${row.id}/sandwich`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SandwichInfo | null) => {
        if (!live || !d) return
        setSand(d)
        if (d.existing) setApplySandwich(d.existing.status === 'APPLIED')
      })
      .catch(() => { /* the dialog still works without it */ })
    return () => { live = false }
  }, [row.id, isWfh])

  async function save() {
    setSaving(true)
    setErr(null)
    const res = await fetch(`/api/leave/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveType, category, status, fromDate, toDate,
        days: Number(days),
        firstDayHalf, lastDayHalf, reason,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setSaving(false)
      setErr(j.error ?? 'Could not save that.')
      return
    }

    // The sandwich decision rides along with the save, so one trip through the
    // dialog settles both the record and what it costs.
    if (applySandwich !== null && sand?.applies) {
      const sres = await fetch(`/api/leave/${row.id}/sandwich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: applySandwich, informed, note: sandNote || null }),
      })
      if (!sres.ok) {
        const j = await sres.json().catch(() => ({}))
        setSaving(false)
        setErr(j.error ?? 'The record saved, but the sandwich decision did not.')
        return
      }
    }
    setSaving(false)
    onSaved()
  }

  const money = sand?.money
  const alreadyDecided = !!sand?.existing

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit record — {row.employee?.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="To">
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Days" hint="Blank recalculates from the dates.">
              <input
                type="number" min="0" step="0.5" value={days}
                onChange={(e) => setDays(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                {['PENDING', 'PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
                  <option key={s} value={s}>{LEAVE_STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                disabled={category === 'WFH'}
                className={inputCls}
              >
                {EDITABLE_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                <option value="LEAVE">Leave</option>
                <option value="WFH">Work from home</option>
              </select>
            </Field>
          </div>

          {status === 'APPROVED' && leaveType !== row.leaveType && category === 'LEAVE' && (
            <p className="text-[11px] text-amber-700">
              This is charged to {row.leaveType.toLowerCase()} — saving moves the charge to {leaveType.toLowerCase()}.
            </p>
          )}

          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={firstDayHalf} onChange={(e) => setFirstDayHalf(e.target.checked)} />
              First day is a half day
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={lastDayHalf} onChange={(e) => setLastDayHalf(e.target.checked)} />
              Last day is a half day
            </label>
          </div>

          <Field label="Reason">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="What the employee gave as the reason"
              className={inputCls}
            />
          </Field>

          {sand?.applies && money && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-900">
                This falls on a {sand.windows.map((w) => w.trigger === 'FRIDAY' ? 'Friday' : 'Monday').join(' and a ')}.
                Does the sandwich rule apply?
              </p>
              <p className="text-[11px] text-amber-800">
                Leave taken on a Friday or Monday without prior notice carries the weekend
                beside it — {sand.days} unpaid days
                {' ('}{sand.dates.map((d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' })).join(', ')}
                {'). '}
                A day is {pkrShort(money.perDay)} — net pay over {money.divisor} days — so this
                would deduct <strong>{pkrShort(money.amount)}</strong>.
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                <Choice active={applySandwich === true} onClick={() => setApplySandwich(true)}>
                  Apply — no notice given
                </Choice>
                <Choice active={applySandwich === false} onClick={() => setApplySandwich(false)}>
                  {alreadyDecided ? 'Waive it' : 'No — notice was given'}
                </Choice>
              </div>

              {applySandwich === true && (
                <>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-amber-900">
                    <input type="checkbox" checked={!informed} onChange={(e) => setInformed(!e.target.checked)} />
                    Neither HR nor their lead was told beforehand
                  </label>
                  <input
                    value={sandNote}
                    onChange={(e) => setSandNote(e.target.value)}
                    placeholder="Note for the record (optional)"
                    className="w-full px-2 py-1.5 rounded-md border border-amber-200 text-xs bg-white"
                  />
                  <p className="text-[11px] text-amber-700">
                    Saving records the deduction and drafts the warning email. Nothing is sent
                    until you send it from Sandwich Deductions.
                  </p>
                </>
              )}
              {alreadyDecided && (
                <p className="text-[11px] text-amber-700">
                  Already recorded as {sand.existing!.status === 'APPLIED' ? 'applied' : 'waived'}
                  {sand.existing!.warningSentAt ? ' · warning sent' : ''}.
                </p>
              )}
            </div>
          )}

          {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const inputCls = 'w-full text-sm rounded-md border border-slate-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500'

const pkrShort = (n: number) =>
  'PKR ' + n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-400 mt-0.5 block">{hint}</span>}
    </label>
  )
}

function Choice({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ' +
        (active
          ? 'bg-amber-900 text-white border-amber-900'
          : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100')
      }
    >
      {children}
    </button>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
