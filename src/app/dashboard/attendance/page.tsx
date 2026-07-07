/**
 * Workday-style attendance & leave grid view.
 *
 * Mirrors the layout of the source "Attendance & Leave Tracking" xlsx:
 *   - Grid view   â€” wide table, employee rows Ã— day columns, P/L/WFH/HD/A badges
 *   - Summary view â€” compact month totals per employee with YTD
 *   - Detail view  â€” per-employee 8-month calendar (separate route)
 *
 * Role gating happens server-side in /api/attendance/grid; this page just
 * decides the default view per role and (for EMPLOYEE) auto-redirects to
 * their own detail.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAttendanceGrid, reportingMonths } from '@/lib/queries/attendance-grid'
import { AttendanceGridShell } from './_components/grid-shell'

/** Default month for the initial server render — mirrors the client's
 *  currentReportingMonth() so the SSR payload matches the first fetch. */
function defaultReportingMonth(): string {
  const months = reportingMonths()
  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const last = months[months.length - 1]
  return months.some((m) => `${m.year}-${String(m.month).padStart(2, '0')}` === key)
    ? key
    : `${last.year}-${String(last.month).padStart(2, '0')}`
}

export default async function AttendanceGridPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          departmentId: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  // Employees default straight to their own detail view â€” they only ever
  // have one row anyway, and the calendar is a friendlier landing UI.
  if (effectiveRole === 'EMPLOYEE' && user.employee?.id) {
    redirect(`/dashboard/attendance/${user.employee.id}`)
  }

  // Department filter scope:
  //   HR / Executive  â€” see all departments
  //   Manager / Lead  â€” see only their own department
  //   (Employee already redirected to detail view above)
  const seesAllDepts =
    effectiveRole === 'HR_ADMIN' || effectiveRole === 'EXECUTIVE'
  const departments = seesAllDepts
    ? await prisma.department.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      })
    : user.employee?.department
      ? [{ name: user.employee.department.name }]
      : []

  // Server-render the initial grid (current month, no filters) so the page
  // paints with data immediately. Same builder + role gates as the API route;
  // the client shell keeps its refetch logic for month/filter changes.
  const initialGrid = await buildAttendanceGrid({
    effectiveRole,
    myEmpId: user.employee?.id ?? null,
    month: defaultReportingMonth(),
  })

  return (
    <AttendanceGridShell
      role={effectiveRole}
      departments={departments.map((d) => d.name)}
      initialGrid={initialGrid.mode === 'grid' ? initialGrid : undefined}
    />
  )
}
