'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'

export default function AcknowledgeButton({ policyId }: { policyId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')

  async function handleAck() {
    setError('')
    setBusy(true)
    const res = await fetch(`/api/policies/${policyId}/acknowledge`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to acknowledge')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I have read and understood this policy, and I agree to comply with it.
      </label>
      <Button onClick={handleAck} disabled={!confirmed || busy} className="bg-slate-700 hover:bg-slate-700 text-white">
        <CheckCircle className="w-4 h-4 mr-2" />
        {busy ? 'Recording…' : 'Acknowledge Policy'}
      </Button>
      {error && <p className="text-xs text-slate-700">{error}</p>}
    </div>
  )
}
