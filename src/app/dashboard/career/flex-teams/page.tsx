/**
 * Career → Explore: flex teams. Everyone can browse and express interest; HR,
 * managers and executives create them.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { canRunFlexTeams } from '@/lib/flex-teams'
import { flexTeamCards, growthBasis } from '@/lib/queries/career'
import { FlexCard } from '../_components/flex-card'
import { FlexTeamForm } from '../_components/flex-team-form'

const SHOW = [
  { key: 'open', label: 'Recruiting now' },
  { key: 'mine', label: 'Mine' },
  { key: 'all', label: 'All flex teams' },
] as const

export default async function FlexTeamsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const sp = await searchParams
  const show = SHOW.some((s) => s.key === sp.show) ? sp.show! : 'open'

  const basis = viewer.employeeId ? await growthBasis(viewer.employeeId) : null
  const [teams, people, skills] = await Promise.all([
    flexTeamCards({
      employeeId: viewer.employeeId,
      onlyOpen: show === 'open',
      matchFor: { interests: basis?.interests.map((i) => i.id) ?? [], held: [] },
    }),
    canRunFlexTeams(viewer)
      ? prisma.employee.findMany({ where: { status: 'ACTIVE', deletedAt: null }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
    prisma.skill.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
  ])
  const list = show === 'mine'
    ? teams.filter((t) => t.myStatus || t.host?.id === viewer.employeeId)
    : [...teams].sort((a, b) => b.matches - a.matches)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/dashboard/career" className="text-sm text-slate-600 underline underline-offset-2">← Career Hub</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Flex Teams</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Short projects you join alongside your job — to try a new kind of work or build a skill you want. The host is told when you express interest.
          </p>
        </div>
      </div>

      {canRunFlexTeams(viewer) && <FlexTeamForm people={people} knownSkills={skills.map((s) => s.name)} />}

      <nav className="flex gap-2 flex-wrap" aria-label="Which flex teams">
        {SHOW.map((s) => (
          <Link key={s.key} href={`/dashboard/career/flex-teams?show=${s.key}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${show === s.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
            {s.label}
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-500">
          {show === 'mine' ? 'You are not on or interested in any flex team yet.' : 'No flex teams here yet.'}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => <FlexCard key={t.id} team={t} />)}
        </div>
      )}
    </div>
  )
}
