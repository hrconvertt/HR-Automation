import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import DailyLogClient from './daily-log-client'

export default async function DailyLogPage() {
  const payload = await verifyToken()
  if (!payload) redirect('/login')
  if (!payload.employeeId) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl">
        <h2 className="text-lg font-semibold text-slate-900">No employee profile</h2>
        <p className="text-sm text-slate-700 mt-2">Daily logging requires an employee record. Contact HR.</p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Daily Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Log today's tasks and KPI actuals. Re-submitting before midnight
          overwrites the current entry; past days are read-only.
        </p>
      </div>
      <DailyLogClient />
    </div>
  )
}
