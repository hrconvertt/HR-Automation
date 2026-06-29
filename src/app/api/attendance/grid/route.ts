/**
 * GET /api/attendance/grid?month=YYYY-MM&department=<dept>&search=<query>&summary=1
 *
 * Returns a Workday-style attendance grid mirroring the source xlsx:
 *   - One row per employee (filtered by role + dept + search)
 *   - One cell per day of the requested month
 *   - Status values: P / WFH / L / H / A / WE  (present / wfh / leave / half / absent / weekend)
 *
 * When summary=1, returns per-month totals across the Nov-2025 â†’ Jun-2026 range
 * (Convertt's reporting window) instead of a per-day grid â€” used by Summary View.
 *
 * Role gating (enforced server-side, NOT trusted from query):
 *   HR_ADMIN  â€” all employees
 *   EXECUTIVE â€” all employees, no export
 *   MANAGER   â€” self + direct reports
 *   EMPLOYEE  â€” self only
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { dayKey } from '@/lib/date-utils'

export type CellStatus = 'P' | 'WFH' | 'L' | 'H' | 'A' | 'WE'

const REPORTING_MONTHS: { month: number; year: number }[] = [
  { month: 11, year: 2025 },
  { month: 12, year: 2025 },
  { month: 1, year: 2026 },
  { month: 2, year: 2026 },
  { month: 3, year: 2026 },
  { month: 4, year: 2026 },
  { month: 5, year: 2026 },
  { month: 6, year: 2026 },
]

function parseMonth(monthStr: string | null): { year: number; month: number } {
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number)
    return { year: y, month: m }
  }
  const today = new Date()
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
}

function deriveStatus(log: { status: string; workType: string } | undefined, isWeekend: boolean, isLeaveDay: boolean, isHalfDay: boolean): CellStatus {
  // Check the actual logged status FIRST â€” if the employee was marked PRESENT
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
  // No explicit log for this day â€” fall back to weekend / leave / absent.
  if (isWeekend) return 'WE'
  if (isLeaveDay) return isHalfDay ? 'H' : 'L'
  return 'A'
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  const empFilter: Record<string, unknown> = (() => {
    if (effectiveRole === 'EMPLOYEE' && myEmpId) return { id: myEmpId }
    if (effectiveRole === 'MANAGER' && myEmpId) {
      return { OR: [{ id: myEmpId }, { reportingManagerId: myEmpId }] }
    }
    return {}
  })()

  const { searchParams } = new URL(request.url)
  const isSummary = searchParams.get('summary') === '1'
  const department = searchParams.get('department') ?? ''
  const search = (searchParams.get('search') ?? '').trim()

  // Department + search filters layered on top of role filter
  const filters: Record<string, unknown> = { status: 'ACTIVE', ...empFilter }
  if (department) filters.department = { name: department }
  if (search) filters.fullName = { contains: search, mode: 'insensitive' }

  const employees = await prisma.employee.findMany({
    where: filters,
    select: {
      id: true,
      fullName: true,
      designation: true,
      photoUrl: true,
      department: { select: { name: true } },
    },
    orderBy: { fullName: 'asc' },
  })

  // â”€â”€ SUMMARY MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isSummary) {
    const firstMonth = REPORTING_MONTHS[0]
    const lastMonth = REPORTING_MONTHS[REPORTING_MONTHS.length - 1]
    const rangeStart = new Date(firstMonth.year, firstMonth.month - 1, 1)
    const rangeEnd = new Date(lastMonth.year, lastMonth.month, 0, 23, 59, 59)

    const empIds = employees.map((e) => e.id)
    const [logs, leaves] = await Promise.all([
      prisma.attendanceLog.findMany({
        where: { employeeId: { in: empIds }, date: { gte: rangeStart, lte: rangeEnd } },
        select: { employeeId: true, date: true, status: true, workType: true },
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

    const rows = employees.map((emp) => {
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
        return { key: `${year}-${String(month).padStart(2, '0')}`, present, leave, wfh, hd, absent }
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
        department: emp.department?.name ?? 'â€”',
        photoUrl: emp.photoUrl,
        months,
        ytd,
      }
    })

    return NextResponse.json({
      mode: 'summary',
      months: REPORTING_MONTHS.map(({ year, month }) => ({
        key: `${year}-${String(month).padStart(2, '0')}`,
        label: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      })),
      employees: rows,
      role: effectiveRole,
    })
  }

  // â”€â”€ GRID MODE (per-day for one month) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { year, month } = parseMonth(searchParams.get('month'))
  const mStart = new Date(year, month - 1, 1)
  const mEnd = new Date(year, month, 0)
  const daysInMonth = mEnd.getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const empIds = employees.map((e) => e.id)
  const [logs, leaves] = await Promise.all([
    prisma.attendanceLog.findMany({
      where: { employeeId: { in: empIds }, date: { gte: mStart, lte: mEnd } },
      select: { employeeId: true, date: true, status: true, workType: true },
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

  const rows = employees.map((emp) => {
    let present = 0, leave = 0, wfh = 0, hd = 0, absent = 0
    const days: { day: number; status: CellStatus; isWeekend: boolean }[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d)
      const dow = dt.getDay()
      const isWeekend = dow === 0 || dow === 6
      const key = `${emp.id}|${dayKey(dt)}`
      const log = logBucket.get(key)
      const onLeave = leaveDayBucket.has(key)
      const halfDay = leaveDayBucket.get(key) === true
      let status: CellStatus = isWeekend
        ? 'WE'
        : dt > today
          ? 'A' // future days â€” render as blank; client maps 'A' for future to dash
          : deriveStatus(log, false, onLeave, halfDay)
      // Future days: keep as 'A' but flag with isWeekend=false; UI shows 'â€”' for dt > today
      // (we don't have a separate "future" status â€” UI handles via date check)
      if (dt > today && !isWeekend) {
        // Sentinel: use absent for now, the UI will treat future days via the day index check
      }
      if (!isWeekend && dt <= today) {
        if (status === 'P') present++
        else if (status === 'WFH') { present++; wfh++ }
        else if (status === 'L') leave++
        else if (status === 'H') { hd++; leave += 0.5 }
        else if (status === 'A') absent++
      }
      days.push({ day: d, status, isWeekend })
    }
    return {
      id: emp.id,
      fullName: emp.fullName,
      designation: emp.designation,
      department: emp.department?.name ?? 'â€”',
      photoUrl: emp.photoUrl,
      days,
      totals: { present, leave, wfh, hd, absent },
    }
  })

  return NextResponse.json({
    mode: 'grid',
    month: `${year}-${String(month).padStart(2, '0')}`,
    monthLabel: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    daysInMonth,
    today: dayKey(today),
    employees: rows,
    role: effectiveRole,
    canExport: effectiveRole === 'HR_ADMIN',
  })
}
