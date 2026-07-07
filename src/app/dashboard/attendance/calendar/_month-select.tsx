'use client'

import { useRouter } from 'next/navigation'

const REPORTING_MONTHS = [
  { key: '2025-11', label: 'Nov 2025' },
  { key: '2025-12', label: 'Dec 2025' },
  { key: '2026-01', label: 'Jan 2026' },
  { key: '2026-02', label: 'Feb 2026' },
  { key: '2026-03', label: 'Mar 2026' },
  { key: '2026-04', label: 'Apr 2026' },
  { key: '2026-05', label: 'May 2026' },
  { key: '2026-06', label: 'Jun 2026' },
]

export function CalendarMonthSelect({ month }: { month: string }) {
  const router = useRouter()
  return (
    <select
      value={month}
      onChange={(e) => router.push(`/dashboard/attendance/calendar?month=${e.target.value}`)}
      className="text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
    >
      {REPORTING_MONTHS.map((m) => (
        <option key={m.key} value={m.key}>{m.label}</option>
      ))}
    </select>
  )
}
