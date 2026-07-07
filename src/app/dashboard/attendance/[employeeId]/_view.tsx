'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer, CalendarPlus } from 'lucide-react'
import { StatusBadge, type Status } from '@/components/attendance/status-badge'
import { getInitials } from '@/lib/utils'

// Inline filterable legend — click a status to dim everything else across all
// month blocks. Click again to clear. 'WE' (weekend) intentionally not filterable.
const FILTER_OPTIONS: { status: Status; label: string }[] = [
  { status: 'P',   label: 'Present' },
  { status: 'WFH', label: 'WFH' },
  { status: 'L',   label: 'Leave' },
  { status: 'H',   label: 'Half Day' },
  { status: 'A',   label: 'Absent' },
]

function FilterableLegend({
  active,
  onToggle,
}: {
  active: Status | null
  onToggle: (s: Status) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTER_OPTIONS.map((opt) => {
        const isActive = active === opt.status
        return (
          <button
            key={opt.status}
            onClick={() => onToggle(opt.status)}
            className={
              'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition ' +
              (isActive
                ? 'bg-slate-50 ring-1 ring-slate-300 text-slate-900'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')
            }
            title={isActive ? 'Clear filter' : `Show only ${opt.label}`}
          >
            <StatusBadge status={opt.status} />
            {opt.label}
          </button>
        )
      })}
      {active && (
        <button
          onClick={() => onToggle(active)}
          className="text-[11px] text-slate-500 underline hover:text-slate-700"
        >
          Clear
        </button>
      )}
    </div>
  )
}

interface Cell {
  day: number
  iso: string
  status: Status
  isWeekend: boolean
  isFuture: boolean
  /** Day precedes the employee's joining date — rendered blank. */
  preJoin?: boolean
}

interface MonthTotals {
  present: number
  leave: number
  wfh: number
  hd: number
  absent: number
  holiday: number
}

interface MonthBlock {
  key: string
  label: string
  firstDow: number
  cells: Cell[]
  totals: MonthTotals
  /** Late clock-ins this month; null = no clock-in data (or hidden for this viewer). */
  late: number | null
}

interface LeaveRow {
  id: string
  leaveType: string
  fromDate: string
  toDate: string
  days: number
  status: string
  reason: string
}

interface LeaveBalanceRow {
  leaveType: string
  allocated: number
  used: number
  remaining: number
  year: number
}

interface Props {
  employee: {
    id: string
    fullName: string
    designation: string | null
    department: string
    photoUrl: string | null
  }
  months: MonthBlock[]
  ytd: { present: number; leave: number; wfh: number; hd: number; absent: number }
  recentLeaves: LeaveRow[]
  leaveBalances: LeaveBalanceRow[]
  /** ISO days (YYYY-MM-DD) with a PENDING correction request — dotted on the cell. */
  pendingCorrectionDays?: string[]
  /** Whether per-month late counts are shown (self or HR only; server-decided). */
  showLate?: boolean
  role: string
  /** True when the viewer is looking at their OWN attendance — enables
   *  "Request correction" on past day cells. Server-enforced self-only. */
  isSelf?: boolean
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending Manager',
  PENDING_HR: 'Pending HR',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-slate-700 bg-slate-50',
  PENDING_HR: 'text-slate-700 bg-slate-50',
  APPROVED: 'text-slate-700 bg-slate-50',
  REJECTED: 'text-slate-700 bg-slate-50',
  CANCELLED: 'text-slate-600 bg-slate-100',
}

export function EmployeeDetailView({ employee, months, ytd, recentLeaves, leaveBalances, pendingCorrectionDays, showLate, isSelf }: Props) {
  const pendingDays = new Set(pendingCorrectionDays ?? [])
  // Filter balances to current/latest year
  const currentYear = leaveBalances[0]?.year ?? new Date().getFullYear()
  const currentBalances = leaveBalances.filter((b) => b.year === currentYear)

  // Status filter — click a legend chip to dim non-matching cells across all
  // month blocks. Click again (or "Clear") to remove the filter.
  const [statusFilter, setStatusFilter] = useState<Status | null>(null)
  const handleToggleFilter = (s: Status) => {
    setStatusFilter((cur) => (cur === s ? null : s))
  }

  // Correction request dialog (own attendance only)
  const [correcting, setCorrecting] = useState<Cell | null>(null)
  const [correctionToast, setCorrectionToast] = useState<string | null>(null)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <Link
          href="/dashboard/attendance"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back to grid
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/time?tab=leave"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-md transition"
          >
            <CalendarPlus className="w-3.5 h-3.5" /> Apply for leave
          </Link>
          <button
            onClick={() => typeof window !== 'undefined' && window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-700 font-bold text-lg flex items-center justify-center flex-shrink-0">
          {getInitials(employee.fullName)}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 truncate">{employee.fullName}</h1>
          <p className="text-sm text-slate-500 truncate">
            {employee.designation ?? '—'} · {employee.department}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Calendar blocks */}
        <div className="space-y-4">
          <div className="print:hidden">
            <FilterableLegend active={statusFilter} onToggle={handleToggleFilter} />
          </div>
          {isSelf && (
            <p className="text-xs text-slate-500 print:hidden">
              Something look wrong? Click any past day to request a correction — HR will review it.
            </p>
          )}
          {correctionToast && (
            <div className="print:hidden bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-md px-3 py-2">
              {correctionToast}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {months.map((m) => (
              <MonthCalendar
                key={m.key}
                month={m}
                filter={statusFilter}
                pendingDays={pendingDays}
                showLate={!!showLate}
                onCellClick={isSelf ? (c) => setCorrecting(c) : undefined}
              />
            ))}
          </div>
        </div>

        {/* Side panel */}
        <aside className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Year-to-Date
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Present" value={ytd.present} accent="text-slate-700" />
              <Stat label="Leaves" value={ytd.leave} accent="text-slate-700" />
              <Stat label="WFH" value={ytd.wfh} accent="text-slate-700" />
              <Stat label="Half Days" value={ytd.hd} accent="text-slate-700" />
              <Stat label="Absent" value={ytd.absent} accent="text-slate-700" />
            </dl>
          </div>

          {currentBalances.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Leave Balance · {currentYear}
              </h2>
              <ul className="space-y-2 text-sm">
                {currentBalances.map((b) => (
                  <li key={b.leaveType} className="flex items-center justify-between">
                    <span className="text-slate-600">{b.leaveType}</span>
                    <span className="font-semibold text-slate-900">
                      {b.remaining}<span className="text-slate-400 font-normal">/{b.allocated}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Recent Leave Requests
            </h2>
            {recentLeaves.length === 0 ? (
              <p className="text-sm text-slate-500">No leave requests on record.</p>
            ) : (
              <ul className="space-y-2">
                {recentLeaves.map((l) => (
                  <li key={l.id} className="text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">{l.leaveType}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLOR[l.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LABEL[l.status] ?? l.status}
                      </span>
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      {new Date(l.fromDate).toLocaleDateString()} → {new Date(l.toDate).toLocaleDateString()}
                      {' · '}{l.days} day{l.days === 1 ? '' : 's'}
                    </div>
                    {l.reason && <div className="text-slate-500 mt-0.5 truncate">{l.reason}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {correcting && (
        <CorrectionRequestDialog
          cell={correcting}
          onClose={() => setCorrecting(null)}
          onSubmitted={(msg) => {
            setCorrecting(null)
            setCorrectionToast(msg)
          }}
        />
      )}
    </div>
  )
}

const CORRECTION_OPTIONS: { value: 'PRESENT' | 'WFH' | 'HALF_DAY' | 'LEAVE'; label: string; badge: Status }[] = [
  { value: 'PRESENT',  label: 'Present',         badge: 'P' },
  { value: 'WFH',      label: 'Work From Home',  badge: 'WFH' },
  { value: 'HALF_DAY', label: 'Half Day',        badge: 'H' },
  { value: 'LEAVE',    label: 'Leave (Full Day)', badge: 'L' },
]

function CorrectionRequestDialog({
  cell,
  onClose,
  onSubmitted,
}: {
  cell: Cell
  onClose: () => void
  onSubmitted: (message: string) => void
}) {
  const [requested, setRequested] = useState<typeof CORRECTION_OPTIONS[number]['value']>('PRESENT')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/attendance/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: cell.iso, requestedStatus: requested, reason }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Request failed')
      }
      onSubmitted(`Correction request for ${cell.iso} submitted — HR will review it.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-sm p-4"
        role="dialog"
        aria-label="Request attendance correction"
      >
        <h3 className="text-sm font-semibold text-slate-900">Request correction</h3>
        <p className="text-xs text-slate-500 mt-0.5 mb-3">
          {cell.iso} — currently shown as{' '}
          <span className="inline-flex align-middle"><StatusBadge status={cell.status} /></span>
        </p>

        <label className="block text-xs font-medium text-slate-700 mb-1">It should be</label>
        <select
          value={requested}
          onChange={(e) => setRequested(e.target.value as typeof requested)}
          className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white mb-3"
        >
          {CORRECTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="block text-xs font-medium text-slate-700 mb-1">Reason</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Explain what actually happened that day (required)"
          className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        />

        {err && (
          <div className="mt-3 bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-md px-2 py-1.5">
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !reason.trim()}
            className="px-3 py-1.5 text-xs font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 rounded-md"
          >
            {saving ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`text-lg font-semibold ${accent}`}>{value}</dd>
    </div>
  )
}

function MonthCalendar({
  month,
  filter,
  pendingDays,
  showLate,
  onCellClick,
}: {
  month: MonthBlock
  filter: Status | null
  /** ISO days with a PENDING correction request — marked with a dot. */
  pendingDays: Set<string>
  showLate: boolean
  /** When set (own attendance), past non-weekend cells become clickable to
   *  request a correction. */
  onCellClick?: (c: Cell) => void
}) {
  const blanks = Array.from({ length: month.firstDow }, (_, i) => i)
  const dowHeader = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const t = month.totals
  const hasData = t.present + t.leave + t.hd + t.absent > 0
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <h3 className="text-sm font-semibold text-slate-800 mb-2">{month.label}</h3>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400 mb-1">
        {dowHeader.map((d, i) => (
          <div key={i} className="font-semibold">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {blanks.map((b) => <div key={`b${b}`} />)}
        {month.cells.map((c) => {
          // Days before joining render as neutral blanks (never counted).
          const blank = c.isFuture || !!c.preJoin
          // When a filter is active, dim every cell except matching ones.
          // Weekends + blank days always stay neutral (not part of the data set).
          const dimmed = filter !== null && !blank && c.status !== filter
          const clickable = !!onCellClick && !blank && !c.isWeekend
          const pending = pendingDays.has(c.iso)
          return (
            <div
              key={c.day}
              onClick={clickable ? () => onCellClick(c) : undefined}
              title={
                pending
                  ? 'Correction request pending HR review'
                  : clickable
                    ? 'Request a correction for this day'
                    : undefined
              }
              className={`relative flex flex-col items-center gap-0.5 transition-opacity ${
                dimmed ? 'opacity-25' : 'opacity-100'
              } ${clickable ? 'cursor-pointer rounded hover:bg-slate-50 hover:ring-1 hover:ring-slate-200' : ''}`}
            >
              <div className="text-[9px] text-slate-400">{c.day}</div>
              <StatusBadge status={c.status} future={blank} />
              {pending && (
                <span className="absolute top-3 right-0.5 w-1.5 h-1.5 rounded-full bg-slate-900 ring-2 ring-white" />
              )}
            </div>
          )
        })}
      </div>
      {/* Month summary strip — same counting as the HR grid (HD only in HD). */}
      {hasData && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-600">
          <Chip label="P" value={t.present} />
          <Chip label="WFH" value={t.wfh} />
          <Chip label="L" value={t.leave} />
          <Chip label="HD" value={t.hd} />
          {t.holiday > 0 && <Chip label="HOL" value={t.holiday} />}
          {showLate && month.late !== null && <Chip label="Late" value={month.late} />}
        </div>
      )}
    </div>
  )
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-bold text-slate-900">{value}</span>
    </span>
  )
}
