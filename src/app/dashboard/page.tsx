import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { HRDashboard } from '@/components/dashboards/hr-dashboard'
import { ManagerDashboard } from '@/components/dashboards/manager-dashboard'
import { EmployeeDashboard } from '@/components/dashboards/employee-dashboard'
import { ExecutiveDashboard } from '@/components/dashboards/executive-dashboard'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
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
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl">
        <h2 className="text-lg font-semibold text-amber-900">Profile setup needed</h2>
        <p className="text-sm text-amber-800 mt-2">
          Your user account isn&apos;t linked to an employee record yet. Please contact HR.
        </p>
      </div>
    )
  }

  return dashboard
}
