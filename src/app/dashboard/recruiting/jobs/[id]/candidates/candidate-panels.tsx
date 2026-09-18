'use client'

/**
 * The tabs of a candidate in the candidate view: how they match the job,
 * emailing them, the hiring team's evaluations and assessments, and comments.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CircleHelp, Copy, Loader2, Mail, Minus, Sparkles, Star, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { EMAIL_PURPOSES } from '@/lib/candidate-email'
import {
  ASSESSMENT_KINDS, COMMENT_VISIBILITY, RECOMMENDATIONS, type ScorecardCompetency,
} from '@/lib/candidate-review-labels'

export interface MatchRequirement { category: string; requirement: string; met: 'yes' | 'partial' | 'no' | 'unknown'; evidence: string | null }
export interface CandidateMatch {
  score: number | null
  summary: string | null
  requirements: MatchRequirement[]
  basis: 'cv' | 'profile'
  screenedAt: string
}

const input = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10'
const label = 'block text-xs font-semibold text-slate-600 mb-1'
const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi',
})
async function json(res: Response): Promise<Record<string, unknown>> { return res.json().catch(() => ({})) }

// ─── How they match the job ──────────────────────────────────────────────────

export function ScoreRing({ score, size = 44 }: { score: number | null; size?: number }) {
  const s = score ?? 0
  const tone = score == null ? '#cbd5e1' : s >= 70 ? '#059669' : s >= 50 ? '#d97706' : '#dc2626'
  const r = size / 2 - 3
  const circ = 2 * Math.PI * r
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - s / 100)} strokeLinecap="round" />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums" style={{ color: score == null ? '#94a3b8' : '#0f172a' }}>
        {score == null ? '–' : score}
      </span>
    </span>
  )
}

const MET: Record<MatchRequirement['met'], { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  yes: { icon: Check, cls: 'text-emerald-600', label: 'Meets' },
  partial: { icon: Minus, cls: 'text-amber-600', label: 'Partly meets' },
  no: { icon: X, cls: 'text-red-500', label: 'Does not meet' },
  unknown: { icon: CircleHelp, cls: 'text-slate-400', label: 'Not stated' },
}

export function MatchCard({ candidateId, firstName, match, hasJd, onDone }: {
  candidateId: string; firstName: string; match: CandidateMatch | null; hasJd: boolean; onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(true)

  async function screen() {
    setBusy(true)
    const res = await fetch(`/api/recruiting/candidates/${candidateId}/screen`, { method: 'POST' })
    const d = await json(res)
    setBusy(false)
    if (!res.ok) { toastError('Could not screen', String(d.error ?? res.statusText)); return }
    toastSuccess(`Screened: ${d.matchScore ?? '–'}/100`)
    onDone()
  }

  const groups = match
    ? ['Education', 'Experience', 'Skills', 'Other']
      .map((g) => ({ g, rows: match.requirements.filter((r) => r.category === g) }))
      .filter((x) => x.rows.length)
    : []
  const met = match?.requirements.filter((r) => r.met === 'yes').length ?? 0

  return (
    <section className="rounded-xl border border-violet-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-5 py-4 text-left">
        <ScoreRing score={match?.score ?? null} />
        <span className="text-base font-semibold text-slate-900">How {firstName} matches this job</span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded px-2 py-0.5">
          <Sparkles className="w-3 h-3" /> AI
        </span>
        <span className="ml-auto text-xs text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4">
          {!match ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {hasJd
                  ? `Not screened against the job description yet. Screening reads ${firstName}'s CV — or their details if there is no CV — and marks every requirement.`
                  : 'This job has no description yet, so there is nothing to screen against. Write it in Edit job.'}
              </p>
              {hasJd && (
                <Button size="sm" onClick={screen} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                  Screen against the job
                </Button>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Requirements read from the job description and {match.basis === 'cv' ? `${firstName}'s CV` : `the details on ${firstName}'s record (no CV file)`}:
                {' '}<strong>{met} of {match.requirements.length}</strong> met.
              </p>
              {match.summary && <p className="text-sm text-slate-900 mt-2">{match.summary}</p>}
              <div className="mt-4 space-y-4">
                {groups.map(({ g, rows }) => (
                  <div key={g} className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
                    <p className="text-sm font-medium text-slate-500">{g}</p>
                    <ul className="space-y-2">
                      {rows.map((r, i) => {
                        const m = MET[r.met]
                        const Icon = m.icon
                        return (
                          <li key={i} className="flex gap-2">
                            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${m.cls}`} aria-label={m.label} />
                            <span className="min-w-0">
                              <span className={`block text-sm ${r.met === 'yes' ? 'font-medium text-slate-900' : 'text-slate-600'}`}>{r.requirement}</span>
                              {r.evidence && <span className="block text-xs text-slate-500">{r.evidence}</span>}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>Screened {fmtDate(match.screenedAt)}</span>
                <Button size="sm" variant="outline" onClick={screen} disabled={busy}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Screen again
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Communication ───────────────────────────────────────────────────────────

export function EmailPanel({ candidateId, email }: { candidateId: string; email: string | null }) {
  const [purpose, setPurpose] = useState('CALL')
  const [note, setNote] = useState('')
  const [to, setTo] = useState(email ?? '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function generate() {
    setBusy(true)
    const res = await fetch(`/api/recruiting/candidates/${candidateId}/draft-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose, note }),
    })
    const d = await json(res)
    setBusy(false)
    if (!res.ok) { toastError('Could not write the email', String(d.error ?? res.statusText)); return }
    setSubject(String(d.subject ?? ''))
    setBody(String(d.body ?? ''))
    if (!to && typeof d.to === 'string') setTo(d.to)
  }

  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-600" /> Write the email with AI</p>
        <p className="text-xs text-slate-600">Personalised from the candidate&apos;s CV and details, in Convertt&apos;s voice, signed by you. Nothing is sent until you send it.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>What is it for?</label>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={input}>
              {EMAIL_PURPOSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Anything to include (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={input}
              placeholder="e.g. Tuesday or Wednesday after 3 pm, video call" />
          </div>
        </div>
        <Button size="sm" onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
          Generate with AI
        </Button>
      </div>
      <div>
        <label className={label}>To</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} className={input} placeholder="candidate@example.com" />
      </div>
      <div>
        <label className={label}>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={input} />
      </div>
      <div>
        <label className={label}>Message</label>
        <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} className={`${input} leading-relaxed`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={gmail} target="_blank" rel="noreferrer"
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium ${to && body ? 'bg-slate-900 text-white hover:bg-slate-800' : 'pointer-events-none bg-slate-200 text-slate-400'}`}>
          <Mail className="w-4 h-4" /> Open in Gmail to send
        </a>
        <Button variant="outline" size="sm" disabled={!body}
          onClick={() => navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => toastSuccess('Copied'))}>
          <Copy className="w-4 h-4 mr-1.5" /> Copy
        </Button>
      </div>
    </section>
  )
}

// ─── Review: evaluations and assessments ─────────────────────────────────────

interface Evaluation {
  id: string; stage: string; authorName: string; authorUserId: string; overallRating: number | null
  recommendation: string | null; summary: string | null; createdAt: string
  ratings: { competency: string; question: string | null; rating: number | null; note: string | null }[]
}
interface Assessment {
  id: string; name: string; kind: string; brief: string | null; score: number | null; maxScore: number | null
  result: string | null; notes: string | null; link: string | null; sentAt: string | null; completedAt: string | null
  recordedBy: string | null; createdAt: string
}

const STAGE_LABEL: Record<string, string> = { APPLIED: 'Applied', SCREENING: 'Screening', INTERVIEW: 'Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Disqualified' }

function Stars({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} aria-label={`${n} of 5`}
          onClick={() => onChange?.(value === n ? null : n)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}>
          <Star className={`w-4 h-4 ${value != null && n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
        </button>
      ))}
    </span>
  )
}

export function ReviewPanel({ candidateId, jobId, stage, firstName }: { candidateId: string; jobId: string; stage: string; firstName: string }) {
  const [tab, setTab] = useState<'evaluations' | 'assessments'>('evaluations')
  const [data, setData] = useState<{ evaluations: Evaluation[]; assessments: Assessment[] } | null>(null)
  const [writing, setWriting] = useState(false)
  const [recording, setRecording] = useState<Assessment | 'new' | null>(null)

  const load = useCallback(() => {
    fetch(`/api/recruiting/candidates/${candidateId}/review`).then(json)
      .then((d) => setData({ evaluations: (d.evaluations ?? []) as Evaluation[], assessments: (d.assessments ?? []) as Assessment[] }))
      .catch(() => setData({ evaluations: [], assessments: [] }))
  }, [candidateId])
  useEffect(() => { load() }, [load])

  async function remove(type: 'evaluation' | 'assessment', rid: string) {
    if (!confirm('Remove this for good?')) return
    const res = await fetch(`/api/recruiting/candidates/${candidateId}/review?type=${type}&rid=${rid}`, { method: 'DELETE' })
    if (!res.ok) { toastError('Could not remove it', String((await json(res)).error ?? '')); return }
    load()
  }

  const avg = data && data.evaluations.filter((e) => e.overallRating != null).length
    ? Math.round((data.evaluations.reduce((a, e) => a + (e.overallRating ?? 0), 0) / data.evaluations.filter((e) => e.overallRating != null).length) * 10) / 10
    : null

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-5 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide">
        {(['evaluations', 'assessments'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`pb-2 -mb-px border-b-2 ${tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {t === 'evaluations' ? `Evaluations ${data?.evaluations.length ?? ''}` : `Assessments ${data?.assessments.length ?? ''}`}
          </button>
        ))}
      </div>

      {!data ? <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p> : tab === 'evaluations' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {data.evaluations.length
                ? <>Average rating <strong>{avg ?? '–'}</strong> / 5 from {data.evaluations.length} evaluation{data.evaluations.length === 1 ? '' : 's'}.</>
                : `No one has evaluated ${firstName} yet.`}
            </p>
            {!writing && <Button size="sm" onClick={() => setWriting(true)}><Star className="w-4 h-4 mr-1.5" /> Add evaluation</Button>}
          </div>
          {writing && <EvaluationForm candidateId={candidateId} jobId={jobId} stage={stage} onClose={() => setWriting(false)} onSaved={() => { setWriting(false); load() }} />}
          {data.evaluations.map((e) => (
            <article key={e.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-slate-900">Scorecard for {STAGE_LABEL[e.stage] ?? e.stage} stage</p>
                <Stars value={e.overallRating != null ? Math.round(e.overallRating) : null} />
                {e.recommendation && <span className="text-xs font-medium text-slate-700 bg-slate-100 rounded px-2 py-0.5">{RECOMMENDATIONS.find((r) => r.key === e.recommendation)?.label}</span>}
                <span className="ml-auto text-xs text-slate-500">{e.authorName} · {fmtDate(e.createdAt)}</span>
                <button type="button" onClick={() => remove('evaluation', e.id)} className="text-slate-400 hover:text-red-600" aria-label="Remove this evaluation">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {e.summary && <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">{e.summary}</p>}
              {e.ratings.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {e.ratings.map((r, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-800">{r.question ?? r.competency}</span>
                        {r.rating != null && <Stars value={r.rating} />}
                      </div>
                      {r.question && <span className="text-[11px] text-slate-400">{r.competency}</span>}
                      {r.note && <p className="text-slate-600 bg-slate-50 rounded px-2 py-1 mt-1">{r.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Practical tasks, skills tests and outside assessments {firstName} has been sent, and how they did.</p>
            {!recording && <Button size="sm" onClick={() => setRecording('new')}>Add assessment</Button>}
          </div>
          {recording && (
            <AssessmentForm candidateId={candidateId} jobId={jobId} existing={recording === 'new' ? null : recording}
              onClose={() => setRecording(null)} onSaved={() => { setRecording(null); load() }} />
          )}
          {data.assessments.map((a) => (
            <article key={a.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                <span className="text-xs text-slate-500">{ASSESSMENT_KINDS.find((k) => k.key === a.kind)?.label}</span>
                {a.score != null && (
                  <span className="text-sm font-semibold tabular-nums bg-slate-100 rounded px-2 py-0.5">
                    Score {a.score}{a.maxScore ? ` / ${a.maxScore}` : ''}
                  </span>
                )}
                {a.result && <span className={`text-xs font-semibold rounded px-2 py-0.5 ${a.result === 'PASS' ? 'bg-emerald-50 text-emerald-800' : a.result === 'FAIL' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>{a.result.toLowerCase()}</span>}
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => setRecording(a)} className="text-xs text-slate-600 underline underline-offset-2">
                    {a.completedAt ? 'Edit' : 'Record the result'}
                  </button>
                  <button type="button" onClick={() => remove('assessment', a.id)} className="text-slate-400 hover:text-red-600" aria-label="Remove this assessment">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {a.sentAt ? `Sent ${fmtDate(a.sentAt)}` : 'Not marked as sent'}{a.completedAt ? ` · completed ${fmtDate(a.completedAt)}` : ''}{a.recordedBy ? ` · recorded by ${a.recordedBy}` : ''}
              </p>
              {a.notes && <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">{a.notes}</p>}
              {a.link && <a href={a.link} target="_blank" rel="noreferrer" className="text-sm text-slate-700 underline underline-offset-2">Open the submission</a>}
              {a.brief && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-slate-500">The task as sent</summary>
                  <p className="mt-1 whitespace-pre-line text-slate-700">{a.brief}</p>
                </details>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  )
}

function EvaluationForm({ candidateId, jobId, stage, onClose, onSaved }: {
  candidateId: string; jobId: string; stage: string; onClose: () => void; onSaved: () => void
}) {
  const [scorecard, setScorecard] = useState<ScorecardCompetency[] | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [ratings, setRatings] = useState<Record<string, { rating: number | null; note: string }>>({})
  const [recommendation, setRecommendation] = useState('')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [evalStage, setEvalStage] = useState(stage === 'REJECTED' ? 'SCREENING' : stage)

  useEffect(() => {
    fetch(`/api/recruiting/requisitions/${jobId}/scorecard`).then(json)
      .then((d) => setScorecard((d.scorecard ?? []) as ScorecardCompetency[]))
      .catch(() => setScorecard([]))
  }, [jobId])

  async function draft() {
    setDrafting(true)
    const res = await fetch(`/api/recruiting/requisitions/${jobId}/scorecard`, { method: 'POST' })
    const d = await json(res)
    setDrafting(false)
    if (!res.ok) { toastError('Could not draft the scorecard', String(d.error ?? '')); return }
    setScorecard(d.scorecard as ScorecardCompetency[])
  }

  const key = (c: string, q: string | null) => `${c}::${q ?? ''}`
  const set = (k: string, patch: Partial<{ rating: number | null; note: string }>) =>
    setRatings((r) => ({ ...r, [k]: { rating: r[k]?.rating ?? null, note: r[k]?.note ?? '', ...patch } }))

  async function save() {
    setSaving(true)
    const rows = (scorecard ?? []).flatMap((c) => [
      { competency: c.competency, question: null as string | null, ...ratings[key(c.competency, null)] },
      ...c.questions.map((q) => ({ competency: c.competency, question: q, ...ratings[key(c.competency, q)] })),
    ]).filter((r) => r.rating != null || r.note)
    const res = await fetch(`/api/recruiting/candidates/${candidateId}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'evaluation', stage: evalStage, ratings: rows, recommendation, summary }),
    })
    setSaving(false)
    if (!res.ok) { toastError('Could not save the evaluation', String((await json(res)).error ?? '')); return }
    toastSuccess('Evaluation saved')
    onSaved()
  }

  return (
    <div className="rounded-lg border border-slate-300 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-slate-900">Scorecard for</p>
        <select value={evalStage} onChange={(e) => setEvalStage(e.target.value)} className="h-8 rounded-md border border-slate-300 px-2 text-sm">
          {['SCREENING', 'INTERVIEW', 'OFFER'].map((s) => <option key={s} value={s}>{STAGE_LABEL[s]} stage</option>)}
        </select>
      </div>
      {scorecard === null ? <p className="text-sm text-slate-400">Loading the job&apos;s scorecard…</p> : scorecard.length === 0 ? (
        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600 flex flex-wrap items-center justify-between gap-2">
          This job has no scorecard yet. Draw one from the job description — the same competencies are then used for every candidate.
          <Button size="sm" variant="outline" onClick={draft} disabled={drafting}>
            {drafting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />} Draft the scorecard
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {scorecard.map((c) => (
            <div key={c.competency} className="rounded-md border border-slate-100">
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50">
                <p className="text-sm font-semibold text-slate-900">{c.competency}</p>
                <Stars value={ratings[key(c.competency, null)]?.rating ?? null} onChange={(v) => set(key(c.competency, null), { rating: v })} />
              </div>
              <ul className="divide-y divide-slate-50">
                {c.questions.map((q) => (
                  <li key={q} className="px-3 py-2 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-700">{q}</p>
                      <Stars value={ratings[key(c.competency, q)]?.rating ?? null} onChange={(v) => set(key(c.competency, q), { rating: v })} />
                    </div>
                    <input value={ratings[key(c.competency, q)]?.note ?? ''} onChange={(e) => set(key(c.competency, q), { note: e.target.value })}
                      placeholder="What did they say?" className="w-full h-8 rounded border border-slate-200 px-2 text-sm" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <label className={label}>Your recommendation</label>
          <select value={recommendation} onChange={(e) => setRecommendation(e.target.value)} className={input}>
            <option value="">Choose…</option>
            {RECOMMENDATIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Summary</label>
          <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} className={input} placeholder="Strengths, concerns, and what to test next." />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save evaluation'}</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

function AssessmentForm({ candidateId, jobId, existing, onClose, onSaved }: {
  candidateId: string; jobId: string; existing: Assessment | null; onClose: () => void; onSaved: () => void
}) {
  const ymd = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }) : '')
  const [f, setF] = useState({
    name: existing?.name ?? '', kind: existing?.kind ?? 'PRACTICAL', brief: existing?.brief ?? '',
    score: existing?.score?.toString() ?? '', maxScore: existing?.maxScore?.toString() ?? '100',
    result: existing?.result ?? '', notes: existing?.notes ?? '', link: existing?.link ?? '',
    sentAt: ymd(existing?.sentAt ?? null), completedAt: ymd(existing?.completedAt ?? null),
  })
  const [note, setNote] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)

  async function draft() {
    setDrafting(true)
    const res = await fetch(`/api/recruiting/requisitions/${jobId}/assessment-draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: f.kind, note }),
    })
    const d = await json(res)
    setDrafting(false)
    if (!res.ok) { toastError('Could not draft it', String(d.error ?? '')); return }
    setF((x) => ({ ...x, name: String(d.name ?? x.name), brief: String(d.brief ?? '') }))
  }

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/recruiting/candidates/${candidateId}/review`, {
      method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'assessment', id: existing?.id, ...f }),
    })
    setSaving(false)
    if (!res.ok) { toastError('Could not save', String((await json(res)).error ?? '')); return }
    toastSuccess('Assessment saved')
    onSaved()
  }

  return (
    <div className="rounded-lg border border-slate-300 p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label}>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} placeholder="e.g. Landing page CRO audit" /></div>
        <div>
          <label className={label}>Kind</label>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={input}>
            {ASSESSMENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
      </div>
      {!existing && (
        <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px]">
            <label className={label}>Write the task with AI from the job description (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder="e.g. focus on Shopify checkout pages" />
          </div>
          <Button size="sm" variant="outline" onClick={draft} disabled={drafting}>
            {drafting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />} Draft the task
          </Button>
        </div>
      )}
      <div><label className={label}>The task or questions</label><textarea rows={5} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} className={input} /></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className={label}>Sent on</label><input type="date" value={f.sentAt} onChange={(e) => setF({ ...f, sentAt: e.target.value })} className={input} /></div>
        <div><label className={label}>Completed on</label><input type="date" value={f.completedAt} onChange={(e) => setF({ ...f, completedAt: e.target.value })} className={input} /></div>
        <div><label className={label}>Score</label><input type="number" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} className={input} /></div>
        <div><label className={label}>Out of</label><input type="number" value={f.maxScore} onChange={(e) => setF({ ...f, maxScore: e.target.value })} className={input} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <label className={label}>Result</label>
          <select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} className={input}>
            <option value="">Not marked yet</option>
            <option value="PASS">Pass</option><option value="BORDERLINE">Borderline</option><option value="FAIL">Fail</option>
          </select>
        </div>
        <div><label className={label}>Link to the submission</label><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} className={input} placeholder="Figma, Drive or GitHub link" /></div>
      </div>
      <div><label className={label}>Notes</label><textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={input} /></div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !f.name.trim()}>{saving ? 'Saving…' : existing ? 'Save result' : 'Save assessment'}</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

// ─── Comments ────────────────────────────────────────────────────────────────

interface Comment { id: string; authorName: string; body: string; visibility: string; createdAt: string }

export function CommentsPanel({ candidateId, isHR }: { candidateId: string; isHR: boolean }) {
  const router = useRouter()
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [people, setPeople] = useState<{ id: string; fullName: string }[]>([])
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState('HIRING_TEAM')
  const [mentions, setMentions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/recruiting/candidates/${candidateId}/comments`).then(json)
      .then((d) => setComments((d.comments ?? []) as Comment[])).catch(() => setComments([]))
  }, [candidateId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/employees?limit=300&status=ACTIVE').then(json)
      .then((d) => setPeople(((d.employees ?? d.items ?? []) as { id: string; fullName: string }[])))
      .catch(() => {})
  }, [])

  async function add() {
    setSaving(true)
    const res = await fetch(`/api/recruiting/candidates/${candidateId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, visibility, mentions }),
    })
    setSaving(false)
    if (!res.ok) { toastError('Could not add the comment', String((await json(res)).error ?? '')); return }
    setBody(''); setMentions([])
    toastSuccess(mentions.length ? `Comment added — ${mentions.length} notified` : 'Comment added')
    load()
    router.refresh()
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-4 space-y-3">
        <label className={label}>Comment</label>
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={input}
          placeholder="What should the hiring team know about this candidate?" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Visible to</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={input}>
              {COMMENT_VISIBILITY.filter((v) => isHR || v.key !== 'HR').map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">Never visible to the candidate.</p>
          </div>
          <div>
            <label className={label}>Mention someone (they are notified)</label>
            <select value="" onChange={(e) => { const v = e.target.value; if (v && !mentions.includes(v)) setMentions([...mentions, v]) }} className={input}>
              <option value="">Add a person…</option>
              {people.filter((p) => !mentions.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
            {mentions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {mentions.map((m) => (
                  <button key={m} type="button" onClick={() => setMentions(mentions.filter((x) => x !== m))}
                    className="text-xs bg-slate-100 rounded-full px-2 py-0.5 hover:bg-red-50">
                    @{people.find((p) => p.id === m)?.fullName ?? 'someone'} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <Button size="sm" onClick={add} disabled={saving || !body.trim()}>{saving ? 'Adding…' : 'Add comment'}</Button>
      </div>
      {comments === null ? <p className="text-sm text-slate-400">Loading…</p> : comments.length === 0 ? (
        <p className="text-sm text-slate-400">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{c.authorName}</span> · {fmtDate(c.createdAt)} · {COMMENT_VISIBILITY.find((v) => v.key === c.visibility)?.label}
              </p>
              <p className="text-sm text-slate-800 mt-1 whitespace-pre-line">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
