'use client'

/**
 * Administration — Peakon's: survey schedules (rounds), and the questions
 * under each driver with a switch to ask it or not, Edit, and "Add custom
 * question" with the rule that custom questions use 0–10 framed so 10 is good.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { DRIVERS, ENGAGEMENT_QUESTION } from '@/lib/voice'

export interface AdminRound { id: string; title: string; status: string; opensAt: string; closesAt: string; responses: number }
export interface AdminQuestion { key: string; driverKey: string; text: string; scale: number; enabled: boolean; builtIn: boolean }

async function call(url: string, method: string, body?: object) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return res.ok ? null : (((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong.')
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const input = 'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white'

export function VoiceAdmin({ rounds, questions, view, hrefFor }: {
  rounds: AdminRound[]
  questions: AdminQuestion[]
  view: 'schedules' | 'questions'
  hrefFor: (params: Record<string, string>) => string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState({ title: '', opensAt: '', closesAt: '' })
  const [custom, setCustom] = useState<{ driverKey: string; text: string } | null>(null)
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null)

  async function act(url: string, method: string, body: object | undefined, ok: string) {
    setBusy(true)
    try {
      const err = await call(url, method, body)
      if (err) { toastError('Could not save that', err); return false }
      toastSuccess(ok)
      router.refresh()
      return true
    } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
      <nav className="space-y-1" aria-label="Administration">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-2">Survey</p>
        {([['schedules', 'Schedules'], ['questions', 'Questions']] as const).map(([k, label]) => (
          <a key={k} href={hrefFor({ admin: k })} aria-current={view === k ? 'page' : undefined}
            className={`block px-3 py-2 rounded-lg text-sm ${view === k ? 'bg-slate-200 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-100'}`}>
            {label}
          </a>
        ))}
      </nav>

      {view === 'schedules' && (
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <h3 className="px-4 py-2.5 text-sm font-semibold text-slate-900 border-b border-slate-100">Rounds</h3>
            {rounds.length === 0 ? <p className="px-4 py-5 text-sm text-slate-500">No rounds yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {rounds.map((r) => (
                  <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{r.title}</p>
                      <p className="text-xs text-slate-500">{day(r.opensAt)} → {day(r.closesAt)} · {r.responses} answered · {r.status === 'OPEN' ? 'open' : r.status.toLowerCase()}</p>
                    </div>
                    {r.status === 'OPEN' ? (
                      <button type="button" disabled={busy} onClick={() => act('/api/pulse', 'PATCH', { action: 'close', id: r.id }, 'Round closed')}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">Close round</button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => act('/api/pulse', 'PATCH', { action: 'open', id: r.id }, 'Round reopened')}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">Reopen round</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Schedule a round</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1">Name</span>
                <input className={input} value={round.title} onChange={(e) => setRound({ ...round, title: e.target.value })} placeholder="Blank = this quarter, e.g. Q3 2026" /></label>
              <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1">Opens</span>
                <input type="date" className={input} value={round.opensAt} onChange={(e) => setRound({ ...round, opensAt: e.target.value })} /></label>
              <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1">Closes</span>
                <input type="date" className={input} value={round.closesAt} onChange={(e) => setRound({ ...round, closesAt: e.target.value })} /></label>
            </div>
            <p className="text-xs text-slate-500">Blank dates open it today for two weeks. Everyone active is asked.</p>
            <button type="button" disabled={busy}
              onClick={async () => { if (await act('/api/pulse', 'PATCH', { action: 'create', ...round }, 'Round opened')) setRound({ title: '', opensAt: '', closesAt: '' }) }}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">Open round</button>
          </section>
        </div>
      )}

      {view === 'questions' && (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px] items-start">
          <div className="space-y-4">
            <section className="bg-white border border-slate-200 rounded-xl">
              <div className="px-5 py-4">
                <h3 className="text-lg font-semibold text-slate-900">Engagement</h3>
                <p className="text-sm text-slate-600">Always asked — it is the engagement score itself.</p>
                <p className="text-sm text-slate-800 mt-2">{ENGAGEMENT_QUESTION}</p>
              </div>
            </section>
            {DRIVERS.map((d) => {
              const qs = questions.filter((q) => q.driverKey === d.key)
              return (
                <section key={d.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{d.label}</h3>
                      <p className="text-xs text-slate-500">{d.blurb}</p>
                    </div>
                    <button type="button" onClick={() => setCustom({ driverKey: d.key, text: '' })} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300">Add custom question</button>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {qs.map((q) => (
                      <li key={q.key} className="px-5 py-3">
                        {editing?.key === q.key ? (
                          <div className="flex gap-2 flex-wrap">
                            <input className={`${input} flex-1 min-w-[240px]`} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                            <button type="button" disabled={busy || !editing.text.trim()}
                              onClick={async () => { if (await act(`/api/pulse/questions/${q.key}`, 'PATCH', { text: editing.text }, 'Question saved')) setEditing(null) }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">Save</button>
                            <button type="button" onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <p className={`text-sm ${q.enabled ? 'text-slate-900' : 'text-slate-400'}`}>{q.text}</p>
                              <p className="text-[11px] text-slate-500">{q.builtIn ? 'Built-in · agree–disagree scale' : 'Custom · 0–10'}{q.enabled ? '' : ' · not being asked'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" role="switch" aria-checked={q.enabled} disabled={busy}
                                onClick={() => act(`/api/pulse/questions/${q.key}`, 'PATCH', { enabled: !q.enabled }, q.enabled ? 'No longer asked' : 'Now being asked')}
                                className={`text-xs font-medium px-3 py-1.5 rounded-full border disabled:opacity-40 ${q.enabled ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-300'}`}>
                                {q.enabled ? 'Asked' : 'Not asked'}
                              </button>
                              <button type="button" onClick={() => setEditing({ key: q.key, text: q.text })} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300">Edit</button>
                              {!q.builtIn && (
                                <button type="button" disabled={busy}
                                  onClick={() => { if (confirm('Delete this custom question? Answers already given stay in past rounds.')) act(`/api/pulse/questions/${q.key}`, 'DELETE', undefined, 'Question deleted') }}
                                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">Delete</button>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>

          {custom && (
            <aside className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 xl:sticky xl:top-4">
              <h3 className="text-base font-semibold text-slate-900">Add custom question</h3>
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Custom questions use a 0–10 scale, so frame them positively — 10 must be the good answer. Keep the language simple and pick the closest driver.
              </p>
              <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1">Driver</span>
                <select className={input} value={custom.driverKey} onChange={(e) => setCustom({ ...custom, driverKey: e.target.value })}>
                  {DRIVERS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select></label>
              <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1">Question</span>
                <textarea className={`${input} min-h-[80px]`} value={custom.text} onChange={(e) => setCustom({ ...custom, text: e.target.value })} placeholder="e.g. I have the opportunity to do challenging things at work." /></label>
              <div className="flex gap-2">
                <button type="button" disabled={busy || !custom.text.trim()}
                  onClick={async () => { if (await act('/api/pulse/questions', 'POST', custom, 'Custom question added')) setCustom(null) }}
                  className="text-sm font-semibold px-4 py-2 rounded-lg bg-blue-700 text-white disabled:opacity-40">Create</button>
                <button type="button" onClick={() => setCustom(null)} className="text-sm px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
