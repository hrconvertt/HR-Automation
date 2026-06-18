import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notifyMany } from '@/lib/notifications'
import { cycleWindow, computeTimeMetrics } from '@/lib/performance-metrics'

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      employee: { select: { id: true, fullName: true } },
      userRoles: { select: { role: true } },
    },
  })
  if (!user) return null
  const roles = user.userRoles.length > 0
    ? user.userRoles.map((r) => r.role)
    : [user.role]
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole =
    previewRole && roles.includes(previewRole) ? previewRole : user.role
  return {
    actualRole: user.role,
    roles,
    effectiveRole,
    employeeId: user.employee?.id ?? null,
    userName: user.employee?.fullName ?? user.email,
  }
}

// GET /api/performance/reviews
// Role-scoped list of performance reviews
// Optional: ?reviewPeriod=Q2-2026 to filter by cycle
export async function GET(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('reviewPeriod') ?? ''

  let where: object = {}
  if (access.effectiveRole === 'EMPLOYEE') {
    where = { employeeId: access.employeeId }
  } else if (access.effectiveRole === 'MANAGER' && access.employeeId) {
    where = {
      OR: [
        { employeeId: access.employeeId },
        { employee: { reportingManagerId: access.employeeId } },
      ],
    }
  }
  if (period) where = { ...where, reviewPeriod: period }

  const reviews = await prisma.performanceReview.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true,
          department: { select: { name: true } },
          reportingManager: { select: { fullName: true } },
          reportingManagerId: true,
        },
      },
      goals: true,
    },
    orderBy: [{ reviewPeriod: 'desc' }, { createdAt: 'desc' }],
  })

  // Scrub confidential fields in list view (same rules as detail GET)
  const isHR = access.effectiveRole === 'HR_ADMIN'
  const isExec = access.effectiveRole === 'EXECUTIVE'

  const scrubbed = reviews.map((r) => {
    const isOwn = r.employeeId === access.employeeId
    const isMyTeamMember = r.employee.reportingManagerId === access.employeeId
    const isFinalized = r.status === 'HR_FINALIZED'
    const copy: typeof r = { ...r }

    if (isOwn && !isMyTeamMember && !isHR && !isFinalized) {
      copy.managerRating = null
      copy.teamworkScore = null
      copy.ownershipScore = null
      copy.communicationScore = null
      copy.reliabilityScore = null
      copy.behavioralAvg = null
      copy.individualScore = null
      copy.teamScore = null
      copy.managerFeedback = null
    }
    if (!isHR && !isFinalized) {
      copy.overallRating = null
      copy.finalCategory = null
    }
    if (isExec && !isFinalized) {
      copy.managerRating = null
      copy.teamworkScore = null
      copy.ownershipScore = null
      copy.communicationScore = null
      copy.reliabilityScore = null
      copy.behavioralAvg = null
      copy.individualScore = null
      copy.teamScore = null
      copy.managerFeedback = null
      copy.overallRating = null
      copy.finalCategory = null
    }
    return copy
  })

  return NextResponse.json({ reviews: scrubbed })
}

// POST /api/performance/reviews
// HR opens a review cycle â€” auto-creates a PerformanceReview row for every active employee
// body: { reviewPeriod: "H1-2026", reviewType: "BIANNUAL" }
export async function POST(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.roles.includes('HR_ADMIN')) {
    return NextResponse.json({ error: 'Only HR can open review cycles' }, { status: 403 })
  }

  // Block if HR is previewing as another role
  if (access.effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to open a cycle' }, { status: 403 })
  }

  const body = await request.json()
  const { reviewPeriod, reviewType } = body

  if (!reviewPeriod || !reviewType) {
    return NextResponse.json({ error: 'reviewPeriod and reviewType required' }, { status: 400 })
  }

  // Convertt only runs Biannual + Annual (Probation is a separate flow for new joiners).
  // MONTHLY_11 / QUARTERLY kept in the valid list so historical rows still pass guards if any exist.
  const validTypes = ['BIANNUAL', 'ANNUAL', 'PROBATION', 'MONTHLY_11', 'QUARTERLY']
  if (!validTypes.includes(reviewType)) {
    return NextResponse.json({ error: 'Invalid reviewType' }, { status: 400 })
  }

  // Check if this cycle already exists
  const existing = await prisma.performanceReview.findFirst({
    where: { reviewPeriod, reviewType },
  })
  if (existing) {
    return NextResponse.json({ error: `A ${reviewType} review for ${reviewPeriod} already exists` }, { status: 409 })
  }

  // Get all active employees
  const activeEmployees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, reportingManagerId: true },
  })

  // â”€â”€â”€ Compute cycle window for Time & Work metrics â”€â”€â”€
  // Returns null for legacy types (MONTHLY_11, QUARTERLY) â€” metrics stay null.
  const window = cycleWindow(reviewType, reviewPeriod)

  // Create draft reviews for each + link their open goals
  let created = 0
  let goalsLinked = 0
  for (const emp of activeEmployees) {
    // Time & Work metrics â€” only when we have a valid window
    let metrics: Awaited<ReturnType<typeof computeTimeMetrics>> | null = null
    if (window) {
      try {
        metrics = await computeTimeMetrics(emp.id, window.start, window.end)
      } catch {
        // Don't block cycle open if a single employee's metrics fail
        metrics = null
      }
    }

    const review = await prisma.performanceReview.create({
      data: {
        employeeId: emp.id,
        reviewerId: emp.reportingManagerId ?? null,
        reviewPeriod,
        reviewType,
        status: 'PENDING',
        cycleStartDate: window?.start ?? null,
        cycleEndDate: window?.end ?? null,
        daysWorked: metrics?.daysWorked ?? null,
        daysAbsent: metrics?.daysAbsent ?? null,
        daysOnLeave: metrics?.daysOnLeave ?? null,
        lateArrivalCount: metrics?.lateArrivalCount ?? null,
        avgHoursPerDay: metrics?.avgHoursPerDay ?? null,
        goalsOnTime: metrics?.goalsOnTime ?? null,
        goalsLate: metrics?.goalsLate ?? null,
        timeScore: metrics?.timeScore ?? null,
      },
    })

    // Link any open goals (not yet attached to a review) to this new review
    const linked = await prisma.goal.updateMany({
      where: {
        employeeId: emp.id,
        reviewId: null,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'ON_TRACK', 'AT_RISK', 'COMPLETED'] },
      },
      data: { reviewId: review.id },
    })
    goalsLinked += linked.count

    created++
  }

  // Notify every active employee that their review is due
  await notifyMany(activeEmployees.map((e) => e.id), {
    type: 'REVIEW_SELF_DUE',
    title: `ðŸ“ ${reviewType.replace('_', ' ')} review opened â€” ${reviewPeriod}`,
    message: 'Your self-appraisal is due. Open the Performance module to complete it.',
    link: '/dashboard/performance',
  })

  return NextResponse.json({
    success: true,
    cycleOpened: `${reviewType} ${reviewPeriod}`,
    reviewsCreated: created,
    goalsLinked,
  }, { status: 201 })
}
