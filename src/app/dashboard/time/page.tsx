/**
 * /dashboard/time — role-based redirect.
 *
 * HR / Manager / Lead / Executive → /dashboard/time/everyone
 * Employee                        → /dashboard/time/me
 *
 * The actual views live at the sub-routes so the sidebar can offer
 * "My Time" and "Everyone" as first-class nested entries.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function TimePage() {
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

  if (
    effectiveRole === 'HR_ADMIN' ||
    effectiveRole === 'MANAGER' ||
    effectiveRole === 'LEAD' ||
    effectiveRole === 'EXECUTIVE'
  ) {
    redirect('/dashboard/time/everyone')
  }
  redirect('/dashboard/time/me')
}
