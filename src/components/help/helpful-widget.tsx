'use client'

/** "Was this article helpful?" with Yes and No, remembered per person. */
import { useState } from 'react'
import { toastError } from '@/components/ui/toaster'
import type { FeedbackRef } from '@/lib/help-center'

export function HelpfulWidget({ refType, refId, initial }: { refType: FeedbackRef; refId: string; initial: boolean | null }) {
  const [vote, setVote] = useState<boolean | null>(initial)
  const [busy, setBusy] = useState(false)

  async function send(helpful: boolean) {
    setBusy(true)
    try {
      const res = await fetch('/api/help/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refType, refId, helpful }),
      })
      if (!res.ok) { toastError('Could not save your answer', ((await res.json().catch(() => ({}))) as { error?: string }).error); return }
      setVote(helpful)
    } finally { setBusy(false) }
  }

  const btn = (on: boolean) =>
    `min-w-[88px] text-sm font-medium px-5 py-2 rounded-full border ${on ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-400 text-slate-900 hover:bg-slate-50'} disabled:opacity-40`

  return (
    <div className="border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap print:hidden">
      <p className="text-base font-semibold text-slate-900">
        {vote === null ? 'Was this article helpful?' : vote ? 'Thanks — glad it helped.' : 'Thanks for telling us. Create a case below if you still need help.'}
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => send(true)} className={btn(vote === true)}>Yes</button>
        <button type="button" disabled={busy} onClick={() => send(false)} className={btn(vote === false)}>No</button>
      </div>
    </div>
  )
}
