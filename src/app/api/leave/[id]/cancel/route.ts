/**
 * POST /api/leave/[id]/cancel
 * Cancel a leave request.
 *
 * Rules:
 *   - PENDING / PENDING_HR: the owner can cancel any time. Nothing to unwind
 *     (no balance was deducted, no attendance written).
 *   - APPROVED: the owner can cancel only if the leave hasn't started yet;
 *     HR_ADMIN can cancel at any time (e.g. employee came back early by
 *     agreement — though partial returns should go through HR edit flows).
 *     Cancelling approved leave unwinds the side-effects in a transaction:
 *       1) restore LeaveBalance (used -= days, remaining recomputed)
 *       2) delete the auto-written AttendanceLog L / HD rows in the range
 *          (only rows without a clock-in, so real punch data is never lost)
 *   - REJECTED / CANCELLED: terminal, cannot cancel.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notifyMany } from '@/lib/notifications'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isHR = payload.role === 'HR_ADMIN'

  // Block HR in preview mode from acting as HR (self-cancel still allowed below)
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const hrActingAsHR = isHR && (!previewRole || previewRole === 'HR_ADMIN')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = me?.employee?.id ?? null

  const { id } = await params
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, reportingManagerId: true } } },
  })
  if (!leaveRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = !!myEmpId && leaveRequest.employeeId === myEmpId

  if (leaveRequest.status === 'PENDING' || leaveRequest.status === 'PENDING_HR') {
    // Pending: owner-only (unchanged behaviour)
    if (!isOwner) {
      return NextResponse.json(
        { error: 'You can only cancel your own leave requests.' },
        { status: 403 },
      )
    }
    await prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } })
    return NextResponse.json({ success: true })
  }

  if (leaveRequest.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'Only pending or approved requests can be cancelled.' },
      { status: 400 },
    )
  }

  // ── APPROVED: owner may cancel before it starts; HR any time ──────────
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const started = leaveRequest.fromDate < todayStart
  if (isOwner && started && !hrActingAsHR) {
    return NextResponse.json({
      error: 'This leave has already started — ask HR to cancel it.',
    }, { status: 400 })
  }
  if (!isOwner && !hrActingAsHR) {
    return NextResponse.json({
      error: 'Only the requester (before the leave starts) or HR can cancel approved leave.',
    }, { status: 403 })
  }

  // Range boundaries for the writeback revert (local-midnight dates)
  const from = new Date(leaveRequest.fromDate); from.setHours(0, 0, 0, 0)
  const to = new Date(leaveRequest.toDate); to.setHours(23, 59, 59, 999)

  let raceLost = false
  await prisma.$transaction(async (tx) => {
    // Status guard so a concurrent cancel/delete can't double-restore balance
    const flipped = await tx.leaveRequest.updateMany({
      where: { id, status: 'APPROVED' },
      data: { status: 'CANCELLED' },
    })
    if (flipped.count === 0) { raceLost = true; return }

    // 1) Restore balance for the year the leave started in (same key the
    //    approve endpoint deducted from)
    const balance = await tx.leaveBalance.findFirst({
      where: {
        employeeId: leaveRequest.employeeId,
        leaveType: leaveRequest.leaveType,
        year: leaveRequest.fromDate.getFullYear(),
      },
    })
    if (balance) {
      const newUsed = Math.max(0, balance.used - leaveRequest.days)
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { used: newUsed, remaining: balance.allocated - newUsed },
      })
    }

    // 2) Revert the auto-written attendance cells. Only L / HD rows without
    //    a clock-in are removed — if the employee actually punched in on one
    //    of those days, that row is left alone (real data wins).
    await tx.attendanceLog.deleteMany({
      where: {
        employeeId: leaveRequest.employeeId,
        date: { gte: from, lte: to },
        status: { in: ['LEAVE', 'HALF_DAY'] },
        clockIn: null,
      },
    })
  })

  if (raceLost) {
    return NextResponse.json({
      success: false,
      message: 'This request was just acted on by someone else — refresh to see the latest state.',
    }, { status: 409 })
  }

  // Notify HR + manager so approvers know the plan changed (best effort)
  try {
    const dateRange = `${leaveRequest.fromDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${leaveRequest.toDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    const hrEmpIds = (
      await prisma.user.findMany({
        where: { role: 'HR_ADMIN', employee: { isNot: null } },
        select: { employee: { select: { id: true } } },
      })
    )
      .map((u) => u.employee?.id)
      .filter((x): x is string => !!x && x !== leaveRequest.employeeId)
    const recipients = [...hrEmpIds]
    if (leaveRequest.employee.reportingManagerId) recipients.push(leaveRequest.employee.reportingManagerId)
    if (recipients.length > 0) {
      await notifyMany(recipients, {
        type: 'LEAVE_SUBMITTED',
        title: 'Approved leave cancelled',
        message: `${leaveRequest.employee.fullName}'s ${leaveRequest.leaveType} (${dateRange}) was cancelled — balance restored and attendance cleared.`,
        link: '/dashboard/leave',
      })
    }
  } catch (e) {
    console.warn('[cancel leave] notification failed', e)
  }

  return NextResponse.json({ success: true, restoredDays: leaveRequest.days })
}
