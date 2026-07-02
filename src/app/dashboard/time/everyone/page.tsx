/**
 * /dashboard/time/everyone — company-wide (or team-scoped) time grid.
 *
 * Gated to HR_ADMIN / MANAGER / LEAD / EXECUTIVE. Employees redirected to
 * their personal view.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminTimeView from '@/app/dashboard/attendance/_views/admin-time-view'
import TeamTimeView from '@/app/dashboard/attendance/_views/team-time-view'
import ExecutiveTimeView from '@/app/dashboard/attendance/_views/executive-time-view'

export default async function EveryoneTimePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  const allowed =
    effectiveRole === 'HR_ADMIN' ||
    effectiveRole === 'MANAGER' ||
    effectiveRole === 'LEAD' ||
    effectiveRole === 'EXECUTIVE'

  if (!allowed) {
    redirect('/dashboard/time/me')
  }

  if (effectiveRole === 'HR_ADMIN') return <AdminTimeView />
  if (effectiveRole === 'EXECUTIVE') return <ExecutiveTimeView />

  // MANAGER / LEAD — need an employee record to scope the team
  if (!user.employee) {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Profile setup needed</h2>
        <p className="text-sm text-slate-900 mt-2">
          Your account isn&apos;t linked to an employee record. Contact HR.
        </p>
      </div>
    )
  }

  return (
    <TeamTimeView
      managerEmployeeId={user.employee.id}
      managerName={user.employee.fullName ?? ''}
    />
  )
}
