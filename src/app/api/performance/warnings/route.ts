/**
 * Employee Warnings â€” HR / Manager-initiated. Three warnings auto-escalate
 * to a Show Cause (created with status SHOW_CAUSE_REQUESTED so HR sees it
 * in the inbox).
 *
 *   GET    /api/performance/warnings?employeeId=...
 *   POST   /api/performance/warnings    body: { employeeId, reason, category, severity }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function resolveCaller(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { error: 'Unauthorized' as const, status: 401 }
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, employee: { select: { id: true } } },
  })
  if (!me) return { error: 'Unauthorized' as const, status: 401 }
  const preview = me.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  return { me, effectiveRole: preview ?? me.role }
}

export async function GET(request: NextRequest) {
  const c = await resolveCaller(request)
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: c.status })

  const empId = new URL(request.url).searchParams.get('employeeId') ?? ''
  if (!empId) return NextResponse.json({ warnings: [] })

  // Self / HR / direct manager only.
  const isHR = c.effectiveRole === 'HR_ADMIN'
  const isSelf = c.me.employee?.id === empId
  let allowed = isHR || isSelf
  if (!allowed && c.effectiveRole === 'MANAGER' && c.me.employee?.id) {
    const tgt = await prisma.employee.findUnique({
      where: { id: empId },
      select: { reportingManagerId: true },
    })
    allowed = !!tgt && tgt.reportingManagerId === c.me.employee.id
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const warnings = await prisma.employeeWarning.findMany({
    where: { employeeId: empId },
    orderBy: { issuedAt: 'desc' },
  })
  return NextResponse.json({ warnings })
}

export async function POST(request: NextRequest) {
  const c = await resolveCaller(request)
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: c.status })
  if (c.effectiveRole !== 'HR_ADMIN' && c.effectiveRole !== 'MANAGER') {
    return NextResponse.json({ error: 'Only HR or Manager can issue warnings' }, { status: 403 })
  }
  // HR-previewing-as-Manager is view-only.
  const preview = request.cookies.get('hr_preview_role')?.value
  if (c.me.role === 'HR_ADMIN' && preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing role' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const employeeId = String(body.employeeId ?? '').trim()
  const reason = String(body.reason ?? '').trim()
  if (!employeeId || !reason) {
    return NextResponse.json({ error: 'employeeId + reason required' }, { status: 400 })
  }
  const category = ['ATTENDANCE', 'CONDUCT', 'PERFORMANCE', 'OTHER'].includes(body.category)
    ? body.category : 'OTHER'
  const severity = ['VERBAL', 'WRITTEN', 'FINAL'].includes(body.severity)
    ? body.severity : 'VERBAL'

  // Manager can only warn their own reports.
  if (c.effectiveRole === 'MANAGER') {
    const tgt = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { reportingManagerId: true },
    })
    if (!tgt || tgt.reportingManagerId !== c.me.employee?.id) {
      return NextResponse.json({ error: 'Not your direct report' }, { status: 403 })
    }
  }

  const warning = await prisma.employeeWarning.create({
    data: { employeeId, reason, category, severity, issuedById: c.me.id },
  })

  // 3-strike escalation â€” count UN-RESOLVED warnings (we don't track a
  // resolved flag yet, so use the last 12 months as a rolling window).
  const cutoff = new Date(Date.now() - 365 * 86_400_000)
  const recentCount = await prisma.employeeWarning.count({
    where: { employeeId, issuedAt: { gte: cutoff } },
  })

  let escalated = false
  if (recentCount >= 3) {
    // Only escalate if there's no open Show Cause already.
    const open = await prisma.showCause.findFirst({
      where: {
        employeeId,
        status: { notIn: ['RESOLVED'] },
      },
    })
    if (!open) {
      await prisma.showCause.create({
        data: {
          employeeId,
          issueType: category === 'OTHER' ? 'MISCONDUCT' : category,
          status: 'SHOW_CAUSE_REQUESTED',
          requestedById: c.me.id,
          escalationRequestedAt: new Date(),
          escalationReason: `Auto-escalated after ${recentCount} warnings in 12 months.`,
        },
      })
      escalated = true
    }
  }

  return NextResponse.json({ warning, totalRecent: recentCount, escalated })
}
