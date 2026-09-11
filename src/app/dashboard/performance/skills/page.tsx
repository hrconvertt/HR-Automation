/**
 * Performance → Skills Dashboard. HR and executives.
 *
 * Workday's Skills Dashboard, on what Convertt records: how much of the
 * company has its skills written down (adoption), where cover is thin and
 * where people want a skill nobody can teach (gaps), and whether the
 * development machinery — check-ins, development items, mentoring — is
 * actually being used (engagement).
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer, seesEveryone } from '@/lib/talent'
import { CHECK_IN_GAP_DAYS } from '@/lib/talent-labels'

const DAY = 86_400_000

export default async function SkillsDashboardPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!seesEveryone(viewer)) redirect('/dashboard/performance')

  const now = new Date()
  const since90 = new Date(now.getTime() - 90 * DAY)
  const gapCut = new Date(now.getTime() - CHECK_IN_GAP_DAYS * DAY)
  const live = { status: 'ACTIVE', deletedAt: null }

  const [staff, skills, interests, mentorships, devItems, checkIns] = await Promise.all([
    prisma.employee.findMany({
      where: live,
      select: {
        id: true, fullName: true, reportingManagerId: true,
        department: { select: { name: true } },
      },
    }),
    prisma.skill.findMany({
      select: {
        id: true, name: true,
        holders: { where: { employee: live }, select: { employeeId: true, level: true, employee: { select: { fullName: true } } } },
        interests: { where: { employee: live }, select: { employeeId: true } },
      },
    }),
    prisma.skillInterest.findMany({ where: { employee: live }, select: { employeeId: true } }),
    prisma.mentorship.findMany({ select: { status: true } }),
    prisma.developmentItem.findMany({ where: { employee: live }, select: { status: true, dueDate: true } }),
    prisma.checkIn.findMany({
      where: { employee: live, OR: [{ status: 'DONE', completedAt: { gte: since90 } }, { status: 'SCHEDULED' }] },
      select: { employeeId: true, status: true, completedAt: true },
    }),
  ])

  const n = staff.length
  const withSkills = new Set(skills.flatMap((s) => s.holders.map((h) => h.employeeId)))
  const withInterests = new Set(interests.map((i) => i.employeeId))
  const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`)

  // Adoption by department.
  const depts = new Map<string, { staff: number; skills: number; interests: number }>()
  for (const e of staff) {
    const k = e.department?.name ?? 'No department'
    const d = depts.get(k) ?? { staff: 0, skills: 0, interests: 0 }
    d.staff += 1
    if (withSkills.has(e.id)) d.skills += 1
    if (withInterests.has(e.id)) d.interests += 1
    depts.set(k, d)
  }
  const deptRows = [...depts.entries()].sort((a, b) => b[1].staff - a[1].staff)

  // Gaps: per skill, strong cover, teachers and demand.
  const gapRows = skills
    .map((s) => {
      const strong = s.holders.filter((h) => h.level >= 3)
      const teachers = s.holders.filter((h) => h.level >= 4)
      const wanted = s.interests.length
      const flag =
        wanted > 0 && teachers.length === 0 && strong.length === 0 ? 'Wanted, and nobody holds it at Strong'
          : wanted > 0 && teachers.length === 0 ? 'Wanted, and nobody can teach it'
            : strong.length === 1 ? `Only ${strong[0].employee.fullName} holds it at Strong`
              : strong.length === 0 && s.holders.length > 0 ? 'Nobody holds it at Strong'
                : null
      return { id: s.id, name: s.name, holders: s.holders.length, strong: strong.length, teachers: teachers.length, wanted, flag }
    })
    .filter((r) => r.holders > 0 || r.wanted > 0)
    .sort((a, b) => Number(!!b.flag) - Number(!!a.flag) || b.wanted - a.wanted || a.name.localeCompare(b.name))
  const flagged = gapRows.filter((r) => r.flag).length

  // Engagement.
  const mentorCount = (st: string) => mentorships.filter((m) => m.status === st).length
  const devCount = (st: string) => devItems.filter((d) => d.status === st).length
  const devOverdue = devItems.filter((d) => d.status !== 'COMPLETED' && d.dueDate && d.dueDate < now).length
  const held90 = checkIns.filter((c) => c.status === 'DONE').length

  // Per manager: how many reports have had a check-in in the last 30 days.
  const managers = new Map<string, { name: string; reports: string[] }>()
  const nameOf = new Map(staff.map((e) => [e.id, e.fullName]))
  for (const e of staff) {
    if (!e.reportingManagerId || !nameOf.has(e.reportingManagerId)) continue
    const m = managers.get(e.reportingManagerId) ?? { name: nameOf.get(e.reportingManagerId)!, reports: [] }
    m.reports.push(e.id)
    managers.set(e.reportingManagerId, m)
  }
  const recent = new Set(checkIns.filter((c) => c.status === 'DONE' && c.completedAt && c.completedAt >= gapCut).map((c) => c.employeeId))
  const scheduled = new Set(checkIns.filter((c) => c.status === 'SCHEDULED').map((c) => c.employeeId))
  const managerRows = [...managers.entries()]
    .map(([id, m]) => ({
      id,
      name: m.name,
      reports: m.reports.length,
      recent: m.reports.filter((r) => recent.has(r)).length,
      scheduled: m.reports.filter((r) => scheduled.has(r)).length,
    }))
    .sort((a, b) => (a.recent / a.reports) - (b.recent / b.reports) || a.name.localeCompare(b.name))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Skills Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            How much of the company has its skills on record, where cover is thin, and whether check-ins,
            development items and mentoring are being used. Skills are recorded on the Skills page or on a person&apos;s talent page.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/people/skills" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">
            Record skills
          </Link>
          <Link href="/dashboard/team-insights" className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white">
            Open Team Insights
          </Link>
        </div>
      </div>

      {/* Adoption */}
      <section className="space-y-3">
        <Head title="Skills adoption" blurb="Whose skills and interests are written down. Everything below depends on it." />
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Figure label="Active staff" value={String(n)} />
          <Figure label="With skills recorded" value={pct(withSkills.size, n)} sub={`${withSkills.size} people`} />
          <Figure label="With skill interests" value={pct(withInterests.size, n)} sub={`${withInterests.size} people`} />
          <Figure label="Skills on record" value={String(skills.filter((s) => s.holders.length > 0).length)} />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold">Department</th>
                <th className="px-4 py-2 font-semibold text-right">Staff</th>
                <th className="px-4 py-2 font-semibold text-right">Skills recorded</th>
                <th className="px-4 py-2 font-semibold text-right">Interests recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deptRows.map(([name, d]) => (
                <tr key={name}>
                  <td className="px-4 py-2 text-slate-900">{name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{d.staff}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{d.skills} <span className="text-slate-400">· {pct(d.skills, d.staff)}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums">{d.interests} <span className="text-slate-400">· {pct(d.interests, d.staff)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Gaps */}
      <section className="space-y-3">
        <Head
          title={`Skill gaps · ${flagged} flagged`}
          blurb="Cover is Strong or Can teach it. A skill held by one person is what waits when they are away; a skill people want that nobody can teach is a hire or a course."
        />
        {gapRows.length === 0 ? (
          <p className="bg-white border border-slate-200 rounded-xl px-4 py-6 text-sm text-slate-500">
            No skills or interests recorded yet.
          </p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2 font-semibold">Skill</th>
                  <th className="px-4 py-2 font-semibold text-right">Holders</th>
                  <th className="px-4 py-2 font-semibold text-right">Strong or above</th>
                  <th className="px-4 py-2 font-semibold text-right">Can teach it</th>
                  <th className="px-4 py-2 font-semibold text-right">Wanted by</th>
                  <th className="px-4 py-2 font-semibold">Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gapRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-slate-900">{r.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.holders}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.strong}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.teachers}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.wanted}</td>
                    <td className={`px-4 py-2 ${r.flag ? 'text-amber-800' : 'text-slate-400'}`}>{r.flag ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Engagement */}
      <section className="space-y-3">
        <Head title="Development engagement" blurb="Whether the growth tools are being used, not just set up." />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-900">Mentoring</h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Line label="Active" value={mentorCount('ACTIVE')} />
              <Line label="Suggested, not started" value={mentorCount('PROPOSED')} />
              <Line label="Ended" value={mentorCount('ENDED')} />
            </dl>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-900">Development items</h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Line label="Not started" value={devCount('NOT_STARTED')} />
              <Line label="In progress" value={devCount('IN_PROGRESS')} />
              <Line label="Completed" value={devCount('COMPLETED')} />
              <Line label="Past their due date" value={devOverdue} alarm />
            </dl>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-900">Check-ins</h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Line label="Held in the last 90 days" value={held90} />
              <Line label="Scheduled" value={checkIns.filter((c) => c.status === 'SCHEDULED').length} />
              <Line label={`Staff with one in the last ${CHECK_IN_GAP_DAYS} days`} value={recent.size} />
            </dl>
          </div>
        </div>

        {managerRows.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2 font-semibold">Manager</th>
                  <th className="px-4 py-2 font-semibold text-right">Reports</th>
                  <th className="px-4 py-2 font-semibold text-right">Check-in in the last {CHECK_IN_GAP_DAYS} days</th>
                  <th className="px-4 py-2 font-semibold text-right">Check-in scheduled</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managerRows.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-slate-900">{m.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.reports}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${m.recent < m.reports ? 'text-amber-800' : ''}`}>
                      {m.recent} of {m.reports}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.scheduled}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/dashboard/team-insights?manager=${m.id}`}
                        className="text-sm font-medium text-slate-900 underline underline-offset-2 whitespace-nowrap">
                        Open their team
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Head({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="border-b border-slate-200 pb-2">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>
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
