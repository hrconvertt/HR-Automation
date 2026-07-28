/**
 * POST /api/policies/[id]/nudge
 *
 * Rules:
 *   - HR_ADMIN or MANAGER only. EMPLOYEE forbidden.
 *   - HR in preview-mode is blocked (consistent with publish/edit/delete).
 *   - Manager can only nudge their direct reports.
 *   - Already-signed employees are filtered out (no spurious reminders).
 *   - Throttle: at most one nudge per (policy, employee) per 24 hours, so
 *     hitting the endpoint repeatedly doesn't spam the recipient.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasAnyRole } from '@/lib/auth'
import { notifyMany } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string }> }

const NUDGE_THROTTLE_MS = 24 * 60 * 60 * 1000 // 24 h

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasAnyRole(payload, ['HR_ADMIN', 'MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Block HR while previewing other views ────────────────────────────
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (payload.role === 'HR_ADMIN' && previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json(
      { error: 'Switch back to HR view to send nudges' },
      { status: 403 },
    )
  }

  const { id } = await params
  const body = await request.json()
  const requested: string[] = Array.isArray(body.employeeIds) ? body.employeeIds : []
  if (requested.length === 0) {
    return NextResponse.json({ error: 'employeeIds required' }, { status: 400 })
  }

  const policy = await prisma.policyDocument.findUnique({ where: { id } })
  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (policy.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Can only nudge on published policies.' }, { status: 400 })
  }

  // ── Manager: restrict to direct reports ──────────────────────────────
  if (payload.role === 'MANAGER') {
    const me = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { employee: { select: { id: true } } },
    })
    if (!me?.employee?.id) {
      return NextResponse.json({ error: 'No employee linked' }, { status: 400 })
    }
    const myDirectReports = await prisma.employee.findMany({
      where: { reportingManagerId: me.employee.id },
      select: { id: true },
    })
    const directIds = new Set(myDirectReports.map((e) => e.id))
    if (!requested.every((eid) => directIds.has(eid))) {
      return NextResponse.json({ error: 'Can only nudge direct reports' }, { status: 403 })
    }
  }

  // ── Filter to PENDING acks only — skip already-signed ────────────────
  const pendingAcks = await prisma.policyAcknowledgment.findMany({
    where: {
      policyId: id,
      employeeId: { in: requested },
      status: 'PENDING',
    },
    select: { employeeId: true, notifiedAt: true },
  })

  // ── Throttle: skip anyone who was nudged in the last 24h ─────────────
  const now = new Date()
  const eligible = pendingAcks
    .filter((a) => !a.notifiedAt || (now.getTime() - new Date(a.notifiedAt).getTime()) >= NUDGE_THROTTLE_MS)
    .map((a) => a.employeeId)

  const skippedSigned = requested.length - pendingAcks.length
  const skippedThrottled = pendingAcks.length - eligible.length

  if (eligible.length === 0) {
    return NextResponse.json({
      sent: 0,
      skippedSigned,
      skippedThrottled,
      message: skippedThrottled > 0
        ? 'All recipients were nudged recently — try again later.'
        : 'No pending acknowledgements to nudge.',
    })
  }

  await notifyMany(eligible, {
    type: 'GENERAL',
    title: '📄 Reminder: Policy acknowledgment pending',
    message: `Please review and acknowledge: "${policy.title}"`,
    link: `/dashboard/policies/${id}`,
  })

  // Update notifiedAt + reminderCount on each pending ack we just nudged
  await prisma.policyAcknowledgment.updateMany({
    where: { policyId: id, employeeId: { in: eligible }, status: 'PENDING' },
    data: { reminderCount: { increment: 1 }, notifiedAt: now },
  })

  return NextResponse.json({
    sent: eligible.length,
    skippedSigned,
    skippedThrottled,
  })
}
