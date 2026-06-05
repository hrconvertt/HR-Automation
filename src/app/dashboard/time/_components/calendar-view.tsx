'use client'

/**
 * Unified Calendar — month grid overlaying attendance, leave, and holidays.
 *
 * Layout: rows = employees (or just self for an Employee role), columns = days.
 * Cell colour encodes status; tooltip shows details.
 *
 *   ■ green   = present (onsite)
 *   ■ purple  = present (WFH)
 *   ■ emerald + pulse = working right now
 *   ■ blue    = leave (with type)
 *   ■ amber   = holiday
 *   ▢ grey    = weekend
 *   ■ red     = absent (no record)
 *   ▫ blank   = future / today not-yet-clocked
 */

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { safeFetch } from '@/lib/safe-fetch'

type DayStatus =
  | { kind: 'PRESENT'; hours: number; workType: 'ONSITE' | 'WFH' }
  | { kind: 'ABSENT' }
  | { kind: 'LEAVE'; leaveType: string; halfDay: boolean }
  | { kind: 'HOLIDAY'; name: string }
  | { kind: 'WEEKEND' }
  | { kind: 'FUTURE' }
  | { kind: 'EMPTY' }

type EmployeeRow = {
  employeeId: string
  fullName: string
  employeeCode: string
  department: string
  days: Record<number, DayStatus>
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

export function CalendarView({ role }: { role?: string } = {}) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [daysInMonth, setDaysInMonth] = useState(30)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Role-appropriate label for the leftmost column
  const personColLabel =
    role === 'EMPLOYEE'                       ? 'Me' :
    role === 'MANAGER'                        ? 'Team Member' :
    role === 'HR_ADMIN' || role === 'EXECUTIVE' ? 'Employee' :
                                                'Employee'

  const pageTitle =
    role === 'EMPLOYEE' ? 'My Calendar' :
    role === 'MANAGER'  ? 'Team Calendar' :
                          'Company Calendar'

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const monthStr = String(month).padStart(2, '0')
    const r = await safeFetch<{ employees: EmployeeRow[]; daysInMonth: number }>(`/api/time/calendar?month=${year}-${monthStr}`)
    if (r.ok && r.data) {
      setEmployees(r.data.employees ?? [])
      setDaysInMonth(r.data.daysInMonth ?? 30)
    } else {
      setFetchError(r.error ?? 'Could not load calendar.')
      setEmployees([])
    }
    setLoading(false)
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  return (
    <div className="space-y-3">
      {/* Header / month navigator */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="text-sm text-slate-500 mt-0.5">Attendance, leave and holidays overlaid for the month</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg">
          <button onClick={prevMonth} className="p-1.5 hover:bg-slate-50 rounded-l-lg"><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-2 text-sm font-medium text-slate-800 min-w-[140px] text-center">{MONTH_NAMES[month - 1]} {year}</span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-slate-50 rounded-r-lg"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Workday-blue section header */}
      <div className="bg-white border border-slate-200">
        <div className="bg-[#005691] text-white px-4 py-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Month Grid</h2>
          <div className="text-[11px] text-white/90">
            {employees.length} {employees.length === 1 ? 'record' : 'records'} · {daysInMonth} days
          </div>
        </div>

        {/* Calendar grid */}
        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-center text-slate-400 py-10 text-sm">Loading…</p>
          ) : fetchError ? (
            <div className="text-center py-10">
              <p className="text-sm text-rose-700 mb-2">{fetchError}</p>
              <button onClick={fetchData} className="text-xs text-blue-600 hover:underline">Retry</button>
            </div>
          ) : employees.length === 0 ? (
            <p className="text-center text-slate-500 py-10 text-sm">No data for this period.</p>
          ) : (
            <table className="text-xs border-collapse min-w-max w-full">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-200 min-w-[180px]">
                    {personColLabel}
                  </th>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const date = new Date(year, month - 1, d)
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6
                    const isToday = date.toDateString() === new Date().toDateString()
                    return (
                      <th
                        key={d}
                        className={
                          'px-1 py-2 text-center font-semibold border-b min-w-[26px] ' +
                          (isWeekend ? 'text-slate-400 bg-slate-200' : 'text-slate-600') +
                          (isToday ? ' bg-blue-100 text-blue-900' : '')
                        }
                      >
                        {d}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.employeeId} className="hover:bg-blue-50/30 border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white hover:bg-blue-50/30 px-3 py-1 border-r border-slate-200 whitespace-nowrap">
                      <p className="text-sm font-medium text-slate-900">{emp.fullName}</p>
                      <p className="text-[10px] text-slate-400">{emp.department}</p>
                    </td>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      const s = emp.days[d]
                      return (
                        <td key={d} className="p-0.5 text-center">
                          <DayCell status={s} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-3 border-t border-slate-100 bg-slate-50 flex-wrap text-xs">
          <LegendChip color="bg-emerald-500" label="Onsite" />
          <LegendChip color="bg-purple-500" label="WFH" />
          <LegendChip color="bg-blue-500" label="Leave" />
          <LegendChip color="bg-amber-400" label="Holiday" />
          <LegendChip color="bg-rose-500" label="Absent" />
          <LegendChip color="bg-slate-200" label="Weekend" />
        </div>
      </div>
    </div>
  )
}

function DayCell({ status }: { status: DayStatus | undefined }) {
  if (!status) return <span className="inline-block w-5 h-5 rounded-sm bg-slate-50" />

  let bg = 'bg-slate-50'
  let tooltip = ''
  const pulse = false
  let halfStripe = false

  switch (status.kind) {
    case 'PRESENT':
      bg = status.workType === 'WFH' ? 'bg-purple-500' : 'bg-emerald-500'
      tooltip = `${status.workType === 'WFH' ? 'WFH' : 'Onsite'} — ${(status.hours || 0).toFixed(1)}h`
      break
    case 'LEAVE':
      bg = 'bg-blue-500'
      tooltip = `On leave — ${status.leaveType}${status.halfDay ? ' (½ day)' : ''}`
      halfStripe = status.halfDay
      break
    case 'HOLIDAY':
      bg = 'bg-amber-400'
      tooltip = `Holiday — ${status.name}`
      break
    case 'WEEKEND':
      bg = 'bg-slate-200'
      tooltip = 'Weekend'
      break
    case 'ABSENT':
      bg = 'bg-rose-500'
      tooltip = 'Absent — no clock-in'
      break
    case 'FUTURE':
      bg = 'bg-slate-50 border border-dashed border-slate-200'
      tooltip = 'Upcoming'
      break
    case 'EMPTY':
      bg = 'bg-white border border-slate-200'
      tooltip = 'No record'
      break
  }

  return (
    <span
      className={`relative inline-block w-5 h-5 rounded-sm ${bg} ${pulse ? 'animate-pulse' : ''}`}
      title={tooltip}
    >
      {halfStripe && (
        <span className="absolute inset-0 right-1/2 bg-blue-300 rounded-l-sm" />
      )}
    </span>
  )
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-slate-600">
      <span className={`inline-block w-3 h-3 rounded-sm ${color}`} />
      {label}
    </span>
  )
}
