/**
 * The nine-box: performance against potential.
 *
 * Performance is read off the appraisal score rather than typed, so the grid
 * and the form cannot disagree about the same person. Potential is a
 * judgement and has to be entered — no arithmetic knows whether somebody
 * could do the next job.
 *
 * Three by three, because five by five is a discussion nobody finishes.
 */

/** The appraisal bands, mapped onto the grid's three performance rows. */
export function performanceFromScore(score: number | null | undefined): number | null {
  if (score == null) return null
  if (score >= 80) return 3        // Very Good and Outstanding
  if (score >= 70) return 2        // Good
  return 1                          // Average and Poor
}

export const AXIS_LABELS = {
  performance: { 1: 'Below', 2: 'Meets', 3: 'Exceeds' },
  potential: { 1: 'Limited', 2: 'Growing', 3: 'High' },
} as const

export interface Box {
  performance: number
  potential: number
  name: string
  /** What the box means for what you do next. */
  action: string
  tone: string
}

/**
 * The nine, named for what to do rather than what they are. "Solid performer"
 * tells you nothing; "keep, and find them something harder" does.
 */
export const BOXES: Box[] = [
  { performance: 3, potential: 3, name: 'Successor', action: 'Ready for more. Name the role they are cover for.', tone: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
  { performance: 3, potential: 2, name: 'Growing star', action: 'Stretch the work before someone else does.', tone: 'bg-emerald-50/70 border-emerald-100 text-emerald-900' },
  { performance: 3, potential: 1, name: 'Expert', action: 'Keep them where they are strong. Pay accordingly.', tone: 'bg-sky-50 border-sky-200 text-sky-900' },

  { performance: 2, potential: 3, name: 'High potential', action: 'Performance will follow if the work is right. Invest.', tone: 'bg-emerald-50/70 border-emerald-100 text-emerald-900' },
  { performance: 2, potential: 2, name: 'Core', action: 'The middle of the company. Do not neglect.', tone: 'bg-slate-50 border-slate-200 text-slate-800' },
  { performance: 2, potential: 1, name: 'Steady', action: 'Reliable in role. No action needed.', tone: 'bg-slate-50 border-slate-200 text-slate-700' },

  { performance: 1, potential: 3, name: 'Misplaced', action: 'Capable, wrong seat. Move them before they leave.', tone: 'bg-amber-50 border-amber-200 text-amber-900' },
  { performance: 1, potential: 2, name: 'Needs support', action: 'Find out what is in the way. Coach.', tone: 'bg-amber-50 border-amber-200 text-amber-900' },
  { performance: 1, potential: 1, name: 'Underperforming', action: 'A conversation, then a plan with dates. This is a PIP.', tone: 'bg-red-50 border-red-200 text-red-900' },
]

export function boxFor(performance: number | null, potential: number | null): Box | null {
  if (!performance || !potential) return null
  return BOXES.find((b) => b.performance === performance && b.potential === potential) ?? null
}

export const FLIGHT_RISK = [
  { value: 'LOW', label: 'Low', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
  { value: 'MEDIUM', label: 'Medium', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'HIGH', label: 'High', tone: 'bg-red-50 text-red-800 border-red-200' },
] as const

/** The current cycle label, so a grid opened in September lands in one place. */
export function currentCycle(now = new Date()): string {
  return String(now.getUTCFullYear())
}
