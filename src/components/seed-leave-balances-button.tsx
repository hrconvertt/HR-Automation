'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * HR-only button shown on the employee dashboard "No leave balances" empty
 * state. Calls POST /api/leave/seed-balances?employeeId=<id> which seeds
 * default Convertt-policy LeaveBalance rows for the current year and then
 * refreshes the page so the empty state replaces with the populated grid.
 */
export function SeedLeaveBalancesButton({ employeeId }: { employeeId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/leave/seed-balances?employeeId=${encodeURIComponent(employeeId)}`,
        { method: 'POST' },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Request failed (${res.status})`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
      >
        {busy ? 'Seeding…' : 'Seed default balances →'}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}
