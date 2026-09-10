/**
 * Job Requisition Workspace — a rail of roles, and one role opened up.
 *
 * The pipeline board answers "where is everybody"; this answers "what is
 * happening on this role". Same candidates, scoped to the requisition, with
 * the stage counts recounted for it and the role's own terms on a second tab.
 *
 * The rail and the panel are both server-rendered and linked by ?req=, so any
 * row here is a URL somebody can send to the manager who is chasing it.
 */
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { ExternalLink, Briefcase } from 'lucide-react'
import { STAGE_COLORS } from './stage-donut'
import { WorkspaceCandidates } from './workspace-candidates'
import type { RequisitionWorkspace, RailItem, WorkspaceDetail } from '@/lib/queries/requisition-workspace'

const STATUS_TONE: Record<string, string> = {
  OPEN: 'bg-emerald-500',
  PAUSED: 'bg-amber-500',
  FILLED: 'bg-slate-400',
  CLOSED: 'bg-slate-300',
}

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME: 'Full time', PART_TIME: 'Part time', INTERNSHIP: 'Internship',
  TRAINEE: 'Trainee', CONTRACT: 'Contract',
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ago(item: RailItem): string {
  const word = item.ageFrom === 'posted' ? 'Posted' : 'Raised'
  if (item.ageDays === 0) return `${word} today`
  return `${word} ${item.ageDays} day${item.ageDays === 1 ? '' : 's'} ago`
}

export function RequisitionWorkspaceView({ data, sub, canAct }: {
  data: RequisitionWorkspace
  /** Which panel tab is open — candidates or the role's own terms. */
  sub: 'candidates' | 'details'
  /**
   * HR and managers. The same expression gates the Knockouts view, and it has
   * to gate this one too: the Inactive tab holds the declined *and* the
   * knocked-out, and the board deliberately shows knocked-out candidates
   * nowhere else. It also decides whether the action bar exists.
   */
  canAct: boolean
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

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* The rail. */}
      <div className="w-full lg:w-72 flex-shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <p className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
          {rail.length} {rail.length === 1 ? 'requisition' : 'requisitions'}
        </p>
        <ul className="max-h-[32rem] overflow-y-auto divide-y divide-slate-50">
          {rail.map((r) => {
            const on = selected?.id === r.id
            return (
              <li key={r.id}>
                <Link
                  href={`/dashboard/recruiting?tab=workspace&req=${r.id}${sub === 'details' ? '&sub=details' : ''}`}
                  className={`block px-4 py-3 border-l-2 transition-colors ${
                    on
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-transparent hover:bg-slate-50/60'
                  }`}
                >
                  <p className={`text-[13px] leading-snug ${on ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                    {r.title}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_TONE[r.status] ?? 'bg-slate-300'}`} />
                    {ago(r)}
                    <span className="text-slate-300">·</span>
                    {r.candidates} {r.candidates === 1 ? 'candidate' : 'candidates'}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {/* The panel. */}
      {selected ? <Panel req={selected} sub={sub} canAct={canAct} /> : (
        <Card className="flex-1 p-8 text-center">
          <p className="text-sm text-slate-500">Pick a requisition.</p>
        </Card>
      )}
    </div>
  )
}

function Panel({ req, sub, canAct }: {
  req: WorkspaceDetail
  sub: 'candidates' | 'details'
  canAct: boolean
}) {
  const base = `/dashboard/recruiting?tab=workspace&req=${req.id}`
  return (
    <Card className="flex-1 min-w-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{req.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <Briefcase className="w-3.5 h-3.5" />
              {TYPE_LABEL[req.type] ?? req.type}
              <span className="text-slate-300">·</span>
              {req.vacancies} {req.vacancies === 1 ? 'vacancy' : 'vacancies'}
              {req.department && (<><span className="text-slate-300">·</span>{req.department}</>)}
              <span className="text-slate-300">·</span>
              <span className="uppercase tracking-wide text-[10px] font-semibold text-slate-600">
                {req.status}
              </span>
            </p>
          </div>
          {req.manpowerFormId && (
            <Link
              href={`/dashboard/recruiting/requisitions/${req.manpowerFormId}`}
              className="text-xs text-slate-500 hover:text-slate-900 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              Open requisition form <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Candidates / Details. */}
      <div className="flex items-center gap-5 px-5 border-b border-slate-100">
        <SubTab href={base} on={sub === 'candidates'}>Candidates</SubTab>
        <SubTab href={`${base}&sub=details`} on={sub === 'details'}>Details</SubTab>
      </div>

      {sub === 'details' ? (
        <div className="p-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 text-[13px]">
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
            <div className="sm:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Justification</p>
              <p className="text-slate-700 mt-1 whitespace-pre-wrap">{req.requestNote}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5">
          {/* The same stage row as the dashboard, recounted for this role. */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-y-3 mb-4">
            {req.stages.map((s) => {
              const zero = s.count === 0
              return (
                <div key={s.key} className="px-1">
                  <p
                    className={`text-xl font-semibold leading-none ${zero ? 'text-slate-300' : 'text-slate-900'}`}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {s.count}
                  </p>
                  <p className={`text-[11px] mt-1 ${zero ? 'text-slate-300' : 'text-slate-600'}`}>
                    {s.label}
                  </p>
                  <span
                    className="block w-2 h-2 rounded-full mt-1.5"
                    style={{ background: zero ? '#e2e8f0' : STAGE_COLORS[s.key] }}
                  />
                </div>
              )
            })}
          </div>

          <WorkspaceCandidates
            active={req.active}
            inactive={canAct ? req.inactive : req.inactive.filter((c) => c.knockoutStatus !== 'FAILED')}
            canAct={canAct}
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
