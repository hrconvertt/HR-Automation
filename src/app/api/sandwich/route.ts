/**
 * GET /api/sandwich — every sandwich deduction on record.
 *
 * Optional ?month= &year= to scope to one payroll month.
 *
 * HR and executives. A deduction is somebody's pay, so this is not a list
 * managers get to browse.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { assessSandwich, isSandwichExempt, exemptionReason } from '@/lib/sandwich'
import { interimEnabled } from '@/lib/interim-flags'

/** Beyond this many days it is a planned absence, not an unnotified one. */
const MAX_SANDWICH_LEAVE_DAYS = 3

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const month = Number(sp.get('month'))
  const year = Number(sp.get('year'))
  const where = {
    ...(Number.isInteger(month) && month >= 1 && month <= 12 ? { month } : {}),
    ...(Number.isInteger(year) && year > 2000 ? { year } : {}),
  }

  const rows = await prisma.sandwichDeduction.findMany({
    where,
    orderBy: [{ triggerDate: 'desc' }],
    include: {
      employee: {
        select: { id: true, fullName: true, employeeCode: true, designation: true, email: true },
      },
      leaveRequest: { select: { id: true, leaveType: true, reason: true } },
    },
  })

  // Every leave sitting on a Friday or a Monday that nobody has ruled on yet.
  // Nothing here is charged — the rule turns on whether notice was given, and
  // that is HR's call, not something the system gets to decide on its own.
  const decided = new Set(rows.map((r) => r.leaveRequestId).filter(Boolean) as string[])
  const candidates = await prisma.leaveRequest.findMany({
    where: { category: 'LEAVE', status: 'APPROVED', id: { notIn: [...decided] } },
    orderBy: { fromDate: 'desc' },
    take: 300,
    select: {
      id: true, fromDate: true, toDate: true, leaveType: true, reason: true, days: true,
      // Evidence decides whether a Friday/Monday sick leave keeps its exemption.
      attachmentName: true,
      employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } },
    },
  })

  const pending = candidates
    .map((l) => {
      // Sick, annual, maternity and paternity carry notice by their nature, so
      // they are not offered here at all. Greying them out was not enough —
      // an Annual leave was charged 17 unpaid days twice before this.
      if (isSandwichExempt(l.leaveType, !!l.attachmentName)) return null
      // A planned block is not what the rule is aimed at either. Four weeks
      // off hits four Fridays and produces a nonsense figure.
      if (l.days > MAX_SANDWICH_LEAVE_DAYS) return null
      const found = assessSandwich(l.fromDate, l.toDate)
      if (found.windows.length === 0) return null
      return {
        leaveId: l.id,
        employee: l.employee,
        leaveType: l.leaveType,
        reason: l.reason,
        fromDate: l.fromDate,
        toDate: l.toDate,
        trigger: found.windows[0].trigger,
        triggerDate: found.windows[0].triggerDate,
        dates: found.dates,
        days: found.days,
        exempt: isSandwichExempt(l.leaveType, !!l.attachmentName),
        exemptReason: exemptionReason(l.leaveType, !!l.attachmentName),
      }
    })
    .filter(Boolean)

  // Leave marked straight onto the attendance grid never became a leave
  // request, so the rule could not see it: a Friday marked L looked identical
  // to a Friday worked. Those days are assessed here too, on the same terms.
  // Anything already covered by a leave request is skipped so one absence
  // cannot be charged twice.
  const decidedTriggerKeys = new Set(
    rows.map((r) => `${r.employeeId}::${r.triggerDate.toISOString().slice(0, 10)}`),
  )
  const coveredByRequest = new Set<string>()
  for (const l of candidates) {
    const cur = new Date(l.fromDate)
    while (cur <= l.toDate) {
      coveredByRequest.add(`${l.employee.id}::${cur.toISOString().slice(0, 10)}`)
      cur.setDate(cur.getDate() + 1)
    }
  }

  // Assessing days that were only ever marked on the grid is an interim rule —
  // see Settings > Interim rules. Off, only approved requests are assessed.
  const readGrid = await interimEnabled('interim_sandwich_grid_leave')
  const attendanceLeave = readGrid
    ? await prisma.attendanceLog.findMany({
      where: { status: { in: ['LEAVE', 'HALF_DAY'] } },
      orderBy: { date: 'desc' },
      take: 400,
      select: {
        id: true, date: true, employeeId: true,
        employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } },
      },
    })
    : []

  const attendancePending = attendanceLeave
    .map((a) => {
      const key = `${a.employeeId}::${a.date.toISOString().slice(0, 10)}`
      if (coveredByRequest.has(key) || decidedTriggerKeys.has(key)) return null
      const found = assessSandwich(a.date, a.date)
      if (found.windows.length === 0) return null
      return {
        leaveId: null,
        attendanceId: a.id,
        source: 'ATTENDANCE' as const,
        employee: a.employee,
        // The grid records the day, not why it was taken. Without a leave type
        // there is no exemption to claim and no evidence attached, so it is
        // offered for a decision rather than judged here.
        leaveType: null,
        reason: 'Marked as leave on the attendance grid — no leave request on file.',
        fromDate: a.date,
        toDate: a.date,
        trigger: found.windows[0].trigger,
        triggerDate: found.windows[0].triggerDate,
        dates: found.dates,
        days: found.days,
        exempt: false,
        exemptReason: null,
      }
    })
    .filter(Boolean)

  const applied = rows.filter((r) => r.status === 'APPLIED')
  return NextResponse.json({
    pending: [...pending, ...attendancePending],
    deductions: rows.map((r) => ({
      ...r,
      dates: (() => { try { return JSON.parse(r.dates) as string[] } catch { return [] } })(),
    })),
    totals: {
      count: rows.length,
      appliedCount: applied.length,
      appliedAmount: Math.round(applied.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      appliedDays: applied.reduce((s, r) => s + r.days, 0),
    },
  })
}
