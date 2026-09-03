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
  attachmentMime?: string | null
  notifiedAt?: string | null
  notifiedVia?: string | null
  approvedByLead?: string | null
  approvedByHr?: string | null
  rejectedReason?: string | null
  rejectedBy?: string | null
  managerApprovedById?: string | null
  approvedById?: string | null
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
  exempt: boolean
  exemptReason: string | null
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

const VIA_LABEL: Record<string, string> = {
  EMAIL: 'email',
  WHATSAPP: 'WhatsApp',
  CALL: 'call',
  IN_PERSON: 'in person',
  OTHER: 'other',
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC',
  })

/**
 * How much notice that was. "On the day" and "2 days before" are the answer to
 * the only question the sandwich rule asks, and a bare timestamp does not give
 * it — you would have to hold the leave date in your head to work it out.
 */
function noticeLabel(notifiedIso: string, fromIso: string): string {
  const n = new Date(notifiedIso); const f = new Date(fromIso)
  const days = Math.round(
    (Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate())
      - Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())) / 86_400_000,
  )
  if (days === 0) return 'on the day'
  if (days === 1) return 'day before'
  if (days > 1) return `${days} days before`
  return days === -1 ? 'day after' : `${Math.abs(days)} days after`
}

/** "JPEG" / "PDF" — the label on the evidence chip, kept to one short word. */
function fileKind(name: string, mime?: string | null): string {
  const ext = name.split('.').pop()?.toUpperCase() ?? ''
  if (ext && ext.length <= 4) return ext === 'JPG' ? 'JPEG' : ext
  if (mime?.includes('pdf')) return 'PDF'
  if (mime?.includes('image')) return 'Image'
  return 'File'
}

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
                    <Th>Notified</Th>
                    <Th>Evidence</Th>
                    <Th>Approved by</Th>
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
                          {/* Why it was turned down, next to what was asked for —
                              a rejected row without the reason tells you nothing. */}
                          {r.status === 'REJECTED' && r.rejectedReason && (
                            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1 mt-1">
                              <span className="font-semibold">Rejected:</span> {r.rejectedReason}
                              {r.rejectedBy ? ` — ${r.rejectedBy}` : ''}
                            </p>
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
                          <span className="block text-xs text-slate-400">{formatDays(r.days)}</span>
                        </td>
                        {/* When HR was actually told. Notice given is the whole
                            of the sandwich rule's question, so it is a column
                            rather than a sentence buried in the reason. */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {r.notifiedAt ? (
                            <>
                              <span className="text-slate-700 tabular-nums">{fmtTime(r.notifiedAt)}</span>
                              <span className="block text-xs text-slate-400">
                                {noticeLabel(r.notifiedAt, r.fromDate)}
                                {r.notifiedVia ? ` · ${VIA_LABEL[r.notifiedVia] ?? r.notifiedVia.toLowerCase()}` : ''}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        {/* Evidence, on its own. Tucked under the reason it read
                            as a footnote to the prose rather than the thing an
                            approver has to look at. */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {r.attachmentName ? (
                            <Link
                              href={`/dashboard/leave/${r.id}`}
                              title={r.attachmentName}
                              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            >
                              <Paperclip className="w-3 h-3 flex-shrink-0" />
                              {fileKind(r.attachmentName, r.attachmentMime)}
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                              <Paperclip className="w-3 h-3" /> none
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {r.approvedByLead || r.approvedByHr ? (
                            <>
                              <span className="block text-slate-700">
                                {r.approvedByLead ?? <span className="text-slate-300">no lead</span>}
                              </span>
                              <span className="block text-slate-400">
                                {r.approvedByHr ? `HR · ${r.approvedByHr}` : 'HR · —'}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
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
  // Who signed it off. A leave agreed over email still has a lead and an HR
  // behind it; without these the record shows a dash where the approver goes.
  // Notice given, as data. The datetime-local input wants "YYYY-MM-DDTHH:mm";
  // the stored value is UTC, so slice rather than re-derive through a timezone.
  const [notifiedAt, setNotifiedAt] = useState(row.notifiedAt ? row.notifiedAt.slice(0, 16) : '')
  const [notifiedVia, setNotifiedVia] = useState(row.notifiedVia ?? '')
  const [leadId, setLeadId] = useState(row.managerApprovedById ?? '')
  const [hrId, setHrId] = useState(row.approvedById ?? '')
  // Each side of the approval chain gets its own pool. Offering all 26
  // employees in both pickers is how a designer ends up recorded as the HR
  // sign-off; the lead list is leadership by designation, the HR list is the
  // HR team.
  // Evidence picked in this dialog, held as base64 until Save. null means
  // "leave whatever is on the record alone"; '' means "remove it".
  const [evidence, setEvidence] = useState<{ base64: string; mime: string; name: string } | null>(null)
  const [clearEvidence, setClearEvidence] = useState(false)
  const [evidenceErr, setEvidenceErr] = useState<string | null>(null)

  type Person = { id: string; fullName: string; employeeCode: string }
  const [leads, setLeads] = useState<Person[]>([])
  const [hrStaff, setHrStaff] = useState<Person[]>([])
  useEffect(() => {
    fetch('/api/employees?limit=500&status=ACTIVE&leadsOnly=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.employees) setLeads(d.employees) })
      .catch(() => {})
    fetch('/api/employees?limit=500&status=ACTIVE&hrOnly=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.employees) setHrStaff(d.employees) })
      .catch(() => {})
  }, [])

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
        notifiedAt: notifiedAt ? `${notifiedAt}:00.000Z` : '',
        notifiedVia,
        managerApprovedById: leadId, approvedById: hrId,
        ...(evidence
          ? { attachmentBase64: evidence.base64, attachmentMime: evidence.mime, attachmentName: evidence.name }
          : clearEvidence
            ? { attachmentBase64: '' }
            : {}),
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

          {/* When HR was told, and how. This used to be a sentence inside the
              reason — "Emailed HR at 5:03 PM on the day" — which could not be
              sorted, compared, or checked against the leave date. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="HR notified at">
              <input
                type="datetime-local"
                value={notifiedAt}
                onChange={(e) => setNotifiedAt(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="How">
              <select
                value={notifiedVia}
                onChange={(e) => setNotifiedVia(e.target.value)}
                className={inputCls}
              >
                <option value="">— not recorded —</option>
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="CALL">Call</option>
                <option value="IN_PERSON">In person</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
          </div>

          {/* Who signed it off. Recorded after the fact for leaves agreed over
              email, so the register names the lead and the HR rather than a dash. */}
          {/* Supporting evidence — the medical slip or note behind a WFH day or
              sick leave agreed over email. Some requests have one, some do not,
              so it is optional and replaceable rather than required. */}
          <Field label="Supporting evidence" hint="PDF or image, up to 5MB. Optional.">
            <div className="space-y-1.5">
              {row.attachmentName && !evidence && !clearEvidence && (
                <div className="flex items-center gap-2 text-xs">
                  <a
                    href={`/api/leave/${row.id}/attachment`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-slate-700 hover:underline"
                  >
                    <Paperclip className="w-3 h-3" /> {row.attachmentName}
                  </a>
                  <button
                    type="button"
                    onClick={() => setClearEvidence(true)}
                    className="text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
              {clearEvidence && (
                <p className="text-xs text-amber-700">
                  Evidence will be removed on save.{' '}
                  <button type="button" className="underline" onClick={() => setClearEvidence(false)}>Undo</button>
                </p>
              )}
              {evidence && (
                <p className="text-xs text-emerald-700">
                  New file ready: {evidence.name}{' '}
                  <button type="button" className="underline" onClick={() => setEvidence(null)}>Undo</button>
                </p>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-2 file:py-1 file:text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setEvidenceErr(null)
                  if (f.size > 5 * 1024 * 1024) { setEvidenceErr('That file is larger than 5MB.'); return }
                  const reader = new FileReader()
                  reader.onload = () => {
                    const res = String(reader.result ?? '')
                    setEvidence({ base64: res.replace(/^data:[^;]+;base64,/, ''), mime: f.type || 'application/octet-stream', name: f.name })
                    setClearEvidence(false)
                  }
                  reader.readAsDataURL(f)
                }}
              />
              {evidenceErr && <p className="text-xs text-red-600">{evidenceErr}</p>}
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Approved by (Lead / Manager)" hint="Stage 1 sign-off">
              <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={inputCls}>
                <option value="">— Not recorded —</option>
                {leads.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName} ({p.employeeCode})</option>
                ))}
              </select>
            </Field>
            <Field label="Approved by (HR)" hint="Final sign-off">
              <select value={hrId} onChange={(e) => setHrId(e.target.value)} className={inputCls}>
                <option value="">— Not recorded —</option>
                {hrStaff.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName} ({p.employeeCode})</option>
                ))}
              </select>
            </Field>
          </div>

          {sand?.applies && money && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-900">
                This falls on a {sand.windows.map((w) => w.trigger === 'FRIDAY' ? 'Friday' : 'Monday').join(' and a ')}.
                {sand.exempt ? ' The sandwich rule does not normally apply here.' : ' Does the sandwich rule apply?'}
              </p>
              {sand.exempt && (
                <p className="text-[11px] text-amber-900 bg-white/70 border border-amber-200 rounded p-1.5">
                  {sand.exemptReason} Only charge it if the absence was not what it
                  was called — someone who went quiet and named it afterwards.
                </p>
              )}
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
                  {sand.exempt ? 'Charge it anyway' : 'Apply — no notice given'}
                </Choice>
                <Choice active={applySandwich === false} onClick={() => setApplySandwich(false)}>
                  {alreadyDecided ? 'Waive it' : sand.exempt ? 'No — accepted as normal' : 'No — notice was given'}
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
