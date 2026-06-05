import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { renderMarkdown } from '@/lib/markdown'
import { ArrowLeft, MapPin, Briefcase } from 'lucide-react'
import { ApplyForm } from '@/components/careers/apply-form'

/**
 * Public /careers/[id] page — no auth.
 *   Renders the markdown JD + an inline application form.
 *   404s for anything not POSTED + OPEN.
 */
export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME:  'Full-Time',
  PART_TIME:  'Part-Time',
  INTERNSHIP: 'Internship',
  TRAINEE:    'Trainee',
  CONTRACT:   'Contract',
}

export default async function CareersDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = await prisma.jobRequisition.findUnique({ where: { id } })

  if (!job || job.jdStatus !== 'POSTED' || job.status !== 'OPEN' || !job.jdContent) {
    notFound()
  }

  const dept = job.departmentId
    ? await prisma.department.findUnique({ where: { id: job.departmentId }, select: { name: true } })
    : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
          <Link href="/careers" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> All Open Roles
          </Link>
          <Link href="/careers" className="text-xs font-semibold text-blue-600 uppercase tracking-[0.18em]">
            Careers · Convertt
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Sticky bar with quick facts */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mb-6">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100">
            <Briefcase className="w-3 h-3" /> {TYPE_LABEL[job.type] ?? job.type}
          </span>
          {dept && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100">{dept.name}</span>
          )}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100">
            <MapPin className="w-3 h-3" /> Lahore (On-Site)
          </span>
          {job.vacancies > 1 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
              {job.vacancies} openings
            </span>
          )}
        </div>

        {/* JD body */}
        <article
          className="prose prose-slate max-w-none prose-headings:tracking-tight prose-h1:text-3xl prose-h1:sm:text-4xl prose-h2:mt-8 prose-h2:text-xl prose-li:my-1 prose-p:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(job.jdContent) }}
        />

        {/* Apply form */}
        <section id="apply" className="mt-12 border-t border-slate-200 pt-10">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Apply for this role</h2>
          <p className="text-sm text-slate-600 mt-1">
            Tell us about yourself. Shortlisted candidates hear back within 7 working days.
          </p>
          <div className="mt-5">
            <ApplyForm requisitionId={job.id} jobTitle={job.title} />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Convertt</span>
          <a href="mailto:hr@convertt.co" className="hover:text-slate-700">hr@convertt.co</a>
        </div>
      </footer>
    </div>
  )
}
