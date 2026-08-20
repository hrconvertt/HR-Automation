'use client'

/**
 * Holidays & WFH — the company holiday calendar and work-from-home days.
 *
 * Split out of Working Days & Hours: the working week is one setting and the
 * holiday list is another, and they were sharing a page only because they both
 * touch the calendar. Each is now its own sidebar tab.
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { HolidayBoard, type HolidayRow } from './_components/holiday-board'

export default function HolidaysSettingsPage() {
  const [rows, setRows] = useState<HolidayRow[]>([])
  const [loading, setLoading] = useState(true)
  const year = new Date().getFullYear()

  useEffect(() => {
    fetch(`/api/holidays?year=${year}`)
      .then((r) => r.json())
      .then((h) => setRows(Array.isArray(h?.holidays) ? h.holidays : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [year])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Holidays &amp; WFH</h1>
        <p className="text-sm text-slate-500 mt-1">
          The company holiday calendar and work-from-home days for {year}.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-slate-400 flex items-center gap-2 py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading holidays…
        </p>
      ) : (
        <HolidayBoard year={year} rows={rows} />
      )}
    </div>
  )
}
