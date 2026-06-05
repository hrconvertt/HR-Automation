/**
 * payroll approval chain.
 *
 * Stages (in order):
 *   DRAFT → CALCULATED → MANAGER_CONFIRMED → FINANCE_REVIEWED → APPROVED → LOCKED → DISBURSED → CLOSED
 *
 * Plus REJECTED — any approval stage can send the run back to DRAFT with a comment.
 *
 * Each transition writes a PayrollRunApproval row so HR has a full audit trail
 * of who did what, when. This matches Workday's "Pay Calculation Audit" report.
 */

export const PAYROLL_STAGES = [
  'DRAFT',
  'CALCULATED',
  'MANAGER_CONFIRMED',
  'FINANCE_REVIEWED',
  'APPROVED',
  'LOCKED',
  'DISBURSED',
  'CLOSED',
] as const

export type PayrollStage = (typeof PAYROLL_STAGES)[number] | 'REJECTED'

export type PayrollAction =
  | 'CALCULATE'    // DRAFT → CALCULATED
  | 'CONFIRM'      // CALCULATED → MANAGER_CONFIRMED
  | 'REVIEW'       // MANAGER_CONFIRMED → FINANCE_REVIEWED
  | 'APPROVE'      // FINANCE_REVIEWED → APPROVED
  | 'LOCK'         // APPROVED → LOCKED  (also makes payslips visible / status PAID)
  | 'DISBURSE'     // LOCKED → DISBURSED
  | 'CLOSE'        // DISBURSED → CLOSED
  | 'REJECT'       // any → REJECTED (back to DRAFT)
  | 'RECALL'       // pull back one stage (HR-only)

/**
 * Defines which action is valid at each stage and what role(s) can perform it.
 * Roles map to UserRole assignments — adjust to your org structure.
 */
type Transition = {
  from: PayrollStage
  action: PayrollAction
  to: PayrollStage
  allowedRoles: string[]   // any of these roles can perform
  label: string            // shown on the button
  description: string      // shown as helper text
}

export const TRANSITIONS: Transition[] = [
  {
    from: 'DRAFT',
    action: 'CALCULATE',
    to: 'CALCULATED',
    allowedRoles: ['HR_ADMIN'],
    label: 'Run Calculation',
    description: 'Freeze inputs and generate draft payslips for review.',
  },
  {
    from: 'CALCULATED',
    action: 'CONFIRM',
    to: 'MANAGER_CONFIRMED',
    allowedRoles: ['HR_ADMIN', 'MANAGER'],
    label: 'Confirm Team Hours',
    description: 'Managers confirm their team\'s attendance, OT and bonus look correct.',
  },
  {
    from: 'MANAGER_CONFIRMED',
    action: 'REVIEW',
    to: 'FINANCE_REVIEWED',
    allowedRoles: ['HR_ADMIN', 'FINANCE'],
    label: 'Finance Review',
    description: 'Verify totals, tax remittance schedule and EOBI numbers.',
  },
  {
    from: 'FINANCE_REVIEWED',
    action: 'APPROVE',
    to: 'APPROVED',
    allowedRoles: ['HR_ADMIN', 'EXECUTIVE'],
    label: 'Final Approval',
    description: 'CFO / CEO signs off the disbursement batch.',
  },
  {
    from: 'APPROVED',
    action: 'LOCK',
    to: 'LOCKED',
    allowedRoles: ['HR_ADMIN'],
    label: 'Lock Run',
    description: 'Lock figures and prepare bank-transfer file. No further edits.',
  },
  {
    from: 'LOCKED',
    action: 'DISBURSE',
    to: 'DISBURSED',
    allowedRoles: ['HR_ADMIN', 'FINANCE'],
    label: 'Mark Disbursed',
    description: 'Salaries paid out — payslips become visible to employees.',
  },
  {
    from: 'DISBURSED',
    action: 'CLOSE',
    to: 'CLOSED',
    allowedRoles: ['HR_ADMIN'],
    label: 'Close Period',
    description: 'Period closed. Read-only audit record.',
  },
]

/** What's the next valid action from a given stage for a user with these roles? */
export function getAvailableActions(
  currentStatus: string,
  userRoles: string[],
): Transition[] {
  return TRANSITIONS.filter(
    (t) => t.from === currentStatus && t.allowedRoles.some((r) => userRoles.includes(r)),
  )
}

/** Display label for a stage. */
export function stageLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    CALCULATED: 'Calculated',
    MANAGER_CONFIRMED: 'Manager Confirmed',
    FINANCE_REVIEWED: 'Finance Reviewed',
    APPROVED: 'Approved',
    LOCKED: 'Locked',
    DISBURSED: 'Disbursed',
    CLOSED: 'Closed',
    REJECTED: 'Rejected',
  }
  return labels[status] ?? status
}

/** Color-code stages for badges. */
export function stageColor(status: string): 'gray' | 'blue' | 'amber' | 'green' | 'red' {
  if (status === 'REJECTED') return 'red'
  if (status === 'CLOSED') return 'gray'
  if (status === 'DISBURSED' || status === 'APPROVED' || status === 'LOCKED') return 'green'
  if (status === 'FINANCE_REVIEWED' || status === 'MANAGER_CONFIRMED') return 'blue'
  if (status === 'DRAFT' || status === 'CALCULATED') return 'amber'
  return 'gray'
}

/** Resolve the next stage given current + action; null if invalid. */
export function resolveNextStage(currentStatus: string, action: PayrollAction): PayrollStage | null {
  if (action === 'REJECT') return 'REJECTED'
  if (action === 'RECALL') {
    const idx = PAYROLL_STAGES.indexOf(currentStatus as (typeof PAYROLL_STAGES)[number])
    if (idx <= 0) return null
    return PAYROLL_STAGES[idx - 1]
  }
  const t = TRANSITIONS.find((t) => t.from === currentStatus && t.action === action)
  return t ? t.to : null
}

/** Compute progress 0–1 along the chain. */
export function stageProgress(status: string): number {
  if (status === 'REJECTED') return 0
  const idx = PAYROLL_STAGES.indexOf(status as (typeof PAYROLL_STAGES)[number])
  return idx < 0 ? 0 : idx / (PAYROLL_STAGES.length - 1)
}
