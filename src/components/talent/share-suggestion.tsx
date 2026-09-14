'use client'

/**
 * "Share with {name}" — a manager points a report to a flex team, a colleague
 * or a role, with a message. It lands on their Career Hub and they are told.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toastError, toastSuccess } from '@/components/ui/toaster'

export function ShareSuggestion({ kind, refId, what, employeeId, firstName, defaultMessage, people, label }: {
  kind: 'FLEX_TEAM' | 'CONNECTION' | 'ROLE'
  refId: string
  /** What is being shared, for the dialog title — "New Product flex team". */
  what: string
  /** Who it is for. Omit to pick from `people`. */
  employeeId?: string
  firstName?: string
  defaultMessage?: string
  people?: { id: string; fullName: string }[]
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [who, setWho] = useState(employeeId ?? '')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const name = firstName ?? people?.find((p) => p.id === who)?.fullName.split(' ')[0] ?? 'them'

  function start() {
    setWho(employeeId ?? '')
    setMessage(defaultMessage ?? '')
    setOpen(true)
  }

  async function send() {
    if (!who) return
    setBusy(true)
    try {
      const res = await fetch('/api/career/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: who, kind, refId, message }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not share it', (d as { error?: string }).error); return }
      toastSuccess(`Shared with ${name} — it is on their Career Hub`)
      setOpen(false)
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <>
      <button type="button" onClick={start}
        className="text-sm font-medium text-slate-900 underline underline-offset-2 hover:text-black">
        {label ?? (firstName ? `Share with ${firstName}` : 'Share with a report')}
      </button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share {what}</DialogTitle>
            <DialogDescription>
              When you send this, {name} gets a notification and finds it under Suggestions from your manager.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!employeeId && (
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">With</span>
                <select value={who} onChange={(e) => setWho(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
                  <option value="">Select a report…</option>
                  {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Message for {name}</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[100px]" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={send} disabled={busy || !who}>{busy ? 'Sharing…' : 'Share'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
