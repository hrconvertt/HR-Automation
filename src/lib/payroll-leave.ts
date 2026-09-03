/**
 * How many days of leave each employee took in a month — read from both places
 * leave is actually recorded.
 *
 * Payroll used to count approved LeaveRequest rows and nothing else. But
 * nobody outside HR files requests yet, so most leave reaches the system by
 * being marked straight onto the attendance grid as LEAVE. Those days were
 * invisible to payroll: a day marked L looked the same as a day worked, and
 * the payslip said the person was present for the whole month.
 *
 * The same gap was found in the sandwich rule and fixed there the same way —
 * read both sources, and skip any day already covered by a request so one
 * absence is never counted twice.
 *
 * Paid vs unpaid: a request carries its leaveType, so it lands in the right
 * bucket. A day marked on the grid carries no type, and at Convertt an L is
 * approved leave, so it counts as paid. Marking it unpaid would silently
 * dock pay on the strength of a grid cell.
 *
 * Weekends and public holidays are never leave days — you cannot take leave
 * on a day you were not due to work.
 */
import { prisma } from '@/lib/prisma'
import { dayKey } from '@/lib/date-utils'
import { interimEnabled } from '@/lib/interim-flags'

export interface MonthLeave {
  /** employeeId → paid leave days */
  paid: Record<string, number>
  /** employeeId → unpaid leave days */
  unpaid: Record<string, number>
  /** Days that came from the attendance grid alone, for reporting. */
  fromAttendance: Record<string, number>
}

export async function leaveDaysForMonth(
  startOfMonth: Date,
  endOfMonth: Date,
  holidayKeys: Set<string>,
): Promise<MonthLeave> {
  // Reading the grid is an interim rule — see Settings > Interim rules. Off,
  // payroll counts approved requests only.
  const readGrid = await interimEnabled('interim_payroll_grid_leave')
  const [approvedLeaves, attendanceLeave] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        fromDate: { lte: endOfMonth },
        toDate: { gte: startOfMonth },
      },
      select: { employeeId: true, fromDate: true, toDate: true, leaveType: true },
    }),
    readGrid
      ? prisma.attendanceLog.findMany({
        where: { date: { gte: startOfMonth, lte: endOfMonth }, status: 'LEAVE' },
        select: { employeeId: true, date: true },
      })
      : Promise.resolve([] as { employeeId: string; date: Date }[]),
  ])

  const paid: Record<string, number> = {}
  const unpaid: Record<string, number> = {}
  const fromAttendance: Record<string, number> = {}

  // Every day a request covers, so grid days already accounted for can be
  // skipped below. Keyed by employee so two people on leave the same day
  // do not cancel each other out.
  const claimed = new Set<string>()

  for (const lv of approvedLeaves) {
    const lvStart = lv.fromDate > startOfMonth ? lv.fromDate : startOfMonth
    const lvEnd = lv.toDate < endOfMonth ? lv.toDate : endOfMonth
    let days = 0
    const cur = new Date(lvStart); cur.setHours(0, 0, 0, 0)
    const stop = new Date(lvEnd); stop.setHours(0, 0, 0, 0)
    while (cur <= stop) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6 && !holidayKeys.has(dayKey(cur))) {
        days++
        claimed.add(lv.employeeId + '|' + dayKey(cur))
      }
      cur.setDate(cur.getDate() + 1)
    }
    const bucket = lv.leaveType === 'UNPAID' ? unpaid : paid
    bucket[lv.employeeId] = (bucket[lv.employeeId] ?? 0) + days
  }

  for (const log of attendanceLeave) {
    const d = new Date(log.date); d.setHours(0, 0, 0, 0)
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue
    if (holidayKeys.has(dayKey(d))) continue
    if (claimed.has(log.employeeId + '|' + dayKey(d))) continue
    paid[log.employeeId] = (paid[log.employeeId] ?? 0) + 1
    fromAttendance[log.employeeId] = (fromAttendance[log.employeeId] ?? 0) + 1
  }

  return { paid, unpaid, fromAttendance }
}
