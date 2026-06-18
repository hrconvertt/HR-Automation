/**
 * POST /api/leave/[id]/reject
 *
 * Rejection rules:
 *   - Allowed at PENDING (manager stage) OR PENDING_HR (HR stage).
 *   - MANAGER may reject only at PENDING for their direct reports, never own.
 *   - HR_ADMIN may reject at any stage.
 *   - REJECTED is terminal.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { triggerEmail, employeeVars } from '@/lib/email-triggers'

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
    return NextResponse.json({ error: 'Switch back to HR view to reject leave' }, { status: 403 })
  }

  const { id } = await params
  const { reason } = await request.json()

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = me?.employee?.id ?? null

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, reportingManagerId: true } } },
  })
  if (!leaveRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (leaveRequest.status !== 'PENDING' && leaveRequest.status !== 'PENDING_HR') {
    return NextResponse.json({ error: 'Request is no longer pending.' }, { status: 400 })
  }

  // ── Manager guardrails ───────────────────────────────────────────────
  if (payload.role === 'MANAGER') {
    if (leaveRequest.status === 'PENDING_HR') {
      return NextResponse.json({
        error: 'This request is past the manager stage. Only HR can act on it now.',
      }, { status: 400 })
    }
    if (myEmpId && leaveRequest.employee.id === myEmpId) {
      return NextResponse.json({
        error: 'You cannot reject your own leave. Your leave is reviewed by HR.',
      }, { status: 403 })
    }
    if (leaveRequest.employee.reportingManagerId !== myEmpId) {
      return NextResponse.json({
        error: 'You can only reject leave for your direct reports.',
      }, { status: 403 })
    }
  }

  await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectedReason: reason ?? 'No reason provided',
      rejectedById: myEmpId,
    },
  })

  const dateRange = `${leaveRequest.fromDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${leaveRequest.toDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  const who = payload.role === 'HR_ADMIN' ? 'HR' : 'Manager'

  await notify({
    employeeId: leaveRequest.employeeId,
    type: 'LEAVE_REJECTED',
    title: '✗ Leave Rejected',
    message: `Your ${leaveRequest.leaveType} request (${dateRange}) was rejected by ${who}. ${reason ? 'Reason: ' + reason : ''}`.trim(),
    link: '/dashboard/leave',
  })

  await triggerEmail({
    event: 'leave.request_decided',
    employeeId: leaveRequest.employeeId,
    variables: {
      ...employeeVars({ fullName: leaveRequest.employee.fullName, designation: null, department: null }),
      'Leave Type': leaveRequest.leaveType,
      'Date Range': dateRange,
      'Status': 'REJECTED',
      'Reason': reason ?? '',
    },
    conditionContext: { status: 'rejected' },
    createdById: payload.userId,
    dedupeSalt: leaveRequest.id,
  })

  return NextResponse.json({ success: true })
}
