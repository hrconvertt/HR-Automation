/**
 * One journey in the studio — Workday's three tabs:
 *
 *   Editor   settings, modules and steps
 *   Preview  exactly what a person sees, nothing recorded
 *   Metrics  recipients, completion rate, last distribution, journey status,
 *            days to start and finish, and which steps people actually use
 *
 * Distribute sits top-right, as Workday puts it.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { isJourneyAdmin, buildProgress } from '@/lib/experience-server'
import { ASSIGN_METHOD_LABEL, STEP_TYPES, stepTypeOf } from '@/lib/experience'
import { JourneyPlayer, type PlayerView } from '@/components/experience/journey-player'
import { JourneyEditor } from './_components/journey-editor'
import { DistributeButton } from './_components/distribute-button'

const TABS = [
  { key: 'editor', label: 'Editor' },
  { key: 'preview', label: 'Preview' },
  { key: 'metrics', label: 'Metrics' },
] as const
const DAY = 86_400_000
const TYPE_COLORS: Record<string, string> = {
  ARTICLE: '#99f6e4', TEXT: '#f9a8d4', LINK: '#93c5fd', VIDEO: '#c4b5fd', LEARNING: '#fdba74', TASK: '#fde68a',
}

export default async function StudioJourneyPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; step?: string; module?: string }>
}) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!isJourneyAdmin(viewer)) redirect('/dashboard/my-journeys')
  const { id } = await params
  const sp = await searchParams
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : 'editor'

  const journey = await prisma.experienceJourney.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, status: true, autoAssign: true, bannerTone: true, createdAt: true,
      modules: {
        orderBy: { seq: 'asc' },
        select: {
          id: true, title: true, description: true, seq: true,
          steps: { orderBy: { seq: 'asc' }, select: { id: true, title: true, body: true, type: true, url: true, programId: true, required: true, dueDays: true, minutes: true, seq: true } },
        },
      },
    },
  })
  if (!journey) notFound()

  const live = { status: 'ACTIVE', deletedAt: null }
  const [programs, people, departments, managerCount, assigned] = await Promise.all([
    prisma.trainingProgram.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true } }),
    prisma.employee.findMany({ where: live, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, department: { select: { name: true } } } }),
    prisma.department.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.employee.count({ where: { ...live, directReports: { some: live } } }),
    prisma.experienceAssignment.findMany({ where: { journeyId: id }, select: { employeeId: true } }),
  ])
  const has = new Set(assigned.map((a) => a.employeeId))

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl px-5 pt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/journeys/studio" className="text-sm text-slate-600 underline underline-offset-2">← Journeys</Link>
            <h1 className="text-xl font-semibold text-slate-900">{journey.title}</h1>
            {journey.status !== 'PUBLISHED' && <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Draft</span>}
          </div>
          <div className="flex items-center gap-2">
            <DistributeButton
              journeyId={journey.id}
              published={journey.status === 'PUBLISHED'}
              people={people.map((p) => ({ id: p.id, fullName: p.fullName, department: p.department?.name ?? null, has: has.has(p.id) }))}
              departments={departments}
              managerCount={managerCount}
            />
          </div>
        </div>
        <nav className="flex gap-1 mt-3" aria-label="Journey tabs">
          {TABS.map((t) => (
            <Link key={t.key} href={`/dashboard/journeys/studio/${journey.id}?tab=${t.key}`} aria-current={tab === t.key ? 'page' : undefined}
              className={`px-3 py-2 text-sm border-b-2 ${tab === t.key ? 'border-blue-700 text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {tab === 'editor' && <JourneyEditor journey={journey} programs={programs} />}

      {tab === 'preview' && (() => {
        const p = buildProgress(journey, null, viewer.employeeId ?? 'me')
        const base = `/dashboard/journeys/studio/${journey.id}?tab=preview`
        const step = sp.step ? p.steps.find((s) => s.id === sp.step) : undefined
        const mod = sp.module ? p.modules.find((m) => m.id === sp.module) : undefined
        const view: PlayerView = step ? { kind: 'step', step } : mod ? { kind: 'module', module: mod } : p.next ? { kind: 'step', step: p.next } : { kind: 'done' }
        return (
          <JourneyPlayer title={journey.title} tone={journey.bannerTone} modules={p.modules} view={view}
            remaining={p.remaining} pct={0}
            hrefFor={(sid) => `${base}&step=${sid}`} moduleHref={(mid) => `${base}&module=${mid}`}
            assignmentId={null} programHref={(pid) => `/dashboard/learning/programs/${pid}`} now={new Date()} />
        )
      })()}

      {tab === 'metrics' && <Metrics journeyId={journey.id} />}
    </div>
  )
}

async function Metrics({ journeyId }: { journeyId: string }) {
  const [assignments, steps] = await Promise.all([
    prisma.experienceAssignment.findMany({
      where: { journeyId },
      orderBy: { assignedAt: 'desc' },
      select: {
        assignedAt: true, startedAt: true, completedAt: true, method: true,
        employee: { select: { fullName: true } },
        progress: { select: { stepId: true, viewedAt: true, completedAt: true } },
      },
    }),
    prisma.experienceStep.findMany({
      where: { module: { journeyId } },
      select: { id: true, title: true, type: true, required: true },
    }),
  ])
  const n = assignments.length
  const completed = assignments.filter((a) => a.completedAt).length
  const started = assignments.filter((a) => a.startedAt && !a.completedAt).length
  const notStarted = n - completed - started
  const avg = (vals: number[]) => (vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null)
  const daysToStart = avg(assignments.filter((a) => a.startedAt).map((a) => (a.startedAt!.getTime() - a.assignedAt.getTime()) / DAY))
  const daysToFinish = avg(assignments.filter((a) => a.completedAt).map((a) => (a.completedAt!.getTime() - a.assignedAt.getTime()) / DAY))
  const last = assignments[0] ?? null

  const interactions = new Map<string, number>()
  for (const a of assignments) for (const p of a.progress) {
    const count = (p.viewedAt ? 1 : 0) + (p.completedAt ? 1 : 0)
    interactions.set(p.stepId, (interactions.get(p.stepId) ?? 0) + count)
  }
  const byType = STEP_TYPES.map((t) => ({
    type: t.value,
    label: t.label,
    count: steps.filter((s) => s.type === t.value).reduce((x, s) => x + (interactions.get(s.id) ?? 0), 0),
  })).filter((t) => t.count > 0)
  const totalInteractions = byType.reduce((x, t) => x + t.count, 0)
  const topSteps = [...steps].sort((a, b) => (interactions.get(b.id) ?? 0) - (interactions.get(a.id) ?? 0)).slice(0, 5)

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-xl px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 divide-x divide-slate-100">
        <Figure label="Total number of recipients" value={String(n)} />
        <Figure label="Total journey completion rate" value={n ? `${Math.round((completed / n) * 100)}%` : '—'} />
        <Figure label="Last distribution date" value={last ? last.assignedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
        <Figure label="Last distribution method" value={last ? ASSIGN_METHOD_LABEL[last.method] ?? last.method : '—'} />
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-slate-900">Journey status overview</h2>
        <div className="grid gap-6 md:grid-cols-[260px_1fr] items-center mt-4">
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            <div className="p-4"><p className="text-sm text-slate-600">Average days to start journey</p><p className="text-xl font-semibold text-slate-900">{daysToStart == null ? '—' : `${daysToStart.toFixed(1)} days`}</p></div>
            <div className="p-4"><p className="text-sm text-slate-600">Average days to complete journey</p><p className="text-xl font-semibold text-slate-900">{daysToFinish == null ? '—' : `${daysToFinish.toFixed(1)} days`}</p></div>
          </div>
          <Donut
            total={n}
            centre="Total distributed journeys"
            parts={[
              { label: 'Completed', value: completed, color: '#34d399' },
              { label: 'Started', value: started, color: '#3b82f6' },
              { label: 'Not started', value: notStarted, color: '#eab308' },
            ]}
          />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-slate-900">Step type usage overview</h2>
        <div className="grid gap-6 md:grid-cols-[1fr_1fr] items-center mt-4">
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="px-3 py-2 font-semibold">Top 5 steps</th>
                  <th className="px-3 py-2 font-semibold">Step type</th>
                  <th className="px-3 py-2 font-semibold">Required</th>
                  <th className="px-3 py-2 font-semibold text-right">Interactions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topSteps.map((s, i) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">{i + 1}. {s.title}</td>
                    <td className="px-3 py-2">{stepTypeOf(s.type).label}</td>
                    <td className="px-3 py-2">{s.required ? '✓' : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{interactions.get(s.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Donut total={totalInteractions} centre="Total step interactions"
            parts={byType.map((t) => ({ label: t.label, value: t.count, color: TYPE_COLORS[t.type] }))} />
        </div>
        <p className="text-[11px] text-slate-400 mt-3">An interaction is a person opening a step, or completing it.</p>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2 font-semibold">Recipient</th>
              <th className="px-4 py-2 font-semibold">How</th>
              <th className="px-4 py-2 font-semibold">Assigned</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assignments.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Not distributed yet.</td></tr>
            ) : assignments.map((a, i) => (
              <tr key={i}>
                <td className="px-4 py-2 text-slate-900">{a.employee.fullName}</td>
                <td className="px-4 py-2 text-slate-600">{ASSIGN_METHOD_LABEL[a.method] ?? a.method}</td>
                <td className="px-4 py-2 text-slate-600">{a.assignedAt.toLocaleDateString('en-GB')}</td>
                <td className="px-4 py-2">{a.completedAt ? 'Completed' : a.startedAt ? `Started · ${a.progress.filter((p) => p.completedAt).length} steps done` : 'Not started'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="pl-4 first:pl-0">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="text-3xl font-semibold text-slate-900 mt-1">{value}</p>
    </div>
  )
}

function Donut({ total, centre, parts }: { total: number; centre: string; parts: { label: string; value: number; color: string }[] }) {
  const R = 70
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="flex items-center gap-6 flex-wrap justify-center">
      <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label={`${total} ${centre}: ${parts.map((p) => `${p.value} ${p.label}`).join(', ')}`}>
        <g transform="rotate(-90 100 100)">
          <circle cx="100" cy="100" r={R} fill="none" stroke="#e2e8f0" strokeWidth="26" />
          {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
            const len = (p.value / total) * C
            const el = (
              <circle key={p.label} cx="100" cy="100" r={R} fill="none" stroke={p.color} strokeWidth="26"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}>
                <title>{`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}</title>
              </circle>
            )
            offset += len
            return el
          })}
        </g>
        <text x="100" y="96" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 34, fontWeight: 600 }}>{total}</text>
        <text x="100" y="120" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>{centre}</text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: p.color }} />
            {p.label} <span className="text-slate-500 tabular-nums">· {p.value}{total ? ` · ${Math.round((p.value / total) * 100)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
