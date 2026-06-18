import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// Day 30 onboarding feedback survey â€” employee submits.
export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { employee: { select: { id: true } } },
  })
  if (!me?.employee?.id) return NextResponse.json({ error: 'No employee' }, { status: 400 })

  const body = await request.json()
  const fb = await prisma.onboardingFeedback.upsert({
    where: { employeeId: me.employee.id },
    create: {
      employeeId: me.employee.id,
      managerRating: body.managerRating ?? null,
      clarityRating: body.clarityRating ?? null,
      missingItems: body.missingItems ?? null,
      recommendScore: body.recommendScore ?? null,
      submittedAt: new Date(),
    },
    update: {
      managerRating: body.managerRating ?? undefined,
      clarityRating: body.clarityRating ?? undefined,
      missingItems: body.missingItems ?? undefined,
      recommendScore: body.recommendScore ?? undefined,
      submittedAt: new Date(),
    },
  })
  return NextResponse.json({ feedback: fb }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me) return NextResponse.json({ error: 'No user' }, { status: 400 })
  if (me.role !== 'HR_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const list = await prisma.onboardingFeedback.findMany({
    include: { employee: { select: { id: true, fullName: true, employeeCode: true, designation: true, joiningDate: true } } },
    orderBy: { submittedAt: 'desc' },
  })
  return NextResponse.json({ feedback: list })
}
