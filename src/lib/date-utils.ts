/**
 * Date helpers that consistently use the SERVER LOCAL timezone.
 *
 * Why:
 *   `new Date("2026-06-01")` parses as UTC midnight, while
 *   `new Date(2026, 5, 1)` parses as LOCAL midnight. Mixing them produces
 *   off-by-one day bugs at midnight in any non-UTC timezone — most visibly
 *   in our leave/calendar/holiday paths where date-only strings ("YYYY-MM-DD")
 *   arrive from the UI and need to be compared against local-midnight ranges.
 *
 * Convention:
 *   - All "day" data in our DB is stored as a DateTime at 00:00:00 LOCAL time.
 *   - All inputs of the form "YYYY-MM-DD" should be parsed with `parseLocalDate`.
 *   - All day comparisons use `dayKey(d)` (local YYYY-MM-DD) instead of `===`.
 */

/** Parse a "YYYY-MM-DD" (or any date-only ISO) as LOCAL midnight. */
export function parseLocalDate(input: string | Date): Date {
  if (input instanceof Date) {
    const d = new Date(input)
    d.setHours(0, 0, 0, 0)
    return d
  }
  // Accept "YYYY-MM-DD" or full ISO. Split off any time component.
  const datePart = input.split('T')[0]
  const [y, m, d] = datePart.split('-').map((s) => parseInt(s, 10))
  if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) {
    // Fallback for unparseable input — preserve historical behavior of returning Invalid Date
    return new Date(input)
  }
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

/** YYYY-MM-DD key from a Date, using LOCAL fields. Stable for Set/Map lookups. */
export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Are these two dates the same local calendar day? */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Local midnight of the given date. */
export function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

/** Local end-of-day (23:59:59.999) of the given date. */
export function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}
