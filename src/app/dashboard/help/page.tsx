/**
 * Help Center — for everyone.
 *
 * Workday's Help Center: Find Answers by category (with how many in each),
 * the reader's recent cases beside it, and "Still need help? Create a case"
 * along the bottom. Articles, the policies the reader's role can see, and the
 * in-app guides are listed together. A search box finds across all of them.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { knowledgeFor, searchKnowledge } from '@/lib/help-center-server'
import { ARTICLE_CATEGORIES, caseLabel, caseStatusLabel, caseTypeOf } from '@/lib/help-center'
import { HelpHero } from '@/components/help/help-hero'
import { BookOpen, FileText, Newspaper } from 'lucide-react'

const PER_PAGE = 5
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default async function HelpCenterPage(
  { searchParams }: { searchParams: Promise<{ cat?: string; q?: string; all?: string }> },
) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const sp = await searchParams
  const q = sp.q?.trim() ?? ''

  const [entries, recent] = await Promise.all([
    knowledgeFor(viewer.effectiveRole),
    prisma.helpDeskTicket.findMany({
      where: { OR: [{ employeeId: viewer.employeeId ?? '__none__' }, { createdById: viewer.userId }] },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, caseNumber: true, subject: true, description: true, status: true, category: true, createdAt: true },
    }),
  ])

  const cats = ARTICLE_CATEGORIES
    .map((c) => ({ ...c, count: entries.filter((e) => e.category === c.key).length }))
    .filter((c) => c.count > 0)
  const cat = cats.some((c) => c.key === sp.cat) ? sp.cat! : (cats.find((c) => c.key === 'HUMAN_RESOURCES') ?? cats[0])?.key
  const list = q ? searchKnowledge(entries, q) : entries.filter((e) => e.category === cat)
  const shown = sp.all ? list : list.slice(0, PER_PAGE)
  const isHR = viewer.actualRole === 'HR_ADMIN' && !viewer.isPreviewMode
  const canSeeDashboard = viewer.effectiveRole === 'HR_ADMIN' || viewer.effectiveRole === 'EXECUTIVE'

  return (
    <div className="pb-28">
      <HelpHero />

      <div className="max-w-6xl mx-auto mt-6 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Help Center</h1>
            <p className="text-sm text-slate-500 mt-1">Find an answer, or create a case and a specialist will pick it up.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canSeeDashboard && (
              <Link href="/dashboard/help/case-management" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
                Case Management
              </Link>
            )}
            {isHR && (
              <Link href="/dashboard/help/manage" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
                Manage articles
              </Link>
            )}
          </div>
        </div>

        <form method="get" action="/dashboard/help" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search answers — e.g. sick leave, payslip, laptop"
            className="flex-1 border border-slate-300 rounded-full px-5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600" />
          <button type="submit" className="text-sm font-semibold px-5 py-2.5 rounded-full bg-slate-900 text-white">Search</button>
          {q && <Link href="/dashboard/help" className="text-sm px-4 py-2.5 rounded-full border border-slate-300 bg-white">Clear</Link>}
        </form>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">{q ? `Answers for “${q}”` : 'Find answers'}</h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid md:grid-cols-[210px_1fr]">
              <nav className="border-b md:border-b-0 md:border-r border-slate-100 py-3" aria-label="Help categories">
                {cats.map((c) => {
                  const active = !q && c.key === cat
                  return (
                    <Link key={c.key} href={`/dashboard/help?cat=${c.key}`} aria-current={active ? 'page' : undefined}
                      className={`block px-5 py-2 text-sm border-l-4 ${active ? 'border-blue-700 font-semibold text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                      {c.label} ({c.count})
                    </Link>
                  )
                })}
              </nav>

              <div>
                {shown.length === 0 ? (
                  <p className="px-5 py-10 text-sm text-slate-500 text-center">
                    {q ? 'Nothing matches that. Try other words, or create a case.' : 'Nothing here yet.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {shown.map((e) => {
                      const Icon = e.kind === 'POLICY' ? FileText : e.kind === 'GUIDE' ? BookOpen : Newspaper
                      return (
                        <li key={`${e.kind}:${e.id}`} className="px-5 py-4 flex gap-4 items-start">
                          <div className="min-w-0 flex-1">
                            <Link href={e.href} className="text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">
                              {e.title}
                            </Link>
                            <p className="text-sm text-slate-600 mt-1 line-clamp-2">{e.summary}</p>
                            {q && <p className="text-[11px] text-slate-400 mt-1">{e.categoryLabel}</p>}
                          </div>
                          <div className="w-14 h-14 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                            <Icon className="w-6 h-6" />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {list.length > shown.length && (
                  <div className="border-t border-slate-100 py-3 text-center">
                    <Link href={`/dashboard/help?${q ? `q=${encodeURIComponent(q)}` : `cat=${cat}`}&all=1`}
                      className="text-sm font-semibold text-blue-700 underline underline-offset-2">
                      View more ({list.length - shown.length})
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Recent cases</h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {recent.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-500 text-center">You have not opened a case yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recent.map((c) => (
                    <li key={c.id}>
                      <details className="group px-5 py-3">
                        <summary className="flex items-start justify-between gap-3 cursor-pointer list-none">
                          <span>
                            <span className="flex items-center gap-2">
                              <Link href={`/dashboard/help/cases/${c.id}`} className="text-sm font-semibold text-blue-700 underline underline-offset-2">
                                {caseLabel(c.caseNumber, c.id)}
                              </Link>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.status === 'OPEN' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-slate-100 text-slate-700'}`}>
                                {caseStatusLabel(c.status).toUpperCase()}
                              </span>
                            </span>
                            <span className="block text-xs text-slate-500 mt-0.5">{day(c.createdAt)}</span>
                          </span>
                          <span className="text-xs text-slate-500 underline group-open:hidden">Show details</span>
                          <span className="text-xs text-slate-500 underline hidden group-open:inline">Hide details</span>
                        </summary>
                        <p className="text-sm font-medium text-slate-900 mt-2">{c.subject}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{caseTypeOf(c.category).label}</p>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-3">{c.description}</p>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-slate-100 py-3 text-center">
                <Link href="/dashboard/help/cases" className="text-sm font-semibold text-blue-700 underline underline-offset-2">View my cases</Link>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Still need help — along the bottom of the page, as Workday pins it. */}
      <div className="fixed bottom-0 inset-x-0 lg:left-64 z-30 bg-white/95 backdrop-blur border-t border-slate-200 print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-6 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Still need help?</p>
            <p className="text-base font-semibold text-slate-900">Create a case to get support from a specialist.</p>
          </div>
          <Link href="/dashboard/help/cases/new" className="text-sm font-semibold px-6 py-2.5 rounded-full bg-blue-700 text-white hover:bg-blue-800">
            Create case
          </Link>
        </div>
      </div>
    </div>
  )
}
