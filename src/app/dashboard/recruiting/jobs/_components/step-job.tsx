'use client'

/**
 * Step 1 · The Job. Workable's layout: each block of boxes in its own card,
 * with its Do and Don't beside it, and past job descriptions a click away.
 */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  EDUCATION_LABEL, EDUCATION_LEVELS, EMPLOYMENT_TYPES, LEVELS, SALARY_CURRENCIES, humanise,
  type JdSections,
} from '@/lib/job-post'
import type { ParsedJobPost } from '@/lib/jd-extract'
import type { EditorJob, JobTemplate } from './types'
import { TemplatePicker } from './template-picker'

interface Props {
  job: EditorJob
  onChange: (job: EditorJob) => void
  departments: { id: string; name: string }[]
  canEdit: boolean
  isDraft: boolean
  busy: boolean
  onSave: (then: 'stay' | 'continue') => void
}

const control =
  'w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500'
const area =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50'

function Block({ title, tips, children }: { title: string; tips?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h3 className="px-5 py-3.5 text-base font-semibold text-slate-900 border-b border-slate-100 bg-slate-50/70">
          {title}
        </h3>
        <div className="p-5 space-y-4">{children}</div>
      </section>
      {tips && <aside className="hidden lg:block pt-14 text-sm text-slate-500 space-y-4">{tips}</aside>}
    </div>
  )
}

function Tips({ dos, donts }: { dos: string[]; donts?: string[] }) {
  return (
    <>
      <div>
        <p className="font-semibold text-slate-700">Do</p>
        <ul className="mt-1 space-y-1">{dos.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
      {donts && (
        <div>
          <p className="font-semibold text-slate-700">Don&apos;t</p>
          <ul className="mt-1 space-y-1">{donts.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
    </>
  )
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-800 mb-1.5">
        {required && <span className="text-red-600 mr-0.5">*</span>}
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  )
}

const join = (a: string, b: string, sep: string) => [a.trim(), b.trim()].filter(Boolean).join(sep)

export function StepJob({ job, onChange, departments, canEdit, isDraft, busy, onSave }: Props) {
  const [titles, setTitles] = useState<string[]>([])
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [titleFocus, setTitleFocus] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    let dead = false
    fetch(`/api/recruiting/job-templates${job.id ? `?exclude=${job.id}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead || !d) return
        setTitles(d.titles ?? [])
        setTemplates(d.templates ?? [])
      })
      .catch(() => { /* the boxes work without suggestions */ })
    return () => { dead = true }
  }, [job.id])

  const set = (patch: Partial<EditorJob>) => onChange({ ...job, ...patch })
  const setSection = (k: keyof JdSections, v: string) => onChange({ ...job, sections: { ...job.sections, [k]: v } })

  const q = job.title.trim().toLowerCase()
  const suggestions = titleFocus && q.length >= 2
    ? titles.filter((t) => t.toLowerCase().includes(q) && t.toLowerCase() !== q).slice(0, 8)
    : []

  const written = job.sections.summary.length + job.sections.responsibilities.length + job.sections.requirements.length

  // Upload JD: read a job description file into the boxes below, the way an
  // uploaded CV fills in a candidate. Only boxes the file covers change.
  const jdInput = useRef<HTMLInputElement>(null)
  const [jdBusy, setJdBusy] = useState(false)
  const [jdMessage, setJdMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function uploadJd(file: File) {
    const hasContent = !!(job.title.trim() || job.sections.summary.trim()
      || job.sections.responsibilities.trim() || job.sections.requirements.trim())
    if (hasContent && !confirm(
      'Fill the form from this job description? Boxes the file covers are replaced; the rest stay as they are.',
    )) {
      if (jdInput.current) jdInput.current.value = ''
      return
    }
    setJdBusy(true)
    setJdMessage(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('departments', JSON.stringify(departments.map((d) => d.name)))
      const res = await fetch('/api/recruiting/jobs/parse-jd', { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setJdMessage({ tone: 'error', text: data.error ?? 'That file could not be read.' })
        return
      }
      const p = data.job as ParsedJobPost
      const next: EditorJob = { ...job, sections: { ...job.sections } }
      const filled: string[] = []

      if (p.title) { next.title = p.title; filled.push('job title') }
      const dept = p.department
        ? departments.find((d) => d.name.toLowerCase() === p.department!.toLowerCase())
        : undefined
      if (dept) { next.departmentId = dept.id; filled.push('department') }
      if (p.isRemote === true) { next.isRemote = true; filled.push('fully remote') }
      else if (p.location) { next.isRemote = false; next.location = p.location; filled.push('location') }
      if (p.summary) { next.sections.summary = p.summary; filled.push('description') }
      if (p.responsibilities.length) { next.sections.responsibilities = p.responsibilities.join('\n'); filled.push('responsibilities') }
      if (p.requirements.length) { next.sections.requirements = p.requirements.join('\n'); filled.push('requirements') }
      if (p.niceToHave.length) { next.sections.niceToHave = p.niceToHave.join('\n'); filled.push('nice to have') }
      if (p.benefits.length) { next.sections.benefits = p.benefits.join('\n'); filled.push('benefits') }
      if (p.type) { next.type = p.type; filled.push('employment type') }
      if (p.positionLevel) { next.positionLevel = p.positionLevel; filled.push('level') }
      if (p.vacancies) { next.vacancies = Math.min(100, p.vacancies); filled.push('openings') }
      if (p.minExperienceYears !== null) { next.minExperienceYears = String(p.minExperienceYears); filled.push('minimum experience') }
      if (p.educationLevel) { next.educationLevel = p.educationLevel; filled.push('education') }
      if (p.salaryMin !== null || p.salaryMax !== null) {
        if (p.salaryMin !== null) next.salaryMin = String(p.salaryMin)
        if (p.salaryMax !== null) next.salaryMax = String(p.salaryMax)
        if (p.salaryCurrency) next.salaryCurrency = p.salaryCurrency
        filled.push('salary')
      }
      if (p.closingDate) { next.closingDate = p.closingDate; filled.push('closing date') }

      if (filled.length === 0) {
        setJdMessage({ tone: 'error', text: `Nothing in ${data.filename ?? 'that file'} looked like a job description.` })
        return
      }
      onChange(next)
      setJdMessage({
        tone: 'ok',
        text: `Filled from ${data.filename ?? 'the file'}: ${filled.join(', ')}. Check each box before you save.`,
      })
    } catch {
      setJdMessage({ tone: 'error', text: 'That file could not be uploaded. Check your connection and try again.' })
    } finally {
      setJdBusy(false)
      if (jdInput.current) jdInput.current.value = ''
    }
  }

  function importSections(picked: JdSections) {
    onChange({
      ...job,
      sections: {
        summary: join(job.sections.summary, picked.summary.split('\n').join('\n\n'), '\n\n'),
        responsibilities: join(job.sections.responsibilities, picked.responsibilities.join('\n'), '\n'),
        requirements: join(job.sections.requirements, picked.requirements.join('\n'), '\n'),
        niceToHave: join(job.sections.niceToHave, picked.niceToHave.join('\n'), '\n'),
        benefits: join(job.sections.benefits, picked.benefits.join('\n'), '\n'),
      },
    })
  }

  return (
    <fieldset disabled={!canEdit} className="space-y-6 min-w-0">
      <section className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 lg:mr-[296px]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Already have a job description?</p>
          <p className="text-sm text-slate-500">
            Upload it as a PDF, Word (.docx) or text file and the boxes below are filled in for you to check.
          </p>
          {jdMessage && (
            <p className={`mt-1 text-sm ${jdMessage.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
              {jdMessage.text}
            </p>
          )}
        </div>
        <input
          ref={jdInput}
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void uploadJd(f)
          }}
        />
        <Button type="button" variant="outline" disabled={jdBusy} onClick={() => jdInput.current?.click()}>
          {jdBusy ? 'Reading the job description…' : 'Upload JD file'}
        </Button>
      </section>

      <Block
        title="Job title and department"
        tips={<Tips
          dos={['Use the title people search for, e.g. “Shopify Developer”', 'Advertise one job at a time: “Designer”, not “Designers”']}
          donts={['Put the salary or location in the title', 'Add words like “urgent” or “hiring now”']}
        />}
      >
        <div className="relative">
          <Field label="Job title" required>
            <Input
              value={job.title}
              onChange={(e) => set({ title: e.target.value })}
              onFocus={() => setTitleFocus(true)}
              onBlur={() => setTitleFocus(false)}
              placeholder="e.g. Account Manager"
              className="h-10"
              autoComplete="off"
            />
          </Field>
          {suggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
              <p className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Roles at Convertt
              </p>
              {suggestions.map((t) => (
                <button
                  key={t}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); set({ title: t }); setTitleFocus(false) }}
                  className="block w-full text-left px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department" required>
            <select value={job.departmentId} onChange={(e) => set({ departmentId: e.target.value })} className={control}>
              <option value="">Select…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Internal code" hint="Optional — your own reference for the role.">
            <Input value={job.internalCode} onChange={(e) => set({ internalCode: e.target.value })} className="h-10" />
          </Field>
        </div>
      </Block>

      <Block
        title="Location"
        tips={<p>An accurate location brings the right applicants. Tick Fully remote only if the whole job can be done from home.</p>}
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] items-end">
          <Field label="City or office">
            <Input
              value={job.isRemote ? '' : job.location}
              onChange={(e) => set({ location: e.target.value })}
              disabled={job.isRemote}
              placeholder={job.isRemote ? 'Remote' : 'Lahore'}
              className="h-10"
            />
          </Field>
          <label className="inline-flex items-center gap-2 h-10 px-3 rounded-md border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer">
            <input type="checkbox" checked={job.isRemote} onChange={(e) => set({ isRemote: e.target.checked })} />
            Fully remote
          </label>
        </div>
      </Block>

      <Block
        title="Description"
        tips={
          <>
            <Tips
              dos={['Write at least 700 characters across the description, responsibilities and requirements', 'Put one responsibility or requirement on each line', 'Keep the language inclusive: “they”, not “he or she”']}
              donts={['Add a link to apply — one is added automatically', 'Describe more than one job, even with more than one opening']}
            />
            <div>
              <p className="font-semibold text-slate-700">Need inspiration?</p>
              <button type="button" onClick={() => setPickerOpen(true)}
                className="mt-1 text-left text-slate-800 underline underline-offset-2 hover:text-slate-900">
                Import sections from past Convertt job posts
              </button>
            </div>
          </>
        }
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className={`text-xs ${written >= 700 ? 'text-emerald-700' : 'text-slate-400'}`}>
            {written.toLocaleString()} of 700 characters
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            Import sections from past job posts
          </Button>
        </div>
        <Field label="Description" required hint="What this person is here to do and what a typical day looks like.">
          <textarea rows={5} value={job.sections.summary} onChange={(e) => setSection('summary', e.target.value)} className={area} />
        </Field>
        <Field label="Responsibilities" required hint="One per line.">
          <textarea rows={6} value={job.sections.responsibilities} onChange={(e) => setSection('responsibilities', e.target.value)} className={area} />
        </Field>
        <Field label="Requirements" required hint="One per line — from the skills to the qualifications the job needs.">
          <textarea rows={6} value={job.sections.requirements} onChange={(e) => setSection('requirements', e.target.value)} className={area} />
        </Field>
        <Field label="Nice to have" hint="One per line.">
          <textarea rows={3} value={job.sections.niceToHave} onChange={(e) => setSection('niceToHave', e.target.value)} className={area} />
        </Field>
        <Field label="Benefits" hint="One per line — not only the salary, but what makes Convertt worth joining.">
          <textarea rows={4} value={job.sections.benefits} onChange={(e) => setSection('benefits', e.target.value)} className={area} />
        </Field>
      </Block>

      <Block
        title="Employment details"
        tips={<p>The more of these are filled in, the more complete the job description reads. Experience and education are added to the requirements for you.</p>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employment type">
            <select value={job.type} onChange={(e) => set({ type: e.target.value })} className={control}>
              {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{humanise(t)}</option>)}
            </select>
          </Field>
          <Field label="Level">
            <select value={job.positionLevel} onChange={(e) => set({ positionLevel: e.target.value })} className={control}>
              {LEVELS.map((l) => <option key={l} value={l}>{humanise(l)}</option>)}
            </select>
          </Field>
          <Field label="Openings">
            <Input type="number" min={1} max={100} value={job.vacancies}
              onChange={(e) => set({ vacancies: Math.max(1, Number(e.target.value) || 1) })} className="h-10" />
          </Field>
          <Field label="Minimum experience" hint="Years. 0.5 is six months.">
            <Input type="number" min={0} max={50} step={0.5} value={job.minExperienceYears}
              onChange={(e) => set({ minExperienceYears: e.target.value })} className="h-10" />
          </Field>
          <Field label="Education">
            <select value={job.educationLevel} onChange={(e) => set({ educationLevel: e.target.value })} className={control}>
              <option value="">Not stated</option>
              {EDUCATION_LEVELS.map((l) => <option key={l} value={l}>{EDUCATION_LABEL[l]}</option>)}
            </select>
          </Field>
          <Field label="Applications close" hint="Optional.">
            <Input type="date" value={job.closingDate} onChange={(e) => set({ closingDate: e.target.value })} className="h-10" />
          </Field>
        </div>
      </Block>

      <Block
        title="Monthly salary"
        tips={<p>Before tax. A range brings in more applicants than “market competitive”, and it shows on the careers page.</p>}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From">
            <Input type="number" min={0} step={1000} value={job.salaryMin} onChange={(e) => set({ salaryMin: e.target.value })} className="h-10" />
          </Field>
          <Field label="To">
            <Input type="number" min={0} step={1000} value={job.salaryMax} onChange={(e) => set({ salaryMax: e.target.value })} className="h-10" />
          </Field>
          <Field label="Currency">
            <select value={job.salaryCurrency} onChange={(e) => set({ salaryCurrency: e.target.value })} className={control}>
              {SALARY_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </Block>

      {canEdit && (
        <div className="flex items-center gap-2">
          {isDraft ? (
            <>
              <Button type="button" onClick={() => onSave('continue')} disabled={busy}>Save &amp; continue</Button>
              <Button type="button" variant="outline" onClick={() => onSave('stay')} disabled={busy}>Save draft</Button>
            </>
          ) : (
            <Button type="button" onClick={() => onSave('stay')} disabled={busy}>Save changes</Button>
          )}
        </div>
      )}

      <TemplatePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        templates={templates}
        jobTitle={job.title}
        onImport={importSections}
      />
    </fieldset>
  )
}
