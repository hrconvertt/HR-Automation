/**
 * Policies â€” clean library model (Option A).
 *
 *   HR_ADMIN          â†’ HRPoliciesView (CRUD + publish/archive)
 *   Everyone else     â†’ EmployeePoliciesView (read-only library â€” same content for
 *                       Employee, Manager, Executive). Searchable, category filter,
 *                       click into a policy to read.
 *
 * Acknowledgement / signing infrastructure is intact in the schema and API for
 * future use, but is not surfaced anywhere in the UI.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import HRPoliciesView from './_views/hr-policies-view'
import EmployeePoliciesView from './_views/employee-policies-view'

export default async function PoliciesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  if (effectiveRole === 'HR_ADMIN') return <HRPoliciesView />
  return <EmployeePoliciesView />
}
