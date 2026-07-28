/**
 * /dashboard/time/conflicts — HR-only reconciliation list.
 *
 * Read-only: shows employee-days where time tracking and leave/attendance
 * disagree, with a link into the attendance detail page where the cell can
 * actually be corrected (attendance module owns cell editing).
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ConflictsList } from '../_components/conflicts-list'

export default async function TimeConflictsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  if (effectiveRole !== 'HR_ADMIN') redirect('/dashboard/time/me')

  return <ConflictsList />
}
