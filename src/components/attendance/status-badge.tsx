/**
 * StatusBadge — single source of truth for attendance/leave cell colours.
 *
 * Statuses mirror the source xlsx cell values:
 *   P   present (yes)         green
 *   WFH work from home        blue
 *   L   full-day leave        red
 *   H   half day              amber
 *   A   absent / blank        gray
 *   WE  weekend               light gray hatch
 */

import { ReactElement } from 'react'

export type Status = 'P' | 'L' | 'WFH' | 'H' | 'A' | 'WE'

const STATUS_STYLES: Record<Status, { bg: string; text: string; label: string; title: string }> = {
  P:   { bg: 'bg-emerald-100',  text: 'text-emerald-800', label: 'P',   title: 'Present' },
  WFH: { bg: 'bg-sky-100',      text: 'text-sky-800',     label: 'WFH', title: 'Work From Home' },
  L:   { bg: 'bg-rose-100',     text: 'text-rose-800',    label: 'L',   title: 'Leave (Full Day)' },
  H:   { bg: 'bg-amber-100',    text: 'text-amber-800',   label: 'H',   title: 'Half Day' },
  A:   { bg: 'bg-slate-100',    text: 'text-slate-500',   label: '—',   title: 'Absent / No Record' },
  WE:  { bg: 'bg-slate-200/50', text: 'text-slate-400',   label: '',    title: 'Weekend' },
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
        className="inline-flex items-center justify-center rounded text-[10px] font-medium bg-white text-slate-300 w-7 h-6"
        title="Not yet recorded"
      >
        ·
      </span>
    )
  }
  const s = STATUS_STYLES[status]
  const dims = size === 'md' ? 'w-9 h-7 text-xs' : 'w-7 h-6 text-[10px]'
  // Weekend gets a subtle diagonal stripe pattern via CSS so HR sees the
  // xlsx-style "weekend gutter" at a glance.
  const weekendPattern = status === 'WE'
    ? 'bg-[repeating-linear-gradient(45deg,rgba(148,163,184,0.18)_0px,rgba(148,163,184,0.18)_2px,transparent_2px,transparent_5px)]'
    : ''
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-semibold ${dims} ${s.bg} ${s.text} ${weekendPattern}`}
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
