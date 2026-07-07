/**
 * Attendance correction requests (employee-initiated, HR-approved).
 *
 * POST /api/attendance/corrections
 *   Employee requests a correction for one of THEIR OWN past days.
 *   Self-only is server-enforced: the target employee is always the caller's
 *   own employee record — no employeeId is accepted from the body.
 *   Guards:
 *     - date must be a valid past/current day (no future corrections)
 *     - requestedStatus ∈ PRESENT | WFH | HALF_DAY | LEAVE
 *     - month's REGULAR payroll run must not be PAID/closed
 *     - no duplicate PENDING request for the same day
 *
 * GET /api/attendance/corrections
 *   HR_ADMIN (effective role) — all requests, ?status= filter (default PENDING)
 *   everyone else             — their own requests only
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { parseLocalDate, dayKey, endOfDay } from '@/lib/date-utils'

const REQUESTABLE = ['PRESENT', 'WFH', 'HALF_DAY', 'LEAVE'] as const
type RequestedStatus = (typeof REQUESTABLE)[number]

// Statuses that mean "this month's REGULAR payroll is done" — PAID is the
// active flow's terminal state; LOCKED/DISBURSED/CLOSED are legacy terminal
// states still present on historical rows (see PayrollRun in schema.prisma).
const PAYROLL_CLOSED_STATUSES = ['PAID', 'LOCKED', 'DISBURSED', 'CLOSED']

async function getSession(request: NextRequest) {
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
  return { user, effectiveRole: previewRole ?? user.role }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, effectiveRole } = session

  const { searchParams } = new URL(request.url)
  const statusFilter = (searchParams.get('status') ?? 'PENDING').toUpperCase()

  const where: Record<string, unknown> =
    effectiveRole === 'HR_ADMIN'
      ? statusFilter === 'ALL'
        ? {}
        : { status: statusFilter }
      : { employeeId: user.employee?.id ?? '__none__' }

  const corrections = await prisma.attendanceCorrection.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      employee: {
        select: { id: true, fullName: true, department: { select: { name: true } } },
      },
    },
  })

  return NextResponse.json({
    corrections: corrections.map((c) => ({
      id: c.id,
      employeeId: c.employeeId,
      employeeName: c.employee.fullName,
      department: c.employee.department?.name ?? '—',
      date: dayKey(c.date),
      currentStatus: c.currentStatus,
      requestedStatus: c.requestedStatus,
      reason: c.reason,
      status: c.status,
      reviewComment: c.reviewComment,
      createdAt: c.createdAt.toISOString(),
    })),
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user } = session

  // Preview mode is read-only: an HR admin previewing as another role must
  // not create real correction requests while exploring that experience.
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json(
      { error: 'Switch back to your HR view to submit a correction request' },
      { status: 403 },
    )
  }

  // Self-only: the correction always targets the caller's OWN employee record.
  const myEmpId = user.employee?.id
  if (!myEmpId) {
    return NextResponse.json({ error: 'No employee record linked to your account' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as {
    date?: string
    requestedStatus?: string
    reason?: string
  } | null

  if (!body?.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }
  const date = parseLocalDate(body.date)
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (date > today) {
    return NextResponse.json({ error: 'Cannot request a correction for a future day' }, { status: 400 })
  }
  if (!body.requestedStatus || !REQUESTABLE.includes(body.requestedStatus as RequestedStatus)) {
    return NextResponse.json(
      { error: 'requestedStatus must be one of PRESENT | WFH | HALF_DAY | LEAVE' },
      { status: 400 },
    )
  }
  const reason = (body.reason ?? '').trim().slice(0, 1000)
  if (!reason) {
    return NextResponse.json({ error: 'A reason is required' }, { status: 400 })
  }

  // Guard: month's REGULAR payroll must not be closed.
  const closedRun = await prisma.payrollRun.findFirst({
    where: {
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      runType: 'REGULAR',
      status: { in: PAYROLL_CLOSED_STATUSES },
    },
    select: { id: true },
  })
  if (closedRun) {
    return NextResponse.json({ error: "This month's payroll is closed" }, { status: 409 })
  }

  // Guard: no duplicate pending request for the same day.
  const dup = await prisma.attendanceCorrection.findFirst({
    where: { employeeId: myEmpId, date, status: 'PENDING' },
    select: { id: true },
  })
  if (dup) {
    return NextResponse.json(
      { error: 'You already have a pending correction request for this day' },
      { status: 409 },
    )
  }

  // Snapshot what the grid showed at request time (same derivation the grid
  // uses: explicit log first, then approved leave, else A / WE).
  // Match the log by day RANGE, not exact equality — different write paths
  // store the day's DateTime at local vs UTC midnight.
  const [log, leave] = await Promise.all([
    prisma.attendanceLog.findFirst({
      where: { employeeId: myEmpId, date: { gte: date, lte: endOfDay(date) } },
      select: { status: true, workType: true },
    }),
    prisma.leaveRequest.findFirst({
      where: { employeeId: myEmpId, status: 'APPROVED', fromDate: { lte: date }, toDate: { gte: date } },
      select: { fromDate: true, toDate: true, firstDayHalf: true, lastDayHalf: true },
    }),
  ])
  const dow = date.getDay()
  const isWeekend = dow === 0 || dow === 6
  let currentStatus = isWeekend ? 'WE' : 'A'
  const halfDay =
    !!leave &&
    ((dayKey(leave.fromDate) === dayKey(date) && leave.firstDayHalf) ||
      (dayKey(leave.toDate) === dayKey(date) && leave.lastDayHalf))
  if (log) {
    if (log.status === 'LEAVE') currentStatus = halfDay ? 'H' : 'L'
    else if (log.status === 'HALF_DAY') currentStatus = 'H'
    else if (log.status === 'PRESENT' || log.status === 'LATE') currentStatus = log.workType === 'WFH' ? 'WFH' : 'P'
    else if (log.status === 'WEEKEND' || log.status === 'HOLIDAY') currentStatus = 'WE'
    else currentStatus = 'A'
  } else if (!isWeekend && leave) {
    currentStatus = halfDay ? 'H' : 'L'
  }

  const created = await prisma.attendanceCorrection.create({
    data: {
      employeeId: myEmpId,
      date,
      currentStatus,
      requestedStatus: body.requestedStatus,
      reason,
    },
  })

  return NextResponse.json({
    ok: true,
    correction: {
      id: created.id,
      date: body.date,
      currentStatus,
      requestedStatus: created.requestedStatus,
      status: created.status,
    },
  })
}
