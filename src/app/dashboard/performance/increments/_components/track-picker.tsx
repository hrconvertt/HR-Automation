'use client'

/**
 * Which cycle a person is on, changed in place.
 *
 * Both tracks run side by side at Convertt, so this is a per-person setting
 * rather than a company one. Changing it moves their next due date as well as
 * the percentage — six-monthly and annual are not the same wait — so the row
 * refreshes rather than just repainting the cell.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { INCREMENT_RULES, ruleRange, type IncrementTrack } from '@/lib/pay-split'
import { Loader2 } from 'lucide-react'

const CHOOSABLE: IncrementTrack[] = ['ANNUAL', 'BIANNUAL']

export function TrackPicker({ employeeId, value }: {
  employeeId: string
  value: string
}) {
  const router = useRouter()
  const [track, setTrack] = useState<IncrementTrack>(
    CHOOSABLE.includes(value as IncrementTrack) ? (value as IncrementTrack) : 'ANNUAL',
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  async function save(next: IncrementTrack) {
    const previous = track
    setTrack(next)
    setBusy(true)
    setErr(false)
    const res = await fetch(`/api/employees/${employeeId}/increment-track`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incrementTrack: next }),
    })
    setBusy(false)
    if (!res.ok) {
      // Put the cell back rather than leaving it showing something unsaved.
      setTrack(previous)
      setErr(true)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={track}
        disabled={busy}
        onChange={(e) => save(e.target.value as IncrementTrack)}
        className={`text-xs rounded-md border px-1.5 py-1 bg-white focus:outline-none
          focus:ring-2 focus:ring-slate-200 ${err ? 'border-red-300' : 'border-slate-200'}`}
        title={INCREMENT_RULES[track].note}
      >
        {CHOOSABLE.map((t) => (
          <option key={t} value={t}>{INCREMENT_RULES[t].label}</option>
        ))}
      </select>
      {busy && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
    </div>
  )
}

/** The band that goes with a track — read-only, it follows the dropdown. */
export function TrackBand({ value }: { value: string }) {
  const track = (CHOOSABLE.includes(value as IncrementTrack)
    ? value
    : 'ANNUAL') as IncrementTrack
  const rule = INCREMENT_RULES[track]
  return (
    <div className="text-right">
      <span className="tabular-nums font-medium text-slate-900">{ruleRange(track)}</span>
      <span className="block text-[11px] text-slate-400">
        every {rule.cycleMonths} months
      </span>
    </div>
  )
}
