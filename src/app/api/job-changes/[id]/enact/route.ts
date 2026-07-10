import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import {
  resolveJobChangeAccess,
  JOB_CHANGE_TYPE_LABEL,
  type JobChangeType,
} from '@/lib/job-changes'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/job-changes/[id]/enact — HR_ADMIN only.
 *
 * Applies an APPROVED job change to the Employee row once its effective date
 * has arrived. In one transaction:
 *   - Employee.designation / departmentId / reportingManagerId updated per type
 *   - ManagerHistory entry written (the unified role/manager history table —
 *     same shape the manual role-history API writes)
 *   - JobChange → ENACTED (+ enactedAt / enactedById)
 * Then notifies the employee.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const access = await resolveJobChangeAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.actualRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can enact job changes' }, { status: 403 })
  }
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Switch back to HR view to enact job changes' }, { status: 403 })
  }

  const { id } = await params
  const jc = await prisma.jobChange.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, designation: true,
          departmentId: true, reportingManagerId: true,
        },
      },
    },
  })
  if (!jc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (jc.status !== 'APPROVED') {
    return NextResponse.json({ error: `Cannot enact a ${jc.status} job change — approve it first` }, { status: 400 })
  }
  const now = new Date()
  if (jc.effectiveDate > now) {
    return NextResponse.json(
      { error: `Effective date is ${jc.effectiveDate.toLocaleDateString('en-GB', { dateStyle: 'long' })} — enact becomes available then.` },
      { status: 400 },
    )
  }

  const type = jc.changeType as JobChangeType
  const typeLabel = JOB_CHANGE_TYPE_LABEL[type] ?? jc.changeType

  // Build the employee update per change type. Only touch fields the change
  // actually targets — a pure designation change must not clear the manager.
  const empUpdate: Record<string, unknown> = {}
  if ((type === 'PROMOTION' || type === 'DESIGNATION_CHANGE') && jc.toDesignation) {
    empUpdate.designation = jc.toDesignation
  }
  if ((type === 'PROMOTION' || type === 'TRANSFER') && jc.toDepartmentId) {
    empUpdate.departmentId = jc.toDepartmentId
  }
  if ((type === 'PROMOTION' || type === 'TRANSFER' || type === 'MANAGER_CHANGE') && jc.toManagerId) {
    empUpdate.reportingManagerId = jc.toManagerId
  }
  if (Object.keys(empUpdate).length === 0) {
    return NextResponse.json({ error: 'This job change has no target values to apply.' }, { status: 400 })
  }

  const managerChanged =
    'reportingManagerId' in empUpdate &&
    empUpdate.reportingManagerId !== jc.employee.reportingManagerId

  const [, , updated] = await prisma.$transaction([
    prisma.employee.update({ where: { id: jc.employeeId }, data: empUpdate }),
    prisma.managerHistory.create({
      data: {
        employeeId: jc.employeeId,
        oldManagerId: jc.employee.reportingManagerId,
        newManagerId: managerChanged
          ? (empUpdate.reportingManagerId as string)
          : jc.employee.reportingManagerId,
        changedById: access.userId,
        reason: `${typeLabel} enacted (job change)`,
        title: (empUpdate.designation as string | undefined) ?? null,
        notes: jc.reason ?? null,
        effectiveDate: jc.effectiveDate,
        isManual: false,
      },
    }),
    prisma.jobChange.update({
      where: { id },
      data: { status: 'ENACTED', enactedAt: now, enactedById: access.userId },
    }),
  ])

  await notify({
    employeeId: jc.employeeId,
    type: 'GENERAL',
    title: `${typeLabel} effective`,
    message:
      type === 'PROMOTION' && jc.toDesignation
        ? `Congratulations — your promotion to ${jc.toDesignation} is now effective.`
        : `Your ${typeLabel.toLowerCase()} is now effective.`,
    link: `/dashboard/employees/${jc.employeeId}?tab=lifecycle`,
  })

  return NextResponse.json({ jobChange: updated })
}
