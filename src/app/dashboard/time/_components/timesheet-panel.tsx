'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Props {
  mode: 'TIMESHEET' | 'JOBS'
  categories: string[]
}

interface Entry {
  id: string
  date: string
  category: string | null
  hours: string | number
  taskId: string | null
  notes: string | null
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TimesheetPanel({ mode, categories }: Props) {
  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState<Record<string, { hours: string; taskId: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number>(0)

  useEffect(() => {
    void load()
  }, [date])

  async function load() {
    const res = await fetch(`/api/timesheet-entries?from=${date}&to=${date}`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    const next: Record<string, { hours: string; taskId: string }> = {}
    for (const e of (data.entries ?? []) as Entry[]) {
      const key = e.category ?? '__none__'
      next[key] = { hours: String(e.hours ?? ''), taskId: e.taskId ?? '' }
    }
    setRows(next)
  }

  async function saveRow(cat: string) {
    const row = rows[cat] ?? { hours: '', taskId: '' }
    setSaving(cat)
    try {
      const res = await fetch('/api/timesheet-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          category: cat,
          hours: Number(row.hours || 0),
          taskId: mode === 'JOBS' ? row.taskId || null : null,
        }),
      })
      if (res.ok) setSavedAt(Date.now())
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {mode === 'JOBS' ? 'Job Log' : 'Timesheet'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Log hours per category for the selected day.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm"
          />
          {savedAt > 0 && (
            <span className="text-[11px] text-emerald-600">Saved</span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-4 font-semibold">Category</th>
              {mode === 'JOBS' && <th className="py-2 pr-4 font-semibold">Task</th>}
              <th className="py-2 pr-4 font-semibold">Hours</th>
              <th className="py-2 pr-4 font-semibold">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={mode === 'JOBS' ? 4 : 3} className="py-3 text-xs text-slate-500">
                  No categories configured. Ask HR to set them in Settings → Time Tracking.
                </td>
              </tr>
            )}
            {categories.map((cat) => {
              const row = rows[cat] ?? { hours: '', taskId: '' }
              return (
                <tr key={cat} className="border-b border-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-700">{cat}</td>
                  {mode === 'JOBS' && (
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={row.taskId}
                        onChange={(e) =>
                          setRows((r) => ({ ...r, [cat]: { ...row, taskId: e.target.value } }))
                        }
                        placeholder="Task / project"
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>
                  )}
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      value={row.hours}
                      onChange={(e) =>
                        setRows((r) => ({ ...r, [cat]: { ...row, hours: e.target.value } }))
                      }
                      className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => saveRow(cat)}
                      disabled={saving === cat}
                    >
                      {saving === cat ? 'Saving…' : 'Save'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
