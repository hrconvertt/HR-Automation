/**
 * /dashboard/time/approvals — overtime awaiting a decision.
 *
 * HR_ADMIN: company-wide pending overtime.
 * MANAGER:  their direct reports' overtime.
 * Everyone else → redirected to their personal time view.
 *
 * Leave lives in the Leave module — it used to appear here as well, which put
 * one request in two inboxes.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ApprovalsInbox } from '../_components/approvals-inbox'

export default async function TimeApprovalsPage() {
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

  if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'MANAGER') {
    redirect('/dashboard/time/me')
  }

  return <ApprovalsInbox role={effectiveRole} />
}
