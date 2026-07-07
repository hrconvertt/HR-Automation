/**
 * Per-employee attendance detail view.
 *
 * Renders month-blocks (Nov 2025 → current month) as wall-calendar grids,
 * with per-month stat chips, YTD totals + leave balance + recent leave
 * requests side panel + Print button.
 *
 * All statuses/totals come from buildEmployeeMonths() — the SAME derivation
 * and counting the HR grid, summary view and CSV export use, so this page
 * can never drift from them.
 *
 * Access control:
 *   HR_ADMIN / EXECUTIVE — any employee
 *   MANAGER / LEAD       — self + direct reports only
 *   everyone else        — self only
 * Enforced via 404 (not 403) to avoid leaking existence of other records.
 */

import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dayKey } from '@/lib/date-utils'
import { buildEmployeeMonths } from '@/lib/queries/attendance-grid'
import { EmployeeDetailView } from './_view'

interface PageProps {
  params: Promise<{ employeeId: string }>
}

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
      joiningDate: true,
      timings: true,
      department: { select: { name: true } },
    },
  })
  if (!employee) notFound()

  // Role gate — explicit allowlist: HR/Exec any employee, Manager/Lead their
  // team, everyone else (Employee, Finance, unknown roles) self only.
  if (effectiveRole === 'MANAGER' || effectiveRole === 'LEAD') {
    if (employee.id !== myEmpId && employee.reportingManagerId !== myEmpId) notFound()
  } else if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'EXECUTIVE') {
    if (employee.id !== myEmpId) notFound()
  }

  const isSelf = employee.id === myEmpId

  const [{ months, ytd }, recentLeaves, leaveBalances, pendingCorrections] = await Promise.all([
    buildEmployeeMonths({
      id: employee.id,
      joiningDate: employee.joiningDate,
      timings: employee.timings,
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
    // Pending correction requests — used to dot the affected day cells.
    prisma.attendanceCorrection.findMany({
      where: { employeeId, status: 'PENDING' },
      select: { date: true },
    }),
  ])

  // Late counts are sensitive-ish operational data: show them to the employee
  // themselves and to HR, not to managers/executives browsing the detail page.
  const showLate = isSelf || effectiveRole === 'HR_ADMIN'

  return (
    <EmployeeDetailView
      employee={{
        id: employee.id,
        fullName: employee.fullName,
        designation: employee.designation,
        department: employee.department?.name ?? '—',
        photoUrl: employee.photoUrl,
      }}
      months={months.map((m) => ({
        key: m.key,
        label: m.label,
        firstDow: m.firstDow,
        cells: m.days.map((d) => ({
          day: d.day,
          iso: d.iso,
          status: d.status,
          isWeekend: d.isWeekend,
          isFuture: d.isFuture,
          preJoin: d.preJoin,
        })),
        totals: m.totals,
        late: showLate ? m.late : null,
      }))}
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
      pendingCorrectionDays={pendingCorrections.map((c) => dayKey(c.date))}
      showLate={showLate}
      role={effectiveRole}
      isSelf={isSelf}
    />
  )
}
