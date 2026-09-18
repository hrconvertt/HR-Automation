/**
 * Labels for evaluating candidates, shared by the routes and the candidate
 * view. No imports, so client components can use it.
 */
export interface ScorecardCompetency { competency: string; questions: string[] }

export const RECOMMENDATIONS = [
  { key: 'STRONG_YES', label: 'Definitely yes' },
  { key: 'YES', label: 'Yes' },
  { key: 'NO', label: 'No' },
  { key: 'STRONG_NO', label: 'Definitely no' },
] as const

export const ASSESSMENT_KINDS = [
  { key: 'PRACTICAL', label: 'Practical task' },
  { key: 'SKILLS', label: 'Skills test' },
  { key: 'COGNITIVE', label: 'Aptitude / cognitive test' },
  { key: 'PERSONALITY', label: 'Personality / workplace style' },
  { key: 'OTHER', label: 'Other' },
] as const

export const COMMENT_VISIBILITY = [
  { key: 'HIRING_TEAM', label: 'Everyone hiring for this job' },
  { key: 'MANAGERS', label: 'HR and hiring managers' },
  { key: 'HR', label: 'HR only' },
] as const
