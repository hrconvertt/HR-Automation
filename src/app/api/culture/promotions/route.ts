/**
 * GET  /api/culture/promotions — every promotion, newest effective date first.
 * POST /api/culture/promotions — start one for an employee.
 *
 * Starting a promotion snapshots where the person is now — designation and
 * salary — because the employee record moves when the promotion is enacted,
 * and a letter that cannot say what changed is not a promotion letter.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const preview = request.cookies.get('hr_preview_role')?.value
  const role = preview ?? payload.role
  if (role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  return { payload }
}

export async function GET(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const promotions = await prisma.promotionRequest.findMany({
    orderBy: { effectiveDate: 'desc' },
    include: {
      employee: {
        select: { id: true, fullName: true, employeeCode: true, designation: true },
      },
    },
  })
  return NextResponse.json({ promotions })
}

export async function POST(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))

  const employeeId = String(body.employeeId ?? '')
  if (!employeeId) {
    return NextResponse.json({ error: 'Pick who is being promoted' }, { status: 400 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, fullName: true, designation: true, departmentId: true,
      salary: { select: { basic: true, houseRent: true, utilities: true, food: true,
        fuel: true, medicalAllowance: true, otherAllowance: true } },
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const s = employee.salary
  const currentGross = s
    ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
    : null

  // No date given means today — the form is where a real one gets picked.
  const effectiveDate = body.effectiveDate
    ? new Date(`${String(body.effectiveDate).slice(0, 10)}T00:00:00Z`)
    : new Date()

  const promotion = await prisma.promotionRequest.create({
    data: {
      employeeId,
      initiatedById: auth.payload!.userId,
      newDesignation: String(body.newDesignation ?? employee.designation ?? '').trim() || 'To be confirmed',
      newDepartmentId: employee.departmentId,
      newSalaryAmount: typeof body.newSalaryAmount === 'number' ? body.newSalaryAmount : null,
      effectiveDate: Number.isNaN(effectiveDate.getTime()) ? new Date() : effectiveDate,
      reason: String(body.reason ?? '').trim(),
      status: 'PENDING_HR',
      fromDesignation: employee.designation,
      fromSalaryAmount: currentGross,
      fromLevel: body.fromLevel ?? null,
      toLevel: body.toLevel ?? null,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, promotion }, { status: 201 })
}
