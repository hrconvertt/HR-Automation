import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

// HR approves -> PENDING_CEO. CEO approves -> APPROVED + apply changes.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'No user' }, { status: 400 })

  const body = await request.json()
  const action = body.action as 'APPROVE' | 'REJECT'
  const notes = body.notes as string | undefined

  const promo = await prisma.promotionRequest.findUnique({ where: { id } })
  if (!promo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'REJECT') {
    await prisma.promotionRequest.update({ where: { id }, data: { status: 'REJECTED' } })
    await notify({ employeeId: promo.employeeId, type: 'GENERAL', title: 'Promotion rejected', message: notes ?? 'Your promotion request was rejected.' })
    return NextResponse.json({ ok: true })
  }

  if (promo.status === 'PENDING_HR') {
    if (me.role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })
    await prisma.promotionRequest.update({
      where: { id },
      data: { status: 'PENDING_CEO', hrApprovedAt: new Date(), hrApprovedById: payload.userId, hrNotes: notes ?? null },
    })
    // Notify EXECUTIVE
    const ceos = await prisma.user.findMany({ where: { role: 'EXECUTIVE' }, select: { employee: { select: { id: true } } } })
    for (const u of ceos) {
      if (u.employee?.id) await notify({ employeeId: u.employee.id, type: 'GENERAL', title: 'Promotion needs CEO approval', message: `Promotion to ${promo.newDesignation}`, link: `/dashboard/employees/${promo.employeeId}` })
    }
    return NextResponse.json({ ok: true })
  }

  if (promo.status === 'PENDING_CEO') {
    if (me.role !== 'EXECUTIVE') return NextResponse.json({ error: 'CEO/Executive only' }, { status: 403 })
    // Apply changes
    await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.update({
        where: { id: promo.employeeId },
        data: {
          designation: promo.newDesignation,
          ...(promo.newDepartmentId ? { departmentId: promo.newDepartmentId } : {}),
        },
      })
      if (promo.newSalaryAmount && promo.newSalaryAmount > 0) {
        const old = await tx.salary.findUnique({ where: { employeeId: promo.employeeId } })
        const oldTotal = old ? (old.basic + old.houseRent + old.utilities + old.food + old.fuel + old.medicalAllowance + old.otherAllowance) : 0
        await tx.compensationHistory.create({
          data: {
            employeeId: promo.employeeId,
            type: 'PROMOTION',
            oldSalary: oldTotal,
            newSalary: promo.newSalaryAmount,
            incrementPct: oldTotal > 0 ? Math.round(((promo.newSalaryAmount - oldTotal) / oldTotal) * 100) : null,
            reason: promo.reason,
            effectiveDate: promo.effectiveDate,
            approvedById: payload.userId,
          },
        })
      }
      await tx.promotionRequest.update({
        where: { id },
        data: { status: 'APPROVED', ceoApprovedAt: new Date(), ceoApprovedById: payload.userId, ceoNotes: notes ?? null },
      })
      return emp
    })
    await notify({ employeeId: promo.employeeId, type: 'GENERAL', title: 'Promotion approved!', message: `Congratulations on your promotion to ${promo.newDesignation}.`, link: `/dashboard/employees/${promo.employeeId}` })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
}
