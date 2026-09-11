'use client'

/**
 * "Add as topic to check-in" — Workday's one-click hand-off from a suggested
 * action to the next one-to-one. If nothing is scheduled, the API books one a
 * week out, so the click never dead-ends in "schedule a meeting first".
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import type { TopicSeed } from '@/lib/queries/team-insights'
import { fmtDay, readError } from './format'

export function AddTopicButton({ employeeId, topic, onCheckIn }: {
  employeeId: string
  topic: TopicSeed
  /** Already on a scheduled check-in on this date. */
  onCheckIn?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [addedFor, setAddedFor] = useState<string | null>(onCheckIn ?? null)

  if (addedFor) {
    return <span className="text-xs text-slate-500">On the check-in for {addedFor}</span>
  }

  async function add() {
    setBusy(true)
    try {
      const res = await fetch('/api/talent/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, ...topic }),
      })
      if (!res.ok) { toastError('Could not add the topic', await readError(res)); return }
      const d = await res.json() as { scheduledFor: string; scheduledNow?: boolean; already?: boolean }
      const when = fmtDay(d.scheduledFor)
      setAddedFor(when)
      toastSuccess(d.scheduledNow
        ? `Check-in scheduled for ${when}, with this as a topic`
        : d.already ? `Already on the check-in for ${when}` : `Added to the check-in on ${when}`)
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={busy}
      className="text-sm font-medium text-slate-900 underline underline-offset-2 hover:text-black disabled:opacity-40"
    >
      {busy ? 'Adding…' : 'Add as topic to check-in'}
    </button>
  )
}
