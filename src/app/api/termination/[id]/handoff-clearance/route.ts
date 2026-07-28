import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guardHrAction, pushActivity } from '@/lib/termination-helpers'
import { computeFinalSettlement } from '@/lib/final-settlement'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardHrAction(request)
  if (!guard.ok) return guard.response
  const { access } = guard

  const termination = await prisma.termination.findUnique({ where: { id } })
  if (!termination) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (termination.status !== 'NOTICE_ISSUED') {
    return NextResponse.json({ error: 'Notice must be issued before handoff' }, { status: 400 })
  }

  const lwd = termination.lastWorkingDay
  const settlement = await computeFinalSettlement(termination.employeeId, lwd).catch(() => null)

  const clearance = await prisma.exitClearance.create({
    data: {
      employeeId: termination.employeeId,
      initiatedById: access.userId,
      lastWorkingDay: lwd,
      triggerType: 'TERMINATION',
      terminationId: id,
      prorataSalary: settlement?.prorataSalary ?? null,
      leaveEncashment: settlement?.leaveEncashment ?? null,
      outstandingDeductions: settlement?.outstandingDeductions ?? null,
      finalSettlementAmount: settlement?.finalSettlementAmount ?? null,
    },
  })

  const activity = pushActivity(termination.activityLog, {
    at: new Date().toISOString(),
    by: access.actorName,
    action: 'IN_EXIT_CLEARANCE',
    note: `Exit clearance ${clearance.id} opened`,
  })

  const updated = await prisma.termination.update({
    where: { id },
    data: {
      exitClearanceId: clearance.id,
      status: 'IN_EXIT_CLEARANCE',
      activityLog: activity,
    },
  })

  // Flip Employee.status to TERMINATED with exitDate
  await prisma.employee.update({
    where: { id: termination.employeeId },
    data: { status: 'TERMINATED', exitDate: lwd, terminationType: 'INVOLUNTARY' },
  }).catch(() => {})

  return NextResponse.json({ termination: updated, clearance })
}
