/**
 * POST /api/learning/me/enrol — put yourself on a course.
 *
 *   body: { programId: string }
 *
 * Enrolling other people stays HR's — POST /api/learning/records is HR-only
 * and that is right. Starting a course yourself is not a decision anybody else
 * needs to make, and the quiz route already creates your record the moment you
 * submit an attempt; this only lets you say "I'm on this" before that.
 *
 * Idempotent: if you already have a record for the course, it is returned
 * as-is rather than a second one being made.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const preview = request.cookies.get('hr_preview_role')?.value
  if (hasRole(payload, 'HR_ADMIN') && preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing another role' }, { status: 403 })
  }
  if (!payload.employeeId) {
    return NextResponse.json({ error: 'Your account is not linked to an employee record.' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const programId = typeof body.programId === 'string' ? body.programId : ''
  if (!programId) return NextResponse.json({ error: 'No course given' }, { status: 400 })

  const program = await prisma.trainingProgram.findUnique({ where: { id: programId }, select: { id: true } })
  if (!program) return NextResponse.json({ error: 'That course no longer exists' }, { status: 404 })

  const existing = await prisma.trainingRecord.findFirst({
    where: { programId, employeeId: payload.employeeId },
    select: { id: true, status: true },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) return NextResponse.json({ ok: true, already: true, status: existing.status })

  const record = await prisma.trainingRecord.create({
    data: {
      employeeId: payload.employeeId,
      programId,
      startDate: new Date(),
      status: 'ENROLLED',
    },
    select: { id: true, status: true },
  })
  return NextResponse.json({ ok: true, already: false, status: record.status }, { status: 201 })
}
