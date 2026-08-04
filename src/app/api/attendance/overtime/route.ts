/**
 * POST /api/attendance/overtime
 * Approve or update overtime hours for an attendance log entry.
 * Body: { attendanceLogId, overtimeHours, approve }
 *
 * Authorisation rules:
 *   - HR_ADMIN: can approve any employee's OT (including managers').
 *   - MANAGER:  can approve OT for their direct reports ONLY.
 *               They CANNOT approve their own OT â€” that escalates to HR.
 *   - Everyone else: forbidden.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload || !['HR_ADMIN', 'MANAGER'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Block HR in preview mode (acting as another role)
  const previewRole = req.cookies.get('hr_preview_role')?.value
  if (payload.role === 'HR_ADMIN' && previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to approve overtime' }, { status: 403 })
  }

  const { attendanceLogId, overtimeHours, approve, ratePct, note } = await req.json()

  if (!attendanceLogId) {
    return NextResponse.json({ error: 'attendanceLogId required' }, { status: 400 })
  }

  // â”€â”€ Manager-specific guardrails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (payload.role === 'MANAGER') {
    const me = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { employee: { select: { id: true } } },
    })
    const myEmpId = me?.employee?.id ?? null

    const target = await prisma.attendanceLog.findUnique({
      where: { id: attendanceLogId },
      include: {
        employee: { select: { id: true, reportingManagerId: true, fullName: true } },
      },
    })
    if (!target) {
      return NextResponse.json({ error: 'Attendance log not found' }, { status: 404 })
    }

    // Block self-approval â€” managers cannot sign off on their own OT.
    if (myEmpId && target.employee.id === myEmpId) {
      return NextResponse.json({
        error: 'You cannot approve your own overtime. Your overtime is reviewed by HR.',
      }, { status: 403 })
    }

    // Block approving OT for employees who don't report to this manager.
    if (target.employee.reportingManagerId !== myEmpId) {
      return NextResponse.json({
        error: `You can only approve overtime for your direct reports.`,
      }, { status: 403 })
    }
  }

  // A decision, recorded as one. Rejecting used to write `overtimeApproved:
  // false` — indistinguishable from never having been looked at, so the row
  // came straight back into the inbox. REJECTED is terminal.
  const decided = approve === true ? 'APPROVED' : 'REJECTED'

  const log = await prisma.attendanceLog.update({
    where: { id: attendanceLogId },
    data: {
      overtimeHours: overtimeHours ?? undefined,
      overtimeApproved: approve === true,
      overtimeApprovedById: payload.userId,
      overtimeStatus: decided,
      overtimeDecidedAt: new Date(),
      ...(typeof ratePct === 'number' ? { overtimeRatePct: ratePct } : {}),
      ...(typeof note === 'string' && note.trim() ? { overtimeNote: note.trim().slice(0, 500) } : {}),
    },
    include: { employee: { select: { id: true, fullName: true } } },
  })

  // The employee should hear the outcome either way — an approval is money and
  // a rejection is hours they will not be paid for.
  const when = log.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  await notify({
    employeeId: log.employeeId,
    type: approve === true ? 'OVERTIME_APPROVED' : 'OVERTIME_REJECTED',
    title: approve === true ? '✓ Overtime approved' : 'Overtime not approved',
    message: approve === true
      ? `Your ${log.overtimeHours}h of overtime on ${when} was approved.`
      : `Your ${log.overtimeHours}h of overtime on ${when} was not approved${log.overtimeNote ? ` — ${log.overtimeNote}` : ''}.`,
    link: '/dashboard/time/overtime',
  }).catch(() => { /* best effort — the decision itself is already saved */ })

  return NextResponse.json({ log })
}
