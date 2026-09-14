/**
 * Help Center → My Cases. HR sees the whole queue here, filtered by status
 * and service team; everyone else sees the cases they raised or that are for
 * them.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { caseScope, seesAllCases } from '@/lib/help-center-server'
import {
  SERVICE_TEAMS, OPEN_CASE_STATUSES, caseLabel, caseStatusLabel, caseTypeOf, serviceTeamLabel,
} from '@/lib/help-center'

const SHOW = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved & closed' },
  { key: 'all', label: 'All' },
] as const

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default async function CasesPage(
  { searchParams }: { searchParams: Promise<{ show?: string; team?: string; mine?: string }> },
) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const sp = await searchParams
  const queue = seesAllCases(viewer)
  const show = SHOW.some((s) => s.key === sp.show) ? sp.show! : queue ? 'open' : 'all'
  const team = SERVICE_TEAMS.some((t) => t.key === sp.team) ? sp.team! : null
  const mine = queue && sp.mine === '1'

  const where = {
    ...caseScope(viewer),
    ...(show === 'open' ? { status: { in: OPEN_CASE_STATUSES } } : show === 'resolved' ? { status: { in: ['RESOLVED', 'CLOSED'] } } : {}),
    ...(team ? { serviceTeam: team } : {}),
    ...(mine ? { assignedToId: viewer.userId } : {}),
  }
  const cases = await prisma.helpDeskTicket.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    take: 200,
    select: {
      id: true, caseNumber: true, subject: true, category: true, serviceTeam: true, status: true, priority: true,
      createdAt: true, updatedAt: true, assignedToId: true,
      employee: { select: { fullName: true } },
      _count: { select: { replies: true } },
    },
  })
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { show, team: team ?? undefined, mine: mine ? '1' : undefined, ...extra }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    return `/dashboard/help/cases?${p}`
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link href="/dashboard/help" className="text-sm text-slate-600 underline underline-offset-2">← Help Center</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{queue ? 'Cases' : 'My cases'}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {queue ? 'Every case, newest activity first. Open one to reply, assign it or resolve it.' : 'Cases you opened or that were opened for you. Open one to read replies or add to it.'}
          </p>
        </div>
        <div className="flex gap-2">
          {queue && <Link href="/dashboard/help/case-management" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50">Case Management</Link>}
          <Link href="/dashboard/help/cases/new" className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-blue-700 text-white">Create case</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {SHOW.map((s) => (
          <Link key={s.key} href={qs({ show: s.key })}
            className={`text-xs px-3 py-1.5 rounded-full border ${show === s.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
            {s.label}
          </Link>
        ))}
        {queue && (
          <>
            <span className="text-slate-300 mx-1">|</span>
            <Link href={qs({ team: undefined })}
              className={`text-xs px-3 py-1.5 rounded-full border ${!team ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
              Every team
            </Link>
            {SERVICE_TEAMS.map((t) => (
              <Link key={t.key} href={qs({ team: t.key })}
                className={`text-xs px-3 py-1.5 rounded-full border ${team === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
                {t.label}
              </Link>
            ))}
            <span className="text-slate-300 mx-1">|</span>
            <Link href={qs({ mine: mine ? undefined : '1' })}
              className={`text-xs px-3 py-1.5 rounded-full border ${mine ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
              Assigned to me
            </Link>
          </>
        )}
      </div>

      {cases.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-500">No cases here.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold">Case</th>
                <th className="px-4 py-2 font-semibold">Title</th>
                {queue && <th className="px-4 py-2 font-semibold">For</th>}
                <th className="px-4 py-2 font-semibold">Type</th>
                {queue && <th className="px-4 py-2 font-semibold">Service team</th>}
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Last activity</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">{caseLabel(c.caseNumber, c.id)}</td>
                  <td className="px-4 py-2.5 max-w-[280px]">
                    <Link href={`/dashboard/help/cases/${c.id}`} className="font-medium text-blue-700 underline underline-offset-2 line-clamp-1">{c.subject}</Link>
                    <span className="text-[11px] text-slate-400">{c._count.replies} {c._count.replies === 1 ? 'reply' : 'replies'}{c.priority === 'URGENT' || c.priority === 'HIGH' ? ` · ${c.priority.toLowerCase()} priority` : ''}</span>
                  </td>
                  {queue && <td className="px-4 py-2.5 text-slate-700">{c.employee.fullName}</td>}
                  <td className="px-4 py-2.5 text-slate-700">{caseTypeOf(c.category).label}</td>
                  {queue && <td className="px-4 py-2.5 text-slate-700">{serviceTeamLabel(c.serviceTeam ?? caseTypeOf(c.category).team)}</td>}
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${c.status === 'OPEN' ? 'bg-blue-50 text-blue-800 border border-blue-200' : ['RESOLVED', 'CLOSED'].includes(c.status) ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                      {caseStatusLabel(c.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{day(c.updatedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/dashboard/help/cases/${c.id}`} className="text-sm font-medium text-slate-900 underline underline-offset-2 whitespace-nowrap">Open case</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
