/**
 * /dashboard/leave/approved — history of approved leave (role-scoped via API).
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { LeaveList } from '../_components/leave-list'

export default async function LeaveApprovedPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  return (
    <LeaveList
      title="Leave Approved"
      subtitle="History of approved leave — scoped to your role"
      statuses={['APPROVED']}
    />
  )
}
