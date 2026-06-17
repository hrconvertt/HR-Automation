import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Briefcase, MapPin, ArrowRight } from 'lucide-react'

/**
 * /careers/embed — iframe-friendly version of the careers index.
 *
 *   Paste into convertt.co (Webflow, WordPress, Framer, anywhere):
 *     <iframe
 *       src="https://hr.convertt.co/careers/embed"
 *       width="100%" height="600" frameBorder="0"
 *       style="border:0;border-radius:12px;"
 *     ></iframe>
 *
 *   No hero, no footer, no app chrome — just the jobs list. The host
 *   page's heading/typography takes over the framing.
 */
export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME:  'Full-Time',
  PART_TIME:  'Part-Time',
  INTERNSHIP: 'Internship',
  TRAINEE:    'Trainee',
  CONTRACT:   'Contract',
}

export default async function CareersEmbedPage() {
  const jobs = await prisma.jobRequisition.findMany({
    where: { jdStatus: 'POSTED', status: 'OPEN' },
    select: { id: true, title: true, type: true, vacancies: true, jdApprovedAt: true, departmentId: true },
    orderBy: { jdApprovedAt: 'desc' },
  })
  const deptIds = Array.from(new Set(jobs.map((j) => j.departmentId).filter(Boolean) as string[]))
  const depts = deptIds.length
    ? await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
    : []
  const deptName = new Map(depts.map((d) => [d.id, d.name]))

  return (
    <div className="bg-transparent p-4 sm:p-6">
      {jobs.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Briefcase className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm">No open roles right now.</p>
          <p className="text-xs text-slate-400 mt-1">
            Send a CV to{' '}
            <a href="mailto:hr@convertt.co" className="text-slate-700 hover:underline">hr@convertt.co</a>.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {jobs.map((j) => (
            <li key={j.id}>
              {/* `target=_top` so clicking the link replaces the parent page,
                  not the iframe (otherwise the apply form opens inside the box). */}
              <Link
                href={`/careers/${j.id}`}
                target="_top"
                className="group flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-slate-200 hover:shadow-sm transition-all"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-slate-700">{j.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="w-3 h-3" /> {TYPE_LABEL[j.type] ?? j.type}
                    </span>
                    {j.departmentId && deptName.get(j.departmentId) && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>{deptName.get(j.departmentId)}</span>
                      </>
                    )}
                    <span className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Lahore
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
