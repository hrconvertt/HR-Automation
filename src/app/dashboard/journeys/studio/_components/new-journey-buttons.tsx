'use client'

/** Start a journey from a template, or blank. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError } from '@/components/ui/toaster'

export function NewJourneyButtons() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function create(template: string | null, label: string) {
    setBusy(label)
    try {
      const res = await fetch('/api/experience/journeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not create the journey', (d as { error?: string }).error); return }
      router.push(`/dashboard/journeys/studio/${(d as { journey: { id: string } }).journey.id}?tab=editor`)
    } finally { setBusy(null) }
  }

  const btn = 'text-sm px-4 py-2 rounded-lg border disabled:opacity-40'
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!!busy} onClick={() => create('ONBOARDING', 'onb')}
        className={`${btn} bg-slate-900 text-white border-slate-900`}>
        {busy === 'onb' ? 'Creating…' : 'New from template: Onboarding'}
      </button>
      <button type="button" disabled={!!busy} onClick={() => create('NEW_MANAGER', 'mgr')}
        className={`${btn} bg-slate-900 text-white border-slate-900`}>
        {busy === 'mgr' ? 'Creating…' : 'New from template: Transition to Management'}
      </button>
      <button type="button" disabled={!!busy} onClick={() => create(null, 'blank')}
        className={`${btn} border-slate-300 bg-white hover:bg-slate-50`}>
        {busy === 'blank' ? 'Creating…' : 'New blank journey'}
      </button>
    </div>
  )
}
