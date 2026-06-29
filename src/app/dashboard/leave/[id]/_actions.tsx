'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function LeaveDetailActions({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function withdraw() {
    if (!confirm('Withdraw this leave request? This can\'t be undone.')) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/leave/${id}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Could not withdraw')
      }
      router.push('/dashboard/leave/me')
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not withdraw')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Your actions</p>
      <div className="flex gap-2 mt-2">
        <Button variant="outline" onClick={() => router.push('/dashboard/leave/me')}>
          Edit (resubmit)
        </Button>
        <Button variant="outline" onClick={withdraw} disabled={busy}>
          {busy ? 'Withdrawing…' : 'Withdraw request'}
        </Button>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        To edit: withdraw this one and submit a fresh request on the My Leave page.
      </p>
      {err && <p className="text-xs text-slate-700 mt-2 bg-slate-50 border border-slate-100 rounded p-2">{err}</p>}
    </div>
  )
}
