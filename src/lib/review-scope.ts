/**
 * Who the review and increment cycles actually apply to.
 *
 * The founders sit in the employee table because they draw a salary and appear
 * on the org chart, but nobody runs an appraisal on them and nobody schedules
 * their increment. Left in, they surfaced as "increment overdue 2233 days" —
 * a number that is technically true and completely meaningless, and which
 * pushed the real overdue cases down the page.
 *
 * Matched on designation rather than a hardcoded pair of names, so a change of
 * job title keeps working and a future founder does not need a code change.
 */
const FOUNDER_TITLES = /founder|chief executive|\bceo\b|\bcoo\b|\bcto\b|chairman/i

export function isFounder(designation: string | null | undefined): boolean {
  return !!designation && FOUNDER_TITLES.test(designation)
}

/** Everyone the increment clock and appraisal cycle apply to. */
export function onReviewCycle<T extends { designation: string | null }>(people: T[]): T[] {
  return people.filter((p) => !isFounder(p.designation))
}
