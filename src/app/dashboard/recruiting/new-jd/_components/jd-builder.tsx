'use client'

/**
 * JD Builder — field-by-field job description entry.
 *
 * Every field the job description needs is captured in its own box, grouped
 * into the sections a hiring manager thinks in. The preview on the right
 * assembles the finished JD live from those fields, so the person filling the
 * form can see exactly what will be published before anything is created.
 *
 * "Create Requisition" stays disabled until every required box is filled —
 * that gating is the point: no half-specified requisition reaches the board.
 */

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeFetch } from '@/lib/safe-fetch'
import { Plus, X, Check, AlertCircle } from 'lucide-react'

interface Dept { id: string; name: string }

const LEVELS = ['INTERN', 'JUNIOR', 'ASSOCIATE', 'MID_LEVEL', 'SENIOR', 'LEAD', 'MANAGER', 'HEAD', 'DIRECTOR']
const TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TRAINEE']
const EDUCATION = ['NONE', 'HIGH_SCHOOL', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PHD']

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** One labelled box. Marks itself when required and empty. */
function Field({
  title, hint, required, filled, children,
}: {
  title: string; hint?: string; required?: boolean; filled?: boolean; children: React.ReactNode
}) {
  const missing = required && !filled
  return (
    <div className={`rounded-xl border bg-white p-3.5 ${missing ? 'border-slate-300' : 'border-slate-200'}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          {title}{required && <span className="text-slate-400 font-normal normal-case"> · required</span>}
        </label>
        {filled && <Check className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
      </div>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1.5">{hint}</p>}
    </div>
  )
}

/** Free-form list of short strings — skills, responsibilities, questions. */
function ListBox({ items, onChange, placeholder }: {
  items: string[]; onChange: (v: string[]) => void; placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    onChange([...items, v])
    setDraft('')
  }
  return (
    <div>
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button type="button" onClick={add} variant="outline" size="sm" className="h-8 px-2 shrink-0">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-2">
          {items.map((it, i) => (
            <li key={`${it}-${i}`} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[11px] rounded-full pl-2 pr-1 py-0.5">
              {it}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label={`Remove ${it}`}
                className="hover:text-slate-900"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function JDBuilder({ departments }: { departments: Dept[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Basics
  const [title, setTitle] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [positionLevel, setPositionLevel] = useState('MID_LEVEL')
  const [type, setType] = useState('FULL_TIME')
  const [vacancies, setVacancies] = useState(1)
  const [location, setLocation] = useState('')
  const [closingDate, setClosingDate] = useState('')

  // The role
  const [summary, setSummary] = useState('')
  const [responsibilities, setResponsibilities] = useState<string[]>([])
  const [goals, setGoals] = useState<string[]>([])

  // Requirements
  const [mustHave, setMustHave] = useState<string[]>([])
  const [niceToHave, setNiceToHave] = useState<string[]>([])
  const [minYears, setMinYears] = useState('')
  const [education, setEducation] = useState('BACHELORS')

  // Compensation
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [currency, setCurrency] = useState('PKR')
  const [benefits, setBenefits] = useState<string[]>([])

  const deptName = departments.find((d) => d.id === departmentId)?.name ?? ''

  const required = {
    title: title.trim().length > 1,
    departmentId: !!departmentId,
    summary: summary.trim().length > 20,
    responsibilities: responsibilities.length > 0,
    mustHave: mustHave.length > 0,
  }
  const missingCount = Object.values(required).filter((v) => !v).length
  const canSubmit = missingCount === 0 && !busy

  /** The finished JD, assembled from the boxes. */
  const jdContent = useMemo(() => {
    const L: string[] = []
    L.push(`# ${title || 'Untitled role'}`)
    const meta = [deptName, label(positionLevel), label(type), location].filter(Boolean)
    if (meta.length) L.push(`**${meta.join(' · ')}**`)
    if (vacancies > 1) L.push(`**Openings:** ${vacancies}`)
    L.push('')
    if (summary.trim()) { L.push('## About the Role', summary.trim(), '') }
    if (responsibilities.length) {
      L.push('## What You Will Do')
      responsibilities.forEach((r) => L.push(`- ${r}`))
      L.push('')
    }
    if (goals.length) {
      L.push('## First-Year Goals')
      goals.forEach((g, i) => L.push(`${i + 1}. ${g}`))
      L.push('')
    }
    if (mustHave.length) {
      L.push('## Requirements')
      mustHave.forEach((s) => L.push(`- ${s}`))
      if (minYears) L.push(`- ${minYears}+ years of relevant experience`)
      if (education !== 'NONE') L.push(`- ${label(education)} degree or equivalent`)
      L.push('')
    }
    if (niceToHave.length) {
      L.push('## Nice to Have')
      niceToHave.forEach((s) => L.push(`- ${s}`))
      L.push('')
    }
    if (salaryMin || salaryMax) {
      const range = salaryMin && salaryMax
        ? `${currency} ${Number(salaryMin).toLocaleString()} – ${Number(salaryMax).toLocaleString()}`
        : `${currency} ${Number(salaryMin || salaryMax).toLocaleString()}`
      L.push(`**Compensation:** ${range} per month`, '')
    }
    if (benefits.length) {
      L.push('## Benefits')
      benefits.forEach((b) => L.push(`- ${b}`))
      L.push('')
    }
    if (closingDate) L.push(`**Applications close:** ${closingDate}`)
    return L.join('\n').trim()
  }, [title, deptName, positionLevel, type, location, vacancies, summary, responsibilities,
      goals, mustHave, niceToHave, minYears, education, salaryMin, salaryMax, currency, benefits, closingDate])

  async function submit() {
    setBusy(true); setError(null)
    const r = await safeFetch<{ requisition?: { id: string } }>('/api/recruiting/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        departmentId,
        positionLevel,
        type,
        vacancies,
        closingDate: closingDate || null,
        description: summary.trim(),
        requirements: [...mustHave, ...(minYears ? [`${minYears}+ years experience`] : [])].join('\n'),
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        jdContent,
      }),
    })
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'Could not create the requisition'); return }
    router.push('/dashboard/recruiting?tab=requisitions')
    router.refresh()
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      <div className="space-y-5">
        {/* ── Basics ── */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-slate-900">1 · The basics</h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field title="Job title" required filled={required.title}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Backend Engineer" className="h-9" />
            </Field>
            <Field title="Department" required filled={required.departmentId}>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
              >
                <option value="">Select a department…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field title="Level" filled={!!positionLevel}>
              <select value={positionLevel} onChange={(e) => setPositionLevel(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">
                {LEVELS.map((l) => <option key={l} value={l}>{label(l)}</option>)}
              </select>
            </Field>
            <Field title="Employment type" filled={!!type}>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">
                {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </Field>
            <Field title="Openings" filled={vacancies > 0}>
              <Input type="number" min={1} value={vacancies}
                onChange={(e) => setVacancies(Math.max(1, Number(e.target.value) || 1))} className="h-9" />
            </Field>
            <Field title="Location" hint="Office, city, or Remote">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lahore · Onsite" className="h-9" />
            </Field>
            <Field title="Applications close" hint="Optional deadline">
              <Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="h-9" />
            </Field>
          </div>
        </section>

        {/* ── The role ── */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-slate-900">2 · The role</h3>
          <Field title="About the role" required filled={required.summary} hint="Two or three sentences on what this person is here to do.">
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="You will own the checkout platform end to end…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
            />
          </Field>
          <Field title="Responsibilities" required filled={required.responsibilities} hint="Press Enter to add each one.">
            <ListBox items={responsibilities} onChange={setResponsibilities} placeholder="Own the services migration" />
          </Field>
          <Field title="First-year goals" hint="What success looks like after 12 months.">
            <ListBox items={goals} onChange={setGoals} placeholder="Cut deploy lead time to under 4 hours" />
          </Field>
        </section>

        {/* ── Requirements ── */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-slate-900">3 · Requirements</h3>
          <Field title="Must-have skills" required filled={required.mustHave}>
            <ListBox items={mustHave} onChange={setMustHave} placeholder="Postgres" />
          </Field>
          <Field title="Nice to have">
            <ListBox items={niceToHave} onChange={setNiceToHave} placeholder="Kubernetes" />
          </Field>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field title="Minimum experience" hint="Years">
              <Input type="number" min={0} value={minYears} onChange={(e) => setMinYears(e.target.value)} placeholder="4" className="h-9" />
            </Field>
            <Field title="Education">
              <select value={education} onChange={(e) => setEducation(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">
                {EDUCATION.map((e) => <option key={e} value={e}>{label(e)}</option>)}
              </select>
            </Field>
          </div>
        </section>

        {/* ── Compensation ── */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-slate-900">4 · Compensation</h3>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Field title="Currency">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">
                {['PKR', 'AED', 'USD', 'GBP', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field title="Salary from">
              <Input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="150000" className="h-9" />
            </Field>
            <Field title="Salary to">
              <Input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="220000" className="h-9" />
            </Field>
          </div>
          <Field title="Benefits">
            <ListBox items={benefits} onChange={setBenefits} placeholder="Health insurance" />
          </Field>
        </section>
      </div>

      {/* ── Live preview ── */}
      <aside className="lg:sticky lg:top-4 space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
            <span className="text-[11px] text-slate-400">Built from your boxes</span>
          </div>
          <pre className="px-4 py-3 text-[12px] leading-relaxed text-slate-700 whitespace-pre-wrap max-h-[60vh] overflow-y-auto font-sans">
            {jdContent || 'Fill the boxes and the job description appears here.'}
          </pre>
        </div>

        {error && (
          <p className="text-xs text-slate-900 bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" /> {error}
          </p>
        )}

        <Button onClick={submit} disabled={!canSubmit} className="w-full bg-slate-900 hover:bg-slate-900 text-white">
          {busy ? 'Creating…' : 'Create Requisition'}
        </Button>
        {missingCount > 0 && (
          <p className="text-[11px] text-slate-500 text-center">
            {missingCount} required {missingCount === 1 ? 'box' : 'boxes'} still empty
          </p>
        )}
      </aside>
    </div>
  )
}
