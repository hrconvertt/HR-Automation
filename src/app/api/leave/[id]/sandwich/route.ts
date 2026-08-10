/**
 * GET  /api/leave/[id]/sandwich — what the rule would cost on this record.
 * POST /api/leave/[id]/sandwich — apply it, or waive it.
 *
 * The rule only fires because HR says the absence came without notice, so the
 * GET is a question and the POST is the answer. Applying twice for the same
 * Friday updates the row rather than charging it again.
 *
 *   POST body: { apply: boolean, note?: string, informed?: boolean }
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { dayKey } from '@/lib/date-utils'
import { assessSandwich, sandwichAmount, isSandwichExempt, exemptionReason } from '@/lib/sandwich'
import { fullMonthNetFor, buildWarning } from '@/lib/sandwich-server'

interface RouteParams { params: Promise<{ id: string }> }

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

/** The leave, the windows it opens, and what each would cost. */
async function assess(leaveId: string) {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
    select: {
      id: true, employeeId: true, fromDate: true, toDate: true,
      leaveType: true, category: true, status: true,
      employee: { select: { fullName: true, email: true, employeeCode: true } },
    },
  })
  if (!leave) return null

  // A public holiday is not a leave day, so it cannot trigger the rule.
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: leave.fromDate, lte: leave.toDate } },
    select: { date: true },
  })
  const holidayDates = new Set(holidays.map((h) => dayKey(h.date)))

  const found = assessSandwich(leave.fromDate, leave.toDate, { holidayDates })
  if (found.windows.length === 0) return { leave, found, money: null }

  // The trigger day decides which payroll month wears it.
  const triggerDate = new Date(`${found.windows[0].triggerDate}T00:00:00`)
  const month = triggerDate.getMonth() + 1
  const year = triggerDate.getFullYear()

  const fullMonthNet = await fullMonthNetFor(leave.employeeId, year, month)
  const money = {
    ...sandwichAmount(fullMonthNet, year, month, found.days),
    fullMonthNet, month, year,
  }
  return { leave, found, money }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error } = await gateHR(request)
  if (error) return error
  const { id } = await params

  const a = await assess(id)
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = await prisma.sandwichDeduction.findFirst({
    where: { leaveRequestId: id },
    select: { id: true, status: true, days: true, amount: true, note: true, warningSentAt: true },
  })

  return NextResponse.json({
    applies: a.found.windows.length > 0,
    windows: a.found.windows,
    dates: a.found.dates,
    days: a.found.days,
    money: a.money,
    existing,
    employee: a.leave.employee,
    leaveType: a.leave.leaveType,
    // A Friday still opens a window on a sick leave — HR can still charge one
    // where the illness turned up after the fact — but the answer defaults to
    // no and the dialog says why.
    exempt: isSandwichExempt(a.leave.leaveType),
    exemptReason: exemptionReason(a.leave.leaveType),
  })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const apply = body.apply !== false
  const note = body.note ? String(body.note).trim().slice(0, 1000) : null
  const informed = typeof body.informed === 'boolean' ? body.informed : undefined

  const a = await assess(id)
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (a.found.windows.length === 0 || !a.money) {
    return NextResponse.json(
      { error: 'This leave does not fall on a Friday or a Monday' },
      { status: 409 },
    )
  }

  const { leave, found, money } = a
  const triggerDate = new Date(`${found.windows[0].triggerDate}T00:00:00`)
  const warning = buildWarning({
    fullName: leave.employee.fullName,
    trigger: found.windows[0].trigger,
    triggerDate: found.windows[0].triggerDate,
    dates: found.dates,
    days: found.days,
    amount: money.amount,
    perDayAmount: money.perDay,
    divisorDays: money.divisor,
    month: money.month,
    year: money.year,
    leaveType: leave.leaveType,
    informed,
  })

  const data = {
    employeeId: leave.employeeId,
    leaveRequestId: leave.id,
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
    where: { employeeId_triggerDate: { employeeId: leave.employeeId, triggerDate } },
    update: data,
    create: data,
  })

  return NextResponse.json({ ok: true, deduction: row })
}
