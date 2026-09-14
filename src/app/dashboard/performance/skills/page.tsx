/**
 * Performance → Skills Dashboard. HR and executives.
 *
 * Workday's Skills Dashboard on Convertt's records, in its four tabs:
 *
 *   Skills adoption       whose skills and interests are written down
 *   Team skills snapshot  job profiles v workers in the job, the profiles
 *                         themselves, an expertise finder, and the reports
 *   Skills engagement     career-profile participation, flex teams, mentoring,
 *                         development items and check-ins
 *   External skills       certificates — evidence from outside the company
 *
 * One organization filter (a department) applies to every tab.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer, seesEveryone, canManageTalentSetup } from '@/lib/talent'
import {
  CHECK_IN_GAP_DAYS, MATCH_BUCKETS, matchBucket, MENTORSHIP_TYPES, FLEX_STATUS_LABEL, skillLevelLabel,
  type MatchBucket, type FlexStatus,
} from '@/lib/talent-labels'
import { roleProfiles, roleKey, matchPercent } from '@/lib/queries/role-profiles'
import { GapChart } from './_components/gap-chart'
import { JobProfilesEditor, type RoleRow } from './_components/job-profiles-editor'

const DAY = 86_400_000
const TABS = [
  { key: 'adoption', label: 'Skills adoption' },
  { key: 'snapshot', label: 'Team skills snapshot' },
  { key: 'engagement', label: 'Skills engagement' },
  { key: 'external', label: 'External skills' },
] as const
const REPORTS = [
  { key: 'unique', label: 'Unique skills' },
  { key: 'compare', label: 'Compare employee to target job profile' },
  { key: 'minimum', label: 'Workers that meet a minimum % of a job profile' },
  { key: 'levelgap', label: 'Skill level gap analysis' },
] as const
const TYPE_COLORS: Record<string, string> = {
  CAREER: 'bg-emerald-600', NEW_HIRE: 'bg-emerald-300', PEER_COACH: 'bg-sky-300', LEADERSHIP: 'bg-blue-700',
}

type SP = { tab?: string; dept?: string; find?: string; report?: string; emp?: string; role?: string; min?: string }

export default async function SkillsDashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!seesEveryone(viewer)) redirect('/dashboard/performance')
  const sp = await searchParams
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : 'adoption'

  const now = new Date()
  const since90 = new Date(now.getTime() - 90 * DAY)
  const gapCut = new Date(now.getTime() - CHECK_IN_GAP_DAYS * DAY)
  const live = { status: 'ACTIVE', deletedAt: null }

  const [departments, staffAll, skills, interests, mentorships, devItems, checkIns, flexTeams, certs, profilesMap, ratings] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.employee.findMany({
      where: live,
      orderBy: { fullName: 'asc' },
      select: {
        id: true, fullName: true, designation: true, departmentId: true, reportingManagerId: true,
        department: { select: { name: true } },
        skills: { select: { skillId: true, level: true } },
      },
    }),
    prisma.skill.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true,
        holders: { where: { employee: live }, select: { employeeId: true, level: true } },
        interests: { where: { employee: live }, select: { employeeId: true } },
      },
    }),
    prisma.skillInterest.findMany({ where: { employee: live }, select: { employeeId: true } }),
    prisma.mentorship.findMany({ select: { status: true, type: true, menteeId: true } }),
    prisma.developmentItem.findMany({ where: { employee: live }, select: { employeeId: true, status: true, dueDate: true } }),
    prisma.checkIn.findMany({
      where: { employee: live, OR: [{ status: 'DONE', completedAt: { gte: since90 } }, { status: 'SCHEDULED' }] },
      select: { employeeId: true, status: true, completedAt: true },
    }),
    prisma.flexTeam.findMany({ select: { status: true, members: { select: { employeeId: true, status: true } } } }),
    prisma.certification.findMany({ orderBy: { issuedDate: 'desc' } }),
    roleProfiles(),
    prisma.skillRating.groupBy({ by: ['employeeId', 'skillId'], _avg: { rating: true } }),
  ])

  const dept = sp.dept && departments.some((d) => d.id === sp.dept) ? sp.dept : null
  const staff = dept ? staffAll.filter((e) => e.departmentId === dept) : staffAll
  const ids = new Set(staff.map((e) => e.id))
  const nameOf = new Map(staffAll.map((e) => [e.id, e.fullName]))
  const deptOf = new Map(staffAll.map((e) => [e.id, e.department?.name ?? 'No department']))
  const n = staff.length
  const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`)
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    if (dept) p.set('dept', dept)
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
    return `/dashboard/performance/skills?${p.toString()}`
  }

  const liveSkills = skills.map((s) => ({
    ...s,
    holders: s.holders.filter((h) => ids.has(h.employeeId)),
    interests: s.interests.filter((i) => ids.has(i.employeeId)),
  }))
  const withSkills = new Set(liveSkills.flatMap((s) => s.holders.map((h) => h.employeeId)))
  const withInterests = new Set(interests.map((i) => i.employeeId).filter((id) => ids.has(id)))

  // ── Snapshot: job profiles v workers in job ───────────────────────────────
  const defined = new Map([...profilesMap].filter(([, p]) => p.source === 'DEFINED' && p.skills.length > 0))
  const bucketsByDept = new Map<string, Record<MatchBucket, number>>()
  const noProfile: typeof staff = []
  const pctOf = new Map<string, number>()
  for (const e of staff) {
    const p = e.designation ? defined.get(roleKey(e.designation)) : undefined
    if (!p) { noProfile.push(e); continue }
    const held = new Map(e.skills.map((s) => [s.skillId, s.level]))
    const m = matchPercent(held, p.skills) ?? 0
    pctOf.set(e.id, m)
    const d = e.department?.name ?? 'No department'
    const row = bucketsByDept.get(d) ?? Object.fromEntries(MATCH_BUCKETS.map((b) => [b.key, 0])) as Record<MatchBucket, number>
    row[matchBucket(m)] += 1
    bucketsByDept.set(d, row)
  }
  const gapData = [...bucketsByDept.entries()].map(([d, row]) => ({ dept: d, ...row }))
  const roleRows: RoleRow[] = (() => {
    const titles = new Map<string, RoleRow>()
    for (const p of profilesMap.values()) {
      titles.set(roleKey(p.title), {
        title: p.title,
        holders: p.holders,
        skills: p.source === 'DEFINED' ? p.skills.map((s) => ({ id: s.id as string, name: s.name, level: s.level })) : [],
      })
    }
    return [...titles.values()].sort((a, b) => a.title.localeCompare(b.title))
  })()

  // ── Engagement ────────────────────────────────────────────────────────────
  const flexMembers = new Set(flexTeams.flatMap((t) => t.members.filter((m) => m.status === 'MEMBER').map((m) => m.employeeId)).filter((id) => ids.has(id)))
  const mentorRows = (() => {
    const byDept = new Map<string, Record<string, number>>()
    for (const m of mentorships) {
      if (m.status === 'ENDED' || !ids.has(m.menteeId)) continue
      const d = deptOf.get(m.menteeId) ?? 'No department'
      const row = byDept.get(d) ?? {}
      row[m.type] = (row[m.type] ?? 0) + 1
      byDept.set(d, row)
    }
    return [...byDept.entries()].map(([d, row]) => ({ dept: d, row, total: Object.values(row).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total)
  })()
  const maxMentor = Math.max(1, ...mentorRows.map((r) => r.total))
  const recent = new Set(checkIns.filter((c) => c.status === 'DONE' && c.completedAt && c.completedAt >= gapCut).map((c) => c.employeeId))

  const managerRows = (() => {
    const m = new Map<string, string[]>()
    for (const e of staff) {
      if (!e.reportingManagerId || !nameOf.has(e.reportingManagerId)) continue
      m.set(e.reportingManagerId, [...(m.get(e.reportingManagerId) ?? []), e.id])
    }
    return [...m.entries()].map(([id, reports]) => ({
      id, name: nameOf.get(id)!, reports: reports.length, recent: reports.filter((r) => recent.has(r)).length,
    })).sort((a, b) => a.recent / a.reports - b.recent / b.reports || a.name.localeCompare(b.name))
  })()

  const avgRating = new Map(ratings.map((r) => [`${r.employeeId}:${r.skillId}`, r._avg.rating]))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Skills Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Adoption, gaps against job profiles, engagement, and outside evidence. Skills are recorded on the Skills page or a person&apos;s talent page.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/people/skills" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Record skills</Link>
          <Link href="/dashboard/team-insights" className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white">Open Team Insights</Link>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-slate-200 overflow-x-auto" aria-label="Skills dashboard tabs">
        {TABS.map((t) => (
          <Link key={t.key} href={qs({ tab: t.key })} aria-current={tab === t.key ? 'page' : undefined}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.key ? 'border-slate-900 text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value={tab} />
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1">Organization</span>
          <select name="dept" defaultValue={dept ?? ''} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white min-w-[220px]">
            <option value="">Whole company</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <button type="submit" className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white">Apply</button>
        <p className="text-xs text-slate-500">{n} active {n === 1 ? 'person' : 'people'} in view.</p>
      </form>

      {tab === 'adoption' && (
        <section className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Figure label="Active staff" value={String(n)} />
            <Figure label="With skills recorded" value={pct(withSkills.size, n)} sub={`${withSkills.size} people`} />
            <Figure label="With skill interests" value={pct(withInterests.size, n)} sub={`${withInterests.size} people`} />
            <Figure label="Skills on record" value={String(liveSkills.filter((s) => s.holders.length > 0).length)} />
          </div>
          <Table head={['Department', 'Staff', 'Skills recorded', 'Interests recorded']} alignRight={[1, 2, 3]}>
            {[...new Set(staff.map((e) => e.department?.name ?? 'No department'))].sort().map((d) => {
              const here = staff.filter((e) => (e.department?.name ?? 'No department') === d)
              const s = here.filter((e) => withSkills.has(e.id)).length
              const i = here.filter((e) => withInterests.has(e.id)).length
              return (
                <tr key={d}>
                  <td className="px-4 py-2 text-slate-900">{d}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{here.length}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s} <span className="text-slate-400">· {pct(s, here.length)}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums">{i} <span className="text-slate-400">· {pct(i, here.length)}</span></td>
                </tr>
              )
            })}
          </Table>
          <p className="text-xs text-slate-500">
            Nobody recorded yet:{' '}
            {staff.filter((e) => !withSkills.has(e.id)).map((e) => e.fullName).join(', ') || 'everyone has at least one skill.'}
          </p>
        </section>
      )}

      {tab === 'snapshot' && (
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-900">Skill gaps — job profiles v workers in job</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Each person against the job profile for the role they hold. Every requirement scores the share of its required depth they hold.
              </p>
              {gapData.length === 0 ? (
                <p className="text-sm text-slate-500 mt-4">
                  No one in view holds a role with a job profile yet. Define the profiles below and this fills in.
                </p>
              ) : (
                <>
                  <div className="mt-3"><GapChart data={gapData} /></div>
                  <Table head={['Department', ...MATCH_BUCKETS.map((b) => b.label), 'Count']} alignRight={[1, 2, 3, 4, 5, 6, 7]}>
                    {gapData.map((r) => (
                      <tr key={r.dept}>
                        <td className="px-4 py-2 text-slate-900">{r.dept}</td>
                        {MATCH_BUCKETS.map((b) => <td key={b.key} className="px-4 py-2 text-right tabular-nums">{r[b.key]}</td>)}
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">
                          {MATCH_BUCKETS.reduce((s, b) => s + r[b.key], 0)}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </>
              )}
              {noProfile.length > 0 && (
                <p className="text-xs text-slate-500 mt-3">
                  Not counted — their role has no job profile: {noProfile.length} {noProfile.length === 1 ? 'person' : 'people'}
                  {' '}({[...new Set(noProfile.map((e) => e.designation))].slice(0, 8).join(', ')}{new Set(noProfile.map((e) => e.designation)).size > 8 ? '…' : ''}).
                </p>
              )}
            </section>

            <JobProfilesEditor roles={roleRows} knownSkills={skills.map((s) => s.name)} canEdit={canManageTalentSetup(viewer)} />

            <section id="expertise" className="bg-white border border-slate-200 rounded-xl p-4 scroll-mt-4">
              <h2 className="text-sm font-semibold text-slate-900">Expertise finder</h2>
              <p className="text-xs text-slate-500 mt-0.5">Who knows a skill, deepest first.</p>
              <form method="get" action="/dashboard/performance/skills#expertise" className="flex gap-2 mt-3">
                <input type="hidden" name="tab" value="snapshot" />
                {dept && <input type="hidden" name="dept" value={dept} />}
                <input name="find" defaultValue={sp.find ?? ''} list="finder-skills" placeholder="Type a skill"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                <datalist id="finder-skills">{skills.map((s) => <option key={s.id} value={s.name} />)}</datalist>
                <button type="submit" className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white">Find people</button>
              </form>
              {sp.find && (() => {
                const term = sp.find.trim().toLowerCase()
                const hits = liveSkills.filter((s) => s.name.toLowerCase().includes(term))
                const people = hits.flatMap((s) => s.holders.map((h) => ({ skill: s, h })))
                  .sort((a, b) => b.h.level - a.h.level)
                return people.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-3">Nobody in view holds a skill matching “{sp.find}”.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {people.map(({ skill, h }) => {
                      const avg = avgRating.get(`${h.employeeId}:${skill.id}`)
                      return (
                        <li key={`${skill.id}:${h.employeeId}`} className="py-2 flex items-center justify-between gap-3">
                          <span>
                            <Link href={`/dashboard/employees/${h.employeeId}`} className="text-sm font-medium text-slate-900 underline underline-offset-2">
                              {nameOf.get(h.employeeId)}
                            </Link>
                            <span className="text-xs text-slate-500"> · {deptOf.get(h.employeeId)}</span>
                          </span>
                          <span className="text-xs text-slate-700">
                            {skill.name} · {skillLevelLabel(h.level)}{avg != null ? ` · rated ${avg.toFixed(1)}/5` : ''}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )
              })()}
            </section>

            {sp.report && <ReportView sp={sp} staff={staff} liveSkills={liveSkills} defined={defined} nameOf={nameOf} qs={qs} />}
          </div>

          <aside className="bg-white border border-slate-200 rounded-xl p-4 h-fit">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">More reports</h2>
            <ul className="space-y-1.5">
              {REPORTS.map((r) => (
                <li key={r.key}>
                  <Link href={`${qs({ tab: 'snapshot', report: r.key })}#report`}
                    className={`text-[13px] underline underline-offset-2 ${sp.report === r.key ? 'text-slate-900 font-semibold' : 'text-slate-700'}`}>
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {tab === 'engagement' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-900">Career profile participation</h2>
              <p className="text-xs text-slate-500 mt-0.5">Who has told the company what they want to grow into.</p>
              <HBars rows={[
                { label: 'Did not set up', value: n - withInterests.size, color: 'bg-emerald-500' },
                { label: 'Set up', value: withInterests.size, color: 'bg-emerald-500' },
              ]} total={n} />
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-900">Flex team participation</h2>
              <Donut pct={n ? (flexMembers.size / n) * 100 : 0} label="of staff on a flex team" />
              <div className="flex flex-wrap gap-3 text-[11px] text-slate-600 justify-center">
                {(['OPEN', 'STAFFED', 'CLOSED'] as FlexStatus[]).map((st) => (
                  <span key={st}>{FLEX_STATUS_LABEL[st]}: <strong className="text-slate-900">{flexTeams.filter((t) => t.status === st).length}</strong></span>
                ))}
              </div>
              <Link href="/dashboard/career/flex-teams" className="block text-center text-sm font-medium text-slate-900 underline underline-offset-2 mt-3">
                Open flex teams
              </Link>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-900">Mentorships</h2>
              <p className="text-xs text-slate-500 mt-0.5">Active and suggested, by the mentee&apos;s department and the kind of mentoring.</p>
              {mentorRows.length === 0 ? (
                <p className="text-xs text-slate-400 mt-3">No mentoring on record.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {mentorRows.map((r) => (
                    <li key={r.dept}>
                      <div className="flex justify-between text-xs text-slate-700"><span>{r.dept}</span><span className="tabular-nums">{r.total}</span></div>
                      <div className="h-3 rounded bg-slate-100 flex overflow-hidden mt-0.5" style={{ width: `${(r.total / maxMentor) * 100}%` }}>
                        {MENTORSHIP_TYPES.map((t) => r.row[t.value] ? (
                          <span key={t.value} className={TYPE_COLORS[t.value]} style={{ width: `${(r.row[t.value] / r.total) * 100}%` }} title={`${t.label}: ${r.row[t.value]}`} />
                        ) : null)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                {MENTORSHIP_TYPES.map((t) => (
                  <span key={t.value} className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${TYPE_COLORS[t.value]}`} />{t.label}</span>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900">Development items</h3>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Line label="Not started" value={devItems.filter((d) => ids.has(d.employeeId) && d.status === 'NOT_STARTED').length} />
                <Line label="In progress" value={devItems.filter((d) => ids.has(d.employeeId) && d.status === 'IN_PROGRESS').length} />
                <Line label="Completed" value={devItems.filter((d) => ids.has(d.employeeId) && d.status === 'COMPLETED').length} />
                <Line label="Past their due date" alarm
                  value={devItems.filter((d) => ids.has(d.employeeId) && d.status !== 'COMPLETED' && d.dueDate && d.dueDate < now).length} />
              </dl>
            </section>
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900">Check-ins</h3>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Line label="Held in the last 90 days" value={checkIns.filter((c) => ids.has(c.employeeId) && c.status === 'DONE').length} />
                <Line label="Scheduled" value={checkIns.filter((c) => ids.has(c.employeeId) && c.status === 'SCHEDULED').length} />
                <Line label={`Staff with one in the last ${CHECK_IN_GAP_DAYS} days`} value={[...recent].filter((id) => ids.has(id)).length} />
              </dl>
            </section>
          </div>

          {managerRows.length > 0 && (
            <Table head={['Manager', 'Reports', `Check-in in the last ${CHECK_IN_GAP_DAYS} days`, '']} alignRight={[1, 2, 3]}>
              {managerRows.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-slate-900">{m.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.reports}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${m.recent < m.reports ? 'text-amber-800' : ''}`}>{m.recent} of {m.reports}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/dashboard/team-insights?manager=${m.id}`} className="text-sm font-medium text-slate-900 underline underline-offset-2 whitespace-nowrap">
                      Open their team
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {tab === 'external' && (() => {
        const mine = certs.filter((c) => ids.has(c.employeeId))
        const evidenced = liveSkills.filter((s) => mine.some((c) => c.name.toLowerCase().includes(s.name.toLowerCase())))
        return (
          <section className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-4">
              <Figure label="Certificates on record" value={String(mine.length)} />
              <Figure label="People with one" value={String(new Set(mine.map((c) => c.employeeId)).size)} />
              <Figure label="Skills backed by a certificate" value={String(evidenced.length)} />
            </div>
            <p className="text-xs text-slate-500">
              External sources are skill evidence from outside Convertt. A certificate backs the skill it names, and shows in that skill&apos;s panel on the profile.{' '}
              <Link href="/dashboard/learning?tab=certs" className="underline">Record certificates</Link>
            </p>
            {mine.length === 0 ? (
              <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">No certificates recorded yet.</p>
            ) : (
              <Table head={['Person', 'Certificate', 'Issued by', 'Issued', 'Expires']} alignRight={[]}>
                {mine.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 text-slate-900">{nameOf.get(c.employeeId) ?? '—'}</td>
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2 text-slate-600">{c.issuedBy}</td>
                    <td className="px-4 py-2 text-slate-600">{c.issuedDate.toLocaleDateString('en-GB')}</td>
                    <td className={`px-4 py-2 ${c.expiryDate && c.expiryDate < now ? 'text-amber-800' : 'text-slate-600'}`}>
                      {c.expiryDate ? c.expiryDate.toLocaleDateString('en-GB') : '—'}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        )
      })()}
    </div>
  )
}

type LiveSkill = { id: string; name: string; holders: { employeeId: string; level: number }[]; interests: { employeeId: string }[] }
type StaffRow = { id: string; fullName: string; designation: string; skills: { skillId: string; level: number }[] }
type Defined = Map<string, { title: string; skills: { skillId: string; name: string; level: number }[] }>

function ReportView({ sp, staff, liveSkills, defined, nameOf, qs }: {
  sp: SP; staff: StaffRow[]; liveSkills: LiveSkill[]; defined: Defined; nameOf: Map<string, string>
  qs: (extra: Record<string, string | undefined>) => string
}) {
  const roles = [...defined.values()].sort((a, b) => a.title.localeCompare(b.title))
  const title = REPORTS.find((r) => r.key === sp.report)?.label ?? 'Report'
  const roleForm = (extra: React.ReactNode) => (
    <form method="get" action="/dashboard/performance/skills#report" className="flex gap-2 flex-wrap items-end mt-3">
      <input type="hidden" name="tab" value="snapshot" />
      <input type="hidden" name="report" value={sp.report} />
      {sp.dept && <input type="hidden" name="dept" value={sp.dept} />}
      {extra}
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">Target job profile</span>
        <select name="role" defaultValue={sp.role ?? ''} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white min-w-[200px]">
          <option value="" disabled>Select a role…</option>
          {roles.map((r) => <option key={r.title} value={r.title}>{r.title}</option>)}
        </select>
      </label>
      <button type="submit" className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white">Run report</button>
    </form>
  )
  const profile = sp.role ? defined.get(roleKey(sp.role)) : undefined

  return (
    <section id="report" className="bg-white border border-slate-200 rounded-xl p-4 scroll-mt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <Link href={qs({ tab: 'snapshot' })} className="text-xs underline text-slate-600">Close report</Link>
      </div>

      {sp.report === 'unique' && (() => {
        const rows = liveSkills.filter((s) => s.holders.length === 1)
        return rows.length === 0 ? <p className="text-sm text-slate-500 mt-3">No skill is held by just one person.</p> : (
          <>
            <p className="text-xs text-slate-500 mt-1">Held by exactly one person — what waits when they are away.</p>
            <ul className="mt-3 divide-y divide-slate-100">
              {rows.map((s) => (
                <li key={s.id} className="py-1.5 flex justify-between text-sm">
                  <span className="text-slate-900">{s.name}</span>
                  <span className="text-slate-600">{nameOf.get(s.holders[0].employeeId)} · {skillLevelLabel(s.holders[0].level)}</span>
                </li>
              ))}
            </ul>
          </>
        )
      })()}

      {sp.report === 'compare' && (
        <>
          {roleForm(
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Employee</span>
              <select name="emp" defaultValue={sp.emp ?? ''} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white min-w-[200px]">
                <option value="" disabled>Select a person…</option>
                {staff.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </label>,
          )}
          {profile && sp.emp && (() => {
            const e = staff.find((x) => x.id === sp.emp)
            if (!e) return null
            const held = new Map(e.skills.map((s) => [s.skillId, s.level]))
            const m = matchPercent(held, profile.skills) ?? 0
            return (
              <>
                <p className="text-sm text-slate-800 mt-3">
                  {e.fullName} holds <strong>{m}%</strong> of the {profile.title} profile · {MATCH_BUCKETS.find((b) => b.key === matchBucket(m))?.label}
                </p>
                <Table head={['Skill', 'Required', 'Held', 'Gap']} alignRight={[]}>
                  {profile.skills.map((s) => {
                    const h = held.get(s.skillId) ?? 0
                    return (
                      <tr key={s.skillId}>
                        <td className="px-4 py-2 text-slate-900">{s.name}</td>
                        <td className="px-4 py-2">{skillLevelLabel(s.level)}</td>
                        <td className="px-4 py-2">{h ? skillLevelLabel(h) : 'Not held'}</td>
                        <td className={`px-4 py-2 ${h >= s.level ? 'text-emerald-800' : 'text-amber-800'}`}>
                          {h >= s.level ? 'Meets it' : `${s.level - h} level${s.level - h === 1 ? '' : 's'} short`}
                        </td>
                      </tr>
                    )
                  })}
                </Table>
              </>
            )
          })()}
        </>
      )}

      {sp.report === 'minimum' && (
        <>
          {roleForm(
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Minimum match %</span>
              <input type="number" name="min" min={0} max={100} defaultValue={sp.min ?? '60'}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-24" />
            </label>,
          )}
          {profile && (() => {
            const min = Math.max(0, Math.min(100, Number(sp.min ?? 60) || 0))
            const rows = staff
              .map((e) => ({ e, m: matchPercent(new Map(e.skills.map((s) => [s.skillId, s.level])), profile.skills) ?? 0 }))
              .filter((x) => x.m >= min)
              .sort((a, b) => b.m - a.m)
            return rows.length === 0 ? <p className="text-sm text-slate-500 mt-3">Nobody in view reaches {min}% of {profile.title}.</p> : (
              <ul className="mt-3 divide-y divide-slate-100">
                {rows.map(({ e, m }) => (
                  <li key={e.id} className="py-1.5 flex justify-between text-sm">
                    <span className="text-slate-900">{e.fullName} <span className="text-slate-500">· {e.designation}</span></span>
                    <span className="tabular-nums font-semibold">{m}%</span>
                  </li>
                ))}
              </ul>
            )
          })()}
        </>
      )}

      {sp.report === 'levelgap' && (() => {
        const rows = roles.flatMap((r) => {
          const inRole = staff.filter((e) => roleKey(e.designation) === roleKey(r.title))
          if (inRole.length === 0) return []
          return r.skills.map((s) => {
            const levels = inRole.map((e) => e.skills.find((x) => x.skillId === s.skillId)?.level ?? 0)
            return {
              key: `${r.title}:${s.skillId}`, role: r.title, skill: s.name, required: s.level,
              avg: levels.reduce((a, b) => a + b, 0) / levels.length, below: levels.filter((l) => l < s.level).length, n: inRole.length,
            }
          })
        }).sort((a, b) => (b.required - b.avg) - (a.required - a.avg))
        return rows.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">No job profile has people in it yet.</p>
        ) : (
          <Table head={['Role', 'Skill', 'Required', 'Average held', 'People below']} alignRight={[2, 3, 4]}>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-2 text-slate-900">{r.role}</td>
                <td className="px-4 py-2">{r.skill}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.required}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${r.avg < r.required ? 'text-amber-800' : ''}`}>{r.avg.toFixed(1)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.below} of {r.n}</td>
              </tr>
            ))}
          </Table>
        )
      })()}
    </section>
  )
}

function Table({ head, alignRight, children }: { head: string[]; alignRight: number[]; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
            {head.map((h, i) => (
              <th key={`${h}-${i}`} className={`px-4 py-2 font-semibold ${alignRight.includes(i) ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  )
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

function Line({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`tabular-nums font-semibold ${alarm && value > 0 ? 'text-amber-800' : 'text-slate-900'}`}>{value}</dd>
    </div>
  )
}

function HBars({ rows, total }: { rows: { label: string; value: number; color: string }[]; total: number }) {
  return (
    <ul className="mt-4 space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between text-xs text-slate-700">
            <span>{r.label}</span>
            <span className="tabular-nums">{r.value} · {total ? Math.round((r.value / total) * 100) : 0}%</span>
          </div>
          <div className="h-5 rounded bg-slate-100 mt-1 overflow-hidden">
            <div className={`h-full ${r.color}`} style={{ width: `${total ? (r.value / total) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Donut({ pct, label }: { pct: number; label: string }) {
  const R = 52
  const C = 2 * Math.PI * R
  return (
    <div className="flex justify-center my-3">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`${Math.round(pct)}% ${label}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="#d1fae5" strokeWidth="16" />
        <circle cx="70" cy="70" r={R} fill="none" stroke="#10b981" strokeWidth="16"
          strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 70 70)" />
        <text x="70" y="70" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 24, fontWeight: 700 }}>{Math.round(pct)}%</text>
        <text x="70" y="88" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>{label}</text>
      </svg>
    </div>
  )
}
