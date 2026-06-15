import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notifyMany } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * HR submits a DRAFT policy for review.
 * Body: { reviewerIds: string[] } — Employee.id list (must be 1+ entries).
 *
 * Side effects:
 *   - policy.status -> IN_REVIEW + submittedForReview* timestamps
 *   - PolicyReview rows created (PENDING) for each reviewer
 *   - In-app notification to each reviewer
 */
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
  const body = await request.json().catch(() => ({}))
  const reviewerIds: string[] = Array.isArray(body.reviewerIds) ? body.reviewerIds.filter((x: unknown) => typeof x === 'string') : []
  if (reviewerIds.length === 0) {
    return NextResponse.json({ error: 'At least one reviewer is required' }, { status: 400 })
  }

  const policy = await prisma.policyDocument.findUnique({ where: { id } })
  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (policy.status !== 'DRAFT') {
    return NextResponse.json({ error: `Cannot submit ${policy.status} policy for review` }, { status: 400 })
  }

  // Verify all reviewers exist and are ACTIVE.
  const reviewers = await prisma.employee.findMany({
    where: { id: { in: reviewerIds }, status: 'ACTIVE' },
    select: { id: true, fullName: true },
  })
  if (reviewers.length !== reviewerIds.length) {
    return NextResponse.json({ error: 'One or more reviewers are not active employees' }, { status: 400 })
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.policyDocument.update({
      where: { id },
      data: {
        status: 'IN_REVIEW',
        reviewerIds: reviewers.map((r) => r.id),
        submittedForReviewAt: now,
        submittedForReviewById: payload.userId,
        // Clear any prior rejection state from a previous round
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
        approvedAt: null,
        approvedById: null,
      },
    }),
    // Drop any stale reviews from a prior round before re-creating
    prisma.policyReview.deleteMany({ where: { policyId: id } }),
    prisma.policyReview.createMany({
      data: reviewers.map((r) => ({ policyId: id, reviewerId: r.id, status: 'PENDING' })),
    }),
  ])

  await notifyMany(reviewers.map((r) => r.id), {
    type: 'GENERAL',
    title: '📋 Policy pending your review',
    message: `Please review and approve: "${policy.title}"`,
    link: `/dashboard/policies/${id}`,
  })

  return NextResponse.json({ ok: true, reviewerCount: reviewers.length })
}
