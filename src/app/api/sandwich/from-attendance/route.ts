/**
 * POST /api/sandwich/from-attendance — rule on a Friday or Monday that only
 * exists as a mark on the attendance grid.
 *
 * The pending panel lists two kinds of day: leave requests, which go to
 * /api/leave/[id]/sandwich, and days marked L on the grid with no request
 * behind them, which had nowhere to go at all. Both buttons on those rows were
 * dead — `leaveId` is null for them, so `disabled={writing === pnd.leaveId}`
 * was true from first paint and the endpoint would have been
 * /api/leave/null/sandwich anyway.
 *
 * SandwichDeduction.leaveRequestId is nullable precisely so a deduction can be
 * raised without a request; this is the route that finally uses that.
 *
 *   POST body: { attendanceId: string, apply: boolean, note?, informed? }
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { dayKey } from '@/lib/date-utils'
import { assessSandwich, sandwichAmount } from '@/lib/sandwich'
import { fullMonthNetFor, buildWarning } from '@/lib/sandwich-server'

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({
    where: { id: payload.userId }, select: { id: true, role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Switch back to HR view to decide this' }, { status: 403 }) }
  }
  return { me }
}

export async function POST(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const attendanceId = typeof body.attendanceId === 'string' ? body.attendanceId : ''
  if (!attendanceId) {
    return NextResponse.json({ error: 'No attendance day given' }, { status: 400 })
  }
  const apply = body.apply !== false
  const note = body.note ? String(body.note).trim().slice(0, 1000) : null
  const informed = typeof body.informed === 'boolean' ? body.informed : undefined

  const att = await prisma.attendanceLog.findUnique({
    where: { id: attendanceId },
    select: {
      id: true, employeeId: true, date: true, status: true,
      employee: { select: { fullName: true, email: true, employeeCode: true } },
    },
  })
  if (!att) return NextResponse.json({ error: 'That attendance day no longer exists' }, { status: 404 })
  if (att.status !== 'LEAVE') {
    return NextResponse.json(
      { error: 'That day is no longer marked as leave, so there is nothing to charge' },
      { status: 409 },
    )
  }

  // If a request has appeared for the day since the list was drawn, the leave
  // route owns it — deciding here as well would charge the same absence twice.
  const covering = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: att.employeeId,
      status: 'APPROVED',
      fromDate: { lte: att.date },
      toDate: { gte: att.date },
    },
    select: { id: true },
  })
  if (covering) {
    return NextResponse.json(
      { error: 'A leave request now covers this day — reload and decide it there', leaveId: covering.id },
      { status: 409 },
    )
  }

  const holidays = await prisma.holiday.findMany({
    where: { date: att.date },
    select: { date: true },
  })
  const holidayDates = new Set(holidays.map((h) => dayKey(h.date)))

  const found = assessSandwich(att.date, att.date, { holidayDates })
  if (found.windows.length === 0) {
    return NextResponse.json(
      { error: 'That day does not fall on a Friday or a Monday' },
      { status: 409 },
    )
  }

  const triggerDate = new Date(`${found.windows[0].triggerDate}T00:00:00`)
  const month = triggerDate.getMonth() + 1
  const year = triggerDate.getFullYear()
  const fullMonthNet = await fullMonthNetFor(att.employeeId, year, month)
  const money = { ...sandwichAmount(fullMonthNet, year, month, found.days), fullMonthNet, month, year }

  const warning = buildWarning({
    fullName: att.employee.fullName,
    trigger: found.windows[0].trigger,
    triggerDate: found.windows[0].triggerDate,
    dates: found.dates,
    days: found.days,
    amount: money.amount,
    perDayAmount: money.perDay,
    divisorDays: money.divisor,
    month: money.month,
    year: money.year,
    // The grid records the day, not why it was taken.
    leaveType: null,
    informed,
    leaveFrom: dayKey(att.date),
    leaveTo: dayKey(att.date),
  })

  const data = {
    employeeId: att.employeeId,
    // No request behind this one — the grid mark is the whole record.
    leaveRequestId: null,
    trigger: found.windows[0].trigger,
    triggerDate,
    dates: JSON.stringify(found.dates),
    days: found.days,
    month: money.month,
    year: money.year,
    fullMonthNet: money.fullMonthNet,
    divisorDays: money.divisor,
    perDayAmount: money.perDay,
    amount: money.amount,
    status: apply ? 'APPLIED' : 'WAIVED',
    note,
    decidedById: auth.me!.id,
    decidedAt: new Date(),
    warningSubject: warning.subject,
    warningBody: warning.body,
  }

  const row = await prisma.sandwichDeduction.upsert({
    where: { employeeId_triggerDate: { employeeId: att.employeeId, triggerDate } },
    update: data,
    create: data,
  })

  return NextResponse.json({ ok: true, deduction: row })
}
