import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notifyMany } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * Reviewer approves or rejects a policy.
 * Body: { decision: 'APPROVE' | 'REJECT', comment?: string }
 * Rejection requires a comment.
 *
 * Side effects:
 *   - The caller's PolicyReview row is updated
 *   - If REJECT: policy -> DRAFT, notify HR (everyone who submitted it +
 *     all active HR_ADMINs as a safety net)
 *   - If APPROVE and all reviewers have approved: policy -> APPROVED,
 *     notify HR ("ready to activate")
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!me?.employee) return NextResponse.json({ error: 'Reviewer record not found' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const decision: 'APPROVE' | 'REJECT' = body.decision === 'REJECT' ? 'REJECT' : 'APPROVE'
  const comment: string = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (decision === 'REJECT' && !comment) {
    return NextResponse.json({ error: 'Rejection requires a reason' }, { status: 400 })
  }

  const policy = await prisma.policyDocument.findUnique({
    where: { id },
    include: { reviews: true },
  })
  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (policy.status !== 'IN_REVIEW') {
    return NextResponse.json({ error: 'Policy is not in review' }, { status: 400 })
  }

  // Caller must be one of the assigned reviewers (and have a PENDING row).
  const myReview = policy.reviews.find((r) => r.reviewerId === me.employee!.id)
  if (!myReview) return NextResponse.json({ error: 'You are not assigned as a reviewer for this policy' }, { status: 403 })
  if (myReview.status !== 'PENDING') {
    return NextResponse.json({ error: 'You have already reviewed this policy' }, { status: 400 })
  }

  const now = new Date()
  await prisma.policyReview.update({
    where: { id: myReview.id },
    data: {
      status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      comment: comment || null,
      reviewedAt: now,
    },
  })

  if (decision === 'REJECT') {
    // Bounce back to DRAFT — HR can edit + resubmit.
    await prisma.policyDocument.update({
      where: { id },
      data: {
        status: 'DRAFT',
        rejectedAt: now,
        rejectedById: payload.userId,
        rejectionReason: comment,
      },
    })
    // Notify the HR who submitted (if any) + all HR_ADMINs as a safety net.
    const hrEmployees = await prisma.user.findMany({
      where: { role: 'HR_ADMIN', isActive: true, employee: { isNot: null } },
      select: { employee: { select: { id: true } } },
    })
    const hrIds = new Set<string>()
    for (const u of hrEmployees) if (u.employee) hrIds.add(u.employee.id)
    if (policy.submittedForReviewById) {
      const sub = await prisma.user.findUnique({
        where: { id: policy.submittedForReviewById },
        select: { employee: { select: { id: true } } },
      })
      if (sub?.employee) hrIds.add(sub.employee.id)
    }
    await notifyMany(Array.from(hrIds), {
      type: 'GENERAL',
      title: '⚠️ Policy rejected — needs revision',
      message: `"${policy.title}" was rejected: ${comment}`,
      link: `/dashboard/policies/${id}`,
    })
    return NextResponse.json({ ok: true, status: 'DRAFT' })
  }

  // APPROVE — check if everyone has now approved.
  const allReviews = await prisma.policyReview.findMany({ where: { policyId: id } })
  const allApproved = allReviews.every((r) => r.status === 'APPROVED')
  if (allApproved) {
    await prisma.policyDocument.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        approvedById: payload.userId,
      },
    })
    const hrEmployees = await prisma.user.findMany({
      where: { role: 'HR_ADMIN', isActive: true, employee: { isNot: null } },
      select: { employee: { select: { id: true } } },
    })
    const hrIds = hrEmployees.map((u) => u.employee!.id).filter(Boolean)
    await notifyMany(hrIds, {
      type: 'GENERAL',
      title: '✅ Policy approved — ready to activate',
      message: `All reviewers approved "${policy.title}". Click to activate.`,
      link: `/dashboard/policies/${id}`,
    })
    return NextResponse.json({ ok: true, status: 'APPROVED' })
  }

  return NextResponse.json({ ok: true, status: 'IN_REVIEW' })
}
