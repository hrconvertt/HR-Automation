/**
 * /dashboard/leave/me — current user's leave (any status).
 * Renders the existing MyLeaveView used inside the Time module.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import MyLeaveView from '../_views/my-leave-view'

export default async function MyLeavePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })

  if (!user?.employee) {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6 text-sm text-slate-700">
        Your account isn&apos;t linked to an employee record. Contact HR.
      </div>
    )
  }

  return (
    <MyLeaveView
      employeeId={user.employee.id}
      employeeName={user.employee.fullName ?? ''}
    />
  )
}
