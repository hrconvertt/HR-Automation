/**
 * POST /api/learning/records — enrol one or more employees on a program.
 *
 * Takes a program and a list of employees, so HR can put a whole team on a
 * course in one action. Someone already enrolled on that program is skipped
 * rather than duplicated.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const programId = String(body.programId ?? '')
  const employeeIds: string[] = Array.isArray(body.employeeIds)
    ? body.employeeIds.map(String)
    : body.employeeId ? [String(body.employeeId)] : []

  if (!programId || employeeIds.length === 0) {
    return NextResponse.json({ error: 'Pick a program and at least one employee' }, { status: 400 })
  }

  const start = body.startDate
    ? new Date(`${String(body.startDate).slice(0, 10)}T00:00:00Z`)
    : new Date()

  const already = await prisma.trainingRecord.findMany({
    where: { programId, employeeId: { in: employeeIds } },
    select: { employeeId: true },
  })
  const enrolled = new Set(already.map((r) => r.employeeId))
  const fresh = employeeIds.filter((id) => !enrolled.has(id))

  if (fresh.length) {
    await prisma.trainingRecord.createMany({
      data: fresh.map((employeeId) => ({
        employeeId,
        programId,
        startDate: Number.isNaN(start.getTime()) ? new Date() : start,
        status: 'ENROLLED',
      })),
    })
  }

  return NextResponse.json({ ok: true, enrolled: fresh.length, skipped: employeeIds.length - fresh.length }, { status: 201 })
}
