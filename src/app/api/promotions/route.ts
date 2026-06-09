import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

// Initiate promotion (Manager or HR). Flow: PENDING_HR -> PENDING_CEO -> APPROVED.
export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'No user' }, { status: 400 })
  if (!['HR_ADMIN', 'MANAGER'].includes(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { employeeId, newDesignation, newDepartmentId, newSalaryAmount, effectiveDate, reason } = body
  if (!employeeId || !newDesignation || !effectiveDate || !reason) {
    return NextResponse.json({ error: 'employeeId, newDesignation, effectiveDate, reason required' }, { status: 400 })
  }

  const promo = await prisma.promotionRequest.create({
    data: {
      employeeId,
      initiatedById: payload.userId,
      newDesignation,
      newDepartmentId: newDepartmentId ?? null,
      newSalaryAmount: typeof newSalaryAmount === 'number' ? newSalaryAmount : null,
      effectiveDate: new Date(effectiveDate),
      reason,
      status: 'PENDING_HR',
    },
  })

  // Notify HR
  const hr = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
  for (const u of hr) {
    if (u.employee?.id) await notify({ employeeId: u.employee.id, type: 'GENERAL', title: 'Promotion request submitted', message: `New promotion to ${newDesignation}`, link: `/dashboard/employees/${employeeId}` })
  }
  return NextResponse.json({ promotion: promo }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const list = await prisma.promotionRequest.findMany({
    include: { employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ promotions: list })
}
