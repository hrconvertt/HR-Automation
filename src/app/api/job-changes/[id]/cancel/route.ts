import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobChangeAccess } from '@/lib/job-changes'

interface RouteParams { params: Promise<{ id: string }> }

// POST /api/job-changes/[id]/cancel — the requester or HR, only while PENDING_APPROVAL.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const access = await resolveJobChangeAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Switch back to HR view to cancel job changes' }, { status: 403 })
  }

  const { id } = await params
  const jc = await prisma.jobChange.findUnique({ where: { id } })
  if (!jc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isHR = access.actualRole === 'HR_ADMIN'
  const isRequester = jc.requestedById === access.userId
  if (!isHR && !isRequester) {
    return NextResponse.json({ error: 'Only the requester or HR can cancel this job change' }, { status: 403 })
  }
  if (jc.status !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: `Only pending job changes can be cancelled (this one is ${jc.status})` }, { status: 400 })
  }

  const updated = await prisma.jobChange.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })

  return NextResponse.json({ jobChange: updated })
}
