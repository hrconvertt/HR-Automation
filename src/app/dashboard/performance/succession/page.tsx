/**
 * Performance → Succession Planning. HR and executives.
 *
 * Workday's Succession Planning dashboard, on Convertt's own records: the
 * nine-box from the Talent Review, a scorecard of how well critical roles are
 * covered, the plans at risk, bench strength by readiness, and the plans
 * themselves with the incumbent over the people who could step in.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer, canSeeSuccession, canManageSuccession } from '@/lib/talent'
import { talentRows } from '@/lib/queries/talent-rows'
import { BOXES, AXIS_LABELS, boxFor, currentCycle } from '@/lib/talent-grid'
import { READINESS } from '@/lib/talent-labels'
import { SuccessionClient, type PlanView } from './_components/succession-client'

export default async function SuccessionPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!canSeeSuccession(viewer)) redirect('/dashboard/performance')

  const cycle = currentCycle()
  const [rows, plans, people] = await Promise.all([
    talentRows(cycle),
    prisma.successionPlan.findMany({
      orderBy: [{ critical: 'desc' }, { roleTitle: 'asc' }],
      select: {
        id: true, roleTitle: true, critical: true, note: true,
        incumbent: { select: { id: true, fullName: true, designation: true } },
        candidates: {
          select: {
            id: true, readiness: true, note: true,
            employee: { select: { id: true, fullName: true, designation: true } },
          },
        },
      },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, designation: true },
    }),
  ])

  const byEmployee = new Map(rows.map((r) => [r.employeeId, r]))
  const view: PlanView[] = plans.map((p) => ({
    id: p.id,
    roleTitle: p.roleTitle,
    critical: p.critical,
    note: p.note,
    incumbent: p.incumbent
      ? { ...p.incumbent, flightRisk: byEmployee.get(p.incumbent.id)?.flightRisk ?? null }
      : null,
    candidates: p.candidates.map((c) => {
      const r = byEmployee.get(c.employee.id)
      return {
        id: c.id,
        readiness: c.readiness,
        note: c.note,
        employee: { ...c.employee, boxName: r ? boxFor(r.performance, r.potential)?.name ?? null : null },
      }
    }),
  }))

  // The scorecard.
  const critical = view.filter((p) => p.critical)
  const readyNow = (p: PlanView) => p.candidates.some((c) => c.readiness === 'READY_NOW')
  const criticalReady = critical.filter(readyNow).length
  const withAny = view.filter((p) => p.candidates.length > 0).length
  const namedSuccessors = new Set(view.flatMap((p) => p.candidates.map((c) => c.employee.id))).size

  // At risk: nobody named, nobody ready while the holder might leave, or no
  // one ready now for a critical role.
  const atRisk = view
    .map((p) => {
      const risk = p.incumbent?.flightRisk
      const ready = readyNow(p)
      const reason =
        p.candidates.length === 0 ? 'No successor named'
          : !ready && (risk === 'HIGH' || risk === 'MEDIUM') ? `Holder is a ${risk.toLowerCase()} flight risk and nobody is ready now`
            : !ready && p.critical ? 'Critical role with nobody ready now'
              : null
      return reason ? { plan: p, reason, severe: p.candidates.length === 0 || risk === 'HIGH' } : null
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => Number(b.severe) - Number(a.severe))

  const placed = rows.filter((r) => r.performance && r.potential)
  const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Succession Planning</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Who could step into which role, and how soon. The nine-box comes from the Talent Review for {cycle};
          plans are kept here. {canManageSuccession(viewer) ? 'Add a plan, then add the people who could take it over.' : 'Read-only for executives.'}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Nine-box summary */}
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Nine-box · performance by potential</h2>
            <Link href="/dashboard/performance/talent" className="text-xs font-medium text-slate-900 underline underline-offset-2">
              Open Talent Review
            </Link>
          </div>
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-1.5 text-center">
            {[3, 2, 1].map((pot) => (
              <Row key={pot} pot={pot} rows={placed} />
            ))}
            <span />
            {[1, 2, 3].map((perf) => (
              <span key={perf} className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold pt-1">
                {AXIS_LABELS.performance[perf as 1 | 2 | 3]}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            {placed.length} of {rows.length} people placed.
            {rows.length - placed.length > 0 && ` ${rows.length - placed.length} need an appraisal score or a potential rating first.`}
          </p>
        </section>

        {/* Scorecard */}
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Succession scorecard</h2>
          <dl className="space-y-3">
            <Score label="Critical roles with a successor ready now" value={pct(criticalReady, critical.length)}
              sub={`${criticalReady} of ${critical.length} critical ${critical.length === 1 ? 'role' : 'roles'}`} />
            <Score label="Plans with at least one successor" value={pct(withAny, view.length)}
              sub={`${withAny} of ${view.length} ${view.length === 1 ? 'plan' : 'plans'}`} />
            <Score label="People named as a successor" value={String(namedSuccessors)} sub="across every plan" />
          </dl>
        </section>

        {/* Bench strength */}
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-900">Bench strength by readiness</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">Each plan&apos;s successors, nearest-ready first.</p>
          {view.length === 0 ? (
            <p className="text-xs text-slate-400">No plans yet.</p>
          ) : (
            <ul className="space-y-2">
              {view.map((p) => {
                const total = Math.max(1, p.candidates.length)
                return (
                  <li key={p.id}>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span className="truncate">{p.roleTitle}</span>
                      <span className="tabular-nums">{p.candidates.length}</span>
                    </div>
                    <div className="h-2.5 rounded bg-slate-100 flex overflow-hidden mt-1" title={READINESS.map((r) => `${r.label}: ${p.candidates.filter((c) => c.readiness === r.value).length}`).join(' · ')}>
                      {READINESS.map((r, i) => {
                        const n = p.candidates.filter((c) => c.readiness === r.value).length
                        return n ? (
                          <span key={r.value} style={{ width: `${(n / total) * 100}%` }}
                            className={i === 0 ? 'bg-emerald-600' : i === 1 ? 'bg-sky-500' : 'bg-slate-400'} />
                        ) : null
                      })}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-600">
            {READINESS.map((r, i) => (
              <span key={r.value} className="inline-flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-emerald-600' : i === 1 ? 'bg-sky-500' : 'bg-slate-400'}`} />
                {r.label}
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* Plans at risk */}
      <section className="space-y-3">
        <div className="border-b border-slate-200 pb-2">
          <h2 className="text-sm font-semibold text-slate-900">Succession plans at risk · {atRisk.length}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            No successor named, or nobody ready while the holder is a flight risk or the role is critical.
          </p>
        </div>
        {atRisk.length === 0 ? (
          <p className="bg-white border border-slate-200 rounded-xl px-4 py-5 text-sm text-slate-500">
            {view.length === 0 ? 'Nothing to assess until a plan exists.' : 'Every plan has cover.'}
          </p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2 font-semibold">Role</th>
                  <th className="px-4 py-2 font-semibold">Current holder</th>
                  <th className="px-4 py-2 font-semibold">Flight risk</th>
                  <th className="px-4 py-2 font-semibold">Successors</th>
                  <th className="px-4 py-2 font-semibold">Why it is at risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {atRisk.map(({ plan, reason, severe }) => (
                  <tr key={plan.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{plan.roleTitle}</td>
                    <td className="px-4 py-2.5 text-slate-700">{plan.incumbent?.fullName ?? 'Vacant'}</td>
                    <td className="px-4 py-2.5 text-slate-700">{plan.incumbent?.flightRisk?.toLowerCase() ?? 'not assessed'}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">{plan.candidates.length}</td>
                    <td className={`px-4 py-2.5 ${severe ? 'text-red-800 font-medium' : 'text-amber-800'}`}>{reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* The plans */}
      <section className="space-y-3">
        <div className="border-b border-slate-200 pb-2">
          <h2 className="text-sm font-semibold text-slate-900">Succession plans · {view.length}</h2>
          <p className="text-xs text-slate-500 mt-0.5">The holder on top, the people who could step in underneath.</p>
        </div>
        <SuccessionClient plans={view} people={people} canManage={canManageSuccession(viewer)} />
      </section>
    </div>
  )
}

function Row({ pot, rows }: { pot: number; rows: { performance: number | null; potential: number | null }[] }) {
  return (
    <>
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold self-center pr-1 text-right">
        {AXIS_LABELS.potential[pot as 1 | 2 | 3]}
      </span>
      {[1, 2, 3].map((perf) => {
        const box = BOXES.find((b) => b.performance === perf && b.potential === pot)!
        const n = rows.filter((r) => r.performance === perf && r.potential === pot).length
        return (
          <div key={perf} className={`rounded-md border px-1.5 py-2 ${n ? box.tone : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
            <p className="text-[10px] font-semibold leading-tight">{box.name}</p>
            <p className="text-base font-bold tabular-nums">{n}</p>
          </div>
        )
      })}
    </>
  )
}

function Score({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
      <div>
        <dt className="text-xs text-slate-600">{label}</dt>
        <p className="text-[11px] text-slate-400">{sub}</p>
      </div>
      <dd className="text-2xl font-bold text-slate-900 tabular-nums">{value}</dd>
    </div>
  )
}
