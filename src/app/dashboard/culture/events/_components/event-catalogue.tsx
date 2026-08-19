'use client'

/**
 * The events Convertt runs, and everything currently planned.
 *
 * The catalogue sits above the list rather than behind a button because the
 * question "what do we usually run?" is asked as often as "what is planned?".
 * Clicking one starts an event pre-filled with that plan.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Loader2, CalendarDays, FileText, Users } from 'lucide-react'
import {
  EVENT_PRESETS, CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE, EVENT_CATEGORIES,
  type EventCategory, type EventStatus,
} from '@/lib/event-presets'

interface Row {
  id: string
  title: string
  category: string
  status: string
  eventDate: string
  location: string | null
  hasProposal: boolean
  roleCount: number
  currency: string
  budget: number
  actual: number | null
}

const money = (n: number, c: string) =>
  `${c} ${Math.round(n).toLocaleString('en-PK')}`

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })

export function EventCatalogue({ events, isHR }: { events: Row[]; isHR: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [blankOpen, setBlankOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', category: 'GENERAL', eventDate: '' })

  async function start(payload: Record<string, unknown>, key: string) {
    setBusy(key); setErr(null)
    const res = await fetch('/api/culture/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setErr(d.error ?? 'Could not start that.'); return }
    router.push(`/dashboard/culture/events/${d.event.id}`)
  }

  const now = Date.now()
  const upcoming = events.filter((e) => new Date(e.eventDate).getTime() >= now - 86_400_000)
  const past = events.filter((e) => new Date(e.eventDate).getTime() < now - 86_400_000)

  return (
    <div className="space-y-5">
      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

      {isHR && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">What we run</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Each one starts with its usual plan, roles and costs already filled in — change
                whatever differs this year.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setBlankOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Something else
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-slate-100">
            {EVENT_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={busy === p.key}
                onClick={() => start({ presetKey: p.key }, p.key)}
                className="text-left px-4 py-3 hover:bg-slate-50 border-slate-100 sm:border-r sm:border-b transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{p.title}</p>
                  {busy === p.key && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {CATEGORY_LABELS[p.category]} · {p.timing}
                </p>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{p.overview}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <EventList title="Coming up" rows={upcoming} empty="Nothing planned yet." />
      <EventList title="Already held" rows={past} empty="No past events on record." />

      <Dialog open={blankOpen} onOpenChange={setBlankOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Start an event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Title</span>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="What is it called?"
                className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Kind</span>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
                >
                  {EVENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c as EventCategory]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Date</span>
                <input
                  type="date"
                  value={draft.eventDate}
                  onChange={(e) => setDraft({ ...draft, eventDate: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
                />
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlankOpen(false)}>Cancel</Button>
            <Button
              disabled={!draft.title.trim() || busy === 'blank'}
              onClick={() => start(draft, 'blank')}
            >
              {busy === 'blank' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Start planning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EventList({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">{title} · {rows.length}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">{empty}</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {rows.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/culture/events/${e.id}`}
              className="px-4 py-3 flex items-start justify-between gap-4 flex-wrap hover:bg-slate-50/60 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{e.title}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                    STATUS_TONE[e.status as EventStatus] ?? STATUS_TONE.PLANNING
                  }`}>
                    {STATUS_LABELS[e.status as EventStatus] ?? e.status}
                  </span>
                  {e.hasProposal && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                      <FileText className="w-3 h-3" /> proposal
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" /> {day(e.eventDate)}
                  </span>
                  <span>{CATEGORY_LABELS[e.category as EventCategory] ?? e.category}</span>
                  {e.location && <span>{e.location}</span>}
                  {e.roleCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" /> {e.roleCount} roles
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right flex-shrink-0 tabular-nums">
                <p className="text-sm text-slate-900">
                  {e.budget ? money(e.budget, e.currency) : <span className="text-slate-400">no budget yet</span>}
                </p>
                {e.actual != null && (
                  <p className="text-[11px] text-slate-500">
                    spent {money(e.actual, e.currency)}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
