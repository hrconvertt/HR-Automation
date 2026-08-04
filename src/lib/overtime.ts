/**
 * Overtime — status vocabulary and the pay arithmetic.
 *
 * `overtimeApproved` was a single boolean, which could only say yes or
 * not-yet. A rejected hour looked exactly like one nobody had opened, so it sat
 * in the approvals inbox for ever. `overtimeStatus` is the decision itself, and
 * REJECTED is terminal: seen, declined, not payable, gone from the inbox.
 */

export type OvertimeStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export const OT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Awaiting approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

export const OT_STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-slate-100 text-slate-500 border-slate-200',
}

/**
 * The multiplier applied to the hour, as a percentage.
 *
 * 100 is the default because it is the only rate Convertt has actually paid:
 * Usman's overtime came through as a straight addition on top of his 110,000,
 * not at a premium. The other rates are here so a premium can be chosen per
 * occurrence rather than assumed for everyone.
 */
export const OT_RATES = [
  { pct: 100, label: '100% — normal hourly rate' },
  { pct: 125, label: '125% — time and a quarter' },
  { pct: 150, label: '150% — time and a half' },
  { pct: 200, label: '200% — double time' },
] as const

export const DEFAULT_OT_RATE_PCT = 100

/**
 * A standard month, used to turn a monthly salary into an hourly one.
 *
 * Convertt pays a flat monthly figure — there is no hourly rate anywhere in the
 * salary records — so one has to be derived, and the divisor is a policy
 * choice rather than a fact. 22 working days at 8 paid hours (10:00–19:00 less
 * the hour for lunch) matches the working week configured in Settings.
 */
export const STANDARD_WORKING_DAYS = 22
export const STANDARD_HOURS_PER_DAY = 8

export function hourlyRate(monthlyGross: number): number {
  if (!monthlyGross || monthlyGross <= 0) return 0
  return monthlyGross / (STANDARD_WORKING_DAYS * STANDARD_HOURS_PER_DAY)
}

/** What the hours are worth, at the rate chosen for that occurrence. */
export function overtimeAmount(
  monthlyGross: number,
  hours: number,
  ratePct: number | null | undefined,
): number {
  const pct = ratePct ?? DEFAULT_OT_RATE_PCT
  return Math.round(hourlyRate(monthlyGross) * hours * (pct / 100))
}

/** "1½ h" reads better in a table than 1.5. */
export function formatHours(h: number): string {
  const rounded = Math.round(h * 2) / 2
  if (rounded === 0.5) return 'Half hour'
  const whole = Math.floor(rounded)
  return rounded % 1 !== 0 ? `${whole}½ h` : `${whole} h`
}
