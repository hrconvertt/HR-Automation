'use client'

/**
 * The applicant list inside the requisition workspace: a filter rail, the
 * status chips, the table, and the bar that acts on what you tick.
 *
 * Shaped after HiredScore's req view. Every filter here runs against a column
 * this system actually has. Three of theirs do not exist and are not faked:
 *
 *   Distance          needs a geocoded candidate address and a geocoded office;
 *                     there is neither, and a mileage filter that guessed would
 *                     be worse than none.
 *   Sponsorship       no field records whether somebody would need it.
 *   Time in current role  never captured at intake. "Days in status" is here
 *                     instead, which is a different fact and labelled as one.
 *
 * The grade is our own match score banded, not HiredScore's model, so the
 * number sits next to the letter rather than behind it.
 *
 * Filtering is client-side over the requisition's own candidates, which is the
 * right call while a busy role is tens of rows rather than thousands.
 */

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, X, Loader2, FileText, ExternalLink, Search, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastSuccess, toastError } from '@/components/ui/toaster'
import { STAGE_COLORS } from './stage-donut'
import type { WorkspaceCandidate } from '@/lib/queries/requisition-workspace'

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
}

const DEGREE_LABEL: Record<string, string> = {
  HIGH_SCHOOL: 'High school', DIPLOMA: 'Diploma', BACHELORS: "Bachelor's",
  MASTERS: "Master's", PHD: 'Doctorate',
}
/** Lowest to highest, so "this degree or better" means something. */
const DEGREE_RANK = ['HIGH_SCHOOL', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PHD']

/**
 * The match score, banded. A letter is what you scan a column for; the number
 * stays beside it because the letter is our banding of our own score and
 * should not be mistaken for a model's verdict.
 */
function grade(score: number | null): { letter: string; ink: string } {
  if (score == null) return { letter: '—', ink: 'text-slate-300' }
  if (score >= 80) return { letter: 'A', ink: 'text-slate-900' }
  if (score >= 65) return { letter: 'B', ink: 'text-slate-700' }
  if (score >= 50) return { letter: 'C', ink: 'text-slate-500' }
  return { letter: 'D', ink: 'text-slate-400' }
}

interface Filters {
  q: string
  sources: string[]
  stages: string[]
  degrees: string[]
  auth: string[]
  /** Minimum years. 0 means no floor. */
  minExp: number
  /** Only rows sitting longer than this. 0 means no floor. */
  staleDays: number
  remoteOnly: boolean
  poolOnly: boolean
}

const EMPTY: Filters = {
  q: '', sources: [], stages: [], degrees: [], auth: [],
  minExp: 0, staleDays: 0, remoteOnly: false, poolOnly: false,
}

export function WorkspaceCandidates({ active, inactive, canAct }: {
  active: WorkspaceCandidate[]
  inactive: WorkspaceCandidate[]
  /** HR and managers move candidates; everyone else reads the table. */
  canAct: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'active' | 'inactive'>('active')
  const [f, setF] = useState<Filters>(EMPTY)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const pool = tab === 'active' ? active : inactive

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
          c.fullName, c.email, c.currentRole, c.currentCompany, c.location, ...c.skills,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (f.stages.length && !f.stages.includes(c.stage)) return false
      if (f.sources.length && !(c.source && f.sources.includes(c.source))) return false
      if (f.degrees.length && !(c.educationLevel && f.degrees.includes(c.educationLevel))) return false
      if (f.auth.length && !(c.workAuthorization && f.auth.includes(c.workAuthorization))) return false
      if (f.minExp > 0 && (c.experience ?? 0) < f.minExp) return false
      if (f.staleDays > 0 && c.daysInStatus < f.staleDays) return false
      if (f.remoteOnly && !c.openToRemote) return false
      if (f.poolOnly && !c.inTalentPool) return false
      return true
    })
  }, [pool, f])

  const pickedSet = useMemo(() => new Set(picked), [picked])
  const allPicked = rows.length > 0 && rows.every((r) => pickedSet.has(r.id))
  const dirty = JSON.stringify(f) !== JSON.stringify(EMPTY)

  function show(next: 'active' | 'inactive') {
    setTab(next)
    // A tick on a row you can no longer see would act invisibly.
    setPicked([])
    setF(EMPTY)
  }

  function toggleStage(key: string) {
    setF((p) => ({
      ...p,
      stages: p.stages.includes(key) ? p.stages.filter((x) => x !== key) : [...p.stages, key],
    }))
    setPicked([])
  }

  function toggleIn(field: 'sources' | 'degrees' | 'auth', v: string) {
    setF((p) => ({
      ...p,
      [field]: p[field].includes(v) ? p[field].filter((x) => x !== v) : [...p[field], v],
    }))
    setPicked([])
  }

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  function toggleAll() {
    setPicked(allPicked ? [] : rows.map((r) => r.id))
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
            <span className="text-slate-400">
              {t === 'active' ? active.length : inactive.length}
            </span>
          </button>
        ))}
      </div>

      {/* Status chips — click to narrow, click again to clear. */}
      <div className="flex flex-wrap items-center gap-1.5 py-3">
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
                  on
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: on ? '#fff' : STAGE_COLORS[k] }}
                />
                {STAGE_LABEL[k]}
                <span className={on ? 'text-slate-300' : 'text-slate-400'}>
                  {stageCounts.get(k) ?? 0}
                </span>
              </button>
            )
          })}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* The filter rail. */}
        <div className="w-full lg:w-56 flex-shrink-0 rounded-lg border border-slate-200 divide-y divide-slate-100">
          <div className="p-2.5">
            <label className="relative block">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={f.q}
                onChange={(e) => { setF((p) => ({ ...p, q: e.target.value })); setPicked([]) }}
                placeholder="Name, company, skill"
                aria-label="Search candidates"
                className="w-full text-xs pl-8 pr-2 py-1.5 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              />
            </label>
          </div>

          {facets.sources.length > 0 && (
            <Section label="Type">
              {facets.sources.map((s) => (
                <Check
                  key={s}
                  label={SOURCE_LABEL[s] ?? s}
                  on={f.sources.includes(s)}
                  onChange={() => toggleIn('sources', s)}
                />
              ))}
            </Section>
          )}

          <Section label="Days in status">
            {[0, 2, 7, 14].map((d) => (
              <Radio
                key={d}
                name="stale"
                label={d === 0 ? 'Any' : `More than ${d} days`}
                on={f.staleDays === d}
                onChange={() => { setF((p) => ({ ...p, staleDays: d })); setPicked([]) }}
              />
            ))}
          </Section>

          <Section label="Relevant experience">
            {[0, 1, 3, 5].map((y) => (
              <Radio
                key={y}
                name="exp"
                label={y === 0 ? 'Any' : `${y}+ years`}
                on={f.minExp === y}
                onChange={() => { setF((p) => ({ ...p, minExp: y })); setPicked([]) }}
              />
            ))}
          </Section>

          {facets.degrees.length > 0 && (
            <Section label="Highest degree">
              {facets.degrees.map((d) => (
                <Check
                  key={d}
                  label={DEGREE_LABEL[d] ?? d}
                  on={f.degrees.includes(d)}
                  onChange={() => toggleIn('degrees', d)}
                />
              ))}
            </Section>
          )}

          {facets.auth.length > 0 && (
            <Section label="Authorised to work in">
              {facets.auth.map((a) => (
                <Check
                  key={a}
                  label={a}
                  on={f.auth.includes(a)}
                  onChange={() => toggleIn('auth', a)}
                />
              ))}
            </Section>
          )}

          <Section label="Other">
            <Check
              label="Open to remote"
              on={f.remoteOnly}
              onChange={() => { setF((p) => ({ ...p, remoteOnly: !p.remoteOnly })); setPicked([]) }}
            />
            <Check
              label="In the talent pool"
              on={f.poolOnly}
              onChange={() => { setF((p) => ({ ...p, poolOnly: !p.poolOnly })); setPicked([]) }}
            />
          </Section>

          {dirty && (
            <button
              type="button"
              onClick={() => { setF(EMPTY); setPicked([]) }}
              className="w-full px-3 py-2 text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>

        {/* The table. */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-400 mb-1.5">
            {rows.length} of {pool.length} shown
          </p>

          {rows.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center border border-slate-100 rounded-lg">
              {pool.length === 0
                ? (tab === 'active'
                  ? 'Nobody is in play on this role.'
                  : 'Nobody has been declined or knocked out on this role.')
                : 'No candidate matches these filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[12px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead className="text-slate-600">
                  <tr className="border-b border-slate-100">
                    {canAct && (
                      <th className="px-3 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={allPicked}
                          onChange={toggleAll}
                          aria-label="Select every candidate shown"
                          className="rounded border-slate-300"
                        />
                      </th>
                    )}
                    <Th>Match</Th>
                    <Th>Candidate</Th>
                    <Th>Type</Th>
                    <Th>Step</Th>
                    <Th>Current / last job</Th>
                    <Th right>Exp.</Th>
                    <Th>Degree</Th>
                    <Th>Location</Th>
                    <Th>Applied</Th>
                    <Th right>In status</Th>
                    <Th>CV</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const g = grade(c.matchScore)
                    return (
                      <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                        {canAct && (
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={pickedSet.has(c.id)}
                              onChange={() => toggle(c.id)}
                              aria-label={`Select ${c.fullName}`}
                              className="rounded border-slate-300"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-sm font-bold ${g.ink}`}>{g.letter}</span>
                          {c.matchScore != null && (
                            <span className="text-slate-400 text-[11px] ml-1.5">
                              {Math.round(c.matchScore)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-900">{c.fullName}</p>
                          <p className="text-[11px] text-slate-400">{c.email}</p>
                          {c.inTalentPool && (
                            <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              Talent pool
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                          {c.source ? SOURCE_LABEL[c.source] ?? c.source : '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 text-slate-700">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: STAGE_COLORS[c.stage] ?? '#94a3b8' }}
                            />
                            {STAGE_LABEL[c.stage] ?? c.stage}
                          </span>
                          {c.knockoutStatus === 'FAILED' && (
                            <p className="text-[11px] text-amber-700 mt-0.5">Knocked out</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {c.currentRole || c.currentCompany
                            ? (
                              <>
                                <p>{c.currentRole ?? '—'}</p>
                                {c.currentCompany && (
                                  <p className="text-[11px] text-slate-400">{c.currentCompany}</p>
                                )}
                              </>
                            )
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap">
                          {c.experience != null ? `${c.experience}y` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                          {c.educationLevel ? DEGREE_LABEL[c.educationLevel] ?? c.educationLevel : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {c.location ?? '—'}
                          {c.openToRemote && (
                            <span className="text-[11px] text-slate-400"> · remote ok</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                          {new Date(c.appliedAt).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </td>
                        <td className={`px-3 py-2.5 text-right whitespace-nowrap ${c.daysInStatus > 7 ? 'text-amber-700' : 'text-slate-600'}`}>
                          {c.daysInStatus}d
                        </td>
                        <td className="px-3 py-2.5">
                          {c.cvUrl ? (
                            <a
                              href={c.cvUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline"
                            >
                              <FileText className="w-3.5 h-3.5" /> Open
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
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => move((c) => NEXT[c.stage] ?? null, 'move')}
              >
                {busy === 'move'
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <ArrowRight className="w-3.5 h-3.5 mr-1.5" />}
                Move forward
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => move((c) => (c.stage === 'REJECTED' ? null : 'REJECTED'), 'decline')}
              >
                {busy === 'decline'
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <X className="w-3.5 h-3.5 mr-1.5" />}
                Decline
              </Button>
              <button
                type="button"
                onClick={() => setPicked([])}
                className="text-xs text-slate-500 hover:text-slate-900 ml-1"
              >
                Clear
              </button>
              {skipped > 0 && (
                <span className="text-[11px] text-slate-400 ml-auto">
                  {skipped} at Offer or beyond — hiring is done on the candidate, not here.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details open className="group">
      <summary className="px-3 py-2 text-xs font-medium text-slate-700 cursor-pointer list-none flex items-center justify-between">
        {label}
        <span className="text-slate-400 text-[10px] group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-3 pb-2.5 space-y-1.5">{children}</div>
    </details>
  )
}

function Check({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
      <input type="checkbox" checked={on} onChange={onChange} className="rounded border-slate-300" />
      {label}
    </label>
  )
}

function Radio({ name, label, on, onChange }: {
  name: string; label: string; on: boolean; onChange: () => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
      <input type="radio" name={name} checked={on} onChange={onChange} className="border-slate-300" />
      {label}
    </label>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
