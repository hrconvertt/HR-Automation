import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notifyMany } from '@/lib/notifications'
import { resolveAudienceEmployeeIds } from '@/lib/policy-access'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  const { id } = await params
  const policy = await prisma.policyDocument.findUnique({ where: { id } })
  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Guard against re-publish spam: only flip to PUBLISHED + notify when the
  // current state isn't already PUBLISHED. Idempotent — clicking Publish on
  // an already-published policy returns success without re-notifying.
  if (policy.status === 'PUBLISHED') {
    return NextResponse.json({
      ok: true,
      alreadyPublished: true,
      message: 'Already published — no notifications sent.',
    })
  }

  // Mark published
  await prisma.policyDocument.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  })

  // HR_ONLY policies are reference docs — no ack rows or broadcast notification
  if (policy.audience === 'HR_ONLY' || !policy.requiresAck) {
    return NextResponse.json({ ok: true })
  }

  // Resolve audience via the shared helper (covers childless managers correctly)
  const audienceIds = await resolveAudienceEmployeeIds(prisma, policy.audience)
  const now = new Date()
  for (const eid of audienceIds) {
    await prisma.policyAcknowledgment.upsert({
      where: { policyId_employeeId: { policyId: id, employeeId: eid } },
      update: { notifiedAt: now },
      create: {
        policyId: id, employeeId: eid,
        status: 'PENDING', notifiedAt: now,
      },
    })
  }
  if (audienceIds.length > 0) {
    await notifyMany(audienceIds, {
      type: 'GENERAL',
      title: '📄 New policy to review',
      message: `Please read & acknowledge: "${policy.title}"`,
      link: `/dashboard/policies/${id}`,
    })
  }

  return NextResponse.json({ ok: true, enrolled: audienceIds.length })
}
