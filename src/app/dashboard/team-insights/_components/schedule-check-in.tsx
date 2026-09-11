'use client'

/** "Schedule a check-in" — a date, and optionally what it is about. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { fmtDay, inputCls, isoDayFromNow, readError } from './format'

export function ScheduleCheckIn({ people, presetEmployeeId, variant = 'default' }: {
  /** Who it can be with. Ignored when presetEmployeeId is set. */
  people?: { id: string; fullName: string }[]
  presetEmployeeId?: string
  variant?: 'default' | 'outline'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState(presetEmployeeId ?? '')
  const [date, setDate] = useState(isoDayFromNow(7))
  const [topics, setTopics] = useState('')
  const [saving, setSaving] = useState(false)

  function start() {
    setEmployeeId(presetEmployeeId ?? '')
    setDate(isoDayFromNow(7))
    setTopics('')
    setOpen(true)
  }

  async function save() {
    if (!employeeId || !date) return
    setSaving(true)
    try {
      const res = await fetch('/api/talent/check-ins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          scheduledFor: date,
          topics: topics.split('\n').map((t) => t.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) { toastError('Could not schedule the check-in', await readError(res)); return }
      toastSuccess(`Check-in scheduled for ${fmtDay(`${date}T00:00:00`)}`)
      setOpen(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  return (
    <>
      <Button variant={variant} size="sm" onClick={start}>Schedule a check-in</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule a check-in</DialogTitle>
            <DialogDescription>
              A one-to-one. They are told the date. Suggested actions can be added to it as topics later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!presetEmployeeId && (
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">With</span>
                <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">Select a person…</option>
                  {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Date</span>
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">
                Topics <span className="text-slate-400">(optional, one per line)</span>
              </span>
              <textarea
                className={`${inputCls} min-h-[80px]`}
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder={'How the first month went\nWhat support they need'}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !employeeId || !date}>
              {saving ? 'Scheduling…' : 'Schedule check-in'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
