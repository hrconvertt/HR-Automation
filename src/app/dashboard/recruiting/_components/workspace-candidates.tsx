'use client'

/**
 * The candidate table inside the requisition workspace, and the bar that acts
 * on what you tick.
 *
 * Workday's bar carries Move Forward, Decline and Send Message. Two of those
 * are here. Move Forward advances one step and stops at Offer: the step past
 * it creates an Employee record, sends the hire emails and cannot be undone by
 * unticking a box, so it stays where it already is — the explicit hire flow on
 * the candidate card. Send Message is not here at all; candidate email goes
 * through the Email Queue, and a button that quietly sent something from a
 * table would be the wrong place to start.
 */

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, X, Loader2, FileText, ExternalLink } from 'lucide-react'
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

export function WorkspaceCandidates({ active, inactive, canAct }: {
  active: WorkspaceCandidate[]
  inactive: WorkspaceCandidate[]
  /** HR and managers move candidates; everyone else reads the table. */
  canAct: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'active' | 'inactive'>('active')
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const rows = tab === 'active' ? active : inactive
  const pickedSet = useMemo(() => new Set(picked), [picked])
  const allPicked = rows.length > 0 && rows.every((r) => pickedSet.has(r.id))

  function show(next: 'active' | 'inactive') {
    setTab(next)
    // A tick on a row you can no longer see would act invisibly.
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
      {/* Active / Inactive, with the counts Workday puts in the tab itself. */}
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
            {t === 'active' ? 'Active' : 'Inactive'} ({t === 'active' ? active.length : inactive.length})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">
          {tab === 'active'
            ? 'Nobody is in play on this role.'
            : 'Nobody has been declined or knocked out on this role.'}
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
                <Th>Candidate</Th>
                <Th>Step</Th>
                <Th right>Match</Th>
                <Th>Currently</Th>
                <Th>Applied</Th>
                <Th>CV</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
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
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-900">{c.fullName}</p>
                    <p className="text-[11px] text-slate-400">{c.email}</p>
                    {c.inTalentPool && (
                      <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        Talent pool
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
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
                  <td className="px-3 py-2.5 text-right text-slate-700">
                    {c.matchScore != null ? `${Math.round(c.matchScore)}%` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {c.currentRole || c.currentCompany
                      ? [c.currentRole, c.currentCompany].filter(Boolean).join(' · ')
                      : '—'}
                    {c.experience != null && (
                      <span className="text-slate-400"> · {c.experience}y</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                    {new Date(c.appliedAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The action bar, only once something is ticked. */}
      {canAct && picked.length > 0 && (
        <div className="sticky bottom-0 mt-3 flex items-center gap-2 flex-wrap border-t border-slate-200 bg-white/95 backdrop-blur px-3 py-2.5">
          <span className="text-xs text-slate-600 mr-1">
            {picked.length} selected
          </span>
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
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
