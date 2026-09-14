/**
 * One case: what was asked, the conversation, and where it stands. HR works
 * it from the panel on the right; the person can reply, close or reopen it.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { canSeeCase, isCaseAgent, seesAllCases, knowledgeFor, searchKnowledge } from '@/lib/help-center-server'
import { caseLabel, caseStatusLabel, caseTypeOf, serviceTeamLabel } from '@/lib/help-center'
import { ReplyBox, RequesterControls, AgentPanel } from './_components/case-actions'

const when = (d: Date) => d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const { id } = await params
  const c = await prisma.helpDeskTicket.findUnique({
    where: { id },
    select: {
      id: true, caseNumber: true, subject: true, description: true, category: true, serviceTeam: true,
      status: true, priority: true, resolution: true, resolvedAt: true, assignedToId: true, createdById: true,
      employeeId: true, attachmentName: true, createdAt: true, updatedAt: true,
      employee: { select: { fullName: true, designation: true, employeeCode: true } },
      replies: { orderBy: { createdAt: 'asc' }, select: { id: true, authorId: true, message: true, isInternal: true, createdAt: true } },
    },
  })
  if (!c || !canSeeCase(viewer, c)) notFound()

  const agent = isCaseAgent(viewer)
  const hrReader = seesAllCases(viewer)
  const replies = c.replies.filter((r) => hrReader || !r.isInternal)
  const userIds = [...new Set([...replies.map((r) => r.authorId), c.createdById, c.assignedToId].filter((x): x is string => !!x))]
  const [users, agentUsers, entries] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, role: true, employee: { select: { fullName: true } } } }),
    agent ? prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { id: true, email: true, employee: { select: { fullName: true } } } }) : Promise.resolve([]),
    knowledgeFor(viewer.effectiveRole),
  ])
  const nameOf = new Map(users.map((u) => [u.id, u.employee?.fullName ?? u.email]))
  const hrIds = new Set(users.filter((u) => u.role === 'HR_ADMIN').map((u) => u.id))
  const type = caseTypeOf(c.category)
  const suggestions = searchKnowledge(entries, `${c.subject} ${type.label}`).slice(0, 3)
  const done = ['RESOLVED', 'CLOSED'].includes(c.status)
  const own = !viewer.isPreviewMode && (c.employeeId === viewer.employeeId || c.createdById === viewer.userId)

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <nav className="text-sm text-slate-600" aria-label="Breadcrumb">
        <Link href="/dashboard/help" className="text-blue-700 underline underline-offset-2">Help Center</Link>
        <span className="mx-2">›</span>
        <Link href="/dashboard/help/cases" className="text-blue-700 underline underline-offset-2">{hrReader ? 'Cases' : 'My cases'}</Link>
        <span className="mx-2">›</span>
        <span>{caseLabel(c.caseNumber, c.id)}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-600">{caseLabel(c.caseNumber, c.id)}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${c.status === 'OPEN' ? 'bg-blue-50 text-blue-800 border border-blue-200' : done ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                {caseStatusLabel(c.status)}
              </span>
              {c.category === 'CONFIDENTIAL' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-900 text-white">Confidential — HR only</span>}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">{c.subject}</h1>
            <p className="text-sm text-slate-500 mt-1">Opened {when(c.createdAt)}{c.createdById && c.createdById !== viewer.userId ? ` by ${nameOf.get(c.createdById) ?? 'someone'}` : ''}</p>
            <p className="text-sm text-slate-800 mt-4 whitespace-pre-wrap">{c.description}</p>
            {c.attachmentName && (
              <a href={`/api/help/cases/${c.id}/attachment`} target="_blank" rel="noreferrer"
                className="inline-block mt-4 text-sm font-medium text-blue-700 underline underline-offset-2">
                Open attachment: {c.attachmentName}
              </a>
            )}
          </section>

          {done && c.resolution && (
            <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-emerald-900">Resolution</p>
              <p className="text-sm text-emerald-900 mt-1 whitespace-pre-wrap">{c.resolution}</p>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Conversation · {replies.length}</h2>
            {replies.length === 0 ? (
              <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-5">No replies yet. A specialist will pick it up.</p>
            ) : (
              <ul className="space-y-3">
                {replies.map((r) => {
                  const fromHR = hrIds.has(r.authorId)
                  return (
                    <li key={r.id} className={`rounded-xl border p-4 ${r.isInternal ? 'bg-amber-50 border-amber-200' : fromHR ? 'bg-blue-50/60 border-blue-100' : 'bg-white border-slate-200'}`}>
                      <p className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">{nameOf.get(r.authorId) ?? 'Someone'}</span>
                        {fromHR && ' · HR'}{r.isInternal && ' · internal note'} · {when(r.createdAt)}
                      </p>
                      <p className="text-sm text-slate-800 mt-1.5 whitespace-pre-wrap">{r.message}</p>
                    </li>
                  )
                })}
              </ul>
            )}
            {!viewer.isPreviewMode && (own || agent) && <ReplyBox caseId={c.id} agent={agent} closed={done} />}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <dl className="space-y-3 text-sm">
              <Detail label="For" value={`${c.employee.fullName} · ${c.employee.designation}`} />
              <Detail label="Case type" value={type.label} />
              <Detail label="Service team" value={serviceTeamLabel(c.serviceTeam ?? type.team)} />
              <Detail label="Assigned to" value={c.assignedToId ? nameOf.get(c.assignedToId) ?? 'HR' : 'Not assigned yet'} />
              <Detail label="Priority" value={c.priority.charAt(0) + c.priority.slice(1).toLowerCase()} />
              <Detail label="Last activity" value={when(c.updatedAt)} />
            </dl>
            {own && !agent && <div className="mt-4"><RequesterControls caseId={c.id} status={c.status} /></div>}
          </section>

          {agent && (
            <AgentPanel caseId={c.id} status={c.status} assignedToId={c.assignedToId} resolution={c.resolution}
              priority={c.priority} type={c.category}
              agents={agentUsers.map((u) => ({ userId: u.id, name: u.employee?.fullName ?? u.email }))} />
          )}

          {suggestions.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-900">Suggested resources</p>
              <ul className="mt-2 space-y-2">
                {suggestions.map((s) => (
                  <li key={`${s.kind}:${s.id}`}>
                    <Link href={s.href} className="text-sm text-blue-700 underline underline-offset-2">{s.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  )
}
