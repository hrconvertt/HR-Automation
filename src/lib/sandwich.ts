/**
 * The Friday / Monday sandwich rule.
 *
 * From the Leave Policy, section 5, effective August 2025:
 *
 *   "If an employee requests leave on a Friday without prior notice, Saturday
 *    and Sunday will also be counted, totalling three days of leave deducted
 *    from salary. If an employee requests leave on a Monday without prior
 *    notice, Saturday and Sunday are also counted, totalling three days."
 *
 * Note what this is NOT. `countWorkingDays()` in leave-days.ts has a different
 * rule with the same name: it charges the Sat+Sun only when one request covers
 * the Friday *and* the following Monday. That one governs the leave balance and
 * is left alone. This one governs pay, triggers on a single Friday or a single
 * Monday, and only when HR says the absence came without notice — which is a
 * judgement no calendar can make, so nothing here fires on its own.
 *
 * Overlap matters. Leave from Friday to Monday opens both windows, and the
 * union is Fri+Sat+Sun+Mon — four days, not two threes.
 */

import { dayKey } from '@/lib/date-utils'

export type SandwichTrigger = 'FRIDAY' | 'MONDAY'

/**
 * Leave types the rule does not bite on.
 *
 * The policy charges leave taken "without prior notice". Some kinds of leave
 * carry notice by their nature and are accepted on a Friday or Monday as they
 * are on any other day:
 *
 *   SICK       — accepted on a Friday or Monday, but only when the employee
 *                supplies evidence. Being ill on a Friday is not gaming the
 *                weekend; saying so with nothing attached is exactly the claim
 *                the rule exists to test. Without a document the exemption
 *                does not apply and the weekend is charged.
 *   WFH        — the same test, for the same reason. Working from home on a
 *                Friday or a Monday is not an absence at all when there is a
 *                reason for it on file — Rayyan's university challan had to be
 *                paid in person — but "I will work from home on Friday" with
 *                nothing attached is indistinguishable from the long weekend
 *                the rule exists to catch. Evidence or the exemption goes.
 *   ANNUAL     — booked and approved in advance, so notice is the whole point.
 *   MATERNITY  — statutory and planned.
 *   PATERNITY
 *
 * That leaves CASUAL and UNPAID, which is where an unnotified absence lands.
 *
 * This is a default, not a lock. HR can still apply the rule to an exempt type
 * from the dialog — somebody who ghosts for two days and calls it sick
 * afterwards is exactly the case the policy is aimed at.
 */
export const SANDWICH_EXEMPT_TYPES = ['SICK', 'WFH', 'ANNUAL', 'MATERNITY', 'PATERNITY']

/**
 * The types whose exemption is conditional on a document. Both are claims
 * about why the Friday or Monday was not an ordinary long weekend, and a claim
 * with nothing behind it is the case the policy is written for.
 */
export const EVIDENCE_REQUIRED_TYPES = ['SICK', 'WFH']

/**
 * `hasEvidence` — whether a supporting document is attached to the request.
 * Sick leave and WFH depend on it; the other exempt types carry their notice
 * by being booked in advance. Defaults to true so existing callers that do not
 * pass it keep their previous behaviour.
 */
export function isSandwichExempt(
  leaveType: string | null | undefined,
  hasEvidence = true,
): boolean {
  if (!leaveType) return false
  const t = leaveType.toUpperCase()
  if (!SANDWICH_EXEMPT_TYPES.includes(t)) return false
  if (EVIDENCE_REQUIRED_TYPES.includes(t) && !hasEvidence) return false
  return true
}

/** Does a Friday or Monday on this date demand a document? */
export function needsEvidenceOnTrigger(
  leaveType: string | null | undefined,
  from: Date,
  to: Date,
): boolean {
  const t = (leaveType ?? '').toUpperCase()
  if (!EVIDENCE_REQUIRED_TYPES.includes(t)) return false
  return opensSandwichWindow(from, to)
}

export function exemptionReason(
  leaveType: string | null | undefined,
  hasEvidence = true,
): string | null {
  const t = (leaveType ?? '').toUpperCase()
  if (t === 'SICK' && !hasEvidence) {
    return 'Sick leave on a Friday or Monday needs supporting evidence. None is attached, so the exemption does not apply.'
  }
  if (t === 'WFH' && !hasEvidence) {
    return 'Working from home on a Friday or Monday needs supporting evidence. None is attached, so the exemption does not apply.'
  }
  if (!isSandwichExempt(leaveType, hasEvidence)) return null
  if (t === 'SICK') return 'Sick leave with supporting evidence is accepted on a Friday or Monday.'
  if (t === 'WFH') return 'Work from home with supporting evidence is accepted on a Friday or Monday.'
  if (t === 'ANNUAL') return 'Annual leave is booked in advance, so notice was given.'
  return 'This leave type is planned in advance, so notice was given.'
}

export interface SandwichWindow {
  trigger: SandwichTrigger
  /** The Friday or Monday that opened it, YYYY-MM-DD. */
  triggerDate: string
  /** The unpaid days it brings, YYYY-MM-DD, in order. */
  dates: string[]
}

export interface SandwichAssessment {
  windows: SandwichWindow[]
  /** Every unpaid day across all windows, deduped and sorted. */
  dates: string[]
  days: number
}

const FRIDAY = 5
const MONDAY = 1

function atMidnight(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function shift(d: string, byDays: number): string {
  const c = new Date(`${d}T00:00:00`)
  c.setDate(c.getDate() + byDays)
  return dayKey(c)
}

/**
 * Which sandwich windows a leave range opens.
 *
 * `holidayDates` removes a trigger that falls on a public holiday — nobody
 * takes leave on a day the office is shut, so there is nothing to charge.
 */
export function assessSandwich(
  from: Date,
  to: Date,
  opts: { holidayDates?: Set<string> } = {},
): SandwichAssessment {
  const { holidayDates = new Set<string>() } = opts
  const start = atMidnight(from)
  const end = atMidnight(to)

  const windows: SandwichWindow[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const dow = cursor.getDay()
    const key = dayKey(cursor)
    if ((dow === FRIDAY || dow === MONDAY) && !holidayDates.has(key)) {
      const dates = dow === FRIDAY
        ? [key, shift(key, 1), shift(key, 2)]        // Fri, Sat, Sun
        : [shift(key, -2), shift(key, -1), key]      // Sat, Sun, Mon
      windows.push({ trigger: dow === FRIDAY ? 'FRIDAY' : 'MONDAY', triggerDate: key, dates })
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  const dates = [...new Set(windows.flatMap((w) => w.dates))].sort()
  return { windows, dates, days: dates.length }
}

/** Does this range touch a Friday or Monday at all? Cheap check for the UI. */
export function opensSandwichWindow(from: Date, to: Date): boolean {
  return assessSandwich(from, to).windows.length > 0
}

export const TRIGGER_LABEL: Record<SandwichTrigger, string> = {
  FRIDAY: 'Friday',
  MONDAY: 'Monday',
}

/** Calendar days in the month a date falls in. */
export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

/**
 * What the unpaid days cost.
 *
 * Tahreem's basis, stated exactly: "the net salary is divided into full month
 * days and as per day his unpaid is counted on net pay". So the divisor is the
 * calendar length of the month — 31 in August, 28 in February — not the count
 * of working days, and the dividend is a full month's net rather than gross.
 *
 * Rounded to two decimals at the end only, so three days of a 31-day month do
 * not drift from the monthly figure.
 */
export function sandwichAmount(
  fullMonthNet: number,
  year: number,
  month1to12: number,
  days: number,
): { perDay: number; amount: number; divisor: number } {
  const divisor = daysInMonth(year, month1to12)
  const perDay = divisor > 0 ? fullMonthNet / divisor : 0
  return {
    perDay: Math.round(perDay * 100) / 100,
    amount: Math.round(perDay * days * 100) / 100,
    divisor,
  }
}

/** "Sat 08, Sun 09 and Mon 10 August 2026" — for the warning letter. */
export function describeDates(dates: string[]): string {
  if (dates.length === 0) return ''
  const parts = dates.map((d) => {
    const dt = new Date(`${d}T00:00:00`)
    return dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' })
  })
  const last = new Date(`${dates[dates.length - 1]}T00:00:00`)
  const tail = last.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const joined = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `${joined} ${tail}`
}
