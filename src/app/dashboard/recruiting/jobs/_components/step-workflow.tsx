'use client'

/**
 * Step 5 · Workflow. The stages are the same for every job — that is what
 * lets the board compare them — so what a job plans here is its interview
 * rounds. Schedule Interview offers them, in order, for this job's candidates.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileText, Filter, MessageSquare, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeFetch } from '@/lib/safe-fetch'
import { INTERVIEW_TYPES, JOB_STAGES, type InterviewRound } from '@/lib/job-post'

interface Props {
  jobId: string
  initial: InterviewRound[]
  canEdit: boolean
}

const STAGE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  APPLIED: UserPlus,
  SCREENING: Filter,
  INTERVIEW: MessageSquare,
  OFFER: FileText,
  HIRED: CheckCircle2,
}

const PRESETS: InterviewRound[] = [
  { name: 'Phone screen', type: 'PHONE' },
  { name: 'Technical interview', type: 'TECHNICAL' },
  { name: 'Interview with the hiring manager', type: 'VIDEO' },
  { name: 'Final interview with the CEO', type: 'ONSITE' },
]

export function StepWorkflow({ jobId, initial, canEdit }: Props) {
  const router = useRouter()
  const [rounds, setRounds] = useState<InterviewRound[]>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = JSON.stringify(rounds) !== JSON.stringify(initial)

  const update = (i: number, patch: Partial<InterviewRound>) =>
    setRounds((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const move = (i: number, by: number) =>
    setRounds((rs) => {
      const next = [...rs]
      const [r] = next.splice(i, 1)
      next.splice(i + by, 0, r)
      return next
    })
  const remove = (i: number) => setRounds((rs) => rs.filter((_, j) => j !== i))
  const add = (r: InterviewRound) => setRounds((rs) => (rs.length >= 10 ? rs : [...rs, r]))

  async function save() {
    setMsg(null)
    if (rounds.some((r) => !r.name.trim())) { setMsg({ ok: false, text: 'Every round needs a name, or remove it.' }); return }
    setBusy(true)
    const r = await safeFetch(`/api/recruiting/requisitions/${jobId}/post`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewRounds: rounds }),
    })
    setBusy(false)
    if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Could not save the rounds.' }); return }
    setMsg({ ok: true, text: 'Saved.' })
    router.refresh()
  }

  return (
    <div className="max-w-4xl space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h3 className="px-5 py-3.5 text-base font-semibold text-slate-900 border-b border-slate-100 bg-slate-50/70">Recruiting pipeline</h3>
        <div className="p-5">
          <div className="grid grid-cols-5 gap-2">
            {JOB_STAGES.map((s) => {
              const Icon = STAGE_ICON[s.key]
              return (
                <div key={s.key} className="rounded-lg border border-slate-200 bg-slate-50/60 py-3 text-center">
                  <Icon className="w-5 h-5 mx-auto text-slate-500" />
                  <p className="mt-1.5 text-xs font-medium text-slate-700">{s.label}</p>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Every job moves through the same stages, so the board can compare them. Anyone not taken forward is marked Rejected at any stage.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h3 className="px-5 py-3.5 text-base font-semibold text-slate-900 border-b border-slate-100 bg-slate-50/70">Interview rounds</h3>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-500">
            The interviews a candidate goes through for this job, in order. They are offered when you schedule an interview for one of its candidates.
          </p>

          {rounds.length === 0 ? (
            <p className="text-sm text-slate-400">No rounds planned yet.</p>
          ) : (
            <ol className="space-y-2">
              {rounds.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-sm font-semibold text-slate-400 tabular-nums">{i + 1}.</span>
                  <Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} disabled={!canEdit}
                    aria-label={`Round ${i + 1} name`} className="flex-1 min-w-[200px] h-9" />
                  <select value={r.type} onChange={(e) => update(i, { type: e.target.value })} disabled={!canEdit}
                    aria-label={`Round ${i + 1} type`}
                    className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm">
                    {INTERVIEW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {canEdit && (
                    <span className="flex items-center gap-2 text-xs">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                        className="text-slate-500 hover:text-slate-900 disabled:text-slate-300">Move up</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === rounds.length - 1}
                        className="text-slate-500 hover:text-slate-900 disabled:text-slate-300">Move down</button>
                      <button type="button" onClick={() => remove(i)} className="text-slate-500 hover:text-red-700">Remove</button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-slate-500">Add:</span>
              {PRESETS.filter((p) => !rounds.some((r) => r.name === p.name)).map((p) => (
                <button key={p.name} type="button" onClick={() => add(p)} disabled={rounds.length >= 10}
                  className="text-xs px-2.5 py-1 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50">
                  {p.name}
                </button>
              ))}
              <button type="button" onClick={() => add({ name: '', type: 'VIDEO' })} disabled={rounds.length >= 10}
                className="text-xs font-medium text-slate-800 underline underline-offset-2">
                Add a round of your own
              </button>
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3">
            <Button onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save rounds'}</Button>
            {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
          </div>
        )}
      </section>
    </div>
  )
}
