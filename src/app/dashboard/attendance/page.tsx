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
import { AttendanceGridShell } from './_components/grid-shell'

export default async function AttendanceGridPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
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

  return (
    <AttendanceGridShell
      role={effectiveRole}
      departments={departments.map((d) => d.name)}
    />
  )
}
