/** One journey, being taken. ?step= opens a step, ?module= a module overview. */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { buildProgress } from '@/lib/experience-server'
import { JourneyPlayer, type PlayerView } from '@/components/experience/journey-player'

export default async function TakeJourneyPage({ params, searchParams }: {
  params: Promise<{ assignmentId: string }>
  searchParams: Promise<{ step?: string; module?: string }>
}) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const { assignmentId } = await params
  const sp = await searchParams

  const a = await prisma.experienceAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true, employeeId: true, assignedAt: true, completedAt: true,
      progress: { select: { stepId: true, completedAt: true } },
      journey: {
        select: {
          title: true, bannerTone: true, status: true,
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
  if (!a || a.employeeId !== viewer.employeeId || a.journey.status !== 'PUBLISHED') notFound()

  const p = buildProgress(a.journey, a, a.employeeId)
  const base = `/dashboard/my-journeys/${a.id}`
  let view: PlayerView
  const step = sp.step ? p.steps.find((s) => s.id === sp.step) : undefined
  const mod = sp.module ? p.modules.find((m) => m.id === sp.module) : undefined
  if (step) view = { kind: 'step', step }
  else if (mod) view = { kind: 'module', module: mod }
  else if (p.next) {
    // An unfinished optional-only module opens as its overview, like "First Week".
    const nextModule = p.modules.find((m) => m.id === p.next!.moduleId)!
    view = p.remaining === 0 && nextModule.steps.every((s) => !s.required)
      ? { kind: 'module', module: nextModule }
      : { kind: 'step', step: p.next }
  } else view = { kind: 'done' }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Link href="/dashboard/my-journeys" className="text-sm text-slate-600 underline underline-offset-2">← My Journeys</Link>
      <JourneyPlayer
        title={a.journey.title}
        tone={a.journey.bannerTone}
        modules={p.modules}
        view={view}
        remaining={p.remaining}
        pct={p.pct}
        hrefFor={(id) => `${base}?step=${id}`}
        moduleHref={(id) => `${base}?module=${id}`}
        assignmentId={a.id}
        programHref={(id) => `/dashboard/learning/programs/${id}`}
        now={new Date()}
      />
    </div>
  )
}
