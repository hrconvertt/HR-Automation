/**
 * One person's talent page — Workday's view of a report from the Manager
 * Insights Hub: the counts across the top, then Overview (start a job change,
 * suggested actions, suggested mentors), Development & Interests, Goals and
 * Check-Ins.
 *
 * The person themselves, their manager, HR and executives can open it. Their
 * manager and HR change it; the person can edit their own interests and
 * development items.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  talentViewer, seesEveryone, canSeeTalent, canManageTalent, canEditGrowth,
} from '@/lib/talent'
import { talentProfile } from '@/lib/queries/team-insights'
import { currentCycle, boxFor, AXIS_LABELS, FLIGHT_RISK } from '@/lib/talent-grid'
import { getInitials } from '@/lib/utils'
import { AddTopicButton } from '../_components/add-topic-button'
import { ScheduleCheckIn } from '../_components/schedule-check-in'
import { CheckInList } from '../_components/check-in-list'
import { JobChangeButtons } from '../_components/job-change-buttons'
import { GrowthEditor } from '../_components/growth-editor'
import { MentorPanel } from '../_components/mentor-panel'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'development', label: 'Development & Interests' },
  { key: 'goals', label: 'Goals' },
  { key: 'check-ins', label: 'Check-Ins' },
] as const

const GOAL_STATUS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  COMPLETED: 'Completed',
}

export default async function TalentPage({ params, searchParams }: {
  params: Promise<{ employeeId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const { employeeId } = await params
  const sp = await searchParams
  if (!(await canSeeTalent(viewer, employeeId))) redirect('/dashboard/team-insights')

  const hrView = seesEveryone(viewer)
  const cycle = currentCycle()
  const [p, canManage, canGrow, knownSkills] = await Promise.all([
    talentProfile(employeeId, { cycle, withAssessment: hrView }),
    canManageTalent(viewer, employeeId),
    canEditGrowth(viewer, employeeId),
    prisma.skill.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  if (!p) notFound()

  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : 'overview'
  const first = p.employee.fullName.split(' ')[0]
  const self = viewer.employeeId === employeeId
  const base = `/dashboard/team-insights/${employeeId}`
  const box = p.assessment ? boxFor(p.assessment.performance, p.assessment.potential) : null
  const risk = p.assessment?.flightRisk ? FLIGHT_RISK.find((f) => f.value === p.assessment?.flightRisk) : null

  return (
    <div className="space-y-5">
      <Link href="/dashboard/team-insights" className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-2">
        ← Back to Team Insights
      </Link>

      {/* Header and the counts, as Workday draws them. */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-base font-semibold">
              {getInitials(p.employee.fullName)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{p.employee.fullName}</h1>
              <p className="text-sm text-slate-500">
                {p.employee.designation}
                {p.employee.department ? ` · ${p.employee.department}` : ''}
                {p.employee.manager ? ` · reports to ${p.employee.manager.fullName}` : ''}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{p.employee.employeeCode} · joined {p.employee.joinedLabel}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href={`/dashboard/employees/${employeeId}`}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">
              Open full profile
            </Link>
            <Link href="/dashboard/performance?tab=reviews"
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">
              Open reviews
            </Link>
          </div>
        </div>

        <dl className="flex flex-wrap gap-x-10 gap-y-3 mt-5">
          <CountLink label="Skills" value={p.counts.skills} href={`${base}?tab=development`} />
          <CountLink label="Skill interests" value={p.counts.interests} href={`${base}?tab=development`} />
          <CountLink label="Development items" value={p.counts.development} href={`${base}?tab=development`} />
          <CountLink label="Goals" value={p.counts.goals} href={`${base}?tab=goals`} />
        </dl>

        <nav className="flex gap-1 mt-5 border-b border-slate-200 overflow-x-auto" aria-label="Talent sections">
          {TABS.map((t) => (
            <Link key={t.key} href={`${base}?tab=${t.key}`}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.key
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          {canManage && (
            <section className="space-y-3">
              <Head title="Start job change" blurb="Each opens a request on that type. HR approves it, as with any job change." />
              <JobChangeButtons employeeId={employeeId} />
              {p.jobChanges.length > 0 && (
                <ul className="text-xs text-slate-600 space-y-1">
                  {p.jobChanges.map((j) => (
                    <li key={j.id}>
                      Open request: <span className="font-medium text-slate-900">{j.label}</span>
                      {j.toDesignation ? ` to ${j.toDesignation}` : ''} · effective {j.effectiveLabel} ·{' '}
                      {j.status === 'PENDING_APPROVAL' ? 'waiting on HR' : 'approved, not yet enacted'}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="space-y-3">
            <Head
              title={`Suggested actions for support · ${p.actions.length}`}
              blurb="From the records — nothing here is a guess."
            />
            {p.actions.length === 0 ? (
              <p className="bg-white border border-slate-200 rounded-xl px-4 py-5 text-sm text-slate-500">
                Nothing needs chasing for {first} right now.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {p.actions.map((a) => (
                  <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
                    <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                    <p className="text-xs text-slate-600 mt-1">{a.detail}</p>
                    <div className="mt-auto pt-3 border-t border-slate-100 mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                      {canManage && a.topic && (
                        <AddTopicButton employeeId={employeeId} topic={a.topic} onCheckIn={a.topicOnCheckIn} />
                      )}
                      {a.href && (
                        <Link href={a.href} className="text-sm font-medium text-slate-900 underline underline-offset-2">
                          {a.hrefLabel ?? 'Open'}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <Head
              title={`Mentors for ${first}, based on skill interests`}
              blurb="Colleagues recorded at Strong or Can teach it in something they want to grow in."
            />
            <MentorPanel
              menteeId={employeeId}
              firstName={first}
              suggestions={p.mentorSuggestions}
              mentorships={p.mentorships}
              canManage={canManage}
              hasInterests={p.interests.length > 0}
              viewerIsParty={self && !viewer.isPreviewMode}
            />
          </section>

          {hrView && (
            <section className="space-y-3">
              <Head title={`Talent review · ${cycle}`} blurb="HR and executives only. Set on the Talent Review grid." />
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
                {p.assessment ? (
                  <>
                    <Fact label="Nine-box" value={box ? box.name : 'Not placed'} />
                    <Fact label="Performance"
                      value={p.assessment.performance ? AXIS_LABELS.performance[p.assessment.performance as 1 | 2 | 3] : '—'} />
                    <Fact label="Potential"
                      value={p.assessment.potential ? AXIS_LABELS.potential[p.assessment.potential as 1 | 2 | 3] : '—'} />
                    <Fact label="Flight risk" value={risk?.label ?? '—'} />
                    {p.assessment.successorFor && <Fact label="Cover for" value={p.assessment.successorFor} />}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Not assessed this cycle.</p>
                )}
                <Link href="/dashboard/performance/talent"
                  className="ml-auto text-sm font-medium text-slate-900 underline underline-offset-2">
                  Open Talent Review
                </Link>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <Head title="Latest career activity" blurb="Everything recorded about their growth, newest first." />
            {p.activity.length === 0 ? (
              <p className="bg-white border border-slate-200 rounded-xl px-4 py-5 text-sm text-slate-500">Nothing recorded yet.</p>
            ) : (
              <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {p.activity.map((a, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{a.label}</p>
                      <p className="text-xs text-slate-600 truncate">{a.detail}</p>
                    </div>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">{a.ago}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'development' && (
        <GrowthEditor
          employeeId={employeeId}
          firstName={first}
          canEdit={canGrow}
          skills={p.skills}
          interests={p.interests}
          development={p.development}
          knownSkills={knownSkills}
        />
      )}

      {tab === 'goals' && (
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <Head title={`Goals · ${p.goals.length}`} blurb="Goals are set and scored in Performance. Mark one At risk there and it shows up here as a suggested action." />
            <Link href="/dashboard/performance?tab=goals"
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 whitespace-nowrap">
              Manage goals in Performance
            </Link>
          </div>
          {p.goals.length === 0 ? (
            <p className="bg-white border border-slate-200 rounded-xl px-4 py-6 text-sm text-slate-500 text-center">No goals set.</p>
          ) : (
            <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {p.goals.map((g) => (
                <li key={g.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900">{g.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {g.goalId}{g.target ? ` · target ${g.target}` : ''}{g.kpi ? ` · ${g.kpi}` : ''} · updated {g.updatedLabel.toLowerCase()}
                    </p>
                  </div>
                  <span className={`text-xs whitespace-nowrap ${g.status === 'AT_RISK' ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>
                    {GOAL_STATUS[g.status] ?? g.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'check-ins' && (
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <Head title="Check-Ins" blurb={`One-to-ones with ${first}: what is on the next one, and what was said at the last.`} />
            {canManage && <ScheduleCheckIn presetEmployeeId={employeeId} />}
          </div>
          <CheckInList employeeId={employeeId} checkIns={p.checkIns} canManage={canManage} />
        </section>
      )}
    </div>
  )
}

function Head({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>
    </div>
  )
}

function CountLink({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd>
        <Link href={href} className="text-lg font-semibold text-slate-900 underline underline-offset-2 tabular-nums">
          {value}
        </Link>
      </dd>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}
