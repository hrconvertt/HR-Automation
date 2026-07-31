/**
 * Employee Lifecycle — overview landing page.
 *
 * Server gate: HR_ADMIN + EXECUTIVE only. Other roles never reach this page
 * (it's also hidden from their sidebars). Honours HR preview cookie.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { LifecycleOverviewClient } from './_components/lifecycle-overview-client'
import { ProbationBoard } from './_components/probation-board'

export default async function LifecyclePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const sp = (await searchParams) ?? {}
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'EXECUTIVE') {
    redirect('/dashboard')
  }

  // `/dashboard/probation` redirects here with ?tab=probation. The param used
  // to be ignored, so that link silently rendered the overview and looked like
  // a dead click.
  if (sp.tab === 'probation') return <ProbationBoard />

  return <LifecycleOverviewClient />
}
