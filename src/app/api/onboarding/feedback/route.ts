import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// Employee-only. Submit (or upsert) their Day-30 feedback.
export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { employee: { select: { id: true } } },
  })
  const empId = user?.employee?.id
  if (!empId) return NextResponse.json({ error: 'No employee record' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const managerRating = body.managerRating != null ? Math.max(1, Math.min(5, Number(body.managerRating))) : null
  const clarityRating = body.clarityRating != null ? Math.max(1, Math.min(5, Number(body.clarityRating))) : null
  const recommendScore = body.recommendScore != null ? Math.max(0, Math.min(10, Number(body.recommendScore))) : null
  const missingItems = body.missingItems ? String(body.missingItems) : null

  const fb = await prisma.onboardingFeedback.upsert({
    where: { employeeId: empId },
    create: {
      employeeId: empId,
      managerRating,
      clarityRating,
      recommendScore,
      missingItems,
      submittedAt: new Date(),
    },
    update: {
      managerRating,
      clarityRating,
      recommendScore,
      missingItems,
      submittedAt: new Date(),
    },
  })

  return NextResponse.json({ feedback: fb })
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { employee: { select: { id: true } } },
  })
  const empId = user?.employee?.id
  if (!empId) return NextResponse.json({ feedback: null })
  const fb = await prisma.onboardingFeedback.findUnique({ where: { employeeId: empId } })
  return NextResponse.json({ feedback: fb })
}
