'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { cn, getInitials } from '@/lib/utils'
import {
  Fingerprint, Wifi, WifiOff, RefreshCw, Copy, CheckCircle,
  Users, Clock, UserCheck, Home, UserX, AlertCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AttendanceSummary {
  employeeId: string
  employeeCode: string
  fullName: string
  present: number
  absent: number
  late: number
  leave: number
  totalOvertimeHours: number
  approvedOvertimeHours: number
  pendingOvertimeHours: number
}

interface AttendanceLog {
  id: string
  employeeId: string
  fullName: string
  date: string
  clockIn: string | null
  clockOut: string | null
  hoursWorked: number | null
  overtimeHours: number
  overtimeApproved: boolean
  status: string
  workType: string
  employee?: { fullName: string; employeeCode: string }
}

interface TodayRecord {
  employeeId: string
  employeeCode: string
  fullName: string
  department: string
  clockIn: string | null
  clockOut: string | null
  status: string
  workType: string
  hoursWorked: number | null
}

interface TodayStats {
  present: number
  late: number
  absent: number
  notYetIn: number
  wfh: number
  leave: number
  total: number
}

interface RawLog {
  id: string
  employeeId: string
  date: string
  status: string
  workType: string
  employee: { fullName: string; employeeCode: string }
}

interface DeviceInfo { sn: string; lastSeen: string | null; lastSync: string | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PRESENT:  'bg-green-100 text-green-700',
  ABSENT:   'bg-red-100 text-red-700',
  LATE:     'bg-amber-100 text-amber-700',
  LEAVE:    'bg-blue-100 text-blue-700',
  HOLIDAY:  'bg-purple-100 text-purple-700',
  HALF_DAY: 'bg-orange-100 text-orange-700',
  NOT_IN:   'bg-gray-100 text-gray-500',
}

const CALENDAR_CELL: Record<string, string> = {
  PRESENT: 'bg-green-400',
  LATE:    'bg-amber-400',
  ABSENT:  'bg-red-400',
  LEAVE:   'bg-blue-400',
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
}

function hoursLabel(clockIn: string | null, clockOut: string | null, stored: number | null): string {
  if (stored != null) return `${stored.toFixed(1)}h`
  if (!clockIn) return '—'
  const end = clockOut ? new Date(clockOut) : new Date()
  const h = (end.getTime() - new Date(clockIn).getTime()) / 3_600_000
  return `${h.toFixed(1)}h`
}

function attendancePct(present: number, late: number, workingDays: number): number {
  if (workingDays === 0) return 0
  return Math.round(((present + late) / workingDays) * 100)
}

function workingDaysInMonth(m: number, y: number): number {
  const days = new Date(y, m, 0).getDate()
  let count = 0
  for (let d = 1; d <= days; d++) {
    const day = new Date(y, m - 1, d).getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

function isWeekend(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day).getDay()
  return d === 0 || d === 6
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * `mode` selects which sub-panel to render. When called from the unified
 * Time & Attendance shell, only one panel is shown at a time and the
 * internal tab bar is hidden — outer tabs are the only navigation.
 *   today      — snapshot stat cards + In Office / WFH / On Leave / Absent
 *   summary    — monthly report (per-employee table)
 *   overtime   — OT approvals table (legacy — outer Approvals tab is preferred)
 *   devices    — device sync & token UI
 *   calendar   — legacy calendar grid (unified CalendarView is preferred)
 */
export default function AdminTimeView({ mode = 'today' }: { mode?: 'today' | 'calendar' | 'summary' | 'overtime' | 'devices' } = {}) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  // Which sub-panel to render — driven by the `mode` prop from the parent (TimeShell / dedicated sub-routes)
  const activeTab = mode

  // Role detection — for HR shortcut links and preview banner
  const [userRole, setUserRole] = useState<string>('EMPLOYEE')
  const [actualRole, setActualRole] = useState<string>('EMPLOYEE')

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        const actual = d.user?.role ?? 'EMPLOYEE'
        setActualRole(actual)
        const m = document.cookie.match(/(?:^|;\s*)hr_preview_role=([^;]+)/)
        const preview = m ? decodeURIComponent(m[1]) : null
        setUserRole(actual === 'HR_ADMIN' && preview ? preview : actual)
      })
      .catch(() => {})
  }, [])

  const isPreviewMode = actualRole === 'HR_ADMIN' && userRole !== 'HR_ADMIN' && userRole !== ''

  // Today tab
  const [todayLogs,  setTodayLogs]  = useState<TodayRecord[]>([])
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null)
  const [todayLoading, setTodayLoading] = useState(true)

  // Calendar tab
  const [allLogs,   setAllLogs]   = useState<RawLog[]>([])
  const [calSummary, setCalSummary] = useState<AttendanceSummary[]>([])
  const [calLoading, setCalLoading] = useState(false)

  // Summary tab
  const [summary,  setSummary]  = useState<AttendanceSummary[]>([])

  // Overtime tab
  const [overtimeLogs, setOvertimeLogs] = useState<AttendanceLog[]>([])

  // Devices tab
  const [devices,      setDevices]      = useState<DeviceInfo[]>([])
  const [syncToken,    setSyncToken]    = useState('')
  const [copied,       setCopied]       = useState('')
  const [tokenLoading, setTokenLoading] = useState(false)

  // Shared loading state (clock widget was removed — HR uses "Clock myself in" link instead)
  const [loading, setLoading] = useState(false)

  // Auto-refresh interval ref
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchToday = useCallback(async () => {
    setTodayLoading(true)
    try {
      const res  = await fetch('/api/attendance?today=true')
      const data = await res.json()
      setTodayStats(data.todayStats ?? null)
      setTodayLogs(data.logs ?? [])
    } finally {
      setTodayLoading(false)
    }
  }, [])

  const fetchAllLogs = useCallback(async () => {
    setCalLoading(true)
    try {
      const [logsRes, sumRes] = await Promise.all([
        fetch(`/api/attendance?month=${month}&year=${year}`),
        fetch(`/api/attendance?month=${month}&year=${year}&summary=true`),
      ])
      const logsData = await logsRes.json()
      const sumData  = await sumRes.json()
      setAllLogs(logsData.logs ?? [])
      setCalSummary(sumData.summary ?? [])
    } finally {
      setCalLoading(false)
    }
  }, [month, year])

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/attendance?month=${month}&year=${year}&summary=true`)
      const data = await res.json()
      setSummary(data.summary ?? [])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  const fetchOvertimeLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/attendance?month=${month}&year=${year}&overtime=true`)
      const data = await res.json()
      setOvertimeLogs(data.logs ?? [])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  const fetchDevices = useCallback(async () => {
    const res = await fetch('/api/attendance/devices')
    if (!res.ok) return
    const data = await res.json()
    setDevices(data.devices ?? [])
    setSyncToken(data.syncToken ?? '')
  }, [])

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === 'today') {
      fetchToday()
      intervalRef.current = setInterval(fetchToday, 60_000)
    } else if (activeTab === 'calendar') {
      fetchAllLogs()
    } else if (activeTab === 'summary') {
      fetchSummary()
    } else if (activeTab === 'overtime') {
      fetchOvertimeLogs()
    } else if (activeTab === 'devices') {
      fetchDevices()
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeTab, fetchToday, fetchAllLogs, fetchSummary, fetchOvertimeLogs, fetchDevices])

  // ── Actions ────────────────────────────────────────────────────────────────
  // (Personal clock-in widget removed — HR uses the "Clock myself in" link in
  // the header which switches to the Employee preview view.)

  async function handleApproveOvertime(logId: string, hours: number, approve: boolean) {
    await fetch('/api/attendance/overtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceLogId: logId, overtimeHours: hours, approve }),
    })
    fetchOvertimeLogs()
  }

  async function handleRegenerateToken() {
    setTokenLoading(true)
    const res  = await fetch('/api/attendance/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'regenerate_token' }),
    })
    const data = await res.json()
    setSyncToken(data.token ?? '')
    setTokenLoading(false)
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const totalPendingOT = summary.reduce((sum, s) => sum + (s.pendingOvertimeHours ?? 0), 0)

  const inOffice = todayLogs.filter(r => r.clockIn && r.workType !== 'WFH')
  const wfhList  = todayLogs.filter(r => r.clockIn && r.workType === 'WFH')
  const onLeave  = todayLogs.filter(r => r.status === 'LEAVE')
  const absent   = todayLogs.filter(r => r.status === 'ABSENT')

  // Calendar matrix: employeeId+day → status
  const calDaysInMonth = new Date(year, month, 0).getDate()
  const calMap = new Map<string, string>()
  for (const log of allLogs) {
    const d = new Date(log.date).getDate()
    calMap.set(`${log.employeeId}:${d}`, log.status)
  }

  const workDays = workingDaysInMonth(month, year)

  // ── Stat card helper ───────────────────────────────────────────────────────

  function StatCard({
    icon: Icon, label, value, color,
  }: { icon: React.ElementType; label: string; value: number; color: string }) {
    return (
      <Card className="flex-1 min-w-[130px]">
        <CardContent className="p-4 flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', color)}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Employee card helper ───────────────────────────────────────────────────

  function EmployeeCard({ r, dot }: { r: TodayRecord; dot: string }) {
    return (
      <div className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center select-none">
            {getInitials(r.fullName)}
          </div>
          <span className={cn('absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white', dot)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{r.fullName}</p>
          <p className="text-xs text-gray-400 truncate">{r.department}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-medium text-gray-700">{fmtTime(r.clockIn)}</p>
          <p className="text-xs text-gray-400">{hoursLabel(r.clockIn, r.clockOut, r.hoursWorked)}</p>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Page Header — only renders when not in 'today' mode (the outer
              Time shell already provides a title for the Today tab). */}
      {mode !== 'today' && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {mode === 'summary' ? 'Monthly Report' :
               mode === 'overtime' ? 'Overtime Approvals' :
               mode === 'devices' ? 'Attendance Devices' :
               mode === 'calendar' ? 'Calendar' : 'Time & Attendance'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      )}

      {/* HR shortcuts — only show on Today, since outer shell renders the title there */}
      {mode === 'today' && userRole === 'HR_ADMIN' && (
        <div className="flex items-center gap-3 text-xs">
          <a href="/dashboard/attendance/security" className="text-blue-600 hover:underline">🛡️ Security Settings</a>
          <span className="text-slate-300">·</span>
          <a href="/dashboard/time/monthly-report" className="text-blue-600 hover:underline">📊 Monthly Report</a>
          <span className="text-slate-300">·</span>
          <a href="/dashboard/time/devices" className="text-blue-600 hover:underline">🔌 Devices</a>
          <span className="text-slate-300">·</span>
          <button
            type="button"
            onClick={() => {
              document.cookie = 'hr_preview_role=EMPLOYEE; path=/; max-age=3600; SameSite=Lax'
              window.location.href = '/dashboard/time'
            }}
            className="text-blue-600 hover:underline"
          >
            ⏱ Clock myself in
          </button>
        </div>
      )}

      {/* ── Month/Year Selector (shown on non-today tabs) ── */}
      {activeTab !== 'today' && activeTab !== 'devices' && (
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="h-9 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-9 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {/* Inner tab bar removed — outer Time & Attendance tabs (Today / Calendar /
          Leave / Approvals) are the sole navigation. Sub-pages (Monthly Report,
          Devices) live at /dashboard/time/monthly-report and /dashboard/time/devices. */}

      {/* ════════════════════════════════════════════════
          TAB: TODAY
      ════════════════════════════════════════════════ */}
      {activeTab === 'today' && (
        <div className="space-y-5">

          {/* Stat Cards */}
          {todayLoading && !todayStats ? (
            <p className="text-sm text-gray-400">Loading today&apos;s attendance…</p>
          ) : todayStats && (
            <div className="flex flex-wrap gap-3">
              <StatCard icon={UserCheck}   label="Present"  value={todayStats.present}  color="bg-green-100 text-green-600" />
              <StatCard icon={Home}        label="WFH"      value={todayStats.wfh}      color="bg-blue-100 text-blue-600" />
              <StatCard icon={AlertCircle} label="On Leave" value={todayStats.leave}    color="bg-purple-100 text-purple-600" />
              <StatCard icon={UserX}       label="Absent"   value={todayStats.absent}   color="bg-red-100 text-red-600" />
            </div>
          )}

          {/* In Office */}
          {inOffice.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                In Office ({inOffice.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {inOffice.map((r) => (
                  <EmployeeCard key={r.employeeId} r={r} dot="bg-green-500" />
                ))}
              </div>
            </div>
          )}

          {/* Working From Home */}
          {wfhList.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                Working From Home ({wfhList.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {wfhList.map((r) => (
                  <EmployeeCard key={r.employeeId} r={r} dot="bg-blue-500" />
                ))}
              </div>
            </div>
          )}

          {/* "Not Yet In" was removed — transient state, not actionable.
              At end of day, anyone without a clock-in rolls into Absent. */}

          {/* On Leave */}
          {onLeave.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                On Leave ({onLeave.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {onLeave.map((r) => (
                  <div key={r.employeeId} className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center select-none shrink-0">
                      {getInitials(r.fullName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">{r.fullName}</p>
                      <p className="text-xs text-purple-600 truncate">Leave approved</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Absent */}
          {absent.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                Absent ({absent.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {absent.map((r) => (
                  <div key={r.employeeId} className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-red-200 text-red-700 text-xs font-bold flex items-center justify-center select-none shrink-0">
                      {getInitials(r.fullName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">{r.fullName}</p>
                      <p className="text-xs text-red-600 truncate">No record</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!todayLoading && todayLogs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">No attendance data available for today.</p>
          )}

          {/* Auto-refresh hint */}
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Auto-refreshes every 60 seconds
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: CALENDAR
      ════════════════════════════════════════════════ */}
      {activeTab === 'calendar' && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance Calendar — {MONTHS[month - 1]} {year}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {calLoading ? (
              <p className="text-sm text-gray-400 p-6">Loading…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full min-w-max">
                  <thead>
                    <tr className="bg-gray-50">
                      {/* Sticky employee name column */}
                      <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left font-semibold text-gray-600 border-b border-r border-gray-200 min-w-[160px]">
                        Employee
                      </th>
                      {Array.from({ length: calDaysInMonth }, (_, i) => i + 1).map((d) => (
                        <th
                          key={d}
                          className={cn(
                            'px-2 py-2 text-center font-semibold border-b border-gray-200 min-w-[32px]',
                            isWeekend(year, month, d) ? 'text-gray-400 bg-gray-100' : 'text-gray-600',
                          )}
                        >
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calSummary.length === 0 ? (
                      <tr>
                        <td colSpan={calDaysInMonth + 1} className="text-center py-8 text-gray-400">
                          No data for this period.
                        </td>
                      </tr>
                    ) : calSummary.map((emp) => (
                      <tr key={emp.employeeId} className="hover:bg-gray-50 border-b border-gray-100">
                        <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-1.5 font-medium text-gray-800 border-r border-gray-200 whitespace-nowrap">
                          {emp.fullName}
                        </td>
                        {Array.from({ length: calDaysInMonth }, (_, i) => i + 1).map((d) => {
                          const status = calMap.get(`${emp.employeeId}:${d}`)
                          const weekend = isWeekend(year, month, d)
                          return (
                            <td key={d} className={cn('px-1 py-1.5 text-center', weekend && 'bg-gray-50')}>
                              <span
                                title={status ?? (weekend ? 'Weekend' : 'No data')}
                                className={cn(
                                  'inline-block w-5 h-5 rounded',
                                  weekend
                                    ? 'bg-gray-200'
                                    : status
                                      ? (CALENDAR_CELL[status] ?? 'bg-gray-200')
                                      : 'bg-gray-100',
                                )}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Legend */}
            <div className="flex items-center gap-4 px-4 py-3 border-t border-gray-100 bg-gray-50 flex-wrap">
              {[
                { color: 'bg-green-400', label: 'Present' },
                { color: 'bg-red-400',   label: 'Absent' },
                { color: 'bg-blue-400',  label: 'Leave' },
                { color: 'bg-gray-100',  label: 'No data' },
                { color: 'bg-gray-200',  label: 'Weekend' },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className={cn('inline-block w-3 h-3 rounded', l.color)} />
                  {l.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════
          TAB: MONTHLY REPORT
      ════════════════════════════════════════════════ */}
      {activeTab === 'summary' && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Report — {MONTHS[month - 1]} {year}</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>On Leave</TableHead>
                <TableHead>Attendance %</TableHead>
                <TableHead>OT Hours</TableHead>
                <TableHead>OT Approved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-400">Loading…</TableCell>
                </TableRow>
              ) : summary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-400">No attendance data for this period.</TableCell>
                </TableRow>
              ) : (
                <>
                  {summary.map((s) => {
                    const pct = attendancePct(s.present, s.late, workDays)
                    const pctColor = pct >= 90 ? 'text-green-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600'
                    return (
                      <TableRow key={s.employeeId}>
                        <TableCell className="font-mono text-xs">{s.employeeCode}</TableCell>
                        <TableCell className="font-medium">{s.fullName}</TableCell>
                        <TableCell>
                          <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', STATUS_COLORS.PRESENT)}>{s.present + s.late}</span>
                        </TableCell>
                        <TableCell>
                          <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', STATUS_COLORS.ABSENT)}>{s.absent}</span>
                        </TableCell>
                        <TableCell>
                          <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', STATUS_COLORS.LEAVE)}>{s.leave}</span>
                        </TableCell>
                        <TableCell>
                          <span className={cn('font-bold text-sm', pctColor)}>{pct}%</span>
                        </TableCell>
                        <TableCell className="text-gray-700">
                          {s.totalOvertimeHours > 0 ? `${s.totalOvertimeHours.toFixed(1)}h` : '—'}
                        </TableCell>
                        <TableCell>
                          {s.approvedOvertimeHours > 0
                            ? <Badge variant="success">{s.approvedOvertimeHours.toFixed(1)}h</Badge>
                            : s.pendingOvertimeHours > 0
                              ? <Badge variant="warning">{s.pendingOvertimeHours.toFixed(1)}h pending</Badge>
                              : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {/* Total row */}
                  {summary.length > 0 && (() => {
                    const totPresent = summary.reduce((a, s) => a + s.present, 0)
                    const totLate    = summary.reduce((a, s) => a + s.late, 0)
                    const totAbsent  = summary.reduce((a, s) => a + s.absent, 0)
                    const totLeave   = summary.reduce((a, s) => a + s.leave, 0)
                    const totOT      = summary.reduce((a, s) => a + s.totalOvertimeHours, 0)
                    const totApprOT  = summary.reduce((a, s) => a + s.approvedOvertimeHours, 0)
                    const avgPct     = summary.length > 0
                      ? Math.round(summary.reduce((a, s) => a + attendancePct(s.present, s.late, workDays), 0) / summary.length)
                      : 0
                    const avgColor   = avgPct >= 90 ? 'text-green-600' : avgPct >= 70 ? 'text-amber-600' : 'text-red-600'
                    return (
                      <TableRow className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                        <TableCell className="text-xs text-gray-500" colSpan={2}>Totals / Avg</TableCell>
                        <TableCell><span className={cn('px-2 py-0.5 rounded text-xs font-semibold', STATUS_COLORS.PRESENT)}>{totPresent + totLate}</span></TableCell>
                        <TableCell><span className={cn('px-2 py-0.5 rounded text-xs font-semibold', STATUS_COLORS.ABSENT)}>{totAbsent}</span></TableCell>
                        <TableCell><span className={cn('px-2 py-0.5 rounded text-xs font-semibold', STATUS_COLORS.LEAVE)}>{totLeave}</span></TableCell>
                        <TableCell><span className={cn('font-bold text-sm', avgColor)}>{avgPct}%</span></TableCell>
                        <TableCell className="text-gray-700">{totOT > 0 ? `${totOT.toFixed(1)}h` : '—'}</TableCell>
                        <TableCell>{totApprOT > 0 ? <Badge variant="success">{totApprOT.toFixed(1)}h</Badge> : '—'}</TableCell>
                      </TableRow>
                    )
                  })()}
                </>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ════════════════════════════════════════════════
          TAB: OVERTIME APPROVALS
      ════════════════════════════════════════════════ */}
      {activeTab === 'overtime' && (
        <Card>
          <CardHeader>
            <CardTitle>Overtime Approvals — {MONTHS[month - 1]} {year}</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Hours Worked</TableHead>
                <TableHead>OT Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400">Loading…</TableCell></TableRow>
              ) : overtimeLogs.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400">No overtime records this period.</TableCell></TableRow>
              ) : overtimeLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.fullName}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {new Date(log.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </TableCell>
                  <TableCell className="text-sm">{fmtTime(log.clockIn)}</TableCell>
                  <TableCell className="text-sm">{fmtTime(log.clockOut)}</TableCell>
                  <TableCell className="text-sm">{log.hoursWorked != null ? `${log.hoursWorked.toFixed(1)}h` : '—'}</TableCell>
                  <TableCell className="font-semibold text-blue-700">{log.overtimeHours.toFixed(1)}h</TableCell>
                  <TableCell>
                    {log.overtimeApproved
                      ? <Badge variant="success">Approved</Badge>
                      : <Badge variant="warning">Pending</Badge>}
                  </TableCell>
                  <TableCell>
                    {!isPreviewMode && (
                      !log.overtimeApproved ? (
                        <Button size="sm" onClick={() => handleApproveOvertime(log.id, log.overtimeHours, true)}>Approve</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleApproveOvertime(log.id, log.overtimeHours, false)}>Revoke</Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ════════════════════════════════════════════════
          TAB: DEVICES
      ════════════════════════════════════════════════ */}
      {activeTab === 'devices' && (
        <div className="space-y-5">

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="w-5 h-5 text-blue-600" />
                Connected Devices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {devices.length === 0 ? (
                <div className="flex items-center gap-3 py-4 text-gray-400">
                  <WifiOff className="w-5 h-5" />
                  <span className="text-sm">No devices have connected yet. Follow the setup guide below.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {devices.map((d) => (
                    <div key={d.sn} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Wifi className="w-4 h-4 text-green-500" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Device: {d.sn}</p>
                          <p className="text-xs text-gray-400">
                            Last seen: {d.lastSeen ? new Date(d.lastSeen).toLocaleString('en-PK') : 'Never'} ·
                            Last sync: {d.lastSync ? new Date(d.lastSync).toLocaleString('en-PK') : 'Never'}
                          </p>
                        </div>
                      </div>
                      <Badge variant="success">Online</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Sync Endpoint</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Server URL — configure this on your device</label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={`${typeof window !== 'undefined' ? window.location.origin : 'http://your-server'}/api/attendance/sync`} className="font-mono text-sm bg-gray-50" />
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(`${window.location.origin}/api/attendance/sync`, 'url')}>
                    {copied === 'url' ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Security Token (optional but recommended)</label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={syncToken || 'No token set — device can sync without authentication'} className="font-mono text-sm bg-gray-50" />
                  {syncToken && (
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(syncToken, 'token')}>
                      {copied === 'token' ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={handleRegenerateToken} disabled={tokenLoading}>
                    <RefreshCw className={cn('w-4 h-4', tokenLoading && 'animate-spin')} />
                    {syncToken ? 'Regenerate' : 'Generate Token'}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Set as <code className="bg-gray-100 px-1 rounded">X-Device-Token</code> header, or pass as <code className="bg-gray-100 px-1 rounded">?token=</code> query param
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Device Setup Guide</CardTitle></CardHeader>
            <CardContent className="space-y-5 text-sm">

              <div className="space-y-2">
                <p className="font-semibold text-gray-800 flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  ZKTeco / ESSL Fingerprint Devices (most common in Pakistan)
                </p>
                <div className="ml-8 space-y-1.5 text-gray-600">
                  <p>On the device: <strong>Menu → Comm → Cloud Server Settings</strong></p>
                  <p>Set <strong>Server Address</strong> to your server URL above</p>
                  <p>Set <strong>Server Port</strong> to <code className="bg-gray-100 px-1 rounded">80</code> (or 443 for HTTPS)</p>
                  <p>Enable <strong>ADMS</strong> (Active Data Management Service)</p>
                  <p>Enrol each employee using their <strong>CON-XXX-NNN</strong> code as the badge/user ID</p>
                  <p className="text-green-600 font-medium">The device will automatically push punches every 10 seconds</p>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <p className="font-semibold text-gray-800 flex items-center gap-2">
                  <span className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  Suprema / HID / Hikvision — JSON Webhook
                </p>
                <div className="ml-8 space-y-1.5 text-gray-600">
                  <p>Configure your device/middleware to POST JSON to the sync URL</p>
                  <p>Accepted field names (any of these work):</p>
                  <pre className="bg-gray-50 border rounded p-3 text-xs mt-1 overflow-x-auto">{`POST /api/attendance/sync
Content-Type: application/json

[
  {
    "pin": "CON-WBS-015",       // or badge_id / employee_id / user_id
    "time": "2026-05-15 09:02:00",  // or timestamp / datetime
    "type": "IN"                // or OUT — omit for auto-detect
  }
]`}</pre>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <p className="font-semibold text-gray-800 flex items-center gap-2">
                  <span className="w-6 h-6 bg-amber-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  Any device — CSV export / file upload
                </p>
                <div className="ml-8 space-y-1.5 text-gray-600">
                  <p>POST a plain-text CSV body to the sync URL</p>
                  <pre className="bg-gray-50 border rounded p-3 text-xs mt-1">{`# pin,timestamp,IN|OUT
CON-WBS-015,2026-05-15 09:02:00,IN
CON-WBS-015,2026-05-15 18:15:00,OUT`}</pre>
                </div>
              </div>

              <div className="border-t pt-4 bg-amber-50 rounded-lg p-3">
                <p className="text-amber-700 text-xs font-medium">
                  <strong>Employee Enrolment tip:</strong> Enrol each employee on the device using their exact code (e.g. <code>CON-WBS-015</code> or short form <code>WBS-015</code>). If your device only accepts numeric IDs, use the number at the end (e.g. <code>015</code>) and map it using the Pin Mapping config below.
                </p>
              </div>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  )
}
