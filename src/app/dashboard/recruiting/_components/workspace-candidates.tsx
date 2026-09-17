'use client'

/**
 * The applicant list inside the requisition workspace, laid out as the
 * sourcing sheet was: one row a person, the same columns in the same order for
 * every position, and every cell editable where it sits.
 *
 * Name comes first and stays on screen while the columns scroll. Then the
 * candidate, the position's own screening columns, the evaluation, salary and
 * joining, and the interview trail — the backbone every role's sheet shared
 * (src/lib/candidate-tracker.ts) — and the pipeline's own facts at the end.
 * The match grade that used to open the row is the Fit score column now.
 *
 * Filters sit in one bar above the table rather than a column beside it, so
 * the table has the width. Filtering is client-side over the requisition's own
 * candidates, which is right while a busy role is hundreds of rows rather than
 * thousands.
 */

import { useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, X, Loader2, FileText, ExternalLink, Search, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastSuccess, toastError } from '@/components/ui/toaster'
import { STAGE_COLORS } from './stage-donut'
import { ScreeningColumnsDialog } from './screening-columns-dialog'
import { ImportSheetDialog, UploadCvsDialog } from './intake-dialogs'
import Link from 'next/link'
import type { WorkspaceCandidate } from '@/lib/queries/requisition-workspace'
import {
  SCREENING_AFTER, SCREENING_WIDTH, TRACKER_COLUMNS,
  type TrackerColumn, type TrackerKey,
} from '@/lib/candidate-tracker'

/** The one-step-forward path. Nothing here lands on HIRED. */
const NEXT: Record<string, string> = {
  APPLIED: 'SCREENING',
  SCREENING: 'INTERVIEW',
  INTERVIEW: 'OFFER',
}

const STAGE_LABEL: Record<string, string> = {
  APPLIED: 'Applied', SCREENING: 'Screening', INTERVIEW: 'Interview',
  OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected',
}

const SOURCE_LABEL: Record<string, string> = {
  REFERRAL: 'Referral', LINKEDIN: 'LinkedIn', PORTAL: 'Job portal',
  CAREERS_PAGE: 'Careers page', WALK_IN: 'Walk-in', OTHER: 'Other',
  CV_UPLOAD: 'CV upload', SHEET_IMPORT: 'Screening sheet', BULK_UPLOAD: 'CV upload',
}

const DEGREE_LABEL: Record<string, string> = {
  HIGH_SCHOOL: 'High school', DIPLOMA: 'Diploma', BACHELORS: "Bachelor's",
  MASTERS: "Master's", PHD: 'Doctorate',
}
const DEGREE_RANK = ['HIGH_SCHOOL', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PHD']

interface Filters {
  q: string
  stages: string[]
  source: string
  degree: string
  auth: string
  /** Minimum years. 0 means no floor. */
  minExp: number
  /** Only rows sitting longer than this. 0 means no floor. */
  staleDays: number
  remoteOnly: boolean
  poolOnly: boolean
}

const EMPTY: Filters = {
  q: '', stages: [], source: '', degree: '', auth: '',
  minExp: 0, staleDays: 0, remoteOnly: false, poolOnly: false,
}

/** Cells typed here and not yet reflected by a server reload. */
interface LocalEdits {
  tracker: Partial<Record<TrackerKey, string | null>>
  screening: Record<string, string>
}

type Column = { kind: 'tracker'; col: TrackerColumn } | { kind: 'screening'; label: string }

const PIPELINE_HEADS = ['Source', 'Applied', 'In status', 'CV']
const CHECK_W = 40
const NAME_W = 220

export function WorkspaceCandidates({
  requisitionId, active, inactive, screeningColumns, canAct, canEditColumns,
}: {
  requisitionId: string
  active: WorkspaceCandidate[]
  inactive: WorkspaceCandidate[]
  screeningColumns: string[]
  /** HR and managers move candidates and edit cells; everyone else reads. */
  canAct: boolean
  canEditColumns: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'active' | 'inactive'>('active')
  const [f, setF] = useState<Filters>(EMPTY)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [local, setLocal] = useState<Record<string, LocalEdits>>({})
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [intake, setIntake] = useState<null | 'cvs' | 'sheet'>(null)

  const pool = tab === 'active' ? active : inactive

  const cellsOf = (c: WorkspaceCandidate) => ({
    tracker: { ...c.tracker, ...(local[c.id]?.tracker ?? {}) } as Record<TrackerKey, string | null>,
    screening: { ...c.screening, ...(local[c.id]?.screening ?? {}) },
  })

  // Chip counts are of the tab, not of the filtered set — they are what you
  // click to filter, so they cannot depend on the filter.
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of pool) m.set(c.stage, (m.get(c.stage) ?? 0) + 1)
    return m
  }, [pool])

  // Only offer a facet that this requisition's candidates actually populate.
  const facets = useMemo(() => ({
    sources: [...new Set(pool.map((c) => c.source).filter((x): x is string => !!x))].sort(),
    degrees: DEGREE_RANK.filter((d) => pool.some((c) => c.educationLevel === d)),
    auth: [...new Set(pool.map((c) => c.workAuthorization).filter((x): x is string => !!x))].sort(),
  }), [pool])

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return pool.filter((c) => {
      if (q) {
        const hay = [
          c.fullName, ...c.skills,
          ...Object.values({ ...c.tracker, ...(local[c.id]?.tracker ?? {}) }),
          ...Object.values({ ...c.screening, ...(local[c.id]?.screening ?? {}) }),
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (f.stages.length && !f.stages.includes(c.stage)) return false
      if (f.source && c.source !== f.source) return false
      if (f.degree && c.educationLevel !== f.degree) return false
      if (f.auth && c.workAuthorization !== f.auth) return false
      if (f.minExp > 0 && (c.experience ?? 0) < f.minExp) return false
      if (f.staleDays > 0 && c.daysInStatus < f.staleDays) return false
      if (f.remoteOnly && !c.openToRemote) return false
      if (f.poolOnly && !c.inTalentPool) return false
      return true
    })
  }, [pool, f, local])

  // The sheet's order: the backbone, with this position's own columns after Education.
  const columns = useMemo(() => {
    const out: Column[] = []
    for (const col of TRACKER_COLUMNS) {
      out.push({ kind: 'tracker', col })
      if (col.key === SCREENING_AFTER) for (const label of screeningColumns) out.push({ kind: 'screening', label })
    }
    return out
  }, [screeningColumns])

  const groups = useMemo(() => {
    const out: { label: string; span: number }[] = []
    for (const c of columns) {
      const label = c.kind === 'tracker' ? c.col.group : 'Screening — this position'
      const last = out[out.length - 1]
      if (last && last.label === label) last.span++
      else out.push({ label, span: 1 })
    }
    return out
  }, [columns])

  const pickedSet = useMemo(() => new Set(picked), [picked])
  const allPicked = rows.length > 0 && rows.every((r) => pickedSet.has(r.id))
  const dirty = JSON.stringify(f) !== JSON.stringify(EMPTY)
  const nameLeft = canAct ? CHECK_W : 0

  function setFilter(patch: Partial<Filters>) {
    setF((p) => ({ ...p, ...patch }))
    // A tick on a row you can no longer see would act invisibly.
    setPicked([])
  }

  function show(next: 'active' | 'inactive') {
    setTab(next)
    setPicked([])
    setF(EMPTY)
  }

  function toggleStage(key: string) {
    setFilter({ stages: f.stages.includes(key) ? f.stages.filter((x) => x !== key) : [...f.stages, key] })
  }

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  function toggleAll() {
    setPicked(allPicked ? [] : rows.map((r) => r.id))
  }

  async function saveCell(c: WorkspaceCandidate, target: Column, value: string): Promise<boolean> {
    const before = local[c.id]
    setLocal((p) => {
      const cur = p[c.id] ?? { tracker: {}, screening: {} }
      return {
        ...p,
        [c.id]: target.kind === 'tracker'
          ? { ...cur, tracker: { ...cur.tracker, [target.col.key]: value || null } }
          : { ...cur, screening: { ...cur.screening, [target.label]: value } },
      }
    })
    const res = await fetch(`/api/recruiting/candidates/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target.kind === 'tracker'
        ? { fields: { [target.col.key]: value } }
        : { screening: { [target.label]: value } }),
    })
    if (res.ok) return true
    const d = await res.json().catch(() => ({}))
    setLocal((p) => {
      const n = { ...p }
      if (before) n[c.id] = before
      else delete n[c.id]
      return n
    })
    toastError(`Could not save for ${c.fullName}`, d.error ?? res.statusText)
    return false
  }

  async function move(stageFor: (c: WorkspaceCandidate) => string | null, verb: string) {
    const targets = rows.filter((r) => pickedSet.has(r.id))
    const moves = targets
      .map((c) => ({ c, to: stageFor(c) }))
      .filter((m): m is { c: WorkspaceCandidate; to: string } => m.to !== null)

    if (moves.length === 0) {
      toastError(`Nothing to ${verb}`, 'None of the selected candidates can move from where they are.')
      return
    }
    const names = moves.map((m) => m.c.fullName).join(', ')
    if (!confirm(`${verb === 'decline' ? 'Decline' : 'Move forward'} ${moves.length} candidate${moves.length === 1 ? '' : 's'}?\n\n${names}`)) return

    setBusy(verb)
    const failed: string[] = []
    for (const m of moves) {
      const res = await fetch(`/api/recruiting/candidates/${m.c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: m.to }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        failed.push(`${m.c.fullName}: ${d.error ?? res.statusText}`)
      }
    }
    setBusy(null)
    setPicked([])

    const moved = moves.length - failed.length
    if (moved > 0) {
      toastSuccess(
        `${moved} candidate${moved === 1 ? '' : 's'} ${verb === 'decline' ? 'declined' : 'moved forward'}`,
        moves.length > moved ? `${failed.length} did not go through.` : undefined,
      )
    }
    if (failed.length) toastError('Some did not move', failed.join(' · '))
    router.refresh()
  }

  const skipped = rows.filter((r) => pickedSet.has(r.id) && !NEXT[r.stage]).length

  const headCell = 'sticky z-20 bg-slate-50 border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600 align-bottom whitespace-normal'
  const bodyCell = 'border-b border-slate-100 px-3 py-2 align-top bg-white group-hover:bg-slate-50'

  return (
    <div>
      {/* Applicants / Inactive, with the counts in the tab itself. */}
      <div className="flex items-center gap-5 border-b border-slate-200 px-1">
        {(['active', 'inactive'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => show(t)}
            className={`text-sm py-2.5 -mb-px border-b-2 transition-colors ${
              tab === t
                ? 'border-slate-900 text-slate-900 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t === 'active' ? 'Applicants' : 'Inactive'}{' '}
            <span className="text-slate-400">{t === 'active' ? active.length : inactive.length}</span>
          </button>
        ))}
      </div>

      {/* Status chips — click to narrow, click again to clear. */}
      <div className="flex flex-wrap items-center gap-1.5 pt-3">
        {Object.keys(STAGE_LABEL)
          .filter((k) => (stageCounts.get(k) ?? 0) > 0 || f.stages.includes(k))
          .map((k) => {
            const on = f.stages.includes(k)
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleStage(k)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: on ? '#fff' : STAGE_COLORS[k] }} />
                {STAGE_LABEL[k]}
                <span className={on ? 'text-slate-300' : 'text-slate-400'}>{stageCounts.get(k) ?? 0}</span>
              </button>
            )
          })}
      </div>

      {/* The filter bar. */}
      <div className="flex flex-wrap items-center gap-2 py-3">
        <label className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={f.q}
            onChange={(e) => setFilter({ q: e.target.value })}
            placeholder="Search any column"
            aria-label="Search candidates"
            className="w-full h-8 text-xs pl-8 pr-2 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          />
        </label>
        <FilterSelect
          label="Days in status"
          value={String(f.staleDays)}
          onChange={(v) => setFilter({ staleDays: Number(v) })}
          options={[['0', 'Any time in status'], ['2', 'In status 2+ days'], ['7', 'In status 7+ days'], ['14', 'In status 14+ days']]}
        />
        <FilterSelect
          label="Relevant experience"
          value={String(f.minExp)}
          onChange={(v) => setFilter({ minExp: Number(v) })}
          options={[['0', 'Any experience'], ['1', '1+ years'], ['3', '3+ years'], ['5', '5+ years']]}
        />
        {facets.degrees.length > 0 && (
          <FilterSelect
            label="Highest degree"
            value={f.degree}
            onChange={(v) => setFilter({ degree: v })}
            options={[['', 'Any degree'], ...facets.degrees.map((d): [string, string] => [d, DEGREE_LABEL[d] ?? d])]}
          />
        )}
        {facets.sources.length > 0 && (
          <FilterSelect
            label="Source"
            value={f.source}
            onChange={(v) => setFilter({ source: v })}
            options={[['', 'Any source'], ...facets.sources.map((s): [string, string] => [s, SOURCE_LABEL[s] ?? s])]}
          />
        )}
        {facets.auth.length > 0 && (
          <FilterSelect
            label="Authorised to work in"
            value={f.auth}
            onChange={(v) => setFilter({ auth: v })}
            options={[['', 'Work authorisation: any'], ...facets.auth.map((a): [string, string] => [a, a])]}
          />
        )}
        <Toggle label="Open to remote" on={f.remoteOnly} onChange={() => setFilter({ remoteOnly: !f.remoteOnly })} />
        <Toggle label="In the talent pool" on={f.poolOnly} onChange={() => setFilter({ poolOnly: !f.poolOnly })} />
        {dirty && (
          <button
            type="button"
            onClick={() => { setF(EMPTY); setPicked([]) }}
            className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" /> Clear filters
          </button>
        )}
        <span className="ml-auto text-[11px] text-slate-400">{rows.length} of {pool.length} shown</span>
        <Link
          href={`/dashboard/recruiting/jobs/${requisitionId}/candidates`}
          className="inline-flex items-center h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Candidate view
        </Link>
        {canAct && (
          <>
            <Button size="sm" variant="outline" onClick={() => setIntake('cvs')}>Upload CVs</Button>
            <Button size="sm" variant="outline" onClick={() => setIntake('sheet')}>Import screened sheet</Button>
          </>
        )}
        {canEditColumns && (
          <Button size="sm" variant="outline" onClick={() => setColumnsOpen(true)}>
            Edit screening columns
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center border border-slate-100 rounded-lg">
          {pool.length === 0
            ? (tab === 'active'
              ? 'Nobody is in play on this role.'
              : 'Nobody has been declined or knocked out on this role.')
            : 'No candidate matches these filters.'}
        </p>
      ) : (
        <div className="overflow-auto rounded-lg border border-slate-200 max-h-[calc(100vh-17rem)] min-h-[20rem]">
          <table className="min-w-max border-separate border-spacing-0 text-[12px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                {canAct && (
                  <th rowSpan={2} className={`${headCell} top-0 z-30 border-r`} style={{ left: 0, width: CHECK_W, minWidth: CHECK_W }}>
                    <input
                      type="checkbox"
                      checked={allPicked}
                      onChange={toggleAll}
                      aria-label="Select every candidate shown"
                      className="rounded border-slate-300"
                    />
                  </th>
                )}
                <th rowSpan={2} className={`${headCell} top-0 z-30 border-r`} style={{ left: nameLeft, minWidth: NAME_W }}>
                  Name
                </th>
                <th rowSpan={2} className={`${headCell} top-0`} style={{ minWidth: 120 }}>Step</th>
                {groups.map((g, i) => (
                  <th
                    key={`${g.label}-${i}`}
                    colSpan={g.span}
                    className="sticky top-0 z-20 h-8 bg-slate-100 border-b border-l border-slate-200 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
                  >
                    {g.label}
                  </th>
                ))}
                <th
                  colSpan={PIPELINE_HEADS.length}
                  className="sticky top-0 z-20 h-8 bg-slate-100 border-b border-l border-slate-200 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  Pipeline
                </th>
              </tr>
              <tr>
                {columns.map((c) => {
                  const width = c.kind === 'tracker' ? c.col.width : SCREENING_WIDTH
                  const label = c.kind === 'tracker' ? c.col.label : c.label
                  return (
                    <th key={c.kind === 'tracker' ? c.col.key : `s:${c.label}`} className={`${headCell} top-8`} style={{ minWidth: width, maxWidth: width }}>
                      {label}
                    </th>
                  )
                })}
                {PIPELINE_HEADS.map((h) => (
                  <th key={h} className={`${headCell} top-8`} style={{ minWidth: h === 'CV' ? 90 : 110 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const cells = cellsOf(c)
                return (
                  <tr key={c.id} className="group">
                    {canAct && (
                      <td className={`${bodyCell} sticky z-10 border-r`} style={{ left: 0, width: CHECK_W }}>
                        <input
                          type="checkbox"
                          checked={pickedSet.has(c.id)}
                          onChange={() => toggle(c.id)}
                          aria-label={`Select ${c.fullName}`}
                          className="rounded border-slate-300"
                        />
                      </td>
                    )}
                    <td className={`${bodyCell} sticky z-10 border-r`} style={{ left: nameLeft, minWidth: NAME_W, maxWidth: NAME_W }}>
                      <p className="font-medium text-slate-900">{c.fullName}</p>
                      {c.inTalentPool && (
                        <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          Talent pool
                        </span>
                      )}
                      {c.answers.length > 0 && (
                        <details className="mt-1 text-[11px] text-slate-600">
                          <summary className="cursor-pointer text-slate-500 hover:text-slate-900">
                            {c.answers.length} application {c.answers.length === 1 ? 'answer' : 'answers'}
                          </summary>
                          <dl className="mt-1 space-y-1">
                            {c.answers.map((a, i) => (
                              <div key={i}>
                                <dt className="text-slate-400">{a.question}</dt>
                                <dd className="text-slate-700">{a.answer}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                    </td>
                    <td className={`${bodyCell} whitespace-nowrap`}>
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STAGE_COLORS[c.stage] ?? '#94a3b8' }} />
                        {STAGE_LABEL[c.stage] ?? c.stage}
                      </span>
                      {c.knockoutStatus === 'FAILED' && <p className="text-[11px] text-amber-700 mt-0.5">Knocked out</p>}
                    </td>
                    {columns.map((col) => {
                      const isTracker = col.kind === 'tracker'
                      const width = isTracker ? col.col.width : SCREENING_WIDTH
                      const label = isTracker ? col.col.label : col.label
                      const value = isTracker ? cells.tracker[col.col.key] : (cells.screening[col.label] || null)
                      return (
                        <td key={isTracker ? col.col.key : `s:${col.label}`} className={bodyCell} style={{ minWidth: width, maxWidth: width }}>
                          <Cell
                            value={value}
                            label={label}
                            who={c.fullName}
                            width={width}
                            long={isTracker ? col.col.long : true}
                            options={isTracker ? col.col.options : undefined}
                            number={isTracker ? col.col.number : false}
                            editable={canAct}
                            onSave={(v) => saveCell(c, col, v)}
                          />
                        </td>
                      )
                    })}
                    <td className={`${bodyCell} text-slate-600 whitespace-nowrap`}>
                      {c.source ? SOURCE_LABEL[c.source] ?? c.source : '—'}
                    </td>
                    <td className={`${bodyCell} text-slate-600 whitespace-nowrap`}>
                      {new Date(c.appliedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className={`${bodyCell} whitespace-nowrap ${c.daysInStatus > 7 ? 'text-amber-700' : 'text-slate-600'}`}>
                      {c.daysInStatus}d
                    </td>
                    <td className={bodyCell}>
                      {c.cvUrl ? (
                        <a
                          href={c.cvUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5" /> Open CV
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* The action bar, only once something is ticked. */}
      {canAct && picked.length > 0 && (
        <div className="sticky bottom-0 mt-3 flex items-center gap-2 flex-wrap border-t border-slate-200 bg-white/95 backdrop-blur px-3 py-2.5">
          <span className="text-xs text-slate-600 mr-1">{picked.length} selected</span>
          <Button size="sm" disabled={busy !== null} onClick={() => move((c) => NEXT[c.stage] ?? null, 'move')}>
            {busy === 'move' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5 mr-1.5" />}
            Move forward
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => move((c) => (c.stage === 'REJECTED' || c.stage === 'HIRED' ? null : 'REJECTED'), 'decline')}
          >
            {busy === 'decline' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1.5" />}
            Decline
          </Button>
          <button type="button" onClick={() => setPicked([])} className="text-xs text-slate-500 hover:text-slate-900 ml-1">
            Clear selection
          </button>
          {skipped > 0 && (
            <span className="text-[11px] text-slate-400">
              {skipped} of them cannot move forward from where they are.
            </span>
          )}
        </div>
      )}

      {intake === 'cvs' && (
        <UploadCvsDialog
          requisitionId={requisitionId}
          screeningColumns={screeningColumns}
          canEditColumns={canEditColumns}
          onClose={() => setIntake(null)}
        />
      )}
      {intake === 'sheet' && (
        <ImportSheetDialog requisitionId={requisitionId} canEditColumns={canEditColumns} onClose={() => setIntake(null)} />
      )}

      {canEditColumns && columnsOpen && (
        <ScreeningColumnsDialog
          open={columnsOpen}
          onOpenChange={setColumnsOpen}
          requisitionId={requisitionId}
          columns={screeningColumns}
        />
      )}
    </div>
  )
}

/**
 * One cell of the tracker. Shows its text; click it to type, Enter (or leaving
 * the box) saves, Escape puts it back. Long columns open a textarea, where
 * Ctrl+Enter saves.
 */
function Cell({ value, label, who, width, long, options, number, editable, onSave }: {
  value: string | null
  label: string
  who: string
  width: number
  long?: boolean
  options?: string[]
  number?: boolean
  editable: boolean
  onSave: (v: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const done = useRef(false)
  const listId = useId()
  const text = value ?? ''

  function start() {
    done.current = false
    setDraft(text)
    setEditing(true)
  }

  async function commit() {
    if (done.current) return
    done.current = true
    setEditing(false)
    const next = draft.trim()
    if (next !== text) await onSave(next)
  }

  function cancel() {
    done.current = true
    setEditing(false)
  }

  if (editing) {
    const cls = 'w-full rounded border border-slate-400 bg-white px-1.5 py-1 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10'
    if (long) {
      return (
        <textarea
          autoFocus
          rows={4}
          value={draft}
          aria-label={`${label} for ${who}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel()
            else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit()
          }}
          className={cls}
        />
      )
    }
    return (
      <>
        <input
          autoFocus
          type={number ? 'number' : 'text'}
          value={draft}
          list={options ? listId : undefined}
          aria-label={`${label} for ${who}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') cancel()
          }}
          className={cls}
        />
        {options && (
          <datalist id={listId}>
            {options.map((o) => <option key={o} value={o} />)}
          </datalist>
        )}
      </>
    )
  }

  const body = text
    ? <span className={long ? 'line-clamp-2 whitespace-pre-line break-words' : 'block truncate'}>{text}</span>
    : <span className="text-slate-300">—</span>

  if (!editable) {
    return <div title={text || undefined} className="text-slate-700" style={{ maxWidth: width }}>{body}</div>
  }
  return (
    <button
      type="button"
      onClick={start}
      title={text ? `${text}\n\nClick to edit` : `Add ${label.toLowerCase()}`}
      aria-label={text ? `Edit ${label.toLowerCase()} for ${who}` : `Add ${label.toLowerCase()} for ${who}`}
      className="block w-full text-left text-slate-700 rounded px-1 -mx-1 py-0.5 min-h-[1.5rem] hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      style={{ maxWidth: width }}
    >
      {body}
    </button>
  )
}

function FilterSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  const on = options.length > 0 && value !== options[0][0]
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`h-8 rounded-md border px-2 text-xs ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <label className={`h-8 inline-flex items-center gap-1.5 rounded-md border px-2 text-xs cursor-pointer ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
      <input type="checkbox" checked={on} onChange={onChange} className="rounded border-slate-300" />
      {label}
    </label>
  )
}
