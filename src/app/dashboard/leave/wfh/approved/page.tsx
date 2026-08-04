/**
 * /dashboard/leave/wfh/approved — the work-from-home record.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { LeaveList } from '../../_components/leave-list'

export default async function WfhApprovedPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? payload.role

  return (
    <LeaveList
      title="WFH Approved"
      subtitle="Approved work-from-home days — scoped to your role"
      statuses={['APPROVED']}
      category="WFH"
      canEdit={role === 'HR_ADMIN'}
    />
  )
}
