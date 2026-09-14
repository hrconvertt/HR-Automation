'use client'

/**
 * Improve — the action plan. Write down what will be done about a driver,
 * who owns it and by when; the owner is told and ticks it off.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { DRIVERS, driverLabel, scoreBand } from '@/lib/voice'

export interface ActionRow {
  id: string; driverKey: string; title: string; detail: string | null; ownerId: string | null; ownerName: string | null
  dueDate: string | null; status: string; note: string | null; completedAt: string | null
}

async function call(url: string, method: string, body?: object) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return res.ok ? null : (((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong.')
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function VoiceImprove({ actions, canWrite, myEmployeeId, people, driverScores, roundId }: {
  actions: ActionRow[]
  canWrite: boolean
  myEmployeeId: string | null
  people: { id: string; fullName: string }[]
  driverScores: Record<string, number | null>
  roundId: string | null
}) {
  const router = useRouter()
  const lowest = [...DRIVERS].sort((a, b) => (driverScores[a.key] ?? 99) - (driverScores[b.key] ?? 99))[0]?.key ?? 'workload'
  const [f, setF] = useState({ driverKey: lowest, title: '', detail: '', ownerId: '', dueDate: '' })
  const [busy, setBusy] = useState(false)
  const open = actions.filter((a) => a.status === 'OPEN')
  const done = actions.filter((a) => a.status !== 'OPEN')

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

  const input = 'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white'

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
      <div className="space-y-4">
        <Section title={`Open actions · ${open.length}`}>
          {open.length === 0 ? <p className="px-4 py-5 text-sm text-slate-500">No open actions.</p> : open.map((a) => (
            <Row key={a.id} a={a} busy={busy} canWrite={canWrite} mine={a.ownerId === myEmployeeId}
              onDone={() => act(`/api/pulse/actions/${a.id}`, 'PATCH', { status: 'DONE' }, 'Marked done')}
              onDelete={() => { if (confirm('Delete this action?')) act(`/api/pulse/actions/${a.id}`, 'DELETE', undefined, 'Action deleted') }} />
          ))}
        </Section>
        <Section title={`Done · ${done.length}`}>
          {done.length === 0 ? <p className="px-4 py-5 text-sm text-slate-500">Nothing finished yet.</p> : done.map((a) => (
            <Row key={a.id} a={a} busy={busy} canWrite={canWrite} mine={a.ownerId === myEmployeeId}
              onReopen={() => act(`/api/pulse/actions/${a.id}`, 'PATCH', { status: 'OPEN' }, 'Reopened')}
              onDelete={() => { if (confirm('Delete this action?')) act(`/api/pulse/actions/${a.id}`, 'DELETE', undefined, 'Action deleted') }} />
          ))}
        </Section>
      </div>

      {canWrite && (
        <aside className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">New action</h3>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Driver</span>
            <select className={input} value={f.driverKey} onChange={(e) => setF({ ...f, driverKey: e.target.value })}>
              {DRIVERS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}{driverScores[d.key] != null ? ` · ${(driverScores[d.key] as number).toFixed(1)} ${scoreBand(driverScores[d.key]).label.toLowerCase()}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">What will be done</span>
            <input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Agree a weekly workload check in each team" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Detail (optional)</span>
            <textarea className={`${input} min-h-[70px]`} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Owner</span>
            <select className={input} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
              <option value="">Nobody yet</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Due</span>
            <input type="date" className={input} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </label>
          <button type="button" disabled={busy || !f.title.trim()}
            onClick={async () => { if (await act('/api/pulse/actions', 'POST', { ...f, roundId }, 'Action added — the owner has been told')) setF({ ...f, title: '', detail: '', ownerId: '', dueDate: '' }) }}
            className="w-full text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
            Add action
          </button>
        </aside>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <h3 className="px-4 py-2.5 text-sm font-semibold text-slate-900 border-b border-slate-100">{title}</h3>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </section>
  )
}

function Row({ a, busy, canWrite, mine, onDone, onReopen, onDelete }: {
  a: ActionRow; busy: boolean; canWrite: boolean; mine: boolean
  onDone?: () => void; onReopen?: () => void; onDelete: () => void
}) {
  const overdue = a.status === 'OPEN' && a.dueDate && new Date(a.dueDate) < new Date()
  return (
    <li className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{driverLabel(a.driverKey)}</p>
        <p className={`text-sm font-medium ${a.status === 'OPEN' ? 'text-slate-900' : 'text-slate-500 line-through'}`}>{a.title}</p>
        {a.detail && <p className="text-xs text-slate-600 mt-0.5">{a.detail}</p>}
        <p className="text-xs text-slate-500 mt-1">
          {a.ownerName ? `Owner: ${a.ownerName}` : 'No owner'}
          {a.dueDate && <span className={overdue ? 'text-red-700 font-medium' : ''}> · due {day(a.dueDate)}{overdue ? ' (overdue)' : ''}</span>}
          {a.completedAt && ` · done ${day(a.completedAt)}`}
        </p>
      </div>
      {(canWrite || mine) && (
        <div className="flex gap-2">
          {onDone && <button type="button" disabled={busy} onClick={onDone} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">Mark done</button>}
          {onReopen && <button type="button" disabled={busy} onClick={onReopen} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">Reopen</button>}
          {canWrite && <button type="button" disabled={busy} onClick={onDelete} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">Delete</button>}
        </div>
      )}
    </li>
  )
}
