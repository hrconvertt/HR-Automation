'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props {
  offerId: string
  candidateName: string
}

type Action = 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'

/**
 * Accept / Reject / Withdraw buttons for a PENDING JobOffer.
 * Renders three small inline buttons; clicking Reject opens a reason dialog.
 */
export function OfferActions({ offerId, candidateName }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmAction, setConfirmAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')

  async function submit(status: Action, rejectionReason?: string) {
    setBusy(true); setError('')
    const res = await fetch(`/api/recruiting/offers/${offerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rejectionReason }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error || 'Action failed'); return }
    setConfirmAction(null); setReason('')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="default"
        className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={() => submit('ACCEPTED')}
        disabled={busy}
      >
        Accept
      </Button>
      <Button size="sm" variant="outline"
        className="h-7 text-[11px] px-2 text-rose-700 border-rose-200 hover:bg-rose-50"
        onClick={() => setConfirmAction('REJECTED')}
        disabled={busy}
      >
        Reject
      </Button>
      <Button size="sm" variant="ghost"
        className="h-7 text-[11px] px-2 text-slate-600"
        onClick={() => setConfirmAction('WITHDRAWN')}
        disabled={busy}
      >
        Withdraw
      </Button>

      {error && <span className="text-[11px] text-red-600 ml-2">{error}</span>}

      <Dialog open={confirmAction !== null} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'REJECTED' ? 'Reject offer' : 'Withdraw offer'}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-3">
            <p className="text-slate-600">
              {confirmAction === 'REJECTED'
                ? `Mark ${candidateName}'s offer as rejected by the candidate.`
                : `Withdraw the offer to ${candidateName}.`}
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Reason {confirmAction === 'REJECTED' && <span className="text-rose-600">*</span>}
              </label>
              <textarea
                value={reason} onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={confirmAction === 'REJECTED' ? 'Why did the candidate decline?' : 'Why are we withdrawing?'}
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={() => confirmAction && submit(confirmAction, reason.trim() || undefined)}
              disabled={busy || (confirmAction === 'REJECTED' && !reason.trim())}
              className={confirmAction === 'REJECTED' ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''}
            >
              {busy ? 'Saving…' : confirmAction === 'REJECTED' ? 'Mark Rejected' : 'Withdraw Offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
