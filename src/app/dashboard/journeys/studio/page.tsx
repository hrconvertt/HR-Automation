/**
 * Journeys studio — HR builds guided journeys and hands them out.
 * Every journey with its status, how many people have it, and how many
 * have finished.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { isJourneyAdmin } from '@/lib/experience-server'
import { AUTO_ASSIGN } from '@/lib/experience'
import { NewJourneyButtons } from './_components/new-journey-buttons'

export default async function JourneysStudioPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!isJourneyAdmin(viewer)) redirect('/dashboard/my-journeys')

  const journeys = await prisma.experienceJourney.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, title: true, status: true, autoAssign: true, updatedAt: true,
      _count: { select: { modules: true } },
      assignments: { select: { completedAt: true, startedAt: true } },
    },
  })

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Journeys</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Guided, step-by-step experiences — onboarding, a first management role, anything people should walk through in order.
            Build one, publish it, then distribute it or let it assign itself.
          </p>
        </div>
        <Link href="/dashboard/journeys" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
          Onboarding &amp; offboarding tasks
        </Link>
      </div>

      <NewJourneyButtons />

      {journeys.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-500">
          No journeys yet. Start from a template — the steps point at real pages in Convertt HR, and every word can be edited.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold">Journey</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Assigned</th>
                <th className="px-4 py-2 font-semibold text-right">Recipients</th>
                <th className="px-4 py-2 font-semibold text-right">Completion</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {journeys.map((j) => {
                const n = j.assignments.length
                const done = j.assignments.filter((a) => a.completedAt).length
                return (
                  <tr key={j.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/journeys/studio/${j.id}?tab=editor`} className="font-medium text-blue-700 underline underline-offset-2">{j.title}</Link>
                      <span className="block text-[11px] text-slate-400">{j._count.modules} {j._count.modules === 1 ? 'module' : 'modules'} · edited {j.updatedAt.toLocaleDateString('en-GB')}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {j.status === 'PUBLISHED'
                        ? <span className="text-xs text-emerald-800">Published</span>
                        : <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Draft</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{AUTO_ASSIGN.find((a) => a.value === (j.autoAssign ?? ''))?.label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{n}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{n ? `${Math.round((done / n) * 100)}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Link href={`/dashboard/journeys/studio/${j.id}?tab=metrics`} className="text-sm text-slate-900 underline underline-offset-2 mr-4">Metrics</Link>
                      <Link href={`/dashboard/journeys/studio/${j.id}?tab=editor`} className="text-sm font-medium text-slate-900 underline underline-offset-2">Edit journey</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
