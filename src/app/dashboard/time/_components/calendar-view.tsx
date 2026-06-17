'use client'

/**
 * CalendarView — historical "Month Grid" layout was confusing employees
 * (showed every missing-clock-in day as red "Absent" badges and cramped
 * everything into a single horizontal row).
 *
 * Replaced with a clean redirect to /dashboard/attendance/<myEmployeeId>,
 * which renders the polished 8-month wall calendar with P/L/WFH/H badges,
 * YTD totals, leave balance, and recent leave requests in the side panel.
 *
 * Kept the same exported name so any old call sites still compile.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarDays } from 'lucide-react'

export function CalendarView({ role: _role }: { role?: string } = {}) {
  const router = useRouter()
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        const id = d?.user?.employee?.id ?? d?.user?.employeeId ?? null
        if (id) {
          setEmployeeId(id)
          router.replace(`/dashboard/attendance/${id}`)
        } else {
          setError('No employee profile linked to your account.')
        }
      })
      .catch(() => setError('Could not load your profile.'))
  }, [router])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <CalendarDays className="w-10 h-10 text-blue-500 mx-auto mb-3" />
      <h2 className="text-lg font-semibold text-slate-900">Opening your calendar…</h2>
      {error ? (
        <>
          <p className="mt-2 text-sm text-rose-600">{error}</p>
          <p className="mt-1 text-xs text-slate-500">Contact HR to link your employee record.</p>
        </>
      ) : employeeId ? (
        <Link
          href={`/dashboard/attendance/${employeeId}`}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          Open my calendar <ArrowRight className="w-4 h-4" />
        </Link>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Redirecting…</p>
      )}
    </div>
  )
}
