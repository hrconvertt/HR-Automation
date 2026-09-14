/**
 * Compare Candidates by Succession Plan — the successors for one role, side
 * by side on what decides between them. HR and executives.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer, canSeeSuccession } from '@/lib/talent'
import { talentRows } from '@/lib/queries/talent-rows'
import { roleProfiles, roleKey, matchPercent } from '@/lib/queries/role-profiles'
import { boxFor, currentCycle, AXIS_LABELS } from '@/lib/talent-grid'
import { READINESS, readinessLabel } from '@/lib/talent-labels'

const DAY = 86_400_000

/** Years in the company to one decimal — computed outside render, which must stay pure. */
function yearsSince(d: Date): string {
  return ((Date.now() - d.getTime()) / (365.25 * DAY)).toFixed(1)
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!canSeeSuccession(viewer)) redirect('/dashboard/performance')
  const sp = await searchParams

  const plans = await prisma.successionPlan.findMany({
    orderBy: [{ critical: 'desc' }, { roleTitle: 'asc' }],
    select: { id: true, roleTitle: true, incumbent: { select: { fullName: true, designation: true } }, _count: { select: { candidates: true } } },
  })
  const planId = sp.plan && plans.some((p) => p.id === sp.plan) ? sp.plan : plans[0]?.id ?? null

  const plan = planId
    ? await prisma.successionPlan.findUnique({
        where: { id: planId },
        select: {
          id: true, roleTitle: true,
          incumbent: { select: { id: true, fullName: true, designation: true } },
          candidates: {
            select: {
              id: true, readiness: true, note: true,
              employee: {
                select: {
                  id: true, fullName: true, designation: true, joiningDate: true,
                  skills: { select: { skillId: true, level: true } },
                  developmentItems: { where: { status: { not: 'COMPLETED' } }, select: { id: true } },
                  mentoredBy: { where: { status: 'ACTIVE' }, select: { id: true } },
                },
              },
            },
          },
        },
      })
    : null

  const [rows, profiles] = await Promise.all([talentRows(currentCycle()), roleProfiles({ derive: true })])
  const rowOf = new Map(rows.map((r) => [r.employeeId, r]))
  const profile = plan
    ? profiles.get(roleKey(plan.roleTitle)) ?? (plan.incumbent?.designation ? profiles.get(roleKey(plan.incumbent.designation)) : undefined)
    : undefined
  const order = (r: string) => READINESS.findIndex((x) => x.value === r)
  const candidates = [...(plan?.candidates ?? [])].sort((a, b) => order(a.readiness) - order(b.readiness))

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard/performance/succession" className="text-sm text-slate-600 underline underline-offset-2">← Succession Planning</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Compare Candidates</h1>
        <p className="text-sm text-slate-500 mt-0.5">The successors for one role, side by side.</p>
      </div>

      {plans.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">
          No succession plans yet. <Link href="/dashboard/performance/succession#plans" className="underline">Create one</Link>.
        </p>
      ) : (
        <>
          <form method="get" className="flex gap-2 flex-wrap items-end">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Succession plan</span>
              <select name="plan" defaultValue={planId ?? ''} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white min-w-[260px]">
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.roleTitle}{p.incumbent ? ` — ${p.incumbent.fullName}` : ''} ({p._count.candidates})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white">Compare</button>
          </form>

          {plan && (
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{plan.roleTitle}</span>
              {plan.incumbent ? ` · held by ${plan.incumbent.fullName}` : ' · vacant'}
              {profile
                ? ` · skill match against ${profile.source === 'DEFINED' ? 'the job profile' : 'what current holders know'} (${profile.skills.length} skills)`
                : ' · no job profile to match against'}
            </p>
          )}

          {candidates.length === 0 ? (
            <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">
              No successors on this plan yet.
            </p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2 font-semibold">Candidate</th>
                    <th className="px-4 py-2 font-semibold">Readiness</th>
                    <th className="px-4 py-2 font-semibold">Nine-box</th>
                    <th className="px-4 py-2 font-semibold text-right">Appraisal</th>
                    <th className="px-4 py-2 font-semibold">Potential</th>
                    <th className="px-4 py-2 font-semibold">Flight risk</th>
                    <th className="px-4 py-2 font-semibold text-right">Years here</th>
                    <th className="px-4 py-2 font-semibold text-right">Skill match</th>
                    <th className="px-4 py-2 font-semibold text-right">Open development</th>
                    <th className="px-4 py-2 font-semibold">Mentor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((c) => {
                    const r = rowOf.get(c.employee.id)
                    const held = new Map(c.employee.skills.map((s) => [s.skillId, s.level]))
                    const match = profile ? matchPercent(held, profile.skills) : null
                    return (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5">
                          <Link href={`/dashboard/team-insights/${c.employee.id}`} className="font-medium text-slate-900 underline underline-offset-2">
                            {c.employee.fullName}
                          </Link>
                          <span className="block text-xs text-slate-500">{c.employee.designation ?? '—'}</span>
                        </td>
                        <td className={`px-4 py-2.5 ${c.readiness === 'READY_NOW' ? 'text-emerald-800 font-medium' : 'text-slate-700'}`}>
                          {readinessLabel(c.readiness)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{r ? boxFor(r.performance, r.potential)?.name ?? 'Not placed' : 'Not placed'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r?.appraisalScore != null ? r.appraisalScore.toFixed(1) : '—'}</td>
                        <td className="px-4 py-2.5 text-slate-700">{r?.potential ? AXIS_LABELS.potential[r.potential as 1 | 2 | 3] : '—'}</td>
                        <td className="px-4 py-2.5 text-slate-700">{r?.flightRisk?.toLowerCase() ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{yearsSince(c.employee.joiningDate)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{match != null ? `${match}%` : '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.employee.developmentItems.length}</td>
                        <td className="px-4 py-2.5 text-slate-700">{c.employee.mentoredBy.length > 0 ? 'Yes' : 'No'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
