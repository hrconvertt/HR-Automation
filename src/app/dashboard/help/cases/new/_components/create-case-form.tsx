'use client'

/**
 * Create Case — Workday's: who it is for, what kind of case (which routes it),
 * a title with the characters left, a description, an attachment, and
 * suggested resources on the right that follow what is typed.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { CASE_TYPES, CASE_TITLE_MAX, serviceTeamLabel, caseTypeOf } from '@/lib/help-center'
import type { KnowledgeEntry } from '@/lib/help-center-server'

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600'

export function CreateCaseForm({ people, defaultForId, presetType, presetTitle }: {
  /** Who the case can be for. One entry means it is always for them. */
  people: { id: string; fullName: string }[]
  defaultForId: string
  presetType?: string
  presetTitle?: string
}) {
  const router = useRouter()
  const [forId, setForId] = useState(defaultForId)
  const [type, setType] = useState(presetType && CASE_TYPES.some((t) => t.value === presetType) ? presetType : '')
  const [title, setTitle] = useState(presetTitle ? `Question about: ${presetTitle}`.slice(0, CASE_TITLE_MAX) : '')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [suggested, setSuggested] = useState<KnowledgeEntry[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const category = type ? caseTypeOf(type).category : ''

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!title.trim() && !category) { setSuggested([]); return }
      const res = await fetch(`/api/help/articles?q=${encodeURIComponent(title)}&cat=${category}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      setSuggested(((d as { entries?: KnowledgeEntry[] }).entries ?? []).slice(0, 4))
    }, 350)
    return () => clearTimeout(timer)
  }, [title, category])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!forId || !type || !title.trim()) return
    setBusy(true)
    try {
      const form = new FormData()
      form.set('forEmployeeId', forId)
      form.set('type', type)
      form.set('title', title.trim())
      form.set('description', description)
      if (file) form.set('file', file)
      const res = await fetch('/api/help/cases', { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not create the case', (d as { error?: string }).error); return }
      const created = (d as { case: { id: string; label: string } }).case
      toastSuccess(`${created.label} created — a specialist will pick it up`)
      router.push(`/dashboard/help/cases/${created.id}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-10 space-y-5">
        <nav className="text-sm text-slate-600" aria-label="Breadcrumb">
          <Link href="/dashboard/help" className="text-blue-700 underline underline-offset-2">Help Center</Link>
          <span className="mx-2">›</span>
          <span>Create case</span>
        </nav>
        <h1 className="text-3xl font-bold text-slate-900 text-center">Create Case</h1>

        <label className="block max-w-md">
          <span className="block text-sm font-medium text-slate-800 mb-1">Create for <span className="text-red-700">*</span></span>
          {people.length > 1 ? (
            <select className={input} value={forId} onChange={(e) => setForId(e.target.value)} required>
              {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          ) : (
            <input className={`${input} bg-slate-50`} value={people[0]?.fullName ?? ''} readOnly />
          )}
          <span className="block text-xs text-slate-500 mt-1">This person will get every notification about this case.</span>
        </label>

        <label className="block max-w-md">
          <span className="block text-sm font-medium text-slate-800 mb-1">Case type <span className="text-red-700">*</span></span>
          <select className={input} value={type} onChange={(e) => setType(e.target.value)} required>
            <option value="" disabled>Select what it is about…</option>
            {CASE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <span className="block text-xs text-slate-500 mt-1">
            {type ? `Goes to ${serviceTeamLabel(caseTypeOf(type).team)}.` : 'This helps us route your case.'}
            {type === 'CONFIDENTIAL' && ' Only HR can read it — not your manager.'}
          </span>
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-slate-800 mb-1">Case title <span className="text-red-700">*</span></span>
          <input className={input} value={title} maxLength={CASE_TITLE_MAX} required
            onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My payslip shows the wrong fuel allowance" />
          <span className="block text-xs text-slate-500 mt-1">{CASE_TITLE_MAX - title.length} characters remaining</span>
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-slate-800 mb-1">Detailed description</span>
          <textarea className={`${input} min-h-[140px]`} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide as much detail as possible to help speed up resolution" />
        </label>

        <div>
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="text-sm px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">
              {file ? 'Change attachment' : 'Add attachment'}
            </button>
            {file ? (
              <span className="text-sm text-slate-700">
                {file.name}
                <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="ml-2 text-xs underline text-slate-500">Remove</button>
              </span>
            ) : (
              <span className="text-xs text-slate-500">PDF or image, up to 5 MB.</span>
            )}
          </div>
        </div>

        <button type="submit" disabled={busy || !forId || !type || !title.trim()}
          className="text-sm font-semibold px-7 py-2.5 rounded-full bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-40">
          {busy ? 'Creating…' : 'Create case'}
        </button>
      </form>

      <aside className="bg-white border border-slate-200 rounded-2xl p-6 h-fit">
        <h2 className="text-lg font-semibold text-slate-900">Suggested resources</h2>
        <p className="text-xs text-slate-500 mt-0.5">Your answer may already be here.</p>
        {suggested.length === 0 ? (
          <p className="text-sm text-slate-400 mt-4">Pick a case type or start typing a title to see articles that may help.</p>
        ) : (
          <ul className="space-y-3 mt-4">
            {suggested.map((s) => (
              <li key={`${s.kind}:${s.id}`}>
                <Link href={s.href} target="_blank" className="block border border-slate-200 rounded-xl p-4 hover:shadow-sm">
                  <p className="text-[11px] font-semibold text-slate-500">{s.kind === 'POLICY' ? 'Policy' : s.kind === 'GUIDE' ? 'Guide' : 'Article'}</p>
                  <p className="text-base font-semibold text-slate-900 mt-0.5">{s.title}</p>
                  <p className="text-sm text-slate-600 mt-1 line-clamp-2">{s.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
