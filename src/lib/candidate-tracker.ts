/**
 * The recruitment tracker — the sourcing workbook's columns, in one order for
 * every position.
 *
 * Each role's sheet was the same backbone with its own screening questions in
 * the middle: who the person is, what the role needs (Figma, CRO, Shopify
 * Liquid…), the verdict, salary and joining, and the interview trail. So the
 * backbone is fixed here and every position shows it the same way, and the
 * role's own columns are set per requisition and slot in after Education.
 *
 * No Prisma: the table that renders these is a client component.
 */

export type TrackerKey =
  | 'email' | 'phone' | 'location' | 'experienceSummary' | 'currentRole' | 'currentCompany'
  | 'pastCompanies' | 'education'
  | 'verdict' | 'matchScore' | 'evaluation'
  | 'whyLeaving' | 'currentSalary' | 'expectedSalary' | 'offerResponse' | 'noticePeriod'
  | 'onsiteWillingness' | 'easyCommute' | 'communication' | 'hrNotes' | 'callOutcome'
  | 'interviewType' | 'interviewDate' | 'interviewer' | 'leadFeedback'
  | 'finalMeeting' | 'finalMeetingDate' | 'finalMeetingStatus'

export type TrackerGroup = 'Candidate' | 'Evaluation' | 'Salary & joining' | 'Interview'

export interface TrackerColumn {
  key: TrackerKey
  label: string
  group: TrackerGroup
  /** Pixels. */
  width: number
  /** Paragraph-length values: two lines in the cell, a textarea to edit. */
  long?: boolean
  /** Suggested values. The sheets are free text, so anything else is accepted. */
  options?: string[]
  number?: boolean
}

const YES_NO = ['Yes', 'No']

export const TRACKER_COLUMNS: TrackerColumn[] = [
  { key: 'email', label: 'Email', group: 'Candidate', width: 210 },
  { key: 'phone', label: 'Phone', group: 'Candidate', width: 140 },
  { key: 'location', label: 'Location', group: 'Candidate', width: 130 },
  { key: 'experienceSummary', label: 'Experience', group: 'Candidate', width: 220, long: true },
  { key: 'currentRole', label: 'Current role', group: 'Candidate', width: 190 },
  { key: 'currentCompany', label: 'Current company', group: 'Candidate', width: 180 },
  { key: 'pastCompanies', label: 'Past companies', group: 'Candidate', width: 210, long: true },
  { key: 'education', label: 'Education', group: 'Candidate', width: 200, long: true },

  { key: 'verdict', label: 'Verdict', group: 'Evaluation', width: 120, options: ['STRONG', 'SHORTLIST', 'MAYBE', 'PASS', 'REJECT'] },
  { key: 'matchScore', label: 'Fit score /100', group: 'Evaluation', width: 100, number: true },
  { key: 'evaluation', label: 'Evaluation / rationale', group: 'Evaluation', width: 300, long: true },

  { key: 'whyLeaving', label: 'Why leaving', group: 'Salary & joining', width: 200, long: true },
  { key: 'currentSalary', label: 'Current salary', group: 'Salary & joining', width: 130 },
  { key: 'expectedSalary', label: 'Expected salary', group: 'Salary & joining', width: 130 },
  { key: 'offerResponse', label: 'Our offer (satisfied or not)', group: 'Salary & joining', width: 170 },
  { key: 'noticePeriod', label: 'Immediate join / notice period', group: 'Salary & joining', width: 170 },
  { key: 'onsiteWillingness', label: 'Onsite willingness', group: 'Salary & joining', width: 130, options: YES_NO },
  { key: 'easyCommute', label: 'Easy commute', group: 'Salary & joining', width: 120, options: YES_NO },
  { key: 'communication', label: 'Communication', group: 'Salary & joining', width: 130, options: ['Poor', 'Average', 'Good', 'Excellent'] },
  { key: 'hrNotes', label: 'Overall notes', group: 'Salary & joining', width: 280, long: true },
  { key: 'callOutcome', label: 'Call outcome / next step', group: 'Salary & joining', width: 190, long: true },

  { key: 'interviewType', label: 'Onsite / video interview', group: 'Interview', width: 150, options: ['Onsite', 'Video', 'Phone'] },
  { key: 'interviewDate', label: 'Interview date', group: 'Interview', width: 160 },
  { key: 'interviewer', label: 'Scheduled with (lead)', group: 'Interview', width: 150 },
  { key: 'leadFeedback', label: 'Feedback by lead (Poor–Average–Good–Best)', group: 'Interview', width: 200, long: true, options: ['Poor', 'Average', 'Good', 'Best'] },
  { key: 'finalMeeting', label: 'Final meeting with Khawar', group: 'Interview', width: 150, options: YES_NO },
  { key: 'finalMeetingDate', label: 'Meeting date with Khawar', group: 'Interview', width: 160 },
  { key: 'finalMeetingStatus', label: 'Meeting status with Khawar', group: 'Interview', width: 180, long: true },
]

/** The position's own screening columns sit straight after this one. */
export const SCREENING_AFTER: TrackerKey = 'education'
export const SCREENING_WIDTH = 180

export function trackerColumn(key: string): TrackerColumn | undefined {
  return TRACKER_COLUMNS.find((c) => c.key === key)
}

/** Every tracker value as text, whatever its column's type. */
export function trackerValues(c: Partial<Record<TrackerKey, string | number | null>>): Record<TrackerKey, string | null> {
  const out = {} as Record<TrackerKey, string | null>
  for (const col of TRACKER_COLUMNS) {
    const v = c[col.key]
    out[col.key] = v == null || v === ''
      ? null
      : typeof v === 'number' ? String(Math.round(v * 10) / 10) : String(v)
  }
  return out
}

export function parseScreening(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v)) if (val != null && val !== '') out[k] = String(val)
    return out
  } catch {
    return {}
  }
}

export function sanitizeScreeningColumns(input: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of Array.isArray(input) ? input : []) {
    const label = String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!label || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())
    out.push(label)
  }
  return out.slice(0, 40)
}

export function parseScreeningColumns(raw: string | null | undefined): string[] {
  if (!raw) return []
  try { return sanitizeScreeningColumns(JSON.parse(raw)) } catch { return [] }
}
