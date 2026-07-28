'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CalendarClock } from 'lucide-react'

interface InterviewerOption {
  id: string
  fullName: string
  designation: string | null
}

interface Props {
  candidateId: string
  candidateName: string
  roleTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPES = [
  { value: 'PHONE',     label: 'Phone screen' },
  { value: 'VIDEO',     label: 'Video interview' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'HR',        label: 'HR conversation' },
  { value: 'ONSITE',    label: 'Onsite (final)' },
]

export function ScheduleInterviewDialog({ candidateId, candidateName, roleTitle, open, onOpenChange }: Props) {
  const router = useRouter()
  const [type, setType] = useState('VIDEO')
  const [date, setDate] = useState(defaultDate())
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState('45')
  const [meetingLink, setMeetingLink] = useState('')
  const [notes, setNotes] = useState('')
  const [interviewers, setInterviewers] = useState<string[]>([])
  const [options, setOptions] = useState<InterviewerOption[]>([])
  const [loadingOpts, setLoadingOpts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoadingOpts(true)
    fetch('/api/recruiting/interviewers')
      .then((r) => r.ok ? r.json() : { interviewers: [] })
      .then((d) => setOptions(d.interviewers ?? []))
      .catch(() => setOptions([]))
      .finally(() => setLoadingOpts(false))
  }, [open])

  async function submit() {
    setError('')
    const scheduledAt = new Date(`${date}T${time}:00`)
    if (isNaN(scheduledAt.getTime())) { setError('Pick a valid date and time'); return }
    const durNum = Number(duration)
    if (!Number.isFinite(durNum) || durNum < 5) { setError('Duration must be at least 5 minutes'); return }

    setSaving(true)
    const res = await fetch('/api/recruiting/interviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId,
        type,
        scheduledAt: scheduledAt.toISOString(),
        duration: durNum,
        interviewerIds: interviewers,
        meetingLink: meetingLink.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed to schedule interview'); return }
    onOpenChange(false)
    setMeetingLink(''); setNotes(''); setInterviewers([])
    router.refresh()
  }

  function toggleInterviewer(id: string) {
    setInterviewers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-slate-700" />
            Schedule Interview
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span className="font-medium text-slate-900">{candidateName}</span>
            <span className="text-slate-400 mx-1.5">·</span>
            {roleTitle}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm">
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Duration (min)</label>
              <Input type="number" min={5} max={480} step={15} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Time</label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Interviewers</label>
            <div className="rounded-md border border-slate-200 bg-white max-h-40 overflow-y-auto p-1">
              {loadingOpts ? (
                <p className="text-xs text-slate-400 px-2 py-3">Loading…</p>
              ) : options.length === 0 ? (
                <p className="text-xs text-slate-400 px-2 py-3">No interviewers available.</p>
              ) : (
                options.map((iv) => (
                  <label key={iv.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={interviewers.includes(iv.id)}
                      onChange={() => toggleInterviewer(iv.id)}
                    />
                    <span className="font-medium text-slate-900">{iv.fullName}</span>
                    {iv.designation && <span className="text-slate-500">· {iv.designation}</span>}
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Meeting link / location</label>
            <Input
              value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/… or Mega Tower, Gulberg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Notes (optional)</label>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What to bring, focus areas, etc."
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
            />
          </div>

          {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Scheduling…' : 'Schedule Interview'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function defaultDate(): string {
  // 3 business days from now.
  const d = new Date()
  let added = 0
  while (added < 3) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  return d.toISOString().slice(0, 10)
}
