import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPayrollRun, getPayrollAnomalies } from '@/lib/queries/payroll'
import { HRPayrollView } from './_views/hr-payroll-view'
import { ManagerPayrollView } from './_views/manager-payroll-view'
import { EmployeePayrollView } from './_views/employee-payroll-view'
import { ExecutivePayrollView } from './_views/executive-payroll-view'

export default async function PayrollPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      employee: { select: { id: true, fullName: true } },
      userRoles: { select: { role: true } },
    },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  if (effectiveRole === 'HR_ADMIN') {
    // Server-render the current month's run + anomalies so the page paints
    // with data immediately. Same query + role scoping as the API routes;
    // the client view keeps its refetch logic for month changes/actions.
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    const run = await getPayrollRun({
      effectiveRole: 'HR_ADMIN',
      employeeId: user.employee?.id ?? null,
      month,
      year,
    })
    const anomalies = run ? await getPayrollAnomalies(run.id) : null
    const roles = user.userRoles.length > 0
      ? user.userRoles.map((r) => r.role)
      : [user.role]
    return (
      <HRPayrollView
        initialData={{
          month,
          year,
          // Serialize Dates → ISO strings to match the client's fetch shape.
          run: run ? JSON.parse(JSON.stringify(run)) : null,
          anomalies: anomalies ? JSON.parse(JSON.stringify(anomalies)) : null,
          me: { userId: user.id, roles, primaryRole: user.role },
        }}
      />
    )
  }
  if (effectiveRole === 'EXECUTIVE') {
    return <ExecutivePayrollView />
  }
  if (effectiveRole === 'MANAGER') {
    if (user.employee) {
      return <ManagerPayrollView managerEmployeeId={user.employee.id} />
    }
  }
  if (effectiveRole === 'EMPLOYEE') {
    if (user.employee) {
      return <EmployeePayrollView employeeId={user.employee.id} />
    }
  }

  return (
    <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl">
      <h2 className="text-lg font-semibold text-slate-900">Profile setup needed</h2>
      <p className="text-sm text-slate-900 mt-2">
        Your user account isn&apos;t linked to an employee record yet. Please contact HR.
      </p>
    </div>
  )
}
