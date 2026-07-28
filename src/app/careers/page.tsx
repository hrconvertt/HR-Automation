import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { ArrowRight, MapPin, Briefcase } from 'lucide-react'

/**
 * Public /careers page — no auth.
 *   Lists POSTED requisitions with a link to each detail page.
 *   Same brand voice as the JD itself.
 */
export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME:  'Full-Time',
  PART_TIME:  'Part-Time',
  INTERNSHIP: 'Internship',
  TRAINEE:    'Trainee',
  CONTRACT:   'Contract',
}

export default async function CareersPage() {
  const jobs = await prisma.jobRequisition.findMany({
    where: { jdStatus: 'POSTED', status: 'OPEN' },
    select: {
      id: true, title: true, type: true, vacancies: true,
      jdApprovedAt: true, departmentId: true,
    },
    orderBy: { jdApprovedAt: 'desc' },
  })
  const deptIds = Array.from(new Set(jobs.map((j) => j.departmentId).filter(Boolean) as string[]))
  const depts = deptIds.length
    ? await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
    : []
  const deptName = new Map(depts.map((d) => [d.id, d.name]))

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-white">
      {/* Hero */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-[0.18em] mb-3">Careers at Convertt</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight tracking-tight">
            Build things that <span className="text-slate-700">sell</span>.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 mt-4 max-w-2xl leading-relaxed">
            We're a CRO and eCommerce design agency that's driven <strong>over $1 billion in client revenue</strong> across
            310+ projects. We hire designers, developers, and strategists who care about real outcomes, not just deliverables.
          </p>
        </div>
      </header>

      {/* Roles */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">Open Roles</h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {jobs.length} {jobs.length === 1 ? 'role' : 'roles'}
          </span>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No open roles right now.</p>
            <p className="text-xs text-slate-400 mt-1">
              Check back soon, or send us a CV at{' '}
              <a href="mailto:hr@convertt.co" className="text-slate-700 hover:underline">hr@convertt.co</a>.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/careers/${j.id}`}
                  className="group flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-5 py-4 hover:border-slate-200 hover:shadow-md transition-all"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 group-hover:text-slate-700">{j.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
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
                        <MapPin className="w-3 h-3" /> Lahore (On-Site)
                      </span>
                      {j.vacancies > 1 && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-700 font-medium">{j.vacancies} openings</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Convertt</span>
          <a href="mailto:hr@convertt.co" className="hover:text-slate-700">hr@convertt.co</a>
        </div>
      </footer>
    </div>
  )
}
