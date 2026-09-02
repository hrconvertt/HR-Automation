/**
 * One appraisal form, open for filling in.
 *
 * The paper form is four sections, a development table, an overall score, the
 * reviewing officer's goals, signatures and an HR box — in that order, because
 * that is the order it is worked through. The screen keeps the order and puts
 * one thing under the last, full width, rather than tiling panels.
 */
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppraisalFormEditor } from '../_components/appraisal-form-editor'
import type { Ratings, GoalRow, DevelopmentRow } from '@/lib/appraisal-form'
import { EMPTY_GOALS, EMPTY_DEVELOPMENT } from '@/lib/appraisal-form'
import { resolveTrack } from '@/lib/increment-schedule'

export default async function AppraisalFormPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE' && role !== 'MANAGER') {
    redirect('/dashboard/performance')
  }

  const form = await prisma.appraisalForm.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          joiningDate: true, dob: true, email: true,
          incrementTrack: true,
          department: { select: { name: true } },
          salary: {
            select: {
              basic: true, houseRent: true, utilities: true, food: true,
              fuel: true, medicalAllowance: true, otherAllowance: true,
            },
          },
        },
      },
      appraiser: { select: { id: true, fullName: true } },
      reviewer: { select: { id: true, fullName: true } },
    },
  })
  if (!form) notFound()

  // Anyone who could sign as appraiser or reviewer.
  const people = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, fullName: true, designation: true },
    orderBy: { fullName: 'asc' },
  })

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')

  // Pay as it stands today, unless the form already captured it — an
  // appraisal signed six months ago should still show the salary it argued
  // from, not whatever the person earns now.
  const sal = form.employee.salary
  const liveGross = sal
    ? sal.basic + sal.houseRent + sal.utilities + sal.food + sal.fuel
      + sal.medicalAllowance + sal.otherAllowance
    : 0
  const track = resolveTrack(form.incrementTrack ?? form.employee.incrementTrack)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Performance Appraisal Form</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {form.employee.fullName}
            {form.designationAtReview ? ` · ${form.designationAtReview}` : ''}
            {form.departmentAtReview ? ` · ${form.departmentAtReview}` : ''}
          </p>
        </div>
        <Link
          href="/dashboard/performance/appraisals"
          className="text-sm text-slate-500 hover:text-slate-900 hover:underline whitespace-nowrap mt-1"
        >
          ← All appraisals
        </Link>
      </div>

      <AppraisalFormEditor
        formId={form.id}
        canEdit={role === 'HR_ADMIN' || role === 'EXECUTIVE' || role === 'MANAGER'}
        isHr={role === 'HR_ADMIN' || role === 'EXECUTIVE'}
        people={people}
        employee={{
          fullName: form.employee.fullName,
          employeeCode: form.employee.employeeCode,
          joiningDate: iso(form.employee.joiningDate),
          dateOfBirth: iso(form.employee.dob),
        }}
        currentSalary={form.currentSalary ?? liveGross}
        track={track}
        initial={{
          periodFrom: iso(form.periodFrom),
          periodTo: iso(form.periodTo),
          qualification: form.qualification ?? '',
          experienceCompany: form.experienceCompany ?? '',
          experienceTotal: form.experienceTotal ?? '',
          periodInPresentPost: form.periodInPresentPost ?? '',
          designationAtReview: form.designationAtReview ?? '',
          departmentAtReview: form.departmentAtReview ?? '',
          appraiserId: form.appraiserId ?? '',
          reviewerId: form.reviewerId ?? '',
          isManagerial: form.isManagerial,
          ratings: (form.ratings as Ratings | null) ?? {},
          goals: (form.goals as GoalRow[] | null) ?? EMPTY_GOALS,
          development: (form.development as DevelopmentRow[] | null) ?? EMPTY_DEVELOPMENT,
          completedOn: iso(form.completedOn),
          incrementOf: form.incrementOf ?? '',
          incrementWef: iso(form.incrementWef),
          promotedTo: form.promotedTo ?? '',
          promotedWef: iso(form.promotedWef),
          transferredTo: form.transferredTo ?? '',
          transferredAs: form.transferredAs ?? '',
          transferredWef: iso(form.transferredWef),
          trainingNeeds: form.trainingNeeds ?? '',
          approvedPct: form.approvedPct,
          appraiserSigned: form.appraiserSignedAt != null,
          reviewerSigned: form.reviewerSignedAt != null,
          hrSigned: form.hrSignedAt != null,
          status: form.status,
        }}
      />
    </div>
  )
}
