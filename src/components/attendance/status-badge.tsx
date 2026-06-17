/**
 * StatusBadge — single source of truth for attendance/leave cell rendering.
 *
 * Statuses mirror the source xlsx cell values. The brand is monochrome —
 * every status is distinguished by **weight, fill, border, and pattern**
 * (NOT colour). A reader who is colour-blind, printing in black and white,
 * or looking at a low-end display still gets the same information.
 *
 *   P   present (yes)         solid charcoal block, white label
 *   WFH work from home        outlined, slate label
 *   L   full-day leave        solid charcoal with hatched overlay
 *   H   half day              split fill (left half charcoal, right half white)
 *   A   absent / blank        muted dash
 *   WE  weekend               diagonal stripe pattern
 */

import { ReactElement } from 'react'

export type Status = 'P' | 'L' | 'WFH' | 'H' | 'A' | 'WE'

interface BadgeStyle {
  bg: string
  text: string
  border: string
  label: string
  title: string
  /** Optional pattern overlay class (already includes its own background). */
  pattern?: string
  /** Font weight class. */
  weight?: string
}

const STATUS_STYLES: Record<Status, BadgeStyle> = {
  P:   { bg: 'bg-slate-900',    text: 'text-white',       border: 'border border-slate-900', label: 'P',   title: 'Present', weight: 'font-bold' },
  WFH: { bg: 'bg-white',        text: 'text-slate-900',   border: 'border border-slate-900', label: 'WFH', title: 'Work From Home', weight: 'font-semibold' },
  L:   { bg: 'bg-slate-900',    text: 'text-white',       border: 'border border-slate-900', label: 'L',   title: 'Leave (Full Day)', weight: 'font-bold',
         pattern: 'bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.18)_0px,rgba(255,255,255,0.18)_1px,transparent_1px,transparent_4px)]' },
  H:   { bg: 'bg-white',        text: 'text-slate-900',   border: 'border border-slate-900', label: 'H',   title: 'Half Day', weight: 'font-bold',
         pattern: 'bg-[linear-gradient(to_right,#0A0A0A_50%,#FFFFFF_50%)]' },
  A:   { bg: 'bg-slate-100',    text: 'text-slate-400',   border: 'border border-slate-200', label: '—',   title: 'Absent / No Record', weight: 'font-medium' },
  WE:  { bg: 'bg-white',        text: 'text-slate-400',   border: 'border border-slate-100', label: '',    title: 'Weekend' },
}

interface StatusBadgeProps {
  status: Status
  /** When true, render a future/blank cell instead of treating "A" as absent. */
  future?: boolean
  /** Optional override label (e.g. for header day numbers). */
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, future, size = 'sm' }: StatusBadgeProps): ReactElement {
  if (future) {
    return (
      <span
        className="inline-flex items-center justify-center rounded text-[10px] font-medium bg-white text-slate-300 border border-slate-100 w-7 h-6"
        title="Not yet recorded"
      >
        ·
      </span>
    )
  }
  const s = STATUS_STYLES[status]
  const dims = size === 'md' ? 'w-9 h-7 text-xs' : 'w-7 h-6 text-[10px]'
  const weight = s.weight ?? 'font-semibold'

  // Weekend gets a subtle diagonal stripe pattern via CSS so HR sees the
  // xlsx-style "weekend gutter" at a glance — kept monochrome.
  const weekendPattern = status === 'WE'
    ? 'bg-[repeating-linear-gradient(45deg,rgba(15,23,42,0.10)_0px,rgba(15,23,42,0.10)_2px,transparent_2px,transparent_5px)]'
    : ''

  // Half-day pattern needs its own foreground label to remain readable on
  // the split-fill background — drop a contrast outline on the label.
  const halfTextOutline = status === 'H'
    ? '[text-shadow:0_0_2px_rgba(255,255,255,0.7),0_0_2px_rgba(255,255,255,0.7)]'
    : ''

  return (
    <span
      className={`inline-flex items-center justify-center rounded ${weight} ${dims} ${s.bg} ${s.text} ${s.border} ${s.pattern ?? ''} ${weekendPattern} ${halfTextOutline}`}
      title={s.title}
    >
      {s.label}
    </span>
  )
}

/** Tiny legend strip — drop above the grid so first-time users learn the codes. */
export function StatusLegend(): ReactElement {
  const items: { status: Status; label: string }[] = [
    { status: 'P', label: 'Present' },
    { status: 'WFH', label: 'WFH' },
    { status: 'L', label: 'Leave' },
    { status: 'H', label: 'Half Day' },
    { status: 'A', label: 'Absent' },
    { status: 'WE', label: 'Weekend' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      {items.map((it) => (
        <span key={it.status} className="inline-flex items-center gap-1.5">
          <StatusBadge status={it.status} />
          <span>{it.label}</span>
        </span>
      ))}
    </div>
  )
}
