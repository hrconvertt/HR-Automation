/**
 * The engagement pulse — what is asked, and what may be shown.
 *
 * Six drivers and eNPS. Not forty questions: a survey people abandon measures
 * nothing, and the point of a pulse is that it recurs often enough to show a
 * direction rather than a single verdict.
 *
 * The drivers are the ones that move retention in a small team, phrased as
 * statements somebody agrees or disagrees with. Nobody is asked to rate
 * "culture" — culture is what the six answers add up to.
 */

export const PULSE_SCALE = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neither' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
] as const

export interface PulseDriver {
  key: string
  label: string
  question: string
}

export const PULSE_DRIVERS: PulseDriver[] = [
  {
    key: 'workload',
    label: 'Workload',
    question: 'My workload over the last few weeks has been manageable.',
  },
  {
    key: 'support',
    label: 'Manager support',
    question: 'I can go to my lead when something is going wrong, and it helps.',
  },
  {
    key: 'growth',
    label: 'Growth',
    question: 'I am learning things here that make me better at my work.',
  },
  {
    key: 'recognition',
    label: 'Recognition',
    question: 'Good work here gets noticed.',
  },
  {
    key: 'clarity',
    label: 'Clarity',
    question: 'I know what is expected of me and how my work is judged.',
  },
  {
    key: 'belonging',
    label: 'Belonging',
    question: 'I would be comfortable raising a concern with someone here.',
  },
]

export const DRIVER_KEYS = PULSE_DRIVERS.map((d) => d.key)

/**
 * How many responses a round needs before any result is shown.
 *
 * This is the whole of the confidentiality promise. At 25 people, four
 * responses to "I would be comfortable raising a concern" is close enough to
 * name someone — and one person guessing wrong about that is enough to stop
 * everybody answering honestly for good. Five is the floor, and it applies to
 * the comments as hard as it applies to the scores.
 */
export const MIN_RESPONSES = 5

export const ENPS_QUESTION =
  'How likely are you to recommend Convertt as a place to work? (0–10)'

export interface DriverResult {
  key: string
  label: string
  /** Mean of 1–5, to one decimal. */
  average: number
  /** Share answering 4 or 5, as a percentage. */
  favourable: number
  responses: number
}

export interface PulseResult {
  responses: number
  /** Everyone who could have answered. */
  invited: number
  /** null until MIN_RESPONSES is reached. */
  enps: number | null
  promoters: number
  passives: number
  detractors: number
  drivers: DriverResult[]
  /** null until the floor is met, so a comment cannot be traced. */
  comments: string[] | null
  belowFloor: boolean
}

type RawResponse = { enps: number | null; scores: unknown; comment: string | null }

/**
 * eNPS: promoters (9–10) minus detractors (0–6), as a percentage of everyone
 * who answered. Ranges −100 to +100.
 */
export function summarise(rows: RawResponse[], invited: number): PulseResult {
  const responses = rows.length
  const belowFloor = responses < MIN_RESPONSES

  const enpsRows = rows.filter((r) => typeof r.enps === 'number') as { enps: number }[]
  const promoters = enpsRows.filter((r) => r.enps >= 9).length
  const passives = enpsRows.filter((r) => r.enps >= 7 && r.enps <= 8).length
  const detractors = enpsRows.filter((r) => r.enps <= 6).length
  const enps = belowFloor || enpsRows.length === 0
    ? null
    : Math.round(((promoters - detractors) / enpsRows.length) * 100)

  const drivers: DriverResult[] = PULSE_DRIVERS.map((d) => {
    const vals = rows
      .map((r) => (r.scores as Record<string, unknown> | null)?.[d.key])
      .filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 5)
    const average = vals.length
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      : 0
    const favourable = vals.length
      ? Math.round((vals.filter((v) => v >= 4).length / vals.length) * 100)
      : 0
    return {
      key: d.key,
      label: d.label,
      average: belowFloor ? 0 : average,
      favourable: belowFloor ? 0 : favourable,
      responses: vals.length,
    }
  })

  return {
    responses,
    invited,
    enps,
    promoters: belowFloor ? 0 : promoters,
    passives: belowFloor ? 0 : passives,
    detractors: belowFloor ? 0 : detractors,
    drivers,
    comments: belowFloor
      ? null
      : rows.map((r) => r.comment).filter((c): c is string => !!c && c.trim().length > 0),
    belowFloor,
  }
}

/** Where an eNPS sits, in words. */
export function enpsBand(score: number | null): string | null {
  if (score == null) return null
  if (score >= 50) return 'Excellent'
  if (score >= 20) return 'Good'
  if (score >= 0) return 'Needs attention'
  return 'Poor'
}
