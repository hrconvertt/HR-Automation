/**
 * Promotions, as the HR Playbook defines them.
 *
 * Section 4.1 sets five levels and the notice period each carries. Section 4.4
 * sets four gates before a promotion is real, and says explicitly that "a
 * strong appraisal alone does not automatically promote". Section 4.5 sets the
 * promotion increment at "at least the new band's minimum, typically a 10–20%
 * increase, in addition to (not instead of) any earned annual increment".
 *
 * Those rules live here rather than in the form, so the letter, the checklist
 * and the warnings all read the same source.
 */

import { ENTITIES, type EntityKey } from '@/lib/brand'

// ── The ladder (Playbook 4.1) ───────────────────────────────────────────────

export const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const
export type Level = (typeof LEVELS)[number]

export interface LevelSpec {
  level: Level
  titlePattern: string
  defines: string
  /** Notice period in months. L1 is per contract, so null. */
  noticeMonths: number | null
}

export const LEVEL_SPECS: Record<Level, LevelSpec> = {
  L1: {
    level: 'L1',
    titlePattern: 'Trainee / Intern',
    defines: 'Learning the fundamentals under close guidance; work is reviewed before it ships.',
    noticeMonths: null,
  },
  L2: {
    level: 'L2',
    titlePattern: 'Associate / Junior',
    defines: 'Delivers defined tasks with support; building core competence; quality needs review.',
    noticeMonths: 1,
  },
  L3: {
    level: 'L3',
    titlePattern: 'Specialist',
    defines: 'Delivers independently and reliably across most of the role; owns tasks end-to-end; trusted with client contact.',
    noticeMonths: 1,
  },
  L4: {
    level: 'L4',
    titlePattern: 'Senior',
    defines: 'Handles complex and ambiguous work; sets quality standards; guides L1–L3; owns client relationships.',
    noticeMonths: 2,
  },
  L5: {
    level: 'L5',
    titlePattern: 'Lead',
    defines: 'Owns outcomes for an area or function; mentors the team; accountable for standards, delivery and client health.',
    noticeMonths: 2,
  },
}

export const LEVEL_LABEL = (l: string): string =>
  LEVELS.includes(l as Level) ? `${l} — ${LEVEL_SPECS[l as Level].titlePattern}` : l

/** Levels where Playbook 4.4 additionally requires a genuine business need. */
export function needsBusinessCase(level: string | null | undefined): boolean {
  return level === 'L4' || level === 'L5'
}

/** Whether the notice period changes on this move — the letter must say so. */
export function noticeChanges(from: string | null, to: string | null): boolean {
  if (!from || !to) return false
  const a = LEVEL_SPECS[from as Level]?.noticeMonths
  const b = LEVEL_SPECS[to as Level]?.noticeMonths
  return a != null && b != null && a !== b
}

// ── The increment (Playbook 4.5) ────────────────────────────────────────────

export const PROMOTION_INCREMENT_MIN_PCT = 10
export const PROMOTION_INCREMENT_MAX_PCT = 20

export interface SalaryCheck {
  pct: number | null
  /** Problems that should stop the letter being issued as-is. */
  errors: string[]
  /** Things worth saying out loud but not blocking. */
  warnings: string[]
}

/**
 * Check a proposed salary against the Playbook.
 *
 * Deliberately returns findings rather than clamping the number: HR is allowed
 * to go outside the rule with the Founder's written approval (4.3), and a form
 * that silently corrects the figure hides that decision.
 */
export function checkPromotionSalary(input: {
  fromSalary?: number | null
  toSalary?: number | null
  bandMin?: number | null
  bandMax?: number | null
}): SalaryCheck {
  const { fromSalary, toSalary, bandMin, bandMax } = input
  const errors: string[] = []
  const warnings: string[] = []

  const pct =
    fromSalary && toSalary && fromSalary > 0
      ? ((toSalary - fromSalary) / fromSalary) * 100
      : null

  if (toSalary != null && bandMin != null && toSalary < bandMin) {
    errors.push(
      `Below the band minimum. Playbook 4.5: a promotion moves the salary at least to the new band's minimum (${bandMin.toLocaleString('en-PK')}).`,
    )
  }
  if (toSalary != null && bandMax != null && toSalary > bandMax) {
    errors.push(
      `Above the band maximum (${bandMax.toLocaleString('en-PK')}). Playbook 4.3: out-of-band needs the Founder's written approval and a documented reason.`,
    )
  }
  if (pct != null && pct < PROMOTION_INCREMENT_MIN_PCT) {
    warnings.push(
      `${pct.toFixed(1)}% is below the typical ${PROMOTION_INCREMENT_MIN_PCT}–${PROMOTION_INCREMENT_MAX_PCT}% promotion increment.`,
    )
  }
  if (pct != null && pct > PROMOTION_INCREMENT_MAX_PCT) {
    warnings.push(
      `${pct.toFixed(1)}% is above the typical ${PROMOTION_INCREMENT_MIN_PCT}–${PROMOTION_INCREMENT_MAX_PCT}% promotion increment — worth a note in the reason.`,
    )
  }
  if (pct != null && pct <= 0) {
    errors.push('A promotion cannot reduce or freeze salary without a documented exception.')
  }

  return { pct, errors, warnings }
}

// ── The gates (Playbook 4.4) ────────────────────────────────────────────────

export interface Gate {
  key: 'evidence' | 'sponsorship' | 'fairness' | 'businessNeed' | 'approval'
  name: string
  requirement: string
}

export const GATES: Gate[] = [
  {
    key: 'evidence',
    name: 'Evidence',
    requirement:
      'At least two consecutive review periods rated "exceeds" on the current scorecard, with '
      + 'concrete work showing next-level dimensions — independence, scope, impact, leadership.',
  },
  {
    key: 'sponsorship',
    name: 'Sponsorship',
    requirement:
      'The Reporting Manager nominates in writing, citing the evidence against the next '
      + "level's definition.",
  },
  {
    key: 'fairness',
    name: 'Fairness check',
    requirement:
      'HR reviews for consistency across the team — same bar for everyone, no favouritism; '
      + 'internal candidates get first look at open roles.',
  },
  {
    key: 'businessNeed',
    name: 'Business need',
    requirement:
      'For L4–L5, a genuine need must exist (client load, team size). Readiness without a seat '
      + 'is handled honestly: told, developed, and prioritised for the next opening.',
  },
  {
    key: 'approval',
    name: 'Approval & letter',
    requirement:
      'Founder approves. The letter states the new level, title, band, salary and effective '
      + 'date — and updates the notice period if the new level requires it.',
  },
]

export interface GateState { key: Gate['key']; met: boolean }

/** Which gates are satisfied by what has actually been filled in. */
export function gateStates(p: {
  evidence?: string | null
  sponsorship?: string | null
  sponsorName?: string | null
  fairnessNote?: string | null
  businessNeed?: string | null
  toLevel?: string | null
  signatureDataUrl?: string | null
}): GateState[] {
  const filled = (s?: string | null) => !!s && s.trim().length > 0
  return [
    { key: 'evidence', met: filled(p.evidence) },
    { key: 'sponsorship', met: filled(p.sponsorship) && filled(p.sponsorName) },
    { key: 'fairness', met: filled(p.fairnessNote) },
    // Only a gate for L4–L5; below that it is satisfied by not applying.
    { key: 'businessNeed', met: !needsBusinessCase(p.toLevel) || filled(p.businessNeed) },
    { key: 'approval', met: filled(p.signatureDataUrl) },
  ]
}

// ── The letter ──────────────────────────────────────────────────────────────

export interface PromotionLetterInput {
  employeeName: string
  employeeCode?: string | null
  fromDesignation?: string | null
  toDesignation: string
  fromLevel?: string | null
  toLevel?: string | null
  fromSalary?: number | null
  toSalary?: number | null
  bandMin?: number | null
  bandMax?: number | null
  currency?: string
  effectiveDate: Date | string
  department?: string | null
  managerName?: string | null
  reason?: string | null
  entity?: EntityKey
  signedByName?: string | null
  signedByTitle?: string | null
}

function longDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '____________'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/**
 * The promotion letter body.
 *
 * Playbook 4.4 fixes what it has to state: new level, title, band, salary,
 * effective date, and the notice period if it changed. Everything else is
 * wording, and the wording is warm because a promotion letter is the one piece
 * of HR paper somebody keeps.
 */
export function buildPromotionLetter(i: PromotionLetterInput): string {
  const cur = i.currency ?? 'PKR'
  const n = (v?: number | null) => (v == null ? '____________' : `${cur} ${Math.round(v).toLocaleString('en-PK')}`)
  const entity = ENTITIES[i.entity ?? 'PK']

  const out: string[] = []

  out.push(`Dear ${i.employeeName},`)
  out.push('')
  out.push(
    'Following a review of your performance and a recommendation from your reporting '
    + `manager, we are pleased to confirm your promotion to **${i.toDesignation}**`
    + `${i.toLevel ? ` (${LEVEL_LABEL(i.toLevel)})` : ''}, effective ${longDate(i.effectiveDate)}.`,
  )
  out.push('')

  if (i.reason?.trim()) {
    out.push(i.reason.trim())
    out.push('')
  } else {
    out.push(
      'This decision reflects work you have already been doing at the next level — not a '
      + 'promise of what you might do, but recognition of what you have consistently '
      + 'delivered.',
    )
    out.push('')
  }

  out.push('Your revised terms are as follows:')
  out.push('')
  const rows: Array<[string, string]> = [
    ['Position', `${i.fromDesignation ?? '—'}  →  ${i.toDesignation}`],
  ]
  if (i.toLevel) {
    rows.push(['Level', `${i.fromLevel ? `${i.fromLevel}  →  ` : ''}${LEVEL_LABEL(i.toLevel)}`])
  }
  if (i.department) rows.push(['Department', i.department])
  if (i.managerName) rows.push(['Reporting to', i.managerName])
  rows.push(['Gross salary', `${n(i.fromSalary)}  →  ${n(i.toSalary)} per month`])
  if (i.bandMin != null && i.bandMax != null) {
    rows.push(['Salary band', `${n(i.bandMin)} – ${n(i.bandMax)}`])
  }
  rows.push(['Effective from', longDate(i.effectiveDate)])

  const noticeM = i.toLevel ? LEVEL_SPECS[i.toLevel as Level]?.noticeMonths : null
  if (noticeM != null) {
    rows.push(['Notice period', `${noticeM} month${noticeM === 1 ? '' : 's'}`])
  }
  if (i.employeeCode) rows.push(['Employee code', i.employeeCode])

  const w = Math.max(...rows.map(([k]) => k.length))
  for (const [k, v] of rows) out.push(`  ${k.padEnd(w)}   ${v}`)
  out.push('')

  if (noticeChanges(i.fromLevel ?? null, i.toLevel ?? null) && noticeM != null) {
    out.push(
      `Please note that your notice period changes to ${noticeM} months at this level, `
      + 'and your employment terms are updated accordingly. All other terms and conditions '
      + 'of your employment remain unchanged.',
    )
  } else {
    out.push('All other terms and conditions of your employment remain unchanged.')
  }
  out.push('')
  out.push(
    'Congratulations. We are glad to have you here, and we are looking forward to what you '
    + 'do next in this role.',
  )
  out.push('')
  out.push('With appreciation,')
  out.push('')
  out.push(i.signedByName ?? '___________________')
  if (i.signedByTitle) out.push(i.signedByTitle)
  out.push(entity.legalName)

  return out.join('\n')
}
