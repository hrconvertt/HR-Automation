/**
 * Shared attendance grid/summary builder used by:
 *   - GET /api/attendance/grid (client refetches on month/filter change)
 *   - /dashboard/attendance server component (initial render)
 *   - /dashboard/attendance/[employeeId] detail page (per-employee months)
 *   - GET /api/attendance?summary=true (legacy monthly report shape)
 *   - buildAttendanceMonthCsv (HR export)
 *
 * ALL surfaces derive their per-day status + totals from the SAME two
 * functions here — deriveDayStatus() and computeEmployeeMonth() — so no view
 * can drift from another. Counting rules (single source of truth):
 *   P    counts in Present
 *   WFH  counts in Present AND WFH
 *   L    counts in Leave only
 *   H    counts in Half Day ONLY — half days never inflate the Leave column
 *   A    counts in Absent (weekdays only; per policy there should be none)
 *   WE / HO (public holiday) / LOA count in no attendance column
 *   Days before the employee's joiningDate and future days count nowhere.
 *
 * Role gating is applied via the caller-supplied effectiveRole + myEmpId
 * (both derived server-side from the verified session, never from input):
 *   HR_ADMIN       — all employees
 *   EXECUTIVE      — all employees, no export
 *   MANAGER / LEAD — self + direct reports
 *   everyone else  — self only (explicit allowlist; unknown roles never
 *                    default to full-company visibility)
 */
import { prisma } from '@/lib/prisma'
import { dayKey } from '@/lib/date-utils'
import { getPayrollConfig } from '@/lib/config'

export type CellStatus = 'P' | 'WFH' | 'L' | 'H' | 'A' | 'WE' | 'HO' | 'LOA'

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

export function isLateClockIn(
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

// ── Reporting window ─────────────────────────────────────────────────────────
// Nov 2025 (first tracked month) through the CURRENT month — computed, never
// hardcoded, so the month picker always includes the month HR is living in.
export function reportingMonths(): { month: number; year: number }[] {
  const list: { month: number; year: number }[] = []
  const now = new Date()
  let y = 2025
  let m = 11
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    list.push({ month: m, year: y })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return list
}

export function parseMonth(monthStr: string | null): { year: number; month: number } {
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number)
    return { year: y, month: m }
  }
  const today = new Date()
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
}

// ── Shared per-day derivation + counting ────────────────────────────────────

export interface DayContext {
  log?: { status: string; workType: string }
  isWeekend: boolean
  isHoliday: boolean
  onLOA: boolean
  onLeave: boolean
  halfDay: boolean
}

/**
 * Single source of truth for what one day cell shows.
 * Explicit log wins (a PRESENT log on a Saturday shows "P", weekend on-call);
 * then weekend / public holiday / LOA / approved leave; else A (unmarked).
 */
export function deriveDayStatus(ctx: DayContext): CellStatus {
  const { log } = ctx
  // Calendar structure wins first. Convertt is strictly Mon–Fri and observes
  // public holidays; nobody is scheduled on weekends. A stray PRESENT/LATE log
  // on a Saturday, Sunday, or public holiday (e.g. from a bad import) must NOT
  // override the day type — the cell shows WE / HOL regardless.
  //   Weekend  → always WE
  //   Holiday  → always HO
  // Deliberate HR decisions still show through on working days below.
  if (ctx.isWeekend) return 'WE'
  if (ctx.isHoliday) return 'HO'
  if (log) {
    if (log.status === 'LEAVE') return ctx.halfDay ? 'H' : 'L'
    if (log.status === 'HALF_DAY') return 'H'
    if (log.status === 'PRESENT' || log.status === 'LATE') {
      return log.workType === 'WFH' ? 'WFH' : 'P'
    }
    if (log.status === 'WEEKEND') return 'WE'
    if (log.status === 'HOLIDAY') return 'HO'
    if (log.status === 'ABSENT') return 'A'
  }
  if (ctx.onLOA) return 'LOA'
  if (ctx.onLeave) return ctx.halfDay ? 'H' : 'L'
  return 'A'
}

export interface AttendanceTotals {
  present: number
  leave: number
  wfh: number
  hd: number
  absent: number
  /** Public-holiday days in the period (informational; not an attendance count). */
  holiday: number
}

export function emptyTotals(): AttendanceTotals {
  return { present: 0, leave: 0, wfh: 0, hd: 0, absent: 0, holiday: 0 }
}

/** Apply one counted day to the running totals. HD counts ONLY in hd. */
export function tallyStatus(status: CellStatus, t: AttendanceTotals): void {
  if (status === 'P') t.present++
  else if (status === 'WFH') { t.present++; t.wfh++ }
  else if (status === 'L') t.leave++
  else if (status === 'H') t.hd++
  else if (status === 'A') t.absent++
  else if (status === 'HO') t.holiday++
  // WE / LOA count in no column.
}

export interface ComputedDay {
  day: number
  iso: string
  status: CellStatus
  isWeekend: boolean
  isFuture: boolean
  /** Day precedes the employee's joiningDate — rendered blank, never counted. */
  preJoin: boolean
}

export interface MonthComputeCtx {
  year: number
  month: number
  /** Local-midnight "today" — future days render blank and never count. */
  today: Date
  joiningDate?: Date | null
  getLog(iso: string): { status: string; workType: string } | undefined
  /** Approved-leave lookup: undefined = not on leave; boolean = halfDay flag. */
  getLeaveHalf(iso: string): boolean | undefined
  isHoliday(iso: string): boolean
  onLOA(iso: string): boolean
}

/**
 * Walk one calendar month for one employee. Used by grid mode, summary mode,
 * the CSV export and the employee detail page so every surface counts alike.
 */
export function computeEmployeeMonth(ctx: MonthComputeCtx): { days: ComputedDay[]; totals: AttendanceTotals } {
  const { year, month } = ctx
  const daysInMonth = new Date(year, month, 0).getDate()
  const joinDay = ctx.joiningDate ? new Date(ctx.joiningDate) : null
  if (joinDay) joinDay.setHours(0, 0, 0, 0)

  const totals = emptyTotals()
  const days: ComputedDay[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d)
    const dow = dt.getDay()
    const isWeekend = dow === 0 || dow === 6
    const iso = dayKey(dt)
    const isFuture = dt > ctx.today
    const log = ctx.getLog(iso)
    // A day before joining with an explicit log still renders/counts (data
    // always wins); otherwise pre-join days are blank and skipped.
    const preJoin = !log && joinDay != null && dt < joinDay
    const leaveHalf = ctx.getLeaveHalf(iso)
    const status: CellStatus = isFuture && !log
      ? 'A' // future — client renders as blank dot
      : deriveDayStatus({
          log,
          isWeekend,
          isHoliday: ctx.isHoliday(iso),
          onLOA: ctx.onLOA(iso),
          onLeave: leaveHalf !== undefined,
          halfDay: leaveHalf === true,
        })
    if (!isFuture && !preJoin) {
      // Unmarked weekdays tally as A; weekend/holiday work (explicit P/WFH
      // logs) DOES count — matches payroll's presentDays counting.
      if (!(status === 'A' && isWeekend)) tallyStatus(status, totals)
    }
    days.push({ day: d, iso, status, isWeekend, isFuture, preJoin })
  }
  return { days, totals }
}

// ── Bulk range loaders (shared by grid + summary modes) ─────────────────────

interface RangeBuckets {
  /** `${empId}|${iso}` → log */
  logBucket: Map<string, { status: string; workType: string }>
  /** `${empId}|${iso}` → halfDay flag */
  leaveDayBucket: Map<string, boolean>
  /** iso → true for PUBLIC holidays */
  holidaySet: Set<string>
  /** `${empId}|${iso}` covered by an LOA (start → actual/expected return, exclusive) */
  loaSet: Set<string>
}

async function loadRangeBuckets(
  empIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
  recordClockIn?: (employeeId: string, date: Date, clockIn: Date | null) => void,
): Promise<RangeBuckets> {
  const [logs, leaves, holidays, loas] = await Promise.all([
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
    prisma.holiday.findMany({
      where: { type: 'PUBLIC', date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true },
    }),
    prisma.leaveOfAbsence.findMany({
      where: {
        employeeId: { in: empIds },
        status: { in: ['ACTIVE', 'EXTENDED', 'RETURNED'] },
        startDate: { lte: rangeEnd },
      },
      select: { employeeId: true, startDate: true, expectedReturn: true, actualReturn: true },
    }),
  ])

  const logBucket = new Map<string, { status: string; workType: string }>()
  for (const l of logs) {
    logBucket.set(`${l.employeeId}|${dayKey(l.date)}`, { status: l.status, workType: l.workType })
    recordClockIn?.(l.employeeId, l.date, l.clockIn)
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

  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)))

  const loaSet = new Set<string>()
  for (const loa of loas) {
    const cur = new Date(Math.max(loa.startDate.getTime(), rangeStart.getTime()))
    cur.setHours(0, 0, 0, 0)
    const ret = new Date(loa.actualReturn ?? loa.expectedReturn)
    ret.setHours(0, 0, 0, 0)
    // Return day itself is a working day again — LOA covers start → return-1.
    while (cur < ret && cur <= rangeEnd) {
      loaSet.add(`${loa.employeeId}|${dayKey(cur)}`)
      cur.setDate(cur.getDate() + 1)
    }
  }

  return { logBucket, leaveDayBucket, holidaySet, loaSet }
}

/** Build a MonthComputeCtx for one employee out of the bulk range buckets. */
function empMonthCtx(
  empId: string,
  joiningDate: Date | null | undefined,
  buckets: RangeBuckets,
  year: number,
  month: number,
  today: Date,
): MonthComputeCtx {
  return {
    year,
    month,
    today,
    joiningDate,
    getLog: (iso) => buckets.logBucket.get(`${empId}|${iso}`),
    getLeaveHalf: (iso) => buckets.leaveDayBucket.get(`${empId}|${iso}`),
    isHoliday: (iso) => buckets.holidaySet.has(iso),
    onLOA: (iso) => buckets.loaSet.has(`${empId}|${iso}`),
  }
}

// ── Payload types ────────────────────────────────────────────────────────────

export interface GridQueryOpts {
  effectiveRole: string
  myEmpId: string | null
  summary?: boolean
  department?: string
  search?: string
  /** YYYY-MM; defaults to the current month. Ignored in summary mode. */
  month?: string | null
}

export interface GridDayCell { day: number; status: CellStatus; isWeekend: boolean; preJoin?: boolean }
export interface GridEmployeeRow {
  id: string
  employeeCode: string
  fullName: string
  designation: string | null
  department: string
  photoUrl: string | null
  days: GridDayCell[]
  totals: { present: number; leave: number; wfh: number; hd: number; absent: number; holiday: number }
  /** HR-only: late clock-ins this month; null = no clock-in data recorded. Omitted for other roles. */
  lateCount?: number | null
  /** HR-only: ISO days with a PENDING correction request (dotted in the grid). */
  pendingDays?: string[]
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
  employeeCode: string
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

// ── Main builder ─────────────────────────────────────────────────────────────

export async function buildAttendanceGrid(opts: GridQueryOpts): Promise<GridPayload | SummaryPayload> {
  const { effectiveRole, myEmpId, summary = false } = opts
  const department = opts.department ?? ''
  const search = (opts.search ?? '').trim()

  const empFilter: Record<string, unknown> = (() => {
    // Full-company visibility is an explicit allowlist — any other role
    // (FINANCE, future roles) defaults to self-only, never to "everyone".
    if (effectiveRole === 'HR_ADMIN' || effectiveRole === 'EXECUTIVE') return {}
    if ((effectiveRole === 'MANAGER' || effectiveRole === 'LEAD') && myEmpId) {
      return { OR: [{ id: myEmpId }, { reportingManagerId: myEmpId }] }
    }
    if (myEmpId) return { id: myEmpId }
    return { id: '__none__' }
  })()

  // Department + search filters layered on top of role filter.
  // attendanceExempt employees (founders/owners) never appear on attendance
  // surfaces — grid or Today board.
  const filters: Record<string, unknown> = { status: 'ACTIVE', attendanceExempt: false, ...empFilter }
  if (department) filters.department = { name: department }
  if (search) filters.fullName = { contains: search, mode: 'insensitive' }

  // Late tracking is HR-only — never computed (or sent) for other roles.
  const trackLate = effectiveRole === 'HR_ADMIN'

  const employees = await prisma.employee.findMany({
    where: filters,
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      designation: true,
      photoUrl: true,
      timings: true,
      joiningDate: true,
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

  const empIds = employees.map((e) => e.id)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const months = reportingMonths()

  // ── SUMMARY MODE ──────────────────────────────────────────────────────────
  if (summary) {
    const firstMonth = months[0]
    const lastMonth = months[months.length - 1]
    const rangeStart = new Date(firstMonth.year, firstMonth.month - 1, 1)
    const rangeEnd = new Date(lastMonth.year, lastMonth.month, 0, 23, 59, 59)

    const buckets = await loadRangeBuckets(empIds, rangeStart, rangeEnd, recordClockIn)

    const rows: SummaryEmployeeRow[] = employees.map((emp) => {
      const monthCells = months.map(({ year, month }) => {
        const { totals } = computeEmployeeMonth(
          empMonthCtx(emp.id, emp.joiningDate, buckets, year, month, today),
        )
        const monthKey = `${year}-${String(month).padStart(2, '0')}`
        const cell: SummaryMonthCell = {
          key: monthKey,
          present: totals.present,
          leave: totals.leave,
          wfh: totals.wfh,
          hd: totals.hd,
          absent: totals.absent,
        }
        if (trackLate) {
          const lk = `${monthKey}|${emp.id}`
          cell.late = lateBucket.has(lk) ? lateBucket.get(lk)! : null
        }
        return cell
      })
      const ytd = monthCells.reduce(
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
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        designation: emp.designation,
        department: emp.department?.name ?? '—',
        photoUrl: emp.photoUrl,
        months: monthCells,
        ytd,
      }
    })

    return {
      mode: 'summary',
      months: months.map(({ year, month }) => ({
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
  const mEnd = new Date(year, month, 0, 23, 59, 59)
  const daysInMonth = new Date(year, month, 0).getDate()

  const buckets = await loadRangeBuckets(empIds, mStart, mEnd, recordClockIn)

  // HR-only: pending correction requests this month → indicator dots.
  const pendingByEmp = new Map<string, string[]>()
  if (trackLate) {
    const pending = await prisma.attendanceCorrection.findMany({
      where: { employeeId: { in: empIds }, status: 'PENDING', date: { gte: mStart, lte: mEnd } },
      select: { employeeId: true, date: true },
    })
    for (const p of pending) {
      const arr = pendingByEmp.get(p.employeeId) ?? []
      arr.push(dayKey(p.date))
      pendingByEmp.set(p.employeeId, arr)
    }
  }

  const rows: GridEmployeeRow[] = employees.map((emp) => {
    const { days, totals } = computeEmployeeMonth(
      empMonthCtx(emp.id, emp.joiningDate, buckets, year, month, today),
    )
    const row: GridEmployeeRow = {
      id: emp.id,
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      designation: emp.designation,
      department: emp.department?.name ?? '—',
      photoUrl: emp.photoUrl,
      days: days.map((d) => ({
        day: d.day,
        status: d.status,
        isWeekend: d.isWeekend,
        ...(d.preJoin ? { preJoin: true } : {}),
      })),
      totals,
    }
    if (trackLate) {
      const lk = `${year}-${String(month).padStart(2, '0')}|${emp.id}`
      row.lateCount = lateBucket.has(lk) ? lateBucket.get(lk)! : null
      const pend = pendingByEmp.get(emp.id)
      if (pend?.length) row.pendingDays = pend
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

// ── Per-employee detail (all reporting months for one employee) ──────────────
// Used by /dashboard/attendance/[employeeId] so the detail calendar derives
// from EXACTLY the same logic as the grid/summary/CSV.

export interface EmployeeMonthsResult {
  months: {
    key: string
    label: string
    firstDow: number
    days: ComputedDay[]
    totals: AttendanceTotals
    /** Late clock-ins this month; null = no clock-in data recorded that month. */
    late: number | null
  }[]
  ytd: AttendanceTotals
}

export async function buildEmployeeMonths(emp: {
  id: string
  joiningDate?: Date | null
  timings?: string | null
}): Promise<EmployeeMonthsResult> {
  const months = reportingMonths()
  const first = months[0]
  const last = months[months.length - 1]
  const rangeStart = new Date(first.year, first.month - 1, 1)
  const rangeEnd = new Date(last.year, last.month, 0, 23, 59, 59)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const cfg = await getPayrollConfig()
  const lateBucket = new Map<string, number>()
  const recordClockIn = (_: string, date: Date, clockIn: Date | null) => {
    if (!clockIn) return
    const key = dayKey(date).slice(0, 7)
    const prev = lateBucket.get(key) ?? 0
    lateBucket.set(key, prev + (isLateClockIn(clockIn, emp.timings, cfg) ? 1 : 0))
  }

  const buckets = await loadRangeBuckets([emp.id], rangeStart, rangeEnd, recordClockIn)

  const ytd = emptyTotals()
  const monthBlocks = months.map(({ year, month }) => {
    const { days, totals } = computeEmployeeMonth(
      empMonthCtx(emp.id, emp.joiningDate, buckets, year, month, today),
    )
    ytd.present += totals.present
    ytd.leave += totals.leave
    ytd.wfh += totals.wfh
    ytd.hd += totals.hd
    ytd.absent += totals.absent
    ytd.holiday += totals.holiday
    const key = `${year}-${String(month).padStart(2, '0')}`
    return {
      key,
      label: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      firstDow: new Date(year, month - 1, 1).getDay(),
      days,
      totals,
      late: lateBucket.has(key) ? lateBucket.get(key)! : null,
    }
  })

  return { months: monthBlocks, ytd }
}

// ── Month export (CSV, HR-only) ──────────────────────────────────────────────
// One row per employee. Every count comes straight from the grid builder's
// totals so the export can NEVER drift from what the grid displays (same
// deriveDayStatus + tallyStatus rules — including the holiday column, which
// now counts derived HO days, not just explicit HOLIDAY logs). Approved OT
// hours are read from the raw month logs; late count reuses the grid's
// HR-only lateCount ("—" when the employee has no clock-in data that month).

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
    select: { employeeId: true, overtimeHours: true, overtimeApproved: true },
  })
  const otByEmp = new Map<string, number>()
  for (const l of logs) {
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
      emp.totals.holiday,
      emp.lateCount == null ? '—' : emp.lateCount,
      Math.round((otByEmp.get(emp.id) ?? 0) * 100) / 100,
    ].join(','))
  }
  return { csv: lines.join('\n'), monthKey: grid.month }
}
