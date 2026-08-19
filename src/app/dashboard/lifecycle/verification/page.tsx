/**
 * Background Verification — one row per employee, opening onto their checks.
 *
 * Grouped by person rather than by check, because the question HR asks is
 * "where has this hire got to", not "what is the state of check 47".
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { VerificationList } from './_components/verification-list'

const EXCLUDED = ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF']

export default async function VerificationPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">
          Background verification is HR-only — it holds references and personal history.
        </p>
      </div>
    )
  }

  const [employees, verifications] = await Promise.all([
    prisma.employee.findMany({
      where: { status: { notIn: EXCLUDED } },
      orderBy: { joiningDate: 'desc' },
      select: {
        id: true, fullName: true, employeeCode: true, designation: true,
        joiningDate: true, employeeType: true,
        department: { select: { name: true } },
      },
    }),
    prisma.backgroundVerification.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: { select: { fullName: true } },
        _count: { select: { emails: true } },
      },
    }),
  ])

  return (
    <VerificationList
      employees={employees.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        employeeCode: e.employeeCode,
        designation: e.designation,
        department: e.department?.name ?? null,
        employeeType: e.employeeType,
        joiningDate: e.joiningDate?.toISOString() ?? null,
      }))}
      checks={verifications.map((v) => ({
        id: v.id,
        employeeId: v.employeeId,
        employerName: v.employerName,
        status: v.status,
        outcome: v.outcome,
        assignedTo: v.assignedTo?.fullName ?? null,
        emailCount: v._count.emails,
        consented: !!v.consentAt,
      }))}
    />
  )
}
