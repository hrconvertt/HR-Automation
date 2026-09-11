/**
 * POST /api/learning/programs/[id]/rating — rate a course, 1 to 5 stars.
 *
 *   body: { stars: 1 | 2 | 3 | 4 | 5 }
 *
 * One rating per person per course; rating again replaces the old one. The new
 * average comes back with the response so the page can show it straight away.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const preview = request.cookies.get('hr_preview_role')?.value
  if (hasRole(payload, 'HR_ADMIN') && preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing another role' }, { status: 403 })
  }
  if (!payload.employeeId) {
    return NextResponse.json({ error: 'Your account is not linked to an employee record.' }, { status: 400 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const stars = Number(body.stars)
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return NextResponse.json({ error: 'A rating is 1 to 5 stars' }, { status: 400 })
  }

  const program = await prisma.trainingProgram.findUnique({ where: { id }, select: { id: true } })
  if (!program) return NextResponse.json({ error: 'That course no longer exists' }, { status: 404 })

  await prisma.learningRating.upsert({
    where: { employeeId_programId: { employeeId: payload.employeeId, programId: id } },
    update: { stars },
    create: { employeeId: payload.employeeId, programId: id, stars },
  })

  const agg = await prisma.learningRating.aggregate({
    where: { programId: id }, _avg: { stars: true }, _count: { _all: true },
  })
  return NextResponse.json({
    ok: true,
    mine: stars,
    average: agg._avg.stars ?? null,
    count: agg._count._all,
  })
}
