/**
 * POST /api/leave/[id]/approve
 *
 * Two-stage workflow:
 *   PENDING     → manager approves → PENDING_HR  (no balance deduction yet)
 *   PENDING     → HR approves      → APPROVED    (HR fast-path / no-manager case)
 *   PENDING_HR  → HR finalises     → APPROVED    (balance deducted)
 *   Any other transition is rejected.
 *
 * Authorisation:
 *   - Stage-1 approver (reportingManager for regulars, Co-Founder for
 *     senior staff — stored as LeaveRequest.stageOneApproverId on submit):
 *     can act only at PENDING. Can't self-approve.
 *   - HR_ADMIN: can act at any stage (final say).
 *   - EMPLOYEE / others (not the assigned stage-1 approver): forbidden.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify, notifyMany } from '@/lib/notifications'
import { triggerEmail, employeeVars } from '@/lib/email-triggers'
import { dayKey } from '@/lib/date-utils'
import { getStageOneApprover } from '@/lib/leave-approver'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role === 'EMPLOYEE') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Block HR in preview mode
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (payload.role === 'HR_ADMIN' && previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to approve leave' }, { status: 403 })
  }

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = me?.employee?.id ?? null

  // Optional approver comment — surfaced to the employee on the leave detail
  // page + included in notification.
  let approvalComment: string | null = null
  try {
    const body = await request.json().catch(() => null)
    if (body && typeof body.comment === 'string' && body.comment.trim().length > 0) {
      approvalComment = body.comment.trim().slice(0, 2000)
    }
  } catch { /* body optional */ }

  const { id } = await params
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, reportingManagerId: true } } },
  })
  if (!leaveRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (leaveRequest.status !== 'PENDING' && leaveRequest.status !== 'PENDING_HR') {
    return NextResponse.json({ error: 'Request is no longer pending.' }, { status: 400 })
  }

  // ── Stage-1 approver resolution ──────────────────────────────────────
  // The stored stageOneApproverId takes precedence (set on submit).
  // For older rows it's null — fall back to deriving it now (and finally
  // to reportingManager so legacy rows still work).
  let effectiveStageOneApproverId: string | null = leaveRequest.stageOneApproverId
  if (!effectiveStageOneApproverId) {
    try {
      effectiveStageOneApproverId = await getStageOneApprover(leaveRequest.employee.id)
    } catch (e) {
      console.warn('[approve] getStageOneApprover fallback failed', e)
    }
  }
  if (!effectiveStageOneApproverId) {
    effectiveStageOneApproverId = leaveRequest.employee.reportingManagerId
  }

  // ── Stage-1 approver guardrails (covers MANAGER + EXECUTIVE Co-Founder) ──
  // HR_ADMIN can act at either stage from anywhere — checked separately.
  const isHR = payload.role === 'HR_ADMIN'
  if (!isHR) {
    if (leaveRequest.status === 'PENDING_HR') {
      return NextResponse.json({
        error: 'This request is already past the first-stage approval. HR will finalise it.',
      }, { status: 400 })
    }
    if (myEmpId && leaveRequest.employee.id === myEmpId) {
      return NextResponse.json({
        error: 'You cannot approve your own leave.',
      }, { status: 403 })
    }
    if (effectiveStageOneApproverId !== myEmpId) {
      return NextResponse.json({
        error: 'Only the assigned approver or HR can approve at stage 1.',
      }, { status: 403 })
    }
  }

  // ── Decide the resulting state ───────────────────────────────────────
  // "Stage 1" = anyone who isn't HR acting on a PENDING request (so a
  // Co-Founder approving a senior's leave goes through this branch).
  // HR always finalises in one shot from whichever stage.
  const isStageOneApprover = !isHR && leaveRequest.status === 'PENDING'
  const movingToFinal = isHR

  // ── Perform the transition atomically ───────────────────────────────
  // We use `updateMany` with a status guard so two concurrent approvals
  // (double-click, two windows) can't both pass — only one observes
  // `count === 1` and proceeds to deduct balance. The other gets `count === 0`
  // and returns a friendly "already approved" without double-deducting.
  const targetStatusNow = leaveRequest.status // 'PENDING' or 'PENDING_HR'
  let raceLost = false

  await prisma.$transaction(async (tx) => {
    if (isStageOneApprover) {
      const result = await tx.leaveRequest.updateMany({
        where: { id, status: targetStatusNow },
        data: {
          status: 'PENDING_HR',
          managerApprovedById: myEmpId,
          managerApprovedAt: new Date(),
          ...(approvalComment ? { approvalComment } : {}),
        },
      })
      if (result.count === 0) { raceLost = true; return }
    } else if (movingToFinal) {
      const result = await tx.leaveRequest.updateMany({
        where: { id, status: targetStatusNow },
        data: {
          status: 'APPROVED',
          managerApprovedById: leaveRequest.managerApprovedById ?? myEmpId,
          managerApprovedAt: leaveRequest.managerApprovedAt ?? new Date(),
          approvedById: myEmpId,
          approvedAt: new Date(),
          ...(approvalComment ? { approvalComment } : {}),
        },
      })
      if (result.count === 0) { raceLost = true; return }

      // Only deduct balance once — guaranteed because updateMany only flipped status this time.
      const balance = await tx.leaveBalance.findFirst({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveType: leaveRequest.leaveType,
          year: leaveRequest.fromDate.getFullYear(),
        },
      })
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            remaining: Math.max(0, balance.remaining - leaveRequest.days),
            used: balance.used + leaveRequest.days,
          },
        })
      }

      // ── Auto-write AttendanceLog rows so the approved leave appears in
      //    the attendance grid + calendar + manager views as L / HD.
      //    Skip weekends + PUBLIC holidays (those aren't chargeable and
      //    shouldn't carry a LEAVE status).
      const holidays = await tx.holiday.findMany({
        where: {
          type: 'PUBLIC',
          date: { gte: leaveRequest.fromDate, lte: leaveRequest.toDate },
        },
        select: { date: true },
      })
      const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)))

      const start = new Date(leaveRequest.fromDate); start.setHours(0, 0, 0, 0)
      const end = new Date(leaveRequest.toDate); end.setHours(0, 0, 0, 0)
      const cursor = new Date(start)
      while (cursor <= end) {
        const dow = cursor.getDay()
        const k = dayKey(cursor)
        const isWeekend = dow === 0 || dow === 6
        const isHoliday = holidayKeys.has(k)
        if (!isWeekend && !isHoliday) {
          const isFirst = cursor.getTime() === start.getTime()
          const isLast = cursor.getTime() === end.getTime()
          const isHalf =
            (isFirst && leaveRequest.firstDayHalf) ||
            (isLast && leaveRequest.lastDayHalf)
          const status = isHalf ? 'HALF_DAY' : 'LEAVE'
          const hoursWorked = isHalf ? 4 : 0
          const dayDate = new Date(cursor)
          await tx.attendanceLog.upsert({
            where: { employeeId_date: { employeeId: leaveRequest.employeeId, date: dayDate } },
            create: {
              employeeId: leaveRequest.employeeId,
              date: dayDate,
              workType: 'ONSITE',
              status,
              hoursWorked,
              notes: `Auto-written from approved leave (${leaveRequest.leaveType})`,
            },
            update: {
              status,
              hoursWorked,
              notes: `Auto-written from approved leave (${leaveRequest.leaveType})`,
            },
          })
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    }
  })

  if (raceLost) {
    return NextResponse.json({
      success: false,
      message: 'This request was just acted on by someone else — refresh to see the latest state.',
    }, { status: 409 })
  }

  // ── Notifications (outside the txn — best effort) ────────────────────
  const dateRange = `${leaveRequest.fromDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${leaveRequest.toDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`

  if (isStageOneApprover) {
    // Tell HR there's something waiting for them
    const hrEmpIds = (
      await prisma.user.findMany({
        where: { role: 'HR_ADMIN' },
        select: { employee: { select: { id: true } } },
      })
    )
      .map((u) => u.employee?.id)
      .filter((x): x is string => !!x)
    if (hrEmpIds.length > 0) {
      await notifyMany(hrEmpIds, {
        type: 'LEAVE_SUBMITTED',
        title: 'Leave awaiting HR sign-off',
        message: `${leaveRequest.employee.fullName}: ${leaveRequest.leaveType} (${leaveRequest.days} day${leaveRequest.days > 1 ? 's' : ''}, ${dateRange}) — approved by manager, needs final sign-off`,
        link: '/dashboard/leave',
      })
    }
    // Tell the employee their manager said yes (but it's not final yet)
    await notify({
      employeeId: leaveRequest.employeeId,
      type: 'LEAVE_SUBMITTED',
      title: 'Manager approved your leave',
      message: `Your ${leaveRequest.leaveType} request (${dateRange}) was approved by your manager and is now awaiting HR sign-off.`,
      link: '/dashboard/leave',
    })
  } else if (movingToFinal) {
    await notify({
      employeeId: leaveRequest.employeeId,
      type: 'LEAVE_APPROVED',
      title: '✓ Leave Approved',
      message: `Your ${leaveRequest.leaveType} request (${dateRange}) has been approved.`,
      link: '/dashboard/leave',
    })
    // Also ping the reporting manager so they're aware HR finalised it
    if (leaveRequest.employee.reportingManagerId) {
      await notify({
        employeeId: leaveRequest.employee.reportingManagerId,
        type: 'LEAVE_APPROVED',
        title: '✓ Leave Approved (HR)',
        message: `${leaveRequest.employee.fullName}'s ${leaveRequest.leaveType} (${dateRange}) was approved by HR.`,
        link: '/dashboard/leave',
      })
    }
  }

  // LIF-08 leave.request_decided
  if (movingToFinal) {
    await triggerEmail({
      event: 'leave.request_decided',
      employeeId: leaveRequest.employeeId,
      variables: {
        ...employeeVars({ fullName: leaveRequest.employee.fullName, designation: null, department: null }),
        'Leave Type': leaveRequest.leaveType,
        'Date Range': dateRange,
        'Status': 'APPROVED',
      },
      conditionContext: { status: 'approved' },
      createdById: payload.userId,
      dedupeSalt: leaveRequest.id,
    })
  }

  return NextResponse.json({
    success: true,
    newStatus: isStageOneApprover ? 'PENDING_HR' : 'APPROVED',
  })
}
