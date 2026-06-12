import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import OrgTree from '@/components/org-chart/org-tree'

export default async function OrgChartPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl">
        <h2 className="text-lg font-semibold text-rose-900">Access denied</h2>
        <p className="text-sm text-rose-800 mt-2">
          The org chart is only available to HR and Executive roles.
        </p>
      </div>
    )
  }

  const canEdit = payload.role === 'HR_ADMIN'

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
