/**
 * Marking a cell L on the attendance grid makes the leave request.
 *
 * Today HR marks attendance by hand and nobody files leave requests, so a day
 * marked L existed only as a letter in a grid. Payroll could not see it, the
 * sandwich rule could not assess it, and the leave list showed nothing —
 * Ali Shan was marked L for 3 September with no request behind it at all.
 *
 * So the mark creates the record. One action, both places, and the two cannot
 * disagree because only one of them is typed.
 *
 * This is an interim measure. When employees use the system they will raise
 * their own requests and HR will approve them, at which point the grid should
 * follow the request rather than the other way round.
 */
import { prisma } from '@/lib/prisma'

/**
 * Marks a request as having been born from a grid cell rather than typed by
 * the employee, so clearing the cell can withdraw the one it created without
 * touching a request somebody actually submitted.
 */
export const GRID_ORIGIN = '[from attendance grid]'

/** The safe default type for a cell that says only "L". */
const DEFAULT_TYPE = 'CASUAL'

/**
 * Create the approved request behind a cell just marked LEAVE.
 *
 * Does nothing when a request already covers the day — a real one submitted by
 * the employee, or an earlier grid mark — so re-saving the grid cannot stack
 * duplicates.
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
}): Promise<{ created: boolean; requestId?: string }> {
  const { employeeId, date, approvedByEmployeeId } = opts

  // Any request at all, whatever its status — not just the live ones.
  // Filtering to PENDING/APPROVED meant a request HR had deliberately
  // *rejected* looked like an absence of one, so the next save of the same
  // cell quietly created a fresh approved copy and overrode the decision.
  // A rejection is an answer; the cell staying L does not make it not one.
  const covering = await prisma.leaveRequest.findFirst({
    where: { employeeId, fromDate: { lte: date }, toDate: { gte: date } },
    select: { id: true, status: true },
  })
  if (covering) return { created: false }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId }, select: { reportingManagerId: true },
  })

  const created = await prisma.leaveRequest.create({
    data: {
      employeeId,
      category: 'LEAVE',
      leaveType: (opts.leaveType ?? DEFAULT_TYPE).toUpperCase(),
      fromDate: date,
      toDate: date,
      days: 1,
      reason: `Marked as leave on the attendance grid. ${GRID_ORIGIN}`,
      status: 'APPROVED',
      stageOneApproverId: employee?.reportingManagerId ?? null,
      approvedById: approvedByEmployeeId,
      approvedAt: new Date(),
      approvalComment: 'Approved on marking — HR records attendance and leave together '
        + 'while employees are not yet using the system.',
    },
    select: { requestId: true },
  })
  return { created: true, requestId: created.requestId }
}

/**
 * Withdraw the request a grid cell created, when the cell stops saying leave.
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
    select: { id: true },
  })
  if (!mine) return false
  await prisma.leaveRequest.update({
    where: { id: mine.id },
    data: {
      status: 'CANCELLED',
      rejectedReason: 'The attendance grid no longer marks this day as leave.',
    },
  })
  return true
}
