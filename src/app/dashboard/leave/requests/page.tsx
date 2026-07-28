/**
 * /dashboard/leave/requests — pending approval queue.
 * Server-side: HR/Executive sees all; Manager/Lead see direct reports + self;
 * Employees redirected away (their own leave lives at /me).
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { LeaveList } from '../_components/leave-list'

export default async function LeaveRequestsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole = payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? payload.role

  if (role === 'EMPLOYEE') {
    redirect('/dashboard/leave/me')
  }

  return (
    <LeaveList
      title="Leave Requests"
      subtitle="Pending approvals — manager stage and HR stage combined"
      statuses={['PENDING', 'PENDING_HR']}
    />
  )
}
