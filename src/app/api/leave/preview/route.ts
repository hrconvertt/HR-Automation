/**
 * GET /api/leave/preview
 *
 * Attendance-impact preview for a leave request — the single source both the
 * request form (before submitting) and approvers (before approving) use to
 * see exactly which days will be charged / marked L / HD.
 *
 * Two modes:
 *   ?start=YYYY-MM-DD&end=YYYY-MM-DD[&firstDayHalf=1][&lastDayHalf=1][&leaveType=CASUAL]
 *       Form mode — previews the caller's OWN prospective request.
 *       Returns chargeable days, per-day marks, overlap warning, balance after.
 *
 *   ?leaveId=<id>
 *       Approver mode — previews a stored request. Allowed for HR_ADMIN,
 *       the assigned stage-1 approver, and the requester themself.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { parseLocalDate, dayKey } from '@/lib/date-utils'
import { countWorkingDays, buildLeaveDayMarks } from '@/lib/leave-days'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = user?.employee?.id ?? null

  const { searchParams } = new URL(request.url)
  const leaveId = searchParams.get('leaveId')

  let empId: string
  let start: Date
  let end: Date
  let firstDayHalf: boolean
  let lastDayHalf: boolean
  let leaveType: string | null
  let excludeRequestId: string | null = null

  if (leaveId) {
    const req = await prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: {
        id: true, employeeId: true, fromDate: true, toDate: true,
        firstDayHalf: true, lastDayHalf: true, leaveType: true,
        stageOneApproverId: true,
        employee: { select: { reportingManagerId: true } },
      },
    })
    if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const stageOne = req.stageOneApproverId ?? req.employee.reportingManagerId
    const allowed =
      payload.role === 'HR_ADMIN' ||
      payload.role === 'EXECUTIVE' ||
      (!!myEmpId && (myEmpId === req.employeeId || myEmpId === stageOne)) ||
      (payload.role === 'MANAGER' && !!myEmpId && myEmpId === req.employee.reportingManagerId)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    empId = req.employeeId
    start = req.fromDate
    end = req.toDate
    firstDayHalf = req.firstDayHalf
    lastDayHalf = req.lastDayHalf
    leaveType = req.leaveType
    excludeRequestId = req.id
  } else {
    // Form mode — own request only
    if (!myEmpId) return NextResponse.json({ error: 'No employee linked to this account' }, { status: 400 })
    const startStr = searchParams.get('start')
    const endStr = searchParams.get('end')
    if (!startStr || !endStr) {
      return NextResponse.json({ error: 'start and end are required' }, { status: 400 })
    }
    empId = myEmpId
    start = parseLocalDate(startStr)
    end = parseLocalDate(endStr)
    firstDayHalf = searchParams.get('firstDayHalf') === '1' || searchParams.get('firstDayHalf') === 'true'
    lastDayHalf = searchParams.get('lastDayHalf') === '1' || searchParams.get('lastDayHalf') === 'true'
    leaveType = searchParams.get('leaveType')
  }

  if (end < start) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
  }
  // Guard against pathological ranges
  if ((end.getTime() - start.getTime()) / 86_400_000 > 200) {
    return NextResponse.json({ error: 'Range too large' }, { status: 400 })
  }

  const holidays = await prisma.holiday.findMany({
    where: { type: 'PUBLIC', date: { gte: start, lte: end } },
    select: { date: true, name: true },
  })
  const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)))

  const opts = { firstDayHalf, lastDayHalf, holidayDates: holidayKeys }
  const chargeableDays = countWorkingDays(start, end, opts)
  const dayMarks = buildLeaveDayMarks(start, end, opts)

  // ── Overlap warning (form mode: any other pending/approved intersecting) ──
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: empId,
      status: { in: ['PENDING', 'PENDING_HR', 'APPROVED'] },
      fromDate: { lte: end },
      toDate: { gte: start },
      ...(excludeRequestId ? { NOT: { id: excludeRequestId } } : {}),
    },
    select: { fromDate: true, toDate: true, status: true, leaveType: true },
  })

  // ── Balance for the leave type (year the leave starts in) ──────────────
  let balance: { allocated: number; used: number; remaining: number; afterApproval: number } | null = null
  if (leaveType) {
    const b = await prisma.leaveBalance.findFirst({
      where: { employeeId: empId, leaveType, year: start.getFullYear() },
    })
    if (b) {
      balance = {
        allocated: b.allocated,
        used: b.used,
        remaining: b.remaining,
        afterApproval: Math.round((b.remaining - chargeableDays) * 10) / 10,
      }
    }
  }

  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return NextResponse.json({
    chargeableDays,
    dayMarks,
    holidays: holidays.map((h) => ({ date: dayKey(h.date), name: h.name })),
    overlap: overlap
      ? {
          leaveType: overlap.leaveType,
          status: overlap.status,
          range: `${fmt(overlap.fromDate)} – ${fmt(overlap.toDate)}`,
        }
      : null,
    balance,
  })
}
