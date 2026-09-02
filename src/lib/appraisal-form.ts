/**
 * Convertt's Performance Appraisal Form, as it is actually issued.
 *
 * The wording of every criterion is the wording on the paper form — appraisals
 * get compared year to year and argued over, so a rephrased line is a
 * different question and makes last year's score incomparable.
 *
 * Four sections. The first three apply to everybody and total 100 (20 criteria
 * at 5 each). Managerial Competencies adds 50 for people with reports, so the
 * overall average is scored out of 150 either way — that is what the form's
 * own "Total score / 150 * 100" says, and dropping to a /100 denominator for
 * individual contributors would quietly mark them on a different curve.
 */

export const RATING_INDEX = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Average' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Very Good' },
  { value: 5, label: 'Outstanding' },
] as const

export const MAX_RATING = 5

export interface Criterion {
  key: string
  label: string
}

export interface AppraisalSection {
  key: 'WORK_ORIENTATION' | 'JOB_PROFICIENCY' | 'PERSONAL_EFFECTIVENESS' | 'MANAGERIAL'
  n: number
  title: string
  /** Managerial Competencies is only scored for people who manage others. */
  managerialOnly?: boolean
  criteria: Criterion[]
}

export const SECTIONS: AppraisalSection[] = [
  {
    key: 'WORK_ORIENTATION', n: 1, title: 'Work Orientation',
    criteria: [
      { key: 'wo_punctuality', label: 'Punctuality' },
      { key: 'wo_schedule', label: 'Managing Work Schedule' },
      { key: 'wo_values', label: 'Adapting Company Values' },
      { key: 'wo_proactiveness', label: 'Proactiveness' },
      { key: 'wo_interaction', label: 'Interaction with team members' },
      { key: 'wo_crises', label: 'Helps the team members during crises' },
      { key: 'wo_participation', label: 'Participation in Team activities' },
    ],
  },
  {
    key: 'JOB_PROFICIENCY', n: 2, title: 'Job Proficiency',
    criteria: [
      { key: 'jp_knowledge', label: 'Demonstrating Technical / Domain Knowledge at work' },
      { key: 'jp_quality', label: 'Adherence to Quality (Accuracy, Presentation, Reliability)' },
      { key: 'jp_deadlines', label: 'Meeting Deadlines' },
      { key: 'jp_practices', label: 'Adherence to business practices, policies, processes & procedure' },
      { key: 'jp_accountability', label: 'Accountability for work' },
      { key: 'jp_commitment', label: 'Meeting Commitment' },
    ],
  },
  {
    key: 'PERSONAL_EFFECTIVENESS', n: 3, title: 'Personal Effectiveness',
    criteria: [
      { key: 'pe_communication', label: 'Business Communication' },
      { key: 'pe_interest', label: 'Interest in learning new technologies & concepts' },
      { key: 'pe_implementation', label: "Implementation of learning's at work" },
      { key: 'pe_sharing', label: 'Trains / teaches / shares knowledge with team and peers' },
      { key: 'pe_feedback', label: 'Open to Feedback for continuous improvement' },
      { key: 'pe_attitude', label: 'Positive attitude' },
      { key: 'pe_teamspirit', label: 'Team Spirit' },
    ],
  },
  {
    key: 'MANAGERIAL', n: 4, title: 'Managerial Competencies', managerialOnly: true,
    criteria: [
      { key: 'mc_development', label: 'Employee Development: Assesses performance of subordinates fairly, undertakes manpower development to ensure progress & success' },
      { key: 'mc_customer', label: 'Customer Orientation: Understands and fully meets customer needs; strives continuously to exceed customer expectations' },
      { key: 'mc_change', label: 'Change Management: Open and flexible to new ideas, techniques & suggestions. Manages changes effectively' },
      { key: 'mc_ownership', label: 'Ownership & Commitment: Able to complete tasks with minimum supervision; accepts responsibility but seeks guidance whenever required' },
      { key: 'mc_initiative', label: 'Initiatives at work: Able to look beyond defined job & add value to customer. Is proactive in taking up new initiatives' },
      { key: 'mc_decisions', label: 'Decision making: Evaluates alternatives and chooses the most effective option; makes timely decisions with available information' },
      { key: 'mc_project', label: 'Project Management: Able to plan and execute project(s) with available resources; ensures conformance to schedules and customer needs' },
      { key: 'mc_pressure', label: 'Handling Pressure: Able to work under pressure and handle multiple tasks and adds to the business efficiency' },
      { key: 'mc_deadlines', label: 'Meeting Deadlines: Delegating work efficiently to the right people, supervise & follow up to completion' },
      { key: 'mc_attrition', label: 'Attrition Management: Takes initiative to improve employee retention. Manages to retain top performers in the team' },
    ],
  },
]

/** The three rows of the development-needs table at the end of section 4. */
export const DEVELOPMENT_AREAS = [
  'Personal Effectiveness',
  'Techniques / Technical',
  'Domain specific',
] as const

/** Overall bands, exactly as printed on the form. */
export const BANDS = [
  { min: 90, label: 'Outstanding' },
  { min: 80, label: 'Very Good' },
  { min: 70, label: 'Good' },
  { min: 50, label: 'Average' },
  { min: 0, label: 'Poor' },
] as const

export function bandFor(average: number | null): string | null {
  if (average == null) return null
  return BANDS.find((b) => average >= b.min)?.label ?? 'Poor'
}

/** Whose column a score belongs to. The form has both, side by side. */
export type Column = 'appraisee' | 'appraiser'

export type Ratings = Record<string, { appraisee?: number | null; appraiser?: number | null }>

export function sectionMax(section: AppraisalSection): number {
  return section.criteria.length * MAX_RATING
}

/** Section subtotal for one column. Unscored criteria count as nothing. */
export function subTotal(
  section: AppraisalSection, ratings: Ratings, column: Column,
): number {
  return section.criteria.reduce((n, c) => n + (ratings[c.key]?.[column] ?? 0), 0)
}

/** The first three sections, which the form totals "out of 100". */
export const CORE_SECTIONS = SECTIONS.filter((s) => !s.managerialOnly)
export const MANAGERIAL_SECTION = SECTIONS.find((s) => s.managerialOnly)!

export const CORE_MAX = CORE_SECTIONS.reduce((n, s) => n + sectionMax(s), 0)   // 100
export const MANAGERIAL_MAX = sectionMax(MANAGERIAL_SECTION)                    // 50
export const OVERALL_MAX = CORE_MAX + MANAGERIAL_MAX                            // 150

export function coreTotal(ratings: Ratings, column: Column): number {
  return CORE_SECTIONS.reduce((n, s) => n + subTotal(s, ratings, column), 0)
}

export function overallTotal(ratings: Ratings, column: Column): number {
  return coreTotal(ratings, column) + subTotal(MANAGERIAL_SECTION, ratings, column)
}

/** "Total score / 150 * 100", to one decimal. */
export function overallAverage(ratings: Ratings, column: Column): number {
  return Math.round((overallTotal(ratings, column) / OVERALL_MAX) * 1000) / 10
}

/** How many criteria the appraiser has actually scored, out of how many. */
export function completeness(ratings: Ratings, column: Column, includeManagerial: boolean) {
  const list = includeManagerial ? SECTIONS : CORE_SECTIONS
  const all = list.flatMap((s) => s.criteria)
  const done = all.filter((c) => {
    const v = ratings[c.key]?.[column]
    return typeof v === 'number' && v > 0
  }).length
  return { done, total: all.length }
}

export interface GoalRow { goal: string; actual: string; rating: string }
export interface DevelopmentRow { criteria: string; areas: string; training: string }

export const EMPTY_GOALS: GoalRow[] = [
  { goal: '', actual: '', rating: '' },
  { goal: '', actual: '', rating: '' },
  { goal: '', actual: '', rating: '' },
]

export const EMPTY_DEVELOPMENT: DevelopmentRow[] = DEVELOPMENT_AREAS.map((criteria) => ({
  criteria, areas: '', training: '',
}))

/**
 * What the score is worth, in money.
 *
 * The bands were a poster on the increments page — 10–15% six-monthly, 24%
 * annual — and somebody still had to decide where in the band a particular
 * appraisal landed, by feel, after the form was filled in. That is the gap
 * Muzaffar's query came out of: rated exceptional, offered 12%, with nothing
 * saying how the two were connected.
 *
 * So the overall band the form already computes picks the position in the pay
 * band. Outstanding takes the top of it, Average the floor, the two in between
 * sit proportionally. A fixed band like the annual 24% has no room to move,
 * and correctly gives 24% for anything above Poor.
 *
 * Poor earns nothing. An appraisal below 50 is not an argument for a raise,
 * and printing one would make the score decorative.
 */
const BAND_POSITION: Record<string, number> = {
  Outstanding: 1,
  'Very Good': 0.7,
  Good: 0.4,
  Average: 0,
}

export interface IncrementProposal {
  /** The overall average the appraiser's column comes to. */
  score: number
  band: string | null
  /** Percentage the band and score argue for. */
  pct: number
  rise: number
  proposed: number
  /** False when the score is below 50 — no increment is proposed. */
  eligible: boolean
}

export function proposeIncrement(
  score: number,
  currentSalary: number,
  rule: { minPct: number; maxPct: number },
): IncrementProposal {
  const band = bandFor(score)
  const position = band ? BAND_POSITION[band] : undefined
  if (band == null || position === undefined) {
    return { score, band, pct: 0, rise: 0, proposed: currentSalary, eligible: false }
  }
  const pct = Math.round((rule.minPct + position * (rule.maxPct - rule.minPct)) * 10) / 10
  const rise = Math.round(currentSalary * (pct / 100))
  return { score, band, pct, rise, proposed: Math.round(currentSalary) + rise, eligible: true }
}
