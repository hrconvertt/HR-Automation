/**
 * /api/termination
 *
 * GET  — list all Terminations (HR_ADMIN + EXECUTIVE view).
 * POST — initiate a new Termination workflow. HR_ADMIN only, honors
 *        hr_preview_role cookie (view-only while previewing).
 *
 * Body: { employeeId, showCauseId?, reason, reasonCategory, lastWorkingDay }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notify } from '@/lib/notifications'

const REASON_CATEGORIES = new Set([
  'MISCONDUCT',
  'PERFORMANCE',
  'ATTENDANCE',
  'POLICY_VIOLATION',
  'REDUNDANCY',
  'OTHER',
])

function pushActivity(existing: string | null, entry: { at: string; by: string; action: string; note?: string }): string {
  let arr: unknown[] = []
  if (existing) {
    try { const parsed = JSON.parse(existing); if (Array.isArray(parsed)) arr = parsed } catch { /* ignore */ }
  }
  arr.push(entry)
  return JSON.stringify(arr)
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = previewRole ?? payload.role
  if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const terminations = await prisma.termination.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          department: { select: { name: true } },
        },
      },
    },
  })
  return NextResponse.json({ terminations })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing role' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const employeeId = String(body.employeeId ?? '')
  const reason = String(body.reason ?? '').trim()
  const reasonCategory = String(body.reasonCategory ?? '').toUpperCase()
  const showCauseId = body.showCauseId ? String(body.showCauseId) : null
  const lastWorkingDayRaw = body.lastWorkingDay ? String(body.lastWorkingDay) : ''

  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 })
  if (!REASON_CATEGORIES.has(reasonCategory)) {
    return NextResponse.json({ error: 'invalid reasonCategory' }, { status: 400 })
  }
  if (!lastWorkingDayRaw) return NextResponse.json({ error: 'lastWorkingDay required' }, { status: 400 })
  const lastWorkingDay = new Date(lastWorkingDayRaw)
  if (Number.isNaN(lastWorkingDay.getTime())) {
    return NextResponse.json({ error: 'invalid lastWorkingDay' }, { status: 400 })
  }

  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, fullName: true } })
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const initiator = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { email: true, employee: { select: { fullName: true } } },
  })
  const initiatorName = initiator?.employee?.fullName ?? initiator?.email ?? 'HR'

  const activity = pushActivity(null, {
    at: new Date().toISOString(),
    by: initiatorName,
    action: 'INITIATED',
    note: `Reason category: ${reasonCategory}`,
  })

  const termination = await prisma.termination.create({
    data: {
      employeeId,
      initiatedById: payload.userId,
      initiatedByName: initiatorName,
      showCauseId,
      reason,
      reasonCategory,
      lastWorkingDay,
      status: 'INITIATED',
      activityLog: activity,
    },
  })

  // Best-effort: link back on the Show Cause if provided
  if (showCauseId) {
    await prisma.showCause.update({
      where: { id: showCauseId },
      data: { status: 'ESCALATED_TERMINATION', outcome: `Escalated to Termination on ${new Date().toLocaleDateString('en-GB')}. Reason: ${reason}` },
    }).catch(() => { /* non-fatal */ })
  }

  // Notify HR admins (excluding initiator) — informational
  await notify({
    employeeId: employeeId, // employee record — internal audit trail; employee sees on meeting scheduled
    type: 'GENERAL',
    title: 'Termination workflow initiated',
    message: `A termination workflow has been initiated for review. You will be formally notified when the meeting is scheduled.`,
    link: `/dashboard/lifecycle/termination/${termination.id}`,
  }).catch(() => { /* non-fatal */ })

  return NextResponse.json({ termination })
}
