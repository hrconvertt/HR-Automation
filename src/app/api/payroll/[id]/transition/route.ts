import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import {
  TRANSITIONS,
  resolveNextStage,
  sendBackAllowedRoles,
  type PayrollAction,
} from '@/lib/payroll-workflow'
import { notifyMany } from '@/lib/notifications'
import { triggerEmail, employeeVars } from '@/lib/email-triggers'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * Single endpoint for all payroll-run state transitions.
 *
 * Body: { action: PayrollAction, comment?: string, reason?: string }
 *   - SUBMIT_TO_CEO      HR_ADMIN  DRAFT → PENDING_CEO
 *   - CEO_APPROVE        EXECUTIVE PENDING_CEO → PENDING_HR_FINAL
 *   - HR_FINAL_APPROVE   HR_ADMIN  PENDING_HR_FINAL → PENDING_FINANCE
 *   - RELEASE_TO_FINANCE HR_ADMIN  alias of HR_FINAL_APPROVE
 *   - MARK_PAID          FINANCE/HR_ADMIN PENDING_FINANCE → PAID
 *   - SEND_BACK          reviewer → prior stage, reason required
 *
 * Legacy actions (CALCULATE/CONFIRM/REVIEW/APPROVE/LOCK/DISBURSE/CLOSE/REJECT/RECALL)
 * are no longer routed — they're handled by the legacy /approve endpoint or
 * dropped. The new 5-stage flow is now canonical.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Block actions while previewing a non-HR role from an HR_ADMIN session.
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== payload.role) {
    return NextResponse.json(
      { error: 'Switch back to your primary role to perform this action' },
      { status: 403 },
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = body.action as PayrollAction | undefined
  const reason = (body.reason ?? body.comment ?? null) as string | null
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

  // ── Authorization ─────────────────────────────────────────────────────────
  let allowed = false
  if (action === 'SEND_BACK') {
    if (!reason || reason.trim().length < 3) {
      return NextResponse.json({ error: 'A reason is required to send back' }, { status: 400 })
    }
    const roles = sendBackAllowedRoles(run.status)
    if (roles.length === 0) {
      return NextResponse.json(
        { error: `Cannot send back from status "${run.status}"` },
        { status: 400 },
      )
    }
    allowed = roles.some((r) => userRoles.includes(r))
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
    return NextResponse.json(
      { error: 'You do not have permission for this action' },
      { status: 403 },
    )
  }

  const nextStatus = resolveNextStage(run.status, action)
  if (!nextStatus) {
    return NextResponse.json({ error: 'Invalid transition' }, { status: 400 })
  }

  // ── Build update payload ──────────────────────────────────────────────────
  const now = new Date()
  const update: Record<string, unknown> = { status: nextStatus }

  switch (action) {
    case 'SUBMIT_TO_CEO':
      update.submittedToCeoAt = now
      update.submittedToCeoById = payload.userId
      break
    case 'CEO_APPROVE':
      update.ceoReviewedAt = now
      update.ceoReviewedById = payload.userId
      update.returnedToHrAt = now
      break
    case 'HR_FINAL_APPROVE':
    case 'RELEASE_TO_FINANCE':
      update.hrFinalApprovedAt = now
      update.hrFinalApprovedById = payload.userId
      update.releasedToFinanceAt = now
      // Legacy compat — keep approvedAt populated so old reports still light up
      update.approvedAt = now
      update.approvedById = payload.userId
      break
    case 'MARK_PAID':
      update.financePaidAt = now
      update.financePaidById = payload.userId
      // Legacy compat
      update.disbursedAt = now
      update.sentAt = now
      break
    case 'SEND_BACK':
      update.sendBackReason = reason
      update.sendBackAt = now
      update.sendBackById = payload.userId
      break
  }

  // ── Transactional update + audit row ──────────────────────────────────────
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
        comment: reason,
      },
    })

    // On MARK_PAID, flip payslip statuses so employees see them.
    if (action === 'MARK_PAID') {
      await tx.payslip.updateMany({
        where: { payrollRunId: id },
        data: { status: 'PAID', sentAt: now },
      })
    }
  })

  // ── Notifications (outside tx so failures can't roll back the action) ─────
  const monthName = new Date(run.year, run.month - 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  async function notifyByRole(role: string, title: string, message: string) {
    const empIds = (
      await prisma.user.findMany({
        where: { OR: [{ role }, { userRoles: { some: { role } } }] },
        select: { employee: { select: { id: true } } },
      })
    )
      .map((u) => u.employee?.id)
      .filter((x): x is string => !!x)
    if (empIds.length) {
      await notifyMany(empIds, {
        type: 'GENERAL',
        title,
        message,
        link: '/dashboard/payroll',
      })
    }
  }

  if (action === 'SUBMIT_TO_CEO') {
    await notifyByRole('EXECUTIVE', '📋 Payroll Ready for CEO Review',
      `Payroll for ${monthName} is ready for your review.`)
  } else if (action === 'CEO_APPROVE') {
    await notifyByRole('HR_ADMIN', '✅ CEO Approved Payroll',
      `CEO approved ${monthName} payroll — awaiting your final review.`)
  } else if (action === 'HR_FINAL_APPROVE' || action === 'RELEASE_TO_FINANCE') {
    await notifyByRole('FINANCE', '💸 Payroll Ready for Processing',
      `${monthName} payroll has been released — please process the bank transfer.`)
  } else if (action === 'MARK_PAID') {
    await notifyByRole('HR_ADMIN', '🏦 Payroll Processed',
      `Finance has marked ${monthName} payroll as paid.`)
    // Also notify employees their payslip is visible
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: id },
      select: { employeeId: true },
    })
    await notifyMany(payslips.map((p) => p.employeeId), {
      type: 'PAYSLIP_READY',
      title: '💰 Payslip Released',
      message: `Your payslip for ${monthName} is ready to view.`,
      link: '/dashboard/payroll',
    })

    // PAY-01 payroll.credited — one email per employee
    const empRows = await prisma.employee.findMany({
      where: { id: { in: payslips.map((p) => p.employeeId) } },
      select: { id: true, fullName: true },
    })
    for (const e of empRows) {
      await triggerEmail({
        event: 'payroll.credited',
        employeeId: e.id,
        variables: {
          ...employeeVars({ fullName: e.fullName, designation: null, department: null }),
          'Month': monthName,
        },
        conditionContext: { payslip_generated: true },
        createdById: payload.userId,
        dedupeSalt: id, // payroll run id — one send per run per employee
      })
    }
  } else if (action === 'SEND_BACK') {
    // Notify whoever was at the prior stage
    const targetRole = nextStatus === 'DRAFT'             ? 'HR_ADMIN'
                     : nextStatus === 'PENDING_CEO'        ? 'EXECUTIVE'
                     : nextStatus === 'PENDING_HR_FINAL'   ? 'HR_ADMIN'
                     : null
    if (targetRole) {
      await notifyByRole(targetRole, '↩️ Payroll Sent Back',
        `${monthName} payroll was sent back: ${reason ?? 'no reason given'}`)
    }
  }

  return NextResponse.json({ success: true, status: nextStatus })
}
