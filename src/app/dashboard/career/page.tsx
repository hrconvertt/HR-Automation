/**
 * Career Hub — Suggestions for You. Everyone's own.
 *
 * Workday's Career Hub: your skill interests and skills across the top, what
 * your manager has suggested (with their message), mentors worth meeting,
 * flex teams that fit, people to know, and the roles you could grow into.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { careerHub } from '@/lib/queries/career'
import { mentorshipTypeLabel, skillLevelLabel } from '@/lib/talent-labels'
import { getInitials } from '@/lib/utils'
import { FlexCard } from './_components/flex-card'
import { DismissSuggestion, MentorDecision } from './_components/career-actions'

export default async function CareerHubPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!viewer.employeeId) {
    return <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">
      Your login is not linked to an employee record, so there is no career profile to show.
    </p>
  }
  const hub = await careerHub(viewer.employeeId)
  if (!hub) redirect('/dashboard')

  const contactIds = [...new Set([
    ...hub.mentors.map((m) => m.id),
    ...hub.connections.map((c) => c.id),
    ...hub.proposedMentors.map((m) => m.mentor.id),
  ])]
  const emails = new Map((contactIds.length
    ? await prisma.employee.findMany({ where: { id: { in: contactIds } }, select: { id: true, email: true } })
    : []).map((e) => [e.id, e.email]))
  const mail = (id: string, name: string) => emails.get(id)
    ? <a href={`mailto:${emails.get(id)}`} className="text-sm font-medium text-slate-900 underline underline-offset-2">Email {name.split(' ')[0]}</a>
    : null
  const me = viewer.employeeId

  return (
    <div className="space-y-6">
      {/* The profile strip. */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 grid gap-5 lg:grid-cols-[240px_1fr]">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{hub.employee.fullName}</h1>
          <p className="text-sm text-slate-500">{hub.employee.designation}</p>
          <p className="text-xs text-slate-400 mt-0.5">{hub.employee.department?.name ?? ''}</p>
          <Link href={`/dashboard/team-insights/${me}?tab=development`}
            className="inline-block mt-3 text-sm font-medium text-slate-900 underline underline-offset-2">
            Edit interests and skills
          </Link>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Skill interests ({hub.interests.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {hub.interests.length === 0 && <span className="text-xs text-slate-400">None yet — add what you want to grow into, and the rest of this page fills in.</span>}
              {hub.interests.map((i) => <span key={i.id} className="text-[12px] px-2 py-0.5 rounded bg-slate-100 text-slate-800">{i.name}</span>)}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Skills ({hub.skills.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {hub.skills.length === 0 && <span className="text-xs text-slate-400">None recorded.</span>}
              {hub.skills.map((s) => (
                <span key={s.id} className="text-[12px] px-2 py-0.5 rounded border border-slate-300 text-slate-700">
                  {s.name} <span className="text-slate-400">· {skillLevelLabel(s.level)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* From the manager. */}
      <section className="space-y-3">
        <Head title="Suggestions from your manager" blurb="What your manager or HR pointed you to, with what they said." />
        {hub.suggestions.length === 0 && hub.proposedMentors.length === 0 ? (
          <Empty>Nothing yet. When your manager shares a flex team, a mentor or someone to meet, it shows here.</Empty>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {hub.proposedMentors.map((m) => (
              <Suggestion key={m.id} kindLabel={mentorshipTypeLabel(m.type)} title={`Mentor: ${m.mentor.fullName}`}
                lines={[m.mentor.designation ?? '', m.skillName ? `For ${m.skillName}` : '']}
                message={m.message} from="Your manager"
                actions={<>{mail(m.mentor.id, m.mentor.fullName)}<MentorDecision id={m.id} /></>} />
            ))}
            {hub.suggestions.map((s) => (
              <Suggestion key={s.id}
                kindLabel={s.kind === 'FLEX_TEAM' ? 'Flex team' : s.kind === 'CONNECTION' ? 'Someone to meet' : 'A role to aim for'}
                title={s.team?.title ?? s.person?.fullName ?? s.role ?? ''}
                lines={s.team
                  ? [s.team.matches ? `Matches ${s.team.matches} of your skill interests` : '', s.team.category ?? '', s.team.location || 'No location specified']
                  : s.person ? [s.person.designation ?? ''] : ['Plan the route to it in the Career Path Builder']}
                message={s.message} from={s.from}
                actions={<>
                  {s.team && <Link href={`/dashboard/career/flex-teams/${s.team.id}`} className="text-sm font-medium text-slate-900 underline underline-offset-2">View flex team</Link>}
                  {s.person && <a href={`mailto:${s.person.email}`} className="text-sm font-medium text-slate-900 underline underline-offset-2">Email {s.person.fullName.split(' ')[0]}</a>}
                  {s.role && <Link href="/dashboard/career/path" className="text-sm font-medium text-slate-900 underline underline-offset-2">Open Career Path Builder</Link>}
                  <DismissSuggestion id={s.id} />
                </>} />
            ))}
          </div>
        )}
      </section>

      {/* Networking. */}
      <section className="space-y-3">
        <Head title="Networking — meet an available mentor" blurb="Colleagues recorded as strong in something you want to grow in." />
        {hub.mentors.length === 0 ? (
          <Empty>{hub.interests.length === 0 ? 'Add a skill interest to see mentors.' : 'Nobody is recorded as strong in your interests yet.'}</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {hub.mentors.map((m) => (
              <Person key={m.id} name={m.fullName} sub={m.designation ?? ''}
                lines={[m.department ?? '', `Can help with ${m.matched.map((x) => x.name).join(', ')}`]}
                actions={mail(m.id, m.fullName)} />
            ))}
          </div>
        )}
        {hub.activeMentoring.length > 0 && (
          <p className="text-xs text-slate-600">
            Mentoring now: {hub.activeMentoring.map((m) => `${m.role === 'MENTEE' ? 'mentored by' : 'mentoring'} ${m.other}${m.skillName ? ` (${m.skillName})` : ''}`).join(' · ')}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <Head title="Flex teams for you" blurb="Short projects alongside your job that use what you want to grow into." />
          <Link href="/dashboard/career/flex-teams" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Browse all flex teams</Link>
        </div>
        {hub.flexTeams.length === 0 ? <Empty>No open flex team matches your interests right now.</Empty> : (
          <div className="grid gap-3 md:grid-cols-3">{hub.flexTeams.map((t) => <FlexCard key={t.id} team={t} />)}</div>
        )}
      </section>

      <section className="space-y-3">
        <Head title="People to meet" blurb="Colleagues growing in the same things as you, or strong in them. Reach out and build a new relationship." />
        {hub.connections.length === 0 ? <Empty>Add a skill interest to see who to meet.</Empty> : (
          <div className="grid gap-3 md:grid-cols-3">
            {hub.connections.map((c) => (
              <Person key={c.id} name={c.fullName} sub={c.designation ?? ''} lines={[c.reason]} actions={mail(c.id, c.fullName)} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <Head title="Roles you could grow into" blurb="Ranked by how many of your skill interests each role uses, then by current openings." />
          <Link href="/dashboard/career/path" className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white">Open Career Path Builder</Link>
        </div>
        {hub.moves.length === 0 ? <Empty>Nothing to suggest yet.</Empty> : (
          <div className="grid gap-3 md:grid-cols-3">
            {hub.moves.map((m) => (
              <div key={m.title} className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  <li>Matches {m.matches} of your skill interests</li>
                  <li>{m.openings} current {m.openings === 1 ? 'opening' : 'openings'} for this role</li>
                  {m.fit != null && <li>You hold {m.fit}% of what it asks for</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
        {hub.paths.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {hub.paths.map((p) => (
              <Link key={p.id} href={`/dashboard/career/paths/${p.id}`} className="block px-4 py-3 hover:bg-slate-50">
                <span className="text-sm font-semibold text-slate-900 underline underline-offset-2">{p.name}</span>
                <span className="block text-xs text-slate-500">{hub.employee.designation} → {p.steps.join(' → ')}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="bg-white border border-slate-200 rounded-xl px-4 py-5 text-sm text-slate-500">{children}</p>
}

function Suggestion({ kindLabel, title, lines, message, from, actions }: {
  kindLabel: string; title: string; lines: string[]; message: string | null; from: string; actions: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid sm:grid-cols-[1fr_200px]">
      <div className="p-4 flex flex-col">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{kindLabel}</p>
        <p className="text-sm font-semibold text-slate-900 mt-0.5">{title}</p>
        <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">{lines.filter(Boolean).map((l) => <li key={l}>{l}</li>)}</ul>
        <div className="mt-auto pt-3 flex flex-wrap gap-x-4 gap-y-1.5">{actions}</div>
      </div>
      <div className="bg-sky-100 p-3 flex items-center">
        <div className="bg-white rounded-lg p-3 w-full">
          <p className="text-xs font-semibold text-slate-900">From {from}:</p>
          <p className="text-xs text-slate-700 mt-1 line-clamp-5">{message || 'No message.'}</p>
        </div>
      </div>
    </div>
  )
}

function Person({ name, sub, lines, actions }: { name: string; sub: string; lines: string[]; actions: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold">{getInitials(name)}</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
          <p className="text-xs text-slate-500 truncate">{sub}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-slate-600">{lines.filter(Boolean).map((l) => <li key={l}>{l}</li>)}</ul>
      <div className="mt-auto pt-3">{actions}</div>
    </div>
  )
}
