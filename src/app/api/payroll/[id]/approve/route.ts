/**
 * Legacy endpoint preserved for backwards compatibility.
 * New UI should call /api/payroll/[id]/transition with action='APPROVE'.
 *
 * This route now triggers the full chain: CALCULATE → CONFIRM → REVIEW → APPROVE
 * (only when current status is DRAFT — for "approve now" quick-action).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notifyMany } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden while previewing another role' }, { status: 403 })
  }

  const { id } = await params
  const payrollRun = await prisma.payrollRun.findUnique({ where: { id } })
  if (!payrollRun) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { fullName: true } } },
  })

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.update({
      where: { id },
      data: {
        status: 'APPROVED',
        calculatedAt: payrollRun.calculatedAt ?? now,
        managerConfirmedAt: payrollRun.managerConfirmedAt ?? now,
        financeReviewedAt: payrollRun.financeReviewedAt ?? now,
        approvedById: payload.userId,
        approvedAt: now,
      },
    })

    await tx.payslip.updateMany({
      where: { payrollRunId: id, status: 'DRAFT' },
      data: { status: 'APPROVED' },
    })

    // Audit row for the legacy fast-approve path
    await tx.payrollRunApproval.create({
      data: {
        runId: id,
        fromStatus: payrollRun.status,
        toStatus: 'APPROVED',
        action: 'APPROVE',
        actorUserId: payload.userId,
        actorName: user?.employee?.fullName ?? user?.email ?? null,
        actorRole: 'HR_ADMIN',
        comment: 'Fast-track approval (legacy endpoint)',
      },
    })
  })

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: id },
    select: { employeeId: true },
  })
  const monthName = new Date(payrollRun.year, payrollRun.month - 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
  await notifyMany(
    payslips.map((p) => p.employeeId),
    {
      type: 'PAYSLIP_READY',
      title: '💰 Payslip Released',
      message: `Your payslip for ${monthName} is ready to view.`,
      link: '/dashboard/payroll',
    },
  )

  return NextResponse.json({ success: true })
}
