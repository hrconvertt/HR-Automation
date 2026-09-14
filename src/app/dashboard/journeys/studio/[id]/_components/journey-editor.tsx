'use client'

/**
 * The journey editor: its settings, then each module with its steps. Every
 * change saves straight away through the studio API; nothing waits on a
 * global Save.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { AUTO_ASSIGN, BANNER_TONES, STEP_TYPES, stepTypeOf } from '@/lib/experience'

const input = 'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white'

export interface EditorStep {
  id: string; title: string; body: string | null; type: string; url: string | null; programId: string | null
  required: boolean; dueDays: number | null; minutes: number | null; seq: number
}
export interface EditorModule { id: string; title: string; description: string | null; seq: number; steps: EditorStep[] }
export interface EditorJourney {
  id: string; title: string; description: string | null; status: string; autoAssign: string | null; bannerTone: string
  modules: EditorModule[]
}

function useApi() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function call(url: string, method: string, body: object | null, ok: string | null): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not save that', (d as { error?: string }).error); return false }
      if (ok) toastSuccess(ok)
      router.refresh()
      return true
    } finally { setBusy(false) }
  }
  return { busy, call, router }
}

export function JourneyEditor({ journey, programs }: { journey: EditorJourney; programs: { id: string; title: string }[] }) {
  const { busy, call, router } = useApi()
  const base = `/api/experience/journeys/${journey.id}`
  const [settings, setSettings] = useState({
    title: journey.title, description: journey.description ?? '', autoAssign: journey.autoAssign ?? '', bannerTone: journey.bannerTone,
  })
  const [newModule, setNewModule] = useState('')
  const dirty = settings.title !== journey.title || settings.description !== (journey.description ?? '')
    || settings.autoAssign !== (journey.autoAssign ?? '') || settings.bannerTone !== journey.bannerTone
  const stepCount = journey.modules.reduce((n, m) => n + m.steps.length, 0)

  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-900">Journey settings</h2>
          <div className="flex items-center gap-2">
            {journey.status === 'PUBLISHED' ? (
              <>
                <span className="text-xs text-emerald-800">Published — people can take it</span>
                <button type="button" disabled={busy} onClick={() => call(base, 'PATCH', { status: 'DRAFT' }, 'Unpublished')}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">Unpublish</button>
              </>
            ) : (
              <>
                <span className="text-xs text-amber-800">Draft — nobody can see it yet</span>
                <button type="button" disabled={busy || stepCount === 0} onClick={() => call(base, 'PATCH', { status: 'PUBLISHED' }, 'Published')}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">Publish journey</button>
              </>
            )}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Name</span>
            <input className={input} value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Assign automatically</span>
            <select className={input} value={settings.autoAssign} onChange={(e) => setSettings({ ...settings, autoAssign: e.target.value })}>
              {AUTO_ASSIGN.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1">Introduction</span>
          <textarea className={`${input} min-h-[60px]`} value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-600">Colour</span>
          {Object.entries(BANNER_TONES).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setSettings({ ...settings, bannerTone: k })}
              className={`h-7 px-3 rounded-full text-xs bg-gradient-to-r ${t.gradient} ${settings.bannerTone === k ? 'ring-2 ring-slate-900' : ''}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" disabled={busy || !dirty || !settings.title.trim()}
          onClick={() => call(base, 'PATCH', settings, 'Settings saved')}
          className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">
          Save settings
        </button>
      </section>

      {journey.modules.map((m, i) => (
        <ModuleCard key={m.id} journeyId={journey.id} module={m} first={i === 0} last={i === journey.modules.length - 1} programs={programs} />
      ))}

      <section className="bg-white border border-dashed border-slate-300 rounded-xl p-4 flex gap-2 flex-wrap items-end">
        <label className="block flex-1 min-w-[220px]">
          <span className="block text-xs font-medium text-slate-600 mb-1">Add a module</span>
          <input className={input} value={newModule} onChange={(e) => setNewModule(e.target.value)} placeholder="e.g. First Month" />
        </label>
        <button type="button" disabled={busy || !newModule.trim()}
          onClick={async () => { if (await call(`${base}/modules`, 'POST', { title: newModule }, 'Module added')) setNewModule('') }}
          className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">
          Add module
        </button>
      </section>

      <div className="pt-2">
        <button type="button" disabled={busy}
          onClick={async () => {
            if (!confirm(`Delete "${journey.title}" and everyone's progress on it?`)) return
            if (await call(base, 'DELETE', null, 'Journey deleted')) router.push('/dashboard/journeys/studio')
          }}
          className="text-sm px-4 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">
          Delete journey
        </button>
      </div>
    </div>
  )
}

function ModuleCard({ journeyId, module: m, first, last, programs }: {
  journeyId: string; module: EditorModule; first: boolean; last: boolean; programs: { id: string; title: string }[]
}) {
  const { busy, call } = useApi()
  const url = `/api/experience/journeys/${journeyId}/modules`
  const [f, setF] = useState({ title: m.title, description: m.description ?? '' })
  const [adding, setAdding] = useState(false)
  const dirty = f.title !== m.title || f.description !== (m.description ?? '')

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input className={`${input} font-semibold flex-1 min-w-[200px]`} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Module name" />
          <button type="button" disabled={busy || first} onClick={() => call(url, 'PATCH', { moduleId: m.id, move: 'UP' }, null)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-30">Move up</button>
          <button type="button" disabled={busy || last} onClick={() => call(url, 'PATCH', { moduleId: m.id, move: 'DOWN' }, null)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-30">Move down</button>
          <button type="button" disabled={busy}
            onClick={() => { if (confirm(`Delete the module "${m.title}" and its steps?`)) call(`${url}?moduleId=${m.id}`, 'DELETE', null, 'Module deleted') }}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">Delete module</button>
        </div>
        <textarea className={`${input} min-h-[44px]`} value={f.description} placeholder="What this module is for (optional)"
          onChange={(e) => setF({ ...f, description: e.target.value })} />
        {dirty && (
          <button type="button" disabled={busy || !f.title.trim()} onClick={() => call(url, 'PATCH', { moduleId: m.id, ...f }, 'Module saved')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">Save module</button>
        )}
      </div>

      {m.steps.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-400">No steps yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {m.steps.map((s, i) => (
            <StepRow key={s.id} journeyId={journeyId} step={s} first={i === 0} last={i === m.steps.length - 1} programs={programs} />
          ))}
        </ul>
      )}

      <div className="px-5 py-3 border-t border-slate-100">
        {adding ? (
          <StepForm programs={programs} submitLabel="Add step" busy={busy}
            onCancel={() => setAdding(false)}
            onSubmit={async (v) => { if (await call(`/api/experience/journeys/${journeyId}/steps`, 'POST', { moduleId: m.id, ...v }, 'Step added')) setAdding(false) }} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-sm font-medium text-slate-900 underline underline-offset-2">Add a step</button>
        )}
      </div>
    </section>
  )
}

function StepRow({ journeyId, step: s, first, last, programs }: {
  journeyId: string; step: EditorStep; first: boolean; last: boolean; programs: { id: string; title: string }[]
}) {
  const { busy, call } = useApi()
  const [editing, setEditing] = useState(false)
  const url = `/api/experience/journeys/${journeyId}/steps`
  return (
    <li className="px-5 py-3">
      {editing ? (
        <StepForm programs={programs} initial={s} submitLabel="Save step" busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => { if (await call(url, 'PATCH', { stepId: s.id, ...v }, 'Step saved')) setEditing(false) }} />
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">{s.title}</p>
            <p className="text-xs text-slate-500">
              {stepTypeOf(s.type).label} · {s.required ? 'Required' : 'Optional'}
              {s.dueDays != null ? ` · due ${s.dueDays} ${s.dueDays === 1 ? 'day' : 'days'} after it is assigned` : ''}
              {s.minutes ? ` · ${s.minutes} min` : ''}
              {s.type === 'LEARNING' && s.programId ? ` · ${programs.find((p) => p.id === s.programId)?.title ?? 'course'}` : s.url ? ` · ${s.url}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy || first} onClick={() => call(url, 'PATCH', { stepId: s.id, move: 'UP' }, null)}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 disabled:opacity-30">Up</button>
            <button type="button" disabled={busy || last} onClick={() => call(url, 'PATCH', { stepId: s.id, move: 'DOWN' }, null)}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 disabled:opacity-30">Down</button>
            <button type="button" onClick={() => setEditing(true)} className="text-xs px-2.5 py-1 rounded-lg border border-slate-300">Edit step</button>
            <button type="button" disabled={busy}
              onClick={() => { if (confirm(`Delete the step "${s.title}"?`)) call(`${url}?stepId=${s.id}`, 'DELETE', null, 'Step deleted') }}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 disabled:opacity-40">Delete</button>
          </div>
        </div>
      )}
    </li>
  )
}

interface StepValues { title: string; type: string; body: string; url: string; programId: string; required: boolean; dueDays: string; minutes: string }

function StepForm({ initial, programs, submitLabel, busy, onSubmit, onCancel }: {
  initial?: EditorStep
  programs: { id: string; title: string }[]
  submitLabel: string
  busy: boolean
  onSubmit: (v: StepValues) => void
  onCancel: () => void
}) {
  const [v, setV] = useState<StepValues>({
    title: initial?.title ?? '',
    type: initial?.type ?? 'TASK',
    body: initial?.body ?? '',
    url: initial?.url ?? '',
    programId: initial?.programId ?? '',
    required: initial?.required ?? true,
    dueDays: initial?.dueDays != null ? String(initial.dueDays) : '',
    minutes: initial?.minutes != null ? String(initial.minutes) : '',
  })
  const needsUrl = ['LINK', 'VIDEO', 'ARTICLE', 'TASK'].includes(v.type)
  return (
    <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_180px]">
        <input className={input} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Step title" aria-label="Step title" />
        <select className={input} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} aria-label="Step type">
          {STEP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <textarea className={`${input} min-h-[70px]`} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })}
        placeholder="What the person reads on the step (markdown)" />
      {v.type === 'LEARNING' ? (
        <select className={input} value={v.programId} onChange={(e) => setV({ ...v, programId: e.target.value })} aria-label="Course">
          <option value="">Pick the course…</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      ) : needsUrl ? (
        <input className={input} value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })}
          placeholder="/dashboard/policies  ·  https://…  ·  {profile} for their own profile" />
      ) : null}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm flex items-center gap-1.5">
          <input type="checkbox" className="accent-slate-900" checked={v.required} onChange={(e) => setV({ ...v, required: e.target.checked })} />
          Required
        </label>
        <label className="text-sm flex items-center gap-1.5">
          Due
          <input type="number" min={0} max={365} className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm" value={v.dueDays}
            onChange={(e) => setV({ ...v, dueDays: e.target.value })} />
          days after it is assigned
        </label>
        <label className="text-sm flex items-center gap-1.5">
          <input type="number" min={0} max={600} className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm" value={v.minutes}
            onChange={(e) => setV({ ...v, minutes: e.target.value })} />
          minutes
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy || !v.title.trim() || (v.type === 'LEARNING' && !v.programId)} onClick={() => onSubmit(v)}
          className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">{submitLabel}</button>
        <button type="button" onClick={onCancel} className="text-sm px-4 py-1.5 rounded-lg border border-slate-300">Cancel</button>
      </div>
    </div>
  )
}
