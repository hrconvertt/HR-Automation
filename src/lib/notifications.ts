import { prisma } from '@/lib/prisma'

export type NotificationType =
  | 'LEAVE_SUBMITTED'      // an employee submitted a leave request → notify manager/HR
  | 'LEAVE_APPROVED'       // manager/HR approved → notify employee
  | 'LEAVE_REJECTED'
  | 'PAYSLIP_READY'        // monthly payroll approved → notify employee
  | 'PROBATION_ALERT'      // probation ending in 14 days
  | 'REVIEW_CYCLE_OPENED'  // HR opened a cycle → notify all employees
  | 'REVIEW_SELF_DUE'      // self-appraisal due (employee)
  | 'REVIEW_SELF_SUBMITTED'// employee submitted self → notify manager
  | 'REVIEW_MGR_SUBMITTED' // manager submitted → notify HR
  | 'REVIEW_FINALIZED'     // HR finalized → notify employee
  | 'SHOW_CAUSE_ISSUED'    // notice issued → notify employee
  | 'SHOW_CAUSE_RESOLVED'  // resolved → notify employee
  | 'SHOW_CAUSE_ESCALATED' // escalated → notify employee
  | 'PIP_CREATED'          // PIP started → notify employee
  | 'PIP_UPDATED'          // check-in added → notify employee
  | 'TICKET_UPDATE'        // helpdesk ticket update
  | 'GOAL_ASSIGNED'        // a manager/HR created a goal for an employee
  | 'GOAL_COMMENT'         // a manager commented on a goal
  | 'ANOMALY'              // attendance or other anomaly
  | 'GENERAL'

interface NotifyArgs {
  employeeId: string
  type: NotificationType
  title: string
  message: string
  link?: string
}

/**
 * Create one notification.
 * Safe to call from any API route — does nothing if employeeId is empty.
 * Never throws (logs and swallows errors so it can't break the parent action).
 */
export async function notify(args: NotifyArgs): Promise<void> {
  if (!args.employeeId) return
  try {
    await prisma.notification.create({
      data: {
        employeeId: args.employeeId,
        type: args.type,
        title: args.title,
        message: args.message,
        link: args.link ?? null,
      },
    })
  } catch (err) {
    console.error('[notify] failed', err)
  }
}

/**
 * Bulk notify — for cycle openings etc.
 */
export async function notifyMany(
  employeeIds: string[],
  payload: Omit<NotifyArgs, 'employeeId'>,
): Promise<void> {
  if (!employeeIds.length) return
  try {
    await prisma.notification.createMany({
      data: employeeIds.map((id) => ({
        employeeId: id,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link ?? null,
      })),
    })
  } catch (err) {
    console.error('[notifyMany] failed', err)
  }
}
