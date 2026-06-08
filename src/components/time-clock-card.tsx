'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CircleAlert, ArrowUpRight } from 'lucide-react'

/**
 * Dashboard "Today's Status" card — status-only, no accidental navigation.
 *
 * When clocked OUT (or not yet in), the only interactive element is the
 * "Clock In" button which navigates to the Time module (because clocking
 * in needs the trust-scoring context the time module shows).
 *
 * When clocked IN, the only interactive element is the "Clock Out"
 * button, which posts to /api/attendance directly — no navigation —
 * so a stray click on the status card never sends the employee away.
 */
export function TimeClockCard({
  hasClockIn,
  clockInTime,
  workType,
  hoursWorked,
  isClockedIn,
}: {
  hasClockIn: boolean
  clockInTime: string | null
  workType: string | null
  hoursWorked: number | null
  isClockedIn: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClockOut() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CLOCK_OUT' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Could not clock out.')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error — could not clock out.')
    } finally {
      setBusy(false)
    }
  }

  if (!hasClockIn) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-amber-50 border border-amber-100">
        <div className="flex items-center gap-3">
          <CircleAlert className="w-6 h-6 text-amber-600" />
          <div>
            <p className="text-base font-semibold text-amber-900">
              You haven&apos;t clocked in yet
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Tap Clock In to start your day.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/time"
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
        >
          Clock In
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-green-50 border border-green-100">
      <div className="flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
        <div>
          <p className="text-base font-semibold text-green-900">
            Clocked in{clockInTime ? ` at ${clockInTime}` : ''}
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            {workType === 'WFH' ? 'Working from home' : 'Onsite'}
            {hoursWorked != null ? ` · ${hoursWorked.toFixed(1)} hrs so far` : ''}
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      </div>
      {isClockedIn && (
        <button
          type="button"
          onClick={handleClockOut}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 text-sm font-semibold transition-colors"
        >
          {busy ? 'Clocking out…' : 'Clock Out'}
        </button>
      )}
    </div>
  )
}
