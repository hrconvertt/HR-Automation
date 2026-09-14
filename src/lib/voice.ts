/**
 * Employee Voice — the pulse, read the way Peakon reads it.
 *
 * Everything is shown on 0–10. The six built-in driver questions were asked
 * on a 1–5 agreement scale before this existed, and stay that way so old
 * rounds still mean what they meant; they are stretched onto 0–10 for display
 * (1 → 0, 3 → 5, 5 → 10). Custom questions are asked on 0–10, as Peakon
 * requires, framed so that 10 is the good answer.
 *
 * There is no external benchmark here. Peakon compares against its "True
 * Benchmark"; Convertt has no such data, so every comparison is with its own
 * previous round — which is the comparison a company this size can act on.
 *
 * Free of server imports so client components share it.
 */
import { PULSE_DRIVERS, MIN_RESPONSES } from '@/lib/pulse'

export { MIN_RESPONSES }

export const ENGAGEMENT_QUESTION = 'How likely is it you would recommend Convertt as a place to work?'

export const DRIVER_BLURB: Record<string, string> = {
  workload: 'Whether the amount of work is sustainable.',
  support: 'Whether people can get help from their lead when it matters.',
  growth: 'Whether people are learning and becoming better at their work.',
  recognition: 'Whether good work is noticed.',
  clarity: 'Whether people know what is expected and how they are judged.',
  belonging: 'Whether people feel safe raising a concern.',
}

export const DRIVERS = PULSE_DRIVERS.map((d) => ({ key: d.key, label: d.label, blurb: DRIVER_BLURB[d.key] ?? '' }))
export const DRIVER_KEYS = DRIVERS.map((d) => d.key)
export function driverLabel(key: string): string {
  return DRIVERS.find((d) => d.key === key)?.label ?? key
}

/** An answer on its own scale, as 0–10 to one decimal. */
export function toTen(value: number, scale: number): number {
  if (scale === 10) return value
  return Math.round((value - 1) * 2.5 * 10) / 10
}

export function scoreBand(score: number | null): { label: string; ink: string; bar: string } {
  if (score == null) return { label: 'Not enough answers', ink: 'text-slate-400', bar: 'bg-slate-300' }
  if (score >= 8) return { label: 'Strong', ink: 'text-emerald-700', bar: 'bg-emerald-500' }
  if (score >= 7) return { label: 'Healthy', ink: 'text-emerald-700', bar: 'bg-emerald-400' }
  if (score >= 6) return { label: 'Room for improvement', ink: 'text-amber-700', bar: 'bg-amber-400' }
  return { label: 'Needs attention', ink: 'text-red-700', bar: 'bg-red-500' }
}

/** How far a score can be trusted, from how many answered and out of how many. */
export function accuracyOf(responses: number, invited: number): 'High' | 'Medium' | 'Low' {
  const rate = invited ? responses / invited : 0
  if (responses >= 10 && rate >= 0.7) return 'High'
  if (responses >= MIN_RESPONSES && rate >= 0.4) return 'Medium'
  return 'Low'
}

export const VOICE_TABS = [
  { key: 'insight', label: 'Insight' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'improve', label: 'Improve' },
  { key: 'admin', label: 'Administration' },
] as const

export const ACTION_STATUSES = ['OPEN', 'DONE'] as const
