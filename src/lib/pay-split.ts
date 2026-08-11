/**
 * How a gross figure is split into pay components, and what an increment is
 * worth on each track.
 *
 * Two records used to hold the same fact and drift apart: CompensationHistory
 * said what someone earns, Salary said what they are paid, and nothing kept
 * them in step. Zuhaa read 56,000 against a history of 55,000; another record
 * read 85,000 against 95,000. Neither was a calculation error — they were two
 * numbers nobody had reconciled since the day they were typed.
 *
 * Recording a compensation event now rewrites the components from it, and this
 * is the rule it uses.
 */

/** Utilities take 2% of gross; basic takes the rest. */
export const UTILITIES_PCT = 0.02

export interface PaySplit {
  basic: number
  utilities: number
  gross: number
}

/**
 * Split a gross monthly figure.
 *
 * Utilities is rounded and basic takes the remainder, so the parts always add
 * back to the gross exactly — splitting by percentage and rounding both halves
 * independently is how a payslip ends up a rupee short of what was agreed.
 */
export function splitGross(gross: number): PaySplit {
  const g = Math.round(gross)
  if (g <= 0) return { basic: 0, utilities: 0, gross: 0 }
  const utilities = Math.round(g * UTILITIES_PCT)
  return { basic: g - utilities, utilities, gross: g }
}

// ─── Increment rules ────────────────────────────────────────────────────────
// What a raise is worth and when the next falls due, by track.
//
//   Probation ends      → confirmed permanent, 10%
//   Six-monthly track   → 10-15% every six months from confirmation
//   Annual track        → 24% once a year
//
// Starting figures, not a cap: a number can always be overridden. The point of
// stating them is that nobody re-derives them from memory each review.

export type IncrementTrack = 'PROBATION_TO_PERMANENT' | 'BIANNUAL' | 'ANNUAL'

export interface IncrementRule {
  label: string
  /** Lower bound, as a percentage. */
  minPct: number
  /** Upper bound. Equal to minPct where the figure is fixed. */
  maxPct: number
  /** How long until the next one falls due, in months. */
  cycleMonths: number
  note: string
}

export const INCREMENT_RULES: Record<IncrementTrack, IncrementRule> = {
  PROBATION_TO_PERMANENT: {
    label: 'Probation → permanent',
    minPct: 10,
    maxPct: 10,
    cycleMonths: 6,
    note: 'Given on confirmation. The six-monthly clock starts from here.',
  },
  BIANNUAL: {
    label: 'Six-monthly',
    minPct: 10,
    maxPct: 15,
    cycleMonths: 6,
    note: 'Every six months after confirmation — one at six, another at twelve, '
      + 'and so on. The band leaves room for performance.',
  },
  ANNUAL: {
    label: 'Annual',
    minPct: 24,
    maxPct: 24,
    cycleMonths: 12,
    note: 'Once a year, for anyone not on the six-monthly track.',
  },
}

/** What a raise on this track comes to, from a current gross. */
export function incrementFor(gross: number, track: IncrementTrack, pct?: number): {
  pct: number
  rise: number
  newGross: number
  split: PaySplit
} {
  const rule = INCREMENT_RULES[track]
  const applied = pct ?? rule.minPct
  const newGross = Math.round(gross * (1 + applied / 100))
  return {
    pct: applied,
    rise: newGross - Math.round(gross),
    newGross,
    split: splitGross(newGross),
  }
}

/** "10%" or "10–15%" — how a rule reads on screen. */
export function ruleRange(track: IncrementTrack): string {
  const r = INCREMENT_RULES[track]
  return r.minPct === r.maxPct ? `${r.minPct}%` : `${r.minPct}–${r.maxPct}%`
}
