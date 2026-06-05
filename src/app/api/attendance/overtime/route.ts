/**
 * POST /api/attendance/overtime
 * Approve or update overtime hours for an attendance log entry.
 * Body: { attendanceLogId, overtimeHours, approve }
 *
 * Authorisation rules:
 *   - HR_ADMIN: can approve any employee's OT (including managers').
 *   - MANAGER:  can approve OT for their direct reports ONLY.
 *               They CANNOT approve their own OT — that escalates to HR.
 *   - Everyone else: forbidden.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload || !['HR_ADMIN', 'MANAGER'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Block HR in preview mode (acting as another role)
  const previewRole = req.cookies.get('hr_preview_role')?.value
  if (payload.role === 'HR_ADMIN' && previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to approve overtime' }, { status: 403 })
  }

  const { attendanceLogId, overtimeHours, approve } = await req.json()

  if (!attendanceLogId) {
    return NextResponse.json({ error: 'attendanceLogId required' }, { status: 400 })
  }

  // ── Manager-specific guardrails ──────────────────────────────────────────
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

    // Block self-approval — managers cannot sign off on their own OT.
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

  const log = await prisma.attendanceLog.update({
    where: { id: attendanceLogId },
    data: {
      overtimeHours: overtimeHours ?? undefined,
      overtimeApproved: approve ?? undefined,
      overtimeApprovedById: approve ? payload.userId : undefined,
    },
  })

  return NextResponse.json({ log })
}
