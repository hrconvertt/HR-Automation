/**
 * One Manpower Requisition Form, open for filling in.
 */
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ManpowerFormEditor } from './_components/manpower-form-editor'

export default async function ManpowerRequisitionPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') redirect('/dashboard/recruiting')

  const form = await prisma.manpowerRequisition.findUnique({
    where: { id },
    include: {
      requisition: {
        select: { id: true, title: true, departmentId: true, status: true },
      },
    },
  })
  if (!form) notFound()

  const dept = form.requisition.departmentId
    ? await prisma.department.findUnique({
      where: { id: form.requisition.departmentId }, select: { name: true },
    })
    : null

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')
  const str = (v: string | null) => v ?? ''
  const n = (v: number | null) => (v == null ? '' : String(v))

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manpower Requisition Form</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {form.requisition.title}
            {dept?.name ? ` · ${dept.name}` : ''}
          </p>
        </div>
        <Link
          href="/dashboard/recruiting?view=requisitions"
          className="text-sm text-slate-500 hover:text-slate-900 hover:underline whitespace-nowrap mt-1"
        >
          ← All requisitions
        </Link>
      </div>

      <ManpowerFormEditor
        formId={form.id}
        department={dept?.name ?? '—'}
        canEdit={role === 'HR_ADMIN' || role === 'EXECUTIVE'}
        initial={{
          jobCode: str(form.jobCode),
          costCenter: str(form.costCenter),
          designation: str(form.designation),
          noOfPositions: n(form.noOfPositions),
          appointmentType: str(form.appointmentType),
          sanctioned: form.sanctioned,
          jdAttached: form.jdAttached,
          contractDuration: str(form.contractDuration),
          workDescription: str(form.workDescription),
          currentPermanent: n(form.currentPermanent),
          currentTemporary: n(form.currentTemporary),
          currentConsultants: n(form.currentConsultants),
          grade: str(form.grade),
          departmentHead: str(form.departmentHead),
          reportingHead: str(form.reportingHead),
          requirementNature: str(form.requirementNature),
          replacingWhom: str(form.replacingWhom),
          qualificationMust: str(form.qualificationMust),
          qualificationAdditional: str(form.qualificationAdditional),
          desiredExperience: str(form.desiredExperience),
          skills: str(form.skills),
          placeOfWork: str(form.placeOfWork),
          fillBy: iso(form.fillBy),
          requestedBy: str(form.requestedBy),
          requisitionDate: iso(form.requisitionDate),
          divisionHead: str(form.divisionHead),
          divisionHeadDate: iso(form.divisionHeadDate),
          headHr: str(form.headHr),
          headHrDate: iso(form.headHrDate),
          director: str(form.director),
          directorDate: iso(form.directorDate),
          managingDirector: str(form.managingDirector),
          managingDirectorDate: iso(form.managingDirectorDate),
          status: form.status,
        }}
      />
    </div>
  )
}
