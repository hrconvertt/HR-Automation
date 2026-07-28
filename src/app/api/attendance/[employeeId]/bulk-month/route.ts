/**
 * Per-employee MONTH bulk editor endpoint (HR-only).
 *
 *   GET  /api/attendance/[employeeId]/bulk-month?month=YYYY-MM
 *     → { employee, month, locked, days[] } — everything the drawer needs to
 *       render: each day's current derived status, whether it is editable
 *       (working day, not future, within join/exit bounds) and whether the
 *       month's payroll is closed (drawer opens read-only).
 *
 *   POST /api/attendance/[employeeId]/bulk-month
 *     body { month, year, days: [{ day, status, workType? }] }
 *     → writes every changed day in ONE request using the SAME status→
 *       AttendanceLog mapping (CELL_DEFAULTS) as the single-cell PATCH, writes
 *       one AuditLog row per day, and returns the updated cells.
 *
 * Guards (all server-side, never trusted from the client):
 *   - Requester must be HR_ADMIN; hr_preview_role is honored (a previewing HR
 *     admin cannot write).
 *   - The month's REGULAR payroll must not be closed (PAID/LOCKED/…).
 *   - Weekend and public-holiday days are refused.
 *   - Future days and days outside the employee's join/exit window are refused.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { dayKey, endOfDay } from '@/lib/date-utils'
import { CELL_DEFAULTS, PAYROLL_CLOSED_STATUSES, type CellStatus } from '@/lib/attendance-cell'
import { computeEmployeeMonth } from '@/lib/queries/attendance-grid'

interface RouteContext {
  params: Promise<{ employeeId: string }>
}

/** Resolve the verified requester and enforce HR-only (preview-role aware). */
async function requireHr(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  const previewRole =
    user?.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user?.role
  if (!user || effectiveRole !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Only HR can edit attendance' }, { status: 403 }) }
  }
  return { user }
}

function parseMonthParam(s: string | null): { year: number; month: number } | null {
  if (!s || !/^\d{4}-\d{2}$/.test(s)) return null
  const [y, m] = s.split('-').map(Number)
  if (m < 1 || m > 12) return null
  return { year: y, month: m }
}

/** Is the month's REGULAR payroll closed? */
async function isMonthLocked(year: number, month: number): Promise<boolean> {
  const closed = await prisma.payrollRun.findFirst({
    where: { month, year, runType: 'REGULAR', status: { in: PAYROLL_CLOSED_STATUSES } },
    select: { id: true },
  })
  return !!closed
}

// ── GET — everything the drawer needs to render one month ────────────────────
export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await requireHr(request)
  if ('error' in auth) return auth.error

  const { employeeId } = await ctx.params
  const parsed = parseMonthParam(new URL(request.url).searchParams.get('month'))
  if (!parsed) return NextResponse.json({ error: 'Invalid month (expected YYYY-MM)' }, { status: 400 })
  const { year, month } = parsed

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, joiningDate: true, exitDate: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const mStart = new Date(year, month - 1, 1)
  const mEnd = new Date(year, month, 0, 23, 59, 59)

  const [logs, leaves, holidays, loas] = await Promise.all([
    prisma.attendanceLog.findMany({
      where: { employeeId, date: { gte: mStart, lte: mEnd } },
      select: { date: true, status: true, workType: true },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId, status: 'APPROVED', fromDate: { lte: mEnd }, toDate: { gte: mStart } },
      select: { fromDate: true, toDate: true, firstDayHalf: true, lastDayHalf: true },
    }),
    prisma.holiday.findMany({
      where: { type: 'PUBLIC', date: { gte: mStart, lte: mEnd } },
      select: { date: true },
    }),
    prisma.leaveOfAbsence.findMany({
      where: {
        employeeId,
        status: { in: ['ACTIVE', 'EXTENDED', 'RETURNED'] },
        startDate: { lte: mEnd },
      },
      select: { startDate: true, expectedReturn: true, actualReturn: true },
    }),
  ])

  const logBucket = new Map<string, { status: string; workType: string }>()
  for (const l of logs) logBucket.set(dayKey(l.date), { status: l.status, workType: l.workType })

  const leaveDayBucket = new Map<string, boolean>()
  for (const lv of leaves) {
    const cur = new Date(lv.fromDate); cur.setHours(0, 0, 0, 0)
    const end = new Date(lv.toDate); end.setHours(0, 0, 0, 0)
    while (cur <= end) {
      const isFirst = cur.getTime() === new Date(lv.fromDate).setHours(0, 0, 0, 0)
      const isLast = cur.getTime() === new Date(lv.toDate).setHours(0, 0, 0, 0)
      leaveDayBucket.set(dayKey(cur), (isFirst && lv.firstDayHalf) || (isLast && lv.lastDayHalf))
      cur.setDate(cur.getDate() + 1)
    }
  }

  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)))

  const loaSet = new Set<string>()
  for (const loa of loas) {
    const cur = new Date(Math.max(loa.startDate.getTime(), mStart.getTime())); cur.setHours(0, 0, 0, 0)
    const ret = new Date(loa.actualReturn ?? loa.expectedReturn); ret.setHours(0, 0, 0, 0)
    while (cur < ret && cur <= mEnd) { loaSet.add(dayKey(cur)); cur.setDate(cur.getDate() + 1) }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const { days } = computeEmployeeMonth({
    year, month, today,
    joiningDate: employee.joiningDate,
    getLog: (iso) => logBucket.get(iso),
    getLeaveHalf: (iso) => leaveDayBucket.get(iso),
    isHoliday: (iso) => holidaySet.has(iso),
    onLOA: (iso) => loaSet.has(iso),
  })

  const exit = employee.exitDate ? new Date(employee.exitDate) : null
  if (exit) exit.setHours(0, 0, 0, 0)
  const locked = await isMonthLocked(year, month)

  const outDays = days.map((d) => {
    const dt = new Date(year, month - 1, d.day)
    const afterExit = exit != null && dt > exit
    // Editable: a real working day, in the past-or-today, within employment,
    // and only if the day carries no approved-leave / LOA status (those are HR
    // decisions made elsewhere — the editor sets attendance, not leave).
    const structural = d.status === 'WE' || d.status === 'HO'
    const leaveDriven = d.status === 'L' || d.status === 'H' || d.status === 'LOA'
    const editable = !structural && !d.isFuture && !d.preJoin && !afterExit
    return {
      day: d.day,
      iso: d.iso,
      status: d.status,
      isWeekend: d.isWeekend,
      isHoliday: d.status === 'HO',
      isFuture: d.isFuture,
      preJoin: d.preJoin,
      afterExit,
      editable,
      leaveDriven,
    }
  })

  return NextResponse.json({
    employee: { id: employee.id, fullName: employee.fullName },
    month: `${year}-${String(month).padStart(2, '0')}`,
    monthLabel: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    daysInMonth: new Date(year, month, 0).getDate(),
    today: dayKey(today),
    locked,
    days: outDays,
  })
}

// ── POST — write every changed day atomically ────────────────────────────────
interface DayEdit { day: number; status: string; workType?: string }

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireHr(request)
  if ('error' in auth) return auth.error
  const { user } = auth

  const { employeeId } = await ctx.params
  const body = (await request.json().catch(() => null)) as
    | { month?: number; year?: number; days?: DayEdit[] }
    | null
  if (!body || typeof body.month !== 'number' || typeof body.year !== 'number' || !Array.isArray(body.days)) {
    return NextResponse.json({ error: 'Expected { month, year, days: [...] }' }, { status: 400 })
  }
  const { month, year } = body
  if (month < 1 || month > 12) return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
  if (body.days.length === 0) return NextResponse.json({ ok: true, cells: [] })
  if (body.days.length > 40) return NextResponse.json({ error: 'Too many days in one request' }, { status: 400 })

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, joiningDate: true, exitDate: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Guard: month's REGULAR payroll must not be closed.
  if (await isMonthLocked(year, month)) {
    return NextResponse.json({ error: "This month's payroll is closed" }, { status: 409 })
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const join = employee.joiningDate ? new Date(employee.joiningDate) : null
  if (join) join.setHours(0, 0, 0, 0)
  const exit = employee.exitDate ? new Date(employee.exitDate) : null
  if (exit) exit.setHours(0, 0, 0, 0)

  const mStart = new Date(year, month - 1, 1)
  const mEnd = new Date(year, month, 0, 23, 59, 59)
  const holidays = await prisma.holiday.findMany({
    where: { type: 'PUBLIC', date: { gte: mStart, lte: mEnd } },
    select: { date: true },
  })
  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)))

  // Validate every day BEFORE writing any — reject the whole request on the
  // first structural violation so a client bug can't half-apply.
  const validated: { day: number; date: Date; iso: string; cell: (typeof CELL_DEFAULTS)[CellStatus] }[] = []
  for (const edit of body.days) {
    if (typeof edit.day !== 'number' || edit.day < 1 || edit.day > daysInMonth) {
      return NextResponse.json({ error: `Invalid day ${edit.day}` }, { status: 400 })
    }
    if (!edit.status || !(edit.status in CELL_DEFAULTS)) {
      return NextResponse.json(
        { error: `status for day ${edit.day} must be one of PRESENT | LEAVE | WFH | HALF_DAY | ABSENT` },
        { status: 400 },
      )
    }
    const date = new Date(year, month - 1, edit.day)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) {
      return NextResponse.json({ error: `Day ${edit.day} is a weekend and cannot be edited` }, { status: 400 })
    }
    const iso = dayKey(date)
    if (holidaySet.has(iso)) {
      return NextResponse.json({ error: `Day ${edit.day} is a public holiday and cannot be edited` }, { status: 400 })
    }
    if (date > today) {
      return NextResponse.json({ error: `Day ${edit.day} is in the future` }, { status: 400 })
    }
    if (join && date < join) {
      return NextResponse.json({ error: `Day ${edit.day} precedes the joining date` }, { status: 400 })
    }
    if (exit && date > exit) {
      return NextResponse.json({ error: `Day ${edit.day} is after the exit date` }, { status: 400 })
    }
    validated.push({ day: edit.day, date, iso, cell: CELL_DEFAULTS[edit.status as CellStatus] })
  }

  const note = 'Bulk month edit'
  const cells: { day: number; iso: string; status: string; workType: string }[] = []

  // One transaction so the month applies all-or-nothing; one AuditLog per day
  // (identical shape to the single-cell PATCH) so the audit trail is uniform.
  await prisma.$transaction(async (tx) => {
    for (const v of validated) {
      const existing = await tx.attendanceLog.findFirst({
        where: { employeeId, date: { gte: v.date, lte: endOfDay(v.date) } },
        select: { id: true, status: true, workType: true, hoursWorked: true, notes: true },
      })
      const oldValue = existing
        ? { status: existing.status, workType: existing.workType, hoursWorked: existing.hoursWorked, notes: existing.notes }
        : null

      const saved = existing
        ? await tx.attendanceLog.update({
            where: { id: existing.id },
            data: {
              status: v.cell.status,
              workType: v.cell.workType,
              hoursWorked: v.cell.hoursWorked,
              notes: existing.notes,
            },
          })
        : await tx.attendanceLog.create({
            data: {
              employeeId,
              date: v.date,
              status: v.cell.status,
              workType: v.cell.workType,
              hoursWorked: v.cell.hoursWorked,
              notes: null,
            },
          })

      await tx.auditLog.create({
        data: {
          userId: user.id,
          employeeId,
          action: 'UPDATE',
          entity: 'AttendanceLog',
          entityId: saved.id,
          oldValue: oldValue ? JSON.stringify(oldValue) : null,
          newValue: JSON.stringify({
            status: saved.status,
            workType: saved.workType,
            hoursWorked: saved.hoursWorked,
            notes: saved.notes,
            date: v.iso,
            note,
          }),
        },
      })

      cells.push({ day: v.day, iso: v.iso, status: saved.status, workType: saved.workType })
    }
  })

  return NextResponse.json({ ok: true, count: cells.length, cells })
}
