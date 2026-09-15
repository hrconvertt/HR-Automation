'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import {
  APPLICATION_FIELDS, DEFAULT_APPLICATION_FIELDS,
  type ApplicationFieldKey, type ApplicationFormConfig,
} from '@/lib/job-post'

interface Props {
  requisitionId: string
  jobTitle: string
  /** The job's own form. Omitted, every field shows and none is required. */
  config?: ApplicationFormConfig
  /** Where the applicant came from — carried on share links (?source=LINKEDIN). */
  source?: string
  /**
   * The job post editor's phone preview: one column, and nothing submits.
   */
  preview?: boolean
}

const NOTICE_PERIODS = ['Immediately', '2 weeks', '1 month', '2 months', '3 months']

const inputClass = 'w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-100'

/**
 * Inline application form on the public /careers/[id] page.
 * Submits to POST /api/careers/[id]/apply which creates a Candidate
 * in APPLIED stage. Idempotent on (email × requisition).
 *
 * It asks what the job's application form switches on, in the order the
 * editor lists them. Years of experience is asked once — the form used to ask
 * it twice, once for scoring and once for the knockout filters.
 */
export function ApplyForm({ requisitionId, jobTitle, config, source, preview = false }: Props) {
  const fields = config?.fields ?? DEFAULT_APPLICATION_FIELDS
  const questions = config?.questions ?? []
  const [form, setForm] = useState<Record<string, string | boolean>>({
    fullName: '', email: '', openToRemote: false,
  })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState('')

  const shown = (k: ApplicationFieldKey) => fields[k] !== 'OFF'
  const star = (k: ApplicationFieldKey) => (fields[k] === 'MANDATORY' ? ' *' : '')
  const val = (k: string) => String(form[k] ?? '')
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))
  const grid = `grid grid-cols-1 ${preview ? '' : 'sm:grid-cols-2'} gap-4`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (preview) return
    setError('')
    if (!val('fullName').trim()) { setError('Please enter your full name'); return }
    if (!val('email').trim()) { setError('A valid email is required'); return }
    for (const f of APPLICATION_FIELDS) {
      if (fields[f.key] === 'MANDATORY' && !val(f.key).trim()) {
        setError(`Please fill in ${f.label.toLowerCase()}.`); return
      }
    }
    for (const q of questions) {
      if (q.required && !(answers[q.id] ?? '').trim()) { setError(`Please answer: ${q.text}`); return }
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/careers/${requisitionId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          source,
          experience: val('experience') ? Number(val('experience')) : null,
          expectedSalary: val('expectedSalary') ? Number(val('expectedSalary')) : null,
          skills: val('skills') ? val('skills').split(',').map((s) => s.trim()).filter(Boolean) : null,
          languages: val('languages') ? val('languages').split(',').map((s) => s.trim()).filter(Boolean) : null,
          answers,
        }),
      })
      const data = await res.json().catch(() => ({}))
      setSubmitting(false)
      if (!res.ok) { setError(data.error || `Something went wrong (HTTP ${res.status})`); return }
      setSuccess(data.message || 'Thanks for applying.')
    } catch (e) {
      setSubmitting(false)
      setError(e instanceof Error ? e.message : 'Network error')
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-slate-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-900">Application received</p>
            <p className="text-sm text-slate-900 mt-1">{success}</p>
            <p className="text-xs text-slate-700 mt-3">
              Role: <span className="font-medium">{jobTitle}</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-sm font-medium text-slate-700 mb-1">{children}</label>
  )

  return (
    <form
      onSubmit={submit}
      className={`bg-white border border-slate-200 rounded-xl space-y-4 ${preview ? 'p-4' : 'p-5 sm:p-6'}`}
    >
      <div className={grid}>
        <div>
          <Label>Full Name *</Label>
          <Input value={val('fullName')} onChange={(e) => set('fullName', e.target.value)} placeholder="Ahmed Khan" />
        </div>
        <div>
          <Label>Email *</Label>
          <Input type="email" value={val('email')} onChange={(e) => set('email', e.target.value)} placeholder="ahmed@example.com" />
        </div>
        {shown('phone') && (
          <div>
            <Label>Phone{star('phone')}</Label>
            <Input value={val('phone')} onChange={(e) => set('phone', e.target.value)} placeholder="+92 300 1234567" />
          </div>
        )}
        {shown('location') && (
          <div>
            <Label>City{star('location')}</Label>
            <Input value={val('location')} onChange={(e) => set('location', e.target.value)} placeholder="Lahore" />
          </div>
        )}
        {shown('currentCompany') && (
          <div>
            <Label>Current Company{star('currentCompany')}</Label>
            <Input value={val('currentCompany')} onChange={(e) => set('currentCompany', e.target.value)} />
          </div>
        )}
        {shown('currentRole') && (
          <div>
            <Label>Current Role{star('currentRole')}</Label>
            <Input value={val('currentRole')} onChange={(e) => set('currentRole', e.target.value)} />
          </div>
        )}
        {shown('experience') && (
          <div>
            <Label>Years of Experience{star('experience')}</Label>
            <Input type="number" min={0} step={0.5} value={val('experience')} onChange={(e) => set('experience', e.target.value)} placeholder="2.5" />
          </div>
        )}
        {shown('educationLevel') && (
          <div>
            <Label>Education{star('educationLevel')}</Label>
            <select value={val('educationLevel')} onChange={(e) => set('educationLevel', e.target.value)} className={inputClass}>
              <option value="">Select…</option>
              <option value="HIGH_SCHOOL">High School</option>
              <option value="DIPLOMA">Diploma</option>
              <option value="BACHELORS">Bachelor&apos;s</option>
              <option value="MASTERS">Master&apos;s</option>
              <option value="PHD">PhD</option>
            </select>
          </div>
        )}
        {shown('workAuthorization') && (
          <div>
            <Label>Right to Work{star('workAuthorization')}</Label>
            <select value={val('workAuthorization')} onChange={(e) => set('workAuthorization', e.target.value)} className={inputClass}>
              <option value="">Select…</option>
              <option value="PK">Pakistan</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        )}
        {shown('expectedSalary') && (
          <div>
            <Label>Expected Salary{star('expectedSalary')} <span className="text-slate-400 font-normal">(PKR a month)</span></Label>
            <Input type="number" min={0} step={1000} value={val('expectedSalary')} onChange={(e) => set('expectedSalary', e.target.value)} placeholder="150000" />
          </div>
        )}
        {shown('noticePeriod') && (
          <div>
            <Label>Notice Period{star('noticePeriod')}</Label>
            <select value={val('noticePeriod')} onChange={(e) => set('noticePeriod', e.target.value)} className={inputClass}>
              <option value="">Select…</option>
              {NOTICE_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
      </div>

      {shown('cvUrl') && (
        <div>
          <Label>
            CV / Portfolio Link{star('cvUrl')} <span className="text-slate-400 font-normal">(LinkedIn, Drive, Behance, GitHub…)</span>
          </Label>
          <Input type="url" value={val('cvUrl')} onChange={(e) => set('cvUrl', e.target.value)} placeholder="https://…" />
        </div>
      )}
      {shown('skills') && (
        <div>
          <Label>Key Skills{star('skills')} <span className="text-slate-400 font-normal">(comma-separated)</span></Label>
          <Input value={val('skills')} onChange={(e) => set('skills', e.target.value)} placeholder="Shopify Liquid, React, Figma" />
        </div>
      )}
      {shown('languages') && (
        <div>
          <Label>Languages{star('languages')} <span className="text-slate-400 font-normal">(comma-separated)</span></Label>
          <Input value={val('languages')} onChange={(e) => set('languages', e.target.value)} placeholder="English, Urdu" />
        </div>
      )}
      {shown('openToRemote') && (
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.openToRemote === true}
            onChange={(e) => set('openToRemote', e.target.checked)}
            className="rounded border-slate-300"
          />
          Open to remote work
        </label>
      )}
      {shown('notes') && (
        <div>
          <Label>
            Why this role?{star('notes')} <span className="text-slate-400 font-normal">(3 lines — quality matters)</span>
          </Label>
          <textarea
            value={val('notes')}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            maxLength={1000}
            className={inputClass}
            placeholder="Tell us why you'd be a strong fit. We read every line — generic copy-paste won't make it past the first filter."
          />
        </div>
      )}

      {questions.map((q) => (
        <div key={q.id}>
          <Label>{q.text}{q.required ? ' *' : ''}</Label>
          {q.type === 'YES_NO' ? (
            <div className="flex gap-4 text-sm text-slate-700">
              {['Yes', 'No'].map((opt) => (
                <label key={opt} className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                  />
                  {opt}
                </label>
              ))}
            </div>
          ) : (
            <Input
              type={q.type === 'NUMBER' ? 'number' : 'text'}
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            />
          )}
        </div>
      ))}

      {error && (
        <div className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className={`flex gap-3 pt-2 ${preview ? 'flex-col' : 'items-center justify-between'}`}>
        <p className="text-[11px] text-slate-500">
          We use your email only to communicate about this application.
        </p>
        <Button type="submit" disabled={submitting || preview} className="min-w-[140px]">
          {submitting ? 'Submitting…' : 'Submit application'}
        </Button>
      </div>
    </form>
  )
}
