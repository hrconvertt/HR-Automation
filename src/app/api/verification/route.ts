/**
 * GET  /api/verification            — every check, newest first.
 * POST /api/verification            — open one against a previous employer.
 *
 * One row per employer. Somebody with three previous jobs gets three, because
 * they can disagree independently and closing one should not close the others.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function GET(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const verifications = await prisma.backgroundVerification.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      assignedTo: { select: { id: true, fullName: true } },
      _count: { select: { emails: true } },
    },
  })
  return NextResponse.json({ verifications })
}

export async function POST(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))

  const employeeId = String(body.employeeId ?? '')
  const employerName = String(body.employerName ?? '').trim()
  if (!employeeId) return NextResponse.json({ error: 'Pick who is being checked' }, { status: 400 })
  if (!employerName) {
    return NextResponse.json({ error: 'Name the previous employer' }, { status: 400 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { fullName: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Seed the candidate column with the name we already hold, so the form does
  // not start completely blank.
  const claimedJson = JSON.stringify({ candidateName: employee.fullName })

  const verification = await prisma.backgroundVerification.create({
    data: {
      employeeId,
      employerName,
      contactName: body.contactName || null,
      contactRole: body.contactRole || null,
      contactEmail: body.contactEmail || null,
      contactPhone: body.contactPhone || null,
      assignedToId: body.assignedToId || null,
      status: 'NOT_STARTED',
      claimedJson,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, verification }, { status: 201 })
}
