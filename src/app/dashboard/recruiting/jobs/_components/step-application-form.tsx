'use client'

/**
 * Step 2 · Application Form. Every field set to Mandatory, Optional or Off,
 * the job's own questions below, and the form as a phone shows it beside them.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApplyForm } from '@/components/careers/apply-form'
import { safeFetch } from '@/lib/safe-fetch'
import {
  APPLICATION_FIELDS, FIELD_MODES, QUESTION_TYPES, newQuestionId,
  type ApplicationFieldKey, type ApplicationFormConfig, type ApplicationQuestion, type FieldMode,
} from '@/lib/job-post'

interface Props {
  jobId: string
  jobTitle: string
  initial: ApplicationFormConfig
  knockoutFields: ApplicationFieldKey[]
  requirements: string[]
  isHR: boolean
  canEdit: boolean
}

const MODE_LABEL: Record<FieldMode, string> = { MANDATORY: 'Mandatory', OPTIONAL: 'Optional', OFF: 'Off' }
const GROUPS = ['Personal information', 'Profile', 'Details'] as const

function ModeRow({ label, value, allowed, note, disabled, onChange }: {
  label: string
  value: FieldMode
  allowed: FieldMode[]
  note?: string
  disabled?: boolean
  onChange?: (m: FieldMode) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-slate-800">{label}</p>
        {note && <p className="text-[11px] text-amber-700 mt-0.5">{note}</p>}
      </div>
      <div className="inline-flex shrink-0 rounded-full bg-slate-100 p-0.5" role="radiogroup" aria-label={label}>
        {FIELD_MODES.map((m) => {
          const on = value === m
          const can = !disabled && allowed.includes(m)
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!can && !on}
              onClick={() => can && onChange?.(m)}
              className={`px-2.5 py-1 text-xs rounded-full transition ${
                on ? 'bg-slate-900 text-white' : can ? 'text-slate-600 hover:text-slate-900' : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function StepApplicationForm({ jobId, jobTitle, initial, knockoutFields, requirements, isHR, canEdit }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<ApplicationFormConfig>(initial)
  const [keep, setKeep] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const setMode = (k: ApplicationFieldKey, m: FieldMode) =>
    setForm((f) => ({ ...f, fields: { ...f.fields, [k]: m } }))
  const setQuestion = (id: string, patch: Partial<ApplicationQuestion>) =>
    setForm((f) => ({ ...f, questions: f.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }))
  const addQuestion = () =>
    setForm((f) => ({ ...f, questions: [...f.questions, { id: newQuestionId(), text: '', type: 'TEXT', required: false }] }))
  const removeQuestion = (id: string) =>
    setForm((f) => ({ ...f, questions: f.questions.filter((q) => q.id !== id) }))

  function requirementsAsQuestions() {
    setForm((f) => {
      const have = new Set(f.questions.map((q) => q.text.toLowerCase()))
      const added = requirements
        .map((r) => `Do you have this: ${r.replace(/[.?!]+$/, '')}?`)
        .filter((t) => !have.has(t.toLowerCase()))
        .slice(0, Math.max(0, 20 - f.questions.length))
        .map((text): ApplicationQuestion => ({ id: newQuestionId(), text, type: 'YES_NO', required: true }))
      return { ...f, questions: [...f.questions, ...added] }
    })
  }

  async function save() {
    setMsg(null)
    if (form.questions.some((q) => !q.text.trim())) {
      setMsg({ ok: false, text: 'Every question needs its wording, or remove it.' })
      return
    }
    setBusy(true)
    const r = await safeFetch(`/api/recruiting/requisitions/${jobId}/post`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationForm: form, saveFormAsDefault: keep }),
    })
    setBusy(false)
    if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Could not save the form.' }); return }
    setMsg({ ok: true, text: keep ? 'Saved, and kept for your future jobs.' : 'Saved.' })
    router.refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <div className="space-y-4 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customise your application form</p>

        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {GROUPS.map((g) => (
            <div key={g}>
              <h3 className="px-4 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50/70 border-y border-slate-100 first:border-t-0">{g}</h3>
              <div className="divide-y divide-slate-100">
                {g === 'Personal information' && (
                  <>
                    <ModeRow label="Name" value="MANDATORY" allowed={['MANDATORY']} disabled />
                    <ModeRow label="Email" value="MANDATORY" allowed={['MANDATORY']} disabled />
                  </>
                )}
                {APPLICATION_FIELDS.filter((f) => f.group === g).map((f) => {
                  const locked = knockoutFields.includes(f.key)
                  const allowed = (f.modes ?? FIELD_MODES).filter((m) => !(locked && m === 'OFF'))
                  return (
                    <ModeRow
                      key={f.key}
                      label={f.label}
                      value={form.fields[f.key]}
                      allowed={allowed}
                      disabled={!canEdit}
                      note={locked ? 'A knockout filter on this job reads this, so it cannot be off.' : undefined}
                      onChange={(m) => setMode(f.key, m)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <h3 className="px-4 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50/70 border-b border-slate-100">Questions</h3>
          {form.questions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No questions added.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {form.questions.map((q) => (
                <div key={q.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <Input
                    value={q.text}
                    onChange={(e) => setQuestion(q.id, { text: e.target.value })}
                    placeholder="e.g. Can you work from our Lahore office?"
                    aria-label="Question"
                    disabled={!canEdit}
                    className="flex-1 min-w-[220px] h-9"
                  />
                  <select
                    value={q.type}
                    onChange={(e) => setQuestion(q.id, { type: e.target.value as ApplicationQuestion['type'] })}
                    aria-label="Answer type"
                    disabled={!canEdit}
                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                  >
                    {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={q.required} disabled={!canEdit}
                      onChange={(e) => setQuestion(q.id, { required: e.target.checked })} />
                    Required
                  </label>
                  {canEdit && (
                    <button type="button" onClick={() => removeQuestion(q.id)}
                      className="text-xs text-slate-500 hover:text-red-700">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-t border-slate-100 text-sm">
              <button type="button" onClick={addQuestion} disabled={form.questions.length >= 20}
                className="font-medium text-slate-800 underline underline-offset-2 hover:text-slate-900 disabled:text-slate-300">
                Add a question
              </button>
              <button
                type="button"
                onClick={requirementsAsQuestions}
                disabled={requirements.length === 0 || form.questions.length >= 20}
                title={requirements.length === 0 ? 'Write the requirements on The Job first' : undefined}
                className="text-slate-600 underline underline-offset-2 hover:text-slate-900 disabled:text-slate-300 disabled:no-underline"
              >
                Use requirements as questions
              </button>
            </div>
          )}
        </section>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={busy || (!dirty && !keep)}>{busy ? 'Saving…' : 'Save form'}</Button>
            {isHR && (
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                Keep this setup for my future jobs <span className="text-slate-400">(not including questions)</span>
              </label>
            )}
            {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-4">
        <div className="mx-auto w-[340px] max-w-full rounded-[2.25rem] border-[10px] border-slate-900 bg-slate-50 shadow-xl overflow-hidden">
          <div className="h-[640px] overflow-y-auto p-3">
            <p className="text-center text-sm font-semibold text-slate-900 pt-2">{jobTitle || 'Untitled role'}</p>
            <p className="text-center text-[10px] uppercase tracking-wider text-slate-400 mb-3">Application</p>
            <ApplyForm requisitionId={jobId} jobTitle={jobTitle} config={form} preview />
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">What applicants see on a phone</p>
      </aside>
    </div>
  )
}
