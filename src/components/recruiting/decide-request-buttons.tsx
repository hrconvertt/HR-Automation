'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CheckCircle2, XCircle } from 'lucide-react'

interface Props {
  requisitionId: string
  title: string
}

/**
 * Approve / Reject pair shown next to a PENDING requisition.
 * HR_ADMIN only — rendered conditionally by the page.
 */
export function DecideRequestButtons({ requisitionId, title }: Props) {
  const router = useRouter()
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError(''); setSaving(true)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed'); return }
    setDecision(null); setNote('')
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDecision('APPROVE')}
          className="text-emerald-700 hover:bg-emerald-50 h-7 px-2"
          title="Approve request"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDecision('REJECT')}
          className="text-rose-700 hover:bg-rose-50 h-7 px-2"
          title="Reject request"
        >
          <XCircle className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decision === 'APPROVE' ? 'Approve hiring request' : 'Reject hiring request'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              <span className="text-slate-500">Role:</span> <span className="font-medium">{title}</span>
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Note for the manager {decision === 'REJECT' ? '*' : <span className="font-normal text-slate-400">(optional)</span>}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={decision === 'APPROVE'
                  ? 'Optional context — budget approved, sourcing starting, etc.'
                  : 'Why is this being rejected? Budget hold, headcount freeze, role overlap…'}
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={saving}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={saving || (decision === 'REJECT' && !note.trim())}
              className={decision === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}
            >
              {saving ? 'Saving…' : decision === 'APPROVE' ? 'Approve & Open' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
