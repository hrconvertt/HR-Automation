'use client'

/**
 * The appraisal form, on screen.
 *
 * Two scoring columns throughout, because the paper form has two: the
 * appraisee rates themselves and the appraiser rates them, and the gap between
 * the two columns is half the point of the conversation. Subtotals and the
 * overall average recompute as you go — on paper they are added up by hand at
 * the end, which is where the arithmetic errors come from.
 *
 * Sections run one under another at full width. Nothing sits beside anything.
 */
import { useState, useMemo, useCallback } from 'react'
import {
  SECTIONS, RATING_INDEX, MAX_RATING, CORE_SECTIONS, MANAGERIAL_SECTION,
  CORE_MAX, MANAGERIAL_MAX, OVERALL_MAX, sectionMax, subTotal, coreTotal,
  overallTotal, overallAverage, bandFor, completeness, BANDS,
  type Ratings, type GoalRow, type DevelopmentRow, type Column,
} from '@/lib/appraisal-form'

interface Person { id: string; fullName: string; designation: string | null }

export interface AppraisalState {
  periodFrom: string; periodTo: string
  qualification: string; experienceCompany: string; experienceTotal: string
  periodInPresentPost: string; designationAtReview: string; departmentAtReview: string
  appraiserId: string; reviewerId: string
  isManagerial: boolean
  ratings: Ratings
  goals: GoalRow[]
  development: DevelopmentRow[]
  completedOn: string; incrementOf: string; incrementWef: string
  promotedTo: string; promotedWef: string
  transferredTo: string; transferredAs: string; transferredWef: string
  trainingNeeds: string
  appraiserSigned: boolean; reviewerSigned: boolean; hrSigned: boolean
  status: string
}

export function AppraisalFormEditor({
  formId, canEdit, isHr, people, employee, initial,
}: {
  formId: string
  canEdit: boolean
  isHr: boolean
  people: Person[]
  employee: { fullName: string; employeeCode: string | null; joiningDate: string; dateOfBirth: string }
  initial: AppraisalState
}) {
  const [s, setS] = useState<AppraisalState>(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)

  const set = useCallback(<K extends keyof AppraisalState>(k: K, v: AppraisalState[K]) => {
    setS((prev) => ({ ...prev, [k]: v }))
    setDirty(true)
    setMsg('')
  }, [])

  const rate = useCallback((key: string, col: Column, value: number) => {
    setS((prev) => {
      const cur = prev.ratings[key] ?? {}
      // Clicking the score already there clears it — the only way back to
      // "not yet scored" without reloading the page.
      const next = cur[col] === value ? null : value
      return { ...prev, ratings: { ...prev.ratings, [key]: { ...cur, [col]: next } } }
    })
    setDirty(true)
    setMsg('')
  }, [])

  const shown = s.isManagerial ? SECTIONS : CORE_SECTIONS
  const done = useMemo(
    () => completeness(s.ratings, 'appraiser', s.isManagerial),
    [s.ratings, s.isManagerial],
  )
  const avg = useMemo(() => overallAverage(s.ratings, 'appraiser'), [s.ratings])

  async function save(extra: Record<string, unknown> = {}) {
    setSaving(true); setMsg('')
    try {
      const res = await fetch(`/api/appraisals/${formId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...s, ...extra }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(d.error ?? 'Could not save.'); return false }
      setDirty(false)
      setMsg('Saved.')
      return true
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {/* ── Who, and for what period ─────────────────────────────────── */}
      <Card title="Employee" sub="As the appraisal will read when it is filed">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
          <Static label="Name" value={employee.fullName} />
          <Field label="Qualification" value={s.qualification}
            onChange={(v) => set('qualification', v)} disabled={!canEdit} />
          <Static label="Code" value={employee.employeeCode ?? '—'} />
          <Field label="Experience (in the company)" value={s.experienceCompany}
            onChange={(v) => set('experienceCompany', v)} disabled={!canEdit} />
          <Field label="Designation" value={s.designationAtReview}
            onChange={(v) => set('designationAtReview', v)} disabled={!canEdit} />
          <Field label="Total experience" value={s.experienceTotal}
            onChange={(v) => set('experienceTotal', v)} disabled={!canEdit} />
          <Field label="Department" value={s.departmentAtReview}
            onChange={(v) => set('departmentAtReview', v)} disabled={!canEdit} />
          <Field label="Period in present post" value={s.periodInPresentPost}
            onChange={(v) => set('periodInPresentPost', v)} disabled={!canEdit} />
          <Static label="Date of joining" value={employee.joiningDate || '—'} />
          <Picker label="Appraiser" value={s.appraiserId} people={people}
            onChange={(v) => set('appraiserId', v)} disabled={!canEdit} />
          <Static label="Date of birth" value={employee.dateOfBirth || '—'} />
          <Picker label="Reviewer" value={s.reviewerId} people={people}
            onChange={(v) => set('reviewerId', v)} disabled={!canEdit} />
          <Field label="Assessment period from" type="date" value={s.periodFrom}
            onChange={(v) => set('periodFrom', v)} disabled={!canEdit} />
          <Field label="to" type="date" value={s.periodTo}
            onChange={(v) => set('periodTo', v)} disabled={!canEdit} />
        </div>
        <label className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100 text-sm text-slate-700">
          <input type="checkbox" checked={s.isManagerial} disabled={!canEdit}
            onChange={(e) => set('isManagerial', e.target.checked)}
            className="rounded border-slate-300" />
          Score Managerial Competencies as well — for anyone who manages people
        </label>
      </Card>

      {/* ── The rating index, once, above the sections that use it ────── */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
          Rating index
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {RATING_INDEX.map((r) => (
            <span key={r.value} className="text-[13px] text-slate-600">
              <strong className="text-slate-900">{r.value}</strong> — {r.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── The scored sections ──────────────────────────────────────── */}
      {shown.map((section) => {
        const mine = subTotal(section, s.ratings, 'appraisee')
        const theirs = subTotal(section, s.ratings, 'appraiser')
        return (
          <Card
            key={section.key}
            title={`${section.n}. ${section.title}`}
            sub={`${section.criteria.length} criteria · out of ${sectionMax(section)}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                      Performance criteria
                    </th>
                    <th className="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold w-[190px]">
                      Appraisee
                    </th>
                    <th className="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold w-[190px]">
                      Appraiser
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {section.criteria.map((c, i) => (
                    <tr key={c.key} className="border-b border-slate-50">
                      <td className="px-4 py-1.5 text-slate-700 align-middle">
                        <span className="text-slate-400 tabular-nums mr-2">{i + 1}</span>
                        {c.label}
                      </td>
                      <td className="px-3 py-1.5">
                        <Scale value={s.ratings[c.key]?.appraisee ?? null} disabled={!canEdit}
                          onPick={(v) => rate(c.key, 'appraisee', v)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Scale value={s.ratings[c.key]?.appraiser ?? null} disabled={!canEdit}
                          onPick={(v) => rate(c.key, 'appraiser', v)} />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/70">
                    <td className="px-4 py-2 text-right text-[13px] font-semibold text-slate-700">
                      Sub Total
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums font-semibold text-slate-900">
                      {mine} <span className="text-slate-400 font-normal">/ {sectionMax(section)}</span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums font-semibold text-slate-900">
                      {theirs} <span className="text-slate-400 font-normal">/ {sectionMax(section)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}

      {/* ── Development needs ────────────────────────────────────────── */}
      <Card title="Areas of improvement & required training"
        sub="What the score above should lead to">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <Th>Criteria</Th><Th>Areas of improvement</Th><Th>Required training</Th>
              </tr>
            </thead>
            <tbody>
              {s.development.map((row, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-4 py-1.5 text-slate-700 w-56 align-top pt-3">{row.criteria}</td>
                  <td className="px-2 py-1.5">
                    <Area value={row.areas} disabled={!canEdit}
                      onChange={(v) => set('development',
                        s.development.map((r, j) => (j === i ? { ...r, areas: v } : r)))} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Area value={row.training} disabled={!canEdit}
                      onChange={(v) => set('development',
                        s.development.map((r, j) => (j === i ? { ...r, training: v } : r)))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Overall assessment, computed ─────────────────────────────── */}
      <Card title="Overall assessment"
        sub={`Total score / ${OVERALL_MAX} × 100 — the form's own formula`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <Th>Criteria</Th>
                <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold w-32">Appraisee</th>
                <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold w-32">Appraiser</th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((sec) => {
                const off = sec.managerialOnly && !s.isManagerial
                return (
                  <tr key={sec.key} className={`border-b border-slate-50 ${off ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-1.5 text-slate-700">
                      {sec.title}
                      {off && <span className="text-[11px] text-slate-400 ml-2">not scored</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                      {off ? '—' : subTotal(sec, s.ratings, 'appraisee')}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-900">
                      {off ? '—' : subTotal(sec, s.ratings, 'appraiser')}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-slate-50/70 border-b border-slate-100">
                <td className="px-4 py-2 text-right text-[13px] font-semibold text-slate-700">Total</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {s.isManagerial ? overallTotal(s.ratings, 'appraisee') : coreTotal(s.ratings, 'appraisee')}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {s.isManagerial ? overallTotal(s.ratings, 'appraiser') : coreTotal(s.ratings, 'appraiser')}
                </td>
              </tr>
              <tr className="bg-slate-900 text-white">
                <td className="px-4 py-2.5 text-right text-[13px] font-semibold">
                  Average (Total score / {OVERALL_MAX} × 100)
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                  {overallAverage(s.ratings, 'appraisee').toFixed(1)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-base">
                  {avg.toFixed(1)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-[13px] text-slate-900 font-semibold">
            {done.done === done.total
              ? `Appraiser rating: ${bandFor(avg)}`
              : `${done.done} of ${done.total} criteria scored`}
          </span>
          {BANDS.map((b) => (
            <span key={b.label} className="text-[11px] text-slate-400">
              {b.min === 90 ? 'Above 90' : b.min === 0 ? 'Below 49' : `${b.min}–${b.min + 9}`} {b.label}
            </span>
          ))}
        </div>
        <p className="px-4 pb-3 text-[11px] text-slate-400">
          Scored out of {OVERALL_MAX} either way — {CORE_MAX} for the three common sections and{' '}
          {MANAGERIAL_MAX} for Managerial Competencies. An individual contributor is not marked on
          a different curve by dropping the denominator.
        </p>
      </Card>

      {/* ── Reviewing officer ────────────────────────────────────────── */}
      <Card title="Performance review" sub="To be filled by the reviewing officer">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <Th>Mutual goals set</Th><Th>Actual performance</Th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold w-40">
                  Performance rating
                </th>
              </tr>
            </thead>
            <tbody>
              {s.goals.map((row, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-2 py-1.5">
                    <Area value={row.goal} disabled={!canEdit}
                      onChange={(v) => set('goals', s.goals.map((r, j) => (j === i ? { ...r, goal: v } : r)))} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Area value={row.actual} disabled={!canEdit}
                      onChange={(v) => set('goals', s.goals.map((r, j) => (j === i ? { ...r, actual: v } : r)))} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Area value={row.rating} disabled={!canEdit}
                      onChange={(v) => set('goals', s.goals.map((r, j) => (j === i ? { ...r, rating: v } : r)))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-slate-100">
          <button type="button" disabled={!canEdit}
            onClick={() => set('goals', [...s.goals, { goal: '', actual: '', rating: '' }])}
            className="text-[13px] text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-40">
            + Add a goal
          </button>
        </div>
      </Card>

      {/* ── Signatures ───────────────────────────────────────────────── */}
      <Card title="Sign-off" sub="Stamped when clicked, so the date is the date it was signed">
        <div className="px-4 py-3 space-y-2">
          <Sign label="Appraiser" who={people.find((p) => p.id === s.appraiserId)?.fullName}
            signed={s.appraiserSigned} disabled={!canEdit}
            onToggle={() => { set('appraiserSigned', !s.appraiserSigned); save({ signAppraiser: !s.appraiserSigned }) }} />
          <Sign label="Reviewer" who={people.find((p) => p.id === s.reviewerId)?.fullName}
            signed={s.reviewerSigned} disabled={!canEdit}
            onToggle={() => { set('reviewerSigned', !s.reviewerSigned); save({ signReviewer: !s.reviewerSigned }) }} />
          <Sign label="Head — HR" who={undefined} signed={s.hrSigned} disabled={!isHr}
            onToggle={() => { set('hrSigned', !s.hrSigned); save({ signHr: !s.hrSigned }) }} />
        </div>
      </Card>

      {/* ── HR box ───────────────────────────────────────────────────── */}
      <Card title="For HR department use only" sub="What the appraisal decides">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
          <Field label="Appraisal completed on" type="date" value={s.completedOn}
            onChange={(v) => set('completedOn', v)} disabled={!isHr} />
          <div />
          <Field label="Eligible for an increment of" value={s.incrementOf}
            onChange={(v) => set('incrementOf', v)} disabled={!isHr} placeholder="e.g. 12%" />
          <Field label="with effect from" type="date" value={s.incrementWef}
            onChange={(v) => set('incrementWef', v)} disabled={!isHr} />
          <Field label="Can be promoted to" value={s.promotedTo}
            onChange={(v) => set('promotedTo', v)} disabled={!isHr} />
          <Field label="with effect from" type="date" value={s.promotedWef}
            onChange={(v) => set('promotedWef', v)} disabled={!isHr} />
          <Field label="Can be transferred to (department)" value={s.transferredTo}
            onChange={(v) => set('transferredTo', v)} disabled={!isHr} />
          <Field label="as (designation)" value={s.transferredAs}
            onChange={(v) => set('transferredAs', v)} disabled={!isHr} />
          <Field label="with effect from" type="date" value={s.transferredWef}
            onChange={(v) => set('transferredWef', v)} disabled={!isHr} />
          <div />
          <div className="md:col-span-2">
            <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Needs training on the following areas
            </label>
            <textarea value={s.trainingNeeds} disabled={!isHr} rows={3}
              onChange={(e) => set('trainingNeeds', e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500" />
          </div>
        </div>
      </Card>

      {/* ── Save bar ─────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
        <button type="button" onClick={() => save()} disabled={!canEdit || saving}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {isHr && (
          <button type="button" disabled={saving}
            onClick={() => save({ status: s.status === 'FINALISED' ? 'REVIEWED' : 'FINALISED' })}
            className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-900">
            {s.status === 'FINALISED' ? 'Reopen' : 'Finalise'}
          </button>
        )}
        <a href={`/appraisal/${formId}/print`} target="_blank" rel="noreferrer"
          className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-900">
          Print / Save as PDF
        </a>
        <span className="text-[13px] text-slate-500">
          {msg || (dirty ? 'Unsaved changes' : `${done.done} of ${done.total} scored`)}
        </span>
        <span className="ml-auto text-[13px] text-slate-500">
          Overall <strong className="text-slate-900 tabular-nums">{avg.toFixed(1)}</strong>
          {bandFor(avg) ? ` · ${bandFor(avg)}` : ''}
        </span>
      </div>
    </div>
  )
}

/* ── small pieces ─────────────────────────────────────────────────── */

function Card({ title, sub, children }: {
  title: string; sub?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
      {children}
    </th>
  )
}

/** The 1–5 index as five buttons. Clicking the current score clears it. */
function Scale({ value, onPick, disabled }: {
  value: number | null; onPick: (v: number) => void; disabled: boolean
}) {
  return (
    <div className="flex gap-1 justify-center">
      {Array.from({ length: MAX_RATING }, (_, i) => i + 1).map((n) => (
        <button
          key={n} type="button" disabled={disabled} onClick={() => onPick(n)}
          title={RATING_INDEX[n - 1].label}
          className={`w-7 h-7 rounded text-[12px] font-semibold border transition-colors ${
            value === n
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
          } disabled:opacity-50 disabled:hover:border-slate-200`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function Static({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="text-sm text-slate-900 mt-0.5">{value}</p>
    </div>
  )
}

function Field({ label, value, onChange, disabled, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  disabled: boolean; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
        {label}
      </label>
      <input type={type} value={value} disabled={disabled} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-500" />
    </div>
  )
}

function Picker({ label, value, people, onChange, disabled }: {
  label: string; value: string; people: Person[]
  onChange: (v: string) => void; disabled: boolean
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
        {label}
      </label>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 bg-white disabled:bg-slate-50 disabled:text-slate-500">
        <option value="">— not set —</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.fullName}{p.designation ? ` · ${p.designation}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

function Area({ value, onChange, disabled }: {
  value: string; onChange: (v: string) => void; disabled: boolean
}) {
  return (
    <textarea value={value} disabled={disabled} rows={2}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-1.5 disabled:bg-slate-50 disabled:text-slate-500" />
  )
}

function Sign({ label, who, signed, onToggle, disabled }: {
  label: string; who?: string; signed: boolean; onToggle: () => void; disabled: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <div>
        <p className="text-sm text-slate-900">{label}</p>
        <p className="text-[11px] text-slate-400">{who ?? 'not named yet'}</p>
      </div>
      <button type="button" disabled={disabled} onClick={onToggle}
        className={`text-[13px] px-3 py-1.5 rounded-lg border ${
          signed
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-700 border-slate-300'
        } disabled:opacity-40`}>
        {signed ? 'Signed — click to undo' : 'Click to sign'}
      </button>
    </div>
  )
}
