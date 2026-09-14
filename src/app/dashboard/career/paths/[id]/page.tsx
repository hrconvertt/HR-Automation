/**
 * A saved career path — Workday's Career Development page: the roles in the
 * path down the right with how well you match each, and "Begin working
 * toward your next role": people in that role to meet, flex teams that build
 * what it needs, and each missing skill with a button to plan it.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer, canSeeTalent } from '@/lib/talent'
import { roleProfiles, roleKey } from '@/lib/queries/role-profiles'
import { flexTeamCards, growthBasis } from '@/lib/queries/career'
import { skillLevelLabel } from '@/lib/talent-labels'
import { getInitials } from '@/lib/utils'
import { FlexCard } from '../../_components/flex-card'
import { GapActions, DeletePath } from '../../_components/career-actions'

export default async function SavedPathPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const { id } = await params
  const path = await prisma.careerPath.findUnique({
    where: { id },
    select: {
      id: true, name: true, createdAt: true, employeeId: true,
      steps: { orderBy: { seq: 'asc' }, select: { roleTitle: true } },
    },
  })
  if (!path) notFound()
  if (!(await canSeeTalent(viewer, path.employeeId))) redirect('/dashboard/career')
  const own = viewer.employeeId === path.employeeId && !viewer.isPreviewMode

  const [basis, profiles, devItems] = await Promise.all([
    growthBasis(path.employeeId),
    roleProfiles({ derive: true }),
    prisma.developmentItem.findMany({ where: { employeeId: path.employeeId, status: { not: 'COMPLETED' } }, select: { skillId: true } }),
  ])
  const next = path.steps[0]?.roleTitle ?? null
  const nextProfile = next ? profiles.get(roleKey(next)) : undefined
  const interestIds = new Set(basis.interests.map((i) => i.id))
  const plannedIds = new Set(devItems.map((d) => d.skillId).filter(Boolean) as string[])

  const gaps = (nextProfile?.skills ?? []).filter((s) => (basis.held.get(s.skillId) ?? 0) < s.level)
  const [peopleInRole, teams] = await Promise.all([
    next
      ? prisma.employee.findMany({
          where: { status: 'ACTIVE', deletedAt: null, designation: { equals: next, mode: 'insensitive' }, id: { not: path.employeeId } },
          select: { id: true, fullName: true, email: true, department: { select: { name: true } } },
          take: 4,
        })
      : Promise.resolve([]),
    flexTeamCards({
      employeeId: path.employeeId, onlyOpen: true,
      matchFor: { interests: gaps.map((g) => g.skillId), held: [] },
    }),
  ])
  const jobFamily = peopleInRole[0]?.department?.name ?? null
  const matchedFor = (title: string) => {
    const p = profiles.get(roleKey(title))
    if (!p || p.skills.length === 0) return null
    return p.skills.filter((s) => basis.held.has(s.skillId)).length
  }

  return (
    <div className="space-y-5">
      <Link href="/dashboard/career" className="text-sm text-slate-600 underline underline-offset-2">← Career Hub</Link>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{path.name}</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {path.steps.length} {path.steps.length === 1 ? 'move' : 'moves'} in career path · created {path.createdAt.toLocaleDateString('en-GB')}
                </p>
              </div>
              {own && <DeletePath id={path.id} />}
            </div>
            <dl className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
              <div><dt className="text-xs text-slate-500">Target department</dt><dd className="font-semibold text-slate-900">{jobFamily ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">Skills still to build for the next role</dt><dd className="font-semibold text-slate-900">{gaps.length}</dd></div>
            </dl>
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Begin working toward your next role</h2>
                <p className="text-xs text-slate-500">{next ? `Towards ${next}.` : 'No moves in this path.'}</p>
              </div>
              <Link href="/dashboard/career/path" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">View more suggestions</Link>
            </div>

            {peopleInRole.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-amber-200 text-slate-800 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                  {getInitials(p.fullName)}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Someone to meet</p>
                  <p className="text-sm font-semibold text-slate-900">Connect with {p.fullName}</p>
                  <p className="text-xs text-slate-600">In the role now. Reach out and build a new relationship.</p>
                  <a href={`mailto:${p.email}`} className="text-sm font-medium text-slate-900 underline underline-offset-2">Email {p.fullName.split(' ')[0]}</a>
                </div>
              </div>
            ))}

            {gaps.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Skills the role asks for</p>
                <ul className="mt-2 divide-y divide-slate-100">
                  {gaps.map((g) => (
                    <li key={g.skillId} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-sm text-slate-900">
                        {g.name} <span className="text-xs text-slate-500">· needs {skillLevelLabel(g.level)}
                          {basis.held.get(g.skillId) ? `, you are ${skillLevelLabel(basis.held.get(g.skillId) as number)}` : ', you do not hold it yet'}</span>
                      </span>
                      {own && <GapActions employeeId={path.employeeId} skillId={g.skillId} skillName={g.name}
                        planned={plannedIds.has(g.skillId)} wanted={interestIds.has(g.skillId)} />}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {teams.filter((t) => t.matches > 0).length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {teams.filter((t) => t.matches > 0).slice(0, 4).map((t) => <FlexCard key={t.id} team={t} basis="skills" />)}
              </div>
            )}

            {peopleInRole.length === 0 && gaps.length === 0 && (
              <p className="bg-white border border-slate-200 rounded-xl px-4 py-5 text-sm text-slate-500">
                Nobody holds this role yet and it has no job profile, so there is nothing specific to suggest.
              </p>
            )}
          </section>
        </div>

        <aside className="bg-white border border-slate-200 rounded-xl h-fit">
          <p className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-900">Roles in this career path</p>
          <ol className="divide-y divide-slate-100">
            <li className="px-4 py-3 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center">✓</span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{basis.employee?.designation}</span>
                <span className="block text-xs text-slate-500">Current role</span>
              </span>
            </li>
            {path.steps.map((s, i) => {
              const m = matchedFor(s.roleTitle)
              return (
                <li key={`${s.roleTitle}-${i}`} className="px-4 py-3 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full border border-slate-400 text-slate-700 text-xs flex items-center justify-center">{i + 1}</span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{s.roleTitle}</span>
                    <span className="block text-xs text-slate-500">{m != null ? `Matches ${m} of your skills` : 'No job profile yet'}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </aside>
      </div>
    </div>
  )
}
