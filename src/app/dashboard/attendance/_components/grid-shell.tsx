'use client'

/**
 * Client-side shell for the attendance grid/summary views.
 * - Tabs switch between Grid (single month, daily) and Summary (all months, totals)
 * - Header controls: month picker, department filter, search, export (HR only)
 * - Click any employee row → /dashboard/attendance/<id> (detail view)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Download, CalendarDays, ArrowRight, LayoutGrid, LayoutList, X } from 'lucide-react'
import { StatusBadge, StatusLegend, type Status } from '@/components/attendance/status-badge'
import { getInitials } from '@/lib/utils'

interface DayCell { day: number; status: Status; isWeekend: boolean }
interface GridEmployee {
  id: string
  fullName: string
  designation: string | null
  department: string
  photoUrl: string | null
  days: DayCell[]
  totals: { present: number; leave: number; wfh: number; hd: number; absent: number }
}
interface GridResponse {
  mode: 'grid'
  month: string
  monthLabel: string
  daysInMonth: number
  today: string
  employees: GridEmployee[]
  role: string
  canExport: boolean
}

interface SummaryMonth {
  key: string
  present: number
  leave: number
  wfh: number
  hd: number
  absent: number
  /** HR-only late clock-in count; null = no clock-in data that month; absent for other roles. */
  late?: number | null
}
interface SummaryEmployee {
  id: string
  fullName: string
  designation: string | null
  department: string
  photoUrl: string | null
  months: SummaryMonth[]
  ytd: { present: number; leave: number; wfh: number; hd: number; absent: number }
}
interface SummaryResponse {
  mode: 'summary'
  months: { key: string; label: string }[]
  employees: SummaryEmployee[]
  role: string
}

const REPORTING_MONTHS = [
  { key: '2025-11', label: 'Nov 2025' },
  { key: '2025-12', label: 'Dec 2025' },
  { key: '2026-01', label: 'Jan 2026' },
  { key: '2026-02', label: 'Feb 2026' },
  { key: '2026-03', label: 'Mar 2026' },
  { key: '2026-04', label: 'Apr 2026' },
  { key: '2026-05', label: 'May 2026' },
  { key: '2026-06', label: 'Jun 2026' },
]

function currentReportingMonth(): string {
  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return REPORTING_MONTHS.find((m) => m.key === key)?.key ?? '2026-06'
}

interface ShellProps {
  role: string
  departments: string[]
  /** Server-rendered grid for the default month (no filters). When present,
   *  the shell paints immediately and skips the first client fetch. */
  initialGrid?: GridResponse
}

export function AttendanceGridShell({ role, departments, initialGrid }: ShellProps) {
  const [view, setView] = useState<'grid' | 'summary'>('grid')
  const [month, setMonth] = useState<string>(currentReportingMonth())
  const [department, setDepartment] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [gridData, setGridData] = useState<GridResponse | null>(initialGrid ?? null)
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const skipFirstFetch = useRef(!!initialGrid && initialGrid.month === currentReportingMonth())
  const router = useRouter()

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  // Fetch on dependency change
  useEffect(() => {
    // First run with server-rendered data for the same month: nothing to fetch.
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (department) params.set('department', department)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (view === 'summary') params.set('summary', '1')
    else params.set('month', month)
    fetch(`/api/attendance/grid?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Failed to load')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data.mode === 'grid') { setGridData(data); }
        else { setSummaryData(data); }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [view, month, department, debouncedSearch])

  const canExport = role === 'HR_ADMIN'
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // Server-generated month export (HR-only, gated again server-side).
  // Counts match the grid exactly + holiday / late / approved-OT columns.
  function exportCsv() {
    if (!canExport) return
    const params = new URLSearchParams({ format: 'csv', month })
    if (department) params.set('department', department)
    if (debouncedSearch) params.set('search', debouncedSearch)
    window.location.href = `/api/attendance/grid?${params.toString()}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Attendance &amp; Leaves</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Workday-style view mirroring the source tracking sheet · Nov 2025 → Jun 2026
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/time?tab=leave"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-md transition"
          >
            Apply for leave <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* View tabs */}
      <div className="inline-flex bg-slate-100 p-1 rounded-lg">
        <button
          onClick={() => setView('grid')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition ${
            view === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutGrid className="w-4 h-4" /> Grid View
        </button>
        <button
          onClick={() => setView('summary')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition ${
            view === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutList className="w-4 h-4" /> Summary View
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-200 rounded-lg px-3 py-2">
        {view === 'grid' && (
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          >
            {REPORTING_MONTHS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        )}
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name..."
            className="text-sm border border-slate-300 rounded-md pl-7 pr-2 py-1.5 bg-white w-44"
          />
        </div>
        <div className="flex-1" />
        <StatusLegend />
        {canExport && view === 'grid' && (
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md transition"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
      </div>

      {error && (
        <div className="bg-slate-50 border border-slate-100 text-slate-900 text-sm rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-slate-500 px-3 py-2">Loading…</div>
      )}

      {/* HR-only edit hint */}
      {view === 'grid' && role === 'HR_ADMIN' && (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-900 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-700 text-white font-semibold text-[10px]">HR</span>
          Click any cell to edit attendance. Only HR can edit. All edits are logged.
        </div>
      )}

      {/* GRID VIEW */}
      {view === 'grid' && gridData && !loading && (
        <GridTable
          data={gridData}
          today={today}
          canEdit={role === 'HR_ADMIN'}
          onRowClick={(id) => router.push(`/dashboard/attendance/${id}`)}
          onCellSaved={(empId, day, status) => {
            setGridData((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                employees: prev.employees.map((e) =>
                  e.id !== empId
                    ? e
                    : {
                        ...e,
                        days: e.days.map((d) => (d.day === day ? { ...d, status } : d)),
                      },
                ),
              }
            })
          }}
        />
      )}

      {/* SUMMARY VIEW */}
      {view === 'summary' && summaryData && !loading && (
        <SummaryTable data={summaryData} onRowClick={(id) => router.push(`/dashboard/attendance/${id}`)} />
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5" />
        Click any employee row to open their detailed 8-month calendar.
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────

interface GridTableProps {
  data: GridResponse
  today: string
  canEdit: boolean
  onRowClick: (id: string) => void
  onCellSaved: (employeeId: string, day: number, status: Status) => void
}

function GridTable({ data, today, canEdit, onRowClick, onCellSaved }: GridTableProps) {
  // Parse month-year for weekday header row
  const [year, month] = data.month.split('-').map(Number)
  const days = Array.from({ length: data.daysInMonth }, (_, i) => {
    const dt = new Date(year, month - 1, i + 1)
    const dow = dt.getDay()
    const isWeekend = dow === 0 || dow === 6
    const dowLabel = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dow]
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    const isToday = iso === today
    return { day: i + 1, dowLabel, isWeekend, isToday }
  })

  const [editing, setEditing] = useState<{ empId: string; empName: string; day: number; iso: string } | null>(null)
  const [flashKey, setFlashKey] = useState<string | null>(null)
  useEffect(() => {
    if (!flashKey) return
    const t = setTimeout(() => setFlashKey(null), 900)
    return () => clearTimeout(t)
  }, [flashKey])

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-700 min-w-[220px]">
                Employee
              </th>
              {days.map((d) => (
                <th
                  key={d.day}
                  className={`border-b border-slate-200 px-1 py-1 text-center font-medium text-slate-600 ${
                    d.isWeekend ? 'bg-slate-100/70 text-slate-400' : ''
                  } ${d.isToday ? 'bg-slate-50 text-slate-700' : ''}`}
                >
                  <div className="leading-tight">
                    <div className="text-[10px] uppercase">{d.dowLabel}</div>
                    <div className="text-[11px] font-semibold">{d.day}</div>
                  </div>
                </th>
              ))}
              <th className="border-b border-l border-slate-200 px-2 py-1 text-center font-semibold text-slate-700 bg-slate-50/40">P</th>
              <th className="border-b border-slate-200 px-2 py-1 text-center font-semibold text-slate-700 bg-slate-50/40">L</th>
              <th className="border-b border-slate-200 px-2 py-1 text-center font-semibold text-slate-700 bg-slate-50/40">WFH</th>
              <th className="border-b border-slate-200 px-2 py-1 text-center font-semibold text-slate-700 bg-slate-50/40">HD</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.length === 0 && (
              <tr>
                <td colSpan={data.daysInMonth + 5} className="px-3 py-8 text-center text-slate-500">
                  No employees match these filters.
                </td>
              </tr>
            )}
            {data.employees.map((emp) => (
              <tr
                key={emp.id}
                className="hover:bg-slate-50/40 transition group"
              >
                <td
                  onClick={() => onRowClick(emp.id)}
                  className="sticky left-0 z-30 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 px-3 py-1.5 cursor-pointer shadow-[1px_0_0_0_rgb(226_232_240)]"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {getInitials(emp.fullName)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-slate-900 truncate">{emp.fullName}</div>
                      <div className="text-[10px] text-slate-500 truncate">{emp.department}</div>
                    </div>
                  </div>
                </td>
                {emp.days.map((d) => {
                  const iso = `${year}-${String(month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
                  const isFuture = !d.isWeekend && iso > today
                  const cellKey = `${emp.id}|${d.day}`
                  const flashing = flashKey === cellKey
                  // HR can edit any non-weekend, non-future cell
                  const isEditable = canEdit && !d.isWeekend && !isFuture
                  return (
                    <td
                      key={d.day}
                      onClick={isEditable
                        ? (e) => {
                            e.stopPropagation()
                            setEditing({ empId: emp.id, empName: emp.fullName, day: d.day, iso })
                          }
                        : undefined}
                      className={`border-b border-slate-100 p-0.5 text-center ${
                        d.isWeekend ? 'bg-slate-50/40' : ''
                      } ${isEditable ? 'cursor-pointer hover:ring-1 hover:ring-slate-200 hover:bg-slate-50/60' : ''} ${
                        flashing ? 'bg-slate-100 transition-colors' : ''
                      }`}
                      title={isEditable ? 'Click to edit (HR only)' : undefined}
                    >
                      <StatusBadge status={d.status} future={isFuture} />
                    </td>
                  )
                })}
                <td className="border-b border-l border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{emp.totals.present}</td>
                <td className="border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{emp.totals.leave}</td>
                <td className="border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{emp.totals.wfh}</td>
                <td className="border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{emp.totals.hd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <CellEditPopover
          employeeId={editing.empId}
          employeeName={editing.empName}
          day={editing.day}
          iso={editing.iso}
          onClose={() => setEditing(null)}
          onSaved={(status) => {
            onCellSaved(editing.empId, editing.day, status)
            setFlashKey(`${editing.empId}|${editing.day}`)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

const EDIT_STATUS_OPTIONS: { value: 'PRESENT' | 'LEAVE' | 'WFH' | 'HALF_DAY' | 'ABSENT'; label: string; badge: Status }[] = [
  { value: 'PRESENT',  label: 'Present',   badge: 'P' },
  { value: 'WFH',      label: 'Work From Home', badge: 'WFH' },
  { value: 'LEAVE',    label: 'Leave (Full Day)', badge: 'L' },
  { value: 'HALF_DAY', label: 'Half Day',  badge: 'H' },
  { value: 'ABSENT',   label: 'Absent',    badge: 'A' },
]

const API_TO_BADGE: Record<string, Status> = {
  PRESENT: 'P', WFH: 'WFH', LEAVE: 'L', HALF_DAY: 'H', ABSENT: 'A',
}

function CellEditPopover({
  employeeId,
  employeeName,
  day,
  iso,
  onClose,
  onSaved,
}: {
  employeeId: string
  employeeName: string
  day: number
  iso: string
  onClose: () => void
  onSaved: (status: Status) => void
}) {
  const [selected, setSelected] = useState<typeof EDIT_STATUS_OPTIONS[number]['value']>('PRESENT')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/attendance/${employeeId}/${iso}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selected, note }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      onSaved(API_TO_BADGE[selected])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-sm p-4"
        role="dialog"
        aria-label="Edit attendance cell"
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Edit attendance</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {employeeName} · Day {day} ({iso})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 -mr-1 -mt-1 rounded"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as typeof selected)}
          className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white mb-3"
        >
          {EDIT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="block text-xs font-medium text-slate-700 mb-1">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Why is this being adjusted?"
          className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        />

        {err && (
          <div className="mt-3 bg-slate-50 border border-slate-100 text-slate-900 text-xs rounded-md px-2 py-1.5">
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
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-white bg-slate-700 hover:bg-slate-700 disabled:opacity-50 rounded-md"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryTable({ data, onRowClick }: { data: SummaryResponse; onRowClick: (id: string) => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 min-w-[220px]">Employee</th>
              {data.months.map((m) => (
                <th key={m.key} className="px-2 py-2 text-center font-semibold text-slate-700 min-w-[120px]">{m.label}</th>
              ))}
              <th className="px-3 py-2 text-center font-semibold text-slate-900 bg-slate-100 min-w-[140px]">YTD</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.length === 0 && (
              <tr>
                <td colSpan={data.months.length + 2} className="px-3 py-8 text-center text-slate-500">
                  No employees match these filters.
                </td>
              </tr>
            )}
            {data.employees.map((emp) => (
              <tr key={emp.id} onClick={() => onRowClick(emp.id)} className="hover:bg-slate-50/40 cursor-pointer border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {getInitials(emp.fullName)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{emp.fullName}</div>
                      <div className="text-[10px] text-slate-500 truncate">{emp.department}</div>
                    </div>
                  </div>
                </td>
                {emp.months.map((m) => (
                  <td key={m.key} className="px-2 py-2 text-center">
                    <div className="inline-flex flex-col items-center text-[10px] leading-tight">
                      <span>
                        <span className="text-slate-700 font-semibold">P:{m.present}</span>{' '}
                        <span className="text-slate-700">L:{m.leave}</span>
                      </span>
                      <span className="text-slate-500">
                        <span className="text-slate-700">WFH:{m.wfh}</span>{' '}
                        <span className="text-slate-700">HD:{m.hd}</span>
                      </span>
                      {/* HR-only late-arrival count — "—" when no clock-in data that month */}
                      {m.late !== undefined && (
                        <span className="text-slate-500" title="Clock-ins after shift start + grace (HR only)">
                          Late:{m.late === null ? '—' : m.late}
                        </span>
                      )}
                    </div>
                  </td>
                ))}
                <td className="px-3 py-2 text-center bg-slate-50/50 font-semibold">
                  <div className="text-[10px] leading-tight">
                    <div>
                      <span className="text-slate-700">P:{emp.ytd.present}</span>{' '}
                      <span className="text-slate-700">L:{emp.ytd.leave}</span>
                    </div>
                    <div>
                      <span className="text-slate-700">WFH:{emp.ytd.wfh}</span>{' '}
                      <span className="text-slate-700">HD:{emp.ytd.hd}</span>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
