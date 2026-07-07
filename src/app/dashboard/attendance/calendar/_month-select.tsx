'use client'

import { useRouter } from 'next/navigation'

// Nov 2025 → current month, computed — mirrors reportingMonths() in
// src/lib/queries/attendance-grid.ts so the picker always includes "now".
const REPORTING_MONTHS: { key: string; label: string }[] = (() => {
  const list: { key: string; label: string }[] = []
  const now = new Date()
  let y = 2025, m = 11
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    list.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return list
})()

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
