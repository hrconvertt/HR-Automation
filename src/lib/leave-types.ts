/**
 * Canonical Leave Types — single source of truth.
 *
 * Convertt policy (permanent employees): 12 CASUAL + 12 SICK = 24 total per year.
 * ANNUAL is not its own category — it's the umbrella sum of CASUAL + SICK.
 * MATERNITY / PATERNITY are arranged directly with HR (months-long, not a
 * self-service dropdown). UNPAID is the fallback when normal balance is gone.
 *
 * LEAVE_TYPE_LABELS keeps legacy values (ANNUAL, MATERNITY, PATERNITY, EMERGENCY,
 * EARNED) so historical records render with the right label. New requests can't
 * pick them from any form.
 */

export const SUBMITTABLE_LEAVE_TYPES = [
  'CASUAL',
  'SICK',
  'UNPAID',
] as const

export type LeaveType = (typeof SUBMITTABLE_LEAVE_TYPES)[number]

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL:    'Annual',
  CASUAL:    'Casual',
  SICK:      'Sick',
  MATERNITY: 'Maternity',
  PATERNITY: 'Paternity',
  UNPAID:    'Unpaid',
  // Legacy values — kept so old rows render cleanly. Not selectable for new requests.
  EMERGENCY: 'Emergency',
  EARNED:    'Earned',
}

/**
 * Two-stage approval status labels.
 *
 * Lifecycle:
 *   PENDING     — submitted, waiting for the reporting manager
 *   PENDING_HR  — manager approved; HR needs to sign off
 *   APPROVED    — HR signed off, balance deducted
 *   REJECTED    — terminal (rejected by manager OR HR)
 *   CANCELLED   — withdrawn by the employee
 */
export const LEAVE_STATUS_LABELS: Record<string, string> = {
  PENDING:     'Awaiting Manager',
  PENDING_HR:  'Awaiting HR',
  APPROVED:    'Approved',
  REJECTED:    'Rejected',
  CANCELLED:   'Cancelled',
}

export const LEAVE_STATUS_TONE: Record<string, 'warning' | 'success' | 'destructive' | 'secondary' | 'default'> = {
  PENDING:    'warning',
  PENDING_HR: 'default',
  APPROVED:   'success',
  REJECTED:   'destructive',
  CANCELLED:  'secondary',
}

/**
 * Format a day count for human reading.
 * Half-days are spelled out instead of shown as 0.5 — feels far more
 * natural to HR staff and employees on payslips, leave logs, etc.
 *   0    → "0 days"
 *   0.5  → "Half day"
 *   1    → "1 day"
 *   1.5  → "1½ days"
 *   2    → "2 days"
 *   2.5  → "2½ days"
 */
export function formatDays(n: number): string {
  const rounded = Math.round(n * 2) / 2 // snap to 0.5 increments
  if (rounded === 0.5) return 'Half day'
  const whole = Math.floor(rounded)
  const hasHalf = rounded % 1 !== 0
  if (hasHalf) return `${whole}½ days`
  return `${whole} ${whole === 1 ? 'day' : 'days'}`
}

/** Tone classes per type — monochrome (slate scale only). Each tier
 *  is distinguished by fill weight + border, never by hue. */
export const LEAVE_TYPE_TONES: Record<string, { tone: string; label: string }> = {
  ANNUAL:    { tone: 'bg-slate-100 text-slate-900 border-slate-300',  label: 'Annual' },
  CASUAL:    { tone: 'bg-slate-100 text-slate-900 border-slate-300',  label: 'Casual' },
  SICK:      { tone: 'bg-white     text-slate-900 border-slate-900',  label: 'Sick' },
  MATERNITY: { tone: 'bg-slate-200 text-slate-900 border-slate-400',  label: 'Maternity' },
  PATERNITY: { tone: 'bg-slate-200 text-slate-900 border-slate-400',  label: 'Paternity' },
  UNPAID:    { tone: 'bg-slate-50  text-slate-700 border-slate-200',  label: 'Unpaid' },
  EMERGENCY: { tone: 'bg-white     text-slate-900 border-slate-900 border-2', label: 'Emergency' },
  EARNED:    { tone: 'bg-slate-900 text-white     border-slate-900',  label: 'Earned' },
}
