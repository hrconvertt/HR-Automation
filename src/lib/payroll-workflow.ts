/**
 * Payroll approval chain — 4 stages, with a branch at the CEO.
 *
 *   DRAFT → PENDING_CEO ─┬→ PENDING_FINANCE → PAID
 *                        └────────────────→ PAID
 *
 * The CEO decides which. Sometimes he processes the bank files himself and the
 * run is done; sometimes he hands it to Finance. The old PENDING_HR_FINAL step
 * sat between CEO and Finance and was always a formality — HR prepares the run
 * in DRAFT, so reviewing it again after the CEO added nothing.
 *
 * PENDING_HR_FINAL is kept in the stage type so historical runs still read.
 *
 * Any reviewer can "Send Back" with a reason, returning the run to the prior
 * stage. Each transition writes a PayrollRunApproval audit row.
 *
 * Legacy 8-stage Workday-style statuses (CALCULATED / MANAGER_CONFIRMED /
 * FINANCE_REVIEWED / APPROVED / LOCKED / DISBURSED / CLOSED) are treated as
 * historical / equivalent-to-PAID by the new UI. Use
 * scripts/migrate-payroll-status.js to normalise old rows.
 */

export const PAYROLL_STAGES = [
  'DRAFT',
  'PENDING_CEO',
  'PENDING_FINANCE',
  'PAID',
] as const

export type PayrollStage =
  | (typeof PAYROLL_STAGES)[number]
  | 'REJECTED'
  // Retired stage — historical runs may still sit on it.
  | 'PENDING_HR_FINAL'
  // Legacy statuses still allowed for historical reads
  | 'CALCULATED'
  | 'MANAGER_CONFIRMED'
  | 'FINANCE_REVIEWED'
  | 'APPROVED'
  | 'LOCKED'
  | 'DISBURSED'
  | 'CLOSED'

export type PayrollAction =
  | 'SUBMIT_TO_CEO'        // HR : DRAFT → PENDING_CEO
  | 'CEO_APPROVE'          // CEO: PENDING_CEO → PENDING_FINANCE
  | 'CEO_PROCESS'          // CEO: PENDING_CEO → PAID (he processed the files himself)
  | 'HR_FINAL_APPROVE'     // retired — historical runs on PENDING_HR_FINAL
  | 'RELEASE_TO_FINANCE'   // retired — same
  | 'MARK_PAID'            // FIN: PENDING_FINANCE → PAID
  | 'SEND_BACK'            // any reviewer → one stage back, captures reason
  // Legacy actions — preserved so old code paths keep working
  | 'CALCULATE'
  | 'CONFIRM'
  | 'REVIEW'
  | 'APPROVE'
  | 'LOCK'
  | 'DISBURSE'
  | 'CLOSE'
  | 'REJECT'
  | 'RECALL'

type Transition = {
  from: PayrollStage
  action: PayrollAction
  to: PayrollStage
  allowedRoles: string[]
  label: string
  description: string
}

/**
 * New 5-stage transitions. The transition handler also supports SEND_BACK as a
 * dynamic transition (not in this table) — see resolveNextStage.
 */
export const TRANSITIONS: Transition[] = [
  {
    from: 'DRAFT',
    action: 'SUBMIT_TO_CEO',
    to: 'PENDING_CEO',
    allowedRoles: ['HR_ADMIN'],
    label: 'Submit to CEO',
    description: 'Send the prepared payroll to the CEO for executive review.',
  },
  {
    from: 'PENDING_CEO',
    action: 'CEO_APPROVE',
    to: 'PENDING_FINANCE',
    allowedRoles: ['EXECUTIVE', 'HR_ADMIN'],
    label: 'Send to Finance',
    description: 'Hand the run to Finance to process the transfers.',
  },
  {
    from: 'PENDING_CEO',
    action: 'CEO_PROCESS',
    to: 'PAID',
    allowedRoles: ['EXECUTIVE', 'HR_ADMIN'],
    label: 'Processed — mark Paid',
    description: 'The CEO ran the IFT/IBFT files through the bank himself.',
  },
  {
    from: 'PENDING_HR_FINAL',
    action: 'HR_FINAL_APPROVE',
    to: 'PENDING_FINANCE',
    allowedRoles: ['HR_ADMIN'],
    label: 'Approve & Release to Finance',
    description: 'HR final review complete — Finance can now process payment.',
  },
  {
    from: 'PENDING_HR_FINAL',
    action: 'RELEASE_TO_FINANCE',
    to: 'PENDING_FINANCE',
    allowedRoles: ['HR_ADMIN'],
    label: 'Release to Finance',
    description: 'Same as Approve & Release — alias for clarity in some UIs.',
  },
  {
    from: 'PENDING_FINANCE',
    action: 'MARK_PAID',
    to: 'PAID',
    allowedRoles: ['FINANCE', 'HR_ADMIN'],
    label: 'Mark as Paid',
    description: 'Salaries disbursed via bank — employees see their payslips.',
  },
]

/** Reverse of the chain — used by SEND_BACK to find the prior stage. */
const PRIOR_STAGE: Record<string, PayrollStage> = {
  PENDING_CEO: 'DRAFT',
  // Retired stage — a historical run sitting here still sends back to the CEO.
  PENDING_HR_FINAL: 'PENDING_CEO',
  PENDING_FINANCE: 'PENDING_CEO',
  PAID: 'PENDING_FINANCE',
}

/** Who can perform SEND_BACK at the given stage? */
export function sendBackAllowedRoles(currentStatus: string): string[] {
  switch (currentStatus) {
    case 'PENDING_CEO':       return ['EXECUTIVE', 'HR_ADMIN']
    case 'PENDING_HR_FINAL':  return ['HR_ADMIN']
    case 'PENDING_FINANCE':   return ['FINANCE', 'HR_ADMIN']
    default:                   return []
  }
}

/** Resolve the next stage given current + action; null if invalid. */
export function resolveNextStage(currentStatus: string, action: PayrollAction): PayrollStage | null {
  if (action === 'SEND_BACK') {
    return PRIOR_STAGE[currentStatus] ?? null
  }
  // Legacy alias: REJECT behaves like SEND_BACK in the new flow if a prior stage exists.
  if (action === 'REJECT') {
    return PRIOR_STAGE[currentStatus] ?? 'DRAFT'
  }
  const t = TRANSITIONS.find((t) => t.from === currentStatus && t.action === action)
  return t ? t.to : null
}

/** Actions available to a user given the current run status. */
export function getAvailableActions(currentStatus: string, userRoles: string[]): Transition[] {
  return TRANSITIONS.filter(
    (t) => t.from === currentStatus && t.allowedRoles.some((r) => userRoles.includes(r)),
  )
}

/** Display label for a stage (covers new + legacy). */
export function stageLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_CEO: 'Pending CEO',
    PENDING_HR_FINAL: 'Pending HR Final',
    PENDING_FINANCE: 'Pending Finance',
    PAID: 'Paid',
    REJECTED: 'Sent Back',
    // Legacy
    CALCULATED: 'Calculated',
    MANAGER_CONFIRMED: 'Manager Confirmed',
    FINANCE_REVIEWED: 'Finance Reviewed',
    APPROVED: 'Approved',
    LOCKED: 'Locked',
    DISBURSED: 'Disbursed',
    CLOSED: 'Closed',
  }
  return labels[status] ?? status
}

export function stageColor(status: string): 'gray' | 'blue' | 'amber' | 'green' | 'red' {
  if (status === 'REJECTED') return 'red'
  if (status === 'PAID' || status === 'DISBURSED' || status === 'CLOSED') return 'green'
  if (status === 'PENDING_FINANCE') return 'blue'
  if (status === 'PENDING_HR_FINAL' || status === 'PENDING_CEO') return 'amber'
  if (status === 'DRAFT') return 'gray'
  return 'gray'
}

/** Map any status (incl. legacy and the retired stage) to its pipeline slot. */
export function stageIndex(status: string): number {
  // Legacy: anything past CALCULATED counts as fully done (PAID).
  const legacyDone = new Set([
    'APPROVED', 'LOCKED', 'DISBURSED', 'CLOSED',
  ])
  if (legacyDone.has(status)) return PAYROLL_STAGES.indexOf('PAID')
  // These legacy statuses, and the retired PENDING_HR_FINAL, all sat between
  // the CEO and Finance. They now show at the Finance step.
  if (
    status === 'CALCULATED' || status === 'MANAGER_CONFIRMED' ||
    status === 'FINANCE_REVIEWED' || status === 'PENDING_HR_FINAL'
  ) {
    return PAYROLL_STAGES.indexOf('PENDING_FINANCE')
  }
  const idx = PAYROLL_STAGES.indexOf(status as (typeof PAYROLL_STAGES)[number])
  return idx < 0 ? 0 : idx
}

/** True if the given role can edit payslip line items at the current stage. */
export function canEditPayslipsAtStage(status: string, userRoles: string[]): boolean {
  if (status === 'DRAFT' || status === 'PENDING_HR_FINAL') {
    return userRoles.includes('HR_ADMIN')
  }
  if (status === 'PENDING_CEO') {
    return userRoles.includes('EXECUTIVE') || userRoles.includes('HR_ADMIN')
  }
  return false
}

/** Progress 0–1 along the new chain (for progress bars). */
export function stageProgress(status: string): number {
  const idx = stageIndex(status)
  return idx / (PAYROLL_STAGES.length - 1)
}
