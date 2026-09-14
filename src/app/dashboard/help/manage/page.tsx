/**
 * Help Center → Manage articles. HR only.
 *
 * The articles HR writes, with how many readers found each helpful. Policies
 * and in-app guides show in Find Answers too, but are edited where they live.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { articleCategoryLabel } from '@/lib/help-center'

export default async function ManageArticlesPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (viewer.actualRole !== 'HR_ADMIN' || viewer.isPreviewMode) redirect('/dashboard/help')

  const [articles, feedback, policyCount] = await Promise.all([
    prisma.helpArticle.findMany({ orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] }),
    prisma.articleFeedback.groupBy({ by: ['refType', 'refId', 'helpful'], _count: { _all: true } }),
    prisma.policyDocument.count({ where: { status: { in: ['ACTIVE', 'PUBLISHED'] } } }),
  ])
  const votes = (type: string, id: string) => {
    const rows = feedback.filter((f) => f.refType === type && f.refId === id)
    const yes = rows.find((r) => r.helpful)?._count._all ?? 0
    const no = rows.find((r) => !r.helpful)?._count._all ?? 0
    return { yes, no }
  }
  const unhelpful = feedback.filter((f) => !f.helpful).sort((a, b) => b._count._all - a._count._all).slice(0, 5)

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link href="/dashboard/help" className="text-sm text-slate-600 underline underline-offset-2">← Help Center</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Manage articles</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Articles you write appear in Find Answers beside the {policyCount} active policies and the in-app guides.
          </p>
        </div>
        <Link href="/dashboard/help/manage/new" className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white">New article</Link>
      </div>

      {articles.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-500">
          No articles yet. Start with the questions HR answers most often.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold">Title</th>
                <th className="px-4 py-2 font-semibold">Category</th>
                <th className="px-4 py-2 font-semibold">Updated</th>
                <th className="px-4 py-2 font-semibold text-right">Helpful</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {articles.map((a) => {
                const v = votes('ARTICLE', a.id)
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/help/articles/${a.id}`} className="font-medium text-blue-700 underline underline-offset-2">{a.title}</Link>
                      {a.status !== 'PUBLISHED' && <span className="ml-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5">Draft</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{articleCategoryLabel(a.category)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{a.updatedAt.toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{v.yes} yes · {v.no} no</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/dashboard/help/manage/${a.id}`} className="text-sm font-medium text-slate-900 underline underline-offset-2">Edit article</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {unhelpful.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-900">Marked not helpful</h2>
          <p className="text-xs text-slate-500">Worth rewriting first — across articles, policies and guides.</p>
          <ul className="mt-2 text-sm text-slate-700 space-y-1">
            {unhelpful.map((f) => (
              <li key={`${f.refType}:${f.refId}`}>
                {f.refType.toLowerCase()} · {f.refType === 'ARTICLE' ? articles.find((a) => a.id === f.refId)?.title ?? f.refId : f.refId} — {f._count._all} said no
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
