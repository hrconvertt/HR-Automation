'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function WorkingDaysSettingsPage() {
  const [workingDays, setWorkingDays] = useState<string[]>(['Monday','Tuesday','Wednesday','Thursday','Friday'])
  const [workingDaysSaved, setWorkingDaysSaved] = useState<string[]>(['Monday','Tuesday','Wednesday','Thursday','Friday'])
  const [ok, setOk] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (d.config?.workingDays) {
        try {
          const parsed = JSON.parse(d.config.workingDays)
          setWorkingDays(parsed); setWorkingDaysSaved(parsed)
        } catch {}
      }
    }).catch(() => {})
  }, [])

  async function save() {
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDays }),
    })
    setWorkingDaysSaved([...workingDays])
    setOk(true); setTimeout(() => setOk(false), 2000)
  }

  const dirty = (() => {
    if (workingDays.length !== workingDaysSaved.length) return true
    const s = new Set(workingDaysSaved)
    return workingDays.some((d) => !s.has(d))
  })()

  function toggle(day: string) {
    setWorkingDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])
  }

  return (
    <Card>
      <CardHeader className="border-b border-slate-100"><CardTitle>Working Days & Hours</CardTitle></CardHeader>
      <CardContent className="p-6 space-y-5">
        <p className="text-sm text-slate-500">Tap the days the company operates. Excluded days are treated as weekends.</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <button key={day} onClick={() => toggle(day)}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                workingDays.includes(day)
                  ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}>{day}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!dirty || ok}>
            {ok ? 'Saved' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
