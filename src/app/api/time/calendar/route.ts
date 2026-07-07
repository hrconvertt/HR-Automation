/**
 * GET /api/time/calendar?month=YYYY-MM
 *
 * Unified per-employee per-day status for a month, overlaying:
 *   - Attendance punches    â†’ PRESENT / WORKING / ABSENT
 *   - Approved leave        â†’ LEAVE (with type)
 *   - Public holidays       â†’ HOLIDAY (with name)
 *   - Weekends              â†’ WEEKEND
 *   - Future dates          â†’ FUTURE
 *
 * Role scoping:
 *   - EMPLOYEE   â†’ self only
 *   - MANAGER    â†’ self + direct reports
 *   - HR_ADMIN   â†’ everyone
 *   - EXECUTIVE  â†’ everyone (read-only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { dayKey, isSameDay } from '@/lib/date-utils'

type DayStatus =
  | { kind: 'PRESENT'; hours: number; workType: 'ONSITE' | 'WFH' }
  | { kind: 'ABSENT' }
  | { kind: 'LEAVE'; leaveType: string; halfDay: boolean }
  | { kind: 'HOLIDAY'; name: string }
  | { kind: 'WEEKEND' }
  | { kind: 'FUTURE' }
  | { kind: 'EMPTY' }

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  // Parse month query
  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month') // YYYY-MM
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() + 1
  if (monthParam) {
    const [y, m] = monthParam.split('-').map((s) => parseInt(s, 10))
    if (!isNaN(y) && !isNaN(m)) { year = y; month = m }
  }
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  // Resolve employee scope. Company-wide visibility is an explicit allowlist
  // (HR / EXECUTIVE only) — any other role defaults to a narrow scope, never
  // "everyone". This mirrors /api/attendance so LEAD / FINANCE (and any future
  // role) can't accidentally pull the whole company's calendar.
  let employeeFilter: Record<string, unknown>
  if (effectiveRole === 'HR_ADMIN' || effectiveRole === 'EXECUTIVE') {
    employeeFilter = {} // company-wide
  } else if ((effectiveRole === 'MANAGER' || effectiveRole === 'LEAD') && myEmpId) {
    employeeFilter = { OR: [{ id: myEmpId }, { reportingManagerId: myEmpId }] }
  } else if (myEmpId) {
    employeeFilter = { id: myEmpId } // EMPLOYEE / FINANCE / fallback — self only
  } else {
    employeeFilter = { id: '__none__' }
  }

  const [employees, logs, leaves, holidays] = await Promise.all([
    prisma.employee.findMany({
      where: { status: 'ACTIVE', ...employeeFilter },
      select: {
        id: true, fullName: true, employeeCode: true,
        department: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    }),
    prisma.attendanceLog.findMany({
      where: {
        date: { gte: monthStart, lte: monthEnd },
        employee: employeeFilter,
      },
      select: { employeeId: true, date: true, hoursWorked: true, workType: true, status: true, clockIn: true, clockOut: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        fromDate: { lte: monthEnd },
        toDate: { gte: monthStart },
        employee: employeeFilter,
      },
      select: { employeeId: true, fromDate: true, toDate: true, leaveType: true, firstDayHalf: true, lastDayHalf: true },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: monthStart, lte: monthEnd }, type: 'PUBLIC' },
      select: { date: true, name: true },
    }),
  ])

  // Index for fast lookup â€” key by full YYYY-MM-DD so logs from adjacent months
  // (TZ-shifted) can't collide.
  const logsByEmpDay = new Map<string, typeof logs[number]>()
  for (const l of logs) logsByEmpDay.set(`${l.employeeId}:${dayKey(l.date)}`, l)

  const holidaysByDay = new Map<string, string>()
  for (const h of holidays) holidaysByDay.set(dayKey(h.date), h.name)

  // Build employee â†’ day â†’ status grid
  const grid = employees.map((emp) => {
    const days: Record<number, DayStatus> = {}
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d)
      date.setHours(0, 0, 0, 0)
      const dayOfWeek = date.getDay()

      // Priority: HOLIDAY â†’ LEAVE â†’ WEEKEND â†’ FUTURE â†’ attendance
      // Holidays beat FUTURE so upcoming public holidays still show on the grid.

      const todayKey = dayKey(date)
      if (holidaysByDay.has(todayKey)) {
        days[d] = { kind: 'HOLIDAY', name: holidaysByDay.get(todayKey)! }
        continue
      }

      // Leave: any APPROVED leave covering this date for this employee
      // (covers both past and future approved leave). Compare day keys so
      // TZ-shifted from/to dates still match this calendar cell.
      const onLeave = leaves.find((lv) => {
        if (lv.employeeId !== emp.id) return false
        const fromK = dayKey(lv.fromDate)
        const toK = dayKey(lv.toDate)
        return fromK <= todayKey && todayKey <= toK
      })
      if (onLeave) {
        const isFirst = isSameDay(onLeave.fromDate, date)
        const isLast = isSameDay(onLeave.toDate, date)
        const halfDay = (isFirst && onLeave.firstDayHalf) || (isLast && onLeave.lastDayHalf)
        days[d] = { kind: 'LEAVE', leaveType: onLeave.leaveType, halfDay }
        continue
      }

      // Weekend
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        days[d] = { kind: 'WEEKEND' }
        continue
      }

      // Future (any plain working day in the future)
      if (date > today) {
        days[d] = { kind: 'FUTURE' }
        continue
      }

      // Attendance log â€” anyone who clocked in (in-progress or done) is PRESENT.
      // The "live working now" state lives on the Today tab; calendar is a
      // month view where the distinction doesn't add information.
      const log = logsByEmpDay.get(`${emp.id}:${todayKey}`)
      if (log?.clockIn) {
        days[d] = {
          kind: 'PRESENT',
          hours: log.hoursWorked ?? 0,
          workType: (log.workType === 'WFH' ? 'WFH' : 'ONSITE'),
        }
        continue
      }
      if (log?.status === 'ABSENT') {
        days[d] = { kind: 'ABSENT' }
        continue
      }
      // No record â€” for today that means NOT_IN (treated like empty); for past dates â†’ ABSENT
      if (date < today) {
        days[d] = { kind: 'ABSENT' }
      } else {
        days[d] = { kind: 'EMPTY' }
      }
    }
    return {
      employeeId: emp.id,
      fullName: emp.fullName,
      employeeCode: emp.employeeCode,
      department: emp.department?.name ?? 'â€”',
      days,
    }
  })

  return NextResponse.json({
    month, year, daysInMonth,
    employees: grid,
    holidays: holidays.map((h) => ({ day: h.date.getDate(), name: h.name })),
  })
}
