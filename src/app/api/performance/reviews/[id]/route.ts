import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { cycleWindow, computeTimeMetrics, suggestedOverallRating } from '@/lib/performance-metrics'

interface RouteParams { params: Promise<{ id: string }> }

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return null
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  return {
    actualRole: user.role,
    effectiveRole: previewRole ?? user.role,
    employeeId: user.employee?.id ?? null,
  }
}

// GET /api/performance/reviews/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const review = await prisma.performanceReview.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true, designation: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
          reportingManagerId: true,
        },
      },
      goals: true,
    },
  })
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Authorization: review owner, reviewing manager, HR, or Executive
  const isOwn = review.employeeId === access.employeeId
  const isMyTeamMember = review.employee.reportingManagerId === access.employeeId
  const isHR = access.effectiveRole === 'HR_ADMIN'
  const isExec = access.effectiveRole === 'EXECUTIVE'
  if (!isOwn && !isMyTeamMember && !isHR && !isExec) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ─── Confidentiality: scrub sensitive fields server-side ──────────────────
  // Manager evaluation is confidential to the employee until HR_FINALIZED.
  // HR finalization is confidential to everyone except HR until HR_FINALIZED.
  const isFinalized = review.status === 'HR_FINALIZED'
  const scrubbed = { ...review }

  // Hide manager-evaluation fields from employee until finalized
  if (isOwn && !isMyTeamMember && !isHR && !isFinalized) {
    scrubbed.managerRating = null
    scrubbed.teamworkScore = null
    scrubbed.ownershipScore = null
    scrubbed.communicationScore = null
    scrubbed.reliabilityScore = null
    scrubbed.behavioralAvg = null
    scrubbed.individualScore = null
    scrubbed.teamScore = null
    scrubbed.managerFeedback = null
  }
  // Hide HR-finalization fields from non-HR until finalized
  if (!isHR && !isFinalized) {
    scrubbed.overallRating = null
    scrubbed.finalCategory = null
  }
  // Executive viewing PRE-finalized: same as the rest — strip
  if (isExec && !isFinalized) {
    scrubbed.managerRating = null
    scrubbed.teamworkScore = null
    scrubbed.ownershipScore = null
    scrubbed.communicationScore = null
    scrubbed.reliabilityScore = null
    scrubbed.behavioralAvg = null
    scrubbed.individualScore = null
    scrubbed.teamScore = null
    scrubbed.managerFeedback = null
    scrubbed.overallRating = null
    scrubbed.finalCategory = null
  }

  // Suggested overall — only meaningful for HR (gates on un-scrubbed values).
  const suggestedOverall = isHR
    ? suggestedOverallRating({
        individualScore: review.individualScore,
        timeScore: review.timeScore,
        behavioralAvg: review.behavioralAvg,
      })
    : null

  return NextResponse.json({
    review: scrubbed,
    viewer: { isOwn, isMyTeamMember, isHR, isExec },
    suggestedOverall,
  })
}

// PATCH /api/performance/reviews/[id]
// Workflow stages:
//   1. Employee submits self-appraisal       → status PENDING → SELF_SUBMITTED
//   2. Manager submits evaluation            → status SELF_SUBMITTED → MANAGER_REVIEWED
//   3. HR finalizes                          → status MANAGER_REVIEWED → HR_FINALIZED
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const review = await prisma.performanceReview.findUnique({
    where: { id },
    include: { employee: { select: { reportingManagerId: true } } },
  })
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwn = review.employeeId === access.employeeId
  const isMyTeamMember = review.employee.reportingManagerId === access.employeeId
  const isHR = access.effectiveRole === 'HR_ADMIN'

  const action = body.action as 'SUBMIT_SELF' | 'SUBMIT_MANAGER' | 'FINALIZE' | 'SAVE_DRAFT' | undefined
  const data: Record<string, unknown> = {}

  if (action === 'SUBMIT_SELF' || (action === 'SAVE_DRAFT' && isOwn)) {
    if (!isOwn) return NextResponse.json({ error: 'Only the employee can self-appraise' }, { status: 403 })
    if (review.status !== 'PENDING' && action !== 'SAVE_DRAFT') {
      return NextResponse.json({ error: 'Self-appraisal already submitted' }, { status: 400 })
    }

    // Self-appraisal fields
    if (body.selfRating !== undefined) data.selfRating = Number(body.selfRating)
    if (body.achievements !== undefined) data.achievements = body.achievements
    if (body.learnings !== undefined) data.learnings = body.learnings
    if (body.teamContribution !== undefined) data.teamContribution = body.teamContribution

    // Update linked goal achievements + self-comments
    if (Array.isArray(body.goals)) {
      for (const g of body.goals) {
        if (!g.id) continue
        await prisma.goal.update({
          where: { id: g.id },
          data: {
            achievement: g.achievement != null ? Number(g.achievement) : undefined,
            selfComment: g.selfComment ?? undefined,
          },
        })
      }
    }

    if (action === 'SUBMIT_SELF') data.status = 'SELF_SUBMITTED'
  }
  else if (action === 'SUBMIT_MANAGER' || (action === 'SAVE_DRAFT' && isMyTeamMember)) {
    if (!isMyTeamMember && !isHR) return NextResponse.json({ error: 'Only the manager (or HR) can review' }, { status: 403 })
    if (review.status === 'PENDING' && action === 'SUBMIT_MANAGER') {
      return NextResponse.json({ error: 'Employee has not submitted self-appraisal yet' }, { status: 400 })
    }
    if (review.status === 'HR_FINALIZED') {
      return NextResponse.json({ error: 'Review already finalized' }, { status: 400 })
    }

    // Manager fields
    if (body.managerRating !== undefined) data.managerRating = Number(body.managerRating)
    if (body.teamworkScore !== undefined) data.teamworkScore = Number(body.teamworkScore)
    if (body.ownershipScore !== undefined) data.ownershipScore = Number(body.ownershipScore)
    if (body.communicationScore !== undefined) data.communicationScore = Number(body.communicationScore)
    if (body.reliabilityScore !== undefined) data.reliabilityScore = Number(body.reliabilityScore)
    if (body.individualScore !== undefined) data.individualScore = Number(body.individualScore)
    if (body.teamScore !== undefined) data.teamScore = Number(body.teamScore)
    if (body.managerFeedback !== undefined) data.managerFeedback = body.managerFeedback

    // Auto-compute behavioralAvg
    const t = body.teamworkScore ?? review.teamworkScore
    const o = body.ownershipScore ?? review.ownershipScore
    const c = body.communicationScore ?? review.communicationScore
    const r = body.reliabilityScore ?? review.reliabilityScore
    if (t != null && o != null && c != null && r != null) {
      data.behavioralAvg = Math.round(((Number(t)+Number(o)+Number(c)+Number(r))/4) * 100) / 100
    }

    // Update goals with manager comments + auto-compute individual score
    if (Array.isArray(body.goals)) {
      for (const g of body.goals) {
        if (!g.id) continue
        await prisma.goal.update({
          where: { id: g.id },
          data: {
            managerComment: g.managerComment ?? undefined,
            // If manager overrides the achievement, use it; otherwise keep employee's self-rating
            ...(g.managerAchievement != null ? { achievement: Number(g.managerAchievement) } : {}),
          },
        })
      }

      // Auto-compute individual score: weighted average of goal achievements → 1-5 scale
      const linkedGoals = await prisma.goal.findMany({ where: { reviewId: id } })
      if (linkedGoals.length > 0) {
        let weightedSum = 0
        let totalWeight = 0
        for (const lg of linkedGoals) {
          const ach = lg.achievement ?? 0
          const wt = lg.weight ?? 0
          if (wt > 0) {
            weightedSum += ach * wt
            totalWeight += wt
          }
        }
        if (totalWeight > 0) {
          const weightedPct = weightedSum / totalWeight   // 0–100
          // Map 0–100% → 1–5 scale (linear)
          data.individualScore = Math.round((1 + (weightedPct / 100) * 4) * 100) / 100
        }
      }
    }

    // ─── Re-compute Time & Work metrics fresh on manager submit ───
    // Attendance / leave / goals may have shifted since the cycle was opened,
    // so we always pull current numbers when the manager submits.
    if (action === 'SUBMIT_MANAGER') {
      const window =
        review.cycleStartDate && review.cycleEndDate
          ? { start: review.cycleStartDate, end: review.cycleEndDate }
          : cycleWindow(review.reviewType, review.reviewPeriod)
      if (window) {
        try {
          const m = await computeTimeMetrics(review.employeeId, window.start, window.end)
          data.cycleStartDate = window.start
          data.cycleEndDate = window.end
          data.daysWorked = m.daysWorked
          data.daysAbsent = m.daysAbsent
          data.daysOnLeave = m.daysOnLeave
          data.lateArrivalCount = m.lateArrivalCount
          data.avgHoursPerDay = m.avgHoursPerDay
          data.goalsOnTime = m.goalsOnTime
          data.goalsLate = m.goalsLate
          data.timeScore = m.timeScore
        } catch {
          // non-fatal — leave existing metrics in place
        }
      }
      data.status = 'MANAGER_REVIEWED'
    }
  }
  else if (action === 'FINALIZE') {
    if (!isHR) return NextResponse.json({ error: 'Only HR can finalize' }, { status: 403 })
    if (review.status !== 'MANAGER_REVIEWED' && review.status !== 'SELF_SUBMITTED') {
      return NextResponse.json({ error: 'Cannot finalize — manager review not complete' }, { status: 400 })
    }

    if (body.overallRating !== undefined) data.overallRating = Number(body.overallRating)
    if (body.finalCategory !== undefined) data.finalCategory = body.finalCategory
    if (body.managerFeedback !== undefined) data.managerFeedback = body.managerFeedback
    data.status = 'HR_FINALIZED'
  }
  else {
    return NextResponse.json({ error: 'Invalid or missing action' }, { status: 400 })
  }

  const updated = await prisma.performanceReview.update({ where: { id }, data })

  // ─── Notification triggers based on stage transition ─────────────────────
  // Resolve employee + manager + HR for messaging
  if (data.status === 'SELF_SUBMITTED' && review.employee.reportingManagerId) {
    // Notify the manager
    const emp = await prisma.employee.findUnique({
      where: { id: review.employeeId },
      select: { fullName: true },
    })
    await notify({
      employeeId: review.employee.reportingManagerId,
      type: 'REVIEW_SELF_SUBMITTED',
      title: '📝 Self-appraisal submitted',
      message: `${emp?.fullName ?? 'An employee'} submitted their self-appraisal — your review is needed.`,
      link: `/dashboard/performance/${id}`,
    })
  }
  if (data.status === 'MANAGER_REVIEWED') {
    // Notify all HR
    const hrEmps = await prisma.user.findMany({
      where: { role: 'HR_ADMIN', employee: { isNot: null } },
      select: { employee: { select: { id: true } } },
    })
    const emp = await prisma.employee.findUnique({
      where: { id: review.employeeId },
      select: { fullName: true },
    })
    for (const hr of hrEmps) {
      if (hr.employee) {
        await notify({
          employeeId: hr.employee.id,
          type: 'REVIEW_MGR_SUBMITTED',
          title: '📝 Manager review submitted',
          message: `Review for ${emp?.fullName ?? 'an employee'} is ready for your finalization.`,
          link: `/dashboard/performance/${id}`,
        })
      }
    }
  }
  if (data.status === 'HR_FINALIZED') {
    // Notify the employee
    await notify({
      employeeId: review.employeeId,
      type: 'REVIEW_FINALIZED',
      title: '🎉 Review finalized',
      message: 'Your performance review has been released — view your final rating and feedback.',
      link: `/dashboard/performance/${id}`,
    })
  }

  // Compute suggested overall (blend of work + time + behavioral) for HR UI
  const suggestedOverall = suggestedOverallRating({
    individualScore: updated.individualScore,
    timeScore: updated.timeScore,
    behavioralAvg: updated.behavioralAvg,
  })

  return NextResponse.json({ review: updated, suggestedOverall })
}
