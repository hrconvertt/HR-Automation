/**
 * Shared attendance grid/summary builder used by both:
 *   - GET /api/attendance/grid (client refetches on month/filter change)
 *   - /dashboard/attendance server component (initial render)
 *
 * Role gating is applied via the caller-supplied effectiveRole + myEmpId
 * (both derived server-side from the verified session, never from input):
 *   HR_ADMIN  — all employees
 *   EXECUTIVE — all employees, no export
 *   MANAGER   — self + direct reports
 *   EMPLOYEE  — self only
 */
import { prisma } from '@/lib/prisma'
import { dayKey } from '@/lib/date-utils'
import { getPayrollConfig } from '@/lib/config'

export type CellStatus = 'P' | 'WFH' | 'L' | 'H' | 'A' | 'WE'

// ── Late-arrival tracking (HR-only) ─────────────────────────────────────────
// Employee.timings stores the shift like "10:00 AM – 7:00 PM". A clock-in is
// "late" when it lands after shift start + grace. The grace period comes from
// the payroll config's lateThresholdMinute (the config threshold 10:15 is
// "standard 10:00 start + 15 min grace"). If the timings string can't be
// parsed, fall back to the absolute config threshold (lateThresholdHour:Minute).

/** Parse the shift start out of a timings string like "10:00 AM – 7:00 PM". */
export function parseShiftStart(timings: string | null | undefined): { hour: number; minute: number } | null {
  if (!timings) return null
  const m = timings.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let hour = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') hour += 12
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

function isLateClockIn(
  clockIn: Date,
  timings: string | null | undefined,
  cfg: { lateThresholdHour: number; lateThresholdMinute: number },
): boolean {
  const shift = parseShiftStart(timings)
  const clockMins = clockIn.getHours() * 60 + clockIn.getMinutes()
  if (shift) {
    return clockMins > shift.hour * 60 + shift.minute + cfg.lateThresholdMinute
  }
  // No parseable shift — use the absolute config threshold (default 10:15).
  return clockMins > cfg.lateThresholdHour * 60 + cfg.lateThresholdMinute
}

export const REPORTING_MONTHS: { month: number; year: number }[] = [
  { month: 11, year: 2025 },
  { month: 12, year: 2025 },
  { month: 1, year: 2026 },
  { month: 2, year: 2026 },
  { month: 3, year: 2026 },
  { month: 4, year: 2026 },
  { month: 5, year: 2026 },
  { month: 6, year: 2026 },
]

export function parseMonth(monthStr: string | null): { year: number; month: number } {
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number)
    return { year: y, month: m }
  }
  const today = new Date()
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
}

function deriveStatus(log: { status: string; workType: string } | undefined, isWeekend: boolean, isLeaveDay: boolean, isHalfDay: boolean): CellStatus {
  // Check the actual logged status FIRST — if the employee was marked PRESENT
  // on a Saturday (e.g. weekend on-call work), show "P", not "WE".
  if (log) {
    if (log.status === 'LEAVE') return isHalfDay ? 'H' : 'L'
    if (log.status === 'HALF_DAY') return 'H'
    if (log.status === 'PRESENT' || log.status === 'LATE') {
      return log.workType === 'WFH' ? 'WFH' : 'P'
    }
    if (log.status === 'WEEKEND') return 'WE'
    if (log.status === 'HOLIDAY') return 'WE'
    if (log.status === 'ABSENT') return 'A'
  }
  // No explicit log for this day — fall back to weekend / leave / absent.
  if (isWeekend) return 'WE'
  if (isLeaveDay) return isHalfDay ? 'H' : 'L'
  return 'A'
}

export interface GridQueryOpts {
  effectiveRole: string
  myEmpId: string | null
  summary?: boolean
  department?: string
  search?: string
  /** YYYY-MM; defaults to the current month. Ignored in summary mode. */
  month?: string | null
}

export interface GridDayCell { day: number; status: CellStatus; isWeekend: boolean }
export interface GridEmployeeRow {
  id: string
  fullName: string
  designation: string | null
  department: string
  photoUrl: string | null
  days: GridDayCell[]
  totals: { present: number; leave: number; wfh: number; hd: number; absent: number }
  /** HR-only: late clock-ins this month; null = no clock-in data recorded. Omitted for other roles. */
  lateCount?: number | null
}
export interface GridPayload {
  mode: 'grid'
  month: string
  monthLabel: string
  daysInMonth: number
  today: string
  employees: GridEmployeeRow[]
  role: string
  canExport: boolean
}
export interface SummaryMonthCell {
  key: string
  present: number
  leave: number
  wfh: number
  hd: number
  absent: number
  /** HR-only: late clock-ins this month; null = no clock-in data recorded. Omitted for other roles. */
  late?: number | null
}
export interface SummaryEmployeeRow {
  id: string
  fullName: string
  designation: string | null
  department: string
  photoUrl: string | null
  months: SummaryMonthCell[]
  ytd: { present: number; leave: number; wfh: number; hd: number; absent: number }
}
export interface SummaryPayload {
  mode: 'summary'
  months: { key: string; label: string }[]
  employees: SummaryEmployeeRow[]
  role: string
}

export async function buildAttendanceGrid(opts: GridQueryOpts): Promise<GridPayload | SummaryPayload> {
  const { effectiveRole, myEmpId, summary = false } = opts
  const department = opts.department ?? ''
  const search = (opts.search ?? '').trim()

  const empFilter: Record<string, unknown> = (() => {
    if (effectiveRole === 'EMPLOYEE' && myEmpId) return { id: myEmpId }
    if (effectiveRole === 'MANAGER' && myEmpId) {
      return { OR: [{ id: myEmpId }, { reportingManagerId: myEmpId }] }
    }
    return {}
  })()

  // Department + search filters layered on top of role filter
  const filters: Record<string, unknown> = { status: 'ACTIVE', ...empFilter }
  if (department) filters.department = { name: department }
  if (search) filters.fullName = { contains: search, mode: 'insensitive' }

  // Late tracking is HR-only — never computed (or sent) for other roles.
  const trackLate = effectiveRole === 'HR_ADMIN'

  const employees = await prisma.employee.findMany({
    where: filters,
    select: {
      id: true,
      fullName: true,
      designation: true,
      photoUrl: true,
      timings: true,
      department: { select: { name: true } },
    },
    orderBy: { fullName: 'asc' },
  })
  const timingsByEmp = new Map(employees.map((e) => [e.id, e.timings]))
  const cfg = trackLate ? await getPayrollConfig() : null

  /** monthKey(YYYY-MM)|empId → late count; presence of key = clock-in data exists. */
  const lateBucket = new Map<string, number>()
  function recordClockIn(employeeId: string, date: Date, clockIn: Date | null) {
    if (!cfg || !clockIn) return
    const key = `${dayKey(date).slice(0, 7)}|${employeeId}`
    const prev = lateBucket.get(key) ?? 0
    const late = isLateClockIn(clockIn, timingsByEmp.get(employeeId), cfg)
    lateBucket.set(key, prev + (late ? 1 : 0))
  }

  // ── SUMMARY MODE ──────────────────────────────────────────────────────────
  if (summary) {
    const firstMonth = REPORTING_MONTHS[0]
    const lastMonth = REPORTING_MONTHS[REPORTING_MONTHS.length - 1]
    const rangeStart = new Date(firstMonth.year, firstMonth.month - 1, 1)
    const rangeEnd = new Date(lastMonth.year, lastMonth.month, 0, 23, 59, 59)

    const empIds = employees.map((e) => e.id)
    const [logs, leaves] = await Promise.all([
      prisma.attendanceLog.findMany({
        where: { employeeId: { in: empIds }, date: { gte: rangeStart, lte: rangeEnd } },
        select: { employeeId: true, date: true, status: true, workType: true, clockIn: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: empIds },
          status: 'APPROVED',
          fromDate: { lte: rangeEnd },
          toDate: { gte: rangeStart },
        },
        select: { employeeId: true, fromDate: true, toDate: true, firstDayHalf: true, lastDayHalf: true },
      }),
    ])

    // Pre-bucket logs by employee + month
    const logBucket = new Map<string, { status: string; workType: string }>()
    for (const l of logs) {
      logBucket.set(`${l.employeeId}|${dayKey(l.date)}`, { status: l.status, workType: l.workType })
      recordClockIn(l.employeeId, l.date, l.clockIn)
    }
    const leaveDayBucket = new Map<string, boolean /* halfDay */>()
    for (const lv of leaves) {
      const cur = new Date(lv.fromDate)
      cur.setHours(0, 0, 0, 0)
      const end = new Date(lv.toDate)
      end.setHours(0, 0, 0, 0)
      while (cur <= end) {
        const isFirst = cur.getTime() === new Date(lv.fromDate).setHours(0, 0, 0, 0)
        const isLast = cur.getTime() === new Date(lv.toDate).setHours(0, 0, 0, 0)
        const half = (isFirst && lv.firstDayHalf) || (isLast && lv.lastDayHalf)
        leaveDayBucket.set(`${lv.employeeId}|${dayKey(cur)}`, half)
        cur.setDate(cur.getDate() + 1)
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const rows: SummaryEmployeeRow[] = employees.map((emp) => {
      const months = REPORTING_MONTHS.map(({ year, month }) => {
        const mStart = new Date(year, month - 1, 1)
        const mEnd = new Date(year, month, 0)
        let present = 0, leave = 0, wfh = 0, hd = 0, absent = 0
        const cur = new Date(mStart)
        while (cur <= mEnd) {
          const dow = cur.getDay()
          const isWeekend = dow === 0 || dow === 6
          if (!isWeekend && cur <= today) {
            const key = `${emp.id}|${dayKey(cur)}`
            const log = logBucket.get(key)
            const onLeave = leaveDayBucket.has(key)
            const halfDay = leaveDayBucket.get(key) === true
            const status = deriveStatus(log, false, onLeave, halfDay)
            if (status === 'P') present++
            else if (status === 'WFH') { present++; wfh++ }
            else if (status === 'L') leave++
            // Half-days count in the HD column only — they're not "full leave"
            // days. Combining 0.5s into the L column was producing the Ali Hassan
            // L=3-but-only-2-leave-cells bug.
            else if (status === 'H') { hd++ }
            else if (status === 'A') absent++
          }
          cur.setDate(cur.getDate() + 1)
        }
        const monthKey = `${year}-${String(month).padStart(2, '0')}`
        const cell: SummaryMonthCell = { key: monthKey, present, leave, wfh, hd, absent }
        if (trackLate) {
          const lk = `${monthKey}|${emp.id}`
          cell.late = lateBucket.has(lk) ? lateBucket.get(lk)! : null
        }
        return cell
      })
      const ytd = months.reduce(
        (acc, m) => ({
          present: acc.present + m.present,
          leave: acc.leave + m.leave,
          wfh: acc.wfh + m.wfh,
          hd: acc.hd + m.hd,
          absent: acc.absent + m.absent,
        }),
        { present: 0, leave: 0, wfh: 0, hd: 0, absent: 0 },
      )
      return {
        id: emp.id,
        fullName: emp.fullName,
        designation: emp.designation,
        department: emp.department?.name ?? '—',
        photoUrl: emp.photoUrl,
        months,
        ytd,
      }
    })

    return {
      mode: 'summary',
      months: REPORTING_MONTHS.map(({ year, month }) => ({
        key: `${year}-${String(month).padStart(2, '0')}`,
        label: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      })),
      employees: rows,
      role: effectiveRole,
    }
  }

  // ── GRID MODE (per-day for one month) ─────────────────────────────────────
  const { year, month } = parseMonth(opts.month ?? null)
  const mStart = new Date(year, month - 1, 1)
  const mEnd = new Date(year, month, 0)
  const daysInMonth = mEnd.getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const empIds = employees.map((e) => e.id)
  const [logs, leaves] = await Promise.all([
    prisma.attendanceLog.findMany({
      where: { employeeId: { in: empIds }, date: { gte: mStart, lte: mEnd } },
      select: { employeeId: true, date: true, status: true, workType: true, clockIn: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: empIds },
        status: 'APPROVED',
        fromDate: { lte: mEnd },
        toDate: { gte: mStart },
      },
      select: { employeeId: true, fromDate: true, toDate: true, firstDayHalf: true, lastDayHalf: true },
    }),
  ])

  const logBucket = new Map<string, { status: string; workType: string }>()
  for (const l of logs) {
    logBucket.set(`${l.employeeId}|${dayKey(l.date)}`, { status: l.status, workType: l.workType })
    recordClockIn(l.employeeId, l.date, l.clockIn)
  }
  const leaveDayBucket = new Map<string, boolean>()
  for (const lv of leaves) {
    const cur = new Date(lv.fromDate)
    cur.setHours(0, 0, 0, 0)
    const end = new Date(lv.toDate)
    end.setHours(0, 0, 0, 0)
    while (cur <= end) {
      const isFirst = cur.getTime() === new Date(lv.fromDate).setHours(0, 0, 0, 0)
      const isLast = cur.getTime() === new Date(lv.toDate).setHours(0, 0, 0, 0)
      const half = (isFirst && lv.firstDayHalf) || (isLast && lv.lastDayHalf)
      leaveDayBucket.set(`${lv.employeeId}|${dayKey(cur)}`, half)
      cur.setDate(cur.getDate() + 1)
    }
  }

  const rows: GridEmployeeRow[] = employees.map((emp) => {
    let present = 0, leave = 0, wfh = 0, hd = 0, absent = 0
    const days: GridDayCell[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d)
      const dow = dt.getDay()
      const isWeekend = dow === 0 || dow === 6
      const key = `${emp.id}|${dayKey(dt)}`
      const log = logBucket.get(key)
      const onLeave = leaveDayBucket.has(key)
      const halfDay = leaveDayBucket.get(key) === true
      const status: CellStatus = isWeekend
        ? 'WE'
        : dt > today
          ? 'A' // future days — render as blank; client maps 'A' for future to dash
          : deriveStatus(log, false, onLeave, halfDay)
      if (!isWeekend && dt <= today) {
        if (status === 'P') present++
        else if (status === 'WFH') { present++; wfh++ }
        else if (status === 'L') leave++
        else if (status === 'H') { hd++; leave += 0.5 }
        else if (status === 'A') absent++
      }
      days.push({ day: d, status, isWeekend })
    }
    const row: GridEmployeeRow = {
      id: emp.id,
      fullName: emp.fullName,
      designation: emp.designation,
      department: emp.department?.name ?? '—',
      photoUrl: emp.photoUrl,
      days,
      totals: { present, leave, wfh, hd, absent },
    }
    if (trackLate) {
      const lk = `${year}-${String(month).padStart(2, '0')}|${emp.id}`
      row.lateCount = lateBucket.has(lk) ? lateBucket.get(lk)! : null
    }
    return row
  })

  return {
    mode: 'grid',
    month: `${year}-${String(month).padStart(2, '0')}`,
    monthLabel: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    daysInMonth,
    today: dayKey(today),
    employees: rows,
    role: effectiveRole,
    canExport: effectiveRole === 'HR_ADMIN',
  }
}

// ── Month export (CSV, HR-only) ──────────────────────────────────────────────
// One row per employee. The P/WFH/L/HD counts come straight from the grid
// builder's totals so the export can NEVER drift from what the grid displays
// (same deriveStatus + counting rules). Holiday count and approved OT hours
// are read from the raw month logs; late count reuses the grid's HR-only
// lateCount ("" when the employee has no clock-in data that month).

function csvEscape(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function buildAttendanceMonthCsv(opts: {
  month?: string | null
  department?: string
  search?: string
}): Promise<{ csv: string; monthKey: string }> {
  // Caller (API route) must already have verified the requester is HR_ADMIN.
  const grid = (await buildAttendanceGrid({
    effectiveRole: 'HR_ADMIN',
    myEmpId: null,
    month: opts.month,
    department: opts.department,
    search: opts.search,
  })) as GridPayload

  const { year, month } = parseMonth(grid.month)
  const mStart = new Date(year, month - 1, 1)
  const mEnd = new Date(year, month, 0, 23, 59, 59)

  const logs = await prisma.attendanceLog.findMany({
    where: { employeeId: { in: grid.employees.map((e) => e.id) }, date: { gte: mStart, lte: mEnd } },
    select: { employeeId: true, status: true, overtimeHours: true, overtimeApproved: true },
  })
  const holidayByEmp = new Map<string, number>()
  const otByEmp = new Map<string, number>()
  for (const l of logs) {
    if (l.status === 'HOLIDAY') holidayByEmp.set(l.employeeId, (holidayByEmp.get(l.employeeId) ?? 0) + 1)
    if (l.overtimeApproved && l.overtimeHours > 0) {
      otByEmp.set(l.employeeId, (otByEmp.get(l.employeeId) ?? 0) + l.overtimeHours)
    }
  }

  const header = ['Employee', 'Department', 'Present', 'WFH', 'Leave', 'Half Day', 'Holiday', 'Late', 'Approved OT Hours']
  const lines = [header.join(',')]
  for (const emp of grid.employees) {
    lines.push([
      csvEscape(emp.fullName),
      csvEscape(emp.department),
      emp.totals.present,
      emp.totals.wfh,
      emp.totals.leave,
      emp.totals.hd,
      holidayByEmp.get(emp.id) ?? 0,
      emp.lateCount == null ? '—' : emp.lateCount,
      Math.round((otByEmp.get(emp.id) ?? 0) * 100) / 100,
    ].join(','))
  }
  return { csv: lines.join('\n'), monthKey: grid.month }
}
