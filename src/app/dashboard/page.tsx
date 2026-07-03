import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { HRDashboard } from '@/components/dashboards/hr-dashboard'
import { ManagerDashboard } from '@/components/dashboards/manager-dashboard'
import { EmployeeDashboard } from '@/components/dashboards/employee-dashboard'
import { ExecutiveDashboard } from '@/components/dashboards/executive-dashboard'

export default async function DashboardPage() {
  // verifyToken() checks Clerk's session first, then the hr_token emergency
  // JWT cookie. Do NOT gate on the hr_token cookie existing — Clerk-only
  // sessions have no hr_token, and redirecting them to /login caused a
  // /login ⇄ /dashboard redirect loop (Clerk's <SignIn/> immediately bounced
  // the active session back here).
  const payload = await verifyToken()
  if (!payload) redirect('/login')

  const cookieStore = await cookies()

  let user
  try {
    user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { employee: { select: { id: true, fullName: true } } },
    })
  } catch (err) {
    console.error('[dashboard] failed to load user for dashboard body', err)
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl">
        <h2 className="text-lg font-semibold text-slate-900">
          Couldn&apos;t load your dashboard
        </h2>
        <p className="text-sm text-slate-700 mt-2">
          Something went wrong while fetching your data. This is usually temporary.
        </p>
        <a
          href="/dashboard"
          className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Retry
        </a>
      </div>
    )
  }
  if (!user) redirect('/login')

  const userName = user.employee?.fullName ?? user.email
  const isHR = user.role === 'HR_ADMIN'

  // HR_ADMIN can preview other dashboards via the hr_preview_role cookie set by <RoleSwitcher>
  const previewRole = isHR ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  let dashboard: React.ReactNode = null

  if (effectiveRole === 'EXECUTIVE') {
    dashboard = <ExecutiveDashboard />
  } else if (effectiveRole === 'MANAGER') {
    if (user.employee) {
      dashboard = <ManagerDashboard managerEmployeeId={user.employee.id} userName={userName} />
    }
  } else if (effectiveRole === 'EMPLOYEE') {
    if (user.employee) {
      dashboard = <EmployeeDashboard employeeId={user.employee.id} userName={userName} viewerRole={user.role} />
    }
  } else if (effectiveRole === 'HR_ADMIN') {
    dashboard = <HRDashboard userName={userName} />
  }

  if (!dashboard) {
    dashboard = (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl">
        <h2 className="text-lg font-semibold text-slate-900">Profile setup needed</h2>
        <p className="text-sm text-slate-900 mt-2">
          Your user account isn&apos;t linked to an employee record yet. Please contact HR.
        </p>
      </div>
    )
  }

  return dashboard
}
