/**
 * Background verification — what the candidate told us against what their
 * previous employer says.
 *
 * The form is Convertt's own Employment Verification Details table, the one we
 * fill in when another company asks about an ex-employee. Using the same twelve
 * questions in both directions is deliberate: it is the format HR here already
 * reads, and a reply that comes back on our own form is easy to compare.
 *
 * Two columns per question, never one. A single "verified" value loses the
 * thing the whole exercise exists to find — the gap between the two.
 *
 * Playbook SOP-01: two professional references, at least one a former direct
 * manager, contacted directly by HR with notes filed, and written candidate
 * consent obtained before any of it.
 */

import { BRAND_NAME, HR_EMAIL, ENTITIES } from '@/lib/brand'

// ── The questions ───────────────────────────────────────────────────────────

export interface VerificationField {
  key: string
  label: string
  /** What a useful answer looks like. */
  hint?: string
  /** A mismatch here is a serious problem, not a wording difference. */
  material?: boolean
  /** Free text that will never compare cleanly — judged, not matched. */
  narrative?: boolean
}

export const VERIFICATION_FIELDS: VerificationField[] = [
  { key: 'candidateName', label: 'Candidate name', material: true,
    hint: 'As it appears on their CNIC or passport' },
  { key: 'period', label: 'Period served (from — to)', material: true,
    hint: 'Exact dates. Overlapping or padded dates are the most common discrepancy.' },
  { key: 'designation', label: 'Designation and department', material: true },
  { key: 'employeeCode', label: 'Employee code' },
  { key: 'jobType', label: 'Job type', material: true,
    hint: 'Permanent, temporary, contractual or internship' },
  { key: 'supervisor', label: "Supervisor's name and designation", material: true },
  { key: 'reasonForLeaving', label: 'Reason for leaving', material: true, narrative: true },
  { key: 'abilities', label: 'Professional abilities', narrative: true },
  { key: 'duties', label: 'Duties and responsibilities handled', narrative: true },
  { key: 'conduct', label: 'Attitude, honesty and personal reputation', narrative: true },
  { key: 'rehire', label: 'Would you rehire?', material: true,
    hint: 'The single most informative answer on the form' },
  { key: 'verifier', label: "Verifier's name and designation",
    hint: 'Who at the previous employer actually answered' },
]

export const FIELD_BY_KEY = new Map(VERIFICATION_FIELDS.map((f) => [f.key, f]))

// ── Where it is up to ───────────────────────────────────────────────────────

export const VERIFICATION_STATUSES = [
  'NOT_STARTED', 'AWAITING_CONSENT', 'SENT', 'CHASING',
  'RESPONDED', 'COMPLETED', 'UNREACHABLE',
] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  NOT_STARTED: 'Not started',
  AWAITING_CONSENT: 'Waiting on consent',
  SENT: 'Request sent',
  CHASING: 'Chasing',
  RESPONDED: 'Reply received',
  COMPLETED: 'Closed',
  UNREACHABLE: 'No response',
}

export const STATUS_TONE: Record<VerificationStatus, string> = {
  NOT_STARTED: 'bg-slate-50 text-slate-600 border-slate-200',
  AWAITING_CONSENT: 'bg-amber-50 text-amber-800 border-amber-200',
  SENT: 'bg-sky-50 text-sky-800 border-sky-200',
  CHASING: 'bg-amber-50 text-amber-800 border-amber-200',
  RESPONDED: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  UNREACHABLE: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const OUTCOMES = [
  'CLEAR', 'MINOR_DISCREPANCY', 'MAJOR_DISCREPANCY', 'NO_RESPONSE',
] as const
export type Outcome = (typeof OUTCOMES)[number]

export const OUTCOME_LABELS: Record<Outcome, { label: string; meaning: string }> = {
  CLEAR: {
    label: 'Clear',
    meaning: 'What we were told matches what the employer confirmed.',
  },
  MINOR_DISCREPANCY: {
    label: 'Minor discrepancy',
    meaning: 'Differences of wording or a month either way. Noted, not disqualifying.',
  },
  MAJOR_DISCREPANCY: {
    label: 'Major discrepancy',
    meaning: 'Dates, title, job type or reason for leaving materially contradicted. Escalate to the Founder.',
  },
  NO_RESPONSE: {
    label: 'No response',
    meaning: 'The employer could not be reached or declined to comment. Not evidence against the candidate.',
  },
}

// ── What to ask the employee before any of this starts ──────────────────────

export interface ChecklistItem {
  key: string
  ask: string
  why: string
  /** Nothing can be sent until these are in hand. */
  blocking?: boolean
}

/**
 * The pre-flight list.
 *
 * Verification stalls for one of two reasons: nobody has consent, or nobody has
 * a working address for the person who can actually answer. Both are collected
 * from the employee, and both are asked for here before a single email goes out.
 */
export const WHAT_TO_ASK: ChecklistItem[] = [
  {
    key: 'consent',
    ask: 'Signed consent to contact previous employers and verify documents',
    why: 'Contacting an employer without it is a data-protection problem, not just a courtesy one. Playbook 3.2, and the UAE PDPL for Dubai hires.',
    blocking: true,
  },
  {
    key: 'employerList',
    ask: 'Every employer they want verified — legal company name, city, and their dates there',
    why: 'The dates in their own words are the thing being checked. Ask before the employer answers, never after.',
    blocking: true,
  },
  {
    key: 'referee',
    ask: 'A named referee at each: full name, designation, work email and phone',
    why: 'Playbook SOP-01 wants at least one former direct manager. An HR inbox confirms dates; a manager tells you how they worked.',
    blocking: true,
  },
  {
    key: 'relationship',
    ask: 'How each referee is related to them — direct manager, skip-level, HR, peer',
    why: 'A peer reference reads very differently from a manager one, and a "manager" who turns out to be a friend is the discrepancy.',
  },
  {
    key: 'title',
    ask: 'Their exact job title and department at each employer',
    why: 'Inflated titles are the most common padding. Compare word for word.',
  },
  {
    key: 'jobType',
    ask: 'Whether each role was permanent, contract, part-time or an internship',
    why: 'An internship presented as a permanent role changes what their experience actually amounts to.',
  },
  {
    key: 'reasonForLeaving',
    ask: 'Why they left each role, in their own words',
    why: 'The one answer to record verbatim before you ask anyone else. It is the field that most often diverges.',
  },
  {
    key: 'documents',
    ask: 'Experience letter, relieving letter and last three salary slips from the most recent employer',
    why: 'Paper first. Half of what you would ask by email is already on these, and a letterhead is checkable.',
  },
  {
    key: 'education',
    ask: 'Degree and transcript, plus the institution and roll number',
    why: 'Playbook SOP-01 requires HEC verification for degree-critical roles.',
  },
  {
    key: 'gaps',
    ask: 'An explanation for any gap longer than three months',
    why: 'Asked openly at the start it is context; discovered later it looks like concealment.',
  },
  {
    key: 'noContact',
    ask: 'Whether there is any employer they would rather we did not contact yet, and why',
    why: 'Usually a current employer who does not know they are leaving — entirely reasonable. Better asked than assumed.',
  },
]

// ── Comparing the two columns ───────────────────────────────────────────────

export type Claimed = Record<string, string>
export type Verified = Record<string, string>

export interface Discrepancy {
  key: string
  label: string
  claimed: string
  verified: string
  material: boolean
}

/** Loose comparison — case, punctuation and spacing are not discrepancies. */
const flatten = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Fields where both sides answered and the answers differ.
 *
 * Narrative fields are never auto-flagged: "managed project delivery" and
 * "handled client accounts" are not a contradiction, and a form that cried
 * discrepancy on every rephrasing would be ignored within a week. They are
 * shown side by side for a person to read instead.
 */
export function findDiscrepancies(claimed: Claimed, verified: Verified): Discrepancy[] {
  const out: Discrepancy[] = []
  for (const f of VERIFICATION_FIELDS) {
    if (f.narrative) continue
    const a = (claimed[f.key] ?? '').trim()
    const b = (verified[f.key] ?? '').trim()
    if (!a || !b) continue
    if (flatten(a) === flatten(b)) continue
    // One containing the other is a fuller answer, not a conflict —
    // "Senior Web Developer" against "Senior Web Developer, Engineering".
    if (flatten(a).includes(flatten(b)) || flatten(b).includes(flatten(a))) continue
    out.push({ key: f.key, label: f.label, claimed: a, verified: b, material: !!f.material })
  }
  return out
}

/** What the discrepancies suggest the outcome is. HR still decides. */
export function suggestOutcome(
  claimed: Claimed, verified: Verified, hasReply: boolean,
): Outcome {
  if (!hasReply) return 'NO_RESPONSE'
  const d = findDiscrepancies(claimed, verified)
  if (d.length === 0) return 'CLEAR'
  return d.some((x) => x.material) ? 'MAJOR_DISCREPANCY' : 'MINOR_DISCREPANCY'
}

/** How much of the form has come back. */
export function completeness(verified: Verified): { answered: number; total: number } {
  const total = VERIFICATION_FIELDS.length
  const answered = VERIFICATION_FIELDS.filter((f) => (verified[f.key] ?? '').trim()).length
  return { answered, total }
}

// ── The emails ──────────────────────────────────────────────────────────────

export interface EmailDraft { subject: string; body: string }

/** The consent request, to the employee. Nothing goes out before this comes back. */
export function buildConsentRequest(employeeName: string): EmailDraft {
  const first = employeeName.trim().split(/\s+/)[0] || employeeName
  return {
    subject: `${BRAND_NAME} — background verification consent`,
    body: [
      `Hi ${first},`,
      '',
      'As part of joining formalities we carry out a standard background '
      + 'verification with your previous employers. It confirms dates, role and '
      + 'reason for leaving — the same details you have already given us.',
      '',
      'Before we contact anyone, we need your written consent and a few details. '
      + 'Please reply to this email with:',
      '',
      '  1. Your confirmation that we may contact your previous employers and '
      + 'verify your documents',
      '  2. For each employer: legal company name, city, and your exact dates there',
      '  3. A referee at each — name, designation, work email and phone, and how '
      + 'they were related to you (direct manager, HR, and so on)',
      '  4. Your exact job title, department, and whether the role was permanent, '
      + 'contract, part-time or an internship',
      '  5. Your reason for leaving each role',
      '  6. Experience and relieving letters, and your last three salary slips '
      + 'from your most recent employer',
      '  7. Degree and transcript, with institution and roll number',
      '',
      'If there is an employer you would rather we did not contact yet — a '
      + 'current one, for instance — tell us and we will hold off on that one.',
      '',
      'Nothing is shared outside HR, and we will only confirm what you have '
      + 'already told us.',
      '',
      `${BRAND_NAME} — People & Culture`,
      HR_EMAIL,
    ].join('\n'),
  }
}

/** The request to the previous employer, on our own verification format. */
export function buildVerificationRequest(input: {
  employeeName: string
  employerName: string
  contactName?: string | null
  claimed?: Claimed
}): EmailDraft {
  const greeting = input.contactName?.trim()
    ? `Dear ${input.contactName.trim()},`
    : 'Dear Sir or Madam,'

  const lines: string[] = []
  lines.push(greeting)
  lines.push('')
  lines.push(
    `${input.employeeName} has applied to join ${BRAND_NAME} and has listed `
    + `${input.employerName} as a previous employer. With their written consent, `
    + 'we would be grateful if you could confirm the following.',
  )
  lines.push('')

  for (const f of VERIFICATION_FIELDS) {
    if (f.key === 'verifier') continue
    const claimed = input.claimed?.[f.key]?.trim()
    lines.push(claimed ? `  ${f.label}: ${claimed}` : `  ${f.label}:`)
  }
  lines.push('')
  lines.push(
    'Where we have filled something in, that is what the candidate has told us — '
    + 'please correct anything that does not match your records. Two further '
    + 'questions if you are able to answer them:',
  )
  lines.push('')
  lines.push('  · How would you describe their conduct and reliability?')
  lines.push('  · Would you re-employ them?')
  lines.push('')
  lines.push(
    'Anything you share is treated confidentially and used only for this '
    + 'employment decision. A short reply to this email is enough — there is no '
    + 'form to complete.',
  )
  lines.push('')
  lines.push('Thank you for your time.')
  lines.push('')
  lines.push(`${BRAND_NAME} — People & Culture`)
  lines.push(ENTITIES.PK.address)
  lines.push(HR_EMAIL)

  return {
    subject: `Employment verification — ${input.employeeName}`,
    body: lines.join('\n'),
  }
}

/** The chaser, for a request that has gone quiet. */
export function buildChaser(input: {
  employeeName: string
  contactName?: string | null
  daysSince: number
}): EmailDraft {
  return {
    subject: `Following up — employment verification for ${input.employeeName}`,
    body: [
      input.contactName?.trim() ? `Dear ${input.contactName.trim()},` : 'Dear Sir or Madam,',
      '',
      `I wrote ${input.daysSince} day${input.daysSince === 1 ? '' : 's'} ago asking to `
      + `confirm ${input.employeeName}'s employment with you. I appreciate these `
      + 'requests are easy to miss.',
      '',
      'If it is simpler, confirming just the dates and job title would be a great '
      + 'help — I can work from that.',
      '',
      'If you are not the right person for this, please point me to whoever is.',
      '',
      'Thank you,',
      '',
      `${BRAND_NAME} — People & Culture`,
      HR_EMAIL,
    ].join('\n'),
  }
}
