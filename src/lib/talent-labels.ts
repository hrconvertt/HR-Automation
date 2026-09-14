/**
 * Talent vocabulary — the statuses and labels for development items,
 * check-ins, mentorships, succession readiness, skill ratings, flex teams and
 * job-profile matches.
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

/** What kind of mentoring it is — Workday's mentorship types. */
export const MENTORSHIP_TYPES = [
  { value: 'CAREER', label: 'Career mentor' },
  { value: 'NEW_HIRE', label: 'New hire mentor' },
  { value: 'PEER_COACH', label: 'Peer coach' },
  { value: 'LEADERSHIP', label: 'Leadership development' },
] as const
export const MENTORSHIP_TYPE_VALUES = MENTORSHIP_TYPES.map((t) => t.value) as readonly string[]
export function mentorshipTypeLabel(v: string): string {
  return MENTORSHIP_TYPES.find((t) => t.value === v)?.label ?? v
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

/** A rating out of five, named — the band the skill panel prints under the score. */
export const RATING_BANDS = [
  { min: 4.5, label: 'Expert', blurb: 'Specialises in this skill, mentors others, and handles the most complex situations in it.' },
  { min: 3.5, label: 'Advanced', blurb: 'Works on hard problems in it without help and sets the standard for others.' },
  { min: 2.5, label: 'Intermediate', blurb: 'Handles everyday work in it on their own.' },
  { min: 1.5, label: 'Beginner', blurb: 'Does simple work in it with guidance.' },
  { min: 0, label: 'Novice', blurb: 'Knows what it is and has not used it much yet.' },
] as const
export function ratingBand(avg: number) {
  return RATING_BANDS.find((b) => avg >= b.min) ?? RATING_BANDS[RATING_BANDS.length - 1]
}

export const RATING_SOURCES = ['SELF', 'MANAGER', 'HR', 'PEER'] as const
export type RatingSource = (typeof RATING_SOURCES)[number]
export const RATING_SOURCE_LABEL: Record<RatingSource, string> = {
  SELF: 'Self rating',
  MANAGER: 'Manager',
  HR: 'HR',
  PEER: 'Colleague',
}

export const FLEX_WORK_MODES = [
  { value: 'REMOTE', label: 'Remote' },
  { value: 'ONSITE', label: 'On site' },
  { value: 'HYBRID', label: 'Hybrid' },
] as const
export const FLEX_WORK_MODE_VALUES = FLEX_WORK_MODES.map((m) => m.value) as readonly string[]
export function workModeLabel(v: string): string {
  return FLEX_WORK_MODES.find((m) => m.value === v)?.label ?? v
}

export const FLEX_STATUSES = ['OPEN', 'STAFFED', 'CLOSED'] as const
export type FlexStatus = (typeof FLEX_STATUSES)[number]
export const FLEX_STATUS_LABEL: Record<FlexStatus, string> = {
  OPEN: 'Recruiting',
  STAFFED: 'Fully staffed',
  CLOSED: 'Closed',
}

export const FLEX_MEMBER_STATUSES = ['INTERESTED', 'MEMBER', 'DECLINED'] as const
export type FlexMemberStatus = (typeof FLEX_MEMBER_STATUSES)[number]

export const SUGGESTION_KINDS = ['FLEX_TEAM', 'CONNECTION', 'ROLE'] as const
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]

/**
 * How well somebody matches a job profile, in Workday's six bands. Every
 * requirement scores the fraction of the required depth the person holds,
 * capped at one; the percentage is the average across requirements.
 */
export const MATCH_BUCKETS = [
  { key: 'NEGLIGIBLE', label: 'Negligible', color: '#cbd5e1' },
  { key: 'VERY_LOW', label: 'Very low', color: '#fca5a5' },
  { key: 'LOW', label: 'Low', color: '#fcd34d' },
  { key: 'MODERATE', label: 'Moderate', color: '#93c5fd' },
  { key: 'GOOD', label: 'Good', color: '#60a5fa' },
  { key: 'STRONG', label: 'Strong', color: '#15803d' },
] as const
export type MatchBucket = (typeof MATCH_BUCKETS)[number]['key']
export function matchBucket(pct: number): MatchBucket {
  if (pct >= 100) return 'STRONG'
  if (pct >= 80) return 'GOOD'
  if (pct >= 60) return 'MODERATE'
  if (pct >= 40) return 'LOW'
  if (pct >= 20) return 'VERY_LOW'
  return 'NEGLIGIBLE'
}

/** A check-in older than this with nothing since counts as "no recent check-in". */
export const CHECK_IN_GAP_DAYS = 30
/** An open goal untouched for this long is flagged as stalled. */
export const GOAL_STALL_DAYS = 45
