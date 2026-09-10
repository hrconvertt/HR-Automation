/**
 * /dashboard/leave/half-day — every request that is half a day.
 *
 * A half day is a flag on a request rather than a leave type, so it could not
 * be found by filtering the type list, and a 0.5 sitting in the Days column of
 * the main list was the only sign one existed. Muhammad Irfan's Friday
 * afternoon was the first one ever recorded and there was nowhere to see it.
 *
 * All statuses, not only approved: a half day awaiting a decision is exactly
 * the one somebody needs to find.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { LeaveList } from '../_components/leave-list'

export default async function HalfDayLeavePage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? payload.role

  return (
    <LeaveList
      title="Half Days"
      subtitle="Requests for half a day — morning or afternoon off, scoped to your role"
      statuses={['PENDING', 'PENDING_HR', 'APPROVED', 'REJECTED']}
      halfDay
      canEdit={role === 'HR_ADMIN'}
    />
  )
}
