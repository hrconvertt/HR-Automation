'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Mode = 'BASIC' | 'TIMESHEET' | 'JOBS'

const MODES: { value: Mode; label: string; desc: string }[] = [
  { value: 'BASIC', label: 'Basic clock-in', desc: 'Punch IN / OUT only.' },
  { value: 'TIMESHEET', label: 'Timesheet', desc: 'Employees log hours per category each day.' },
  { value: 'JOBS', label: 'Jobs', desc: 'Hours per category + task name (project tracking).' },
]

interface Props {
  initialMode: Mode
  initialCategories: string
}

export function TimeTrackingSettings({ initialMode, initialCategories }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [categories, setCategories] = useState(initialCategories)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/settings/time-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, categories }),
      })
      if (res.ok) setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5 space-y-5">
      <div>
        <p className="text-sm font-semibold text-slate-900 mb-2">Tracking mode</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`px-3 py-2 rounded-md border text-left text-sm transition-colors ${
                mode === m.value
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <p className="font-semibold">{m.label}</p>
              <p className={`text-xs ${mode === m.value ? 'text-slate-200' : 'text-slate-500'}`}>
                {m.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {(mode === 'TIMESHEET' || mode === 'JOBS') && (
        <div>
          <p className="text-sm font-semibold text-slate-900 mb-2">Categories (one per line)</p>
          <textarea
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
            placeholder="Dev\nQA\nMeetings"
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {saved && <span className="text-xs text-emerald-600">Saved.</span>}
      </div>
    </Card>
  )
}
