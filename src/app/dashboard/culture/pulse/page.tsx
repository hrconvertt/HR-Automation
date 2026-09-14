/**
 * Culture → Employee Voice.
 *
 * Peakon's four areas on Convertt's pulse: Insight (the engagement overview),
 * Analysis (drivers, heat map, question scores, comments), Improve (the action
 * plan) and Administration (rounds and questions). Everyone answers here.
 *
 *   HR and executives read company results; HR also administers.
 *   A manager reads their own team's results once enough of it has answered.
 *   An action's owner sees Improve.
 *
 * Every result respects the response floor, per group, in voice-server.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { voiceAnalysis, voiceHeatmap, voiceQuestions } from '@/lib/voice-server'
import { VOICE_TABS, MIN_RESPONSES } from '@/lib/voice'
import { CultureHeader } from '../_components/culture-header'
import { VoiceAnswer } from './_components/voice-answer'
import { VoiceInsight } from './_components/voice-insight'
import { VoiceAnalysisView } from './_components/voice-analysis'
import { VoiceImprove } from './_components/voice-improve'
import { VoiceAdmin } from './_components/voice-admin'

type SP = { tab?: string; round?: string; score?: string; view?: string; q?: string; admin?: string }

export default async function EmployeeVoicePage({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const sp = await searchParams
  const role = viewer.effectiveRole
  const reader = role === 'HR_ADMIN' || role === 'EXECUTIVE'
  const hrAdmin = role === 'HR_ADMIN'
  const hrEdit = viewer.actualRole === 'HR_ADMIN' && !viewer.isPreviewMode
  const live = { status: 'ACTIVE', deletedAt: null }

  // A manager's scope is their direct reports, and only once there are
  // enough of them that an answer cannot be traced.
  let teamIds: string[] | null = null
  if (!reader && role === 'MANAGER' && viewer.employeeId) {
    teamIds = (await prisma.employee.findMany({ where: { ...live, reportingManagerId: viewer.employeeId }, select: { id: true } })).map((e) => e.id)
  }
  const teamReadable = !!teamIds && teamIds.length >= MIN_RESPONSES
  const ownsActions = viewer.employeeId ? (await prisma.pulseAction.count({ where: { ownerId: viewer.employeeId } })) > 0 : false

  const tabs = VOICE_TABS.filter((t) =>
    t.key === 'insight' || t.key === 'analysis' ? reader || teamReadable
      : t.key === 'improve' ? reader || ownsActions
        : hrAdmin)
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0]?.key ?? null

  const now = new Date()
  const [openRound, questions] = await Promise.all([
    prisma.pulseRound.findFirst({
      where: { status: 'OPEN', opensAt: { lte: now }, closesAt: { gte: now } },
      orderBy: { opensAt: 'desc' },
      select: { id: true, title: true, closesAt: true },
    }),
    voiceQuestions(),
  ])
  const answered = openRound && viewer.employeeId
    ? (await prisma.pulseResponse.count({ where: { roundId: openRound.id, employeeId: viewer.employeeId } })) > 0
    : false

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged: Record<string, string | undefined> = { tab: tab ?? undefined, round: sp.round, score: sp.score, ...extra }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    return `/dashboard/culture/pulse?${p}`
  }

  const needsAnalysis = tab === 'insight' || tab === 'analysis' || tab === 'improve'
  const a = needsAnalysis ? await voiceAnalysis({ roundId: sp.round, employeeIds: reader ? null : teamIds }) : null
  const scopeLabel = reader ? 'the whole company' : 'your team'

  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Employee Voice — how people feel about working here, asked anonymously." />

      {openRound && viewer.employeeId && !viewer.isPreviewMode && (answered ? (
        <p className="bg-white border border-slate-200 rounded-xl px-5 py-3 text-sm text-slate-700">
          You have answered <strong className="text-slate-900">{openRound.title}</strong>. Thank you.
        </p>
      ) : (
        <VoiceAnswer
          round={{ id: openRound.id, title: openRound.title, closesAt: openRound.closesAt.toISOString() }}
          questions={questions.filter((q) => q.enabled).map((q) => ({ key: q.key, driverKey: q.driverKey, text: q.text, scale: q.scale }))}
        />
      ))}
      {!openRound && tabs.length === 0 && (
        <p className="bg-white border border-slate-200 rounded-xl px-5 py-8 text-center text-sm text-slate-500">No survey is open right now.</p>
      )}

      {tabs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-5 pt-3 flex items-end justify-between gap-3 flex-wrap">
          <nav className="flex gap-1" aria-label="Employee Voice">
            {tabs.map((t) => (
              <Link key={t.key} href={qs({ tab: t.key, view: undefined, admin: undefined, q: undefined })} aria-current={tab === t.key ? 'page' : undefined}
                className={`px-4 py-2.5 text-sm border-b-2 ${tab === t.key ? 'border-blue-700 font-semibold text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
                {t.label}
              </Link>
            ))}
          </nav>
          {a && a.rounds.length > 0 && (
            <div className="flex items-center gap-2 pb-2 flex-wrap">
              <form method="get" className="flex items-center gap-2">
                <input type="hidden" name="tab" value={tab ?? ''} />
                {sp.score && <input type="hidden" name="score" value={sp.score} />}
                <select name="round" defaultValue={a.round?.id} className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                  {a.rounds.map((r) => <option key={r.id} value={r.id}>{r.title} · {r._count.responses} answered</option>)}
                </select>
                <button type="submit" className="text-xs px-3 py-1.5 rounded-lg border border-slate-300">Show round</button>
              </form>
              {tab === 'insight' && (
                <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                  <Link href={qs({ score: 'nps' })} className={`text-xs px-3 py-1.5 ${sp.score === 'nps' ? 'bg-blue-50 font-semibold text-blue-800' : 'bg-white text-slate-700'}`}>NPS</Link>
                  <Link href={qs({ score: undefined })} className={`text-xs px-3 py-1.5 border-l border-slate-300 ${sp.score !== 'nps' ? 'bg-blue-50 font-semibold text-blue-800' : 'bg-white text-slate-700'}`}>Average</Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!reader && teamIds && !teamReadable && (tab === null) && (
        <p className="text-xs text-slate-500">Team results appear here once you have at least {MIN_RESPONSES} direct reports, so no answer can be traced to a person.</p>
      )}

      {tab === 'insight' && a && (
        <>
          <h2 className="text-2xl font-semibold text-slate-900">Engagement overview <span className="text-base font-normal text-slate-500">· {scopeLabel}</span></h2>
          <VoiceInsight a={a} mode={sp.score === 'nps' ? 'NPS' : 'AVERAGE'} scopeLabel={scopeLabel}
            analysisHref={(key) => `${qs({ tab: 'analysis', view: 'drivers' })}${key ? `#driver-${key}` : ''}`} />
        </>
      )}

      {tab === 'analysis' && a && (
        <VoiceAnalysisView
          a={a}
          view={(['drivers', 'heatmap', 'questions', 'comments'] as const).find((v) => v === sp.view) ?? 'drivers'}
          heat={reader && a.round ? await voiceHeatmap(a.round.id) : null}
          q={sp.q ?? ''}
          hrefFor={(params) => qs({ tab: 'analysis', ...params })}
        />
      )}

      {tab === 'improve' && (await ImproveTab({ reader, hrEdit, employeeId: viewer.employeeId, a }))}

      {tab === 'admin' && hrAdmin && (
        hrEdit ? (
          <VoiceAdmin
            view={sp.admin === 'questions' ? 'questions' : 'schedules'}
            hrefFor={(params) => qs({ tab: 'admin', ...params })}
            rounds={(await prisma.pulseRound.findMany({ orderBy: { opensAt: 'desc' }, select: { id: true, title: true, status: true, opensAt: true, closesAt: true, _count: { select: { responses: true } } } }))
              .map((r) => ({ id: r.id, title: r.title, status: r.status, opensAt: r.opensAt.toISOString(), closesAt: r.closesAt.toISOString(), responses: r._count.responses }))}
            questions={questions}
          />
        ) : <p className="text-sm text-slate-500">Switch back to your own HR view to change the survey.</p>
      )}
    </div>
  )
}

async function ImproveTab({ reader, hrEdit, employeeId, a }: {
  reader: boolean; hrEdit: boolean; employeeId: string | null; a: Awaited<ReturnType<typeof voiceAnalysis>> | null
}) {
  const rows = await prisma.pulseAction.findMany({
    where: reader ? {} : { ownerId: employeeId ?? '__none__' },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  })
  const ids = [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x))]
  const [owners, people] = await Promise.all([
    ids.length ? prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : Promise.resolve([]),
    hrEdit ? prisma.employee.findMany({ where: { status: 'ACTIVE', deletedAt: null }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }) : Promise.resolve([]),
  ])
  const nameOf = new Map(owners.map((o) => [o.id, o.fullName]))
  return (
    <VoiceImprove
      actions={rows.map((r) => ({
        id: r.id, driverKey: r.driverKey, title: r.title, detail: r.detail, ownerId: r.ownerId,
        ownerName: r.ownerId ? nameOf.get(r.ownerId) ?? null : null, dueDate: r.dueDate?.toISOString() ?? null,
        status: r.status, note: r.note, completedAt: r.completedAt?.toISOString() ?? null,
      }))}
      canWrite={hrEdit}
      myEmployeeId={employeeId}
      people={people}
      driverScores={Object.fromEntries((a?.current?.drivers ?? []).map((d) => [d.key, d.score]))}
      roundId={a?.round?.id ?? null}
    />
  )
}
