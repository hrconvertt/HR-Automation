/**
 * The Employee Information intake — the new joiner fills it once, and it lands
 * straight on their record. No spreadsheet, no re-typing.
 *
 * Access: the employee whose record it is, or HR. This is the destination of
 * the link in the "Request onboarding documents" email.
 */
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { INTAKE_KEYS } from '@/lib/employee-intake'
import { IntakeForm } from './intake-form'

interface PageProps { params: Promise<{ employeeId: string }> }

export default async function IntakePage({ params }: PageProps) {
  const { employeeId } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  const role = cookieStore.get('hr_preview_role')?.value ?? me?.role
  const isHR = role === 'HR_ADMIN'
  const isSelf = me?.employee?.id === employeeId
  if (!isHR && !isSelf) {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">
          This form belongs to the employee it is about, and to HR.
        </p>
      </div>
    )
  }

  const e = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!e) notFound()

  const values: Record<string, string> = {}
  for (const k of INTAKE_KEYS) {
    const raw = (e as unknown as Record<string, unknown>)[k]
    values[k] = raw instanceof Date ? raw.toISOString().slice(0, 10) : raw == null ? '' : String(raw)
  }
  if (!values.cnicFullName) values.cnicFullName = e.fullName ?? ''

  return (
    <IntakeForm
      employeeId={employeeId}
      employeeName={e.fullName}
      initialValues={values}
      submittedAt={e.infoFormSubmittedAt?.toISOString() ?? null}
      isHR={isHR}
      isSelf={isSelf}
    />
  )
}
