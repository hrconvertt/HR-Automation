'use client'

/**
 * The requisition dropdown at the top of the workspace. It replaced a rail of
 * roles down the left, which took a column of screen from the candidate table.
 * Live roles first, finished ones after, each with its count and age.
 */

import { useRouter } from 'next/navigation'
import type { RailItem } from '@/lib/queries/requisition-workspace'

const STATUS_WORD: Record<string, string> = { OPEN: 'Open', PAUSED: 'Paused', FILLED: 'Filled', CLOSED: 'Closed' }

function describe(r: RailItem): string {
  const age = r.ageDays === 0 ? 'today' : `${r.ageDays} day${r.ageDays === 1 ? '' : 's'} ago`
  const word = r.ageFrom === 'posted' ? 'posted' : 'raised'
  return `${r.title} — ${r.candidates} ${r.candidates === 1 ? 'candidate' : 'candidates'} · ${STATUS_WORD[r.status] ?? r.status} · ${word} ${age}`
}

export function RequisitionPicker({ rail, selectedId, sub }: {
  rail: RailItem[]
  selectedId: string | null
  sub: 'candidates' | 'details'
}) {
  const router = useRouter()
  const live = rail.filter((r) => r.status === 'OPEN' || r.status === 'PAUSED')
  const done = rail.filter((r) => r.status !== 'OPEN' && r.status !== 'PAUSED')

  return (
    <label className="flex items-center gap-3 min-w-0 flex-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
        Requisition
      </span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => router.push(
          `/dashboard/recruiting?tab=workspace&req=${e.target.value}${sub === 'details' ? '&sub=details' : ''}`,
        )}
        className="h-10 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      >
        {live.length > 0 && (
          <optgroup label={`Open and paused (${live.length})`}>
            {live.map((r) => <option key={r.id} value={r.id}>{describe(r)}</option>)}
          </optgroup>
        )}
        {done.length > 0 && (
          <optgroup label={`Filled and closed (${done.length})`}>
            {done.map((r) => <option key={r.id} value={r.id}>{describe(r)}</option>)}
          </optgroup>
        )}
      </select>
    </label>
  )
}
