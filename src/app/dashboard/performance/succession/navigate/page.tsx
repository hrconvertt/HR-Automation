/**
 * Navigate Succession Plans — Workday's org-chart view of succession.
 *
 * Pick an organization (a department) and the chart opens on its head: the
 * person on top with how many successors they have, the successors beneath
 * with how soon each is ready, the chain of managers above down the right,
 * and their direct reports to walk down to. HR and executives.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer, canSeeSuccession } from '@/lib/talent'
import { talentRows } from '@/lib/queries/talent-rows'
import { boxFor, currentCycle } from '@/lib/talent-grid'
import { READINESS, readinessLabel } from '@/lib/talent-labels'
import { getInitials } from '@/lib/utils'

export default async function NavigateSuccessionPage(
  { searchParams }: { searchParams: Promise<{ department?: string; person?: string }> },
) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!canSeeSuccession(viewer)) redirect('/dashboard/performance')
  const sp = await searchParams
  const live = { status: 'ACTIVE', deletedAt: null }

  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, headEmployeeId: true },
  })

  // Where the chart starts: the person asked for, or the head of the chosen
  // department — or, where no head is set, its most senior member (the one
  // whose manager sits outside the department).
  let personId = sp.person ?? null
  if (!personId && sp.department) {
    const dept = departments.find((d) => d.id === sp.department)
    if (dept?.headEmployeeId) personId = dept.headEmployeeId
    else if (dept) {
      const members = await prisma.employee.findMany({
        where: { ...live, departmentId: dept.id },
        select: { id: true, reportingManagerId: true, reportingManager: { select: { departmentId: true } } },
      })
      const top = members.find((m) => !m.reportingManagerId || m.reportingManager?.departmentId !== dept.id)
      personId = top?.id ?? members[0]?.id ?? null
    }
  }

  if (!personId) {
    return (
      <div className="space-y-5">
        <Header />
        <form method="get" className="bg-white border border-slate-200 rounded-xl p-5 max-w-lg space-y-3">
          <label className="block">
            <span className="block text-sm font-medium text-slate-800 mb-1">Organization <span className="text-red-700">*</span></span>
            <select name="department" required defaultValue=""
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="" disabled>Select a department…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white">Show chart</button>
            <Link href="/dashboard/performance/succession" className="text-sm px-4 py-2 rounded-lg border border-slate-300">Cancel</Link>
          </div>
          {sp.department && <p className="text-xs text-amber-800">Nobody active in that department.</p>}
        </form>
      </div>
    )
  }

  const person = await prisma.employee.findUnique({
    where: { id: personId },
    select: {
      id: true, fullName: true, designation: true, reportingManagerId: true,
      department: { select: { name: true } },
      successionsHeld: {
        select: {
          id: true, roleTitle: true,
          candidates: { select: { id: true, readiness: true, employee: { select: { id: true, fullName: true, designation: true } } } },
        },
      },
      directReports: {
        where: live,
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true, designation: true, _count: { select: { successionsHeld: true } } },
      },
    },
  })
  if (!person) redirect('/dashboard/performance/succession/navigate')

  // The chain above, top first.
  const chain: { id: string; fullName: string }[] = []
  let up = person.reportingManagerId
  for (let i = 0; up && i < 12; i++) {
    const m = await prisma.employee.findUnique({ where: { id: up }, select: { id: true, fullName: true, reportingManagerId: true } })
    if (!m) break
    chain.unshift({ id: m.id, fullName: m.fullName })
    up = m.reportingManagerId
  }

  const rows = await talentRows(currentCycle())
  const boxOf = new Map(rows.map((r) => [r.employeeId, boxFor(r.performance, r.potential)?.name ?? null]))
  const order = (r: string) => READINESS.findIndex((x) => x.value === r)
  const successors = person.successionsHeld
    .flatMap((p) => p.candidates.map((c) => ({ ...c, roleTitle: p.roleTitle })))
    .sort((a, b) => order(a.readiness) - order(b.readiness))
  const plan = person.successionsHeld[0] ?? null

  return (
    <div className="space-y-5">
      <Header />
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/dashboard/performance/succession/navigate"
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Choose another organization</Link>
        {person.reportingManagerId && (
          <Link href={`/dashboard/performance/succession/navigate?person=${person.reportingManagerId}`}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Up to their manager</Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
          <div className="flex flex-col items-center min-w-[560px]">
            <div className="w-64 rounded-lg border-t-4 border-slate-900 border-x border-b border-slate-200 px-3 py-3 text-center relative">
              <p className="text-xs font-medium text-slate-700 underline underline-offset-2">{plan?.roleTitle ?? person.designation}</p>
              <div className="w-14 h-14 mx-auto mt-2 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-semibold relative">
                {getInitials(person.fullName)}
                {successors.length > 0 && (
                  <span className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center"
                    title={`${successors.length} successors`}>
                    {successors.length}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-900 mt-1.5">{person.fullName}</p>
              <p className="text-xs text-slate-500">{person.department?.name ?? '—'}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {plan ? 'Succession plan' : 'No succession plan'}
              </p>
            </div>

            <div className="w-px h-5 bg-slate-300" />

            {successors.length === 0 ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No successor named for {person.fullName.split(' ')[0]}.{' '}
                <Link href="/dashboard/performance/succession#plans" className="underline">Add a plan</Link>
              </p>
            ) : (
              <div className="flex gap-3 flex-wrap justify-center border-t border-slate-300 pt-4">
                {successors.map((c, i) => (
                  <div key={c.id} className="w-44 rounded-lg border border-slate-200 px-3 py-3 text-center">
                    <div className="w-11 h-11 mx-auto rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold">
                      {getInitials(c.employee.fullName)}
                    </div>
                    <Link href={`/dashboard/performance/succession/navigate?person=${c.employee.id}`}
                      className="text-sm font-semibold text-slate-900 underline underline-offset-2 block mt-1.5">
                      {c.employee.fullName}
                    </Link>
                    <p className="text-xs text-slate-500">{c.employee.designation ?? '—'}</p>
                    <p className={`text-xs mt-1 font-medium ${c.readiness === 'READY_NOW' ? 'text-emerald-800' : 'text-slate-700'}`}>
                      {readinessLabel(c.readiness)}{i === 0 ? ' · Top candidate' : ''}
                    </p>
                    {boxOf.get(c.employee.id) && <p className="text-[11px] text-slate-500">{boxOf.get(c.employee.id)}</p>}
                  </div>
                ))}
              </div>
            )}

            {person.directReports.length > 0 && (
              <div className="w-full mt-6 pt-4 border-t border-slate-100">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2 text-center">
                  Their team — open one to see their successors
                </p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {person.directReports.map((r) => (
                    <Link key={r.id} href={`/dashboard/performance/succession/navigate?person=${r.id}`}
                      className="text-xs px-3 py-1.5 rounded-full border border-slate-300 hover:bg-slate-50 text-slate-800">
                      {r.fullName}{r._count.successionsHeld > 0 ? ' · has a plan' : ''}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* The chain of managers, as Workday lists it down the right. */}
        <aside className="bg-white border border-slate-200 rounded-xl p-4 h-fit">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Reporting line</p>
          <ol className="space-y-1.5">
            {chain.map((m) => (
              <li key={m.id}>
                <Link href={`/dashboard/performance/succession/navigate?person=${m.id}`}
                  className="text-sm text-slate-800 underline underline-offset-2">{m.fullName}</Link>
              </li>
            ))}
            <li className="text-sm font-semibold text-slate-900 bg-slate-100 rounded px-2 py-1">{person.fullName} ←</li>
          </ol>
        </aside>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <Link href="/dashboard/performance/succession" className="text-sm text-slate-600 underline underline-offset-2">← Succession Planning</Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2">Navigate Succession Plans</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Walk the org chart: each person with the successors named for them, and the people who report to them.
      </p>
    </div>
  )
}
