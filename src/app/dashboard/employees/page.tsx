import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listEmployees, enrichWithInviteStatus } from '@/lib/queries/employees'
import { HRPeopleView } from './_views/hr-people-view'
import { ManagerTeamView } from './_views/manager-team-view'
import { EmployeeDirectoryView } from './_views/employee-directory-view'
import { ExecutiveWorkforceView } from './_views/executive-workforce-view'

export default async function EmployeesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  if (effectiveRole === 'HR_ADMIN') {
    // Server-render the initial (unfiltered) list so the page paints with
    // data immediately — the client view keeps its refetch logic for
    // filters/search/mutations. Same query + HR-only invite enrichment as
    // GET /api/employees; the select never includes salary/bank fields.
    const base = await listEmployees({
      effectiveRole: 'HR_ADMIN',
      meEmployeeId: user.employee?.id ?? null,
    })
    const enriched = await enrichWithInviteStatus(base)
    const initialEmployees = enriched.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      email: e.email,
      designation: e.designation,
      employeeType: e.employeeType,
      status: e.status,
      department: e.department,
      invite: {
        status: e.invite.status,
        invitedAt: e.invite.invitedAt?.toISOString(),
        sentTo: e.invite.sentTo ?? undefined,
      },
    }))
    return <HRPeopleView initialEmployees={initialEmployees} />
  }
  if (effectiveRole === 'EXECUTIVE') {
    return <ExecutiveWorkforceView />
  }
  if (effectiveRole === 'MANAGER') {
    if (user.employee) {
      return <ManagerTeamView managerEmployeeId={user.employee.id} />
    }
  }
  if (effectiveRole === 'EMPLOYEE') {
    if (user.employee) {
      return <EmployeeDirectoryView employeeId={user.employee.id} />
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
