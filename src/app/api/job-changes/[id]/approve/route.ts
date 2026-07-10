import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import {
  resolveJobChangeAccess,
  JOB_CHANGE_TYPE_LABEL,
  type JobChangeType,
} from '@/lib/job-changes'

interface RouteParams { params: Promise<{ id: string }> }

// POST /api/job-changes/[id]/approve — HR_ADMIN only. body: { decisionNote? }
export async function POST(request: NextRequest, { params }: RouteParams) {
  const access = await resolveJobChangeAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.actualRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can approve job changes' }, { status: 403 })
  }
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Switch back to HR view to approve job changes' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const decisionNote = (body.decisionNote ?? '').toString().trim() || null

  const jc = await prisma.jobChange.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, fullName: true, reportingManagerId: true } },
    },
  })
  if (!jc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (jc.status !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: `Cannot approve a ${jc.status} job change` }, { status: 400 })
  }

  const updated = await prisma.jobChange.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: access.userId, decisionNote },
  })

  const typeLabel = JOB_CHANGE_TYPE_LABEL[jc.changeType as JobChangeType] ?? jc.changeType

  // Notify the requester + the employee's current manager
  const requester = await prisma.user.findUnique({
    where: { id: jc.requestedById },
    select: { employee: { select: { id: true } } },
  })
  const targets = new Set<string>()
  if (requester?.employee?.id) targets.add(requester.employee.id)
  if (jc.employee.reportingManagerId) targets.add(jc.employee.reportingManagerId)
  for (const empId of targets) {
    await notify({
      employeeId: empId,
      type: 'GENERAL',
      title: `Job change approved: ${typeLabel}`,
      message: `${typeLabel} for ${jc.employee.fullName} was approved${jc.toDesignation ? ` (→ ${jc.toDesignation})` : ''}. It will be enacted on or after ${jc.effectiveDate.toLocaleDateString('en-GB', { dateStyle: 'long' })}.`,
      link: '/dashboard/lifecycle/job-changes',
    })
  }

  return NextResponse.json({ jobChange: updated })
}
