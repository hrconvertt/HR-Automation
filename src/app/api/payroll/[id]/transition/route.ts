import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import {
  TRANSITIONS,
  resolveNextStage,
  type PayrollAction,
} from '@/lib/payroll-workflow'
import { notifyMany } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reject preview-mode actions for HR
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN' && payload.role === 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to perform this action' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = body.action as PayrollAction | undefined
  const comment = (body.comment ?? null) as string | null
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      userRoles: { select: { role: true } },
      employee: { select: { fullName: true } },
    },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userRoles = user.userRoles.length ? user.userRoles.map((r) => r.role) : [user.role]

  const run = await prisma.payrollRun.findUnique({ where: { id } })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Authorization for this action+stage ───────────────────────────────────
  let allowed = false
  if (action === 'REJECT') {
    // HR or Executive can reject at any approval stage
    allowed = userRoles.some((r) => ['HR_ADMIN', 'EXECUTIVE', 'FINANCE'].includes(r))
  } else if (action === 'RECALL') {
    // HR can recall before LOCKED
    allowed =
      userRoles.includes('HR_ADMIN') && !['LOCKED', 'DISBURSED', 'CLOSED'].includes(run.status)
  } else {
    const t = TRANSITIONS.find((t) => t.from === run.status && t.action === action)
    if (!t) {
      return NextResponse.json(
        { error: `Action "${action}" not valid from status "${run.status}"` },
        { status: 400 },
      )
    }
    allowed = t.allowedRoles.some((r) => userRoles.includes(r))
  }
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have permission for this action' }, { status: 403 })
  }

  const nextStatus = resolveNextStage(run.status, action)
  if (!nextStatus) {
    return NextResponse.json({ error: 'Invalid transition' }, { status: 400 })
  }

  // ── Build the update payload ──────────────────────────────────────────────
  const now = new Date()
  const update: Record<string, unknown> = { status: nextStatus }
  if (action === 'CALCULATE') update.calculatedAt = now
  if (action === 'CONFIRM') update.managerConfirmedAt = now
  if (action === 'REVIEW') update.financeReviewedAt = now
  if (action === 'APPROVE') {
    update.approvedAt = now
    update.approvedById = payload.userId
  }
  if (action === 'LOCK') update.lockedAt = now
  if (action === 'DISBURSE') {
    update.disbursedAt = now
    update.sentAt = now
  }
  if (action === 'CLOSE') update.closedAt = now
  if (action === 'REJECT') {
    // Reset partial-completion timestamps so the run can move forward again
    update.calculatedAt = null
    update.managerConfirmedAt = null
    update.financeReviewedAt = null
    update.approvedAt = null
    update.approvedById = null
  }

  // ── Transactional update + audit row + side-effects ───────────────────────
  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.update({ where: { id }, data: update })

    await tx.payrollRunApproval.create({
      data: {
        runId: id,
        fromStatus: run.status,
        toStatus: nextStatus,
        action,
        actorUserId: payload.userId,
        actorName: user.employee?.fullName ?? user.email ?? null,
        actorRole: userRoles[0] ?? user.role,
        comment,
      },
    })

    // Side-effect: on LOCK, mark payslips APPROVED. On DISBURSE, mark PAID + send notifications.
    if (action === 'LOCK') {
      await tx.payslip.updateMany({
        where: { payrollRunId: id },
        data: { status: 'APPROVED' },
      })
    }
    if (action === 'DISBURSE') {
      await tx.payslip.updateMany({
        where: { payrollRunId: id },
        data: { status: 'PAID', sentAt: now },
      })
    }
    if (action === 'REJECT') {
      await tx.payslip.updateMany({
        where: { payrollRunId: id, status: { not: 'PAID' } },
        data: { status: 'DRAFT' },
      })
    }
  })

  // Notifications (outside the transaction so failure can't roll back the action)
  if (action === 'DISBURSE') {
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: id },
      select: { employeeId: true },
    })
    const monthName = new Date(run.year, run.month - 1).toLocaleDateString('en-GB', {
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
  }

  if (action === 'CALCULATE') {
    // Tell HR managers there's work waiting
    const hrEmpIds = (
      await prisma.user.findMany({
        where: { OR: [{ role: 'MANAGER' }, { userRoles: { some: { role: 'MANAGER' } } }] },
        select: { employee: { select: { id: true } } },
      })
    )
      .map((u) => u.employee?.id)
      .filter((x): x is string => !!x)
    await notifyMany(hrEmpIds, {
      type: 'GENERAL',
      title: 'Payroll ready for team confirmation',
      message: `Please review your team\'s ${run.month}/${run.year} payroll figures.`,
      link: '/dashboard/payroll',
    })
  }

  return NextResponse.json({ success: true, status: nextStatus })
}
