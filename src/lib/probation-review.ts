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
 * The review opens on the first of the month probation ends in, and stays open
 * afterwards — probation ending is not a reason the paperwork stops being
 * needed.
 *
 * It used to open ten days out, which put it in a different place every time:
 * a probation ending on the 3rd opened in the previous month, one ending on
 * the 28th opened three weeks in. A month boundary is a date everyone already
 * knows without counting, and it gives a full month rather than a week and a
 * half to gather what the judgement rests on.
 *
 * Dates are stored at UTC midnight, so the month is read in UTC and compared
 * against today in UTC. Doing one in local time and the other in UTC moves the
 * boundary by a day either side of midnight.
 */
export function reviewOpensOn(end: Date | string): Date {
  const e = new Date(end)
  return new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 1))
}

/** Days until the review opens. Zero or negative once it is open. */
export function daysUntilReviewOpens(end: Date | string): number {
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((reviewOpensOn(end).getTime() - todayUtc) / 86400000)
}

export function reviewIsDue(end: Date | string): boolean {
  return daysUntilReviewOpens(end) <= 0
}

/**
 * The increment cohort on the Appraisal Forms page still counts days, because
 * an increment is due in a month rather than on a date and the two questions
 * are not the same one. Kept separate so changing probation does not quietly
 * move increments as well.
 */
export const INCREMENT_WINDOW_DAYS = 10
