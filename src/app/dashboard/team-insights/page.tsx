/**
 * Team Insights — the manager's hub for growing their people.
 *
 * Workday calls it the Manager Insights Hub: what needs doing for whom, the
 * latest career activity on each report, and the check-ins coming up. A
 * manager sees their own direct reports. HR and executives see every team,
 * one at a time or all together.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer, seesEveryone } from '@/lib/talent'
import { isFounder } from '@/lib/review-scope'
import { teamInsights, type TeamMember } from '@/lib/queries/team-insights'
import { getInitials } from '@/lib/utils'
import { AddTopicButton } from './_components/add-topic-button'
import { ScheduleCheckIn } from './_components/schedule-check-in'

const ACTIONS_SHOWN = 8

export default async function TeamInsightsPage(
  { searchParams }: { searchParams: Promise<{ manager?: string; actions?: string }> },
) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const everyone = seesEveryone(viewer)
  if (!everyone && viewer.effectiveRole !== 'MANAGER') redirect('/dashboard/performance')
  const sp = await searchParams

  const live = { status: 'ACTIVE', deletedAt: null }

  // HR and executives pick a team; a manager always sees their own.
  let managers: { id: string; fullName: string; reports: number }[] = []
  let managerId: string | null = null
  if (everyone) {
    const heads = await prisma.employee.findMany({
      where: { ...live, directReports: { some: live } },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, _count: { select: { directReports: { where: live } } } },
    })
    managers = heads.map((m) => ({ id: m.id, fullName: m.fullName, reports: m._count.directReports }))
    managerId = sp.manager && managers.some((m) => m.id === sp.manager) ? sp.manager : null
  } else {
    managerId = viewer.employeeId
  }

  const people = everyone || managerId
    ? await prisma.employee.findMany({
        where: { ...live, ...(managerId ? { reportingManagerId: managerId } : {}) },
        orderBy: { fullName: 'asc' },
        select: {
          id: true, fullName: true, designation: true,
          department: { select: { name: true } },
          reportingManager: { select: { fullName: true } },
        },
      })
    : []
  const members: TeamMember[] = people
    .filter((p) => !isFounder(p.designation))
    .map((p) => ({
      id: p.id,
      fullName: p.fullName,
      designation: p.designation,
      department: p.department?.name ?? null,
      managerName: p.reportingManager?.fullName ?? null,
    }))

  const data = await teamInsights(members)

  // Actions are taken by the report's manager or HR. An executive browsing
  // another team reads; an HR admin previewing another role cannot write.
  const canAct = !viewer.isPreviewMode
    && (viewer.actualRole === 'HR_ADMIN' || (!!managerId && managerId === viewer.employeeId))

  const showAll = sp.actions === 'all'
  const actions = showAll ? data.actions : data.actions.slice(0, ACTIONS_SHOWN)
  const teamLabel = !everyone
    ? 'Your direct reports'
    : managerId
      ? `${managers.find((m) => m.id === managerId)?.fullName}'s team`
      : 'Every team'
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    if (managerId && everyone) p.set('manager', managerId)
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Insights</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {teamLabel}: what needs doing for whom, the latest on each person, and the check-ins coming up.
            Open a person to see their skills, interests, development plan, goals and check-ins.
          </p>
        </div>
        {canAct && members.length > 0 && (
          <ScheduleCheckIn people={members.map((m) => ({ id: m.id, fullName: m.fullName }))} />
        )}
      </div>

      {everyone && managers.length > 0 && (
        <nav className="flex flex-wrap gap-2" aria-label="Choose a team">
          <Link
            href="/dashboard/team-insights"
            className={`text-xs px-3 py-1.5 rounded-full border ${!managerId ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
          >
            Every team
          </Link>
          {managers.map((m) => (
            <Link
              key={m.id}
              href={`/dashboard/team-insights?manager=${m.id}`}
              className={`text-xs px-3 py-1.5 rounded-full border ${managerId === m.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
            >
              {m.fullName} · {m.reports}
            </Link>
          ))}
        </nav>
      )}

      {members.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-500">
          {everyone ? 'Nobody in this team.' : 'Nobody reports to you on the org chart yet.'}
        </p>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <Figure label="People" value={data.totals.reports} />
            <Figure label="Check-ins this week" value={data.totals.checkInsThisWeek} />
            <Figure label="Check-ins past their date" value={data.totals.overdueCheckIns} alarm />
            <Figure label="Goals at risk" value={data.totals.goalsAtRisk} alarm />
            <Figure label="Open development items" value={data.totals.openDevelopment} />
            <Figure label="Active mentoring" value={data.totals.activeMentorships} />
          </div>

          {/* 1. What to do next. */}
          <section className="space-y-3">
            <SectionHead
              title={`Suggested actions · ${data.actions.length}`}
              blurb="Worked out from the records: goals at risk, dates missed, check-ins that have not happened, interests with nothing planned."
            />
            {data.actions.length === 0 ? (
              <p className="bg-white border border-slate-200 rounded-xl px-4 py-6 text-sm text-slate-500">
                Nothing to chase right now.
              </p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {actions.map((a) => (
                    <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
                      <Link href={`/dashboard/team-insights/${a.employeeId}`}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline">
                        {a.employeeName}
                      </Link>
                      <p className="text-sm font-semibold text-slate-900 mt-1">{a.title}</p>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-3">{a.detail}</p>
                      <div className="mt-auto pt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 mt-3">
                        {canAct && a.topic && (
                          <AddTopicButton employeeId={a.employeeId} topic={a.topic} onCheckIn={a.topicOnCheckIn} />
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
                {data.actions.length > ACTIONS_SHOWN && (
                  <Link href={`/dashboard/team-insights${qs({ actions: showAll ? undefined : 'all' })}`}
                    className="inline-block text-sm font-medium text-slate-700 underline underline-offset-2">
                    {showAll ? 'Show fewer' : `Show all ${data.actions.length} suggested actions`}
                  </Link>
                )}
              </>
            )}
          </section>

          {/* 2. The latest on each person. */}
          <section className="space-y-3">
            <SectionHead
              title="Latest career activity"
              blurb="The most recent change on each person — a goal, a development item, a check-in, a skill, a job change."
            />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.reports.map((r) => (
                <div key={r.member.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {getInitials(r.member.fullName)}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/dashboard/team-insights/${r.member.id}`}
                        className="text-sm font-semibold text-slate-900 hover:underline truncate block">
                        {r.member.fullName}
                      </Link>
                      <p className="text-xs text-slate-500 truncate">
                        {r.member.designation ?? '—'}
                        {everyone && !managerId && r.member.managerName ? ` · reports to ${r.member.managerName}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 min-h-[52px]">
                    {r.latest ? (
                      <>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-800">{r.latest.label}</p>
                          <p className="text-[11px] text-slate-400 whitespace-nowrap">{r.latest.ago}</p>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{r.latest.detail}</p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">No talent activity recorded yet.</p>
                    )}
                  </div>

                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center border-t border-slate-100 pt-3">
                    <Count label="Skills" value={r.counts.skills} />
                    <Count label="Interests" value={r.counts.interests} />
                    <Count label="Development" value={r.counts.development} />
                    <Count label="Goals" value={r.counts.goals} />
                  </dl>

                  <p className="text-[11px] text-slate-500 mt-3">
                    {r.nextCheckIn ? `Next check-in ${r.nextCheckIn}` : r.lastCheckIn ? `Last check-in ${r.lastCheckIn}` : 'No check-ins yet'}
                    {r.actions > 0 && <span className="text-slate-800 font-medium"> · {r.actions} suggested {r.actions === 1 ? 'action' : 'actions'}</span>}
                  </p>

                  <Link href={`/dashboard/team-insights/${r.member.id}`}
                    className="mt-3 text-sm font-medium text-slate-900 underline underline-offset-2">
                    Open talent page
                  </Link>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Check-ins. */}
          <section className="space-y-3">
            <SectionHead
              title={`Check-ins · ${data.upcoming.length} scheduled`}
              blurb="One-to-ones on the calendar, soonest first. Topics come from suggested actions or are typed in."
            />
            {data.upcoming.length === 0 ? (
              <p className="bg-white border border-slate-200 rounded-xl px-4 py-6 text-sm text-slate-500">
                No check-ins scheduled.
              </p>
            ) : (
              <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {data.upcoming.map((c) => (
                  <li key={c.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900">
                        <span className="font-semibold">{c.employeeName}</span> · {c.scheduledLabel}
                        {c.overdue && (
                          <span className="ml-2 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            Date has passed
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {c.topics.length === 0
                          ? 'No topics yet'
                          : `${c.topics.length} ${c.topics.length === 1 ? 'topic' : 'topics'}: ${c.topics.map((t) => t.title).join(' · ')}`}
                      </p>
                    </div>
                    <Link href={`/dashboard/team-insights/${c.employeeId}?tab=check-ins`}
                      className="text-sm font-medium text-slate-900 underline underline-offset-2 whitespace-nowrap">
                      Open check-in
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function SectionHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="border-b border-slate-200 pb-2">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>
    </div>
  )
}

function Figure({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${alarm && value > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className={`text-base font-semibold tabular-nums ${value ? 'text-slate-900' : 'text-slate-300'}`}>{value}</dd>
      <dt className="text-[10px] text-slate-500">{label}</dt>
    </div>
  )
}
