import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify, notifyMany } from '@/lib/notifications'
import { computeTimeMetrics } from '@/lib/performance-metrics'
import { enactOutcome } from '@/lib/probation-reconciler'

interface RouteParams { params: Promise<{ id: string }> }

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) return null
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  return {
    userId: user.id,
    actualRole: user.role,
    effectiveRole: previewRole ?? user.role,
    isPreviewMode: user.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN',
    employeeId: user.employee?.id ?? null,
  }
}

async function loadRecord(id: string) {
  return prisma.probationRecord.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          reportingManagerId: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
        },
      },
    },
  })
}

function canView(rec: NonNullable<Awaited<ReturnType<typeof loadRecord>>>, access: NonNullable<Awaited<ReturnType<typeof resolveAccess>>>): boolean {
  const isOwn = rec.employeeId === access.employeeId
  const isMyTeam = rec.employee.reportingManagerId === access.employeeId
  const isHR = access.effectiveRole === 'HR_ADMIN'
  return isOwn || isMyTeam || isHR
}

// GET /api/probation/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const record = await loadRecord(id)
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canView(record, access)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ record })
}

// PATCH /api/probation/[id]
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Cannot act on probation while previewing as another role' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const action = body.action as string | undefined
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const rec = await loadRecord(id)
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isHR = access.actualRole === 'HR_ADMIN'
  const isManagerOfEmployee = rec.employee.reportingManagerId === access.employeeId

  // ── SETTLING_CHECKIN ── manager or HR
  if (action === 'SETTLING_CHECKIN') {
    if (!isHR && !isManagerOfEmployee) {
      return NextResponse.json({ error: 'Only manager or HR can submit settling check-in' }, { status: 403 })
    }
    const flag = (body.flag ?? '').toString().toUpperCase()
    if (!['GREEN', 'AMBER', 'RED'].includes(flag)) {
      return NextResponse.json({ error: 'flag must be GREEN | AMBER | RED' }, { status: 400 })
    }
    const updated = await prisma.probationRecord.update({
      where: { id },
      data: {
        settlingCheckInAt: new Date(),
        settlingFlag: flag,
        settlingNotes: (body.notes ?? '').toString() || null,
      },
    })
    if (flag === 'RED') {
      // Loop in HR if red flag
      const hrUsers = await prisma.user.findMany({
        where: { role: 'HR_ADMIN' },
        select: { employee: { select: { id: true } } },
      })
      const ids = hrUsers.map((u) => u.employee?.id).filter(Boolean) as string[]
      await notifyMany(ids, {
        type: 'PROBATION_ALERT',
        title: 'Settling check-in: RED flag',
        message: `${rec.employee.fullName} flagged RED at Day-30. Consider intervention.`,
        link: `/dashboard/probation/${id}`,
      })
    }
    return NextResponse.json({ record: updated })
  }

  // ── GENERATE_PACKET ── HR or manager can force
  if (action === 'GENERATE_PACKET') {
    if (!isHR && !isManagerOfEmployee) {
      return NextResponse.json({ error: 'Only manager or HR can generate packet' }, { status: 403 })
    }
    const metrics = await computeTimeMetrics(rec.employeeId, rec.startDate, new Date())
    const goals = await prisma.goal.findMany({
      where: { employeeId: rec.employeeId, createdAt: { lte: new Date() } },
      select: { status: true, achievement: true, weight: true },
    })
    let goalScore: number | null = null
    if (goals.length) {
      let w = 0, s = 0
      for (const g of goals) {
        const ww = (g.weight ?? 1) || 1
        let sc = 3
        if (g.status === 'COMPLETED') sc = 5
        else if (g.status === 'AT_RISK') sc = 2
        else if (g.status === 'NOT_STARTED') sc = 1
        else if (g.status === 'ON_TRACK' || g.status === 'IN_PROGRESS') {
          const pct = (g.achievement ?? 0) / 100
          sc = 2 + 3 * Math.max(0, Math.min(1, pct))
        }
        s += sc * ww; w += ww
      }
      goalScore = w > 0 ? Math.round((s / w) * 10) / 10 : null
    }
    const suggested =
      metrics.timeScore >= 4 && (goalScore == null ? metrics.timeScore >= 4.5 : goalScore >= 4) ? 'CONFIRM' :
      (metrics.timeScore < 2.5 || (goalScore != null && goalScore < 2.5)) ? 'TERMINATE' : 'EXTEND'

    const updated = await prisma.probationRecord.update({
      where: { id },
      data: {
        packetGeneratedAt: new Date(),
        packetDaysWorked: metrics.daysWorked,
        packetDaysAbsent: metrics.daysAbsent,
        packetLateCount: metrics.lateArrivalCount,
        packetAvgHours: metrics.avgHoursPerDay,
        packetGoalScore: goalScore,
        packetTimeScore: metrics.timeScore,
        packetSuggestedRec: suggested,
        status: 'UNDER_REVIEW',
      },
    })
    return NextResponse.json({ record: updated })
  }

  // ── MANAGER_REVIEW ── manager-of-employee OR HR
  if (action === 'MANAGER_REVIEW') {
    if (!isHR && !isManagerOfEmployee) {
      return NextResponse.json({ error: 'Only the assigned manager or HR can submit review' }, { status: 403 })
    }
    const rec2 = ['CONFIRM', 'EXTEND', 'TERMINATE']
    const recommendation = (body.recommendation ?? '').toString().toUpperCase()
    if (!rec2.includes(recommendation)) {
      return NextResponse.json({ error: 'recommendation must be CONFIRM | EXTEND | TERMINATE' }, { status: 400 })
    }
    const updated = await prisma.probationRecord.update({
      where: { id },
      data: {
        managerRecommendation: recommendation,
        managerReviewNotes: (body.notes ?? '').toString() || null,
        managerSubmittedAt: new Date(),
        status: 'UNDER_REVIEW',
      },
    })
    // Notify HR
    const hrUsers = await prisma.user.findMany({
      where: { role: 'HR_ADMIN' },
      select: { employee: { select: { id: true } } },
    })
    const ids = hrUsers.map((u) => u.employee?.id).filter(Boolean) as string[]
    await notifyMany(ids, {
      type: 'PROBATION_ALERT',
      title: 'Manager recommendation submitted',
      message: `${rec.employee.fullName}: manager recommends ${recommendation}.`,
      link: `/dashboard/probation/${id}`,
    })
    return NextResponse.json({ record: updated })
  }

  // ── HR_DECIDE ── HR only
  if (action === 'HR_DECIDE') {
    if (!isHR) return NextResponse.json({ error: 'HR only' }, { status: 403 })
    const decision = (body.decision ?? '').toString().toUpperCase()
    if (!['CONFIRM', 'EXTEND', 'WARNING', 'TERMINATE'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be CONFIRM | EXTEND | WARNING | TERMINATE' }, { status: 400 })
    }
    const extMonths = decision === 'EXTEND' ? Math.max(1, Math.min(12, Number(body.extensionMonths) || 1)) : null
    // Default meeting: +3 business days at 11am
    let meeting: Date | null = null
    if (body.meetingDate) {
      meeting = new Date(body.meetingDate)
    } else {
      const m = new Date()
      let added = 0
      while (added < 3) {
        m.setDate(m.getDate() + 1)
        const d = m.getDay()
        if (d !== 0 && d !== 6) added++
      }
      m.setHours(11, 0, 0, 0)
      meeting = m
    }
    const bump = body.salaryBump && Number(body.salaryBump.amount) > 0 ? {
      amount: Number(body.salaryBump.amount),
      effective: body.salaryBump.effective ? new Date(body.salaryBump.effective) : new Date(),
    } : null
    const overrode = rec.managerRecommendation != null && rec.managerRecommendation !== decision

    const updated = await prisma.probationRecord.update({
      where: { id },
      data: {
        hrDecision: decision,
        hrNotes: (body.notes ?? '').toString() || null,
        hrDecidedAt: new Date(),
        hrDecidedById: access.userId,
        extensionMonths: extMonths,
        meetingScheduledFor: meeting,
        meetingAgenda: body.agenda ?? null,
        overrodeManager: overrode,
        salaryBumpAmount: bump?.amount ?? null,
        salaryBumpEffective: bump?.effective ?? null,
      },
    })
    return NextResponse.json({ record: updated })
  }

  // ── ENACT ── HR only
  if (action === 'ENACT') {
    if (!isHR) return NextResponse.json({ error: 'HR only' }, { status: 403 })
    if (!rec.hrDecision) return NextResponse.json({ error: 'HR decision must be set first' }, { status: 400 })
    if (rec.outcomeEnactedAt) return NextResponse.json({ error: 'Already enacted' }, { status: 400 })
    await enactOutcome(rec.id, access.userId)
    const fresh = await loadRecord(id)
    return NextResponse.json({ record: fresh })
  }

  // ── ADJUST_DURATION ── HR only
  if (action === 'ADJUST_DURATION') {
    if (!isHR) return NextResponse.json({ error: 'HR only' }, { status: 403 })
    const newMonths = Math.max(1, Math.min(12, Number(body.newMonths) || 0))
    if (!newMonths) return NextResponse.json({ error: 'newMonths must be 1-12' }, { status: 400 })
    const newEnd = new Date(rec.startDate)
    newEnd.setMonth(newEnd.getMonth() + newMonths)
    const reason = (body.reason ?? '').toString().trim()
    if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 })

    const updated = await prisma.probationRecord.update({
      where: { id },
      data: {
        durationMonths: newMonths,
        endDate: newEnd,
        packetGeneratedAt: null,
        packetDaysWorked: null,
        packetDaysAbsent: null,
        packetLateCount: null,
        packetAvgHours: null,
        packetGoalScore: null,
        packetTimeScore: null,
        packetSuggestedRec: null,
        // Reset downstream stages since timeline shifted
        managerRecommendation: null,
        managerReviewNotes: null,
        managerSubmittedAt: null,
        hrNotes: `[Duration adjusted to ${newMonths} months: ${reason}]\n${rec.hrNotes ?? ''}`.slice(0, 4000),
        status: 'ACTIVE',
      },
    })
    await notify({
      employeeId: rec.employee.id,
      type: 'PROBATION_ALERT',
      title: 'Probation duration adjusted',
      message: `Your probation is now ${newMonths} months, ending ${newEnd.toLocaleDateString('en-GB')}. Reason: ${reason}`,
      link: `/dashboard/probation/${id}`,
    })
    if (rec.employee.reportingManagerId) {
      await notify({
        employeeId: rec.employee.reportingManagerId,
        type: 'PROBATION_ALERT',
        title: 'Team member probation duration adjusted',
        message: `${rec.employee.fullName}: now ${newMonths} months, ends ${newEnd.toLocaleDateString('en-GB')}.`,
        link: `/dashboard/probation/${id}`,
      })
    }
    return NextResponse.json({ record: updated })
  }

  // ── EARLY_DECISION ── HR only, skip packet stage
  if (action === 'EARLY_DECISION') {
    if (!isHR) return NextResponse.json({ error: 'HR only' }, { status: 403 })
    const decision = (body.decision ?? '').toString().toUpperCase()
    if (!['CONFIRM', 'EXTEND', 'WARNING', 'TERMINATE'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be CONFIRM | EXTEND | WARNING | TERMINATE' }, { status: 400 })
    }
    const reason = (body.reason ?? '').toString().trim()
    if (!reason) return NextResponse.json({ error: 'reason required for early decision' }, { status: 400 })
    if (rec.status !== 'ACTIVE' && rec.status !== 'UNDER_REVIEW') {
      return NextResponse.json({ error: `Cannot early-decide a ${rec.status} record` }, { status: 400 })
    }
    const extMonths = decision === 'EXTEND' ? Math.max(1, Math.min(12, Number(body.extensionMonths) || 1)) : null
    const bump = body.salaryBump && Number(body.salaryBump.amount) > 0 ? {
      amount: Number(body.salaryBump.amount),
      effective: body.salaryBump.effective ? new Date(body.salaryBump.effective) : new Date(),
    } : null
    await prisma.probationRecord.update({
      where: { id },
      data: {
        isEarlyDecision: true,
        earlyDecisionReason: reason,
        hrDecision: decision,
        hrDecidedAt: new Date(),
        hrDecidedById: access.userId,
        hrNotes: reason,
        extensionMonths: extMonths,
        salaryBumpAmount: bump?.amount ?? null,
        salaryBumpEffective: bump?.effective ?? null,
        overrodeManager: rec.managerRecommendation != null && rec.managerRecommendation !== decision,
      },
    })
    await enactOutcome(rec.id, access.userId)
    const fresh = await loadRecord(id)
    return NextResponse.json({ record: fresh })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
