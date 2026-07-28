/**
 * Job Changes — promotions, transfers, manager changes, designation changes.
 *
 * Server gate: HR_ADMIN + MANAGER (effective role — honours HR preview
 * cookie). Employees/Executives are redirected; the API additionally scopes
 * Managers to their direct reports.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { JobChangesClient } from './_components/job-changes-client'

export default async function JobChangesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'MANAGER') {
    redirect('/dashboard')
  }
  const isPreviewMode =
    payload.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN'

  return (
    <JobChangesClient
      viewerRole={effectiveRole}
      viewerUserId={payload.userId}
      isPreviewMode={isPreviewMode}
    />
  )
}
