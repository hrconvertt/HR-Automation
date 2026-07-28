/**
 * /dashboard/attendance/corrections — HR queue for employee attendance
 * correction requests (F1). HR_ADMIN only (effective role, so an HR admin
 * previewing as another role is bounced back to the attendance grid).
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dayKey } from '@/lib/date-utils'
import { CorrectionsQueue } from './_corrections-client'

export default async function AttendanceCorrectionsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  if (effectiveRole !== 'HR_ADMIN') redirect('/dashboard/attendance')

  const rows = await prisma.attendanceCorrection.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      employee: {
        select: { id: true, fullName: true, department: { select: { name: true } } },
      },
    },
  })

  return (
    <CorrectionsQueue
      initial={rows.map((c) => ({
        id: c.id,
        employeeId: c.employeeId,
        employeeName: c.employee.fullName,
        department: c.employee.department?.name ?? '—',
        date: dayKey(c.date),
        currentStatus: c.currentStatus,
        requestedStatus: c.requestedStatus,
        reason: c.reason,
        status: c.status,
        reviewComment: c.reviewComment,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  )
}
