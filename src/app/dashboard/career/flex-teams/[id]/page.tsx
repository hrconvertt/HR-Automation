/**
 * One flex team: the details Workday lists (start and end, availability,
 * location, type), what it is, the skills it uses, the host, who is on it and
 * who asked. The host, its creator and HR accept people and set the status;
 * a manager can share it with a report.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { flexTeamOwner } from '@/lib/flex-teams'
import { workModeLabel, FLEX_STATUS_LABEL, type FlexStatus } from '@/lib/talent-labels'
import { ShareSuggestion } from '@/components/talent/share-suggestion'
import { bannerFor } from '../../_components/flex-card'
import { FlexInterestButton } from '../../_components/career-actions'
import { FlexMemberActions, FlexOwnerControls } from '../../_components/flex-team-admin'

const day = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export default async function FlexTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const { id } = await params
  const team = await prisma.flexTeam.findUnique({
    where: { id },
    select: {
      id: true, title: true, category: true, description: true, location: true, workMode: true,
      hoursPerWeek: true, startDate: true, endDate: true, spots: true, status: true,
      host: { select: { id: true, fullName: true, designation: true, email: true } },
      skills: { select: { skill: { select: { id: true, name: true } } } },
      members: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, createdAt: true, employee: { select: { id: true, fullName: true, designation: true } } },
      },
    },
  })
  if (!team) notFound()
  const { may } = await flexTeamOwner(viewer, id)
  const mine = team.members.find((m) => m.employee.id === viewer.employeeId)?.status ?? null
  const reports = viewer.employeeId && !viewer.isPreviewMode
    ? await prisma.employee.findMany({
        where: { reportingManagerId: viewer.employeeId, status: 'ACTIVE', deletedAt: null },
        orderBy: { fullName: 'asc' }, select: { id: true, fullName: true },
      })
    : []
  const members = team.members.filter((m) => m.status === 'MEMBER')
  const asked = team.members.filter((m) => m.status === 'INTERESTED')

  return (
    <div className="space-y-5">
      <Link href="/dashboard/career/flex-teams" className="text-sm text-slate-600 underline underline-offset-2">← Flex Teams</Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className={`h-28 bg-gradient-to-br ${bannerFor(team.title)}`} />
            <div className="p-5">
              <h1 className="text-xl font-bold text-slate-900">{team.title}</h1>
              <p className="text-sm text-slate-500">{team.category ?? 'No category'} · {FLEX_STATUS_LABEL[team.status as FlexStatus] ?? team.status}</p>
              {team.description && <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{team.description}</p>}
              {team.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {team.skills.map((s) => <span key={s.skill.id} className="text-[12px] px-2 py-0.5 rounded bg-slate-100 text-slate-800">{s.skill.name}</span>)}
                </div>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 pt-4 border-t border-slate-100">
                <FlexInterestButton teamId={team.id} status={mine} open={team.status === 'OPEN'} />
                {reports.length > 0 && (
                  <ShareSuggestion kind="FLEX_TEAM" refId={team.id} what={`the flex team "${team.title}"`} people={reports}
                    defaultMessage={`I found this flex team that might help you develop in your career. If it's a good fit, reach out to ${team.host?.fullName.split(' ')[0] ?? 'the host'} or express interest in the team.`} />
                )}
                {team.host?.email && (
                  <a href={`mailto:${team.host.email}`} className="text-sm font-medium text-slate-900 underline underline-offset-2">Email the host</a>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900">On the team · {members.length}{team.spots ? ` of ${team.spots}` : ''}</h2>
            {members.length === 0 ? <p className="text-sm text-slate-400 mt-2">Nobody yet.</p> : (
              <ul className="mt-2 divide-y divide-slate-100">
                {members.map((m) => (
                  <li key={m.id} className="py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-900">{m.employee.fullName} <span className="text-xs text-slate-500">· {m.employee.designation}</span></span>
                    {may && <FlexMemberActions teamId={team.id} memberId={m.id} status={m.status} name={m.employee.fullName} />}
                  </li>
                ))}
              </ul>
            )}
            {may && (
              <>
                <h2 className="text-sm font-semibold text-slate-900 mt-5">Asked to join · {asked.length}</h2>
                {asked.length === 0 ? <p className="text-sm text-slate-400 mt-2">Nobody waiting.</p> : (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {asked.map((m) => (
                      <li key={m.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-sm text-slate-900">{m.employee.fullName} <span className="text-xs text-slate-500">· asked {day(m.createdAt)}</span></span>
                        <FlexMemberActions teamId={team.id} memberId={m.id} status={m.status} name={m.employee.fullName} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>

        <aside className="bg-white border border-slate-200 rounded-xl p-5 h-fit space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Details</h2>
          <dl className="space-y-3 text-sm">
            <Detail label="Start date" value={day(team.startDate)} />
            <Detail label="End date" value={day(team.endDate)} />
            <Detail label="Availability" value={team.hoursPerWeek ?? '—'} />
            <Detail label="Location" value={team.location || 'No location'} />
            <Detail label="Flex team type" value={workModeLabel(team.workMode)} />
            <Detail label="Host" value={team.host ? `${team.host.fullName}${team.host.designation ? ` · ${team.host.designation}` : ''}` : '—'} />
          </dl>
          {may && <div className="pt-3 border-t border-slate-100"><FlexOwnerControls teamId={team.id} status={team.status} /></div>}
        </aside>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-700">{label}</dt>
      <dd className="text-slate-600">{value}</dd>
    </div>
  )
}
