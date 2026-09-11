/**
 * Talent vocabulary — the statuses and labels for development items,
 * check-ins, mentorships and succession readiness.
 *
 * Kept free of server imports so client components can use the same words
 * the API validates against.
 */

export const DEV_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const
export type DevStatus = (typeof DEV_STATUSES)[number]
export const DEV_STATUS_LABEL: Record<DevStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
}

export const CHECK_IN_STATUSES = ['SCHEDULED', 'DONE', 'CANCELLED'] as const
export type CheckInStatus = (typeof CHECK_IN_STATUSES)[number]

export const TOPIC_SOURCES = ['MANUAL', 'GOAL', 'DEVELOPMENT', 'INTEREST'] as const
export type TopicSource = (typeof TOPIC_SOURCES)[number]

export const MENTORSHIP_STATUSES = ['PROPOSED', 'ACTIVE', 'ENDED'] as const
export type MentorshipStatus = (typeof MENTORSHIP_STATUSES)[number]
export const MENTORSHIP_STATUS_LABEL: Record<MentorshipStatus, string> = {
  PROPOSED: 'Suggested',
  ACTIVE: 'Active',
  ENDED: 'Ended',
}

/** How soon a successor could step in. Ordered nearest first. */
export const READINESS = [
  { value: 'READY_NOW', label: 'Ready now', short: 'Now' },
  { value: 'ONE_YEAR', label: 'Ready in 1 year', short: '1 year' },
  { value: 'TWO_PLUS_YEARS', label: 'Ready in 2+ years', short: '2+ years' },
] as const
export type Readiness = (typeof READINESS)[number]['value']
export const READINESS_VALUES = READINESS.map((r) => r.value) as readonly string[]
export function readinessLabel(v: string): string {
  return READINESS.find((r) => r.value === v)?.label ?? v
}

/** Skill depth, as the Skills page already records it. */
export const SKILL_LEVELS = [
  { value: 1, label: 'Aware' },
  { value: 2, label: 'Working' },
  { value: 3, label: 'Strong' },
  { value: 4, label: 'Can teach it' },
] as const
export function skillLevelLabel(n: number): string {
  return SKILL_LEVELS.find((l) => l.value === n)?.label ?? String(n)
}

/** A check-in older than this with nothing since counts as "no recent check-in". */
export const CHECK_IN_GAP_DAYS = 30
/** An open goal untouched for this long is flagged as stalled. */
export const GOAL_STALL_DAYS = 45
