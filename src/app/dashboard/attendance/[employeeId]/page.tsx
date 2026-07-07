/**
 * Per-employee attendance detail view.
 *
 * Renders 8 month-blocks (Nov 2025 → Jun 2026) as wall-calendar grids,
 * with YTD totals + recent leave requests side panel + Print button.
 *
 * Access control:
 *   HR_ADMIN / EXECUTIVE — any employee
 *   MANAGER              — self + direct reports only
 *   EMPLOYEE             — self only
 * Enforced via 404 (not 403) to avoid leaking existence of other records.
 */

import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dayKey } from '@/lib/date-utils'
import { EmployeeDetailView } from './_view'

interface PageProps {
  params: Promise<{ employeeId: string }>
}

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

export default async function EmployeeAttendanceDetailPage({ params }: PageProps) {
  const { employeeId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      fullName: true,
      designation: true,
      photoUrl: true,
      reportingManagerId: true,
      department: { select: { name: true } },
    },
  })
  if (!employee) notFound()

  // Role gate
  if (effectiveRole === 'EMPLOYEE' && employee.id !== myEmpId) notFound()
  if (effectiveRole === 'MANAGER' && employee.id !== myEmpId && employee.reportingManagerId !== myEmpId) {
    notFound()
  }

  // Fetch logs + approved leaves across the full reporting window
  const rangeStart = new Date(REPORTING_MONTHS[0].year, REPORTING_MONTHS[0].month - 1, 1)
  const lastM = REPORTING_MONTHS[REPORTING_MONTHS.length - 1]
  const rangeEnd = new Date(lastM.year, lastM.month, 0, 23, 59, 59)

  const [logs, approvedLeaves, recentLeaves, leaveBalances] = await Promise.all([
    prisma.attendanceLog.findMany({
      where: { employeeId, date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true, status: true, workType: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: 'APPROVED',
        fromDate: { lte: rangeEnd },
        toDate: { gte: rangeStart },
      },
      select: { fromDate: true, toDate: true, firstDayHalf: true, lastDayHalf: true },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, leaveType: true, fromDate: true, toDate: true, days: true, status: true, reason: true },
    }),
    prisma.leaveBalance.findMany({
      where: { employeeId },
      select: { leaveType: true, allocated: true, used: true, remaining: true, year: true },
      orderBy: { year: 'desc' },
    }).catch(() => [] as { leaveType: string; allocated: number; used: number; remaining: number; year: number }[]),
  ])

  // Build day-keyed lookups
  const logMap = new Map<string, { status: string; workType: string }>()
  for (const l of logs) logMap.set(dayKey(l.date), { status: l.status, workType: l.workType })
  const leaveDayMap = new Map<string, boolean /* halfDay */>()
  for (const lv of approvedLeaves) {
    const cur = new Date(lv.fromDate); cur.setHours(0, 0, 0, 0)
    const end = new Date(lv.toDate); end.setHours(0, 0, 0, 0)
    while (cur <= end) {
      const isFirst = cur.getTime() === new Date(lv.fromDate).setHours(0, 0, 0, 0)
      const isLast = cur.getTime() === new Date(lv.toDate).setHours(0, 0, 0, 0)
      const half = (isFirst && lv.firstDayHalf) || (isLast && lv.lastDayHalf)
      leaveDayMap.set(dayKey(cur), half)
      cur.setDate(cur.getDate() + 1)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  type Cell = { day: number; iso: string; status: 'P' | 'WFH' | 'L' | 'H' | 'A' | 'WE'; isWeekend: boolean; isFuture: boolean }
  const months = REPORTING_MONTHS.map(({ year, month }) => {
    const mStart = new Date(year, month - 1, 1)
    const mEnd = new Date(year, month, 0)
    const daysInMonth = mEnd.getDate()
    const firstDow = mStart.getDay()
    const cells: Cell[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d)
      const dow = dt.getDay()
      const isWeekend = dow === 0 || dow === 6
      const iso = dayKey(dt)
      const isFuture = dt > today
      let status: Cell['status'] = 'A'
      if (isWeekend) status = 'WE'
      else if (isFuture) status = 'A'
      else {
        const log = logMap.get(iso)
        const onLeave = leaveDayMap.has(iso)
        const halfDay = leaveDayMap.get(iso) === true
        if (log) {
          if (log.status === 'LEAVE') status = halfDay ? 'H' : 'L'
          else if (log.status === 'HALF_DAY') status = 'H'
          else if (log.status === 'PRESENT' || log.status === 'LATE') status = log.workType === 'WFH' ? 'WFH' : 'P'
          else if (log.status === 'HOLIDAY' || log.status === 'WEEKEND') status = 'WE'
          else status = 'A'
        } else if (onLeave) {
          status = halfDay ? 'H' : 'L'
        } else {
          status = 'A'
        }
      }
      cells.push({ day: d, iso, status, isWeekend, isFuture })
    }
    return {
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      firstDow,
      cells,
    }
  })

  // YTD totals
  const ytd = { present: 0, leave: 0, wfh: 0, hd: 0, absent: 0 }
  for (const m of months) {
    for (const c of m.cells) {
      if (c.isWeekend || c.isFuture) continue
      if (c.status === 'P') ytd.present++
      else if (c.status === 'WFH') { ytd.present++; ytd.wfh++ }
      else if (c.status === 'L') ytd.leave++
      else if (c.status === 'H') { ytd.hd++; ytd.leave += 0.5 }
      else if (c.status === 'A') ytd.absent++
    }
  }

  return (
    <EmployeeDetailView
      employee={{
        id: employee.id,
        fullName: employee.fullName,
        designation: employee.designation,
        department: employee.department?.name ?? '—',
        photoUrl: employee.photoUrl,
      }}
      months={months}
      ytd={ytd}
      recentLeaves={recentLeaves.map((l) => ({
        id: l.id,
        leaveType: l.leaveType,
        fromDate: l.fromDate.toISOString(),
        toDate: l.toDate.toISOString(),
        days: l.days,
        status: l.status,
        reason: l.reason,
      }))}
      leaveBalances={leaveBalances.map((b) => ({ leaveType: b.leaveType, allocated: b.allocated, used: b.used, remaining: b.remaining, year: b.year }))}
      role={effectiveRole}
      isSelf={employee.id === myEmpId}
    />
  )
}
