/**
 * When somebody's next increment falls due.
 *
 * The increments tab and the appraisal forms both answer this question, and
 * they answered it differently: the tab read the employee's own track, while
 * appraisals assumed twelve months for everyone. Twenty-two of the
 * twenty-three active staff are on the six-monthly track, so the two screens
 * disagreed about almost the whole company — Tayyab Hussain was overdue since
 * August on one and not due until February on the other.
 *
 * One answer now, from here.
 */
import { INCREMENT_RULES, type IncrementTrack } from '@/lib/pay-split'

/** Convertt reviews six months after joining, before the cycle proper begins. */
export const FIRST_REVIEW_MONTHS = 6

/** Fallback cycle for a track that does not state one. */
export const DEFAULT_CYCLE_MONTHS = 12

/**
 * The stored track, as one of the two recurring ones. Anything unset —
 * or PROBATION_TO_PERMANENT, which happens once and does not recur — is
 * treated as annual.
 */
export function resolveTrack(stored: string | null | undefined): IncrementTrack {
  return stored === 'BIANNUAL' ? 'BIANNUAL' : 'ANNUAL'
}

export function addMonths(d: Date, months: number): Date {
  const c = new Date(d)
  c.setMonth(c.getMonth() + months)
  return c
}

export interface DueInput {
  incrementTrack: string | null | undefined
  /** Effective date of the most recent increment or promotion, if any. */
  lastIncrement: Date | null
  joiningDate: Date | null
}

export interface DueResult {
  track: IncrementTrack
  /** Months counted from the anchor — 6 for a first review, else the cycle. */
  window: number
  /** What the wait is counted from: the last increment, or joining. */
  anchor: Date | null
  dueDate: Date | null
  neverRaised: boolean
}

export function incrementDue({ incrementTrack, lastIncrement, joiningDate }: DueInput): DueResult {
  const track = resolveTrack(incrementTrack)
  const cycle = INCREMENT_RULES[track].cycleMonths ?? DEFAULT_CYCLE_MONTHS
  const anchor = lastIncrement ?? joiningDate ?? null
  // Never raised means the clock runs from joining, at six months, whatever
  // the track — the first review comes before the cycle starts.
  const window = lastIncrement ? cycle : FIRST_REVIEW_MONTHS
  return {
    track,
    window,
    anchor,
    dueDate: anchor ? addMonths(anchor, window) : null,
    neverRaised: !lastIncrement,
  }
}

/** Whole days from today; negative once the date has passed. */
export function daysAway(d: Date): number {
  const a = new Date(); a.setHours(0, 0, 0, 0)
  const b = new Date(d); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}
