'use client'

/**
 * Holiday calendar with the two things HR actually does to a holiday: decide
 * whether it is taken, and tell everyone.
 *
 * "On the calendar" and "taken" are different states. Convertt sometimes works
 * through a public holiday depending on workload, so nothing touches attendance
 * until Apply is pressed — and Un-apply reverses exactly what it wrote.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Mail, Trash2, Loader2, Check, X, AlertTriangle, CalendarDays, Copy,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export interface HolidayRow {
  id: string
  name: string
  date: string
  type: string
  applied: boolean
}

const TYPES = [
  { value: 'PUBLIC', label: 'Public holiday' },
  { value: 'COMPANY', label: 'Company holiday' },
  { value: 'OPTIONAL', label: 'Optional holiday' },
  { value: 'WFH', label: 'Work from home' },
]

const TYPE_TONE: Record<string, string> = {
  PUBLIC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  COMPANY: 'bg-violet-50 text-violet-700 border-violet-200',
  OPTIONAL: 'bg-slate-100 text-slate-600 border-slate-200',
  WFH: 'bg-sky-50 text-sky-700 border-sky-200',
}

interface Draft {
  subject: string
  text: string
  recipients: string[]
  undeliverable: string[]
  resumes: string
}

export function HolidayBoard({ year, rows }: { year: number; rows: HolidayRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', type: 'PUBLIC', reason: '' })

  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftFor, setDraftFor] = useState<HolidayRow | null>(null)
  const [extraNote, setExtraNote] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')

  const applied = rows.filter((r) => r.applied).length

  async function toggleApply(h: HolidayRow) {
    setBusy(h.id); setError(null); setNote(null)
    const res = await fetch(`/api/holidays/${h.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied: !h.applied }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(j.error ?? 'Could not update.'); return }
    setNote(
      h.applied
        ? `${h.name} un-applied — ${j.attendanceRowsChanged} attendance rows reverted.`
        : `${h.name} applied — ${j.attendanceRowsChanged} of ${j.employeesAffected} attendance rows marked.`,
    )
    router.refresh()
  }

  async function add() {
    if (!form.name.trim() || !form.date) return
    setBusy('add'); setError(null)
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), date: form.date, type: form.type }),
    })
    setBusy(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Could not add. A holiday may already exist on that date.')
      return
    }
    setForm({ name: '', date: '', type: 'PUBLIC', reason: '' })
    setAdding(false)
    router.refresh()
  }

  async function remove(h: HolidayRow) {
    if (!confirm(`Remove ${h.name}?${h.applied ? ' Its attendance marks will be reverted.' : ''}`)) return
    setBusy(h.id)
    await fetch(`/api/holidays/${h.id}`, { method: 'DELETE' }).catch(() => {})
    setBusy(null)
    router.refresh()
  }

  async function generateEmail(h: HolidayRow) {
    setBusy(h.id + 'mail'); setError(null)
    const res = await fetch(`/api/holidays/${h.id}/notice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extraNote }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(j.error ?? 'Could not build the notice.'); return }
    setDraft({
      subject: j.subject, text: j.text, recipients: j.recipients,
      undeliverable: j.undeliverable ?? [], resumes: j.resumes,
    })
    // The draft is a starting point. What HR edits here is what gets sent —
    // every real notice has carried a line no template could have known.
    setEditSubject(j.subject)
    setEditBody(j.text)
    setDraftFor(h)
  }

  async function sendDraft() {
    if (!draftFor) return
    setBusy('send'); setError(null)
    const res = await fetch(`/api/holidays/${draftFor.id}/notice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ send: true, subject: editSubject, body: editBody }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(j.error ?? 'Could not send.'); return }
    setNote(
      `Notice sent to ${j.sent} recipient${j.sent === 1 ? '' : 's'} and the holiday applied — `
      + `${j.attendanceRowsChanged} attendance rows marked.`,
    )
    setDraft(null); setDraftFor(null); setExtraNote('')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Holidays &amp; WFH days — {year}</CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            {rows.length} on the calendar · {applied} applied. Nothing changes attendance
            until you apply it.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Holiday
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {note && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            <Check className="w-3.5 h-3.5" /> {note}
          </p>
        )}
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-lg">
            No holidays for {year} yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {rows.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                <span className="text-sm font-medium text-slate-900 min-w-0 flex-1 truncate">
                  {h.name}
                </span>

                {/* Generate email sits immediately beside the name — it is the
                    action HR reaches for as soon as a closure is decided. */}
                <button
                  onClick={() => generateEmail(h)}
                  disabled={!!busy}
                  title="Build the closure notice for this holiday"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === h.id + 'mail'
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Mail className="w-3.5 h-3.5" />}
                  Generate email
                </button>

                <span className="text-xs text-slate-500 whitespace-nowrap w-24 text-right">
                  {new Date(h.date).toLocaleDateString('en-GB', {
                    weekday: 'short', day: '2-digit', month: 'short',
                  })}
                </span>

                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${TYPE_TONE[h.type] ?? TYPE_TONE.OPTIONAL}`}>
                  {h.type === 'WFH' ? 'WFH' : h.type}
                </span>

                <button
                  onClick={() => toggleApply(h)}
                  disabled={!!busy}
                  className={`inline-flex items-center gap-1.5 rounded-full text-xs font-medium px-3 py-1 border disabled:opacity-50 ${
                    h.applied
                      ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                  title={h.applied ? 'Applied — click to reverse the attendance marks' : 'Not applied — click to mark attendance'}
                >
                  {busy === h.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : h.applied ? <Check className="w-3 h-3" /> : <Circle />}
                  {h.applied ? 'Applied' : 'Apply'}
                </button>

                <button
                  onClick={() => remove(h)}
                  disabled={!!busy}
                  aria-label={`Remove ${h.name}`}
                  className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {adding && (
        <Modal title="Add holiday" onClose={() => setAdding(false)}>
          <div className="space-y-3">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Independence Day" autoFocus
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
            </Field>
            <div className="flex gap-3">
              <Field label="Date">
                <input type="date" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Type">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Reason / note (optional)">
              <textarea value={form.reason} rows={2}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Shown on the notice email, e.g. attendance mandatory the next working day"
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
            </Field>
            <p className="text-[11px] text-slate-500">
              It is added to the calendar only. Apply it afterwards to mark attendance.
            </p>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" onClick={add} disabled={busy === 'add' || !form.name.trim() || !form.date}>
                {busy === 'add' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Add to calendar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {draft && draftFor && (
        <Modal title={`Notice — ${draftFor.name}`} onClose={() => { setDraft(null); setDraftFor(null) }}>
          <div className="space-y-3">
            <Field label="Subject">
              <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
            </Field>

            <Field label={`Recipients (${draft.recipients.length} active employees)`}>
              <p className="text-[11px] text-slate-500 max-h-16 overflow-y-auto leading-relaxed">
                {draft.recipients.join(', ')}
              </p>
              {draft.undeliverable.length > 0 && (
                <p className="text-[11px] text-amber-700 mt-1">
                  No usable email on file for {draft.undeliverable.join(', ')} — tell them separately.
                </p>
              )}
            </Field>

            <Field label="Body">
              <textarea value={editBody} rows={12}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm leading-relaxed
                           font-sans focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </Field>

            <Field label="Add a condition (optional)">
              <textarea value={extraNote} rows={2}
                onChange={(e) => setExtraNote(e.target.value)}
                placeholder="e.g. attendance is mandatory on the next working day; unapproved absence triggers the sandwich rule"
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
            </Field>
            <p className="text-[11px] text-slate-500">
              Regenerate rebuilds the body with the condition in it — it discards anything you
              typed above. Sending uses exactly what is in the box, and applies the holiday to
              everyone&apos;s attendance.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm"
                onClick={() => navigator.clipboard?.writeText(editBody)}>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
              </Button>
              <Button variant="outline" size="sm" onClick={() => generateEmail(draftFor)}>
                Regenerate
              </Button>
              <Button size="sm" onClick={sendDraft} disabled={busy === 'send' || !editBody.trim()}>
                {busy === 'send' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Send to all &amp; apply
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </Card>
  )
}

function Circle() {
  return <span className="w-3 h-3 rounded-full border border-slate-400 inline-block" />
}

function Modal({ title, children, onClose }: {
  title: string; children: React.ReactNode; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-500" /> {title}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-900">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
