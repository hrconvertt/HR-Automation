/**
 * Employment Letter — the letterhead letter, editable.
 *
 * Pick an employee (or arrive from their probation page) and the letter is
 * written from their record: date, subject, every paragraph, the signatory.
 * Change any of it, watch the PDF preview follow, and download. Nothing is
 * saved and the record is not touched; the signed copy is filed with "Upload
 * signed" on the probation page.
 *
 * The longer pre-hire offer letter this page used to build is at
 * Letters → Offer Letter.
 *
 * HR only.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LetterEditor } from './letter-editor'

export default async function EmploymentLetterPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string }>
}) {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = (payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined) ?? payload.role
  if (role !== 'HR_ADMIN') {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">Employment letters are HR-only: they state somebody’s salary.</p>
      </div>
    )
  }

  const sp = await searchParams
  const staff = await prisma.employee.findMany({
    where: { deletedAt: null, status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } },
    select: { id: true, fullName: true, employeeCode: true, designation: true },
    orderBy: { fullName: 'asc' },
  })
  const initial = sp.employeeId && staff.some((s) => s.id === sp.employeeId) ? sp.employeeId : ''

  return <LetterEditor staff={staff} initialEmployeeId={initial} />
}
