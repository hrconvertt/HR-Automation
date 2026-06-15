'use client'

/**
 * BulkPipelineActions — toolbar on the candidates kanban.
 * - "Move top N to SCREENING" advances the highest-scored APPLIED candidates.
 * - "Reject remaining" rejects everyone still in APPLIED/SCREENING for the role.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowRight, X } from 'lucide-react'

interface Props {
  openRequisitions: Array<{ id: string; title: string }>
}

export function BulkPipelineActions({ openRequisitions }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [requisitionId, setRequisitionId] = useState(openRequisitions[0]?.id ?? '')
  const [n, setN] = useState(10)

  if (openRequisitions.length === 0) return null

  async function moveTopN() {
    if (!requisitionId) return
    if (!confirm(`Move top ${n} APPLIED candidates to SCREENING?`)) return
    setBusy('move')
    const res = await fetch('/api/recruiting/candidates/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'MOVE_TOP_N_TO_SCREENING', requisitionId, n }),
    })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Failed')
      return
    }
    const d = await res.json()
    alert(`Moved ${d.moved} candidate(s) to SCREENING`)
    router.refresh()
  }

  async function rejectRemaining() {
    if (!requisitionId) return
    if (!confirm('Reject all remaining APPLIED + SCREENING candidates for this role? They will be drafted a rejection email.')) return
    setBusy('reject')
    const res = await fetch('/api/recruiting/candidates/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'REJECT_REMAINING', requisitionId, keepIds: [] }),
    })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Failed')
      return
    }
    const d = await res.json()
    alert(`Rejected ${d.rejected} candidate(s). Templated rejection emails are queued in drafts.`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={requisitionId}
        onChange={(e) => setRequisitionId(e.target.value)}
        className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-white"
      >
        {openRequisitions.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
      </select>
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
        className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
      >
        <X className="w-3 h-3 mr-1" />
        {busy === 'reject' ? 'Rejecting…' : 'Reject remaining'}
      </Button>
    </div>
  )
}
