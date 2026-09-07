'use client'

/**
 * The month you pick your days on.
 *
 * Two date inputs can only describe one unbroken block, which is why "some
 * days work from home, some days leave" had no way in. A calendar lets you
 * click the days you actually mean, including days that are not next to each
 * other, and shows you what you are picking against: weekends, public
 * holidays, days you have already booked, and how much of your department is
 * already away.
 *
 * It only reports the selection. What happens to those days — leave or WFH,
 * whole or half — is decided by the form around it.
 */

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface PlannerData {
  headcount: number
  holidays: { date: string; name: string; type: string }[]
  mine: Record<string, { status: string; category: string; leaveType: string }[]>
  team: Record<string, { name: string; category: string; pending: boolean }[]>
}

interface Props {
  /** YYYY-MM of the month on show. */
  month: string
  onMonthChange: (m: string) => void
  /** Selected days, as YYYY-MM-DD. */
  selected: string[]
  onToggle: (day: string) => void
  planner: PlannerData | null
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Contiguous runs of selected days — one leave request each. */
export function runsOf(days: string[]): { from: string; to: string; days: string[] }[] {
  const sorted = [...days].sort()
  const runs: { from: string; to: string; days: string[] }[] = []
  for (const d of sorted) {
    const last = runs[runs.length - 1]
    if (last) {
      const next = new Date(last.to + 'T00:00:00')
      next.setDate(next.getDate() + 1)
      if (key(next) === d) { last.to = d; last.days.push(d); continue }
    }
    runs.push({ from: d, to: d, days: [d] })
  }
  return runs
}

export function LeaveCalendar({ month, onMonthChange, selected, onToggle, planner }: Props) {
  const [y, m] = month.split('-').map(Number)
  const today = key(new Date())

  const { first, cells } = useMemo(() => {
    const firstOfMonth = new Date(y, m - 1, 1)
    const out: (Date | null)[] = []
    for (let i = 0; i < firstOfMonth.getDay(); i++) out.push(null)
    const last = new Date(y, m, 0).getDate()
    for (let d = 1; d <= last; d++) out.push(new Date(y, m - 1, d))
    return { first: firstOfMonth, cells: out }
  }, [y, m])

  const holidayBy = new Map((planner?.holidays ?? []).map((h) => [h.date, h]))
  const sel = new Set(selected)

  const shift = (by: number) => {
    const d = new Date(y, m - 1 + by, 1)
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month"
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-slate-900">
          {first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </p>
        <button type="button" onClick={() => shift(1)} aria-label="Next month"
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW.map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={'x' + i} />
          const k = key(d)
          const weekend = d.getDay() === 0 || d.getDay() === 6
          const hol = holidayBy.get(k)
          const mine = planner?.mine[k] ?? []
          const team = planner?.team[k] ?? []
          const isSel = sel.has(k)
          const blocked = weekend || !!hol || mine.length > 0

          const title = [
            hol ? hol.name : null,
            mine.length ? `You are already booked (${mine[0].category === 'WFH' ? 'WFH' : mine[0].leaveType})` : null,
            team.length ? `${team.length} away: ${team.map((t) => t.name).join(', ')}` : null,
          ].filter(Boolean).join(' · ')

          return (
            <button
              key={k}
              type="button"
              title={title || undefined}
              disabled={blocked}
              onClick={() => onToggle(k)}
              className={[
                'relative aspect-square rounded-md text-[13px] flex flex-col items-center justify-center transition',
                isSel ? 'bg-slate-900 text-white font-semibold'
                  : blocked ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                    : 'hover:bg-slate-100 text-slate-700',
                !isSel && k === today ? 'ring-1 ring-slate-400' : '',
              ].join(' ')}
            >
              {d.getDate()}
              {/* How many of the department are already away that day. */}
              {!isSel && team.length > 0 && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {team.slice(0, 3).map((t, n) => (
                    <span key={n}
                      className={`w-1 h-1 rounded-full ${t.pending ? 'bg-amber-400' : 'bg-slate-400'}`} />
                  ))}
                </span>
              )}
              {!isSel && hol && <span className="absolute bottom-0.5 text-[8px] text-slate-400">hol</span>}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-slate-900 inline-block" /> picked
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-slate-50 border border-slate-200 inline-block" /> weekend, holiday or already booked
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-slate-400 inline-block" /> a colleague is away
        </span>
      </div>
    </div>
  )
}
