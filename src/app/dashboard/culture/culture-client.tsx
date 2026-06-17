'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Plus, Heart, MapPin, Calendar as CalendarIcon } from 'lucide-react'

interface EventRow {
  id: string
  title: string
  description: string | null
  eventDate: string
  location: string | null
  category: string
}

interface KudosRow {
  id: string
  message: string
  category: string
  createdAt: string
  from: { id: string; fullName: string; employeeCode: string }
  to: { id: string; fullName: string; designation: string }
}

interface Colleague { id: string; fullName: string; designation: string }

interface Props {
  mode: 'events' | 'recognition'
  isHR?: boolean
  upcomingEvents?: EventRow[]
  pastEvents?: EventRow[]
  kudos?: KudosRow[]
  colleagues?: Colleague[]
  myEmployeeId?: string | null
}

const EVENT_CATEGORIES = ['GENERAL', 'DINNER', 'TRIP', 'SPORTS', 'TRAINING', 'TOWN_HALL', 'EID'] as const
const KUDOS_CATEGORIES = ['APPRECIATION', 'TEAMWORK', 'INNOVATION', 'LEADERSHIP'] as const

const CAT_TONE: Record<string, string> = {
  DINNER: 'bg-slate-100 text-slate-900',
  TRIP: 'bg-slate-100 text-slate-900',
  SPORTS: 'bg-slate-100 text-slate-900',
  TRAINING: 'bg-slate-100 text-slate-900',
  TOWN_HALL: 'bg-slate-100 text-slate-800',
  EID: 'bg-slate-100 text-slate-900',
  GENERAL: 'bg-slate-100 text-slate-700',
  APPRECIATION: 'bg-slate-100 text-slate-900',
  TEAMWORK: 'bg-slate-100 text-slate-900',
  INNOVATION: 'bg-slate-100 text-slate-900',
  LEADERSHIP: 'bg-slate-100 text-slate-900',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function CultureClient(props: Props) {
  if (props.mode === 'events') return <EventsView {...props} />
  return <RecognitionView {...props} />
}

function EventsView({ isHR, upcomingEvents = [], pastEvents = [] }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ title: '', description: '', eventDate: '', location: '', category: 'GENERAL' })

  async function submit() {
    setErr('')
    if (!form.title.trim() || !form.eventDate) { setErr('Title and date required'); return }
    setBusy(true)
    const r = await fetch('/api/culture/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Failed'); return }
    setOpen(false)
    setForm({ title: '', description: '', eventDate: '', location: '', category: 'GENERAL' })
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Upcoming Events</h2>
          {isHR && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Event
            </Button>
          )}
        </div>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-slate-500">No upcoming events. {isHR && 'Click "Add Event" to create one.'}</p>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Past Events</h2>
        {pastEvents.length === 0 ? (
          <p className="text-sm text-slate-500">No past events recorded.</p>
        ) : (
          <div className="space-y-2">
            {pastEvents.map((e) => <EventCard key={e.id} event={e} dim />)}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Company Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Annual Dinner 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                <Input type="datetime-local" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
              <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {err && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Add Event'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EventCard({ event, dim }: { event: EventRow; dim?: boolean }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 flex items-start gap-3 ${dim ? 'opacity-75' : ''}`}>
      <div className="rounded-lg bg-slate-50 text-slate-700 p-2">
        <CalendarIcon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-900">{event.title}</p>
          <Badge className={CAT_TONE[event.category] ?? 'bg-slate-100 text-slate-700'}>{event.category}</Badge>
        </div>
        {event.description && <p className="text-sm text-slate-600 mt-1">{event.description}</p>}
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
          <span>{fmtDate(event.eventDate)}</span>
          {event.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.location}</span>}
        </p>
      </div>
    </div>
  )
}

function RecognitionView({ kudos = [], colleagues = [] }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ toId: '', message: '', category: 'APPRECIATION' })

  async function submit() {
    setErr('')
    if (!form.toId || !form.message.trim()) { setErr('Recipient and message required'); return }
    setBusy(true)
    const r = await fetch('/api/culture/kudos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Failed'); return }
    setOpen(false)
    setForm({ toId: '', message: '', category: 'APPRECIATION' })
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Recognition Feed</h2>
          <Button size="sm" onClick={() => setOpen(true)} className="bg-slate-700 hover:bg-slate-700 text-white">
            <Heart className="w-4 h-4 mr-1.5" /> Give Kudos
          </Button>
        </div>
        {kudos.length === 0 ? (
          <p className="text-sm text-slate-500">No kudos yet. Be the first to recognize a colleague.</p>
        ) : (
          <div className="space-y-3">
            {kudos.map((k) => (
              <div key={k.id} className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50/50 to-white p-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-slate-900">{k.from.fullName}</span>
                  <span className="text-xs text-slate-500">→</span>
                  <span className="text-sm font-semibold text-slate-900">{k.to.fullName}</span>
                  <Badge className={CAT_TONE[k.category] ?? 'bg-slate-100 text-slate-700'}>{k.category}</Badge>
                </div>
                <p className="text-sm text-slate-700">{k.message}</p>
                <p className="text-[11px] text-slate-400 mt-1">{new Date(k.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Give Kudos</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Recipient</label>
              <Select value={form.toId} onValueChange={(v) => setForm({ ...form, toId: v })}>
                <SelectTrigger><SelectValue placeholder="Pick a colleague" /></SelectTrigger>
                <SelectContent>
                  {colleagues.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.fullName} · {c.designation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KUDOS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
              <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="What did they do that deserves recognition?" />
            </div>
            {err && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy} className="bg-slate-700 hover:bg-slate-700 text-white">{busy ? 'Sending…' : 'Send Kudos'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
