/**
 * The probationary performance review — dimensions, scale, and the increment
 * brackets it feeds.
 *
 * The decision packet counts attendance and suggests an outcome. That is not a
 * review: it read zero absences for someone who had taken leave, and no
 * arithmetic knows whether the work was any good. The rating here is a person's
 * judgement, recorded with the evidence behind it.
 */

export const RATING_SCALE = [
  { value: 1, label: 'Needs Improvement' },
  { value: 2, label: 'Meets Expectations' },
  { value: 3, label: 'Exceeds Expectations' },
  { value: 4, label: 'Exceptional' },
] as const

export const DIMENSIONS = [
  {
    key: 'Quality',
    label: 'Quality of Work & Deliverables',
    hint: 'Output quality, attention to detail, rework needed',
  },
  {
    key: 'Punctuality',
    label: 'Punctuality & Timeliness',
    hint: 'Deadlines met, attendance, notice given when not',
  },
  {
    key: 'Ownership',
    label: 'Ownership & Initiative',
    hint: 'Solves problems without being chased, works independently',
  },
  {
    key: 'Communication',
    label: 'Communication & Collaboration',
    hint: 'Clear reporting, works well across teams',
  },
  {
    key: 'Adaptability',
    label: 'Adaptability & Learning Curve',
    hint: 'Picked up internal tools and processes, takes feedback',
  },
] as const

export type DimensionKey = (typeof DIMENSIONS)[number]['key']

export const ASSESSMENTS = [
  { value: 'UNSATISFACTORY', label: 'Unsatisfactory', hint: 'Fails to meet basic role requirements' },
  { value: 'SATISFACTORY', label: 'Satisfactory / Meets Expectations', hint: 'Solid performance' },
  { value: 'EXCEEDS', label: 'Exceeds Expectations', hint: 'Consistently delivers above average' },
  { value: 'EXCEPTIONAL', label: 'Exceptional', hint: 'Outstanding work delivered on time; top performer' },
] as const

/**
 * Convertt's increment policy: 10–15%, given at the end of probation and again
 * after the following six months.
 *
 * The band matters because the two have to agree. Muzaffar was rated
 * exceptional and offered 12%, which sits mid-bracket — the gap between the
 * rating and the reward is what he wrote in about, and it was a fair point.
 */
export const INCREMENT_BRACKETS: Record<string, { min: number; max: number; label: string }> = {
  UNSATISFACTORY: { min: 0, max: 0, label: 'No increment — probation not cleared' },
  SATISFACTORY: { min: 10, max: 11, label: '10% – 11%' },
  EXCEEDS: { min: 12, max: 13, label: '12% – 13%' },
  EXCEPTIONAL: { min: 14, max: 15, label: '14% – 15% (policy cap)' },
}

/** Average of whatever dimensions have been rated so far. */
export function averageRating(ratings: (number | null | undefined)[]): number | null {
  const given = ratings.filter((r): r is number => typeof r === 'number' && r > 0)
  if (!given.length) return null
  return Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 100) / 100
}

/**
 * The assessment the ratings point at — a suggestion, and only when every
 * dimension has been rated. It fills the radio in; it does not lock it.
 */
export function suggestedAssessment(ratings: (number | null | undefined)[]): string | null {
  const avg = averageRating(ratings)
  if (avg === null || ratings.some((r) => !r)) return null
  if (avg < 1.75) return 'UNSATISFACTORY'
  if (avg < 2.75) return 'SATISFACTORY'
  if (avg < 3.5) return 'EXCEEDS'
  return 'EXCEPTIONAL'
}

export function incrementFor(currentSalary: number, pct: number) {
  const amount = Math.round(currentSalary * (pct / 100))
  return { amount, proposed: currentSalary + amount }
}

/** How many days until probation ends. Negative once it has passed. */
export function daysUntil(end: Date | string): number {
  const e = new Date(end)
  e.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((e.getTime() - now.getTime()) / 86400000)
}

/**
 * The review opens in the last ten days, which is when there is enough to judge
 * and still time to act on it. It stays open afterwards — probation ending is
 * not a reason the paperwork stops being needed.
 */
export const REVIEW_WINDOW_DAYS = 10

export function reviewIsDue(end: Date | string): boolean {
  return daysUntil(end) <= REVIEW_WINDOW_DAYS
}
