/**
 * Leave of Absence — extended leave management (medical, maternity,
 * sabbatical…). Server gate: HR_ADMIN only (effective role — HR previewing
 * as another role is redirected, matching the API gate).
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { LoaClient } from './_components/loa-client'

export default async function LoaPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  if (effectiveRole !== 'HR_ADMIN') redirect('/dashboard')

  const isPreviewMode =
    payload.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN'

  return <LoaClient isPreviewMode={isPreviewMode} />
}
