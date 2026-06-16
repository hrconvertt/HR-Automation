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
                ? 'bg-blue-50 ring-1 ring-blue-400 text-blue-900'
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
}

interface MonthBlock {
  key: string
  label: string
  firstDow: number
  cells: Cell[]
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
  role: string
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending Manager',
  PENDING_HR: 'Pending HR',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-amber-700 bg-amber-50',
  PENDING_HR: 'text-amber-700 bg-amber-50',
  APPROVED: 'text-emerald-700 bg-emerald-50',
  REJECTED: 'text-rose-700 bg-rose-50',
  CANCELLED: 'text-slate-600 bg-slate-100',
}

export function EmployeeDetailView({ employee, months, ytd, recentLeaves, leaveBalances }: Props) {
  // Filter balances to current/latest year
  const currentYear = leaveBalances[0]?.year ?? new Date().getFullYear()
  const currentBalances = leaveBalances.filter((b) => b.year === currentYear)

  // Status filter — click a legend chip to dim non-matching cells across all
  // month blocks. Click again (or "Clear") to remove the filter.
  const [statusFilter, setStatusFilter] = useState<Status | null>(null)
  const handleToggleFilter = (s: Status) => {
    setStatusFilter((cur) => (cur === s ? null : s))
  }

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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition"
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
        <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 font-bold text-lg flex items-center justify-center flex-shrink-0">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {months.map((m) => <MonthCalendar key={m.key} month={m} filter={statusFilter} />)}
          </div>
        </div>

        {/* Side panel */}
        <aside className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Year-to-Date
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Present" value={ytd.present} accent="text-emerald-700" />
              <Stat label="Leaves" value={ytd.leave} accent="text-rose-700" />
              <Stat label="WFH" value={ytd.wfh} accent="text-sky-700" />
              <Stat label="Half Days" value={ytd.hd} accent="text-amber-700" />
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

function MonthCalendar({ month, filter }: { month: MonthBlock; filter: Status | null }) {
  const blanks = Array.from({ length: month.firstDow }, (_, i) => i)
  const dowHeader = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
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
          // When a filter is active, dim every cell except matching ones.
          // Weekends + future days always stay neutral (not part of the data set).
          const dimmed =
            filter !== null && !c.isFuture && c.status !== filter
          return (
            <div
              key={c.day}
              className={`flex flex-col items-center gap-0.5 transition-opacity ${
                dimmed ? 'opacity-25' : 'opacity-100'
              }`}
            >
              <div className="text-[9px] text-slate-400">{c.day}</div>
              <StatusBadge status={c.status} future={c.isFuture} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
