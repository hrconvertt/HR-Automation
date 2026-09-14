/**
 * Performance → Succession Planning. HR and executives.
 *
 * Workday's Succession Planning dashboard, on Convertt's own records: the
 * nine-box from the Talent Review, a scorecard of how well critical roles are
 * covered, succession plan equity by career level, the plans at risk, and
 * down the right the four steps of the process, each a link to where it is
 * done. Below: the high potentials, the succession pool, and the plans.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer, canSeeSuccession, canManageSuccession } from '@/lib/talent'
import { talentRows } from '@/lib/queries/talent-rows'
import { BOXES, AXIS_LABELS, boxFor, currentCycle } from '@/lib/talent-grid'
import { READINESS, readinessLabel } from '@/lib/talent-labels'
import { LEVELS, LEVEL_LABEL } from '@/lib/promotion'
import { SuccessionClient, type PlanView } from './_components/succession-client'

const HIGH_BOXES = new Set(['Successor', 'Growing star', 'High potential'])

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
        incumbent: { select: { id: true, fullName: true, designation: true, careerLevel: true } },
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
      ? {
          id: p.incumbent.id, fullName: p.incumbent.fullName, designation: p.incumbent.designation,
          flightRisk: byEmployee.get(p.incumbent.id)?.flightRisk ?? null,
        }
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

  // Equity by career level: of the plans for roles held at each level, how
  // many have somebody ready now, somebody ready later, or nobody.
  const levelOf = new Map(plans.map((p) => [p.id, p.incumbent?.careerLevel ?? null]))
  const equity = [...LEVELS, null].map((lvl) => {
    const here = view.filter((p) => (levelOf.get(p.id) ?? null) === lvl)
    return {
      level: lvl,
      label: lvl ? LEVEL_LABEL(lvl) : 'Level not set',
      total: here.length,
      now: here.filter(readyNow).length,
      later: here.filter((p) => !readyNow(p) && p.candidates.length > 0).length,
      none: here.filter((p) => p.candidates.length === 0).length,
    }
  }).filter((e) => e.total > 0)

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
  const highPotentials = placed
    .map((r) => ({ r, box: boxFor(r.performance, r.potential) }))
    .filter((x) => x.box && HIGH_BOXES.has(x.box.name))
  const pool = [...new Set(view.flatMap((p) => p.candidates.map((c) => c.employee.id)))].map((id) => {
    const on = view.flatMap((p) => p.candidates.filter((c) => c.employee.id === id).map((c) => ({ plan: p, c })))
    return { id, name: on[0].c.employee.fullName, designation: on[0].c.employee.designation, boxName: on[0].c.employee.boxName, on }
  }).sort((a, b) => a.name.localeCompare(b.name))
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

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_320px]">
        <div className="space-y-4">
          {/* Nine-box summary */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Nine-box · performance by potential</h2>
              <Link href="/dashboard/performance/talent" className="text-xs font-medium text-slate-900 underline underline-offset-2">
                Open Talent Review
              </Link>
            </div>
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-1.5 text-center">
              {[3, 2, 1].map((pot) => <Row key={pot} pot={pot} rows={placed} />)}
              <span />
              {[1, 2, 3].map((perf) => (
                <span key={perf} className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold pt-1">
                  {AXIS_LABELS.performance[perf as 1 | 2 | 3]}
                </span>
              ))}
            </div>
            <dl className="flex gap-6 mt-3 text-xs text-slate-600">
              <div><dt className="inline">Not shown </dt><dd className="inline font-semibold text-slate-900 tabular-nums">{rows.length - placed.length}</dd></div>
              <div><dt className="inline">Total </dt><dd className="inline font-semibold text-slate-900 tabular-nums">{rows.length}</dd></div>
            </dl>
            {rows.length - placed.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-1">Not shown: no appraisal score yet, or no potential rating.</p>
            )}
          </section>

          {/* Plans at risk */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Succession plans at risk · {atRisk.length}</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">No successor, or nobody ready while the holder may leave or the role is critical.</p>
            </div>
            {atRisk.length === 0 ? (
              <p className="px-4 py-5 text-sm text-slate-500">
                {view.length === 0 ? 'Nothing to assess until a plan exists.' : 'Every plan has cover.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                      <th className="px-4 py-2 font-semibold">Role</th>
                      <th className="px-4 py-2 font-semibold">Holder</th>
                      <th className="px-4 py-2 font-semibold">Flight risk</th>
                      <th className="px-4 py-2 font-semibold">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {atRisk.map(({ plan, reason, severe }) => (
                      <tr key={plan.id}>
                        <td className="px-4 py-2.5">
                          <Link href={`/dashboard/performance/succession/compare?plan=${plan.id}`}
                            className="font-medium text-slate-900 underline underline-offset-2">
                            {plan.roleTitle}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{plan.incumbent?.fullName ?? 'Vacant'}</td>
                        <td className="px-4 py-2.5 text-slate-700">{plan.incumbent?.flightRisk?.toLowerCase() ?? 'not assessed'}</td>
                        <td className={`px-4 py-2.5 ${severe ? 'text-red-800 font-medium' : 'text-amber-800'}`}>{reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          {/* Scorecard */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Succession scorecard</h2>
            <dl className="space-y-3">
              <Score label="Critical roles with a successor ready now" value={pct(criticalReady, critical.length)}
                sub={`${criticalReady} of ${critical.length} critical ${critical.length === 1 ? 'role' : 'roles'}`} />
              <Score label="Plans with at least one successor" value={pct(withAny, view.length)}
                sub={`${withAny} of ${view.length} ${view.length === 1 ? 'plan' : 'plans'}`} />
              <Score label="People named as a successor" value={String(namedSuccessors)} sub="the succession pool" />
            </dl>
          </section>

          {/* Plan equity */}
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-900">Succession plan equity</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
              By the career level of the role&apos;s holder: how many plans have someone ready now, ready later, or nobody.
            </p>
            {equity.length === 0 ? (
              <p className="text-xs text-slate-400">No plans yet.</p>
            ) : (
              <ul className="space-y-3">
                {equity.map((e) => (
                  <li key={e.label}>
                    <div className="flex justify-between text-xs text-slate-700">
                      <span className="truncate">{e.label}</span>
                      <span className="tabular-nums text-slate-500">{e.total} {e.total === 1 ? 'plan' : 'plans'}</span>
                    </div>
                    <div className="h-4 rounded bg-slate-100 flex overflow-hidden mt-1"
                      title={`Ready now ${e.now} · Ready later ${e.later} · No successor ${e.none}`}>
                      {e.now > 0 && <span className="bg-emerald-600" style={{ width: `${(e.now / e.total) * 100}%` }} />}
                      {e.later > 0 && <span className="bg-sky-400" style={{ width: `${(e.later / e.total) * 100}%` }} />}
                      {e.none > 0 && <span className="bg-slate-300" style={{ width: `${(e.none / e.total) * 100}%` }} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-600">
              <Legend color="bg-emerald-600" label="Ready now" />
              <Legend color="bg-sky-400" label="Ready later" />
              <Legend color="bg-slate-300" label="No successor" />
            </div>
          </section>
        </div>

        {/* The process, step by step, as Workday lists it. */}
        <aside className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 h-fit">
          <Step n={1} title="Assessing potential" links={[
            { href: '/dashboard/performance/talent', label: 'Assess potential (individual)' },
            { href: '/dashboard/performance/talent', label: 'Assess potential (team)' },
            { href: '#high-potentials', label: 'High potentials' },
          ]} />
          <Step n={2} title="Talent and succession pools" links={[
            { href: '/dashboard/performance/skills?tab=snapshot#expertise', label: 'Expertise finder' },
            { href: '#succession-pool', label: 'View succession pool' },
            { href: '/dashboard/performance/succession/compare', label: 'Compare workers in the succession pool' },
          ]} />
          <Step n={3} title="Succession planning" links={[
            { href: '#plans', label: 'Succession plans' },
            { href: '/dashboard/performance/succession/compare', label: 'Compare candidates by succession plan' },
            { href: '/dashboard/performance/succession/navigate', label: 'Navigate succession plans' },
          ]} />
          <Step n={4} title="Talent calibration" links={[
            { href: '/dashboard/performance/talent', label: 'Talent matrix — potential by performance' },
            { href: '/dashboard/performance/appraisals', label: 'Appraisal forms' },
          ]} />
        </aside>
      </div>

      {/* High potentials */}
      <section id="high-potentials" className="space-y-3 scroll-mt-4">
        <Head title={`High potentials · ${highPotentials.length}`}
          blurb="The top-right of the nine-box: Successor, Growing star and High potential." />
        {highPotentials.length === 0 ? (
          <p className="bg-white border border-slate-200 rounded-xl px-4 py-5 text-sm text-slate-500">
            Nobody placed there yet. Set potential on the Talent Review to fill this in.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {highPotentials.map(({ r, box }) => (
              <div key={r.employeeId} className="bg-white border border-slate-200 rounded-xl p-4">
                <Link href={`/dashboard/team-insights/${r.employeeId}`} className="text-sm font-semibold text-slate-900 underline underline-offset-2">
                  {r.fullName}
                </Link>
                <p className="text-xs text-slate-500">{r.designation ?? '—'}</p>
                <p className="text-xs text-slate-800 mt-2 font-medium">{box?.name}</p>
                <p className="text-[11px] text-slate-500">
                  Flight risk {r.flightRisk?.toLowerCase() ?? 'not assessed'}
                  {pool.some((p) => p.id === r.employeeId) ? ' · in the succession pool' : ' · not named on any plan'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Succession pool */}
      <section id="succession-pool" className="space-y-3 scroll-mt-4">
        <Head title={`Succession pool · ${pool.length}`} blurb="Everyone named as a successor, and for what." />
        {pool.length === 0 ? (
          <p className="bg-white border border-slate-200 rounded-xl px-4 py-5 text-sm text-slate-500">Nobody named yet.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2 font-semibold">Person</th>
                  <th className="px-4 py-2 font-semibold">Nine-box</th>
                  <th className="px-4 py-2 font-semibold">Named for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pool.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-900">{p.name}</span>
                      <span className="block text-xs text-slate-500">{p.designation ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{p.boxName ?? 'Not placed'}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {p.on.map(({ plan, c }) => (
                        <span key={c.id} className="block">
                          <Link href={`/dashboard/performance/succession/compare?plan=${plan.id}`} className="underline underline-offset-2">
                            {plan.roleTitle}
                          </Link>
                          <span className="text-slate-500"> · {readinessLabel(c.readiness)}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* The plans */}
      <section id="plans" className="space-y-3 scroll-mt-4">
        <div className="flex items-start justify-between gap-3 flex-wrap border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Succession plans · {view.length}</h2>
            <p className="text-xs text-slate-500 mt-0.5">The holder on top, the people who could step in underneath.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/performance/succession/navigate"
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Navigate succession plans</Link>
            <Link href="/dashboard/performance/succession/compare"
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Compare candidates</Link>
          </div>
        </div>
        <SuccessionClient plans={view} people={people} canManage={canManageSuccession(viewer)} />
      </section>

      <p className="text-[11px] text-slate-400">
        Readiness: {READINESS.map((r) => r.label).join(' · ')}. Bench strength per plan shows on each plan card.
      </p>
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

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${color}`} />{label}</span>
}

function Step({ n, title, links }: { n: number; title: string; links: { href: string; label: string }[] }) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-semibold text-slate-900">Step {n}: {title}</p>
      <ul className="mt-1.5 space-y-1">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="text-[13px] text-slate-700 hover:text-slate-900 underline underline-offset-2">{l.label}</Link>
          </li>
        ))}
      </ul>
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
