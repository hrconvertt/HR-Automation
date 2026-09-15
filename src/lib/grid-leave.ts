/**
 * Marking a cell L, WFH or HD on the attendance grid makes the request behind it.
 *
 * Today HR marks attendance by hand and nobody files requests, so a day marked
 * L existed only as a letter in a grid. Payroll could not see it, the sandwich
 * rule could not assess it, and the leave list showed nothing — Ali Shan was
 * marked L for 3 September with no request behind it at all. Work from home
 * and half days had the same gap: Atta Ur Rehman was marked WFH four times in
 * September and WFH Approved listed none of them.
 *
 * So the mark creates the record, in the shape an approved request has:
 *
 *   L    an approved leave request for the day, spending a day of balance
 *   WFH  an approved work-from-home request, spending nothing
 *   HD   an approved half-day leave request (first half flagged), spending half
 *
 * One action, both places, and the two cannot disagree because only one of
 * them is typed.
 *
 * This is an interim measure. When employees use the system they will raise
 * their own requests and HR will approve them, at which point the grid should
 * follow the request rather than the other way round.
 */
import { prisma } from '@/lib/prisma'
import { spendLeaveBalance, refundLeaveBalance } from '@/lib/leave-balance'

/**
 * Marks a request as having been born from a grid cell rather than typed by
 * the employee, so clearing the cell can withdraw the one it created without
 * touching a request somebody actually submitted.
 */
export const GRID_ORIGIN = '[from attendance grid]'

/** The safe default type for a cell that says only "L" or "HD". */
const DEFAULT_TYPE = 'CASUAL'

export type GridKind = 'LEAVE' | 'WFH' | 'HALF_DAY'

const WORDING: Record<GridKind, { reason: string; days: number; spends: boolean }> = {
  LEAVE: { reason: 'Marked as leave on the attendance grid.', days: 1, spends: true },
  HALF_DAY: { reason: 'Marked as a half day on the attendance grid.', days: 0.5, spends: true },
  WFH: { reason: 'Marked as work from home on the attendance grid.', days: 1, spends: false },
}

function kindOf(r: { category: string; days: number; firstDayHalf: boolean; lastDayHalf: boolean }): GridKind {
  if (r.category === 'WFH') return 'WFH'
  if ((r.firstDayHalf || r.lastDayHalf) && r.days < 1) return 'HALF_DAY'
  return 'LEAVE'
}

/**
 * Create the approved request behind a cell just marked L, WFH or HD.
 *
 * Does nothing when a request already covers the day — a real one submitted by
 * the employee, or an earlier grid mark of the same kind — so re-saving the
 * grid cannot stack duplicates. When the grid's own request is of a different
 * kind (the cell went from L to WFH), that request is withdrawn and replaced.
 *
 * The type defaults to CASUAL rather than SICK deliberately. CASUAL is not
 * exempt from the sandwich rule, so a Friday marked L still surfaces for HR to
 * judge; defaulting to SICK would hand out an exemption the grid never claimed.
 */
export async function leaveRequestForGridMark(opts: {
  employeeId: string
  date: Date
  leaveType?: string | null
  approvedByEmployeeId: string | null
  /** What the cell now says. Defaults to leave, the original behaviour. */
  kind?: GridKind
}): Promise<{ created: boolean; requestId?: string }> {
  const { employeeId, date, approvedByEmployeeId } = opts
  const kind = opts.kind ?? 'LEAVE'

  // Any request at all, whatever its status — not just the live ones.
  // Filtering to PENDING/APPROVED meant a request HR had deliberately
  // *rejected* looked like an absence of one, so the next save of the same
  // cell quietly created a fresh approved copy and overrode the decision.
  // A rejection is an answer; the cell staying L does not make it not one.
  // The one exception is a request the grid itself made and later withdrew:
  // that was never anybody's decision, and it must not stop the day being
  // marked again.
  const covering = (await prisma.leaveRequest.findMany({
    where: { employeeId, fromDate: { lte: date }, toDate: { gte: date } },
    select: { id: true, status: true, reason: true, category: true, days: true, firstDayHalf: true, lastDayHalf: true },
  })).filter((r) => !(r.status === 'CANCELLED' && r.reason.includes(GRID_ORIGIN)))

  if (covering.length > 0) {
    const gridMade = covering.length === 1 && covering[0].status === 'APPROVED' && covering[0].reason.includes(GRID_ORIGIN)
    if (!gridMade || kindOf(covering[0]) === kind) return { created: false }
    await withdrawGridLeave(employeeId, date)
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId }, select: { reportingManagerId: true },
  })

  const w = WORDING[kind]
  const created = await prisma.leaveRequest.create({
    data: {
      employeeId,
      category: kind === 'WFH' ? 'WFH' : 'LEAVE',
      // WFH spends no balance, but leaveType is required — CASUAL is the
      // neutral value and nothing reads it for a WFH row.
      leaveType: (kind === 'WFH' ? DEFAULT_TYPE : opts.leaveType ?? DEFAULT_TYPE).toUpperCase(),
      fromDate: date,
      toDate: date,
      days: w.days,
      firstDayHalf: kind === 'HALF_DAY',
      reason: `${w.reason} ${GRID_ORIGIN}`,
      status: 'APPROVED',
      stageOneApproverId: employee?.reportingManagerId ?? null,
      approvedById: approvedByEmployeeId,
      approvedAt: new Date(),
      approvalComment: 'Approved on marking — HR records attendance, leave and work from home together '
        + 'while employees are not yet using the system.',
    },
    select: { requestId: true, leaveType: true },
  })

  // An approved day spends balance. The approve route does this; creating the
  // request already-approved skipped it entirely, so the grid took the day off
  // the calendar and left the entitlement untouched.
  if (w.spends) {
    await spendLeaveBalance(prisma, employeeId, created.leaveType, date.getUTCFullYear(), w.days)
  }

  return { created: true, requestId: created.requestId }
}

/**
 * Withdraw the request a grid cell created, when the cell stops saying L, WFH
 * or HD.
 *
 * Only ever touches a request this file made. A request the employee submitted
 * stays exactly where it is — a mis-click on the grid must not cancel somebody
 * else's approved leave.
 */
export async function withdrawGridLeave(employeeId: string, date: Date): Promise<boolean> {
  const mine = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      fromDate: date,
      toDate: date,
      status: 'APPROVED',
      reason: { contains: GRID_ORIGIN },
    },
    select: { id: true, category: true, leaveType: true, days: true },
  })
  if (!mine) return false
  await prisma.leaveRequest.update({
    where: { id: mine.id },
    data: {
      status: 'CANCELLED',
      rejectedReason: mine.category === 'WFH'
        ? 'The attendance grid no longer marks this day as work from home.'
        : 'The attendance grid no longer marks this day as leave.',
    },
  })
  // And hand the day back, or unmarking a cell would quietly cost somebody a
  // day of entitlement. Work from home never spent any.
  if (mine.category !== 'WFH') {
    await refundLeaveBalance(prisma, employeeId, mine.leaveType, date.getUTCFullYear(), mine.days)
  }
  return true
}
