/**
 * Help Center → Case Management. HR and executives.
 *
 * Workday's Case Management dashboard: open cases by status and service
 * team, by case type and by category, each with its table, and Create Case /
 * View Cases down the right. Executives see the counts; only HR opens cases.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { isCaseAgent } from '@/lib/help-center-server'
import {
  SERVICE_TEAMS, OPEN_CASE_STATUSES, caseTypeOf, articleCategoryLabel, serviceTeamLabel,
} from '@/lib/help-center'
import { TeamStatusChart, CountColumns, CountBars } from './_components/case-charts'

export default async function CaseManagementPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (viewer.effectiveRole !== 'HR_ADMIN' && viewer.effectiveRole !== 'EXECUTIVE') redirect('/dashboard/help')
  const agent = isCaseAgent(viewer)

  const [open, resolvedThisMonth, all] = await Promise.all([
    prisma.helpDeskTicket.findMany({
      where: { status: { in: OPEN_CASE_STATUSES } },
      select: { status: true, category: true, serviceTeam: true, createdAt: true, assignedToId: true },
    }),
    prisma.helpDeskTicket.count({
      where: { status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
    }),
    prisma.helpDeskTicket.findMany({
      where: { resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
      orderBy: { resolvedAt: 'desc' },
      take: 50,
    }),
  ])

  const teamOf = (t: { serviceTeam: string | null; category: string }) => t.serviceTeam ?? caseTypeOf(t.category).team
  const byTeam = SERVICE_TEAMS.map((team) => {
    const here = open.filter((t) => teamOf(t) === team.key)
    return {
      key: team.key,
      team: team.label,
      New: here.filter((t) => t.status === 'OPEN').length,
      'In progress': here.filter((t) => t.status === 'IN_PROGRESS').length,
      'On hold': here.filter((t) => t.status === 'ON_HOLD').length,
      total: here.length,
    }
  }).filter((r) => r.total > 0)

  const typeCounts = new Map<string, number>()
  const categoryCounts = new Map<string, number>()
  for (const t of open) {
    typeCounts.set(t.category, (typeCounts.get(t.category) ?? 0) + 1)
    const cat = caseTypeOf(t.category).category
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1)
  }
  const byType = [...typeCounts].map(([k, count]) => ({ key: k, name: caseTypeOf(k).label, count })).sort((a, b) => b.count - a.count)
  const byCategory = [...categoryCounts].map(([k, count]) => ({ key: k, name: articleCategoryLabel(k), count })).sort((a, b) => b.count - a.count)
  const unassigned = open.filter((t) => !t.assignedToId).length
  const avgDays = all.length
    ? all.reduce((s, t) => s + ((t.resolvedAt as Date).getTime() - t.createdAt.getTime()), 0) / all.length / 86_400_000
    : null
  const casesLink = (params: string) => (agent ? `/dashboard/help/cases?show=open&${params}` : null)

  return (
    <div className="space-y-5">
      <div className="bg-blue-900 -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 px-6 py-4">
        <h1 className="text-2xl font-semibold text-white">Case Management</h1>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Figure label="Open cases" value={String(open.length)} />
        <Figure label="Not assigned" value={String(unassigned)} alarm={unassigned > 0} />
        <Figure label="Resolved this month" value={String(resolvedThisMonth)} />
        <Figure label="Average days to resolve" value={avgDays == null ? '—' : avgDays.toFixed(1)} sub={all.length ? `last ${all.length} resolved` : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_300px]">
        <Panel title="View open cases by status and service team">
          {byTeam.length === 0 ? <Empty /> : (
            <>
              <TeamStatusChart data={byTeam} />
              <Table head={['Service team', 'New', 'In progress', 'On hold', 'Count']}>
                {byTeam.map((r) => (
                  <tr key={r.key}>
                    <td className="px-3 py-2"><MaybeLink href={casesLink(`team=${r.key}`)}>{r.team}</MaybeLink></td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.New}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r['In progress']}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r['On hold']}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.total}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{byTeam.reduce((s, r) => s + r.New, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{byTeam.reduce((s, r) => s + r['In progress'], 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{byTeam.reduce((s, r) => s + r['On hold'], 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{open.length}</td>
                </tr>
              </Table>
            </>
          )}
        </Panel>

        <Panel title="View open cases by case type">
          {byType.length === 0 ? <Empty /> : (
            <>
              <CountColumns data={byType} />
              <Table head={['Case type', 'Count']}>
                {byType.map((r) => (
                  <tr key={r.key}>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold"><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{open.length}</td></tr>
              </Table>
            </>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Cases">
            <ul className="divide-y divide-slate-100 -mx-4">
              <li><Link href="/dashboard/help/cases/new" className="block px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50">Create case ›</Link></li>
              {agent && <li><Link href="/dashboard/help/cases" className="block px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50">View cases ›</Link></li>}
              {agent && <li><Link href="/dashboard/help/cases?mine=1" className="block px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50">Cases assigned to me ›</Link></li>}
              {agent && <li><Link href="/dashboard/help/manage" className="block px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50">Manage Help Center articles ›</Link></li>}
            </ul>
          </Panel>
          <Panel title="View open cases by category">
            {byCategory.length === 0 ? <Empty /> : (
              <>
                <CountBars data={byCategory} />
                <Table head={['Case category', 'Count']}>
                  {byCategory.map((r) => (
                    <tr key={r.key}>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </Panel>
        </div>
      </div>

      {!agent && <p className="text-xs text-slate-500">Executives see the counts. Case contents stay with HR and the people involved.</p>}
      <p className="text-[11px] text-slate-400">Service teams: {SERVICE_TEAMS.map((t) => serviceTeamLabel(t.key)).join(' · ')}. A case&apos;s type decides its team.</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Empty() {
  return <p className="text-sm text-slate-400 py-8 text-center">No open cases.</p>
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-x-auto mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
            {head.map((h, i) => <th key={h} className={`px-3 py-2 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  )
}

function MaybeLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? <Link href={href} className="text-blue-700 underline underline-offset-2">{children}</Link> : <>{children}</>
}

function Figure({ label, value, sub, alarm }: { label: string; value: string; sub?: string; alarm?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${alarm ? 'text-amber-800' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}
