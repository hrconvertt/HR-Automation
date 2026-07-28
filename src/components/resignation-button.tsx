'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  employeeType: string
  defaultLastDay?: string
}

export function ResignationButton({ employeeType, defaultLastDay }: Props) {
  const [open, setOpen] = useState(false)
  const defaultDays = employeeType === 'PERMANENT' ? 30 : 14
  const def = defaultLastDay ?? new Date(Date.now() + defaultDays * 86400000).toISOString().slice(0, 10)
  const [lastDay, setLastDay] = useState(def)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    const res = await fetch('/api/resignations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intendedLastDay: lastDay, reason }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}))
      alert(error || 'Failed to submit')
      return
    }
    alert('Resignation submitted. Your manager will be notified.')
    setOpen(false)
    window.location.reload()
  }

  if (!open) {
    return <Button variant="outline" onClick={() => setOpen(true)}>Submit Resignation</Button>
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Submit Resignation</h3>
        <p className="text-xs text-slate-500">Once submitted, your manager will be notified to acknowledge.</p>
        <label className="block text-sm">
          <span className="text-slate-700 font-medium">Intended last working day</span>
          <input
            type="date"
            value={lastDay}
            onChange={(e) => setLastDay(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700 font-medium">Reason (optional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm min-h-[80px]"
          />
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</Button>
        </div>
      </div>
    </div>
  )
}
