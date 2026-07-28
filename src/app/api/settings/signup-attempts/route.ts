/**
 * List sign-up attempts. HR_ADMIN only.
 *
 * Query string: ?status=PENDING|APPROVED|DISMISSED|ALL (default PENDING)
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const status = req.nextUrl.searchParams.get('status') ?? 'PENDING'
  const where = status === 'ALL' ? {} : { status }

  const rows = await prisma.signupAttempt.findMany({
    where,
    orderBy: { attemptedAt: 'desc' },
  })

  // Hydrate reviewer names + resulting employeeId (for profile link).
  const reviewerIds = Array.from(
    new Set(rows.map((r) => r.reviewedById).filter((id): id is string => Boolean(id))),
  )
  const userIds = Array.from(
    new Set(rows.map((r) => r.resultingUserId).filter((id): id is string => Boolean(id))),
  )

  const [reviewers, users] = await Promise.all([
    reviewerIds.length
      ? prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, employee: { select: { fullName: true } } },
        })
      : Promise.resolve([] as Array<{ id: string; employee: { fullName: string } | null }>),
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, employee: { select: { id: true, fullName: true } } },
        })
      : Promise.resolve(
          [] as Array<{ id: string; employee: { id: string; fullName: string } | null }>,
        ),
  ])

  const reviewerById = new Map(reviewers.map((r) => [r.id, r.employee?.fullName ?? null]))
  const userById = new Map(users.map((u) => [u.id, u.employee]))

  const pendingCount = await prisma.signupAttempt.count({ where: { status: 'PENDING' } })

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      clerkUserId: r.clerkUserId,
      firstName: r.firstName,
      lastName: r.lastName,
      attemptedAt: r.attemptedAt,
      status: r.status,
      reviewedAt: r.reviewedAt,
      reviewedById: r.reviewedById,
      reviewerName: r.reviewedById ? reviewerById.get(r.reviewedById) ?? null : null,
      reviewNotes: r.reviewNotes,
      resultingUserId: r.resultingUserId,
      resultingEmployee: r.resultingUserId ? userById.get(r.resultingUserId) ?? null : null,
    })),
    pendingCount,
  })
}
