/**
 * Job Requisition Workspace — one role opened up, picked from a dropdown.
 *
 * The pipeline board answers "where is everybody"; this answers "what is
 * happening on this role". Same candidates, scoped to the requisition, laid
 * out as the sourcing sheet was — one row a person, the same columns in the
 * same order for every position — with the role's own terms on a second tab.
 *
 * The choice of role is in the URL (?req=), so any view here is a link
 * somebody can send to the manager who is chasing it.
 */
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { ExternalLink, Briefcase } from 'lucide-react'
import { WorkspaceCandidates } from './workspace-candidates'
import { RequisitionPicker } from './requisition-picker'
import type { RequisitionWorkspace, WorkspaceDetail } from '@/lib/queries/requisition-workspace'

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME: 'Full time', PART_TIME: 'Part time', INTERNSHIP: 'Internship',
  TRAINEE: 'Trainee', CONTRACT: 'Contract',
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function RequisitionWorkspaceView({ data, sub, canAct, canEditColumns }: {
  data: RequisitionWorkspace
  /** Which panel tab is open — candidates or the role's own terms. */
  sub: 'candidates' | 'details'
  /**
   * HR and managers. The same expression gates the Knockouts view, and it has
   * to gate this one too: the Inactive tab holds the declined *and* the
   * knocked-out, and the board deliberately shows knocked-out candidates
   * nowhere else. It also decides whether cells can be edited.
   */
  canAct: boolean
  /** HR sets each position's own screening columns. */
  canEditColumns: boolean
}) {
  const { rail, selected } = data

  if (rail.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-slate-500">No live requisitions.</p>
        <p className="text-xs text-slate-400 mt-1">
          A role appears here once its request is approved.
        </p>
      </Card>
    )
  }

  return selected ? (
    <Panel req={selected} rail={rail} sub={sub} canAct={canAct} canEditColumns={canEditColumns} />
  ) : (
    <Card className="p-8 text-center">
      <RequisitionPicker rail={rail} selectedId={null} sub={sub} />
    </Card>
  )
}

function Panel({ req, rail, sub, canAct, canEditColumns }: {
  req: WorkspaceDetail
  rail: RequisitionWorkspace['rail']
  sub: 'candidates' | 'details'
  canAct: boolean
  canEditColumns: boolean
}) {
  const base = `/dashboard/recruiting?tab=workspace&req=${req.id}`

  // Knocked-out candidates are not listed for anyone outside HR and managers.
  const inactive = canAct
    ? req.inactive
    : req.inactive.filter((c) => c.knockoutStatus !== 'FAILED')

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <RequisitionPicker rail={rail} selectedId={req.id} sub={sub} />
          {req.manpowerFormId && (
            <Link
              href={`/dashboard/recruiting/requisitions/${req.manpowerFormId}`}
              className="text-xs text-slate-500 hover:text-slate-900 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              Open requisition form <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
        <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
          <Briefcase className="w-3.5 h-3.5" />
          {TYPE_LABEL[req.type] ?? req.type}
          <span className="text-slate-300">·</span>
          {req.vacancies} {req.vacancies === 1 ? 'vacancy' : 'vacancies'}
          {req.department && (<><span className="text-slate-300">·</span>{req.department}</>)}
          <span className="text-slate-300">·</span>
          <span className="uppercase tracking-wide text-[10px] font-semibold text-slate-600">{req.status}</span>
        </p>
      </div>

      {/* Candidates / Details. */}
      <div className="flex items-center gap-5 px-5 border-b border-slate-100">
        <SubTab href={base} on={sub === 'candidates'}>Candidates</SubTab>
        <SubTab href={`${base}&sub=details`} on={sub === 'details'}>Details</SubTab>
      </div>

      {sub === 'details' ? (
        <div className="p-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3 text-[13px]">
          <Row k="Status" v={req.status} />
          <Row k="Employment type" v={TYPE_LABEL[req.type] ?? req.type} />
          <Row k="Vacancies" v={String(req.vacancies)} />
          <Row k="Department" v={req.department ?? '—'} />
          <Row
            k="Minimum experience"
            v={req.minExperienceYears != null ? `${req.minExperienceYears} year${req.minExperienceYears === 1 ? '' : 's'}` : '—'}
          />
          <Row
            k="Salary band"
            v={req.salaryMin || req.salaryMax
              ? `PKR ${(req.salaryMin ?? 0).toLocaleString('en-PK')} – ${(req.salaryMax ?? 0).toLocaleString('en-PK')}`
              : '—'}
          />
          <Row k="Posted" v={fmtDate(req.postedDate)} />
          <Row k="Closing" v={fmtDate(req.closingDate)} />
          <Row k="Job description" v={req.jdStatus ?? 'Not generated'} />
          <Row k="Score threshold" v={`${req.scoreThreshold}%`} />
          <Row k="Raised by" v={req.requestedBy ?? '—'} />
          <Row k="Reason" v={req.requestReason ?? '—'} />
          {req.requestNote && (
            <div className="sm:col-span-2 xl:col-span-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Justification</p>
              <p className="text-slate-700 mt-1 whitespace-pre-wrap">{req.requestNote}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4">
          <WorkspaceCandidates
            // A different role is a different table; nothing carries across.
            key={req.id}
            requisitionId={req.id}
            active={req.active}
            inactive={inactive}
            screeningColumns={req.screeningColumns}
            canAct={canAct}
            canEditColumns={canEditColumns}
          />
        </div>
      )}
    </Card>
  )
}

function SubTab({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`text-sm py-2.5 -mb-px border-b-2 transition-colors ${
        on
          ? 'border-slate-900 text-slate-900 font-medium'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </Link>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-50 pb-2">
      <span className="text-slate-500 text-xs">{k}</span>
      <span className="text-slate-900 text-right">{v}</span>
    </div>
  )
}
