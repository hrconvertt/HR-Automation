'use client'

/**
 * Probationary Performance Review Form.
 *
 * The decision packet was arithmetic wearing a decision's clothes — it read
 * zero absences for someone who had taken leave, and it suggested CONFIRM on
 * the strength of hours logged. This is the form a manager fills in, with the
 * evidence written next to each rating.
 *
 * Section 4 is the part that matters most. Convertt's policy is 10–15%, and a
 * rating has to agree with what it buys: Muzaffar was rated exceptional and
 * offered 12%, which is mid-bracket, and the gap between the two is exactly
 * what he wrote in about. The bracket for the chosen assessment is shown, and
 * going outside it is possible but visible.
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Check, Printer, AlertTriangle, Save, Mail, Copy, X,
} from 'lucide-react'
import {
  DIMENSIONS, RATING_SCALE, ASSESSMENTS, INCREMENT_BRACKETS,
  averageRating, suggestedAssessment, incrementFor,
} from '@/lib/probation-review'

interface Review {
  id: string
  ratingQuality: number | null; notesQuality: string | null
  ratingPunctuality: number | null; notesPunctuality: string | null
  ratingOwnership: number | null; notesOwnership: string | null
  ratingCommunication: number | null; notesCommunication: string | null
  ratingAdaptability: number | null; notesAdaptability: string | null
  overallAssessment: string | null
  managerRemarks: string | null
  currentSalary: number | null
  recommendedPct: number | null
  incrementAmount: number | null
  proposedSalary: number | null
  salaryEffectiveFrom: string | null
  decision: string | null
  extensionDays: number | null
  improvementAreas: string | null
  status: string
  managerSignedAt: string | null
  hrSignedAt: string | null
}

interface Context {
  probationId: string
  employee: {
    id: string; fullName: string; employeeCode: string
    designation: string | null; department: string | null; joiningDate: string
  }
  manager: string | null
  startDate: string
  endDate: string
  currentSalary: number | null
}

const money = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 })
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export function ProbationReviewForm({ id }: { id: string }) {
  const router = useRouter()
  const [review, setReview] = useState<Review | null>(null)
  const [ctx, setCtx] = useState<Context | null>(null)
  const [due, setDue] = useState(false)
  const [daysRemaining, setDaysRemaining] = useState<number>(0)
  const [windowDays, setWindowDays] = useState(10)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ subject: string; text: string; recipient: string | null } | null>(null)
  const [mailing, setMailing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/probation/${id}/review`)
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) { setError(j.error ?? 'Could not load the review.'); return }
    setReview(j.review)
    setCtx(j.context)
    setDue(j.due)
    setDaysRemaining(j.daysRemaining)
    setWindowDays(j.windowDays)
  }, [id])

  useEffect(() => { load() }, [load])

  function patch(p: Partial<Review>) {
    setReview((r) => (r ? { ...r, ...p } as Review : r))
  }

  async function save(extra: Record<string, unknown> = {}) {
    if (!review) return
    setSaving(true); setError(null)
    const r = await fetch(`/api/probation/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...review, ...extra }),
    })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setError(j.error ?? 'Could not save.'); return }
    setReview(j.review)
    setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    router.refresh()
  }

  async function generateEmail() {
    setMailing(true)
    setError(null)
    // Save first — the letter is written from what is stored, not from what is
    // on screen, so an unsaved rating would be quietly left out of it.
    await save()
    const r = await fetch(`/api/probation/${id}/review/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    const j = await r.json().catch(() => ({}))
    setMailing(false)
    if (!r.ok) { setError(j.error ?? 'Could not build the letter.'); return }
    setDraft({ subject: j.subject, text: j.text, recipient: j.recipient })
  }

  if (loading) return <p className="text-sm text-slate-400 py-10">Loading…</p>
  if (error && !review) return <p className="text-sm text-red-700 py-10">{error}</p>

  if (!due && !review) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Back id={id} />
        <div className="border border-dashed border-slate-200 rounded-xl py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Not due yet</p>
          <p className="text-xs text-slate-500 mt-1">
            The review opens in the last {windowDays} days of probation —
            {' '}{daysRemaining} day{daysRemaining === 1 ? '' : 's'} to go
            {ctx && <> (ends {fmtDate(ctx.endDate)})</>}.
          </p>
        </div>
      </div>
    )
  }
  if (!review || !ctx) return <p className="text-sm text-slate-400 py-10">No review.</p>

  const ratings = [
    review.ratingQuality, review.ratingPunctuality, review.ratingOwnership,
    review.ratingCommunication, review.ratingAdaptability,
  ]
  const avg = averageRating(ratings)
  const suggested = suggestedAssessment(ratings)
  const assessment = review.overallAssessment ?? suggested
  const bracket = assessment ? INCREMENT_BRACKETS[assessment] : null
  const salary = review.currentSalary ?? ctx.currentSalary ?? 0
  const pct = review.recommendedPct ?? 0
  const calc = salary && pct ? incrementFor(salary, pct) : null
  const outsideBracket =
    !!bracket && pct > 0 && (pct < bracket.min || pct > bracket.max)

  return (
    <div className="space-y-4 print:max-w-none">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Back id={id} />
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
              <Check className="w-3 h-3" /> Saved {savedAt}
            </span>
          )}
          <button
            onClick={generateEmail}
            disabled={mailing || saving}
            title="Build the confirmation and salary revision letter from this review"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            {mailing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            Generate email
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-1.5 hover:bg-slate-50"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={() => save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-700 print:hidden">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <header className="border-b border-slate-200 pb-4">
          <h1 className="text-xl font-bold text-slate-900">Employee Probationary Performance Review</h1>
          <p className="text-xs text-slate-500 mt-0.5">Convertt · Human Resources Department</p>
        </header>

        {/* 1 — details, all of them already known */}
        <Section n={1} title="Employee & Review Details">
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2 text-sm">
            <Row label="Employee Name" value={ctx.employee.fullName} />
            <Row label="Job Title / Department"
              value={`${ctx.employee.designation ?? '—'} / ${ctx.employee.department ?? '—'}`} />
            <Row label="Date of Joining" value={fmtDate(ctx.employee.joiningDate)} />
            <Row label="Probation End Date" value={fmtDate(ctx.endDate)} />
            <Row label="Direct Manager / Reviewer" value={ctx.manager ?? '—'} />
            <Row label="Review Date" value={fmtDate(new Date().toISOString())} />
          </dl>
        </Section>

        {/* 2 — the ratings, with the evidence beside each */}
        <Section n={2} title="Performance Evaluation Criteria">
          <p className="text-[11px] text-slate-500 mb-3">
            {RATING_SCALE.map((r) => `${r.value} = ${r.label}`).join('  |  ')}
          </p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {DIMENSIONS.map((d) => {
              const rk = `rating${d.key}` as keyof Review
              const nk = `notes${d.key}` as keyof Review
              return (
                <div key={d.key} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{d.label}</p>
                      <p className="text-[11px] text-slate-500">{d.hint}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {RATING_SCALE.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => patch({ [rk]: s.value } as Partial<Review>)}
                          title={s.label}
                          className={
                            'w-8 h-8 rounded-md text-xs font-semibold border transition-colors ' +
                            (review[rk] === s.value
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                          }
                        >
                          {s.value}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={(review[nk] as string) ?? ''}
                    onChange={(e) => patch({ [nk]: e.target.value } as Partial<Review>)}
                    rows={2}
                    placeholder="What actually happened — a specific example, not an adjective"
                    className="w-full mt-2 text-sm rounded-md border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              )
            })}
          </div>
          {avg !== null && (
            <p className="text-xs text-slate-600 mt-3">
              Average rating <strong className="tabular-nums">{avg}</strong> / 4
              {suggested && <> — points to <strong>{ASSESSMENTS.find((a) => a.value === suggested)?.label}</strong></>}
            </p>
          )}
        </Section>

        {/* 3 — the overall call */}
        <Section n={3} title="Overall Performance Summary & Rating">
          <div className="space-y-2">
            {ASSESSMENTS.map((a) => (
              <label key={a.value} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="assessment"
                  checked={assessment === a.value}
                  onChange={() => patch({ overallAssessment: a.value })}
                  className="mt-1 accent-slate-900"
                />
                <span>
                  <span className="text-sm text-slate-900">{a.label}</span>
                  <span className="block text-[11px] text-slate-500">{a.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {suggested && !review.overallAssessment && (
            <p className="text-[11px] text-slate-500 mt-2">
              Pre-selected from the ratings above. Change it if you disagree — the ratings
              inform this, they do not decide it.
            </p>
          )}
          <textarea
            value={review.managerRemarks ?? ''}
            onChange={(e) => patch({ managerRemarks: e.target.value })}
            rows={3}
            placeholder="Manager remarks"
            className="w-full mt-3 text-sm rounded-md border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </Section>

        {/* 4 — the money, and whether it agrees with the rating */}
        <Section n={4} title="Compensation & Salary Revision">
          <p className="text-[11px] text-slate-500 mb-3">
            Convertt policy: 10–15%, at the end of probation and again after the following six
            months. The bracket below follows the assessment.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <FieldBox label="Current net monthly">
              <input
                type="number"
                value={salary || ''}
                onChange={(e) => patch({ currentSalary: Number(e.target.value) || null })}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm tabular-nums"
              />
            </FieldBox>
            <FieldBox label={`Increase %${bracket ? ` (${bracket.label})` : ''}`}>
              <input
                type="number" step="0.5"
                value={review.recommendedPct ?? ''}
                onChange={(e) => {
                  const v = Number(e.target.value) || null
                  const c = v && salary ? incrementFor(salary, v) : null
                  patch({
                    recommendedPct: v,
                    incrementAmount: c?.amount ?? null,
                    proposedSalary: c?.proposed ?? null,
                  })
                }}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm tabular-nums"
              />
            </FieldBox>
            <FieldBox label="Increment amount">
              <p className="text-sm text-slate-900 tabular-nums py-1.5">
                {calc ? money(calc.amount) : '—'}
              </p>
            </FieldBox>
            <FieldBox label="New monthly salary">
              <p className="text-sm font-semibold text-slate-900 tabular-nums py-1.5">
                {calc ? money(calc.proposed) : '—'}
              </p>
            </FieldBox>
          </div>

          {/* Quick % picker — every step shows the new salary it produces, so
              HR can choose by the resulting figure, not just the band ends. */}
          <div className="mb-2">
            <select
              value={review.recommendedPct ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                const c = v && salary ? incrementFor(salary, v) : null
                patch({
                  recommendedPct: v,
                  incrementAmount: c?.amount ?? null,
                  proposedSalary: c?.proposed ?? null,
                })
              }}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Pick a % — shows the new salary…</option>
              {Array.from({ length: 11 }, (_, i) => 10 + i).map((p) => (
                <option key={p} value={p}>
                  {p}%{salary ? ` → ${money(incrementFor(salary, p).proposed)}` : ''}
                </option>
              ))}
            </select>
          </div>

          {bracket && (
            <div className="flex gap-2 flex-wrap mb-2">
              {bracket.max > 0 && [bracket.min, bracket.max].map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    const c = salary ? incrementFor(salary, p) : null
                    patch({
                      recommendedPct: p,
                      incrementAmount: c?.amount ?? null,
                      proposedSalary: c?.proposed ?? null,
                    })
                  }}
                  className="text-[11px] rounded-full border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50"
                >
                  {p}% → {salary ? money(incrementFor(salary, p).proposed) : '—'}
                </button>
              ))}
            </div>
          )}

          {outsideBracket && bracket && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {pct}% sits outside the {bracket.label} band for this rating. That is allowed, but
              the employee will notice the gap between what they were told and what they were
              given — write the reason in the remarks.
            </p>
          )}

          <FieldBox label="Effective from">
            <input
              type="date"
              value={review.salaryEffectiveFrom?.slice(0, 10) ?? ''}
              onChange={(e) => patch({ salaryEffectiveFrom: e.target.value || null })}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            />
          </FieldBox>
        </Section>

        {/* 5 — the decision */}
        <Section n={5} title="Management Decision & Next Steps">
          <div className="space-y-2">
            {[
              { v: 'CONFIRM', l: 'Confirm employment (probation cleared)', h: 'Apply the salary revision above' },
              { v: 'EXTEND', l: 'Extend the probationary period', h: 'Set the length and the areas to improve' },
              { v: 'TERMINATE', l: 'Terminate employment', h: 'Initiate exit per the contract terms' },
            ].map((o) => (
              <label key={o.v} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio" name="decision"
                  checked={review.decision === o.v}
                  onChange={() => patch({ decision: o.v })}
                  className="mt-1 accent-slate-900"
                />
                <span>
                  <span className="text-sm text-slate-900">{o.l}</span>
                  <span className="block text-[11px] text-slate-500">{o.h}</span>
                </span>
              </label>
            ))}
          </div>

          {review.decision === 'EXTEND' && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                {[30, 60, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => patch({ extensionDays: d })}
                    className={
                      'text-xs rounded-md border px-3 py-1.5 ' +
                      (review.extensionDays === d
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                    }
                  >
                    {d} days
                  </button>
                ))}
              </div>
              <textarea
                value={review.improvementAreas ?? ''}
                onChange={(e) => patch({ improvementAreas: e.target.value })}
                rows={3}
                placeholder="What has to change, and how it will be measured"
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
              />
            </div>
          )}
        </Section>

        {/* 6 — who has signed */}
        <Section n={6} title="Signatures & Approvals">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Sig role="Direct Manager" name={ctx.manager} at={review.managerSignedAt} />
            <Sig role="HR Representative" name={null} at={review.hrSignedAt} />
            <Sig role="Department Head / CEO" name={null} at={null} />
            <Sig role="Employee Acknowledgement" name={ctx.employee.fullName} at={null} />
          </div>

          <div className="flex gap-2 mt-4 print:hidden">
            <button
              onClick={() => save({ status: 'SUBMITTED' })}
              disabled={saving || review.status === 'FINALISED'}
              className="rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              Submit as manager
            </button>
            <button
              onClick={() => save({ status: 'FINALISED' })}
              disabled={saving || !review.decision}
              title={review.decision ? 'Sign off as HR' : 'Record a decision first'}
              className="rounded-md bg-slate-900 text-white text-xs px-3 py-1.5 disabled:opacity-50"
            >
              Finalise as HR
            </button>
          </div>
        </Section>
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-6 overflow-y-auto print:hidden">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Review outcome letter</h3>
              <button onClick={() => setDraft(null)} className="text-slate-400 hover:text-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[11px] text-slate-500 mb-1">To</p>
                <p className="text-sm text-slate-900">
                  {draft.recipient ?? <span className="text-amber-700">No email address on file</span>}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 mb-1">Subject</p>
                <input
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 mb-1">Body</p>
                <textarea
                  value={draft.text}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                  rows={16}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm leading-relaxed"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Edit freely — what is in the box is what goes out. The figures come from the
                review above, so the arithmetic in it can be checked against the form.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => navigator.clipboard?.writeText(draft.text)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-1.5 hover:bg-slate-50"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
                <button
                  onClick={async () => {
                    setMailing(true)
                    const r = await fetch(`/api/probation/${id}/review/email`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ send: true, subject: draft.subject, body: draft.text }),
                    })
                    const j = await r.json().catch(() => ({}))
                    setMailing(false)
                    if (!r.ok) { setError(j.error ?? 'Could not send.'); return }
                    setDraft(null)
                    setError(j.queued
                      ? 'Queued only — no mail server is configured, so nothing was delivered.'
                      : null)
                  }}
                  disabled={mailing || !draft.recipient}
                  className="rounded-md bg-slate-900 text-white text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {mailing ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Back({ id }: { id: string }) {
  return (
    <Link
      href={`/dashboard/probation/${id}`}
      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> Back to probation record
    </Link>
  )
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-1">
        {n}. {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500 w-44 shrink-0">{label}</dt>
      <dd className="text-slate-900 font-medium">{value}</dd>
    </div>
  )
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function Sig({ role, name, at }: { role: string; name: string | null; at: string | null }) {
  return (
    <div className="border border-slate-100 rounded-lg px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{role}</p>
      <p className="text-sm text-slate-900 mt-0.5">{name ?? '—'}</p>
      <p className="text-[11px] text-slate-500">
        {at ? `Signed ${fmtDate(at)}` : 'Not signed'}
      </p>
    </div>
  )
}
