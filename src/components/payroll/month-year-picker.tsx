'use client'

/**
 * Month and year for the payroll screens.
 *
 * Changing either one navigates immediately. There was a Show button beside
 * them, which meant picking a month did nothing until you pressed a second
 * control — the dropdown already says what you want, so asking again is a step
 * that only exists to be forgotten.
 */

import { useRouter, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function MonthYearPicker({ month, year, years, months, label = 'Salary month' }: {
  month: number
  year: number
  /** Years to offer. Defaults to the current year and the three before it. */
  years?: number[]
  /** Months to offer for the selected year. Absent means all twelve. */
  months?: number[]
  label?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = useTransition()

  const yearList = years?.length
    ? years
    : Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)
  const monthList = months?.length ? months : Array.from({ length: 12 }, (_, i) => i + 1)

  function go(m: number, y: number) {
    start(() => router.push(`${pathname}?month=${m}&year=${y}`))
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
      <span className="text-xs uppercase tracking-wide text-slate-500 mr-1">{label}</span>
      <select
        value={month}
        onChange={(e) => go(Number(e.target.value), year)}
        className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
      >
        {monthList.map((m) => <option key={m} value={m}>{MONTHS[m - 1]}</option>)}
      </select>
      <select
        value={year}
        onChange={(e) => go(month, Number(e.target.value))}
        className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
      >
        {yearList.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
    </div>
  )
}
