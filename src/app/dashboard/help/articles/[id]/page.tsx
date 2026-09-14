/**
 * A Help Center article — Workday's reader: the category over the title,
 * when it was last updated, the body, then tags, related articles, "Was this
 * article helpful?" and Create Case.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { renderMarkdown } from '@/lib/markdown'
import { knowledgeFor, relatedTo } from '@/lib/help-center-server'
import { articleCategoryLabel, CASE_TYPES } from '@/lib/help-center'
import { ArticleFooter } from '@/components/help/article-footer'
import { CalendarDays } from 'lucide-react'

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const { id } = await params
  const article = await prisma.helpArticle.findUnique({ where: { id } })
  if (!article) notFound()
  const isHR = viewer.effectiveRole === 'HR_ADMIN'
  if (article.status !== 'PUBLISHED' && !isHR) notFound()
  if (!isHR && article.audienceRoles.length > 0 && !article.audienceRoles.includes(viewer.effectiveRole)) notFound()

  const [entries, vote] = await Promise.all([
    knowledgeFor(viewer.effectiveRole),
    viewer.employeeId
      ? prisma.articleFeedback.findUnique({
          where: { refType_refId_employeeId: { refType: 'ARTICLE', refId: id, employeeId: viewer.employeeId } },
          select: { helpful: true },
        })
      : null,
  ])
  const caseType = CASE_TYPES.find((t) => t.category === article.category)?.value ?? 'GENERAL'

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/dashboard/help?cat=${article.category}`} className="text-sm text-slate-600 underline underline-offset-2">← Help Center</Link>
        {viewer.actualRole === 'HR_ADMIN' && !viewer.isPreviewMode && (
          <Link href={`/dashboard/help/manage/${article.id}`} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
            Edit article
          </Link>
        )}
      </div>
      <article className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-10">
        {article.status !== 'PUBLISHED' && (
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block mb-3">
            Draft — only HR can see this
          </p>
        )}
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{articleCategoryLabel(article.category)}</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-1 leading-tight">{article.title}</h1>
        <p className="text-sm text-slate-500 mt-3 flex items-center gap-2 border-b border-slate-100 pb-5">
          <CalendarDays className="w-4 h-4" />
          Last updated {article.updatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <div
          className="prose prose-slate max-w-none mt-6 prose-headings:font-semibold prose-p:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
        />
        <ArticleFooter
          tags={article.tags}
          related={relatedTo(entries, { kind: 'ARTICLE', id: article.id, category: article.category, tags: article.tags })}
          refType="ARTICLE"
          refId={article.id}
          myVote={vote?.helpful ?? null}
          caseType={caseType}
          caseTitle={article.title}
        />
      </article>
    </div>
  )
}
