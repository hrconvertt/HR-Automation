import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { parseLocalDate, dayKey } from '@/lib/date-utils'
import { countWorkingDays } from '@/lib/leave-days'
import { getStageOneApprover, isSeniorStaffRole, isCoFounderDesignation } from '@/lib/leave-approver'

// Day-counting math lives in @/lib/leave-days (shared with the preview
// endpoint so the form preview can never disagree with what's charged).

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
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

export async function GET(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? ''
  const employeeId = searchParams.get('employeeId') ?? ''

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  // Role scoping. Managers see their direct reports' requests AND any
  // requests where they've been assigned as stage-1 approver (covers the
  // Co-Founder seeing senior-staff routed leave).
  if (access.effectiveRole === 'EMPLOYEE' && access.employeeId) {
    // Employees still see anything routed to them as stage-1 approver
    // (e.g. CEO approving a Co-Founder's leave even if role is EXECUTIVE,
    // which already falls in the else-branch — this branch is the literal
    // EMPLOYEE role).
    where.OR = [
      { employeeId: access.employeeId },
      { stageOneApproverId: access.employeeId },
    ]
  } else if (access.effectiveRole === 'MANAGER' && access.employeeId) {
    where.OR = [
      { employeeId: access.employeeId },
      { employee: { reportingManagerId: access.employeeId } },
      { stageOneApproverId: access.employeeId },
    ]
  } else if (access.effectiveRole === 'EXECUTIVE' && access.employeeId) {
    // Executive (incl. Co-Founder + CEO) — full visibility plus their own inbox.
    if (employeeId) where.employeeId = employeeId
  } else if (employeeId) {
    // HR / Executive can filter to a specific employee if they want
    where.employeeId = employeeId
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      employee: {
        select: {
          fullName: true,
          employeeCode: true,
          designation: true,
          user: { select: { role: true } },
          position: { select: { level: true } },
        },
      },
    },
  })

  // â”€â”€ For PENDING + PENDING_HR requests, attach the requester's current
  //    balance for the leave type they're asking for â€” so approvers at
  //    either stage can decide without a second round-trip. Skipped for
  //    terminal statuses (saves payload).
  const pending = requests.filter((r) => r.status === 'PENDING' || r.status === 'PENDING_HR')
  let balanceLookup = new Map<string, { remaining: number; allocated: number; used: number }>()
  if (pending.length > 0) {
    const balances = await prisma.leaveBalance.findMany({
      where: {
        year: new Date().getFullYear(),
        OR: pending.map((r) => ({ employeeId: r.employeeId, leaveType: r.leaveType })),
      },
    })
    balanceLookup = new Map(
      balances.map((b) => [`${b.employeeId}::${b.leaveType}`, {
        remaining: b.remaining, allocated: b.allocated, used: b.used,
      }]),
    )
  }

  const decorated = requests.map((r) => {
    const requesterRole = r.employee.user?.role ?? null
    const requesterDesignation = r.employee.designation ?? null
    const requesterPositionLevel = r.employee.position?.level ?? null
    const senior =
      isSeniorStaffRole(requesterRole, requesterDesignation, requesterPositionLevel) ||
      isCoFounderDesignation(requesterDesignation)
    // Derived status label — keeps clients out of the senior-staff logic.
    let statusLabel: string
    if (r.status === 'PENDING') statusLabel = senior ? 'Awaiting Co-Founder' : 'Awaiting Manager'
    else if (r.status === 'PENDING_HR') statusLabel = 'Awaiting HR'
    else if (r.status === 'APPROVED') statusLabel = 'Approved'
    else if (r.status === 'REJECTED') statusLabel = 'Rejected'
    else if (r.status === 'CANCELLED') statusLabel = 'Cancelled'
    else statusLabel = r.status

    const bal =
      r.status === 'PENDING' || r.status === 'PENDING_HR'
        ? balanceLookup.get(`${r.employeeId}::${r.leaveType}`) ?? null
        : null

    return {
      ...r,
      statusLabel,
      requesterIsSenior: senior,
      requesterBalance: bal,
    }
  })

  return NextResponse.json({ requests: decorated })
}

export async function POST(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Block HR in preview mode (acting as another role)
  if (access.actualRole === 'HR_ADMIN' && access.effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to submit leave requests' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const {
      leaveType, startDate, endDate, reason,
      employeeId: bodyEmpId,
      firstDayHalf: rawFirstHalf, lastDayHalf: rawLastHalf,
      attachmentBase64, attachmentMime, attachmentName,
    } = body
    const firstDayHalf = !!rawFirstHalf
    const lastDayHalf = !!rawLastHalf

    // ── Validate attachment if provided ──
    let attachmentBytes: Buffer | null = null
    let safeMime: string | null = null
    let safeName: string | null = null
    if (attachmentBase64 && typeof attachmentBase64 === 'string') {
      const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
      if (typeof attachmentMime !== 'string' || !allowed.includes(attachmentMime.toLowerCase())) {
        return NextResponse.json({ error: 'Attachment must be PDF, JPG, or PNG.' }, { status: 400 })
      }
      try {
        attachmentBytes = Buffer.from(attachmentBase64, 'base64')
      } catch {
        return NextResponse.json({ error: 'Invalid attachment encoding.' }, { status: 400 })
      }
      if (attachmentBytes.length > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Attachment exceeds 5 MB.' }, { status: 400 })
      }
      safeMime = attachmentMime
      safeName = typeof attachmentName === 'string' ? attachmentName.slice(0, 240) : 'attachment'
    }

    if (!leaveType || !startDate || !endDate) {
      return NextResponse.json({ error: 'leaveType, startDate, and endDate are required' }, { status: 400 })
    }

    // â”€â”€ Authorisation: who is this leave FOR? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Only HR_ADMIN may submit a request on behalf of another employee.
    // Everyone else is locked to their own record regardless of body content.
    let empId: string
    if (bodyEmpId && bodyEmpId !== access.employeeId) {
      if (access.actualRole !== 'HR_ADMIN') {
        return NextResponse.json(
          { error: 'You can only submit leave for yourself.' },
          { status: 403 },
        )
      }
      empId = bodyEmpId
    } else {
      if (!access.employeeId) {
        return NextResponse.json({ error: 'No employee linked to this account' }, { status: 400 })
      }
      empId = access.employeeId
    }

    // Parse incoming "YYYY-MM-DD" as LOCAL midnight so day comparisons match
    // the rest of the app (holidays, calendar, attendance logs are all stored
    // as local-midnight DateTimes).
    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)

    if (end < start) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
    }

    // Half-day flags only make sense if they apply to actual day(s)
    if (lastDayHalf && start.toDateString() === end.toDateString() && firstDayHalf) {
      // Single-day with both flags doesn't double-shave (countWorkingDays already prevents that)
    }

    // â”€â”€ Overlap check: any existing pending/approved request for the same
    //    employee that intersects this date range â†’ refuse.
    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: empId,
        status: { in: ['PENDING', 'PENDING_HR', 'APPROVED'] },
        fromDate: { lte: end },
        toDate: { gte: start },
      },
      select: { id: true, fromDate: true, toDate: true, status: true, leaveType: true },
    })
    if (overlap) {
      const range = `${overlap.fromDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} â€“ ${overlap.toDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      return NextResponse.json({
        error: `You already have a ${overlap.status === 'APPROVED' ? 'approved' : 'pending'} ${overlap.leaveType} request covering ${range}. Cancel that first.`,
      }, { status: 400 })
    }

    // â”€â”€ Pull public holidays in the range â€” those days are free â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const holidays = await prisma.holiday.findMany({
      where: { type: 'PUBLIC', date: { gte: start, lte: end } },
      select: { date: true },
    })
    const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)))

    const totalDays = countWorkingDays(start, end, { firstDayHalf, lastDayHalf, holidayDates: holidayKeys })

    if (totalDays <= 0) {
      return NextResponse.json({
        error: 'Selected range has no chargeable days (weekends/holidays only).',
      }, { status: 400 })
    }

    // Check leave balance — for the year the leave STARTS in (matches the
    // year the approve endpoint deducts from), not the submission year.
    const balance = await prisma.leaveBalance.findFirst({
      where: {
        employeeId: empId,
        leaveType,
        year: start.getFullYear(),
      },
    })

    // Days already promised in OTHER pending requests of the same type count
    // against the balance too — otherwise two pending requests could each
    // pass the check individually but overdraw once both are approved.
    const otherPending = await prisma.leaveRequest.aggregate({
      where: {
        employeeId: empId,
        leaveType,
        status: { in: ['PENDING', 'PENDING_HR'] },
        fromDate: {
          gte: new Date(start.getFullYear(), 0, 1),
          lt: new Date(start.getFullYear() + 1, 0, 1),
        },
      },
      _sum: { days: true },
    })
    const pendingDays = otherPending._sum.days ?? 0

    if (balance && balance.remaining - pendingDays < totalDays) {
      return NextResponse.json({
        error: pendingDays > 0
          ? `Insufficient ${leaveType} balance. Available: ${balance.remaining} days, of which ${pendingDays} are already tied up in pending requests.`
          : `Insufficient ${leaveType} balance. Available: ${balance.remaining} days`,
      }, { status: 400 })
    }

    // ── Resolve the stage-1 approver (Co-Founder for seniors, manager
    //    for regulars, special cases for CEO/CF/HR). Stored on the row so
    //    the approve endpoint can authorise without re-running the logic.
    const stageOneApproverId = await getStageOneApprover(empId)

    // When there's no stage-1 approver (Co-Founder's own leave, or no
    // Co-Founder configured), skip straight to PENDING_HR so HR sees it
    // immediately. Otherwise normal two-stage: PENDING → PENDING_HR → APPROVED.
    const initialStatus = stageOneApproverId ? 'PENDING' : 'PENDING_HR'

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        employeeId: empId,
        leaveType,
        fromDate: start,
        toDate: end,
        days: totalDays,
        firstDayHalf,
        lastDayHalf,
        reason: reason ?? '',
        status: initialStatus,
        stageOneApproverId,
        attachmentBytes: attachmentBytes ? new Uint8Array(attachmentBytes) : undefined,
        attachmentMime: safeMime ?? undefined,
        attachmentName: safeName ?? undefined,
      },
    })

    // â”€â”€â”€ Notify approver(s) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Get the employee's manager (if any) and all HR users; notify them
    const emp = await prisma.employee.findUnique({
      where: { id: empId },
      select: {
        fullName: true,
        reportingManagerId: true,
      },
    })
    const dateRange = `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} â€“ ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    const message = `${emp?.fullName ?? 'An employee'} requested ${totalDays} day(s) of ${leaveType} (${dateRange})`

    // Notify the direct manager + all HR users â€” best-effort, parallel.
    // If one notification fails (e.g. DB hiccup), we DON'T fail the whole POST
    // because the leave request is already saved. Use allSettled and log
    // failures.
    const hrEmployees = await prisma.user.findMany({
      where: { role: 'HR_ADMIN', employee: { isNot: null } },
      select: { employee: { select: { id: true } } },
    })
    // Stage-1 approver replaces the default reportingManager notification —
    // for seniors that's the Co-Founder; for regulars it's still the
    // reportingManager (because getStageOneApprover returns it for them).
    const stageOneNotifyTarget = stageOneApproverId ?? emp?.reportingManagerId ?? null
    const notifyTargets = [
      ...(stageOneNotifyTarget ? [stageOneNotifyTarget] : []),
      ...hrEmployees
        .map((hr) => hr.employee?.id)
        .filter((eid): eid is string => !!eid && eid !== empId),
    ]
    const results = await Promise.allSettled(
      notifyTargets.map((eid) => notify({
        employeeId: eid,
        type: 'LEAVE_SUBMITTED',
        title: 'New leave request',
        message,
        link: `/dashboard/leave`,
      })),
    )
    const failures = results.filter((r) => r.status === 'rejected').length
    if (failures > 0) {
      console.warn(`[POST /api/leave] ${failures}/${notifyTargets.length} notifications failed for request ${leaveRequest.id}`)
    }

    return NextResponse.json({ leaveRequest }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/leave]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
