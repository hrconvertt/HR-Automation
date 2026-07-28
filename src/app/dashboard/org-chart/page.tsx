import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import OrgTree from '@/components/org-chart/org-tree'

export default async function OrgChartPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  // Org chart is visible to ALL roles — it's the company directory hierarchy.
  // Only HR_ADMIN can edit (drag-reparent + manage departments).
  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  const canEdit = effectiveRole === 'HR_ADMIN'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Org Chart</h1>
        <p className="text-sm text-gray-500 mt-1">
          {canEdit
            ? 'Drag a card onto another to reparent. Changes are audited and notified.'
            : 'Read-only view of the company hierarchy.'}
        </p>
      </div>

      <OrgTree canEdit={canEdit} />
    </div>
  )
}
