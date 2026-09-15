'use client'

/**
 * The policy builder — a full page in six steps, with the official document
 * drawn live beside it.
 *
 *   1 Start               title (with similar-policy search and a template
 *                         suggestion), template gallery, ID, category, type
 *   2 Ownership & dates   owner, approver, effective date, review cycle,
 *                         classification, what it supersedes, source
 *   3 Who it applies to   company, employee groups, departments, readers
 *   4 Write the policy    every section with what to cover, starter text,
 *                         definitions and roles as rows
 *   5 Related & legal     related policies from the library, laws by country
 *   6 Review & save       completeness checklist, what changed, history
 *
 * It writes the same Policy detail table and numbered sections as the
 * Playbook's policies (see lib/policy-builder), so a new policy reads exactly
 * like CVT-POL-301 and an old one opens back into these fields.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { recommendAudience } from '@/lib/policy-access'
import { PolicyDocument } from '@/components/policies/policy-document'
import {
  POLICY_CATEGORIES, POLICY_TYPES, DOCUMENT_KINDS, CLASSIFICATIONS, ENTITY_OPTIONS, REVIEW_CYCLES,
  EMPLOYMENT_GROUPS, OWNER_ROLES, POLICY_TEMPLATES, LEGAL_REFERENCES, SECTION_DEFS,
  applyTemplate, checklist, composeAppliesTo, composeContent, coverFor, legalSuggestions, nextReview,
  placeholderCount, sectionDef, suggestCode, templateFor, longDate,
  type BuilderState, type DocumentKind, type EntityKey,
} from '@/lib/policy-builder'

export interface ExistingPolicy { id: string; title: string; code: string | null; category: string; status: string }
export interface Person { id: string; fullName: string; designation: string | null }

const STEPS = [
  { label: 'Start', blurb: 'Title, template and ID' },
  { label: 'Ownership & dates', blurb: 'Owner, approver, review' },
  { label: 'Who it applies to', blurb: 'Company, people, readers' },
  { label: 'Write the policy', blurb: 'Every section, guided' },
  { label: 'Related & legal', blurb: 'Other documents and laws' },
  { label: 'Review & save', blurb: 'Checklist and history' },
]

const AUDIENCE = [
  { role: 'EMPLOYEE', label: 'Employees' },
  { role: 'LEAD', label: 'Leads' },
  { role: 'MANAGER', label: 'Managers' },
  { role: 'EXECUTIVE', label: 'Executives' },
  { role: 'FINANCE', label: 'Finance' },
]

const ROLE_NAMES = ['Every employee', 'Reporting Manager', 'Head of Department', 'HR Manager', 'Finance', 'IT', 'Founder / CEO', 'Inquiry Committee']

const SNIPPETS = [
  { label: 'Add sub-heading', text: '### [Sub-heading]\n\n[What this part says.]' },
  { label: 'Add bullet list', text: '- [First point]\n- [Second point]' },
  { label: 'Add numbered steps', text: '1. [First step]\n2. [Second step]' },
  { label: 'Add table', text: '| [Column] | [Column] |\n|---|---|\n| [Value] | [Value] |' },
]

const STOP = new Set(['policy', 'procedure', 'and', 'the', 'for', 'with', 'from', 'employee', 'employees'])
function significant(title: string): string[] {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w))
}

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'
const label = 'block text-sm font-medium text-slate-800 mb-1'
const hint = 'mt-1 text-xs text-slate-500'
const btnPrimary = 'text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40'
const btnSecondary = 'text-sm px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40'
const btnSmall = 'text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30'

export function PolicyBuilder({ mode, policyId, status, initial, existing, people, departments }: {
  mode: 'create' | 'edit'
  policyId?: string
  status?: string
  initial: BuilderState
  existing: ExistingPolicy[]
  people: Person[]
  departments: string[]
}) {
  const router = useRouter()
  const [s, setS] = useState<BuilderState>(initial)
  const [step, setStep] = useState(0)
  const [panel, setPanel] = useState<'preview' | 'checklist'>('preview')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const change = (fn: (prev: BuilderState) => BuilderState) => { setS(fn); setDirty(true) }
  const set = (patch: Partial<BuilderState>) => change((prev) => ({ ...prev, ...patch }))
  const setScope = (patch: Partial<Pick<BuilderState, 'entity' | 'groups' | 'departments'>>) =>
    change((prev) => {
      const next = { ...prev, ...patch }
      return next.appliesEdited ? next : { ...next, appliesTo: composeAppliesTo(next.entity, next.groups, next.departments) }
    })

  const others = existing.filter((p) => p.id !== policyId)
  const codes = others.map((o) => o.code).filter((c): c is string => !!c)
  const checks = checklist(s, others)
  const done = checks.filter((c) => c.ok).length
  const content = composeContent(s)

  async function save(openAfter: boolean) {
    const blocking = checks.filter((c) => c.blocking && !c.ok)
    if (blocking.length) {
      toastError('Fix these before saving', blocking.map((b) => `${b.label}: ${b.hint}`).join(' · '))
      setPanel('checklist')
      return
    }
    if (s.code && codes.includes(s.code)) {
      toastError('Policy ID already used', `${s.code} belongs to another policy. Use the suggested ID in step 1.`)
      setStep(0)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(mode === 'create' ? '/api/policies' : `/api/policies/${policyId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: s.title.trim(),
          type: s.type,
          category: s.category,
          description: s.description.trim(),
          content,
          url: s.url.trim(),
          version: s.version.trim() || '1.0',
          effectiveDate: s.effectiveDate || null,
          audience: 'ALL',
          audienceRoles: s.audienceRoles,
        }),
      })
      const d = await res.json().catch(() => ({})) as { error?: string; policy?: { id: string } }
      if (!res.ok) { toastError('Could not save the policy', d.error); return }
      const id = mode === 'create' ? d.policy?.id : policyId
      setDirty(false)
      toastSuccess(mode === 'create' ? 'Policy saved as a draft' : 'Policy saved')
      router.push(openAfter ? `/dashboard/policies/${id}` : `/dashboard/policies?policy=${id}`)
    } finally { setSaving(false) }
  }

  const stepDone = (i: number) => checks.filter((c) => c.step === i).every((c) => c.ok)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="max-w-3xl">
          <Link href="/dashboard/policies" className="text-sm text-slate-600 underline underline-offset-2">← Policies</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{mode === 'create' ? 'New policy' : `Edit policy${s.code ? ` · ${s.code}` : ''}`}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Work through the steps on the left. The official document on the right updates as you type, and the checklist shows what a complete policy still needs.
            {mode === 'create'
              ? ' It is saved as a draft only HR can see — send it for review and activate it from the policy page.'
              : status === 'ACTIVE' || status === 'PUBLISHED'
                ? ' This policy is live: employees see your changes as soon as you save, so raise the version and say what changed in step 6.'
                : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dashboard/policies" className={btnSecondary}>Cancel</Link>
          <button type="button" onClick={() => save(false)} disabled={saving} className={btnSecondary}>
            {saving ? 'Saving…' : mode === 'create' ? 'Save as draft' : 'Save changes'}
          </button>
          <button type="button" onClick={() => save(true)} disabled={saving} className={btnPrimary}>
            {saving ? 'Saving…' : 'Save and open policy'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)] 2xl:grid-cols-[210px_minmax(0,1fr)_minmax(0,600px)] items-start">
        {/* Steps */}
        <nav className="bg-white border border-slate-200 rounded-xl p-3 lg:sticky lg:top-4" aria-label="Policy steps">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Steps</p>
          <ol className="mt-2 space-y-1">
            {STEPS.map((st, i) => {
              const on = step === i
              const ok = stepDone(i)
              return (
                <li key={st.label}>
                  <button type="button" onClick={() => setStep(i)} aria-current={on ? 'step' : undefined}
                    className={`w-full text-left rounded-lg px-2.5 py-2 flex gap-2.5 items-start ${on ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-800'}`}>
                    <span className={`mt-0.5 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${ok ? 'bg-emerald-500 text-white' : on ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'}`}>
                      {ok ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{st.label}</span>
                      <span className={`block text-[11px] ${on ? 'text-slate-300' : 'text-slate-500'}`}>{st.blurb}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="mt-3 px-2">
            <div className="h-1.5 rounded bg-slate-200 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.round((done / checks.length) * 100)}%` }} /></div>
            <p className="text-[11px] text-slate-600 mt-1">{done} of {checks.length} checks done</p>
          </div>
        </nav>

        {/* The step */}
        <main className="bg-white border border-slate-200 rounded-xl p-5 min-w-0">
          <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3 mb-5">
            <h2 className="text-lg font-semibold text-slate-900">{step + 1}. {STEPS[step].label}</h2>
            <span className="text-xs text-slate-500">Step {step + 1} of {STEPS.length}</span>
          </div>

          {step === 0 && <StartStep s={s} set={set} change={change} others={others} codes={codes} />}
          {step === 1 && <OwnershipStep s={s} set={set} people={people} others={others} />}
          {step === 2 && <AppliesStep s={s} set={set} setScope={setScope} departments={departments} />}
          {step === 3 && <WriteStep s={s} change={change} goTo={setStep} />}
          {step === 4 && <RelatedStep s={s} set={set} change={change} others={others} />}
          {step === 5 && <ReviewStep s={s} set={set} checks={checks} goTo={setStep} />}

          <div className="flex justify-between gap-3 mt-8 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className={btnSecondary}>
              {step === 0 ? 'Back' : `Back: ${STEPS[step - 1].label}`}
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => setStep(step + 1)} className={btnPrimary}>Next: {STEPS[step + 1].label}</button>
            ) : (
              <button type="button" onClick={() => save(true)} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save and open policy'}</button>
            )}
          </div>
        </main>

        {/* Preview and checklist */}
        <aside className="lg:col-span-2 2xl:col-span-1 2xl:sticky 2xl:top-4 bg-white border border-slate-200 rounded-xl overflow-hidden min-w-0">
          <div className="flex border-b border-slate-200">
            {(['preview', 'checklist'] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPanel(p)} aria-pressed={panel === p}
                className={`flex-1 px-4 py-2.5 text-sm ${panel === p ? 'border-b-2 border-slate-900 font-semibold text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
                {p === 'preview' ? 'Live preview' : `Checklist · ${done}/${checks.length}`}
              </button>
            ))}
          </div>
          {panel === 'preview' ? (
            <div className="bg-slate-100 p-4 max-h-[calc(100vh-10rem)] overflow-y-auto">
              <PolicyDocument policy={{
                title: s.title || 'Untitled policy', category: s.category, status: status ?? 'DRAFT',
                version: s.version || '1.0', effectiveDate: s.effectiveDate || null, content, url: s.url || null,
              }} />
            </div>
          ) : (
            <div className="p-4 max-h-[calc(100vh-10rem)] overflow-y-auto"><Checklist checks={checks} goTo={setStep} /></div>
          )}
        </aside>
      </div>
    </div>
  )
}

// ─── Step 1: Start ────────────────────────────────────────────────────────────

function StartStep({ s, set, change, others, codes }: {
  s: BuilderState; set: (p: Partial<BuilderState>) => void; change: (fn: (p: BuilderState) => BuilderState) => void
  others: ExistingPolicy[]; codes: string[]
}) {
  const [q, setQ] = useState('')
  const suggestion = templateFor(s.title)
  const words = significant(s.title)
  const similar = s.title.trim().length >= 4
    ? others.filter((o) => o.title.toLowerCase() === s.title.trim().toLowerCase() || significant(o.title).some((w) => words.includes(w))).slice(0, 5)
    : []
  const suggestedCode = suggestCode(s.kind, codes)
  const codeTaken = !!s.code && codes.includes(s.code)
  const templates = POLICY_TEMPLATES.filter((t) => !q.trim() || `${t.label} ${t.blurb}`.toLowerCase().includes(q.trim().toLowerCase()))

  function use(key: string) {
    const t = POLICY_TEMPLATES.find((x) => x.key === key)
    if (!t) return
    change((prev) => applyTemplate(prev, t))
    toastSuccess(`${t.label} template applied`, 'Sections, roles and laws were filled in where empty. Nothing you had written was replaced.')
  }

  return (
    <div className="space-y-6">
      <div>
        <label className={label} htmlFor="pb-title">Policy title <span className="text-red-700">*</span></label>
        <input id="pb-title" className={`${input} text-base`} value={s.title} onChange={(e) => set({ title: e.target.value })}
          placeholder="e.g. Remote & Work From Home Policy" autoFocus />
        <p className={hint}>Name it for what it governs, ending in “Policy” or “Procedure”.</p>

        {suggestion && s.templateKey !== suggestion.key && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-blue-900">
              This looks like a <strong>{suggestion.label}</strong> policy. The template fills in the sections, roles and laws such a policy needs.
            </p>
            <button type="button" onClick={() => use(suggestion.key)} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-blue-700 text-white">
              Use the {suggestion.label} template
            </button>
          </div>
        )}

        {similar.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-sm font-medium text-amber-900">Already in the library — check you are not writing one of these again:</p>
            <ul className="mt-1.5 space-y-1">
              {similar.map((o) => (
                <li key={o.id} className="text-sm text-amber-900 flex items-center justify-between gap-3">
                  <span>{o.title}{o.code ? ` · ${o.code}` : ''} <span className="text-xs text-amber-700">({o.status.toLowerCase()})</span></span>
                  <Link href={`/dashboard/policies/${o.id}`} target="_blank" className="text-xs font-medium underline">Open in new tab</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <label className={label} htmlFor="pb-desc">Short description</label>
        <textarea id="pb-desc" rows={2} maxLength={240} className={input} value={s.description} onChange={(e) => set({ description: e.target.value })}
          placeholder="One sentence: what this policy covers. Shown in search and the policy library." />
        <p className={hint}>{s.description.length}/240</p>
      </div>

      <section>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Start from a template</h3>
            <p className="text-xs text-slate-500">Each fills the structure, what to cover, starter wording, roles and relevant laws. Numbers and names are left as [placeholders] for you.</p>
          </div>
          <input className={`${input} max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" aria-label="Search templates" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 mt-3">
          {templates.map((t) => {
            const on = s.templateKey === t.key
            return (
              <div key={t.key} className={`rounded-lg border p-3 flex flex-col ${on ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                <p className="text-sm font-semibold text-slate-900">{t.label}</p>
                <p className="text-xs text-slate-600 mt-0.5 flex-1">{t.blurb}</p>
                <button type="button" onClick={() => use(t.key)} className="mt-2 self-start text-xs font-medium underline underline-offset-2 text-slate-900">
                  {on ? 'In use — apply again' : 'Use this template'}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <span className={label}>What kind of document</span>
          <div className="space-y-1.5">
            {DOCUMENT_KINDS.map((k) => (
              <label key={k.prefix} className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${s.kind === k.prefix ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                <input type="radio" name="pb-kind" className="mt-1 accent-slate-900" checked={s.kind === k.prefix}
                  onChange={() => set({ kind: k.prefix as DocumentKind, code: s.code.startsWith(`${k.prefix}-`) ? s.code : '' })} />
                <span><span className="block text-sm font-medium text-slate-900">{k.label} <span className="font-mono text-xs text-slate-500">{k.prefix}-…</span></span><span className="block text-xs text-slate-500">{k.hint}</span></span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={label} htmlFor="pb-code">Policy ID</label>
          <input id="pb-code" className={`${input} font-mono`} value={s.code} onChange={(e) => set({ code: e.target.value.toUpperCase().trim() })} placeholder={suggestedCode} />
          {s.code !== suggestedCode && (
            <button type="button" onClick={() => set({ code: suggestedCode })} className="mt-1.5 text-xs font-medium underline underline-offset-2 text-slate-900">
              Use the next free ID: {suggestedCode}
            </button>
          )}
          {codeTaken && <p className="mt-1 text-xs font-medium text-red-700">{s.code} is already used by another policy.</p>}
          <p className={hint}>How the policy is referred to in letters, forms and other policies.</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div>
          <label className={label} htmlFor="pb-cat">Category</label>
          <select id="pb-cat" className={input} value={s.category} onChange={(e) => set({ category: e.target.value })}>
            {POLICY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <p className={hint}>Where it is filed in the library.</p>
        </div>
        <div>
          <label className={label} htmlFor="pb-type">Type</label>
          <select id="pb-type" className={input} value={s.type} onChange={(e) => set({ type: e.target.value })}>
            {POLICY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="pb-ver">Version</label>
          <input id="pb-ver" className={input} value={s.version} onChange={(e) => set({ version: e.target.value })} />
          <p className={hint}>1.0 first issue · 1.1 small change · 2.0 rewrite.</p>
        </div>
      </section>
    </div>
  )
}

// ─── Step 2: Ownership & dates ────────────────────────────────────────────────

function OwnershipStep({ s, set, people, others }: {
  s: BuilderState; set: (p: Partial<BuilderState>) => void; people: Person[]; others: ExistingPolicy[]
}) {
  const ceo = people.find((p) => /chief executive|\bceo\b|founder/i.test(p.designation ?? ''))
  const ceoText = ceo ? `${ceo.fullName}, ${ceo.designation}` : ''
  const next = nextReview(s.effectiveDate, s.reviewCycle)

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={label} htmlFor="pb-owner-role">Policy owner — role</label>
          <input id="pb-owner-role" className={input} list="pb-owner-roles" value={s.ownerRole} onChange={(e) => set({ ownerRole: e.target.value })} />
          <datalist id="pb-owner-roles">{OWNER_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
          <p className={hint}>The role that keeps this policy current. A role outlasts the person in it.</p>
        </div>
        <div>
          <span className={label}>Policy owner — person (optional)</span>
          {s.ownerName ? (
            <p className="text-sm text-slate-900 flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
              {s.ownerName}
              <button type="button" onClick={() => set({ ownerName: '' })} className="text-xs underline">Remove</button>
            </p>
          ) : (
            <Pick options={people.map((p) => ({ id: p.id, label: p.fullName, sub: p.designation ?? '' }))} placeholder="Search by name or designation"
              onPick={(o) => set({ ownerName: o.label })} />
          )}
        </div>
      </section>

      <section>
        <label className={label} htmlFor="pb-approver">Approved by</label>
        <input id="pb-approver" className={input} value={s.approver} onChange={(e) => set({ approver: e.target.value })} placeholder="Name, Designation" />
        <div className="flex flex-wrap items-center gap-3 mt-1.5">
          {ceo && s.approver !== ceoText && (
            <button type="button" onClick={() => set({ approver: ceoText })} className="text-xs font-medium underline underline-offset-2">Use {ceoText}</button>
          )}
          <span className="text-xs text-slate-500">or pick someone:</span>
          <div className="min-w-[240px] flex-1">
            <Pick options={people.map((p) => ({ id: p.id, label: p.fullName, sub: p.designation ?? '' }))} placeholder="Search people"
              onPick={(o) => set({ approver: o.sub ? `${o.label}, ${o.sub}` : o.label })} />
          </div>
        </div>
        <p className={hint}>The CEO is the approver of record for Playbook policies.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div>
          <label className={label} htmlFor="pb-eff">Effective date</label>
          <input id="pb-eff" type="date" className={input} value={s.effectiveDate} onChange={(e) => set({ effectiveDate: e.target.value })} />
          <p className={hint}>{s.effectiveDate ? `Reads as ${longDate(s.effectiveDate)}.` : 'When it takes effect.'}</p>
        </div>
        <div>
          <label className={label} htmlFor="pb-cycle">Review cycle</label>
          <select id="pb-cycle" className={input} value={s.reviewCycle} onChange={(e) => set({ reviewCycle: e.target.value })}>
            {REVIEW_CYCLES.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
            {!REVIEW_CYCLES.some((c) => c.label === s.reviewCycle) && s.reviewCycle && <option value={s.reviewCycle}>{s.reviewCycle}</option>}
          </select>
          <p className={hint}>{next ? `Next review: ${next}.` : 'Sets the next review date.'}</p>
        </div>
        <div>
          <label className={label} htmlFor="pb-class">Classification</label>
          <select id="pb-class" className={input} value={s.classification} onChange={(e) => set({ classification: e.target.value })}>
            {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            {!(CLASSIFICATIONS as readonly string[]).includes(s.classification) && s.classification && <option value={s.classification}>{s.classification}</option>}
          </select>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <span className={label}>Supersedes (optional)</span>
          {s.supersedes ? (
            <p className="text-sm text-slate-900 flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
              {s.supersedes}
              <button type="button" onClick={() => set({ supersedes: '' })} className="text-xs underline">Remove</button>
            </p>
          ) : (
            <Pick options={others.map((o) => ({ id: o.id, label: o.title, sub: o.code ?? o.status.toLowerCase() }))} placeholder="Search the library for the policy this replaces"
              onPick={(o) => set({ supersedes: o.sub && o.sub.startsWith('CVT-') ? `${o.label} (${o.sub})` : o.label })} />
          )}
          <p className={hint}>Archive the old policy once this one is active.</p>
        </div>
        <div>
          <label className={label} htmlFor="pb-source">Source (optional)</label>
          <input id="pb-source" className={input} value={s.source} onChange={(e) => set({ source: e.target.value })} placeholder="e.g. HR Playbook CVT-HR-PB-001, §3.4" />
          {!s.source && (
            <button type="button" onClick={() => set({ source: 'HR Playbook CVT-HR-PB-001, §[section]' })} className="mt-1.5 text-xs font-medium underline underline-offset-2">
              It comes from the HR Playbook
            </button>
          )}
        </div>
      </section>

      <div>
        <label className={label} htmlFor="pb-url">Attached document link (optional)</label>
        <input id="pb-url" className={input} value={s.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://drive.google.com/… — a signed PDF or form" />
      </div>
    </div>
  )
}

// ─── Step 3: Who it applies to ────────────────────────────────────────────────

function AppliesStep({ s, set, setScope, departments }: {
  s: BuilderState; set: (p: Partial<BuilderState>) => void
  setScope: (p: Partial<Pick<BuilderState, 'entity' | 'groups' | 'departments'>>) => void
  departments: string[]
}) {
  const rec = recommendAudience(s.title, s.type)
  const recMatches = rec.audience.filter((r) => r !== 'HR_ADMIN').length === s.audienceRoles.length
    && rec.audience.filter((r) => r !== 'HR_ADMIN').every((r) => s.audienceRoles.includes(r))
  const recRoles = rec.audience.filter((r) => r !== 'HR_ADMIN')

  return (
    <div className="space-y-6">
      <section>
        <span className={label}>Which company</span>
        <div className="grid gap-2 md:grid-cols-3">
          {ENTITY_OPTIONS.map((e) => (
            <label key={e.key} className={`rounded-lg border px-3 py-2.5 cursor-pointer ${s.entity === e.key ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
              <input type="radio" name="pb-entity" className="sr-only" checked={s.entity === e.key} onChange={() => setScope({ entity: e.key as EntityKey })} />
              <span className="block text-sm font-medium text-slate-900">{e.label}</span>
              <span className="block text-xs text-slate-500">{e.phrase}</span>
            </label>
          ))}
        </div>
        <p className={hint}>The brand name alone is never the contracting party — the policy names the company.</p>
      </section>

      <section>
        <span className={label}>Which people</span>
        <div className="flex flex-wrap gap-2">
          {EMPLOYMENT_GROUPS.map((g) => {
            const on = s.groups.includes(g)
            return (
              <label key={g} className={`text-sm px-3 py-1.5 rounded-full border cursor-pointer ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => setScope({ groups: on ? s.groups.filter((x) => x !== g) : [...s.groups, g] })} />
                {on ? '✓ ' : ''}{g}
              </label>
            )
          })}
        </div>
      </section>

      <section>
        <span className={label}>Which departments</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setScope({ departments: [] })} aria-pressed={s.departments.length === 0}
            className={`text-sm px-3 py-1.5 rounded-full border ${s.departments.length === 0 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
            All departments
          </button>
          {departments.map((d) => {
            const on = s.departments.includes(d)
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => setScope({ departments: on ? s.departments.filter((x) => x !== d) : [...s.departments, d] })}
                className={`text-sm px-3 py-1.5 rounded-full border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
                {d}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <label className={label} htmlFor="pb-applies">“Applies to”, as it will read</label>
        <textarea id="pb-applies" rows={2} className={input} value={s.appliesTo} onChange={(e) => set({ appliesTo: e.target.value, appliesEdited: true })} />
        {s.appliesEdited ? (
          <button type="button" onClick={() => set({ appliesTo: composeAppliesTo(s.entity, s.groups, s.departments), appliesEdited: false })} className="mt-1.5 text-xs font-medium underline underline-offset-2">
            Rebuild from the choices above
          </button>
        ) : <p className={hint}>Written for you from the choices above. Edit it if you need different wording.</p>}
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <span className="block text-sm font-semibold text-slate-900">Who can read it in Convertt HR</span>
        <p className="text-xs text-slate-500 mt-0.5">HR always sees every policy. Once it is active, these roles find it in Policies and the Help Center.</p>
        {s.title.trim().length > 2 && !recMatches && recRoles.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs text-blue-900">Suggested: {recRoles.map((r) => AUDIENCE.find((a) => a.role === r)?.label ?? r).join(', ')} — {rec.rationale}</p>
            <button type="button" onClick={() => set({ audienceRoles: recRoles })} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-700 text-white">Use the suggestion</button>
          </div>
        )}
        {s.title.trim().length > 2 && recRoles.length === 0 && (
          <p className="mt-2 text-xs text-amber-800">Suggested: HR only — {rec.rationale} Keep at least one role ticked, or the policy cannot be saved.</p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {AUDIENCE.map((a) => {
            const on = s.audienceRoles.includes(a.role)
            return (
              <button key={a.role} type="button" aria-pressed={on}
                onClick={() => set({ audienceRoles: on ? s.audienceRoles.filter((r) => r !== a.role) : [...s.audienceRoles, a.role] })}
                className={`text-sm px-3 py-1.5 rounded-full border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
                {on ? '✓ ' : ''}{a.label}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ─── Step 4: Write the policy ─────────────────────────────────────────────────

function WriteStep({ s, change, goTo }: { s: BuilderState; change: (fn: (p: BuilderState) => BuilderState) => void; goTo: (i: number) => void }) {
  const [custom, setCustom] = useState('')
  const template = POLICY_TEMPLATES.find((t) => t.key === s.templateKey)
  const placeholders = placeholderCount(s)

  const patchSection = (i: number, patch: Partial<BuilderState['sections'][number]>) =>
    change((prev) => ({ ...prev, sections: prev.sections.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const move = (i: number, dir: -1 | 1) =>
    change((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.sections.length) return prev
      const next = [...prev.sections]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...prev, sections: next }
    })

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Each section becomes a numbered section of the official document, in this order. Required sections are always included; switch optional ones on when the policy needs them.
        Write in plain sentences — use the buttons to add sub-headings, lists and tables.
        {placeholders > 0 && <span className="block mt-1 font-medium text-amber-800">{placeholders} [placeholder]{placeholders === 1 ? '' : 's'} still to replace with the real detail.</span>}
      </div>

      {s.sections.map((sec, i) => {
        const def = sec.custom ? undefined : sectionDef(sec.key)
        const kind = def?.kind ?? 'text'
        const starter = template?.starters[sec.key] ?? def?.starter
        const count = sec.body.match(/\[(?!\s*\])[^\]\n]{1,80}\]/g)?.length ?? 0
        return (
          <section key={sec.key} className={`rounded-xl border ${sec.enabled ? 'border-slate-300 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
            <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-slate-100">
              {sec.custom ? (
                <input className={`${input} max-w-sm font-semibold`} value={sec.title} onChange={(e) => patchSection(i, { title: e.target.value })} aria-label="Section title" />
              ) : (
                <h3 className="text-base font-semibold text-slate-900">{sec.title}</h3>
              )}
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${def?.required ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {def?.required ? 'Required' : sec.custom ? 'Custom' : 'Optional'}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                {!def?.required && (
                  <label className="text-xs text-slate-700 flex items-center gap-1.5 mr-2">
                    <input type="checkbox" className="accent-slate-900" checked={sec.enabled} onChange={(e) => patchSection(i, { enabled: e.target.checked })} />
                    Include
                  </label>
                )}
                <button type="button" className={btnSmall} disabled={i === 0} onClick={() => move(i, -1)}>Move up</button>
                <button type="button" className={btnSmall} disabled={i === s.sections.length - 1} onClick={() => move(i, 1)}>Move down</button>
                {sec.custom && (
                  <button type="button" className={btnSmall}
                    onClick={() => { if (!sec.body.trim() || confirm(`Remove the section “${sec.title}” and its text?`)) change((prev) => ({ ...prev, sections: prev.sections.filter((_, j) => j !== i) })) }}>
                    Remove section
                  </button>
                )}
              </div>
            </div>

            {sec.enabled && (
              <div className="px-4 py-3 space-y-3">
                {def && <p className="text-sm text-slate-600">{def.guidance}</p>}
                {!sec.custom && coverFor(sec.key, s.templateKey).length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">What to cover</p>
                    <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                      {coverFor(sec.key, s.templateKey).map((c) => <li key={c} className="text-xs text-slate-700">• {c}</li>)}
                    </ul>
                  </div>
                )}

                {kind === 'text' && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {SNIPPETS.map((sn) => (
                        <button key={sn.label} type="button" className={btnSmall}
                          onClick={() => patchSection(i, { body: sec.body.trim() ? `${sec.body.trimEnd()}\n\n${sn.text}` : sn.text })}>
                          {sn.label}
                        </button>
                      ))}
                      {starter && !sec.body.trim() && (
                        <button type="button" onClick={() => patchSection(i, { body: starter })} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-700 text-white">
                          Insert starter text
                        </button>
                      )}
                    </div>
                    <textarea rows={Math.min(18, Math.max(5, sec.body.split('\n').length + 2))} className={`${input} leading-relaxed`} value={sec.body}
                      onChange={(e) => patchSection(i, { body: e.target.value })} aria-label={`${sec.title} text`}
                      placeholder={def?.required ? 'Required — write this section, or insert the starter text and replace the [placeholders].' : 'Write this section.'} />
                    {count > 0 && <p className="text-xs text-amber-800">{count} [placeholder]{count === 1 ? '' : 's'} in this section.</p>}
                  </>
                )}

                {kind === 'definitions' && <DefinitionsEditor s={s} change={change} />}
                {kind === 'roles' && <RolesEditor s={s} change={change} />}
                {(kind === 'related' || kind === 'legal') && (
                  <p className="text-sm text-slate-600">
                    {kind === 'related' ? `${s.related.length} related document${s.related.length === 1 ? '' : 's'}` : `${s.legal.length} law${s.legal.length === 1 ? '' : 's'}`} listed.
                    <button type="button" onClick={() => goTo(4)} className="ml-2 text-sm font-medium underline underline-offset-2">Edit in Related & legal</button>
                  </p>
                )}
              </div>
            )}
          </section>
        )
      })}

      <div className="rounded-xl border border-dashed border-slate-300 p-4 flex gap-2 flex-wrap items-end">
        <label className="block flex-1 min-w-[220px]">
          <span className={label}>Add a section of your own</span>
          <input className={input} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Allowances, Confidentiality of records" />
        </label>
        <button type="button" disabled={!custom.trim()} className={btnPrimary}
          onClick={() => {
            const title = custom.trim()
            change((prev) => {
              const at = prev.sections.findIndex((x) => x.key === 'related')
              const next = [...prev.sections]
              next.splice(at < 0 ? next.length : at, 0, { key: `custom-${Date.now()}`, title, enabled: true, body: '', custom: true })
              return { ...prev, sections: next }
            })
            setCustom('')
          }}>
          Add section
        </button>
      </div>
      {template && template.key !== 'blank' && (
        <p className="text-xs text-slate-500">Guidance above comes from the {template.label} template.</p>
      )}
    </div>
  )
}

function DefinitionsEditor({ s, change }: { s: BuilderState; change: (fn: (p: BuilderState) => BuilderState) => void }) {
  const template = POLICY_TEMPLATES.find((t) => t.key === s.templateKey)
  const missing = (template?.definitions ?? []).filter(([term]) => !s.definitions.some((d) => d.term.toLowerCase() === term.toLowerCase()))
  const patch = (i: number, p: Partial<{ term: string; meaning: string }>) =>
    change((prev) => ({ ...prev, definitions: prev.definitions.map((d, j) => (j === i ? { ...d, ...p } : d)) }))
  return (
    <div className="space-y-2">
      {s.definitions.length === 0 && <p className="text-xs text-slate-500">No terms yet.</p>}
      {s.definitions.map((d, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)_auto] items-start">
          <input className={input} value={d.term} onChange={(e) => patch(i, { term: e.target.value })} placeholder="Term" aria-label="Term" />
          <textarea rows={2} className={input} value={d.meaning} onChange={(e) => patch(i, { meaning: e.target.value })} placeholder="What it means in this policy" aria-label="Meaning" />
          <button type="button" className={btnSmall} onClick={() => change((prev) => ({ ...prev, definitions: prev.definitions.filter((_, j) => j !== i) }))}>Remove</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 items-center">
        <button type="button" className={btnSmall} onClick={() => change((prev) => ({ ...prev, definitions: [...prev.definitions, { term: '', meaning: '' }] }))}>Add term</button>
        {missing.map(([term, meaning]) => (
          <button key={term} type="button" onClick={() => change((prev) => ({ ...prev, definitions: [...prev.definitions, { term, meaning }] }))}
            className="text-xs px-2.5 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-900">
            + {term}
          </button>
        ))}
      </div>
    </div>
  )
}

function RolesEditor({ s, change }: { s: BuilderState; change: (fn: (p: BuilderState) => BuilderState) => void }) {
  const template = POLICY_TEMPLATES.find((t) => t.key === s.templateKey)
  const missing = (template?.roles ?? []).filter(([role]) => !s.roles.some((r) => r.role.toLowerCase() === role.toLowerCase()))
  const patch = (i: number, p: Partial<{ role: string; duty: string }>) =>
    change((prev) => ({ ...prev, roles: prev.roles.map((r, j) => (j === i ? { ...r, ...p } : r)) }))
  return (
    <div className="space-y-2">
      {s.roles.map((r, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)_auto] items-start">
          <input className={input} list="pb-role-names" value={r.role} onChange={(e) => patch(i, { role: e.target.value })} placeholder="Role" aria-label="Role" />
          <textarea rows={2} className={input} value={r.duty} onChange={(e) => patch(i, { duty: e.target.value })} placeholder="What this role must do under the policy" aria-label="Responsibility" />
          <button type="button" className={btnSmall} onClick={() => change((prev) => ({ ...prev, roles: prev.roles.filter((_, j) => j !== i) }))}>Remove</button>
        </div>
      ))}
      <datalist id="pb-role-names">{ROLE_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="flex flex-wrap gap-1.5 items-center">
        <button type="button" className={btnSmall} onClick={() => change((prev) => ({ ...prev, roles: [...prev.roles, { role: '', duty: '' }] }))}>Add role</button>
        {missing.map(([role, duty]) => (
          <button key={role} type="button" onClick={() => change((prev) => ({ ...prev, roles: [...prev.roles, { role, duty }] }))}
            className="text-xs px-2.5 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-900">
            + {role}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Step 5: Related & legal ──────────────────────────────────────────────────

function RelatedStep({ s, set, change, others }: {
  s: BuilderState; set: (p: Partial<BuilderState>) => void; change: (fn: (p: BuilderState) => BuilderState) => void; others: ExistingPolicy[]
}) {
  const [extra, setExtra] = useState('')
  const [law, setLaw] = useState('')
  const [allLaws, setAllLaws] = useState(false)
  const template = POLICY_TEMPLATES.find((t) => t.key === s.templateKey)
  const sameCategory = others.filter((o) => o.category === s.category && o.status !== 'ARCHIVED' && !s.related.includes(o.title)).slice(0, 6)
  const suggested = allLaws ? LEGAL_REFERENCES.map((l) => l.label as string) : legalSuggestions(s.entity, template?.topics ?? [])
  const customLaws = s.legal.filter((l) => !suggested.includes(l))
  const toggleSection = (key: string, on: boolean) =>
    change((prev) => ({ ...prev, sections: prev.sections.map((x) => (x.key === key ? { ...x, enabled: on } : x)) }))
  const on = (key: string) => !!s.sections.find((x) => x.key === key)?.enabled
  const add = (title: string) => { if (title.trim() && !s.related.includes(title.trim())) set({ related: [...s.related, title.trim()] }) }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-slate-900">Related policies, procedures and forms</h3>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" className="accent-slate-900" checked={on('related')} onChange={(e) => toggleSection('related', e.target.checked)} />Include this section</label>
        </div>
        <p className={hint}>Documents a reader needs alongside this one.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <span className={label}>From the policy library</span>
            <Pick options={others.filter((o) => !s.related.includes(o.title)).map((o) => ({ id: o.id, label: o.title, sub: o.code ?? '' }))}
              placeholder="Search policies" onPick={(o) => add(o.label)} />
            {sameCategory.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-slate-500">Same category:</span>
                {sameCategory.map((o) => (
                  <button key={o.id} type="button" onClick={() => add(o.title)} className="text-xs px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-900">+ {o.title}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className={label} htmlFor="pb-extra">A form, SOP or outside document</label>
            <div className="flex gap-2">
              <input id="pb-extra" className={input} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. Form F-08 Policy Acknowledgment" />
              <button type="button" disabled={!extra.trim()} className={btnSecondary} onClick={() => { add(extra); setExtra('') }}>Add</button>
            </div>
          </div>
        </div>
        {s.related.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {s.related.map((r) => (
              <li key={r} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                {r}
                <button type="button" className="text-xs underline" onClick={() => set({ related: s.related.filter((x) => x !== r) })}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-slate-900">Legal references</h3>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" className="accent-slate-900" checked={on('legal')} onChange={(e) => toggleSection('legal', e.target.checked)} />Include this section</label>
        </div>
        <p className={hint}>
          Suggested for {ENTITY_OPTIONS.find((e) => e.key === s.entity)?.label.toLowerCase()}{template && template.key !== 'blank' ? ` and a ${template.label.toLowerCase()} policy` : ''}.
          They are pointers, not advice — confirm the current law with counsel.
        </p>
        <ul className="mt-3 space-y-1.5">
          {suggested.map((l) => {
            const ticked = s.legal.includes(l)
            return (
              <li key={l}>
                <label className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-slate-900" checked={ticked} onChange={() => set({ legal: ticked ? s.legal.filter((x) => x !== l) : [...s.legal, l] })} />
                  {l}
                </label>
              </li>
            )
          })}
        </ul>
        <button type="button" onClick={() => setAllLaws(!allLaws)} className="mt-2 text-xs font-medium underline underline-offset-2">
          {allLaws ? 'Show only the suggested laws' : 'Show every law in the list'}
        </button>
        {customLaws.length > 0 && (
          <ul className="mt-3 space-y-1">
            {customLaws.map((l) => (
              <li key={l} className="flex items-center justify-between gap-3 text-sm rounded-lg border border-slate-200 px-3 py-1.5">
                {l}
                <button type="button" className="text-xs underline" onClick={() => set({ legal: s.legal.filter((x) => x !== l) })}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 mt-3">
          <input className={input} value={law} onChange={(e) => setLaw(e.target.value)} placeholder="Add another law or regulation" aria-label="Another law" />
          <button type="button" disabled={!law.trim()} className={btnSecondary}
            onClick={() => { if (!s.legal.includes(law.trim())) set({ legal: [...s.legal, law.trim()] }); setLaw('') }}>Add</button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
          <input type="checkbox" className="mt-0.5 accent-slate-900" checked={s.playbookClause} onChange={(e) => set({ playbookClause: e.target.checked })} />
          <span>
            <span className="font-medium">End with the Playbook precedence clause</span>
            <span className="block text-xs text-slate-600 mt-0.5">“Where this policy and the HR Playbook differ, the Playbook prevails…” — as on every Playbook policy.</span>
          </span>
        </label>
      </section>
    </div>
  )
}

// ─── Step 6: Review & save ────────────────────────────────────────────────────

function ReviewStep({ s, set, checks, goTo }: {
  s: BuilderState; set: (p: Partial<BuilderState>) => void; checks: ReturnType<typeof checklist>; goTo: (i: number) => void
}) {
  const hasRow = s.history.some((h) => h.version === s.version)
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-base font-semibold text-slate-900">Is it complete?</h3>
        <p className={hint}>A structured policy answers every one of these. Only the title and readers stop you saving — the rest can be finished in draft.</p>
        <div className="mt-3"><Checklist checks={checks} goTo={goTo} /></div>
      </section>

      <section>
        <label className={label} htmlFor="pb-change">What changed in version {s.version || '1.0'}</label>
        <input id="pb-change" className={input} value={s.changeNote} onChange={(e) => set({ changeNote: e.target.value })} placeholder={hasRow ? 'Leave blank to keep what the history already says' : 'e.g. First issue. / Added the remote-work section.'} />
        <p className={hint}>Recorded in the revision history at the end of the document, with the effective date and approver.</p>
      </section>

      {s.history.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Revision history so far</h3>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100"><th className="px-3 py-2">Version</th><th className="px-3 py-2">Effective</th><th className="px-3 py-2">Change</th><th className="px-3 py-2">Approved by</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {s.history.map((h, i) => (
                  <tr key={i}><td className="px-3 py-2">{h.version}</td><td className="px-3 py-2">{h.effective}</td><td className="px-3 py-2">{h.change}</td><td className="px-3 py-2">{h.approvedBy}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasRow && <p className={hint}>Saving adds a row for version {s.version}.</p>}
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-medium text-slate-900">After saving</p>
        <ol className="list-decimal pl-5 mt-1 space-y-0.5">
          <li>Open the policy and use <strong>Send for review</strong> to get it approved.</li>
          <li>Once approved, <strong>Activate</strong> it — employees in its audience are told and it appears in Policies and the Help Center.</li>
          {s.supersedes && <li>Archive <strong>{s.supersedes}</strong>, which this replaces.</li>}
        </ol>
      </section>
    </div>
  )
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

function Checklist({ checks, goTo }: { checks: ReturnType<typeof checklist>; goTo: (i: number) => void }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {checks.map((c) => (
        <li key={c.label} className="flex items-start gap-3 px-3 py-2">
          <span className={`mt-0.5 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${c.ok ? 'bg-emerald-500 text-white' : c.blocking ? 'bg-red-600 text-white' : 'bg-amber-400 text-white'}`}>
            {c.ok ? '✓' : '!'}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-slate-900">{c.label}</span>
            {!c.ok && c.hint && <span className="block text-xs text-slate-600">{c.hint}</span>}
          </span>
          {!c.ok && (
            <button type="button" onClick={() => goTo(c.step)} className="text-xs font-medium underline underline-offset-2 whitespace-nowrap">
              Go to step {c.step + 1}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function Pick({ options, placeholder, onPick }: {
  options: { id: string; label: string; sub?: string }[]
  placeholder: string
  onPick: (o: { id: string; label: string; sub?: string }) => void
}) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const matches = term ? options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(term)).slice(0, 8) : []
  return (
    <div className="relative">
      <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {term && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No match.</li>
          ) : matches.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => { onPick(o); setQ('') }} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                <span className="block text-sm text-slate-900">{o.label}</span>
                {o.sub && <span className="block text-xs text-slate-500">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Keep the section list in sync with the definitions it relies on.
void SECTION_DEFS
