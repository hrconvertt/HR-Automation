'use client'

/**
 * BulkPipelineActions — the two bulk buttons on the pipeline.
 * - "Move top N to SCREENING" advances the highest-scored APPLIED candidates.
 * - "Reject remaining" rejects everyone still in APPLIED/SCREENING for the role.
 *
 * The role now comes from the filter above the board rather than a second
 * dropdown of its own. Two pickers meant the buttons could act on a role the
 * board was not showing, which is the kind of mistake that rejects the wrong
 * people.
 */
import { useState } from 'react'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowRight, X } from 'lucide-react'

interface Props {
  /** The role the board is filtered to. The buttons act on exactly this. */
  requisitionId: string
  requisitionTitle: string
}

export function BulkPipelineActions({ requisitionId, requisitionTitle }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [n, setN] = useState(10)

  if (!requisitionId) return null

  async function moveTopN() {
    if (!requisitionId) return
    if (!confirm(`Move top ${n} APPLIED candidates for ${requisitionTitle} to SCREENING?`)) return
    setBusy('move')
    const res = await fetch('/api/recruiting/candidates/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'MOVE_TOP_N_TO_SCREENING', requisitionId, n }),
    })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toastError('Failed', d.error)
      return
    }
    const d = await res.json()
    toastSuccess(`Moved ${d.moved} candidate(s) to SCREENING`)
    router.refresh()
  }

  async function rejectRemaining() {
    if (!requisitionId) return
    if (!confirm(`Reject all remaining APPLIED + SCREENING candidates for ${requisitionTitle}? They will be drafted a rejection email.`)) return
    setBusy('reject')
    const res = await fetch('/api/recruiting/candidates/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'REJECT_REMAINING', requisitionId, keepIds: [] }),
    })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toastError('Failed', d.error)
      return
    }
    const d = await res.json()
    toastSuccess(`Rejected ${d.rejected} candidate(s). Templated rejection emails are queued in drafts.`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="number"
        min={1}
        max={50}
        value={n}
        onChange={(e) => setN(Math.max(1, Math.min(50, Number(e.target.value) || 10)))}
        className="w-14 px-2 py-1 text-xs rounded-md border border-slate-300"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={moveTopN}
        disabled={busy !== null}
        className="text-xs"
      >
        <ArrowRight className="w-3 h-3 mr-1" />
        {busy === 'move' ? 'Moving…' : `Move top ${n} → SCREENING`}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={rejectRemaining}
        disabled={busy !== null}
        className="text-xs text-slate-700 border-slate-100 hover:bg-slate-50"
      >
        <X className="w-3 h-3 mr-1" />
        {busy === 'reject' ? 'Rejecting…' : 'Reject remaining'}
      </Button>
    </div>
  )
}
