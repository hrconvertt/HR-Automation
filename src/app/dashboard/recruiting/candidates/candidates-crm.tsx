'use client'

/**
 * Every candidate, searchable — and, with a job chosen, the ones from other
 * jobs worth resurfacing for it.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { getInitials } from '@/lib/utils'

export interface CrmRow {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  headline: string | null
  pastCompanies: string | null
  education: string | null
  location: string | null
  skills: string[]
  years: number | null
  stage: string
  source: string | null
  createdAt: string
  jobId: string
  jobTitle: string
  department: string | null
  matchScore: number | null
  inTalentPool: boolean
  hasCv: boolean
  haystack: string
  relevance: number
  hits: string[]
}

const STAGE: Record<string, string> = {
  APPLIED: 'Applied', SCREENING: 'Screening', INTERVIEW: 'Interview', OFFER: 'Offer', HIRED: 'Hired',
  REJECTED: 'Disqualified', KNOCKED_OUT: 'Knocked out',
}
const SOURCE: Record<string, string> = {
  CV_UPLOAD: 'CV upload', SHEET_IMPORT: 'screening sheet', BULK_UPLOAD: 'CV upload', RESURFACED: 'resurfaced',
  REFERRAL: 'referral', LINKEDIN: 'LinkedIn', PORTAL: 'job portal', CAREERS_PAGE: 'careers page', WALK_IN: 'walk-in', OTHER: 'other',
}

function ago(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d < 1) return 'today'
  if (d < 31) return `${d} day${d === 1 ? '' : 's'} ago`
  const m = Math.floor(d / 30)
  return m < 12 ? `${m} month${m === 1 ? '' : 's'} ago` : `${Math.floor(m / 12)} year${m >= 24 ? 's' : ''} ago`
}

const sel = 'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800'

export function CandidatesCrm({ rows, jobs, departments, forJob }: {
  rows: CrmRow[]
  jobs: { id: string; title: string; status: string; department: string | null }[]
  departments: string[]
  forJob: { id: string; title: string } | null
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')
  const [dept, setDept] = useState('')
  const [job, setJob] = useState('')
  const [stage, setStage] = useState('')
  const [more, setMore] = useState(false)
  const [source, setSource] = useState('')
  const [since, setSince] = useState(0)
  const [minYears, setMinYears] = useState(0)
  const [minScore, setMinScore] = useState(0)
  const [location, setLocation] = useState('')
  const [poolOnly, setPoolOnly] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [target, setTarget] = useState(forJob?.id ?? '')
  const [busy, setBusy] = useState(false)

  const sources = useMemo(() => [...new Set(rows.map((r) => r.source).filter((s): s is string => !!s))].sort(), [rows])
  const [now] = useState(() => Date.now())

  const shown = rows.filter((r) => {
    if (applied) {
      const terms = applied.toLowerCase().split(/\s+/).filter(Boolean)
      if (!terms.every((t) => r.haystack.includes(t) || (r.email ?? '').toLowerCase().includes(t))) return false
    }
    if (dept && r.department !== dept) return false
    if (job && r.jobId !== job) return false
    if (stage && r.stage !== stage) return false
    if (source && r.source !== source) return false
    if (since && now - new Date(r.createdAt).getTime() > since * 86_400_000) return false
    if (minYears && (r.years ?? -1) < minYears) return false
    if (minScore && (r.matchScore ?? -1) < minScore) return false
    if (location && !(r.location ?? '').toLowerCase().includes(location.toLowerCase())) return false
    if (poolOnly && !r.inTalentPool) return false
    return true
  })
  const visible = shown.slice(0, 300)
  const allPicked = visible.length > 0 && visible.every((r) => picked.includes(r.id))

  async function act(action: 'copy' | 'pool') {
    if (!picked.length) return
    if (action === 'copy' && !target) { toastError('Choose the job to add them to'); return }
    setBusy(true)
    const res = await fetch('/api/recruiting/candidates/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, candidateIds: picked, requisitionId: target }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toastError('Did not go through', d.error ?? res.statusText); return }
    toastSuccess(action === 'copy'
      ? `${d.added} added to ${jobs.find((j) => j.id === target)?.title}${d.skipped ? ` · ${d.skipped} were already on it` : ''}`
      : `${d.updated} added to the talent pool`)
    setPicked([])
    router.refresh()
  }

  const moreCount = [source, since, minYears, minScore, location, poolOnly].filter(Boolean).length

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          {forJob ? <><Sparkles className="w-5 h-5 text-violet-600" /> Resurfaced candidates for {forJob.title}</> : 'Candidates'}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {forJob
            ? `People from earlier hiring whose records mention what ${forJob.title} asks for, best match first. None is on this job yet — tick them and add them; their CV comes with them.`
            : 'Everyone who has applied or been sourced for any job. Search every detail on their records, filter, and act on several at once.'}
        </p>
        {forJob && (
          <Link href="/dashboard/recruiting/candidates" className="text-xs text-slate-500 underline underline-offset-2">Search all candidates instead</Link>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setApplied(q) }} className="flex flex-wrap gap-2">
        <label className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all candidates using keywords — skills, companies, roles, cities"
            aria-label="Search candidates" className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm" />
        </label>
        <Button type="submit">Search</Button>
        {applied && <Button type="button" variant="outline" onClick={() => { setQ(''); setApplied('') }}>Clear search</Button>}
      </form>

      <div className="flex flex-wrap gap-2 items-center">
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={sel} aria-label="Department">
          <option value="">Department</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={job} onChange={(e) => setJob(e.target.value)} className={sel} aria-label="Job">
          <option value="">Job</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.status !== 'OPEN' ? ` (${j.status.toLowerCase()})` : ''}</option>)}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={sel} aria-label="Stage">
          <option value="">Stage</option>
          {Object.entries(STAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button type="button" variant="outline" onClick={() => setMore((v) => !v)}>
          <SlidersHorizontal className="w-4 h-4 mr-1.5" /> More filters{moreCount ? ` (${moreCount})` : ''}
        </Button>
        <span className="ml-auto text-xs text-slate-500">{shown.length} candidate{shown.length === 1 ? '' : 's'}{shown.length > visible.length ? ` · first ${visible.length} shown` : ''}</span>
      </div>

      {more && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm"><span className="block text-xs font-semibold text-slate-600 mb-1">Candidate location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Lahore" className={`${sel} w-full`} /></label>
          <label className="text-sm"><span className="block text-xs font-semibold text-slate-600 mb-1">Source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={`${sel} w-full`}>
              <option value="">Any source</option>
              {sources.map((s) => <option key={s} value={s}>{SOURCE[s] ?? s}</option>)}
            </select></label>
          <div className="text-sm"><span className="block text-xs font-semibold text-slate-600 mb-1">Added</span>
            <div className="flex flex-wrap gap-1.5">
              {[[0, 'Any time'], [30, 'Last 30 days'], [90, 'Last 3 months'], [365, 'Last year']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setSince(v as number)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${since === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200'}`}>{l}</button>
              ))}
            </div></div>
          <div className="text-sm"><span className="block text-xs font-semibold text-slate-600 mb-1">Years of experience</span>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 3, 5, 7].map((v) => (
                <button key={v} type="button" onClick={() => setMinYears(v)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${minYears === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200'}`}>{v ? `${v}+` : 'Any'}</button>
              ))}
            </div></div>
          <div className="text-sm"><span className="block text-xs font-semibold text-slate-600 mb-1">Fit score</span>
            <div className="flex flex-wrap gap-1.5">
              {[0, 50, 70, 85].map((v) => (
                <button key={v} type="button" onClick={() => setMinScore(v)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${minScore === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200'}`}>{v ? `${v}+` : 'Any'}</button>
              ))}
            </div></div>
          <label className="inline-flex items-center gap-2 text-sm self-end">
            <input type="checkbox" checked={poolOnly} onChange={(e) => setPoolOnly(e.target.checked)} /> Only the talent pool
          </label>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <input type="checkbox" checked={allPicked} aria-label="Select every candidate shown"
            onChange={(e) => setPicked(e.target.checked ? visible.map((r) => r.id) : [])} />
          <span className="text-xs font-semibold text-slate-600">Candidate information</span>
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            {forJob ? 'Nobody from earlier hiring mentions what this job asks for.' : 'No candidate matches.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((r) => (
              <li key={r.id} className="grid gap-3 px-4 py-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,280px)] items-start hover:bg-slate-50/60">
                <input type="checkbox" className="mt-3" checked={picked.includes(r.id)} aria-label={`Select ${r.fullName}`}
                  onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} />
                <div className="flex gap-3 min-w-0">
                  <span className="w-11 h-11 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold flex items-center justify-center shrink-0">{getInitials(r.fullName)}</span>
                  <div className="min-w-0">
                    <Link href={`/dashboard/recruiting/jobs/${r.jobId}/candidates?c=${r.id}`} className="font-semibold text-slate-900 hover:underline">{r.fullName}</Link>
                    {r.headline && <p className="text-sm text-slate-700">{r.headline}</p>}
                    {r.pastCompanies && <p className="text-xs text-slate-500 truncate">{r.pastCompanies}</p>}
                    {r.education && <p className="text-xs text-slate-500 truncate">{r.education}</p>}
                    <p className="text-xs text-slate-500">{[r.location, r.years != null ? `${r.years} yrs` : null, r.phone].filter(Boolean).join(' · ')}</p>
                    {(r.skills.length > 0 || r.hits.length > 0) && (
                      <p className="text-xs text-emerald-800 mt-1">
                        {(forJob ? r.hits : r.skills).map((s) => `#${s.replace(/\s+/g, '').toLowerCase()}`).join(' ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-sm">
                  <p className="font-medium text-slate-900">{r.jobTitle}</p>
                  <p className="text-xs text-slate-500">{r.department ?? ''}</p>
                  <p className="text-xs text-slate-600 mt-1">At <strong>{STAGE[r.stage] ?? r.stage}</strong> stage{r.matchScore != null ? ` · fit ${Math.round(r.matchScore)}` : ''}{r.inTalentPool ? ' · talent pool' : ''}</p>
                  <p className="text-xs text-slate-500">via {SOURCE[r.source ?? ''] ?? r.source ?? 'unknown'} · {ago(r.createdAt)}</p>
                  {forJob && <p className="text-xs text-violet-700 mt-1">Relevance {r.relevance} · {r.hits.length} of the job&apos;s terms</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {picked.length > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto max-w-4xl rounded-xl bg-slate-900 text-white shadow-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm">{picked.length} selected</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Job to add them to"
            className="h-9 rounded-md bg-white text-slate-900 px-2 text-sm">
            <option value="">Add to a job…</option>
            {jobs.filter((j) => ['OPEN', 'PAUSED', 'DRAFT'].includes(j.status)).map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <Button size="sm" variant="secondary" disabled={busy || !target} onClick={() => act('copy')}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add to this job'}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('pool')}>Add to talent pool</Button>
          <button type="button" onClick={() => setPicked([])} className="ml-auto text-sm text-white/80 hover:text-white inline-flex items-center gap-1">
            <X className="w-4 h-4" /> Clear selection
          </button>
        </div>
      )}
    </div>
  )
}
