import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import {
  resolveJobChangeAccess,
  JOB_CHANGE_TYPE_LABEL,
  type JobChangeType,
} from '@/lib/job-changes'

interface RouteParams { params: Promise<{ id: string }> }

// POST /api/job-changes/[id]/reject — HR_ADMIN only. body: { decisionNote } (required)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const access = await resolveJobChangeAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.actualRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can reject job changes' }, { status: 403 })
  }
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Switch back to HR view to reject job changes' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const decisionNote = (body.decisionNote ?? '').toString().trim()
  if (!decisionNote) {
    return NextResponse.json({ error: 'A decision note is required to reject' }, { status: 400 })
  }

  const jc = await prisma.jobChange.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true } } },
  })
  if (!jc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (jc.status !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: `Cannot reject a ${jc.status} job change` }, { status: 400 })
  }

  const updated = await prisma.jobChange.update({
    where: { id },
    data: { status: 'REJECTED', approvedById: access.userId, decisionNote },
  })

  const typeLabel = JOB_CHANGE_TYPE_LABEL[jc.changeType as JobChangeType] ?? jc.changeType
  const requester = await prisma.user.findUnique({
    where: { id: jc.requestedById },
    select: { employee: { select: { id: true } } },
  })
  if (requester?.employee?.id) {
    await notify({
      employeeId: requester.employee.id,
      type: 'GENERAL',
      title: `Job change rejected: ${typeLabel}`,
      message: `Your ${typeLabel.toLowerCase()} request for ${jc.employee.fullName} was rejected: ${decisionNote}`,
      link: '/dashboard/lifecycle/job-changes',
    })
  }

  return NextResponse.json({ jobChange: updated })
}
