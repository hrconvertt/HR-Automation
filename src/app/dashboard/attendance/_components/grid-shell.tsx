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
import { Search, Download, CalendarDays, ArrowRight, LayoutGrid, LayoutList, X, Sun, Rows3, Rows4 } from 'lucide-react'
import { StatusBadge, StatusLegend, type Status } from '@/components/attendance/status-badge'
import { getInitials } from '@/lib/utils'
import { TodayBoard } from './today-board'
import { MonthEditorDrawer } from './month-editor'

interface DayCell { day: number; status: Status; isWeekend: boolean; preJoin?: boolean }
interface GridEmployee {
  id: string
  fullName: string
  designation: string | null
  department: string
  photoUrl: string | null
  days: DayCell[]
  totals: { present: number; leave: number; wfh: number; hd: number; absent: number; holiday: number }
  /** HR-only: ISO days with a PENDING correction request. */
  pendingDays?: string[]
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

// Reporting window: Nov 2025 (first tracked month) through the CURRENT month —
// computed, not hardcoded, so HR can always record the month we're actually in.
// Mirrors reportingMonths() in src/lib/queries/attendance-grid.ts.
const REPORTING_MONTHS: { key: string; label: string }[] = (() => {
  const list: { key: string; label: string }[] = []
  const now = new Date()
  let y = 2025, m = 11
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    list.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return list
})()

function currentReportingMonth(): string {
  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return REPORTING_MONTHS.find((m) => m.key === key)?.key ?? REPORTING_MONTHS[REPORTING_MONTHS.length - 1].key
}

interface ShellProps {
  role: string
  departments: string[]
  /** Server-rendered grid for the default month (no filters). When present,
   *  the shell paints immediately and skips the first client fetch. */
  initialGrid?: GridResponse
}

export function AttendanceGridShell({ role, departments, initialGrid }: ShellProps) {
  // HR lands on the operational "Today" board; the month grid stays one click
  // away. Other roles (Executive/Manager/Lead) land on the grid as before.
  const [view, setView] = useState<'today' | 'grid' | 'summary'>(role === 'HR_ADMIN' ? 'today' : 'grid')
  const [month, setMonth] = useState<string>(currentReportingMonth())
  const [department, setDepartment] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [gridData, setGridData] = useState<GridResponse | null>(initialGrid ?? null)
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  // Month bulk editor (HR only) — opened from an employee-name click.
  const [editor, setEditor] = useState<{ id: string; name: string } | null>(null)
  const skipFirstFetch = useRef(!!initialGrid && initialGrid.month === currentReportingMonth())
  const router = useRouter()

  // Force a grid refetch (used after the month editor saves).
  const [refetchNonce, setRefetchNonce] = useState(0)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  // Fetch on dependency change
  useEffect(() => {
    // The Today board owns its own fetching + auto-refresh.
    if (view === 'today') return
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
  }, [view, month, department, debouncedSearch, refetchNonce])

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
        {role === 'HR_ADMIN' && (
          <button
            onClick={() => setView('today')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition ${
              view === 'today' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sun className="w-4 h-4" /> Today
          </button>
        )}
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

      {/* TODAY BOARD (HR only — server re-verifies role on every call) */}
      {view === 'today' && role === 'HR_ADMIN' && <TodayBoard canMark />}

      {/* Filter bar */}
      {view !== 'today' && (
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
        {view === 'grid' && (
          <div className="inline-flex bg-slate-100 rounded-md p-0.5" role="group" aria-label="Row density">
            <button
              onClick={() => setDensity('comfortable')}
              title="Comfortable rows"
              aria-pressed={density === 'comfortable'}
              className={`inline-flex items-center justify-center w-7 h-7 rounded ${density === 'comfortable' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Rows3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDensity('compact')}
              title="Compact rows"
              aria-pressed={density === 'compact'}
              className={`inline-flex items-center justify-center w-7 h-7 rounded ${density === 'compact' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Rows4 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
      )}

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
        <>
        <SummaryBar data={gridData} />
        <GridTable
          data={gridData}
          today={today}
          density={density}
          canEdit={role === 'HR_ADMIN'}
          onNameClick={
            role === 'HR_ADMIN'
              ? (id, name) => setEditor({ id, name })
              : (id) => router.push(`/dashboard/attendance/${id}`)
          }
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
        </>
      )}

      {/* SUMMARY VIEW */}
      {view === 'summary' && summaryData && !loading && (
        <SummaryTable data={summaryData} onRowClick={(id) => router.push(`/dashboard/attendance/${id}`)} />
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5" />
        {role === 'HR_ADMIN'
          ? 'Click a name to bulk-edit their month · click elsewhere in a row to open the detailed calendar.'
          : 'Click any employee row to open their detailed 8-month calendar.'}
      </p>

      {/* Month bulk editor (HR only) */}
      {editor && (
        <MonthEditorDrawer
          employeeId={editor.id}
          employeeName={editor.name}
          month={month}
          onClose={() => setEditor(null)}
          onSaved={() => setRefetchNonce((n) => n + 1)}
        />
      )}
    </div>
  )
}

// Company-wide stat chips for the visible month (derived from the same grid
// rows so counts never drift). Monochrome slate.
function SummaryBar({ data }: { data: GridResponse }) {
  const s = useMemo(() => {
    let present = 0, wfh = 0, leave = 0, hd = 0, onLeaveToday = 0, unmarkedToday = 0
    const todayDay = data.today.startsWith(data.month) ? Number(data.today.slice(8, 10)) : null
    for (const emp of data.employees) {
      present += emp.totals.present
      wfh += emp.totals.wfh
      leave += emp.totals.leave
      hd += emp.totals.hd
      if (todayDay != null) {
        const cell = emp.days.find((d) => d.day === todayDay)
        if (cell) {
          if (cell.status === 'L' || cell.status === 'H' || cell.status === 'LOA') onLeaveToday++
          else if (cell.status === 'A') unmarkedToday++
        }
      }
    }
    // Attendance %: present-or-wfh working-day cells over all counted working
    // cells (P+WFH already inside present; L/HD/A are the shortfall).
    const counted = present + leave + hd
    const attendancePct = counted > 0 ? Math.round((present / counted) * 100) : 0
    return { present, wfh, leave, hd, onLeaveToday, unmarkedToday, attendancePct, showToday: todayDay != null }
  }, [data])

  const chips: { label: string; value: string | number }[] = [
    { label: 'Avg attendance', value: `${s.attendancePct}%` },
    { label: 'Present', value: s.present },
    { label: 'WFH', value: s.wfh },
    { label: 'Leave', value: s.leave },
    { label: 'Half days', value: s.hd },
    ...(s.showToday
      ? [
          { label: 'On leave today', value: s.onLeaveToday },
          { label: 'Unmarked today', value: s.unmarkedToday },
        ]
      : []),
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {chips.map((c) => (
        <div key={c.label} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
          <div className="text-lg font-semibold text-slate-900 leading-tight">{c.value}</div>
          <div className="text-[11px] text-slate-500 truncate">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────

interface GridTableProps {
  data: GridResponse
  today: string
  canEdit: boolean
  density: 'comfortable' | 'compact'
  /** Click on the employee NAME — HR opens the month editor, others open detail. */
  onNameClick: (id: string, name: string) => void
  onRowClick: (id: string) => void
  onCellSaved: (employeeId: string, day: number, status: Status) => void
}

const STATUS_TITLE: Record<Status, string> = {
  P: 'Present', WFH: 'Work from home', L: 'Leave', H: 'Half day',
  A: 'Unmarked', WE: 'Weekend', HO: 'Public holiday', LOA: 'Leave of absence',
}

function GridTable({ data, today, canEdit, density, onNameClick, onRowClick, onCellSaved }: GridTableProps) {
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
  const rowPad = density === 'compact' ? 'py-0.5' : 'py-1.5'
  const namePad = density === 'compact' ? 'py-1' : 'py-1.5'

  const [editing, setEditing] = useState<{ empId: string; empName: string; day: number; iso: string } | null>(null)
  const [flashKey, setFlashKey] = useState<string | null>(null)
  useEffect(() => {
    if (!flashKey) return
    const t = setTimeout(() => setFlashKey(null), 900)
    return () => clearTimeout(t)
  }, [flashKey])

  // Sticky right-hand totals: 4 columns, right-anchored so they ride along on
  // horizontal scroll. Widths kept in sync between header + body.
  const totalCols: { key: 'present' | 'leave' | 'wfh' | 'hd'; label: string; right: string }[] = [
    { key: 'present', label: 'P', right: 'right-[126px]' },
    { key: 'leave', label: 'L', right: 'right-[84px]' },
    { key: 'wfh', label: 'WFH', right: 'right-[42px]' },
    { key: 'hd', label: 'HD', right: 'right-0' },
  ]

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-40 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-700 min-w-[220px]">
                Employee
              </th>
              {days.map((d) => (
                <th
                  key={d.day}
                  className={`sticky top-0 z-20 border-b border-slate-200 px-1 py-1 text-center font-medium ${
                    d.isWeekend ? 'bg-slate-100 text-slate-300' : 'bg-slate-50 text-slate-600'
                  } ${d.isToday ? 'bg-slate-200 text-slate-900 ring-1 ring-inset ring-slate-300' : ''}`}
                >
                  <div className="leading-tight">
                    <div className="text-[10px] uppercase">{d.dowLabel}</div>
                    <div className="text-[11px] font-semibold">{d.day}</div>
                  </div>
                </th>
              ))}
              {totalCols.map((c, i) => (
                <th
                  key={c.key}
                  className={`sticky ${c.right} top-0 z-30 border-b ${i === 0 ? 'border-l' : ''} border-slate-200 px-2 py-1 text-center font-semibold text-slate-700 bg-slate-100 w-[42px]`}
                >
                  {c.label}
                </th>
              ))}
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
                  className={`sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 px-3 ${namePad} shadow-[1px_0_0_0_rgb(226_232_240)]`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNameClick(emp.id, emp.fullName)}
                      title={canEdit ? 'Edit this month' : 'Open calendar'}
                      className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 hover:bg-slate-900 hover:text-white transition"
                    >
                      {getInitials(emp.fullName)}
                    </button>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onNameClick(emp.id, emp.fullName)}
                        title={canEdit ? 'Edit this month' : 'Open calendar'}
                        className="text-[12px] font-medium text-slate-900 truncate hover:underline text-left block max-w-full"
                      >
                        {emp.fullName}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRowClick(emp.id)}
                        className="text-[10px] text-slate-500 truncate hover:text-slate-700 text-left block max-w-full"
                        title="Open detailed calendar"
                      >
                        {emp.department}
                      </button>
                    </div>
                  </div>
                </td>
                {emp.days.map((d) => {
                  const iso = `${year}-${String(month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
                  const isFuture = iso > today
                  const isToday = iso === today
                  const hasPendingCorrection = emp.pendingDays?.includes(iso) ?? false
                  // Blank dot: unmarked future days and pre-joining days. A
                  // future day WITH data (e.g. approved upcoming leave) still
                  // shows its status so HR can see who'll be out.
                  const renderBlank = (isFuture && d.status === 'A') || !!d.preJoin
                  const cellKey = `${emp.id}|${d.day}`
                  const flashing = flashKey === cellKey
                  // HR can edit any non-weekend, non-holiday, non-future, post-joining cell
                  const isEditable = canEdit && !d.isWeekend && d.status !== 'HO' && !isFuture && !d.preJoin
                  const recede = d.isWeekend || d.status === 'HO'
                  const tip = hasPendingCorrection
                    ? 'Correction request pending — review in Corrections'
                    : `${STATUS_TITLE[d.status] ?? d.status} · ${iso}`
                  return (
                    <td
                      key={d.day}
                      onClick={isEditable
                        ? (e) => {
                            e.stopPropagation()
                            setEditing({ empId: emp.id, empName: emp.fullName, day: d.day, iso })
                          }
                        : undefined}
                      className={`relative border-b border-slate-100 p-0.5 text-center ${
                        recede ? 'bg-slate-50' : ''
                      } ${isToday ? 'bg-slate-100/70 ring-1 ring-inset ring-slate-200' : ''} ${
                        isEditable ? 'cursor-pointer hover:ring-1 hover:ring-slate-300 hover:bg-slate-50/60' : ''
                      } ${flashing ? 'bg-slate-200 transition-colors' : ''}`}
                      title={tip}
                    >
                      <StatusBadge status={d.status} future={renderBlank} />
                      {hasPendingCorrection && (
                        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-slate-900 ring-2 ring-white" />
                      )}
                    </td>
                  )
                })}
                {totalCols.map((c, i) => (
                  <td
                    key={c.key}
                    className={`sticky ${c.right} z-10 bg-white group-hover:bg-slate-50 border-b ${i === 0 ? 'border-l' : ''} border-slate-200 px-2 ${rowPad} text-center font-semibold text-slate-700 w-[42px]`}
                  >
                    {emp.totals[c.key]}
                  </td>
                ))}
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

interface HistoryEntry {
  id: string
  at: string
  by: string
  source: string
  from: { status?: string; workType?: string } | null
  to: { status?: string; workType?: string } | null
  note: string | null
}

/** "PRESENT + WFH" → the short badge label used in the grid. */
function historyLabel(v: { status?: string; workType?: string } | null): string {
  if (!v?.status) return '—'
  if (v.status === 'PRESENT' || v.status === 'LATE') return v.workType === 'WFH' ? 'WFH' : 'P'
  if (v.status === 'HALF_DAY') return 'HD'
  if (v.status === 'LEAVE') return 'L'
  if (v.status === 'HOLIDAY') return 'Holiday'
  if (v.status === 'WEEKEND') return 'Weekend'
  if (v.status === 'ABSENT') return 'A'
  return v.status
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
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Audit history for this cell (manual edits / corrections / leave writebacks)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/attendance/${employeeId}/${iso}`)
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d) => { if (!cancelled) setHistory(d.history ?? []) })
      .catch(() => { if (!cancelled) setHistory([]) })
    return () => { cancelled = true }
  }, [employeeId, iso])

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

        {/* Audit history — chronological trail of changes to this cell */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">History</h4>
          {history === null ? (
            <p className="text-xs text-slate-400">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-400">No recorded changes for this day.</p>
          ) : (
            <ul className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {history.map((h) => (
                <li key={h.id} className="text-xs text-slate-600 leading-snug">
                  <span className="font-semibold text-slate-900">
                    {h.from ? `${historyLabel(h.from)} → ` : ''}{historyLabel(h.to)}
                  </span>{' '}
                  · {h.source} by {h.by}
                  <span className="text-slate-400">
                    {' '}· {new Date(h.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{' '}
                    {new Date(h.at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {h.note && <div className="text-slate-400 truncate" title={h.note}>“{h.note}”</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

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
