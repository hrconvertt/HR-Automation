/**
 * /dashboard/leave/rejected — leave that was turned down.
 *
 * Rejections were invisible: once a request left the pending queue it only
 * showed up if it had been approved, so a turned-down request and one that was
 * never actioned looked identical from the outside. The list carries the
 * rejection reason and who gave it, because that is the whole point of keeping
 * the record.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { LeaveList } from '../_components/leave-list'

export default async function LeaveRejectedPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? payload.role

  return (
    <LeaveList
      title="Leave Rejected"
      subtitle="Requests that were turned down — with the reason given"
      statuses={['REJECTED', 'CANCELLED']}
      canEdit={role === 'HR_ADMIN'}
    />
  )
}
