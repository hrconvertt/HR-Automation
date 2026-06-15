'use client'

/**
 * KnockoutOverrideButton — shown on FAILED-knockout candidate cards.
 * HR enters a reason; on submit the candidate is flipped to OVERRIDDEN
 * and scored. The candidate then appears on the main kanban.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ShieldCheck } from 'lucide-react'

interface Props {
  candidateId: string
  candidateName: string
}

export function KnockoutOverrideButton({ candidateId, candidateName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (reason.trim().length < 3) { setError('Reason is required'); return }
    setSubmitting(true)
    const res = await fetch(`/api/recruiting/candidates/${candidateId}/override-knockout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Failed')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
      >
        <ShieldCheck className="w-3 h-3" /> Override
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override knockout — {candidateName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-slate-500">
              Use this when a candidate is borderline. They&apos;ll be scored and moved back to the main kanban.
              The reason is logged in the audit trail.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Why override? e.g. relocating to Lahore next month"
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? 'Overriding…' : 'Override + score'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
