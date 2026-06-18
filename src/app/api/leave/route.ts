import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { parseLocalDate, dayKey, isSameDay } from '@/lib/date-utils'

/**
 * Count chargeable leave days between two dates (inclusive), applying:
 *   1. Weekend rule           â€” Sat/Sun skipped by default
 *   2. Sandwich rule          â€” if the same request brackets a weekend (covers
 *                               BOTH the preceding Friday AND following Monday),
 *                               the Sat+Sun in between count.
 *   3. Public-holiday rule    â€” days marked as `Holiday(type='PUBLIC')` are
 *                               always free (paid holiday â€” no balance deducted).
 *   4. Half-day flags         â€” firstDayHalf / lastDayHalf each subtract 0.5.
 *
 * Examples (chargeable days):
 *   - Mon â†’ Wed                     â†’ 3
 *   - Mon â†’ Fri (Wed is holiday)    â†’ 4
 *   - Fri only                      â†’ 1
 *   - Fri â†’ Mon  (sandwich)         â†’ 4  (Fri + Sat + Sun + Mon)
 *   - Mon â†’ Tue, firstDayHalf=true  â†’ 1.5
 *   - Mon â†’ Mon, firstDayHalf=true  â†’ 0.5  (single-day half)
 */
function countWorkingDays(
  start: Date,
  end: Date,
  opts: { firstDayHalf?: boolean; lastDayHalf?: boolean; holidayDates?: Set<string> } = {},
): number {
  const { firstDayHalf = false, lastDayHalf = false, holidayDates = new Set<string>() } = opts
  const s = new Date(start); s.setHours(0, 0, 0, 0)
  const e = new Date(end); e.setHours(23, 59, 59, 999)

  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const day = cur.getDay()
    const key = dayKey(cur)
    const isHoliday = holidayDates.has(key)
    if (isHoliday) {
      // Public holiday â€” always free, doesn't charge balance
    } else if (day !== 0 && day !== 6) {
      count++
    } else {
      // Sandwich check
      const friBefore = new Date(cur)
      const monAfter = new Date(cur)
      if (day === 6) {
        friBefore.setDate(cur.getDate() - 1)
        monAfter.setDate(cur.getDate() + 2)
      } else {
        friBefore.setDate(cur.getDate() - 2)
        monAfter.setDate(cur.getDate() + 1)
      }
      friBefore.setHours(0, 0, 0, 0)
      monAfter.setHours(0, 0, 0, 0)
      if (friBefore >= s && monAfter <= e) count++
    }
    cur.setDate(cur.getDate() + 1)
  }

  // Apply half-day reductions. Single-day request with either flag = 0.5 total.
  // Multi-day with firstDayHalf and/or lastDayHalf each shaves 0.5.
  if (count > 0) {
    const sameDay = isSameDay(start, end)

    if (firstDayHalf) count -= 0.5
    // For a single-day request, lastDayHalf alone (without firstDayHalf) should
    // still shave 0.5. We only skip the shave to prevent double-shaving the
    // same single day when BOTH flags are set.
    if (lastDayHalf && !(sameDay && firstDayHalf)) {
      count -= 0.5
    }
  }
  return Math.max(0, count)
}

// (was: isoKey â€” now provided by `dayKey` in @/lib/date-utils)

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
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

  // Role scoping
  if (access.effectiveRole === 'EMPLOYEE' && access.employeeId) {
    where.employeeId = access.employeeId
  } else if (access.effectiveRole === 'MANAGER' && access.employeeId) {
    where.OR = [
      { employeeId: access.employeeId },
      { employee: { reportingManagerId: access.employeeId } },
    ]
  } else if (employeeId) {
    // HR / Executive can filter to a specific employee if they want
    where.employeeId = employeeId
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      employee: { select: { fullName: true, employeeCode: true } },
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

  const withBalance = requests.map((r) => {
    if (r.status !== 'PENDING' && r.status !== 'PENDING_HR') return r
    const bal = balanceLookup.get(`${r.employeeId}::${r.leaveType}`)
    return { ...r, requesterBalance: bal ?? null }
  })

  return NextResponse.json({ requests: withBalance })
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
    } = body
    const firstDayHalf = !!rawFirstHalf
    const lastDayHalf = !!rawLastHalf

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

    // Check leave balance
    const balance = await prisma.leaveBalance.findFirst({
      where: {
        employeeId: empId,
        leaveType,
        year: new Date().getFullYear(),
      },
    })

    if (balance && balance.remaining < totalDays) {
      return NextResponse.json({ error: `Insufficient ${leaveType} balance. Available: ${balance.remaining} days` }, { status: 400 })
    }

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
        status: 'PENDING',
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
    const notifyTargets = [
      ...(emp?.reportingManagerId ? [emp.reportingManagerId] : []),
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
