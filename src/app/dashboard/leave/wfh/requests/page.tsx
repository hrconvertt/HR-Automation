/**
 * /dashboard/leave/wfh/requests — work-from-home awaiting approval.
 *
 * Same two stages, same approvers and same attachment as leave: a WFH day is
 * requested and signed off exactly like time off, it simply spends no balance
 * and marks the day WFH rather than L.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { LeaveList } from '../../_components/leave-list'

export default async function WfhRequestsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? payload.role

  if (role === 'EMPLOYEE') redirect('/dashboard/leave/me')

  return (
    <LeaveList
      title="WFH Requests"
      subtitle="Work from home pending approval — lead stage and HR stage combined"
      statuses={['PENDING', 'PENDING_HR']}
      category="WFH"
      canEdit={role === 'HR_ADMIN'}
    />
  )
}
