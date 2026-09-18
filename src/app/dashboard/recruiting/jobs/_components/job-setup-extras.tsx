'use client'

/**
 * Two parts of a job's setup that the candidate view reads:
 *
 *   ScorecardEditor — the job's interview kit: the competencies it is judged
 *     on and the questions under each. Every evaluation of every candidate
 *     uses it, so their scores can be compared. Drafted from the job
 *     description with AI, then edited here.
 *   CustomFields — what is recorded about each candidate beyond the standard
 *     details. They are the job's screening columns: a column in the
 *     Requisition Workspace sheet, a line on each candidate's profile, and a
 *     question the CV reader answers for every CV.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeFetch } from '@/lib/safe-fetch'
import type { ScorecardCompetency } from '@/lib/candidate-review-labels'

const card = 'rounded-xl border border-slate-200 bg-white overflow-hidden'
const head = 'px-5 py-3.5 text-base font-semibold text-slate-900 border-b border-slate-100 bg-slate-50/70'

export function ScorecardEditor({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<ScorecardCompetency[] | null>(null)
  const [saved, setSaved] = useState<ScorecardCompetency[]>([])
  const [busy, setBusy] = useState<null | 'draft' | 'save'>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch(`/api/recruiting/requisitions/${jobId}/scorecard`)
      .then((r) => r.json())
      .then((d) => { setRows(d.scorecard ?? []); setSaved(d.scorecard ?? []) })
      .catch(() => setRows([]))
  }, [jobId])

  async function draft() {
    if (rows && rows.length && !confirm('Replace the scorecard with a new draft from the job description?')) return
    setBusy('draft'); setMsg(null)
    const r = await safeFetch<{ scorecard: ScorecardCompetency[] }>(`/api/recruiting/requisitions/${jobId}/scorecard`, { method: 'POST' })
    setBusy(null)
    if (!r.ok || !r.data) { setMsg({ ok: false, text: r.error ?? 'Could not draft it.' }); return }
    setRows(r.data.scorecard); setSaved(r.data.scorecard)
    setMsg({ ok: true, text: 'Drafted from the job description and saved. Edit anything below.' })
  }

  async function save() {
    if (!rows) return
    setBusy('save'); setMsg(null)
    const r = await safeFetch<{ scorecard: ScorecardCompetency[] }>(`/api/recruiting/requisitions/${jobId}/scorecard`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scorecard: rows }),
    })
    setBusy(null)
    if (!r.ok || !r.data) { setMsg({ ok: false, text: r.error ?? 'Could not save.' }); return }
    setRows(r.data.scorecard); setSaved(r.data.scorecard)
    setMsg({ ok: true, text: 'Saved.' })
  }

  const set = (i: number, patch: Partial<ScorecardCompetency>) => setRows((rs) => (rs ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved)

  return (
    <section className={card}>
      <h3 className={head}>Interview kit and scorecard</h3>
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-500">
          The competencies this job is judged on, with the questions to ask for each. Interviewers rate every candidate on
          them in the candidate&apos;s Review tab, so the scores can be compared.
        </p>
        {rows === null ? <p className="text-sm text-slate-400">Loading…</p> : (
          <>
            {rows.length === 0 && <p className="text-sm text-slate-400">No scorecard yet.</p>}
            <ol className="space-y-3">
              {rows.map((r, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-400 w-5">{i + 1}.</span>
                    <Input value={r.competency} disabled={!canEdit} onChange={(e) => set(i, { competency: e.target.value })}
                      aria-label={`Competency ${i + 1}`} className="h-9 font-medium" />
                    {canEdit && (
                      <button type="button" className="text-xs text-slate-500 hover:text-red-700"
                        onClick={() => setRows((rs) => (rs ?? []).filter((_, j) => j !== i))}>Remove</button>
                    )}
                  </div>
                  <textarea rows={Math.max(2, r.questions.length)} disabled={!canEdit}
                    value={r.questions.join('\n')}
                    onChange={(e) => set(i, { questions: e.target.value.split('\n') })}
                    aria-label={`Questions for ${r.competency}`}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-relaxed"
                    placeholder="One question per line" />
                </li>
              ))}
            </ol>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...(rs ?? []), { competency: '', questions: [] }])}>
                  Add a competency
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={draft} disabled={!!busy}>
                  {busy === 'draft' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                  {rows.length ? 'Redraft from the job description' : 'Draft from the job description'}
                </Button>
                <Button type="button" size="sm" onClick={save} disabled={!!busy || !dirty}>{busy === 'save' ? 'Saving…' : 'Save kit'}</Button>
              </div>
            )}
          </>
        )}
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
      </div>
    </section>
  )
}

export function CustomFields({ jobId, initial, canEdit }: { jobId: string; initial: string[]; canEdit: boolean }) {
  const router = useRouter()
  const [cols, setCols] = useState(initial)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(next: string[]) {
    setBusy(true); setError('')
    const r = await safeFetch(`/api/recruiting/requisitions/${jobId}/post`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screeningColumns: next }),
    })
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'Could not save the fields.'); return }
    setCols(next)
    router.refresh()
  }

  function add() {
    const label = draft.replace(/\s+/g, ' ').trim()
    if (!label) return
    if (cols.some((c) => c.toLowerCase() === label.toLowerCase())) { setError(`There is already a field called "${label}".`); return }
    setDraft('')
    void save([...cols, label])
  }

  const BUILT_IN = ['Current salary', 'Expected salary', 'Immediate join / notice period', 'Onsite willingness', 'Why leaving']

  return (
    <section className={card}>
      <h3 className={head}>Custom fields</h3>
      <div className="p-5 space-y-3">
        <p className="text-sm text-slate-500">
          What is recorded about each candidate for this job. Each field is a column in the Requisition Workspace sheet, a line on
          the candidate&apos;s profile, and a question answered for every CV that is uploaded.
        </p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {BUILT_IN.map((b) => (
            <li key={b} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-slate-800">{b}</span>
              <span className="text-xs text-slate-400">Every job · visible to the hiring team</span>
            </li>
          ))}
          {cols.map((c) => (
            <li key={c} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-slate-900 font-medium">{c}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-slate-400">This job · visible to the hiring team</span>
                {canEdit && (
                  <button type="button" disabled={busy} onClick={() => save(cols.filter((x) => x !== c))}
                    className="text-xs text-slate-500 hover:text-red-700">Remove</button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Portfolio link, Shopify Liquid, Available after"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} className="h-9 flex-1" aria-label="New field" />
            <Button size="sm" onClick={add} disabled={busy || !draft.trim()}>Add field</Button>
          </div>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </section>
  )
}
