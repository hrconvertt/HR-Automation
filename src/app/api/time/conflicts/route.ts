/**
 * GET /api/time/conflicts?month=YYYY-MM
 *
 * HR-only reconciliation surface: days where time-tracking and leave /
 * attendance tell different stories. Read-only — fixing a cell happens in
 * the Attendance module.
 *
 * Conflict types:
 *   CLOCKED_IN_ON_LEAVE   — the day is marked LEAVE but the employee has
 *                           clock-in punches (worked while "on leave").
 *   LEAVE_NOT_WRITTEN     — an APPROVED leave covers this working day but
 *                           the attendance grid has no L/HD cell (writeback
 *                           missing or overwritten by a later punch).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { dayKey } from '@/lib/date-utils'
import { buildLeaveDayMarks } from '@/lib/leave-days'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month') // YYYY-MM
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() // 0-based
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    year = parseInt(monthParam.slice(0, 4))
    month = parseInt(monthParam.slice(5, 7)) - 1
  }
  const rangeStart = new Date(year, month, 1)
  const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)
  // Never report "conflicts" for days that haven't happened yet
  const effectiveEnd = rangeEnd < now ? rangeEnd : now

  const [logs, punches, approvedLeaves, holidays] = await Promise.all([
    prisma.attendanceLog.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      select: {
        employeeId: true, date: true, status: true, clockIn: true, hoursWorked: true,
        employee: { select: { fullName: true, employeeCode: true } },
      },
    }),
    prisma.attendancePunch.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd }, type: 'IN' },
      select: { employeeId: true, date: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        fromDate: { lte: rangeEnd },
        toDate: { gte: rangeStart },
      },
      select: {
        id: true, employeeId: true, fromDate: true, toDate: true, leaveType: true,
        firstDayHalf: true, lastDayHalf: true,
        employee: { select: { fullName: true, employeeCode: true } },
      },
    }),
    prisma.holiday.findMany({
      where: { type: 'PUBLIC', date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true },
    }),
  ])

  const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)))
  const logByEmpDay = new Map(logs.map((l) => [`${l.employeeId}::${dayKey(l.date)}`, l]))
  const firstInByEmpDay = new Map<string, Date>()
  for (const p of punches) {
    const k = `${p.employeeId}::${dayKey(p.date)}`
    if (!firstInByEmpDay.has(k)) firstInByEmpDay.set(k, p.timestamp)
  }

  type Conflict = {
    type: 'CLOCKED_IN_ON_LEAVE' | 'LEAVE_NOT_WRITTEN'
    employeeId: string
    fullName: string
    employeeCode: string
    date: string
    detail: string
  }
  const conflicts: Conflict[] = []

  // ── 1. Marked LEAVE but has clock-in evidence ─────────────────────────
  for (const l of logs) {
    if (l.status !== 'LEAVE') continue
    const k = `${l.employeeId}::${dayKey(l.date)}`
    const firstIn = firstInByEmpDay.get(k) ?? l.clockIn
    if (firstIn) {
      conflicts.push({
        type: 'CLOCKED_IN_ON_LEAVE',
        employeeId: l.employeeId,
        fullName: l.employee.fullName,
        employeeCode: l.employee.employeeCode,
        date: dayKey(l.date),
        detail: `Day is marked Leave but the employee clocked in at ${new Date(firstIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${l.hoursWorked ? ` (${l.hoursWorked.toFixed(1)}h worked)` : ''}.`,
      })
    }
  }

  // ── 2. Approved leave day with no matching L/HD cell ──────────────────
  for (const lr of approvedLeaves) {
    const marks = buildLeaveDayMarks(lr.fromDate, lr.toDate, {
      firstDayHalf: lr.firstDayHalf,
      lastDayHalf: lr.lastDayHalf,
      holidayDates: holidayKeys,
    })
    for (const m of marks) {
      if (m.mark !== 'L' && m.mark !== 'HD') continue
      const d = new Date(m.date + 'T00:00:00')
      if (d < rangeStart || d > effectiveEnd) continue
      const log = logByEmpDay.get(`${lr.employeeId}::${m.date}`)
      const expected = m.mark === 'HD' ? 'HALF_DAY' : 'LEAVE'
      if (!log) {
        conflicts.push({
          type: 'LEAVE_NOT_WRITTEN',
          employeeId: lr.employeeId,
          fullName: lr.employee.fullName,
          employeeCode: lr.employee.employeeCode,
          date: m.date,
          detail: `Approved ${lr.leaveType} leave covers this day but the attendance grid has no ${m.mark} cell.`,
        })
      } else if (log.status !== expected && !(expected === 'LEAVE' && log.status === 'HALF_DAY')) {
        conflicts.push({
          type: log.status === 'PRESENT' ? 'CLOCKED_IN_ON_LEAVE' : 'LEAVE_NOT_WRITTEN',
          employeeId: lr.employeeId,
          fullName: lr.employee.fullName,
          employeeCode: lr.employee.employeeCode,
          date: m.date,
          detail: `Approved ${lr.leaveType} leave expects ${m.mark} here, but the grid shows ${log.status}${log.clockIn ? ' with a clock-in' : ''}.`,
        })
      }
    }
  }

  // De-duplicate (an emp-day can trip both passes) and sort newest first
  const seen = new Set<string>()
  const unique = conflicts.filter((c) => {
    const k = `${c.employeeId}::${c.date}::${c.type}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).sort((a, b) => b.date.localeCompare(a.date) || a.fullName.localeCompare(b.fullName))

  return NextResponse.json({
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    count: unique.length,
    conflicts: unique,
  })
}
