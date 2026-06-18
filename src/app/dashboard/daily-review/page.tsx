import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import DailyReviewClient from './daily-review-client'

export default async function DailyReviewPage() {
  const payload = await verifyToken()
  if (!payload) redirect('/login')
  const allowed = ['HR_ADMIN', 'MANAGER', 'LEAD', 'EXECUTIVE'].includes(payload.role)
  if (!allowed) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-700 mt-2">Lead, Manager, HR or Executive only.</p>
      </div>
    )
  }
  const readOnly = payload.role === 'EXECUTIVE'
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Daily Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review your team's tasks and KPI actuals. Click <strong>Ask Why</strong> on
          any row to open a quick inquiry.
        </p>
      </div>
      <DailyReviewClient readOnly={readOnly} />
    </div>
  )
}
