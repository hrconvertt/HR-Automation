'use client'

/**
 * Job Requisitions as a board of cards, the way Workable lists jobs.
 *
 * The table it replaces listed what was set up about each role — type,
 * vacancies, JD, filters, form. Those are still here, in a Setup row on each
 * card, but the card leads with what matters day to day: the candidates at
 * each stage, where the job is advertised, and when somebody last applied.
 *
 * Every requisition is on the board — open, waiting, drafts, paused, filled and
 * closed — with a status filter above it. Hiding the finished ones by default
 * left a board of one card whenever only one role was open.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, Search } from 'lucide-react'
import { DecideRequestButtons } from '@/components/recruiting/decide-request-buttons'
import { RequisitionStatusMenu } from '@/components/recruiting/requisition-status-menu'
import { JdReviewButton } from '@/components/recruiting/jd-review-button'
import { KnockoutEditorButton } from '@/components/recruiting/knockout-editor-button'
import { ManpowerFormButton } from '@/components/recruiting/manpower-form-button'
import { JOB_STAGES, humanise } from '@/lib/job-post'
import type { BoardJob } from '@/lib/queries/job-board'

// Waiting on a decision first, then the live roles, then everything else.
const RANK: Record<string, number> = { PENDING: 0, OPEN: 1, PAUSED: 2, DRAFT: 3, FILLED: 4, CLOSED: 5 }

const STATUS_CHIP: Record<string, { label: string; tone: string }> = {
  DRAFT:   { label: 'Draft',                tone: 'bg-slate-100 text-slate-600 border-slate-200' },
  PENDING: { label: 'Waiting for approval', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  OPEN:    { label: 'Open',                 tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  PAUSED:  { label: 'Paused',               tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  FILLED:  { label: 'Filled',               tone: 'bg-sky-50 text-sky-800 border-sky-200' },
  CLOSED:  { label: 'Closed',               tone: 'bg-slate-50 text-slate-500 border-slate-200' },
}

const outlineLink =
  'inline-flex items-center h-9 px-3.5 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50'

function since(iso: string | null): string {
  if (!iso) return 'none yet'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function JobBoard({ jobs, isHR, myEmployeeId }: { jobs: BoardJob[]; isHR: boolean; myEmployeeId: string | null }) {
  const [view, setView] = useState<'jobs' | 'plan'>('jobs')
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [status, setStatus] = useState('')

  const departments = useMemo(
    () => [...new Set(jobs.map((j) => j.department).filter((d): d is string => !!d))].sort(),
    [jobs],
  )
  const countOf = (s: string) => jobs.filter((j) => j.status === s).length
  const awaiting = jobs.filter((j) => j.status === 'PENDING').length

  const needle = q.trim().toLowerCase()
  const shown = jobs
    .filter((j) => !status || j.status === status)
    .filter((j) => !dept || j.department === dept)
    .filter((j) => !needle || j.title.toLowerCase().includes(needle))
    .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-6 border-b border-slate-200">
        {(['jobs', 'plan'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`pb-2 -mb-px border-b-2 text-sm font-semibold uppercase tracking-wide ${view === v ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {v === 'jobs' ? 'Jobs' : 'Hiring plan'}
          </button>
        ))}
      </div>

      {view === 'plan' ? <HiringPlan jobs={jobs} myEmployeeId={myEmployeeId} /> : (<>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Start typing to search jobs…"
            aria-label="Search jobs"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          />
        </label>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          aria-label="Department"
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
        >
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
        >
          <option value="">All statuses ({jobs.length})</option>
          {Object.entries(STATUS_CHIP)
            .filter(([k]) => countOf(k) > 0)
            .map(([k, v]) => <option key={k} value={k}>{v.label} ({countOf(k)})</option>)}
        </select>
      </div>

      <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          <span className="font-semibold text-slate-900">{shown.length}</span> {shown.length === 1 ? 'job' : 'jobs'}
          {awaiting > 0 && <span className="text-amber-800 font-semibold"> · {awaiting} waiting for approval</span>}
        </span>
        {isHR && (
          <span className="inline-flex items-center gap-3 text-[11px] text-slate-400">
            Setup:
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> not started</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> in progress</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> done</span>
          </span>
        )}
      </p>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {jobs.length === 0 ? 'No jobs yet. Click New Job Post to write the first one.' : 'No jobs match these filters.'}
        </div>
      ) : (
        shown.map((j) => <JobCard key={j.id} job={j} isHR={isHR} />)
      )}
      </>)}
    </div>
  )
}

type PlanSort = 'code' | 'manager' | 'owner' | 'plan' | 'status'

function SortHead({ k, on, set, children }: { k: PlanSort; on: PlanSort; set: (k: PlanSort) => void; children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-medium">
      <button type="button" onClick={() => set(k)} className={`inline-flex items-center gap-1 ${on === k ? 'text-slate-900' : ''}`}>
        {children}{on === k ? ' ↓' : ''}
      </button>
    </th>
  )
}

/**
 * The hiring plan: every requisition as a row — who is hiring, who owns it,
 * the salary, when it should be filled, and where it stands — the way
 * Workable lists requisitions under Hiring Plan.
 */
function HiringPlan({ jobs, myEmployeeId }: { jobs: BoardJob[]; myEmployeeId: string | null }) {
  const [filter, setFilter] = useState<'all' | 'mine' | 'approval'>('all')
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<PlanSort>('code')
  const needle = q.trim().toLowerCase()
  const money = (n: number) => n.toLocaleString('en-PK')
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—')
  const owner = (j: BoardJob) => j.requestedBy ?? 'HR'
  const manager = (j: BoardJob) => j.hiringManagers.join(', ') || j.requestedBy || '—'

  const rows = jobs
    .filter((j) => filter === 'all' || (filter === 'mine' ? j.requestedById === myEmployeeId : j.status === 'PENDING'))
    .filter((j) => !needle || `${j.code} ${j.title} ${j.department ?? ''} ${manager(j)}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      if (sortKey === 'code') return a.createdAt.localeCompare(b.createdAt)
      if (sortKey === 'manager') return manager(a).localeCompare(manager(b))
      if (sortKey === 'owner') return owner(a).localeCompare(owner(b))
      if (sortKey === 'plan') return (a.planDate ?? '9').localeCompare(b.planDate ?? '9')
      return (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9)
    })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {([['all', 'All requisitions'], ['mine', 'My requisitions'], ['approval', 'Need approval']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`text-xs px-3 py-1.5 rounded-full border ${filter === k ? 'border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {l}{k === 'approval' ? ` (${jobs.filter((j) => j.status === 'PENDING').length})` : ''}
          </button>
        ))}
        <label className="relative ml-auto w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search requisitions" aria-label="Search requisitions"
            className="w-full h-9 pl-8 pr-2 rounded-md border border-slate-200 text-sm" />
        </label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <SortHead k="code" on={sortKey} set={setSortKey}>Requisition</SortHead>
              <SortHead k="manager" on={sortKey} set={setSortKey}>Hiring manager</SortHead>
              <SortHead k="owner" on={sortKey} set={setSortKey}>Requisition owner</SortHead>
              <th className="text-left px-4 py-2.5 font-medium">Salary</th>
              <SortHead k="plan" on={sortKey} set={setSortKey}>Plan date</SortHead>
              <th className="text-left px-4 py-2.5 font-medium">Candidates</th>
              <SortHead k="status" on={sortKey} set={setSortKey}>Status</SortHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No requisitions match.</td></tr>
            )}
            {rows.map((j) => {
              const chip = STATUS_CHIP[j.status]
              const late = j.planDate && new Date(j.planDate) < new Date() && ['OPEN', 'PENDING', 'PAUSED'].includes(j.status)
              return (
                <tr key={j.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/recruiting/jobs/${j.id}`} className="font-medium text-emerald-800 hover:underline">
                      {j.code} {j.title}
                    </Link>
                    <p className="text-xs text-slate-500">{[j.department, j.isRemote ? 'Remote' : j.location].filter(Boolean).join(' · ') || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{manager(j)}</td>
                  <td className="px-4 py-3 text-slate-700">{owner(j)}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {j.salaryMin || j.salaryMax
                      ? <>{j.salaryCurrency} {money(j.salaryMin ?? 0)}{j.salaryMax ? `–${money(j.salaryMax)}` : ''}<span className="text-slate-400">/month</span></>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${late ? 'text-red-700 font-medium' : 'text-slate-700'}`}>
                    {fmt(j.planDate)}{late ? ' · overdue' : ''}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/recruiting/jobs/${j.id}/candidates`} className="text-slate-700 hover:underline tabular-nums">
                      {j.total} · {j.counts.HIRED ?? 0} of {j.vacancies} hired
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {chip && <span className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border ${chip.tone}`}>{chip.label}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">Plan date is the date applications close. REQ numbers follow the order requisitions were raised; an internal code, where set, is shown instead.</p>
    </div>
  )
}

function JobCard({ job, isHR }: { job: BoardJob; isHR: boolean }) {
  const chip = STATUS_CHIP[job.status]
  const editHref = `/dashboard/recruiting/jobs/${job.id}`
  const published = job.status === 'OPEN' && job.jdStatus === 'POSTED'
  const active = job.total - (job.counts.HIRED ?? 0) - (job.counts.REJECTED ?? 0)
  const meta = [job.department, humanise(job.type), job.isRemote ? 'Remote' : job.location]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <Link href={editHref} className="text-lg font-semibold text-slate-900 hover:underline underline-offset-2">
            {job.title}
          </Link>
          <p className="text-sm text-slate-500 mt-0.5">
            {meta}
            {job.vacancies > 1 && ` · ${job.vacancies} openings`}
            {job.requestedBy && ` · requested by ${job.requestedBy}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {job.status !== 'DRAFT' && job.status !== 'PENDING' && (
            <Link href={`/dashboard/recruiting/jobs/${job.id}/candidates`} className={outlineLink}>View candidates</Link>
          )}
          {job.status === 'DRAFT'
            ? <Link href={editHref} className={outlineLink}>Continue writing</Link>
            : <Link href={`${editHref}?step=find`} className={outlineLink}>Find Candidates</Link>}
          {isHR && job.status === 'PENDING' ? (
            <DecideRequestButtons requisitionId={job.id} title={job.title} />
          ) : isHR && ['OPEN', 'PAUSED', 'CLOSED', 'FILLED'].includes(job.status) ? (
            <RequisitionStatusMenu requisitionId={job.id} status={job.status} title={job.title} />
          ) : chip ? (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${chip.tone}`}>{chip.label}</span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-5 divide-x divide-slate-100 border-y border-slate-100">
        {JOB_STAGES.map((s) => {
          const n = job.counts[s.key] ?? 0
          return (
            <Link
              key={s.key}
              href={`/dashboard/recruiting/jobs/${job.id}/candidates?stage=${s.key}`}
              className="py-3 text-center hover:bg-slate-50"
              aria-label={`${n} ${s.label} — open ${job.title}'s candidates at ${s.label}`}
            >
              <p className={`text-xl tabular-nums ${n ? 'font-semibold text-slate-900' : 'text-slate-300'}`}>{n || '–'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </Link>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 text-xs text-slate-500">
        <p className="inline-flex items-center gap-1.5">
          {published ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Published on your{' '}
              <a href={`/careers/${job.id}`} target="_blank" rel="noreferrer"
                className="font-medium text-slate-800 underline underline-offset-2">careers page</a>
              {job.paidPosts > 0 && <> and {plural(job.paidPosts, 'paid post', 'paid posts')}</>}
            </>
          ) : (
            <>
              <Clock className="w-4 h-4 text-slate-400" />
              {job.status === 'DRAFT'
                ? (job.requestedBy ? 'Draft — only its author and HR can see it' : 'Draft — only HR can see it')
                : job.status === 'PENDING'
                  ? 'Waiting for HR to approve the request'
                  : job.status === 'OPEN'
                    ? (job.authorisedOk ? 'Not on your careers page yet' : `Not published — ${job.authorisedReason}`)
                    : 'Not advertised'}
            </>
          )}
        </p>
        <p>
          Candidates: {job.total} total · {active} active in pipeline
          {job.filteredOut > 0 && ` · ${job.filteredOut} filtered out`}
          {' · '}Last candidate: {since(job.lastCandidateAt)}
        </p>
      </div>

      {/* Drafts too: a new job's requisition form has to be approved before
          it can be published, so the Form button is needed before then. */}
      {isHR && job.status !== 'PENDING' && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-2.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 mr-1">Setup</span>
          <JdReviewButton requisitionId={job.id} title={job.title} jdStatus={job.jdStatus} />
          <KnockoutEditorButton requisitionId={job.id} title={job.title} jdContent={job.jdContent} />
          <ManpowerFormButton
            requisitionId={job.id}
            existingFormId={job.manpowerForm?.id ?? null}
            status={job.manpowerForm?.status ?? null}
          />
        </div>
      )}
    </article>
  )
}
