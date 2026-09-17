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

export function JobBoard({ jobs, isHR }: { jobs: BoardJob[]; isHR: boolean }) {
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
