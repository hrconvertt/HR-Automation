/**
 * Leave module entry point — role-routed redirect.
 *   EMPLOYEE / LEAD       → /dashboard/leave/me
 *   MANAGER / HR / EXEC   → /dashboard/leave/requests
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'

export default async function LeaveIndexPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole = payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? payload.role

  if (role === 'MANAGER' || role === 'HR_ADMIN' || role === 'EXECUTIVE') {
    redirect('/dashboard/leave/requests')
  }
  redirect('/dashboard/leave/me')
}
