/** My Journeys — every journey set up for the viewer, in progress first. */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { buildProgress } from '@/lib/experience-server'
import { StepArt } from '@/components/experience/step-art'

export default async function MyJourneysPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!viewer.employeeId) {
    return <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">
      Your login is not linked to an employee record, so no journeys can be set up for it.
    </p>
  }

  const assignments = await prisma.experienceAssignment.findMany({
    where: { employeeId: viewer.employeeId, journey: { status: 'PUBLISHED' } },
    orderBy: { assignedAt: 'desc' },
    select: {
      id: true, assignedAt: true, completedAt: true,
      progress: { select: { stepId: true, completedAt: true } },
      journey: {
        select: {
          title: true, description: true, bannerTone: true,
          modules: {
            select: {
              id: true, title: true, description: true, seq: true,
              steps: { select: { id: true, title: true, body: true, type: true, url: true, programId: true, required: true, minutes: true, dueDays: true, seq: true } },
            },
          },
        },
      },
    },
  })
  const rows = assignments
    .map((a) => ({ a, p: buildProgress(a.journey, a, viewer.employeeId!) }))
    .sort((x, y) => Number(!!x.a.completedAt) - Number(!!y.a.completedAt))

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Journeys</h1>
        <p className="text-sm text-slate-500 mt-0.5">Guided steps set up for you — take them one at a time, at your own pace.</p>
      </div>
      {rows.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-500">
          No journeys yet. When HR sets one up for you — onboarding, a new role — it appears here.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ a, p }) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
              <div className="h-28"><StepArt type={p.next?.type ?? 'TASK'} tone={a.journey.bannerTone} /></div>
              <div className="p-5 flex flex-col flex-1">
                <h2 className="text-lg font-semibold text-slate-900">{a.journey.title}</h2>
                {a.journey.description && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{a.journey.description}</p>}
                <div className="mt-4 h-1.5 rounded bg-slate-200 overflow-hidden">
                  <div className="h-full bg-blue-600" style={{ width: `${p.pct}%` }} />
                </div>
                <p className="text-xs text-slate-600 mt-1.5">
                  {a.completedAt ? 'Completed' : `${p.remaining} required ${p.remaining === 1 ? 'step' : 'steps'} remaining`}
                  {!a.completedAt && p.next ? ` · next: ${p.next.title}` : ''}
                </p>
                <Link href={`/dashboard/my-journeys/${a.id}`}
                  className="mt-auto pt-4 text-sm font-semibold text-blue-700 underline underline-offset-2">
                  {a.completedAt ? 'Open journey' : p.requiredDone > 0 ? 'Continue journey' : 'Start journey'}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
