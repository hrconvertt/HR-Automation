import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { computeFinalSettlement } from '@/lib/final-settlement'

// Manager acknowledges resignation -> auto-creates ExitClearance.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true, fullName: true } } },
  })
  if (!me) return NextResponse.json({ error: 'No user' }, { status: 400 })

  const resignation = await prisma.resignation.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, reportingManagerId: true } } },
  })
  if (!resignation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isManager = me.role === 'MANAGER' && me.employee?.id === resignation.employee.reportingManagerId
  const isHR = me.role === 'HR_ADMIN'
  if (!isManager && !isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))

  const settlement = await computeFinalSettlement(resignation.employeeId, resignation.intendedLastDay).catch(() => null)
  const clearance = await prisma.exitClearance.create({
    data: {
      employeeId: resignation.employeeId,
      initiatedById: payload.userId,
      lastWorkingDay: resignation.intendedLastDay,
      prorataSalary: settlement?.prorataSalary ?? null,
      leaveEncashment: settlement?.leaveEncashment ?? null,
      outstandingDeductions: settlement?.outstandingDeductions ?? null,
      finalSettlementAmount: settlement?.finalSettlementAmount ?? null,
    },
  })

  const updated = await prisma.resignation.update({
    where: { id },
    data: {
      status: 'ACKNOWLEDGED',
      managerAckedAt: new Date(),
      managerAckedById: payload.userId,
      managerNotes: body.notes ?? null,
      exitClearanceId: clearance.id,
    },
  })

  // Auto-load asset assignments into Section 1 (the assets are already
  // linked via Employee; the clearance UI queries open AssetAssignment rows).

  // Notify HR
  const hrUsers = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
  for (const u of hrUsers) {
    if (u.employee?.id) await notify({ employeeId: u.employee.id, type: 'GENERAL', title: 'Resignation acknowledged', message: `${resignation.employee.fullName}'s manager acknowledged. Clearance opened.`, link: `/dashboard/lifecycle?tab=exit` })
  }

  return NextResponse.json({ resignation: updated, clearance })
}
