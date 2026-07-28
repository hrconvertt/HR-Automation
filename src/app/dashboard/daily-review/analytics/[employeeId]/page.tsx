import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDailyLoggingConfig, canSeeAnalytics } from '@/lib/daily-logging-config'
import { getTeamEmployeeIds } from '@/lib/team-scope'
import AnalyticsClient from './analytics-client'

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ employeeId: string }>
}) {
  const payload = await verifyToken()
  if (!payload) redirect('/login')
  const { employeeId } = await params
  const cfg = await getDailyLoggingConfig()
  const isOwn = payload.employeeId === employeeId
  let allowed = canSeeAnalytics(cfg, payload.role, isOwn)
  if (allowed && !isOwn && (payload.role === 'MANAGER' || payload.role === 'LEAD')) {
    const team = payload.employeeId ? await getTeamEmployeeIds(payload.employeeId) : []
    if (!team.includes(employeeId)) allowed = false
  }
  if (!allowed) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-700 mt-2">You don't have permission to view this employee's analytics.</p>
      </div>
    )
  }
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, designation: true },
  })
  if (!employee) redirect('/dashboard/daily-review')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{employee.fullName}</h1>
        <p className="text-sm text-gray-500 mt-1">{employee.designation ?? 'Employee'} · daily logging analytics</p>
      </div>
      <AnalyticsClient employeeId={employee.id} />
    </div>
  )
}
